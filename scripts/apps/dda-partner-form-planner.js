import {
  getCurrentPartnerFormWizardContext
} from "../combat/evolution.js";
import {
  getBestPlannedFormCompatibility,
  getPlannedFormCompatibility,
  releaseUnlockedPlannedPartnerForms,
  removePlannedPartnerForm,
  repairPlannedPartnerFormData
} from "./dda-partner-form-release.js";
import { DDADigimonDatabase } from "../data/digimon-database.js";
import {
  resolveDigimonPortraitSources
} from "../helpers/digimon-portrait-resolver.js";
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
  return resolveDigimonPortraitSources(actor);
}

function getSnapshotPortraitSources(snapshot = {}) {
  return resolveDigimonPortraitSources(snapshot, {
    manualPortrait: snapshot?.portraitImg ?? "",
    manualPortraitSelected: Boolean(
      snapshot?.wizard?.portraitManuallySelected ||
      snapshot?.wizard?.portraitSource === "manual"
    )
  });
}

function getApplicationRoot(root) {
  if (root instanceof HTMLElement) return root;
  if (root?.[0] instanceof HTMLElement) return root[0];
  return null;
}

function attachImageFallbacks(root) {
  const element = getApplicationRoot(root);

  for (const image of element?.querySelectorAll?.("img[data-fallback-srcs]") ?? []) {
    if (image.dataset.ddaFallbackBound === "true") continue;
    image.dataset.ddaFallbackBound = "true";
    const rememberResolvedSource = () => {
      image.dataset.resolvedSrc = String(
        image.getAttribute("src") || image.src || ""
      ).trim();
    };

    image.addEventListener("load", rememberResolvedSource);
    rememberResolvedSource();

    image.addEventListener("error", () => {
      const fallbacks = String(image.dataset.fallbackSrcs ?? "")
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean);
      const index = Math.max(0, number(image.dataset.fallbackIndex, 0));

      if (index < fallbacks.length) {
        image.dataset.fallbackIndex = String(index + 1);
        image.setAttribute("src", fallbacks[index]);
        return;
      }

      image.removeAttribute("data-fallback-srcs");
      image.setAttribute("src", "icons/svg/mystery-man.svg");
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

function normalizeEvolutionCategoryKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/x[\s_-]*antibody/g, "antibody")
    .replace(/bio[\s_-]*merge/g, "biomerge")
    .replace(/mode[\s_-]*change/g, "mode")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getEvolutionCategoryViewData(source = {}) {
  const specialForm = source?.specialForm ?? {};
  const keys = Array.from(new Set([
    source?.evolutionCategory,
    source?.primarySpecialCategory,
    ...(Array.isArray(source?.specialCategories) ? source.specialCategories : []),
    specialForm?.kind,
    specialForm?.method
  ]
    .map(normalizeEvolutionCategoryKey)
    .filter(Boolean)));

  if (!keys.length) keys.push("normal");
  if (source?.isSpecialForm && keys.every((key) => key === "normal")) {
    keys.push("special");
  }

  const labels = {
    normal: ["DDA.PartnerFormPlanner.Category.Normal", "Normal"],
    antibody: ["DDA.PartnerFormPlanner.Category.Antibody", "X-Antibody"],
    armor: ["DDA.PartnerFormPlanner.Category.Armor", "Armor"],
    mode: ["DDA.PartnerFormPlanner.Category.Mode", "Mode Change"],
    burst: ["DDA.PartnerFormPlanner.Category.Burst", "Burst"],
    blast: ["DDA.PartnerFormPlanner.Category.Burst", "Burst"],
    hybrid: ["DDA.PartnerFormPlanner.Category.Hybrid", "Hybrid"],
    spirit: ["DDA.PartnerFormPlanner.Category.Hybrid", "Hybrid"],
    biomerge: ["DDA.PartnerFormPlanner.Category.BioMerge", "Bio-Merge"],
    jogress: ["DDA.PartnerFormPlanner.Category.Jogress", "Jogress"],
    variant: ["DDA.PartnerFormPlanner.Category.Variant", "Variant"],
    dark: ["DDA.PartnerFormPlanner.Category.Dark", "Dark Evolution"],
    special: ["DDA.PartnerFormPlanner.Category.Special", "Special"]
  };

  return keys.map((key) => {
    const [localizationKey, fallback] = labels[key] ?? [
      "",
      key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    ];

    return {
      key,
      label: localizationKey ? localize(localizationKey, fallback) : fallback
    };
  });
}

function hasGraphReference(graph = {}, reference = "") {
  const wanted = String(reference ?? "").trim();

  return Boolean(wanted) && (graph?.nodes ?? []).some((node) => [
    node?.actorUuid,
    node?.uuid,
    node?.formUuid,
    node?.sourceFormUuid
  ].some((value) => String(value ?? "").trim() === wanted));
}

function hasLineReference(line = {}, reference = "") {
  const wanted = String(reference ?? "").trim();
  if (!wanted) return false;

  return Object.values(line?.forms ?? {}).some((slot) => {
    const forms = [
      ...(Array.isArray(slot) ? slot : []),
      ...(Array.isArray(slot?.forms) ? slot.forms : []),
      ...(slot?.uuid || slot?.actorUuid ? [slot] : [])
    ];

    return forms.some((form) => [
      form?.uuid,
      form?.actorUuid,
      form?.formUuid,
      form?.sourceFormUuid
    ].some((value) => String(value ?? "").trim() === wanted));
  });
}

function isReferenceUnlockedForTamer(tamerActor = null, reference = "") {
  const unlockedForms = Array.isArray(tamerActor?.system?.partner?.unlockedForms)
    ? tamerActor.system.partner.unlockedForms
    : [];

  if (!unlockedForms.length) return true;

  const wanted = String(reference ?? "").trim();

  return unlockedForms.some((entry) => {
    if (typeof entry === "string") return entry === wanted;

    return [
      entry?.uuid,
      entry?.actorUuid,
      entry?.formUuid,
      entry?.sourceFormUuid
    ].some((value) => String(value ?? "").trim() === wanted) &&
      entry?.unlocked !== false;
  });
}

function isSnapshotReleased(partnerActor, tamerActor, snapshot = {}) {
  const reference = String(snapshot?.sourceFormUuid ?? "").trim();

  return hasGraphReference(
    partnerActor?.system?.evolutionGraph,
    reference
  ) && hasLineReference(
    partnerActor?.system?.evolutionLine,
    reference
  ) && isReferenceUnlockedForTamer(
    tamerActor,
    reference
  );
}


function getPlannerRecordReference(record = {}) {
  return String(
    record?.sourceFormUuid || record?.formUuid || record?.actorUuid ||
    record?.uuid || record?.databaseId || record?.system?.databaseId ||
    record?.sourceId || record?.system?.sourceId || ""
  ).trim();
}

function collectPlannerSourceForms(partnerActor = null) {
  if (!partnerActor) return [];

  const snapshots = Object.values(
    partnerActor.system?.evolution?.formSnapshots ?? {}
  ).filter((entry) => entry && typeof entry === "object");
  const nodes = Array.isArray(partnerActor.system?.evolutionGraph?.nodes)
    ? partnerActor.system.evolutionGraph.nodes
    : [];
  const currentReference = String(
    partnerActor.system?.evolution?.currentFormUuid ||
    partnerActor.system?.evolution?.sourceFormUuid ||
    partnerActor.uuid
  ).trim();
  const records = [
    ...snapshots,
    ...nodes,
    {
      actorUuid: partnerActor.uuid,
      uuid: partnerActor.uuid,
      sourceFormUuid: currentReference,
      name: partnerActor.name,
      species: partnerActor.system?.species || partnerActor.name,
      stage: partnerActor.system?.stage || "child",
      sourceId: partnerActor.system?.sourceId || "",
      databaseId: partnerActor.system?.databaseId || "",
      system: partnerActor.system,
      isCurrent: true
    }
  ];
  const byReference = new Map();

  for (const record of records) {
    const reference = getPlannerRecordReference(record);
    if (!reference) continue;
    const stage = String(record?.stage ?? record?.system?.stage ?? "child").trim() || "child";
    const name = String(
      record?.displayName || record?.species || record?.sourceFormName ||
      record?.name || record?.system?.species || "Digimon"
    ).trim();
    const existing = byReference.get(reference);

    byReference.set(reference, {
      ...(existing ?? {}),
      reference,
      name,
      stage,
      stageLabel: getDigimonStageLabel(stage),
      record: { ...(existing?.record ?? {}), ...record },
      isCurrent: Boolean(
        record?.isCurrent || reference === currentReference || reference === partnerActor.uuid
      )
    });
  }

  return Array.from(byReference.values()).sort((left, right) => {
    return DDA_STAGE_ORDER.indexOf(left.stage) - DDA_STAGE_ORDER.indexOf(right.stage) ||
      left.name.localeCompare(right.name, game.i18n?.lang);
  });
}

function evolutionMethodLabel(method = "normal") {
  const keys = {
    normal: "DDA.Evolution.Method.Normal",
    slide: "DDA.Evolution.Method.Slide",
    dark: "DDA.Evolution.Method.Dark"
  };
  const fallbacks = {
    normal: "Normal",
    slide: "Slide Evolution",
    dark: "Dark Evolution"
  };
  return localize(keys[method] ?? keys.normal, fallbacks[method] ?? method);
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
      releaseUnlockedForms: DDAPartnerFormPlanner._onActionReleaseUnlockedForms,
      adjustForm: DDAPartnerFormPlanner._onActionAdjustForm,
      removeForm: DDAPartnerFormPlanner._onActionRemoveForm,
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
    const {
      darkEvolutionMode = false,
      ...applicationOptions
    } = options ?? {};

    super(applicationOptions);
    this.sourceActor = sourceActor ?? null;
    this.formContext = null;
    this.darkEvolutionMode = Boolean(
      darkEvolutionMode && game.user?.isGM
    );
  }

  static async open(sourceActor, options = {}) {
    if (!sourceActor) return null;

    await repairPlannedPartnerFormData(sourceActor);

    const application = new this(sourceActor, options);
    await application.render({ force: true });
    return application;
  }

  static async openDarkEvolution(sourceActor, options = {}) {
    if (!game.user?.isGM) {
      ui.notifications.warn(localize(
        "DDA.PartnerFormPlanner.Dark.GMOnly",
        "Only the GM can plan a Dark Evolution."
      ));
      return null;
    }

    return this.open(sourceActor, {
      ...options,
      darkEvolutionMode: true
    });
  }

  get title() {
    return this.darkEvolutionMode
      ? game.i18n.format(
          "DDA.PartnerFormPlanner.Dark.Title",
          { name: this.sourceActor?.name ?? "Digimon" }
        )
      : localize(
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
    ).filter((snapshot) => {
      if (!snapshot || typeof snapshot !== "object") return false;

      /* Unreleased Dark Evolution plans are GM secrets. */
      if (
        !game.user?.isGM &&
        snapshot?.wizard?.darkEvolution &&
        !isSnapshotReleased(partnerActor, tamerActor, snapshot)
      ) {
        return false;
      }

      return true;
    });

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

    /*
     * O mesmo botão também repara formas já liberadas. Isso permite corrigir
     * retratos, metadados e vínculos sem apagar o planejamento existente.
     */
    const releaseableCount = forms.filter((form) => {
      return game.user?.isGM && form.prepared && form.unlocked;
    }).length;
    const releasedCount = forms.filter((form) => form.released).length;

    this.releaseableCount = releaseableCount;

    return {
      ...context,
      ready: true,
      canEdit,
      isGM: Boolean(game.user?.isGM),
      darkEvolutionMode: this.darkEvolutionMode,
      plannerModeLabel: this.darkEvolutionMode
        ? localize("DDA.PartnerFormPlanner.Dark.ModeLabel", "Dark Evolution")
        : localize("DDA.PartnerFormPlanner.Mode.Standard", "Evolution Plan"),
      tamer: {
        uuid: tamerActor?.uuid ?? "",
        name: tamerActor?.name ?? ""
      },
      partner: (() => {
        const portraitSources = getActorPortraitSources(partnerActor);

        return {
          uuid: partnerActor.uuid,
          name: partnerActor.name,
          img: portraitSources[0],
          imageFallbacks: portraitSources.slice(1).join("|")
        };
      })(),
      forms,
      stages,
      hasForms: forms.length > 0,
      isGM: Boolean(game.user?.isGM),
      releaseableCount,
      releasedCount,
      hasReleaseableForms: releaseableCount > 0
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
    const unlocked = Boolean(unlockedStages[stageKey]);
    const prepared = Boolean(snapshot.wizard?.preparedFutureForm);
    const released = isSnapshotReleased(
      this.formContext?.partnerActor,
      this.formContext?.tamerActor,
      snapshot
    );

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
      unlocked,
      isCurrent,
      prepared,
      released,
      canRelease: Boolean(
        game.user?.isGM &&
        prepared &&
        unlocked &&
        !released
      ),
      categories: getEvolutionCategoryViewData(snapshot),
      plannedEvolutionMethod: String(
        snapshot.wizard?.plannedEvolutionMethod || "normal"
      ),
      plannedEvolutionMethodLabel: evolutionMethodLabel(
        String(snapshot.wizard?.plannedEvolutionMethod || "normal")
      ),
      plannedFromReference: String(
        snapshot.wizard?.plannedFromReference || ""
      ),
      createdByInitialLine: Boolean(snapshot.wizard?.createdByInitialLine),
      canEdit: canEdit && stageKey !== "baby1",
      canRemove: Boolean(
        canEdit &&
        prepared &&
        !isCurrent
      ),
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
    event.stopPropagation();
    await repairPlannedPartnerFormData(this.sourceActor);
    await this.render();
  }

  static async _onActionReleaseUnlockedForms(event) {
    event.preventDefault();

    if (!game.user?.isGM) {
      ui.notifications.warn(
        localize(
          "DDA.PartnerFormPlanner.Release.GMOnly",
          "Only the GM can release planned forms."
        )
      );
      return;
    }

    const count = Math.max(0, number(this.releaseableCount, 0));

    if (!count) {
      ui.notifications.info(
        localize(
          "DDA.PartnerFormPlanner.Release.NoneAvailable",
          "There are no unlocked planned forms waiting for release."
        )
      );
      return;
    }

    const confirmed = await Dialog.confirm({
      title: localize(
        "DDA.PartnerFormPlanner.Release.ConfirmTitle",
        "Release Planned Forms"
      ),
      content: `<p>${game.i18n.format(
        "DDA.PartnerFormPlanner.Release.ConfirmText",
        { count }
      )}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: true
    });

    if (!confirmed) {
      if (target) target.disabled = false;
      return;
    }

    const result = await releaseUnlockedPlannedPartnerForms(
      this.sourceActor
    );

    const released = result?.released?.length ?? 0;
    const repaired = result?.repaired?.length ?? 0;
    const blocked = result?.blocked?.length ?? 0;
    const manualLinks = result?.manualLinks?.length ?? 0;

    if (released || repaired) {
      ui.notifications.info(
        game.i18n.format(
          "DDA.PartnerFormPlanner.Release.Completed",
          { released, repaired }
        )
      );
    } else {
      ui.notifications.info(
        localize(
          "DDA.PartnerFormPlanner.Release.NothingChanged",
          "No planned form required a release update."
        )
      );
    }

    if (blocked) {
      ui.notifications.warn(
        game.i18n.format(
          "DDA.PartnerFormPlanner.Release.BlockedSummary",
          { count: blocked }
        )
      );
    }

    if (manualLinks) {
      ui.notifications.warn(
        game.i18n.format(
          "DDA.PartnerFormPlanner.Release.ManualLinks",
          { count: manualLinks }
        )
      );
    }

    await this.render();
  }

  static async _onActionRemoveForm(event, target) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (target) target.disabled = true;

    if (!this.formContext) {
      if (target) target.disabled = false;
      return;
    }

    const sourceFormUuid = String(
      target?.dataset?.formUuid ?? ""
    ).trim();

    if (!sourceFormUuid) {
      if (target) target.disabled = false;
      return;
    }

    const partnerActor = this.formContext.partnerActor;
    const snapshot = Object.values(
      partnerActor.system?.evolution?.formSnapshots ?? {}
    ).find((entry) => {
      return String(entry?.sourceFormUuid ?? "").trim() === sourceFormUuid;
    });

    const currentReferences = new Set([
      partnerActor.uuid,
      partnerActor.system?.evolution?.currentFormUuid,
      partnerActor.system?.evolution?.sourceFormUuid,
      this.formContext.tamerActor?.system?.partner?.currentFormUuid
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean));

    const canRemove = Boolean(
      snapshot?.wizard?.preparedFutureForm &&
      !currentReferences.has(sourceFormUuid) &&
      (
        game.user?.isGM ||
        partnerActor?.isOwner ||
        this.formContext.tamerActor?.isOwner
      )
    );

    if (!canRemove) {
      ui.notifications.warn(
        localize(
          "DDA.PartnerFormPlanner.Remove.NotAllowed",
          "This form cannot be removed from the Planner."
        )
      );
      if (target) target.disabled = false;
      return;
    }

    const formName = String(
      snapshot?.species ||
      snapshot?.sourceFormName ||
      snapshot?.name ||
      "Digimon"
    ).trim();

    const confirmed = await Dialog.confirm({
      title: localize(
        "DDA.PartnerFormPlanner.Remove.ConfirmTitle",
        "Remove Planned Form"
      ),
      content: `<p>${game.i18n.format(
        "DDA.PartnerFormPlanner.Remove.ConfirmText",
        { form: foundry.utils.escapeHTML(formName) }
      )}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) {
      if (target) target.disabled = false;
      return;
    }

    const result = await removePlannedPartnerForm(
      this.sourceActor,
      sourceFormUuid
    );

    if (!result?.removed) {
      const reasonKey = {
        currentForm: "DDA.PartnerFormPlanner.Remove.CurrentForm",
        permission: "DDA.PartnerFormPlanner.Remove.Permission",
        notPlanned: "DDA.PartnerFormPlanner.Remove.NotPlanned",
        persistenceFailed: "DDA.PartnerFormPlanner.Remove.PersistenceFailed"
      }[result?.reason];

      ui.notifications.warn(
        localize(
          reasonKey || "DDA.PartnerFormPlanner.Remove.Failed",
          "The planned form could not be removed."
        )
      );
      if (target) target.disabled = false;
      return;
    }

    ui.notifications.info(
      game.i18n.format(
        "DDA.PartnerFormPlanner.Remove.Completed",
        { form: formName }
      )
    );

    /* The removal action already writes the complete graph/line cleanup.
       Do not run the repair pass here, because a stale client-side graph must
       never recreate the form that was just deleted. */
    await this.render({ force: true });
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

    await this._openFormPicker(stageKey, {
      forcedMethod: this.darkEvolutionMode ? "dark" : ""
    });
  }

  async _openFormPicker(stageKey, { forcedMethod = "" } = {}) {
    const actors = (await DDADigimonDatabase.getAll({
      includeVirtualSpecialForms: true
    }))
      .filter((actor) => actor?.type === "digimon")
      .filter((actor) => String(actor.system?.stage ?? "") === stageKey)
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
      availableActors,
      { forcedMethod }
    );

    await picker.render({ force: true });
  }

  async _openFutureFormWizard(
    formTemplateActor,
    {
      portraitImg = "",
      plannedEvolutionMethod = "normal",
      plannedFromReference = ""
    } = {}
  ) {
    if (!formTemplateActor || !this.formContext) return null;

    const { DDADigimonWizard } = await import(
      "../wizard/dda-digimon-wizard.js"
    );

    return DDADigimonWizard.openFutureFormWizard(
      this.formContext.tamerActor,
      formTemplateActor,
      {
        returnApplication: this,
        portraitImg: String(portraitImg ?? "").trim(),
        plannedEvolutionMethod: String(plannedEvolutionMethod || "normal"),
        plannedFromReference: String(plannedFromReference || ""),
        plannedByGM: Boolean(game.user?.isGM),
        darkEvolution: plannedEvolutionMethod === "dark"
      }
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
    const {
      forcedMethod = "",
      ...applicationOptions
    } = options ?? {};

    super(applicationOptions);
    this.planner = planner;
    this.stageKey = String(stageKey ?? "").trim();
    this.actors = Array.isArray(actors) ? actors : [];
    this.selectedReference = "";
    this.forcedMethod = ["dark"].includes(String(forcedMethod ?? ""))
      ? String(forcedMethod)
      : "";
    this.selectedMethod = this.forcedMethod || "normal";
    this.selectedFromReference = "";
    this.actorByReference = new Map(
      this.actors.map((actor) => [getTemplateReference(actor), actor])
    );
    this.sourceForms = [];
    this.sourceByReference = new Map();
  }

  get title() {
    if (this.forcedMethod === "dark") {
      return game.i18n.format(
        "DDA.PartnerFormPlanner.Dark.PickerTitle",
        { stage: getDigimonStageLabel(this.stageKey) }
      );
    }

    return game.i18n.format(
      "DDA.PartnerFormPlanner.Picker.Title",
      { stage: getDigimonStageLabel(this.stageKey) }
    );
  }

  _getAllowedSourceForms(method = this.selectedMethod) {
    const targetIndex = DDA_STAGE_ORDER.indexOf(this.stageKey);

    return this.sourceForms.filter((entry) => {
      const sourceIndex = DDA_STAGE_ORDER.indexOf(entry.stage);

      if (method === "slide") {
        return entry.stage === this.stageKey;
      }

      if (method === "dark") {
        return sourceIndex >= 0 && sourceIndex <= targetIndex;
      }

      return sourceIndex >= 0 && sourceIndex < targetIndex;
    });
  }

  _ensurePlanningSource() {
    if (this.forcedMethod) this.selectedMethod = this.forcedMethod;

    if (
      this.selectedMethod === "slide" &&
      !this._getAllowedSourceForms("slide").length
    ) {
      this.selectedMethod = "normal";
    }

    const allowed = this._getAllowedSourceForms(this.selectedMethod);
    if (allowed.some((entry) => entry.reference === this.selectedFromReference)) {
      return;
    }

    const current = allowed.find((entry) => entry.isCurrent);
    if (current) {
      this.selectedFromReference = current.reference;
      return;
    }

    const sorted = [...allowed].sort((left, right) => {
      return DDA_STAGE_ORDER.indexOf(right.stage) - DDA_STAGE_ORDER.indexOf(left.stage) ||
        left.name.localeCompare(right.name, game.i18n?.lang);
    });

    this.selectedFromReference = sorted[0]?.reference ?? "";
  }

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const partnerActor = this.planner?.formContext?.partnerActor ?? null;

    this.sourceForms = collectPlannerSourceForms(partnerActor);
    this.sourceByReference = new Map(
      this.sourceForms.map((entry) => [entry.reference, entry])
    );
    this._ensurePlanningSource();

    const selectedParent = this.sourceByReference.get(
      this.selectedFromReference
    ) ?? null;

    const entries = await Promise.all(this.actors.map(async (actor) => {
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
      const categories = getEvolutionCategoryViewData(system);
      const compatibility = selectedParent
        ? await getPlannedFormCompatibility({
            candidate: actor,
            parent: selectedParent.record
          })
        : await getBestPlannedFormCompatibility({
            candidate: actor,
            partnerActor,
            stageKey: this.stageKey
          });

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
        categories,
        categoryText: categories.map((category) => category.label).join(", "),
        compatibilityScore: compatibility.score,
        compatibilityTier: compatibility.tier,
        compatibilityLabel: compatibility.label,
        compatibilityParent: selectedParent?.name || compatibility.parentName,
        compatibilityReason: compatibility.reasons.join(" • "),
        compatibilityTitle: [
          `${compatibility.score}% — ${compatibility.label}`,
          selectedParent?.name || compatibility.parentName
            ? `${localize("DDA.PartnerFormPlanner.Picker.CompatibilityFrom", "A partir de")}: ${selectedParent?.name || compatibility.parentName}`
            : "",
          ...compatibility.reasons
        ].filter(Boolean).join(" • "),
        searchText: normalizeSearchText([
          name,
          originalName,
          type,
          attribute.label,
          compatibility.score,
          compatibility.label,
          selectedParent?.name,
          compatibility.parentName,
          ...compatibility.reasons,
          ...categories.map((category) => category.label),
          ...(Array.isArray(names.aliases) ? names.aliases : [])
        ].join(" ")),
        selected: reference === this.selectedReference
      };
    }));

    this.compatibilityByReference = new Map(
      entries.map((entry) => [entry.reference, entry])
    );

    const attributes = Array.from(
      new Map(
        entries.map((entry) => [entry.attributeKey, entry.attributeLabel])
      ).entries()
    )
      .map(([key, label]) => ({ key, label }))
      .sort((left, right) => {
        return left.label.localeCompare(right.label, game.i18n?.lang);
      });

    const allowedSourceReferences = new Set(
      this._getAllowedSourceForms(this.selectedMethod)
        .map((entry) => entry.reference)
    );

    const sourceForms = this.sourceForms.map((entry) => ({
      ...entry,
      allowed: allowedSourceReferences.has(entry.reference),
      selected: entry.reference === this.selectedFromReference
    }));

    const canPlanSlide = this._getAllowedSourceForms("slide").length > 0;
    const methodOptions = this.forcedMethod
      ? [{
          key: this.forcedMethod,
          label: evolutionMethodLabel(this.forcedMethod),
          selected: true,
          disabled: false
        }]
      : [
          {
            key: "normal",
            label: evolutionMethodLabel("normal"),
            selected: this.selectedMethod === "normal",
            disabled: false
          },
          {
            key: "slide",
            label: evolutionMethodLabel("slide"),
            selected: this.selectedMethod === "slide",
            disabled: !canPlanSlide
          }
        ];

    return {
      ...context,
      stageLabel: getDigimonStageLabel(this.stageKey),
      entries,
      attributes,
      count: entries.length,
      methodOptions,
      selectedMethod: this.selectedMethod,
      selectedMethodLabel: evolutionMethodLabel(this.selectedMethod),
      sourceForms,
      hasSourceForms: sourceForms.some((entry) => entry.allowed),
      selectedFromReference: this.selectedFromReference,
      selectedFromName: selectedParent?.name ?? "",
      canPlanSlide,
      forcedMethod: this.forcedMethod,
      darkEvolutionMode: this.forcedMethod === "dark"
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
    const methodSelect = this.element?.querySelector?.(
      "[data-form-picker-method]"
    );
    const sourceSelect = this.element?.querySelector?.(
      "[data-form-picker-source]"
    );

    searchInput?.addEventListener("input", () => this._applyFilters());
    attributeSelect?.addEventListener("change", () => this._applyFilters());

    methodSelect?.addEventListener("change", async (event) => {
      this.selectedMethod = String(event.currentTarget?.value || "normal");
      this.selectedFromReference = "";
      await this.render({ force: true });
    });

    sourceSelect?.addEventListener("change", async (event) => {
      this.selectedFromReference = String(event.currentTarget?.value || "");
      await this.render({ force: true });
    });

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
      const categories = getEvolutionCategoryViewData(system);
      const compatibility = this.compatibilityByReference?.get(reference) ?? {};
      const image = preview.querySelector("[data-form-picker-preview-image]");

      this.selectedPortraitPath = portraitSources[0] ?? "";

      if (image) {
        image.dataset.fallbackIndex = "0";
        image.dataset.fallbackSrcs = portraitSources.slice(1).join("|");
        image.dataset.resolvedSrc = portraitSources[0] ?? "";
        image.setAttribute("src", portraitSources[0]);
        image.alt = selectedName;
      }

      const compatibilityText = compatibility.compatibilityScore
        ? `${compatibility.compatibilityScore}% — ${compatibility.compatibilityLabel}`
        : "";

      const values = {
        "[data-form-picker-preview-name]": selectedName,
        "[data-form-picker-preview-original]": originalName && originalName !== selectedName ? originalName : "",
        "[data-form-picker-preview-stage]": getDigimonStageLabel(this.stageKey),
        "[data-form-picker-preview-attribute]": attribute.label,
        "[data-form-picker-preview-type]": type || localize("DDA.Label.None", "—"),
        "[data-form-picker-preview-categories]": categories
          .map((category) => category.label)
          .join(", "),
        "[data-form-picker-preview-compatibility]": compatibilityText,
        "[data-form-picker-preview-compatibility-from]": compatibility.compatibilityParent || "",
        "[data-form-picker-preview-compatibility-reason]": compatibility.compatibilityReason || ""
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

    const previewImage = this.element?.querySelector?.(
      "[data-form-picker-preview-image]"
    );

    const portraitImg = String(
      previewImage?.dataset?.resolvedSrc ||
      previewImage?.getAttribute?.("src") ||
      this.selectedPortraitPath ||
      ""
    ).trim();

    const plannedEvolutionMethod = String(
      this.forcedMethod || this.selectedMethod || "normal"
    ).trim();
    const plannedFromReference = String(
      this.selectedFromReference || ""
    ).trim();

    if (
      ["slide", "dark"].includes(plannedEvolutionMethod) &&
      !plannedFromReference
    ) {
      ui.notifications.warn(localize(
        "DDA.PartnerFormPlanner.Picker.SourceRequired",
        "Select the form from which this evolution begins."
      ));
      return;
    }

    await this.close();
    await this.planner?._openFutureFormWizard(actor, {
      portraitImg,
      plannedEvolutionMethod,
      plannedFromReference
    });
  }

  static async _onActionCancelSelection(event) {
    event.preventDefault();
    await this.close();
  }
}
