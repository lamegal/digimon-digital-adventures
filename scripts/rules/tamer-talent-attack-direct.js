import {
  hasUnlockedOfficialTamerTalent
} from "./tamer-resources.js";

import {
  requestOfficialSpecialOrderExecution
} from "./tamer-talent-socket.js";

import {
  isCalculatedAvailable,
  markCalculatedUsed,
  resolveTamerForPartner,
  resolveTamerTalentPartner
} from "./tamer-talent-runtime.js";

import {
  getActorActionState,
  spendActorActions
} from "../combat/action-economy.js";

const SYSTEM_ID = "digimon-digital-adventures";
const DIRECT_USE_PATH = "system.combat.tamerActionUses.direct";
const ARMED_SIGNATURE_TAG = "tamerSignatureVersatilityArmed";
const ARMED_AUTO_HIT_TAG = "tamerAutoHitArmed";
const NEGATIVE_DIRECT_TAG = "tamerNegativeDirect";
const NEXT_ORDER_DIRECT_TAG = "tamerNextOrderDirect";
const ORDINARY_DIRECT_TAG = "tamerDirect";
const DISTRACTING_TIMEOUT_MS = 60_000;
const SOCKET_DISTRACTING_GESTURE = "ddaUseDistractingGesture";
const pendingDistractingGestureRequests = new Map();
let distractingGestureHooksRegistered = false;
let distractingGestureSocketRegistered = false;

function english() {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
}

function text(pt, en) {
  return english() ? en : pt;
}

function frenzyBlocksTamerInfluence(actor) {
  return Boolean(game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(actor));
}

function frenzyBlockedMutation(actor) {
  return {
    ok: false,
    reason: "frenzyImmuneToTamerInfluence",
    message: text(
      `[FRENZY]: ${actor?.name ?? "O Digimon"} não pode ser afetado por Ações do Tamer ou Ordens Especiais.`,
      `[FRENZY]: ${actor?.name ?? "The Digimon"} cannot be affected by Tamer Actions or Special Orders.`
    )
  };
}

function getPrimaryActiveGM() {
  return Array.from(game?.users ?? [])
    .filter((user) => user?.isGM && user?.active)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(game?.user?.isGM && getPrimaryActiveGM()?.id === game.user.id);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function currentCombatSignature() {
  const combat = game?.combat;
  if (!combat?.started) return `no-combat:${game?.time?.worldTime ?? Date.now()}`;
  return `${combat.id}:${number(combat.round, 0)}:${number(combat.turn, -1)}`;
}

function getActorReferenceKeys(actor) {
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
  const rightKeys = getActorReferenceKeys(right);
  return [...getActorReferenceKeys(left)].some((key) => rightKeys.has(key));
}

function runtimeActors() {
  const actors = [
    ...(game?.actors?.contents ?? []),
    ...((canvas?.tokens?.placeables ?? []).map((token) => token.actor).filter(Boolean))
  ];
  const unique = new Map();
  for (const actor of actors) {
    const key = String(actor?.parent?.actorId ?? actor?.token?.actorId ?? actor?.uuid ?? actor?.id ?? "");
    if (key) unique.set(key, actor);
  }
  return [...unique.values()];
}

function getTargetActors({ disposition = null, types = ["digimon", "npc"] } = {}) {
  const allowedTypes = new Set(types);
  const unique = new Map();
  for (const token of Array.from(game?.user?.targets ?? [])) {
    const actor = token?.actor;
    if (!actor || !allowedTypes.has(String(actor.type ?? ""))) continue;
    const tokenDisposition = Number(token?.document?.disposition ?? actor?.prototypeToken?.disposition ?? 0);
    if (disposition === "friendly" && tokenDisposition < 0) continue;
    if (disposition === "hostile" && tokenDisposition !== -1) continue;
    unique.set(actor.uuid ?? actor.id, actor);
  }
  return [...unique.values()];
}

function getAttributeValue(tamer, key) {
  return Math.max(0, number(tamer?.system?.attributes?.[key]?.value, 0));
}

function getHighestAttribute(tamer) {
  const attributes = Object.entries(tamer?.system?.attributes ?? {})
    .map(([key, attribute]) => ({
      key,
      value: Math.max(0, number(attribute?.value, 0)),
      label: game?.i18n?.localize?.(attribute?.label ?? key) ?? key
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
  return attributes[0] ?? { key: "charisma", value: 0, label: text("Carisma", "Charisma") };
}

function getDirectUse(tamer) {
  return tamer?.system?.combat?.tamerActionUses?.direct ?? null;
}

function getDirectUseTargetReferences(tamer) {
  const use = getDirectUse(tamer);
  if (String(use?.turnSignature ?? "") !== currentCombatSignature()) {
    return new Set();
  }

  return new Set([
    use?.targetUuid,
    ...(Array.isArray(use?.targetUuids) ? use.targetUuids : [])
  ].filter(Boolean).map(String));
}

function targetMatchesReferences(actor, references) {
  if (!actor || !(references instanceof Set) || !references.size) return false;
  return [...getActorReferenceKeys(actor)].some((key) => references.has(key));
}

function directWasUsedThisTurn(tamer) {
  if (!game?.combat?.started) return false;
  return String(getDirectUse(tamer)?.turnSignature ?? "") === currentCombatSignature();
}

async function markDirectUsed(tamer, data = {}) {
  await tamer.update({
    [DIRECT_USE_PATH]: {
      turnSignature: currentCombatSignature(),
      combatId: game?.combat?.id ?? "",
      round: number(game?.combat?.round, 0),
      turn: number(game?.combat?.turn, -1),
      usedAt: new Date().toISOString(),
      ...data
    }
  });
}

function buildDirectEffect(tamer, {
  tag = ORDINARY_DIRECT_TAG,
  label = "Directed",
  statKey = "accuracy",
  dice = 0,
  automaticSuccesses = 0,
  actionCost = 1,
  extra = {}
} = {}) {
  return {
    id: foundry.utils.randomID(),
    tag,
    label,
    value: Math.max(0, number(dice, 0)),
    potency: Math.max(0, number(dice, 0)),
    automaticSuccesses: Math.max(0, number(automaticSuccesses, 0)),
    poolStat: statKey,
    consumeOn: "matchingPool",
    expiresOn: tag === NEXT_ORDER_DIRECT_TAG ? "consumed" : "consumed",
    duration: null,
    remaining: null,
    sourceActorUuid: tamer.uuid,
    sourceActorName: tamer.name,
    sourceCombatId: game?.combat?.id ?? "",
    sourceRound: number(game?.combat?.round, 0),
    sourceTurn: number(game?.combat?.turn, -1),
    createdTurnSignature: currentCombatSignature(),
    sourceActionCost: Math.max(0, number(actionCost, 0)),
    personalCheerleader: hasUnlockedOfficialTamerTalent(tamer, "personalCheerleader"),
    fakeout: hasUnlockedOfficialTamerTalent(tamer, "fakeout") && statKey === "accuracy" && actionCost >= 2,
    ...extra
  };
}

async function addEffect(actor, effect) {
  const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);
  effects.push(effect);
  await actor.update({ "system.effects.active": effects });
  actor.sheet?.render(false);
}

async function removeOrdinaryDirectsFromTamer(tamer) {
  const sourceUuid = String(tamer?.uuid ?? "");
  for (const actor of runtimeActors()) {
    const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);
    const remaining = effects.filter((effect) => !(
      String(effect?.tag ?? "") === ORDINARY_DIRECT_TAG &&
      String(effect?.sourceActorUuid ?? "") === sourceUuid
    ));
    if (remaining.length !== effects.length) {
      await actor.update({ "system.effects.active": remaining });
      actor.sheet?.render(false);
    }
  }
}

async function postCard(tamer, title, body) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-tamer-talent-card"><h2>${escapeHtml(title)}</h2>${body}</div>`
  });
}

