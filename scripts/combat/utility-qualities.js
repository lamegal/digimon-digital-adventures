import {
  areActorsAllies,
  areActorsAlliesForQualities,
  findQuality,
  getActorDerivedStat,
  getActorStageValue,
  getCombatId,
  getCombatRound,
  getCombatTurn,
  hasQuality,
  normalizeKey,
  rollDerivedCheck
} from "../rules/quality-automation.js";

import { withDDAMovementContext } from "../canvas/movement-context.js";
import { spendActorActions } from "./action-economy.js";
import { getTokenDistanceSpaces } from "./offensive-qualities.js";
import { applyDamage } from "../rolls/damage-application.js";
import { hasBossQuality } from "./boss-qualities.js";

const SYSTEM_ID = "digimon-digital-adventures";
const STATE_PATH = "system.combat.utilityQualities";
const DOMAIN_FLAG = "domainControl";
const ILLUSION_FLAG = "illusionaryOverlay";

const text = (pt, en) => String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value = "") => foundry.utils.escapeHTML(String(value ?? ""));

function primaryActiveGM() {
  return (game?.users?.contents ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  const primary = primaryActiveGM();
  return Boolean(primary && primary.id === game.user?.id);
}

function isMinion(actor) {
  return Boolean(
    actor?.system?.enemy?.isMinion ||
    actor?.system?.enemy?.rank === "minion" ||
    actor?.system?.combat?.isMinion
  );
}

function actorFromCanvasOrWorldUuid(uuid = "") {
  const key = String(uuid ?? "");
  return (canvas?.tokens?.placeables ?? []).find((token) => token.actor?.uuid === key)?.actor
    ?? game.actors?.get?.(key.split(".").pop())
    ?? null;
}

const DOMAIN_OPTIONS = {
  treacherousFire: { element: "fire", labelPt: "Fogo Traiçoeiro", labelEn: "Treacherous Fire", mode: "hostileAura", terrain: "enemy", tag: "burn", stat: "dos" },
  volatileElement: { element: "fire", labelPt: "Elemento Volátil", labelEn: "Volatile Element", mode: "exploit" },
  floodVortex: { element: "water", labelPt: "Vórtice de Inundação", labelEn: "Flood Vortex", mode: "chosenEffect", terrain: "all", terrainExemption: "swim", tag: "pull", stat: "cpu" },
  cleansingMist: { element: "water", labelPt: "Névoa Purificadora", labelEn: "Cleansing Mist", mode: "cleanse" },
  rumblingLand: { element: "earth", labelPt: "Terra Retumbante", labelEn: "Rumbling Land", mode: "hostileEffect", tag: "root", stat: "cpu" },
  stoneArmory: { element: "earth", labelPt: "Arsenal de Pedra", labelEn: "Stone Armory", mode: "shield" },
  gustyGarden: { element: "wind", labelPt: "Jardim de Rajadas", labelEn: "Gusty Garden", mode: "chosenEffect", terrain: "all", terrainExemption: "fly", tag: "push", stat: "ram" },
  boostingGale: { element: "wind", labelPt: "Vendaval Impulsionador", labelEn: "Boosting Gale", mode: "d6Effect", relation: "ally", excludeSelf: true, tag: "haste" },
  iceField: { element: "ice", labelPt: "Campo de Gelo", labelEn: "Ice Field", mode: "hostileAura", terrain: "enemy", tag: "freeze", stat: "dos" },
  frozenOver: { element: "ice", labelPt: "Congelado por Completo", labelEn: "Frozen Over", mode: "chosenEffect", tag: "frail", stat: "bit" },
  lightningRush: { element: "thunder", labelPt: "Investida Relâmpago", labelEn: "Lightning Rush", mode: "chosenEffect", tag: "tailwind", stat: "bit" },
  thunderJustice: { element: "thunder", labelPt: "Justiça Trovejante", labelEn: "Thunder Justice", mode: "d6Effect", maxStage: true, tag: "paralyze", stat: "dos" },
  poisonousGrowth: { element: "wood", labelPt: "Crescimento Venenoso", labelEn: "Poisonous Growth", mode: "hostileAura", terrain: "enemy", tag: "poison", stat: "cpu" },
  sappingStrength: { element: "wood", labelPt: "Força Drenante", labelEn: "Sapping Strength", mode: "d6Drain", maxStage: true },
  artificialLimitation: { element: "steel", labelPt: "Limitação Artificial", labelEn: "Artificial Limitation", mode: "hostileEffect", tag: "doom", stat: "bit" },
  dgDimension: { element: "steel", labelPt: "Dimensão DG", labelEn: "DG Dimension", mode: "d6Effect", maxStage: true, tag: "dot", stat: "dos" },
  rejuvenatingLight: { element: "light", labelPt: "Luz Rejuvenescedora", labelEn: "Rejuvenating Light", mode: "d6Effect", relation: "ally", maxStage: true, tag: "regen", stat: "cpu" },
  peacefulPressure: { element: "light", labelPt: "Pressão Pacífica", labelEn: "Peaceful Pressure", mode: "pacify" },
  shadowVale: { element: "darkness", labelPt: "Vale das Sombras", labelEn: "Shadow Vale", mode: "hostileEffect", tag: "fear", stat: "cpu" },
  nightmareShroud: { element: "darkness", labelPt: "Manto de Pesadelo", labelEn: "Nightmare Shroud", mode: "d6Effect", terrain: "enemy", maxStage: true, tag: "ruin", stat: "dos" }
};

function qualityKey(item) {
  return normalizeKey(item?.system?.sourceId ?? item?.system?.id ?? item?.system?.originalName ?? item?.name ?? "");
}

function getState(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.utilityQualities ?? {});
}

async function updateState(actor, state) {
  await actor.update({ [STATE_PATH]: state });
}

function currentTurnKey(actor) {
  return `${getCombatId()}:${getCombatRound()}:${getCombatTurn()}:${actor?.uuid ?? ""}`;
}

function tokenForActor(actor) {
  if (!actor) return null;
  return (canvas?.tokens?.controlled ?? []).find((token) => token.actor?.uuid === actor.uuid)
    ?? (canvas?.tokens?.placeables ?? []).find((token) => token.actor?.uuid === actor.uuid || token.actor?.id === actor.id)
    ?? null;
}

function tokenCenter(token) {
  const document = token?.document ?? token ?? {};
  const grid = Math.max(1, number(canvas?.grid?.size, 100));
  return {
    x: number(document.x) + Math.max(1, number(document.width, 1)) * grid / 2,
    y: number(document.y) + Math.max(1, number(document.height, 1)) * grid / 2
  };
}

function actorWounds(actor) {
  const root = actor?.type === "character" ? actor.system?.derived?.wounds : actor.system?.miscStats?.wounds;
  return { value: Math.max(0, number(root?.value)), max: Math.max(0, number(root?.max)) };
}

async function healActor(actor, amount) {
  const wounds = actorWounds(actor);
  const healed = Math.max(0, Math.min(wounds.max, wounds.value + Math.max(0, number(amount))) - wounds.value);
  if (healed <= 0) return 0;
  const path = actor.type === "character" ? "system.derived.wounds.value" : "system.miscStats.wounds.value";
  await actor.update({ [path]: wounds.value + healed });
  return healed;
}

function effectKey(effect) {
  return normalizeKey(String(effect?.tag ?? "").replace(/^\[|\]$/g, ""));
}

async function addOrRefreshEffect(actor, { tag, potency = 0, duration = 1, sourceActor = null, sourceName = "", special = {} } = {}) {
  if (!actor || !tag) return null;
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const key = normalizeKey(tag);
  const index = effects.findIndex((effect) => effectKey(effect) === key && (!sourceActor || effect.sourceActorUuid === sourceActor.uuid));
  const entry = {
    id: index >= 0 ? effects[index].id : foundry.utils.randomID(),
    tag: key,
    label: `[${String(tag).toUpperCase()}]`,
    potency: Math.max(0, number(potency)),
    value: Math.max(0, number(potency)),
    duration: Math.max(0, number(duration, 1)),
    remaining: Math.max(0, number(duration, 1)),
    maxDuration: Math.max(0, number(duration, 1)),
    sourceActorUuid: sourceActor?.uuid ?? "",
    sourceActorName: sourceActor?.name ?? sourceName,
    appliedCombatId: getCombatId(),
    appliedCombatRound: getCombatRound(),
    appliedCombatTurn: getCombatTurn(),
    ...special
  };
  if (index >= 0) effects[index] = { ...effects[index], ...entry, potency: Math.max(number(effects[index].potency), entry.potency), value: Math.max(number(effects[index].value), entry.value), remaining: Math.max(number(effects[index].remaining), entry.remaining) };
  else effects.push(entry);
  await actor.update({ "system.effects.active": effects });
  return entry;
}

async function removeNegativeEffects(actor, amount) {
  let remaining = Math.max(0, number(amount));
  if (!actor || remaining <= 0) return 0;
  const negative = new Set(["burn", "freeze", "poison", "ruin", "fear", "doom", "stun", "blind", "dot", "root", "frail", "paralyze", "pacify", "dull", "distract", "heavy", "confuse"]);
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  let removed = 0;
  for (let i = effects.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const effect = effects[i];
    if (!negative.has(effectKey(effect))) continue;
    const potency = Math.max(1, number(effect.potency ?? effect.value, 1));
    const reduce = Math.min(potency, remaining);
    remaining -= reduce;
    if (reduce >= potency) effects.splice(i, 1);
    else effects[i] = { ...effect, potency: potency - reduce, value: potency - reduce };
    removed += reduce;
  }
  if (removed > 0) await actor.update({ "system.effects.active": effects });
  return removed;
}

