const SYSTEM_ID = "digimon-digital-adventures";
const SUPPORTED_ACTOR_TYPES = new Set(["character", "digimon", "npc"]);
const RADIAL_BUTTON_COUNT = 12;
const SUBMENU_PAGE_SIZE = 7;
const SUBMENU_RING_STEP = 54;
const SPRITE_ICON_BASE = `systems/${SYSTEM_ID}/assets/ui/Sprites-1bit`;
const CORE_ICON_FALLBACK = `${SPRITE_ICON_BASE}/Software_Warning_Sign_Circle_Question_Mark_Help.webp`;

const HUD_ICONS = Object.freeze({
  stats: `${SPRITE_ICON_BASE}/Software_Statistics_Stats_Graphs_Bars.webp`,
  actions: `${SPRITE_ICON_BASE}/RPG_Crossed_Swords_Shield_Combat_Battle_War.webp`,
  attack: `${SPRITE_ICON_BASE}/RPG_Item_Weapon_Sword_Attack_Melee_Slashing_Damage.webp`,
  target: `${SPRITE_ICON_BASE}/RPG_Stat_Accuracy_Ranged_Target.webp`,
  movement: `${SPRITE_ICON_BASE}/RPG_Skill_Dash_Dodge_Movement_Speed_Run_Sprint.webp`,
  endTurn: `${SPRITE_ICON_BASE}/Arrows_Media_Controls_Next.webp`,
  visibility: `${SPRITE_ICON_BASE}/Media_Eyeball_Vision_Shown.webp`,
  hidden: `${SPRITE_ICON_BASE}/Media_Eyeball_Vision_Hidden_Disabled_Off.webp`,
  elevation: `${SPRITE_ICON_BASE}/Arrows_Double_Vertical_Up_Down.webp`,
  config: `${SPRITE_ICON_BASE}/Software_Options_Settings_Cogwheel_Gear_Mechanics.webp`,
  effects: `${SPRITE_ICON_BASE}/RPG_Magic_Sparkles_Enchantment.webp`,
  combat: `${SPRITE_ICON_BASE}/RPG_Crossed_Swords_Duel_PvP_Combat_Battle_War.webp`,
  qualities: `${SPRITE_ICON_BASE}/Tools_Crafting_Books_Manual_Codex_Instructions_Tutorial_Documentation.webp`,
  talents: `${SPRITE_ICON_BASE}/Boardgames_Card_Star.webp`,
  previous: `${SPRITE_ICON_BASE}/Arrows_Media_Controls_Left_Previous.webp`,
  next: `${SPRITE_ICON_BASE}/Arrows_Media_Controls_Right_Next.webp`,
  d20: `${SPRITE_ICON_BASE}/Boardgames_Dice_Icosahedron_D20_Twenty_Clean.webp`,
  accuracy: `${SPRITE_ICON_BASE}/RPG_Stat_Accuracy_Ranged_Target_Arrow.webp`,
  damage: `${SPRITE_ICON_BASE}/RPG_Stat_Strength_Fist_Melee_Attack.webp`,
  dodge: `${SPRITE_ICON_BASE}/RPG_Skill_Dash_Dodge_Movement_Speed_Run_Sprint.webp`,
  armor: `${SPRITE_ICON_BASE}/RPG_Item_Stat_Shield_Defense_Armor.webp`,
  health: `${SPRITE_ICON_BASE}/RPG_Stat_HP_Health_Heart.webp`,
  difficultMove: `${SPRITE_ICON_BASE}/Travel_Hiking_Mountain_Walk_Hike.webp`,
  reposition: `${SPRITE_ICON_BASE}/Arrows_Movement_Cursor_Drag_Orthogonal.webp`,
  holdBack: `${SPRITE_ICON_BASE}/Boardgames_Card_Defense_Shield.webp`,
  clash: `${SPRITE_ICON_BASE}/RPG_Crossed_Swords_Duel_PvP_Combat_Battle_War.webp`,
  calledShot: `${SPRITE_ICON_BASE}/Warfare_Crosshair_Marked_Sniper_Headshot_Accuracy_1.webp`,
  coordinatedAssault: `${SPRITE_ICON_BASE}/RPG_Crossed_Swords_Shield_Combat_Battle_War.webp`,
  resist: `${SPRITE_ICON_BASE}/RPG_Difficulty_3_Medium_Buckler_Targe_Shield.webp`,
  guard: `${SPRITE_ICON_BASE}/Boardgames_Card_Defense_Shield.webp`,
  reinforce: `${SPRITE_ICON_BASE}/RPG_Crossed_Swords_Shield_Combat_Battle_War.webp`,
  direct: `${SPRITE_ICON_BASE}/RPG_Stat_Accuracy_Ranged_Target.webp`,
  bolster: `${SPRITE_ICON_BASE}/Software_Statistics_Stats_Graphs_Growth.webp`,
  aid: `${SPRITE_ICON_BASE}/Misc_Medkit_Medicine_Health_Pickup.webp`,
  teamwork: `${SPRITE_ICON_BASE}/Travel_Person_People_Two.webp`,
  stance: `${SPRITE_ICON_BASE}/RPG_Combat_Types_Sword_Arrow_Staff_Melee_Ranged_Magic.webp`,
  hold: `${SPRITE_ICON_BASE}/Software_Clock_Time_Wait_Chronometer_Timer_Countdown.webp`,
  holdBreath: `${SPRITE_ICON_BASE}/Misc_Organ_Lungs_Breathing_Breath.webp`,
  evolution: `${SPRITE_ICON_BASE}/Alchemy_Creation.webp`,
  breakClash: `${SPRITE_ICON_BASE}/RPG_Item_Stat_Broken_Shield_Armor_Penetration.webp`,
  finishMovement: `${SPRITE_ICON_BASE}/Arrows_Media_Controls_Stop.webp`,
  resetMovement: `${SPRITE_ICON_BASE}/Arrows_Go_Back_Return_Previous.webp`,
  special: `${SPRITE_ICON_BASE}/RPG_Magic_Sparkles_Enchantment.webp`,
  summon: `${SPRITE_ICON_BASE}/RPG_Spell_Magic_Circle_Ritual_Pentagram.webp`,
  command: `${SPRITE_ICON_BASE}/Software_Terminal_Window_CMD_Command_Line_Development_Code_Programming.webp`,
  omni: `${SPRITE_ICON_BASE}/RPG_Magic_Crystal_Ball_Clairvoyance_Omnipotence.webp`,
  fastball: `${SPRITE_ICON_BASE}/Sports_Baseball.webp`,
  giant: `${SPRITE_ICON_BASE}/RPG_Creature_Archetypes_Giant_Ogre_Troll_Cyclops_Monster.webp`,
  distantForce: `${SPRITE_ICON_BASE}/RPG_Spell_Skill_Magic_Arcane_Missiles_Multishot.webp`,
  defendRealization: `${SPRITE_ICON_BASE}/Boardgames_Card_Defense_Shield.webp`,
  gainForce: `${SPRITE_ICON_BASE}/RPG_Magic_Mana_Hearth_Stone.webp`,
  busyHands: `${SPRITE_ICON_BASE}/Boardgames_Card_Draw_Hand.webp`,
  winner: `${SPRITE_ICON_BASE}/Boardgames_Card_Star.webp`,
  effectPositive: `${SPRITE_ICON_BASE}/Alchemy_Potion_Vial_Bottle_Heart_Health_Life_Full.webp`,
  effectNegative: `${SPRITE_ICON_BASE}/RPG_Spell_Curse_Pentagram_Dark_Magic_Ritual_Sacrifice.webp`,
  effectDamage: `${SPRITE_ICON_BASE}/RPG_Spell_Skill_Magic_Explosive_Explosion.webp`,
  effectUnique: `${SPRITE_ICON_BASE}/RPG_Spell_Magic_Circle_Ritual_Pentagram.webp`,
  effectRoot: `${SPRITE_ICON_BASE}/Weather_Nature_Tree_Roots_Entangle_Element.webp`,
  effectSpeed: `${SPRITE_ICON_BASE}/RPG_Skill_Dash_Dodge_Movement_Speed_Run_Sprint.webp`,
  effectAccuracy: `${SPRITE_ICON_BASE}/RPG_Stat_Accuracy_Ranged_Target_Arrow.webp`,
  effectStrength: `${SPRITE_ICON_BASE}/RPG_Stat_Strength_Fist_Melee_Attack.webp`,
  effectArmor: `${SPRITE_ICON_BASE}/RPG_Item_Stat_Shield_Defense_Armor.webp`,
  effectHeal: `${SPRITE_ICON_BASE}/Misc_Medkit_Medicine_Health_Pickup.webp`,
  effectBurn: `${SPRITE_ICON_BASE}/Weather_Wildfire_Flame_Element_Hot_Burn.webp`,
  effectFreeze: `${SPRITE_ICON_BASE}/Weather_Snowflake_Freeze_Cold_Snowstorm_Frozen_Frost_Element_Winter_Season.webp`,
  effectPoison: `${SPRITE_ICON_BASE}/Misc_Snake_Viper_Cobra_Poison_2.webp`,
  effectStun: `${SPRITE_ICON_BASE}/RPG_Debuff_Stunned_Disabled_CC_Crowd_Control.webp`,
  effectBlind: `${SPRITE_ICON_BASE}/Media_Eyeball_Vision_Hidden_Disabled_Off.webp`,
  effectTaunt: `${SPRITE_ICON_BASE}/RPG_Buff_Enraged_Anger_Bloodlust_Taunt.webp`,
  effectDoom: `${SPRITE_ICON_BASE}/RPG_Skull_Death_Dead_Bones_Pirates.webp`
});