async function promptDirectConfiguration(tamer, {
  title,
  baseActionCost = 1,
  allowCalculated = false,
  allowBolster = true
} = {}) {
  const charisma = getAttributeValue(tamer, "charisma");
  const highest = getHighestAttribute(tamer);
  const calculatedAvailable = allowCalculated && isCalculatedAvailable(tamer);

  let result = null;
  try {
    result = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      classes: ["dda", "dda-tamer-direct-dialog"],
      content: `<div class="dda-roll-dialog dda-tamer-direct-dialog">
        <div class="form-group"><label>${text("Pool afetada", "Affected Pool")}</label>
          <select name="statKey"><option value="accuracy">${text("Precisão", "Accuracy")}</option><option value="dodge">${text("Esquiva", "Dodge")}</option></select>
        </div>
        <div class="form-group"><label>${text("Modo", "Mode")}</label>
          <select name="mode"><option value="charisma">${text("Carisma", "Charisma")} ${charisma}</option><option value="highest">${escapeHtml(highest.label)} ${highest.value} (+1A)</option></select>
        </div>
        ${allowBolster ? `<label class="dda-tamer-action-check"><input type="checkbox" name="bolster" /> <span>${text("Fortalecer: +2 dados (+1A)", "Bolster: +2 dice (+1 Action)")}</span></label>` : ""}
        ${calculatedAvailable ? `<label class="dda-tamer-action-check"><input type="checkbox" name="calculated" /> <span>Calculated: ${text("troque o +2 de Fortalecer por +1 Sucesso automático", "replace Bolster's +2 dice with +1 automatic Success")}</span></label>` : ""}
      </div>`,
      ok: {
        label: text("Continuar", "Continue"),
        callback: (_event, button) => {
          const form = button.form;
          const mode = String(form.elements.mode?.value ?? "charisma");
          const bolster = Boolean(form.elements.bolster?.checked) && mode === "charisma";
          const calculated = bolster && Boolean(form.elements.calculated?.checked) && calculatedAvailable;
          const sourceAttribute = mode === "highest" ? highest : { key: "charisma", value: charisma, label: text("Carisma", "Charisma") };
          const actionCost = baseActionCost + (mode === "highest" || bolster ? 1 : 0);
          return {
            statKey: String(form.elements.statKey?.value ?? "accuracy"),
            mode,
            bolster,
            calculated,
            sourceAttribute,
            actionCost,
            diceBonus: Math.max(0, sourceAttribute.value + (bolster && !calculated ? 2 : 0)),
            automaticSuccesses: calculated ? 1 : 0
          };
        }
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    result = null;
  }
  return result;
}

function actorHasActions(actor, amount) {
  return getActorActionState(actor).value >= Math.max(0, number(amount, 0));
}

async function resolveActor(uuid = "") {
  const clean = String(uuid ?? "").trim();
  if (!clean) return null;

  try {
    const document = await fromUuid(clean);
    if (document?.documentName === "Token") return document.actor ?? null;
    return document?.documentName === "Actor" ? document : null;
  } catch (_error) {
    return null;
  }
}

function normalizeDirectMutationConfig(
  tamer,
  selection = {},
  { baseActionCost = 1, allowCalculated = false } = {}
) {
  const mode = String(selection.mode ?? "charisma") === "highest"
    ? "highest"
    : "charisma";
  const bolster = mode === "charisma" && Boolean(selection.bolster);
  const calculated = Boolean(
    allowCalculated &&
    bolster &&
    selection.calculated &&
    isCalculatedAvailable(tamer)
  );
  const sourceAttribute = mode === "highest"
    ? getHighestAttribute(tamer)
    : {
        key: "charisma",
        value: getAttributeValue(tamer, "charisma"),
        label: text("Carisma", "Charisma")
      };

  return {
    statKey: String(selection.statKey ?? "accuracy") === "dodge"
      ? "dodge"
      : "accuracy",
    mode,
    bolster,
    calculated,
    sourceAttribute,
    actionCost: Math.max(0, number(baseActionCost, 0)) + (mode === "highest" || bolster ? 1 : 0),
    diceBonus: Math.max(0, sourceAttribute.value + (bolster && !calculated ? 2 : 0)),
    automaticSuccesses: calculated ? 1 : 0
  };
}

function mutationFailureMessage(result = {}) {
  const reasons = {
    noActiveGm: text("É necessário um Mestre ativo.", "An active GM is required."),
    timeout: text("O Mestre não respondeu a tempo.", "The GM did not respond in time."),
    invalidRequest: text("A solicitação da Ordem não é válida.", "The Order request is invalid."),
    requestFailed: text("A Ordem falhou durante a aplicação.", "The Order failed while being applied."),
    unknownSpecialOrder: text("A automação desta Ordem não foi encontrada.", "This Order automation was not found."),
    invalidTarget: text("O alvo escolhido não é válido.", "The selected target is invalid."),
    invalidConfiguration: text("A configuração escolhida não é válida.", "The selected configuration is invalid.")
  };
  return result?.message ?? reasons[result?.reason] ?? text(
    "Não foi possível aplicar a Ordem.",
    "Could not apply the Order."
  );
}

async function refundActionPayment(tamer, payment) {
  if (!tamer || !payment) return;
  await tamer.update({
    "system.combat.actions.value": Math.max(0, number(payment.actionsBefore, 0))
  });
}

async function requestPaidAttackDirectMutation(
  tamer,
  talentId,
  selection,
  actionCost = 0
) {
  const cost = Math.max(0, Math.floor(number(actionCost, 0)));
  const payment = cost > 0
    ? await spendActorActions(tamer, cost)
    : { actionsBefore: getActorActionState(tamer).value };

  if (!payment) {
    return {
      success: false,
      applied: false,
      message: text("Ações insuficientes.", "Not enough Actions.")
    };
  }

  const result = await requestOfficialSpecialOrderExecution(
    tamer,
    talentId,
    selection
  );

  if (!result?.ok) {
    if (cost > 0) await refundActionPayment(tamer, payment);
    return {
      success: false,
      applied: false,
      message: mutationFailureMessage(result)
    };
  }

  return {
    success: true,
    applied: true,
    actionCostNumberOverride: 0,
    prepaidActionCost: cost,
    message: result.message ?? "",
    details: result.details ?? "",
    mutation: result
  };
}

export function getNextOrderTargetRestriction(tamer, target) {
  const state = tamer?.system?.combat?.tamerTalentRuntime?.nextOrder ?? null;
  if (!state || String(state.turnSignature ?? "") !== currentCombatSignature()) return false;
  return Array.isArray(state.targetUuids) && state.targetUuids.some((uuid) => getActorReferenceKeys(target).has(String(uuid)));
}

export async function useBeTheWinners(
  tamer,
  { postChat = true } = {}
) {
  if (!hasUnlockedOfficialTamerTalent(tamer, "beTheWinners")) return null;
  if (directWasUsedThisTurn(tamer)) {
    ui.notifications.warn(text("Direcionar já foi usado neste turno.", "Direct has already been used this turn."));
    return null;
  }

  const partner = await resolveTamerTalentPartner(tamer);
  if (!partner) {
    ui.notifications.warn(text("Nenhum Partner vinculado foi encontrado.", "No linked Partner was found."));
    return null;
  }

  const otherTargets = getTargetActors({ disposition: "friendly" }).filter((actor) => !actorsMatch(actor, partner));
  if (otherTargets.length !== 1) {
    ui.notifications.warn(text("Marque exatamente um segundo Digimon aliado; o Partner é incluído automaticamente.", "Target exactly one other allied Digimon; the Partner is included automatically."));
    return null;
  }
  const other = otherTargets[0];
  if (
    getNextOrderTargetRestriction(tamer, partner) ||
    getNextOrderTargetRestriction(tamer, other)
  ) {
    ui.notifications.warn(text(
      "Be the Winners não pode escolher um Digimon que já recebeu WE CAN DO THIS, TOGETHER neste turno.",
      "Be the Winners cannot choose a Digimon that already received WE CAN DO THIS, TOGETHER this turn."
    ));
    return null;
  }

  const config = await promptDirectConfiguration(tamer, {
    title: "Be the Winners",
    baseActionCost: 2,
    allowCalculated: true,
    allowBolster: true
  });
  if (!config) return null;

  const aimAssist = config.statKey === "accuracy" && config.mode === "highest" && hasUnlockedOfficialTamerTalent(tamer, "aimAssist");
  const totalDice = config.diceBonus + (aimAssist ? 2 : 0);
  if (totalDice < 3) {
    ui.notifications.warn(text("O bônus total precisa permitir ao menos +2 para o Partner e +1 para o outro Digimon.", "The total bonus must allow at least +2 for the Partner and +1 for the other Digimon."));
    return null;
  }
  if (!actorHasActions(tamer, config.actionCost)) {
    ui.notifications.warn(text("Ações insuficientes.", "Not enough Actions."));
    return null;
  }

  let split = null;
  try {
    split = await foundry.applications.api.DialogV2.prompt({
      window: { title: text("Dividir Direcionar", "Split Direct") },
      classes: ["dda", "dda-tamer-direct-dialog"],
      content: `<div class="dda-roll-dialog"><p>${text("Distribua o bônus. O Partner deve manter pelo menos +2 e o outro Digimon pelo menos +1.", "Distribute the bonus. The Partner must keep at least +2 and the other Digimon at least +1.")}</p>
        <div class="form-group"><label>${escapeHtml(partner.name)}</label><input type="number" name="partnerBonus" min="2" max="${totalDice - 1}" value="${Math.max(2, totalDice - 1)}" /></div>
        ${config.calculated ? `<div class="form-group"><label>Calculated</label><select name="calculatedRecipient"><option value="partner">${escapeHtml(partner.name)}</option><option value="other">${escapeHtml(other.name)}</option></select></div>` : ""}
      </div>`,
      ok: {
        label: text("Aplicar", "Apply"),
        callback: (_event, button) => {
          const partnerBonus = Math.max(2, Math.min(totalDice - 1, Math.floor(number(button.form.elements.partnerBonus?.value, 2))));
          return {
            partnerBonus,
            otherBonus: totalDice - partnerBonus,
            calculatedRecipient: String(button.form.elements.calculatedRecipient?.value ?? "partner")
          };
        }
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    split = null;
  }
  if (!split) return null;

  const mutation = await requestPaidAttackDirectMutation(
    tamer,
    "beTheWinners",
    {
      partnerUuid: partner.uuid,
      otherUuid: other.uuid,
      statKey: config.statKey,
      mode: config.mode,
      bolster: config.bolster,
      calculated: config.calculated,
      partnerBonus: split.partnerBonus,
      calculatedRecipient: split.calculatedRecipient
    },
    config.actionCost
  );

  if (!mutation.success) {
    ui.notifications.warn(mutation.message);
    return null;
  }

  const applied = mutation.mutation ?? {};
  if (postChat) {
    await postCard(
      tamer,
      "Be the Winners",
      `<ul class="dda-effect-list"><li>${escapeHtml(applied.partnerName ?? partner.name)}: <strong>+${number(applied.partnerBonus, split.partnerBonus)}</strong>.</li><li>${escapeHtml(applied.otherName ?? other.name)}: <strong>+${number(applied.otherBonus, split.otherBonus)}</strong>.</li><li>${text("Pool", "Pool")}: <strong>${escapeHtml(applied.statKey ?? config.statKey)}</strong>.</li><li>${text("Custo", "Cost")}: <strong>${config.actionCost}A</strong>.</li></ul>`
    );
  }

  return {
    success: true,
    applied: true,
    partner,
    other,
    config,
    split,
    mutation: applied,
    prepaidActionCost: config.actionCost,
    actionCostNumberOverride: 0
  };
}

async function armPartnerAttackTalent(tamer, talentId, tag) {
  const partner = await resolveTamerTalentPartner(tamer);
  if (!partner) {
    return {
      ok: false,
      reason: "invalidTarget",
      message: text("Nenhum Partner vinculado foi encontrado.", "No linked Partner was found.")
    };
  }

  const effects = foundry.utils.deepClone(partner.system?.effects?.active ?? []);
  if (effects.some((effect) => [ARMED_SIGNATURE_TAG, ARMED_AUTO_HIT_TAG].includes(String(effect?.tag ?? "")))) {
    return {
      ok: false,
      reason: "invalidConfiguration",
      message: text("Já existe uma Ordem de Ataque preparada para o Partner.", "The Partner already has a prepared Attack Order.")
    };
  }

  effects.push({
    id: foundry.utils.randomID(),
    tag,
    label: talentId === "autoHit" ? "PUT 100% INTO THIS" : "TIME FOR PLAN B",
    sourceActorUuid: tamer.uuid,
    sourceActorName: tamer.name,
    combatId: game?.combat?.id ?? "",
    armedAt: new Date().toISOString(),
    endsAtCombatEnd: true,
    durationRule: "combat"
  });

  await partner.update({ "system.effects.active": effects });
  partner.sheet?.render(false);

  return {
    ok: true,
    partnerUuid: partner.uuid,
    partnerName: partner.name,
    message: talentId === "autoHit"
      ? text("O próximo Ataque não-Signature contra um inimigo usará Sucessos automáticos iguais ao SV e não permitirá Esquiva.", "The next non-Signature Attack against an Enemy uses automatic Successes equal to SV and allows no Dodge.")
      : text("O próximo Ataque não-Signature será tratado como Signature Move e consumirá Battery normalmente.", "The next non-Signature Attack is treated as a Signature Move and spends Battery normally.")
  };
}

async function executeHackingPride(tamer) {
  if (directWasUsedThisTurn(tamer)) {
    return {
      success: false,
      applied: false,
      message: text("Direcionar já foi usado neste turno.", "Direct has already been used this turn.")
    };
  }

  const targets = getTargetActors({ disposition: "hostile" });
  if (targets.length !== 1) {
    return {
      success: false,
      applied: false,
      message: text("Marque exatamente um Digimon inimigo.", "Target exactly one Enemy Digimon.")
    };
  }

  const config = await promptDirectConfiguration(tamer, {
    title: "YOU’VE ALREADY LOST",
    baseActionCost: 1,
    allowCalculated: false,
    allowBolster: true
  });
  if (!config) {
    return { success: false, applied: false, message: text("Uso cancelado.", "Use cancelled.") };
  }

  return requestPaidAttackDirectMutation(
    tamer,
    "hackingPride",
    {
      targetUuid: targets[0].uuid,
      statKey: config.statKey,
      mode: config.mode,
      bolster: config.bolster
    },
    config.actionCost
  );
}

async function executeNextOrder(tamer) {
  const targets = getTargetActors({ disposition: "friendly" });
  if (targets.length !== 2) {
    return {
      success: false,
      applied: false,
      message: text("Marque exatamente dois Digimon aliados dispostos.", "Target exactly two willing allied Digimon.")
    };
  }

  const previousDirectTargets = getDirectUseTargetReferences(tamer);
  if (targets.some((target) => targetMatchesReferences(target, previousDirectTargets))) {
    return {
      success: false,
      applied: false,
      message: text(
        "WE CAN DO THIS, TOGETHER não pode escolher um Digimon que já recebeu o Direcionar normal neste turno.",
        "WE CAN DO THIS, TOGETHER cannot choose a Digimon that already received normal Direct this turn."
      )
    };
  }

  const config = await promptDirectConfiguration(tamer, {
    title: "WE CAN DO THIS, TOGETHER",
    baseActionCost: 1,
    allowCalculated: true,
    allowBolster: true
  });
  if (!config) {
    return { success: false, applied: false, message: text("Uso cancelado.", "Use cancelled.") };
  }

  return requestPaidAttackDirectMutation(
    tamer,
    "nextOrder",
    {
      targetUuids: targets.map((target) => target.uuid),
      statKey: config.statKey,
      mode: config.mode,
      bolster: config.bolster,
      calculated: config.calculated
    },
    config.actionCost
  );
}

export async function executeAttackDirectSpecialOrder(tamer, talent) {
  const talentId = String(talent?.id ?? "");
  if (["signatureVersatility", "autoHit"].includes(talentId)) {
    const partner = await resolveTamerTalentPartner(tamer);
    if (partner && frenzyBlocksTamerInfluence(partner)) {
      return {
        success: false,
        applied: false,
        message: frenzyBlockedMutation(partner).message
      };
    }
  }

  switch (talentId) {
    case "signatureVersatility":
      return requestPaidAttackDirectMutation(
        tamer,
        "signatureVersatility",
        {},
        0
      );

    case "autoHit":
      return requestPaidAttackDirectMutation(
        tamer,
        "autoHit",
        {},
        2
      );

    case "hackingPride":
      return executeHackingPride(tamer);

    case "nextOrder":
      return executeNextOrder(tamer);

    default:
      return {
        success: false,
        applied: false,
        message: text("Automação de Ordem desconhecida.", "Unknown Order automation.")
      };
  }
}

async function mutateHackingPride(tamer, selection = {}) {
  if (directWasUsedThisTurn(tamer)) {
    return {
      ok: false,
      reason: "invalidConfiguration",
      message: text("Direcionar já foi usado neste turno.", "Direct has already been used this turn.")
    };
  }

  const target = await resolveActor(selection.targetUuid);
  if (!target || !["digimon", "npc"].includes(String(target.type ?? "")) || sideOf(target) !== "enemies") {
    return { ok: false, reason: "invalidTarget" };
  }
  if (frenzyBlocksTamerInfluence(target)) return frenzyBlockedMutation(target);

  const config = normalizeDirectMutationConfig(tamer, selection, {
    baseActionCost: 1,
    allowCalculated: false
  });

  const effect = buildDirectEffect(tamer, {
    tag: NEGATIVE_DIRECT_TAG,
    label: "YOU’VE ALREADY LOST",
    statKey: config.statKey,
    dice: config.diceBonus,
    actionCost: config.actionCost,
    extra: {
      negative: true,
      expiresOn: "sourceTurnStart",
      consumeOn: "matchingPool",
      duration: 1,
      remaining: 1,
      fakeout: false
    }
  });

  await addEffect(target, effect);
  await markDirectUsed(tamer, {
    source: "hackingPride",
    targetUuid: target.uuid,
    statKey: config.statKey
  });

  return {
    ok: true,
    targetUuid: target.uuid,
    targetName: target.name,
    statKey: config.statKey,
    diceBonus: config.diceBonus,
    actionCost: config.actionCost,
    message: `${target.name}: -${config.diceBonus} ${config.statKey}.`,
    details: text("O efeito expira no próximo turno do Tamer se não for consumido.", "The effect expires on the Tamer's next turn if unused.")
  };
}

async function mutateNextOrder(tamer, selection = {}) {
  const targetUuids = [...new Set(
    (Array.isArray(selection.targetUuids) ? selection.targetUuids : [])
      .map((uuid) => String(uuid ?? "").trim())
      .filter(Boolean)
  )];
  if (targetUuids.length !== 2) return { ok: false, reason: "invalidTarget" };

  const targets = (await Promise.all(targetUuids.map(resolveActor))).filter(Boolean);
  if (
    targets.length !== 2 ||
    targets.some((target) => !["digimon", "npc"].includes(String(target.type ?? "")) || sideOf(target) !== "players")
  ) {
    return { ok: false, reason: "invalidTarget" };
  }
  const frenzyTarget = targets.find(frenzyBlocksTamerInfluence);
  if (frenzyTarget) return frenzyBlockedMutation(frenzyTarget);

  const previousDirectTargets = getDirectUseTargetReferences(tamer);
  if (targets.some((target) => targetMatchesReferences(target, previousDirectTargets))) {
    return {
      ok: false,
      reason: "invalidConfiguration",
      message: text(
        "Um dos alvos já recebeu o Direcionar normal neste turno.",
        "One of the targets already received normal Direct this turn."
      )
    };
  }

  const config = normalizeDirectMutationConfig(tamer, selection, {
    baseActionCost: 1,
    allowCalculated: true
  });
  const partner = await resolveTamerTalentPartner(tamer);
  const aimAssist = Boolean(
    partner &&
    targets.some((target) => actorsMatch(target, partner)) &&
    config.statKey === "accuracy" &&
    config.mode === "highest" &&
    hasUnlockedOfficialTamerTalent(tamer, "aimAssist")
  );
  const directDice = config.diceBonus + (aimAssist ? 2 : 0);

  for (const target of targets) {
    const targetIsPartner = Boolean(partner && actorsMatch(target, partner));
    await addEffect(target, buildDirectEffect(tamer, {
      tag: NEXT_ORDER_DIRECT_TAG,
      label: "WE CAN DO THIS, TOGETHER",
      statKey: config.statKey,
      dice: directDice,
      automaticSuccesses: config.automaticSuccesses,
      actionCost: config.actionCost,
      extra: {
        nextOrder: true,
        targetIsPartner,
        aimAssist,
        fakeout: Boolean(
          targetIsPartner &&
          config.statKey === "accuracy" &&
          config.actionCost >= 2 &&
          hasUnlockedOfficialTamerTalent(tamer, "fakeout")
        )
      }
    }));
  }

  await tamer.update({
    "system.combat.tamerTalentRuntime.nextOrder": {
      turnSignature: currentCombatSignature(),
      targetUuids: targets.map((target) => target.uuid),
      statKey: config.statKey,
      usedAt: new Date().toISOString()
    }
  });
  if (config.calculated) await markCalculatedUsed(tamer, "nextOrder");

  return {
    ok: true,
    targetUuids: targets.map((target) => target.uuid),
    targetNames: targets.map((target) => target.name),
    statKey: config.statKey,
    diceBonus: directDice,
    actionCost: config.actionCost,
    aimAssist,
    message: `${targets.map((target) => target.name).join(" + ")}: +${directDice} ${config.statKey}${aimAssist ? " (Aim Assist)" : ""}.`,
    details: text("O Direcionar normal ainda pode ser usado neste turno, mas não nos mesmos alvos.", "Normal Direct may still be used this turn, but not on either of these targets.")
  };
}

async function mutateBeTheWinners(tamer, selection = {}) {
  if (directWasUsedThisTurn(tamer)) {
    return {
      ok: false,
      reason: "invalidConfiguration",
      message: text("Direcionar já foi usado neste turno.", "Direct has already been used this turn.")
    };
  }

  const partner = await resolveTamerTalentPartner(tamer);
  const selectedPartner = await resolveActor(selection.partnerUuid);
  const other = await resolveActor(selection.otherUuid);
  if (
    !partner ||
    !selectedPartner ||
    !actorsMatch(partner, selectedPartner) ||
    !other ||
    actorsMatch(other, partner) ||
    !["digimon", "npc"].includes(String(other.type ?? "")) ||
    sideOf(other) !== "players"
  ) {
    return { ok: false, reason: "invalidTarget" };
  }
  if (frenzyBlocksTamerInfluence(partner)) return frenzyBlockedMutation(partner);
  if (frenzyBlocksTamerInfluence(other)) return frenzyBlockedMutation(other);

  if (
    getNextOrderTargetRestriction(tamer, partner) ||
    getNextOrderTargetRestriction(tamer, other)
  ) {
    return {
      ok: false,
      reason: "invalidConfiguration",
      message: text(
        "Um dos alvos já recebeu WE CAN DO THIS, TOGETHER neste turno.",
        "One of the targets already received WE CAN DO THIS, TOGETHER this turn."
      )
    };
  }

  const config = normalizeDirectMutationConfig(tamer, selection, {
    baseActionCost: 2,
    allowCalculated: true
  });
  const aimAssist = Boolean(
    config.statKey === "accuracy" &&
    config.mode === "highest" &&
    hasUnlockedOfficialTamerTalent(tamer, "aimAssist")
  );
  const totalDice = config.diceBonus + (aimAssist ? 2 : 0);
  const partnerBonus = Math.floor(number(selection.partnerBonus, -1));
  if (totalDice < 3 || partnerBonus < 2 || partnerBonus > totalDice - 1) {
    return { ok: false, reason: "invalidConfiguration" };
  }
  const otherBonus = totalDice - partnerBonus;
  const calculatedRecipient = String(selection.calculatedRecipient ?? "partner") === "other"
    ? "other"
    : "partner";

  await removeOrdinaryDirectsFromTamer(tamer);
  await addEffect(partner, buildDirectEffect(tamer, {
    label: "Be the Winners",
    statKey: config.statKey,
    dice: partnerBonus,
    automaticSuccesses: config.calculated && calculatedRecipient === "partner" ? 1 : 0,
    actionCost: config.actionCost,
    extra: {
      beTheWinners: true,
      targetIsPartner: true,
      aimAssist,
      fakeout: Boolean(
        config.statKey === "accuracy" &&
        (config.mode === "highest" || config.bolster) &&
        hasUnlockedOfficialTamerTalent(tamer, "fakeout")
      )
    }
  }));
  await addEffect(other, buildDirectEffect(tamer, {
    label: "Be the Winners",
    statKey: config.statKey,
    dice: otherBonus,
    automaticSuccesses: config.calculated && calculatedRecipient === "other" ? 1 : 0,
    actionCost: config.actionCost,
    extra: {
      beTheWinners: true,
      targetIsPartner: false,
      aimAssist,
      fakeout: false
    }
  }));

  await markDirectUsed(tamer, {
    source: "beTheWinners",
    targetUuids: [partner.uuid, other.uuid],
    statKey: config.statKey
  });
  if (config.calculated) await markCalculatedUsed(tamer, "beTheWinners");

  return {
    ok: true,
    partnerUuid: partner.uuid,
    partnerName: partner.name,
    otherUuid: other.uuid,
    otherName: other.name,
    partnerBonus,
    otherBonus,
    statKey: config.statKey,
    actionCost: config.actionCost,
    aimAssist,
    calculated: config.calculated
  };
}

export async function executeAttackDirectTalentMutation(
  tamer,
  talentId,
  selection = {}
) {
  const cleanTalentId = String(talentId ?? "");
  if (!hasUnlockedOfficialTamerTalent(tamer, cleanTalentId)) {
    return { ok: false, reason: "invalidRequest" };
  }

  switch (cleanTalentId) {
    case "signatureVersatility":
      return armPartnerAttackTalent(tamer, "signatureVersatility", ARMED_SIGNATURE_TAG);
    case "autoHit":
      return armPartnerAttackTalent(tamer, "autoHit", ARMED_AUTO_HIT_TAG);
    case "hackingPride":
      return mutateHackingPride(tamer, selection);
    case "nextOrder":
      return mutateNextOrder(tamer, selection);
    case "beTheWinners":
      return mutateBeTheWinners(tamer, selection);
    default:
      return { ok: false, reason: "unknownSpecialOrder" };
  }
}

export function prepareAttackDirectTalentPoolOptions(actor, statKey, options = {}) {
  if (frenzyBlocksTamerInfluence(actor)) return { ...options };
  const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);
  const matching = effects.filter((effect) => String(effect?.poolStat ?? "") === String(statKey ?? "") && [NEXT_ORDER_DIRECT_TAG, NEGATIVE_DIRECT_TAG].includes(String(effect?.tag ?? "")));
  const allDirects = effects.filter((effect) => (
    String(effect?.poolStat ?? "") === String(statKey ?? "") &&
    String(effect?.tag ?? "") === NEXT_ORDER_DIRECT_TAG
  ));

  let diceModifier = number(options.diceModifier, 0);
  let automaticSuccesses = number(options.automaticSuccesses, 0);
  const modifierBreakdown = [...(Array.isArray(options.modifierBreakdown) ? options.modifierBreakdown : [])];
  const effectIds = [...(Array.isArray(options.ddaTamerActionEffectIds) ? options.ddaTamerActionEffectIds : [])];

  for (const effect of matching) {
    const amount = Math.max(0, number(effect?.value ?? effect?.potency, 0));
    const negative = String(effect?.tag ?? "") === NEGATIVE_DIRECT_TAG;
    diceModifier += negative ? -amount : amount;
    if (!negative) automaticSuccesses += Math.max(0, number(effect?.automaticSuccesses, 0));
    modifierBreakdown.push({
      id: effect.id,
      label: String(effect?.label ?? (negative ? "Negative Direct" : "Next Order")),
      value: negative ? -amount : amount,
      kind: String(effect?.tag ?? "tamerTalent")
    });
    if (effect.id) effectIds.push(effect.id);
  }

  const directSnapshots = allDirects.map((effect) => ({
    id: effect.id,
    tag: effect.tag,
    sourceActorUuid: effect.sourceActorUuid,
    sourceActionCost: number(effect.sourceActionCost, 0),
    fakeout: Boolean(effect.fakeout),
    personalCheerleader: Boolean(effect.personalCheerleader),
    label: effect.label
  }));

  return {
    ...options,
    diceModifier,
    automaticSuccesses,
    allowZeroSuccesses: Boolean(
      options.allowZeroSuccesses ||
      matching.some((effect) => String(effect?.tag ?? "") === NEGATIVE_DIRECT_TAG)
    ),
    modifierBreakdown,
    ddaTamerActionEffectIds: [...new Set(effectIds)],
    ddaTamerDirectEffects: [
      ...(Array.isArray(options.ddaTamerDirectEffects) ? options.ddaTamerDirectEffects : []),
      ...directSnapshots
    ],
    ddaPersonalCheerleaderSources: directSnapshots.filter((effect) => effect.personalCheerleader)
  };
}

export async function maybeApplyPersonalCheerleaderReroll(actor, statKey, diceResults = [], options = {}) {
  if (!["accuracy", "dodge"].includes(String(statKey ?? ""))) return [];
  const sources = Array.isArray(options.ddaPersonalCheerleaderSources) ? options.ddaPersonalCheerleaderSources : [];
  if (!sources.length || !diceResults.length) return [];

  let selected = null;
  try {
    selected = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Personal Cheerleader" },
      classes: ["dda", "dda-personal-cheerleader-dialog"],
      content: `<div class="dda-roll-dialog"><p>${text("Escolha até dois dados para rerrolar. Os novos resultados são obrigatórios.", "Choose up to two dice to reroll. The new results are final.")}</p>
        <div class="dda-dice-results">${diceResults.map((result, index) => `<label class="dda-die ${Number(result?.result ?? 0) >= 5 ? "success" : "failure"}"><input type="checkbox" name="dieIndex" value="${index}" /> ${Number(result?.result ?? 0)}</label>`).join(" ")}</div>
      </div>`,
      ok: {
        label: text("Rerrolar", "Reroll"),
        callback: (_event, button) => {
          const indexes = [...button.form.querySelectorAll("input[name='dieIndex']:checked")].map((input) => Number(input.value)).filter(Number.isInteger);
          if (indexes.length > 2) {
            ui.notifications.warn(text("Escolha no máximo dois dados.", "Choose no more than two dice."));
            return null;
          }
          return indexes;
        }
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    selected = null;
  }
  if (!Array.isArray(selected) || !selected.length) return [];

  const reroll = await new Roll(`${selected.length}d6`).evaluate();
  const replacements = reroll.dice?.[0]?.results ?? [];
  const entries = [];
  selected.forEach((dieIndex, index) => {
    const result = diceResults[dieIndex];
    if (!result) return;
    const original = number(result.result, 0);
    const replacement = number(replacements[index]?.result, original);
    result.result = replacement;
    entries.push({ dieIndex, original, result: replacement });
  });
  return entries;
}

export function getArmedAttackTalentState(actor) {
  if (frenzyBlocksTamerInfluence(actor)) return { signature: null, autoHit: null };
  const effects = Array.isArray(actor?.system?.effects?.active) ? actor.system.effects.active : [];
  const signature = effects.find((effect) => String(effect?.tag ?? "") === ARMED_SIGNATURE_TAG) ?? null;
  const autoHit = effects.find((effect) => String(effect?.tag ?? "") === ARMED_AUTO_HIT_TAG) ?? null;
  return { signature, autoHit };
}

export async function consumeArmedAttackTalent(actor, effectId = "") {
  if (!actor || !effectId) return false;
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const remaining = effects.filter((effect) => String(effect?.id ?? "") !== String(effectId));
  if (remaining.length === effects.length) return false;
  await actor.update({ "system.effects.active": remaining });
  actor.sheet?.render(false);
  return true;
}

function sideOf(actor) {
  const configured = String(actor?.system?.combat?.initiative?.side ?? "");
  if (["players", "enemies"].includes(configured)) return configured;
  const token = (canvas?.tokens?.placeables ?? []).find((candidate) => candidate?.actor && actorsMatch(candidate.actor, actor));
  const disposition = Number(token?.document?.disposition ?? actor?.prototypeToken?.disposition ?? 0);
  if (disposition === -1) return "enemies";
  return actor?.type === "npc" ? "enemies" : "players";
}

function ownerIds(actor) {
  return (game?.users?.contents ?? []).filter((user) => user.active && (user.isGM || actor?.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))).map((user) => user.id);
}

function talentUsedThisCombat(tamer, talentId) {
  const combat = game?.combat;
  const use = tamer?.system?.combat?.tamerTalentUsage?.[talentId] ?? null;
  return Boolean(combat?.started && use && String(use.combatId ?? "") === String(combat.id));
}

function distractingCandidates(attacker, defender) {
  if (!game?.combat?.started || sideOf(attacker) !== "enemies" || sideOf(defender) !== "players") return [];
  return runtimeActors().filter((actor) => actor?.type === "character")
    .filter((tamer) => !actorsMatch(tamer, defender))
    .filter((tamer) => game.combat?.combatants?.some((combatant) => actorsMatch(combatant?.actor, tamer)))
    .filter((tamer) => hasUnlockedOfficialTamerTalent(tamer, "distractingGesture"))
    .filter((tamer) => !talentUsedThisCombat(tamer, "distractingGesture"))
    .filter((tamer) => getActorActionState(tamer).value >= 1)
    .map((tamer) => ({
      id: foundry.utils.randomID(),
      tamerUuid: tamer.uuid,
      tamerName: tamer.name,
      authorizedUserIds: ownerIds(tamer)
    }))
    .filter((candidate) => candidate.authorizedUserIds.length);
}

function distractingCard(request) {
  return `<div class="dda-chat-card dda-effect-card effect-special dda-distracting-gesture-card"><h2>HEY, OVER HERE</h2><p><strong>${escapeHtml(request.attackerName)}</strong> ${text("está atacando", "is attacking")} <strong>${escapeHtml(request.defenderName)}</strong>.</p><div class="dda-intercede-options">${request.candidates.map((candidate) => `<button type="button" data-action="dda-distracting-gesture" data-candidate-id="${candidate.id}"><i class="fa-solid fa-hand"></i> ${escapeHtml(candidate.tamerName)}</button>`).join("")}<button type="button" data-action="dda-distracting-gesture-decline">${text("Prosseguir sem distrair", "Continue without distraction")}</button></div></div>`;
}

async function resolveDistractingChoice(
  message,
  candidateId = "",
  { requestingUserId = game.user?.id ?? "" } = {}
) {
  const request = message?.getFlag?.(SYSTEM_ID, "distractingGestureRequest");
  if (!request || request.status !== "pending") return false;
  const candidate = request.candidates.find((entry) => entry.id === candidateId) ?? null;

  if (!candidate) {
    if (!game.user?.isGM && request.requesterUserId !== game.user?.id) return false;
  } else {
    if (!candidate.authorizedUserIds.includes(String(requestingUserId))) return false;

    if (!game.user?.isGM) {
      const gm = getPrimaryActiveGM();
      if (!gm) {
        ui.notifications.warn(text(
          "É necessário um Mestre ativo para resolver Distracting Gesture.",
          "An active GM is required to resolve Distracting Gesture."
        ));
        return false;
      }

      game.socket.emit(`system.${SYSTEM_ID}`, {
        action: SOCKET_DISTRACTING_GESTURE,
        messageId: message.id,
        requestId: request.requestId,
        candidateId: candidate.id,
        requestingUserId: game.user.id
      });
      return true;
    }
  }

  let tamer = null;
  if (candidate) {
    tamer = await fromUuid(candidate.tamerUuid).catch(() => null);
    if (!tamer || talentUsedThisCombat(tamer, "distractingGesture")) return false;
    const uses = Math.max(0, number(tamer.system?.tamerTalentUses?.distractingGesture?.value, 1));
    if (uses < 1) return false;
    const usage = foundry.utils.deepClone(tamer.system?.combat?.tamerTalentUsage ?? {});
    usage.distractingGesture = {
      combatId: game.combat.id,
      round: number(game.combat.round, 0),
      turn: number(game.combat.turn, -1),
      frequency: "oncePerCombat",
      usedAt: new Date().toISOString()
    };
    const payment = await spendActorActions(tamer, 1, {
      requireActiveUnit: false,
      notify: false,
      additionalUpdates: {
        "system.combat.tamerTalentUsage": usage,
        "system.tamerTalentUses.distractingGesture.value": Math.max(0, uses - 1),
        "system.tamerTalentUses.distractingGesture.max": 1,
        "system.tamerTalentUses.distractingGesture.recharge": "combat"
      }
    });
    if (!payment) return false;
  }

  const resolved = {
    ...foundry.utils.deepClone(request),
    status: "resolved",
    declined: !candidate,
    selectedCandidateId: candidate?.id ?? "",
    resolverUserId: game.user.id
  };
  await message.update({
    content: candidate
      ? `<div class="dda-chat-card dda-effect-card effect-special"><h2>HEY, OVER HERE</h2><p><strong>${escapeHtml(candidate.tamerName)}</strong> ${text("reduziu pela metade os dados de Precisão do ataque.", "halved the Attack's Accuracy dice.")}</p></div>`
      : `<div class="dda-chat-card dda-effect-card effect-special"><p>${text("O ataque prossegue sem Distracting Gesture.", "The Attack continues without Distracting Gesture.")}</p></div>`,
    [`flags.${SYSTEM_ID}.distractingGestureRequest`]: resolved
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer ?? undefined }),
    content: candidate
      ? `<div class="dda-chat-card dda-effect-card effect-special"><h2>Distracting Gesture</h2><p>${escapeHtml(candidate.tamerName)}: ${text("dados de Precisão reduzidos pela metade.", "Accuracy dice halved.")}</p></div>`
      : `<div class="dda-chat-card dda-effect-card effect-special"><p>${text("Nenhuma distração foi usada.", "No distraction was used.")}</p></div>`,
    flags: {
      [SYSTEM_ID]: {
        distractingGestureResponse: {
          requestId: request.requestId,
          requestMessageId: message.id,
          candidate
        }
      }
    }
  });
  return true;
}

export function bindDistractingGestureChatCard(message, root) {
  const request = message?.getFlag?.(SYSTEM_ID, "distractingGestureRequest");
  if (!request || request.status !== "pending" || !root?.querySelectorAll) return;
  for (const button of root.querySelectorAll("[data-action='dda-distracting-gesture']")) {
    const candidate = request.candidates.find((entry) => entry.id === button.dataset.candidateId);
    const allowed = Boolean(candidate && (game.user?.isGM || candidate.authorizedUserIds.includes(game.user?.id)));
    button.hidden = !allowed;
    button.disabled = !allowed;
    if (allowed && button.dataset.bound !== "true") {
      button.dataset.bound = "true";
      button.addEventListener("click", () => {
        button.disabled = true;
        void resolveDistractingChoice(message, candidate.id);
      });
    }
  }
  const decline = root.querySelector("[data-action='dda-distracting-gesture-decline']");
  if (decline) {
    const allowed = game.user?.isGM || request.requesterUserId === game.user?.id;
    decline.hidden = !allowed;
    decline.disabled = !allowed;
    if (allowed && decline.dataset.bound !== "true") {
      decline.dataset.bound = "true";
      decline.addEventListener("click", () => void resolveDistractingChoice(message, ""));
    }
  }
}

export async function requestDistractingGesture({ attacker, defender, attackItem } = {}) {
  const candidates = distractingCandidates(attacker, defender);
  if (!candidates.length) return null;
  const request = {
    requestId: foundry.utils.randomID(),
    status: "pending",
    requesterUserId: game.user.id,
    attackerUuid: attacker.uuid,
    attackerName: attacker.name,
    defenderUuid: defender.uuid,
    defenderName: defender.name,
    attackItemId: attackItem?.id ?? "",
    attackName: attackItem?.name ?? "",
    candidates
  };
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: distractingCard(request),
    flags: { [SYSTEM_ID]: { distractingGestureRequest: request } }
  });
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(() => {
      pendingDistractingGestureRequests.delete(request.requestId);
      if (message?.isOwner || game.user?.isGM) {
        void message.update({
          content: `<div class="dda-chat-card dda-effect-card effect-special"><p>${text("A janela de Distracting Gesture expirou; o ataque prossegue normalmente.", "The Distracting Gesture window expired; the Attack continues normally.")}</p></div>`,
          [`flags.${SYSTEM_ID}.distractingGestureRequest.status`]: "expired"
        }).catch(() => {});
      }
      resolve(null);
    }, DISTRACTING_TIMEOUT_MS);
    pendingDistractingGestureRequests.set(request.requestId, { ...request, timeoutId, resolve, messageId: message.id });
  });
}

