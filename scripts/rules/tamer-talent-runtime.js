import {
  hasUnlockedOfficialTamerTalent
} from "./tamer-resources.js";

import {
  getCombatantUnitId
} from "../combat/initiative.js";

const SYSTEM_ID = "digimon-digital-adventures";
const STRIKE_FAST_RESERVE_PATH = "system.combat.tamerTalentActionReserves.strikeFast";
const BULLRUSH_PATH = "system.combat.tamerTalentRuntime.bullrush";
const CALCULATED_STATE_PATH = "system.combat.tamerTalentRuntime.calculated";
const SPEED_SURGE_PATH = "system.combat.tamerTalentRoundWindows.speedSurge";
const NATURAL_EXPLORER_TAG = "naturalExplorerFollower";

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

function actorReferenceKeys(actor) {
  return new Set([
    actor?.uuid,
    actor?.id,
    actor?.id ? `Actor.${actor.id}` : "",
    actor?.parent?.uuid,
    actor?.parent?.id,
    actor?.parent?.actorId
  ].filter(Boolean).map(String));
}

function actorsMatch(left, right) {
  if (!left || !right) return false;
  const rightKeys = actorReferenceKeys(right);
  return [...actorReferenceKeys(left)].some((key) => rightKeys.has(key));
}

function runtimeActors() {
  const actors = [
    ...(game?.actors?.contents ?? []),
    ...((canvas?.tokens?.placeables ?? []).map((token) => token.actor).filter(Boolean))
  ];

  return [...new Map(
    actors.map((actor) => [
      String(actor?.parent?.actorId ?? actor?.token?.actorId ?? actor?.uuid ?? actor?.id ?? ""),
      actor
    ])
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
    console.warn("DDA | Could not resolve a Tamer Talent Actor reference.", error);
    return null;
  }
}

export async function resolveTamerTalentPartner(tamer) {
  if (!tamer || tamer.type !== "character") return null;

  const references = [
    tamer.system?.partner?.uuid,
    tamer.system?.partner?.currentFormUuid
  ].map((value) => String(value ?? "").trim()).filter(Boolean);

  for (const reference of references) {
    const actor = await resolveActor(reference);
    if (["digimon", "npc"].includes(String(actor?.type ?? ""))) {
      const canvasActor = (canvas?.tokens?.placeables ?? []).find((token) => {
        return token?.actor && actorsMatch(token.actor, actor);
      })?.actor;
      return canvasActor ?? actor;
    }
  }

  const tamerKeys = actorReferenceKeys(tamer);
  return runtimeActors().find((candidate) => {
    if (!["digimon", "npc"].includes(String(candidate?.type ?? ""))) return false;
    return [
      candidate.system?.tamer?.uuid,
      candidate.system?.tamer?.id
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .some((reference) => tamerKeys.has(reference));
  }) ?? null;
}

export async function resolveTamerForPartner(partner) {
  if (!["digimon", "npc"].includes(String(partner?.type ?? ""))) return null;

  const references = [
    partner.system?.tamer?.uuid,
    partner.system?.tamer?.id
  ].map((value) => String(value ?? "").trim()).filter(Boolean);

  for (const reference of references) {
    const actor = await resolveActor(reference);
    if (actor?.type === "character") return actor;
  }

  const partnerKeys = actorReferenceKeys(partner);
  return runtimeActors().find((candidate) => {
    if (candidate?.type !== "character") return false;
    return [
      candidate.system?.partner?.currentFormUuid,
      candidate.system?.partner?.uuid
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .some((reference) => partnerKeys.has(reference));
  }) ?? null;
}


function getSourceTurnSignature() {
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

export function getTamerTalentActivationSignature(actor = null) {
  const combat = game?.combat;
  if (!combat?.started) {
    return `no-combat:${String(actor?.uuid ?? actor?.id ?? "actor")}`;
  }

  const combatant = combat.combatants?.find((entry) => {
    return entry?.actor && actorsMatch(entry.actor, actor);
  }) ?? null;

  const unitId = getCombatantUnitId(combatant);

  return [
    combat.id,
    number(combat.round, 0),
    unitId || number(combat.turn, -1)
  ].join(":");
}

export function getTamerTalentVirtualRound(actor) {
  return Math.max(
    0,
    Math.floor(number(actor?.system?.combat?.tamerTalentRoundWindows?.speedSurge?.sequence, 0))
  );
}

export function getTamerTalentRoundSignature(actor) {
  return [
    game?.combat?.id ?? "no-combat",
    number(game?.combat?.round, 0),
    getTamerTalentVirtualRound(actor)
  ].join(":");
}

export function getStrikeFastActionReserve(actor, actionKey = "") {
  if (frenzyBlocksTamerInfluence(actor)) return 0;
  const key = String(actionKey ?? "").trim();
  if (!["move", "difficultMove"].includes(key)) return 0;

  const reserve = actor?.system?.combat?.tamerTalentActionReserves?.strikeFast;
  if (!reserve) return 0;
  if (String(reserve.activationSignature ?? "") !== getTamerTalentActivationSignature(actor)) {
    return 0;
  }

  return Math.max(0, Math.floor(number(reserve.remaining, 0)));
}

export async function grantStrikeFastActionReserve(tamer, partner, amount = 1) {
  const reserveAmount = Math.max(1, Math.floor(number(amount, 1)));
  const previous = partner?.system?.combat?.tamerTalentActionReserves?.strikeFast ?? {};
  const sameActivation = String(previous.activationSignature ?? "") === getTamerTalentActivationSignature(partner);
  const current = sameActivation ? Math.max(0, Math.floor(number(previous.remaining, 0))) : 0;

  const state = {
    remaining: current + reserveAmount,
    maximum: current + reserveAmount,
    sourceTamerUuid: tamer?.uuid ?? "",
    sourceTamerName: tamer?.name ?? "",
    combatId: game?.combat?.id ?? "",
    round: number(game?.combat?.round, 0),
    activationSignature: getTamerTalentActivationSignature(partner),
    grantedAt: new Date().toISOString()
  };

  await partner.update({
    [STRIKE_FAST_RESERVE_PATH]: state
  });

  return state;
}

export async function spendStrikeFastActionReserve(actor, amount = 1, actionKey = "") {
  const available = getStrikeFastActionReserve(actor, actionKey);
  const spent = Math.min(available, Math.max(0, Math.floor(number(amount, 0))));
  if (spent <= 0) return 0;

  const state = foundry.utils.deepClone(
    actor.system?.combat?.tamerTalentActionReserves?.strikeFast ?? {}
  );
  state.remaining = Math.max(0, available - spent);
  state.spentAt = new Date().toISOString();

  await actor.update({
    [STRIKE_FAST_RESERVE_PATH]: state
  });

  return spent;
}

export async function refundStrikeFastActionReserve(actor, amount = 1) {
  const state = foundry.utils.deepClone(
    actor?.system?.combat?.tamerTalentActionReserves?.strikeFast ?? {}
  );
  if (String(state.activationSignature ?? "") !== getTamerTalentActivationSignature(actor)) {
    return 0;
  }

  const refund = Math.max(0, Math.floor(number(amount, 0)));
  if (refund <= 0) return 0;
  state.remaining = Math.max(0, Math.floor(number(state.remaining, 0))) + refund;
  await actor.update({ [STRIKE_FAST_RESERVE_PATH]: state });
  return refund;
}

function getBullrushState(actor) {
  if (frenzyBlocksTamerInfluence(actor)) return null;
  const state = actor?.system?.combat?.tamerTalentRuntime?.bullrush ?? null;

  if (!state?.active) return null;

  if (
    String(state.activationSignature ?? "") !==
    getTamerTalentActivationSignature(actor)
  ) {
    return null;
  }

  return state;
}

export function getBullrushDifficultMoveActionCost(actor, baseCost = 2) {
  const normalized = Math.max(1, Math.floor(number(baseCost, 2)));

  return getBullrushState(actor)
    ? Math.max(1, normalized - 1)
    : normalized;
}

export function getBullrushActionReserve(actor, actionKey = "") {
  if (String(actionKey ?? "") !== "difficultMove") return 0;

  const state = getBullrushState(actor);

  return state
    ? Math.max(
        0,
        Math.floor(number(state.freeDifficultMoveRemaining, 0))
      )
    : 0;
}

export async function spendBullrushActionReserve(
  actor,
  amount = 1,
  actionKey = ""
) {
  const available = getBullrushActionReserve(actor, actionKey);
  const spent = Math.min(
    available,
    Math.max(0, Math.floor(number(amount, 0)))
  );

  if (spent <= 0) return 0;

  const state = foundry.utils.deepClone(
    actor.system?.combat?.tamerTalentRuntime?.bullrush ?? {}
  );

  state.freeDifficultMoveRemaining = Math.max(0, available - spent);
  state.updatedAt = new Date().toISOString();

  await actor.update({ [BULLRUSH_PATH]: state });
  return spent;
}

export async function refundBullrushActionReserve(actor, amount = 1) {
  const state = getBullrushState(actor);
  if (!state) return 0;

  const refund = Math.max(0, Math.floor(number(amount, 0)));
  if (refund <= 0) return 0;

  const next = foundry.utils.deepClone(state);

  next.freeDifficultMoveRemaining = Math.max(
    0,
    Math.floor(number(next.freeDifficultMoveRemaining, 0)) + refund
  );

  next.updatedAt = new Date().toISOString();

  await actor.update({ [BULLRUSH_PATH]: next });
  return refund;
}

export function isCalculatedAvailable(tamer) {
  if (!hasUnlockedOfficialTamerTalent(tamer, "calculated")) return false;
  const state = tamer?.system?.combat?.tamerTalentRuntime?.calculated;
  return String(state?.activationSignature ?? "") !== getTamerTalentActivationSignature(tamer);
}

export async function markCalculatedUsed(tamer, source = "bolster") {
  if (!tamer) return false;

  await tamer.update({
    [CALCULATED_STATE_PATH]: {
      activationSignature: getTamerTalentActivationSignature(tamer),
      source,
      combatId: game?.combat?.id ?? "",
      round: number(game?.combat?.round, 0),
      turn: number(game?.combat?.turn, -1),
      usedAt: new Date().toISOString()
    }
  });

  return true;
}

export async function promptCalculatedReplacement(tamer, title = "Bolster") {
  if (!isCalculatedAvailable(tamer)) return false;

  try {
    return Boolean(await foundry.applications.api.DialogV2.confirm({
      window: {
        title: text("I’VE CALCULATED THE ODDS", "I’VE CALCULATED THE ODDS")
      },
      content: `
        <div class="dda-roll-dialog dda-calculated-dialog">
          <p>
            <strong>${escapeHtml(tamer.name)}</strong>
            ${text(
              `pode substituir os +2 dados de Fortalecer em ${title} por +1 Sucesso automático.`,
              `may replace the +2 Bolster dice on ${title} with +1 automatic Success.`
            )}
          </p>
        </div>
      `,
      yes: { label: text("Usar Calculated", "Use Calculated") },
      no: { label: text("Manter +2 dados", "Keep +2 dice") },
      rejectClose: false,
      modal: true
    }));
  } catch (_error) {
    return false;
  }
}

export async function applySpeedSurgeVirtualRound(tamer, partner) {
  const previous = foundry.utils.deepClone(
    partner?.system?.combat?.tamerTalentRoundWindows?.speedSurge ?? {}
  );
  const sequence = Math.max(0, Math.floor(number(previous.sequence, 0))) + 1;

  const combatant = game?.combat?.combatants?.find((entry) => {
    return entry?.actor && actorsMatch(entry.actor, partner);
  }) ?? null;

  if (combatant) {
    await combatant.update({
      [`flags.${SYSTEM_ID}.initiative.endedRound`]: 0,
      [`flags.${SYSTEM_ID}.initiative.lastEndedRound`]: 0
    });
  }

  await partner.update({
    [SPEED_SURGE_PATH]: {
      sequence,
      sourceTamerUuid: tamer?.uuid ?? "",
      sourceTamerName: tamer?.name ?? "",
      combatId: game?.combat?.id ?? "",
      realRound: number(game?.combat?.round, 0),
      activatedAt: new Date().toISOString()
    },
    "system.combat.hasAttackedThisRound": false,
    "system.combat.attacksMadeThisTurn": 0,
    "system.combat.multiattackPenalty": 0,
    "system.combat.signatureMoveUsedThisTurn": false,
    "system.combat.energizeUsedThisTurn": false,
    "system.combat.movementActionsThisTurn": 0,
    "system.combat.effectDamageRoundKey": "",
    "system.combat.effectDamageTakenThisRound": 0,
    "system.combat.effectResistanceUses": {},
    "system.combat.digimonActionUses": {}
  });

  return sequence;
}

function targetedActors() {
  return [...new Map(
    Array.from(game?.user?.targets ?? [])
      .map((token) => token?.actor)
      .filter(Boolean)
      .map((actor) => [actor.uuid ?? actor.id, actor])
  ).values()];
}

function dispositionsAreAllied(left, right) {
  const leftToken = (canvas?.tokens?.placeables ?? []).find((token) => actorsMatch(token.actor, left));
  const rightToken = (canvas?.tokens?.placeables ?? []).find((token) => actorsMatch(token.actor, right));
  const leftDisposition = Number(leftToken?.document?.disposition ?? left?.prototypeToken?.disposition ?? 0);
  const rightDisposition = Number(rightToken?.document?.disposition ?? right?.prototypeToken?.disposition ?? 0);
  return leftDisposition === 0 || rightDisposition === 0 || Math.sign(leftDisposition) === Math.sign(rightDisposition);
}

export async function leadNaturalExplorerAllies(tamer) {
  if (!hasUnlockedOfficialTamerTalent(tamer, "naturalExplorer")) return null;

  const athletics = Math.max(0, Math.floor(number(tamer.system?.skills?.athletics?.value, 0)));
  const targets = targetedActors().filter((actor) => actor && !actorsMatch(actor, tamer) && dispositionsAreAllied(tamer, actor));

  if (!targets.length || targets.length > athletics) {
    ui.notifications.warn(text(
      `Marque entre 1 e ${athletics} aliados para seguir ${tamer.name}.`,
      `Target between 1 and ${athletics} Allies to follow ${tamer.name}.`
    ));
    return null;
  }

  const sourceSignature = getTamerTalentActivationSignature(tamer);

  for (const actor of targets) {
    const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? [])
      .filter((effect) => String(effect?.tag ?? "") !== NATURAL_EXPLORER_TAG || String(effect?.sourceActorUuid ?? "") !== String(tamer.uuid));

    effects.push({
      id: foundry.utils.randomID(),
      tag: NATURAL_EXPLORER_TAG,
      label: text(`Seguindo ${tamer.name}`, `Following ${tamer.name}`),
      category: "positive",
      source: "tamerTalent",
      sourceTalentId: "naturalExplorer",
      sourceActorUuid: tamer.uuid,
      sourceActorName: tamer.name,
      athletics,
      createdTurnSignature: getSourceTurnSignature(),
      activationSignature: sourceSignature,
      expiresOn: "sourceTurnStart",
      duration: 1,
      remaining: 1,
      difficultTerrainMoveCost: 1,
      useSourceAthletics: true,
      assistedFollowPosition: true
    });

    await actor.update({ "system.effects.active": effects });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-tamer-talent-card">
        <h2>${text("Natural Explorer", "Natural Explorer")}</h2>
        <p><strong>${escapeHtml(tamer.name)}</strong> ${text("lidera", "leads")} ${targets.map((actor) => `<strong>${escapeHtml(actor.name)}</strong>`).join(", ")}.</p>
        <p>${text(
          "Enquanto seguirem atrás do Tamer, esses aliados podem atravessar Terreno Difícil com uma Ação de Mover e usar o Athletics do Tamer em testes ambientais compatíveis. O posicionamento de seguir atrás continua sob validação do GM.",
          "While following behind the Tamer, these Allies may cross Difficult Terrain with a Move Action and use the Tamer's Athletics for compatible environmental Checks. Following position remains GM-validated."
        )}</p>
      </div>
    `
  });

  return { tamer, targets, athletics };
}

export function getNaturalExplorerFollowerEffect(actor) {
  return (actor?.system?.effects?.active ?? []).find((effect) => {
    if (String(effect?.tag ?? "") !== NATURAL_EXPLORER_TAG) return false;
    const activationSignature = String(effect?.activationSignature ?? "");
    const source = runtimeActors().find((candidate) => String(candidate?.uuid ?? "") === String(effect?.sourceActorUuid ?? ""));
    return source && activationSignature === getTamerTalentActivationSignature(source);
  }) ?? null;
}

export async function postBusyHandsPlantCard(tamer) {
  if (!hasUnlockedOfficialTamerTalent(tamer, "busyHands")) return null;

  const targets = targetedActors();
  const target = targets.length === 1 ? targets[0] : null;

  let itemName = "";
  try {
    itemName = String(await foundry.applications.api.DialogV2.prompt({
      window: { title: text("Busy Hands — Plant Small Item", "Busy Hands — Plant Small Item") },
      content: `
        <div class="dda-roll-dialog dda-busy-hands-plant-dialog">
          <p>${text(
            "Descreva o objeto pequeno o bastante para caber na palma da mão. Esta parte do Talento não exige rolagem.",
            "Describe the object, which must be small enough to fit in a palm. This part of the Talent requires no roll."
          )}</p>
          <div class="form-group">
            <label>${text("Objeto", "Item")}</label>
            <input type="text" name="itemName" maxlength="100" required>
          </div>
        </div>
      `,
      ok: {
        label: text("Registrar", "Record"),
        callback: (_event, button) => String(button.form.elements.itemName?.value ?? "").trim()
      },
      rejectClose: false,
      modal: true
    }) ?? "").trim();
  } catch (_error) {
    itemName = "";
  }

  if (!itemName) return null;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-tamer-talent-card">
        <h2>Busy Hands</h2>
        <p><strong>${escapeHtml(tamer.name)}</strong> ${text("planta discretamente", "discreetly plants")} <strong>${escapeHtml(itemName)}</strong>${target ? ` ${text("em", "on")} <strong>${escapeHtml(target.name)}</strong>` : ""}.</p>
        <p>${text("Nenhuma rolagem é necessária; o GM apenas confirma que o objeto cabe na palma da mão.", "No roll is required; the GM only confirms that the item fits in a palm.")}</p>
      </div>
    `
  });

  return { itemName, target };
}

export async function markBestLaidPlansSurprise(tamer) {
  if (!hasUnlockedOfficialTamerTalent(tamer, "bestLaidPlans")) return null;

  if (game?.combat?.started && Number(game.combat.round ?? 0) > 0) {
    ui.notifications.warn(text(
      "Best Laid Plans deve ser marcado antes da Iniciativa ser rolada.",
      "Best Laid Plans must be marked before Initiative is rolled."
    ));
    return null;
  }

  const targets = targetedActors();
  if (targets.length !== 1) {
    ui.notifications.warn(text("Marque exatamente um inimigo investigado, interrogado ou flagrado mentindo.", "Target exactly one Enemy who was investigated, interrogated, or caught lying."));
    return null;
  }

  const enemy = targets[0];
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: text("Best Laid Plans — Surprised", "Best Laid Plans — Surprised") },
    content: `
      <div class="dda-roll-dialog dda-best-laid-plans-dialog">
        <p>${text(
          `Confirme que ${escapeHtml(enemy.name)} estava sendo investigado, interrogado ou definitivamente mentindo para ${escapeHtml(tamer.name)} momentos antes do Combate.`,
          `Confirm that ${escapeHtml(enemy.name)} was being investigated, interrogated, or definitely lying to ${escapeHtml(tamer.name)} immediately before Combat.`
        )}</p>
        <p><strong>${text("Efeito:", "Effect:")}</strong> ${text("o inimigo perde a primeira Rodada do Combate.", "the Enemy misses the first Combat Round.")}</p>
      </div>
    `,
    yes: { label: text("Marcar como Surprised", "Mark Surprised") },
    no: { label: text("Cancelar", "Cancel") },
    rejectClose: false,
    modal: true
  });

  if (!confirmed) return null;

  await enemy.update({
    "system.combat.surprised": true,
    "system.combat.bestLaidPlansSurprise": {
      sourceTamerUuid: tamer.uuid,
      sourceTamerName: tamer.name,
      markedAt: new Date().toISOString()
    }
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-tamer-talent-card">
        <h2>Best Laid Plans</h2>
        <p><strong>${escapeHtml(enemy.name)}</strong> ${text("foi marcado como Surprised e perderá a primeira Rodada do próximo Combate.", "was marked Surprised and will miss the first Round of the next Combat.")}</p>
      </div>
    `
  });

  return { tamer, enemy };
}

export function isBestLaidPlansSurprised(actor) {
  return Boolean(actor?.system?.combat?.surprised && actor?.system?.combat?.bestLaidPlansSurprise);
}

export async function clearBestLaidPlansSurprise(actor, { restoreActions = true } = {}) {
  if (!actor) return false;
  const updates = {
    "system.combat.surprised": false,
    "system.combat.-=bestLaidPlansSurprise": null
  };
  if (restoreActions) {
    updates["system.combat.actions.value"] = Math.max(0, number(actor.system?.combat?.actions?.max, 2));
  }
  await actor.update(updates);
  return true;
}

export const DDA_TAMER_TALENT_RUNTIME = {
  resolveTamerTalentPartner,
  resolveTamerForPartner,
  getTamerTalentActivationSignature,
  getTamerTalentVirtualRound,
  getTamerTalentRoundSignature,
  getStrikeFastActionReserve,
  grantStrikeFastActionReserve,
  spendStrikeFastActionReserve,
  refundStrikeFastActionReserve,
  isCalculatedAvailable,
  markCalculatedUsed,
  promptCalculatedReplacement,
  applySpeedSurgeVirtualRound,
  leadNaturalExplorerAllies,
  getNaturalExplorerFollowerEffect,
  postBusyHandsPlantCard,
  markBestLaidPlansSurprise,
  isBestLaidPlansSurprised,
  clearBestLaidPlansSurprise
};
