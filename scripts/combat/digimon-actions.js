import {
  areActorsAllies,
  findQuality,
  getActorSv,
  rollDerivedCheck
} from "../rules/quality-automation.js";
import { getCombatantUnitId } from "./initiative.js";
import {
  checkActorActionSpend,
  spendActorActions
} from "./action-economy.js";

const ACTION_USE_PATH = "system.combat.digimonActionUses";
const POOL_EFFECT_TAGS = new Set(["digimonBolster", "digimonAid", "digimonGuard"]);

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("pt") ? pt : en;
}

function localize(key, fallback = key) {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isDigimon(actor) {
  return Boolean(actor && ["digimon", "npc"].includes(actor.type) && actor.system?.isDigimon !== false);
}

function turnSignature(actor) {
  const combat = game?.combat;
  if (!combat?.started) return `no-combat:${game?.time?.worldTime ?? Date.now()}`;
  const combatant = combat.combatants?.find((entry) => entry.actor?.uuid === actor?.uuid);
  return [combat.id, number(combat.round), getCombatantUnitId(combatant)].join(":");
}

function wasUsedThisTurn(actor, key) {
  return String(actor.system?.combat?.digimonActionUses?.[key]?.turnSignature ?? "") === turnSignature(actor);
}

async function markUsedThisTurn(actor, key, data = {}) {
  await actor.update({
    [`${ACTION_USE_PATH}.${key}`]: {
      turnSignature: turnSignature(actor),
      combatId: game?.combat?.id ?? "",
      round: number(game?.combat?.round),
      usedAt: new Date().toISOString(),
      ...data
    }
  });
}

async function spendActions(actor, amount, options = {}) {
  return Boolean(
    await spendActorActions(actor, amount, options)
  );
}

function actorToken(actor) {
  return canvas?.tokens?.controlled?.find((token) => token.actor?.uuid === actor?.uuid)
    ?? canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === actor?.uuid)
    ?? null;
}

function selectedTarget() {
  const targets = Array.from(game?.user?.targets ?? []);
  return targets.length === 1 ? targets[0] : null;
}

function targetWithinRange(actor, targetToken) {
  const sourceToken = actorToken(actor);
  if (!sourceToken || !targetToken) return false;
  const distance = tokenGridDistance(sourceToken, targetToken);
  const range = Math.max(0, number(
    actor.system?.miscStats?.range?.total
      ?? actor.system?.miscStats?.range?.value
      ?? actor.system?.miscStats?.range?.base
  ));
  return distance <= range;
}

function tokenGridDistance(tokenA, tokenB) {
  const gridSize = Math.max(1, number(canvas?.grid?.size, 100));
  const bounds = (token) => {
    const document = token?.document ?? token ?? {};
    const x = Math.round(number(document.x) / gridSize);
    const y = Math.round(number(document.y) / gridSize);
    const width = Math.max(1, Math.round(number(document.width, 1)));
    const height = Math.max(1, Math.round(number(document.height, 1)));
    return { left: x, right: x + width - 1, top: y, bottom: y + height - 1 };
  };
  const a = bounds(tokenA);
  const b = bounds(tokenB);
  const gapX = a.right < b.left ? b.left - a.right : b.right < a.left ? a.left - b.right : 0;
  const gapY = a.bottom < b.top ? b.top - a.bottom : b.bottom < a.top ? a.top - b.bottom : 0;
  return Math.max(gapX, gapY);
}

function isUnavailableTarget(token) {
  const actor = token?.actor;
  if (!actor) return true;
  const combatant = game?.combat?.combatants?.find((entry) =>
    entry.tokenId === token.id || entry.actor?.uuid === actor.uuid
  );
  if (combatant?.defeated) return true;
  const wounds = number(
    actor.system?.resources?.woundBoxes?.value
      ?? actor.system?.woundBoxes?.value,
    NaN
  );
  return Number.isFinite(wounds) && wounds <= 0;
}

