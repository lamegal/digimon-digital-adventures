import { withDDAMovementContext } from "../canvas/movement-context.js";
import {
  hasUnlockedOfficialTamerTalent
} from "./tamer-resources.js";

import {
  areActorsAllies,
  getActorSv
} from "./quality-automation.js";

import {
  getTamerTalentActivationSignature,
  resolveTamerForPartner,
  resolveTamerTalentPartner
} from "./tamer-talent-runtime.js";

import {
  getActorActionState,
  spendActorActions
} from "../combat/action-economy.js";

import {
  applyLuckyNumberReward
} from "../rolls/lucky-number.js";

const SYSTEM_ID = "digimon-digital-adventures";
const BULLRUSH_PATH = "system.combat.tamerTalentRuntime.bullrush";
const CHALLENGER_PATH = "system.combat.tamerTalentRuntime.challenger";
const REVITALIZE_PATH = "system.combat.tamerTalentRuntime.revitalizeDefeat";
const OVERLOOKED_TAG = "overlookedBlind";
let hooksRegistered = false;

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
    ? en
    : pt;
}

function frenzyBlocksTamerInfluence(actor) {
  return Boolean(game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(actor));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeTag(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

function actorReferenceKeys(actor) {
  return new Set([
    actor?.uuid,
    actor?.id,
    actor?.id ? `Actor.${actor.id}` : "",
    actor?.parent?.uuid,
    actor?.parent?.id
  ].filter(Boolean).map(String));
}

function actorsMatch(left, right) {
  if (!left || !right) return false;
  const rightKeys = actorReferenceKeys(right);
  return [...actorReferenceKeys(left)].some((key) => rightKeys.has(key));
}

function actorIdentityKey(actor) {
  return String(
    actor?.parent?.actorId ??
    actor?.token?.actorId ??
    actor?.id ??
    actor?.uuid ??
    ""
  ).trim();
}

function runtimeActors() {
  const actors = [
    ...(game?.actors?.contents ?? []),
    ...((canvas?.tokens?.placeables ?? []).map((token) => token.actor).filter(Boolean))
  ];

  return [...new Map(
    actors.map((actor) => [actorIdentityKey(actor), actor])
  ).values()];
}

async function resolveActor(reference = "") {
  const clean = String(reference ?? "").trim();
  if (!clean) return null;

  try {
    const document = await fromUuid(clean);
    if (document?.documentName === "Token") return document.actor ?? null;
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Could not resolve a combat-survival Talent Actor.", error);
    return null;
  }
}

function currentCombatId() {
  return String(game?.combat?.id ?? "");
}

function talentUsedThisCombat(tamer, talentId) {
  const state = tamer?.system?.combat?.tamerTalentUsage?.[talentId];
  return Boolean(
    game?.combat?.started &&
    state &&
    String(state.combatId ?? "") === currentCombatId()
  );
}

function officialTalentUses(tamer, talentId) {
  const stored = tamer?.system?.tamerTalentUses?.[talentId];
  return Math.max(0, Math.floor(number(stored?.value, 1)));
}

function buildTalentUsage(tamer, talentId) {
  const usage = foundry.utils.deepClone(
    tamer?.system?.combat?.tamerTalentUsage ?? {}
  );

  usage[talentId] = {
    combatId: currentCombatId(),
    round: number(game?.combat?.round, 0),
    turn: number(game?.combat?.turn, -1),
    frequency: "oncePerCombat",
    usedAt: new Date().toISOString()
  };

  return usage;
}

async function commitOncePerCombatTalent(tamer, talentId, actionCost = 0) {
  if (!tamer || talentUsedThisCombat(tamer, talentId)) return null;

  const uses = officialTalentUses(tamer, talentId);
  if (uses <= 0) return null;

  const additionalUpdates = {
    "system.combat.tamerTalentUsage": buildTalentUsage(tamer, talentId),
    [`system.tamerTalentUses.${talentId}.value`]: Math.max(0, uses - 1),
    [`system.tamerTalentUses.${talentId}.max`]: 1,
    [`system.tamerTalentUses.${talentId}.recharge`]: "combat"
  };

  if (actionCost > 0) {
    return spendActorActions(tamer, actionCost, {
      requireActiveUnit: false,
      notify: true,
      additionalUpdates
    });
  }

  await tamer.update(additionalUpdates);
  return { actionCost: 0, actionsBefore: getActorActionState(tamer).value };
}

function getUnitPairActors(unit) {
  return {
    tamer: unit?.members?.find((member) => member.role === "tamer")?.combatant?.actor ?? null,
    partner: unit?.members?.find((member) => member.role === "digimon")?.combatant?.actor ?? null
  };
}

function unitPrimaryActor(unit) {
  return unit?.primaryActor ??
    unit?.members?.find((member) => member.role === "digimon")?.combatant?.actor ??
    unit?.members?.[0]?.combatant?.actor ??
    null;
}

function temporaryWoundPath(actor) {
  return actor?.type === "character"
    ? "system.derived.wounds.temp"
    : "system.miscStats.wounds.temp";
}

function woundPath(actor) {
  return actor?.type === "character"
    ? "system.derived.wounds"
    : "system.miscStats.wounds";
}

// ---------------------------------------------------------------------------
// Bullrush
// ---------------------------------------------------------------------------

async function activateBullrush(tamer) {
  const partner = await resolveTamerTalentPartner(tamer);
  if (!partner) {
    return {
      success: false,
      applied: false,
      message: text("O Partner vinculado não foi encontrado.", "The linked Partner could not be found.")
    };
  }
  if (frenzyBlocksTamerInfluence(partner)) {
    return {
      success: false,
      applied: false,
      message: text(
        `[FRENZY]: ${partner.name} não pode ser afetado por esta Ordem Especial.`,
        `[FRENZY]: ${partner.name} cannot be affected by this Special Order.`
      )
    };
  }

  const tracker = game?.dda?.movementTracker;
  if (!tracker?.beginActionMovement) {
    return {
      success: false,
      applied: false,
      message: text("O rastreador de Movimento não está disponível.", "The Movement tracker is unavailable.")
    };
  }

  const state = {
    active: true,
    sourceTamerUuid: tamer.uuid,
    sourceTamerName: tamer.name,
    combatId: currentCombatId(),
    round: number(game?.combat?.round, 0),
    turn: number(game?.combat?.turn, -1),
    activationSignature: getTamerTalentActivationSignature(partner),
    freeDifficultMoveRemaining: 1,
    difficultMoveCostReduction: 1,
    createdAt: new Date().toISOString()
  };

  await partner.update({ [BULLRUSH_PATH]: state });

  const started = await tracker.beginActionMovement(partner, {
    actionCost: 1,
    actionKey: "difficultMove",
    difficultTerrain: true,
    label: "THIS TRAIN WON’T STOP",
    source: "tamerTalentBullrush"
  });

  if (!started) {
    await partner.update({ "system.combat.tamerTalentRuntime.-=bullrush": null });
    return {
      success: false,
      applied: false,
      message: text("O Movimento Difícil imediato não pôde ser iniciado.", "The immediate Difficult Move could not be started.")
    };
  }

  return {
    success: true,
    applied: true,
    targetName: partner.name,
    message: text(
      `${partner.name} iniciou um Movimento Difícil gratuito. Outros Movimentos Difíceis custam 1 Ação a menos até o fim da ativação.`,
      `${partner.name} began a free Difficult Move. Further Difficult Moves cost 1 fewer Action until the end of the activation.`
    )
  };
}

// ---------------------------------------------------------------------------
// Challenger
// ---------------------------------------------------------------------------

export async function processChallengerInitiative(unit, orderedUnits = [], combat = game?.combat) {
  const { tamer, partner } = getUnitPairActors(unit);
  if (!combat?.started || !tamer || !partner) return null;
  if (!hasUnlockedOfficialTamerTalent(tamer, "challenger")) return null;
  if (talentUsedThisCombat(tamer, "challenger")) return null;
  if (officialTalentUses(tamer, "challenger") <= 0) return null;

  const willpower = Math.max(
    0,
    Math.floor(number(tamer.system?.attributes?.willpower?.value, 0))
  );

  const roll = willpower > 0
    ? await new Roll(`${willpower}d6`).evaluate()
    : null;

  const diceResults = (roll?.dice?.[0]?.results ?? [])
    .filter((entry) => entry?.active !== false)
    .map((entry) => number(entry?.result, 0));

  await applyLuckyNumberReward(tamer, diceResults, {
    source: "tamerTalent:challenger"
  });

  const successes = diceResults.filter((result) => result >= 5).length;
  const highestEnemySv = Math.max(
    0,
    ...orderedUnits
      .filter((candidate) => candidate?.side !== unit?.side)
      .map((candidate) => number(getActorSv(unitPrimaryActor(candidate)), 0))
  );
  const granted = Math.min(5, Math.max(0, successes + highestEnemySv));

  const tempPath = temporaryWoundPath(partner);
  const temp = foundry.utils.getProperty(partner, tempPath) ?? {};
  const currentTemp = Math.max(0, number(temp.value, 0));
  const previousSource = String(temp.source ?? "").trim();

  await partner.update({
    [`${tempPath}.value`]: currentTemp + granted,
    [`${tempPath}.source`]: [previousSource, "Challenger"].filter(Boolean).join(" + "),
    [`${tempPath}.duration`]: "combat",
    [CHALLENGER_PATH]: {
      active: granted > 0,
      combatId: combat.id,
      sourceTamerUuid: tamer.uuid,
      granted,
      remaining: granted,
      createdAt: new Date().toISOString()
    }
  });

  await commitOncePerCombatTalent(tamer, "challenger", 0);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    rolls: roll ? [roll] : [],
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive dda-challenger-card">
        <h2>NEVER BACK DOWN</h2>
        <ul class="dda-effect-list">
          <li>${text("Vontade", "Willpower")}: <strong>${willpower}</strong>.</li>
          <li>${text("Sucessos", "Successes")}: <strong>${successes}</strong>.</li>
          <li>${text("Maior SV inimigo", "Highest Enemy SV")}: <strong>${highestEnemySv}</strong>.</li>
          <li>${text("Caixas Temporárias", "Temporary Wound Boxes")}: <strong>+${granted}</strong> (${currentTemp} → ${currentTemp + granted}).</li>
        </ul>
      </div>
    `
  });

  return { used: true, tamer, partner, roll, successes, highestEnemySv, granted };
}

export async function consumeChallengerTemporaryWounds(actor, amount = 0) {
  const state = foundry.utils.deepClone(
    actor?.system?.combat?.tamerTalentRuntime?.challenger ?? {}
  );
  if (!state?.active || String(state.combatId ?? "") !== currentCombatId()) return 0;

  const consumed = Math.min(
    Math.max(0, Math.floor(number(state.remaining, 0))),
    Math.max(0, Math.floor(number(amount, 0)))
  );
  if (consumed <= 0) return 0;

  state.remaining = Math.max(0, number(state.remaining, 0) - consumed);
  state.active = state.remaining > 0;
  state.updatedAt = new Date().toISOString();
  await actor.update({ [CHALLENGER_PATH]: state });
  return consumed;
}

async function clearChallengerTemporaryWounds(combat) {
  const combatId = String(combat?.id ?? "");
  if (!combatId || !game?.user?.isGM) return;

  for (const actor of runtimeActors()) {
    const state = actor?.system?.combat?.tamerTalentRuntime?.challenger;
    if (!state || String(state.combatId ?? "") !== combatId) continue;

    const remaining = Math.max(0, Math.floor(number(state.remaining, 0)));
    const tempPath = temporaryWoundPath(actor);
    const temp = foundry.utils.getProperty(actor, tempPath) ?? {};
    const current = Math.max(0, number(temp.value, 0));

    await actor.update({
      [`${tempPath}.value`]: Math.max(0, current - remaining),
      [CHALLENGER_PATH]: {
        ...foundry.utils.deepClone(state),
        active: false,
        remaining: 0,
        endedAt: new Date().toISOString()
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Thick Skin and Survival Instinct
// ---------------------------------------------------------------------------

function findSceneTokenForActor(actor) {
  if (!actor) return null;

  return (canvas?.tokens?.placeables ?? []).find((token) => {
    return token?.actor && actorsMatch(token.actor, actor);
  }) ?? null;
}

async function applyReflectedForcedMovement({
  defender,
  source,
  direction = "push",
  spaces = 0
} = {}) {
  const reflectorToken = findSceneTokenForActor(defender);
  const sourceToken = findSceneTokenForActor(source);

  if (!reflectorToken?.document || !sourceToken?.document) {
    return false;
  }

  const reflectorCenter = reflectorToken.center;
  const sourceCenter = sourceToken.center;
  const dx = number(sourceCenter?.x, 0) - number(reflectorCenter?.x, 0);
  const dy = number(sourceCenter?.y, 0) - number(reflectorCenter?.y, 0);
  const length = Math.hypot(dx, dy);

  if (length <= 0) return false;

  const gridSize = Math.max(1, number(canvas?.grid?.size, 100));
  const sign = direction === "pull" ? -1 : 1;
  const requested = Math.max(0, Math.floor(number(spaces, 0)));
  const movedSpaces = direction === "pull"
    ? Math.min(
        requested,
        Math.max(0, Math.ceil(length / gridSize) - 1)
      )
    : requested;

  if (movedSpaces <= 0) return false;

  const destination = {
    x:
      number(sourceToken.document.x, 0) +
      (dx / length) * gridSize * movedSpaces * sign,
    y:
      number(sourceToken.document.y, 0) +
      (dy / length) * gridSize * movedSpaces * sign
  };

  const snapped = canvas.grid?.getSnappedPoint
    ? canvas.grid.getSnappedPoint(destination, {
        mode:
          CONST.GRID_SNAPPING_MODES?.CENTER
      })
    : destination;

  const forcedDestination = {
    x: Math.round(number(snapped?.x, destination.x)),
    y: Math.round(number(snapped?.y, destination.y))
  };

  try {
    const clashAutomation = await import("../combat/clash.js");
    const clashResolution =
      await clashAutomation.handleClashForcedMovement?.({
        defender: source,
        source: defender,
        direction,
        potency: movedSpaces,
        destination: forcedDestination,
        suppressThickSkin: true
      });

    if (clashResolution?.handled) {
      return Boolean(clashResolution.moved);
    }
  } catch (error) {
    console.warn(
      "DDA | Thick Skin reflected Clash movement failed.",
      error
    );
  }

  await sourceToken.document.update(
    forcedDestination,
    withDDAMovementContext({
      ddaForcedMovement: true,
      ddaThickSkinReflection: true
    }, {
      mode: "forced", movementBudget: "none", voluntary: false, reactions: true,
      traversal: true, source: "thickSkinReflection", unwilling: true
    })
  );

  return true;
}

async function chooseThickSkinMode(tamer, source, spaces, direction) {
  const actions = getActorActionState(tamer).value;
  if (actions < 1) return "";

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-defensive-quality-window", "dda-tamer-talent-reaction-dialog"],
    position: { width: 480, height: "auto" },
    window: { title: "NO, YOU MOVE" },
    modal: true,
    content: `
      <div class="dda-confirm-dialog">
        <p><strong>${escapeHtml(tamer.name)}</strong>: ${text(
          `o Partner seria movido ${spaces} Espaço(s) por [${String(direction).toUpperCase()}].`,
          `the Partner would be moved ${spaces} Space(s) by [${String(direction).toUpperCase()}].`
        )}</p>
        <p>${text("Escolha como usar Thick Skin.", "Choose how to use Thick Skin.")}</p>
      </div>
    `,
    buttons: [
      {
        action: "ignore",
        label: text("Ignorar movimento — 1 Ação", "Ignore movement — 1 Action"),
        icon: "fa-solid fa-shield",
        default: true,
        callback: () => "ignore"
      },
      ...(source && actions >= 2 ? [{
        action: "reflect",
        label: text("Refletir movimento — 2 Ações", "Reflect movement — 2 Actions"),
        icon: "fa-solid fa-arrows-left-right",
        callback: () => "reflect"
      }] : []),
      {
        action: "cancel",
        label: text("Não usar", "Do not use"),
        icon: "fa-solid fa-xmark",
        callback: () => ""
      }
    ],
    rejectClose: false,
    close: () => ""
  });

  return String(result ?? "");
}

export async function maybeResolveThickSkinForcedMovement({
  defender,
  source = null,
  direction = "push",
  spaces = 0
} = {}) {
  if (!game?.combat?.started || !defender || spaces <= 0) return null;
  if (frenzyBlocksTamerInfluence(defender)) return null;

  const tamer = await resolveTamerForPartner(defender);
  if (!tamer || !hasUnlockedOfficialTamerTalent(tamer, "thickSkin")) return null;
  if (talentUsedThisCombat(tamer, "thickSkin") || officialTalentUses(tamer, "thickSkin") <= 0) return null;
  if (!game.user?.isGM && !tamer.isOwner && !defender.isOwner) return null;

  const mode = await chooseThickSkinMode(tamer, source, spaces, direction);
  if (!mode) return null;

  const actionCost = mode === "reflect" ? 2 : 1;
  const payment = await commitOncePerCombatTalent(tamer, "thickSkin", actionCost);
  if (!payment) return null;

  const reflectedMovement = mode === "reflect"
    ? await applyReflectedForcedMovement({
        defender,
        source,
        direction,
        spaces
      })
    : false;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive">
        <h2>NO, YOU MOVE</h2>
        <p>${mode === "reflect"
          ? text(
              `${defender.name} ignorou o movimento e o refletiu contra ${source?.name ?? "a fonte"}.`,
              `${defender.name} ignored the movement and reflected it against ${source?.name ?? "the source"}.`
            )
          : text(
              `${defender.name} ignorou completamente o movimento forçado.`,
              `${defender.name} completely ignored the forced movement.`
            )}</p>
      </div>
    `
  });

  return {
    used: true,
    reflected: mode === "reflect",
    reflectedMovement,
    tamer,
    defender,
    source,
    direction,
    spaces
  };
}

