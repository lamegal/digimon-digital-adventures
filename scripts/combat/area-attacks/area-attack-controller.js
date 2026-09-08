import { withDDAMovementContext } from "../../canvas/movement-context.js";
import {
  areActorsAllies,
  EFFECT_TAGS,
  getQualityRank,
  normalizeKey
} from "../../rules/quality-automation.js";

import {
  applyDamage,
  claimAttackDamageApplication,
  finalizeAttackDamageApplication,
  isAttackDamageApplicationInFlight,
  resolveAttackDamagePostProcessing
} from "../../rolls/damage-application.js";

import {
  maybeOfferHeroicExemplarAfterHit
} from "../../rules/tamer-talent-special-orders.js";

import {
  requestAreaIntercede
} from "../intercede.js";

import { getTokenGridDistance } from "../positioning.js";

const AREA_TAGS_IMPLEMENTED = new Set([
  "t:blast",
  "t:burst",
  "t:cone",
  "t:line",
  "t:pass",
  "t:wave"
]);

const AREA_PREVIEW_FLAG = "areaAttackPreview";
const AREA_REQUEST_FLAG = "areaAttackRequest";
const AREA_DAMAGE_SUMMARY_FLAG = "areaAttackDamageSummary";
export const MOBILE_ARTILLERY_TERRAIN_FLAG = "mobileArtilleryTerrain";

const text = (pt, en) => String(game.i18n?.lang ?? "")
  .toLowerCase()
  .startsWith("en")
  ? en
  : pt;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeAreaTag(value = "") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith("t:") ? raw : `t:${raw}`;
}

function getGridSize() {
  return Math.max(
    1,
    Number(canvas?.grid?.size ?? canvas?.dimensions?.size ?? 100)
  );
}

function getGridDistance() {
  return Math.max(
    0.0001,
    Number(canvas?.scene?.grid?.distance ?? canvas?.dimensions?.distance ?? 1)
  );
}

function pixelsToSpaces(pixels = 0) {
  return Number(pixels ?? 0) / getGridSize();
}

function getTokenCenter(token) {
  if (!token) return { x: 0, y: 0 };

  return token.center ?? {
    x: Number(token.x ?? 0) + Number(token.w ?? getGridSize()) / 2,
    y: Number(token.y ?? 0) + Number(token.h ?? getGridSize()) / 2
  };
}

function getActorDerivedStat(actor, statKey = "") {
  const key = String(statKey ?? "").trim().toLowerCase();
  const stat = actor?.system?.derivedStats?.[key];
  const value = Number(stat?.total ?? stat?.value ?? stat?.base ?? 0);
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function getSelectedChoiceKeys(item) {
  const choices = item?.system?.choices ?? {};
  const values = [];

  const append = (candidate) => {
    if (candidate === null || candidate === undefined) return;

    if (Array.isArray(candidate)) {
      for (const entry of candidate) append(entry);
      return;
    }

    if (typeof candidate === "object") {
      append(candidate.key ?? candidate.value ?? candidate.id ?? candidate.name);
      return;
    }

    const normalized = normalizeKey(candidate);
    if (normalized) values.push(normalized);
  };

  append(choices.selected);
  append(choices.selectedRanks);
  append(choices.value);
  append(choices.current);

  return [...new Set(values)];
}

function actorHasSelectedChoice(actor, choiceKey = "") {
  const expected = normalizeKey(choiceKey);
  if (!expected) return false;

  return Boolean(actor?.items?.some?.((item) => {
    return getSelectedChoiceKeys(item).includes(expected);
  }));
}

function hasTrueGuardian(actor) {
  return Boolean(
    actor?.system?.qualityFeatures?.dataSpecialization?.trueGuardian ||
    actorHasSelectedChoice(actor, "trueGuardian")
  );
}

function hasMobileArtillery(actor, attackItem, qualityAttackModifier = {}) {
  const rangeType = String(attackItem?.system?.baseTags?.rangeType ?? "")
    .trim()
    .toLowerCase();
  const functionType = String(attackItem?.system?.baseTags?.functionType ?? "")
    .trim()
    .toLowerCase();

  return Boolean(
    ["range", "ranged"].includes(rangeType) &&
    functionType === "damage" &&
    (
      qualityAttackModifier?.mobileArtillery ||
      actor?.system?.qualityFeatures?.dataSpecialization?.mobileArtillery ||
      actorHasSelectedChoice(actor, "mobileArtillery")
    )
  );
}

function normalizeElement(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function elementLabel(element = "") {
  const key = normalizeElement(element);
  const labels = {
    fire: ["Fogo", "Fire"],
    water: ["Água", "Water"],
    wind: ["Vento", "Wind"],
    earth: ["Terra", "Earth"],
    ice: ["Gelo", "Ice"],
    wood: ["Madeira", "Wood"],
    steel: ["Aço", "Steel"],
    thunder: ["Trovão", "Thunder"],
    darkness: ["Trevas", "Darkness"],
    light: ["Luz", "Light"]
  };
  const pair = labels[key];
  return pair ? text(pair[0], pair[1]) : String(element ?? "");
}

function getNaturewalkElements(actor) {
  const prepared = actor?.system?.qualityFeatures?.naturewalk?.elements ?? [];
  const values = Array.isArray(prepared) ? prepared : [];
  const inheritedTerrain = actor?.flags?.["digimon-digital-adventures"]
    ?.evokerCreation?.naturewalkTerrainElements ?? [];
  const fallback = actor?.items?.flatMap?.((item) => {
    if (item?.type !== "quality") return [];
    const id = normalizeKey(item?.system?.sourceId ?? item?.name ?? "");
    if (!["passonatural", "naturewalk"].includes(id)) return [];
    return getSelectedChoiceKeys(item);
  }) ?? [];

  const entries = [
    ...values.map((value) => ({ key: value, label: elementLabel(value) })),
    ...fallback.map((value) => ({ key: value, label: elementLabel(value) })),
    ...inheritedTerrain.map((entry) => ({
      key: entry?.key ?? entry,
      label: String(entry?.label ?? elementLabel(entry?.key ?? entry))
    }))
  ];
  const unique = new Map();
  for (const entry of entries) {
    const key = normalizeElement(entry.key);
    if (key && !unique.has(key)) unique.set(key, { key, label: entry.label || elementLabel(key) });
  }
  return [...unique.values()];
}

async function promptMobileArtilleryTerrain({ attacker, attackItem } = {}) {
  if (!game.combat?.started) {
    ui.notifications.info(text(
      "Artilharia Móvel cria Terreno Difícil até o próximo turno apenas durante um Combate ativo.",
      "Mobile Artillery creates Difficult Terrain until the next turn only during an active Combat."
    ));
    return null;
  }

  const elements = getNaturewalkElements(attacker);
  if (!elements.length) return null;

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-area-attack-dialog", "dda-mobile-artillery-dialog"],
    position: { width: 520, height: "auto" },
    window: {
      title: text("Artilharia Móvel", "Mobile Artillery")
    },
    modal: true,
    content: `
      <form class="dda-area-dialog dda-mobile-artillery-form">
        <h2>${text("Criar Terreno Difícil", "Create Difficult Terrain")}</h2>
        <p>${text(
          "Gaste 1 Ação adicional para transformar toda a área do Ataque em Terreno Difícil até o início do próximo turno do atacante.",
          "Spend 1 additional Action to turn the entire Attack area into Difficult Terrain until the start of the attacker’s next turn."
        )}</p>
        <div class="form-group">
          <label>${text("Elemento", "Element")}</label>
          <select name="element">
            ${elements.map((entry) => `<option value="${escapeHtml(entry.key)}">${escapeHtml(entry.label)}</option>`).join("")}
          </select>
          <p class="hint">${text(
            "Digimon com Passo Natural do mesmo Elemento ignoram o custo de Ação de Terreno Difícil.",
            "Digimon with Naturewalk of the same Element ignore the Difficult Terrain Action cost."
          )}</p>
        </div>
        <div class="form-group">
          <label>${text("Camada", "Layer")}</label>
          <select name="layer">
            <option value="surface">${text("Superfície", "Surface")}</option>
            <option value="aerial">${text("Aérea", "Aerial")}</option>
          </select>
          <p class="hint">${text(
            "O rastreador usa o Tipo de Movimento atual: Terrestre/Escalar/Escavar interagem com Superfície; Voo/Salto/Nado interagem com a camada Aérea.",
            "The tracker uses the current Movement Type: Land/Climb/Dig interact with Surface; Flight/Jump/Swim interact with the Aerial layer."
          )}</p>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "activate",
        label: text("Ativar (+1 Ação)", "Activate (+1 Action)"),
        icon: "fa-solid fa-map",
        default: true,
        callback: (_event, button) => ({
          element: String(button.form?.elements?.element?.value ?? "").trim(),
          layer: String(button.form?.elements?.layer?.value ?? "surface").trim()
        })
      },
      {
        action: "skip",
        label: text("Não ativar", "Do not activate"),
        icon: "fa-solid fa-forward",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  if (!result?.element) return null;
  return {
    active: true,
    element: normalizeElement(result.element),
    elementLabel: elementLabel(result.element),
    layer: result.layer === "aerial" ? "aerial" : "surface",
    extraActionCost: 1
  };
}

async function persistMobileArtilleryTerrain(templateDocument, terrain, {
  attacker,
  requestId
} = {}) {
  if (!templateDocument || !terrain?.active || !game.combat?.started) return false;

  const terrainColors = {
    fire: "#e05a2d",
    water: "#2d78d4",
    wind: "#62bfc9",
    earth: "#9b6c3d",
    ice: "#85d9e8",
    wood: "#4e9656",
    steel: "#899ba8",
    thunder: "#d7bd32",
    darkness: "#61488e",
    light: "#ddcf83"
  };
  const terrainColor = terrainColors[normalizeElement(terrain.element)] ?? "#2388bd";

  try {
    await templateDocument.update({
      borderColor: terrainColor,
      fillColor: terrainColor
    });
  } catch (error) {
    console.warn("DDA | Could not recolor the Mobile Artillery terrain template.", error);
  }
  const combatant = game.combat.combatants?.find?.((entry) => {
    return entry.actor?.uuid === attacker?.uuid || entry.actorId === attacker?.id;
  }) ?? null;

  await templateDocument.setFlag(game.system.id, MOBILE_ARTILLERY_TERRAIN_FLAG, {
    active: true,
    requestId: String(requestId ?? ""),
    attackerActorUuid: String(attacker?.uuid ?? ""),
    attackerCombatantId: String(combatant?.id ?? ""),
    combatId: String(game.combat.id ?? ""),
    createdRound: Number(game.combat.round ?? 0),
    createdTurn: Number(game.combat.turn ?? 0),
    element: terrain.element,
    elementLabel: terrain.elementLabel,
    layer: terrain.layer,
    expires: "startOfAttackerNextTurn"
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-mobile-artillery-card">
        <h2>${text("Artilharia Móvel", "Mobile Artillery")}</h2>
        <p>${text(
          `A área permanece como <strong>Terreno Difícil de ${escapeHtml(terrain.elementLabel)}</strong> (${terrain.layer === "aerial" ? "Aéreo" : "Superfície"}) até o início do próximo turno de <strong>${escapeHtml(attacker?.name ?? "")}</strong>.`,
          `The area remains <strong>${escapeHtml(terrain.elementLabel)} Difficult Terrain</strong> (${terrain.layer === "aerial" ? "Aerial" : "Surface"}) until the start of <strong>${escapeHtml(attacker?.name ?? "")}</strong>’s next turn.`
        )}</p>
      </div>
    `,
    flags: {
      [game.system.id]: {
        mobileArtilleryTerrain: {
          requestId: String(requestId ?? ""),
          templateId: String(templateDocument.id ?? ""),
          ...terrain
        }
      }
    }
  });

  return true;
}

async function deleteMobileArtilleryTemplates(predicate = () => false) {
  if (!game.user?.isGM) return;

  for (const scene of game.scenes?.contents ?? []) {
    const ids = (scene.templates?.contents ?? [])
      .filter((document) => {
        const flag = document.getFlag?.(game.system.id, MOBILE_ARTILLERY_TERRAIN_FLAG);
        return flag?.active && predicate(flag, document);
      })
      .map((document) => document.id)
      .filter(Boolean);

    if (ids.length) {
      await scene.deleteEmbeddedDocuments("MeasuredTemplate", ids);
    }
  }
}

export function registerAreaAttackTerrainHooks() {
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!game.user?.isGM || !combat?.started) return;
    if (!("turn" in changed) && !("round" in changed)) return;

    const active = combat.combatant;
    if (!active) return;

    await deleteMobileArtilleryTemplates((flag) => {
      if (String(flag.combatId ?? "") !== String(combat.id ?? "")) return false;
      const sameAttacker = String(flag.attackerCombatantId ?? "")
        ? String(flag.attackerCombatantId) === String(active.id ?? "")
        : String(flag.attackerActorUuid ?? "") === String(active.actor?.uuid ?? "");
      if (!sameAttacker) return false;

      const createdRound = Number(flag.createdRound ?? 0);
      const createdTurn = Number(flag.createdTurn ?? -1);
      const currentRound = Number(combat.round ?? 0);
      const currentTurn = Number(combat.turn ?? -1);
      return currentRound > createdRound || (
        currentRound === createdRound && currentTurn > createdTurn
      );
    });
  });

  Hooks.on("deleteCombat", async (combat) => {
    await deleteMobileArtilleryTemplates((flag) => {
      return String(flag.combatId ?? "") === String(combat?.id ?? "");
    });
  });
}

function getAreaOrigin(templateData = {}, attackerToken = null) {
  const fallback = getTokenCenter(attackerToken);
  return {
    x: Number(templateData?.x ?? fallback.x),
    y: Number(templateData?.y ?? fallback.y)
  };
}

