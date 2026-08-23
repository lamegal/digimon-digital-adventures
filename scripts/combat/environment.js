import { actorHasNaturewalkElement, getActorSv, rollDerivedCheck } from "../rules/quality-automation.js";
import { rollTamerCheck } from "../rolls/check-roll.js";
import { applyDamage } from "../rolls/damage-application.js";
import { checkActorActionSpend, spendActorActions } from "./action-economy.js";
import { getCombatantUnitId } from "./initiative.js";
import { getTokenGridDistance } from "./positioning.js";

const SYSTEM_ID = "digimon-digital-adventures";
const DROWNING_TICK_PATH = "system.combat.drowningStartTurnTick";

const ELEMENTS = [
  "fire", "water", "wind", "earth", "ice", "wood", "steel", "thunder", "darkness", "light"
];

function isEnglish() {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
}

function text(pt, en) {
  return isEnglish() ? en : pt;
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function escape(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function normalizeElement(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^t:/, "")
    .replace(/[^a-z]/g, "");
}

export function getCombatEnvironmentState(actor) {
  const status = actor?.system?.status ?? {};
  return {
    sight: ["unobscured", "obscured", "blinded"].includes(String(status.sight ?? ""))
      ? String(status.sight)
      : "unobscured",
    obscuredElement: normalizeElement(status.obscuredElement),
    hidden: Boolean(status.hidden),
    hiddenCheckTotal: Math.max(0, number(status.hiddenCheckTotal, 10)),
    hiddenRevealedTo: Array.isArray(status.hiddenRevealedTo) ? status.hiddenRevealedTo.map(String) : [],
    submerged: Boolean(status.submerged),
    submergedElement: normalizeElement(status.submergedElement),
    drowning: Boolean(status.drowning),
    cover: ["none", "partial", "major"].includes(String(status.cover ?? ""))
      ? String(status.cover)
      : "none"
  };
}

export async function updateCombatEnvironmentState(actor, patch = {}) {
  if (!actor) return null;
  if (!game.user?.isGM && !actor.isOwner) {
    ui.notifications.warn(text(
      "Você não pode alterar o estado deste personagem.",
      "You cannot change this actor's state."
    ));
    return null;
  }

  const before = getCombatEnvironmentState(actor);
  const next = {
    ...before,
    ...foundry.utils.deepClone(patch ?? {})
  };

  if (!["unobscured", "obscured", "blinded"].includes(String(next.sight))) {
    next.sight = before.sight;
  }
  if (!["none", "partial", "major"].includes(String(next.cover))) {
    next.cover = before.cover;
  }
  next.obscuredElement = normalizeElement(next.obscuredElement);
  next.submergedElement = normalizeElement(next.submergedElement);
  next.hidden = Boolean(next.hidden);
  next.submerged = Boolean(next.submerged);
  next.drowning = Boolean(next.drowning);

  const updates = {
    "system.status.sight": next.sight,
    "system.status.obscuredElement": next.obscuredElement,
    "system.status.hidden": next.hidden,
    "system.status.submerged": next.submerged,
    "system.status.submergedElement": next.submergedElement,
    "system.status.drowning": next.drowning,
    "system.status.cover": next.cover
  };

  if (!next.hidden) {
    updates["system.status.hiddenCheckTotal"] = 0;
    updates["system.status.hiddenRevealedTo"] = [];
  } else if (!before.hidden) {
    updates["system.status.hiddenCheckTotal"] = Math.max(10, number(next.hiddenCheckTotal, 10));
    updates["system.status.hiddenRevealedTo"] = [];
  }

  await actor.update(updates);
  actor.sheet?.render(false);
  return getCombatEnvironmentState(actor);
}

function obscuredElementForPair(attackerState, defenderState) {
  if (defenderState.sight === "obscured") return defenderState.obscuredElement;
  if (defenderState.submerged && !attackerState.submerged) return defenderState.submergedElement;
  if (attackerState.submerged && !defenderState.submerged) return attackerState.submergedElement;
  return "";
}

function naturewalkIgnoresObscurity(attacker, element = "") {
  const normalized = normalizeElement(element);
  return Boolean(normalized && actorHasNaturewalkElement(attacker, normalized));
}

/**
 * Resolve the mechanical 9.09 sight/cover context for a specific Attack.
 * Cover and Obscured never stack; only the larger automatic Dodge bonus is used.
 */
export function getAttackEnvironmentContext(attacker, defender, {
  areaAttack = false,
  blindedTargetSensed = false,
  ignoreHiddenTarget = false
} = {}) {
  const attackerState = getCombatEnvironmentState(attacker);
  const defenderState = getCombatEnvironmentState(defender);
  const submergedMismatch = attackerState.submerged !== defenderState.submerged &&
    (attackerState.submerged || defenderState.submerged);
  const rawObscured = defenderState.sight === "obscured" || submergedMismatch ||
    (attackerState.sight === "blinded" && blindedTargetSensed);
  const obscuredElement = obscuredElementForPair(attackerState, defenderState);
  const ignoresObscured = rawObscured && naturewalkIgnoresObscurity(attacker, obscuredElement);
  const obscured = rawObscured && !ignoresObscured;
  const coverSuccesses = defenderState.cover === "major" ? 2 : defenderState.cover === "partial" ? 1 : 0;
  const obscuredSuccesses = obscured ? 1 : 0;
  const automaticDodgeSuccesses = Math.max(coverSuccesses, obscuredSuccesses);
  const hiddenRevealedToAttacker = defenderState.hiddenRevealedTo.includes(String(attacker?.uuid ?? ""));
  const hiddenTargetBlocked = Boolean(
    defenderState.hidden &&
    !hiddenRevealedToAttacker &&
    !areaAttack &&
    !ignoreHiddenTarget
  );
  const blindedTargetBlocked = Boolean(attackerState.sight === "blinded" && !areaAttack && !blindedTargetSensed);

  return {
    attackerState,
    defenderState,
    areaAttack,
    hiddenTargetBlocked,
    hiddenRevealedToAttacker,
    blindedTargetBlocked,
    submergedMismatch,
    obscured,
    obscuredElement,
    ignoresObscured,
    coverSuccesses,
    obscuredSuccesses,
    automaticDodgeSuccesses
  };
}

/**
 * Hidden targets cannot be directly targeted. A Blinded attacker must first
 * have successfully sensed a target; confirming here records that the required
 * non-sight Awareness Check was already resolved at the table and treats the
 * target as Obscured for this Attack.
 */
export async function validateAttackEnvironmentTargeting(attacker, defender, {
  areaAttack = false,
  ignoreHiddenTarget = false
} = {}) {
  let context = getAttackEnvironmentContext(attacker, defender, {
    areaAttack,
    ignoreHiddenTarget
  });

  if (context.hiddenTargetBlocked) {
    ui.notifications.warn(text(
      `${defender.name} está Oculto e não pode ser alvo direto de Ataques ou Efeitos. Ataques em Área ainda podem atingi-lo.`,
      `${defender.name} is Hidden and cannot be directly targeted by Attacks or Effects. Area Attacks can still hit it.`
    ));
    return { allowed: false, context };
  }

  if (context.blindedTargetBlocked) {
    const sensed = Boolean(await foundry.applications.api.DialogV2.confirm({
      classes: ["dda", "dda-environment-dialog"],
      window: { title: text("Alvo não localizado", "Target Not Located") },
      content: `<div class="dda-roll-dialog"><p>${text(
        `<strong>${escape(attacker.name)}</strong> está Cego. A regra exige um Teste de Awareness usando outro sentido para localizar <strong>${escape(defender.name)}</strong>. Esse Teste já foi bem-sucedido?`,
        `<strong>${escape(attacker.name)}</strong> is Blinded. The rule requires an Awareness Check using another sense to locate <strong>${escape(defender.name)}</strong>. Has that Check already succeeded?`
      )}</p><p class="hint">${text(
        "Se sim, o alvo será tratado como Obscured para este Ataque.",
        "If yes, the target is treated as Obscured for this Attack."
      )}</p></div>`,
      yes: { label: text("Sim — alvo localizado", "Yes — target sensed") },
      no: { label: text("Não — cancelar Ataque", "No — cancel Attack"), default: true },
      rejectClose: false,
      modal: true
    }));

    if (!sensed) return { allowed: false, context };
    context = getAttackEnvironmentContext(attacker, defender, {
      areaAttack,
      blindedTargetSensed: true,
      ignoreHiddenTarget
    });
  }

  return { allowed: true, context };
}

export async function revealActorFromInteraction(actor, reason = "interaction") {
  if (!actor?.system?.status?.hidden) return false;
  await actor.update({
    "system.status.hidden": false,
    "system.status.hiddenCheckTotal": 0,
    "system.status.hiddenRevealedTo": [],
    "system.status.hiddenEndedBy": String(reason ?? "interaction"),
    "system.status.hiddenEndedAt": new Date().toISOString()
  });
  return true;
}


function tokenForActor(actor) {
  return canvas?.tokens?.controlled?.find((token) => token.actor?.uuid === actor?.uuid)
    ?? canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === actor?.uuid)
    ?? null;
}

