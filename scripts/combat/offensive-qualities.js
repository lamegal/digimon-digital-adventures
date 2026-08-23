import {
  areActorsAllies,
  areActorsAlliesForQualities,
  findQuality,
  getActorDerivedStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  getCombatTurn,
  getQualityRank,
  normalizeKey,
  rollDerivedCheck
} from "../rules/quality-automation.js";

import {
  spendActorActions
} from "./action-economy.js";

import {
  hasBossQuality,
  isBossTrueSightObserver
} from "./boss-qualities.js";

import {
  getDDAMovementContext
} from "../canvas/movement-context.js";

import {
  getTokenGridDistance as getNativeTokenGridDistance
} from "./positioning.js";


const SYSTEM_ID = "digimon-digital-adventures";
const OFFENSIVE_STATE_PATH = "system.combat.offensiveQualities";

const text = (pt, en) => String(game.i18n?.lang ?? "")
  .toLowerCase()
  .startsWith("en")
  ? en
  : pt;

const escapeHtml = (value = "") => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function actorKey(actor) {
  return String(actor?.uuid ?? actor?.id ?? "");
}

function tokenForActor(actor) {
  if (!actor) return null;
  return (canvas?.tokens?.controlled ?? []).find((token) => token.actor?.uuid === actor.uuid)
    ?? (canvas?.tokens?.placeables ?? []).find((token) => token.actor?.uuid === actor.uuid || token.actor?.id === actor.id)
    ?? null;
}

export function getTokenDistanceSpaces(leftToken, rightToken) {
  return getNativeTokenGridDistance(leftToken, rightToken);
}

function uniqueActorsFromCanvas() {
  return Array.from(new Map(
    (canvas?.tokens?.placeables ?? [])
      .filter((token) => token.actor)
      .map((token) => [token.actor.uuid, token.actor])
  ).values());
}

function getCombatActors() {
  return Array.from(new Map(
    (game?.combat?.combatants?.contents ?? [])
      .filter((combatant) => combatant.actor)
      .map((combatant) => [combatant.actor.uuid, combatant.actor])
  ).values());
}

function currentTurnSignature(actor) {
  return `${getCombatId()}:${getCombatRound()}:${getCombatTurn()}:${actorKey(actor)}`;
}

function getState(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.offensiveQualities ?? {});
}

async function updateState(actor, state) {
  await actor.update({ [OFFENSIVE_STATE_PATH]: state });
}

function qualityId(item) {
  return normalizeKey(
    item?.system?.sourceId ??
    item?.system?.id ??
    item?.system?.originalName ??
    item?.name ??
    ""
  );
}

function qualityMatchesAny(item, aliases = []) {
  const key = qualityId(item);
  return aliases.map(normalizeKey).includes(key);
}

function hasQualityAny(actor, aliases = []) {
  return Boolean((actor?.items ?? []).find((item) => item.type === "quality" && qualityMatchesAny(item, aliases)));
}

function isMinion(actor) {
  return Boolean(
    actor?.system?.enemy?.isMinion ||
    actor?.system?.enemy?.rank === "minion" ||
    actor?.system?.combat?.isMinion
  );
}

function isVisibleEnemy(source, candidate) {
  const token = tokenForActor(candidate);
  return Boolean(
    candidate &&
    token &&
    !token.document?.hidden &&
    !areActorsAlliesForQualities(source, candidate)
  );
}

function getAdjacentActors(actor) {
  const sourceToken = tokenForActor(actor);
  if (!sourceToken) return [];
  return uniqueActorsFromCanvas()
    .filter((candidate) => candidate.uuid !== actor.uuid)
    .map((candidate) => ({
      actor: candidate,
      token: tokenForActor(candidate),
      distance: getTokenDistanceSpaces(sourceToken, tokenForActor(candidate))
    }))
    .filter((entry) => entry.token && entry.distance <= 1);
}