export function registerTamerTalentAttackDirectHooks() {
  if (distractingGestureHooksRegistered) return;
  distractingGestureHooksRegistered = true;

  Hooks.on("renderChatMessageHTML", (message, html) => {
    bindDistractingGestureChatCard(message, html);
  });

  Hooks.on("createChatMessage", (message) => {
    const response = message?.getFlag?.(SYSTEM_ID, "distractingGestureResponse");
    if (!response) return;
    const pending = pendingDistractingGestureRequests.get(response.requestId);
    if (!pending) return;

    globalThis.clearTimeout(pending.timeoutId);
    pendingDistractingGestureRequests.delete(response.requestId);

    const requestMessage = game.messages?.get(response.requestMessageId ?? pending.messageId);
    if (requestMessage && (requestMessage.isOwner || game.user?.isGM)) {
      const candidate = response.candidate ?? null;
      void requestMessage.update({
        content: candidate
          ? `<div class="dda-chat-card dda-effect-card effect-special"><h2>HEY, OVER HERE</h2><p><strong>${escapeHtml(candidate.tamerName)}</strong> ${text("reduziu pela metade os dados de Precisão do ataque.", "halved the Attack's Accuracy dice.")}</p></div>`
          : `<div class="dda-chat-card dda-effect-card effect-special"><p>${text("O ataque prossegue sem Distracting Gesture.", "The Attack continues without Distracting Gesture.")}</p></div>`,
        [`flags.${SYSTEM_ID}.distractingGestureRequest.status`]: "resolved"
      }).catch(() => {});
    }

    pending.resolve(response.candidate ?? null);
  });

  const registerSocket = () => {
    if (distractingGestureSocketRegistered || !game.socket) return;
    distractingGestureSocketRegistered = true;

    game.socket.on(`system.${SYSTEM_ID}`, async (payload = {}) => {
      if (payload?.action !== SOCKET_DISTRACTING_GESTURE || !isPrimaryActiveGM()) return;

      const message = game.messages?.get(payload.messageId);
      const request = message?.getFlag?.(SYSTEM_ID, "distractingGestureRequest");
      if (!message || !request || request.requestId !== payload.requestId) return;

      try {
        await resolveDistractingChoice(message, payload.candidateId, {
          requestingUserId: payload.requestingUserId
        });
      } catch (error) {
        console.error("DDA | Could not resolve Distracting Gesture through the GM.", error);
      }
    });
  };

  if (game.ready) registerSocket();
  else Hooks.once("ready", registerSocket);
}

