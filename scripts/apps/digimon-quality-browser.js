import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
const NATUREWALK_MAIN_STATS = [
  {
    key: "accuracy",
    labelKey: "DDA.MainStat.Accuracy"
  },
  {
    key: "damage",
    labelKey: "DDA.MainStat.Damage"
  },
  {
    key: "dodge",
    labelKey: "DDA.MainStat.Dodge"
  },
  {
    key: "armor",
    labelKey: "DDA.MainStat.Armor"
  },
  {
    key: "health",
    labelKey: "DDA.MainStat.Health"
  }
];

function normalizeNaturewalkIdentity(
  value = ""
) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isNaturewalkQualityData(
  quality = {},
  ownedItem = null
) {
  const candidates = [
    quality?.id,
    quality?.name,
    quality?.originalName,

    ownedItem?.system?.sourceId,
    ownedItem?.system?.originalName,
    ownedItem?.name
  ];

  return candidates.some((candidate) => {
    return [
      "passonatural",
      "naturewalk"
    ].includes(
      normalizeNaturewalkIdentity(
        candidate
      )
    );
  });
}

function escapeNaturewalkHtml(
  value = ""
) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
const QUALITY_BROWSER_CATEGORY_FILTERS = [
  { key: "all", pt: "Todas as categorias", en: "All categories" },
  { key: "core", pt: "Centrais", en: "Core" },
  { key: "attack", pt: "Ataque", en: "Attack / Offensive" },
  { key: "defense", pt: "Defesa", en: "Defense" },
  { key: "clash", pt: "Clash", en: "Clash" },
  {
    key: "effect",
    pt: "Efeito e Conjuração",
    en: "Effect & Conjuration"
  },
  { key: "utility", pt: "Utilidade", en: "Utility" },
  {
    key: "stanceMode",
    pt: "Postura e Modo",
    en: "Stance & Mode"
  },
  { key: "digizoid", pt: "Digizoide", en: "Digizoid" }
];

const QUALITY_BROWSER_SECTION_GROUPS = {
  attack: [
    "Offensive Qualities",
    "Qualidades Ofensivas"
  ],

  defense: [
    "Defensive Qualities",
    "Qualidades Defensivas",
    "Preservation Qualities",
    "Qualidades de Preservação"
  ],

  clash: [
    "Clash Qualities",
    "Qualidades de Clash"
  ],

  effect: [
    "Effect Qualities",
    "Qualidades de Efeito",
    "Evoker Qualities",
    "Omnievoker Qualities",
    "Qualidades de Conjurador",
    "Qualidades de Conjuração"
  ],

  utility: [
    "Utility Qualities",
    "Qualidades Utilitárias"
  ],

  stanceMode: [
    "Stance Qualities",
    "Qualidades de Postura",
    "Mode Change Qualities",
    "Qualidades de Mudança de Modo"
  ],

  digizoid: [
    "Digizoid Armor",
    "Armaduras de Digizoide",
    "Digizoid Weaponry",
    "Armamentos de Digizoide"
  ]
};

function isQualityBrowserEnglish() {
  const language = String(
    game?.i18n?.lang ??
    game?.i18n?.language ??
    ""
  );

  return language.toLowerCase().startsWith("en");
}

function matchesQualityBrowserCategory(
  quality = {},
  categoryKey = "all"
) {
  if (categoryKey === "all") return true;

  const category = quality.category ?? {};
  const section = String(quality.section ?? "");

  if (categoryKey === "core") {
    return Boolean(category.core);
  }

  if (categoryKey === "attack") {
    return Boolean(category.attack) ||
      QUALITY_BROWSER_SECTION_GROUPS.attack
        .includes(section);
  }

  return QUALITY_BROWSER_SECTION_GROUPS[
    categoryKey
  ]?.includes(section) ?? false;
}
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

      superiorModeChange: {
        ...(quality.superiorModeChange ?? {}),

        enabled: Boolean(
          quality.superiorModeChange
        ),

        activeMode: "default",

        configuration: {
          complete: false,
          defaultCost: 0,
          modeCost: 0,
          defaultQualityIds: [],
          modeQualities: [],
          defaultAttackKeys: [],
          modeAttacks: [],

          ...(
            quality.superiorModeChange
              ?.configuration ?? {}
          )
        }
      },

      creation: quality.creation ?? {},

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
    this.activeCategory = "all";
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

