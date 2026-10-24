/**
 * DDA condition visuals — Foundry VTT 13 / PIXI 7.
 * Presentation only: never updates Actors, Tokens, Actions, vision or targeting.
 * Load this file once through system.json -> esmodules.
 */
const SYSTEM_ID = "digimon-digital-adventures";
const SETTING = "conditionVisuals";
const RUNTIME_KEY = "__ddaConditionVisualsV1";
const LAYER_NAME = "dda-condition-visuals";
const TYPES = new Set(["character", "digimon", "npc"]);

export const CONDITION_FRAGMENT = `
#ifdef GL_ES
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#endif
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputSize;
uniform vec4 inputClamp;
uniform vec4 outputFrame;
uniform float uTime;
uniform float uSeed;
uniform float uFog;
uniform float uBlind;
uniform float uWater;
uniform float uFear;
uniform float uTaunt;
uniform float uDoom;

float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                        dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), w.x),
             mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0)), w.x), w.y);
}
float mist(vec2 p) {
  return noise(p) * 0.57 + noise(p * 2.03 + 4.2) * 0.29
       + noise(p * 4.11 + 9.8) * 0.14;
}
float caustics(vec2 p, float t) {
  vec2 cell = floor(p), f = fract(p);
  float first = 9.0, second = 9.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 h = hash2(cell + neighbor + uSeed);
      vec2 point = 0.5 + 0.34 * sin(t * 0.48 + 6.283185 * h);
      vec2 d = neighbor + point - f;
      float distanceSquared = dot(d, d);
      if (distanceSquared < first) {
        second = first;
        first = distanceSquared;
      } else {
        second = min(second, distanceSquared);
      }
    }
  }
  float edge = sqrt(second) - sqrt(first);
  return 1.0 - smoothstep(0.018, 0.12, edge);
}
void main() {
  vec4 base = texture2D(uSampler, vTextureCoord);
  if (base.a < 0.001) {
    gl_FragColor = base;
    return;
  }
  vec2 uv = vTextureCoord * inputSize.xy / max(outputFrame.zw, vec2(1.0));
  float aspect = outputFrame.z / max(outputFrame.w, 1.0);
  vec2 p = uv * vec2(aspect, 1.0);
  float t = uTime + uSeed;
  vec3 color = base.rgb / base.a;
  float alpha = base.a;
  float edge = smoothstep(0.18, 0.70, length(uv - 0.5));

  if (uWater > 0.0) {
    vec2 ripple = vec2(sin(p.y * 19.0 + t * 0.95),
                       cos(p.x * 17.0 - t * 0.80));
    vec2 sampleUV = clamp(vTextureCoord + ripple * inputSize.zw * 2.0,
                          inputClamp.xy, inputClamp.zw);
    vec4 refracted = texture2D(uSampler, sampleUV);
    vec3 refractedColor = refracted.a > 0.01 ? refracted.rgb / refracted.a : color;
    color = mix(color, refractedColor, 0.55);
    color = mix(color, color * vec3(0.47, 0.78, 1.03) + vec3(0.01, 0.06, 0.11), 0.64);
    vec2 waterUV = p * 5.3;
    waterUV += vec2(sin(p.y * 7.2 + t * 0.35),
                    cos(p.x * 6.1 - t * 0.30)) * 0.32;
    color += caustics(waterUV, t) * vec3(0.14, 0.31, 0.37);
  }
  if (uFog > 0.0) {
    float fog = mist(p * 4.2 + vec2(t * 0.12, -t * 0.075));
    float wisps = smoothstep(0.23, 0.77, fog);
    color = mix(color, vec3(0.055, 0.065, 0.095), uFog * (0.20 + 0.47 * wisps));
  }
  if (uBlind > 0.0) {
    float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(gray), vec3(0.96, 0.97, 1.0), 0.43);
    alpha *= 0.90;
  }
  if (uFear > 0.0) {
    float pulse = 0.70 + 0.15 * sin(t * 1.8);
    color = mix(color, vec3(0.40, 0.19, 0.67), edge * pulse * 0.48);
  }
  if (uTaunt > 0.0) {
    color = mix(color, vec3(0.96, 0.22, 0.10), edge * (0.14 + 0.045 * sin(t * 2.0)));
  }
  if (uDoom > 0.0) {
    color *= 1.0 - edge * (0.30 + 0.04 * sin(t * 1.1));
    color = mix(color, vec3(0.57, 0.36, 0.15), edge * 0.11);
  }
  gl_FragColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
}
`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (pt, en) => String(globalThis.game?.i18n?.lang ?? "en").toLowerCase().startsWith("pt") ? pt : en;
const tagOf = effect => String(effect?.tag ?? "").trim().replace(/^\[|\]$/g, "").trim().toLowerCase();

