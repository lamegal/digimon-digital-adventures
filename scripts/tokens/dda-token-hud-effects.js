import { EFFECT_TAGS, getActorDerivedStat } from "../rules/quality-automation.js";
import {
  expireNonStackingTemporaryWounds,
  grantNonStackingTemporaryWounds
} from "../combat/temporary-wounds.js";

const SYSTEM_ID = "digimon-digital-adventures";
const SUPPORTED_ACTOR_TYPES = new Set(["digimon", "npc"]);
const MAX_NORMAL_DURATION = 3;
const OPEN_PALETTES = new Set();

const EXTRA_EFFECTS = {
  bastion: { type: "positive", stat: "all", duration: true, magnitude: true },
  debilitate: { type: "negative", stat: "all", duration: true, magnitude: true }
};

const EFFECT_GROUPS = [
  {
    key: "positive",
    labelPt: "P — Positivos",
    labelEn: "P — Positive",
    tags: [
      "keen", "swift", "tailwind", "nimble", "sharpen", "sturdy", "daring",
      "fury", "regen", "steady", "strength", "vigil", "vigor", "shield", "bastion"
    ]
  },
  {
    key: "negative",
    labelPt: "N — Negativos",
    labelEn: "N — Negative",
    tags: [
      "root", "slow", "vague", "confuse", "distract", "dull", "frail", "heavy",
      "exploit", "pacify", "paralyze", "rattled", "shaken", "weak", "debilitate"
    ]
  },
  {
    key: "damage",
    labelPt: "D — Dano",
    labelEn: "D — Damage",
    tags: ["burn", "freeze", "poison", "ruin"]
  },
  {
    key: "unique",
    labelPt: "U — Unique",
    labelEn: "U — Unique",
    tags: ["fear", "doom", "taunt", "haste", "immune", "blind", "deny", "dot", "stun"]
  }
];

const SHORT_LABELS = {
  tailwind: "TAIL",
  sharpen: "SHRP",
  sturdy: "STDY",
  strength: "STR",
  bastion: "BAST",
  confuse: "CONF",
  distract: "DIST",
  paralyze: "PARA",
  rattled: "RATL",
  shaken: "SHAK",
  debilitate: "DEBI",
  poison: "PSN",
  immune: "IMM"
};

