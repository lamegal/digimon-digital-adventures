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

registerQualityAttackChoiceCleanupHooks();

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
      ui.notifications.warn(game.i18n.localize("DDA.ItemSheet.Warning.FilePickerUnavailable"));
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
    if (this.item.type !== "quality") {
      return {
        enabled: false,
        rows: [],
        hasRows: false
      };
    }

    const actor =
      this.item.actor ??
      this.item.parent;

    if (!actor?.items) {
      return {
        enabled: false,
        rows: [],
        hasRows: false
      };
    }

    const modifier =
      this.item.system?.attackModifier ?? {};

    const choices =
      this.item.system?.choices ?? {};

    const appliesTo = String(
      modifier.appliesTo ?? ""
    ).trim();

    const choiceType = String(
      choices.type ?? ""
    ).trim();

    const grantedTags = (
      Array.isArray(modifier.grantsTags)
        ? modifier.grantsTags
        : []
    )
      .map((tag) => {
        return this
          ._normalizeQualityAttackTag(tag);
      })
      .filter(Boolean);

    const isAreaChoice =
      Boolean(modifier.areaAttack) ||
      (
        appliesTo ===
          "differentAttackPerRank" &&

        grantedTags.some((tag) => {
          return tag.startsWith("t:");
        })
      );

    const isEffectChoice =
      choiceType === "effectTagPerRank" ||
      appliesTo ===
        "oneAttackPerPurchasedEffect";

    const selectableAppliesTo =
      new Set([
        "oneAttack",
        "oneDamageAttack",
        "oneMeleeAttack",
        "oneRangedAttack",
        "oneMeleeDamageAttack",
        "differentAttackPerRank",
        "oneAttackPerPurchasedEffect",
        "taggedAttack"
      ]);

    if (
      !isAreaChoice &&
      !isEffectChoice &&
      !selectableAppliesTo.has(
        appliesTo
      )
    ) {
      return {
        enabled: false,
        rows: [],
        hasRows: false
      };
    }

    const selectedChoices =
      Array.isArray(
        choices.selectedRanks
      )
        ? choices.selectedRanks
        : [];

    const rankValue = Math.max(
      1,
      Number(
        this.item.system?.rank?.value ??
        1
      )
    );

    const rowCount =
      (
        isAreaChoice ||
        isEffectChoice ||
        appliesTo ===
          "differentAttackPerRank"
      )
        ? rankValue
        : 1;

    const allAttacks =
      actor.items.filter((item) => {
        return item.type === "attack";
      });

    const configuredEffectTags =
      this._getConfiguredEffectTagsForActor(
        actor
      );

    const configuredAreaTags =
      new Set(
        grantedTags.filter((tag) => {
          return tag.startsWith("t:");
        })
      );

    const rows = [];

    for (
      let rank = 1;
      rank <= rowCount;
      rank += 1
    ) {
      const selectedChoice =
        selectedChoices.find(
          (choice, index) => {
            return Math.max(
              1,
              Number(
                choice?.rank ??
                index + 1
              )
            ) === rank;
          }
        ) ?? {};

      const selectedIdentity =
        this._getQualityChoiceIdentity(
          selectedChoice
        );

      const otherChoices =
        selectedChoices.filter(
          (choice, index) => {
            return Math.max(
              1,
              Number(
                choice?.rank ??
                index + 1
              )
            ) !== rank;
          }
        );

      const usedAttackIds =
        new Set(
          otherChoices
            .map((choice) => {
              return this
                ._getQualityChoiceIdentity(
                  choice
                )
                .attackId;
            })
            .filter(Boolean)
        );

      const usedTags =
        new Set(
          otherChoices
            .map((choice) => {
              return this
                ._getQualityChoiceIdentity(
                  choice
                )
                .tag;
            })
            .filter(Boolean)
        );

      const options = [];

      /*
       * ÁREA DE ATAQUE
       */
      if (isAreaChoice) {
        const areaOptions =
          Array.isArray(
            choices.options
          ) &&
          choices.options.length
            ? choices.options
            : grantedTags
                .filter((tag) => {
                  return tag.startsWith(
                    "t:"
                  );
                })
                .map((tag) => ({
                  key: tag,
                  label:
                    `[${tag.toUpperCase()}]`
                }));

        for (const option of areaOptions) {
          const rawTag =
            this._normalizeQualityAttackTag(
              option.key
            );

          const areaTag =
            rawTag.startsWith("t:")
              ? rawTag
              : `t:${rawTag}`;

          if (!areaTag) continue;

          if (
            choices.cannotRepeat &&
            usedTags.has(areaTag) &&
            selectedIdentity.tag !== areaTag
          ) {
            continue;
          }

          for (const attack of allAttacks) {
            if (
              usedAttackIds.has(
                attack.id
              ) &&
              selectedIdentity.attackId !==
                attack.id
            ) {
              continue;
            }

            if (
              !this
                ._qualityAttackChoiceCanUseAttack(
                  attack,
                  option.appliesTo ??
                    appliesTo
                )
            ) {
              continue;
            }

            const attackTags =
              this._getAttackChoiceTags(
                attack
              );

            const hasDifferentAreaTag =
              attackTags.some((tag) => {
                return (
                  configuredAreaTags.has(
                    tag
                  ) &&
                  tag !== areaTag
                );
              });

            if (hasDifferentAreaTag) {
              continue;
            }

            options.push({
              key:
                `${attack.id}:${areaTag}`,

              label:
                `${attack.name} — [${areaTag.toUpperCase()}]`,

              attackId:
                attack.id,

              attackName:
                attack.name,

              attackTag:
                areaTag,

              effectTag:
                "",

              derivedStat:
                option.derivedStat ?? "",

              appliesTo:
                option.appliesTo ?? "",

              requirements:
                foundry.utils.deepClone(
                  option.requirements ?? {}
                ),

              effect:
                option.effect ?? "",

              selected:
                selectedIdentity.attackId ===
                  attack.id &&
                selectedIdentity.tag ===
                  areaTag
            });
          }
        }
      }

      /*
       * EFEITO BÁSICO, AVANÇADO OU MESTRE
       */
      else if (isEffectChoice) {
        const effectOptions =
          Array.isArray(
            choices.options
          )
            ? choices.options
            : [];

        for (
          const option of
          effectOptions
        ) {
          const effectTag =
            this._normalizeQualityAttackTag(
              option.key
            );

          if (!effectTag) continue;

          if (
            choices.cannotRepeat &&
            usedTags.has(effectTag) &&
            selectedIdentity.tag !==
              effectTag
          ) {
            continue;
          }

          for (const attack of allAttacks) {
            if (
              usedAttackIds.has(
                attack.id
              ) &&
              selectedIdentity.attackId !==
                attack.id
            ) {
              continue;
            }

            if (
              !this
                ._qualityAttackChoiceCanUseAttack(
                  attack,
                  appliesTo,
                  {
                    requiresDamageTag:
                      Boolean(
                        option
                          .requiresDamageTag
                      )
                  }
                )
            ) {
              continue;
            }

            const attackTags =
              this._getAttackChoiceTags(
                attack
              );

            const existingEffectTags =
              attackTags.filter((tag) => {
                return configuredEffectTags
                  .has(tag);
              });

            const isCurrentSelection =
              selectedIdentity.attackId ===
                attack.id &&
              selectedIdentity.tag ===
                effectTag;

            if (
              existingEffectTags.length &&
              !isCurrentSelection
            ) {
              continue;
            }

            if (
              isCurrentSelection &&
              existingEffectTags.some(
                (tag) => {
                  return tag !== effectTag;
                }
              )
            ) {
              continue;
            }

            options.push({
              key:
                `${attack.id}:${effectTag}`,

              label:
                `${attack.name} — [${this._getLocalizedQualityAttackTagLabel(effectTag)}]`,

              attackId:
                attack.id,

              attackName:
                attack.name,

              attackTag:
                effectTag,

              effectTag,

              effectType:
                option.type ?? "",

              potencyStat:
                option.potency ??
                option.potencyStat ??
                "",

              duration:
                option.duration ?? true,

              extraActionRequired:
                Boolean(
                  option.extraActionRequired
                ),

              requiresDamageTag:
                Boolean(
                  option.requiresDamageTag
                ),

              onlyAffectsAllies:
                Boolean(
                  option.onlyAffectsAllies
                ),

              requirements:
                foundry.utils.deepClone(
                  option.requirements ?? {}
                ),

              effect:
                option.effect ?? "",

              selected:
                isCurrentSelection
            });
          }
        }
      }

      /*
       * OUTRAS QUALIDADES VINCULADAS
       * A UM ATAQUE
       */
      else {
        const grantedTag =
          grantedTags[0] ?? "";

        for (const attack of allAttacks) {
          if (
            !this
              ._qualityAttackChoiceCanUseAttack(
                attack,
                appliesTo
              )
          ) {
            continue;
          }

          options.push({
            key:
              grantedTag
                ? `${attack.id}:${grantedTag}`
                : attack.id,

            label:
              grantedTag
                ? `${attack.name} — [${grantedTag.toUpperCase()}]`
                : attack.name,

            attackId:
              attack.id,

            attackName:
              attack.name,

            attackTag:
              grantedTag,

            effectTag:
              "",

            effect:
              "",

            selected:
              selectedIdentity.attackId ===
                attack.id &&
              (
                !grantedTag ||
                selectedIdentity.tag ===
                  grantedTag
              )
          });
        }
      }

      const selectedOption =
        options.find((option) => {
          return option.selected;
        }) ?? null;

      const selectedTag =
        selectedOption?.attackTag ??
        selectedIdentity.tag ??
        "";

      rows.push({
        rank,

        selectedTagLabel:
          selectedTag
            ? `[${this._getLocalizedQualityAttackTagLabel(selectedTag)}]`
            : "",

        options,

        hasOptions:
          options.length > 0,

        selectedMissing:
          Boolean(
            selectedIdentity.attackId &&
            !selectedOption
          )
      });
    }

    return {
      enabled: true,

      rows,

      hasRows:
        rows.length > 0,

      emptyWarning: game.i18n.localize(
        "DDA.Quality.AttackChoice.EmptyWarning"
      ),

      missingWarning: game.i18n.localize(
        "DDA.Quality.AttackChoice.MissingWarning"
      )
    };
  }

  _getLocalizedQualityAttackTagLabel(tag = "") {
    const normalizedTag = this._normalizeQualityAttackTag(tag);
    const configuredLabel = CONFIG.DDA?.effectTags?.[normalizedTag];

    return String(configuredLabel || normalizedTag)
      .replace(/^\[|\]$/g, "")
      .toUpperCase();
  }

  _normalizeQualityAttackTag(
    value = ""
  ) {
    return String(value ?? "")
      .trim()
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
  }