async function pickCanvasPoint({ title, maximumDistance = Number.POSITIVE_INFINITY, origin = null } = {}) {
  ui.notifications.info(text(`${title}: clique no canvas. Esc cancela.`, `${title}: click the canvas. Escape cancels.`));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      canvas?.stage?.off?.("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (event) => { if (event.key === "Escape") finish(null); };
    const onPointer = (event) => {
      const point = event.data?.getLocalPosition?.(canvas.stage) ?? event.getLocalPosition?.(canvas.stage);
      if (!point) return;
      if (origin && Number.isFinite(maximumDistance)) {
        const grid = Math.max(1, number(canvas?.grid?.size, 100));
        const distance = Math.hypot(point.x - origin.x, point.y - origin.y) / grid;
        if (distance > maximumDistance) {
          ui.notifications.warn(text(`O destino precisa estar dentro de ${maximumDistance} Espaços.`, `The destination must be within ${maximumDistance} Spaces.`));
          return;
        }
      }
      const snapped = canvas?.grid?.getSnappedPoint?.({ x: point.x, y: point.y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER }) ?? point;
      finish(snapped);
    };
    canvas?.stage?.on?.("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
  });
}

function getHeavyTeleportSuppression(actor) {
  const feature = actor?.system?.qualityFeatures?.heavy ?? {};
  return {
    active: Boolean(feature.active),
    transporterSuppressed: Boolean(feature.transporterSuppressed),
    teleportSuppressed: Boolean(feature.teleportSuppressed)
  };
}

function teleportDistance(actor) {
  const suppression = getHeavyTeleportSuppression(actor);
  if (suppression.teleportSuppressed) return 0;
  const movement = actor?.system?.movementTypes?.teleport ?? {};
  const base = Math.max(0, number(movement.total ?? movement.value ?? movement.distance));
  const transporter = hasQuality(actor, "transporter") && !suppression.transporterSuppressed ? 1 : 0;
  return base + transporter;
}

function canPlaceTokenAt(token, point) {
  if (!token || !point) return false;

  try {
    const visibility = canvas?.visibility?.testVisibility?.(
      point,
      { object: token }
    );
    if (visibility === false && !game.user?.isGM) return false;
  } catch (_error) {
    /* Visibility backends can be unavailable while the canvas is rebuilding. */
  }

  const grid = Math.max(1, number(canvas?.grid?.size, 100));
  const document = token.document ?? token;
  const x = point.x - Math.max(1, number(document.width, 1)) * grid / 2;
  const y = point.y - Math.max(1, number(document.height, 1)) * grid / 2;
  const collision = CONFIG.Canvas?.polygonBackends?.move?.testCollision?.(
    tokenCenter(token),
    point,
    { type: "move", mode: "any", source: token.document }
  );
  if (collision) return false;
  return !(canvas?.tokens?.placeables ?? []).some((other) => {
    if (other.id === token.id) return false;
    const center = tokenCenter(other);
    return Math.abs(center.x - point.x) < grid * 0.5 && Math.abs(center.y - point.y) < grid * 0.5;
  }) && Number.isFinite(x) && Number.isFinite(y);
}

async function adjacentTransportAllies(actor) {
  if (!hasQuality(actor, "transporter") || getHeavyTeleportSuppression(actor).transporterSuppressed) return [];
  const sourceToken = tokenForActor(actor);
  if (!sourceToken) return [];
  const candidates = (canvas?.tokens?.placeables ?? [])
    .filter((token) => token.actor && token.actor.uuid !== actor.uuid)
    .filter((token) => areActorsAlliesForQualities(actor, token.actor))
    .filter((token) => getTokenDistanceSpaces(sourceToken, token) <= 1);
  if (!candidates.length) return [];
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: text("Transportador", "Transporter") },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><p>${text("Escolha aliados adjacentes para levar junto.", "Choose adjacent allies to bring along.")}</p>${candidates.map((token) => `<label class="dda-quality-check"><input type="checkbox" name="allies" value="${token.id}"><span>${escapeHtml(token.name)}</span></label>`).join("")}</form>`,
    ok: { label: text("Continuar", "Continue"), callback: (_event, button) => Array.from(button.form.querySelectorAll('input[name="allies"]:checked')).map((input) => input.value) },
    rejectClose: false,
    modal: true
  });
  return Array.isArray(result) ? result.map((id) => canvas.tokens?.get(id)).filter(Boolean) : [];
}

async function moveTokenCenter(token, point) {
  const grid = Math.max(1, number(canvas?.grid?.size, 100));
  const document = token.document ?? token;
  const x = point.x - Math.max(1, number(document.width, 1)) * grid / 2;
  const y = point.y - Math.max(1, number(document.height, 1)) * grid / 2;
  await document.update({ x, y }, withDDAMovementContext(
    { animate: false, ddaTeleport: true },
    {
      mode: "teleport", movementBudget: "none", voluntary: true, reactions: true,
      traversal: false, source: "teleport", unwilling: false
    }
  ));
}

async function performTeleport(actor, { actionCost = 1, reaction = false, clashEscape = false } = {}) {
  const suppression = getHeavyTeleportSuppression(actor);
  if (suppression.teleportSuppressed) {
    ui.notifications.warn(text(
      "[HEAVY] está suprimindo o Teleporte deste Digimon.",
      "[HEAVY] is suppressing this Digimon's Teleport."
    ));
    return null;
  }

  const token = tokenForActor(actor);
  if (!token) {
    ui.notifications.warn(text("O Digimon precisa ter um Token na Cena.", "The Digimon needs a Token in the Scene."));
    return null;
  }
  const state = getState(actor);
  if ((reaction || clashEscape) && state.teleport?.escapeCombatId === getCombatId()) {
    ui.notifications.warn(text("A fuga por Teleporte já foi usada neste Combate.", "Teleport escape has already been used this Combat."));
    return null;
  }
  const allies = await adjacentTransportAllies(actor);
  const maximum = teleportDistance(actor);
  const origin = tokenCenter(token);
  const destination = await pickCanvasPoint({ title: text("Destino do Teleporte", "Teleport Destination"), maximumDistance: maximum, origin });
  if (!destination || !canPlaceTokenAt(token, destination)) {
    if (destination) ui.notifications.warn(text("O destino não está livre ou visível.", "The destination is not free or visible."));
    return null;
  }
  if (actionCost > 0 && !(await spendActorActions(actor, actionCost, { requireActiveUnit: !reaction && !clashEscape }))) return null;
  await moveTokenCenter(token, destination);
  const grid = Math.max(1, number(canvas?.grid?.size, 100));
  const offsets = [
    { x: grid, y: 0 }, { x: -grid, y: 0 }, { x: 0, y: grid }, { x: 0, y: -grid },
    { x: grid, y: grid }, { x: -grid, y: grid }, { x: grid, y: -grid }, { x: -grid, y: -grid }
  ];
  for (let index = 0; index < allies.length; index += 1) {
    const ally = allies[index];
    const candidate = { x: destination.x + offsets[index % offsets.length].x, y: destination.y + offsets[index % offsets.length].y };
    if (canPlaceTokenAt(ally, candidate)) await moveTokenCenter(ally, candidate);
    const allyState = getState(ally.actor);
    allyState.transporter = {
      ...(allyState.transporter ?? {}),
      actionDebt: 1,
      transportedByUuid: actor.uuid,
      appliesAtNextTurn: true,
      combatId: getCombatId()
    };
    await updateState(ally.actor, allyState);
  }
  if (reaction || clashEscape) {
    state.teleport = { ...(state.teleport ?? {}), escapeCombatId: getCombatId(), escapedAt: new Date().toISOString() };
    await updateState(actor, state);
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-utility-quality-card"><h2>${text("Teleporte", "Teleport")}</h2><ul class="dda-effect-list"><li>${text("Distância máxima", "Maximum distance")}: <strong>${maximum}</strong>.</li><li>${text("Aliados transportados", "Allies transported")}: <strong>${allies.length}</strong>.</li>${reaction ? `<li>${text("O Ataque é considerado um erro sem ativar efeitos de erro.", "The Attack is considered a miss without triggering miss effects.")}</li>` : ""}</ul></div>`
  });
  return { used: true, allies, destination, reaction, clashEscape };
}

export async function requestTeleportEscape({ defender, attacker = null, attackItem = null } = {}) {
  if (!defender || !hasQuality(defender, "teleport")) return null;
  const state = getState(defender);
  if (state.teleport?.escapeCombatId === getCombatId()) return null;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: text("Fuga por Teleporte", "Teleport Escape") },
    content: `<div class="dda-confirm-dialog dda-utility-quality-dialog"><p>${text(
      `<strong>${escapeHtml(defender.name)}</strong> pode usar Teleporte como Interrupção para escapar de <strong>${escapeHtml(attackItem?.name ?? "Ataque")}</strong> de ${escapeHtml(attacker?.name ?? "")}.`,
      `<strong>${escapeHtml(defender.name)}</strong> may use Teleport as an Interrupt to escape <strong>${escapeHtml(attackItem?.name ?? "Attack")}</strong> from ${escapeHtml(attacker?.name ?? "")}.`
    )}</p></div>`,
    yes: { label: text("Teleportar e escapar", "Teleport and escape") },
    no: { label: text("Rolar Esquiva", "Roll Dodge") },
    rejectClose: false,
    modal: true
  });
  if (!confirmed) return null;
  return performTeleport(defender, { actionCost: 0, reaction: true });
}

export async function useTeleportClashEscape(actor) {
  if (!actor || !hasQuality(actor, "teleport")) return null;
  return performTeleport(actor, { actionCost: 0, clashEscape: true });
}

async function clearGlamorCreated(actor) {
  if (!actor) return false;
  const creatorState = getState(actor);
  const targetUuids = Array.isArray(creatorState.glamorCreated?.targetActorUuids)
    ? creatorState.glamorCreated.targetActorUuids
    : [];
  let changed = false;

  for (const uuid of targetUuids) {
    try {
      const target = await fromUuid(uuid);
      if (!target || target.documentName !== "Actor") continue;
      const targetState = getState(target);
      if (targetState.glamor?.creatorActorUuid !== actor.uuid) continue;
      delete targetState.glamor;
      await updateState(target, targetState);
      changed = true;
    } catch (_error) {
      /* The old target may no longer exist. */
    }
  }

  if (creatorState.glamorCreated) {
    delete creatorState.glamorCreated;
    await updateState(actor, creatorState);
    changed = true;
  }

  return changed;
}

