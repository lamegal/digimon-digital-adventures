import {
  claimExperiencedSkillPoint,
  getExperiencedRewardState,
  getNextTamerGrowthPackage,
  getTamerAttributeCap,
  getTamerSkillCap,
  markExperiencedRewardClaimed,
  spendTamerGrowthPackage
} from "../rules/tamer-progression.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DDATamerAdvancementBase = HandlebarsApplicationMixin(ApplicationV2);

const OPEN_ADVANCEMENT_APPS = new Map();

function integer(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function localize(key, fallback = key) {
  const value = game.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function format(key, data = {}, fallback = key) {
  const value = game.i18n?.format?.(key, data);
  return value && value !== key ? value : fallback;
}

function getScopeLabel(scope) {
  return scope === "party"
    ? localize("DDA.Progression.Scope.Party", "Team Milestone")
    : localize("DDA.Progression.Scope.Individual", "Individual Milestone");
}

export class DDATamerAdvancement extends DDATamerAdvancementBase {
  static async _onActionSelectAttribute(event, target) {
    event.preventDefault();

    if (!this._canSpendGrowthPoints()) return;

    this._draft.mode = "attribute";
    this._draft.attributeKey = String(
      target.dataset.attributeKey ?? ""
    ).trim();

    await this.render();
  }

  static async _onActionSpendGrowth(event) {
    event.preventDefault();

    if (!this._canSpendGrowthPoints()) {
      ui.notifications.warn(
        localize(
          "DDA.Warning.NoPermission",
          "You do not have permission to advance this Tamer."
        )
      );
      return;
    }

    const activePackage = getNextTamerGrowthPackage(this.actor);

    if (!activePackage) {
      ui.notifications.warn(
        localize(
          "DDA.Progression.Warning.NoGrowthPackage",
          "There is no Growth Point package available."
        )
      );
      await this.render();
      return;
    }

    try {
      const result = await spendTamerGrowthPackage(
        this.actor,
        this._buildSpendDraft(),
        activePackage
      );

      if (!result.ok) {
        ui.notifications.warn(result.message);
        return;
      }

      ui.notifications.info(
        format(
          "DDA.TamerAdvancement.Spent",
          { actor: this.actor.name },
          `${this.actor.name} spent one Growth Point package.`
        )
      );

      this._resetDraft();

      const experiencedReward =
        getExperiencedRewardState(
          this.actor
        );

      if (
        getNextTamerGrowthPackage(this.actor) ||
        experiencedReward.pending
      ) {
        await this.render();
      } else {
        await this.close();
      }
    } catch (error) {
      console.error("DDA | Could not spend Tamer Growth Point package.", error);

      ui.notifications.error(
        localize(
          "DDA.TamerAdvancement.Error",
          "Could not spend this Growth Point package."
        )
      );
    }
  }

  static async _onActionClaimExperienced(event) {
    event.preventDefault();

    if (!this._canSpendGrowthPoints()) {
      ui.notifications.warn(
        localize(
          "DDA.Warning.NoPermission",
          "You do not have permission to advance this Tamer."
        )
      );

      return;
    }

    const select =
      this.element?.querySelector(
        "[data-experienced-skill]"
      );

    const skillKey =
      String(
        select?.value ?? ""
      ).trim();

    const result =
      await claimExperiencedSkillPoint(
        this.actor,
        skillKey
      );

    if (!result.ok) {
      ui.notifications.warn(
        result.message
      );

      return;
    }

    ui.notifications.info(
      format(
        "DDA.TamerTalent.Experienced.Applied",
        {
          skill:
            result.skillLabel,

          before:
            result.before,

          after:
            result.after
        },
        `${result.skillLabel}: ${result.before} → ${result.after}.`
      )
    );

    await this.render();
  }

  static async _onActionMarkExperiencedClaimed(event) {
    event.preventDefault();

    if (!this._canSpendGrowthPoints()) {
      ui.notifications.warn(
        localize(
          "DDA.Warning.NoPermission",
          "You do not have permission to advance this Tamer."
        )
      );

      return;
    }

    const confirmed =
      await foundry.applications.api.DialogV2.confirm({
        window: {
          title:
            localize(
              "DDA.TamerTalent.Experienced.MarkApplied",
              "Mark Experienced as Applied"
            )
        },

        content: `
          <p>
            ${localize(
              "DDA.TamerTalent.Experienced.MarkAppliedConfirm",
              "Use this only when the extra Skill Point was already added manually. No Skill will be changed."
            )}
          </p>
        `,

        yes: {
          label:
            localize(
              "DDA.Button.Confirm",
              "Confirm"
            ),

          default: true
        },

        no: {
          label:
            localize(
              "DDA.Button.Cancel",
              "Cancel"
            )
        }
      });

    if (!confirmed) return;

    const result =
      await markExperiencedRewardClaimed(
        this.actor
      );

    if (!result.ok) {
      ui.notifications.warn(
        result.message
      );

      return;
    }

    ui.notifications.info(
      localize(
        "DDA.TamerTalent.Experienced.MarkedApplied",
        "Experienced was marked as already applied."
      )
    );

    await this.render();
  }

  static DEFAULT_OPTIONS = {
    id: "dda-tamer-advancement",
    classes: ["dda", "dda-tamer-advancement"],
    position: {
      width: 760,
      height: 650
    },
    window: {
      icon: "fa-solid fa-arrow-up-right-dots",
      title: "Tamer Advancement",
      resizable: true
    },
    actions: {
      selectAttribute: DDATamerAdvancement._onActionSelectAttribute,
      spendGrowth: DDATamerAdvancement._onActionSpendGrowth,
      claimExperienced: DDATamerAdvancement._onActionClaimExperienced,
      markExperiencedClaimed: DDATamerAdvancement._onActionMarkExperiencedClaimed
    }
  };

  static PARTS = {
    content: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-tamer-advancement.hbs",
      scrollable: [".dda-tamer-advancement-body"]
    }
  };

  constructor(actor, options = {}) {
    super(options);

    this.actor = actor;
    this._draft = {
      mode: "attribute",
      attributeKey: "",
      skills: {}
    };
  }

  _canSpendGrowthPoints() {
    return Boolean(game.user?.isGM || this.actor?.isOwner);
  }

  _resetDraft() {
    this._draft = {
      mode: "attribute",
      attributeKey: "",
      skills: {}
    };
  }

  _buildSpendDraft() {
    if (this._draft.mode === "attribute") {
      const attributeKey = String(this._draft.attributeKey ?? "").trim();

      return {
        mode: "attribute",
        attributes: attributeKey ? { [attributeKey]: 1 } : {},
        skills: {}
      };
    }

    const skills = {};

    for (const [skillKey, value] of Object.entries(this._draft.skills)) {
      const increase = integer(value, 0);

      if (increase > 0) {
        skills[skillKey] = increase;
      }
    }

    return {
      mode: "skills",
      attributes: {},
      skills
    };
  }

  _getDraftSkillTotal() {
    return Object.values(this._draft.skills).reduce((total, value) => {
      return total + integer(value, 0);
    }, 0);
  }

  _refreshSkillBudgetPreview() {
    const root = this.element;
    if (!root) return;

    const activePackage = getNextTamerGrowthPackage(this.actor);
    const total = this._getDraftSkillTotal();

    const remaining = Math.max(
      0,
      integer(activePackage?.remaining, 0) - total
    );

    const spentElement = root.querySelector("[data-growth-skill-total]");
    const remainingElement = root.querySelector("[data-growth-skill-remaining]");
    const summaryElement = root.querySelector("[data-growth-skill-summary]");

    if (spentElement) spentElement.textContent = String(total);
    if (remainingElement) remainingElement.textContent = String(remaining);

    if (summaryElement) {
      summaryElement.classList.toggle(
        "is-complete",
        Boolean(activePackage) && total === activePackage.remaining
      );

      summaryElement.classList.toggle(
        "is-over",
        Boolean(activePackage) && total > activePackage.remaining
      );
    }
  }

  async _prepareContext() {
    const packageEntry = getNextTamerGrowthPackage(this.actor);
    const attributeCap = getTamerAttributeCap(this.actor);
    const draftSkillTotal = this._getDraftSkillTotal();

    const attributes = Object.entries(this.actor.system?.attributes ?? {})
      .map(([key, attribute]) => {
        const value = integer(attribute?.value, 0);

        return {
          key,
          label: localize(attribute?.label ?? key, key),
          value,
          cap: attributeCap,
          canIncrease: value < attributeCap,
          selected: this._draft.attributeKey === key
        };
      });

    const skills = Object.entries(this.actor.system?.skills ?? {})
      .map(([key, skill]) => {
        const value = integer(skill?.value, 0);
        const cap = getTamerSkillCap(this.actor, key);
        const maxIncrease = Math.max(0, cap - value);

        const draftValue = Math.min(
          maxIncrease,
          integer(this._draft.skills[key], 0)
        );

        this._draft.skills[key] = draftValue;

        return {
          key,
          label: localize(skill?.label ?? key, key),
          value,
          cap,
          maxIncrease,
          draftValue,
          canIncrease: maxIncrease > 0
        };
      })
      .sort((left, right) => {
        return left.label.localeCompare(right.label, game.i18n?.lang);
      });

    const points = integer(packageEntry?.remaining, 0);

    const experiencedReward =
      getExperiencedRewardState(
        this.actor
      );

    const experiencedSkills =
      skills.filter(
        (skill) =>
          skill.canIncrease
      );

    return {
      actorName: this.actor?.name ?? "",
      actorImg: this.actor?.img ?? "icons/svg/mystery-man.svg",
      canSpend: this._canSpendGrowthPoints(),
      hasPackage: Boolean(packageEntry),

      experiencedReward: {
        ...experiencedReward,

        skills:
          experiencedSkills,

        hasEligibleSkills:
          experiencedSkills.length > 0
      },

      hasExperiencedReward:
        experiencedReward.pending,

      modeAttribute: this._draft.mode === "attribute",
      modeSkills: this._draft.mode === "skills",

      attributes,
      skills,
      attributeCap,

      growthPointsAvailable: integer(
        this.actor.system?.advancement?.growthPoints?.available,
        0
      ),

      package: packageEntry
        ? {
            ...packageEntry,
            scopeLabel: getScopeLabel(packageEntry.scope)
          }
        : null,

      draftSkillTotal,
      draftSkillRemaining: Math.max(0, points - draftSkillTotal),

      labels: {
        title: localize("DDA.TamerAdvancement.Title", "Tamer Advancement"),

        subtitle: localize(
          "DDA.TamerAdvancement.Subtitle",
          "Spend one complete Growth Point package from a released Milestone."
        ),

        experiencedTitle:
          localize(
            "DDA.TamerTalent.Experienced.RewardTitle",
            "Experienced — Extra Skill Point"
          ),

        experiencedHint:
          localize(
            "DDA.TamerTalent.Experienced.RewardHint",
            "Choose one Skill to increase by +1. Outside Character Creation, the Skill still obeys its current cap."
          ),

        experiencedSkill:
          localize(
            "DDA.TamerTalent.Experienced.ChooseSkill",
            "Choose Skill"
          ),

        experiencedClaim:
          localize(
            "DDA.TamerTalent.Experienced.Claim",
            "Apply +1 Skill Point"
          ),

        experiencedMarkApplied:
          localize(
            "DDA.TamerTalent.Experienced.MarkApplied",
            "Already Applied"
          ),

        experiencedNoSkills:
          localize(
            "DDA.TamerTalent.Experienced.NoEligibleSkills",
            "No Skill can currently be increased. Raise an associated Attribute or mark the reward as already applied."
          ),

        growthPoints: localize(
          "DDA.TamerSheet.GrowthPoints",
          "Growth Points"
        ),

        package: localize(
          "DDA.TamerAdvancement.Package",
          "Growth Package"
        ),

        packagePoints: format(
          "DDA.TamerAdvancement.PackagePoints",
          { points },
          `${points} Growth Points`
        ),

        attributes: localize(
          "DDA.TamerSheet.Attributes",
          "Attributes"
        ),

        skills: localize(
          "DDA.TamerSheet.Skills",
          "Skills"
        ),

        attributeChoice: localize(
          "DDA.TamerAdvancement.AttributeChoice",
          "Increase one Attribute by +1"
        ),

        attributeHint: format(
          "DDA.TamerAdvancement.AttributeHint",
          { points },
          `This consumes all ${points} Growth Points in the package.`
        ),

        skillChoice: localize(
          "DDA.TamerAdvancement.SkillChoice",
          "Distribute points among Skills"
        ),

        skillHint: format(
          "DDA.TamerAdvancement.SkillHint",
          { points },
          `Allocate exactly ${points} Growth Points. Each Skill is capped by its highest associated Attribute.`
        ),

        current: localize("DDA.Label.Current", "Current"),
        cap: localize("DDA.TamerSheet.AttributeCap", "Cap"),
        allocated: localize("DDA.TamerAdvancement.Allocated", "Allocated"),
        remaining: localize("DDA.Label.Remaining", "Remaining"),

        noPackage: localize(
          "DDA.TamerAdvancement.NoPackage",
          "This Tamer does not have a Growth Point package ready to spend."
        ),

        readOnly: localize(
          "DDA.TamerAdvancement.ReadOnly",
          "You do not have permission to spend this Tamer's Growth Points."
        ),

        spendPackage: format(
          "DDA.TamerAdvancement.SpendPackage",
          { points },
          `Spend ${points} Growth Points`
        ),
        modeTitle: localize(
          "DDA.TamerAdvancement.ModeTitle",
          "Choose how to spend this package"
        ),
        modeHint: format(
          "DDA.TamerAdvancement.ModeHint",
          { points },
          `A released Milestone grants ${points} Growth Points: either +1 Attribute or the same points distributed among Skills.`
        ),
        guideMode: localize(
          "DDA.TamerAdvancement.GuideMode",
          "Choose Attribute or Skills"
        ),
        guideSpend: localize(
          "DDA.TamerAdvancement.GuideSpend",
          "Review caps and allocate the package"
        ),
        guideApply: localize(
          "DDA.TamerAdvancement.GuideApply",
          "Confirm to spend the released Growth Points"
        )
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const root = this.element;
    if (!root) return;

    root.querySelectorAll("[data-growth-mode]").forEach((input) => {
      input.addEventListener("change", async (event) => {
        this._draft.mode = String(
          event.currentTarget.value ?? "attribute"
        );

        await this.render();
      });
    });

    root.querySelectorAll("[data-growth-skill]").forEach((input) => {
      input.addEventListener("input", (event) => {
        const skillKey = String(
          event.currentTarget.dataset.growthSkill ?? ""
        ).trim();

        if (!skillKey) return;

        const max = integer(event.currentTarget.max, 0);

        const value = Math.min(
          max,
          integer(event.currentTarget.value, 0)
        );

        event.currentTarget.value = String(value);
        this._draft.skills[skillKey] = value;

        this._refreshSkillBudgetPreview();
      });
    });
  }
}

export function openTamerAdvancement(actor) {
  const actorUuid = String(actor?.uuid ?? "").trim();

  if (!actorUuid) {
    throw new Error(
      "DDA | A valid Tamer Actor is required for advancement."
    );
  }

  const existing = OPEN_ADVANCEMENT_APPS.get(actorUuid);

  if (existing?.rendered) {
    existing.bringToFront();
    return existing;
  }

  const app = new DDATamerAdvancement(actor);

  OPEN_ADVANCEMENT_APPS.set(actorUuid, app);

  app.addEventListener("close", () => {
    OPEN_ADVANCEMENT_APPS.delete(actorUuid);
  });

  app.render(true);

  return app;
}