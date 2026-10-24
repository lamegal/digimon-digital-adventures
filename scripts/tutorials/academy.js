import { ACADEMY_CHAPTERS } from "./academy-catalog.js";
import { ACADEMY_NAMESPACE, hinaPortrait, isAcademyDigimon, canUseAcademyActor, localizeAcademy, resolveAcademyActors } from "./academy-helpers.js";
import { academyElement } from "./academy-ui.js";
import { HinaAcademyTour } from "./hina-tour.js";
import { getAcademyJourney } from "./academy-journey.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
let activeAcademy = null;
let startingChapter = false;

export function availableAcademyChapters() {
  return ACADEMY_CHAPTERS.filter(chapter => !chapter.gmOnly || game.user?.isGM);
}

export function registerAcademyTours() {
  for (const chapter of ACADEMY_CHAPTERS) {
    const id = `academy-${chapter.id}`;
    if (!game.tours.get(`${ACADEMY_NAMESPACE}.${id}`)) game.tours.register(ACADEMY_NAMESPACE, id, new HinaAcademyTour(chapter, {
      onComplete: tour => HinaAcademyApplication.open({ completedChapter: tour.chapter.id })
    }));
  }
}

export async function startAcademyChapter(id, selection = {}, { restart = false } = {}) {
  const chapter = availableAcademyChapters().find(chapter => chapter.id === id);
  if (!chapter) { ui.notifications.warn(localizeAcademy("DDA.Academy.GMOnly")); return false; }
  registerAcademyTours();
  const tour = game.tours.get(`${ACADEMY_NAMESPACE}.academy-${id}`);
  if (startingChapter || foundry.nue.Tour.tourInProgress) {
    ui.notifications.warn(localizeAcademy("DDA.Academy.Busy"));
    return false;
  }
  startingChapter = true;
  try {
    const journey = getAcademyJourney();
    const previousPractice = journey.practice;
    if (previousPractice?.active) { previousPractice.dispose(); await previousPractice.tour._cleanupGuide(); }
    journey.select(Object.keys(selection ?? {}).length ? selection : journey.selection);
    // A failed native progress write can leave a completed step index in memory
    // while guided practice still has a valid checkpoint to finish or resume.
    if (restart || (tour.status === "completed" && !journey.checkpoints[id])) await tour.reset();
    tour.selection = journey.selection;
    await tour.start();
    return true;
  } finally { startingChapter = false; }
}

