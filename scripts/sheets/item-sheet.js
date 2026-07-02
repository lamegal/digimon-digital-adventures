const ItemSheetV1 = foundry.appv1.sheets.ItemSheet;

export class DDAItemSheet extends ItemSheetV1 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dda", "sheet", "item"],
      template: "systems/digimon-digital-adventures/templates/item/item-sheet.html",
      width: 640,
      height: 600,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "details"
        }
      ]
    });
  }

  get template() {
    const path = "systems/digimon-digital-adventures/templates/item";

    const templates = {
      attack: `${path}/attack-sheet.html`,
      quality: `${path}/quality-sheet.html`,
      torment: `${path}/torment-sheet.html`,
      tamerTalent: `${path}/tamer-talent-sheet.html`,
      digimental: `${path}/digimental-sheet.html`
    };

    return templates[this.item.type] ?? `${path}/item-sheet.html`;
  }

  get title() {
    const itemTypeLabelKey = getItemTypeLabel(this.item.type);
    const itemTypeLabel = localize(itemTypeLabelKey) !== itemTypeLabelKey
      ? localize(itemTypeLabelKey)
      : this.item.type;

    return `${itemTypeLabel}: ${this.item.name}`;
  }

    async _render(...args) {
    const result = await super._render(...args);

    this._syncWindowTitle();

    return result;
  }

