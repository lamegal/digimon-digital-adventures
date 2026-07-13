import {
  hasUnlockedOfficialTamerTalent
} from "../rules/tamer-resources.js";

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

function getActorReferenceKeys(actor) {
  return new Set(
    [
      actor?.uuid,
      actor?.id,
      actor?.parent?.uuid,
      actor?.parent?.id,
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

  const available =
    getAvailableActions(tamer);

  if (available < cost) {
    ui.notifications.warn(
      formatI18n(
        "DDA.TamerAction.Warning.NotEnoughActions",
        {
          required: cost,
          available
        },
        `Ações insuficientes: são necessárias ${cost}, mas apenas ${available} estão disponíveis.`
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

  await tamer.update({
    "system.combat.actions.value":
      available - cost,

    "system.combat.tamerTalentUsage":
      usage
  });

  return {
    actionCost:
      cost,

    actionsBefore:
      available,

    actionsAfter:
      available - cost
  };
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

  const available =
    getAvailableActions(tamer);

  const uses =
    getOfficialTamerTalentUseValue(
      tamer,
      talentId,
      maximum
    );

  if (available < cost) {
    ui.notifications.warn(
      formatI18n(
        "DDA.TamerAction.Warning.NotEnoughActions",
        {
          required: cost,
          available
        },
        `Ações insuficientes: são necessárias ${cost}, mas apenas ${available} estão disponíveis.`
      )
    );

    return null;
  }

  if (uses < 1) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Warning.NoUsesRemaining",
        "Este Talento não possui usos restantes."
      )
    );

    return null;
  }

  await tamer.update({
    "system.combat.actions.value":
      available - cost,

    [`system.tamerTalentUses.${talentId}.value`]:
      uses - 1,

    [`system.tamerTalentUses.${talentId}.max`]:
      maximum,

    [`system.tamerTalentUses.${talentId}.recharge`]:
      "rest"
  });

  return {
    actionCost:
      cost,

    actionsBefore:
      available,

    actionsAfter:
      available - cost,

    usesBefore:
      uses,

    usesAfter:
      uses - 1
  };
}

export async function payPartnerInterruptAction(
  partner,
  {
    reason = ""
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

  /*
   * Fora de Combate não existe economia de
   * Ações de Interrupção para consumir.
   */
  if (!game?.combat?.started) {
    return {
      success: true,
      payer: "none",
      partner,
      tamer: null
    };
  }

  const tamer =
    await resolveLinkedTamerForPartner(
      partner
    );

  const partnerActions =
    Math.max(
      0,
      number(
        partner.system?.combat
          ?.actions?.value,
        0
      )
    );

  const tamerActions =
    Math.max(
      0,
      number(
        tamer?.system?.combat
          ?.actions?.value,
        0
      )
    );

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
    partnerActions >= 1;

  if (
    !dangerSenseAvailable &&
    !partnerCanPay
  ) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.DangerSense.NoActions",
        "Nem o parceiro nem o Digi-Escolhido possuem uma Ação disponível para esta Interrupção."
      )
    );

    return null;
  }

  let payer = "partner";

  if (dangerSenseAvailable) {
    payer =
      await new Promise((resolve) => {
        const buttons = {
          dangerSense: {
            label: localize(
              "DDA.TamerTalent.DangerSense.Use",
              "Usar Danger Sense"
            ),

            callback: () => {
              resolve("tamer");
            }
          }
        };

        if (partnerCanPay) {
          buttons.partner = {
            label: localize(
              "DDA.TamerTalent.DangerSense.PartnerPays",
              "Parceiro paga"
            ),

            callback: () => {
              resolve("partner");
            }
          };
        }

        buttons.cancel = {
          label: localize(
            "DDA.Button.Cancel",
            "Cancelar"
          ),

          callback: () => {
            resolve("");
          }
        };

        new Dialog({
          title: localize(
            "DDA.TamerTalent.DangerSense.Title",
            "Danger Sense"
          ),

          content: `
            <div class="dda-danger-sense-dialog">
              ${
                reason
                  ? `
                    <p>
                      ${escapeHtml(
                        formatI18n(
                          "DDA.TamerTalent.DangerSense.Reason",
                          { reason },
                          `Interrupção: ${reason}.`
                        )
                      )}
                    </p>
                  `
                  : ""
              }

              <p>
                ${escapeHtml(
                  formatI18n(
                    "DDA.TamerTalent.DangerSense.Prompt",
                    {
                      tamer:
                        tamer.name,

                      partner:
                        partner.name
                    },
                    `${tamer.name} pode gastar 1 Ação no lugar de ${partner.name}.`
                  )
                )}
              </p>
            </div>
          `,

          buttons,
          default: "dangerSense",

          close: () => {
            resolve("");
          }
        }).render(true);
      });

    if (!payer) {
      return null;
    }
  }

  if (payer === "tamer") {
    const currentActions =
      Math.max(
        0,
        number(
          tamer.system?.combat
            ?.actions?.value,
          0
        )
      );

    const currentUses =
      getDangerSenseUses(tamer);

    if (
      currentActions < 1 ||
      currentUses < 1
    ) {
      ui.notifications.warn(
        localize(
          "DDA.TamerTalent.DangerSense.PaymentFailed",
          "Danger Sense não está mais disponível."
        )
      );

      return null;
    }

    await tamer.update({
      "system.combat.actions.value":
        currentActions - 1,

      "system.tamerTalentUses.dangerSense.value":
        currentUses - 1,

      "system.tamerTalentUses.dangerSense.max":
        1,

      "system.tamerTalentUses.dangerSense.recharge":
        "rest"
    });

    return {
      success: true,
      payer: "tamer",
      partner,
      tamer,
      usedDangerSense: true
    };
  }

  const currentPartnerActions =
    Math.max(
      0,
      number(
        partner.system?.combat
          ?.actions?.value,
        0
      )
    );

  if (currentPartnerActions < 1) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.DangerSense.PaymentFailed",
        "A Interrupção não pôde ser paga."
      )
    );

    return null;
  }

  await partner.update({
    "system.combat.actions.value":
      currentPartnerActions - 1
  });

  return {
    success: true,
    payer: "partner",
    partner,
    tamer,
    usedDangerSense: false
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
  return Math.max(0, number(tamer?.system?.combat?.actions?.value, 0));
}