const RADIAL_STYLESHEET_ID = "dda-radial-token-hud-styles";
const RADIAL_STYLESHEET_PATH = `systems/${SYSTEM_ID}/styles/dda-token-hud.css?stage=h1`;

function ensureRadialStylesheet() {
  const existing = document.getElementById(RADIAL_STYLESHEET_ID);
  if (existing) {
    if (!String(existing.getAttribute("href") ?? "").includes("stage=h1")) {
      existing.setAttribute("href", RADIAL_STYLESHEET_PATH);
    }
    return existing;
  }

  const link = document.createElement("link");
  link.id = RADIAL_STYLESHEET_ID;
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = RADIAL_STYLESHEET_PATH;
  document.head.append(link);
  return link;
}

function elementFrom(value) {
  if (value instanceof HTMLElement) return value;
  if (value?.[0] instanceof HTMLElement) return value[0];
  if (value?.element instanceof HTMLElement) return value.element;
  return null;
}

function text(pt, en) {
  return String(game.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
}

function getHudActor(hud) {
  return hud?.actor ?? hud?.object?.actor ?? hud?.document?.actor ?? null;
}

function getHudToken(hud) {
  return hud?.object?.document ? hud.object : canvas?.tokens?.get?.(hud?.document?.id) ?? null;
}

function canUseDdaHud(actor) {
  return Boolean(actor && SUPPORTED_ACTOR_TYPES.has(String(actor.type ?? "")));
}

function canModifyToken(token) {
  return Boolean(game.user?.isGM || token?.document?.isOwner || token?.isOwner);
}

function actionIcon(src, alt = "") {
  // Width/height attributes plus critical inline geometry are intentional.
  // If Foundry opens a Token HUD before the stylesheet finishes loading,
  // icon assets must never render at their intrinsic dimensions.
  return `<img class="dda-radial-token-hud__icon" src="${src}" alt="${alt}" draggable="false" width="26" height="26" style="display:block;width:26px;height:26px;max-width:26px;max-height:26px;object-fit:contain;pointer-events:none;">`;
}

function buttonSpec({ key, label, icon, disabled = false, state = "" }) {
  return { key, label, icon, disabled, state };
}

function localizeMaybe(value, fallback = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const localized = game.i18n?.localize?.(raw);
  return localized && localized !== raw ? localized : raw;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortLabel(value = "", max = 7) {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean.toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const acronym = words.map((word) => word[0]).join("").slice(0, max);
    if (acronym.length >= 2) return acronym.toUpperCase();
  }
  return clean.slice(0, max).toUpperCase();
}

function getMovementState(actor) {
  try {
    return game.dda?.movementTracker?.getCurrentMovementSession?.(actor) ?? null;
  } catch (_error) {
    return null;
  }
}

function hasEffectsLauncher(root) {
  return Boolean(root?.querySelector?.(".dda-token-effect-toggle"));
}

function buildButtonSpecs({ actor, token, root }) {
  const movement = getMovementState(actor);
  const isTamer = actor.type === "character";
  const isDigimon = actor.type === "digimon" || actor.type === "npc";
  const mayModify = canModifyToken(token);

  return [
    buttonSpec({
      key: "stats",
      label: isTamer ? text("Atributos e Habilidades", "Attributes & Skills") : text("Stats", "Stats"),
      icon: HUD_ICONS.stats
    }),
    buttonSpec({
      key: "actions",
      label: text("Menu de Ações", "Action Menu"),
      icon: HUD_ICONS.actions
    }),
    buttonSpec({
      key: "attacks",
      label: text("Ataques", "Attacks"),
      icon: HUD_ICONS.attack,
      disabled: !isDigimon && !isTamer
    }),
    buttonSpec({
      key: "target",
      label: token?.isTargeted ? text("Remover alvo", "Untarget") : text("Marcar como alvo", "Target"),
      icon: HUD_ICONS.target,
      state: token?.isTargeted ? "is-active" : ""
    }),
    buttonSpec({
      key: "movement",
      label: movement?.state === "active"
        ? (movement.kind === "charge-approach"
          ? text("Concluir [CHARGE] / botão direito para resetar", "Complete [CHARGE] / right-click to reset")
          : text("Encerrar Movimento / botão direito para resetar", "Finish Movement / right-click to reset"))
        : text("Movimento / Postura", "Movement / Stance"),
      icon: HUD_ICONS.movement,
      state: movement?.state === "active" ? "is-active" : ""
    }),
    buttonSpec({
      key: "endTurn",
      label: text("Encerrar Turno", "End Turn"),
      icon: HUD_ICONS.endTurn,
      disabled: !game.combat?.started
    }),
    buttonSpec({
      key: "visibility",
      label: token?.document?.hidden ? text("Tornar visível", "Show Token") : text("Ocultar Token", "Hide Token"),
      icon: token?.document?.hidden ? HUD_ICONS.hidden : HUD_ICONS.visibility,
      disabled: !mayModify,
      state: token?.document?.hidden ? "is-active" : ""
    }),
    buttonSpec({
      key: "elevation",
      label: text("Elevação: clique + / botão direito −", "Elevation: click + / right-click −"),
      icon: HUD_ICONS.elevation,
      disabled: !mayModify
    }),
    buttonSpec({
      key: "config",
      label: text("Configurar Token", "Configure Token"),
      icon: HUD_ICONS.config,
      disabled: !mayModify
    }),
    buttonSpec({
      key: "effects",
      label: text("Buffs, Debuffs e Status DDA", "DDA Buffs, Debuffs & Statuses"),
      icon: HUD_ICONS.effects,
      disabled: !game.user?.isGM || !["digimon", "npc"].includes(String(actor.type ?? "")),
      state: Array.isArray(actor.system?.effects?.active) && actor.system.effects.active.length ? "has-effect-state" : ""
    }),
    buttonSpec({
      key: "combat",
      label: token?.document?.inCombat ? text("Remover do Combate", "Remove from Combat") : text("Adicionar ao Combate", "Add to Combat"),
      icon: HUD_ICONS.combat,
      disabled: !mayModify,
      state: token?.document?.inCombat ? "is-active" : ""
    }),
    buttonSpec({
      key: "qualities",
      label: isTamer ? text("Talentos", "Talents") : text("Qualidades", "Qualities"),
      icon: isTamer ? HUD_ICONS.talents : HUD_ICONS.qualities
    })
  ];
}

function actionTrackerDiameterForToken(token) {
  const width = Math.max(1, Number(token?.w ?? 100) || 100);
  const height = Math.max(1, Number(token?.h ?? 100) || 100);
  const side = Math.max(width, height);

  // Large tokens keep the proportions already approved visually. Small tokens
  // get a larger fixed breathing room so the Action Tracker clears Health Pips.
  return Math.round(Math.max(side * 1.46, side + 90));
}

function computeRadius(token) {
  const trackerDiameter = actionTrackerDiameterForToken(token);
  const trackerOuterRadius = trackerDiameter * 0.43;
  const hudButtonRadius = 26;
  const visualGap = 10;

  return Math.max(112, trackerOuterRadius + visualGap + hudButtonRadius);
}


function makeRadialButton(spec, index, radius) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `dda-radial-token-hud__button ${spec.state || ""}`.trim();
  // Keep the HUD structurally safe even during a stylesheet cache miss.
  Object.assign(button.style, {
    position: "absolute",
    width: "52px",
    height: "52px",
    minWidth: "52px",
    minHeight: "52px",
    margin: "0",
    padding: "0",
    borderRadius: "50%",
    pointerEvents: "auto"
  });
  button.dataset.ddaHudAction = spec.key;
  button.dataset.ddaRadialIndex = String(index);
  button.dataset.ddaRadialRadius = String(radius);
  button.dataset.ddaLabel = spec.label;
  button.dataset.tooltip = spec.label;
  button.dataset.tooltipDirection = "UP";
  button.setAttribute("aria-label", spec.label);
  button.disabled = Boolean(spec.disabled);

  const angleDegrees = -90 + (360 / RADIAL_BUTTON_COUNT) * index;
  const angle = angleDegrees * (Math.PI / 180);
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;

  button.style.setProperty("--dda-radial-x", `${x.toFixed(2)}px`);
  button.style.setProperty("--dda-radial-y", `${y.toFixed(2)}px`);
  button.style.left = `calc(50% + ${x.toFixed(2)}px)`;
  button.style.top = `calc(50% + ${y.toFixed(2)}px)`;
  button.style.transform = "translate(-50%, -50%)";
  button.style.backgroundImage = `url("systems/${SYSTEM_ID}/assets/ui/token-hud-button.webp")`;
  button.style.backgroundPosition = "center";
  button.style.backgroundRepeat = "no-repeat";
  button.style.backgroundSize = "contain";
  button.innerHTML = actionIcon(spec.icon, spec.label);

  const image = button.querySelector("img");
  image?.addEventListener("error", () => {
    if (image.src.endsWith(CORE_ICON_FALLBACK)) return;
    image.src = CORE_ICON_FALLBACK;
  }, { once: true });

  return button;
}