_syncWindowTitle() {
  const title = this.title;

  if (this.options) {
    this.options.title = title;
  }

  const root = this.element?.[0]?.closest?.(".app, .window-app") ?? this.element?.[0];
  const windowTitle = root?.querySelector?.(".window-title");

  if (windowTitle) {
    windowTitle.textContent = title;
  }

  const itemTypeLabelKey = getItemTypeLabel(this.item?.type);
  const itemTypeLabel = localize(itemTypeLabelKey) !== itemTypeLabelKey
    ? localize(itemTypeLabelKey)
    : this.item?.type ?? localize("DDA.Item.Item");

  const sheetTabTitle = game.i18n.format("DDA.ItemSheet.Title", {
    type: itemTypeLabel
  });

  root?.setAttribute?.("data-dda-sheet-title", sheetTabTitle);
}

  async getData(options = {}) {
        const context = await super.getData(options);

context.system = this.item.system;
context.config = CONFIG.DDA;
context.itemTypeLabel = getItemTypeLabel(this.item.type);
context.digimentals = CONFIG.DDA?.DIGIMENTALS ?? [];

    if (this.item.type === "digimental") {
      context.stageOptions = getDigimentalStageOptions();
      context.selectedDigimental = getDigimentalTemplateById(this.item.system?.digimentalId);
      context.linkedArmorForm = this.item.system?.armorForm ?? {};
      context.hasLinkedArmorForm = Boolean(String(this.item.system?.armorForm?.uuid ?? "").trim());
    }

    if (this.item.type === "attack") {
      context.appliedQualities = this._getAppliedAttackQualities();
    }

        if (this.item.type === "quality") {
      context.attackChoice = this._getQualityAttackChoiceContext();
    }

    return context;
  }

    activateListeners(html) {
    super.activateListeners(html);

    this._activateAttackFormulaBuilderListeners(html);
    this._activateDigimentalListeners(html);
        this._activateQualityAttackChoiceListeners(html);
  }

  _activateDigimentalListeners(html) {
    if (this.item.type !== "digimental") return;

    html.find("[data-digimental-drop-zone]").on("dragover", this._onDigimentalArmorDragOver.bind(this));
    html.find("[data-digimental-drop-zone]").on("dragleave", this._onDigimentalArmorDragLeave.bind(this));
    html.find("[data-digimental-drop-zone]").on("drop", this._onDigimentalArmorDrop.bind(this));
    html.find("[data-action='clear-armor-form']").on("click", this._onClearArmorForm.bind(this));
    html.find("[data-action='apply-digimental-template']").on("click", this._onApplyDigimentalTemplate.bind(this));
    html.find("select[name='system.digimentalId']").on("change", this._onDigimentalTemplateChange.bind(this));
  }

  _onDigimentalArmorDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.classList?.add("is-drag-hover");
  }

  _onDigimentalArmorDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.classList?.remove("is-drag-hover");
  }

  async _onDigimentalArmorDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.classList?.remove("is-drag-hover");

    const rawEvent = event.originalEvent ?? event;
    let actor = null;
    let data = null;

    try {
      data = TextEditor.getDragEventData(rawEvent);
    } catch (error) {
      // Quando o listener vem do jQuery, Foundry reclama se receber o wrapper
      // em vez do DragEvent nativo. A linha acima já usa originalEvent, mas
      // mantemos fallback manual para dados text/plain/application/json.
      try {
        const transfer = rawEvent?.dataTransfer;
        const rawData = transfer?.getData("text/plain") || transfer?.getData("application/json") || "";
        data = rawData ? JSON.parse(rawData) : null;
      } catch (fallbackError) {
        console.warn("DDA | Could not read dropped Armor Evolution data:", error, fallbackError);
      }
    }

    try {
      if (data?.uuid) {
        const document = await fromUuid(data.uuid);
        actor = document?.documentName === "Actor" ? document : null;
      }

      if (!actor && data?.type === "Actor" && Actor.implementation?.fromDropData) {
        actor = await Actor.implementation.fromDropData(data);
      }

      if (!actor && data?.id) {
        actor = game.actors?.get(data.id) ?? null;
      }
    } catch (error) {
      console.warn("DDA | Could not resolve dropped Armor Evolution Actor:", error, data);
    }

    if (!actor || actor.documentName !== "Actor") {
      console.warn("DDA | Armor Evolution drop data was not an Actor:", data);
      ui.notifications.warn(localize("DDA.Warning.DropActorNotIdentified"));
      return;
    }

    if (actor.type !== "digimon" && actor.type !== "npc") {
      ui.notifications.warn(localize("DDA.Warning.ArmorFormMustBeDigimon"));
      return;
    }

    const stage = String(actor.system?.stage ?? "child");
    const stageIndex = getDigimentalStageIndex(stage);

    if (stageIndex < 2) {
      ui.notifications.warn(localize("DDA.Warning.ArmorFormStageTooLow"));
      return;
    }

    const actionCost = getDefaultArmorActionCostForStage(stage);

    await this.item.update({
      "system.armorForm.uuid": actor.uuid,
      "system.armorForm.name": actor.name,
      "system.armorForm.stage": stage,
      "system.targetStage": stage,
      "system.cost.actions": actionCost,
      "system.cost.evolutionPoints": 0
    });

    ui.notifications.info(game.i18n.format("DDA.Info.ArmorFormLinked", { form: actor.name, item: this.item.name }));
  }

  async _onClearArmorForm(event) {
    event.preventDefault();

    await this.item.update({
      "system.armorForm.uuid": "",
      "system.armorForm.name": "",
      "system.armorForm.stage": "",
      "system.targetStage": "child",
      "system.cost.actions": 0,
      "system.cost.evolutionPoints": 0
    });
  }

  async _onDigimentalTemplateChange(event) {
    const template = getDigimentalTemplateById(event.currentTarget?.value);
    if (!template) return;

    await this._applyDigimentalTemplate(template);
  }

  async _onApplyDigimentalTemplate(event) {
    event.preventDefault();

    const template = getDigimentalTemplateById(this.item.system?.digimentalId);

    if (!template) {
      ui.notifications.warn(localize("DDA.Warning.DigimentalTemplateNotFound"));
      return;
    }

    await this._applyDigimentalTemplate(template);
  }

  async _applyDigimentalTemplate(template) {
    const qualitySummary = formatDigimentalQualitySummary(template.qualityGrants);

    await this.item.update({
      "system.crest": template.crest ?? "",
      "system.crestLabel": template.crestLabel ?? template.ptName ?? template.name ?? "",
      "system.targetStage": template.stage ?? "child",
      "system.template.spentDp": Number(template.spentDp ?? 0),
      "system.template.qualityGrants": foundry.utils.deepClone(template.qualityGrants ?? []),
      "system.template.qualitySummary": qualitySummary,
      "system.cost.evolutionPoints": 0,
      "system.cost.actions": getDefaultArmorActionCostForStage(template.stage ?? "child")
    });
  }

  _activateAttackFormulaBuilderListeners(html) {
    if (this.item.type !== "attack") return;

    html.find("[data-formula-preset]").on("change", async (event) => {
      event.preventDefault();

      const select = event.currentTarget;
      const builder = select.closest("[data-formula-builder]");
      if (!builder) return;

      const targetPath = builder.dataset.formulaTarget;
      if (!targetPath) return;

      const formula = select.value ?? "";

      const input = html.find(`input[name="${targetPath}"]`);
      if (input.length) {
        input.val(formula);
      }

      await this.item.update(
        { [targetPath]: formula },
        { render: false }
      );
    });

    html.find(".formula-mode-toggle input[type='checkbox']").on("change", async (event) => {
      event.preventDefault();

      const input = event.currentTarget;
      const updatePath = input.name;
      if (!updatePath) return;

      await this.item.update(
        { [updatePath]: input.checked },
        { render: false }
      );
    });
  }

    _activateQualityAttackChoiceListeners(html) {
    if (this.item.type !== "quality") return;

    html.find("[data-action='select-quality-attack']").on("change", this._onQualityAttackChoiceChange.bind(this));
  }

  _getQualityAttackChoiceContext() {
    if (this.item.type !== "quality") return { enabled: false };

    const actor = this.item.actor ?? this.item.parent;
    const modifier = this.item.system?.attackModifier ?? {};
    const appliesTo = String(modifier.appliesTo ?? "");

    const attackChoiceAppliesTo = new Set([
      "oneAttack",
      "oneDamageAttack",
      "oneMeleeAttack",
      "oneRangedAttack",
      "differentAttackPerRank",
      "taggedAttack"
    ]);

    if (!modifier.enabled && !attackChoiceAppliesTo.has(appliesTo)) {
      return { enabled: false };
    }

    if (!attackChoiceAppliesTo.has(appliesTo)) {
      return { enabled: false };
    }

    const rawGrantedTags = Array.isArray(modifier.grantsTags) ? modifier.grantsTags : [];
    const grantedTag = String(rawGrantedTags[0] ?? "").trim().toLowerCase();
    const grantedTagLabel = grantedTag ? `[${grantedTag.toUpperCase()}]` : "";

    const selectedChoices = Array.isArray(this.item.system?.choices?.selectedRanks)
      ? this.item.system.choices.selectedRanks
      : [];

    const selectedChoice = selectedChoices[0] ?? {};
    const selectedAttackId = String(
      selectedChoice.attackId
      ?? selectedChoice.attackItemId
      ?? selectedChoice.itemId
      ?? selectedChoice.id
      ?? ""
    ).trim();

    const allAttacks = actor?.items?.filter?.((item) => item.type === "attack") ?? [];

    const availableAttacks = allAttacks
      .filter((attack) => this._qualityAttackChoiceCanUseAttack(attack, appliesTo))
      .map((attack) => {
        const rangeType = String(attack.system?.baseTags?.rangeType ?? "");
        const functionType = String(attack.system?.baseTags?.functionType ?? "");

        return {
          id: attack.id,
          name: attack.name,
          rangeType,
          functionType,
          selected: attack.id === selectedAttackId
        };
      });

    const selectedAttackExists = availableAttacks.some((attack) => attack.id === selectedAttackId);

    return {
      enabled: true,
      appliesTo,
      grantedTag,
      grantedTagLabel,
      selectedAttackId,
      selectedAttackName: String(selectedChoice.attackName ?? ""),
      hasSelectedAttack: Boolean(selectedAttackId),
      selectedAttackMissing: Boolean(selectedAttackId && !selectedAttackExists),
      availableAttacks,
      hasAvailableAttacks: availableAttacks.length > 0,
      emptyWarning: "Este Digimon ainda não possui ataques compatíveis. Crie pelo menos um ataque compatível antes de configurar esta Qualidade.",
      missingWarning: "O ataque escolhido não foi encontrado ou não é mais compatível. Escolha outro ataque."
    };
  }

  _qualityAttackChoiceCanUseAttack(attack, appliesTo) {
    const rangeType = String(attack.system?.baseTags?.rangeType ?? "");
    const functionType = String(attack.system?.baseTags?.functionType ?? "");

    if (appliesTo === "oneDamageAttack") return functionType === "damage";
    if (appliesTo === "oneMeleeAttack") return rangeType === "melee";
    if (appliesTo === "oneRangedAttack") return rangeType === "range" || rangeType === "ranged";

    return true;
  }

  async _onQualityAttackChoiceChange(event) {
    event.preventDefault();

    const attackId = String(event.currentTarget?.value ?? "").trim();
    const actor = this.item.actor ?? this.item.parent;
    const attack = actor?.items?.get?.(attackId) ?? null;

    if (!attackId || !attack) {
      await this.item.update({
        "system.choices.selectedRanks": []
      });

      return;
    }

    const modifier = this.item.system?.attackModifier ?? {};
    const rawGrantedTags = Array.isArray(modifier.grantsTags) ? modifier.grantsTags : [];
    const grantedTag = String(rawGrantedTags[0] ?? "").trim().toLowerCase();

    const currentChoices = Array.isArray(this.item.system?.choices?.selectedRanks)
      ? foundry.utils.deepClone(this.item.system.choices.selectedRanks)
      : [];

    const nextChoice = {
      ...(currentChoices[0] ?? {}),
      rank: 1,
      attackId: attack.id,
      attackName: attack.name,
      grantedTag
    };

    await this.item.update({
      "system.choices.enabled": true,
      "system.choices.selectedRanks": [nextChoice]
    });
  }

  async _updateObject(event, formData) {
  if (this.item.type === "attack") {
  formData["system.damage.enabled"] = normalizeFormBoolean(formData["system.damage.enabled"]);
  formData["system.isSignature"] = normalizeFormBoolean(formData["system.isSignature"]);
  formData["system.effectTag.enabled"] = normalizeFormBoolean(formData["system.effectTag.enabled"]);
  }

  if (this.item.type === "tamerTalent") {
    normalizeTamerTalentFormData(formData);
  }

  if (this.item.type === "digimental") {
    normalizeDigimentalFormData(formData);
  }

  return super._updateObject(event, formData);
}

  _getAppliedAttackQualities() {
    const attack = this.item;
    const actor = attack.actor;

    if (!actor) return [];

    const rangeType = attack.system.baseTags?.rangeType ?? "";
    const functionType = attack.system.baseTags?.functionType ?? "";
    const isSignature = Boolean(attack.system.isSignature);

    const appliesToLabels = {
      all: localize("DDA.Attack.AppliesTo.All"),
      melee: localize("DDA.Attack.Range.Melee"),
      range: localize("DDA.Attack.Range.Ranged"),
      ranged: localize("DDA.Attack.Range.Ranged"),
      damage: localize("DDA.Attack.Function.Damage"),
      support: localize("DDA.Attack.Function.Support"),
      signature: localize("DDA.Attack.Signature"),
      taggedAttack: localize("DDA.Attack.AppliedTags"),
      oneAttack: localize("DDA.Attack.AppliedTags"),
      oneDamageAttack: localize("DDA.Attack.Function.Damage"),
      oneMeleeAttack: localize("DDA.Attack.Range.Melee"),
      oneRangedAttack: localize("DDA.Attack.Range.Ranged"),
      differentAttackPerRank: localize("DDA.Attack.AppliedTags")
    };

    const effectTagLabels = CONFIG.DDA?.effectTags ?? {};

    const qualities = actor.items.filter((item) => item.type === "quality");

    return qualities
.filter((quality) => {
  const modifier = quality.system.attackModifier ?? {};
  const rawGrantedTags = Array.isArray(modifier.grantsTags) ? modifier.grantsTags : [];

  if (
    !modifier.enabled &&
    !rawGrantedTags.length &&
    !Number(modifier.accuracyBonus ?? 0) &&
    !Number(modifier.damageBonus ?? 0) &&
    !Number(modifier.accuracyBonusPerRank ?? 0) &&
    !Number(modifier.damageBonusPerRank ?? 0)
  ) return false;

  const appliesTo = modifier.appliesTo ?? "";

  const qualityTags = new Set((attack.system.qualityTags ?? []).map((tag) => String(tag).toLowerCase()));
  const grantedTags = rawGrantedTags.map((tag) => String(tag).toLowerCase());
  const hasGrantedTag = grantedTags.some((tag) => qualityTags.has(tag));

  const selectedChoices = Array.isArray(quality.system?.choices?.selectedRanks)
    ? quality.system.choices.selectedRanks
    : [];

  const selectedAttackIds = selectedChoices
    .map((choice) => String(
      choice.attackId
      ?? choice.attackItemId
      ?? choice.itemId
      ?? choice.id
      ?? ""
    ).trim())
    .filter(Boolean);

  const attackMatchesExplicitSelection = selectedAttackIds.includes(attack.id);

        if (attackMatchesExplicitSelection) return true;
        if (["oneAttack", "oneDamageAttack", "oneMeleeAttack", "oneRangedAttack", "differentAttackPerRank", "taggedAttack"].includes(appliesTo)) return hasGrantedTag;
        
        if (!appliesTo && grantedTags.length) return hasGrantedTag;
        if (appliesTo === "all") return true;
        if (appliesTo === "signature") return isSignature;
        if (appliesTo === rangeType) return true;
        if (appliesTo === functionType) return true;

        return false;
      })
      .map((quality) => {
        const modifier = quality.system.attackModifier ?? {};
        const appliesTo = modifier.appliesTo ?? "";
        const effectTag = modifier.effectTag ?? "";

        return {
          id: quality.id,
          name: quality.name,
          appliesTo,
          appliesToLabel: appliesToLabels[appliesTo] ?? appliesTo,
          accuracyBonus: Number(modifier.accuracyBonus ?? 0),
          damageBonus: Number(modifier.damageBonus ?? 0),
          unalterableDamage: Number(modifier.unalterableDamage ?? 0),
          extraActionCost: Number(modifier.extraActionCost ?? 0),
          effectTag,
          effectTagLabel: effectTag ? effectTagLabels[effectTag] ?? effectTag : ""
        };
      });
  }
}

