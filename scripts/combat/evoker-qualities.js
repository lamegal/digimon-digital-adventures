import { withDDAMovementContext } from "../canvas/movement-context.js";
import { spendActorActions } from "./action-economy.js";
import { areActorsAllies, areActorsAlliesForQualities } from "../rules/quality-automation.js";
import {
  getTokenGridDistance,
  measureGridPointDistanceSpaces
} from "./positioning.js";
import { hasBossQuality } from "./boss-qualities.js";

const SYSTEM_ID = "digimon-digital-adventures";
const CREATION_FLAG = `flags.${SYSTEM_ID}.evokerCreation`;
const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
const SOCKET_SCOPE = "evokerQualities";
const pendingSocketRequests = new Map();

function english() {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
}

function text(pt, en) {
  return english() ? en : pt;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function identity(value = "") {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function primaryActiveGm() {
  return (game.users?.contents ?? []).filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function userControlsActor(user, actor) {
  return Boolean(user && actor && (user.isGM || actor.testUserPermission?.(
    user,
    CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
  )));
}

async function requestEvokerGmOperation(operation, payload = {}) {
  const gm = primaryActiveGm();
  if (!gm) {
    ui.notifications.warn(text("É necessário um GM ativo para criar ou remover evocações.", "An active GM is required to create or remove evocations."));
    return null;
  }
  const requestId = foundry.utils.randomID();
  return new Promise((resolve) => {
    const timeout = globalThis.setTimeout(() => {
      pendingSocketRequests.delete(requestId);
      resolve(null);
    }, 15000);
    pendingSocketRequests.set(requestId, { resolve, timeout });
    game.socket.emit(SOCKET_CHANNEL, {
      scope: SOCKET_SCOPE,
      type: "request",
      operation,
      requestId,
      requestingUserId: game.user.id,
      targetGmId: gm.id,
      payload
    });
  });
}

function findQuality(actor, ids) {
  const wanted = new Set(ids.map(identity));
  return actor?.items?.find?.((item) => item.type === "quality" && [
    item.system?.sourceId, item.system?.originalName, item.name
  ].some((value) => wanted.has(identity(value)))) ?? null;
}

function getRank(item) {
  return Math.max(0, number(item?.system?.rank?.value));
}

function getMastery(actor) {
  return {
    value: Math.max(0, number(actor?.system?.resources?.mastery?.value)),
    max: Math.max(0, number(actor?.system?.resources?.mastery?.max))
  };
}

async function spendMastery(actor, amount) {
  const resource = getMastery(actor);
  if (amount < 0 || resource.value < amount) return false;
  await actor.update({ "system.resources.mastery.value": resource.value - amount });
  return true;
}

async function refundMastery(actor, amount) {
  if (!actor || amount <= 0) return;
  const resource = getMastery(actor);
  await actor.update({
    "system.resources.mastery.value": Math.min(resource.max, resource.value + amount)
  });
}

function sourceToken(actor) {
  return canvas?.tokens?.controlled?.find((token) => token.actor?.uuid === actor?.uuid)
    ?? canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === actor?.uuid)
    ?? null;
}

function gridDistance(a, point) {
  const size = Math.max(1, number(canvas?.grid?.size, 100));
  const ax = number(a?.document?.x ?? a?.x) + (number(a?.document?.width ?? 1) * size / 2);
  const ay = number(a?.document?.y ?? a?.y) + (number(a?.document?.height ?? 1) * size / 2);
  return Math.max(Math.abs(point.x - ax), Math.abs(point.y - ay)) / size;
}

function occupiedAt(point, width = 1, height = 1, { ignoredActorIds = new Set() } = {}) {
  const size = Math.max(1, number(canvas?.grid?.size, 100));
  const left = point.x;
  const top = point.y;
  const right = left + width * size;
  const bottom = top + height * size;
  return (canvas?.tokens?.placeables ?? []).some((token) => {
    const actorId = String(token.actor?.id ?? token.document?.actorId ?? "");
    if (ignoredActorIds.has(actorId)) return false;
    const x = number(token.document?.x);
    const y = number(token.document?.y);
    const r = x + Math.max(1, number(token.document?.width, 1)) * size;
    const b = y + Math.max(1, number(token.document?.height, 1)) * size;
    return left < r && right > x && top < b && bottom > y;
  });
}

async function pickCanvasPoint(actor, { width = 1, height = 1, ignoredActorIds = new Set() } = {}) {
  const token = sourceToken(actor);
  if (!canvas?.ready || !canvas?.stage || !token) {
    ui.notifications.warn(text("O Digimon precisa ter um Token na cena ativa.", "The Digimon needs a Token on the active Scene."));
    return null;
  }
  ui.notifications.info(text("Clique em um espaço desocupado dentro do Alcance; Esc cancela.", "Click an unoccupied space within Range; Esc cancels."));
  return new Promise((resolve) => {
    const finish = (value) => {
      canvas.stage.off("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === "Escape") finish(null);
    };
    const onPointer = (event) => {
      const position = event.getLocalPosition(canvas.stage);
      const snapped = canvas.grid.getSnappedPoint(
        { x: position.x, y: position.y },
        { mode: CONST.GRID_SNAPPING_MODES?.TOP_LEFT_VERTEX ?? CONST.GRID_SNAPPING_MODES?.CENTER }
      );
      const range = Math.max(0, number(actor.system?.miscStats?.range?.total ?? actor.system?.miscStats?.range?.value));
      if (gridDistance(token, snapped) > range) {
        ui.notifications.warn(text("O espaço está fora do Alcance.", "That space is outside Range."));
        return;
      }
      if (occupiedAt(snapped, width, height, { ignoredActorIds })) {
        ui.notifications.warn(text("O espaço precisa estar desocupado.", "The space must be unoccupied."));
        return;
      }
      finish(snapped);
    };
    window.addEventListener("keydown", onKey);
    canvas.stage.on("pointerdown", onPointer);
  });
}

async function chooseCreation(title, content, callback) {
  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-evoker-dialog"],
    position: { width: 600, height: "auto" },
    window: { title }, modal: true, content,
    buttons: [
      { action: "confirm", label: text("Confirmar", "Confirm"), icon: "fa-solid fa-check", default: true, callback },
      { action: "cancel", label: text("Cancelar", "Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

function selectedChoiceKeys(quality) {
  const ranked = Array.isArray(quality?.system?.choices?.selectedRanks)
    ? quality.system.choices.selectedRanks
    : [];
  const selected = Array.isArray(quality?.system?.choices?.selected)
    ? quality.system.choices.selected
    : (quality?.system?.choices?.selected ? [quality.system.choices.selected] : []);
  return new Set([...ranked, ...selected]
    .flatMap((choice) => typeof choice === "string"
      ? [choice]
      : [choice?.key, choice?.originalLabel, choice?.label])
    .map(identity)
    .filter(Boolean));
}

function qualityIdentityKeys(quality) {
  return new Set([
    quality?.system?.sourceId,
    quality?.system?.originalName,
    quality?.name
  ].map(identity).filter(Boolean));
}

function qualityHasAnyIdentity(quality, aliases = []) {
  const keys = qualityIdentityKeys(quality);
  return aliases.some((alias) => keys.has(identity(alias)));
}

function sourceHasSelectedQualityChoice(source, qualityAliases = [], choiceAliases = []) {
  const wantedChoices = new Set(choiceAliases.map(identity));
  return Boolean(source?.items?.some?.((quality) => (
    quality?.type === "quality" &&
    qualityHasAnyIdentity(quality, qualityAliases) &&
    [...selectedChoiceKeys(quality)].some((choice) => wantedChoices.has(choice))
  )));
}

function naturewalkElements(actor) {
  const keys = actor.system?.qualityFeatures?.naturewalk?.elements ?? [];
  const labels = actor.system?.qualityFeatures?.naturewalk?.elementLabels ?? [];
  return keys.map((key, index) => ({ key: String(key), label: String(labels[index] ?? key) }));
}

export async function configureEvokerQualityAppearance(actor, quality) {
  const id = identity(quality?.system?.sourceId ?? quality?.name);
  const conjurer = ["conjurador", "conjurer"].includes(id);
  const summoner = ["invocador", "summoner"].includes(id);
  if (!conjurer && !summoner) return true;
  const result = await chooseCreation(
    conjurer ? text("Aparência das Estruturas", "Structure Appearance") : text("Aparência dos Lacaios", "Minion Appearance"),
    `<form class="dda-evoker-grid">
      ${summoner ? `<label>${text("Método de Invocação", "Summoning Method")}<input type="text" name="method" required placeholder="${text("Como os Lacaios são invocados", "How the Minions are summoned")}"></label>` : ""}
      <label>${text("Aparência definida", "Defined Appearance")}<input type="text" name="appearance" required placeholder="${conjurer ? text("Ex.: construções de mármore", "E.g. marble constructions") : text("Ex.: familiares de dados azuis", "E.g. blue data familiars")}"></label>
    </form>`,
    (_event, button) => ({
      method: String(button.form?.elements?.method?.value ?? "").trim(),
      appearance: String(button.form?.elements?.appearance?.value ?? "").trim()
    })
  );
  if (!result?.appearance || (summoner && !result.method)) return false;
  await quality.update({
    "system.creation.appearance": result.appearance,
    "system.creation.summoningMethod": result.method
  });
  actor.sheet?.render(false);
  return true;
}

function cooldownSignature() {
  return game.combat?.started ? `${game.combat.id}:${number(game.combat.round)}` : `scene:${canvas?.scene?.id ?? ""}`;
}

function turnSignature() {
  return game.combat?.started
    ? `${game.combat.id}:${number(game.combat.round)}:${number(game.combat.turn, -1)}`
    : cooldownSignature();
}

function usedOnCooldown(actor, key) {
  return String(actor.system?.combat?.evokerCooldowns?.[key] ?? "") === cooldownSignature();
}

async function markCooldown(actor, key) {
  await actor.update({ [`system.combat.evokerCooldowns.${key}`]: cooldownSignature() });
}

function creationActorsForSource(actor, kind = "") {
  return (game.actors?.contents ?? []).filter((created) => {
    const flag = created.flags?.[SYSTEM_ID]?.evokerCreation;
    return flag?.sourceActorUuid === actor.uuid && (!kind || flag.kind === kind);
  });
}

function creationFoundationIds(created) {
  const flag = created?.flags?.[SYSTEM_ID]?.evokerCreation ?? {};
  return new Set([
    ...(Array.isArray(flag.foundationActorIds) ? flag.foundationActorIds : []),
    ...(Array.isArray(flag.foundationActorUuids) ? flag.foundationActorUuids : [])
  ].map((value) => String(value ?? "").trim()).filter(Boolean));
}

function dependentStructures(created) {
  const identifiers = new Set([String(created?.id ?? ""), String(created?.uuid ?? "")].filter(Boolean));
  if (!identifiers.size) return [];
  return (game.actors?.contents ?? []).filter((candidate) => {
    const flag = candidate?.flags?.[SYSTEM_ID]?.evokerCreation;
    if (flag?.kind !== "structure" || candidate.id === created.id || flag.deleting) return false;
    return [...creationFoundationIds(candidate)].some((id) => identifiers.has(id));
  });
}

async function deleteCreationLocal(created, { refund = false, cascade = true } = {}) {
  const flag = created?.flags?.[SYSTEM_ID]?.evokerCreation;
  if (!flag || flag.deleting) return;
  await created.update({ [`${CREATION_FLAG}.deleting`]: true });
  const collapsed = cascade && flag.kind === "structure"
    ? dependentStructures(created)
    : [];
  for (const dependent of collapsed) {
    /* A dependent Structure collapses because its foundation was destroyed;
     * it did not itself reach 0 Wound Boxes, so its Mastery is not refunded. */
    await deleteCreationLocal(dependent, { refund: false, cascade: true });
  }
  if (refund) {
    const source = await fromUuid(flag.sourceActorUuid).catch(() => null);
    await refundMastery(source, Math.max(0, number(flag.masteryCost)));
  }
  for (const scene of game.scenes?.contents ?? []) {
    const ids = scene.tokens.filter((token) => token.actorId === created.id).map((token) => token.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
  }
  await created.delete();
  if (collapsed.length) {
    await ChatMessage.create({
      content: `<div class="dda-chat-card"><h2>${text("Colapso de Estrutura", "Structure Collapse")}</h2><p>${collapsed.map((entry) => `<strong>${escapeHtml(entry.name)}</strong>`).join(", ")} ${text("desabou porque sua fundação foi destruída.", "collapsed because its foundation was destroyed.")}</p></div>`
    });
  }
}

async function deleteCreation(created, { refund = false, cascade = true } = {}) {
  if (!created) return false;
  if (game.user.isGM) {
    await deleteCreationLocal(created, { refund, cascade });
    return true;
  }
  const result = await requestEvokerGmOperation("delete", {
    creationUuid: created.uuid,
    refund: Boolean(refund),
    cascade: Boolean(cascade)
  });
  return Boolean(result?.ok);
}

async function clearCreations(actor, kind, keepIds = new Set(), { refund = false } = {}) {
  for (const created of creationActorsForSource(actor, kind)) {
    if (!keepIds.has(created.id)) await deleteCreation(created, { refund, cascade: false });
  }
}

function expandStructureKeepSet(structures, keepIds) {
  const expanded = new Set([...keepIds].map(String));
  let changed = true;
  while (changed) {
    changed = false;
    for (const structure of structures) {
      if (!expanded.has(String(structure.id))) continue;
      for (const foundationId of creationFoundationIds(structure)) {
        const foundation = structures.find((candidate) => (
          String(candidate.id) === foundationId || String(candidate.uuid) === foundationId
        ));
        if (foundation && !expanded.has(String(foundation.id))) {
          expanded.add(String(foundation.id));
          changed = true;
        }
      }
    }
  }
  return expanded;
}

function structureTokenRectangles(structure) {
  const size = Math.max(1, number(canvas?.grid?.size, 100));
  return (canvas?.tokens?.placeables ?? [])
    .filter((token) => String(token.actor?.id ?? token.document?.actorId ?? "") === String(structure?.id ?? ""))
    .map((token) => ({
      left: number(token.document?.x),
      top: number(token.document?.y),
      right: number(token.document?.x) + Math.max(1, number(token.document?.width, 1)) * size,
      bottom: number(token.document?.y) + Math.max(1, number(token.document?.height, 1)) * size
    }));
}

function pointIsSupportedByStructure(point, width, height, structure) {
  const size = Math.max(1, number(canvas?.grid?.size, 100));
  const rectangle = {
    left: number(point?.x),
    top: number(point?.y),
    right: number(point?.x) + Math.max(1, number(width, 1)) * size,
    bottom: number(point?.y) + Math.max(1, number(height, 1)) * size
  };
  return structureTokenRectangles(structure).some((foundation) => (
    rectangle.left < foundation.right && rectangle.right > foundation.left &&
    rectangle.top < foundation.bottom && rectangle.bottom > foundation.top
  ));
}

function restrictClonedQualityChoices(data, allowedAliases = []) {
  const allowed = new Set(allowedAliases.map(identity));
  const keep = (choice) => allowed.has(identity(
    choice?.key ?? choice?.value ?? choice?.id ?? choice?.originalLabel ?? choice?.label ?? choice
  ));
  const choices = data?.system?.choices ?? {};

  if (Array.isArray(choices.selectedRanks)) {
    choices.selectedRanks = choices.selectedRanks.filter(keep);
  }
  if (Array.isArray(choices.selected)) {
    choices.selected = choices.selected.filter(keep);
  } else if (choices.selected && !keep(choices.selected)) {
    choices.selected = [];
  }

  const remaining = [
    ...(Array.isArray(choices.selectedRanks) ? choices.selectedRanks : []),
    ...(Array.isArray(choices.selected) ? choices.selected : []),
    ...(!Array.isArray(choices.selected) && choices.selected ? [choices.selected] : [])
  ];
  if (data?.system?.rank) {
    data.system.rank.value = Math.min(
      Math.max(0, number(data.system.rank.value, remaining.length)),
      remaining.length
    );
  }
  return remaining.length;
}

function tokenSize(size) {
  return { small: 1, medium: 1, large: 2, huge: 3, gigantic: 4, colossal: 5 }[size] ?? 1;
}

function ownershipFrom(actor) {
  return foundry.utils.deepClone(actor.ownership ?? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE });
}

async function createEvokerActorLocal(source, spec, pointOrPoints, items = [], scene = canvas.scene) {
  const flag = {
    ...spec,
    sourceActorUuid: source.uuid,
    sourceActorId: source.id,
    sourceActorName: source.name,
    createdAt: Date.now(),
    deleting: false
  };
  const actorData = {
    name: spec.name,
    type: "npc",
    img: spec.img ?? "icons/svg/mystery-man.svg",
    ownership: ownershipFrom(source),
    flags: { [SYSTEM_ID]: { evokerCreation: flag } },
    system: {
      isDigimon: true,
      stage: String(source.system?.stage ?? "child"),
      stageValue: number(source.system?.stageValue ?? CONFIG.DDA?.stages?.[source.system?.stage]?.stageValue, 2),
      size: spec.size ?? "medium",
      combat: { actions: { value: 0, max: 2 }, evokerCommand: {} },
      miscStats: { wounds: { value: spec.wounds, max: spec.wounds, temp: { value: 0 } } }
    },
    prototypeToken: {
      name: spec.name,
      actorLink: true,
      disposition: source.prototypeToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
      displayBars: CONST.TOKEN_DISPLAY_MODES.HOVER,
      bar1: { attribute: "miscStats.wounds" },
      sight: { enabled: spec.subtype === "recon", range: Math.max(0, number(spec.sourceRange)) },
      texture: { src: spec.img ?? "icons/svg/mystery-man.svg" }
    },
    items
  };
  const created = await Actor.create(actorData, { renderSheet: false });
  if (!created) return null;
  const width = Math.max(1, number(spec.width, tokenSize(spec.size)));
  const height = Math.max(1, number(spec.height, width));
  const points = (Array.isArray(pointOrPoints) ? pointOrPoints : [pointOrPoints])
    .filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
  if (!points.length) {
    await created.delete();
    return null;
  }
  try {
    await scene.createEmbeddedDocuments("Token", points.map((point, index) => ({
      actorId: created.id,
      name: points.length > 1 ? `${spec.name} ${index + 1}` : spec.name,
      x: point.x,
      y: point.y,
      width,
      height,
      disposition: source.prototypeToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      sight: { enabled: spec.subtype === "recon", range: Math.max(0, number(spec.sourceRange)) },
      texture: { src: spec.img ?? "icons/svg/mystery-man.svg" },
      flags: { [SYSTEM_ID]: { evokerCreationActorId: created.id, structureSegment: index } }
    })));
  } catch (error) {
    await created.delete();
    throw error;
  }
  return created;
}

async function createEvokerActor(source, spec, pointOrPoints, items = []) {
  if (game.user.isGM) return createEvokerActorLocal(source, spec, pointOrPoints, items, canvas.scene);
  const result = await requestEvokerGmOperation("create", {
    sourceActorUuid: source.uuid,
    sceneId: canvas.scene?.id ?? "",
    spec: foundry.utils.deepClone(spec),
    points: foundry.utils.deepClone(Array.isArray(pointOrPoints) ? pointOrPoints : [pointOrPoints]),
    items: foundry.utils.deepClone(items)
  });
  if (!result?.ok || !result.actorUuid) return null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const actor = game.actors?.get(result.actorId) ?? await fromUuid(result.actorUuid).catch(() => null);
    if (actor) return actor;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
  }
  return null;
}

function inheritedQualityData(source, minionType) {
  const all = new Set(["otimizacaodedados", "dataoptimization", "velocista", "speedster", "acelerar", "accelerate", "movimentoextra", "extramovement", "mobilidadeavancada", "advancedmobility", "acrobata", "tumbler"]);
  const byType = {
    infantry: new Set(["flancoagressivo", "aggressiveflank"]),
    protector: new Set(["especializacaodedados", "dataspecialization", "guardiaoverdadeiro", "trueguardian"]),
    recon: new Set(["especializacaodedados", "dataspecialization", "atiradordeelite", "sniper", "combatenteadistancia", "rangedstriker"]),
    volatile: new Set(["passonatural", "naturewalk", "especializacaodedados", "dataspecialization", "artilhariamovel", "mobileartillery"])
  };
  return source.items.filter((item) => {
    if (item.type !== "quality") return false;
    const keys = [item.system?.sourceId, item.system?.originalName, item.name].map(identity);
    const choiceKeys = selectedChoiceKeys(item);
    if (keys.some((key) => ["otimizacaodedados", "dataoptimization"].includes(key))) {
      /* Speedster is inherited only as +1 Movement, applied to the creation's
       * fixed Movement below. Embedding it would also grant its Dodge benefit. */
      const permitted = ["closecombat", "combatecorpoacorpo"];
      if (minionType === "recon") permitted.push("rangedstriker", "combatenteadistancia");
      return permitted
        .some((key) => choiceKeys.has(key));
    }
    if (keys.some((key) => ["especializacaodedados", "dataspecialization"].includes(key))) {
      const permitted = {
        /* Protector inherits only True Guardian's Action refund. That narrow
         * benefit is tracked on the Summoner when the Protector Intercedes. */
        protector: [],
        recon: ["sniper", "atiradordeelite"],
        volatile: ["mobileartillery", "artilhariamovel"]
      }[minionType] ?? [];
      return permitted.some((key) => choiceKeys.has(key));
    }
    /* Volatile inherits only Naturewalk's Terrain permission. Its selected
     * Elements are stored on the creation flag instead of embedding the full
     * Quality (which would also grant stats, reductions and elemental defense). */
    if (keys.some((key) => ["passonatural", "naturewalk"].includes(key))) return false;
    /* Standalone legacy Speedster Items receive the same Movement-only rule. */
    if (keys.some((key) => ["velocista", "speedster"].includes(key))) return false;
    /* A standalone legacy True Guardian Item must not restore the parts that
     * Protector explicitly does not inherit. */
    if (keys.some((key) => ["guardiaoverdadeiro", "trueguardian"].includes(key))) return false;
    return keys.some((key) => all.has(key) || byType[minionType]?.has(key));
  }).map((item) => {
    const data = item.toObject();
    delete data._id;

    const keys = qualityIdentityKeys(item);
    if ([...keys].some((key) => ["otimizacaodedados", "dataoptimization"].includes(key))) {
      const permitted = ["closecombat", "combatecorpoacorpo"];
      if (minionType === "recon") permitted.push("rangedstriker", "combatenteadistancia");
      if (!restrictClonedQualityChoices(data, permitted)) return null;
    }
    if ([...keys].some((key) => ["especializacaodedados", "dataspecialization"].includes(key))) {
      const permitted = minionType === "recon"
        ? ["sniper", "atiradordeelite"]
        : minionType === "volatile"
          ? ["mobileartillery", "artilhariamovel"]
          : [];
      if (!restrictClonedQualityChoices(data, permitted)) return null;
    }
    if ([...keys].some((key) => ["movimentoextra", "extramovement"].includes(key))) {
      const allMovementChoices = [
        ...(Array.isArray(data.system?.choices?.selectedRanks) ? data.system.choices.selectedRanks : []),
        ...(Array.isArray(data.system?.choices?.selected) ? data.system.choices.selected : []),
        ...(!Array.isArray(data.system?.choices?.selected) && data.system?.choices?.selected ? [data.system.choices.selected] : [])
      ];
      const permitted = allMovementChoices
        .filter((choice) => !["flight", "fly", "voo"].includes(identity(
          choice?.key ?? choice?.value ?? choice?.id ?? choice?.originalLabel ?? choice?.label ?? choice
        )))
        .flatMap((choice) => [choice?.key, choice?.value, choice?.id, choice?.originalLabel, choice?.label, choice])
        .filter((choice) => typeof choice === "string" && choice.trim());
      if (!restrictClonedQualityChoices(data, permitted)) return null;
    }

    data.flags ??= {};
    data.flags[SYSTEM_ID] = { ...(data.flags[SYSTEM_ID] ?? {}), evokerInherited: true };
    return data;
  }).filter(Boolean);
}

function inheritedMovementBonus(source) {
  return source.items.filter((item) => item.type === "quality").reduce((total, item) => {
    const keys = [item.system?.sourceId, item.system?.originalName, item.name].map(identity);
    const choices = selectedChoiceKeys(item);
    if (keys.some((key) => ["otimizacaodedados", "dataoptimization"].includes(key)) &&
      (choices.has("speedster") || choices.has("velocista"))) return total + 1;
    if (keys.some((key) => ["velocista", "speedster"].includes(key))) return total + 1;
    if (keys.some((key) => ["acelerar", "accelerate"].includes(key))) {
      const rank = Math.max(1, number(item.system?.rank?.value, 1));
      const grants = item.system?.grants?.miscStats ?? {};
      return total + number(grants.movement) + (number(grants.movementPerRank) * rank);
    }
    return total;
  }, 0);
}

async function trackProtectorTrueGuardianRefund(source, actionCost = 1) {
  if (!sourceHasSelectedQualityChoice(
    source,
    ["especializacaoDeDados", "dataSpecialization"],
    ["trueGuardian", "guardiaoVerdadeiro"]
  )) return;

  const combatId = String(game.combat?.id ?? "");
  const current = source.system?.combat?.intercedeUsage?.trueGuardianRefund ?? {};
  const sameCombat = !current.combatId || String(current.combatId) === combatId;
  const spentActions = (sameCombat ? Math.max(0, number(current.spentActions)) : 0) +
    Math.max(0, number(actionCost));

  await source.update({
    "system.combat.intercedeUsage.trueGuardianRefund": {
      pending: Boolean(current.pending && sameCombat) || spentActions >= 2,
      combatId,
      round: number(game.combat?.round),
      spentActions,
      source: "evokerProtector"
    }
  });
}

function buildMinionAttack(source, type, element = "", { explosion = false } = {}) {
  const ranged = type === "recon" || explosion;
  const qualityTags = explosion ? [{ key: "t:burst", label: "[T:BURST]" }] : [];
  return {
    name: explosion ? text("Explosão Volátil", "Volatile Explosion") : text("Ataque de Lacaio", "Minion Attack"),
    type: "attack",
    img: explosion ? "icons/svg/explosion.svg" : "icons/svg/sword.svg",
    flags: { [SYSTEM_ID]: { evokerMinionAttack: true, volatileExplosion: explosion, element } },
    system: {
      baseTags: { rangeType: ranged ? "range" : "melee", functionType: "damage" },
      range: { value: type === "recon" ? number(source.system?.miscStats?.range?.total ?? source.system?.miscStats?.range?.value) : explosion ? 1 : 0 },
      effectiveLimit: { value: type === "recon" ? number(source.system?.miscStats?.effectiveLimit?.total ?? source.system?.miscStats?.effectiveLimit?.value) : explosion ? 1 : 0 },
      qualityTags,
      accuracy: { baseFormula: "@actor.mainStats.accuracy.total", bonus: 0, automaticSuccesses: 0 },
      damage: { enabled: true, baseFormula: "@actor.mainStats.damage.total", bonus: 0, unalterable: 0, minimum: 1 },
      actionCost: { value: explosion ? 0 : 1, extra: 0 }
    }
  };
}

async function useConjure(actor, { prepaidActions = false, accessOverride = null } = {}) {
  const quality = findQuality(actor, ["conjurador", "conjurer"]);
  if (!quality) return { handled: false };
  if (!game.combat?.started) {
    ui.notifications.warn(text("Conjurar exige um Combate ativo.", "Conjure requires an active Combat."));
    return { handled: true, success: false };
  }
  if (!String(quality.system?.creation?.appearance ?? "").trim() && !(await configureEvokerQualityAppearance(actor, quality))) {
    return { handled: true, success: false };
  }
  if (usedOnCooldown(actor, "conjure")) {
    ui.notifications.warn(text("Conjurar já foi usado nesta rodada.", "Conjure was already used this round."));
    return { handled: true, success: false };
  }
  const choices = selectedChoiceKeys(quality);
  const existingStructures = creationActorsForSource(actor, "structure");
  const supportStructures = existingStructures.filter((entry) => (
    ["platform", "walls"].includes(entry.flags?.[SYSTEM_ID]?.evokerCreation?.subtype)
  ));
  const infusedPlatforms = existingStructures.filter((entry) => {
    const flag = entry.flags?.[SYSTEM_ID]?.evokerCreation;
    return flag?.subtype === "platform" && Boolean(String(flag.element ?? "").trim()) &&
      String(flag.platformTerrain ?? "").toLowerCase() !== "dangerous";
  });
  const hasTerrainChoice = choices.has("terrain") || choices.has("terreno");
  const options = [
    choices.has("wallsandpillars") || choices.has("paredesepilares") ? ["walls", text("Paredes/Pilares", "Walls/Pillars")] : null,
    choices.has("platforms") || choices.has("plataformas") ? ["platform", text("Plataforma", "Platform")] : null,
    hasTerrainChoice ? ["terrain", text("Terreno", "Terrain")] : null,
    hasTerrainChoice && infusedPlatforms.length
      ? ["platformDangerous", text("Converter Plataforma em Terreno Perigoso", "Convert Platform into Dangerous Terrain")]
      : null
  ].filter(Boolean);
  if (!options.length) return { handled: true, success: false };
  const mastery = getMastery(actor);
  const elements = naturewalkElements(actor);
  const configuredAppearance = String(quality.system?.creation?.appearance ?? "").trim();
  const result = await chooseCreation(text("Conjurar", "Conjure"), `
    <form class="dda-evoker-grid">
      <label>${text("Ações", "Actions")}<select name="actionCost"><option value="1">1</option><option value="2">2</option></select></label>
      <label>${text("Estrutura", "Structure")}<select name="kind">${options.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
      <label>${text("Quantidade de espaços", "Number of spaces")}<input type="number" name="spaces" min="1" max="4" value="1"></label>
      <label>${text("Aparência", "Appearance")}<input type="text" name="appearance" required value="${escapeHtml(configuredAppearance)}" ${configuredAppearance ? "readonly" : ""} placeholder="${text("Descreva a criação", "Describe the creation")}"></label>
      <label>${text("Elemento (Plataforma/Terreno)", "Element (Platform/Terrain)")}<select name="element"><option value="">—</option>${elements.map((element) => `<option value="${escapeHtml(element.key)}">${escapeHtml(element.label)}</option>`).join("")}</select></label>
      <label>${text("Camada do Terreno", "Terrain Layer")}<select name="terrainLayer"><option value="surface">${text("Superfície", "Surface")}</option><option value="aerial">${text("Aérea", "Aerial")}</option></select></label>
      <label>${text("Terreno da Plataforma", "Platform Terrain")}<select name="platformTerrain"><option value="">${text("Sem Elemento", "No Element")}</option><option value="basic">${text("Básico", "Basic")}</option><option value="difficult">${text("Difícil", "Difficult")}</option></select></label>
      <label><input type="checkbox" name="existingElement"> ${text("Elemento já existe (Terreno)", "Element already exists (Terrain)")}</label>
      <label><input type="checkbox" name="dangerous"> ${text("Terreno Perigoso (+1 Mastery)", "Dangerous Terrain (+1 Mastery)")}</label>
      <label><input type="checkbox" name="windows"> ${text("Janelas para visão/Ataques (Parede)", "Windows for sight/Attacks (Wall)")}</label>
      ${supportStructures.length ? `<label>${text("Fundação para Paredes/Pilares (opcional)", "Foundation for Walls/Pillars (optional)")}<select name="foundationId"><option value="">${text("Chão ou outra fundação", "Ground or another foundation")}</option>${supportStructures.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("")}</select></label>` : ""}
      ${infusedPlatforms.length ? `<label>${text("Plataforma a converter", "Platform to convert")}<select name="targetStructureId">${infusedPlatforms.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("")}</select></label>` : ""}
      ${existingStructures.length ? `<fieldset><legend>${text("Estruturas a recriar/manter", "Structures to recreate/keep")}</legend>${existingStructures.map((entry) => `<label><input type="checkbox" name="keepStructureIds" value="${escapeHtml(entry.id)}"> ${escapeHtml(entry.name)}</label>`).join("")}</fieldset>` : ""}
    </form>`, (_event, button) => ({
      actionCost: Math.max(1, Math.min(2, number(button.form?.elements?.actionCost?.value, 1))),
      kind: String(button.form?.elements?.kind?.value ?? "walls"),
      spaces: Math.max(1, Math.min(4, number(button.form?.elements?.spaces?.value, 1))),
      appearance: String(button.form?.elements?.appearance?.value ?? "").trim(),
      element: String(button.form?.elements?.element?.value ?? "").trim(),
      terrainLayer: String(button.form?.elements?.terrainLayer?.value ?? "surface") === "aerial" ? "aerial" : "surface",
      platformTerrain: String(button.form?.elements?.platformTerrain?.value ?? "").trim(),
      existingElement: Boolean(button.form?.elements?.existingElement?.checked),
      dangerous: Boolean(button.form?.elements?.dangerous?.checked),
      windows: Boolean(button.form?.elements?.windows?.checked),
      foundationId: String(button.form?.elements?.foundationId?.value ?? "").trim(),
      targetStructureId: String(button.form?.elements?.targetStructureId?.value ?? "").trim(),
      keepIds: Array.from(button.form?.querySelectorAll?.("[name='keepStructureIds']:checked") ?? [])
        .map((input) => String(input.value ?? "").trim())
        .filter(Boolean)
    }));
  if (!result) return { handled: true, success: false };
  if (!options.some(([key]) => key === result.kind)) return { handled: true, success: false };
  if (result.kind !== "platformDangerous" && !result.appearance) {
    ui.notifications.warn(text("Defina a aparência da criação.", "Define the creation's appearance."));
    return { handled: true, success: false };
  }
  if (["terrain", "platformDangerous"].includes(result.kind) && !actor.system?.qualityFeatures?.elementMaster?.active) {
    ui.notifications.warn(text("Esta opção exige Mestre Elemental.", "This option requires Element Master."));
    return { handled: true, success: false };
  }
  if (result.kind === "terrain" && !result.element) {
    ui.notifications.warn(text("Terreno exige Mestre Elemental e um Elemento de Passo Natural possuído.", "Terrain requires Element Master and an owned Naturewalk Element."));
    return { handled: true, success: false };
  }
  if (result.kind === "platform" && result.platformTerrain && !result.element) {
    ui.notifications.warn(text("Escolha um Elemento de Passo Natural para a Plataforma.", "Choose a Naturewalk Element for the Platform."));
    return { handled: true, success: false };
  }
  const existingIds = new Set(existingStructures.map((entry) => String(entry.id)));
  let keepIds = new Set(result.keepIds.filter((id) => existingIds.has(id)));
  const foundation = result.kind === "walls"
    ? supportStructures.find((entry) => String(entry.id) === result.foundationId)
    : null;
  const convertedPlatform = result.kind === "platformDangerous"
    ? infusedPlatforms.find((entry) => String(entry.id) === result.targetStructureId)
    : null;
  if (result.kind === "platformDangerous" && !convertedPlatform) {
    ui.notifications.warn(text("Escolha uma Plataforma elemental válida.", "Choose a valid elemental Platform."));
    return { handled: true, success: false };
  }
  if (foundation) keepIds.add(String(foundation.id));
  if (convertedPlatform) keepIds.add(String(convertedPlatform.id));
  keepIds = expandStructureKeepSet(existingStructures, keepIds);

  const spaces = ["platform", "platformDangerous"].includes(result.kind) ? 1 : result.spaces;
  const baseCost = result.kind === "walls"
    ? spaces
    : result.kind === "platform"
      ? 2
      : result.kind === "platformDangerous"
        ? 1
        : (result.existingElement ? 1 : 2) * spaces;
  const cost = baseCost + (result.kind === "terrain" && result.dangerous ? spaces : 0);
  const conversionCost = result.kind === "platformDangerous" ? 2 : cost;
  const refundableMastery = existingStructures
    .filter((entry) => !keepIds.has(String(entry.id)))
    .reduce((total, entry) => total + Math.max(0, number(entry.flags?.[SYSTEM_ID]?.evokerCreation?.masteryCost)), 0);
  const masteryAvailableAfterReplacement = Math.min(mastery.max, mastery.value + refundableMastery);
  const accessible = accessOverride ?? (result.actionCost === 1 ? Math.floor(mastery.max / 2) : mastery.max);
  if (conversionCost > accessible || conversionCost > masteryAvailableAfterReplacement) {
    ui.notifications.warn(text(`A criação exige ${conversionCost} Mastery, mas esta Ação acessa no máximo ${accessible}.`, `The creation costs ${conversionCost} Mastery, but this Action accesses at most ${accessible}.`));
    return { handled: true, success: false };
  }
  const dimensions = result.kind === "platform" ? { width: 2, height: 1 } : { width: 1, height: 1 };
  const points = [];
  const gridSize = Math.max(1, number(canvas?.grid?.size, 100));
  const ignoredActorIds = new Set(existingStructures
    .filter((entry) => !keepIds.has(String(entry.id)))
    .map((entry) => String(entry.id)));
  if (foundation) ignoredActorIds.add(String(foundation.id));
  while (result.kind !== "platformDangerous" && points.length < spaces) {
    const point = await pickCanvasPoint(actor, { ...dimensions, ignoredActorIds });
    if (!point) return { handled: true, success: false };
    if (foundation && !pointIsSupportedByStructure(point, dimensions.width, dimensions.height, foundation)) {
      ui.notifications.warn(text("O segmento precisa ficar sobre a Fundação escolhida.", "The segment must be placed over the selected Foundation."));
      continue;
    }
    const overlapsSelection = points.some((other) => (
      Math.abs(number(point.x) - number(other.x)) < dimensions.width * gridSize &&
      Math.abs(number(point.y) - number(other.y)) < dimensions.height * gridSize
    ));
    if (overlapsSelection) {
      ui.notifications.warn(text("Cada segmento precisa ocupar um espaço diferente.", "Each segment must occupy a different space."));
      continue;
    }
    const mustBeAdjacent = points.length > 0 && ["walls", "terrain"].includes(result.kind);
    const isAdjacent = points.some((other) => {
      const dx = Math.abs(number(point.x) - number(other.x));
      const dy = Math.abs(number(point.y) - number(other.y));
      return (dx === gridSize && dy === 0) || (dy === gridSize && dx === 0);
    });
    if (mustBeAdjacent && !isAdjacent) {
      ui.notifications.warn(text("Os segmentos da mesma Estrutura precisam ser adjacentes.", "Segments of the same Structure must be adjacent."));
      continue;
    }
    points.push(point);
  }
  if (!prepaidActions && !(await spendActorActions(actor, result.actionCost))) return { handled: true, success: false };
  await clearCreations(actor, "structure", keepIds, { refund: true });
  if (!(await spendMastery(actor, conversionCost))) return { handled: true, success: false };
  if (convertedPlatform) {
    const flag = convertedPlatform.flags?.[SYSTEM_ID]?.evokerCreation ?? {};
    try {
      await convertedPlatform.update({
        [`${CREATION_FLAG}.platformTerrain`]: "dangerous",
        [`${CREATION_FLAG}.terrainUpgradeMasteryCost`]: Math.max(0, number(flag.terrainUpgradeMasteryCost)) + conversionCost,
        [`${CREATION_FLAG}.masteryCost`]: Math.max(0, number(flag.masteryCost)) + conversionCost
      });
    } catch (error) {
      await refundMastery(actor, conversionCost);
      throw error;
    }
    await markCooldown(actor, "conjure");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="dda-chat-card"><h2>${text("Conjurar", "Conjure")}</h2><p><strong>${escapeHtml(convertedPlatform.name)}</strong> ${text("foi convertida em Terreno Perigoso", "was converted into Dangerous Terrain")} (${conversionCost} Mastery).</p></div>` });
    return { handled: true, success: true, masterySpent: conversionCost, actionCost: result.actionCost };
  }
  const dos = Math.max(0, number(actor.system?.derivedStats?.dos?.total ?? actor.system?.derivedStats?.dos?.value));
  const wounds = result.kind === "platform" ? 2 : spaces;
  const created = await createEvokerActor(actor, {
    kind: "structure", subtype: result.kind, name: result.appearance,
    img: result.kind === "terrain" ? "icons/svg/acid.svg" : "icons/svg/wall-direction.svg",
    masteryCost: cost,
    wounds, damageThreshold: dos, dodgeDisabled: true,
    width: dimensions.width, height: dimensions.height,
    heightSpaces: result.kind === "walls" ? dos : 1,
    segmentCount: points.length,
    terrain: result.kind === "terrain" ? (result.dangerous ? "dangerous" : "difficult") : "",
    terrainLayer: result.kind === "terrain" ? result.terrainLayer : "surface",
    element: result.element,
    platformTerrain: result.kind === "platform" ? result.platformTerrain : "",
    windows: result.kind === "walls" && result.windows,
    foundationActorIds: foundation ? [String(foundation.id)] : [],
    foundationActorUuids: foundation ? [String(foundation.uuid)] : [],
    accuracy: 0, damage: 0, movement: 0, armor: 0, dodge: 0, size: "medium"
  }, points);
  if (!created) {
    await refundMastery(actor, conversionCost);
    return { handled: true, success: false };
  }
  await markCooldown(actor, "conjure");
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="dda-chat-card"><h2>${text("Conjurar", "Conjure")}</h2><p><strong>${escapeHtml(actor.name)}</strong> ${text("criou", "created")} <strong>${escapeHtml(result.appearance)}</strong> (${conversionCost} Mastery).</p></div>` });
  return { handled: true, success: true, masterySpent: conversionCost, actionCost: result.actionCost };
}

function getSummonerType(quality) {
  const keys = selectedChoiceKeys(quality);
  return ["infantry", "protector", "recon", "volatile"].find((key) => keys.has(key))
    ?? (keys.has("infantaria") ? "infantry" : keys.has("protetor") ? "protector" : keys.has("reconhecimento") ? "recon" : keys.has("volatil") ? "volatile" : "infantry");
}

async function useSummon(actor, { prepaidActions = false, accessOverride = null } = {}) {
  const quality = findQuality(actor, ["invocador", "summoner"]);
  if (!quality) return { handled: false };
  if (!game.combat?.started) {
    ui.notifications.warn(text("Invocar exige um Combate ativo.", "Summon requires an active Combat."));
    return { handled: true, success: false };
  }
  if (!String(quality.system?.creation?.appearance ?? "").trim() && !(await configureEvokerQualityAppearance(actor, quality))) {
    return { handled: true, success: false };
  }
  if (usedOnCooldown(actor, "summon")) {
    ui.notifications.warn(text("Invocar já foi usado nesta rodada.", "Summon was already used this round."));
    return { handled: true, success: false };
  }
  let type = getSummonerType(quality);

  if (hasBossQuality(actor, "omnipotentSummoning")) {
    const selectedType = await chooseCreation(
      text("Invocação Onipotente", "Omnipotent Summoning"),
      `<form class="dda-evoker-grid">
        <label>${text("Tipo de Lacaio", "Minion Type")}
          <select name="minionType">
            <option value="infantry" ${type === "infantry" ? "selected" : ""}>${text("Infantaria", "Infantry")}</option>
            <option value="protector" ${type === "protector" ? "selected" : ""}>${text("Protetor", "Protector")}</option>
            <option value="recon" ${type === "recon" ? "selected" : ""}>${text("Reconhecimento", "Recon")}</option>
            <option value="volatile" ${type === "volatile" ? "selected" : ""}>${text("Volátil", "Volatile")}</option>
          </select>
        </label>
        <p>${text(
          "Invocação Onipotente permite escolher o tipo de Lacaio a cada Invocação.",
          "Omnipotent Summoning lets you choose the Minion type each time you Summon."
        )}</p>
      </form>`,
      (_event, button) => String(button.form?.elements?.minionType?.value ?? type)
    );

    if (!selectedType) return { handled: true, success: false };
    if (["infantry", "protector", "recon", "volatile"].includes(selectedType)) {
      type = selectedType;
    }
  }

  const base = { infantry: 4, protector: 3, recon: 2, volatile: 1 }[type];
  const existing = creationActorsForSource(actor, "minion");
  const mastery = getMastery(actor);
  const elements = naturewalkElements(actor);
  const configuredAppearance = String(quality.system?.creation?.appearance ?? "").trim();
  const maximumMinions = Math.max(1, getRank(quality));
  const enhancementFields = Array.from({ length: maximumMinions }, (_unused, index) => `
    <label>${text(`Mastery adicional — Lacaio ${index + 1}`, `Extra Mastery — Minion ${index + 1}`)}
      <input type="number" name="extra${index}" min="0" value="0">
    </label>`).join("");
  const result = await chooseCreation(text("Invocar", "Summon"), `<form class="dda-evoker-grid">
    <label>${text("Ações", "Actions")}<select name="actionCost"><option value="1">1</option><option value="2">2</option></select></label>
    <label>${text("Quantidade de Lacaios", "Number of Minions")}<select name="quantity">${Array.from({ length: maximumMinions }, (_unused, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label>
    ${enhancementFields}
    <p>${text("Somente os aprimoramentos dos Lacaios selecionados serão cobrados.", "Only enhancements for the selected Minions will be charged.")}</p>
    <label>${text("Nome/Aparência", "Name/Appearance")}<input type="text" name="appearance" required value="${escapeHtml(configuredAppearance || text("Lacaio Digital", "Digital Minion"))}" ${configuredAppearance ? "readonly" : ""}></label>
    ${type === "volatile" ? `<label>${text("Elemento de Passo Natural", "Naturewalk Element")}<select name="element" required>${elements.map((element) => `<option value="${escapeHtml(element.key)}">${escapeHtml(element.label)}</option>`).join("")}</select></label>` : ""}
    ${existing.length ? `<fieldset><legend>${text("Lacaios que serão mantidos", "Minions to keep")}</legend>${existing.map((entry) => `<label><input type="checkbox" name="keepMinionIds" value="${escapeHtml(entry.id)}"> ${escapeHtml(entry.name)}</label>`).join("")}</fieldset>` : ""}
  </form>`, (_event, button) => ({
    actionCost: Math.max(1, Math.min(2, number(button.form?.elements?.actionCost?.value, 1))),
    quantity: Math.max(1, Math.min(maximumMinions, Math.floor(number(button.form?.elements?.quantity?.value, 1)))),
    extras: Array.from({ length: maximumMinions }, (_unused, index) => (
      Math.max(0, Math.floor(number(button.form?.elements?.[`extra${index}`]?.value)))
    )),
    appearance: String(button.form?.elements?.appearance?.value ?? "").trim(),
    element: String(button.form?.elements?.element?.value ?? "").trim(),
    keepIds: Array.from(button.form?.querySelectorAll?.("[name='keepMinionIds']:checked") ?? [])
      .map((input) => String(input.value ?? "").trim())
      .filter(Boolean)
  }));
  if (!result) return { handled: true, success: false };
  if (type === "volatile" && (!actor.system?.qualityFeatures?.elementMaster?.active || !result.element || !elements.length)) {
    ui.notifications.warn(text("Lacaio Volátil exige Mestre Elemental e um Elemento de Passo Natural possuído.", "Volatile Minion requires Element Master and an owned Naturewalk Element."));
    return { handled: true, success: false };
  }
  const existingIds = new Set(existing.map((entry) => String(entry.id)));
  const keepIds = new Set(result.keepIds.filter((id) => existingIds.has(id)));
  if (keepIds.size >= getRank(quality)) {
    ui.notifications.warn(text("O limite de Lacaios já foi atingido.", "The Minion limit has already been reached."));
    return { handled: true, success: false };
  }
  const capacity = Math.max(0, maximumMinions - keepIds.size);
  if (result.quantity > capacity) {
    ui.notifications.warn(text(
      `Esta Invocação pode criar no máximo ${capacity} Lacaio(s) sem ultrapassar os Ranks da Qualidade.`,
      `This Summon can create at most ${capacity} Minion(s) without exceeding the Quality's Ranks.`
    ));
    return { handled: true, success: false };
  }
  const extras = result.extras.slice(0, result.quantity);
  const costs = extras.map((extra) => base + extra);
  const totalCost = costs.reduce((total, cost) => total + cost, 0);
  const refundableMastery = existing
    .filter((entry) => !keepIds.has(entry.id))
    .reduce((total, entry) => total + Math.max(0, number(entry.flags?.[SYSTEM_ID]?.evokerCreation?.masteryCost)), 0);
  const masteryAvailableAfterReplacement = Math.min(mastery.max, mastery.value + refundableMastery);
  const accessible = accessOverride ?? (result.actionCost === 1 ? Math.floor(mastery.max / 2) : mastery.max);
  if (totalCost > accessible || totalCost > masteryAvailableAfterReplacement) {
    ui.notifications.warn(text(
      `Os Lacaios exigem ${totalCost} Mastery, mas esta Ação acessa no máximo ${accessible}.`,
      `The Minions cost ${totalCost} Mastery, but this Action accesses at most ${accessible}.`
    ));
    return { handled: true, success: false };
  }
  const sizes = { infantry: "large", protector: "huge", recon: "medium", volatile: "large" };
  const dimensions = { width: tokenSize(sizes[type]), height: tokenSize(sizes[type]) };
  const ignoredActorIds = new Set(existing
    .filter((entry) => !keepIds.has(entry.id))
    .map((entry) => String(entry.id)));
  const gridSize = Math.max(1, number(canvas?.grid?.size, 100));
  const points = [];
  while (points.length < result.quantity) {
    ui.notifications.info(text(
      `Posicione o Lacaio ${points.length + 1} de ${result.quantity}.`,
      `Place Minion ${points.length + 1} of ${result.quantity}.`
    ));
    const point = await pickCanvasPoint(actor, { ...dimensions, ignoredActorIds });
    if (!point) return { handled: true, success: false };
    const overlapsSelection = points.some((other) => (
      number(point.x) < number(other.x) + dimensions.width * gridSize &&
      number(point.x) + dimensions.width * gridSize > number(other.x) &&
      number(point.y) < number(other.y) + dimensions.height * gridSize &&
      number(point.y) + dimensions.height * gridSize > number(other.y)
    ));
    if (overlapsSelection) {
      ui.notifications.warn(text("Cada Lacaio precisa ocupar um espaço diferente.", "Each Minion must occupy a different space."));
      continue;
    }
    points.push(point);
  }
  if (!prepaidActions && !(await spendActorActions(actor, result.actionCost))) return { handled: true, success: false };
  await clearCreations(actor, "minion", keepIds, { refund: true });
  if (!(await spendMastery(actor, totalCost))) return { handled: true, success: false };
  const bit = Math.max(0, number(actor.system?.derivedStats?.bit?.total ?? actor.system?.derivedStats?.bit?.value));
  const dos = Math.max(0, number(actor.system?.derivedStats?.dos?.total ?? actor.system?.derivedStats?.dos?.value));
  const sv = Math.max(0, number(actor.system?.stageValue ?? CONFIG.DDA?.stages?.[actor.system?.stage]?.stageValue));
  const baseName = result.appearance || text("Lacaio Digital", "Digital Minion");
  const multipleMinions = keepIds.size + result.quantity > 1;
  const createdMinions = [];
  try {
    for (let index = 0; index < result.quantity; index += 1) {
      const extra = extras[index];
      const statBonus = Math.floor(extra / 2);
      const name = multipleMinions ? `${baseName} ${keepIds.size + index + 1}` : baseName;
      const stats = {
        accuracy: bit + statBonus + (type === "recon" ? sv : 0),
        damage: bit + statBonus + (type === "volatile" ? sv : 0),
        movement: bit + statBonus + (type === "infantry" ? sv : 0) + inheritedMovementBonus(actor),
        wounds: (dos * 2) + (extra * 2) + (type === "protector" ? sv * 2 : 0)
      };
      const items = [
        ...inheritedQualityData(actor, type),
        buildMinionAttack(actor, type, result.element),
        ...(type === "volatile" ? [buildMinionAttack(actor, type, result.element, { explosion: true })] : [])
      ];
      const created = await createEvokerActor(actor, {
        kind: "minion", subtype: type, name,
        img: type === "volatile" ? "icons/svg/explosion.svg" : "icons/svg/mystery-man.svg",
        masteryCost: costs[index], size: sizes[type], armor: 0, dodge: 0, flight: true,
        sourceRange: number(actor.system?.miscStats?.range?.total ?? actor.system?.miscStats?.range?.value),
        sourceEffectiveLimit: number(actor.system?.miscStats?.effectiveLimit?.total ?? actor.system?.miscStats?.effectiveLimit?.value),
        sourceDerivedStats: Object.fromEntries(["bit", "dos", "ram", "cpu"].map((key) => [
          key,
          number(actor.system?.derivedStats?.[key]?.total ?? actor.system?.derivedStats?.[key]?.value)
        ])),
        naturewalkTerrainElements: type === "volatile"
          ? elements.map((entry) => ({ key: entry.key, label: entry.label }))
          : [],
        element: result.element, ...stats
      }, points[index], items);
      if (!created) throw new Error(`Failed to create Minion ${index + 1}`);
      createdMinions.push(created);
    }
  } catch (error) {
    console.warn("DDA | Summon creation failed.", error);
    for (const created of createdMinions) await deleteCreation(created, { refund: false });
    await refundMastery(actor, totalCost);
    ui.notifications.error(text("Não foi possível concluir a Invocação.", "The Summon could not be completed."));
    return { handled: true, success: false };
  }
  await markCooldown(actor, "summon");
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="dda-chat-card"><h2>${text("Invocar", "Summon")}</h2><p><strong>${actor.name}</strong> ${text("invocou", "summoned")} ${createdMinions.map((created) => `<strong>${created.name}</strong>`).join(", ")} (${totalCost} Mastery).</p></div>` });
  return { handled: true, success: true, masterySpent: totalCost, actionCost: result.actionCost };
}

async function useCommand(actor) {
  const quality = findQuality(actor, ["invocador", "summoner"]);
  if (!quality) return { handled: false };
  const minions = creationActorsForSource(actor, "minion");
  if (!minions.length) {
    ui.notifications.warn(text("Não há Lacaios ativos para comandar.", "There are no active Minions to command."));
    return { handled: true, success: false };
  }
  const type = getSummonerType(quality);
  const infantryFreeAvailable = type === "infantry" && String(actor.system?.combat?.evokerCommand?.infantryDiscountTurn ?? "") !== turnSignature();
  const result = await chooseCreation(text("Comandar Lacaio", "Command Minion"), `<form>
    <label>${text("Alvo do comando", "Command target")}<select name="target"><option value="all">${text("Todos (2 Ações)", "All (2 Actions)")}</option>${minions.map((minion) => `<option value="${minion.id}">${minion.name} (1 ${text("Ação", "Action")})</option>`).join("")}</select></label>
    ${infantryFreeAvailable ? `<p>${text("Infantaria: o primeiro comando deste turno custa 1 Ação a menos.", "Infantry: the first command this turn costs 1 fewer Action.")}</p>` : ""}
  </form>`, (_event, button) => String(button.form?.elements?.target?.value ?? "all"));
  if (!result) return { handled: true, success: false };
  const selected = result === "all" ? minions : minions.filter((minion) => minion.id === result);
  let actionCost = result === "all" ? 2 : 1;
  if (infantryFreeAvailable) actionCost = Math.max(0, actionCost - 1);
  if (!(await spendActorActions(actor, actionCost))) return { handled: true, success: false };
  const groupId = foundry.utils.randomID();
  const sharedAccuracyPool = selected.reduce((lowest, minion) => Math.min(
    lowest,
    Math.max(0, number(minion.system?.mainStats?.accuracy?.total))
  ), Number.POSITIVE_INFINITY);
  for (const minion of selected) {
    await minion.update({
      "system.combat.actions.value": 2,
      "system.combat.actions.max": 2,
      "system.combat.evokerCommand": {
        sourceActorUuid: actor.uuid, groupId, allMinions: result === "all", usedNonMove: false,
        grantedAt: Date.now(), roundSignature: cooldownSignature(),
        aidBlocked: infantryFreeAvailable,
        sharedAccuracyPool: Number.isFinite(sharedAccuracyPool) ? sharedAccuracyPool : 0
      }
    });
  }
  if (infantryFreeAvailable) {
    await actor.update({ "system.combat.evokerCommand.infantryDiscountTurn": turnSignature() });
  }
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="dda-chat-card"><h2>${text("Comandar Lacaio", "Command Minion")}</h2><p>${selected.map((minion) => `<strong>${minion.name}</strong>`).join(", ")} ${text("recebeu 2 Ações.", "received 2 Actions.")}</p></div>` });
  return { handled: true, success: true };
}

async function useOmnievoker(actor) {
  const hasConjurer = Boolean(findQuality(actor, ["conjurador", "conjurer"]));
  const hasSummoner = Boolean(findQuality(actor, ["invocador", "summoner"]));
  if (!hasConjurer || !hasSummoner) return { handled: false };
  const actionCost = await chooseCreation("Omnievoker", `<form><label>${text("Ações compartilhadas", "Shared Actions")}<select name="cost"><option value="1">1</option><option value="2">2</option></select></label></form>`,
    (_event, button) => Math.max(1, Math.min(2, number(button.form?.elements?.cost?.value, 1))));
  if (!actionCost) return { handled: true, success: false };
  if (!(await spendActorActions(actor, actionCost))) return { handled: true, success: false };
  const masteryBefore = getMastery(actor);
  const accessible = actionCost === 1 ? Math.floor(masteryBefore.max / 2) : masteryBefore.max;
  const conjure = await useConjure(actor, { prepaidActions: true, accessOverride: accessible });
  const remainingAccess = Math.max(0, accessible - Math.max(0, number(conjure?.masterySpent)));
  const summon = await useSummon(actor, { prepaidActions: true, accessOverride: remainingAccess });
  return { handled: true, success: Boolean(conjure?.success || summon?.success) };
}

export async function useEvokerQualityAction(actor, quality) {
  const id = identity(quality?.system?.sourceId ?? quality?.name);
  if (["conjurador", "conjurer"].includes(id)) return useConjure(actor);
  if (["invocador", "summoner"].includes(id)) {
    const choice = await chooseCreation(text("Invocador", "Summoner"), `<form><label>${text("Ação", "Action")}<select name="action"><option value="summon">${text("Invocar", "Summon")}</option><option value="command">${text("Comandar Lacaio", "Command Minion")}</option></select></label></form>`,
      (_event, button) => String(button.form?.elements?.action?.value ?? "summon"));
    return choice === "command" ? useCommand(actor) : choice === "summon" ? useSummon(actor) : { handled: true, success: false };
  }
  if (["evocador", "evoker", "omnievoker"].includes(id)) return useOmnievoker(actor);
  return { handled: false };
}

export function getEvokerActionMenuEntries(actor) {
  const entries = [];
  if (findQuality(actor, ["conjurador", "conjurer"])) entries.push({ key: "conjure", title: text("Conjurar", "Conjure"), summary: text("Crie Estruturas gastando Mastery.", "Create Structures by spending Mastery."), cost: "1–2A" });
  if (findQuality(actor, ["invocador", "summoner"])) {
    entries.push({ key: "summon", title: text("Invocar", "Summon"), summary: text("Crie Lacaios gastando Mastery.", "Create Minions by spending Mastery."), cost: "1–2A" });
    entries.push({ key: "commandMinion", title: text("Comandar Lacaio", "Command Minion"), summary: text("Conceda 2 Ações a um ou a todos os Lacaios.", "Grant 2 Actions to one or all Minions."), cost: "1–2A" });
  }
  if (findQuality(actor, ["evocador", "evoker", "omnievoker"]) && entries.length >= 3) entries.push({ key: "omnievoker", title: "Omnievoker", summary: text("Conjure e Invoque com as mesmas Ações.", "Conjure and Summon with the same Actions."), cost: "1–2A" });
  return entries;
}

export async function executeEvokerActionMenuAction(actor, key) {
  if (key === "conjure") return useConjure(actor);
  if (key === "summon") return useSummon(actor);
  if (key === "commandMinion") return useCommand(actor);
  if (key === "omnievoker") return useOmnievoker(actor);
  return null;
}

export function isEvokerCreation(actor, kind = "") {
  const flag = actor?.flags?.[SYSTEM_ID]?.evokerCreation;
  return Boolean(flag && (!kind || flag.kind === kind));
}

export function prepareEvokerCreationActor(actor, system) {
  const flag = actor?.flags?.[SYSTEM_ID]?.evokerCreation;
  if (!flag) return;
  const stats = { accuracy: flag.accuracy, damage: flag.damage, dodge: 0, armor: 0 };
  for (const [key, raw] of Object.entries(stats)) {
    if (!system.mainStats?.[key]) continue;
    const value = Math.max(0, number(raw));
    system.mainStats[key].base = value;
    system.mainStats[key].bonus = 0;
    system.mainStats[key].qualityBonus = 0;
    system.mainStats[key].effectBonus = 0;
    system.mainStats[key].total = value;
  }
  for (const stat of Object.values(system.derivedStats ?? {})) {
    if (!stat || typeof stat !== "object") continue;
    stat.value = 0;
    stat.total = 0;
  }
  system.miscStats ??= {};
  const woundsValue = Math.max(0, number(system.miscStats?.wounds?.value, flag.wounds));
  system.miscStats.wounds = { ...(system.miscStats.wounds ?? {}), value: Math.min(flag.wounds, woundsValue), max: Math.max(0, number(flag.wounds)), temp: { ...(system.miscStats?.wounds?.temp ?? {}), value: 0 } };
  system.miscStats.movement = { ...(system.miscStats.movement ?? {}), base: number(flag.movement), value: number(flag.movement), total: number(flag.movement) };
  system.miscStats.range = { ...(system.miscStats.range ?? {}), value: flag.subtype === "recon" ? number(flag.sourceRange) : 0, total: flag.subtype === "recon" ? number(flag.sourceRange) : 0 };
  system.miscStats.effectiveLimit = { ...(system.miscStats.effectiveLimit ?? {}), value: flag.subtype === "recon" ? number(flag.sourceEffectiveLimit) : 0, total: flag.subtype === "recon" ? number(flag.sourceEffectiveLimit) : 0 };
  system.combat ??= {};
  system.combat.evokerCreation = foundry.utils.deepClone(flag);
  system.combat.cannotDodge = true;
  system.movementTypes ??= {};
  const movement = Math.max(0, number(flag.movement));
  for (const [key, entry] of Object.entries(system.movementTypes)) {
    if (!entry || typeof entry !== "object") continue;
    if (key === "land") {
      entry.enabled = true;
      entry.base = movement;
      entry.total = movement;
      entry.costMultiplier = 1;
      continue;
    }
    if (entry.isExtraMovement) {
      entry.base = movement;
      entry.total = movement;
      entry.costMultiplier = 1;
      continue;
    }
    if (["jump", "swim"].includes(key)) {
      entry.base = Math.floor(movement / 2);
      entry.total = Math.floor(movement / 2);
      entry.costMultiplier = 2;
    }
  }

  /* Minions always count as having Extra Movement: Flight, but do not suffer
   * Flight's -1 Movement. Advanced Mobility still delays its low-Wounds loss. */
  const advancedFlight = Boolean(system.qualityFeatures?.advancedMobility?.types?.includes?.("fly"));
  const flightLossRatio = advancedFlight ? 0.25 : 0.5;
  const currentWounds = Math.max(0, number(system.miscStats?.wounds?.value));
  const maximumWounds = Math.max(0, number(system.miscStats?.wounds?.max));
  const flightAvailable = maximumWounds <= 0 || currentWounds > maximumWounds * flightLossRatio;
  system.movementTypes.fly = {
    ...(system.movementTypes.fly ?? {}),
    enabled: flightAvailable,
    active: flightAvailable,
    base: flightAvailable ? movement : 0,
    total: flightAvailable ? movement : 0,
    costMultiplier: 1,
    isExtraMovement: true,
    flightMovementPenalty: 0,
    disabledByLowHealth: !flightAvailable,
    lostAtWoundRatio: flightLossRatio,
    lostAtWounds: maximumWounds * flightLossRatio,
    disabledReason: flightAvailable
      ? ""
      : (advancedFlight
        ? "Advanced Mobility: Flight is lost at one quarter Wounds or below."
        : "Flight is lost at half Wounds or below.")
  };
}

export async function executeEvokerMinionAction(actor, key, callback) {
  if (!isEvokerCreation(actor, "minion")) return callback();
  const command = actor.system?.combat?.evokerCommand ?? {};
  if (!command.roundSignature || command.roundSignature !== cooldownSignature()) {
    ui.notifications.warn(text("Este Lacaio precisa receber Comandar Lacaio antes de agir.", "This Minion must receive Command Minion before acting."));
    return null;
  }
  if (key !== "move" && command.usedNonMove) {
    ui.notifications.warn(text("Somente Mover pode ser repetido durante o mesmo comando.", "Only Move may be repeated during the same command."));
    return null;
  }
  let source = null;
  if (key === "attack") {
    source = await fromUuid(command.sourceActorUuid ?? "").catch(() => null);
    const sourceState = source?.system?.combat?.evokerCommand?.minionAttackGroup ?? {};
    const sameGroup = sourceState.groupId === command.groupId && sourceState.roundSignature === cooldownSignature();
    const attacksInGroup = sameGroup ? Math.max(0, number(sourceState.count)) : 0;
    if (attacksInGroup >= 1 && sourceState.sourceAttackAlreadySpent) {
      ui.notifications.warn(text("O único Ataque do Invocador nesta rodada já foi consumido.", "The Summoner's single Attack this round has already been spent."));
      return null;
    }
  }
  const result = await callback();
  if (result && key !== "move") {
    await actor.update({ "system.combat.evokerCommand.usedNonMove": true });
    if (key === "attack" && source) {
      const prior = source.system?.combat?.evokerCommand?.minionAttackGroup ?? {};
      const sameGroup = prior.groupId === command.groupId && prior.roundSignature === cooldownSignature();
      const count = (sameGroup ? Math.max(0, number(prior.count)) : 0) + 1;
      const sourceAttackAlreadySpent = sameGroup
        ? Boolean(prior.sourceAttackAlreadySpent)
        : Boolean(source.system?.combat?.hasAttackedThisRound);
      const update = {
        "system.combat.evokerCommand.minionAttackGroup": {
          groupId: command.groupId,
          roundSignature: cooldownSignature(),
          count,
          sourceAttackAlreadySpent,
          sharedAccuracyResult: prior.sharedAccuracyResult ?? (result.accuracyRollResult ? {
            totalSuccesses: number(result.accuracyRollResult.totalSuccesses),
            rolledSuccesses: number(result.accuracyRollResult.rolledSuccesses),
            automaticSuccesses: number(result.accuracyRollResult.automaticSuccesses),
            adjustedDiceResults: foundry.utils.deepClone(result.accuracyRollResult.adjustedDiceResults ?? [])
          } : null)
        }
      };
      if (count >= 2) {
        update["system.combat.hasAttackedThisRound"] = true;
        update["system.combat.attacksMadeThisTurn"] = Math.max(1, number(source.system?.combat?.attacksMadeThisTurn));
      }
      await source.update(update);
    }
  }
  return result;
}

export async function getEvokerMinionAttackOptions(actor) {
  const command = actor.system?.combat?.evokerCommand ?? {};
  if (!command.allMinions) return {};
  const source = await fromUuid(command.sourceActorUuid ?? "").catch(() => null);
  const group = source?.system?.combat?.evokerCommand?.minionAttackGroup ?? {};
  const sameGroup = group.groupId === command.groupId && group.roundSignature === cooldownSignature();
  const currentAccuracy = Math.max(0, number(actor.system?.mainStats?.accuracy?.total));
  return {
    evokerMinionCommand: true,
    accuracyDiceModifier: Math.min(0, Math.max(0, number(command.sharedAccuracyPool)) - currentAccuracy),
    sharedAccuracyResult: sameGroup && group.sharedAccuracyResult
      ? foundry.utils.deepClone(group.sharedAccuracyResult)
      : null
  };
}

export async function useEvokerMinionAid(actor) {
  const flag = actor?.flags?.[SYSTEM_ID]?.evokerCreation;
  if (flag?.subtype === "infantry" && actor.system?.combat?.evokerCommand?.aidBlocked) {
    ui.notifications.warn(text("Lacaios de Infantaria não podem Ajudar.", "Infantry Minions cannot Aid."));
    return null;
  }
  const source = await fromUuid(flag?.sourceActorUuid ?? "").catch(() => null);
  const targetToken = Array.from(game.user?.targets ?? [])[0];
  const target = targetToken?.actor;
  if (!source || !target || target.uuid === actor.uuid || game.user.targets.size !== 1 || !areActorsAlliesForQualities(source, target)) {
    ui.notifications.warn(text("Selecione exatamente um aliado.", "Select exactly one ally."));
    return null;
  }
  /* Aid originates from the Minion's position, but uses the Summoner's Range
   * value as required by Summoner. */
  const token = sourceToken(actor);
  const range = number(source.system?.miscStats?.range?.total ?? source.system?.miscStats?.range?.value);
  if (!token || getTokenGridDistance(token, targetToken) > range) {
    ui.notifications.warn(text("O alvo está fora do Alcance do Invocador.", "The target is outside the Summoner's Range."));
    return null;
  }
  if (!(await spendActorActions(actor, 1))) return null;
  const effects = foundry.utils.deepClone(target.system?.effects?.active ?? []);
  /* The Minion is not a Combatant of its own, so tie expiration to the
   * Summoner's next turn. Otherwise an unused Aid bonus could persist forever. */
  effects.push({ id: foundry.utils.randomID(), tag: "digimonAid", label: `${text("Ajudar", "Aid")} — ${actor.name}`, value: 2, poolStats: ["accuracy", "dodge"], sourceActorUuid: source.uuid, expiresOn: "sourceTurnStart" });
  await target.update({ "system.effects.active": effects });
  return true;
}

export async function requestEvokerProtectorIntercede({ attacker, targetToken } = {}) {
  const target = targetToken?.actor;
  if (!target) return null;
  const candidates = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    const protector = token.actor;
    const flag = protector?.flags?.[SYSTEM_ID]?.evokerCreation;
    if (flag?.kind !== "minion" || flag.subtype !== "protector") continue;
    if (protector.uuid === attacker?.uuid || protector.uuid === target.uuid || !areActorsAlliesForQualities(protector, target)) continue;
    const source = await fromUuid(flag.sourceActorUuid ?? "").catch(() => null);
    if (!source || number(source.system?.combat?.actions?.value) < 1) continue;
    const movement = Math.max(0, number(protector.system?.miscStats?.movement?.total ?? protector.system?.miscStats?.movement?.value));
    const distance = getTokenGridDistance(token, targetToken);
    if (Math.max(0, distance - 1) > movement) continue;
    candidates.push({ protector, token, source, movement, distance });
  }
  if (!candidates.length) return null;
  const result = await chooseCreation(text("Protetor — Interceder", "Protector — Intercede"), `<form><p>${text("Um Lacaio Protetor pode Interceder usando 1 Ação do Invocador e ignorando Terreno Difícil.", "A Protector Minion may Intercede using 1 Summoner Action and ignoring Difficult Terrain.")}</p>
    <label>${text("Protetor", "Protector")}<select name="protector"><option value="">${text("Não Interceder", "Do not Intercede")}</option>${candidates.map((candidate) => `<option value="${candidate.protector.id}">${candidate.protector.name} — ${candidate.source.name}</option>`).join("")}</select></label></form>`,
    (_event, button) => String(button.form?.elements?.protector?.value ?? ""));
  if (!result) return null;
  const candidate = candidates.find((entry) => entry.protector.id === result);
  if (!candidate) return null;

  const size = Math.max(1, number(canvas?.grid?.size, 100));
  const targetX = number(targetToken.document?.x);
  const targetY = number(targetToken.document?.y);
  const targetWidth = Math.max(1, number(targetToken.document?.width, 1));
  const targetHeight = Math.max(1, number(targetToken.document?.height, 1));
  const protectorWidth = Math.max(1, number(candidate.token.document?.width, 1));
  const protectorHeight = Math.max(1, number(candidate.token.document?.height, 1));
  const leftX = targetX - (protectorWidth * size);
  const rightX = targetX + (targetWidth * size);
  const aboveY = targetY - (protectorHeight * size);
  const belowY = targetY + (targetHeight * size);
  const ignoredProtectorIds = new Set([String(candidate.protector.id)]);
  const around = [
    { x: rightX, y: targetY },
    { x: leftX, y: targetY },
    { x: targetX, y: belowY },
    { x: targetX, y: aboveY },
    { x: rightX, y: belowY },
    { x: leftX, y: belowY },
    { x: rightX, y: aboveY },
    { x: leftX, y: aboveY }
  ]
    .filter((point) => !occupiedAt(
      point,
      protectorWidth,
      protectorHeight,
      { ignoredActorIds: ignoredProtectorIds }
    ));
  const destination = around.sort((left, right) => {
    const current = { x: number(candidate.token.document?.x), y: number(candidate.token.document?.y) };
    return Math.hypot(left.x - current.x, left.y - current.y) - Math.hypot(right.x - current.x, right.y - current.y);
  })[0];
  if (!destination) {
    ui.notifications.warn(text(
      "O Protetor não encontrou um espaço desocupado adjacente ao alvo.",
      "The Protector could not find an unoccupied space adjacent to the target."
    ));
    return null;
  }
  if (!(await spendActorActions(candidate.source, 1, { requireActiveUnit: false }))) return null;
  await trackProtectorTrueGuardianRefund(candidate.source, 1);
  await candidate.token.document.update(destination, withDDAMovementContext(
    { animate: true, ddaEvokerProtectorIntercede: true },
    {
      mode: "automated", movementBudget: "none", voluntary: true, reactions: true,
      traversal: true, source: "evokerProtectorIntercede", unwilling: false
    }
  ));
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: candidate.protector }), content: `<div class="dda-chat-card"><h2>${text("Protetor — Interceder", "Protector — Intercede")}</h2><p><strong>${candidate.protector.name}</strong> ${text("recebe o Ataque no lugar do aliado; 1 Ação foi gasta de", "takes the Attack for the ally; 1 Action was spent from")} <strong>${candidate.source.name}</strong>.</p></div>` });
  return {
    id: foundry.utils.randomID(),
    actorUuid: candidate.protector.uuid,
    actorName: candidate.protector.name,
    tokenId: candidate.token.id,
    sceneId: canvas.scene?.id ?? "",
    intercedeArmorBonus: 0,
    evokerProtector: true,
    actionCost: 1,
    payerActorUuid: candidate.source.uuid
  };
}

