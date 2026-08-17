import {
  adjustCampaignExperience,
  clearCampaignMilestoneHistory,
  createPendingCampaignMilestone,
  createXpCampaignMilestone,
  getCampaignMilestoneSummary,
  getCampaignDefaultRangePolicy,
  getDigimonBonusDpSummary,
  getTamerProgressSummary,
  releasePendingCampaignMilestones,
  setCampaignDefaultRangePolicy,
  setCampaignProgressionMethod,
  synchronizeCampaignDefaultRanges
} from "../rules/tamer-progression.js";
import { DDAPartnerFormPlanner } from "./dda-partner-form-planner.js";
import { DDAProgressionDiagnostics } from "./dda-progression-diagnostics.js";
import {
  resolveDigimonPortraitSources,
  shouldTreatStoredPortraitAsManual
} from "../helpers/digimon-portrait-resolver.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DDAGMPartnerProgressPanelBase = HandlebarsApplicationMixin(ApplicationV2);

const DDA_PARTNER_STAGE_ORDER = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate",
  "ultimatePlus"
];

function localize(key, fallback = key) {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function formatI18n(key, data = {}, fallback = "") {
  const value = game?.i18n?.format?.(key, data);
  return value && value !== key ? value : (fallback || key);
}

function stageLabel(stageKey = "") {
  const configLabel = CONFIG.DDA?.stages?.[stageKey]?.label;

  if (configLabel) {
    return localize(configLabel, stageKey);
  }

  const fallbackKey = {
    baby1: "DDA.Stage.Baby1",
    baby2: "DDA.Stage.Baby2",
    child: "DDA.Stage.Child",
    adult: "DDA.Stage.Adult",
    perfect: "DDA.Stage.Perfect",
    ultimate: "DDA.Stage.Ultimate",
    ultimatePlus: "DDA.Stage.UltimatePlus"
  }[stageKey];

  return fallbackKey
    ? localize(fallbackKey, stageKey)
    : stageKey;
}

function getDarkEvolutionEnabled() {
  try {
    return Boolean(
      game.settings.get(DDA_SYSTEM_ID, "enableDarkEvolution")
    );
  } catch (_error) {
    return false;
  }
}

function getProgressPortraitSources(actor = null) {
  if (!actor) return ["icons/svg/mystery-man.svg"];

  const storedPortrait = String(
    actor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait || ""
  );

  return resolveDigimonPortraitSources(actor, {
    manualPortrait: storedPortrait,
    manualPortraitSelected: shouldTreatStoredPortraitAsManual(
      actor,
      storedPortrait
    ),
    allowVideo: false
  });
}

function attachImageFallbacks(root = null) {
  if (!(root instanceof HTMLElement)) return;

  for (const image of root.querySelectorAll("img[data-fallback-srcs]")) {
    if (image.dataset.ddaFallbackBound === "true") continue;
    image.dataset.ddaFallbackBound = "true";

    image.addEventListener("error", () => {
      const fallbacks = String(image.dataset.fallbackSrcs ?? "")
        .split("|")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const index = Math.max(0, Number(image.dataset.fallbackIndex ?? 0));

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

function formatDateTime(value = "") {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(game.i18n?.lang ?? undefined, {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  } catch (_error) {
    return date.toLocaleString();
  }
}

async function resolveActor(uuid = "") {
  const cleanUuid = String(uuid ?? "").trim();

  if (!cleanUuid) {
    return null;
  }

  try {
    const document = await fromUuid(cleanUuid);

    return document?.documentName === "Actor"
      ? document
      : null;
  } catch (error) {
    console.warn(
      "DDA | Could not resolve Actor UUID in GM partner progress panel:",
      cleanUuid,
      error
    );

    return null;
  }
}

function getUnlockedStages(tamer) {
  const current = foundry.utils.deepClone(
    tamer?.system?.partner?.unlockedEvolutionStages ?? {}
  );

  for (const stageKey of DDA_PARTNER_STAGE_ORDER) {
    if (current[stageKey] === undefined) {
      current[stageKey] = ["baby1", "baby2", "child"].includes(stageKey);
    }
  }

  return current;
}

function normalizeCrestKey(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/^Crest_/i, "")
    .replace(/^crest_/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function getTamerCrestKey(tamer) {
  return normalizeCrestKey(
    tamer?.system?.partner?.digiviceSkin?.crestKey ||
    tamer?.system?.compatibility?.hiddenCrest?.key ||
    tamer?.system?.compatibility?.crest?.key ||
    ""
  );
}

function getGroupMembers(groupActor) {
  if (!groupActor || groupActor.type !== "group") {
    return [];
  }

  const members = Array.isArray(groupActor.system?.party?.members)
    ? groupActor.system.party.members
    : [];

  return members
    .map((entry) => String(entry?.uuid ?? "").trim())
    .filter(Boolean);
}

async function getCurrentFormActor(tamer, partner) {
  return partner ??
    await resolveActor(tamer?.system?.partner?.currentFormUuid || "") ??
    null;
}

function milestoneScopeLabel(scope = "party") {
  return scope === "individual"
    ? localize("DDA.Progression.Scope.Individual", "Individual")
    : localize("DDA.Progression.Scope.Party", "Team");
}

function milestoneStatusLabel(status = "") {
  const key = {
    pendingRest: "DDA.Progression.Status.PendingRest",
    released: "DDA.Progression.Status.Released",
    partiallyReleased: "DDA.Progression.Status.PartiallyReleased"
  }[status];

  return key
    ? localize(key, status)
    : status;
}

function milestoneMethodLabel(method = "narrative") {
  const key = {
    narrative: "DDA.Progression.Method.Narrative",
    xp: "DDA.Progression.Method.XP",
    gm: "DDA.Progression.Method.GM"
  }[method];

  return key
    ? localize(key, method)
    : method;
}

function createMilestoneTarget(tamer, partner = null) {
  return {
    tamerUuid: tamer.uuid,
    tamerName: tamer.name,
    partnerUuid: partner?.uuid ?? tamer.system?.partner?.uuid ?? "",
    partnerName: partner?.name ?? tamer.system?.partner?.name ?? ""
  };
}

function getMilestoneTargetNames(record = {}) {
  const names = Array.isArray(record.targets)
    ? record.targets
      .map((target) => target?.tamerName || target?.tamerUuid || "")
      .filter(Boolean)
    : [];

  return names.join(", ");
}

export class DDAGMPartnerProgressPanel extends DDAGMPartnerProgressPanelBase {
  static DEFAULT_OPTIONS = {
    id: "dda-gm-partner-progress-panel",
    classes: ["dda", "dda-gm-partner-progress-panel"],
    position: {
      width: 1120,
      height: 780
    },
    window: {
      icon: "fas fa-flag-checkered",
      resizable: true
    },
    actions: {
      refresh:
        DDAGMPartnerProgressPanel
          ._onActionRefresh,

      openProgressionDiagnostics:
        DDAGMPartnerProgressPanel
          ._onActionOpenProgressionDiagnostics,

      clearMilestoneHistory:
        DDAGMPartnerProgressPanel
          ._onActionClearMilestoneHistory,

      createPartyMilestone:
        DDAGMPartnerProgressPanel
          ._onActionCreatePartyMilestone,

      createIndividualMilestone:
        DDAGMPartnerProgressPanel
          ._onActionCreateIndividualMilestone,

      releasePendingMilestones:
        DDAGMPartnerProgressPanel
          ._onActionReleasePendingMilestones,

      setProgressionNarrative:
        DDAGMPartnerProgressPanel
          ._onActionSetProgressionNarrative,

      setProgressionXp:
        DDAGMPartnerProgressPanel
          ._onActionSetProgressionXp,

      addXp1:
        DDAGMPartnerProgressPanel
          ._onActionAddXp1,

      addXp2:
        DDAGMPartnerProgressPanel
          ._onActionAddXp2,

      subtractXp1:
        DDAGMPartnerProgressPanel
          ._onActionSubtractXp1,

      createXpMilestone:
        DDAGMPartnerProgressPanel
          ._onActionCreateXpMilestone,

      syncDefaultRanges:
        DDAGMPartnerProgressPanel
          ._onActionSyncDefaultRanges,

      openTamer:
        DDAGMPartnerProgressPanel
          ._onActionOpenActor,

      openPartner:
        DDAGMPartnerProgressPanel
          ._onActionOpenActor,

      toggleStage:
        DDAGMPartnerProgressPanel
          ._onActionToggleStage,

      toggleCrestDigivice:
        DDAGMPartnerProgressPanel
          ._onActionToggleCrestDigivice,

      planDarkEvolution:
        DDAGMPartnerProgressPanel
          ._onActionPlanDarkEvolution
    }
  };

  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/gm-partner-progress-panel.html"
    }
  };

  constructor(options = {}) {
    super(options);

    this.targetMode = options.targetMode ?? "all";
    this.selectedGroupUuid = options.selectedGroupUuid ?? "all";
    this.selectedTamerUuid = options.selectedTamerUuid ?? "all";
  }

  get title() {
    return localize(
      "DDA.GMPartnerProgress.Title",
      "Progress Panel"
    );
  }

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const isGM = Boolean(game.user?.isGM);
    const darkEvolutionEnabled = getDarkEvolutionEnabled();

    if (!isGM) {
      return {
        ...context,
        isGM: false,
        groups: [],
        allTamers: [],
        tamers: [],
        campaign: null,
        selectedGroupUuid: this.selectedGroupUuid,
        selectedTamerUuid: this.selectedTamerUuid,
        targetMode: this.targetMode,
        hasTamers: false,
        darkEvolutionEnabled: false
      };
    }

    const groups = game.actors
      .filter((actor) => actor.type === "group")
      .map((actor) => ({
        uuid: actor.uuid,
        name: actor.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    const allTamerActors = this._getLinkedTamerActors();

    const allTamers = allTamerActors.map((actor) => ({
      uuid: actor.uuid,
      name: actor.name
    }));

    if (
      this.selectedTamerUuid === "all" &&
      allTamers.length
    ) {
      this.selectedTamerUuid = allTamers[0].uuid;
    }

    const selectedTamerExists = allTamers.some(
      (entry) => entry.uuid === this.selectedTamerUuid
    );

    if (!selectedTamerExists && allTamers.length) {
      this.selectedTamerUuid = allTamers[0].uuid;
    }

    const visibleTamerActors = await this._getFilteredTamerActors(
      allTamerActors
    );

    const tamers = [];

    for (const tamer of visibleTamerActors) {
      const partner = await resolveActor(
        tamer.system?.partner?.uuid ?? ""
      );

      const currentForm = await getCurrentFormActor(tamer, partner);
      const unlockedStages = getUnlockedStages(tamer);
      const crestKey = getTamerCrestKey(tamer);

      const questionnaireEnabled = Boolean(
        game.settings.get(
          DDA_SYSTEM_ID,
          "enableHiddenCompatibilityQuestionnaire"
        )
      );

      const digiviceRevealed = questionnaireEnabled &&
        Boolean(tamer.system?.partner?.digiviceSkin?.revealed);

      const tamerProgress = getTamerProgressSummary(tamer);
      const bonusDp = getDigimonBonusDpSummary(tamer, partner);
      const partnerPortraitSources = getProgressPortraitSources(partner);
      const currentFormPortraitSources = getProgressPortraitSources(
        currentForm ?? partner
      );

      tamers.push({
        uuid: tamer.uuid,
        name: tamer.name,
        img: tamer.img,

        partnerUuid: partner?.uuid ??
          tamer.system?.partner?.uuid ??
          "",

        partnerName: partner?.name ??
          tamer.system?.partner?.name ??
          "",

        partnerImg: partnerPortraitSources[0] ??
          "icons/svg/mystery-man.svg",
        partnerImageFallbacks: partnerPortraitSources.slice(1).join("|"),

        currentFormUuid: currentForm?.uuid ??
          tamer.system?.partner?.currentFormUuid ??
          "",

        currentFormName: currentForm?.name ??
          tamer.system?.partner?.currentFormName ??
          partner?.name ??
          "",

        currentFormImg: currentFormPortraitSources[0] ??
          partnerPortraitSources[0] ??
          "icons/svg/mystery-man.svg",
        currentFormImageFallbacks:
          currentFormPortraitSources.slice(1).join("|"),

        currentStageLabel: stageLabel(
          currentForm?.system?.stage ??
          partner?.system?.stage ??
          ""
        ),

        crestKey,
        hasCrest: Boolean(crestKey),
        questionnaireEnabled,
        digiviceRevealed,
        darkEvolutionEnabled,

        milestonesCompleted: tamerProgress.milestonesCompleted,
        attributeCap: tamerProgress.attributeCap,
        growthPointsAvailable: tamerProgress.growthPointsAvailable,
        pendingGrowthPackageCount: tamerProgress.pendingGrowthPackages.length,

        defaultRange: Number(tamer.system?.evolution?.defaultRange?.value ?? 2),
        defaultRangeTemplate: String(tamer.system?.evolution?.defaultRange?.template ?? "limited"),
        defaultStageLabel: stageLabel(partner?.system?.evolution?.defaultStage ?? "child"),
        defaultFormName: String(
          partner?.system?.evolution?.defaultFormName ??
          partner?.system?.evolution?.currentFormName ??
          partner?.name ??
          ""
        ),

        bonusDpTotal: bonusDp.total,
        bonusDpMilestoneGranted: bonusDp.milestoneGranted,
        bonusDpMilestoneRemaining: bonusDp.milestoneRemaining,

        stages: DDA_PARTNER_STAGE_ORDER.map((stageKey) => ({
          key: stageKey,
          label: stageLabel(stageKey),
          unlocked: Boolean(unlockedStages[stageKey])
        }))
      });
    }

    const campaign = this._getCampaignContext(
      getCampaignMilestoneSummary(),
      getCampaignDefaultRangePolicy()
    );

    return {
      ...context,
      isGM: true,
      groups,
      allTamers,
      tamers,
      campaign,
      targetMode: this.targetMode,
      selectedGroupUuid: this.selectedGroupUuid,
      selectedTamerUuid: this.selectedTamerUuid,
      hasTamers: tamers.length > 0,
      darkEvolutionEnabled,
      selectedTargetCount: visibleTamerActors.length,
      selectedTargetLabel: this._getSelectedTargetLabel(
        visibleTamerActors,
        groups
      )
    };
  }

  _getLinkedTamerActors() {
    return game.actors
      .filter((actor) => actor.type === "character")
      .filter((actor) => Boolean(actor.system?.partner?.uuid))
      .sort((a, b) => {
        return a.name.localeCompare(
          b.name,
          game.i18n?.lang ?? undefined,
          { sensitivity: "base" }
        );
      });
  }

  async _getFilteredTamerActors(
    allTamerActors = this._getLinkedTamerActors()
  ) {
    if (this.targetMode === "individual") {
      return allTamerActors.filter(
        (actor) => actor.uuid === this.selectedTamerUuid
      );
    }

    if (this.targetMode !== "group") {
      return allTamerActors;
    }

    if (this.selectedGroupUuid === "all") {
      return allTamerActors;
    }

    const selectedGroup = await resolveActor(this.selectedGroupUuid);
    const memberUuids = new Set(getGroupMembers(selectedGroup));

    return allTamerActors.filter(
      (actor) => memberUuids.has(actor.uuid)
    );
  }

  _getCampaignContext(summary, defaultRangePolicy = { template: "limited", manualValue: 2 }) {
    const history = summary.history.map((record) => ({
      ...record,
      scopeLabel: milestoneScopeLabel(record.scope),
      statusLabel: milestoneStatusLabel(record.status),
      methodLabel: milestoneMethodLabel(record.method),
      targetNames: getMilestoneTargetNames(record),
      grantedAtLabel: formatDateTime(record.grantedAt),
      releasedAtLabel: formatDateTime(record.releasedAt)
    }));

    const experienceValue = Number(summary.experience?.value ?? 0);
    const experienceMax = Math.max(1, Number(summary.experience?.max ?? 7));

    return {
      method: summary.method,
      methodLabel: milestoneMethodLabel(summary.method),
      narrativeMethod: summary.method !== "xp",
      xpMethod: summary.method === "xp",
      experience: {
        ...summary.experience,
        value: experienceValue,
        max: experienceMax,
        ready: experienceValue >= experienceMax,
        remaining: Math.max(0, experienceMax - experienceValue)
      },
      pendingCount: summary.pendingRecords.length,
      releasedPartyCount: summary.releasedPartyCount,
      releasedIndividualCount: summary.releasedIndividualCount,
      defaultRange: {
        template: defaultRangePolicy.template,
        manualValue: defaultRangePolicy.manualValue,
        defaultStagePolicy: defaultRangePolicy.defaultStagePolicy ?? "range",
        limited: defaultRangePolicy.template === "limited",
        complete: defaultRangePolicy.template === "complete",
        manual: defaultRangePolicy.template === "manual",
        defaultStageRange: (defaultRangePolicy.defaultStagePolicy ?? "range") !== "rookie",
        defaultStageRookie: defaultRangePolicy.defaultStagePolicy === "rookie"
      },
      history
    };
  }

  _getSelectedTargetLabel(actors, groups = []) {
    if (this.targetMode === "individual") {
      return actors[0]?.name ??
        localize("DDA.GMPartnerProgress.NoTamers", "No Tamers");
    }

    if (
      this.targetMode === "group" &&
      this.selectedGroupUuid !== "all"
    ) {
      return groups.find(
        (group) => group.uuid === this.selectedGroupUuid
      )?.name ?? localize(
        "DDA.GMPartnerProgress.TargetGroup",
        "Group"
      );
    }

    return localize(
      "DDA.GMPartnerProgress.TargetAll",
      "All linked Tamers"
    );
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.element;
    if (!root) return;

    attachImageFallbacks(root);

    root.querySelector(
      "[data-progress-control='target-mode']"
    )?.addEventListener(
      "change",
      this._onTargetModeChange.bind(this)
    );

    root.querySelector(
      "[data-progress-control='group']"
    )?.addEventListener(
      "change",
      this._onGroupChange.bind(this)
    );

    root.querySelector(
      "[data-progress-control='tamer']"
    )?.addEventListener(
      "change",
      this._onTamerChange.bind(this)
    );

    root.querySelector(
      "[data-progress-control='default-range-template']"
    )?.addEventListener(
      "change",
      this._onDefaultRangePolicyChange.bind(this)
    );

    root.querySelector(
      "[data-progress-control='default-range-manual']"
    )?.addEventListener(
      "change",
      this._onDefaultRangePolicyChange.bind(this)
    );

    root.querySelector(
      "[data-progress-control='default-stage-policy']"
    )?.addEventListener(
      "change",
      this._onDefaultRangePolicyChange.bind(this)
    );
  }

  async _onTargetModeChange(event) {
    this.targetMode = event.currentTarget?.value ?? "all";
    await this.render();
  }

  async _onGroupChange(event) {
    this.selectedGroupUuid = event.currentTarget?.value ?? "all";
    this.targetMode = "group";
    await this.render();
  }

  async _onTamerChange(event) {
    this.selectedTamerUuid = event.currentTarget?.value ?? "all";
    this.targetMode = "individual";
    await this.render();
  }

  async _onDefaultRangePolicyChange() {
    if (!game.user?.isGM) return;

    const root = this.element;
    const template = String(
      root?.querySelector("[data-progress-control='default-range-template']")?.value ?? "limited"
    );
    const manualValue = Number(
      root?.querySelector("[data-progress-control='default-range-manual']")?.value ?? 2
    );
    const defaultStagePolicy = String(
      root?.querySelector("[data-progress-control='default-stage-policy']")?.value ?? "range"
    );

    try {
      const result = await setCampaignDefaultRangePolicy(template, manualValue, defaultStagePolicy);
      ui.notifications.info(formatI18n(
        "DDA.Progression.DefaultRange.PolicyUpdated",
        { count: result.updated },
        `Default Range policy updated for ${result.updated} Tamer(s).`
      ));
      await this.render();
    } catch (error) {
      console.error("DDA | Could not update Default Range policy.", error);
      ui.notifications.error(error?.message ?? localize("DDA.Progression.DefaultRange.PolicyError"));
    }
  }

  static async _onActionRefresh(
    event,
    target
  ) {
    return this._onRefresh(
      event,
      target
    );
  }

  static async _onActionOpenProgressionDiagnostics(event) {
    event.preventDefault();
    const app = new DDAProgressionDiagnostics();
    await app.render(true);
  }

  static async _onActionClearMilestoneHistory(
    event,
    target
  ) {
    return this._onClearMilestoneHistory(
      event,
      target
    );
  }

  static async _onActionCreatePartyMilestone(
    event,
    target
  ) {
    return this._onCreatePartyMilestone(event, target);
  }

  static async _onActionCreateIndividualMilestone(event, target) {
    return this._onCreateIndividualMilestone(event, target);
  }

  static async _onActionReleasePendingMilestones(event, target) {
    return this._onReleasePendingMilestones(event, target);
  }

  static async _onActionSetProgressionNarrative(event, target) {
    return this._onSetProgressionMethod(event, "narrative");
  }

  static async _onActionSetProgressionXp(event, target) {
    return this._onSetProgressionMethod(event, "xp");
  }

  static async _onActionAddXp1(event, target) {
    return this._onAdjustXp(event, 1);
  }

  static async _onActionAddXp2(event, target) {
    return this._onAdjustXp(event, 2);
  }

  static async _onActionSubtractXp1(event, target) {
    return this._onAdjustXp(event, -1);
  }

  static async _onActionCreateXpMilestone(event, target) {
    return this._onCreateXpMilestone(event, target);
  }

  static async _onActionSyncDefaultRanges(event) {
    event.preventDefault();
    try {
      const result = await synchronizeCampaignDefaultRanges();
      ui.notifications.info(formatI18n(
        "DDA.Progression.DefaultRange.PolicyUpdated",
        { count: result.updated },
        `Default Range policy synchronized for ${result.updated} Tamer(s).`
      ));
      await this.render();
    } catch (error) {
      console.error("DDA | Could not synchronize Default Range values.", error);
      ui.notifications.error(error?.message ?? localize("DDA.Progression.DefaultRange.PolicyError"));
    }
  }

  static async _onActionOpenActor(event, target) {
    return this._onOpenActor(event, target);
  }

  static async _onActionToggleStage(event, target) {
    return this._onToggleStage(event, target);
  }

  static async _onActionToggleCrestDigivice(event, target) {
    return this._onToggleCrestDigivice(event, target);
  }

  static async _onActionPlanDarkEvolution(event, target) {
    return this._onPlanDarkEvolution(event, target);
  }

  async _onRefresh(event) {
    event.preventDefault();
    await this.render();
  }

  async _onClearMilestoneHistory(event) {
    event.preventDefault();

    const summary =
      getCampaignMilestoneSummary();

    const recordCount =
      summary.history.length;

    if (!recordCount) {
      ui.notifications.warn(localize(
        "DDA.Progression.Warning.NoHistoryToClear",
        "There is no Milestone history to clear."
      ));

      return;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: localize(
          "DDA.Progression.Dialog.ClearHistoryTitle",
          "Clear Milestone History"
        )
      },

      content: `<p>${formatI18n(
        "DDA.Progression.Dialog.ClearHistoryContent",
        {
          count: recordCount
        },
        `Clear ${recordCount} Milestone record(s)? Already applied benefits will not be reverted, but pending records will also be removed.`
      )}</p>`,

      yes: { default: false },
      no: { default: true },
      rejectClose: false,
      modal: true
    });

    if (!confirmed) return;

    try {
      const result =
        await clearCampaignMilestoneHistory();

      ui.notifications.info(formatI18n(
        "DDA.Progression.Info.HistoryCleared",
        {
          count: result.clearedRecords
        },
        `${result.clearedRecords} Milestone record(s) cleared.`
      ));

      await this.render();
    } catch (error) {
      console.error(
        "DDA | Could not clear Milestone history.",
        error
      );

      ui.notifications.error(
        error?.message ??
        localize(
          "DDA.Progression.Warning.CouldNotClearHistory",
          "Could not clear Milestone history."
        )
      );
    }
  }

  _getMilestoneComposerData() {
    const root = this.element;

    return {
      note: String(
        root?.querySelector(
          "[data-milestone-field='note']"
        )?.value ?? ""
      ).trim(),

      method: String(
        root?.querySelector(
          "[data-milestone-field='method']"
        )?.value ?? "narrative"
      ).trim() || "narrative",

      individualTamerUuid: String(
        root?.querySelector(
          "[data-milestone-field='individual-tamer']"
        )?.value ?? ""
      ).trim()
    };
  }

  async _getMilestoneTargetForTamer(tamerUuid = "") {
    const tamer = await resolveActor(tamerUuid);

    if (!tamer || tamer.type !== "character") {
      return null;
    }

    const partner = await resolveActor(
      tamer.system?.partner?.uuid ?? ""
    );

    return createMilestoneTarget(tamer, partner);
  }

  async _onSetProgressionMethod(event, method) {
    event.preventDefault();

    try {
      await setCampaignProgressionMethod(method);
      await this.render();
    } catch (error) {
      console.error("DDA | Could not change progression method.", error);
      ui.notifications.error(error?.message ?? localize(
        "DDA.Progression.Warning.CouldNotChangeMethod",
        "Could not change the campaign progression method."
      ));
    }
  }

  async _onAdjustXp(event, amount) {
    event.preventDefault();

    try {
      const result = await adjustCampaignExperience(amount);
      ui.notifications.info(formatI18n(
        "DDA.Progression.Info.XPAdjusted",
        { value: result.value, max: result.max },
        `Party XP: ${result.value}/${result.max}.`
      ));
      await this.render();
    } catch (error) {
      console.error("DDA | Could not adjust campaign XP.", error);
      ui.notifications.error(error?.message ?? localize(
        "DDA.Progression.Warning.CouldNotAdjustXP",
        "Could not adjust campaign XP."
      ));
    }
  }

  async _onCreateXpMilestone(event) {
    event.preventDefault();

    const composer = this._getMilestoneComposerData();
    const tamers = this._getLinkedTamerActors();
    const targets = [];

    for (const tamer of tamers) {
      const target = await this._getMilestoneTargetForTamer(tamer.uuid);
      if (target) targets.push(target);
    }

    try {
      const result = await createXpCampaignMilestone({
        targets,
        note: composer.note
      });

      ui.notifications.info(formatI18n(
        "DDA.Progression.Info.XPMilestoneCreated",
        { count: targets.length, xp: result.experience.max },
        `XP Milestone created for ${targets.length} Tamer(s).`
      ));

      await this.render();
    } catch (error) {
      console.error("DDA | Could not create XP Milestone.", error);
      ui.notifications.error(error?.message ?? localize(
        "DDA.Progression.Warning.CouldNotCreateMilestone",
        "Could not create the Milestone."
      ));
    }
  }

  async _onCreatePartyMilestone(event) {
    event.preventDefault();

    const composer = this._getMilestoneComposerData();
    const tamers = await this._getFilteredTamerActors();
    const targets = [];

    for (const tamer of tamers) {
      const target = await this._getMilestoneTargetForTamer(tamer.uuid);

      if (target) {
        targets.push(target);
      }
    }

    try {
      await createPendingCampaignMilestone({
        scope: "party",
        targets,
        note: composer.note,
        method: composer.method
      });

      ui.notifications.info(
        formatI18n(
          "DDA.Progression.Info.MilestonePending",
          { count: targets.length },
          `Milestone pending for ${targets.length} Tamer(s).`
        )
      );

      await this.render();
    } catch (error) {
      ui.notifications.error(
        error?.message ??
        localize(
          "DDA.Progression.Warning.CouldNotCreateMilestone",
          "Could not create the Milestone."
        )
      );
    }
  }

  async _onCreateIndividualMilestone(event) {
    event.preventDefault();

    const composer = this._getMilestoneComposerData();
    const target = await this._getMilestoneTargetForTamer(
      composer.individualTamerUuid
    );

    try {
      await createPendingCampaignMilestone({
        scope: "individual",
        targets: target ? [target] : [],
        note: composer.note,
        method: composer.method || "gm"
      });

      ui.notifications.info(
        localize(
          "DDA.Progression.Info.IndividualMilestonePending",
          "Individual Milestone pending."
        )
      );

      await this.render();
    } catch (error) {
      ui.notifications.error(
        error?.message ??
        localize(
          "DDA.Progression.Warning.CouldNotCreateMilestone",
          "Could not create the Milestone."
        )
      );
    }
  }

  async _onReleasePendingMilestones(event) {
    event.preventDefault();

    try {
      const result = await releasePendingCampaignMilestones();

      if (!result.releasedRecords) {
        ui.notifications.warn(
          localize(
            "DDA.Progression.Warning.NoPendingMilestones",
            "There are no pending Milestones to release."
          )
        );

        return;
      }

      ui.notifications.info(
        formatI18n(
          "DDA.Progression.Info.MilestonesReleased",
          {
            milestones: result.releasedRecords,
            targets: result.releasedTargets
          },
          `${result.releasedRecords} Milestone(s) released to ${result.releasedTargets} Tamer(s).`
        )
      );

      await this.render();
    } catch (error) {
      console.error("DDA | Could not release pending Milestones.", error);

      ui.notifications.error(
        error?.message ??
        localize(
          "DDA.Progression.Warning.CouldNotReleaseMilestones",
          "Could not release pending Milestones."
        )
      );
    }
  }

  async _onPlanDarkEvolution(event, target) {
    event.preventDefault();
    event.stopPropagation();

    if (!game.user?.isGM) {
      ui.notifications.warn(
        localize("DDA.GMPartnerProgress.OnlyGM")
      );
      return;
    }

    if (!getDarkEvolutionEnabled()) {
      ui.notifications.warn(
        localize(
          "DDA.GMPartnerProgress.DarkEvolutionDisabled",
          "Enable Dark Evolution in the system settings first."
        )
      );
      return;
    }

    const tamer = await resolveActor(
      target?.dataset?.tamerUuid ?? ""
    );

    if (!tamer || tamer.type !== "character") {
      ui.notifications.warn(
        localize(
          "DDA.GMPartnerProgress.NoTamers",
          "No linked Tamer was found."
        )
      );
      return;
    }

    await DDAPartnerFormPlanner.openDarkEvolution(tamer);
  }

  async _onOpenActor(event, target) {
    event.preventDefault();

    const actor = await resolveActor(target?.dataset?.uuid ?? "");
    actor?.sheet?.render(true);
  }

  async _onToggleCrestDigivice(event, target) {
    event.preventDefault();

    if (!game.user?.isGM) {
      ui.notifications.warn(
        localize("DDA.GMPartnerProgress.OnlyGM")
      );

      return;
    }

    const tamer = await resolveActor(
      target?.dataset?.tamerUuid ?? ""
    );

    if (!tamer || tamer.type !== "character") {
      return;
    }

    if (!Boolean(game.settings.get(
      DDA_SYSTEM_ID,
      "enableHiddenCompatibilityQuestionnaire"
    ))) {
      ui.notifications.warn(
        localize("DDA.GMPartnerProgress.QuestionnaireDisabled")
      );

      return;
    }

    const crestKey = getTamerCrestKey(tamer);

    if (!crestKey) {
      ui.notifications.warn(
        localize("DDA.GMPartnerProgress.NoCrestAvailable")
      );

      return;
    }

    const revealed = !Boolean(
      tamer.system?.partner?.digiviceSkin?.revealed
    );

    const unlockedStages = getUnlockedStages(tamer);

    if (revealed) {
      unlockedStages.perfect = true;
    }

    await tamer.update({
      "system.partner.digiviceSkin.revealed": revealed,
      "system.partner.digiviceSkin.crestKey": crestKey,
      "system.partner.digiviceSkin.lastToggleAt": new Date().toISOString(),
      "system.partner.crestResonance.active": revealed,
      "system.partner.unlockedEvolutionStages": unlockedStages
    });

    tamer.sheet?.render(false);

    ui.notifications.info(
      localize("DDA.GMPartnerProgress.Saved")
    );

    await this.render();
  }

  async _onToggleStage(event, target) {
    event.preventDefault();

    if (!game.user?.isGM) {
      ui.notifications.warn(
        localize("DDA.GMPartnerProgress.OnlyGM")
      );

      return;
    }

    const tamer = await resolveActor(
      target?.dataset?.tamerUuid ?? ""
    );

    const stageKey = String(
      target?.dataset?.stageKey ?? ""
    ).trim();

    if (!tamer || tamer.type !== "character" || !stageKey) {
      return;
    }

    const unlockedStages = getUnlockedStages(tamer);
    unlockedStages[stageKey] = !Boolean(unlockedStages[stageKey]);

    await tamer.update({
      "system.partner.unlockedEvolutionStages": unlockedStages
    });

    tamer.sheet?.render(false);

    ui.notifications.info(
      localize("DDA.GMPartnerProgress.Saved")
    );

    await this.render();
  }
}

function openGMPartnerProgressPanel() {
  if (!game.user?.isGM) {
    ui.notifications.warn(
      localize("DDA.GMPartnerProgress.OnlyGM")
    );

    return;
  }

  game.dda = game.dda ?? {};
  game.dda.applications = game.dda.applications ?? {};

  const panel = game.dda.applications.gmPartnerProgressPanel ??=
    new DDAGMPartnerProgressPanel();

  return panel.render(true);
}

Hooks.once("ready", () => {
  game.dda = game.dda ?? {};
  game.dda.applications = game.dda.applications ?? {};
  game.dda.applications.DDAGMPartnerProgressPanel =
    DDAGMPartnerProgressPanel;

  game.dda.openGMPartnerProgressPanel =
    openGMPartnerProgressPanel;
});

Hooks.on("renderActorDirectory", (_app, html) => {
  if (!game.user?.isGM) {
    return;
  }

  const root = html instanceof jQuery
    ? html[0]
    : html;

  if (!root?.querySelector) {
    return;
  }

  const directoryFooter = root.querySelector(".directory-footer");
  const directoryHeader = root.querySelector(".directory-header");
  const target = directoryFooter ?? directoryHeader;

  if (!target) {
    return;
  }

  let button = root.querySelector(
    ".dda-open-gm-partner-progress-panel"
  );

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.classList.add(
      "dda-open-gm-partner-progress-panel",
      "dda-open-partner-progress"
    );

    button.addEventListener(
      "click",
      openGMPartnerProgressPanel
    );

    target.prepend(button);
  }

  button.innerHTML =
    `<img
      class="dda-directory-action-icon"
      src="systems/digimon-digital-adventures/assets/ui/progress-partner.svg"
      alt=""
    />
    <span>${localize("DDA.GMPartnerProgress.Open")}</span>
  `;
});