async function spendActions(tamer, amount) {
  const cost = Math.max(0, Math.floor(number(amount, 0)));
  const available = getAvailableActions(tamer);

  if (available < cost) {
    ui.notifications.warn(
      formatI18n(
        "DDA.TamerAction.Warning.NotEnoughActions",
        { required: cost, available },
        `Ações insuficientes: são necessárias ${cost}, mas apenas ${available} estão disponíveis.`
      )
    );

    return false;
  }

  await tamer.update({
    "system.combat.actions.value": available - cost
  });

  return true;
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
  const partnerData = tamer?.system?.partner ?? {};
  const uuid = String(
    partnerData.uuid ??
    partnerData.currentFormUuid ??
    ""
  ).trim();

  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);

    if (
      document?.documentName === "Actor" &&
      ["digimon", "npc"].includes(document.type)
    ) {
      return document;
    }
  } catch (error) {
    console.warn("DDA | Could not resolve the Tamer partner for an Action.", error);
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

  return await new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.TamerAction.TargetDialog.Title", "Escolher Digimon"),
      content: `
        <form class="dda-roll-dialog dda-tamer-action-target-dialog">
          <div class="form-group">
            <label>${localize("DDA.TamerAction.Target", "Alvo")}</label>
            <select name="targetIndex">${options}</select>
          </div>
        </form>
      `,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Confirm", "Confirmar"),
          callback: (html) => {
            const root = html instanceof jQuery ? html : $(html);
            const index = Number(root.find("select[name='targetIndex']").val() ?? -1);
            resolve(actors[index] ?? null);
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel", "Cancelar"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
  });
}

function isPartnerActor(tamer, actor) {
  const partnerData = tamer?.system?.partner ?? {};
  const uuids = new Set([
    partnerData.uuid,
    partnerData.currentFormUuid
  ].filter(Boolean));

  return uuids.has(actor?.uuid);
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
      hasUnlockedOfficialTamerTalent(tamer, "calculated") &&
      !wasUsedThisTurn(tamer, "calculated")
  };
}

