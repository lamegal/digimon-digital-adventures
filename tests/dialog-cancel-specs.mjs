// node --experimental-vm-modules --test tests/dialog-cancel-specs.mjs
// Production dialogs and workflows; Foundry v13 callbacks use value ?? action.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const realFiles = [
  'scripts/combat/tamer-actions.js', 'scripts/rolls/check-roll.js',
  'scripts/sheets/digimon-sheet.js', 'scripts/combat/digimon-actions.js',
  'scripts/tokens/dda-token-hud.js', 'scripts/rolls/pool-roll.js'
];
const baseline = process.env.DDA_TEST_BASELINE === '1';
const sources = new Map(realFiles.map(path => [new URL(path, root).href, baseline
  ? execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(new URL(path, root), 'utf8')]));
const imports = new Map();
for (const [url, code] of sources) {
  for (const [, names, path] of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    const key = new URL(path, url).href;
    const set = imports.get(key) ?? new Set();
    names.split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach(n => set.add(n));
    imports.set(key, set);
  }
}
const narrativeModule = new URL('scripts/rules/tamer-talent-narrative.js', root).href;
imports.set(narrativeModule, new Set([...(imports.get(narrativeModule) ?? []), 'maybeOfferNarrativeTalentAfterCheck']));
function setProperty(object, path, value) {
  const parts = path.split('.'), last = parts.pop();
  for (const key of parts) object = object[key] ??= {};
  object[last] = structuredClone(value);
}