function tokenIsBehindGuardian(targetToken, guardianToken, origin) {
  if (!targetToken || !guardianToken) return false;

  const target = getTokenCenter(targetToken);
  const guardian = getTokenCenter(guardianToken);
  const gx = guardian.x - origin.x;
  const gy = guardian.y - origin.y;
  const tx = target.x - origin.x;
  const ty = target.y - origin.y;
  const guardianDistance = Math.hypot(gx, gy);
  const targetDistance = Math.hypot(tx, ty);

  if (guardianDistance < 1 || targetDistance <= guardianDistance) return false;

  const ux = gx / guardianDistance;
  const uy = gy / guardianDistance;
  const projection = (tx * ux) + (ty * uy);
  if (projection <= guardianDistance) return false;

  const lateralDistance = Math.abs((tx * uy) - (ty * ux));
  const guardianWidth = Math.max(
    getGridSize(),
    Number(guardianToken.w ?? guardianToken.document?.width * getGridSize() ?? 0),
    Number(guardianToken.h ?? guardianToken.document?.height * getGridSize() ?? 0)
  );
  const targetWidth = Math.max(
    getGridSize(),
    Number(targetToken.w ?? targetToken.document?.width * getGridSize() ?? 0),
    Number(targetToken.h ?? targetToken.document?.height * getGridSize() ?? 0)
  );
  const protectionCorridor = Math.max(
    getGridSize() * 0.75,
    (guardianWidth + targetWidth) / 2
  );

  return lateralDistance <= protectionCorridor;
}

function getTrueGuardianProtection({
  attacker,
  attackerToken,
  targetToken,
  selectedTargets = [],
  templateData = {}
} = {}) {
  if (!targetToken?.actor) return null;
  const origin = getAreaOrigin(templateData, attackerToken);

  const candidates = selectedTargets.filter((token) => {
    if (!token?.actor || token.id === targetToken.id) return false;
    if (!hasTrueGuardian(token.actor)) return false;
    if (!areActorsAllies(token.actor, targetToken.actor)) return false;
    if (areActorsAllies(attacker, token.actor)) return false;
    return tokenIsBehindGuardian(targetToken, token, origin);
  });

  if (!candidates.length) return null;

  const guardianToken = candidates.sort((left, right) => {
    return getActorDerivedStat(right.actor, "cpu") - getActorDerivedStat(left.actor, "cpu");
  })[0];
  const armorBonus = getActorDerivedStat(guardianToken.actor, "cpu");

  return {
    active: true,
    guardianActorUuid: String(guardianToken.actor?.uuid ?? ""),
    guardianTokenId: String(guardianToken.id ?? ""),
    guardianName: String(guardianToken.name ?? guardianToken.actor?.name ?? ""),
    armorBonus,
    negateEffects: true
  };
}

function hasIndiscriminateTargeting(actor) {
  return Boolean(actor?.items?.some?.((item) => {
    if (item.type !== "quality") return false;

    const id = normalizeKey(
      item.system?.qualityId ??
      item.system?.id ??
      item.name ??
      ""
    );

    if ([
      "miraindiscriminada",
      "indiscriminatetargetting",
      "indiscriminatetargeting"
    ].includes(id)) {
      return true;
    }

    return Boolean(
      item.system?.grants?.areaAttacksTargetAllPotentialTargetsExceptAttacker
    );
  }));
}

function getWideSwingsBonus(attacker) {
  let bonus = 0;

  for (const quality of attacker?.items ?? []) {
    if (quality.type !== "quality") continue;

    const modifier = quality.system?.attackModifier ?? {};
    const selectedModes = new Set([
      normalizeKey(modifier.reachMode ?? ""),
      ...getSelectedChoiceKeys(quality)
    ]);

    if (!selectedModes.has("wideswings")) continue;

    bonus = Math.max(
      bonus,
      Math.max(
        0,
        Number(getQualityRank(quality) ?? quality.system?.rank?.value ?? 0)
      )
    );
  }

  return bonus;
}

function meleeAreaCanUseMaximum(attacker) {
  return Boolean(
    attacker?.system?.qualityFeatures?.dataSpecialization?.fistfulOfForce ||
    actorHasSelectedChoice(attacker, "fistfulOfForce")
  );
}

function getAreaSizeBounds({
  attacker,
  attackItem,
  tag,
  qualityAttackModifier
} = {}) {
  const normalizedTag = normalizeAreaTag(tag);
  const rangeType = String(attackItem?.system?.baseTags?.rangeType ?? "")
    .trim()
    .toLowerCase();
  const isRanged = ["range", "ranged"].includes(rangeType);
  const isMelee = rangeType === "melee";
  const isSignature = Boolean(attackItem?.system?.isSignature);

  if (normalizedTag === "t:blast" && !isRanged) return null;
  if (normalizedTag === "t:pass" && !isMelee) return null;

  const bit = getActorDerivedStat(attacker, "bit");
  const cpu = getActorDerivedStat(attacker, "cpu");
  const ram = getActorDerivedStat(attacker, "ram");
  const dos = getActorDerivedStat(attacker, "dos");
  const movement = Math.max(
    0,
    Number(
      attacker?.system?.miscStats?.movement?.total ??
      attacker?.system?.miscStats?.movement?.value ??
      attacker?.system?.movementTypes?.land?.total ??
      0
    )
  );

  const attackTags = new Set([
    ...(attackItem?.system?.qualityTags ?? []),
    ...(attackItem?.system?.tags ?? []),
    ...(attackItem?.system?.baseTags?.tags ?? [])
  ].map((entry) => String(entry ?? "").replace(/^\[|\]$/g, "").toLowerCase()));

  const definitions = {
    "t:blast": {
      base: 1,
      maximum: 1 + Math.floor(bit / 2),
      shape: "circle"
    },
    "t:burst": {
      base: 1,
      maximum: 1 + Math.floor(dos / 2),
      shape: "circle"
    },
    "t:cone": {
      base: 3,
      maximum: 3 + bit,
      shape: "cone"
    },
    "t:line": {
      base: 3,
      maximum: 3 + (2 * cpu),
      shape: "ray"
    },
    "t:pass": {
      base: Math.max(1, ram),
      maximum: Math.max(1, ram + (attackTags.has("charge") ? movement : 0)),
      shape: "ray"
    },
    "t:wave": {
      base: 2,
      maximum: 2 + dos,
      shape: "rect"
    }
  };

  const definition = definitions[normalizedTag] ?? null;
  if (!definition) return null;

  let base = definition.base + (isSignature ? 1 : 0);
  let maximum = definition.maximum;

  if (isMelee) {
    if (!["t:line", "t:pass"].includes(normalizedTag)) {
      base += getWideSwingsBonus(attacker);
    }

    if (
      !meleeAreaCanUseMaximum(attacker) &&
      normalizedTag !== "t:pass"
    ) {
      maximum = base;
    }
  }

  if (Number(qualityAttackModifier?.recoilDistance ?? 0) > 0) {
    maximum = Math.max(base, Math.floor(maximum / 2));
  }

  maximum = Math.max(base, maximum);

  return {
    ...definition,
    base: Math.max(1, Math.floor(base)),
    maximum: Math.max(1, Math.floor(maximum)),
    rangeType,
    isRanged,
    isMelee
  };
}

function getZonerChoice(qualityAttackModifier = {}) {
  return normalizeKey(qualityAttackModifier?.zonerOptions?.[0] ?? "");
}

function canChooseAllTargets(attackItem, qualityAttackModifier = {}) {
  const functionType = String(
    attackItem?.system?.baseTags?.functionType ?? "damage"
  ).trim().toLowerCase();
  const zonerChoice = getZonerChoice(qualityAttackModifier);

  if (functionType === "damage") return zonerChoice === "bombardment";
  if (functionType === "support") {
    return ["firewallbypass", "friendlyfire"].includes(zonerChoice);
  }
  return false;
}