const EFFECT_DESCRIPTIONS = {
  keen: ["Aumenta a Precisão.", "Raises Accuracy."],
  swift: ["Aumenta a Esquiva.", "Raises Dodge."],
  tailwind: ["Aumenta o Movimento.", "Raises Movement."],
  nimble: ["Aumenta a Precisão e a Esquiva.", "Raises Accuracy and Dodge."],
  sharpen: ["Aumenta o Dano.", "Raises Damage."],
  sturdy: ["Aumenta a Armadura.", "Raises Armor."],
  daring: ["Aumenta a Precisão e a Armadura.", "Raises Accuracy and Armor."],
  fury: ["Aumenta a Precisão e o Dano.", "Raises Accuracy and Damage."],
  regen: ["Recupera Ferimentos e pode impedir um golpe fatal.", "Heals Wounds and can prevent a fatal blow."],
  steady: ["Aumenta o Dano e a Esquiva.", "Raises Damage and Dodge."],
  strength: ["Aumenta o Dano e a Armadura.", "Raises Damage and Armor."],
  vigil: ["Aumenta a Esquiva e a Armadura.", "Raises Dodge and Armor."],
  vigor: ["Aumenta a Esquiva e o Movimento.", "Raises Dodge and Movement."],
  shield: ["Concede Caixas de Ferimento Temporárias.", "Grants Temporary Wound Boxes."],
  bastion: ["Aumenta todas as Estatísticas, exceto Saúde.", "Raises every Stat except Health."],
  root: ["Reduz o Movimento.", "Reduces Movement."],
  slow: ["Reduz a Esquiva.", "Reduces Dodge."],
  vague: ["Reduz a Precisão.", "Reduces Accuracy."],
  confuse: ["Reduz a maior Estatística Derivada aplicável.", "Reduces the greatest applicable Derived Stat."],
  distract: ["Reduz a Precisão e a Esquiva.", "Reduces Accuracy and Dodge."],
  dull: ["Reduz o Dano.", "Reduces Damage."],
  frail: ["Reduz a Armadura.", "Reduces Armor."],
  heavy: ["Remove opções adicionais de Movimento.", "Removes additional Movement options."],
  exploit: ["Reduz a Esquiva e a Armadura.", "Reduces Dodge and Armor."],
  pacify: ["Reduz a Precisão e o Dano.", "Reduces Accuracy and Damage."],
  paralyze: ["Reduz a Esquiva e limita a mobilidade.", "Reduces Dodge and limits mobility."],
  rattled: ["Reduz o Dano e a Esquiva.", "Reduces Damage and Dodge."],
  shaken: ["Reduz a Precisão e a Armadura.", "Reduces Accuracy and Armor."],
  weak: ["Reduz o Dano e a Armadura.", "Reduces Damage and Armor."],
  debilitate: ["Reduz todas as Estatísticas, exceto Saúde.", "Reduces every Stat except Health."],
  burn: ["Causa Dano baseado no Movimento.", "Deals Damage based on Movement."],
  freeze: ["Causa Dano se o alvo não se mover.", "Deals Damage if the target does not Move."],
  poison: ["Causa Dano baseado na CPU do alvo.", "Deals Damage based on the target's CPU."],
  ruin: ["Causa Dano baseado no BIT do conjurador.", "Deals Damage based on the caster's BIT."],
  fear: ["Penaliza ataques contra o conjurador, aproximação e Clash.", "Penalizes attacks against the caster, approach, and Clashing."],
  doom: ["Impede cura conforme seu limiar.", "Prevents healing according to its threshold."],
  taunt: ["Penaliza ataques contra outros e mantém o alvo próximo.", "Penalizes attacks against others and keeps the target close."],
  haste: ["Concede uma Ação adicional.", "Grants one additional Action."],
  immune: ["Reduz a Potência de Efeitos Negativos recebidos.", "Reduces the Potency of incoming Negative Effects."],
  blind: ["Cega o alvo.", "Blinds the target."],
  deny: ["Nega o primeiro Efeito que seria aplicado.", "Denies the first Effect that would be applied."],
  dot: ["Transforma o alvo em Sprite: perde benefícios de Ataque e ganha Esquiva.", "Turns the target into a Sprite: loses Attack benefits and gains Dodge."],
  stun: ["Remove uma Ação.", "Removes one Action."]
};

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, number(value, minimum)));
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
  return String(value ?? "").trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function effectDefinition(tag) {
  return EFFECT_TAGS[tag] ?? EXTRA_EFFECTS[tag] ?? {};
}

function effectType(tag) {
  return String(effectDefinition(tag).type ?? "unique").toLowerCase();
}

function isSpecialDuration(tag) {
  return effectDefinition(tag).duration === "special";
}

function usesPotency(tag) {
  const type = effectType(tag);
  return type === "positive" || type === "negative" || tag === "poison" || tag === "ruin";
}

function usesValue(tag) {
  return ["fear", "doom", "taunt", "bastion", "debilitate"].includes(tag);
}

function paletteKey(token) {
  return String(token?.document?.uuid ?? token?.document?.id ?? token?.id ?? "");
}

function elementFrom(value) {
  if (value instanceof HTMLElement) return value;
  if (value?.[0] instanceof HTMLElement) return value[0];
  return null;
}

function activeEffects(actor) {
  return Array.isArray(actor?.system?.effects?.active) ? actor.system.effects.active : [];
}

function findEffectIndex(effects, tag) {
  return effects.findIndex((effect) => normalizeTag(effect.tag) === tag);
}