function actorSizeKey(actor) {
  return normalizeKey(
    actor?.system?.size?.value ??
    actor?.system?.size?.key ??
    actor?.system?.size ??
    ""
  );
}

async function swapGlamorTokens(actor, sourceToken, targets) {
  if (!sourceToken || !targets.some((token) => token.actor?.uuid === actor.uuid)) return null;
  const maximum = hasQuality(actor, "teleport") ? teleportDistance(actor) : 1;
  const eligible = targets
    .filter((token) => token.id !== sourceToken.id)
    .filter((token) => getTokenDistanceSpaces(sourceToken, token) <= maximum);
  if (!eligible.length) return null;

  const selectedId = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: text("Troca de Glamour", "Glamor Swap") },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><p>${text(
      "A ilusão foi criada com sucesso. Escolha um aliado disposto para trocar de lugar, ou mantenha as posições atuais.",
      "The illusion was created successfully. Choose a willing ally to swap places with, or keep the current positions."
    )}</p><div class="form-group"><label>${text("Aliado", "Ally")}</label><select name="ally"><option value="">${text("Não trocar", "Do not swap")}</option>${eligible.map((token) => `<option value="${token.id}">${escapeHtml(token.name)}</option>`).join("")}</select></div></form>`,
    ok: { label: text("Confirmar", "Confirm"), callback: (_event, button) => String(button.form.elements.ally?.value ?? "") },
    rejectClose: false,
    modal: true
  });

  if (!selectedId) return null;
  const ally = canvas.tokens?.get(selectedId);
  if (!ally) return null;
  const sourceDocument = sourceToken.document;
  const allyDocument = ally.document;
  await canvas.scene.updateEmbeddedDocuments("Token", [
    { _id: sourceDocument.id, x: allyDocument.x, y: allyDocument.y },
    { _id: allyDocument.id, x: sourceDocument.x, y: sourceDocument.y }
  ], withDDAMovementContext(
    { animate: false, ddaGlamorSwap: true },
    {
      mode: "teleport", movementBudget: "none", voluntary: true, reactions: true,
      traversal: false, source: "glamorSwap", unwilling: false
    }
  ));
  return ally;
}

async function useGlamor(actor, item) {
  const sourceToken = tokenForActor(actor);
  const range = Math.max(0, number(actor.system?.miscStats?.range?.total ?? actor.system?.miscStats?.range?.value));
  const candidates = (canvas?.tokens?.placeables ?? [])
    .filter((token) => token.actor && areActorsAlliesForQualities(actor, token.actor))
    .filter((token) => !sourceToken || getTokenDistanceSpaces(sourceToken, token) <= range);
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: item.name },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><div class="form-group"><label>${text("Aparência compartilhada", "Shared appearance")}</label><input type="text" name="appearance" required></div><div class="form-group"><label>${text("Tamanho aparente", "Apparent Size")}</label><input type="text" name="size" placeholder="Medium"></div><h3>${text("Alvos", "Targets")}</h3>${candidates.map((token) => `<label class="dda-quality-check"><input type="checkbox" name="targets" value="${token.id}" ${token.actor.uuid === actor.uuid ? "checked" : ""}><span>${escapeHtml(token.name)}</span></label>`).join("")}</form>`,
    ok: { label: text("Criar Glamour", "Create Glamor"), callback: (_event, button) => ({ appearance: String(button.form.elements.appearance?.value ?? "").trim(), size: String(button.form.elements.size?.value ?? "").trim(), targetIds: Array.from(button.form.querySelectorAll('input[name="targets"]:checked')).map((input) => input.value) }) },
    rejectClose: false,
    modal: true
  });
  if (!result?.appearance || !result.targetIds?.length) return null;
  const targets = result.targetIds.map((id) => canvas.tokens?.get(id)).filter(Boolean);
  if (!(await spendActorActions(actor, 2, { requireActiveUnit: Boolean(game?.combat?.started) }))) return null;
  const penalty = Math.max(0, targets.filter((token) => token.actor.uuid !== actor.uuid).length);
  const check = await rollDerivedCheck(actor, "bit", { skillKey: "performance", tn: 10, manualModifier: -penalty, title: item.name });
  if (!check?.success) return { success: false, check };

  await clearGlamorCreated(actor);
  const swappedWith = await swapGlamorTokens(actor, sourceToken, targets);
  const targetUuids = targets.map((entry) => entry.actor.uuid);

  for (const token of targets) {
    const targetState = getState(token.actor);
    targetState.glamor = {
      active: true,
      creatorActorUuid: actor.uuid,
      appearance: result.appearance,
      apparentSize: result.size,
      originalSize: actorSizeKey(token.actor),
      checkTotal: check.total,
      createdAt: new Date().toISOString()
    };
    await updateState(token.actor, targetState);
  }

  const creatorState = getState(actor);
  creatorState.glamorCreated = {
    active: true,
    targetActorUuids: targetUuids,
    appearance: result.appearance,
    apparentSize: result.size,
    checkTotal: check.total,
    swappedWithActorUuid: swappedWith?.actor?.uuid ?? ""
  };
  await updateState(actor, creatorState);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-utility-quality-card"><h2>${escapeHtml(item.name)}</h2><ul class="dda-effect-list"><li>${text("Alvos afetados", "Affected targets")}: <strong>${targets.length}</strong>.</li><li>${text("NA para perceber a ilusão", "TN to disbelieve the illusion")}: <strong>${number(check.total)}</strong>.</li>${swappedWith ? `<li>${text("Troca realizada com", "Swapped with")}: <strong>${escapeHtml(swappedWith.name)}</strong>.</li>` : ""}</ul></div>`
  });

  return { success: true, targets, check, appearance: result.appearance, swappedWith };
}

export async function breakGlamorOnAttackHit(defender, attackItem) {
  if (!defender) return false;
  const state = getState(defender);
  if (!state.glamor?.active) return false;
  const rangeType = String(attackItem?.system?.baseTags?.rangeType ?? "").toLowerCase();
  const apparentSize = normalizeKey(state.glamor.apparentSize ?? "");
  const originalSize = normalizeKey(state.glamor.originalSize ?? actorSizeKey(defender));
  const sizeMismatch = Boolean(apparentSize && originalSize && apparentSize !== originalSize);
  if (rangeType !== "melee" && !sizeMismatch) return false;

  const creatorUuid = state.glamor.creatorActorUuid;
  delete state.glamor;
  await updateState(defender, state);

  try {
    const creator = creatorUuid ? await fromUuid(creatorUuid) : null;
    if (creator?.documentName === "Actor") {
      const creatorState = getState(creator);
      if (Array.isArray(creatorState.glamorCreated?.targetActorUuids)) {
        creatorState.glamorCreated.targetActorUuids = creatorState.glamorCreated.targetActorUuids
          .filter((uuid) => uuid !== defender.uuid);
        await updateState(creator, creatorState);
      }
    }
  } catch (_error) {
    /* Creator may no longer exist. */
  }
  return true;
}

async function removeOverlayBlindFromActor(actor, templateId = "") {
  if (!actor || !templateId) return false;
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const filtered = effects.filter((effect) => {
    return !(effect?.illusionaryOverlay && String(effect?.overlayTemplateId ?? "") === String(templateId));
  });
  if (filtered.length === effects.length) return false;
  await actor.update({ "system.effects.active": filtered });
  return true;
}

async function applyOverlayBlind(actor, templateDocument, controller) {
  if (!actor || !templateDocument) return false;
  const templateId = String(templateDocument.id ?? "");
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const index = effects.findIndex((effect) => {
    return Boolean(
      effect?.illusionaryOverlay &&
      String(effect?.overlayTemplateId ?? "") === templateId
    );
  });
  const entry = {
    id: index >= 0 ? effects[index].id : foundry.utils.randomID(),
    tag: "blind",
    label: "[BLIND]",
    potency: 0,
    value: 0,
    durationRule: "special",
    hasDuration: false,
    hasSpecialDuration: true,
    duration: 0,
    remaining: 0,
    maxDuration: 0,
    sourceActorUuid: controller?.uuid ?? "",
    sourceActorName: controller?.name ?? "",
    illusionaryOverlay: true,
    overlayTemplateId: templateId,
    appliedCombatId: getCombatId(),
    appliedCombatRound: getCombatRound(),
    appliedCombatTurn: getCombatTurn()
  };
  if (index >= 0) effects[index] = { ...effects[index], ...entry };
  else effects.push(entry);
  await actor.update({ "system.effects.active": effects });
  return true;
}

async function clearIllusionaryOverlayEffects(templateId = "") {
  if (!templateId) return;
  const actors = new Map();
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  }
  for (const actor of actors.values()) {
    await removeOverlayBlindFromActor(actor, templateId);
  }
}

async function refreshIllusionaryShroud(templateDocument) {
  const flag = templateDocument?.getFlag?.(SYSTEM_ID, ILLUSION_FLAG);
  if (!flag || flag.mode !== "shroud") return;
  const controller = actorFromCanvasOrWorldUuid(flag.actorUuid);
  if (!controller) return;

  const insideIds = new Set(tokensInsideCircle(templateDocument).map((token) => token.id));
  const element = canonicalElement(flag.element ?? "");
  const templateId = String(templateDocument.id ?? "");

  for (const token of canvas?.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor) continue;
    const inside = insideIds.has(token.id);
    const isController = actor.uuid === controller.uuid;
    const allyKnows = Boolean(flag.alliesKnow && areActorsAlliesForQualities(controller, actor));
    const sharesElement = Boolean(element && actorSharesNaturewalkElement(actor, element));
    const shouldBlind = inside && !isController && !allyKnows && !sharesElement;

    if (shouldBlind) await applyOverlayBlind(actor, templateDocument, controller);
    else await removeOverlayBlindFromActor(actor, templateId);
  }
}

