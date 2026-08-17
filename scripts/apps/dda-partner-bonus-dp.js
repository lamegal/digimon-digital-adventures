import {
  DDA_BONUS_DP_STAT_KEYS,
  getPartnerBonusDpAllocation,
  getPartnerBonusDpFormStatus,
  updatePartnerBonusDpAllocation
} from "../rules/tamer-progression.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DDAPartnerBonusDpBase = HandlebarsApplicationMixin(ApplicationV2);

const OPEN_APPS = new Map();

function localize(key, fallback = key) {
  const value = game.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function integer(value, fallback = 0) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
}

async function resolvePartner(tamer) {
  const uuid = String(tamer?.system?.partner?.uuid ?? "").trim();
  if (!uuid) return null;

  try {
    const actor = await fromUuid(uuid);
    return actor?.type === "digimon" ? actor : null;
  } catch (error) {
    console.warn("DDA | Could not resolve Partner for Bonus DP advancement.", error);
    return null;
  }
}

function getStatLabel(key) {
  const keys = {
    accuracy: "DDA.MainStat.Accuracy",
    damage: "DDA.MainStat.Damage",
    dodge: "DDA.MainStat.Dodge",
    armor: "DDA.MainStat.Armor",
    health: "DDA.MainStat.Health"
  };

  return localize(keys[key] ?? key, key);
}

function getStatusLabel(status) {
  const keys = {
    complete: "DDA.Progression.BonusDP.FormStatus.Complete",
    pending: "DDA.Progression.BonusDP.FormStatus.Pending",
    invalid: "DDA.Progression.BonusDP.FormStatus.Invalid",
    notRequired: "DDA.Progression.BonusDP.FormStatus.NotRequired"
  };

  return localize(keys[status] ?? keys.pending, status);
}

export class DDAPartnerBonusDpAdvancement extends DDAPartnerBonusDpBase {
  static DEFAULT_OPTIONS = {
    id: "dda-partner-bonus-dp",
    classes: ["dda", "dda-partner-bonus-dp"],
    position: {
      width: 900,
      height: 720
    },
    window: {
      icon: "fa-solid fa-microchip",
      title: "Partner Bonus DP",
      resizable: true
    },
    actions: {
      saveAllocation: DDAPartnerBonusDpAdvancement._onActionSaveAllocation,
      openPlanner: DDAPartnerBonusDpAdvancement._onActionOpenPlanner,
      resetDraft: DDAPartnerBonusDpAdvancement._onActionResetDraft
    }
  };

