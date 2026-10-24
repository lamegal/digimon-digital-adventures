// node --experimental-vm-modules --test tests/condition-visuals.mjs
// Actual production module; simulated Foundry v13 and PIXI lifecycle APIs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../scripts/tokens/dda-condition-visuals.js", import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

async function fixture({ mode = "animated", lang = "en", gm = false, reduced = false, brokenFilter = false } = {}) {
  const hooks = new Map();
  const once = new Map();
  const frames = new Map();
  let serial = 0;
  let selectedMode = mode;
  let clock = 12000;
  const warnings = [];
  const points = () => ({ x: 0, y: 0, set(x, y = x) { this.x = x; this.y = y; } });
  class Container {
    constructor() { this.children = []; this.position = points(); this.scale = points(); this.destroyed = false; }
    addChild(child) { this.children.push(child); child.parent = this; return child; }
    sortChildren() { this.children.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)); }
    destroy() {
      for (const child of [...this.children]) child.destroy?.();
      this.children = [];
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
      this.destroyed = true;
    }
  }
  class Graphics extends Container {}
  for (const name of ["lineStyle", "beginFill", "endFill", "drawRoundedRect", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "drawCircle", "drawEllipse", "closePath"]) {
    Graphics.prototype[name] = function () { return this; };
  }
  class Text extends Container { constructor(text) { super(); this.text = text; this.anchor = points(); } }
  class Filter {
    constructor(_vertex, fragment, uniforms) {
      if (brokenFilter) throw new Error("Simulated unavailable filter");
      this.fragment = fragment; this.uniforms = uniforms;
    }
    destroy() { this.destroyed = true; this.uniforms = null; }
  }
  const ticker = { callbacks: new Set(), add(fn) { this.callbacks.add(fn); }, remove(fn) { this.callbacks.delete(fn); } };
  const motion = { matches: reduced, addEventListener(_event, callback) { this.callback = callback; }, removeEventListener() { this.callback = null; } };
  let setting;
  const game = { user: { isGM: gm }, i18n: { lang }, dda: {}, settings: {
    get: () => selectedMode,
    register(_system, _key, data) { setting = data; }
  } };
  const canvas = { ready: true, tokens: { placeables: [] }, app: { ticker } };
  const Hooks = {
    once(event, callback) { once.set(event, callback); },
    on(event, callback) { const id = ++serial; const listeners = hooks.get(event) ?? new Map(); listeners.set(id, callback); hooks.set(event, listeners); return id; },
    off(event, id) { hooks.get(event)?.delete(id); }
  };
  const context = vm.createContext({ game, canvas, Hooks, PIXI: { Container, Graphics, Text, Filter },
    performance: { now: () => clock }, matchMedia: () => motion,
    requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    console: { warn: (...args) => warnings.push(args) }
  });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => { throw new Error("No external imports expected"); });
  await module.evaluate();
  once.get("init")();
  once.get("ready")();
  const emit = (event, ...args) => { for (const callback of hooks.get(event)?.values() ?? []) callback(...args); };
  function flush() {
    let guard = 0;
    while (frames.size) {
      assert.ok(++guard < 10, "RAF must settle");
      const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback());
    }
  }
  function token(status = {}, effects = [], overrides = {}) {
    const object = new Container();
    const foreignFilter = { name: "other-module" };
    Object.assign(object, {
      id: "token-" + canvas.tokens.placeables.length, w: 100, h: 100, visible: true, isVisible: true,
      actor: { type: "digimon", system: { status: structuredClone(status), effects: { active: structuredClone(effects) }, combat: { actions: { value: 2 } } },
        update() { throw new Error("Visuals must never update Actor data"); } },
      mesh: { filters: [foreignFilter], alpha: 0.72, tint: 0xffaa44 },
      ...overrides
    });
    object.document = { id: object.id, uuid: "Scene.S.Token." + object.id, hidden: false, width: 1, height: 1, texture: { scaleX: 1, scaleY: 1 }, object,
      update() { throw new Error("Visuals must never update Token data"); } };
    object.foreignFilter = foreignFilter;
    canvas.tokens.placeables.push(object);
    emit("drawToken", object); flush(); return object;
  }
  return { api: game.dda.conditionVisuals, namespace: module.namespace, game, canvas, token, emit, flush, ticker, frames, motion, warnings,
    get setting() { return setting; },
    changeMode(value) { selectedMode = value; setting.onChange(); flush(); },
    tick() { clock += 1000; for (const callback of [...ticker.callbacks]) callback(); }
  };
}