function findEffect(actor, tag) {
  return activeEffects(actor).find((effect) => normalizeTag(effect.tag) === tag) ?? null;
}

function getDerived(actor, stat) {
  if (!actor || !stat) return 0;
  return Math.max(0, number(getActorDerivedStat(actor, stat), 0));
}

function defaultPotency(actor, tag, sourceActor = null) {
  if (tag === "poison") return Math.max(2, getDerived(actor, "cpu"));
  if (tag === "ruin") return Math.max(2, getDerived(sourceActor, "bit"));
  if (tag === "shield") return 2;
  if (tag === "bastion" || tag === "debilitate") return 1;
  const stat = String(effectDefinition(tag).potency ?? "").toLowerCase();
  return Math.max(2, getDerived(sourceActor, stat));
}

function defaultValue(tag, sourceActor = null) {
  if (tag === "fear" || tag === "doom") return Math.max(2, getDerived(sourceActor, "dos"));
  if (tag === "taunt") return Math.max(2, getDerived(sourceActor, "cpu"));
  if (tag === "bastion" || tag === "debilitate") return 1;
  return 0;
}

function defaultConfuseStat(actor) {
  const candidates = [
    { stat: "accuracy", derived: "bit" },
    { stat: "damage", derived: "cpu" },
    { stat: "dodge", derived: "ram" },
    { stat: "armor", derived: "dos" }
  ].map((entry) => ({
    ...entry,
    derivedValue: getDerived(actor, entry.derived),
    mainValue: number(actor?.system?.mainStats?.[entry.stat]?.total, 0)
  }));
  candidates.sort((left, right) => right.derivedValue - left.derivedValue || right.mainValue - left.mainValue);
  return candidates[0]?.stat ?? "accuracy";
}

function sourceActors(targetActor) {
  const sceneActors = (canvas?.scene?.tokens ?? []).map((token) => token.actor).filter(Boolean);
  const controlledActors = (canvas?.tokens?.controlled ?? []).map((token) => token.actor).filter(Boolean);
  const actors = [...controlledActors, ...sceneActors]
    .filter((actor) => SUPPORTED_ACTOR_TYPES.has(String(actor.type ?? "")))
    .filter((actor) => actor.uuid !== targetActor?.uuid);
  return [...new Map(actors.map((actor) => [actor.uuid ?? actor.id, actor])).values()];
}

function resolveSourceActor(sourceUuid) {
  if (!sourceUuid) return null;
  return sourceActors(null).find((actor) => actor.uuid === sourceUuid || actor.id === sourceUuid) ?? null;
}

function effectSourceLabel(effect) {
  return String(effect?.sourceActorName ?? "").trim() || text("Manual — relógio do alvo", "Manual — target clock");
}

function getEffectTooltip(actor, tag) {
  const effect = findEffect(actor, tag);
  const type = effectType(tag).slice(0, 1).toUpperCase();
  const descriptions = EFFECT_DESCRIPTIONS[tag] ?? ["Efeito DDA.", "DDA Effect."];
  const details = [`[${tag.toUpperCase()}] — ${text(descriptions[0], descriptions[1])}`, `${text("Tipo", "Type")}: ${type}`];
  if (effect) {
    if (isSpecialDuration(tag)) details.push(text("Duração: Especial", "Duration: Special"));
    else details.push(`${text("Duração", "Duration")}: ${Math.max(0, number(effect.remaining ?? effect.duration, 1))}`);
    if (number(effect.potency, 0) > 0 && !usesValue(tag)) details.push(`${text("Potência", "Potency")}: ${number(effect.potency)}`);
    if (number(effect.value, 0) > 0 && usesValue(tag)) details.push(`${text("Valor", "Value")}: ${number(effect.value)}`);
    details.push(`${text("Origem", "Source")}: ${effectSourceLabel(effect)}`);
  }
  details.push(text("Esquerdo: +1 · Direito: −1 · Shift: configurar", "Left: +1 · Right: −1 · Shift: configure"));
  return details.join("\n");
}

