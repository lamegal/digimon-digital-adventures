// node --experimental-vm-modules --test tests/partner-token-creation.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url), scope = 'digimon-digital-adventures';
const real = ['scripts/wizard/dda-digimon-wizard.js', 'scripts/tokens/digimon-token-scale.js',
  'scripts/data/dda-portrait-and-manual-digimon-data.js', 'scripts/data/digimon-static-token-manifest.generated.js',
  'scripts/data/digimon-static-portrait-manifest.generated.js', 'scripts/helpers/digimon-portrait-resolver.js'];
const sources = new Map(real.map(path => [new URL(path, root).href,
  process.env.DDA_TEST_BASELINE === '1'
    ? execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(new URL(path, root), 'utf8')]));
const imports = new Map();
for (const [url, code] of sources) for (const [, names, path] of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
  const key = new URL(path, url).href, set = imports.get(key) ?? new Set();
  names.split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach(n => set.add(n)); imports.set(key, set);
}
function setProperty(o, path, value) {
  const parts = path.split('.'), last = parts.pop();
  for (const part of parts) o = o[part] ??= {};
  o[last] = structuredClone(value);
}
async function fixture({ browse = false, scaling = 'medium' } = {}) {
  const state = { browses: 0, hooks: [], warnings: [], errors: [], notices: [] };
  class App extends EventTarget {}
  const foundry = { applications: { api: { ApplicationV2: App, HandlebarsApplicationMixin: x => x }, apps: {} },
    utils: { deepClone: structuredClone, getProperty: (o, p) => p.split('.').reduce((v, k) => v?.[k], o), setProperty } };
  if (browse !== false) foundry.applications.apps.FilePicker = { implementation: { async browse() {
    state.browses++; if (browse === 'denied') throw Error('No file browser permission');
    return { files: ['systems/digimon-digital-adventures/assets/digimon/tokens/CustomSpecies.webp'] };
  } } };
  const game = { user: { id: 'player', isGM: false }, settings: { get: (_scope, key) => key === 'humanScaling' ? scaling : false },
    i18n: { lang: 'en', localize: key => key }, scenes: [] };
  const canvas = { tokens: { placeables: [], controlled: [] } };
  const context = vm.createContext({ console: { ...console, warn() {} }, foundry, game, canvas, structuredClone, EventTarget, Event,
    CONFIG: { DDA: { stages: { child: { maxSize: 'large' } } } },
    Hooks: { on: (name, callback) => state.hooks.push({ name, callback }) },
    ui: { notifications: { warn: msg => state.warnings.push(msg), info: msg => state.notices.push(msg), error: msg => state.errors.push(msg) } } });
  const values = { DDA_INITIAL_DIGIMON_INDEX: {}, DDA_INITIAL_EVOLUTION_RELATIONS: [], DDA_DIGIMON_QUALITIES: [] };
  const modules = new Map();
  async function load(url) {
    const key = new URL(url, root).href;
    if (modules.has(key)) return modules.get(key);
    const module = sources.has(key) ? new vm.SourceTextModule(sources.get(key), { context, identifier: key })
      : new vm.SyntheticModule([...(imports.get(key) ?? [])], function () {
        for (const name of imports.get(key) ?? []) this.setExport(name, values[name] ?? (() => null));
      }, { context, identifier: key });
    modules.set(key, module); return module;
  }
  const linker = (path, ref) => load(new URL(path, ref.identifier));
  async function get(path) {
    const module = await load(path); if (module.status === 'unlinked') await module.link(linker);
    if (module.status !== 'evaluated') await module.evaluate(); return module.namespace;
  }
  function wizard(species = 'Blucomon') {
    return get('scripts/wizard/dda-digimon-wizard.js').then(({ DDADigimonWizard }) => {
      const w = Object.create(DDADigimonWizard.prototype);
      w.data = { stage: 'child', identity: { species, name: 'Nickname', img: 'icons/svg/mystery-man.svg' },
        lineForms: { child: { species, originalName: species, img: 'icons/svg/mystery-man.svg', tokenImg: '' } },
        stats: { movement: 4 }, statAllocation: {}, derivedStatsPreview: {}, qualities: { positive: [] }, dp: {} };
      Object.assign(w, { _usesInitialFormBuildsForMechanicalState: () => false, _ensureIdentityFallbacks() {},
        _isCompatibilityBaby1Flow: () => false, _findSpeciesDataInWorldActors: () => null, _findSpeciesDataInGlobalDatabase: () => null,
        _syncLineFormsFromWizardData() {}, _getInitialLineDisplayNameKeys: () => new Set(),
        _getInitialLineStageKey: stage => stage, _getStageValue: () => 2,
        _getStageOptions: () => [{ key: 'child', maxSize: 'large' }],
        _getPartnerQuestionsData: () => ({}), _buildPartnerQuestionsNotesText: () => '', _buildInitialEvolutionLineData: () => ({}),
        _getCleanCompatibilityData: () => ({}), _getSpentStatDp: () => 0,
        _buildMainStatData: () => ({}), _buildDerivedStatData: () => ({}), _getUnlockedStagesFor: () => ['child'] });
      return w;
    });
  }
  return { state, context, game, canvas, foundry, get, wizard };
}