test("reads environmental states and active effects without changing data", async () => {
  const f = await fixture();
  const actor = { system: { status: { sight: "blinded", cover: "major", submerged: true }, effects: { active: [
    { tag: " [ FEAR ] ", remaining: 2 }, { tag: "taunt", duration: 3 }, { tag: "doom", remaining: 1, value: 6, potency: 3 }
  ] } } };
  const before = JSON.stringify(actor);
  assert.deepEqual(plain(f.namespace.readConditionVisualState(actor)), { obscured: false, cover: 2, blinded: true, submerged: true, fear: true, taunt: true, doom: true, doomValue: 6 });
  assert.equal(JSON.stringify(actor), before);
  f.api.stop();
});

test("expired, disabled and inactive records are excluded; active BLIND is supported", async () => {
  const f = await fixture();
  const actor = { system: { effects: { active: [
    { tag: "fear", remaining: 0 }, { tag: "taunt", remaining: 2, disabled: true },
    { tag: "doom", duration: 1, active: false }, { tag: "blind", remaining: 2 }
  ] } } };
  const state = f.namespace.readConditionVisualState(actor);
  assert.equal(state.blinded, true); assert.equal(state.fear, false); assert.equal(state.taunt, false); assert.equal(state.doom, false);
  f.api.stop();
});

test("keeps foreign filters, token geometry, alpha, tint and target indicators", async () => {
  const f = await fixture(); const token = f.token({ submerged: true });
  const indicator = { name: "targetArrows", zIndex: 10080 }; token.addChild(indicator); token.sortChildren();
  assert.equal(token.mesh.filters.length, 2); assert.equal(token.mesh.filters[0], token.foreignFilter);
  assert.equal(token.mesh.alpha, 0.72); assert.equal(token.mesh.tint, 0xffaa44);
  assert.equal(token.w, 100); assert.equal(token.document.width, 1); assert.equal(token.document.texture.scaleX, 1);
  const layer = token.children.find(child => child.name === "dda-condition-visuals");
  assert.equal(layer.eventMode, "none"); assert.equal(layer.interactiveChildren, false);
  assert.ok(layer.zIndex < indicator.zIndex); assert.equal(token.children.at(-1), indicator);
  f.api.stop(); assert.equal(token.mesh.filters.length, 1); assert.equal(token.mesh.filters[0], token.foreignFilter);
});

test("repeated hooks do not duplicate overlays, filters or animation listeners", async () => {
  const f = await fixture(); const token = f.token({ sight: "obscured" });
  for (let n = 0; n < 20; n++) { f.emit("refreshToken", token); f.emit("updateActor", token.actor); }
  f.flush();
  assert.equal(token.children.filter(child => child.name === "dda-condition-visuals").length, 1);
  assert.equal(token.mesh.filters.length, 2); assert.equal(f.ticker.callbacks.size, 1);
  const before = token.mesh.filters[1].uniforms.uTime; f.tick(); assert.notEqual(token.mesh.filters[1].uniforms.uTime, before);
  f.api.stop();
});

test("removing all conditions clears the visual and stops the ticker", async () => {
  const f = await fixture(); const token = f.token({ sight: "blinded" });
  token.actor.system.status = {}; f.emit("updateActor", token.actor); f.flush();
  assert.equal(f.api.activeTokenCount, 0); assert.equal(f.ticker.callbacks.size, 0);
  assert.equal(token.mesh.filters.length, 1); assert.equal(token.mesh.filters[0], token.foreignFilter); assert.equal(token.children.length, 0);
  assert.equal(token.actor.system.combat.actions.value, 2); f.api.stop();
});

test("Doom shows its current value and rebuilds when that value changes", async () => {
  const f = await fixture(); const token = f.token({}, [{ tag: "doom", remaining: 3, value: 8, potency: 2 }]);
  const texts = () => token.children.flatMap(layer => layer.children).flatMap(badge => badge.children).filter(child => "text" in child).map(child => child.text);
  assert.deepEqual(texts(), ["8"]);
  token.actor.system.effects.active[0].value = 5; f.emit("updateActor", token.actor); f.flush(); assert.deepEqual(texts(), ["5"]);
  f.api.stop();
});

test("token resizing and mesh replacement preserve the old mesh and its foreign filter", async () => {
  const f = await fixture(); const token = f.token({ submerged: true });
  const oldMesh = token.mesh; const firstLayer = token.children[0];
  const newForeign = { name: "other-new" }; token.mesh = { filters: [newForeign] }; token.w = token.h = 200;
  f.emit("updateToken", token.document); f.flush();
  assert.equal(oldMesh.filters.length, 1); assert.equal(oldMesh.filters[0], token.foreignFilter); assert.equal(token.mesh.filters[0], newForeign);
  assert.equal(token.mesh.filters.length, 2); assert.equal(firstLayer.destroyed, true);
  assert.ok(token.children[0].children[0].position.x > 100); f.api.stop();
});