function localize(key) {
  return game.i18n.localize(key);
}

const DIGIMENTAL_STAGE_ORDER = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate",
  "ultimatePlus"
];

function getDigimentalStageIndex(stageKey) {
  return DIGIMENTAL_STAGE_ORDER.indexOf(String(stageKey ?? ""));
}

function getDigimentalStageOptions() {
  const stages = CONFIG.DDA?.stages ?? {};

  return DIGIMENTAL_STAGE_ORDER
    .filter((key) => key in stages)
    .filter((key) => getDigimentalStageIndex(key) >= 2)
    .map((key) => {
      const labelKey = stages[key]?.label ?? stages[key] ?? key;
      const label = String(labelKey).startsWith("DDA.") ? game.i18n.localize(labelKey) : String(labelKey);

      return { key, label };
    });
}

function getDefaultArmorActionCostForStage(stageKey) {
  // A regra base do Digimental ignora custo de PE. Mantemos Ações em 0 por padrão
  // para representar ativação especial por item, mas deixamos o campo editável na ficha.
  return 0;
}

function getDigimentalTemplateById(id) {
  const key = String(id ?? "").trim();
  if (!key) return null;

  return (CONFIG.DDA?.DIGIMENTALS ?? []).find((entry) => entry.id === key) ?? null;
}

