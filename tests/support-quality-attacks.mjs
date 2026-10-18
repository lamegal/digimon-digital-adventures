// node --experimental-vm-modules --test tests/support-quality-attacks.mjs
// Real binding, validation, effect application, use and Temporary Wound modules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url), scope = 'digimon-digital-adventures';
const real = ['scripts/rolls/attack-roll.js', 'scripts/combat/effect-qualities.js',
  'scripts/combat/effect-qualities-beta8.js', 'scripts/rules/quality-automation.js',
  'scripts/combat/temporary-wounds.js', 'scripts/combat/effect-duration.js',
  'scripts/combat/digizoid-gain-force.js', 'scripts/data/digimon-qualities.js',
  'scripts/combat/utility-qualities.js', 'scripts/combat/area-attacks/area-attack-controller.js',
  'scripts/rules/core-qualities.js', 'scripts/wizard/dda-digimon-wizard.js',
  'scripts/apps/digimon-quality-browser.js'];
const sources = new Map(real.map(path => [new URL(path, root).href,
  process.env.DDA_TEST_BASELINE === '1'
    ? execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(new URL(path, root), 'utf8')]));
const imports = new Map();
for (const [url, code] of sources) for (const [, names, path] of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
  const key = new URL(path, url).href, set = imports.get(key) ?? new Set();
  names.split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach(n => set.add(n)); imports.set(key, set);
}
const directTalentsUrl = new URL('scripts/rules/tamer-talent-attack-direct.js', root).href;
imports.get(directTalentsUrl).add('maybeApplyTakeTheLead');
const economyUrl = new URL('scripts/combat/action-economy.js', root).href;
imports.set(economyUrl, new Set([...(imports.get(economyUrl) ?? []), 'spendActorActions']));
function updatePath(object, path, value) {
  const parts = path.split('.'), last = parts.pop();
  for (const part of parts) object = object[part] ??= {};
  object[last] = structuredClone(value);
}
async function fixture() {
  let serial = 0;
  const actors = new Map(), warnings = [];
  Object.defineProperty(actors, 'contents', { get: () => [...actors.values()] });
  const state = { mode: 'evolve', rollTotal: 17, spends: 0, confirm: true, damageCalls: [] };
  const game = { system: { id: scope }, user: { id: 'gm', isGM: true },
    combat: { id: 'combat', round: 1, turn: 0 }, settings: { get: () => false },
    i18n: { lang: 'en', localize: key => key, format: key => key }, actors, users: [] };
  const CONFIG = { DDA: { effectTags: {} }, statusEffects: [] };
  const canvas = { tokens: { placeables: [], controlled: [] }, scene: { id: 'scene' } };
  const values = {
    getReachModeData: () => ({ mode: '', rank: 0 }), getCoordinatedAssaultBonus: () => ({ bonus: 0 }),
    getBossImmunityEffectTags: () => new Set(), applyHackersMemoryDerivedStatModifier: (_a, _d, value) => value,
    resolveIncomingDigizoidGainForceEffects: async (_a, effects) => ({ effects }),
    localizeDigimonQualityPresentation: quality => quality,
    getTokenGridDistance: () => 1,
    applyDamage: async (...args) => { state.damageCalls.push(args); },
    spendActorActions: async (actor, amount) => {
      if (Number(actor.system.combat.actions?.value ?? 0) < amount) return false;
      state.spends += amount;
      await actor.update({ 'system.combat.actions.value': actor.system.combat.actions.value - amount });
      return true;
    }
  };
  const context = vm.createContext({ console, structuredClone, game, CONFIG,
    canvas, Roll: class { async evaluate() { this.total = state.rollTotal; this.dice = [{ results: [{ result: 4 }, { result: 4 }, { result: 5 }] }]; return this; } },
    foundry: { utils: { deepClone: structuredClone, randomID: () => String(++serial),
      escapeHTML: value => String(value ?? ''),
      getProperty: (o, p) => p.split('.').reduce((v, k) => v?.[k], o), setProperty: updatePath },
      applications: { api: { DialogV2: {
        prompt: async options => state.prompt ? state.prompt(options) : state.mode,
        confirm: async () => state.confirm
      }, ApplicationV2: class {}, HandlebarsApplicationMixin: app => app } } },
    ui: { notifications: { warn: message => warnings.push(message), info() {}, error() {} } },
    fromUuid: async uuid => actors.get(uuid), Hooks: { on() {}, once() {} },
    setTimeout, clearTimeout, ChatMessage: { getSpeaker: () => ({}), create: async () => ({}) }
  });
  vm.runInContext('Math.clamp = (v, min, max) => Math.min(max, Math.max(min, v));', context);
  const modules = new Map();
  async function load(url) {
    const key = new URL(url, root).href;
    if (modules.has(key)) return modules.get(key);
    let module;
    if (sources.has(key)) {
      let code = sources.get(key);
      if (key.endsWith('/attack-roll.js')) code += '\nexport { getPurchasedEffectTagsForAttack, getAppliedAttackQualityModifier, getAttackEffectApplication, applyAttackEffectTags, getDataSpecializationAttackPermission, recordDataSpecializationAttackUse };';
      if (key.endsWith('/area-attack-controller.js')) code += '\nexport { canChooseAllTargets, getAreaTargetOverrides };';
      module = new vm.SourceTextModule(code, { context, identifier: key,
        importModuleDynamically: async (path, ref) => {
          const dependency = await load(new URL(path, ref.identifier));
          if (dependency.status === 'unlinked') await dependency.link(linker);
          if (dependency.status !== 'evaluated') await dependency.evaluate();
          return dependency;
        } });
    } else {
      const names = [...(imports.get(key) ?? [])];
      module = new vm.SyntheticModule(names, function () {
        for (const name of names) this.setExport(name, values[name] ?? (() => null));
      }, { context, identifier: key });
    }
    modules.set(key, module); return module;
  }
  const linker = (path, ref) => load(new URL(path, ref.identifier));
  async function get(path) {
    const module = await load(path); if (module.status === 'unlinked') await module.link(linker);
    if (module.status !== 'evaluated') await module.evaluate(); return module.namespace;
  }
  const rules = await get('scripts/rules/quality-automation.js');
  CONFIG.DDA.effectTags = Object.fromEntries(Object.keys(rules.EFFECT_TAGS).map(tag => [tag, tag.toUpperCase()]));
  function actor(id) {
    const a = { id, uuid: `Actor.${id}`, type: 'digimon', name: id, flags: {}, items: [],
      system: { stage: 'adult', stageValue: 3, combat: {}, effects: { active: [] },
        resources: { battery: { value: 0 } }, mainStats: {},
        derivedStats: { bit: { total: 4 } }, miscStats: { resistance: { total: 1 }, wounds: { temp: { value: 0 } } } },
      async update(changes) { for (const [path, value] of Object.entries(changes)) updatePath(this, path, value); } };
    actors.set(a.uuid, a); return a;
  }
  const caster = actor('caster'), target = actor('target');
  const attack = { id: 'attack', uuid: 'Actor.caster.Item.attack', type: 'attack', name: 'Protective light', parent: caster,
    system: { baseTags: { functionType: 'support', rangeType: 'range' }, qualityTags: [], effectTag: { enabled: false }, isSignature: false } };
  const quality = { id: 'protect', type: 'quality', name: 'Protecting Shield', parent: caster,
    system: { sourceId: 'escudoProtetor', rank: { value: 2 }, choices: { type: 'singleAttack', selectedRanks: [{ attackId: attack.id }] },
      attackModifier: { appliesTo: 'oneSupportAttack', grantsTags: ['shield'] } },
    async update(changes) { for (const [path, value] of Object.entries(changes)) updatePath(this, path, value); } };
  caster.items = [attack, quality];
  const roll = await get('scripts/rolls/attack-roll.js');
  const effects = await get('scripts/combat/effect-qualities.js');
  const validator = await get('scripts/combat/effect-qualities-beta8.js');
  const tags = () => roll.getPurchasedEffectTagsForAttack(caster, attack);
  const validate = (extra = {}) => validator.validateEffectAttackDeclaration({ attacker: caster, defender: target,
    attackItem: attack, targetIsAlly: true, effectTags: tags(), ...extra });
  return { caster, target, attack, quality, roll, effects, validator, tags, validate, CONFIG, get, state, game, canvas, actor, rules };
}

