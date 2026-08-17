import {
  applyLuckyNumberReward
} from "../rolls/lucky-number.js";

import {
  applyHackersMemoryDerivedStatModifier
} from "./tamer-talent-transversal.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";

export const QUALITY_ALIASES = {
  weapon: ["arma", "weapon"],
  instinct: ["instinto", "instinct"],
  hugePower: ["poderbrutal", "hugepower", "poder brutal", "huge power"],
  absoluteEvasion: ["evasaoabsoluta", "absoluteevasion", "absolute evasion"],
  avoidance: ["esquiva", "evasiva", "avoidance"],
  vitalEnergy: ["energiavital", "vitalenergy", "energia vital", "vital energy"],
  combatMonster: ["monstrodecombate", "combatmonster", "combat monster"],
  bulletProof: ["aprova deBalas", "aprova de balas", "bulletproof", "bullet proof", "aprova de balas"],
  substitute: ["substituto", "substitute"],
  battleCry: ["gritodeguerra", "battlecry", "battle cry"],
  watchfulHunter: ["cacadorvigilante", "watchfulhunter", "watchful hunter"],
  venomous: ["venenoso", "venomous"],
  brace: ["preparar", "brace"],
  fierceSoul: ["almaferoz", "fiercesoul", "fierce soul"],
  braveHeart: ["coracaovalente", "braveheart", "brave heart"],
  sentryAim: ["mirasentinela", "sentryaim", "sentry aim"],
  secondWind: ["segundofolêgo", "segundoflego", "secondwind", "second wind"],
  packMaster: ["mestrealcateia", "packmaster", "pack master"],
  tumbler: ["acrobata", "tumbler"],
  elementalForce: ["forcaelemental", "elementalforce", "elemental force"],
  elementalMyriad: ["miriadeelemental", "elementalmyriad", "elemental myriad"],
  naturalWeakness: ["fraquezanatural", "naturalweakness", "natural weakness"],
  naturewalk: ["passonatural", "naturewalk", "nature walk"],
  mightyBlow: ["golpepoderoso", "mightyblow", "mighty blow"],
  preciseFocus: ["focopreciso", "precisefocus", "precise focus"],
  feintAttack: ["ataquefinta", "feintattack", "feint attack"],
  punishingStrike: ["golpepunitivo", "punishingstrike", "punishing strike"],
  noEscape: ["naohaescapatoria", "theresnoescape", "thereisnoescape", "there is no escape"],
  counterAttack: ["contraataque", "counterattack", "counter attack"],
  counterblow: ["contragolpe", "counterblow", "counter blow"],
  crossCounter: ["crosscounter", "cross counter"],
  returnFire: ["fogoDeResposta", "retornarFogo", "returnfire", "return fire"],
  instantCounter: ["contrainstantaneo", "instantcounter", "instant counter"],
  lifesteal: ["roubodevida", "lifesteal", "life steal"],
  reload: ["recarregar", "reload"],
  combatAwareness: ["conscienciadecombate", "percepcaodecombate", "combatawareness", "combat awareness"],
  hordeDuelist: ["duelistadehordas", "hordeduelist", "horde duelist"],
  aggressiveFlank: ["flancoagressivo", "aggressiveflank", "aggressive flank"],
  hideInPlainSight: ["ocultarseavistadetodos", "ocultareseavistadetodos", "ocultarseavista", "hideinplainsight", "hide in plain sight"],
  shadeCloak: ["mantodesombras", "shadecloak", "shade cloak"],
  sneakAttack: ["ataquefurtivo", "sneakattack", "sneak attack"],
  areaAttack: ["ataqueemarea", "areaattack", "area attack"],
  armorPiercing: ["perfuracaodearmadura", "perfurante", "armorpiercing", "armor piercing"],
  certainStrike: ["golpecerteiro", "certainstrike", "certain strike"],
  chargeAttack: ["ataquedeinvestida", "chargeattack", "charge attack"],
  ammo: ["municao", "ammo"],
  heavyRecoil: ["recuopesado", "heavyrecoil", "heavy recoil"],
  simplifiedStrike: ["golpesimplificado", "simplifiedstrike", "simplified strike"],
  reach: ["alcance", "reach"],
  zoner: ["zonista", "zoner"],
  savagery: ["selvageria", "savagery"],
  assuredDestruction: ["destruicaogarantida", "assureddestruction", "assured destruction"],
  berserker: ["berserker"],
  boilingBlood: ["sanguefervente", "boilingblood", "boiling blood"],
  focusedResistance: ["resistenciafocada", "focusedresistance", "focused resistance"],
  immunity: ["imunidade", "immunity"],
  systemBoost: ["impulsodesistema", "systemboost", "system boost"],
  teleport: ["teleporte", "teleport"],
  transporter: ["transportador", "transporter"],
  glamor: ["glamour", "glamor"],
  illusionaryOverlay: ["sobreposicaoilusoria", "illusionaryoverlay", "illusionary overlay"],
  technician: ["tecnico", "technician"],
  firewall: ["firewall"],
  trojan: ["trojan"],
  overdrive: ["overdrive"],
  dataScan: ["varreduradedados", "datascan", "data scan"],
  domainControl: ["controlededominio", "domaincontrol", "domain control"],
  conjurer: ["conjurador", "conjurer"],
  summoner: ["invocador", "summoner"],
  omnievoker: ["omnievocador", "omnievoker"],
  algorithm: ["algoritmo", "algorithm"],
  advancedMobility: ["mobilidadeavancada", "advancedmobility", "advanced mobility"],
  sprint: ["arrancada", "sprint", "disparada"],
  elementMaster: ["mestreelemental", "elementmaster", "element master"],
  adaptiveElement: ["elementoadaptavel", "elementoadaptativo", "adaptiveelement", "adaptive element"],
  alteredElement: ["elementoalterado", "alteredelement", "altered element"],
  holyWard: ["protecaosagrada", "holyward", "holy ward"],
  darkEmblem: ["emblemasombrio", "darkemblem", "dark emblem"],
  chaoticBalance: ["equilibriocaotico", "chaoticbalance", "chaotic balance"],
  monsterStrength: ["forcamonstruosa", "forca monstruosa", "forcademonstro", "monsterstrength", "monster strength"],
  exposingHold: ["imobilizacaoexposta", "imobilizacao exposta", "agarraoexpositor", "exposinghold", "exposing hold"],
  pointBlank: ["aqueimaroupa", "a queima roupa", "queimaroupa", "pointblank", "point blank"],
  slippery: ["escorregadio", "slippery"],
  fastball: ["arremessoespecial", "arremesso especial", "fastball", "arremessor"],
  giantHijacker: ["sequestradordegigantes", "sequestrador de gigantes", "gianthijacker", "giant hijacker"],
  titanPower: ["podertitanico", "poder titanico", "titanpower", "titan power"],
  distantForce: ["forcadistante", "forca distante", "distantforce", "distant force"],
  powerThrow: ["arremessopoderoso", "arremesso poderoso", "powerthrow", "power throw"],
  basicEffect: ["efeitobasico", "basiceffect", "basic effect"],
  advancedEffect: ["efeitoavancado", "advancedeffect", "advanced effect"],
  masterEffect: ["efeitomestre", "mastereffect", "master effect"],
  inspiringGuidance: ["orientacaoinspiradora", "inspiringguidance", "inspiring guidance"],

  overclock: [
    "overclock"
  ],

  modeChange: [
    "mudancademodo",
    "mudanca de modo",
    "modechange",
    "mode change"
  ],

  superiorModeChange: [
    "mudancademodosuperior",
    "mudanca de modo superior",
    "superiormodechange",
    "superior mode change"
  ],

  protectingShield: [
    "escudoprotetor",
    "protectingshield",
    "protecting shield"
  ],

  chromeDigizoidArmor: ["armaduradedigizoidecromada", "chromedigizoidarmor", "chrome digizoid armor"],
  cursedDigizoidArmor: ["armaduradedigizoideamaldicoada", "armaduradedigizoideamaldicoada", "curseddigizoidarmor", "cursed digizoid armor"],
  adaptiveDigizoidArmor: ["armaduradedigizoideadaptavel", "adaptivedigizoidarmor", "adaptive digizoid armor"],
  sharpDigizoidArmor: ["armaduradedigizoideafiada", "sharpdigizoidarmor", "sharp digizoid armor"],
  heavyDigizoidArmor: ["armaduradedigizoidepesada", "heavydigizoidarmor", "heavy digizoid armor"],
  flexibleDigizoidArmor: ["armaduradedigizoideflexivel", "flexibledigizoidarmor", "flexible digizoid armor"],
  lightDigizoidArmor: ["armaduradedigizoideleve", "lightdigizoidarmor", "light digizoid armor"],
  shiningDigizoidArmor: ["armaduradedigizoideradiante", "shiningdigizoidarmor", "shining digizoid armor"],

  chromeDigizoidWeaponry: ["armamentodedigizoidecromado", "chromedigizoidweaponry", "chrome digizoid weaponry"],
  cursedDigizoidWeaponry: ["armamentodedigizoideamaldicoado", "curseddigizoidweaponry", "cursed digizoid weaponry"],
  adaptiveDigizoidWeaponry: ["armamentodedigizoideadaptavel", "adaptivedigizoidweaponry", "adaptive digizoid weaponry"],
  sharpDigizoidWeaponry: ["armamentodedigizoideafiado", "sharpdigizoidweaponry", "sharp digizoid weaponry"],
  flexibleDigizoidWeaponry: ["armamentodedigizoideflexivel", "flexibledigizoidweaponry", "flexible digizoid weaponry"],
  heavyDigizoidWeaponry: ["armamentodedigizoidepesado", "heavydigizoidweaponry", "heavy digizoid weaponry"],
  lightDigizoidWeaponry: ["armamentodedigizoideleve", "lightdigizoidweaponry", "light digizoid weaponry"],
  shiningDigizoidWeaponry: ["armamentodedigizoideradiante", "shiningdigizoidweaponry", "shining digizoid weaponry"],
  pureDigizoidWeaponry: ["armamentodedigizoidepuro", "puredigizoidweaponry", "pure digizoid weaponry"],

  overwrite: ["overwrite"],
  undyingInForce: ["inforceimortal", "undyinginforce", "undying inforce"],
  temporalInForce: ["inforcetemporal", "temporalinforce", "temporal inforce"],
  omniscientInForce: ["inforceonisciente", "omniscientinforce", "omniscient inforce"],
  digitalHazard: ["perigodigital", "digitalhazard", "digital hazard"],
  zeroUnit: ["unidadezero", "zerounit", "zero unit"],
  pureOverwrite: ["overwritepuro", "pureoverwrite", "pure overwrite"]
  ,memoryUpgrade: ["melhoriadememoria", "memoryupgrade", "memory upgrade"]
  ,mercifulMode: ["modomisericordioso", "mercifulmode", "merciful mode"]
  ,slayer: ["matador", "slayer"]
  ,violentOverwrite: ["overwriteviolento", "violentoverwrite", "violent overwrite"]
  ,criticalArms: ["armascriticas", "criticalarms", "critical arms"]
  ,luckyMiss: ["errosortudo", "luckymiss", "lucky miss"]
  ,innateTalent: ["talentoinato", "innatetalent", "innate talent"]
  ,vengefulCharge: ["investidavingativa", "vengefulcharge", "vengeful charge"]
  ,justiceIsBlind: ["justicaecega", "justiceisblind", "justice is blind"]
  ,inconsistentSize: ["tamanhoinconsistente", "inconsistentsize", "inconsistent size"]
  ,sealedWeapon: ["armaselada", "sealedweapon", "sealed weapon"]
  ,awakenedInstinct: ["instintodesperto", "awakenedinstinct", "awakened instinct"]
  ,positiveReinforcement: ["reforcopositivo", "positivereinforcement", "positive reinforcement"]
  ,bulky: ["volumoso", "bulky"]
  ,lowVitality: ["baixavitalidade", "lowvitality", "low vitality"]
  ,complexSignature: ["assinaturacomplexa", "complexsignature", "complex signature"]
  ,faultyBattery: ["bateriadefeituosa", "faultybattery", "faulty battery"]
  ,vulnerable: ["vulneravel", "vulnerable"]
  ,fumbledPiercing: ["perfuracaodesastrada", "fumbledpiercing", "fumbled piercing"]
  ,weakenedStrike: ["golpeenfraquecido", "weakenedstrike", "weakened strike"]
  ,indiscriminateTargeting: ["miraindiscriminada", "indiscriminatetargetting", "indiscriminatetargeting"]
  ,underwhelming: ["decepcionante", "underwhelming"]
  ,broadside: ["flancoaberto", "broadside"]
  ,illness: ["doenca", "illness"]
  ,systemError: ["errodesistema", "systemerror", "system error"]
  ,exploitableProgram: ["programaexploravel", "exploitableprogram", "exploitable program"]
  ,boilingPoint: ["pontodeebulicao", "boilingpoint", "boiling point"]
};