async function resolveVolatileExplosion(actor) {
  const attack = actor.items.find((item) => item.type === "attack" && item.flags?.[SYSTEM_ID]?.volatileExplosion);
  if (!attack) {
    await deleteCreation(actor, { refund: true });
    return;
  }
  const { rollAttack } = await import("../rolls/attack-roll.js");
  const result = await rollAttack(actor, attack, { actionCostOverride: 0, evokerMinionCommand: true, ignoreAttackPerRoundLimit: true, skipAttackUseTracking: true });
  if (result !== undefined) await deleteCreation(actor, { refund: true });
}

function responsibleUser(actor) {
  const active = (game.users?.contents ?? []).filter((user) => user.active);
  return active.find((user) => !user.isGM && actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    ?? active.find((user) => user.isGM) ?? null;
}

function validateSocketPlacement(source, scene, pointOrPoints, spec) {
  const grid = Math.max(1, number(scene?.grid?.size ?? canvas?.grid?.size, 100));
  const sourceTokenDocument = scene?.tokens?.find((token) => token.actorId === source.id);
  if (!sourceTokenDocument) return false;
  const sourceCenter = {
    x: number(sourceTokenDocument.x) + Math.max(1, number(sourceTokenDocument.width, 1)) * grid / 2,
    y: number(sourceTokenDocument.y) + Math.max(1, number(sourceTokenDocument.height, 1)) * grid / 2
  };
  const range = Math.max(0, number(source.system?.miscStats?.range?.total ?? source.system?.miscStats?.range?.value));
  const width = Math.max(1, number(spec?.width, tokenSize(spec?.size)));
  const height = Math.max(1, number(spec?.height, width));
  const requestedFoundationIds = new Set([
    ...(Array.isArray(spec?.foundationActorIds) ? spec.foundationActorIds : []),
    ...(Array.isArray(spec?.foundationActorUuids) ? spec.foundationActorUuids : [])
  ].map((value) => String(value ?? "").trim()).filter(Boolean));
  const foundationActors = (game.actors?.contents ?? []).filter((actor) => {
    const flag = actor?.flags?.[SYSTEM_ID]?.evokerCreation;
    if (flag?.kind !== "structure" || !["platform", "walls"].includes(flag.subtype) || flag.sourceActorUuid !== source.uuid) return false;
    return requestedFoundationIds.has(String(actor.id)) || requestedFoundationIds.has(String(actor.uuid));
  });
  if (requestedFoundationIds.size) {
    if (spec?.kind !== "structure" || spec?.subtype !== "walls") return false;
    if ([...requestedFoundationIds].some((id) => !foundationActors.some((actor) => (
      id === String(actor.id) || id === String(actor.uuid)
    )))) return false;
  }
  const foundationActorIds = new Set(foundationActors.map((actor) => String(actor.id)));
  const foundationRectangles = scene.tokens
    .filter((token) => foundationActorIds.has(String(token.actorId)))
    .map((token) => ({
      left: number(token.x),
      top: number(token.y),
      right: number(token.x) + Math.max(1, number(token.width, 1)) * grid,
      bottom: number(token.y) + Math.max(1, number(token.height, 1)) * grid
    }));
  const points = (Array.isArray(pointOrPoints) ? pointOrPoints : [pointOrPoints])
    .filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
  if (!points.length || points.length > 4) return false;
  const rectangles = points.map((point) => ({
    left: number(point.x),
    top: number(point.y),
    right: number(point.x) + width * grid,
    bottom: number(point.y) + height * grid
  }));
  for (const [index, rectangle] of rectangles.entries()) {
    const candidateCenter = {
      x: rectangle.left + ((rectangle.right - rectangle.left) / 2),
      y: rectangle.top + ((rectangle.bottom - rectangle.top) / 2)
    };
    const distance = measureGridPointDistanceSpaces(sourceCenter, candidateCenter);
    if (distance > range) return false;
    if (rectangles.some((other, otherIndex) => otherIndex !== index && (
      rectangle.left < other.right && rectangle.right > other.left &&
      rectangle.top < other.bottom && rectangle.bottom > other.top
    ))) return false;
    if (requestedFoundationIds.size && !foundationRectangles.some((foundation) => (
      rectangle.left < foundation.right && rectangle.right > foundation.left &&
      rectangle.top < foundation.bottom && rectangle.bottom > foundation.top
    ))) return false;
    if (scene.tokens.some((token) => {
      if (foundationActorIds.has(String(token.actorId))) return false;
      const tokenLeft = number(token.x);
      const tokenTop = number(token.y);
      const tokenRight = tokenLeft + Math.max(1, number(token.width, 1)) * grid;
      const tokenBottom = tokenTop + Math.max(1, number(token.height, 1)) * grid;
      return rectangle.left < tokenRight && rectangle.right > tokenLeft &&
        rectangle.top < tokenBottom && rectangle.bottom > tokenTop;
    })) return false;
  }
  if (["walls", "terrain"].includes(spec?.subtype) && points.length > 1) {
    const connected = new Set([0]);
    for (let pass = 0; pass < points.length; pass += 1) {
      for (const [index, point] of points.entries()) {
        if (connected.has(index)) continue;
        if ([...connected].some((otherIndex) => {
          const other = points[otherIndex];
          const dx = Math.abs(number(point.x) - number(other.x));
          const dy = Math.abs(number(point.y) - number(other.y));
          return (dx === grid && dy === 0) || (dy === grid && dx === 0);
        })) connected.add(index);
      }
    }
    if (connected.size !== points.length) return false;
  }
  return true;
}

async function handleEvokerSocket(message = {}) {
  if (message.scope !== SOCKET_SCOPE) return;
  if (message.type === "response" && message.targetUserId === game.user.id) {
    const pending = pendingSocketRequests.get(message.requestId);
    if (!pending) return;
    globalThis.clearTimeout(pending.timeout);
    pendingSocketRequests.delete(message.requestId);
    pending.resolve(message.result ?? null);
    return;
  }
  if (message.type !== "request" || !game.user.isGM || message.targetGmId !== game.user.id || primaryActiveGm()?.id !== game.user.id) return;

  const requestingUser = game.users?.get(message.requestingUserId);
  const payload = message.payload ?? {};
  let result = { ok: false, reason: "invalidRequest" };
  try {
    if (message.operation === "create") {
      const source = await fromUuid(payload.sourceActorUuid ?? "").catch(() => null);
      const scene = game.scenes?.get(payload.sceneId);
      const kind = String(payload.spec?.kind ?? "");
      const ownsRequiredQuality = kind === "structure"
        ? Boolean(findQuality(source, ["conjurador", "conjurer"]))
        : kind === "minion"
          ? Boolean(findQuality(source, ["invocador", "summoner"]))
          : false;
      if (
        source && scene &&
        userControlsActor(requestingUser, source) &&
        ownsRequiredQuality &&
        game.combat?.started &&
        validateSocketPlacement(source, scene, payload.points, payload.spec)
      ) {
        const created = await createEvokerActorLocal(
          source,
          foundry.utils.deepClone(payload.spec ?? {}),
          foundry.utils.deepClone(payload.points ?? []),
          foundry.utils.deepClone(payload.items ?? []),
          scene
        );
        result = created ? { ok: true, actorUuid: created.uuid, actorId: created.id } : { ok: false, reason: "createFailed" };
      }
    } else if (message.operation === "delete") {
      const created = await fromUuid(payload.creationUuid ?? "").catch(() => null);
      const flag = created?.flags?.[SYSTEM_ID]?.evokerCreation;
      const source = flag?.sourceActorUuid ? await fromUuid(flag.sourceActorUuid).catch(() => null) : null;
      if (created && flag && userControlsActor(requestingUser, source ?? created)) {
        await deleteCreationLocal(created, {
          refund: Boolean(payload.refund),
          cascade: payload.cascade !== false
        });
        result = { ok: true };
      }
    }
  } catch (error) {
    console.warn("DDA | Evoker GM socket operation failed.", error);
    result = { ok: false, reason: "exception" };
  }
  game.socket.emit(SOCKET_CHANNEL, {
    scope: SOCKET_SCOPE,
    type: "response",
    requestId: message.requestId,
    targetUserId: message.requestingUserId,
    result
  });
}

export function registerEvokerQualities() {
  game.socket?.on(SOCKET_CHANNEL, handleEvokerSocket);
  Hooks.on("updateActor", async (actor) => {
    const flag = actor.flags?.[SYSTEM_ID]?.evokerCreation;
    if (flag && !flag.deleting && number(actor.system?.miscStats?.wounds?.value, 1) <= 0 && responsibleUser(actor)?.id === game.user.id) {
      if (flag.kind === "minion" && flag.subtype === "volatile") {
        if (flag.explosionPending) return;
        await actor.update({ [`${CREATION_FLAG}.explosionPending`]: true });
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="dda-chat-card dda-volatile-card"><h2>${text("Explosão Volátil", "Volatile Explosion")}</h2><p>${text("O Lacaio chegou a 0 Caixas de Ferimento e deve realizar seu Ataque gratuito.", "The Minion reached 0 Wound Boxes and must make its free Attack.")}</p><button type="button" data-evoker-volatile="${actor.uuid}">${text("Resolver Explosão", "Resolve Explosion")}</button></div>` });
      } else {
        await deleteCreation(actor, { refund: true });
      }
      return;
    }
    if (!flag && responsibleUser(actor)?.id === game.user.id) {
      const defeated = number(actor.system?.miscStats?.wounds?.value, 1) <= 0;
      const hasConjurer = Boolean(findQuality(actor, ["conjurador", "conjurer"]));
      const hasSummoner = Boolean(findQuality(actor, ["invocador", "summoner"]));
      if (defeated || !hasConjurer) await clearCreations(actor, "structure");
      if (defeated || !hasSummoner) await clearCreations(actor, "minion");
    }
  });
  Hooks.on("deleteActor", async (actor) => {
    if (actor.flags?.[SYSTEM_ID]?.evokerCreation) return;
    if (responsibleUser(actor)?.id !== game.user.id) return;
    await clearCreations(actor, "structure");
    await clearCreations(actor, "minion");
  });
  Hooks.on("deleteItem", async (item) => {
    const actor = item.parent;
    if (!actor || actor.flags?.[SYSTEM_ID]?.evokerCreation || responsibleUser(actor)?.id !== game.user.id) return;
    const id = identity(item.system?.sourceId ?? item.name);
    if (["conjurador", "conjurer"].includes(id)) await clearCreations(actor, "structure");
    if (["invocador", "summoner"].includes(id)) await clearCreations(actor, "minion");
  });
  Hooks.on("renderChatMessageHTML", (_message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    root?.querySelectorAll?.("[data-evoker-volatile]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      const actor = await fromUuid(button.dataset.evokerVolatile).catch(() => null);
      if (actor) await resolveVolatileExplosion(actor);
    }));
  });
}
