export const ACADEMY_NAMESPACE = "digimon-digital-adventures";
export const ACADEMY_ROOT = `systems/${ACADEMY_NAMESPACE}`;
export const HINA_ATLAS = `${ACADEMY_ROOT}/assets/tutorial/hina-atlas.png`;

// Identical source and display rectangles for every mood. Only the first outfit is used.
export const HINA_FRAME = Object.freeze({ width: 248, height: 496, y: 7, atlasWidth: 2048, atlasHeight: 1514 });
export const HINA_POSES = Object.freeze({
  calm: 7, surprised: 262, thinking: 517, happy: 772,
  explaining: 1027, encouraging: 1283, serious: 1538, determined: 1793
});

export const localizeAcademy = key => game.i18n.localize(key);
export const escapeAcademyHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

export function hinaPortrait(mood = "explaining") {
  if (!Object.hasOwn(HINA_POSES, mood)) mood = "explaining";
  const x = HINA_POSES[mood];
  const positionX = 100 * x / (HINA_FRAME.atlasWidth - HINA_FRAME.width);
  const positionY = 100 * HINA_FRAME.y / (HINA_FRAME.atlasHeight - HINA_FRAME.height);
  return `<span class="dda-academy-portrait" data-hina-mood="${escapeAcademyHTML(mood)}" aria-hidden="true"
    style="--hina-x:${positionX}%;--hina-y:${positionY}%"></span>`;
}

export function academyProse(value) {
  return String(value ?? "").split(/\n\s*\n/).filter(Boolean)
    .map(paragraph => `<p>${escapeAcademyHTML(paragraph).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</p>`).join("");
}

export function academySettingsView(keys = []) {
  return keys.map(key => {
    const entry = game.settings.settings.get(`${ACADEMY_NAMESPACE}.${key}`);
    if (!entry || !entry.config) return null;
    const value = game.settings.get(ACADEMY_NAMESPACE, key);
    const label = localizeAcademy(entry.name);
    const display = typeof value === "boolean"
      ? localizeAcademy(value ? "DDA.Academy.Enabled" : "DDA.Academy.Disabled")
      : entry.choices?.[value] ? localizeAcademy(entry.choices[value]) : String(value ?? "—");
    return { key, label, value: display };
  }).filter(Boolean);
}

export function academyDialogue(step, { hint = "", practiceAvailable = false } = {}) {
  const settings = academySettingsView(step.settingKeys);
  return `<div class="dda-academy-dialogue" data-academy-step="${escapeAcademyHTML(step.id)}">
    ${hinaPortrait(step.mood)}<div class="dda-academy-speech">
      <span class="dda-academy-speaker">${escapeAcademyHTML(localizeAcademy("DDA.Academy.Hina"))}</span>
      ${step.experimental ? `<p class="dda-academy-development"><i class="fas fa-flask" aria-hidden="true"></i> ${escapeAcademyHTML(localizeAcademy("DDA.Academy.InDevelopment"))}</p>` : ""}
      ${academyProse(localizeAcademy(step.textKey))}
      ${settings.length ? `<dl class="dda-academy-settings">${settings.map(setting => `<div><dt>${escapeAcademyHTML(setting.label)}</dt><dd>${escapeAcademyHTML(setting.value)}</dd></div>`).join("")}</dl>` : ""}
      ${hint ? `<p class="dda-academy-context-hint">${escapeAcademyHTML(hint)}</p>` : ""}
      ${practiceAvailable ? `<button type="button" class="dda-academy-practice-trigger">${escapeAcademyHTML(localizeAcademy("DDA.Academy.Practice.Start"))}</button>` : ""}
      ${step.reference ? `<small class="dda-academy-reference">${escapeAcademyHTML(step.reference)}</small>` : ""}
    </div></div>`.replace(/\n\s*/g, ""); // Native Tours split content at newlines before rendering.
}

export const isAcademyDigimon = actor => ["digimon", "npc"].includes(actor?.type) && actor.system?.isDigimon !== false;
export const canUseAcademyActor = actor => Boolean(actor && (game.user?.isGM || actor.isOwner));

export function resolveAcademyActors(selection = {}) {
  const actors = game.actors?.contents ?? Array.from(game.actors?.values?.() ?? []);
  const owned = actors.filter(canUseAcademyActor);
  const find = uuid => owned.find(actor => actor.uuid === uuid);
  const explicitTamer = Object.hasOwn(selection, "tamerUuid");
  const explicitDigimon = Object.hasOwn(selection, "digimonUuid");
  const selected = selection.actor ?? (explicitTamer || explicitDigimon ? null :
    globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character);
  let tamer = explicitTamer ? find(selection.tamerUuid) : selected?.type === "character" && canUseAcademyActor(selected) ? selected : null;
  let digimon = explicitDigimon ? find(selection.digimonUuid) : isAcademyDigimon(selected) && canUseAcademyActor(selected) ? selected : null;
  if (tamer?.type !== "character") tamer = null;
  if (!isAcademyDigimon(digimon)) digimon = null;
  if (!tamer && digimon && !explicitTamer) tamer = find(digimon.system?.tamer?.uuid);
  if (!digimon && tamer && !explicitDigimon) digimon = find(tamer.system?.partner?.uuid);
  if (!selected && !explicitTamer && !explicitDigimon) {
    tamer ??= owned.find(actor => actor.type === "character");
    digimon ??= find(tamer?.system?.partner?.uuid) ?? owned.find(isAcademyDigimon);
  }
  return { tamer: tamer?.type === "character" ? tamer : null, digimon: isAcademyDigimon(digimon) ? digimon : null };
}
