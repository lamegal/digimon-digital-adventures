import { getPartnerTokenSizeContext, savePartnerTokenSizes } from "../combat/evolution.js";
import { getDigimonStageLabel } from "../helpers/digimon-stage-labels.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const localize = key => game.i18n.localize(key);

export function collectPartnerTokenSizeChanges(root) {
  const changes = [];
  for (const row of root.querySelectorAll("[data-token-size-reference][data-dirty='true']")) {
    const inputs = Array.from(row.querySelectorAll("[data-size-field]"));
    if (inputs.some(input => !input.reportValidity())) throw new Error(localize("DDA.TokenSizes.Invalid"));
    changes.push({ reference: row.dataset.tokenSizeReference, reset: row.dataset.reset === "true",
      ...Object.fromEntries(inputs.map(input => [input.dataset.sizeField, Number(input.value)])) });
  }
  return changes;
}

export async function preparePartnerTokenSizeView(sourceActor) {
  const sizeContext = await getPartnerTokenSizeContext(sourceActor);
  return { sizeContext, ready: Boolean(sizeContext), canEdit: sizeContext?.canEdit,
    partnerName: sizeContext?.partnerActor?.name,
    rows: (sizeContext?.rows ?? []).map(row => ({ ...row, snapshot: undefined,
      stageLabel: getDigimonStageLabel(row.stage), canEdit: sizeContext.canEdit && row.editable })) };
}

export class DDAPartnerTokenSizes extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["dda", "dda-partner-token-sizes"],
    position: { width: 870, height: 620 },
    window: { icon: "fas fa-expand-arrows-alt", resizable: true },
    actions: {
      saveSizes: DDAPartnerTokenSizes._onSave,
      resetSize: DDAPartnerTokenSizes._onReset,
      cancelSizes: DDAPartnerTokenSizes._onCancel
    }
  };

  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-partner-token-sizes.hbs",
      scrollable: [".dda-token-sizes__body"]
    }
  };

  constructor(sourceActor, options = {}) {
    super(options);
    this.sourceActor = sourceActor;
    this.sizeContext = null;
    this._saving = false;
  }

  get title() { return localize("DDA.TokenSizes.Title"); }

  static async open(sourceActor) {
    const application = new this(sourceActor);
    await application.render({ force: true });
    return application;
  }

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const view = await preparePartnerTokenSizeView(this.sourceActor);
    this.sizeContext = view.sizeContext;
    return { ...context, ...view };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    for (const row of this.element.querySelectorAll("[data-token-size-reference]")) {
      row.addEventListener("input", () => {
        row.dataset.dirty = "true";
        delete row.dataset.reset;
        this._refreshRow(row);
      });
      this._refreshRow(row);
    }
  }

  _refreshRow(row) {
    const value = key => row.querySelector(`[data-size-field='${key}']`)?.value ?? "";
    const format = value => Number.isFinite(Number(value)) && Number(value) > 0 ? String(Number(value)) : "—";
    row.querySelector("[data-size-summary='footprint']").textContent = `${format(value("width"))} × ${format(value("height"))}`;
    row.querySelector("[data-size-summary='visual']").textContent = `${format(value("scaleX"))} × ${format(value("scaleY"))}`;
  }

  static _onReset(event, target) {
    event.preventDefault();
    const row = target.closest("[data-token-size-reference]");
    const data = this.sizeContext?.rows.find(data => data.reference === row?.dataset.tokenSizeReference);
    if (!this.sizeContext?.canEdit || !data?.editable || this._saving) return;
    for (const [key, value] of Object.entries({ width: data.defaultWidth, height: data.defaultHeight, scaleX: 1, scaleY: 1 })) {
      row.querySelector(`[data-size-field='${key}']`).value = value;
    }
    row.dataset.dirty = "true";
    row.dataset.reset = "true";
    this._refreshRow(row);
  }

  static async _onSave(event) {
    event.preventDefault();
    if (!this.sizeContext?.canEdit || this._saving) return;
    this._saving = true;
    const buttons = Array.from(this.element.querySelectorAll("button"));
    const disabled = buttons.map(button => button.disabled);
    for (const button of buttons) button.disabled = true;
    try {
      const changes = collectPartnerTokenSizeChanges(this.element);
      await savePartnerTokenSizes(this.sourceActor, changes);
      ui.notifications.info(localize("DDA.TokenSizes.Saved"));
      await this.close();
    } catch (error) {
      console.error("DDA | Could not save per-form Token sizes.", error);
      ui.notifications.error(error.message || localize("DDA.TokenSizes.Failed"));
    } finally {
      this._saving = false;
      buttons.forEach((button, index) => { button.disabled = disabled[index]; });
    }
  }

  static _onCancel(event) {
    event.preventDefault();
    if (!this._saving) return this.close();
  }
}