for (const [label, choice] of [
  ['explicit Attack id without a repeated tag', { attackId: 'attack' }],
  ['legacy bare Attack key', { key: 'attack' }],
  ['legacy string selection', 'attack'],
  ['ordinary tagged selection', { key: 'attack:shield', attackId: 'attack', attackTag: 'shield' }],
  ['full embedded UUID', { attackId: 'Actor.caster.Item.attack' }],
  ['rebuilt embedded id with a unique saved name', { attackId: 'old-attack', attackName: 'Protective light' }]
]) test(`Protecting Shield works with ${label}`, async () => {
  const f = await fixture(); f.quality.system.choices.selectedRanks = [choice];
  assert.equal(Array.from(f.tags()).join(), 'shield');
  assert.equal(f.validate().ok, true);
  assert.equal(f.effects.findProtectingShieldQualityForAttack(f.caster, f.attack), f.quality);
  assert.equal(f.CONFIG.statusEffects.length, 0, 'no core status icon or extra Effect purchase is required');
});

test('an old Protecting Shield purchase retains its payload without duplicated modifier metadata', async () => {
  const f = await fixture(); delete f.quality.system.attackModifier;
  f.quality.name = 'Escudo Protetor';
  assert.equal(Array.from(f.tags()).join(), 'shield');
  assert.equal(f.validate().ok, true);
});

test('fixed supportive tags participate in the target-neutral Area preflight', async () => {
  const f = await fixture();
  const modifier = f.roll.getAppliedAttackQualityModifier(f.caster, f.attack, { defender: null, targetToken: null });
  assert.ok(Array.from(modifier.effectTags).includes('shield'));
});