function formatDigimentalQualitySummary(qualityGrants = []) {
  if (!Array.isArray(qualityGrants) || qualityGrants.length === 0) return "";

  return qualityGrants.map((quality) => {
    const pieces = [quality.name ?? ""];

    if (quality.rank !== undefined && quality.rank !== null) pieces.push(String(quality.rank));
    if (quality.choice) pieces.push(`— ${quality.choice}`);
    if (quality.note) pieces.push(`(${quality.note})`);

    return `- ${pieces.filter(Boolean).join(" ")}`;
  }).join("\n");
}

function normalizeTamerTalentFormData(formData) {
  const scalarFields = [
    "system.requirement.type",
    "system.requirement.key",
    "system.useType",
    "system.actionCost",
    "system.frequency",
    "system.specialOrder.name",
    "system.uses.recharge"
  ];

  for (const field of scalarFields) {
    if (!(field in formData)) continue;

    formData[field] = normalizeFormScalar(formData[field], getTamerTalentFallback(field));
  }

  const numberFields = [
    "system.requirement.value",
    "system.uses.value",
    "system.uses.max"
  ];

  for (const field of numberFields) {
    if (!(field in formData)) continue;

    formData[field] = normalizeFormNumber(formData[field], 0);
  }

  const booleanFields = [
    "system.isAdvanced",
    "system.isSpecialOrder",
    "system.uses.enabled"
  ];

  for (const field of booleanFields) {
    if (!(field in formData)) continue;

    formData[field] = normalizeFormBoolean(formData[field]);
  }
}

