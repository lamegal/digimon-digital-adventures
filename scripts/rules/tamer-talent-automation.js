import { applyDamage } from "../rolls/damage-application.js";

/**
 * Shared runtime for official and homebrew Tamer Talents.
 *
 * The sheet is responsible for the confirmation dialog and chat-card rendering.
 * This module owns mechanical validation, target selection, automation execution,
 * and resource commitment. Resources are spent only after an automation either
 * succeeds or is intentionally manual/unconfigured.
 */

function localize(key, fallback = key) {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function formatI18n(key, data = {}, fallback = "") {
  const value = game?.i18n?.format?.(key, data);
  if (value && value !== key) return value;
  return fallback || key;
}

function getTalentSystem(talent) {
  return talent?.system ?? talent ?? {};
}

function getTalentAutomation(talent) {
  return getTalentSystem(talent).automation ?? talent?.automation ?? {};
}

function getTalentUses(tamer, talent, { source = "item" } = {}) {
  const baseUses = getTalentSystem(talent).uses ?? talent?.uses ?? {};

  if (!baseUses.enabled) {
    return { enabled: false, value: 0, max: 0, recharge: "" };
  }

  const max = Math.max(0, Number(baseUses.max ?? 0));
  const storedValue = source === "official"
    ? tamer?.system?.tamerTalentUses?.[talent.id]?.value
    : baseUses.value;

  return {
    enabled: true,
    value: Math.max(0, Number(storedValue ?? max)),
    max,
    recharge: String(baseUses.recharge ?? "")
  };
}

export function getTamerTalentActionCostNumber(actionCost = "") {
  const normalized = String(actionCost ?? "").trim().toLowerCase();

  if (!normalized || ["passive", "free", "interrupt"].includes(normalized)) {
    return 0;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function getFrequency(talent) {
  return String(
    getTalentSystem(talent).frequency ??
    talent?.frequency ??
    ""
  ).trim();
}

function getCombatIdentity() {
  const combat = game?.combat;
  const isActive = Boolean(combat?.started || Number(combat?.round ?? 0) > 0);

  return {
    active: isActive,
    combatId: combat?.id ?? "",
    round: Number(combat?.round ?? 0),
    turn: Number(combat?.turn ?? -1)
  };
}

function getTalentUsageState(tamer, talentId) {
  return tamer?.system?.combat?.tamerTalentUsage?.[talentId] ?? null;
}

function matchesCurrentCombat(state, combat) {
  return Boolean(
    state &&
    combat.active &&
    String(state.combatId ?? "") === String(combat.combatId ?? "")
  );
}

function isFrequencyAvailable(tamer, talent) {
  const frequency = getFrequency(talent);
  const combat = getCombatIdentity();

  if (!combat.active || !["oncePerTurn", "oncePerCombat"].includes(frequency)) {
    return { ok: true };
  }

  const state = getTalentUsageState(tamer, talent.id);

  if (frequency === "oncePerCombat" && matchesCurrentCombat(state, combat)) {
    return {
      ok: false,
      message: formatI18n(
        "DDA.Warning.TamerTalentAlreadyUsedThisCombat",
        { talent: talent.name },
        `${talent.name} já foi usado neste combate.`
      )
    };
  }

  if (
    frequency === "oncePerTurn" &&
    matchesCurrentCombat(state, combat) &&
    Number(state.round ?? -1) === combat.round &&
    Number(state.turn ?? -2) === combat.turn
  ) {
    return {
      ok: false,
      message: formatI18n(
        "DDA.Warning.TamerTalentAlreadyUsedThisTurn",
        { talent: talent.name },
        `${talent.name} já foi usado neste turno.`
      )
    };
  }

  return { ok: true };
}

export function validateTamerTalentUse(tamer, talent, options = {}) {
  if (!tamer || tamer.type !== "character") {
    return {
      ok: false,
      message: localize(
        "DDA.Warning.TalentOnlyForTamer",
        "Somente um Digi-Escolhido pode usar Talentos."
      )
    };
  }

  if (!talent) {
    return {
      ok: false,
      message: localize(
        "DDA.Warning.TalentNotFound",
        "Talento não encontrado."
      )
    };
  }

  const actionCost = String(getTalentSystem(talent).actionCost ?? "");
  const actionCostNumber = getTamerTalentActionCostNumber(actionCost);
  const currentActions = Number(tamer.system?.combat?.actions?.value ?? 0);

  if (actionCostNumber > 0 && currentActions < actionCostNumber) {
    return {
      ok: false,
      message: formatI18n(
        "DDA.Warning.NotEnoughActionsForTalent",
        { actor: tamer.name, talent: talent.name },
        `${tamer.name} não possui Ações suficientes para usar ${talent.name}.`
      )
    };
  }

  const uses = getTalentUses(tamer, talent, options);

  if (uses.enabled && uses.value <= 0) {
    return {
      ok: false,
      message: formatI18n(
        "DDA.Warning.TalentNoUsesLeft",
        { talent: talent.name },
        `${talent.name} não possui usos restantes.`
      )
    };
  }

  const frequency = isFrequencyAvailable(tamer, talent);
  if (!frequency.ok) return frequency;

  return {
    ok: true,
    actionCost,
    actionCostNumber,
    currentActions,
    uses
  };
}

/**
 * Execute a talent. A failed/cancelled automation never spends actions or uses.
 * Manual and unconfigured talents still complete normally, so their chat card and
 * resource costs continue to work exactly as before.
 */
export async function useTamerTalent(tamer, talent, options = {}) {
  const validation = validateTamerTalentUse(tamer, talent, options);

  if (!validation.ok) {
    return {
      success: false,
      applied: false,
      message: validation.message
    };
  }

  const automationResult = await executeTamerTalentAutomation(tamer, talent);

  if (!automationResult.success) {
    return automationResult;
  }

  await commitTamerTalentUse(tamer, talent, {
    ...options,
    actionCostNumber: validation.actionCostNumber,
    currentActions: validation.currentActions,
    uses: validation.uses
  });

  return {
    ...automationResult,
    success: true,
    actionCost: validation.actionCost,
    actionCostNumber: validation.actionCostNumber,
    uses: getTalentUses(tamer, talent, options)
  };
}

async function commitTamerTalentUse(tamer, talent, options = {}) {
  const source = options.source ?? "item";
  const item = options.item ?? null;
  const actionCostNumber = Number(options.actionCostNumber ?? 0);
  const currentActions = Number(
    options.currentActions ??
    tamer.system?.combat?.actions?.value ??
    0
  );

  const uses = options.uses ?? getTalentUses(tamer, talent, { source });
  const actorUpdates = {};

  if (actionCostNumber > 0) {
    actorUpdates["system.combat.actions.value"] = Math.max(
      0,
      currentActions - actionCostNumber
    );
  }

  if (uses.enabled && source === "official") {
    actorUpdates[`system.tamerTalentUses.${talent.id}.value`] = Math.max(
      0,
      uses.value - 1
    );

    actorUpdates[`system.tamerTalentUses.${talent.id}.max`] = uses.max;
    actorUpdates[`system.tamerTalentUses.${talent.id}.recharge`] = uses.recharge;
  }

  const frequency = getFrequency(talent);
  const combat = getCombatIdentity();

  if (
    combat.active &&
    ["oncePerTurn", "oncePerCombat"].includes(frequency)
  ) {
    const usage = foundry.utils.deepClone(
      tamer.system?.combat?.tamerTalentUsage ?? {}
    );

    usage[talent.id] = {
      combatId: combat.combatId,
      round: combat.round,
      turn: combat.turn,
      frequency,
      usedAt: new Date().toISOString()
    };

    actorUpdates["system.combat.tamerTalentUsage"] = usage;
  }

  if (Object.keys(actorUpdates).length) {
    await tamer.update(actorUpdates);
  }

  if (uses.enabled && source !== "official" && item) {
    await item.update({
      "system.uses.value": Math.max(0, uses.value - 1)
    });
  }

  if (uses.enabled && talent?.system?.uses) {
    talent.system.uses.value = Math.max(0, uses.value - 1);
  }
}

export async function executeTamerTalentAutomation(tamer, talent) {
  const automation = getTalentAutomation(talent);

  if (!automation.enabled) {
    return {
      success: true,
      applied: false,
      message: localize(
        "DDA.TamerTalent.Automation.NotConfigured",
        "Automação não configurada."
      )
    };
  }

  const type = String(automation.type ?? automation.kind ?? "").trim();

  switch (type) {
    case "grantActions":
      return applyGrantActionsAutomation(tamer, talent, automation);

    case "healWounds":
    case "heal":
      return applyHealWoundsAutomation(tamer, talent, automation);

    case "cleanseNegativeEffect":
      return applyCleanseNegativeEffectAutomation(tamer, talent, automation);

    case "applyEffect":
    case "effectTag":
      return applySingleEffectAutomation(tamer, talent, automation);

    case "applyEffectToTargets":
      return applyEffectToTargetsAutomation(tamer, talent, automation);

    case "nextCheckBonus":
      return applyNextCheckBonusAutomation(tamer, talent, automation);

    case "unalterableDamageAndEffect":
      return applyUnalterableDamageAndEffectAutomation(tamer, talent, automation);

    default:
      return {
        success: false,
        applied: false,
        message: formatI18n(
          "DDA.TamerTalent.Automation.Unknown",
          { type },
          `A automação “${type || "—"}” não é reconhecida.`
        )
      };
  }
}

async function getTamerTalentPrimaryTarget(tamer, automation) {
  const targets = Array.from(game.user?.targets ?? []);

  if (targets.length === 1 && targets[0]?.actor) {
    return {
      actor: targets[0].actor,
      token: targets[0],
      source: "target"
    };
  }

  if (automation.target === "target") {
    return null;
  }

  const partnerUuid =
    tamer.system?.partner?.currentFormUuid ||
    tamer.system?.partner?.uuid;

  if (partnerUuid) {
    try {
      const partner = await fromUuid(partnerUuid);

      if (partner?.documentName === "Actor") {
        return {
          actor: partner,
          token: null,
          source: "partner"
        };
      }
    } catch (error) {
      console.warn(
        "DDA | Não foi possível resolver o parceiro para automação de Talento.",
        error
      );
    }
  }

  return null;
}

function getTamerTalentTargets() {
  return Array.from(game.user?.targets ?? [])
    .map((token) => ({
      token,
      actor: token.actor
    }))
    .filter((entry) => entry.actor);
}

function isDigimonLike(actor) {
  return actor?.type === "digimon" || actor?.type === "npc";
}

function noTargetResult({ multiple = false } = {}) {
  return {
    success: false,
    applied: false,
    message: multiple
      ? localize(
        "DDA.Warning.SelectOneOrMoreTargetsForTalent",
        "Selecione um ou mais alvos para este Talento."
      )
      : localize(
        "DDA.Warning.SelectExactlyOneTargetForTalent",
        "Selecione exatamente um alvo para este Talento."
      )
  };
}

function invalidDigimonTargetResult() {
  return {
    success: false,
    applied: false,
    message: localize(
      "DDA.Warning.TalentRequiresDigimonOrNpcTarget",
      "Este Talento exige um Digimon ou NPC como alvo."
    )
  };
}

async function applyGrantActionsAutomation(tamer, talent, automation) {
  const target = await getTamerTalentPrimaryTarget(tamer, automation);
  if (!target?.actor) return noTargetResult();
  if (!isDigimonLike(target.actor)) return invalidDigimonTargetResult();

  const currentActions = Number(target.actor.system?.combat?.actions?.value ?? 0);
  const amount = Math.max(0, Number(automation.amount ?? 0));
  const nextActions = currentActions + amount;

  const updates = {
    "system.combat.actions.value": nextActions
  };

  if (automation.grantAttackRoundOverride) {
    const effects = foundry.utils.deepClone(
      target.actor.system?.effects?.active ?? []
    );

    const existingWindow = effects.find((effect) => {
      return getEffectTagKey(effect.tag) === "speedsurgeattackwindow";
    });

    if (!existingWindow) {
      effects.push({
        ...buildTamerTalentEffect(tamer, talent, {
          ...automation,
          tag: "speedSurgeAttackWindow",
          label: "[SPEED SURGE]",
          value: 1,
          duration: 1,
          category: "special"
        }, target.actor),
        consumeOn: "attack",
        grantsAttackRoundOverride: true
      });
    }

    updates["system.effects.active"] = effects;
  }

  await target.actor.update(updates);

  return {
    success: true,
    applied: true,
    targetName: target.actor.name,
    message: formatI18n(
      "DDA.TamerTalent.Automation.GrantActions.Message",
      { target: target.actor.name, amount },
      `${target.actor.name} recebe ${amount} Ação(ões).`
    ),
    details: automation.note ?? ""
  };
}

async function applyHealWoundsAutomation(tamer, talent, automation) {
  const target = await getTamerTalentPrimaryTarget(tamer, automation);

  if (!target?.actor) return noTargetResult();
  if (!isDigimonLike(target.actor)) return invalidDigimonTargetResult();

  const woundPath = getWoundValuePath(target.actor);
  const tempPath = getTempWoundValuePath(target.actor);

  const currentWounds = Number(
    foundry.utils.getProperty(target.actor, woundPath) ?? 0
  );

  const maxWounds = getWoundMax(target.actor);

  const tempWounds = Number(
    foundry.utils.getProperty(target.actor, tempPath) ?? 0
  );

  const amount = tempWounds > 0
    ? Number(automation.amountIfHasTempWounds ?? automation.amount ?? 1)
    : Number(automation.amount ?? 1);

  const nextWounds = Math.min(
    maxWounds,
    currentWounds + Math.max(0, amount)
  );

  await target.actor.update({
    [woundPath]: nextWounds,
    ...(nextWounds > 0
      ? { "system.combat.defeated": false }
      : {})
  });

  return {
    success: true,
    applied: true,
    targetName: target.actor.name,
    message: formatI18n(
      "DDA.TamerTalent.Automation.HealWounds.Message",
      {
        target: target.actor.name,
        amount: nextWounds - currentWounds
      },
      `${target.actor.name} recupera ${nextWounds - currentWounds} Caixa(s) de Ferimento.`
    ),
    details: formatI18n(
      "DDA.TamerTalent.Automation.HealWounds.Details",
      {
        current: currentWounds,
        next: nextWounds
      },
      `${currentWounds} → ${nextWounds}`
    )
  };
}

function getWoundValuePath(actor) {
  return actor.type === "character"
    ? "system.derived.wounds.value"
    : "system.miscStats.wounds.value";
}

function getTempWoundValuePath(actor) {
  return actor.type === "character"
    ? "system.derived.wounds.temp.value"
    : "system.miscStats.wounds.temp.value";
}

function getWoundMax(actor) {
  if (actor.type === "character") {
    return Number(
      actor.system?.derived?.wounds?.max ??
      actor.system?.derived?.wounds?.value ??
      0
    );
  }

  return Number(
    actor.system?.miscStats?.wounds?.max ??
    actor.system?.miscStats?.wounds?.value ??
    0
  );
}

async function applyCleanseNegativeEffectAutomation(tamer, talent, automation) {
  const target = await getTamerTalentPrimaryTarget(tamer, automation);

  if (!target?.actor) return noTargetResult();

  const effects = foundry.utils.deepClone(
    target.actor.system?.effects?.active ?? []
  );

  const negativeEffects = effects.filter(isNegativeTamerTalentEffect);

  if (!negativeEffects.length) {
    return {
      success: false,
      applied: false,
      message: formatI18n(
        "DDA.TamerTalent.Automation.Cleanse.NoNegativeEffects",
        { target: target.actor.name },
        `${target.actor.name} não possui Efeitos Negativos para remover.`
      )
    };
  }

  const effectId = await chooseEffectToCleanse(
    target.actor,
    negativeEffects
  );

  if (!effectId) {
    return {
      success: false,
      applied: false,
      message: localize(
        "DDA.TamerTalent.Automation.Cleanse.NoEffectRemoved",
        "Nenhum Efeito foi removido."
      )
    };
  }

  const removedEffect = negativeEffects.find(
    (effect) => effect.id === effectId
  );

  await target.actor.update({
    "system.effects.active": effects.filter(
      (effect) => effect.id !== effectId
    )
  });

  return {
    success: true,
    applied: true,
    targetName: target.actor.name,
    message: formatI18n(
      "DDA.TamerTalent.Automation.Cleanse.Message",
      {
        effect: removedEffect?.label ?? "Efeito",
        target: target.actor.name
      },
      `${removedEffect?.label ?? "Efeito"} foi removido de ${target.actor.name}.`
    ),
    details: removedEffect?.label ?? removedEffect?.tag ?? effectId
  };
}

function isNegativeTamerTalentEffect(effect) {
  const tag = String(effect?.tag ?? "").toLowerCase();
  const category = String(effect?.category ?? "").toLowerCase();
  const label = String(effect?.label ?? "").toLowerCase();

  const negativeTags = new Set([
    "blind",
    "burn",
    "confuse",
    "debilitate",
    "distract",
    "doom",
    "dull",
    "fear",
    "frail",
    "freeze",
    "heavy",
    "paralyze",
    "poison",
    "root",
    "slow",
    "stun",
    "taunt",
    "vague",
    "weak"
  ]);

  return (
    category === "negative" ||
    category === "control" ||
    negativeTags.has(tag) ||
    Array.from(negativeTags).some((entry) => label.includes(entry))
  );
}

async function chooseEffectToCleanse(actor, effects) {
  return new Promise((resolve) => {
    new Dialog({
      title: localize(
        "DDA.Dialog.CleanseEffect.Title",
        "Remover Efeito"
      ),
      content: `
        <form class="dda-roll-dialog dda-cleanse-effect-dialog">
          <p>${formatI18n(
            "DDA.Dialog.CleanseEffect.Content",
            {
              actor: `<strong>${escapeHtml(actor.name)}</strong>`
            },
            `Escolha um Efeito Negativo de ${escapeHtml(actor.name)}.`
          )}</p>

          <div class="form-group">
            <label>${localize("DDA.Label.Effect", "Efeito")}</label>

            <select name="effectId">
              ${effects.map((effect) => `
                <option value="${escapeHtml(effect.id)}">
                  ${escapeHtml(effect.label ?? effect.tag ?? effect.id)}
                </option>
              `).join("")}
            </select>
          </div>
        </form>`,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Remove", "Remover"),
          callback: (html) => resolve(
            html[0].querySelector("form")?.effectId?.value ?? null
          )
        },
        cancel: {
          label: localize("DDA.Button.Cancel", "Cancelar"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    }, {
      width: 420
    }).render(true);
  });
}

async function applySingleEffectAutomation(tamer, talent, automation) {
  const target = await getTamerTalentPrimaryTarget(tamer, automation);

  if (!target?.actor) return noTargetResult();

  const effect = buildTamerTalentEffect(
    tamer,
    talent,
    automation,
    target.actor
  );

  await addActiveEffectToActor(target.actor, effect);

  return {
    success: true,
    applied: true,
    targetName: target.actor.name,
    message: formatI18n(
      "DDA.TamerTalent.Automation.ApplyEffect.Message",
      {
        effect: effect.label,
        target: target.actor.name
      },
      `${effect.label} foi aplicado a ${target.actor.name}.`
    ),
    details: automation.note ?? ""
  };
}

async function applyEffectToTargetsAutomation(tamer, talent, automation) {
  const targets = getTamerTalentTargets();

  if (!targets.length) {
    return noTargetResult({ multiple: true });
  }

  const names = [];

  for (const target of targets) {
    const effect = buildTamerTalentEffect(
      tamer,
      talent,
      automation,
      target.actor
    );

    await addActiveEffectToActor(target.actor, effect);
    names.push(target.actor.name);
  }

  return {
    success: true,
    applied: true,
    targetName: names.join(", "),
    message: formatI18n(
      "DDA.TamerTalent.Automation.ApplyEffectToTargets.Message",
      { targets: names.join(", ") },
      `${automation.label ?? talent.name} foi aplicado a ${names.join(", ")}.`
    ),
    details: automation.note ?? ""
  };
}

function buildTamerTalentEffect(tamer, talent, automation, targetActor) {
  const value = getAutomationValue(tamer, targetActor, automation);
  const duration = Math.max(0, Number(automation.duration ?? 1));

  return {
    id: foundry.utils.randomID(),
    tag: automation.tag ?? "",
    label: automation.label ?? talent.name,
    value,
    potency: value,
    duration,
    remaining: duration,
    category: automation.category ?? "special",
    source: "tamerTalent",
    sourceTalentId: talent.id,
    sourceTalentName: talent.name,
    sourceActorName: tamer.name,
    sourceActorUuid: tamer.uuid
  };
}

function getAutomationValue(tamer, targetActor, automation) {
  if (automation.valueFrom === "targetSv") {
    return Number(
      targetActor.system?.derivedStats?.sv?.value ??
      targetActor.system?.derived?.sv?.value ??
      targetActor.system?.miscStats?.sv?.value ??
      targetActor.system?.stageValue ??
      1
    );
  }

  if (automation.valueFrom === "tamerWillpower") {
    return Number(tamer.system?.attributes?.willpower?.value ?? 0);
  }

  return Number(automation.value ?? 1);
}

async function addActiveEffectToActor(actor, effect) {
  const effects = foundry.utils.deepClone(
    actor.system?.effects?.active ?? []
  );

  effects.push(effect);

  await actor.update({
    "system.effects.active": effects
  });
}

async function applyNextCheckBonusAutomation(tamer, talent, automation) {
  const target = await getTamerTalentPrimaryTarget(tamer, automation);

  if (!target?.actor) return noTargetResult();

  const value = Number(automation.amount ?? 0);

  const effect = {
    id: foundry.utils.randomID(),
    tag: "nextCheckBonus",
    label: automation.label ?? talent.name,
    value,
    potency: value,
    duration: 1,
    remaining: 1,
    category: "positive",
    source: "tamerTalent",
    sourceTalentId: talent.id,
    sourceTalentName: talent.name,
    sourceActorName: tamer.name,
    sourceActorUuid: tamer.uuid,
    consumeOn: "check"
  };

  await addActiveEffectToActor(target.actor, effect);

  return {
    success: true,
    applied: true,
    targetName: target.actor.name,
    message: formatI18n(
      "DDA.TamerTalent.Automation.NextCheckBonus.Message",
      {
        target: target.actor.name,
        value
      },
      `${target.actor.name} recebe +${value} no próximo Teste.`
    ),
    details: automation.note ?? ""
  };
}

async function applyUnalterableDamageAndEffectAutomation(
  tamer,
  talent,
  automation
) {
  const target = await getTamerTalentPrimaryTarget(tamer, automation);

  if (!target?.actor) return noTargetResult();

  const damage = getAutomationDamage(target.actor, automation);

  const damageResult = await applyDamage(target.actor, damage, {
    damageLabel: localize(
      "DDA.Damage.Type.Unalterable",
      "Dano Inalterável"
    ),
    attacker: tamer,
    createChat: false,
    ignoreReduction: true,
    unalterable: true
  });

  if (!damageResult) {
    return {
      success: false,
      applied: false,
      message: localize(
        "DDA.Warning.CouldNotApplyDamage",
        "Não foi possível aplicar o dano."
      )
    };
  }

  const effect = buildTamerTalentEffect(
    tamer,
    talent,
    automation,
    target.actor
  );

  await addActiveEffectToActor(target.actor, effect);

  return {
    success: true,
    applied: true,
    targetName: target.actor.name,
    message: formatI18n(
      "DDA.TamerTalent.Automation.UnalterableDamageAndEffect.Message",
      {
        target: target.actor.name,
        damage,
        effect: effect.label
      },
      `${target.actor.name} sofre ${damage} de Dano Inalterável e recebe ${effect.label}.`
    ),
    details: automation.note ?? ""
  };
}

function getAutomationDamage(targetActor, automation) {
  if (automation.damageFrom === "targetSv") {
    return Number(
      targetActor.system?.derivedStats?.sv?.value ??
      targetActor.system?.derived?.sv?.value ??
      targetActor.system?.miscStats?.sv?.value ??
      targetActor.system?.stageValue ??
      1
    );
  }

  return Math.max(0, Number(automation.damage ?? 1));
}

function getEffectTagKey(tag = "") {
  return String(tag ?? "")
    .trim()
    .replace("[", "")
    .replace("]", "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}