async function openSheetTab(actor, tab) {
  const sheet = actor?.sheet;
  if (!sheet) return false;
  await sheet.render(true);
  try {
    sheet.changeTab?.(tab, "primary", { force: true, updatePosition: true });
  } catch (_error) {
    // Rendering the sheet is still useful if a custom sheet does not expose this tab group.
  }
  return true;
}

async function openActionMenu(actor) {
  if (actor?.type === "character") {
    const { openTamerActionMenu } = await import("../combat/tamer-actions.js");
    return openTamerActionMenu(actor);
  }

  if (actor?.type === "digimon" || actor?.type === "npc") {
    const { openDigimonActionMenu } = await import("../combat/digimon-actions.js");
    return openDigimonActionMenu(actor);
  }

  return null;
}

async function useAttackShortcut(actor) {
  // Kept as a fallback for callers outside the radial submenu.
  if (actor?.type === "digimon" || actor?.type === "npc") {
    const attacks = actor.items?.filter?.((item) => item.type === "attack") ?? [];
    if (attacks.length === 1) {
      const { rollAttack } = await import("../rolls/attack-roll.js");
      return rollAttack(actor, attacks[0]);
    }
  }
  return openActionMenu(actor);
}

function radialAngleForButton(button) {
  const index = Number(button?.dataset?.ddaRadialIndex ?? 0) || 0;
  return -90 + (360 / RADIAL_BUTTON_COUNT) * index;
}

function radialRadiusForButton(button) {
  return Number(button?.dataset?.ddaRadialRadius ?? 100) || 100;
}

function clearSubmenu(radial, { keepParent = null, animate = true } = {}) {
  if (!radial) return;

  radial.querySelectorAll(".dda-radial-token-hud__submenu").forEach((submenu) => {
    if (submenu.dataset.state === "closing") return;

    const tooltipTarget = game.tooltip?.element ?? null;
    if (tooltipTarget instanceof HTMLElement && submenu.contains(tooltipTarget)) {
      game.tooltip.deactivate?.();
    }
    if (!animate) {
      submenu.remove();
      return;
    }
    submenu.dataset.state = "closing";
    submenu.classList.remove("is-entering");
    submenu.classList.add("is-closing");
    window.setTimeout(() => submenu.remove(), 150);
  });

  radial.querySelectorAll(".dda-radial-token-hud__button.is-submenu-open").forEach((element) => {
    if (element !== keepParent) element.classList.remove("is-submenu-open", "is-active");
  });
}