test('builder keys containing colons and legacy selected arrays retain a fixed Quality binding', async () => {
  const f = await fixture();
  f.attack.system.wizard = { attackKey: 'child:protective-light' };
  f.quality.system.choices.selectedRanks = [];
  f.quality.system.choices.selected = [' child:protective-light '];
  assert.equal(Array.from(f.tags()).join(), 'shield');
  assert.equal(f.validate().ok, true);
});

test('other fixed supportive Effect grants work without a core status or a repeated tag', async () => {
  const f = await fixture();
  f.quality.name = 'Custom Accuracy Support'; f.quality.system.sourceId = 'custom-support';
  f.quality.system.attackModifier.grantsTags = ['keen'];
  assert.equal(Array.from(f.tags()).join(), 'keen');
  assert.equal(f.validate().ok, true);
  assert.equal(f.CONFIG.statusEffects.length, 0);
});

test('a bound supportive Quality is restricted to its selected Attack, including ambiguous old names', async () => {
  const f = await fixture();
  const other = { ...f.attack, id: 'other', uuid: 'Actor.caster.Item.other', name: 'Other light' };
  f.caster.items.push(other);
  assert.equal(f.roll.getPurchasedEffectTagsForAttack(f.caster, other).length, 0);
  f.quality.system.choices.selectedRanks = [{ attackId: 'obsolete', attackName: f.attack.name }];
  other.name = f.attack.name;
  assert.equal(f.tags().length, 0);
  assert.equal(f.effects.findProtectingShieldQualityForAttack(f.caster, f.attack), null);
});

test('ordinary Effect pools still resolve only the Effect purchased for the selected Attack', async () => {
  const f = await fixture(); f.caster.items = [f.attack, {
    type: 'quality', name: 'Advanced Effect', system: {
      choices: { type: 'effectTagPerRank', selectedRanks: [{ attackId: 'attack', attackTag: 'poison' }] },
      attackModifier: { appliesTo: 'oneAttackPerPurchasedEffect', grantsTags: ['poison', 'shield', 'haste'] }
    }
  }];
  assert.equal(Array.from(f.tags()).join(), 'poison');
  assert.equal(f.validate().ok, true);
});

test('GUIDING and unrelated Quality modifiers alone do not invent a Support payload', async () => {
  const f = await fixture(); f.quality.system.sourceId = 'inspiringGuidance'; f.quality.name = 'Inspiring Guidance';
  f.quality.system.attackModifier = { appliesTo: 'oneSupportAttackWithPositiveEffect', grantsTags: ['guiding'] };
  assert.equal(f.tags().length, 0);
  assert.equal(f.validate().ok, false);
});

test('repairing Support payloads does not reclassify ordinary Damage Quality bindings', async () => {
  const f = await fixture(); f.attack.system.baseTags.functionType = 'damage';
  f.quality.name = 'Drain Attack'; f.quality.system.sourceId = 'drain';
  f.quality.system.attackModifier = { appliesTo: 'oneDamageAttack', grantsTags: ['drain'] };
  assert.equal(f.tags().length, 0);
  assert.equal(f.roll.getAppliedAttackQualityModifier(f.caster, f.attack).effectTags.length, 0);
});

test('Shield grants real Temporary Wounds and its use ledger charges once per shared execution', async () => {
  const f = await fixture(); f.attack.system.isSignature = true;
  const executionId = 'area-shield';
  assert.equal(f.validate({ areaActive: true, currentBattery: 2, executionId }).ok, true);
  const application = f.roll.getAttackEffectApplication({ attacker: f.caster, defender: f.target, attackItem: f.attack,
    activeEffectTags: f.tags(), normalDamage: 0, hit: true, accuracySuccesses: 4, leftoverSuccesses: 3,
    targetIsAlly: true, targetIsWilling: true, positiveTargetHealthSuccesses: 2 });
  assert.equal(application.applied.length, 1);
  const result = await f.roll.applyAttackEffectTags(f.target, application.applied);
  assert.equal(Array.from(result.applied).join(), 'shield');
  assert.equal(f.target.system.miscStats.wounds.temp.value, 6, 'BIT 4 + Stage 3 - Resistance 1');
  assert.equal(f.target.system.effects.active[0].tag, 'shield');
  assert.ok(f.target.system.effects.active[0].remaining > 0);
  await f.effects.consumeProtectingShieldUse({ attacker: f.caster, attackItem: f.attack, executionId });
  await f.effects.consumeProtectingShieldUse({ attacker: f.caster, attackItem: f.attack, executionId });
  assert.equal(f.quality.system.uses.value, 1);
  assert.equal(f.effects.getProtectingShieldUsage(f.caster, f.quality).used, 1);
});

test('self targeting, area requirements and the single Effect limit remain enforced', async () => {
  const f = await fixture();
  assert.equal(f.validate({ defender: f.caster }).ok, false);
  assert.equal(f.validate({ areaActive: true, currentBattery: 2 }).ok, false);
  f.attack.system.isSignature = true;
  assert.equal(f.validate({ areaActive: true, currentBattery: 1 }).ok, false);
  assert.equal(f.validate({ areaActive: true, currentBattery: 2 }).ok, true);
  assert.equal(f.validate({ effectTags: ['shield', 'poison'] }).ok, false);
  f.attack.system.baseTags.functionType = 'damage';
  assert.equal(f.validate().ok, false);
});

