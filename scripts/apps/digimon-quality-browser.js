import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";

export function buildQualityItemData(quality) {
    return {
    name: quality.name,
    type: "quality",
    img: "icons/svg/book.svg",
    system: {
      sourceId: quality.id,
      originalName: quality.originalName ?? "",
      tier: quality.tier ?? "starting",
      originalTier: quality.originalTier ?? "",
      availability: quality.availability ?? {},
      section: quality.section ?? "",
      category: quality.category ?? {},
      cost: quality.cost ?? {},
      rank: quality.rank ?? {},
      rankLimit: quality.rankLimit ?? null,
      statRankRequirement: quality.statRankRequirement ?? {},
      stageRequirement: quality.stageRequirement ?? {},
      requirements: quality.requirements ?? {},
      incompatible: quality.incompatible ?? {},
      requiredFor: quality.requiredFor ?? [],
      choices: quality.choices ?? {},
      attackModifier: quality.attackModifier ?? {},
      grants: quality.grants ?? {},
      activation: quality.activation ?? {},
      uses: quality.uses ?? {},
      effect: quality.effect ?? "",
      description: quality.description ?? ""
    }
  };
}

export class DDADigimonQualityBrowser extends Application {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.activeTier = "all";
    this.searchTerm = "";
  }

static get defaultOptions() {
  const viewportHeight = Number(globalThis?.innerHeight ?? 820);
  const safeHeight = Math.min(720, Math.max(520, viewportHeight - 96));

  return foundry.utils.mergeObject(super.defaultOptions, {
    id: "dda-digimon-quality-browser",
    title: game.i18n.localize("DDA.QualityBrowser.Title"),
    template: "systems/digimon-digital-adventures/templates/apps/digimon-quality-browser.html",
    width: 760,
    height: safeHeight,
    resizable: true,
    scrollY: [".quality-browser-list"],
    classes: ["dda", "quality-browser-window"]
  });
}

  _normalizeSearchText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  _getSearchTerms(searchTerm) {
    const stopWords = new Set([
      "a", "o", "as", "os",
      "um", "uma", "uns", "umas",
      "de", "da", "do", "das", "dos",
      "em", "no", "na", "nos", "nas",
      "para", "por", "com", "e", "ou"
    ]);

    return this._normalizeSearchText(searchTerm)
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !stopWords.has(term));
  }

  _matchesQualitySearch(quality, searchTerm) {
    const query = this._normalizeSearchText(searchTerm);

    if (!query) return true;

    const terms = this._getSearchTerms(query);

    const nameHaystack = this._normalizeSearchText([
      quality.name,
      quality.originalName
    ]
      .filter(Boolean)
      .join(" "));

    const metaHaystack = this._normalizeSearchText([
      quality.section,
      quality.availability?.label,
      quality.category?.label,
      quality.requirements?.text,
      quality.incompatible?.text
    ]
      .filter(Boolean)
      .join(" "));

    const fullHaystack = this._normalizeSearchText([
      quality.name,
      quality.originalName,
      quality.section,
      quality.availability?.label,
      quality.category?.label,
      quality.requirements?.text,
      quality.incompatible?.text,
      quality.effect,
      quality.description
    ]
      .filter(Boolean)
      .join(" "));

    // 1. Exact phrase in name/original name.
    if (nameHaystack.includes(query)) return true;

    // 2. Exact phrase in important metadata.
    if (metaHaystack.includes(query)) return true;

    // 3. Exact phrase in full text.
    if (fullHaystack.includes(query)) return true;

    // 4. If the search only had irrelevant words, do not force a result.
    if (!terms.length) return false;

    // 5. Name/original: all relevant words must appear.
    if (terms.every((term) => nameHaystack.includes(term))) return true;

    // 6. Full text: all relevant words must appear.
    return terms.every((term) => fullHaystack.includes(term));
  }

  getData() {
    const tiers = [
      { key: "all", label: "DDA.QualityBrowser.Filter.All" },
      { key: "starting", label: "DDA.QualityBrowser.Filter.Starting" },
      { key: "champion", label: "DDA.QualityBrowser.Filter.Adult" },
      { key: "perfect", label: "DDA.QualityBrowser.Filter.Perfect" },
      { key: "mega", label: "DDA.QualityBrowser.Filter.Mega" },
      { key: "free", label: "DDA.QualityBrowser.Filter.Free" },
      { key: "negative", label: "DDA.QualityBrowser.Filter.Negative" }
    ];

    const term = this.searchTerm;

    const qualities = DDA_DIGIMON_QUALITIES
      .filter((quality) => {
        if (this.activeTier !== "all" && quality.tier !== this.activeTier) return false;

        return this._matchesQualitySearch(quality, term);
      })

      .map((quality) => {
        const ownedItem = this.actor?.items?.find((item) => {
          return item.type === "quality" && item.system?.sourceId === quality.id;
        });

        const owned = Boolean(ownedItem);
        const currentRank = Number(ownedItem?.system?.rank?.value ?? 1);
        const effectiveMax = this._getQualityEffectiveMax(quality, ownedItem);
        const canIncreaseRank = owned && effectiveMax > currentRank;
                    const isRanked = Boolean(
          quality.cost?.perRank ||
          quality.rankLimit ||
          Number(quality.rank?.max ?? 1) > 1
        );

        const showRankInfo = Boolean(
          isRanked &&
          (
            owned ||
            effectiveMax > 1 ||
            quality.rankLimit
          )
        );

        const rankDisplayValue = owned
          ? currentRank
          : Number(quality.rank?.value ?? 1);

        const rankLabel = effectiveMax > 0
          ? game.i18n.format("DDA.QualityBrowser.RankProgress", {
              rank: rankDisplayValue,
              max: effectiveMax
            })
          : game.i18n.format("DDA.QualityBrowser.RankValue", {
              rank: rankDisplayValue
            });
            const canBuy = this._canActorBuyQuality(quality);


        return {
          ...quality,
          owned,
          ownedItemId: ownedItem?.id ?? "",
          currentRank,
          effectiveMax,
          canIncreaseRank,
          isRanked,
          showRankInfo,
          rankLabel,
          canBuy,
          blockedReason: owned ? "" : this._getBlockedReason(quality),
          costLabel: this._getCostLabel(quality),
          tierLabel: this._getTierLabel(quality),
          isNegative: quality.tier === "negative",
          isFree: quality.tier === "free"
                };
      });

    return {
      actor: this.actor,
      tiers,
      activeTier: this.activeTier,
      searchTerm: this.searchTerm,
      qualities
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-tier-filter]").on("click", (event) => {
      event.preventDefault();
      this.activeTier = event.currentTarget.dataset.tierFilter;
      this.render();
      });

    html.find("[data-quality-search]").on("keydown", (event) => {
  if (event.key !== "Enter") return;

  event.preventDefault();

  this.searchTerm = event.currentTarget.value ?? "";
  this.render();
      });

    html.find("[data-add-quality]").on("click", async (event) => {
  event.preventDefault();

  const button = event.currentTarget;
  const qualityId = button.dataset.addQuality;
  const ownedItemId = button.dataset.ownedItemId;

  const quality = DDA_DIGIMON_QUALITIES.find((entry) => entry.id === qualityId);

  if (!quality) {
    ui.notifications.warn(game.i18n.localize("DDA.Warning.QualityNotFound"));
    return;
  }

  if (ownedItemId) {
    await this._increaseQualityRank(ownedItemId);
    return;
  }

  await this._addQualityToActor(quality);
      });

    html.find("[data-close-quality-browser]").on("click", (event) => {
  event.preventDefault();
  this.close();
      });

  }

  async _addQualityToActor(quality) {
    if (!this.actor) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.NoDigimonSelected"));
      return;
    }

    const existing = this.actor.items.find((item) => {
      return item.type === "quality" && item.system?.sourceId === quality.id;
    });

    if (existing) {
      ui.notifications.warn(game.i18n.format("DDA.Warning.QualityAlreadyOnSheet", {
        quality: quality.name
      }));
      return;
    }

    if (!this._canActorBuyQuality(quality)) {
      ui.notifications.warn(this._getBlockedReason(quality));
      return;
    }

    const itemData = buildQualityItemData(quality);

    if (quality.choices?.required) {
      const choice = await this._promptQualityChoice(quality, 1, []);

      if (!choice) return;

      itemData.system.choices = {
        ...(itemData.system.choices ?? {}),
        selectedRanks: [choice]
      };
    }

    const [createdQuality] = await this.actor.createEmbeddedDocuments("Item", [itemData]);
    if (quality.choices?.type !== "attackTag") {
  await this._applyAttackChoiceToAttack(createdQuality, itemData.system?.choices?.selectedRanks?.[0]);
}

    ui.notifications.info(game.i18n.format("DDA.QualityBrowser.AddedToSheet", {
      quality: quality.name
    }));

    this.render();
  }