  static PARTS = {
    content: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-partner-bonus-dp.hbs",
      scrollable: [".dda-bonus-dp-body"]
    }
  };

  constructor(tamerActor, options = {}) {
    super(options);
    this.tamerActor = tamerActor ?? null;
    this.partnerActor = null;
    this._draft = null;
  }

  get title() {
    return localize(
      "DDA.Progression.BonusDP.Title",
      "Partner Bonus DP"
    );
  }

  _canEdit() {
    return Boolean(
      game.user?.isGM ||
      this.partnerActor?.isOwner
    );
  }

  _initializeDraft(allocation) {
    if (this._draft) return;

    this._draft = {
      sharedStatBonus: foundry.utils.deepClone(
        allocation?.sharedStatBonus ?? {}
      ),
      qualityAllocated: integer(allocation?.qualityAllocated, 0)
    };
  }

  _draftStatTotal() {
    return DDA_BONUS_DP_STAT_KEYS.reduce((sum, key) => {
      return sum + integer(this._draft?.sharedStatBonus?.[key], 0);
    }, 0);
  }

  _getDraftAllocation(total) {
    const statAllocated = this._draftStatTotal();
    const qualityAllocated = integer(this._draft?.qualityAllocated, 0);

    return {
      total: integer(total, 0),
      sharedStatBonus: foundry.utils.deepClone(
        this._draft?.sharedStatBonus ?? {}
      ),
      statAllocated,
      qualityAllocated,
      allocated: statAllocated + qualityAllocated,
      unallocated: Math.max(0, integer(total, 0) - statAllocated - qualityAllocated)
    };
  }

  static async _onActionSaveAllocation(event) {
    event.preventDefault();

    if (!this.partnerActor || !this._canEdit()) {
      ui.notifications.warn(
        localize("DDA.Warning.NoPermission", "You do not have permission to modify this Partner.")
      );
      return;
    }

    const result = await updatePartnerBonusDpAllocation(
      this.partnerActor,
      this._draft
    );

    if (!result.ok) {
      ui.notifications.warn(result.message);
      return;
    }

    ui.notifications.info(
      localize(
        "DDA.Progression.BonusDP.Info.Saved",
        "Partner Bonus DP allocation saved and synchronized across prepared forms."
      )
    );

    this._draft = null;
    await this.render();
    this.tamerActor?.sheet?.render(false);
  }

  static async _onActionOpenPlanner(event) {
    event.preventDefault();

    const { DDAPartnerFormPlanner } = await import(
      "./dda-partner-form-planner.js"
    );

    await DDAPartnerFormPlanner.open(this.tamerActor);
  }

  static async _onActionResetDraft(event) {
    event.preventDefault();
    this._draft = null;
    await this.render();
  }

  async _prepareContext() {
    this.partnerActor = await resolvePartner(this.tamerActor);

    if (!this.partnerActor) {
      return {
        hasPartner: false,
        canEdit: false,
        tamerName: this.tamerActor?.name ?? "",
        labels: {
          noPartner: localize(
            "DDA.Progression.BonusDP.Warning.PartnerRequired",
            "A linked Partner Digimon is required."
          )
        }
      };
    }

    const allocation = getPartnerBonusDpAllocation(this.partnerActor);
    this._initializeDraft(allocation);

    const draftAllocation = this._getDraftAllocation(allocation.total);
    const formStatus = getPartnerBonusDpFormStatus(
      this.partnerActor,
      draftAllocation
    );

    const statMaximums = Object.fromEntries(
      DDA_BONUS_DP_STAT_KEYS.map((key) => {
        const values = formStatus.forms
          .filter((form) => form.eligible)
          .map((form) => integer(form.statHeadroom?.[key], 20));

        return [key, values.length ? Math.min(...values) : 20];
      })
    );

    const stats = DDA_BONUS_DP_STAT_KEYS.map((key) => ({
      key,
      label: getStatLabel(key),
      value: integer(this._draft.sharedStatBonus?.[key], 0),
      max: Math.min(allocation.total, statMaximums[key])
    }));

    const forms = formStatus.forms.map((form) => ({
      ...form,
      stageLabel: localize(
        CONFIG.DDA?.stages?.[form.stage]?.label ?? form.stage,
        form.stage
      ),
      statusLabel: getStatusLabel(form.status),
      statusClass: `is-${form.status}`,
      qualityDisplay: form.eligible
        ? `${form.qualitySpent}/${draftAllocation.qualityAllocated}`
        : "—"
    }));

    return {
      hasPartner: true,
      canEdit: this._canEdit(),
      tamerName: this.tamerActor?.name ?? "",
      partnerName: this.partnerActor?.name ?? "",
      partnerImg: this.partnerActor?.img ?? "icons/svg/mystery-man.svg",
      total: allocation.total,
      statAllocated: draftAllocation.statAllocated,
      qualityAllocated: draftAllocation.qualityAllocated,
      unallocated: draftAllocation.unallocated,
      overBudget: draftAllocation.allocated > allocation.total,
      parityComplete: formStatus.parityComplete,
      hasPendingForms: formStatus.hasPendingForms,
      hasInvalidForms: formStatus.hasInvalidForms,
      qualityMax: Math.max(0, allocation.total - draftAllocation.statAllocated),
      stats,
      forms,
      hasForms: forms.length > 0,
      labels: {
        title: localize("DDA.Progression.BonusDP.Title", "Partner Bonus DP"),
        subtitle: localize(
          "DDA.Progression.BonusDP.Subtitle",
          "Allocate milestone Bonus DP between shared Stats and per-form Quality Points."
        ),
        total: localize("DDA.Progression.BonusDP.Total", "Total Bonus DP"),
        sharedStats: localize("DDA.Progression.BonusDP.SharedStats", "Shared Stats"),
        quality: localize("DDA.Progression.BonusDP.QualityAllocation", "Quality Allocation"),
        unallocated: localize("DDA.Progression.BonusDP.Unallocated", "Unallocated"),
        statsTitle: localize("DDA.Progression.BonusDP.StatsTitle", "Shared Stat Purchases"),
        statsHint: localize(
          "DDA.Progression.BonusDP.StatsHint",
          "Each point assigned here increases the same Stat by +1 on every eligible Partner form."
        ),
        qualitiesTitle: localize("DDA.Progression.BonusDP.QualitiesTitle", "Quality Points per Form"),
        qualitiesHint: localize(
          "DDA.Progression.BonusDP.QualitiesHint",
          "Every prepared form must spend this many Bonus DP on Qualities, but the Qualities themselves may differ between forms."
        ),
        formsTitle: localize("DDA.Progression.BonusDP.FormsTitle", "Prepared Form Parity"),
        formsHint: localize(
          "DDA.Progression.BonusDP.FormsHint",
          "Baby I is excluded by the system's fixed-stage rules. Pending forms can be completed in the Partner Form Planner."
        ),
        qualitySpent: localize("DDA.Progression.BonusDP.QualitySpent", "Quality DP"),
        localBase: localize("DDA.Progression.BonusDP.LocalBaseRemaining", "Base DP Remaining"),
        save: localize("DDA.Progression.BonusDP.Button.Save", "Save Allocation"),
        planner: localize("DDA.Button.PartnerFormPlanner", "Partner Form Planner"),
        reset: localize("DDA.Progression.BonusDP.Button.Reset", "Reset Draft"),
        ruleTitle: localize("DDA.Progression.BonusDP.RuleTitle", "Bonus DP Rule"),
        ruleText: localize(
          "DDA.Progression.BonusDP.RuleText",
          "Stat purchases transfer identically to every stage. Quality purchases only need to match the amount of Bonus DP spent, not the specific Qualities chosen."
        ),
        noPartner: localize(
          "DDA.Progression.BonusDP.Warning.PartnerRequired",
          "A linked Partner Digimon is required."
        )
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const root = this.element;
    if (!root || !this._draft) return;

    const updatePreview = () => {
      const statTotal = this._draftStatTotal();
      const quality = integer(this._draft.qualityAllocated, 0);
      const total = integer(this.partnerActor?.system?.advancement?.bonusDp?.total, 0);
      const qualityInput = root.querySelector("[data-bonus-quality]");
      const qualityMax = Math.max(0, total - statTotal);

      if (qualityInput) {
        qualityInput.max = String(qualityMax);
        if (quality > qualityMax) {
          this._draft.qualityAllocated = qualityMax;
          qualityInput.value = String(qualityMax);
        }
      }

      const effectiveQuality = integer(this._draft.qualityAllocated, 0);
      const unallocated = Math.max(0, total - statTotal - effectiveQuality);

      const statNode = root.querySelector("[data-bonus-stat-total]");
      const qualityNode = root.querySelector("[data-bonus-quality-total]");
      const unallocatedNode = root.querySelector("[data-bonus-unallocated]");

      if (statNode) statNode.textContent = String(statTotal);
      if (qualityNode) qualityNode.textContent = String(effectiveQuality);
      if (unallocatedNode) unallocatedNode.textContent = String(unallocated);
    };

    root.querySelectorAll("[data-bonus-stat]").forEach((input) => {
      input.addEventListener("input", (event) => {
        const key = String(event.currentTarget.dataset.bonusStat ?? "").trim();
        if (!DDA_BONUS_DP_STAT_KEYS.includes(key)) return;

        const max = integer(event.currentTarget.max, 20);
        const value = Math.min(max, integer(event.currentTarget.value, 0));
        event.currentTarget.value = String(value);
        this._draft.sharedStatBonus[key] = value;
        updatePreview();
      });
    });

    root.querySelector("[data-bonus-quality]")?.addEventListener("input", (event) => {
      const max = integer(event.currentTarget.max, 0);
      const value = Math.min(max, integer(event.currentTarget.value, 0));
      event.currentTarget.value = String(value);
      this._draft.qualityAllocated = value;
      updatePreview();
    });
  }
}

export async function openPartnerBonusDpAdvancement(tamerActor) {
  const uuid = String(tamerActor?.uuid ?? "").trim();
  if (!uuid) throw new Error("DDA | A valid Tamer Actor is required for Partner Bonus DP advancement.");

  const existing = OPEN_APPS.get(uuid);
  if (existing?.rendered) {
    existing.bringToFront();
    return existing;
  }

  const app = new DDAPartnerBonusDpAdvancement(tamerActor, {
    id: `dda-partner-bonus-dp-${tamerActor.id}`
  });

  OPEN_APPS.set(uuid, app);
  app.addEventListener("close", () => OPEN_APPS.delete(uuid));
  await app.render({ force: true });
  return app;
}