function polarPoint(radius, angleDeg) {
  const angle = angleDeg * Math.PI / 180;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

function svgPathArc(cx, cy, radius, startDeg, endDeg) {
  const start = polarPoint(radius, startDeg);
  const end = polarPoint(radius, endDeg);
  const sweep = endDeg >= startDeg ? 1 : 0;
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${(cx + start.x).toFixed(2)} ${(cy + start.y).toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} ${sweep} ${(cx + end.x).toFixed(2)} ${(cy + end.y).toFixed(2)}`;
}

function makeSubmenuArc(parentRadius, parentAngleDeg, outerRadius, startAngleDeg, endAngleDeg) {
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  layer.classList.add("dda-radial-token-hud__branch-arc");

  const padding = 34;
  const extent = Math.ceil((outerRadius + padding) * 2);
  const center = extent / 2;

  layer.setAttribute("viewBox", `0 0 ${extent} ${extent}`);
  layer.setAttribute("width", String(extent));
  layer.setAttribute("height", String(extent));
  layer.style.width = `${extent}px`;
  layer.style.height = `${extent}px`;
  layer.style.left = "50%";
  layer.style.top = "50%";
  layer.style.transform = "translate(-50%, -50%)";

  const middleAngle = startAngleDeg + ((endAngleDeg - startAngleDeg) / 2);
  const connectorStart = polarPoint(parentRadius + 22, parentAngleDeg);
  const connectorEnd = polarPoint(outerRadius - 22, middleAngle);

  const connector = document.createElementNS("http://www.w3.org/2000/svg", "path");
  connector.setAttribute(
    "d",
    `M ${(center + connectorStart.x).toFixed(2)} ${(center + connectorStart.y).toFixed(2)} Q ${(center + (connectorStart.x + connectorEnd.x) / 2).toFixed(2)} ${(center + (connectorStart.y + connectorEnd.y) / 2).toFixed(2)} ${(center + connectorEnd.x).toFixed(2)} ${(center + connectorEnd.y).toFixed(2)}`
  );
  connector.setAttribute("class", "dda-radial-token-hud__branch-path dda-radial-token-hud__branch-connector");
  layer.append(connector);

  if (Math.abs(endAngleDeg - startAngleDeg) > 0.01) {
    const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arc.setAttribute("d", svgPathArc(center, center, outerRadius, startAngleDeg, endAngleDeg));
    arc.setAttribute("class", "dda-radial-token-hud__branch-path dda-radial-token-hud__branch-orbit");
    layer.append(arc);
  }

  return layer;
}


function submenuIcon(icon, label) {
  return actionIcon(icon || CORE_ICON_FALLBACK, label);
}

function pageSubmenuItems(items, page) {
  const totalPages = Math.max(1, Math.ceil(items.length / SUBMENU_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(Number(page ?? 0) || 0, totalPages - 1));
  const first = safePage * SUBMENU_PAGE_SIZE;
  const visible = items.slice(first, first + SUBMENU_PAGE_SIZE);
  const output = [];
  if (safePage > 0) {
    output.push({ key: "__prev", label: text("Página anterior", "Previous page"), icon: HUD_ICONS.previous, navPage: safePage - 1, short: "‹" });
  }
  output.push(...visible);
  if (safePage < totalPages - 1) {
    output.push({ key: "__next", label: text("Próxima página", "Next page"), icon: HUD_ICONS.next, navPage: safePage + 1, short: "›" });
  }
  return { items: output, page: safePage, totalPages };
}

function submenuAngularStep(outerRadius) {
  // Place buttons along the same circumference using chord spacing rather than
  // an arbitrary fan spread. This keeps 2–6 options compact and genuinely orbital.
  const desiredChord = 52;
  const ratio = Math.min(0.98, desiredChord / Math.max(1, 2 * outerRadius));
  const degrees = (2 * Math.asin(ratio)) * (180 / Math.PI);
  return Math.max(12, Math.min(18, degrees));
}

function renderSubmenu(radial, parentButton, items, { page = 0, title = "" } = {}) {
  if (!radial || !parentButton) return;
  clearSubmenu(radial, { keepParent: parentButton });
  parentButton.classList.add("is-submenu-open", "is-active");

  const submenu = document.createElement("div");
  submenu.className = "dda-radial-token-hud__submenu";
  submenu.dataset.parentAction = parentButton.dataset.ddaHudAction ?? "";
  submenu.dataset.page = String(page);
  if (title) submenu.dataset.title = title;

  const parentAngleDeg = radialAngleForButton(parentButton);
  const parentAngle = parentAngleDeg * Math.PI / 180;
  const parentRadius = radialRadiusForButton(parentButton);
  const parentX = Math.cos(parentAngle) * parentRadius;
  const parentY = Math.sin(parentAngle) * parentRadius;
  const pageData = pageSubmenuItems(items, page);
  const visible = pageData.items;
  const count = visible.length;

  const outerRadius = parentRadius + SUBMENU_RING_STEP + (count > 6 ? 6 : 0);
  const angleStep = submenuAngularStep(outerRadius);
  const spread = count <= 1 ? 0 : angleStep * (count - 1);
  const startAngle = parentAngleDeg - spread / 2;
  const endAngle = parentAngleDeg + spread / 2;

  submenu.append(makeSubmenuArc(parentRadius, parentAngleDeg, outerRadius, startAngle, endAngle));

  visible.forEach((item, index) => {
    const fraction = count <= 1 ? 0.5 : index / (count - 1);
    const angleDeg = count <= 1 ? parentAngleDeg : startAngle + spread * fraction;
    const angle = angleDeg * Math.PI / 180;
    const x = Math.cos(angle) * outerRadius;
    const y = Math.sin(angle) * outerRadius;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dda-radial-token-hud__submenu-button";
    button.dataset.submenuKey = String(item.key ?? index);
    if (item.navPage !== undefined) button.dataset.navPage = String(item.navPage);
    const tooltipText = String(item.tooltip ?? [item.label, item.cost].filter(Boolean).join(" · "));
    button.dataset.tooltip = tooltipText;
    button.dataset.tooltipDirection = "UP";
    button.setAttribute("aria-label", tooltipText || item.label || "");
    if (item.tone) button.classList.add(`is-${item.tone}`);
    if (item.active) button.classList.add("is-current");
    button.disabled = Boolean(item.disabled);
    button.style.left = `calc(50% + ${x.toFixed(2)}px)`;
    button.style.setProperty("--dda-submenu-index", String(index));
    button.style.setProperty("--dda-submenu-origin-x", `${(parentX - x).toFixed(2)}px`);
    button.style.setProperty("--dda-submenu-origin-y", `${(parentY - y).toFixed(2)}px`);
    button.style.top = `calc(50% + ${y.toFixed(2)}px)`;
    button.innerHTML = `
      ${submenuIcon(item.icon, item.label)}
      ${item.cost ? `<span class="dda-radial-token-hud__action-cost">${escapeHtml(item.cost)}</span>` : ""}
    `;

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (button.disabled) return;

      if (item.navPage !== undefined) {
        renderSubmenu(radial, parentButton, items, { page: item.navPage, title });
        return;
      }

      if (typeof item.children === "function") {
        const children = await item.children();
        renderSubmenu(radial, parentButton, children ?? [], { page: 0, title: item.label });
        return;
      }

      if (typeof item.handler !== "function") return;
      button.classList.add("is-busy");
      try {
        await item.handler(event, button);
      } catch (error) {
        console.error(`DDA | Radial submenu action '${item.key}' failed.`, error);
      } finally {
        if (button.isConnected) button.classList.remove("is-busy");
      }
    });

    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (typeof item.contextHandler === "function") {
        button.classList.add("is-busy");
        Promise.resolve(item.contextHandler(event, button))
          .catch((error) => console.error(`DDA | Radial submenu context action '${item.key}' failed.`, error))
          .finally(() => {
            if (button.isConnected) button.classList.remove("is-busy");
          });
      }
    });

    submenu.append(button);
  });

  submenu.classList.add("is-entering");
  radial.append(submenu);
  window.setTimeout(() => {
    if (submenu.isConnected) submenu.classList.remove("is-entering");
  }, 210);
}

function attackSubmenuItems(actor) {
  if (actor?.type === "character") {
    return [{
      key: "tamer-attack",
      label: text("Ataque / Ação do Tamer", "Tamer Attack / Action"),
      icon: HUD_ICONS.attack,
      short: "ATK",
      handler: () => openActionMenu(actor)
    }];
  }

  const attacks = (actor?.items ?? [])
    .filter((item) => item.type === "attack")
    .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang));

  if (!attacks.length) {
    return [{ key: "none", label: text("Nenhum ataque", "No attacks"), icon: HUD_ICONS.attack, disabled: true, short: "—" }];
  }

  return attacks.map((attack, index) => ({
    key: attack.id,
    label: attack.name,
    icon: HUD_ICONS.attack,
    short: String(index + 1),
    handler: async () => {
      const { rollAttack } = await import("../rolls/attack-roll.js");
      return rollAttack(actor, attack);
    },
    contextHandler: () => attack.sheet?.render?.(true)
  }));
}

function digimonDerivedSubmenuItems(actor) {
  const preferredOrder = ["bit", "dos", "ram", "cpu"];
  const derived = actor?.system?.derivedStats ?? {};
  return preferredOrder
    .filter((key) => derived[key])
    .map((key) => {
      const stat = derived[key];
      const label = localizeMaybe(stat.displayLabel ?? stat.label, key.toUpperCase());
      return {
        key: `derived-${key}`,
        label,
        icon: HUD_ICONS.d20,
        short: key.toUpperCase(),
        handler: () => actor.sheet?.rollDerivedStatFromHud?.(key) ?? openSheetTab(actor, "stats")
      };
    });
}

function digimonStatSubmenuItems(actor) {
  const preferred = [
    ["accuracy", HUD_ICONS.accuracy, "ACC"],
    ["damage", HUD_ICONS.damage, "DMG"],
    ["dodge", HUD_ICONS.dodge, "DDG"],
    ["armor", HUD_ICONS.armor, "ARM"],
    ["health", HUD_ICONS.health, "HP"]
  ];
  const stats = actor?.system?.mainStats ?? {};
  const output = preferred.filter(([key]) => stats[key]).map(([key, icon, short]) => {
    const stat = stats[key];
    const label = localizeMaybe(stat.displayLabel ?? stat.label, key);
    return {
      key, label, icon, short,
      handler: async () => {
        const { rollPool } = await import("../rolls/pool-roll.js");
        return rollPool(actor, key);
      }
    };
  });

  if (Object.keys(actor?.system?.derivedStats ?? {}).length) {
    output.push({
      key: "derived",
      label: text("Derived Stats", "Derived Stats"),
      icon: HUD_ICONS.d20,
      short: "BIT+",
      children: async () => digimonDerivedSubmenuItems(actor)
    });
  }
  return output;
}

function tamerSkillsForAttribute(actor, attributeKey) {
  const skills = actor?.system?.skills ?? {};
  return Object.entries(skills)
    .filter(([, skill]) => Array.isArray(skill?.attributes) && skill.attributes.includes(attributeKey))
    .sort(([, a], [, b]) => localizeMaybe(a?.label).localeCompare(localizeMaybe(b?.label), game.i18n.lang))
    .map(([skillKey, skill]) => {
      const label = localizeMaybe(skill?.label, skillKey);
      return {
        key: skillKey,
        label,
        icon: HUD_ICONS.d20,
        short: shortLabel(label, 5),
        handler: async () => {
          const { rollTamerCheck } = await import("../rolls/check-roll.js");
          return rollTamerCheck(actor, skillKey);
        }
      };
    });
}

function tamerStatSubmenuItems(actor) {
  const attributes = actor?.system?.attributes ?? {};
  return Object.entries(attributes).map(([key, attribute]) => {
    const label = localizeMaybe(attribute?.label, key);
    const skills = tamerSkillsForAttribute(actor, key);
    return {
      key,
      label,
      icon: HUD_ICONS.d20,
      short: shortLabel(label, 4),
      disabled: !skills.length,
      children: async () => skills
    };
  });
}

function talentSubmenuItems(actor) {
  const talents = (actor?.items ?? [])
    .filter((item) => item.type === "tamerTalent")
    .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang));

  if (!talents.length) {
    return [{ key: "none", label: text("Nenhum talento", "No talents"), icon: HUD_ICONS.talents, disabled: true, short: "—" }];
  }

  return talents.map((talent) => ({
    key: talent.id,
    label: talent.name,
    icon: HUD_ICONS.talents,
    short: shortLabel(talent.name, 5),
    handler: async () => {
      const { executeTamerTalentAutomation } = await import("../rules/tamer-talent-automation.js");
      return executeTamerTalentAutomation(actor, talent);
    },
    contextHandler: () => talent.sheet?.render?.(true)
  }));
}

function qualitySubmenuItems(actor) {
  const qualities = (actor?.items ?? [])
    .filter((item) => item.type === "quality" && Boolean(item.system?.activation?.enabled))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang));

  if (!qualities.length) {
    return [{
      key: "none",
      label: text("Nenhuma Qualidade ativável", "No activatable Qualities"),
      icon: HUD_ICONS.qualities,
      disabled: true,
      short: "—"
    }];
  }

  return qualities.map((quality) => ({
    key: quality.id,
    label: quality.name,
    icon: HUD_ICONS.qualities,
    short: shortLabel(quality.name, 5),
    handler: () => actor.sheet?.useQualityFromHud?.(quality.id) ?? openSheetTab(actor, "qualities"),
    contextHandler: () => quality.sheet?.render?.(true)
  }));
}

const ACTION_VISUALS = {
  move: { icon: HUD_ICONS.movement, tone: "movement" },
  difficultMove: { icon: HUD_ICONS.difficultMove, tone: "movement" },
  reposition: { icon: HUD_ICONS.reposition, tone: "movement" },
  attack: { icon: HUD_ICONS.attack, tone: "offense" },
  holdBack: { icon: HUD_ICONS.holdBack, tone: "offense" },
  clash: { icon: HUD_ICONS.clash, tone: "offense" },
  calledShot: { icon: HUD_ICONS.calledShot, tone: "offense" },
  coordinatedAssault: { icon: HUD_ICONS.coordinatedAssault, tone: "offense" },
  resist: { icon: HUD_ICONS.resist, tone: "defense" },
  guard: { icon: HUD_ICONS.guard, tone: "defense" },
  reinforce: { icon: HUD_ICONS.reinforce, tone: "defense" },
  direct: { icon: HUD_ICONS.direct, tone: "support" },
  bolster: { icon: HUD_ICONS.bolster, tone: "support" },
  aid: { icon: HUD_ICONS.aid, tone: "support" },
  teamwork: { icon: HUD_ICONS.teamwork, tone: "support" },
  check: { icon: HUD_ICONS.d20, tone: "tactical" },
  stance: { icon: HUD_ICONS.stance, tone: "tactical" },
  hold: { icon: HUD_ICONS.hold, tone: "tactical" },
  holdBreath: { icon: HUD_ICONS.holdBreath, tone: "tactical" },
  evolution: { icon: HUD_ICONS.evolution, tone: "special" },
  breakClash: { icon: HUD_ICONS.breakClash, tone: "special" },
  clashActions: { icon: HUD_ICONS.clash, tone: "special" }
};

function actionVisual(entry) {
  const key = String(entry?.key ?? "");

  if (key.startsWith("talent:")) return { icon: HUD_ICONS.talents, tone: "special" };
  if (key.startsWith("gainForce")) return { icon: HUD_ICONS.gainForce, tone: "special" };

  const specialVisuals = {
    conjure: HUD_ICONS.summon,
    summon: HUD_ICONS.summon,
    commandMinion: HUD_ICONS.command,
    omnievoker: HUD_ICONS.omni,
    fastball: HUD_ICONS.fastball,
    giantHijacker: HUD_ICONS.giant,
    endGiantHijacker: HUD_ICONS.giant,
    shakeOffGiantHijacker: HUD_ICONS.giant,
    distantForce: HUD_ICONS.distantForce,
    defendRealization: HUD_ICONS.defendRealization,
    busyHandsPlant: HUD_ICONS.busyHands,
    beTheWinners: HUD_ICONS.winner,
    naturalExplorerLead: HUD_ICONS.difficultMove,
    bestLaidPlansSurprise: HUD_ICONS.talents
  };

  if (specialVisuals[key]) return { icon: specialVisuals[key], tone: "special" };
  return ACTION_VISUALS[key] ?? { icon: HUD_ICONS.combat, tone: "tactical" };
}

function normalizeActionEntry(entry) {
  const visual = actionVisual(entry);
  const label = String(entry?.title ?? localizeMaybe(entry?.titleKey, entry?.key ?? ""));
  const summary = String(entry?.summary ?? localizeMaybe(entry?.summaryKey, ""));
  return {
    key: String(entry?.key ?? ""),
    label,
    summary,
    cost: String(entry?.cost ?? "—"),
    icon: visual.icon,
    tone: visual.tone
  };
}

async function getActionDefinition(actor) {
  if (actor?.type === "character") {
    const { getTamerActionMenuDefinition } = await import("../combat/tamer-actions.js");
    return getTamerActionMenuDefinition(actor);
  }
  if (actor?.type === "digimon" || actor?.type === "npc") {
    const { getDigimonActionMenuDefinition } = await import("../combat/digimon-actions.js");
    return getDigimonActionMenuDefinition(actor);
  }
  return null;
}

function withActionsBack(actor, children) {
  return [
    {
      key: "__actionsBack",
      label: text("Voltar às Ações", "Back to Actions"),
      icon: HUD_ICONS.previous,
      tone: "tactical",
      children: () => actionSubmenuItems(actor)
    },
    ...children
  ];
}

function digimonActionAttacks(actor, definition, actionKey = "attack") {
  const attacks = (actor?.items ?? [])
    .filter((item) => item.type === "attack")
    .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang));
  if (!attacks.length) return [{ key: "none", label: text("Nenhum ataque", "No attacks"), icon: HUD_ICONS.attack, disabled: true }];
  return attacks.map((attack) => ({
    key: `action-${actionKey}-${attack.id}`,
    label: attack.name,
    icon: HUD_ICONS.attack,
    tone: "offense",
    cost: actionKey === "holdBack" ? "1A" : "1A",
    handler: () => definition.execute(actionKey, { attack }),
    contextHandler: () => attack.sheet?.render?.(true)
  }));
}

function digimonActionChecks(actor, definition) {
  const stats = actor?.system?.mainStats ?? {};
  return Object.entries(stats)
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]) => ({
      key: `action-check-${key}`,
      label: localizeMaybe(value?.displayLabel ?? value?.label, key),
      icon: HUD_ICONS.d20,
      tone: "tactical",
      cost: "2A",
      handler: () => definition.execute("check", { statKey: key })
    }));
}

async function digimonActionStances(actor, definition) {
  const { getDigimonAvailableStances } = await import("../combat/digimon-actions.js");
  return getDigimonAvailableStances(actor).map((stance) => ({
    key: `action-stance-${stance.value}`,
    label: stance.label,
    icon: HUD_ICONS.stance,
    tone: "tactical",
    cost: String(definition.entries.find((entry) => entry.key === "stance")?.cost ?? "1A"),
    handler: () => definition.execute("stance", { stance: stance.value })
  }));
}

function tamerActionSkills(actor, definition) {
  return Object.entries(actor?.system?.skills ?? {})
    .sort(([, a], [, b]) => localizeMaybe(a?.label).localeCompare(localizeMaybe(b?.label), game.i18n.lang))
    .map(([skillKey, skill]) => ({
      key: `action-check-${skillKey}`,
      label: localizeMaybe(skill?.label, skillKey),
      icon: HUD_ICONS.d20,
      tone: "tactical",
      cost: "1A",
      handler: () => definition.execute("check", { skillKey })
    }));
}

function tamerActionAttacks(definition) {
  return [
    {
      key: "action-attack-melee",
      label: text("Ataque corpo a corpo", "Melee Attack"),
      icon: HUD_ICONS.attack,
      tone: "offense",
      cost: "1A",
      handler: () => definition.execute("attack", { attackType: "melee" })
    },
    {
      key: "action-attack-ranged",
      label: text("Ataque à distância", "Ranged Attack"),
      icon: HUD_ICONS.calledShot,
      tone: "offense",
      cost: "1A",
      handler: () => definition.execute("attack", { attackType: "ranged" })
    }
  ];
}

async function actionSubmenuItems(actor) {
  const definition = await getActionDefinition(actor);
  if (!definition) return [];

  return definition.entries.map((rawEntry) => {
    const entry = normalizeActionEntry(rawEntry);
    const item = {
      ...entry,
      handler: () => definition.execute(entry.key)
    };

    if (actor.type !== "character") {
      if (entry.key === "attack") item.children = async () => withActionsBack(actor, digimonActionAttacks(actor, definition, "attack"));
      else if (entry.key === "holdBack") item.children = async () => withActionsBack(actor, digimonActionAttacks(actor, definition, "holdBack"));
      else if (entry.key === "check") item.children = async () => withActionsBack(actor, digimonActionChecks(actor, definition));
      else if (entry.key === "stance") item.children = async () => withActionsBack(actor, await digimonActionStances(actor, definition));
    } else {
      if (entry.key === "attack") item.children = async () => withActionsBack(actor, tamerActionAttacks(definition));
      else if (entry.key === "check") item.children = async () => withActionsBack(actor, tamerActionSkills(actor, definition));
    }

    return item;
  });
}


function movementEntry(definition, key) {
  const raw = definition?.entries?.find?.((entry) => String(entry?.key ?? "") === key);
  return raw ? normalizeActionEntry(raw) : null;
}

function withMovementBack(actor, token, children) {
  return [
    {
      key: "__movementBack",
      label: text("Voltar a Movimento/Postura", "Back to Movement/Stance"),
      icon: HUD_ICONS.previous,
      tone: "movement",
      children: () => movementSubmenuItems(actor, token)
    },
    ...children
  ];
}

function withEnvironmentBack(actor, token, children) {
  return [
    {
      key: "__environmentBack",
      label: text("Voltar ao Ambiente", "Back to Environment"),
      icon: HUD_ICONS.previous,
      tone: "movement",
      children: () => environmentQuickItems(actor, token)
    },
    ...children
  ];
}

async function environmentQuickItems(actor, token) {
  const environment = await import("../combat/environment.js");
  const state = environment.getCombatEnvironmentState(actor);
  const update = (patch) => environment.updateCombatEnvironmentState(actor, patch);

  return [
    {
      key: "environment-editor",
      label: text("Configuração completa", "Full Environment Editor"),
      icon: HUD_ICONS.config,
      tone: "tactical",
      handler: () => environment.openCombatEnvironmentDialog(actor)
    },
    {
      key: "environment-sight",
      label: text("Visibilidade", "Visibility"),
      icon: state.sight === "blinded" ? HUD_ICONS.hidden : HUD_ICONS.visibility,
      tone: "tactical",
      cost: state.sight === "unobscured" ? "OK" : state.sight === "obscured" ? "OBS" : "BLIND",
      active: state.sight !== "unobscured",
      children: () => withEnvironmentBack(actor, token, [
        { key: "sight-clear", label: "Unobscured", icon: HUD_ICONS.visibility, active: state.sight === "unobscured", handler: () => update({ sight: "unobscured" }) },
        { key: "sight-obscured", label: "Obscured", icon: HUD_ICONS.visibility, active: state.sight === "obscured", handler: () => update({ sight: "obscured" }) },
        { key: "sight-blinded", label: "Blinded", icon: HUD_ICONS.hidden, active: state.sight === "blinded", handler: () => update({ sight: "blinded" }) }
      ])
    },
    {
      key: "environment-cover",
      label: "Cover",
      icon: HUD_ICONS.guard,
      tone: "tactical",
      cost: state.cover === "major" ? "+2" : state.cover === "partial" ? "+1" : "0",
      active: state.cover !== "none",
      children: () => withEnvironmentBack(actor, token, [
        { key: "cover-none", label: text("Sem Cover", "No Cover"), icon: HUD_ICONS.guard, active: state.cover === "none", handler: () => update({ cover: "none" }) },
        { key: "cover-partial", label: text("Cover Parcial (+1)", "Partial Cover (+1)"), icon: HUD_ICONS.guard, active: state.cover === "partial", handler: () => update({ cover: "partial" }) },
        { key: "cover-major", label: text("Cover Maior (+2)", "Major Cover (+2)"), icon: HUD_ICONS.guard, active: state.cover === "major", handler: () => update({ cover: "major" }) }
      ])
    },
    {
      key: "environment-hidden",
      label: "Hidden",
      icon: HUD_ICONS.hidden,
      tone: "tactical",
      cost: state.hidden ? "ON" : "OFF",
      active: state.hidden,
      handler: () => update({ hidden: !state.hidden })
    },
    {
      key: "environment-submerged",
      label: "Submerged",
      icon: HUD_ICONS.movement,
      tone: "movement",
      cost: state.submerged ? "ON" : "OFF",
      active: state.submerged,
      handler: () => update({ submerged: !state.submerged })
    },
    {
      key: "environment-drowning",
      label: text("Sem ar", "No Air"),
      icon: HUD_ICONS.holdBreath,
      tone: "effect-negative",
      cost: state.drowning ? "ON" : "OFF",
      active: state.drowning,
      handler: () => update({ drowning: !state.drowning })
    }
  ];
}

async function movementStanceItems(actor, token, definition) {
  if (!["digimon", "npc"].includes(actor?.type)) return [];

  const { getDigimonAvailableStances } = await import("../combat/digimon-actions.js");
  const current = String(actor.system?.combat?.currentStance ?? "neutral");
  const stanceEntry = movementEntry(definition, "stance");
  const cost = String(stanceEntry?.cost ?? "1A");

  return getDigimonAvailableStances(actor).map((stance) => ({
    key: `movement-stance-${stance.value}`,
    label: stance.label,
    icon: HUD_ICONS.stance,
    tone: "tactical",
    cost,
    active: String(stance.value) === current,
    handler: () => definition.execute("stance", { stance: stance.value })
  }));
}

async function movementSubmenuItems(actor, token) {
  const tracker = game.dda?.movementTracker;
  const session = tracker?.getCurrentMovementSession?.(actor) ?? null;

  if (session?.state === "active") {
    const items = [];

    if (session.kind === "charge-approach") {
      items.push({
        key: "movement-complete-charge",
        label: text("Concluir [CHARGE] e Atacar", "Complete [CHARGE] and Attack"),
        icon: HUD_ICONS.attack,
        tone: "offense",
        handler: () => tracker?.completeChargeForToken?.(token.document)
      });
    } else {
      items.push({
        key: "movement-finish",
        label: text("Encerrar Movimento", "Finish Movement"),
        icon: HUD_ICONS.finishMovement,
        tone: "movement",
        handler: () => tracker?.finishForToken?.(token.document)
      });
    }

    items.push({
      key: "movement-reset",
      label: text("Resetar Movimento", "Reset Movement"),
      icon: HUD_ICONS.resetMovement,
      tone: "tactical",
      handler: () => tracker?.resetForToken?.(token.document)
    });

    return items;
  }

  const definition = await getActionDefinition(actor);
  if (!definition) return [];

  const items = [];
  for (const key of ["move", "longJump", "difficultMove"]) {
    const entry = movementEntry(definition, key);
    if (!entry) continue;
    items.push({
      ...entry,
      handler: () => definition.execute(key)
    });
  }

  if (actor.type === "character") {
    const reposition = movementEntry(definition, "reposition");
    if (reposition) {
      items.push({
        ...reposition,
        handler: () => definition.execute("reposition")
      });
    }
  } else {
    const stance = movementEntry(definition, "stance");
    if (stance) {
      items.push({
        ...stance,
        label: text("Mudar Postura", "Change Stance"),
        children: async () => withMovementBack(actor, token, await movementStanceItems(actor, token, definition))
      });
    }
  }

  items.push({
    key: "movement-environment",
    label: text("Ambiente", "Environment"),
    icon: HUD_ICONS.visibility,
    tone: "tactical",
    children: async () => withMovementBack(actor, token, await environmentQuickItems(actor, token))
  });

  return items;
}


const EFFECT_VISUALS = Object.freeze({
  keen: HUD_ICONS.effectAccuracy,
  swift: HUD_ICONS.effectSpeed,
  tailwind: HUD_ICONS.effectSpeed,
  nimble: HUD_ICONS.effectSpeed,
  sharpen: HUD_ICONS.attack,
  sturdy: HUD_ICONS.effectArmor,
  daring: HUD_ICONS.effectArmor,
  fury: HUD_ICONS.effectStrength,
  regen: HUD_ICONS.effectHeal,
  steady: HUD_ICONS.effectAccuracy,
  strength: HUD_ICONS.effectStrength,
  vigil: HUD_ICONS.visibility,
  vigor: HUD_ICONS.effectSpeed,
  shield: HUD_ICONS.effectArmor,
  bastion: HUD_ICONS.effectPositive,
  root: HUD_ICONS.effectRoot,
  slow: HUD_ICONS.effectSpeed,
  vague: HUD_ICONS.visibility,
  confuse: HUD_ICONS.effectNegative,
  distract: HUD_ICONS.target,
  dull: HUD_ICONS.attack,
  frail: HUD_ICONS.breakClash,
  heavy: HUD_ICONS.effectArmor,
  exploit: HUD_ICONS.target,
  pacify: HUD_ICONS.effectNegative,
  paralyze: HUD_ICONS.effectStun,
  rattled: HUD_ICONS.effectDoom,
  shaken: HUD_ICONS.effectDoom,
  weak: HUD_ICONS.breakClash,
  debilitate: HUD_ICONS.effectNegative,
  burn: HUD_ICONS.effectBurn,
  freeze: HUD_ICONS.effectFreeze,
  poison: HUD_ICONS.effectPoison,
  ruin: HUD_ICONS.effectDoom,
  fear: HUD_ICONS.effectDoom,
  doom: HUD_ICONS.effectDoom,
  taunt: HUD_ICONS.effectTaunt,
  haste: HUD_ICONS.effectSpeed,
  immune: HUD_ICONS.effectArmor,
  blind: HUD_ICONS.effectBlind,
  deny: HUD_ICONS.effectArmor,
  dot: HUD_ICONS.effectUnique,
  stun: HUD_ICONS.effectStun
});

const EFFECT_GROUP_VISUALS = Object.freeze({
  positive: { icon: HUD_ICONS.effectPositive, tone: "effect-positive", pt: "Buffs", en: "Buffs" },
  negative: { icon: HUD_ICONS.effectNegative, tone: "effect-negative", pt: "Debuffs", en: "Debuffs" },
  damage: { icon: HUD_ICONS.effectDamage, tone: "effect-damage", pt: "Dano Contínuo", en: "Damage Effects" },
  unique: { icon: HUD_ICONS.effectUnique, tone: "effect-unique", pt: "Status Únicos", en: "Unique Statuses" }
});

function normalizeEffectTag(value = "") {
  return String(value ?? "").trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function activeEffectRecord(actor, tag) {
  const normalized = normalizeEffectTag(tag);
  return (Array.isArray(actor?.system?.effects?.active) ? actor.system.effects.active : [])
    .find((effect) => normalizeEffectTag(effect?.tag) === normalized) ?? null;
}

function effectBadge(effect) {
  if (!effect) return "";
  const remaining = Number(effect.remaining ?? effect.duration ?? 0);
  if (!Number.isFinite(remaining) || remaining <= 0) return "ON";
  return `${Math.floor(remaining)}R`;
}

function updateRadialEffectButton(button, actor, tag) {
  if (!(button instanceof HTMLElement)) return;
  const effect = activeEffectRecord(actor, tag);
  button.classList.toggle("is-current", Boolean(effect));
  let badge = button.querySelector(".dda-radial-token-hud__action-cost");
  const value = effectBadge(effect);
  if (value) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "dda-radial-token-hud__action-cost";
      button.append(badge);
    }
    badge.textContent = value;
  } else {
    badge?.remove();
  }
}

async function effectTagSubmenuItems(actor, group) {
  const {
    adjustDdaTokenEffect,
    configureAndApplyDdaTokenEffect,
    getDdaTokenEffectTooltip
  } = await import("./dda-token-hud-effects.js");

  const visual = EFFECT_GROUP_VISUALS[group.key] ?? EFFECT_GROUP_VISUALS.unique;
  const entries = group.tags.map((tag) => {
    const active = activeEffectRecord(actor, tag);
    return {
      key: `effect:${tag}`,
      label: `[${String(tag).toUpperCase()}]`,
      tooltip: getDdaTokenEffectTooltip(actor, tag),
      icon: EFFECT_VISUALS[tag] ?? visual.icon,
      tone: visual.tone,
      active: Boolean(active),
      cost: effectBadge(active),
      handler: async (event, button) => {
        if (event?.shiftKey) await configureAndApplyDdaTokenEffect(actor, tag);
        else await adjustDdaTokenEffect(actor, tag, 1);
        updateRadialEffectButton(button, actor, tag);
        button.dataset.tooltip = getDdaTokenEffectTooltip(actor, tag);
        button.setAttribute("aria-label", button.dataset.tooltip);
      },
      contextHandler: async (_event, button) => {
        await adjustDdaTokenEffect(actor, tag, -1);
        updateRadialEffectButton(button, actor, tag);
        button.dataset.tooltip = getDdaTokenEffectTooltip(actor, tag);
        button.setAttribute("aria-label", button.dataset.tooltip);
      }
    };
  });

  return [
    {
      key: "__effectsBack",
      label: text("Voltar aos grupos de Efeitos", "Back to Effect groups"),
      icon: HUD_ICONS.previous,
      tone: "tactical",
      children: () => effectSubmenuItems(actor)
    },
    ...entries
  ];
}

async function effectSubmenuItems(actor) {
  if (!game.user?.isGM || !["digimon", "npc"].includes(String(actor?.type ?? ""))) return [];
  const { DDA_TOKEN_HUD_EFFECT_GROUPS } = await import("./dda-token-hud-effects.js");

  return DDA_TOKEN_HUD_EFFECT_GROUPS.map((group) => {
    const visual = EFFECT_GROUP_VISUALS[group.key] ?? EFFECT_GROUP_VISUALS.unique;
    const activeCount = group.tags.filter((tag) => activeEffectRecord(actor, tag)).length;
    return {
      key: `effect-group:${group.key}`,
      label: text(visual.pt, visual.en),
      tooltip: activeCount
        ? `${text(visual.pt, visual.en)} · ${activeCount} ${text("ativo(s)", "active")}`
        : text(visual.pt, visual.en),
      icon: visual.icon,
      tone: visual.tone,
      active: activeCount > 0,
      cost: activeCount > 0 ? String(activeCount) : "",
      children: () => effectTagSubmenuItems(actor, group)
    };
  });
}

async function submenuItemsForAction(action, actor, token = null) {
  switch (action) {
    case "actions": return actionSubmenuItems(actor);
    case "movement": return movementSubmenuItems(actor, token);
    case "attacks": return attackSubmenuItems(actor);
    case "stats": return actor.type === "character" ? tamerStatSubmenuItems(actor) : digimonStatSubmenuItems(actor);
    case "qualities": return actor.type === "character" ? talentSubmenuItems(actor) : qualitySubmenuItems(actor);
    case "effects": return effectSubmenuItems(actor);
    default: return [];
  }
}

async function toggleRadialSubmenu(root, button, actor, action, token = null) {
  const radial = button?.closest?.(".dda-radial-token-hud");
  if (!radial) return false;

  const existing = radial.querySelector(`.dda-radial-token-hud__submenu[data-parent-action="${CSS.escape(action)}"]`);
  if (existing) {
    clearSubmenu(radial);
    return true;
  }

  const items = await submenuItemsForAction(action, actor, token);
  renderSubmenu(radial, button, items, { page: 0, title: button.dataset.ddaLabel ?? "" });
  return true;
}

async function endActorTurn(actor) {
  const { endDigimonTurn, endTamerTurn } = await import("../combat/end-turn.js");
  if (actor?.type === "character") return endTamerTurn(actor);
  if (actor?.type === "digimon" || actor?.type === "npc") return endDigimonTurn(actor);
  return null;
}

async function handleMovement(token, actor, event) {
  const tracker = game.dda?.movementTracker;
  const session = tracker?.getCurrentMovementSession?.(actor) ?? null;

  if (event.type === "contextmenu" && session?.state === "active") {
    event.preventDefault();
    return tracker?.resetForToken?.(token.document);
  }

  if (session?.state === "active") {
    if (session.kind === "charge-approach") {
      // The existing movement HUD already owns the special CHARGE completion flow.
      const nativeCharge = elementFrom(canvas?.tokens?.hud?.element)?.querySelector?.(".dda-complete-charge");
      if (nativeCharge) return nativeCharge.click();
    }
    return tracker?.finishForToken?.(token.document);
  }

  return openActionMenu(actor);
}

async function changeElevation(token, direction = 1) {
  const current = Number(token?.document?.elevation ?? 0) || 0;
  const step = Number(canvas?.dimensions?.distance ?? canvas?.scene?.grid?.distance ?? 1) || 1;
  return token.document.update({ elevation: current + (step * direction) });
}

async function handleHudAction(hud, root, button, event) {
  const token = getHudToken(hud);
  const actor = getHudActor(hud);
  if (!token || !actor || button.disabled) return;

  const action = String(button.dataset.ddaHudAction ?? "");
  button.classList.add("is-busy");

  try {
    if (!["stats", "attacks", "qualities", "actions", "movement"].includes(action)) {
      clearSubmenu(button.closest?.(".dda-radial-token-hud"));
    }
    switch (action) {
      case "stats":
        await toggleRadialSubmenu(root, button, actor, "stats");
        break;
      case "qualities":
        await toggleRadialSubmenu(root, button, actor, "qualities");
        break;
      case "actions":
        await toggleRadialSubmenu(root, button, actor, "actions");
        break;
      case "attacks":
        await toggleRadialSubmenu(root, button, actor, "attacks");
        break;
      case "target":
        token.setTarget(!token.isTargeted, { releaseOthers: false });
        button.classList.toggle("is-active", token.isTargeted);
        break;
      case "movement":
        await toggleRadialSubmenu(root, button, actor, "movement", token);
        break;
      case "endTurn":
        await endActorTurn(actor);
        await hud.close?.();
        break;
      case "visibility":
        await token.document.update({ hidden: !Boolean(token.document.hidden) });
        break;
      case "elevation":
        await changeElevation(token, event.type === "contextmenu" ? -1 : 1);
        break;
      case "config":
        await token.sheet?.render?.(true);
        break;
      case "effects":
        await toggleRadialSubmenu(root, button, actor, "effects", token);
        break;
      case "combat":
        await token.document.toggleCombatant();
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(`DDA | Radial Token HUD action '${action}' failed.`, error);
  } finally {
    if (button.isConnected) button.classList.remove("is-busy");
  }
}

function suppressRadialEvent(event) {
  const button = event.target.closest?.(".dda-radial-token-hud__button, .dda-radial-token-hud__submenu-button");
  if (!button) return;
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (event.type === "contextmenu") event.preventDefault();
}

function hideLegacyHudChrome(root, radial) {
  if (!root) return;

  // TokenHUD V13 can render several direct children (left/right controls,
  // attribute controls and module additions). The radial HUD replaces their
  // visual chrome, but leaves the DDA effects panel alive as a service.
  for (const child of Array.from(root.children)) {
    if (child === radial) continue;
    if (child.classList?.contains("dda-token-effects-panel")) {
      child.hidden = true;
      child.style.setProperty("display", "none", "important");
      continue;
    }
    child.dataset.ddaRadialHidden = "true";
    child.style.setProperty("display", "none", "important");
  }

  // Modules may append controls inside existing HUD columns after our hook.
  for (const selector of [
    ".col",
    ".dda-movement-hud-controls",
    ".dda-token-effect-toggle"
  ]) {
    root.querySelectorAll(selector).forEach((element) => {
      if (element.closest?.(".dda-radial-token-hud")) return;
      element.style.setProperty("display", "none", "important");
    });
  }
}

function mountRadialTokenHud(hud, html) {
  const root = elementFrom(html) ?? elementFrom(hud?.element);
  const actor = getHudActor(hud);
  const token = getHudToken(hud);
  if (!root || !token || !canUseDdaHud(actor)) return;

  root.querySelector(".dda-radial-token-hud")?.remove();
  root.classList.add("dda-radial-token-hud-enabled");

  const radius = computeRadius(token);
  const radial = document.createElement("div");
  radial.className = "dda-radial-token-hud";
  Object.assign(radial.style, {
    position: "absolute",
    inset: "0",
    overflow: "visible",
    pointerEvents: "none",
    zIndex: "70"
  });
  radial.style.setProperty("--dda-radial-radius", `${radius}px`);
  radial.style.setProperty("--dda-radial-diameter", `${radius * 2}px`);

  const orbit = document.createElement("div");
  orbit.className = "dda-radial-token-hud__orbit";
  radial.append(orbit);

  const specs = buildButtonSpecs({ actor, token, root });
  specs.forEach((spec, index) => radial.append(makeRadialButton(spec, index, radius)));
  root.append(radial);

  for (const eventName of ["pointerdown", "mousedown", "mouseup"]) {
    radial.addEventListener(eventName, suppressRadialEvent, true);
  }

  radial.addEventListener("click", (event) => {
    const button = event.target.closest(".dda-radial-token-hud__button");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void handleHudAction(hud, root, button, event);
  });

  radial.addEventListener("contextmenu", (event) => {
    const button = event.target.closest(".dda-radial-token-hud__button");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void handleHudAction(hud, root, button, event);
  });

  // Movement Tracker registers its HUD hook later during ready. Hide those legacy
  // controls after all renderTokenHUD hooks have had a chance to run.
  window.requestAnimationFrame(() => {
    hideLegacyHudChrome(root, radial);
    root.classList.add("dda-radial-token-hud-finalized");
  });
}

function refreshOpenHud(actor = null) {
  const hud = canvas?.tokens?.hud;
  const boundActor = getHudActor(hud);
  if (!hud?.rendered || !boundActor) return;
  if (actor && boundActor.uuid !== actor.uuid) return;
  void hud.render(false);
}

export function registerDdaRadialTokenHud() {
  if (globalThis.__ddaRadialTokenHudRegistered) return;
  ensureRadialStylesheet();
  globalThis.__ddaRadialTokenHudRegistered = true;

  Hooks.on("renderTokenHUD", (hud, html) => mountRadialTokenHud(hud, html));
  Hooks.on("updateActor", (actor, changed) => {
    if (foundry.utils.hasProperty(changed, "system.effects.active")) {
      const hud = canvas?.tokens?.hud;
      const boundActor = getHudActor(hud);
      const root = elementFrom(hud?.element);
      if (hud?.rendered && boundActor?.uuid === actor.uuid && root) {
        const effectsButton = root.querySelector('[data-dda-hud-action="effects"]');
        effectsButton?.classList.toggle(
          "has-effect-state",
          Array.isArray(actor.system?.effects?.active) && actor.system.effects.active.length > 0
        );
      }
    }
    if (
      foundry.utils.hasProperty(changed, "system.combat.actions") ||
      foundry.utils.hasProperty(changed, "system.combat.stance")
    ) refreshOpenHud(actor);
  });
  Hooks.on("updateToken", () => refreshOpenHud());
  Hooks.on("updateCombat", () => refreshOpenHud());
  Hooks.on("createCombatant", () => refreshOpenHud());
  Hooks.on("deleteCombatant", () => refreshOpenHud());

  console.log("DDA | Radial Token HUD registered.");
}