function buildPaletteHtml(actor) {
  return `<div class="dda-token-effects-panel__head">
      <span><i class="fa-solid fa-microchip"></i> ${text("Efeitos DDA", "DDA Effects")}</span>
      <small>${text("Esq. +1 · Dir. −1 · Shift configura", "Left +1 · Right −1 · Shift configures")}</small>
    </div>
    <div class="dda-token-effects-panel__groups">
      ${EFFECT_GROUPS.map((group) => `<section class="dda-token-effects-group is-${group.key}">
        <h4>${text(group.labelPt, group.labelEn)}</h4>
        <div class="dda-token-effects-grid">
          ${group.tags.map((tag) => {
            const effect = findEffect(actor, tag);
            const remaining = effect ? Math.max(0, number(effect.remaining ?? effect.duration, 1)) : 0;
            const counter = effect ? (isSpecialDuration(tag) ? "S" : remaining) : "";
            const tooltip = escapeHtml(getEffectTooltip(actor, tag));
            return `<button type="button" class="dda-token-effect ${effect ? "is-active" : ""}" data-dda-effect-tag="${tag}" data-tooltip="${tooltip}" data-tooltip-direction="UP" title="${tooltip}" aria-label="${tooltip}">
              <span class="dda-token-effect__tag">${escapeHtml(SHORT_LABELS[tag] ?? tag.toUpperCase().slice(0, 4))}</span>
              ${effect ? `<span class="dda-token-effect__counter">${counter}</span>` : ""}
            </button>`;
          }).join("")}
        </div>
      </section>`).join("")}
    </div>`;
}

function setPanelBusy(panel, busy) {
  panel.classList.toggle("is-busy", busy);
  for (const button of panel.querySelectorAll("button")) button.disabled = busy;
}

function actorWoundsTempPath(actor) {
  return actor?.type === "character" ? "system.derived.wounds.temp" : "system.miscStats.wounds.temp";
}

async function clearShield(actor, effect = null) {
  return expireNonStackingTemporaryWounds(actor, {
    sourceId: "shield",
    effectId: String(effect?.id ?? "")
  });
}

async function applyShield(actor, amount, duration, existingEffect = null) {
  return grantNonStackingTemporaryWounds(actor, amount, {
    sourceId: "shield",
    label: "[SHIELD] — Token HUD",
    duration: String(duration ?? ""),
    effectId: String(existingEffect?.id ?? "")
  });
}

async function removeSpecialConsequences(actor, effect) {
  const tag = normalizeTag(effect?.tag);
  const updates = {};
  if (tag === "haste" && number(effect.actionGranted, 0) > 0) {
    const actions = Math.max(0, number(actor.system?.combat?.actions?.value, 0));
    const maximum = Math.max(0, number(actor.system?.combat?.actions?.max, 2));
    updates["system.combat.actions.value"] = Math.min(maximum, actions);
  }
  if (tag === "stun" && number(effect.actionRemoved, 0) > 0) {
    const actions = Math.max(0, number(actor.system?.combat?.actions?.value, 0));
    const maximum = Math.max(0, number(actor.system?.combat?.actions?.max, 2));
    updates["system.combat.actions.value"] = Math.min(maximum, actions + number(effect.actionRemoved, 0));
  }
  if (tag === "dot") updates["system.combat.dotAfflictedCombatId"] = "";
  if (Object.keys(updates).length) await actor.update(updates);
}