async _promptQualityChoice(quality, rankNumber, existingChoices = []) {
  const choices = quality.choices ?? {};

  if (!choices.required) {
    return null;
  }

  const isAttackChoice = ["singleAttack", "attackTag"].includes(choices.type);
  const options = isAttackChoice
    ? this._getAttackChoiceOptionsForQuality(quality, existingChoices)
    : Array.isArray(choices.options) ? choices.options : [];

  if (!options.length) {
    ui.notifications.warn(game.i18n.format(isAttackChoice ? "DDA.Warning.QualityChoiceHasNoAttacks" : "DDA.Warning.QualityChoiceHasNoOptions", {
      quality: quality.name
    }));
    return null;
  }

  const usedKeys = new Set(
    existingChoices
      .map((choice) => isAttackChoice ? choice.attackId : choice.key)
      .filter(Boolean)
  );

  const availableOptions = options.filter((option) => {
    if (!choices.cannotRepeat && !isAttackChoice) return true;
    const key = isAttackChoice ? option.attackId : option.key;
    return !usedKeys.has(key);
  });

    if (!availableOptions.length) {
      ui.notifications.warn(game.i18n.format("DDA.Warning.QualityNoAvailableOptions", {
        quality: quality.name
      }));
      return null;
    }

    const optionHtml = availableOptions
      .map((option) => {
        const label = option.label ?? option.key;
        

        return `
          <option value="${option.key}">
            ${label}
          </option>
        `;
      })
      .join("");

    const selectedKey = await new Promise((resolve) => {
      new Dialog({
        title: game.i18n.format("DDA.QualityBrowser.ChoiceDialogTitle", {
          quality: quality.name,
          rank: rankNumber
        }),
        content: `
          <form class="dda-quality-choice-form">
            <div class="form-group">
              <label>${choices.label ?? game.i18n.localize("DDA.QualityBrowser.Choice")}</label>
              <select name="choiceKey">
                ${optionHtml}
              </select>
            </div>

            <p class="notes">
              ${game.i18n.format("DDA.QualityBrowser.ChoiceRegisteredRank", {
                rank: rankNumber
              })}
            </p>
          </form>
        `,
        buttons: {
          confirm: {
            label: game.i18n.localize("DDA.Button.Confirm"),
            callback: (html) => {
              const value = html.find("[name='choiceKey']").val();
              resolve(value);
            }
          },
          cancel: {
            label: game.i18n.localize("DDA.Button.Cancel"),
            callback: () => resolve(null)
          }
        },
        close: () => resolve(null),
        default: "confirm"
      }).render(true);
    });

    if (!selectedKey) return null;

    const selectedOption = availableOptions.find((option) => option.key === selectedKey);

    if (!selectedOption) return null;

return {
  rank: rankNumber,
  key: selectedOption.key,
  label: selectedOption.label ?? selectedOption.key,
  originalLabel: selectedOption.originalLabel ?? "",
  derivedStat: selectedOption.derivedStat ?? "",
  attackId: selectedOption.attackId ?? "",
  attackName: selectedOption.attackName ?? "",
  attackTag: selectedOption.attackTag ?? "",
  effect: selectedOption.effect ?? ""
};
  }



  async _applyAttackChoiceToAttack(qualityItem, choice) {
    if (!choice?.attackId || !choice?.attackTag) return;

    const attack = this.actor?.items?.get(choice.attackId);
    if (!attack || attack.type !== "attack") return;

    const currentTags = Array.isArray(attack.system?.qualityTags)
      ? foundry.utils.deepClone(attack.system.qualityTags)
      : [];
    const normalizedTag = String(choice.attackTag).toLowerCase();

    if (!currentTags.map((tag) => String(tag).toLowerCase()).includes(normalizedTag)) {
      currentTags.push(normalizedTag);
      await attack.update({ "system.qualityTags": currentTags });
    }
  }

