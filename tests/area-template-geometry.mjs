// node --experimental-vm-modules --test tests/area-template-geometry.mjs
// Real controller and positioning modules; simulated V13 canvas and PIXI shapes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const areaPath = 'scripts/combat/area-attacks/area-attack-controller.js';
const positionPath = 'scripts/combat/positioning.js';
const baseline = process.env.DDA_TEST_BASELINE === '1';
const areaCode = baseline ? execFileSync('git', ['show', `HEAD:${areaPath}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(new URL(areaPath, root), 'utf8');
const sources = new Map([[new URL(areaPath, root).href, areaCode + `
export { buildTemplateData, drawTemplatePreview, getAreaSizeBounds, filterAreaTargets,
tokenIsInsideBaseArea, validateTemplatePlacement, promptAreaConfiguration,
movePassAttackerToTemplateEnd, createPersistentTemplate };`],
[new URL(positionPath, root).href, fs.readFileSync(new URL(positionPath, root), 'utf8')]]);
const importNames = new Map();
for (const [url, code] of sources) for (const [, names, path] of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
  const key = new URL(path, url).href, set = importNames.get(key) ?? new Set();
  names.split(',').map(n => n.trim()).filter(Boolean).forEach(n => set.add(n)); importNames.set(key, set);
}

class Polygon {
  constructor(points) { this.points = points.flatMap(p => typeof p === 'number' ? [p] : [p.x, p.y]); }
  contains(x, y) {
    const p = this.points; let inside = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const ax = p[j], ay = p[j + 1], bx = p[i], by = p[i + 1];
      if (Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) < 1e-5 &&
        x >= Math.min(ax, bx) - 1e-5 && x <= Math.max(ax, bx) + 1e-5 &&
        y >= Math.min(ay, by) - 1e-5 && y <= Math.max(ay, by) + 1e-5) return true;
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  }
}
class Circle {
  constructor(x, y, radius) { Object.assign(this, { x, y, radius }); }
  contains(x, y) { return Math.hypot(x - this.x, y - this.y) <= this.radius + 1e-7; }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
const settle = () => new Promise(resolve => setImmediate(resolve));

async function fixture({ distance = 1, metric = 'equidistant', hex = false, gridless = false } = {}) {
  const state = { dialogs: [], warnings: [], templates: [], hooks: [], serial: 0 };
  const grid = {
    size: 100, sizeX: 100, sizeY: hex ? 100 * Math.sqrt(3) / 2 : 100,
    distance, isGridless: gridless, isHexagonal: hex,
    getCenterPoint({ i, j }) { return { x: 50 + 100 * (j + (hex ? i / 2 : 0)), y: 50 + this.sizeY * i }; },
    getOffsetRange(b) {
      if (!hex) return [Math.floor(b.y / 100), Math.floor(b.x / 100), Math.ceil((b.y + b.height) / 100), Math.ceil((b.x + b.width) / 100)];
      const i0 = Math.floor((b.y - 50) / this.sizeY) - 1, i1 = Math.ceil((b.y + b.height - 50) / this.sizeY) + 2;
      return [i0, Math.floor(b.x / 100 - i1 / 2) - 2, i1, Math.ceil((b.x + b.width) / 100 - i0 / 2) + 2];
    },
    getVertices(offset) {
      const c = this.getCenterPoint(offset);
      return hex ? Array.from({ length: 6 }, (_, n) => {
        const a = (30 + n * 60) * Math.PI / 180;
        return { x: c.x + Math.cos(a) * 100 / Math.sqrt(3), y: c.y + Math.sin(a) * 100 / Math.sqrt(3) };
      }) : [{ x: c.x - 50, y: c.y - 50 }, { x: c.x + 50, y: c.y - 50 },
        { x: c.x + 50, y: c.y + 50 }, { x: c.x - 50, y: c.y + 50 }];
    },
    measurePath([a, b]) {
      let dx = Math.abs(a.x - b.x) / 100, dy = Math.abs(a.y - b.y) / this.sizeY;
      let spaces;
      if (hex) { const r = (a.y - b.y) / this.sizeY, q = (a.x - b.x) / 100 - r / 2; spaces = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); }
      else if (metric === 'euclidean') spaces = Math.hypot(dx, dy);
      else if (metric === 'alternating') spaces = Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
      else spaces = Math.max(dx, dy);
      return { spaces, distance: spaces * distance };
    },
    getSnappedPoint(p) { return p; }
  };
  const stageHandlers = new Map();
  const stage = { on(event, fn) { stageHandlers.set(event, fn); }, off(event) { stageHandlers.delete(event); },
    emit(event, data = {}) { stageHandlers.get(event)?.({ stopPropagation() {}, ...data }); } };
  const window = new EventTarget();
  const game = { system: { id: 'digimon-digital-adventures' }, user: { id: 'gm', isGM: true, color: '#ff6400' },
    i18n: { lang: 'en' }, settings: { get: () => false }, combat: null };
  const canvas = { ready: true, grid, dimensions: { size: 100, distance }, mousePosition: { x: 0, y: 0 }, stage,
    app: { view: { onwheel: null, oncontextmenu: null } },
    activeLayer: { activate: async () => { state.restored = true; } },
    tokens: { placeables: [] },
    templates: { activate: async () => {}, toLocal: p => p,
      preview: { addChild: o => { state.preview = o; }, removeChild: () => { state.preview = null; } },
      get: id => state.templates.find(t => t.id === id)?.object },
    scene: { grid: { distance }, createEmbeddedDocuments: async (_type, data) => {
      const docs = [];
      for (const source of data) {
        const doc = new Document(source); doc.id = String(++state.serial);
        doc.object = new CONFIG.MeasuredTemplate.objectClass(doc); await doc.object.draw();
        state.templates.push(doc); docs.push(doc);
      }
      return docs;
    } }
  };
  class Document {
    constructor(source) { Object.assign(this, structuredClone(source)); }
    updateSource(update) { Object.assign(this, structuredClone(update)); }
    toObject() { return Object.fromEntries(Object.entries(this).filter(([key]) => key !== 'object')); }
  }
  class NativeTemplate {
    constructor(document) { this.document = document; }
    static getCircleShape(radius) { return new Circle(0, 0, radius * 100); }
    static getConeShape(radius, direction, angle) {
      const points = [0, 0];
      for (let n = 0; n <= 90; n++) {
        const a = (direction - angle / 2 + angle * n / 90) * Math.PI / 180;
        points.push(Math.cos(a) * radius * 100, Math.sin(a) * radius * 100);
      }
      return new Polygon(points);
    }
    static getRayShape(length, direction, width) {
      const a = direction * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), w = width * 50, l = length * 100;
      return new Polygon([-dy * w, dx * w, dx * l - dy * w, dy * l + dx * w,
        dx * l + dy * w, dy * l - dx * w, dy * w, -dx * w]);
    }
    _computeShape() {
      const d = this.document, size = d.distance / distance;
      if (d.t === 'circle') return NativeTemplate.getCircleShape(size);
      if (d.t === 'cone') return NativeTemplate.getConeShape(size, d.direction, d.angle);
      if (d.t === 'ray') return NativeTemplate.getRayShape(size, d.direction, d.width / distance);
      const a = d.direction * Math.PI / 180, x = Math.cos(a) * size * 100, y = Math.sin(a) * size * 100;
      return new Polygon([0, 0, x, 0, x, y, 0, y]);
    }
    async draw() { this.refresh(); return this; }
    refresh() { this.shape = this._computeShape(); }
    destroy() { state.destroyed = true; }
  }
  const CONFIG = { MeasuredTemplate: { documentClass: Document, objectClass: NativeTemplate } };
  const values = { areActorsAllies: (a, b) => a.team === b.team, normalizeKey: value => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase(),
    getQualityRank: q => q.system.rank.value, EFFECT_TAGS: { poison: { type: 'damage' } },
    withDDAMovementContext: options => options };
  const context = vm.createContext({ console, structuredClone, setTimeout, clearTimeout, window, game, canvas, CONFIG,
    PIXI: { Polygon }, CONST: { GRID_SNAPPING_MODES: { CENTER: 16, TOP_LEFT_VERTEX: 1 } },
    foundry: { canvas: { placeables: { MeasuredTemplate: NativeTemplate } }, utils: { deepClone: structuredClone },
      applications: { api: { DialogV2: { wait: async options => { state.dialogs.push(options); return state.onDialog?.(options); } } } } },
    Hooks: { on: (event, fn) => state.hooks.push({ event, fn }) },
    ui: { notifications: { info() {}, warn: m => state.warnings.push(m) } } });
  const modules = new Map();
  async function load(url) {
    const key = new URL(url, root).href;
    if (modules.has(key)) return modules.get(key);
    const m = sources.has(key) ? new vm.SourceTextModule(sources.get(key), { context, identifier: key })
      : new vm.SyntheticModule([...(importNames.get(key) ?? [])], function () {
        for (const name of importNames.get(key) ?? []) this.setExport(name, values[name] ?? (() => null));
      }, { context, identifier: key });
    modules.set(key, m); return m;
  }
  const m = await load(areaPath); await m.link((path, ref) => load(new URL(path, ref.identifier))); await m.evaluate();
  const area = m.namespace; area.registerAreaAttackTerrainHooks();
  function token(id, x, y, width = 1, height = width, team = 'enemy', offsets) {
    const actor = { id, team, items: [], system: { size: 'medium', derivedStats: {
      bit: { total: 5 }, dos: { total: 5 }, cpu: { total: 3 }, ram: { total: 4 } }, miscStats: { movement: { total: 6 } } } };
    const t = { id, actor, name: id, x, y, w: width * 100, h: height * 100,
      center: { x: x + width * 50, y: y + height * 50 }, bounds: { x, y, width: width * 100, height: height * 100 } };
    t.document = { x, y, width, height, actor, async update(p) { state.movement = p; },
      getOccupiedGridSpaceOffsets() {
        if (offsets) return offsets;
        const [i0, j0, i1, j1] = grid.getOffsetRange(t.bounds), result = [];
        for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) result.push({ i, j });
        return result;
      } };
    canvas.tokens.placeables.push(t); return t;
  }
  const caster = token('caster', 0, 0, 1, 1, 'ally', hex ? [{ i: 0, j: 0 }] : undefined);
  const attack = { name: 'Area', system: { baseTags: { rangeType: 'range', functionType: 'support' }, qualityTags: [], effectTag: { enabled: true, tag: 'poison' } } };
  return { state, grid, canvas, game, CONFIG, area, token, caster, attack, stageHandlers };
}

test('all six formats use the expected model and scene-distance conversion', async () => {
  const f = await fixture({ distance: 5 });
  for (const [tag, model] of Object.entries({ blast: 'circle', burst: 'circle', cone: 'cone', line: 'ray', pass: 'ray', wave: 'ray' })) {
    const data = f.area.buildTemplateData({ attackerToken: f.caster, tag, size: 3 });
    assert.equal(data.t, model, tag); near(data.distance, 15);
    if (tag === 'wave') near(data.width, 15);
    if (tag === 'cone') assert.equal(data.angle, 90);
  }
});

test('Base/Maximum, melee restrictions, signature size and CHARGE follow the quality rules', async () => {
  const f = await fixture();
  const expected = { blast: [1, 3], burst: [1, 3], cone: [3, 8], line: [3, 9], wave: [2, 7] };
  const bounds = tag => f.area.getAreaSizeBounds({ attacker: f.caster.actor, attackItem: f.attack, tag });
  for (const [tag, pair] of Object.entries(expected)) { const b = bounds(tag); assert.deepEqual([b.base, b.maximum], pair, tag); }
  assert.equal(bounds('pass'), null);
  f.attack.system.baseTags.rangeType = 'melee';
  assert.equal(bounds('blast'), null);
  for (const tag of ['cone', 'line', 'burst', 'wave']) { const b = bounds(tag); assert.equal(b.base, b.maximum, tag); }
  assert.equal(bounds('pass').maximum, 4);
  f.attack.system.qualityTags = ['charge']; assert.equal(bounds('pass').maximum, 10);
  f.attack.system.isSignature = true; assert.equal(bounds('cone').base, 4);
});

test('BLAST placement measures grid Spaces, including diagonals and non-unit scene distances', async () => {
  const f = await fixture({ distance: 5 });
  const check = (x, y) => f.area.validateTemplatePlacement({ attackerToken: f.caster, tag: 'blast', templateData: { x, y }, attackRangeTotal: 3 }).valid;
  assert.equal(check(350, 350), true); assert.equal(check(450, 50), false);
});

for (const tag of ['cone', 'line']) test(`${tag}: mouse and wheel keep the origin on a large rectangular token's edge`, async () => {
  const f = await fixture(); const caster = f.token('large', 300, 400, 2, 1, 'ally');
  const data = f.area.buildTemplateData({ attackerToken: caster, tag, size: 3 });
  const pending = f.area.drawTemplatePreview(data, { attackerToken: caster, fixedOrigin: true, rotateOnly: true });
  await settle();
  f.canvas.app.view.onwheel({ deltaY: -1, preventDefault() {}, stopPropagation() {} });
  let d = f.state.preview.document; near(d.direction, 45); near(d.x, 450); near(d.y, 500);
  f.canvas.stage.emit('mousemove', { global: { x: 200, y: 250 } });
  d = f.state.preview.document; near(d.x, 350); near(d.y, 400);
  f.canvas.stage.emit('mousedown', { button: 0 }); await pending;
  assert.equal(f.stageHandlers.size, 0); assert.equal(f.state.restored, true);
});

