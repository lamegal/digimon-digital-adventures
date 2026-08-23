import {
  areActorsAllies,
  areActorsAlliesForQualities,
  findQuality,
  getActorSv,
  rollDerivedCheck
} from "../rules/quality-automation.js";
import {
  getActiveDDAUnitContext,
  getCombatantForActor,
  getCombatantUnitId
} from "./initiative.js";
import {
  checkActorActionSpend,
  spendActorActions
} from "./action-economy.js";
import { openCompactActionMenu } from "./compact-action-menu.js";
import {
  doesBossTrueSightRevealHide,
  isActorUsingHideInPlainSight,
  isTokenVisibleToBossObserver
} from "./boss-qualities.js";
import {
  getTokenGridDistance
} from "./positioning.js";
import {
  getBullrushDifficultMoveActionCost,
  getNaturalExplorerFollowerEffect,
  isCalculatedAvailable,
  markCalculatedUsed,
  promptCalculatedReplacement,
  resolveTamerForPartner
} from "../rules/tamer-talent-runtime.js";

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
  const combatant = getCombatantForActor(combat, actor);
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

async function revealHiddenFromCreatureInteraction(actor, reason = "interaction") {
  if (!actor?.system?.status?.hidden) return false;
  const environment = await import("./environment.js");
  return environment.revealActorFromInteraction(actor, reason);
}


async function getDigimonBolsterContext(actor) {
  const tamer = await resolveTamerForPartner(actor);
  const defaultRange = Number(
    tamer?.system?.evolution?.defaultRange?.value
  );

  return {
    tamer,
    bonus: Number.isFinite(defaultRange) && defaultRange > 0
      ? Math.max(0, defaultRange)
      : Math.max(0, number(getActorSv(actor)))
  };
}

async function chooseBolsterForDigimonAction(actor, actionLabel) {
  const availableActions = Math.max(
    0,
    number(actor?.system?.combat?.actions?.value)
  );

  const context = await getDigimonBolsterContext(actor);

  if (availableActions < 2) {
    return {
      ...context,
      bolstered: false,
      calculated: false,
      actionCost: 1,
      diceBonus: 0,
      automaticSuccesses: 0
    };
  }

  const bolster = Boolean(
    await foundry.applications.api.DialogV2.confirm({
      classes: ["dda", "dda-digimon-action-dialog"],
      window: {
        title: `${actionLabel} + ${text("Fortalecer", "Bolster")}`
      },
      content: `
        <div class="dda-digimon-action-choice">
          <p>${text(
            `Gastar +1 Ação para Fortalecer esta Ação e adicionar +${context.bonus} dados?`,
            `Spend +1 Action to Bolster this Action and add +${context.bonus} dice?`
          )}</p>
        </div>
      `,
      yes: {
        label: text("Fortalecer", "Bolster")
      },
      no: {
        label: text("Sem Fortalecer", "Do Not Bolster")
      },
      rejectClose: false,
      modal: true
    })
  );

  if (!bolster) {
    return {
      ...context,
      bolstered: false,
      calculated: false,
      actionCost: 1,
      diceBonus: 0,
      automaticSuccesses: 0
    };
  }

  const calculated = Boolean(
    context.tamer &&
    isCalculatedAvailable(context.tamer) &&
    await promptCalculatedReplacement(
      context.tamer,
      `${actor.name} — ${actionLabel} + ${text("Fortalecer", "Bolster")}`
    )
  );

  return {
    ...context,
    bolstered: true,
    calculated,
    actionCost: 2,
    diceBonus: calculated ? 0 : context.bonus,
    automaticSuccesses: calculated ? 1 : 0
  };
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
  const distance = getTokenGridDistance(sourceToken, targetToken);
  const range = Math.max(0, number(
    actor.system?.miscStats?.range?.total
      ?? actor.system?.miscStats?.range?.value
      ?? actor.system?.miscStats?.range?.base
  ));
  return distance <= range;
}


