import {
  getOfficialTamerTalent,
  hasUnlockedOfficialTamerTalent
} from "../rules/tamer-resources.js";

import {
  getTamerTalentImplementation,
  getTamerTalentImplementationLabelKey
} from "../data/tamer-talent-implementation.js";

import {
  useTamerTalent
} from "../rules/tamer-talent-automation.js";

import {
  getVanishTamerActionRestriction
} from "../rules/tamer-talent-special-orders.js";

import {
  getNaturalExplorerFollowerEffect,
  isCalculatedAvailable,
  leadNaturalExplorerAllies,
  markBestLaidPlansSurprise,
  markCalculatedUsed,
  postBusyHandsPlantCard,
  promptCalculatedReplacement
} from "../rules/tamer-talent-runtime.js";

import {
  getNextOrderTargetRestriction,
  useBeTheWinners
} from "../rules/tamer-talent-attack-direct.js";

import {
  revealOverlookedToEnemy
} from "../rules/tamer-talent-combat-survival.js";

import {
  rollDerivedCheck,
  getActorSv
} from "../rules/quality-automation.js";

import {
  rollTamerCheck
} from "../rolls/check-roll.js";

import {
  applyLuckyNumberReward
} from "../rolls/lucky-number.js";

import {
  getCombatantUnitId
} from "./initiative.js";

import {
  getTokenGridDistance,
  isTokenCombatReady
} from "./positioning.js";

import {
  checkActorActionSpend,
  getActorActionState,
  spendActorActions
} from "./action-economy.js";
import { openCompactActionMenu } from "./compact-action-menu.js";
import {
  expireNonStackingTemporaryWounds,
  grantNonStackingTemporaryWounds
} from "./temporary-wounds.js";

const SYSTEM_ID = "digimon-digital-adventures";
const ACTION_USE_PATH = "system.combat.tamerActionUses";
const EFFECT_TAG_DIRECT = "tamerDirect";
const EFFECT_TAG_REINFORCE = "tamerReinforce";
const EFFECT_TAG_HOLD = "tamerHold";
const TAMER_ACTION_FLAG = "tamerAction";

function localize(key, fallback = "") {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : (fallback || key);
}

function formatI18n(key, data = {}, fallback = "") {
  const value = game?.i18n?.format?.(key, data);
  if (value && value !== key) return value;

  return String(fallback || key).replace(/\{(\w+)\}/g, (_match, token) => {
    return data[token] ?? "";
  });
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

async function revealHiddenFromCreatureInteraction(actor, reason = "interaction") {
  if (!actor?.system?.status?.hidden) return false;
  const environment = await import("./environment.js");
  return environment.revealActorFromInteraction(actor, reason);
}

function getActorReferenceKeys(actor) {
  const baseActorId = String(
    actor?.parent?.actorId ??
    actor?.token?.actorId ??
    ""
  ).trim();

  return new Set(
    [
      actor?.uuid,
      actor?.id,
      actor?.parent?.uuid,
      actor?.parent?.id,

      baseActorId,

      baseActorId
        ? `Actor.${baseActorId}`
        : "",

      actor?.id
        ? `Actor.${actor.id}`
        : ""
    ]
      .map((value) => {
        return String(
          value ?? ""
        ).trim();
      })
      .filter(Boolean)
  );
}

export async function resolveLinkedTamerForPartner(
  partner
) {
  if (
    !partner ||
    !["digimon", "npc"].includes(
      partner.type
    )
  ) {
    return null;
  }

  const directUuid = String(
    partner.system?.tamer?.uuid ?? ""
  ).trim();

  if (directUuid) {
    try {
      const document =
        await fromUuid(directUuid);

      if (
        document?.documentName === "Actor" &&
        document.type === "character"
      ) {
        return document;
      }
    } catch (error) {
      console.warn(
        "DDA | Could not resolve linked Tamer.",
        error
      );
    }
  }

  const partnerKeys =
    getActorReferenceKeys(partner);

  return (
    game?.actors?.contents ?? []
  ).find((candidate) => {
    if (candidate.type !== "character") {
      return false;
    }

    const partnerData =
      candidate.system?.partner ?? {};

    return [
      partnerData.currentFormUuid,
      partnerData.uuid
    ].some((reference) => {
      return partnerKeys.has(
        String(reference ?? "").trim()
      );
    });
  }) ?? null;
}

function getDangerSenseUses(tamer) {
  return Math.max(
    0,
    number(
      tamer?.system
        ?.tamerTalentUses
        ?.dangerSense
        ?.value,
      1
    )
  );
}
function getOfficialTamerTalentUseValue(
  tamer,
  talentId,
  maximum = 1
) {
  return Math.max(
    0,
    number(
      tamer?.system
        ?.tamerTalentUses
        ?.[talentId]
        ?.value,
      maximum
    )
  );
}

function wasOfficialTalentUsedThisCombat(
  tamer,
  talentId
) {
  const combat = game?.combat;

  const usage =
    tamer?.system?.combat
      ?.tamerTalentUsage
      ?.[talentId];

  return Boolean(
    combat?.started &&
    usage &&
    String(
      usage.combatId ?? ""
    ) === String(
      combat.id ?? ""
    )
  );
}

async function spendOncePerCombatTalent(
  tamer,
  talentId,
  actionCost
) {
  const combat = game?.combat;

  const cost = Math.max(
    0,
    Math.floor(
      number(
        actionCost,
        0
      )
    )
  );

  if (!combat?.started) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Warning.RequiresCombat",
        "Esta Ordem Especial exige um Combate ativo."
      )
    );

    return null;
  }

  if (
    wasOfficialTalentUsedThisCombat(
      tamer,
      talentId
    )
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Warning.AlreadyUsedThisCombat",
        "Este Talento já foi usado neste Combate."
      )
    );

    return null;
  }

  const usage =
    foundry.utils.deepClone(
      tamer.system?.combat
        ?.tamerTalentUsage ??
      {}
    );

  usage[talentId] = {
    combatId:
      combat.id,

    round:
      number(
        combat.round,
        0
      ),

    turn:
      number(
        combat.turn,
        -1
      ),

    frequency:
      "oncePerCombat",

    usedAt:
      new Date().toISOString()
  };

  return spendActorActions(
    tamer,
    cost,
    {
      additionalUpdates: {
        "system.combat.tamerTalentUsage": usage
      }
    }
  );
}

async function spendOncePerRestTalent(
  tamer,
  talentId,
  actionCost,
  maximum = 1
) {
  const cost = Math.max(
    0,
    Math.floor(
      number(
        actionCost,
        0
      )
    )
  );

  const uses =
    getOfficialTamerTalentUseValue(
      tamer,
      talentId,
      maximum
    );

  if (uses < 1) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Warning.NoUsesRemaining",
        "Este Talento não possui usos restantes."
      )
    );

    return null;
  }

  const payment = await spendActorActions(
    tamer,
    cost,
    {
      additionalUpdates: {
        [`system.tamerTalentUses.${talentId}.value`]: uses - 1,
        [`system.tamerTalentUses.${talentId}.max`]: maximum,
        [`system.tamerTalentUses.${talentId}.recharge`]: "rest"
      }
    }
  );

  return payment
    ? {
        ...payment,
        usesBefore: uses,
        usesAfter: uses - 1
      }
    : null;
}

export async function payPartnerInterruptAction(
  partner,
  {
    reason = "",
    partnerActionCost = 1
  } = {}
) {
  if (
    !partner ||
    !["digimon", "npc"].includes(
      partner.type
    )
  ) {
    return null;
  }

  const requiredPartnerActions = Math.max(
    0,
    Number(partnerActionCost ?? 1) || 0
  );

  /*
   * Fora de Combate não existe economia de
   * Ações de Interrupção para consumir.
   */
  if (!game?.combat?.started) {
    return {
      success: true,
      payer: "none",
      partner,
      tamer: null,
      actionCost: 0
    };
  }

  const tamer =
    await resolveLinkedTamerForPartner(
      partner
    );

  const partnerActions = getActorActionState(partner).value;
  const tamerActions = getActorActionState(tamer).value;

  const dangerSenseAvailable =
    Boolean(
      tamer &&
      (
        game.user?.isGM ||
        tamer.isOwner
      ) &&
      hasUnlockedOfficialTamerTalent(
        tamer,
        "dangerSense"
      ) &&
      getDangerSenseUses(tamer) > 0 &&
      tamerActions >= 1
    );

  const partnerCanPay =
    partnerActions >= requiredPartnerActions;

  if (
    !dangerSenseAvailable &&
    !partnerCanPay
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.DangerSense.NoActions",
        "Nem o parceiro nem o Digi-Escolhido possuem Ações suficientes para esta Interrupção."
      )
    );

    return null;
  }

  let payer = "partner";

  if (dangerSenseAvailable) {
    const DialogV2 = foundry.applications.api.DialogV2;
    payer = await DialogV2.wait({
      classes: ["dda", "dda-danger-sense-dialog"],
      window: {
        title: localize(
          "DDA.TamerTalent.DangerSense.Title",
          "Danger Sense"
        )
      },
      content: `
        <div class="dda-danger-sense-dialog-content">
          ${reason
            ? `<p>${escapeHtml(
                formatI18n(
                  "DDA.TamerTalent.DangerSense.Reason",
                  { reason },
                  `Interrupção: ${reason}.`
                )
              )}</p>`
            : ""}
          <p>${escapeHtml(
            formatI18n(
              "DDA.TamerTalent.DangerSense.Prompt",
              {
                tamer: tamer.name,
                partner: partner.name
              },
              `${tamer.name} pode gastar 1 Ação no lugar de ${partner.name}.`
            )
          )}</p>
          ${requiredPartnerActions > 1
            ? `<p class="muted">${escapeHtml(
                `${partner.name}: ${requiredPartnerActions} Ações · ${tamer.name} (Danger Sense): 1 Ação.`
              )}</p>`
            : ""}
        </div>
      `,
      buttons: [
        {
          action: "dangerSense",
          label: localize(
            "DDA.TamerTalent.DangerSense.Use",
            "Usar Danger Sense"
          ),
          icon: "fa-solid fa-eye",
          default: true,
          callback: () => "tamer"
        },
        ...(partnerCanPay
          ? [{
              action: "partner",
              label: localize(
                "DDA.TamerTalent.DangerSense.PartnerPays",
                "Parceiro paga"
              ),
              icon: "fa-solid fa-bolt",
              callback: () => "partner"
            }]
          : []),
        {
          action: "cancel",
          label: localize(
            "DDA.Button.Cancel",
            "Cancelar"
          ),
          icon: "fa-solid fa-xmark",
          callback: () => ""
        }
      ],
      rejectClose: false,
      close: () => "",
      modal: true
    });

    if (!payer) {
      return null;
    }
  }

  if (payer === "tamer") {
    const currentActions = getActorActionState(tamer).value;
    const currentUses = getDangerSenseUses(tamer);

    if (currentActions < 1 || currentUses < 1) {
      ui.notifications.warn(
        localize(
          "DDA.TamerTalent.DangerSense.PaymentFailed",
          "Danger Sense não está mais disponível."
        )
      );

      return null;
    }

    const payment = await spendActorActions(
      tamer,
      1,
      {
        requireActiveUnit: false,
        notify: false,
        additionalUpdates: {
          "system.tamerTalentUses.dangerSense.value": currentUses - 1,
          "system.tamerTalentUses.dangerSense.max": 1,
          "system.tamerTalentUses.dangerSense.recharge": "rest"
        }
      }
    );

    if (!payment) {
      ui.notifications.warn(
        localize(
          "DDA.TamerTalent.DangerSense.PaymentFailed",
          "Danger Sense não está mais disponível."
        )
      );
      return null;
    }

    return {
      success: true,
      payer: "tamer",
      partner,
      tamer,
      usedDangerSense: true,
      actionCost: 1
    };
  }

  const currentPartnerActions = getActorActionState(partner).value;

  if (currentPartnerActions < requiredPartnerActions) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.DangerSense.PaymentFailed",
        "A Interrupção não pôde ser paga."
      )
    );

    return null;
  }

  const payment = requiredPartnerActions > 0
    ? await spendActorActions(
        partner,
        requiredPartnerActions,
        {
          requireActiveUnit: false,
          notify: false
        }
      )
    : { success: true };

  if (!payment) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.DangerSense.PaymentFailed",
        "A Interrupção não pôde ser paga."
      )
    );
    return null;
  }

  return {
    success: true,
    payer: "partner",
    partner,
    tamer,
    usedDangerSense: false,
    actionCost: requiredPartnerActions
  };
}

function getCombatTurnSignature() {
  const combat = game?.combat;

  if (!combat?.started) {
    return `no-combat:${game?.time?.worldTime ?? Date.now()}`;
  }

  return [
    combat.id,
    number(combat.round, 0),
    number(combat.turn, -1)
  ].join(":");
}

function getStoredActionUse(tamer, actionKey) {
  return tamer?.system?.combat?.tamerActionUses?.[actionKey] ?? null;
}

function wasUsedThisTurn(tamer, actionKey) {
  if (!game?.combat?.started) return false;

  const use = getStoredActionUse(tamer, actionKey);
  if (!use) return false;

  return String(use.turnSignature ?? "") === getCombatTurnSignature();
}

async function markUsedThisTurn(tamer, actionKey, data = {}) {
  await tamer.update({
    [`${ACTION_USE_PATH}.${actionKey}`]: {
      turnSignature: getCombatTurnSignature(),
      combatId: game?.combat?.id ?? "",
      round: number(game?.combat?.round, 0),
      turn: number(game?.combat?.turn, -1),
      usedAt: new Date().toISOString(),
      ...data
    }
  });
}

function getAvailableActions(tamer) {
  return getActorActionState(tamer).value;
}

async function spendActions(tamer, amount, options = {}) {
  return Boolean(
    await spendActorActions(tamer, amount, options)
  );
}

function getAttributeValue(tamer, key) {
  return Math.max(0, number(tamer?.system?.attributes?.[key]?.value, 0));
}

function getHighestAttribute(tamer) {
  const entries = Object.entries(tamer?.system?.attributes ?? {})
    .map(([key, attribute]) => ({
      key,
      value: Math.max(0, number(attribute?.value, 0)),
      label: localize(attribute?.label, key)
    }))
    .sort((left, right) => {
      if (right.value !== left.value) return right.value - left.value;
      return left.label.localeCompare(right.label);
    });

  return entries[0] ?? {
    key: "agility",
    value: 0,
    label: localize("DDA.TamerAttribute.Agility", "Agilidade")
  };
}

async function resolvePartnerActor(tamer) {
  const partnerData =
    tamer?.system?.partner ?? {};

  /*
   * A forma atual tem prioridade.
   * O UUID-base é utilizado como fallback.
   */
  const references = [
    partnerData.uuid,
    partnerData.currentFormUuid
  ]
    .map((value) => {
      return String(value ?? "").trim();
    })
    .filter(Boolean);

  for (const reference of new Set(references)) {
    try {
      const document =
        await fromUuid(reference);

      if (
        document?.documentName !== "Actor" ||
        !["digimon", "npc"].includes(document.type)
      ) {
        continue;
      }

      /*
       * Em tokens não vinculados, o ataque utiliza o
       * Actor sintético do token. O efeito precisa ser
       * colocado nesse mesmo Actor.
       */
      const canvasActor = (
        canvas?.tokens?.placeables ?? []
      ).find((token) => {
        return (
          token.actor?.uuid === document.uuid ||
          token.document?.actorId === document.id
        );
      })?.actor;

      return canvasActor ?? document;
    } catch (error) {
      console.warn(
        "DDA | Could not resolve a Tamer partner reference for an Action.",
        error,
        reference
      );
    }
  }

  return null;
}

function getTargetedDigimonActors() {
  return Array.from(game?.user?.targets ?? [])
    .filter((token) => {
      const disposition = Number(token?.document?.disposition ?? 0);
      return disposition >= 0;
    })
    .map((token) => token?.actor)
    .filter((actor) => actor && ["digimon", "npc"].includes(actor.type));
}

function dedupeActors(actors = []) {
  const unique = new Map();

  for (const actor of actors) {
    if (!actor) continue;
    unique.set(actor.uuid ?? actor.id, actor);
  }

  return Array.from(unique.values());
}