function normalizeFormScalar(value, fallback = "") {
  if (Array.isArray(value)) {
    const reversed = [...value].reverse();

    const found = reversed.find((entry) => {
      const text = String(entry ?? "").trim();

      if (!text) return false;
      if (/^,+$/.test(text)) return false;

      return true;
    });

    return found ? String(found).trim() : fallback;
  }

  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  if (!text) return fallback;
  if (/^,+$/.test(text)) return fallback;

  return text;
}

function normalizeFormNumber(value, fallback = 0) {
  const scalar = normalizeFormScalar(value, String(fallback));
  const number = Number(scalar);

  return Number.isFinite(number) ? number : fallback;
}

function normalizeFormBoolean(value) {
  if (Array.isArray(value)) {
    return value.some((entry) => {
      return entry === true || entry === "true" || entry === "on" || entry === "1";
    });
  }

  return value === true || value === "true" || value === "on" || value === "1";
}

function getTamerTalentFallback(field) {
  const fallbacks = {
    "system.requirement.type": "attribute",
    "system.requirement.key": "",
    "system.useType": "passive",
    "system.actionCost": "",
    "system.frequency": "",
    "system.specialOrder.name": "",
    "system.uses.recharge": ""
  };

  return fallbacks[field] ?? "";
}

function getItemTypeLabel(type) {
  const labels = {
    attack: "DDA.Item.Attack",
    quality: "DDA.Item.Quality",
    torment: "DDA.Item.Torment",
    tamerTalent: "DDA.Item.TamerTalent",
    motif: "DDA.Item.Motif",
    equipment: "DDA.Item.Equipment",
    consumable: "DDA.Item.Consumable",
    card: "DDA.Item.Card",
    milestone: "DDA.Item.Milestone",
    trait: "DDA.Item.Trait",
    evolutionLink: "DDA.Item.EvolutionLink",
    digimental: "DDA.Item.Digimental"
  };

  return labels[type] ?? type;
}

function normalizeDigimentalFormData(formData) {
  const numericFields = [
    "system.cost.actions",
    "system.cost.evolutionPoints",
    "system.cost.inspirationPoints",
    "system.template.spentDp"
  ];

  for (const field of numericFields) {
    if (field in formData) formData[field] = normalizeFormNumber(formData[field], 0);
  }

  formData["system.usedUntilRest"] = normalizeFormBoolean(formData["system.usedUntilRest"]);
}
