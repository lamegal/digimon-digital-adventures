// node --experimental-vm-modules --test tests/huge-power-area-dodge.mjs
// Production modules, with simulated Foundry documents, clients and chat timing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const realFiles = [
  'scripts/data/digimon-qualities.js', 'scripts/data/dda-quality-display-localization.js',
  'scripts/documents/item-document.js', 'scripts/documents/actor-document.js',
  'scripts/apps/digimon-quality-browser.js', 'scripts/wizard/dda-digimon-wizard.js',
  'scripts/rolls/attack-roll.js', 'scripts/rules/quality-rank-limits.js',
  'scripts/apps/dda-digimon-enemy-wizard.js', 'scripts/utils/pending-chat-request.js',
  'scripts/combat/intercede.js', 'scripts/rules/tamer-talent-attack-direct.js'
];
const sources = new Map(realFiles.map(p => [new URL(p, root).href, fs.readFileSync(new URL(p, root), 'utf8')]));
const imports = new Map();
for (const [url, code] of sources) {
  for (const [, names, path] of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    const key = new URL(path, url).href;
    const set = imports.get(key) ?? new Set();
    names.split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach(n => set.add(n));
    imports.set(key, set);
  }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function flush() { for (let i = 0; i < 8; i++) await tick(); }
const setProperty = (o, path, value) => {
  const parts = path.split('.'); const last = parts.pop();
  for (const part of parts) o = o[part] ??= {};
  o[last] = value;
};

async function fixture() {
  let serial = 0;
  const timers = new Map(), hooks = [], documents = new Map(), actors = new Map(), clients = [];
  const users = [
    { id: 'gm', active: true, isGM: true },
    { id: 'ownerA', active: true, isGM: false },
    { id: 'ownerB', active: true, isGM: false },
    { id: 'outsider', active: true, isGM: false }
  ];
  users.get = id => users.find(u => u.id === id);
  const messages = {
    get: id => documents.get(id), find: fn => [...documents.values()].find(fn),
    get contents() { return [...documents.values()]; }
  };
  const state = { onRequest: null, failCreate: false, cleanupBlocked: false, rolls: [], errors: [] };
  function actor(id, owner = 'gm') {
    const a = { uuid: `Actor.${id}`, id, name: id, type: 'digimon', items: [],
      system: { stage: 'adult', combat: {}, derivedStats: {}, mainStats: {} },
      testUserPermission: user => user.isGM || user.id === owner,
      async update(data) { for (const [p, v] of Object.entries(data)) setProperty(this, p, v); }
    };
    actors.set(a.uuid, a); return a;
  }
  const attacker = actor('attacker', 'ownerA'), first = actor('first', 'ownerA'), second = actor('second', 'ownerB');
  const attack = { id: 'attack', name: 'Area support', system: { baseTags: { functionType: 'support' } } };
  async function client(userId) {
    class App { static emittedEvents = []; }
    const user = users.get(userId);
    const context = vm.createContext({
      console: { ...console, warn: (...args) => state.errors.push(args), debug() {} },
      structuredClone, Event, EventTarget, Actor: class {}, Item: class {},
      setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
      clearTimeout(id) { timers.delete(id); },
      foundry: { utils: { deepClone: structuredClone, randomID: () => String(++serial),
        escapeHTML: value => String(value ?? ""), getProperty: (o, p) => p.split('.').reduce((v, k) => v?.[k], o), setProperty },
        applications: { api: { ApplicationV2: App, HandlebarsApplicationMixin: x => x,
          DialogV2: { confirm: async () => true } } } },
      game: { user, users, messages, combat: { id: 'combat', started: true, round: 1, turn: 0 }, system: { id: 'digimon-digital-adventures' },
        i18n: { lang: 'en', localize: key => key, format: key => key }, settings: { get: () => false } },
      canvas: { scene: { id: 'scene' } }, CONFIG: {},
      CONST: { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } },
      ui: { notifications: { warn() {}, info() {}, error() {} } },
      fromUuid: async uuid => actors.get(uuid),
      Hooks: { on(event, fn) { hooks.push({ event, fn }); }, once() {} },
      ChatMessage: {
        getSpeaker: ({ actor }) => ({ actor: actor.id }),
        async create(data) {
          const isRequest = Object.keys(data.flags?.['digimon-digital-adventures'] ?? {}).some(key => key.endsWith('Request'));
          if (state.failCreate && isRequest) throw Error('create failed');
          const message = { ...data, id: String(++serial), author: user,
            getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
            async update(update) {
              if (state.cleanupBlocked) await new Promise(() => {});
              for (const [p, v] of Object.entries(update)) setProperty(this, p, v);
              for (const h of hooks.filter(h => h.event === 'updateChatMessage')) h.fn(this);
            },
            async delete() {
              if (state.cleanupBlocked) await new Promise(() => {});
              documents.delete(this.id);
              for (const h of hooks.filter(h => h.event === 'deleteChatMessage')) h.fn(this);
            }
          };
          documents.set(message.id, message);
          for (const h of hooks.filter(h => h.event === 'createChatMessage')) h.fn(message);
          if (isRequest) await state.onRequest?.(message);
          return message;
        }
      }
    });
    const modules = new Map();
    async function load(url) {
      const key = new URL(url, root).href;
      if (modules.has(key)) return modules.get(key);
      let m;
      if (sources.has(key)) {
        let code = sources.get(key);
        if (key.endsWith('/attack-roll.js')) code += '\nexport { requestAttackDodgeResult, receiveAttackDodgeResponse, pendingAttackDodgeRequests, pendingAttackDodgeByAttacker, areaAttackDodgePromiseCache, getHugePowerRerollDeclaration, getAttackDodgeResult };';
        // Candidate discovery is independent of chat timing. Keep requests, response
        // listeners and expiry behavior real; provide deterministic eligible actors.
        if (key.endsWith('/intercede.js')) code += '\nexport { pendingRequests, pendingAreaRequests }; export function setTestCandidates(candidates) { eligibleInterceders = async () => candidates; eligibleAreaInterceders = async () => candidates; }';
        if (key.endsWith('/tamer-talent-attack-direct.js')) code += '\nexport { pendingDistractingGestureRequests }; export function setTestCandidates(candidates) { distractingCandidates = () => candidates; }';
        if (key.endsWith('/actor-document.js')) code += '\nexport { getQualityRankLimitForStage };';
        m = new vm.SourceTextModule(code, { context, identifier: key });
      } else {
        const overrides = {
          applyIntrinsicQualityDiscount: cost => ({ payable: cost }),
          CORE_QUALITY_IDS: { weapon: 'weapon', instinct: 'instinct', advancedMobility: 'advancedMobility' },
          EFFECT_TAGS: {}, getCoreQualityId: () => null, getActorSv: () => 3,
          hasQuality: () => false, getDDASetting: () => false,
          rollPool: async a => { state.rolls.push(a.uuid); return { totalSuccesses: 2, rolledSuccesses: 2 }; },
          areActorsAllies: () => false, normalizeKey: v => String(v ?? '').toLowerCase(),
          normalizeCoreKey: v => String(v ?? '').toLowerCase()
        };
        m = new vm.SyntheticModule([...(imports.get(key) ?? [])], function () {
          for (const name of imports.get(key) ?? []) this.setExport(name, overrides[name] ?? (name.startsWith('DDA_') ? [] : () => null));
        }, { context, identifier: key });
      }
      modules.set(key, m);
      return m;
    }
    async function get(path) {
      const m = await load(path);
      if (m.status === "unlinked") await m.link((path, ref) => load(new URL(path, ref.identifier)));
      await m.evaluate(); return m.namespace;
    }
    const api = await get('scripts/rolls/attack-roll.js');
    api.registerAttackDodgeResponseListener();
    const c = { api, get, context }; clients.push(c); return c;
  }
  const gm = await client('gm');
  const options = (defender = first, extra = {}) => ({ attacker, defender, attackItem: attack,
    attackFunctionType: 'support', areaAttack: true, areaRequestId: 'area',
    areaTargetTokenId: defender.id, accuracySuccesses: 3, ...extra });
  return { state, timers, messages, actor, attacker, first, second, attack, client, gm, options };
}

