const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const ITEM_SHEET_TEMPLATE_PATH = "systems/digimon-digital-adventures/templates/item";

const ITEM_SHEET_TEMPLATES = {
  item: `${ITEM_SHEET_TEMPLATE_PATH}/item-sheet.html`,
  attack: `${ITEM_SHEET_TEMPLATE_PATH}/attack-sheet.html`,
  quality: `${ITEM_SHEET_TEMPLATE_PATH}/quality-sheet.html`,
  torment: `${ITEM_SHEET_TEMPLATE_PATH}/torment-sheet.html`,
  tamerTalent: `${ITEM_SHEET_TEMPLATE_PATH}/tamer-talent-sheet.html`,
  digimental: `${ITEM_SHEET_TEMPLATE_PATH}/digimental-sheet.html`
};

const ITEM_SHEET_PARTS = {
  attack: "attack",
  quality: "quality",
  torment: "torment",
  tamerTalent: "tamerTalent",
  digimental: "digimental"
};

const ITEM_SHEET_TYPE_CLASSES = [
  "dda-attack-sheet",
  "dda-quality-sheet",
  "dda-torment-sheet",
  "dda-tamerTalent-sheet",
  "dda-digimental-sheet",
  "dda-motif-sheet",
  "dda-equipment-sheet",
  "dda-consumable-sheet",
  "dda-card-sheet",
  "dda-milestone-sheet",
  "dda-trait-sheet",
  "dda-evolutionLink-sheet"
];

const DDAItemSheetBase = HandlebarsApplicationMixin(ItemSheetV2);

export class DDAItemSheet extends DDAItemSheetBase {
  static DEFAULT_OPTIONS = {
    classes: [
      "dda",
      "sheet",
      "item",
      "dda-item-sheet-window",
      "dda-item-sheet"
    ],
    position: {
      width: 640,
      height: 600
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true
    },
    window: {
      resizable: true
    },
    actions: {
      editImage: DDAItemSheet._onActionEditImage,
      clearArmorForm: DDAItemSheet._onActionClearArmorForm,
      applyDigimentalTemplate: DDAItemSheet._onActionApplyDigimentalTemplate
    }
  };

  static PARTS = {
    item: { template: ITEM_SHEET_TEMPLATES.item },
    attack: { template: ITEM_SHEET_TEMPLATES.attack },
    quality: { template: ITEM_SHEET_TEMPLATES.quality },
    torment: { template: ITEM_SHEET_TEMPLATES.torment },
    tamerTalent: { template: ITEM_SHEET_TEMPLATES.tamerTalent },
    digimental: { template: ITEM_SHEET_TEMPLATES.digimental }
  };

  static TABS = {
    primary: {
      initial: "details",
      tabs: [
        { id: "details" },
        { id: "tags" },
        { id: "requirements" },
        { id: "grants" },
        { id: "template" },
        { id: "notes" }
      ]
    }
  };

  _initializeApplicationOptions(options = {}) {
    const initialized = super._initializeApplicationOptions(options);
    const itemType = initialized.document?.type ?? options.document?.type ?? this.item?.type ?? "";
    const typeClass = itemType ? `dda-${itemType}-sheet` : "";
    const classes = new Set(initialized.classes ?? []);

    classes.add("dda-item-sheet-window");
    classes.add("dda-item-sheet");
    if (typeClass) classes.add(typeClass);

    initialized.classes = Array.from(classes);
    return initialized;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = [ITEM_SHEET_PARTS[this.item?.type] ?? "item"];
  }

  get title() {
    const itemTypeLabelKey = getItemTypeLabel(this.item.type);
    const itemTypeLabel = localize(itemTypeLabelKey) !== itemTypeLabelKey
      ? localize(itemTypeLabelKey)
      : this.item.type;

    return `${itemTypeLabel}: ${this.item.name}`;
  }

  _syncWindowTitle() {
    const title = this.title;
    const root = this.element?.closest?.(".application, .app, .window-app") ?? this.element;
    const windowTitle = this.window?.title ?? root?.querySelector?.(".window-title");

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

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);

    context.cssClass = `dda-item-sheet dda-${this.item.type}-sheet`;
    context.item = this.item;
    context.system = this.item.system;
    context.config = CONFIG.DDA;
    context.itemTypeLabel = getItemTypeLabel(this.item.type);
    context.digimentals = CONFIG.DDA?.DIGIMENTALS ?? [];

    context.tabs ??= {};
    context.tabs.primary ??= this._prepareTabs("primary");

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

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.element;
    if (!root) return;

