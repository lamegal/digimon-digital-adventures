// node --experimental-vm-modules --test tests/hina-academy.mjs
// Production Academy modules; simulated Foundry v13 UI and native Tour lifecycle.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const dictionaries = Object.fromEntries(['en', 'pt-BR'].map(lang => [lang, JSON.parse(read(`lang/${lang}.json`))]));

async function fixture({ lang = 'en', gm = false } = {}) {
  const state = { warnings: [], errors: [], writes: [], userWrites: [], renders: [], menus: [], hooks: new Map(), listeners: new Map(), views: new Map(), nativeRenders: [] };
  const translate = key => dictionaries[game.i18n.lang]?.[key] ?? key;
  let activeTour = null;
  const progress = {};
  class Element {
    constructor() {
      this.children = []; this.mapping = new Map(); this.dataset = {}; this.style = {};
      this.isConnected = true; this.listeners = new Map(); this.classes = new Set();
      this.classList = { add: (...v) => v.forEach(x => this.classes.add(x)), remove: (...v) => v.forEach(x => this.classes.delete(x)) };
      this.ownerDocument = document;
    }
    matches(selector) { return this.selector === selector; }
    querySelector(selector) { return this.mapping.get(selector) ?? this.children.find(c => c.className === selector.slice(1)) ?? null; }
    querySelectorAll(selector) { const value = this.querySelector(selector); return value ? [value] : []; }
    getClientRects() { return this.isConnected ? [{}] : []; }
    getBoundingClientRect() { return { width: 160, height: 320, top: 10, left: 10 }; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name, callback) { if (this.listeners.get(name) === callback) this.listeners.delete(name); }
    setAttribute(name, value) { this[name] = value; }
    append(child) { this.children.push(child); }
    appendChild(child) { this.append(child); }
    scrollIntoView() {}
    remove() { this.isConnected = false; }
  }
  const document = {
    createElement: () => new Element(), querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild() {} }
  };
  const game = {
    user: { id: 'learner', isGM: gm, character: null,
      getFlag() { return state.savedJourney; },
      async setFlag(namespace, key, value) { assert.equal(namespace, 'digimon-digital-adventures'); assert.equal(key, 'academyJourney'); state.userWrites.push(structuredClone(value)); state.savedJourney = structuredClone(value); } }, actors: { contents: [] },
    i18n: { lang, localize: key => translate(key) },
    settings: {
      settings: new Map(), get(ns, key) { if (ns === 'core' && key === 'tourProgress') return progress; return state.views.get(key); },
      async set(ns, key, value) { assert.equal(`${ns}.${key}`, 'core.tourProgress', 'A tutorial must never write campaign settings'); state.writes.push({ ns, key, value }); },
      registerMenu(ns, key, data) { state.menus.push({ ns, key, data }); }
    },
    tours: new Map()
  };
  // A three-argument native API, with duplicate detection.
  game.tours.register = function (ns, id, tour) {
    assert.equal(arguments.length, 3);
    assert.ok(!this.has(`${ns}.${id}`)); this.set(`${ns}.${id}`, tour);
  };
  class ApplicationV2 {
    constructor(options = {}) { this.options = options; this.element = new Element(); this.rendered = false; this.tabGroups = { primary: 'stats' }; }
    async render(options) {
      assert.equal(typeof options.force, 'boolean'); if (!this.rendered) assert.equal(options.force, true);
      this.lastRenderOptions = options; this.rendered = true; state.renders.push(this); return this;
    }
    bringToFront() { this.front = true; }
    async maximize() { this.minimized = false; }
    async close() { this.rendered = false; this._onClose?.({}); }
    changeTab(tab, group) { this.tabGroups[group] = tab; }
    async _prepareContext() { return {}; }
  }
  class NativeTour {
    static get tourInProgress() { return Boolean(activeTour); }
    static get activeTour() { return activeTour; }
    constructor(config) { this.config = structuredClone(config); this.index = progress[config.namespace]?.[config.id] ?? -1; }
    get currentStep() { return this.config.steps[this.index] ?? null; }
    get stepIndex() { return this.index; }
    get status() { return this.index < 0 ? 'unstarted' : this.index === this.config.steps.length ? 'completed' : 'in-progress'; }
    async start() { if (activeTour && activeTour !== this) throw Error('Another native Tour is active'); await this.progress(this.index < 0 || this.status === 'completed' ? 0 : this.index); }
    async progress(index) {
      if (this.index >= 0) await this._postStep();
      this.index = index;
      progress[this.config.namespace] ??= {}; progress[this.config.namespace][this.config.id] = index;
      await game.settings.set('core', 'tourProgress', progress);
      if (index < 0 || index === this.config.steps.length) { activeTour = null; return; }
      activeTour = this; await this._preStep();
      this.targetElement = this.currentStep.selector ? this._getTargetElement(this.currentStep.selector) : null;
      await this._renderStep();
    }
    async next() { if (this.index + 1 === this.config.steps.length) return this.complete(); await this.progress(this.index + 1); }
    async reset() { return this.progress(-1); }
    exit() { activeTour = null; }
    async complete() { return this.progress(this.config.steps.length); }
    async _preStep() {}
    async _postStep() {}
    async _renderStep() { state.nativeRenders.push(this.currentStep); }
  }
  const context = vm.createContext({
    game, document, console: { ...console, warn: (...args) => state.warnings.push(args) },
    setTimeout, clearTimeout, structuredClone, Map, Set,
    canvas: { tokens: { controlled: [], placeables: [] } },
    ui: { windows: {}, notifications: { warn: v => state.warnings.push(v), error: v => state.errors.push(v) }, sidebar: { changeTab: tab => { state.sidebar = tab; } } },
    Hooks: {
      once: (event, fn) => { state.hooks.set(event, fn); },
      on: (event, fn) => { state.hooks.set(event, fn); const listeners = state.listeners.get(event) ?? new Set(); listeners.add(fn); state.listeners.set(event, listeners); return fn; },
      off: (event, fn) => { state.listeners.get(event)?.delete(fn); },
      callAll: (event, ...args) => { for (const fn of [...(state.listeners.get(event) ?? [])]) fn(...args); }
    },
    CONFIG: { Token: {} },
    foundry: { nue: { Tour: NativeTour }, applications: { instances: new Map(), api: { ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {} } }, utils: { deepClone: structuredClone } }
  });
  // Optional local-only check against an external core Tour source. No Foundry code is redistributed.
  if (process.env.DDA_NATIVE_TOUR_SOURCE) {
    const core = fs.readFileSync(process.env.DDA_NATIVE_TOUR_SOURCE, 'utf8');
    const source = core.slice(core.indexOf('class Tour {'), core.indexOf('\n}\n', core.indexOf('class Tour {')) + 3);
    context._loc = translate;
    game.tooltip = { clearPending() {}, deactivate() {}, activate() {}, tooltip: new Element() };
    context.foundry.applications.handlebars = { renderTemplate: async (path, data) => { state.nativeRenders.push(data); return data.content.join(''); } };
    vm.runInContext('Number.between = (n, lo, hi) => n >= lo && n <= hi;', context);
    vm.runInContext(`${source}\nfoundry.nue.Tour = Tour;`, context);
  }
  const cache = new Map();
  async function load(path) {
    const url = new URL(path, root);
    if (!cache.has(url.href)) {
      const mod = new vm.SourceTextModule(fs.readFileSync(url, 'utf8'), { context, identifier: url.href });
      cache.set(url.href, mod);
      await mod.link(spec => load(new URL(spec, url).href));
    }
    return cache.get(url.href);
  }
  async function get(path) { const mod = await load(path); if (mod.status !== 'evaluated') await mod.evaluate(); return mod.namespace; }
  const actor = (type, id, owned = true) => {
    const value = { id, uuid: `Actor.${id}`, name: id, type, isOwner: owned, system: {}, sheet: new ApplicationV2(), prototypeToken: { parent: null } };
    value.prototypeToken.parent = value;
    value.update = () => assert.fail('Opening a tutorial must not update Actors');
    game.actors.contents.push(value); return value;
  };
  return { get, state, game, context, Element, ApplicationV2, actor, document };
}

