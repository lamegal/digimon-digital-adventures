const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const localize = (key) => game.i18n.localize(key);

export class DDATamerTalentBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dda-tamer-talent-browser",
    classes: ["dda", "dda-tamer-talent-browser-app"],
    position: { width: 1180, height: 840 },
    window: {
      title: "DDA.TamerTalentBrowser.Title",
      icon: "fa-solid fa-star",
      resizable: true,
      contentClasses: ["dda-tamer-talent-browser-window"]
    },
    actions: {
      filter: DDATamerTalentBrowser._onFilter,
      view: DDATamerTalentBrowser._onView,
      clearSearch: DDATamerTalentBrowser._onClearSearch,
      openTalent: DDATamerTalentBrowser._onOpenTalent,
      useTalent: DDATamerTalentBrowser._onUseTalent
    }
  };

  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/tamer-talent-browser.html",
      scrollable: [".dda-ttb-results-scroll"]
    }
  };

  constructor(sheet, options = {}) {
    const actorId = String(sheet?.actor?.id ?? foundry.utils.randomID()).trim();
    super({
      ...options,
      id: options.id ?? `dda-tamer-talent-browser-${actorId}`
    });
    this.sheet = sheet;
    this.talents = sheet?._getOfficialTamerTalentViewData?.() ?? [];
    this.filters = {
      availability: "all",
      tier: "all",
      category: "all",
      automation: "all",
      useType: "all"
    };
    this.search = "";
    this.sort = "unlockedThenName";
    this.view = "grid";
  }

  async _prepareContext() {
    this.talents = this.sheet?._getOfficialTamerTalentViewData?.() ?? this.talents;
    const totals = this._countTalents(this.talents);
    return {
      subtitle: localize("DDA.TamerTalentBrowser.Subtitle"),
      searchPlaceholder: localize("DDA.TamerTalentBrowser.SearchPlaceholder"),
      filters: this._filterGroups(totals),
      sortOptions: this._sortOptions(),
      view: this.view,
      gridActive: this.view === "grid",
      listActive: this.view === "list",
      talents: this._prepareTalentCards(this.talents),
      totals
    };
  }

  _filterGroups(totals) {
    const group = (key, label, options) => ({
      key,
      label: localize(label),
      options: options.map(([value, labelKey, countKey]) => ({
        value,
        label: localize(labelKey),
        count: countKey ? totals[countKey] : null,
        active: this.filters[key] === value
      }))
    });

    return [
      group("availability", "DDA.TamerTalentBrowser.Group.Availability", [
        ["all", "DDA.TamerTalentBrowser.Filter.All", "total"],
        ["unlocked", "DDA.TamerTalentBrowser.Filter.Unlocked", "unlocked"],
        ["locked", "DDA.TamerTalentBrowser.Filter.Locked", "locked"]
      ]),
      group("tier", "DDA.TamerTalentBrowser.Group.Tier", [
        ["all", "DDA.TamerTalentBrowser.Filter.All", "total"],
        ["initial", "DDA.TamerTalentBrowser.Filter.Initial", "initial"],
        ["advanced", "DDA.TamerTalentBrowser.Filter.Advanced", "advanced"]
      ]),
      group("category", "DDA.TamerTalentBrowser.Group.Category", [
        ["all", "DDA.TamerTalentBrowser.Filter.All", "total"],
        ["talent", "DDA.TamerTalent.Talent", "talent"],
        ["specialOrder", "DDA.TamerTalent.SpecialOrder", "specialOrder"]
      ]),
      group("automation", "DDA.TamerTalentBrowser.Group.Automation", [
        ["all", "DDA.TamerTalentBrowser.Filter.All", "total"],
        ["automated", "DDA.Automation.Status.Automated", "automated"],
        ["assisted", "DDA.Automation.Status.Assisted", "assisted"],
        ["narrative", "DDA.Automation.Status.Narrative", "narrative"]
      ]),
      group("useType", "DDA.TamerTalentBrowser.Group.UseType", [
        ["all", "DDA.TamerTalentBrowser.Filter.All", "total"],
        ["passive", "DDA.TamerTalent.UseType.Passive", "passive"],
        ["active", "DDA.TamerTalent.UseType.Active", "active"],
        ["interrupt", "DDA.TamerTalent.UseType.Interrupt", "interrupt"],
        ["reactive", "DDA.TamerTalentBrowser.ReactiveOnly", "reactive"]
      ])
    ];
  }

  _sortOptions() {
    return [
      ["unlockedThenName", "DDA.TamerTalentBrowser.Sort.Unlocked"],
      ["nameAsc", "DDA.TamerTalentBrowser.Sort.NameAsc"],
      ["requirementAsc", "DDA.TamerTalentBrowser.Sort.Requirement"],
      ["specialOrdersFirst", "DDA.TamerTalentBrowser.Sort.SpecialOrders"],
      ["automation", "DDA.TamerTalentBrowser.Sort.Automation"]
    ].map(([value, label]) => ({ value, label: localize(label), selected: this.sort === value }));
  }

  _countTalents(talents) {
    const count = (predicate) => talents.filter(predicate).length;
    return {
      total: talents.length,
      unlocked: count((t) => t.requirementMet),
      locked: count((t) => !t.requirementMet),
      initial: count((t) => !t.system?.isAdvanced),
      advanced: count((t) => t.system?.isAdvanced),
      talent: count((t) => !t.system?.isSpecialOrder),
      specialOrder: count((t) => t.system?.isSpecialOrder),
      automated: count((t) => t.implementation?.mode === "automated"),
      assisted: count((t) => t.implementation?.mode === "assisted"),
      narrative: count((t) => t.implementation?.mode === "narrative"),
      passive: count((t) => t.system?.useType === "passive"),
      active: count((t) => t.system?.useType === "active"),
      interrupt: count((t) => t.system?.useType === "interrupt"),
      reactive: count((t) => t.system?.automation?.triggeredOnly)
    };
  }

  _prepareTalentCards(talents) {
    return talents.map((talent) => {
      const text = String(talent.system?.effect ?? "");
      const searchText = [
        talent.name,
        talent.requirementText,
        talent.system?.specialOrder?.name,
        text,
        talent.implementationLabel,
        talent.statusLabel
      ].filter(Boolean).join(" ").toLowerCase();

      return {
        ...talent,
        searchText,
        effectPreview: text.length > 280 ? `${text.slice(0, 277)}…` : text,
        specialOrderName: talent.system?.specialOrder?.name ?? "",
        isSpecialOrder: Boolean(talent.system?.isSpecialOrder),
        isAdvanced: Boolean(talent.system?.isAdvanced),
        isReactive: Boolean(talent.system?.automation?.triggeredOnly),
        canUse: Boolean(
          talent.requirementMet &&
          !talent.system?.automation?.triggeredOnly &&
          String(talent.system?.useType ?? "passive") !== "passive"
        ),
        useType: talent.system?.useType ?? "passive",
        implementationMode: talent.implementation?.mode ?? "unknown",
        requirementSort: Number(talent.requirementValue ?? 0),
        categoryIcon: talent.system?.isSpecialOrder ? "fa-bolt" : "fa-star"
      };
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element.querySelector("[data-ttb-search]");
    const sort = this.element.querySelector("[data-ttb-sort]");

    input?.addEventListener("input", (event) => {
      this.search = event.currentTarget.value ?? "";
      this._applyClientFilters();
    });

    sort?.addEventListener("change", (event) => {
      this.sort = event.currentTarget.value || "unlockedThenName";
      this._applyClientFilters();
    });

    this._applyClientFilters();
  }

  _matchesCard(card) {
    const value = (name) => card.dataset[name] ?? "";
    const f = this.filters;
    if (this.search.trim() && !value("search").includes(this.search.trim().toLowerCase())) return false;
    if (f.availability !== "all" && value("availability") !== f.availability) return false;
    if (f.tier !== "all" && value("tier") !== f.tier) return false;
    if (f.category !== "all" && value("category") !== f.category) return false;
    if (f.automation !== "all" && value("automation") !== f.automation) return false;
    if (f.useType === "reactive" && value("reactive") !== "true") return false;
    if (f.useType !== "all" && f.useType !== "reactive" && value("useType") !== f.useType) return false;
    return true;
  }

  _applyClientFilters() {
    const cards = Array.from(this.element.querySelectorAll("[data-ttb-card]"));
    const visible = cards.filter((card) => {
      const show = this._matchesCard(card);
      card.hidden = !show;
      return show;
    });

    const collator = new Intl.Collator(game.i18n?.lang || undefined, { sensitivity: "base", numeric: true });
    visible.sort((a, b) => {
      if (this.sort === "nameAsc") return collator.compare(a.dataset.name, b.dataset.name);
      if (this.sort === "requirementAsc") return Number(a.dataset.requirement) - Number(b.dataset.requirement) || collator.compare(a.dataset.name, b.dataset.name);
      if (this.sort === "specialOrdersFirst") return Number(b.dataset.category === "specialOrder") - Number(a.dataset.category === "specialOrder") || collator.compare(a.dataset.name, b.dataset.name);
      if (this.sort === "automation") {
        const weight = { automated: 0, assisted: 1, narrative: 2, unknown: 3 };
        return (weight[a.dataset.automation] ?? 99) - (weight[b.dataset.automation] ?? 99) || collator.compare(a.dataset.name, b.dataset.name);
      }
      return Number(b.dataset.availability === "unlocked") - Number(a.dataset.availability === "unlocked") || Number(a.dataset.tier === "advanced") - Number(b.dataset.tier === "advanced") || collator.compare(a.dataset.name, b.dataset.name);
    });

    const list = this.element.querySelector("[data-ttb-list]");
    if (list) for (const card of visible) list.append(card);

    const resultCount = this.element.querySelector("[data-ttb-result-count]");
    if (resultCount) resultCount.textContent = String(visible.length);

    const empty = this.element.querySelector("[data-ttb-empty]");
    if (empty) empty.hidden = visible.length > 0;

    for (const button of this.element.querySelectorAll("[data-action='filter']")) {
      const group = button.dataset.filterGroup;
      button.classList.toggle("active", this.filters[group] === button.dataset.filterValue);
    }
  }

  static _onFilter(event, target) {
    const group = target.dataset.filterGroup;
    const value = target.dataset.filterValue;
    if (!group || !(group in this.filters)) return;
    this.filters[group] = value || "all";
    this._applyClientFilters();
  }

  static _onView(event, target) {
    this.view = target.dataset.viewMode === "list" ? "list" : "grid";
    const list = this.element.querySelector("[data-ttb-list]");
    list?.classList.toggle("is-grid", this.view === "grid");
    list?.classList.toggle("is-list", this.view === "list");
    for (const button of this.element.querySelectorAll("[data-action='view']")) {
      button.classList.toggle("active", button.dataset.viewMode === this.view);
    }
  }

  static _onClearSearch() {
    this.search = "";
    const input = this.element.querySelector("[data-ttb-search]");
    if (input) input.value = "";
    this._applyClientFilters();
    input?.focus();
  }

  static async _onOpenTalent(event, target) {
    const talentId = target.dataset.talentId;
    await this.sheet?._onOpenOfficialTamerTalent?.({ preventDefault() {}, currentTarget: { dataset: { talentId } } });
  }

  static async _onUseTalent(event, target) {
    if (target.disabled) return;
    const talentId = target.dataset.talentId;
    await this.sheet?._onUseTamerTalent?.({ preventDefault() {}, currentTarget: { dataset: { talentId, talentSource: "official" } } });
    this.talents = this.sheet?._getOfficialTamerTalentViewData?.() ?? this.talents;
    await this.render();
  }
}