function getEffectList(actor) {
  return foundry.utils.deepClone(actor.system?.effects?.active ?? []);
}

async function addPoolEffect(actor, effect) {
  const effects = getEffectList(actor);
  effects.push({
    id: foundry.utils.randomID(),
    duration: null,
    remaining: null,
    expiresOn: "sourceTurnStart",
    createdTurnSignature: turnSignature(actor),
    ...effect
  });
  await actor.update({ "system.effects.active": effects });
}

async function choose(title, label, entries) {
  if (!entries.length) return null;
  return new Promise((resolve) => {
    const options = entries.map((entry) =>
      `<option value="${foundry.utils.escapeHTML(String(entry.value))}">${foundry.utils.escapeHTML(String(entry.label))}</option>`
    ).join("");
    new Dialog({
      title,
      content: `<form class="dda-digimon-action-choice"><div class="form-group"><label>${label}</label><select name="choice">${options}</select></div></form>`,
      buttons: {
        confirm: {
          label: text("Confirmar", "Confirm"),
          callback: (html) => resolve(String(html.find('[name="choice"]').val() ?? ""))
        },
        cancel: { label: text("Cancelar", "Cancel"), callback: () => resolve(null) }
      },
      default: "confirm",
      close: () => resolve(null)
    }, { classes: ["dda", "dda-digimon-action-dialog"] }).render(true);
  });
}

async function chooseAttack(actor, title = text("Escolha o Ataque", "Choose the Attack")) {
  const attacks = Array.from(actor.items ?? []).filter((item) => item.type === "attack");
  const id = await choose(title, text("Ataque", "Attack"), attacks.map((item) => ({ value: item.id, label: item.name })));
  return id ? actor.items.get(id) : null;
}

async function useMove(actor, difficult = false) {
  const tracker = game.dda?.movementTracker;
  if (!tracker?.beginActionMovement) {
    ui.notifications.error(text("O rastreador de Movimento não está disponível.", "The Movement tracker is unavailable."));
    return null;
  }
  return tracker.beginActionMovement(actor, {
    actionCost: difficult ? 2 : 1,
    difficultTerrain: difficult,
    label: difficult ? text("Movimento Difícil", "Difficult Move") : text("Mover", "Move")
  });
}

async function useAttack(actor, holdBack = false) {
  const attack = await chooseAttack(actor, holdBack ? text("Segurar o Golpe", "Hold Back") : text("Atacar", "Attack"));
  if (!attack) return null;

  if (holdBack) {
    const stance = String(actor.system?.combat?.currentStance ?? "neutral");
    const attackText = JSON.stringify(attack.toObject?.() ?? attack).toLowerCase();
    if (["offensive", "fierce"].includes(stance) || attackText.includes("hazard")) {
      ui.notifications.warn(text(
        "Segurar o Golpe não pode ser usado em Postura Ofensiva/Feroz nem com [HAZARD].",
        "Hold Back cannot be used in Offensive/Fierce Stance or with [HAZARD]."
      ));
      return null;
    }
  }

  const { rollAttack } = await import("../rolls/attack-roll.js");
  return rollAttack(actor, attack, { holdBack });
}

async function useCheck(actor) {
  const stats = Object.entries(actor.system?.mainStats ?? {})
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]) => ({ value: key, label: value.label ? game.i18n.localize(value.label) : key }));
  const statKey = await choose(text("Teste do Digimon", "Digimon Check"), text("Atributo", "Stat"), stats);
  if (!statKey || !(await spendActions(actor, 2))) return null;
  const { rollPool } = await import("../rolls/pool-roll.js");
  return rollPool(actor, statKey, { externalLabel: text("Teste — 2 Ações", "Check — 2 Actions") });
}