function isUnavailableTarget(token) {
  const actor = token?.actor;
  if (!actor) return true;
  const combatant = game?.combat?.combatants?.find((entry) =>
    entry.tokenId === token.id || entry.actor?.uuid === actor.uuid
  );
  if (combatant?.defeated) return true;
  const wounds = number(
    actor.type === "character"
      ? actor.system?.derived?.wounds?.value
      : actor.system?.miscStats?.wounds?.value,
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

  const options = entries.map((entry) =>
    `<option value="${foundry.utils.escapeHTML(String(entry.value))}">${foundry.utils.escapeHTML(String(entry.label))}</option>`
  ).join("");

  return await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-digimon-action-dialog"],
    window: { title },
    content: `
      <div class="dda-digimon-action-choice">
        <div class="form-group">
          <label>${label}</label>
          <select name="choice">${options}</select>
        </div>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Confirmar", "Confirm"),
        default: true,
        callback: (event, button) => String(button.form?.elements?.choice?.value ?? "")
      },
      {
        action: "cancel",
        label: text("Cancelar", "Cancel"),
        callback: () => null
      }
    ],
    rejectClose: false
  });
}

async function chooseAttack(actor, title = text("Escolha o Ataque", "Choose the Attack")) {
  const { isAttackAvailableForCurrentMode } = await import("../rules/mode-change.js");
  const attacks = Array.from(actor.items ?? []).filter((item) => (
    item.type === "attack" &&
    isAttackAvailableForCurrentMode(actor, item) &&
    !item.flags?.["digimon-digital-adventures"]?.volatileExplosion
  ));
  const id = await choose(title, text("Ataque", "Attack"), attacks.map((item) => ({ value: item.id, label: item.name })));
  return id ? actor.items.get(id) : null;
}

async function useMove(actor, difficult = false) {
  const tracker = game.dda?.movementTracker;
  if (!tracker?.beginActionMovement) {
    ui.notifications.error(text("O rastreador de Movimento não está disponível.", "The Movement tracker is unavailable."));
    return null;
  }

  const naturalExplorerFollower = difficult
    ? getNaturalExplorerFollowerEffect(actor)
    : null;

  const baseActionCost =
    difficult && !naturalExplorerFollower
      ? 2
      : 1;

  const actionCost = difficult
    ? getBullrushDifficultMoveActionCost(actor, baseActionCost)
    : baseActionCost;

  return tracker.beginActionMovement(actor, {
    actionCost,
    actionKey: difficult && !naturalExplorerFollower ? "difficultMove" : "move",
    // A Difficult Move session always authorizes Difficult Terrain. If Natural
    // Explorer applies, the rules let this be paid as Move instead (1A).
    difficultTerrain: difficult,
    label: difficult ? text("Movimento Difícil", "Difficult Move") : text("Mover", "Move"),
    source: naturalExplorerFollower
      ? "naturalExplorerFollowerMove"
      : difficult
        ? "digimonDifficultMove"
        : "digimonMove"
  });
}

async function useAttack(actor, holdBack = false, options = {}) {
  const directAttack = options?.attack ?? null;
  const attack = directAttack ?? await chooseAttack(actor, holdBack ? text("Segurar o Golpe", "Hold Back") : text("Atacar", "Attack"));
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
  return rollAttack(actor, attack, { ...options, holdBack });
}

async function useCheck(actor, requestedStatKey = "") {
  const stats = Object.entries(actor.system?.mainStats ?? {})
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]) => ({ value: key, label: value.label ? game.i18n.localize(value.label) : key }));
  const statKey = requestedStatKey || await choose(text("Teste do Digimon", "Digimon Check"), text("Atributo", "Stat"), stats);
  if (!statKey || !(await spendActions(actor, 2))) return null;
  const { rollPool } = await import("../rolls/pool-roll.js");
  return rollPool(actor, statKey, { externalLabel: text("Teste — 2 Ações", "Check — 2 Actions") });
}

export function getDigimonAvailableStances(actor) {
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

function hasTacticalAdaptation(actor) {
  return Boolean(
    actor?.system?.qualityFeatures?.dataSpecialization?.tacticalAdaptationFreeChange
  );
}

export async function changeDigimonStance(actor, {
  forceFree = false,
  ignoreTurnLimit = false,
  useKey = "stanceChange",
  sourceLabel = "",
  stance: requestedStance = ""
} = {}) {
  const charmController = game?.dda?.bossQualities?.ensureCharmActionController;
  if (typeof charmController === "function" && !charmController(actor, { user: game?.user, notify: true })) return null;

  if (!ignoreTurnLimit && wasUsedThisTurn(actor, useKey)) {
    ui.notifications.warn(text("A Postura já foi alterada nesta ativação.", "Stance was already changed during this activation."));
    return null;
  }

  const stance = String(requestedStance ?? "").trim() || await choose(text("Mudar Postura", "Change Stance"), text("Nova Postura", "New Stance"), getDigimonAvailableStances(actor));
  if (!stance || stance === actor.system?.combat?.currentStance) return null;

  const tacticalFreeOnTurn = hasTacticalAdaptation(actor) && getActiveDDAUnitContext(actor).allowed;
  const actionCost = forceFree || tacticalFreeOnTurn ? 0 : 1;
  if (actionCost > 0 && !(await spendActions(actor, actionCost))) return null;

  const previousStance = String(actor.system?.combat?.currentStance ?? "neutral");
  await actor.update({ "system.combat.currentStance": stance });
  try {
    const { onStanceChanged } = await import("./stance-qualities.js");
    await onStanceChanged(actor, previousStance, stance);
  } catch (error) {
    console.warn("DDA | Could not resolve Stance Quality transition.", error);
  }
  await markUsedThisTurn(actor, useKey, {
    stance,
    actionCost,
    source: sourceLabel || (actionCost === 0 ? "tacticalAdaptation" : "stanceChange")
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-tactical-adaptation-card">
        <h2>${text("Mudança de Postura", "Stance Change")}</h2>
        <p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> ${text("assumiu uma nova Postura.", "entered a new Stance.")}</p>
        <ul class="dda-effect-list">
          <li>${text("Postura", "Stance")}: <strong>${foundry.utils.escapeHTML(game.i18n.localize(CONFIG.DDA?.stances?.[stance] ?? stance))}</strong>.</li>
          <li>${text("Custo", "Cost")}: <strong>${actionCost === 0 ? text("Ação Livre", "Free Action") : `${actionCost}A`}</strong>${sourceLabel ? ` — ${foundry.utils.escapeHTML(sourceLabel)}` : ""}.</li>
        </ul>
      </div>
    `
  });

  return stance;
}