test('Shield needs its purchased binding and remaining uses, with the shared execution exception', async () => {
  const f = await fixture();
  f.quality.system.choices.selectedRanks = [{ attackId: 'other', attackTag: 'shield' }];
  assert.equal(f.validate({ effectTags: ['shield'] }).ok, false);
  f.quality.system.choices.selectedRanks = [{ attackId: 'attack', attackTag: 'shield' }];
  await f.effects.consumeProtectingShieldUse({ attacker: f.caster, attackItem: f.attack, executionId: 'one' });
  await f.effects.consumeProtectingShieldUse({ attacker: f.caster, attackItem: f.attack, executionId: 'two' });
  assert.equal(f.quality.system.uses.value, 0);
  assert.equal(f.validate({ executionId: 'three' }).ok, false);
  assert.equal(f.validate({ executionId: 'two' }).ok, true);
});

test('every catalog Effect allowed on Support resolves without a core status entry', async () => {
  const f = await fixture(); const catalog = await f.get('scripts/data/digimon-qualities.js');
  let checked = 0;
  for (const entry of catalog.DDA_DIGIMON_QUALITIES.filter(q => q.choices?.type === 'effectTagPerRank')) {
    for (const option of entry.choices.options.filter(option => !option.requiresDamageTag)) {
      const quality = { id: entry.id, type: 'quality', name: entry.originalName,
        system: { ...structuredClone(entry), choices: { ...structuredClone(entry.choices),
          selectedRanks: [{ attackId: f.attack.id, attackTag: option.key }] } } };
      f.caster.items = [f.attack, quality];
      assert.equal(Array.from(f.tags()).join(), option.key, `${entry.originalName}: ${option.key}`);
      assert.equal(f.validate().ok, true, `${entry.originalName}: ${option.key}`);
      checked++;
    }
  }
  assert.equal(checked, 40);
  assert.equal(f.CONFIG.statusEffects.length, 0);
});

test('Inspiring Guidance recognizes a legacy binding and grants dice after its Positive Effect', async () => {
  const f = await fixture();
  const guidance = { id: 'guidance', type: 'quality', name: 'Inspiring Guidance', system: {
    sourceId: 'orientacaoInspiradora', rank: { value: 2 },
    choices: { selectedRanks: ['attack'] }, attackModifier: { grantsTags: ['guiding'], appliesTo: 'oneSupportAttackWithPositiveEffect' }
  } };
  const effect = { tag: 'sharpen', effectType: 'positive', sourceActorUuid: f.caster.uuid,
    sourceAttackId: f.attack.id, duration: 3, remaining: 3 };
  f.caster.items = [f.attack, guidance]; f.target.system.effects.active = [effect];
  const results = [{ attacker: f.caster, attackItem: f.attack, defender: f.target, hit: true,
    effectApplication: { applied: [effect] }, appliedEffectResolution: { applied: ['sharpen'] } }];
  const result = await f.effects.resolveInspiringGuidanceAfterAttack({ attacker: f.caster, attackItem: f.attack, results });
  assert.equal(result?.guidingDice, 4);
  assert.equal(f.target.system.combat.guidingDice.effectTag, 'sharpen');
  assert.equal(f.effects.getGuidingDiceState(f.target)?.current, 4);
  f.attack.system.isSignature = true; f.state.rollTotal = 10;
  const failed = await f.effects.resolveInspiringGuidanceAfterAttack({ attacker: f.caster, attackItem: f.attack, results, currentBattery: 2 });
  assert.equal(failed?.guidingDice, 2, 'Signature Battery grants dice even on the failed Check');
});

for (const [label, choice] of [
  ['ordinary id', { attackId: 'attack' }], ['tagged key', { key: 'attack:zero' }],
  ['string key', 'attack'], ['UUID', { attackId: 'Actor.caster.Item.attack' }],
  ['recreated Attack name', { attackId: 'old-attack', attackName: 'Protective light' }],
  ['legacy value', { value: 'attack' }]
]) test(`Zero Unit uses its own non-status Support activation with a ${label} binding`, async () => {
  const f = await fixture(); const runtime = await f.get('scripts/combat/digizoid-gain-force.js');
  const zero = { id: 'zero', type: 'quality', name: 'Zero Unit', system: { sourceId: 'unidadeZero',
    rank: { value: 1 }, choices: { selectedRanks: [choice] }, attackModifier: { grantsTags: ['zero'] } } };
  const instinct = { type: 'quality', name: 'Instinct', system: { rank: { value: 2 } } };
  f.caster.items = [f.attack, zero, instinct]; f.caster.system.combat.actions = { value: 3 };
  f.canvas.tokens.placeables = [{ actor: f.caster }, { actor: f.target }]; f.game.user.targets = new Set();
  const result = await runtime.tryExecuteSpecialGainForceAttack(f.caster, f.attack);
  assert.equal(result.handled, true);
  assert.equal(result.result.credit, 2);
  assert.equal(f.state.spends, 2);
  assert.equal(f.caster.system.combat.digizoidGainForce.zeroUnit.used, true);
  assert.equal(f.CONFIG.statusEffects.length, 0);
  assert.equal(f.tags().length, 0, 'ZERO activates without inventing an ordinary Effect Tag');
  const repeated = await runtime.tryExecuteSpecialGainForceAttack(f.caster, f.attack);
  assert.equal(repeated.handled, false, 'the once-per-Combat benefit cannot activate again');
  assert.equal(f.state.spends, 2);
});