test('Huge Power Rank 2 repairs existing items and legacy evolution snapshots', async () => {
  const f = await fixture();
  const { DDAItem } = await f.gm.get('scripts/documents/item-document.js');
  const { getQualityRankLimitForStage } = await f.gm.get('scripts/documents/actor-document.js');
  const { DDADigimonWizard } = await f.gm.get('scripts/wizard/dda-digimon-wizard.js');
  const { DDADigimonQualityBrowser } = await f.gm.get('scripts/apps/digimon-quality-browser.js');
  const { DDA_DIGIMON_QUALITIES } = await f.gm.get('scripts/data/digimon-qualities.js');
  for (const lang of ['en', 'pt-BR']) {
    f.gm.context.game.i18n.lang = lang;
    assert.equal(DDA_DIGIMON_QUALITIES.find(q => q.id === 'poderBrutal').rank.max, 2);
    const legacy = { id: 'quality', name: lang === 'en' ? 'Huge Power' : 'Poder Brutal', type: 'quality',
      system: { sourceId: 'poderBrutal', rank: { value: 2, max: 1, limited: true },
        rankLimit: { type: 'byStage', byStage: { child: 1, adult: 1, perfect: 2 } },
        uses: { enabled: true, value: 0, max: 1, recharge: 'round' } } };
    const wizard = Object.create(DDADigimonWizard.prototype);
    wizard._getActiveMechanicalStageKeyForWizard = () => 'adult';
    assert.equal(wizard._getQualityEffectiveMaxForWizard({ ...legacy.system, id: 'poderBrutal' }), 2);
    const browser = Object.create(DDADigimonQualityBrowser.prototype); browser.actor = f.attacker;
    assert.equal(browser._getQualityEffectiveMax({ ...legacy.system, id: 'poderBrutal' }, legacy), 2);
    DDAItem.prototype._prepareQualityData.call(legacy);
    assert.equal(legacy.system.rank.max, 2);
    assert.equal(legacy.system.rank.limited, false);
    assert.equal(legacy.system.uses.value, 0, 'normalization must not restore spent uses');
    assert.equal(legacy.system.rank.value, 2);
    for (const stage of ['child', 'adult', 'perfect', 'ultimate']) {
      const { max } = getQualityRankLimitForStage(legacy.system, stage, f.attacker.system);
      assert.equal(max, 2);
    }
    legacy.system.rank.effectiveMax = 2; legacy.system.uses.value = 1;
    f.attacker.items = [legacy];
    const declaration = await f.gm.api.getHugePowerRerollDeclaration(f.attacker);
    assert.equal(declaration.rerollResultsUpTo, 2);
  }
});