test('CONE is 90 degrees and excludes targets behind and outside its flanks', async () => {
  const f = await fixture();
  const d = f.area.buildTemplateData({ attackerToken: f.caster, tag: 'cone', size: 3 });
  const doc = await f.area.createPersistentTemplate(d), s = doc.object.shape;
  assert.equal(s.contains(150, 0), true); assert.equal(s.contains(-10, 0), false);
  assert.equal(s.contains(50, 100), false); assert.equal(s.contains(301, 0), false);
});

test('BLAST catches a large Token intersected between its sampled corners and grid centers', async () => {
  const f = await fixture();
  const data = f.area.buildTemplateData({ attackerToken: f.caster, tag: 'blast', size: 1 });
  data.x = 0; data.y = 0;
  const doc = await f.area.createPersistentTemplate(data);
  const clipped = f.token('clipped', 95, -200, 2, 4);
  const missed = f.token('outside', 105, -200, 2, 4);
  const targets = f.area.filterAreaTargets({ attacker: f.caster.actor, attackerToken: f.caster,
    templateDocument: doc, tag: 'blast', targetMode: 'enemies' });
  assert.ok(targets.some(t => t.id === clipped.id)); assert.ok(!targets.some(t => t.id === missed.id));
});

test('LINE width is optional, respects size, and receives Wide Swings only in melee', async () => {
  const f = await fixture(); f.caster.actor.system.size = 'huge';
  f.caster.actor.items = [{ type: 'quality', system: { rank: { value: 2 }, attackModifier: { reachMode: 'wideSwings' } } }];
  for (const [rangeType, maximum] of [['range', 2], ['melee', 4]]) {
    f.attack.system.baseTags.rangeType = rangeType;
    await f.area.promptAreaConfiguration({ attacker: f.caster.actor, attackItem: f.attack, tag: 'line', bounds: { base: 3, maximum: 9 } });
    const dialog = f.state.dialogs.at(-1);
    assert.match(dialog.content, new RegExp(`name="areaWidth" min="1"\\s+max="${maximum}"`));
    const configuration = dialog.buttons.find(b => b.action === 'place').callback(null, { form: { elements: {
      areaSize: { value: 3 }, targetMode: { value: 'enemies' }, areaWidth: { value: 20 } } } });
    assert.equal(configuration.width, maximum);
  }
  const d = f.area.buildTemplateData({ attackerToken: f.caster, tag: 'line', size: 3 });
  assert.equal(d.width, 1, 'a wide line is a choice, not an automatic enlargement');
});