async function deleteIllusionaryOverlay(templateDocument, reason = "") {
  if (!templateDocument) return false;
  const flag = templateDocument.getFlag?.(SYSTEM_ID, ILLUSION_FLAG);
  if (!flag) return false;
  await clearIllusionaryOverlayEffects(String(templateDocument.id ?? ""));
  await templateDocument.delete({ ddaIllusionaryOverlayReason: reason });
  return true;
}

async function chooseOverlayDeclaration(actor, item) {
  const elements = actorNaturewalkElements(actor);
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: item.name },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog">
      <div class="form-group"><label>${text("Tipo", "Type")}</label>
        <select name="mode">
          <option value="shroud">${text("Manto Ilusório", "Illusionary Shroud")}</option>
          <option value="barrier">${text("Barreiras Ilusórias", "Illusionary Barriers")}</option>
        </select>
      </div>
      <div class="form-group"><label>${text("Elemento do Manto", "Shroud Element")}</label>
        <select name="element">
          <option value="">—</option>
          ${elements.map((element) => `<option value="${element}">${escapeHtml(element)}</option>`).join("")}
        </select>
      </div>
      <label class="dda-quality-check"><input type="checkbox" name="alliesKnow" checked><span>${text("Aliados reconhecem a ilusão", "Allies recognize the illusion")}</span></label>
    </form>`,
    ok: {
      label: text("Continuar", "Continue"),
      callback: (_event, button) => ({
        mode: String(button.form.elements.mode?.value ?? "shroud"),
        element: canonicalElement(button.form.elements.element?.value ?? ""),
        alliesKnow: Boolean(button.form.elements.alliesKnow?.checked)
      })
    },
    rejectClose: false,
    modal: true
  });
  if (!result) return null;
  if (result.mode === "shroud" && !result.element) {
    ui.notifications.warn(text("O Manto Ilusório exige um Elemento de Passo Natural.", "Illusionary Shroud requires a Naturewalk Element."));
    return null;
  }
  return result;
}

async function useIllusionaryOverlay(actor, item) {
  const token = tokenForActor(actor);
  if (!token) {
    ui.notifications.warn(text("O Digimon precisa ter um Token na Cena.", "The Digimon needs a Token in the Scene."));
    return null;
  }

  const declaration = await chooseOverlayDeclaration(actor, item);
  if (!declaration) return null;

  const bit = Math.max(1, number(getActorDerivedStat(actor, "bit")));
  const origin = tokenCenter(token);
  const point = await pickCanvasPoint({
    title: text("Posicionar Sobreposição", "Place Overlay"),
    maximumDistance: bit,
    origin
  });
  if (!point) return null;

  if (!(await spendActorActions(actor, 2, { requireActiveUnit: Boolean(game?.combat?.started) }))) return null;

  const state = getState(actor);
  const tnIncrease = Math.max(0, number(state.illusionaryOverlay?.tnIncrease));
  const enemies = (game?.combat?.combatants?.contents ?? [])
    .filter((combatant) => combatant.actor && !areActorsAlliesForQualities(actor, combatant.actor)).length;
  const check = await rollDerivedCheck(actor, "bit", {
    skillKey: "manipulate",
    tn: 8 + enemies + tnIncrease,
    title: item.name
  });

  state.illusionaryOverlay = {
    ...(state.illusionaryOverlay ?? {}),
    tnIncrease: tnIncrease + (game?.combat?.started ? 3 : 0),
    lastCheckTotal: check?.total ?? 0
  };
  await updateState(actor, state);
  if (!check?.success) return { success: false, check };

  const oldTemplates = (canvas.scene?.templates?.contents ?? [])
    .filter((template) => template.getFlag?.(SYSTEM_ID, ILLUSION_FLAG)?.actorUuid === actor.uuid);
  for (const oldTemplate of oldTemplates) {
    await deleteIllusionaryOverlay(oldTemplate, "replaced");
  }

  const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
    t: declaration.mode === "barrier" ? "rect" : "circle",
    user: game.user.id,
    x: point.x,
    y: point.y,
    distance: bit,
    width: declaration.mode === "barrier" ? Math.max(1, Math.ceil(bit / 2)) : undefined,
    direction: 0,
    fillColor: "#7c4dff",
    borderColor: "#b39ddb",
    flags: { [SYSTEM_ID]: { [ILLUSION_FLAG]: {
      active: true,
      actorUuid: actor.uuid,
      actorName: actor.name,
      mode: declaration.mode,
      element: declaration.element,
      alliesKnow: declaration.alliesKnow,
      tn: check.total,
      originX: point.x,
      originY: point.y,
      maxDistance: bit,
      createdAt: new Date().toISOString()
    } } }
  }]);

  state.illusionaryOverlay = {
    ...(state.illusionaryOverlay ?? {}),
    active: true,
    templateId: template?.id ?? "",
    mode: declaration.mode,
    element: declaration.element,
    alliesKnow: declaration.alliesKnow
  };
  await updateState(actor, state);
  if (declaration.mode === "shroud") await refreshIllusionaryShroud(template);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-utility-quality-card"><h2>${escapeHtml(item.name)}</h2><ul class="dda-effect-list"><li>${text("Tipo", "Type")}: <strong>${declaration.mode === "shroud" ? text("Manto Ilusório", "Illusionary Shroud") : text("Barreiras Ilusórias", "Illusionary Barriers")}</strong>.</li>${declaration.element ? `<li>${text("Elemento", "Element")}: <strong>${escapeHtml(declaration.element)}</strong>.</li>` : ""}<li>${text("NA para desacreditar", "TN to disbelieve")}: <strong>${number(check.total)}</strong>.</li></ul></div>`
  });

  return { success: true, check, template, declaration };
}

function selectedChoiceKeys(item) {
  const choices = [
    ...(Array.isArray(item?.system?.choices?.selectedRanks) ? item.system.choices.selectedRanks : []),
    ...(Array.isArray(item?.system?.choices?.selected) ? item.system.choices.selected : [])
  ];
  return choices.map((choice) => normalizeKey(choice?.key ?? choice?.value ?? choice?.id ?? choice)).filter(Boolean);
}

function domainOptionKey(value = "") {
  const normalized = normalizeKey(value);
  return Object.keys(DOMAIN_OPTIONS).find((key) => normalizeKey(key) === normalized) ?? "";
}

const ELEMENT_ALIASES = {
  fire: ["fire", "fogo"],
  water: ["water", "agua"],
  earth: ["earth", "terra"],
  wind: ["wind", "vento"],
  ice: ["ice", "gelo"],
  thunder: ["thunder", "trovao", "lightning", "eletricidade"],
  wood: ["wood", "flora", "madeira", "planta"],
  steel: ["steel", "aco", "metal"],
  light: ["light", "luz"],
  darkness: ["darkness", "dark", "trevas", "escuridao"]
};

function canonicalElement(value = "") {
  const key = normalizeKey(value);
  return Object.entries(ELEMENT_ALIASES).find(([, aliases]) => aliases.map(normalizeKey).includes(key))?.[0] ?? key;
}

function actorNaturewalkElements(actor) {
  return [...new Set((actor?.system?.qualityFeatures?.naturewalk?.elements ?? []).map(canonicalElement).filter(Boolean))];
}

function actorSharesNaturewalkElement(actor, element = "") {
  const canonical = canonicalElement(element);
  return Boolean(canonical && actorNaturewalkElements(actor).includes(canonical));
}

function legalDomainOptions(actor, domainQuality) {
  const native = new Set(actorNaturewalkElements(actor));
  const adaptive = hasQuality(actor, "adaptiveElement");
  const altered = hasQuality(actor, "alteredElement");
  const persisted = domainOptionKey(getState(actor).domainControl?.selectedDomain ?? "");
  const selected = selectedChoiceKeys(domainQuality).map(domainOptionKey).find(Boolean) ?? persisted;
  if (altered && selected && DOMAIN_OPTIONS[selected]) return [selected];
  if (altered) return Object.keys(DOMAIN_OPTIONS);
  if (adaptive) {
    const adaptiveQuality = findQuality(actor, "adaptiveElement");
    const adaptiveElement = canonicalElement(selectedChoiceKeys(adaptiveQuality)[0] ?? "");
    if (adaptiveElement) {
      return Object.entries(DOMAIN_OPTIONS)
        .filter(([, option]) => canonicalElement(option.element) === adaptiveElement)
        .map(([key]) => key);
    }
  }
  if (selected && DOMAIN_OPTIONS[selected] && !adaptive) return [selected];
  return Object.entries(DOMAIN_OPTIONS).filter(([, option]) => native.has(canonicalElement(option.element))).map(([key]) => key);
}

function adaptiveDomainElement(actor) {
  if (!hasQuality(actor, "adaptiveElement")) return "";
  const adaptiveQuality = findQuality(actor, "adaptiveElement");
  return canonicalElement(selectedChoiceKeys(adaptiveQuality)[0] ?? "");
}

function domainKeysFromFlag(flag = {}) {
  const raw = Array.isArray(flag?.domainKeys) && flag.domainKeys.length
    ? flag.domainKeys
    : [flag?.domainKey];
  return [...new Set(raw.map(domainOptionKey).filter((key) => Boolean(DOMAIN_OPTIONS[key])))];
}