function active(effect) {
  if (!effect || effect.disabled === true || effect.active === false) return false;
  const remaining = effect.remaining ?? effect.duration;
  return remaining === undefined || remaining === null || remaining === ""
    || !Number.isFinite(Number(remaining)) || Number(remaining) > 0;
}

export function readConditionVisualState(actor) {
  const status = actor?.system?.status ?? {};
  const effects = (Array.isArray(actor?.system?.effects?.active) ? actor.system.effects.active : []).filter(active);
  const has = tag => effects.some(effect => tagOf(effect) === tag);
  const doomEffects = effects.filter(effect => tagOf(effect) === "doom");
  const cover = status.cover === "major" ? 2 : status.cover === "partial" ? 1 : 0;
  return {
    obscured: status.sight === "obscured",
    cover,
    blinded: status.sight === "blinded" || has("blind"),
    submerged: status.submerged === true,
    fear: has("fear"),
    taunt: has("taunt"),
    doom: doomEffects.length > 0,
    doomValue: doomEffects.length ? Math.max(0, ...doomEffects.map(effect =>
      Math.floor(numeric(effect.value ?? effect.potency)))) : 0
  };
}

export function conditionBadges(state) {
  return [
    state.blinded && { key: "blind", color: 0xe9efff },
    state.submerged && { key: "water", color: 0x67ddff },
    state.obscured && { key: "fog", color: 0xb4b8cd },
    state.cover && { key: "cover", color: 0xc6d3e6 },
    state.fear && { key: "fear", color: 0xc4a0ff },
    state.taunt && { key: "taunt", color: 0xff7968 },
    state.doom && { key: "doom", color: 0xffd27f, value: state.doomValue }
  ].filter(Boolean);
}

function drawSymbol(g, key, color) {
  g.lineStyle(1.8, color, 1);
  if (key === "blind") {
    g.moveTo(-7, 0).quadraticCurveTo(0, -8, 7, 0).quadraticCurveTo(0, 8, -7, 0);
    g.drawCircle(0, 0, 2.2);
    g.lineStyle(2.6, 0x101925, 1).moveTo(-7, 7).lineTo(7, -7);
    g.lineStyle(1.8, color, 1).moveTo(-7, 6).lineTo(7, -6);
  } else if (key === "water") {
    g.moveTo(0, -8).bezierCurveTo(-3, -3, -7, 1, -5, 5)
      .bezierCurveTo(-3, 10, 5, 8, 5, 3).quadraticCurveTo(4, -1, 0, -8);
    g.moveTo(-3, 11).quadraticCurveTo(0, 8, 3, 11);
  } else if (key === "fog") {
    g.moveTo(-7, -5).quadraticCurveTo(-3, -8, 0, -5).quadraticCurveTo(3, -2, 7, -5);
    g.moveTo(-7, 0).quadraticCurveTo(-3, -3, 0, 0).quadraticCurveTo(3, 3, 7, 0);
    g.moveTo(-7, 5).quadraticCurveTo(-3, 2, 0, 5).quadraticCurveTo(3, 8, 7, 5);
  } else if (key === "cover") {
    g.moveTo(-6, -6).lineTo(6, -6).lineTo(6, 0).quadraticCurveTo(6, 5, 0, 8)
      .quadraticCurveTo(-6, 5, -6, 0).closePath();
    g.moveTo(-4, -3).lineTo(4, -3);
  } else if (key === "fear") {
    g.drawEllipse(0, 0, 6, 7);
    g.moveTo(-4, -4).lineTo(-1, -5).moveTo(1, -5).lineTo(4, -4);
    g.beginFill(color, 1).drawCircle(-2.4, -1.5, 0.9).drawCircle(2.4, -1.5, 0.9).endFill();
    g.drawEllipse(0, 3, 1.6, 2.2);
  } else if (key === "taunt") {
    g.drawCircle(0, 0, 4.8);
    g.moveTo(-8, 0).lineTo(-2, 0).moveTo(2, 0).lineTo(8, 0);
    g.moveTo(0, -8).lineTo(0, -2).moveTo(0, 2).lineTo(0, 8);
  } else if (key === "doom") {
    g.moveTo(-5, -7).lineTo(5, -7).moveTo(-5, 7).lineTo(5, 7);
    g.moveTo(-4, -7).quadraticCurveTo(-4, -2, 0, 0).quadraticCurveTo(4, 2, 4, 7);
    g.moveTo(4, -7).quadraticCurveTo(4, -2, 0, 0).quadraticCurveTo(-4, 2, -4, 7);
  }
}