function distanceSpaces(actorA, actorB) {
  const a = tokenForActor(actorA);
  const b = tokenForActor(actorB);
  if (!a || !b) return null;
  const distance = getTokenGridDistance(a, b);
  return Number.isFinite(distance) ? Math.max(0, distance) : null;
}

export async function attemptHide(actor) {
  if (!actor) return null;
  const state = getCombatEnvironmentState(actor);
  // Submerged creatures are treated as Obscured to creatures outside the same
  // medium, so they may use that concealment to Hide without first breaking
  // line of sight.
  let canHide = state.sight === "obscured" || state.submerged;

  if (!canHide) {
    canHide = Boolean(await foundry.applications.api.DialogV2.confirm({
      classes: ["dda", "dda-environment-dialog"],
      window: { title: text("Ocultar-se", "Hide") },
      content: `<div class="dda-roll-dialog"><p>${text(
        "Para se esconder sem estar Obscured, a criatura precisa estar fora da linha de visão de quem deseja despistar. A linha de visão já foi quebrada?",
        "To Hide without being Obscured, the creature must be out of line of sight from those it wants to evade. Has line of sight already been broken?"
      )}</p></div>`,
      yes: { label: text("Sim", "Yes") },
      no: { label: text("Não", "No"), default: true },
      rejectClose: false,
      modal: true
    }));
  }
  if (!canHide) return null;

  const cost = actor.type === "character" ? 1 : 2;
  if (!checkActorActionSpend(actor, cost, { requireActiveUnit: true, notify: true })) return null;

  const result = actor.type === "character"
    ? await rollTamerCheck(actor, "stealth", {
        title: text("Teste de Furtividade — Ocultar-se", "Stealth Check — Hide"),
        fixedTn: 10
      })
    : await rollDerivedCheck(actor, "ram", {
        skillKey: "stealth",
        tn: 10,
        title: text("Teste de Furtividade — Ocultar-se", "Stealth Check — Hide")
      });

  if (!result) return null;
  if (!(await spendActorActions(actor, cost, { requireActiveUnit: true, notify: true }))) return null;
  const total = Math.max(0, number(result.total ?? result.roll?.total, 0));
  const success = Boolean(result.success ?? ["success", "criticalSuccess"].includes(String(result.outcome?.key ?? "")));
  if (success) {
    await actor.update({
      "system.status.hidden": true,
      "system.status.hiddenCheckTotal": total,
      "system.status.hiddenRevealedTo": [],
      "system.status.hiddenAt": new Date().toISOString()
    });
  }
  return { success, total, cost, result };
}

