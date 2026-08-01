import {
  advanceDDACombatTurn
} from "./initiative.js";
import { maybeApplyGritSurvival } from "../rules/tamer-resources.js";
import {
  applyCombatMonsterResolveFromEffectDamage,
  handleDefensiveEndTurn
} from "./defensive-qualities.js";
import { handleStanceEndTurn } from "./stance-qualities.js";
import { handleUtilityEndTurn } from "./utility-qualities.js";
import {
  processPendingStunEndTurn,
  resolveEndTurnEffectResistance
} from "./effect-qualities.js";
import { processOverclockEndTurn } from "../rules/overclock.js";
import { getActorSv } from "../rules/quality-automation.js";
import {
  handleDigizoidGainForceEndTurn,
  reduceEnemyUnalterableDamageWithShiningArmor
} from "./digizoid-gain-force.js";
import { hasQuality } from "../rules/quality-automation.js";

import {
  tryUndefeatedEndurance
} from "../rolls/damage-application.js";

export async function endDigimonTurn(actor, options = {}) {
  if (!actor || (actor.type !== "digimon" && actor.type !== "npc")) {
    ui.notifications.warn(localize("DDA.Warning.EndTurnOnlyForDigimonNpc"));
    return;
  }

  const system = actor.system;

  const maxActions = Number(system.combat?.actions?.max ?? 2);
  const currentBattery = Number(system.resources?.battery?.value ?? 0);
  const maxBattery = Number(system.resources?.battery?.max ?? 3);

  const usedSignatureMove = Boolean(system.combat?.signatureMoveUsedThisTurn);
  const usedEnergize = Boolean(system.combat?.energizeUsedThisTurn);

  let linkedTamerTurnData = {
    found: false,
    name: "",
    actions: 0
  };

  const turnRestrictionData = getEndTurnActionRestrictions(actor, maxActions);

  let batteryGain = 0;

  if (hasQuality(actor, "vengefulCharge")) {
    turnRestrictionData.batteryGainBlocked = true;
    turnRestrictionData.notes.push("Vengeful Charge replaces normal start-of-turn Battery gain.");
  }

  if (!usedSignatureMove && !turnRestrictionData.batteryGainBlocked) {
    batteryGain += 1;
  }

  if (usedEnergize && !turnRestrictionData.batteryGainBlocked) {
    batteryGain += 1;
  }

  const newBattery = Math.min(maxBattery, currentBattery + batteryGain);

  /*
   * FEAR, DOOM e TAUNT permitem uma tentativa gratuita no fim do turno,
   * exceto quando o alvo já usou a tentativa de 1 Ação naquele turno.
   */
  await resolveEndTurnEffectResistance(actor);

  /* Consequências de fim de turno usam as Ações gastas antes do reset. */
  const effectConsequenceData = await applyEndTurnEffectConsequences(actor);

  await actor.update({
    "system.combat.actions.value": turnRestrictionData.restoredActions,
    "system.combat.dodgePenalty": 0,
    "system.combat.hasAttackedThisRound": false,
    "system.combat.attacksMadeThisTurn": 0,
    "system.combat.movementActionsThisTurn": 0,
    "system.combat.multiattackPenalty": 0,
    "system.combat.signatureMoveUsedThisTurn": false,
    "system.combat.energizeUsedThisTurn": false,
    "system.resources.battery.value": newBattery
  });

  const effectTurnData = reduceActiveEffectDurations(actor);
  const shieldTempCleared = await clearExpiredShieldTemp(actor, effectTurnData.expiredEffects);
  const turnUseRechargeData = await rechargeQualityUses(actor, "turn");
  await handleDefensiveEndTurn(actor);
  await handleStanceEndTurn(actor);
  await handleUtilityEndTurn(actor);

// Tamer e Digimon agora encerram suas próprias ativações.
// O parceiro não é mais recarregado junto.

  const updateData = {};

if (effectConsequenceData.changed) {
  updateData[
    "system.miscStats.wounds.value"
  ] =
    effectConsequenceData.newWounds;

  updateData[
    "system.combat.defeated"
  ] =
    effectConsequenceData.newWounds <= 0;

  updateData["system.combat.effectDamageRoundKey"] =
    effectConsequenceData.effectDamageRoundKey;
  updateData["system.combat.effectDamageTakenThisRound"] =
    effectConsequenceData.effectDamageTakenThisRound;
}

  if (effectTurnData.changed) {
    updateData["system.effects.active"] = effectTurnData.remainingEffects;
  }

  if (Object.keys(updateData).length) {
    await actor.update(updateData);
  }

  await processPendingStunEndTurn(actor);
  await processOverclockEndTurn(actor);
  await handleDigizoidGainForceEndTurn(actor);

  await applyCombatMonsterResolveFromEffectDamage({
    actor,
    entries: effectConsequenceData.entries,
    healthDamage: Math.max(
      0,
      Number(effectConsequenceData.oldWounds ?? 0) -
      Number(effectConsequenceData.newWounds ?? 0)
    )
  });

  const batteryMessage = usedSignatureMove && usedEnergize
    ? `<li>${formatI18n("DDA.EndTurn.Battery.SignatureAndEnergize", {
        current: currentBattery,
        next: newBattery
      })}</li>`
    : usedSignatureMove
      ? `<li>${localize("DDA.EndTurn.Battery.SignatureBlockedGain")}</li>`
      : usedEnergize
        ? `<li>${formatI18n("DDA.EndTurn.Battery.EnergizeGain", {
            current: currentBattery,
            next: newBattery
          })}</li>`
        : `<li>${formatI18n("DDA.EndTurn.Battery.NormalGain", {
            current: currentBattery,
            next: newBattery
          })}</li>`;

  const turnRestrictionsMessage = turnRestrictionData.notes.length
    ? `
      <li class="end-turn-restrictions">
        ${localize("DDA.EndTurn.EffectRestrictions")}:
        ${turnRestrictionData.notes.map((note) => `<span>${note}</span>`).join(" ")}
      </li>
    `
    : "";

  const healthChangeClass = effectConsequenceData.woundDelta > 0
    ? "health-gain"
    : effectConsequenceData.woundDelta < 0
      ? "health-loss"
      : "health-neutral";

  const effectConsequencesMessage = effectConsequenceData.entries.length
    ? `
      <li class="end-turn-health-change ${healthChangeClass}">
        ${localize("DDA.EndTurn.HealthModifiedByEffects")}:
        <strong>${effectConsequenceData.oldWounds} → ${effectConsequenceData.newWounds}</strong>.
      </li>

      <li class="end-turn-effects-resolved ${healthChangeClass}">
        ${localize("DDA.EndTurn.EffectsResolved")}:
        ${
          effectConsequenceData.entries.map((entry) => {
            const signal = entry.type === "healing" ? "+" : "-";
            const entryClass = entry.type === "healing" ? "effect-healing" : "effect-damage";

            return `<span class="${entryClass}">${entry.label} (${signal}${entry.amount})</span>`;
          }).join(" ")
        }
      </li>
    `
    : "";

  const effectsMessage = effectTurnData.changed
    ? `
      ${effectConsequencesMessage}
      <li>${formatI18n("DDA.EndTurn.ActiveEffectsUpdated", {
        before: effectTurnData.beforeCount,
        after: effectTurnData.afterCount
      })}</li>
      ${
        effectTurnData.expiredEffects.length
          ? `<li>${formatI18n("DDA.EndTurn.ExpiredEffects", {
              effects: effectTurnData.expiredEffects.map((effect) => effect.label).join(", ")
            })}</li>`
          : ""
      }
      ${
        shieldTempCleared
          ? `<li>${localize("DDA.EndTurn.ShieldExpiredTempRemoved")}</li>`
          : ""
      }
    `
    : effectConsequenceData.changed
      ? effectConsequencesMessage
      : `<li>${localize("DDA.EndTurn.NoActiveEffectsToUpdate")}</li>`;

  const linkedTamerHealthChangeClass = linkedTamerTurnData.woundDelta > 0
    ? "health-gain"
    : linkedTamerTurnData.woundDelta < 0
      ? "health-loss"
      : "health-neutral";

  const linkedTamerHealthMessage = linkedTamerTurnData.healthChanged
    ? `
      <span class="end-turn-health-change ${linkedTamerHealthChangeClass}">
        ${localize("DDA.Resource.Health")}:
        <strong>${linkedTamerTurnData.oldWounds} → ${linkedTamerTurnData.newWounds}</strong>.
      </span>
      ${
        linkedTamerTurnData.effectConsequences?.length
          ? `<span>
              ${localize("DDA.EndTurn.EffectsResolved")}:
              ${linkedTamerTurnData.effectConsequences.map((entry) => {
                const signal = entry.type === "healing" ? "+" : "-";
                return `${entry.label} (${signal}${entry.amount})`;
              }).join(" ")}
            </span>`
          : ""
      }
    `
    : "";

  const linkedTamerEffectsMessage = linkedTamerTurnData.effectsChanged
    ? `
      <span>
        ${formatI18n("DDA.EndTurn.ActiveEffectsUpdated", {
          before: linkedTamerTurnData.effectsBeforeCount,
          after: linkedTamerTurnData.effectsAfterCount
        })}
      </span>
      ${
        linkedTamerTurnData.expiredEffects?.length
          ? `<span>${formatI18n("DDA.EndTurn.ExpiredEffects", {
              effects: linkedTamerTurnData.expiredEffects.map((effect) => effect.label).join(", ")
            })}</span>`
          : ""
      }
      ${
        linkedTamerTurnData.shieldTempCleared
          ? `<span>${localize("DDA.EndTurn.ShieldExpiredTempRemoved")}</span>`
          : ""
      }
    `
    : "";

  const linkedTamerRestrictionMessage = linkedTamerTurnData.restrictionNotes?.length
    ? `
      <span>
        ${localize("DDA.EndTurn.Restrictions")}:
        ${linkedTamerTurnData.restrictionNotes.join(" ")}
      </span>
    `
    : "";

  const linkedTamerEndTurnMessage = linkedTamerTurnData.found
    ? `
      <li class="end-turn-linked-tamer">
        ${localize("DDA.Actor.Tamer")}:
        <strong>${linkedTamerTurnData.name}</strong>
        ${formatI18n("DDA.EndTurn.RestoredActionsTo", {
          actions: `<strong>${linkedTamerTurnData.actions}</strong>`
        })}
        ${linkedTamerHealthMessage}
        ${linkedTamerEffectsMessage}
        ${linkedTamerRestrictionMessage}
      </li>
    `
    : "";

  const turnUseRechargeMessage = turnUseRechargeData.changed
    ? `
      <li>
        ${localize("DDA.EndTurn.UsesRecharged")}:
        ${turnUseRechargeData.entries.map((entry) => {
          return `<span><strong>${entry.name}</strong> ${entry.oldValue} → ${entry.newValue}</span>`;
        }).join(" ")}
      </li>
    `
    : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-end-turn-card">
        <h2>${localize("DDA.EndTurn.Title")}</h2>
        <p>${formatI18n("DDA.EndTurn.ActorEndedTurn", {
          actor: `<strong>${actor.name}</strong>`
        })}</p>

        <ul class="dda-effect-list dda-end-turn-list">
          <li>${formatI18n("DDA.EndTurn.ActionsRestoredTo", {
            actions: `<strong>${turnRestrictionData.restoredActions}</strong>`
          })}</li>
          <li>${localize("DDA.EndTurn.DodgePenaltyCleared")}</li>
          <li>${localize("DDA.EndTurn.AttackPerRoundRestored")}</li>
          ${batteryMessage}
          ${turnRestrictionsMessage}
          ${effectsMessage}
          ${turnUseRechargeMessage}
          ${linkedTamerEndTurnMessage}
        </ul>
      </div>
    `
  });

  actor.sheet?.render(false);

  if (!options.deferAdvance) {
    await advanceDDACombatTurn(actor);
  }
}

function getEndTurnActionRestrictions(actor, maxActions) {
  const activeEffects = Array.isArray(actor.system.effects?.active)
    ? actor.system.effects.active
    : [];

  const tags = new Set(
    activeEffects.map((effect) => getEffectTagKey(effect.tag ?? ""))
  );

  let restoredActions = maxActions;
  let batteryGainBlocked = false;
  const notes = [];

  if (tags.has("dot")) {
    batteryGainBlocked = true;
    notes.push("[DOT] impede o ganho de Bateria.");
  }

  return {
    restoredActions,
    batteryGainBlocked,
    notes
  };
}

function reduceActiveEffectDurations(actor) {
  const currentEffects = foundry.utils.deepClone(actor.system.effects?.active ?? []);

  if (!currentEffects.length) {
    return {
      changed: false,
      beforeCount: 0,
      afterCount: 0,
      remainingEffects: [],
      expiredEffects: []
    };
  }

  const combat = game.combat;
  const currentTick = `${combat?.id ?? "no-combat"}:${Number(combat?.round ?? 0)}:${Number(combat?.turn ?? -1)}`;
  const remainingEffects = [];
  const expiredEffects = [];
  let changed = false;

  for (const effect of currentEffects) {
    if (effect.activatesAtEndOfNextTurn) {
      remainingEffects.push(effect);
      continue;
    }

    const isSpecial = effect.hasSpecialDuration === true || effect.durationRule === "special";

    /* Durações normais são reduzidas no começo do turno do Caster. */
    if (!isSpecial) {
      remainingEffects.push(effect);
      continue;
    }

    const appliedTick = `${effect.appliedCombatId ?? ""}:${Number(effect.appliedCombatRound ?? 0)}:${Number(effect.appliedCombatTurn ?? -1)}`;

    if (appliedTick === currentTick) {
      remainingEffects.push(effect);
      continue;
    }

    expiredEffects.push({ ...effect, remaining: 0 });
    changed = true;
  }

  return {
    changed,
    beforeCount: currentEffects.length,
    afterCount: remainingEffects.length,
    remainingEffects,
    expiredEffects
  };
}

async function applyEndTurnEffectConsequences(actor) {
  const activeEffects = Array.isArray(actor.system.effects?.active)
    ? actor.system.effects.active
    : [];

  const damagingTags = new Set(["freeze", "poison", "ruin"]);

  const entries = [];
  let woundDelta = 0;

  for (const effect of activeEffects) {
    const rawTag = effect.tag ?? "";
    const tag = getEffectTagKey(rawTag);
    const label = effect.label ?? CONFIG.DDA?.effectTags?.[tag] ?? rawTag;

    const isDamage = damagingTags.has(tag);
    if (!isDamage) continue;

    let amount = 1;

    if (tag === "freeze") {
      const maxActions = Math.max(0, Number(actor.system?.combat?.actions?.max ?? 2));
      const currentActions = Math.max(0, Number(actor.system?.combat?.actions?.value ?? 0));
      const movementActions = Math.max(0, Number(actor.system?.combat?.movementActionsThisTurn ?? 0));
      amount = Math.max(0, (maxActions - currentActions - movementActions) * 2);
    }

    if (tag === "poison") {
      amount = Math.max(
        0,
        Number(
          effect.potency ??
          effect.value ??
          actor.system?.derivedStats?.cpu?.value ??
          0
        )
      );
    }

    if (tag === "ruin") {
      amount = Number(effect.potency ?? 0) || await getRuinDamageAmount(effect);
    }

    const damageEffectCount = activeEffects.filter((candidate) => {
      return ["burn", "freeze", "poison", "ruin"].includes(getEffectTagKey(candidate.tag));
    }).length;
    const natureReduction = Math.max(
      0,
      Number(actor.system?.qualityFeatures?.naturewalk?.damageReduction?.[tag] ?? 0)
    );

    amount = Math.max(0, amount - Math.max(0, damageEffectCount - 1) - natureReduction);

    amount = Math.max(
      0,
      Number(amount ?? 0)
    );

    if (isDamage) {
      if (amount <= 0) continue;
      woundDelta -= amount;

      entries.push({
        tag,
        label,
        amount,
        type: "damage",
        sourceActorUuid: effect.sourceActorUuid ?? "",
        sourceActorName: effect.sourceActorName ?? "",
        sourceAttackName: effect.sourceAttackName ?? ""
      });
    }

  }

  /* Efeitos nunca causam mais que SV x 2 de Dano Inalterável por Rodada. */
  const effectDamageCap = Math.max(0, Number(getActorSv(actor)) * 2);
  const effectDamageRoundKey = `${game.combat?.id ?? "no-combat"}:${Number(game.combat?.round ?? 0)}`;
  const previousEffectDamage = String(actor.system?.combat?.effectDamageRoundKey ?? "") === effectDamageRoundKey
    ? Math.max(0, Number(actor.system?.combat?.effectDamageTakenThisRound ?? 0))
    : 0;

  if (woundDelta < 0) {
    let remainingAllowance = Math.max(0, effectDamageCap - previousEffectDamage);
    for (const entry of entries) {
      if (entry.type !== "damage") continue;
      const applied = Math.min(Math.max(0, Number(entry.amount ?? 0)), remainingAllowance);
      entry.amount = applied;
      remainingAllowance -= applied;
    }
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (entries[index].type === "damage" && Number(entries[index].amount ?? 0) <= 0) entries.splice(index, 1);
    }
    woundDelta = -entries
      .filter((entry) => entry.type === "damage")
      .reduce((total, entry) => total + Math.max(0, Number(entry.amount ?? 0)), 0);
  }
  for (const entry of entries.filter((candidate) => candidate.type === "damage" && Number(candidate.amount) > 0)) {
    let source = null;
    if (entry.sourceActorUuid) {
      try {
        const document = await fromUuid(entry.sourceActorUuid);
        source = document?.documentName === "Token" ? document.actor : document;
      } catch (_error) {
        source = null;
      }
    }
    const shining = await reduceEnemyUnalterableDamageWithShiningArmor(actor, entry.amount, {
      unalterable: true,
      attacker: source
    });
    entry.shiningDigizoidReduction = shining.reduction;
    entry.amount = shining.damage;
  }
  woundDelta = -entries
    .filter((entry) => entry.type === "damage")
    .reduce((total, entry) => total + Math.max(0, Number(entry.amount ?? 0)), 0);
  const effectDamageTakenThisRound = previousEffectDamage + Math.max(0, -woundDelta);

  const oldWoundsRaw = Number(actor.system.miscStats?.wounds?.value ?? 0);
  const maxWoundsRaw = Number(actor.system.miscStats?.wounds?.max ?? 1);

  const oldWounds = Number.isFinite(oldWoundsRaw) ? oldWoundsRaw : 0;
  const maxWounds = Number.isFinite(maxWoundsRaw) ? maxWoundsRaw : 1;

  if (woundDelta === 0) {
    return {
      changed: false,
      oldWounds,
      newWounds: oldWounds,
      woundDelta: 0,
      entries,
      effectDamageRoundKey,
      effectDamageTakenThisRound
    };
  }

const unclampedWounds =
  oldWounds + woundDelta;

let newWounds = Math.min(
  maxWounds,
  Math.max(
    0,
    unclampedWounds
  )
);

const undefeatedEndurance =
  await tryUndefeatedEndurance(
    actor,
    {
      prospectiveWounds:
        newWounds,

      maximumWounds:
        maxWounds
    }
  );

if (undefeatedEndurance?.used) {
  newWounds =
    undefeatedEndurance.wounds;
}

return {
  changed:
    entries.length > 0,

  oldWounds,
  newWounds,

  woundDelta:
    newWounds - oldWounds,

  entries,
  effectDamageRoundKey,
  effectDamageTakenThisRound,
  undefeatedEndurance
};
}

async function getRuinDamageAmount(effect) {
  const sourceActorUuid = effect.sourceActorUuid;

  if (!sourceActorUuid) return 1;

  try {
    const sourceActor = await fromUuid(sourceActorUuid);

    if (!sourceActor) return 1;

    const bit = Number(sourceActor.system.derivedStats?.bit?.value ?? 1);

    return Number.isFinite(bit) ? Math.max(1, bit) : 1;
  } catch (error) {
    console.warn("DDA | Could not resolve Ruin source.", error);
    return 1;
  }
}

function getEffectTagKey(tag) {
  return String(tag ?? "")
    .trim()
    .replace("[", "")
    .replace("]", "")
    .toLowerCase();
}

async function endLinkedTamerTurn(digimonActor) {
  const tamerUuid = digimonActor.system.tamer?.uuid;

  if (!tamerUuid) {
    return {
      found: false,
      name: "",
      actions: 0
    };
  }

  let tamer = null;

  try {
    tamer = await fromUuid(tamerUuid);
  } catch (error) {
    console.warn("DDA | Could not resolve linked Tamer at end of turn.", error);

    return {
      found: false,
      name: "",
      actions: 0
    };
  }

  if (!tamer || tamer.documentName !== "Actor" || tamer.type !== "character") {
    return {
      found: false,
      name: "",
      actions: 0
    };
  }

  const combatTamer = getSceneTokenActorForLinkedTamer(tamer) ?? tamer;

  const maxActionsRaw = Number(combatTamer.system.combat?.actions?.max ?? 2);
  const maxActions = Number.isFinite(maxActionsRaw) ? maxActionsRaw : 2;
  const tamerRestrictionData = getLinkedTamerEndTurnActionRestrictions(combatTamer, maxActions);

  const tamerEffectConsequenceData = await applyLinkedTamerEffectConsequences(combatTamer);
  const tamerEffectTurnData = await reduceLinkedTamerEffectDurations(combatTamer);
  const tamerShieldTempCleared = await clearExpiredShieldTemp(combatTamer, tamerEffectTurnData.expiredEffects);

  await combatTamer.update({
    "system.combat.actions.value": tamerRestrictionData.restoredActions,
    "system.derived.wounds.value": tamerEffectConsequenceData.newWounds,
    "system.effects.active": tamerEffectTurnData.remainingEffects
  });

  combatTamer.sheet?.render(true);

  return {
    found: true,
    name: combatTamer.name,
    actions: tamerRestrictionData.restoredActions,
    restrictionNotes: tamerRestrictionData.notes,

    healthChanged: tamerEffectConsequenceData.changed,
    oldWounds: tamerEffectConsequenceData.oldWounds,
    newWounds: tamerEffectConsequenceData.newWounds,
    woundDelta: tamerEffectConsequenceData.woundDelta,
    effectConsequences: tamerEffectConsequenceData.entries,
    gritSurvival: tamerEffectConsequenceData.gritSurvival,

    effectsChanged: tamerEffectTurnData.changed,
    effectsBeforeCount: tamerEffectTurnData.beforeCount,
    effectsAfterCount: tamerEffectTurnData.afterCount,
    expiredEffects: tamerEffectTurnData.expiredEffects,
    shieldTempCleared: tamerShieldTempCleared
  };
}

async function reduceLinkedTamerEffectDurations(tamer) {
  return reduceActiveEffectDurations(tamer);
}

function getSceneTokenActorForLinkedTamer(tamer) {
  const sceneTokens = canvas?.tokens?.placeables ?? [];

  const candidates = sceneTokens
    .map((token) => {
      return {
        token,
        actor: token.actor,
        tokenName: token.name,
        actorName: token.actor?.name,
        actorId: token.actor?.id,
        actorUuid: token.actor?.uuid,
        documentActorId: token.document?.actorId,
        isCharacter: token.actor?.type === "character",
        effects: token.actor?.system?.effects?.active ?? []
      };
    })
    .filter((candidate) => candidate.isCharacter);

  const exactActorIdMatch = candidates.find((candidate) => {
    return candidate.documentActorId === tamer.id;
  });

  if (exactActorIdMatch) return exactActorIdMatch.actor;

  const actorIdMatch = candidates.find((candidate) => {
    return candidate.actorId === tamer.id;
  });

  if (actorIdMatch) return actorIdMatch.actor;

  const uuidMatch = candidates.find((candidate) => {
    return candidate.actorUuid === tamer.uuid;
  });

  if (uuidMatch) return uuidMatch.actor;

  const nameMatch = candidates.find((candidate) => {
    return candidate.actorName === tamer.name || candidate.tokenName === tamer.name;
  });

  if (nameMatch) return nameMatch.actor;

  const characterWithEffects = candidates.find((candidate) => {
    return candidate.effects.length > 0;
  });

  if (characterWithEffects) {
    console.warn(
      "DDA | No exact link found. Using character in scene with active effects:",
      characterWithEffects.actorName
    );

    return characterWithEffects.actor;
  }

  return null;
}

async function applyLinkedTamerEffectConsequences(tamer) {
  const activeEffects = foundry.utils.deepClone(tamer.system.effects?.active ?? []);
  const wounds = tamer.system.derived?.wounds;

  const currentWounds = Number(wounds?.value ?? 0);
  const maxWounds = Number(wounds?.max ?? currentWounds);

  let newWounds = Number.isFinite(currentWounds) ? currentWounds : 0;
  const safeMaxWounds = Number.isFinite(maxWounds) ? Math.max(0, maxWounds) : newWounds;

  const entries = [];

  const damagingTags = new Set(["burn", "poison", "ruin"]);
  const healingTags = new Set(["regen"]);

  for (const effect of activeEffects) {
    const tag = getEffectTagKey(effect.tag ?? "");

    if (damagingTags.has(tag)) {
      const amount = tag === "ruin"
        ? await getRuinDamageAmount(effect)
        : 1;

      newWounds = Math.max(0, newWounds - amount);

      entries.push({
        label: effect.label ?? effect.tag,
        tag,
        type: "damage",
        amount
      });

      continue;
    }

    if (healingTags.has(tag)) {
      const amount = 1;

      newWounds = Math.min(safeMaxWounds, newWounds + amount);

      entries.push({
        label: effect.label ?? effect.tag,
        tag,
        type: "healing",
        amount
      });
    }
  }

  const gritSurvival =
    await maybeApplyGritSurvival(
      tamer,
      {
        currentWounds,

        nextWounds:
          newWounds,

        sourceLabel:
          localize(
            "DDA.EndTurn.EffectsResolved"
          )
      }
    );

  if (gritSurvival.used) {
    newWounds =
      gritSurvival.wounds;
  }

  return {
    changed:
      entries.length > 0 &&
      newWounds !== currentWounds,

    oldWounds:
      currentWounds,

    newWounds,

    woundDelta:
      newWounds - currentWounds,

    entries,
    gritSurvival
  };
}

async function clearExpiredShieldTemp(actor, expiredEffects = []) {
  const expiredShield = expiredEffects.some((effect) => {
    return getEffectTagKey(effect.tag) === "shield";
  });

  if (!expiredShield) return false;

  if (actor.type === "character") {
    const temp = actor.system.derived?.wounds?.temp;

    if (!temp) return false;

    const source = String(temp.source ?? "").toLowerCase();

    if (source && !source.includes("escudo") && !source.includes("shield")) {
      return false;
    }

    await actor.update({
      "system.derived.wounds.temp.value": 0,
      "system.derived.wounds.temp.source": "",
      "system.derived.wounds.temp.duration": ""
    });

    return true;
  }

  if (actor.type === "digimon" || actor.type === "npc") {
    const temp = actor.system.miscStats?.wounds?.temp;

    if (!temp) return false;

    const source = String(temp.source ?? "").toLowerCase();

    if (source && !source.includes("escudo") && !source.includes("shield")) {
      return false;
    }

    await actor.update({
      "system.miscStats.wounds.temp.value": 0,
      "system.miscStats.wounds.temp.source": "",
      "system.miscStats.wounds.temp.duration": ""
    });

    return true;
  }

  return false;
}

function getLinkedTamerEndTurnActionRestrictions(actor, maxActions) {
  const activeEffects = Array.isArray(actor.system.effects?.active)
    ? actor.system.effects.active
    : [];

  const tags = new Set(
    activeEffects.flatMap((effect) => {
      const tag = getEffectTagKey(effect.tag ?? "");
      const label = getEffectTagKey(effect.label ?? "");

      return [tag, label].filter(Boolean);
    })
  );

  let restoredActions = maxActions;
  const notes = [];

  const actionLockUntilCombatEnd = Boolean(actor.system.tormentState?.actionLockUntilCombatEnd);

  if (actionLockUntilCombatEnd) {
    restoredActions = 0;
    notes.push(localize("DDA.EndTurn.Restriction.TormentActionLock"));
  }

  if (tags.has("paralyze") || tags.has("paralisar")) {
    if (!actionLockUntilCombatEnd) {
      restoredActions = Math.min(
        restoredActions,
        Math.max(1, Math.floor(maxActions / 2))
      );
    }

    notes.push(localize("DDA.EndTurn.Restriction.Paralyze"));
  }

  if (tags.has("freeze") || tags.has("congelar")) {
    restoredActions = Math.max(0, restoredActions - 1);

    notes.push(localize("DDA.EndTurn.Restriction.FreezeTamer"));
  }

  if (tags.has("stun") || tags.has("atordoar")) {
    restoredActions = 0;

    notes.push(localize("DDA.EndTurn.Restriction.Stun"));
  }

  return {
    restoredActions,
    notes
  };
}

async function rechargeQualityUses(actor, rechargeType) {
  const entries = [];

  for (const item of actor.items) {
    if (item.type !== "quality") continue;
    if (!item.system.uses?.enabled) continue;
    if (item.system.uses?.recharge !== rechargeType) continue;

    const currentValue = Number(item.system.uses.value ?? 0);
    const maxValue = Number(item.system.uses.max ?? 0);

    if (maxValue <= 0) continue;
    if (currentValue >= maxValue) continue;

    await item.update({
      "system.uses.value": maxValue
    });

    entries.push({
      id: item.id,
      name: item.name,
      oldValue: currentValue,
      newValue: maxValue,
      maxValue
    });
  }

  return {
    changed: entries.length > 0,
    entries
  };
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}

export async function endTamerTurn(actor, options = {}) {
  if (!actor || actor.type !== "character") {
    const isEnglish = String(
      game.i18n?.lang ??
      game.i18n?.language ??
      ""
    ).toLowerCase().startsWith("en");

    ui.notifications.warn(
      isEnglish
        ? "Only Tamers can end this turn."
        : "Apenas Digi-Escolhidos podem encerrar este turno."
    );

    return null;
  }

  const maxActions = Number(
    actor.system.combat?.actions?.max ?? 2
  );

  const turnRestrictionData =
    getLinkedTamerEndTurnActionRestrictions(
      actor,
      Number.isFinite(maxActions) ? maxActions : 2
    );

  await resolveEndTurnEffectResistance(actor);

  const effectConsequenceData =
    await applyLinkedTamerEffectConsequences(actor);

  const effectTurnData =
    await reduceLinkedTamerEffectDurations(actor);

  const shieldTempCleared =
    await clearExpiredShieldTemp(
      actor,
      effectTurnData.expiredEffects
    );

  await actor.update({
    "system.combat.actions.value":
      turnRestrictionData.restoredActions,

    "system.derived.wounds.value":
      effectConsequenceData.newWounds,

    "system.effects.active":
      effectTurnData.remainingEffects
  });

  await processPendingStunEndTurn(actor);

  const healthMessage = effectConsequenceData.changed
    ? `
      <li>
        ${localize("DDA.Resource.Health")}:
        <strong>
          ${effectConsequenceData.oldWounds}
          →
          ${effectConsequenceData.newWounds}
        </strong>.
      </li>
    `
    : "";

      const gritSurvivalMessage =
    effectConsequenceData
      .gritSurvival?.used
      ? `
        <li class="end-turn-grit-survival">
          <strong>
            ${localize(
              "DDA.TamerTalent.Grit.Title"
            )}:
          </strong>

          ${localize(
            "DDA.TamerTalent.Grit.SurvivalApplied"
          )}
        </li>
      `
      : "";

  const effectsMessage = effectTurnData.changed
    ? `
      <li>
        ${formatI18n("DDA.EndTurn.ActiveEffectsUpdated", {
          before: effectTurnData.beforeCount,
          after: effectTurnData.afterCount
        })}
      </li>

      ${
        effectTurnData.expiredEffects.length
          ? `<li>${formatI18n("DDA.EndTurn.ExpiredEffects", {
              effects: effectTurnData.expiredEffects
                .map((effect) => effect.label)
                .join(", ")
            })}</li>`
          : ""
      }

      ${
        shieldTempCleared
          ? `<li>${localize("DDA.EndTurn.ShieldExpiredTempRemoved")}</li>`
          : ""
      }
    `
    : "";

  const restrictionMessage = turnRestrictionData.notes.length
    ? `
      <li class="end-turn-restrictions">
        ${localize("DDA.EndTurn.Restrictions")}:
        ${turnRestrictionData.notes
          .map((note) => `<span>${note}</span>`)
          .join(" ")}
      </li>
    `
    : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),

    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-end-turn-card">
        <h2>${localize("DDA.EndTurn.Title")}</h2>

        <p>
          ${formatI18n("DDA.EndTurn.ActorEndedTurn", {
            actor: `<strong>${actor.name}</strong>`
          })}
        </p>

        <ul class="dda-effect-list dda-end-turn-list">
          <li>
            ${formatI18n("DDA.EndTurn.ActionsRestoredTo", {
              actions: `<strong>${turnRestrictionData.restoredActions}</strong>`
            })}
          </li>

          ${healthMessage}
          ${gritSurvivalMessage}
          ${effectsMessage}
          ${restrictionMessage}
        </ul>
      </div>
    `
  });

  actor.sheet?.render(false);

  if (!options.deferAdvance) {
    await advanceDDACombatTurn(actor);
  }

  return {
    actions: turnRestrictionData.restoredActions,
    healthChanged: effectConsequenceData.changed,
    effectsChanged: effectTurnData.changed,
    gritSurvival: effectConsequenceData.gritSurvival
  };
}