export async function maybeApplySurvivalInstinctDamage(actor, damage, options = {}) {
  const amount = Math.max(0, Math.floor(number(damage, 0)));
  const attacker = options?.attacker ?? null;
  if (!game?.combat?.started || amount <= 0 || !actor || !attacker) return null;
  if (!["digimon", "npc"].includes(String(actor.type ?? ""))) return null;
  if (areActorsAllies(actor, attacker)) return null;
  if (frenzyBlocksTamerInfluence(actor)) return null;

  const tamer = await resolveTamerForPartner(actor);
  if (!tamer || !hasUnlockedOfficialTamerTalent(tamer, "survivalInstinct")) return null;
  if (talentUsedThisCombat(tamer, "survivalInstinct") || officialTalentUses(tamer, "survivalInstinct") <= 0) return null;
  if (getActorActionState(tamer).value < 1) return null;
  if (!game.user?.isGM && !tamer.isOwner && !actor.isOwner) return null;

  const useIt = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-defensive-quality-window", "dda-tamer-talent-reaction-dialog"],
    window: { title: "FLOW WITH IT" },
    content: `
      <div class="dda-confirm-dialog">
        <p><strong>${escapeHtml(actor.name)}</strong> ${text(
          `sofreria ${amount} de Dano de ${escapeHtml(attacker.name)}.`,
          `would take ${amount} Damage from ${escapeHtml(attacker.name)}.`
        )}</p>
        <p>${text(
          "Gastar 1 Ação do Tamer para remover o Dano Inalterável associado e reduzir pela metade o restante?",
          "Spend 1 Tamer Action to remove associated Unalterable Damage and halve the remainder?"
        )}</p>
      </div>
    `,
    yes: { label: text("Usar Survival Instinct", "Use Survival Instinct") },
    no: { label: text("Receber dano normal", "Take normal damage") },
    rejectClose: false,
    modal: true
  });
  if (!useIt) return null;

  const payment = await commitOncePerCombatTalent(tamer, "survivalInstinct", 1);
  if (!payment) return null;

  const originalUnalterable = options?.unalterable
    ? amount
    : Math.min(amount, Math.max(0, Math.floor(number(options?.unalterablePortion, 0))));
  const shiningReduction = Math.max(0, Math.floor(number(options?.shiningReduction, 0)));
  const remainingUnalterable = Math.max(0, originalUnalterable - shiningReduction);
  const normalDamage = Math.max(0, amount - remainingUnalterable);
  const adjustedDamage = Math.floor(normalDamage / 2);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive">
        <h2>FLOW WITH IT</h2>
        <ul class="dda-effect-list">
          <li>${text("Dano após Armadura", "Damage after Armor")}: <strong>${amount}</strong>.</li>
          <li>${text("Dano Inalterável ignorado", "Unalterable Damage ignored")}: <strong>${remainingUnalterable}</strong>.</li>
          <li>${text("Dano final", "Final Damage")}: <strong>${adjustedDamage}</strong>.</li>
        </ul>
      </div>
    `
  });

  return {
    used: true,
    tamer,
    actor,
    originalDamage: amount,
    unalterableIgnored: remainingUnalterable,
    normalDamage,
    damage: adjustedDamage
  };
}

// ---------------------------------------------------------------------------
// Revitalize
// ---------------------------------------------------------------------------

export async function recordRevitalizeDefeatState(actor) {
  if (!actor || !["digimon", "npc"].includes(String(actor.type ?? ""))) return null;
  const tamer = await resolveTamerForPartner(actor);
  if (!tamer || !hasUnlockedOfficialTamerTalent(tamer, "revitalize")) return null;

  const currentFormReference = String(
    actor.system?.evolution?.currentFormUuid ??
    actor.system?.evolution?.sourceFormUuid ??
    actor.uuid ??
    ""
  ).trim();

  const state = {
    active: true,
    combatId: currentCombatId(),
    partnerUuid: actor.uuid,
    formReference: currentFormReference,
    formName: actor.system?.evolution?.currentFormName ?? actor.name,
    stage: actor.system?.stage ?? "",
    recordedEffects: foundry.utils.deepClone(actor.system?.effects?.active ?? []),
    recordedAt: new Date().toISOString()
  };

  await actor.update({ [REVITALIZE_PATH]: state });
  return state;
}

async function activateRevitalize(tamer) {
  const partner = await resolveTamerTalentPartner(tamer);
  if (!partner) {
    return { success: false, applied: false, message: text("O Partner não foi encontrado.", "The Partner could not be found.") };
  }
  if (frenzyBlocksTamerInfluence(partner)) {
    return {
      success: false,
      applied: false,
      message: text(
        `[FRENZY]: ${partner.name} não pode ser afetado por esta Ordem Especial.`,
        `[FRENZY]: ${partner.name} cannot be affected by this Special Order.`
      )
    };
  }

  const wounds = foundry.utils.getProperty(partner, woundPath(partner)) ?? {};
  const currentWounds = Math.max(0, number(wounds.value, 0));
  const defaultStage = String(partner.system?.evolution?.defaultStage ?? "").trim();
  const currentStage = String(partner.system?.stage ?? "").trim();
  const defeatState = partner.system?.combat?.tamerTalentRuntime?.revitalizeDefeat ?? null;
  const regressedAfterDefeat = Boolean(
    defeatState?.active &&
    defaultStage &&
    currentStage === defaultStage &&
    String(defeatState.stage ?? "") !== currentStage
  );

  if (currentWounds > 0 && !regressedAfterDefeat) {
    return {
      success: false,
      applied: false,
      message: text(
        "Revitalize exige que o Partner esteja com 0 Caixas ou tenha retornado ao Estágio Padrão após ser derrotado.",
        "Revitalize requires the Partner to have 0 Wound Boxes or to have returned to its Default Stage after being Defeated."
      )
    };
  }

  const formReference = String(defeatState?.formReference ?? "").trim();
  if (regressedAfterDefeat && !formReference) {
    return {
      success: false,
      applied: false,
      message: text("A forma da derrota não pôde ser identificada.", "The form at defeat could not be identified.")
    };
  }

  if (regressedAfterDefeat) {
    const { restorePartnerFormForRevitalize } = await import("../combat/evolution.js");
    const restored = await restorePartnerFormForRevitalize({
      tamerActor: tamer,
      partnerActor: partner,
      formReference
    });
    if (!restored) {
      return {
        success: false,
        applied: false,
        message: text("A forma da derrota não pôde ser restaurada.", "The form at defeat could not be restored.")
      };
    }
  }

  const updatedWounds = foundry.utils.getProperty(partner, woundPath(partner)) ?? {};
  const maximum = Math.max(1, number(updatedWounds.max, 7));
  const recovered = Math.min(7, maximum);

  await partner.update({
    [`${woundPath(partner)}.value`]: recovered,
    [`${temporaryWoundPath(partner)}.value`]: 0,
    [`${temporaryWoundPath(partner)}.source`]: "",
    [`${temporaryWoundPath(partner)}.duration`]: "",
    "system.effects.active": [],
    "system.combat.defeated": false,
    "system.combat.incapacitated": false,
    "system.combat.currentStance": "neutral",
    "system.combat.offensiveQualities": {},
    "system.combat.defensiveQualities": {},
    [REVITALIZE_PATH]: {
      ...foundry.utils.deepClone(defeatState ?? {}),
      active: false,
      restoredAt: new Date().toISOString()
    }
  });

  const combatant = game?.combat?.combatants?.find((entry) => {
    return entry?.actor && actorsMatch(entry.actor, partner);
  });
  if (combatant?.defeated) await combatant.update({ defeated: false });

  return {
    success: true,
    applied: true,
    targetName: partner.name,
    message: text(
      `${partner.name} retornou à forma da derrota e recuperou ${recovered} Caixas de Ferimento.`,
      `${partner.name} returned to its form at defeat and recovered ${recovered} Wound Boxes.`
    ),
    details: text(
      "Todos os Efeitos e estados temporários de Qualidades anteriores à derrota foram encerrados.",
      "All Effects and temporary Quality states from before the defeat were ended."
    )
  };
}

// ---------------------------------------------------------------------------
// Overlooked
// ---------------------------------------------------------------------------

function overlookedEffects(actor) {
  return (actor?.system?.effects?.active ?? []).filter((effect) => {
    return normalizeTag(effect?.tag) === OVERLOOKED_TAG;
  });
}

function overlookedEffectFor(actor, tamer) {
  const tamerKeys = actorReferenceKeys(tamer);
  return overlookedEffects(actor).find((effect) => {
    const source = String(effect?.sourceActorUuid ?? "");
    return tamerKeys.has(source);
  }) ?? null;
}

async function applyOverlookedToEnemy(tamer, enemy, combat) {
  if (!tamer || !enemy || areActorsAllies(tamer, enemy)) return false;
  if (overlookedEffectFor(enemy, tamer)) return true;

  const effects = foundry.utils.deepClone(enemy.system?.effects?.active ?? []);
  effects.push({
    id: foundry.utils.randomID(),
    tag: OVERLOOKED_TAG,
    label: "Overlooked — Obscured",
    value: 1,
    potency: 1,
    category: "negative",
    source: "tamerTalent",
    sourceTalentId: "overlooked",
    sourceActorUuid: tamer.uuid,
    sourceActorName: tamer.name,
    hiddenActorUuids: [tamer.uuid],
    awarenessTn: 9 + Math.max(0, number(tamer.system?.skills?.stealth?.value, 0)),
    durationRule: "combat",
    endsAtCombatEnd: true,
    cannotCleanse: true,
    appliedCombatId: combat?.id ?? currentCombatId(),
    createdAt: new Date().toISOString()
  });
  await enemy.update({ "system.effects.active": effects });
  return true;
}

export async function initializeOverlookedForInitiative(unit, orderedUnits = [], combat = game?.combat) {
  const { tamer } = getUnitPairActors(unit);
  if (!combat?.started || !tamer || !hasUnlockedOfficialTamerTalent(tamer, "overlooked")) return null;

  const previousState =
    tamer.system?.combat?.tamerTalentRuntime?.overlooked ?? null;

  if (
    previousState?.initialized &&
    String(previousState.combatId ?? "") === String(combat.id)
  ) {
    return null;
  }

  const enemies = [...new Map(
    orderedUnits
      .filter((candidate) => candidate?.side !== unit?.side)
      .flatMap((candidate) => {
        return (candidate?.members ?? [])
          .map((member) => member?.combatant?.actor)
          .filter(Boolean);
      })
      .map((actor) => [actorIdentityKey(actor), actor])
  ).values()];

  for (const enemy of enemies) {
    await applyOverlookedToEnemy(tamer, enemy, combat);
  }

  const tn = 9 + Math.max(0, number(tamer.system?.skills?.stealth?.value, 0));
  await tamer.update({
    "system.combat.tamerTalentRuntime.overlooked": {
      active: true,
      initialized: true,
      combatId: combat.id,
      awarenessTn: tn,
      enemyUuids: enemies.map((enemy) => enemy.uuid),
      createdAt: new Date().toISOString()
    }
  });

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-overlooked-card">
        <h2>Overlooked</h2>
        <p><strong>${escapeHtml(tamer.name)}</strong> ${text(
          "começa o Combate obscuro para os inimigos até afetá-los diretamente ou ser detectado.",
          "begins Combat obscured from enemies until directly affecting them or being detected."
        )}</p>
        <p>${text("TN de Awareness", "Awareness TN")}: <strong>${tn}</strong>.</p>
        <button type="button" data-action="dda-overlooked-detection" data-tamer-uuid="${escapeHtml(tamer.uuid)}">
          <i class="fa-solid fa-eye"></i>
          ${text("Resolver detecção com inimigo selecionado", "Resolve detection with selected enemy")}
        </button>
      </div>
    `,
    flags: {
      [SYSTEM_ID]: {
        overlookedDetection: {
          combatId: combat.id,
          tamerUuid: tamer.uuid,
          awarenessTn: tn
        }
      }
    }
  });

  return { tamer, enemies, tn, message };
}

