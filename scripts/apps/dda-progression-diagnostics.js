import {
  getProgressionDiagnostic,
  repairProgressionDiagnostic
} from "../rules/tamer-progression.js";
import { DDAPartnerBonusDpAdvancement } from "./dda-partner-bonus-dp.js";
import { DDAPartnerFormPlanner } from "./dda-partner-form-planner.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DDAProgressionDiagnosticsBase = HandlebarsApplicationMixin(ApplicationV2);

function localize(key, fallback = key) {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function formatI18n(key, data = {}, fallback = "") {
  const value = game?.i18n?.format?.(key, data);
  return value && value !== key ? value : (fallback || key);
}

async function resolveActor(uuid = "") {
  const cleanUuid = String(uuid ?? "").trim();
  if (!cleanUuid) return null;

  try {
    const actor = await fromUuid(cleanUuid);
    return actor?.documentName === "Actor" ? actor : null;
  } catch (error) {
    console.warn("DDA | Progression Diagnostics could not resolve Actor:", cleanUuid, error);
    return null;
  }
}

function statusLabel(status = "ok") {
  const keys = {
    ok: "DDA.Progression.Diagnostics.Status.OK",
    review: "DDA.Progression.Diagnostics.Status.Review",
    legacy: "DDA.Progression.Diagnostics.Status.Legacy",
    incomplete: "DDA.Progression.Diagnostics.Status.Incomplete"
  };
  return localize(keys[status] ?? keys.ok, status);
}

function formStatusLabel(status = "notRequired") {
  const keys = {
    complete: "DDA.Progression.BonusDP.FormStatus.Complete",
    pending: "DDA.Progression.BonusDP.FormStatus.Pending",
    invalid: "DDA.Progression.BonusDP.FormStatus.Invalid",
    notRequired: "DDA.Progression.BonusDP.FormStatus.NotRequired"
  };
  return localize(keys[status] ?? keys.notRequired, status);
}

function issueText(issue = {}) {
  const data = issue.data ?? {};
  const key = `DDA.Progression.Diagnostics.Issue.${issue.code}`;
  const fallbacks = {
    milestoneHistoryExceedsCounter: `Milestone history contains ${data.history ?? 0} entries, but the Tamer counter is ${data.counter ?? 0}.`,
    legacyMilestonesWithoutHistory: `The Tamer has ${data.counter ?? 0} Milestones, but only ${data.history ?? 0} have detailed history. This is likely legacy progression data.`,
    campaignLedgerAheadOfActor: `The campaign ledger records ${data.ledger ?? 0} released Milestones for this Tamer, but the Actor history only records ${data.history ?? 0}.`,
    growthPoolBelowPackages: `Growth Points available (${data.available ?? 0}) are below the remaining package total (${data.packageRemaining ?? 0}).`,
    legacyGrowthPool: `The Tamer has ${data.available ?? 0} Growth Points available but only ${data.packageRemaining ?? 0} are represented by modern packages.`,
    attributeAboveCap: `The Tamer has an Attribute at ${data.highest ?? 0}, above the current Milestone cap of ${data.cap ?? 0}.`,
    missingPartner: "No linked Partner Digimon could be resolved for this Tamer.",
    legacyBonusDp: `This Partner has ${data.total ?? 0} Bonus DP but does not have enough canonical DDA57 allocation metadata to migrate automatically.`,
    bonusDpBelowPackages: `Partner Bonus DP total (${data.total ?? 0}) is below the amount represented by Milestone packages (${data.packages ?? 0}).`,
    legacyBonusDpTotal: `Partner Bonus DP total (${data.total ?? 0}) exceeds the amount represented by modern Milestone packages (${data.packages ?? 0}).`,
    invalidPartnerForm: "At least one prepared Partner form cannot satisfy the current Bonus DP allocation without breaking its Stat cap or base DP budget.",
    pendingQualityParity: `${data.pending ?? 0} prepared Partner form(s) still need to spend the required Quality Bonus DP.`,
    unallocatedBonusDp: `${data.value ?? 0} Bonus DP remain unallocated between shared Stats and Quality Points.`,
    sharedStatMetadataMismatch: `${data.forms ?? 0} prepared form(s) do not match the canonical shared Stat Bonus metadata.`,
    tamerPartnerBonusMirrorMismatch: `Tamer Partner summary stores ${data.tamerValue ?? 0} Bonus DP while the Partner Actor stores ${data.partnerValue ?? 0}.`
  };

  return formatI18n(key, data, fallbacks[issue.code] ?? issue.code ?? "Unknown issue");
}

function summarizeStatMap(map = {}) {
  const labels = {
    accuracy: localize("DDA.MainStat.Accuracy", "ACC"),
    damage: localize("DDA.MainStat.Damage", "DMG"),
    dodge: localize("DDA.MainStat.Dodge", "Dodge"),
    armor: localize("DDA.MainStat.Armor", "Armor"),
    health: localize("DDA.MainStat.Health", "Health")
  };

  const parts = Object.entries(labels)
    .map(([key, label]) => {
      const value = Math.max(0, Math.floor(Number(map?.[key] ?? 0)));
      return value > 0 ? `${label} +${value}` : "";
    })
    .filter(Boolean);

  return parts.length
    ? parts.join(" · ")
    : localize("DDA.Progression.Diagnostics.None", "None");
}

export class DDAProgressionDiagnostics extends DDAProgressionDiagnosticsBase {
  static DEFAULT_OPTIONS = {
    id: "dda-progression-diagnostics",
    classes: ["dda", "dda-progression-diagnostics"],
    position: {
      width: 1100,
      height: 760
    },
    window: {
      icon: "fa-solid fa-stethoscope",
      resizable: true
    },
    actions: {
      refresh: DDAProgressionDiagnostics._onActionRefresh,
      openTamer: DDAProgressionDiagnostics._onActionOpenActor,
      openPartner: DDAProgressionDiagnostics._onActionOpenActor,
      reconcileBonusDp: DDAProgressionDiagnostics._onActionReconcileBonusDp,
      repairSafe: DDAProgressionDiagnostics._onActionRepairSafe,
      openPlanner: DDAProgressionDiagnostics._onActionOpenPlanner
    }
  };

  static PARTS = {
    content: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-progression-diagnostics.hbs",
      scrollable: [".dda-progression-diagnostics-list"]
    }
  };

  constructor(options = {}) {
    super(options);
    this.statusFilter = "all";
    this.searchTerm = "";
  }

  get title() {
    return localize(
      "DDA.Progression.Diagnostics.Title",
      "Progression Diagnostics"
    );
  }

  static async _onActionRefresh(event) {
    event.preventDefault();
    await this.render();
  }

  static async _onActionOpenActor(event, target) {
    event.preventDefault();
    const actor = await resolveActor(target?.dataset?.uuid);
    actor?.sheet?.render(true);
  }

  static async _onActionReconcileBonusDp(event, target) {
    event.preventDefault();
    const tamer = await resolveActor(target?.dataset?.tamerUuid);
    if (!tamer) return;

    const app = new DDAPartnerBonusDpAdvancement(tamer, {
      id: `dda-partner-bonus-dp-${tamer.id}`
    });
    await app.render(true);
  }

  static async _onActionOpenPlanner(event, target) {
    event.preventDefault();
    const tamer = await resolveActor(target?.dataset?.tamerUuid);
    if (!tamer) return;
    await DDAPartnerFormPlanner.open(tamer);
  }

  static async _onActionRepairSafe(event, target) {
    event.preventDefault();

    const tamer = await resolveActor(target?.dataset?.tamerUuid);
    const partner = await resolveActor(target?.dataset?.partnerUuid);
    if (!tamer) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: localize(
        "DDA.Progression.Diagnostics.RepairConfirmTitle",
        "Repair Progression Metadata"
      ),
      content: `<p>${localize(
        "DDA.Progression.Diagnostics.RepairConfirmText",
        "This only reapplies data that can be reconstructed from the current canonical Bonus DP allocation. Legacy allocation choices will not be guessed or rewritten."
      )}</p>`,
      rejectClose: false,
      modal: true
    });

    if (!confirmed) return;

    const result = await repairProgressionDiagnostic(tamer, partner);

    if (!result.ok) {
      const warningKey = result.reason === "legacyRequiresReconcile"
        ? "DDA.Progression.Diagnostics.RepairLegacyBlocked"
        : "DDA.Progression.Diagnostics.RepairFailed";
      ui.notifications.warn(localize(
        warningKey,
        result.reason === "legacyRequiresReconcile"
          ? "Legacy Bonus DP must be reconciled manually before safe repair can run."
          : "The progression metadata could not be repaired automatically."
      ));
      return;
    }

    ui.notifications.info(localize(
      "DDA.Progression.Diagnostics.RepairSuccess",
      "Safe progression metadata was synchronized successfully."
    ));
    await this.render();
  }

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const isGM = Boolean(game.user?.isGM);

    if (!isGM) {
      return {
        ...context,
        isGM: false,
        rows: [],
        summary: { total: 0, ok: 0, review: 0, legacy: 0, incomplete: 0 }
      };
    }

    const tamers = game.actors
      .filter((actor) => actor.type === "character")
      .sort((a, b) => a.name.localeCompare(
        b.name,
        game.i18n?.lang ?? undefined,
        { sensitivity: "base" }
      ));

    const rows = [];

    for (const tamer of tamers) {
      const partner = await resolveActor(tamer.system?.partner?.uuid ?? "");
      const diagnostic = getProgressionDiagnostic(tamer, partner);

      rows.push({
        status: diagnostic.status,
        statusLabel: statusLabel(diagnostic.status),
        tamerUuid: tamer.uuid,
        tamerName: tamer.name,
        tamerImg: tamer.img,
        partnerUuid: partner?.uuid ?? "",
        partnerName: partner?.name ?? localize("DDA.Progression.Diagnostics.NoPartner", "No Partner"),
        partnerImg: partner?.img ?? "icons/svg/mystery-man.svg",
        milestonesCompleted: diagnostic.tamer.milestonesCompleted,
        milestoneHistoryCount: diagnostic.tamer.historyCount,
        ledgerReleasedCount: diagnostic.tamer.ledgerReleasedCount,
        attributeCap: diagnostic.tamer.attributeCap,
        highestAttribute: diagnostic.tamer.highestAttribute,
        growthAvailable: diagnostic.tamer.growthPointsAvailable,
        growthPackageRemaining: diagnostic.tamer.growthPackageRemaining,
        inspirationValue: diagnostic.tamer.inspirationValue,
        inspirationMax: diagnostic.tamer.inspirationMax,
        inspirationGrantedRecorded: diagnostic.tamer.inspirationGrantedRecorded,
        bonusDpTotal: diagnostic.partner?.total ?? 0,
        statAllocated: diagnostic.partner?.statAllocated ?? 0,
        qualityAllocated: diagnostic.partner?.qualityAllocated ?? 0,
        unallocated: diagnostic.partner?.unallocated ?? 0,
        canonicalAllocationStored: Boolean(diagnostic.partner?.canonicalAllocationStored),
        parityComplete: Boolean(diagnostic.partner?.parityComplete),
        repairable: diagnostic.repairable,
        requiresReconcile: diagnostic.requiresReconcile,
        hasPartner: Boolean(partner),
        hasPendingForms: Boolean(diagnostic.partner?.hasPendingForms),
        hasInvalidForms: Boolean(diagnostic.partner?.hasInvalidForms),
        issues: diagnostic.issues.map((issue) => ({
          ...issue,
          text: issueText(issue),
          label: statusLabel(issue.severity)
        })),
        forms: (diagnostic.partner?.forms ?? []).map((form) => ({
          ...form,
          statusLabel: formStatusLabel(form.status),
          statBonusText: summarizeStatMap(form.appliedSharedStatBonus)
        }))
      });
    }

    const summary = {
      total: rows.length,
      ok: rows.filter((row) => row.status === "ok").length,
      review: rows.filter((row) => row.status === "review").length,
      legacy: rows.filter((row) => row.status === "legacy").length,
      incomplete: rows.filter((row) => row.status === "incomplete").length
    };

    return {
      ...context,
      isGM: true,
      rows,
      summary,
      hasRows: rows.length > 0,
      labels: {
        subtitle: localize(
          "DDA.Progression.Diagnostics.Subtitle",
          "Audit Milestones, Growth Points, Bonus DP, prepared forms, and legacy progression metadata without changing character builds."
        )
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const root = this.element;
    if (!root) return;

    const search = root.querySelector("[data-diagnostic-search]");
    const filter = root.querySelector("[data-diagnostic-status]");

    const applyFilters = () => {
      const term = String(this.searchTerm ?? "").trim().toLowerCase();
      const status = this.statusFilter ?? "all";
      let visible = 0;

      root.querySelectorAll("[data-diagnostic-row]").forEach((row) => {
        const haystack = String(row.dataset.search ?? "").toLowerCase();
        const rowStatus = String(row.dataset.status ?? "ok");
        const matchesSearch = !term || haystack.includes(term);
        const matchesStatus = status === "all" || rowStatus === status;
        row.hidden = !(matchesSearch && matchesStatus);
        if (!row.hidden) visible += 1;
      });

      const count = root.querySelector("[data-diagnostic-visible-count]");
      if (count) count.textContent = String(visible);
    };

    if (search) {
      search.value = this.searchTerm;
      search.addEventListener("input", (event) => {
        this.searchTerm = event.currentTarget.value ?? "";
        applyFilters();
      });
    }

    if (filter) {
      filter.value = this.statusFilter;
      filter.addEventListener("change", (event) => {
        this.statusFilter = event.currentTarget.value ?? "all";
        applyFilters();
      });
    }

    applyFilters();
  }
}