test('Zero Unit revival grants Wounds through its own activation without an Effect Tag', async () => {
  const f = await fixture(); const runtime = await f.get('scripts/combat/digizoid-gain-force.js');
  f.state.mode = 'revive';
  const zero = { type: 'quality', name: 'Zero Unit', system: { choices: { selectedRanks: ['attack'] } } };
  const instinct = { type: 'quality', name: 'Instinct', system: { rank: { value: 2 } } };
  f.caster.items = [f.attack, zero, instinct]; f.caster.system.combat.actions = { value: 3 };
  Object.assign(f.target.system.miscStats.wounds, { value: 0, max: 12 });
  f.target.system.combat.defeated = true;
  f.game.user.targets = new Set([{ actor: f.target }]);
  const result = await runtime.tryExecuteSpecialGainForceAttack(f.caster, f.attack);
  assert.equal(result.handled, true);
  assert.equal(f.target.system.miscStats.wounds.value, 4);
  assert.equal(f.target.system.combat.defeated, false);
  assert.equal(f.state.spends, 2);
});

for (const tag of ['burn', 'freeze', 'dot']) test(`Code Wizard permits a purchased [${tag.toUpperCase()}] on Support at declaration and application`, async () => {
  const f = await fixture();
  const catalog = await f.get('scripts/data/digimon-qualities.js');
  const entry = catalog.DDA_DIGIMON_QUALITIES.find(quality => quality.choices?.type === 'effectTagPerRank' &&
    quality.choices.options.some(option => option.key === tag));
  f.caster.items = [f.attack, { type: 'quality', name: entry.originalName, system: {
    ...structuredClone(entry), choices: { ...structuredClone(entry.choices),
      selectedRanks: [{ attackId: f.attack.id, attackTag: tag }] }
  } }];
  assert.equal(Array.from(f.tags()).join(), tag);
  const options = { effectTags: [tag] };
  assert.equal(f.validate(options).ok, false, 'the ordinary DAMAGE requirement still applies');
  f.caster.system.qualityFeatures = { dataSpecialization: { codeWizardDamageTagBypass: true } };
  assert.equal(f.validate(options).ok, true, 'Code Wizard overrides the DAMAGE requirement');
  const application = f.roll.getAttackEffectApplication({ attacker: f.caster, defender: f.target,
    attackItem: f.attack, activeEffectTags: [tag], normalDamage: 0, hit: true,
    accuracySuccesses: 4, leftoverSuccesses: 3 });
  assert.equal(application.applied[0]?.tag, tag);
  assert.equal(f.validate({ ...options, defender: f.caster }).ok, false, 'Code Wizard does not permit self targeting');
  assert.equal(f.validate({ effectTags: [tag, 'poison'] }).ok, false, 'one Effect per Attack remains');
});

function supportPair(f) {
  f.caster.system.qualityFeatures = { dataSpecialization: { statusWarlordAttackPair: true } };
  const damage = { ...f.attack, id: 'damage', uuid: 'Actor.caster.Item.damage', name: 'Signature weapon',
    system: { baseTags: { functionType: 'damage', rangeType: 'melee' },
      qualityTags: ['weapon', 't:blast'], isSignature: true } };
  f.caster.items.push(damage);
  return damage;
}

test('Status Warlord accepts a Damage Signature Move with non-Effect Tags, in either order', async () => {
  for (const supportFirst of [true, false]) {
    const f = await fixture(), damage = supportPair(f);
    const first = supportFirst ? f.attack : damage, second = supportFirst ? damage : f.attack;
    await f.roll.recordDataSpecializationAttackUse(f.caster, first);
    const permission = f.roll.getDataSpecializationAttackPermission(f.caster, second, {}, true);
    assert.equal(permission.allowed, true, `support first: ${supportFirst}`);
    assert.equal(permission.mode, 'statusWarlord');
    await f.roll.recordDataSpecializationAttackUse(f.caster, second, permission.mode);
    assert.equal(f.roll.getDataSpecializationAttackPermission(f.caster, first, {}, true).allowed, false, 'no third Attack');
    f.game.combat.round++;
    assert.equal(f.roll.getDataSpecializationAttackPermission(f.caster, second, {}, true).allowed, false, 'no old-round pair');
  }
});