async function chooseDigimonTarget(tamer, { partnerOnly = false } = {}) {
  const partner = await resolvePartnerActor(tamer);

  if (partnerOnly) {
    if (!partner) {
      ui.notifications.warn(
        localize("DDA.Warning.NoPartnerLinked", "Nenhum Digimon parceiro está vinculado.")
      );
    }

    return partner;
  }

  const actors = dedupeActors([
    partner,
    ...getTargetedDigimonActors()
  ]);

  if (!actors.length) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.NoDigimonTarget",
        "Vincule um parceiro ou marque um Digimon como alvo."
      )
    );

    return null;
  }

  if (actors.length === 1) return actors[0];

  const partnerUuid = partner?.uuid ?? "";
  const options = actors.map((actor, index) => {
    const partnerSuffix = actor.uuid === partnerUuid
      ? ` — ${localize("DDA.TamerAction.Partner", "Parceiro")}`
      : "";

    return `<option value="${index}">${escapeHtml(actor.name)}${escapeHtml(partnerSuffix)}</option>`;
  }).join("");

  return await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize("DDA.TamerAction.TargetDialog.Title", "Escolher Digimon")
    },
    content: `
      <div class="dda-roll-dialog dda-tamer-action-target-dialog">
        <div class="form-group">
          <label>${localize("DDA.TamerAction.Target", "Alvo")}</label>
          <select name="targetIndex">${options}</select>
        </div>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm", "Confirmar"),
        default: true,
        callback: (_event, button) => {
          const index = Number(button.form.elements.targetIndex?.value ?? -1);
          return actors[index] ?? null;
        }
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel", "Cancelar"),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });
}

function isPartnerActor(tamer, actor) {
  const partnerData =
    tamer?.system?.partner ?? {};

  const actorKeys =
    getActorReferenceKeys(actor);

  const references = [
    partnerData.uuid,
    partnerData.currentFormUuid
  ]
    .map((value) => {
      return String(value ?? "").trim();
    })
    .filter(Boolean);

  return references.some((reference) => {
    return actorKeys.has(reference);
  });
}

function getActionModeOptions(tamer, baseAttributeKey, { allowCalculated = true } = {}) {
  const highest = getHighestAttribute(tamer);
  const baseValue = getAttributeValue(tamer, baseAttributeKey);
  const baseLabel = localize(
    tamer?.system?.attributes?.[baseAttributeKey]?.label,
    baseAttributeKey
  );

  return {
    highest,
    base: {
      key: baseAttributeKey,
      value: baseValue,
      label: baseLabel
    },
    calculatedAvailable:
      allowCalculated &&
      isCalculatedAvailable(tamer)
  };
}

async function promptPoolActionOptions(tamer, actionKey, baseAttributeKey) {
  const modeData = getActionModeOptions(tamer, baseAttributeKey);

  return await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize(`DDA.TamerAction.${actionKey}.Title`, actionKey)
    },
    content: `
      <div class="dda-roll-dialog dda-tamer-pool-action-dialog">
        <div class="form-group">
          <label>${localize("DDA.TamerAction.AttributeMode", "Modo do Atributo")}</label>
          <select name="mode">
            <option value="base">
              1 ${localize("DDA.Resource.Actions", "Ação")} —
              ${escapeHtml(modeData.base.label)} ${modeData.base.value}
            </option>
            <option value="highest">
              2 ${localize("DDA.Resource.Actions", "Ações")} —
              ${localize("DDA.TamerAction.HighestAttribute", "Maior Atributo")}:
              ${escapeHtml(modeData.highest.label)} ${modeData.highest.value}
            </option>
          </select>
        </div>

        <label class="dda-tamer-action-check">
          <input type="checkbox" name="bolster" />
          <span>
            ${localize("DDA.TamerAction.Bolster", "Fortalecer")}
            — +1 ${localize("DDA.Resource.Actions", "Ação")}, +2 ${localize("DDA.Pool.Dice", "dados")}
          </span>
        </label>

        ${
          modeData.calculatedAvailable
            ? `
              <label class="dda-tamer-action-check dda-tamer-action-calculated">
                <input type="checkbox" name="calculated" />
                <span>
                  ${localize("DDA.TamerTalent.Name.Calculated", "Calculated")}
                  — ${localize(
                    "DDA.TamerAction.CalculatedHint",
                    "trocar os +2 dados de Fortalecer por +1 Sucesso automático"
                  )}
                </span>
              </label>
            `
            : ""
        }
      </div>
    `,
    render: (_event, dialog) => {
      const mode = dialog.element.querySelector("select[name='mode']");
      const bolster = dialog.element.querySelector("input[name='bolster']");
      const calculated = dialog.element.querySelector("input[name='calculated']");

      const refresh = () => {
        const usesHighest = String(mode?.value ?? "base") === "highest";
        if (bolster) bolster.disabled = usesHighest;

        if (usesHighest) {
          if (bolster) bolster.checked = false;
          if (calculated) calculated.checked = false;
        }

        if (calculated) {
          calculated.disabled = usesHighest || !Boolean(bolster?.checked);
        }
      };

      if (mode) mode.onchange = refresh;
      if (bolster) bolster.onchange = refresh;
      refresh();
    },
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm", "Confirmar"),
        default: true,
        callback: (_event, button) => {
          const form = button.form.elements;
          const mode = String(form.mode?.value ?? "base");
          const requestedBolster = Boolean(form.bolster?.checked);
          const bolster = mode === "base" && requestedBolster;
          const calculated = bolster && Boolean(form.calculated?.checked);

          return {
            mode,
            bolster,
            calculated,
            attribute: mode === "highest" ? modeData.highest : modeData.base,
            actionCost: mode === "highest" || bolster ? 2 : 1,
            bolsterDice: bolster && !calculated ? 2 : 0,
            automaticSuccesses: calculated ? 1 : 0
          };
        }
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel", "Cancelar"),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });
}

async function rollAttributePool(tamer, actionKey, options) {
  const dice = Math.max(0, number(options?.attribute?.value, 0) + number(options?.bolsterDice, 0));
  const automaticSuccesses = Math.max(0, number(options?.automaticSuccesses, 0));
  const roll = dice > 0 ? await new Roll(`${dice}d6`).evaluate() : null;
  const results = roll?.dice?.[0]?.results?.map((entry) => number(entry.result, 0)) ?? [];
  const rolledSuccesses =
    results.filter((result) => {
      return result >= 5;
    }).length;

  const totalSuccesses =
    rolledSuccesses +
    automaticSuccesses;

  const luckyNumberResult =
    await applyLuckyNumberReward(
      tamer,
      results,
      {
        source:
          `tamerAction:${actionKey}`
      }
    );

  return {
    roll,
    dice,
    results,
    rolledSuccesses,
    automaticSuccesses,
    totalSuccesses,
    actionKey,

    attribute:
      options.attribute,

    luckyNumberResult
  };
}

function renderDiceResults(results = []) {
  if (!results.length) return "—";

  return results.map((result) => {
    const cssClass = result >= 5 ? "success" : "failure";
    return `<span class="dda-die ${cssClass}">${result}</span>`;
  }).join("");
}

async function addActiveEffect(actor, effect) {
  const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);
  effects.push(effect);

  await actor.update({
    "system.effects.active": effects
  });
}

function buildSourceTurnEffect(tamer, data = {}) {
  return {
    id: foundry.utils.randomID(),
    source: "tamerAction",
    sourceActorUuid: tamer.uuid,
    sourceActorName: tamer.name,
    sourceCombatId: game?.combat?.id ?? "",
    sourceRound: number(game?.combat?.round, 0),
    sourceTurn: number(game?.combat?.turn, -1),
    createdTurnSignature: getCombatTurnSignature(),
    expiresOn: "sourceTurnStart",
    duration: 1,
    remaining: 1,
    category: "positive",
    ...data
  };
}

async function postActionCard(tamer, title, body, roll = null) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    rolls: roll ? [roll] : [],
    content: `
      <div class="dda-chat-roll-message dda-tamer-action-message">
        <div class="dda-chat-card dda-effect-card effect-special dda-tamer-action-card">
          <h2>${escapeHtml(title)}</h2>
          ${body}
        </div>
        ${roll ? await roll.render() : ""}
      </div>
    `
  });
}

async function useDirect(tamer) {
  if (wasUsedThisTurn(tamer, "direct")) {
    ui.notifications.warn(
      localize("DDA.TamerAction.Warning.DirectOncePerTurn", "Direcionar só pode ser usado uma vez por turno.")
    );
    return null;
  }

  const targetedDigimon = dedupeActors(getTargetedDigimonActors());

  if (targetedDigimon.length !== 1) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.DirectRequiresOneTarget",
        "Marque exatamente um Digimon aliado como alvo antes de usar Direcionar."
      )
    );
    return null;
  }

  const target = targetedDigimon[0];

  if (game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(target)) {
    ui.notifications.warn(String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `[FRENZY]: ${target.name} cannot be affected by Tamer Actions or Special Orders.`
      : `[FRENZY]: ${target.name} não pode ser afetado por Ações do Tamer ou Ordens Especiais.`);
    return null;
  }

  if (getNextOrderTargetRestriction(tamer, target)) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.NextOrder.DirectRestriction",
        "Este Digimon já recebeu WE CAN DO THIS, TOGETHER neste turno e não pode ser alvo do Direcionar normal."
      )
    );
    return null;
  }

  const partner = isPartnerActor(tamer, target);
  const charisma = getAttributeValue(tamer, "charisma");
  const highest = getHighestAttribute(tamer);
  const directTeam = hasUnlockedOfficialTamerTalent(tamer, "directTeam");
  const calculatedAvailable = isCalculatedAvailable(tamer);

  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize("DDA.TamerAction.Direct.Title", "Direcionar")
    },
    content: `
      <div class="dda-roll-dialog dda-tamer-direct-dialog">
        <div class="form-group">
          <label>${localize("DDA.TamerAction.Target", "Alvo")}</label>
          <input type="text" value="${escapeHtml(target.name)}" readonly />
        </div>

        <div class="form-group">
          <label>${localize("DDA.TamerAction.Direct.Stat", "Pool afetado")}</label>
          <select name="statKey">
            <option value="accuracy">${localize("DDA.MainStat.Accuracy", "Precisão")}</option>
            <option value="dodge">${localize("DDA.MainStat.Dodge", "Esquiva")}</option>
          </select>
        </div>

        <div class="form-group">
          <label>${localize("DDA.TamerAction.AttributeMode", "Modo do Atributo")}</label>
          <select name="mode">
            <option value="charisma">
              1 ${localize("DDA.Resource.Actions", "Ação")} —
              ${localize("DDA.TamerAttribute.Charisma", "Carisma")} ${charisma}
            </option>
            <option value="highest">
              2 ${localize("DDA.Resource.Actions", "Ações")} —
              ${escapeHtml(highest.label)} ${highest.value}
            </option>
          </select>
        </div>

        <label class="dda-tamer-action-check">
          <input type="checkbox" name="bolster" />
          <span>
            ${localize("DDA.TamerAction.Bolster", "Fortalecer")}
            — +1 ${localize("DDA.Resource.Actions", "Ação")}, +2 ${localize("DDA.TamerAction.Direct.Bonus", "bônus")}
          </span>
        </label>

        ${
          calculatedAvailable
            ? `
              <label class="dda-tamer-action-check dda-tamer-action-calculated">
                <input type="checkbox" name="calculated" />
                <span>
                  ${localize("DDA.TamerTalent.Name.Calculated", "Calculated")}
                  — ${localize(
                    "DDA.TamerAction.CalculatedHint",
                    "trocar os +2 dados de Fortalecer por +1 Sucesso automático"
                  )}
                </span>
              </label>
            `
            : ""
        }
      </div>
    `,
    render: (_event, dialog) => {
      const mode = dialog.element.querySelector("select[name='mode']");
      const bolster = dialog.element.querySelector("input[name='bolster']");
      const calculated = dialog.element.querySelector("input[name='calculated']");

      const refresh = () => {
        const usesHighest = String(mode?.value ?? "charisma") === "highest";
        if (bolster) bolster.disabled = usesHighest;
        if (usesHighest) {
          if (bolster) bolster.checked = false;
          if (calculated) calculated.checked = false;
        }
        if (calculated) calculated.disabled = usesHighest || !Boolean(bolster?.checked);
      };

      if (mode) mode.onchange = refresh;
      if (bolster) bolster.onchange = refresh;
      refresh();
    },
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm", "Confirmar"),
        default: true,
        callback: (_event, button) => {
          const form = button.form.elements;
          const statKey = String(form.statKey?.value ?? "accuracy");
          const mode = String(form.mode?.value ?? "charisma");
          const requestedBolster = Boolean(form.bolster?.checked);
          const bolster = mode === "charisma" && requestedBolster;
          const calculated = bolster && Boolean(form.calculated?.checked);
          const sourceAttribute = mode === "highest"
            ? highest
            : {
                key: "charisma",
                value: charisma,
                label: localize("DDA.TamerAttribute.Charisma", "Carisma")
              };

          const otherPenalty = partner ? 0 : (directTeam ? -1 : -2);
          const aimAssist =
            partner &&
            statKey === "accuracy" &&
            mode === "highest" &&
            hasUnlockedOfficialTamerTalent(tamer, "aimAssist");
          const bonus = Math.max(
            0,
            sourceAttribute.value +
              (bolster && !calculated ? 2 : 0) +
              (aimAssist ? 2 : 0) +
              otherPenalty
          );

          return {
            statKey,
            mode,
            bolster,
            calculated,
            aimAssist,
            sourceAttribute,
            otherPenalty,
            bonus,
            actionCost: mode === "highest" || bolster ? 2 : 1
          };
        }
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel", "Cancelar"),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });

  if (!result) return null;
  if (!(await spendActions(tamer, result.actionCost))) return null;
  await revealHiddenFromCreatureInteraction(tamer, "direct");

  const effect = buildSourceTurnEffect(tamer, {
    tag: EFFECT_TAG_DIRECT,
    label: localize("DDA.TamerAction.Direct.Effect", "Direcionado"),
    value: result.bonus,
    potency: result.bonus,
    automaticSuccesses: result.calculated ? 1 : 0,
    poolStat: result.statKey,
    consumeOn: "matchingPool",
    expiresOn: "consumed",
    endsAtCombatEnd: true,
    appliedCombatId: String(game?.combat?.id ?? ""),
    duration: null,
    remaining: null,
    targetIsPartner: partner,
    actionMode: result.mode,
    bolstered: result.bolster,
    calculated: result.calculated,
    otherDigimonPenalty: result.otherPenalty,
    sourceActionCost: result.actionCost,
    personalCheerleader: hasUnlockedOfficialTamerTalent(tamer, "personalCheerleader"),
    fakeout: Boolean(
      partner &&
      result.statKey === "accuracy" &&
      result.actionCost >= 2 &&
      hasUnlockedOfficialTamerTalent(tamer, "fakeout")
    )
  });

  await removePreviousDirectFromTamer(tamer);
  await addActiveEffect(target, effect);
  await markUsedThisTurn(tamer, "direct", {
    targetUuid: target.uuid,
    targetName: target.name,
    statKey: result.statKey
  });

  if (result.calculated) {
    await markCalculatedUsed(tamer, "direct");
  }

  await postActionCard(
    tamer,
    localize("DDA.TamerAction.Direct.Title", "Direcionar"),
    `
      <ul class="dda-effect-list">
        <li>${localize("DDA.TamerAction.Target", "Alvo")}: <strong>${escapeHtml(target.name)}</strong>.</li>
        <li>${localize("DDA.TamerAction.Direct.Stat", "Pool afetado")}: <strong>${localize(`DDA.MainStat.${result.statKey === "accuracy" ? "Accuracy" : "Dodge"}`, result.statKey)}</strong>.</li>
        <li>${localize("DDA.TamerAction.Direct.Bonus", "Bônus")}: <strong>+${result.bonus} ${localize("DDA.Pool.Dice", "dados")}</strong>.</li>
        ${
          result.aimAssist
            ? `<li><strong>${localize("DDA.TamerTalent.Name.AimAssist", "Aim Assist")}:</strong> +2.</li>`
            : ""
        }
        <li>${localize("DDA.Evolution.ActionCost", "Custo")}: <strong>${result.actionCost}</strong>.</li>
      </ul>
    `
  );

  target.sheet?.render(false);

  return {
    action: "direct",
    target,
    effect,
    ...result
  };
}

async function removePreviousDirectFromTamer(tamer) {
  const sourceUuid = String(tamer?.uuid ?? "").trim();
  if (!sourceUuid) return false;

  let changed = false;

  for (const actor of getAllRuntimeActors()) {
    const effects = foundry.utils.deepClone(
      actor?.system?.effects?.active ?? []
    );
    const remaining = effects.filter((effect) => {
      return !(
        String(effect?.tag ?? "") === EFFECT_TAG_DIRECT &&
        String(effect?.sourceActorUuid ?? "") === sourceUuid
      );
    });

    if (remaining.length === effects.length) continue;

    await actor.update({
      "system.effects.active": remaining
    });
    actor.sheet?.render(false);
    changed = true;
  }

  return changed;
}

async function useReposition(tamer) {
  if (wasUsedThisTurn(tamer, "reposition")) {
    ui.notifications.warn(
      localize("DDA.TamerAction.Warning.RepositionOncePerTurn", "Reposicionar só pode ser usado uma vez por turno.")
    );
    return null;
  }

  const partner = await chooseDigimonTarget(tamer, { partnerOnly: true });
  if (!partner) return null;
  if (game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(partner)) {
    ui.notifications.warn(String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `[FRENZY]: ${partner.name} cannot be affected by Tamer Actions or Special Orders.`
      : `[FRENZY]: ${partner.name} não pode ser afetado por Ações do Tamer ou Ordens Especiais.`);
    return null;
  }

  const options = await promptPoolActionOptions(tamer, "Reposition", "agility");
  if (!options) return null;

  if (hasUnlockedOfficialTamerTalent(tamer, "quickStep")) {
    options.automaticSuccesses += 1;
  }

  if (
    options.actionCost >= 2 &&
    hasUnlockedOfficialTamerTalent(tamer, "experiencedStep")
  ) {
    options.automaticSuccesses += 1;
  }

  if (!checkActorActionSpend(tamer, options.actionCost)) return null;

  const rollResult = await rollAttributePool(tamer, "reposition", options);

  if (!(await spendActions(tamer, options.actionCost))) return null;
  await revealHiddenFromCreatureInteraction(tamer, "reposition");

  await markUsedThisTurn(tamer, "reposition", {
    targetUuid: partner.uuid,
    successes: rollResult.totalSuccesses
  });

  if (options.calculated) {
    await markCalculatedUsed(tamer, "reposition");
  }

  let movementGranted = false;

  if (rollResult.totalSuccesses > 0) {
    movementGranted = Boolean(
      await game?.dda?.movementTracker?.grantMovement?.(
        partner,
        rollResult.totalSuccesses,
        {
          source: "tamerReposition",
          sourceActorUuid: tamer.uuid,
          sourceActorName: tamer.name,
          label: localize("DDA.TamerAction.Reposition.Title", "Reposicionar"),
          difficultTerrain: true
        }
      )
    );
  }

  await postActionCard(
    tamer,
    localize("DDA.TamerAction.Reposition.Title", "Reposicionar"),
    `
      <ul class="dda-effect-list">
        <li>${localize("DDA.TamerAction.Target", "Alvo")}: <strong>${escapeHtml(partner.name)}</strong>.</li>
        <li>${localize("DDA.TamerAction.Attribute", "Atributo")}: <strong>${escapeHtml(options.attribute.label)} ${options.attribute.value}</strong>.</li>
        <li>${localize("DDA.Pool.Dice", "Dados")}: <span class="dda-dice-results">${renderDiceResults(rollResult.results)}</span></li>
        <li>${localize("DDA.Pool.AutomaticSuccesses", "Sucessos automáticos")}: <strong>${rollResult.automaticSuccesses}</strong>.</li>
        <li>${localize("DDA.Pool.TotalSuccesses", "Sucessos totais")}: <strong>${rollResult.totalSuccesses}</strong>.</li>
        <li>${localize("DDA.TamerAction.Reposition.Movement", "Movimento concedido")}: <strong>${rollResult.totalSuccesses}</strong> ${localize("DDA.TamerAction.Spaces", "Espaços")}.</li>
        ${
          !movementGranted && rollResult.totalSuccesses > 0
            ? `<li class="pool-warning">${localize("DDA.TamerAction.Reposition.ManualMovement", "O token do parceiro não foi encontrado; mova-o manualmente.")}</li>`
            : ""
        }
      </ul>
    `,
    rollResult.roll
  );

  return {
    action: "reposition",
    partner,
    movementGranted,
    ...options,
    ...rollResult
  };
}

async function useReinforce(tamer) {
  if (wasUsedThisTurn(tamer, "reinforce")) {
    ui.notifications.warn(
      localize("DDA.TamerAction.Warning.ReinforceOncePerTurn", "Reforçar só pode ser usado uma vez por turno.")
    );
    return null;
  }

  const partner = await chooseDigimonTarget(tamer, { partnerOnly: true });
  if (!partner) return null;
  if (game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(partner)) {
    ui.notifications.warn(String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `[FRENZY]: ${partner.name} cannot be affected by Tamer Actions or Special Orders.`
      : `[FRENZY]: ${partner.name} não pode ser afetado por Ações do Tamer ou Ordens Especiais.`);
    return null;
  }

  const options = await promptPoolActionOptions(tamer, "Reinforce", "body");
  if (!options) return null;

  if (hasUnlockedOfficialTamerTalent(tamer, "bulkUp")) {
    options.automaticSuccesses += 1;
  }

  if (!checkActorActionSpend(tamer, options.actionCost)) return null;

  const rollResult = await rollAttributePool(tamer, "reinforce", options);

  if (!(await spendActions(tamer, options.actionCost))) return null;
  await revealHiddenFromCreatureInteraction(tamer, "reinforce");

  await markUsedThisTurn(tamer, "reinforce", {
    targetUuid: partner.uuid,
    successes: rollResult.totalSuccesses
  });

  if (options.calculated) {
    await markCalculatedUsed(tamer, "reinforce");
  }

  if (rollResult.totalSuccesses > 0) {
    const reinforceEffect = buildSourceTurnEffect(tamer, {
      tag: EFFECT_TAG_REINFORCE,
      label: localize("DDA.TamerAction.Reinforce.Effect", "Reforçado"),
      value: rollResult.totalSuccesses,
      potency: rollResult.totalSuccesses,
      grantedTemporaryWounds: rollResult.totalSuccesses,
      consumeOn: "expiration"
    });

    const grant = await grantNonStackingTemporaryWounds(partner, rollResult.totalSuccesses, {
      sourceId: `reinforce:${String(tamer.uuid ?? "")}`,
      label: reinforceEffect.label,
      duration: "sourceTurnStart",
      effectId: reinforceEffect.id,
      metadata: {
        sourceActorUuid: String(tamer.uuid ?? "")
      }
    });

    if (grant.applied) {
      await addActiveEffect(partner, reinforceEffect);
    }
  }

  await postActionCard(
    tamer,
    localize("DDA.TamerAction.Reinforce.Title", "Reforçar"),
    `
      <ul class="dda-effect-list">
        <li>${localize("DDA.TamerAction.Target", "Alvo")}: <strong>${escapeHtml(partner.name)}</strong>.</li>
        <li>${localize("DDA.TamerAction.Attribute", "Atributo")}: <strong>${escapeHtml(options.attribute.label)} ${options.attribute.value}</strong>.</li>
        <li>${localize("DDA.Pool.Dice", "Dados")}: <span class="dda-dice-results">${renderDiceResults(rollResult.results)}</span></li>
        <li>${localize("DDA.Pool.AutomaticSuccesses", "Sucessos automáticos")}: <strong>${rollResult.automaticSuccesses}</strong>.</li>
        <li>${localize("DDA.Pool.TotalSuccesses", "Sucessos totais")}: <strong>${rollResult.totalSuccesses}</strong>.</li>
        <li>${localize("DDA.TamerAction.Reinforce.TempWounds", "Ferimentos Temporários")}: <strong>+${rollResult.totalSuccesses}</strong>.</li>
      </ul>
    `,
    rollResult.roll
  );

  partner.sheet?.render(false);

  return {
    action: "reinforce",
    partner,
    ...options,
    ...rollResult
  };
}

function getTargetedEnemyDigimonActors() {
  return dedupeActors(
    Array.from(
      game?.user?.targets ?? []
    )
      .filter((token) => {
        return Number(
          token?.document
            ?.disposition ?? 0
        ) < 0;
      })
      .map((token) => {
        return token?.actor;
      })
      .filter((actor) => {
        return Boolean(
          actor &&
          [
            "digimon",
            "npc"
          ].includes(
            actor.type
          )
        );
      })
  );
}

async function chooseEnemyDigimonTarget() {
  const actors =
    getTargetedEnemyDigimonActors();

  if (!actors.length) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.EnemyScan.NoTarget",
        "Marque um Digimon inimigo como alvo."
      )
    );

    return null;
  }

  if (actors.length === 1) {
    return actors[0];
  }

  const options = actors
    .map((actor, index) => {
      return `
        <option value="${index}">
          ${escapeHtml(actor.name)}
        </option>
      `;
    })
    .join("");

  return await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize(
        "DDA.TamerTalent.EnemyScan.ChooseTarget",
        "Escolher inimigo"
      )
    },
    content: `
      <div class="dda-roll-dialog">
        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Target",
              "Alvo"
            )}
          </label>

          <select name="targetIndex">
            ${options}
          </select>
        </div>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize(
          "DDA.Button.Confirm",
          "Confirmar"
        ),
        default: true,
        callback: (_event, button) => {
          const index = Number(button.form.elements.targetIndex?.value ?? -1);
          return actors[index] ?? null;
        }
      },
      {
        action: "cancel",
        label: localize(
          "DDA.Button.Cancel",
          "Cancelar"
        ),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });
}