async function chooseTacticalAdaptationMethod(actor, modeChangeQuality) {
  if (!modeChangeQuality) return "stance";
  const english = String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-core-quality-dialog", "dda-tactical-adaptation-dialog"],
    position: { width: 520, height: "auto" },
    window: { title: english ? "Tactical Adaptation" : "Adaptação Tática" },
    modal: true,
    content: `
      <div class="dda-core-choice-dialog">
        <header class="dda-core-choice-dialog__hero">
          <span>Data Specialization · Tactical Adaptation</span>
          <h2>${foundry.utils.escapeHTML(actor.name)}</h2>
          <p>${english
            ? "Choose whether to change Stance or activate Mode Change as a Free Action."
            : "Escolha entre mudar de Postura ou ativar Mudança de Modo como Ação Livre."}</p>
        </header>
      </div>
    `,
    buttons: [
      {
        action: "stance",
        label: english ? "Change Stance" : "Mudar Postura",
        icon: "fa-solid fa-person-running",
        default: true,
        callback: () => "stance"
      },
      {
        action: "mode",
        label: english ? "Mode Change" : "Mudança de Modo",
        icon: "fa-solid fa-arrows-rotate",
        callback: () => "mode"
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel", english ? "Cancel" : "Cancelar"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });
}

export async function useTacticalAdaptationChange(actor, { initiative = false, stance: requestedStance = "" } = {}) {
  const charmController = game?.dda?.bossQualities?.ensureCharmActionController;
  if (typeof charmController === "function" && !charmController(actor, { user: game?.user, notify: true })) return null;

  if (!hasTacticalAdaptation(actor)) return changeDigimonStance(actor);

  const modeChangeQuality = findQuality(actor, "modeChange");
  const method = requestedStance ? "stance" : await chooseTacticalAdaptationMethod(actor, modeChangeQuality);
  if (!method) return null;

  const sourceLabel = initiative
    ? text("Adaptação Tática — Iniciativa", "Tactical Adaptation — Initiative")
    : text("Adaptação Tática", "Tactical Adaptation");
  const useKey = initiative ? "tacticalAdaptationInitiative" : "stanceChange";

  if (wasUsedThisTurn(actor, useKey)) {
    ui.notifications.warn(text(
      initiative
        ? "A mudança gratuita da Iniciativa já foi usada."
        : "A mudança gratuita da Adaptação Tática já foi usada nesta ativação.",
      initiative
        ? "The free Initiative change was already used."
        : "Tactical Adaptation's free change was already used during this activation."
    ));
    return null;
  }

  if (method === "mode" && modeChangeQuality) {
    const { useModeChangeQuality } = await import("../rules/mode-change.js");
    const result = await useModeChangeQuality(actor, modeChangeQuality, {
      actionCostOverride: 0,
      freeSource: sourceLabel
    });
    if (result) {
      await markUsedThisTurn(actor, useKey, {
        modeChangeQualityId: modeChangeQuality.id,
        actionCost: 0,
        source: "tacticalAdaptation"
      });
    }
    return result;
  }

  return changeDigimonStance(actor, {
    forceFree: true,
    ignoreTurnLimit: initiative,
    useKey,
    sourceLabel,
    stance: requestedStance
  });
}

async function useResist(actor) {
  const available = Math.max(0, number(actor.system?.combat?.actions?.value));
  const choices = [1, 2].filter((cost) => cost <= available).map((cost) => ({ value: cost, label: `${cost}` }));
  const raw = await choose(text("Resistir", "Resist"), text("Ações", "Actions"), choices);
  const amount = number(raw);
  if (!amount || !(await spendActions(actor, amount))) return null;

  let immunityBonus = 0;
  try {
    const { getImmunityResistBonus } = await import("./preservation-qualities.js");
    immunityBonus = Math.max(0, number(getImmunityResistBonus(actor)));
  } catch (_error) {
    immunityBonus = 0;
  }
  const effectiveAmount = amount + immunityBonus;

  const effects = getEffectList(actor).flatMap((effect) => {
    if (effect.cannotReducePotency) return [effect];

    const effectType = String(effect.effectType ?? effect.type ?? "").toLowerCase();
    const usesPotency = Boolean(effect.usesPotency) || ["negative", "damage"].includes(effectType);

    /*
     * Resistir altera apenas Efeitos hostis que realmente possuem Potência.
     * Efeitos Únicos como BLIND, DENY, DOT e STUN não podem desaparecer
     * simplesmente por armazenarem 0 em potency/value.
     */
    if (!usesPotency || !["negative", "damage"].includes(effectType)) return [effect];

    const potency = Math.max(0, number(effect.potency ?? effect.value));
    if (potency <= 0) return [effect];

    const next = Math.max(0, potency - effectiveAmount);
    if (next <= 0) return [];
    return [{ ...effect, potency: next, value: next }];
  });
  await actor.update({ "system.effects.active": effects });
  return effectiveAmount;
}

async function useBolster(actor) {
  const bolsterContext = await getDigimonBolsterContext(actor);
  const tamer = bolsterContext.tamer;
  const calculated = Boolean(
    tamer &&
    isCalculatedAvailable(tamer) &&
    await promptCalculatedReplacement(
      tamer,
      text(`${actor.name} — Fortalecer`, `${actor.name} — Bolster`)
    )
  );

  if (!(await spendActions(actor, 1, { lightDigizoidAction: "bolster" }))) return null;

  const value = calculated
    ? 0
    : bolsterContext.bonus;

  await addPoolEffect(actor, {
    tag: "digimonBolster",
    label: calculated
      ? `${text("Fortalecer", "Bolster")} — Calculated`
      : text("Fortalecer", "Bolster"),
    value,
    automaticSuccesses: calculated ? 1 : 0,
    poolStats: ["*"],
    sourceActorUuid: actor.uuid,
    sourceTamerUuid: tamer?.uuid ?? "",
    calculated,
    bolsterBonus: bolsterContext.bonus
  });

  if (calculated) {
    await markCalculatedUsed(tamer, "digimonBolster");
  }

  return calculated ? 1 : value;
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

  const bolster = await chooseBolsterForDigimonAction(
    actor,
    text("Ajudar", "Aid")
  );

  if (!(await spendActions(actor, bolster.actionCost))) return null;
  await revealHiddenFromCreatureInteraction(actor, "aid");

  const baseValue = Math.max(0, number(getActorSv(actor)));
  const value = baseValue + bolster.diceBonus;

  await addPoolEffect(target, {
    tag: "digimonAid",
    label: `${text("Ajudar", "Aid")} — ${actor.name}${bolster.bolstered ? ` + ${text("Fortalecer", "Bolster")}` : ""}`,
    value,
    automaticSuccesses: bolster.automaticSuccesses,
    poolStats: ["accuracy", "dodge"],
    sourceActorUuid: actor.uuid,
    sourceTamerUuid: bolster.tamer?.uuid ?? "",
    createdTurnSignature: turnSignature(actor),
    bolstered: bolster.bolstered,
    calculated: bolster.calculated,
    bolsterBonus: bolster.bonus
  });

  if (bolster.calculated) {
    await markCalculatedUsed(bolster.tamer, "digimonAid");
  }

  await markUsedThisTurn(actor, "aid", {
    targetActorUuid: target.uuid,
    bolstered: bolster.bolstered
  });

  return {
    diceBonus: value,
    automaticSuccesses: bolster.automaticSuccesses,
    bolstered: bolster.bolstered,
    calculated: bolster.calculated
  };
}

async function useGuard(actor) {
  if (wasUsedThisTurn(actor, "guard")) {
    ui.notifications.warn(text("Guardar já foi usado nesta ativação.", "Guard was already used during this activation."));
    return null;
  }

  const bolster = await chooseBolsterForDigimonAction(
    actor,
    text("Guardar", "Guard")
  );

  if (!(await spendActions(actor, bolster.actionCost))) return null;

  const baseValue = Math.max(0, number(getActorSv(actor)));
  const value = baseValue + bolster.diceBonus;

  await addPoolEffect(actor, {
    tag: "digimonGuard",
    label: `${text("Guardar", "Guard")}${bolster.bolstered ? ` + ${text("Fortalecer", "Bolster")}` : ""}`,
    value,
    automaticSuccesses: bolster.automaticSuccesses,
    poolStats: ["dodge"],
    sourceActorUuid: actor.uuid,
    sourceTamerUuid: bolster.tamer?.uuid ?? "",
    bolstered: bolster.bolstered,
    calculated: bolster.calculated,
    bolsterBonus: bolster.bonus,
    dodgePenaltyProtected: true
  });

  if (bolster.calculated) {
    await markCalculatedUsed(bolster.tamer, "digimonGuard");
  }

  await markUsedThisTurn(actor, "guard", {
    bolstered: bolster.bolstered
  });

  return {
    diceBonus: value,
    automaticSuccesses: bolster.automaticSuccesses,
    bolstered: bolster.bolstered,
    calculated: bolster.calculated
  };
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


function hasFearFromTarget(actor, target) {
  if (!actor || !target) return false;
  return (actor.system?.effects?.active ?? []).some((effect) => {
    if (String(effect?.tag ?? "").trim().toLowerCase() !== "fear") return false;
    return actorReferenceKeys(target).has(String(effect?.sourceActorUuid ?? effect?.sourceActorId ?? ""));
  });
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
  if (!target || targetToken.document?.hidden || areActorsAlliesForQualities(actor, target)) {
    ui.notifications.warn(text("Selecione exatamente um inimigo visível.", "Select exactly one visible enemy."));
    return null;
  }
  if (!(await spendActions(actor, 1))) return null;
  await revealHiddenFromCreatureInteraction(actor, "coordinatedAssault");
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
    if (!areActorsAlliesForQualities(attacker, source) || !coordinatedAssaultTargetMatches(state, target)) continue;
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
  const charmIds = game?.dda?.bossQualities?.getCharmAuthorizedUserIds?.(actor, { includeGMs: false });
  const owners = Array.isArray(charmIds)
    ? users.filter((user) => !user.isGM && charmIds.includes(String(user.id)))
    : users
      .filter((user) => !user.isGM)
      .filter((user) => actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
  owners.sort((a, b) => String(a.id).localeCompare(String(b.id)));
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
    const sourceDefeated = Boolean(
      actor.system?.combat?.defeated ||
      Number(actor.system?.miscStats?.wounds?.value ?? 1) <= 0
    );
    const hiddenByHideInPlainSight = Boolean(
      isActorUsingHideInPlainSight(target) &&
      !doesBossTrueSightRevealHide(actor, target)
    );
    const targetOutOfSight = Boolean(
      !targetToken ||
      hiddenByHideInPlainSight ||
      !isTokenVisibleToBossObserver(actor, targetToken)
    );

    if (
      !target ||
      sourceDefeated ||
      targetOutOfSight ||
      hasFearFromTarget(actor, target)
    ) {
      await actor.update({ "system.combat.-=coordinatedAssault": null });
      continue;
    }

    const maintain = await foundry.applications.api.DialogV2.confirm({
      classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
      window: { title: text("Manter Ataque Coordenado", "Maintain Coordinated Assault") },
      content: `<div class="dda-confirm-dialog dda-offensive-quality-dialog"><p>${text(
        `Deseja repetir o Teste para manter <strong>${foundry.utils.escapeHTML(target.name)}</strong> Marcado?`,
        `Repeat the Check to keep <strong>${foundry.utils.escapeHTML(target.name)}</strong> Marked?`
      )}</p></div>`,
      yes: { label: text("Manter Marca", "Maintain Mark") },
      no: { label: text("Encerrar Marca", "End Mark") },
      rejectClose: false,
      modal: true
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
  const specialization = actor.system?.qualityFeatures?.dataSpecialization ?? {};
  const hasSniper = Boolean(specialization.sniper);
  const hasCodeWizard = Boolean(specialization.codeWizard);
  if (
    mode === "focused" &&
    !hasCodeWizard &&
    String(actor.system?.combat?.digimonActionUses?.focusedCalledShotCombatId ?? "") === combatId
  ) {
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
  const halvesPenalty = (mode === "sharpshooter" && hasSniper) ||
    (mode === "focused" && hasCodeWizard);
  const accuracyPenalty = halvesPenalty
    ? Math.ceil(targetSv / 2)
    : targetSv;
  const { rollAttack } = await import("../rolls/attack-roll.js");
  const result = await rollAttack(actor, attack, {
    targetToken,
    actionCostOverride: 2,
    accuracyDiceModifier: -accuracyPenalty,
    calledShotMode: mode,
    calledShotQuality: halvesPenalty
      ? (mode === "sharpshooter" ? "sniper" : "codeWizard")
      : ""
  });
  if (
    mode === "focused" &&
    !hasCodeWizard &&
    result?.hit &&
    Number(result.leftoverSuccesses ?? 0) >= 1
  ) {
    await actor.update({ [`${ACTION_USE_PATH}.focusedCalledShotCombatId`]: combatId });
  }
  return result;
}

async function useHoldBreath(actor) {
  const combat = game?.combat;
  const swim = actor?.system?.movementTypes?.swim ?? {};
  const advancedSwim = actor?.system?.qualityFeatures?.advancedMobility?.swim ?? {};
  const unlimited = Boolean(
    swim.isExtraMovement ||
    swim.indefiniteBreath ||
    advancedSwim.indefiniteBreath
  );

  let consumesUse = false;
  let holdState = foundry.utils.deepClone(
    actor.system?.combat?.holdBreath ?? {}
  );

  if (combat?.started && !unlimited) {
    const choice = await foundry.applications.api.DialogV2.wait({
      classes: ["dda", "dda-digimon-action-dialog"],
      window: { title: text("Prender a Respiração", "Hold Breath") },
      content: `
        <div class="dda-digimon-action-choice">
          <p>${text(
            "O Digimon ainda possui acesso a ar? O uso preventivo não consome um dos usos de CPU por Combate.",
            "Does the Digimon still have access to air? A pre-emptive use does not consume one of its CPU uses per Combat."
          )}</p>
        </div>
      `,
      buttons: [
        {
          action: "air",
          label: text("Sim — uso preventivo", "Yes — pre-emptive use"),
          callback: () => "air"
        },
        {
          action: "noAir",
          label: text("Não — sem acesso a ar", "No — no access to air"),
          default: true,
          callback: () => "noAir"
        }
      ],
      rejectClose: false,
      close: () => null,
      modal: true
    });

    if (!choice) return null;
    consumesUse = choice === "noAir";

    const combatId = String(combat.id ?? "");
    if (String(holdState.combatId ?? "") !== combatId) {
      holdState = {
        combatId,
        used: 0
      };
    }

    if (consumesUse) {
      const cpu = Math.max(
        0,
        number(actor.system?.derivedStats?.cpu?.value)
      );
      const used = Math.max(0, number(holdState.used));

      if (used >= cpu) {
        ui.notifications.warn(text(
          `${actor.name} já usou Prender a Respiração ${used}/${cpu} vezes neste Combate.`,
          `${actor.name} has already used Hold Breath ${used}/${cpu} times this Combat.`
        ));
        return null;
      }
    }
  }

  if (!(await spendActions(actor, 1))) return null;

  const effects = getEffectList(actor)
    .filter((effect) => String(effect?.tag ?? "") !== "holdBreath");

  effects.push({
    id: foundry.utils.randomID(),
    tag: "holdBreath",
    label: text("Prender a Respiração", "Hold Breath"),
    value: 1,
    duration: 1,
    remaining: 1,
    sourceActorUuid: actor.uuid,
    preemptive: !consumesUse,
    unlimited
  });

  const update = {
    "system.effects.active": effects
  };

  if (combat?.started && consumesUse && !unlimited) {
    update["system.combat.holdBreath"] = {
      combatId: String(combat.id ?? ""),
      used: Math.max(0, number(holdState.used)) + 1
    };
  }

  await actor.update(update);
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

  const guardProtectedDice = statKey === "dodge"
    ? matching
      .filter((effect) => String(effect.tag ?? "") === "digimonGuard")
      .reduce((total, effect) => total + Math.max(0, number(effect.value ?? effect.potency)), 0)
    : 0;

  return {
    ...options,
    diceModifier: number(options.diceModifier) + matching.reduce((total, effect) => total + Math.max(0, number(effect.value ?? effect.potency)), 0),
    automaticSuccesses: number(options.automaticSuccesses) + matching.reduce((total, effect) => total + Math.max(0, number(effect.automaticSuccesses)), 0),
    ddaDodgePenaltyProtectedDice:
      Math.max(0, number(options.ddaDodgePenaltyProtectedDice)) + guardProtectedDice,
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
  },
  {
    key: "hide",
    title: text("Ocultar-se", "Hide"),
    summary: text("Teste de Furtividade TN 10; exige estar fora de linha de visão, salvo se estiver Obscured.", "Stealth Check TN 10; requires being out of line of sight unless Obscured."),
    cost: "2A"
  },
  {
    key: "detectHidden",
    title: text("Detectar Oculto", "Detect Hidden"),
    summary: text("Teste de Awareness contra o resultado de Furtividade do alvo Oculto.", "Awareness Check against the Hidden target's Stealth result."),
    cost: "2A"
  },
  {
    key: "environment",
    title: text("Ambiente de Combate", "Combat Environment"),
    summary: text("Configure Obscured, Hidden, Submerged, Drowning e Cover.", "Configure Obscured, Hidden, Submerged, Drowning, and Cover."),
    cost: "—"
  }
];

export async function getDigimonActionMenuDefinition(actor) {
  if (!isDigimon(actor)) return null;
  const charmGate = game?.dda?.bossQualities?.ensureCharmActionController;
  if (typeof charmGate === "function" && !charmGate(actor, { user: game?.user, notify: false })) return null;

  if (actor.system?.clash?.state?.active) {
    const clashAutomation = await import("./clash.js");
    const entries = [{
      key: "clashActions",
      title: localize("DDA.Clash.ActionMenu.Title", "Ações de Clash"),
      summary: localize("DDA.Clash.ActionMenu.Hint", "Abra as ações disponíveis para o Clash atual."),
      cost: "—"
    }];

    if (clashAutomation.canInitiateAdditionalClash?.(actor)) {
      entries.push({
        key: "additionalClash",
        title: text("Iniciar outro Clash", "Initiate Another Clash"),
        summary: text(
          "Multigrappler: inicie um novo Clash sem encerrar os atuais, até o limite do Estágio.",
          "Multigrappler: initiate a new Clash without ending the current ones, up to the Stage limit."
        ),
        cost: "1A"
      });
    }

    return {
      actor,
      kind: "digimon",
      title: localize("DDA.DigimonAction.Menu.Title", "Ações do Digimon"),
      hint: localize("DDA.DigimonAction.Menu.Hint", "Cada ação consome somente os recursos deste Digimon."),
      entries,
      execute: async (key) => {
        if (key === "clashActions") return clashAutomation.openDigimonClashActionMenu(actor);
        if (key === "additionalClash") return clashAutomation.initiateDigimonClash(actor);
        return null;
      }
    };
  }

  const evokerAutomation = await import("./evoker-qualities.js");
  const evokerMinion = evokerAutomation.isEvokerCreation(actor, "minion");
  const baseMenuEntries = evokerMinion
    ? DIGIMON_ACTION_MENU_ENTRIES.filter((entry) => ["move", "attack", "aid"].includes(entry.key))
    : DIGIMON_ACTION_MENU_ENTRIES;
  const menuEntries = baseMenuEntries.map((entry) => (
    entry.key === "stance" && hasTacticalAdaptation(actor)
      ? { ...entry, cost: text("Livre", "Free") }
      : { ...entry }
  ));

  const movementTracker = game?.dda?.movementTracker;
  const activeMovement = movementTracker?.getActiveMovementData?.(actor) ?? null;
  if (!evokerMinion && activeMovement?.key === "jump" && activeMovement?.enabled !== false) {
    const moveIndex = menuEntries.findIndex((entry) => entry.key === "move");
    menuEntries.splice(Math.max(0, moveIndex + 1), 0, {
      key: "longJump",
      title: text("Salto Longo", "Long Jump"),
      summary: text(
        "Combine 2 Ações de Movimento em um único Salto contínuo em linha reta.",
        "Combine 2 Move Actions into one continuous straight-line Jump."
      ),
      cost: "2A"
    });
  }

  if (!evokerMinion) {
    for (const entry of evokerAutomation.getEvokerActionMenuEntries(actor)) menuEntries.push(entry);
    const gainForceAutomation = await import("./digizoid-gain-force.js");
    for (const entry of gainForceAutomation.getDigizoidGainForceActionMenuEntries(actor)) menuEntries.push(entry);
  }

  if (coordinatedAssaultQuality(actor)) {
    menuEntries.splice(11, 0, {
      key: "coordinatedAssault",
      titleKey: "DDA.DigimonAction.CoordinatedAssault.Title",
      summaryKey: "DDA.DigimonAction.CoordinatedAssault.Summary",
      cost: "1A"
    });
  }

  const { getClashQualityMenuEntries } = await import("./clash-qualities.js");
  for (const entry of getClashQualityMenuEntries(actor)) {
    menuEntries.push({
      key: entry.key,
      titleKey: "",
      summaryKey: "",
      title: entry.title,
      summary: entry.summary,
      cost: entry.cost
    });
  }

  const clashAutomation = await import("./clash.js");
  if (clashAutomation.canAttemptBreakClash?.(actor)) {
    menuEntries.push({
      key: "breakClash",
      titleKey: "DDA.Clash.Break.Title",
      summaryKey: "DDA.Clash.Break.MenuSummary",
      cost: "2A"
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

  const tamerTalentOrders = await import("../rules/tamer-talent-special-orders.js");
  const realizationDefense = tamerTalentOrders.getRealizationDefenseMenuEntry(actor);
  if (realizationDefense) menuEntries.push(realizationDefense);

  const handlers = {
    move: () => useMove(actor),
    longJump: () => game?.dda?.movementTracker?.beginLongJump?.(actor),
    attack: (options = {}) => useAttack(actor, false, options),
    difficultMove: () => useMove(actor, true),
    holdBack: (options = {}) => useAttack(actor, true, options),
    check: (options = {}) => useCheck(actor, options.statKey ?? ""),
    stance: (options = {}) => hasTacticalAdaptation(actor)
      ? useTacticalAdaptationChange(actor, { stance: options.stance ?? "" })
      : changeDigimonStance(actor, { stance: options.stance ?? "" }),
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
    hide: async () => (await import("./environment.js")).attemptHide(actor),
    detectHidden: async () => (await import("./environment.js")).attemptDetectHidden(actor),
    environment: async () => (await import("./environment.js")).openCombatEnvironmentDialog(actor),
    evolution: () => useEvolution(actor),
    fastball: async () => (await import("./clash-qualities.js")).executeClashQualityMenuAction(actor, "fastball"),
    giantHijacker: async () => (await import("./clash-qualities.js")).executeClashQualityMenuAction(actor, "giantHijacker"),
    endGiantHijacker: async () => (await import("./clash-qualities.js")).executeClashQualityMenuAction(actor, "endGiantHijacker"),
    shakeOffGiantHijacker: async () => (await import("./clash-qualities.js")).executeClashQualityMenuAction(actor, "shakeOffGiantHijacker"),
    distantForce: async () => (await import("./clash-qualities.js")).executeClashQualityMenuAction(actor, "distantForce"),
    breakClash: async () => (await import("./clash.js")).breakClashFromOutside(actor),
    defendRealization: () => tamerTalentOrders.defendRealizationWeakness(actor)
  };

  for (const key of ["conjure", "summon", "commandMinion", "omnievoker"]) {
    handlers[key] = () => evokerAutomation.executeEvokerActionMenuAction(actor, key);
  }
  for (const key of ["gainForceOverwrite", "gainForceHold", "gainForceTemporalAdjust", "gainForceSpendIp"]) {
    handlers[key] = async () => (await import("./digizoid-gain-force.js")).executeDigizoidGainForceAction(actor, key);
  }

  if (evokerMinion) {
    handlers.move = () => evokerAutomation.executeEvokerMinionAction(actor, "move", () => useMove(actor));
    handlers.attack = (options = {}) => evokerAutomation.executeEvokerMinionAction(actor, "attack", async () => {
      const attackOptions = await evokerAutomation.getEvokerMinionAttackOptions(actor);
      return useAttack(actor, false, { ...attackOptions, ...options });
    });
    handlers.aid = () => evokerAutomation.executeEvokerMinionAction(actor, "aid", () => evokerAutomation.useEvokerMinionAid(actor));
  }

  return {
    actor,
    kind: "digimon",
    title: localize("DDA.DigimonAction.Menu.Title", "Ações do Digimon"),
    hint: localize("DDA.DigimonAction.Menu.Hint", "Cada ação consome somente os recursos deste Digimon."),
    entries: menuEntries,
    notes: [],
    execute: (key, options = {}) => handlers[key]?.(options) ?? null
  };
}

export async function openDigimonActionMenu(actor) {
  if (!isDigimon(actor)) {
    ui.notifications.warn(localize("DDA.DigimonAction.Warning.DigimonOnly", "Apenas Digimon podem usar este menu."));
    return null;
  }

  const charmGate = game?.dda?.bossQualities?.ensureCharmActionController;
  if (typeof charmGate === "function" && !charmGate(actor, { user: game?.user, notify: true })) return null;

  const definition = await getDigimonActionMenuDefinition(actor);
  if (!definition) return null;

  if (actor.system?.clash?.state?.active && definition.entries?.length === 1) {
    return definition.execute("clashActions");
  }

  return openCompactActionMenu({
    actor,
    kind: definition.kind,
    title: definition.title,
    hint: definition.hint,
    entries: definition.entries,
    notes: definition.notes,
    onSelect: (key) => definition.execute(key)
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
    consumePoolEffects: consumeDigimonActionPoolEffects,
    tacticalAdaptation: useTacticalAdaptationChange
  };
}