function makeBadge(PIXI, definition, size) {
  const badge = new PIXI.Container();
  badge.eventMode = "none";
  badge.interactiveChildren = false;
  badge.scale.set(size / 24);
  const g = new PIXI.Graphics();
  g.beginFill(0x101925, 0.91).lineStyle(1, definition.color, 0.95)
    .drawRoundedRect(-12, -12, 24, 24, 6).endFill();
  drawSymbol(g, definition.key, definition.color);
  badge.addChild(g);
  if (definition.key === "doom") {
    const label = new PIXI.Text(definition.value > 99 ? "99+" : String(definition.value), {
      fontFamily: "Arial, sans-serif", fontSize: 11, fontWeight: "bold",
      fill: 0xffe0a0, stroke: 0x101925, strokeThickness: 3
    });
    label.anchor.set(1, 1);
    label.position.set(12, 14);
    label.eventMode = "none";
    badge.addChild(label);
  }
  return badge;
}

function mode() {
  try {
    return game.settings.get(SYSTEM_ID, SETTING) ?? "animated";
  } catch (_error) {
    return "animated";
  }
}

function seedFor(token) {
  let value = 2166136261;
  for (const char of String(token.document?.uuid ?? token.id ?? "")) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  }
  return (value >>> 0) % 997 / 37;
}

function tokenVisible(token) {
  return token && !token.destroyed && token.visible !== false && token.isVisible !== false
    && (game.user?.isGM || token.document?.hidden !== true);
}

function applyUniforms(filter, state, seed, time) {
  Object.assign(filter.uniforms, {
    uTime: time, uSeed: seed,
    uFog: Math.max(state.obscured ? 0.82 : 0, state.cover === 2 ? 0.67 : state.cover ? 0.43 : 0),
    uBlind: state.blinded ? 1 : 0, uWater: state.submerged ? 1 : 0,
    uFear: state.fear ? 1 : 0, uTaunt: state.taunt ? 1 : 0, uDoom: state.doom ? 1 : 0
  });
}

