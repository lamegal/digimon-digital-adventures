import {
  applyLuckyNumberReward
} from "../rolls/lucky-number.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";

export const QUALITY_ALIASES = {
  hugePower: ["poderbrutal", "hugepower", "poder brutal", "huge power"],
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
  secondWind: ["segundofolêgo", "segundoflego", "secondwind", "second wind"],
  packMaster: ["mestrealcateia", "packmaster", "pack master"],
  elementalForce: ["forcaelemental", "elementalforce", "elemental force"],
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
  savagery: ["selvageria", "savagery"],
  assuredDestruction: ["destruicaogarantida", "assureddestruction", "assured destruction"],
  savagery: ["selvageria", "savagery"],
  assuredDestruction: ["destruicaogarantida", "assureddestruction", "assured destruction"],
  focusedResistance: ["resistenciafocada", "focusedresistance", "focused resistance"],
  immunity: ["imunidade", "immunity"],
  overdrive: ["overdrive"],
  dataScan: ["varreduradedados", "datascan", "data scan"],
  domainControl: ["controlededominio", "domaincontrol", "domain control"],
  conjurer: ["conjurador", "conjurer"],
  summoner: ["invocador", "summoner"],
  omnievoker: ["omnievocador", "omnievoker"],
  algorithm: ["algoritmo", "algorithm"],
  advancedMobility: ["mobilidadeavancada", "advancedmobility", "advanced mobility"],
  sprint: ["sprint", "disparada"],
  elementMaster: ["mestreelemental", "elementmaster", "element master"],
  adaptiveElement: ["elementoadaptativo", "adaptiveelement", "adaptive element"],
  alteredElement: ["elementoalterado", "alteredelement", "altered element"],
  monsterStrength: ["forcademonstro", "monsterstrength", "monster strength"],
  exposingHold: ["agarrãoexpositor", "agarraoexpositor", "exposinghold", "exposing hold"],
  pointBlank: ["queimaroupa", "pointblank", "point blank"],
  slippery: ["escorregadio", "slippery"],
  fastball: ["fastball", "arremessor"],
  giantHijacker: ["sequestradordegigantes", "gianthijacker", "giant hijacker"],
  basicEffect: ["efeitobasico", "basiceffect", "basic effect"],
  advancedEffect: ["efeitoavancado", "advancedeffect", "advanced effect"],
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
  ]
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
  heavy: { type: "negative", stat: "movement", potency: "dos", duration: true },
  nimble: { type: "positive", stat: "accuracyDodge", potency: "bit", duration: true, extraActionCost: 1 },
  sharpen: { type: "positive", stat: "damage", potency: "ram", duration: true },
  sturdy: { type: "positive", stat: "armor", potency: "dos", duration: true },
  burn: { type: "damage", duration: true, requiresDamage: true },
  freeze: { type: "damage", duration: true, requiresDamage: true },
  poison: { type: "damage", duration: true, requiresDamage: true },
  haste: { type: "unique", duration: "special", extraActionCost: 1, alliesOnly: true },
  immune: { type: "unique", duration: true, alliesOnly: true },
  shield: { type: "positive", duration: true, potency: "bit" },
  stun: { type: "unique", duration: true },
  bastion: { type: "positive", duration: true, stat: "accuracyDamageDodgeArmor" },
  drain: { type: "unique" }
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

export function findQuality(actor, aliasKeyOrAliases) {
  return actor?.items?.find?.((item) => qualityMatches(item, aliasKeyOrAliases)) ?? null;
}

export function hasQuality(actor, aliasKeyOrAliases) {
  return Boolean(findQuality(actor, aliasKeyOrAliases));
}

export function getQualityRank(quality) {
  if (!quality) return 0;
  const rank = Math.max(0, Number(quality.system?.rank?.value ?? 1));
  const effectiveMax = Number(quality.system?.rank?.effectiveMax ?? Number.NaN);
  return Number.isFinite(effectiveMax) && effectiveMax >= 0 ? Math.min(rank, effectiveMax) : rank;
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

export function getRoundUseState(actor, bucket, key) {
  const entry = actor?.system?.combat?.qualityAttackUses?.[bucket]?.[key];
  if (!entry) return null;
  if (String(entry.combatId ?? "") !== String(getCombatId())) return null;
  if (Number(entry.round ?? -1) !== getCombatRound()) return null;
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
  return await Dialog.confirm({
    title: title || quality.name,
    content: `<div class="dda-confirm-dialog"><p>${body || quality.name}</p></div>`,
    yes: () => true,
    no: () => false,
    defaultYes
  });
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

export async function rollDerivedCheck(
  actor,
  statKey,
  {
    skillKey = "",
    tn = null,
    title = "",
    manualModifier = 0,
    createChat = true
  } = {}
) {
  const stat =
    actor?.system?.derivedStats
      ?.[statKey];

  if (!actor || !stat) {
    return null;
  }

  const statValue =
    getActorDerivedStat(
      actor,
      statKey
    );

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

  const roll =
    await new Roll(
      "3d6 + @modifier",
      {
        modifier
      }
    ).evaluate();

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

  const total =
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

  const success =
    hasTN
      ? total >= tnValue
      : null;

  const criticalSuccess =
    hasTN
      ? total >= tnValue + 5
      : false;

  const criticalFailure =
    hasTN
      ? total <= tnValue - 5
      : false;

  const outcome =
    !hasTN
      ? "none"
      : criticalSuccess
        ? "criticalSuccess"
        : success
          ? "success"
          : criticalFailure
            ? "criticalFailure"
            : "failure";

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
    luckyNumberResult
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

export async function getLowRerollDeclaration(actor, statKey) {
  const quality = getLowRerollQualityForPool(actor, statKey);
  if (!quality || !canSpendQuality(quality)) return null;
  if (getRoundUseState(actor, `reroll-${statKey}`, quality.id)) return null;
  const limit = getRerollLimitFromQuality(quality);
  const useIt = await promptUseQuality(quality, {
    body: localizeQ("DDA.QualityAutomation.RerollLowPrompt", "Use {quality} to reroll results up to {limit}?", { quality: quality.name, limit }),
    defaultYes: false
  });
  if (!useIt) return null;
  return { quality, rerollResultsUpTo: limit, label: quality.name, bucket: `reroll-${statKey}` };
}

export function getEffectTagData(tag) {
  return EFFECT_TAGS[normalizeKey(String(tag).replace(/^\[|\]$/g, ""))] ?? null;
}

export function areActorsAllies(actorA, actorB) {
  if (!actorA || !actorB) return false;
  if (actorA.uuid === actorB.uuid) return true;
  const dispositionA = Number(actorA.prototypeToken?.disposition ?? actorA.token?.disposition ?? 0);
  const dispositionB = Number(actorB.prototypeToken?.disposition ?? actorB.token?.disposition ?? 0);
  return dispositionA !== 0 && dispositionA === dispositionB;
}

export function clamp(number, min, max) {
  return Math.min(max, Math.max(min, Number(number ?? 0)));
}