test('Status Warlord rejects Effect-bearing Damage, including an unmaterialized purchased Effect', async () => {
  for (const bindingOnly of [false, true]) {
    const f = await fixture(), damage = supportPair(f);
    if (bindingOnly) {
      damage.system.qualityTags = []; damage.system.isSignature = false;
      f.caster.items.push({ type: 'quality', name: 'Advanced Effect', system: {
      choices: { type: 'effectTagPerRank', selectedRanks: [{ attackId: damage.id, attackTag: 'poison' }] }
    } });
    }
    else damage.system.qualityTags = ['poison'];
    await f.roll.recordDataSpecializationAttackUse(f.caster, f.attack);
    assert.equal(f.roll.getDataSpecializationAttackPermission(f.caster, damage, {}, true).allowed, false);
  }
});

test('Status Warlord does not grant its Attack pair on an Interrupt Action', async () => {
  const f = await fixture(), damage = supportPair(f);
  await f.roll.recordDataSpecializationAttackUse(f.caster, f.attack);
  assert.equal(f.roll.getDataSpecializationAttackPermission(f.caster, damage, { isInterrupt: true }, true).allowed, false);
});

function guidance(f) {
  f.quality.name = 'Inspiring Guidance'; f.quality.system.sourceId = 'inspiringGuidance';
  f.quality.system.attackModifier = { appliesTo: 'oneSupportAttackWithPositiveEffect', grantsTags: ['guiding'] };
  const effect = { tag: 'keen', effectType: 'positive', sourceActorUuid: f.caster.uuid,
    sourceAttackId: f.attack.id, remaining: 3, duration: 3 };
  f.target.system.effects.active = [effect];
  return { defender: f.target, hit: true, effectApplication: { applied: [effect] },
    appliedEffectResolution: { applied: ['keen'] } };
}

test('Inspiring Guidance grants nothing when the Positive Effect was denied', async () => {
  const f = await fixture(), result = guidance(f);
  result.appliedEffectResolution = { applied: [], denied: 'keen' };
  const resolution = await f.effects.resolveInspiringGuidanceAfterAttack({ attacker: f.caster,
    attackItem: f.attack, results: [result], currentBattery: 2 });
  assert.equal(resolution, null);
  assert.equal(f.target.system.combat.guidingDice, undefined);
});

test('Inspiring Guidance requires an allied target and a Support Attack', async () => {
  for (const invalid of ['enemy', 'damage']) {
    const f = await fixture(), result = guidance(f);
    if (invalid === 'enemy') f.target.system.combat.initiative = { side: 'enemies' };
    else f.attack.system.baseTags.functionType = 'damage';
    assert.equal(await f.effects.resolveInspiringGuidanceAfterAttack({ attacker: f.caster,
      attackItem: f.attack, results: [result] }), null, invalid);
    assert.equal(f.target.system.combat.guidingDice, undefined);
  }
});

test('an Area Inspiring Guidance activation grants its dice to exactly one eligible ally', async () => {
  const f = await fixture(), first = guidance(f), other = f.actor('other-ally');
  other.system.effects.active = structuredClone(f.target.system.effects.active);
  const second = { ...first, defender: other };
  f.state.prompt = () => second;
  await f.effects.resolveInspiringGuidanceAfterAttack({ attacker: f.caster, attackItem: f.attack,
    results: [first, second], isArea: true });
  assert.equal(f.target.system.combat.guidingDice, undefined);
  assert.equal(other.system.combat.guidingDice.current, 4);
});

function ward(f, name = 'Holy Ward') {
  f.caster.items = [f.attack, { type: 'quality', name, system: {} }];
  Object.assign(f.target.system.miscStats.wounds, { value: 3, max: 20 });
  return { defender: f.target, hit: true, activeEffectTags: ['keen'] };
}

test('Holy Ward recognizes every Positive Effect and its explicit Unique exceptions', async () => {
  const f = await fixture(), result = ward(f), utility = await f.get('scripts/combat/utility-qualities.js');
  const tags = [...Object.entries(f.rules.EFFECT_TAGS).filter(([, definition]) => definition.type === 'positive')
    .map(([tag]) => tag), 'haste', 'immune'];
  for (const tag of new Set(tags)) {
    result.activeEffectTags = [tag];
    f.target.system.miscStats.wounds.value = 3;
    const resolution = await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] });
    assert.equal(resolution?.amount, 2, tag);
    assert.equal(f.target.system.miscStats.wounds.value, 5, tag);
    f.game.combat.round++;
  }
});

test('Holy Ward is limited once per Round and becomes available in the next Round without Chaotic Balance', async () => {
  const f = await fixture(), result = ward(f), utility = await f.get('scripts/combat/utility-qualities.js');
  result.activeEffectTags = ['shield'];
  assert.equal((await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }))?.amount, 2);
  assert.equal(await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }), null);
  f.game.combat.round++;
  assert.equal((await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }))?.amount, 2);
  f.game.combat.id = 'new-combat';
  assert.equal((await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }))?.amount, 2);
});

test('Holy Ward cannot turn an empty Support Attack into a valid payload', async () => {
  const f = await fixture(), result = ward(f), utility = await f.get('scripts/combat/utility-qualities.js');
  result.activeEffectTags = [];
  assert.equal(f.validate().ok, false);
  assert.equal(await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }), null);
  result.activeEffectTags = ['keen']; result.hit = false;
  assert.equal(await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }), null);
});

