// node --experimental-vm-modules --test tests/blast-turn-regression.mjs
// Production modules; simulated Foundry documents, event dispatch and canvas.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const real = [
  'scripts/rolls/attack-roll.js', 'scripts/combat/area-attacks/area-attack-controller.js',
  'scripts/combat/evolution.js', 'scripts/tokens/digimon-token-scale.js',
  'scripts/sheets/character-sheet.js'
];
const baseline = process.env.DDA_TEST_BASELINE === '1';
const sources = new Map(real.map(path => [new URL(path, root).href, baseline
  ? execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(new URL(path, root), 'utf8')]));
const importNames = new Map();
for (const [url, code] of sources) {
  for (const [, names, path] of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    const key = new URL(path, url).href;
    const found = importNames.get(key) ?? new Set();
    for (const name of names.split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) found.add(name);
    importNames.set(key, found);
  }
}
const modeKey = new URL('scripts/rules/mode-change.js', root).href;
importNames.get(modeKey).add('isAttackAvailableForCurrentMode');
const flush = () => new Promise(resolve => setImmediate(resolve));
function updatePath(object, path, value) {
  const parts = path.split('.'); const last = parts.pop();
  for (const key of parts) object = object[key] ??= {};
  if (last.startsWith('-=')) delete object[last.slice(2)]; else object[last] = structuredClone(value);
}
async function fixture() {
  const state = { warnings: [], errors: [], dialogs: [], hooks: [], endCalls: 0, endHandler: null, dialogHandler: () => null };
  let id = 0;
  class App {}
  const game = { user: { id: 'gm', isGM: true, targets: { first: () => undefined } },
    users: [], actors: [], scenes: [], combat: null, system: { id: 'digimon-digital-adventures' },
    settings: { get: (scope, key) => key === 'humanScaling' ? 'medium' : false },
    i18n: { lang: 'en', localize: key => key, format: key => key }, messages: new Map() };
  const canvas = { ready: true, scene: { id: 'scene', grid: { distance: 1 } },
    grid: { size: 100 }, dimensions: { size: 100, distance: 1 }, tokens: { placeables: [], get: tokenId => canvas.tokens.placeables.find(t => t.id === tokenId) } };
  const overrides = {
    DDA_DIGIMON_QUALITIES: [], DDA_TAMER_TALENTS: [], DDA_STAGE_ORDER: [],
    EFFECT_TAGS: { poison: { type: 'damage' }, frail: { type: 'negative' }, keen: { type: 'positive' }, push: { type: 'unique' } },
    getArmedAttackTalentState: () => ({}),
    attackAllowedDuringDot: () => true, canAttackAfterSecondWind: () => true,
    isAttackAvailableForCurrentMode: () => true,
    tryExecuteSpecialGainForceAttack: async () => ({ handled: false }),
    getReachModeData: () => ({ mode: '', rank: 0 }),
    getCoordinatedAssaultBonus: () => ({ bonus: 0 }),
    getBossImmunityEffectTags: () => new Set(),
    resolveIncomingDigizoidGainForceEffects: async (_actor, effects) => ({ effects }),
    consumeDenyForIncomingEffects: (_actor, effects) => ({ effects, denied: null }),
    getSelectedChoices: q => [...(q.system?.choices?.selectedRanks ?? []), ...(q.system?.choices?.selected ?? [])],
    getQualityRank: q => q.system?.rank?.value ?? 1,
    getActorSv: () => 3, hasQuality: () => false,
    normalizeKey: value => String(value ?? '').normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
    resolveDigimonPortraitSources: s => [s.img || 'form.webp'],
    endTamerTurn: async actor => { state.endCalls++; return state.endHandler?.(actor); }
  };
  const context = vm.createContext({
    console: { ...console, warn() {}, error: (...args) => state.errors.push(args) },
    structuredClone, Event, EventTarget, HTMLElement: class {}, game, canvas,
    CONFIG: { DDA: { effectTags: { poison: 'POISON', frail: 'FRAIL', keen: 'KEEN' }, stages: {} } },
    CONST: { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } },
    foundry: { utils: { deepClone: structuredClone, randomID: () => String(++id),
      getProperty: (o, p) => p.split('.').reduce((v, k) => v?.[k], o), setProperty: updatePath },
      applications: { sheets: { ActorSheetV2: App }, api: { ApplicationV2: App, HandlebarsApplicationMixin: x => x,
        DialogV2: { wait: async options => { state.dialogs.push(options); return state.dialogHandler(options); } } } } },
    ui: { notifications: { warn: message => state.warnings.push(message), error: message => state.errors.push(message), info() {} } },
    Hooks: { once() {}, on: (name, callback) => state.hooks.push({ name, callback }) }, window: { setTimeout: fn => { fn(); return 1; } },
    ChatMessage: { getSpeaker: () => ({}), create: async () => ({ id: 'chat' }) },
    fromUuid: async () => null, setTimeout, clearTimeout
  });
  vm.runInContext('Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));', context);
  const modules = new Map();
  async function load(url) {
    const key = new URL(url, root).href;
    if (modules.has(key)) return modules.get(key);
    let module;
    if (sources.has(key)) {
      let code = sources.get(key);
      if (key.endsWith('/attack-roll.js')) code += '\nexport { getDirectAreaAttackTags, getSelectedAttackAreaTagsForQuality, getAppliedAttackQualityModifier, getAttackEffectApplication, applyAttackEffectTags };';
      if (key.endsWith('/area-attack-controller.js')) code += '\nexport { normalizeAreaTag, promptAreaConfiguration, getAreaSizeBounds };';
      if (key.endsWith('/evolution.js')) code += '\nexport { applyPartnerFormSnapshot, normalizeFormSnapshot };';
      module = new vm.SourceTextModule(code, { context, identifier: key,
        importModuleDynamically: async (path, ref) => {
          const m = await load(new URL(path, ref.identifier));
          if (m.status === 'unlinked') await m.link(linker);
          await m.evaluate(); return m;
        } });
    } else {
      const names = [...(importNames.get(key) ?? [])];
      module = new vm.SyntheticModule(names, function () {
        for (const name of names) this.setExport(name, overrides[name] ?? (name.startsWith('DDA_') ? [] : () => null));
      }, { context, identifier: key });
    }
    modules.set(key, module); return module;
  }
  const linker = (path, ref) => load(new URL(path, ref.identifier));
  async function get(path) {
    const m = await load(path);
    if (m.status === 'unlinked') await m.link(linker);
    await m.evaluate(); return m.namespace;
  }
  const actor = { id: 'partner', uuid: 'Actor.partner', type: 'digimon', name: 'Partner', img: 'partner.webp', items: [],
    system: { stage: 'adult', size: 'huge', mainStats: {}, combat: {}, resources: {}, effects: { active: [] },
      derivedStats: { bit: { total: 4 }, cpu: { total: 4 }, ram: { total: 4 }, dos: { total: 4 } },
      evolution: {}, evolutionGraph: { nodes: [], edges: [] } },
    flags: { 'digimon-digital-adventures': {} }, prototypeToken: { width: 2, height: 2, texture: { src: 'partner.webp' } },
    async update(changed) { for (const [path, value] of Object.entries(changed)) updatePath(this, path, value); },
    async createEmbeddedDocuments() {}, async deleteEmbeddedDocuments() {} };
  const token = { id: 'token', actor, document: { id: 'token', actorId: actor.id, actor, width: 2, height: 2, texture: { src: 'partner.webp' } },
    mesh: { alpha: 0.75, scale: { x: 2, y: 2, set(x, y) { this.x = x; this.y = y; } } },
    refresh() { this.mesh.scale.set(this.document.width, this.document.height); } };
  canvas.tokens.placeables = [token];
  game.actors = [actor]; game.scenes = [{ tokens: [token.document],
    async updateEmbeddedDocuments(type, updates) {
      for (const update of updates) for (const [path, value] of Object.entries(update)) {
        if (path !== '_id') updatePath(token.document, path, value);
      }
      token.refresh();
    } }];
  const attack = { id: 'attack', name: 'Poison mist', type: 'attack', parent: actor,
    system: { baseTags: { rangeType: 'range', functionType: 'support' }, qualityTags: [], range: { total: 5 },
      effectiveLimit: { total: 10 }, effectTag: { enabled: true, tag: 'poison' } } };
  return { state, context, game, canvas, get, actor, token, attack };
}