test('manifest loads Academy once and all shipped paths exist', () => {
  const manifest = JSON.parse(read('system.json'));
  for (const path of ['scripts/tutorials/academy.js', 'styles/dda-academy.css']) {
    assert.equal([...manifest.esmodules, ...manifest.styles].filter(p => p === path).length, 1);
    assert.ok(fs.existsSync(new URL(path, root)));
  }
  assert.ok(manifest.download.includes(`/v${manifest.version}/`));
  assert.ok(manifest.changelog.endsWith(`/v${manifest.version}`));
});

for (const lang of ['en', 'pt-BR']) {
  test(`${lang}: every chapter, step and launcher string is translated`, async () => {
    const f = await fixture({ lang }); const { ACADEMY_CHAPTERS } = await f.get('scripts/tutorials/academy-catalog.js');
    const text = dictionaries[lang]; const used = new Set();
    for (const chapter of ACADEMY_CHAPTERS) {
      assert.ok(!used.has(chapter.id)); used.add(chapter.id);
      for (const key of [chapter.titleKey, chapter.descriptionKey]) assert.ok(text[key]?.trim(), key);
      const ids = new Set();
      for (const step of chapter.steps) {
        assert.ok(!ids.has(step.id)); ids.add(step.id);
        for (const key of [step.titleKey, step.textKey]) assert.ok(text[key]?.trim(), key);
        if (chapter.id === 'options') assert.equal(step.experimental, true);
      }
    }
    const enKeys = Object.keys(dictionaries.en).filter(k => k.startsWith('DDA.Academy.')).sort();
    assert.deepEqual(Object.keys(text).filter(k => k.startsWith('DDA.Academy.')).sort(), enKeys);
    for (const file of ['templates/apps/dda-hina-academy.hbs', 'templates/apps/dda-academy-coach.hbs']) {
      for (const key of read(file).matchAll(/localize ["']([^"']+)/g)) assert.ok(text[key[1]], key[1]);
    }
  });

  test(`${lang}: speech is escaped, uses one native paragraph item and reads settings without writing`, async () => {
    const f = await fixture({ lang }); const helpers = await f.get('scripts/tutorials/academy-helpers.js');
    f.game.settings.settings.set('digimon-digital-adventures.test', { config: true, name: 'Test setting' });
    f.state.views.set('test', '<img onerror=evil()>');
    const html = helpers.academyDialogue({ id: 'test', textKey: 'DDA.Academy.Step.options.intro.Text', mood: 'serious', experimental: true, settingKeys: ['test', 'not-registered'], reference: 'Book <source>' });
    assert.ok(!html.includes('\n')); assert.ok(!html.includes('<img')); assert.match(html, /&lt;img/);
    assert.match(html, /&lt;source&gt;/); assert.match(html, /<strong>/);
    assert.ok(html.includes(dictionaries[lang]['DDA.Academy.InDevelopment'])); assert.equal(f.state.writes.length, 0);
    assert.equal(helpers.academyProse('<script>bad()</script>'), '<p>&lt;script&gt;bad()&lt;/script&gt;</p>');
  });

  test(`${lang}: native Tour registration, progress, resume and completion`, async () => {
    const f = await fixture({ lang }); const api = await f.get('scripts/tutorials/academy.js');
    api.registerAcademyTours(); const count = f.game.tours.size; api.registerAcademyTours(); assert.equal(f.game.tours.size, count);
    const tour = f.game.tours.get('digimon-digital-adventures.academy-welcome');
    tour.bridgeFactory = () => ({ prepare: async () => ({}), cleanup: async () => { f.state.cleaned = (f.state.cleaned ?? 0) + 1; } });
    assert.equal(tour.config.canBeResumed, true); assert.equal(tour.config.display, true);
    await tour.start(); assert.ok(tour.currentStep.content.includes(dictionaries[lang]['DDA.Academy.Hina']));
    await tour.next(); tour.exit(); await tour.cleanupPromise; assert.equal(f.state.cleaned, 1);
    const index = tour.stepIndex; await tour.start(); assert.equal(tour.stepIndex, index);
    await tour.complete(); assert.equal(tour.status, 'completed'); assert.equal(f.state.cleaned, 2);
    assert.ok(f.state.writes.every(write => write.ns === 'core' && write.key === 'tourProgress'));
  });
}

test('all eight Hina crops use the first outfit and identical source/display frames', async () => {
  const f = await fixture(); const { HINA_FRAME: box, HINA_POSES: poses, hinaPortrait } = await f.get('scripts/tutorials/academy-helpers.js');
  assert.equal(Object.keys(poses).length, 8); assert.equal(box.width, 248); assert.equal(box.height, 496); assert.equal(box.y, 7);
  for (const [mood, x] of Object.entries(poses)) {
    assert.ok(x + box.width <= box.atlasWidth); assert.ok(box.y + box.height <= 503);
    const html = hinaPortrait(mood); assert.match(html, new RegExp(`data-hina-mood="${mood}"`));
    const percentages = [...html.matchAll(/--hina-[xy]:([\d.]+)%/g)].map(m => Number(m[1]));
    assert.ok(Math.abs(percentages[0] / 100 * (box.atlasWidth - box.width) - x) < 1e-8);
    assert.ok(Math.abs(percentages[1] / 100 * (box.atlasHeight - box.height) - box.y) < 1e-8);
  }
  const png = fs.readFileSync(new URL('assets/tutorial/hina-atlas.png', root));
  assert.equal(png.readUInt32BE(16), box.atlasWidth); assert.equal(png.readUInt32BE(20), box.atlasHeight);
  const css = read('styles/dda-academy.css');
  assert.match(css, /min-width: 160px/); assert.match(css, /max-width: 160px/); assert.match(css, /min-height: 320px/); assert.match(css, /max-height: 320px/);
  assert.ok(!css.slice(css.indexOf('@media')).includes('dda-academy-portrait'), 'Viewport changes must not resize Hina');
  assert.match(hinaPortrait('__proto__'), /data-hina-mood="explaining"/);
});

test('actor selection respects ownership, explicit blanks and explicit invalid references', async () => {
  const f = await fixture(); const { resolveAcademyActors: resolve } = await f.get('scripts/tutorials/academy-helpers.js');
  const tamer = f.actor('character', 'tamer'); const partner = f.actor('digimon', 'partner'); const other = f.actor('digimon', 'private', false);
  tamer.system.partner = { uuid: partner.uuid }; partner.system.tamer = { uuid: tamer.uuid };
  assert.equal(resolve({ actor: partner }).tamer, tamer); assert.equal(resolve({ actor: tamer }).digimon, partner);
  assert.equal(resolve({ tamerUuid: '', digimonUuid: '' }).tamer, null); assert.equal(resolve({ tamerUuid: '', digimonUuid: '' }).digimon, null);
  assert.equal(resolve({ tamerUuid: tamer.uuid, digimonUuid: '' }).digimon, null);
  assert.equal(resolve({ digimonUuid: other.uuid }).digimon, null);
  assert.equal(resolve({ digimonUuid: 'Actor.missing' }).digimon, null);
  f.game.user.isGM = true; assert.equal(resolve({ digimonUuid: other.uuid }).digimon, other);
});

test('GM chapters and surfaces are unavailable to players, including direct native starts', async () => {
  const f = await fixture(); const api = await f.get('scripts/tutorials/academy.js'); api.registerAcademyTours();
  assert.ok(api.availableAcademyChapters().every(chapter => !chapter.gmOnly));
  assert.equal(await api.startAcademyChapter('options'), false);
  await assert.rejects(f.game.tours.get('digimon-digital-adventures.academy-options').start());
  const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  let imports = 0; const bridge = new AcademyUIBridge({}, { load: () => { imports++; } });
  await assert.rejects(bridge.prepare({ surface: 'npc', gmOnly: true })); assert.equal(imports, 0);
  f.game.user.isGM = true; assert.ok(api.availableAcademyChapters().some(chapter => chapter.id === 'options'));
});

test('missing sheets, missing branches and unavailable UI keep explanations usable', async () => {
  const f = await fixture(); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  const { HinaAcademyTour } = await f.get('scripts/tutorials/hina-tour.js');
  const empty = new AcademyUIBridge({ tamerUuid: '', digimonUuid: '' });
  const result = await empty.prepare({ surface: 'digimonSheet' }); assert.ok(result.hint); assert.equal(result.root, undefined);
  const chapter = { id: 'test', titleKey: 'Title', descriptionKey: 'Description', steps: [{ id: 'view', textKey: 'Text', titleKey: 'Step', selector: '.missing' }] };
  const tour = new HinaAcademyTour(chapter, { bridgeFactory: () => ({ prepare() { throw Error('missing module'); }, cleanup() {} }) });
  await tour.start(); assert.equal(tour.currentStep.selector, undefined); assert.match(tour.currentStep.content, /dda-academy-context-hint/); tour.exit(); await tour.cleanupPromise;
  class Wizard extends f.ApplicationV2 { constructor() { super(); this.stepIndex = 0; this.steps = ['welcome']; } }
  const bridge = new AcademyUIBridge({}, { load: async () => ({ DDADigimonWizard: Wizard }) });
  const branch = await bridge.prepare({ surface: 'digimonWizard', wizardStep: 'stats' }); assert.ok(branch.hint); assert.equal(bridge.apps.get('digimonWizard').stepIndex, 0);
});

test('targets are scoped to the chosen visible view, never an unrelated open actor', async () => {
  const f = await fixture(); const { academyTarget } = await f.get('scripts/tutorials/academy-ui.js');
  const root = new f.Element(), visible = new f.Element(), hidden = new f.Element(); hidden.isConnected = false;
  root.querySelectorAll = () => [hidden, visible]; assert.equal(academyTarget(root, '.stats'), visible);
  assert.equal(academyTarget(null, '.stats'), null); assert.equal(academyTarget(root, null), null);
});

test('existing wizard drafts remain open and their original step is restored', async () => {
  const f = await fixture(); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  class Wizard extends f.ApplicationV2 { constructor() { super(); this.stepIndex = 2; this.steps = ['welcome', 'identity', 'summary']; this.data = { name: 'My unsaved draft' }; } }
  const existing = new Wizard(); existing.rendered = true; f.context.foundry.applications.instances.set('wizard', existing);
  const bridge = new AcademyUIBridge({}, { load: async () => ({ DDATamerWizard: Wizard }) });
  await bridge.prepare({ surface: 'tamerWizard', wizardStep: 'identity' }); assert.equal(existing.stepIndex, 1);
  await bridge.cleanup(); assert.equal(existing.stepIndex, 2); assert.equal(existing.rendered, true); assert.equal(existing.data.name, 'My unsaved draft');
});

test('planner opens without its repair-and-write helper and Prototype Token receives the native prototype option', async () => {
  const f = await fixture(); const digimon = f.actor('digimon', 'partner');
  const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  class Planner extends f.ApplicationV2 { constructor(actor, options) { super(); this.sourceActor = actor; assert.equal(options.readOnlyContext, true); } static open() { assert.fail('Normal planner open can repair Actor data'); } }
  class Prototype extends f.ApplicationV2 { constructor(options) { super(options); assert.equal(options.prototype, digimon.prototypeToken); this.actor = options.prototype.parent; this.tabGroups = { sheet: 'identity' }; } }
  f.context.CONFIG.Token.prototypeSheetClass = Prototype;
  const bridge = new AcademyUIBridge({ digimonUuid: digimon.uuid }, { load: async () => ({ DDAPartnerFormPlanner: Planner }) });
  await bridge.prepare({ surface: 'planner' }); assert.equal(bridge.apps.get('planner').sourceActor, digimon);
  await bridge.prepare({ surface: 'prototype', tab: 'ddaForms' }); assert.equal(bridge.apps.get('prototype').tabGroups.sheet, 'ddaForms');
  assert.equal(f.state.writes.length, 0);
});

test('visiting settings selects the system category without resetting an unsaved settings form', async () => {
  const f = await fixture({ gm: true }); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  const sheet = new f.ApplicationV2(); sheet.rendered = true; sheet.tabGroups = { categories: 'core' }; sheet.draft = 'not yet submitted';
  sheet.render = () => assert.fail('Do not re-render an existing unsaved form'); f.game.settings.sheet = sheet;
  const bridge = new AcademyUIBridge(); await bridge.prepare({ surface: 'settings', gmOnly: true });
  assert.equal(sheet.tabGroups.categories, 'system'); assert.equal(sheet.draft, 'not yet submitted'); assert.equal(f.state.writes.length, 0);
});

test('radial guide waits for asynchronously rendered DDA HUD without controlling or moving tokens', async () => {
  const f = await fixture(); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js'); const partner = f.actor('digimon', 'partner');
  const token = { actor: partner, visible: true, control: () => assert.fail('Must not change token control') };
  f.context.canvas.tokens.placeables.push(token); const radial = new f.Element();
  f.context.canvas.tokens.hud = { element: null, bind(value) { assert.equal(value, token); setTimeout(() => { this.element = new f.Element(); this.element.mapping.set('.dda-radial-token-hud', radial); }, 5); } };
  const bridge = new AcademyUIBridge({ digimonUuid: partner.uuid }); const view = await bridge.prepare({ surface: 'radial' }); assert.ok(view.root); assert.equal(view.hint, '');
});

test('sidebar navigation uses the native activate API and a primary-group fallback', async () => {
  const f = await fixture(); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  f.context.ui.actors = { element: new f.Element(), activate: () => { f.state.activated = true; } };
  const bridge = new AcademyUIBridge(); await bridge.prepare({ surface: 'actors' }); assert.equal(f.state.activated, true);
  f.context.ui.sidebar.changeTab = (tab, group) => { assert.equal(tab, 'combat'); assert.equal(group, 'primary'); };
  await bridge.prepare({ surface: 'combat' });
});

test('radial lessons show the correct participant instead of the other controlled Token', async () => {
  const f = await fixture(); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  const tamer = f.actor('character', 'tamer'), partner = f.actor('digimon', 'partner');
  const tamerToken = { actor: tamer }, partnerToken = { actor: partner };
  f.context.canvas.tokens.controlled = [partnerToken]; f.context.canvas.tokens.placeables = [tamerToken, partnerToken];
  const root = new f.Element(); root.mapping.set('.dda-radial-token-hud', new f.Element());
  const bound = []; f.context.canvas.tokens.hud = { element: root, bind: token => bound.push(token) };
  const bridge = new AcademyUIBridge({ tamerUuid: tamer.uuid, digimonUuid: partner.uuid });
  await bridge.prepare({ surface: 'radial', tokenKind: 'tamer' }); assert.equal(bound[0], tamerToken);
  await bridge.prepare({ surface: 'radial', tokenKind: 'digimon' }); assert.equal(bound[1], partnerToken);
  f.context.canvas.tokens.placeables = [partnerToken];
  const unavailable = await bridge.prepare({ surface: 'radial', tokenKind: 'tamer' });
  assert.ok(unavailable.hint.includes('Tamer')); assert.equal(bound.length, 2);
});

test('ready API, settings entry and sheet help buttons work without a hidden ellipsis menu', async () => {
  const f = await fixture(); const api = await f.get('scripts/tutorials/academy.js');
  f.state.hooks.get('init')(); assert.equal(f.state.menus.length, 1); assert.equal(f.state.menus[0].data.restricted, false);
  f.state.hooks.get('ready')(); assert.equal(typeof f.game.dda.academy.open, 'function');
  const actor = f.actor('digimon', 'partner'); const root = new f.Element(), nav = new f.Element(); root.mapping.set('.sheet-tabs', nav);
  api.attachAcademySheetButton({ actor }, root); api.attachAcademySheetButton({ actor }, root);
  assert.equal(nav.children.length, 1); assert.equal(nav.children[0].type, 'button'); assert.ok(nav.children[0]['aria-label']);
  api.attachAcademySettingsButton({}, root); api.attachAcademySettingsButton({}, root);
  assert.equal(root.children.length, 1);
  const app = new api.HinaAcademyApplication({ actor }); const context = await app._prepareContext({});
  assert.equal(context.gms.length, 0); assert.ok(context.digimon[0].selected); assert.ok(context.portrait.includes('happy'));
});

test('a new chapter cannot interrupt another native Tour', async () => {
  const f = await fixture(); const api = await f.get('scripts/tutorials/academy.js'); api.registerAcademyTours();
  const tour = f.game.tours.get('digimon-digital-adventures.academy-welcome'); tour.bridgeFactory = () => ({ prepare: async () => ({}), cleanup() {} });
  await tour.start(); assert.equal(await api.startAcademyChapter('tamer'), false); assert.ok(f.state.warnings.length); tour.exit(); await tour.cleanupPromise;
});

test('simultaneous starts cannot create two chapter overlays', async () => {
  const f = await fixture(); const api = await f.get('scripts/tutorials/academy.js'); api.registerAcademyTours();
  const tour = f.game.tours.get('digimon-digital-adventures.academy-welcome');
  tour.bridgeFactory = () => ({ prepare: async () => ({}), cleanup() {} });
  const results = await Promise.all([api.startAcademyChapter('welcome'), api.startAcademyChapter('tamer')]);
  assert.deepEqual(results, [true, false]); tour.exit(); await tour.cleanupPromise;
});

const settlePractice = () => new Promise(resolve => setTimeout(resolve, 60));
const practiceListenerCount = f => ['renderDDATamerWizard','renderDDADigimonWizard','closeDDATamerWizard','closeDDADigimonWizard','renderDDADigimonEnemyWizard','closeDDADigimonEnemyWizard','ddaActivity','updateActor']
  .reduce((count, name) => count + (f.state.listeners.get(name)?.size ?? 0), 0);

async function practiceFixture({ lang = 'en', chapter = 'tamer', pair = false, gm = false } = {}) {
  const f = await fixture({ lang, gm });
  const api = await f.get('scripts/tutorials/academy.js'); api.registerAcademyTours();
  const { getAcademyJourney } = await f.get('scripts/tutorials/academy-journey.js');
  const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  const journey = getAcademyJourney();
  const tamer = pair ? f.actor('character', 'Hikari') : null, partner = pair ? f.actor('digimon', 'Gatomon') : null;
  if (pair) { tamer.system.partner = { uuid: partner.uuid }; partner.system.tamer = { uuid: tamer.uuid }; }
  journey.select({ tamerUuid: tamer?.uuid ?? '', digimonUuid: partner?.uuid ?? '' });
  class Wizard extends f.ApplicationV2 {
    constructor(options = {}) {
      super(options); this.stepIndex = 0;
      this.steps = chapter === 'digimon' ? ['welcome','origin','stage','identity','evolutionLine','stats','qualities','partnerQuestions','summary'] :
        ['welcome','identity','aspects','attributes','skills','inspiration','torments','summary'];
      this.data = { identity: { name: '' }, aspects: { major: { name: '' }, minor: { name: '' } }, validation: { errors: [] } };
      if (chapter === 'npcs') { this.steps = []; this.enemyName = ''; this.selectedFormId = ''; this.npcAlignment = 'enemy'; this.enemyBuild = { dp: 10 }; }
    }
  }
  const bridge = new AcademyUIBridge(journey.selection, { load: async () => ({ DDATamerWizard: Wizard, DDADigimonWizard: Wizard, DDADigimonEnemyWizard: Wizard }) });
  const tour = f.game.tours.get(`digimon-digital-adventures.academy-${chapter}`);
  tour.bridgeFactory = () => bridge;
  await tour.start();
  if (chapter === 'practice') await tour.progress(1);
  const session = await tour.beginPractice();
  return { ...f, api, journey, bridge, tour, session, Wizard, tamer, partner };
}

for (const lang of ['pt-BR', 'en']) {
  test(`${lang}: practicing releases the native Tour and follows the actual wizard without rolling or saving`, async () => {
    const f = await practiceFixture({ lang });
    assert.equal(f.context.foundry.nue.Tour.tourInProgress, false);
    const nativeRenders = f.state.nativeRenders.length;
    const wizard = f.session.app;
    wizard.data.identity.name = 'My Tamer'; wizard.stepIndex = wizard.steps.indexOf('identity');
    f.context.Hooks.callAll('renderDDATamerWizard', wizard);
    await settlePractice();
    assert.equal(f.session.step.id, 'identity'); assert.equal(f.state.nativeRenders.length, nativeRenders);
    assert.equal(f.tour.coach.lastRenderOptions.force, false, 'Automatic guidance must not raise itself above the wizard');
    const context = await f.tour.coach._prepareContext({});
    assert.ok(context.evidence.includes('My Tamer')); assert.equal(context.status, 'changed');
    assert.equal(context.nextLabel, dictionaries[lang]['DDA.Academy.Practice.ContinueSkip']);
    assert.equal(f.state.writes.length, 1, 'Typing must not advance or write native Tour progress');
    await f.tour.coach.close(); await f.tour.cleanupPromise;
    assert.equal(f.session.active, false); assert.equal(wizard.rendered, true); assert.equal(wizard.data.identity.name, 'My Tamer');
    assert.equal(practiceListenerCount(f), 0);
  });

  test(`${lang}: missing evidence and wizard validation messages never disable Continue / skip`, async () => {
    const f = await practiceFixture({ lang });
    await f.session.showStep(f.tour.chapter.steps.length - 1);
    f.session.app.data.validation.errors = ['Review your build'];
    const context = await f.tour.coach._prepareContext({});
    assert.equal(context.status, 'waiting');
    assert.equal(context.nextLabel, dictionaries[lang]['DDA.Academy.Practice.Finish']);
    await f.session.move(1);
    assert.equal(f.tour.status, 'completed'); assert.equal(f.session.active, false);
    assert.equal(f.journey.recommend(), 'digimon');
  });

  test(`${lang}: practice result feedback is localized and zero-Accuracy misses still count as a completed attempt`, async () => {
    const f = await practiceFixture({ lang, chapter: 'practice', pair: true });
    const index = f.tour.chapter.steps.findIndex(step => step.id === 'attack'); await f.session.showStep(index);
    f.context.Hooks.callAll('ddaActivity', { kind: 'attack', userId: 'other-player', actor: f.partner, accuracy: 4, dodge: 0, hit: true });
    assert.equal(f.session.activity, null);
    f.context.Hooks.callAll('ddaActivity', { kind: 'attack', userId: f.game.user.id, actor: f.partner, accuracy: 0, dodge: 0, hit: false });
    const context = await f.tour.coach._prepareContext({});
    assert.equal(context.status, 'done'); assert.ok(context.evidence.includes(dictionaries[lang]['DDA.Academy.Practice.Miss']));
    assert.equal(f.session.index, index, 'Detecting a result must not force the next lesson');
    await f.tour.coach.close(); await f.tour.cleanupPromise;
  });
}

test('creation adoption is scoped to the current wizard and initiating user', async () => {
  const f = await practiceFixture(); const created = f.actor('character', 'new-tamer');
  f.context.Hooks.callAll('ddaActivity', { kind: 'created', userId: f.game.user.id, wizard: {}, actor: created });
  assert.equal(f.journey.actors().tamer, null);
  f.context.Hooks.callAll('ddaActivity', { kind: 'created', userId: 'other', wizard: f.session.app, actor: created });
  assert.equal(f.journey.actors().tamer, null);
  f.context.Hooks.callAll('ddaActivity', { kind: 'created', userId: f.game.user.id, wizard: f.session.app, actor: created });
  assert.equal(f.journey.actors().tamer, created); assert.equal(f.session.createdActor, created);
  assert.equal(f.session.step.id, 'summary'); assert.equal(f.journey.checkpoints.tamer.createdUuid, created.uuid);
  await f.journey.writeQueue; assert.equal(f.state.savedJourney.selection.tamerUuid, created.uuid);
  await f.session.finish(); assert.equal(f.tour.status, 'completed');
});

test('a newly opened partner wizard is reused across chapters with its entered choices intact', async () => {
  const f = await practiceFixture(); const wizard = f.session.app;
  const tamer = f.actor('character', 'new-tamer');
  f.context.Hooks.callAll('ddaActivity', { kind: 'created', userId: f.game.user.id, wizard, actor: tamer });
  wizard.rendered = false;
  const partnerWizard = new f.Wizard({ linkContext: { tamerUuid: tamer.uuid } });
  partnerWizard.steps = ['welcome','origin','identity','summary']; partnerWizard.stepIndex = 2;
  partnerWizard.data.identity.name = 'My chosen partner'; partnerWizard.rendered = true;
  f.context.Hooks.callAll('ddaActivity', { kind: 'wizardOpened', userId: f.game.user.id, sourceWizard: wizard, wizard: partnerWizard, role: 'digimon' });
  await f.session.finish();
  const academy = new f.api.HinaAcademyApplication({ completedChapter: 'tamer' });
  const context = await academy._prepareContext({}); assert.equal(context.recommended.id, 'digimon'); assert.ok(context.tamers.find(actor => actor.uuid === tamer.uuid).selected);
  assert.equal(await f.api.startAcademyChapter('digimon', f.journey.selection), true);
  const next = f.game.tours.get('digimon-digital-adventures.academy-digimon');
  assert.equal(next.bridge.apps.get('digimonWizard'), partnerWizard); assert.equal(partnerWizard.data.identity.name, 'My chosen partner');
  next.exit(); await next.cleanupPromise; assert.equal(partnerWizard.stepIndex, 2);
});

test('closing practice keeps the selected sheets and resumes the observed wizard step', async () => {
  const f = await practiceFixture(); const wizard = f.session.app;
  wizard.stepIndex = wizard.steps.indexOf('attributes');
  f.context.Hooks.callAll('renderDDATamerWizard', wizard); await settlePractice();
  const stepId = f.session.step.id;
  await f.tour.coach.close(); await f.tour.cleanupPromise;
  assert.equal(f.journey.checkpoints.tamer.stepId, stepId);
  await f.tour.start(); assert.equal(f.tour.currentStep.id, stepId); assert.equal(wizard.stepIndex, wizard.steps.indexOf('attributes'));
  f.tour.exit(); await f.tour.cleanupPromise;
});

test('resuming after successful creation completes the chapter without opening another creator', async () => {
  const f = await practiceFixture(); const tamer = f.actor('character', 'finished-tamer');
  f.context.Hooks.callAll('ddaActivity', { kind: 'created', userId: f.game.user.id, wizard: f.session.app, actor: tamer });
  await f.tour.coach.close(); await f.tour.cleanupPromise;
  let opened = 0; f.tour.bridgeFactory = () => ({ prepare() { opened++; }, cleanup() {} });
  await f.tour.start(); assert.equal(f.tour.status, 'completed'); assert.equal(opened, 0);
  assert.equal(f.journey.actors().tamer, tamer);
});

test('switching chapters disposes old listeners while retaining the draft', async () => {
  const f = await practiceFixture(); const wizard = f.session.app; wizard.data.identity.name = 'Keep this draft';
  assert.equal(await f.api.startAcademyChapter('welcome', f.journey.selection), true);
  assert.equal(f.session.active, false); assert.equal(wizard.data.identity.name, 'Keep this draft'); assert.equal(wizard.rendered, true);
  assert.equal(practiceListenerCount(f), 0);
  const next = f.game.tours.get('digimon-digital-adventures.academy-welcome'); next.exit(); await next.cleanupPromise;
});

test('a practice guide cannot finish or interrupt a different active native Tour', async () => {
  const f = await practiceFixture();
  const Native = f.context.foundry.nue.Tour;
  const other = new Native({ namespace: 'other-system', id: 'other-tour', steps: [{ id: 'step', title: 'Other', content: 'Other' }] });
  await other.start();
  assert.equal(await f.session.finish(), false); assert.equal(f.session.active, true); assert.equal(Native.activeTour, other);
  assert.equal(await f.tour.resumeReading(), false); assert.equal(Native.activeTour, other);
  await f.tour.coach.close(); await f.tour.cleanupPromise; assert.equal(Native.activeTour, other); other.exit();
});

test('Direct and Area lessons require their selected participants and proper result kind', async () => {
  const f = await practiceFixture({ chapter: 'practice', pair: true });
  await f.session.showStep(f.tour.chapter.steps.findIndex(step => step.id === 'direct'));
  f.session.onActivity({ kind: 'direct', userId: f.game.user.id, actor: f.tamer, target: { uuid: 'Actor.someone-else' }, bonus: 3 });
  assert.equal(f.session.activity, null);
  f.session.onActivity({ kind: 'direct', userId: f.game.user.id, actor: f.tamer, target: f.partner, bonus: 3 }); assert.equal(f.session.evidence().status, 'done');
  await f.session.showStep(f.tour.chapter.steps.findIndex(step => step.id === 'area'));
  f.session.onActivity({ kind: 'attack', userId: f.game.user.id, actor: f.partner, area: false, hit: true }); assert.equal(f.session.activity, null);
  f.session.onActivity({ kind: 'attack', userId: f.game.user.id, actor: f.partner, area: true, accuracy: 2, dodge: 1, hit: true }); assert.equal(f.session.evidence().status, 'done');
  await f.tour.coach.close(); await f.tour.cleanupPromise;
});

test('creation preselects a pending link only when it will not replace an existing partner', async () => {
  const f = await fixture(); const tamer = f.actor('character', 'tamer');
  const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  class Wizard extends f.ApplicationV2 { constructor(options) { super(options); this.steps = ['welcome']; this.stepIndex = 0; } }
  const make = () => new AcademyUIBridge({ tamerUuid: tamer.uuid, digimonUuid: '' }, { load: async () => ({ DDADigimonWizard: Wizard }) });
  let bridge = make(); await bridge.prepare({ surface: 'digimonWizard', wizardStep: 'welcome' });
  assert.equal(bridge.apps.get('digimonWizard').options.linkContext.tamerUuid, tamer.uuid);
  tamer.system.partner = { uuid: 'Actor.existing' }; bridge = make(); await bridge.prepare({ surface: 'digimonWizard', wizardStep: 'welcome' });
  assert.equal(bridge.apps.get('digimonWizard').options.linkContext, null);
});

test('wizard branches retain a readable explanation and rejoin the matching lesson', async () => {
  const f = await practiceFixture(); const wizard = f.session.app;
  wizard.steps.splice(1, 0, 'extraBranch'); wizard.stepIndex = 1;
  f.context.Hooks.callAll('renderDDATamerWizard', wizard);
  assert.equal(f.session.evidence().key, 'DDA.Academy.Practice.Branch');
  wizard.stepIndex = wizard.steps.indexOf('skills'); f.context.Hooks.callAll('renderDDATamerWizard', wizard);
  assert.equal(f.session.step.id, 'skills');
  await f.tour.coach.close(); await f.tour.cleanupPromise;
});

test('optional activity observers cannot break a completed game action', async () => {
  const f = await fixture(); const { emitDdaActivity } = await f.get('scripts/utils/activity-events.js');
  const calls = []; f.context.Hooks.on('ddaActivity', data => calls.push(data));
  emitDdaActivity('check', { actor: { uuid: 'Actor.test' }, total: 12 });
  assert.equal(calls.length, 1); assert.equal(calls[0].userId, 'learner'); assert.equal(calls[0].total, 12);
  f.context.Hooks.callAll = () => { throw Error('An optional observer broke'); };
  assert.doesNotThrow(() => emitDdaActivity('created', {})); assert.ok(f.state.warnings.length);
});

test('a failed native progress write cleans up practice without claiming completion or losing its checkpoint', async () => {
  const f = await practiceFixture();
  const checkpoint = f.journey.checkpoints.tamer.stepId;
  let completed = 0; f.tour.onComplete = () => { completed++; };
  f.game.settings.set = async () => { throw Error('Progress could not be saved'); };
  await assert.rejects(f.session.finish(), /Progress could not be saved/);
  assert.equal(completed, 0); assert.equal(f.journey.lastChapter, '');
  assert.equal(f.journey.checkpoints.tamer.stepId, checkpoint);
  assert.equal(f.session.active, false); assert.equal(practiceListenerCount(f), 0);
  assert.equal(f.context.foundry.nue.Tour.tourInProgress, false);
});

test('No sheet keeps the radial lesson from opening another controlled character', async () => {
  const f = await fixture(); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  const tamer = f.actor('character', 'unselected'); f.context.canvas.tokens.controlled = [{ actor: tamer }];
  f.context.canvas.tokens.hud = { bind() { assert.fail('No sheet must not bind an unrelated Token'); } };
  const bridge = new AcademyUIBridge({ tamerUuid: '', digimonUuid: '' });
  const view = await bridge.prepare({ surface: 'radial', tokenKind: 'tamer' });
  assert.equal(view.hint, dictionaries.en['DDA.Academy.NeedTamerToken']);
});

test('radial practice can find an owned unlinked Token for the selected world Actor', async () => {
  const f = await fixture(); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  const partner = f.actor('digimon', 'partner');
  const synthetic = { ...partner, uuid: 'Scene.scene.Token.unlinked.Actor.partner', isToken: true };
  const token = { actor: synthetic, document: { actorId: partner.id }, visible: true };
  const denied = { actor: { ...synthetic, isOwner: false }, document: { actorId: partner.id }, visible: true };
  f.context.canvas.tokens.placeables = [denied, token];
  const root = new f.Element(); root.mapping.set('.dda-radial-token-hud', new f.Element());
  let bound; f.context.canvas.tokens.hud = { element: root, bind: value => { bound = value; } };
  const bridge = new AcademyUIBridge({ tamerUuid: '', digimonUuid: partner.uuid });
  await bridge.prepare({ surface: 'radial', tokenKind: 'digimon' }); assert.equal(bound, token);
});

for (const lang of ['en', 'pt-BR']) {
  test(`${lang}: missing participant hints appear in practice and reopening does not advance or erase results`, async () => {
    const f = await practiceFixture({ lang, chapter: 'practice' });
    let context = await f.tour.coach._prepareContext({});
    assert.ok(context.dialogue.includes(dictionaries[lang]['DDA.Academy.NeedTamer']));
    assert.equal(context.canShowControls, true);
    const tamer = f.actor('character', 'chosen'); f.journey.select({ tamerUuid: tamer.uuid, digimonUuid: '' });
    const before = f.state.writes.length, index = f.session.index;
    await f.session.reopenView(); context = await f.tour.coach._prepareContext({});
    assert.ok(!context.dialogue.includes(dictionaries[lang]['DDA.Academy.NeedTamer']));
    f.session.onActivity({ kind: 'check', userId: f.game.user.id, actor: tamer, total: 14, outcomeLabel: 'Success' });
    assert.equal(f.session.evidence().status, 'done');
    await f.session.reopenView(); assert.equal(f.session.evidence().status, 'done');
    assert.equal(f.state.writes.length, before); assert.equal(f.session.index, index);
    await f.tour.coach.close(); await f.tour.cleanupPromise;
  });

  test(`${lang}: NPC practice recognizes the chosen builder and preserves the player duo`, async () => {
    const f = await practiceFixture({ lang, chapter: 'npcs', gm: true, pair: true });
    const npc = f.actor('digimon', 'Encounter NPC'), selected = { ...f.journey.selection };
    f.session.app.enemyName = 'Encounter NPC'; f.session.app.selectedFormId = 'greymon';
    f.context.Hooks.callAll('renderDDADigimonEnemyWizard', f.session.app); await settlePractice();
    assert.equal(f.session.evidence().status, 'changed');
    f.session.onActivity({ kind: 'npcCreated', userId: 'other', wizard: f.session.app, actor: npc });
    f.session.onActivity({ kind: 'npcCreated', userId: f.game.user.id, wizard: {}, actor: npc });
    assert.equal(f.session.createdActor, null);
    f.session.onActivity({ kind: 'npcCreated', userId: f.game.user.id, wizard: f.session.app, actor: npc });
    const context = await f.tour.coach._prepareContext({});
    assert.equal(context.status, 'done'); assert.ok(context.evidence.includes(npc.name));
    assert.equal(context.canShowControls, false); assert.equal(await f.session.reopenView(), false);
    assert.deepEqual({ ...f.journey.selection }, selected);
    assert.equal(f.journey.checkpoints.npcs.createdUuid, npc.uuid);
    await f.session.finish(); assert.equal(f.journey.recommend(), 'options');
    assert.equal(practiceListenerCount(f), 0);
  });
}

test('an abandoned practice view cannot reattach listeners after its async opening finishes', async () => {
  const f = await practiceFixture(); let ready;
  f.bridge.prepare = () => new Promise(resolve => { ready = resolve; });
  const reopening = f.session.reopenView(); f.session.dispose(); ready({ hint: 'stale' });
  assert.equal(await reopening, false); assert.equal(practiceListenerCount(f), 0);
  assert.equal(f.session.boundRoot, null);
  await f.tour._cleanupGuide();
});

test('planner and prototype visits follow a changed selection while previous views remain open', async () => {
  const f = await fixture(); const { AcademyUIBridge } = await f.get('scripts/tutorials/academy-ui.js');
  const first = f.actor('digimon', 'first'), second = f.actor('digimon', 'second');
  class Planner extends f.ApplicationV2 { constructor(actor) { super(); this.sourceActor = actor; } }
  class Prototype extends f.ApplicationV2 { constructor({ prototype }) { super(); this.actor = prototype.parent; } }
  f.context.CONFIG.Token.prototypeSheetClass = Prototype;
  const selection = { tamerUuid: '', digimonUuid: first.uuid };
  const bridge = new AcademyUIBridge(selection, { load: async () => ({ DDAPartnerFormPlanner: Planner }) });
  await bridge.prepare({ surface: 'planner' }); await bridge.prepare({ surface: 'prototype' });
  const oldPlanner = bridge.apps.get('planner'), oldPrototype = bridge.apps.get('prototype');
  selection.digimonUuid = second.uuid;
  await bridge.prepare({ surface: 'planner' }); await bridge.prepare({ surface: 'prototype' });
  assert.equal(bridge.apps.get('planner').sourceActor, second); assert.equal(bridge.apps.get('prototype').actor, second);
  assert.equal(oldPlanner.rendered, true); assert.equal(oldPrototype.rendered, true);
  assert.equal(f.state.writes.length, 0);
});

test('a failed native completion retains Resume and retries the saved creation without reopening its wizard', async () => {
  const f = await practiceFixture(); const tamer = f.actor('character', 'already-created');
  f.session.onActivity({ kind: 'created', userId: f.game.user.id, wizard: f.session.app, actor: tamer });
  const save = f.game.settings.set;
  f.game.settings.set = async () => { throw Error('Temporary progress failure'); };
  await assert.rejects(f.session.finish(), /Temporary progress failure/);
  f.game.settings.set = save;
  const academy = new f.api.HinaAcademyApplication();
  const context = await academy._prepareContext({});
  const chapter = context.players.find(chapter => chapter.id === 'tamer');
  assert.equal(chapter.completed, false); assert.equal(chapter.startLabel, dictionaries.en['DDA.Academy.Resume']);
  let opened = 0, completed = 0;
  f.tour.bridgeFactory = () => ({ prepare: async () => { opened++; return {}; }, cleanup() {} });
  f.tour.onComplete = () => { completed++; };
  await f.api.startAcademyChapter('tamer', f.journey.selection);
  assert.equal(opened, 0); assert.equal(completed, 1); assert.equal(f.journey.lastChapter, 'tamer');
  assert.equal(f.journey.actors().tamer, tamer); assert.equal(f.journey.checkpoints.tamer, undefined);
});