export class HinaAcademyApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dda-hina-academy", classes: ["dda", "dda-hina-academy"],
    position: { width: 900, height: 760 },
    window: { title: "DDA.Academy.Title", icon: "fas fa-graduation-cap", resizable: true },
    actions: { startChapter: HinaAcademyApplication._onLaunch, restartChapter: HinaAcademyApplication._onLaunch,
      continueJourney: HinaAcademyApplication._onLaunch }
  };
  static PARTS = {
    main: { template: "systems/digimon-digital-adventures/templates/apps/dda-hina-academy.hbs", scrollable: [".dda-academy-chapters"] }
  };

  constructor({ actor = null, completedChapter = "", ...options } = {}) {
    super(options);
    const journey = getAcademyJourney();
    if (actor) journey.select({ actor });
    this.selection = journey.selection;
    this.completedChapter = completedChapter;
  }

  static async open({ actor = null, completedChapter = "" } = {}) {
    if (!activeAcademy?.rendered) activeAcademy = new this({ actor, completedChapter });
    else {
      if (actor) { getAcademyJourney().select({ actor }); activeAcademy.selection = getAcademyJourney().selection; }
      activeAcademy.completedChapter = completedChapter;
    }
    await activeAcademy.render({ force: true });
    activeAcademy.bringToFront();
    return activeAcademy;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const selected = resolveAcademyActors(this.selection);
    const journey = getAcademyJourney();
    const recommendedId = journey.recommend(this.completedChapter || journey.lastChapter);
    const recommended = availableAcademyChapters().find(chapter => chapter.id === recommendedId);
    const owned = (game.actors?.contents ?? []).filter(canUseAcademyActor);
    const option = actor => ({ uuid: actor.uuid, name: actor.name, selected: actor === selected.tamer || actor === selected.digimon });
    const chapters = availableAcademyChapters().map(chapter => {
      const tour = game.tours.get(`${ACADEMY_NAMESPACE}.academy-${chapter.id}`);
      const checkpoint = journey.checkpoints[chapter.id];
      const completed = tour?.status === "completed" && !checkpoint;
      const inProgress = !completed && (Boolean(checkpoint) || (Number.isInteger(tour?.stepIndex) && tour.stepIndex >= 0));
      return { ...chapter, stepCount: chapter.steps.length, completed,
        status: localizeAcademy(completed ? "DDA.Academy.Completed" : inProgress ? "DDA.Academy.InProgress" : "DDA.Academy.NotStarted"),
        startLabel: localizeAcademy(inProgress ? "DDA.Academy.Resume" : completed ? "DDA.Academy.Restart" : "DDA.Academy.Start") };
    });
    return { ...context, portrait: hinaPortrait("happy"), recommended, chapterCompleted: Boolean(this.completedChapter),
      tamers: owned.filter(actor => actor.type === "character").map(option),
      digimon: owned.filter(isAcademyDigimon).map(option),
      players: chapters.filter(chapter => !chapter.gmOnly), gms: chapters.filter(chapter => chapter.gmOnly) };
  }

  static async _onLaunch(event, target) {
    event.preventDefault();
    if (this._launching) return;
    this._launching = true;
    const root = academyElement(this.element);
    const selection = {
      tamerUuid: root?.querySelector('[name="academy-tamer"]')?.value ?? "",
      digimonUuid: root?.querySelector('[name="academy-digimon"]')?.value ?? ""
    };
    try {
      const restart = target.dataset.action === "restartChapter";
      if (foundry.nue.Tour.tourInProgress) { ui.notifications.warn(localizeAcademy("DDA.Academy.Busy")); return; }
      await this.close();
      await startAcademyChapter(target.dataset.chapter, selection, { restart });
    } catch (error) {
      console.error("DDA | Could not start Academy chapter", error);
      ui.notifications.error(localizeAcademy("DDA.Academy.Failed"));
    } finally { this._launching = false; }
  }
}

export function attachAcademySheetButton(app, html) {
  if (app.actor?.type !== "character" && !isAcademyDigimon(app.actor)) return;
  const root = academyElement(html) ?? academyElement(app.element);
  const nav = root?.querySelector(".sheet-tabs");
  if (!nav || nav.querySelector(".dda-academy-sheet-help")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dda-academy-sheet-help";
  button.title = localizeAcademy("DDA.Academy.Help");
  button.setAttribute("aria-label", button.title);
  button.innerHTML = '<i class="fas fa-graduation-cap" aria-hidden="true"></i>';
  button.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation();
    void HinaAcademyApplication.open({ actor: app.actor });
  });
  nav.append(button);
}

export function attachAcademySettingsButton(app, html) {
  const root = academyElement(html) ?? academyElement(app.element);
  if (!root || root.querySelector(".dda-academy-sidebar-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dda-academy-sidebar-button";
  button.textContent = localizeAcademy("DDA.Academy.Title");
  button.addEventListener("click", () => { void HinaAcademyApplication.open(); });
  root.append(button);
}

Hooks.once("init", () => {
  game.settings.registerMenu(ACADEMY_NAMESPACE, "hinaAcademy", {
    name: "DDA.Academy.MenuName", label: "DDA.Academy.Title", hint: "DDA.Academy.MenuHint",
    icon: "fas fa-graduation-cap", type: HinaAcademyApplication, restricted: false
  });
});

Hooks.once("ready", () => {
  registerAcademyTours();
  game.dda ??= {};
  game.dda.academy = { open: options => HinaAcademyApplication.open(options), startChapter: startAcademyChapter };
});
Hooks.on("renderDDADigimonSheet", attachAcademySheetButton);
Hooks.on("renderDDACharacterSheet", attachAcademySheetButton);
Hooks.on("renderSettings", attachAcademySettingsButton);