for (const tag of ['BLAST', '[BLAST]', 't:blast', '[T:BLAST]', { tag: '[BLAST]' }, { key: 'BLAST' }]) {
  test(`BLAST ${JSON.stringify(tag)} opens area declaration without a target`, async () => {
    const f = await fixture(); f.attack.system.qualityTags = [tag];
    const attack = await f.get('scripts/rolls/attack-roll.js');
    assert.equal(Array.from(attack.getDirectAreaAttackTags(f.attack)).join(), 't:blast');
    await attack.rollAttack(f.actor, f.attack);
    assert.equal(f.state.dialogs.length, 1);
    assert.ok(f.state.dialogs[0].content.includes('areaTag'));
    assert.deepEqual(f.state.warnings, []);
  });
}

test('purchased BLAST selection survives old attack IDs and remains bound to one Attack', async () => {
  const f = await fixture(); const a = await f.get('scripts/rolls/attack-roll.js');
  for (const choice of [
    { attackId: 'attack', attackTag: '[BLAST]' },
    { attackId: 'attack', key: 'blast' },
    { key: 'attack:blast' },
    { attackId: 'old-embedded-id', attackName: f.attack.name, attackTag: 'BLAST' }
  ]) {
    const quality = { type: 'quality', system: { choices: { selectedRanks: [choice] } } };
    assert.equal(Array.from(a.getSelectedAttackAreaTagsForQuality(quality, f.attack)).join(), 't:blast');
  }
  for (const choice of [
    { attackId: 'another-attack', attackName: 'Other', attackTag: 'BLAST' },
    { attackId: 'attack', attackTag: 't:mighty' },
    { attackId: 'attack', attackTag: 'poison' }
  ]) {
    assert.equal(a.getSelectedAttackAreaTagsForQuality({ type: 'quality', system: { choices: { selected: [choice] } } }, f.attack).length, 0);
  }
  f.actor.items = [{ type: 'quality', name: 'Area Attack', system: { rank: { value: 1 }, choices: {
    selectedRanks: [{ attackId: 'attack', key: 'blast' }]
  }, attackModifier: { enabled: true, appliesTo: 'differentAttackPerRank', areaAttack: true,
    grantsTags: ['t:blast', 't:burst', 't:cone'] } } }];
  await a.rollAttack(f.actor, f.attack);
  assert.equal(f.state.dialogs.length, 1, 'a bound Quality is sufficient without a materialized tag');
  assert.deepEqual(f.state.warnings, []);
});