export function getOverlookedBlindAttackPenalty(attacker, defender) {
  if (!attacker || !defender) return 0;
  const defenderKeys = actorReferenceKeys(defender);

  return overlookedEffects(attacker).reduce((penalty, effect) => {
    const hidden = new Set((effect.hiddenActorUuids ?? []).map(String));
    const applies = [...defenderKeys].some((key) => hidden.has(key));
    return applies ? penalty + Math.max(1, number(effect.value ?? effect.potency, 1)) : penalty;
  }, 0);
}

export async function revealOverlookedToEnemy(tamer, enemy, reason = "directEffect") {
  if (!tamer || !enemy) return false;
  const effects = foundry.utils.deepClone(enemy.system?.effects?.active ?? []);
  const tamerKeys = actorReferenceKeys(tamer);
  const remaining = effects.filter((effect) => {
    if (normalizeTag(effect?.tag) !== OVERLOOKED_TAG) return true;
    return !tamerKeys.has(String(effect?.sourceActorUuid ?? ""));
  });

  if (remaining.length === effects.length) return false;
  await enemy.update({ "system.effects.active": remaining });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special">
        <h2>Overlooked</h2>
        <p><strong>${escapeHtml(enemy.name)}</strong> ${text(
          `agora percebe ${escapeHtml(tamer.name)} (${escapeHtml(reason)}).`,
          `now notices ${escapeHtml(tamer.name)} (${escapeHtml(reason)}).`
        )}</p>
      </div>
    `
  });
  return true;
}

async function resolveOverlookedDetection(message, rootButton) {
  const data = message?.getFlag?.(SYSTEM_ID, "overlookedDetection");
  if (!data || !game.user?.isGM) return false;

  const targets = Array.from(game.user?.targets ?? []).filter((token) => token?.actor);
  if (targets.length !== 1) {
    ui.notifications.warn(text("Selecione exatamente um inimigo para a detecção.", "Select exactly one enemy for detection."));
    return false;
  }

  const enemy = targets[0].actor;
  const tamer = await resolveActor(data.tamerUuid);
  if (!enemy || !tamer || areActorsAllies(enemy, tamer)) return false;

  const total = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-overlooked-detection-dialog"],
    window: { title: text("Detecção de Overlooked", "Overlooked Detection") },
    content: `
      <form class="dda-roll-dialog">
        <p><strong>${escapeHtml(enemy.name)}</strong> — TN <strong>${number(data.awarenessTn, 9)}</strong>.</p>
        <div class="form-group">
          <label>${text("Resultado total do Teste de Awareness", "Awareness Check total")}</label>
          <input type="number" name="total" value="0" step="1" />
        </div>
      </form>
    `,
    ok: {
      label: text("Resolver", "Resolve"),
      callback: (_event, button) => number(button.form?.elements?.total?.value, 0)
    },
    rejectClose: false,
    modal: true
  });

  if (!Number.isFinite(Number(total))) return false;
  const success = number(total, 0) >= number(data.awarenessTn, 9);
  if (success) await revealOverlookedToEnemy(tamer, enemy, "Awareness");

  ui.notifications.info(success
    ? text(`${enemy.name} detectou ${tamer.name}.`, `${enemy.name} detected ${tamer.name}.`)
    : text(`${enemy.name} não detectou ${tamer.name}.`, `${enemy.name} did not detect ${tamer.name}.`));

  if (rootButton) rootButton.disabled = false;
  return success;
}

function bindOverlookedCard(message, root) {
  if (!root?.querySelector) return;
  const button = root.querySelector("[data-action='dda-overlooked-detection']");
  if (!button || button.dataset.bound === "true") return;
  button.hidden = !game.user?.isGM;
  button.disabled = !game.user?.isGM;
  if (!game.user?.isGM) return;

  button.dataset.bound = "true";
  button.addEventListener("click", () => {
    button.disabled = true;
    void resolveOverlookedDetection(message, button).finally(() => {
      button.disabled = false;
    });
  });
}

// ---------------------------------------------------------------------------
// Shared entry points
// ---------------------------------------------------------------------------

export async function executeCombatSurvivalSpecialOrder(tamer, talent) {
  switch (String(talent?.id ?? "")) {
    case "bullrush":
      return activateBullrush(tamer);
    case "revitalize":
      return activateRevitalize(tamer);
    default:
      return {
        success: false,
        applied: false,
        message: text("Ordem de combate desconhecida.", "Unknown combat Special Order.")
      };
  }
}

export function registerTamerTalentCombatSurvivalHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  Hooks.on("renderChatMessageHTML", (message, html) => {
    bindOverlookedCard(message, html);
  });

  Hooks.on("combatEnd", (combat) => {
    void clearChallengerTemporaryWounds(combat);
  });

  Hooks.on("deleteCombat", (combat) => {
    void clearChallengerTemporaryWounds(combat);
  });

  const exposeRuntimeApi = () => {
    game.dda ??= {};
    game.dda.tamerTalents ??= {};
    game.dda.tamerTalents.revealOverlooked = revealOverlookedToEnemy;
    game.dda.tamerTalents.resolveOverlookedDetection = resolveOverlookedDetection;
  };

  if (game.ready) exposeRuntimeApi();
  else Hooks.once("ready", exposeRuntimeApi);
}