async function fixture(lang = 'en', action = 'cancel', fields = {}) {
  const translations = JSON.parse(fs.readFileSync(new URL(`lang/${lang}.json`, root), 'utf8'));
  const state = { dialogs: [], rolls: [], messages: [], updates: [], payments: [], warnings: [], preparations: [], forceResult: undefined };
  const game = {
    system: { id: 'digimon-digital-adventures' }, combat: { started: true, id: 'combat', round: 1, turn: 0 },
    user: { id: 'owner', isGM: false, targets: new Set() }, actors: [], time: { worldTime: 100 },
    i18n: { lang, localize: key => translations[key] ?? key, format: (key, data = {}) =>
      (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(data[name] ?? '')) },
    settings: { get: () => false }, dda: {}, users: []
  };
  const elements = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key,
    typeof value === 'boolean' ? { checked: value } : { value: String(value) }]));
  const DialogV2 = {
    async wait(options) {
      state.dialogs.push(options);
      await state.onDialog?.(options);
      if (state.forceResult !== undefined) return state.forceResult;
      if (action === 'close' || action === 'escape') { options.close?.(); return null; }
      const button = options.buttons.find(b => b.action === action);
      assert.ok(button, `Missing ${action} button: ${options.window?.title}`);
      const value = await button.callback?.({}, { form: { elements } });
      return value ?? button.action;
    },
    async prompt(options) {
      state.dialogs.push(options);
      if (action === 'close' || action === 'escape') return null;
      return await options.ok?.callback?.({}, { form: { elements } });
    },
    async confirm() { return false; }
  };
  class App { constructor({ document } = {}) { this.actor = document; } }
  class Roll {
    constructor(formula, data = {}) { this.formula = formula; this.data = data; this.dice = [{ results: [3, 4, 5].map(result => ({ result, active: true })) }]; this.terms = []; }
    async evaluate() { this.total = 12 + Number(this.data.modifier ?? 0); state.rolls.push(this); return this; }
    async render() { return '<div class="dice-roll">12</div>'; }
  }
  const passthrough = (_actor, _stat, options) => options;
  const overrides = {
    DDA_DIGIMON_QUALITIES: [],
    hasUnlockedOfficialTamerTalent: () => false, hasQuality: () => false, findQuality: () => null,
    getNextOrderTargetRestriction: () => false,
    getActorActionState: actor => ({ value: actor.system.combat.actions.value }),
    getCombatantUnitId: () => 'unit', getActorSv: () => 2,
    checkActorActionSpend: (actor, amount) => actor.system.combat.actions.value >= amount,
    spendActorActions: async (actor, amount) => {
      assert.ok(Number.isFinite(amount), 'Action cost must be a number');
      if (actor.system.combat.actions.value < amount) return null;
      const actionsBefore = actor.system.combat.actions.value;
      state.payments.push(amount); actor.system.combat.actions.value -= amount;
      return { actionsBefore, actionsAfter: actor.system.combat.actions.value };
    },
    maybeUseLivingEncyclopedia: async () => ({ used: false }),
    maybeApplyAvoidingConsequences: async () => ({ used: false }),
    prepareMiracleRoll: async () => ({ used: false, checkBonus: 0, diceValues: [] }),
    getBusyHandsSkillItems: () => [], applySkillTnModifier: tn => tn,
    maybeUseVariableReroll: async (_actor, roll) => ({ used: false, roll }),
    prepareOmniscientHoldPoolOptions: passthrough,
    prepareAttackDirectTalentPoolOptions: passthrough,
    prepareGuidingDicePoolOptions: (_actor, options) => options,
    preparePoolPlayerInspiration: async (_actor, data) => ({ ...data, choices: [] }),
    applyCheckPlayerInspiration: async (_actor, data) => data,
    applyPoolPlayerInspiration: async (_actor, data) => ({ ...data, diceResults: data.roll?.dice[0]?.results ?? [], choices: [] }),
    maybeApplyPersonalCheerleaderReroll: async () => [],
    buildPlayerInspirationNote: () => '',
    applyLuckyNumberReward: async () => null,
    getDDASetting: () => false
  };
  const context = vm.createContext({
    console, structuredClone, game, Roll,
    foundry: { utils: { deepClone: structuredClone, randomID: () => 'effect', escapeHTML: String, setProperty,
      getProperty: (o, p) => p.split('.').reduce((v, key) => v?.[key], o) },
      applications: { sheets: { ActorSheetV2: App }, api: { ApplicationV2: App, DialogV2, HandlebarsApplicationMixin: x => x } } },
    CONFIG: { DDA: { targetNumbers: {}, stages: {}, stances: {}, sizes: {} } }, CONST: {},
    ui: { notifications: { warn: message => state.warnings.push(message), error: message => state.warnings.push(message), info() {} } },
    canvas: { tokens: { placeables: [], controlled: [] } }, Hooks: { on() {}, once() {} },
    HTMLElement: class {}, ChatMessage: { getSpeaker: ({ actor }) => ({ actor: actor.id }),
      create: async data => { state.messages.push(data); return { ...data, id: 'message' }; } },
    fromUuid: async uuid => game.actors.find(a => a.uuid === uuid), setTimeout, clearTimeout
  });
  vm.runInContext('Math.clamp = (v, min, max) => Math.min(max, Math.max(min, v));', context);
  const modules = new Map();
  async function load(url) {
    const key = new URL(url, root).href;
    if (modules.has(key)) return modules.get(key);
    let module;
    if (sources.has(key)) {
      let code = sources.get(key);
      if (key.endsWith('/tamer-actions.js')) code += '\nexport { useDirect, useReposition, useReinforce, promptPoolActionOptions, useTamerCheckAction };';
      if (key.endsWith('/check-roll.js')) code += '\nexport { getTamerCheckDialogData };';
      if (key.endsWith('/digimon-actions.js')) code += '\nexport { useCheck, choose };';
      if (key.endsWith('/dda-token-hud.js')) code += '\nexport { digimonActionChecks, actionSubmenuItems };';
      module = new vm.SourceTextModule(code, { context, identifier: key,
        importModuleDynamically: async (path, ref) => {
          const m = await load(new URL(path, ref.identifier));
          if (m.status === 'unlinked') await m.link(linker);
          if (m.status !== 'evaluated') await m.evaluate();
          return m;
        } });
    } else {
      const names = [...(imports.get(key) ?? [])];
      module = new vm.SyntheticModule(names, function() {
        for (const name of names) this.setExport(name, overrides[name] ?? (() => null));
      }, { context, identifier: key });
    }
    modules.set(key, module); return module;
  }
  const linker = (path, ref) => load(new URL(path, ref.identifier));
  async function get(path) {
    const m = await load(path);
    if (m.status === 'unlinked') await m.link(linker);
    if (m.status !== 'evaluated') await m.evaluate();
    return m.namespace;
  }
  const partner = { id: 'partner', uuid: 'Actor.partner', documentName: 'Actor', name: 'Betamon', type: 'digimon', items: [],
    system: { derivedStats: Object.fromEntries(['bit', 'dos', 'ram', 'cpu'].map(key => [key, { label: key.toUpperCase(), total: 2 }])),
      mainStats: { accuracy: { label: 'DDA.MainStat.Accuracy', total: 5 }, damage: { label: 'DDA.MainStat.Damage', total: 4 } }, stageValue: 2,
      skillBonuses: { awareness: { value: 3, label: game.i18n.localize('DDA.Skill.Awareness') } },
      effects: { active: [] }, combat: { actions: { value: 4 } } },
    async update(data) { state.updates.push({ actor: this.id, data }); for (const [key, value] of Object.entries(data)) setProperty(this, key, value); } };
  const tamer = { id: 'tamer', uuid: 'Actor.tamer', name: 'Tamer', type: 'character', items: [],
    system: { partner: { uuid: partner.uuid }, attributes: { charisma: { value: 4, label: 'DDA.TamerAttribute.Charisma' },
      agility: { value: 3, label: 'DDA.TamerAttribute.Agility' }, intelligence: { value: 5, label: 'DDA.TamerAttribute.Intelligence' } },
      skills: { awareness: { value: 2, label: 'DDA.Skill.Awareness', attributes: ['intelligence'] } },
      aspects: { major: { uses: { value: 1 } }, minor: { uses: { value: 1 } } },
      combat: { actions: { value: 4 } }, effects: { active: [] } }, update: partner.update };
  game.user.targets.add({ actor: partner, document: { disposition: 1 } });
  game.actors.push(tamer, partner);
  const { DDADigimonSheet } = await get('scripts/sheets/digimon-sheet.js');
  partner.sheet = new DDADigimonSheet({ document: partner });
  partner.sheet.render = () => {};
  tamer.sheet = { render() {} };
  return { get, state, game, partner, tamer, translations };
}