test('controller accepts bracketed/structured area tags and keeps support POISON aimed at enemies by default', async () => {
  const f = await fixture(); const area = await f.get('scripts/combat/area-attacks/area-attack-controller.js');
  for (const tag of ['[BLAST]', { key: '[T:BLAST]' }]) assert.equal(area.normalizeAreaTag(tag), 't:blast');
  await area.promptAreaConfiguration({ attacker: f.actor, attackItem: f.attack, tag: 't:blast',
    bounds: { base: 1, maximum: 3 }, qualityAttackModifier: {} });
  assert.match(f.state.dialogs.at(-1).content, /value="enemies" selected/);
  f.attack.system.effectTag.enabled = false;
  await area.promptAreaConfiguration({ attacker: f.actor, attackItem: f.attack, tag: 't:blast',
    bounds: { base: 1, maximum: 3 }, qualityAttackModifier: { effectTags: ['poison'] } });
  assert.match(f.state.dialogs.at(-1).content, /value="enemies" selected/);
  await area.promptAreaConfiguration({ attacker: f.actor, attackItem: f.attack, tag: 't:blast',
    bounds: { base: 1, maximum: 3 }, qualityAttackModifier: { effectTags: ['keen'] } });
  assert.match(f.state.dialogs.at(-1).content, /value="allies" selected/);
});