async function applySpecialConsequences(actor, effect) {
  const tag = normalizeTag(effect.tag);
  if (tag === "haste") {
    const actions = Math.max(0, number(actor.system?.combat?.actions?.value, 0));
    await actor.update({ "system.combat.actions.value": actions + 1 });
    effect.actionGranted = 1;
  }
  if (tag === "stun") {
    const actions = Math.max(0, number(actor.system?.combat?.actions?.value, 0));
    const removed = actions > 0 ? 1 : 0;
    if (removed) await actor.update({ "system.combat.actions.value": actions - 1 });
    effect.actionRemoved = removed;
    effect.activatesAtEndOfNextTurn = removed === 0;
    if (typeof game?.dda?.actions?.endDigimonClash === "function") {
      await game.dda.actions.endDigimonClash(actor, { reason: "stun", all: true });
    }
  }
  if (tag === "dot") {
    await actor.update({ "system.combat.dotAfflictedCombatId": game.combat?.id ?? "manual" });
  }
}

function buildEffectRecord(actor, tag, config = {}) {
  const sourceActor = resolveSourceActor(config.sourceActorUuid);
  const special = isSpecialDuration(tag);
  const duration = special ? 0 : clamp(config.duration ?? 1, 1, MAX_NORMAL_DURATION);
  const potency = Math.max(0, number(config.potency, defaultPotency(actor, tag, sourceActor)));
  const value = Math.max(0, number(config.value, defaultValue(tag, sourceActor)));
  const definition = effectDefinition(tag);
  return {
    id: foundry.utils.randomID(),
    tag,
    label: `[${tag.toUpperCase()}]`,
    sourceAttackId: "",
    sourceAttackName: text("Aplicação manual pelo Token HUD", "Manual Token HUD application"),
    sourceActorUuid: sourceActor?.uuid ?? "",
    sourceActorName: sourceActor?.name ?? "",
    targetActorUuid: actor.uuid ?? "",
    targetActorName: actor.name ?? "",
    appliedCombatId: game.combat?.id ?? "",
    appliedCombatRound: number(game.combat?.round, 0),
    appliedCombatTurn: number(game.combat?.turn, -1),
    effectType: effectType(tag),
    potencyStat: definition.potency ?? "",
    sourceStat: definition.potency ?? "",
    affectedStat: tag === "confuse" ? (config.affectedStat ?? defaultConfuseStat(actor)) : "",
    usesPotency: usesPotency(tag),
    usePotencyValue: usesPotency(tag) && !usesValue(tag),
    basePotency: potency,
    potencyBonus: 0,
    resistance: 0,
    potency,
    value: usesValue(tag) ? (value || potency) : 0,
    durationRule: special ? "special" : true,
    hasDuration: !special,
    hasSpecialDuration: special,
    duration,
    remaining: special ? 0 : duration,
    maxDuration: special ? 0 : MAX_NORMAL_DURATION,
    manualTokenHud: true,
    flags: { [SYSTEM_ID]: { manualTokenHud: true } }
  };
}