    this._syncItemSheetClasses(root);
    this._syncWindowTitle();
    this._bindItemTabListeners(root);
    this._bindAttackFormulaBuilderListeners(root);
    this._bindDigimentalListeners(root);
    this._bindQualityAttackChoiceListeners(root);
  }

  _syncItemSheetClasses(root = this.element) {
    const itemType = this.item?.type ?? "item";
    const typeClass = `dda-${itemType}-sheet`;
    const elements = [root, this.form].filter(Boolean);

    for (const element of elements) {
      for (const itemClass of ITEM_SHEET_TYPE_CLASSES) {
        element.classList.remove(itemClass);
      }
    }

    root?.classList?.add("dda-item-sheet-window", "dda-item-sheet", typeClass);
    this.form?.classList?.add("dda-item-sheet", typeClass);
    this.form?.setAttribute?.("autocomplete", "off");
  }

  _bindItemTabListeners(root) {
    const activePrimaryTab = this.tabGroups.primary ?? "details";
    this._syncItemTabDom(root, "primary", activePrimaryTab);

    for (const tab of root.querySelectorAll(".sheet-tabs [data-group][data-tab]")) {
      tab.addEventListener("click", this._onItemTabClick.bind(this));
    }
  }

  _onItemTabClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    const group = target?.dataset?.group ?? "primary";
    const tab = target?.dataset?.tab ?? "";
    if (!tab) return;

    this.tabGroups[group] = tab;
    this.changeTab(tab, group, {
      event,
      force: true,
      updatePosition: false
    });

    this._syncItemTabDom(this.element, group, tab);
  }

  _syncItemTabDom(root, group, activeTab) {
    if (!root) return;

    for (const element of root.querySelectorAll("[data-group][data-tab]")) {
      if (element.dataset.group !== group) continue;
      element.classList.toggle("active", element.dataset.tab === activeTab);
    }
  }

  static async _onActionEditImage(event, target) {
    return this._onEditImage(event, target);
  }

  static async _onActionClearArmorForm(event, target) {
    return this._onClearArmorForm(event, target);
  }

  static async _onActionApplyDigimentalTemplate(event, target) {
    return this._onApplyDigimentalTemplate(event, target);
  }

  async _onEditImage(event) {
    event.preventDefault();
    event.stopPropagation();

    const FilePickerClass =
      globalThis.foundry?.applications?.apps?.FilePicker?.implementation
      ?? globalThis.FilePicker
      ?? null;

    if (!FilePickerClass) {
      ui.notifications.warn("DDA | FilePicker implementation is unavailable.");
      return;
    }

    const picker = new FilePickerClass({
      type: "image",
      current: this.item.img,
      callback: async (path) => {
        if (!path) return;
        await this.item.update({ img: path });
        await this.render();
      }
    });

    picker.render(true);
  }

  _bindDigimentalListeners(root) {
    if (this.item.type !== "digimental") return;

    for (const dropZone of root.querySelectorAll("[data-digimental-drop-zone]")) {
      dropZone.addEventListener("dragover", this._onDigimentalArmorDragOver.bind(this));
      dropZone.addEventListener("dragleave", this._onDigimentalArmorDragLeave.bind(this));
      dropZone.addEventListener("drop", this._onDigimentalArmorDrop.bind(this));
    }

    const digimentalSelect = root.querySelector("select[name='system.digimentalId']");
    digimentalSelect?.addEventListener("change", this._onDigimentalTemplateChange.bind(this));
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
      const TextEditorClass = getDdaTextEditor();
      if (!TextEditorClass) throw new Error("TextEditor implementation is unavailable.");
      data = TextEditorClass.getDragEventData(rawEvent);
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
    event.preventDefault();
    event.stopPropagation();

    const digimentalId = event.currentTarget?.value;
    const template = getDigimentalTemplateById(digimentalId);
    if (!template) return;

    await this._applyDigimentalTemplate(template, { digimentalId });
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

  async _applyDigimentalTemplate(template, { digimentalId } = {}) {
    const qualitySummary = formatDigimentalQualitySummary(template.qualityGrants);
    const updateData = {
      "system.crest": template.crest ?? "",
      "system.crestLabel": template.crestLabel ?? template.ptName ?? template.name ?? "",
      "system.targetStage": template.stage ?? "child",
      "system.template.spentDp": Number(template.spentDp ?? 0),
      "system.template.qualityGrants": foundry.utils.deepClone(template.qualityGrants ?? []),
      "system.template.qualitySummary": qualitySummary,
      "system.cost.evolutionPoints": 0,
      "system.cost.actions": getDefaultArmorActionCostForStage(template.stage ?? "child")
    };

    if (digimentalId !== undefined) {
      updateData["system.digimentalId"] = digimentalId;
    }

    await this.item.update(updateData);
  }

  _bindAttackFormulaBuilderListeners(root) {
    if (this.item.type !== "attack") return;

    for (const formulaPreset of root.querySelectorAll("[data-formula-preset]")) {
      formulaPreset.addEventListener("change", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const select = event.currentTarget;
        const builder = select.closest("[data-formula-builder]");
        if (!builder) return;

        const targetPath = builder.dataset.formulaTarget;
        if (!targetPath) return;

        const formula = select.value ?? "";

        const input = root.querySelector(`input[name="${targetPath}"]`);
        if (input) {
          input.value = formula;
        }

        await this.item.update(
          { [targetPath]: formula },
          { render: false }
        );
      });
    }

    for (const formulaMode of root.querySelectorAll(".formula-mode-toggle input[type='checkbox']")) {
      formulaMode.addEventListener("change", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const input = event.currentTarget;
        const updatePath = input.name;
        if (!updatePath) return;

        await this.item.update(
          { [updatePath]: input.checked },
          { render: false }
        );
      });
    }
  }

  _bindQualityAttackChoiceListeners(root) {
    if (this.item.type !== "quality") return;

    for (const select of root.querySelectorAll("[data-quality-attack-select]")) {
      select.addEventListener("change", this._onQualityAttackChoiceChange.bind(this));
    }
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
    event.stopPropagation();

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

  _prepareSubmitData(event, form, formData, updateData = {}) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    const flatData = foundry.utils.flattenObject(submitData);

    if (this.item.type === "attack") {
      flatData["system.damage.enabled"] = normalizeFormBoolean(flatData["system.damage.enabled"]);
      flatData["system.isSignature"] = normalizeFormBoolean(flatData["system.isSignature"]);
      flatData["system.effectTag.enabled"] = normalizeFormBoolean(flatData["system.effectTag.enabled"]);
    }

    if (this.item.type === "tamerTalent") {
      normalizeTamerTalentFormData(flatData);
    }

    if (this.item.type === "digimental") {
      normalizeDigimentalFormData(flatData);
    }

    return foundry.utils.expandObject(flatData);
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

function getDdaTextEditor() {
  return globalThis.foundry?.applications?.ux?.TextEditor?.implementation
    ?? globalThis.TextEditor
    ?? null;
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