test('ordinary attacks still request a target; area attacks without an attacker Token explain the actual requirement', async () => {
  const f = await fixture(); const attack = await f.get('scripts/rolls/attack-roll.js');
  await attack.rollAttack(f.actor, f.attack);
  assert.deepEqual(f.state.warnings, ['DDA.Warning.SelectTargetBeforeAttack']);
  f.state.warnings.length = 0; f.canvas.tokens.placeables = [];
  f.attack.system.qualityTags = ['BLAST'];
  await attack.rollAttack(f.actor, f.attack);
  assert.equal(f.state.warnings.length, 1);
  assert.match(f.state.warnings[0], /attacker's Token/);
  assert.ok(!f.state.warnings.includes('DDA.Warning.SelectTargetBeforeAttack'));
});

function form(stage, size, tokenGridSize = 0) {
  return { sourceFormUuid: `Actor.${stage}`, sourceFormName: stage, stage, size, tokenGridSize,
    img: `${stage}.webp`, tokenImg: `${stage}-token.webp`, items: [],
    mainStats: {}, miscStats: {}, names: {}, profile: {} };
}

test('regression clears the outgoing manual grid override and restores prototype plus placed token', async () => {
  const f = await fixture(); const evolution = await f.get('scripts/combat/evolution.js');
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  f.actor.flags['digimon-digital-adventures'].tokenGridSizeOverride = 4;
  await scale.runDigimonTokenEvolutionTransition(f.actor, () => evolution.applyPartnerFormSnapshot({
    partnerActor: f.actor, snapshot: form('child', 'medium'), transitionType: 'regression'
  }));
  assert.equal(f.actor.system.stage, 'child');
  assert.equal(f.actor.flags['digimon-digital-adventures'].tokenGridSizeOverride, undefined);
  assert.equal(f.actor.prototypeToken.width, 1);
  assert.equal(f.token.document.width, 1);
  assert.equal(f.token.document.height, 1);
  assert.equal(f.token.document.texture.src, 'child-token.webp');
  assert.equal(f.token.mesh.scale.x, 1, 'animation must not restore the outgoing mesh scale');
  assert.equal(f.token.mesh.scale.y, 1);
  assert.equal(f.token.mesh.alpha, 0.75);
});

test('a legacy form without grid metadata does not inherit the outgoing persistent Actor override', async () => {
  const f = await fixture(); const evolution = await f.get('scripts/combat/evolution.js');
  f.actor.flags['digimon-digital-adventures'].tokenGridSizeOverride = 4;
  const snapshot = form('child', 'medium'); delete snapshot.tokenGridSize;
  await evolution.applyPartnerFormSnapshot({ partnerActor: f.actor, snapshot, formTemplateActor: f.actor });
  assert.equal(f.actor.flags['digimon-digital-adventures'].tokenGridSizeOverride, undefined);
  assert.equal(f.actor.prototypeToken.width, 1);
});

test('a destination form keeps its own explicit grid size and later returns to automatic scaling', async () => {
  const f = await fixture(); const evolution = await f.get('scripts/combat/evolution.js');
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  for (const [snapshot, expected] of [[form('adult', 'huge', 3), 3], [form('child', 'small', 0.5), 0.5], [form('adult', 'huge'), 2], [form('child', 'medium'), 1]]) {
    await scale.runDigimonTokenEvolutionTransition(f.actor, () => evolution.applyPartnerFormSnapshot({ partnerActor: f.actor, snapshot }));
    assert.equal(f.actor.prototypeToken.width, expected);
    assert.equal(f.token.document.width, expected);
    assert.equal(f.token.mesh.scale.x, expected);
  }
});

test('animation preserves the new mesh scale even without a manual override', async () => {
  const f = await fixture(); const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  await scale.runDigimonTokenEvolutionTransition(f.actor, async () => { f.actor.system.size = 'medium'; });
  assert.equal(f.token.document.width, 1);
  assert.equal(f.token.mesh.scale.x, 1);
  assert.equal(f.token.mesh.alpha, 0.75);
});

// A V13 Token has saved dimensions, animated/prepared dimensions and cached
// selection geometry. A generic refresh can update the art while the latter
// remains 2x2; the old fixture did not model that distinction.
function cachedFootprint(f) {
  const token = f.token, document = token.document;
  const saved = { width: document.width, height: document.height };
  token.bounds = { width: saved.width * 100, height: saved.height * 100 };
  token.hitArea = { ...token.bounds };
  token.borderSize = { ...token.bounds };
  let flags = {}, nativeAnimation = null;
  token.renderFlags = { set(update) { Object.assign(flags, update); } };
  token.applyRenderFlags = () => {
    if (flags.refreshSize) token.bounds = { width: document.width * 100, height: document.height * 100 };
    if (flags.refreshShape) {
      token.hitArea = { ...token.bounds }; token.borderSize = { ...token.bounds };
    }
    token.refresh(); flags = {};
  };
  token.stopAnimation = options => {
    nativeAnimation = null;
    if (options?.reset) { document.width = saved.width; document.height = saved.height; }
  };
  document.object = token;
  document.getOccupiedGridSpaceOffsets = () => Array.from(
    { length: Math.max(1, Math.round(document.width)) * Math.max(1, Math.round(document.height)) }, (_, id) => ({ id })
  );
  f.game.scenes[0].updateEmbeddedDocuments = async (_type, updates, options = {}) => {
    f.state.lastTokenOptions = options;
    for (const update of updates) for (const [path, value] of Object.entries(update)) {
      if (path === '_id') continue;
      updatePath(document, path, value);
      if (path === 'width' || path === 'height') saved[path] = value;
    }
    // Model a pending native animation that can write the outgoing prepared size
    // after the system's visual transition has completed.
    if (options.animate !== false) nativeAnimation = () => { document.width = 2; document.height = 2; };
    token.refresh();
  };
  return { saved, finishNativeAnimation() { nativeAnimation?.(); } };
}

test('regression shrinks the occupied cells, selection border and hit area together with the artwork', async () => {
  const f = await fixture(), cached = cachedFootprint(f);
  const evolution = await f.get('scripts/combat/evolution.js');
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  await scale.runDigimonTokenEvolutionTransition(f.actor, () => evolution.applyPartnerFormSnapshot({
    partnerActor: f.actor, snapshot: form('child', 'medium'), transitionType: 'regression'
  }));
  cached.finishNativeAnimation();
  assert.equal(cached.saved.width, 1); assert.equal(f.token.document.width, 1);
  assert.equal(f.token.document.getOccupiedGridSpaceOffsets().length, 1);
  for (const geometry of [f.token.bounds, f.token.hitArea, f.token.borderSize]) {
    assert.equal(geometry.width, 100); assert.equal(geometry.height, 100);
  }
  assert.equal(f.token.mesh.scale.x, 1);
});

test('footprint remains correct through repeated growth, regression and half-space overrides', async () => {
  const f = await fixture(), cached = cachedFootprint(f);
  const evolution = await f.get('scripts/combat/evolution.js');
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  for (const [stage, size, manual, expected] of [
    ['child', 'medium', 0, 1], ['adult', 'huge', 0, 2],
    ['child', 'small', 0.5, 0.5], ['adult', 'huge', 3, 3], ['child', 'medium', 0, 1]
  ]) {
    await scale.runDigimonTokenEvolutionTransition(f.actor, () => evolution.applyPartnerFormSnapshot({
      partnerActor: f.actor, snapshot: form(stage, size, manual)
    }));
    cached.finishNativeAnimation();
    assert.equal(f.token.hitArea.width, expected * 100);
    assert.equal(f.token.document.getOccupiedGridSpaceOffsets().length, Math.max(1, Math.round(expected)) ** 2);
    assert.equal(f.token.mesh.scale.x, expected);
  }
});

test('observing players rebuild a form-change footprint from authoritative dimensions', async () => {
  const f = await fixture(), cached = cachedFootprint(f); f.game.user.isGM = false;
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  scale.registerDigimonTokenScaleHooks();
  const onUpdate = f.state.hooks.find(h => h.name === 'updateToken')?.callback;
  assert.equal(typeof onUpdate, 'function');
  cached.saved.width = 1; cached.saved.height = 1;
  // Prepared dimensions and cached shape are still those of the outgoing form.
  onUpdate(f.token.document, { width: 1, height: 1 }, { ddaTokenAppearance: true });
  assert.equal(f.token.document.width, 1); assert.equal(f.token.hitArea.width, 100);
  assert.equal(f.token.borderSize.height, 100);
});

test('reapplying appearance repairs stale selection geometry even when saved dimensions already match', async () => {
  const f = await fixture(), cached = cachedFootprint(f);
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  f.actor.system.size = 'medium'; cached.saved.width = 1; cached.saved.height = 1;
  f.token.document.width = 1; f.token.document.height = 1; f.token.refresh();
  assert.equal(f.token.mesh.scale.x, 1); assert.equal(f.token.hitArea.width, 200);
  await scale.applyDigimonTokenScaleToActorAndPlacedTokens(f.actor);
  assert.equal(f.token.hitArea.width, 100); assert.equal(f.token.borderSize.height, 100);
  f.token.hitArea.width = 200; f.token.borderSize.height = 200;
  await scale.applyDigimonTokenAppearanceToActorAndPlacedTokens(f.actor);
  assert.equal(f.token.hitArea.width, 100); assert.equal(f.token.borderSize.height, 100);
});

// V13's ruler consumes recorded waypoints, which retain their own width/height;
// refreshing the live Token geometry alone does not change those dimensions.
function movementRuler(f, width = 2) {
  const document = f.token.document;
  document.movementHistory = [{ x: 0, y: 0, width, height: width, cost: 1 }];
  document.flags = { 'digimon-digital-adventures': { movementTracker: { spent: 1, max: 3 } } };
  const state = { clears: 0, refreshes: 0, highlightedWidth: width };
  let flags = {};
  document.clearMovementHistory = async () => { state.clears++; document.movementHistory = []; };
  f.token.renderFlags = { set(update) { Object.assign(flags, update); } };
  f.token.applyRenderFlags = () => {
    if (flags.refreshRuler) {
      state.refreshes++;
      state.highlightedWidth = Math.max(document.width, ...document.movementHistory.map(w => w.width));
    }
    f.token.refresh(); flags = {};
  };
  return state;
}

test('regression retires the outgoing ruler footprint without refunding spent Movement or Actions', async () => {
  const f = await fixture(), ruler = movementRuler(f);
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  f.actor.system.combat.actions = { value: 2 };
  const spent = structuredClone(f.token.document.flags);
  const otherDocument = { actorId: 'other', actor: { id: 'other', type: 'digimon' }, movementHistory: [{ width: 3, height: 3 }] };
  f.game.scenes[0].tokens.push(otherDocument);
  await scale.runDigimonTokenEvolutionTransition(f.actor, async () => { f.actor.system.size = 'medium'; });
  assert.equal(f.token.document.width, 1);
  assert.equal(ruler.clears, 1);
  assert.equal(f.token.document.movementHistory.length, 0);
  assert.equal(ruler.highlightedWidth, 1);
  assert.ok(ruler.refreshes > 0);
  assert.deepEqual(f.token.document.flags, spent);
  assert.equal(f.actor.system.combat.actions.value, 2);
  assert.equal(otherDocument.movementHistory.length, 1, 'another Digimon keeps its history');
});

test('repair also retires stale 2x2 ruler history when the live Token is already 1x1', async () => {
  const f = await fixture(), ruler = movementRuler(f);
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  f.actor.system.size = 'medium';
  f.token.document.width = 1; f.token.document.height = 1;
  await scale.applyDigimonTokenScaleToActorAndPlacedTokens(f.actor);
  assert.equal(ruler.clears, 1);
  assert.equal(ruler.highlightedWidth, 1);
});

test('growth retires a smaller ruler footprint but an appearance-only update keeps matching history', async () => {
  const f = await fixture(), ruler = movementRuler(f, 1);
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  await scale.applyDigimonTokenAppearanceToActorAndPlacedTokens(f.actor);
  assert.equal(ruler.clears, 1);
  assert.equal(ruler.highlightedWidth, 2);
  f.token.document.movementHistory = [{ width: 2, height: 2, cost: 1 }];
  await scale.applyDigimonTokenAppearanceToActorAndPlacedTokens(f.actor, { textureSrc: 'new.webp' });
  assert.equal(ruler.clears, 1, 'matching path history survives an image-only update');
  assert.equal(f.token.document.movementHistory.length, 1);
});

test('observing clients refresh the ruler without clearing shared history a second time', async () => {
  const f = await fixture(), ruler = movementRuler(f);
  const scale = await f.get('scripts/tokens/digimon-token-scale.js');
  scale.registerDigimonTokenScaleHooks();
  const onUpdate = f.state.hooks.find(h => h.name === 'updateToken').callback;
  f.game.user.isGM = false;
  f.token.document.width = 1; f.token.document.height = 1;
  f.token.document.movementHistory = [];
  onUpdate(f.token.document, { width: 1, height: 1 }, { ddaTokenAppearance: true });
  assert.equal(ruler.clears, 0);
  assert.equal(ruler.highlightedWidth, 1);
  assert.ok(ruler.refreshes > 0);
});

class Button extends EventTarget { dataset = {}; }
function click(button) { const e = new Event('click', { cancelable: true }); button.dispatchEvent(e); return e; }

test('sheet binds End Turn after insertion, re-render and cached markup without executing twice', async () => {
  const f = await fixture(); const { DDACharacterSheet } = await f.get('scripts/sheets/character-sheet.js');
  const sheet = Object.create(DDACharacterSheet.prototype); sheet.actor = { type: 'character', id: 'tamer' };
  let button = new Button(); const root = { querySelectorAll: () => [button] };
  sheet._bindTamerEndTurnButtons(root); sheet._bindTamerEndTurnButtons(root);
  const e = click(button);
  await DDACharacterSheet.DEFAULT_OPTIONS.actions.endTurn.call(sheet, e, button);
  await flush();
  assert.equal(e.defaultPrevented, true);
  assert.equal(f.state.endCalls, 1);
  button = new Button(); sheet._bindTamerEndTurnButtons(root);
  click(button); await flush();
  assert.equal(f.state.endCalls, 2);
});

test('sheet protects a pending End Turn from rapid repeat clicks and permits retry after failure', async () => {
  const f = await fixture(); const { DDACharacterSheet } = await f.get('scripts/sheets/character-sheet.js');
  const sheet = Object.create(DDACharacterSheet.prototype); sheet.actor = { type: 'character' };
  const button = new Button(); sheet._bindTamerEndTurnButtons({ querySelectorAll: () => [button] });
  let done; f.state.endHandler = () => new Promise(resolve => { done = resolve; });
  click(button); click(button); await flush();
  assert.equal(f.state.endCalls, 1);
  done(); await flush();
  f.state.endHandler = async () => { throw Error('network'); };
  click(button); await flush();
  assert.equal(f.state.endCalls, 2);
  assert.equal(sheet._ddaEndTurnInFlight, false);
  f.state.endHandler = null; click(button); await flush();
  assert.equal(f.state.endCalls, 3);
});

test('a successful support BLAST can apply Advanced Effect POISON to two enemies without Damage', async () => {
  const f = await fixture(); const attack = await f.get('scripts/rolls/attack-roll.js');
  f.attack.system.effectTag.enabled = false; // Effect is purchased through its Quality.
  f.actor.items = [{ type: 'quality', name: 'Advanced Effect', system: { choices: {
    selectedRanks: [{ attackId: 'attack', attackTag: 'poison', effectType: 'damage', potencyStat: 'special', duration: true }]
  } } }];
  for (const id of ['enemyA', 'enemyB']) {
    const defender = { id, uuid: `Actor.${id}`, name: id, type: 'digimon', items: [], flags: {},
      system: { derivedStats: { cpu: { total: 3 } }, effects: { active: [] } },
      async update(changes) { for (const [path, value] of Object.entries(changes)) updatePath(this, path, value); } };
    const application = attack.getAttackEffectApplication({ attacker: f.actor, defender, attackItem: f.attack,
      hit: true, activeEffectTags: ['poison'], normalDamage: 0, accuracySuccesses: 4, leftoverSuccesses: 3,
      areaAttackDeclaration: { active: true, tag: 't:blast', size: 2, targetMode: 'enemies' } });
    assert.equal(application.applied.length, 1);
    assert.equal(application.applied[0].tag, 'poison');
    assert.ok(application.applied[0].duration > 0);
    await attack.applyAttackEffectTags(defender, application.applied);
    assert.equal(defender.system.effects.active.length, 1);
    assert.equal(defender.system.effects.active[0].sourceActorUuid, f.actor.uuid);
  }
});
