// Actual wizard Create methods and activity emitter, isolated from unrelated Foundry catalogs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

async function creationFixture(role) {
  const state = { activities: [], created: 0, owners: 0, linked: false };
  const path = role === 'tamer' ? 'scripts/wizard/dda-tamer-wizard.js' : 'scripts/wizard/dda-digimon-wizard.js';
  const source = fs.readFileSync(new URL(path, root), 'utf8');
  const start = source.indexOf('async _onCreate(event) {');
  const end = source.indexOf(role === 'tamer' ? 'async _onIncreaseAttribute(' : 'async _onQualitySearch(', start);
  assert.ok(start > 0 && end > start);
  const method = source.slice(start, end).trim().replace('async _onCreate(event)', 'export async function create(event)');
  const actor = { uuid: `Actor.${role}`, type: role === 'tamer' ? 'character' : 'digimon', name: role,
    isOwner: true, sheet: { render() {} }, createEmbeddedDocuments: async () => [] };
  const context = vm.createContext({ console,
    game: { user: { id: 'creator' } },
    Hooks: { callAll(name, event) { assert.equal(name, 'ddaActivity'); assert.ok(state.linked); state.activities.push(event); } },
    Actor: { create: async () => { state.created++; return actor; } },
    ensureActorOwner: async value => { assert.equal(value, actor); state.owners++; },
    ui: { notifications: { warn() {}, info() {} } }, text: (_pt, en) => en, formatI18n: key => key
  });
  const helper = new vm.SourceTextModule(fs.readFileSync(new URL('scripts/utils/activity-events.js', root), 'utf8'), { context });
  const module = new vm.SourceTextModule(`import { emitDdaActivity } from './activity-events.js';\n${method}`, { context });
  await helper.link(() => assert.fail('Emitter has no dependencies'));
  await module.link(() => helper); await module.evaluate();
  const noop = () => {};
  const wizard = { mode: 'create', rendered: true,
    data: { stage: 'child', identity: { species: 'Agumon' }, validation: { errors: [] }, postCreate: {}, qualities: { positive: [], negative: [] } },
    _syncInputsFromHtml: noop, _recalculate: noop, _recalculateStageData: noop, _validate: noop, _renderAtStepTop: noop,
    _buildActorData: () => ({}), _buildTormentItemData: () => [],
    _usesInitialFormBuildsForMechanicalState: () => false,
    _syncLineFormsFromWizardData: noop, _completeInitialLineAroundMainStage: noop, _applyLineFormToIdentity: noop,
    _ensureIdentityFallbacks: noop, _isCompatibilityBaby1Flow: () => false, _applySpeciesDataFromCompendium: async () => {},
    _resolveAutomaticTokensForInitialLine: async () => {}, _getLineAttackItemsForStage: () => [],
    _resolveWizardQualityAttackChoices: async () => {}, _finalizeInitialEvolutionLineForCreatedActor: async () => {},
    _linkWithPendingDigimon: async () => { state.linked = true; },
    _linkWithPendingTamer: async () => { state.linked = true; },
    close() { this.rendered = false; }
  };
  return { state, actor, wizard, create: () => module.namespace.create.call(wizard, { preventDefault() {} }) };
}

for (const role of ['tamer','digimon']) {
  test(`${role}: successful creation is reported after ownership, embedded data and linking`, async () => {
    const f = await creationFixture(role); await f.create();
    assert.equal(f.state.created, 1); assert.equal(f.state.owners, 1); assert.equal(f.state.activities.length, 1);
    assert.equal(f.state.activities[0].kind, 'created'); assert.equal(f.state.activities[0].actor, f.actor);
    assert.equal(f.state.activities[0].wizard, f.wizard); assert.equal(f.state.activities[0].userId, 'creator');
  });

  test(`${role}: a rejected build does not claim successful creation`, async () => {
    const f = await creationFixture(role); f.wizard.data.validation.errors = ['Review identity']; await f.create();
    assert.equal(f.state.created, 0); assert.equal(f.state.activities.length, 0);
  });

  test(`${role}: failed finalization does not advance the Academy to a completed creation`, async () => {
    const f = await creationFixture(role);
    f.wizard[role === 'tamer' ? '_linkWithPendingDigimon' : '_linkWithPendingTamer'] = async () => { throw Error('link failed'); };
    await assert.rejects(f.create(), /link failed/); assert.equal(f.state.activities.length, 0);
  });
}