_getAttackChoiceOptionsForQuality(quality, existingChoices = []) {
  const attacks = this.actor?.items?.filter((item) => item.type === "attack") ?? [];
  const modifier = quality.attackModifier ?? {};
  const grantsTags = Array.isArray(modifier.grantsTags) ? modifier.grantsTags : [];
  const primaryTag = grantsTags[0] ?? quality.id ?? "quality";
  const normalizedPrimaryTag = String(primaryTag).toLowerCase();
  const appliesTo = String(modifier.appliesTo ?? "oneAttack");

  const usedAttackIds = new Set(
    existingChoices
      .map((choice) => choice.attackId)
      .filter(Boolean)
  );

  const areaOptions = Array.isArray(quality.choices?.options)
    ? quality.choices.options.filter((option) => String(option.key ?? "").trim())
    : [];

  if (modifier.areaAttack || grantsTags.some((tag) => String(tag).toLowerCase().startsWith("t:"))) {
    return areaOptions.flatMap((option) => {
      const areaTag = `t:${String(option.key ?? "").replace(/^t:/i, "").toLowerCase()}`;
      const appliesToOption = String(option.appliesTo ?? "");

      return attacks
        .filter((attack) => this._attackMatchesAreaOption(attack, appliesToOption))
        .filter((attack) => !usedAttackIds.has(attack.id))
        .filter((attack) => {
          const tags = [
            ...(Array.isArray(attack.system?.qualityTags) ? attack.system.qualityTags : []),
            ...(Array.isArray(attack.system?.tags) ? attack.system.tags : [])
          ].map((tag) => String(tag).toLowerCase());

          return !tags.includes(areaTag);
        })
        .map((attack) => ({
          key: `${attack.id}:${areaTag}`,
          label: `${attack.name} — [${areaTag.toUpperCase()}]`,
          originalLabel: attack.name,
          attackId: attack.id,
          attackName: attack.name,
          attackTag: areaTag,
          derivedStat: option.derivedStat ?? "",
          effect: option.effect ?? game.i18n.format("DDA.QualityBrowser.AttackChoiceEffect", {
            attack: attack.name,
            tag: `[${areaTag.toUpperCase()}]`
          })
        }));
    });
  }

  return attacks
    .filter((attack) => this._attackMatchesQualityAppliesTo(attack, appliesTo))
    .filter((attack) => !usedAttackIds.has(attack.id))
    .filter((attack) => {
      const tags = [
        ...(Array.isArray(attack.system?.qualityTags) ? attack.system.qualityTags : []),
        ...(Array.isArray(attack.system?.tags) ? attack.system.tags : [])
      ].map((tag) => String(tag).toLowerCase());

      return !tags.includes(normalizedPrimaryTag);
    })
    .map((attack) => ({
      key: `${attack.id}:${normalizedPrimaryTag}`,
      label: `${attack.name} — [${String(normalizedPrimaryTag).toUpperCase()}]`,
      originalLabel: attack.name,
      attackId: attack.id,
      attackName: attack.name,
      attackTag: normalizedPrimaryTag,
      effect: game.i18n.format("DDA.QualityBrowser.AttackChoiceEffect", {
        attack: attack.name,
        tag: `[${String(normalizedPrimaryTag).toUpperCase()}]`
      })
    }));
}

  _attackMatchesAreaOption(attack, appliesTo = "") {
    const rangeType = String(attack.system?.baseTags?.rangeType ?? "")
      .trim()
      .toLowerCase();

    const functionType = String(attack.system?.baseTags?.functionType ?? "")
      .trim()
      .toLowerCase();

    const option = String(appliesTo ?? "")
      .trim()
      .toLowerCase();

    if (!option) return true;

    if (option === "rangeattack" || option === "rangedattack") {
      return ["range", "ranged"].includes(rangeType);
    }

    if (option === "meleeattack") {
      return rangeType === "melee";
    }

    if (option === "meleeorrangeattack" || option === "meleeorrangedattack") {
      return rangeType === "melee" || ["range", "ranged"].includes(rangeType);
    }

    if (option === "damageattack") {
      return functionType === "damage";
    }

    if (option === "supportattack") {
      return functionType === "support";
    }

    return this._attackMatchesQualityAppliesTo(attack, appliesTo);
  }

  _attackMatchesQualityAppliesTo(attack, appliesTo = "") {
    const rangeType = String(attack.system?.baseTags?.rangeType ?? "");
    const functionType = String(attack.system?.baseTags?.functionType ?? "");

    if (appliesTo === "oneDamageAttack" || appliesTo === "damage") return functionType === "damage";
    if (appliesTo === "oneMeleeAttack" || appliesTo === "melee") return rangeType === "melee";
    if (appliesTo === "oneRangedAttack" || appliesTo === "range" || appliesTo === "ranged") return ["range", "ranged"].includes(rangeType);

    return true;
  }

  async _increaseQualityRank(itemId) {
    const item = this.actor?.items?.get(itemId);

    if (!item) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.QualityNotFoundOnSheet"));
      return;
    }

    const quality = DDA_DIGIMON_QUALITIES.find((entry) => {
      return entry.id === item.system?.sourceId || entry.name === item.name;
    });

    const currentRank = Number(item.system?.rank?.value ?? 1);
    const effectiveMax = this._getQualityEffectiveMax(quality, item);

    if (currentRank >= effectiveMax) {
      ui.notifications.warn(game.i18n.format("DDA.Warning.QualityAlreadyAtMaxRank", {
        quality: item.name
      }));
      return;
    }

    const nextRank = currentRank + 1;
    const existingChoices = Array.isArray(item.system?.choices?.selectedRanks)
      ? foundry.utils.deepClone(item.system.choices.selectedRanks)
      : [];

    const updateData = {
      "system.rank.value": nextRank
    };

    if (quality?.choices?.required) {
      const choice = await this._promptQualityChoice(quality, nextRank, existingChoices);

      if (!choice) return;

      existingChoices.push(choice);
      updateData["system.choices.selectedRanks"] = existingChoices;
    }

    await item.update(updateData);
    if (quality?.choices?.type !== "attackTag") {
  await this._applyAttackChoiceToAttack(item, updateData["system.choices.selectedRanks"]?.at?.(-1));
}

    ui.notifications.info(game.i18n.format("DDA.QualityBrowser.RankIncreased", {
      quality: item.name,
      rank: nextRank
    }));

    this.render();
  }

  _getActorDerivedStatValue(statKey) {
    const stat = this.actor?.system?.derivedStats?.[statKey];

    if (!stat) return 0;

    return Number(
      stat.total ??
      stat.value ??
      stat.max ??
      stat.base ??
      0
    );
  }