function superiorDomainSecondaryOptions(actor, primaryKey) {
  if (!hasBossQuality(actor, "superiorDomain")) return [];
  const primary = DOMAIN_OPTIONS[primaryKey];
  if (!primary) return [];

  const primaryElement = canonicalElement(primary.element);
  const elements = new Set(actorNaturewalkElements(actor));
  const adaptiveElement = adaptiveDomainElement(actor);
  if (adaptiveElement) elements.add(adaptiveElement);

  const paired = Object.entries(DOMAIN_OPTIONS)
    .filter(([key, option]) => key !== primaryKey && canonicalElement(option.element) === primaryElement)
    .map(([key]) => key);

  const alternateElements = [...elements].filter((element) => element && element !== primaryElement);
  const alternate = Object.entries(DOMAIN_OPTIONS)
    .filter(([, option]) => alternateElements.includes(canonicalElement(option.element)))
    .map(([key]) => key);

  return [...new Set([...paired, ...alternate])];
}

async function chooseSuperiorDomainSecondary(actor, primaryKey) {
  const legal = superiorDomainSecondaryOptions(actor, primaryKey);
  if (!legal.length) return "";
  if (legal.length === 1) return legal[0];

  const primary = DOMAIN_OPTIONS[primaryKey];
  return await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: text("Domínio Superior", "Superior Domain") },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog">
      <p>${text(
        `O primeiro Efeito é <strong>${escapeHtml(text(primary.labelPt, primary.labelEn))}</strong>. Escolha o segundo Efeito de Domínio.`,
        `The first Effect is <strong>${escapeHtml(text(primary.labelPt, primary.labelEn))}</strong>. Choose the second Domain Effect.`
      )}</p>
      <div class="form-group"><label>${text("Segundo Efeito", "Second Effect")}</label><select name="secondaryDomain">${legal.map((key) => {
        const option = DOMAIN_OPTIONS[key];
        return `<option value="${key}">${escapeHtml(text(option.labelPt, option.labelEn))} — ${escapeHtml(option.element)}</option>`;
      }).join("")}</select></div>
    </form>`,
    ok: {
      label: text("Aplicar ambos", "Apply Both"),
      callback: (_event, button) => String(button.form.elements.secondaryDomain?.value ?? "")
    },
    rejectClose: false,
    modal: true
  }) ?? "";
}

async function chooseDomain(actor, item) {
  const legal = legalDomainOptions(actor, item);
  if (!legal.length) {
    ui.notifications.warn(text("Nenhum Domínio legal foi encontrado para os Elementos de Passo Natural deste Digimon.", "No legal Domain was found for this Digimon's Naturewalk Elements."));
    return null;
  }
  const altered = hasQuality(actor, "alteredElement");
  const state = getState(actor);
  const nativeElements = actorNaturewalkElements(actor);
  const persistedElement = canonicalElement(state.domainControl?.effectiveElement ?? "");
  const elementControl = altered && nativeElements.length > 1
    ? `<div class="form-group"><label>${text("Elemento considerado", "Counted Element")}</label><select name="effectiveElement">${nativeElements.map((element) => `<option value="${element}" ${element === persistedElement ? "selected" : ""}>${escapeHtml(element)}</option>`).join("")}</select></div>`
    : "";
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: item.name },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><div class="form-group"><label>${text("Domínio", "Domain")}</label><select name="domain">${legal.map((key) => `<option value="${key}" ${key === domainOptionKey(state.domainControl?.selectedDomain ?? "") ? "selected" : ""}>${escapeHtml(text(DOMAIN_OPTIONS[key].labelPt, DOMAIN_OPTIONS[key].labelEn))} — ${escapeHtml(DOMAIN_OPTIONS[key].element)}</option>`).join("")}</select></div>${elementControl}<label class="dda-quality-check"><input type="checkbox" name="sourcePresent" checked><span>${text("Há uma fonte quantificável do Elemento", "A quantifiable source of the Element is present")}</span></label></form>`,
    ok: { label: text("Criar Domínio", "Create Domain"), callback: (_event, button) => ({
      key: String(button.form.elements.domain?.value ?? ""),
      sourcePresent: Boolean(button.form.elements.sourcePresent?.checked),
      effectiveElement: canonicalElement(
        button.form.elements.effectiveElement?.value ||
        persistedElement ||
        nativeElements[0] ||
        DOMAIN_OPTIONS[String(button.form.elements.domain?.value ?? "")]?.element ||
        ""
      )
    }) },
    rejectClose: false,
    modal: true
  });
  return result;
}

function tokensInsideCircle(templateDocument) {
  const grid = Math.max(1, number(canvas?.grid?.size, 100));
  const radius = Math.max(0, number(templateDocument?.distance));
  return (canvas?.tokens?.placeables ?? []).filter((token) => {
    const center = tokenCenter(token);
    return Math.hypot(center.x - number(templateDocument.x), center.y - number(templateDocument.y)) / grid <= radius;
  });
}