async function usePeakPerformance(
  tamer
) {
  if (
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "peakPerformance"
    )
  ) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.TalentStillLocked",
        "Peak Performance ainda está bloqueado."
      )
    );

    return null;
  }

  if (
    wasOfficialTalentUsedThisCombat(
      tamer,
      "peakPerformance"
    )
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Warning.AlreadyUsedThisCombat",
        "Peak Performance já foi usado neste Combate."
      )
    );

    return null;
  }

  const target =
    await chooseDigimonTarget(
      tamer
    );

  if (!target) {
    return null;
  }

  const payment =
    await spendOncePerCombatTalent(
      tamer,
      "peakPerformance",
      2
    );

  if (!payment) {
    return null;
  }

  const effect =
    buildSourceTurnEffect(
      tamer,
      {
        tag:
          "bastion",

        label:
          localize(
            "DDA.TamerTalent.PeakPerformance.Effect",
            "Peak Performance — [BASTION 2]"
          ),

        value:
          2,

        potency:
          2,

        category:
          "positive",

        specialOrder:
          "peakPerformance",

        consumeOn:
          "expiration"
      }
    );

  await addActiveEffect(
    target,
    effect
  );

  await postActionCard(
    tamer,

    localize(
      "DDA.TamerTalent.PeakPerformance.Order",
      "I BELIEVE IN YOU"
    ),

    `
      <ul class="dda-effect-list">
        <li>
          ${localize(
            "DDA.TamerAction.Target",
            "Alvo"
          )}:

          <strong>
            ${escapeHtml(target.name)}
          </strong>.
        </li>

        <li>
          ${localize(
            "DDA.Label.Effect",
            "Efeito"
          )}:

          <strong>
            [BASTION 2]
          </strong>.
        </li>

        <li>
          ${localize(
            "DDA.TamerTalent.PeakPerformance.Applied",
            "+2 em Precisão, Dano, Esquiva e Armadura."
          )}
        </li>

        <li>
          ${localize(
            "DDA.Label.Duration",
            "Duração"
          )}:

          <strong>
            ${localize(
              "DDA.TamerTalent.Duration.SourceTurnStart",
              "até o início do próximo turno do Digi-Escolhido"
            )}
          </strong>.
        </li>

        <li>
          ${localize(
            "DDA.Evolution.ActionCost",
            "Custo"
          )}:

          <strong>
            ${payment.actionCost}
          </strong>.
        </li>
      </ul>
    `
  );

  target.sheet?.render(false);

  return {
    action:
      "peakPerformance",

    target,
    effect,
    payment
  };
}

async function useEnemyScan(
  tamer
) {
  if (
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "enemyScan"
    )
  ) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.TalentStillLocked",
        "Enemy Scan ainda está bloqueado."
      )
    );

    return null;
  }

  if (!game?.combat?.started) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Warning.RequiresCombat",
        "Esta Ordem Especial exige um Combate ativo."
      )
    );

    return null;
  }

  const target =
    await chooseEnemyDigimonTarget();

  if (!target) {
    return null;
  }

  const payment =
    await spendOncePerRestTalent(
      tamer,
      "enemyScan",
      2,
      1
    );

  if (!payment) {
    return null;
  }

  const potency = Math.max(
    0,
    number(
      getActorSv(target),

      number(
        target.system?.stageValue,
        0
      )
    )
  );

  const effect =
    buildSourceTurnEffect(
      tamer,
      {
        tag:
          "debilitate",

        label:
          localize(
            "DDA.TamerTalent.EnemyScan.Effect",
            "Enemy Scan — [DEBILITATE]"
          ),

        value:
          potency,

        potency,

        category:
          "negative",

        specialOrder:
          "enemyScan",

        consumeOn:
          "expiration"
      }
    );

  await addActiveEffect(
    target,
    effect
  );

  await postActionCard(
    tamer,

    localize(
      "DDA.TamerTalent.EnemyScan.Order",
      "I’VE FOUND AN EXPLOIT"
    ),

    `
      <ul class="dda-effect-list">
        <li>
          ${localize(
            "DDA.TamerAction.Target",
            "Alvo"
          )}:

          <strong>
            ${escapeHtml(target.name)}
          </strong>.
        </li>

        <li>
          ${localize(
            "DDA.Label.Effect",
            "Efeito"
          )}:

          <strong>
            [DEBILITATE ${potency}]
          </strong>.
        </li>

        <li>
          ${formatI18n(
            "DDA.TamerTalent.EnemyScan.Applied",
            {
              potency
            },
            `-${potency} em Precisão, Dano, Esquiva e Armadura.`
          )}
        </li>

        <li>
          ${localize(
            "DDA.Label.Duration",
            "Duração"
          )}:

          <strong>
            ${localize(
              "DDA.TamerTalent.Duration.SourceTurnStart",
              "até o início do próximo turno do Digi-Escolhido"
            )}
          </strong>.
        </li>

        <li>
          ${localize(
            "DDA.Evolution.ActionCost",
            "Custo"
          )}:

          <strong>
            ${payment.actionCost}
          </strong>.
        </li>
      </ul>
    `
  );

  target.sheet?.render(false);

  return {
    action:
      "enemyScan",

    target,
    effect,
    potency,
    payment
  };
}

function getTamerActionFlag(message) {
  return message?.getFlag?.(
    SYSTEM_ID,
    TAMER_ACTION_FLAG
  ) ?? null;
}

function buildTamerActionFlags(data = {}) {
  return {
    [SYSTEM_ID]: {
      [TAMER_ACTION_FLAG]: data
    }
  };
}

async function resolveActorUuid(uuid) {
  const cleanUuid = String(uuid ?? "").trim();

  if (!cleanUuid) return null;

  try {
    const document = await fromUuid(cleanUuid);

    return document?.documentName === "Actor"
      ? document
      : null;
  } catch (error) {
    console.warn(
      "DDA | Could not resolve Actor for Tamer Action.",
      error
    );

    return null;
  }
}

function getActorActiveEffects(actor) {
  return foundry.utils.deepClone(
    actor?.system?.effects?.active ?? []
  );
}

function getActorActiveEffect(actor, effectId) {
  const cleanId = String(effectId ?? "").trim();

  if (!cleanId) return null;

  return getActorActiveEffects(actor).find((effect) => {
    return String(effect?.id ?? "") === cleanId;
  }) ?? null;
}

async function updateActorActiveEffect(
  actor,
  effectId,
  changes = {}
) {
  const effects = getActorActiveEffects(actor);

  const index = effects.findIndex((effect) => {
    return String(effect?.id ?? "") ===
      String(effectId ?? "");
  });

  if (index < 0) return null;

  effects[index] = {
    ...effects[index],
    ...changes
  };

  await actor.update({
    "system.effects.active": effects
  });

  actor.sheet?.render(false);

  return effects[index];
}

async function removeActorActiveEffect(
  actor,
  effectId
) {
  const effects = getActorActiveEffects(actor);

  const remaining = effects.filter((effect) => {
    return String(effect?.id ?? "") !==
      String(effectId ?? "");
  });

  if (remaining.length === effects.length) {
    return false;
  }

  await actor.update({
    "system.effects.active": remaining
  });

  actor.sheet?.render(false);

  return true;
}

function getHoldEffectLabel(responseAction) {
  if (responseAction === "dodge") {
    return localize(
      "DDA.TamerAction.Hold.DodgeEffect",
      "Segurar — Esquiva"
    );
  }

  return localize(
    "DDA.TamerAction.Hold.AttackEffect",
    "Segurar — Ataque"
  );
}