test('Chaotic Balance alternates its bonus only across consecutive Rounds and allows the same ward after a skipped Round', async () => {
  const f = await fixture(), result = ward(f), utility = await f.get('scripts/combat/utility-qualities.js');
  f.caster.items.push({ type: 'quality', name: 'Dark Emblem', system: {} },
    { type: 'quality', name: 'Chaotic Balance', system: {} });
  result.activeEffectTags = ['shield'];
  assert.equal((await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }))?.amount, 2);
  f.game.combat.round++;
  assert.equal(await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }), null);
  result.activeEffectTags = ['poison'];
  assert.equal((await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }))?.amount, 3);
  f.game.combat.round += 2;
  assert.equal((await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }))?.amount, 2);
  f.game.combat.id = 'new-combat'; result.activeEffectTags = ['shield'];
  assert.equal((await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }))?.amount, 2);
});

test('Dark Emblem recognizes all Negative and Damage Effects, as well as its listed Unique exceptions', async () => {
  const f = await fixture(), result = ward(f, 'Dark Emblem'), utility = await f.get('scripts/combat/utility-qualities.js');
  const tags = [...Object.entries(f.rules.EFFECT_TAGS).filter(([, definition]) => ['negative', 'damage'].includes(definition.type))
    .map(([tag]) => tag), 'fear', 'doom', 'stun', 'blind', 'dot'];
  for (const tag of new Set(tags)) {
    result.activeEffectTags = [tag];
    const resolution = await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] });
    assert.equal(resolution?.amount, 2, tag);
    assert.equal(f.state.damageCalls.at(-1)[1], 2, tag);
    f.game.combat.round++;
  }
});

test('Firewall Bypass preserves Support Area Potency and Duration only when everyone is targeted', async () => {
  const f = await fixture();
  f.caster.items = [f.attack, { type: 'quality', name: 'Zoner', system: {
    choices: { selected: [{ key: 'firewallBypass' }] }
  } }];
  const application = mode => f.roll.getAttackEffectApplication({ attacker: f.caster, defender: f.target,
    attackItem: f.attack, activeEffectTags: ['keen'], normalDamage: 0, hit: true,
    accuracySuccesses: 5, leftoverSuccesses: 3, targetIsAlly: true, targetIsWilling: true,
    positiveTargetHealthSuccesses: 2, areaAttackDeclaration: { active: true, targetMode: mode } }).applied[0];
  const all = application('all'), allies = application('allies');
  assert.equal(all.potency, allies.potency + 1);
  assert.equal(all.duration, allies.duration + 1);
});

test('a legacy string Zoner selection still grants Firewall Bypass', async () => {
  const f = await fixture();
  f.caster.items.push({ type: 'quality', name: 'Zoner', system: {
    choices: { selected: ['firewallBypass'] }
  } });
  f.quality.system.attackModifier.grantsTags = ['keen'];
  const modifier = f.roll.getAppliedAttackQualityModifier(f.caster, f.attack);
  // Zoner applies only to Attacks that have an Area Tag.
  f.attack.system.qualityTags = ['t:blast'];
  const areaModifier = f.roll.getAppliedAttackQualityModifier(f.caster, f.attack);
  assert.equal(modifier.zonerOptions.length, 0);
  assert.equal(Array.from(areaModifier.zonerOptions).join(), 'firewallbypass');
  const args = { attacker: f.caster, defender: f.target, attackItem: f.attack,
    activeEffectTags: ['keen'], normalDamage: 0, hit: true, accuracySuccesses: 5,
    leftoverSuccesses: 3, targetIsAlly: true, targetIsWilling: true };
  const single = f.roll.getAttackEffectApplication(args).applied[0];
  const area = f.roll.getAttackEffectApplication({ ...args,
    areaAttackDeclaration: { active: true, targetMode: 'all' } }).applied[0];
  assert.equal(area.potency, single.potency);
  assert.equal(area.duration, single.duration);
});

test('Friendly Fire keeps Support for allies and Damage without the Effect for enemies', async () => {
  const f = await fixture(), area = await f.get('scripts/combat/area-attacks/area-attack-controller.js');
  const modifier = { zonerOptions: ['friendlyFire'], effectTags: ['sharpen'] };
  f.quality.system.attackModifier.grantsTags = ['sharpen'];
  f.target.system.combat.initiative = { side: 'enemies' };
  const ally = f.actor('ally');
  assert.equal(area.canChooseAllTargets(f.attack, modifier), true);
  const enemyOverrides = area.getAreaTargetOverrides(f.caster, f.target, f.attack, modifier, 'all');
  const allyOverrides = area.getAreaTargetOverrides(f.caster, ally, f.attack, modifier, 'all');
  assert.equal(enemyOverrides.functionTypeOverride, 'damage');
  assert.equal(enemyOverrides.suppressEffectTags, true);
  assert.equal(allyOverrides.functionTypeOverride, 'support');
  assert.equal(allyOverrides.suppressEffectTags, false);
  assert.equal(f.validate({ defender: f.target, targetIsAlly: false, effectTags: [],
    functionTypeOverride: enemyOverrides.functionTypeOverride }).ok, true);
  assert.equal(f.validate({ defender: ally, functionTypeOverride: allyOverrides.functionTypeOverride }).ok, true);
  assert.equal(area.getAreaTargetOverrides(f.caster, ally, f.attack, modifier, 'allies').friendlyFireActive, false);
});