async function configureEffect(actor, tag, existing = null) {
  const candidates = sourceActors(actor);
  const currentDuration = isSpecialDuration(tag) ? 1 : clamp(existing?.remaining ?? existing?.duration ?? 1, 1, MAX_NORMAL_DURATION);
  const currentPotency = number(existing?.potency, defaultPotency(actor, tag));
  const currentValue = number(existing?.value, defaultValue(tag));
  const sourceOptions = [
    `<option value="">${text("Manual — duração no turno do alvo", "Manual — duration on target turn")}</option>`,
    ...candidates.map((candidate) => `<option value="${escapeHtml(candidate.uuid)}" ${candidate.uuid === existing?.sourceActorUuid ? "selected" : ""}>${escapeHtml(candidate.name)}</option>`)
  ].join("");
  const potencyField = usesPotency(tag) || usesValue(tag)
    ? `<div class="form-group"><label>${usesValue(tag) ? text("Valor", "Value") : text("Potência", "Potency")}</label><input type="number" name="magnitude" min="0" step="1" value="${usesValue(tag) ? currentValue : currentPotency}"></div>`
    : "";
  const durationField = isSpecialDuration(tag)
    ? `<p class="hint">${text("Este Efeito usa Duração Especial conforme 4.08.", "This Effect uses Special Duration under 4.08.")}</p>`
    : `<div class="form-group"><label>${text("Duração", "Duration")}</label><input type="number" name="duration" min="1" max="${MAX_NORMAL_DURATION}" step="1" value="${currentDuration}"></div>`;
  const confuseField = tag === "confuse"
    ? `<div class="form-group"><label>${text("Estatística afetada", "Affected Stat")}</label><select name="affectedStat">
        ${[["accuracy", "Precisão", "Accuracy"], ["damage", "Dano", "Damage"], ["dodge", "Esquiva", "Dodge"], ["armor", "Armadura", "Armor"]]
          .map(([value, pt, en]) => `<option value="${value}" ${(existing?.affectedStat ?? defaultConfuseStat(actor)) === value ? "selected" : ""}>${text(pt, en)}</option>`).join("")}
      </select></div>`
    : "";
  return foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-token-effect-dialog"],
    window: { title: `${text("Configurar", "Configure")} [${tag.toUpperCase()}]` },
    content: `<div class="dda-roll-dialog">
      ${durationField}${potencyField}${confuseField}
      <div class="form-group"><label>${text("Conjurador/origem", "Caster/source")}</label><select name="sourceActorUuid">${sourceOptions}</select></div>
    </div>`,
    ok: {
      label: text("Aplicar", "Apply"),
      callback: (_event, button) => {
        const form = button.form.elements;
        const magnitude = Math.max(0, number(form.magnitude?.value, 0));
        return {
          duration: isSpecialDuration(tag) ? 0 : clamp(form.duration?.value, 1, MAX_NORMAL_DURATION),
          potency: usesValue(tag) ? currentPotency : magnitude,
          value: usesValue(tag) ? magnitude : currentValue,
          affectedStat: String(form.affectedStat?.value ?? existing?.affectedStat ?? defaultConfuseStat(actor)),
          sourceActorUuid: String(form.sourceActorUuid?.value ?? "")
        };
      }
    },
    rejectClose: false,
    modal: true
  });
}

export function getDdaTokenEffectTooltip(actor, tagValue) {
  const tag = normalizeTag(tagValue);
  return getEffectTooltip(actor, tag);
}

export async function configureAndApplyDdaTokenEffect(actor, tagValue) {
  const tag = normalizeTag(tagValue);
  if (!actor || !SUPPORTED_ACTOR_TYPES.has(String(actor.type ?? ""))) {
    return { changed: false, reason: "unsupported" };
  }
  if (!EFFECT_GROUPS.some((group) => group.tags.includes(tag))) {
    return { changed: false, reason: "unknown" };
  }

  const configured = await configureEffect(actor, tag, findEffect(actor, tag));
  if (!configured) return { changed: false, reason: "cancelled" };
  return adjustDdaTokenEffect(actor, tag, 1, configured);
}

