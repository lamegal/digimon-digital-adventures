import { canUseAcademyActor, localizeAcademy } from "./academy-helpers.js";
import { academyElement } from "./academy-ui.js";
import { academyPairIsLinked } from "./academy-journey.js";

export const formatAcademy = (key, data = {}) => localizeAcademy(key).replace(/\{(\w+)\}/g, (match, name) => String(data[name] ?? match));

export function canPractiseAcademyStep(step) {
  return Boolean(step?.wizardStep || step?.practice);
}

function draftEvidence(step, app) {
  if (!app?.rendered) return { key: "DDA.Academy.Practice.NoWizard", status: "waiting" };
  const data = app.data ?? {};
  const name = String(data.identity?.name ?? "").trim();
  if (step.wizardStep === "identity" && name) return { key: "DDA.Academy.Practice.DraftNamed", data: { name }, status: "changed" };
  const errors = data.validation?.errors ?? [];
  if (step.wizardStep === "summary" && errors.length) return { key: "DDA.Academy.Practice.NativeReview", status: "waiting" };
  return { key: "DDA.Academy.Practice.DraftHint", status: "waiting" };
}

/** Watches only the selected lesson and participants. Never invokes a game action. */
export class AcademyPracticeSession {
  constructor(tour, journey, { onChange = () => {} } = {}) {
    this.tour = tour;
    this.journey = journey;
    this.bridge = tour.bridge;
    this.chapter = tour.chapter;
    this.index = Math.max(0, this.chapter.steps.findIndex(step => step.id === tour.currentStep?.id));
    this.onChange = onChange;
    this.active = false;
    this.hooks = [];
    this.createdActor = null;
    this.createdKind = "";
    this.activity = null;
    this.app = null;
    this.boundRoot = null;
    this.rootListener = () => this.queueRefresh();
    this.timer = null;
    this.baseline = "";
    this.signature = "";
    this.moving = false;
    this.viewHint = "";
    this.viewRevision = 0;
    this.preparing = false;
  }

  get step() { return this.chapter.steps[this.index]; }

  async start() {
    this.active = true;
    this.journey.practice = this;
    const add = (name, callback) => this.hooks.push([name, Hooks.on(name, callback) ?? callback]);
    add("renderDDATamerWizard", app => this.onWizardRender(app));
    add("renderDDADigimonWizard", app => this.onWizardRender(app));
    add("closeDDATamerWizard", app => { if (app === this.app) this.queueRefresh(); });
    add("closeDDADigimonWizard", app => { if (app === this.app) this.queueRefresh(); });
    if (this.chapter.gmOnly) {
      add("renderDDADigimonEnemyWizard", app => this.onWizardRender(app));
      add("closeDDADigimonEnemyWizard", app => { if (app === this.app) this.queueRefresh(); });
    }
    add("ddaActivity", event => this.onActivity(event));
    add("updateActor", actor => {
      const { tamer, digimon } = this.journey.actors();
      if (actor?.uuid === tamer?.uuid || actor?.uuid === digimon?.uuid) this.queueRefresh();
    });
    await this.showStep(this.index);
    return this;
  }

  async showStep(index, { prepare = true } = {}) {
    if (!this.active || index < 0 || index >= this.chapter.steps.length) return;
    this.index = index;
    this.activity = null;
    this.createdActor = null;
    this.createdKind = "";
    this.signature = "";
    if (prepare && !await this.prepareView()) return;
    if (!this.active || index !== this.index) return;
    this.baseline = this.readState();
    this.journey.checkpoint(this.chapter.id, this.step.id);
    this.refresh();
  }

  async prepareView() {
    const revision = ++this.viewRevision, index = this.index;
    this.preparing = true;
    let view;
    try { view = await this.bridge?.prepare({ ...this.step, gmOnly: this.chapter.gmOnly }); }
    catch (error) {
      console.warn("DDA | Practice view could not be opened", error);
      view = { hint: localizeAcademy("DDA.Academy.ViewUnavailable") };
    } finally { if (revision === this.viewRevision) this.preparing = false; }
    if (!this.active || revision !== this.viewRevision || index !== this.index) return false;
    this.viewHint = view?.hint ?? "";
    const wizardKey = ["tamerWizard", "digimonWizard", "npc"].includes(this.step.surface) ? this.step.surface : "";
    this.app = wizardKey ? this.bridge?.apps?.get(wizardKey) ?? this.journey.wizards.get(wizardKey) : null;
    if (this.app) {
      this.journey.wizards.set(wizardKey, this.app);
      // A player deliberately editing a draft owns its current position now.
      this.bridge?.restores?.delete(this.app);
    }
    this.bindRoot();
    return true;
  }