for (const lang of ['pt-BR', 'en']) {
  for (const action of ['cancel', 'close', 'escape']) {
    test(`${lang}: Direct ${action} does not spend Actions, create Effects, mark use or post chat`, async () => {
      const f = await fixture(lang, action);
      const { useDirect } = await f.get('scripts/combat/tamer-actions.js');
      assert.equal(await useDirect(f.tamer), null);
      assert.equal(f.state.messages.length, 0); assert.equal(f.state.updates.length, 0);
      assert.equal(f.state.payments.length, 0); assert.equal(f.partner.system.effects.active.length, 0);
      assert.equal(f.state.dialogs[0].buttons.find(b => b.action === 'cancel').label, f.translations['DDA.Button.Cancel']);
    });
    test(`${lang}: Tamer Skill Check ${action} never rolls or spends resources`, async () => {
      const f = await fixture(lang, action);
      const { rollTamerCheck } = await f.get('scripts/rolls/check-roll.js');
      assert.equal(await rollTamerCheck(f.tamer, 'awareness'), null);
      assert.equal(f.state.rolls.length, 0); assert.equal(f.state.messages.length, 0); assert.equal(f.state.updates.length, 0);
    });
    test(`${lang}: Digimon Skill Check ${action} never rolls or posts chat`, async () => {
      const f = await fixture(lang, action);
      await f.partner.sheet.rollDerivedStatFromHud('bit');
      assert.equal(f.state.rolls.length, 0); assert.equal(f.state.messages.length, 0); assert.equal(f.state.payments.length, 0);
    });
    test(`${lang}: action-bar Spec check ${action} does not spend Actions`, async () => {
      const f = await fixture(lang, action);
      const { useCheck } = await f.get('scripts/combat/digimon-actions.js');
      await useCheck(f.partner, 'bit', { checkType: 'skill' });
      assert.equal(f.state.payments.length, 0); assert.equal(f.state.rolls.length, 0); assert.equal(f.state.messages.length, 0);
      assert.match(f.state.dialogs[0].content, /3d6/);
    });
    test(`${lang}: Tamer action-bar Skill Check ${action} refunds its Action`, async () => {
      const f = await fixture(lang, action);
      const { useTamerCheckAction } = await f.get('scripts/combat/tamer-actions.js');
      assert.equal(await useTamerCheckAction(f.tamer, 'awareness'), null);
      assert.equal(f.tamer.system.combat.actions.value, 4); assert.equal(f.state.rolls.length, 0);
      assert.equal(f.state.messages.length, 0);
    });
    for (const name of ['useReposition', 'useReinforce']) {
      test(`${lang}: ${name} ${action} retains the working cancellation behavior`, async () => {
        const f = await fixture(lang, action);
        const actions = await f.get('scripts/combat/tamer-actions.js');
        assert.equal(await actions[name](f.tamer), null);
        assert.equal(f.state.dialogs.length, 1); assert.equal(f.state.payments.length, 0);
        assert.equal(f.state.rolls.length, 0); assert.equal(f.state.messages.length, 0); assert.equal(f.state.updates.length, 0);
      });
    }
  }
  for (const action of ['close', 'escape']) {
    test(`${lang}: action-bar Pool Check ${action} does not spend Actions or consume bonuses`, async () => {
      const f = await fixture(lang, action);
      const { useCheck } = await f.get('scripts/combat/digimon-actions.js');
      await useCheck(f.partner, 'accuracy', { checkType: 'pool' });
      assert.equal(f.state.dialogs.length, 1); assert.equal(f.state.payments.length, 0);
      assert.equal(f.state.rolls.length, 0); assert.equal(f.state.messages.length, 0); assert.equal(f.state.updates.length, 0);
    });
  }
  test(`${lang}: confirming Direct still applies the real bonus and charges once`, async () => {
    const f = await fixture(lang, 'confirm', { statKey: 'accuracy', mode: 'charisma' });
    const { useDirect } = await f.get('scripts/combat/tamer-actions.js');
    const result = await useDirect(f.tamer);
    assert.ok(result); assert.deepEqual(f.state.payments, [1]);
    assert.equal(f.partner.system.effects.active[0].value, 4);
    assert.equal(f.partner.system.effects.active[0].poolStat, 'accuracy');
    assert.equal(f.state.messages.length, 1); assert.doesNotMatch(f.state.messages[0].content, /undefined|NaN/);
  });
  test(`${lang}: confirmed Digimon Spec check keeps Skill bonus, modifier and TN`, async () => {
    const f = await fixture(lang, 'roll', { skillKey: 'awareness', modifier: 1, tn: 15 });
    await f.partner.sheet.rollDerivedStatFromHud('bit');
    assert.equal(f.state.rolls.length, 1); assert.equal(f.state.rolls[0].data.modifier, 6);
    assert.equal(f.state.messages.length, 1); assert.match(f.state.messages[0].content, /15/);
    assert.equal(f.state.payments.length, 0, 'Sheet shortcut retains its existing free-roll behavior');
  });
  test(`${lang}: confirmed Tamer Skill Check still rolls the correct modifier and posts chat`, async () => {
    const f = await fixture(lang, 'roll', { attributeKey: 'intelligence', tn: 15, manualModifier: 1 });
    const { rollTamerCheck } = await f.get('scripts/rolls/check-roll.js');
    const result = await rollTamerCheck(f.tamer, 'awareness');
    assert.equal(f.state.rolls.length, 1); assert.equal(f.state.rolls[0].data.modifier, 8);
    assert.equal(f.state.messages.length, 1); assert.equal(result.total, 20);
  });
  test(`${lang}: confirmed action-bar Pool Check still rolls and charges once`, async () => {
    const f = await fixture(lang, 'roll');
    const { useCheck } = await f.get('scripts/combat/digimon-actions.js');
    const result = await useCheck(f.partner, 'accuracy', { checkType: 'pool' });
    assert.ok(result); assert.deepEqual(f.state.payments, [2]); assert.equal(f.state.rolls.length, 1);
    assert.equal(f.state.messages.length, 1);
  });
  test(`${lang}: action-bar Spec check charges 2 Actions only on Roll`, async () => {
    const f = await fixture(lang, 'roll', { skillKey: 'awareness', modifier: 1, tn: 15 });
    const { useCheck } = await f.get('scripts/combat/digimon-actions.js');
    await useCheck(f.partner, 'bit', { checkType: 'skill' });
    assert.deepEqual(f.state.payments, [2]); assert.equal(f.state.rolls.length, 1);
    assert.equal(f.state.rolls[0].data.modifier, 6); assert.equal(f.state.messages.length, 1);
  });
  test(`${lang}: legacy cancel action strings cannot trigger Direct or Skill Checks`, async () => {
    const f = await fixture(lang);
    f.state.forceResult = 'cancel';
    const { useDirect } = await f.get('scripts/combat/tamer-actions.js');
    const { rollTamerCheck } = await f.get('scripts/rolls/check-roll.js');
    assert.equal(await useDirect(f.tamer), null);
    assert.equal(await rollTamerCheck(f.tamer, 'awareness'), null);
    await f.partner.sheet.rollDerivedStatFromHud('cpu');
    assert.equal(f.state.rolls.length, 0); assert.equal(f.state.payments.length, 0); assert.equal(f.state.messages.length, 0);
  });
  test(`${lang}: a Spec Check cannot roll or spend Actions with insufficient Actions`, async () => {
    const f = await fixture(lang, 'roll');
    f.partner.system.combat.actions.value = 1;
    const { useCheck } = await f.get('scripts/combat/digimon-actions.js');
    assert.equal(await useCheck(f.partner, 'cpu', { checkType: 'skill' }), null);
    assert.equal(f.state.dialogs.length, 0); assert.equal(f.state.payments.length, 0); assert.equal(f.state.rolls.length, 0);
  });
  test(`${lang}: Spec Check rechecks its Action budget after the dialog`, async () => {
    const f = await fixture(lang, 'roll');
    f.state.onDialog = () => { f.partner.system.combat.actions.value = 0; };
    const { useCheck } = await f.get('scripts/combat/digimon-actions.js');
    assert.equal(await useCheck(f.partner, 'ram', { checkType: 'skill' }), null);
    assert.equal(f.state.payments.length, 0); assert.equal(f.state.rolls.length, 0); assert.equal(f.state.messages.length, 0);
  });
  test(`${lang}: type and stat selection can be cancelled before a Digimon Check`, async () => {
    const f = await fixture(lang);
    const { useCheck } = await f.get('scripts/combat/digimon-actions.js');
    assert.equal(await useCheck(f.partner), null);
    assert.equal(await useCheck(f.partner, '', { checkType: 'skill' }), null);
    assert.equal(f.state.dialogs.length, 2); assert.equal(f.state.payments.length, 0); assert.equal(f.state.rolls.length, 0);
  });
  test(`${lang}: action-bar Check exposes Pool and Skill categories and all four Specs`, async () => {
    const f = await fixture(lang);
    const { digimonActionChecks } = await f.get('scripts/tokens/dda-token-hud.js');
    const calls = [], definition = { execute: (...args) => calls.push(args) };
    const categories = digimonActionChecks(f.partner, definition);
    const pool = categories.find(entry => entry.key === 'action-check-pool');
    const skill = categories.find(entry => entry.key === 'action-check-skill');
    assert.ok(pool); assert.ok(skill);
    assert.equal(pool.label, f.translations['DDA.DigimonAction.Check.Pool']);
    assert.equal(skill.label, f.translations['DDA.DigimonAction.Check.Skill']);
    const specs = await skill.children();
    assert.deepEqual(Array.from(specs.filter(entry => !entry.key.startsWith('__')).map(entry => entry.short)), ['BIT', 'DOS', 'RAM', 'CPU']);
    await specs.find(entry => entry.short === 'BIT').handler();
    assert.equal(calls[0][0], 'check'); assert.equal(calls[0][1].checkType, 'skill'); assert.equal(calls[0][1].statKey, 'bit');
    const pools = await pool.children();
    await pools.find(entry => entry.key === 'action-check-accuracy').handler();
    assert.equal(calls[1][1].statKey, 'accuracy'); assert.equal(calls[1][1].checkType, 'pool');
  });
}
