import { ACADEMY_NAMESPACE, academyDialogue, canUseAcademyActor, localizeAcademy } from "./academy-helpers.js";
import { AcademyUIBridge, academyTarget } from "./academy-ui.js";
import { getAcademyJourney } from "./academy-journey.js";
import { AcademyPracticeSession, canPractiseAcademyStep } from "./academy-practice.js";
import { HinaAcademyCoach } from "./academy-coach.js";

const NativeTour = foundry.nue.Tour;

export class HinaAcademyTour extends NativeTour {
  constructor(chapter, { bridgeFactory = selection => new AcademyUIBridge(selection, { wizards: getAcademyJourney().wizards }), onComplete = null } = {}) {
    super({ namespace: ACADEMY_NAMESPACE, id: `academy-${chapter.id}`,
      title: chapter.titleKey, description: chapter.descriptionKey,
      display: true, canBeResumed: true, restricted: Boolean(chapter.gmOnly),
      steps: chapter.steps.map(step => ({ id: step.id, title: step.titleKey, content: step.textKey })) });
    this.chapter = chapter;
    this.selection = getAcademyJourney().selection;
    this.bridgeFactory = bridgeFactory;
    this.bridge = null;
    this.target = null;
    this.cleanupPromise = null;
    this.practice = null;
    this.coach = null;
    this.onComplete = onComplete;
  }

  get title() { return localizeAcademy(this.chapter?.titleKey ?? this.config.title); }
  get description() { return localizeAcademy(this.chapter?.descriptionKey ?? this.config.description); }
  get canStart() { return !this.chapter?.gmOnly || Boolean(game.user?.isGM); }

  async start() {
    if (!this.canStart) throw new Error(localizeAcademy("DDA.Academy.GMOnly"));
    await this.cleanupPromise;
    const previousPractice = getAcademyJourney().practice;
    if (previousPractice?.active) { previousPractice.dispose(); await previousPractice.tour._cleanupGuide(); }
    this.bridge ??= this.bridgeFactory(this.selection);
    const point = getAcademyJourney().checkpoints[this.chapter.id];
    if (point?.createdUuid) {
      const actor = game.actors?.contents?.find(actor => actor.uuid === point.createdUuid);
      if (canUseAcademyActor(actor)) return this.complete();
    }
    const index = this.chapter.steps.findIndex(step => step.id === point?.stepId);
    if (index >= 0) return this.progress(index);
    return super.start();
  }

  async reset() { getAcademyJourney().clearCheckpoint(this.chapter.id); return super.reset(); }

  async _preStep() {
    await super._preStep();
    const step = this.chapter.steps.find(step => step.id === this.currentStep?.id);
    if (!step) return;
    this.bridge ??= this.bridgeFactory(this.selection);
    let view;
    try { view = await this.bridge.prepare({ ...step, gmOnly: this.chapter.gmOnly }); }
    catch (error) {
      console.warn("DDA | Tutorial view could not be opened", error);
      view = { hint: localizeAcademy("DDA.Academy.ViewUnavailable") };
    }
    this.target = academyTarget(view?.root, step.selector);
    this.currentStep.title = localizeAcademy(step.titleKey);
    this.currentStep.content = academyDialogue(step, { hint: view?.hint ?? "", practiceAvailable: canPractiseAcademyStep(step) });
    if (this.target) this.currentStep.selector = "[data-dda-academy-focus]";
    else delete this.currentStep.selector;
  }

  _getTargetElement() { return this.target; }

  async _renderStep() {
    await super._renderStep();
    const root = this.currentStep?.selector ? game.tooltip?.tooltip ?? document.querySelector("#tooltip") : this.targetElement;
    const content = root?.querySelector?.(".dda-academy-dialogue") ?? document.querySelector(".tour .dda-academy-dialogue");
    content?.closest(".tour, #tooltip, [role='tooltip']")?.classList.add("dda-hina-tour");
    content?.querySelector(".dda-academy-practice-trigger")?.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      void this.beginPractice().catch(error => { console.error("DDA | Could not open practice", error); ui.notifications.error(localizeAcademy("DDA.Academy.Failed")); });
    });
  }

  async beginPractice() {
    const journey = getAcademyJourney();
    if (this.practice?.active) { this.coach?.bringToFront(); return this.practice; }
    if (!this.currentStep || (NativeTour.activeTour && NativeTour.activeTour !== this)) return null;
    // Pause the native Tour so its overlay and keybindings cannot intercept editing.
    super.exit();
    const session = new AcademyPracticeSession(this, journey, { onChange: () => {
      if (this.coach?.rendered) void this.coach.render({ force: false }).catch(error => console.warn("DDA | Practice refresh failed", error));
    } });
    this.practice = session;
    this.coach = new HinaAcademyCoach(session);
    try {
      await session.start();
      if (!session.active) return null;
      await this.coach.render({ force: true });
      this.coach.bringToFront();
      return session;
    } catch (error) { session.dispose(); await this._cleanupGuide(); throw error; }
  }

  async resumeReading() {
    if (!this.practice?.active) return false;
    if (NativeTour.tourInProgress) { ui.notifications.warn(localizeAcademy("DDA.Academy.Busy")); return false; }
    if (this.practice.createdActor) return this.practice.finish();
    const index = this.practice.index;
    this.practice.dispose(); this.practice = null;
    const coach = this.coach; this.coach = null;
    await coach?.close();
    await this.progress(index);
    return true;
  }

  exit() {
    const result = super.exit();
    this.cleanupPromise = this._cleanupGuide();
    return result;
  }

  async complete() {
    if (NativeTour.activeTour && NativeTour.activeTour !== this) {
      ui.notifications.warn(localizeAcademy("DDA.Academy.Busy")); return false;
    }
    let result;
    try { result = await super.complete(); }
    catch (error) { super.exit(); throw error; }
    finally { await this._cleanupGuide(); }
    // The native Tour changes its step before persisting progress. A failed write
    // must not announce completion or discard the player's practice checkpoint.
    if (this.status === "completed") { getAcademyJourney().finish(this.chapter.id); await this.onComplete?.(this); }
    return result;
  }

  async _cleanupGuide() {
    this.practice?.dispose(); this.practice = null;
    const coach = this.coach; this.coach = null;
    await coach?.close();
    const bridge = this.bridge;
    this.bridge = null;
    this.target = null;
    document.querySelectorAll(".dda-hina-tour").forEach(element => element.classList.remove("dda-hina-tour"));
    try { await bridge?.cleanup(); }
    catch (error) { console.warn("DDA | Tutorial UI cleanup failed", error); }
  }
}