function availableStances(actor) {
  const labels = CONFIG.DDA?.stances ?? {};
  const base = ["neutral", "offensive", "defensive"];
  const advanced = ["brave", "fierce", "sentry", "martial", "anticipate"];
  const normalizedItems = JSON.stringify(Array.from(actor.items ?? []).map((item) => item.toObject?.() ?? item))
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const aliases = {
    brave: ["brave stance", "postura corajosa"],
    fierce: ["fierce stance", "postura feroz"],
    sentry: ["sentry stance", "postura sentinela"],
    martial: ["martial stance", "postura marcial"],
    anticipate: ["anticipate stance", "postura de antecipacao"]
  };
  return [...base, ...advanced.filter((key) => aliases[key].some((alias) => normalizedItems.includes(alias)))]
    .filter((key) => labels[key])
    .map((key) => ({ value: key, label: game.i18n.localize(labels[key]) }));
}

async function useStance(actor) {
  if (wasUsedThisTurn(actor, "stanceChange")) {
    ui.notifications.warn(text("A Postura já foi alterada nesta ativação.", "Stance was already changed during this activation."));
    return null;
  }
  const stance = await choose(text("Mudar Postura", "Change Stance"), text("Nova Postura", "New Stance"), availableStances(actor));
  if (!stance || stance === actor.system?.combat?.currentStance || !(await spendActions(actor, 1))) return null;
  await actor.update({ "system.combat.currentStance": stance });
  await markUsedThisTurn(actor, "stanceChange", { stance });
  return stance;
}

async function useResist(actor) {
  const available = Math.max(0, number(actor.system?.combat?.actions?.value));
  const choices = [1, 2].filter((cost) => cost <= available).map((cost) => ({ value: cost, label: `${cost}` }));
  const raw = await choose(text("Resistir", "Resist"), text("Ações", "Actions"), choices);
  const amount = number(raw);
  if (!amount || !(await spendActions(actor, amount))) return null;

  const effects = getEffectList(actor).map((effect) => {
    if (effect.cannotReducePotency) return effect;
    const potency = Math.max(0, number(effect.potency ?? effect.value));
    if (potency <= 0) return effect;
    const next = Math.max(0, potency - amount);
    return { ...effect, potency: next, value: next };
  }).filter((effect) => Math.max(0, number(effect.potency ?? effect.value)) > 0);
  await actor.update({ "system.effects.active": effects });
  return amount;
}

async function useBolster(actor) {
  if (!(await spendActions(actor, 1))) return null;
  const value = Math.max(0, number(getActorSv(actor)));
  await addPoolEffect(actor, {
    tag: "digimonBolster",
    label: text("Fortalecer", "Bolster"),
    value,
    poolStats: ["*"],
    sourceActorUuid: actor.uuid
  });
  return value;
}

async function useAid(actor) {
  if (wasUsedThisTurn(actor, "aid")) {
    ui.notifications.warn(text("Ajudar já foi usado nesta ativação.", "Aid was already used during this activation."));
    return null;
  }
  const targetToken = selectedTarget();
  const target = targetToken?.actor;
  const allied = areActorsAllies(actor, target);
  if (!target || !allied || target.uuid === actor.uuid || isUnavailableTarget(targetToken) || !targetWithinRange(actor, targetToken)) {
    ui.notifications.warn(text("Selecione exatamente um aliado dentro do Alcance.", "Select exactly one ally within Range."));
    return null;
  }
  if (!(await spendActions(actor, 1))) return null;
  const value = Math.max(0, number(getActorSv(actor)));
  await addPoolEffect(target, {
    tag: "digimonAid",
    label: `${text("Ajudar", "Aid")} — ${actor.name}`,
    value,
    poolStats: ["accuracy", "dodge"],
    sourceActorUuid: actor.uuid,
    createdTurnSignature: turnSignature(actor)
  });
  await markUsedThisTurn(actor, "aid", { targetActorUuid: target.uuid });
  return value;
}