test('early automatic responses advance all area targets, including support', async () => {
  const f = await fixture();
  const ownerA = await f.client('ownerA'), ownerB = await f.client('ownerB');
  f.state.onRequest = async message => {
    const request = message.getFlag('digimon-digital-adventures', 'attackDodgeRequest');
    await (request.defenderUuid === f.first.uuid ? ownerA : ownerB).api.resolveAttackDodgeFromChat(message);
    await flush(); // Foundry renders/auto-resolves before create() returns to the attacker.
  };
  for (const attackFunctionType of ['support', 'damage']) {
    for (const [index, defender] of [f.first, f.second, f.first].entries()) {
      let settled = false;
      const promise = f.gm.api.requestAttackDodgeResult(f.options(defender, {
        areaRequestId: attackFunctionType, areaTargetTokenId: `token-${index}`, attackFunctionType
      })).then(result => { settled = true; return result; });
      await flush();
      await flush();
      assert.equal(settled, true, `target ${index + 1} must finish for ${attackFunctionType}`);
      assert.equal((await promise).totalSuccesses, 2);
    }
  }
  assert.equal(f.state.rolls.length, 6);
  assert.equal(f.gm.api.pendingAttackDodgeRequests.size, 0);
  assert.equal(f.gm.api.pendingAttackDodgeByAttacker.size, 0);
});

