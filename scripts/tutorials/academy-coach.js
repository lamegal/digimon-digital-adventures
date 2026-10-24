import { academyDialogue, localizeAcademy } from "./academy-helpers.js";
import { formatAcademy } from "./academy-practice.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** A regular, movable window: no modal, overlay, keyboard capture or automatic game actions. */
export class HinaAcademyCoach extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dda-hina-practice", classes: ["dda", "dda-hina-practice"],
    position: { width: 540, height: "auto" },
    window: { title: "DDA.Academy.Practice.Title", icon: "fas fa-graduation-cap", resizable: true },
    actions: { previousLesson: HinaAcademyCoach._onPrevious, nextLesson: HinaAcademyCoach._onNext, readTour: HinaAcademyCoach._onRead, showControls: HinaAcademyCoach._onShow }
  };
  static PARTS = { main: { template: "systems/digimon-digital-adventures/templates/apps/dda-academy-coach.hbs" } };

  constructor(session, options = {}) {
    const availableWidth = globalThis.innerWidth ?? 1280;
    const width = Math.min(540, Math.max(340, availableWidth - 20));
    super({ position: { width, left: Math.max(10, availableWidth - width - 20), top: 40 }, ...options });
    this.session = session;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const session = this.session;
    const evidence = session.evidence();
    const { tamer, digimon } = session.journey.actors();
    return { ...context, title: localizeAcademy(session.step.titleKey),
      dialogue: academyDialogue({ ...session.step, mood: evidence.status === "done" ? "happy" : session.step.mood }, { hint: session.viewHint }),
      progress: formatAcademy("DDA.Academy.Practice.Progress", { step: session.index + 1, total: session.chapter.steps.length }),
      evidence: formatAcademy(evidence.key, evidence.data), status: evidence.status,
      hint: localizeAcademy(session.step.practiceHintKey ?? "DDA.Academy.Practice.EditHint"),
      tamerName: tamer?.name ?? "—", digimonName: digimon?.name ?? "—", hasPrevious: session.index > 0,
      canShowControls: Boolean(session.step.surface && !session.createdActor),
      nextLabel: localizeAcademy(session.createdActor || session.index === session.chapter.steps.length - 1 ? "DDA.Academy.Practice.Finish" : "DDA.Academy.Practice.ContinueSkip") };
  }

  static async _onPrevious(event) { event.preventDefault(); await this.session.move(-1); }
  static async _onNext(event) { event.preventDefault(); await this.session.move(1); }
  static async _onRead(event) { event.preventDefault(); await this.session.tour.resumeReading(); }
  static async _onShow(event) { event.preventDefault(); await this.session.reopenView(); this.bringToFront(); }

  _onClose(options) {
    super._onClose?.(options);
    if (!this.session.active) return;
    this.session.dispose();
    this.session.tour.practice = null;
    if (this.session.tour.coach === this) this.session.tour.coach = null;
    this.session.tour.cleanupPromise = this.session.tour._cleanupGuide();
  }
}