export async function adjustDdaTokenEffect(actor, tagValue, delta = 1, config = null) {
  const tag = normalizeTag(tagValue);
  if (!actor || !SUPPORTED_ACTOR_TYPES.has(String(actor.type ?? ""))) return { changed: false, reason: "unsupported" };
  if (!EFFECT_GROUPS.some((group) => group.tags.includes(tag))) return { changed: false, reason: "unknown" };

  const effects = foundry.utils.deepClone(activeEffects(actor));
  let index = findEffectIndex(effects, tag);
  const existing = index >= 0 ? effects[index] : null;

  if (config?.remove === true || delta < 0) {
    if (!existing) return { changed: false, reason: "missing" };
    if (!isSpecialDuration(tag)) {
      const next = Math.max(0, number(existing.remaining ?? existing.duration, 1) - 1);
      if (next > 0 && !config?.remove) {
        effects[index] = { ...existing, remaining: next };
        await actor.update({ "system.effects.active": effects });
        if (tag === "shield") await applyShield(actor, existing.tempWoundsRemaining ?? existing.tempWounds ?? existing.potency ?? 2, next, existing);
        return { changed: true, removed: false, remaining: next };
      }
    }
    effects.splice(index, 1);
    await removeSpecialConsequences(actor, existing);
    if (tag === "shield") await clearShield(actor, existing);
    await actor.update({ "system.effects.active": effects });
    actor.sheet?.render(false);
    return { changed: true, removed: true, remaining: 0 };
  }

  if (existing && !config) {
    if (isSpecialDuration(tag)) return { changed: false, reason: "special-active" };
    const current = Math.max(1, number(existing.remaining ?? existing.duration, 1));
    const next = Math.min(MAX_NORMAL_DURATION, current + Math.max(1, number(delta, 1)));
    if (next === current) return { changed: false, reason: "maximum", remaining: current };
    effects[index] = { ...existing, duration: Math.max(number(existing.duration, 1), next), remaining: next, maxDuration: MAX_NORMAL_DURATION };
    await actor.update({ "system.effects.active": effects });
    if (tag === "shield") await applyShield(actor, existing.tempWoundsRemaining ?? existing.tempWounds ?? existing.potency ?? 2, next, existing);
    return { changed: true, removed: false, remaining: next };
  }

  const record = buildEffectRecord(actor, tag, config ?? {});
  if (tag === "fear" || tag === "taunt") {
    const opposite = tag === "fear" ? "taunt" : "fear";
    const oppositeIndex = findEffectIndex(effects, opposite);
    if (oppositeIndex >= 0) effects.splice(oppositeIndex, 1);
    index = findEffectIndex(effects, tag);
  }

  if (existing && config) {
    await removeSpecialConsequences(actor, existing);
    effects[index] = { ...record, id: existing.id ?? record.id };
  } else {
    effects.push(record);
  }

  if (!existing || config) await applySpecialConsequences(actor, record);
  if (tag === "shield") {
    const amount = Math.max(0, number(config?.potency, record.potency || 2));
    record.tempWounds = amount;
    record.tempWoundsRemaining = amount;
    await applyShield(actor, amount, record.remaining, existing ?? record);
  }
  await actor.update({ "system.effects.active": effects });
  actor.sheet?.render(false);
  return { changed: true, removed: false, remaining: record.remaining, effect: record };
}

async function handleEffectInteraction(hud, panel, event, direction) {
  const button = event.target.closest("[data-dda-effect-tag]");
  if (!button || panel.classList.contains("is-busy")) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const actor = hud.actor ?? hud.object?.actor;
  const tag = normalizeTag(button.dataset.ddaEffectTag);
  setPanelBusy(panel, true);
  try {
    if (event.shiftKey && direction > 0) {
      const configured = await configureEffect(actor, tag, findEffect(actor, tag));
      if (configured) await adjustDdaTokenEffect(actor, tag, 1, configured);
    } else {
      const result = await adjustDdaTokenEffect(actor, tag, direction);
      if (result.reason === "maximum") ui.notifications.info(text("Duração máxima 3.", "Maximum Duration is 3."));
      if (result.reason === "special-active") ui.notifications.info(text("Este Efeito já está ativo e usa Duração Especial.", "This Effect is already active and uses Special Duration."));
    }
  } catch (error) {
    console.error("DDA | Token HUD Effect interaction failed.", error);
    ui.notifications.error(text("Não foi possível alterar o Efeito.", "The Effect could not be changed."));
  } finally {
    setPanelBusy(panel, false);
  }
}

function removeNativeStatusEffectsControl(root) {
  const selectors = [
    'button[data-action="effects"]',
    '.control-icon[data-action="effects"]',
    '[data-palette="effects"]'
  ];
  for (const control of root.querySelectorAll(selectors.join(","))) {
    if (!control.closest(".dda-token-effects-panel")) control.remove();
  }
}