async function promptHoldOptions(
  tamer,
  partner
) {
  const intelligence = getAttributeValue(
    tamer,
    "intelligence"
  );

  const bestLaidPlans =
    hasUnlockedOfficialTamerTalent(
      tamer,
      "bestLaidPlans"
    );

  return await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize(
        "DDA.TamerAction.Hold.Title",
        "Segurar"
      )
    },
    content: `
      <div class="dda-roll-dialog dda-tamer-hold-dialog">
        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Target",
              "Alvo"
            )}
          </label>

          <input
            type="text"
            value="${escapeHtml(partner.name)}"
            readonly
          />
        </div>

        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Hold.Trigger",
              "Gatilho específico"
            )}
          </label>

          <textarea
            name="trigger"
            rows="3"
            placeholder="${escapeHtml(
              localize(
                "DDA.TamerAction.Hold.TriggerPlaceholder",
                "Ex.: quando o inimigo à esquerda atacar meu parceiro"
              )
            )}"
          ></textarea>
        </div>

        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Hold.BonusPool",
              "Pool beneficiada"
            )}
          </label>

          <select name="responseAction">
            <option value="attack">
              ${localize(
                "DDA.TamerAction.Hold.ResponseAttack",
                "Precisão do Ataque responsivo"
              )}
            </option>

            <option value="dodge">
              ${localize(
                "DDA.TamerAction.Hold.ResponseDodge",
                "Esquiva contra o Ataque previsto"
              )}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Hold.Response",
              "Resposta declarada"
            )}
          </label>

          <textarea
            name="responseDetail"
            rows="2"
            placeholder="${escapeHtml(
              localize(
                "DDA.TamerAction.Hold.ResponsePlaceholder",
                "Ex.: usar Pepper Breath contra o inimigo"
              )
            )}"
          ></textarea>
        </div>

        <p class="hint">
          ${formatI18n(
            "DDA.TamerAction.Hold.IntelligenceHint",
            {
              value: intelligence
            },
            `A Pool escolhida receberá +${intelligence} dados de Inteligência.`
          )}
        </p>

        ${
          bestLaidPlans
            ? `
              <p class="hint dda-tamer-action-talent-hint">
                <strong>
                  ${localize(
                    "DDA.TamerTalent.Name.BestLaidPlans",
                    "Best Laid Plans"
                  )}:
                </strong>

                ${localize(
                  "DDA.TamerAction.Hold.BestLaidPlansHint",
                  "+1 Sucesso automático quando a resposta for executada."
                )}
              </p>
            `
            : ""
        }
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize(
          "DDA.Button.Confirm",
          "Confirmar"
        ),
        default: true,
        callback: (_event, button) => {
          const form = button.form.elements;
          return {
            trigger: String(form.trigger?.value ?? "").trim(),
            responseAction: String(form.responseAction?.value ?? "attack"),
            responseDetail: String(form.responseDetail?.value ?? "").trim(),
            intelligence,
            bestLaidPlans
          };
        }
      },
      {
        action: "cancel",
        label: localize(
          "DDA.Button.Cancel",
          "Cancelar"
        ),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });
}

async function useHold(tamer) {
  if (!game?.combat?.started) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.HoldRequiresCombat",
        "Segurar exige um Combate ativo."
      )
    );

    return null;
  }

  if (wasUsedThisTurn(tamer, "hold")) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.HoldOncePerTurn",
        "Segurar só pode ser usado uma vez por turno."
      )
    );

    return null;
  }

  const partner = await chooseDigimonTarget(
    tamer,
    {
      partnerOnly: true
    }
  );

  if (!partner) return null;
  if (game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(partner)) {
    ui.notifications.warn(String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `[FRENZY]: ${partner.name} cannot be affected by Tamer Actions or Special Orders.`
      : `[FRENZY]: ${partner.name} não pode ser afetado por Ações do Tamer ou Ordens Especiais.`);
    return null;
  }

  const options = await promptHoldOptions(
    tamer,
    partner
  );

  if (!options) return null;

  if (!options.trigger) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.HoldNeedsTrigger",
        "Declare um gatilho específico para Segurar."
      )
    );

    return null;
  }

  if (!options.responseDetail) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.HoldNeedsResponse",
        "Declare qual resposta o parceiro realizará."
      )
    );

    return null;
  }

  const actionCost = 2;

  if (!(await spendActions(
    tamer,
    actionCost
  ))) {
    return null;
  }
  await revealHiddenFromCreatureInteraction(tamer, "holdAction");

  const poolStat =
    options.responseAction === "dodge"
      ? "dodge"
      : "accuracy";

  const effect = buildSourceTurnEffect(
    tamer,
    {
      tag: EFFECT_TAG_HOLD,
      label: getHoldEffectLabel(
        options.responseAction
      ),

      state: "armed",

      responseAction:
        options.responseAction,

      poolStat,

      value: options.intelligence,
      potency: options.intelligence,

      automaticSuccesses:
        options.bestLaidPlans
          ? 1
          : 0,

      trigger: options.trigger,

      responseDetail:
        options.responseDetail,

      consumeOn: "matchingPool",

      actionCostPrepaid:
        actionCost
    }
  );

  await addActiveEffect(
    partner,
    effect
  );

  await markUsedThisTurn(
    tamer,
    "hold",
    {
      targetUuid: partner.uuid,
      targetName: partner.name,

      responseAction:
        options.responseAction,

      trigger: options.trigger,

      effectId: effect.id
    }
  );

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor: tamer
    }),

    flags: buildTamerActionFlags({
      type: "hold",

      sourceTamerUuid:
        tamer.uuid,

      partnerUuid:
        partner.uuid,

      effectId:
        effect.id,

      responseAction:
        options.responseAction,

      responseDetail:
        options.responseDetail,

      trigger:
        options.trigger,

      activated: false,
      cancelled: false
    }),

    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-tamer-action-card dda-hold-card">
        <h2>
          ${escapeHtml(
            localize(
              "DDA.TamerAction.Hold.Title",
              "Segurar"
            )
          )}
        </h2>

        <ul class="dda-effect-list">
          <li>
            ${localize(
              "DDA.TamerAction.Target",
              "Alvo"
            )}:

            <strong>
              ${escapeHtml(partner.name)}
            </strong>.
          </li>

          <li>
            ${localize(
              "DDA.TamerAction.Hold.Trigger",
              "Gatilho"
            )}:

            <strong>
              ${escapeHtml(options.trigger)}
            </strong>.
          </li>

          <li>
            ${localize(
              "DDA.TamerAction.Hold.Response",
              "Resposta"
            )}:

            <strong>
              ${escapeHtml(
                options.responseDetail
              )}
            </strong>.
          </li>

          <li>
            ${localize(
              "DDA.TamerAction.Hold.BonusPool",
              "Pool beneficiada"
            )}:

            <strong>
              ${
                options.responseAction === "dodge"
                  ? localize(
                      "DDA.MainStat.Dodge",
                      "Esquiva"
                    )
                  : localize(
                      "DDA.MainStat.Accuracy",
                      "Precisão"
                    )
              }
            </strong>.
          </li>

          <li>
            ${localize(
              "DDA.TamerAction.Hold.Bonus",
              "Bônus"
            )}:

            <strong>
              +${options.intelligence}
              ${localize(
                "DDA.Pool.Dice",
                "dados"
              )}
            </strong>.
          </li>

          ${
            options.bestLaidPlans
              ? `
                <li>
                  <strong>
                    ${localize(
                      "DDA.TamerTalent.Name.BestLaidPlans",
                      "Best Laid Plans"
                    )}:
                  </strong>

                  +1
                  ${localize(
                    "DDA.Pool.AutomaticSuccesses",
                    "Sucesso automático"
                  )}.
                </li>
              `
              : ""
          }
        </ul>

        <div class="dda-tamer-action-chat-controls">
          <button
            type="button"
            data-dda-tamer-action="hold-activate"
          >
            ${localize(
              "DDA.TamerAction.Hold.Activate",
              "Ativar gatilho"
            )}
          </button>

          <button
            type="button"
            class="secondary"
            data-dda-tamer-action="hold-cancel"
          >
            ${localize(
              "DDA.Button.Cancel",
              "Cancelar"
            )}
          </button>
        </div>
      </div>
    `
  });

  partner.sheet?.render(false);

  return {
    action: "hold",
    partner,
    effect,
    message,
    ...options
  };
}

export function getTamerHoldAttackWindow(
  actor
) {
  return getActorActiveEffects(actor).find(
    (effect) => {
      return (
        String(effect?.tag ?? "") ===
          EFFECT_TAG_HOLD &&

        String(effect?.state ?? "") ===
          "active" &&

        String(
          effect?.responseAction ?? ""
        ) === "attack" &&

        String(effect?.poolStat ?? "") ===
          "accuracy"
      );
    }
  ) ?? null;
}

function getHoldBolsterBonus(tamer, partner) {
  const defaultRange = Number(tamer?.system?.evolution?.defaultRange?.value);
  return Number.isFinite(defaultRange) && defaultRange > 0
    ? Math.max(0, defaultRange)
    : Math.max(0, Number(getActorSv(partner) ?? 0));
}

async function resolveHoldBolster(tamer, partner, effect) {
  const actions = Math.max(0, Number(partner?.system?.combat?.actions?.value ?? 0));
  if (!partner || actions < 1) {
    return { bolstered: false, diceBonus: 0, automaticSuccesses: 0 };
  }

  const bonus = getHoldBolsterBonus(tamer, partner);
  const use = Boolean(await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-tamer-action-dialog"],
    window: { title: localize("DDA.TamerAction.Bolster", "Fortalecer") },
    content: `<div class="dda-roll-dialog"><p>${String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `<strong>${escapeHtml(partner.name)}</strong> may spend 1 additional Interrupt Action to Bolster this held ${effect?.responseAction === "dodge" ? "Dodge" : "Attack"} Pool by +${bonus}.`
      : `<strong>${escapeHtml(partner.name)}</strong> pode gastar 1 Ação de Interrupção adicional para Fortalecer esta Pool de ${effect?.responseAction === "dodge" ? "Esquiva" : "Ataque"} preparada em +${bonus}.`}</p></div>`,
    yes: { label: localize("DDA.TamerAction.Bolster", "Fortalecer") },
    no: { label: localize("DDA.Button.No", "Não"), default: true },
    rejectClose: false,
    modal: true
  }));
  if (!use) return { bolstered: false, diceBonus: 0, automaticSuccesses: 0 };

  const calculated = Boolean(
    tamer &&
    isCalculatedAvailable(tamer) &&
    await promptCalculatedReplacement(tamer, `${partner.name} — Hold + Bolster`)
  );

  const paid = await spendActorActions(partner, 1, {
    requireActiveUnit: false,
    notify: true
  });
  if (!paid) return { bolstered: false, diceBonus: 0, automaticSuccesses: 0 };

  if (calculated) await markCalculatedUsed(tamer, "holdBolster");

  return {
    bolstered: true,
    calculated,
    diceBonus: calculated ? 0 : bonus,
    automaticSuccesses: calculated ? 1 : 0,
    actionCost: 1,
    defaultRangeBonus: bonus
  };
}

async function activateHoldFromMessage(
  message,
  flagData
) {
  const partner = await resolveActorUuid(
    flagData?.partnerUuid
  );

  if (!partner) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.PartnerNotFound",
        "Parceiro não encontrado."
      )
    );

    return null;
  }

  if (
    !partner.isOwner &&
    !game.user?.isGM
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.NoPermission",
        "Você não controla este Actor."
      )
    );

    return null;
  }

  const effect = getActorActiveEffect(
    partner,
    flagData?.effectId
  );

  if (!effect) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.HoldExpired",
        "O efeito de Segurar já expirou."
      )
    );

    return null;
  }

  if (
    String(effect.state ?? "") ===
    "active"
  ) {
    return effect;
  }

  const sourceTamer = await resolveActorUuid(flagData?.sourceTamerUuid);
  const bolster = await resolveHoldBolster(sourceTamer, partner, effect);
  const baseValue = Math.max(0, Number(effect.value ?? effect.potency ?? 0));
  const baseAutomaticSuccesses = Math.max(0, Number(effect.automaticSuccesses ?? 0));

  const updated =
    await updateActorActiveEffect(
      partner,
      effect.id,
      {
        state: "active",
        activatedAt:
          new Date().toISOString(),
        value: baseValue + Math.max(0, Number(bolster.diceBonus ?? 0)),
        potency: baseValue + Math.max(0, Number(bolster.diceBonus ?? 0)),
        automaticSuccesses: baseAutomaticSuccesses + Math.max(0, Number(bolster.automaticSuccesses ?? 0)),
        holdBolstered: Boolean(bolster.bolstered),
        holdBolsterCalculated: Boolean(bolster.calculated),
        holdBolsterDiceBonus: Math.max(0, Number(bolster.diceBonus ?? 0)),
        holdBolsterAutomaticSuccesses: Math.max(0, Number(bolster.automaticSuccesses ?? 0)),
        holdBolsterActionCost: Math.max(0, Number(bolster.actionCost ?? 0)),
        holdBolsterDefaultRangeBonus: Math.max(0, Number(bolster.defaultRangeBonus ?? 0))
      }
    );

  if (
    message?.isAuthor ||
    game.user?.isGM
  ) {
    await message.setFlag(
      SYSTEM_ID,
      TAMER_ACTION_FLAG,
      {
        ...flagData,
        activated: true,
        cancelled: false,
        bolstered: Boolean(bolster.bolstered),
        bolsterCalculated: Boolean(bolster.calculated),
        bolsterDiceBonus: Math.max(0, Number(bolster.diceBonus ?? 0)),
        bolsterAutomaticSuccesses: Math.max(0, Number(bolster.automaticSuccesses ?? 0))
      }
    );
  }

  ui.notifications.info(
    flagData?.responseAction === "dodge"
      ? localize(
          "DDA.TamerAction.Hold.DodgeReady",
          "Segurar está ativo: a próxima Esquiva receberá o bônus."
        )
      : localize(
          "DDA.TamerAction.Hold.AttackReady",
          "Segurar está ativo: faça agora o Ataque declarado."
        )
  );

  return updated;
}

async function cancelHoldFromMessage(
  message,
  flagData
) {
  const partner = await resolveActorUuid(
    flagData?.partnerUuid
  );

  if (!partner) return false;

  if (
    !partner.isOwner &&
    !game.user?.isGM
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.NoPermission",
        "Você não controla este Actor."
      )
    );

    return false;
  }

  const removed =
    await removeActorActiveEffect(
      partner,
      flagData?.effectId
    );

  if (
    removed &&
    (
      message?.isAuthor ||
      game.user?.isGM
    )
  ) {
    await message.setFlag(
      SYSTEM_ID,
      TAMER_ACTION_FLAG,
      {
        ...flagData,
        cancelled: true,
        activated: false
      }
    );
  }

  return removed;
}

function getTamerSkillLabel(
  actor,
  skillKey
) {
  const skill =
    actor?.system?.skills?.[skillKey];

  if (!skill) return skillKey;

  return localize(
    skill.label,
    skillKey
  );
}

function getTamerSkillOptions(
  actor,
  selectedKey = ""
) {
  return Object
    .entries(
      actor?.system?.skills ?? {}
    )
    .map(([skillKey, skill]) => {
      const label = localize(
        skill?.label,
        skillKey
      );

      const selected =
        skillKey === selectedKey
          ? "selected"
          : "";

      return `
        <option
          value="${escapeHtml(skillKey)}"
          ${selected}
        >
          ${escapeHtml(label)}
        </option>
      `;
    })
    .join("");
}

function getOwnedTamerActors({
  excludeUuid = ""
} = {}) {
  return (
    game?.actors?.contents ?? []
  )
    .filter((actor) => {
      if (actor.type !== "character") {
        return false;
      }

      if (
        String(actor.uuid) ===
        String(excludeUuid)
      ) {
        return false;
      }

      return (
        game.user?.isGM ||
        actor.isOwner
      );
    })
    .sort((left, right) => {
      return left.name.localeCompare(
        right.name
      );
    });
}

function getTeamworkHelpEntries(
  requestMessageId
) {
  const entriesByActor = new Map();

  for (
    const message of
    game?.messages?.contents ?? []
  ) {
    const flagData =
      getTamerActionFlag(message);

    if (
      flagData?.type !==
      "teamworkHelp"
    ) {
      continue;
    }

    if (
      String(
        flagData.requestMessageId ?? ""
      ) !==
      String(requestMessageId ?? "")
    ) {
      continue;
    }

    const helperUuid = String(
      flagData.helperUuid ?? ""
    );

    if (!helperUuid) continue;

    entriesByActor.set(
      helperUuid,
      {
        message,
        flagData
      }
    );
  }

  return Array.from(
    entriesByActor.values()
  );
}

function getTeamworkBaseBonus(
  outcomeKey
) {
  const bonuses = {
    criticalSuccess: 5,
    success: 2,
    failure: 0,
    criticalFailure: -2
  };

  return bonuses[outcomeKey] ?? 0;
}

function getTeamworkOutcomeLabel(
  outcomeKey
) {
  const key =
    String(outcomeKey ?? "");

  const localizationKeys = {
    criticalSuccess:
      "DDA.Check.CriticalSuccess",

    success:
      "DDA.Check.Success",

    failure:
      "DDA.Check.Failure",

    criticalFailure:
      "DDA.Check.CriticalFailure"
  };

  return localize(
    localizationKeys[key] ??
    "DDA.Check.Failure",

    key
  );
}