export const EFFECT_TAGS = {
  root: { type: "negative", stat: "movement", potency: "bit", duration: true },
  slow: { type: "negative", stat: "dodge", potency: "cpu", duration: true },
  vague: { type: "negative", stat: "accuracy", potency: "bit", duration: true },
  keen: { type: "positive", stat: "accuracy", potency: "bit", duration: true },
  swift: { type: "positive", stat: "dodge", potency: "ram", duration: true },
  tailwind: { type: "positive", stat: "movement", potency: "ram", duration: true },
  cleanse: { type: "unique", duration: false },
  fear: { type: "unique", potency: "dos", duration: true },
  doom: { type: "unique", potency: "dos", duration: true },
  taunt: { type: "unique", potency: "cpu", duration: true },
  pull: { type: "unique", potency: "dos", duration: false },
  push: { type: "unique", potency: "cpu", duration: false },
  confuse: { type: "negative", stat: "highest", potency: "special", duration: true },
  distract: { type: "negative", stat: "accuracyDodge", potency: "ram", duration: true, extraActionCost: 1 },
  dull: { type: "negative", stat: "damage", potency: "cpu", duration: true },
  frail: { type: "negative", stat: "armor", potency: "dos", duration: true },
  heavy: { type: "negative", stat: "movementOptions", potency: "dos", duration: true },
  nimble: { type: "positive", stat: "accuracyDodge", potency: "bit", duration: true, extraActionCost: 1 },
  sharpen: { type: "positive", stat: "damage", potency: "ram", duration: true },
  sturdy: { type: "positive", stat: "armor", potency: "dos", duration: true },
  burn: { type: "damage", duration: true, requiresDamage: true },
  freeze: { type: "damage", duration: true, requiresDamage: true },
  poison: { type: "damage", potency: "special", duration: true },
  haste: { type: "unique", duration: "special", extraActionCost: 1, alliesOnly: true },
  immune: { type: "unique", duration: true, alliesOnly: true },
  shield: { type: "positive", duration: true, potency: "bit" },
  exploit: { type: "negative", stat: "dodgeArmor", potency: "bit", duration: true, extraActionCost: 1 },
  pacify: { type: "negative", stat: "accuracyDamage", potency: "bit", duration: true, extraActionCost: 1 },
  paralyze: { type: "negative", stat: "dodge", potency: "cpu", duration: true, extraActionCost: 1 },
  rattled: { type: "negative", stat: "damageDodge", potency: "cpu", duration: true, extraActionCost: 1 },
  shaken: { type: "negative", stat: "accuracyArmor", potency: "dos", duration: true, extraActionCost: 1 },
  weak: { type: "negative", stat: "damageArmor", potency: "dos", duration: true, extraActionCost: 1 },
  daring: { type: "positive", stat: "accuracyArmor", potency: "bit", duration: true, extraActionCost: 1 },
  fury: { type: "positive", stat: "accuracyDamage", potency: "dos", duration: true, extraActionCost: 1 },
  regen: { type: "positive", potency: "bit", duration: true },
  steady: { type: "positive", stat: "damageDodge", potency: "cpu", duration: true, extraActionCost: 1 },
  strength: { type: "positive", stat: "damageArmor", potency: "dos", duration: true, extraActionCost: 1 },
  vigil: { type: "positive", stat: "dodgeArmor", potency: "bit", duration: true, extraActionCost: 1 },
  vigor: { type: "positive", stat: "dodgeMovement", potency: "ram", duration: true, extraActionCost: 1 },
  ruin: { type: "damage", potency: "bit", duration: true },
  blind: { type: "unique", duration: true },
  deny: { type: "unique", duration: true },
  dot: { type: "unique", duration: true, requiresDamage: true },
  stun: { type: "unique", duration: "special", extraActionCost: 1 },
  bastion: { type: "positive", duration: true, stat: "accuracyDamageDodgeArmor" },
  drain: { type: "unique" },
  charm: { type: "negative", duration: true },
  bug: { type: "negative", duration: true },
  demoralize: { type: "negative", duration: false },
  frenzy: { type: "negative", duration: true },
  invincible: { type: "positive", duration: "special" }
};