export async function maybeApplyTakeTheLead(partner, {
  title = "",
  total = 0,
  tn = null,
  outcome = "none"
} = {}) {
  if (!game?.combat?.started || !["digimon", "npc"].includes(String(partner?.type ?? ""))) return null;
  if (frenzyBlocksTamerInfluence(partner)) return null;
  const tamer = await resolveTamerForPartner(partner);
  if (!tamer || !hasUnlockedOfficialTamerTalent(tamer, "takeTheLead") || talentUsedThisCombat(tamer, "takeTheLead")) return null;
  if (getActorActionState(tamer).value < 1) return null;
  if (!game.user?.isGM && !tamer.isOwner && !partner.isOwner) return null;

  const useIt = await foundry.applications.api.DialogV2.confirm({
    window: { title: "NOW FOCUS" },
    classes: ["dda", "dda-take-the-lead-dialog"],
    content: `<div class="dda-confirm-dialog"><p><strong>${escapeHtml(partner.name)}</strong>: ${escapeHtml(title || text("Teste", "Check"))}</p><p>${text("Resultado conhecido", "Known result")}: <strong>${number(total, 0)}</strong>${Number.isFinite(Number(tn)) ? ` / TN ${Number(tn)}` : ""} — ${escapeHtml(outcome)}.</p><p>${text("Gastar 1 Ação do Tamer para adicionar +5?", "Spend 1 Tamer Action to add +5?")}</p></div>`,
    yes: { label: text("Usar Take the Lead", "Use Take the Lead") },
    no: { label: text("Manter resultado", "Keep result") },
    rejectClose: false,
    modal: true
  });
  if (!useIt) return null;

  const uses = Math.max(0, number(tamer.system?.tamerTalentUses?.takeTheLead?.value, 1));
  if (uses < 1) return null;
  const usage = foundry.utils.deepClone(tamer.system?.combat?.tamerTalentUsage ?? {});
  usage.takeTheLead = {
    combatId: game.combat.id,
    round: number(game.combat.round, 0),
    turn: number(game.combat.turn, -1),
    frequency: "oncePerCombat",
    usedAt: new Date().toISOString()
  };
  const payment = await spendActorActions(tamer, 1, {
    requireActiveUnit: false,
    notify: false,
    additionalUpdates: {
      "system.combat.tamerTalentUsage": usage,
      "system.tamerTalentUses.takeTheLead.value": Math.max(0, uses - 1),
      "system.tamerTalentUses.takeTheLead.max": 1,
      "system.tamerTalentUses.takeTheLead.recharge": "combat"
    }
  });
  if (!payment) return null;
  return { used: true, bonus: 5, tamerUuid: tamer.uuid, tamerName: tamer.name };
}