async function promptTeamworkSetup(
  tamer,
  partner
) {
  const skillOptions = getTamerSkillOptions(
    tamer
  );

  const jointEffortAvailable = Boolean(
    partner &&
    hasUnlockedOfficialTamerTalent(
      tamer,
      "jointEffort"
    )
  );

  const jointEffortBlock =
    jointEffortAvailable
      ? `
        <div class="dda-teamwork-talent-option dda-joint-effort-option">
          <label>
            <input
              type="checkbox"
              name="jointEffort"
            />

            <span>
              <strong>Joint Effort</strong>

              ${localize(
                "DDA.TamerAction.Teamwork.JointEffortHint",
                "O parceiro ajuda em uma tarefa de empurrar, levantar ou arrastar. O SV dele será somado ao bônus da ajuda."
              )}
            </span>
          </label>

          <p class="hint">
            ${localize(
              "DDA.TamerAction.Teamwork.JointEffortPartner",
              "Parceiro"
            )}:

            <strong>
              ${escapeHtml(partner.name)}
            </strong>
          </p>
        </div>
      `
      : "";

  return await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize(
        "DDA.TamerAction.Teamwork.Title",
        "Trabalho em Equipe"
      )
    },
    content: `
      <div class="dda-roll-dialog dda-teamwork-setup-dialog">
        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Teamwork.Task",
              "Tarefa"
            )}
          </label>

          <textarea
            name="task"
            rows="3"
            placeholder="${escapeHtml(
              localize(
                "DDA.TamerAction.Teamwork.TaskPlaceholder",
                "Descreva o que o grupo está tentando realizar."
              )
            )}"
          ></textarea>
        </div>

        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Teamwork.MainSkill",
              "Perícia principal"
            )}
          </label>

          <select name="skillKey">
            ${skillOptions}
          </select>
        </div>

        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Teamwork.MainTN",
              "NA principal"
            )}
          </label>

          <input
            type="number"
            name="mainTn"
            value="12"
            min="1"
            max="30"
          />
        </div>

        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Teamwork.HelperTN",
              "NA dos ajudantes"
            )}
          </label>

          <input
            type="number"
            name="helperTn"
            value="14"
            min="14"
            max="20"
          />
        </div>
        ${jointEffortBlock}
      </div>
    `,
    render: (_event, dialog) => {
      if (!jointEffortAvailable) return;

      const skillSelect = dialog.element.querySelector("[name='skillKey']");
      const jointEffortInput = dialog.element.querySelector("[name='jointEffort']");

      const synchronizeJointEffort = () => {
        const validSkill = String(skillSelect?.value ?? "") === "featsOfStrength";
        if (jointEffortInput) {
          jointEffortInput.disabled = !validSkill;
          if (!validSkill) jointEffortInput.checked = false;
        }
      };

      if (skillSelect) skillSelect.onchange = synchronizeJointEffort;
      synchronizeJointEffort();
    },
    buttons: [
      {
        action: "confirm",
        label: localize(
          "DDA.Button.Confirm",
          "Confirmar"
        ),
        default: true,
        callback: (_event, button) => {
          const form = button.form.elements;
          return {
            task: String(form.task?.value ?? "").trim(),
            skillKey: String(form.skillKey?.value ?? ""),
            mainTn: Math.max(
              1,
              number(form.mainTn?.value, 12)
            ),
            helperTn: Math.min(
              20,
              Math.max(
                14,
                number(form.helperTn?.value, 14)
              )
            ),
            jointEffort: Boolean(form.jointEffort?.checked)
          };
        }
      },
      {
        action: "cancel",
        label: localize(
          "DDA.Button.Cancel",
          "Cancelar"
        ),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });
}

async function useTeamwork(tamer) {
const partner =
  await resolvePartnerActor(
    tamer
  );

const options =
  await promptTeamworkSetup(
    tamer,
    partner
  );

  if (!options) return null;

  if (!options.task) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.TeamworkNeedsTask",
        "Descreva a tarefa do Trabalho em Equipe."
      )
    );

    return null;
  }

  if (!options.skillKey) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.TeamworkNeedsSkill",
        "Escolha a Perícia principal."
      )
    );

    return null;
  }

  if (options.jointEffort) {
  if (!partner) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.NoPartnerLinked",
        "Nenhum Digimon parceiro está vinculado."
      )
    );

    return null;
  }

  if (game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(partner)) {
    ui.notifications.warn(String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `[FRENZY]: ${partner.name} cannot be affected by Joint Effort.`
      : `[FRENZY]: ${partner.name} não pode ser afetado por Joint Effort.`);
    return null;
  }

  if (
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "jointEffort"
    )
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.JointEffortLocked",
        "Este Digi-Escolhido ainda não desbloqueou Joint Effort."
      )
    );

    return null;
  }

  if (
    options.skillKey !==
    "featsOfStrength"
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.JointEffortNeedsStrength",
        "Joint Effort só pode ser usado em um Teste de Feitos de Força."
      )
    );

    return null;
  }
}

  const skillLabel =
    getTamerSkillLabel(
      tamer,
      options.skillKey
    );

  const message =
    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor: tamer
        }),

      flags:
        buildTamerActionFlags({
          type: "teamwork",

          initiatorUuid:
            tamer.uuid,

          initiatorName:
            tamer.name,

          skillKey:
            options.skillKey,

          skillLabel,

          task:
            options.task,

mainTn:
  options.mainTn,

helperTn:
  options.helperTn,

jointEffort:
  Boolean(
    options.jointEffort
  ),

jointEffortPartnerUuid:
  options.jointEffort
    ? partner?.uuid ?? ""
    : "",

jointEffortPartnerName:
  options.jointEffort
    ? partner?.name ?? ""
    : "",

resolved: false,
cancelled: false
        }),

      content: `
        <div class="dda-chat-card dda-effect-card effect-special dda-tamer-action-card dda-teamwork-card">
          <h2>
            ${escapeHtml(
              localize(
                "DDA.TamerAction.Teamwork.Title",
                "Trabalho em Equipe"
              )
            )}
          </h2>

          <ul class="dda-effect-list">
            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.Initiator",
                "Iniciador"
              )}:

              <strong>
                ${escapeHtml(tamer.name)}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.Task",
                "Tarefa"
              )}:

              <strong>
                ${escapeHtml(
                  options.task
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.MainSkill",
                "Perícia principal"
              )}:

              <strong>
                ${escapeHtml(skillLabel)}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.MainTN",
                "NA principal"
              )}:

              <strong>
                ${options.mainTn}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.HelperTN",
                "NA dos ajudantes"
              )}:

              <strong>
                ${options.helperTn}
              </strong>.
            </li>
            ${
  options.jointEffort
    ? `
      <li>
        <strong>
          Joint Effort:
        </strong>

        ${localize(
          "DDA.TamerAction.Teamwork.JointEffortActive",
          "o parceiro fará automaticamente um Teste de CPU (Feitos de Força), e seu SV será somado ao bônus da ajuda."
        )}
      </li>
    `
    : ""
}
          </ul>

          <div class="dda-tamer-action-chat-controls dda-teamwork-controls">
            <button
              type="button"
              data-dda-tamer-action="teamwork-help"
            >
              ${localize(
                "DDA.TamerAction.Teamwork.Help",
                "Ajudar"
              )}
            </button>

            <button
              type="button"
              data-dda-tamer-action="teamwork-resolve"
            >
              ${localize(
                "DDA.TamerAction.Teamwork.Resolve",
                "Resolver"
              )}
            </button>

            <button
              type="button"
              class="secondary"
              data-dda-tamer-action="teamwork-cancel"
            >
              ${localize(
                "DDA.Button.Cancel",
                "Cancelar"
              )}
            </button>
          </div>
        </div>
      `
    });

    if (options.jointEffort) {
  const requestData =
    getTamerActionFlag(
      message
    );

  const jointEffortResult =
    await createJointEffortHelp(
      message,
      requestData,
      tamer,
      partner
    );

  if (!jointEffortResult) {
    await message.delete();
    return null;
  }
}

  return {
    action: "teamwork",
    message,
    ...options
  };
}

async function createJointEffortHelp(
  requestMessage,
  requestData,
  tamer,
  partner
) {
  if (!requestMessage || !partner) {
    return null;
  }

  const helperTn = Math.min(
    20,
    Math.max(
      14,
      Number(
        requestData.helperTn ?? 14
      )
    )
  );

  const result =
    await rollDerivedCheck(
      partner,
      "cpu",
      {
        skillKey:
          "featsOfStrength",

        tn:
          helperTn,

        title:
          localize(
            "DDA.TamerAction.Teamwork.JointEffortCheck",
            "Joint Effort — Teste do parceiro"
          ),

        createChat:
          false
      }
    );

  if (!result) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.JointEffortRollFailed",
        "Não foi possível realizar o Teste de ajuda do parceiro."
      )
    );

    return null;
  }

  const outcomeKey =
    String(
      result.outcome ?? "failure"
    );

  const baseBonus =
    getTeamworkBaseBonus(
      outcomeKey
    );

  const partnerSv =
    Math.max(
      0,
      Number(
        getActorSv(partner) ??
        partner.system?.stageValue ??
        0
      )
    );

  const totalBonus =
    baseBonus +
    partnerSv;

  const message =
    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor: partner
        }),

      rolls: [
        result.roll
      ],

      flags:
        buildTamerActionFlags({
          type:
            "teamworkHelp",

          requestMessageId:
            requestMessage.id,

          initiatorUuid:
            tamer.uuid,

          helperUuid:
            partner.uuid,

          helperName:
            partner.name,

          helperType:
            "digimonPartner",

          skillKey:
            "featsOfStrength",

          skillLabel:
            localize(
              "DDA.TamerSkill.FeatsOfStrength",
              "Feitos de Força"
            ),

          outcomeKey,

          baseBonus,

          academicAdviceUsed:
            false,

          academicAdviceBonus:
            0,

          teamPlayerHelper:
            false,

          jointEffort:
            true,

          jointEffortBonus:
            partnerSv,

          bonus:
            totalBonus
        }),

      content: `
        <div class="dda-chat-card dda-effect-card effect-special dda-tamer-action-card dda-teamwork-help-card dda-joint-effort-card dda-check-${outcomeKey}">
          <h2>
            Joint Effort
          </h2>

          <ul class="dda-effect-list">
            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.Helper",
                "Ajudante"
              )}:

              <strong>
                ${escapeHtml(
                  partner.name
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.Label.DerivedStat",
                "Estatística Derivada"
              )}:

<strong>
  CPU
</strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.HelperSkill",
                "Perícia"
              )}:

              <strong>
                ${localize(
                  "DDA.TamerSkill.FeatsOfStrength",
                  "Feitos de Força"
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.Roll.Result",
                "Resultado"
              )}:

              <strong>
                ${escapeHtml(
                  getTeamworkOutcomeLabel(
                    outcomeKey
                  )
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.ResultBonus",
                "Bônus do resultado"
              )}:

              <strong>
                ${formatSigned(
                  baseBonus
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.JointEffortSvBonus",
                "Bônus de Joint Effort pelo SV"
              )}:

              <strong>
                +${partnerSv}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.Bonus",
                "Bônus de Trabalho em Equipe"
              )}:

              <strong>
                ${formatSigned(
                  totalBonus
                )}
              </strong>.
            </li>
          </ul>
        </div>
      `
    });

  return {
    helper:
      partner,

    result,

    message,

    baseBonus,

    partnerSv,

    totalBonus
  };
}

async function chooseTeamworkHelperActor(
  requestMessageId,
  requestData
) {
  const alreadyUsed = new Set(
    getTeamworkHelpEntries(
      requestMessageId
    ).map((entry) => {
      return String(
        entry.flagData
          ?.helperUuid ?? ""
      );
    })
  );

  const candidates =
    getOwnedTamerActors({
      excludeUuid:
        requestData.initiatorUuid
    }).filter((actor) => {
      return !alreadyUsed.has(
        String(actor.uuid)
      );
    });

  if (!candidates.length) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.NoTeamworkHelper",
        "Você não controla outro Digi-Escolhido disponível para ajudar."
      )
    );

    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const options = candidates
    .map((actor, index) => {
      return `
        <option value="${index}">
          ${escapeHtml(actor.name)}
        </option>
      `;
    })
    .join("");

  return await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize(
        "DDA.TamerAction.Teamwork.ChooseHelper",
        "Escolher ajudante"
      )
    },
    content: `
      <div class="dda-roll-dialog">
        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Teamwork.Helper",
              "Ajudante"
            )}
          </label>

          <select name="helperIndex">
            ${options}
          </select>
        </div>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize(
          "DDA.Button.Confirm",
          "Confirmar"
        ),
        default: true,
        callback: (_event, button) => {
          const index = Number(button.form.elements.helperIndex?.value ?? -1);
          return candidates[index] ?? null;
        }
      },
      {
        action: "cancel",
        label: localize(
          "DDA.Button.Cancel",
          "Cancelar"
        ),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });
}

async function chooseTeamworkHelperSkill(
  helper,
  requestedSkillKey
) {
  const academicAdvice =
    hasUnlockedOfficialTamerTalent(
      helper,
      "academicAdvice"
    );

  if (!academicAdvice) {
    return {
      skillKey:
        requestedSkillKey,

      academicAdviceUsed:
        false
    };
  }

  const requiredLabel =
    getTamerSkillLabel(
      helper,
      requestedSkillKey
    );

  const knowledgeLabel =
    getTamerSkillLabel(
      helper,
      "knowledge"
    );

  return await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize(
        "DDA.TamerAction.Teamwork.ChooseSkill",
        "Escolher Perícia de ajuda"
      )
    },
    content: `
      <div class="dda-roll-dialog">
        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerAction.Teamwork.HelperSkill",
              "Perícia do ajudante"
            )}
          </label>

          <select name="skillMode">
            <option value="required">
              ${escapeHtml(
                requiredLabel
              )}
            </option>

            <option value="knowledge">
              ${escapeHtml(
                knowledgeLabel
              )}

              — Academic Advice
            </option>
          </select>
        </div>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize(
          "DDA.Button.Confirm",
          "Confirmar"
        ),
        default: true,
        callback: (_event, button) => {
          const mode = String(button.form.elements.skillMode?.value ?? "required");
          return {
            skillKey:
              mode === "knowledge"
                ? "knowledge"
                : requestedSkillKey,
            academicAdviceUsed:
              mode === "knowledge"
          };
        }
      },
      {
        action: "cancel",
        label: localize(
          "DDA.Button.Cancel",
          "Cancelar"
        ),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });
}

async function createTeamworkHelp(
  requestMessage,
  requestData
) {
  const currentRequest =
    getTamerActionFlag(
      requestMessage
    );

  if (
    currentRequest?.resolved ||
    currentRequest?.cancelled
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.TeamworkClosed",
        "Este Trabalho em Equipe já foi encerrado."
      )
    );

    return null;
  }

  const helper =
    await chooseTeamworkHelperActor(
      requestMessage.id,
      requestData
    );

  if (!helper) return null;

  const skillChoice =
    await chooseTeamworkHelperSkill(
      helper,
      requestData.skillKey
    );

  if (!skillChoice) return null;

  const result =
    await rollTamerCheck(
      helper,
      skillChoice.skillKey,
      {
        skipDialog: true,

        fixedTn:
          Number(
            requestData.helperTn ?? 14
          ),

        createChat: false,

        title: localize(
          "DDA.TamerAction.Teamwork.HelperCheck",
          "Teste de ajuda"
        )
      }
    );

  if (!result) return null;

  const outcomeKey =
    result.outcome.key;

  const baseBonus =
    getTeamworkBaseBonus(
      outcomeKey
    );

  const successful =
    outcomeKey === "success" ||
    outcomeKey ===
      "criticalSuccess";

  const knowledgeValue = Number(
    helper.system?.skills
      ?.knowledge?.value ?? 0
  );

  const academicAdviceBonus =
    skillChoice.academicAdviceUsed &&
    successful
      ? Math.max(
          0,
          knowledgeValue - 2
        )
      : 0;

  const totalBonus =
    baseBonus +
    academicAdviceBonus;

  const teamPlayerHelper =
    hasUnlockedOfficialTamerTalent(
      helper,
      "teamPlayer"
    );

  const helperSkillLabel =
    getTamerSkillLabel(
      helper,
      skillChoice.skillKey
    );

  const message =
    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor: helper
        }),

      rolls: [result.roll],

      flags:
        buildTamerActionFlags({
          type: "teamworkHelp",

          requestMessageId:
            requestMessage.id,

          initiatorUuid:
            requestData.initiatorUuid,

          helperUuid:
            helper.uuid,

          helperName:
            helper.name,

          skillKey:
            skillChoice.skillKey,

          skillLabel:
            helperSkillLabel,

          outcomeKey,

          baseBonus,

          academicAdviceUsed:
            skillChoice
              .academicAdviceUsed,

          academicAdviceBonus,

          teamPlayerHelper,

          bonus:
            totalBonus
        }),

      content: `
        <div class="dda-chat-card dda-effect-card effect-special dda-tamer-action-card dda-teamwork-help-card dda-check-${outcomeKey}">
          <h2>
            ${escapeHtml(
              localize(
                "DDA.TamerAction.Teamwork.HelperCheck",
                "Teste de ajuda"
              )
            )}
          </h2>

          <ul class="dda-effect-list">
            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.Helper",
                "Ajudante"
              )}:

              <strong>
                ${escapeHtml(helper.name)}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.HelperSkill",
                "Perícia"
              )}:

              <strong>
                ${escapeHtml(
                  helperSkillLabel
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.Roll.Result",
                "Resultado"
              )}:

              <strong>
                ${escapeHtml(
                  getTeamworkOutcomeLabel(
                    outcomeKey
                  )
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.Bonus",
                "Bônus"
              )}:

              <strong>
                ${formatSigned(
                  totalBonus
                )}
              </strong>.
            </li>

            ${
              academicAdviceBonus > 0
                ? `
                  <li>
                    <strong>
                      Academic Advice:
                    </strong>

                    +${academicAdviceBonus}.
                  </li>
                `
                : ""
            }

            ${
              teamPlayerHelper
                ? `
                  <li>
                    <strong>
                      Team Player:
                    </strong>

                    ${localize(
                      "DDA.TamerAction.Teamwork.TeamPlayerHelperHint",
                      "O iniciador rerrolará resultados 1."
                    )}
                  </li>
                `
                : ""
            }
          </ul>
        </div>
      `
    });

  return {
    helper,
    result,
    message,
    totalBonus
  };
}