_getQualityEffectiveMax(quality, ownedItem = null) {
  const actorComputedEffectiveMax = Number(ownedItem?.system?.rank?.effectiveMax ?? Number.NaN);

  if (Number.isFinite(actorComputedEffectiveMax) && actorComputedEffectiveMax >= 0) {
    return actorComputedEffectiveMax;
  }

  const rankLimit = quality.rankLimit ?? ownedItem?.system?.rankLimit ?? null;

if (this._isAccelerateQuality(quality, ownedItem)) {
  return this._getActorDerivedStatValue("ram");
}

  if (rankLimit?.type === "derivedStat") {
    return this._getActorDerivedStatValue(rankLimit.stat);
  }

  if (rankLimit?.type === "byStage" || rankLimit?.type === "byStageMaxFour") {
    const stage = this.actor?.system?.stage ?? "";
    const byStage = rankLimit.byStage ?? {};

    return Number(byStage[stage] ?? quality.rank?.max ?? 1);
  }

  return Number(
    ownedItem?.system?.rank?.max ??
    quality.rank?.max ??
    1
  );
}

_isAccelerateQuality(quality, ownedItem = null) {
  const candidates = [
    quality?.id,
    quality?.name,
    quality?.originalName,
    ownedItem?.system?.sourceId,
    ownedItem?.system?.id,
    ownedItem?.name
  ];

  return candidates.some((candidate) => {
    const normalized = String(candidate ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();

    return normalized === "acelerar" || normalized === "accelerate";
  });
}

  _getQualityMinimumStageValue(quality) {
    const stageOrder = {
      baby1: 0,
      baby2: 1,
      child: 2,
      adult: 3,
      perfect: 4,
      mega: 5
    };

    const minimumStage = quality.stageRequirement?.minimum || quality.availability?.minimumStage || "";

    if (!minimumStage) return 0;

    return stageOrder[minimumStage] ?? 0;
  }

  _getActorQualityNames() {
    if (!this.actor) return [];

    return this.actor.items
      .filter((item) => item.type === "quality")
      .map((item) => item.name)
      .filter(Boolean);
  }

  _parseRequiredQualityNames(quality) {
    const raw = quality.requirements?.qualityNames ?? "";

    if (!raw) return [];

    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  _actorHasRequiredQualities(quality) {
    const requiredNames = this._parseRequiredQualityNames(quality);

    if (!requiredNames.length) return true;

    const actorQualityNames = this._getActorQualityNames();

    return requiredNames.every((requiredName) => {
      return actorQualityNames.includes(requiredName);
    });
  }

  _getMissingRequiredQualities(quality) {
    const requiredNames = this._parseRequiredQualityNames(quality);

    if (!requiredNames.length) return [];

    const actorQualityNames = this._getActorQualityNames();

    return requiredNames.filter((requiredName) => {
      return !actorQualityNames.includes(requiredName);
    });
  }

  _parseIncompatibleQualityNames(quality) {
    const raw = quality.incompatible?.qualityNames ?? "";

    if (!raw) return [];

    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  _getConflictingQualities(quality) {
    const incompatibleNames = this._parseIncompatibleQualityNames(quality);

    if (!incompatibleNames.length) return [];

    const actorQualityNames = this._getActorQualityNames();

    return incompatibleNames.filter((incompatibleName) => {
      return actorQualityNames.includes(incompatibleName);
    });
  }

  _actorHasIncompatibleQualities(quality) {
    return this._getConflictingQualities(quality).length > 0;
  }

  _getActorRemainingDp() {
    if (!this.actor) return 0;

    return Number(this.actor.system?.creation?.dp?.remaining ?? 0);
  }

  _getQualityDpCost(quality) {
    const dp = Number(quality.cost?.dp ?? 0);

    if (quality.tier === "free") return 0;
    if (quality.tier === "negative") return 0;

    return Math.max(dp, 0);
  }


  _actorHasEnoughDp(quality) {
    const cost = this._getQualityDpCost(quality);

    if (cost <= 0) return true;

    return this._getActorRemainingDp() >= cost;
  }

    _getActorFreeQualityLimit() {
    return Number(this.actor?.system?.qualityLimits?.freeQualities?.max ?? 0);
  }

  _getActorFreeQualityUsed() {
    return Number(this.actor?.system?.qualityLimits?.freeQualities?.used ?? 0);
  }

  _actorCanTakeFreeQuality(quality) {
    if (quality.tier !== "free") return true;

    const limit = this._getActorFreeQualityLimit();

    if (limit <= 0) return true;

    return this._getActorFreeQualityUsed() < limit;
  }

  _getActorNegativeDpLimit() {
    return Number(this.actor?.system?.qualityLimits?.negativeDp?.max ?? 0);
  }

  _getActorNegativeDpUsed() {
    return Number(this.actor?.system?.qualityLimits?.negativeDp?.used ?? 0);
  }

  _getNegativeQualityDpValue(quality) {
    if (quality.tier !== "negative") return 0;

    return Math.abs(Number(quality.cost?.dp ?? 0));
  }

  _actorCanTakeNegativeQuality(quality) {
    if (quality.tier !== "negative") return true;

    const limit = this._getActorNegativeDpLimit();

    if (limit <= 0) return true;

    const used = this._getActorNegativeDpUsed();
    const value = this._getNegativeQualityDpValue(quality);

    return used + value <= limit;
  }


  _canActorBuyQuality(quality) {
    if (!this.actor) return false;

    const actorStageValue = Number(this.actor.system?.stageValue ?? 0);
    const minimumStageValue = this._getQualityMinimumStageValue(quality);

    if (actorStageValue < minimumStageValue) return false;

    if (!this._actorHasRequiredQualities(quality)) return false;

    if (this._actorHasIncompatibleQualities(quality)) return false;

    if (!this._actorHasEnoughDp(quality)) return false;

    if (!this._actorCanTakeFreeQuality(quality)) return false;

    if (!this._actorCanTakeNegativeQuality(quality)) return false;

    return true;
  }


  _getBlockedReason(quality) {
    if (!this.actor) return game.i18n.localize("DDA.Warning.NoDigimonSelected");

    const actorStageValue = Number(this.actor.system?.stageValue ?? 0);
    const minimumStageValue = this._getQualityMinimumStageValue(quality);

    if (actorStageValue < minimumStageValue) {
      return game.i18n.format("DDA.QualityBrowser.BlockedReason.RequiresStage", {
        stage: quality.availability?.label ?? game.i18n.localize("DDA.QualityBrowser.HigherStage")
      });
    }

    const missing = this._getMissingRequiredQualities(quality);

    if (missing.length) {
      return game.i18n.format("DDA.QualityBrowser.BlockedReason.RequiresQualities", {
        qualities: missing.join(", ")
      });
    }

    const conflicts = this._getConflictingQualities(quality);

    if (conflicts.length) {
      return game.i18n.format("DDA.QualityBrowser.BlockedReason.IncompatibleWith", {
        qualities: conflicts.join(", ")
      });
    }

    if (!this._actorHasEnoughDp(quality)) {
      const cost = this._getQualityDpCost(quality);
      const remaining = this._getActorRemainingDp();

      return game.i18n.format("DDA.QualityBrowser.BlockedReason.NotEnoughDP", {
        cost,
        remaining
      });
    }

    if (!this._actorCanTakeFreeQuality(quality)) {
      const used = this._getActorFreeQualityUsed();
      const limit = this._getActorFreeQualityLimit();

      return game.i18n.format("DDA.QualityBrowser.BlockedReason.FreeLimitReached", {
        used,
        limit
      });
    }

    if (!this._actorCanTakeNegativeQuality(quality)) {
      const used = this._getActorNegativeDpUsed();
      const limit = this._getActorNegativeDpLimit();
      const value = this._getNegativeQualityDpValue(quality);

      return game.i18n.format("DDA.QualityBrowser.BlockedReason.NegativeDPLimitExceeded", {
        used: used + value,
        limit
      });
    }

    return "";
  }


  _getCostLabel(quality) {
    const cost = quality.cost ?? {};
    const dp = Number(cost.dp ?? 0);

    if (quality.tier === "free") return game.i18n.localize("DDA.QualityBrowser.Cost.Free");
    if (quality.tier === "negative") return `${Math.abs(dp)} PD`;

    const suffix = cost.perRank ? ` / ${game.i18n.localize("DDA.QualitySheet.Rank")}` : "";
    return `${dp} PD${suffix}`;
  }

  _getTierLabel(quality) {
    const labels = {
      starting: "DDA.QualityBrowser.Tier.Starting",
      champion: "DDA.QualityBrowser.Tier.Champion",
      perfect: "DDA.QualityBrowser.Tier.Perfect",
      mega: "DDA.QualityBrowser.Tier.Mega",
      free: "DDA.QualityBrowser.Tier.Free",
      negative: "DDA.QualityBrowser.Tier.Negative"
    };

    const labelKey = labels[quality.tier];

    return labelKey
      ? game.i18n.localize(labelKey)
      : quality.availability?.label ?? game.i18n.localize("DDA.QualityBrowser.Tier.Starting");
  }
} 