async function createQualityCard(actor, title, body, { className = "effect-special", details = [] } = {}) {
  const detailHtml = details.length
    ? `<ul class="dda-effect-list">${details.map((entry) => `<li>${entry}</li>`).join("")}</ul>`
    : "";
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card ${className} dda-offensive-quality-card">
      <h2>${escapeHtml(title)}</h2>
      <p>${body}</p>
      ${detailHtml}
    </div>`
  });
}

async function promptNumberV2({ title, label, value = 12, min = 0, max = 99 } = {}) {
  try {
    const result = await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
      window: { title },
      content: `<form class="dda-roll-dialog dda-offensive-quality-dialog">
        <div class="form-group">
          <label>${escapeHtml(label)}</label>
          <input type="number" name="value" value="${number(value)}" min="${number(min)}" max="${number(max)}" step="1">
        </div>
      </form>`,
      ok: {
        label: text("Confirmar", "Confirm"),
        callback: (_event, button) => number(button.form.elements.value?.value, value)
      },
      rejectClose: false,
      modal: true
    });
    return result === null || result === undefined ? null : number(result, value);
  } catch (_error) {
    return null;
  }
}

async function chooseV2({ title, content = "", options = [], name = "choice", defaultValue = "" } = {}) {
  const select = options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(defaultValue) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  try {
    return await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
      window: { title },
      content: `<form class="dda-roll-dialog dda-offensive-quality-dialog">
        ${content}
        <div class="form-group"><select name="${escapeHtml(name)}">${select}</select></div>
      </form>`,
      ok: {
        label: text("Confirmar", "Confirm"),
        callback: (_event, button) => String(button.form.elements[name]?.value ?? "")
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    return null;
  }
}

async function useHordeDuelist(actor, item) {
  const state = getState(actor);
  const lock = state.hordeDuelist?.lockedCombatId;
  if (lock && lock === getCombatId()) {
    ui.notifications.warn(text("Duelista de Hordas está bloqueado até o fim deste Combate.", "Horde Duelist is locked until the end of this Combat."));
    return null;
  }

  const adjacent = getAdjacentActors(actor);
  const allies = adjacent.filter((entry) => areActorsAlliesForQualities(actor, entry.actor));
  const enemies = adjacent.filter((entry) => !areActorsAlliesForQualities(actor, entry.actor));
  if (!enemies.length || allies.length) {
    ui.notifications.warn(text(
      "Duelista de Hordas exige ao menos um inimigo adjacente e nenhum aliado adjacente.",
      "Horde Duelist requires at least one adjacent enemy and no adjacent allies."
    ));
    return null;
  }

  const payment = await spendActorActions(actor, 1);
  if (!payment) return null;

  const counted = enemies.filter((entry) => !isMinion(entry.actor));
  const highestStage = counted.reduce((max, entry) => Math.max(max, number(entry.actor.system?.stageValue)), 0);
  const tn = 10 + highestStage + counted.length;
  const result = await rollDerivedCheck(actor, "bit", {
    skillKey: "survival",
    tn,
    title: item.name
  });
  if (!result) return null;

  if (result.criticalFailure) {
    state.hordeDuelist = {
      lockedCombatId: getCombatId(),
      turnSignature: currentTurnSignature(actor),
      active: false
    };
  } else if (result.success) {
    state.hordeDuelist = {
      active: true,
      bonus: getActorDerivedStat(actor, "bit"),
      turnSignature: currentTurnSignature(actor),
      expiresAtNextTurnStart: true,
      enemyUuids: enemies.map((entry) => entry.actor.uuid)
    };
  }

  if (result.criticalSuccess) {
    await actor.update({
      "system.combat.actions.value": number(actor.system?.combat?.actions?.value) + 1
    });
  }

  await updateState(actor, state);
  await createQualityCard(actor, item.name,
    result.success
      ? text("O Digimon abriu espaço no meio da horda e ganhou bônus de Precisão.", "The Digimon carved through the horde and gained an Accuracy bonus.")
      : text("A manobra não criou uma abertura.", "The maneuver did not create an opening."),
    {
      className: result.success ? "effect-positive" : "effect-negative",
      details: [
        `${text("NA", "TN")}: <strong>${tn}</strong>.`,
        `${text("Inimigos adjacentes considerados", "Counted adjacent enemies")}: <strong>${counted.length}</strong>.`,
        `${text("Maior Estágio", "Highest Stage")}: <strong>${highestStage}</strong>.`,
        result.success ? `${text("Bônus de Precisão", "Accuracy bonus")}: <strong>+${getActorDerivedStat(actor, "bit")}</strong>.` : ""
      ].filter(Boolean)
    }
  );
  return result;
}

async function useHideInPlainSight(actor, item) {
  const state = getState(actor);
  if (state.hideInPlainSight?.usedTurnSignature === currentTurnSignature(actor)) {
    ui.notifications.warn(text("Ocultar-se à Vista já foi usado neste turno.", "Hide in Plain Sight has already been used this turn."));
    return null;
  }

  const tn = await promptNumberV2({
    title: item.name,
    label: text("NA do Teste de Furtividade definido pelo Mestre", "Stealth Check TN set by the GM"),
    value: 12,
    min: 0,
    max: 99
  });
  if (tn === null) return null;

  const payment = await spendActorActions(actor, 1);
  if (!payment) return null;
  const result = await rollDerivedCheck(actor, "ram", {
    skillKey: "stealth",
    tn,
    title: item.name
  });
  if (!result) return null;

  const token = tokenForActor(actor);
  state.hideInPlainSight = {
    active: Boolean(result.success),
    usedTurnSignature: currentTurnSignature(actor),
    checkSuccesses: number(result.totalSuccesses ?? result.successes),
    originX: number(token?.document?.x),
    originY: number(token?.document?.y),
    movedSinceHide: false,
    sourceActorUuid: actor.uuid,
    shared: false
  };
  await updateState(actor, state);

  await createQualityCard(actor, item.name,
    result.success
      ? text("O Digimon está escondido e pode preparar um Ataque Furtivo.", "The Digimon is hidden and can prepare a Sneak Attack.")
      : text("O Digimon não conseguiu se esconder.", "The Digimon failed to hide."),
    { className: result.success ? "effect-positive" : "effect-negative" }
  );
  return result;
}

async function useShadeCloak(actor, item) {
  const sourceState = getState(actor).hideInPlainSight;
  if (!sourceState?.active) {
    ui.notifications.warn(text("Manto de Sombras exige que o Digimon esteja escondido.", "Shade Cloak requires the Digimon to be hidden."));
    return null;
  }
  const sourceToken = tokenForActor(actor);
  const range = Math.max(0, getActorDerivedStat(actor, "ram"));
  const allies = uniqueActorsFromCanvas().filter((candidate) => {
    if (candidate.uuid === actor.uuid || !areActorsAlliesForQualities(actor, candidate)) return false;
    return getTokenDistanceSpaces(sourceToken, tokenForActor(candidate)) <= range;
  });

  if (!allies.length) {
    ui.notifications.warn(text("Nenhum aliado está dentro do alcance do Manto de Sombras.", "No ally is within Shade Cloak range."));
    return null;
  }

  const choices = allies.map((candidate) => ({ value: candidate.uuid, label: candidate.name }));
  let selected = null;
  try {
    selected = await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
      window: { title: item.name },
      content: `<form class="dda-roll-dialog dda-offensive-quality-dialog">
        <p>${text("Escolha os aliados que compartilharão o mesmo resultado de Furtividade.", "Choose the allies that share the same Stealth result.")}</p>
        <div class="dda-offensive-quality-checklist">
          ${choices.map((choice) => `<label><input type="checkbox" name="allies" value="${escapeHtml(choice.value)}" checked> ${escapeHtml(choice.label)}</label>`).join("")}
        </div>
      </form>`,
      ok: {
        label: text("Aplicar", "Apply"),
        callback: (_event, button) => [...button.form.querySelectorAll('[name="allies"]:checked')].map((input) => input.value)
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    selected = null;
  }
  if (!Array.isArray(selected) || !selected.length) return null;

  const payment = await spendActorActions(actor, 1);
  if (!payment) return null;

  const selectedSet = new Set(selected);
  for (const ally of allies.filter((candidate) => selectedSet.has(candidate.uuid))) {
    const allyState = getState(ally);
    allyState.hideInPlainSight = {
      ...sourceState,
      active: true,
      sourceActorUuid: actor.uuid,
      sourceActorName: actor.name,
      shared: true,
      shadeCloakRange: range
    };
    await updateState(ally, allyState);
  }

  const state = getState(actor);
  state.shadeCloak = {
    active: true,
    allyUuids: selected,
    range,
    sourceTurnSignature: currentTurnSignature(actor)
  };
  await updateState(actor, state);
  await createQualityCard(actor, item.name,
    text("O resultado de Furtividade foi compartilhado com os aliados selecionados.", "The Stealth result was shared with the selected allies."),
    { className: "effect-positive", details: selected.map((uuid) => escapeHtml(allies.find((entry) => entry.uuid === uuid)?.name ?? uuid)) }
  );
  return true;
}

function enemyWeightFromCombat(actor, enemy) {
  const combatant = game?.combat?.combatants?.find((entry) => entry.actor?.uuid === enemy.uuid);
  return Math.max(1, number(combatant?.getFlag?.(SYSTEM_ID, "enemyStrengthWeight") ?? combatant?.flags?.[SYSTEM_ID]?.enemyStrengthWeight, 1));
}

async function useBattleCry(actor, item) {
  const state = getState(actor);
  if (state.battleCry?.lockedCombatId === getCombatId()) {
    ui.notifications.warn(text("Grito de Guerra está bloqueado até o fim deste Combate.", "Battle Cry is locked until the end of this Combat."));
    return null;
  }

  const enemies = getCombatActors().filter((candidate) => isVisibleEnemy(actor, candidate));
  if (!enemies.length) {
    ui.notifications.warn(text("Nenhum inimigo válido foi encontrado no Combate.", "No valid enemy was found in Combat."));
    return null;
  }

  let weights = null;
  try {
    weights = await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
      window: { title: item.name },
      content: `<form class="dda-roll-dialog dda-offensive-quality-dialog">
        <p>${text("Ajuste o peso de inimigos excepcionais. Normal = 1.", "Adjust exceptionally strong enemy weights. Normal = 1.")}</p>
        ${enemies.map((enemy) => `<div class="form-group"><label>${escapeHtml(enemy.name)} (SV ${getActorSv(enemy)})</label><input type="number" name="weight-${escapeHtml(enemy.id)}" value="${enemyWeightFromCombat(actor, enemy)}" min="1" max="9"></div>`).join("")}
      </form>`,
      ok: {
        label: text("Rolar", "Roll"),
        callback: (_event, button) => Object.fromEntries(enemies.map((enemy) => [enemy.uuid, Math.max(1, number(button.form.elements[`weight-${enemy.id}`]?.value, 1))]))
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    weights = null;
  }
  if (!weights) return null;

  const payment = await spendActorActions(actor, 1);
  if (!payment) return null;
  const highestSv = enemies.reduce((max, enemy) => Math.max(max, getActorSv(enemy)), 0);
  const enemyCount = enemies.reduce((total, enemy) => total + Math.max(1, number(weights[enemy.uuid], 1)), 0);
  const increase = Math.max(0, number(state.battleCry?.tnIncrease));
  const tn = 10 + highestSv + enemyCount + increase;
  const result = await rollDerivedCheck(actor, "dos", {
    skillKey: "bravery",
    tn,
    title: item.name
  });
  if (!result) return null;

  const bastion = result.success ? 2 : 1;
  const sourceToken = tokenForActor(actor);
  const range = Math.max(0, getActorDerivedStat(actor, "dos"));
  const allies = uniqueActorsFromCanvas().filter((candidate) => {
    if (!areActorsAlliesForQualities(actor, candidate)) return false;
    return getTokenDistanceSpaces(sourceToken, tokenForActor(candidate)) <= range;
  });

  for (const ally of allies) {
    const effects = foundry.utils.deepClone(ally.system?.effects?.active ?? []);
    const existingIndex = effects.findIndex((effect) => normalizeKey(effect.tag) === "bastion");
    const effect = {
      id: existingIndex >= 0 ? effects[existingIndex].id : foundry.utils.randomID(),
      tag: "bastion",
      label: `${item.name} — ${actor.name}`,
      value: bastion,
      potency: bastion,
      duration: 1,
      remaining: 1,
      sourceActorUuid: actor.uuid,
      sourceActorName: actor.name
    };
    if (existingIndex >= 0) effects[existingIndex] = effect;
    else effects.push(effect);
    await ally.update({ "system.effects.active": effects });
  }

  state.battleCry = {
    tnIncrease: increase + 6,
    lockedCombatId: result.criticalFailure ? getCombatId() : "",
    lastUse: currentTurnSignature(actor)
  };
  await updateState(actor, state);

  if (result.criticalSuccess) {
    await actor.update({ "system.combat.actions.value": number(actor.system?.combat?.actions?.value) + 1 });
  }

  await createQualityCard(actor, item.name,
    text(`Aliados em alcance receberam [BASTION ${bastion}].`, `Allies in range received [BASTION ${bastion}].`),
    {
      className: "effect-positive",
      details: [
        `${text("NA", "TN")}: <strong>${tn}</strong>.`,
        `${text("Maior SV inimigo", "Highest enemy SV")}: <strong>${highestSv}</strong>.`,
        `${text("Peso total de inimigos", "Total enemy weight")}: <strong>${enemyCount}</strong>.`,
        `${text("Aliados afetados", "Affected allies")}: <strong>${allies.map((ally) => escapeHtml(ally.name)).join(", ") || "—"}</strong>.`
      ]
    }
  );
  return result;
}

async function useWatchfulHunter(actor, item) {
  const targetToken = game.user.targets.first();
  const target = targetToken?.actor;
  if (!target || !isVisibleEnemy(actor, target)) {
    ui.notifications.warn(text("Selecione um inimigo visível.", "Select a visible enemy."));
    return null;
  }

  const state = getState(actor);
  const freeUsed = state.watchfulHunter?.freeUseRoundSignature === `${getCombatId()}:${getCombatRound()}`;
  const mode = await chooseV2({
    title: item.name,
    content: `<p>${text("Escolha o custo do Teste.", "Choose the Check cost.")}</p>`,
    options: [
      ...(!freeUsed ? [{ value: "free", label: text("Ação Livre da Qualidade (1/rodada)", "Quality Free Action (1/round)") }] : []),
      { value: "two", label: text("2 Ações", "2 Actions") }
    ],
    defaultValue: freeUsed ? "two" : "free"
  });
  if (!mode) return null;
  if (mode === "two") {
    const payment = await spendActorActions(actor, 2);
    if (!payment) return null;
  }

  const tn = 12 + getActorDerivedStat(target, "ram");
  const result = await rollDerivedCheck(actor, "dos", {
    skillKey: "awareness",
    tn,
    title: item.name,
    targetActor: target
  });
  if (!result) return null;

  state.watchfulHunter = {
    ...(state.watchfulHunter ?? {}),
    freeUseRoundSignature: mode === "free" ? `${getCombatId()}:${getCombatRound()}` : state.watchfulHunter?.freeUseRoundSignature,
    targetUuid: target.uuid,
    mode: result.criticalSuccess ? "all" : result.success ? "melee" : "none",
    bonus: result.success ? 2 : 0,
    obscuredByFailure: Boolean(result.criticalFailure),
    turnSignature: currentTurnSignature(actor),
    expiresAtNextTurnStart: true
  };
  await updateState(actor, state);
  await createQualityCard(actor, item.name,
    result.success
      ? text("O alvo foi estudado: +2 de Precisão contra ele.", "The target was studied: +2 Accuracy against it.")
      : text("O estudo não revelou uma abertura.", "The study did not reveal an opening."),
    { className: result.success ? "effect-positive" : "effect-negative" }
  );
  return result;
}

async function useReload(actor, item) {
  const state = getState(actor);
  if (state.reload?.lockedCombatId === getCombatId()) {
    ui.notifications.warn(text("Recarregar está bloqueado até o fim deste Combate.", "Reload is locked until the end of this Combat."));
    return null;
  }
  const ammoState = actor.system?.combat?.qualityAttackUses?.ammo ?? {};
  const spentIds = Object.entries(ammoState)
    .filter(([, entry]) => entry?.used && String(entry?.combatId ?? "") === getCombatId())
    .map(([id]) => id);
  if (!spentIds.length) {
    ui.notifications.warn(text("Nenhum Ataque [AMMO] foi gasto neste Combate.", "No [AMMO] Attack has been spent this Combat."));
    return null;
  }

  const payment = await spendActorActions(actor, 2);
  if (!payment) return null;
  const increase = Math.max(0, number(state.reload?.tnIncrease));
  const tn = 18 - getActorDerivedStat(actor, "ram") + increase;
  const result = await rollDerivedCheck(actor, "bit", {
    skillKey: "precision",
    tn,
    title: item.name
  });
  if (!result) return null;

  if (result.success) {
    const nextAmmo = foundry.utils.deepClone(ammoState);
    for (const id of spentIds) delete nextAmmo[id];
    const uses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
    uses.ammo = nextAmmo;
    await actor.update({ "system.combat.qualityAttackUses": uses });
    state.reload = {
      tnIncrease: increase + 3,
      lockedCombatId: ""
    };
  } else if (result.criticalFailure) {
    state.reload = {
      tnIncrease: increase,
      lockedCombatId: getCombatId()
    };
  }
  await updateState(actor, state);
  if (result.criticalSuccess) {
    await actor.update({ "system.combat.actions.value": number(actor.system?.combat?.actions?.value) + 1 });
  }
  await createQualityCard(actor, item.name,
    result.success
      ? text("O uso do Ataque [AMMO] foi restaurado.", "The [AMMO] Attack use was restored.")
      : text("A recarga falhou.", "The reload failed."),
    { className: result.success ? "effect-positive" : "effect-negative", details: [`${text("NA", "TN")}: <strong>${tn}</strong>.`] }
  );
  return result;
}

export async function useOffensiveQualityAction(actor, item) {
  if (!actor || !item || item.type !== "quality") return { handled: false, result: null };
  if (qualityMatchesAny(item, ["duelistaDeHordas", "hordeDuelist"])) return { handled: true, result: await useHordeDuelist(actor, item) };
  if (qualityMatchesAny(item, ["ocultarAVista", "hideInPlainSight"])) return { handled: true, result: await useHideInPlainSight(actor, item) };
  if (qualityMatchesAny(item, ["mantoDeSombras", "shadeCloak"])) return { handled: true, result: await useShadeCloak(actor, item) };
  if (qualityMatchesAny(item, ["gritoDeGuerra", "battleCry"])) return { handled: true, result: await useBattleCry(actor, item) };
  if (qualityMatchesAny(item, ["cacadorVigilante", "watchfulHunter"])) return { handled: true, result: await useWatchfulHunter(actor, item) };
  if (qualityMatchesAny(item, ["recarregar", "reload"])) return { handled: true, result: await useReload(actor, item) };
  return { handled: false, result: null };
}

export function getHordeDuelistAttackModifier(attacker, defender) {
  const state = attacker?.system?.combat?.offensiveQualities?.hordeDuelist;
  if (!state?.active || !defender) return null;
  const attackerToken = tokenForActor(attacker);
  const defenderToken = tokenForActor(defender);
  if (getTokenDistanceSpaces(attackerToken, defenderToken) > 1) return null;
  const allyAdjacentToTarget = getAdjacentActors(defender).some((entry) => {
    return entry.actor?.uuid !== attacker.uuid && areActorsAlliesForQualities(attacker, entry.actor);
  });
  if (allyAdjacentToTarget) return null;
  return {
    accuracyBonus: Math.max(0, number(state.bonus)),
    qualityName: text("Duelista de Hordas", "Horde Duelist")
  };
}

export function getSneakAttackState(attacker, defender) {
  const state = attacker?.system?.combat?.offensiveQualities?.hideInPlainSight;
  if (!state?.active || !defender) return null;

  // True Sight does not cancel Hide in Plain Sight globally. The attacker may
  // still be hidden from everybody else, but this specific defender sees it
  // automatically and therefore grants none of the hidden/Sneak benefits.
  if (isBossTrueSightObserver(defender)) {
    return {
      active: false,
      revealedByTrueSight: true,
      accuracyBonus: 0,
      movedSinceHide: Boolean(state.movedSinceHide),
      sourceActorUuid: state.sourceActorUuid,
      shared: Boolean(state.shared)
    };
  }

  return {
    active: true,
    revealedByTrueSight: false,
    accuracyBonus: state.movedSinceHide ? getActorDerivedStat(attacker, "ram") : 0,
    movedSinceHide: Boolean(state.movedSinceHide),
    sourceActorUuid: state.sourceActorUuid,
    shared: Boolean(state.shared)
  };
}

export function getReachModeData(actor) {
  const quality = (actor?.items ?? []).find((item) => item.type === "quality" && qualityMatchesAny(item, ["alcance", "reach"]));
  if (!quality) return { mode: "", rank: 0 };
  const choice = quality.system?.choices?.selectedRanks?.[0] ?? quality.system?.choices?.selected?.[0] ?? {};
  return {
    mode: normalizeKey(choice.key ?? choice.value ?? quality.system?.attackModifier?.reachMode ?? "wideSwings"),
    rank: Math.max(0, getQualityRank(quality)),
    quality
  };
}

async function clearShadeCloakGroup(sourceActor) {
  const sourceState = getState(sourceActor);
  const allyUuids = sourceState.shadeCloak?.allyUuids ?? [];
  for (const uuid of allyUuids) {
    let ally = null;
    try { ally = await fromUuid(uuid); } catch (_error) { ally = null; }
    if (!ally) continue;
    const state = getState(ally);
    if (state.hideInPlainSight?.sourceActorUuid === sourceActor.uuid) {
      state.hideInPlainSight.active = false;
      await updateState(ally, state);
    }
  }
  sourceState.shadeCloak = { active: false, allyUuids: [] };
  await updateState(sourceActor, sourceState);
}

export async function clearHiddenAfterInterference(actor) {
  const state = getState(actor);
  if (!state.hideInPlainSight?.active) return false;
  const sourceUuid = state.hideInPlainSight.sourceActorUuid;
  state.hideInPlainSight.active = false;
  await updateState(actor, state);
  if (state.hideInPlainSight.shared && sourceUuid) {
    let source = null;
    try { source = await fromUuid(sourceUuid); } catch (_error) { source = null; }
    if (source) await clearShadeCloakGroup(source);
  } else if (state.shadeCloak?.active) {
    await clearShadeCloakGroup(actor);
  }
  return true;
}

function counterattackQuality(actor) {
  return findQuality(actor, "counterAttack") ?? findQuality(actor, "counterattack");
}

function getAttackTags(attack) {
  return new Set([
    ...(attack?.system?.qualityTags ?? []),
    ...(attack?.system?.tags ?? []),
    ...(attack?.system?.baseTags?.tags ?? [])
  ].map((tag) => String(tag ?? "").replace(/^\[|\]$/g, "").trim().toLowerCase()));
}

async function chooseCounterAttack(actor) {
  const attacks = (actor?.items ?? []).filter((item) => item.type === "attack" && number(item.system?.actionCost?.value, 1) + number(item.system?.actionCost?.extra, 0) <= 1);
  if (!attacks.length) return null;
  const counterTagged = attacks.filter((attack) => getAttackTags(attack).has("counter"));
  const candidates = counterTagged.length ? counterTagged : attacks.filter((attack) => !getAttackTags(attack).has("counter"));
  const id = await chooseV2({
    title: text("Contra-Ataque", "Counterattack"),
    content: `<p>${counterTagged.length
      ? text("Uma Qualidade [COUNTER] restringe a resposta ao ataque marcado.", "A [COUNTER] Quality restricts the response to the tagged Attack.")
      : text("Escolha um Ataque de 1 Ação.", "Choose a 1-Action Attack.")}</p>`,
    options: candidates.map((attack) => ({ value: attack.id, label: attack.name })),
    defaultValue: candidates[0]?.id
  });
  return candidates.find((attack) => attack.id === id) ?? null;
}

async function getCounterMode(actor, attack, remainingUses) {
  const tags = getAttackTags(attack);
  if (!tags.has("counter")) return { dodgePenalty: Math.max(0, number(actor.system?.stageValue)), uses: 1 };
  const hasCounterblow = hasQualityAny(actor, ["contraGolpe", "counterblow"]);
  if (!hasCounterblow) return { dodgePenalty: Math.max(0, number(actor.system?.stageValue)), uses: 1 };
  const options = [
    { value: "dodge", label: text("Metade da Esquiva", "Half Dodge") },
    { value: "armor", label: text("Metade da Armadura", "Half Armor") }
  ];
  if (remainingUses >= 2) options.push({ value: "both", label: text("Ambos (2 usos)", "Both (2 uses)") });
  const mode = await chooseV2({ title: text("Contra-Golpe", "Counterblow"), options, defaultValue: "dodge" });
  if (!mode) return null;
  return {
    halveDodge: mode === "dodge" || mode === "both",
    halveArmor: mode === "armor" || mode === "both",
    uses: mode === "both" ? 2 : 1,
    dodgePenalty: 0
  };
}

export async function maybeTriggerCounterattack({ attacker, defender, attackItem, hit, attackOptions = {}, intercedeDeclaration = null, finalDamage = 0 } = {}) {
  if (!game?.combat?.started || !attacker || !defender || attackOptions?.suppressCounterTriggers) return null;
  const quality = counterattackQuality(defender);
  if (!quality) return null;

  const incomingRange = String(attackItem?.system?.baseTags?.rangeType ?? "").toLowerCase();
  const crossCounter = hasQualityAny(defender, ["contraGolpeCruzado", "crossCounter"]);
  const crossCounterThreshold = Math.max(0, number(defender.system?.stageValue) + 1);
  const missedTrigger = !hit;
  const crossTrigger = Boolean(crossCounter && hit && incomingRange === "melee" && number(finalDamage) >= crossCounterThreshold);
  if (!missedTrigger && !crossTrigger) return null;

  const usesMax = Math.max(1, getQualityRank(quality));
  const usesState = getState(defender);
  const used = String(usesState.counterattack?.combatId ?? "") === getCombatId()
    ? Math.max(0, number(usesState.counterattack?.used))
    : 0;
  const remainingUses = Math.max(0, usesMax - used);

  const chainCounter = hasBossQuality(defender, "chainCounter");
  const combatRound = Math.max(0, getCombatRound());
  const chainState = usesState.chainCounter ?? {};
  const chainFreeAvailable = Boolean(
    chainCounter &&
    (
      String(chainState.combatId ?? "") !== String(getCombatId() ?? "") ||
      Number(chainState.round ?? -1) !== combatRound ||
      !chainState.used
    )
  );

  const availableCounterUses = remainingUses + (chainFreeAvailable ? 1 : 0);
  if (availableCounterUses <= 0) return null;

  const instant = hasQualityAny(defender, ["contraAtaqueInstantaneo", "instantCounter"]);
  const instantUsed = String(usesState.instantCounter?.combatId ?? "") === getCombatId();
  const actions = number(defender.system?.combat?.actions?.value);
  if (actions < 1 && (!instant || instantUsed)) return null;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
          classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
    window: { title: quality.name },
    content: `<div class="dda-confirm-dialog dda-offensive-quality-dialog"><p>${text(
      `<strong>${escapeHtml(attacker.name)}</strong> abriu uma janela de Contra-Ataque. Usos disponíveis: <strong>${availableCounterUses}</strong>${chainFreeAvailable ? " (1 por Chain Counter)" : ""}.`,
      `<strong>${escapeHtml(attacker.name)}</strong> opened a Counterattack window. Available uses: <strong>${availableCounterUses}</strong>${chainFreeAvailable ? " (1 from Chain Counter)" : ""}.`
    )}</p></div>`,
    yes: { label: text("Contra-atacar", "Counterattack") },
    no: { label: text("Ignorar", "Ignore") },
    rejectClose: false,
    modal: true
  });
  if (!confirmed) return null;

  const responseAttack = await chooseCounterAttack(defender);
  if (!responseAttack) return null;
  const mode = await getCounterMode(defender, responseAttack, availableCounterUses);
  if (!mode || mode.uses > availableCounterUses) return null;

  const chainFreeUse = chainFreeAvailable ? Math.min(1, mode.uses) : 0;
  const regularCounterUsesSpent = Math.max(0, mode.uses - chainFreeUse);
  if (regularCounterUsesSpent > remainingUses) return null;

  let usedInstant = false;
  const instantAvailable = Boolean(instant && !instantUsed);

  if (instantAvailable) {
    try {
      usedInstant = Boolean(
        await foundry.applications.api.DialogV2.confirm({
          classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
          window: { title: text("Contra-Ataque Instantâneo", "Instant Counter") },
          content: `<p>${text(
            "Usar Contra-Ataque como Ação Livre? Este benefício só pode ser usado uma vez por Combate.",
            "Use Counterattack as a Free Action? This benefit can only be used once per Combat."
          )}</p>`,
          yes: { label: text("Usar Ação Livre", "Use Free Action") },
          no: { label: text("Gastar 1 Ação", "Spend 1 Action") },
          rejectClose: false,
          modal: true
        })
      );
    } catch (_error) {
      usedInstant = actions < 1;
    }
  }

  if (usedInstant) {
    usesState.instantCounter = { combatId: getCombatId(), used: true };
  } else {
    if (actions < 1) return null;
    const payment = await spendActorActions(defender, 1, { requireActiveUnit: false });
    if (!payment) return null;
  }
  usesState.counterattack = {
    combatId: getCombatId(),
    used: used + regularCounterUsesSpent
  };

  if (chainFreeUse > 0) {
    usesState.chainCounter = {
      combatId: getCombatId(),
      round: combatRound,
      used: true
    };
  }

  await updateState(defender, usesState);

  const targetToken = tokenForActor(attacker);
  if (!targetToken) return null;
  const { rollAttack } = await import("../rolls/attack-roll.js");
  return rollAttack(defender, responseAttack, {
    targetToken,
    isInterrupt: true,
    allowOutOfTurn: true,
    suppressCounterTriggers: true,
    areaAttackActive: false,
    counterattackContext: {
      active: true,
      dodgePenalty: mode.dodgePenalty,
      halveDodge: mode.halveDodge,
      halveArmor: mode.halveArmor,
      ignoreEffectiveLimitPenalty: Boolean(hasQualityAny(defender, ["fogoDeRetorno", "returnFire"]) && incomingRange === "range"),
      intercedeCrossCounter: Boolean(crossTrigger && intercedeDeclaration),
      bossChainCounterFreeUse: chainFreeUse,
      bossCounterattackUsesSpent: regularCounterUsesSpent,
      bossMassDestructionEligible: hasBossQuality(defender, "massDestruction")
    }
  });
}

function movementContextForToken(tokenDocument, options = {}) {
  const session = tokenDocument?.getFlag?.(SYSTEM_ID, "movementTracker") ?? null;
  return getDDAMovementContext(options, { session });
}

const pendingPunishingMoves = new Map();

function getMeleeReach(actor) {
  const reach = getReachModeData(actor);
  return 1 + Math.max(0, number(reach.rank));
}

function punishingAttack(actor) {
  const quality = findQuality(actor, "punishingStrike");
  if (!quality) return null;
  const selected = quality.system?.choices?.selectedRanks?.[0] ?? {};
  const id = String(selected.attackId ?? selected.attackItemId ?? "");
  return actor.items?.get(id) ?? (actor.items ?? []).find((item) => item.type === "attack" && getAttackTags(item).has("punish")) ?? null;
}

function responsibleUser(actor) {
  const activeUsers = (game?.users?.contents ?? []).filter((user) => user.active);
  const charmIds = game?.dda?.bossQualities?.getCharmAuthorizedUserIds?.(actor, { includeGMs: false });
  const player = Array.isArray(charmIds)
    ? activeUsers.find((user) => !user.isGM && charmIds.includes(String(user.id)))
    : activeUsers.find((user) => !user.isGM && actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
  return player ?? activeUsers.find((user) => user.isGM) ?? null;
}

async function handlePunishingMove(tokenDocument, changed, options = {}) {
  const mover = tokenDocument.actor;
  if (!mover || !game?.combat?.started) return;
  const oldPoint = { x: number(tokenDocument.x), y: number(tokenDocument.y) };
  const nextPoint = { x: number(changed.x, oldPoint.x), y: number(changed.y, oldPoint.y) };
  if (oldPoint.x === nextPoint.x && oldPoint.y === nextPoint.y) return;
  const movementContext = movementContextForToken(tokenDocument, options);
  if (!movementContext.voluntary) return;
  const teleport = movementContext.mode === "teleport";
  const oldTokenLike = { document: { ...tokenDocument.toObject(), x: oldPoint.x, y: oldPoint.y } };
  const nextTokenLike = { document: { ...tokenDocument.toObject(), x: nextPoint.x, y: nextPoint.y } };
  const candidates = uniqueActorsFromCanvas().filter((actor) => {
    if (actor.uuid === mover.uuid || areActorsAlliesForQualities(actor, mover)) return false;
    const attack = punishingAttack(actor);
    if (!attack) return false;
    if (teleport && !hasQualityAny(actor, ["naoHaEscapatoria", "thereIsNoEscape", "thereIsNoEscape"])) return false;
    const sourceToken = tokenForActor(actor);
    const reach = getMeleeReach(actor);
    return getTokenDistanceSpaces(sourceToken, oldTokenLike) <= reach && getTokenDistanceSpaces(sourceToken, nextTokenLike) > reach;
  });
  if (!candidates.length) return;
  pendingPunishingMoves.set(tokenDocument.id, { moverUuid: mover.uuid, candidates: candidates.map((actor) => actor.uuid), teleport });
}

async function resolvePunishingMove(tokenDocument) {
  const pending = pendingPunishingMoves.get(tokenDocument.id);
  pendingPunishingMoves.delete(tokenDocument.id);
  if (!pending) return;
  const mover = tokenDocument.actor;
  for (const uuid of pending.candidates) {
    let actor = null;
    try { actor = await fromUuid(uuid); } catch (_error) { actor = null; }
    if (!actor || responsibleUser(actor)?.id !== game.user.id) continue;
    const attack = punishingAttack(actor);
    if (!attack) continue;
    const state = getState(actor);
    const awareness = findQuality(actor, "combatAwareness");
    const temporalInstinctBonus = findQuality(actor, "temporalInForce")
      ? Math.max(0, getQualityRank(findQuality(actor, "instinct")))
      : 0;
    const maxUses = Math.max(1, getQualityRank(awareness) + temporalInstinctBonus);
    const used = String(state.punishingStrike?.combatId ?? "") === getCombatId() ? number(state.punishingStrike?.used) : 0;
    if (used >= maxUses) continue;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
          classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
      window: { title: text("Golpe Punitivo", "Punishing Strike") },
      content: `<p>${text(`<strong>${escapeHtml(mover.name)}</strong> deixou seu alcance. Usar <strong>${escapeHtml(attack.name)}</strong>?`, `<strong>${escapeHtml(mover.name)}</strong> left your reach. Use <strong>${escapeHtml(attack.name)}</strong>?`)}</p>`,
      yes: { label: text("Atacar", "Attack") },
      no: { label: text("Ignorar", "Ignore") },
      rejectClose: false,
      modal: true
    });
    if (!confirmed) continue;
    if (number(actor.system?.combat?.actions?.value) < 1) continue;
    const payment = await spendActorActions(actor, 1, { requireActiveUnit: false });
    if (!payment) continue;
    state.punishingStrike = { combatId: getCombatId(), used: used + 1 };
    await updateState(actor, state);
    const { rollAttack } = await import("../rolls/attack-roll.js");
    await rollAttack(actor, attack, {
      targetToken: tokenDocument.object ?? canvas.tokens?.get(tokenDocument.id),
      isInterrupt: true,
      allowOutOfTurn: true,
      suppressCounterTriggers: true,
      areaAttackActive: false,
      punishingStrikeContext: { active: true, ignoreMeleeRange: true, teleported: pending.teleport }
    });
  }
}

async function expireStartOfTurnStates(combat) {
  const activeActor = combat?.combatant?.actor;
  if (!activeActor) return;
  const state = getState(activeActor);
  let changed = false;
  for (const key of ["hordeDuelist", "watchfulHunter"]) {
    if (state[key]?.expiresAtNextTurnStart && state[key]?.turnSignature !== currentTurnSignature(activeActor)) {
      state[key].active = false;
      state[key].mode = "none";
      state[key].bonus = 0;
      changed = true;
    }
  }
  if (changed) await updateState(activeActor, state);
}

async function trackHideMovement(tokenDocument) {
  const actor = tokenDocument.actor;
  const state = getState(actor);
  if (!state.hideInPlainSight?.active) return;
  state.hideInPlainSight.movedSinceHide = true;
  await updateState(actor, state);
  if (state.hideInPlainSight.shared) {
    let source = null;
    try { source = await fromUuid(state.hideInPlainSight.sourceActorUuid); } catch (_error) { source = null; }
    if (source) {
      const distance = getTokenDistanceSpaces(tokenForActor(source), tokenDocument.object ?? canvas.tokens?.get(tokenDocument.id));
      if (distance > number(state.hideInPlainSight.shadeCloakRange)) await clearShadeCloakGroup(source);
    }
  }
}

export function registerOffensiveQualities() {
  Hooks.on("preUpdateToken", (tokenDocument, changed, options) => {
    void handlePunishingMove(tokenDocument, changed, options);
  });
  Hooks.on("updateToken", (tokenDocument, changed, options = {}) => {
    if (changed.x !== undefined || changed.y !== undefined) {
      const movementContext = movementContextForToken(tokenDocument, options);
      if (!movementContext.suppressMovementEffects) {
        void trackHideMovement(tokenDocument);
      }
      if (!movementContext.voluntary) {
        pendingPunishingMoves.delete(tokenDocument.id);
      } else {
        void resolvePunishingMove(tokenDocument);
      }
    }
  });
  Hooks.on("updateCombat", (combat, changed) => {
    if (changed.turn === undefined && changed.round === undefined) return;
    void expireStartOfTurnStates(combat);
  });
  game.dda ??= {};
  game.dda.offensiveQualities = {
    useQuality: useOffensiveQualityAction,
    getReachModeData,
    clearHiddenAfterInterference,
    maybeTriggerCounterattack
  };
}