async function chosenDomainTargets(controller, template, option) {
  let tokens = tokensInsideCircle(template).filter((token) => token.actor);
  if (option.relation === "ally") tokens = tokens.filter((token) => areActorsAlliesForQualities(controller, token.actor));
  if (option.excludeSelf) tokens = tokens.filter((token) => token.actor.uuid !== controller.uuid);
  if (!tokens.length) return [];

  const targeted = new Set(Array.from(game.user?.targets ?? []).map((token) => token.id));
  const maximum = option.maxStage ? Math.max(1, number(getActorStageValue(controller))) : tokens.length;
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: text(option.labelPt, option.labelEn) },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><p>${text(`Escolha até ${maximum} alvo(s) dentro do Domínio.`, `Choose up to ${maximum} target(s) within the Domain.`)}</p>${tokens.map((token) => `<label class="dda-quality-check"><input type="checkbox" name="domainTargets" value="${token.id}" ${targeted.has(token.id) ? "checked" : ""}><span>${escapeHtml(token.name)}</span></label>`).join("")}</form>`,
    ok: {
      label: text("Confirmar Alvos", "Confirm Targets"),
      callback: (_event, button) => Array.from(button.form.querySelectorAll('input[name="domainTargets"]:checked'))
        .slice(0, maximum)
        .map((input) => String(input.value))
    },
    rejectClose: false,
    modal: true
  });

  if (!Array.isArray(result)) return [];
  const selected = new Set(result);
  return tokens.filter((token) => selected.has(token.id));
}

async function applySingleDomainPulse(controller, templateDocument, domainKey, { creation = false } = {}) {
  const flag = templateDocument?.getFlag?.(SYSTEM_ID, DOMAIN_FLAG);
  const option = DOMAIN_OPTIONS[domainKey];
  if (!controller || !option) return null;
  const tokens = tokensInsideCircle(templateDocument);
  const enemies = tokens.filter((token) => token.actor && !areActorsAlliesForQualities(controller, token.actor));
  const stage = Math.max(1, number(getActorStageValue(controller)));
  const potency = option.stat ? Math.max(0, number(getActorDerivedStat(controller, option.stat))) : 0;
  const domainElement = canonicalElement(flag?.element ?? option.element);
  const results = [];
  const harmfulTags = new Set(["burn", "freeze", "poison", "pull", "push", "root", "frail", "paralyze", "dot", "ruin", "doom", "fear"]);
  const ignoresHarmfulDomain = (token) => Boolean(
    token?.actor &&
    harmfulTags.has(option.tag) &&
    actorSharesNaturewalkElement(token.actor, domainElement)
  );

  if (option.mode === "hostileAura" || option.mode === "hostileEffect") {
    for (const token of enemies) {
      if (actorSharesNaturewalkElement(token.actor, domainElement)) continue;
      await addOrRefreshEffect(token.actor, { tag: option.tag, potency, duration: option.mode === "hostileAura" ? 1 : 1, sourceActor: controller, special: { domainKey: domainKey, domainAura: option.mode === "hostileAura" } });
      results.push(`${token.name}: [${option.tag.toUpperCase()} ${potency}]`);
    }
  }

  if (option.mode === "chosenEffect") {
    for (const token of await chosenDomainTargets(controller, templateDocument, option)) {
      if (token.actor.uuid === controller.uuid && option.tag === "push") continue;
      if (ignoresHarmfulDomain(token)) continue;
      await addOrRefreshEffect(token.actor, { tag: option.tag, potency, duration: 1, sourceActor: controller, special: { domainKey: domainKey } });
      results.push(`${token.name}: [${option.tag.toUpperCase()} ${potency}]`);
    }
  }

  if (option.mode === "d6Effect") {
    let chosen = await chosenDomainTargets(controller, templateDocument, option);
    if (option.maxStage) chosen = chosen.slice(0, stage);
    for (const token of chosen) {
      if (ignoresHarmfulDomain(token)) continue;
      const roll = await new Roll("1d6").evaluate();
      if (number(roll.total) >= 5) {
        await addOrRefreshEffect(token.actor, { tag: option.tag, potency, duration: 1, sourceActor: controller, special: { domainKey: domainKey, ignoresDotOncePerCombat: option.tag === "dot" } });
        results.push(`${token.name}: [${option.tag.toUpperCase()} ${potency || ""}]`);
      }
    }
  }

  if (option.mode === "d6Drain") {
    const chosen = (await chosenDomainTargets(controller, templateDocument, option)).slice(0, stage);
    let damageDealt = 0;
    for (const token of chosen) {
      if (actorSharesNaturewalkElement(token.actor, domainElement)) continue;
      const roll = await new Roll("1d6").evaluate();
      if (number(roll.total) >= 5) {
        const applied = await applyDamage(token.actor, 1, { unalterable: true, attacker: controller, damageSourceKind: "quality", damageLabel: text("Força Drenante", "Sapping Strength"), createChat: false });
        if (number(applied?.result?.healthDamage) > 0) damageDealt += 1;
        results.push(`${token.name}: 1 ${text("Dano Inalterável", "Unalterable Damage")}`);
      }
    }
    if (damageDealt > 0) await healActor(controller, damageDealt);
  }

  if (option.mode === "shield") {
    const amount = enemies.length;
    await addOrRefreshEffect(controller, { tag: "shield", potency: amount, duration: 1, sourceActor: controller, special: { domainKey: domainKey } });
    results.push(`${controller.name}: [SHIELD ${amount}]`);
  }

  if (option.mode === "cleanse") {
    const bit = Math.max(0, number(getActorDerivedStat(controller, "bit")));
    const roll = bit > 0 ? await new Roll(`${bit}d6`).evaluate() : null;
    const successes = (roll?.dice?.[0]?.results ?? []).filter((entry) => entry.active !== false && number(entry.result) >= 5).length;
    for (const token of await chosenDomainTargets(controller, templateDocument, option)) {
      const removed = await removeNegativeEffects(token.actor, successes);
      results.push(`${token.name}: [CLEANSE ${removed}]`);
    }
  }

  if (results.length || creation) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: controller }),
      content: `<div class="dda-chat-card dda-effect-card effect-special dda-domain-control-card"><h2>${escapeHtml(text(option.labelPt, option.labelEn))}</h2><p>${creation ? text("Domínio criado.", "Domain created.") : text("Pulso do Domínio no início do turno.", "Domain pulse at turn start.")}</p>${results.length ? `<ul class="dda-effect-list">${results.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>` : ""}</div>`
    });
  }
  return results;
}


async function applyDomainPulse(controller, templateDocument, { creation = false } = {}) {
  const flag = templateDocument?.getFlag?.(SYSTEM_ID, DOMAIN_FLAG);
  const keys = domainKeysFromFlag(flag);
  if (!controller || !keys.length) return null;
  const results = [];
  for (const key of keys) {
    const applied = await applySingleDomainPulse(controller, templateDocument, key, { creation });
    if (Array.isArray(applied)) results.push(...applied);
  }
  return results;
}

async function useDomainControl(actor, item) {
  const declaration = await chooseDomain(actor, item);
  if (!declaration?.key) return null;
  const option = DOMAIN_OPTIONS[declaration.key];
  const adaptiveQuality = findQuality(actor, "adaptiveElement");
  const adaptiveElement = hasQuality(actor, "adaptiveElement")
    ? canonicalElement(selectedChoiceKeys(adaptiveQuality)[0] ?? "")
    : "";
  const effectiveElement = canonicalElement(
    hasQuality(actor, "alteredElement")
      ? declaration.effectiveElement
      : adaptiveElement || option.element
  );
  const superiorSecondaryKey = await chooseSuperiorDomainSecondary(actor, declaration.key);
  const domainKeys = [...new Set([declaration.key, superiorSecondaryKey].filter(Boolean))];
  if (!declaration.sourcePresent) {
    if (!hasQuality(actor, "conjurer")) {
      ui.notifications.warn(text("Sem fonte do Elemento, Controle de Domínio exige Conjurador.", "Without an Element source, Domain Control requires Conjurer."));
      return null;
    }
  }
  if (!(await spendActorActions(actor, 2, { requireActiveUnit: Boolean(game?.combat?.started) }))) return null;
  if (!declaration.sourcePresent) {
    const check = await rollDerivedCheck(actor, "dos", { skillKey: "fortitude", tn: 10 + 2 * Math.max(1, number(getActorStageValue(actor))), title: item.name });
    if (!check?.success) return { success: false, check };
  }
  const token = tokenForActor(actor);
  if (!token) return null;
  const stage = Math.max(1, number(getActorStageValue(actor)));
  const center = tokenCenter(token);
  const existingIds = (canvas.scene?.templates?.contents ?? []).filter((template) => template.getFlag?.(SYSTEM_ID, DOMAIN_FLAG)?.actorUuid === actor.uuid).map((template) => template.id);
  if (existingIds.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", existingIds);
  const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
    t: "circle", user: game.user.id, x: center.x, y: center.y, distance: stage + 1, direction: 0,
    fillColor: "#00897b", borderColor: "#4db6ac",
    flags: { [SYSTEM_ID]: { [DOMAIN_FLAG]: { active: true, actorUuid: actor.uuid, actorName: actor.name, domainKey: declaration.key, domainKeys, element: effectiveElement, sourcePresent: declaration.sourcePresent, turnsRemaining: stage + 1, createdTurnKey: currentTurnKey(actor) } } }
  }]);
  const state = getState(actor);
  state.domainControl = { selectedDomain: declaration.key, selectedDomains: domainKeys, effectiveElement, templateId: template.id, sourcePresent: declaration.sourcePresent, turnsRemaining: stage + 1, active: true };
  await updateState(actor, state);
  await applyDomainPulse(actor, template, { creation: true });
  return { success: true, template, domain: declaration.key, domains: domainKeys };
}

function activeDomainForActor(actor) {
  return (canvas?.scene?.templates?.contents ?? []).find((template) => template.getFlag?.(SYSTEM_ID, DOMAIN_FLAG)?.actorUuid === actor?.uuid && template.getFlag?.(SYSTEM_ID, DOMAIN_FLAG)?.active) ?? null;
}

export function getDomainAttackModifier(attacker, defender) {
  if (!attacker || !defender) return null;

  const result = {
    accuracyBonus: 0,
    damageBonus: 0,
    targetDodgePenalty: 0,
    targetArmorPenalty: 0,
    exploitPotency: 0,
    qualities: []
  };

  const attackerDomain = activeDomainForActor(attacker);
  if (attackerDomain) {
    const flag = attackerDomain.getFlag(SYSTEM_ID, DOMAIN_FLAG);
    const targetToken = tokenForActor(defender);
    const targetInside = targetToken && tokensInsideCircle(attackerDomain).some((token) => token.id === targetToken.id);

    for (const key of domainKeysFromFlag(flag)) {
      const option = DOMAIN_OPTIONS[key];
      if (targetInside && option?.mode === "exploit" && !actorSharesNaturewalkElement(defender, canonicalElement(option.element))) {
        const potency = Math.max(0, number(getActorDerivedStat(attacker, "dos")));
        result.exploitPotency = Math.max(result.exploitPotency, potency);
        result.targetDodgePenalty += potency;
        result.targetArmorPenalty += potency;
        result.qualities.push({
          id: `domain-${key}`,
          name: text(option.labelPt, option.labelEn),
          parts: [text(`Alvo tratado como [EXPLOIT ${potency}]`, `Target treated as [EXPLOIT ${potency}]`)]
        });
      }
    }
  }

  const defenderDomain = activeDomainForActor(defender);
  if (defenderDomain) {
    const flag = defenderDomain.getFlag(SYSTEM_ID, DOMAIN_FLAG);
    const attackerToken = tokenForActor(attacker);
    const defenderToken = tokenForActor(defender);
    const inside = tokensInsideCircle(defenderDomain);
    const bothInside = attackerToken && defenderToken &&
      inside.some((token) => token.id === attackerToken.id) &&
      inside.some((token) => token.id === defenderToken.id);

    for (const key of domainKeysFromFlag(flag)) {
      const option = DOMAIN_OPTIONS[key];
      if (
        bothInside &&
        option?.mode === "pacify" &&
        !isMinion(attacker) &&
        !actorSharesNaturewalkElement(attacker, canonicalElement(option.element))
      ) {
        const potency = Math.max(0, number(getActorDerivedStat(defender, "dos")));
        result.accuracyBonus -= potency;
        result.damageBonus -= potency;
        result.qualities.push({
          id: `domain-${key}`,
          name: text(option.labelPt, option.labelEn),
          parts: [text(`Atacante tratado como [PACIFY ${potency}]`, `Attacker treated as [PACIFY ${potency}]`)]
        });
      }
    }
  }

  return (
    result.accuracyBonus ||
    result.damageBonus ||
    result.targetDodgePenalty ||
    result.targetArmorPenalty ||
    result.qualities.length
  ) ? result : null;
}

export function getDomainMovementContext(actor, point) {
  for (const template of (canvas?.scene?.templates?.contents ?? [])) {
    const flag = template.getFlag?.(SYSTEM_ID, DOMAIN_FLAG);
    if (!flag?.active) continue;
    const inside = Math.hypot(point.x - number(template.x), point.y - number(template.y)) / Math.max(1, number(canvas?.grid?.size, 100)) <= number(template.distance);
    if (!inside) continue;
    const controller = actorFromCanvasOrWorldUuid(flag.actorUuid);
    for (const key of domainKeysFromFlag(flag)) {
      const option = DOMAIN_OPTIONS[key];
      if (!option?.terrain) continue;
      const domainElement = canonicalElement(option.element);
      if (actorSharesNaturewalkElement(actor, domainElement)) continue;
      if (option.terrain === "enemy" && controller && areActorsAlliesForQualities(controller, actor)) continue;
      if (option.terrainExemption && actor.system?.qualityFeatures?.advancedMobility?.types?.includes?.(option.terrainExemption)) continue;
      return { difficult: true, source: text(option.labelPt, option.labelEn), element: domainElement };
    }
  }
  return null;
}

async function useOverdrive(actor, item) {
  const state = getState(actor);
  const combatId = getCombatId();
  if (state.overdrive?.lockedCombatId === combatId) {
    ui.notifications.warn(text("Overdrive está bloqueado até o fim deste Combate.", "Overdrive is locked until the end of this Combat."));
    return null;
  }
  if (state.overdrive?.usedTurnKey === currentTurnKey(actor)) {
    ui.notifications.warn(text("Overdrive já foi tentado nesta ativação.", "Overdrive was already attempted this turn."));
    return null;
  }
  const tnIncrease = Math.max(0, number(state.overdrive?.tnIncrease));
  const check = await rollDerivedCheck(actor, "cpu", { skillKey: "athletics", tn: 15 - number(getActorDerivedStat(actor, "ram")) + tnIncrease, title: item.name });
  state.overdrive = {
    ...(state.overdrive ?? {}),
    usedTurnKey: currentTurnKey(actor),
    tnIncrease: tnIncrease + 6,
    lockedCombatId: check?.criticalFailure ? combatId : state.overdrive?.lockedCombatId ?? "",
    pendingDodgePenalty: Boolean(check?.success && !check?.criticalSuccess),
    successTurnKey: check?.success ? currentTurnKey(actor) : ""
  };
  if (check?.success) {
    const actions = Math.max(0, number(actor.system?.combat?.actions?.value));
    await actor.update({ "system.combat.actions.value": actions + 1, [STATE_PATH]: state });
    await addOrRefreshEffect(actor, { tag: "haste", potency: 0, duration: 1, sourceActor: actor, special: { overdrive: true } });
  } else await updateState(actor, state);
  return check;
}

async function revealDataScan(actor, target, count, item) {
  const options = [
    ["wounds", text("Caixas de Ferimento atuais e máximas", "Current and maximum Wound Boxes")],
    ["main", text("Atributos Centrais", "Core Stats")],
    ["derived", text("Atributos Derivados", "Derived Stats")],
    ["misc", text("Movimento, Alcance e Limite Efetivo", "Movement, Range and Effective Limit")],
    ["core", text("Lista de Qualidades Core", "Core Quality list")],
    ["attack", text("Um Ataque e todas as Tags", "One Attack and all Tags")]
  ];
  const selected = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"],
    window: { title: item.name },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><p>${text(`Escolha ${count} revelação(ões).`, `Choose ${count} reveal(s).`)}</p>${options.map(([key, label]) => `<label class="dda-quality-check"><input type="checkbox" name="reveal" value="${key}"><span>${escapeHtml(label)}</span></label>`).join("")}</form>`,
    ok: { label: text("Revelar", "Reveal"), callback: (_event, button) => Array.from(button.form.querySelectorAll('input[name="reveal"]:checked')).slice(0, count).map((input) => input.value) },
    rejectClose: false,
    modal: true
  });
  if (!selected?.length) return null;
  const lines = [];
  const wounds = actorWounds(target);
  for (const key of selected) {
    if (key === "wounds") lines.push(`${text("Ferimentos", "Wounds")}: ${wounds.value}/${wounds.max}`);
    if (key === "main") lines.push(Object.entries(target.system?.mainStats ?? {}).map(([stat, data]) => `${stat.toUpperCase()}: ${number(data.total ?? data.value)}`).join(" · "));
    if (key === "derived") lines.push(Object.entries(target.system?.derivedStats ?? {}).map(([stat, data]) => `${stat.toUpperCase()}: ${number(data.total ?? data.value)}`).join(" · "));
    if (key === "misc") lines.push(`${text("Movimento", "Movement")}: ${number(target.system?.miscStats?.movement?.total ?? target.system?.miscStats?.movement?.value)} · ${text("Alcance", "Range")}: ${number(target.system?.miscStats?.range?.total ?? target.system?.miscStats?.range?.value)} · ${text("Limite Efetivo", "Effective Limit")}: ${number(target.system?.miscStats?.effectiveLimit?.total ?? target.system?.miscStats?.effectiveLimit?.value)}`);
    if (key === "core") lines.push((target.items ?? []).filter((entry) => entry.type === "quality" && entry.system?.category?.core).map((entry) => entry.name).join(", ") || text("Nenhuma", "None"));
    if (key === "attack") {
      const attacks = (target.items ?? []).filter((entry) => entry.type === "attack");
      const choice = attacks[0];
      if (choice) lines.push(`${choice.name}: ${JSON.stringify(choice.system?.baseTags ?? {})} ${(choice.system?.qualityTags ?? []).map((tag) => `[${tag}]`).join(" ")}`);
    }
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: [game.user.id, ...game.users.filter((user) => user.isGM).map((user) => user.id)],
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-data-scan-card"><h2>${escapeHtml(item.name)} — ${escapeHtml(target.name)}</h2><ul class="dda-effect-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>`
  });
  return lines;
}

async function useDataScan(actor, item) {
  const targetToken = game.user.targets.first();
  if (!targetToken?.actor) {
    ui.notifications.warn(text("Selecione um inimigo visível.", "Select a visible enemy."));
    return null;
  }
  const state = getState(actor);
  if (state.dataScan?.lockedCombatId === getCombatId()) return null;
  if (!(await spendActorActions(actor, 1, { requireActiveUnit: Boolean(game?.combat?.started) }))) return null;
  const check = await rollDerivedCheck(actor, "bit", { skillKey: "knowledge", tn: 10 + number(getActorDerivedStat(targetToken.actor, "dos")), title: item.name, targetActor: targetToken.actor });
  state.dataScan = { ...(state.dataScan ?? {}), lockedCombatId: check?.criticalFailure ? getCombatId() : state.dataScan?.lockedCombatId ?? "" };
  await updateState(actor, state);
  if (!check?.success) return check;
  await revealDataScan(actor, targetToken.actor, check.criticalSuccess ? 2 : 1, item);
  return check;
}

function qualifyingWardTags(result = {}) {
  return new Set((result.activeEffectTags ?? []).map((tag) => normalizeKey(tag)));
}

async function chooseAttackResultTarget(results, title) {
  const candidates = results.filter((entry) => entry?.defender && entry?.hit);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].defender;
  const selected = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"], window: { title },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><div class="form-group"><select name="uuid">${candidates.map((entry) => `<option value="${entry.defender.uuid}">${escapeHtml(entry.defender.name)}</option>`).join("")}</select></div></form>`,
    ok: { label: text("Escolher", "Choose"), callback: (_event, button) => String(button.form.elements.uuid?.value ?? "") }, rejectClose: false, modal: true
  });
  return candidates.find((entry) => entry.defender.uuid === selected)?.defender ?? null;
}