test('duplicate requests during chat creation produce only one Dodge', async () => {
  const f = await fixture(); let publish;
  f.state.onRequest = () => new Promise(resolve => { publish = resolve; });
  const one = f.gm.api.requestAttackDodgeResult(f.options());
  await flush();
  const two = f.gm.api.requestAttackDodgeResult(f.options());
  await flush();
  const cards = f.messages.contents.filter(m => m.getFlag('digimon-digital-adventures', 'attackDodgeRequest'));
  assert.equal(cards.length, 1);
  publish(); await flush();
  await f.gm.api.resolveAttackDodgeFromChat(cards[0]);
  assert.equal((await one).totalSuccesses, 2);
  assert.equal((await two).totalSuccesses, 2);
  assert.equal(f.state.rolls.length, 1);
});

test('chat cleanup must not hold the attack after a valid Dodge', async () => {
  const f = await fixture(); let settled = false;
  const promise = f.gm.api.requestAttackDodgeResult(f.options()).then(r => { settled = true; return r; });
  await flush(); f.state.cleanupBlocked = true;
  await f.gm.api.resolveAttackDodgeFromChat(f.messages.contents[0]);
  await flush();
  assert.equal(settled, true);
  assert.equal((await promise).totalSuccesses, 2);
});

test('creation failure releases attacker and permits retry', async () => {
  const f = await fixture(); f.state.failCreate = true;
  await assert.rejects(f.gm.api.requestAttackDodgeResult(f.options()), /create failed/);
  assert.equal(f.gm.api.pendingAttackDodgeRequests.size, 0);
  assert.equal(f.gm.api.pendingAttackDodgeByAttacker.size, 0);
  assert.equal(f.gm.api.areaAttackDodgePromiseCache.size, 0);
  f.state.failCreate = false;
  const retry = f.gm.api.requestAttackDodgeResult(f.options());
  await flush();
  await f.gm.api.resolveAttackDodgeFromChat(f.messages.contents[0]);
  assert.equal((await retry).totalSuccesses, 2);
});

test('manual player Dodges preserve ownership and advance to the next player', async () => {
  const f = await fixture();
  const ownerA = await f.client('ownerA'), ownerB = await f.client('ownerB');
  for (const [defender, owner, other] of [[f.first, ownerA, ownerB], [f.second, ownerB, ownerA]]) {
    let settled = false;
    const pending = f.gm.api.requestAttackDodgeResult(f.options(defender)).then(r => { settled = true; return r; });
    await flush();
    const message = f.messages.contents.find(m => m.getFlag('digimon-digital-adventures', 'attackDodgeRequest'));
    assert.equal(await other.api.resolveAttackDodgeFromChat(message), false);
    assert.equal(settled, false);
    assert.equal(await owner.api.resolveAttackDodgeFromChat(message), true);
    assert.equal((await pending).totalSuccesses, 2);
    await flush();
  }
  assert.deepEqual(f.state.rolls, [f.first.uuid, f.second.uuid]);
});

test('duplicate response hooks resolve a target only once', async () => {
  const f = await fixture();
  let resolutions = 0;
  const pending = f.gm.api.requestAttackDodgeResult(f.options()).then(r => { resolutions++; return r; });
  await flush();
  const message = f.messages.contents[0];
  await Promise.all([
    f.gm.api.resolveAttackDodgeFromChat(message),
    f.gm.api.resolveAttackDodgeFromChat(message)
  ]);
  await pending;
  assert.equal(resolutions, 1);
  assert.equal(f.state.rolls.length, 1);
});

test('timeout releases the request even when chat updates are blocked', async () => {
  const f = await fixture(); let settled = false;
  const pending = f.gm.api.requestAttackDodgeResult(f.options()).then(r => { settled = true; return r; });
  await flush();
  f.state.cleanupBlocked = true;
  const request = [...f.gm.api.pendingAttackDodgeRequests.values()][0];
  f.timers.get(request.timeoutId).fn();
  await flush();
  assert.equal(settled, true);
  assert.equal(await pending, null);
  assert.equal(f.gm.api.pendingAttackDodgeByAttacker.size, 0);
});