async function promptPoolActionOptions(tamer, actionKey, baseAttributeKey) {
  const modeData = getActionModeOptions(tamer, baseAttributeKey);

  return await new Promise((resolve) => {
    new Dialog({
      title: localize(`DDA.TamerAction.${actionKey}.Title`, actionKey),
      content: `
        <form class="dda-roll-dialog dda-tamer-pool-action-dialog">
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
        </form>
      `,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Confirm", "Confirmar"),
          callback: (html) => {
            const root = html instanceof jQuery ? html : $(html);
            const mode = String(root.find("select[name='mode']").val() ?? "base");
            const requestedBolster = root.find("input[name='bolster']").is(":checked");
            const bolster = mode === "base" && requestedBolster;
            const calculated = bolster && root.find("input[name='calculated']").is(":checked");

            resolve({
              mode,
              bolster,
              calculated,
              attribute: mode === "highest" ? modeData.highest : modeData.base,
              actionCost: mode === "highest" || bolster ? 2 : 1,
              bolsterDice: bolster && !calculated ? 2 : 0,
              automaticSuccesses: calculated ? 1 : 0
            });
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel", "Cancelar"),
          callback: () => resolve(null)
        }
      },
      render: (html) => {
        const root = html instanceof jQuery ? html : $(html);
        const mode = root.find("select[name='mode']");
        const bolster = root.find("input[name='bolster']");
        const calculated = root.find("input[name='calculated']");

        const refresh = () => {
          const usesHighest = String(mode.val() ?? "base") === "highest";
          bolster.prop("disabled", usesHighest);

          if (usesHighest) {
            bolster.prop("checked", false);
            calculated.prop("checked", false);
          }

          calculated.prop(
            "disabled",
            usesHighest || !bolster.is(":checked")
          );
        };

        mode.on("change", refresh);
        bolster.on("change", refresh);
        refresh();
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
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

  const target = await chooseDigimonTarget(tamer);
  if (!target) return null;

  const partner = isPartnerActor(tamer, target);
  const charisma = getAttributeValue(tamer, "charisma");
  const highest = getHighestAttribute(tamer);
  const directTeam = hasUnlockedOfficialTamerTalent(tamer, "directTeam");

  const result = await new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.TamerAction.Direct.Title", "Direcionar"),
      content: `
        <form class="dda-roll-dialog dda-tamer-direct-dialog">
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
        </form>
      `,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Confirm", "Confirmar"),
          callback: (html) => {
            const root = html instanceof jQuery ? html : $(html);
            const statKey = String(root.find("select[name='statKey']").val() ?? "accuracy");
            const mode = String(root.find("select[name='mode']").val() ?? "charisma");
            const requestedBolster = root.find("input[name='bolster']").is(":checked");
            const bolster = mode === "charisma" && requestedBolster;
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
                (bolster ? 2 : 0) +
                (aimAssist ? 2 : 0) +
                otherPenalty
            );

            resolve({
              statKey,
              mode,
              bolster,
              aimAssist,
              sourceAttribute,
              otherPenalty,
              bonus,
              actionCost: mode === "highest" || bolster ? 2 : 1
            });
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel", "Cancelar"),
          callback: () => resolve(null)
        }
      },
      render: (html) => {
        const root = html instanceof jQuery ? html : $(html);
        const mode = root.find("select[name='mode']");
        const bolster = root.find("input[name='bolster']");

        const refresh = () => {
          const usesHighest = String(mode.val() ?? "charisma") === "highest";
          bolster.prop("disabled", usesHighest);
          if (usesHighest) bolster.prop("checked", false);
        };

        mode.on("change", refresh);
        refresh();
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
  });

  if (!result) return null;
  if (!(await spendActions(tamer, result.actionCost))) return null;

  const effect = buildSourceTurnEffect(tamer, {
    tag: EFFECT_TAG_DIRECT,
    label: localize("DDA.TamerAction.Direct.Effect", "Direcionado"),
    value: result.bonus,
    potency: result.bonus,
    poolStat: result.statKey,
    consumeOn: "matchingPool",
    targetIsPartner: partner,
    actionMode: result.mode,
    bolstered: result.bolster,
    otherDigimonPenalty: result.otherPenalty
  });

  await addActiveEffect(target, effect);
  await markUsedThisTurn(tamer, "direct", {
    targetUuid: target.uuid,
    targetName: target.name,
    statKey: result.statKey
  });

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

async function useReposition(tamer) {
  if (wasUsedThisTurn(tamer, "reposition")) {
    ui.notifications.warn(
      localize("DDA.TamerAction.Warning.RepositionOncePerTurn", "Reposicionar só pode ser usado uma vez por turno.")
    );
    return null;
  }

  const partner = await chooseDigimonTarget(tamer, { partnerOnly: true });
  if (!partner) return null;

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

  if (getAvailableActions(tamer) < options.actionCost) {
    await spendActions(tamer, options.actionCost);
    return null;
  }

  const rollResult = await rollAttributePool(tamer, "reposition", options);

  if (!(await spendActions(tamer, options.actionCost))) return null;

  await markUsedThisTurn(tamer, "reposition", {
    targetUuid: partner.uuid,
    successes: rollResult.totalSuccesses
  });

  if (options.calculated) {
    await markUsedThisTurn(tamer, "calculated", {
      action: "reposition"
    });
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

function getTemporaryWoundPath(actor) {
  if (actor?.type === "character") {
    return "system.derived.wounds.temp.value";
  }

  return "system.miscStats.wounds.temp.value";
}

function getTemporaryWounds(actor) {
  if (actor?.type === "character") {
    return Math.max(0, number(actor?.system?.derived?.wounds?.temp?.value, 0));
  }

  return Math.max(0, number(actor?.system?.miscStats?.wounds?.temp?.value, 0));
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

  const options = await promptPoolActionOptions(tamer, "Reinforce", "body");
  if (!options) return null;

  if (hasUnlockedOfficialTamerTalent(tamer, "bulkUp")) {
    options.automaticSuccesses += 1;
  }

  if (getAvailableActions(tamer) < options.actionCost) {
    await spendActions(tamer, options.actionCost);
    return null;
  }

  const rollResult = await rollAttributePool(tamer, "reinforce", options);

  if (!(await spendActions(tamer, options.actionCost))) return null;

  await markUsedThisTurn(tamer, "reinforce", {
    targetUuid: partner.uuid,
    successes: rollResult.totalSuccesses
  });

  if (options.calculated) {
    await markUsedThisTurn(tamer, "calculated", {
      action: "reinforce"
    });
  }

  if (rollResult.totalSuccesses > 0) {
    const currentTemp = getTemporaryWounds(partner);

    await partner.update({
      [getTemporaryWoundPath(partner)]: currentTemp + rollResult.totalSuccesses
    });

    await addActiveEffect(
      partner,
      buildSourceTurnEffect(tamer, {
        tag: EFFECT_TAG_REINFORCE,
        label: localize("DDA.TamerAction.Reinforce.Effect", "Reforçado"),
        value: rollResult.totalSuccesses,
        potency: rollResult.totalSuccesses,
        grantedTemporaryWounds: rollResult.totalSuccesses,
        consumeOn: "expiration"
      })
    );
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

  return await new Promise((resolve) => {
    new Dialog({
      title: localize(
        "DDA.TamerTalent.EnemyScan.ChooseTarget",
        "Escolher inimigo"
      ),

      content: `
        <form class="dda-roll-dialog">
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
        </form>
      `,

      buttons: {
        confirm: {
          label: localize(
            "DDA.Button.Confirm",
            "Confirmar"
          ),

          callback: (html) => {
            const root =
              html instanceof jQuery
                ? html
                : $(html);

            const index = Number(
              root.find(
                "[name='targetIndex']"
              ).val() ?? -1
            );

            resolve(
              actors[index] ??
              null
            );
          }
        },

        cancel: {
          label: localize(
            "DDA.Button.Cancel",
            "Cancelar"
          ),

          callback: () => {
            resolve(null);
          }
        }
      },

      default: "confirm",

      close: () => {
        resolve(null);
      }
    }).render(true);
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

  return await new Promise((resolve) => {
    new Dialog({
      title: localize(
        "DDA.TamerAction.Hold.Title",
        "Segurar"
      ),

      content: `
        <form class="dda-roll-dialog dda-tamer-hold-dialog">
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
        </form>
      `,

      buttons: {
        confirm: {
          label: localize(
            "DDA.Button.Confirm",
            "Confirmar"
          ),

          callback: (html) => {
            const root = html instanceof jQuery
              ? html
              : $(html);

            resolve({
              trigger: String(
                root.find("[name='trigger']").val() ??
                ""
              ).trim(),

              responseAction: String(
                root.find(
                  "[name='responseAction']"
                ).val() ?? "attack"
              ),

              responseDetail: String(
                root.find(
                  "[name='responseDetail']"
                ).val() ?? ""
              ).trim(),

              intelligence,
              bestLaidPlans
            });
          }
        },

        cancel: {
          label: localize(
            "DDA.Button.Cancel",
            "Cancelar"
          ),

          callback: () => resolve(null)
        }
      },

      default: "confirm",
      close: () => resolve(null)
    }).render(true);
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

  const updated =
    await updateActorActiveEffect(
      partner,
      effect.id,
      {
        state: "active",
        activatedAt:
          new Date().toISOString()
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
        cancelled: false
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
  partner = null
) {
  const skillOptions =
    getTamerSkillOptions(tamer);

  const jointEffortAvailable =
    Boolean(
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

  return await new Promise((resolve) => {
    new Dialog({
      title: localize(
        "DDA.TamerAction.Teamwork.Title",
        "Trabalho em Equipe"
      ),

      content: `
        <form class="dda-roll-dialog dda-teamwork-setup-dialog">
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
        </form>
      `,
render: (html) => {
  if (!jointEffortAvailable) return;

  const root =
    html instanceof jQuery
      ? html
      : $(html);

  const skillSelect =
    root.find(
      "[name='skillKey']"
    );

  const jointEffortInput =
    root.find(
      "[name='jointEffort']"
    );

  const synchronizeJointEffort =
    () => {
      const validSkill =
        String(
          skillSelect.val() ?? ""
        ) === "featsOfStrength";

      jointEffortInput.prop(
        "disabled",
        !validSkill
      );

      if (!validSkill) {
        jointEffortInput.prop(
          "checked",
          false
        );
      }
    };

  skillSelect.on(
    "change",
    synchronizeJointEffort
  );

  synchronizeJointEffort();
},
      buttons: {
        confirm: {
          label: localize(
            "DDA.Button.Confirm",
            "Confirmar"
          ),

          callback: (html) => {
            const root =
              html instanceof jQuery
                ? html
                : $(html);

            resolve({
              task: String(
                root.find(
                  "[name='task']"
                ).val() ?? ""
              ).trim(),

              skillKey: String(
                root.find(
                  "[name='skillKey']"
                ).val() ?? ""
              ),

              mainTn: Math.max(
                1,
                number(
                  root.find(
                    "[name='mainTn']"
                  ).val(),
                  12
                )
              ),

helperTn: Math.min(
  20,
  Math.max(
    14,
    number(
      root.find(
        "[name='helperTn']"
      ).val(),
      14
    )
  )
),

jointEffort: Boolean(
  root.find(
    "[name='jointEffort']"
  ).prop("checked")
)
            });
          }
        },

        cancel: {
          label: localize(
            "DDA.Button.Cancel",
            "Cancelar"
          ),

          callback: () =>
            resolve(null)
        }
      },

      default: "confirm",

      close: () =>
        resolve(null)
    }).render(true);
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

  return await new Promise((resolve) => {
    new Dialog({
      title: localize(
        "DDA.TamerAction.Teamwork.ChooseHelper",
        "Escolher ajudante"
      ),

      content: `
        <form class="dda-roll-dialog">
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
        </form>
      `,

      buttons: {
        confirm: {
          label: localize(
            "DDA.Button.Confirm",
            "Confirmar"
          ),

          callback: (html) => {
            const root =
              html instanceof jQuery
                ? html
                : $(html);

            const index = Number(
              root.find(
                "[name='helperIndex']"
              ).val() ?? -1
            );

            resolve(
              candidates[index] ?? null
            );
          }
        },

        cancel: {
          label: localize(
            "DDA.Button.Cancel",
            "Cancelar"
          ),

          callback: () =>
            resolve(null)
        }
      },

      default: "confirm",

      close: () =>
        resolve(null)
    }).render(true);
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

  return await new Promise((resolve) => {
    new Dialog({
      title: localize(
        "DDA.TamerAction.Teamwork.ChooseSkill",
        "Escolher Perícia de ajuda"
      ),

      content: `
        <form class="dda-roll-dialog">
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
        </form>
      `,

      buttons: {
        confirm: {
          label: localize(
            "DDA.Button.Confirm",
            "Confirmar"
          ),

          callback: (html) => {
            const root =
              html instanceof jQuery
                ? html
                : $(html);

            const mode = String(
              root.find(
                "[name='skillMode']"
              ).val() ?? "required"
            );

            resolve({
              skillKey:
                mode === "knowledge"
                  ? "knowledge"
                  : requestedSkillKey,

              academicAdviceUsed:
                mode === "knowledge"
            });
          }
        },

        cancel: {
          label: localize(
            "DDA.Button.Cancel",
            "Cancelar"
          ),

          callback: () =>
            resolve(null)
        }
      },

      default: "confirm",

      close: () =>
        resolve(null)
    }).render(true);
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

export async function openTamerActionMenu(tamer) {
  if (!tamer || tamer.type !== "character") {
    ui.notifications.warn(
      localize(
        "DDA.TamerAction.Warning.TamerOnly",
        "Apenas Tamers podem usar este menu."
      )
    );

    return null;
  }

  const peakPerformanceUnlocked =
    hasUnlockedOfficialTamerTalent(
      tamer,
      "peakPerformance"
    );

  const enemyScanUnlocked =
    hasUnlockedOfficialTamerTalent(
      tamer,
      "enemyScan"
    );

  return await new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.TamerAction.Menu.Title", "Ações do Tamer"),
      content: `
        <div class="dda-tamer-action-menu">
          <p>${localize("DDA.TamerAction.Menu.Hint", "Escolha uma Ação do Tamer.")}</p>
          <div class="dda-tamer-action-menu-grid">
            <button type="button" data-action-key="direct">
              <strong>${localize("DDA.TamerAction.Direct.Title", "Direcionar")}</strong>
              <small>${localize("DDA.TamerAction.Direct.Summary", "Bônus na próxima Precisão ou Esquiva de um Digimon.")}</small>
            </button>
            <button type="button" data-action-key="reposition">
              <strong>${localize("DDA.TamerAction.Reposition.Title", "Reposicionar")}</strong>
              <small>${localize("DDA.TamerAction.Reposition.Summary", "Concede movimento imediato ao parceiro.")}</small>
            </button>
            <button type="button" data-action-key="reinforce">
              <strong>${localize("DDA.TamerAction.Reinforce.Title", "Reforçar")}</strong>
              <small>${localize("DDA.TamerAction.Reinforce.Summary", "Concede Ferimentos Temporários ao parceiro.")}</small>
            </button>
            <button type="button" data-action-key="hold">
              <strong>
                ${localize(
                  "DDA.TamerAction.Hold.Title",
                  "Segurar"
                )}
              </strong>

              <small>
                ${localize(
                  "DDA.TamerAction.Hold.Summary",
                  "Declara um gatilho e prepara uma resposta do parceiro."
                )}
              </small>
            </button>

            <button type="button" data-action-key="teamwork">
            <strong>
              ${localize(
                "DDA.TamerAction.Teamwork.Title",
                "Trabalho em Equipe"
              )}
            </strong>

            <small>
              ${localize(
                "DDA.TamerAction.Teamwork.Summary",
                "Abre um Teste principal para receber ajuda de outros Digi-Escolhidos."
              )}
            </small>
          </button>

${
  peakPerformanceUnlocked
    ? `
      <button
        type="button"
        data-action-key="peakPerformance"
      >
        <strong>
          ${localize(
            "DDA.TamerTalent.PeakPerformance.Title",
            "Peak Performance"
          )}
        </strong>

        <small>
          ${localize(
            "DDA.TamerTalent.PeakPerformance.Summary",
            "Concede [BASTION 2] a um Digimon aliado."
          )}
        </small>
      </button>
    `
    : ""
}

${
  enemyScanUnlocked
    ? `
      <button
        type="button"
        data-action-key="enemyScan"
      >
        <strong>
          ${localize(
            "DDA.TamerTalent.EnemyScan.Title",
            "Enemy Scan"
          )}
        </strong>

        <small>
          ${localize(
            "DDA.TamerTalent.EnemyScan.Summary",
            "Aplica [DEBILITATE] em um Digimon inimigo."
          )}
        </small>
      </button>
    `
    : ""
}

          </div>
          <p class="dda-tamer-action-bolster-note">
            <strong>${localize("DDA.TamerAction.Bolster", "Fortalecer")}:</strong>
            ${localize("DDA.TamerAction.BolsterIntegrated", "é oferecido dentro das Ações compatíveis, pois modifica a própria Ação em vez de ocorrer separadamente.")}
          </p>
        </div>
      `,
      buttons: {
        close: {
          label: localize("DDA.Button.Close", "Fechar"),
          callback: () => resolve(null)
        }
      },
      render: (html) => {
        const root = html instanceof jQuery ? html : $(html);

        root.find("[data-action-key]").on("click", async (event) => {
          event.preventDefault();
          const actionKey = String(event.currentTarget.dataset.actionKey ?? "");
          let result = null;

          if (actionKey === "direct") {
            result = await useDirect(tamer);
          }

          if (actionKey === "reposition") {
            result = await useReposition(tamer);
          }

          if (actionKey === "reinforce") {
            result = await useReinforce(tamer);
          }

          if (actionKey === "hold") {
            result = await useHold(tamer);
          }

          if (actionKey === "teamwork") {
            result = await useTeamwork(tamer);
          }

          if (
  actionKey ===
  "peakPerformance"
) {
  result =
    await usePeakPerformance(
      tamer
    );
}

if (
  actionKey ===
  "enemyScan"
) {
  result =
    await useEnemyScan(
      tamer
    );
}

          resolve(result);
          root.closest(".window-app").find(".window-header .close").trigger("click");
        });
      },
      default: "close",
      close: () => resolve(null)
    }, {
      classes: ["dda", "dda-tamer-action-dialog"]
    }).render(true);
  });
}

export function prepareTamerActionPoolOptions(
  actor,
  statKey,
  options = {}
) {
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
  if (!actor) return "";
  if (actor.type === "character") return actor.uuid;

  return String(actor.system?.tamer?.uuid ?? "").trim();
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
  const reinforceAmount = expired
    .filter((effect) => String(effect.tag ?? "") === EFFECT_TAG_REINFORCE)
    .reduce((total, effect) => total + Math.max(0, number(effect.grantedTemporaryWounds, 0)), 0);

  const update = {
    "system.effects.active": remaining
  };

  if (reinforceAmount > 0) {
    update[getTemporaryWoundPath(actor)] = Math.max(
      0,
      getTemporaryWounds(actor) - reinforceAmount
    );
  }

  await actor.update(update);
  actor.sheet?.render(false);
  return true;
}

async function expireSourceTurnEffects(combat) {
  const currentActor = combat?.combatant?.actor;
  const sourceTamerUuid = getTurnSourceTamerUuid(currentActor);

  if (!sourceTamerUuid) return;

  const currentSignature = getCombatTurnSignature();

  for (const actor of getAllRuntimeActors()) {
    try {
      await removeExpiredSourceTurnEffects(actor, sourceTamerUuid, currentSignature);
    } catch (error) {
      console.warn("DDA | Could not expire a Tamer Action effect.", error, actor);
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