export function normalizeKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function localizeQ(key, fallback, data = {}) {
  const value = game?.i18n?.localize?.(key);
  if (value && value !== key) {
    return game.i18n.format ? game.i18n.format(key, data) : value;
  }
  return String(fallback ?? key).replace(/\{(\w+)\}/g, (_, k) => data[k] ?? "");
}

export function getQualitySourceCandidates(item) {
  return [
    item?.system?.sourceId,
    item?.system?.id,
    item?.flags?.[DDA_SYSTEM_ID]?.sourceId,
    item?.name,
    item?.system?.originalName,
    item?.system?.name
  ].map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

export function qualityMatches(item, aliasKeyOrAliases) {
  if (!item || item.type !== "quality") return false;
  const aliases = Array.isArray(aliasKeyOrAliases)
    ? aliasKeyOrAliases
    : QUALITY_ALIASES[aliasKeyOrAliases] ?? [aliasKeyOrAliases];
  const aliasSet = new Set(aliases.map(normalizeKey));
  return getQualitySourceCandidates(item).some((candidate) => aliasSet.has(normalizeKey(candidate)));
}

export function getBossSuppressionSources(actor) {
  const state = actor?.system?.combat?.bossQualities?.suppression ?? {};
  const combatId = String(getCombatId() ?? "");
  if (!combatId || String(state.combatId ?? "") !== combatId) return [];
  return Array.isArray(state.sources) ? state.sources : [];
}

export function isQualitySuppressedByBossState(actor, item) {
  if (!actor || item?.type !== "quality") return false;
  const category = item.system?.category ?? {};
  return getBossSuppressionSources(actor).some((source) => {
    const type = normalizeKey(source?.type ?? "");
    if (type === "static") return Boolean(category.static);
    if (type === "trigger") return Boolean(category.trigger);
    if (type === "attack") return Boolean(category.attack);
    return false;
  });
}

export function findQuality(actor, aliasKeyOrAliases) {
  return actor?.items?.find?.((item) =>
    qualityMatches(item, aliasKeyOrAliases) &&
    !isQualitySuppressedByBossState(actor, item)
  ) ?? null;
}

export function hasQuality(actor, aliasKeyOrAliases) {
  return Boolean(findQuality(actor, aliasKeyOrAliases));
}

export function getQualityRank(quality) {
  if (!quality) return 0;
  const rank = Math.max(0, Number(quality.system?.rank?.value ?? 1));
  const effectiveMax = Number(quality.system?.rank?.effectiveMax ?? Number.NaN);
  /* effectiveMax = 0 representa uma Qualidade sem limite fixo. */
  return Number.isFinite(effectiveMax) && effectiveMax > 0 ? Math.min(rank, effectiveMax) : rank;
}

export function getActorMainStat(actor, statKey, fallback = 0) {
  const stat = actor?.system?.mainStats?.[statKey];
  return Math.max(0, Number(stat?.total ?? stat?.value ?? stat?.base ?? fallback ?? 0));
}

export function getActorDerivedStat(actor, statKey, fallback = 0) {
  const stat = actor?.system?.derivedStats?.[statKey];
  return Math.max(0, Number(stat?.total ?? stat?.value ?? stat?.base ?? fallback ?? 0));
}

export function getActorStageValue(actor) {
  return Math.max(0, Number(actor?.system?.stageValue ?? actor?.system?.stage?.value ?? 0));
}

export function getActorSv(actor) {
  return getActorStageValue(actor);
}

export function getCombatId() {
  return game?.combat?.id ?? "no-combat";
}

export function getCombatRound() {
  return Number(game?.combat?.round ?? 0);
}

export function getCombatTurn() {
  return Number(game?.combat?.turn ?? -1);
}

function getTalentVirtualRound(actor) {
  return Math.max(
    0,
    Math.floor(
      Number(
        actor?.system?.combat?.tamerTalentRoundWindows?.speedSurge?.sequence ??
        0
      )
    )
  );
}

export function getRoundUseState(actor, bucket, key) {
  const entry = actor?.system?.combat?.qualityAttackUses?.[bucket]?.[key];
  if (!entry) return null;
  if (String(entry.combatId ?? "") !== String(getCombatId())) return null;
  if (Number(entry.round ?? -1) !== getCombatRound()) return null;
  if (Number(entry.virtualRound ?? 0) !== getTalentVirtualRound(actor)) return null;
  return entry;
}

export function getCombatUseState(actor, bucket, key) {
  const entry = actor?.system?.combat?.qualityAttackUses?.[bucket]?.[key];
  if (!entry) return null;
  if (String(entry.combatId ?? "") !== String(getCombatId())) return null;
  return entry;
}

export async function setUseState(actor, bucket, key, data = {}) {
  if (!actor || !bucket || !key) return;
  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses[bucket] ??= {};
  qualityAttackUses[bucket][key] = {
    used: true,
    combatId: getCombatId(),
    round: getCombatRound(),
    virtualRound: getTalentVirtualRound(actor),
    turn: getCombatTurn(),
    ...data
  };
  await actor.update({ "system.combat.qualityAttackUses": qualityAttackUses });
}

export async function clearUseState(actor, bucket, key = "") {
  if (!actor || !bucket) return;
  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  if (!qualityAttackUses[bucket]) return;
  if (key) delete qualityAttackUses[bucket][key];
  else qualityAttackUses[bucket] = {};
  await actor.update({ "system.combat.qualityAttackUses": qualityAttackUses });
}

export async function spendQualityUse(actor, quality, options = {}) {
  if (!actor || !quality) return;
  const uses = quality.system?.uses ?? {};
  const update = {};
  if (uses.enabled !== false) {
    const currentValue = Number(uses.value ?? uses.max ?? 0);
    const currentSpent = Number(uses.spent ?? 0);
    update["system.uses.value"] = Math.max(0, currentValue - Number(options.amount ?? 1));
    update["system.uses.spent"] = currentSpent + Number(options.amount ?? 1);
  }
  update["system.uses.lastUsedCombatId"] = getCombatId();
  update["system.uses.lastUsedRound"] = getCombatRound();
  update["system.uses.lastUsedTurn"] = getCombatTurn();

  await actor.updateEmbeddedDocuments("Item", [{ _id: quality.id, ...update }]);

  if (options.bucket) {
    await setUseState(actor, options.bucket, options.key ?? quality.id, options.state ?? {});
  }
}

export function qualityHasUses(quality) {
  return Boolean(quality?.system?.uses?.enabled);
}

export function qualityUsesRemaining(quality) {
  if (!qualityHasUses(quality)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Number(quality.system?.uses?.value ?? 0));
}

export function canSpendQuality(quality) {
  return !qualityHasUses(quality) || qualityUsesRemaining(quality) > 0;
}

export async function promptUseQuality(quality, { title = "", body = "", yes = "Yes", no = "No", defaultYes = false } = {}) {
  if (!quality) return false;
  const { DialogV2 } = foundry.applications.api;
  const confirmed = await DialogV2.confirm({
    window: { title: title || quality.name },
    content: `<div class="dda-confirm-dialog"><p>${body || quality.name}</p></div>`,
    yes: {
      label: yes,
      callback: () => true,
      default: Boolean(defaultYes)
    },
    no: {
      label: no,
      callback: () => false,
      default: !defaultYes
    },
    rejectClose: false,
    modal: true
  });
  return confirmed === true;
}

export function getSelectedChoices(quality) {
  const selectedRanks = Array.isArray(quality?.system?.choices?.selectedRanks) ? quality.system.choices.selectedRanks : [];
  const selected = Array.isArray(quality?.system?.choices?.selected) ? quality.system.choices.selected : [];
  return [...selectedRanks, ...selected]
    .map((choice) => typeof choice === "string" ? { key: choice } : choice)
    .filter((choice) => choice && typeof choice === "object");
}

export function getChoiceKeys(quality) {
  return getSelectedChoices(quality)
    .map((choice) => String(choice.key ?? choice.value ?? choice.id ?? "").trim())
    .filter(Boolean);
}

export function actorHasNaturewalkElement(actor, elementKey = "") {
  const needle = normalizeKey(elementKey);
  if (!needle) return false;
  const elements = actor?.system?.qualityFeatures?.naturewalk?.elements ?? [];
  return elements.some((entry) => normalizeKey(entry) === needle);
}

export function getNaturewalkElements(actor) {
  return actor?.system?.qualityFeatures?.naturewalk?.elements ?? [];
}

export function getElementTagsFromAttack(attackItem) {
  const tags = new Set();
  const all = [
    ...(Array.isArray(attackItem?.system?.qualityTags) ? attackItem.system.qualityTags : []),
    ...(Array.isArray(attackItem?.system?.baseTags?.tags) ? attackItem.system.baseTags.tags : [])
  ];
  for (const tag of all) {
    const normalized = normalizeKey(String(tag).replace(/^t:/i, ""));
    if (["fire", "water", "wind", "earth", "ice", "wood", "steel", "thunder", "darkness", "light"].includes(normalized)) {
      tags.add(normalized);
    }
  }
  return [...tags];
}

export async function maybeUseVariableReroll(actor, roll, {
  source = "check",
  title = ""
} = {}) {
  if (!actor || !roll || !game?.combat?.started) {
    return { roll, used: false, originalResults: [] };
  }

  const variableUses = Math.max(
    0,
    Number(actor.system?.qualityFeatures?.dataOptimization?.variableRerollPerRound ?? 0)
  );
  if (variableUses <= 0) {
    return { roll, used: false, originalResults: [] };
  }

  if (getRoundUseState(actor, "dataOptimization", "variableReroll")) {
    return { roll, used: false, originalResults: [] };
  }

  const originalResults = (roll.dice?.[0]?.results ?? [])
    .filter((result) => result?.active !== false)
    .map((result) => Number(result?.result ?? 0));
  const english = String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
  const useIt = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-core-quality-dialog", "dda-variable-reroll-dialog"],
    position: { width: 500, height: "auto" },
    window: { title: english ? "Data Optimization: Variable" : "Otimização de Dados: Variável" },
    modal: true,
    content: `
      <div class="dda-core-choice-dialog">
        <header class="dda-core-choice-dialog__hero">
          <span>Data Optimization · Variable</span>
          <h2>${foundry.utils.escapeHTML(actor.name)}</h2>
          <p>${english
            ? "Reroll this entire Check? The new result is mandatory, even if it is worse."
            : "Rerrolar este Teste inteiro? O novo resultado será obrigatório, mesmo que seja pior."}</p>
          <div class="dda-dice-results">
            ${originalResults.map((result) => `<span class="dda-die ${result >= 5 ? "success" : "failure"}">${result}</span>`).join("")}
          </div>
        </header>
      </div>
    `,
    buttons: [
      {
        action: "reroll",
        label: english ? "Reroll" : "Rerrolar",
        icon: "fa-solid fa-rotate",
        default: true,
        callback: () => true
      },
      {
        action: "keep",
        label: english ? "Keep result" : "Manter resultado",
        icon: "fa-solid fa-check",
        callback: () => false
      }
    ],
    rejectClose: false,
    close: () => false
  });

  if (!useIt) return { roll, used: false, originalResults };

  await setUseState(actor, "dataOptimization", "variableReroll", {
    source,
    title
  });

  const replacement = await new Roll(
    roll.formula,
    foundry.utils.deepClone(roll.data ?? {})
  ).evaluate();

  return {
    roll: replacement,
    used: true,
    originalResults,
    replacementResults: (replacement.dice?.[0]?.results ?? [])
      .filter((result) => result?.active !== false)
      .map((result) => Number(result?.result ?? 0))
  };
}