export function registerConditionVisuals() {
  if (globalThis[RUNTIME_KEY]) return globalThis[RUNTIME_KEY];
  const entries = new Map();
  const pending = new Set();
  let pendingFrame = null;
  let ticker = null;
  let stopped = false;
  let filterWarningShown = false;
  const motionQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000 % 4096;
  const canAnimate = () => !motionQuery?.matches && mode() === "animated";

  function detach(entry) {
    if (entry.mesh && !entry.mesh.destroyed) {
      entry.mesh.filters = (entry.mesh.filters ?? []).filter(filter => filter !== entry.filter);
    }
    entry.filter?.destroy?.();
    entry.filter = null;
    entry.mesh = null;
  }

  function clear(token) {
    const entry = entries.get(token);
    if (!entry) return;
    detach(entry);
    entry.layer?.destroy?.({ children: true });
    entries.delete(token);
  }

  function animate() {
    const time = now();
    let running = false;
    for (const [token, entry] of entries) {
      if (!tokenVisible(token)) {
        clear(token);
        continue;
      }
      if (entry.filter?.uniforms) {
        entry.filter.uniforms.uTime = time;
        running = true;
      }
    }
    if (!running || !canAnimate()) stopTicker();
  }

  function stopTicker() {
    ticker?.remove?.(animate);
    ticker = null;
  }

  function syncTicker() {
    const nextTicker = canAnimate() && [...entries.values()].some(entry => entry.filter)
      ? globalThis.canvas?.app?.ticker : null;
    if (nextTicker === ticker) return;
    stopTicker();
    if (nextTicker?.add) {
      ticker = nextTicker;
      ticker.add(animate);
    }
  }

  function refreshToken(token) {
    if (stopped || !globalThis.canvas?.ready) return;
    const selectedMode = mode();
    const state = readConditionVisualState(token?.actor);
    const badges = conditionBadges(state);
    if (!TYPES.has(token?.actor?.type) || !tokenVisible(token) || selectedMode === "off" || !badges.length) {
      clear(token);
      syncTicker();
      return;
    }
    const width = Math.max(1, numeric(token.w, 100));
    const height = Math.max(1, numeric(token.h, 100));
    const signature = JSON.stringify([state, width, height, selectedMode]);
    let entry = entries.get(token);
    if (!entry) {
      entry = { signature: "", layer: null, filter: null, mesh: null, seed: seedFor(token) };
      entries.set(token, entry);
    }
    const rebuild = entry.signature !== signature || !entry.layer || entry.layer.destroyed;
    if (rebuild) {
      entry.layer?.destroy?.({ children: true });
      const layer = new PIXI.Container();
      layer.name = LAYER_NAME;
      layer.eventMode = "none";
      layer.interactiveChildren = false;
      layer.zIndex = 10020;
      const size = Math.max(8, Math.min(24, Math.min(width, height) / 5));
      const gap = size * 0.1;
      const margin = size * 0.15;
      badges.forEach((definition, index) => {
        const badge = makeBadge(PIXI, definition, size);
        badge.position.set(width - margin - size / 2 - (index % 2) * (size + gap),
          margin + size / 2 + Math.floor(index / 2) * (size + gap));
        layer.addChild(badge);
      });
      token.sortableChildren = true;
      token.addChild(layer);
      token.sortChildren?.();
      entry.layer = layer;
      entry.signature = signature;
    }

    const mesh = token.mesh;
    if (selectedMode === "icons" || entry.mesh !== mesh || entry.filter?.destroyed
      || (entry.filter && !entry.filter.uniforms)) detach(entry);
    if (selectedMode !== "icons" && mesh && !mesh.destroyed && !entry.filter) {
      try {
        entry.filter = new PIXI.Filter(undefined, CONDITION_FRAGMENT, {
          uTime: 0, uSeed: entry.seed, uFog: 0, uBlind: 0, uWater: 0, uFear: 0, uTaunt: 0, uDoom: 0
        });
        entry.filter.padding = 0;
        entry.mesh = mesh;
      } catch (error) {
        if (!filterWarningShown) {
          console.warn("DDA | Condition shader unavailable; showing condition icons.", error);
          filterWarningShown = true;
        }
      }
    }
    if (entry.filter) {
      if (!(mesh.filters ?? []).includes(entry.filter)) mesh.filters = [...(mesh.filters ?? []), entry.filter];
      applyUniforms(entry.filter, state, entry.seed, canAnimate() ? now() : 0);
    }
    syncTicker();
  }

  function flush() {
    pendingFrame = null;
    const tokens = [...pending];
    pending.clear();
    for (const token of tokens) refreshToken(token);
  }

  function queue(token) {
    if (stopped || !token) return;
    pending.add(token);
    if (pendingFrame === null) pendingFrame = requestAnimationFrame(flush);
  }

  function refreshAll() {
    for (const token of globalThis.canvas?.tokens?.placeables ?? []) queue(token);
  }

  function clearAll() {
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
    pending.clear();
    stopTicker();
    for (const token of [...entries.keys()]) clear(token);
  }

  const bindings = [];
  const on = (event, callback) => { bindings.push([event, Hooks.on(event, callback)]); };
  on("drawToken", queue);
  on("refreshToken", queue);
  on("updateToken", document => queue(document?.object));
  on("updateActor", refreshAll);
  on("deleteToken", document => {
    const tokens = new Set([...entries.keys(), ...pending]);
    for (const token of tokens) {
      if (token.document !== document && token !== document?.object) continue;
      pending.delete(token);
      clear(token);
    }
    syncTicker();
  });
  on("canvasTearDown", clearAll);
  on("canvasReady", refreshAll);
  motionQuery?.addEventListener?.("change", refreshAll);

  const api = {
    refreshAll,
    refreshToken: queue,
    getState: readConditionVisualState,
    get activeTokenCount() { return entries.size; },
    stop() {
      stopped = true;
      clearAll();
      for (const [event, id] of bindings) Hooks.off(event, id);
      motionQuery?.removeEventListener?.("change", refreshAll);
      delete globalThis[RUNTIME_KEY];
      if (game.dda?.conditionVisuals === api) delete game.dda.conditionVisuals;
    }
  };
  globalThis[RUNTIME_KEY] = api;
  game.dda ??= {};
  game.dda.conditionVisuals = api;
  refreshAll();
  return api;
}

Hooks.once("init", () => {
  game.settings.register(SYSTEM_ID, SETTING, {
    name: text("DDA — visuais de condições", "DDA — condition visuals"),
    hint: text("Como as condições aparecem nos tokens deste dispositivo.", "How conditions appear on tokens on this device."),
    scope: "client", config: true, type: String,
    choices: {
      animated: text("Efeitos animados e ícones", "Animated effects and icons"),
      static: text("Efeitos estáticos e ícones", "Static effects and icons"),
      icons: text("Somente ícones", "Icons only"),
      off: text("Desativado", "Off")
    },
    default: "animated",
    onChange: () => game.dda?.conditionVisuals?.refreshAll()
  });
});

Hooks.once("ready", registerConditionVisuals);