test('forged responses cannot advance another player\'s Dodge', async () => {
  const f = await fixture(); let settled = false;
  const pending = f.gm.api.requestAttackDodgeResult(f.options()).then(r => { settled = true; return r; });
  await flush();
  const card = f.messages.contents[0];
  const request = card.getFlag('digimon-digital-adventures', 'attackDodgeRequest');
  const response = { requestId: request.requestId, attackerUuid: f.attacker.uuid,
    defenderUuid: f.first.uuid, resolverUserId: 'ownerA', dodgeResult: { totalSuccesses: 5 } };
  const message = { author: { id: 'outsider' }, flags: { 'digimon-digital-adventures': { attackDodgeResponse: response } } };
  await f.gm.api.receiveAttackDodgeResponse(message);
  assert.equal(settled, false, 'a claimed resolver must match the message author');
  response.resolverUserId = 'outsider';
  await f.gm.api.receiveAttackDodgeResponse(message);
  assert.equal(settled, false, 'unowned characters cannot be resolved');
  message.author.id = response.resolverUserId = 'ownerA'; response.defenderUuid = f.second.uuid;
  await f.gm.api.receiveAttackDodgeResponse(message);
  assert.equal(settled, false, 'a response for another target must be ignored');
  await f.gm.api.resolveAttackDodgeFromChat(card);
  assert.equal((await pending).totalSuccesses, 2);
});

test('a second area attack gets a fresh Dodge for the same token', async () => {
  const f = await fixture();
  for (const areaRequestId of ['first-attack', 'second-attack']) {
    const pending = f.gm.api.requestAttackDodgeResult(f.options(f.first, { areaRequestId }));
    await flush();
    const card = f.messages.contents.find(m => m.getFlag('digimon-digital-adventures', 'attackDodgeRequest'));
    await f.gm.api.resolveAttackDodgeFromChat(card);
    assert.equal((await pending).totalSuccesses, 2);
    await flush();
  }
  assert.equal(f.state.rolls.length, 2);
});

test('support against a Tamer still needs no Dodge pool', async () => {
  const f = await fixture(); f.first.type = 'character';
  const result = await f.gm.api.getAttackDodgeResult(f.first, 'support');
  assert.equal(result.totalSuccesses, 0);
  assert.equal(f.state.rolls.length, 0);
});