_getQualitySearchScore(quality, searchTerm) {
  const query = this._normalizeSearchText(
    searchTerm
  );

  if (!query) return 0;

  const terms = this._getSearchTerms(query);

  const displayName = this._normalizeSearchText(
    quality.name
  );

  const originalName = this._normalizeSearchText(
    quality.originalName
  );

  const displayNameWords = new Set(
    displayName.split(/\s+/).filter(Boolean)
  );

  const originalNameWords = new Set(
    originalName.split(/\s+/).filter(Boolean)
  );

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

  /*
   * Quanto maior a pontuação, mais cedo a
   * Qualidade aparece nos resultados.
   */
  if (displayName === query) return 1000;
  if (originalName === query) return 950;

  if (displayName.startsWith(query)) return 900;
  if (originalName.startsWith(query)) return 850;

  if (
    terms.length &&
    terms.every((term) => {
      return displayNameWords.has(term);
    })
  ) {
    return 800;
  }

  if (
    terms.length &&
    terms.every((term) => {
      return originalNameWords.has(term);
    })
  ) {
    return 760;
  }

  if (displayName.includes(query)) return 700;
  if (originalName.includes(query)) return 650;

  if (metaHaystack.includes(query)) return 400;
  if (fullHaystack.includes(query)) return 200;

  if (!terms.length) return -1;

  if (
    terms.every((term) => {
      return nameHaystack.includes(term);
    })
  ) {
    return 150;
  }

  if (
    terms.every((term) => {
      return fullHaystack.includes(term);
    })
  ) {
    return 50;
  }

  return -1;
}