test('Friendly Fire accepts allied-only Unique Effects and bound Shield without materialized tags', async () => {
  const f = await fixture(), area = await f.get('scripts/combat/area-attacks/area-attack-controller.js');
  for (const tag of ['haste', 'immune', 'shield']) {
    const modifier = { zonerOptions: ['friendlyFire'], effectTags: [tag] };
    assert.equal(area.canChooseAllTargets(f.attack, modifier), true, tag);
  }
});

test('Friendly Fire does not convert harmful or effectless Support into Damage', async () => {
  const f = await fixture(), area = await f.get('scripts/combat/area-attacks/area-attack-controller.js');
  f.target.system.combat.initiative = { side: 'enemies' };
  for (const tag of ['poison', 'root', 'push', '']) {
    const modifier = { zonerOptions: ['friendlyFire'], effectTags: tag ? [tag] : [] };
    assert.equal(area.canChooseAllTargets(f.attack, modifier), false, tag);
    const overrides = area.getAreaTargetOverrides(f.caster, f.target, f.attack, modifier, 'all');
    assert.equal(overrides.friendlyFireActive, false, tag);
    assert.equal(overrides.suppressEffectTags, false, 'Indiscriminate Targeting does not discard the original Effect');
  }
  f.attack.system.qualityTags = ['sharpen'];
  const currentPurchase = { zonerOptions: ['friendlyFire'], effectTags: ['poison'] };
  assert.equal(area.canChooseAllTargets(f.attack, currentPurchase), false, 'stale copied tags do not override the current purchased Effect');
});

test('Holy Ward in an Area heals only the selected target and consumes one use for the Round', async () => {
  const f = await fixture(), first = ward(f), utility = await f.get('scripts/combat/utility-qualities.js');
  first.activeEffectTags = ['sharpen'];
  const other = f.actor('other-ally'); Object.assign(other.system.miscStats.wounds, { value: 4, max: 20 });
  f.state.prompt = () => other.uuid;
  const result = await utility.resolveWardEmblemAfterAttack({ attacker: f.caster,
    results: [first, { ...first, defender: other }] });
  assert.equal(result.target.uuid, other.uuid);
  assert.equal(f.target.system.miscStats.wounds.value, 3);
  assert.equal(other.system.miscStats.wounds.value, 6);
  assert.equal(await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [first] }), null);
});

test('Holy Ward does not trigger on an unrelated harmful or unlisted Unique Effect', async () => {
  const f = await fixture(), result = ward(f), utility = await f.get('scripts/combat/utility-qualities.js');
  for (const tag of ['poison', 'root', 'cleanse', 'push', 'deny']) {
    result.activeEffectTags = [tag];
    assert.equal(await utility.resolveWardEmblemAfterAttack({ attacker: f.caster, results: [result] }), null, tag);
  }
  assert.equal(f.target.system.miscStats.wounds.value, 3);
});

test('Code Wizard is available when selecting Effects in both the form wizard and the post-creation browser', async () => {
  const f = await fixture();
  const { DDADigimonWizard } = await f.get('scripts/wizard/dda-digimon-wizard.js');
  const { DDADigimonQualityBrowser } = await f.get('scripts/apps/digimon-quality-browser.js');
  const catalog = await f.get('scripts/data/digimon-qualities.js');
  const quality = catalog.DDA_DIGIMON_QUALITIES.find(q => q.originalName === 'Advanced Effect');
  const wizard = Object.create(DDADigimonWizard.prototype);
  wizard._getWizardAttackItemsForChoices = () => [f.attack];
  wizard.data = { qualities: { positive: [], negative: [] } };
  const browser = Object.create(DDADigimonQualityBrowser.prototype); browser.actor = f.caster;
  f.caster.items = [f.attack];
  for (const app of [wizard, browser]) {
    assert.equal(app._getAttackChoiceOptionsForQuality(quality).some(choice => choice.effectTag === 'burn'), false);
  }
  for (const selection of ['codeWizard', { specialization: 'codeWizard' }, { key: 'Mago do Código' }]) {
    const specialization = { id: 'especializacaoDeDados', name: 'Data Specialization',
      choices: { selectedRanks: [selection] } };
    wizard.data.qualities.positive = [specialization];
    f.caster.items = [f.attack, { type: 'quality', name: specialization.name, system: specialization }];
    for (const app of [wizard, browser]) {
      const choices = app._getAttackChoiceOptionsForQuality(quality);
      assert.equal(choices.some(choice => choice.effectTag === 'burn'), true);
      assert.equal(choices.some(choice => choice.effectTag === 'freeze'), true);
    }
  }
});
