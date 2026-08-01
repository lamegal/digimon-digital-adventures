import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
import { buildQualityItemData } from "./digimon-quality-browser.js";

function english() {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
}

function text(pt, en) {
  return english() ? en : pt;
}

function escape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function identity(value = "") {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function qualityCostFromItem(item) {
  const rank = Math.max(1, Number(item.system?.rank?.value ?? 1));
  const perRank = item.system?.cost?.perRank !== false;
  return Math.max(0, Number(item.system?.cost?.dp ?? 0)) * (perRank ? rank : 1);
}

function qualityCost(definition, rank) {
  return Math.max(0, Number(definition?.cost?.dp ?? 0)) * (definition?.cost?.perRank === false ? 1 : rank);
}

function qualityIdentitySet(entry) {
  return new Set([
    entry?.id,
    entry?.name,
    entry?.originalName,
    entry?.system?.sourceId,
    entry?.system?.originalName
  ].map(identity).filter(Boolean));
}

function namedRequirements(definition) {
  return String(definition?.requirements?.qualityNames ?? "")
    .split(/[,;]+/).map(identity).filter(Boolean);
}

function validateModePackages(actor, defaults, modeRows) {
  const removedIds = new Set(defaults.selected.map((item) => item.id));
  const kept = actor.items.filter((item) => item.type === "quality" && !removedIds.has(item.id));
  const available = [...kept.map(qualityIdentitySet), ...modeRows.map((row) => qualityIdentitySet(row.definition))];
  const hasName = (name) => available.some((set) => set.has(identity(name)));

  for (const keptQuality of kept) {
    const missing = namedRequirements(keptQuality.system).filter((name) => !hasName(name));
    if (missing.length) {
      ui.notifications.warn(text(
        `${keptQuality.name} exige uma Qualidade que seria removida do Modo.`,
        `${keptQuality.name} requires a Quality that would be removed from the Mode.`
      ));
      return false;
    }
  }

  const actorStageValue = Math.max(0, number(actor.system?.stageValue ?? CONFIG.DDA?.stages?.[actor.system?.stage]?.stageValue));
  for (const row of modeRows) {
    const definition = row.definition;
    const minimumStage = String(definition.stageRequirement?.minimum ?? definition.availability?.minimumStage ?? "");
    const minimumValue = Math.max(0, number(CONFIG.DDA?.stages?.[minimumStage]?.stageValue));
    if (minimumValue > actorStageValue) {
      ui.notifications.warn(text(`${definition.name} exige um Estágio superior.`, `${definition.name} requires a higher Stage.`));
      return false;
    }
    const requirements = namedRequirements(definition);
    const matched = requirements.filter(hasName).length;
    const requirementMode = String(definition.requirements?.mode ?? "all").toLowerCase();
    if (requirements.length && (requirementMode === "any" ? matched === 0 : matched !== requirements.length)) {
      ui.notifications.warn(text(`${definition.name} não cumpre seus requisitos no Modo.`, `${definition.name} does not meet its requirements in the Mode.`));
      return false;
    }
    const incompatible = String(definition.incompatible?.qualityNames ?? "").split(/[,;]+/).map(identity).filter(Boolean);
    if (incompatible.some(hasName)) {
      ui.notifications.warn(text(`${definition.name} é incompatível com outra Qualidade do Modo.`, `${definition.name} is incompatible with another Mode Quality.`));
      return false;
    }
  }
  return true;
}

async function selectDefaultQualities(actor) {
  const excluded = new Set(["mudancademodo", "modechange", "mudancademodosuperior", "superiormodechange"]);
  const rows = actor.items.filter((item) => item.type === "quality")
    .filter((item) => !excluded.has(identity(item.system?.sourceId ?? item.name)))
    .map((item) => ({ item, cost: qualityCostFromItem(item) }))
    .filter((row) => row.cost > 0);
  if (!rows.length) return null;
  const stage = String(actor.system?.stage ?? "perfect");
  const stageValue = Math.max(0, Number(CONFIG.DDA?.stages?.[stage]?.stageValue ?? actor.system?.stageValue ?? 0));
  const limit = stageValue * 3;
  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-superior-mode-dialog"],
    position: { width: 620, height: "auto" },
    window: { title: text("Modo Superior — Qualidades Padrão", "Superior Mode — Default Qualities") },
    modal: true,
    content: `<form><p>${text(`Selecione até ${limit} PD em Qualidades compradas.`, `Select up to ${limit} DP in purchased Qualities.`)}</p>
      <div class="dda-superior-mode-list">${rows.map(({ item, cost }) => `
        <label><input type="checkbox" name="defaultQuality" value="${item.id}">
          <span>${escape(item.name)}</span><strong>${cost} ${text("PD", "DP")}</strong></label>`).join("")}</div></form>`,
    buttons: [
      { action: "confirm", label: text("Continuar", "Continue"), icon: "fa-solid fa-arrow-right", default: true,
        callback: (_event, button) => Array.from(button.form?.querySelectorAll?.('[name="defaultQuality"]:checked') ?? []).map((input) => input.value) },
      { action: "cancel", label: text("Cancelar", "Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
  if (!result?.length) return null;
  const selected = result.map((id) => actor.items.get(id)).filter(Boolean);
  const cost = selected.reduce((total, item) => total + qualityCostFromItem(item), 0);
  if (!cost || cost > limit) {
    ui.notifications.warn(text(`O conjunto Padrão deve custar entre 1 e ${limit} PD.`, `The Default package must cost between 1 and ${limit} DP.`));
    return null;
  }
  return { selected, cost, limit };
}

async function selectModeQualities(targetCost) {
  const excluded = new Set(["mudancademodo", "modechange", "mudancademodosuperior", "superiormodechange"]);
  const definitions = DDA_DIGIMON_QUALITIES.filter((definition) => !excluded.has(identity(definition.id)))
    .filter((definition) => Number(definition.cost?.dp ?? 0) > 0)
    .filter((definition) => !definition.category?.negative);
  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-superior-mode-dialog"],
    position: { width: 720, height: "auto" },
    window: { title: text("Modo Superior — Qualidades de Modo", "Superior Mode — Mode Qualities") },
    modal: true,
    content: `<form><p>${text(`O custo precisa ser exatamente ${targetCost} PD. Informe 0 para não selecionar.`, `The cost must equal exactly ${targetCost} DP. Enter 0 to omit a Quality.`)}</p>
      <div class="dda-superior-mode-list dda-superior-mode-list--qualities">${definitions.map((definition) => {
        const max = Math.max(1, Number(definition.rank?.max ?? 1));
        return `<label><span>${escape(definition.name)}</span><small>${Number(definition.cost?.dp ?? 0)} ${text("PD", "DP")}${definition.cost?.perRank === false ? "" : text("/Rank", "/Rank")}</small>
          <input type="number" name="modeQuality.${escape(definition.id)}" min="0" max="${max}" value="0"></label>`;
      }).join("")}</div></form>`,
    buttons: [
      { action: "confirm", label: text("Continuar", "Continue"), icon: "fa-solid fa-arrow-right", default: true,
        callback: (_event, button) => definitions.map((definition) => ({
          definition,
          rank: Math.max(0, Number(button.form?.elements?.namedItem?.(`modeQuality.${definition.id}`)?.value ?? 0))
        })).filter((row) => row.rank > 0) },
      { action: "cancel", label: text("Cancelar", "Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
  if (!result?.length) return null;
  const cost = result.reduce((total, row) => total + qualityCost(row.definition, row.rank), 0);
  if (cost !== targetCost) {
    ui.notifications.warn(text(`As Qualidades de Modo custam ${cost} PD; o total exigido é ${targetCost} PD.`, `Mode Qualities cost ${cost} DP; exactly ${targetCost} DP is required.`));
    return null;
  }
  return result;
}

async function selectAttacks(actor, requiredIds) {
  const attacks = actor.items.filter((item) => item.type === "attack");
  if (!attacks.length) return [];
  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-superior-mode-dialog"],
    position: { width: 600, height: "auto" },
    window: { title: text("Modo Superior — Ataques", "Superior Mode — Attacks") },
    modal: true,
    content: `<form><p>${text("Selecione os Ataques que serão substituídos. Os vinculados às Qualidades Padrão já estão marcados e são obrigatórios.", "Select the Attacks to replace. Attacks linked to Default Qualities are already checked and required.")}</p>
      <div class="dda-superior-mode-list">${attacks.map((attack) => {
        const required = requiredIds.has(attack.id);
        return `<label><input type="checkbox" name="defaultAttack" value="${attack.id}" ${required ? "checked disabled" : ""}><span>${escape(attack.name)}</span>${required ? `<strong>${text("Obrigatório", "Required")}</strong>` : ""}</label>`;
      }).join("")}</div></form>`,
    buttons: [
      { action: "confirm", label: text("Criar Ataques de Modo", "Create Mode Attacks"), icon: "fa-solid fa-copy", default: true,
        callback: (_event, button) => Array.from(button.form?.querySelectorAll?.('[name="defaultAttack"]:checked') ?? []).map((input) => input.value) },
      { action: "cancel", label: text("Cancelar", "Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
  return result;
}

export async function configureSuperiorModeChange(actor, superiorItem, qualityBrowser) {
  const defaults = await selectDefaultQualities(actor);
  if (!defaults) return false;
  const modeRows = await selectModeQualities(defaults.cost);
  if (!modeRows) return false;
  if (!validateModePackages(actor, defaults, modeRows)) return false;

  const requiredAttackIds = new Set(defaults.selected.flatMap((quality) =>
    (quality.system?.choices?.selectedRanks ?? []).map((choice) => choice?.attackId).filter(Boolean)
  ));
  const defaultQualityKeys = new Set(defaults.selected.flatMap((quality) => [
    quality.id,
    quality.system?.sourceId,
    quality.system?.originalName,
    quality.name
  ]).map(identity).filter(Boolean));
  for (const attack of actor.items.filter((item) => item.type === "attack")) {
    const tagSources = [
      attack.system?.effectTag?.sourceQualityId,
      ...(attack.system?.qualityTags ?? []).flatMap((tag) => [
        tag?.sourceQualityId,
        tag?.qualityId,
        tag?.sourceId
      ])
    ].map(identity).filter(Boolean);
    if (tagSources.some((source) => defaultQualityKeys.has(source))) requiredAttackIds.add(attack.id);
  }
  const defaultAttackIds = await selectAttacks(actor, requiredAttackIds);
  if (defaultAttackIds === null) return false;

  const defaultAttacks = defaultAttackIds.map((id) => actor.items.get(id)).filter(Boolean);
  const defaultTagsByAttack = new Map();
  for (const quality of defaults.selected) {
    for (const choice of quality.system?.choices?.selectedRanks ?? []) {
      const attackId = String(choice?.attackId ?? "");
      if (!attackId) continue;
      const tags = defaultTagsByAttack.get(attackId) ?? new Set();
      for (const tag of [choice?.attackTag, choice?.effectTag]) {
        if (tag) tags.add(identity(tag));
      }
      defaultTagsByAttack.set(attackId, tags);
    }
  }
  const modeAttackData = defaultAttacks.map((attack, index) => {
    const data = attack.toObject();
    delete data._id;
    data.name = `${attack.name} — ${text("Modo", "Mode")}`;
    const boundDefaultTags = defaultTagsByAttack.get(attack.id) ?? new Set();
    data.system.qualityTags = (data.system?.qualityTags ?? []).filter((tag) => {
      const source = identity(tag?.sourceQualityId ?? tag?.qualityId ?? tag?.sourceId);
      const tagKey = identity(tag?.key ?? tag?.tag ?? tag?.value ?? tag);
      return !defaultQualityKeys.has(source) && !boundDefaultTags.has(tagKey);
    });
    if (
      defaultQualityKeys.has(identity(data.system?.effectTag?.sourceQualityId)) ||
      boundDefaultTags.has(identity(data.system?.effectTag?.tag))
    ) {
      data.system.effectTag = { enabled: false, tag: "", type: "", sourceQualityId: "", potencyStat: "", duration: true };
    }
    data.flags ??= {};
    data.flags[game.system.id] = {
      ...(data.flags[game.system.id] ?? {}),
      superiorModeRole: "mode",
      superiorModeKey: `mode-attack:${index}`
    };
    return data;
  });
  const modeAttacks = modeAttackData.length
    ? await actor.createEmbeddedDocuments("Item", modeAttackData)
    : [];
  if (defaultAttacks.length) {
    await actor.updateEmbeddedDocuments("Item", defaultAttacks.map((attack, index) => ({
      _id: attack.id,
      [`flags.${game.system.id}.superiorModeRole`]: "default",
      [`flags.${game.system.id}.superiorModeKey`]: `default-attack:${index}`
    })));
  }

  const cleanupIncompleteConfiguration = async () => {
    if (modeAttacks.length) await actor.deleteEmbeddedDocuments("Item", modeAttacks.map((item) => item.id));
    if (defaultAttacks.length) {
      await actor.updateEmbeddedDocuments("Item", defaultAttacks.map((attack) => ({
        _id: attack.id,
        [`flags.${game.system.id}.-=superiorModeRole`]: null,
        [`flags.${game.system.id}.-=superiorModeKey`]: null
      })));
    }
  };

  const modeQualities = [];
  qualityBrowser._superiorModeAttackIds = new Set(modeAttacks.map((item) => item.id));
  try {
    for (const row of modeRows) {
      const data = buildQualityItemData(row.definition);
      data.system.rank = { ...(data.system.rank ?? {}), value: row.rank };
      const choices = [];
      if (row.definition.choices?.required) {
        const choiceCount = row.definition.choices?.repeatOnRankIncrease === false ? 1 : row.rank;
        for (let rank = 1; rank <= choiceCount; rank += 1) {
          const choice = await qualityBrowser._promptQualityChoice(row.definition, rank, choices);
          if (!choice) {
            await cleanupIncompleteConfiguration();
            return false;
          }
          choices.push(choice);
        }
        data.system.choices = { ...(data.system.choices ?? {}), selectedRanks: choices };
      }
      data.flags = {
        ...(data.flags ?? {}),
        [game.system.id]: { superiorModeRole: "mode", superiorModeKey: row.definition.id }
      };
      modeQualities.push(data);
    }
  } finally {
    qualityBrowser._superiorModeAttackIds = null;
  }

  await superiorItem.update({
    "system.superiorModeChange.enabled": true,
    "system.superiorModeChange.activeMode": "default",
    "system.superiorModeChange.configuration": {
      complete: true,
      defaultCost: defaults.cost,
      modeCost: defaults.cost,
      defaultQualityIds: defaults.selected.map((item) => item.id),
      defaultQualities: defaults.selected.map((item) => item.toObject()),
      modeQualities,
      defaultAttackIds: defaultAttacks.map((item) => item.id),
      defaultAttackKeys: defaultAttacks.map((item) => item.id),
      modeAttackIds: modeAttacks.map((item) => item.id),
      modeAttacks: modeAttacks.map((item) => item.toObject())
    }
  });
  ui.notifications.info(text(
    "Mudança de Modo Superior configurada. Edite os novos Ataques de Modo na ficha antes do combate.",
    "Superior Mode Change configured. Edit the new Mode Attacks on the sheet before Combat."
  ));
  return true;
}