_getQualityChoiceIdentity(
  choice = {}
) {
  const keyText =
    String(
      choice.key ?? ""
    ).trim();

  const separatorIndex =
    keyText.indexOf(":");

  const keyAttackId =
    separatorIndex > 0
      ? keyText
          .slice(
            0,
            separatorIndex
          )
          .trim()
      : "";

  const keyTag =
    separatorIndex > 0
      ? keyText
          .slice(
            separatorIndex + 1
          )
          .trim()
      : "";

  const rawAttackId =
    String(
      choice.attackId ??
      choice.attackItemId ??
      choice.itemId ??
      choice.attackKey ??
      choice.id ??
      keyAttackId ??
      ""
    ).trim();

  const actor =
    this.item.actor ??
    this.item.parent;

  /*
   * Qualidades vindas do Wizard ou de snapshots
   * podem guardar uma chave estável do Ataque em
   * vez do ID atual do Item recriado.
   *
   * Aqui transformamos essa chave estável no ID
   * atual antes que o restante da ficha compare,
   * exiba ou sincronize a escolha.
   */
  const resolvedAttack =
    rawAttackId && actor?.items
      ? actor.items.find((item) => {
          if (item.type !== "attack") {
            return false;
          }

          const identityKeys =
            new Set([
              item.id,

              item.system
                ?.wizard
                ?.attackKey,

              item.flags
                ?.[
                  "digimon-digital-adventures"
                ]
                ?.wizardAttackKey,

              item.flags
                ?.[
                  "digimon-digital-adventures"
                ]
                ?.enemyBuilderAttackKey
            ]
              .map((value) => {
                return String(
                  value ?? ""
                ).trim();
              })
              .filter(Boolean));

          return identityKeys.has(
            rawAttackId
          );
        })
      : null;

  return {
    attackId:
      resolvedAttack?.id ??
      rawAttackId,

    tag:
      this._normalizeQualityAttackTag(
        choice.effectTag ??
        choice.attackTag ??
        choice.grantedTag ??
        keyTag
      )
  };
}

  _getAttackChoiceTags(
    attack
  ) {
    const tags = [
      ...(
        Array.isArray(
          attack?.system?.qualityTags
        )
          ? attack.system.qualityTags
          : []
      ),

      ...(
        Array.isArray(
          attack?.system?.tags
        )
          ? attack.system.tags
          : []
      )
    ].map((tag) => {
      return this
        ._normalizeQualityAttackTag(
          tag
        );
    });

    const directEffectTag =
      attack?.system?.effectTag?.enabled
        ? this
            ._normalizeQualityAttackTag(
              attack.system
                .effectTag
                .tag
            )
        : "";

    if (directEffectTag) {
      tags.push(directEffectTag);
    }

    return [
      ...new Set(
        tags.filter(Boolean)
      )
    ];
  }

  _getConfiguredEffectTagsForActor(
    actor
  ) {
    const tags = new Set(
      Object.keys(
        CONFIG.DDA?.effectTags ?? {}
      ).map((tag) => {
        return this
          ._normalizeQualityAttackTag(
            tag
          );
      })
    );

    for (
      const quality of
      actor?.items?.filter?.(
        (item) => {
          return item.type ===
            "quality";
        }
      ) ?? []
    ) {
      if (
        quality.system
          ?.choices
          ?.type !==
        "effectTagPerRank"
      ) {
        continue;
      }

      for (
        const option of
        quality.system
          ?.choices
          ?.options ?? []
      ) {
        const tag =
          this
            ._normalizeQualityAttackTag(
              option.key
            );

        if (tag) {
          tags.add(tag);
        }
      }
    }

    return tags;
  }

  _qualityAttackChoiceCanUseAttack(
    attack,
    appliesTo,
    {
      requiresDamageTag = false
    } = {}
  ) {
    const rangeType = String(
      attack.system
        ?.baseTags
        ?.rangeType ?? ""
    )
      .trim()
      .toLowerCase();

    const functionType = String(
      attack.system
        ?.baseTags
        ?.functionType ?? ""
    )
      .trim()
      .toLowerCase();

    if (
      requiresDamageTag &&
      functionType !== "damage"
    ) {
      return false;
    }

    const target = String(
      appliesTo ?? ""
    )
      .trim()
      .toLowerCase();

    if (
      [
        "oneattack",
        "differentattackperrank",
        "oneattackperpurchasedeffect",
        "taggedattack",
        "meleeorrangeattack",
        "meleeorrangedattack"
      ].includes(target)
    ) {
      return true;
    }

    if (
      [
        "onedamageattack",
        "damageattack"
      ].includes(target)
    ) {
      return (
        functionType === "damage"
      );
    }

    if (
      [
        "onemeleeattack",
        "meleeattack"
      ].includes(target)
    ) {
      return (
        rangeType === "melee"
      );
    }

    if (
      [
        "onerangedattack",
        "rangeattack",
        "rangedattack"
      ].includes(target)
    ) {
      return [
        "range",
        "ranged"
      ].includes(rangeType);
    }

    if (
      target ===
      "onemeleedamageattack"
    ) {
      return (
        rangeType === "melee" &&
        functionType === "damage"
      );
    }

    if (
      target === "supportattack"
    ) {
      return (
        functionType === "support"
      );
    }

    return true;
  }

  async _onQualityAttackChoiceChange(
    event
  ) {
    event.preventDefault();
    event.stopPropagation();

    const select =
      event.currentTarget;

    const rank = Math.max(
      1,
      Number(
        select?.dataset?.rank ?? 1
      )
    );

    const selectedKey =
      String(
        select?.value ?? ""
      ).trim();

    const actor =
      this.item.actor ??
      this.item.parent;

    const previousChoices =
      Array.isArray(
        this.item.system
          ?.choices
          ?.selectedRanks
      )
        ? foundry.utils.deepClone(
            this.item.system
              .choices
              .selectedRanks
          )
        : [];

    const context =
      this._getQualityAttackChoiceContext();

    const row =
      context.rows?.find((entry) => {
        return Number(entry.rank) ===
          rank;
      }) ?? null;

    const selectedOption =
      row?.options?.find((option) => {
        return option.key ===
          selectedKey;
      }) ?? null;

    const nextChoices =
      previousChoices.filter(
        (choice, index) => {
          return Math.max(
            1,
            Number(
              choice?.rank ??
              index + 1
            )
          ) !== rank;
        }
      );

    if (selectedOption) {
      nextChoices.push({
        rank,

        key:
          selectedOption.key,

        label:
          selectedOption.label,

        originalLabel:
          "",

        attackId:
          selectedOption.attackId,

        attackName:
          selectedOption.attackName,

        attackTag:
          selectedOption.attackTag ??
          "",

        effectTag:
          selectedOption.effectTag ??
          "",

        effectType:
          selectedOption.effectType ??
          "",

        potencyStat:
          selectedOption.potencyStat ??
          "",

        duration:
          selectedOption.duration ??
          true,

        extraActionRequired:
          Boolean(
            selectedOption
              .extraActionRequired
          ),

        requiresDamageTag:
          Boolean(
            selectedOption
              .requiresDamageTag
          ),

        onlyAffectsAllies:
          Boolean(
            selectedOption
              .onlyAffectsAllies
          ),

        appliesTo:
          selectedOption.appliesTo ??
          "",

        requirements:
          foundry.utils.deepClone(
            selectedOption
              .requirements ?? {}
          ),

        effect:
          selectedOption.effect ?? ""
      });
    }

    nextChoices.sort(
      (left, right) => {
        return (
          Number(left.rank ?? 0) -
          Number(right.rank ?? 0)
        );
      }
    );

await this.item.update(
  {
    "system.choices.enabled": true,
    "system.choices.selectedRanks": nextChoices
  },
  {
    ddaSkipQualityChoiceCleanup: true
  }
);

    await this
      ._syncQualityAttackChoiceTags(
        actor,
        previousChoices,
        nextChoices
      );

    await this.render();
  }

  async _syncQualityAttackChoiceTags(
    actor,
    previousChoices = [],
    nextChoices = []
  ) {
    if (!actor?.items) return;

    const previousBindings =
      previousChoices
        .map((choice) => {
          return this
            ._getQualityChoiceIdentity(
              choice
            );
        })
        .filter((binding) => {
          return (
            binding.attackId &&
            binding.tag
          );
        });

    const nextBindings =
      nextChoices
        .map((choice) => {
          return this
            ._getQualityChoiceIdentity(
              choice
            );
        })
        .filter((binding) => {
          return (
            binding.attackId &&
            binding.tag
          );
        });

    const touchedAttackIds =
      new Set([
        ...previousBindings.map(
          (binding) => {
            return binding.attackId;
          }
        ),

        ...nextBindings.map(
          (binding) => {
            return binding.attackId;
          }
        )
      ]);

    for (
      const attackId of
      touchedAttackIds
    ) {
      const attack =
        actor.items.get(attackId);

      if (
        !attack ||
        attack.type !== "attack"
      ) {
        continue;
      }

      const currentTags = (
        Array.isArray(
          attack.system
            ?.qualityTags
        )
          ? attack.system.qualityTags
          : []
      )
        .map((tag) => {
          return this
            ._normalizeQualityAttackTag(
              tag
            );
        })
        .filter(Boolean);

      const nextTagSet =
        new Set(currentTags);

      for (
        const binding of
        previousBindings.filter(
          (entry) => {
            return entry.attackId ===
              attackId;
          }
        )
      ) {
        const remainsInThisQuality =
          nextBindings.some((entry) => {
            return (
              entry.attackId ===
                binding.attackId &&
              entry.tag === binding.tag
            );
          });

        if (remainsInThisQuality) {
          continue;
        }

        if (
          this
            ._isAttackTagGrantedByAnotherQuality(
              actor,
              attackId,
              binding.tag
            )
        ) {
          continue;
        }

        nextTagSet.delete(
          binding.tag
        );
      }

      for (
        const binding of
        nextBindings.filter(
          (entry) => {
            return entry.attackId ===
              attackId;
          }
        )
      ) {
        nextTagSet.add(
          binding.tag
        );
      }

      const nextTags = [
        ...nextTagSet
      ];

      const changed =
        nextTags.length !==
          currentTags.length ||
        nextTags.some(
          (tag, index) => {
            return tag !==
              currentTags[index];
          }
        );

      if (changed) {
        await attack.update({
          "system.qualityTags":
            nextTags
        });
      }
    }
  }

  _isAttackTagGrantedByAnotherQuality(
    actor,
    attackId,
    tag
  ) {
    const normalizedTag =
      this
        ._normalizeQualityAttackTag(
          tag
        );

    return actor.items.some((item) => {
      if (
        item.type !== "quality" ||
        item.id === this.item.id
      ) {
        return false;
      }

      const selectedRanks =
        Array.isArray(
          item.system
            ?.choices
            ?.selectedRanks
        )
          ? item.system
              .choices
              .selectedRanks
          : [];

      return selectedRanks.some(
        (choice) => {
          const identity =
            this
              ._getQualityChoiceIdentity(
                choice
              );

          return (
            identity.attackId ===
              attackId &&
            identity.tag ===
              normalizedTag
          );
        }
      );
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

    const rangeType = String(
      attack.system
        ?.baseTags
        ?.rangeType ?? ""
    )
      .trim()
      .toLowerCase();

    const functionType = String(
      attack.system
        ?.baseTags
        ?.functionType ?? ""
    )
      .trim()
      .toLowerCase();

    const isSignature =
      Boolean(
        attack.system?.isSignature
      );

    const effectTagLabels =
      CONFIG.DDA?.effectTags ?? {};

    const appliesToLabels = {
      all:
        localize(
          "DDA.Attack.AppliesTo.All"
        ),

      melee:
        localize(
          "DDA.Attack.Range.Melee"
        ),

      range:
        localize(
          "DDA.Attack.Range.Ranged"
        ),

      ranged:
        localize(
          "DDA.Attack.Range.Ranged"
        ),

      damage:
        localize(
          "DDA.Attack.Function.Damage"
        ),

      support:
        localize(
          "DDA.Attack.Function.Support"
        ),

      signature:
        localize(
          "DDA.Attack.Signature"
        ),

      signatureMove:
        localize(
          "DDA.Attack.Signature"
        ),

      taggedAttack:
        localize(
          "DDA.Attack.AppliedTags"
        ),

      oneAttack:
        localize(
          "DDA.Attack.AppliedTags"
        ),

      oneDamageAttack:
        localize(
          "DDA.Attack.Function.Damage"
        ),

      oneMeleeAttack:
        localize(
          "DDA.Attack.Range.Melee"
        ),

      oneRangedAttack:
        localize(
          "DDA.Attack.Range.Ranged"
        ),

      oneMeleeDamageAttack:
        localize(
          "DDA.Attack.Range.Melee"
        ),

      differentAttackPerRank:
        localize(
          "DDA.Attack.AppliedTags"
        ),

      oneAttackPerPurchasedEffect:
        localize(
          "DDA.Attack.AppliedTags"
        )
    };

    const attackQualityTags =
      new Set(
        (
          attack.system
            ?.qualityTags ?? []
        ).map((tag) => {
          return this
            ._normalizeQualityAttackTag(
              tag
            );
        })
      );

    return actor.items
      .filter((item) => {
        return item.type === "quality";
      })
      .filter((quality) => {
        const modifier =
          quality.system
            ?.attackModifier ?? {};

        const rawGrantedTags =
          Array.isArray(
            modifier.grantsTags
          )
            ? modifier.grantsTags
            : [];

        if (
          !modifier.enabled &&
          !rawGrantedTags.length &&
          !Number(
            modifier.accuracyBonus ?? 0
          ) &&
          !Number(
            modifier.damageBonus ?? 0
          ) &&
          !Number(
            modifier
              .accuracyBonusPerRank ?? 0
          ) &&
          !Number(
            modifier
              .damageBonusPerRank ?? 0
          ) &&
          !modifier.effectTag
        ) {
          return false;
        }

        const appliesTo = String(
          modifier.appliesTo ?? ""
        ).trim();

        const grantedTags =
          rawGrantedTags.map((tag) => {
            return this
              ._normalizeQualityAttackTag(
                tag
              );
          });

        const hasGrantedTag =
          grantedTags.some((tag) => {
            return attackQualityTags
              .has(tag);
          });

        const selectedChoices =
          Array.isArray(
            quality.system
              ?.choices
              ?.selectedRanks
          )
            ? quality.system
                .choices
                .selectedRanks
            : [];

        const explicitSelection =
          selectedChoices.some(
            (choice) => {
              return this
                ._getQualityChoiceIdentity(
                  choice
                )
                .attackId ===
                attack.id;
            }
          );

        if (explicitSelection) {
          return true;
        }

        if (
          appliesTo ===
          "oneAttackPerPurchasedEffect"
        ) {
          return false;
        }

        if (
          [
            "oneAttack",
            "oneDamageAttack",
            "oneMeleeAttack",
            "oneRangedAttack",
            "oneMeleeDamageAttack",
            "differentAttackPerRank",
            "taggedAttack"
          ].includes(appliesTo)
        ) {
          return hasGrantedTag;
        }

        if (
          !appliesTo &&
          grantedTags.length
        ) {
          return hasGrantedTag;
        }

        if (appliesTo === "all") {
          return true;
        }

        if (
          [
            "signature",
            "signatureMove"
          ].includes(appliesTo)
        ) {
          return isSignature;
        }

        return (
          appliesTo === rangeType ||
          appliesTo === functionType
        );
      })
      .map((quality) => {
        const modifier =
          quality.system
            ?.attackModifier ?? {};

        const appliesTo = String(
          modifier.appliesTo ?? ""
        ).trim();

        const selectedChoices =
          Array.isArray(
            quality.system
              ?.choices
              ?.selectedRanks
          )
            ? quality.system
                .choices
                .selectedRanks
            : [];

        const selectedChoice =
          selectedChoices.find(
            (choice) => {
              return this
                ._getQualityChoiceIdentity(
                  choice
                )
                .attackId ===
                attack.id;
            }
          ) ?? null;

        const selectedIdentity =
          this._getQualityChoiceIdentity(
            selectedChoice ?? {}
          );

        const directEffectTag =
          this
            ._normalizeQualityAttackTag(
              modifier.effectTag ?? ""
            );

        const displayedTag =
          selectedIdentity.tag ||
          directEffectTag;

        const extraActionCost =
          Number(
            modifier.extraActionCost ??
            modifier.actionCostIncrease ??
            0
          ) +
          (
            selectedChoice
              ?.extraActionRequired &&
            !isSignature
              ? 1
              : 0
          );

        return {
          id:
            quality.id,

          name:
            quality.name,

          appliesTo,

          appliesToLabel:
            appliesToLabels[
              appliesTo
            ] ?? appliesTo,

          accuracyBonus:
            Number(
              modifier.accuracyBonus ??
              0
            ),

          damageBonus:
            Number(
              modifier.damageBonus ??
              0
            ),

          unalterableDamage:
            Number(
              modifier
                .unalterableDamage ?? 0
            ),

          extraActionCost,

          effectTag:
            displayedTag,

          effectTagLabel:
            displayedTag
              ? effectTagLabels[
                  displayedTag
                ] ??
                `[${displayedTag.toUpperCase()}]`
              : ""
        };
      });
  }
}

function registerQualityAttackChoiceCleanupHooks() {
  if (globalThis.__ddaQualityAttackChoiceCleanupHooksRegistered) return;

  globalThis.__ddaQualityAttackChoiceCleanupHooksRegistered = true;

  Hooks.on("updateItem", (item, changed, options, userId) => {
    if (
      userId !== game.user?.id ||
      item?.type !== "quality" ||
      options?.ddaSkipQualityChoiceCleanup
    ) return;

    if (
      !foundry.utils.hasProperty(
        changed,
        "system.rank.value"
      )
    ) return;

    void pruneQualityAttackChoicesToCurrentRank(item).catch((error) => {
      console.warn(
        "DDA | Could not prune Quality attack choices after a Rank change.",
        error
      );
    });
  });

  Hooks.on("deleteItem", (item, _options, userId) => {
    if (
      userId !== game.user?.id ||
      item?.type !== "quality"
    ) return;

    const actor =
      item.actor ??
      item.parent;

    if (!actor?.items) return;

    const previousChoices =
      Array.isArray(
        item.system?.choices?.selectedRanks
      )
        ? foundry.utils.deepClone(
            item.system.choices.selectedRanks
          )
        : [];

    void syncQualityAttackChoiceTagsAfterLifecycleChange(
      actor,
      item.id,
      previousChoices,
      []
    ).catch((error) => {
      console.warn(
        "DDA | Could not clean attack Tags from a deleted Quality.",
        error
      );
    });
  });
}

async function pruneQualityAttackChoicesToCurrentRank(
  quality
) {
  const actor =
    quality?.actor ??
    quality?.parent;

  if (
    quality?.type !== "quality" ||
    !actor?.items
  ) return;

  const previousChoices =
    Array.isArray(
      quality.system?.choices?.selectedRanks
    )
      ? foundry.utils.deepClone(
          quality.system.choices.selectedRanks
        )
      : [];

  const currentRank = Math.max(
    1,
    Number(
      quality.system?.rank?.value ??
      1
    )
  );

  const nextChoices =
    previousChoices.filter((choice, index) => {
      const choiceRank = Math.max(
        1,
        Number(
          choice?.rank ??
          index + 1
        )
      );

      return choiceRank <= currentRank;
    });

  if (
    nextChoices.length ===
    previousChoices.length
  ) return;

  await quality.update(
    {
      "system.choices.selectedRanks":
        nextChoices
    },
    {
      render: false,
      ddaSkipQualityChoiceCleanup: true
    }
  );

  await syncQualityAttackChoiceTagsAfterLifecycleChange(
    actor,
    quality.id,
    previousChoices,
    nextChoices
  );

  quality.sheet?.render(true);
}

async function syncQualityAttackChoiceTagsAfterLifecycleChange(
  actor,
  sourceQualityId,
  previousChoices = [],
  nextChoices = []
) {
  if (!actor?.items) return;

  const previousBindings =
    previousChoices
      .map(
        getQualityAttackChoiceCleanupBinding
      )
      .filter((binding) => {
        return (
          binding.attackId &&
          binding.tag
        );
      });

  const nextBindings =
    nextChoices
      .map(
        getQualityAttackChoiceCleanupBinding
      )
      .filter((binding) => {
        return (
          binding.attackId &&
          binding.tag
        );
      });

  const touchedAttackIdentities =
    new Set([
      ...previousBindings.map(
        (binding) => binding.attackId
      ),

      ...nextBindings.map(
        (binding) => binding.attackId
      )
    ]);

  for (
    const attackIdentity of
    touchedAttackIdentities
  ) {
    const attack =
      actor.items.find((item) => {
        return (
          item.type === "attack" &&
          getAttackChoiceCleanupIdentityKeys(
            item
          ).has(attackIdentity)
        );
      });

    if (!attack) continue;

    const attackIdentityKeys =
      getAttackChoiceCleanupIdentityKeys(
        attack
      );

    const currentTags =
      Array.isArray(
        attack.system?.qualityTags
      )
        ? attack.system.qualityTags
            .map(
              normalizeQualityAttackCleanupTag
            )
            .filter(Boolean)
        : [];

    const nextTagSet =
      new Set(currentTags);

    for (
      const binding of
      previousBindings
    ) {
      if (
        !attackIdentityKeys.has(
          binding.attackId
        )
      ) continue;

      const remainsInThisQuality =
        nextBindings.some((entry) => {
          return (
            attackIdentityKeys.has(
              entry.attackId
            ) &&
            entry.tag === binding.tag
          );
        });

      if (remainsInThisQuality) continue;

      if (
        isQualityAttackTagGrantedElsewhere(
          actor,
          sourceQualityId,
          attackIdentityKeys,
          binding.tag
        )
      ) continue;

      nextTagSet.delete(
        binding.tag
      );
    }

    for (
      const binding of
      nextBindings
    ) {
      if (
        attackIdentityKeys.has(
          binding.attackId
        )
      ) {
        nextTagSet.add(
          binding.tag
        );
      }
    }

    const nextTags = [
      ...nextTagSet
    ];

    const changed =
      nextTags.length !==
        currentTags.length ||
      nextTags.some((tag, index) => {
        return tag !==
          currentTags[index];
      });

    if (!changed) continue;

    await attack.update({
      "system.qualityTags":
        nextTags
    });
  }
}

function isQualityAttackTagGrantedElsewhere(
  actor,
  sourceQualityId,
  attackIdentityKeys,
  tag
) {
  const normalizedTag =
    normalizeQualityAttackCleanupTag(
      tag
    );

  return actor.items.some((item) => {
    if (
      item.type !== "quality" ||
      item.id === sourceQualityId
    ) {
      return false;
    }

    const selectedRanks =
      Array.isArray(
        item.system?.choices?.selectedRanks
      )
        ? item.system.choices.selectedRanks
        : [];

    return selectedRanks.some((choice) => {
      const binding =
        getQualityAttackChoiceCleanupBinding(
          choice
        );

      return (
        attackIdentityKeys.has(
          binding.attackId
        ) &&
        binding.tag === normalizedTag
      );
    });
  });
}

function getAttackChoiceCleanupIdentityKeys(
  attack
) {
  return new Set([
    attack?.id,

    attack?.system
      ?.wizard
      ?.attackKey,

    attack?.flags
      ?.[
        "digimon-digital-adventures"
      ]
      ?.wizardAttackKey,

    attack?.flags
      ?.[
        "digimon-digital-adventures"
      ]
      ?.enemyBuilderAttackKey
  ]
    .map((value) => {
      return String(
        value ?? ""
      ).trim();
    })
    .filter(Boolean));
}

function getQualityAttackChoiceCleanupBinding(
  choice = {}
) {
  const keyText =
    String(
      choice.key ?? ""
    ).trim();

  const separatorIndex =
    keyText.indexOf(":");

  const keyAttackId =
    separatorIndex > 0
      ? keyText
          .slice(
            0,
            separatorIndex
          )
          .trim()
      : "";

  const keyTag =
    separatorIndex > 0
      ? keyText
          .slice(
            separatorIndex + 1
          )
          .trim()
      : "";

  return {
    attackId:
      String(
        choice.attackId ??
        choice.attackItemId ??
        choice.itemId ??
        choice.attackKey ??
        choice.id ??
        keyAttackId ??
        ""
      ).trim(),

    tag:
      normalizeQualityAttackCleanupTag(
        choice.effectTag ??
        choice.attackTag ??
        choice.grantedTag ??
        keyTag
      )
  };
}

function normalizeQualityAttackCleanupTag(
  value = ""
) {
  return String(value ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
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
