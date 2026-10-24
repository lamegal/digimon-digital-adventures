import { ACADEMY_NAMESPACE, canUseAcademyActor, isAcademyDigimon, resolveAcademyActors } from "./academy-helpers.js";

const FLAG = "academyJourney";
let currentJourney = null;

export function academyPairIsLinked(tamer, digimon) {
  return Boolean(tamer && digimon && tamer.system?.partner?.uuid === digimon.uuid && digimon.system?.tamer?.uuid === tamer.uuid);
}

/** Only tutorial metadata is persisted, never a character build or a wizard draft. */
export class AcademyJourney {
  constructor() {
    this.user = game.user;
    let saved;
    try { saved = this.user?.getFlag?.(ACADEMY_NAMESPACE, FLAG); } catch { /* Optional persistence. */ }
    this.selection = {};
    for (const key of ["tamerUuid", "digimonUuid"]) if (typeof saved?.selection?.[key] === "string") this.selection[key] = saved.selection[key];
    this.lastChapter = typeof saved?.lastChapter === "string" ? saved.lastChapter : "";
    this.checkpoints = Object.create(null);
    for (const [chapter, point] of Object.entries(saved?.checkpoints ?? {})) {
      if (!point || typeof point.stepId !== "string") continue;
      this.checkpoints[chapter] = { stepId: point.stepId, createdUuid: typeof point.createdUuid === "string" ? point.createdUuid : "" };
    }
    this.wizards = new Map();
    this.writeQueue = Promise.resolve();
    this.practice = null;
  }

  actors() { return resolveAcademyActors(this.selection); }

  select(selection = {}) {
    const actors = resolveAcademyActors(selection);
    Object.assign(this.selection, { tamerUuid: actors.tamer?.uuid ?? "", digimonUuid: actors.digimon?.uuid ?? "" });
    this.persist();
    return this.selection;
  }

  adoptCreated(actor) {
    if (!canUseAcademyActor(actor)) return false;
    const isTamer = actor.type === "character";
    if (!isTamer && !isAcademyDigimon(actor)) return false;
    const role = isTamer ? "tamer" : "digimon";
    this.selection[`${role}Uuid`] = actor.uuid;
    const pair = resolveAcademyActors({ actor });
    const counterpart = isTamer ? pair.digimon : pair.tamer;
    if (counterpart && (isTamer ? actor.system?.partner?.uuid : actor.system?.tamer?.uuid) === counterpart.uuid) {
      this.selection[isTamer ? "digimonUuid" : "tamerUuid"] = counterpart.uuid;
    }
    this.persist();
    return true;
  }

  checkpoint(chapter, stepId, { createdUuid = "" } = {}) {
    const value = { stepId, createdUuid };
    if (JSON.stringify(this.checkpoints[chapter]) === JSON.stringify(value)) return;
    this.checkpoints[chapter] = value;
    this.persist();
  }

  clearCheckpoint(chapter) { delete this.checkpoints[chapter]; this.persist(); }

  finish(chapter) { this.lastChapter = chapter; delete this.checkpoints[chapter]; this.persist(); }

  recommend(chapter = this.lastChapter) {
    const { tamer, digimon } = this.actors();
    if (!chapter) return "welcome";
    if (chapter === "welcome") return tamer ? digimon ? "sheets" : "digimon" : "tamer";
    if (chapter === "tamer") return digimon ? "links" : "digimon";
    if (chapter === "digimon") return tamer ? "links" : "tamer";
    return ({ links: "planning", planning: "evolution", evolution: "sheets", sheets: "rolls", rolls: "radial",
      radial: "combat", combat: "practice", practice: game.user?.isGM ? "gm" : "", gm: "npcs", npcs: "options" })[chapter] ?? "";
  }

  persist() {
    if (!this.user?.setFlag) return this.writeQueue;
    const value = { version: 1, selection: { ...this.selection }, lastChapter: this.lastChapter,
      checkpoints: Object.fromEntries(Object.entries(this.checkpoints).map(([key, point]) => [key, { ...point }])) };
    this.writeQueue = this.writeQueue.then(() => this.user.setFlag(ACADEMY_NAMESPACE, FLAG, value))
      .catch(error => { console.warn("DDA | Academy progress could not be saved", error); });
    return this.writeQueue;
  }
}

export function getAcademyJourney() {
  if (!currentJourney || currentJourney.user !== game.user) currentJourney = new AcademyJourney();
  return currentJourney;
}