test('editing an evolution snapshot does not emit a new-character creation event', async () => {
  const f = await creationFixture('digimon'); f.wizard.mode = 'formSnapshot';
  let saved = false; f.wizard._onSaveFormSnapshot = () => { saved = true; };
  await f.create(); assert.equal(saved, true); assert.equal(f.state.created, 0); assert.equal(f.state.activities.length, 0);
});

test('checking Create Partner Digimon next opens the partner wizard after creating its Tamer', async () => {
  const f = await creationFixture('tamer'); f.wizard.data.postCreate.createDigimon = true;
  let opened = 0;
  f.wizard._openDigimonWizardAfterCreate = async actor => {
    assert.equal(actor, f.actor); assert.equal(f.wizard.rendered, false);
    assert.equal(f.state.activities[0].kind, 'created'); opened++;
  };
  await f.create(); assert.equal(opened, 1); assert.equal(f.state.created, 1);
});

test('leaving the partner checkbox unchecked or linking an existing Digimon does not open another creator', async () => {
  for (const existing of [false, true]) {
    const f = await creationFixture('tamer');
    f.wizard.data.postCreate.createDigimon = existing;
    if (existing) f.wizard.linkContext = { digimonUuid: 'Actor.existing' };
    f.wizard._openDigimonWizardAfterCreate = async () => assert.fail('Do not create a second partner wizard');
    await f.create(); assert.equal(f.state.created, 1);
  }
});

async function npcFixture() {
  const state = { activities: [], created: 0, finalized: false, woundsSet: false, warnings: [] };
  const source = fs.readFileSync(new URL('scripts/apps/dda-digimon-enemy-wizard.js', root), 'utf8');
  const start = source.indexOf('async _createEnemyNpc() {'), end = source.indexOf('  _buildEnemyNpcData(', start);
  assert.ok(start > 0 && end > start);
  const method = source.slice(start, end).trim().replace('async _createEnemyNpc()', 'export async function create()');
  const actor = { uuid: 'Actor.npc', name: 'Encounter NPC', system: { miscStats: { wounds: { max: 8 } } },
    update: async () => { assert.ok(state.finalized); state.woundsSet = true; }, sheet: { render() {} } };
  const game = { user: { id: 'creator', isGM: true } };
  const context = vm.createContext({ console, game,
    Hooks: { callAll(name, event) { assert.equal(name, 'ddaActivity'); assert.ok(state.woundsSet); state.activities.push(event); } },
    Actor: { create: async () => { state.created++; return actor; } },
    ui: { notifications: { warn: value => state.warnings.push(value), info() {} } }, text: (_pt, en) => en
  });
  const helper = new vm.SourceTextModule(fs.readFileSync(new URL('scripts/utils/activity-events.js', root), 'utf8'), { context });
  const module = new vm.SourceTextModule(`import { emitDdaActivity } from './activity-events.js';\n${method}`, { context });
  await helper.link(() => assert.fail('Emitter has no dependencies')); await module.link(() => helper); await module.evaluate();
  const form = { id: 'greymon' }, build = {};
  const wizard = { _getSelectedForm: () => form, _getEnemyBuildPreview: () => build, _buildEnemyNpcData: () => ({}),
    _resolveEnemyQualityAttackChoices: async () => { state.finalized = true; }, close: async () => {} };
  return { state, game, wizard, actor, build, create: () => module.namespace.create.call(wizard) };
}

test('NPC creation is reported only after attack choices and Wound Boxes are initialized', async () => {
  const f = await npcFixture(); await f.create();
  assert.equal(f.state.activities.length, 1); assert.equal(f.state.activities[0].kind, 'npcCreated');
  assert.equal(f.state.activities[0].wizard, f.wizard); assert.equal(f.state.activities[0].actor, f.actor);
});

test('NPC permission, missing form and rejected builds never report a completed creation', async () => {
  for (const reason of ['permission','form','budget','mode']) {
    const f = await npcFixture();
    if (reason === 'permission') f.game.user.isGM = false;
    else if (reason === 'form') f.wizard._getSelectedForm = () => null;
    else if (reason === 'budget') f.build.hasBudgetOverrun = true;
    else f.build.hasSuperiorModeConfigurationError = true;
    await f.create(); assert.equal(f.state.created, 0); assert.equal(f.state.activities.length, 0);
    assert.equal(f.state.warnings.length, 1);
  }
});

test('a failed NPC finalization does not report success to the tutorial', async () => {
  const f = await npcFixture(); f.wizard._resolveEnemyQualityAttackChoices = async () => { throw Error('Quality choice failed'); };
  await assert.rejects(f.create(), /Quality choice failed/); assert.equal(f.state.activities.length, 0);
});