test('WAVE remains a square through all rotations', async () => {
  const f = await fixture({ distance: 5 });
  const d = f.area.buildTemplateData({ attackerToken: f.caster, tag: 'wave', size: 2 });
  const pending = f.area.drawTemplatePreview(d, { attackerToken: f.caster }); await settle();
  for (let n = 0; n < 8; n++) {
    const s = f.state.preview.shape, p = s.points;
    for (let i = 0; i < 8; i += 2) near(Math.hypot(p[i] - p[(i + 2) % 8], p[i + 1] - p[(i + 3) % 8]), 200);
    f.canvas.app.view.onwheel({ deltaY: -1, preventDefault() {}, stopPropagation() {} });
  }
  f.canvas.stage.emit('mousedown', { button: 0 }); await pending;
});

test('WAVE Base Size is a smaller square, not a radial band through the full-width wave', async () => {
  const f = await fixture(); const d = f.area.buildTemplateData({ attackerToken: f.caster, tag: 'wave', size: 4 });
  const nearCenter = f.token('near', d.x + 30, d.y + 20, 0.1);
  const wideFlank = f.token('flank', d.x + 30, d.y + 160, 0.1);
  assert.equal(f.area.tokenIsInsideBaseArea(nearCenter, d, { base: 2 }, f.caster), true);
  assert.equal(f.area.tokenIsInsideBaseArea(wideFlank, d, { base: 2 }, f.caster), false);
});