async function promptAreaMode({ attackItem, areaTags } = {}) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const implemented = [...new Set(
    areaTags
      .map(normalizeAreaTag)
      .filter((tag) => AREA_TAGS_IMPLEMENTED.has(tag))
  )];
  const deferred = [...new Set(
    areaTags
      .map(normalizeAreaTag)
      .filter((tag) => tag && !AREA_TAGS_IMPLEMENTED.has(tag))
  )];

  if (!implemented.length) {
    if (deferred.length) {
      ui.notifications.info(text(
        `${attackItem.name} possui ${deferred.map((tag) => `[${tag.toUpperCase()}]`).join(", ")}, mas esse formato ainda usa a resolução manual existente.`,
        `${attackItem.name} has ${deferred.map((tag) => `[${tag.toUpperCase()}]`).join(", ")}, but that shape still uses the existing manual resolution.`
      ));
    }

    return { mode: "deferred" };
  }

  const options = implemented.map((tag) => {
    return `<option value="${escapeHtml(tag)}">[${escapeHtml(tag.toUpperCase())}]</option>`;
  }).join("");

  return DialogV2.wait({
    classes: ["dda", "dda-area-attack-dialog"],
    position: { width: 460 },
    window: {
      title: text("Declarar Ataque", "Declare Attack")
    },
    modal: true,
    content: `
      <div class="dda-roll-dialog dda-area-dialog dda-area-dialog--mode">
        <p><strong>${escapeHtml(attackItem.name)}</strong></p>
        <p>${text(
          "Este Ataque pode ser usado normalmente ou como Ataque em Área.",
          "This Attack can be used normally or as an Area Attack."
        )}</p>
        <div class="form-group">
          <label>${text("Formato", "Shape")}</label>
          <select name="areaTag">${options}</select>
        </div>
        ${deferred.length ? `
          <p class="hint">
            ${text("Ainda manuais", "Still manual")}:
            ${deferred.map((tag) => `[${tag.toUpperCase()}]`).join(", ")}
          </p>
        ` : ""}
      </div>
    `,
    buttons: [
      {
        action: "regular",
        label: text("Ataque normal", "Regular Attack"),
        icon: "fa-solid fa-crosshairs",
        callback: () => ({ mode: "regular" })
      },
      {
        action: "area",
        label: text("Ataque em Área", "Area Attack"),
        icon: "fa-solid fa-bullseye",
        default: true,
        callback: (_event, button) => ({
          mode: "area",
          tag: button.form.elements.areaTag.value
        })
      },
      {
        action: "cancel",
        label: text("Cancelar", "Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });
}

async function promptAreaConfiguration({
  attacker,
  attackItem,
  tag,
  bounds,
  qualityAttackModifier
} = {}) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const forcedAll = hasIndiscriminateTargeting(attacker);
  const attackFunction = String(
    attackItem?.system?.baseTags?.functionType ?? "damage"
  ).trim().toLowerCase();
  const defaultMode = attackFunction === "support" ? "allies" : "enemies";
  const canTargetAll = forcedAll || canChooseAllTargets(
    attackItem,
    qualityAttackModifier
  );

  const targetModeOptions = forcedAll
    ? `<option value="all" selected>${text("Todos (obrigatório)", "Everyone (required)")}</option>`
    : `
      <option value="enemies" ${defaultMode === "enemies" ? "selected" : ""}>
        ${text("Somente inimigos", "Enemies only")}
      </option>
      <option value="allies" ${defaultMode === "allies" ? "selected" : ""}>
        ${text("Somente aliados", "Allies only")}
      </option>
      ${canTargetAll ? `
        <option value="all">${text("Todos na área", "Everyone in the area")}</option>
      ` : ""}
    `;

  const sizeHint = bounds.base === bounds.maximum
    ? text(`Tamanho fixo: ${bounds.base}`, `Fixed Size: ${bounds.base}`)
    : text(
        `Tamanho permitido: ${bounds.base}–${bounds.maximum}`,
        `Allowed Size: ${bounds.base}–${bounds.maximum}`
      );

  return DialogV2.wait({
    classes: ["dda", "dda-area-attack-dialog"],
    position: { width: 500 },
    window: {
      title: `[${tag.toUpperCase()}] ${text("Ataque em Área", "Area Attack")}`
    },
    modal: true,
    content: `
      <div class="dda-roll-dialog dda-area-dialog dda-area-dialog--configuration">
        <p><strong>${escapeHtml(attacker.name)}</strong> — ${escapeHtml(attackItem.name)}</p>
        <div class="form-group">
          <label>${text("Tamanho", "Size")}</label>
          <div class="form-fields">
            <input
              type="number"
              name="areaSize"
              min="${bounds.base}"
              max="${bounds.maximum}"
              step="1"
              value="${bounds.maximum}"
            >
          </div>
          <p class="hint">${sizeHint}</p>
        </div>
        <div class="form-group">
          <label>${text("Alvos", "Targets")}</label>
          <select name="targetMode" ${forcedAll ? "disabled" : ""}>
            ${targetModeOptions}
          </select>
        </div>
        <p class="hint">
          ${text(
            "Depois de confirmar, posicione a área no mapa. Clique esquerdo confirma; botão direito ou Esc cancela; a roda do mouse gira cones e ondas.",
            "After confirming, place the area on the canvas. Left-click confirms; right-click or Escape cancels; the mouse wheel rotates cones and waves."
          )}
        </p>
      </div>
    `,
    buttons: [
      {
        action: "place",
        label: text("Posicionar área", "Place Area"),
        icon: "fa-solid fa-location-crosshairs",
        default: true,
        callback: (_event, button) => {
          const size = Math.max(
            bounds.base,
            Math.min(
              bounds.maximum,
              Math.floor(Number(
                button.form.elements.areaSize.value ?? bounds.maximum
              ))
            )
          );

          return {
            size,
            targetMode: forcedAll
              ? "all"
              : String(
                  button.form.elements.targetMode.value ?? defaultMode
                )
          };
        }
      },
      {
        action: "cancel",
        label: text("Cancelar", "Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });
}

export function canAreaAttackReachTarget({
  attacker,
  attackerToken,
  targetToken,
  attackItem,
  qualityAttackModifier = {},
  attackRangeTotal = 0
} = {}) {
  if (!attacker || !attackerToken || !targetToken || !attackItem) return false;

  const tags = [
    ...(Array.isArray(attackItem?.system?.baseTags?.tags) ? attackItem.system.baseTags.tags : []),
    ...(Array.isArray(attackItem?.system?.qualityTags) ? attackItem.system.qualityTags : []),
    ...(Array.isArray(attackItem?.system?.tags) ? attackItem.system.tags : []),
    ...(Array.isArray(qualityAttackModifier?.areaAttackTags) ? qualityAttackModifier.areaAttackTags : [])
  ]
    .map(normalizeAreaTag)
    .filter((tag) => AREA_TAGS_IMPLEMENTED.has(tag));

  if (!tags.length) return false;

  const source = getTokenCenter(attackerToken);
  const target = getTokenCenter(targetToken);
  const targetDistance = pixelsToSpaces(Math.hypot(
    Number(target.x ?? 0) - Number(source.x ?? 0),
    Number(target.y ?? 0) - Number(source.y ?? 0)
  ));

  return tags.some((tag) => {
    const bounds = getAreaSizeBounds({ attacker, attackItem, tag, qualityAttackModifier });
    if (!bounds) return false;
    const maximum = Math.max(0, Number(bounds.maximum ?? bounds.base ?? 0));

    if (tag === "t:burst") {
      return getTokenGridDistance(attackerToken, targetToken) <= maximum + 0.001;
    }

    // BLAST may place its center anywhere within the Attack's Range, then extends
    // from that center by its selected Area size. Other implemented Areas are
    // anchored on/adjacent to the attacker and can be rotated toward the Target.
    if (tag === "t:blast") {
      return targetDistance <= Math.max(0, Number(attackRangeTotal ?? 0)) + maximum + 0.001;
    }

    if (tag === "t:wave") {
      const attackerRadius = Math.max(
        Number(attackerToken.document?.width ?? 1),
        Number(attackerToken.document?.height ?? 1)
      ) / 2;
      return targetDistance <= maximum + Math.ceil(attackerRadius + 1) + 0.001;
    }

    return targetDistance <= maximum + 0.001;
  });
}

function getTemplateType(tag = "") {
  const normalizedTag = normalizeAreaTag(tag);
  if (["t:blast", "t:burst"].includes(normalizedTag)) return "circle";
  if (normalizedTag === "t:cone") return "cone";
  if (["t:line", "t:pass"].includes(normalizedTag)) return "ray";
  if (normalizedTag === "t:wave") return "rect";
  return "circle";
}

function getTemplateDistance(tag, size) {
  const sceneDistance = Number(size ?? 1) * getGridDistance();

  if (normalizeAreaTag(tag) === "t:wave") {
    return Math.sqrt(2) * sceneDistance;
  }

  return sceneDistance;
}

function buildTemplateData({ attackerToken, tag, size, requestId } = {}) {
  const center = getTokenCenter(attackerToken);
  const normalizedTag = normalizeAreaTag(tag);
  const isWave = normalizedTag === "t:wave";
  const tokenWidth = Math.max(1, Number(attackerToken?.document?.width ?? 1));
  const tokenHeight = Math.max(1, Number(attackerToken?.document?.height ?? 1));
  const burstExpansion = normalizedTag === "t:burst"
    ? Math.max(0, (Math.max(tokenWidth, tokenHeight) - 1) / 2)
    : 0;
  const sizeOrder = ["small", "medium", "large", "huge", "gigantic", "colossal"];
  const sizeKey = String(attackerToken?.actor?.system?.size ?? "medium").trim().toLowerCase();
  const sizeIndex = sizeOrder.indexOf(sizeKey);
  const spacesLargerThanLarge = Math.max(0, (sizeIndex >= 0 ? sizeIndex : 1) - 2);
  const wideSwingsWidthBonus = getWideSwingsBonus(attackerToken?.actor);
  const lineWidth = normalizedTag === "t:line"
    ? Math.max(1, 1 + spacesLargerThanLarge + wideSwingsWidthBonus)
    : normalizedTag === "t:pass"
      ? Math.max(1, tokenWidth + wideSwingsWidthBonus)
      : 1;

  return {
    t: getTemplateType(tag),
    user: game.user.id,
    x: center.x,
    y: center.y,
    distance: getTemplateDistance(tag, Number(size ?? 1) + burstExpansion),
    direction: isWave ? 45 : 0,
    angle: normalizedTag === "t:cone" ? 90 : 0,
    width: lineWidth * getGridDistance(),
    borderColor: game.user.color ?? "#ff6400",
    fillColor: game.user.color ?? "#ff6400",
    flags: {
      [game.system.id]: {
        [AREA_PREVIEW_FLAG]: {
          requestId,
          tag: normalizedTag,
          size: Number(size ?? 1)
        }
      }
    }
  };
}

function getSnappedPoint(point = {}) {
  const mode = CONST.GRID_SNAPPING_MODES?.CENTER ?? 0x10;

  return canvas?.grid?.getSnappedPoint?.(point, { mode }) ??
    canvas?.grid?.getSnappedPosition?.(point.x, point.y, 2) ??
    point;
}

function getPointerPoint(event) {
  const localPosition = event?.data?.getLocalPosition
    ? event.data.getLocalPosition(canvas.templates)
    : event?.getLocalPosition
      ? event.getLocalPosition(canvas.templates)
      : null;

  if (localPosition) {
    return { x: localPosition.x, y: localPosition.y };
  }

  const global = event?.global ?? event?.data?.global ?? canvas?.mousePosition;
  if (global) {
    const local = canvas?.templates?.toLocal?.(global) ?? global;
    return { x: local.x, y: local.y };
  }

  return { x: 0, y: 0 };
}

async function drawTemplatePreview(templateData, {
  attackerToken,
  fixedOrigin = false,
  rotateOnly = false
} = {}) {
  const DocumentClass = CONFIG.MeasuredTemplate.documentClass;
  const ObjectClass = CONFIG.MeasuredTemplate.objectClass ??
    foundry.canvas.placeables.MeasuredTemplate;
  const document = new DocumentClass(templateData, { parent: canvas.scene });
  const template = new ObjectClass(document);
  const initialLayer = canvas.activeLayer;
  const initialHandlers = {
    contextmenu: canvas.app.view.oncontextmenu,
    wheel: canvas.app.view.onwheel
  };

  await canvas.templates.activate();
  await template.draw();
  canvas.templates.preview.addChild(template);

  const attackerCenter = getTokenCenter(attackerToken);
  const attackerEdgeOffset = Math.max(
    Number(attackerToken?.w ?? getGridSize()),
    Number(attackerToken?.h ?? getGridSize())
  ) / 2;
  document.updateSource({
    x: fixedOrigin ? attackerCenter.x + attackerEdgeOffset : templateData.x,
    y: fixedOrigin ? attackerCenter.y : templateData.y
  });
  template.refresh();

  ui.notifications.info(text(
    "Posicione a área: clique esquerdo confirma; botão direito ou Esc cancela.",
    "Place the area: left-click confirms; right-click or Escape cancels."
  ));

  return new Promise((resolve) => {
    let resolved = false;
    let moveTime = 0;

    const finish = async (result) => {
      if (resolved) return;
      resolved = true;

      canvas.stage.off("mousemove", onMove);
      canvas.stage.off("mousedown", onConfirm);
      canvas.stage.off("rightdown", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      canvas.app.view.oncontextmenu = initialHandlers.contextmenu;
      canvas.app.view.onwheel = initialHandlers.wheel;

      try {
        canvas.templates.preview.removeChild(template);
      } catch (_error) {
        // The preview can already be cleared by a layer change.
      }

      try {
        template.destroy({ children: true });
      } catch (_error) {
        // The preview can already be destroyed by a layer change.
      }

      if (initialLayer?.activate) await initialLayer.activate();
      resolve(result);
    };

    const onMove = (event) => {
      event.stopPropagation();
      const now = Date.now();
      if (now - moveTime < 20) return;
      moveTime = now;

      const point = getPointerPoint(event);

      if (fixedOrigin || rotateOnly) {
        const dx = point.x - attackerCenter.x;
        const dy = point.y - attackerCenter.y;
        const direction = Math.atan2(dy, dx) * 180 / Math.PI;

        const radians = direction * Math.PI / 180;
        document.updateSource({
          x: attackerCenter.x + Math.cos(radians) * attackerEdgeOffset,
          y: attackerCenter.y + Math.sin(radians) * attackerEdgeOffset,
          direction
        });
      } else {
        const snapped = getSnappedPoint(point);
        document.updateSource({ x: snapped.x, y: snapped.y });
      }

      template.refresh();
    };

    const onConfirm = (event) => {
      event.stopPropagation();
      const result = foundry.utils.deepClone(document.toObject(false));
      delete result._id;
      void finish(result);
    };

    const onCancel = (event) => {
      event.stopPropagation();
      void finish(null);
    };

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void finish(null);
    };

    canvas.app.view.oncontextmenu = (event) => event.preventDefault();
    canvas.app.view.onwheel = (event) => {
      if (!["cone", "rect"].includes(document.t)) return;

      event.preventDefault();
      event.stopPropagation();

      const isHexagonal = typeof canvas.grid?.isHexagonal === "function"
        ? canvas.grid.isHexagonal()
        : Boolean(canvas.grid?.isHexagonal);
      const delta = isHexagonal ? 30 : 15;
      const snap = event.shiftKey ? delta : delta * 3;
      const direction = Number(document.direction ?? 0) +
        (event.deltaY < 0 ? snap : -snap);

      document.updateSource({ direction });
      template.refresh();
    };

    canvas.stage.on("mousemove", onMove);
    canvas.stage.on("mousedown", onConfirm);
    canvas.stage.on("rightdown", onCancel);
    window.addEventListener("keydown", onKeyDown);
  });
}

function getTemplateOriginDistance(attackerToken, templateData) {
  const center = getTokenCenter(attackerToken);
  const dx = Number(templateData.x ?? 0) - center.x;
  const dy = Number(templateData.y ?? 0) - center.y;
  return Math.ceil(pixelsToSpaces(Math.hypot(dx, dy)));
}

function validateTemplatePlacement({
  attackerToken,
  tag,
  templateData,
  attackRangeTotal
} = {}) {
  const normalizedTag = normalizeAreaTag(tag);

  if (normalizedTag === "t:blast") {
    const originDistance = getTemplateOriginDistance(
      attackerToken,
      templateData
    );

    if (originDistance > Number(attackRangeTotal ?? 0)) {
      return {
        valid: false,
        message: text(
          `O centro de [T:BLAST] precisa estar dentro do Alcance do atacante (${attackRangeTotal} Espaços). Distância atual: ${originDistance}.`,
          `The [T:BLAST] center must be within the attacker's Range (${attackRangeTotal} Spaces). Current distance: ${originDistance}.`
        )
      };
    }
  }

  if (normalizedTag === "t:wave") {
    const originDistance = getTemplateOriginDistance(
      attackerToken,
      templateData
    );
    const attackerRadius = Math.max(
      Number(attackerToken.document?.width ?? 1),
      Number(attackerToken.document?.height ?? 1)
    ) / 2;
    const maximumOriginDistance = Math.ceil(attackerRadius + 1);

    if (originDistance > maximumOriginDistance) {
      return {
        valid: false,
        message: text(
          "A origem de [T:WAVE] precisa ser posicionada adjacente ao atacante.",
          "The [T:WAVE] origin must be placed adjacent to the attacker."
        )
      };
    }
  }

  return { valid: true };
}

function getTemplateObject(document) {
  return document?.object ?? canvas?.templates?.get?.(document?.id) ?? null;
}

async function createPersistentTemplate(templateData) {
  const [document] = await canvas.scene.createEmbeddedDocuments(
    "MeasuredTemplate",
    [templateData],
    { ddaAreaAttackPreview: true }
  );

  if (!document) return null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const object = getTemplateObject(document);

    if (object) {
      try {
        if (!object.shape && object.draw) await object.draw();
        object.refresh?.();
      } catch (_error) {
        // The normal canvas draw cycle may finish on the next tick.
      }

      if (object.shape?.contains) return document;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return document;
}

async function deletePersistentTemplate(document) {
  if (!document?.id || !canvas?.scene) return;

  try {
    await canvas.scene.deleteEmbeddedDocuments(
      "MeasuredTemplate",
      [document.id],
      { ddaAreaAttackPreview: true }
    );
  } catch (error) {
    console.warn(
      "DDA | Could not delete the temporary Area Attack template.",
      error
    );
  }
}

function tokenIsInsideBaseArea(token, templateData, bounds, attackerToken = null) {
  if (!token || !templateData || !bounds) return false;

  const originX = Number(templateData.x ?? 0);
  const originY = Number(templateData.y ?? 0);
  const basePixels = Math.max(1, Number(bounds.base ?? 1)) * getGridSize();
  const normalizedTag = normalizeAreaTag(
    templateData?.flags?.[game.system.id]?.[AREA_PREVIEW_FLAG]?.tag ?? ""
  );

  if (normalizedTag === "t:burst" && attackerToken) {
    return getTokenGridDistance(attackerToken, token) <=
      Math.max(0, Number(bounds.base ?? 1)) + 0.001;
  }

  /*
   * All targets reaching this point are already inside the selected maximum
   * template.  For circles and cones, Base Size is the distance from the
   * template origin.  Wave uses the same nearest-point test, which mirrors
   * the rule's Base Size band without relying on private canvas internals.
   */
  const distanceLimit = normalizedTag === "t:wave"
    ? Math.SQRT2 * basePixels
    : basePixels;

  return getTokenSamplePoints(token).some((point) => {
    return Math.hypot(
      Number(point.x ?? 0) - originX,
      Number(point.y ?? 0) - originY
    ) <= distanceLimit + 0.5;
  });
}

function getTokenSamplePoints(token) {
  const center = getTokenCenter(token);
  const bounds = token.bounds ?? {
    x: Number(token.x ?? 0),
    y: Number(token.y ?? 0),
    width: Number(token.w ?? getGridSize()),
    height: Number(token.h ?? getGridSize())
  };
  const inset = 2;
  const points = [center];

  points.push(
    { x: bounds.x + inset, y: bounds.y + inset },
    { x: bounds.x + bounds.width - inset, y: bounds.y + inset },
    { x: bounds.x + inset, y: bounds.y + bounds.height - inset },
    {
      x: bounds.x + bounds.width - inset,
      y: bounds.y + bounds.height - inset
    }
  );

  const gridSize = getGridSize();
  const columns = Math.max(1, Math.round(bounds.width / gridSize));
  const rows = Math.max(1, Math.round(bounds.height / gridSize));

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      points.push({
        x: bounds.x + (column + 0.5) * bounds.width / columns,
        y: bounds.y + (row + 0.5) * bounds.height / rows
      });
    }
  }

  return points;
}

function templateContainsToken(templateObject, token) {
  const shape = templateObject?.shape;
  if (!shape?.contains) return false;

  const origin = {
    x: Number(templateObject.document?.x ?? 0),
    y: Number(templateObject.document?.y ?? 0)
  };

  return getTokenSamplePoints(token).some((point) => {
    return shape.contains(point.x - origin.x, point.y - origin.y);
  });
}

function filterAreaTargets({
  attacker,
  attackerToken,
  templateDocument,
  tag,
  targetMode,
  forcedAll = false
} = {}) {
  const templateObject = getTemplateObject(templateDocument);
  const normalizedTag = normalizeAreaTag(tag);
  const isBurst = normalizedTag === "t:burst";
  if (!isBurst && !templateObject?.shape?.contains) return [];

  const selectedSize = Math.max(0, Number(
    templateDocument?.flags?.[game.system.id]?.[AREA_PREVIEW_FLAG]?.size ??
    templateObject?.document?.flags?.[game.system.id]?.[AREA_PREVIEW_FLAG]?.size ??
    0
  ));

  return (canvas?.tokens?.placeables ?? [])
    .filter((token) => token?.actor)
    .filter((token) => game.user.isGM || !token.document?.hidden)
    .filter((token) => isBurst
      ? getTokenGridDistance(attackerToken, token) <= selectedSize + 0.001
      : templateContainsToken(templateObject, token))
    .filter((token) => {
      const sameToken = token.id === attackerToken?.id;
      if (!sameToken) return true;
      if (normalizedTag === "t:burst") return false;
      return !forcedAll;
    })
    .filter((token) => {
      if (targetMode === "all") return true;
      const ally = areActorsAllies(attacker, token.actor);
      return targetMode === "allies" ? ally : !ally;
    })
    .sort((left, right) => {
      const attackerCenter = getTokenCenter(attackerToken);
      const leftCenter = getTokenCenter(left);
      const rightCenter = getTokenCenter(right);
      const leftDistance = Math.hypot(
        leftCenter.x - attackerCenter.x,
        leftCenter.y - attackerCenter.y
      );
      const rightDistance = Math.hypot(
        rightCenter.x - attackerCenter.x,
        rightCenter.y - attackerCenter.y
      );

      return leftDistance - rightDistance ||
        String(left.name).localeCompare(String(right.name));
    });
}

async function confirmAreaTargets({
  attackItem,
  tag,
  size,
  targetMode,
  targetTokens,
  forcedAll
} = {}) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const targetRows = targetTokens.map((token) => {
    return `
      <label class="dda-area-target-row">
        <input
          type="checkbox"
          name="targetIds"
          value="${escapeHtml(token.id)}"
          checked
          ${forcedAll ? "disabled" : ""}
        >
        <img
          src="${escapeHtml(token.document?.texture?.src ?? token.actor?.img ?? "icons/svg/mystery-man.svg")}"
          alt=""
        >
        <span>${escapeHtml(token.name ?? token.actor?.name ?? "Target")}</span>
      </label>
    `;
  }).join("");

  return DialogV2.wait({
    classes: ["dda", "dda-area-attack-dialog"],
    position: { width: 520 },
    window: {
      title: text("Confirmar alvos da área", "Confirm Area Targets")
    },
    modal: true,
    content: `
      <div class="dda-roll-dialog dda-area-dialog dda-area-dialog--targets">
        <p>
          <strong>${escapeHtml(attackItem.name)}</strong>
          — [${escapeHtml(tag.toUpperCase())}]
          — ${text("Tamanho", "Size")} ${Number(size)}
        </p>
        <p class="hint">
          ${text("Modo", "Mode")}: ${escapeHtml(getTargetModeLabel(targetMode))}
        </p>
        <div class="dda-area-target-list">
          ${targetRows}
        </div>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Confirmar ataque", "Confirm Attack"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => {
          if (forcedAll) return targetTokens.map((token) => token.id);

          return Array.from(
            button.form.querySelectorAll('input[name="targetIds"]:checked')
          ).map((input) => input.value);
        }
      },
      {
        action: "reposition",
        label: text("Reposicionar", "Reposition"),
        icon: "fa-solid fa-arrows-up-down-left-right",
        callback: () => "reposition"
      },
      {
        action: "cancel",
        label: text("Cancelar", "Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });
}


async function resolveAreaIntercedeReactions({
  attacker,
  attackerToken,
  attackItem,
  attackOptions = {},
  qualityAttackModifier = {},
  templateDocument,
  tag,
  targetMode,
  forcedAll = false,
  selectedTargets = []
} = {}) {
  if (
    !game?.combat?.started ||
    qualityAttackModifier?.sneakSuppressInterrupts ||
    attackOptions?.suppressTargetInterrupts
  ) {
    return {
      selectedTargets: [...selectedTargets],
      armorBonusesByTokenId: new Map(),
      reactions: []
    };
  }

  let currentTargets = [...selectedTargets];
  const armorBonusesByTokenId = new Map();
  const reactions = [];
  const excludedCandidateKeys = new Set();

  /*
   * Each accepted reaction closes the current window and then re-opens the
   * response step for any remaining valid pair. This permits multiple allies
   * to Area Intercede against the same Area Attack without making one chat
   * card attempt to coordinate several clients at once.
   */
  for (let guard = 0; guard < 20 && currentTargets.length; guard += 1) {
    const response = await requestAreaIntercede({
      attacker,
      targetTokens: currentTargets,
      attackItem,
      templateId: String(templateDocument?.id ?? ""),
      excludedCandidateKeys: [...excludedCandidateKeys]
    });

    if (!response) break;

    const candidateKey = String(
      response.candidateKey ?? `${response.actorUuid}|${response.protectedActorUuid}`
    );
    if (candidateKey) excludedCandidateKeys.add(candidateKey);

    const intercederToken = canvas?.tokens?.get(response.tokenId) ?? null;
    const protectedToken = canvas?.tokens?.get(response.protectedTokenId) ?? null;
    const validNow = new Map(
      filterAreaTargets({
        attacker,
        attackerToken,
        templateDocument,
        tag,
        targetMode,
        forcedAll
      }).map((token) => [token.id, token])
    );

    if (protectedToken && !validNow.has(protectedToken.id)) {
      currentTargets = currentTargets.filter((token) => token.id !== protectedToken.id);
    }

    if (
      intercederToken &&
      validNow.has(intercederToken.id) &&
      !currentTargets.some((token) => token.id === intercederToken.id)
    ) {
      currentTargets.push(intercederToken);
    }

    const armorBonus = Math.max(0, Number(response.intercedeArmorBonus ?? 0));
    if (intercederToken && armorBonus > 0 && validNow.has(intercederToken.id)) {
      armorBonusesByTokenId.set(
        intercederToken.id,
        Math.max(
          armorBonus,
          Number(armorBonusesByTokenId.get(intercederToken.id) ?? 0)
        )
      );
    }

    reactions.push({
      actorUuid: String(response.actorUuid ?? ""),
      actorName: String(response.actorName ?? ""),
      tokenId: String(response.tokenId ?? ""),
      protectedActorUuid: String(response.protectedActorUuid ?? ""),
      protectedActorName: String(response.protectedActorName ?? ""),
      protectedTokenId: String(response.protectedTokenId ?? ""),
      mode: String(response.mode ?? "area"),
      actionCost: Math.max(0, Number(response.actionCost ?? 0)),
      throwDistance: Math.max(0, Number(response.throwDistance ?? 0)),
      intercedeArmorBonus: armorBonus
    });
  }

  const finalValidIds = new Set(
    filterAreaTargets({
      attacker,
      attackerToken,
      templateDocument,
      tag,
      targetMode,
      forcedAll
    }).map((token) => token.id)
  );
  currentTargets = currentTargets.filter((token) => finalValidIds.has(token.id));

  for (const tokenId of [...armorBonusesByTokenId.keys()]) {
    if (!finalValidIds.has(tokenId)) armorBonusesByTokenId.delete(tokenId);
  }

  return {
    selectedTargets: currentTargets,
    armorBonusesByTokenId,
    reactions
  };
}

function getTargetModeLabel(targetMode = "") {
  const labels = {
    enemies: text("Somente inimigos", "Enemies only"),
    allies: text("Somente aliados", "Allies only"),
    all: text("Todos na área", "Everyone in the area")
  };

  return labels[String(targetMode ?? "").trim().toLowerCase()] ??
    String(targetMode ?? "");
}

function getEntryHit(entry = {}) {
  return Boolean(entry.hit ?? entry.result?.hit);
}

function getEntryDamageApplication(entry = {}) {
  return entry.damageApplication ?? entry.result?.damageApplication ?? null;
}

function getEntryDamageState(entry = {}) {
  const application = getEntryDamageApplication(entry);
  if (application?.applied) return "applied";
  return String(application?.state ?? "pending").trim().toLowerCase() || "pending";
}

function getEntryDamageAmount(entry = {}) {
  const application = getEntryDamageApplication(entry);
  const candidate = application?.damage ??
    entry.finalDamage ??
    entry.result?.finalDamage ??
    0;
  const damage = Number(candidate);
  return Number.isFinite(damage) ? Math.max(0, damage) : 0;
}

function isEntryDamageApplied(entry = {}) {
  const application = getEntryDamageApplication(entry);

  return Boolean(
    entry.damageApplied ??
    application?.applied ??
    entry.result?.damageApplied ??
    getEntryDamageState(entry) === "applied"
  );
}

function getEntryName(entry = {}) {
  return entry.name ??
    entry.token?.name ??
    entry.token?.actor?.name ??
    entry.result?.defender?.name ??
    "Target";
}

function getEntryPortrait(entry = {}) {
  return entry.portrait ??
    entry.token?.document?.texture?.src ??
    entry.token?.actor?.img ??
    entry.result?.defender?.img ??
    "icons/svg/mystery-man.svg";
}

function isEntryEnemy(entry = {}, attacker = null) {
  if (entry.isEnemy !== undefined && entry.isEnemy !== null) {
    return Boolean(entry.isEnemy);
  }

  if (!attacker || !entry?.token?.actor) return false;
  return !areActorsAllies(attacker, entry.token.actor);
}

function getAreaTargetState(entry = {}) {
  const status = String(entry.status ?? "pending");
  const hit = getEntryHit(entry);

  const states = {
    pending: {
      label: text("Aguardando", "Waiting"),
      icon: "fa-regular fa-clock",
      css: "pending"
    },
    resolving: {
      label: text("Resolvendo Esquiva…", "Resolving Dodge…"),
      icon: "fa-solid fa-spinner fa-spin",
      css: "resolving"
    },
    prevented: {
      label: text("Ataque anulado", "Attack negated"),
      icon: "fa-solid fa-ban",
      css: "prevented"
    },
    skipped: {
      label: text("Não resolvido", "Not resolved"),
      icon: "fa-solid fa-minus",
      css: "skipped"
    },
    cancelled: {
      label: text("Esquiva não resolvida", "Dodge unresolved"),
      icon: "fa-solid fa-triangle-exclamation",
      css: "cancelled"
    }
  };

  if (status === "resolved") {
    return hit
      ? {
          label: text("Atingido", "Hit"),
          icon: "fa-solid fa-burst",
          css: "hit"
        }
      : {
          label: text("Evitou", "Dodged"),
          icon: "fa-solid fa-shield-halved",
          css: "miss"
        };
  }

  return states[status] ?? states.pending;
}

function buildAreaStatusCard({
  requestId = "",
  attacker = null,
  attackerName = "",
  attackItem = null,
  attackName = "",
  tag,
  size,
  targetMode,
  entries = [],
  accuracySuccesses = null,
  status = "awaitingDodges",
  bulkDodge = null,
  bulkDamage = null,
  damageSummaryMessageId = ""
} = {}) {
  const rows = entries.map((entry) => {
    const state = getAreaTargetState(entry);
    const damageAmount = getEntryDamageAmount(entry);
    const damageState = getEntryDamageState(entry);
    const damageApplied = damageState === "applied";
    const damageApplying = isAttackDamageApplicationInFlight(getEntryDamageApplication(entry));
    const damage = damageAmount > 0
      ? `
        <span class="damage ${damageApplied ? "applied" : damageApplying ? "applying" : "pending"}">
          ${text("Dano", "Damage")}: <strong>${damageAmount}</strong>
          ${
            damageApplied
              ? `<i class="fa-solid fa-check"></i> ${text("Aplicado", "Applied")}`
              : damageApplying
                ? `<i class="fa-solid fa-spinner fa-spin"></i> ${text("Aplicando…", "Applying…")}`
                : ""
          }
        </span>
      `
      : "";
    const portrait = getEntryPortrait(entry);

    return `
      <li
        class="${state.css} ${damageApplied ? "damage-applied" : ""}"
        data-area-target-uuid="${escapeHtml(
          getEntryDamageApplication(entry)?.defenderUuid ??
          entry.actorUuid ??
          ""
        )}"
      >
        <img src="${escapeHtml(portrait)}" alt="">
        <span class="target-name">
          ${escapeHtml(getEntryName(entry))}
        </span>
        <span class="target-state">
          <i class="${state.icon}"></i> ${state.label}
        </span>
        ${damage}
      </li>
    `;
  }).join("");

  const finishedStatuses = new Set([
    "resolved",
    "prevented",
    "cancelled",
    "skipped"
  ]);
  const resolved = entries.filter((entry) => {
    return finishedStatuses.has(String(entry.status ?? "pending"));
  }).length;
  const complete = ["resolved", "prevented", "cancelled"].includes(
    String(status ?? "")
  );
  const enemyPendingCount = entries.filter((entry) => {
    if (!isEntryEnemy(entry, attacker)) return false;
    return !finishedStatuses.has(String(entry.status ?? "pending"));
  }).length;
  const pendingDamageCount = complete
    ? entries.filter((entry) => {
        return String(entry.status ?? "") === "resolved" &&
          getEntryDamageAmount(entry) > 0 &&
          getEntryDamageState(entry) !== "applied" &&
          !isAttackDamageApplicationInFlight(getEntryDamageApplication(entry));
      }).length
    : 0;
  const appliedDamageCount = entries.filter((entry) => {
    return getEntryDamageAmount(entry) > 0 && isEntryDamageApplied(entry);
  }).length;
  const bulkDodgeActive = Boolean(bulkDodge?.active);
  const dodgeMode = String(bulkDodge?.mode ?? (bulkDodgeActive ? "bulk" : "")).trim();
  const bulkDamageActive = isAreaBulkDamageActive(bulkDamage);
  const awaitingDodgeMode = String(status ?? "") === "awaitingDodgeMode";
  const bulkDodgeActions = !complete && enemyPendingCount > 0
    ? awaitingDodgeMode
      ? `
        <div class="dda-area-attack-actions dda-area-dodge-mode-actions">
          <p class="dda-area-dodge-mode-hint">
            ${text(
              "Escolha como as Esquivas inimigas serão resolvidas. Nenhuma Esquiva foi solicitada ainda.",
              "Choose how enemy Dodges will be resolved. No Dodge has been requested yet."
            )}
          </p>
          <button
            type="button"
            data-action="dda-roll-all-area-dodges"
            data-area-request-id="${escapeHtml(requestId)}"
          >
            <i class="fa-solid fa-shield-halved"></i>
            ${text(
              `Rolar Esquiva de todos os inimigos (${enemyPendingCount})`,
              `Roll Dodge for all enemies (${enemyPendingCount})`
            )}
          </button>
          <button
            type="button"
            data-action="dda-resolve-area-dodges-individually"
            data-area-request-id="${escapeHtml(requestId)}"
          >
            <i class="fa-solid fa-list-ol"></i>
            ${text("Resolver uma por vez", "Resolve one at a time")}
          </button>
        </div>
      `
      : `
        <div class="dda-area-attack-actions">
          <button
            type="button"
            data-action="dda-roll-all-area-dodges"
            data-area-request-id="${escapeHtml(requestId)}"
            ${dodgeMode ? "disabled" : ""}
          >
            <i class="fa-solid ${bulkDodgeActive ? "fa-spinner fa-spin" : "fa-shield-halved"}"></i>
            ${bulkDodgeActive
              ? text("Esquivas inimigas automáticas ativadas", "Automatic enemy Dodges enabled")
              : dodgeMode === "individual"
                ? text("Esquivas individuais selecionadas", "Individual Dodges selected")
                : text(`Rolar Esquiva de todos os inimigos (${enemyPendingCount})`, `Roll Dodge for all enemies (${enemyPendingCount})`)}
          </button>
        </div>
      `
    : "";
  const bulkDamageActions = complete && pendingDamageCount > 0
    ? damageSummaryMessageId
      ? `
        <div class="dda-area-attack-damage-posted">
          <i class="fa-solid fa-arrow-down"></i>
          ${text(
            "As Esquivas terminaram. O controle de dano foi publicado no fim do chat.",
            "Dodges are complete. The damage controls were posted at the end of chat."
          )}
        </div>
      `
      : `
        <div class="dda-area-attack-actions dda-area-damage-actions">
          <button
            type="button"
            data-action="dda-apply-all-area-damage"
            data-area-request-id="${escapeHtml(requestId)}"
            ${bulkDamageActive ? "disabled" : ""}
          >
            <i class="fa-solid ${bulkDamageActive ? "fa-spinner fa-spin" : "fa-heart-crack"}"></i>
            ${bulkDamageActive
              ? text("Aplicando dano aos alvos…", "Applying damage to targets…")
              : text(`Aplicar dano a todos os afetados (${pendingDamageCount})`, `Apply damage to all affected targets (${pendingDamageCount})`)}
          </button>
        </div>
      `
    : complete && appliedDamageCount > 0
      ? `
        <div class="dda-area-attack-damage-complete">
          <i class="fa-solid fa-circle-check"></i>
          ${text("Dano aplicado aos alvos afetados.", "Damage applied to affected targets.")}
        </div>
      `
      : "";
  const accuracy = Number.isFinite(Number(accuracySuccesses))
    ? `<span>${text("Precisão", "Accuracy")}: <strong>${Number(accuracySuccesses)}</strong></span>`
    : `<span>${text("Precisão ainda não rolada", "Accuracy not rolled yet")}</span>`;
  const displayedAttackName = attackItem?.name ?? attackName ?? "Attack";
  const displayedAttackerName = attacker?.name ?? attackerName ?? "Attacker";

  return `
    <div class="dda-chat-card dda-area-attack-summary ${complete ? "complete" : "pending"}">
      <header>
        <div>
          <h2>${escapeHtml(displayedAttackName)}</h2>
          <small>${escapeHtml(displayedAttackerName)}</small>
        </div>
        <span>[${escapeHtml(String(tag ?? "").toUpperCase())}]</span>
      </header>
      <div class="dda-area-attack-meta">
        ${accuracy}
        <span>${text("Tamanho", "Size")}: <strong>${Number(size)}</strong></span>
        <span>${text("Alvos", "Targets")}: <strong>${escapeHtml(getTargetModeLabel(targetMode))}</strong></span>
        <span>${text("Progresso", "Progress")}: <strong>${resolved}/${entries.length}</strong></span>
      </div>
      ${bulkDodgeActions}
      ${bulkDamageActions}
      <ul>${rows}</ul>
    </div>
  `;
}

function buildAreaDamageResolutionCard({
  request = {},
  attacker = null,
  attackItem = null
} = {}) {
  const entries = Array.isArray(request.targets) ? request.targets : [];
  const affected = entries.filter((entry) => {
    return String(entry.status ?? "") === "resolved" &&
      getEntryDamageAmount(entry) > 0;
  });
  const applying = affected.filter((entry) => {
    return isAttackDamageApplicationInFlight(getEntryDamageApplication(entry));
  });
  const pending = affected.filter((entry) => {
    return getEntryDamageState(entry) !== "applied" &&
      !isAttackDamageApplicationInFlight(getEntryDamageApplication(entry));
  });
  const applied = affected.filter((entry) => getEntryDamageState(entry) === "applied").length;
  const bulkDamageActive = isAreaBulkDamageActive(request.bulkDamage);
  const displayedAttackName = attackItem?.name ?? request.attackName ?? "Attack";
  const displayedAttackerName = attacker?.name ?? request.attackerName ?? "Attacker";

  const rows = affected.map((entry) => {
    const damageAmount = getEntryDamageAmount(entry);
    const damageState = getEntryDamageState(entry);
    const damageApplied = damageState === "applied";
    const damageApplying = isAttackDamageApplicationInFlight(getEntryDamageApplication(entry));

    return `
      <li class="hit ${damageApplied ? "damage-applied" : damageApplying ? "damage-applying" : ""}">
        <img src="${escapeHtml(getEntryPortrait(entry))}" alt="">
        <span class="target-name">${escapeHtml(getEntryName(entry))}</span>
        <span class="target-state">
          <i class="fa-solid ${damageApplied ? "fa-circle-check" : damageApplying ? "fa-spinner fa-spin" : "fa-burst"}"></i>
          ${damageApplied
            ? text("Aplicado", "Applied")
            : damageApplying
              ? text("Aplicando…", "Applying…")
              : text("Atingido", "Hit")}
        </span>
        <span class="damage ${damageApplied ? "applied" : damageApplying ? "applying" : "pending"}">
          ${text("Dano", "Damage")}: <strong>${damageAmount}</strong>
          ${damageApplied
            ? `<i class="fa-solid fa-check"></i> ${text("Aplicado", "Applied")}`
            : damageApplying
              ? `<i class="fa-solid fa-spinner fa-spin"></i> ${text("Aplicando…", "Applying…")}`
              : ""}
        </span>
      </li>
    `;
  }).join("");

  const controls = pending.length > 0
    ? `
      <div class="dda-area-attack-actions dda-area-damage-actions">
        <button
          type="button"
          data-action="dda-apply-all-area-damage"
          data-area-request-id="${escapeHtml(request.requestId ?? "")}"
          ${bulkDamageActive ? "disabled" : ""}
        >
          <i class="fa-solid ${bulkDamageActive ? "fa-spinner fa-spin" : "fa-heart-crack"}"></i>
          ${bulkDamageActive
            ? text("Aplicando dano aos alvos…", "Applying damage to targets…")
            : text(
                `Aplicar dano a todos os afetados (${pending.length})`,
                `Apply damage to all affected targets (${pending.length})`
              )}
        </button>
      </div>
    `
    : applying.length > 0
      ? `
        <div class="dda-area-attack-damage-posted">
          <i class="fa-solid fa-spinner fa-spin"></i>
          ${text("Há aplicações de dano em andamento…", "Damage applications are in progress…")}
        </div>
      `
      : `
        <div class="dda-area-attack-damage-complete">
          <i class="fa-solid fa-circle-check"></i>
          ${text("Dano aplicado aos alvos afetados.", "Damage applied to affected targets.")}
        </div>
      `;

  return `
    <div class="dda-chat-card dda-area-attack-summary dda-area-attack-damage-summary complete">
      <header>
        <div>
          <h2>${text("Resolver dano em área", "Resolve Area Damage")}</h2>
          <small>${escapeHtml(displayedAttackerName)} — ${escapeHtml(displayedAttackName)}</small>
        </div>
        <span>[${escapeHtml(String(request.tag ?? "").toUpperCase())}]</span>
      </header>

      <div class="dda-area-attack-meta">
        <span>${text("Atingidos", "Hit")}: <strong>${affected.length}</strong></span>
        <span>${text("Dano pendente", "Damage Pending")}: <strong>${pending.length}</strong></span>
        ${applying.length > 0 ? `<span>${text("Aplicando", "Applying")}: <strong>${applying.length}</strong></span>` : ""}
        <span>${text("Aplicados", "Applied")}: <strong>${applied}</strong></span>
      </div>

      <p class="dda-area-damage-summary-hint">
        ${text(
          "Todas as Esquivas foram concluídas. Aplique abaixo o dano individual já calculado para cada alvo atingido.",
          "All Dodges are complete. Apply the already calculated individual damage to each hit target below."
        )}
      </p>

      <ul>${rows}</ul>
      ${controls}
    </div>
  `;
}

function serializeAreaEntries(entries = [], attacker = null) {
  return entries.map((entry) => {
    const application = getEntryDamageApplication(entry);
    const liveApplication = application
      ? (
          getAreaDamageEntryFromMessage(
            getAreaDamageMessage(application)
          ) ?? application
        )
      : null;

    return {
      tokenId: entry.token?.id ?? entry.tokenId ?? "",
      actorUuid: entry.token?.actor?.uuid ?? entry.actorUuid ?? "",
      name: getEntryName(entry),
      portrait: getEntryPortrait(entry),
      isEnemy: isEntryEnemy(entry, attacker),
      status: entry.status ?? "pending",
      hit: getEntryHit(entry),
      finalDamage: getEntryDamageAmount(entry),
      damageApplication: liveApplication
        ? {
            applicationId: String(liveApplication.applicationId ?? ""),
            requestId: String(liveApplication.requestId ?? ""),
            progressMessageId: String(liveApplication.progressMessageId ?? ""),
            messageId: String(liveApplication.messageId ?? ""),
            targetTokenId: String(
              liveApplication.targetTokenId ??
              entry.token?.id ??
              entry.tokenId ??
              ""
            ),
            defenderUuid: String(liveApplication.defenderUuid ?? ""),
            attackerUuid: String(liveApplication.attackerUuid ?? ""),
            damage: getEntryDamageAmount(entry),
            damageType: String(liveApplication.damageType ?? ""),
            damageLabel: String(liveApplication.damageLabel ?? ""),
            holdBack: Boolean(liveApplication.holdBack),
            tamerIntercede: Boolean(liveApplication.tamerIntercede),
            digimonIntercede: Boolean(liveApplication.digimonIntercede),
            unalterable: Boolean(liveApplication.unalterable),
            unalterablePortion: Math.max(0, Number(liveApplication.unalterablePortion ?? 0)),
            focusTempMultiplier: Math.max(
              1,
              Number(liveApplication.focusTempMultiplier ?? 1)
            ),
            lifestealCap: Math.max(
              0,
              Number(liveApplication.lifestealCap ?? 0)
            ),
            lifestealKey: String(liveApplication.lifestealKey ?? ""),
            combatId: String(liveApplication.combatId ?? ""),
            sceneId: String(liveApplication.sceneId ?? ""),
            createdAt: Number(liveApplication.createdAt ?? 0),
            state: getEntryDamageState({ damageApplication: liveApplication }),
            claimedByUserId: String(liveApplication.claimedByUserId ?? ""),
            claimedAt: liveApplication.claimedAt ?? null,
            areaReady: Boolean(liveApplication.areaReady),
            lastError: String(liveApplication.lastError ?? ""),
            applied: Boolean(
              liveApplication.applied ||
              isEntryDamageApplied(entry)
            ),
            appliedAt: liveApplication.appliedAt ?? null,
            appliedByUserId: String(liveApplication.appliedByUserId ?? "")
          }
        : null
    };
  });
}

function getAreaAttackRequestFromMessage(message) {
  return message?.getFlag?.(game.system.id, AREA_REQUEST_FLAG)
    ?? message?.flags?.[game.system.id]?.[AREA_REQUEST_FLAG]
    ?? null;
}

function getAreaDamageSummaryFromMessage(message) {
  return message?.getFlag?.(game.system.id, AREA_DAMAGE_SUMMARY_FLAG)
    ?? message?.flags?.[game.system.id]?.[AREA_DAMAGE_SUMMARY_FLAG]
    ?? null;
}

function findAreaDamageSummaryMessage(request = {}) {
  const messageId = String(request?.damageSummaryMessageId ?? "");

  if (messageId) {
    const direct = game.messages?.get(messageId);
    if (direct) return direct;
  }

  const requestId = String(request?.requestId ?? "");
  if (!requestId) return null;

  return game.messages?.find?.((candidate) => {
    const summary = getAreaDamageSummaryFromMessage(candidate);
    return String(summary?.requestId ?? "") === requestId;
  }) ?? null;
}

function getAreaDamageEntryFromMessage(message) {
  return message?.getFlag?.(game.system.id, "areaAttackDamageEntry")
    ?? message?.flags?.[game.system.id]?.areaAttackDamageEntry
    ?? null;
}

async function resolveActorDocument(uuid = "") {
  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);
    if (document?.documentName === "Token") return document.actor ?? null;
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Could not resolve an Area Attack Actor.", error);
    return null;
  }
}

function getAreaDamageMessage(application = {}) {
  const messageId = String(application?.messageId ?? "");
  if (messageId) {
    const direct = game.messages?.get(messageId);
    if (direct) return direct;
  }

  const applicationId = String(application?.applicationId ?? "");
  const requestId = String(application?.requestId ?? "");
  const targetTokenId = String(application?.targetTokenId ?? "");
  const defenderUuid = String(application?.defenderUuid ?? "");

  return game.messages?.find?.((candidate) => {
    const entry = getAreaDamageEntryFromMessage(candidate);

    if (applicationId && String(entry?.applicationId ?? "") === applicationId) {
      return true;
    }

    if (
      requestId &&
      targetTokenId &&
      String(entry?.requestId ?? "") === requestId &&
      String(entry?.targetTokenId ?? "") === targetTokenId
    ) {
      return true;
    }

    return String(entry?.requestId ?? "") === requestId &&
      String(entry?.defenderUuid ?? "") === defenderUuid;
  }) ?? null;
}

async function updateAreaProgressMessage(message, request = {}) {
  if (!message || !request?.requestId) return;

  let attacker = null;
  let attackItem = null;

  try {
    attacker = await fromUuid(request.attackerUuid);
  } catch (_error) {
    attacker = null;
  }

  try {
    attackItem = await fromUuid(request.attackItemUuid);
  } catch (_error) {
    attackItem = null;
  }

  await message.update({
    content: buildAreaStatusCard({
      requestId: request.requestId,
      attacker,
      attackerName: request.attackerName,
      attackItem,
      attackName: request.attackName,
      tag: request.tag,
      size: request.size,
      targetMode: request.targetMode,
      entries: request.targets ?? [],
      accuracySuccesses: request.accuracySuccesses,
      status: request.status,
      bulkDodge: request.bulkDodge,
      bulkDamage: request.bulkDamage,
      damageSummaryMessageId: request.damageSummaryMessageId
    }),
    [`flags.${game.system.id}.${AREA_REQUEST_FLAG}`]: request
  });

  const summaryMessage = findAreaDamageSummaryMessage(request);

  if (summaryMessage) {
    await summaryMessage.update({
      content: buildAreaDamageResolutionCard({
        request,
        attacker,
        attackItem
      }),
      [`flags.${game.system.id}.${AREA_DAMAGE_SUMMARY_FLAG}`]: {
        requestId: String(request.requestId ?? ""),
        progressMessageId: String(message.id ?? "")
      }
    });
  }
}

async function ensureAreaDamageSummaryMessage(
  progressMessage,
  request = {},
  {
    attacker = null,
    attackItem = null
  } = {}
) {
  if (!progressMessage || !request?.requestId) return null;

  const complete = ["resolved", "prevented", "cancelled"].includes(
    String(request.status ?? "")
  );
  const affected = (request.targets ?? []).filter((target) => {
    return String(target?.status ?? "") === "resolved" &&
      Number(target?.damageApplication?.damage ?? target?.finalDamage ?? 0) > 0;
  });

  if (!complete || !affected.length) return null;

  const existing = findAreaDamageSummaryMessage(request);

  if (existing) {
    request.damageSummaryMessageId = existing.id;
    await updateAreaProgressMessage(progressMessage, request);
    return existing;
  }

  const summaryMessage = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: buildAreaDamageResolutionCard({
      request,
      attacker,
      attackItem
    }),
    flags: {
      [game.system.id]: {
        [AREA_DAMAGE_SUMMARY_FLAG]: {
          requestId: String(request.requestId ?? ""),
          progressMessageId: String(progressMessage.id ?? "")
        }
      }
    }
  });

  if (!summaryMessage) return null;

  request.damageSummaryMessageId = summaryMessage.id;
  await updateAreaProgressMessage(progressMessage, request);
  return summaryMessage;
}

async function markAreaDamageEntriesReady(entries = []) {
  for (const entry of entries) {
    const application = getEntryDamageApplication(entry);
    if (!application || getEntryDamageAmount(entry) <= 0) continue;

    const damageMessage = getAreaDamageMessage(application);
    if (!damageMessage) continue;

    const liveEntry = foundry.utils.deepClone(
      getAreaDamageEntryFromMessage(damageMessage) ?? application
    );

    liveEntry.areaReady = true;
    if (!liveEntry.state) {
      liveEntry.state = liveEntry.applied ? "applied" : "pending";
    }

    await damageMessage.update({
      [`flags.${game.system.id}.areaAttackDamageEntry`]: liveEntry
    });

    if (entry?.result?.damageApplication) {
      Object.assign(entry.result.damageApplication, liveEntry);
    }
    if (entry?.damageApplication) {
      Object.assign(entry.damageApplication, liveEntry);
    }
  }
}

export async function markAreaAttackDamageState({
  requestId = "",
  applicationId = "",
  targetTokenId = "",
  defenderUuid = "",
  messageId = "",
  state = "pending",
  applied = false,
  claimedByUserId = "",
  claimedAt = null,
  appliedAt = Date.now(),
  appliedByUserId = game.user?.id ?? "",
  lastError = ""
} = {}) {
  if (!requestId || (!applicationId && !targetTokenId && !defenderUuid)) return false;

  const progressMessage = game.messages?.find?.((candidate) => {
    const request = getAreaAttackRequestFromMessage(candidate);
    return String(request?.requestId ?? "") === String(requestId);
  }) ?? null;

  if (!progressMessage) return false;

  const request = foundry.utils.deepClone(
    getAreaAttackRequestFromMessage(progressMessage)
  );
  const target = request?.targets?.find?.((entry) => {
    const application = entry?.damageApplication ?? {};
    if (
      applicationId &&
      String(application.applicationId ?? "") === String(applicationId)
    ) {
      return true;
    }

    const candidateTokenId = String(
      application.targetTokenId ?? entry.tokenId ?? ""
    );
    if (targetTokenId && candidateTokenId === String(targetTokenId)) {
      return true;
    }

    return defenderUuid &&
      String(application.defenderUuid ?? entry.actorUuid ?? "") ===
        String(defenderUuid);
  });

  if (!target?.damageApplication) return false;

  target.damageApplication.messageId =
    String(messageId || target.damageApplication.messageId || "");
  target.damageApplication.state = String(state ?? "pending");
  target.damageApplication.applied = Boolean(applied);
  target.damageApplication.claimedByUserId = String(claimedByUserId ?? "");
  target.damageApplication.claimedAt = claimedAt ?? null;
  target.damageApplication.appliedAt = applied ? appliedAt : null;
  target.damageApplication.appliedByUserId = applied
    ? String(appliedByUserId ?? "")
    : "";
  target.damageApplication.lastError = String(lastError ?? "");

  await updateAreaProgressMessage(progressMessage, request);
  return true;
}

export async function markAreaAttackDamageApplied({
  requestId = "",
  applicationId = "",
  targetTokenId = "",
  defenderUuid = "",
  messageId = "",
  appliedAt = Date.now(),
  appliedByUserId = game.user?.id ?? ""
} = {}) {
  return markAreaAttackDamageState({
    requestId,
    applicationId,
    targetTokenId,
    defenderUuid,
    messageId,
    state: "applied",
    applied: true,
    appliedAt,
    appliedByUserId
  });
}

function isAreaBulkDamageActive(bulkDamage = {}) {
  if (!bulkDamage?.active) return false;
  const requestedAt = Number(bulkDamage?.requestedAt ?? 0);
  return Boolean(requestedAt && Date.now() - requestedAt < 2 * 60 * 1000);
}

export async function bindAreaAttackBulkDamageCard(message, root) {
  if (!message || !root?.querySelectorAll) return;

  const summaryReference = getAreaDamageSummaryFromMessage(message);
  const progressMessage = getAreaAttackRequestFromMessage(message)
    ? message
    : (
        game.messages?.get(summaryReference?.progressMessageId) ??
        game.messages?.find?.((candidate) => {
          const request = getAreaAttackRequestFromMessage(candidate);
          return String(request?.requestId ?? "") ===
            String(summaryReference?.requestId ?? "");
        }) ??
        null
      );
  const areaRequest = getAreaAttackRequestFromMessage(progressMessage);

  if (!progressMessage || !areaRequest?.requestId) return;

  const buttons = root.querySelectorAll(
    "[data-action='dda-apply-all-area-damage']"
  );
  if (!buttons.length) return;

  const complete = ["resolved", "prevented", "cancelled"].includes(
    String(areaRequest.status ?? "")
  );
  const pendingTargets = Array.isArray(areaRequest.targets)
    ? areaRequest.targets.filter((target) => {
        const application = target?.damageApplication;
        const state = String(
          application?.applied ? "applied" : application?.state ?? "pending"
        ).toLowerCase();
        return String(target?.status ?? "") === "resolved" &&
          Number(application?.damage ?? target?.finalDamage ?? 0) > 0 &&
          state !== "applied" &&
          !isAttackDamageApplicationInFlight(application);
      })
    : [];
  const canUse = Boolean(
    game.user?.isGM &&
    complete &&
    pendingTargets.length > 0 &&
    !isAreaBulkDamageActive(areaRequest.bulkDamage)
  );

  for (const button of buttons) {
    if (button.dataset.ddaAreaBulkDamageBound === "true") continue;
    button.dataset.ddaAreaBulkDamageBound = "true";
    button.hidden = !canUse;
    button.disabled = !canUse;

    if (!canUse) continue;

    button.addEventListener("click", async (event) => {
      event.preventDefault();

      if (button.dataset.ddaAreaBulkDamageInFlight === "true") return;

      button.dataset.ddaAreaBulkDamageInFlight = "true";
      button.disabled = true;

      const request = foundry.utils.deepClone(
        getAreaAttackRequestFromMessage(progressMessage) ?? areaRequest
      );
      request.bulkDamage = {
        active: true,
        requestedByUserId: game.user.id,
        requestedAt: Date.now(),
        appliedCount: 0,
        failedCount: 0
      };

      try {
        await updateAreaProgressMessage(progressMessage, request);
      } catch (error) {
        console.error(
          "DDA | Could not start bulk Area Attack damage.",
          error
        );
        delete button.dataset.ddaAreaBulkDamageInFlight;
        button.disabled = false;
        ui.notifications.error(text(
          "Não foi possível iniciar a aplicação coletiva de dano.",
          "Could not start bulk damage application."
        ));
        return;
      }

      let appliedCount = 0;
      let failedCount = 0;
      let bulkUnhandledError = null;

      try {
        const attacker = await resolveActorDocument(request.attackerUuid);

        for (const target of request.targets ?? []) {
          const application = target?.damageApplication;
          if (!application) continue;
          if (String(target.status ?? "") !== "resolved") continue;
          if (Number(application.damage ?? 0) <= 0) continue;
          if (application.applied || String(application.state ?? "") === "applied") continue;

          const damageMessage = getAreaDamageMessage(application);
          const liveDamageEntry = getAreaDamageEntryFromMessage(damageMessage) ?? application;

          if (
            liveDamageEntry?.applied ||
            String(liveDamageEntry?.state ?? "") === "applied"
          ) {
            application.state = "applied";
            application.applied = true;
            application.appliedAt = liveDamageEntry.appliedAt ?? Date.now();
            application.appliedByUserId = String(
              liveDamageEntry.appliedByUserId ?? ""
            );
            try {
              await updateAreaProgressMessage(progressMessage, request);
            } catch (_error) {
              // The final refresh below will retry the shared summary update.
            }
            continue;
          }

          let claim = null;
          try {
            claim = damageMessage
              ? await claimAttackDamageApplication(damageMessage, liveDamageEntry)
              : { granted: true, legacy: true };
          } catch (error) {
            failedCount += 1;
            console.error(
              `DDA | Could not claim Area Attack damage for ${target.name ?? "target"}.`,
              error
            );
            continue;
          }

          if (!claim?.granted) {
            if (claim?.reason === "applied") {
              application.state = "applied";
              application.applied = true;
              continue;
            }
            failedCount += 1;
            continue;
          }

          const defender = await resolveActorDocument(application.defenderUuid);
          if (!defender) {
            failedCount += 1;
            if (damageMessage && !claim?.legacyNoGM) {
              try {
                await finalizeAttackDamageApplication(damageMessage, liveDamageEntry, {
                  success: false,
                  errorMessage: "Defender could not be resolved."
                });
              } catch (_error) {
                // A stale claim will become reclaimable automatically.
              }
            }
            continue;
          }

          let result = null;
          try {
            result = await applyDamage(
              defender,
              Number(application.damage),
              {
                damageType: application.damageType,
                damageLabel: application.damageLabel,
                holdBack: Boolean(application.holdBack),
                tamerIntercede: Boolean(application.tamerIntercede),
                digimonIntercede: Boolean(application.digimonIntercede),
                unalterable: Boolean(application.unalterable),
                unalterablePortion: Math.max(
                  0,
                  Number(application.unalterablePortion ?? 0)
                ),
                attacker,
                focusTempMultiplier: Math.max(
                  1,
                  Number(application.focusTempMultiplier ?? 1)
                ),
                lifestealCap: Math.max(
                  0,
                  Number(application.lifestealCap ?? 0)
                ),
                lifestealKey: String(application.lifestealKey ?? ""),
                applicationId: String(application.applicationId ?? "")
              }
            );

            if (!result) {
              throw new Error("Damage application returned no result.");
            }

            await resolveAttackDamagePostProcessing(defender, result, {
              digimonIntercede: Boolean(application.digimonIntercede)
            });
          } catch (error) {
            failedCount += 1;
            console.error(
              `DDA | Could not apply Area Attack damage to ${target.name ?? "target"}.`,
              error
            );
            if (damageMessage && !claim?.legacyNoGM) {
              try {
                await finalizeAttackDamageApplication(damageMessage, liveDamageEntry, {
                  success: false,
                  errorMessage: String(error?.message ?? error ?? "")
                });
              } catch (_finalizeError) {
                // Actor-side application history prevents duplicate Wound loss
                // if the card cannot be synchronized immediately.
              }
            }
            continue;
          }

          application.state = "applied";
          application.applied = true;
          application.appliedAt = Date.now();
          application.appliedByUserId = String(game.user.id ?? "");
          appliedCount += 1;

          if (damageMessage) {
            try {
              await finalizeAttackDamageApplication(damageMessage, liveDamageEntry, {
                success: true
              });
            } catch (error) {
              console.warn(
                "DDA | Damage was applied, but the individual Area Attack card could not be synchronized.",
                error
              );
            }
          }

          try {
            await updateAreaProgressMessage(progressMessage, request);
          } catch (error) {
            console.warn(
              "DDA | Damage was applied, but the Area Attack summary could not be refreshed immediately.",
              error
            );
          }
        }
      } catch (error) {
        bulkUnhandledError = error;
        failedCount += 1;
        console.error("DDA | Bulk Area Attack damage aborted unexpectedly.", error);
      } finally {
        request.bulkDamage = {
          active: false,
          requestedByUserId: game.user.id,
          requestedAt: request.bulkDamage?.requestedAt ?? Date.now(),
          completedAt: Date.now(),
          appliedCount,
          failedCount
        };

        try {
          await updateAreaProgressMessage(progressMessage, request);
        } catch (error) {
          console.warn(
            "DDA | Bulk damage finished, but the Area Attack summary could not be finalized.",
            error
          );
        }

        delete button.dataset.ddaAreaBulkDamageInFlight;
        button.disabled = false;
      }

      if (bulkUnhandledError) {
        ui.notifications.warn(text(
          `A aplicação coletiva foi interrompida após ${appliedCount} alvo(s). Os danos restantes continuam disponíveis para resolução manual.`,
          `Bulk damage was interrupted after ${appliedCount} target(s). Remaining damage can still be resolved manually.`
        ));
      } else if (failedCount > 0) {
        ui.notifications.warn(text(
          `Dano aplicado a ${appliedCount} alvo(s); ${failedCount} precisa(m) de resolução manual.`,
          `Damage applied to ${appliedCount} target(s); ${failedCount} require manual resolution.`
        ));
      } else {
        ui.notifications.info(text(
          `Dano aplicado a ${appliedCount} alvo(s) afetado(s).`,
          `Damage applied to ${appliedCount} affected target(s).`
        ));
      }
    });
  }
}

async function movePassAttackerToTemplateEnd(attackerToken, templateData) {
  if (!attackerToken?.document || !templateData) return false;

  const direction = Number(templateData.direction ?? 0) * Math.PI / 180;
  const spaces = Math.max(
    0,
    Number(templateData.distance ?? 0) / getGridDistance()
  );
  const pixels = spaces * getGridSize();
  const origin = {
    x: Number(templateData.x ?? getTokenCenter(attackerToken).x),
    y: Number(templateData.y ?? getTokenCenter(attackerToken).y)
  };
  const center = {
    x: origin.x + Math.cos(direction) * pixels,
    y: origin.y + Math.sin(direction) * pixels
  };
  const destination = {
    x: center.x - Number(attackerToken.w ?? getGridSize()) / 2,
    y: center.y - Number(attackerToken.h ?? getGridSize()) / 2
  };
  const snapped = canvas.grid?.getSnappedPoint
    ? canvas.grid.getSnappedPoint(destination, {
        mode: CONST.GRID_SNAPPING_MODES?.TOP_LEFT_VERTEX ?? CONST.GRID_SNAPPING_MODES?.CENTER
      })
    : destination;

  await attackerToken.document.update({
    x: Math.round(Number(snapped.x ?? destination.x)),
    y: Math.round(Number(snapped.y ?? destination.y))
  }, withDDAMovementContext({
    ddaForcedMovement: true,
    ddaAreaPassMovement: true
  }, {
    mode: "automated", movementBudget: "none", voluntary: true, reactions: true,
    traversal: true, source: "areaPass", unwilling: false
  }));

  return true;
}

function getAreaRequestFlag(message) {
  return message?.getFlag?.(game.system.id, AREA_REQUEST_FLAG)
    ?? message?.flags?.[game.system.id]?.[AREA_REQUEST_FLAG]
    ?? null;
}

async function waitForAreaDodgeMode(message, requestId, { timeoutMs = 5 * 60 * 1000 } = {}) {
  if (!message?.id || !requestId) return null;

  return new Promise((resolve) => {
    let settled = false;
    let updateHook = null;
    let deleteHook = null;
    let timer = null;

    const finish = (mode) => {
      if (settled) return;
      settled = true;
      if (updateHook !== null) Hooks.off("updateChatMessage", updateHook);
      if (deleteHook !== null) Hooks.off("deleteChatMessage", deleteHook);
      if (timer !== null) globalThis.clearTimeout(timer);
      resolve(mode);
    };

    const inspect = (candidate) => {
      if (!candidate || String(candidate.id ?? "") !== String(message.id)) return;
      const request = getAreaRequestFlag(candidate);
      if (String(request?.requestId ?? "") !== String(requestId)) return;
      const explicitMode = String(request?.bulkDodge?.mode ?? "").trim();
      if (explicitMode === "bulk" || explicitMode === "individual") {
        finish(explicitMode);
        return;
      }
      if (request?.bulkDodge?.active) finish("bulk");
    };

    updateHook = Hooks.on("updateChatMessage", (updatedMessage) => {
      inspect(updatedMessage);
    });

    deleteHook = Hooks.on("deleteChatMessage", (deletedMessage) => {
      if (String(deletedMessage?.id ?? "") === String(message.id)) finish(null);
    });

    timer = globalThis.setTimeout(() => finish(null), Math.max(1_000, Number(timeoutMs) || 300_000));
    inspect(game.messages?.get(message.id) ?? message);
  });
}

export async function runAreaAttackWorkflow({
  attacker,
  attackItem,
  attackOptions = {},
  attackerToken,
  areaTags = [],
  attackRangeTotal = 0,
  qualityAttackModifier = {},
  resolveTarget
} = {}) {
  if (attackOptions.__ddaAreaChild || attackOptions.areaAttackActive === false) {
    return { handled: false };
  }

  if (!canvas?.ready || !canvas?.scene || !attackerToken) {
    return { handled: false };
  }

  const normalizedTags = [...new Set(
    areaTags.map(normalizeAreaTag).filter(Boolean)
  )];
  if (!normalizedTags.length) return { handled: false };

  const forcedTag = normalizeAreaTag(attackOptions?.areaAttackForcedTag ?? "");
  const mode = forcedTag
    ? { mode: "area", tag: forcedTag }
    : await promptAreaMode({
        attackItem,
        areaTags: normalizedTags
      });

  if (mode === null) return { handled: true, result: null };

  if (mode?.mode === "regular") {
    return {
      handled: false,
      suppressLegacyAreaPrompt: true
    };
  }

  if (mode?.mode !== "area") return { handled: false };

  const tag = normalizeAreaTag(mode.tag);
  let bounds = getAreaSizeBounds({
    attacker,
    attackItem,
    tag,
    qualityAttackModifier
  });

  const fixedSize = Math.max(0, Math.floor(Number(attackOptions?.areaAttackFixedSize ?? 0)));
  if (bounds && fixedSize > 0) {
    bounds = { ...bounds, base: fixedSize, maximum: fixedSize };
  }

  if (!bounds) {
    ui.notifications.warn(text(
      `O formato [${tag.toUpperCase()}] não é válido para este tipo de Ataque ou ainda não está automatizado.`,
      `The [${tag.toUpperCase()}] shape is not valid for this Attack type or is not automated yet.`
    ));
    return { handled: true, result: null };
  }

  const configuration = await promptAreaConfiguration({
    attacker,
    attackItem,
    tag,
    bounds,
    qualityAttackModifier
  });
  if (!configuration) return { handled: true, result: null };

  const requestId = foundry.utils.randomID();
  const forcedAll = hasIndiscriminateTargeting(attacker);
  let templateDocument = null;
  let selectedTargets = [];
  let templateData = null;
  let mobileArtilleryTerrain = null;
  let preserveTemplate = false;

  try {
    while (true) {
      const previewData = buildTemplateData({
        attackerToken,
        tag,
        size: configuration.size,
        requestId
      });
      const normalizedTag = normalizeAreaTag(tag);
      const fixedOrigin = ["t:cone", "t:line", "t:pass"].includes(normalizedTag);

      templateData = normalizedTag === "t:burst"
        ? previewData
        : await drawTemplatePreview(previewData, {
            attackerToken,
            fixedOrigin,
            rotateOnly: ["t:cone", "t:line", "t:pass"].includes(normalizedTag)
          });

      if (!templateData) return { handled: true, result: null };

      const placement = validateTemplatePlacement({
        attackerToken,
        tag,
        templateData,
        attackRangeTotal
      });

      if (!placement.valid) {
        ui.notifications.warn(placement.message);
        if (normalizedTag === "t:burst") {
          return { handled: true, result: null };
        }
        continue;
      }

      templateDocument = await createPersistentTemplate(templateData);
      if (!templateDocument) {
        ui.notifications.error(text(
          "Não foi possível criar o template do Ataque em Área.",
          "Could not create the Area Attack template."
        ));
        return { handled: true, result: null };
      }

      const candidates = filterAreaTargets({
        attacker,
        attackerToken,
        templateDocument,
        tag,
        targetMode: configuration.targetMode,
        forcedAll
      });

      if (!candidates.length) {
        ui.notifications.warn(text(
          "Nenhum alvo válido foi encontrado dentro da área.",
          "No valid targets were found inside the area."
        ));
        await deletePersistentTemplate(templateDocument);
        templateDocument = null;

        if (normalizedTag === "t:burst") {
          return { handled: true, result: null };
        }
        continue;
      }

      const confirmation = await confirmAreaTargets({
        attackItem,
        tag,
        size: configuration.size,
        targetMode: configuration.targetMode,
        targetTokens: candidates,
        forcedAll
      });

      if (confirmation === "reposition") {
        await deletePersistentTemplate(templateDocument);
        templateDocument = null;
        continue;
      }

      if (!confirmation) return { handled: true, result: null };

      const selectedIds = new Set(confirmation);
      selectedTargets = candidates.filter((token) => {
        return selectedIds.has(token.id);
      });

      if (!selectedTargets.length) {
        ui.notifications.warn(text(
          "Selecione ao menos um alvo para o Ataque em Área.",
          "Select at least one target for the Area Attack."
        ));
        await deletePersistentTemplate(templateDocument);
        templateDocument = null;
        continue;
      }

      break;
    }

    const frenzyAreaValidation = game?.dda?.bossQualities?.validateFrenzyAttack?.({
      attacker,
      targetToken: selectedTargets[0] ?? null,
      attackFunctionType: String(attackItem?.system?.baseTags?.functionType ?? "damage"),
      hasNegativeEffect: [
        attackItem?.system?.effectTag?.enabled ? attackItem.system.effectTag.tag ?? "" : "",
        ...(qualityAttackModifier?.effectTags ?? [])
      ].filter(Boolean).some((tag) => {
        const key = String(tag ?? "").trim().replace(/^\[|\]$/g, "").toLowerCase();
        const type = String(EFFECT_TAGS?.[key]?.type ?? "").toLowerCase();
        return type === "negative";
      }),
      areaTargetActorUuids: selectedTargets.map((token) => String(token.actor?.uuid ?? "")).filter(Boolean)
    });
    if (frenzyAreaValidation?.active && !frenzyAreaValidation.allowed) {
      ui.notifications.warn(frenzyAreaValidation.message);
      await deletePersistentTemplate(templateDocument);
      return { handled: true, result: null };
    }

    if (hasMobileArtillery(attacker, attackItem, qualityAttackModifier)) {
      mobileArtilleryTerrain = await promptMobileArtilleryTerrain({
        attacker,
        attackItem
      });
    }

    let areaIntercedeArmorBonuses = new Map();
    let areaIntercedeReactions = [];
    const areaIntercedeState = await resolveAreaIntercedeReactions({
      attacker,
      attackerToken,
      attackItem,
      attackOptions,
      qualityAttackModifier,
      templateDocument,
      tag,
      targetMode: configuration.targetMode,
      forcedAll,
      selectedTargets
    });
    selectedTargets = areaIntercedeState.selectedTargets;
    areaIntercedeArmorBonuses = areaIntercedeState.armorBonusesByTokenId;
    areaIntercedeReactions = areaIntercedeState.reactions;

    if (!selectedTargets.length) {
      ui.notifications.warn(text(
        "Todos os alvos foram removidos da área por Intercedes. O ataque não possui mais um alvo válido.",
        "All targets were removed from the area by Intercedes. The attack no longer has a valid target."
      ));
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: attacker }),
        content: `<div class="dda-chat-card dda-intercede-card is-resolved"><h2>${text("Ataque em Área interceptado", "Area Attack intercepted")}</h2><p>${text("As Intercedes removeram todos os alvos da área antes das rolagens.", "The Intercedes removed every target from the area before rolls were made.")}</p></div>`
      });
      await deletePersistentTemplate(templateDocument);
      return { handled: true, result: null };
    }

    const originDistance = getTemplateOriginDistance(
      attackerToken,
      templateData
    );
    const results = selectedTargets.map((token) => ({
      token,
      result: null,
      status: "pending"
    }));

    let sharedAccuracyResult = null;
    let sharedHugePowerReroll = null;
    let sharedOverpowerResult = null;
    let sharedTamerAttackTalent = null;
    let sharedElementalForceUsed = null;
    let sharedAssuredDestructionConverted = 0;
    let finalizeAttackUse = null;
    let accuracySuccesses = null;
    const hasEnemyTargets = selectedTargets.some((token) => {
      return token?.actor && !areActorsAllies(attacker, token.actor);
    });
    let workflowStatus = hasEnemyTargets
      ? "awaitingDodgeMode"
      : "awaitingAccuracy";
    let progressMessage = null;

    const buildProgressFlags = ({
      bulkDodge = null,
      bulkDamage = null,
      damageSummaryMessageId = "",
      liveTargets = []
    } = {}) => {
      const targets = serializeAreaEntries(results, attacker);

      for (const target of targets) {
        const application = target.damageApplication ?? null;
        if (!application) continue;

        const applicationId = String(application.applicationId ?? "");
        const targetTokenId = String(application.targetTokenId ?? target.tokenId ?? "");
        const defenderUuid = String(application.defenderUuid ?? target.actorUuid ?? "");

        const liveTarget = liveTargets.find?.((candidate) => {
          const candidateApplication = candidate?.damageApplication ?? null;
          if (!candidateApplication) return false;

          if (applicationId) {
            return String(candidateApplication.applicationId ?? "") === applicationId;
          }

          if (targetTokenId) {
            return String(candidateApplication.targetTokenId ?? candidate?.tokenId ?? "") === targetTokenId;
          }

          const candidateUuid = String(
            candidateApplication.defenderUuid ??
            candidate?.actorUuid ??
            ""
          );
          return Boolean(defenderUuid && candidateUuid === defenderUuid);
        });

        if (!liveTarget?.damageApplication) continue;

        const liveApplication = liveTarget.damageApplication;
        application.state = getEntryDamageState({ damageApplication: liveApplication });
        application.claimedByUserId = String(liveApplication.claimedByUserId ?? "");
        application.claimedAt = liveApplication.claimedAt ?? null;
        application.areaReady = Boolean(liveApplication.areaReady);
        application.lastError = String(liveApplication.lastError ?? "");
        application.applied = Boolean(liveApplication.applied);
        application.appliedAt = liveApplication.appliedAt ?? null;
        application.appliedByUserId = String(liveApplication.appliedByUserId ?? "");
      }

      return {
        [game.system.id]: {
          [AREA_REQUEST_FLAG]: {
            requestId,
            status: workflowStatus,
            attackerUuid: attacker.uuid,
            attackerName: attacker.name,
            attackerTokenId: attackerToken.id,
            attackItemUuid: attackItem.uuid,
            attackName: attackItem.name,
            tag,
            size: configuration.size,
            targetMode: configuration.targetMode,
            accuracySuccesses,
            templateId: templateDocument?.id ?? "",
            bulkDodge,
            bulkDamage,
            damageSummaryMessageId: String(damageSummaryMessageId ?? ""),
            targets
          }
        }
      };
    };

    const getLiveAreaRequest = () => {
      const liveMessage = game.messages?.get(progressMessage?.id) ?? progressMessage;

      return liveMessage?.getFlag?.(game.system.id, AREA_REQUEST_FLAG)
        ?? liveMessage?.flags?.[game.system.id]?.[AREA_REQUEST_FLAG]
        ?? null;
    };

    const updateProgressMessage = async () => {
      if (!progressMessage) return;

      try {
        const liveRequest = getLiveAreaRequest();
        const bulkDodge = liveRequest?.bulkDodge ?? null;
        const bulkDamage = liveRequest?.bulkDamage ?? null;
        const damageSummaryMessageId = String(
          liveRequest?.damageSummaryMessageId ?? ""
        );

        const progressFlags = buildProgressFlags({
          bulkDodge,
          bulkDamage,
          damageSummaryMessageId,
          liveTargets: liveRequest?.targets ?? []
        });
        const progressRequest =
          progressFlags?.[game.system.id]?.[AREA_REQUEST_FLAG] ?? null;

        await progressMessage.update({
          content: buildAreaStatusCard({
            requestId,
            attacker,
            attackItem,
            tag,
            size: configuration.size,
            targetMode: configuration.targetMode,
            entries: progressRequest?.targets ?? results,
            accuracySuccesses,
            status: workflowStatus,
            bulkDodge,
            bulkDamage,
            damageSummaryMessageId
          }),
          flags: progressFlags
        });
      } catch (error) {
        console.warn(
          "DDA | Could not update the Area Attack progress card.",
          error
        );
      }
    };

    try {
      progressMessage = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: attacker }),
        content: buildAreaStatusCard({
          requestId,
          attacker,
          attackItem,
          tag,
          size: configuration.size,
          targetMode: configuration.targetMode,
          entries: results,
          accuracySuccesses,
          status: workflowStatus
        }),
        flags: buildProgressFlags()
      });
    } catch (error) {
      console.warn(
        "DDA | Could not create the Area Attack progress card.",
        error
      );
    }

    if (hasEnemyTargets && progressMessage) {
      const dodgeMode = await waitForAreaDodgeMode(progressMessage, requestId);

      if (!dodgeMode) {
        workflowStatus = "cancelled";
        for (const entry of results) entry.status = "cancelled";
        await updateProgressMessage();
        return { handled: true, result: null };
      }

      workflowStatus = "awaitingAccuracy";
      await updateProgressMessage();
    }

    for (let index = 0; index < selectedTargets.length; index += 1) {
      const token = selectedTargets[index];
      const entry = results[index];
      const secondary = index > 0;

      entry.status = "resolving";
      workflowStatus = sharedAccuracyResult
        ? "awaitingDodges"
        : "awaitingAccuracy";
      await updateProgressMessage();

      const zonerChoice = getZonerChoice(qualityAttackModifier);
      const originalFunctionType = String(
        attackItem?.system?.baseTags?.functionType ?? "damage"
      ).trim().toLowerCase();
      const friendlyFireActive = Boolean(
        configuration.targetMode === "all" &&
        originalFunctionType === "support" &&
        zonerChoice === "friendlyfire"
      );
      const targetIsAlly = areActorsAllies(attacker, token.actor);
      const functionTypeOverride = friendlyFireActive
        ? (targetIsAlly ? "support" : "damage")
        : "";

      const result = await resolveTarget(token, {
        ...attackOptions,
        __ddaAreaChild: true,
        targetToken: token,
        areaAttackActive: true,
        areaAttackTag: tag,
        areaAttackSize: configuration.size,
        areaAttackTargetMode: configuration.targetMode,
        areaAttackLabel: `[${tag.toUpperCase()}] ${text("Ataque em Área", "Area Attack")}`,
        areaBatch: {
          active: true,
          id: requestId,
          index,
          targetCount: selectedTargets.length,
          targetActorUuids: selectedTargets
            .map((selectedToken) => String(selectedToken.actor?.uuid ?? ""))
            .filter(Boolean),
          secondary,
          sharedAccuracyResult,
          sharedHugePowerReroll,
          sharedOverpowerResult,
          sharedTamerAttackTalent,
          sharedElementalForceUsed,
          sharedAssuredDestructionConverted,
          originDistance,
          isClosestAreaTarget: index === 0,
          insideBaseSize: tokenIsInsideBaseArea(
            token,
            templateData,
            bounds,
            attackerToken
          ),
          trueGuardianProtection: getTrueGuardianProtection({
            attacker,
            attackerToken,
            targetToken: token,
            selectedTargets,
            templateData
          }),
          areaIntercedeArmorBonus: Math.max(
            0,
            Number(areaIntercedeArmorBonuses.get(token.id) ?? 0)
          ),
          areaInterceded: areaIntercedeReactions.some((reaction) => {
            return String(reaction.tokenId ?? "") === String(token.id ?? "");
          }),
          areaIntercedeReactions,
          baseSize: Number(bounds.base ?? 0),
          selectedSize: Number(configuration.size ?? 0),
          mobileArtilleryTerrain,
          extraActionCost: index === 0
            ? Number(mobileArtilleryTerrain?.extraActionCost ?? 0)
            : 0,
          accuracyPenalty: 0,
          templateId: templateDocument.id,
          progressMessageId: progressMessage?.id ?? "",
          friendlyFireActive,
          functionTypeOverride,
          suppressEffectTags: Boolean(friendlyFireActive && !targetIsAlly)
        }
      });

      if (!result) {
        entry.status = "cancelled";

        if (!sharedAccuracyResult) {
          for (let next = index + 1; next < results.length; next += 1) {
            results[next].status = "skipped";
          }
          workflowStatus = "cancelled";
          await updateProgressMessage();
          break;
        }

        await updateProgressMessage();
        continue;
      }

      entry.result = result;
      finalizeAttackUse ??= result.finalizeAttackUse ?? null;
      sharedElementalForceUsed ??=
        result.declaredAttackQualityEffects?.elementalForceUsed ?? null;
      sharedAssuredDestructionConverted = Math.max(
        sharedAssuredDestructionConverted,
        Number(
          result.declaredAttackQualityEffects?.assuredDestructionConverted ?? 0
        )
      );

      if (result.attackPrevented) {
        /*
         * A defensive Quality negates this target's interaction with the
         * Area Attack. Other Tokens in the same area still resolve normally.
         */
        entry.status = "prevented";
        workflowStatus = sharedAccuracyResult
          ? "awaitingDodges"
          : "awaitingAccuracy";
        await updateProgressMessage();
        continue;
      }

      sharedAccuracyResult ??= result.accuracyRollResult ?? null;
      sharedHugePowerReroll ??= result.hugePowerReroll ?? null;
      sharedOverpowerResult ??= result.overpowerResult ?? null;
      sharedTamerAttackTalent ??= result.tamerAttackTalent ?? null;
      accuracySuccesses ??= Number(result.accuracySuccesses ?? 0);
      entry.status = "resolved";
      workflowStatus = "awaitingDodges";
      await updateProgressMessage();
    }

    const resolvedAttackResults = results
      .map((entry) => entry.result)
      .filter(Boolean);
    const anyAreaHit = resolvedAttackResults.some((result) => Boolean(result.hit));

    if (!anyAreaHit && resolvedAttackResults.length && !attackOptions?.fierceSoulRepeat) {
      const { maybeTriggerFierceSoulRepeat } = await import("../stance-qualities.js");
      await maybeTriggerFierceSoulRepeat({
        attacker,
        attackItem,
        hit: false,
        allAreaTargetsMissed: true,
        attackOptions: {
          ...attackOptions,
          areaAttackActive: true
        }
      });
    }

    if (anyAreaHit) {
      const { resolveWardEmblemAfterAttack } = await import("../utility-qualities.js");
      await resolveWardEmblemAfterAttack({ attacker, results: resolvedAttackResults });

      const { resolveInspiringGuidanceAfterAttack } = await import("../effect-qualities.js");
      await resolveInspiringGuidanceAfterAttack({
        attacker,
        attackItem,
        results: resolvedAttackResults,
        currentBattery: Number(resolvedAttackResults[0]?.signatureBatteryAtDeclaration ?? 0),
        isArea: true
      });

      if (resolvedAttackResults.some((result) => Number(result.qualityAttackModifier?.braveHeartBonusUsed ?? 0) > 0)) {
        const { consumeBraveHeartDamageBonus } = await import("../stance-qualities.js");
        await consumeBraveHeartDamageBonus(attacker);
      }

      const firstHit = resolvedAttackResults.find((result) => Boolean(result.hit));
      await maybeOfferHeroicExemplarAfterHit({
        attacker,
        defender: firstHit?.defender ?? null,
        hit: Boolean(firstHit)
      });
    }

    if (finalizeAttackUse) {
      await finalizeAttackUse({
        attackHit: anyAreaHit
      });
    }

    if (
      workflowStatus !== "cancelled" &&
      normalizeAreaTag(tag) === "t:pass"
    ) {
      await movePassAttackerToTemplateEnd(attackerToken, templateData);
    }

    if (workflowStatus !== "cancelled") {
      workflowStatus = "resolved";
      if (mobileArtilleryTerrain?.active) {
        preserveTemplate = await persistMobileArtilleryTerrain(
          templateDocument,
          mobileArtilleryTerrain,
          { attacker, requestId }
        );
      }
    }

    await updateProgressMessage();

    if (workflowStatus === "resolved") {
      try {
        await markAreaDamageEntriesReady(results);
        await updateProgressMessage();
      } catch (error) {
        console.warn(
          "DDA | Could not unlock the final Area Attack damage entries.",
          error
        );
      }
    }

    const finalRequest = foundry.utils.deepClone(
      getLiveAreaRequest() ?? {}
    );

    if (finalRequest?.requestId) {
      try {
        await ensureAreaDamageSummaryMessage(
          progressMessage,
          finalRequest,
          { attacker, attackItem }
        );
      } catch (error) {
        console.error(
          "DDA | Could not publish the final Area Attack damage card.",
          error
        );
        ui.notifications.warn(text(
          "As Esquivas terminaram, mas o card final de dano não pôde ser publicado. O controle de dano continua disponível no card original.",
          "Dodges are complete, but the final damage card could not be published. Damage controls remain available on the original card."
        ));
      }
    }

    return {
      handled: true,
      result: {
        areaAttack: true,
        requestId,
        tag,
        size: configuration.size,
        targetMode: configuration.targetMode,
        targets: selectedTargets,
        results,
        progressMessageId: progressMessage?.id ?? ""
      }
    };
  } finally {
    if (!preserveTemplate) {
      await deletePersistentTemplate(templateDocument);
    }
  }
}