async function resolveTeamworkRequest(
  requestMessage,
  requestData
) {
  const currentRequest =
    getTamerActionFlag(
      requestMessage
    );

  if (
    currentRequest?.resolved ||
    currentRequest?.cancelled
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.TeamworkClosed",
        "Este Trabalho em Equipe já foi encerrado."
      )
    );

    return null;
  }

  const initiator =
    await resolveActorUuid(
      requestData.initiatorUuid
    );

  if (!initiator) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.TeamworkInitiatorMissing",
        "O iniciador não foi encontrado."
      )
    );

    return null;
  }

  if (
    !initiator.isOwner &&
    !game.user?.isGM
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.NoPermission",
        "Você não controla este Actor."
      )
    );

    return null;
  }

  const helperEntries =
    getTeamworkHelpEntries(
      requestMessage.id
    );

  const teamPlayerInitiator =
    hasUnlockedOfficialTamerTalent(
      initiator,
      "teamPlayer"
    );

  let ignoredCriticalFailure = null;
  let teamworkBonus = 0;

const resolvedHelpers =
  helperEntries.map((entry) => {
    const helperData =
      entry.flagData;

    const isCriticalFailure =
      helperData.outcomeKey ===
      "criticalFailure";

    const ignored =
      teamPlayerInitiator &&
      isCriticalFailure &&
      !ignoredCriticalFailure;

    let appliedBonus =
      Number(
        helperData.bonus ?? 0
      );

    if (ignored) {
      ignoredCriticalFailure =
        helperData;

      const criticalFailurePenalty =
        Number(
          helperData.baseBonus ?? -2
        );

      appliedBonus -=
        criticalFailurePenalty;
    }

    teamworkBonus +=
      appliedBonus;

    return {
      ...helperData,
      ignored,
      appliedBonus
    };
  });

  const rerollOnes =
    resolvedHelpers.some(
      (entry) => {
        return Boolean(
          entry.teamPlayerHelper
        );
      }
    );

  const modifierHint =
    formatI18n(
      "DDA.TamerAction.Teamwork.ModifierHint",
      {
        bonus: formatSigned(
          teamworkBonus
        ),

        helpers:
          resolvedHelpers.length
      },

      `Bônus de Trabalho em Equipe: ${formatSigned(teamworkBonus)} de ${resolvedHelpers.length} ajudante(s).`
    );

  const result =
    await rollTamerCheck(
      initiator,
      requestData.skillKey,
      {
        fixedTn:
          Number(
            requestData.mainTn ?? 12
          ),

        fixedModifier:
          teamworkBonus,

        rerollOnes,

        createChat: false,

        title: localize(
          "DDA.TamerAction.Teamwork.MainCheck",
          "Teste principal de Trabalho em Equipe"
        ),

        modifierHint
      }
    );

  if (!result) return null;

  const helperList = resolvedHelpers
    .length
      ? resolvedHelpers
          .map((entry) => {
const appliedBonus =
  Number(
    entry.appliedBonus ??
    entry.bonus ??
    0
  );

            return `
              <li>
                <strong>
                  ${escapeHtml(
                    entry.helperName ?? ""
                  )}
                </strong>

                — ${escapeHtml(
                  getTeamworkOutcomeLabel(
                    entry.outcomeKey
                  )
                )}

                — ${formatSigned(
                  appliedBonus
                )}
${
  entry.jointEffort
    ? `
      <span>
        (Joint Effort:
        SV +${Number(
          entry.jointEffortBonus ?? 0
        )})
      </span>
    `
    : ""
}
                ${
                  entry.ignored
                    ? `
                      <span>
                        (${localize(
                          "DDA.TamerAction.Teamwork.IgnoredByTeamPlayer",
                          "penalidade ignorada por Team Player"
                        )})
                      </span>
                    `
                    : ""
                }
              </li>
            `;
          })
          .join("")
      : `
        <li>
          ${localize(
            "DDA.TamerAction.Teamwork.NoHelpers",
            "Nenhum ajudante participou."
          )}
        </li>
      `;

  const finalMessage =
    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor: initiator
        }),

      rolls: [result.roll],

      content: `
        <div class="dda-chat-card dda-effect-card effect-special dda-tamer-action-card dda-teamwork-result-card dda-check-${result.outcome.key}">
          <h2>
            ${escapeHtml(
              localize(
                "DDA.TamerAction.Teamwork.ResultTitle",
                "Resultado do Trabalho em Equipe"
              )
            )}
          </h2>

          <ul class="dda-effect-list">
            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.Task",
                "Tarefa"
              )}:

              <strong>
                ${escapeHtml(
                  requestData.task ?? ""
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.Bonus",
                "Bônus"
              )}:

              <strong>
                ${formatSigned(
                  teamworkBonus
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.Roll.TN",
                "NA"
              )}:

              <strong>
                ${result.tn}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.Roll.Result",
                "Resultado"
              )}:

              <strong>
                ${escapeHtml(
                  result.outcome.label
                )}
              </strong>.
            </li>

            <li>
              ${localize(
                "DDA.TamerAction.Teamwork.FinalTotal",
                "Total final"
              )}:

              <strong>
                ${result.total}
              </strong>.
            </li>
          </ul>

          <details class="dda-card-details">
            <summary>
              ${localize(
                "DDA.TamerAction.Teamwork.Helpers",
                "Ajudantes"
              )}

              <span>
                ${resolvedHelpers.length}
              </span>
            </summary>

            <ul class="dda-effect-list dda-teamwork-helper-list">
              ${helperList}
            </ul>
          </details>

          ${
            rerollOnes
              ? `
                <p class="dda-teamwork-talent-note">
                  <strong>
                    Team Player:
                  </strong>

                  ${localize(
                    "DDA.TamerAction.Teamwork.TeamPlayerApplied",
                    "Resultados 1 foram rerrolados no Teste principal."
                  )}
                </p>
              `
              : ""
          }
        </div>
      `
    });

  if (
    requestMessage.isAuthor ||
    game.user?.isGM
  ) {
    await requestMessage.setFlag(
      SYSTEM_ID,
      TAMER_ACTION_FLAG,
      {
        ...currentRequest,

        resolved: true,
        cancelled: false,

        resolvedMessageId:
          finalMessage.id,

        teamworkBonus,

        helperCount:
          resolvedHelpers.length,

        resultKey:
          result.outcome.key,

        resultTotal:
          result.total
      }
    );
  }

  return {
    result,
    finalMessage,
    resolvedHelpers,
    teamworkBonus
  };
}

async function cancelTeamworkRequest(
  requestMessage,
  requestData
) {
  if (
    !requestMessage.isAuthor &&
    !game.user?.isGM
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.NoPermission",
        "Você não pode cancelar este Trabalho em Equipe."
      )
    );

    return false;
  }

  await requestMessage.setFlag(
    SYSTEM_ID,
    TAMER_ACTION_FLAG,
    {
      ...requestData,
      cancelled: true,
      resolved: false
    }
  );

  return true;
}

export async function bindTamerActionChatCard(
  message,
  html
) {
  const root =
    html instanceof HTMLElement
      ? html
      : html?.[0] instanceof HTMLElement
        ? html[0]
        : null;

  if (!root?.querySelectorAll) {
    return;
  }

  const flagData =
    getTamerActionFlag(message);

  if (!flagData) return;

  const isClosed = (data) => {
    if (data?.type === "hold") {
      return Boolean(
        data.cancelled ||
        data.activated
      );
    }

    if (data?.type === "teamwork") {
      return Boolean(
        data.cancelled ||
        data.resolved
      );
    }

    return false;
  };

  root
    .querySelectorAll(
      "[data-dda-tamer-action]"
    )
    .forEach((button) => {
      const action = String(
        button.dataset
          .ddaTamerAction ?? ""
      );

      if (isClosed(flagData)) {
        button.disabled = true;
      }

      button.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();
          event.stopPropagation();

          if (button.disabled) return;

          button.disabled = true;

          try {
            const latestFlag =
              getTamerActionFlag(
                message
              ) ?? flagData;

            if (
              action ===
              "hold-activate"
            ) {
              await activateHoldFromMessage(
                message,
                latestFlag
              );
            }

            if (
              action ===
              "hold-cancel"
            ) {
              await cancelHoldFromMessage(
                message,
                latestFlag
              );
            }

            if (
              action ===
              "teamwork-help"
            ) {
              await createTeamworkHelp(
                message,
                latestFlag
              );
            }

            if (
              action ===
              "teamwork-resolve"
            ) {
              await resolveTeamworkRequest(
                message,
                latestFlag
              );
            }

            if (
              action ===
              "teamwork-cancel"
            ) {
              await cancelTeamworkRequest(
                message,
                latestFlag
              );
            }
          } catch (error) {
            console.error(
              "DDA | Tamer Action chat control failed.",
              error
            );

            ui.notifications.error(
              localize(
                "DDA.TamerAction.Warning.ChatActionFailed",
                "Não foi possível concluir a Ação do Tamer."
              )
            );
          } finally {
            const latestFlag =
              getTamerActionFlag(
                message
              ) ?? flagData;

            if (!isClosed(latestFlag)) {
              button.disabled = false;
            }
          }
        }
      );
    });
}


function getTamerCanvasToken(tamer) {
  return canvas?.tokens?.controlled?.find((token) => token.actor?.uuid === tamer?.uuid)
    ?? canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === tamer?.uuid)
    ?? null;
}

function getSingleTamerAttackTarget(tamer) {
  const targets = Array.from(game?.user?.targets ?? []);

  if (targets.length !== 1) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Attack.SelectOneTarget",
        "Selecione exatamente um alvo para o Ataque do Tamer."
      )
    );
    return null;
  }

  const targetToken = targets[0];
  const target = targetToken?.actor;

  if (
    !target ||
    !["character", "digimon", "npc"].includes(target.type) ||
    target.uuid === tamer?.uuid
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Attack.InvalidTarget",
        "O alvo selecionado não pode receber um Ataque de Tamer."
      )
    );
    return null;
  }

  if (game?.combat?.started && !isTokenCombatReady(targetToken)) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Attack.TargetUnavailable",
        "O alvo selecionado não está disponível neste Combate."
      )
    );
    return null;
  }

  return { target, targetToken };
}

function getTamerRangedAttackLimit(tamer) {
  const precision = Math.max(
    0,
    number(tamer?.system?.skills?.precision?.value, 0)
  );

  return 2 + Math.floor(precision / 2);
}

function getTamerAttackImmunity(target) {
  if (!target || !["digimon", "npc"].includes(target.type)) {
    return { immune: false, reason: "" };
  }

  const sizeKey = String(
    target.system?.size ??
    target.system?.derived?.size?.value ??
    ""
  ).trim().toLowerCase();

  const immuneSizes = new Set([
    "huge",
    "gigantic",
    "gargantuan",
    "colossal"
  ]);

  if (immuneSizes.has(sizeKey)) {
    return {
      immune: true,
      reason: localize(
        "DDA.TamerAction.Attack.ImmuneSize",
        "O alvo é grande demais para sofrer Dano de um Ataque humano."
      )
    };
  }

  if (getActorSv(target) >= 5) {
    return {
      immune: true,
      reason: localize(
        "DDA.TamerAction.Attack.ImmuneStage",
        "Digimon de Estágio Mega ou superior não sofrem Dano de Ataques humanos comuns."
      )
    };
  }

  return { immune: false, reason: "" };
}

async function promptTamerAttackOptions(tamer, target, distance, preset = {}) {
  const heavyForce = hasUnlockedOfficialTamerTalent(tamer, "heavyForce");
  const rangedLimit = getTamerRangedAttackLimit(tamer);
  const immunity = getTamerAttackImmunity(target);

  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: {
        title: localize("DDA.TamerAction.Attack.Title", "Ataque do Tamer")
      },
      content: `
        <div class="dda-tamer-action-dialog-body dda-tamer-attack-dialog">
          <p>${formatI18n(
            "DDA.TamerAction.Attack.TargetSummary",
            {
              target: `<strong>${escapeHtml(target.name)}</strong>`,
              distance,
              range: rangedLimit
            },
            `Alvo: <strong>${escapeHtml(target.name)}</strong>. Distância: ${distance}. Alcance à distância: ${rangedLimit}.`
          )}</p>

          <label class="form-group">
            <span>${localize("DDA.TamerAction.Attack.Method", "Método")}</span>
            ${preset.attackType ? `<input type="hidden" name="attackType" value="${escapeHtml(preset.attackType)}"><strong>${preset.attackType === "ranged" ? localize("DDA.TamerAction.Attack.Ranged", "À distância") : localize("DDA.TamerAction.Attack.Melee", "Corpo a corpo")}</strong>` : `<select name="attackType"><option value="melee">${localize("DDA.TamerAction.Attack.Melee", "Corpo a corpo")}</option><option value="ranged">${localize("DDA.TamerAction.Attack.Ranged", "À distância")}</option></select>`}
          </label>

          ${heavyForce ? `
            <label class="form-group">
              <span>${localize("DDA.TamerAction.Attack.Check", "Teste")}</span>
              <select name="skillKey">
                <option value="precision">${localize("DDA.TamerSkill.Precision", "Precisão")}</option>
                <option value="featsOfStrength">${localize("DDA.TamerSkill.FeatsOfStrength", "Proezas de Força")} — ${escapeHtml(localize("DDA.TamerTalent.HeavyForce.Title", "Heavy Force"))}</option>
              </select>
            </label>
          ` : `<input type="hidden" name="skillKey" value="precision">`}

          <label class="form-group">
            <span>${localize("DDA.TamerAction.Attack.Description", "Descrição do Ataque")}</span>
            <input type="text" name="description" placeholder="${escapeHtml(localize("DDA.TamerAction.Attack.DescriptionPlaceholder", "Soco, pedra arremessada, objeto improvisado..."))}">
          </label>

          ${immunity.immune ? `
            <p class="warning"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(immunity.reason)}</p>
          ` : ""}
        </div>
      `,
      ok: {
        label: localize("DDA.Button.Attack", "Atacar"),
        callback: (_event, button) => ({
          attackType: String(button.form.elements.attackType?.value ?? "melee"),
          skillKey: String(button.form.elements.skillKey?.value ?? "precision"),
          description: String(button.form.elements.description?.value ?? "").trim()
        })
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    return null;
  }
}

async function useTamerMove(tamer, difficult = false) {
  const movementTracker = game?.dda?.movementTracker;

  if (!movementTracker?.beginActionMovement) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Move.TrackerUnavailable",
        "O rastreador de Movimento não está disponível."
      )
    );
    return null;
  }

  const naturalExplorer = hasUnlockedOfficialTamerTalent(tamer, "naturalExplorer");
  const naturalExplorerFollower = difficult
    ? getNaturalExplorerFollowerEffect(tamer)
    : null;
  const ignoresDifficultTerrain = naturalExplorer || Boolean(naturalExplorerFollower);
  const actionCost = difficult && !ignoresDifficultTerrain ? 2 : 1;

  return movementTracker.beginActionMovement(tamer, {
    actionCost,
    actionKey: difficult && !ignoresDifficultTerrain ? "difficultMove" : "move",
    // This marks the session as terrain-authorized. Natural Explorer changes
    // the Action to Move (1A); it does not re-introduce a per-space penalty.
    difficultTerrain: difficult,
    label: difficult
      ? localize("DDA.TamerAction.DifficultMove.Title", "Movimento Difícil")
      : localize("DDA.TamerAction.Move.Title", "Mover"),
    source: difficult
      ? (ignoresDifficultTerrain ? "naturalExplorerMove" : "tamerDifficultMove")
      : "tamerMove"
  });
}