test('PASS starts at the caster, draws its swept width, and moves exactly its declared distance', async () => {
  const f = await fixture(); const caster = f.token('passer', 300, 400, 2, 1, 'ally');
  const data = f.area.buildTemplateData({ attackerToken: caster, tag: 'pass', size: 4 });
  const pending = f.area.drawTemplatePreview(data, { attackerToken: caster, fixedOrigin: true, rotateOnly: true }); await settle();
  near(f.state.preview.document.x, caster.center.x); near(f.state.preview.document.y, caster.center.y);
  f.canvas.app.view.onwheel({ deltaY: -1, preventDefault() {}, stopPropagation() {} });
  f.canvas.app.view.onwheel({ deltaY: -1, preventDefault() {}, stopPropagation() {} });
  near(f.state.preview.document.width, 2);
  f.canvas.stage.emit('mousedown', { button: 0 });
  const placed = await pending; await f.area.movePassAttackerToTemplateEnd(caster, placed);
  near(f.state.movement.x, 300); near(f.state.movement.y, 800);
});

for (const metric of ['equidistant', 'alternating', 'euclidean']) {
  for (const [width, height] of [[1, 1], [2, 2], [3, 1]]) {
    test(`BURST rendering and targeting agree for ${metric}, ${width}x${height} caster`, async () => {
      const f = await fixture({ metric }); const caster = f.token('burst-caster', 300, 400, width, height, 'ally');
      const data = f.area.buildTemplateData({ attackerToken: caster, tag: 'burst', size: 2 });
      const doc = await f.area.createPersistentTemplate(data);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
        const point = f.grid.getCenterPoint({ i, j });
        const target = f.token(`target-${i}-${j}`, j * 100, i * 100);
        const actual = doc.object.shape.contains(point.x - doc.x, point.y - doc.y);
        const filtered = f.area.filterAreaTargets({ attacker: caster.actor, attackerToken: caster, templateDocument: doc,
          tag: 'burst', targetMode: 'enemies' }).some(t => t.id === target.id);
        assert.equal(actual, filtered, `cell ${i},${j}`);
      }
      assert.ok(!f.area.filterAreaTargets({ attacker: caster.actor, attackerToken: caster, templateDocument: doc,
        tag: 'burst', targetMode: 'all' }).some(t => t.id === caster.id), 'BURST never includes its caster');
    });
  }
}