export async function rollDerivedCheck(
  actor,
  statKey,
  {
    skillKey = "",
    tn = null,
    title = "",
    manualModifier = 0,
    createChat = true,
    targetActor = null,
    applyHackersMemory = true
  } = {}
) {
  const stat =
    actor?.system?.derivedStats
      ?.[statKey];

  if (!actor || !stat) {
    return null;
  }

  const baseStatValue =
    getActorDerivedStat(
      actor,
      statKey
    );

  const statValue = applyHackersMemory
    ? applyHackersMemoryDerivedStatModifier(
        actor,
        targetActor,
        baseStatValue
      )
    : baseStatValue;

  const hackersMemoryModifier =
    statValue - baseStatValue;

  const skillBonusData =
    skillKey
      ? actor.system?.skillBonuses
          ?.[skillKey]
      : null;

  const skillBonus =
    Number(
      skillBonusData?.value ?? 0
    );

  const modifier =
    statValue +
    skillBonus +
    Number(
      manualModifier ?? 0
    );

  let roll =
    await new Roll(
      "3d6 + @modifier",
      {
        modifier
      }
    ).evaluate();

  const variableReroll = await maybeUseVariableReroll(actor, roll, {
    source: `derivedCheck:${statKey}`,
    title
  });
  roll = variableReroll.roll;

  const diceResults =
    (
      roll.dice?.[0]
        ?.results ?? []
    )
      .filter((result) => {
        return result.active !== false;
      })
      .map((result) => {
        return Number(
          result.result ?? 0
        );
      });

  let total =
    Number(
      roll.total ?? 0
    );

  const hasTN =
    Number.isFinite(
      Number(tn)
    );

  const tnValue =
    hasTN
      ? Number(tn)
      : null;

  let success =
    hasTN
      ? total >= tnValue
      : null;

  let criticalSuccess =
    hasTN
      ? total >= tnValue + 5
      : false;

  let criticalFailure =
    hasTN
      ? total <= tnValue - 5
      : false;

  let outcome =
    !hasTN
      ? "none"
      : criticalSuccess
        ? "criticalSuccess"
        : success
          ? "success"
          : criticalFailure
            ? "criticalFailure"
            : "failure";

  const { maybeApplyTakeTheLead } = await import(
    "./tamer-talent-attack-direct.js"
  );

  const takeTheLead = await maybeApplyTakeTheLead(actor, {
    title,
    total,
    tn: tnValue,
    outcome
  });

  if (takeTheLead?.used) {
    total += Number(takeTheLead.bonus ?? 5);
    success = hasTN ? total >= tnValue : null;
    criticalSuccess = hasTN ? total >= tnValue + 5 : false;
    criticalFailure = hasTN ? total <= tnValue - 5 : false;
    outcome = !hasTN
      ? "none"
      : criticalSuccess
        ? "criticalSuccess"
        : success
          ? "success"
          : criticalFailure
            ? "criticalFailure"
            : "failure";
  }

  const statLabel =
    localizeQ(
      `DDA.DerivedStat.${String(
        statKey
      ).toUpperCase()}`,

      String(
        statKey
      ).toUpperCase()
    );

  const skillLine =
    skillKey
      ? `
        <li>
          ${localizeQ(
            "DDA.Label.Skill",
            "Skill"
          )}:

          <strong>
            ${skillBonusData?.label ?? skillKey}
            ${skillBonus >= 0 ? "+" : ""}
            ${skillBonus}
          </strong>.
        </li>
      `
      : "";

  if (createChat) {
    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor
        }),

      rolls: [roll],

      content: `
        <div class="dda-chat-card dda-effect-card effect-special dda-derived-check-card ${outcome}">
          <h2>
            ${
              title ||
              localizeQ(
                "DDA.QualityAutomation.Check",
                "Quality Check"
              )
            }
          </h2>

          <ul class="dda-effect-list">
            <li>
              ${localizeQ(
                "DDA.Label.DerivedStat",
                "Derived Stat"
              )}:

              <strong>
                ${statLabel}
                ${statValue}
              </strong>.
            </li>

            ${skillLine}

            ${hackersMemoryModifier !== 0 ? `
              <li>
                <strong>Hacker’s Memory:</strong>
                ${hackersMemoryModifier > 0 ? "+" : ""}${hackersMemoryModifier}
                ${localizeQ(
                  "DDA.Label.DerivedStat",
                  "Derived Stat"
                )}.
              </li>
            ` : ""}

            ${variableReroll.used ? `
              <li>
                <strong>Variable:</strong>
                ${localizeQ("DDA.QualityAutomation.VariableRerollUsed", "The original Check was rerolled and replaced by this result.")}
              </li>
            ` : ""}

            ${takeTheLead?.used ? `
              <li>
                <strong>Take the Lead — NOW FOCUS:</strong>
                +${Number(takeTheLead.bonus ?? 5)}
                (${takeTheLead.tamerName ?? "Tamer"}).
              </li>
            ` : ""}

            <li>
              ${localizeQ(
                "DDA.Roll.TN",
                "TN"
              )}:

              <strong>
                ${hasTN ? tnValue : "—"}
              </strong>.
            </li>

            <li>
              ${localizeQ(
                "DDA.Roll.Total",
                "Total"
              )}:

              <strong>
                ${total}
              </strong>.
            </li>

            <li>
              ${localizeQ(
                "DDA.Roll.Result",
                "Result"
              )}:

              <strong>
                ${localizeQ(
                  `DDA.Check.${
                    outcome[0]
                      ?.toUpperCase?.() ??
                    "N"
                  }${outcome.slice(1)}`,

                  outcome
                )}
              </strong>.
            </li>
          </ul>
        </div>
      `
    });
  }

  const luckyNumberResult =
    await applyLuckyNumberReward(
      actor,
      diceResults,
      {
        source:
          `derivedCheck:${statKey}`,

        createChat
      }
    );

  return {
    roll,
    total,

    tn:
      tnValue,

    outcome,

    success:
      Boolean(success),

    criticalSuccess,
    criticalFailure,

    diceResults,
    luckyNumberResult,
    variableReroll,
    takeTheLead
  };
}