test("client modes switch immediately and retain the underlying conditions", async () => {
  const f = await fixture(); const token = f.token({ submerged: true });
  f.changeMode("icons"); assert.equal(token.mesh.filters.length, 1); assert.equal(f.ticker.callbacks.size, 0); assert.equal(token.children.length, 1);
  f.changeMode("static"); assert.equal(token.mesh.filters.length, 2); assert.equal(token.mesh.filters[1].uniforms.uTime, 0); assert.equal(f.ticker.callbacks.size, 0);
  f.changeMode("off"); assert.equal(token.mesh.filters.length, 1); assert.equal(token.children.length, 0); assert.equal(token.actor.system.status.submerged, true);
  f.changeMode("animated"); assert.equal(token.mesh.filters.length, 2); assert.equal(f.ticker.callbacks.size, 1); f.api.stop();
});

test("honors native hiding and visibility on a player client", async () => {
  const f = await fixture(); const token = f.token({ submerged: true });
  token.document.hidden = true; f.emit("refreshToken", token); f.flush();
  assert.equal(token.children.length, 0); assert.equal(token.mesh.filters.length, 1); assert.equal(token.document.hidden, true);
  token.document.hidden = false; token.isVisible = false; f.emit("refreshToken", token); f.flush(); assert.equal(token.children.length, 0);
  token.isVisible = true; f.emit("refreshToken", token); f.flush(); assert.equal(token.children.length, 1); f.api.stop();
});

test("GM can see condition visuals on a natively hidden token", async () => {
  const f = await fixture({ gm: true }); const token = f.token({ cover: "partial" });
  token.document.hidden = true; f.emit("refreshToken", token); f.flush(); assert.equal(token.children.length, 1);
  assert.equal(token.document.hidden, true); f.api.stop();
});

test("Hidden alone never creates a visual marker or changes native visibility", async () => {
  const f = await fixture(); const token = f.token({ hidden: true });
  assert.equal(token.children.length, 0); assert.equal(token.mesh.filters.length, 1); assert.equal(token.document.hidden, false); f.api.stop();
});

test("deletion without document.object and scene teardown release all resources", async () => {
  const f = await fixture(); const token = f.token({ sight: "blinded" });
  token.document.object = null; f.emit("deleteToken", token.document);
  assert.equal(f.api.activeTokenCount, 0); assert.equal(f.ticker.callbacks.size, 0); assert.equal(token.children.length, 0);
  const other = f.token({ submerged: true }); f.emit("refreshToken", other); f.emit("canvasTearDown");
  assert.equal(f.frames.size, 0); assert.equal(other.mesh.filters.length, 1); assert.equal(f.api.activeTokenCount, 0); f.api.stop();
});

test("reduced motion retains static cues and resumes animation when allowed", async () => {
  const f = await fixture({ reduced: true }); const token = f.token({ submerged: true });
  assert.equal(token.mesh.filters.length, 2); assert.equal(f.ticker.callbacks.size, 0); assert.equal(token.mesh.filters[1].uniforms.uTime, 0);
  f.motion.matches = false; f.motion.callback(); f.flush(); assert.equal(f.ticker.callbacks.size, 1); f.api.stop();
});

test("settings are localized in Portuguese and English", async () => {
  const english = await fixture(); assert.equal(english.setting.name, "DDA — condition visuals"); assert.equal(english.setting.scope, "client"); english.api.stop();
  const portuguese = await fixture({ lang: "pt-BR" }); assert.equal(portuguese.setting.name, "DDA — visuais de condições"); assert.equal(portuguese.setting.choices.icons, "Somente ícones"); portuguese.api.stop();
});

test("a filter construction failure retains icons and reports only once", async () => {
  const f = await fixture({ brokenFilter: true }); const token = f.token({ submerged: true });
  f.emit("refreshToken", token); f.flush(); assert.equal(token.children.length, 1); assert.equal(token.mesh.filters.length, 1); assert.equal(f.warnings.length, 1); f.api.stop();
});

test("uninstall removes hooks and only the visuals created by this module", async () => {
  const f = await fixture(); const token = f.token({ submerged: true }); f.api.stop();
  assert.equal(f.game.dda.conditionVisuals, undefined); assert.equal(f.ticker.callbacks.size, 0); assert.equal(token.mesh.filters.length, 1);
  f.emit("refreshToken", token); f.flush(); assert.equal(token.children.length, 0);
});