test('legacy fixed-rank qualities agree across actor, browser, both wizards and saved selections', async () => {
  const f = await fixture();
  const { DDAItem } = await f.gm.get('scripts/documents/item-document.js');
  const { getQualityRankLimitForStage } = await f.gm.get('scripts/documents/actor-document.js');
  const { DDADigimonWizard } = await f.gm.get('scripts/wizard/dda-digimon-wizard.js');
  const { DDADigimonEnemyWizard } = await f.gm.get('scripts/apps/dda-digimon-enemy-wizard.js');
  const { DDADigimonQualityBrowser, buildQualityItemData } = await f.gm.get('scripts/apps/digimon-quality-browser.js');
  const { DDA_DIGIMON_QUALITIES } = await f.gm.get('scripts/data/digimon-qualities.js');
  const expected = { Counterattack: 2, 'Area Attack': 6, Reach: 3, Avoidance: 2,
    'Vital Energy': 2, 'Protecting Shield': 3, 'Boiling Blood': 3, 'Mode Change': 2, 'Memory Upgrade': 3 };
  const wizard = Object.create(DDADigimonWizard.prototype);
  wizard._getActiveMechanicalStageKeyForWizard = () => 'adult';
  wizard._prepareQualityForBrowser = q => q;
  wizard._calculateSelectedQualityCost = () => 2;
  const enemy = Object.create(DDADigimonEnemyWizard.prototype);
  const browser = Object.create(DDADigimonQualityBrowser.prototype); browser.actor = f.attacker;
  for (const [name, max] of Object.entries(expected)) {
    const canonical = DDA_DIGIMON_QUALITIES.find(q => (q.originalName || q.name) === name);
    assert.ok(canonical, name);
    const stale = { ...structuredClone(canonical),
      rank: { value: 2, max: 1, limited: true, effectiveMax: 1, exceeded: true },
      rankLimit: { type: 'byStage', byStage: { adult: 1, perfect: 2 } } };
    const oldItem = { name, type: 'quality', system: { ...stale, sourceId: canonical.id,
      uses: { enabled: true, value: 0, max: 1 }, choices: { ...stale.choices, selectedRanks: [{ key: 'keep-me', attackId: 'attack' }] } } };
    const choices = JSON.stringify(oldItem.system.choices.selectedRanks);
    assert.equal(getQualityRankLimitForStage(oldItem.system, 'adult', f.attacker.system).max, max, `${name}: actor`);
    assert.equal(browser._getQualityEffectiveMax(stale, oldItem), max, `${name}: browser`);
    assert.equal(wizard._getQualityEffectiveMaxForWizard(stale), max, `${name}: wizard`);
    assert.equal(enemy.getEnemyQualityEffectiveMax(stale, { stageKey: 'adult' }), max, `${name}: enemy`);
    const selection = wizard._selectionFromQualityItem(oldItem);
    assert.equal(selection.rank.max, max, `${name}: snapshot`);
    assert.equal(selection.rankLimit, null);
    assert.equal(selection.rank.value, 2);
    assert.equal(selection.uses.value, 0);
    assert.equal(JSON.stringify(selection.choices.selectedRanks), choices);
    const built = buildQualityItemData(stale);
    assert.equal(built.system.rank.max, max, `${name}: new item`);
    DDAItem.prototype._prepareQualityData.call(oldItem);
    assert.equal(oldItem.system.rank.max, max);
    assert.equal(oldItem.system.rank.value, 2);
    assert.equal(oldItem.system.uses.value, 0);
    assert.equal(JSON.stringify(oldItem.system.choices.selectedRanks), choices);
    assert.equal(oldItem.system.rank.effectiveMax, undefined);
  }
});

test('canonical normalization preserves legitimate dynamic limits, spent uses and custom qualities', async () => {
  const f = await fixture();
  const { getCanonicalQualityRankData } = await f.gm.get('scripts/rules/quality-rank-limits.js');
  const { DDA_DIGIMON_QUALITIES } = await f.gm.get('scripts/data/digimon-qualities.js');
  const { getQualityRankLimitForStage } = await f.gm.get('scripts/documents/actor-document.js');
  const { DDADigimonWizard } = await f.gm.get('scripts/wizard/dda-digimon-wizard.js');
  const { DDADigimonQualityBrowser } = await f.gm.get('scripts/apps/digimon-quality-browser.js');
  const wizard = Object.create(DDADigimonWizard.prototype);
  wizard.data = { derivedStatsPreview: { ram: 5 } };
  wizard._getActiveMechanicalStageKeyForWizard = () => 'adult';
  const browser = Object.create(DDADigimonQualityBrowser.prototype); browser.actor = f.attacker;
  browser._getActorDerivedStatValue = () => 5;
  f.attacker.system.derivedStats.ram = { total: 5 };
  // Every catalog rank rule round-trips, including effects with max=0 and core limits.
  for (const q of DDA_DIGIMON_QUALITIES) {
    const normalized = getCanonicalQualityRankData({ ...q, rank: { value: 7, max: 99 }, rankLimit: { type: 'fixed', value: 99 } });
    assert.equal(normalized.rank.max, q.rank?.max, q.id);
    assert.equal(normalized.rank.value, 7, q.id);
    assert.equal(JSON.stringify(normalized.rankLimit), JSON.stringify(q.rankLimit ?? null), q.id);
  }
  const certain = DDA_DIGIMON_QUALITIES.find(q => q.id === 'golpeCerteiro');
  const staleCertain = { ...certain, rank: { value: 1, max: 99 }, rankLimit: null };
  const stageMax = certain.rankLimit.byStage.adult;
  assert.equal(getQualityRankLimitForStage(staleCertain, 'adult', f.attacker.system).max, stageMax);
  assert.equal(wizard._getQualityEffectiveMaxForWizard(staleCertain), stageMax);
  assert.equal(browser._getQualityEffectiveMax(staleCertain), stageMax);
  const accelerate = { ...DDA_DIGIMON_QUALITIES.find(q => q.id === 'acelerar'), rank: { max: 1 }, rankLimit: null };
  assert.equal(getQualityRankLimitForStage(accelerate, 'adult', f.attacker.system).max, 5);
  assert.equal(wizard._getQualityEffectiveMaxForWizard(accelerate), 5);
  assert.equal(browser._getQualityEffectiveMax(accelerate), 5);
  const custom = { id: 'my-custom-power', name: 'Huge Power', rank: { value: 1, max: 4 }, rankLimit: { type: 'byStage', byStage: { adult: 3 } } };
  assert.equal(getCanonicalQualityRankData(custom), null);
  assert.equal(getQualityRankLimitForStage(custom, 'adult', f.attacker.system).max, 3);
  assert.equal(wizard._getQualityEffectiveMaxForWizard(custom), 3);
  assert.equal(browser._getQualityEffectiveMax(custom), 3);
  assert.equal(getCanonicalQualityRankData({ name: 'Huge Power', system: { rank: { value: 2, max: 1 } } }).rank.max, 2);
});