for (const browse of [false, 'denied']) test(`shipped tokens do not require FilePicker (${browse || 'unavailable'})`, async () => {
  const f = await fixture({ browse }); const { getDdaTokenPath } = await f.get('scripts/data/dda-portrait-and-manual-digimon-data.js');
  for (const species of ['Blucomon', 'Agumon', 'Terriermon', 'Gabumon']) {
    const path = await getDdaTokenPath({ species });
    assert.match(path, /\/tokens\//, species); assert.ok(fs.existsSync(new URL(path.replace(`systems/${scope}/`, ''), root)), path);
  }
  assert.equal(f.state.browses, 0);
});

test('variant names and aliases retain exact case-sensitive token paths', async () => {
  const f = await fixture(); const { getDdaTokenPath } = await f.get('scripts/data/dda-portrait-and-manual-digimon-data.js');
  assert.equal(await getDdaTokenPath({ name: 'Agumon (X-Antibody)' }), `systems/${scope}/assets/digimon/tokens/Agumon_X.webp`);
  assert.equal(await getDdaTokenPath({ key: 'child:blucomon', name: 'Nickname', aliases: ['Blucomon'] }), `systems/${scope}/assets/digimon/tokens/Blucomon.webp`);
});

test('file-browser discovery still finds custom species outside the shipped manifest', async () => {
  const f = await fixture({ browse: true }); const { getDdaTokenPath } = await f.get('scripts/data/dda-portrait-and-manual-digimon-data.js');
  assert.equal(await getDdaTokenPath({ species: 'CustomSpecies' }), `systems/${scope}/assets/digimon/tokens/CustomSpecies.webp`);
  assert.equal(await getDdaTokenPath({ species: 'NoSuchDigimon' }), ''); assert.equal(f.state.browses, 1);
});

test('Blucomon creation carries token art, linked prototype and configured size independently of the portrait', async () => {
  const f = await fixture({ scaling: 'small' }); const w = await f.wizard();
  w.data.lineForms.child.portraitImg = 'custom-portrait.webp';
  await w._resolveAutomaticTokensForInitialLine(); const data = w._buildActorData();
  assert.equal(data.prototypeToken.texture.src, `systems/${scope}/assets/digimon/tokens/Blucomon.webp`);
  assert.equal(data.system.evolution.tokenImg, data.prototypeToken.texture.src);
  assert.equal(data.system.evolution.portraitImg, 'custom-portrait.webp');
  assert.equal(data.prototypeToken.actorLink, true); assert.equal(data.prototypeToken.width, 2); assert.equal(data.prototypeToken.height, 2);
});

test('manually chosen token art survives automatic lookup; placeholder art is repaired', async () => {
  const f = await fixture(); const w = await f.wizard();
  w.data.lineForms.child.tokenImg = 'custom-token.webp';
  await w._resolveAutomaticTokensForInitialLine(); assert.equal(w.data.lineForms.child.tokenImg, 'custom-token.webp');
  w.data.lineForms.child.img = 'custom-portrait.webp'; w.data.lineForms.child.tokenImg = 'icons/svg/mystery-man.svg';
  await w._resolveAutomaticTokensForInitialLine(); assert.match(w.data.lineForms.child.tokenImg, /\/tokens\/Blucomon.webp$/);
});

test('an explicit identity token is not replaced by the line-form portrait fallback', async () => {
  const f = await fixture(); const w = await f.wizard(); w.data.identity.tokenImg = 'manual-token.webp';
  w.data.lineForms.child.img = 'portrait.webp';
  assert.equal(w._buildActorData().prototypeToken.texture.src, 'manual-token.webp');
});

test('creation hook configures missing dimensions, including player-created partners and half-space scaling', async () => {
  const f = await fixture({ scaling: 'large' }); const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  scale.registerDigimonTokenScaleHooks(); const hook = f.state.hooks.find(h => h.name === 'preCreateActor')?.callback;
  assert.equal(typeof hook, 'function');
  const actor = { type: 'digimon', system: { size: 'medium' }, flags: {}, updateSource: data => { actor.changes = data; } };
  hook(actor, { system: { size: 'medium' } }); assert.equal(actor.changes['prototypeToken.width'], 0.5); assert.equal(actor.changes['prototypeToken.height'], 0.5);
  hook(actor, { prototypeToken: { width: 3 } }); assert.deepEqual({ ...actor.changes }, { 'prototypeToken.height': 3 });
  hook(actor, { flags: { [scope]: { tokenGridSizeOverride: 4 } } }); assert.equal(actor.changes['prototypeToken.width'], 4);
  actor.changes = null; hook(actor, { prototypeToken: { width: 3, height: 2 } }); assert.equal(actor.changes, null);
  actor.type = 'character'; hook(actor, {}); assert.equal(actor.changes, null);
});

test('selected-partner repair updates its prototype and placed token while preserving portrait and stats', async () => {
  const f = await fixture();
  const actor = { id: 'blue', name: 'Nickname', type: 'digimon', isOwner: true,
    system: { species: 'Blucomon', size: 'medium', names: {}, mainStats: { damage: { value: 7 } }, evolution: { tokenImg: 'wrong.webp', portraitImg: 'portrait.webp' } },
    flags: { [scope]: { tokenGridSizeOverride: 1.5 } }, prototypeToken: { texture: { src: 'wrong.webp' } },
    async update(data) { for (const [path, value] of Object.entries(data)) setProperty(this, path, value); } };
  const token = { actor, document: { id: 'token', actorId: actor.id, actor, texture: { src: 'wrong.webp' } }, refresh() {} };
  const otherToken = { id: 'other-token', actorId: 'other', actor: { id: 'other' }, texture: { src: 'other.webp' } };
  f.canvas.tokens.controlled = [token]; f.canvas.tokens.placeables = [token];
  f.game.scenes = [{ tokens: [token.document, otherToken], async updateEmbeddedDocuments(_type, updates) {
    for (const data of updates) for (const [path, value] of Object.entries(data)) if (path !== '_id') setProperty(token.document, path, value);
  } }];
  const macro = new vm.SourceTextModule(fs.readFileSync(new URL('macros/repair-selected-partner-token.js', root), 'utf8'), {
    context: f.context, importModuleDynamically: async path => {
      const relative = path.replace(`/systems/${scope}/`, '');
      const exports = await f.get(relative), names = Object.keys(exports);
      const m = new vm.SyntheticModule(names, function () { for (const n of names) this.setExport(n, exports[n]); }, { context: f.context });
      await m.link(() => {}); await m.evaluate(); return m;
    } });
  await macro.link(() => {}); await macro.evaluate();
  assert.deepEqual(f.state.errors, []); assert.equal(f.state.notices.length, 1);
  assert.equal(actor.prototypeToken.texture.src, `systems/${scope}/assets/digimon/tokens/Blucomon.webp`);
  assert.equal(token.document.texture.src, actor.prototypeToken.texture.src); assert.equal(token.document.width, 1.5);
  assert.equal(actor.system.evolution.portraitImg, 'portrait.webp'); assert.equal(actor.system.mainStats.damage.value, 7);
  assert.equal(otherToken.texture.src, 'other.webp');
});