export async function resolveWardEmblemAfterAttack({ attacker, results = [] } = {}) {
  if (!attacker || !results.length) return null;
  const hasHoly = hasQuality(attacker, "holyWard");
  const hasDark = hasQuality(attacker, "darkEmblem");
  if (!hasHoly && !hasDark) return null;
  const positive = new Set(["haste", "immune", "shield", "regen", "tailwind", "bastion", "sharpen", "sturdy", "nimble"]);
  const negative = new Set(["fear", "doom", "stun", "blind", "dot", "burn", "freeze", "poison", "ruin", "root", "frail", "paralyze", "pacify", "dull", "distract", "heavy", "confuse"]);
  const holyEligible = hasHoly && results.some((result) => [...qualifyingWardTags(result)].some((tag) => positive.has(tag)) && result.hit);
  const darkEligible = hasDark && results.some((result) => [...qualifyingWardTags(result)].some((tag) => negative.has(tag)) && result.hit);
  if (!holyEligible && !darkEligible) return null;
  const state = getState(attacker);
  const roundKey = `${getCombatId()}:${getCombatRound()}`;
  if (state.wardEmblem?.usedRoundKey === roundKey) return null;
  const lastKind = state.wardEmblem?.lastKind ?? "";
  const lastTurnKey = state.wardEmblem?.lastTurnKey ?? "";
  const current = currentTurnKey(attacker);
  let choices = [];
  if (holyEligible && !(lastKind === "holy" && lastTurnKey && lastTurnKey !== current)) choices.push(["holy", text("Proteção Sagrada", "Holy Ward")]);
  if (darkEligible && !(lastKind === "dark" && lastTurnKey && lastTurnKey !== current)) choices.push(["dark", text("Emblema Sombrio", "Dark Emblem")]);
  if (!choices.length) return null;
  const kind = choices.length === 1 ? choices[0][0] : await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-utility-quality-window"], window: { title: text("Equilíbrio Caótico", "Chaotic Balance") },
    content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><div class="form-group"><select name="kind">${choices.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join("")}</select></div></form>`,
    ok: { label: text("Ativar", "Activate"), callback: (_event, button) => String(button.form.elements.kind?.value ?? "") }, rejectClose: false, modal: true
  });
  if (!kind) return null;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-utility-quality-window"], window: { title: kind === "holy" ? text("Proteção Sagrada", "Holy Ward") : text("Emblema Sombrio", "Dark Emblem") },
    content: `<p>${text("Ativar esta Qualidade neste Ataque?", "Activate this Quality for this Attack?")}</p>`, yes: { label: text("Ativar", "Activate") }, no: { label: text("Não", "No") }, rejectClose: false, modal: true
  });
  if (!confirmed) return null;
  const target = await chooseAttackResultTarget(results, kind === "holy" ? text("Alvo da Cura", "Healing Target") : text("Alvo do Dano", "Damage Target"));
  if (!target) return null;
  const alternatingBonus = hasQuality(attacker, "chaoticBalance") && lastKind && lastKind !== kind ? 1 : 0;
  const amount = 2 + alternatingBonus;
  if (kind === "holy") await healActor(target, amount);
  else await applyDamage(target, amount, { unalterable: true, attacker, damageSourceKind: "quality", damageLabel: text("Emblema Sombrio", "Dark Emblem") });
  state.wardEmblem = { usedRoundKey: roundKey, lastKind: kind, lastTurnKey: current, amount, targetUuid: target.uuid };
  await updateState(attacker, state);
  return { kind, target, amount };
}

async function payTransporterActionDebt(actor, state) {
  const debt = Math.max(0, number(state.transporter?.actionDebt));
  if (!state.transporter?.appliesAtNextTurn || debt <= 0) return false;

  const current = Math.max(0, number(actor.system?.combat?.actions?.value));
  let remaining = debt;
  if (current > 0) {
    const paid = Math.min(current, remaining);
    await actor.update({ "system.combat.actions.value": current - paid });
    remaining -= paid;
  }

  if (remaining > 0) {
    const candidates = (game?.combat?.combatants?.contents ?? [])
      .map((combatant) => combatant.actor)
      .filter((candidate) => candidate && candidate.uuid !== actor.uuid)
      .filter((candidate) => areActorsAlliesForQualities(actor, candidate))
      .filter((candidate) => number(candidate.system?.combat?.actions?.value) >= remaining);

    let payer = null;
    if (candidates.length) {
      const selected = await foundry.applications.api.DialogV2.prompt({
        classes: ["dda", "dda-utility-quality-window"],
        window: { title: text("Custo do Transportador", "Transporter Cost") },
        content: `<form class="dda-roll-dialog dda-utility-quality-dialog"><p>${text(
          `${escapeHtml(actor.name)} não possui Ações suficientes. Outro participante pode pagar ${remaining} Ação(ões).`,
          `${escapeHtml(actor.name)} does not have enough Actions. Another participant may pay ${remaining} Action(s).`
        )}</p><div class="form-group"><select name="payer"><option value="">${text("Ninguém paga", "Nobody pays")}</option>${candidates.map((candidate) => `<option value="${candidate.uuid}">${escapeHtml(candidate.name)}</option>`).join("")}</select></div></form>`,
        ok: { label: text("Confirmar", "Confirm"), callback: (_event, button) => String(button.form.elements.payer?.value ?? "") },
        rejectClose: false,
        modal: true
      });
      payer = candidates.find((candidate) => candidate.uuid === selected) ?? null;
    }

    if (payer) {
      const payerActions = Math.max(0, number(payer.system?.combat?.actions?.value));
      await payer.update({ "system.combat.actions.value": payerActions - remaining });
      remaining = 0;
    } else {
      ui.notifications.warn(text(
        `O custo de Transportador de ${actor.name} não pôde ser pago.`,
        `${actor.name}'s Transporter cost could not be paid.`
      ));
    }
  }

  state.transporter = {
    ...(state.transporter ?? {}),
    actionDebt: remaining,
    appliesAtNextTurn: remaining > 0,
    paidAtTurnKey: remaining <= 0 ? currentTurnKey(actor) : ""
  };
  await updateState(actor, state);
  return remaining <= 0;
}

