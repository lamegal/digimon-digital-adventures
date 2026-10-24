import { ACADEMY_NAMESPACE, canUseAcademyActor, isAcademyDigimon, localizeAcademy, resolveAcademyActors } from "./academy-helpers.js";

export function academyElement(element) {
  return element?.querySelector ? element : element?.[0]?.querySelector ? element[0] : null;
}

export async function renderAcademyApp(app, { force = false } = {}) {
  if (!app) return null;
  const V2 = foundry.applications.api.ApplicationV2;
  // In particular, do not re-render an open Settings form and erase its unsaved inputs.
  if (!app.rendered || force) {
    if (app instanceof V2) await app.render({ force: true });
    else await app.render(true);
  }
  if (app.minimized) await app.maximize?.();
  app.bringToFront?.();
  return app;
}

function openApplications() {
  const instances = foundry.applications.instances;
  return [...new Set([...Object.values(globalThis.ui?.windows ?? {}),
    ...(instances instanceof Map ? instances.values() : Object.values(instances ?? {}))])];
}

export function academyTarget(root, selector) {
  if (!root || !selector) return null;
  const targets = [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  return targets.find(element => element.isConnected !== false && element.getClientRects().length > 0) ?? null;
}

async function waitForRadialRoot(hud) {
  // The legacy Token HUD renders asynchronously even when bind() returns immediately.
  // Read its current element on every pass; render hooks may have replaced the root.
  for (let attempt = 0; attempt < 30; attempt++) {
    const root = academyElement(hud.element);
    if (academyTarget(root, ".dda-radial-token-hud")) return root;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return academyElement(hud.element);
}

/** Opens UI only. No create/update, roll, purchase, linking, evolution or setting-write actions. */
export class AcademyUIBridge {
  constructor(selection = {}, { load = path => import(path), wizards = new Map() } = {}) {
    this.selection = selection;
    this.load = load;
    this.apps = new Map();
    this.restores = new Map();
    this.seenApps = new WeakSet();
    for (const [key, app] of wizards) if (app) this.apps.set(key, app);
  }

  async application(key, path, exportName, options = {}) {
    const cached = this.apps.get(key);
    if (cached) {
      if (!this.seenApps.has(cached) && cached.rendered && Number.isInteger(cached.stepIndex)) this.restores.set(cached, cached.stepIndex);
      this.seenApps.add(cached);
      return renderAcademyApp(cached);
    }
    const module = await this.load(path);
    const Class = module[exportName];
    const existing = openApplications().find(app => app instanceof Class && app.rendered && (key !== "digimonWizard" || app.mode !== "formSnapshot"));
    const app = existing ?? new Class(options);
    this.apps.set(key, app);
    this.seenApps.add(app);
    if (existing && Number.isInteger(app.stepIndex)) this.restores.set(app, app.stepIndex);
    return renderAcademyApp(app);
  }

  async prepare(step) {
    if (step.gmOnly && !game.user?.isGM) throw new Error(localizeAcademy("DDA.Academy.GMOnly"));
    const { tamer, digimon } = resolveAcademyActors(this.selection);
    let app = null, root = null;
    if (step.surface === "tamerWizard" || step.surface === "digimonWizard") {
      const isTamer = step.surface === "tamerWizard";
      const other = isTamer ? digimon : tamer;
      const linkContext = other && !(isTamer ? other.system?.tamer?.uuid : other.system?.partner?.uuid)
        ? (isTamer ? { digimonUuid: other.uuid, digimonName: other.name } : { tamerUuid: other.uuid, tamerName: other.name }) : null;
      app = await this.application(step.surface,
        isTamer ? "../wizard/dda-tamer-wizard.js" : "../wizard/dda-digimon-wizard.js",
        isTamer ? "DDATamerWizard" : "DDADigimonWizard", { id: isTamer ? "dda-academy-tamer-wizard" : "dda-academy-digimon-wizard", linkContext });
      if (step.wizardStep) {
        const index = app.steps.indexOf(step.wizardStep);
        if (index < 0) return { root: academyElement(app.element), hint: localizeAcademy("DDA.Academy.BranchHint") };
        if (app.stepIndex !== index) { app.stepIndex = index; await renderAcademyApp(app, { force: true }); }
      }
    } else if (["tamerSheet", "digimonSheet", "planner", "prototype"].includes(step.surface)) {
      const actor = step.surface === "tamerSheet" ? tamer : digimon;
      if (!canUseAcademyActor(actor)) return { hint: localizeAcademy(step.surface === "tamerSheet" ? "DDA.Academy.NeedTamer" : "DDA.Academy.NeedDigimon") };
      if (step.surface === "planner") {
        if (!this.apps.get("planner")?.rendered || this.apps.get("planner").sourceActor?.uuid !== actor.uuid) {
          const { DDAPartnerFormPlanner } = await this.load("../apps/dda-partner-form-planner.js");
          // Both normal open() and context preparation can write snapshots.
          // A guided visit requests the read-only context instead.
          const existing = openApplications().find(app => app instanceof DDAPartnerFormPlanner && app.sourceActor?.uuid === actor.uuid && app.rendered && !app.darkEvolutionMode);
          this.apps.set("planner", existing ?? new DDAPartnerFormPlanner(actor, { readOnlyContext: true }));
        }
        app = await renderAcademyApp(this.apps.get("planner"));
      } else if (step.surface === "prototype") {
        if (!this.apps.get("prototype")?.rendered || this.apps.get("prototype").actor?.uuid !== actor.uuid) {
          const Class = CONFIG.Token.prototypeSheetClass;
          const existing = openApplications().find(app => app instanceof Class && app.actor?.uuid === actor.uuid && app.rendered);
          this.apps.set("prototype", existing ?? new Class({ prototype: actor.prototypeToken }));
        }
        app = await renderAcademyApp(this.apps.get("prototype"));
      } else app = await renderAcademyApp(actor.sheet);
      if (step.tab && app.changeTab) {
        const group = step.surface === "prototype" ? Object.keys(app.tabGroups ?? {})[0] ?? "sheet" : "primary";
        await app.changeTab(step.tab, group);
      }
    } else if (step.surface === "radial") {
      const canvas = globalThis.canvas;
      const chosen = step.tokenKind === "tamer" ? tamer : step.tokenKind === "digimon" ? digimon : digimon ?? tamer;
      const hint = localizeAcademy(step.tokenKind === "tamer" ? "DDA.Academy.NeedTamerToken" : step.tokenKind === "digimon" ? "DDA.Academy.NeedDigimonToken" : "DDA.Academy.NeedToken");
      if (!chosen) return { hint };
      const suitable = token => canUseAcademyActor(token.actor) && (token.actor?.uuid === chosen.uuid ||
        (!chosen.isToken && chosen.id && token.document?.actorId === chosen.id))
        && (step.tokenKind === "tamer" ? token.actor.type === "character" : step.tokenKind !== "digimon" || isAcademyDigimon(token.actor));
      const selectedToken = canvas?.tokens?.controlled?.find(suitable);
      const token = selectedToken ?? canvas?.tokens?.placeables?.find(token => chosen && suitable(token) && token.visible !== false);
      if (!token || !canvas?.tokens?.hud) return { hint };
      await canvas.tokens.hud.bind(token);
      root = await waitForRadialRoot(canvas.tokens.hud);
    } else if (step.surface === "npc") {
      app = await this.application("npc", "../apps/dda-digimon-enemy-wizard.js", "DDADigimonEnemyWizard");
    } else if (step.surface === "gmTools") {
      app = await this.application("gmTools", "../apps/dda-gm-tools.js", "DDAGmTools");
    } else if (step.surface === "progress") {
      app = await this.application("progress", "../apps/gm-partner-progress-panel.js", "DDAGMPartnerProgressPanel");
    } else if (step.surface === "settings") {
      app = await renderAcademyApp(game.settings.sheet);
      root = academyElement(app?.element);
      if (Object.hasOwn(app?.tabGroups ?? {}, "categories")) await app.changeTab("system", "categories");
      else {
        const category = root?.querySelector(`[data-tab="${ACADEMY_NAMESPACE}"]`);
        if (category && app.changeTab && category.dataset.group) await app.changeTab(category.dataset.tab, category.dataset.group);
        else category?.click();
      }
    } else if (step.surface === "actors" || step.surface === "combat") {
      if (ui[step.surface]?.activate) await ui[step.surface].activate();
      else await ui.sidebar?.changeTab(step.surface, "primary");
      root = academyElement(ui[step.surface]?.element);
    }
    root ??= academyElement(app?.element);
    return { root, hint: step.surface && !root ? localizeAcademy("DDA.Academy.ViewUnavailable") : "" };
  }

  async cleanup() {
    // Restore an existing user's wizard page; never close or discard their draft.
    for (const [app, stepIndex] of this.restores) {
      if (!app.rendered) continue;
      app.stepIndex = stepIndex;
      await renderAcademyApp(app, { force: true });
    }
    this.restores.clear();
  }
}