const reactionCases = [
  ['standard', 'requestStandardIntercede', 'intercedeRequest', 'intercedeResponse', 'pendingRequests'],
  ['fatal', 'requestFatalIntercede', 'intercedeRequest', 'intercedeResponse', 'pendingRequests'],
  ['area', 'requestAreaIntercede', 'areaIntercedeRequest', 'areaIntercedeResponse', 'pendingAreaRequests'],
  ['distraction', 'requestDistractingGesture', 'distractingGestureRequest', 'distractingGestureResponse', 'pendingDistractingGestureRequests']
];
async function reactionFixture(kind) {
  const f = await fixture();
  const responder = await f.client('ownerB');
  const path = kind === 'distraction' ? 'scripts/rules/tamer-talent-attack-direct.js' : 'scripts/combat/intercede.js';
  const api = await f.gm.get(path);
  if (kind === 'distraction') api.registerTamerTalentAttackDirectHooks(); else api.registerIntercede();
  const candidate = { id: 'candidate', actorUuid: f.second.uuid, actorName: f.second.name,
    tamerUuid: f.second.uuid, tamerName: f.second.name, authorizedUserIds: ['ownerB', 'gm'],
    throwAuthorizedUserIds: ['ownerA', 'gm'], protectedActorName: f.first.name,
    travelRequired: 1, movement: 3, actionCost: 1, throwDistance: 1 };
  api.setTestCandidates([candidate]);
  const token = { id: 'token', actor: f.first };
  const options = { attacker: f.attacker, defender: f.first, attackItem: f.attack,
    targetToken: token, targetTokens: [token], damage: 99 };
  return { ...f, api, responder, candidate, options };
}
for (const [kind, method, requestFlag, responseFlag, pendingMap] of reactionCases) {
  test(`${kind}: responses before chat publication resolve once and permit the next request`, async () => {
    const f = await reactionFixture(kind);
    let calls = 0;
    f.state.onRequest = async message => {
      const request = message.getFlag('digimon-digital-adventures', requestFlag);
      assert.ok(f.api[pendingMap].has(request.requestId), 'waiter must exist before publication returns');
      const candidate = calls++ === 0 ? f.candidate : null;
      const response = { requestId: request.requestId, requestMessageId: message.id, candidate,
        resolverUserId: candidate ? 'ownerB' : 'gm' };
      const data = { flags: { 'digimon-digital-adventures': { [responseFlag]: response } } };
      await f.responder.context.ChatMessage.create(data);
      await f.responder.context.ChatMessage.create(data); // duplicate delivery
    };
    for (const expected of [f.candidate, null]) {
      let settled = false;
      const promise = f.api[method](f.options).then(value => { settled = true; return value; });
      await flush();
      assert.equal(settled, true, `${kind}: no lost early response`);
      assert.equal((await promise)?.id ?? null, expected?.id ?? null);
      assert.equal(f.api[pendingMap].size, 0);
      assert.equal(f.timers.size, 0);
    }
  });
  test(`${kind}: failed card creation leaves no pending request or timer`, async () => {
    const f = await reactionFixture(kind);
    f.state.failCreate = true;
    await assert.rejects(f.api[method](f.options), /create failed/);
    assert.equal(f.api[pendingMap].size, 0);
    assert.equal(f.timers.size, 0);
    f.state.failCreate = false;
    f.state.onRequest = async message => {
      const request = message.getFlag('digimon-digital-adventures', requestFlag);
      await f.gm.context.ChatMessage.create({ flags: { 'digimon-digital-adventures': {
        [responseFlag]: { requestId: request.requestId, resolverUserId: 'gm', candidate: null }
      } } });
    };
    let settled = false;
    const retry = f.api[method](f.options).then(result => { settled = true; return result; });
    await flush();
    assert.equal(settled, true);
    assert.equal(await retry, null);
  });
  test(`${kind}: timeout advances combat even if card cleanup stalls`, async () => {
    const f = await reactionFixture(kind);
    let settled = false;
    const promise = f.api[method](f.options).then(value => { settled = true; return value; });
    await flush();
    assert.equal(settled, false);
    f.state.cleanupBlocked = true;
    for (const timer of [...f.timers.values()]) timer.fn();
    await flush();
    assert.equal(settled, true);
    assert.equal(await promise, null);
    assert.equal(f.api[pendingMap].size, 0);
    assert.equal(f.timers.size, 0);
  });
}