  async reopenView() {
    if (!this.active || this.preparing || this.moving || this.createdActor || !this.step.surface) return false;
    if (!await this.prepareView()) return false;
    this.refresh();
    return true;
  }

  bindRoot() {
    const root = academyElement(this.app?.element);
    if (root === this.boundRoot) return;
    for (const event of ["input", "change"]) this.boundRoot?.removeEventListener?.(event, this.rootListener, true);
    this.boundRoot = root;
    for (const event of ["input", "change"]) root?.addEventListener?.(event, this.rootListener, true);
  }

  readState() {
    const { tamer, digimon } = this.journey.actors();
    const draft = this.app?.data;
    return JSON.stringify({ draft: draft && {
      name: draft.identity?.name, species: draft.identity?.species, stage: draft.stage,
      aspects: draft.aspects, attributes: draft.attributes, skills: draft.skills,
      allocation: draft.statAllocation,
      qualities: [draft.qualities?.positive, draft.qualities?.negative]?.map(list => list?.map(q => [q.id, q.rank, q.ranks])),
      dp: draft.dp?.spent
    }, npc: this.step.surface === "npc" && this.app && {
      selectedFormId: this.app.selectedFormId, name: this.app.enemyName,
      alignment: this.app.npcAlignment, build: this.app.enemyBuild
    }, pair: [tamer?.system?.partner?.uuid, digimon?.system?.tamer?.uuid],
      graph: digimon?.system?.evolutionGraph?.edges, form: digimon?.system?.evolution?.currentFormUuid,
      snapshots: digimon?.system?.evolution?.formSnapshots });
  }

  onWizardRender(app) {
    if (!this.active || this.moving || this.preparing || app !== this.app) return;
    this.bindRoot();
    const key = app.steps?.[app.stepIndex];
    const candidates = this.chapter.steps.map((step, index) => ({ step, index }))
      .filter(entry => entry.step.surface === this.step.surface && entry.step.wizardStep === key);
    const candidate = candidates.find(entry => entry.index === this.index) ?? candidates[0];
    if (candidate && candidate.index !== this.index) {
      this.index = candidate.index;
      this.activity = null;
      this.signature = "";
      this.journey.checkpoint(this.chapter.id, this.step.id);
    }
    this.queueRefresh();
  }

  onActivity(event) {
    if (!this.active || !event || !game.user?.id || event.userId !== game.user.id) return;
    const { tamer, digimon } = this.journey.actors();
    if (event.kind === "wizardOpened" && event.sourceWizard === this.app) {
      this.journey.wizards.set(event.role === "tamer" ? "tamerWizard" : "digimonWizard", event.wizard);
      this.bridge?.apps?.set(event.role === "tamer" ? "tamerWizard" : "digimonWizard", event.wizard);
      return;
    }
    if (event.kind === "npcCreated") {
      if (!this.chapter.gmOnly || !game.user.isGM || this.step.practice !== "npc" || event.wizard !== this.app || !canUseAcademyActor(event.actor)) return;
      this.createdActor = event.actor;
      this.createdKind = "npc";
      this.index = this.chapter.steps.length - 1;
      this.journey.wizards.delete("npc");
      this.journey.checkpoint(this.chapter.id, this.step.id, { createdUuid: event.actor.uuid });
    } else if (event.kind === "created") {
      if (!["tamerWizard", "digimonWizard"].includes(this.step.surface) || event.wizard !== this.app || !canUseAcademyActor(event.actor)) return;
      if (!this.journey.adoptCreated(event.actor)) return;
      this.createdActor = event.actor;
      this.journey.wizards.delete(this.step.surface);
      const summary = this.chapter.steps.findIndex(step => step.wizardStep === "summary");
      if (summary >= 0) this.index = summary;
      this.journey.checkpoint(this.chapter.id, this.step.id, { createdUuid: event.actor.uuid });
    } else if (event.kind === "formSaved") {
      if (this.step.practice !== "form" || event.actor?.uuid !== digimon?.uuid) return;
      this.activity = event;
    } else {
      const kind = this.step.practice;
      if (kind === "check" && event.kind === "check" && event.actor?.uuid === tamer?.uuid) this.activity = event;
      else if (kind === "direct" && event.kind === "direct" && event.actor?.uuid === tamer?.uuid && event.target?.uuid === digimon?.uuid) this.activity = event;
      else if (["attack", "area"].includes(kind) && event.kind === "attack" && event.actor?.uuid === digimon?.uuid && (kind !== "area" || event.area)) this.activity = event;
      else return;
    }
    this.queueRefresh();
  }