_matchesQualitySearch(quality, searchTerm) {
  if (!this._normalizeSearchText(searchTerm)) {
    return true;
  }

  return this._getQualitySearchScore(
    quality,
    searchTerm
  ) >= 0;
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

        const categories =
      QUALITY_BROWSER_CATEGORY_FILTERS.map(
        (category) => ({
          key: category.key,

          label: isQualityBrowserEnglish()
            ? category.en
            : category.pt
        })
      );

    const term = this.searchTerm;

    const qualities = DDA_DIGIMON_QUALITIES
      .filter((quality) => {
        if (
          this.activeTier !== "all" &&
          quality.tier !== this.activeTier
        ) {
          return false;
        }

        if (
          !matchesQualityBrowserCategory(
            quality,
            this.activeCategory
          )
        ) {
          return false;
        }

        return this._matchesQualitySearch(
          quality,
          term
        );
      })
      .sort((left, right) => {
        if (!String(term ?? "").trim()) {
          return 0;
        }

        const scoreDifference =
          this._getQualitySearchScore(
            right,
            term
          ) -
          this._getQualitySearchScore(
            left,
            term
          );

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return String(left.name ?? "").localeCompare(
          String(right.name ?? ""),
          game.i18n.lang
        );
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
      categories,
      activeTier: this.activeTier,
      activeCategory: this.activeCategory,
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

    html.find("[data-category-filter]").on(
      "click",
      (event) => {
        event.preventDefault();

        this.activeCategory =
          event.currentTarget
            .dataset
            .categoryFilter ?? "all";

        this.render();
      }
    );
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

const [createdQuality] =
  await this.actor.createEmbeddedDocuments(
    "Item",
    [itemData]
  );

await this._applyAttackChoiceToAttack(
  createdQuality,
  itemData.system?.choices?.selectedRanks?.[0]
);

    ui.notifications.info(game.i18n.format("DDA.QualityBrowser.AddedToSheet", {
      quality: quality.name
    }));

    this.render();
  }

    _actorMeetsChoiceOptionRequirements(option = {}) {
    const raw = String(
      option.requirements?.qualityNames ?? ""
    ).trim();

    if (!raw) return true;

    const requiredNames = raw
      .split(/[,;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const actorQualityNames = new Set(
      this._getActorQualityNames().map((name) => {
        return this._normalizeSearchText(name);
      })
    );

    const matches = requiredNames.map((requiredName) => {
      return actorQualityNames.has(
        this._normalizeSearchText(requiredName)
      );
    });

    return option.requirements?.mode === "any"
      ? matches.some(Boolean)
      : matches.every(Boolean);
  }

async _promptQualityChoice(quality, rankNumber, existingChoices = []) {
  const choices = quality.choices ?? {};

  if (!choices.required) {
    return null;
  }

const modifier =
  quality.attackModifier ?? {};

const grantsTags =
  Array.isArray(
    modifier.grantsTags
  )
    ? modifier.grantsTags
    : [];

const isAreaAttackChoice =
  quality.id === "areaDeAtaque" ||
  Boolean(
    modifier.areaAttack
  ) ||
  (
    String(
      modifier.appliesTo ?? ""
    ) === "differentAttackPerRank" &&

    grantsTags.some((tag) => {
      return String(tag)
        .trim()
        .toLowerCase()
        .startsWith("t:");
    })
  );

const isAttackChoice =
  isAreaAttackChoice ||
  [
    "singleAttack",
    "attackTag",
    "effectTagPerRank"
  ].includes(
    choices.type
  );

  const options = (
    isAttackChoice
      ? this._getAttackChoiceOptionsForQuality(
          quality,
          existingChoices
        )
      : Array.isArray(choices.options)
        ? choices.options
        : []
  ).filter((option) => {
    return this._actorMeetsChoiceOptionRequirements(
      option
    );
  });

  if (!options.length) {
    ui.notifications.warn(game.i18n.format(isAttackChoice ? "DDA.Warning.QualityChoiceHasNoAttacks" : "DDA.Warning.QualityChoiceHasNoOptions", {
      quality: quality.name
    }));
    return null;
  }

const usedKeys = new Set(
  existingChoices
    .map((choice) => {
      return choice.key;
    })
    .filter(Boolean)
);

const availableOptions =
  isAttackChoice
    ? options
    : options.filter((option) => {
        if (!choices.cannotRepeat) {
          return true;
        }

        return !usedKeys.has(
          option.key
        );
      });

    if (!availableOptions.length) {
      ui.notifications.warn(
        game.i18n.format(
          "DDA.Warning.QualityNoAvailableOptions",
          {
            quality:
              quality.name
          }
        )
      );

      return null;
    }

    /*
     * Naturewalk exige duas escolhas por Rank:
     *
     * 1. Um Elemento ainda não escolhido.
     * 2. Um Core Stat que receberá +1.
     */
    if (
      isNaturewalkQualityData(
        quality
      )
    ) {
      const elementOptionsHtml =
        availableOptions
          .map((option) => {
            const label =
              option.label ??
              option.originalLabel ??
              option.key;

            return `
              <option value="${escapeNaturewalkHtml(
                option.key
              )}">
                ${escapeNaturewalkHtml(
                  label
                )}
              </option>
            `;
          })
          .join("");

      const mainStatOptionsHtml =
        NATUREWALK_MAIN_STATS
          .map((stat) => {
            return `
              <option value="${stat.key}">
                ${escapeNaturewalkHtml(
                  game.i18n.localize(
                    stat.labelKey
                  )
                )}
              </option>
            `;
          })
          .join("");

      let selection =
        null;

      try {
        selection =
          await foundry
            .applications
            .api
            .DialogV2
            .prompt({
              window: {
                title:
                  game.i18n.format(
                    "DDA.QualityBrowser.ChoiceDialogTitle",
                    {
                      quality:
                        quality.name,

                      rank:
                        rankNumber
                    }
                  )
              },

              content: `
                <div class="dda-quality-choice-form dda-naturewalk-choice-dialog">
                  <p>
                    ${game.i18n.format(
                      "DDA.Naturewalk.ChoiceHint",
                      {
                        rank:
                          rankNumber
                      }
                    )}
                  </p>

                  <div class="form-group">
                    <label>
                      ${game.i18n.localize(
                        "DDA.Naturewalk.Element"
                      )}
                    </label>

                    <select name="elementKey">
                      ${elementOptionsHtml}
                    </select>
                  </div>

                  <div class="form-group">
                    <label>
                      ${game.i18n.localize(
                        "DDA.Naturewalk.CoreStat"
                      )}
                    </label>

                    <select name="mainStat">
                      ${mainStatOptionsHtml}
                    </select>
                  </div>

                  <p class="notes">
                    ${game.i18n.localize(
                      "DDA.Naturewalk.CoreStatHint"
                    )}
                  </p>
                </div>
              `,

              ok: {
                label:
                  game.i18n.localize(
                    "DDA.Button.Confirm"
                  ),

                callback:
                  (_event, button) => {
                    return {
                      elementKey:
                        String(
                          button.form
                            .elements
                            .elementKey
                            ?.value ??
                          ""
                        ).trim(),

                      mainStat:
                        String(
                          button.form
                            .elements
                            .mainStat
                            ?.value ??
                          ""
                        ).trim()
                    };
                  }
              },

              rejectClose:
                false,

              modal:
                true
            });
      } catch (_error) {
        selection =
          null;
      }

      if (
        !selection?.elementKey ||
        !selection?.mainStat
      ) {
        return null;
      }

      const selectedOption =
        availableOptions.find(
          (option) => {
            return (
              String(
                option.key ?? ""
              ) ===
              selection.elementKey
            );
          }
        );

      const selectedStat =
        NATUREWALK_MAIN_STATS.find(
          (stat) => {
            return (
              stat.key ===
              selection.mainStat
            );
          }
        );

      if (
        !selectedOption ||
        !selectedStat
      ) {
        return null;
      }

      return {
        rank:
          rankNumber,

        key:
          selectedOption.key,

        label:
          selectedOption.label ??
          selectedOption.key,

        originalLabel:
          selectedOption.originalLabel ??
          "",

        mainStat:
          selectedStat.key,

        mainStatLabel:
          game.i18n.localize(
            selectedStat.labelKey
          ),

        terrain:
          selectedOption.terrain ??
          "",

        recommendedFor:
          selectedOption.recommendedFor ??
          "",

        effect:
          selectedOption.effect ??
          ""
      };
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
  rank:
    rankNumber,

  key:
    selectedOption.key,

  label:
    selectedOption.label ??
    selectedOption.key,

  originalLabel:
    selectedOption.originalLabel ??
    "",

  derivedStat:
    selectedOption.derivedStat ??
    "",

  attackId:
    selectedOption.attackId ??
    "",

  attackName:
    selectedOption.attackName ??
    "",

  attackTag:
    selectedOption.attackTag ??
    "",

  effectTag:
    selectedOption.effectTag ??
    "",

  effectType:
    selectedOption.effectType ??
    selectedOption.type ??
    "",

  potencyStat:
    selectedOption.potencyStat ??
    selectedOption.potency ??
    "",

  duration:
    selectedOption.duration ??
    true,

  extraActionRequired:
    Boolean(
      selectedOption.extraActionRequired
    ),

  requiresDamageTag:
    Boolean(
      selectedOption.requiresDamageTag
    ),

  onlyAffectsAllies:
    Boolean(
      selectedOption.onlyAffectsAllies
    ),

  effect:
    selectedOption.effect ??
    ""
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

_getAttackChoiceOptionsForQuality(
  quality,
  existingChoices = []
) {
  const attacks =
    this.actor?.items?.filter(
      (item) => {
        return item.type === "attack";
      }
    ) ?? [];

  const modifier =
    quality.attackModifier ?? {};

  const choices =
    quality.choices ?? {};

  const choiceType =
    String(
      choices.type ?? ""
    );

  const grantsTags =
    Array.isArray(
      modifier.grantsTags
    )
      ? modifier.grantsTags
      : [];

  const normalizeTag = (value) => {
    return String(value ?? "")
      .trim()
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
  };

  const getChoiceTag = (
    choice = {}
  ) => {
    const directTag =
      normalizeTag(
        choice.effectTag ??
        choice.attackTag ??
        ""
      );

    if (directTag) {
      return directTag;
    }

    const keyText =
      String(
        choice.key ?? ""
      ).trim();

    const separatorIndex =
      keyText.indexOf(":");

    return separatorIndex >= 0
      ? normalizeTag(
          keyText.slice(
            separatorIndex + 1
          )
        )
      : normalizeTag(keyText);
  };

  const usedAttackIds =
    new Set(
      existingChoices
        .map((choice) => {
          return String(
            choice.attackId ?? ""
          ).trim();
        })
        .filter(Boolean)
    );

  const usedTags =
    new Set(
      existingChoices
        .map((choice) => {
          return getChoiceTag(
            choice
          );
        })
        .filter(Boolean)
    );

  const getAttackTags = (
    attack
  ) => {
    return [
      ...(
        Array.isArray(
          attack.system?.qualityTags
        )
          ? attack.system.qualityTags
          : []
      ),

      ...(
        Array.isArray(
          attack.system?.tags
        )
          ? attack.system.tags
          : []
      )
    ].map(normalizeTag);
  };

  /*
   * Reúne todas as Tags de Efeito das
   * Qualidades Básica e Avançada.
   */
  const allEffectTags =
    new Set(
      DDA_DIGIMON_QUALITIES
        .filter((entry) => {
          return (
            entry.choices?.type ===
            "effectTagPerRank"
          );
        })
        .flatMap((entry) => {
          return Array.isArray(
            entry.choices?.options
          )
            ? entry.choices.options.map(
                (option) => {
                  return normalizeTag(
                    option.key
                  );
                }
              )
            : [];
        })
        .filter(Boolean)
    );

  const attackHasEffectTag = (
    attack
  ) => {
    const directEffectTag =
      attack.system
        ?.effectTag
        ?.enabled
        ? normalizeTag(
            attack.system
              .effectTag
              .tag
          )
        : "";

    if (directEffectTag) {
      return true;
    }

    return getAttackTags(attack)
      .some((tag) => {
        return allEffectTags.has(tag);
      });
  };

  const isAreaAttackChoice =
    quality.id ===
      "areaDeAtaque" ||
    Boolean(
      modifier.areaAttack
    ) ||
    (
      String(
        modifier.appliesTo ?? ""
      ) ===
        "differentAttackPerRank" &&

      grantsTags.some((tag) => {
        return normalizeTag(tag)
          .startsWith("t:");
      })
    );

  /*
   * ÁREA DE ATAQUE
   */
  if (isAreaAttackChoice) {
    const areaOptions =
      Array.isArray(
        choices.options
      )
        ? choices.options
        : [];

    return areaOptions
      .filter((option) => {
        const areaTag =
          `t:${normalizeTag(
            option.key
          ).replace(/^t:/, "")}`;

        /*
         * Cada Tag de Área só pode
         * ser adquirida uma vez.
         */
        return !usedTags.has(
          areaTag
        );
      })
      .flatMap((option) => {
        const areaTag =
          `t:${normalizeTag(
            option.key
          ).replace(/^t:/, "")}`;

        return attacks
          .filter((attack) => {
            return this
              ._attackMatchesAreaOption(
                attack,
                option.appliesTo ?? ""
              );
          })
          .filter((attack) => {
            /*
             * Cada Rank precisa ser aplicado
             * a um Ataque diferente.
             */
            return !usedAttackIds.has(
              attack.id
            );
          })
          .filter((attack) => {
            /*
             * Impede duas Tags de Área
             * no mesmo Ataque.
             */
            return !getAttackTags(attack)
              .some((tag) => {
                return tag.startsWith(
                  "t:"
                );
              });
          })
          .map((attack) => ({
            key:
              `${attack.id}:${areaTag}`,

            label:
              `${attack.name} — [${areaTag.toUpperCase()}]`,

            /*
             * Não repetir o nome do Ataque
             * entre parênteses em outros
             * renderizadores.
             */
            originalLabel:
              "",

            attackId:
              attack.id,

            attackName:
              attack.name,

            attackTag:
              areaTag,

            derivedStat:
              option.derivedStat ??
              "",

            appliesTo:
              option.appliesTo ??
              "",

            effect:
              option.effect ??
              game.i18n.format(
                "DDA.QualityBrowser.AttackChoiceEffect",
                {
                  attack:
                    attack.name,

                  tag:
                    `[${areaTag.toUpperCase()}]`
                }
              )
          }));
      });
  }

  /*
   * EFEITO BÁSICO / AVANÇADO
   */
  if (
    choiceType ===
    "effectTagPerRank"
  ) {
    const effectOptions =
      Array.isArray(
        choices.options
      )
        ? choices.options
        : [];

    return effectOptions
      .filter((option) => {
        const effectTag =
          normalizeTag(
            option.key
          );

        /*
         * O mesmo Efeito não pode
         * ser adquirido novamente.
         */
        return (
          effectTag &&
          !usedTags.has(effectTag)
        );
      })
      .flatMap((option) => {
        const effectTag =
          normalizeTag(
            option.key
          );

        return attacks
          .filter((attack) => {
            return !usedAttackIds.has(
              attack.id
            );
          })
          .filter((attack) => {
            if (
              !option.requiresDamageTag
            ) {
              return true;
            }

            return (
              String(
                attack.system
                  ?.baseTags
                  ?.functionType ??
                ""
              )
                .trim()
                .toLowerCase() ===
              "damage"
            );
          })
          .filter((attack) => {
            if (
              !modifier
                .onlyOneEffectTagPerAttack
            ) {
              return true;
            }

            return !attackHasEffectTag(
              attack
            );
          })
          .map((attack) => ({
            key:
              `${attack.id}:${effectTag}`,

            label:
              `${attack.name} — [${effectTag.toUpperCase()}]`,

            originalLabel:
              "",

            attackId:
              attack.id,

            attackName:
              attack.name,

            /*
             * _applyAttackChoiceToAttack
             * utiliza attackTag para gravar
             * em system.qualityTags.
             */
            attackTag:
              effectTag,

            effectTag,

            effectType:
              option.type ??
              "",

            potencyStat:
              option.potency ??
              "",

            duration:
              option.duration ??
              true,

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

            effect:
              option.effect ??
              ""
          }));
      });
  }

  /*
   * OUTRAS QUALIDADES VINCULADAS
   * A UM ATAQUE
   */
  const primaryTag =
    normalizeTag(
      grantsTags[0] ??
      quality.id ??
      "quality"
    );

  const appliesTo =
    String(
      modifier.appliesTo ??
      "oneAttack"
    );

  return attacks
    .filter((attack) => {
      return this
        ._attackMatchesQualityAppliesTo(
          attack,
          appliesTo
        );
    })
    .filter((attack) => {
      return !usedAttackIds.has(
        attack.id
      );
    })
    .filter((attack) => {
      return !getAttackTags(attack)
        .includes(primaryTag);
    })
    .map((attack) => ({
      key:
        `${attack.id}:${primaryTag}`,

      label:
        `${attack.name} — [${primaryTag.toUpperCase()}]`,

      originalLabel:
        "",

      attackId:
        attack.id,

      attackName:
        attack.name,

      attackTag:
        primaryTag,

      effect:
        game.i18n.format(
          "DDA.QualityBrowser.AttackChoiceEffect",
          {
            attack:
              attack.name,

            tag:
              `[${primaryTag.toUpperCase()}]`
          }
        )
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

    if (
      quality?.choices?.required &&
      quality.choices.repeatOnRankIncrease !== false
    ) {
      const choice = await this._promptQualityChoice(
        quality,
        nextRank,
        existingChoices
      );

      if (!choice) return;

      existingChoices.push(choice);
      updateData["system.choices.selectedRanks"] = existingChoices;
    }

await item.update(
  updateData
);

await this._applyAttackChoiceToAttack(
  item,
  updateData[
    "system.choices.selectedRanks"
  ]?.at?.(-1)
);

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

_getQualityEffectiveMax(
  quality,
  ownedItem = null
) {
  /*
   * Algumas Naturewalks antigas foram salvas com
   * rank.max = 1. A definição oficial é sempre 2.
   */
  if (
    isNaturewalkQualityData(
      quality,
      ownedItem
    )
  ) {
    return 2;
  }

  const actorComputedEffectiveMax =
    Number(
      ownedItem?.system
        ?.rank
        ?.effectiveMax ??
      Number.NaN
    );

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
      .flatMap((item) => [
        item.name,
        item.system?.originalName,
        item.system?.sourceId
      ])
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
    const requiredNames =
      this._parseRequiredQualityNames(quality);

    if (!requiredNames.length) return true;

    const actorQualityNames = new Set(
      this._getActorQualityNames().map((name) => {
        return this._normalizeSearchText(name);
      })
    );

    const matches = requiredNames.map((requiredName) => {
      return actorQualityNames.has(
        this._normalizeSearchText(requiredName)
      );
    });

    return quality.requirements?.mode === "any"
      ? matches.some(Boolean)
      : matches.every(Boolean);
  }

  _getMissingRequiredQualities(quality) {
    const requiredNames =
      this._parseRequiredQualityNames(quality);

    if (!requiredNames.length) return [];

    const actorQualityNames = new Set(
      this._getActorQualityNames().map((name) => {
        return this._normalizeSearchText(name);
      })
    );

    const missing = requiredNames.filter((requiredName) => {
      return !actorQualityNames.has(
        this._normalizeSearchText(requiredName)
      );
    });

    if (quality.requirements?.mode === "any") {
      return missing.length === requiredNames.length
        ? requiredNames
        : [];
    }

    return missing;
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