test('BURST on hex grids covers exactly its six neighboring Spaces', async () => {
  const f = await fixture({ hex: true });
  const doc = await f.area.createPersistentTemplate(f.area.buildTemplateData({ attackerToken: f.caster, tag: 'burst', size: 1 }));
  let neighbors = 0;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const center = f.grid.getCenterPoint({ i, j });
    const inside = doc.object.shape.contains(center.x - doc.x, center.y - doc.y);
    const expected = Math.max(Math.abs(i), Math.abs(j), Math.abs(i + j)) <= 1;
    assert.equal(inside, expected, `hex ${i},${j}`);
    if (expected) for (const v of f.grid.getVertices({ i, j })) {
      assert.ok(doc.object.shape.contains(center.x + (v.x - center.x) * 0.99 - doc.x,
        center.y + (v.y - center.y) * 0.99 - doc.y), `full hex ${i},${j}`);
    }
    if (inside && (i || j)) neighbors++;
  }
  assert.equal(neighbors, 6);
});

test('BURST without a grid follows the whole caster footprint and preserves its logical radius', async () => {
  const f = await fixture({ gridless: true, distance: 5 });
  const caster = f.token('large', 300, 400, 3, 1, 'ally');
  const data = f.area.buildTemplateData({ attackerToken: caster, tag: 'burst', size: 2 });
  near(data.distance, 10);
  const doc = await f.area.createPersistentTemplate(data);
  const inside = f.token('inside', 725, 425, 0.5);
  const outside = f.token('outside', 775, 425, 0.5);
  const side = f.token('side', 425, 625, 0.5);
  const targets = f.area.filterAreaTargets({ attacker: caster.actor, attackerToken: caster,
    templateDocument: doc, tag: 'burst', targetMode: 'enemies' });
  assert.deepEqual(Array.from(targets, t => t.id).sort(), ['inside', 'side']);
  for (const [token, expected] of [[inside, true], [outside, false], [side, true]]) {
    assert.equal(doc.object.shape.contains(token.center.x - doc.x, token.center.y - doc.y), expected);
  }
});