export function getLowRerollQualityForPool(actor, statKey) {
  if (statKey === "dodge") return findQuality(actor, "avoidance");
  if (statKey === "health") return findQuality(actor, "vitalEnergy");
  return null;
}

export function getRerollLimitFromQuality(quality) {
  return Math.min(2, Math.max(1, getQualityRank(quality)));
}

export async function getLowRerollDeclaration(actor, statKey, {
  diceResults = [],
  protectedDiceStart = diceResults.length
} = {}) {
  const gainForce = statKey === "health" && hasQuality(actor, "undyingInForce")
    ? { quality: findQuality(actor, "undyingInForce"), support: findQuality(actor, "vitalEnergy"), bucket: "gain-force-health" }
    : statKey === "accuracy" && hasQuality(actor, "temporalInForce")
      ? { quality: findQuality(actor, "temporalInForce"), support: findQuality(actor, "hugePower"), bucket: "gain-force-accuracy" }
      : statKey === "dodge" && hasQuality(actor, "omniscientInForce")
        ? { quality: findQuality(actor, "omniscientInForce"), support: findQuality(actor, "avoidance"), bucket: "gain-force-dodge" }
        : null;
  const quality = gainForce?.quality ?? getLowRerollQualityForPool(actor, statKey);
  if (!quality || (!gainForce && !canSpendQuality(quality))) return null;
  const bucket = gainForce?.bucket ?? `reroll-${statKey}`;
  if (getRoundUseState(actor, bucket, quality.id)) return null;

  const limit = gainForce
    ? gainForce.support
      ? Math.min(3, 1 + Math.max(1, getQualityRank(gainForce.support)))
      : 1
    : getRerollLimitFromQuality(quality);
  const rerollValuesLabel = limit <= 1
    ? "1"
    : limit === 2
      ? (String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "1 or 2" : "1 ou 2")
      : (String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "1, 2 or 3" : "1, 2 ou 3");
  const eligible = (Array.isArray(diceResults) ? diceResults : [])
    .map((result, index) => ({
      index,
      value: Number(result?.result ?? 0)
    }))
    .filter((entry) => (
      entry.index < Math.max(0, Number(protectedDiceStart ?? diceResults.length)) &&
      entry.value > 0 &&
      entry.value <= limit
    ));

  /*
   * Avoidance/Vital Energy only opens after the roll and only when there is
   * at least one eligible die. Tamer-granted bonus dice remain protected.
   */
  if (!eligible.length) return null;

  const english = String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
  const useIt = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-area-attack-dialog", "dda-defensive-quality-window"],
    window: { title: quality.name },
    content: `<div class="dda-confirm-dialog dda-defensive-quality-dialog">
      <p>${english
        ? `Reroll <strong>${eligible.length}</strong> eligible die/dice showing ${rerollValuesLabel}? The new results are final.`
        : `Rerrolar <strong>${eligible.length}</strong> dado(s) elegível(is) mostrando ${rerollValuesLabel}? Os novos resultados serão definitivos.`}</p>
    </div>`,
    yes: { label: english ? "Reroll" : "Rerrolar" },
    no: { label: english ? "Keep results" : "Manter resultados" },
    rejectClose: false,
    modal: true
  });

  if (!useIt) return null;
  return {
    quality,
    rerollResultsUpTo: limit,
    label: quality.name,
    bucket,
    spendItemUse: !gainForce,
    eligibleCount: eligible.length
  };
}