test('area expiry clears temporary throw movement before stalled chat cleanup', async () => {
  const f = await reactionFixture('area');
  let settled = false, cleared = 0;
  f.gm.context.game.dda = { movementTracker: { clearForActor: async actor => {
    assert.equal(actor.uuid, f.first.uuid); cleared++;
  } } };
  const promise = f.api.requestAreaIntercede(f.options).then(value => { settled = true; return value; });
  await flush();
  const requestId = [...f.api.pendingAreaRequests.keys()][0];
  await f.gm.context.ChatMessage.create({ flags: { 'digimon-digital-adventures': { areaIntercedeThrow: {
    requestId, status: 'moving', movementGranted: true, protectedActorUuid: f.first.uuid
  } } } });
  f.state.cleanupBlocked = true;
  for (const timer of [...f.timers.values()]) timer.fn();
  await flush();
  assert.equal(cleared, 1);
  assert.equal(settled, true);
  assert.equal(await promise, null);
});

test('dependent ranks and per-attack Effect slots still constrain the wizard', async () => {
  const f = await fixture();
  const { DDA_DIGIMON_QUALITIES } = await f.gm.get('scripts/data/digimon-qualities.js');
  const { DDADigimonWizard } = await f.gm.get('scripts/wizard/dda-digimon-wizard.js');
  const wizard = Object.create(DDADigimonWizard.prototype);
  wizard._getSelectedQualityRankByAliases = () => 1;
  for (const id of ['decepcionante', 'flancoAberto', 'doenca']) {
    const canonical = DDA_DIGIMON_QUALITIES.find(q => q.id === id);
    assert.ok(canonical, id);
    assert.equal(wizard._getQualityEffectiveMaxForWizard({ ...canonical, rank: { max: 99 } }), 1, id);
  }
  const effect = DDA_DIGIMON_QUALITIES.find(q => q.choices?.type === 'effectTagPerRank');
  assert.ok(effect);
  wizard._getSelectedQualityById = () => ({ rank: { value: 2 }, choices: { selectedRanks: [] } });
  wizard._getAttackChoiceOptionsForQuality = () => [{ attackId: 'a' }, { attackId: 'a' }, { attackId: 'b' }];
  assert.equal(wizard._getQualityEffectiveMaxForWizard({ ...effect, rank: { max: 1 }, rankLimit: { type: 'fixed', value: 1 } }), 4);
});