async function useTamerAttack(tamer, options = {}) {
  if (Boolean(tamer.system?.combat?.hasAttackedThisRound)) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Attack.AlreadyAttacked",
        "Este Tamer já realizou um Ataque nesta Rodada."
      )
    );
    return null;
  }

  if (!checkActorActionSpend(tamer, 1)) return null;

  const targetData = getSingleTamerAttackTarget(tamer);
  if (!targetData) return null;

  if (game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(targetData.target)) {
    ui.notifications.warn(String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `[FRENZY]: ${targetData.target.name} cannot be affected by a Tamer Attack.`
      : `[FRENZY]: ${targetData.target.name} não pode ser afetado por um Ataque de Tamer.`);
    return null;
  }

  const sourceToken = getTamerCanvasToken(tamer);
  if (!sourceToken) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Attack.TokenRequired",
        "O Tamer precisa possuir um token na Cena para atacar."
      )
    );
    return null;
  }

  const distance = getTokenGridDistance(sourceToken, targetData.targetToken);
  const attackOptions = await promptTamerAttackOptions(
    tamer,
    targetData.target,
    distance,
    options
  );
  if (!attackOptions) return null;

  const rangedLimit = getTamerRangedAttackLimit(tamer);

  if (attackOptions.attackType === "melee" && distance > 1) {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Attack.MeleeOutOfRange",
        "Ataques corpo a corpo do Tamer exigem um alvo adjacente."
      )
    );
    return null;
  }

  if (attackOptions.attackType === "ranged" && distance > rangedLimit) {
    ui.notifications.warn(
      formatI18n(
        "DDA.TamerAction.Attack.RangedOutOfRange",
        { range: rangedLimit, distance },
        `O alvo está a ${distance} Espaços, mas o alcance do Tamer é ${rangedLimit}.`
      )
    );
    return null;
  }

  const payment = await spendActorActions(tamer, 1);
  if (!payment) return null;
  await revealHiddenFromCreatureInteraction(tamer, "attack");

  await revealOverlookedToEnemy(
    tamer,
    targetData.target,
    "Tamer Attack"
  );

  let attackResult = null;
  let defenseResult = null;
  let tn = 0;
  let hit = false;

  if (targetData.target.type === "character") {
    attackResult = await rollTamerCheck(tamer, attackOptions.skillKey, {
      title: localize("DDA.TamerAction.Attack.AttackCheck", "Teste de Ataque do Tamer"),
      skipBusyHands: true
    });

    if (attackResult) {
      defenseResult = await rollTamerCheck(targetData.target, "evade", {
        title: localize("DDA.TamerAction.Attack.DefenseCheck", "Teste de Evasão contra Ataque humano"),
        skipBusyHands: true
      });
    }

    hit = Boolean(
      attackResult &&
      defenseResult &&
      Number(attackResult.total ?? 0) > Number(defenseResult.total ?? 0)
    );
  } else {
    tn = 12 + (getActorSv(targetData.target) * 2);
    attackResult = await rollTamerCheck(tamer, attackOptions.skillKey, {
      title: localize("DDA.TamerAction.Attack.AttackCheck", "Teste de Ataque do Tamer"),
      fixedTn: tn,
      skipBusyHands: true
    });

    hit = ["success", "criticalSuccess"].includes(
      String(attackResult?.outcome?.key ?? "")
    );
  }

  if (!attackResult || (targetData.target.type === "character" && !defenseResult)) {
    await tamer.update({
      "system.combat.actions.value": Math.min(
        payment.actionsBefore,
        number(tamer.system?.combat?.actions?.value, 0) + 1
      )
    });
    return null;
  }

  const criticalSuccess = targetData.target.type === "character"
    ? Number(attackResult.total ?? 0) >= Number(defenseResult?.total ?? 0) + 5
    : String(attackResult.outcome?.key ?? "") === "criticalSuccess";
  const immunity = getTamerAttackImmunity(targetData.target);
  const damage = hit && !immunity.immune ? (criticalSuccess ? 2 : 1) : 0;
  const attackLabel = attackOptions.description || localize("DDA.TamerAction.Attack.DefaultName", "Ataque improvisado");

  await tamer.update({
    "system.combat.hasAttackedThisRound": true,
    "system.combat.attacksMadeThisTurn": Math.max(
      1,
      number(tamer.system?.combat?.attacksMadeThisTurn, 0) + 1
    )
  });

  const resultLabel = immunity.immune
    ? localize("DDA.TamerAction.Attack.NoEffect", "Sem efeito")
    : hit
      ? localize("DDA.Attack.Result.Hit", "Acerto")
      : localize("DDA.Attack.Result.Miss", "Erro");

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-tamer-attack-card ${hit && !immunity.immune ? "hit" : "miss"}">
        <h2>${escapeHtml(attackLabel)}</h2>
        <ul class="dda-effect-list">
          <li>${localize("DDA.Attack.Attacker", "Atacante")}: <strong>${escapeHtml(tamer.name)}</strong>.</li>
          <li>${localize("DDA.Attack.Target", "Alvo")}: <strong>${escapeHtml(targetData.target.name)}</strong>.</li>
          <li>${localize("DDA.TamerAction.Attack.Method", "Método")}: <strong>${escapeHtml(attackOptions.attackType === "ranged" ? localize("DDA.TamerAction.Attack.Ranged", "À distância") : localize("DDA.TamerAction.Attack.Melee", "Corpo a corpo"))}</strong>.</li>
          ${tn ? `<li>${localize("DDA.Roll.TN", "TN")}: <strong>${tn}</strong>.</li>` : ""}
          ${defenseResult ? `<li>${localize("DDA.TamerAction.Attack.Contested", "Teste resistido")}: <strong>${attackResult.total} × ${defenseResult.total}</strong>.</li>` : ""}
          <li>${localize("DDA.Roll.Result", "Resultado")}: <strong>${escapeHtml(resultLabel)}</strong>.</li>
          ${immunity.immune ? `<li class="warning">${escapeHtml(immunity.reason)}</li>` : ""}
        </ul>
        ${damage > 0 ? `
          <button
            type="button"
            class="dda-apply-damage"
            data-defender-uuid="${escapeHtml(targetData.target.uuid)}"
            data-attacker-uuid="${escapeHtml(tamer.uuid)}"
            data-damage="${damage}"
            data-unalterable="true"
            data-damage-label="${escapeHtml(localize("DDA.TamerAction.Attack.UnalterableDamage", "Dano Inalterável de Tamer"))}"
          >
            ${formatI18n(
              "DDA.TamerAction.Attack.ApplyDamage",
              { damage },
              `Aplicar ${damage} de Dano Inalterável`
            )}
          </button>
        ` : ""}
      </div>
    `
  });

  return {
    tamer,
    target: targetData.target,
    attackResult,
    defenseResult,
    hit,
    criticalSuccess,
    damage,
    immune: immunity.immune
  };
}

async function useTamerCheckAction(tamer, requestedSkillKey = "") {
  const skillOptions = getTamerSkillOptions(tamer);

  if (!skillOptions.length) return null;

  let skillKey = String(requestedSkillKey ?? "").trim();

  if (!skillKey) try {
    skillKey = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: localize("DDA.TamerAction.Check.Title", "Teste")
      },
      content: `
        <div class="dda-tamer-action-dialog-body">
          <p>${localize("DDA.TamerAction.Check.Hint", "Escolha a Perícia usada pelo Teste de 1 Ação.")}</p>
          <label class="form-group">
            <span>${localize("DDA.TamerAction.Check.Skill", "Perícia")}</span>
            <select name="skillKey">
              ${skillOptions}
            </select>
          </label>
        </div>
      `,
      ok: {
        label: localize("DDA.Button.Roll", "Rolar"),
        callback: (_event, button) => String(button.form.elements.skillKey?.value ?? "")
      },
      rejectClose: false,
      modal: true
    }) ?? "";
  } catch (_error) {
    skillKey = "";
  }

  if (!skillKey) return null;
  const payment = await spendActorActions(tamer, 1);
  if (!payment) return null;

  const result = await rollTamerCheck(tamer, skillKey, {
    title: localize("DDA.TamerAction.Check.Title", "Teste")
  });

  if (!result) {
    await tamer.update({
      "system.combat.actions.value": Math.min(
        payment.actionsBefore,
        number(tamer.system?.combat?.actions?.value, 0) + 1
      )
    });
  }

  return result;
}

async function useTamerHoldBreath(tamer) {
  if (!(await spendActorActions(tamer, 1))) return null;

  await addActiveEffect(tamer, {
    id: foundry.utils.randomID(),
    tag: "holdBreath",
    label: localize("DDA.TamerAction.HoldBreath.Title", "Prender a Respiração"),
    value: 1,
    duration: 1,
    remaining: 1,
    sourceActorUuid: tamer.uuid
  });

  await postActionCard(
    tamer,
    localize("DDA.TamerAction.HoldBreath.Title", "Prender a Respiração"),
    `<p>${localize("DDA.TamerAction.HoldBreath.Applied", "O Tamer evita o Dano de afogamento deste turno.")}</p>`
  );

  return true;
}

async function useTamerEvolution(tamer) {
  const partner = await resolvePartnerActor(tamer);
  if (partner && game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(partner)) {
    ui.notifications.warn(String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `[FRENZY]: ${partner.name} cannot be affected by Tamer Actions or Special Orders.`
      : `[FRENZY]: ${partner.name} não pode ser afetado por Ações do Tamer ou Ordens Especiais.`);
    return null;
  }
  // evolvePartner owns the full Evolution payment flow, including the
  // pre-Initiative 2-Action Interrupt cost. Do not pre-spend or post-spend
  // here or the action menu charges Evolution twice.
  const { evolvePartner } = await import("./evolution.js");
  return evolvePartner(tamer);
}

const TAMER_COMBAT_SPECIAL_ORDER_IDS = [
  "strikeFast",
  "energyBurst",
  "swagger",
  "purifyPartner",
  "peakPerformance",
  "enemyScan",
  "speedSurge",
  "revitalize",
  "signatureVersatility",
  "autoHit",
  "vanish",
  "bullrush",
  "adrenalineHit",
  "hackingPride",
  "nextOrder",
  "predictable",
  "hackersMemory",
  "realization"
];

const TAMER_NARRATIVE_TALENT_IDS = [
  "silentMovement",
  "plantedIdea",
  "charmingInfluence",
  "cyberSleuth",
  "trailblazer"
];

function getTalentMenuActionCost(talent = {}) {
  const raw = String(talent.actionCost ?? "").trim().toLowerCase();
  if (!raw || raw === "passive") return "—";
  if (raw === "free") return localize("DDA.ActionCost.Free", "Livre");
  if (raw === "interrupt") return localize("DDA.ActionCost.Interrupt", "Interrupção");
  if (raw === "special") return localize("DDA.ActionCost.Special", "Especial");
  return `${raw}A`;
}


function getTalentImplementationPresentation(talentOrId) {
  const implementation = getTamerTalentImplementation(talentOrId);
  const mode = String(implementation.mode ?? "unknown");

  return {
    ...implementation,
    label: localize(
      getTamerTalentImplementationLabelKey(mode),
      mode === "automated"
        ? "Automatizado"
        : mode === "assisted"
          ? "Assistido"
          : mode === "narrative"
            ? "Narrativo"
            : "Desconhecido"
    ),
    cssClass: `is-${mode}`
  };
}

async function useOfficialCombatSpecialOrder(tamer, talentId) {
  if (getVanishTamerActionRestriction(tamer)) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Vanish.ActionRestriction",
        "NOW YOU SEE US permite apenas Mover ou Reposicionar neste turno."
      )
    );
    return null;
  }

  const talent = getOfficialTamerTalent(talentId);
  if (!talent || !hasUnlockedOfficialTamerTalent(tamer, talentId)) return null;

  const result = await useTamerTalent(tamer, talent, {
    source: "official"
  });

  if (!result?.success) {
    ui.notifications.warn(
      result?.message ||
      localize("DDA.TamerTalent.Automation.Failed", "Não foi possível usar esta Ordem Especial.")
    );
    return null;
  }

  const implementation = getTalentImplementationPresentation(talent);
  const resultMode = ["automated", "assisted", "narrative"].includes(
    String(result.automationStatus ?? "")
  )
    ? String(result.automationStatus)
    : implementation.mode;
  const status = getTalentImplementationPresentation({ id: talent.id }).label;
  const displayedStatus = resultMode === implementation.mode
    ? status
    : localize(
        getTamerTalentImplementationLabelKey(resultMode),
        resultMode
      );

  if (!result.suppressDefaultChat) {
    await postActionCard(
      tamer,
      talent.specialOrder?.name || talent.name,
      `
        <p><strong>${escapeHtml(talent.name)}</strong></p>
        <p>${escapeHtml(talent.effect ?? "")}</p>
        <ul class="dda-effect-list">
          <li>${localize("DDA.Automation.Status.Label", "Estado")}: <strong>${escapeHtml(displayedStatus)}</strong>.</li>
          ${result.message ? `<li>${escapeHtml(result.message)}</li>` : ""}
          ${result.details ? `<li>${escapeHtml(result.details)}</li>` : ""}
        </ul>
      `
    );
  }

  return { talent, ...result };
}

const TAMER_ACTION_MENU_ENTRIES = [
  {
    key: "move",
    titleKey: "DDA.TamerAction.Move.Title",
    summaryKey: "DDA.TamerAction.Move.Summary",
    cost: "1A"
  },
  {
    key: "attack",
    titleKey: "DDA.TamerAction.Attack.Title",
    summaryKey: "DDA.TamerAction.Attack.Summary",
    cost: "1A"
  },
  {
    key: "difficultMove",
    titleKey: "DDA.TamerAction.DifficultMove.Title",
    summaryKey: "DDA.TamerAction.DifficultMove.Summary",
    cost: "1–2A"
  },
  {
    key: "check",
    titleKey: "DDA.TamerAction.Check.Title",
    summaryKey: "DDA.TamerAction.Check.Summary",
    cost: "1A"
  },
  {
    key: "direct",
    titleKey: "DDA.TamerAction.Direct.Title",
    summaryKey: "DDA.TamerAction.Direct.Summary",
    cost: "1–2A"
  },
  {
    key: "reposition",
    titleKey: "DDA.TamerAction.Reposition.Title",
    summaryKey: "DDA.TamerAction.Reposition.Summary",
    cost: "1–2A"
  },
  {
    key: "reinforce",
    titleKey: "DDA.TamerAction.Reinforce.Title",
    summaryKey: "DDA.TamerAction.Reinforce.Summary",
    cost: "1–2A"
  },
  {
    key: "holdBreath",
    titleKey: "DDA.TamerAction.HoldBreath.Title",
    summaryKey: "DDA.TamerAction.HoldBreath.Summary",
    cost: "1A"
  },
  {
    key: "hold",
    titleKey: "DDA.TamerAction.Hold.Title",
    summaryKey: "DDA.TamerAction.Hold.Summary",
    cost: "2A"
  },
  {
    key: "evolution",
    titleKey: "DDA.TamerAction.Evolution.Title",
    summaryKey: "DDA.TamerAction.Evolution.Summary",
    cost: "1A"
  },
  {
    key: "teamwork",
    titleKey: "DDA.TamerAction.Teamwork.Title",
    summaryKey: "DDA.TamerAction.Teamwork.Summary",
    cost: "—"
  },
  {
    key: "hide",
    title: String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "Hide" : "Ocultar-se",
    summary: String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "Stealth Check TN 10 to become Hidden." : "Teste de Furtividade TN 10 para ficar Oculto.",
    cost: "1A"
  },
  {
    key: "detectHidden",
    title: String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "Detect Hidden" : "Detectar Oculto",
    summary: String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "Awareness Check against the Hidden target's Stealth result." : "Teste de Awareness contra o resultado de Furtividade do alvo Oculto.",
    cost: "1A"
  },
  {
    key: "environment",
    title: String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "Combat Environment" : "Ambiente de Combate",
    summary: String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "Configure sight, Hidden, Submerged, Drowning, and Cover." : "Configure visão, Hidden, Submerged, Drowning e Cover.",
    cost: "—"
  }
];

export async function getTamerActionMenuDefinition(tamer) {
  if (!tamer || tamer.type !== "character") return null;

  const frenzyGate = await game?.dda?.bossQualities?.getFrenzyTamerGateData?.(tamer);
  if (frenzyGate?.pending) {
    const overrideAllowed = Boolean(frenzyGate.overrideAllowed);
    return {
      actor: tamer,
      kind: "tamer",
      title: localize("DDA.TamerAction.Menu.Title", "Ações do Tamer"),
      hint: overrideAllowed
        ? (String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
          ? `[FRENZY]: ${frenzyGate.partner.name} must now make the required Attack. Other Tamer Actions remain locked until that happens.`
          : `[FRENZY]: ${frenzyGate.partner.name} precisa fazer agora o Ataque obrigatório. As outras Ações do Tamer continuam bloqueadas até isso acontecer.`)
        : (String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
          ? `[FRENZY] resolves before any other Tamer Action. The only exception is the 1-Action Charisma Check (TN ${frenzyGate.tn}).`
          : `[FRENZY] é resolvido antes de qualquer outra Ação do Tamer. A única exceção é o Teste de Carisma de 1 Ação (NA ${frenzyGate.tn}).`),
      entries: [{
        key: overrideAllowed ? "bossFrenzyWaiting" : "bossFrenzyOverride",
        title: overrideAllowed
          ? (String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "[FRENZY] — Awaiting Attack" : "[FRENZY] — Aguardando Ataque")
          : (String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "[FRENZY] — Direct Attack" : "[FRENZY] — Direcionar Ataque"),
        summary: overrideAllowed
          ? (String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "The Digimon may Attack a Target of the Tamer's choice." : "O Digimon pode atacar um alvo à escolha do Tamer.")
          : (String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? `Charisma Check vs TN ${frenzyGate.tn}.` : `Teste de Carisma contra NA ${frenzyGate.tn}.`),
        cost: overrideAllowed ? "—" : "1A"
      }],
      notes: [],
      execute: async (actionKey) => {
        if (actionKey === "bossFrenzyOverride") return game?.dda?.bossQualities?.attemptFrenzyOverride?.(tamer);
        if (actionKey === "bossFrenzyWaiting") {
          ui.notifications.info(String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
            ? `${frenzyGate.partner.name} must make the [FRENZY] Attack before the Tamer may act again.`
            : `${frenzyGate.partner.name} precisa fazer o Ataque de [FRENZY] antes que o Tamer possa agir novamente.`);
        }
        return null;
      }
    };
  }

  const vanishRestriction = getVanishTamerActionRestriction(tamer);
  const menuEntries = vanishRestriction
    ? TAMER_ACTION_MENU_ENTRIES.filter((entry) => ["move", "reposition"].includes(entry.key))
    : [...TAMER_ACTION_MENU_ENTRIES];

  const charmContest = !vanishRestriction
    ? await game?.dda?.bossQualities?.getCharmContestData?.(tamer)
    : null;
  if (charmContest) {
    menuEntries.push({
      key: "bossCharmContest",
      title: localize("DDA.BossEffect.Charm.Contest", "Contestar [CHARM]"),
      summary: String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
        ? `Spend 2 Actions on a Charisma or Willpower Skill Check (TN ${charmContest.tn}) to end [CHARM].`
        : `Gaste 2 Ações em um Teste de Carisma ou Força de Vontade (NA ${charmContest.tn}) para encerrar [CHARM].`,
      cost: "2A"
    });
  }

  if (!vanishRestriction && hasUnlockedOfficialTamerTalent(tamer, "busyHands")) {
    menuEntries.push({
      key: "busyHandsPlant",
      title: localize("DDA.TamerTalent.BusyHands.PlantTitle", "Busy Hands — Plant Small Item"),
      summary: localize("DDA.TamerTalent.BusyHands.PlantSummary", "Registre a colocação discreta de um objeto pequeno sem rolagem."),
      cost: "—",
      automationStatus: getTalentImplementationPresentation("busyHands").label,
      automationClass: getTalentImplementationPresentation("busyHands").cssClass
    });
  }

  if (!vanishRestriction && hasUnlockedOfficialTamerTalent(tamer, "beTheWinners")) {
    menuEntries.push({
      key: "beTheWinners",
      title: localize("DDA.TamerTalent.BeTheWinners.Title", "Be the Winners"),
      summary: localize("DDA.TamerTalent.BeTheWinners.Summary", "Divida o bônus de Direcionar entre o Partner e outro Digimon aliado disposto."),
      cost: "2–3A",
      automationStatus: getTalentImplementationPresentation("beTheWinners").label,
      automationClass: getTalentImplementationPresentation("beTheWinners").cssClass
    });
  }

  if (!vanishRestriction && hasUnlockedOfficialTamerTalent(tamer, "naturalExplorer")) {
    menuEntries.push({
      key: "naturalExplorerLead",
      title: localize("DDA.TamerTalent.NaturalExplorer.LeadTitle", "Natural Explorer — Lead Allies"),
      summary: localize("DDA.TamerTalent.NaturalExplorer.LeadSummary", "Designe aliados que seguirão o Tamer por terreno difícil."),
      cost: "—",
      automationStatus: getTalentImplementationPresentation("naturalExplorer").label,
      automationClass: getTalentImplementationPresentation("naturalExplorer").cssClass
    });
  }

  if (!vanishRestriction && hasUnlockedOfficialTamerTalent(tamer, "bestLaidPlans")) {
    menuEntries.push({
      key: "bestLaidPlansSurprise",
      title: localize("DDA.TamerTalent.BestLaidPlans.SurpriseTitle", "Best Laid Plans — Surprised"),
      summary: localize("DDA.TamerTalent.BestLaidPlans.SurpriseSummary", "Marque um inimigo investigado, interrogado ou flagrado mentindo para que perca a primeira Rodada."),
      cost: "—",
      automationStatus: getTalentImplementationPresentation("bestLaidPlans").label,
      automationClass: getTalentImplementationPresentation("bestLaidPlans").cssClass
    });
  }

  for (const talentId of vanishRestriction ? [] : TAMER_COMBAT_SPECIAL_ORDER_IDS) {
    if (!hasUnlockedOfficialTamerTalent(tamer, talentId)) continue;
    const talent = getOfficialTamerTalent(talentId);
    if (!talent) continue;
    const implementation = getTalentImplementationPresentation(talentId);
    menuEntries.push({
      key: `talent:${talentId}`,
      title: talent.specialOrder?.name || talent.name,
      summary: talent.name,
      cost: getTalentMenuActionCost(talent),
      automationStatus: implementation.label,
      automationClass: implementation.cssClass
    });
  }

  for (const talentId of vanishRestriction ? [] : TAMER_NARRATIVE_TALENT_IDS) {
    if (!hasUnlockedOfficialTamerTalent(tamer, talentId)) continue;
    const talent = getOfficialTamerTalent(talentId);
    if (!talent) continue;
    const implementation = getTalentImplementationPresentation(talentId);
    menuEntries.push({
      key: `talent:${talentId}`,
      title: talent.name,
      summary: talent.effect,
      cost: getTalentMenuActionCost(talent),
      automationStatus: implementation.label,
      automationClass: implementation.cssClass
    });
  }

  const handlers = {
    move: () => useTamerMove(tamer),
    attack: (options = {}) => useTamerAttack(tamer, options),
    difficultMove: () => useTamerMove(tamer, true),
    check: (options = {}) => useTamerCheckAction(tamer, options.skillKey ?? ""),
    direct: () => useDirect(tamer),
    reposition: () => useReposition(tamer),
    reinforce: () => useReinforce(tamer),
    holdBreath: () => useTamerHoldBreath(tamer),
    hold: () => useHold(tamer),
    evolution: () => useTamerEvolution(tamer),
    teamwork: () => useTeamwork(tamer),
    hide: async () => (await import("./environment.js")).attemptHide(tamer),
    detectHidden: async () => (await import("./environment.js")).attemptDetectHidden(tamer),
    environment: async () => (await import("./environment.js")).openCombatEnvironmentDialog(tamer),
    beTheWinners: () => useBeTheWinners(tamer),
    busyHandsPlant: () => postBusyHandsPlantCard(tamer),
    naturalExplorerLead: () => leadNaturalExplorerAllies(tamer),
    bestLaidPlansSurprise: () => markBestLaidPlansSurprise(tamer),
    bossCharmContest: () => game?.dda?.bossQualities?.contestCharm?.(tamer),
    bossFrenzyOverride: () => game?.dda?.bossQualities?.attemptFrenzyOverride?.(tamer)
  };

  const notes = vanishRestriction
    ? [{
        title: "NOW YOU SEE US",
        body: localize("DDA.TamerTalent.Vanish.ActionRestriction", "Somente as Ações Mover e Reposicionar estão disponíveis até o fim deste turno.")
      }]
    : [
        {
          title: localize("DDA.TamerAction.Bolster", "Fortalecer"),
          body: localize("DDA.TamerAction.BolsterIntegrated", "é oferecido dentro das Ações compatíveis, pois modifica a própria Ação em vez de ocorrer separadamente.")
        },
        {
          title: localize("DDA.TamerAction.Interrupts.Title", "Interrupções"),
          body: localize("DDA.TamerAction.Interrupts.Automatic", "Interceder, Proteção do Destino e outras respostas aparecem automaticamente quando o gatilho correto acontece.")
        }
      ];

  return {
    actor: tamer,
    kind: "tamer",
    title: localize("DDA.TamerAction.Menu.Title", "Ações do Tamer"),
    hint: vanishRestriction
      ? localize("DDA.TamerTalent.Vanish.MenuHint", "NOW YOU SEE US está ativo: neste turno, o Tamer só pode Mover ou Reposicionar.")
      : localize("DDA.TamerAction.Menu.Hint", "Escolha uma Ação do Tamer."),
    entries: menuEntries,
    notes,
    execute: async (actionKey, options = {}) => actionKey.startsWith("talent:")
      ? useOfficialCombatSpecialOrder(tamer, actionKey.slice(7))
      : handlers[actionKey]?.(options) ?? null
  };
}

export async function openTamerActionMenu(tamer) {
  if (!tamer || tamer.type !== "character") {
    ui.notifications.warn(localize("DDA.TamerAction.Warning.TamerOnly", "Apenas Tamers podem usar este menu."));
    return null;
  }

  const definition = await getTamerActionMenuDefinition(tamer);
  if (!definition) return null;

  return openCompactActionMenu({
    actor: tamer,
    kind: definition.kind,
    title: definition.title,
    hint: definition.hint,
    entries: definition.entries,
    notes: definition.notes,
    onSelect: (key) => definition.execute(key)
  });
}

export function prepareTamerActionPoolOptions(
  actor,
  statKey,
  options = {}
) {
  if (game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(actor)) {
    return { ...options };
  }

  const effects = foundry.utils.deepClone(
    actor?.system?.effects?.active ?? []
  );

  const matching = effects.filter(
    (effect) => {
      const tag = String(
        effect?.tag ?? ""
      );

      const poolMatches =
        String(effect?.poolStat ?? "") ===
        String(statKey ?? "");

      if (!poolMatches) return false;

      if (tag === EFFECT_TAG_DIRECT) {
        return true;
      }

      return (
        tag === EFFECT_TAG_HOLD &&
        String(effect?.state ?? "") ===
          "active"
      );
    }
  );

  if (!matching.length) {
    return {
      ...options
    };
  }

  const diceBonus = matching.reduce(
    (total, effect) => {
      return total + Math.max(
        0,
        number(
          effect?.value ??
          effect?.potency,
          0
        )
      );
    },
    0
  );

  const automaticSuccesses =
    matching.reduce(
      (total, effect) => {
        return total + Math.max(
          0,
          number(
            effect?.automaticSuccesses,
            0
          )
        );
      },
      0
    );

  const labels = matching
    .map((effect) => {
      return String(
        effect?.label ?? ""
      ).trim();
    })
    .filter(Boolean);

  const modifierBreakdown = [
    ...(Array.isArray(options.modifierBreakdown) ? options.modifierBreakdown : []),
    ...matching.map((effect) => ({
      id: effect.id,
      label: String(effect?.label ?? localize("DDA.TamerAction.Direct.Effect", "Directed")),
      value: Math.max(0, number(effect?.value ?? effect?.potency, 0)),
      kind: String(effect?.tag ?? "tamerAction")
    }))
  ];

  const directProtectedDice = matching
    .filter((effect) => String(effect?.tag ?? "") === EFFECT_TAG_DIRECT)
    .reduce((total, effect) => total + Math.max(0, number(effect?.value ?? effect?.potency, 0)), 0);

  return {
    ...options,

    diceModifier:
      number(
        options.diceModifier,
        0
      ) +
      diceBonus,

    automaticSuccesses:
      number(
        options.automaticSuccesses,
        0
      ) +
      automaticSuccesses,

    externalLabel: [
      String(
        options.externalLabel ?? ""
      ).trim(),

      ...labels
    ]
      .filter(Boolean)
      .join(" + "),

    modifierBreakdown,

    ddaRerollProtectedDice:
      number(options.ddaRerollProtectedDice, 0) + directProtectedDice,

    ddaTamerActionEffectIds: [
      ...(
        Array.isArray(
          options.ddaTamerActionEffectIds
        )
          ? options.ddaTamerActionEffectIds
          : []
      ),

      ...matching
        .map((effect) => effect.id)
        .filter(Boolean)
    ],

    ddaTamerDirectEffects: [
      ...(Array.isArray(options.ddaTamerDirectEffects) ? options.ddaTamerDirectEffects : []),
      ...matching
        .filter((effect) => String(effect?.tag ?? "") === EFFECT_TAG_DIRECT)
        .map((effect) => ({
          id: effect.id,
          tag: effect.tag,
          sourceActorUuid: effect.sourceActorUuid,
          sourceActionCost: number(effect.sourceActionCost, 0),
          fakeout: Boolean(effect.fakeout),
          personalCheerleader: Boolean(effect.personalCheerleader),
          label: effect.label
        }))
    ],

    ddaPersonalCheerleaderSources: [
      ...(Array.isArray(options.ddaPersonalCheerleaderSources) ? options.ddaPersonalCheerleaderSources : []),
      ...matching
        .filter((effect) => String(effect?.tag ?? "") === EFFECT_TAG_DIRECT && effect.personalCheerleader)
        .map((effect) => ({
          id: effect.id,
          sourceActorUuid: effect.sourceActorUuid,
          label: effect.label
        }))
    ]
  };
}

export async function consumeTamerActionPoolEffects(actor, options = {}) {
  const effectIds = new Set(
    Array.isArray(options.ddaTamerActionEffectIds)
      ? options.ddaTamerActionEffectIds.filter(Boolean)
      : []
  );

  if (!effectIds.size) return false;

  const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);
  const remaining = effects.filter((effect) => !effectIds.has(effect.id));

  if (remaining.length === effects.length) return false;

  await actor.update({
    "system.effects.active": remaining
  });

  actor.sheet?.render(false);
  return true;
}

function getTurnSourceTamerUuid(actor) {
  /*
   * Efeitos com expiresOn: "sourceTurnStart"
   * só expiram quando o próprio Tamer inicia
   * outro turno.
   *
   * O turno do parceiro não é o início de um
   * novo turno do Tamer.
   */
  if (
    !actor ||
    actor.type !== "character"
  ) {
    return "";
  }

  return String(
    actor.uuid ?? ""
  ).trim();
}

function getAllRuntimeActors() {
  const actors = [
    ...(game?.actors?.contents ?? []),
    ...(canvas?.tokens?.placeables ?? []).map((token) => token.actor)
  ].filter(Boolean);

  return dedupeActors(actors);
}

async function removeExpiredSourceTurnEffects(actor, sourceTamerUuid, currentSignature) {
  const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);

  const expired = effects.filter((effect) => {
    return effect.expiresOn === "sourceTurnStart" &&
      String(effect.sourceActorUuid ?? "") === sourceTamerUuid &&
      String(effect.createdTurnSignature ?? "") !== currentSignature;
  });

  if (!expired.length) return false;

  const remaining = effects.filter((effect) => !expired.some((entry) => entry.id === effect.id));

  for (const effect of expired) {
    if (String(effect.tag ?? "") !== EFFECT_TAG_REINFORCE) continue;
    await expireNonStackingTemporaryWounds(actor, {
      sourceId: `reinforce:${String(effect.sourceActorUuid ?? "")}`,
      effectId: String(effect.id ?? "")
    });
  }

  const restoredStunActions = expired
    .filter((effect) => String(effect.tag ?? "").toLowerCase() === "stun")
    .reduce((total, effect) => {
      return total + Math.max(
        0,
        number(
          effect.actionRemoved ??
          (effect.restoreActionOnExpire ? 1 : 0),
          0
        )
      );
    }, 0);

  const update = {
    "system.effects.active": remaining
  };

  if (restoredStunActions > 0) {
    const currentActions = Math.max(
      0,
      number(actor.system?.combat?.actions?.value, 0)
    );
    const maximumActions = Math.max(
      0,
      number(actor.system?.combat?.actions?.max, 2)
    );
    const hasteActive = remaining.some((effect) => {
      return String(effect?.tag ?? "").toLowerCase() === "haste" &&
        number(effect?.actionGranted, 0) > 0;
    });

    update["system.combat.actions.value"] = Math.min(
      maximumActions + (hasteActive ? 1 : 0),
      currentActions + restoredStunActions
    );
  }

  await actor.update(update);
  actor.sheet?.render(false);
  return true;
}

async function expireSourceTurnEffects(combat) {
  const currentSignature = getCombatTurnSignature();

  const activeCombatant = combat?.combatant;
  const activeUnitId = getCombatantUnitId(activeCombatant);
  const sourceTamers = (combat?.combatants?.contents ?? [])
    .filter((combatant) => !activeUnitId || getCombatantUnitId(combatant) === activeUnitId)
    .map((combatant) => combatant.actor)
    .filter((actor) => actor?.type === "character");

  if (!sourceTamers.length && activeCombatant?.actor?.type === "character") {
    sourceTamers.push(activeCombatant.actor);
  }

  for (const sourceTamer of sourceTamers) {
    const sourceTamerUuid = getTurnSourceTamerUuid(sourceTamer);
    if (!sourceTamerUuid) continue;

    for (const actor of getAllRuntimeActors()) {
      try {
        await removeExpiredSourceTurnEffects(actor, sourceTamerUuid, currentSignature);
      } catch (error) {
        console.warn("DDA | Could not expire a Tamer Action effect.", error, actor);
      }
    }

    const restrictions = foundry.utils.deepClone(
      sourceTamer.system?.combat?.tamerTalentRestrictions ?? {}
    );
    const vanish = restrictions.vanish ?? null;

    if (
      vanish?.active &&
      String(vanish.turnSignature ?? "") !== currentSignature
    ) {
      delete restrictions.vanish;
      await sourceTamer.update({
        "system.combat.tamerTalentRestrictions": restrictions
      });
      sourceTamer.sheet?.render(false);
    }
  }
}

Hooks.once("ready", () => {
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("turn" in changed) && !("round" in changed)) return;
    void expireSourceTurnEffects(combat);
  });

  game.digimonDigitalAdventures ??= {};
game.digimonDigitalAdventures.tamerActions = {
  open: openTamerActionMenu,

  preparePoolOptions:
    prepareTamerActionPoolOptions,

  consumePoolEffects:
    consumeTamerActionPoolEffects,

  getHoldAttackWindow:
    getTamerHoldAttackWindow,

  bindChatCard:
    bindTamerActionChatCard
};

  console.log(`DDA | Tamer Actions registered for ${SYSTEM_ID}.`);
});