  evidence() {
    if (this.createdActor) return { key: this.createdKind === "npc" ? "DDA.Academy.Practice.NpcCreated" : "DDA.Academy.Practice.Created", data: { name: this.createdActor.name }, status: "done" };
    if (this.activity) {
      const event = this.activity;
      if (event.kind === "check") return { key: "DDA.Academy.Practice.CheckResult", data: { total: event.total, result: event.outcomeLabel ?? "—" }, status: "done" };
      if (event.kind === "direct") return { key: "DDA.Academy.Practice.DirectResult", data: { name: event.target?.name, bonus: event.bonus }, status: "done" };
      if (event.kind === "formSaved") return { key: "DDA.Academy.Practice.FormSaved", data: { name: event.formName ?? "" }, status: "done" };
      if (event.kind === "attack") return { key: event.area ? "DDA.Academy.Practice.AreaResult" : "DDA.Academy.Practice.AttackResult",
        data: { accuracy: event.accuracy, dodge: event.dodge, result: localizeAcademy(event.hit ? "DDA.Academy.Practice.Hit" : "DDA.Academy.Practice.Miss") }, status: "done" };
    }
    const { tamer, digimon } = this.journey.actors();
    if (this.step.practice === "npc") {
      if (!this.app?.rendered) return { key: "DDA.Academy.Practice.NoWizard", status: "waiting" };
      const changed = this.readState() !== this.baseline;
      return { key: changed ? "DDA.Academy.Practice.DraftChanged" : "DDA.Academy.Practice.NpcDraft", status: changed ? "changed" : "waiting" };
    }
    if (this.step.practice === "pair" && academyPairIsLinked(tamer, digimon)) return { key: "DDA.Academy.Practice.Paired", status: "done" };
    if (this.step.wizardStep) {
      const key = this.app?.steps?.[this.app.stepIndex];
      if (this.app?.rendered && key && !this.chapter.steps.some(step => step.wizardStep === key)) {
        return { key: "DDA.Academy.Practice.Branch", status: "waiting" };
      }
      const evidence = draftEvidence(this.step, this.app);
      if (evidence.key === "DDA.Academy.Practice.DraftHint" && this.readState() !== this.baseline) return { key: "DDA.Academy.Practice.DraftChanged", status: "changed" };
      return evidence;
    }
    if (["graph", "form", "evolution"].includes(this.step.practice) && this.readState() !== this.baseline) return { key: "DDA.Academy.Practice.Updated", status: "changed" };
    return { key: "DDA.Academy.Practice.Waiting", status: "waiting" };
  }

  queueRefresh() {
    if (!this.active || this.timer !== null) return;
    this.timer = setTimeout(() => { this.timer = null; if (this.active) this.refresh(); }, 40);
  }

  refresh() {
    if (!this.active) return;
    const evidence = this.evidence();
    const signature = JSON.stringify({ index: this.index, evidence, pair: this.journey.selection, hint: this.viewHint });
    if (signature === this.signature) return;
    this.signature = signature;
    this.onChange(this);
  }

  async move(delta) {
    if (this.moving || !this.active) return;
    const index = this.index + delta;
    if (index < 0) return;
    this.moving = true;
    try {
      if (this.createdActor && delta < 0) return await this.tour.resumeReading();
      if (index >= this.chapter.steps.length || this.createdActor) return await this.finish();
      await this.showStep(index);
    } finally { this.moving = false; }
  }

  async finish() {
    if (!this.active) return false;
    const native = foundry.nue.Tour;
    if (native.activeTour && native.activeTour !== this.tour) {
      ui.notifications.warn(localizeAcademy("DDA.Academy.Busy")); return false;
    }
    await this.tour.complete();
    return true;
  }

  dispose() {
    this.active = false;
    this.viewRevision++;
    this.preparing = false;
    if (this.journey.practice === this) this.journey.practice = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const [name, id] of this.hooks) Hooks.off?.(name, id);
    this.hooks.length = 0;
    for (const event of ["input", "change"]) this.boundRoot?.removeEventListener?.(event, this.rootListener, true);
    this.boundRoot = null;
  }
}
