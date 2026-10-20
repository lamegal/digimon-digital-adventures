import { getPartnerTokenSizeContext, savePartnerTokenSizes } from "../combat/evolution.js";
import {
  DDAPartnerTokenSizes, collectPartnerTokenSizeChanges, preparePartnerTokenSizeView
} from "./dda-partner-token-sizes.js";

const TAB = "ddaForms";
const localize = key => game.i18n.localize(key);
const isDigimon = actor => actor && ["digimon", "npc"].includes(actor.type) && actor.system?.isDigimon !== false;
const currentReference = actor => String(actor.system?.evolution?.currentFormUuid || actor.system?.evolution?.sourceFormUuid || actor.uuid);

function prototypeAppearance(actor) {
  const data = actor.prototypeToken?._source ?? actor.prototypeToken ?? {};
  return { width: Number(data.width ?? 1), height: Number(data.height ?? 1),
    scaleX: Number(data.texture?.scaleX ?? 1), scaleY: Number(data.texture?.scaleY ?? 1) };
}

export function createDDAPrototypeTokenConfig(Base) {
  const parts = Object.entries(Base.PARTS ?? {});
  return class DDAPrototypeTokenConfig extends Base {
    static ddaTokenForms = true;
    static DEFAULT_OPTIONS = {
      actions: { resetSize: DDAPartnerTokenSizes._onReset }
    };
    static PARTS = Object.fromEntries([
      ...parts.filter(([key]) => key !== "footer"),
      [TAB, { template: "systems/digimon-digital-adventures/templates/apps/dda-partner-token-sizes.hbs", scrollable: [".dda-token-sizes__body"] }],
      ...parts.filter(([key]) => key === "footer")
    ]);

    _initializeApplicationOptions(options) {
      const configured = super._initializeApplicationOptions(options);
      const nativeSubmit = configured.form?.handler;
      if (typeof nativeSubmit !== "function") return configured;
      return { ...configured, form: { ...configured.form,
        handler: function (...args) { return this._submitWithFormSizes(nativeSubmit, ...args); } } };
    }

    _configureRenderOptions(options) {
      super._configureRenderOptions(options);
      options.parts ??= Object.keys(this.constructor.PARTS);
      if (!isDigimon(this.actor) && Array.isArray(options.parts)) options.parts = options.parts.filter(part => part !== TAB);
    }

    _getTabsConfig(group) {
      const config = super._getTabsConfig(group);
      if (!isDigimon(this.actor) || !Array.isArray(config?.tabs)) return config;
      if (!config.tabs.some(tab => ["identity", "appearance"].includes(tab.id))) return config;
      return { ...config, tabs: [...config.tabs.filter(tab => tab.id !== TAB),
        { id: TAB, icon: "fas fa-dna", label: "DDA.TokenSizes.Tab" }] };
    }

    async _prepareContext(options = {}) {
      const context = await super._prepareContext(options);
      if (!isDigimon(this.actor)) return context;
      this._ddaFormReference = currentReference(this.actor);
      const group = Object.values(context.tabs ?? {}).find(tab => tab?.group)?.group || Object.keys(this.tabGroups)[0] || "sheet";
      context.tabs ??= {};
      const active = this.tabGroups[group] === TAB;
      context.tabs[TAB] = { id: TAB, group, icon: "fas fa-dna", label: "DDA.TokenSizes.Tab", active, cssClass: active ? "active" : "" };
      return context;
    }

    async _preparePartContext(partId, context, options) {
      if (partId !== TAB) return super._preparePartContext(partId, context, options);
      const view = await preparePartnerTokenSizeView(this.actor);
      this.sizeContext = view.sizeContext;
      return { ...context, ...view, embedded: true, tab: context.tabs?.[TAB] };
    }

    async _onFirstRender(context, options) {
      await super._onFirstRender(context, options);
      if (isDigimon(this.actor)) this.setPosition({ width: Math.max(this.position.width ?? 0, 870), height: Math.max(this.position.height ?? 0, 670) });
    }

    _onRender(context, options) {
      super._onRender(context, options);
      this.element.classList.toggle("dda-digimon-prototype-token-config", Boolean(isDigimon(this.actor)));
      if (!isDigimon(this.actor)) return;
      for (const row of this.element.querySelectorAll("[data-token-size-reference]")) {
        if (row.dataset.ddaSizeBound) continue;
        row.dataset.ddaSizeBound = "true";
        row.addEventListener("input", () => {
          row.dataset.dirty = "true";
          delete row.dataset.reset;
          this._refreshRow(row);
        });
        this._refreshRow(row);
      }
    }

    _refreshRow(row) { return DDAPartnerTokenSizes.prototype._refreshRow.call(this, row); }

    async _submitWithFormSizes(nativeSubmit, ...args) {
      if (!isDigimon(this.actor)) return nativeSubmit.apply(this, args);
      if (this._saving) return;
      if (this._ddaFormReference && currentReference(this.actor) !== this._ddaFormReference) throw new Error(localize("DDA.TokenSizes.FormChanged"));
      const changes = collectPartnerTokenSizeChanges(this.element);
      const context = await getPartnerTokenSizeContext(this.actor);
      if (!context?.canEdit) throw new Error(localize("DDA.TokenSizes.NoPermission"));
      if (changes.some(change => !context.rows.some(row => row.reference === change.reference && row.editable))) throw new Error(localize("DDA.TokenSizes.Unavailable"));
      const before = prototypeAppearance(this.actor);
      this._saving = true;
      try {
        const result = await nativeSubmit.apply(this, args);
        if (result === false) return result;
        const after = prototypeAppearance(this.actor);
        const nativeSizeChanged = Object.keys(before).some(key => before[key] !== after[key]);
        const current = context.rows.find(row => row.current);
        if (nativeSizeChanged && current?.editable) {
          const edited = changes.find(change => change.reference === current.reference);
          if (!edited) changes.push({ reference: current.reference, width: after.width, height: after.height,
            scaleX: Math.abs(after.scaleX), scaleY: Math.abs(after.scaleY), flipX: after.scaleX < 0, flipY: after.scaleY < 0 });
          else if (!edited.reset) {
            // Forms controls dimensions; native image flip controls still apply.
            if (before.scaleX * after.scaleX < 0) edited.flipX = after.scaleX < 0;
            if (before.scaleY * after.scaleY < 0) edited.flipY = after.scaleY < 0;
          }
        }
        if (changes.length) await savePartnerTokenSizes(this.actor, changes);
        return result;
      } finally {
        this._saving = false;
      }
    }
  };
}

export function registerDDAPrototypeTokenForms() {
  const Base = CONFIG.Token?.prototypeSheetClass ?? foundry.applications.sheets.PrototypeTokenConfig;
  if (!Base || Base.ddaTokenForms) return;
  CONFIG.Token.prototypeSheetClass = createDDAPrototypeTokenConfig(Base);
}