async function useGuard(actor) {
  if (wasUsedThisTurn(actor, "guard")) {
    ui.notifications.warn(text("Guardar já foi usado nesta ativação.", "Guard was already used during this activation."));
    return null;
  }
  if (!(await spendActions(actor, 1))) return null;
  const value = Math.max(0, number(getActorSv(actor)));
  await addPoolEffect(actor, {
    tag: "digimonGuard",
    label: text("Guardar", "Guard"),
    value,
    poolStats: ["dodge"],
    sourceActorUuid: actor.uuid
  });
  await markUsedThisTurn(actor, "guard");
  return value;
}

function coordinatedAssaultQuality(actor) {
  return findQuality(actor, "coordinatedAssault")
    ?? findQuality(actor, "ataqueCoordenado");
}

function actorReferenceKeys(actor) {
  return new Set([actor?.uuid, actor?.id, actor?.id ? `Actor.${actor.id}` : ""]
    .filter(Boolean).map(String));
}

function coordinatedAssaultTargetMatches(state, target) {
  const keys = actorReferenceKeys(target);
  return [state?.targetActorUuid, state?.targetActorId].some((value) => keys.has(String(value ?? "")));
}

async function addFearFromCoordinatedAssault(actor, target) {
  const effects = getEffectList(actor);
  effects.push({
    id: foundry.utils.randomID(),
    tag: "fear",
    label: `${text("Medo", "Fear")} — ${target.name}`,
    value: 3,
    potency: 3,
    duration: 1,
    remaining: 1,
    sourceActorUuid: target.uuid,
    sourceActorName: target.name
  });
  await actor.update({ "system.effects.active": effects });
}

async function rollCoordinatedAssault(actor, targetToken, { maintenance = false } = {}) {
  const target = targetToken?.actor;
  const current = actor.system?.combat?.coordinatedAssault ?? {};
  const bonus = maintenance ? Math.max(0, number(current.bonus)) : 0;
  const targetRam = Math.max(0, number(target?.system?.derivedStats?.ram?.total ?? target?.system?.derivedStats?.ram?.value));
  const tn = 10 + targetRam + bonus;
  const result = await rollDerivedCheck(actor, "bit", {
    skillKey: "precision",
    tn,
    title: maintenance
      ? text("Manter Ataque Coordenado", "Maintain Coordinated Assault")
      : text("Ataque Coordenado", "Coordinated Assault")
  });
  return { result, tn };
}

async function useCoordinatedAssault(actor) {
  const quality = coordinatedAssaultQuality(actor);
  if (!quality) return null;
  const targetToken = selectedTarget();
  const target = targetToken?.actor;
  if (!target || targetToken.document?.hidden || areActorsAllies(actor, target)) {
    ui.notifications.warn(text("Selecione exatamente um inimigo visível.", "Select exactly one visible enemy."));
    return null;
  }
  if (!(await spendActions(actor, 1))) return null;
  const { result } = await rollCoordinatedAssault(actor, targetToken);
  if (!result) return null;
  if (result.outcome === "criticalFailure") {
    await addFearFromCoordinatedAssault(actor, target);
    await actor.update({ "system.combat.-=coordinatedAssault": null });
    return result;
  }
  if (!result.success) {
    await actor.update({ "system.combat.-=coordinatedAssault": null });
    return result;
  }
  const startingBonus = result.criticalSuccess ? 1 : 0;
  await actor.update({
    "system.combat.coordinatedAssault": {
      targetActorUuid: target.uuid,
      targetActorId: target.id,
      targetTokenId: targetToken.id,
      sourceQualityId: quality.id,
      bonus: startingBonus,
      attacksSuffered: startingBonus,
      markedAt: Date.now(),
      maintenanceSignature: turnSignature(actor)
    }
  });
  return result;
}

export function getCoordinatedAssaultBonus(attacker, target) {
  if (!attacker || !target) return { bonus: 0, sources: [] };
  const sources = [];
  const actors = Array.from(new Map((canvas?.tokens?.placeables ?? [])
    .filter((token) => token.actor)
    .map((token) => [token.actor.uuid, token.actor])).values());
  for (const source of actors) {
    const state = source.system?.combat?.coordinatedAssault;
    if (!state || !coordinatedAssaultQuality(source)) continue;
    if (!areActorsAllies(attacker, source) || !coordinatedAssaultTargetMatches(state, target)) continue;
    const value = Math.max(0, number(state.bonus));
    if (value > 0) sources.push({ actor: source, value });
  }
  return {
    bonus: sources.reduce((total, entry) => total + entry.value, 0),
    sources
  };
}