export function getEffectTagData(tag) {
  return EFFECT_TAGS[normalizeKey(String(tag).replace(/^\[|\]$/g, ""))] ?? null;
}

function actorIsCharmedBy(target, caster) {
  if (!target || !caster) return false;
  return (Array.isArray(target?.system?.effects?.active) ? target.system.effects.active : [])
    .some((effect) => normalizeKey(String(effect?.tag ?? "").replace(/^\[|\]$/g, "")) === "charm" && String(effect?.sourceActorUuid ?? "") === String(caster?.uuid ?? ""));
}

export function areActorsAllies(actorA, actorB) {
  if (!actorA || !actorB) return false;
  if (actorA.uuid === actorB.uuid) return true;

  const combatantFor = (actor) => game?.combat?.combatants?.find((combatant) =>
    combatant.actor?.uuid === actor.uuid || combatant.actor?.id === actor.id
  );
  const combatantA = combatantFor(actorA);
  const combatantB = combatantFor(actorB);
  const sideA = String(
    combatantA?.getFlag?.(game.system.id, "initiative.side")
      ?? combatantA?.flags?.[game.system.id]?.initiative?.side
      ?? actorA.system?.combat?.initiative?.side
      ?? ""
  );
  const sideB = String(
    combatantB?.getFlag?.(game.system.id, "initiative.side")
      ?? combatantB?.flags?.[game.system.id]?.initiative?.side
      ?? actorB.system?.combat?.initiative?.side
      ?? ""
  );
  if (sideA && sideB) return sideA === sideB;

  const tokenDisposition = (actor, combatant) => Number(
    combatant?.token?.disposition
      ?? combatant?.token?.document?.disposition
      ?? canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === actor.uuid)?.document?.disposition
      ?? actor.prototypeToken?.disposition
      ?? actor.token?.disposition
      ?? 0
  );
  const dispositionA = tokenDisposition(actorA, combatantA);
  const dispositionB = tokenDisposition(actorB, combatantB);
  return dispositionA !== 0 && dispositionA === dispositionB;
}

/**
 * Directional ally relationship used only while resolving Qualities. [CHARM]
 * does not change combat sides or ordinary targeting: the affected Target
 * merely treats its Caster as an Ally for its own Qualities.
 */
export function areActorsAlliesForQualities(actor, other) {
  return areActorsAllies(actor, other) || actorIsCharmedBy(actor, other);
}

export function clamp(number, min, max) {
  return Math.min(max, Math.max(min, Number(number ?? 0)));
}