export async function attemptDetectHidden(actor) {
  if (!actor) return null;
  const targetToken = Array.from(game?.user?.targets ?? [])[0] ?? null;
  const target = targetToken?.actor ?? null;
  if (!target || !getCombatEnvironmentState(target).hidden) {
    ui.notifications.warn(text("Selecione uma criatura Oculta como alvo.", "Target a Hidden creature first."));
    return null;
  }

  const sense = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-environment-dialog"],
    window: { title: text("Detectar criatura Oculta", "Detect Hidden Creature") },
    content: `<div class="dda-roll-dialog"><p>${text("Qual sentido está sendo usado?", "Which sense is being used?")}</p></div>`,
    buttons: [
      { action: "sight", label: text("Visão", "Sight"), default: true, callback: () => "sight" },
      { action: "other", label: text("Outro sentido", "Other sense"), callback: () => "other" },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
  if (!sense) return null;

  const actorState = getCombatEnvironmentState(actor);
  if (sense === "sight" && actorState.sight === "blinded") {
    ui.notifications.warn(text("Uma criatura Cega não pode fazer Awareness baseado em visão.", "A Blinded creature cannot make a sight-based Awareness Check."));
    return null;
  }

  const targetState = getCombatEnvironmentState(target);
  const tn = Math.max(10, number(targetState.hiddenCheckTotal, 10));
  const obscuredForSight = targetState.sight === "obscured" || targetState.submerged !== actorState.submerged;
  const sightElement = targetState.sight === "obscured"
    ? targetState.obscuredElement
    : targetState.submerged !== actorState.submerged
      ? (targetState.submerged ? targetState.submergedElement : actorState.submergedElement)
      : "";
  const ignoresSightPenalty = sense === "sight" && obscuredForSight && naturewalkIgnoresObscurity(actor, sightElement);
  const sightPenalty = sense === "sight" && obscuredForSight && !ignoresSightPenalty ? -3 : 0;
  const cost = actor.type === "character" ? 1 : 2;
  if (!checkActorActionSpend(actor, cost, { requireActiveUnit: true, notify: true })) return null;

  const result = actor.type === "character"
    ? await rollTamerCheck(actor, "awareness", {
        title: text("Awareness — criatura Oculta", "Awareness — Hidden Creature"),
        fixedTn: tn,
        manualModifier: sightPenalty
      })
    : await rollDerivedCheck(actor, "dos", {
        skillKey: "awareness",
        tn,
        manualModifier: sightPenalty,
        title: text("Awareness — criatura Oculta", "Awareness — Hidden Creature"),
        targetActor: target
      });

  if (!result) return null;
  if (!(await spendActorActions(actor, cost, { requireActiveUnit: true, notify: true }))) return null;
  const success = Boolean(result.success ?? ["success", "criticalSuccess"].includes(String(result.outcome?.key ?? "")));
  const distance = distanceSpaces(actor, target);
  if (success && sense === "sight") {
    const revealed = new Set(targetState.hiddenRevealedTo);
    revealed.add(String(actor.uuid ?? ""));
    await target.update({ "system.status.hiddenRevealedTo": [...revealed] });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-special"><h2>${text("Detecção", "Detection")}</h2><p>${success
      ? sense === "sight"
        ? text(`${escape(actor.name)} localizou ${escape(target.name)} apesar da ocultação.`, `${escape(actor.name)} spotted ${escape(target.name)} despite the concealment.`)
        : text(`${escape(actor.name)} percebeu a criatura a aproximadamente ${distance ?? "?"} Espaços, mas não sua localização exata.`, `${escape(actor.name)} sensed the creature about ${distance ?? "?"} Spaces away, but not its exact location.`)
      : text(`${escape(actor.name)} não conseguiu localizar ${escape(target.name)}.`, `${escape(actor.name)} failed to locate ${escape(target.name)}.`)}</p></div>`
  });

  return { success, sense, tn, sightPenalty, distance, result };
}

function elementOptions(selected = "") {
  return [
    `<option value="">${text("— sem elemento definido —", "— no element specified —")}</option>`,
    ...ELEMENTS.map((element) => `<option value="${element}" ${selected === element ? "selected" : ""}>${element}</option>`)
  ].join("");
}

/**
 * Rule-state editor. These states depend on scene fiction/terrain, so the VTT
 * cannot infer them reliably from pixels alone. Once set, their mechanical
 * Attack/Dodge and drowning consequences are automatic.
 */
export async function openCombatEnvironmentDialog(actor) {
  if (!actor) return null;
  if (!game.user?.isGM && !actor.isOwner) {
    ui.notifications.warn(text("Você não pode alterar o estado deste personagem.", "You cannot change this actor's state."));
    return null;
  }

  const state = getCombatEnvironmentState(actor);
  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-environment-dialog"],
    window: { title: `${text("Ambiente de Combate", "Combat Environment")} — ${actor.name}` },
    position: { width: 520, height: "auto" },
    content: `
      <div class="dda-roll-dialog dda-environment-state-dialog">
        <div class="form-group"><label>${text("Visibilidade / visão", "Visibility / sight")}</label><select name="sight">
          <option value="unobscured" ${state.sight === "unobscured" ? "selected" : ""}>${text("Unobscured", "Unobscured")}</option>
          <option value="obscured" ${state.sight === "obscured" ? "selected" : ""}>${text("Obscured", "Obscured")}</option>
          <option value="blinded" ${state.sight === "blinded" ? "selected" : ""}>${text("Blinded", "Blinded")}</option>
        </select></div>
        <div class="form-group"><label>${text("Elemento que causa Obscured", "Element causing Obscured")}</label><select name="obscuredElement">${elementOptions(state.obscuredElement)}</select></div>
        <label class="dda-tamer-action-check"><input type="checkbox" name="hidden" ${state.hidden ? "checked" : ""}><span>${text("Hidden — não pode ser alvo direto", "Hidden — cannot be directly targeted")}</span></label>
        <label class="dda-tamer-action-check"><input type="checkbox" name="submerged" ${state.submerged ? "checked" : ""}><span>${text("Submerged", "Submerged")}</span></label>
        <div class="form-group"><label>${text("Elemento/material da submersão", "Submersion element/material")}</label><select name="submergedElement">${elementOptions(state.submergedElement)}</select></div>
        <label class="dda-tamer-action-check"><input type="checkbox" name="drowning" ${state.drowning ? "checked" : ""}><span>${text("Sem acesso a ar / Drowning", "No access to air / Drowning")}</span></label>
        <div class="form-group"><label>${text("Cover", "Cover")}</label><select name="cover">
          <option value="none" ${state.cover === "none" ? "selected" : ""}>${text("Nenhuma", "None")}</option>
          <option value="partial" ${state.cover === "partial" ? "selected" : ""}>${text("Parcial (+1 Dodge Success)", "Partial (+1 Dodge Success)")}</option>
          <option value="major" ${state.cover === "major" ? "selected" : ""}>${text("Quase total (+2 Dodge Successes)", "Near-total (+2 Dodge Successes)")}</option>
        </select></div>
        <p class="hint">${text(
          "Cover e Obscured não acumulam: a automação usa apenas o maior bônus. Submerged gera Obscured entre participantes em meios diferentes.",
          "Cover and Obscured do not stack: automation uses only the higher bonus. Submerged creates Obscured between participants in different media."
        )}</p>
      </div>`,
    buttons: [
      {
        action: "save",
        label: text("Salvar", "Save"),
        default: true,
        callback: (_event, button) => {
          const form = button.form?.elements ?? {};
          return {
            sight: String(form.sight?.value ?? "unobscured"),
            obscuredElement: normalizeElement(form.obscuredElement?.value),
            hidden: Boolean(form.hidden?.checked),
            submerged: Boolean(form.submerged?.checked),
            submergedElement: normalizeElement(form.submergedElement?.value),
            drowning: Boolean(form.drowning?.checked),
            cover: String(form.cover?.value ?? "none")
          };
        }
      },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null,
    modal: true
  });

  if (!result) return null;
  await updateCombatEnvironmentState(actor, result);
  return result;
}

function hasWaterBreathing(actor) {
  const swim = actor?.system?.movementTypes?.swim ?? {};
  const advanced = actor?.system?.qualityFeatures?.advancedMobility?.swim ?? {};
  return Boolean(
    actorHasNaturewalkElement(actor, "water") ||
    swim.canBreatheUnderwater ||
    advanced.canBreatheUnderwater ||
    advanced.underwaterBreathing
  );
}

function hasUnlimitedHoldBreathUses(actor) {
  const swim = actor?.system?.movementTypes?.swim ?? {};
  const advanced = actor?.system?.qualityFeatures?.advancedMobility?.swim ?? {};
  return Boolean(
    swim.isExtraMovement ||
    swim.indefiniteBreath ||
    advanced.indefiniteBreath
  );
}

function activeHoldBreathEffect(actor) {
  return (actor?.system?.effects?.active ?? []).find((effect) => {
    return String(effect?.tag ?? "").replace(/^\[|\]$/g, "").toLowerCase() === "holdbreath";
  }) ?? null;
}

async function consumeHoldBreathEffect(actor, effect) {
  if (!effect) return false;
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const remaining = effects.filter((entry) => String(entry.id ?? "") !== String(effect.id ?? ""));
  await actor.update({ "system.effects.active": remaining });
  return true;
}

function responsibleAutomationUser(actor) {
  const users = (game?.users?.contents ?? []).filter((user) => user.active);
  const owners = users
    .filter((user) => !user.isGM)
    .filter((user) => actor?.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (owners.length) return owners[0];
  return users.filter((user) => user.isGM).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function drowningUseState(actor, combat) {
  const combatId = String(combat?.id ?? "");
  const stored = foundry.utils.deepClone(actor?.system?.combat?.holdBreath ?? {});
  return String(stored.combatId ?? "") === combatId
    ? { combatId, used: Math.max(0, number(stored.used, 0)) }
    : { combatId, used: 0 };
}

async function offerImmediateHoldBreath(actor, combat) {
  const actions = Math.max(0, number(actor?.system?.combat?.actions?.value, 0));
  if (actions < 1) return false;

  let limit = Infinity;
  let state = null;
  if (["digimon", "npc"].includes(actor.type)) {
    state = drowningUseState(actor, combat);
    if (!hasUnlimitedHoldBreathUses(actor)) {
      limit = Math.max(0, number(actor?.system?.derivedStats?.cpu?.value, 0));
      if (state.used >= limit) return false;
    }
  }

  const use = Boolean(await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-environment-dialog"],
    window: { title: text("Afogamento — Prender a Respiração", "Drowning — Hold Breath") },
    content: `<div class="dda-roll-dialog"><p>${text(
      `<strong>${escape(actor.name)}</strong> começou o turno sem ar. Gastar <strong>1 Ação</strong> imediatamente para Prender a Respiração e evitar o Dano deste turno?`,
      `<strong>${escape(actor.name)}</strong> started the turn without air. Spend <strong>1 Action</strong> immediately to Hold Breath and prevent this turn's Damage?`
    )}</p>${Number.isFinite(limit) ? `<p class="hint">${text("Usos de CPU", "CPU uses")}: ${state.used}/${limit}</p>` : ""}</div>`,
    yes: { label: text("Prender a Respiração — 1A", "Hold Breath — 1A"), default: true },
    no: { label: text("Não", "No") },
    rejectClose: false,
    modal: true
  }));
  if (!use) return false;

  const payment = await spendActorActions(actor, 1, { requireActiveUnit: false, notify: true });
  if (!payment) return false;

  if (state && Number.isFinite(limit)) {
    await actor.update({
      "system.combat.holdBreath": {
        combatId: state.combatId,
        used: state.used + 1
      }
    });
  }
  return true;
}

export async function processDrowningStartOfTurn(actor, combat = game?.combat) {
  if (!actor || !combat?.started || !["digimon", "npc"].includes(actor.type)) return null;

  const unitId = getCombatantUnitId(combat?.combatant) || String(combat?.combatant?.id ?? "");
  const tick = `${combat.id}:${number(combat.round, 0)}:${unitId}`;
  if (String(actor.system?.combat?.drowningStartTurnTick ?? "") === tick) return null;
  if (responsibleAutomationUser(actor)?.id !== game.user?.id) return null;

  // Claim every activation, even while the actor still has air. A pre-emptive
  // Hold Breath lasts through the next start of turn only; if no drowning is
  // present at that point, the prepared protection simply expires unused.
  await actor.update({ [DROWNING_TICK_PATH]: tick });

  const status = getCombatEnvironmentState(actor);
  const prepared = activeHoldBreathEffect(actor);

  if (!status.drowning) {
    if (prepared) await consumeHoldBreathEffect(actor, prepared);
    return prepared ? { prevented: true, reason: "preparedHoldBreathExpiredWithAir" } : null;
  }

  if (hasWaterBreathing(actor)) {
    if (prepared) await consumeHoldBreathEffect(actor, prepared);
    return { prevented: true, reason: "waterBreathing" };
  }

  if (prepared) {
    await consumeHoldBreathEffect(actor, prepared);
    return { prevented: true, reason: "preparedHoldBreath" };
  }

  if (await offerImmediateHoldBreath(actor, combat)) {
    return { prevented: true, reason: "immediateHoldBreath" };
  }

  const damage = Math.max(0, number(getActorSv(actor), 0));
  if (damage <= 0) return { prevented: false, damage: 0 };

  const result = await applyDamage(actor, damage, {
    unalterable: true,
    damageType: "drowning",
    damageLabel: text("Afogamento", "Drowning"),
    damageSourceKind: "environment",
    suppressFatesProtection: true
  });

  return { prevented: false, damage, result };
}

async function processActiveUnitDrowning(combat) {
  if (!combat?.started || !combat?.combatant) return;
  const activeUnitId = getCombatantUnitId(combat.combatant);
  const members = (combat.combatants?.contents ?? []).filter((combatant) => {
    if (!combatant?.actor) return false;
    return activeUnitId
      ? getCombatantUnitId(combatant) === activeUnitId
      : combatant.id === combat.combatant.id;
  });
  for (const member of members) {
    await processDrowningStartOfTurn(member.actor, combat).catch((error) => {
      console.error("DDA | Drowning start-of-turn processing failed.", error, member.actor);
    });
  }
}

export function registerCombatEnvironment() {
  Hooks.on("combatStart", (combat) => void processActiveUnitDrowning(combat));
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("turn" in changed) && !("round" in changed)) return;
    void processActiveUnitDrowning(combat);
  });

  game.dda ??= {};
  game.dda.environment = {
    getState: getCombatEnvironmentState,
    getAttackContext: getAttackEnvironmentContext,
    validateAttackTargeting: validateAttackEnvironmentTargeting,
    revealFromInteraction: revealActorFromInteraction,
    hide: attemptHide,
    detectHidden: attemptDetectHidden,
    open: openCombatEnvironmentDialog,
    processDrowningStartOfTurn
  };

  console.log(`DDA | Combat environment automation registered for ${SYSTEM_ID}.`);
}