function suppressPaletteEvent(event) {
  if (!event.target.closest(".dda-token-effects-panel, .dda-token-effect-toggle")) return;
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (event.type === "contextmenu") event.preventDefault();
}

function mountDdaTokenEffects(hud, html) {
  const root = elementFrom(html) ?? elementFrom(hud.element);
  if (!root) return;
  removeNativeStatusEffectsControl(root);
  if (!game.user?.isGM) return;
  const actor = hud.actor ?? hud.object?.actor;
  if (!actor || !SUPPORTED_ACTOR_TYPES.has(String(actor.type ?? ""))) return;
  if (root.querySelector(".dda-token-effect-toggle")) return;

  root.classList.add("dda-token-hud-enabled");
  const token = hud.object;
  const key = paletteKey(token);
  const control = document.createElement("button");
  control.type = "button";
  control.className = "control-icon dda-token-effect-toggle";
  control.title = text("Buffs e Status DDA", "DDA Buffs and Statuses");
  control.innerHTML = '<i class="fa-solid fa-microchip"></i>';

  const rightColumn = root.querySelector(".col.right, .right.col, [class~='right'][class~='col']");
  if (rightColumn) rightColumn.append(control);
  else {
    control.classList.add("is-floating");
    root.append(control);
  }

  const panel = document.createElement("section");
  panel.className = "dda-token-effects-panel";
  const viewportWidth = number(canvas?.app?.renderer?.screen?.width, window.innerWidth);
  const tokenCenterX = number(token?.center?.x, 0);
  if (viewportWidth > 0 && tokenCenterX > viewportWidth * 0.62) panel.classList.add("opens-left");
  panel.dataset.ddaTokenEffects = key;
  panel.innerHTML = buildPaletteHtml(actor);
  panel.hidden = !OPEN_PALETTES.has(key);
  root.append(panel);

  control.classList.toggle("active", !panel.hidden);
  for (const eventName of ["pointerdown", "mousedown", "mouseup"]) {
    root.addEventListener(eventName, suppressPaletteEvent, true);
  }
  control.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    panel.hidden = !panel.hidden;
    control.classList.toggle("active", !panel.hidden);
    if (panel.hidden) OPEN_PALETTES.delete(key);
    else OPEN_PALETTES.add(key);
  });
  control.addEventListener("contextmenu", suppressPaletteEvent, true);
  panel.addEventListener("click", (event) => void handleEffectInteraction(hud, panel, event, 1), true);
  panel.addEventListener("contextmenu", (event) => void handleEffectInteraction(hud, panel, event, -1), true);
}

function refreshBoundHud(actor) {
  const hud = canvas?.tokens?.hud;
  const boundActor = hud?.actor ?? hud?.object?.actor;
  if (!hud?.rendered || !boundActor || boundActor.uuid !== actor?.uuid) return;
  const root = elementFrom(hud.element);
  const panel = root?.querySelector(".dda-token-effects-panel");
  if (!panel) return;
  panel.innerHTML = buildPaletteHtml(actor);
  const key = paletteKey(hud.object);
  panel.hidden = !OPEN_PALETTES.has(key);
  root.querySelector(".dda-token-effect-toggle")?.classList.toggle("active", !panel.hidden);
}

export function registerDdaTokenHudEffects() {
  if (globalThis.__ddaTokenHudEffectsRegistered) return;
  globalThis.__ddaTokenHudEffectsRegistered = true;
  Hooks.on("renderTokenHUD", (hud, html) => mountDdaTokenEffects(hud, html));
  Hooks.on("updateActor", (actor, changed) => {
    if (!foundry.utils.hasProperty(changed, "system.effects.active")) return;
    refreshBoundHud(actor);
  });
}

export const DDA_TOKEN_HUD_EFFECT_GROUPS = EFFECT_GROUPS;