export async function incrementCoordinatedAssaultMarks(target) {
  if (!target) return;
  const actors = Array.from(new Map((canvas?.tokens?.placeables ?? [])
    .filter((token) => token.actor)
    .map((token) => [token.actor.uuid, token.actor])).values());
  for (const source of actors) {
    const state = foundry.utils.deepClone(source.system?.combat?.coordinatedAssault ?? null);
    if (!state || !coordinatedAssaultTargetMatches(state, target) || !coordinatedAssaultQuality(source)) continue;
    state.attacksSuffered = Math.max(0, number(state.attacksSuffered)) + 1;
    state.bonus = Math.max(0, number(state.bonus)) + 1;
    await source.update({ "system.combat.coordinatedAssault": state });
  }
}

function responsibleAutomationUser(actor) {
  const users = (game?.users?.contents ?? []).filter((user) => user.active);
  const owners = users
    .filter((user) => !user.isGM)
    .filter((user) => actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return owners[0] ?? users.filter((user) => user.isGM).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

async function maintainCoordinatedAssaultForActiveUnit(combat) {
  const activeUnitId = getCombatantUnitId(combat?.combatant);
  const actors = (combat?.combatants?.contents ?? [])
    .filter((combatant) => !activeUnitId || getCombatantUnitId(combatant) === activeUnitId)
    .map((combatant) => combatant.actor)
    .filter(isDigimon);

  for (const actor of actors) {
    const state = foundry.utils.deepClone(actor.system?.combat?.coordinatedAssault ?? null);
    if (!state || state.maintenanceSignature === turnSignature(actor)) continue;
    if (responsibleAutomationUser(actor)?.id !== game.user.id) continue;
    if (!coordinatedAssaultQuality(actor)) {
      await actor.update({ "system.combat.-=coordinatedAssault": null });
      continue;
    }

    let target = null;
    try {
      target = await fromUuid(state.targetActorUuid);
    } catch (_error) {
      target = null;
    }
    const targetToken = canvas?.tokens?.get(state.targetTokenId)
      ?? canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === target?.uuid);
    if (!target || !targetToken || targetToken.document?.hidden) {
      await actor.update({ "system.combat.-=coordinatedAssault": null });
      continue;
    }

    const maintain = await Dialog.confirm({
      title: text("Manter Ataque Coordenado", "Maintain Coordinated Assault"),
      content: `<p>${text(
        `Deseja repetir o Teste para manter <strong>${foundry.utils.escapeHTML(target.name)}</strong> Marcado?`,
        `Repeat the Check to keep <strong>${foundry.utils.escapeHTML(target.name)}</strong> Marked?`
      )}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: true
    });

    if (!maintain) {
      await actor.update({ "system.combat.-=coordinatedAssault": null });
      continue;
    }

    const { result } = await rollCoordinatedAssault(actor, targetToken, { maintenance: true });
    if (!result?.success) {
      await actor.update({ "system.combat.-=coordinatedAssault": null });
      continue;
    }
    state.maintenanceSignature = turnSignature(actor);
    await actor.update({ "system.combat.coordinatedAssault": state });
  }
}

async function useCalledShot(actor) {
  const targetToken = selectedTarget();
  if (!targetToken?.actor) {
    ui.notifications.warn(text("Selecione exatamente um alvo.", "Select exactly one target."));
    return null;
  }
  const mode = await choose(text("Tiro Localizado", "Called Shot"), text("Modo", "Mode"), [
    { value: "sharpshooter", label: text("Atirador de Elite", "Sharpshooter") },
    { value: "focused", label: text("Focado", "Focused") }
  ]);
  if (!mode) return null;
  const combatId = String(game?.combat?.id ?? "");
  if (mode === "focused" && String(actor.system?.combat?.digimonActionUses?.focusedCalledShotCombatId ?? "") === combatId) {
    ui.notifications.warn(text("O Tiro Focado já acertou neste Combate.", "Focused Called Shot already succeeded this Combat."));
    return null;
  }
  const attack = await chooseAttack(actor, text("Ataque do Tiro Localizado", "Called Shot Attack"));
  if (!attack) return null;
  const attackData = JSON.stringify(attack.toObject?.() ?? attack).toLowerCase();
  if (/t:(blast|burst|cone|line|pass|wave)/.test(attackData)) {
    ui.notifications.warn(text("Tiro Localizado exige um Ataque que não seja de Área.", "Called Shot requires a non-Area Attack."));
    return null;
  }
  if (mode === "focused" && !attack.system?.effectTag?.enabled) {
    ui.notifications.warn(text("O modo Focado exige um Ataque com Tag de Efeito.", "Focused mode requires an Attack with an Effect Tag."));
    return null;
  }
  const targetSv = Math.max(0, number(getActorSv(targetToken.actor)));
  const { rollAttack } = await import("../rolls/attack-roll.js");
  const result = await rollAttack(actor, attack, {
    targetToken,
    actionCostOverride: 2,
    accuracyDiceModifier: -targetSv,
    calledShotMode: mode
  });
  if (mode === "focused" && result?.hit && Number(result.leftoverSuccesses ?? 0) >= 1) {
    await actor.update({ [`${ACTION_USE_PATH}.focusedCalledShotCombatId`]: combatId });
  }
  return result;
}

async function useHoldBreath(actor) {
  if (!(await spendActions(actor, 1))) return null;
  const effects = getEffectList(actor);
  effects.push({
    id: foundry.utils.randomID(),
    tag: "holdBreath",
    label: text("Prender a Respiração", "Hold Breath"),
    value: 1,
    duration: 1,
    remaining: 1,
    sourceActorUuid: actor.uuid
  });
  await actor.update({ "system.effects.active": effects });
  return true;
}

async function useEvolution(actor) {
  if (!checkActorActionSpend(actor, 2)) return null;

  const { evolveIndependentDigimon } = await import("./evolution.js");
  const result = await evolveIndependentDigimon(actor);
  if (!result) return null;

  if (!(await spendActions(actor, 2))) return null;
  return result;
}

export function prepareDigimonActionPoolOptions(actor, statKey, options = {}) {
  const matching = getEffectList(actor).filter((effect) =>
    POOL_EFFECT_TAGS.has(String(effect.tag ?? ""))
    && ((effect.poolStats ?? []).includes("*") || (effect.poolStats ?? []).includes(statKey))
  );
  if (!matching.length) return { ...options };
  return {
    ...options,
    diceModifier: number(options.diceModifier) + matching.reduce((total, effect) => total + Math.max(0, number(effect.value ?? effect.potency)), 0),
    externalLabel: [options.externalLabel, ...matching.map((effect) => effect.label)].filter(Boolean).join(" + "),
    modifierBreakdown: [
      ...(Array.isArray(options.modifierBreakdown) ? options.modifierBreakdown : []),
      ...matching.map((effect) => ({
        id: effect.id,
        label: String(effect.label ?? effect.tag ?? text("Ação do Digimon", "Digimon Action")),
        value: Math.max(0, number(effect.value ?? effect.potency)),
        kind: String(effect.tag ?? "digimonAction")
      }))
    ],
    ddaDigimonActionEffectIds: matching.map((effect) => effect.id).filter(Boolean)
  };
}

export async function consumeDigimonActionPoolEffects(actor, options = {}) {
  const ids = new Set(options.ddaDigimonActionEffectIds ?? []);
  if (!ids.size) return false;
  const effects = getEffectList(actor);
  const remaining = effects.filter((effect) => !ids.has(effect.id));
  if (remaining.length === effects.length) return false;
  await actor.update({ "system.effects.active": remaining });
  actor.sheet?.render(false);
  return true;
}

const DIGIMON_ACTION_MENU_ENTRIES = [
  {
    key: "move",
    titleKey: "DDA.DigimonAction.Move.Title",
    summaryKey: "DDA.DigimonAction.Move.Summary",
    cost: "1A"
  },
  {
    key: "attack",
    titleKey: "DDA.DigimonAction.Attack.Title",
    summaryKey: "DDA.DigimonAction.Attack.Summary",
    cost: "1A"
  },
  {
    key: "difficultMove",
    titleKey: "DDA.DigimonAction.DifficultMove.Title",
    summaryKey: "DDA.DigimonAction.DifficultMove.Summary",
    cost: "2A"
  },
  {
    key: "holdBack",
    titleKey: "DDA.DigimonAction.HoldBack.Title",
    summaryKey: "DDA.DigimonAction.HoldBack.Summary",
    cost: "1A"
  },
  {
    key: "check",
    titleKey: "DDA.DigimonAction.Check.Title",
    summaryKey: "DDA.DigimonAction.Check.Summary",
    cost: "2A"
  },
  {
    key: "stance",
    titleKey: "DDA.DigimonAction.Stance.Title",
    summaryKey: "DDA.DigimonAction.Stance.Summary",
    cost: "1A"
  },
  {
    key: "clash",
    titleKey: "DDA.DigimonAction.Clash.Title",
    summaryKey: "DDA.DigimonAction.Clash.Summary",
    cost: "1A"
  },
  {
    key: "resist",
    titleKey: "DDA.DigimonAction.Resist.Title",
    summaryKey: "DDA.DigimonAction.Resist.Summary",
    cost: "1–2A"
  },
  {
    key: "bolster",
    titleKey: "DDA.DigimonAction.Bolster.Title",
    summaryKey: "DDA.DigimonAction.Bolster.Summary",
    cost: "+1A"
  },
  {
    key: "aid",
    titleKey: "DDA.DigimonAction.Aid.Title",
    summaryKey: "DDA.DigimonAction.Aid.Summary",
    cost: "1A"
  },
  {
    key: "guard",
    titleKey: "DDA.DigimonAction.Guard.Title",
    summaryKey: "DDA.DigimonAction.Guard.Summary",
    cost: "1A"
  },
  {
    key: "calledShot",
    titleKey: "DDA.DigimonAction.CalledShot.Title",
    summaryKey: "DDA.DigimonAction.CalledShot.Summary",
    cost: "2A"
  },
  {
    key: "holdBreath",
    titleKey: "DDA.DigimonAction.HoldBreath.Title",
    summaryKey: "DDA.DigimonAction.HoldBreath.Summary",
    cost: "1A"
  }
];

function renderDigimonActionMenuEntry(entry) {
  return `
    <button type="button" data-digimon-action="${entry.key}">
      <strong>
        ${localize(entry.titleKey, entry.key)}
        <span>${entry.cost}</span>
      </strong>
      <small>${localize(entry.summaryKey, "")}</small>
    </button>
  `;
}

export async function openDigimonActionMenu(actor) {
  if (!isDigimon(actor)) {
    ui.notifications.warn(
      localize(
        "DDA.DigimonAction.Warning.DigimonOnly",
        "Apenas Digimon podem usar este menu."
      )
    );
    return null;
  }

  const menuEntries = [...DIGIMON_ACTION_MENU_ENTRIES];

  if (coordinatedAssaultQuality(actor)) {
    menuEntries.splice(11, 0, {
      key: "coordinatedAssault",
      titleKey: "DDA.DigimonAction.CoordinatedAssault.Title",
      summaryKey: "DDA.DigimonAction.CoordinatedAssault.Summary",
      cost: "1A"
    });
  }

  if (actor.type === "npc") {
    menuEntries.push({
      key: "evolution",
      titleKey: "DDA.DigimonAction.Evolution.Title",
      summaryKey: "DDA.DigimonAction.Evolution.Summary",
      cost: "2A"
    });
  }

  const handlers = {
    move: () => useMove(actor),
    attack: () => useAttack(actor),
    difficultMove: () => useMove(actor, true),
    holdBack: () => useAttack(actor, true),
    check: () => useCheck(actor),
    stance: () => useStance(actor),
    clash: async () => {
      const { initiateDigimonClash } = await import("./clash.js");
      return initiateDigimonClash(actor);
    },
    resist: () => useResist(actor),
    bolster: () => useBolster(actor),
    aid: () => useAid(actor),
    guard: () => useGuard(actor),
    coordinatedAssault: () => useCoordinatedAssault(actor),
    calledShot: () => useCalledShot(actor),
    holdBreath: () => useHoldBreath(actor),
    evolution: () => useEvolution(actor)
  };

  return new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.DigimonAction.Menu.Title", "Ações do Digimon"),
      content: `
        <div class="dda-digimon-action-menu">
          <p>${localize(
            "DDA.DigimonAction.Menu.Hint",
            "Cada ação consome somente os recursos deste Digimon."
          )}</p>
          <div class="dda-digimon-action-grid">
            ${menuEntries.map(renderDigimonActionMenuEntry).join("")}
          </div>
        </div>
      `,
      buttons: {
        close: {
          label: localize("DDA.Button.Close", "Fechar"),
          callback: () => resolve(null)
        }
      },
      render: (html) => {
        html.find("[data-digimon-action]").on("click", async (event) => {
          event.preventDefault();
          const key = String(event.currentTarget.dataset.digimonAction ?? "");
          const result = await handlers[key]?.();
          resolve(result ?? null);
          html.closest(".window-app").find(".window-header .close").trigger("click");
        });
      },
      close: () => resolve(null)
    }, { classes: ["dda", "dda-digimon-action-dialog"] }).render(true);
  });
}

async function expireSourceTurnEffects(combat) {
  const activeCombatant = combat?.combatant;
  const activeUnitId = getCombatantUnitId(activeCombatant);
  const sourceActors = (combat?.combatants?.contents ?? [])
    .filter((combatant) => !activeUnitId || getCombatantUnitId(combatant) === activeUnitId)
    .map((combatant) => combatant.actor)
    .filter(isDigimon);
  if (!sourceActors.length && isDigimon(activeCombatant?.actor)) sourceActors.push(activeCombatant.actor);
  if (!sourceActors.length) return;
  const actors = Array.from(new Map([
    ...(game?.actors?.contents ?? []).map((actor) => [actor.uuid, actor]),
    ...(canvas?.tokens?.placeables ?? []).filter((token) => token.actor).map((token) => [token.actor.uuid, token.actor])
  ]).values());
  for (const sourceActor of sourceActors) {
    const currentSignature = turnSignature(sourceActor);
    for (const actor of actors) {
      const effects = getEffectList(actor);
      const remaining = effects.filter((effect) => !(
        POOL_EFFECT_TAGS.has(String(effect.tag ?? ""))
        && effect.expiresOn === "sourceTurnStart"
        && effect.sourceActorUuid === sourceActor.uuid
        && effect.createdTurnSignature !== currentSignature
      ));
      if (remaining.length !== effects.length) await actor.update({ "system.effects.active": remaining });
    }
  }
}

export function registerDigimonActions() {
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("turn" in changed) && !("round" in changed)) return;
    void expireSourceTurnEffects(combat);
    void maintainCoordinatedAssaultForActiveUnit(combat);
  });
  game.dda ??= {};
  game.dda.digimonActions = {
    open: openDigimonActionMenu,
    preparePoolOptions: prepareDigimonActionPoolOptions,
    consumePoolEffects: consumeDigimonActionPoolEffects
  };
}