async function applyTurnStartUtility(combat) {
  if (!isPrimaryActiveGM()) return;
  const actor = combat?.combatant?.actor;
  if (!actor) return;
  const state = getState(actor);
  if (state.transporter?.appliesAtNextTurn && state.transporter?.actionDebt > 0) {
    await payTransporterActionDebt(actor, state);
  }
  const domain = activeDomainForActor(actor);
  if (domain) {
    const flag = foundry.utils.deepClone(domain.getFlag(SYSTEM_ID, DOMAIN_FLAG));

    if (!flag.sourcePresent) {
      const maintenance = await rollDerivedCheck(actor, "dos", {
        skillKey: "fortitude",
        tn: 10 + 2 * Math.max(1, number(getActorStageValue(actor))),
        title: text("Manter Controle de Domínio", "Maintain Domain Control")
      });

      if (!maintenance?.success) {
        await domain.delete();
        state.domainControl = {
          ...(state.domainControl ?? {}),
          active: false,
          templateId: "",
          turnsRemaining: 0,
          endedReason: "maintenance-failed"
        };
        await updateState(actor, state);
        return;
      }
    }

    if (number(flag.turnsRemaining) <= 0) {
      await domain.delete();
      state.domainControl = { ...(state.domainControl ?? {}), active: false, templateId: "", turnsRemaining: 0 };
      await updateState(actor, state);
      return;
    }

    /*
     * Creation already produces the first pulse. Each remaining duration
     * step still produces its own start-of-turn pulse; the Domain expires
     * only after that pulse resolves.
     */
    await applyDomainPulse(actor, domain);
    flag.turnsRemaining = Math.max(0, number(flag.turnsRemaining) - 1);

    if (flag.turnsRemaining <= 0) {
      await domain.delete();
      state.domainControl = { ...(state.domainControl ?? {}), active: false, templateId: "", turnsRemaining: 0 };
      await updateState(actor, state);
      return;
    }

    await domain.setFlag(SYSTEM_ID, DOMAIN_FLAG, flag);
    state.domainControl = { ...(state.domainControl ?? {}), turnsRemaining: flag.turnsRemaining };
    await updateState(actor, state);
  }
}

export async function handleUtilityEndTurn(actor) {
  const state = getState(actor);
  if (state.overdrive?.pendingDodgePenalty && state.overdrive?.successTurnKey === currentTurnKey(actor)) {
    await addOrRefreshEffect(actor, { tag: "overdriveFatigue", potency: 3, duration: 1, sourceActor: actor, special: { poolStats: ["dodge"], poolModifier: -3, effectType: "negative" } });
    state.overdrive.pendingDodgePenalty = false;
    await updateState(actor, state);
  }
}

export async function useUtilityQualityAction(actor, item) {
  const key = qualityKey(item);
  if (["teleporte", "teleport", "transportador", "transporter"].includes(key)) {
    await performTeleport(actor, { actionCost: 1 });
    return { handled: true, key };
  }
  if (["glamour", "glamor"].includes(key)) {
    await useGlamor(actor, item);
    return { handled: true, key };
  }
  if (["sobreposicaoilusoria", "illusionaryoverlay"].includes(key)) {
    await useIllusionaryOverlay(actor, item);
    return { handled: true, key };
  }
  if (["controle dedominio", "controlededominio", "domaincontrol"].map(normalizeKey).includes(key)) {
    await useDomainControl(actor, item);
    return { handled: true, key };
  }
  if (key === "overdrive") {
    await useOverdrive(actor, item);
    return { handled: true, key };
  }
  if (["varreduradedados", "datascan"].includes(key)) {
    await useDataScan(actor, item);
    return { handled: true, key };
  }
  const passive = new Set([
    "impulsodesistema", "systemboost", "conscienciadecombate", "combatawareness", "tecnico", "technician", "firewall", "trojan",
    "elementoadaptavel", "adaptiveelement", "elementoalterado", "alteredelement", "protecao sagrada", "protecaosagrada", "holyward",
    "emblemasombrio", "darkemblem", "equilibriocaotico", "chaoticbalance"
  ].map(normalizeKey));
  if (!passive.has(key)) return null;
  ui.notifications.info(text(`${item.name} é aplicado automaticamente quando sua condição ocorre.`, `${item.name} is applied automatically when its condition occurs.`));
  return { handled: true, key };
}

export function registerUtilityQualities() {
  Hooks.on("updateCombat", (combat, changed) => {
    if (changed.turn === undefined && changed.round === undefined) return;
    void applyTurnStartUtility(combat);
  });

  Hooks.on("updateToken", (tokenDocument, changed) => {
    if (!isPrimaryActiveGM()) return;
    if (changed.x === undefined && changed.y === undefined) return;

    const actor = tokenDocument.actor;
    const domain = activeDomainForActor(actor);
    if (domain) {
      const center = tokenCenter(tokenDocument.object ?? tokenDocument);
      void domain.update({ x: center.x, y: center.y });
    }

    const overlays = (canvas?.scene?.templates?.contents ?? [])
      .filter((template) => template.getFlag?.(SYSTEM_ID, ILLUSION_FLAG)?.active);

    for (const overlay of overlays) {
      const flag = overlay.getFlag(SYSTEM_ID, ILLUSION_FLAG);
      if (flag.actorUuid === actor?.uuid) {
        const center = tokenCenter(tokenDocument.object ?? tokenDocument);
        const grid = Math.max(1, number(canvas?.grid?.size, 100));
        const distance = Math.hypot(
          center.x - number(flag.originX),
          center.y - number(flag.originY)
        ) / grid;
        if (distance > number(flag.maxDistance)) {
          void deleteIllusionaryOverlay(overlay, "creator-out-of-range");
          continue;
        }
      }
      if (flag.mode === "shroud") void refreshIllusionaryShroud(overlay);
    }
  });

  Hooks.on("createMeasuredTemplate", (templateDocument) => {
    const flag = templateDocument.getFlag?.(SYSTEM_ID, ILLUSION_FLAG);
    if (flag?.active && flag.mode === "shroud" && isPrimaryActiveGM()) {
      void refreshIllusionaryShroud(templateDocument);
    }
  });

  Hooks.on("deleteMeasuredTemplate", (templateDocument) => {
    const flag = templateDocument.getFlag?.(SYSTEM_ID, ILLUSION_FLAG);
    if (flag && isPrimaryActiveGM()) {
      void clearIllusionaryOverlayEffects(String(templateDocument.id ?? ""));
      const creator = actorFromCanvasOrWorldUuid(flag.actorUuid);
      if (creator) {
        const state = getState(creator);
        state.illusionaryOverlay = {
          ...(state.illusionaryOverlay ?? {}),
          active: false,
          templateId: "",
          endedReason: "template-deleted"
        };
        void updateState(creator, state);
      }
    }
  });

  Hooks.on("updateActor", (actor) => {
    if (!isPrimaryActiveGM()) return;
    const wounds = actorWounds(actor);
    if (wounds.value <= 0 && getState(actor).glamorCreated?.active) {
      void clearGlamorCreated(actor);
    }
  });

  Hooks.on("deleteItem", (item) => {
    if (!isPrimaryActiveGM()) return;
    const actor = item.parent;
    if (!actor || !["glamour", "glamor"].includes(qualityKey(item))) return;
    void clearGlamorCreated(actor);
  });

  Hooks.on("combatEnd", () => {
    if (!isPrimaryActiveGM()) return;
    const ids = (canvas?.scene?.templates?.contents ?? [])
      .filter((template) => template.getFlag?.(SYSTEM_ID, DOMAIN_FLAG)?.active)
      .map((template) => template.id);
    if (ids.length) void canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", ids);
  });

  game.dda ??= {};
  game.dda.utilityQualities = {
    useQuality: useUtilityQualityAction,
    requestTeleportEscape,
    useTeleportClashEscape,
    resolveWardEmblemAfterAttack,
    getDomainAttackModifier,
    getDomainMovementContext,
    breakGlamorOnAttackHit,
    clearGlamorCreated,
    refreshIllusionaryShroud,
    performTeleport
  };
}