test('custom BURST rendering leaves ordinary native templates and repeated registration intact', async () => {
  const f = await fixture(); const original = f.CONFIG.MeasuredTemplate.objectClass;
  f.area.registerAreaAttackTerrainHooks(); assert.equal(f.CONFIG.MeasuredTemplate.objectClass, original);
  const doc = await f.area.createPersistentTemplate({ t: 'circle', x: 0, y: 0, distance: 2, flags: {} });
  assert.equal(doc.object.shape.contains(190, 0), true); assert.equal(doc.object.shape.contains(210, 0), false);
});

test('persistent BURST terrain retains its original footprint after the caster moves', async () => {
  const f = await fixture(); const caster = f.token('large', 300, 400, 2, 2, 'ally');
  const data = f.area.buildTemplateData({ attackerToken: caster, tag: 'burst', size: 2 });
  near(data.distance, 2);
  const doc = await f.area.createPersistentTemplate(data), before = [...doc.object.shape.points];
  caster.x += 1000; caster.center.x += 1000; caster.bounds.x += 1000; caster.document.x += 1000;
  doc.object.refresh(); assert.deepEqual([...doc.object.shape.points], before);
});

test('right-click cancels preview and restores controls without confirming the attack', async () => {
  const f = await fixture(); const original = () => {};
  f.canvas.app.view.onwheel = original;
  const d = f.area.buildTemplateData({ attackerToken: f.caster, tag: 'cone', size: 3 });
  const pending = f.area.drawTemplatePreview(d, { attackerToken: f.caster, fixedOrigin: true }); await settle();
  f.canvas.stage.emit('mousedown', { button: 2 }); f.canvas.stage.emit('rightdown');
  assert.equal(await pending, null); assert.equal(f.canvas.app.view.onwheel, original);
  assert.equal(f.state.preview, null); assert.equal(f.stageHandlers.size, 0);
});
