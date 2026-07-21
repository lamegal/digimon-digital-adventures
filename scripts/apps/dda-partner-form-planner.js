import {
  getCurrentPartnerFormWizardContext
} from "../combat/evolution.js";
import { DDADigimonDatabase } from "../data/digimon-database.js";
import {
  getDdaPortraitPath
} from "../data/dda-portrait-and-manual-digimon-data.js";
import {
  DDA_STAGE_ORDER,
  getDigimonStageLabel
} from "../helpers/digimon-stage-labels.js";

const {
  ApplicationV2,
  HandlebarsApplicationMixin
} = foundry.applications.api;

const DDAPartnerFormPlannerBase = HandlebarsApplicationMixin(ApplicationV2);

function localize(key, fallback = key) {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSearchText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getActorPortraitSources(actor = null) {
  const system = actor?.system ?? {};
  const names = system.names ?? {};
  const aliases = [
    names.original,
    ...(Array.isArray(names.aliases) ? names.aliases : [])
  ].filter(Boolean);

  const indexedPortrait = getDdaPortraitPath({
    key: system.sourceId ?? system.databaseId ?? actor?.databaseId ?? "",
    name: names.dub ?? actor?.name ?? "",
    species: system.species ?? names.original ?? "",
    aliases
  });

  const databaseImageSources = [
    system?.images?.portrait,
    system?.images?.portraitImagePath,
    system?.images?.localImagePath,
    actor?.img,
    actor?.prototypeToken?.texture?.src,
    system?.evolution?.portraitImg,
    system?.portraitImg,
    system?.img,
    indexedPortrait
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const staticPortraitFallbacks = [];

  for (const source of databaseImageSources) {
    const cleanSource = source.split(/[?#]/, 1)[0];
    const fileName = cleanSource.split("/").at(-1) ?? "";

    if (fileName) {
      staticPortraitFallbacks.push(
        `systems/digimon-digital-adventures/assets/digimon/portraits/${fileName.replace(/\.webm$/i, ".webp")}`
      );
    }

    if (/\.webm$/i.test(cleanSource)) {
      staticPortraitFallbacks.push(cleanSource.replace(/\.webm$/i, ".webp"));
    }
  }

  const tokenSources = [
    system?.images?.token,
    system?.images?.tokenImagePath,
    system?.evolution?.tokenImg,
    system?.tokenImg
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const staticTokenFallbacks = tokenSources.map((source) => {
    const cleanSource = source.split(/[?#]/, 1)[0];
    const fileName = cleanSource.split("/").at(-1) ?? "";
    return fileName
      ? `systems/digimon-digital-adventures/assets/digimon/tokens/${fileName.replace(/\.webm$/i, ".webp")}`
      : "";
  });

  /*
   * A base de Digimon ainda possui vários `actor.img` apontando para antigas
   * pastas por Estágio. Os retratos estáticos reais ficam em
   * assets/digimon/portraits. Por isso os equivalentes WEBP entram antes dos
   * caminhos legados e dos tokens.
   */
  const sources = [
    ...staticPortraitFallbacks,
    ...databaseImageSources,
    ...staticTokenFallbacks,
    ...tokenSources
  ]
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      return value &&
        !value.endsWith("mystery-man.svg") &&
        !/\.webm(?:$|[?#])/i.test(value);
    });

  return Array.from(new Set([
    ...sources,
    "icons/svg/mystery-man.svg"
  ]));
}

function getSnapshotPortraitSources(snapshot = {}) {
  const species = String(
    snapshot?.species ??
    snapshot?.sourceFormName ??
    snapshot?.name ??
    ""
  ).trim();

  const indexedPortrait = getDdaPortraitPath({
    key: snapshot?.sourceFormUuid ?? snapshot?.key ?? "",
    name: snapshot?.sourceFormName ?? snapshot?.name ?? species,
    species
  });

  const rawSources = [
    snapshot?.portraitImg,
    snapshot?.img,
    snapshot?.tokenImg,
    indexedPortrait
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const staticPortraitFallbacks = [];

  for (const source of rawSources) {
    const cleanSource = source.split(/[?#]/, 1)[0];
    const fileName = cleanSource.split("/").at(-1) ?? "";

    if (fileName) {
      staticPortraitFallbacks.push(
        `systems/digimon-digital-adventures/assets/digimon/portraits/${fileName.replace(/\.webm$/i, ".webp")}`
      );
    }
  }

  const stageKey = String(snapshot?.stage ?? "").trim();
  const stageFolder = {
    baby1: "baby1",
    baby2: "baby2",
    child: "child",
    adult: "adult",
    perfect: "perfect",
    ultimate: "ultimate",
    ultimatePlus: "ultimatePlus"
  }[stageKey];

  const speciesStageFallback = species && stageFolder
    ? `systems/digimon-digital-adventures/assets/digimon/${stageFolder}/${species}.webp`
    : "";

  const sources = [
    ...staticPortraitFallbacks,
    ...rawSources,
    speciesStageFallback
  ]
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      return value &&
        !value.endsWith("mystery-man.svg") &&
        !/\.webm(?:$|[?#])/i.test(value);
    });

  return Array.from(new Set([
    ...sources,
    "icons/svg/mystery-man.svg"
  ]));
}

function attachImageFallbacks(root) {
  for (const image of root?.querySelectorAll?.("img[data-fallback-srcs]") ?? []) {
    image.addEventListener("error", () => {
      const fallbacks = String(image.dataset.fallbackSrcs ?? "")
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean);
      const index = Math.max(0, number(image.dataset.fallbackIndex, 0));

      if (index < fallbacks.length) {
        image.dataset.fallbackIndex = String(index + 1);
        image.src = fallbacks[index];
        return;
      }

      image.removeAttribute("data-fallback-srcs");
      image.src = "icons/svg/mystery-man.svg";
    });
  }
}

function getActorAttributeLabel(actor = null) {
  const attributeKey = String(actor?.system?.attribute ?? "none").trim() || "none";
  const configuredLabel = CONFIG.DDA?.digimonAttributes?.[attributeKey];
  const label = String(configuredLabel ?? "").trim();

  return {
    key: attributeKey,
    label: label.startsWith("DDA.")
      ? localize(label, attributeKey)
      : (label || attributeKey)
  };
}

function getTemplateReference(actor = null) {
  return String(
    actor?.uuid ??
    actor?.databaseId ??
    actor?.system?.databaseId ??
    actor?.system?.sourceId ??
    actor?._id ??
    actor?.id ??
    actor?.name ??
    ""
  ).trim();
}

function getSnapshotDp(snapshot = {}) {
  const dp = snapshot.creation?.dp ?? {};

  const total = number(
    dp.total,
    number(dp.base) + number(dp.bonus) + number(dp.negative)
  );

  const spent = number(
    dp.spentTotal,
    number(dp.spentBaseStats) +
      number(dp.spentBaseQualities) +
      number(dp.spentBonusStats) +
      number(dp.spentBonusQualities)
  );

  const remaining = Number.isFinite(Number(dp.remaining))
    ? Number(dp.remaining)
    : total - spent;

  return {
    base: number(dp.base),
    bonus: number(dp.bonus),
    negative: number(dp.negative),
    total,
    spent,
    remaining,
    statusClass: remaining < 0
      ? "is-over"
      : remaining === 0
        ? "is-balanced"
        : "is-available"
  };
}

function getSnapshotMainStat(snapshot = {}, statKey = "") {
  const stat = snapshot.mainStats?.[statKey] ?? {};
  return number(stat.total, number(stat.base));
}

function getSnapshotItems(snapshot = {}, type = "") {
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  return items.filter((item) => item?.type === type);
}

function isNegativeQuality(item = {}) {
  const tier = String(item.system?.tier ?? "").trim().toLowerCase();
  return tier === "negative" || Boolean(item.system?.isNegative);
}

function getUnlockedStages(tamerActor = null) {
  const unlockedStages = foundry.utils.deepClone(
    tamerActor?.system?.partner?.unlockedEvolutionStages ?? {}
  );

  for (const stageKey of DDA_STAGE_ORDER) {
    if (unlockedStages[stageKey] === undefined) {
      unlockedStages[stageKey] = ["baby1", "baby2", "child"].includes(stageKey);
    }
  }

  return unlockedStages;
}

export class DDAPartnerFormPlanner extends DDAPartnerFormPlannerBase {
  static DEFAULT_OPTIONS = {
    id: "dda-partner-form-planner",
    classes: ["dda", "dda-partner-form-planner"],
    position: {
      width: 1040,
      height: 780
    },
    window: {
      icon: "fas fa-project-diagram",
      resizable: true
    },
    actions: {
      refresh: DDAPartnerFormPlanner._onActionRefresh,
      adjustForm: DDAPartnerFormPlanner._onActionAdjustForm,
      addForm: DDAPartnerFormPlanner._onActionAddForm
    }
  };

  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-partner-form-planner.hbs",
      scrollable: [".dda-partner-form-planner__body"]
    }
  };

  constructor(sourceActor, options = {}) {
    super(options);
    this.sourceActor = sourceActor ?? null;
    this.formContext = null;
  }

  static async open(sourceActor, options = {}) {
    if (!sourceActor) return null;

    const application = new this(sourceActor, options);
    application.render(true);
    return application;
  }

  get title() {
    return localize(
      "DDA.PartnerFormPlanner.Title",
      "Planejamento de Formas"
    );
  }

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const formContext = await getCurrentPartnerFormWizardContext(this.sourceActor);

    if (!formContext) {
      this.formContext = null;
      return {
        ...context,
        ready: false,
        forms: [],
        stages: []
      };
    }

    this.formContext = formContext;

    const {
      tamerActor,
      partnerActor,
      snapshot: currentSnapshot
    } = formContext;

    const canEdit = Boolean(
      game.user?.isGM ||
      tamerActor?.isOwner ||
      partnerActor?.isOwner
    );

    const unlockedStages = getUnlockedStages(tamerActor);

    const currentFormUuid = String(
      partnerActor.system.evolution?.currentFormUuid ||
      partnerActor.system.evolution?.sourceFormUuid ||
      partnerActor.uuid
    ).trim();

    const currentFormReference = String(
      currentSnapshot?.sourceFormUuid ||
      currentFormUuid
    ).trim();

    const snapshots = Object.values(
      partnerActor.system.evolution?.formSnapshots ?? {}
    ).filter((snapshot) => snapshot && typeof snapshot === "object");

    if (
      currentSnapshot &&
      !snapshots.some((snapshot) => {
        return String(snapshot.sourceFormUuid ?? "").trim() ===
          String(currentSnapshot.sourceFormUuid ?? "").trim();
      })
    ) {
      snapshots.push(currentSnapshot);
    }

    const forms = snapshots
      .map((snapshot) => this._getFormViewData({
        snapshot,
        currentFormReference,
        unlockedStages,
        canEdit
      }))
      .filter(Boolean)
      .sort((left, right) => {
        const stageDifference = DDA_STAGE_ORDER.indexOf(left.stageKey) -
          DDA_STAGE_ORDER.indexOf(right.stageKey);

        if (stageDifference) return stageDifference;

        return left.species.localeCompare(
          right.species,
          game.i18n?.lang
        );
      });

    const stages = DDA_STAGE_ORDER
      .filter((stageKey) => stageKey !== "baby1")
      .map((stageKey) => ({
        key: stageKey,
        label: getDigimonStageLabel(stageKey),
        unlocked: Boolean(unlockedStages[stageKey]),
        formCount: forms.filter((form) => form.stageKey === stageKey).length
      }));

    return {
      ...context,
      ready: true,
      canEdit,
      tamer: {
        uuid: tamerActor?.uuid ?? "",
        name: tamerActor?.name ?? ""
      },
      partner: {
        uuid: partnerActor.uuid,
        name: partnerActor.name,
        img: partnerActor.img
      },
      forms,
      stages,
      hasForms: forms.length > 0
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    attachImageFallbacks(this.element);
  }

  _getFormViewData({
    snapshot,
    currentFormReference,
    unlockedStages,
    canEdit
  }) {
    const sourceFormUuid = String(snapshot.sourceFormUuid ?? "").trim();
    if (!sourceFormUuid) return null;

    const stageKey = String(snapshot.stage ?? "child").trim() || "child";
    const dp = getSnapshotDp(snapshot);
    const attacks = getSnapshotItems(snapshot, "attack")
      .map((item) => ({ name: String(item.name ?? "").trim() }))
      .filter((item) => item.name);

    const qualityItems = getSnapshotItems(snapshot, "quality");
    const qualitiesPositive = qualityItems
      .filter((item) => !isNegativeQuality(item))
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        description: String(item.system?.description ?? "").trim()
      }))
      .filter((item) => item.name);

    const qualitiesNegative = qualityItems
      .filter(isNegativeQuality)
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        description: String(item.system?.description ?? "").trim()
      }))
      .filter((item) => item.name);

    const isCurrent = Boolean(
      sourceFormUuid === currentFormReference ||
      sourceFormUuid === this.formContext?.partnerActor?.uuid
    );

    const adjustmentAmount = Math.abs(dp.remaining);
    const portraitSources = getSnapshotPortraitSources(snapshot);

    return {
      key: String(snapshot.key ?? sourceFormUuid),
      sourceFormUuid,
      species: String(
        snapshot.species ??
        snapshot.sourceFormName ??
        snapshot.name ??
        "Digimon"
      ).trim(),
      name: String(snapshot.name ?? "").trim(),
      img: portraitSources[0],
      imageFallbacks: portraitSources.slice(1).join("|"),
      stageKey,
      stageLabel: getDigimonStageLabel(stageKey),
      unlocked: Boolean(unlockedStages[stageKey]),
      isCurrent,
      prepared: Boolean(snapshot.wizard?.preparedFutureForm),
      createdByInitialLine: Boolean(snapshot.wizard?.createdByInitialLine),
      canEdit: canEdit && stageKey !== "baby1",
      dp,
      adjustment: {
        className: dp.statusClass,
        label: dp.remaining < 0
          ? game.i18n.format(
            "DDA.PartnerFormPlanner.FixOverspend",
            { dp: adjustmentAmount }
          )
          : dp.remaining > 0
            ? game.i18n.format(
              "DDA.PartnerFormPlanner.SpendRemaining",
              { dp: dp.remaining }
            )
            : localize(
              "DDA.PartnerFormPlanner.AdjustBuild",
              "Ajustar build"
            )
      },
      stats: {
        accuracy: getSnapshotMainStat(snapshot, "accuracy"),
        damage: getSnapshotMainStat(snapshot, "damage"),
        dodge: getSnapshotMainStat(snapshot, "dodge"),
        armor: getSnapshotMainStat(snapshot, "armor"),
        health: getSnapshotMainStat(snapshot, "health")
      },
      attacks,
      qualitiesPositive,
      qualitiesNegative
    };
  }

  static async _onActionRefresh(event) {
    event.preventDefault();
    await this.render();
  }

  static async _onActionAdjustForm(event, target) {
    event.preventDefault();

    if (!this.formContext) return;

    const sourceFormUuid = String(
      target?.dataset?.formUuid ?? ""
    ).trim();

    if (!sourceFormUuid) return;

    const { DDADigimonWizard } = await import(
      "../wizard/dda-digimon-wizard.js"
    );

    await DDADigimonWizard.openStoredFormWizard(
      this.sourceActor,
      sourceFormUuid,
      { returnApplication: this }
    );
  }

  static async _onActionAddForm(event, target) {
    event.preventDefault();

    if (!this.formContext) return;

    const stageKey = String(
      target?.dataset?.stageKey ?? ""
    ).trim();

    if (!stageKey) return;

    await this._openFormPicker(stageKey);
  }

  async _openFormPicker(stageKey) {
    const actors = (await DDADigimonDatabase.getAll())
      .filter((actor) => actor?.type === "digimon")
      .filter((actor) => String(actor.system?.stage ?? "") === stageKey)
      .filter((actor) => {
        return String(actor.system?.evolutionCategory ?? "normal") === "normal";
      })
      .filter((actor) => !actor.system?.isSpecialForm)
      .sort((left, right) => {
        const leftName = left.system?.names?.dub || left.system?.species || left.name || "";
        const rightName = right.system?.names?.dub || right.system?.species || right.name || "";

        return String(leftName).localeCompare(
          String(rightName),
          game.i18n?.lang
        );
      });

    if (!actors.length) {
      ui.notifications.warn(
        localize(
          "DDA.PartnerFormPlanner.NoFormsForStage",
          "Nenhuma forma foi encontrada para este Estágio."
        )
      );
      return;
    }

    const existingReferences = new Set(
      Object.values(
        this.formContext.partnerActor.system.evolution?.formSnapshots ?? {}
      ).map((snapshot) => String(snapshot?.sourceFormUuid ?? "").trim())
    );

    const availableActors = actors.filter((actor) => {
      return !existingReferences.has(getTemplateReference(actor));
    });

    if (!availableActors.length) {
      ui.notifications.info(
        localize(
          "DDA.PartnerFormPlanner.AllFormsPrepared",
          "Todas as formas disponíveis deste Estágio já foram adicionadas."
        )
      );
      return;
    }

    const picker = new DDAPartnerFutureFormPicker(
      this,
      stageKey,
      availableActors
    );

    picker.render(true);
  }

  async _openFutureFormWizard(formTemplateActor) {
    if (!formTemplateActor || !this.formContext) return null;

    const { DDADigimonWizard } = await import(
      "../wizard/dda-digimon-wizard.js"
    );

    return DDADigimonWizard.openFutureFormWizard(
      this.formContext.tamerActor,
      formTemplateActor,
      { returnApplication: this }
    );
  }
}

class DDAPartnerFutureFormPicker extends DDAPartnerFormPlannerBase {
  static DEFAULT_OPTIONS = {
    id: "dda-partner-future-form-picker",
    classes: ["dda", "dda-partner-future-form-picker"],
    position: {
      width: 920,
      height: 720
    },
    window: {
      icon: "fas fa-images",
      resizable: true
    },
    actions: {
      selectForm: DDAPartnerFutureFormPicker._onActionSelectForm,
      confirmSelection: DDAPartnerFutureFormPicker._onActionConfirmSelection,
      cancelSelection: DDAPartnerFutureFormPicker._onActionCancelSelection
    }
  };

  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-partner-future-form-picker.hbs",
      scrollable: [".dda-partner-future-form-picker__results"]
    }
  };

  constructor(planner, stageKey, actors = [], options = {}) {
    super(options);
    this.planner = planner;
    this.stageKey = String(stageKey ?? "").trim();
    this.actors = Array.isArray(actors) ? actors : [];
    this.selectedReference = "";
    this.actorByReference = new Map(
      this.actors.map((actor) => [getTemplateReference(actor), actor])
    );
  }

  get title() {
    return game.i18n.format(
      "DDA.PartnerFormPlanner.Picker.Title",
      { stage: getDigimonStageLabel(this.stageKey) }
    );
  }

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const entries = this.actors.map((actor) => {
      const system = actor.system ?? {};
      const names = system.names ?? {};
      const reference = getTemplateReference(actor);
      const name = String(
        names.dub || system.species || actor.name || "Digimon"
      ).trim();
      const originalName = String(names.original ?? "").trim();
      const portraitSources = getActorPortraitSources(actor);
      const attribute = getActorAttributeLabel(actor);
      const type = String(system.type ?? "").trim();

      return {
        reference,
        name,
        originalName: originalName && originalName !== name
          ? originalName
          : "",
        img: portraitSources[0],
        imageFallbacks: portraitSources.slice(1).join("|"),
        stageLabel: getDigimonStageLabel(this.stageKey),
        attributeKey: attribute.key,
        attributeLabel: attribute.label,
        type,
        searchText: normalizeSearchText([
          name,
          originalName,
          type,
          attribute.label,
          ...(Array.isArray(names.aliases) ? names.aliases : [])
        ].join(" ")),
        selected: reference === this.selectedReference
      };
    });

    const attributes = Array.from(
      new Map(
        entries.map((entry) => [
          entry.attributeKey,
          entry.attributeLabel
        ])
      ).entries()
    )
      .map(([key, label]) => ({ key, label }))
      .sort((left, right) => {
        return left.label.localeCompare(right.label, game.i18n?.lang);
      });

    return {
      ...context,
      stageLabel: getDigimonStageLabel(this.stageKey),
      entries,
      attributes,
      count: entries.length
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const searchInput = this.element?.querySelector?.(
      "[data-form-picker-search]"
    );
    const attributeSelect = this.element?.querySelector?.(
      "[data-form-picker-attribute]"
    );

    searchInput?.addEventListener("input", () => this._applyFilters());
    attributeSelect?.addEventListener("change", () => this._applyFilters());

    attachImageFallbacks(this.element);

    this._applyFilters();
  }

  _applyFilters() {
    const searchInput = this.element?.querySelector?.(
      "[data-form-picker-search]"
    );
    const attributeSelect = this.element?.querySelector?.(
      "[data-form-picker-attribute]"
    );
    const term = normalizeSearchText(searchInput?.value ?? "");
    const attribute = String(attributeSelect?.value ?? "all");
    let visibleCount = 0;

    for (const card of this.element?.querySelectorAll?.(
      "[data-form-picker-card]"
    ) ?? []) {
      const matchesSearch = !term || String(card.dataset.search ?? "").includes(term);
      const matchesAttribute = attribute === "all" || card.dataset.attribute === attribute;
      const visible = matchesSearch && matchesAttribute;

      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }

    const empty = this.element?.querySelector?.(
      "[data-form-picker-empty]"
    );
    if (empty) empty.hidden = visibleCount > 0;

    const visibleCounter = this.element?.querySelector?.(
      "[data-form-picker-visible-count]"
    );
    if (visibleCounter) visibleCounter.textContent = String(visibleCount);
  }

  _refreshSelection(reference) {
    this.selectedReference = reference;

    for (const card of this.element?.querySelectorAll?.(
      "[data-form-picker-card]"
    ) ?? []) {
      const selected = card.dataset.formReference === reference;
      card.classList.toggle("selected", selected);
      card.setAttribute("aria-pressed", String(selected));
    }

    const selectedActor = this.actorByReference.get(reference);
    const selectedName = String(
      selectedActor?.system?.names?.dub ||
      selectedActor?.system?.species ||
      selectedActor?.name ||
      ""
    ).trim();

    const selectedPanel = this.element?.querySelector?.(
      "[data-form-picker-selection]"
    );
    const selectedLabel = this.element?.querySelector?.(
      "[data-form-picker-selected-name]"
    );
    const confirmButton = this.element?.querySelector?.(
      "[data-action='confirmSelection']"
    );
    const emptyPreview = this.element?.querySelector?.(
      "[data-form-picker-preview-empty]"
    );
    const preview = this.element?.querySelector?.(
      "[data-form-picker-preview]"
    );

    if (selectedPanel) selectedPanel.hidden = !selectedActor;
    if (selectedLabel) selectedLabel.textContent = selectedName;
    if (confirmButton) confirmButton.disabled = !selectedActor;
    if (emptyPreview) emptyPreview.hidden = Boolean(selectedActor);
    if (preview) preview.hidden = !selectedActor;

    if (selectedActor && preview) {
      const system = selectedActor.system ?? {};
      const names = system.names ?? {};
      const portraitSources = getActorPortraitSources(selectedActor);
      const attribute = getActorAttributeLabel(selectedActor);
      const originalName = String(names.original ?? "").trim();
      const type = String(system.type ?? "").trim();
      const image = preview.querySelector("[data-form-picker-preview-image]");

      if (image) {
        image.dataset.fallbackIndex = "0";
        image.dataset.fallbackSrcs = portraitSources.slice(1).join("|");
        image.src = portraitSources[0];
        image.alt = selectedName;
      }

      const values = {
        "[data-form-picker-preview-name]": selectedName,
        "[data-form-picker-preview-original]": originalName && originalName !== selectedName ? originalName : "",
        "[data-form-picker-preview-stage]": getDigimonStageLabel(this.stageKey),
        "[data-form-picker-preview-attribute]": attribute.label,
        "[data-form-picker-preview-type]": type || localize("DDA.Label.None", "—")
      };

      for (const [selector, value] of Object.entries(values)) {
        const node = preview.querySelector(selector);
        if (!node) continue;
        node.textContent = value;
        node.hidden = !value;
      }
    }
  }

  static async _onActionSelectForm(event, target) {
    event.preventDefault();
    const reference = String(target?.dataset?.formReference ?? "").trim();
    if (!reference || !this.actorByReference.has(reference)) return;
    this._refreshSelection(reference);
  }

  static async _onActionConfirmSelection(event) {
    event.preventDefault();
    const actor = this.actorByReference.get(this.selectedReference);

    if (!actor) {
      ui.notifications.warn(
        localize(
          "DDA.PartnerFormPlanner.Picker.SelectRequired",
          "Selecione uma forma antes de continuar."
        )
      );
      return;
    }

    await this.close();
    await this.planner?._openFutureFormWizard(actor);
  }

  static async _onActionCancelSelection(event) {
    event.preventDefault();
    await this.close();
  }
}
