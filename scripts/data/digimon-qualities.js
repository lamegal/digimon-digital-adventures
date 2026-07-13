import {
  localizeDigimonQualityPresentation
} from "./dda-quality-display-localization.js";




function normalizeQualityAutomationData(quality) {
  const next = globalThis.foundry?.utils?.deepClone ? globalThis.foundry.utils.deepClone(quality) : JSON.parse(JSON.stringify(quality));
  const id = String(next.id ?? "");
  next.grants ??= {};
  next.attackModifier ??= {};

  next.grants.mainStats ??= {};
  next.grants.miscStats ??= {};
  next.grants.derivedStats ??= {};
  next.grants.automaticSuccesses ??= {};

const applyLegacyMainStatGrant = (legacyKey, statKey) => {
  if (next.grants?.[legacyKey] === undefined) return;

  const legacyValue = Number(next.grants[legacyKey] ?? 0);
  const canonicalValue = Number(next.grants.mainStats?.[statKey] ?? 0);

  if (legacyValue === 0) return;
  if (canonicalValue !== 0) return;

  next.grants.mainStats[statKey] = legacyValue;
};

const applyLegacyMiscStatGrant = (legacyKey, statKey) => {
  if (next.grants?.[legacyKey] === undefined) return;

  const legacyValue = Number(next.grants[legacyKey] ?? 0);
  const canonicalValue = Number(next.grants.miscStats?.[statKey] ?? 0);

  if (legacyValue === 0) return;
  if (canonicalValue !== 0) return;

  next.grants.miscStats[statKey] = legacyValue;
};

const applyLegacyDerivedStatGrant = (legacyKey, statKey) => {
  if (next.grants?.[legacyKey] === undefined) return;

  const legacyValue = Number(next.grants[legacyKey] ?? 0);
  const canonicalValue = Number(next.grants.derivedStats?.[statKey] ?? 0);

  if (legacyValue === 0) return;
  if (canonicalValue !== 0) return;

  next.grants.derivedStats[statKey] = legacyValue;
};

  applyLegacyMainStatGrant("armorBonus", "armor");
  applyLegacyMainStatGrant("healthBonus", "health");
  applyLegacyMainStatGrant("dodgeBonus", "dodge");

  applyLegacyMiscStatGrant("movementBonus", "movement");
  applyLegacyMiscStatGrant("movementPenalty", "movement");

  applyLegacyDerivedStatGrant("bitBonus", "bit");
  applyLegacyDerivedStatGrant("dosBonus", "dos");
  applyLegacyDerivedStatGrant("ramBonus", "ram");
  applyLegacyDerivedStatGrant("cpuBonus", "cpu");

  if (next.grants.automaticDodgeSuccesses !== undefined && next.grants.automaticSuccesses.dodge === undefined) {
    const value = Number(next.grants.automaticDodgeSuccesses ?? 0);
    if (value !== 0) {
      next.grants.automaticSuccesses.dodge = value;
    }
  }

  if (id === "instinto") {
    next.grants.mainStatsPerRank ??= {};
    next.grants.miscStats ??= {};
    next.grants.mainStatsPerRank.dodge = Number(next.grants.mainStatsPerRank.dodge ?? next.grants.derivedStats?.dodgePerRank ?? 1);
    next.grants.mainStatsPerRank.health = Number(next.grants.mainStatsPerRank.health ?? next.grants.derivedStats?.healthPerRank ?? 1);
    next.grants.miscStats.movementPerRank = Number(next.grants.miscStats.movementPerRank ?? next.grants.derivedStats?.movementPerRank ?? 1);
  }

  if (id === "evasaoAbsoluta") {
    next.grants.automaticSuccesses ??= {};
    next.grants.automaticSuccesses.dodgePerRank = Number(next.grants.automaticSuccesses.dodgePerRank ?? next.grants.automaticDodgeSuccessesPerRank ?? 1);
  }

if (id === "arma") {
  next.choices = {
    ...(next.choices ?? {}),
    required: true,
    type: "attackTag",
    options: Array.isArray(next.choices?.options) ? next.choices.options : []
  };

  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "differentAttackPerRank";
  next.attackModifier.grantsTags = ["weapon"];
  next.attackModifier.accuracyBonusPerRank = Number(next.attackModifier.accuracyBonusPerRank ?? 1);
  next.attackModifier.damageBonusPerRank = Number(next.attackModifier.damageBonusPerRank ?? 1);
}

if (id === "golpeCerteiro") {
  next.cost ??= {};
  next.cost.dp = 2;
  next.cost.perRank = true;

  next.choices = {
    ...(next.choices ?? {}),
    required: true,
    type: "singleAttack",
    label: next.choices?.label || "Ataque com [CERTAIN]",
    options: Array.isArray(next.choices?.options) ? next.choices.options : []
  };

  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "oneDamageAttack";
  next.attackModifier.grantsTags = ["certain"];
  next.attackModifier.automaticSuccessesPerRank = 1;
  next.attackModifier.signatureBatteryAutomaticSuccessThreshold = 2;
  next.attackModifier.signatureBatteryAutomaticSuccessBonus = 1;
  next.attackModifier.cannotShareWithTagsUnlessSignatureMove = ["piercing"];

  next.statRankRequirement = {
    enabled: true,
    statType: "mainStats",
    stat: "accuracy",
    labelKey: "DDA.MainStat.Accuracy",
    thresholds: {
      1: 4,
      2: 8,
      3: 12
    }
  };

  next.requirements = {
    ...(next.requirements ?? {}),
    text: "Requer Acerto Total 4 para Rank 1, Acerto Total 8 para Rank 2 e Acerto Total 12 para Rank 3."
  };

  next.incompatible = {
    ...(next.incompatible ?? {}),
    text: "[CERTAIN] e [PIERCING] não podem ser aplicadas ao mesmo ataque, a menos que ambas sejam aplicadas ao Movimento Assinatura."
  };

  next.effect = "Na primeira compra, aplique a Tag [CERTAIN] a um ataque [DAMAGE]. Um ataque com [CERTAIN] recebe Sucessos automáticos iguais aos Ranks nesta Qualidade. [CERTAIN] só pode ser aplicada a um ataque por Digimon. Se [CERTAIN] for aplicada a um Movimento Assinatura e o Digimon tiver 2 Bateria ou mais, o ataque recebe +1 Sucesso automático adicional.";

  next.description = "Golpe Certeiro torna um ataque [DAMAGE] específico mais confiável, concedendo Sucessos automáticos à rolagem de Acerto.";
}

if (id === "perfuracaoDeArmadura") {
  next.cost ??= {};
  next.cost.dp = 2;
  next.cost.perRank = true;

  next.choices = {
    ...(next.choices ?? {}),
    required: true,
    type: "singleAttack",
    label: next.choices?.label || "Ataque com [PIERCING]",
    options: Array.isArray(next.choices?.options) ? next.choices.options : []
  };

  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "oneDamageAttack";
  next.attackModifier.grantsTags = ["piercing"];
  next.attackModifier.cannotShareWithTagsUnlessSignatureMove = ["certain"];

  delete next.attackModifier.piercingUnalterablePerLeftoverSuccess;
  delete next.attackModifier.piercingUnalterableMaxPerRank;

  next.attackModifier.piercingUnalterableDamagePerRank = 2;
  next.attackModifier.piercingUnalterableDamageAreaPerRank = 1;
  next.attackModifier.signatureBatteryDamageCanBecomeUnalterable = true;

  next.statRankRequirement = {
    enabled: true,
    statType: "mainStats",
    stat: "damage",
    labelKey: "DDA.MainStat.Damage",
    thresholds: {
      1: 4,
      2: 8,
      3: 12
    }
  };

  next.requirements = {
    ...(next.requirements ?? {}),
    text: "Requer Dano Total 4 para Rank 1, Dano Total 8 para Rank 2 e Dano Total 12 para Rank 3."
  };

  next.incompatible = {
    ...(next.incompatible ?? {}),
    text: "[PIERCING] e [CERTAIN] não podem ser aplicadas ao mesmo ataque, a menos que ambas sejam aplicadas ao Movimento Assinatura."
  };

  next.effect = "Na primeira compra, aplique a Tag [PIERCING] a um ataque [DAMAGE]. Um ataque com [PIERCING] causa Dano Inalterável em um acerto igual a 2 vezes os Ranks nesta Qualidade, ou igual aos Ranks em um Ataque de Área. [PIERCING] só pode ser aplicada a um ataque por Digimon. Se [PIERCING] for aplicada a um Movimento Assinatura, a Bateria adicionada ao Dano do ataque pode ser Dano Inalterável em vez disso, até os Ranks nesta Qualidade, escolhido quando a Tag é aplicada ao ataque.";

  next.description = "Perfuração de Armadura permite que um ataque [DAMAGE] específico atravesse defesas e cause Dano Inalterável fixo em acertos.";
}

if (id === "ataqueDeInvestida") {
  next.choices = {
    ...(next.choices ?? {}),
    required: true,
    type: "singleAttack",
    options: Array.isArray(next.choices?.options) ? next.choices.options : []
  };

  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "oneMeleeAttack";
  next.attackModifier.grantsTags = ["charge"];
  next.attackModifier.chargeMoveWithAttack = true;
  next.attackModifier.signatureBatteryMoveBonus = true;
}

if (id === "municao") {
  next.choices = {
    ...(next.choices ?? {}),
    required: true,
    type: "singleAttack",
    options: Array.isArray(next.choices?.options) ? next.choices.options : []
  };

  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "oneAttack";
  next.attackModifier.grantsTags = ["ammo"];
  next.attackModifier.ignoresAttackPerRoundLimit = true;
  next.attackModifier.oncePerCombat = true;
  next.attackModifier.cannotApplyToSignatureMove = true;
}

if (id === "recuoPesado") {
  next.choices = {
    ...(next.choices ?? {}),
    required: true,
    type: "singleAttack",
    options: Array.isArray(next.choices?.options) ? next.choices.options : []
  };

  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "oneRangedAttack";
  next.attackModifier.grantsTags = ["recoil"];
  next.attackModifier.rangeMultiplier = 0.5;
  next.attackModifier.effectiveLimitMultiplier = 0.5;
  next.attackModifier.ignoreAdjacentAccuracyPenalty = true;
  next.attackModifier.selfPushByStage = true;
  next.attackModifier.targetPushOnDamageHit = true;
  next.attackModifier.cannotUseInSentryStance = true;
  next.attackModifier.signatureBatteryPushBonus = true;
}

if (id === "poderBrutal") {
  next.activation = { ...(next.activation ?? {}), enabled: true, active: false, mode: "instant", chatMessage: next.activation?.chatMessage || "Reroll low results in an Accuracy Pool." };
  next.uses = { ...(next.uses ?? {}), enabled: true, value: Number(next.uses?.value ?? 1), max: Number(next.uses?.max ?? 1), recharge: "round" };
  next.reroll = { pool: "accuracy", rerollResultsUpToPerRank: 1, maxRerollResultsUpTo: 2 };
}

if (id === "flancoAgressivo") {
  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "all";
  next.attackModifier.aggressiveFlankAccuracyFrom = "ram";
}

if (id === "contraAtaque") {
  next.activation = { ...(next.activation ?? {}), enabled: true, active: false, mode: "instant", chatMessage: next.activation?.chatMessage || "Use an Interrupt Action to counterattack after an enemy misses you." };
  next.uses = { ...(next.uses ?? {}), enabled: true, value: Number(next.uses?.value ?? 1), max: Number(next.uses?.max ?? 1), recharge: "combat" };
  next.usesFormula = { ...(next.usesFormula ?? {}), valueFromRank: true, valuePerRank: 1, recharge: "combat" };
}

if (id === "duelistaDeHordas") {
  next.activation = { ...(next.activation ?? {}), enabled: true, active: false, mode: "instant", chatMessage: next.activation?.chatMessage || "Spend 1 Action and roll BIT (Survival) against adjacent enemies." };
  next.trigger = { ...(next.trigger ?? {}), actionCost: "1", check: { stat: "bit", skill: "survival", tnFormula: "10 + highest adjacent enemy Stage + adjacent enemies" } };
}

if (id === "ocultarAVista") {
  next.activation = { ...(next.activation ?? {}), enabled: true, active: false, mode: "instant", chatMessage: next.activation?.chatMessage || "Spend 1 Action to attempt a Stealth Check while in view." };
  next.trigger = { ...(next.trigger ?? {}), actionCost: "1", frequency: "turn" };
  next.grants.hideInPlainSight = true;
}

if (id === "mantoDeSombras") {
  next.activation = { ...(next.activation ?? {}), enabled: true, active: false, mode: "instant", chatMessage: next.activation?.chatMessage || "When rolling RAM (Stealth), spend +1 Action to share the result with allies in range." };
  next.trigger = { ...(next.trigger ?? {}), actionCost: "1" };
  next.grants.shadeCloak = true;
}

if (id === "ataqueFurtivo") {
  next.choices = { ...(next.choices ?? {}), required: true, type: "singleAttack", options: Array.isArray(next.choices?.options) ? next.choices.options : [] };
  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "oneAttack";
  next.attackModifier.grantsTags = ["sneak"];
  next.attackModifier.sneakAttack = true;
  next.attackModifier.rangeExtraActionCost = 1;
}

if (id === "golpeSimplificado") {
  next.choices = { ...(next.choices ?? {}), required: true, type: "singleAttack", options: Array.isArray(next.choices?.options) ? next.choices.options : [] };
  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "oneAttack";
  next.attackModifier.grantsTags = ["simple"];
  next.attackModifier.actionCostReduction = 1;
  next.attackModifier.actionCostMinimum = 1;
}

if (id === "gritoDeGuerra") {
  next.activation = { ...(next.activation ?? {}), enabled: true, active: false, mode: "instant", chatMessage: next.activation?.chatMessage || "Spend 1 Action and roll DOS (Bravery) to grant [BASTION] to allies in range." };
  next.trigger = { ...(next.trigger ?? {}), actionCost: "1", check: { stat: "dos", skill: "bravery", tnFormula: "10 + highest enemy SV + enemies in combat" } };
}

if (id === "cacadorVigilante") {
  next.activation = { ...(next.activation ?? {}), enabled: true, active: false, mode: "instant", chatMessage: next.activation?.chatMessage || "Use Watchful Hunter to study a target with DOS (Awareness)." };
  next.trigger = { ...(next.trigger ?? {}), actionCost: "free/2", frequency: "round", check: { stat: "dos", skill: "awareness", tnFormula: "12 + target RAM" } };
  next.grants.watchfulHunter = true;
}

if (id === "venenoso") {
  next.choices = { ...(next.choices ?? {}), required: true, type: "singleAttack", options: Array.isArray(next.choices?.options) ? next.choices.options : [] };
  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "oneDamageAttack";
  next.attackModifier.grantsTags = ["venom"];
  next.attackModifier.venomous = true;
  next.attackModifier.cannotShareWithTags = ["poison"];
}

if (id === "alcance") {
  const selected = Array.isArray(next.choices?.selectedRanks) ? next.choices.selectedRanks[0] : null;
  const reachMode = selected?.key || next.choices?.selected?.[0]?.key || "wideSwings";
  next.choices = {
    ...(next.choices ?? {}),
    required: true,
    type: "single",
    options: Array.isArray(next.choices?.options) && next.choices.options.length ? next.choices.options : [
      { key: "wideSwings", label: "Golpes Amplos", originalLabel: "Wide Swings" },
      { key: "longArms", label: "Braços Longos", originalLabel: "Long Arms" },
      { key: "extendedGrapple", label: "Agarrão Estendido", originalLabel: "Extended Grapple" }
    ]
  };
  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "melee";
  next.attackModifier.reachMode = reachMode;
  next.attackModifier.reachBonusPerRank = 1;
}

if (id === "areaDeAtaque") {
  next.choices = { ...(next.choices ?? {}), required: true, type: "attackTag", cannotRepeat: true, options: Array.isArray(next.choices?.options) ? next.choices.options : [] };
  next.attackModifier.enabled = true;
  next.attackModifier.appliesTo = "differentAttackPerRank";
  next.attackModifier.areaAttack = true;
  next.attackModifier.grantsTags = ["t:blast", "t:burst", "t:cone", "t:line", "t:pass", "t:wave"];
}

if (id === "zonista") {
  next.grants.zoner = true;
}

/* ----------------------------------------------------- */
/* Conjurer / Summoner / Omnievoker                      */
/* ----------------------------------------------------- */

if (id === "conjurador") {
  const english = isEnglishLanguage();

  next.name = english
    ? "Conjurer"
    : "Conjurador";

  next.originalName = "Conjurer";
  next.section = "Omnievoker Qualities";

  next.category = {
    ...(next.category ?? {}),
    trigger: true,
    static: true
  };

  next.cost = {
    ...(next.cost ?? {}),
    dp: 1,
    perRank: true
  };

  next.rank = {
    ...(next.rank ?? {}),
    value: 1,
    max: 3,
    limited: true
  };

  next.requirements = {
    text: english
      ? "Requires Champion."
      : "Requer Adulto.",

    qualityNames: ""
  };

  next.incompatible = {
    text: english
      ? "Incompatible with Combat Monster, Positive Reinforcement, and Showstopper."
      : "Incompatível com Monstro de Combate, Reforço Positivo e Showstopper.",

    qualityNames: english
      ? "Combat Monster, Positive Reinforcement, Showstopper"
      : "Monstro de Combate, Reforço Positivo, Showstopper"
  };

  next.requiredFor = [
    "Omnievoker"
  ];

  next.choices = {
    required: true,
    type: "perRank",

    label: english
      ? "Structure"
      : "Estrutura",

    cannotRepeat: true,
    repeatOnRankIncrease: true,

    options: [
      {
        key: "wallsAndPillars",

        label: english
          ? "Walls and Pillars"
          : "Paredes e Pilares",

        originalLabel: "Walls and Pillars",

        masteryCost: 1,
        woundBoxesPerSpace: 1,
        damageThresholdFrom: "dos",

        effect: english
          ? "Spend 1 Mastery per occupied space to create pillars up to DOS spaces high. Adjacent pillars form walls of up to 4 spaces. Each pillar has 1 Wound Box."
          : "Gaste 1 Mastery por espaço ocupado para criar pilares com até DOS espaços de altura. Pilares adjacentes formam paredes de até 4 espaços. Cada pilar possui 1 Caixa de Ferimento."
      },

      {
        key: "platforms",

        label: english
          ? "Platforms"
          : "Plataformas",

        originalLabel: "Platforms",

        masteryCost: 2,
        width: 2,
        height: 1,
        woundBoxes: 2,
        damageThresholdFrom: "dos",

        effect: english
          ? "Spend 2 Mastery to create a 2-space-wide, 1-space-high Platform anywhere, including in mid-air. It may become Basic or Difficult Terrain of a Naturewalk Element you possess."
          : "Gaste 2 Mastery para criar uma Plataforma de 2 espaços de largura e 1 de altura em qualquer lugar, inclusive no ar. Ela pode se tornar Terreno Básico ou Difícil de um Elemento de Passo Natural que você possua."
      },

      {
        key: "terrain",

        label: english
          ? "Terrain"
          : "Terreno",

        originalLabel: "Terrain",

        masteryCost: 2,
        existingElementMasteryCost: 1,
        dangerousTerrainExtraCost: 1,
        woundBoxesPerSpace: 1,
        damageThresholdFrom: "dos",

        requirements: {
          mode: "all",

          qualityNames: english
            ? "Element Master"
            : "Mestre Elemental"
        },

        effect: english
          ? "Requires Element Master. Convert 1 surface or aerial space into Difficult Terrain for 2 Mastery, or 1 if the Element already exists there. Spend +1 Mastery to make it Dangerous Terrain."
          : "Requer Mestre Elemental. Converta 1 espaço de superfície ou aéreo em Terreno Difícil por 2 Mastery, ou 1 se o Elemento já existir ali. Gaste +1 Mastery para torná-lo Terreno Perigoso."
      }
    ]
  };

  next.grants = {
    ...(next.grants ?? {}),

    resource: {
      key: "mastery",
      label: "Mastery",

      valueFormula:
        "bit + 2 * (conjurerRanks + summonerRanks)",

      maxFormula:
        "bit + 2 * (conjurerRanks + summonerRanks)"
    }
  };

  next.activation = {
    ...(next.activation ?? {}),

    enabled: true,
    active: false,
    mode: "action",

    actionCostOptions: [
      1,
      2
    ],

    chatMessage: english
      ? "Use Conjure with 1 Action for half Mastery or 2 Actions for full Mastery."
      : "Use Conjurar com 1 Ação para acessar metade da Mastery ou 2 Ações para acessar toda a Mastery."
  };

  next.creation = {
    type: "structures",
    resourceKey: "mastery",

    action: {
      key: "conjure",

      label: english
        ? "Conjure"
        : "Conjurar",

      actionCostOptions: [
        1,
        2
      ],

      oneActionMasteryMultiplier: 0.5,
      twoActionMasteryMultiplier: 1,
      cooldownRounds: 1
    },

    rangeFrom: "range",
    unoccupiedSpacesOnly: true,

    damageThresholdFrom: "dos",
    structuresDoNotRollDodge: true,

    appearanceMustBeDefined: true,

    masteryRefundedWhenDestroyedAtZeroWounds: true,

    disappearOnNewConjure: true,
    disappearAtZeroWounds: true,
    disappearWhenQualityUnavailable: true
  };

  next.effect = english
    ? "Gain Mastery equal to BIT + twice the combined Ranks in Conjurer and Summoner. Use Conjure with 1 Action to access half Mastery or 2 Actions to access all Mastery. Each Rank adds one different Structure option. Structures are created in unoccupied spaces within Range, have a Damage Threshold equal to DOS, do not roll Dodge, and refund their Mastery cost when destroyed at 0 Wound Boxes."
    : "Receba Mastery igual ao BIT + duas vezes a soma dos Ranks em Conjurador e Invocador. Use Conjurar com 1 Ação para acessar metade da Mastery ou 2 Ações para acessar toda a Mastery. Cada Rank adiciona uma opção diferente de Estrutura. Estruturas são criadas em espaços desocupados dentro do Alcance, possuem Limiar de Dano igual ao DOS, não rolam Esquiva e devolvem seu custo de Mastery quando são destruídas ao chegar a 0 Caixas de Ferimento.";

  next.description = english
    ? "Conjurer creates persistent Structures and elemental terrain by spending Mastery."
    : "Conjurador cria Estruturas persistentes e terreno elemental gastando Mastery.";
}

if (id === "invocador") {
  const english = isEnglishLanguage();

  next.name = english
    ? "Summoner"
    : "Invocador";

  next.originalName = "Summoner";
  next.section = "Omnievoker Qualities";

  next.category = {
    ...(next.category ?? {}),
    trigger: true,
    static: true
  };

  next.cost = {
    ...(next.cost ?? {}),
    dp: 1,
    perRank: true
  };

  next.rank = {
    ...(next.rank ?? {}),
    value: 1,
    max: 3,
    limited: true
  };

  next.requirements = {
    text: english
      ? "Requires Champion."
      : "Requer Adulto.",

    qualityNames: ""
  };

  next.incompatible = {
    text: english
      ? "Incompatible with Combat Monster, Positive Reinforcement, and Showstopper."
      : "Incompatível com Monstro de Combate, Reforço Positivo e Showstopper.",

    qualityNames: english
      ? "Combat Monster, Positive Reinforcement, Showstopper"
      : "Monstro de Combate, Reforço Positivo, Showstopper"
  };

  next.requiredFor = [
    "Omnievoker"
  ];

  next.choices = {
    required: true,
    type: "single",

    label: english
      ? "Minion Type"
      : "Tipo de Lacaio",

    cannotRepeat: false,

    /*
     * O tipo é escolhido uma vez.
     * Novos Ranks aumentam o número máximo de Lacaios.
     */
    repeatOnRankIncrease: false,

    options: [
      {
        key: "infantry",

        label: english
          ? "Infantry"
          : "Infantaria",

        originalLabel: "Infantry",

        masteryCost: 4,
        size: "large",

        bonusStat: "movement",
        bonusFrom: "stage",

        effect: english
          ? "Costs 4 Mastery, is Large, and gains Movement equal to Stage. Command Minion costs 1 fewer Action once per turn, but those Minions cannot Aid."
          : "Custa 4 Mastery, é Grande e recebe Movimento igual ao Estágio. Comandar Lacaio custa 1 Ação a menos uma vez por turno, mas esses Lacaios não podem Ajudar."
      },

      {
        key: "protector",

        label: english
          ? "Protector"
          : "Protetor",

        originalLabel: "Protector",

        masteryCost: 3,
        size: "huge",

        bonusStat: "wounds",
        bonusFormula: "stage * 2",

        effect: english
          ? "Costs 3 Mastery, is Huge, and gains Wound Boxes equal to twice Stage. It may Intercede using the Summoner's Actions and ignores all Difficult Terrain."
          : "Custa 3 Mastery, é Enorme e recebe Caixas de Ferimento iguais ao dobro do Estágio. Pode Interceder usando as Ações do Invocador e ignora todo Terreno Difícil."
      },

      {
        key: "recon",

        label: english
          ? "Recon"
          : "Reconhecimento",

        originalLabel: "Recon",

        masteryCost: 2,
        size: "medium",

        bonusStat: "accuracy",
        bonusFrom: "stage",

        effect: english
          ? "Costs 2 Mastery, is Medium, and gains Accuracy equal to Stage. It may make [RANGE] Attacks using the Summoner's Range and Effective Limit, and the Summoner can see through its eyes."
          : "Custa 2 Mastery, é Médio e recebe Precisão igual ao Estágio. Pode fazer ataques [RANGE] usando Alcance e Limite Efetivo do Invocador, que também pode enxergar por seus olhos."
      },

      {
        key: "volatile",

        label: english
          ? "Volatile"
          : "Volátil",

        originalLabel: "Volatile",

        masteryCost: 1,
        size: "large",

        bonusStat: "damage",
        bonusFrom: "stage",

        requirements: {
          mode: "all",

          qualityNames: english
            ? "Element Master"
            : "Mestre Elemental"
        },

        effect: english
          ? "Requires Element Master. Costs 1 Mastery, is Large, and gains Damage equal to Stage. Choose one owned Naturewalk Element when summoned. At 0 Wound Boxes it makes a free minimum-range [RANGE][DAMAGE][T:BURST] Attack."
          : "Requer Mestre Elemental. Custa 1 Mastery, é Grande e recebe Dano igual ao Estágio. Escolha um Elemento de Passo Natural possuído ao invocá-lo. Ao chegar a 0 Caixas de Ferimento, faz um ataque gratuito [RANGE][DAMAGE][T:BURST] de alcance mínimo."
      }
    ]
  };

  next.grants = {
    ...(next.grants ?? {}),

    resource: {
      key: "mastery",
      label: "Mastery",

      valueFormula:
        "bit + 2 * (conjurerRanks + summonerRanks)",

      maxFormula:
        "bit + 2 * (conjurerRanks + summonerRanks)"
    }
  };

  next.activation = {
    ...(next.activation ?? {}),

    enabled: true,
    active: false,
    mode: "action",

    actionCostOptions: [
      1,
      2
    ],

    chatMessage: english
      ? "Use Summon with 1 Action for half Mastery or 2 Actions for full Mastery. Command one Minion with 1 Action or all Minions with 2 Actions."
      : "Use Invocar com 1 Ação para acessar metade da Mastery ou 2 Ações para acessar toda a Mastery. Comande um Lacaio com 1 Ação ou todos com 2 Ações."
  };

  next.creation = {
    type: "minions",
    resourceKey: "mastery",

    summonAction: {
      key: "summon",

      label: english
        ? "Summon"
        : "Invocar",

      actionCostOptions: [
        1,
        2
      ],

      oneActionMasteryMultiplier: 0.5,
      twoActionMasteryMultiplier: 1,
      cooldownRounds: 1
    },

    commandAction: {
      key: "commandMinion",

      label: english
        ? "Command Minion"
        : "Comandar Lacaio",

      oneMinionActionCost: 1,
      allMinionsActionCost: 2,
      minionActionsGranted: 2
    },

    rangeFrom: "range",
    unoccupiedSpacesOnly: true,

    maximumMinionsFrom: "summonerRanks",

    masteryRefundedWhenDestroyedAtZeroWounds: true,

    baseStats: {
      accuracyFrom: "bit",
      damageFrom: "bit",
      movementFrom: "bit",

      woundsFormula: "dos * 2",

      armor: 0,
      dodge: 0,

      extraMovement: "flight"
    },

    masteryUpgrades: {
      woundsPerMastery: 2,
      coreStatsPerTwoMastery: 1
    },

    disappearOnNewSummonUnlessKept: true,
    disappearAtZeroWounds: true,
    disappearWhenQualityUnavailable: true
  };

  next.effect = english
    ? "Gain Mastery equal to BIT + twice the combined Ranks in Summoner and Conjurer. Use Summon with 1 Action to access half Mastery or 2 Actions to access all Mastery. The maximum number of Minions equals Summoner Ranks. Command one Minion with 1 Action or all Minions with 2 Actions; commanded Minions receive 2 Actions."
    : "Receba Mastery igual ao BIT + duas vezes a soma dos Ranks em Invocador e Conjurador. Use Invocar com 1 Ação para acessar metade da Mastery ou 2 Ações para acessar toda a Mastery. A quantidade máxima de Lacaios é igual aos Ranks em Invocador. Comande um Lacaio com 1 Ação ou todos com 2 Ações; Lacaios comandados recebem 2 Ações.";

  next.description = english
    ? "Summoner creates and commands digital Minions by spending Mastery."
    : "Invocador cria e comanda Lacaios digitais gastando Mastery.";
}

if (id === "evocador") {
  const english = isEnglishLanguage();

  /*
   * O ID continua sendo evocador para preservar
   * Actors, snapshots e Items antigos.
   */
  next.name = "Omnievoker";
  next.originalName = "Omnievoker";
  next.section = "Omnievoker Qualities";

  next.requirements = {
    text: english
      ? "Requires 1+ Rank of Conjurer or 1+ Rank of Summoner."
      : "Requer 1+ Rank de Conjurador ou 1+ Rank de Invocador.",

    qualityNames: english
      ? "Conjurer, Summoner"
      : "Conjurador, Invocador",

    mode: "any",
    minimumRank: 1
  };

  next.grants = {
    combinedConjureAndSummonActions: true,
    sharedActionSpend: true
  };

  next.creation = {
    type: "structuresAndMinions",
    resourceKey: "mastery",

    combinedAction: {
      enabled: true,
      useSameActions: true,
      canConjureAndSummonTogether: true
    }
  };

  next.effect = english
    ? "The Digimon can use the Conjure and Summon Actions using the same Actions."
    : "O Digimon pode usar as Ações Conjurar e Invocar usando as mesmas Ações.";

  next.description = english
    ? "Omnievoker combines Conjurer and Summoner into the same Action expenditure."
    : "Omnievoker combina Conjurador e Invocador no mesmo gasto de Ações.";
}

  return next;
}

function applyDefaultQualityAvailability(qualities) {
  return qualities.map((quality) => {
    const defaultAvailability = {
      minimumStage: "",
      label: isEnglishLanguage() ? "Starting Quality" : "Qualidade Inicial"
    };

    return {
      ...quality,
      tier: quality.tier ?? "starting",
      originalTier: quality.originalTier ?? "Starting Qualities",
      availability: {
        ...defaultAvailability,
        ...(quality.availability ?? {})
      }
    };
  });
}

function isEnglishLanguage() {
  const language = String(globalThis.game?.i18n?.lang ?? globalThis.game?.i18n?.language ?? "");
  return language.toLowerCase().startsWith("en");
}

const DDA_DIGIMON_QUALITIES_PT = [
  {
    "id": "otimizacaoDeDados",
    "name": "Otimização de Dados",
    "originalName": "Data Optimization",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Especialização de Dados",
      "Impulso Híbrido"
    ],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Otimização",
      "options": [
        {
          "key": "closeCombat",
          "label": "Combatente Corpo a Corpo",
          "originalLabel": "Close Combat",
          "effect": "O Digimon recebe +1 em Precisão ao usar um Ataque [MELEE]. Esse bônus aumenta para +3 se o alvo estiver com Caixas de Ferimento faltando."
        },
        {
          "key": "rangedStriker",
          "label": "Atirador à Distância",
          "originalLabel": "Ranged Striker",
          "effect": "O Digimon recebe +1 em Precisão ao usar um Ataque [RANGE]. Também recebe +2 em Alcance e Limite Efetivo."
        },
        {
          "key": "warden",
          "label": "Guardião",
          "originalLabel": "Warden",
          "effect": "O Digimon recebe +1 de Armadura. Uma vez por combate, pode realizar uma Ação de Interrupção gastando 1 Ação a menos, potencialmente tornando-a uma Ação Livre."
        },
        {
          "key": "brawler",
          "label": "Brigão",
          "originalLabel": "Brawler",
          "effect": "O Digimon recebe +1 em Testes de Clash e em todos os outros Testes feitos durante Clashes. Também recebe +1 de Dano ao atacar um Digimon com quem esteja em Clash."
        },
        {
          "key": "speedster",
          "label": "Velocista",
          "originalLabel": "Speedster",
          "effect": "O Digimon recebe +1 de Movimento e ignora a primeira penalidade de Esquiva causada por ser atacado depois do próprio turno."
        },
        {
          "key": "effectWarrior",
          "label": "Guerreiro de Efeitos",
          "originalLabel": "Effect Warrior",
          "effect": "O Digimon recebe +1 de Potência em todas as Tags de Efeito de Ataque que usem uma Estatística Derivada do conjurador."
        },
        {
          "key": "variable",
          "label": "Variável",
          "originalLabel": "Variable",
          "effect": "Uma vez por rodada durante o combate, o Digimon pode rerrolar um Teste ou Teste de Pool que tenha feito. Ele deve aceitar o novo resultado. Esse uso reseta ao fim dos turnos do Digimon."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Escolha uma Otimização. Ela define um papel mecânico especial para o Digimon, como combatente corpo a corpo, atirador, guardião, brigão, velocista, guerreiro de efeitos ou variável.",
    "description": "Otimizações de Dados ajudam a direcionar o Digimon para uma função específica. Esta Qualidade só pode ser adquirida uma vez.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "passoNatural",
    "name": "Passo Natural",
    "originalName": "Naturewalk",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Mestre Elemental",
      "Força Elemental",
      "Sobreposição Ilusória"
    ],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Elemento",
      "cannotRepeat": true,
      "options": [
        {
          "key": "fire",
          "label": "Fogo",
          "originalLabel": "Fire",
          "recommendedFor": "Dragon’s Roar, Unknown",
          "terrain": "Desertos, áreas vulcânicas, dunas, penhascos e regiões de condições extremas.",
          "effect": "O Digimon reduz o Dano sofrido por [BURN] em 1."
        },
        {
          "key": "water",
          "label": "Água",
          "originalLabel": "Water",
          "recommendedFor": "Deep Savers",
          "terrain": "Oceanos, rios, lagos e outros terrenos aquáticos.",
          "effect": "O Digimon reduz o Dano sofrido por [FREEZE] em 1."
        },
        {
          "key": "wind",
          "label": "Vento",
          "originalLabel": "Wind",
          "recommendedFor": "Wind Guardians",
          "terrain": "Regiões montanhosas, céus abertos, áreas ventosas e planaltos.",
          "effect": "O Digimon reduz qualquer Dano de Colisão que sofrer em 1."
        },
        {
          "key": "earth",
          "label": "Terra",
          "originalLabel": "Earth",
          "recommendedFor": "Nature Spirits, Jungle Troopers",
          "terrain": "Cavernas, desertos, savanas, falésias, cânions e vales.",
          "effect": "O Digimon reduz o Dano sofrido por [POISON] em 1."
        },
        {
          "key": "ice",
          "label": "Gelo",
          "originalLabel": "Ice",
          "recommendedFor": "Deep Savers, Nightmare Soldiers",
          "terrain": "Montanhas geladas, glaciares e tundras.",
          "effect": "O Digimon reduz o Dano sofrido por [FREEZE] em 1."
        },
        {
          "key": "wood",
          "label": "Flora",
          "originalLabel": "Wood",
          "recommendedFor": "Nature Spirits, Jungle Troopers",
          "terrain": "Florestas, selvas, pântanos e brejos.",
          "effect": "O Digimon reduz o Dano sofrido por [POISON] em 1."
        },
        {
          "key": "steel",
          "label": "Aço",
          "originalLabel": "Steel",
          "recommendedFor": "Metal Empire, Unknown",
          "terrain": "Civilização, fábricas, ruínas industriais e áreas densamente urbanizadas.",
          "effect": "O Digimon reduz o Dano sofrido por [BURN] em 1."
        },
        {
          "key": "thunder",
          "label": "Trovão",
          "originalLabel": "Thunder",
          "recommendedFor": "Virus Busters, Metal Empire",
          "terrain": "Áreas eletricamente carregadas, fábricas perigosas e regiões propensas a raios.",
          "effect": "O Digimon reduz qualquer Dano de Colisão que sofrer em 1."
        },
        {
          "key": "darkness",
          "label": "Trevas",
          "originalLabel": "Darkness",
          "recommendedFor": "Unknown, Dark Area, Nightmare Soldiers",
          "terrain": "Áreas escuras, sombrias ou macabras.",
          "effect": "O Digimon enxerga em áreas escuras ou de baixa iluminação sem impedimento e recebe +1 em Testes de Percepção."
        },
        {
          "key": "light",
          "label": "Luz",
          "originalLabel": "Light",
          "recommendedFor": "Virus Busters, Wind Guardians",
          "terrain": "Solo sagrado, regiões angelicais ou áreas que rejeitam seres impuros.",
          "effect": "O Digimon enxerga em áreas escuras ou de baixa iluminação sem impedimento e recebe +1 em Testes de Percepção."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Para cada Rank, escolha um Elemento diferente. O Digimon recebe +1 em uma Estatística Principal à escolha, ignora penalidades de Movimento de Terreno Difícil associado ao Elemento escolhido e reduz ou ignora efeitos ambientais relacionados, a critério do Narrador. Também não sofre Dano bônus de ataques de Força Elemental que tenham o mesmo Elemento de um de seus Passos Naturais.",
    "description": "O Digimon está em casa em certos terrenos ou elementos. Esta Qualidade representa adaptação ambiental e afinidade elemental.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "instinto",
    "name": "Instinto",
    "originalName": "Instinct",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Arma"
    },
    "requiredFor": [
      "Força Crescente",
      "Antecipar Investida"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "derivedStats": {
        "dodgePerRank": 1,
        "healthPerRank": 1,
        "movementPerRank": 1
      }
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon recebe bônus em Esquiva, Saúde e Movimento igual aos Ranks nesta Qualidade.",
    "description": "Instinto representa reflexos naturais, resistência corporal e movimentação aprimorada. É incompatível com Arma.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "arma",
    "name": "Arma",
    "originalName": "Weapon",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Instinto"
    },
    "requiredFor": [
      "Armamento de Digizóide",
      "Golpes Marciais"
    ],
"choices": {
  "required": true,
  "type": "attackTag",
  "options": []
},
"attackModifier": {
  "enabled": true,
  "appliesTo": "differentAttackPerRank",
  "grantsTags": [
    "weapon"
  ]
}, 
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon recebe uma Tag [WEAPON] para cada Rank, que pode aplicar a ataques que ainda não tenham essa Tag. Ataques [WEAPON] recebem bônus em Precisão e Dano igual aos Ranks nesta Qualidade. Se o ataque for [RANGE], recebe o mesmo bônus em Alcance e Limite Efetivo. Se for [MELEE], uma quantidade de resultados 4 igual aos Ranks pode contar como Sucesso; ataques [DAMAGE] também recebem +1 Dano.",
    "description": "Arma representa armas naturais, equipamentos ou técnicas ofensivas incorporadas ao Digimon. É incompatível com Instinto.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "movimentoExtra",
    "name": "Movimento Extra",
    "originalName": "Extra Movement",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 5,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Mobilidade Avançada"
    ],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Tipo de Movimento",
      "cannotRepeat": true,
      "options": [
        {
          "key": "flight",
          "label": "Voo",
          "originalLabel": "Flight",
          "effect": "O Digimon é capaz de voar. Ele sofre -1 Movimento e perde este Movimento Extra enquanto estiver com metade ou menos de suas Caixas de Ferimento máximas."
        },
        {
          "key": "digger",
          "label": "Escavador",
          "originalLabel": "Digger",
          "effect": "O Digimon pode escavar por terreno macio, como terra, neve ou areia, usando seu Movimento. Enquanto estiver no subterrâneo, criaturas tocando o mesmo chão não contam como obscurecidas dentro de metade do alcance do Digimon."
        },
        {
          "key": "swimmer",
          "label": "Nadador",
          "originalLabel": "Swimmer",
          "effect": "O Movimento de natação do Digimon passa a usar seu Movimento completo. Superfícies de água não tornam outros Digimon obscurecidos para ele. Também pode prender a respiração uma quantidade ilimitada de vezes por combate."
        },
        {
          "key": "wallclimber",
          "label": "Escalador",
          "originalLabel": "Wallclimber",
          "effect": "O Digimon pode escalar superfícies verticais usando seu Movimento, mas não consegue se mover por tetos."
        },
        {
          "key": "jumper",
          "label": "Saltador",
          "originalLabel": "Jumper",
          "effect": "A altura e a distância dos saltos do Digimon passam a usar seu Movimento completo."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Para cada Rank, escolha um tipo de Movimento Extra diferente. O Digimon pode se mover nesse tipo de terreno a uma taxa igual ao seu Movimento, depois de aplicar Acelerar.",
    "description": "Movimento Extra concede formas especiais de deslocamento, como voar, escavar, nadar, escalar ou saltar.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "acelerar",
    "name": "Acelerar",
    "originalName": "Accelerate",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": true
    },
    "rankLimit": {
      "type": "derivedStat",
      "stat": "ram"
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "O máximo de Ranks em Acelerar é igual ao RAM do Digimon.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "miscStats": {
        "movementPerRank": 1
      }
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Para cada Rank nesta Qualidade, o Digimon recebe +1 Movimento. O máximo de Ranks que pode adquirir em Acelerar é igual ao seu RAM.",
    "description": "Acelerar aumenta diretamente o Movimento do Digimon.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "periciaProdigiosa",
    "name": "Perícia Prodigiosa",
    "originalName": "Prodigious Skill",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 4,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 4,
        "ultimatePlus": 4
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Perícia",
      "options": [
        {
          "key": "athletics",
          "label": "Atletismo",
          "derivedStat": "cpu"
        },
        {
          "key": "endurance",
          "label": "Resistência",
          "derivedStat": "cpu"
        },
        {
          "key": "featsOfStrength",
          "label": "Feitos de Força",
          "derivedStat": "cpu"
        },
        {
          "key": "evade",
          "label": "Evasão",
          "derivedStat": "ram"
        },
        {
          "key": "precision",
          "label": "Precisão",
          "derivedStat": "ram"
        },
        {
          "key": "stealth",
          "label": "Furtividade",
          "derivedStat": "ram"
        },
        {
          "key": "knowledge",
          "label": "Conhecimento",
          "derivedStat": "bit"
        },
        {
          "key": "survival",
          "label": "Sobrevivência",
          "derivedStat": "bit"
        },
        {
          "key": "awareness",
          "label": "Percepção",
          "derivedStat": "bit"
        },
        {
          "key": "manipulate",
          "label": "Manipular",
          "derivedStat": "bit"
        },
        {
          "key": "performance",
          "label": "Performance",
          "derivedStat": "bit"
        },
        {
          "key": "persuasion",
          "label": "Persuasão",
          "derivedStat": "bit"
        },
        {
          "key": "fortitude",
          "label": "Fortitude",
          "derivedStat": "dos"
        },
        {
          "key": "bravery",
          "label": "Bravura",
          "derivedStat": "dos"
        },
        {
          "key": "decipherIntent",
          "label": "Decifrar Intenção",
          "derivedStat": "bit"
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "skillBonus": 3
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Sempre que adquirir esta Qualidade, escolha uma Perícia específica da lista de Perícias de Tamer. O Digimon recebe +3 em Testes dessa Perícia, somado à Estatística Derivada correspondente. CPU é usado para Perícias de Corpo; RAM para Perícias de Agilidade; BIT para Perícias de Inteligência e Carisma; DOS para Perícias de Vontade.",
    "description": "Perícia Prodigiosa permite que o Digimon se destaque em uma Perícia específica, aplicando um bônus fixo aos Testes dessa área.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "perfuracaoDeArmadura",
    "name": "Perfuração de Armadura",
    "originalName": "Armor Piercing",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Dano Total 4 para Rank 1, Dano Total 8 para Rank 2 e Dano Total 12 para Rank 3.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "[PIERCING] e [CERTAIN] não podem ser aplicadas ao mesmo ataque, a menos que ambas sejam aplicadas ao Movimento Assinatura.",
      "qualityNames": ""
    },
    "requiredFor": [
      "Perfuração Desastrada"
    ],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque com [PIERCING]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "piercing"
      ],
      "appliesTo": "oneDamageAttack",
      "cannotShareWithTagsUnlessSignatureMove": [
        "certain"
      ]
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Na primeira compra, aplique a Tag [PIERCING] a um ataque [DAMAGE]. Um ataque [PIERCING] causa Dano Inalterável extra em um acerto para cada Sucesso de Precisão acima dos Sucessos de Esquiva do alvo, até um máximo igual aos Ranks nesta Qualidade. Se a Esquiva tiver o mesmo número de Sucessos que a Precisão, esta Qualidade não causa Dano Inalterável extra.",
    "description": "Perfuração de Armadura permite que um ataque específico atravesse defesas e cause Dano Inalterável adicional. A Tag [PIERCING] só pode ser aplicada a um ataque por Digimon.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "golpeCerteiro",
    "name": "Golpe Certeiro",
    "originalName": "Certain Strike",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Precisão Total 4 para Rank 1, Precisão Total 8 para Rank 2 e Precisão Total 12 para Rank 3.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "[CERTAIN] e [PIERCING] não podem ser aplicadas ao mesmo ataque, a menos que ambas sejam aplicadas ao Movimento Assinatura.",
      "qualityNames": ""
    },
    "requiredFor": [
      "Golpe Enfraquecido"
    ],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque com [CERTAIN]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "certain"
      ],
      "appliesTo": "oneDamageAttack",
      "automaticSuccessesPerRank": 1,
      "cannotShareWithTagsUnlessSignatureMove": [
        "piercing"
      ]
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Na primeira compra, aplique a Tag [CERTAIN] a um ataque [DAMAGE]. Um ataque [CERTAIN] recebe Sucessos automáticos iguais aos Ranks nesta Qualidade. A Tag [CERTAIN] só pode ser aplicada a um ataque por Digimon.",
    "description": "Golpe Certeiro torna um ataque específico mais confiável, concedendo Sucessos automáticos à rolagem de Precisão.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "ataqueDeInvestida",
    "name": "Ataque de Investida",
    "originalName": "Charge Attack",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "A Tag [CHARGE] deve ser aplicada a um ataque [MELEE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [MELEE] com [CHARGE]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "charge"
      ],
      "appliesTo": "oneMeleeAttack"
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Aplique a Tag [CHARGE] a um ataque [MELEE]. Ataques [CHARGE] permitem que o Digimon use o ataque e se mova com 1 Ação, movendo-se antes ou depois do ataque. Esse movimento deve ser feito em linha reta. Um ataque [CHARGE][T:PASS] usado como Ataque de Área aumenta a distância percorrida. Se aplicado ao Movimento Assinatura, o Digimon também pode se mover espaços adicionais iguais à sua Bateria.",
    "description": "Ataque de Investida permite atacar enquanto o Digimon avança ou recua em linha reta.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "municao",
    "name": "Munição",
    "originalName": "Ammo",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Não pode ser aplicada a um Movimento Assinatura.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Recarregar"
    ],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque com [AMMO]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "ammo"
      ],
      "appliesTo": "oneAttack"
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Aplique a Tag [AMMO] a um ataque. Um ataque [AMMO] ignora a regra de um ataque por rodada, mas só pode ser usado uma vez por combate. Esta Tag não pode ser aplicada a um Movimento Assinatura.",
    "description": "Munição representa um ataque de uso limitado que permite contornar o limite normal de ataques por rodada.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "recuoPesado",
    "name": "Recuo Pesado",
    "originalName": "Heavy Recoil",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "A Tag [RECOIL] deve ser aplicada a um ataque [RANGE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Não pode ser usada em Postura de Sentinela.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [RANGE] com [RECOIL]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "recoil"
      ],
      "appliesTo": "oneRangedAttack"
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Aplique a Tag [RECOIL] a um ataque [RANGE]. O Alcance e o Limite Efetivo do ataque são reduzidos pela metade, mas ele ignora a penalidade de Precisão causada por inimigos adjacentes ao atacar um inimigo adjacente. Quando o ataque é feito, o Digimon é empurrado para longe do alvo uma quantidade de espaços igual ao seu Estágio. Se um ataque [RECOIL][DAMAGE] obtiver ao menos 1 Sucesso de Precisão acima da Esquiva do alvo, o alvo também é empurrado a mesma distância. [RECOIL] pode ser aplicado a um ataque com [PUSH], potencialmente aumentando a distância empurrada. Ataques de Área [RECOIL] têm metade do tamanho máximo potencial. Se o ataque tiver [T:BURST], o Digimon pode se mover em qualquer direção ao fazer o Ataque de Área, desde que em linha reta. Se aplicado ao Movimento Assinatura, o Digimon também pode se empurrar espaços adicionais iguais à sua Bateria.",
    "description": "Recuo Pesado transforma um ataque à distância em um disparo de impacto extremo, sacrificando alcance em troca de deslocamento forçado.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "poderBrutal",
    "name": "Poder Brutal",
    "originalName": "Huge Power",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "instant",
      "chatMessage": "Rerrole resultados baixos em uma Pool de Precisão."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "effect": "Rank 1: uma vez por rodada, o Digimon pode rerrolar quaisquer resultados 1 ao rolar uma Pool de Precisão. Rank 2: também pode rerrolar resultados 2 na mesma rolagem. Esta Qualidade não afeta Dados de Bônus concedidos por Ações de Tamer, como Direcionar ou Ação Segurar; esses dados devem ser rolados separadamente.",
    "description": "Poder Brutal permite refazer resultados baixos em rolagens de Precisão, aumentando a consistência ofensiva do Digimon.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "flancoAgressivo",
    "name": "Flanco Agressivo",
    "originalName": "Aggressive Flank",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Duelista de Hordas"
    },
    "requiredFor": [
      "Ataque Coordenado"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon recebe bônus em Precisão igual ao seu RAM sempre que um aliado estiver adjacente ao alvo.",
    "description": "Flanco Agressivo recompensa ataques coordenados contra inimigos pressionados por aliados.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "contraAtaque",
    "name": "Contra-Ataque",
    "originalName": "Counterattack",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Contra-Golpe",
      "Contra-Golpe Cruzado",
      "Fogo de Retorno",
      "Contra-Ataque Instantâneo"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "instant",
      "chatMessage": "Quando um inimigo errar um ataque contra você, use uma Interrupção para contra-atacar."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "usesFormula": {
      "valueFromRank": true,
      "valuePerRank": 1,
      "recharge": "combat"
    },
    "effect": "Se um inimigo errar um ataque contra o Digimon, ele pode usar uma Ação de Interrupção para fazer um ataque contra o atacante. O alvo sofre penalidade de Esquiva igual ao Estágio do Digimon contra esse contra-ataque. O Digimon pode escolher qualquer ataque que exija apenas 1 Ação. Esta Qualidade pode ser usada uma quantidade de vezes por combate igual aos Ranks nela. Não é possível usar um ataque como Ataque de Área ao contra-atacar desta forma.",
    "description": "Contra-Ataque permite punir inimigos que erram ataques contra o Digimon.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "areaDeAtaque",
    "name": "Área de Ataque",
    "originalName": "Area Attack",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 6,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Zonista"
    ],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Tag de Área",
      "cannotRepeat": true,
      "options": [
        {
          "key": "blast",
          "label": "[T:BLAST]",
          "originalLabel": "[T:BLAST]",
          "appliesTo": "rangeAttack",
          "baseSize": "1 espaço de raio",
          "maximumSize": "1 + metade do BIT em espaços de raio",
          "effect": "O ataque cria uma zona circular que se origina em algum ponto dentro do Alcance do atacante. Esta Área de Ataque só pode ser aplicada a ataques [RANGE]."
        },
        {
          "key": "burst",
          "label": "[T:BURST]",
          "originalLabel": "[T:BURST]",
          "appliesTo": "meleeOrRangeAttack",
          "baseSize": "1 espaço",
          "maximumSize": "1 + metade do DOS em espaços",
          "effect": "O ataque afeta espaços ao redor do atacante. A área se expande a partir do atacante; portanto, o atacante não é considerado alvo para fins de Dano ou Efeitos."
        },
        {
          "key": "cone",
          "label": "[T:CONE]",
          "originalLabel": "[T:CONE]",
          "appliesTo": "meleeOrRangeAttack",
          "baseSize": "3 espaços",
          "maximumSize": "3 + BIT em espaços",
          "effect": "O ataque cria um cone de 90 graus que se origina adjacente ao atacante."
        },
        {
          "key": "line",
          "label": "[T:LINE]",
          "originalLabel": "[T:LINE]",
          "appliesTo": "meleeOrRangeAttack",
          "baseSize": "3 espaços",
          "maximumSize": "3 + dobro do CPU em espaços",
          "effect": "O ataque cria um pilar adjacente ao atacante. Se o pilar atingir uma parede sólida, pode ricochetear e potencialmente atingir alvos adicionais. A largura mínima do pilar é 1 espaço, mas o atacante pode aumentar a largura em 1 espaço para cada categoria de tamanho acima de Grande."
        },
        {
          "key": "pass",
          "label": "[T:PASS]",
          "originalLabel": "[T:PASS]",
          "appliesTo": "meleeAttack",
          "baseSize": "RAM em espaços",
          "maximumSize": "RAM em espaços, modificado por [CHARGE] se aplicável",
          "effect": "O ataque permite que o usuário avance em linha reta em uma direção, atingindo todos os alvos pelos quais passar. Ao declarar o ataque, o atacante pode se mover uma distância base igual ao seu RAM em linha reta e pode atravessar espaços de aliados e inimigos, mas não pode terminar em um espaço que não possa ocupar. Se o ataque também tiver [CHARGE], o Digimon pode adicionar até seu Movimento à distância percorrida. Esta Área de Ataque só pode ser aplicada a ataques [MELEE]."
        },
        {
          "key": "wave",
          "label": "[T:WAVE]",
          "originalLabel": "[T:WAVE]",
          "appliesTo": "meleeOrRangeAttack",
          "baseSize": "2 espaços de largura",
          "maximumSize": "2 + DOS espaços de largura",
          "effect": "O ataque cria um cubo que pode ser colocado em qualquer lugar adjacente ao atacante."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": [
        "t:blast",
        "t:burst",
        "t:cone",
        "t:line",
        "t:pass",
        "t:wave"
      ],
      "appliesTo": "differentAttackPerRank",
      "triggerRequired": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao declarar o ataque, escolha se a Tag de Área será ativada."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "areaRules": {
      "canBeUsedAsRegularAttack": true,
      "chooseTargetGroup": true,
      "targetGroupOptions": [
        "enemies",
        "allies"
      ],
      "damageAreaAttack": {
        "damageAfterArmorHalved": true,
        "round": "up",
        "affectsSingleTargetToo": true,
        "doesNotAffectUnalterableDamage": true
      },
      "supportAreaAttack": {
        "enemyTargetMinimum": 1,
        "allyTargetMinimum": 0,
        "potencyReduction": 1,
        "durationReduction": 1,
        "derivedStatValuesReduced": 1
      },
      "sizeRules": {
        "rangeCanUseMaximumSize": true,
        "meleeCanUseBaseSizeOnly": true,
        "meleeBaseCanBeIncreasedByReachWideSwings": true,
        "signatureMoveBaseSizeBonus": 1
      }
    },
    "effect": "Para cada Rank nesta Qualidade, o Digimon aplica uma Tag de Área de Ataque a um ataque diferente. Cada Tag só pode ser comprada uma vez. Um ataque com Tag de Área ainda pode ser usado como um ataque comum; o atacante precisa ativar a Tag de Área ao declarar o ataque. Ao ativar uma Área de Ataque, o ataque passa a mirar todos os Digimon dentro da área escolhida, mas o atacante escolhe se o ataque mira apenas inimigos ou apenas aliados. Ataques de Área [DAMAGE] têm o Dano causado após Armadura reduzido pela metade, arredondado para cima, mesmo que haja apenas um alvo; isso não afeta Dano Inalterável. Ataques de Área [SUPPORT] têm Duração e Potência de todos os Efeitos de Ataque reduzidas em 1, até mínimo 1 ao atacar inimigos ou mínimo 0 ao atingir aliados. Se um Efeito listar valor baseado em Estatística Derivada, esse valor também é reduzido em 1.",
    "description": "Área de Ataque permite transformar ataques específicos em explosões, rajadas, cones, linhas, avanços ou ondas, ampliando o controle de campo do Digimon.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "zonista",
    "name": "Zonista",
    "originalName": "Zoner",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer 1 Rank de Área de Ataque.",
      "qualityNames": "Área de Ataque"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Técnica de Zona",
      "options": [
        {
          "key": "friendlyFire",
          "label": "Fogo Amigo",
          "originalLabel": "Friendly Fire",
          "incompatible": {
            "text": "Incompatível com Especialização de Dados: Senhor da Guerra de Status.",
            "qualityNames": "Especialização de Dados: Senhor da Guerra de Status"
          },
          "effect": "Sempre que o Digimon fizer uma Área de Ataque [SUPPORT] com uma Tag de Efeito que só se aplica a aliados, ele pode alterar as Tags do ataque para alvos diferentes. O ataque é tratado como [DAMAGE] para inimigos e [SUPPORT] para aliados. O Efeito não afeta inimigos. Isso pode transformar, por exemplo, um ataque [SUPPORT][SHARPEN][T:BLAST] feito para aliados em um ataque [DAMAGE][T:BLAST] contra inimigos, mantendo os benefícios para aliados."
        },
        {
          "key": "bombardment",
          "label": "Bombardeio",
          "originalLabel": "Bombardment",
          "effect": "O Digimon pode escolher mirar tudo, aliados e inimigos, dentro da zona de um ataque [DAMAGE] com Tag de Área. Se fizer isso, o Dano do ataque não pode ser reduzido abaixo da Estatística Derivada usada para calcular aquela Área de Ataque, ou do Dano Total após Armadura, o que for menor."
        },
        {
          "key": "firewallBypass",
          "label": "Bypass de Firewall",
          "originalLabel": "Firewall Bypass",
          "effect": "O Digimon pode escolher mirar tudo, aliados e inimigos, dentro da zona de um ataque [SUPPORT] com Tag de Área. Se fizer isso, a Potência e a Duração dos Efeitos de Ataque não são mais reduzidas."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Escolha Fogo Amigo, Bombardeio ou Bypass de Firewall. Esta Qualidade só pode ser adquirida uma vez. Cada opção altera como o Digimon manipula Áreas de Ataque, permitindo misturar dano e suporte, preservar dano em ataques que atingem todos, ou impedir a redução de Potência e Duração em ataques de suporte de área.",
    "description": "Zonista representa domínio avançado de ataques em área, permitindo que o Digimon controle melhor quem é afetado e como os efeitos são distribuídos.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
{
  "id": "duelistaDeHordas",
  "name": "Duelista de Hordas",
  "originalName": "Horde Duelist",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": true,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 2,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "Incompatível com Flanco Agressivo.",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Use 1 Ação e role BIT (Sobrevivência) contra inimigos adjacentes."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Quando está adjacente apenas a inimigos, o Digimon pode gastar 1 Ação para fazer um Teste BIT (Sobrevivência). O NA é 10 + maior Estágio entre inimigos adjacentes + quantidade de inimigos adjacentes. Em sucesso, ganha bônus de Precisão igual ao BIT contra inimigos adjacentes sem aliados adjacentes ao alvo até o início do próximo turno. Em sucesso crítico, recupera a Ação gasta. Em falha crítica, não pode usar novamente até o fim do combate.",
  "description": "Duelista de Hordas recompensa o Digimon por se lançar sozinho contra muitos inimigos.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
{
  "id": "ocultarAVista",
  "name": "Ocultar-se à Vista",
  "originalName": "Hide in Plain Sight",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": false,
    "static": true,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [
    "Manto de Sombras",
    "Ataque Furtivo"
  ],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Use 1 Ação para tentar se esconder mesmo estando à vista."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "O Digimon pode fazer um Teste de Furtividade como 1 Ação, uma vez por turno, para se esconder mesmo estando à vista, tratando-se como obscurecido para esse objetivo. Ao interferir no combate, como atacar, deixa de estar escondido.",
  "description": "Ocultar-se à Vista permite desaparecer em meio ao caos do combate.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
{
  "id": "mantoDeSombras",
  "name": "Manto de Sombras",
  "originalName": "Shade Cloak",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": true,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "Requer Ocultar-se à Vista.",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Ao rolar RAM (Furtividade), gaste +1 Ação para compartilhar o resultado com aliados próximos."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Quando faz um Teste RAM (Furtividade), o Digimon pode gastar +1 Ação para que aliados dentro de alcance igual ao RAM recebam o mesmo resultado e benefício, enquanto permanecerem dentro da distância. Em combate, se qualquer aliado beneficiado interferir, o efeito termina para todos.",
  "description": "Manto de Sombras estende a furtividade do Digimon para seus aliados.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
{
  "id": "ataqueFurtivo",
  "name": "Ataque Furtivo",
  "originalName": "Sneak Attack",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": true,
    "trigger": false,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "Requer Ocultar-se à Vista.",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": true,
    "type": "singleAttack",
    "label": "Ataque com [SNEAK]",
    "options": []
  },
  "attackModifier": {
    "enabled": true,
    "grantsTags": [
      "sneak"
    ],
    "appliesTo": "oneAttack",
    "sneakAttack": true,
    "rangeExtraActionCost": 1
  },
  "grants": {},
  "activation": {
    "enabled": false,
    "active": false,
    "mode": "passive",
    "chatMessage": ""
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Aplique [SNEAK] a um ataque. Ataques [RANGE][SNEAK] custam +1 Ação, exceto Movimento Assinatura. Ao atacar um inimigo de quem está escondido, recebe bônus de Precisão igual ao RAM.",
  "description": "Ataque Furtivo transforma posição escondida em oportunidade ofensiva.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
{
  "id": "golpeSimplificado",
  "name": "Golpe Simplificado",
  "originalName": "Simplified Strike",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": true,
    "trigger": false,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 2,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": true,
    "type": "singleAttack",
    "label": "Ataque com [SIMPLE]",
    "options": []
  },
  "attackModifier": {
    "enabled": true,
    "grantsTags": [
      "simple"
    ],
    "appliesTo": "oneAttack",
    "actionCostReduction": 1,
    "actionCostMinimum": 1
  },
  "grants": {},
  "activation": {
    "enabled": false,
    "active": false,
    "mode": "passive",
    "chatMessage": ""
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Aplique [SIMPLE] a um ataque. Sempre que usar esse ataque, seu custo em Ações é reduzido em 1, até o mínimo de 1.",
  "description": "Golpe Simplificado reduz o custo de uma técnica sem torná-la gratuita.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
{
  "id": "gritoDeGuerra",
  "name": "Grito de Guerra",
  "originalName": "Battle Cry",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": true,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 3,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Use 1 Ação e role DOS (Bravura) para conceder [BASTION] a aliados próximos."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Como 1 Ação, faça um Teste DOS (Bravura). O NA é 10 + maior SV entre inimigos + total de inimigos em combate. Aliados dentro de espaços iguais ao DOS recebem [BASTION] por 1 Rodada. Falha concede [BASTION 1], sucesso [BASTION 2], sucesso crítico recupera a Ação. Falha crítica também impede novo uso até o fim do combate.",
  "description": "Grito de Guerra fortalece aliados por meio de presença e coragem.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
{
  "id": "cacadorVigilante",
  "name": "Caçador Vigilante",
  "originalName": "Watchful Hunter",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": true,
    "static": true,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Estude um alvo com DOS (Percepção) para ganhar bônus contra ele."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Uma vez por rodada, durante seu turno, o Digimon pode fazer DOS (Percepção) como Ação Livre, ignorando penalidades de visão exceto Cego. Como Ação Livre da Qualidade ou 2 Ações, escolhe um inimigo e faz DOS (Percepção) contra NA 12 + RAM do alvo. Em sucesso, recebe +2 Precisão com [MELEE] contra o alvo até o início do próximo turno e trata o alvo como não obscurecido. Em sucesso crítico, o bônus também vale para [RANGE].",
  "description": "Caçador Vigilante lê o alvo antes de atacar.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
{
  "id": "venenoso",
  "name": "Venenoso",
  "originalName": "Venomous",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": true,
    "trigger": false,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": true,
    "type": "singleAttack",
    "label": "Ataque [DAMAGE] com [VENOM]",
    "options": []
  },
  "attackModifier": {
    "enabled": true,
    "grantsTags": [
      "venom"
    ],
    "appliesTo": "oneDamageAttack",
    "venomous": true,
    "cannotShareWithTags": [
      "poison"
    ]
  },
  "grants": {},
  "activation": {
    "enabled": false,
    "active": false,
    "mode": "passive",
    "chatMessage": ""
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Aplique [VENOM] a um ataque [DAMAGE]. Se o ataque acertar, o atacante faz BIT (Sobrevivência) contra NA 10 + RAM do alvo. Em sucesso, o alvo sofre [POISON] por 1 Rodada; se já tiver [POISON], a Potência aumenta em 1. Em sucesso crítico, a Potência aumenta em +1 adicional. Ataques de Área não recebem esse benefício.",
  "description": "Venenoso injeta condições debilitantes após um acerto.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
{
  "id": "alcance",
  "name": "Alcance",
  "originalName": "Reach",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": false,
    "static": true,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 2,
    "perRank": true,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 3,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": true,
    "type": "single",
    "label": "Opção de Alcance",
    "options": [
      {
        "key": "wideSwings",
        "label": "Golpes Amplos",
        "originalLabel": "Wide Swings"
      },
      {
        "key": "longArms",
        "label": "Braços Longos",
        "originalLabel": "Long Arms"
      },
      {
        "key": "extendedGrapple",
        "label": "Agarrão Estendido",
        "originalLabel": "Extended Grapple"
      }
    ]
  },
  "attackModifier": {
    "enabled": true,
    "grantsTags": [],
    "appliesTo": "melee",
    "reachMode": "wideSwings",
    "reachBonusPerRank": 1
  },
  "grants": {},
  "activation": {
    "enabled": false,
    "active": false,
    "mode": "passive",
    "chatMessage": ""
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Escolha Golpes Amplos, Braços Longos ou Agarrão Estendido. A opção escolhida aumenta o alcance de ataques corpo a corpo ou de Clash conforme os Ranks nesta Qualidade.",
  "description": "Alcance amplia a zona de ameaça do Digimon.",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Qualidade Inicial"
  }
},
  {
    "id": "evasaoAbsoluta",
    "name": "Evasão Absoluta",
    "originalName": "Absolute Evasion",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Esquiva Total 4 para Rank 1, Esquiva Total 8 para Rank 2 e Esquiva Total 12 para Rank 3.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Incompatível com Especialização de Dados: Alvo Inalcançável.",
      "qualityNames": "Especialização de Dados: Alvo Inalcançável"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "automaticDodgeSuccessesPerRank": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon recebe Sucessos automáticos em Esquiva iguais aos Ranks em Evasão Absoluta. Esses Sucessos automáticos são deduzidos da Pool Base de Esquiva. Porém, sempre que o Digimon sofreria uma penalidade de Esquiva por Esquivas consecutivas, os Sucessos automáticos são removidos primeiro, até que nenhum reste. Quando a Pool de Esquiva do Digimon é resetada no fim de seu turno, ele recupera esses Sucessos automáticos.",
    "description": "Evasão Absoluta transforma parte da Esquiva do Digimon em Sucessos automáticos, tornando sua primeira defesa de cada rodada mais confiável.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "esquiva",
    "name": "Esquiva",
    "originalName": "Avoidance",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "instant",
      "chatMessage": "Rerrole resultados baixos em uma Pool de Esquiva."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "effect": "Rank 1: uma vez por rodada, o Digimon pode rerrolar quaisquer resultados 1 ao rolar uma Pool de Esquiva. Rank 2: também pode rerrolar resultados 2 na mesma rolagem. Esta Qualidade não afeta Dados de Bônus concedidos por Ações de Tamer, como Direcionar ou Ação Segurar; esses dados devem ser rolados separadamente.",
    "description": "Esquiva melhora a consistência defensiva do Digimon, permitindo rerrolar resultados baixos em Pools de Esquiva.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "monstroDeCombate",
    "name": "Monstro de Combate",
    "originalName": "Combat Monster",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Contra-Golpe Cruzado, Invocador, Conjurador, Reforço Positivo"
    },
    "requiredFor": [
      "Selvageria",
      "Berserker"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resource": {
        "key": "resolve",
        "label": "Resolve",
        "value": 0,
        "max": 4
      }
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Sempre que o Digimon sofre Dano de um inimigo ou de suas próprias Qualidades, como Overwrite ou Violent Overwrite, ele ganha Resolve igual ao Dano sofrido. O Resolve máximo do Digimon é 4. Quando o Digimon acerta um ataque, todo o Resolve é gasto e adicionado ao Dano do ataque. O Resolve também reseta ao fim do combate. Se o Digimon for afetado por [CLEANSE], ele também perde Resolve para cada Sucesso do Efeito, embora quem aplica [CLEANSE] possa escolher não reduzir Resolve, como em um Efeito Específico. O Digimon só ganha Resolve por Dano sofrido em Caixas de Ferimento; perder Caixas de Ferimento Temporárias não conta. Ele também não ganha Resolve por Dano causado por seus próprios ataques ou por ataques de aliados.",
    "description": "Monstro de Combate converte dor em poder ofensivo acumulado, transformando Dano sofrido em Resolve para fortalecer o próximo ataque bem-sucedido.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "aProvaDeBalas",
    "name": "À Prova de Balas",
    "originalName": "Bullet Proof",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Quando este Digimon é atacado, qualquer ataque posterior feito pelo mesmo atacante sofre penalidade em Precisão e Dano igual ao SV do Digimon. Essa penalidade pode acumular se o atacante atacar mais de duas vezes entre rodadas. A Armadura do Digimon pode reduzir o Dano de qualquer ataque afetado por esta Qualidade a 0. A penalidade reseta no fim do turno do Digimon.",
    "description": "À Prova de Balas torna o Digimon progressivamente mais difícil de ferir por atacantes insistentes, punindo ataques repetidos do mesmo inimigo.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "substituir",
    "name": "Substituir",
    "originalName": "Substitute",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Não pode ser usado para evitar um ataque enquanto estiver em Clash. Pode ser usado para escapar de um Clash quando ele é iniciado, como se fosse um ataque.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "actionCost": 0,
      "chatMessage": "Ao ser atingido por um ataque, antes de sofrer Dano, faça um Teste RAM (Evasão) para criar um substituto."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "ram",
      "skill": "evade",
      "tnFormula": "10 + attackerBit",
      "consecutiveUseTnIncrease": 3,
      "notes": "Cada uso desta Qualidade, mesmo em falha, aumenta o NA em 3 para usos posteriores até o fim do combate."
    },
    "result": {
      "criticalFailure": "O Digimon é atingido pelo ataque normalmente e não pode usar esta Qualidade novamente até o fim do combate.",
      "failure": "O Digimon é atingido pelo ataque normalmente.",
      "success": "O Digimon sacrifica Caixas de Ferimento iguais ao seu SV + 1, mínimo 1. O ataque é considerado bem-sucedido para efeitos como Postura Feroz ou Resolve de Monstro de Combate.",
      "criticalSuccess": "O Digimon sacrifica apenas metade das Caixas de Ferimento, mínimo 1."
    },
    "effect": "No momento em que o Digimon é atingido por um ataque, antes de sofrer Dano, ele pode escolher criar um chamariz ou deixar uma imagem residual para receber o golpe em seu lugar. O Digimon faz um Teste RAM (Evasão) como Ação Livre. O NA é 10 + BIT do atacante. Em sucesso, sacrifica Caixas de Ferimento iguais ao seu SV + 1, mínimo 1, e o ataque é considerado bem-sucedido para efeitos relevantes. Em sucesso crítico, sacrifica apenas metade dessa quantidade, mínimo 1. Cada uso, mesmo em falha, aumenta o NA em 3 para usos posteriores até o fim do combate. Se o Digimon não puder sacrificar as Caixas de Ferimento sem ficar com 0 ou menos, não pode usar Substituir.",
    "description": "Substituir permite que o Digimon evite um ataque criando um chamariz, imagem residual ou substituto, pagando o custo em Caixas de Ferimento em vez de sofrer o Dano normal.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "almaFeroz",
    "name": "Alma Feroz",
    "originalName": "Fierce Soul",
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": {
        "key": "fierceStance",
        "label": "Postura Feroz",
        "originalLabel": "Fierce Stance"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stance",
      "action": "stanceChange",
      "chatMessage": "O Digimon entra em Postura Feroz usando a Ação Trocar Postura."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "turn"
    },
    "stance": {
      "key": "fierceStance",
      "label": "Postura Feroz",
      "originalLabel": "Fierce Stance",
      "effects": {
        "damageBonusFrom": "sv",
        "movementPenaltyFrom": "sv",
        "rangePenaltyFrom": "sv"
      },
      "trigger": {
        "when": "missAttack",
        "frequency": "oncePerTurn",
        "reset": "endOfDigimonTurn",
        "effect": "Se o Digimon errar um de seus ataques, o mesmo ataque pode ser usado imediatamente de novo contra o mesmo alvo como Ação Livre. O alvo ainda sofre a penalidade de Esquiva do ataque inicial. Se usado com Movimento Assinatura, mantém a Bateria do ataque inicial. Para usar com uma Área de Ataque, o ataque precisa ter errado todos os alvos."
      }
    },
    "effect": "O Digimon ganha acesso à Postura Feroz e pode entrar nela usando a Ação Trocar Postura. Enquanto estiver em Postura Feroz, recebe bônus de Dano igual ao seu SV, mas sofre penalidade de Movimento e Alcance igual ao mesmo valor. Também enquanto estiver nessa postura, se errar um de seus ataques, pode usar imediatamente o mesmo ataque contra o mesmo alvo como Ação Livre, uma vez por turno. O alvo ainda sofre a penalidade de Esquiva do ataque inicial. Se isso for usado com um Movimento Assinatura, mantém a Bateria do ataque inicial. Para usar com uma Área de Ataque, o ataque precisa ter errado todos os alvos.",
    "description": "Alma Feroz libera uma postura agressiva que sacrifica mobilidade e alcance para aumentar o Dano e permitir uma segunda tentativa imediata após errar um ataque.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "coracaoCorajoso",
    "name": "Coração Corajoso",
    "originalName": "Brave Heart",
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": {
        "key": "braveStance",
        "label": "Postura Corajosa",
        "originalLabel": "Brave Stance"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stance",
      "action": "stanceChange",
      "chatMessage": "O Digimon entra em Postura Corajosa usando a Ação Trocar Postura."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "stance": {
      "key": "braveStance",
      "label": "Postura Corajosa",
      "originalLabel": "Brave Stance",
      "effects": {
        "armorBonusFrom": "sv",
        "movementPenaltyFrom": "sv"
      },
      "trigger": {
        "when": "surviveAfterIntercede",
        "frequency": "whileInStance",
        "effect": "Se o Digimon escolher Interceder enquanto estiver em Postura Corajosa e sobreviver ao ataque no fim da troca, ele recebe um bônus temporário de Dano para cada aliado dentro de alcance igual ao seu CPU. Esse bônus termina após o próximo ataque [DAMAGE] bem-sucedido ou no fim do combate."
      }
    },
    "effect": "O Digimon ganha acesso à Postura Corajosa e pode entrar nela usando a Ação Trocar Postura. Enquanto estiver em Postura Corajosa, recebe bônus de Armadura igual ao seu SV, mas sofre penalidade de Movimento igual ao mesmo valor. Se escolher Interceder enquanto estiver nessa postura e sobreviver ao ataque no fim da troca, para cada aliado dentro de alcance igual ao seu CPU, o Digimon recebe um bônus temporário de Dano. Esse bônus termina após o próximo ataque [DAMAGE] bem-sucedido ou no fim do combate.",
    "description": "Coração Corajoso libera uma postura defensiva que aumenta a Armadura, reduz o Movimento e recompensa o Digimon por proteger aliados em combate.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "segundoFolego",
    "name": "Segundo Fôlego",
    "originalName": "Second Wind",
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Só pode ser usado em combate.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Faça um Teste de Recuperação no meio do combate."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "recovery": {
      "enabled": true,
      "pool": "health",
      "regainWoundsFromResult": true,
      "cannotAttackThisTurn": true,
      "endOfCombatBonusIfUnused": 3
    },
    "effect": "Esta Qualidade só pode ser usada em combate. O Digimon pode fazer um Teste de Recuperação como 1 Ação no meio do combate, rolando sua Saúde como Pool e recuperando Caixas de Ferimento perdidas iguais ao resultado. O Digimon não pode realizar uma Ação de Ataque no turno em que usa esta Qualidade. Pode usar esta Qualidade uma vez por combate. Se ela não tiver sido usada quando o combate terminar, o Digimon recebe +3 Sucessos no Teste de Recuperação que fizer ao fim do combate.",
    "description": "Segundo Fôlego permite que o Digimon recupere forças durante a luta ou, se resistir sem usar essa reserva, se recupere melhor ao fim do combate.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "mestreDaMatilha",
    "name": "Mestre da Matilha",
    "originalName": "Pack Master",
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "actionCost": 0,
      "chatMessage": "Quando o Digimon seria alvo de um ataque, um aliado adjacente pode Interceder como Ação Livre."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "effect": "Se o Digimon seria alvo de um ataque, um aliado adjacente pode Interceder como Ação Livre uma vez por rodada.",
    "description": "Mestre da Matilha permite que aliados próximos protejam o Digimon com maior facilidade, reforçando uma dinâmica de grupo ou formação defensiva.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "energiaVital",
    "name": "Energia Vital",
    "originalName": "Vital Energy",
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Doença"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "instant",
      "chatMessage": "Rerrole resultados baixos em um Teste de Saúde."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "effect": "Rank 1: uma vez por rodada, o Digimon pode rerrolar quaisquer resultados 1 ao fazer um Teste de Saúde. Rank 2: também pode rerrolar resultados 2 na mesma rolagem.",
    "description": "Energia Vital melhora a resistência do Digimon em Testes de Saúde, permitindo refazer resultados baixos.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "acrobata",
    "name": "Acrobata",
    "originalName": "Tumbler",
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "crashDamageReductionFrom": "ram"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon recebe redução de Dano bônus igual ao seu RAM ao sofrer Dano de Colisão. Se também possuir a Qualidade Mobilidade Avançada: Saltador, ignora todo Dano de Colisão causado por queda.",
    "description": "Acrobata reduz o impacto de quedas, colisões e manobras bruscas, tornando o Digimon mais resistente a acidentes de movimento.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "impulsoDeSistema",
    "name": "Impulso de Sistema",
    "originalName": "System Boost",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "discountAvailable": true,
      "discount": {
        "firstPurchase": 1
      },
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 4,
      "limited": true
    },
    "rankLimit": {
      "type": "byStageMaxFour",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 4,
        "ultimatePlus": 4
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "O número de Ranks que o Digimon pode comprar nesta Qualidade é igual ao seu Estágio, até o máximo de 4.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Estatística Derivada",
      "cannotRepeat": true,
      "options": [
        {
          "key": "ram",
          "label": "RAM",
          "effect": "O Digimon recebe +1 em RAM."
        },
        {
          "key": "cpu",
          "label": "CPU",
          "effect": "O Digimon recebe +1 em CPU."
        },
        {
          "key": "bit",
          "label": "BIT",
          "effect": "O Digimon recebe +1 em BIT."
        },
        {
          "key": "dos",
          "label": "DOS",
          "effect": "O Digimon recebe +1 em DOS."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "derivedStatChoicePerRank": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Quando o Digimon compra um Rank nesta Qualidade, escolhe uma de suas Estatísticas Derivadas: RAM, CPU, BIT ou DOS. Ele recebe +1 na Estatística escolhida. O Digimon não pode escolher a mesma Estatística Derivada duas vezes. O número de Ranks que pode comprar é igual ao seu Estágio, até o máximo de 4. O Digimon recebe 1 PD de desconto na primeira compra desta Qualidade.",
    "description": "Impulso de Sistema melhora diretamente as Estatísticas Derivadas do Digimon, representando otimização estrutural de seus dados.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "conscienciaDeCombate",
    "name": "Consciência de Combate",
    "originalName": "Combat Awareness",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "initiativeBonus": 3,
      "treatsSurpriseRoundsAsNormal": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon recebe +3 em Iniciativa e trata Rodadas Surpresa como Rodadas normais de combate.",
    "description": "Consciência de Combate representa prontidão, reflexos táticos e capacidade de reagir mesmo em emboscadas.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "teleporte",
    "name": "Teleporte",
    "originalName": "Teleport",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Transportador"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "movementType": "teleport"
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "action": "teleport",
      "chatMessage": "Use a Ação Teleporte para se mover instantaneamente para um local desocupado visível."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "teleport": {
      "rangeFormula": "stage + 2 + instinctRanks + speedsterBonus",
      "ignoresDifficultTerrain": true,
      "requiresVisibleUnoccupiedLocation": true,
      "instinctAddsDistance": true,
      "speedsterBonus": 1,
      "interruptEscape": {
        "enabled": true,
        "usesSharedCombatUse": true,
        "causesAttackToMiss": true,
        "doesNotTriggerMissEffects": true
      },
      "clashEscape": {
        "enabled": true,
        "usesSharedCombatUse": true,
        "automaticallyEscapesClash": true
      }
    },
    "effect": "O Digimon é capaz de se teleportar instantaneamente usando a Ação Teleporte. Diferente da Ação Mover, a Ação Teleporte permite que ele chegue imediatamente a um local desocupado que possa ver dentro de uma quantidade de espaços igual ao seu Estágio + 2, sem ser afetado por Terreno Difícil. O Digimon soma seus Ranks em Instinto à distância de Teleporte e recebe +1 adicional se tiver Otimização de Dados: Velocista. Uma vez por combate, também pode usar esta Qualidade para realizar a Ação Teleporte como Ação de Interrupção e escapar de um ataque inimigo, fazendo o ataque errar. Alternativamente, esse uso de uma vez por combate pode ser usado como Ação de Clash para escapar automaticamente do Clash. Usar Teleporte para fazer um ataque errar não ativa Qualidades ou efeitos que exijam um ataque errado.",
    "description": "Teleporte permite deslocamento instantâneo, fuga reativa e escape de Clash, tornando o Digimon extremamente difícil de prender.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "glamour",
    "name": "Glamour",
    "originalName": "Glamor",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Aplique um Glamour para alterar a aparência de aliados."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "performance",
      "tnFormula": "10",
      "penaltyFormula": "numberOfTargetsBesidesUser",
      "opposedBy": {
        "stat": "dos",
        "skill": "awareness",
        "tn": "illusionResult"
      }
    },
    "illusion": {
      "rangeFrom": "range",
      "canAffectMinions": true,
      "affectsAnyNumberOfTargets": true,
      "canChangeApparentSize": true,
      "sizeLimitedByCurrentStage": true,
      "canSwapWithAdjacentWillingAlly": true,
      "teleportAllowsSwapWithinTeleportRange": true,
      "establishedAppearanceRequired": true,
      "endsWhen": [
        "O Digimon que criou o Glamour cria um novo Glamour.",
        "O Digimon é reduzido a 0 Caixas de Ferimento.",
        "O Digimon deixa de ter acesso a esta Qualidade, como ao evoluir para um novo Estágio.",
        "Um alvo glamorizado não consegue manter seu disfarce, como em uma falha em Teste de Manipular.",
        "Um alvo glamorizado é agarrado fisicamente por uma entidade que questiona sua integridade ou é atingido por um ataque corpo a corpo.",
        "Um alvo glamorizado que aparenta ter tamanho diferente do real é atacado."
      ]
    },
    "effect": "O Digimon pode aplicar um Glamour a seus aliados, permitindo que tenham uma aparência diferente. Isso pode afetar qualquer número de alvos, incluindo Lacaios, dentro de espaços iguais ao Alcance do Digimon, e exige 2 Ações. O Digimon faz um Teste BIT (Performance) com penalidade igual ao número de alvos afetados além de si mesmo; o NA é 10. A aparência criada deve ser estabelecida e consistente. O Glamour também pode fazer um Digimon parecer maior ou menor, mas apenas dentro de tamanhos acessíveis ao seu Estágio atual. Se afetar a si mesmo e um aliado disposto adjacente, o Digimon pode trocar de lugar com esse aliado quando cria a ilusão, desde que ela seja criada com sucesso. Se possuir Teleporte, pode trocar de lugar com qualquer aliado disposto dentro de seu alcance de Teleporte. Quem questionar a integridade da aparência pode fazer um Teste DOS (Percepção) com NA igual ao resultado bem-sucedido da ilusão para determinar se acredita nela.",
    "description": "Glamour cria disfarces ilusórios sobre aliados, permitindo infiltração, confusão visual e troca de posição com aliados disfarçados.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "sobreposicaoIlusoria",
    "name": "Sobreposição Ilusória",
    "originalName": "Illusionary Overlay",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Ao comprar esta Qualidade, escolha Mortalha Ilusória ou Barreiras Ilusórias. Mortalha Ilusória requer Passo Natural.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Tipo de Sobreposição",
      "options": [
        {
          "key": "illusionaryShroud",
          "label": "Mortalha Ilusória",
          "originalLabel": "Illusionary Shroud",
          "requirements": {
            "text": "Requer Passo Natural.",
            "qualityNames": "Passo Natural"
          },
          "effect": "O Digimon conjura uma mortalha ilusória. Pode escolher se seus aliados enxergam automaticamente através da ilusão. Também escolhe um Elemento que a mortalha imita, como fumaça intensa para Fogo. Digimon afetados que não possuam o Passo Natural associado ficam Cegos enquanto estiverem dentro da ilusão. Do lado de fora, Digimon dentro da ilusão são considerados obscurecidos por Digimon afetados."
        },
        {
          "key": "illusionaryBarriers",
          "label": "Barreiras Ilusórias",
          "originalLabel": "Illusionary Barriers",
          "requirements": {
            "text": "",
            "qualityNames": ""
          },
          "effect": "O Digimon conjura barreiras ilusórias, que podem parecer transparentes ou sólidas. Pode escolher se seus aliados sabem automaticamente que as barreiras são falsas, mas isso não permite que vejam através delas. Um inimigo não pode se mover ou atacar através das paredes enquanto acreditar na ilusão, geralmente até fazer um Teste de Percepção ou ser atacado através das barreiras."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Crie uma Sobreposição Ilusória usando BIT (Manipular)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "manipulate",
      "tnFormula": "8 + enemyCount",
      "consecutiveUseTnIncrease": 3,
      "opposedBy": {
        "stat": "dos",
        "skill": "awareness",
        "tn": "illusionResult"
      }
    },
    "illusion": {
      "rangeFrom": "bit",
      "actionCost": 2,
      "cannotMoveWithCreator": true,
      "endsWhen": [
        "A ilusão é atacada com um Ataque Mirado.",
        "O Digimon usa 2 Ações para criar uma nova Sobreposição Ilusória.",
        "O Digimon que criou a Sobreposição se afasta mais que seu BIT do ponto de criação."
      ],
      "awarenessResults": {
        "criticalFailure": "Nada acontece.",
        "failure": "O Digimon percebe que pode atacar as paredes ilusórias ou vê criaturas dentro da mortalha como obscurecidas.",
        "success": "A ilusão é quebrada para aquele Digimon e o efeito termina para ele.",
        "criticalSuccess": "A ilusão é quebrada, e o NA para criar ilusões futuras aumenta em 3 adicional."
      },
      "canAlertAlliesOnSuccess": true,
      "alertActionCost": 1
    },
    "effect": "O Digimon sobrepõe ilusões à realidade usando suas capacidades elementais, manipulando a aparência do ambiente dentro de alcance igual ao seu BIT. Isso exige 2 Ações e um Teste BIT (Manipular) com NA 8 + a quantidade de inimigos em combate. Ao comprar esta Qualidade, escolha Mortalha Ilusória ou Barreiras Ilusórias. Quem questionar a integridade da aparência pode fazer um Teste DOS (Percepção) com NA igual ao resultado da ilusão para determinar se acredita nela. Após esta Qualidade ser usada uma vez em combate, o NA aumenta em 3 para cada uso consecutivo até o fim do combate.",
    "description": "Sobreposição Ilusória permite criar mortalhas ambientais ou barreiras falsas, manipulando percepção, cobertura e controle de campo.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "tecnico",
    "name": "Técnico",
    "originalName": "Technician",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Firewall",
      "Trojan",
      "Varredura de Dados"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "technicianBonus": 3,
      "readsDigicode": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Um Digimon com Técnico é habilidoso em reparar código e tecnologia e, por padrão, pode ler e compreender Digicódigo para seu Tamer. Ele pode interagir com o código do Mundo Digital, entender a natureza e propósito de certas áreas e notar quando algo está errado no ambiente, como a corrupção causada por um Digimon Vírus poderoso. O Digimon recebe +3 em Testes envolvendo reparar ou decifrar código, reparar ou decifrar maquinário, compreender ou obter informações sobre o ambiente atual, incluindo se ele está corrompido, e reconstruir coisas no Mundo Digital, como prédios, máquinas ou ambientes.",
    "description": "Técnico representa domínio de código, máquinas e estruturas digitais.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "firewall",
    "name": "Firewall",
    "originalName": "Firewall",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Técnico.",
      "qualityNames": "Técnico"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "technicianBonusIncrease": 3,
      "firewallApplications": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon aumenta o bônus fornecido por Técnico em +3 e agora também pode adicionar seu bônus de Técnico ao expulsar intrusos que entrem em uma área do Mundo Digital por hacking ou manipulação de código, proteger e reforçar qualquer código em que esteja trabalhando ou reparando, manter um Controle de Domínio, e resistir a efeitos que mexam com seu próprio código, como Supressão.",
    "description": "Firewall expande Técnico para defesa, proteção e reforço de código.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "trojan",
    "name": "Trojan",
    "originalName": "Trojan",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Técnico.",
      "qualityNames": "Técnico"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "technicianBonusIncrease": 3,
      "trojanApplications": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon aumenta o bônus fornecido por Técnico em +3 e agora também pode adicionar seu bônus de Técnico ao manipular código para acessar áreas protegidas, danificar ou corromper código, e danificar ou corromper maquinário. O Narrador determina os limites dessas capacidades, então jogador e Narrador devem discutir o que o Digimon será capaz de fazer ao adquirir esta Qualidade.",
    "description": "Trojan expande Técnico para invasão, corrupção e sabotagem de código ou máquinas.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "forcaMonstruosa",
    "name": "Força Monstruosa",
    "originalName": "Monster Strength",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Poder Titânico"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canControlClashAgainstAnySize": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "canControlAgainstAnySize": true,
      "moveClashAction": {
        "enabled": true,
        "targetSameSizeOrSmaller": true,
        "checkOptions": [
          {
            "stat": "cpu",
            "skill": "featsOfStrength",
            "tnFormula": "10 + opponentCpu"
          },
          {
            "type": "clashCheck",
            "tnFormula": "10 + opponentClash"
          }
        ],
        "result": {
          "failure": "O oponente não é movido.",
          "success": "O oponente se move junto com o Digimon, mas o Digimon só pode se mover metade dos espaços.",
          "criticalSuccess": "O oponente se move junto com o Digimon, sem penalidade de movimento."
        }
      }
    },
    "effect": "O Digimon pode controlar um Clash normalmente contra qualquer tamanho. Quando usa a Ação de Clash Mover, se o oponente no Clash for do mesmo tamanho ou menor, o Digimon pode forçar o oponente a se mover junto com ele. Para isso, faz um Teste CPU (Feitos de Força) com NA igual a 10 + CPU do oponente. Alternativamente, pode fazer um Teste de Clash com NA igual a 10 + Clash do oponente. Em falha, o oponente não é movido. Em sucesso, o oponente se move junto com o Digimon, mas o Digimon só pode se mover metade dos espaços. Em sucesso crítico, o Digimon não sofre penalidade de movimento.",
    "description": "Força Monstruosa permite dominar o posicionamento em Clash mesmo contra oponentes enormes, arrastando inimigos durante o movimento.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "imobilizacaoExposta",
    "name": "Imobilização Exposta",
    "originalName": "Exposing Hold",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao controlar um Clash com sucesso, ative esta Qualidade para expor o oponente."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "triggerWhenControlsClash": true,
      "lastsUntilNextControlAttempt": true,
      "cannotUsePinThisTurn": true,
      "outsideDamageReduction": {
        "normal": "halfOpponentCpu",
        "support": "halfOpponentRam"
      }
    },
    "effect": "Quando o Digimon rola para controlar um Clash e tem sucesso, pode ativar esta Qualidade até sua próxima tentativa de controlar um Clash. Ele não pode usar a Ação de Clash Imobilizar neste turno, mas o oponente reduz o Dano recebido de ataques externos apenas pela metade do próprio CPU, em vez de metade dos CPUs combinados. A mesma lógica se aplica a ataques [SUPPORT], usando metade do RAM do oponente em vez de metade dos RAMs combinados.",
    "description": "Imobilização Exposta prende o oponente de forma vulnerável, tornando ataques externos mais eficazes contra ele.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "aQueimaRoupa",
    "name": "À Queima-Roupa",
    "originalName": "Point Blank",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canUseRangedAttacksInClash": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "canUseMeleeAndRangeAgainstOpponent": true,
      "rangedAttacksIgnoreAdjacentEnemyPenalty": true,
      "recoilEndsClash": true,
      "canMakeWeakAttackWithRange": true
    },
    "effect": "Enquanto estiver em Clash, o Digimon pode usar ataques [MELEE] e [RANGE] contra seu oponente. Se usar um ataque [RANGE], não sofre penalidade por inimigos dentro de 1 espaço. Se o ataque tiver [RECOIL], ele encerra imediatamente o Clash e aplica os efeitos normais, embora o alvo ainda role metade da Pool de Esquiva. O Digimon também pode fazer um Ataque Fraco com [RANGE] em vez de [MELEE].",
    "description": "À Queima-Roupa permite usar ataques à distância mesmo preso em Clash, transformando proximidade extrema em vantagem.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "escorregadio",
    "name": "Escorregadio",
    "originalName": "Slippery",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "canUseRamX2InsteadOfClash": true,
      "appliesWhenEnemyInitiatesClash": true,
      "appliesWhenEscapingClash": true,
      "result": {
        "higherThanInitiator": "A tentativa de Clash termina imediatamente e quem iniciou o Clash não pode tentar entrar em Clash com este Digimon novamente até a próxima rodada.",
        "lowerThanInitiator": "Quem iniciou o Clash controla imediatamente o Clash."
      }
    },
    "effect": "O Digimon é incrivelmente difícil de segurar. Quando um inimigo tenta iniciar um Clash com ele, ou quando o Digimon tenta usar a Ação Escapar do Clash, pode fazer um Teste RAM×2 em vez de um Teste de Clash. Se o resultado do Digimon for maior que o Teste de Clash do iniciador, a tentativa de Clash termina imediatamente e quem iniciou o Clash não pode tentar entrar em Clash com este Digimon novamente até a próxima rodada. Se o resultado do Digimon for menor, o iniciador controla imediatamente o Clash.",
    "description": "Escorregadio permite evitar agarrões, contenções e disputas físicas usando agilidade em vez de força de Clash.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "arremessoEspecial",
    "name": "Arremesso Especial",
    "originalName": "Fastball",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "O aliado arremessado precisa estar disposto e ser pelo menos um tamanho menor, a menos que o Digimon também possua Força Monstruosa.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "areaIntercedeActionCost": 1
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Arremesse um aliado disposto dentro do seu alcance de Clash."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "throwWillingAlly": true,
      "allyMinimumSizeSmaller": 1,
      "monsterStrengthIgnoresSizeRestriction": true,
      "thrownAllyTakesThrowDamageUnlessTumbler": true,
      "chargeInteraction": {
        "enabled": true,
        "thrownAllyCanInterruptWithChargeAttack": true,
        "thrownAllyDoesNotMoveDuringChargeAttack": true,
        "ifThrowTargetsMultipleEnemiesThrownAllyTargetsOne": true,
        "canForfeitOwnOncePerRoundAttackToUseAllyChargeInstead": true,
        "bypassesOwnOneAttackPerRoundRule": true
      },
      "twoActionUse": {
        "enabled": true,
        "actionCost": 2,
        "grantsThrownAllyAdditionalActionForAttack": 1,
        "canMakeInterruptPotentiallyFree": true
      },
      "areaIntercede": {
        "actionCost": 1
      }
    },
    "effect": "O Digimon pode arremessar um aliado disposto que seja pelo menos um tamanho menor e esteja dentro de seu alcance de Clash como 1 Ação. O aliado sofre Dano conforme as regras normais de arremesso, a menos que tenha Acrobata. Se o aliado tiver um ataque com a Tag [CHARGE] e for arremessado contra um inimigo, pode fazer uma Ação de Interrupção para realizar um ataque [CHARGE] contra esse mesmo inimigo, mas o Digimon que faz o ataque não se move. Se o arremesso mirar múltiplos inimigos, o aliado arremessado mira apenas um deles. Em vez de fazer o ataque [RANGE] padrão do arremesso, o Digimon também pode abrir mão de seu ataque uma vez por rodada e tratar o ataque [CHARGE] do aliado como esse ataque, ignorando sua própria regra de um ataque por rodada. O Digimon pode usar Arremesso Especial como 2 Ações para fornecer ao aliado arremessado 1 Ação adicional para o ataque, tornando a Interrupção potencialmente gratuita. Se também possuir Força Monstruosa, não sofre a restrição de tamanho. Além disso, o Digimon pode usar Interceder em Área como 1 Ação em vez de 2.",
    "description": "Arremesso Especial transforma aliados menores em projéteis táticos, combinando arremesso, investida e posicionamento em equipe.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "sequestradorDeGigantes",
    "name": "Sequestrador de Gigantes",
    "originalName": "Giant Hijacker",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Só pode ser usado contra um Digimon pelo menos um tamanho maior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Um Digimon não pode entrar em Clash com outro Digimon compartilhando seu espaço por meio desta Qualidade.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Tente subir em um inimigo muito maior para impedir que ele fuja livremente."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "cpu",
      "skill": "athletics",
      "tnFormula": "10 + targetRam - targetCpu",
      "notes": "Só pode ser tentado contra um Digimon pelo menos um tamanho maior."
    },
    "result": {
      "criticalFailure": "O Digimon falha e sofre [SLOW 2] até o início do próximo turno.",
      "failure": "Nada acontece.",
      "success": "O Digimon é considerado como compartilhando o mesmo espaço que o alvo e se move com ele sempre que ele se mover.",
      "criticalSuccess": "Além do sucesso, o NA do Digimon maior para remover o Digimon menor aumenta em +3."
    },
    "clash": {
      "doesNotCountAsClash": true,
      "bothRetainFullActions": true,
      "noClashBenefitsOrDetriments": true,
      "smallerCanEndAsFreeAction": true,
      "largerRemoveCheck": {
        "actionCost": 1,
        "stat": "cpu",
        "tnFormula": "10 + smallerDigimonRam"
      }
    },
    "effect": "O Digimon pode tentar subir em inimigos muito maiores para garantir que eles não fujam livremente. Como 1 Ação enquanto estiver adjacente ao alvo, faz um Teste CPU (Atletismo) contra NA igual a 10 + RAM do alvo - CPU do alvo. Só pode tentar isso contra um Digimon pelo menos um tamanho maior. Em sucesso, o Digimon passa a compartilhar o mesmo espaço do alvo e se move com ele sempre que ele se mover. O Digimon menor pode encerrar isso como Ação Livre a qualquer momento ou usando Mover ou habilidade similar para sair do espaço do Digimon maior. O Digimon maior precisa usar 1 Ação e passar em um Teste CPU contra NA 10 + RAM do Digimon menor para derrubá-lo. Isso não conta como Clash; ambos mantêm o uso total de suas Ações e não sofrem penalidades nem ganham benefícios de Clash.",
    "description": "Sequestrador de Gigantes permite que um Digimon menor se prenda a um inimigo maior, acompanhando seus movimentos sem iniciar um Clash verdadeiro.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "efeitoBasico",
    "name": "Efeito Básico",
    "originalName": "Basic Effect",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "O Digimon não pode comprar o mesmo Efeito duas vezes. Um ataque não pode ter mais de uma Tag de Efeito de Ataque.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Orientação Inspiradora",
      "Overclock"
    ],
    "choices": {
      "required": true,
      "type": "effectTagPerRank",
      "label": "Tag de Efeito Básico",
      "cannotRepeat": true,
      "options": [
        {
          "key": "root",
          "label": "[ROOT]",
          "type": "negative",
          "duration": true,
          "potency": "bit",
          "effect": "O Movimento do alvo é reduzido, até o mínimo de 0."
        },
        {
          "key": "slow",
          "label": "[SLOW]",
          "type": "negative",
          "duration": true,
          "potency": "cpu",
          "effect": "A Esquiva do alvo é reduzida."
        },
        {
          "key": "vague",
          "label": "[VAGUE]",
          "type": "negative",
          "duration": true,
          "potency": "bit",
          "effect": "A Precisão do alvo é reduzida."
        },
        {
          "key": "keen",
          "label": "[KEEN]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "effect": "A Precisão do alvo é aumentada."
        },
        {
          "key": "swift",
          "label": "[SWIFT]",
          "type": "positive",
          "duration": true,
          "potency": "ram",
          "effect": "A Esquiva do alvo é aumentada."
        },
        {
          "key": "tailwind",
          "label": "[TAILWIND]",
          "type": "positive",
          "duration": true,
          "potency": "ram",
          "effect": "O Movimento do alvo é aumentado."
        },
        {
          "key": "cleanse",
          "label": "[CLEANSE]",
          "type": "unique",
          "duration": false,
          "potency": "",
          "effect": "Reduz a Duração de todos os Efeitos no alvo em 1 ao acertar com sucesso este ataque, e em mais 1 para cada 2 Sucessos que o conjurador obtiver acima da Esquiva. O conjurador pode escolher reduzir apenas Efeitos específicos ao declarar o ataque, reduzindo seus Sucessos totais de Precisão em 1. Se o alvo for aliado, ele rola Saúde como Pool, e a Duração dos Efeitos é reduzida em 1 para cada 3 Sucessos somados entre a Pool do conjurador e a Pool do alvo. Um ataque de área [CLEANSE] reduz o número total de Sucessos de Precisão em 1 e exige declarar se afeta aliados ou inimigos."
        },
        {
          "key": "fear",
          "label": "[FEAR]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "A Precisão do alvo é reduzida pelo DOS do conjurador + bônus de Potência em ataques contra o conjurador. O alvo também não pode iniciar ou controlar um Clash com o conjurador. Se o alvo for afetado por múltiplos [FEAR], apenas o conjurador mais recente conta. Se um Ataque de Área incluir o conjurador como alvo, a Precisão é reduzida por metade do DOS do conjurador. Este Efeito termina imediatamente se o conjurador aplicar [TAUNT] ao alvo. Quando o alvo se move voluntariamente em direção ao conjurador, a distância total que pode mover é reduzida em 1. No fim dos turnos do alvo, ou como 1 Ação uma vez por turno, ele pode fazer um Teste DOS (Bravura) com NA 12 + DOS do conjurador. Em sucesso, reduz a Duração em 1; em sucesso crítico, o Efeito termina. Um [FEAR] de área reduz o valor deste Efeito em 1."
        },
        {
          "key": "doom",
          "label": "[DOOM]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "Se o alvo ganharia Caixas de Ferimento ou Caixas de Ferimento Temporárias, subtraia primeiro do valor deste Efeito, que é igual ao DOS do conjurador + bônus de Potência. Este Efeito termina cedo se sua Potência for reduzida a 0. No fim dos turnos do alvo, ou como 1 Ação uma vez por turno, ele pode fazer um Teste CPU (Resistência) com NA 12 + DOS do conjurador. Em sucesso, reduz o valor em 1; em sucesso crítico, reduz o valor em 3. Um [DOOM] de área reduz o valor deste Efeito em 1."
        },
        {
          "key": "taunt",
          "label": "[TAUNT]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "A Precisão do alvo é reduzida pelo CPU do conjurador + bônus de Potência em ataques contra qualquer um que não seja o conjurador. Se o alvo for afetado por múltiplos [TAUNT], apenas o conjurador mais recente conta. Se um Ataque de Área incluir o conjurador como alvo, a Precisão é reduzida por metade do CPU do conjurador. Este Efeito termina imediatamente se o conjurador aplicar [FEAR] ao alvo. Quando o alvo se move voluntariamente para longe do conjurador, a distância total que pode mover é reduzida em 1. No fim dos turnos do alvo, ou como 1 Ação uma vez por turno, ele pode fazer um Teste DOS (Fortitude) com NA 12 + CPU do conjurador. Em sucesso, reduz a Duração em 1; em sucesso crítico, o Efeito termina. Um [TAUNT] de área reduz o valor deste Efeito em 1."
        },
        {
          "key": "pull",
          "label": "[PULL]",
          "type": "unique",
          "duration": false,
          "potency": "",
          "effect": "O alvo é movido em direção ao conjurador uma quantidade de espaços igual ao DOS do conjurador + bônus de Potência, até o espaço desocupado mais próximo em que caiba. Essa distância é reduzida pelo tamanho do alvo: Enorme -1, Gigantesco -3, Colossal -5. Em um ataque [SUPPORT], os espaços movidos aumentam em 1 para cada 2 Sucessos acima da Esquiva do alvo. Se o alvo for aliado, ele rola Saúde como Pool e os espaços movidos aumentam em 1 para cada 3 Sucessos somados entre a Pool do conjurador e a Pool do alvo. Um [PULL] de área reduz o total de espaços puxados em 2."
        },
        {
          "key": "push",
          "label": "[PUSH]",
          "type": "unique",
          "duration": false,
          "potency": "",
          "effect": "O alvo é movido para longe do conjurador uma quantidade de espaços igual ao CPU do conjurador, ou metade disso em um ataque [RANGE], + bônus de Potência. Essa distância é reduzida pelo tamanho do alvo: Enorme -1, Gigantesco -3, Colossal -5. Em um ataque [SUPPORT], os espaços movidos aumentam em 1 para cada 2 Sucessos acima da Esquiva do alvo. Se o alvo for aliado, ele rola Saúde como Pool e os espaços movidos aumentam em 1 para cada 3 Sucessos somados entre a Pool do conjurador e a Pool do alvo. Um [PUSH] de área reduz o total de espaços empurrados em 2."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": [
        "root",
        "slow",
        "vague",
        "keen",
        "swift",
        "tailwind",
        "cleanse",
        "fear",
        "doom",
        "taunt",
        "pull",
        "push"
      ],
      "appliesTo": "oneAttackPerPurchasedEffect",
      "onlyOneEffectTagPerAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effectRules": {
      "cannotAffectCasterWithEffectTagAttack": true,
      "positiveSelfUseRequiresOverclock": true,
      "supportAttackAppliesOnHit": true,
      "damageAttackRequiresDamageAfterArmor": 2,
      "maxEffectDuration": 3,
      "potencyReducedByResistance": true,
      "potencyMinimumAfterBonuses": 2,
      "uniqueEffectsHaveNoPotency": true,
      "statChangesAffectTotalStatsOnly": true,
      "totalStatsCannotDropBelow": 1,
      "maxUnalterableDamageFromEffectsPerRound": "targetSv * 2"
    },
    "effect": "O Digimon pode aplicar uma Tag de Efeito Básico comprada a um ataque. Cada Efeito comprado é aplicado a um ataque, e o mesmo Efeito não pode ser comprado duas vezes. Um ataque não pode ter mais de uma Tag de Efeito de Ataque. Efeitos em ataques [SUPPORT] precisam apenas acertar para serem aplicados; efeitos em ataques [DAMAGE] exigem que o ataque cause pelo menos 2 Dano após Armadura, sem contar Dano Inalterável.",
    "description": "Efeitos Básicos adicionam condições, bônus, penalidades, deslocamentos ou efeitos únicos aos ataques do Digimon.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "efeitoAvancado",
    "name": "Efeito Avançado",
    "originalName": "Advanced Effect",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "O Digimon não pode comprar o mesmo Efeito duas vezes. Um ataque não pode ter mais de uma Tag de Efeito de Ataque.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Orientação Inspiradora",
      "Overclock"
    ],
    "choices": {
      "required": true,
      "type": "effectTagPerRank",
      "label": "Tag de Efeito Avançado",
      "cannotRepeat": true,
      "options": [
        {
          "key": "confuse",
          "label": "[CONFUSE]",
          "type": "negative",
          "duration": true,
          "potency": "special",
          "effect": "A Potência deste Efeito é a maior Estatística Derivada do alvo. A Estatística associada a essa Estatística Derivada é reduzida. Se o alvo tiver duas ou mais Estatísticas Derivadas empatadas, reduz a Estatística Principal mais alta associada. Se também houver empate entre Estatísticas Principais, o conjurador escolhe qual reduzir."
        },
        {
          "key": "distract",
          "label": "[DISTRACT]",
          "type": "negative",
          "duration": true,
          "potency": "ram",
          "extraActionRequired": true,
          "effect": "Precisão e Esquiva são reduzidas. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "dull",
          "label": "[DULL]",
          "type": "negative",
          "duration": true,
          "potency": "cpu",
          "effect": "O Dano do alvo é reduzido."
        },
        {
          "key": "frail",
          "label": "[FRAIL]",
          "type": "negative",
          "duration": true,
          "potency": "dos",
          "effect": "A Armadura do alvo é reduzida."
        },
        {
          "key": "heavy",
          "label": "[HEAVY]",
          "type": "negative",
          "duration": true,
          "potency": "dos",
          "effect": "O Movimento do alvo é reduzido, a menos que ele tenha Movimento Extra e/ou Teleporte; nesse caso, perde os benefícios dessas Qualidades em vez disso. Se tiver Mobilidade Avançada, perde os benefícios dela antes de perder o Movimento Extra associado. Se tiver Transportador, perde seus benefícios antes de perder Teleporte. O alvo ainda pode usar a Ação Resistir para remover este Efeito, mesmo se a Potência não estiver afetando Movimento."
        },
        {
          "key": "nimble",
          "label": "[NIMBLE]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "Precisão e Esquiva são aumentadas. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "sharpen",
          "label": "[SHARPEN]",
          "type": "positive",
          "duration": true,
          "potency": "ram",
          "effect": "O Dano do alvo é aumentado."
        },
        {
          "key": "sturdy",
          "label": "[STURDY]",
          "type": "positive",
          "duration": true,
          "potency": "dos",
          "effect": "A Armadura do alvo é aumentada."
        },
        {
          "key": "burn",
          "label": "[BURN]",
          "type": "damage",
          "duration": true,
          "potency": "",
          "requiresDamageTag": true,
          "effect": "Sempre que o alvo se move, sofre Dano Inalterável ao fim do movimento para cada espaço movido. Se for movido contra sua vontade, como por [PUSH] ou por ser arremessado, sofre Dano apenas para cada 2 espaços movidos. Um ataque com esta Tag precisa ter a Tag [DAMAGE]. O Dano deste Efeito é reduzido em 1 para cada outro Efeito de Dano no alvo."
        },
        {
          "key": "freeze",
          "label": "[FREEZE]",
          "type": "damage",
          "duration": true,
          "potency": "",
          "requiresDamageTag": true,
          "effect": "O alvo sofre 2 Dano Inalterável no fim de cada um de seus turnos para cada Ação que realizou que não esteja relacionada a movimento. Durante Clash, se o Digimon só tiver acesso à única Ação de Clash, sofre 4 Dano Inalterável ao fim do turno se não recuperar o uso da segunda Ação. Usar a Ação Escapar do Clash conta como Ação relacionada a movimento. Um ataque com esta Tag precisa ter [DAMAGE]. O Dano deste Efeito é reduzido em 1 para cada outro Efeito de Dano no alvo."
        },
        {
          "key": "poison",
          "label": "[POISON]",
          "type": "damage",
          "duration": true,
          "potency": "special",
          "effect": "O alvo sofre Dano Inalterável igual ao seu CPU no fim de cada um de seus turnos. O Dano deste Efeito é reduzido em 1 para cada outro Efeito de Dano no alvo."
        },
        {
          "key": "haste",
          "label": "[HASTE]",
          "type": "unique",
          "duration": "special",
          "potency": "",
          "extraActionRequired": true,
          "onlyAffectsAllies": true,
          "effect": "O alvo ganha 1 Ação extra e recebe este Efeito até o fim de seu próximo turno ou até essa Ação ser gasta. O alvo pode perder a Ação extra se este Efeito for removido antes do fim da Duração. Se usar essa Ação extra para fazer um ataque, ignora a regra de um ataque por rodada. Um ataque com esta Tag exige 1 Ação extra e só afeta aliados. Um Digimon não pode ter [HASTE] e uma Tag de Área de Ataque no mesmo ataque, a menos que ambas estejam em um Movimento Assinatura; nesse caso, exige 2 Bateria para ativar a Área de Ataque."
        },
        {
          "key": "immune",
          "label": "[IMMUNE]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "onlyAffectsAllies": true,
          "effect": "Reduz a Duração de Efeitos Negativos ou de Dano recebidos em 1, até o mínimo de 1, pela Duração. Este ataque só afeta aliados."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": [
        "confuse",
        "distract",
        "dull",
        "frail",
        "heavy",
        "nimble",
        "sharpen",
        "sturdy",
        "burn",
        "freeze",
        "poison",
        "haste",
        "immune"
      ],
      "appliesTo": "oneAttackPerPurchasedEffect",
      "onlyOneEffectTagPerAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effectRules": {
      "cannotAffectCasterWithEffectTagAttack": true,
      "positiveSelfUseRequiresOverclock": true,
      "supportAttackAppliesOnHit": true,
      "damageAttackRequiresDamageAfterArmor": 2,
      "maxEffectDuration": 3,
      "potencyReducedByResistance": true,
      "potencyMinimumAfterBonuses": 2,
      "uniqueEffectsHaveNoPotency": true,
      "statChangesAffectTotalStatsOnly": true,
      "totalStatsCannotDropBelow": 1,
      "maxUnalterableDamageFromEffectsPerRound": "targetSv * 2"
    },
    "effect": "O Digimon pode aplicar uma Tag de Efeito Avançado comprada a um ataque. Cada Efeito comprado é aplicado a um ataque, e o mesmo Efeito não pode ser comprado duas vezes. Um ataque não pode ter mais de uma Tag de Efeito de Ataque.",
    "description": "Efeitos Avançados oferecem penalidades, melhorias, efeitos de dano e efeitos únicos mais fortes que os Efeitos Básicos.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "orientacaoInspiradora",
    "name": "Orientação Inspiradora",
    "originalName": "Inspiring Guidance",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer 1 Rank de Efeito Básico, Efeito Avançado ou Efeito Mestre. Só pode ser aplicada a um ataque [SUPPORT] com Efeito Positivo.",
      "qualityNames": "Efeito Básico, Efeito Avançado, Efeito Mestre"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [SUPPORT] com Efeito Positivo e [GUIDING]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "guiding"
      ],
      "appliesTo": "oneSupportAttackWithPositiveEffect",
      "maxRanksEqualDpSpentOnPositiveEffect": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "persuasion",
      "tnFormula": "15 - casterDos"
    },
    "result": {
      "criticalFailure": "A Duração do Efeito Positivo é reduzida em 1, até o mínimo de 1.",
      "failure": "O ataque ocorre normalmente.",
      "success": "O alvo também recebe uma reserva temporária de d6s igual aos Ranks nesta Qualidade, chamada Dados de Orientação.",
      "criticalSuccess": "O alvo recebe 1 Dado de Orientação adicional."
    },
    "effect": "O Digimon pode aplicar a Tag [GUIDING] a um ataque [SUPPORT] com Efeito Positivo. [GUIDING] só pode ser aplicada a um ataque por Digimon, e o número de Ranks que pode comprar é igual ao PD gasto no Efeito Positivo desse mesmo ataque. Quando o Digimon aplica com sucesso um Efeito a um aliado com um ataque [GUIDING], também rola um Teste BIT (Persuasão) com NA igual a 15 - DOS do Digimon. Em sucesso, o alvo recebe uma reserva temporária de d6s igual aos Ranks nesta Qualidade, chamada Dados de Orientação. Pela Duração do Efeito Positivo, o alvo pode adicionar qualquer quantidade desses Dados de Orientação a qualquer Pool rolada. Dados usados não se regeneram, e o benefício termina quando todos forem gastos ou quando o Efeito Positivo terminar. Apenas um Digimon pode se beneficiar desta Qualidade por vez. Se o ataque for feito como Área de Ataque, o atacante escolhe um alvo para se beneficiar. Se esta Tag estiver em um Movimento Assinatura, concede Dados de Orientação adicionais iguais à Bateria do Digimon, independentemente do resultado do Teste.",
    "description": "Orientação Inspiradora transforma efeitos positivos em apoio tático adicional, concedendo Dados de Orientação ao aliado beneficiado.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "overclock",
    "name": "Overclock",
    "originalName": "Overclock",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Ao comprar esta Qualidade, o Digimon também deve comprar um Efeito Positivo que exija uma Estatística Derivada do conjurador, pagando o PD normalmente. Esse Efeito é aplicado a esta Qualidade em vez de a um ataque, e o Digimon não pode comprar esse Efeito novamente.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "positiveCasterDerivedEffect",
      "label": "Efeito Positivo de Overclock",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Use Overclock para aplicar em si mesmo o Efeito Positivo escolhido."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "chosenEffectDerivedStat",
      "skill": "",
      "tnFormula": "10 + casterSv",
      "extraActionIfEffectRequiresExtraAction": true
    },
    "result": {
      "criticalFailure": "Nada acontece e o Digimon não pode usar esta Qualidade novamente até o fim do combate.",
      "failure": "Nada acontece.",
      "success": "O Digimon é afetado pelo Efeito de Ataque usando sua própria Potência até o início de seu próximo turno.",
      "criticalSuccess": "O Digimon é afetado por 3 rodadas, até o fim de seu turno na terceira rodada."
    },
    "effect": "Ao comprar esta Qualidade, o Digimon também deve comprar um Efeito Positivo que exija uma Estatística Derivada do conjurador, pagando o PD normalmente. Esse Efeito é aplicado a Overclock em vez de a um ataque, e o Digimon não pode comprar esse Efeito novamente. Como 1 Ação, o Digimon faz um Teste usando a Estatística Derivada associada ao Efeito de Ataque. O NA é 10 + SV do Digimon. Em sucesso, o Digimon é afetado pelo Efeito usando sua própria Potência até o início de seu próximo turno. Em sucesso crítico, o Efeito dura 3 rodadas. Se o Efeito comprado exigir uma Ação adicional, usar Overclock também exige essa Ação adicional.",
    "description": "Overclock permite que o Digimon aplique em si mesmo um Efeito Positivo normalmente associado a ataques de suporte.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "escudoProtetor",
    "name": "Escudo Protetor",
    "originalName": "Protecting Shield",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Só pode ser aplicada a um ataque [SUPPORT]. Não pode ser adquirida como parte de Overclock.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "O Digimon não pode ter [SHIELD] e outra Tag de Efeito no mesmo ataque. Um Digimon com esta Qualidade não pode se beneficiar de [SHIELD] concedido por esta Qualidade.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [SUPPORT] com [SHIELD]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "shield"
      ],
      "appliesTo": "oneSupportAttack",
      "cannotHaveOtherEffectTag": true,
      "cannotBeTakenWithOverclock": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "usesFormula": {
      "valueFromRank": true,
      "valuePerRank": 1,
      "recharge": "combat"
    },
    "shield": {
      "temporaryWoundBoxesFormula": "casterBit + stage",
      "reducedByResistance": true,
      "treatedAsPositiveEffectWithDuration": true,
      "durationEndsIfTemporaryWoundsLost": true,
      "cannotBenefitSelfFromThisQuality": true,
      "canShareWithAreaOnlyOnSignatureSupportMove": true,
      "batteryRequiredForArea": 2
    },
    "effect": "O Digimon pode aplicar a Tag [SHIELD] a um ataque [SUPPORT]. Um ataque [SHIELD] fornece Caixas de Ferimento Temporárias iguais ao BIT do conjurador + Estágio, reduzidas por Resistência. Isso é tratado e aplicado como um Efeito Positivo com Duração, mas a Duração termina cedo se o alvo perder todas as Caixas de Ferimento Temporárias concedidas pelo Efeito. O Digimon não pode ter [SHIELD] e outra Tag de Efeito no mesmo ataque, e não pode adquirir [SHIELD] como parte de Overclock. O Digimon só pode usar um ataque com [SHIELD] uma quantidade de vezes por combate igual aos Ranks nesta Qualidade. Um Digimon não pode ter [SHIELD] e uma Tag de Área de Ataque no mesmo ataque, a menos que aplique ambas a um Movimento Assinatura com [SUPPORT]; nesse caso, exige 2 Bateria para ativar a Área de Ataque. Um Digimon com esta Qualidade não pode se beneficiar de [SHIELD] concedido por esta própria Qualidade.",
    "description": "Escudo Protetor concede Caixas de Ferimento Temporárias por meio de um ataque de suporte defensivo.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Inicial"
    }
  },
  {
    "id": "algoritmo",
    "name": "Algoritmo",
    "originalName": "Algorithm",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 0,
        "adult": 1,
        "perfect": 2,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Incompatível com qualquer outra Qualidade de Armamento de Digizóide e qualquer outra Qualidade de Força Crescente.",
      "qualityNames": "Qualquer outro Armamento de Digizóide, Qualquer outra Força Crescente"
    },
    "requiredFor": [
      "Armamento de Digizóide Puro",
      "Overwrite Puro"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "ignoresWeaponInstinctIncompatibility": true,
      "weaponAndInstinctRankLimitFormula": "algorithmRanks + 1"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ignora a incompatibilidade entre Arma e Instinto, e pode comprar uma quantidade de Ranks em cada uma dessas Qualidades igual aos seus Ranks em Algoritmo + 1. O Digimon precisa comprar 3 Ranks nesta Qualidade para poder adquirir Armamento de Digizóide Puro ou Overwrite Puro. O número de Ranks que pode adquirir em Algoritmo depende de seu Estágio.",
    "description": "Algoritmo permite combinar caminhos normalmente incompatíveis de Arma e Instinto, abrindo acesso a formas puras de armamento e overwrite."
  },
  {
    "id": "mobilidadeAvancada",
    "name": "Mobilidade Avançada",
    "originalName": "Advanced Mobility",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 5,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e 1 Rank de Movimento Extra.",
      "qualityNames": "Movimento Extra"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Movimento Extra aprimorado",
      "cannotRepeat": true,
      "options": [
        {
          "key": "flight",
          "label": "Voo",
          "originalLabel": "Flight",
          "requirements": {
            "text": "Requer Movimento Extra: Voo.",
            "qualityNames": "Movimento Extra: Voo"
          },
          "effect": "O Digimon não é desacelerado nem pelos ventos mais severos enquanto estiver no ar. Ele só perde sua Velocidade de Voo quando estiver com um quarto ou menos de suas Caixas de Ferimento máximas, em vez de metade."
        },
        {
          "key": "digger",
          "label": "Escavador",
          "originalLabel": "Digger",
          "requirements": {
            "text": "Requer Movimento Extra: Escavador.",
            "qualityNames": "Movimento Extra: Escavador"
          },
          "effect": "O Digimon agora consegue cavar através da maioria das superfícies sem ser desacelerado. Pode cavar materiais mais duros, como pedra, gelo ou até alguns metais mais macios, mas isso conta como Terreno Difícil. Ao cavar através desses materiais duros, deixa para trás um túnel igual ao seu tamanho, pelo qual outros Digimon ou humanos podem passar. Passar por esse túnel conta como Terreno Difícil de um Elemento associado ao material, geralmente Terra, a menos que a criatura tenha Movimento Extra: Escavador. A visão baseada em tremor do Digimon aumenta para seu Alcance completo enquanto estiver no subterrâneo, e ele também pode senti-la acima do solo, desde que esteja sobre algum terreno, até uma quantidade de espaços igual à metade de seu Alcance."
        },
        {
          "key": "swimmer",
          "label": "Nadador",
          "originalLabel": "Swimmer",
          "requirements": {
            "text": "Requer Movimento Extra: Nadador.",
            "qualityNames": "Movimento Extra: Nadador"
          },
          "effect": "O Digimon agora consegue respirar debaixo d’água ou prender a respiração por tempo indefinido. Não precisa mais usar a Ação Prender a Respiração para evitar Dano. Pode nadar sem ser desacelerado por correntes severas e também pode usar esse tipo de Movimento para atravessar líquidos além de água, como lava ou metal líquido, com restrições definidas pelo Narrador. O Digimon ignora penalidades para enxergar outras criaturas debaixo d’água enquanto também estiver submerso, como escuridão, água turva ou [BLIND]."
        },
        {
          "key": "wallclimber",
          "label": "Escalador",
          "originalLabel": "Wallclimber",
          "requirements": {
            "text": "Requer Movimento Extra: Escalador.",
            "qualityNames": "Movimento Extra: Escalador"
          },
          "effect": "O Digimon agora consegue andar em tetos e não pode ser desacelerado nem escorregar de superfícies verticais normais. Também se torna imune a [ROOT]."
        },
        {
          "key": "jumper",
          "label": "Saltador",
          "originalLabel": "Jumper",
          "requirements": {
            "text": "Requer Movimento Extra: Saltador.",
            "qualityNames": "Movimento Extra: Saltador"
          },
          "effect": "O Digimon não precisa mais saltar em linha reta, podendo curvar sua trajetória no ar. Também recebe redução de Dano bônus igual ao seu RAM ao sofrer Dano por queda ou arremesso. Se também possuir Acrobata, ignora todo Dano de queda. O Digimon pode usar seu Movimento de Salto para entrar e sair de Terreno Difícil como Ação Mover, em vez de Movimento Difícil, desde que não esteja com metade ou menos de suas Caixas de Ferimento máximas."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Cada vez que comprar um Rank nesta Qualidade, escolha uma opção de Movimento Extra que o Digimon já possua. Ele recebe um efeito diferente baseado na escolha. O Digimon não pode escolher o mesmo efeito duas vezes.",
    "description": "Mobilidade Avançada aprimora tipos de Movimento Extra já existentes, transformando deslocamentos especiais em ferramentas superiores de exploração e combate."
  },
  {
    "id": "arrancada",
    "name": "Arrancada",
    "originalName": "Sprint",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e 1 ou mais Ranks de Acelerar.",
      "qualityNames": "Acelerar"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Dobre seu Movimento para uma Ação que envolva Movimento."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "Quando o Digimon realiza uma Ação que envolva seu Movimento, pode escolher dobrar seu Movimento para essa Ação. Isso afeta mais do que a Ação Mover, incluindo Movimento Difícil, Interceder e ataques [CHARGE]. Esta Qualidade pode ser ativada uma vez por combate.",
    "description": "Arrancada permite uma explosão súbita de velocidade, dobrando o Movimento em uma ação importante."
  },
  {
    "id": "forcaElemental",
    "name": "Força Elemental",
    "originalName": "Elemental Force",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": true
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e 1 ou mais Ranks de Passo Natural.",
      "qualityNames": "Passo Natural"
    },
    "incompatible": {
      "text": "Múltiplas Tags de Força Elemental não podem ser colocadas no mesmo ataque, mesmo que sejam de Elementos diferentes.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Elemento de Passo Natural",
      "options": [
        {
          "key": "fire",
          "label": "Fogo",
          "originalLabel": "Fire",
          "attackTag": "fire"
        },
        {
          "key": "water",
          "label": "Água",
          "originalLabel": "Water",
          "attackTag": "water"
        },
        {
          "key": "wind",
          "label": "Vento",
          "originalLabel": "Wind",
          "attackTag": "wind"
        },
        {
          "key": "earth",
          "label": "Terra",
          "originalLabel": "Earth",
          "attackTag": "earth"
        },
        {
          "key": "ice",
          "label": "Gelo",
          "originalLabel": "Ice",
          "attackTag": "ice"
        },
        {
          "key": "wood",
          "label": "Flora",
          "originalLabel": "Wood",
          "attackTag": "wood"
        },
        {
          "key": "steel",
          "label": "Aço",
          "originalLabel": "Steel",
          "attackTag": "steel"
        },
        {
          "key": "thunder",
          "label": "Trovão",
          "originalLabel": "Thunder",
          "attackTag": "thunder"
        },
        {
          "key": "darkness",
          "label": "Trevas",
          "originalLabel": "Darkness",
          "attackTag": "darkness"
        },
        {
          "key": "light",
          "label": "Luz",
          "originalLabel": "Light",
          "attackTag": "light"
        }
      ]
    },
    "attackModifier": {
      "grantsTagsFromChoice": true,
      "appliesTo": "oneDamageAttackPerRank",
      "bonusDamageFormula": "1 + ranks",
      "triggerRequired": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ative a Tag Elemental ao declarar o ataque para receber Dano bônus."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Ao comprar um Rank nesta Qualidade, escolha um Elemento de Passo Natural que o Digimon possua. O Digimon aplica uma Tag de Ataque com o mesmo nome desse Elemento a um ataque [DAMAGE]. Quando um ataque com uma Tag Elemental é declarado, esta Qualidade pode ser ativada para receber bônus de Dano igual a 1 + os Ranks nesta Qualidade para esse ataque. Porém, se for ativado, o ataque não causa Dano bônus a um Digimon que compartilhe o mesmo Passo Natural do Elemento escolhido, e é completamente ineficaz contra Digimon que tenham esse Passo Natural e a Qualidade Mestre Elemental, sem nem penalizar a Esquiva. Cada vez que um Rank é adquirido nesta Qualidade, o Digimon pode escolher o mesmo Elemento de Passo Natural ou um novo. Múltiplas Tags de Força Elemental não podem ser colocadas no mesmo ataque, mesmo que sejam de Elementos diferentes.",
    "description": "Força Elemental imbui ataques com Elementos ligados ao Passo Natural do Digimon, concedendo Dano bônus contra inimigos vulneráveis, mas podendo ser anulada por afinidade elemental."
  },
  {
    "id": "mestreElemental",
    "name": "Mestre Elemental",
    "originalName": "Element Master",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e 1 ou mais Ranks de Passo Natural.",
      "qualityNames": "Passo Natural"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Miríade Elemental"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "negatesTriggeredElementalForceMatchingNaturewalk": true,
      "dangerousTerrainDamageForMatchingElements": 1
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "freeAction",
      "actionCost": 0,
      "chatMessage": "Manipule um aspecto natural de um Elemento associado ao seu Passo Natural."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "check": {
      "enabled": true,
      "stat": "dos",
      "skill": "fortitude",
      "notes": "Durante seu turno, o Digimon pode fazer um Teste DOS (Fortitude) como Ação Livre uma vez por rodada quando manipular seu Elemento for difícil ou complexo, a critério do Narrador."
    },
    "effect": "Durante seu turno, o Digimon pode fazer um Teste DOS (Fortitude) como Ação Livre uma vez por rodada. O Digimon ganha a capacidade de manipular um aspecto da natureza associado ao Elemento escolhido com Passo Natural. Se tiver múltiplos Passos Naturais, esta Qualidade pode afetar qualquer um dos Elementos escolhidos, mas apenas um por vez. O Digimon pode interagir com fontes naturais do Elemento e produzir efeitos únicos, normalmente sem impacto direto em combate, como causar Dano. Quando houver dificuldade em manipular um Elemento, como produzir um efeito complexo ou manipular uma fonte não natural, o Narrador decide se o uso é permitido e pode exigir um Teste DOS (Fortitude). O Digimon também nega completamente ataques de Força Elemental ativados contra ele para qualquer Elemento que possua com Passo Natural, e sofre apenas 1 Dano Inalterável de Terreno Perigoso dos mesmos Elementos em vez de 2.",
    "description": "Mestre Elemental aprofunda a afinidade do Digimon com seus Elementos de Passo Natural, permitindo manipulação ambiental e proteção superior contra Força Elemental."
  },
  {
    "id": "golpePoderoso",
    "name": "Golpe Poderoso",
    "originalName": "Mighty Blow",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto. A Tag [T:MIGHTY] deve ser aplicada a um ataque [MELEE][DAMAGE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [MELEE][DAMAGE] com [T:MIGHTY]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "t:mighty"
      ],
      "appliesTo": "oneMeleeDamageAttack",
      "mayShareWithAttackEffectExceptDamageEffects": true,
      "areaAttackAppliesToClosestTarget": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Se o ataque [T:MIGHTY] causar pelo menos 2 Dano após Armadura, faça um Teste CPU (Feitos de Força)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "cpu",
      "skill": "featsOfStrength",
      "tnFormula": "10 + targetCpu",
      "consecutiveUseTnIncrease": 3,
      "ignoreTnIncreaseIfSignatureMove": true
    },
    "result": {
      "criticalFailure": "O ataque causa 1 Dano a menos, até o mínimo de 1.",
      "failure": "Nada acontece.",
      "success": "O alvo sofre [STUN].",
      "criticalSuccess": "O alvo sofre [STUN] e o ataque causa +2 Dano."
    },
    "effect": "O Digimon aplica a Tag [T:MIGHTY] a um ataque [MELEE][DAMAGE]. Se um ataque [T:MIGHTY] causar pelo menos 2 Dano após Armadura, sem contar Dano Inalterável, o atacante pode fazer um Teste CPU (Feitos de Força) com NA igual a 10 + CPU do alvo. Em sucesso, o alvo sofre [STUN]. Em sucesso crítico, o ataque também causa +2 Dano. Cada vez que esta Qualidade é usada, mesmo em falha, o NA aumenta em 3 para usos posteriores até o fim do combate, a menos que o ataque seja um Movimento Assinatura. [T:MIGHTY] pode ser aplicada a um ataque com outro Efeito de Ataque, exceto Efeitos de Dano. Se usada em uma Área de Ataque, esta Qualidade se aplica ao alvo mais próximo.",
    "description": "Golpe Poderoso transforma um ataque corpo a corpo em uma pancada capaz de atordoar o alvo quando causa dano suficiente."
  },
  {
    "id": "focoPreciso",
    "name": "Foco Preciso",
    "originalName": "Precise Focus",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto. A Tag [FOCUS] deve ser aplicada a um ataque [RANGE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Esta Tag não fornece benefícios a Áreas de Ataque.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [RANGE] com [FOCUS]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "focus"
      ],
      "appliesTo": "oneRangedAttack",
      "noBenefitToAreaAttacks": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "conditional",
      "chatMessage": "Quando um ataque [FOCUS] for feito usando 1 Ação extra, role BIT (Precisão)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "precision",
      "tnFormula": "12 + targetRam",
      "triggerCondition": "focusAttackMadeWithOneExtraAction"
    },
    "result": {
      "criticalFailure": "Nada acontece.",
      "failure": "O ataque recebe +1 Precisão.",
      "success": "O ataque recebe +3 Precisão.",
      "criticalSuccess": "O ataque recebe +5 Precisão."
    },
    "effect": "O Digimon aplica a Tag [FOCUS] a um ataque [RANGE]. Para cada ponto de Dano que um ataque [DAMAGE][FOCUS] causar, o alvo perde duas Caixas de Ferimento Temporárias em vez de uma, se possuir alguma. Quando um ataque [FOCUS] é feito usando 1 Ação extra, como por Ação Fortalecer, Ataque Mirado ou custo adicional causado por uma Qualidade, o Digimon rola um Teste BIT (Precisão) com NA igual a 12 + RAM do alvo. Em falha, o ataque recebe +1 Precisão; em sucesso, +3 Precisão; em sucesso crítico, +5 Precisão. Se aplicado a um Movimento Assinatura, o Digimon também pode aumentar o Alcance do ataque em valor igual à sua Bateria. Esta Tag não fornece benefícios a Áreas de Ataque. Se o ataque exigiria 2 ou mais Ações por padrão, mas teve seu custo reduzido, como por [SIMPLE], ainda é tratado como um ataque com 1 Ação extra.",
    "description": "Foco Preciso aprimora ataques à distância cuidadosamente preparados, aumentando a Precisão e destruindo Caixas de Ferimento Temporárias com eficiência."
  },
  {
    "id": "ataqueDeFinta",
    "name": "Ataque de Finta",
    "originalName": "Feint Attack",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto. A Tag [T:FEINT] deve ser aplicada a um ataque [MELEE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Um Digimon não pode ter [PIERCING] ou [STUN] em um ataque [T:FEINT]. Esta Qualidade não pode ser usada durante Clash nem ao ativar Contra-Ataque.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [MELEE] com [T:FEINT]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "t:feint"
      ],
      "appliesTo": "oneMeleeAttack",
      "incompatibleTags": [
        "piercing",
        "stun"
      ],
      "cannotUseDuringClash": true,
      "cannotUseWithCounterattack": true,
      "areaAttackAppliesToClosestTarget": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao declarar um ataque [T:FEINT], faça um Teste BIT (Manipular)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "manipulate",
      "tnFormula": "10 + targetBit",
      "consecutiveUseTnIncrease": 3,
      "ignoreTnIncreaseIfSignatureMove": true
    },
    "result": {
      "criticalFailure": "Se acertar, o Dano do ataque é reduzido pela metade após Armadura, arredondado para cima.",
      "failure": "Nada acontece.",
      "success": "O alvo só pode rolar metade de sua Pool de Esquiva normal contra o ataque. Se for [DAMAGE], o Dano após Armadura é reduzido pela metade, arredondado para cima; se for [SUPPORT], a Duração do Efeito é reduzida em 1, até o mínimo de 0.",
      "criticalSuccess": "O alvo só pode rolar metade de sua Pool de Esquiva normal contra o ataque, e o Dano do ataque não é reduzido pela metade."
    },
    "effect": "O Digimon aplica a Tag [T:FEINT] a um ataque [MELEE]. Quando declara um ataque [T:FEINT] contra um inimigo, o atacante pode fazer um Teste BIT (Manipular) com NA igual a 10 + BIT do alvo. Em sucesso, o alvo só pode rolar metade de sua Pool de Esquiva normal contra o ataque, mas um ataque [DAMAGE] tem seu Dano após Armadura reduzido pela metade, arredondado para cima, se acertar, e um ataque [SUPPORT] tem sua Duração de Efeito reduzida em 1, até o mínimo de 0. Em sucesso crítico, o Dano não é reduzido. Cada vez que esta Qualidade é usada, mesmo em falha, o NA aumenta em 3 para usos posteriores até o fim do combate, a menos que o ataque seja um Movimento Assinatura. Um Digimon não pode ter [PIERCING] ou [STUN] em um ataque [T:FEINT]. Esta Qualidade não pode ser usada durante Clash nem ao ativar Contra-Ataque. Se usada em uma Área de Ataque, aplica-se ao alvo mais próximo.",
    "description": "Ataque de Finta engana o alvo para reduzir sua Esquiva, aceitando limitações no impacto ou na duração do ataque."
  },
  {
    "id": "golpePunitivo",
    "name": "Golpe Punitivo",
    "originalName": "Punishing Strike",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e Ranks de Consciência de Combate.",
      "qualityNames": "Consciência de Combate"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Não Há Escapatória"
    ],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [MELEE] com [PUNISH]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "punish"
      ],
      "appliesTo": "oneMeleeAttack",
      "cannotTriggerAreaAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "interrupt",
      "chatMessage": "Quando um inimigo sair voluntariamente do alcance dos seus ataques corpo a corpo, ataque com [PUNISH]."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "usesFormula": {
      "valueFromQualityRanks": "conscienciaDeCombate",
      "valuePerRank": 1,
      "recharge": "combat"
    },
    "effect": "O Digimon pode aplicar a Tag [PUNISH] a um ataque [MELEE]. Quando um Digimon se move voluntariamente para fora do alcance dos seus ataques corpo a corpo, sem incluir teleporte ou movimento forçado por efeito de status, você pode fazer um ataque com essa Tag contra ele fora do seu turno como Ação de Interrupção. Ao fazer um ataque dessa forma, não pode ativar Área de Ataque. Esta Qualidade pode ser usada por batalha uma quantidade de vezes igual aos Ranks que você possui em Consciência de Combate. Se um Digimon Interceder contra este ataque, sua Armadura é reduzida pela metade contra o Dano causado.",
    "description": "Golpe Punitivo permite punir inimigos que tentam abandonar o alcance corpo a corpo do Digimon."
  },
  {
    "id": "naoHaEscapatoria",
    "name": "Não Há Escapatória",
    "originalName": "There Is No Escape",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Golpe Punitivo.",
      "qualityNames": "Golpe Punitivo"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "punishingStrikeCanTriggerOnTeleport": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Quando você causa 2 ou mais Dano usando um ataque com a Tag [PUNISH], o Movimento do alvo é reduzido pela metade até o fim do turno atual. Se o ataque com [PUNISH] também tiver a Tag [ROOT], o Movimento atual do alvo é reduzido a 0 nesse turno. Você agora também pode usar Golpe Punitivo se o alvo tentar se teleportar voluntariamente para fora do seu alcance.",
    "description": "Não Há Escapatória torna Golpe Punitivo capaz de travar o movimento do alvo e punir até tentativas de fuga por teleporte."
  },
  {
    "id": "contraGolpe",
    "name": "Contra-Golpe",
    "originalName": "Counterblow",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e 1 Rank de Contra-Ataque.",
      "qualityNames": "Contra-Ataque"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Contra-Golpe Cruzado, Fogo de Retorno"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [MELEE] com [COUNTER]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "counter"
      ],
      "appliesTo": "oneMeleeAttack",
      "onlyUsableWithCounterattack": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "counterattackModifier",
      "chatMessage": "Ao ativar Contra-Ataque, escolha reduzir Esquiva, Armadura ou gastar dois usos para ambos."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "counterattackOptions": [
      {
        "key": "halveDodge",
        "label": "Reduzir Esquiva",
        "effect": "O alvo rola metade da Pool de Esquiva."
      },
      {
        "key": "halveArmor",
        "label": "Reduzir Armadura",
        "effect": "A Armadura do alvo é reduzida pela metade contra o ataque."
      },
      {
        "key": "both",
        "label": "Ambos",
        "cost": "twoCounterattackUses",
        "effect": "Gaste dois usos de Contra-Ataque para aplicar os dois efeitos."
      }
    ],
    "effect": "O Digimon pode aplicar a Tag [COUNTER] a um ataque [MELEE]. O ataque com [COUNTER] só pode ser usado ao usar Contra-Ataque. Além disso, quando o Digimon ativa a Qualidade Contra-Ataque, em vez da penalidade normal, deve escolher entre três opções: reduzir a Pool de Esquiva do alvo pela metade; reduzir a Armadura do alvo pela metade contra o ataque, em vez da Esquiva; ou gastar dois usos de Contra-Ataque para ativar ambos os efeitos ao mesmo tempo.",
    "description": "Contra-Golpe modifica Contra-Ataque, permitindo punir o inimigo com redução de Esquiva, Armadura ou ambos."
  },
  {
    "id": "contraGolpeCruzado",
    "name": "Contra-Golpe Cruzado",
    "originalName": "Cross Counter",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e 1 Rank de Contra-Ataque.",
      "qualityNames": "Contra-Ataque"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Contra-Golpe, Monstro de Combate, Fogo de Retorno, Contra-Ataque Instantâneo"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [MELEE] com [COUNTER]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "counter"
      ],
      "appliesTo": "oneMeleeAttack",
      "onlyUsableWithCounterattack": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "chatMessage": "Se um inimigo acertar um ataque [MELEE] e causar Dano mínimo igual ao seu Estágio + 1, você pode ativar Contra-Ataque."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon pode aplicar a Tag [COUNTER] a um ataque [MELEE]. O ataque com [COUNTER] só pode ser usado ao usar Contra-Ataque. Além disso, se um inimigo acertar um ataque [MELEE] contra o Digimon e ele sofrer Dano mínimo igual ao seu Estágio + 1 após Armadura, você pode escolher ativar Contra-Ataque. Se Contra-Ataque for ativado durante Interceder, o Digimon pode retaliar, mas o alvo não reduz sua Esquiva pela metade contra o ataque.",
    "description": "Contra-Golpe Cruzado permite contra-atacar mesmo após ser atingido por um ataque corpo a corpo forte."
  },
  {
    "id": "fogoDeRetorno",
    "name": "Fogo de Retorno",
    "originalName": "Return Fire",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e 1 Rank de Contra-Ataque.",
      "qualityNames": "Contra-Ataque"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Contra-Golpe, Contra-Golpe Cruzado"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [RANGE] com [COUNTER]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "counter"
      ],
      "appliesTo": "oneRangedAttack",
      "onlyUsableWithCounterattack": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "chatMessage": "Use um ataque [RANGE][COUNTER] ao ativar Contra-Ataque."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon pode aplicar a Tag [COUNTER] a um ataque [RANGE]. O ataque com [COUNTER] só pode ser usado ao usar Contra-Ataque. Se a Qualidade Contra-Ataque for ativada devido a um ataque [RANGE], o Digimon ignora quaisquer penalidades de Precisão causadas por atacar dentro de seu Limite Efetivo.",
    "description": "Fogo de Retorno adapta Contra-Ataque para ataques à distância, permitindo retaliar contra disparos e ataques remotos."
  },
  {
    "id": "contraAtaqueInstantaneo",
    "name": "Contra-Ataque Instantâneo",
    "originalName": "Instant Counter",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e 1 Rank de Contra-Ataque.",
      "qualityNames": "Contra-Ataque"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Contra-Golpe Cruzado"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "counterattackInterruptCanBeFreeAction": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "actionCost": 0,
      "chatMessage": "Use a Ação de Interrupção de Contra-Ataque como Ação Livre uma vez por combate."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "O Digimon pode usar a Ação de Interrupção de Contra-Ataque como Ação Livre uma vez por combate.",
    "description": "Contra-Ataque Instantâneo torna uma retaliação por combate mais rápida, removendo seu custo de Ação."
  },
  {
    "id": "rouboDeVida",
    "name": "Roubo de Vida",
    "originalName": "Lifesteal",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "A Tag [DRAIN] não pode ser aplicada a um ataque com Tag de Efeito.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque com [DRAIN]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "drain"
      ],
      "appliesTo": "oneAttack",
      "cannotApplyToAttackWithEffectTag": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Cure Caixas de Ferimento iguais ao Dano causado, até o limite de DOS."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon pode aplicar a Tag [DRAIN] a um ataque. Este ataque cura uma quantidade de Caixas de Ferimento do Digimon igual ao Dano causado, até o máximo do DOS do Digimon. Se usado com uma Tag de Área de Ataque, o Dano geral é usado para determinar a cura em vez do Dano a alvos individuais. A Tag [DRAIN] não pode ser aplicada a um ataque com Tag de Efeito. Se aplicada a um Movimento Assinatura, a cura potencial do Digimon aumenta em valor igual à sua Bateria.",
    "description": "Roubo de Vida permite que o Digimon recupere Ferimentos ao causar Dano com um ataque drenante."
  },
  {
    "id": "recarregar",
    "name": "Recarregar",
    "originalName": "Reload",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto e Munição.",
      "qualityNames": "Munição"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Tente recuperar o uso de um ataque [AMMO] já usado neste combate."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "precision",
      "tnFormula": "18 - casterRam",
      "consecutiveSuccessfulUseTnIncrease": 3
    },
    "result": {
      "criticalFailure": "O Digimon não pode tentar usar esta Qualidade novamente neste combate.",
      "failure": "Nada acontece.",
      "success": "O Digimon recupera o uso de seu ataque [AMMO] como se ele não tivesse sido usado neste combate.",
      "criticalSuccess": "O Digimon recupera o uso de seu ataque [AMMO] e também recupera 1 Ação usada nesta Qualidade."
    },
    "effect": "Como 2 Ações, o Digimon pode tentar recuperar o uso de seu ataque [AMMO] depois de usá-lo em combate. O Digimon faz um Teste BIT (Precisão) com NA igual a 18 - RAM do Digimon. Em sucesso, recupera o uso do ataque [AMMO] como se ele não tivesse sido usado neste combate. Em sucesso crítico, também recupera 1 Ação usada nesta Qualidade. Cada vez que esta Qualidade é usada com sucesso, o NA aumenta em 3 para usos posteriores até o fim do combate.",
    "description": "Recarregar permite reutilizar um ataque com Munição durante o mesmo combate, com dificuldade crescente."
  },
  {
    "id": "resistenciaFocada",
    "name": "Resistência Focada",
    "originalName": "Focused Resistance",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Imunidade"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "interrupt",
      "chatMessage": "Quando o Digimon for sofrer um Efeito devido a um ataque, use uma Interrupção para dobrar sua Resistência contra o Efeito."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Quando o Digimon seria submetido a um Efeito devido a um ataque, ele pode usar uma Ação de Interrupção para dobrar sua Resistência contra o Efeito recebido.",
    "description": "Resistência Focada permite concentrar as defesas digitais do Digimon contra Efeitos recebidos."
  },
  {
    "id": "imunidade",
    "name": "Imunidade",
    "originalName": "Immunity",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Resistência Focada.",
      "qualityNames": "Resistência Focada"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resistanceCanReducePotencyBelowTwo": true,
      "negateEffectAtZeroPotency": true,
      "resistActionTreatedAsExtraAction": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "A Resistência do Digimon pode reduzir a Potência de um Efeito recebido para abaixo de 2. Se a Potência seria reduzida a 0, o Efeito é negado. Além disso, quando o Digimon usa a Ação Resistir, ela é tratada como se estivesse usando uma Ação extra.",
    "description": "Imunidade aprimora Resistência Focada, permitindo negar Efeitos completamente e fortalecendo a Ação Resistir."
  },
  {
    "id": "controleDeDominio",
    "name": "Controle de Domínio",
    "originalName": "Domain Control",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mestre Elemental.",
      "qualityNames": "Mestre Elemental"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Miríade Elemental"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Domínio",
      "options": [
        {
          "key": "treacherousFire",
          "label": "Fogo Traiçoeiro",
          "originalLabel": "Treacherous Fire",
          "element": "fire",
          "effect": "A área é considerada Terreno Difícil para inimigos, e inimigos dentro dela sofrem [BURN] enquanto permanecerem no Domínio."
        },
        {
          "key": "volatileElement",
          "label": "Elemento Volátil",
          "originalLabel": "Volatile Element",
          "element": "fire",
          "effect": "Todos os ataques do Controlador do Domínio tratam o alvo como se estivesse sob [EXPLOIT] enquanto ele estiver dentro da área. Esse [EXPLOIT] tem Potência igual ao DOS do Controlador do Domínio. Não se aplica a lacaios."
        },
        {
          "key": "floodVortex",
          "label": "Vórtice de Inundação",
          "originalLabel": "Flood Vortex",
          "element": "water",
          "effect": "A área é considerada Terreno Difícil para todos os Digimon dentro dela, exceto o Controlador do Domínio, a menos que o Digimon possua Mobilidade Avançada: Nadador. Quando o Domínio é criado e no início dos turnos seguintes do Controlador, [PULL] é aplicado a quaisquer Digimon à escolha do Controlador. Esse [PULL] tem Potência igual ao CPU do Controlador."
        },
        {
          "key": "cleansingMist",
          "label": "Névoa Purificadora",
          "originalLabel": "Cleansing Mist",
          "element": "water",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, ele rola seu BIT como Pool. Para cada Sucesso, pode escolher qualquer Digimon dentro do Domínio e aplicar [CLEANSE] com Sucessos automáticos iguais aos Sucessos dessa Pool. Esse [CLEANSE] não é afetado por Mira Seletiva."
        },
        {
          "key": "rumblingLand",
          "label": "Terra Retumbante",
          "originalLabel": "Rumbling Land",
          "element": "earth",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, [ROOT] é aplicado a qualquer inimigo dentro do Domínio. Esse [ROOT] tem Potência igual ao CPU do Controlador."
        },
        {
          "key": "stoneArmory",
          "label": "Arsenal de Pedra",
          "originalLabel": "Stone Armory",
          "element": "earth",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, aplique [SHIELD] ao Controlador do Domínio. Esse [SHIELD] tem Potência igual ao número de inimigos dentro da área e dura até o início do próximo turno do Controlador. Inclui lacaios."
        },
        {
          "key": "gustyGarden",
          "label": "Jardim Ventoso",
          "originalLabel": "Gusty Garden",
          "element": "wind",
          "effect": "A área é considerada Terreno Difícil para todos os Digimon dentro dela, exceto o Controlador do Domínio, a menos que o Digimon possua Mobilidade Avançada: Voo. Quando o Domínio é criado e no início dos turnos seguintes do Controlador, [PUSH] é aplicado a quaisquer Digimon à escolha do Controlador. Esse [PUSH] tem Potência igual ao RAM do Controlador."
        },
        {
          "key": "boostingGale",
          "label": "Vendaval Impulsionador",
          "originalLabel": "Boosting Gale",
          "element": "wind",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, ele rola 1d6 uma vez para cada Digimon à sua escolha dentro da área, exceto ele mesmo. Em resultado 5 ou mais, [HASTE] é aplicado ao Digimon."
        },
        {
          "key": "iceField",
          "label": "Campo de Gelo",
          "originalLabel": "Ice Field",
          "element": "ice",
          "effect": "A área é considerada Terreno Difícil para inimigos, e inimigos dentro dela sofrem [FREEZE] enquanto permanecerem no Domínio."
        },
        {
          "key": "frozenOver",
          "label": "Congelamento Total",
          "originalLabel": "Frozen Over",
          "element": "ice",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, [FRAIL] é aplicado a qualquer Digimon à escolha do Controlador dentro da área até o início do próximo turno do Controlador. Esse [FRAIL] tem Potência igual ao BIT do Controlador."
        },
        {
          "key": "lightningRush",
          "label": "Investida Relampejante",
          "originalLabel": "Lightning Rush",
          "element": "thunder",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, [TAILWIND] é aplicado a qualquer Digimon à escolha do Controlador dentro da área até o início do próximo turno do Controlador. Esse [TAILWIND] tem Potência igual ao BIT do Controlador."
        },
        {
          "key": "thunderJustice",
          "label": "Justiça Trovejante",
          "originalLabel": "Thunder Justice",
          "element": "thunder",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, ele escolhe uma quantidade de Digimon até seu Estágio e rola 1d6 para cada um. Em resultado 5 ou mais, [PARALYZE] é aplicado ao Digimon até o próximo turno do Controlador. Esse [PARALYZE] tem Potência igual ao DOS do Controlador."
        },
        {
          "key": "poisonousGrowth",
          "label": "Crescimento Venenoso",
          "originalLabel": "Poisonous Growth",
          "element": "wood",
          "effect": "A área é considerada Terreno Difícil para inimigos, e inimigos dentro dela sofrem [POISON] enquanto permanecerem no Domínio."
        },
        {
          "key": "sappingStrength",
          "label": "Drenar Forças",
          "originalLabel": "Sapping Strength",
          "element": "wood",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, ele escolhe uma quantidade de Digimon até seu Estágio e rola 1d6 para cada um. Em resultado 5 ou mais, o Digimon sofre 1 Dano Inalterável. O Controlador do Domínio recupera 1 Caixa de Ferimento para cada Dano causado dessa forma."
        },
        {
          "key": "artificialLimitation",
          "label": "Limitação Artificial",
          "originalLabel": "Artificial Limitation",
          "element": "steel",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, [DOOM] é aplicado a qualquer inimigo dentro do Domínio até o início do próximo turno do Controlador. Esse [DOOM] tem Potência igual ao BIT do Controlador."
        },
        {
          "key": "dgDimension",
          "label": "Dimensão DG",
          "originalLabel": "DG Dimension",
          "element": "steel",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, ele escolhe uma quantidade de Digimon até seu Estágio e rola 1d6 para cada um. Em resultado 5 ou mais, [DOT] é aplicado ao Digimon até o próximo turno do Controlador. Isso ignora o limite de uma vez por combate de [DOT]."
        },
        {
          "key": "rejuvenatingLight",
          "label": "Luz Rejuvenescedora",
          "originalLabel": "Rejuvenating Light",
          "element": "light",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, ele escolhe uma quantidade de Digimon até seu Estágio e rola 1d6 para cada um. Em resultado 5 ou mais, [REGEN] é aplicado ao Digimon até o próximo turno do Controlador. Esse [REGEN] tem Potência igual ao CPU do Controlador."
        },
        {
          "key": "peacefulPressure",
          "label": "Pressão Pacífica",
          "originalLabel": "Peaceful Pressure",
          "element": "light",
          "effect": "Qualquer Digimon dentro da área é tratado como se estivesse sofrendo [PACIFY] ao atacar o Controlador do Domínio. Esse [PACIFY] tem Potência igual ao DOS do Controlador. Não se aplica a lacaios."
        },
        {
          "key": "shadowVale",
          "label": "Vale Sombrio",
          "originalLabel": "Shadow Vale",
          "element": "darkness",
          "effect": "Quando o Domínio é criado e no início dos turnos seguintes do Controlador, [FEAR] é aplicado a qualquer inimigo dentro do Domínio. Esse [FEAR] tem Potência igual ao CPU do Controlador."
        },
        {
          "key": "nightmareShroud",
          "label": "Mortalha de Pesadelo",
          "originalLabel": "Nightmare Shroud",
          "element": "darkness",
          "effect": "A área é considerada Terreno Difícil para inimigos. Quando o Domínio é criado e no início dos turnos seguintes do Controlador, ele escolhe uma quantidade de Digimon até seu Estágio e rola 1d6 para cada um. Em resultado 5 ou mais, [RUIN] é aplicado ao Digimon até o próximo turno do Controlador. Esse [RUIN] tem Potência igual ao DOS do Controlador."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Crie um Domínio elemental ao redor do Digimon."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "domain": {
      "durationFormula": "stage + 1",
      "radiusFormula": "stage + 1",
      "followsUser": true,
      "requiresElementSource": true,
      "conjurerBypassesSourceWithCheck": true,
      "conjurerCheck": {
        "stat": "dos",
        "skill": "fortitude",
        "tnFormula": "10 + doubleStage"
      },
      "maintainCheckIfNoElementSource": {
        "stat": "dos",
        "skill": "fortitude",
        "timing": "beginningOfEachRound",
        "tnFormula": "10 + doubleStage"
      },
      "ignoredBySharedNaturewalk": true,
      "notAffectedByResistantOrToughItOut": true
    },
    "effect": "O Mestre Elemental agora é capaz de imbuir a área ao redor com um efeito adicional chamado Domínio. Criar um Domínio exige 2 Ações e uma fonte do Elemento em questão, conforme as regras de Mestre Elemental. Se o Digimon também tiver Conjurador, não precisa de uma fonte do Elemento, mas precisa passar em um Teste DOS (Fortitude) com NA 10 + o dobro do Estágio do Digimon ou falha em criar o Domínio. O Domínio dura Estágio + 1 rodadas e afeta um raio igual ao mesmo valor, acompanhando o Digimon enquanto ele se move. Se uma quantidade mensurável do Elemento não estiver presente, o Controlador pode fazer um Teste DOS (Fortitude) no início de cada rodada para manter o Domínio, com NA 10 + o dobro do Estágio. Efeitos de Domínio não são afetados por Qualidades como Resistente nem por Ordens Especiais como Aguente Firme, mas um Digimon com Passo Natural do mesmo Elemento do Domínio pode escolher ignorá-lo. Se possuir Elemento Alterado, o Digimon pode escolher qualquer opção apresentada e tratá-la como um Elemento que possua por Passo Natural.",
    "description": "Controle de Domínio transforma a maestria elemental do Digimon em uma zona ativa de influência que acompanha o usuário e altera o campo de batalha."
  },
  {
    "id": "elementoAdaptavel",
    "name": "Elemento Adaptável",
    "originalName": "Adaptive Element",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mestre Elemental.",
      "qualityNames": "Mestre Elemental"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Miríade Elemental, Elemento Alterado"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Elemento Adaptável",
      "options": [
        "Fogo",
        "Água",
        "Terra",
        "Vento",
        "Gelo",
        "Trovão",
        "Flora",
        "Aço",
        "Luz",
        "Trevas"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "domainControlCanChooseEitherDomainOfChosenElement": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Quando o Digimon adquire Controle de Domínio, em vez de escolher um único Domínio, pode escolher um único Elemento. Ele passa a poder usar qualquer um dos dois Domínios desse Elemento ao ativar Controle de Domínio em combate. Apenas um Domínio pode estar ativo por vez.",
    "description": "Elemento Adaptável permite alternar entre os dois Domínios de um mesmo Elemento ao usar Controle de Domínio."
  },
  {
    "id": "elementoAlterado",
    "name": "Elemento Alterado",
    "originalName": "Altered Element",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mestre Elemental.",
      "qualityNames": "Mestre Elemental"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Miríade Elemental, Elemento Adaptável"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Domínio Alterado",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "domainControlCanChooseAnyDomainOption": true,
      "chosenDomainCountsAsOwnNaturewalkElement": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Quando adquire Controle de Domínio, o Digimon pode escolher qualquer opção de Domínio em vez de ficar limitado ao Elemento de seu Passo Natural. Apesar da nova escolha, ela ainda é considerada seu Elemento. Por exemplo, um Digimon com Passo Natural: Fogo poderia escolher Vale Sombrio em vez de Fogo Traiçoeiro ou Elemento Volátil; outros Digimon com Passo Natural: Fogo poderiam ignorar os efeitos desse Domínio, mas Digimon com Passo Natural: Trevas não poderiam.",
    "description": "Elemento Alterado permite escolher um Domínio de outro Elemento, mas reinterpretá-lo como parte do próprio Elemento do Digimon."
  },
  {
    "id": "overdrive",
    "name": "Overdrive",
    "originalName": "Overdrive",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "freeAction",
      "actionCost": 0,
      "chatMessage": "Tente entrar em Overdrive como Ação Livre uma vez por rodada."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "check": {
      "enabled": true,
      "stat": "cpu",
      "skill": "athletics",
      "tnFormula": "15 - casterRam",
      "consecutiveUseTnIncrease": 6
    },
    "result": {
      "criticalFailure": "Nada acontece, e o Digimon não pode usar esta Qualidade novamente até o fim do combate.",
      "failure": "Nada acontece.",
      "success": "O Digimon se beneficia de [HASTE] por este turno. Ao fim do turno, fica fatigado e sofre penalidade de -3 em Esquiva por 1 rodada.",
      "criticalSuccess": "O Digimon se beneficia de [HASTE] por este turno e ignora a penalidade de Esquiva."
    },
    "effect": "Como Ação Livre uma vez por rodada, durante seu turno, o Digimon pode tentar usar sua compreensão das próprias capacidades corporais para entrar em overdrive. Ele faz um Teste CPU (Atletismo) com NA igual a 15 - RAM do Digimon. Em sucesso, beneficia-se de [HASTE] por esse turno. Ao fim do turno, fica fatigado e sofre penalidade de -3 em Esquiva por 1 rodada. Em sucesso crítico, ignora essa penalidade. Depois que esta Qualidade é usada uma vez, mesmo em falha, o NA aumenta em 6 para usos consecutivos até o fim do combate.",
    "description": "Overdrive força o corpo digital do Digimon além dos limites normais, concedendo velocidade temporária ao custo de fadiga."
  },
  {
    "id": "varreduraDeDados",
    "name": "Varredura de Dados",
    "originalName": "Data Scan",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Analise o código de um inimigo visível para descobrir suas fraquezas."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "knowledge",
      "tnFormula": "10 + targetDos"
    },
    "scanOptions": [
      "Caixas de Ferimento atuais e máximas do Digimon.",
      "Estatísticas Centrais do Digimon após Qualidades: Precisão, Dano, Esquiva, Armadura e Saúde.",
      "Estatísticas Derivadas do Digimon: RAM, CPU, BIT e DOS.",
      "Movimento, Alcance e Limite Efetivo do Digimon.",
      "Lista de Qualidades Core do Digimon, como Otimização de Dados, Passo Natural, Arma ou Instinto.",
      "Um ataque e todas as suas Tags. Esta opção pode ser escolhida múltiplas vezes."
    ],
    "result": {
      "criticalFailure": "Nada acontece, e o Digimon não pode usar esta Qualidade novamente até o fim do combate.",
      "failure": "Nada acontece.",
      "success": "O Digimon aprende uma das opções de Varredura de Dados sobre o alvo.",
      "criticalSuccess": "O Digimon aprende uma opção adicional."
    },
    "effect": "O Digimon pode usar sua compreensão de código para tentar ler o código de um inimigo e descobrir suas fraquezas. Como 1 Ação, escolhe um inimigo visível e faz um Teste BIT (Conhecimento) com NA igual a 10 + DOS do alvo. Em sucesso, aprende uma informação à escolha sobre o alvo: Caixas de Ferimento atuais e máximas; Estatísticas Centrais após Qualidades; Estatísticas Derivadas; Movimento, Alcance e Limite Efetivo; lista de Qualidades Core; ou um ataque e todas as suas Tags. Em sucesso crítico, aprende uma opção adicional. Em falha crítica, nada acontece e o Digimon não pode usar esta Qualidade novamente até o fim do combate.",
    "description": "Varredura de Dados permite analisar inimigos em combate, revelando estatísticas, Qualidades e ataques."
  },
  {
    "id": "conjurador",
    "name": "Conjurador",
    "originalName": "Conjurer",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Evoker Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Stage 2+.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Invocador, Monstro de Combate, Reforço Positivo"
    },
    "requiredFor": [
      "Evocador"
    ],
    "choices": {
      "required": true,
      "type": "conjurationTheme",
      "label": "Tipo de objeto conjurado",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resource": {
        "key": "creationLimit",
        "label": "Limite de Criação",
        "valueFormula": "bit + stage",
        "maxFormula": "bit + stage"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Use a Ação Conjurar Objetos para criar objetos em espaços dentro do Alcance do Digimon."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "creation": {
      "type": "objects",
      "resourceKey": "creationLimit",
      "action": {
        "key": "conjureObjects",
        "label": "Conjurar Objetos",
        "actionCost": 2,
        "cooldownRounds": 1
      },
      "rangeFrom": "range",
      "objectSize": "1 espaço cúbico",
      "totalCubicSpacesCannotExceedCreationLimit": true,
      "objectThemeMustBeEstablishedOnPurchase": true,
      "canRelateToNaturewalkElements": true,
      "rules": [
        "Objetos podem ser empilhados ou colocados lado a lado para criar objetos maiores, servir como cobertura, bloquear terreno ou bloquear caminhos.",
        "Cada objeto é destruído quando é atingido por um ataque que causa Dano.",
        "Objetos criados adjacentes uns aos outros se tornam um único objeto e podem receber um ataque que cause Dano adicional antes de serem destruídos para cada 2 objetos adicionais unidos ao original.",
        "Se objetos forem destruídos, o custo usado para criá-los é removido do Limite de Criação, permitindo recuperar esse recurso.",
        "Objetos não rolam Esquiva e são automaticamente atingidos ao serem mirados.",
        "Um Digimon precisa obter pelo menos 2 Sucessos de Precisão com uma Área de Ataque para destruir um objeto."
      ],
      "disappearsWhen": [
        "O usuário realiza a Ação Conjurar Objetos, embora possa substituir os mesmos objetos conjurados usando essa Ação.",
        "O usuário é reduzido a 0 Caixas de Ferimento.",
        "O usuário deixa de ter acesso a esta Qualidade, como ao evoluir para um novo Estágio."
      ],
      "elementMasterInteraction": {
        "conjuredObjectsCanActAsElementSource": true
      }
    },
    "effect": "Ao adquirir esta Qualidade, o Digimon ganha um novo recurso chamado Limite de Criação. Seu Limite de Criação total é igual ao seu BIT + Estágio, e é usado para conjurar objetos. O Digimon pode realizar a Ação Conjurar Objetos, que custa 2 Ações. Essa Ação permite conjurar objetos em qualquer espaço dentro do Alcance do Digimon, ocupando 1 espaço cúbico. O total de espaços cúbicos de objetos conjurados não pode exceder o Limite de Criação. Ao adquirir esta Qualidade, defina claramente que variedade e tipos de objetos o Digimon pode criar; isso não pode ser alterado depois. O usuário não pode realizar a Ação Conjurar Objetos por 1 rodada depois de usá-la. Se esta Qualidade for adquirida junto de Mestre Elemental, os objetos conjurados podem servir como fonte do Elemento.",
    "description": "Conjurador permite que o Digimon crie objetos físicos a partir de seus dados, usando Limite de Criação para controlar o volume total conjurado."
  },
  {
    "id": "invocador",
    "name": "Invocador",
    "originalName": "Summoner",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Evoker Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Stage 2+.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Conjurador, Monstro de Combate, Reforço Positivo"
    },
    "requiredFor": [
      "Evocador"
    ],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Tipo de Lacaio",
      "options": [
        {
          "key": "infantry",
          "label": "Infantaria",
          "originalLabel": "Infantry",
          "creationCost": 4,
          "attackLimit": 2,
          "size": "medium",
          "statBonuses": "Movimento recebe bônus igual ao Estágio.",
          "uniqueBenefit": "Os lacaios podem ser controlados como 1 Ação, mas apenas uma vez por turno."
        },
        {
          "key": "protector",
          "label": "Protetor",
          "originalLabel": "Protector",
          "creationCost": 4,
          "attackLimit": 3,
          "size": "large",
          "statBonuses": "Movimento recebe bônus igual ao Estágio.",
          "uniqueBenefit": "Um lacaio pode Interceder usando as Ações do Invocador."
        },
        {
          "key": "recon",
          "label": "Reconhecimento",
          "originalLabel": "Recon",
          "creationCost": 2,
          "attackLimit": 1,
          "size": "small",
          "statBonuses": "Precisão recebe bônus igual ao Estágio.",
          "uniqueBenefit": "Os lacaios agora podem fazer ataques [RANGE], usando o Alcance e o Limite Efetivo do Invocador."
        },
        {
          "key": "volatile",
          "label": "Volátil",
          "originalLabel": "Volatile",
          "creationCost": 1,
          "attackLimit": 1,
          "size": "small",
          "statBonuses": "Dano recebe bônus igual ao Estágio.",
          "uniqueBenefit": "Um lacaio explode quando é destruído, fazendo um ataque [MELEE][DAMAGE][T:BURST] contra todos os alvos dentro da área."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resource": {
        "key": "creationLimit",
        "label": "Limite de Criação",
        "valueFormula": "bit + stage",
        "maxFormula": "bit + stage"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Use a Ação Invocar Lacaios para criar lacaios em espaços dentro do Alcance do Digimon."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "creation": {
      "type": "minions",
      "resourceKey": "creationLimit",
      "action": {
        "key": "summonMinions",
        "label": "Invocar Lacaios",
        "actionCost": 2,
        "cooldownRounds": 1
      },
      "rangeFrom": "range",
      "totalCreationCostCannotExceedCreationLimit": true,
      "minionBaseStats": {
        "accuracyFrom": "summonerBit",
        "damageFrom": "summonerBit",
        "movementFrom": "summonerBit",
        "canFly": true,
        "cannotDodge": true,
        "hasDerivedStats": false,
        "attacks": [
          "melee"
        ]
      },
      "minionEffectRules": {
        "doesNotBenefitOrSufferMostEffects": true,
        "affectedByDamageEffects": [
          "burn",
          "freeze",
          "poison",
          "ruin"
        ],
        "affectedByMovementEffects": [
          "push",
          "pull"
        ],
        "affectedByMovementPortionsOfEffects": [
          "root",
          "paralyze"
        ]
      },
      "leftoverCreationLimit": {
        "canIncreaseAttackLimitOncePerPoint": true
      },
      "directMinions": {
        "actionCost": 2,
        "availableActions": [
          "move",
          "attack"
        ],
        "gmMayAllowOtherDirections": true
      },
      "disappearsWhen": [
        "O usuário realiza a Ação Invocar Lacaios, embora possa manter lacaios restantes tratando-os como se ainda contribuíssem para o Custo de Criação.",
        "O usuário é reduzido a 0 Caixas de Ferimento.",
        "O usuário deixa de ter acesso a esta Qualidade, como ao evoluir para um novo Estágio."
      ],
      "inheritedQualities": {
        "all": [
          "Otimização de Dados: Combatente Corpo a Corpo",
          "Otimização de Dados: Guardião (apenas estatística)",
          "Otimização de Dados: Velocista (apenas Movimento)",
          "Instinto (apenas Movimento)",
          "Acelerar",
          "Movimento Extra, exceto Voo",
          "Mobilidade Avançada",
          "Alcance",
          "Matador",
          "Acrobata",
          "Passo Natural",
          "Resistente",
          "Modo Misericordioso"
        ],
        "infantryOnly": [
          "Teleporte (apenas Movimento)"
        ],
        "protectorOnly": [
          "Especialização de Dados: Guardião Verdadeiro",
          "Armadura de Digizóide: Obsidiana (apenas Dano)"
        ],
        "reconOnly": [
          "Otimização de Dados: Atirador à Distância",
          "Especialização de Dados: Franco-Atirador"
        ],
        "volatileOnly": [
          "Especialização de Dados: Artilharia Móvel",
          "Mira Seletiva",
          "Desastrado"
        ]
      }
    },
    "effect": "Ao adquirir esta Qualidade, o Digimon ganha um novo recurso chamado Limite de Criação. Seu Limite de Criação total é igual ao seu BIT + Estágio, e é usado para invocar lacaios. O Digimon pode realizar a Ação Invocar Lacaios, que custa 2 Ações. Essa Ação permite invocar lacaios em qualquer espaço dentro do Alcance do Digimon. Cada lacaio possui um Custo de Criação, e o custo total dos lacaios invocados não pode exceder o Limite de Criação do usuário. As estatísticas básicas de um lacaio usam o BIT do usuário para Precisão, Dano e Movimento. Lacaios podem voar, não podem Esquivar, não possuem Estatísticas Derivadas e só podem fazer ataques com a Tag [MELEE], salvo exceções de tipo. O Invocador pode usar 2 Ações para comandar os lacaios que controla, permitindo que eles se movam e ataquem. O usuário não pode realizar a Ação Invocar Lacaios por 1 rodada depois de usá-la.",
    "description": "Invocador permite criar lacaios digitais controlados pelo Digimon, usando Limite de Criação para definir quantidade, tipo e resistência das invocações."
  },
  {
    "id": "evocador",
    "name": "Evocador",
    "originalName": "Evoker",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade de Adulto"
    },
    "section": "Evoker Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Conjurador ou Invocador.",
      "qualityNames": "Conjurador, Invocador"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canTakeConjurerAndSummonerTogether": true,
      "sharedCreationLimitBetweenObjectsAndMinions": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "creation": {
      "type": "objectsAndMinions",
      "sharedCreationLimit": true,
      "combinedAction": {
        "enabled": true,
        "actionCost": 2,
        "canConjureObjectsAndSummonMinionsWithSameAction": true
      }
    },
    "effect": "O Digimon agora é capaz de adquirir tanto Invocador quanto Conjurador, e pode realizar a Ação Conjurar Objetos e a Ação Invocar Lacaios como as mesmas 2 Ações. Porém, o Limite de Criação do Digimon é compartilhado entre lacaios invocados e objetos conjurados. Por exemplo, com Limite de Criação 8, ele poderia ter até 4 espaços cúbicos de objetos e 2 lacaios de Reconhecimento.",
    "description": "Evocador une conjuração de objetos e invocação de lacaios sob um único Limite de Criação compartilhado."
  },
  {
    "id": "especializacaoDeDados",
    "name": "Especialização de Dados",
    "originalName": "Data Specialization",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 0,
        "adult": 0,
        "perfect": 1,
        "ultimate": 2,
        "ultimatePlus": 2
      }
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Otimização de Dados. Apenas Digimon de Estágio Ultimate ou superior podem comprar 2 Ranks nesta Qualidade.",
      "qualityNames": "Otimização de Dados"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "dataOptimizationSpecializationPerRank",
      "label": "Especialização de Dados",
      "maxChoices": 2,
      "options": [
        {
          "key": "fistfulOfForce",
          "label": "Punhado de Força",
          "originalLabel": "Fistful of Force",
          "dataOptimization": "closeCombat",
          "dataOptimizationLabel": "Combatente Corpo a Corpo",
          "category": {
            "attack": true,
            "static": false,
            "trigger": false
          },
          "grants": {
            "freeQualityRanks": [
              {
                "quality": "Área de Ataque",
                "ranks": 1
              }
            ]
          },
          "effect": "O Digimon ganha 1 Rank gratuito em Área de Ataque. As Áreas de Ataque [MELEE] do Digimon agora podem usar o Tamanho Máximo, e quaisquer alvos dentro do Tamanho Base de uma Área de Ataque [DAMAGE][MELEE] não reduzem o Dano após Armadura pela metade."
        },
        {
          "key": "flurry",
          "label": "Rajada de Golpes",
          "originalLabel": "Flurry",
          "dataOptimization": "closeCombat",
          "dataOptimizationLabel": "Combatente Corpo a Corpo",
          "category": {
            "attack": false,
            "static": true,
            "trigger": true
          },
          "effect": "O Digimon pode fazer um ataque [MELEE][DAMAGE] adicional uma vez por rodada como 1 Ação em seu turno, ignorando a regra de um ataque por rodada e sem contar contra ela. Esse ataque não pode ter Tags extras."
        },
        {
          "key": "mobileArtillery",
          "label": "Artilharia Móvel",
          "originalLabel": "Mobile Artillery",
          "dataOptimization": "rangedStriker",
          "dataOptimizationLabel": "Atirador à Distância",
          "category": {
            "attack": true,
            "static": false,
            "trigger": true
          },
          "grants": {
            "freeQualityRanks": [
              {
                "quality": "Área de Ataque",
                "ranks": 1
              }
            ]
          },
          "effect": "O Digimon ganha 1 Rank gratuito em Área de Ataque. Quaisquer alvos dentro do Tamanho Base da Área de Ataque [DAMAGE][RANGE] do Digimon não reduzem o Dano após Armadura pela metade. Áreas de Ataque [DAMAGE][RANGE] com uma Tag de Efeito precisam causar 4 ou mais Dano para aplicar o Efeito a alvos dentro do Tamanho Base. Além disso, ao fazer uma Área de Ataque [RANGE], se o Digimon tiver pelo menos 1 Rank em Passo Natural, pode escolher usar 1 Ação extra. Se fizer isso, a área se torna Terreno Difícil associado a um Elemento de sua escolha que possua até o início do próximo turno do Digimon. O Digimon deve escolher entre superfície e aéreo quando declara o ataque."
        },
        {
          "key": "sniper",
          "label": "Franco-Atirador",
          "originalLabel": "Sniper",
          "dataOptimization": "rangedStriker",
          "dataOptimizationLabel": "Atirador à Distância",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "O Digimon ganha +3 Alcance e +3 Limite Efetivo. O Digimon pode usar a Ação Ataque Mirado uma quantidade ilimitada de vezes por combate, mas apenas para a opção Atirador de Elite. Quando usa essa Ação, a penalidade sofrida em Precisão é reduzida pela metade."
        },
        {
          "key": "trySomething",
          "label": "Tente Algo",
          "originalLabel": "Try Something",
          "dataOptimization": "warden",
          "dataOptimizationLabel": "Guardião",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "grants": {
            "freeQualityRanks": [
              {
                "quality": "Contra-Ataque",
                "ranks": 1
              }
            ],
            "healthBonus": 3
          },
          "effect": "O Digimon ganha 1 Rank gratuito em Contra-Ataque. Também ganha +3 Saúde. Sempre que faria um ataque fora de seu turno usando uma Ação de Interrupção, ignora a regra de um ataque por rodada e não conta contra ela. Isso também vale para a Ação Preparar, desde que o gatilho seja o inimigo errar um ataque contra um alvo predeterminado."
        },
        {
          "key": "trueGuardian",
          "label": "Guardião Verdadeiro",
          "originalLabel": "True Guardian",
          "dataOptimization": "warden",
          "dataOptimizationLabel": "Guardião",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "Sempre que o Digimon Intercede, recebe bônus de Armadura igual à distância que não precisou percorrer para Interceder, até o máximo de seu CPU. Além disso, se o Digimon estiver dentro de uma Área de Ataque inimiga, quaisquer aliados atrás dele a partir do ponto de origem da Área de Ataque, geralmente o atacante, recebem bônus de Armadura igual ao CPU do Digimon, e quaisquer Efeitos que sofreriam são negados. O Digimon pode usar a Ação Interceder em resposta a uma Área de Ataque para se mover para dentro dela, em vez de apenas poder usar Interceder em Área. Se o Digimon gastou 2 Ações para Interceder antes do início de seu turno, recebe 1 Ação nesse turno."
        },
        {
          "key": "wrestlemania",
          "label": "Wrestlemania",
          "originalLabel": "Wrestlemania",
          "dataOptimization": "brawler",
          "dataOptimizationLabel": "Brigão",
          "category": {
            "attack": false,
            "static": true,
            "trigger": true
          },
          "grants": {
            "freeQualityRanks": [
              {
                "quality": "Perícia Prodigiosa",
                "ranks": 1
              }
            ]
          },
          "effect": "O Digimon ganha 1 Rank gratuito em Perícia Prodigiosa. Quando rolar qualquer Teste que normalmente usa Clash, pode usar Clash, CPU (Feitos de Força) ou BIT (Performance). Qualquer bônus para Clash, como Otimização de Dados: Brigão ou tamanho maior, é adicionado a qualquer uma dessas opções. Sempre que causar Dano por meio de um ataque enquanto estiver em Clash, rola um Teste com uma dessas opções para causar Dano adicional. O NA é 12 + o maior valor entre CPU ou RAM do alvo. Em falha crítica, não causa Dano extra; em falha, +1 Dano; em sucesso, +3 Dano; em sucesso crítico, +5 Dano. O Digimon também pode usar a Ação de Clash Finalizador."
        },
        {
          "key": "wrangler",
          "label": "Domador",
          "originalLabel": "Wrangler",
          "dataOptimization": "brawler",
          "dataOptimizationLabel": "Brigão",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "O Digimon pode realizar a Ação de Clash uma vez durante seu turno como Ação Livre. Se escolher Encerrar um Clash, pode reiniciar um Clash com o mesmo alvo no mesmo turno; isso não funciona ao Escapar de um Clash. Assim, o Digimon poderia Encerrar um Clash no início de seu turno, usar 2 Ações fora das regras de Clash e então reiniciar o Clash com o mesmo alvo usando uma Ação Livre. Porém, se o oponente usou Retorno de Clash ou Disputar Imobilização, o bônus dele se aplica à tentativa de Clash feita depois no turno."
        },
        {
          "key": "hitAndRun",
          "label": "Bater e Correr",
          "originalLabel": "Hit and Run",
          "dataOptimization": "speedster",
          "dataOptimizationLabel": "Velocista",
          "category": {
            "attack": true,
            "static": false,
            "trigger": true
          },
          "grants": {
            "freeQualityChoice": [
              "Ataque de Investida",
              "Recuo Pesado"
            ]
          },
          "effect": "O Digimon ganha Ataque de Investida ou Recuo Pesado gratuitamente. Se usar um ataque com Tag [CHARGE] ou [RECOIL], não fica mais restrito a se mover em linha reta e recebe benefícios adicionais. Com [CHARGE], se o Digimon se mover pelo menos 2 espaços antes de atacar, adiciona seu RAM ao Dano; se [CHARGE] foi usado para se mover antes de atacar um alvo, pode ser usado novamente para se mover depois do ataque. Com [RECOIL], o Digimon pode se mover antes de atacar como parte da mesma Ação, mas precisa se mover para mais perto de um oponente; se se mover pelo menos 2 espaços antes de atacar, adiciona seu RAM ao Dano. Ao usar qualquer uma das opções, o Digimon não pode ser atacado com Golpe Punitivo."
        },
        {
          "key": "uncatchableTarget",
          "label": "Alvo Inalcançável",
          "originalLabel": "Uncatchable Target",
          "dataOptimization": "speedster",
          "dataOptimizationLabel": "Velocista",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "incompatible": {
            "text": "Incompatível com Evasão Absoluta.",
            "qualityNames": "Evasão Absoluta"
          },
          "effect": "O Digimon ganha +3 Esquiva e não sofre penalidade cumulativa de Esquiva se for atacado múltiplas vezes em uma rodada. Ataque Coordenado e Especialização de Dados: Franco-Atirador ignoram este bônus."
        },
        {
          "key": "statusWarlord",
          "label": "Senhor da Guerra de Status",
          "originalLabel": "Status Warlord",
          "dataOptimization": "effectWarrior",
          "dataOptimizationLabel": "Guerreiro de Efeitos",
          "category": {
            "attack": true,
            "static": false,
            "trigger": false
          },
          "incompatible": {
            "text": "Incompatível com Zonista: Fogo Amigo, Emblema Sombrio e Proteção Sagrada.",
            "qualityNames": "Zonista: Fogo Amigo, Emblema Sombrio, Proteção Sagrada"
          },
          "grants": {
            "oneTimeAttackEffectDiscount": 1
          },
          "effect": "O Digimon recebe um desconto único de 1 PD em um Efeito de Ataque. Quando o Digimon faz um ataque [DAMAGE] sem Tag de Efeito em seu turno, pode fazer um ataque [SUPPORT] no mesmo turno ignorando a regra de um ataque por rodada. O inverso também funciona, permitindo um ataque [DAMAGE] depois de um ataque [SUPPORT]."
        },
        {
          "key": "codeWizard",
          "label": "Mago do Código",
          "originalLabel": "Code Wizard",
          "dataOptimization": "effectWarrior",
          "dataOptimizationLabel": "Guerreiro de Efeitos",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "A Duração máxima de todos os Efeitos criados pelo Digimon aumenta em 1. O Digimon pode usar a Ação Ataque Mirado uma quantidade ilimitada de vezes por combate, mas apenas para a opção Focado. Quando usa essa Ação, a penalidade sofrida em Precisão é reduzida pela metade. O Digimon também pode ignorar o requisito de precisar da Tag [DAMAGE] em ataques com certos Efeitos, como [BURN]."
        },
        {
          "key": "tacticalAdaptation",
          "label": "Adaptação Tática",
          "originalLabel": "Tactical Adaptation",
          "dataOptimization": "variable",
          "dataOptimizationLabel": "Variável",
          "category": {
            "attack": true,
            "static": false,
            "trigger": false
          },
          "grants": {
            "freeQualityChoice": [
              "Uma Qualidade de Postura",
              "2 Ranks de Mudança de Modo"
            ]
          },
          "effect": "O Digimon ganha uma Qualidade de Postura gratuitamente ou pode adquirir 2 Ranks de Mudança de Modo gratuitamente. Quando a Iniciativa é rolada, o Digimon pode imediatamente realizar a Ação Trocar Postura como Ação Livre. Além disso, o Digimon pode realizar a Ação Trocar Postura como Ação Livre em seu turno. Se tiver a Qualidade Mudança de Modo, pode mudar de modo em vez de trocar de postura com esta Qualidade."
        },
        {
          "key": "supremeCode",
          "label": "Código Supremo",
          "originalLabel": "Supreme Code",
          "dataOptimization": "variable",
          "dataOptimizationLabel": "Variável",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "O Digimon ganha +1 de bônus em Precisão, Dano, Esquiva, Armadura e Saúde."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Para cada Rank adquirido nesta Qualidade, o Digimon escolhe uma de duas opções associadas à sua Otimização de Dados. Apenas Digimon de Estágio Ultimate ou superior podem comprar 2 Ranks nesta Qualidade.",
    "description": "Especialização de Dados aprofunda a função escolhida em Otimização de Dados, liberando melhorias poderosas associadas a cada arquétipo."
  },
  {
    "id": "impulsoHibrido",
    "name": "Impulso Híbrido",
    "originalName": "Hybrid Drive",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Otimização de Dados.",
      "qualityNames": "Otimização de Dados"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "mayPurchaseAnyDataSpecializationOnce": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Ao adquirir Impulso Híbrido, o Digimon pode comprar qualquer Especialização de Dados uma vez, independentemente de sua Otimização de Dados.",
    "description": "Impulso Híbrido permite acessar uma Especialização de Dados fora do arquétipo original do Digimon."
  },
  {
    "id": "miriadeElemental",
    "name": "Miríade Elemental",
    "originalName": "Elemental Myriad",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Mestre Elemental.",
      "qualityNames": "Mestre Elemental"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "naturewalkMaxRanks": 10,
      "naturewalkMaxBonusToIndividualMainStat": 2
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Um Digimon com esta Qualidade se adaptou a vários Elementos. Ele agora pode comprar até 10 Ranks em Passo Natural. Porém, só pode usar Passo Natural para ganhar no máximo +2 em qualquer Estatística Principal individual.",
    "description": "Miríade Elemental expande drasticamente a afinidade elemental do Digimon, permitindo múltiplos Passos Naturais."
  },
  {
    "id": "ataqueCoordenado",
    "name": "Ataque Coordenado",
    "originalName": "Coordinated Assault",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Flanco Agressivo.",
      "qualityNames": "Flanco Agressivo"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Marque um inimigo visível para facilitar ataques contra ele."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "precision",
      "tnFormula": "10 + targetRam",
      "maintainCheckAtStartOfTurn": true,
      "maintainTnFormula": "10 + targetRam + currentAccuracyBonus"
    },
    "result": {
      "criticalFailure": "O Digimon sofre [FEAR 3] originado do alvo até o início de seu próximo turno.",
      "failure": "Nada acontece.",
      "success": "O alvo fica Marcado.",
      "criticalSuccess": "O alvo fica Marcado e o bônus de Precisão começa em +1."
    },
    "mark": {
      "enabled": true,
      "accuracyBonusPerAttackSufferedSinceMarked": 1,
      "appliesToCasterAndAllies": true,
      "startOfTurnMaintenance": true,
      "canChooseNotToMaintain": true,
      "endsIfTargetHiddenOrOutOfSightAtEndOfTargetTurn": true,
      "endsIfCasterAffectedByFearFromTarget": true,
      "endsIfCasterLosesQuality": true,
      "endsIfCasterMarksNewTarget": true,
      "endsIfCasterDefeated": true
    },
    "effect": "O Digimon pode tentar Marcar um inimigo visível como 1 Ação, fazendo um Teste BIT (Precisão) com NA igual a 10 + RAM do alvo. Em sucesso, o alvo fica Marcado. Em sucesso crítico, o alvo fica Marcado e o bônus de Precisão começa em +1. Quando o Digimon ou qualquer um de seus aliados ataca o alvo Marcado, recebe +1 de bônus em Precisão para cada ataque que o alvo sofreu desde que foi Marcado. No início de cada turno do Digimon, ele precisa repetir o Teste BIT (Precisão), com o NA aumentado pelo bônus de Precisão atual. Em falha, o alvo perde a Marca; em sucesso, a Marca é mantida. O Digimon pode escolher não rolar, encerrando a Marca. O alvo também encerra imediatamente a Marca se terminar seu turno escondido ou fora da visão do Digimon, ou se o Digimon for afetado por [FEAR] originado do alvo. A Marca desaparece se o Digimon perder a Qualidade, Marcar um novo alvo ou for derrotado.",
    "description": "Ataque Coordenado marca um inimigo para que o grupo inteiro aumente progressivamente a Precisão contra ele."
  },
  {
    "id": "berserker",
    "name": "Berserker",
    "originalName": "Berserker",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Monstro de Combate.",
      "qualityNames": "Monstro de Combate"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Sangue Fervente"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "maxResolve": 6
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Resolve máximo do Digimon se torna 6.",
    "description": "Berserker aumenta o limite de Resolve do Digimon, ampliando seu potencial de retaliação."
  },
  {
    "id": "sangueFervente",
    "name": "Sangue Fervente",
    "originalName": "Boiling Blood",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Berserker.",
      "qualityNames": "Berserker"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "startingResolveFormula": "ranks",
      "resolveAtStartOfTurnWhenMissingWoundBoxesFormula": "ranks"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Quando o Digimon começa o combate, inicia com Resolve igual aos Ranks nesta Qualidade. Quando estiver com qualquer Caixa de Ferimento faltando, gera Resolve igual aos Ranks nesta Qualidade no início de seus turnos.",
    "description": "Sangue Fervente faz o Resolve do Digimon crescer com a dor, alimentando seu poder em combate."
  },
  {
    "id": "miraSentinela",
    "name": "Mira Sentinela",
    "originalName": "Sentry Aim",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": "Postura Sentinela"
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stanceChange",
      "chatMessage": "Entre em Postura Sentinela e crie uma Zona Sentinela."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "stance": {
      "key": "sentryStance",
      "label": "Postura Sentinela",
      "originalLabel": "Sentry Stance",
      "zone": {
        "key": "sentryZone",
        "label": "Zona Sentinela",
        "followsBlastRules": true,
        "basedOnTag": "t:blast",
        "canMoveZoneAsAction": true,
        "moveZoneActionCost": 1,
        "reactionAttack": {
          "trigger": "targetEntersOrExitsZone",
          "actionCost": 0,
          "actionType": "freeInterrupt",
          "attackTagsRequired": [
            "range",
            "damage"
          ],
          "ignoresOneAttackPerRound": true,
          "doesNotCountTowardOneAttackPerRound": true,
          "cannotHaveExtraTags": true,
          "targetCanOnlyBeHitOncePerRoundByAnySentryStance": true
        }
      },
      "benefits": [
        "Ao ativar esta Postura, o Digimon posiciona uma Zona Sentinela seguindo as mesmas regras de uma Área de Ataque [T:BLAST].",
        "Qualquer Digimon que entre ou saia dessa Zona pode ser imediatamente atacado por este Digimon com um ataque [RANGE][DAMAGE] como Ação Livre de Interrupção enquanto ele estiver em Postura Sentinela.",
        "Esse ataque ignora a regra de um ataque por rodada e não conta contra ela.",
        "O ataque da Zona Sentinela não pode ter Tags extras.",
        "O Digimon não sofre penalidades de Precisão em seus ataques [RANGE], incluindo por atacar dentro do Limite Efetivo, fazer Ataques Mirados ou sofrer Efeitos."
      ],
      "detriments": [
        "O Digimon sofre -2 de penalidade em Esquiva contra ataques com a Tag [MELEE].",
        "O Digimon não pode mirar inimigos dentro de 2 espaços.",
        "O Digimon trata todo terreno como Terreno Difícil."
      ]
    },
    "effect": "O Digimon ganha acesso a uma postura única, Postura Sentinela, e pode entrar nela usando a Ação Trocar Postura. Enquanto estiver nessa postura, cria uma Zona Sentinela seguindo as regras de uma Área de Ataque [T:BLAST]. Qualquer Digimon que entre ou saia dessa Zona pode ser imediatamente atacado por este Digimon usando um ataque [RANGE][DAMAGE] como Ação Livre de Interrupção, desde que este Digimon esteja em Postura Sentinela. Esse ataque ignora a regra de um ataque por rodada, não conta contra ela e não pode ter Tags extras. O Digimon pode mover a Zona como 1 Ação. Se um alvo já foi atingido por esta Qualidade nesta rodada, não pode ser atingido por esta Qualidade novamente nesta rodada por este ou qualquer outro Digimon em Postura Sentinela. O Digimon não sofre penalidades de Precisão em ataques [RANGE], mas sofre -2 de Esquiva contra ataques [MELEE], não pode mirar inimigos dentro de 2 espaços e trata todo terreno como Terreno Difícil.",
    "description": "Mira Sentinela transforma o Digimon em uma torre de vigia móvel, controlando uma área com disparos reativos."
  },
  {
    "id": "golpesMarciais",
    "name": "Golpes Marciais",
    "originalName": "Martial Strikes",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": "Postura Marcial"
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stanceChange",
      "chatMessage": "Entre em Postura Marcial."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "stance": {
      "key": "martialStance",
      "label": "Postura Marcial",
      "originalLabel": "Martial Stance",
      "freeActionOncePerRound": {
        "enabled": true,
        "target": "singleVisibleDigimon",
        "check": {
          "stat": "bit",
          "skill": "decipherIntent",
          "tnFormula": "12 + targetDos"
        },
        "result": {
          "success": "Até o início do próximo turno do Digimon, ataques [WEAPON] contra esse alvo tratam até três resultados 6 na Pool de Precisão como 2 Sucessos em vez de 1.",
          "criticalSuccess": "Além do sucesso, dobra o bônus de Precisão e Dano fornecido por [WEAPON], sem incluir benefícios de Armamento de Digizóide."
        }
      },
      "areaAttackRule": "Se o Digimon fizer uma Área de Ataque que inclua o alvo, os benefícios desta Qualidade não se aplicam aos outros alvos dentro da área.",
      "detriments": [
        "O Digimon sofre penalidade em Esquiva contra ataques de Digimon não afetados por esta Qualidade igual ao seu SV."
      ]
    },
    "effect": "O Digimon ganha acesso a uma postura única, Postura Marcial, e pode entrar nela usando a Ação Trocar Postura. Enquanto estiver nessa postura, uma vez por rodada como Ação Livre, pode escolher um único Digimon visível e fazer um Teste BIT (Decifrar Intenção) com NA igual a 12 + DOS do alvo. Em sucesso, sempre que fizer um ataque com Tag [WEAPON] contra esse alvo até o início de seu próximo turno, trata quaisquer resultados 6 rolados na Pool de Precisão como 2 Sucessos em vez de 1, até 3 vezes por rolagem. Em sucesso crítico, também dobra o bônus de Precisão e Dano fornecido por [WEAPON], sem incluir benefícios de Armamento de Digizóide. Se fizer uma Área de Ataque que inclua o alvo, os benefícios desta Qualidade não se aplicam aos outros alvos. O Digimon sofre penalidade em Esquiva contra ataques de Digimon não afetados por esta Qualidade igual ao seu SV.",
    "description": "Golpes Marciais permite ler um oponente específico e explorar aberturas com ataques de Arma mais precisos."
  },
  {
    "id": "anteciparInvestida",
    "name": "Antecipar Investida",
    "originalName": "Anticipate Assault",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e 1 Rank de Instinto.",
      "qualityNames": "Instinto"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": "Postura de Antecipação"
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stanceChange",
      "chatMessage": "Entre em Postura de Antecipação."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "stance": {
      "key": "anticipateStance",
      "label": "Postura de Antecipação",
      "originalLabel": "Anticipate Stance",
      "freeActionOncePerRound": {
        "enabled": true,
        "target": "singleVisibleDigimon",
        "check": {
          "stat": "ram",
          "skill": "evade",
          "tnFormula": "12 + targetDos"
        },
        "result": {
          "success": "Até o início do próximo turno do Digimon, sempre que o alvo tentar atacá-lo, o Digimon trata quaisquer resultados 6 rolados na Pool de Esquiva como 2 Sucessos em vez de 1.",
          "criticalSuccess": "Além do sucesso, dobra o bônus de Esquiva fornecido por Instinto, e os ataques do alvo não reduzem sua Pool de Esquiva, a menos que tenham Franco-Atirador ou Ataque Coordenado."
        }
      },
      "detriments": [
        "O Digimon sofre penalidade em Armadura contra ataques de Digimon não afetados por esta Qualidade igual ao seu SV."
      ]
    },
    "effect": "O Digimon ganha acesso a uma postura única, Postura de Antecipação, e pode entrar nela usando a Ação Trocar Postura. Enquanto estiver nessa postura, uma vez por rodada como Ação Livre, pode escolher um único Digimon visível e fazer um Teste RAM (Evasão) com NA igual a 12 + DOS do alvo. Em sucesso, sempre que o alvo tentar atacar o Digimon até o início de seu próximo turno, o Digimon trata quaisquer resultados 6 rolados na Pool de Esquiva como 2 Sucessos em vez de 1. Em sucesso crítico, também dobra o bônus de Esquiva fornecido por Instinto, e os ataques do alvo não reduzem sua Pool de Esquiva, a menos que tenham Franco-Atirador ou Ataque Coordenado. O Digimon sofre penalidade em Armadura contra ataques de Digimon não afetados por esta Qualidade igual ao seu SV.",
    "description": "Antecipar Investida permite prever os ataques de um inimigo específico e esquivar com eficiência excepcional."
  },
  {
    "id": "transportador",
    "name": "Transportador",
    "originalName": "Transporter",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Teleporte.",
      "qualityNames": "Teleporte"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "teleportDistanceBonus": 1,
      "canTeleportAdjacentAllies": true,
      "canTeleportAlliesOutOfHarmAsReaction": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "teleportModifier",
      "chatMessage": "Use Teleporte para levar aliados adjacentes junto."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "teleport": {
      "adjacentAlliesCanBeTransported": true,
      "transportedAlliesForfeitActionNextTurn": 1,
      "forfeitedActionType": "interruptAction",
      "otherParticipantCanPayIfAllyCannot": true,
      "failsForDigimonThatCannotPayActionCost": true,
      "distanceBonus": 1
    },
    "effect": "O Digimon agora é capaz de teleportar aliados junto com ele ao usar Teleporte. Os aliados precisam estar adjacentes para Transportador funcionar corretamente. Isso também significa que o Digimon pode usar Teleporte para tirar aliados de perigo em reação a um ataque. Todos os aliados transportados dessa forma também perdem 1 Ação em seu próximo turno, como Ação de Interrupção. Se um Digimon não puder pagar esse custo de Ação, outro Digimon participante pode escolher pagar por ele, ou esta Qualidade não afeta aquele Digimon. Por fim, a distância de Teleporte do Digimon aumenta em 1.",
    "description": "Transportador transforma Teleporte em uma ferramenta coletiva, permitindo levar aliados adjacentes para fora de perigo."
  },
  {
    "id": "protecaoSagrada",
    "name": "Proteção Sagrada",
    "originalName": "Holy Ward",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e 1 Rank de Efeito Básico, Efeito Avançado ou Efeito Mestre com um Efeito Positivo.",
      "qualityNames": "Efeito Básico, Efeito Avançado, Efeito Mestre"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Emblema Sombrio, Senhor da Guerra de Status"
    },
    "requiredFor": [
      "Equilíbrio Caótico"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao acertar um ataque com Efeito Positivo, [HASTE], [IMMUNE] ou [SHIELD], cure 2 Caixas de Ferimento de um alvo do ataque."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "affectedTags": {
      "positiveEffects": true,
      "tags": [
        "haste",
        "immune",
        "shield"
      ]
    },
    "effect": "Sempre que o Digimon acerta um ataque com qualquer uma das Tags listadas, pode curar 2 Caixas de Ferimento de um dos alvos do ataque. Isso afeta qualquer Efeito Positivo, [HASTE], [IMMUNE] e [SHIELD]. Esta Qualidade não pode ser ativada mais de uma vez por rodada.",
    "description": "Proteção Sagrada converte efeitos de apoio em cura direta para um dos alvos beneficiados."
  },
  {
    "id": "emblemaSombrio",
    "name": "Emblema Sombrio",
    "originalName": "Dark Emblem",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e 1 Rank de Efeito Básico, Efeito Avançado ou Efeito Mestre com um Efeito Negativo.",
      "qualityNames": "Efeito Básico, Efeito Avançado, Efeito Mestre"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Proteção Sagrada, Senhor da Guerra de Status"
    },
    "requiredFor": [
      "Equilíbrio Caótico"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao acertar um ataque com Efeito Negativo, Efeito de Dano ou certas Tags, cause 2 Dano Inalterável a um alvo do ataque."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "affectedTags": {
      "negativeEffects": true,
      "damageEffects": true,
      "tags": [
        "fear",
        "doom",
        "stun",
        "blind",
        "dot"
      ]
    },
    "effect": "Sempre que o Digimon acerta um ataque com qualquer uma das Tags listadas, pode causar 2 Dano Inalterável a um dos alvos do ataque. Isso afeta qualquer Efeito Negativo ou Efeito de Dano, [FEAR], [DOOM], [STUN], [BLIND] e [DOT]. Esta Qualidade não pode ser ativada mais de uma vez por rodada.",
    "description": "Emblema Sombrio transforma efeitos ofensivos e debilitantes em Dano Inalterável adicional."
  },
  {
    "id": "equilibrioCaotico",
    "name": "Equilíbrio Caótico",
    "originalName": "Chaotic Balance",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Proteção Sagrada ou Emblema Sombrio.",
      "qualityNames": "Proteção Sagrada, Emblema Sombrio"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canPurchaseHolyWardAndDarkEmblemTogether": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "chaoticBalance": {
      "bothQualitiesCannotActivateSameRound": true,
      "sameQualityCannotBeUsedNextTurnAfterUse": true,
      "alternateQualityBonusIfOtherWasUsedLastRound": 1,
      "bonusAppliesTo": [
        "healing",
        "unalterableDamage"
      ]
    },
    "effect": "O Digimon agora é capaz de comprar tanto Proteção Sagrada quanto Emblema Sombrio. Porém, ambas as Qualidades não podem ser ativadas na mesma rodada, e se uma Qualidade foi usada, ela não pode ser usada novamente no próximo turno. Se uma Qualidade foi usada na rodada anterior, a outra recebe +1 Cura ou +1 Dano Inalterável, conforme a Qualidade.",
    "description": "Equilíbrio Caótico permite alternar entre energia sagrada e sombria, fortalecendo uma quando a outra foi usada antes."
  },
  {
    "id": "poderTitanico",
    "name": "Poder Titânico",
    "originalName": "Titan Power",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Força Monstruosa.",
      "qualityNames": "Força Monstruosa"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "monsterStrengthCanMoveAnySize": true,
      "chargeCanMoveAnySizeWhileClashing": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon agora pode tentar mover Digimon de qualquer tamanho enquanto estiver em Clash usando Força Monstruosa ou fazendo um ataque com a Tag [CHARGE].",
    "description": "Poder Titânico remove a limitação de tamanho de Força Monstruosa, permitindo arrastar até inimigos colossais em Clash."
  },
  {
    "id": "forcaDistante",
    "name": "Força Distante",
    "originalName": "Distant Force",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Aplique [PUSH] ou [PULL] a um alvo dentro do Alcance usando força à distância."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "type": "contested",
      "casterFormula": "bit + dos",
      "targetFormula": "targetClash",
      "countsAsClashCheck": true,
      "appliesQualities": [
        "Otimização de Dados: Brigão",
        "Escorregadio"
      ]
    },
    "forcedMovement": {
      "availableEffects": [
        "push",
        "pull"
      ],
      "distanceStatChoice": [
        "bit",
        "dos"
      ]
    },
    "effect": "Como 1 Ação, o Digimon pode escolher um Digimon dentro de seu Alcance. Se o alvo não estiver disposto, o Digimon e o alvo fazem um Teste contestado. O Digimon soma BIT + DOS ao Teste, e o alvo soma seu Clash. Esse Teste conta como Teste de Clash para Qualidades como Otimização de Dados: Brigão ou Escorregadio. Se o alvo vencer, nada acontece. Se o Digimon vencer ou se o alvo estiver disposto, o Digimon pode aplicar [PUSH] ou [PULL] ao alvo, usando BIT ou DOS, à escolha do Digimon, para determinar a distância.",
    "description": "Força Distante permite empurrar ou puxar alvos à distância usando uma disputa semelhante a Clash."
  },
  {
    "id": "arremessoPoderoso",
    "name": "Arremesso Poderoso",
    "originalName": "Power Throw",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e Arremesso Especial.",
      "qualityNames": "Arremesso Especial"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "throwRangeBonus": 3,
      "throwingEnemyAddsCpuToDamage": true,
      "throwingAllyNoCrashDamage": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Sempre que o Digimon arremessa um alvo, inimigo ou aliado, o Alcance recebe +3. Arremessar um inimigo como ataque [RANGE] também adiciona o CPU do Digimon ao Dano. Arremessar um aliado não causa mais a possibilidade de sofrer Dano de Colisão pelo arremesso.",
    "description": "Arremesso Poderoso aprimora arremessos ofensivos e táticos, aumentando alcance, dano contra inimigos e segurança para aliados."
  },
  {
    "id": "efeitoMestre",
    "name": "Efeito Mestre",
    "originalName": "Master Effect",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior. O Digimon não pode comprar o mesmo Efeito duas vezes. Um ataque não pode ter mais de uma Tag de Efeito de Ataque.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Orientação Inspiradora",
      "Overclock"
    ],
    "choices": {
      "required": true,
      "type": "effectTagPerRank",
      "label": "Tag de Efeito Mestre",
      "cannotRepeat": true,
      "options": [
        {
          "key": "exploit",
          "label": "[EXPLOIT]",
          "type": "negative",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "Esquiva e Armadura são reduzidas. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "pacify",
          "label": "[PACIFY]",
          "type": "negative",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "Precisão e Dano são reduzidos. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "paralyze",
          "label": "[PARALYZE]",
          "type": "negative",
          "duration": true,
          "potency": "cpu",
          "extraActionRequired": true,
          "areaRestriction": "Não pode estar no mesmo ataque que uma Tag de Área de Ataque, a menos que ambas estejam em um Movimento Assinatura com [SUPPORT]. Exige 2 Bateria para ativar a Área de Ataque dessa forma.",
          "effect": "Esquiva é reduzida. Além disso, o alvo trata todo terreno como Terreno Difícil. Um ataque com esta Tag exige 1 Ação extra."
        },
        {
          "key": "rattled",
          "label": "[RATTLED]",
          "type": "negative",
          "duration": true,
          "potency": "cpu",
          "extraActionRequired": true,
          "effect": "Dano e Esquiva são reduzidos. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "shaken",
          "label": "[SHAKEN]",
          "type": "negative",
          "duration": true,
          "potency": "dos",
          "extraActionRequired": true,
          "effect": "Precisão e Armadura são reduzidas. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "weak",
          "label": "[WEAK]",
          "type": "negative",
          "duration": true,
          "potency": "dos",
          "extraActionRequired": true,
          "areaRestriction": "Não pode estar no mesmo ataque que uma Tag de Área de Ataque, a menos que ambas estejam em um Movimento Assinatura com [SUPPORT]. Exige 2 Bateria para ativar a Área de Ataque dessa forma.",
          "effect": "Dano e Armadura são reduzidos. Um ataque com esta Tag exige 1 Ação extra."
        },
        {
          "key": "daring",
          "label": "[DARING]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "Precisão e Armadura são aumentadas. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "fury",
          "label": "[FURY]",
          "type": "positive",
          "duration": true,
          "potency": "dos",
          "extraActionRequired": true,
          "effect": "Precisão e Dano são aumentados. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "regen",
          "label": "[REGEN]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "areaRestriction": "Não pode estar no mesmo ataque que uma Tag de Área de Ataque, a menos que ambas estejam em um Movimento Assinatura com [SUPPORT]. Exige 2 Bateria para ativar a Área de Ataque dessa forma.",
          "effect": "O alvo recupera Caixas de Ferimento no início de cada um de seus turnos. Se o alvo cairia para 0 Caixas de Ferimento enquanto tiver este Efeito, ele cai para 1 Caixa de Ferimento em vez disso, e este Efeito termina imediatamente. Um alvo só pode se beneficiar disso uma vez por combate, mas ainda pode se beneficiar da cura normal de [REGEN]."
        },
        {
          "key": "steady",
          "label": "[STEADY]",
          "type": "positive",
          "duration": true,
          "potency": "cpu",
          "extraActionRequired": true,
          "effect": "Dano e Esquiva são aumentados. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "strength",
          "label": "[STRENGTH]",
          "type": "positive",
          "duration": true,
          "potency": "dos",
          "extraActionRequired": true,
          "areaRestriction": "Não pode estar no mesmo ataque que uma Tag de Área de Ataque, a menos que ambas estejam em um Movimento Assinatura. Exige 2 Bateria para ativar a Área de Ataque dessa forma.",
          "effect": "Dano e Armadura são aumentados. Um ataque com esta Tag exige 1 Ação extra."
        },
        {
          "key": "vigil",
          "label": "[VIGIL]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "Esquiva e Armadura são aumentadas. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "vigor",
          "label": "[VIGOR]",
          "type": "positive",
          "duration": true,
          "potency": "ram",
          "extraActionRequired": true,
          "effect": "Esquiva e Movimento são aumentados. Um ataque com esta Tag exige 1 Ação extra, a menos que seja um Movimento Assinatura."
        },
        {
          "key": "ruin",
          "label": "[RUIN]",
          "type": "damage",
          "duration": true,
          "potency": "bit",
          "effect": "O alvo sofre Dano Inalterável igual ao BIT do conjurador no fim de cada um de seus turnos. O Dano deste Efeito é reduzido em 1 para cada outro Efeito de Dano no alvo."
        },
        {
          "key": "blind",
          "label": "[BLIND]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "O alvo é considerado cego pela Duração."
        },
        {
          "key": "deny",
          "label": "[DENY]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "O próximo Efeito contra o alvo é negado, e a Duração deste Efeito termina imediatamente. Não tem efeito contra [CLEANSE]."
        },
        {
          "key": "dot",
          "label": "[DOT]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "requiresDamageTag": true,
          "oncePerCombatPerTarget": true,
          "effect": "O alvo se transforma em um sprite pixelado, e todos os seus ataques são substituídos por um ataque [MELEE][DAMAGE] e um ataque [RANGE][DAMAGE], mas ele ganha bônus em Esquiva igual ao seu RAM pela Duração. Enquanto transformado dessa forma, não pode ganhar Bateria. Um ataque com esta Tag precisa ter [DAMAGE]. Um alvo só pode ser afetado por [DOT] uma vez por combate."
        },
        {
          "key": "stun",
          "label": "[STUN]",
          "type": "unique",
          "duration": "special",
          "potency": "",
          "extraActionRequired": true,
          "areaRestriction": "Não pode estar no mesmo ataque que uma Tag de Área de Ataque, a menos que ambas estejam em um Movimento Assinatura com [SUPPORT]. Exige 2 Bateria para ativar a Área de Ataque dessa forma.",
          "effect": "O alvo perde 1 Ação e recebe este Efeito até o fim de seu próximo turno. Se não tinha Ações, este Efeito não é ativado até o fim do próximo turno do alvo. Se o alvo estava em Clash, o Clash termina. O alvo pode recuperar a Ação perdida se este Efeito for removido antes da Duração acabar. Um ataque com esta Tag exige 1 Ação extra."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": [
        "exploit",
        "pacify",
        "paralyze",
        "rattled",
        "shaken",
        "weak",
        "daring",
        "fury",
        "regen",
        "steady",
        "strength",
        "vigil",
        "vigor",
        "ruin",
        "blind",
        "deny",
        "dot",
        "stun"
      ],
      "appliesTo": "oneAttackPerPurchasedEffect",
      "onlyOneEffectTagPerAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effectRules": {
      "cannotAffectCasterWithEffectTagAttack": true,
      "positiveSelfUseRequiresOverclock": true,
      "supportAttackAppliesOnHit": true,
      "damageAttackRequiresDamageAfterArmor": 2,
      "maxEffectDuration": 3,
      "potencyReducedByResistance": true,
      "potencyMinimumAfterBonuses": 2,
      "uniqueEffectsHaveNoPotency": true,
      "statChangesAffectTotalStatsOnly": true,
      "totalStatsCannotDropBelow": 1,
      "maxUnalterableDamageFromEffectsPerRound": "targetSv * 2"
    },
    "effect": "O Digimon pode aplicar uma Tag de Efeito Mestre comprada a um ataque. Cada Efeito comprado é aplicado a um ataque, e o mesmo Efeito não pode ser comprado duas vezes. Um ataque não pode ter mais de uma Tag de Efeito de Ataque.",
    "description": "Efeitos Mestres representam as condições, reforços e alterações mais poderosas disponíveis para ataques de Digimon Perfeito ou superior."
  },
  {
    "id": "mudancaDeModo",
    "name": "Mudança de Modo",
    "originalName": "Mode Change",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Mode Change Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Mudança de Modo Superior"
    ],
    "choices": {
      "required": true,
      "type": "modeChangePairsPerRank",
      "label": "Pares de Estatísticas Centrais",
      "maxPairs": 2,
      "cannotRepeatStats": true,
      "excludedStats": [
        "health"
      ],
      "options": [
        "accuracy",
        "damage",
        "dodge",
        "armor"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "action": {
        "key": "modeChange",
        "label": "Mudança de Modo"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "chatMessage": "Troque os pares de Estatísticas escolhidos e ajuste o tamanho selecionado, se houver."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "modeChange": {
      "selectedStatPairsPerRank": true,
      "canSelectSizeOneStepLargerOrSmaller": true,
      "selectedSizeMustBeAvailableAtStage": true,
      "swapsSelectedStats": true,
      "swapsSelectedSize": true,
      "recalculatesDerivedStats": true,
      "qualityBonusesToTotalStatsApplyToNewValues": true,
      "resetToDefaultAtEndOfCombat": true
    },
    "effect": "Para cada Rank nesta Qualidade, o Digimon escolhe um par de Estatísticas Centrais, exceto Saúde. Uma Estatística não pode ser escolhida se já foi selecionada para outro par. O Digimon também pode escolher um tamanho um passo maior ou menor que seu tamanho atual, desde que tenha acesso a esse tamanho em seu Estágio. O Digimon ganha a Ação Mudança de Modo, que troca os pares de Estatísticas escolhidos e também seu tamanho, se um novo foi selecionado. Isso ajusta quaisquer Estatísticas Derivadas que mudariam com base nos novos valores. Isso é considerado um novo Modo para o Digimon. Bônus de Qualidades que afetam Estatísticas Totais são adicionados aos novos valores. O Digimon retorna ao seu Modo padrão no fim do combate.",
    "description": "Mudança de Modo permite alternar configurações de estatísticas e tamanho durante o combate."
  },
  {
    "id": "mudancaDeModoSuperior",
    "name": "Mudança de Modo Superior",
    "originalName": "Superior Mode Change",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Mode Change Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer 1 Rank de Mudança de Modo.",
      "qualityNames": "Mudança de Modo"
    },
    "incompatible": {
      "text": "Mudança de Modo e Mudança de Modo Superior não podem ser selecionadas como Qualidades Padrão.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "superiorModeConfiguration",
      "label": "Configuração de Modo Superior",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "modeChangeModifier",
      "chatMessage": "Ao mudar de Modo, troque Qualidades e ataques entre as opções padrão e de modo."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "superiorModeChange": {
      "defaultQualitiesMaxDpFormula": "stage * 3",
      "modeQualitiesTotalDpMustEqualDefaultQualities": true,
      "swapsQualitiesAndAttacks": true,
      "losesBenefitsFromRemovedQualities": true,
      "statBonusesRemovedWhenQualityRemoved": true,
      "maxWoundBoxChangesAffectCurrentWoundBoxes": true,
      "cannotLoseMaxWoundsUnlessCanLoseEqualCurrentWounds": true,
      "doesNotAffectResolve": true,
      "mustMeetRequirementsForSelectedQualities": true,
      "cannotRemoveQualitiesRequiredByKeptQualities": true,
      "attacksWithTagsFromDefaultQualitiesMustBeSelected": true,
      "createSameNumberOfNewAttacks": true
    },
    "effect": "Quando o Digimon ganha esta Qualidade, selecione Qualidades compradas pelo Digimon com custo total em PD igual ou menor que seu Estágio × 3; elas se tornam suas Qualidades Padrão. Mudança de Modo e Mudança de Modo Superior não podem ser selecionadas. Depois, selecione Qualidades da lista com custo total igual ao custo das Qualidades Padrão; elas se tornam suas Qualidades de Modo. Em seguida, selecione uma quantidade de ataques do Digimon; ataques que tenham Tags vindas de Qualidades Padrão precisam ser selecionados. Crie a mesma quantidade de novos ataques, que podem ter Tags concedidas pelas Qualidades de Modo. Quando o Digimon muda de Modo, troca Qualidades e ataques entre as opções Padrão e de Modo, permanecendo assim até reverter. Ele perde todos os benefícios de Qualidades que não possui mais ao mudar de Modo, incluindo bônus de Estatísticas. Mudanças em Caixas de Ferimento máximas também afetam as Caixas de Ferimento atuais. Se perder Caixas de Ferimento máximas ao mudar de Modo, precisa poder perder igual número de Caixas de Ferimento atuais. Isso não afeta Resolve. O Digimon precisa cumprir os requisitos das Qualidades selecionadas e não pode remover Qualidades exigidas por Qualidades que mantém.",
    "description": "Mudança de Modo Superior permite alternar não apenas estatísticas, mas também conjuntos inteiros de Qualidades e ataques."
  },
  {
    "id": "armaduraDeDigizoideCromada",
    "name": "Armadura de Digizóide Cromada",
    "originalName": "Chrome Digizoid Armor",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Armadura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 1,
      "healthBonus": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha +1 Armadura e +1 Saúde.",
    "description": "Armadura de Digizóide Cromada concede proteção básica de Digizóide a Digimon Perfeito ou superior."
  },
  {
    "id": "armaduraDeDigizoideAmaldicoada",
    "name": "Armadura de Digizóide Amaldiçoada",
    "originalName": "Cursed Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Armadura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "healthBonus": 1,
      "armorBonusWhileSufferingNegativeEffect": 2
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha +1 Saúde. Também ganha +2 de bônus em Armadura se estiver sofrendo um Efeito Negativo.",
    "description": "Armadura de Digizóide Amaldiçoada fortalece o Digimon quando ele está sob efeitos negativos."
  },
  {
    "id": "armaduraDeDigizoideAdaptavel",
    "name": "Armadura de Digizóide Adaptável",
    "originalName": "Adaptive Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Armadura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfRound",
      "chatMessage": "Distribua 4 pontos entre Esquiva e Armadura."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "adaptiveArmor": {
      "pointsPerRound": 4,
      "canSpendOn": [
        "dodge",
        "armor"
      ],
      "canSplitFreely": true
    },
    "effect": "No início da rodada, o Digimon ganha 4 pontos que pode usar para conceder a si mesmo bônus em Esquiva ou Armadura. Pode dividir esses pontos como quiser.",
    "description": "Armadura de Digizóide Adaptável permite redistribuir defesa entre evasão e proteção a cada rodada."
  },
  {
    "id": "armaduraDeDigizoideAfiada",
    "name": "Armadura de Digizóide Afiada",
    "originalName": "Sharp Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Armadura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 2,
      "healthBonus": 1
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "chatMessage": "Quando for atingido por um ataque [DAMAGE], cause 1 Dano Inalterável ao atacante."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha +2 Armadura e +1 Saúde. Sempre que for atingido por um ataque [DAMAGE], causa 1 Dano Inalterável ao atacante.",
    "description": "Armadura de Digizóide Afiada pune atacantes que atingem o Digimon."
  },
  {
    "id": "armaduraDeDigizoidePesada",
    "name": "Armadura de Digizóide Pesada",
    "originalName": "Heavy Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Armadura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 5,
      "movementPenalty": -1,
      "cpuBonus": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha +5 Armadura. O Digimon sofre -1 de penalidade em Movimento, mas ganha +1 CPU.",
    "description": "Armadura de Digizóide Pesada sacrifica mobilidade em troca de defesa extrema e força estrutural."
  },
  {
    "id": "armaduraDeDigizoideFlexivel",
    "name": "Armadura de Digizóide Flexível",
    "originalName": "Flexible Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Armadura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 2,
      "dodgeBonus": 2,
      "ramBonus": 1,
      "consideredOneSizeSmallerWhileMoving": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha +2 Armadura e +2 Esquiva. Também ganha +1 RAM e é considerado um tamanho menor enquanto se move. Pode se mover através dos espaços de Digimon maiores que ele, mesmo que não seja Pequeno ou menor, mas não pode terminar seu movimento nesses espaços.",
    "description": "Armadura de Digizóide Flexível combina defesa, mobilidade e agilidade em uma proteção adaptável."
  },
  {
    "id": "armaduraDeDigizoideLeve",
    "name": "Armadura de Digizóide Leve",
    "originalName": "Light Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Armadura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "dodgeBonus": 3,
      "movementBonus": 1,
      "automaticDodgeSuccesses": 1,
      "stacksWithAbsoluteEvasion": true,
      "doesNotDecreaseDodgePool": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha +3 Esquiva. Seu Movimento aumenta em 1 e ele ganha 1 Sucesso automático de Esquiva em todo Teste de Esquiva que fizer. Isso acumula com Evasão Absoluta e não reduz a Pool de Esquiva.",
    "description": "Armadura de Digizóide Leve prioriza esquiva, mobilidade e defesas automáticas."
  },
  {
    "id": "armaduraDeDigizoideRadiante",
    "name": "Armadura de Digizóide Radiante",
    "originalName": "Shining Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Armadura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 2,
      "healthBonus": 2,
      "incomingNegativeEffectPotencyReduction": 1,
      "incomingNegativeEffectPotencyMinimum": 1
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "chatMessage": "Ao sofrer Dano Inalterável de um inimigo, role d6s para reduzir o Dano."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "unalterableDamageReduction": {
      "trigger": "wouldTakeUnalterableDamageDueToEnemy",
      "dicePerDamage": 1,
      "die": "d6",
      "reductionPerSuccess": 1
    },
    "effect": "O Digimon ganha +2 Armadura e +2 Saúde. Também reduz a Potência de Efeitos Negativos recebidos em 1, até o mínimo de 1. Além disso, sempre que sofreria Dano Inalterável devido a um inimigo, pode fazer um Teste de Pool com uma quantidade de d6s igual ao Dano que sofreria, reduzindo o Dano em 1 para cada Sucesso.",
    "description": "Armadura de Digizóide Radiante combina proteção sólida com resistência a Efeitos Negativos e Dano Inalterável."
  },
  {
    "id": "armamentoDeDigizoideCromado",
    "name": "Armamento de Digizóide Cromado",
    "originalName": "Chrome Digizoid Weaponry",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 2,
      "damageBonus": 1,
      "effectPotencyBonus": 1
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Os ataques [WEAPON] do Digimon recebem +2 Precisão, +1 Dano e +1 Potência em Tags de Efeito.",
    "description": "Armamento de Digizóide Cromado aprimora ataques com Arma, aumentando precisão, dano e potência de efeitos."
  },
  {
    "id": "armamentoDeDigizoideAmaldicoado",
    "name": "Armamento de Digizóide Amaldiçoado",
    "originalName": "Cursed Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 2,
      "damageBonus": 1,
      "conditionalDamageBonus": {
        "condition": "atHalfMaximumWoundBoxesOrFewer",
        "appliesTo": "weaponAttacks",
        "value": 2
      }
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Os ataques [WEAPON] do Digimon recebem +2 Precisão e +1 Dano. Quando o Digimon está com metade ou menos de suas Caixas de Ferimento máximas, recebe +2 Dano em ataques com a Tag [WEAPON].",
    "description": "Armamento de Digizóide Amaldiçoado fica mais perigoso quando o Digimon está ferido."
  },
  {
    "id": "armamentoDeDigizoideAdaptavel",
    "name": "Armamento de Digizóide Adaptável",
    "originalName": "Adaptive Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": []
    },
    "grants": {
      "immuneToDisarm": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfTurn",
      "chatMessage": "Distribua 4 pontos entre Precisão e Dano para seus ataques [WEAPON] até o início do seu próximo turno."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "adaptiveWeaponry": {
      "pointsPerTurn": 4,
      "canSpendOn": [
        "accuracy",
        "damage"
      ],
      "appliesTo": "weaponAttacks",
      "lastsUntilStartOfNextTurn": true,
      "canSplitFreely": true
    },
    "effect": "No início de cada um de seus turnos, o Digimon ganha 4 pontos que pode usar para conceder bônus de Precisão ou Dano a seus ataques [WEAPON] até o início de seu próximo turno. Pode dividir esses pontos como quiser. Além disso, o Digimon é imune a [DISARM].",
    "description": "Armamento de Digizóide Adaptável permite redistribuir poder ofensivo entre precisão e dano a cada turno."
  },
  {
    "id": "armamentoDeDigizoideAfiado",
    "name": "Armamento de Digizóide Afiado",
    "originalName": "Sharp Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 4,
      "unalterableDamageOnDamageWeaponHit": 2
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Os ataques [WEAPON] do Digimon recebem +4 Precisão. Os ataques [DAMAGE][WEAPON] do Digimon causam 2 Dano Inalterável ao acertar.",
    "description": "Armamento de Digizóide Afiado torna ataques com Arma extremamente precisos e capazes de atravessar defesas."
  },
  {
    "id": "armamentoDeDigizoideFlexivel",
    "name": "Armamento de Digizóide Flexível",
    "originalName": "Flexible Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "rangeWeaponRangeBonus": 1,
      "meleeWeaponReachBonus": 1,
      "meleeWeaponReachAsWideSwings": true,
      "stacksWithReachOptions": true
    },
    "grants": {
      "bitBonus": 1,
      "dodgeBonus": 3,
      "escapeClashAutomaticallySucceeds": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha +1 BIT e +3 Esquiva. Seus ataques [RANGE][WEAPON] recebem +1 Alcance, e seus ataques [MELEE][WEAPON] podem acertar até 1 espaço adicional, como se tivessem 1 Rank de Alcance: Golpes Amplos sem penalidades. Se o Digimon já tiver qualquer opção de Alcance, seus benefícios acumulam com esta Qualidade. Além disso, se o Digimon escolher a opção Escapar do Clash, tem sucesso automaticamente em vez de rolar.",
    "description": "Armamento de Digizóide Flexível amplia alcance, evasão e versatilidade de ataques com Arma."
  },
  {
    "id": "armamentoDeDigizoidePesado",
    "name": "Armamento de Digizóide Pesado",
    "originalName": "Heavy Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "damageBonus": 5,
      "damageWeaponAppliesHeavy": true,
      "heavyDurationRounds": 1
    },
    "grants": {
      "movementPenalty": -1,
      "dosBonus": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "heavyWeaponRules": {
      "weaponHeavyAttackBenefits": [
        "Se o alvo tiver apenas Movimento Extra ou Teleporte, seu Movimento ainda é reduzido.",
        "Se o alvo tiver Mobilidade Avançada e/ou Transportador, também perde os benefícios do Movimento Extra e Teleporte associados."
      ]
    },
    "effect": "Os ataques [WEAPON] do Digimon recebem +5 Dano. O Digimon sofre -1 de penalidade em Movimento, mas ganha +1 DOS. Além disso, ataques [DAMAGE][WEAPON] do Digimon aplicam [HEAVY] com Duração de 1 rodada. Um ataque [WEAPON][HEAVY] reduz Movimento mesmo se o alvo tiver apenas Movimento Extra ou Teleporte; se o alvo tiver Mobilidade Avançada e/ou Transportador, também perde os benefícios do Movimento Extra e Teleporte associados.",
    "description": "Armamento de Digizóide Pesado maximiza dano e aplica peso debilitante aos alvos atingidos."
  },
  {
    "id": "armamentoDeDigizoideLeve",
    "name": "Armamento de Digizóide Leve",
    "originalName": "Light Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 3,
      "damageBonus": 3,
      "automaticAccuracySuccesses": 1,
      "stacksWithCertainStrike": true
    },
    "grants": {
      "extraAction": {
        "amount": 1,
        "timing": "turn",
        "allowedActions": [
          "Fortalecer",
          "Mover",
          "Movimento Difícil"
        ],
        "difficultMoveStillRequiresAdditionalAction": true
      }
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Os ataques [WEAPON] do Digimon recebem +3 Precisão e +3 Dano. Ataques com a Tag [WEAPON] recebem 1 Sucesso automático de Precisão em todo Teste de Precisão. Isso acumula com Golpe Certeiro. Além disso, o Digimon ganha 1 Ação extra em seus turnos que pode ser usada para realizar as Ações Fortalecer, Mover ou Movimento Difícil, embora Movimento Difícil ainda exija 1 Ação adicional.",
    "description": "Armamento de Digizóide Leve combina velocidade ofensiva, precisão automática e uma ação extra utilitária."
  },
  {
    "id": "armamentoDeDigizoideRadiante",
    "name": "Armamento de Digizóide Radiante",
    "originalName": "Shining Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 5,
      "damageBonus": 1,
      "meleeDamageMinimumAfterArmor": 2,
      "meleeSupportDurationBonusOnHit": 1,
      "rangeAndEffectiveLimitBonus": 3
    },
    "grants": {
      "temporaryIpOnInitiative": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Os ataques [WEAPON] do Digimon recebem +5 Precisão e +1 Dano. Ataques [WEAPON] recebem um bônus adicional dependendo de serem [MELEE] ou [RANGE]. Em ataques [MELEE], se tiverem a Tag [DAMAGE], causam Dano mínimo de 2 após Armadura; se tiverem a Tag [SUPPORT], recebem +1 Duração em um acerto bem-sucedido. Em ataques [RANGE], recebem +3 Alcance e +3 Limite Efetivo. Além disso, o Digimon ganha 1 PI Temporário quando rola Iniciativa. Esse PI pode ser gasto a qualquer momento usando as regras padrão de Tamers. Se não for gasto até o fim do combate, é perdido.",
    "description": "Armamento de Digizóide Radiante concede precisão extrema, reforça ataques corpo a corpo ou à distância e gera PI temporário."
  },
  {
    "id": "armamentoDeDigizoidePuro",
    "name": "Armamento de Digizóide Puro",
    "originalName": "Pure Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega, 1 ou mais Ranks de Arma e 3 Ranks de Algoritmo.",
      "qualityNames": "Arma, Algoritmo"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outro Armamento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [
        "offhand"
      ],
      "accuracyBonus": 2,
      "damageBonus": 2,
      "offhandTreatedAsWeaponRank": 2,
      "weaponAndOffhandMayBothApplyToSignatureMove": true,
      "signatureMoveWeaponBonusCapFormula": "4 + currentBattery"
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Os ataques com a Tag [WEAPON] do Digimon recebem +2 Dano e +2 Precisão. O Digimon ganha a Tag [OFFHAND] independentemente das Tags [WEAPON] que já possua, tratada como uma Tag [WEAPON] de Rank 2. Ambas as Tags de Arma podem ser aplicadas ao mesmo ataque se ele for um Movimento Assinatura, mas o bônus ao ataque devido a [WEAPON] não pode exceder 4 + a Bateria atual do Digimon. Quando este Digimon sofreria [DISARM], quem aplica o Efeito precisa escolher como alvo a Tag [WEAPON] ou [OFFHAND], e não pode remover ambas de uma vez.",
    "description": "Armamento de Digizóide Puro combina Arma e Offhand em um armamento supremo, especialmente potente em Movimentos Assinatura."
  },
  {
    "id": "overwrite",
    "name": "Overwrite",
    "originalName": "Overwrite",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade de Perfeito"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Perfeito ou superior e 1 Rank de Instinto.",
      "qualityNames": "Instinto"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outra Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Ative Overwrite para negar Efeitos externos pagando Caixas de Ferimento."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "overwrite": {
      "activeUntilEndOfCombat": true,
      "canEndAsFreeActionDuringTurn": true,
      "woundBoxesLostFormula": "effectCost * 2",
      "negatesEffectFromOutsideSource": true,
      "cannotNegateIfWouldDropToZeroWoundBoxes": true,
      "grantsResolveForCombatMonster": true,
      "doesNotAffectEffectsWithoutCost": true,
      "doesNotAffectEffectsGrantedByOwnQualities": true
    },
    "effect": "Como 1 Ação, o Digimon pode ativar Overwrite. Enquanto estiver ativado, ou até o fim do combate, sempre que o Digimon sofreria um Efeito de uma fonte externa, ele perde Caixas de Ferimento iguais ao dobro do custo desse Efeito para negá-lo. Se perder Caixas de Ferimento levaria o Digimon a 0 Caixas de Ferimento, o Efeito não é negado. O Digimon também pode encerrar isso como Ação Livre durante seu turno. Perder Caixas de Ferimento por Overwrite concede Resolve para Monstro de Combate. Esta Qualidade não afeta Efeitos que não têm custo, nem Efeitos concedidos pelas próprias Qualidades do usuário, como Overclock.",
    "description": "Overwrite permite que o Digimon force seu corpo digital a negar Efeitos externos, pagando o preço em Ferimentos."
  },
  {
    "id": "inforceImortal",
    "name": "inForce Imortal",
    "originalName": "Undying inForce",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Instinto.",
      "qualityNames": "Instinto"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outra Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "passiveRegenWhenBelowHalfWounds": true,
      "secondWindCanAttackSameTurn": true,
      "secondWindAdditionalUsesFormula": "instinctRanks"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "regen": {
      "condition": "belowHalfMaximumWoundBoxes",
      "potencyFormula": "instinctRanks",
      "noEffectAtZeroWoundBoxes": true,
      "cleanseReductionOrRemovalPersistsForRounds": 1
    },
    "reroll": {
      "oncePerRound": true,
      "resetsAtEndOfDigimonTurn": true,
      "pool": "health",
      "rerollResultsUpTo": 1,
      "ifHasVitalEnergyIncreaseBy": 1,
      "maximumRerollResultsUpTo": 3
    },
    "effect": "O Digimon possui uma capacidade regenerativa incomparável. Sempre que estiver abaixo de metade de suas Caixas de Ferimento máximas, ganha um Efeito [REGEN] passivo com Potência igual aos seus Ranks em Instinto. Isso não tem efeito quando o Digimon está com 0 Caixas de Ferimento. Se esse Efeito for afetado por [CLEANSE], a redução de Potência ou remoção do Efeito persiste apenas por 1 rodada. Se o Digimon possuir Segundo Fôlego, ignora a restrição que impede atacar no mesmo turno em que ele é usado, e ganha usos adicionais iguais aos seus Ranks em Instinto. Além disso, uma vez por rodada, reiniciando no fim dos turnos do Digimon, ele pode rerrolar quaisquer resultados 1 em um Teste de Saúde. Se possuir Energia Vital, os resultados que pode rerrolar aumentam em 1, até o máximo de 3.",
    "description": "inForce Imortal concede regeneração contínua, melhora Segundo Fôlego e fortalece Testes de Saúde."
  },
  {
    "id": "inforceTemporal",
    "name": "inForce Temporal",
    "originalName": "Temporal inForce",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Instinto.",
      "qualityNames": "Instinto"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outra Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "chooseInitiativeAfterAllRolls": true,
      "enemiesCannotTakeInterruptActionsDuringTurn": true,
      "canAdjustInitiativeEveryOtherTurn": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "initiative": {
      "noInitiativeRoll": true,
      "choosePositionAfterAllInitiativeRolls": true,
      "otherDigimonCannotInterruptDuringTurnExceptHoldAction": true,
      "adjustPositionEveryOtherTurn": true,
      "cannotAdjustIfAffectedByLag": true,
      "ifHasCombatAwareness": {
        "immuneToLag": true,
        "addInstinctRanksToCombatAwarenessBonuses": true
      }
    },
    "reroll": {
      "oncePerRound": true,
      "resetsAtEndOfDigimonTurn": true,
      "pool": "accuracy",
      "rerollResultsUpTo": 1,
      "ifHasHugePowerIncreaseBy": 1,
      "maximumRerollResultsUpTo": 3
    },
    "effect": "O Digimon não precisa mais rolar Iniciativa para combate. Depois que todas as outras rolagens de Iniciativa forem feitas, ele decide sua posição na Ordem de Turnos. Outros Digimon não podem usar Ações de Interrupção durante seu turno, como Interceder; a única forma de agir assim é por Ação Preparar. Depois de decidir sua posição na ordem, a cada outro turno pode ajustar sua posição na Iniciativa. Se estiver afetado por [LAG], não pode ajustar sua Iniciativa. Se tiver quaisquer Ranks de Consciência de Combate, é imune aos efeitos de [LAG] e adiciona seus Ranks em Instinto a quaisquer bônus fornecidos por ela. Além disso, uma vez por rodada, reiniciando no fim dos turnos do Digimon, pode rerrolar quaisquer resultados 1 em uma Pool de Precisão. Se possuir Poder Brutal, os resultados que pode rerrolar aumentam em 1, até o máximo de 3.",
    "description": "inForce Temporal permite controlar a ordem de turnos, impedir interrupções e repetir resultados baixos em Precisão."
  },
  {
    "id": "inforceOnisciente",
    "name": "inForce Onisciente",
    "originalName": "Omniscient inForce",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Instinto.",
      "qualityNames": "Instinto"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outra Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canUseHoldActionAffectingSelfWithoutTamer": true,
      "freeHoldActionOncePerTurn": true,
      "holdActionCanBypassAttackOncePerTurnLimit": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "turn",
      "chatMessage": "Use Ação Preparar uma vez por turno gratuitamente."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "turn"
    },
    "holdAction": {
      "affectsSelfWithoutTamer": true,
      "freeOncePerTurn": true,
      "canTakeSecondHoldActionWithTwoActions": true,
      "accuracyOrDodgePoolBonusFormula": "instinctRanks",
      "bypassOneAttackPerTurnLimitWhenUsingHoldAction": true,
      "ifUsingPaidAndFreeHoldCanUseForTwoActionCosts": true
    },
    "reroll": {
      "oncePerRound": true,
      "resetsAtEndOfDigimonTurn": true,
      "pool": "dodge",
      "rerollResultsUpTo": 1,
      "ifHasAvoidanceIncreaseBy": 1,
      "maximumRerollResultsUpTo": 3
    },
    "effect": "O Digimon ganha a capacidade de usar a Ação Preparar que afeta a si mesmo, independentemente de ter ou não um Tamer. Pode realizar a Ação Preparar uma vez por turno gratuitamente. Portanto, pode realizar duas Ações Preparar em seu turno: uma gratuita e uma usando 2 Ações. Sempre que rolar uma Pool de Precisão ou Esquiva como parte da Ação Preparar, pode adicionar seus Ranks em Instinto como bônus ao Teste de Pool. Também pode ignorar o limite de uma vez por turno para ataques quando usa Ação Preparar. Se usar 2 Ações para realizar uma Ação Preparar junto com a Ação Preparar gratuita desta Qualidade, pode usar Ação Preparar para algo que custa 2 Ações, como Ataque Mirado. Além disso, uma vez por rodada, reiniciando no fim dos turnos do Digimon, pode rerrolar quaisquer resultados 1 em uma Pool de Esquiva. Se possuir Esquiva, os resultados que pode rerrolar aumentam em 1, até o máximo de 3.",
    "description": "inForce Onisciente transforma previsão em ação preparada gratuita, bônus em rolagens e rerrolagens de Esquiva."
  },
  {
    "id": "perigoDigital",
    "name": "Perigo Digital",
    "originalName": "Digital Hazard",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Instinto.",
      "qualityNames": "Instinto"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outra Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque com [HAZARD]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "hazard"
      ],
      "appliesTo": "oneAttack",
      "replacesTags": [
        "melee",
        "range",
        "damage",
        "support"
      ],
      "cannotHaveAdditionalTagsExceptEffectTags": true,
      "automaticDamageNoAccuracyOrDodgeRoll": true,
      "damageBonusFormula": "instinctRanks",
      "effectRequiresMinimumDamage": 4
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Declare um ataque [HAZARD] para causar Dano automático em tudo dentro de metade do Alcance do ataque."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "hazard": {
      "affectsEverythingWithinHalfRange": true,
      "damageReducedByArmorNormally": true,
      "woundBoxCostAfterFirstUsePerCombatFormula": "sv",
      "noWoundBoxCostIfSignatureMove": true,
      "woundBoxCostDoesNotGrantResolve": true,
      "effectTagMinimumDamageToApply": 4
    },
    "effect": "O Digimon ganha o efeito de uma única Tag [HAZARD]. Essa Tag pode ser aplicada a um dos ataques do Digimon e substitui as Tags [MELEE], [RANGE], [DAMAGE] e [SUPPORT]. Quando um ataque [HAZARD] é declarado, o usuário causa Dano automático, sem rolar Precisão ou Esquiva, a tudo dentro de metade do Alcance do ataque. O Dano sofrido por esse ataque é reduzido por Armadura normalmente. O ataque recebe bônus de Dano igual aos Ranks em Instinto. Cada vez que [HAZARD] é usado após o primeiro uso por combate, o Digimon perde Caixas de Ferimento iguais ao seu SV, a menos que esteja em seu Movimento Assinatura. Isso não aumenta o Resolve do Digimon. Este ataque não pode receber Tags adicionais como [PIERCING], [CERTAIN], [CHARGE] etc., exceto Tags de Efeito de Ataque. Se houver uma Tag de Efeito anexada ao ataque com [HAZARD], é preciso causar pelo menos 4 Dano para aplicar o Efeito.",
    "description": "Perigo Digital converte um ataque em uma anomalia destrutiva automática, perigosa até para o próprio usuário."
  },
  {
    "id": "unidadeZero",
    "name": "Unidade Zero",
    "originalName": "Zero Unit",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega e 1 Rank de Instinto.",
      "qualityNames": "Instinto"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algoritmo, Qualquer outra Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [SUPPORT] com [ZERO]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "zero"
      ],
      "appliesTo": "oneSupportAttack",
      "countsAsPositiveEffectWithNoDuration": true,
      "cannotBeAreaAttackWhenUsed": true,
      "actionCostWhenUsed": 2,
      "grantsBenefitsOncePerCombat": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "actionCost": 2,
      "chatMessage": "Use [ZERO] para conceder evolução gratuita ou restaurar um aliado derrotado."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "zeroUnit": {
      "chooseEffectOnAttackDeclaration": true,
      "options": [
        {
          "key": "freeEvolution",
          "target": "allAlliesWithinSvSpaces",
          "effect": "Um alvo pode imediatamente realizar a Ação Evoluir gratuitamente se tiver desbloqueado um Estágio superior para o qual possa evoluir. Se a evolução exigir Pontos de Evolução, o Digimon é imediatamente tratado como se tivesse gasto Pontos de Evolução iguais aos Ranks de Instinto do atacante, podendo então gastar quaisquer Pontos de Evolução adicionais necessários."
        },
        {
          "key": "reviveDefeatedAlly",
          "target": "singleDefeatedAlly",
          "effect": "O Digimon é imediatamente trazido de volta com Caixas de Ferimento iguais ao dobro dos Ranks de Instinto do atacante, deixando de estar derrotado. Se o Digimon estava em um Estágio superior antes de ser derrotado, evolui de volta para esse Estágio com as Caixas de Ferimento concedidas. Não tem efeito em Digimon que reverteram a Digi-Ovos."
        }
      ],
      "signatureMoveBonusFormula": "battery",
      "positiveEffectTagAutoAppliesToOneTargetForRoundsFormula": "instinctRanks"
    },
    "effect": "O Digimon aplica a Tag [ZERO] a um ataque [SUPPORT], que conta como um Efeito Positivo sem Duração. O ataque só pode conceder os benefícios de [ZERO] uma vez por combate; quando o faz, não pode ser usado como Área de Ataque e exige 2 Ações. Ele fornece um dos benefícios escolhidos ao declarar o ataque. Para todos os aliados dentro de um número de espaços igual ao SV do Digimon, um alvo pode imediatamente realizar a Ação Evoluir gratuitamente se tiver desbloqueado um Estágio superior. Se a evolução exigir Pontos de Evolução, o alvo é tratado como se tivesse gasto Pontos de Evolução iguais aos Ranks de Instinto do atacante. Para um único aliado derrotado, o Digimon é trazido de volta com Caixas de Ferimento iguais ao dobro dos Ranks de Instinto do atacante e deixa de estar derrotado; se estava em Estágio superior antes de ser derrotado, evolui de volta para esse Estágio. Não afeta Digimon que reverteram a Digi-Ovos. Se a Tag estiver no Movimento Assinatura do Digimon, o bônus de Pontos de Evolução ou Caixas de Ferimento aumenta com a Bateria. Se uma Tag de Efeito Positivo for usada no mesmo ataque que [ZERO], ela aplica automaticamente o Efeito Positivo sem rolagens por uma quantidade de rodadas igual aos Ranks de Instinto do Digimon, mas apenas a um alvo afetado pelo ataque.",
    "description": "Unidade Zero concede evolução emergencial ou retorno de aliados derrotados, funcionando como um suporte supremo."
  },
  {
    "id": "overwritePuro",
    "name": "Overwrite Puro",
    "originalName": "Pure Overwrite",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Qualidade de Mega"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Mega, 1 ou mais Ranks de Instinto e 3 Ranks de Algoritmo.",
      "qualityNames": "Instinto, Algoritmo"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Qualquer outra Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "immuneToNegativeEffectsCostTwoOrLower": true,
      "cannotBeSuppressed": true,
      "secondWindCanActivateWithoutExpendingUse": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon sobreviveu a condições perigosas e ganhou uma nova forma. O Digimon tem imunidade a todos os Efeitos Negativos que custam 2 PD ou menos. Esta Qualidade NÃO pode ser suprimida. Se o Digimon possuir Segundo Fôlego, pode ativá-lo em seu turno sem gastar um uso ao custo de 1 Ação extra. Isso também permite usá-lo quando não restarem usos.",
    "description": "Overwrite Puro concede imunidade permanente a muitos Efeitos Negativos e melhora drasticamente Segundo Fôlego."
  },
  {
    "id": "melhoriaDeMemoria",
    "name": "Melhoria de Memória",
    "originalName": "Memory Upgrade",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "requirements": {
      "text": "O Digimon só pode comprar Ranks nesta Qualidade para cada 3 Tags de Ataque obtidas por Qualidades.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "attackListIncreasePerRank": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon aumenta sua Lista de Ataques em 1 por Rank. O Digimon só pode comprar Ranks nesta Qualidade para cada 3 Tags de Ataque obtidas por Qualidades. Esta Qualidade não conta contra o limite de Qualidades Gratuitas do Digimon.",
    "description": "Melhoria de Memória expande a quantidade de ataques disponíveis conforme o Digimon acumula Tags de ataque."
  },
  {
    "id": "modoMisericordioso",
    "name": "Modo Misericordioso",
    "originalName": "Merciful Mode",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "attacksDefaultNonLethal": true,
      "holdBackAnyStance": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Os ataques do Digimon são, por padrão, não letais. O Digimon só pode usar a Ação Segurar o Golpe em vez da Ação Atacar, mas agora pode usar Segurar o Golpe independentemente da Postura.",
    "description": "Modo Misericordioso representa um Digimon que evita causar ferimentos fatais."
  },
  {
    "id": "matador",
    "name": "Matador",
    "originalName": "Slayer",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Ao comprar esta Qualidade, escolha uma Família, Tipo de Digimon ou Elemento de Passo Natural.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Alvo de Matador",
      "options": [
        "Família",
        "Tipo de Digimon",
        "Elemento de Passo Natural"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "accuracyBonusAgainstChosenTargetFormula": "dos"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Ao comprar esta Qualidade, o Digimon escolhe uma Família, Tipo de Digimon ou Elemento de Passo Natural. O Digimon recebe bônus de Precisão igual ao seu DOS contra inimigos que correspondam à escolha. Porém, se errar um ataque que se beneficiaria desse bônus, sofre Dano Inalterável igual ao seu SV.",
    "description": "Matador torna o Digimon especialmente eficaz contra um tipo específico de inimigo, mas perigoso para si mesmo quando falha."
  },
  {
    "id": "overwriteViolento",
    "name": "Overwrite Violento",
    "originalName": "Violent Overwrite",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfRound",
      "chatMessage": "Role 1d6 para Overwrite Violento."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "randomEffect": {
      "die": "1d6",
      "results": {
        "1": "O Digimon sofre 2 Dano Inalterável.",
        "2": "O Digimon recupera 2 Caixas de Ferimento.",
        "3-6": "Nada acontece."
      }
    },
    "effect": "No início de cada rodada, role 1d6. Em 1, o Digimon sofre 2 Dano Inalterável. Em 2, recupera 2 Caixas de Ferimento. Em 3–6, nada acontece.",
    "description": "Overwrite Violento representa instabilidade digital que pode ferir ou restaurar o Digimon."
  },
  {
    "id": "armasCriticas",
    "name": "Armas Críticas",
    "originalName": "Critical Arms",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "weaponAttack",
      "chatMessage": "Role 2d6 como Dados Críticos junto da Pool de Precisão."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "criticalDice": {
      "die": "2d6",
      "rolledWith": "accuracyPool",
      "treatedAsSeparate": true,
      "results": {
        "2": "O ataque erra automaticamente, apesar da Pool de Precisão, e o Digimon sofre [DISARM] até o fim do combate ou até gastar 2 Ações para encerrar o Efeito.",
        "12": "O ataque recebe +3 Sucessos de Precisão e, se ainda erraria, acerta mesmo assim, ignorando os resultados de Precisão e Esquiva.",
        "3-11": "Nada acontece."
      }
    },
    "effect": "O Digimon rola 2d6 sempre que faz um ataque [WEAPON], chamados Dados Críticos. Os Dados Críticos são rolados junto da Pool de Precisão, mas tratados separadamente. Em 2, o ataque erra automaticamente e o Digimon sofre [DISARM]. Em 12, o ataque recebe +3 Sucessos de Precisão e acerta mesmo que erraria.",
    "description": "Armas Críticas tornam ataques com Arma mais instáveis, com chance de falha dramática ou acerto decisivo."
  },
  {
    "id": "erroSortudo",
    "name": "Erro Sortudo",
    "originalName": "Lucky Miss",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "dodge",
      "chatMessage": "Role 2d6 como Dados de Sorte junto da Pool de Esquiva."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "luckyDice": {
      "die": "2d6",
      "rolledWith": "dodgePool",
      "treatedAsSeparate": true,
      "results": {
        "2": "O Digimon trata seu resultado de Esquiva como 0.",
        "12": "A Esquiva recebe +3 Sucessos de Esquiva e, se o ataque ainda acertar, o Dano sofrido é reduzido pela metade após Armadura, arredondado para cima, e a Potência e Duração de qualquer Efeito são reduzidas em 1.",
        "3-11": "Nada acontece."
      }
    },
    "effect": "O Digimon rola 2d6 sempre que tenta Esquivar, chamados Dados de Sorte. Os Dados de Sorte são rolados junto da Pool de Esquiva, mas tratados separadamente. Em 2, o Digimon trata o resultado de Esquiva como 0. Em 12, ganha +3 Sucessos de Esquiva e, se o ataque ainda acertar, reduz o Dano sofrido pela metade após Armadura e reduz Potência e Duração de qualquer Efeito em 1.",
    "description": "Erro Sortudo torna Esquivas mais imprevisíveis, podendo causar desastre ou salvar o Digimon no último segundo."
  },
  {
    "id": "talentoInato",
    "name": "Talento Inato",
    "originalName": "Innate Talent",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Escolha duas Perícias de uma única categoria de Atributo.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "twoSkillsFromSingleAttributeCategory",
      "label": "Duas Perícias com Perícia Prodigiosa",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "allStatsPenalty": -1,
      "prodigiousSkillForChosenSkills": true,
      "chosenSkillCount": 2
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon sofre -1 em todas as Estatísticas. Em troca, escolhe duas Perícias de uma única categoria de Atributo e as trata como se tivesse Perícia Prodigiosa nessas Perícias.",
    "description": "Talento Inato troca desempenho geral por excelência natural em duas Perícias relacionadas."
  },
  {
    "id": "investidaVingativa",
    "name": "Investida Vingativa",
    "originalName": "Vengeful Charge",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "noBatteryAtStartOfTurns": true,
      "batteryWhenFirstDropsBelowHalfWounds": 3
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "O Digimon não ganha mais Bateria no início de seus turnos. Em vez disso, ganha 3 Bateria quando suas Caixas de Ferimento caem abaixo de metade do máximo pela primeira vez no combate.",
    "description": "Investida Vingativa troca carga constante por uma explosão de Bateria quando o Digimon é pressionado."
  },
  {
    "id": "justicaECega",
    "name": "Justiça é Cega",
    "originalName": "Justice Is Blind",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "O Digimon é visualmente deficiente ou cego e não consegue enxergar.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "immuneToBlind": true,
      "prodigiousAwarenessForNonSightSenses": true,
      "ignoresSightBasedIllusions": true,
      "ignoresSightImpairingEffects": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "attackModifier",
      "chatMessage": "Gaste 1 Ação extra para ignorar penalidades de obscurecido contra um alvo único."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon é visualmente deficiente ou cego e não consegue enxergar. Ele é imune a [BLIND], trata Percepção como Perícia Prodigiosa para todos os sentidos exceto visão, está sempre cego, mas trata todos os alvos ao redor como obscurecidos em vez de escondidos, a menos que se escondam especificamente. Quando faz um ataque contra um único alvo, pode ignorar as penalidades de obscurecido ao custo de 1 Ação extra. Se tiver um Tamer, o Tamer pode gastar a própria Ação em vez disso. O Digimon ignora todas as ilusões baseadas em visão e efeitos que prejudiquem visão, como fumaça ou escuridão.",
    "description": "Justiça é Cega representa um Digimon sem visão funcional, mas com outros sentidos extraordinários."
  },
  {
    "id": "tamanhoInconsistente",
    "name": "Tamanho Inconsistente",
    "originalName": "Inconsistent Size",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requer Adulto. Não tem efeito se o Digimon se tornar seu Estágio Padrão.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "onEvolution",
      "chatMessage": "Role 1d6 para determinar o tamanho do Digimon neste Estágio."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "randomSize": {
      "die": "1d6",
      "results": {
        "1": "small",
        "6": "huge",
        "2-3": "medium",
        "4-5": "large"
      },
      "lastsUntilEndOfCombatAndDevolution": true,
      "affectsDerivedStatsNormally": true
    },
    "effect": "O Digimon não tem controle sobre o tamanho que assume ao evoluir. Isso não tem efeito se ele se tornar seu Estágio Padrão. Ao evoluir para o Estágio com esta Qualidade, role 1d6 para determinar o tamanho: 1 Pequeno; 2–3 Médio; 4–5 Grande; 6 Enorme. O tamanho permanece assim até o fim do combate e até o Digimon involuir. Isso afeta Estatísticas Derivadas normalmente.",
    "description": "Tamanho Inconsistente faz com que a evolução produza um tamanho imprevisível."
  },
  {
    "id": "armaSelada",
    "name": "Arma Selada",
    "originalName": "Sealed Weapon",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Arma.",
      "qualityNames": "Arma"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "weaponRankTreatedAsOneHigherAfterUnlock": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "O Digimon não pode usar ataques [WEAPON] até suas Caixas de Ferimento caírem abaixo de metade do máximo pela primeira vez no combate. Depois disso, os ataques [WEAPON] do Digimon são tratados como 1 Rank maior, mesmo em [WEAPON 3], aumentando Precisão, Dano e bônus secundários em 1.",
    "description": "Arma Selada restringe ataques com Arma até o Digimon ser pressionado, então libera uma versão mais forte deles."
  },
  {
    "id": "instintoDesperto",
    "name": "Instinto Desperto",
    "originalName": "Awakened Instinct",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Instinto.",
      "qualityNames": "Instinto"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "temporaryWoundBoxesWhenFirstDropsBelowHalfFormula": "instinctRanks * 2"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "O Digimon não recebe os benefícios de Esquiva e Movimento de Instinto até suas Caixas de Ferimento caírem abaixo de metade do máximo pela primeira vez no combate. Porém, quando cai abaixo desse limite, também ganha Caixas de Ferimento Temporárias iguais ao dobro de seus Ranks em Instinto.",
    "description": "Instinto Desperto adia os benefícios de Instinto até o momento crítico, concedendo proteção temporária quando desperta."
  },
  {
    "id": "reforcoPositivo",
    "name": "Reforço Positivo",
    "originalName": "Positive Reinforcement",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Gratuita"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requer Monstro de Combate, Conjurador ou Invocador.",
      "qualityNames": "Monstro de Combate, Conjurador, Invocador"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "moodMeter": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "moodMeter",
      "chatMessage": "Ajuste o Humor do Digimon conforme acertos, esquivas, erros e ataques sofridos."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "moodMeter": {
      "die": "1d6",
      "startsAt": 3,
      "gainMoodWhen": [
        "O Digimon acerta um ataque.",
        "O Digimon esquiva de um ataque."
      ],
      "loseMoodWhen": [
        "O Digimon erra um ataque.",
        "O Digimon é atingido por um ataque."
      ],
      "effects": {
        "poor": {
          "values": [
            1,
            2
          ],
          "effect": "O Humor é Ruim e o Digimon perde -1 Precisão e -1 Armadura para cada ponto abaixo de 3."
        },
        "neutral": {
          "values": [
            3,
            4
          ],
          "effect": "O Humor é Neutro e não concede bônus nem penalidades."
        },
        "good": {
          "values": [
            5,
            6
          ],
          "effect": "O Humor é Bom e o Digimon ganha +1 Esquiva e +1 Dano para cada ponto acima de 4."
        }
      },
      "partnerCheerUp": {
        "condition": "moodAt1",
        "actionCost": 2,
        "setMoodTo": 4
      }
    },
    "effect": "O Digimon ganha um Medidor de Humor, representado por 1d6, e começa cada combate com Humor 3. Sempre que acerta um ataque ou esquiva de um ataque, ganha +1 Humor. Sempre que erra um ataque ou é atingido, sofre -1 Humor. Em Humor 1–2, seu Humor é Ruim e perde -1 Precisão e -1 Armadura para cada ponto abaixo de 3. Em Humor 3–4, é Neutro. Em Humor 5–6, é Bom e ganha +1 Esquiva e +1 Dano para cada ponto acima de 4. Se o Humor cair para 1, o Parceiro Humano pode usar 2 Ações para animar o Digimon e definir seu Humor como 4.",
    "description": "Reforço Positivo cria um medidor emocional que oscila conforme o desempenho do Digimon em combate."
  },
  {
    "id": "volumoso",
    "name": "Volumoso",
    "originalName": "Bulky",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Acelerar"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "movementPenaltyPerRank": -1,
      "teleportRangePenaltyPerRank": -1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Para cada Rank nesta Qualidade, o Movimento do Digimon é reduzido em 1. Se o Digimon tiver Teleporte, seu alcance também é reduzido pela mesma quantidade.",
    "description": "Volumoso torna o Digimon mais lento e prejudica também sua distância de Teleporte."
  },
  {
    "id": "baixaVitalidade",
    "name": "Baixa Vitalidade",
    "originalName": "Low Vitality",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "halveMaximumWoundBoxes": true,
      "cannotGainTemporaryWoundBoxes": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "As Caixas de Ferimento máximas do Digimon são reduzidas pela metade, e ele não pode ganhar Caixas de Ferimento Temporárias.",
    "description": "Baixa Vitalidade torna o Digimon muito mais frágil e incapaz de receber proteção temporária."
  },
  {
    "id": "assinaturaComplexa",
    "name": "Assinatura Complexa",
    "originalName": "Complex Signature",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "O Movimento Assinatura deve ter pelo menos 2 outras Tags vindas de Qualidades não Negativas. O ataque não pode já exigir 2 ou mais Ações.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "signatureMove",
      "label": "Movimento Assinatura com [COMPLEX]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "complex"
      ],
      "appliesTo": "signatureMove",
      "actionCostIncrease": 1
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon aplica a Tag [COMPLEX] ao seu Movimento Assinatura. O Movimento Assinatura já precisa ter 2 outras Tags vindas de Qualidades não Negativas. O ataque exige 1 Ação extra. O ataque não pode já exigir 2 ou mais Ações para adquirir esta Qualidade.",
    "description": "Assinatura Complexa torna o Movimento Assinatura mais poderoso em construção, mas mais lento de executar."
  },
  {
    "id": "bateriaDefeituosa",
    "name": "Bateria Defeituosa",
    "originalName": "Faulty Battery",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfTurn",
      "chatMessage": "Se começar o turno com 3 Bateria, perca toda a Bateria e Caixas de Ferimento iguais a SV + 3."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Se o Digimon começa seu turno com 3 Bateria, perde toda sua Bateria atual e Caixas de Ferimento iguais a SV + 3. Isso não aumenta Resolve.",
    "description": "Bateria Defeituosa torna perigoso acumular Bateria demais."
  },
  {
    "id": "vulneravel",
    "name": "Vulnerável",
    "originalName": "Vulnerable",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": false
    },
    "requirements": {
      "text": "O Digimon não pode adquirir Ranks nesta Qualidade se sua Resistência já for 0.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Resistência Focada, Imunidade"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resistancePenaltyPerRank": -1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "A Resistência do Digimon é reduzida pelos Ranks nesta Qualidade. Se um Efeito seria encerrado prematuramente contra o Digimon, como por uma Ordem Especial Aguente Firme! ou outro Digimon usando [CLEANSE], o Digimon perde Caixas de Ferimento iguais ao custo em PD do Efeito. Isso não aumenta Resolve. O Digimon não pode adquirir Ranks nesta Qualidade se sua Resistência já for 0.",
    "description": "Vulnerável torna o Digimon mais suscetível a Efeitos e pune remoções prematuras deles."
  },
  {
    "id": "perfuracaoDesastrada",
    "name": "Perfuração Desastrada",
    "originalName": "Fumbled Piercing",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Perfuração de Armadura. Só pode ter tantos Ranks nesta Qualidade quanto possuir em Golpe Certeiro, conforme o texto original.",
      "qualityNames": "Perfuração de Armadura"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "attackWithPiercing",
      "label": "Ataque [PIERCING] que recebe [FUMBLE]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "fumble"
      ],
      "appliesTo": "attackWithPiercing",
      "additionalTargetDodgeSuccessesForPiercingFormula": "ranks * 2",
      "equalAccuracyAndDodgeCountsAsMiss": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha o uso da Tag [FUMBLE] e precisa aplicá-la ao ataque com a Tag [PIERCING]. O alvo atingido por um ataque [FUMBLE] é tratado como se tivesse Sucessos de Esquiva adicionais iguais ao dobro dos Ranks nesta Qualidade para calcular o Dano Inalterável de Perfuração de Armadura. Além disso, o ataque é tratado como erro se tiver apenas a mesma quantidade de Sucessos de Precisão que os Sucessos de Esquiva do alvo.",
    "description": "Perfuração Desastrada torna ataques perfurantes menos confiáveis e mais fáceis de mitigar."
  },
  {
    "id": "golpeEnfraquecido",
    "name": "Golpe Enfraquecido",
    "originalName": "Weakened Strike",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Golpe Certeiro. Não pode ser aplicada a um ataque com a Tag [SUPPORT].",
      "qualityNames": "Golpe Certeiro"
    },
    "incompatible": {
      "text": "Não pode ser aplicada a ataque [SUPPORT].",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "attackWithCertain",
      "label": "Ataque [CERTAIN] que recebe [FRAGILE]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "fragile"
      ],
      "appliesTo": "attackWithCertain",
      "cannotApplyToSupportAttack": true,
      "damagePenaltyFormula": "ranks",
      "effectPotencyPenaltyFormula": "ranks",
      "effectDurationPenaltyFormula": "ranks",
      "minimumEffectPotencyAndDuration": 0
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon ganha o uso da Tag [FRAGILE] e precisa aplicá-la ao ataque com a Tag [CERTAIN]. Só pode ter tantos Ranks nesta Qualidade quanto possui em Golpe Certeiro. Isso não pode ser aplicado a um ataque com a Tag [SUPPORT]. Um ataque [FRAGILE] sofre penalidade em Dano, Potência de Efeito e Duração igual aos Ranks nesta Qualidade, até o mínimo de 0.",
    "description": "Golpe Enfraquecido torna ataques certeiros menos impactantes."
  },
  {
    "id": "miraIndiscriminada",
    "name": "Mira Indiscriminada",
    "originalName": "Indiscriminate Targetting",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Área de Ataque.",
      "qualityNames": "Área de Ataque"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Zonista"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "areaAttacksTargetAllPotentialTargetsExceptAttacker": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "As Áreas de Ataque do Digimon não conseguem mais distinguir aliados de inimigos, mirando todos os alvos potenciais dentro da área exceto o atacante.",
    "description": "Mira Indiscriminada torna Áreas de Ataque perigosas para aliados."
  },
  {
    "id": "decepcionante",
    "name": "Decepcionante",
    "originalName": "Underwhelming",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Poder Brutal.",
      "qualityNames": "Poder Brutal"
    },
    "incompatible": {
      "text": "Poder Brutal não pode mais ser usado em um ataque com a Tag [CERTAIN].",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [],
      "hugePowerFinalAccuracySuccessPenaltyFormula": "ranks",
      "hugePowerCannotBeUsedOnCertainAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Sempre que Poder Brutal for usado, o Digimon precisa reduzir os Sucessos finais de Precisão em 1 para cada Rank nesta Qualidade. O Digimon só pode ter tantos Ranks em Decepcionante quanto possuir em Poder Brutal. Poder Brutal não pode mais ser usado em um ataque com a Tag [CERTAIN].",
    "description": "Decepcionante reduz a consistência ofensiva de Poder Brutal."
  },
  {
    "id": "flancoAberto",
    "name": "Flanco Aberto",
    "originalName": "Broadside",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Esquiva.",
      "qualityNames": "Esquiva"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "avoidanceFinalDodgeSuccessPenaltyFormula": "ranks"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Sempre que Esquiva for usada, o Digimon precisa reduzir os Sucessos finais de Esquiva em 1 para cada Rank nesta Qualidade. O Digimon só pode ter tantos Ranks em Flanco Aberto quanto possui em Esquiva.",
    "description": "Flanco Aberto enfraquece a eficiência da Qualidade Esquiva."
  },
  {
    "id": "doenca",
    "name": "Doença",
    "originalName": "Illness",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Energia Vital.",
      "qualityNames": "Energia Vital"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "vitalEnergyFinalHealthSuccessPenaltyFormula": "ranks"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Sempre que Energia Vital for usada, o Digimon precisa reduzir os Sucessos finais de Saúde em 1 para cada Rank nesta Qualidade. O Digimon só pode ter tantos Ranks em Doença quanto possui em Energia Vital.",
    "description": "Doença limita a eficácia de Energia Vital."
  },
  {
    "id": "erroDeSistema",
    "name": "Erro de Sistema",
    "originalName": "System Error",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Impulso de Sistema.",
      "qualityNames": "Impulso de Sistema"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "derivedStatPerRank",
      "label": "Estatística Derivada reduzida",
      "cannotChooseStatsAffectedBySystemBoost": true,
      "options": [
        "ram",
        "cpu",
        "bit",
        "dos"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "chosenDerivedStatPenaltyPerRank": -1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Para cada Rank nesta Qualidade, o Digimon reduz uma de suas Estatísticas Derivadas em 1. Só pode reduzir uma Estatística Derivada que não seja afetada por Impulso de Sistema. O Digimon só pode ter tantos Ranks em Erro de Sistema quanto possui em Impulso de Sistema.",
    "description": "Erro de Sistema compensa Impulso de Sistema com uma falha em outra Estatística Derivada."
  },
  {
    "id": "fraquezaNatural",
    "name": "Fraqueza Natural",
    "originalName": "Natural Weakness",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "requirements": {
      "text": "Requer 1 ou mais Ranks de Passo Natural.",
      "qualityNames": "Passo Natural"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Miríade Elemental"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "twoElementsPerRank",
      "label": "Elementos de Fraqueza Natural",
      "cannotChooseNaturewalkElements": true,
      "options": [
        "Fogo",
        "Água",
        "Vento",
        "Terra",
        "Gelo",
        "Flora",
        "Aço",
        "Trovão",
        "Trevas",
        "Luz"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "elementalForceDamageBonusDoubledAgainstChosenElements": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O Digimon precisa escolher 2 Elementos de Passo Natural para cada Rank nesta Qualidade que ainda não tenha escolhido com Passo Natural. Sempre que for atingido por um ataque de Força Elemental composto por qualquer um desses Elementos escolhidos, o bônus de Dano de Força Elemental é dobrado contra ele. O Digimon só pode ter tantos Ranks em Fraqueza Natural quanto possui em Passo Natural.",
    "description": "Fraqueza Natural cria vulnerabilidades elementais específicas."
  },
  {
    "id": "programaExploravel",
    "name": "Programa Explorável",
    "originalName": "Exploitable Program",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "enemyTnUsingThisDigimonDerivedStatPenalty": -3
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "O NA para qualquer inimigo que exija uma Estatística Derivada do Digimon, como Golpe Poderoso ou Substituir, é reduzido em 3.",
    "description": "Programa Explorável torna o código do Digimon mais fácil de explorar por efeitos inimigos."
  },
  {
    "id": "pontoDeEbulicao",
    "name": "Ponto de Ebulição",
    "originalName": "Boiling Point",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Qualidade Negativa"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requer Monstro de Combate.",
      "qualityNames": "Monstro de Combate"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfTurn",
      "chatMessage": "Se começar o turno com Resolve máximo, faça um Teste CPU (Resistência)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "cpu",
      "skill": "endurance",
      "tnFormula": "15 - dos"
    },
    "result": {
      "criticalFailure": "Mesmo efeito de falha, mas o Digimon perde Caixas de Ferimento iguais ao Resolve atual em vez de metade.",
      "failure": "O Digimon perde Caixas de Ferimento iguais à metade do Resolve atual e então perde todo o Resolve.",
      "success": "O NA desta Qualidade aumenta pelo Resolve máximo do Digimon até o fim do combate.",
      "criticalSuccess": "Mesmo efeito de sucesso, mas o NA aumenta apenas pela metade do Resolve máximo do Digimon."
    },
    "effect": "Quando o Digimon começa seu turno com Resolve máximo, precisa fazer um Teste CPU (Resistência). O NA é igual a 15 - DOS. Em falha, perde Caixas de Ferimento iguais à metade do Resolve atual e então perde todo o Resolve. Em falha crítica, perde Caixas de Ferimento iguais ao Resolve atual em vez de metade. Em sucesso, o NA desta Qualidade aumenta pelo Resolve máximo do Digimon até o fim do combate. Em sucesso crítico, o NA aumenta apenas pela metade do Resolve máximo.",
    "description": "Ponto de Ebulição torna perigoso acumular Resolve demais, forçando o Digimon a controlar sua fúria."
  },
  {
    "id": "poderBurst",
    "name": "Poder Burst",
    "originalName": "Burst Power",
    "section": "Optional Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Normalmente concedida no Estágio 4 ou superior, a critério do Narrador.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Bônus Burst",
      "options": [
        {
          "key": "theFutureIsNow",
          "label": "The Future is Now",
          "attribute": "agility",
          "tags": ["S", "T"],
          "effect": "Ao receber este bônus, o Digimon pode comprar um segundo Rank de Armamento de Digizóide. Não é possível escolher o mesmo Armamento de Digizóide duas vezes."
        },
        {
          "key": "boilingPower",
          "label": "Boiling Power",
          "attribute": "agility",
          "tags": ["T", "A"],
          "effect": "Se o Digimon possuir Ataque de Investida, para cada espaço movido, pode adicionar 1 ponto de Dano até o limite da Agilidade do Tamer."
        },
        {
          "key": "oneVision",
          "label": "One Vision",
          "attribute": "body",
          "tags": ["T"],
          "effect": "O Digimon recebe uma instância de Refletir como Declaração de Interceder. Quando sofreria um ataque que cause metade ou mais de seu total de Caixas de Ferimento, pode refletir metade do dano sofrido."
        },
        {
          "key": "theBiggestDreamer",
          "label": "The Biggest Dreamer",
          "attribute": "body",
          "tags": ["S"],
          "effect": "Ao receber este bônus, o Digimon pode comprar um segundo Rank de Armadura de Digizóide. Não é possível escolher a mesma Armadura de Digizóide duas vezes."
        },
        {
          "key": "butterFlyEffect",
          "label": "Butter-Fly Effect",
          "attribute": "charisma",
          "tags": ["T"],
          "effect": "O Digimon pode resetar uma quantidade de turnos consecutivos na iniciativa igual ao número de rodadas restantes de seu Burst Mode. As rodadas usadas são consumidas."
        },
        {
          "key": "beMyLight",
          "label": "Be My Light",
          "attribute": "charisma",
          "tags": ["T"],
          "effect": "Escolha um aliado. Efeitos [P] concedidos pelo Digimon a esse aliado passam a afetá-lo com Potência BIT x2, duram apenas uma rodada, não precisam ser rolados e não podem ser reaplicados ao mesmo aliado."
        },
        {
          "key": "warGame",
          "label": "War Game",
          "attribute": "intelligence",
          "tags": ["T", "A"],
          "effect": "Escolha um Ataque de Área do Digimon. Durante Burst Mode, esse Ataque de Área conta como tendo Alcance x2 e deve ser usado como Ação Complexa."
        },
        {
          "key": "beatHit",
          "label": "Beat Hit",
          "attribute": "intelligence",
          "tags": ["T", "A"],
          "effect": "O Digimon ganha o uso de outra Tag [Movimento Assinatura], que pode aplicar a outro ataque."
        },
        {
          "key": "endlessTale",
          "label": "Endless Tale",
          "attribute": "willpower",
          "tags": ["T"],
          "effect": "Se o Digimon seria reduzido a 0 Caixas de Ferimento, ele sai de Burst Mode com 10 Caixas de Ferimento restantes. Se possuir Segundo Fôlego, pode fazer um Teste de Recuperação como Ação Livre quando Burst Power termina."
        },
        {
          "key": "thoseWhoInheritCourage",
          "label": "Those Who Inherit Courage",
          "attribute": "willpower",
          "tags": ["T"],
          "effect": "Se o Digimon seria reduzido a 0 Caixas de Ferimento, todos os aliados restantes recuperam 5 Caixas de Ferimento e recebem bônus de Dano e Armadura igual ao CPU do Digimon. O Digimon fica fora da batalha e não pode retornar por Revitalizar."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "specialEvolution": {
        "method": "burst",
        "durationTurns": 3,
        "requiresTamerBraveryCheck": true,
        "tnByCampaignLevel": {
          "classic": 18,
          "standard": 20,
          "extreme": 22
        },
        "bonusesByTamerAttribute": {
          "agility": {
            "accuracy": 5,
            "damage": 5,
            "movement": 5
          },
          "body": {
            "accuracy": 5,
            "armor": 5,
            "tempWounds": 5
          },
          "charisma": {
            "accuracy": 5,
            "dodge": 5
          },
          "intelligence": {
            "damage": 5,
            "dodge": 5,
            "range": 5
          },
          "willpower": {
            "damage": 5,
            "armor": 5
          }
        }
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "specialEvolution",
      "chatMessage": "Declare Burst Power para ativar uma rota Burst Mode por 3 turnos após um Teste de Bravura do Tamer."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Esta Qualidade permite que o Digimon ative uma rota Burst Mode no Evolution Planner. Quando Burst Power é declarado, o Tamer faz um Teste de Bravura contra NA 18, 20 ou 22 para campanhas Classic, Standard ou Extreme. Em sucesso, o Digimon entra em Burst Mode por 3 turnos. O bônus numérico depende do maior Atributo do Tamer: Agilidade concede +5 Acerto, +5 Dano e +5 Movimento; Corpo concede +5 Armadura, +5 Acerto e +5 Caixas de Ferimento temporárias; Carisma concede +5 Acerto e +5 Esquiva; Inteligência concede +5 Esquiva, +5 Dano e +5 Alcance; Vontade concede +5 Dano e +5 Armadura. O Digimon também escolhe um bônus especial associado ao Atributo dominante.",
    "description": "Burst Power é uma Qualidade opcional de fim de campanha. Ela representa uma reserva extrema de poder do Digicore ou uma manifestação do vínculo entre Digimon e Tamer, funcionando como um Mode Change especial e temporário.",
    "tier": "perfect",
    "originalTier": "Optional Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Qualidade Opcional"
    }
  }
,
  {
    "id": "brace",
    "name": "Brace",
    "originalName": "Brace",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": { "minimumStage": "adult", "label": "Qualidade de Adulto" },
    "section": "Defensive Qualities",
    "category": { "core": false, "attack": false, "trigger": true, "static": false, "free": false, "negative": false },
    "cost": { "dp": 2, "perRank": false, "coreDiscountAvailable": false, "countsAgainstFreeLimit": false, "grantsDp": false },
    "rank": { "value": 1, "max": 1, "limited": false },
    "stageRequirement": { "enabled": true, "minimum": "adult", "maximum": "" },
    "requirements": { "text": "Requer Adulto.", "qualityNames": "" },
    "incompatible": { "text": "", "qualityNames": "" },
    "requiredFor": [],
    "choices": { "required": false, "type": "", "options": [] },
    "activation": { "enabled": true, "active": false, "mode": "instant", "chatMessage": "Quando sofrer dano de um ataque, use uma Interrupção e role CPU (Resistência) para reduzir o dano." },
    "uses": { "enabled": true, "value": 1, "max": 1, "recharge": "combat" },
    "trigger": { "actionCost": "interrupt", "frequency": "combat", "check": { "enabled": true, "stat": "cpu", "skill": "endurance", "tnFormula": "10 + damageAfterArmor" } },
    "grants": { "brace": true },
    "effect": "Quando o Digimon sofre Dano de um Ataque, pode usar uma Interrupção para fazer um Teste CPU (Resistência), NA 10 + dano depois da Armadura. Sucesso reduz o dano pela metade depois da Armadura; Sucesso Crítico pode reduzir a 0 se ficaria 1; Falha Crítica aumenta o dano em 1. Usos posteriores aumentam o NA em 3 até o fim do combate.",
    "description": "Brace permite reduzir dano recebido com um teste de resistência."
  },
  {
    "id": "selvageria",
    "name": "Selvageria",
    "originalName": "Savagery",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": { "minimumStage": "adult", "label": "Qualidade de Adulto" },
    "section": "Defensive Qualities",
    "category": { "core": false, "attack": false, "trigger": true, "static": false, "free": false, "negative": false },
    "cost": { "dp": 1, "perRank": false, "coreDiscountAvailable": false, "countsAgainstFreeLimit": false, "grantsDp": false },
    "rank": { "value": 1, "max": 1, "limited": false },
    "stageRequirement": { "enabled": true, "minimum": "adult", "maximum": "" },
    "requirements": { "text": "Requer Adulto e Monstro de Combate.", "qualityNames": "Monstro de Combate" },
    "incompatible": { "text": "", "qualityNames": "" },
    "requiredFor": [],
    "activation": { "enabled": true, "active": false, "mode": "instant", "chatMessage": "Uma vez por rodada ao declarar um ataque, role CPU (Resistência). Em falha, sofre Dano Inalterável igual à metade do Resolve máximo; em sucesso, também ganha Ferimentos Temporários." },
    "trigger": { "actionCost": "0", "frequency": "round", "check": { "enabled": true, "stat": "cpu", "skill": "endurance", "tnFormula": "15 - dos" } },
    "grants": { "savagery": true },
    "effect": "Uma vez por rodada, ao declarar um Ataque, o Digimon pode acionar Selvageria e fazer um Teste CPU (Resistência), NA 15 - DOS. Em falha sofre Dano Inalterável igual à metade do Resolve máximo, que conta para Resolve; em sucesso também ganha Ferimentos Temporários iguais ao dano tomado; em Sucesso Crítico ganha o dobro de Ferimentos Temporários.",
    "description": "Selvageria converte dor em proteção temporária para usuários de Monstro de Combate."
  },
  {
    "id": "destruicaoGarantida",
    "name": "Destruição Garantida",
    "originalName": "Assured Destruction",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": { "minimumStage": "adult", "label": "Qualidade de Adulto" },
    "section": "Defensive Qualities",
    "category": { "core": false, "attack": false, "trigger": true, "static": false, "free": false, "negative": false },
    "cost": { "dp": 1, "perRank": false, "coreDiscountAvailable": false, "countsAgainstFreeLimit": false, "grantsDp": false },
    "rank": { "value": 1, "max": 1, "limited": false },
    "stageRequirement": { "enabled": true, "minimum": "adult", "maximum": "" },
    "requirements": { "text": "Requer Adulto e Monstro de Combate.", "qualityNames": "Monstro de Combate" },
    "incompatible": { "text": "", "qualityNames": "" },
    "requiredFor": [],
    "activation": { "enabled": true, "active": false, "mode": "instant", "chatMessage": "Ao atacar, converta qualquer quantidade de Resolve em dados adicionais na Pool de Precisão em vez de dano." },
    "grants": { "assuredDestruction": true },
    "effect": "Ao fazer um Ataque contra um inimigo, o Digimon pode converter qualquer quantidade de Resolve em dados adicionais na Pool de Precisão em vez de dano. Esse bônus vale apenas para esse Ataque.",
    "description": "Destruição Garantida permite transformar Resolve em precisão."
  }

];

const DDA_DIGIMON_QUALITIES_EN = [
  {
    "id": "otimizacaoDeDados",
    "name": "Data Optimization",
    "originalName": "Data Optimization",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Data Specialization",
      "Hybrid Drive"
    ],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Optimization",
      "options": [
        {
          "key": "closeCombat",
          "label": "Close Combat",
          "originalLabel": "Close Combat",
          "effect": "The Digimon gains +1 to Accuracy when using a [MELEE] Attack.\nThis bonus increases to +3 if the Target is missing Wound Boxes."
        },
        {
          "key": "rangedStriker",
          "label": "Ranged Striker",
          "originalLabel": "Ranged Striker",
          "effect": "The Digimon gains a +1 to Accuracy when using a [RANGE] Attack.\nThe Digimon gains +2 to its Range and Effective Limit."
        },
        {
          "key": "warden",
          "label": "Warden",
          "originalLabel": "Warden",
          "effect": "The Digimon gains a +1 bonus to Armor.\nThe Digimon can take an Interrupt Action spending 1 less Action (potentially a Free Action) once per Combat."
        },
        {
          "key": "brawler",
          "label": "Brawler",
          "originalLabel": "Brawler",
          "effect": "The Digimon gains a +1 bonus to Clash Checks and all other Checks made during Clashes.\nThe Digimon gains a +1 bonus to Damage when Attacking a Digimon it’s Clashing with."
        },
        {
          "key": "speedster",
          "label": "Speedster",
          "originalLabel": "Speedster",
          "effect": "The Digimon gains a +1 bonus to its Movement.\nThe Digimon ignores the first penalty to its Dodge from being Attacked after its turn."
        },
        {
          "key": "effectWarrior",
          "label": "Effect Warrior",
          "originalLabel": "Effect Warrior",
          "effect": "The Digimon gains +1 Potency to all Attack Effect Tags that use a Derived Stat from the Caster."
        },
        {
          "key": "variable",
          "label": "Variable",
          "originalLabel": "Variable",
          "effect": "The Digimon can reroll a Check or Pool Check it has made once per Round (which resets at the end of the Digimon’s turns) during Combat. It must take the new result."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Data Optimizations will help gear your Digimon for a specific role. When you take this Quality, choose one of the options below. You may only take this quality once.\n\nClose Combat \tThe Digimon gains +1 to Accuracy when using a [MELEE] Attack.\nThis bonus increases to +3 if the Target is missing Wound Boxes.\nRanged Striker \tThe Digimon gains a +1 to Accuracy when using a [RANGE] Attack.\nThe Digimon gains +2 to its Range and Effective Limit.\nWarden\tThe Digimon gains a +1 bonus to Armor.\nThe Digimon can take an Interrupt Action spending 1 less Action (potentially a Free Action) once per Combat.\nBrawler \tThe Digimon gains a +1 bonus to Clash Checks and all other Checks made during Clashes.\nThe Digimon gains a +1 bonus to Damage when Attacking a Digimon it’s Clashing with.\nSpeedster\tThe Digimon gains a +1 bonus to its Movement.\nThe Digimon ignores the first penalty to its Dodge from being Attacked after its turn.\nEffect Warrior \tThe Digimon gains +1 Potency to all Attack Effect Tags that use a Derived Stat from the Caster.\nVariable\tThe Digimon can reroll a Check or Pool Check it has made once per Round (which resets at the end of the Digimon’s turns) during Combat. It must take the new result.",
    "description": "Data Optimizations will help gear your Digimon for a specific role. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "passoNatural",
    "name": "Naturewalk",
    "originalName": "Naturewalk",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Element Master",
      "Elemental Force",
      "Illusionary Overlay"
    ],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Element",
      "cannotRepeat": true,
      "options": [
        {
          "key": "fire",
          "label": "Fire",
          "originalLabel": "Fire",
          "recommendedFor": "Dragon’s Roar, Unknown",
          "terrain": "Deserts, volcanic areas, dunes, crags, and regions with extreme conditions.",
          "effect": "Recommended for Dragon’s Roar and Unknown. This Element is representative of Deserts, Volcanic Areas, Dunes, Crags, or other areas with extreme conditions. \tThe Digimon reduces the Damage taken from [BURN] by 1."
        },
        {
          "key": "water",
          "label": "Water",
          "originalLabel": "Water",
          "recommendedFor": "Deep Savers",
          "terrain": "Oceans, rivers, lakes, and other aquatic terrain.",
          "effect": "Recommended for Deep Savers. This Element is representative of water-based terrains, such as Oceans, Rivers, and Lakes. \tThe Digimon reduces the Damage taken from [FREEZE] by 1"
        },
        {
          "key": "wind",
          "label": "Wind",
          "originalLabel": "Wind",
          "recommendedFor": "Wind Guardians",
          "terrain": "Mountainous regions, open skies, windy areas, and plateaus.",
          "effect": "Recommended for Wind Guardians. This Element is representative of the Mountainous Regions, open skies, windy areas, and Plateaus. \tThe Digimon reduces any Crash Damage it takes by 1."
        },
        {
          "key": "earth",
          "label": "Earth",
          "originalLabel": "Earth",
          "recommendedFor": "Nature Spirits, Jungle Troopers",
          "terrain": "Caves, deserts, savannahs, cliffs, canyons, and valleys.",
          "effect": "Recommended for Nature Spirits and Jungle Troopers. This element is representative of Caves, Deserts, Savannahs, Cliffs, Canyons, Valley-like biomes. \tThe Digimon reduces the Damage taken from [POISON] by 1."
        },
        {
          "key": "ice",
          "label": "Ice",
          "originalLabel": "Ice",
          "recommendedFor": "Deep Savers, Nightmare Soldiers",
          "terrain": "Icy mountains, glaciers, and tundra.",
          "effect": "Recommended for Digimon that fall under Deep Savers or Nightmare Soldiers. Icy Mountains, Glaciers, Tundra, embody this type of Terrain. \tThe Digimon reduces the Damage taken from [FREEZE] by 1."
        },
        {
          "key": "wood",
          "label": "Wood",
          "originalLabel": "Wood",
          "recommendedFor": "Nature Spirits, Jungle Troopers",
          "terrain": "Forests, jungles, swamps, and marshes.",
          "effect": "Recommended for Nature Spirits and Jungle Troopers. Forests, Jungles, Swamps, and Marshes are some examples of these terrains. \tThe Digimon reduces the Damage taken from [POISON] by 1."
        },
        {
          "key": "steel",
          "label": "Steel",
          "originalLabel": "Steel",
          "recommendedFor": "Metal Empire, Unknown",
          "terrain": "Civilization, factories, industrial ruins, and densely urbanized areas.",
          "effect": "Recommended for Metal Empire and Unknown. Steel denotes Civilization, Factories, and the like-- whether it lies in ruins or is greatly condensed. \tThe Digimon reduces the Damage taken from [BURN] by 1."
        },
        {
          "key": "thunder",
          "label": "Thunder",
          "originalLabel": "Thunder",
          "recommendedFor": "Virus Busters, Metal Empire",
          "terrain": "Electrically charged areas, hazardous factories, and regions prone to lightning strikes.",
          "effect": "Recommended for Virus Busters and Metal Empire. This covers electrically-charged areas, hazardous factories, and areas that are prone to lightning strikes. \tThe Digimon reduces any Crash Damage it takes by 1."
        },
        {
          "key": "darkness",
          "label": "Darkness",
          "originalLabel": "Darkness",
          "recommendedFor": "Unknown, Dark Area, Nightmare Soldiers",
          "terrain": "Dark, dim, or eerie areas.",
          "effect": "Recommended for Unknown, Dark Area, and Nightmare Soldiers. This covers areas that are dim, or potentially Halloween-like. Think of the Overdell Cemetery from Digimon World 1!\tThe Digimon can see through dark or dimly-lit areas unimpeded, and gains a +1 bonus to Awareness Checks."
        },
        {
          "key": "light",
          "label": "Light",
          "originalLabel": "Light",
          "recommendedFor": "Virus Busters, Wind Guardians",
          "terrain": "Holy ground, angelic regions, or areas that reject impure beings.",
          "effect": "Recommended for Virus Busters and Wind Guardians. This covers holy grounds or angelic areas, where the impure would not be able to tread. If you’re familiar with Digimon World 1, think of the Ice Sanctuary area that prohibits Data and Virus-type Digimon from entering.\tThe Digimon can see through dark or dimly-lit areas unimpeded, and gains a +1 bonus to Awareness Checks."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon is at home on a certain type of Terrain, or within a certain element. For each Rank the Digimon takes in this Quality, choose an Element. The Digimon gains +1 to a Core Stat of its choice, and a special Damage reduction associated with its choice (see below). If the Digimon purchases multiple Ranks of this Quality, it cannot choose the same Element twice.\nIn addition, the Digimon does not suffer Movement penalties from Difficult Terrain of its chosen Element. They may still not be able to pass certain types of Terrain, as ruled by the GM, if it is particularly harsh (for example, having Naturewalk: Fire alone would not allow the Digimon to walk across or swim in molten lava). However, effects usually considered as a penalty for an associated environment, such as sweltering heat or strong gales are lessened or even ignored by a Digimon with the appropriate Element, as ruled by the GM.\nFinally, having a Naturewalk makes the Digimon resistant to Elemental Force Attacks. The Digimon does not suffer any bonus Damage from Attacks from the same Tag as your Naturewalks.\nElements\nFire\tRecommended for Dragon’s Roar and Unknown. This Element is representative of Deserts, Volcanic Areas, Dunes, Crags, or other areas with extreme conditions. \tThe Digimon reduces the Damage taken from [BURN] by 1.\nWater\tRecommended for Deep Savers. This Element is representative of water-based terrains, such as Oceans, Rivers, and Lakes. \tThe Digimon reduces the Damage taken from [FREEZE] by 1\nWind\tRecommended for Wind Guardians. This Element is representative of the Mountainous Regions, open skies, windy areas, and Plateaus. \tThe Digimon reduces any Crash Damage it takes by 1.\nEarth\tRecommended for Nature Spirits and Jungle Troopers. This element is representative of Caves, Deserts, Savannahs, Cliffs, Canyons, Valley-like biomes. \tThe Digimon reduces the Damage taken from [POISON] by 1.\nIce\tRecommended for Digimon that fall under Deep Savers or Nightmare Soldiers. Icy Mountains, Glaciers, Tundra, embody this type of Terrain. \tThe Digimon reduces the Damage taken from [FREEZE] by 1.\nWood\tRecommended for Nature Spirits and Jungle Troopers. Forests, Jungles, Swamps, and Marshes are some examples of these terrains. \tThe Digimon reduces the Damage taken from [POISON] by 1.\nSteel\tRecommended for Metal Empire and Unknown. Steel denotes Civilization, Factories, and the like-- whether it lies in ruins or is greatly condensed. \tThe Digimon reduces the Damage taken from [BURN] by 1.\nThunder\tRecommended for Virus Busters and Metal Empire. This covers electrically-charged areas, hazardous factories, and areas that are prone to lightning strikes. \tThe Digimon reduces any Crash Damage it takes by 1.\nDarkness\tRecommended for Unknown, Dark Area, and Nightmare Soldiers. This covers areas that are dim, or potentially Halloween-like. Think of the Overdell Cemetery from Digimon World 1!\tThe Digimon can see through dark or dimly-lit areas unimpeded, and gains a +1 bonus to Awareness Checks.\nLight\tRecommended for Virus Busters and Wind Guardians. This covers holy grounds or angelic areas, where the impure would not be able to tread. If you’re familiar with Digimon World 1, think of the Ice Sanctuary area that prohibits Data and Virus-type Digimon from entering.\tThe Digimon can see through dark or dimly-lit areas unimpeded, and gains a +1 bonus to Awareness Checks.",
    "description": "The Digimon is at home on a certain type of Terrain, or within a certain element. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "instinto",
    "name": "Instinct",
    "originalName": "Instinct",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Weapon"
    },
    "requiredFor": [
      "Força Crescente",
      "Anticipate Assault"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "derivedStats": {
        "dodgePerRank": 1,
        "healthPerRank": 1,
        "movementPerRank": 1
      }
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon gains a bonus to its Dodge, Health and Movement equal to the Ranks in this Quality.\nThe number of ranks a Digimon can take is based on its Stage (see table).\n\nWEAPON/INSTINCT\nStage\t# of Ranks\tBonus\tQuality Access\nIn-Training\t0\t0\t—\nRookie\t1\t+1\t—\nChampion\t2\t+2\t—\nUltimate\t3\t+3\tOverwrite\nChrome\nMega (and beyond)\t3\t+3\tAny Gain Force\nAny Digizoid",
    "description": "The Digimon gains a bonus to its Dodge, Health and Movement equal to the Ranks in this Quality. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "arma",
    "name": "Weapon",
    "originalName": "Weapon",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Instinct"
    },
    "requiredFor": [
      "Weaponmento de Digizóide",
      "Martial Strikes"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "weapon"
      ]
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon gains [WEAPON] Tag(s) for each Rank, which it can apply to Attack(s) that do not already have it. [WEAPON] Attacks gain a bonus to Accuracy and Damage equal to the Ranks in this Quality. The Attacks also gain an additional benefit depending on whether or not they are [MELEE] or [RANGE].\n●\t[RANGE]: The Attack has the same bonus to Range and Effective Limit.\n●\t[MELEE]: A number of 4s rolled on the Attack, equal to the Ranks in this Quality, can be counted as Successes. [DAMAGE] Attacks gain +1 Damage.\nThe number of ranks a Digimon can take is based on its Stage (see table).",
    "description": "The Digimon gains [WEAPON] Tag(s) for each Rank, which it can apply to Attack(s) that do not already have it. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "movimentoExtra",
    "name": "Extra Movement",
    "originalName": "Extra Movement",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 5,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Advanced Mobility"
    ],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Movement Type",
      "cannotRepeat": true,
      "options": [
        {
          "key": "flight",
          "label": "Flight",
          "originalLabel": "Flight",
          "effect": "The Digimon suffers -1 Movement.\n\nThe Digimon is also capable of flying through the air. The Digimon loses this Extra Movement while it is at half its Maximum Wound Boxes or fewer."
        },
        {
          "key": "digger",
          "label": "Digger",
          "originalLabel": "Digger",
          "effect": "The Digimon is capable of burrowing through the ground equal to its Movement, so long as it’s as soft as dirt. Snow or sand are other alternatives. While underground, it does not treat any creatures within half its range as obscured long as they are touching the same ground. It also does not treat any underground Digimon as obscured if it is above ground."
        },
        {
          "key": "swimmer",
          "label": "Swimmer",
          "originalLabel": "Swimmer",
          "effect": "The Digimon’s swimming Movement now uses the Digimon’s full Movement. It does not treat any Digimon as obscured due to the surface of water, regardless of whether the Digimon itself is underwater or not.\nIt can now Hold its Breath an unlimited amount of times per Combat."
        },
        {
          "key": "wallclimber",
          "label": "Wallclimber",
          "originalLabel": "Wallclimber",
          "effect": "The Digimon is capable of scaling vertical surfaces equal to its Movement, but not on ceilings."
        },
        {
          "key": "jumper",
          "label": "Jumper",
          "originalLabel": "Jumper",
          "effect": "The Digimon’s Jump height and length now uses the Digimon’s full Movement."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1 Rank of ADVANCED MOBILITY\nCore Discount Available\nEvery time you take a Rank of Extra Movement, choose one of the following movement types below. A new Movement Type allows the Digimon to move in a new type of terrain at a rate equal to their Movement score (after Accelerate). If the Digimon purchases multiple Ranks of this Quality, it cannot choose the same Movement twice.\n\nFlight \tThe Digimon suffers -1 Movement.\n\nThe Digimon is also capable of flying through the air. The Digimon loses this Extra Movement while it is at half its Maximum Wound Boxes or fewer.\nDigger \tThe Digimon is capable of burrowing through the ground equal to its Movement, so long as it’s as soft as dirt. Snow or sand are other alternatives. While underground, it does not treat any creatures within half its range as obscured long as they are touching the same ground. It also does not treat any underground Digimon as obscured if it is above ground.\nSwimmer\tThe Digimon’s swimming Movement now uses the Digimon’s full Movement. It does not treat any Digimon as obscured due to the surface of water, regardless of whether the Digimon itself is underwater or not.\nIt can now Hold its Breath an unlimited amount of times per Combat.\nWallclimber\tThe Digimon is capable of scaling vertical surfaces equal to its Movement, but not on ceilings.\nJumper\tThe Digimon’s Jump height and length now uses the Digimon’s full Movement.",
    "description": "1 Rank of ADVANCED MOBILITY Core Discount Available Every time you take a Rank of Extra Movement, choose one of the following movement types below. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "acelerar",
    "name": "Accelerate",
    "originalName": "Accelerate",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": true
    },
    "rankLimit": {
      "type": "derivedStat",
      "stat": "ram"
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "O maximum de Ranks em Accelerate é equal to the RAM do Digimon.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "miscStats": {
        "movementPerRank": 1
      }
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "For each Rank you take in this Quality, the Digimon gains +1 Movement. The maximum Ranks that can take in Accelerate is equal to the Digimon’s RAM.\n\nPRODIGIOUS SKILL\nStage\t# of Ranks\nIn-Training\t0\nRookie\t1\nChampion\t2\nUltimate\t3\nMega (and beyond)\t4",
    "description": "For each Rank you take in this Quality, the Digimon gains +1 Movement. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "periciaProdigiosa",
    "name": "Prodigious Skill",
    "originalName": "Prodigious Skill",
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 4,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 4,
        "ultimatePlus": 4
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Skill",
      "options": [
        {
          "key": "athletics",
          "label": "Athletics",
          "derivedStat": "cpu"
        },
        {
          "key": "endurance",
          "label": "Endurance",
          "derivedStat": "cpu"
        },
        {
          "key": "featsOfStrength",
          "label": "Feats of Strength",
          "derivedStat": "cpu",
          "effect": ","
        },
        {
          "key": "evade",
          "label": "Evasion",
          "derivedStat": "ram",
          "effect": ") Check. The Digimon can either use its RAM stat, or RAM + 3 if it purchased this Quality for Evasion for the Check.\nThe maximum Ranks a Digimon can take in this Quality is based on it’s Stage (see below).\n\n \n4.02 - Offensive Qualities\n________________________________________"
        },
        {
          "key": "precision",
          "label": "Precision",
          "derivedStat": "ram"
        },
        {
          "key": "stealth",
          "label": "Stealth",
          "derivedStat": "ram",
          "effect": ","
        },
        {
          "key": "knowledge",
          "label": "Knowledge",
          "derivedStat": "bit"
        },
        {
          "key": "survival",
          "label": "Survival",
          "derivedStat": "bit"
        },
        {
          "key": "awareness",
          "label": "Awareness",
          "derivedStat": "bit",
          "effect": ", etc). The Digimon gains +3 to Checks for that specific type of Skill, added to the Derived Stat.\nFor Quick Reference:\n●\tCPU is used for Body Skills.\n●\tRAM is used for Agility Skills.\n●\tBIT is used for Intelligence and Charisma Skills.\n●\tDOS is used for Willpower Skills.\nSome Qualities a Digimon can purchase will ask for a Check using a Derived Stat, but alternatively they can use a Skill listed in brackets with pre-mentioned Derived Stat if they have the Prodigious Skill for that Check. For example, Substitute requires a RAM ("
        },
        {
          "key": "manipulate",
          "label": "Manipulate",
          "derivedStat": "bit"
        },
        {
          "key": "performance",
          "label": "Performance",
          "derivedStat": "bit"
        },
        {
          "key": "persuasion",
          "label": "Persuasion",
          "derivedStat": "bit"
        },
        {
          "key": "fortitude",
          "label": "Fortitude",
          "derivedStat": "dos"
        },
        {
          "key": "bravery",
          "label": "Bravery",
          "derivedStat": "dos"
        },
        {
          "key": "decipherIntent",
          "label": "Decipher Intent",
          "derivedStat": "bit"
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "skillBonus": 3
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Whenever you take this Quality, choose a specific Skill that corresponds with a Tamer’s list of Skills (such as Feats of Strength, Stealth, Awareness, etc). The Digimon gains +3 to Checks for that specific type of Skill, added to the Derived Stat.\nFor Quick Reference:\n●\tCPU is used for Body Skills.\n●\tRAM is used for Agility Skills.\n●\tBIT is used for Intelligence and Charisma Skills.\n●\tDOS is used for Willpower Skills.\nSome Qualities a Digimon can purchase will ask for a Check using a Derived Stat, but alternatively they can use a Skill listed in brackets with pre-mentioned Derived Stat if they have the Prodigious Skill for that Check. For example, Substitute requires a RAM (Evasion) Check. The Digimon can either use its RAM stat, or RAM + 3 if it purchased this Quality for Evasion for the Check.\nThe maximum Ranks a Digimon can take in this Quality is based on it’s Stage (see below).\n\n4.02 - Offensive Qualities\n________________________________________",
    "description": "Whenever you take this Quality, choose a specific Skill that corresponds with a Tamer’s list of Skills (such as Feats of Strength, Stealth, Awareness, etc). ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "perfuracaoDeArmadura",
    "name": "Armor Piercing",
    "originalName": "Armor Piercing",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Damage Total 4 para Rank 1, Damage Total 8 para Rank 2 e Damage Total 12 para Rank 3.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "[PIERCING] e [CERTAIN] cannotm ser aplicadas ao mesmo ataque, unless ambas sejam aplicadas ao Movement Assinatura.",
      "qualityNames": ""
    },
    "requiredFor": [
      "Fumbled Piercing"
    ],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Attack with [PIERCING]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "piercing"
      ],
      "appliesTo": "oneDamageAttack",
      "cannotShareWithTagsUnlessSignatureMove": [
        "certain"
      ]
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Damage (4/8/12)\nRequired for\nFUMBLED PIERCING\nOn first purchase, apply the [PIERCING] Tag to one [DAMAGE] Attack. The Tag is applicable to only that attack.\nAn attack with the [PIERCING] Tag deals extra Unalterable Damage on a hit for each Accuracy Success over the Target’s Dodge Successes, which also means this Quality deals no Unalterable Damage if the Dodge Pool against the Attack has the same number of Successes. The maximum Unalterable Damage equals the Digimon’s Ranks in this Quality. [PIERCING] may only be applied to one Attack per Digimon, and the number of Ranks a Digimon can take is based on its Stage (see table). In addition, a Digimon requires 4 Total Damage to take 1 Rank, 8 Total Damage to take 2 Ranks, and 12 Total Damage to take 3 Ranks.\nA Digimon may not have [PIERCING] and [CERTAIN] on the same Attack unless they apply both Tags to its Signature Move.\n\nARMOR PIERCING/CERTAIN STRIKE\nStage\t# of Ranks\tTotal Stat Required\nIn-Training\t0\t0\nRookie\t1\t4\nChampion\t2\t8\nUltimate (and beyond)\t3\t12\n\nHow it works\nAs an example to use this Attack, the Attacker has 1 Rank of [PIERCING] on an Attack and rolls 2 Accuracy Successes over the Target’s Dodge. In addition to the 2 free Damage it adds from the Accuracy successes alone, the Attack also deals 1 extra Unalterable Damage.\n\nAlternatively, an Attacker has 3 Ranks of [PIERCING] on an Attack and only rolls 1 Accuracy Success over the Target’s Dodge. It deals 1 extra Unalterable Damage, as it didn’t have enough Accuracy over Dodge to deal the additional 2 Unalterable Damage.",
    "description": "Damage (4/8/12) Required for FUMBLED PIERCING On first purchase, apply the [PIERCING] Tag to one [DAMAGE] Attack. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "golpeCerteiro",
    "name": "Certain Strike",
    "originalName": "Certain Strike",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Precision Total 4 para Rank 1, Precision Total 8 para Rank 2 e Precision Total 12 para Rank 3.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "[CERTAIN] e [PIERCING] cannotm ser aplicadas ao mesmo ataque, unless ambas sejam aplicadas ao Movement Assinatura.",
      "qualityNames": ""
    },
    "requiredFor": [
      "Weakened Strike"
    ],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Attack with [CERTAIN]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "certain"
      ],
      "appliesTo": "oneDamageAttack",
      "automaticSuccessesPerRank": 1,
      "cannotShareWithTagsUnlessSignatureMove": [
        "piercing"
      ]
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Accuracy (4/8/12)\nRequired for\nWEAKENED STRIKE\nOn first purchase, apply the [CERTAIN] Tag to one [DAMAGE] Attack. The Tag is applicable to only that attack.\nAn attack with the [CERTAIN] Tag gains automatic Successes equal to the Ranks in Certain Strike. [CERTAIN] may only be applied to one Attack per Digimon, and the number of ranks a Digimon can take  is based on its Stage (see table). In addition, a Digimon requires 4 Total Accuracy to take 1 Rank, 8 Total Accuracy to take 2 Ranks, and 12 Total Accuracy to take 3 Ranks.\nA Digimon may not have [PIERCING] and [CERTAIN] on the same Attack unless they apply both Tags to its Signature Move.",
    "description": "Accuracy (4/8/12) Required for WEAKENED STRIKE On first purchase, apply the [CERTAIN] Tag to one [DAMAGE] Attack. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "ataqueDeInvestida",
    "name": "Charge Attack",
    "originalName": "Charge Attack",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "A Tag [CHARGE] deve ser aplicada a um ataque [MELEE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[MELEE] Attack with [CHARGE]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "charge"
      ],
      "appliesTo": "oneMeleeAttack"
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon applies the [CHARGE] Tag to one [MELEE] Attack.\n[CHARGE] Attacks allows the Digimon to both use the Attack and Move with 1 Action, moving either before or after the Attack, allowing them to either move to or away from an Enemy and Attack at the same time. The Move granted by this Attack must be made in a straight line.\nA [CHARGE][T:PASS] Attack when used as an Area Attack increases the distance travelled instead.\nIf applied to a Signature Move, the Digimon can also move an additional amount of Spaces equal to its Battery",
    "description": "The Digimon applies the [CHARGE] Tag to one [MELEE] Attack. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "municao",
    "name": "Ammo",
    "originalName": "Ammo",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Cannot ser aplicada a um Movement Assinatura.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Reload"
    ],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Attack with [AMMO]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "ammo"
      ],
      "appliesTo": "oneAttack"
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon may apply the [AMMO] Tag to one Attack.\n\nAn Attack with the [AMMO] Tag ignores the one Attack per Round rule. The Digimon can only use this Attack once per Combat.\n\nThis cannot apply to a Signature Move.",
    "description": "The Digimon may apply the [AMMO] Tag to one Attack. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "recuoPesado",
    "name": "Heavy Recoil",
    "originalName": "Heavy Recoil",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "A Tag [RECOIL] deve ser aplicada a um ataque [RANGE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Cannot ser usada em Postura de Sentinela.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[RANGE] Attack with [RECOIL]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "recoil"
      ],
      "appliesTo": "oneRangedAttack"
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon applies the [RECOIL] Tag to one [RANGE] Attack.\nA [RECOIL] Attack’s Range and Effective Limit is halved, but ignores the Accuracy penalty caused by adjacent Enemies if attacking an Adjacent Enemy. When the Attack is made, the Digimon is pushed away from its Target a number of Spaces equal to its Stage. If a [RECOIL][DAMAGE] Attack gets at least 1 Accuracy Success over the Target’s Dodge, the Target is pushed away the same distance. [RECOIL] may be applied to an Attack with the [PUSH] Tag, potentially increasing the distance pushed.\n[RECOIL] Area Attacks have half their potential maximum Size. If the Area Attack has the [T:BURST] Tag, the Digimon can move in any direction when the Attack is made as an Area Attak, not just away from the Target (but it still moves in a straight line).\nYou cannot use an Attack with this Tag in Sentry Stance.\nIf applied to a Signature Move, the Digimon can also push itself away an additional amount of Spaces equal to its Battery.",
    "description": "The Digimon applies the [RECOIL] Tag to one [RANGE] Attack. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "poderBrutal",
    "name": "Huge Power",
    "originalName": "Huge Power",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "instant",
      "chatMessage": "Rerrole resultados baixos em uma Pool de Precision."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "effect": "This Quality provides different effects based on how many Ranks are purchased, which are listed below.\nRank 1\nOnce per round (which resets at the end of the Digimon’s turns), the Digimon may reroll any 1’s that appear when rolling an Accuracy Poll.\nRank 2\nThe Digimon may now also reroll any 2's that appear on the same roll when using this Quality.\nThis Quality does not affect Bonus Dice granted from Tamer Actions, such as Directs or Hold Action (these dice should be rolled separately).",
    "description": "This Quality provides different effects based on how many Ranks are purchased, which are listed below. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "flancoAgressivo",
    "name": "Aggressive Flank",
    "originalName": "Aggressive Flank",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Duelista de Hordas"
    },
    "requiredFor": [
      "Coordinated Assault"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon gains a bonus to its Accuracy equal to its RAM, whenever an Ally is adjacent to the Target.",
    "description": "The Digimon gains a bonus to its Accuracy equal to its RAM, whenever an Ally is adjacent to the Target.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "contraAtaque",
    "name": "Counterattack",
    "originalName": "Counterattack",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Counterblow",
      "Cross Counter",
      "Return Fire",
      "Instant Counter"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "instant",
      "chatMessage": "When um Enemy errar um ataque against você, use uma Interrupção para against-atacar."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "usesFormula": {
      "valueFromRank": true,
      "valuePerRank": 1,
      "recharge": "combat"
    },
    "effect": "If an Enemy were to miss with an Attack against you, you may take an Interrupt Action to make an Attack with the Attacker as the Target. The Target suffers a Penalty to Dodge equal to the Digimon’s Stage in response to the Attack. The Digimon may choose to use any Attack that only requires 1 Action when using this Quality.\nThis can only be used a number of times per Combat equal to the Ranks in this Quality. You may not use an Attack as an Area Attack while countering with this Quality.",
    "description": "If an Enemy were to miss with an Attack against you, you may take an Interrupt Action to make an Attack with the Attacker as the Target. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "areaDeAtaque",
    "name": "Area Attack",
    "originalName": "Area Attack",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 6,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Zoner"
    ],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Area Tag",
      "cannotRepeat": true,
      "options": [
        {
          "key": "blast",
          "label": "[T:BLAST]",
          "originalLabel": "[T:BLAST]",
          "appliesTo": "rangeAttack",
          "baseSize": "1 Space (radius)",
          "maximumSize": "1 + half BIT em Spaces (radius)",
          "effect": "The Attack creates a circular zone that originates somewhere within the Attacker’s Range.\nBase: 1 Space (radius)\nMaximum: 1 + half BIT Spaces (radius)\nThis Area Attack can only be applied to [RANGE] Attacks."
        },
        {
          "key": "burst",
          "label": "[T:BURST]",
          "originalLabel": "[T:BURST]",
          "appliesTo": "meleeOrRangeAttack",
          "baseSize": "1 Space",
          "maximumSize": "1 + half DOS em Spaces",
          "effect": "The Attack affects a number of Spaces around the Attacker. This Attack goes outward from the Attacker, and thus the Attacker is not considered a Target for the purposes of Damage or Effects.\nBase: 1 Space\nMaximum: 1 + half DOS Spaces"
        },
        {
          "key": "cone",
          "label": "[T:CONE]",
          "originalLabel": "[T:CONE]",
          "appliesTo": "meleeOrRangeAttack",
          "baseSize": "3 Spaces",
          "maximumSize": "3 + BIT em Spaces",
          "effect": "The Attack creates a 90 degree cone which originates adjacent to the Attacker.\nBase: 3 Spaces\nMaximum: 3 + BIT Spaces"
        },
        {
          "key": "line",
          "label": "[T:LINE]",
          "originalLabel": "[T:LINE]",
          "appliesTo": "meleeOrRangeAttack",
          "baseSize": "3 Spaces",
          "maximumSize": "3 + double CPU em Spaces",
          "effect": "The Attack creates a pillar adjacent to the Attacker. If the pillar would hit a solid wall, it may ‘bounce’ off of the wall, and potentially hit additional targets.\nBase: 3 Spaces\nMaximum: 3 + double CPU Spaces\nThe pillar’s width is 1 Space as a minimum, but the Attacker may increase the width by 1 Space for each Size it is larger than Large."
        },
        {
          "key": "pass",
          "label": "[T:PASS]",
          "originalLabel": "[T:PASS]",
          "appliesTo": "meleeAttack",
          "baseSize": "RAM em Spaces",
          "maximumSize": "RAM em Spaces, modified by [CHARGE] if aplicável",
          "effect": "The Attack allows the user to charge in a straight line in a given direction, hitting every Target it passed through. When declared, the Attacker may Move a Base Size distance equal to its RAM in a straight line, and can move through the Spaces of Allies and Enemies (but it cannot end this in a Space it cannot occupy).\nIf the Attack also has the [CHARGE] Tag, the Digimon may also add up to its Movement to the distance traveled.\nThis Area Attack can only be applied to [MELEE] Attacks."
        },
        {
          "key": "wave",
          "label": "[T:WAVE]",
          "originalLabel": "[T:WAVE]",
          "appliesTo": "meleeOrRangeAttack",
          "baseSize": "2 Spaces wide",
          "maximumSize": "2 + DOS Spaces wide",
          "effect": "The Attack creates a cube that can be placed anywhere adjacent to the Attacker.\nBase: 2 Spaces wide\nMaximum: 2 + DOS Spaces wide"
        }
      ]
    },
    "attackModifier": {
      "grantsTags": [
        "t:blast",
        "t:burst",
        "t:cone",
        "t:line",
        "t:pass",
        "t:wave"
      ],
      "appliesTo": "differentAttackPerRank",
      "triggerRequired": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao declarar o ataque, escolha if a Tag de Área será ativada."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "areaRules": {
      "canBeUsedAsRegularAttack": true,
      "chooseTargetGroup": true,
      "targetGroupOptions": [
        "enemies",
        "allies"
      ],
      "damageAreaAttack": {
        "damageAfterArmorHalved": true,
        "round": "up",
        "affectsSingleTargetToo": true,
        "doesNotAffectUnalterableDamage": true
      },
      "supportAreaAttack": {
        "enemyTargetMinimum": 1,
        "allyTargetMinimum": 0,
        "potencyReduction": 1,
        "durationReduction": 1,
        "derivedStatValuesReduced": 1
      },
      "sizeRules": {
        "rangeCanUseMaximumSize": true,
        "meleeCanUseBaseSizeOnly": true,
        "meleeBaseCanBeIncreasedByReachWideSwings": true,
        "signatureMoveBaseSizeBonus": 1
      }
    },
    "effect": "The Digimon applies an Area Attack Tag to an Attack for each Rank in this Quality. There are 6 different types of Area Attacks, listed below. Each Tag can only be purchased once, and must be applied to different Attacks. Most Area Attacks can be applied to [MELEE] or [RANGE] Attacks, but there are some exceptions (explained below). An Attack with an Area Attack Tag can still be used as a regular Attack, as the Attacker must trigger the Area Attack Tag when it declares the Attack.\nThe Digimon can choose to Trigger an Area Attack, which changes it to target all the Digimon within the Area, however you can choose whether the Attack only targets Enemies or Allies.\n[DAMAGE] Area Attacks have Damage dealt after Armor halved (rounded up). The Damage is halved regardless of whether there is only one Target. This does not affect Unalterable Damage.\n[SUPPORT] Area Attacks have the Duration and Potency of all Attack Effects reduced by 1, to a minimum of 1 if Attacking Enemies, or to a minimum of 0 if Attacking Allies. If an Effect lists a value based on a Derived Stat, such as [TAUNT], this too is lowered by 1.\nArea Attacks have a Base Size and Maximum Size. [RANGE] Area Attacks can use the Maximum Size of an Area Attack. [MELEE] Area Attacks can only use the Base Size of an Area Attack, with one exception. The Base Size of [MELEE] Area Attacks can be increased via Reach: Wide Swings. If applied to a Signature Move, the Base Size of Area Attacks increases by 1.\n\n[T:BLAST]\tThe Attack creates a circular zone that originates somewhere within the Attacker’s Range.\nBase: 1 Space (radius)\nMaximum: 1 + half BIT Spaces (radius)\nThis Area Attack can only be applied to [RANGE] Attacks.\n[T:BURST]\tThe Attack affects a number of Spaces around the Attacker. This Attack goes outward from the Attacker, and thus the Attacker is not considered a Target for the purposes of Damage or Effects.\nBase: 1 Space\nMaximum: 1 + half DOS Spaces\n\n[T:CONE]\tThe Attack creates a 90 degree cone which originates adjacent to the Attacker.\nBase: 3 Spaces\nMaximum: 3 + BIT Spaces\n[T:LINE]\tThe Attack creates a pillar adjacent to the Attacker. If the pillar would hit a solid wall, it may ‘bounce’ off of the wall, and potentially hit additional targets.\nBase: 3 Spaces\nMaximum: 3 + double CPU Spaces\nThe pillar’s width is 1 Space as a minimum, but the Attacker may increase the width by 1 Space for each Size it is larger than Large.\n[T:PASS]\tThe Attack allows the user to charge in a straight line in a given direction, hitting every Target it passed through. When declared, the Attacker may Move a Base Size distance equal to its RAM in a straight line, and can move through the Spaces of Allies and Enemies (but it cannot end this in a Space it cannot occupy).\nIf the Attack also has the [CHARGE] Tag, the Digimon may also add up to its Movement to the distance traveled.\nThis Area Attack can only be applied to [MELEE] Attacks.\n[T:WAVE]\tThe Attack creates a cube that can be placed anywhere adjacent to the Attacker.\nBase: 2 Spaces wide\nMaximum: 2 + DOS Spaces wide",
    "description": "The Digimon applies an Area Attack Tag to an Attack for each Rank in this Quality. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "zonista",
    "name": "Zoner",
    "originalName": "Zoner",
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires 1 Rank of Area Attack.",
      "qualityNames": "Area Attack"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Zone Technique",
      "options": [
        {
          "key": "friendlyFire",
          "label": "Friendly Fire",
          "originalLabel": "Friendly Fire",
          "incompatible": {
            "text": "Incompatible with Data Specialization: Status Warlord.",
            "qualityNames": "Data Specialization: Status Warlord"
          },
          "effect": "Incompatible\nDATA SPECIALIZATION: STATUS WARLORD\n\nWhenever the Digimon makes a [SUPPORT] Area Attack an Effect Tag that only applies to Allies, it can change the Tags of the Attack in the following ways for different Targets.\n●\tThe Attack is treated as [DAMAGE] for Enemies and [SUPPORT] for Allies.\n●\tThe Effect does not affect Enemies.\nThis can be used to turn a [SUPPORT][SHARPEN][T:BLAST] Attack meant for Allies into a [DAMAGE][T:BLAST] Attack for Enemies while still providing the same benefits to Allies."
        },
        {
          "key": "bombardment",
          "label": "Bombardment",
          "originalLabel": "Bombardment",
          "effect": "The Digimon can choose to Target everything (Allies & Enemies) within the zone of a [DAMAGE] Attack with an Area Attack Tag , and if it does, the Damage of the Attack cannot be reduced lower than the Derived Stat used to calculate that Area Attack, or the Total Damage after Armor (whichever is lower).\nFor example, if a Digimon with 4 CPU used a [DAMAGE][T:LINE] Attack, and dealt 5 Damage after Armor, it would only be reduced to 4 (it’s CPU) instead of 3 (half of 5 rounded up). Alternatively, if the Attack only deals 3 Damage after Armor, it wouldn’t be reduced at all."
        },
        {
          "key": "firewallBypass",
          "label": "Firewall Bypass",
          "originalLabel": "Firewall Bypass",
          "effect": "The Digimon can choose to Target everything (Allies & Enemies) within the zone of a [SUPPORT] Attack with an Area Attack Tag, and if it does, the Potency and Duration of Attack Effects is no longer reduced.\n\n \n4.03 - Defensive Qualities\n________________________________________"
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Choose one of the options below. You may only take this Quality once.\n\nFriendly Fire\tIncompatible\nDATA SPECIALIZATION: STATUS WARLORD\n\nWhenever the Digimon makes a [SUPPORT] Area Attack an Effect Tag that only applies to Allies, it can change the Tags of the Attack in the following ways for different Targets.\n●\tThe Attack is treated as [DAMAGE] for Enemies and [SUPPORT] for Allies.\n●\tThe Effect does not affect Enemies.\nThis can be used to turn a [SUPPORT][SHARPEN][T:BLAST] Attack meant for Allies into a [DAMAGE][T:BLAST] Attack for Enemies while still providing the same benefits to Allies.\nBombardment \tThe Digimon can choose to Target everything (Allies & Enemies) within the zone of a [DAMAGE] Attack with an Area Attack Tag , and if it does, the Damage of the Attack cannot be reduced lower than the Derived Stat used to calculate that Area Attack, or the Total Damage after Armor (whichever is lower).\nFor example, if a Digimon with 4 CPU used a [DAMAGE][T:LINE] Attack, and dealt 5 Damage after Armor, it would only be reduced to 4 (it’s CPU) instead of 3 (half of 5 rounded up). Alternatively, if the Attack only deals 3 Damage after Armor, it wouldn’t be reduced at all.\nFirewall Bypass\tThe Digimon can choose to Target everything (Allies & Enemies) within the zone of a [SUPPORT] Attack with an Area Attack Tag, and if it does, the Potency and Duration of Attack Effects is no longer reduced.\n\n4.03 - Defensive Qualities\n________________________________________",
    "description": "Choose one of the options below. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
{
  "id": "duelistaDeHordas",
  "name": "Horde Duelist",
  "originalName": "Horde Duelist",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": true,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 2,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "Incompatível com Flanco Agressivo.",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Use 1 Ação e role BIT (Sobrevivência) contra inimigos adjacentes."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Horde Duelist automation scaffold. See rule text: Quando está adjacente apenas a inimigos, o Digimon pode gastar 1 Ação para fazer um Teste BIT (Sobrevivência). O NA é 10 + maior Estágio entre inimigos adjacentes + quantidade de inimigos adjacentes. Em sucesso, ganha bônus de Precisão igual ao BIT contra inimigos adjacentes sem aliados adjacentes ao alvo até o início do próximo turno. Em sucesso crítico, recupera a Ação gasta. Em falha crítica, não pode usar novamente até o fim do combate.",
  "description": "Horde Duelist",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
{
  "id": "ocultarAVista",
  "name": "Hide in Plain Sight",
  "originalName": "Hide in Plain Sight",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": false,
    "static": true,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [
    "Manto de Sombras",
    "Ataque Furtivo"
  ],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Use 1 Ação para tentar se esconder mesmo estando à vista."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Hide in Plain Sight automation scaffold. See rule text: O Digimon pode fazer um Teste de Furtividade como 1 Ação, uma vez por turno, para se esconder mesmo estando à vista, tratando-se como obscurecido para esse objetivo. Ao interferir no combate, como atacar, deixa de estar escondido.",
  "description": "Hide in Plain Sight",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
{
  "id": "mantoDeSombras",
  "name": "Shade Cloak",
  "originalName": "Shade Cloak",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": true,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "Requer Ocultar-se à Vista.",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Ao rolar RAM (Furtividade), gaste +1 Ação para compartilhar o resultado com aliados próximos."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Shade Cloak automation scaffold. See rule text: Quando faz um Teste RAM (Furtividade), o Digimon pode gastar +1 Ação para que aliados dentro de alcance igual ao RAM recebam o mesmo resultado e benefício, enquanto permanecerem dentro da distância. Em combate, se qualquer aliado beneficiado interferir, o efeito termina para todos.",
  "description": "Shade Cloak",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
{
  "id": "ataqueFurtivo",
  "name": "Sneak Attack",
  "originalName": "Sneak Attack",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": true,
    "trigger": false,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "Requer Ocultar-se à Vista.",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": true,
    "type": "singleAttack",
    "label": "Ataque com [SNEAK]",
    "options": []
  },
  "attackModifier": {
    "enabled": true,
    "grantsTags": [
      "sneak"
    ],
    "appliesTo": "oneAttack",
    "sneakAttack": true,
    "rangeExtraActionCost": 1
  },
  "grants": {},
  "activation": {
    "enabled": false,
    "active": false,
    "mode": "passive",
    "chatMessage": ""
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Sneak Attack automation scaffold. See rule text: Aplique [SNEAK] a um ataque. Ataques [RANGE][SNEAK] custam +1 Ação, exceto Movimento Assinatura. Ao atacar um inimigo de quem está escondido, recebe bônus de Precisão igual ao RAM.",
  "description": "Sneak Attack",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
{
  "id": "golpeSimplificado",
  "name": "Simplified Strike",
  "originalName": "Simplified Strike",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": true,
    "trigger": false,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 2,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": true,
    "type": "singleAttack",
    "label": "Ataque com [SIMPLE]",
    "options": []
  },
  "attackModifier": {
    "enabled": true,
    "grantsTags": [
      "simple"
    ],
    "appliesTo": "oneAttack",
    "actionCostReduction": 1,
    "actionCostMinimum": 1
  },
  "grants": {},
  "activation": {
    "enabled": false,
    "active": false,
    "mode": "passive",
    "chatMessage": ""
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Simplified Strike automation scaffold. See rule text: Aplique [SIMPLE] a um ataque. Sempre que usar esse ataque, seu custo em Ações é reduzido em 1, até o mínimo de 1.",
  "description": "Simplified Strike",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
{
  "id": "gritoDeGuerra",
  "name": "Battle Cry",
  "originalName": "Battle Cry",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": true,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 3,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Use 1 Ação e role DOS (Bravura) para conceder [BASTION] a aliados próximos."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Battle Cry automation scaffold. See rule text: Como 1 Ação, faça um Teste DOS (Bravura). O NA é 10 + maior SV entre inimigos + total de inimigos em combate. Aliados dentro de espaços iguais ao DOS recebem [BASTION] por 1 Rodada. Falha concede [BASTION 1], sucesso [BASTION 2], sucesso crítico recupera a Ação. Falha crítica também impede novo uso até o fim do combate.",
  "description": "Battle Cry",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
{
  "id": "cacadorVigilante",
  "name": "Watchful Hunter",
  "originalName": "Watchful Hunter",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": true,
    "static": true,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": false,
    "type": "",
    "options": []
  },
  "attackModifier": {
    "grantsTags": []
  },
  "grants": {},
  "activation": {
    "enabled": true,
    "active": false,
    "mode": "instant",
    "chatMessage": "Estude um alvo com DOS (Percepção) para ganhar bônus contra ele."
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Watchful Hunter automation scaffold. See rule text: Uma vez por rodada, durante seu turno, o Digimon pode fazer DOS (Percepção) como Ação Livre, ignorando penalidades de visão exceto Cego. Como Ação Livre da Qualidade ou 2 Ações, escolhe um inimigo e faz DOS (Percepção) contra NA 12 + RAM do alvo. Em sucesso, recebe +2 Precisão com [MELEE] contra o alvo até o início do próximo turno e trata o alvo como não obscurecido. Em sucesso crítico, o bônus também vale para [RANGE].",
  "description": "Watchful Hunter",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
{
  "id": "venenoso",
  "name": "Venomous",
  "originalName": "Venomous",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": true,
    "trigger": false,
    "static": false,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 1,
    "perRank": false,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 1,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": true,
    "type": "singleAttack",
    "label": "Ataque [DAMAGE] com [VENOM]",
    "options": []
  },
  "attackModifier": {
    "enabled": true,
    "grantsTags": [
      "venom"
    ],
    "appliesTo": "oneDamageAttack",
    "venomous": true,
    "cannotShareWithTags": [
      "poison"
    ]
  },
  "grants": {},
  "activation": {
    "enabled": false,
    "active": false,
    "mode": "passive",
    "chatMessage": ""
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Venomous automation scaffold. See rule text: Aplique [VENOM] a um ataque [DAMAGE]. Se o ataque acertar, o atacante faz BIT (Sobrevivência) contra NA 10 + RAM do alvo. Em sucesso, o alvo sofre [POISON] por 1 Rodada; se já tiver [POISON], a Potência aumenta em 1. Em sucesso crítico, a Potência aumenta em +1 adicional. Ataques de Área não recebem esse benefício.",
  "description": "Venomous",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
{
  "id": "alcance",
  "name": "Reach",
  "originalName": "Reach",
  "section": "Offensive Qualities",
  "category": {
    "core": false,
    "attack": false,
    "trigger": false,
    "static": true,
    "free": false,
    "negative": false
  },
  "cost": {
    "dp": 2,
    "perRank": true,
    "coreDiscountAvailable": false,
    "countsAgainstFreeLimit": false,
    "grantsDp": false
  },
  "rank": {
    "value": 1,
    "max": 3,
    "limited": false
  },
  "stageRequirement": {
    "enabled": false,
    "minimum": "",
    "maximum": ""
  },
  "requirements": {
    "text": "",
    "qualityNames": ""
  },
  "incompatible": {
    "text": "",
    "qualityNames": ""
  },
  "requiredFor": [],
  "choices": {
    "required": true,
    "type": "single",
    "label": "Opção de Alcance",
    "options": [
      {
        "key": "wideSwings",
        "label": "Golpes Amplos",
        "originalLabel": "Wide Swings"
      },
      {
        "key": "longArms",
        "label": "Braços Longos",
        "originalLabel": "Long Arms"
      },
      {
        "key": "extendedGrapple",
        "label": "Agarrão Estendido",
        "originalLabel": "Extended Grapple"
      }
    ]
  },
  "attackModifier": {
    "enabled": true,
    "grantsTags": [],
    "appliesTo": "melee",
    "reachMode": "wideSwings",
    "reachBonusPerRank": 1
  },
  "grants": {},
  "activation": {
    "enabled": false,
    "active": false,
    "mode": "passive",
    "chatMessage": ""
  },
  "uses": {
    "enabled": false,
    "value": 0,
    "max": 0,
    "recharge": ""
  },
  "effect": "Reach automation scaffold. See rule text: Escolha Golpes Amplos, Braços Longos ou Agarrão Estendido. A opção escolhida aumenta o alcance de ataques corpo a corpo ou de Clash conforme os Ranks nesta Qualidade.",
  "description": "Reach",
  "tier": "starting",
  "originalTier": "Starting Qualities",
  "availability": {
    "minimumStage": "",
    "label": "Starting Quality"
  }
},
  {
    "id": "evasaoAbsoluta",
    "name": "Absolute Evasion",
    "originalName": "Absolute Evasion",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Avoidance Total 4 para Rank 1, Avoidance Total 8 para Rank 2 e Avoidance Total 12 para Rank 3.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Incompatible with Data Specialization: Uncatchable Target.",
      "qualityNames": "Data Specialization: Uncatchable Target"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "automaticDodgeSuccessesPerRank": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Dodge (4/8/12)\nIncompatible\nDATA SPECIALIZATION: UNCATCHABLE TARGET\nThe Digimon gains automatic Successes equal to the Ranks in Absolute Evasion. These automatic Successes are deducted from the Base Dodge Pool. However, every time the Digimon would suffer a Dodge penalty from consecutive Dodging, the automatic Successes are removed instead until none remain.\n\nThe number of Ranks a Digimon can take is based on its Stage (see below). In addition, a Digimon requires 4 Total Dodge to take 1 Rank, 8 Total Dodge to take 2 Ranks, and 12 Total Dodge to take 3 Ranks.\n\nABSOLUTE EVASION\nStage\t# of Ranks\tTotal Stat Required\nIn-Training\t0\t0\nRookie\t1\t4\nChampion\t2\t8\nUltimate (and beyond)\t3\t12\n\nHow it works\nAs an example, a Digimon with 8 Base Dodge and 1 Rank of Absolute Evasion would possess 1 automatic Success and has a Dodge Pool of 7 for the first time it is targeted by an Attack. The second time it is targeted by an Attack, it would only have a Dodge Pool of 7 with no automatic Successes. The third time, the Dodge Pool would drop to 6 as standard procedure takes place.\n\nWhen the Digimon would reset its Dodge Pool at the end of its turn, it regains these automatic Successes.",
    "description": "Dodge (4/8/12) Incompatible DATA SPECIALIZATION: UNCATCHABLE TARGET The Digimon gains automatic Successes equal to the Ranks in Absolute Evasion. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "esquiva",
    "name": "Avoidance",
    "originalName": "Avoidance",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "instant",
      "chatMessage": "Rerrole resultados baixos em uma Pool de Avoidance."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "effect": "This Quality provides different effects based on how many Ranks are purchased, which are listed below.\nRank 1\nOnce per round (which resets at the end of the Digimon’s turns), the Digimon may reroll any 1’s that appear when rolling a Dodge Pool.\nRank 2\nThe Digimon may now also reroll any 2's that appear on the same roll when using this Quality.\nThis Quality does not affect Bonus Dice granted from Tamer Actions, such as Directs or Hold Action (these dice should be rolled separately).",
    "description": "This Quality provides different effects based on how many Ranks are purchased, which are listed below. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "monstroDeCombate",
    "name": "Combat Monster",
    "originalName": "Combat Monster",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Cross Counter, Summoner, Conjurer, Positive Reinforcement"
    },
    "requiredFor": [
      "Selvageria",
      "Berserker"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resource": {
        "key": "resolve",
        "label": "Resolve",
        "value": 0,
        "max": 4
      }
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Whenever the Digimon takes damage from an Enemy, or from its own Qualities (like Overwrite or Violent Overwrite), it gains Resolve equal to the Damage taken. The Digimon’s maximum Resolve is 4. When the Digimon successfully makes an Attack, all Resolve is expended and added to the Damage of the Attack. Resolve also resets at the end of Combat.\nFor example, if a Digimon with this Quality takes 3 Damage, it gains 3 Resolve. It then misses on its next attack and takes 1 damage from an Enemy Attack, increasing to 4 Resolve. The Digimon then hits with an Attack, which deals an extra 4 Damage and Resolve is set back to 0.\nIf the Digimon would fall under the effect of [CLEANSE], they also lose Resolve for each Success from the Effect. For example, if a Digimon had 5 Resolve and suffered a [CLEANSE] with 2 Successes, it would be left with 3 Resolve. The one applying [CLEANSE] can choose not to reduce Resolve, akin to a Specific Effect.\nYou only gain Resolve from Damage taken to Wound Boxes. This means losing Temporary Wound Boxes has no effect. In addition, you do not gain Resolve if you take Damage from your own Attacks or an Ally’s Attacks.",
    "description": "Whenever the Digimon takes damage from an Enemy, or from its own Qualities (like Overwrite or Violent Overwrite), it gains Resolve equal to the Damage taken. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "aProvaDeBalas",
    "name": "Bullet Proof",
    "originalName": "Bullet Proof",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When this Digimon is Attacked, any further Attack from the same Attacker suffers a penalty to Accuracy and Damage equal to the Digimon’s SV, which can stack if they Attack more than twice between Rounds. The Digimon's Armor can reduce the Damage of any Attack affected by this Quality to 0. This penalty resets at the end of the Digimon’s turn.",
    "description": "When this Digimon is Attacked, any further Attack from the same Attacker suffers a penalty to Accuracy and Damage equal to the Digimon’s SV, which can stack if they Attack more than twice between Rounds. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "substituir",
    "name": "Substitute",
    "originalName": "Substitute",
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Cannot ser usado para evitar um ataque while estiver em Clash. Can be usado para escapar de um Clash when ele é iniciado, como if fosse um ataque.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "actionCost": 0,
      "chatMessage": "Ao ser atingido por um ataque, antes de suffersr Damage, faça um Check RAM (Evasion) to create um substituto."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "ram",
      "skill": "evade",
      "tnFormula": "10 + attackerBit",
      "consecutiveUseTnIncrease": 3,
      "notes": "Each use of this Quality, even on failure, increases o TN em 3 for further uses until the end of Combat."
    },
    "result": {
      "criticalFailure": "",
      "failure": "The Digimon is hit by the Attack as normal and cannot use this Quality again until the end of Combat.",
      "success": "The Digimon forfeits Wound Boxes equal to its SV + 1 (with a minimum of 1). Additionally, the Attack is considered to be successful (such as for the benefit of Fierce Stance or the Resolve of Combat Monster).",
      "criticalSuccess": ""
    },
    "effect": "Right as the Digimon is hit by an attack, before taking Damage it may choose to make a decoy or leave a lingering image to take the blow instead. The Digimon makes a RAM (Evasion) Check as a Free Action. The TN equals 10 + the Attacker’s BIT.\nCritical Failure: The Digimon is hit by the Attack as normal and cannot use this Quality again until the end of Combat.\nFailure: The Digimon is hit by the Attack as normal.\nSuccess: The Digimon forfeits Wound Boxes equal to its SV + 1 (with a minimum of 1). Additionally, the Attack is considered to be successful (such as for the benefit of Fierce Stance or the Resolve of Combat Monster).\nCritical Success: the Digimon only forfeits half as many Wound Boxes (with a minimum of 1).\nEach time the Quality is used, even on a Failure, the TN increases by 3 for any further use until the end of Combat. If the Digimon cannot forfeit the Wound Boxes to make a Substitute without being left at 0 Wound Boxes or lower, it cannot be used.\nThe lost Wound Boxes from Substitute does affect Resolve. Substitute cannot be used to avoid an Attack while in a Clash, but it can be used to Escape a Clash when it is Initiated as if it was an Attack.\n\n4.04 - Stance Qualities\n________________________________________",
    "description": "Right as the Digimon is hit by an attack, before taking Damage it may choose to make a decoy or leave a lingering image to take the blow instead. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "almaFeroz",
    "name": "Fierce Soul",
    "originalName": "Fierce Soul",
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": {
        "key": "fierceStance",
        "label": "Fierce Stance",
        "originalLabel": "Fierce Stance"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stance",
      "action": "stanceChange",
      "chatMessage": "The Digimon entra em Fierce Stance usando a Action Trocar Postura."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "turn"
    },
    "stance": {
      "key": "fierceStance",
      "label": "Fierce Stance",
      "originalLabel": "Fierce Stance",
      "effects": {
        "damageBonusFrom": "sv",
        "movementPenaltyFrom": "sv",
        "rangePenaltyFrom": "sv"
      },
      "trigger": {
        "when": "missAttack",
        "frequency": "oncePerTurn",
        "reset": "endOfDigimonTurn",
        "effect": "If o Digimon errar um de seus attacks, o mesmo attack can be usado imediatamente de novo against o mesmo target como Action Livre. O target ainda suffers a penalidade de Avoidance do attack inicial. If usado with Movement Assinatura, mantém a Battery do attack inicial. Para usar with uma Area Attack, o attack must ter errado todos os targets."
      }
    },
    "effect": "The Digimon gains access to a unique stance, Fierce Stance. The Digimon may enter this Stance using the Stance Change Action.\nWhile in Fierce Stance, the Digimon gains a bonus to Damage equal to its SV, but suffers a penalty to Movement and Range of the same amount.\nAlso while in Fierce Stance, if the Digimon were to miss one of its Attacks, the same Attack can be immediately used again on the same target as a Free Action. This can be triggered once per turn (which resets at the end of the Digimon’s turn). The Target still suffers the penalty to Dodge from the initial Attack. If this is used on a Signature Move, it keeps the Battery from the initial Attack. In order to use this with an Area Attack, the Attack must have missed every single Target.",
    "description": "The Digimon gains access to a unique stance, Fierce Stance. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "coracaoCorajoso",
    "name": "Brave Heart",
    "originalName": "Brave Heart",
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": {
        "key": "braveStance",
        "label": "Brave Stance",
        "originalLabel": "Brave Stance"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stance",
      "action": "stanceChange",
      "chatMessage": "The Digimon entra em Brave Stance usando a Action Trocar Postura."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "stance": {
      "key": "braveStance",
      "label": "Brave Stance",
      "originalLabel": "Brave Stance",
      "effects": {
        "armorBonusFrom": "sv",
        "movementPenaltyFrom": "sv"
      },
      "trigger": {
        "when": "surviveAfterIntercede",
        "frequency": "whileInStance",
        "effect": "If o Digimon escolher Interceder while estiver em Brave Stance e sobreviver ao attack no fim da troca, ele gains um bônus temporário de Damage for each Ally within alcance equal to the seu CPU. Esse bônus termina após o próximo attack [DAMAGE] bem-sucedido ou no fim do combate."
      }
    },
    "effect": "The Digimon gains access to a unique stance, Brave Stance. The Digimon may enter this Stance using the Stance Change Action.\nWhile in Brave Stance, the Digimon gains a bonus to Armor equal to its SV, but suffers a penalty to Movement of the same amount.\nIf the Digimon chooses to Intercede while in Brave Stance, should the Digimon survive the Attack at the end of the exchange, for every Ally within a range equal to its CPU the Digimon gains a temporary bonus to Damage. This bonus ends after the next successful [DAMAGE] Attack or at the end of Combat.\n\n4.05 - Preservation Qualities\n________________________________________",
    "description": "The Digimon gains access to a unique stance, Brave Stance. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "segundoFolego",
    "name": "Second Wind",
    "originalName": "Second Wind",
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Can only ser usado in Combat.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Faça um Recovery Check no meio do combate."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "recovery": {
      "enabled": true,
      "pool": "health",
      "regainWoundsFromResult": true,
      "cannotAttackThisTurn": true,
      "endOfCombatBonusIfUnused": 3
    },
    "effect": "This Quality can only be used in Combat. The Digimon can make a Recovery Check as 1 Action in the middle of Combat, rolling its Health as a Pool and regain missing Wound Boxes equal to the result. The Digimon cannot take an Attack Action the turn it uses this Quality.\nThe Digimon can use this Quality once per Combat. If the Quality was not used when Combat ends, the Digimon gains +3 Successes to the Recovery Check it makes at the end of Combat.",
    "description": "This Quality can only be used in Combat. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "mestreDaMatilha",
    "name": "Pack Master",
    "originalName": "Pack Master",
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "actionCost": 0,
      "chatMessage": "When o Digimon seria Target de um ataque, um Ally adjacente pode Interceder como Action Livre."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "effect": "If the Digimon would be targeted by an Attack, an adjacent Ally may Intercede as a Free Action once per Round.",
    "description": "If the Digimon would be targeted by an Attack, an adjacent Ally may Intercede as a Free Action once per Round.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "energiaVital",
    "name": "Vital Energy",
    "originalName": "Vital Energy",
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Illness"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "instant",
      "chatMessage": "Rerrole resultados baixos em um Teste de Health."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "effect": "This Quality provides different effects based on how many Ranks are purchased, which are listed below.\nRank 1\nOnce per round (which resets at the end of the Digimon’s turns), the Digimon may reroll any 1’s that appear when making a Health Check.\nRank 2\nThe Digimon may now also reroll any 2's that appear on the same roll when using this Quality.",
    "description": "This Quality provides different effects based on how many Ranks are purchased, which are listed below. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "acrobata",
    "name": "Tumbler",
    "originalName": "Tumbler",
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "crashDamageReductionFrom": "ram"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon gains bonus Damage reduction equal to its RAM when taking Crash Damage. If the Digimon also possesses the Advanced Mobility: Jumper Quality, it negates all Crash Damage from falling.\n\n4.06 - Utility Qualities\n________________________________________",
    "description": "The Digimon gains bonus Damage reduction equal to its RAM when taking Crash Damage. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "impulsoDeSistema",
    "name": "System Boost",
    "originalName": "System Boost",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "discountAvailable": true,
      "discount": {
        "firstPurchase": 1
      },
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 4,
      "limited": true
    },
    "rankLimit": {
      "type": "byStageMaxFour",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 1,
        "adult": 2,
        "perfect": 3,
        "ultimate": 4,
        "ultimatePlus": 4
      }
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "O número de Ranks que o Digimon pode comprar nesta Quality é equal to the seu Stage, até o maximum de 4.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Derived Stat",
      "cannotRepeat": true,
      "options": [
        {
          "key": "ram",
          "label": "RAM",
          "effect": ","
        },
        {
          "key": "cpu",
          "label": "CPU",
          "effect": ","
        },
        {
          "key": "bit",
          "label": "BIT",
          "effect": ","
        },
        {
          "key": "dos",
          "label": "DOS",
          "effect": "). It gains +1 to its choice.\nA Digimon cannot choose the same Derived Stat twice. The number of Ranks in this Quality a Digimon can purchase is equal to its Stage, to a maximum of 4.\nA Digimon has a 1 DP discount on the first purchase of this Quality."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "derivedStatChoicePerRank": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When the Digimon purchases a rank in this Quality, it choose one of its Derived Stats (RAM, CPU, BIT, DOS). It gains +1 to its choice.\nA Digimon cannot choose the same Derived Stat twice. The number of Ranks in this Quality a Digimon can purchase is equal to its Stage, to a maximum of 4.\nA Digimon has a 1 DP discount on the first purchase of this Quality.",
    "description": "When the Digimon purchases a rank in this Quality, it choose one of its Derived Stats (RAM, CPU, BIT, DOS). ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "conscienciaDeCombate",
    "name": "Combat Awareness",
    "originalName": "Combat Awareness",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "initiativeBonus": 3,
      "treatsSurpriseRoundsAsNormal": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon gains +3 Initiative, and treats Surprise Rounds as a normal Round of Combat.",
    "description": "The Digimon gains +3 Initiative, and treats Surprise Rounds as a normal Round of Combat.",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "teleporte",
    "name": "Teleport",
    "originalName": "Teleport",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Transporter"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "movementType": "teleport"
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "action": "teleport",
      "chatMessage": "Use a Action Teleport para if mover instantaneamente para um local desocupado visível."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "teleport": {
      "rangeFormula": "stage + 2 + instinctRanks + speedsterBonus",
      "ignoresDifficultTerrain": true,
      "requiresVisibleUnoccupiedLocation": true,
      "instinctAddsDistance": true,
      "speedsterBonus": 1,
      "interruptEscape": {
        "enabled": true,
        "usesSharedCombatUse": true,
        "causesAttackToMiss": true,
        "doesNotTriggerMissEffects": true
      },
      "clashEscape": {
        "enabled": true,
        "usesSharedCombatUse": true,
        "automaticallyEscapesClash": true
      }
    },
    "effect": "The Digimon is capable of instantly teleporting via the Teleport Action. Unlike the Move Action, the Teleport Action allows the Digimon to instantly arrive at an unoccupied location it can see within a number of spaces equal to its Stage + 2, which is unaffected by Difficult Terrain. The Digimon also adds its Ranks in Instinct to the distance it can teleport, as well as an additional +1 if it has the Data Optimization: Speedster.\nIt may also use this Quality to take the Teleport Action as an Interrupt Action to escape an Enemy’s Attack Once per Combat, causing the Attack to miss. Alternatively, this Once per Combat use can be used as a Clash Action to automatically escape the Clash.\nUsing Teleport to cause an Attack to miss will not trigger any Qualities or effects that require a missed Attack.",
    "description": "The Digimon is capable of instantly teleporting via the Teleport Action. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "glamour",
    "name": "Glamor",
    "originalName": "Glamor",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Aplique um Glamor para alterar a aparência de Allies."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "performance",
      "tnFormula": "10",
      "penaltyFormula": "numberOfTargetsBesidesUser",
      "opposedBy": {
        "stat": "dos",
        "skill": "awareness",
        "tn": "illusionResult"
      }
    },
    "illusion": {
      "rangeFrom": "range",
      "canAffectMinions": true,
      "affectsAnyNumberOfTargets": true,
      "canChangeApparentSize": true,
      "sizeLimitedByCurrentStage": true,
      "canSwapWithAdjacentWillingAlly": true,
      "teleportAllowsSwapWithinTeleportRange": true,
      "establishedAppearanceRequired": true,
      "endsWhen": [
        "The Digimon que criou o Glamor cria um novo Glamor.",
        "The Digimon is reduced to 0 Wound Boxes.",
        "The Digimon no longer has access to esta Quality, como when evolving to a new Stage.",
        "Um Target glamorizado cannot maintain its cover, como em uma failure em Manipulate Check.",
        "Um Target glamorizado is physically grabbed by an entity questioning its integrity ou is hit by a melee attack.",
        "Um Target glamorizado que appears as a Size different from its actual one is attacked."
      ]
    },
    "effect": "The Digimon is capable of applying a Glamor to their allies, and allowing them to have a different appearance. This can affect any number of targets (including Minions) within a number of spaces equal to the Digimon’s Range, and must be performed as 2 Actions.\nGlamor is achieved by the Digimon making a BIT (Performance) Check with a penalty equal to the number of Targets affected besides the User. The TN equals 10. The Glamor given by this effect must be established (i.e., if Bacomon wanted to give everyone Glamor to look like other Bacomon variants, he may do so, but only that). This can also make a Digimon appear larger or smaller than it currently is, but only to a size that the Digimon would have access to at its current Stage. (For example, an Ultimate Digimon could only make any Digimon affected appear as Gigantic or smaller, while a Mega Digimon could even go for Colossal.)\nIf the Digimon affects itself and a willing Ally within an adjacent space, it can swap places with that Ally when it creates the Illusion, given that the Illusion is created successfully. Which Target is which is known only to the Digimon and its affected Allies. If the Digimon has the Teleport Quality, it can swap places with any willing Ally within its Teleport range instead.\nAnyone who would question the integrity of the appearance can make a DOS (Awareness) Check with a TN equal to the successful result of the Illusion to determine whether or not it believes the illusion.\nThe Illusion remains on a creature until one of the following occurs:\n●\tThe Digimon that created the Glamor creates a new Glamor.\n●\tThe Digimon is brought to 0 Wound Boxes\n●\tThe Digimon no longer has access to this Quality such as evolving to a new Stage.\n●\tA glamored Target is unable to maintain their own cover (such as through a failed Manipulate Check).\n●\tA glamored Target is physically grabbed by an entity questioning their integrity, or hit by a melee attack.\n●\tA glamored Target that appears as a Size different from its standard one is attacked (such as an Attack passing through a Huge Digimon, because the Target is actually Medium is size).",
    "description": "The Digimon is capable of applying a Glamor to their allies, and allowing them to have a different appearance. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "sobreposicaoIlusoria",
    "name": "Illusionary Overlay",
    "originalName": "Illusionary Overlay",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Ao comprar esta Quality, escolha Illusionary Shroud ou Illusionary Barriers. Illusionary Shroud requer Naturewalk.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Tipo de Sobreposição",
      "options": [
        {
          "key": "illusionaryShroud",
          "label": "Illusionary Shroud",
          "originalLabel": "Illusionary Shroud",
          "requirements": {
            "text": "Requires Naturewalk.",
            "qualityNames": "Naturewalk"
          },
          "effect": ". The Digimon can also choose whether or not its Allies automatically see through the illusion. The Digimon also must choose an Element the Shroud mimics, such as a harsh smoke for Fire, when it creates this illusion. Digimon that are affected without the associated Naturewalk are Blinded while they are inside the illusion. While outside the illusion, Digimon that are inside the illusion are considered Obscured by affected Digimon.\n2.\tThe Digimon conjures"
        },
        {
          "key": "illusionaryBarriers",
          "label": "Illusionary Barriers",
          "originalLabel": "Illusionary Barriers",
          "requirements": {
            "text": "",
            "qualityNames": ""
          },
          "effect": ". The barriers can appear transparent or solid. The Digimon can also choose whether or not its Allies automatically know the barriers are false (this does not allow your allies to see through the Barriers). An enemy cannot move or attack through the walls while it believes the Illusion (usually requiring an Awareness Check and getting at least a Failure, or being attacked through the barriers).\nThe Illusion remains until one of the following occurs:\n●\tIt is attacked with a Called Shot, which prompts the Digimon that made it to know it was destroyed.\n●\tThe Digimon uses 2 Actions to make a new Illusionary Overlay.\n●\tThe Digimon who made the Overlay travels more than its BIT away from its creation point. Overlays cannot move along with the Digimon that created it.\nAnyone who would question the integrity of the appearance can make a DOS (Awareness) Check with a TN equal to the Success of the Illusion to determine whether or not it believes the illusion.\nCritical Failure: Nothing happens.\nFailure: The Digimon is able to determine that it can attack the illusionary walls, or see creatures inside the shroud as being Obscured.\nSuccess: The illusion is broken for that Digimon and the effect ends.\nCritical Success: The illusion is broken, and the TN check to create further illusions increases by an additional 3.\nA Digimon who Succeeds can also use 1 Action to alert any Allies able to hear it, which ends the effect on them as well.\nAfter this Quality has been used once in Combat, the TN increases by 3 for each consecutive use until the end of Combat."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Crie uma Illusionary Overlay usando BIT (Manipulate)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "manipulate",
      "tnFormula": "8 + enemyCount",
      "consecutiveUseTnIncrease": 3,
      "opposedBy": {
        "stat": "dos",
        "skill": "awareness",
        "tn": "illusionResult"
      }
    },
    "illusion": {
      "rangeFrom": "bit",
      "actionCost": 2,
      "cannotMoveWithCreator": true,
      "endsWhen": [
        "A ilusão é atacada with um Called Shot.",
        "The Digimon usa 2 Actions para criar uma nova Illusionary Overlay.",
        "The Digimon que criou a Sobreposição if afasta mais que seu BIT do ponto de criação."
      ],
      "awarenessResults": {
        "criticalFailure": "Nothing happens.",
        "failure": "The Digimon percebe que pode atacar as paredes ilusórias ou vê criaturas dentro da mortalha como obscurecidas.",
        "success": "A ilusão é quebrada para aquele Digimon e o efeito termina para ele.",
        "criticalSuccess": "A ilusão é quebrada, e o TN para criar ilusões futuras increases em 3 adicional."
      },
      "canAlertAlliesOnSuccess": true,
      "alertActionCost": 1
    },
    "effect": "The Digimon is capable of overlaying illusions in reality using their elemental abilities, manipulating the environment’s appearance. This manipulates the area within a range of the Digimon’s BIT, and must be performed as 2 Actions.\nThe illusion is achieved by the Digimon making a BIT (Manipulate) Check. The TN for the Check is 8 + the amount of Enemies in Combat. The Digimon must select one of the followings effects for this Quality when it is purchased:\n1.\tThe Digimon must have Naturewalk to select this option. The Digimon conjures an Illusionary Shroud. The Digimon can also choose whether or not its Allies automatically see through the illusion. The Digimon also must choose an Element the Shroud mimics, such as a harsh smoke for Fire, when it creates this illusion. Digimon that are affected without the associated Naturewalk are Blinded while they are inside the illusion. While outside the illusion, Digimon that are inside the illusion are considered Obscured by affected Digimon.\n2.\tThe Digimon conjures Illusionary Barriers. The barriers can appear transparent or solid. The Digimon can also choose whether or not its Allies automatically know the barriers are false (this does not allow your allies to see through the Barriers). An enemy cannot move or attack through the walls while it believes the Illusion (usually requiring an Awareness Check and getting at least a Failure, or being attacked through the barriers).\nThe Illusion remains until one of the following occurs:\n●\tIt is attacked with a Called Shot, which prompts the Digimon that made it to know it was destroyed.\n●\tThe Digimon uses 2 Actions to make a new Illusionary Overlay.\n●\tThe Digimon who made the Overlay travels more than its BIT away from its creation point. Overlays cannot move along with the Digimon that created it.\nAnyone who would question the integrity of the appearance can make a DOS (Awareness) Check with a TN equal to the Success of the Illusion to determine whether or not it believes the illusion.\nCritical Failure: Nothing happens.\nFailure: The Digimon is able to determine that it can attack the illusionary walls, or see creatures inside the shroud as being Obscured.\nSuccess: The illusion is broken for that Digimon and the effect ends.\nCritical Success: The illusion is broken, and the TN check to create further illusions increases by an additional 3.\nA Digimon who Succeeds can also use 1 Action to alert any Allies able to hear it, which ends the effect on them as well.\nAfter this Quality has been used once in Combat, the TN increases by 3 for each consecutive use until the end of Combat.",
    "description": "The Digimon is capable of overlaying illusions in reality using their elemental abilities, manipulating the environment’s appearance. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "tecnico",
    "name": "Technician",
    "originalName": "Technician",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Firewall",
      "Trojan",
      "Data Scan"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "technicianBonus": 3,
      "readsDigicode": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "A Digimon with Technician is skilled at repairing code and technology, and by default can read and comprehend Digicode for its Tamer. It can now interact with the code of the Digital World, understanding the nature of certain areas and their purpose as well as noticing when things are amiss in the very environment, like a strong Virus Digimon corrupting an area.\nThe Digimon gains a +3 bonus to Checks involving the following:\n●\tRepairing or deciphering code.\n●\tRepairing or deciphering machinery.\n●\tTrying to understand or gain insight into the current environment, including whether or not it is corrupted.\n●\tRebuilding things in the Digital World, such as buildings, machinery or environments.",
    "description": "A Digimon with Technician is skilled at repairing code and technology, and by default can read and comprehend Digicode for its Tamer. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "firewall",
    "name": "Firewall",
    "originalName": "Firewall",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Technician.",
      "qualityNames": "Technician"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "technicianBonusIncrease": 3,
      "firewallApplications": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon increases the bonus provided by Technician by +3, and can now also add their Technician bonus to any of the following:\n●\tRouting out intruders entering an area in the Digital World via hacking or messing with the code.\n●\tProtecting and reinforcing any code it’s currently working on or repairing.\n●\tMaintaining a Domain Control.\n●\tResisting any effects that would mess with its own code (like Suppression).",
    "description": "The Digimon increases the bonus provided by Technician by +3, and can now also add their Technician bonus to any of the following: ● Routing out intruders entering an area in the Digital World via hacking or messing with the code. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "trojan",
    "name": "Trojan",
    "originalName": "Trojan",
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Technician.",
      "qualityNames": "Technician"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "technicianBonusIncrease": 3,
      "trojanApplications": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon increases the bonus provided by Technician by +3, and can now also add their Technician bonus to any of the following:\n●\tManipulating the code into getting to protected areas.\n●\tDamaging or corrupting code.\n●\tDamaging or corrupting machinery.\nThe GM determines the limitations of these abilities, so make sure to discuss with them what your Digimon will be capable of when you want to take this Quality.\n\n4.07 - Clash Qualities\n________________________________________",
    "description": "The Digimon increases the bonus provided by Technician by +3, and can now also add their Technician bonus to any of the following: ● Manipulating the code into getting to protected areas. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "forcaMonstruosa",
    "name": "Monster Strength",
    "originalName": "Monster Strength",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Titan Power"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canControlClashAgainstAnySize": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "canControlAgainstAnySize": true,
      "moveClashAction": {
        "enabled": true,
        "targetSameSizeOrSmaller": true,
        "checkOptions": [
          {
            "stat": "cpu",
            "skill": "featsOfStrength",
            "tnFormula": "10 + opponentCpu"
          },
          {
            "type": "clashCheck",
            "tnFormula": "10 + opponentClash"
          }
        ],
        "result": {
          "failure": "O Opponent não é movido.",
          "success": "O Opponent if move junto with o Digimon, mas o Digimon só pode if mover half dos espaços.",
          "criticalSuccess": "O Opponent if move junto with o Digimon, without penalidade de movimento."
        }
      }
    },
    "effect": "The Digimon can control a Clash normally against any Size.\nWhen the Digimon takes the Move Clash Action, if the Opponent in the Clash is the same Size or smaller, the Digimon can force its Opponent to move with it. The Digimon must make a CPU (Feats of Strength) Check, with a TN equal to 10 + the Opponent’s CPU.\nAlternatively, the Digimon can make a Clash Check with a TN equal to 10 + the Opponent’s Clash.\nOn a Failure, the Opponent isn’t moved. On a Success, the opponent is moved with the Digimon, but the Digimon can only move half as many Spaces. On a Critical Success, the Digimon has no movement penalty.",
    "description": "The Digimon can control a Clash normally against any Size. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "imobilizacaoExposta",
    "name": "Exposing Hold",
    "originalName": "Exposing Hold",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao controlar um Clash with sucesso, ative esta Quality para expor o Opponent."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "triggerWhenControlsClash": true,
      "lastsUntilNextControlAttempt": true,
      "cannotUsePinThisTurn": true,
      "outsideDamageReduction": {
        "normal": "halfOpponentCpu",
        "support": "halfOpponentRam"
      }
    },
    "effect": "When the Digimon rolls to Control a Clash and succeeds, it can choose to Trigger this Quality until its next attempt to Control a Clash. It cannot take the Pin Clash Action this turn, but the Opponent only reduces the incoming Damage from outside Attacks by half their CPU, instead of half the combined CPUs. The same logic applies to [SUPPORT] Attacks, using half their RAM instead of half the combined RAMs.",
    "description": "When the Digimon rolls to Control a Clash and succeeds, it can choose to Trigger this Quality until its next attempt to Control a Clash. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "aQueimaRoupa",
    "name": "Point Blank",
    "originalName": "Point Blank",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canUseRangedAttacksInClash": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "canUseMeleeAndRangeAgainstOpponent": true,
      "rangedAttacksIgnoreAdjacentEnemyPenalty": true,
      "recoilEndsClash": true,
      "canMakeWeakAttackWithRange": true
    },
    "effect": "While in a Clash, the Digimon is allowed to use both [MELEE] and [RANGE] Attacks against their Opponent. If they use a [RANGE] Attack, they suffer no penalty for any Enemies within 1 Space.\nIf the Attack has [RECOIL], the Attack immediately ends the Clash and applies normal effects (though the target still rolls half their Dodge Pool). The Digimon can also make a Weak Attack with [RANGE] instead of [MELEE].",
    "description": "While in a Clash, the Digimon is allowed to use both [MELEE] and [RANGE] Attacks against their Opponent. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "escorregadio",
    "name": "Slippery",
    "originalName": "Slippery",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "canUseRamX2InsteadOfClash": true,
      "appliesWhenEnemyInitiatesClash": true,
      "appliesWhenEscapingClash": true,
      "result": {
        "higherThanInitiator": "A tentativa de Clash termina imediatamente e quem iniciou o Clash cannot tentar entrar em Clash with este Digimon novamente até a próxima rodada.",
        "lowerThanInitiator": "Quem iniciou o Clash controla imediatamente o Clash."
      }
    },
    "effect": "The Digimon is incredibly hard to get a hold of. When an Enemy attempts to initiate a Clash with the Digimon, or the Digimon attempts to use the Escape the Clash Action, it can make a RAMx2 Check instead of a Clash Check.\nIf the Digimon’s result is higher than the initiator's Clash Check, it instead immediately ends the attempted Clash and the one who initiated the Clash cannot attempt to Clash with the Digimon again until the next round.\nIf the Digimon’s result is lower than the initiator's Clash Check, the initiator immediately controls the Clash.",
    "description": "The Digimon is incredibly hard to get a hold of. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "arremessoEspecial",
    "name": "Fastball",
    "originalName": "Fastball",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "O Ally arremessado must estar disposto e ser pelo menos um tamanho menor, unless o Digimon também possua Monster Strength.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "areaIntercedeActionCost": 1
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Arremesse um aliado disposto dentro do seu alcance de Clash."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "clash": {
      "throwWillingAlly": true,
      "allyMinimumSizeSmaller": 1,
      "monsterStrengthIgnoresSizeRestriction": true,
      "thrownAllyTakesThrowDamageUnlessTumbler": true,
      "chargeInteraction": {
        "enabled": true,
        "thrownAllyCanInterruptWithChargeAttack": true,
        "thrownAllyDoesNotMoveDuringChargeAttack": true,
        "ifThrowTargetsMultipleEnemiesThrownAllyTargetsOne": true,
        "canForfeitOwnOncePerRoundAttackToUseAllyChargeInstead": true,
        "bypassesOwnOneAttackPerRoundRule": true
      },
      "twoActionUse": {
        "enabled": true,
        "actionCost": 2,
        "grantsThrownAllyAdditionalActionForAttack": 1,
        "canMakeInterruptPotentiallyFree": true
      },
      "areaIntercede": {
        "actionCost": 1
      }
    },
    "effect": "You may throw a willing ally that is at least one Size smaller than you within your Clash reach as 1 Action. The ally takes Damage as per normal throwing rules, unless they have Tumbler. If the Ally has an Attack with the [CHARGE] Tag and is being thrown at an Enemy, they may take an Interrupt Action to make a [CHARGE] Attack on the same Enemy, however the Digimon making the Attack doesn’t move. If the Throw targets multiple enemies, the Thrown Ally targets just one. Instead of making the standard [RANGE] Attack with Throw, the Digimon can also choose to forgo its Once per Round Attack and treat the Ally’s [CHARGE] Attack as it instead (which bypasses their own one Attack per Round Rule).\nThe Digimon can choose to use Fastball as 2 Actions to supply the Thrown Ally with an additional 1 Action for the purpose of the Attack, making the Interrupt Action potentially free.\nIf the Digimon also possesses the Monster Strength Quality, it is not restricted by Size.\nIn addition, the Digimon can now use Area Intercede as 1 Action instead of 2 Actions.",
    "description": "You may throw a willing ally that is at least one Size smaller than you within your Clash reach as 1 Action. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "sequestradorDeGigantes",
    "name": "Giant Hijacker",
    "originalName": "Giant Hijacker",
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Can only ser usado contra um Digimon pelo menos um tamanho maior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "A Digimon cannot entrar em Clash with outro Digimon compartilhando seu Space por meio of this Quality.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Tente subir em um inimigo muito maior para impedir que ele fuja livremente."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "cpu",
      "skill": "athletics",
      "tnFormula": "10 + targetRam - targetCpu",
      "notes": "Can only ser tentado contra um Digimon pelo menos um tamanho maior."
    },
    "result": {
      "criticalFailure": "",
      "failure": "The Digimon fails and suffers [SLOW 2] until the start of its next turn.",
      "success": "The Digimon is considered to share the same space as the Digimon, and moves with them whenever they move.",
      "criticalSuccess": ""
    },
    "clash": {
      "doesNotCountAsClash": true,
      "bothRetainFullActions": true,
      "noClashBenefitsOrDetriments": true,
      "smallerCanEndAsFreeAction": true,
      "largerRemoveCheck": {
        "actionCost": 1,
        "stat": "cpu",
        "tnFormula": "10 + smallerDigimonRam"
      }
    },
    "effect": "The Digimon can attempt to climb onto much larger enemies to make sure they cannot flee freely. As 1 Action while adjacent to the Target, the Digimon can make a CPU (Athletics) Check against a TN equal to 10 + the Target’s RAM - the Target’s CPU. A Digimon can only attempt to do this on a Digimon at least one Size larger than it.\nCritical Failure: The Digimon fails and suffers [SLOW 2] until the start of its next turn.\nFailure: Nothing happens.\nSuccess: The Digimon is considered to share the same space as the Digimon, and moves with them whenever they move.\nCritical Success: The larger Digimon’s TN to remove the smaller Digimon increases by +3.\nThe smaller Digimon can end this as a Free Action at any point or by using the Move or similar ability to leave the larger Digimon’s space. The larger Digimon must use 1 Action to make a CPU Check against a TN equal to 10 + the smaller Digimon’s RAM to shake the smaller Digimon off.\nThis does not count as a Clash. Both Digimon still retain full use of their Actions and do not suffer the detriments or gain the benefits granted by a Clash. A Digimon cannot Clash with another Digimon sharing its Space via this Quality.\n\n4.08 - Effect Qualities\n________________________________________\nEffect Qualities are used to give a special Effect to your Digimon’s Attacks, changing the tides of battle. When you purchase an Attack Effect, it is applied to one Attack and you cannot put more than one Attack Effect on a single Attack. There’s a lot to know about effects, but the most important things to note is that they have different Types, Potency, Durations, requirements, only affects Total Stats, and have different Categories depending on how expensive they are.\nEffect Types\nThere are three types of Effects:\nNegative Effects which weaken enemies\nPositive Effects which empower allies\nDamage Effects which inflict Damage to Enemies\nUnique Effects that are unique compared to other Effects, such as ignoring Resistance\nCaster and Target\nThe Effects can reference two individuals: the Caster and the Target. The Caster is the one that applied the Effect, and the Target is the one the Effect has been placed on. The Caster cannot affect itself with Attacks with an Effect Tag in any way, and instead must purchase the Overclock Quality if they want to use a Positive Effect on themselves.\n\nEffect Potency\nPotency is the power of the Effect which is then reduced by the Target’s Resistance. Many Effects will raise or lower a Target’s stats depending on the Effect’s Potency. Potency is only used for Negative and Positive Effects (as well as 2 Damage Effects), and will list a Derived Stat that is used to calculate Potency. Any bonus to Effect Potency, such as from Data Optimization: Effect Warrior, is applied after calculating base Potency, which is then reduced by Resistance. (This cannot reduce Potency to less than 2.)\nUnique Effects do not have a Potency, and are therefor not affected by Resistance.\nEffect Duration\nThe Duration of an Effect is determined by how well the Attack lands (which is covered in 9.02b), but the maximum Duration of Effects is 3. If a Digimon would use the same Effect Tag on a Digimon already affected by the Effect, they simply increase the Duration by the leftover Accuracy Dice to the maximum possible Duration (or keep the old Duration if it would last longer). The Duration counts down every round at the start of the Caster’s turn, unless stated otherwise in the effect.\n\nHow to Apply Effects\nAs mentioned in 3.03 - Digimon Attacks, if an Effect Tag is applied to a [SUPPORT] Attack, the Attack simply needs to land in order to apply the Effect. If an Effect Tag is applied to a [DAMAGE] Attack, it must deal at least 2 Damage after Armor to be applied, which does not include Unalterable Damage. Some Effects require the [DAMAGE]Tag to be applied.\nAltering Stats\nIf an Effect would alter Stats, it only affects Total Stats, not Base Stats. It also cannot lower a Total Stat below 1. A Digimon may benefit/suffer from multiple Effects as long as they have different names. A Digimon suffering from multiple Effects that reduce Stats will only reduce a Stat by the one with the highest potency. A Digimon suffering from [FRAIL 4], [WEAK 3] and [EXPLOIT 5] would only lower its Armor from [EXPLOIT 5].\nFlavouring Effects\nWhen an Effect is chosen, the intention suits the Digimon’s needs. [STUN] could be seen as the Caster slowing down time around the Target, [POISON] could be corrupting a Digimon’s data. The names of effects exist only to showcase their mechanical uses and inspirations.\nDamage Effects\nThere are four Effects that deal Unalterable Damage. The maximum amount of Unalterable Damage a Target can take from Effects is equal to its SV x 2 per Round.\n\nBasic, Advanced and Master Effects\nAttack Effects are separated into three categories based on their DP cost: Basic, Advanced, Master. The Digimon must be Stage 4 or higher to purchase Master Effects.\nCategorization of Effects\nIn each category, Attack Effects are noted as Positive (P), Negative (N), Damage (D) or Unique (U) in the columns. An Effect will also list if it has a Duration or not, as well as the Derived Stat used to calculate its Potency.",
    "description": "The Digimon can attempt to climb onto much larger enemies to make sure they cannot flee freely. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "efeitoBasico",
    "name": "Basic Effect",
    "originalName": "Basic Effect",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "The Digimon cannot comprar o mesmo Efeito duas vezes. Um ataque cannot ter mais de uma Tag de Efeito de Attack.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Inspiring Guidance",
      "Overclock"
    ],
    "choices": {
      "required": true,
      "type": "effectTagPerRank",
      "label": "Basic Effect Tag",
      "cannotRepeat": true,
      "options": [
        {
          "key": "root",
          "label": "[ROOT]",
          "type": "negative",
          "duration": true,
          "potency": "bit",
          "effect": "N\tMovement is reduced, to a minimum of 0.\tYes\tBIT"
        },
        {
          "key": "slow",
          "label": "[SLOW]",
          "type": "negative",
          "duration": true,
          "potency": "cpu",
          "effect": "N\tDodge is reduced.\tYes\tCPU"
        },
        {
          "key": "vague",
          "label": "[VAGUE]",
          "type": "negative",
          "duration": true,
          "potency": "bit",
          "effect": "N\tAccuracy is reduced.\tYes\tBIT"
        },
        {
          "key": "keen",
          "label": "[KEEN]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "effect": "P\tAccuracy is increased\tYes\tBIT"
        },
        {
          "key": "swift",
          "label": "[SWIFT]",
          "type": "positive",
          "duration": true,
          "potency": "ram",
          "effect": "P\tDodge is increased.\tYes\tRAM"
        },
        {
          "key": "tailwind",
          "label": "[TAILWIND]",
          "type": "positive",
          "duration": true,
          "potency": "ram",
          "effect": "P\tMovement is increased.\tYes\tRAM"
        },
        {
          "key": "cleanse",
          "label": "[CLEANSE]",
          "type": "unique",
          "duration": false,
          "potency": "",
          "effect": "U\tReduces the Duration of all Effects on the Target by 1 for being Successfully hit by this Attack, and for every 2 Successes the Caster gets over its Dodge.\nThe Caster can choose to only reduce the Duration of specific Effects when it uses the Attack by reducing its total Accuracy Successes by 1 (which is decided when the Attack is declared). For example, the Caster could choose to only reduce the Duration of"
        },
        {
          "key": "fear",
          "label": "[FEAR]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "U\tAccuracy is reduced by the Caster’s DOS + Potency Bonus on Attacks against the Caster. The Target also cannot initiate or control a Clash with the Caster. If the Target is afflicted by multiple uses of [FEAR], it will only be affected by the most recent Caster. If the Attacker uses an Area Attack which has the Caster as a Target, the Accuracy is reduced by half the Caster’s DOS instead. This Effect immediately ends if the Caster applies"
        },
        {
          "key": "doom",
          "label": "[DOOM]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": ",[DISTRACT] and [POISON].\nIf the Target is an Ally of the Caster, the Target rolls its Health as a Pool. The Duration of Effects is reduced by 1 for every 3 Successes between the combined results of the Caster’s and the Target’s Pools instead.\nA [CLEANSE] Area Attack has the total number of Accuracy Successes reduced by 1, and the Caster must declare if the Attack affects Allies or Enemies.\tNo\t—"
        },
        {
          "key": "taunt",
          "label": "[TAUNT]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "to the Target.\nWhen the Target willingly moves towards the Caster, the full distance it can Move is reduced by 1.\nAt the end of the Target’s turns, or as 1 Action Once per Turn (not both), the Target can make a DOS (Bravery) Check, with a TN of 12 + the Caster’s DOS.\nCritical Failure/Failure: Nothing happens.\nSuccess: The Effect’s Duration is reduced by 1.\nCritical Success: The Effect immediately ends.\nA [FEAR] Area Attack reduces the Value of this Effect by 1.\tYes\t—\n[DOOM]\tU\tIf the Target would gain Wound Boxes or Temporary Wound Boxes, deduct from the Value of this Effect instead, which equals the Caster’s DOS + Potency Bonus. This Effect ends early if its Potency is brought to 0.\nAt the end of the Target’s turns, or as 1 Action Once per Turn (not both), the Target can make a CPU (Endurance) Check, with a TN of 12 + the Caster’s DOS.\nCritical Failure/Failure: Nothing happens.\nSuccess: The Effect’s Value is reduced by 1.\nCritical Success: The Effect’s Value is reduced by 3.\nA [DOOM] Area Attack reduces the Value of this Effect by 1.\tYes\t—\n \n\n[TAUNT]\tU\tAccuracy is reduced by the Caster’s CPU + Potency Bonus on Attacks against anyone but the Caster. If the Target is afflicted by multiple uses of [TAUNT], it will only be affected by the most recent Caster. If the Attacker uses an Area Attack which has the Caster as a Target, the Accuracy is reduced by half the Caster’s CPU instead. This Effect immediately ends if the Caster applies [FEAR] to the Target.\nWhen the Target willingly moves away from the Caster, the full distance it can Move is reduced by 1.\nAt the end of the Target’s turns, or as 1 Action Once per Turn (not both), the Target can make a DOS (Fortitude) Check, with a TN of 12 + the Caster’s CPU.\nCritical Failure/Failure: Nothing happens.\nSuccess: The Effect’s Duration is reduced by 1.\nCritical Success: The Effect immediately ends.\nA [TAUNT] Area Attack reduces the Value of this Effect by 1.\tYes\t—"
        },
        {
          "key": "pull",
          "label": "[PULL]",
          "type": "unique",
          "duration": false,
          "potency": "",
          "effect": "U\tThe Target is moved towards the Caster an amount of Spaces equal to the Caster’s DOS + Potency Bonus to the nearest unoccupied Space it can fit. The amount of Spaces moved is also reduced by the Target’s Size.\nHuge: -1\nGigantic: -3\nColossal: -5\nOn a [SUPPORT] Attack, the amount of Spaces moved increases by 1 for every 2 Successes over the Target’s Dodge.\nIf the Target is an Ally of the Caster, the Target rolls its Health as a Pool. The Spaces moved can be increased by 1 for every 3 Successes between the combined results of the Caster’s and the Target’s Pools instead.\nA [PULL] Area Attack has the total number of Spaces pulled reduced by 2, and the Caster must declare if the Attack affects Allies or Enemies.\tNo\t—"
        },
        {
          "key": "push",
          "label": "[PUSH]",
          "type": "unique",
          "duration": false,
          "potency": "",
          "effect": "U\tThe Target is moved away from the Caster an amount of Spaces equal to the Caster’s CPU, or half as much on a [RANGE] Attack, then + Potency Bonus. The amount of Spaces moved is also reduced by the Target’s Size.\nHuge: -1\nGigantic: -3\nColossal: -5\nOn a [SUPPORT] Attack, the amount of Spaces moved increases by 1 for every 2 Successes over the Target’s Dodge.\nIf the Target is an Ally of the Caster, the Target rolls its Health as a Pool. The Spaces moved can be increased by 1 for every 3 Successes between the combined results of the Caster’s and the Target’s Pools instead.\nA [PUSH] Area Attack has the total number of Spaces pulled reduced by 2, and the Caster must declare if the Attack affects Allies or Enemies.\tNo\t—"
        }
      ]
    },
    "attackModifier": {
      "grantsTags": [
        "root",
        "slow",
        "vague",
        "keen",
        "swift",
        "tailwind",
        "cleanse",
        "fear",
        "doom",
        "taunt",
        "pull",
        "push"
      ],
      "appliesTo": "oneAttackPerPurchasedEffect",
      "onlyOneEffectTagPerAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effectRules": {
      "cannotAffectCasterWithEffectTagAttack": true,
      "positiveSelfUseRequiresOverclock": true,
      "supportAttackAppliesOnHit": true,
      "damageAttackRequiresDamageAfterArmor": 2,
      "maxEffectDuration": 3,
      "potencyReducedByResistance": true,
      "potencyMinimumAfterBonuses": 2,
      "uniqueEffectsHaveNoPotency": true,
      "statChangesAffectTotalStatsOnly": true,
      "totalStatsCannotDropBelow": 1,
      "maxUnalterableDamageFromEffectsPerRound": "targetSv * 2"
    },
    "effect": "A Digimon may apply an Attack Effect Tag it purchases to one Attack. It cannot purchase the same Effect twice.\n\nEffect\tType\tDescription\tDuration\tPotency\n[ROOT]\tN\tMovement is reduced, to a minimum of 0.\tYes\tBIT\n[SLOW]\tN\tDodge is reduced.\tYes\tCPU\n[VAGUE]\tN\tAccuracy is reduced.\tYes\tBIT\n[KEEN]\tP\tAccuracy is increased\tYes\tBIT\n[SWIFT]\tP\tDodge is increased.\tYes\tRAM\n[TAILWIND]\tP\tMovement is increased.\tYes\tRAM\n[CLEANSE]\tU\tReduces the Duration of all Effects on the Target by 1 for being Successfully hit by this Attack, and for every 2 Successes the Caster gets over its Dodge.\nThe Caster can choose to only reduce the Duration of specific Effects when it uses the Attack by reducing its total Accuracy Successes by 1 (which is decided when the Attack is declared). For example, the Caster could choose to only reduce the Duration of [DOOM],[DISTRACT] and [POISON].\nIf the Target is an Ally of the Caster, the Target rolls its Health as a Pool. The Duration of Effects is reduced by 1 for every 3 Successes between the combined results of the Caster’s and the Target’s Pools instead.\nA [CLEANSE] Area Attack has the total number of Accuracy Successes reduced by 1, and the Caster must declare if the Attack affects Allies or Enemies.\tNo\t—\n\n[FEAR]\tU\tAccuracy is reduced by the Caster’s DOS + Potency Bonus on Attacks against the Caster. The Target also cannot initiate or control a Clash with the Caster. If the Target is afflicted by multiple uses of [FEAR], it will only be affected by the most recent Caster. If the Attacker uses an Area Attack which has the Caster as a Target, the Accuracy is reduced by half the Caster’s DOS instead. This Effect immediately ends if the Caster applies [TAUNT] to the Target.\nWhen the Target willingly moves towards the Caster, the full distance it can Move is reduced by 1.\nAt the end of the Target’s turns, or as 1 Action Once per Turn (not both), the Target can make a DOS (Bravery) Check, with a TN of 12 + the Caster’s DOS.\nCritical Failure/Failure: Nothing happens.\nSuccess: The Effect’s Duration is reduced by 1.\nCritical Success: The Effect immediately ends.\nA [FEAR] Area Attack reduces the Value of this Effect by 1.\tYes\t—\n[DOOM]\tU\tIf the Target would gain Wound Boxes or Temporary Wound Boxes, deduct from the Value of this Effect instead, which equals the Caster’s DOS + Potency Bonus. This Effect ends early if its Potency is brought to 0.\nAt the end of the Target’s turns, or as 1 Action Once per Turn (not both), the Target can make a CPU (Endurance) Check, with a TN of 12 + the Caster’s DOS.\nCritical Failure/Failure: Nothing happens.\nSuccess: The Effect’s Value is reduced by 1.\nCritical Success: The Effect’s Value is reduced by 3.\nA [DOOM] Area Attack reduces the Value of this Effect by 1.\tYes\t—\n\n[TAUNT]\tU\tAccuracy is reduced by the Caster’s CPU + Potency Bonus on Attacks against anyone but the Caster. If the Target is afflicted by multiple uses of [TAUNT], it will only be affected by the most recent Caster. If the Attacker uses an Area Attack which has the Caster as a Target, the Accuracy is reduced by half the Caster’s CPU instead. This Effect immediately ends if the Caster applies [FEAR] to the Target.\nWhen the Target willingly moves away from the Caster, the full distance it can Move is reduced by 1.\nAt the end of the Target’s turns, or as 1 Action Once per Turn (not both), the Target can make a DOS (Fortitude) Check, with a TN of 12 + the Caster’s CPU.\nCritical Failure/Failure: Nothing happens.\nSuccess: The Effect’s Duration is reduced by 1.\nCritical Success: The Effect immediately ends.\nA [TAUNT] Area Attack reduces the Value of this Effect by 1.\tYes\t—\n[PULL]\tU\tThe Target is moved towards the Caster an amount of Spaces equal to the Caster’s DOS + Potency Bonus to the nearest unoccupied Space it can fit. The amount of Spaces moved is also reduced by the Target’s Size.\nHuge: -1\nGigantic: -3\nColossal: -5\nOn a [SUPPORT] Attack, the amount of Spaces moved increases by 1 for every 2 Successes over the Target’s Dodge.\nIf the Target is an Ally of the Caster, the Target rolls its Health as a Pool. The Spaces moved can be increased by 1 for every 3 Successes between the combined results of the Caster’s and the Target’s Pools instead.\nA [PULL] Area Attack has the total number of Spaces pulled reduced by 2, and the Caster must declare if the Attack affects Allies or Enemies.\tNo\t—\n\n[PUSH]\tU\tThe Target is moved away from the Caster an amount of Spaces equal to the Caster’s CPU, or half as much on a [RANGE] Attack, then + Potency Bonus. The amount of Spaces moved is also reduced by the Target’s Size.\nHuge: -1\nGigantic: -3\nColossal: -5\nOn a [SUPPORT] Attack, the amount of Spaces moved increases by 1 for every 2 Successes over the Target’s Dodge.\nIf the Target is an Ally of the Caster, the Target rolls its Health as a Pool. The Spaces moved can be increased by 1 for every 3 Successes between the combined results of the Caster’s and the Target’s Pools instead.\nA [PUSH] Area Attack has the total number of Spaces pulled reduced by 2, and the Caster must declare if the Attack affects Allies or Enemies.\tNo\t—",
    "description": "A Digimon may apply an Attack Effect Tag it purchases to one Attack. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "efeitoAvancado",
    "name": "Advanced Effect",
    "originalName": "Advanced Effect",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "The Digimon cannot comprar o mesmo Efeito duas vezes. Um ataque cannot ter mais de uma Tag de Efeito de Attack.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Inspiring Guidance",
      "Overclock"
    ],
    "choices": {
      "required": true,
      "type": "effectTagPerRank",
      "label": "Advanced Effect Tag",
      "cannotRepeat": true,
      "options": [
        {
          "key": "confuse",
          "label": "[CONFUSE]",
          "type": "negative",
          "duration": true,
          "potency": "special",
          "effect": "N\tThe Potency of this Effect is the Target’s highest Derived Stat.\nThe Stat associated with that Derived Stat is reduced. For example, if the Target’s highest Derived Stat is BIT, it reduces Accuracy.\nIf the Target has 2 or more Derived Stat that are the same value, it reduces the highest Stat. If the Target has 2 or more Main Stats that are the same value in this instance, the Caster chooses which Stat to reduce. \tYes\tSpecial"
        },
        {
          "key": "distract",
          "label": "[DISTRACT]",
          "type": "negative",
          "duration": true,
          "potency": "ram",
          "extraActionRequired": true,
          "effect": "N\tAccuracy and Dodge are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tRAM"
        },
        {
          "key": "dull",
          "label": "[DULL]",
          "type": "negative",
          "duration": true,
          "potency": "cpu",
          "effect": "N\tDamage is reduced.\tYes\tCPU"
        },
        {
          "key": "frail",
          "label": "[FRAIL]",
          "type": "negative",
          "duration": true,
          "potency": "dos",
          "effect": "N\tArmor is reduced.\tYes\tDOS"
        },
        {
          "key": "heavy",
          "label": "[HEAVY]",
          "type": "negative",
          "duration": true,
          "potency": "dos",
          "effect": "N\tMovement is reduced, unless any of the below apply.\nIf the Target has Extra Movement and/or Teleport, it loses the benefits of those Qualities instead.\nHowever, if the Digimon has Advanced Mobility, it loses the benefits instead of losing the Extra Movement associated with that Movement (for example, a Digimon with Extra Movement: Swimmer and Advanced Mobility: Swimmer will lose Advanced Mobility: Swimmer first).\nSimilarly, if the Digimon has Transporter, it loses the benefits of that instead of Teleport.\nThe Target can still take the Resist Action to remove this Effect, even if the Potency isn’t affecting Movement.\tYes\tDOS"
        },
        {
          "key": "nimble",
          "label": "[NIMBLE]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "P\tAccuracy and Dodge are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT"
        },
        {
          "key": "sharpen",
          "label": "[SHARPEN]",
          "type": "positive",
          "duration": true,
          "potency": "ram",
          "effect": "P\tDamage is increased.\tYes\tRAM"
        },
        {
          "key": "sturdy",
          "label": "[STURDY]",
          "type": "positive",
          "duration": true,
          "potency": "dos",
          "effect": "P\tArmor is increased.\tYes\tDOS"
        },
        {
          "key": "burn",
          "label": "[BURN]",
          "type": "damage",
          "duration": true,
          "potency": "",
          "requiresDamageTag": true,
          "effect": "D\tWhenever the Target moves, it takes Unalterable Damage at the end of its Movement for each Space moved. If it is moved unwillingly (such as by [PUSH] or being thrown), it only takes Damage for each 2 Spaces it moved.\nAn Attack with this Tag must have the [DAMAGE] Tag.\nThe Damage of this Effect is reduced by 1 for every other Damage Effect on the Target.\tYes\t—"
        },
        {
          "key": "freeze",
          "label": "[FREEZE]",
          "type": "damage",
          "duration": true,
          "potency": "",
          "requiresDamageTag": true,
          "effect": "D\tThe Target takes 2 Unalterable Damage at the end of each of its turns for each Action it took that wasn’t related to moving. During Clashing, if the Digimon only has access to the single Clash Action, it takes 4 Unalterable Damage at the end of their turn if they do not regain use of their 2nd Action. Taking the Escape the Clash Action counts as an Action related to moving for the purpose of this Effect.\nAn Attack with this Tag must have the [DAMAGE] Tag.\nThe Damage of this Effect is reduced by 1 for every other Damage Effect on the Target.\tYes\t—"
        },
        {
          "key": "poison",
          "label": "[POISON]",
          "type": "damage",
          "duration": true,
          "potency": "special",
          "effect": "D\tThe Target takes Unalterable Damage equal to its CPU at the end of each of its turns.\nThe Damage of this Effect is reduced by 1 for every other Damage Effect on the Target.\tYes\tSpecial"
        },
        {
          "key": "haste",
          "label": "[HASTE]",
          "type": "unique",
          "duration": "special",
          "potency": "",
          "extraActionRequired": true,
          "onlyAffectsAllies": true,
          "effect": "U\tThe Target gains 1 extra Action, and gains this Effect until the end of its next turn or until that Action is expended. The Target can lose the extra Action if this Effect is removed before the Duration ends. If the Target uses this extra Action to make an Attack, it bypasses the “Once per Round” rule.\nAn Attack with this Tag requires 1 extra Action, and only affects Allies.\nA Digimon may not have [HASTE] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move. The Digimon requires 2 Battery to trigger the Area Attack this way.\tSpecial\t—"
        },
        {
          "key": "immune",
          "label": "[IMMUNE]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "onlyAffectsAllies": true,
          "effect": "U\tReduces the Duration of incoming Negative or Damage Effects by 1, to a minimum of 1, for the Duration.\nThis Attack only affects Allies.\tYes\t—"
        }
      ]
    },
    "attackModifier": {
      "grantsTags": [
        "confuse",
        "distract",
        "dull",
        "frail",
        "heavy",
        "nimble",
        "sharpen",
        "sturdy",
        "burn",
        "freeze",
        "poison",
        "haste",
        "immune"
      ],
      "appliesTo": "oneAttackPerPurchasedEffect",
      "onlyOneEffectTagPerAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effectRules": {
      "cannotAffectCasterWithEffectTagAttack": true,
      "positiveSelfUseRequiresOverclock": true,
      "supportAttackAppliesOnHit": true,
      "damageAttackRequiresDamageAfterArmor": 2,
      "maxEffectDuration": 3,
      "potencyReducedByResistance": true,
      "potencyMinimumAfterBonuses": 2,
      "uniqueEffectsHaveNoPotency": true,
      "statChangesAffectTotalStatsOnly": true,
      "totalStatsCannotDropBelow": 1,
      "maxUnalterableDamageFromEffectsPerRound": "targetSv * 2"
    },
    "effect": "A Digimon may apply an Attack Effect Tag it purchases to one Attack. It cannot purchase the same Effect twice.\n\nEffect\tType\tDescription\tDuration\tPotency\n[CONFUSE]\tN\tThe Potency of this Effect is the Target’s highest Derived Stat.\nThe Stat associated with that Derived Stat is reduced. For example, if the Target’s highest Derived Stat is BIT, it reduces Accuracy.\nIf the Target has 2 or more Derived Stat that are the same value, it reduces the highest Stat. If the Target has 2 or more Main Stats that are the same value in this instance, the Caster chooses which Stat to reduce. \tYes\tSpecial\n[DISTRACT]\tN\tAccuracy and Dodge are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tRAM\n[DULL]\tN\tDamage is reduced.\tYes\tCPU\n[FRAIL]\tN\tArmor is reduced.\tYes\tDOS\n\n[HEAVY]\tN\tMovement is reduced, unless any of the below apply.\nIf the Target has Extra Movement and/or Teleport, it loses the benefits of those Qualities instead.\nHowever, if the Digimon has Advanced Mobility, it loses the benefits instead of losing the Extra Movement associated with that Movement (for example, a Digimon with Extra Movement: Swimmer and Advanced Mobility: Swimmer will lose Advanced Mobility: Swimmer first).\nSimilarly, if the Digimon has Transporter, it loses the benefits of that instead of Teleport.\nThe Target can still take the Resist Action to remove this Effect, even if the Potency isn’t affecting Movement.\tYes\tDOS\n[NIMBLE]\tP\tAccuracy and Dodge are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT\n[SHARPEN]\tP\tDamage is increased.\tYes\tRAM\n[STURDY]\tP\tArmor is increased.\tYes\tDOS\n[BURN]\tD\tWhenever the Target moves, it takes Unalterable Damage at the end of its Movement for each Space moved. If it is moved unwillingly (such as by [PUSH] or being thrown), it only takes Damage for each 2 Spaces it moved.\nAn Attack with this Tag must have the [DAMAGE] Tag.\nThe Damage of this Effect is reduced by 1 for every other Damage Effect on the Target.\tYes\t—\n\n[FREEZE]\tD\tThe Target takes 2 Unalterable Damage at the end of each of its turns for each Action it took that wasn’t related to moving. During Clashing, if the Digimon only has access to the single Clash Action, it takes 4 Unalterable Damage at the end of their turn if they do not regain use of their 2nd Action. Taking the Escape the Clash Action counts as an Action related to moving for the purpose of this Effect.\nAn Attack with this Tag must have the [DAMAGE] Tag.\nThe Damage of this Effect is reduced by 1 for every other Damage Effect on the Target.\tYes\t—\n[POISON]\tD\tThe Target takes Unalterable Damage equal to its CPU at the end of each of its turns.\nThe Damage of this Effect is reduced by 1 for every other Damage Effect on the Target.\tYes\tSpecial\n[HASTE]\tU\tThe Target gains 1 extra Action, and gains this Effect until the end of its next turn or until that Action is expended. The Target can lose the extra Action if this Effect is removed before the Duration ends. If the Target uses this extra Action to make an Attack, it bypasses the “Once per Round” rule.\nAn Attack with this Tag requires 1 extra Action, and only affects Allies.\nA Digimon may not have [HASTE] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move. The Digimon requires 2 Battery to trigger the Area Attack this way.\tSpecial\t—\n[IMMUNE]\tU\tReduces the Duration of incoming Negative or Damage Effects by 1, to a minimum of 1, for the Duration.\nThis Attack only affects Allies.\tYes\t—",
    "description": "A Digimon may apply an Attack Effect Tag it purchases to one Attack. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "orientacaoInspiradora",
    "name": "Inspiring Guidance",
    "originalName": "Inspiring Guidance",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires 1 Rank of Basic Effect, Advanced Effect ou Master Effect. Can only ser aplicada a um ataque [SUPPORT] com Positive Effect.",
      "qualityNames": "Basic Effect, Advanced Effect, Master Effect"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[SUPPORT] Attack with Positive Effect and [GUIDING]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "guiding"
      ],
      "appliesTo": "oneSupportAttackWithPositiveEffect",
      "maxRanksEqualDpSpentOnPositiveEffect": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "persuasion",
      "tnFormula": "15 - casterDos"
    },
    "result": {
      "criticalFailure": "",
      "failure": "The Duration of the Positive Effect is reduced by 1 (to a minimum of 1).",
      "success": "The Target also gains a temporary pool of d6s equal to the Digimon’s Ranks in this Quality known as Guiding Dice.",
      "criticalSuccess": ""
    },
    "effect": "1 Rank of BASIC EFFECT, ADVANCED EFFECT or MASTER EFFECT\nThe Digimon may apply the [GUIDING] Tag to one [SUPPORT] Attack with a Positive Effect.\n[GUIDING] may only be applied to one Attack per Digimon, and the number of Ranks a Digimon can purchase for this Quality is equal to the DP spent on the Positive Effect on the same Attack. For example, 2 Ranks can be purchased if the Effect is [SHARPEN] or [SHIELD], but only 1 Rank could be purchased if the Effect is [KEEN].\nWhen the Digimon would successfully apply an Effect to an Ally with a [GUIDING] Attack, the Digimon also rolls a BIT (Persuasion) Check. The TN equals 15 - the Digimon’s DOS.\nCritical Failure: The Duration of the Positive Effect is reduced by 1 (to a minimum of 1).\nFailure: The Attack occurs normally.\nSuccess: The Target also gains a temporary pool of d6s equal to the Digimon’s Ranks in this Quality known as Guiding Dice.\nCritical Success: The Target gains one additional Guiding Dice.\nFor the Duration of the Positive Effect (minimum duration of 1 round), the Target can add any number of Guiding Dice to any rolled Pool. When a Guiding Dice is used, it does not regenerate, and the benefit ends when all Guiding Dice are diminished or the Positive Effect ends.\nOnly one Digimon can be benefiting from this Quality at a time. If the Attack would be made as an Area Attack, the Attacker chooses one target to benefit from this. If this Tag is placed on a Signature Move, it grants additional Guiding Dice equal to the Digimon’s Battery, no matter what the Check result is.",
    "description": "1 Rank of BASIC EFFECT, ADVANCED EFFECT or MASTER EFFECT The Digimon may apply the [GUIDING] Tag to one [SUPPORT] Attack with a Positive Effect. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "overclock",
    "name": "Overclock",
    "originalName": "Overclock",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Ao comprar esta Quality, o Digimon também deve comprar um Positive Effect que exija uma Derived Stat do Caster, pagando o PD normalmente. Esse Efeito é aplicado a esta Quality instead of a um ataque, e o Digimon cannot comprar esse Efeito novamente.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "positiveCasterDerivedEffect",
      "label": "Positive Effect de Overclock",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Use Overclock para aplicar em si mesmo o Positive Effect escolhido."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "chosenEffectDerivedStat",
      "skill": "",
      "tnFormula": "10 + casterSv",
      "extraActionIfEffectRequiresExtraAction": true
    },
    "result": {
      "criticalFailure": "",
      "failure": "Nothing happens and the Digimon cannot use this Quality again until the end of Combat.",
      "success": "the Digimon is affected by the Attack Effect using its own Potency until the start of its next turn.",
      "criticalSuccess": ""
    },
    "effect": "When taking this Quality, the Digimon must also purchase a Positive Effect that requires a Derived Stat from the Caster, spending DP as normal. That Effect is applied to this Quality instead of an Attack, and the Digimon cannot purchase that Effect again.\nAs 1 Action, the Digimon can make a Check using the Derived Stat associated with the Attack Effect. The TN equals 10 + the Digimon's SV.\nCritical Failure: Nothing happens and the Digimon cannot use this Quality again until the end of Combat.\nFailure: Nothing happens.\nSuccess: the Digimon is affected by the Attack Effect using its own Potency until the start of its next turn.\nCritical Success: The Digimon is affected for 3 rounds, lasting until the end of its turn on the 3rd Round.\nIf the purchased Effect requires an additional Action, using this Quality does as well.",
    "description": "When taking this Quality, the Digimon must also purchase a Positive Effect that requires a Derived Stat from the Caster, spending DP as normal. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "escudoProtetor",
    "name": "Protecting Shield",
    "originalName": "Protecting Shield",
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": false
    },
    "stageRequirement": {
      "enabled": false,
      "minimum": "",
      "maximum": ""
    },
    "requirements": {
      "text": "Can only ser aplicada a um ataque [SUPPORT]. Cannot ser adquirida como parte de Overclock.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "The Digimon cannot ter [SHIELD] e outra Tag de Efeito no mesmo ataque. A Digimon with esta Quality cannot if beneficiar de [SHIELD] concedido por esta Quality.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[SUPPORT] Attack with [SHIELD]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "shield"
      ],
      "appliesTo": "oneSupportAttack",
      "cannotHaveOtherEffectTag": true,
      "cannotBeTakenWithOverclock": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "usesFormula": {
      "valueFromRank": true,
      "valuePerRank": 1,
      "recharge": "combat"
    },
    "shield": {
      "temporaryWoundBoxesFormula": "casterBit + stage",
      "reducedByResistance": true,
      "treatedAsPositiveEffectWithDuration": true,
      "durationEndsIfTemporaryWoundsLost": true,
      "cannotBenefitSelfFromThisQuality": true,
      "canShareWithAreaOnlyOnSignatureSupportMove": true,
      "batteryRequiredForArea": 2
    },
    "effect": "The Digimon may apply the [SHIELD] Tag to one [SUPPORT] Attack.\nA [SHIELD] Attack provides Temporary Wound Boxes equal to the Caster’s BIT + Stage (which is reduced by Resistance). This is treated and applied as a Positive Effect with a Duration, but the Duration ends early if the Target loses all Temporary Wound Boxes granted by the Effect. The Digimon cannot have the [SHIELD] Tag and another Effect Tag on the same Attack, and you cannot take it as part of the Overclock Quality.\nThe Digimon can only use an Attack with the [SHIELD] Tag a limited number of times per Combat equal to its Ranks in this Quality. A Digimon may not have [SHIELD] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\nA Digimon with this Quality cannot benefit from [SHIELD] granted by this Quality.\n\n5.0 - Champion Qualities\n________________________________________\nThe following Qualities are available to Champion Digimon and above, presented in the same order of categories as before.\n5.01 - Core Qualities\n________________________________________",
    "description": "The Digimon may apply the [SHIELD] Tag to one [SUPPORT] Attack. ",
    "tier": "starting",
    "originalTier": "Starting Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Starting Quality"
    }
  },
  {
    "id": "algoritmo",
    "name": "Algorithm",
    "originalName": "Algorithm",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 0,
        "adult": 1,
        "perfect": 2,
        "ultimate": 3,
        "ultimatePlus": 3
      }
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Incompatible with qualquer outra Quality de Weaponmento de Digizóide e qualquer outra Quality de Força Crescente.",
      "qualityNames": "Any other Weaponmento de Digizóide, Any other Força Crescente"
    },
    "requiredFor": [
      "Pure Digizoid Weaponry",
      "Pure Overwrite"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "ignoresWeaponInstinctIncompatibility": true,
      "weaponAndInstinctRankLimitFormula": "algorithmRanks + 1"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other DIGIZOID WEAPONRY\nAny other GAIN FORCE\nCore Discount Available\nThe Digimon ignores the incompatibility between Weapon and Instinct, and can purchase a number of Ranks in each Quality equal to its Ranks in this Quality + 1.\nA Digimon must purchase 3 Ranks in this Quality in order to purchase Pure Digizoid Weaponry or Pure Overwrite.\nThe number of Ranks a Digimon can take in this Quality is based on its Stage (see table).\n\nStage\t# of Ranks\nRookie (and below)\t0\nChampion\t1\nUltimate\t2\nMega (and above)\t3\n\nAn Example\nA Digimon with 1 Rank in this Quality can purchase 2 Ranks in Weapon and Instinct, but it cannot purchase the next Rank in either Quality until this Quality’s rank increases as well.",
    "description": "Any other DIGIZOID WEAPONRY Any other GAIN FORCE Core Discount Available The Digimon ignores the incompatibility between Weapon and Instinct, and can purchase a number of Ranks in each Quality equal to its Ranks in this Quality + 1. "
  },
  {
    "id": "mobilidadeAvancada",
    "name": "Advanced Mobility",
    "originalName": "Advanced Mobility",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 5,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e 1 Rank of Extra Movement.",
      "qualityNames": "Extra Movement"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Improved Extra Movement",
      "cannotRepeat": true,
      "options": [
        {
          "key": "flight",
          "label": "Flight",
          "originalLabel": "Flight",
          "requirements": {
            "text": "Requires Extra Movement: Flight.",
            "qualityNames": "Extra Movement: Flight"
          },
          "effect": "The Digimon is not slowed down by even the harshest of winds while it’s in the air and it loses its Flying Speed while it is at a quarter of its Maximum Wound Boxes or below instead of half."
        },
        {
          "key": "digger",
          "label": "Digger",
          "originalLabel": "Digger",
          "requirements": {
            "text": "Requires Extra Movement: Digger.",
            "qualityNames": "Extra Movement: Digger"
          },
          "effect": "The Digimon is now capable of digging through the majority of surfaces without being slowed down. It can dig through harder materials such as stone, ice or even some softer metals but this is now treated as Difficult Terrain. When the Digimon digs through such hard materials, it leaves a tunnel behind equal to its Size (such as a 3x3 Space tunnel for a Gigantic Digimon) that other Digimon (or even humans) can pass through. Passing through such a tunnel counts as Difficult Terrain of an Element associated with the material (most commonly Earth) unless the Digimon has Extra Movement: Digger.\n\nThe Digimon’s tremor-based sight now increases to its full Range while underground, and can even feel them while above ground (as long as it is standing on some form of terrain) up to a number of spaces equal to half its Range."
        },
        {
          "key": "swimmer",
          "label": "Swimmer",
          "originalLabel": "Swimmer",
          "requirements": {
            "text": "Requires Extra Movement: Swimmer.",
            "qualityNames": "Extra Movement: Swimmer"
          },
          "effect": "The Digimon can now breathe underwater, or hold its breath for an indefinite period of time. It no longer needs to take the Hold its Breath Action to prevent Damage.\nThe Digimon is capable of swimming without being slowed down by harsh currents. The Digimon can also use this type of Movement to move through liquids other than water, such as lava or liquid metal, with restrictions from the GM (such as the appropriate Naturewalk, treating the liquid like Difficult Terrain, or even the danger of taking Damage.)\nThe Digimon ignores any penalties to see other creatures underwater while it is also underwater (such as darkness, murky water or [BLIND].)"
        },
        {
          "key": "wallclimber",
          "label": "Wallclimber",
          "originalLabel": "Wallclimber",
          "requirements": {
            "text": "Requires Extra Movement: Wallclimber.",
            "qualityNames": "Extra Movement: Wallclimber"
          },
          "effect": "The Digimon is now capable of walking on ceilings, and cannot be slowed or slip off any normal wall surfaces. The Digimon also becomes immune to [ROOT]."
        },
        {
          "key": "jumper",
          "label": "Jumper",
          "originalLabel": "Jumper",
          "requirements": {
            "text": "Requires Extra Movement: Jumper.",
            "qualityNames": "Extra Movement: Jumper"
          },
          "effect": "The Digimon no longer has to Jump in a straight line, able to curve itself in the air. The Digimon also gains bonus Damage reduction equal to its RAM when taking damage from falling or being thrown. If the Digimon also possesses the Tumbler Quality, it negates all Damage from falling.\n\nThe Digimon can use its Jump Movement to move in and out of Difficult Terrain as a Move Action rather than Difficult Move as long as it is not at half its Maximum Wound Boxes or fewer."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Each time you purchase a rank of this Quality, choose an Extra Movement option you already have. You gain a different Effect based on your choice. A Digimon cannot choose the same effect twice.\n\nFlight \tThe Digimon is not slowed down by even the harshest of winds while it’s in the air and it loses its Flying Speed while it is at a quarter of its Maximum Wound Boxes or below instead of half.\nDigger \tThe Digimon is now capable of digging through the majority of surfaces without being slowed down. It can dig through harder materials such as stone, ice or even some softer metals but this is now treated as Difficult Terrain. When the Digimon digs through such hard materials, it leaves a tunnel behind equal to its Size (such as a 3x3 Space tunnel for a Gigantic Digimon) that other Digimon (or even humans) can pass through. Passing through such a tunnel counts as Difficult Terrain of an Element associated with the material (most commonly Earth) unless the Digimon has Extra Movement: Digger.\n\nThe Digimon’s tremor-based sight now increases to its full Range while underground, and can even feel them while above ground (as long as it is standing on some form of terrain) up to a number of spaces equal to half its Range.\n\nSwimmer\tThe Digimon can now breathe underwater, or hold its breath for an indefinite period of time. It no longer needs to take the Hold its Breath Action to prevent Damage.\nThe Digimon is capable of swimming without being slowed down by harsh currents. The Digimon can also use this type of Movement to move through liquids other than water, such as lava or liquid metal, with restrictions from the GM (such as the appropriate Naturewalk, treating the liquid like Difficult Terrain, or even the danger of taking Damage.)\nThe Digimon ignores any penalties to see other creatures underwater while it is also underwater (such as darkness, murky water or [BLIND].)\nWallclimber\tThe Digimon is now capable of walking on ceilings, and cannot be slowed or slip off any normal wall surfaces. The Digimon also becomes immune to [ROOT].\nJumper\tThe Digimon no longer has to Jump in a straight line, able to curve itself in the air. The Digimon also gains bonus Damage reduction equal to its RAM when taking damage from falling or being thrown. If the Digimon also possesses the Tumbler Quality, it negates all Damage from falling.\n\nThe Digimon can use its Jump Movement to move in and out of Difficult Terrain as a Move Action rather than Difficult Move as long as it is not at half its Maximum Wound Boxes or fewer.",
    "description": "Each time you purchase a rank of this Quality, choose an Extra Movement option you already have. "
  },
  {
    "id": "arrancada",
    "name": "Sprint",
    "originalName": "Sprint",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e 1 or more Ranks of Accelerate.",
      "qualityNames": "Accelerate"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Dobre seu Movement para uma Action que envolva Movement."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "When the Digimon takes an Action which involves its Movement, it can choose to double its Movement for that Action. This affects more than just the Move Action, such as Difficult Move, Intercede or [CHARGE] Attacks.\nThis Quality can be triggered Once per Combat.\n\nElemental Force: How it Works\nGreymon has Naturewalk: Fire, and has chosen to take Elemental Force and adds the [FIRE] Tag to Nova Blast. The Attack now gains +2 Damage, but if used against a Digimon that has Naturewalk: Fire like Meramon, it loses that Damage bonus. If Meramon has Element Master as well, the Attack does absolutely nothing.\nBe careful putting an Element Tag on a Signature Move, as in the right circumstances (as previously showcased) it can be completely invalidated",
    "description": "When the Digimon takes an Action which involves its Movement, it can choose to double its Movement for that Action. "
  },
  {
    "id": "forcaElemental",
    "name": "Elemental Force",
    "originalName": "Elemental Force",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": true
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e 1 or more Ranks of Naturewalk.",
      "qualityNames": "Naturewalk"
    },
    "incompatible": {
      "text": "Múltiplas Tags de Elemental Force cannotm ser colocadas no mesmo ataque, mesmo que sejam de Elements diferentes.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "perRank",
      "label": "Naturewalk Element",
      "options": [
        {
          "key": "fire",
          "label": "Fire",
          "originalLabel": "Fire",
          "attackTag": "fire"
        },
        {
          "key": "water",
          "label": "Water",
          "originalLabel": "Water",
          "attackTag": "water"
        },
        {
          "key": "wind",
          "label": "Wind",
          "originalLabel": "Wind",
          "attackTag": "wind"
        },
        {
          "key": "earth",
          "label": "Earth",
          "originalLabel": "Earth",
          "attackTag": "earth"
        },
        {
          "key": "ice",
          "label": "Ice",
          "originalLabel": "Ice",
          "attackTag": "ice"
        },
        {
          "key": "wood",
          "label": "Wood",
          "originalLabel": "Wood",
          "attackTag": "wood"
        },
        {
          "key": "steel",
          "label": "Steel",
          "originalLabel": "Steel",
          "attackTag": "steel"
        },
        {
          "key": "thunder",
          "label": "Thunder",
          "originalLabel": "Thunder",
          "attackTag": "thunder"
        },
        {
          "key": "darkness",
          "label": "Darkness",
          "originalLabel": "Darkness",
          "attackTag": "darkness"
        },
        {
          "key": "light",
          "label": "Light",
          "originalLabel": "Light",
          "attackTag": "light"
        }
      ]
    },
    "attackModifier": {
      "grantsTagsFromChoice": true,
      "appliesTo": "oneDamageAttackPerRank",
      "bonusDamageFormula": "1 + ranks",
      "triggerRequired": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ative a Tag Elemental when declaring o ataque para gainsr Damage bônus."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When taking a Rank in this Quality, the Digimon chooses a Naturewalk Element it has purchased. The Digimon applies an Attack Tag with the same name as that Element to one [DAMAGE] Attack.\nWhen an Attack with an Element Tag is declared, this Quality can be triggered to gain a bonus to Damage equal to 1 + Ranks in this Quality for that Attack. However, if triggered, the Attack deals no bonus Damage to a Digimon that shares the same Naturewalk as the chosen Element, and the Attack is completely ineffective against Digimon with the above requirement and the Element Master Quality (and does not penalize Dodge).\nEach time a Rank is taken in this Quality, the Digimon can choose either the same Naturewalk Element or a new one. Multiple Elemental Force Tags cannot be placed on the same Attack, even those with different Elements.",
    "description": "When taking a Rank in this Quality, the Digimon chooses a Naturewalk Element it has purchased. "
  },
  {
    "id": "mestreElemental",
    "name": "Element Master",
    "originalName": "Element Master",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e 1 or more Ranks of Naturewalk.",
      "qualityNames": "Naturewalk"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Elemental Myriad"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "negatesTriggeredElementalForceMatchingNaturewalk": true,
      "dangerousTerrainDamageForMatchingElements": 1
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "freeAction",
      "actionCost": 0,
      "chatMessage": "Manipule um aspecto natural de um Element associado ao seu Naturewalk."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "check": {
      "enabled": true,
      "stat": "dos",
      "skill": "fortitude",
      "notes": "Durante seu turno, o Digimon pode fazer um Check DOS (Fortitude) como Action Livre once per Round when manipular seu Element for difícil ou complexo, a critério do GM."
    },
    "effect": "During its turn, a Digimon can make a DOS (Fortitude) Check as a Free Action Once per Round.\nThe Digimon gains the ability to manipulate an aspect of nature of their associated Element that was taken with Naturewalk. If Naturewalk was taken multiple times, this Quality can affect any Elements chosen, but only one at a time. The Digimon may interact with natural sources of the Element and produce unique effects. These effects usually have no bearing on Combat, such as dealing Damage. Whenever the Digimon would encounter difficulty in manipulating an Element, like producing a complex effect or manipulating a non-natural source, the GM ultimately determines if any use of this Quality is something to allow, possibly even requiring a DOS (Fortitude) Skill Check for something that should be achievable, but difficult.\nThe Digimon also completely negates any Elemental Force Attacks triggered against it for any Element it has with Naturewalk, and only takes 1 Unalterable Damage for Dangerous Terrain of the same Elements instead of 2 Unalterable Damage.\n\n5.02 - Offensive Qualities\n________________________________________",
    "description": "During its turn, a Digimon can make a DOS (Fortitude) Check as a Free Action Once per Round. "
  },
  {
    "id": "golpePoderoso",
    "name": "Mighty Blow",
    "originalName": "Mighty Blow",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion. A Tag [T:MIGHTY] deve ser aplicada a um ataque [MELEE][DAMAGE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[MELEE][DAMAGE] Attack with [T:MIGHTY]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "t:mighty"
      ],
      "appliesTo": "oneMeleeDamageAttack",
      "mayShareWithAttackEffectExceptDamageEffects": true,
      "areaAttackAppliesToClosestTarget": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "If o ataque [T:MIGHTY] causar pelo menos 2 Damage após Weapondura, faça um Check CPU (Feats of Strength)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "cpu",
      "skill": "featsOfStrength",
      "tnFormula": "10 + targetCpu",
      "consecutiveUseTnIncrease": 3,
      "ignoreTnIncreaseIfSignatureMove": true
    },
    "result": {
      "criticalFailure": "",
      "failure": "The Attack deals 1 less Damage (min of 1).",
      "success": "The Target is inflicted with [STUN].",
      "criticalSuccess": ""
    },
    "effect": "The Digimon applies the [T:MIGHTY] Tag to one [MELEE][DAMAGE] Attack.\nIf a [T:MIGHTY] Attack deals at least 2 Damage after Armor (not including Unalterable Damage), the Attacker can choose to make a CPU (Feats of Strength) Check. The TN equals 10 + the Target’s CPU.\nCritical Failure: The Attack deals 1 less Damage (min of 1).\nFailure: Nothing happens.\nSuccess: The Target is inflicted with [STUN].\nCritical Success: The Attack also deals 2 extra Damage.\nEach time the Quality is used, even on a Failure, the TN increases by 3 for all any further use until the end of Combat, unless the Attack is a Signature Move.\n[T:MIGHTY] may be applied to an attack with another Attack Effect, except for Damage Effects. If used on an Area Attack, the Quality applies to the closest Target.",
    "description": "The Digimon applies the [T:MIGHTY] Tag to one [MELEE][DAMAGE] Attack. "
  },
  {
    "id": "focoPreciso",
    "name": "Precise Focus",
    "originalName": "Precise Focus",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion. A Tag [FOCUS] deve ser aplicada a um ataque [RANGE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "Esta Tag não fornece benefícios a Áreas de Attack.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[RANGE] Attack with [FOCUS]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "focus"
      ],
      "appliesTo": "oneRangedAttack",
      "noBenefitToAreaAttacks": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "conditional",
      "chatMessage": "Quando um ataque [FOCUS] for feito usando 1 Action extra, role BIT (Precision)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "precision",
      "tnFormula": "12 + targetRam",
      "triggerCondition": "focusAttackMadeWithOneExtraAction"
    },
    "result": {
      "criticalFailure": "",
      "failure": "Nothing happens.",
      "success": "The Attack gains +3 Accuracy.",
      "criticalSuccess": ""
    },
    "effect": "The Digimon applies the [FOCUS] Tag to one [RANGE]  Attack.\nFor every point of Damage a [DAMAGE][FOCUS] Attack does, the Target loses two Temporary Wound Boxes instead of one (if it has any).\nWhen a [FOCUS] Attack is made using 1 extra Action (such as the Bolster Action, Called Shot or an additional cost caused by a Quality), the Digimon rolls a BIT (Precision) Check. The TN equals 12 + the Target’s RAM.\nCritical Failure: Nothing happens.\nFailure: The Attack gains +1 Accuracy.\nSuccess: The Attack gains +3 Accuracy.\nCritical Success: The Attack gains +5 Accuracy.\nIf applied to a Signature Move, the Digimon can also increase the Attack’s Range equal to its Battery.\nThis Tag provides no benefits to Area Attacks. If the Attack would take 2 or more Actions by default, but have its Action cost reduced (such as with [SIMPLE]), it’s still treated as an Attack with 1 extra Action..",
    "description": "The Digimon applies the [FOCUS] Tag to one [RANGE] Attack. "
  },
  {
    "id": "ataqueDeFinta",
    "name": "Feint Attack",
    "originalName": "Feint Attack",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion. A Tag [T:FEINT] deve ser aplicada a um ataque [MELEE].",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "A Digimon cannot ter [PIERCING] ou [STUN] em um ataque [T:FEINT]. Esta Quality não can be usada durante Clash nem ao ativar Counterattack.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[MELEE] Attack with [T:FEINT]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "t:feint"
      ],
      "appliesTo": "oneMeleeAttack",
      "incompatibleTags": [
        "piercing",
        "stun"
      ],
      "cannotUseDuringClash": true,
      "cannotUseWithCounterattack": true,
      "areaAttackAppliesToClosestTarget": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao declarar um ataque [T:FEINT], faça um Check BIT (Manipulate)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "manipulate",
      "tnFormula": "10 + targetBit",
      "consecutiveUseTnIncrease": 3,
      "ignoreTnIncreaseIfSignatureMove": true
    },
    "result": {
      "criticalFailure": "",
      "failure": "The Attack’s Damage is halved after Armor (rounded up) if it hits.",
      "success": "The Target can only roll half its normal Dodge Pool in response to the Attack, but a [DAMAGE] Attack’s Damage is halved after Armor (rounded up) if it hits, and a [SUPPORT]Attack’s Effect Duration is reduced by 1 (to a minimum of 0).",
      "criticalSuccess": ""
    },
    "effect": "The Digimon applies the [T:FEINT] Tag to one [MELEE]  Attack.\nWhen a Digimon declares a [T:FEINT] Attack against an Enemy, the Attacker can choose to make a BIT (Manipulate) Check. The TN is 10 + the Target’s BIT.\nCritical Failure: The Attack’s Damage is halved after Armor (rounded up) if it hits.\nFailure: Nothing happens.\nSuccess: The Target can only roll half its normal Dodge Pool in response to the Attack, but a [DAMAGE] Attack’s Damage is halved after Armor (rounded up) if it hits, and a [SUPPORT]Attack’s Effect Duration is reduced by 1 (to a minimum of 0).\nCritical Success: The Attack’s Damage isn’t halved.\nEach time the Quality is used, even on a Failure, the TN increases by 3 for all any further use until the end of Combat, unless the Attack is a Signature Move.\nA Digimon may not have [PIERCING] or [STUN] on a [T:FEINT] Attack. This Quality cannot be used when this Attack is made as during a Clash. This Quality cannot be used when activating the Counterattack Quality. If used on an Area Attack, the Quality applies to the closest Target.",
    "description": "The Digimon applies the [T:FEINT] Tag to one [MELEE] Attack. "
  },
  {
    "id": "golpePunitivo",
    "name": "Punishing Strike",
    "originalName": "Punishing Strike",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e Ranks of Combat Awareness.",
      "qualityNames": "Combat Awareness"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "There Is No Escape"
    ],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[MELEE] Attack with [PUNISH]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "punish"
      ],
      "appliesTo": "oneMeleeAttack",
      "cannotTriggerAreaAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "interrupt",
      "chatMessage": "Quando um inimigo sair voluntariamente do alcance dos seus ataques corpo a corpo, ataque com [PUNISH]."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "usesFormula": {
      "valueFromQualityRanks": "conscienciaDeCombate",
      "valuePerRank": 1,
      "recharge": "combat"
    },
    "effect": "The Digimon may apply the [PUNISH] Tag to one [MELEE]  Attack.\nWhen a Digimon would willingly move out of the reach of your melee attacks (this does not include teleportation or if they are moved out of reach by a status effect), you can make an Attack with this Tag against that Digimon outside your turn as an Interrupt Action. When you make an attack this way you cannot trigger an Area Attack.\nYou can use this Quality an amount of times per battle equal to the ranks you have in Combat Awareness.\nIf a Digimon Intercedes against this Attack, their Armor is halved against the Damage it deals.",
    "description": "The Digimon may apply the [PUNISH] Tag to one [MELEE] Attack. "
  },
  {
    "id": "naoHaEscapatoria",
    "name": "There Is No Escape",
    "originalName": "There Is No Escape",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Punishing Strike.",
      "qualityNames": "Punishing Strike"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "punishingStrikeCanTriggerOnTeleport": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When you deal 2 or more damage using an Attack with the [PUNISH] Tag, you halve the target's Movement until the end of the current turn. If the Attack with the [PUNISH] Tag also has the [ROOT] tag, the target's current Movement is reduced to 0 instead for that turn.\nYou can now also use Punishing Strike if the target would willingly Teleport out of reach.",
    "description": "When you deal 2 or more damage using an Attack with the [PUNISH] Tag, you halve the target's Movement until the end of the current turn. "
  },
  {
    "id": "contraGolpe",
    "name": "Counterblow",
    "originalName": "Counterblow",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e 1 Rank of Counterattack.",
      "qualityNames": "Counterattack"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Cross Counter, Return Fire"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[MELEE] Attack with [COUNTER]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "counter"
      ],
      "appliesTo": "oneMeleeAttack",
      "onlyUsableWithCounterattack": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "counterattackModifier",
      "chatMessage": "Ao ativar Counterattack, escolha reduzir Avoidance, Weapondura ou gastar dois usos para ambos."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "counterattackOptions": [
      {
        "key": "halveDodge",
        "label": "Reduzir Avoidance",
        "effect": "O target rola metade da Pool de Avoidance."
      },
      {
        "key": "halveArmor",
        "label": "Reduzir Weapondura",
        "effect": "A Weapondura do target é reducesida pela half against o attack."
      },
      {
        "key": "both",
        "label": "Ambos",
        "cost": "twoCounterattackUses",
        "effect": "Gaste dois usos de Counterattack para aplicar os dois efeitos."
      }
    ],
    "effect": "The Digimon may apply the [COUNTER] Tag to one [MELEE] Attack. The Digimon can only use the [COUNTER] Tagged Attack when using Counterattack.\nAdditionally, when the Digimon activates the Counterattack Quality, instead of the normal penalty the Digimon must choose between three options:\n●\tThe Digimon may halve the Target’s Dodge Pool.\n●\tThe Digimon may halve the Target’s Armor for the Attack, instead of their Dodge.\n●\tThe Digimon may expend two uses of Counterattack to activate both of the above effects at once.",
    "description": "The Digimon may apply the [COUNTER] Tag to one [MELEE] Attack. "
  },
  {
    "id": "contraGolpeCruzado",
    "name": "Cross Counter",
    "originalName": "Cross Counter",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e 1 Rank of Counterattack.",
      "qualityNames": "Counterattack"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Counterblow, Combat Monster, Return Fire, Instant Counter"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[MELEE] Attack with [COUNTER]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "counter"
      ],
      "appliesTo": "oneMeleeAttack",
      "onlyUsableWithCounterattack": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "chatMessage": "If um Enemy acertar um ataque [MELEE] e causar Damage minimum equal to the seu Stage + 1, você pode ativar Counterattack."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon may apply the [COUNTER] Tag to one [MELEE] Attack. The Digimon can only use the [COUNTER] Tagged Attack when using Counterattack.\nIn addition, if an Enemy lands a successful [MELEE] Attack against the Digimon and it suffers minimum Damage equal to its Stage + 1 (after Armor), you may choose to trigger Counterattack.\nIf Counterattack is triggered during an Intercede, the Digimon may retaliate, but the Target does not halve its Dodge against the Attack.",
    "description": "The Digimon may apply the [COUNTER] Tag to one [MELEE] Attack. "
  },
  {
    "id": "fogoDeRetorno",
    "name": "Return Fire",
    "originalName": "Return Fire",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e 1 Rank of Counterattack.",
      "qualityNames": "Counterattack"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Counterblow, Cross Counter"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "[RANGE] Attack with [COUNTER]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "counter"
      ],
      "appliesTo": "oneRangedAttack",
      "onlyUsableWithCounterattack": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "chatMessage": "Use um ataque [RANGE][COUNTER] ao ativar Counterattack."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon may apply the [COUNTER] Tag to one [RANGE] Attack. The Digimon can only use the [COUNTER] Tagged Attack when using Counterattack.\nIf the Counterattack Quality is triggered due to a [RANGE] Attack, the Digimon ignores any penalties to Accuracy caused by Attacking within its Effective Limit.",
    "description": "The Digimon may apply the [COUNTER] Tag to one [RANGE] Attack. "
  },
  {
    "id": "contraAtaqueInstantaneo",
    "name": "Instant Counter",
    "originalName": "Instant Counter",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e 1 Rank of Counterattack.",
      "qualityNames": "Counterattack"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Cross Counter"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "counterattackInterruptCanBeFreeAction": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "actionCost": 0,
      "chatMessage": "Use a Action de Interrupção de Counterattack como Action Livre once per Combat."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "Requirement:\nChampion | 1 Rank of COUNTERATTACK\nIncompatible:\nCROSS COUNTER\nThe Digimon may use the Counterattack Interrupt Action as a Free Action Once per Combat.",
    "description": "Requirement: Champion | 1 Rank of COUNTERATTACK Incompatible: CROSS COUNTER The Digimon may use the Counterattack Interrupt Action as a Free Action Once per Combat."
  },
  {
    "id": "rouboDeVida",
    "name": "Lifesteal",
    "originalName": "Lifesteal",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "A Tag [DRAIN] não can be aplicada a um ataque with Tag de Efeito.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Attack with [DRAIN]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "drain"
      ],
      "appliesTo": "oneAttack",
      "cannotApplyToAttackWithEffectTag": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Cure Wound Boxes iguais ao Damage causado, até o limite de DOS."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon may apply the [DRAIN] Tag to one Attack.\nThis Attack heals a number of the Digimon’s Wound Boxes equal to the Damage dealt, to a maximum of the Digimon’s DOS. If used with an Area Attack Tag, the overall Damage is used to determine healing instead of Damage to individual Targets.\nThe [T:DRAIN] Tag cannot be applied to an Attack with an Effect Tag.\nIf applied to a Signature Move, the potential healing to the Digimon is increased equal to its Battery.",
    "description": "The Digimon may apply the [DRAIN] Tag to one Attack. "
  },
  {
    "id": "recarregar",
    "name": "Reload",
    "originalName": "Reload",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion e Ammo.",
      "qualityNames": "Ammo"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Tente recuperar o uso de um ataque [AMMO] já usado neste combate."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "precision",
      "tnFormula": "18 - casterRam",
      "consecutiveSuccessfulUseTnIncrease": 3
    },
    "result": {
      "criticalFailure": "",
      "failure": "The Digimon cannot attempt to use this Quality again this Combat.",
      "success": "The Digimon regains its use of the [AMMO] Attack as if it hadn’t been used this Combat.",
      "criticalSuccess": ""
    },
    "effect": "As 2 Actions, the Digimon can attempt to regain use of its [AMMO] Attack after using it in Combat. The Digimon must make a BIT (Precision) Check. The TN equals 18 - the Digimon’s RAM.\nCritical Failure: The Digimon cannot attempt to use this Quality again this Combat.\nFailure: Nothing happens.\nSuccess: The Digimon regains its use of the [AMMO] Attack as if it hadn’t been used this Combat.\nCritical Success: The Digimon also regains 1 Action it used on this Quality.\nEach time the Quality is successfully used, the TN increases by 3 for any further use until the end of Combat.\n\n5.03 - Defensive Qualities\n________________________________________",
    "description": "As 2 Actions, the Digimon can attempt to regain use of its [AMMO] Attack after using it in Combat. "
  },
  {
    "id": "resistenciaFocada",
    "name": "Focused Resistance",
    "originalName": "Focused Resistance",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Immunity"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "interrupt",
      "chatMessage": "When o Digimon for suffersr um Efeito devido a um ataque, use uma Interrupção para dobrar sua Endurance against o Efeito."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Required for:\nIMMUNITY\nWhen the Digimon would be subjected to an Effect due to an Attack, the Digimon can use an Interrupt Action to double its Resistance against the incoming Effect.",
    "description": "Required for: IMMUNITY When the Digimon would be subjected to an Effect due to an Attack, the Digimon can use an Interrupt Action to double its Resistance against the incoming Effect."
  },
  {
    "id": "imunidade",
    "name": "Immunity",
    "originalName": "Immunity",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Preservation Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Focused Resistance.",
      "qualityNames": "Focused Resistance"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resistanceCanReducePotencyBelowTwo": true,
      "negateEffectAtZeroPotency": true,
      "resistActionTreatedAsExtraAction": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Requirement:\nFOCUSED RESISTANCE\nThe Digimon’s Resistance can reduce an incoming Effect’s Potency to below 2. If it would be reduced to 0, it is instead negated. In addition, when the Digimon takes the Resist Action, it is treated as if it was using an extra Action.\n\n5.05 - Utility Qualities\n________________________________________",
    "description": "Requirement: FOCUSED RESISTANCE The Digimon’s Resistance can reduce an incoming Effect’s Potency to below 2. "
  },
  {
    "id": "controleDeDominio",
    "name": "Domain Control",
    "originalName": "Domain Control",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Element Master.",
      "qualityNames": "Element Master"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Elemental Myriad"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Domain",
      "options": [
        {
          "key": "treacherousFire",
          "label": "Treacherous Fire",
          "originalLabel": "Treacherous Fire",
          "element": "fire",
          "effect": "or"
        },
        {
          "key": "volatileElement",
          "label": "Volatile Element",
          "originalLabel": "Volatile Element",
          "element": "fire",
          "effect": ".\nListed on the next page are the Element Categories, and their options.\nIf you have purchased the Altered Element Quality, you can choose any option presented and treat it as an Element you have from Naturewalk.\n \n\nFire\tTreacherous Fire\tVolatile Element\n\tThe area is considered Difficult Terrain for Enemies, and Enemies within suffer from the [BURN] Effect as long as they are within the Domain.\tAll of the Domain Controller’s Attacks are treated as if their Target is under the [EXPLOIT] Effect as long as they are within the area. This [EXPLOIT] has a potency equal to the Domain Controller’s DOS. This does not apply to minions.\nWater"
        },
        {
          "key": "floodVortex",
          "label": "Flood Vortex",
          "originalLabel": "Flood Vortex",
          "element": "water",
          "effect": "A área é considerada Difficult Earthin para todos os Digimon withinla, exceto o Controlador do Domínio, unless o Digimon possua Advanced Mobility: Swimmer. When o Domínio é criado e no início dos turnos seguintes do Controlador, [PULL] é aplicado a quaisquer Digimon à escolha do Controlador. Esse [PULL] tem Potency equal to the CPU do Controlador."
        },
        {
          "key": "cleansingMist",
          "label": "Cleansing Mist",
          "originalLabel": "Cleansing Mist",
          "element": "water",
          "effect": "Wind\tThe area is considered Difficult Terrain for all Digimon within except the Domain Controller unless a Digimon possesses the Advanced Mobility: Swimmer Quality. When the Domain is created and at the start of the Domain Controller’s following turns, the [PULL] Effect is applied to any Digimon of the Domain Controller’s choice. This [PULL] has a potency equal to the Domain Controller’s CPU.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Digimon rolls its BIT as a Pool Check. For each Success, it can target any Digimon within the Domain and apply [CLEANSE] with an amount of Automatic Successes equal to the Successes of the Pool Check. This [CLEANSE] isn’t affected by Selective Targeting.\nEarth"
        },
        {
          "key": "rumblingLand",
          "label": "Rumbling Land",
          "originalLabel": "Rumbling Land",
          "element": "earth",
          "effect": "When o Domínio é criado e no início dos turnos seguintes do Controlador, [ROOT] é aplicado a qualquer Enemy dentro do Domínio. Esse [ROOT] tem Potency equal to the CPU do Controlador."
        },
        {
          "key": "stoneArmory",
          "label": "Stone Armory",
          "originalLabel": "Stone Armory",
          "element": "earth",
          "effect": "When the Domain is created and at the start of the Domain Controller’s following turns, the [ROOT] Effect is applied to any Enemy within the Domain. This [ROOT] has a potency equal to the Domain Controller’s CPU. \tWhen the Domain is created and at the start of the Domain Controller’s following turns, apply [SHIELD] to the Domain Controller. This [SHIELD] has a potency equal to the number of Enemies within the area and lasts until the start of the Domain Controller’s next turn. This includes Minions.\nWind"
        },
        {
          "key": "gustyGarden",
          "label": "Gusty Garden",
          "originalLabel": "Gusty Garden",
          "element": "wind",
          "effect": "A área é considerada Difficult Earthin para todos os Digimon withinla, exceto o Controlador do Domínio, unless o Digimon possua Advanced Mobility: Flight. When o Domínio é criado e no início dos turnos seguintes do Controlador, [PUSH] é aplicado a quaisquer Digimon à escolha do Controlador. Esse [PUSH] tem Potency equal to the RAM do Controlador."
        },
        {
          "key": "boostingGale",
          "label": "Boosting Gale",
          "originalLabel": "Boosting Gale",
          "element": "wind",
          "effect": "The area is considered Difficult Terrain for all Digimon within except the Domain Controller unless a Digimon possesses the Advanced Mobility: Flight Quality. When the Domain is created and at the start of the Domain Controller’s following turns, the [PUSH] Effect is applied to any Digimon of the Domain Controller’s choice. This [PUSH] has a potency equal to the Domain Controller’s RAM.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller rolls 1d6 once for each Digimon of the Domain Controller’s choice within the area except itself. On a success roll of 5 or higher, [HASTE] is inflicted on that Digimon.\n \n\nIce"
        },
        {
          "key": "iceField",
          "label": "Ice Field",
          "originalLabel": "Ice Field",
          "element": "ice",
          "effect": "A área é considerada Difficult Earthin para Enemies, e Enemies withinla suffersm [FREEZE] while permanecerem no Domínio."
        },
        {
          "key": "frozenOver",
          "label": "Frozen Over",
          "originalLabel": "Frozen Over",
          "element": "ice",
          "effect": "The area is considered Difficult Terrain for Enemies, and Enemies within suffer from the [FREEZE] Effect as long as they are within the Domain.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the [FRAIL] Effect is applied to any Digimon of the Domain Controller’s choice within the area that lasts until the start of the Domain Controller’s next turn. This [FRAIL] has a potency equal to the Domain Controller’s BIT.\nThunder"
        },
        {
          "key": "lightningRush",
          "label": "Lightning Rush",
          "originalLabel": "Lightning Rush",
          "element": "thunder",
          "effect": "When o Domínio é criado e no início dos turnos seguintes do Controlador, [TAILWIND] é aplicado a qualquer Digimon à escolha do Controlador dentro da área until the start of the next turn do Controlador. Esse [TAILWIND] tem Potency equal to the BIT do Controlador."
        },
        {
          "key": "thunderJustice",
          "label": "Thunder Justice",
          "originalLabel": "Thunder Justice",
          "element": "thunder",
          "effect": "When the Domain is created and at the start of the Domain Controller’s following turns, the [TAILWIND] Effect is applied to any Digimon of the Domain Controller’s choice within the area that lasts until the start of the Domain Controller’s next turn. This [TAILWIND] has a potency equal to the Domain Controller’s BIT.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, [PARALYZE] is inflicted on that Digimon until the Domain Controller’s next turn. This [PARALYZE] has a potency equal to the Domain Controller’s DOS.\nWood"
        },
        {
          "key": "poisonousGrowth",
          "label": "Poisonous Growth",
          "originalLabel": "Poisonous Growth",
          "element": "wood",
          "effect": "A área é considerada Difficult Earthin para Enemies, e Enemies withinla suffersm [POISON] while permanecerem no Domínio."
        },
        {
          "key": "sappingStrength",
          "label": "Sapping Strength",
          "originalLabel": "Sapping Strength",
          "element": "wood",
          "effect": "The area is considered Difficult Terrain for Enemies, and Enemies within suffer from the [POISON] Effect as long as they are within the Domain.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, the Digimon takes 1 Unalterable Damage. The Domain Controller heals 1 Wound Box for each damage dealt this way.\nSteel"
        },
        {
          "key": "artificialLimitation",
          "label": "Artificial Limitation",
          "originalLabel": "Artificial Limitation",
          "element": "steel",
          "effect": "When o Domínio é criado e no início dos turnos seguintes do Controlador, [DOOM] é aplicado a qualquer Enemy dentro do Domínio until the start of the next turn do Controlador. Esse [DOOM] tem Potency equal to the BIT do Controlador."
        },
        {
          "key": "dgDimension",
          "label": "DG Dimension",
          "originalLabel": "DG Dimension",
          "element": "steel",
          "effect": "When the Domain is created and at the start of the Domain Controller’s following turns, [DOOM] is applied to any Enemy within the Domain, which lasts until the start of Domain Controller's next turn. The [DOOM] has a Potency equal to the Domain Controller's BIT.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, [DOT] is inflicted on that Digimon until the Domain Controller’s next turn. This ignores the Once Per Combat limit on [DOT].\n \n\nLight"
        },
        {
          "key": "rejuvenatingLight",
          "label": "Rejuvenating Light",
          "originalLabel": "Rejuvenating Light",
          "element": "light",
          "effect": "When o Domínio é criado e no início dos turnos seguintes do Controlador, ele escolhe uma quantidade de Digimon até seu Stage e rola 1d6 for each um. Em resultado 5 ou mais, [REGEN] é aplicado ao Digimon até o próximo turno do Controlador. Esse [REGEN] tem Potency equal to the CPU do Controlador."
        },
        {
          "key": "peacefulPressure",
          "label": "Peaceful Pressure",
          "originalLabel": "Peaceful Pressure",
          "element": "light",
          "effect": "When the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, [REGEN] is inflicted on that Digimon until the Domain Controller’s next turn. This [REGEN] has a potency equal to the Domain Controller's CPU.\tAny Digimon within the area are treated as if they are suffering from [PACIFY] when attacking the Domain Controller. This [PACIFY] has a potency equal to the Domain Controller’s DOS. This does not apply to Minions.\nDark"
        },
        {
          "key": "shadowVale",
          "label": "Shadow Vale",
          "originalLabel": "Shadow Vale",
          "element": "darkness",
          "effect": "When o Domínio é criado e no início dos turnos seguintes do Controlador, [FEAR] é aplicado a qualquer Enemy dentro do Domínio. Esse [FEAR] tem Potency equal to the CPU do Controlador."
        },
        {
          "key": "nightmareShroud",
          "label": "Nightmare Shroud",
          "originalLabel": "Nightmare Shroud",
          "element": "darkness",
          "effect": "When the Domain is created and at the start of the Domain Controller’s following turns, the [FEAR] Effect is applied to any Enemy within the Domain. This [FEAR] has a potency equal to the Domain Controller’s CPU. \tThe area is considered Difficult Terrain for Enemies, and When the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, [RUIN] is inflicted on that Digimon until the Domain Controller’s next turn. This [RUIN] has a potency equal to the Domain Controller’s DOS."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Crie um Domínio elemental ao redor do Digimon."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "domain": {
      "durationFormula": "stage + 1",
      "radiusFormula": "stage + 1",
      "followsUser": true,
      "requiresElementSource": true,
      "conjurerBypassesSourceWithCheck": true,
      "conjurerCheck": {
        "stat": "dos",
        "skill": "fortitude",
        "tnFormula": "10 + doubleStage"
      },
      "maintainCheckIfNoElementSource": {
        "stat": "dos",
        "skill": "fortitude",
        "timing": "beginningOfEachRound",
        "tnFormula": "10 + doubleStage"
      },
      "ignoredBySharedNaturewalk": true,
      "notAffectedByResistantOrToughItOut": true
    },
    "effect": "For intents and purposes, the Element Master is now capable of imbuing the area around it with an additional effect, known as a Domain.\nCreating a Domain requires 2 Actions, and a source of the Element in question to exist, as per Element Master rules. If the Digimon also has the Conjurer Quality, it does not need a source of the Element but does need to make a DOS (Fortitude) Check with a TN of 10 + double the Digimon’s Stage or fail to create the Domain.\nThe Domain has a lasting duration of the user's Stage + 1, and the affected scope is limited to a radius equal to the same amount, which follows the Digimon as it moves. If a quantifiable amount of the Element is not present at this time, the Domain Controller can make a DOS (Fortitude) Check at the beginning of each round to maintain the Domain, with a TN of 10 + double the Digimon’s Stage.\nEach Domain lists an Effect that occurs when it is present. These Effects are not affected by Qualities like Resistant or Special Orders like Tough it Out, but a Digimon with a Naturewalk element shared with the Domain Control Element can choose to ignore it. For example, a Digimon with Naturewalk: Fire can ignore the effects of Treacherous Fire or Volatile Element.\nListed on the next page are the Element Categories, and their options.\nIf you have purchased the Altered Element Quality, you can choose any option presented and treat it as an Element you have from Naturewalk.\n\nFire\tTreacherous Fire\tVolatile Element\n\tThe area is considered Difficult Terrain for Enemies, and Enemies within suffer from the [BURN] Effect as long as they are within the Domain.\tAll of the Domain Controller’s Attacks are treated as if their Target is under the [EXPLOIT] Effect as long as they are within the area. This [EXPLOIT] has a potency equal to the Domain Controller’s DOS. This does not apply to minions.\nWater\tFlood Vortex\tCleansing Mist\nWind\tThe area is considered Difficult Terrain for all Digimon within except the Domain Controller unless a Digimon possesses the Advanced Mobility: Swimmer Quality. When the Domain is created and at the start of the Domain Controller’s following turns, the [PULL] Effect is applied to any Digimon of the Domain Controller’s choice. This [PULL] has a potency equal to the Domain Controller’s CPU.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Digimon rolls its BIT as a Pool Check. For each Success, it can target any Digimon within the Domain and apply [CLEANSE] with an amount of Automatic Successes equal to the Successes of the Pool Check. This [CLEANSE] isn’t affected by Selective Targeting.\nEarth\tRumbling Land\tStone Armory\n\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the [ROOT] Effect is applied to any Enemy within the Domain. This [ROOT] has a potency equal to the Domain Controller’s CPU. \tWhen the Domain is created and at the start of the Domain Controller’s following turns, apply [SHIELD] to the Domain Controller. This [SHIELD] has a potency equal to the number of Enemies within the area and lasts until the start of the Domain Controller’s next turn. This includes Minions.\nWind\tGusty Garden\tBoosting Gale\n\tThe area is considered Difficult Terrain for all Digimon within except the Domain Controller unless a Digimon possesses the Advanced Mobility: Flight Quality. When the Domain is created and at the start of the Domain Controller’s following turns, the [PUSH] Effect is applied to any Digimon of the Domain Controller’s choice. This [PUSH] has a potency equal to the Domain Controller’s RAM.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller rolls 1d6 once for each Digimon of the Domain Controller’s choice within the area except itself. On a success roll of 5 or higher, [HASTE] is inflicted on that Digimon.\n\nIce\tIce Field\tFrozen Over\n\tThe area is considered Difficult Terrain for Enemies, and Enemies within suffer from the [FREEZE] Effect as long as they are within the Domain.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the [FRAIL] Effect is applied to any Digimon of the Domain Controller’s choice within the area that lasts until the start of the Domain Controller’s next turn. This [FRAIL] has a potency equal to the Domain Controller’s BIT.\nThunder\tLightning Rush\tThunder Justice\n\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the [TAILWIND] Effect is applied to any Digimon of the Domain Controller’s choice within the area that lasts until the start of the Domain Controller’s next turn. This [TAILWIND] has a potency equal to the Domain Controller’s BIT.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, [PARALYZE] is inflicted on that Digimon until the Domain Controller’s next turn. This [PARALYZE] has a potency equal to the Domain Controller’s DOS.\nWood\tPoisonous Growth\tSapping Strength\n\tThe area is considered Difficult Terrain for Enemies, and Enemies within suffer from the [POISON] Effect as long as they are within the Domain.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, the Digimon takes 1 Unalterable Damage. The Domain Controller heals 1 Wound Box for each damage dealt this way.\nSteel\tArtificial Limitation\tDG Dimension\n\tWhen the Domain is created and at the start of the Domain Controller’s following turns, [DOOM] is applied to any Enemy within the Domain, which lasts until the start of Domain Controller's next turn. The [DOOM] has a Potency equal to the Domain Controller's BIT.\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, [DOT] is inflicted on that Digimon until the Domain Controller’s next turn. This ignores the Once Per Combat limit on [DOT].\n\nLight\tRejuvenating Light\tPeaceful Pressure\n\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, [REGEN] is inflicted on that Digimon until the Domain Controller’s next turn. This [REGEN] has a potency equal to the Domain Controller's CPU.\tAny Digimon within the area are treated as if they are suffering from [PACIFY] when attacking the Domain Controller. This [PACIFY] has a potency equal to the Domain Controller’s DOS. This does not apply to Minions.\nDark\tShadow Vale\tNightmare Shroud\n\tWhen the Domain is created and at the start of the Domain Controller’s following turns, the [FEAR] Effect is applied to any Enemy within the Domain. This [FEAR] has a potency equal to the Domain Controller’s CPU. \tThe area is considered Difficult Terrain for Enemies, and When the Domain is created and at the start of the Domain Controller’s following turns, the Domain Controller selects a number of Digimon up to its Stage, then rolls 1d6 for each selected Digimon. On a success roll of 5 or higher, [RUIN] is inflicted on that Digimon until the Domain Controller’s next turn. This [RUIN] has a potency equal to the Domain Controller’s DOS.",
    "description": "For intents and purposes, the Element Master is now capable of imbuing the area around it with an additional effect, known as a Domain. "
  },
  {
    "id": "elementoAdaptavel",
    "name": "Adaptive Element",
    "originalName": "Adaptive Element",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Element Master.",
      "qualityNames": "Element Master"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Elemental Myriad, Altered Element"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Adaptive Element",
      "options": [
        "Fire",
        "Water",
        "Earth",
        "Wind",
        "Ice",
        "Thunder",
        "Wood",
        "Steel",
        "Light",
        "Darkness"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "domainControlCanChooseEitherDomainOfChosenElement": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When the Digimon takes the Domain Control Quality, instead of picking a single Domain, it may choose a single Element. It can now use either Domain when it activates Domain Control in Combat. Only one Domain may be active at a time.\nFor example, Seadramon with Adaptive Element and the Water Element may choose to activate the Flood Vortex or Cleansing Mist Domain whenever it creates a Domain.",
    "description": "When the Digimon takes the Domain Control Quality, instead of picking a single Domain, it may choose a single Element. "
  },
  {
    "id": "elementoAlterado",
    "name": "Altered Element",
    "originalName": "Altered Element",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Element Master.",
      "qualityNames": "Element Master"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Elemental Myriad, Adaptive Element"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Altered Domain",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "domainControlCanChooseAnyDomainOption": true,
      "chosenDomainCountsAsOwnNaturewalkElement": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When you take the Domain Control Quality, you can choose any option instead of being limited to the Element of your Naturewalk. Despite the new choice, it is still considered your Element.\nFor example, a Digimon with Naturewalk: Fire could choose Shadow Vale instead of Treacherous Fire and Volatile Element, and other Digimon with Naturewalk: Fire could ignore the effects of that Domain, but Digimon with Naturewalk: Darkness could not.",
    "description": "When you take the Domain Control Quality, you can choose any option instead of being limited to the Element of your Naturewalk. "
  },
  {
    "id": "overdrive",
    "name": "Overdrive",
    "originalName": "Overdrive",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "freeAction",
      "actionCost": 0,
      "chatMessage": "Tente entrar em Overdrive como Action Livre once per Round."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "check": {
      "enabled": true,
      "stat": "cpu",
      "skill": "athletics",
      "tnFormula": "15 - casterRam",
      "consecutiveUseTnIncrease": 6
    },
    "result": {
      "criticalFailure": "",
      "failure": "Nothing happens, and the Digimon cannot use this Quality again until the end of Combat.",
      "success": "The Digimon benefits from [HASTE] for that turn. At the end of the turn the Digimon feels fatigued and suffers a -3 Penalty to Dodge for one round.",
      "criticalSuccess": ""
    },
    "effect": "As a Free Action once per round, the Digimon can attempt to utilize their own understanding of its body’s capabilities to put it into overdrive during its turn. The Digimon may make a CPU (Athletics) Check. The TN equals 15 - the Digimon’s RAM.\nCritical Failure: Nothing happens, and the Digimon cannot use this Quality again until the end of Combat.\nFailure: Nothing happens.\nSuccess: The Digimon benefits from [HASTE] for that turn. At the end of the turn the Digimon feels fatigued and suffers a -3 Penalty to Dodge for one round.\nCritical Success: In addition, the Digimon ignores the penalty to Dodge.\nAfter this Quality has been used once, even on a failure, the TN increases by 6 for consecutive use until the end of Combat.",
    "description": "As a Free Action once per round, the Digimon can attempt to utilize their own understanding of its body’s capabilities to put it into overdrive during its turn. "
  },
  {
    "id": "varreduraDeDados",
    "name": "Data Scan",
    "originalName": "Data Scan",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Analise o código de um Enemy visível para descobrir suas fraquezas."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "knowledge",
      "tnFormula": "10 + targetDos"
    },
    "scanOptions": [
      "current and maximum Wound Boxes do Digimon.",
      "Core Stats do Digimon após Qualities: Accuracy, Damage, Avoidance, Weapondura e Health.",
      "Derived Stats do Digimon: RAM, CPU, BIT e DOS.",
      "Movement, Range e Effective Limit do Digimon.",
      "Lista de Qualities Core do Digimon, como Data Optimization, Naturewalk, Weapon ou Instinct.",
      "Um ataque e todas as suas Tags. Esta opção can be escolhida múltiplas vezes."
    ],
    "result": {
      "criticalFailure": "",
      "failure": "Nothing happens, and the Digimon cannot use this Quality again until the end of Combat.",
      "success": "The Digimon learns one of the following about the Target.\n●\tThe Digimon’s current and maximum Wound Boxes.\n●\tThe Digimon’s Core Stats after Qualities (Accuracy, Damage, Dodge, Armor, Health).\n●\tThe Digimon’s Derived Stats (RAM, CPU, BIT, DOS).\n●\tThe Digimon’s Movement, Range and Effective Limit.\n●\tThe Digimon’s Core Quality list, such as Data Optimization, Naturewalk, Weapon or Instinct, etc.\n●\tOne Attack and all of its Tags. (You can take this option multiple times as per the rules below.)",
      "criticalSuccess": ""
    },
    "effect": "The Digimon can utilize its understanding of code to try and read the code of its Enemy and learn its weaknesses. As 1 Action, the Digimon can target one Enemy it can see and make a BIT (Knowledge) Check. The TN is 10 + the Target’s DOS.\nCritical Failure: Nothing happens, and the Digimon cannot use this Quality again until the end of Combat.\nFailure: Nothing happens.\nSuccess: The Digimon learns one of the following about the Target.\n●\tThe Digimon’s current and maximum Wound Boxes.\n●\tThe Digimon’s Core Stats after Qualities (Accuracy, Damage, Dodge, Armor, Health).\n●\tThe Digimon’s Derived Stats (RAM, CPU, BIT, DOS).\n●\tThe Digimon’s Movement, Range and Effective Limit.\n●\tThe Digimon’s Core Quality list, such as Data Optimization, Naturewalk, Weapon or Instinct, etc.\n●\tOne Attack and all of its Tags. (You can take this option multiple times as per the rules below.)\nCritical Success: The Digimon learns an additional option.\n\n5.06 - Evoker Qualities\n________________________________________",
    "description": "The Digimon can utilize its understanding of code to try and read the code of its Enemy and learn its weaknesses. "
  },
  {
    "id": "conjurador",
    "name": "Conjurer",
    "originalName": "Conjurer",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Evoker Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Stage 2+.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Summoner, Combat Monster, Positive Reinforcement"
    },
    "requiredFor": [
      "Evoker"
    ],
    "choices": {
      "required": true,
      "type": "conjurationTheme",
      "label": "Tipo de objeto conjurado",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resource": {
        "key": "creationLimit",
        "label": "Limite de Criação",
        "valueFormula": "bit + stage",
        "maxFormula": "bit + stage"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Use a Action Conjurar Objects to create objects em Spaces dentro do Range do Digimon."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "creation": {
      "type": "objects",
      "resourceKey": "creationLimit",
      "action": {
        "key": "conjureObjects",
        "label": "Conjurar Objects",
        "actionCost": 2,
        "cooldownRounds": 1
      },
      "rangeFrom": "range",
      "objectSize": "1 espaço cúbico",
      "totalCubicSpacesCannotExceedCreationLimit": true,
      "objectThemeMustBeEstablishedOnPurchase": true,
      "canRelateToNaturewalkElements": true,
      "rules": [
        "Objects podem ser empilhados ou colocados lado a lado para criar objects maiores, servir como cobertura, bloquear terreno ou bloquear caminhos.",
        "Cada object é destruído when is hit por um ataque que causa Damage.",
        "Objects criados adjacentes uns aos outros if tornam um único object e podem gainsr um ataque que cause additional Damage before being destroyed for each 2 objects adicionais unidos ao original.",
        "If objects forem destruídos, the cost used to create them is removed from the Creation Limit, allowing that resource to be recovered.",
        "Objects não rolam Avoidance e are automatically hit when targeted.",
        "A Digimon must obter pelo menos 2 Accuracy Successes with uma Area Attack para destruir um object."
      ],
      "disappearsWhen": [
        "O user realiza a Conjure Objects Action, although it may replace os mesmos objects conjurados usando essa Action.",
        "O user is reduced to 0 Wound Boxes.",
        "O user no longer has access to esta Quality, como when evolving to a new Stage."
      ],
      "elementMasterInteraction": {
        "conjuredObjectsCanActAsElementSource": true
      }
    },
    "effect": "Upon taking this Quality, the Digimon gains a new resource, known as Creation Limit. Its total Creation Limit is equal to its BIT + Stage. It uses this Creation Limit when conjuring objects.\nThe Digimon can take the Conjure Objects Action, which is 2 Actions. The Conjure Objects Action allows the user to conjure objects to any space within the Digimon’s Range, taking up 1 cubic Space. The total cubic spaces of objects you can conjure cannot bypass your Creation Limit. Be sure to establish what variety and types of things your Digimon can create when taking this Quality, as it cannot be changed later. For example, a Digimon could be able to create wooden blocks, but not magically be able to also create metal bars out of thin air. The variety and types of objects can also be related to the Naturewalk options you’ve taken.\nConjured Objects work under the following guidelines:\n●\tYou can stack objects on top of each other or next to each other to create a larger object. Objects created this way can serve as cover that blocks terrain or block pathways.\n●\tEach object is destroyed when it is hit with an Attack that deals Damage. Objects created adjacent to each other become one object and can take an additional damaging Attack before being destroyed for every 2 additional objects joined to the original. If any Objects are destroyed, the cost of creating them is removed from your Creation Limit. This means that as the Objects are destroyed, you regain the resources to make them.\n●\tObjects do not roll Dodge, and therefore are automatically hit upon being targeted.\n●\tA Digimon must have at least 2 Accuracy Successes with an Area Attack to destroy an object.\n\nThe user cannot take the Conjure Objects Action for 1 round after it's been used. The Conjured Objects disappear if one of the following occurs:\n●\tThe user takes the Conjure Objects Action, though it can replace the same Conjured Objects using this Action.\n●\tThe user is brought to 0 Wound Boxes or no longer has access to this Quality such as evolving to a new Stage.\nIf this Quality is taken alongside Element Master, the Conjured Objects can act as source of the element.",
    "description": "Upon taking this Quality, the Digimon gains a new resource, known as Creation Limit. "
  },
  {
    "id": "invocador",
    "name": "Summoner",
    "originalName": "Summoner",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Evoker Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Stage 2+.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Conjurer, Combat Monster, Positive Reinforcement"
    },
    "requiredFor": [
      "Evoker"
    ],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Tipo de Lacaio",
      "options": [
        {
          "key": "infantry",
          "label": "Infantry",
          "originalLabel": "Infantry",
          "creationCost": 4,
          "attackLimit": 2,
          "size": "medium",
          "statBonuses": "Movement gains a bonus equal to Stage.",
          "uniqueBenefit": "The Minions can be controlled como 1 Action, mas only once per turn.",
          "effect": "4\t2\tMovement gains a bonus equal to Stage.\tMedium\tThe Minions can be controlled as 1 Action, but only once per turn."
        },
        {
          "key": "protector",
          "label": "Protector",
          "originalLabel": "Protector",
          "creationCost": 4,
          "attackLimit": 3,
          "size": "large",
          "statBonuses": "Movement gains a bonus equal to Stage.",
          "uniqueBenefit": "A Minion can Interceder usando as Actions do Summoner.",
          "effect": "4\t3\tMovement gains a bonus equal to Stage.\tLarge\tA Minion can now Intercede, using the Summoner’s Actions."
        },
        {
          "key": "recon",
          "label": "Recon",
          "originalLabel": "Recon",
          "creationCost": 2,
          "attackLimit": 1,
          "size": "small",
          "statBonuses": "Accuracy gains a bonus equal to Stage.",
          "uniqueBenefit": "The Minions can now make ataques [RANGE], using the Range and Effective Limit do Summoner.",
          "effect": "2\t1\tAccuracy gains a bonus equal to Stage.\tSmall\tThe Minions can now make [RANGE] Attacks, using the Summoner’s Range and Effective Limit."
        },
        {
          "key": "volatile",
          "label": "Volatile",
          "originalLabel": "Volatile",
          "creationCost": 1,
          "attackLimit": 1,
          "size": "small",
          "statBonuses": "Damage gains a bonus equal to Stage.",
          "uniqueBenefit": "Um minion explode when é destruído, fazendo um ataque [MELEE][DAMAGE][T:BURST] against todos os Targets dentro da área.",
          "effect": "1\t1\tDamage gains a bonus equal to Stage.\tSmall\tA Minion now explodes when it is destroyed, making a [MELEE] [DAMAGE] [T:BURST] Attack against every Target within the Area.\n \nBelow is a list of Qualities that the Summoner may have that affects the Minions.\nAll\tInfantry Only\tProtector Only\tRecon Only\tVolatile Only\nData Optimizations:\n●\tClose Combat\n●\tWarden (Stat only)\n●\tSpeedster (Movement only)\nInstinct (Movement only)\nAccelerate\nExtra Movement (besides Flight)\nAdvanced Mobility\nReach\nSlayer\nTumbler\nNaturewalk\nResistant\nMerciful Mode\tTeleport (Movement only)\tData Specialization:\n●\tTrue Guardian\nDigizoid Armor: Obsidian (Damage Only)\tData Optimization:\n●\tRanged Striker\nData Specialization:\n●\tSniper\tData Specialization:\n●\tMobile Artillery\nSelective Targeting\nKlutz"
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resource": {
        "key": "creationLimit",
        "label": "Limite de Criação",
        "valueFormula": "bit + stage",
        "maxFormula": "bit + stage"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 2,
      "chatMessage": "Use a Action Invocar Minions to create minions em Spaces dentro do Range do Digimon."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "creation": {
      "type": "minions",
      "resourceKey": "creationLimit",
      "action": {
        "key": "summonMinions",
        "label": "Invocar Lacaios",
        "actionCost": 2,
        "cooldownRounds": 1
      },
      "rangeFrom": "range",
      "totalCreationCostCannotExceedCreationLimit": true,
      "minionBaseStats": {
        "accuracyFrom": "summonerBit",
        "damageFrom": "summonerBit",
        "movementFrom": "summonerBit",
        "canFly": true,
        "cannotDodge": true,
        "hasDerivedStats": false,
        "attacks": [
          "melee"
        ]
      },
      "minionEffectRules": {
        "doesNotBenefitOrSufferMostEffects": true,
        "affectedByDamageEffects": [
          "burn",
          "freeze",
          "poison",
          "ruin"
        ],
        "affectedByMovementEffects": [
          "push",
          "pull"
        ],
        "affectedByMovementPortionsOfEffects": [
          "root",
          "paralyze"
        ]
      },
      "leftoverCreationLimit": {
        "canIncreaseAttackLimitOncePerPoint": true
      },
      "directMinions": {
        "actionCost": 2,
        "availableActions": [
          "move",
          "attack"
        ],
        "gmMayAllowOtherDirections": true
      },
      "disappearsWhen": [
        "O user realiza a Action Invocar Minions, although it may manter minions restantes tratando-os como if ainda contribuíswithout para o Custo de Criação.",
        "O user is reduced to 0 Wound Boxes.",
        "O user no longer has access to esta Quality, como when evolving to a new Stage."
      ],
      "inheritedQualities": {
        "all": [
          "Data Optimization: Close Combat",
          "Data Optimization: Warden (only estatística)",
          "Data Optimization: Speedster (only Movement)",
          "Instinct (only Movement)",
          "Acelerar",
          "Extra Movement, exceto Flight",
          "Advanced Mobility",
          "Alcance",
          "Matador",
          "Acrobata",
          "Passo Natural",
          "Resistente",
          "Modo Misericordioso"
        ],
        "infantryOnly": [
          "Teleport (only Movement)"
        ],
        "protectorOnly": [
          "Data Specialization: True Guardian",
          "Weapondura de Digizóide: Obsidiana (only Damage)"
        ],
        "reconOnly": [
          "Data Optimization: Ranged Striker",
          "Data Specialization: Sniper"
        ],
        "volatileOnly": [
          "Data Specialization: Mobile Artillery",
          "Mira Seletiva",
          "Desastrado"
        ]
      }
    },
    "effect": "Upon taking this Quality, the Digimon gains a new resource, known as Creation Limit. Its total Creation Limit is equal to its BIT + Stage. It uses this Creation Limit when summoning Minions.\nThe Digimon can take the Summon Minions Action, which is 2 Actions. The Summon Minions Action allows the user to summon Minions to any space within the Digimons’ Range. A Minion has a Creation Cost (detailed below) which determines how much a single Minion costs to summon. The total Creation Cost of Summoned Minions cannot exceed the user’s Creation Limit.\nThe base stats of a Minion are as follows: The Minion’s Accuracy, Damage and Movement is based on the User’s BIT. The Minion is capable of flying. The Minion cannot Dodge. A minion can only take a certain number of Attacks that deal Damage before they are destroyed.\nThe Minion doesn’t have any Derived Stats and can only make [MELEE] Tagged Attacks. The Summoned Minions benefit from some Static Qualities the Summoner has (which will be elaborated below). Minions also do not benefit or suffer from any Effects, except for Effects that deal Damage ([BURN],[FREEZE],[POISON],[RUIN]), move the Minion ([PUSH] or [PULL]) or the portion of an Effect that affects Movement (such as [ROOT]or the way [PARALYZE] affects Movement).\nIf the Creation Limit isn’t reached when the Summon Minions Action is taken, any additional points can be used to increase the number of damaging Attacks a Minion once. For example, if you Summoned 3 Minions and are 2 points under the Creation Limit, you can increase the number of damaging Attacks two Minions can take before they are destroyed. If any Minions are destroyed, the cost of creating them is removed from your Creation Limit. This means that as the Minions are destroyed, you regain the resources to make them.\nThe Summoner can take 2 Actions to direct the Minions they control, allowing them to Move and Attack. These are the only two Actions available to Minions, but a GM may allow you to direct your Minions in other ways.\n\nThe user cannot take the Summon Minions Action for 1 round after it's been used. The Summoned Minions disappear if one of the following occurs:\n●\tThe user takes the Summon Minions Action, though it can choose to keep any remaining Minions by treating them as if they were contributing to the Creation Cost.\n●\tThe user is brought to 0 Wound Boxes or no longer has access to this Quality such as evolving to a new Stage.\nWhen you take this Quality, you must choose one of the following Minion Types. You will be able to summon your choice of Minion Type, detailed later in this Quality. Your choice determines the Creation Cost of your Minions, the size of your Minions, the amount of damaging Attacks they can take, a bonus to one of the Minion’s Stats and a special benefit unique to that Minion type.\n\nType\tCreation Cost\tAttack Limit\tStat Bonuses\tSize\tUnique Benefit\nInfantry\t4\t2\tMovement gains a bonus equal to Stage.\tMedium\tThe Minions can be controlled as 1 Action, but only once per turn.\nProtector\t4\t3\tMovement gains a bonus equal to Stage.\tLarge\tA Minion can now Intercede, using the Summoner’s Actions.\nRecon\t2\t1\tAccuracy gains a bonus equal to Stage.\tSmall\tThe Minions can now make [RANGE] Attacks, using the Summoner’s Range and Effective Limit.\nVolatile\t1\t1\tDamage gains a bonus equal to Stage.\tSmall\tA Minion now explodes when it is destroyed, making a [MELEE] [DAMAGE] [T:BURST] Attack against every Target within the Area.\n\nBelow is a list of Qualities that the Summoner may have that affects the Minions.\nAll\tInfantry Only\tProtector Only\tRecon Only\tVolatile Only\nData Optimizations:\n●\tClose Combat\n●\tWarden (Stat only)\n●\tSpeedster (Movement only)\nInstinct (Movement only)\nAccelerate\nExtra Movement (besides Flight)\nAdvanced Mobility\nReach\nSlayer\nTumbler\nNaturewalk\nResistant\nMerciful Mode\tTeleport (Movement only)\tData Specialization:\n●\tTrue Guardian\nDigizoid Armor: Obsidian (Damage Only)\tData Optimization:\n●\tRanged Striker\nData Specialization:\n●\tSniper\tData Specialization:\n●\tMobile Artillery\nSelective Targeting\nKlutz",
    "description": "Upon taking this Quality, the Digimon gains a new resource, known as Creation Limit. "
  },
  {
    "id": "evocador",
    "name": "Evoker",
    "originalName": "Evoker",
    "tier": "champion",
    "originalTier": "Champion Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Champion Quality"
    },
    "section": "Evoker Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Conjurer ou Summoner.",
      "qualityNames": "Conjurer, Summoner"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canTakeConjurerAndSummonerTogether": true,
      "sharedCreationLimitBetweenObjectsAndMinions": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "creation": {
      "type": "objectsAndMinions",
      "sharedCreationLimit": true,
      "combinedAction": {
        "enabled": true,
        "actionCost": 2,
        "canConjureObjectsAndSummonMinionsWithSameAction": true
      }
    },
    "effect": "CONJURER or SUMMONER\nThe Digimon is now capable of taking both Summoner and Conjurer, and can now take the Conjure Objects and Summon Minions Action as the same 2 Actions. However, the Digimon’s Creation Limit is shared between Summoned Minions and Conjured Objects. This means if you had a Creation Limit of 8, you could have up to 4 cubic spaces of Objects, and 2 Recon Minions.\n\n6.0 - Ultimate Qualities\n________________________________________\nThe following Qualities are available for all Ultimate Digimon or higher.\n\nIf you are creating your Digimon for the first time and do not have much experience with DDA 2E, skip to Free Qualities and Negative Qualities in Section 7.0.\n6.01 - Core Qualities\n________________________________________",
    "description": "CONJURER or SUMMONER The Digimon is now capable of taking both Summoner and Conjurer, and can now take the Conjure Objects and Summon Minions Action as the same 2 Actions. "
  },
  {
    "id": "especializacaoDeDados",
    "name": "Data Specialization",
    "originalName": "Data Specialization",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": true,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "rankLimit": {
      "type": "byStage",
      "byStage": {
        "baby1": 0,
        "baby2": 0,
        "child": 0,
        "adult": 0,
        "perfect": 1,
        "ultimate": 2,
        "ultimatePlus": 2
      }
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Data Optimization. Apenas Digimon de Stage Ultimate ou superior podem comprar 2 Ranks nesta Quality.",
      "qualityNames": "Data Optimization"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "dataOptimizationSpecializationPerRank",
      "label": "Data Specialization",
      "maxChoices": 2,
      "options": [
        {
          "key": "fistfulOfForce",
          "label": "Fistful of Force",
          "originalLabel": "Fistful of Force",
          "dataOptimization": "closeCombat",
          "dataOptimizationLabel": "Combatente Corpo a Corpo",
          "category": {
            "attack": true,
            "static": false,
            "trigger": false
          },
          "grants": {
            "freeQualityRanks": [
              {
                "quality": "Area Attack",
                "ranks": 1
              }
            ]
          },
          "effect": "The Digimon ganha 1 Rank gratuito em Area Attack. As Áreas de Attack [MELEE] do Digimon agora podem usar o Tamanho Máximo, e quaisquer targets dentro do Tamanho Base de uma Area Attack [DAMAGE][MELEE] não reducewithout o Damage após Weapondura pela half."
        },
        {
          "key": "flurry",
          "label": "Flurry",
          "originalLabel": "Flurry",
          "dataOptimization": "closeCombat",
          "dataOptimizationLabel": "Combatente Corpo a Corpo",
          "category": {
            "attack": false,
            "static": true,
            "trigger": true
          },
          "effect": "ATTACK\t\tSTATIC\t\tTRIGGER\n\tThe Digimon gains 1 free Rank in Area Attack.\nThe Digimon’s [MELEE] Area Attacks can now use the Maximum Size, and any Targets within the Base Size of a [DAMAGE][MELEE] Area Attack do not halve the Damage after Armor.\tThe Digimon may make an additional [MELEE][DAMAGE] Attack once per Round as 1 Action on its turn, ignoring the One Attack Per Round rule and not counting towards it. This Attack can have no extra Tags.\n \n\nRanged Striker"
        },
        {
          "key": "mobileArtillery",
          "label": "Mobile Artillery",
          "originalLabel": "Mobile Artillery",
          "dataOptimization": "rangedStriker",
          "dataOptimizationLabel": "Ranged Striker",
          "category": {
            "attack": true,
            "static": false,
            "trigger": true
          },
          "grants": {
            "freeQualityRanks": [
              {
                "quality": "Area Attack",
                "ranks": 1
              }
            ]
          },
          "effect": "The Digimon ganha 1 Rank gratuito em Area Attack. Quaisquer targets dentro do Tamanho Base da Area Attack [DAMAGE][RANGE] do Digimon não reducewithout o Damage após Weapondura pela half. Áreas de Attack [DAMAGE][RANGE] with uma Tag de Efeito mustm causar 4 ou mais Damage para aplicar o Efeito a targets dentro do Tamanho Base. Além disso, ao fazer uma Area Attack [RANGE], if o Digimon tiver pelo menos 1 Rank em Naturewalk, can choose usar 1 Action extra. If fizer isso, a área if torna Difficult Earthin associado a um Elemento de sua escolha que possua until the start of the next turn do Digimon. The Digimon deve escolher entre superfície e aéreo when declara o attack."
        },
        {
          "key": "sniper",
          "label": "Sniper",
          "originalLabel": "Sniper",
          "dataOptimization": "rangedStriker",
          "dataOptimizationLabel": "Ranged Striker",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "ATTACK\tTRIGGER\tSTATIC\n\tThe Digimon gains 1 free Rank in Area Attack.\nAny Targets within the Base Size of the Digimon’s [DAMAGE][RANGE] Area Attack do not halve the Damage after Armor. [DAMAGE][RANGE] Area Attack Attacks with an Effect Tag must deal 4 or more Damage to apply to Targets within the Base Size.\nIn addition, the Digimon can choose to use 1 extra Action if it has at least 1 Rank in Naturewalk when making a [RANGE] Area Attack. If it does, the area becomes Difficult Terrain associated with an Element of the Digimon’s choice that it has until the start of the Digimon’s next turn. (The Digimon must choose between Surface and Aerial when it declares the Attack.)\tThe Digimon gains +3 Range and Effective Limit, and the Digimon can use the Called Shot Action an unlimited number of times per Combat, but only for the Sharpshooter option. When it takes this Action, the penalty it takes to Accuracy is halved.\nWarden"
        },
        {
          "key": "trySomething",
          "label": "Try Something",
          "originalLabel": "Try Something",
          "dataOptimization": "warden",
          "dataOptimizationLabel": "Warden",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "grants": {
            "freeQualityRanks": [
              {
                "quality": "Counterattack",
                "ranks": 1
              }
            ],
            "healthBonus": 3
          },
          "effect": "The Digimon ganha 1 Rank gratuito em Counterattack. Também ganha +3 Health. Sempre que faria um attack outside seu turno usando uma Action de Interrupção, ignora a regra de um attack per Round e não conta against ela. Isso também vale para a Action Preparar, desde que o gatilho seja o Enemy errar um attack against um target predeterminado."
        },
        {
          "key": "trueGuardian",
          "label": "True Guardian",
          "originalLabel": "True Guardian",
          "dataOptimization": "warden",
          "dataOptimizationLabel": "Warden",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "STATIC\t\t\tSTATIC\n\tThe Digimon gains 1 free Rank in Counterattack.\n\nThe Digimon gains +3 Health. Whenever the Digimon would make an Attack outside of its turn using an Interrupt Action, it ignores the One Attack per Round rule and does not count towards it.\n\nThis counts for the Hold Action as long as the Trigger is the Enemy misses an Attack against a predetermined Target.\tWhenever the Digimon Intercedes, it gains a bonus to Armor equal to the distance it didn’t travel to Intercede, to a maximum bonus of its CPU.\nAdditionally, if the Digimon is within an Enemy’s Area Attack, any Allies behind the Digimon from the origin point of the Area Attack (usually the Attacker) gain a bonus to Armor equal to the Digimon’s CPU, and any Effects they would take are negated. The Digimon can take the Intercede Action in response to an Area Attack to move into it, instead of only being able to take the Area Attack Intercede.\nIf the Digimon spent 2 Actions to Intercede before the start of its turn, it gains 1 Action for that turn.\n \n\nBrawler"
        },
        {
          "key": "wrestlemania",
          "label": "Wrestlemania",
          "originalLabel": "Wrestlemania",
          "dataOptimization": "brawler",
          "dataOptimizationLabel": "Brawler",
          "category": {
            "attack": false,
            "static": true,
            "trigger": true
          },
          "grants": {
            "freeQualityRanks": [
              {
                "quality": "Prodigious Skill",
                "ranks": 1
              }
            ]
          },
          "effect": "The Digimon ganha 1 Rank gratuito em Prodigious Skill. When rolar qualquer Check que normalmente usa Clash, can use Clash, CPU (Feats of Strength) ou BIT (Performance). Qualquer bônus para Clash, como Data Optimization: Brawler ou tamanho maior, é adicionado a qualquer uma dessas opções. Sempre que causar Damage por meio de um attack while estiver em Clash, rola um Check with uma dessas opções para causar Damage adicional. O TN é 12 + o maior valor entre CPU ou RAM do target. Em critical failure, não causa Damage extra; em failure, +1 Damage; em sucesso, +3 Damage; em sucesso crítico, +5 Damage. The Digimon também can use a Action de Clash Finalizador."
        },
        {
          "key": "wrangler",
          "label": "Wrangler",
          "originalLabel": "Wrangler",
          "dataOptimization": "brawler",
          "dataOptimizationLabel": "Brawler",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "TRIGGER\tSTATIC\t\t\tSTATIC\n\tThe Digimon gains 1 Rank of the Prodigious Skill Quality for Free.\nWhen the Digimon would roll any Check that normally uses the Clash stat, it can use any of the following (any bonus to Clashing, such as Data Optimization: Brawler or being a bigger size, is added to any of the options):\n●\tClash\n●\tCPU (Feats of Strength)\n●\tBIT (Performance)\nAny time the Digimon deals Damage via an Attack while in a Clash it rolls a Check with an option listed above to deal additional Damage. The TN equals 12 + the Target’s CPU or RAM (whichever is higher).\nCritical Failure: No extra Damage.\nFailure: +1 Damage.\nSuccess: +3 Damage.\nCritical Success: +5 Damage.\nThe Digimon can also now use the Finisher Clash Action, described at the end of the Clash section.\tThe Digimon can take the Clash Action once during its Turn as a Free Action.\nIf the Digimon chooses to End a Clash, it can reinitiate a Clash with the same Target in the same Turn (this doesn’t work for Escaping a Clash).\nThis means the Digimon could End a Clash at the start of its turn, use 2 Actions outside the rules of a Clash, then reinitiate the Clash on the same turn with the Target using a Free Action to do so. However, if the opponent used Clash Comeback or Contest Pin, their bonus is applied to the attempt to Clash done later in the turn.\n \n\nSpeedster"
        },
        {
          "key": "hitAndRun",
          "label": "Hit and Run",
          "originalLabel": "Hit and Run",
          "dataOptimization": "speedster",
          "dataOptimizationLabel": "Velocista",
          "category": {
            "attack": true,
            "static": false,
            "trigger": true
          },
          "grants": {
            "freeQualityChoice": [
              "Charge Attack",
              "Recuo Pesado"
            ]
          },
          "effect": "The Digimon ganha Charge Attack ou Heavy Recoil gratuitamente. If usar um attack with Tag [CHARGE] ou [RECOIL], não fica mais restrito a if mover em linha reta e gains benefícios adicionais. Com [CHARGE], if o Digimon if mover pelo menos 2 espaços antes de atacar, adiciona seu RAM ao Damage; if [CHARGE] foi usado para if mover antes de atacar um target, can be usado novamente para if mover depois do attack. Com [RECOIL], o Digimon pode if mover antes de atacar como parte da mesma Action, mas must if mover para mais perto de um Opponent; if se mover pelo menos 2 espaços antes de atacar, adiciona seu RAM ao Damage. Ao usar qualquer uma das opções, o Digimon não can be atacado with Punishing Strike."
        },
        {
          "key": "uncatchableTarget",
          "label": "Uncatchable Target",
          "originalLabel": "Uncatchable Target",
          "dataOptimization": "speedster",
          "dataOptimizationLabel": "Velocista",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "incompatible": {
            "text": "Incompatible with Absolute Evasion.",
            "qualityNames": "Absolute Evasion"
          },
          "effect": "ATTACK\tTRIGGER\tSTATIC\t\t\tSTATIC\n\tThe Digimon gains the Charge Attack OR Heavy Recoil Quality for Free.\n\nIf the Digimon uses a [CHARGE] or [RECOIL] Tagged Attack, you are no longer restricted to move in a straight line, and, it gains the following benefits:\n●\t[CHARGE]: If the Digimon moves at least 2 spaces before making the Attack, they add their RAM to the Damage. If [CHARGE] was used to move before attacking a target, it can be used again to move after the attack as well.\n●\t[RECOIL]: The Digimon may move before attacking a target as part of the same Action, but must move closer to an opponent. If the Digimon moves at least 2 spaces before making the Attack, they add their RAM to the Damage.\nWhen you use either option, you cannot be Attacked with Punishing Strike.\tIncompatible:\nABSOLUTE EVASION\n\nThe Digimon gains +3 Dodge and does not suffer a stacking Dodge penalty if it is attacked multiple times in a round. Coordinated Assault and Data Specialization: Sniper ignore this bonus.\n\n \n\nEffect Warrior"
        },
        {
          "key": "statusWarlord",
          "label": "Status Warlord",
          "originalLabel": "Status Warlord",
          "dataOptimization": "effectWarrior",
          "dataOptimizationLabel": "Guerreiro de Efeitos",
          "category": {
            "attack": true,
            "static": false,
            "trigger": false
          },
          "incompatible": {
            "text": "Incompatible with Zoner: Friendly Fire, Dark Emblem e Holy Ward.",
            "qualityNames": "Zoner: Friendly Fire, Dark Emblem, Holy Ward"
          },
          "grants": {
            "oneTimeAttackEffectDiscount": 1
          },
          "effect": "The Digimon gains um desconto único de 1 PD em um Efeito de Attack. When o Digimon faz um attack [DAMAGE] without Tag de Efeito em seu turno, pode fazer um attack [SUPPORT] no mesmo turno ignorando a regra de um attack per Round. O inverso também funciona, permitindo um attack [DAMAGE] depois de um attack [SUPPORT]."
        },
        {
          "key": "codeWizard",
          "label": "Code Wizard",
          "originalLabel": "Code Wizard",
          "dataOptimization": "effectWarrior",
          "dataOptimizationLabel": "Guerreiro de Efeitos",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "ATTACK\t\tSTATIC\t\t\tSTATIC\n\tIncompatible\nZONER: FRIENDLY FIRE | DARK EMBLEM | HOLY WARD\nThe Digimon gains a one time 1 DP Discount on an Attack Effect.\nWhen the Digimon makes a [DAMAGE] Attack with no Effect Tag on its turn, it can make a [SUPPORT] Attack the same turn ignoring the Once per Round rule.\nThis also works vice versa, allowing a [DAMAGE] Attack after a [SUPPORT] Attack.\tThe maximum Duration for all Effects the Digimon creates increases by 1, and the Digimon can use the Called Shot Action an unlimited number of times per Combat, but only for the Focused option. When it takes this Action, the penalty it takes to Accuracy is halved.\nThe Digimon can also ignore the requirement to need the [DAMAGE] Tag on Attacks with certain Effects, such as [BURN].\nVariable"
        },
        {
          "key": "tacticalAdaptation",
          "label": "Tactical Adaptation",
          "originalLabel": "Tactical Adaptation",
          "dataOptimization": "variable",
          "dataOptimizationLabel": "Variable",
          "category": {
            "attack": true,
            "static": false,
            "trigger": false
          },
          "grants": {
            "freeQualityChoice": [
              "Uma Quality de Postura",
              "2 Ranks of Mode Change"
            ]
          },
          "effect": "The Digimon ganha uma Quality de Postura gratuitamente ou pode adquirir 2 Ranks of Mode Change gratuitamente. When a Iniciativa é rolada, o Digimon pode imediatamente realizar a Action Trocar Postura como Action Livre. Além disso, o Digimon pode realizar a Action Trocar Postura como Action Livre em seu turno. If tiver a Quality Mode Change, pode mudar de modo instead of trocar de postura with esta Quality."
        },
        {
          "key": "supremeCode",
          "label": "Supreme Code",
          "originalLabel": "Supreme Code",
          "dataOptimization": "variable",
          "dataOptimizationLabel": "Variable",
          "category": {
            "attack": false,
            "static": true,
            "trigger": false
          },
          "effect": "ATTACK\t\tSTATIC\n\tThe Digimon gains a Stance Quality for free, or it can take 2 Ranks of Mode Change for free.\nWhen Initiative is rolled, the Digimon can immediately take the Change Stance Action as a Free Action.\nAdditionally, the Digimon can take the Stance Change Action as a Free Action on its turn.\nIf the Digimon has the Mode Change Quality, it can Mode Change instead of Change Stance with this Quality.\tThe Digimon gains a +1 bonus to its Accuracy, Damage, Dodge, Armor and Health."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "For every Rank a Digimon takes in this Quality, it selects one of two options associated with its Data Optimization. Only Stage 5+ Digimon can purchase 2 Ranks in this Quality.\n\nClose Combat\tFistful of Force\tFlurry\n\tATTACK\t\tSTATIC\t\tTRIGGER\n\tThe Digimon gains 1 free Rank in Area Attack.\nThe Digimon’s [MELEE] Area Attacks can now use the Maximum Size, and any Targets within the Base Size of a [DAMAGE][MELEE] Area Attack do not halve the Damage after Armor.\tThe Digimon may make an additional [MELEE][DAMAGE] Attack once per Round as 1 Action on its turn, ignoring the One Attack Per Round rule and not counting towards it. This Attack can have no extra Tags.\n\nRanged Striker\tMobile Artillery\tSniper\n\tATTACK\tTRIGGER\tSTATIC\n\tThe Digimon gains 1 free Rank in Area Attack.\nAny Targets within the Base Size of the Digimon’s [DAMAGE][RANGE] Area Attack do not halve the Damage after Armor. [DAMAGE][RANGE] Area Attack Attacks with an Effect Tag must deal 4 or more Damage to apply to Targets within the Base Size.\nIn addition, the Digimon can choose to use 1 extra Action if it has at least 1 Rank in Naturewalk when making a [RANGE] Area Attack. If it does, the area becomes Difficult Terrain associated with an Element of the Digimon’s choice that it has until the start of the Digimon’s next turn. (The Digimon must choose between Surface and Aerial when it declares the Attack.)\tThe Digimon gains +3 Range and Effective Limit, and the Digimon can use the Called Shot Action an unlimited number of times per Combat, but only for the Sharpshooter option. When it takes this Action, the penalty it takes to Accuracy is halved.\nWarden\tTry Something\tTrue Guardian\n\t\t\tSTATIC\t\t\tSTATIC\n\tThe Digimon gains 1 free Rank in Counterattack.\n\nThe Digimon gains +3 Health. Whenever the Digimon would make an Attack outside of its turn using an Interrupt Action, it ignores the One Attack per Round rule and does not count towards it.\n\nThis counts for the Hold Action as long as the Trigger is the Enemy misses an Attack against a predetermined Target.\tWhenever the Digimon Intercedes, it gains a bonus to Armor equal to the distance it didn’t travel to Intercede, to a maximum bonus of its CPU.\nAdditionally, if the Digimon is within an Enemy’s Area Attack, any Allies behind the Digimon from the origin point of the Area Attack (usually the Attacker) gain a bonus to Armor equal to the Digimon’s CPU, and any Effects they would take are negated. The Digimon can take the Intercede Action in response to an Area Attack to move into it, instead of only being able to take the Area Attack Intercede.\nIf the Digimon spent 2 Actions to Intercede before the start of its turn, it gains 1 Action for that turn.\n\nBrawler\tWrestlemania\tWrangler\n\t\tTRIGGER\tSTATIC\t\t\tSTATIC\n\tThe Digimon gains 1 Rank of the Prodigious Skill Quality for Free.\nWhen the Digimon would roll any Check that normally uses the Clash stat, it can use any of the following (any bonus to Clashing, such as Data Optimization: Brawler or being a bigger size, is added to any of the options):\n●\tClash\n●\tCPU (Feats of Strength)\n●\tBIT (Performance)\nAny time the Digimon deals Damage via an Attack while in a Clash it rolls a Check with an option listed above to deal additional Damage. The TN equals 12 + the Target’s CPU or RAM (whichever is higher).\nCritical Failure: No extra Damage.\nFailure: +1 Damage.\nSuccess: +3 Damage.\nCritical Success: +5 Damage.\nThe Digimon can also now use the Finisher Clash Action, described at the end of the Clash section.\tThe Digimon can take the Clash Action once during its Turn as a Free Action.\nIf the Digimon chooses to End a Clash, it can reinitiate a Clash with the same Target in the same Turn (this doesn’t work for Escaping a Clash).\nThis means the Digimon could End a Clash at the start of its turn, use 2 Actions outside the rules of a Clash, then reinitiate the Clash on the same turn with the Target using a Free Action to do so. However, if the opponent used Clash Comeback or Contest Pin, their bonus is applied to the attempt to Clash done later in the turn.\n\nSpeedster\tHit and Run\tUncatchable Target\n\tATTACK\tTRIGGER\tSTATIC\t\t\tSTATIC\n\tThe Digimon gains the Charge Attack OR Heavy Recoil Quality for Free.\n\nIf the Digimon uses a [CHARGE] or [RECOIL] Tagged Attack, you are no longer restricted to move in a straight line, and, it gains the following benefits:\n●\t[CHARGE]: If the Digimon moves at least 2 spaces before making the Attack, they add their RAM to the Damage. If [CHARGE] was used to move before attacking a target, it can be used again to move after the attack as well.\n●\t[RECOIL]: The Digimon may move before attacking a target as part of the same Action, but must move closer to an opponent. If the Digimon moves at least 2 spaces before making the Attack, they add their RAM to the Damage.\nWhen you use either option, you cannot be Attacked with Punishing Strike.\tIncompatible:\nABSOLUTE EVASION\n\nThe Digimon gains +3 Dodge and does not suffer a stacking Dodge penalty if it is attacked multiple times in a round. Coordinated Assault and Data Specialization: Sniper ignore this bonus.\n\nEffect Warrior\tStatus Warlord\tCode Wizard\n\tATTACK\t\tSTATIC\t\t\tSTATIC\n\tIncompatible\nZONER: FRIENDLY FIRE | DARK EMBLEM | HOLY WARD\nThe Digimon gains a one time 1 DP Discount on an Attack Effect.\nWhen the Digimon makes a [DAMAGE] Attack with no Effect Tag on its turn, it can make a [SUPPORT] Attack the same turn ignoring the Once per Round rule.\nThis also works vice versa, allowing a [DAMAGE] Attack after a [SUPPORT] Attack.\tThe maximum Duration for all Effects the Digimon creates increases by 1, and the Digimon can use the Called Shot Action an unlimited number of times per Combat, but only for the Focused option. When it takes this Action, the penalty it takes to Accuracy is halved.\nThe Digimon can also ignore the requirement to need the [DAMAGE] Tag on Attacks with certain Effects, such as [BURN].\nVariable\tTactical Adaptation\tSupreme Code\n\tATTACK\t\tSTATIC\n\tThe Digimon gains a Stance Quality for free, or it can take 2 Ranks of Mode Change for free.\nWhen Initiative is rolled, the Digimon can immediately take the Change Stance Action as a Free Action.\nAdditionally, the Digimon can take the Stance Change Action as a Free Action on its turn.\nIf the Digimon has the Mode Change Quality, it can Mode Change instead of Change Stance with this Quality.\tThe Digimon gains a +1 bonus to its Accuracy, Damage, Dodge, Armor and Health.",
    "description": "For every Rank a Digimon takes in this Quality, it selects one of two options associated with its Data Optimization. "
  },
  {
    "id": "impulsoHibrido",
    "name": "Hybrid Drive",
    "originalName": "Hybrid Drive",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": true,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Data Optimization.",
      "qualityNames": "Data Optimization"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "mayPurchaseAnyDataSpecializationOnce": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When taking Hybrid Drive, the Digimon may now purchase any Data Specialization once, regardless of the Digimon’s Data Optimization.",
    "description": "When taking Hybrid Drive, the Digimon may now purchase any Data Specialization once, regardless of the Digimon’s Data Optimization."
  },
  {
    "id": "miriadeElemental",
    "name": "Elemental Myriad",
    "originalName": "Elemental Myriad",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Core Qualities",
    "category": {
      "core": true,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Element Master.",
      "qualityNames": "Element Master"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "naturewalkMaxRanks": 10,
      "naturewalkMaxBonusToIndividualMainStat": 2
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "A Digimon with this Quality has adapted to several elements. The Digimon can now purchase up to 10 Ranks in Naturewalk. However, the Digimon can only use Naturewalk to gain a max of +2 to any individual Main Stat.\n\n6.02 - Offensive Qualities\n________________________________________",
    "description": "A Digimon with this Quality has adapted to several elements. "
  },
  {
    "id": "ataqueCoordenado",
    "name": "Coordinated Assault",
    "originalName": "Coordinated Assault",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Offensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Aggressive Flank.",
      "qualityNames": "Aggressive Flank"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Marque um Enemy visível para facilitar ataques against ele."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "bit",
      "skill": "precision",
      "tnFormula": "10 + targetRam",
      "maintainCheckAtStartOfTurn": true,
      "maintainTnFormula": "10 + targetRam + currentAccuracyBonus"
    },
    "result": {
      "criticalFailure": "",
      "failure": "The Digimon suffers [FEAR 3] originating from the Target until the start of its next turn.",
      "success": "The Target becomes Marked.",
      "criticalSuccess": ""
    },
    "mark": {
      "enabled": true,
      "accuracyBonusPerAttackSufferedSinceMarked": 1,
      "appliesToCasterAndAllies": true,
      "startOfTurnMaintenance": true,
      "canChooseNotToMaintain": true,
      "endsIfTargetHiddenOrOutOfSightAtEndOfTargetTurn": true,
      "endsIfCasterAffectedByFearFromTarget": true,
      "endsIfCasterLosesQuality": true,
      "endsIfCasterMarksNewTarget": true,
      "endsIfCasterDefeated": true
    },
    "effect": "The Digimon can attempt to Mark an Enemy it can see as 1 Action, making a BIT (Precision) Check. The TN equals 10 + the Target’s RAM.\nCritical Failure: The Digimon suffers [FEAR 3] originating from the Target until the start of its next turn.\nFailure: Nothing happens.\nSuccess: The Target becomes Marked.\nCritical Success: The Target becomes Marked and the Accuracy bonus starts at +1.\nA Target who is Marked is easier to hit. When the Digimon or any of its Allies Attack the Target, it gains a +1 Accuracy bonus for each Attack it has suffered since it was Marked. For example, if a Marked Target had suffered 3 Attacks since it was marked, the next Attack would gain +3  Accuracy.\nAt the start of each of the Digimon’s turns, it must reroll the BIT (Precision) Check. The TN is increased by the current Accuracy bonus. On a Failure, the Target loses the Mark, while the Mark is maintained on a Success. The Digimon can instead choose to not roll, which also ends the Mark.\nThe Target can also immediately end the Mark by ending its turn hidden or out of sight of the Digimon, or if the Digimon is affected by [FEAR] originating from the Target.\nThe Mark vanishes if the Digimon loses the Quality (usually by Evolution), it Marks a new Target or is Defeated.\n\n6.03 - Defensive Qualities\n________________________________________",
    "description": "The Digimon can attempt to Mark an Enemy it can see as 1 Action, making a BIT (Precision) Check. "
  },
  {
    "id": "berserker",
    "name": "Berserker",
    "originalName": "Berserker",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Combat Monster.",
      "qualityNames": "Combat Monster"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Boiling Blood"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "maxResolve": 6
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon’s maximum Resolve becomes 6.",
    "description": "The Digimon’s maximum Resolve becomes 6."
  },
  {
    "id": "sangueFervente",
    "name": "Boiling Blood",
    "originalName": "Boiling Blood",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Defensive Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Berserker.",
      "qualityNames": "Berserker"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "startingResolveFormula": "ranks",
      "resolveAtStartOfTurnWhenMissingWoundBoxesFormula": "ranks"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When the Digimon begins Combat, it starts with Resolve equal to its Ranks in this Quality.\nWhen the Digimon is missing any Wound Boxes, it generates Resolve equal to its Ranks in this Quality at the start of its turns.\n\n6.04 - Stance Qualities\n________________________________________",
    "description": "When the Digimon begins Combat, it starts with Resolve equal to its Ranks in this Quality. "
  },
  {
    "id": "miraSentinela",
    "name": "Sentry Aim",
    "originalName": "Sentry Aim",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": "Postura Sentinela"
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stanceChange",
      "chatMessage": "Entre em Sentry Stance e crie uma Zona Sentinela."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "stance": {
      "key": "sentryStance",
      "label": "Sentry Stance",
      "originalLabel": "Sentry Stance",
      "zone": {
        "key": "sentryZone",
        "label": "Zona Sentinela",
        "followsBlastRules": true,
        "basedOnTag": "t:blast",
        "canMoveZoneAsAction": true,
        "moveZoneActionCost": 1,
        "reactionAttack": {
          "trigger": "targetEntersOrExitsZone",
          "actionCost": 0,
          "actionType": "freeInterrupt",
          "attackTagsRequired": [
            "range",
            "damage"
          ],
          "ignoresOneAttackPerRound": true,
          "doesNotCountTowardOneAttackPerRound": true,
          "cannotHaveExtraTags": true,
          "targetCanOnlyBeHitOncePerRoundByAnySentryStance": true
        }
      },
      "benefits": [
        "Ao ativar esta Postura, o Digimon posiciona uma Zona Sentinela seguindo as mesmas regras de uma Area Attack [T:BLAST].",
        "Qualquer Digimon que entre ou saia dessa Zona can be imediatamente atacado por este Digimon with um ataque [RANGE][DAMAGE] como Free Action de Interrupção while ele estiver em Sentry Stance.",
        "Esse ataque ignora a regra de um ataque per Round e não conta against ela.",
        "O ataque da Zona Sentinela cannot ter Tags extras.",
        "The Digimon não suffers penalidades de Accuracy em seus ataques [RANGE], incluindo por atacar dentro do Effective Limit, fazer Ataques Mirados ou suffersr Efeitos."
      ],
      "detriments": [
        "The Digimon suffers -2 de penalidade em Avoidance against ataques with a Tag [MELEE].",
        "The Digimon cannot mirar Enemies within 2 espaços.",
        "The Digimon trata todo terreno como Difficult Earthin."
      ]
    },
    "effect": "The Digimon gains access to a unique stance, Sentry Stance. The Digimon may enter this Stance using the Stance Change Action.\n\nWhile in this stance, it gains the following benefits and detriments:\n●\tWhen activating this Stance, the Digimon places a Sentry Zone following the same rules as a [T:BLAST] Area Attack. Any Digimon that enters or exits this Zone may be immediately attacked by this Digimon using a [RANGE] [DAMAGE] Attack as a Free Interrupt Action so long as this Digimon is in Sentry Stance, ignoring the One Attack Per Round rule and not counting towards it. This attack can have no extra Tags. The Digimon may move this Zone as 1 Action. If a Target was already hit by this Quality this Round they cannot be hit by this Quality again from this or any other Digimon in Sentry Stance.\n●\tThe Digimon does not suffer any penalties to Accuracy for its [RANGE] Attacks (including from firing within Effect Limit, making Called Shots and from Effects).\n●\tThe Digimon suffers a -2 Dodge penalty against [MELEE] Tagged attacks, and cannot target Enemies within 2 spaces.\n●\tThe Digimon treats all terrain as if they’re in Difficult Terrain.",
    "description": "The Digimon gains access to a unique stance, Sentry Stance. "
  },
  {
    "id": "golpesMarciais",
    "name": "Martial Strikes",
    "originalName": "Martial Strikes",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": "Postura Marcial"
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stanceChange",
      "chatMessage": "Entre em Martial Stance."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "stance": {
      "key": "martialStance",
      "label": "Martial Stance",
      "originalLabel": "Martial Stance",
      "freeActionOncePerRound": {
        "enabled": true,
        "target": "singleVisibleDigimon",
        "check": {
          "stat": "bit",
          "skill": "decipherIntent",
          "tnFormula": "12 + targetDos"
        },
        "result": {
          "success": "Até o início do próximo turno do Digimon, ataques [WEAPON] against esse Target tratam até três resultados 6 na Pool de Accuracy como 2 Successs instead of 1.",
          "criticalSuccess": "Além do sucesso, dobra o bônus de Accuracy e Damage fornecido por [WEAPON], without incluir benefícios de Weaponmento de Digizóide."
        }
      },
      "areaAttackRule": "If o Digimon fizer uma Area Attack que inclua o Target, os benefícios of this Quality não if aplicam aos outros Targets dentro da área.",
      "detriments": [
        "The Digimon suffers penalidade em Avoidance against ataques de Digimon não afetados por esta Quality equal to the seu SV."
      ]
    },
    "effect": "The Digimon gains access to a unique stance, Martial Stance. The Digimon may enter this Stance using the Stance Change Action.\n\nWhile in this stance, it gains the following benefits and detriments:\n●\tOnce per round as a Free Action, the Digimon may target a single Digimon it can see and make a BIT (Decipher Intent) Check. The TN equals 12 + the Target’s DOS. On a Success, whenever the Digimon makes a [WEAPON] Tagged Attack against that Target until the start of its next turn, it treats any 6s it rolled on the Accuracy Pool as 2 successes instead of 1 (up to 3 times per roll). On a Critical Success, it also doubles the bonus to Accuracy and Damage provided by [WEAPON] (this does not include benefits provided by Digizoid Weaponry). If the Digimon makes an Area Attack that includes the Target, any benefits provided by this Quality do not apply to any other Targets within the area.\n●\tThe Digimon takes a penalty to Dodge against any Attacks from Digimon unaffected by this Quality equal to its SV.",
    "description": "The Digimon gains access to a unique stance, Martial Stance. "
  },
  {
    "id": "anteciparInvestida",
    "name": "Anticipate Assault",
    "originalName": "Anticipate Assault",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Stance Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e 1 Rank of Instinct.",
      "qualityNames": "Instinct"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "stance": "Anticipate Stance"
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "stanceChange",
      "chatMessage": "Entre em Anticipate Stance."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "stance": {
      "key": "anticipateStance",
      "label": "Anticipate Stance",
      "originalLabel": "Anticipate Stance",
      "freeActionOncePerRound": {
        "enabled": true,
        "target": "singleVisibleDigimon",
        "check": {
          "stat": "ram",
          "skill": "evade",
          "tnFormula": "12 + targetDos"
        },
        "result": {
          "success": "Até o início do próximo turno do Digimon, sempre que o Target tentar atacá-lo, o Digimon trata quaisquer resultados 6 rolados na Pool de Avoidance como 2 Successs instead of 1.",
          "criticalSuccess": "Além do sucesso, dobra o bônus de Avoidance fornecido por Instinct, e os ataques do Target não reducewithout sua Pool de Avoidance, unless tenham Sniper ou Coordinated Assault."
        }
      },
      "detriments": [
        "The Digimon suffers penalidade em Weapondura against ataques de Digimon não afetados por esta Quality equal to the seu SV."
      ]
    },
    "effect": "The Digimon gains access to a unique stance, Anticipate Stance. The Digimon may enter this Stance using the Stance Change Action.\n\nWhile in this stance, it gains the following benefits and detriments:\n●\tOnce per round as a Free Action, the Digimon may target a single Digimon it can see and make a RAM (Evasion) Check. The TN equals 12 + the Target’s DOS. On a Success, whenever the Target attempts to attack the Digimon until the start of its next turn, the Digimon treats any 6s it rolled on the Dodge Pool as 2 successes instead of 1. On a Critical Success, it also doubles the bonus to Dodge provided by Instinct and the Target’s Attacks do not lower its Dodge Pool (unless they have Sniper or Coordinated Assault).\n●\tThe Digimon takes a penalty to Armor against any Attacks from Digimon unaffected by this Quality equal to its SV.\n\n6.05 - Utility Qualities\n________________________________________",
    "description": "The Digimon gains access to a unique stance, Anticipate Stance. "
  },
  {
    "id": "transportador",
    "name": "Transporter",
    "originalName": "Transporter",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Teleport.",
      "qualityNames": "Teleport"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "teleportDistanceBonus": 1,
      "canTeleportAdjacentAllies": true,
      "canTeleportAlliesOutOfHarmAsReaction": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "teleportModifier",
      "chatMessage": "Use Teleport para levar Allies adjacentes junto."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "teleport": {
      "adjacentAlliesCanBeTransported": true,
      "transportedAlliesForfeitActionNextTurn": 1,
      "forfeitedActionType": "interruptAction",
      "otherParticipantCanPayIfAllyCannot": true,
      "failsForDigimonThatCannotPayActionCost": true,
      "distanceBonus": 1
    },
    "effect": "The Digimon is now capable of warping away with allies in tow while using Teleport. The allies must be adjacent for the Transporter to work properly. This also means it can use the Teleport Quality to bring Allies out of harm’s way in reaction to an Attack.\n\nAll allies who are transported in this manner also forfeit 1 Action on their next turn (as an Interrupt Action). If a Digimon cannot pay the Action cost, another participating Digimon can choose to or this Quality doesn’t affect said Digimon.\n\nFinally, the Digimon’s Teleport distance increases by 1.",
    "description": "The Digimon is now capable of warping away with allies in tow while using Teleport. "
  },
  {
    "id": "protecaoSagrada",
    "name": "Holy Ward",
    "originalName": "Holy Ward",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e 1 Rank of Basic Effect, Advanced Effect ou Master Effect com um Positive Effect.",
      "qualityNames": "Basic Effect, Advanced Effect, Master Effect"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Dark Emblem, Status Warlord"
    },
    "requiredFor": [
      "Chaotic Balance"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao acertar um ataque with Positive Effect, [HASTE], [IMMUNE] ou [SHIELD], cure 2 Wound Boxes de um Target do ataque."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "affectedTags": {
      "positiveEffects": true,
      "tags": [
        "haste",
        "immune",
        "shield"
      ]
    },
    "effect": "Required for:\nCHAOTIC BALANCE\nIncompatible:\nDARK EMBLEM | STATUS WARLORD\nWhenever the Digimon connects with an Attack with any of the Tags listed below, the Digimon may heal 2 Wound Boxes to one of the Targets of the Attack.\nThis affects:\n●\tAny Positive Effect\n●\t[HASTE]\n●\t[IMMUNE]\n●\t[SHIELD]\nThis Quality may not be activated more than once per Round.",
    "description": "Required for: CHAOTIC BALANCE Incompatible: DARK EMBLEM | STATUS WARLORD Whenever the Digimon connects with an Attack with any of the Tags listed below, the Digimon may heal 2 Wound Boxes to one of the Targets of the Attack. "
  },
  {
    "id": "emblemaSombrio",
    "name": "Dark Emblem",
    "originalName": "Dark Emblem",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e 1 Rank of Basic Effect, Advanced Effect ou Master Effect com um Efeito Negativo.",
      "qualityNames": "Basic Effect, Advanced Effect, Master Effect"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Holy Ward, Status Warlord"
    },
    "requiredFor": [
      "Chaotic Balance"
    ],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Ao acertar um ataque with Efeito Negativo, Efeito de Damage ou certas Tags, cause 2 Damage Inalterável a um Target do ataque."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "round"
    },
    "affectedTags": {
      "negativeEffects": true,
      "damageEffects": true,
      "tags": [
        "fear",
        "doom",
        "stun",
        "blind",
        "dot"
      ]
    },
    "effect": "Whenever the Digimon connects with an Attack with any of the Tags listed below, the Digimon deals 2 Unalterable Damage to one of the Targets of the Attack.\nThis affects:\n●\tAny Negative or Damage Effect\n●\t[FEAR]\n●\t[DOOM]\n●\t[STUN]\n●\t[BLIND]\n●\t[DOT]\nThis Quality may not be activated more than once per Round.",
    "description": "Whenever the Digimon connects with an Attack with any of the Tags listed below, the Digimon deals 2 Unalterable Damage to one of the Targets of the Attack. "
  },
  {
    "id": "equilibrioCaotico",
    "name": "Chaotic Balance",
    "originalName": "Chaotic Balance",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Utility Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Holy Ward ou Dark Emblem.",
      "qualityNames": "Holy Ward, Dark Emblem"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canPurchaseHolyWardAndDarkEmblemTogether": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "chaoticBalance": {
      "bothQualitiesCannotActivateSameRound": true,
      "sameQualityCannotBeUsedNextTurnAfterUse": true,
      "alternateQualityBonusIfOtherWasUsedLastRound": 1,
      "bonusAppliesTo": [
        "healing",
        "unalterableDamage"
      ]
    },
    "effect": "HOLY WARD or DARK EMBLEM\nThe Digimon is now capable of purchasing both Holy Ward and Dark Emblem. However, both Qualities cannot be activated in the same round, and if one Quality was used, it cannot be used again the next turn. However, if one Quality was used in the last round, the other Quality gains +1 Healing or Unalterable Damage (based on the Quality).\n\nHow it Works\nIf a Digimon used Dark Emblem, it couldn’t use it again on its following turn, but it can use Holy Ward.\nIf it does so, the healing of Holy Ward gains +1 that turn, and if Dark Emblem is used in the following turn, it would also gain +1 to the Unalterable Damage it deals that turn.\n\n6.06 - Clash Qualities\n________________________________________",
    "description": "HOLY WARD or DARK EMBLEM The Digimon is now capable of purchasing both Holy Ward and Dark Emblem. "
  },
  {
    "id": "poderTitanico",
    "name": "Titan Power",
    "originalName": "Titan Power",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Monster Strength.",
      "qualityNames": "Monster Strength"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "monsterStrengthCanMoveAnySize": true,
      "chargeCanMoveAnySizeWhileClashing": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon can now attempt to move Digimon of any Size while Clashing using Monster Strength or by making a [CHARGE] Tagged Attack.",
    "description": "The Digimon can now attempt to move Digimon of any Size while Clashing using Monster Strength or by making a [CHARGE] Tagged Attack."
  },
  {
    "id": "forcaDistante",
    "name": "Distant Force",
    "originalName": "Distant Force",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Aplique [PUSH] ou [PULL] a um Target dentro do Range usando força à distância."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "type": "contested",
      "casterFormula": "bit + dos",
      "targetFormula": "targetClash",
      "countsAsClashCheck": true,
      "appliesQualities": [
        "Data Optimization: Brawler",
        "Escorregadio"
      ]
    },
    "forcedMovement": {
      "availableEffects": [
        "push",
        "pull"
      ],
      "distanceStatChoice": [
        "bit",
        "dos"
      ]
    },
    "effect": "As 1 Action, the Digimon may target a Digimon within its Range. If the Target is unwilling, the Digimon and the Target can make a contested Check. The Digimon adds its BIT + DOS to the Check, and the Target adds its Clash. This Check is counted as a Clash Check for the purpose of Qualities such as Data Optimization: Brawler or Slippery.\nIf the Target succeeds, nothing happens. If the Digimon succeeds or the Target is willing, the Digimon may apply [PUSH] or [PULL] to the Target, using either its BIT or DOS (the Digimon’s choice) to determine the distance.",
    "description": "As 1 Action, the Digimon may target a Digimon within its Range. "
  },
  {
    "id": "arremessoPoderoso",
    "name": "Power Throw",
    "originalName": "Power Throw",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Clash Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e Fastball.",
      "qualityNames": "Fastball"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "throwRangeBonus": 3,
      "throwingEnemyAddsCpuToDamage": true,
      "throwingAllyNoCrashDamage": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Whenever the Digimon throws a Target (Enemy or Ally), the Range gains +3.\nThrowing an Enemy as a [RANGE] Attack also adds the Digimon’s CPU to the Damage.\nThrowing an Ally no longer causes them to potentially take any Crash Damage from the Throw.\n\n6.07 - Effect Qualities\n________________________________________",
    "description": "Whenever the Digimon throws a Target (Enemy or Ally), the Range gains +3. "
  },
  {
    "id": "efeitoMestre",
    "name": "Master Effect",
    "originalName": "Master Effect",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Effect Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 0,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior. The Digimon cannot comprar o mesmo Efeito duas vezes. Um ataque cannot ter mais de uma Tag de Efeito de Attack.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Inspiring Guidance",
      "Overclock"
    ],
    "choices": {
      "required": true,
      "type": "effectTagPerRank",
      "label": "Master Effect Tag",
      "cannotRepeat": true,
      "options": [
        {
          "key": "exploit",
          "label": "[EXPLOIT]",
          "type": "negative",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "N\tDodge and Armor are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT"
        },
        {
          "key": "pacify",
          "label": "[PACIFY]",
          "type": "negative",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "N\tAccuracy and Damage are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT"
        },
        {
          "key": "paralyze",
          "label": "[PARALYZE]",
          "type": "negative",
          "duration": true,
          "potency": "cpu",
          "extraActionRequired": true,
          "areaRestriction": "Cannot be on the same Attack as an Area Attack Tag unless both are on a Signature Move with [SUPPORT]. Requires 2 Battery to trigger the Area Attack this way.",
          "effect": "N\tDodge is reduced.\nIn addition, the Target treats all terrain as Difficult Terrain.\nAn Attack with this Tag requires 1 extra Action.\nA Digimon may not have [PARALYZE] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\tYes\tCPU"
        },
        {
          "key": "rattled",
          "label": "[RATTLED]",
          "type": "negative",
          "duration": true,
          "potency": "cpu",
          "extraActionRequired": true,
          "effect": "N\tDamage and Dodge are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tCPU"
        },
        {
          "key": "shaken",
          "label": "[SHAKEN]",
          "type": "negative",
          "duration": true,
          "potency": "dos",
          "extraActionRequired": true,
          "effect": "N\tAccuracy and Armor are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tDOS"
        },
        {
          "key": "weak",
          "label": "[WEAK]",
          "type": "negative",
          "duration": true,
          "potency": "dos",
          "extraActionRequired": true,
          "areaRestriction": "Cannot be on the same Attack as an Area Attack Tag unless both are on a Signature Move with [SUPPORT]. Requires 2 Battery to trigger the Area Attack this way.",
          "effect": "N\tDamage and Armor are reduced.\nAn Attack with this Tag requires 1 extra Action.\nA Digimon may not have [WEAK] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\tYes\tDOS"
        },
        {
          "key": "daring",
          "label": "[DARING]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "P\tAccuracy and Armor are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT"
        },
        {
          "key": "fury",
          "label": "[FURY]",
          "type": "positive",
          "duration": true,
          "potency": "dos",
          "extraActionRequired": true,
          "effect": "P\tAccuracy and Damage are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tDOS"
        },
        {
          "key": "regen",
          "label": "[REGEN]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "areaRestriction": "Cannot be on the same Attack as an Area Attack Tag unless both are on a Signature Move with [SUPPORT]. Requires 2 Battery to trigger the Area Attack this way.",
          "effect": "P\tThe Target regains Wound Boxes at the start of each of its turns.\nIf the Target would drop to 0 Wound Boxes while it has this Effect, it drops to 1 Wound Box instead and this Effect immediately ends. A Target can only benefit from this once per Combat (it can still benefit from the healing [REGEN] normally provides).\nA Digimon may not have [REGEN] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\tYes\tBIT"
        },
        {
          "key": "steady",
          "label": "[STEADY]",
          "type": "positive",
          "duration": true,
          "potency": "cpu",
          "extraActionRequired": true,
          "effect": "P\tDamage and Dodge are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tCPU"
        },
        {
          "key": "strength",
          "label": "[STRENGTH]",
          "type": "positive",
          "duration": true,
          "potency": "dos",
          "extraActionRequired": true,
          "areaRestriction": "Cannot be on the same Attack as an Area Attack Tag unless both are on a Signature Move. Requires 2 Battery to trigger the Area Attack this way.",
          "effect": "P\tDamage and Armor are increased.\nAn Attack with this Tag requires 1 extra Action.\nA Digimon may not have [STRENGTH] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move. The Digimon requires 2 Battery to trigger the Area Attack this way.\tYes\tDOS"
        },
        {
          "key": "vigil",
          "label": "[VIGIL]",
          "type": "positive",
          "duration": true,
          "potency": "bit",
          "extraActionRequired": true,
          "effect": "P\tDodge and Armor are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT"
        },
        {
          "key": "vigor",
          "label": "[VIGOR]",
          "type": "positive",
          "duration": true,
          "potency": "ram",
          "extraActionRequired": true,
          "effect": "P\tDodge and Movement are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tRAM"
        },
        {
          "key": "ruin",
          "label": "[RUIN]",
          "type": "damage",
          "duration": true,
          "potency": "bit",
          "effect": "D\tThe Target takes Unalterable Damage equal to the Caster’s BIT at the end of each of its turns.\nThe Damage of this Effect is reduced by 1 for every other Damage Effect on the Target.\tYes\tBIT"
        },
        {
          "key": "blind",
          "label": "[BLIND]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "U\tThe Target is considered blinded for the duration.\tYes\t—"
        },
        {
          "key": "deny",
          "label": "[DENY]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "effect": "U\tThe next Effect against the Target is negated, and this Effect’s Duration immediately ends. This has no effect on [CLEANSE].\tYes\t—"
        },
        {
          "key": "dot",
          "label": "[DOT]",
          "type": "unique",
          "duration": true,
          "potency": "",
          "requiresDamageTag": true,
          "oncePerCombatPerTarget": true,
          "effect": "U\tThe Target turns into a pixelated sprite, and all of its Attacks are replaced with one [MELEE] [DAMAGE] and one [RANGE] [DAMAGE], but gains a bonus to Dodge equal to its RAM for the Duration. In addition, while transformed this way it cannot gain Battery.\nAn Attack with this Tag must have the [DAMAGE] Tag.\nA Target can only be afflicted with [DOT] once per Combat.\tYes\t—"
        },
        {
          "key": "stun",
          "label": "[STUN]",
          "type": "unique",
          "duration": "special",
          "potency": "",
          "extraActionRequired": true,
          "areaRestriction": "Cannot be on the same Attack as an Area Attack Tag unless both are on a Signature Move with [SUPPORT]. Requires 2 Battery to trigger the Area Attack this way.",
          "effect": "U\tThe Target loses 1 Action, and gains this Effect until the end of its next turn. If it had no Actions, this Effect does not activate until the end of the Target’s next turn. If the Target was Clashing, the Clash ends. The Target can regain the lost Action if this Effect is removed before the Duration ends.\nAn Attack with this Tag requires 1 extra Action.\nA Digimon may not have [STUN] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\tSpecial\t—\n\n6.08 - Mode Change Qualities\n________________________________________"
        }
      ]
    },
    "attackModifier": {
      "grantsTags": [
        "exploit",
        "pacify",
        "paralyze",
        "rattled",
        "shaken",
        "weak",
        "daring",
        "fury",
        "regen",
        "steady",
        "strength",
        "vigil",
        "vigor",
        "ruin",
        "blind",
        "deny",
        "dot",
        "stun"
      ],
      "appliesTo": "oneAttackPerPurchasedEffect",
      "onlyOneEffectTagPerAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effectRules": {
      "cannotAffectCasterWithEffectTagAttack": true,
      "positiveSelfUseRequiresOverclock": true,
      "supportAttackAppliesOnHit": true,
      "damageAttackRequiresDamageAfterArmor": 2,
      "maxEffectDuration": 3,
      "potencyReducedByResistance": true,
      "potencyMinimumAfterBonuses": 2,
      "uniqueEffectsHaveNoPotency": true,
      "statChangesAffectTotalStatsOnly": true,
      "totalStatsCannotDropBelow": 1,
      "maxUnalterableDamageFromEffectsPerRound": "targetSv * 2"
    },
    "effect": "A Digimon may apply an Attack Effect Tag it purchases to one Attack. It cannot purchase the same Effect twice.\n\nEffect\tType\tDescription\tDuration\tPotency\n[EXPLOIT]\tN\tDodge and Armor are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT\n[PACIFY]\tN\tAccuracy and Damage are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT\n[PARALYZE]\tN\tDodge is reduced.\nIn addition, the Target treats all terrain as Difficult Terrain.\nAn Attack with this Tag requires 1 extra Action.\nA Digimon may not have [PARALYZE] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\tYes\tCPU\n[RATTLED]\tN\tDamage and Dodge are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tCPU\n[SHAKEN]\tN\tAccuracy and Armor are reduced.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tDOS\n[WEAK]\tN\tDamage and Armor are reduced.\nAn Attack with this Tag requires 1 extra Action.\nA Digimon may not have [WEAK] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\tYes\tDOS\n[DARING]\tP\tAccuracy and Armor are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT\n[FURY]\tP\tAccuracy and Damage are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tDOS\n[REGEN]\tP\tThe Target regains Wound Boxes at the start of each of its turns.\nIf the Target would drop to 0 Wound Boxes while it has this Effect, it drops to 1 Wound Box instead and this Effect immediately ends. A Target can only benefit from this once per Combat (it can still benefit from the healing [REGEN] normally provides).\nA Digimon may not have [REGEN] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\tYes\tBIT\n[STEADY]\tP\tDamage and Dodge are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tCPU\n[STRENGTH]\tP\tDamage and Armor are increased.\nAn Attack with this Tag requires 1 extra Action.\nA Digimon may not have [STRENGTH] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move. The Digimon requires 2 Battery to trigger the Area Attack this way.\tYes\tDOS\n\n[VIGIL]\tP\tDodge and Armor are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tBIT\n[VIGOR]\tP\tDodge and Movement are increased.\nAn Attack with this Tag requires 1 extra Action, unless it is a Signature Move.\tYes\tRAM\n[RUIN]\tD\tThe Target takes Unalterable Damage equal to the Caster’s BIT at the end of each of its turns.\nThe Damage of this Effect is reduced by 1 for every other Damage Effect on the Target.\tYes\tBIT\n[BLIND]\tU\tThe Target is considered blinded for the duration.\tYes\t—\n[DENY]\tU\tThe next Effect against the Target is negated, and this Effect’s Duration immediately ends. This has no effect on [CLEANSE].\tYes\t—\n[DOT]\tU\tThe Target turns into a pixelated sprite, and all of its Attacks are replaced with one [MELEE] [DAMAGE] and one [RANGE] [DAMAGE], but gains a bonus to Dodge equal to its RAM for the Duration. In addition, while transformed this way it cannot gain Battery.\nAn Attack with this Tag must have the [DAMAGE] Tag.\nA Target can only be afflicted with [DOT] once per Combat.\tYes\t—\n[STUN]\tU\tThe Target loses 1 Action, and gains this Effect until the end of its next turn. If it had no Actions, this Effect does not activate until the end of the Target’s next turn. If the Target was Clashing, the Clash ends. The Target can regain the lost Action if this Effect is removed before the Duration ends.\nAn Attack with this Tag requires 1 extra Action.\nA Digimon may not have [STUN] and an Area Attack Tag on the same Attack unless they apply both Tags to a Signature Move with [SUPPORT]. The Digimon requires 2 Battery to trigger the Area Attack this way.\tSpecial\t—\n\n6.08 - Mode Change Qualities\n________________________________________",
    "description": "A Digimon may apply an Attack Effect Tag it purchases to one Attack. "
  },
  {
    "id": "mudancaDeModo",
    "name": "Mode Change",
    "originalName": "Mode Change",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Mode Change Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [
      "Superior Mode Change"
    ],
    "choices": {
      "required": true,
      "type": "modeChangePairsPerRank",
      "label": "Pares de Core Stats",
      "maxPairs": 2,
      "cannotRepeatStats": true,
      "excludedStats": [
        "health"
      ],
      "options": [
        "accuracy",
        "damage",
        "dodge",
        "armor"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "action": {
        "key": "modeChange",
        "label": "Mode Change"
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "chatMessage": "Troque os pares de Estatísticas escolhidos e ajuste o tamanho selecionado, if houver."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "modeChange": {
      "selectedStatPairsPerRank": true,
      "canSelectSizeOneStepLargerOrSmaller": true,
      "selectedSizeMustBeAvailableAtStage": true,
      "swapsSelectedStats": true,
      "swapsSelectedSize": true,
      "recalculatesDerivedStats": true,
      "qualityBonusesToTotalStatsApplyToNewValues": true,
      "resetToDefaultAtEndOfCombat": true
    },
    "effect": "For each Rank in this Quality, the Digimon selects a pair of Core Stats, except Health. A Stat cannot be selected if it was selected for another pair. The Digimon may also select a Size one step larger or smaller than its current Size (it must have access to this size at its Stage). It gains a new Action, the Mode Change Action. The Mode Change Action swaps the selected pair(s) of Stats for the Digimon, as well as its Size if a new one was selected. This adjusts any Derived Stats that would change based on their new values. This is considered a new Mode for the Digimon. Any Quality bonuses that affect Total Stats are added to the new values.\nThe Digimon resets to its default Mode at the end of Combat.",
    "description": "For each Rank in this Quality, the Digimon selects a pair of Core Stats, except Health. "
  },
  {
    "id": "mudancaDeModoSuperior",
    "name": "Superior Mode Change",
    "originalName": "Superior Mode Change",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Mode Change Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires 1 Rank of Mode Change.",
      "qualityNames": "Mode Change"
    },
    "incompatible": {
      "text": "Mode Change e Superior Mode Change cannotm ser selecionadas como Qualities Padrão.",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "superiorModeConfiguration",
      "label": "Configuração de Modo Superior",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "modeChangeModifier",
      "chatMessage": "Ao mudar de Modo, troque Qualities e ataques entre as opções padrão e de modo."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "superiorModeChange": {
      "defaultQualitiesMaxDpFormula": "stage * 3",
      "modeQualitiesTotalDpMustEqualDefaultQualities": true,
      "swapsQualitiesAndAttacks": true,
      "losesBenefitsFromRemovedQualities": true,
      "statBonusesRemovedWhenQualityRemoved": true,
      "maxWoundBoxChangesAffectCurrentWoundBoxes": true,
      "cannotLoseMaxWoundsUnlessCanLoseEqualCurrentWounds": true,
      "doesNotAffectResolve": true,
      "mustMeetRequirementsForSelectedQualities": true,
      "cannotRemoveQualitiesRequiredByKeptQualities": true,
      "attacksWithTagsFromDefaultQualitiesMustBeSelected": true,
      "createSameNumberOfNewAttacks": true
    },
    "effect": "1 Rank of MODE CHANGE\nWhen the Digimon gains this Quality, make the appropriate changes:\n●\tSelect a number of Qualities from the Digimon's purchased Qualities, with a total DP Cost equal to or less than its Stage x 3. These become its Default Qualities. Mode Change and Superior Mode Change cannot be selected.\n●\tSelect a number of Qualities from the Qualities List, with a total DP Cost equal to the total cost of its Default Qualities. These become its Mode Qualities.\n●\tSelect a number of the Digimon's Attacks. Attacks that have Tags from Default Qualities must be selected. Create the same number of new Attacks, which can have Tags granted by Mode Qualities.\nWhen the Digimon changes Mode, it swaps Qualities and Attacks between its Default and Mode options, as selected above, and remains until the Digimon has reverted. Additionally, it loses any and all benefits from Qualities it no longer has when it changes Mode, including Stat bonuses. Any change made to Maximum Wound Boxes also affects Current Wound Boxes. If the Digimon would lose Maximum Wound Boxes due to changing Modes, they must also be able to lose an equal number of Current Wound Boxes in order to do so. This does not affect Resolve. The Digimon must meet the requirements for any selected Qualities, and cannot remove Qualities that are required for any Qualities the Digimon keeps.\n\nAn Ultimate Digimon, MetalGreymon, wishes to obtain Alterous Mode via this Quality. It selects the following Qualities which it has already purchased: Data Optimization: Warden, 3 Ranks of Instinct, Chrome Digizoid Armor and Charge Attack. It then selects Data Optimization: Ranged Striker, 3 Ranks of Weapon, Chrome Digizoid Weaponry and Precise Focus as its Mode Change Qualities.\tWhen it uses New Mode to change its stats, it also swaps the Qualities it currently has with its new Mode Change Qualities, vastly changing its build in the process. It swaps the [MELEE] [DAMAGE] Attack Trident Arm with the [RANGE] [DAMAGE] Attack Positron Blaster.\n\n6.09 - Digizoid Qualities\n________________________________________\nOnce a Digimon reaches a certain level of power, they acquire a special set of Qualities which will further aid them mechanically. Digizoid is the most durable and powerful metal in the Digimon universe, and the strength of these Qualities reflect that! While not every Digimon may have Digizoid themselves, they may sport aspects which mimic or act similar to qualities possessed by Digimon with Digizoid. Don’t limit yourself due to how the Digimon is written up canonically\n\nDigizoid Qualities are purchasable by Ultimate Digimon or higher.\n\nUltimate Digimon are only capable of purchasing Digizoid Armor: Chrome and Digizoid Weaponry: Chrome.\n\nOnce they reach Mega or higher, they may purchase the other variants of Digizoid. A Digimon may only have one type of Digizoid Armor and one type of Digizoid Weaponry. So pick carefully!\n6.09a - Digizoid Armor\n________________________________________",
    "description": "1 Rank of MODE CHANGE When the Digimon gains this Quality, make the appropriate changes: ● Select a number of Qualities from the Digimon's purchased Qualities, with a total DP Cost equal to or less than its Stage x 3. "
  },
  {
    "id": "armaduraDeDigizoideCromada",
    "name": "Chrome Digizoid Armor",
    "originalName": "Chrome Digizoid Armor",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weapondura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 1,
      "healthBonus": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other DIGIZOID ARMOR\nThe Digimon gains +1 Armor and +1 Health.",
    "description": "Any other DIGIZOID ARMOR The Digimon gains +1 Armor and +1 Health."
  },
  {
    "id": "armaduraDeDigizoideAmaldicoada",
    "name": "Cursed Digizoid Armor",
    "originalName": "Cursed Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weapondura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "healthBonus": 1,
      "armorBonusWhileSufferingNegativeEffect": 2
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other DIGIZOID ARMOR\nThe Digimon gains +1 Health.\nThe Digimon gains a +2 bonus to Armor if it is currently suffering from a Negative Effect.",
    "description": "Any other DIGIZOID ARMOR The Digimon gains +1 Health. "
  },
  {
    "id": "armaduraDeDigizoideAdaptavel",
    "name": "Adaptive Digizoid Armor",
    "originalName": "Adaptive Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weapondura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfRound",
      "chatMessage": "Distribua 4 pontos entre Avoidance e Weapondura."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "adaptiveArmor": {
      "pointsPerRound": 4,
      "canSpendOn": [
        "dodge",
        "armor"
      ],
      "canSplitFreely": true
    },
    "effect": "Any other DIGIZOID ARMOR\nAt the start of the round, the Digimon gains 4 points which it can use to grant itself a bonus to either Dodge or Armor. It can split these points up as it sees fit.\nFor example, at the start of the round the Digimon may choose to spend 3 points giving itself a +3 Dodge, and then gain a +1 Armor using the remaining point.",
    "description": "Any other DIGIZOID ARMOR At the start of the round, the Digimon gains 4 points which it can use to grant itself a bonus to either Dodge or Armor. "
  },
  {
    "id": "armaduraDeDigizoideAfiada",
    "name": "Sharp Digizoid Armor",
    "originalName": "Sharp Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weapondura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 2,
      "healthBonus": 1
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "chatMessage": "When for atingido por um ataque [DAMAGE], cause 1 Damage Inalterável ao Attacker."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other DIGIZOID ARMOR\nThe Digimon gains +2 Armor and +1 Health.\nWhenever the Digimon is hit by a [DAMAGE] Attack, it deals 1 Unalterable Damage to the Attacker.",
    "description": "Any other DIGIZOID ARMOR The Digimon gains +2 Armor and +1 Health. "
  },
  {
    "id": "armaduraDeDigizoidePesada",
    "name": "Heavy Digizoid Armor",
    "originalName": "Heavy Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weapondura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 5,
      "movementPenalty": -1,
      "cpuBonus": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other DIGIZOID ARMOR\nThe Digimon gains +5 Armor.\nThe Digimon suffers a -1 penalty to its Movement, but gains +1 CPU.",
    "description": "Any other DIGIZOID ARMOR The Digimon gains +5 Armor. "
  },
  {
    "id": "armaduraDeDigizoideFlexivel",
    "name": "Flexible Digizoid Armor",
    "originalName": "Flexible Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weapondura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 2,
      "dodgeBonus": 2,
      "ramBonus": 1,
      "consideredOneSizeSmallerWhileMoving": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other DIGIZOID ARMOR\nThe Digimon gains +2 Armor and +2 Dodge.\nThe Digimon gains +1 RAM, and the Digimon is considered one size Smaller while moving. It can move through the spaces of Digimon larger than it, even if the user isn’t Small or smaller, but it cannot end its movement there.",
    "description": "Any other DIGIZOID ARMOR The Digimon gains +2 Armor and +2 Dodge. "
  },
  {
    "id": "armaduraDeDigizoideLeve",
    "name": "Light Digizoid Armor",
    "originalName": "Light Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weapondura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "dodgeBonus": 3,
      "movementBonus": 1,
      "automaticDodgeSuccesses": 1,
      "stacksWithAbsoluteEvasion": true,
      "doesNotDecreaseDodgePool": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other DIGIZOID ARMOR\nThe Digimon gains +3 Dodge.\nThe Digimon’s Movement is increased by 1, and gains a single Automatic Dodge success on every Dodge Check it makes. This stacks with Absolute Evasion, and doesn’t decrease the Dodge Pool.",
    "description": "Any other DIGIZOID ARMOR The Digimon gains +3 Dodge. "
  },
  {
    "id": "armaduraDeDigizoideRadiante",
    "name": "Shining Digizoid Armor",
    "originalName": "Shining Digizoid Armor",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Armor",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weapondura de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "armorBonus": 2,
      "healthBonus": 2,
      "incomingNegativeEffectPotencyReduction": 1,
      "incomingNegativeEffectPotencyMinimum": 1
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "reaction",
      "chatMessage": "Ao suffersr Damage Inalterável de um Enemy, role d6s para reducesir o Damage."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "unalterableDamageReduction": {
      "trigger": "wouldTakeUnalterableDamageDueToEnemy",
      "dicePerDamage": 1,
      "die": "d6",
      "reductionPerSuccess": 1
    },
    "effect": "Any other DIGIZOID ARMOR\nThe Digimon gains +2 Armor and +2 Health.\nThe Digimon reduces the Potency of incoming Negative Effects by 1 (to a minimum of 1). In addition, whenever it would take Unalterable Damage due to an Enemy, it can make a Pool Check with a number of d6s for each Damage it would take, reducing the Damage by 1 for each Success.\n\n6.09b - Digizoid Weaponry\n________________________________________",
    "description": "Any other DIGIZOID ARMOR The Digimon gains +2 Armor and +2 Health. "
  },
  {
    "id": "armamentoDeDigizoideCromado",
    "name": "Chrome Digizoid Weaponry",
    "originalName": "Chrome Digizoid Weaponry",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 2,
      "damageBonus": 1,
      "effectPotencyBonus": 1
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "ALGORITHM | Any other DIGIZOID WEAPONRY\nThe Digimon’s [WEAPON] Attacks gain +2 Accuracy, +1 Damage and +1 Potency to Effects Tags.",
    "description": "ALGORITHM | Any other DIGIZOID WEAPONRY The Digimon’s [WEAPON] Attacks gain +2 Accuracy, +1 Damage and +1 Potency to Effects Tags."
  },
  {
    "id": "armamentoDeDigizoideAmaldicoado",
    "name": "Cursed Digizoid Weaponry",
    "originalName": "Cursed Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 2,
      "damageBonus": 1,
      "conditionalDamageBonus": {
        "condition": "atHalfMaximumWoundBoxesOrFewer",
        "appliesTo": "weaponAttacks",
        "value": 2
      }
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "ALGORITHM | Any other DIGIZOID WEAPONRY\nThe Digimon’s [WEAPON] Attacks gain +2 Accuracy and +1 Damage.\nWhen the Digimon is at half its maximum Wound Boxes or fewer, it gains +2 Damage to [WEAPON] Tagged Attacks.",
    "description": "ALGORITHM | Any other DIGIZOID WEAPONRY The Digimon’s [WEAPON] Attacks gain +2 Accuracy and +1 Damage. "
  },
  {
    "id": "armamentoDeDigizoideAdaptavel",
    "name": "Adaptive Digizoid Weaponry",
    "originalName": "Adaptive Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": []
    },
    "grants": {
      "immuneToDisarm": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfTurn",
      "chatMessage": "Distribua 4 pontos entre Precision e Damage para seus ataques [WEAPON] até o início do seu próximo turno."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "adaptiveWeaponry": {
      "pointsPerTurn": 4,
      "canSpendOn": [
        "accuracy",
        "damage"
      ],
      "appliesTo": "weaponAttacks",
      "lastsUntilStartOfNextTurn": true,
      "canSplitFreely": true
    },
    "effect": "ALGORITHM | Any other DIGIZOID WEAPONRY\nAt the start of each of its turn, the Digimon gains 4 points which it can use to grant its [WEAPON] Attacks a bonus to either Accuracy or Damage which lasts until the start of its next turn. It can split these points up as it sees fit.\nFor example, at the start of the turn the Digimon may choose to spend 3 points giving itself a +3 Damage, and then gain a +1 Accuracy using the remaining points.\nIn addition, the Digimon is immune to [DISARM].",
    "description": "ALGORITHM | Any other DIGIZOID WEAPONRY At the start of each of its turn, the Digimon gains 4 points which it can use to grant its [WEAPON] Attacks a bonus to either Accuracy or Damage which lasts until the start of its next turn. "
  },
  {
    "id": "armamentoDeDigizoideAfiado",
    "name": "Sharp Digizoid Weaponry",
    "originalName": "Sharp Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 4,
      "unalterableDamageOnDamageWeaponHit": 2
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "ALGORITHM | Any other DIGIZOID WEAPONRY\nThe Digimon’s [WEAPON] Attacks gain +4 Accuracy.\nThe Digimon’s [DAMAGE] [WEAPON] Tagged Attacks deal 2 Unalterable Damage on a hit.",
    "description": "ALGORITHM | Any other DIGIZOID WEAPONRY The Digimon’s [WEAPON] Attacks gain +4 Accuracy. "
  },
  {
    "id": "armamentoDeDigizoideFlexivel",
    "name": "Flexible Digizoid Weaponry",
    "originalName": "Flexible Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "rangeWeaponRangeBonus": 1,
      "meleeWeaponReachBonus": 1,
      "meleeWeaponReachAsWideSwings": true,
      "stacksWithReachOptions": true
    },
    "grants": {
      "bitBonus": 1,
      "dodgeBonus": 3,
      "escapeClashAutomaticallySucceeds": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "ALGORITHM | Any other DIGIZOID WEAPONRY\nThe Digimon gains +1 BIT and +3 Dodge. Its [RANGE][WEAPON] Attacks gain +1 Range, and its [MELEE][WEAPON] Attacks can hit up to 1 Space further, as if it had a Rank of Reach: Wide Swings without any penalties. If the Digimon already has any Reach Option, its benefits stack with this Quality.\nIn addition, if the Digimon takes the Escape the Clash option it automatically Succeeds instead of rolling.",
    "description": "ALGORITHM | Any other DIGIZOID WEAPONRY The Digimon gains +1 BIT and +3 Dodge. "
  },
  {
    "id": "armamentoDeDigizoidePesado",
    "name": "Heavy Digizoid Weaponry",
    "originalName": "Heavy Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "damageBonus": 5,
      "damageWeaponAppliesHeavy": true,
      "heavyDurationRounds": 1
    },
    "grants": {
      "movementPenalty": -1,
      "dosBonus": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "heavyWeaponRules": {
      "weaponHeavyAttackBenefits": [
        "If o Target tiver only Extra Movement ou Teleport, seu Movement ainda é reduced.",
        "If o Target tiver Advanced Mobility e/ou Transporter, também perde os benefícios do Extra Movement e Teleport associados."
      ]
    },
    "effect": "ALGORITHM | Any other DIGIZOID WEAPONRY\nThe Digimon’s [WEAPON] Attacks gain +5 Damage.\nThe Digimon suffers a -1 penalty to its Movement, but gains +1 to DOS.\nIn addition, the Digimon’s [DAMAGE][WEAPON] Attacks apply [HEAVY] with a Duration of 1 Round. A [WEAPON][HEAVY] Attack has the following benefits:\n●\tIf the Target only has Extra Movement or Teleporter, its Movement is still reduced.\n●\tIf the Target has Advanced Mobility and/or Transporter, the also lose the benefits of the associated Extra Movement and Teleport.",
    "description": "ALGORITHM | Any other DIGIZOID WEAPONRY The Digimon’s [WEAPON] Attacks gain +5 Damage. "
  },
  {
    "id": "armamentoDeDigizoideLeve",
    "name": "Light Digizoid Weaponry",
    "originalName": "Light Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 3,
      "damageBonus": 3,
      "automaticAccuracySuccesses": 1,
      "stacksWithCertainStrike": true
    },
    "grants": {
      "extraAction": {
        "amount": 1,
        "timing": "turn",
        "allowedActions": [
          "Fortalecer",
          "Mover",
          "Movement Difícil"
        ],
        "difficultMoveStillRequiresAdditionalAction": true
      }
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "ALGORITHM | Any other DIGIZOID WEAPONRY\nThe Digimon’s [WEAPON] Tagged Attacks gain +3 Accuracy and +3 Damage.\nThe Digimon’s [WEAPON] Tagged Attacks gain a single Automatic Accuracy success on every Accuracy Check it makes. This stacks with Certain Strike.\nIn addition, the Digimon gains 1 extra Action on its turns which can be used to take the following Actions: Bolster, Move, Difficult Move (which still requires 1 additional Action).",
    "description": "ALGORITHM | Any other DIGIZOID WEAPONRY The Digimon’s [WEAPON] Tagged Attacks gain +3 Accuracy and +3 Damage. "
  },
  {
    "id": "armamentoDeDigizoideRadiante",
    "name": "Shining Digizoid Weaponry",
    "originalName": "Shining Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "accuracyBonus": 5,
      "damageBonus": 1,
      "meleeDamageMinimumAfterArmor": 2,
      "meleeSupportDurationBonusOnHit": 1,
      "rangeAndEffectiveLimitBonus": 3
    },
    "grants": {
      "temporaryIpOnInitiative": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "ALGORITHM | Any other DIGIZOID WEAPONRY\nThe Digimon’s [WEAPON] Tagged Attacks gain +5 Accuracy and +1 Damage.\nThe Digimon [WEAPON] Tagged Attacks gain an additional bonus depending on whether or not they are [MELEE] or [RANGE].\n●\t[MELEE]: The Attack deals a minimum Damage of 2 after Armor if it has the [DAMAGE] Tag. The Attack gains +1 Duration on a successful hit if it has the [SUPPORT] Tag.\n●\t[RANGE]: The Attack gains +3 to Range and Effective Limit.\nIn addition, the Digimon gains 1 Temporary IP when it rolls Initiative. This IP can be spent at any point using the standard rules used for Tamers. If the IP isn’t spent by the end of Combat, it is lost.",
    "description": "ALGORITHM | Any other DIGIZOID WEAPONRY The Digimon’s [WEAPON] Tagged Attacks gain +5 Accuracy and +1 Damage. "
  },
  {
    "id": "armamentoDeDigizoidePuro",
    "name": "Pure Digizoid Weaponry",
    "originalName": "Pure Digizoid Weaponry",
    "tier": "mega",
    "originalTier": "Mega Digizoid Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Digizoid Weaponry",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega, 1 or more Ranks of Weapon e 3 Ranks of Algorithm.",
      "qualityNames": "Weapon, Algorithm"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Weaponmento de Digizóide"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [
        "offhand"
      ],
      "accuracyBonus": 2,
      "damageBonus": 2,
      "offhandTreatedAsWeaponRank": 2,
      "weaponAndOffhandMayBothApplyToSignatureMove": true,
      "signatureMoveWeaponBonusCapFormula": "4 + currentBattery"
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other DIGIZOID WEAPONRY\nThe Digimon’s [WEAPON] Tagged Attacks gain a +2 to Damage and Accuracy.\n\nThe Digimon gains the [OFFHAND] Tag independent from the [WEAPON] Tags it already has, which is treated as if it is Rank 2 [WEAPON] Tag. Both Weapon Tags may be applied to the same Attack if it is a Signature Move, but the bonus to the Attack due to [WEAPON] cannot exceed 4 + the Digimon’s current Battery. For example, when a Digimon with [WEAPON] and [OFFHAND] on a Signature Move would use it when it has 2 Battery, it’d only have a +6 bonus to Accuracy and Damage (4 + 2 Battery), instead of +8.\n\nWhen this Digimon would suffer [DISARM], the one applying the Effect must target either the [WEAPON] or [OFFHAND] Tag, and cannot remove both at once.\n\n6.10 - Gain Force Qualities\n________________________________________\nThrough a Digimon’s evolution by pushing themselves to the utmost limit, a new power has become theirs. Gain Force, or inForce for short, are special Overwrite Sequences that allow Digimon to grant themselves new abilities that wouldn’t be possible otherwise.\n\nAnything below the Ultimate Level may not take this quality. You may only purchase a single Gain Force, so choose wisely. An Ultimate Digimon only has access to Overwrite.\n________________________________________",
    "description": "Any other DIGIZOID WEAPONRY The Digimon’s [WEAPON] Tagged Attacks gain a +2 to Damage and Accuracy. "
  },
  {
    "id": "overwrite",
    "name": "Overwrite",
    "originalName": "Overwrite",
    "tier": "perfect",
    "originalTier": "Ultimate Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Ultimate Quality"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Ultimate ou superior e 1 Rank of Instinct.",
      "qualityNames": "Instinct"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "action",
      "actionCost": 1,
      "chatMessage": "Ative Overwrite para negar Efeitos externos pagando Wound Boxes."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "overwrite": {
      "activeUntilEndOfCombat": true,
      "canEndAsFreeActionDuringTurn": true,
      "woundBoxesLostFormula": "effectCost * 2",
      "negatesEffectFromOutsideSource": true,
      "cannotNegateIfWouldDropToZeroWoundBoxes": true,
      "grantsResolveForCombatMonster": true,
      "doesNotAffectEffectsWithoutCost": true,
      "doesNotAffectEffectsGrantedByOwnQualities": true
    },
    "effect": "ALGORITHM | Any other GAIN FORCE\nAs 1 Action, the Digimon can Trigger Overwrite. While Triggered, or until the end of Combat, whenever the Digimon would suffer an Effect from an outside source, it loses Wound Boxes equal to the double the cost of that Effect to negate it. For example, if the Digimon would suffer from [DISTRACT], it instead takes 4 Unalterable Damage and completely negates it. The Digimon can also end this as a Free Action during its turn. If losing Wound Boxes would bring a Digimon’s Wound Boxes to 0, the Effect is not negated.\nLosing Wound Boxes from Overwrite grants Resolve for Combat Monster. This Quality does not affect Effects that do not have a cost (such as [DEBILITATE]), or Effects that are granted from the user’s own Qualities (such as Overclock).",
    "description": "ALGORITHM | Any other GAIN FORCE As 1 Action, the Digimon can Trigger Overwrite. "
  },
  {
    "id": "inforceImortal",
    "name": "Undying inForce",
    "originalName": "Undying inForce",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Instinct.",
      "qualityNames": "Instinct"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "passiveRegenWhenBelowHalfWounds": true,
      "secondWindCanAttackSameTurn": true,
      "secondWindAdditionalUsesFormula": "instinctRanks"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "regen": {
      "condition": "belowHalfMaximumWoundBoxes",
      "potencyFormula": "instinctRanks",
      "noEffectAtZeroWoundBoxes": true,
      "cleanseReductionOrRemovalPersistsForRounds": 1
    },
    "reroll": {
      "oncePerRound": true,
      "resetsAtEndOfDigimonTurn": true,
      "pool": "health",
      "rerollResultsUpTo": 1,
      "ifHasVitalEnergyIncreaseBy": 1,
      "maximumRerollResultsUpTo": 3
    },
    "effect": "ALGORITHM | Any other GAIN FORCE\nThe Digimon has an unparalleled regenerative ability. Whenever the Digimon would be below half their Wound Box maximum, the Digimon gains a passive [REGEN] Effect with a potency equal to its ranks in Instinct. This has no effect when the Digimon is at 0 Wound Boxes.\n\nIf this Effect would be affected by [CLEANSE], the Potency reduction or removal of the Effect only persists for 1 round.\n\nIf the Digimon has the Quality Second Wind, it bypasses the restriction that doesn't allow it to Attack the same turn it is used, and gains additional uses of it equal to its Ranks in Instinct.\n\nAdditionally, once per round (which resets at the end of the Digimon's turns), the Digimon may reroll any 1s that come up on a Health Check. If the Digimon possesses Vital Energy, the dice results you can reroll instead increase by 1 (to a maximum of 3).",
    "description": "ALGORITHM | Any other GAIN FORCE The Digimon has an unparalleled regenerative ability. "
  },
  {
    "id": "inforceTemporal",
    "name": "Temporal inForce",
    "originalName": "Temporal inForce",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Instinct.",
      "qualityNames": "Instinct"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "chooseInitiativeAfterAllRolls": true,
      "enemiesCannotTakeInterruptActionsDuringTurn": true,
      "canAdjustInitiativeEveryOtherTurn": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "initiative": {
      "noInitiativeRoll": true,
      "choosePositionAfterAllInitiativeRolls": true,
      "otherDigimonCannotInterruptDuringTurnExceptHoldAction": true,
      "adjustPositionEveryOtherTurn": true,
      "cannotAdjustIfAffectedByLag": true,
      "ifHasCombatAwareness": {
        "immuneToLag": true,
        "addInstinctRanksToCombatAwarenessBonuses": true
      }
    },
    "reroll": {
      "oncePerRound": true,
      "resetsAtEndOfDigimonTurn": true,
      "pool": "accuracy",
      "rerollResultsUpTo": 1,
      "ifHasHugePowerIncreaseBy": 1,
      "maximumRerollResultsUpTo": 3
    },
    "effect": "ALGORITHM | Any other GAIN FORCE\nYour Digimon has the extraordinary ability to repeat certain instances or is something of a temporal anomaly. You no longer have to roll Initiative for Combat. After all other rolls for Initiative have been made, you decide where you go on the Turn Order. Other Digimon cannot take Interrupt Actions during your turn, such as Intercede. The only time a Digimon can take an Action this way is due to Hold Action.\n\nAfter deciding where you go on the turn order, every other turn, you may adjust your position on the Turn Initiative. However, if your Digimon was afflicted with [LAG], they cannot adjust their turn initiative.  If the Digimon has any Ranks of Combat Awareness: you are immune to the effects of [LAG] and you add your Ranks in Instinct to any bonuses it provides.\n\nAdditionally, once per round (which resets at the end of the Digimon's turns), the Digimon may reroll any 1s that come up on an Accuracy Pool. If the Digimon possesses Huge Power, the dice results you can reroll instead increase by 1 (to a maximum of 3).",
    "description": "ALGORITHM | Any other GAIN FORCE Your Digimon has the extraordinary ability to repeat certain instances or is something of a temporal anomaly. "
  },
  {
    "id": "inforceOnisciente",
    "name": "Omniscient inForce",
    "originalName": "Omniscient inForce",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Instinct.",
      "qualityNames": "Instinct"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "canUseHoldActionAffectingSelfWithoutTamer": true,
      "freeHoldActionOncePerTurn": true,
      "holdActionCanBypassAttackOncePerTurnLimit": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "turn",
      "chatMessage": "Use Action Preparar uma vez por turno gratuitamente."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "turn"
    },
    "holdAction": {
      "affectsSelfWithoutTamer": true,
      "freeOncePerTurn": true,
      "canTakeSecondHoldActionWithTwoActions": true,
      "accuracyOrDodgePoolBonusFormula": "instinctRanks",
      "bypassOneAttackPerTurnLimitWhenUsingHoldAction": true,
      "ifUsingPaidAndFreeHoldCanUseForTwoActionCosts": true
    },
    "reroll": {
      "oncePerRound": true,
      "resetsAtEndOfDigimonTurn": true,
      "pool": "dodge",
      "rerollResultsUpTo": 1,
      "ifHasAvoidanceIncreaseBy": 1,
      "maximumRerollResultsUpTo": 3
    },
    "effect": "ALGORITHM | Any other GAIN FORCE\nYour Digimon has an extraordinary ability to predict their opponents or can even see glimpses into the future. The Digimon gains the ability to use the Hold Action which affects themselves, regardless of whether they have a Tamer.\n\nThe Digimon may take the Hold Action Once per Turn for free. Therefore, a Digimon can take two Hold Actions on its turn, one for free and one using 2 Actions. Whenever the Digimon rolls an Accuracy or Dodge Pool as part of Hold Action, it can add its ranks in Instinct as a bonus to the Pool Check. The Digimon can also bypass the once per turn limit for Attacks when it uses Hold Action. If the Digimon uses 2 Actions to take a Hold Action alongside the free Hold Action granted by this Quality, it can instead use Hold Action for something that costs 2 Actions (like Called Shot).\n\nAdditionally, once per round (which resets at the end of the Digimon's turns), the Digimon may reroll any 1s that come up on a Dodge Pool. If the Digimon possesses Avoidance, the dice results you can reroll instead increase by 1 (to a maximum of 3).",
    "description": "ALGORITHM | Any other GAIN FORCE Your Digimon has an extraordinary ability to predict their opponents or can even see glimpses into the future. "
  },
  {
    "id": "perigoDigital",
    "name": "Digital Hazard",
    "originalName": "Digital Hazard",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Instinct.",
      "qualityNames": "Instinct"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque with [HAZARD]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "hazard"
      ],
      "appliesTo": "oneAttack",
      "replacesTags": [
        "melee",
        "range",
        "damage",
        "support"
      ],
      "cannotHaveAdditionalTagsExceptEffectTags": true,
      "automaticDamageNoAccuracyOrDodgeRoll": true,
      "damageBonusFormula": "instinctRanks",
      "effectRequiresMinimumDamage": 4
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "chatMessage": "Declare um ataque [HAZARD] para causar Damage automático em tudo within half Range do ataque."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "hazard": {
      "affectsEverythingWithinHalfRange": true,
      "damageReducedByArmorNormally": true,
      "woundBoxCostAfterFirstUsePerCombatFormula": "sv",
      "noWoundBoxCostIfSignatureMove": true,
      "woundBoxCostDoesNotGrantResolve": true,
      "effectTagMinimumDamageToApply": 4
    },
    "effect": "ALGORITHM | Any other GAIN FORCE\nThe Digimon gains the effect of a single [HAZARD] Tag. This Tag can be applied to one of the Digimon’s attacks and replaces the [MELEE], [RANGE], [DAMAGE] and [SUPPORT] Tags. Once a [HAZARD] Attack is declared, the user deals automatic Damage (meaning, neither Accuracy nor Dodge are rolled) to everything within half the Attack’s Range. Damage taken from this attack is deducted by Armor as per normal. It gains a bonus to Damage equal to its ranks in Instinct.\nEach time [HAZARD] is used after its first use per Combat, the Digimon loses Wound Boxes equal to its SV, unless it is on its Signature Move. This does not add to the Digimon's Resolve.\nThis Attack cannot be given additional Tags like [PIERCING], [CERTAIN], [CHARGE], etc, with the exception being Attack Effect Tags. If there is an Effect Tag attached to the Attack with [HAZARD], a minimum of 4 Damage must be dealt to apply the Effect.",
    "description": "ALGORITHM | Any other GAIN FORCE The Digimon gains the effect of a single [HAZARD] Tag. "
  },
  {
    "id": "unidadeZero",
    "name": "Zero Unit",
    "originalName": "Zero Unit",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": true,
      "static": false,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega e 1 Rank of Instinct.",
      "qualityNames": "Instinct"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Algorithm, Any other Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "singleAttack",
      "label": "Ataque [SUPPORT] with [ZERO]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "zero"
      ],
      "appliesTo": "oneSupportAttack",
      "countsAsPositiveEffectWithNoDuration": true,
      "cannotBeAreaAttackWhenUsed": true,
      "actionCostWhenUsed": 2,
      "grantsBenefitsOncePerCombat": true
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "trigger",
      "actionCost": 2,
      "chatMessage": "Use [ZERO] para conceder evolução gratuita ou restaurar um Ally derrotado."
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "zeroUnit": {
      "chooseEffectOnAttackDeclaration": true,
      "options": [
        {
          "key": "freeEvolution",
          "target": "allAlliesWithinSvSpaces",
          "effect": "Um target pode imediatamente realizar a Action Evoluir gratuitamente if tiver desbloqueado um Stage superior para o qual possa evoluir. If a evolução exigir Pontos de Evolução, o Digimon é imediatamente tratado como if tivesse gasto Pontos de Evolução iguais aos Ranks of Instinct do Attacker, podendo então gastar quaisquer Pontos de Evolução adicionais necessários."
        },
        {
          "key": "reviveDefeatedAlly",
          "target": "singleDefeatedAlly",
          "effect": "The Digimon é imediatamente trazido de volta with Wound Boxes iguais ao double dos Ranks of Instinct do Attacker, deixando de estar derrotado. If o Digimon estava em um Stage superior antes de ser derrotado, evolui de volta para esse Stage with as Wound Boxes concedidas. Não tem efeito em Digimon que reverteram a Digi-Eggs."
        }
      ],
      "signatureMoveBonusFormula": "battery",
      "positiveEffectTagAutoAppliesToOneTargetForRoundsFormula": "instinctRanks"
    },
    "effect": "ALGORITHM | Any other GAIN FORCE\nThe Digimon applies the [ZERO] Tag to one [SUPPORT] Attack, which counts as a Positive Effect with no duration. The Attack can only grant the benefits of [ZERO] once per Combat, and when it does it cannot be used as an Area Attack and requires 2 Actions. It provides one of the following benefits, determined by a chosen Target. The Digimon chooses when to use the effect of [ZERO] when it declares the Attack, like an Area Attack.\n\nAll Allies within a number of Spaces equal to the Digimon’s SV: a Target can immediately take the Evolution Action for Free as long as it has unlocked a higher Stage it can Evolve to. If the Evolution requires Evolution Points, the Digimon is immediately treated as if it had spent Evolution Points equal to the Attacker’s Ranks of Instinct and can then spend any additional Evolution Points it requires.\n\nA single Defeated Ally: the Digimon is immediately brought back with a number of Wound Boxes equal to double the Digimon’s Ranks in Instinct, no longer Defeated. If the Digimon was in a higher Stage before it became Defeated, it evolves back to that Stage with the given Wound Boxes. This has no effect on Digimon that have reverted to DigiEggs.\n\nIf the Tag is placed on the Digimon’s Signature Move, the bonus to Evolution Points or Wound Boxes also increases based on the Digimon’s Battery. If a Positive Attack Effect Tag is used on the same Attack that [ZERO] is applied, it automatically applies the Positive Attack Effect without rolls required for a number of Rounds equal to the Digimon’s Ranks in Instinct, but only to one Target affected by the Attack.",
    "description": "ALGORITHM | Any other GAIN FORCE The Digimon applies the [ZERO] Tag to one [SUPPORT] Attack, which counts as a Positive Effect with no duration. "
  },
  {
    "id": "overwritePuro",
    "name": "Pure Overwrite",
    "originalName": "Pure Overwrite",
    "tier": "mega",
    "originalTier": "Mega Gain Force Qualities",
    "availability": {
      "minimumStage": "mega",
      "label": "Mega Quality"
    },
    "section": "Gain Force Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "mega",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Mega, 1 or more Ranks of Instinct e 3 Ranks of Algorithm.",
      "qualityNames": "Instinct, Algorithm"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Any other Gain Force"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "immuneToNegativeEffectsCostTwoOrLower": true,
      "cannotBeSuppressed": true,
      "secondWindCanActivateWithoutExpendingUse": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "Any other GAIN FORCE\nThe Digimon has survived in perilous conditions, and has gained a new form for it. The Digimon has immunity to all Negative Effects that cost 2 DP or lower. This Quality CANNOT be suppressed.\n\nIf the Digimon possesses the Quality Second Wind, it may activate it on their turn without expending a use at the cost of 1 extra Action. This also allows it to use it when there are no uses remaining.\n\n7.0 - Free & Negative Qualities\n________________________________________\nThe following section is dedicated to Free Qualities and Negative Qualities. Check with your GM to make sure they are allowed in your game.\n7.01 - Free Qualities\n________________________________________\nAs the name suggests, a Free Quality is something that a Digimon may take purely for flavor. Generally, a Digimon may only take a single Free Quality, regardless of Stage. GMs may allow or prohibit the use of Free Qualities at their discretion, or even allow for more than one Free Quality, except Memory Upgrade which is always available and does not count towards the Free Quality limit.\n________________________________________",
    "description": "Any other GAIN FORCE The Digimon has survived in perilous conditions, and has gained a new form for it. "
  },
  {
    "id": "melhoriaDeMemoria",
    "name": "Memory Upgrade",
    "originalName": "Memory Upgrade",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "requirements": {
      "text": "The Digimon só pode comprar Ranks nesta Quality for each 3 Tags de Attack obtidas por Qualities.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "attackListIncreasePerRank": 1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "FREE/Rank\tUp to 3 Ranks\tLIMITED\nThe Digimon increases its Attack List by 1.\nA Digimon can only purchase Ranks in this Quality for each 3 Attack Tags gained from Quality. For example, to take 1 Rank of Memory Upgrade, the Digimon could have purchased [PIERCING 1], [CERTAIN 1] and [CHARGE].\nThis Quality does not count towards the Digimon’s Free Quality limit.",
    "description": "FREE/Rank Up to 3 Ranks LIMITED The Digimon increases its Attack List by 1. "
  },
  {
    "id": "modoMisericordioso",
    "name": "Merciful Mode",
    "originalName": "Merciful Mode",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "attacksDefaultNonLethal": true,
      "holdBackAnyStance": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon’s Attacks are by default non-lethal. The Digimon can only take the Hold Back Action instead of the Attack Action, but you can now use Hold Back no matter the Stance.",
    "description": "The Digimon’s Attacks are by default non-lethal. "
  },
  {
    "id": "matador",
    "name": "Slayer",
    "originalName": "Slayer",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Ao comprar esta Quality, escolha uma Família, Tipo de Digimon ou Element de Naturewalk.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Alvo de Slayer",
      "options": [
        "Família",
        "Tipo de Digimon",
        "Naturewalk Element"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "accuracyBonusAgainstChosenTargetFormula": "dos"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "When the Digimon purchases this Quality, it must choose a Family, Type of Digimon (Dragon, Demon, Beast, etc), or a Naturewalk Element.\nThe Digimon gains an Accuracy bonus equal to its DOS against Enemies who match its choice. However, if it misses on an Attack that would benefit from this bonus, it takes Unalterable Damage equal to its SV.",
    "description": "When the Digimon purchases this Quality, it must choose a Family, Type of Digimon (Dragon, Demon, Beast, etc), or a Naturewalk Element. "
  },
  {
    "id": "overwriteViolento",
    "name": "Violent Overwrite",
    "originalName": "Violent Overwrite",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfRound",
      "chatMessage": "Role 1d6 para Violent Overwrite."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "randomEffect": {
      "die": "1d6",
      "results": {
        "1": "The Digimon suffers 2 Unalterable Damage.",
        "2": "The Digimon recupera 2 Wound Boxes.",
        "3-6": "Nada acontece."
      }
    },
    "effect": "At the start of every round, roll 1d6.\n1: The Digimon takes 2 Unalterable Damage.\n2: The Digimon recovers 2 Wound Boxes.",
    "description": "At the start of every round, roll 1d6. "
  },
  {
    "id": "armasCriticas",
    "name": "Critical Arms",
    "originalName": "Critical Arms",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "weaponAttack",
      "chatMessage": "Role 2d6 como Dados Críticos junto da Pool de Precision."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "criticalDice": {
      "die": "2d6",
      "rolledWith": "accuracyPool",
      "treatedAsSeparate": true,
      "results": {
        "2": "O ataque erra automaticamente, apesar da Pool de Accuracy, e o Digimon suffers [DISARM] until the end of Combat ou até gastar 2 Actions para encerrar o Efeito.",
        "12": "O ataque gains +3 Accuracy Successes e, if ainda erraria, acerta mesmo assim, ignorando os resultados de Accuracy e Avoidance.",
        "3-11": "Nada acontece."
      }
    },
    "effect": "1+ Rank of WEAPON\n●\tThe Digimon rolls 2d6 whenever the Digimon makes a [WEAPON] Attack, known as a Critical Dice. The Critical Dice is rolled at the same time as the Accuracy Pool (though it is treated as separate), and the result causes one of the following effects.\n●\t2: The Attack automatically misses (despite the results of the Accuracy Pool) and Digimon suffers from [DISARM] until the end of Combat, or until Digimon spends 2 Actions to end the Effect.\n●\t3-11: Nothing happens.\n●\t12: The Attack gains +3 Accuracy Successes, and if the Attack would miss it still hits, ignoring both Accuracy and Dodge results.",
    "description": "1+ Rank of WEAPON ● The Digimon rolls 2d6 whenever the Digimon makes a [WEAPON] Attack, known as a Critical Dice. "
  },
  {
    "id": "erroSortudo",
    "name": "Lucky Miss",
    "originalName": "Lucky Miss",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "dodge",
      "chatMessage": "Role 2d6 como Dados de Sorte junto da Pool de Avoidance."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "luckyDice": {
      "die": "2d6",
      "rolledWith": "dodgePool",
      "treatedAsSeparate": true,
      "results": {
        "2": "The Digimon trata seu resultado de Avoidance como 0.",
        "12": "A Avoidance gains +3 Successes de Avoidance e, if o ataque ainda acertar, o Damage sofrido é reduced pela half após Weapondura, arredondado para cima, e a Potency e Duration de qualquer Efeito são reduceds em 1.",
        "3-11": "Nada acontece."
      }
    },
    "effect": "The Digimon rolls 2d6 whenever the Digimon attempts to Dodge, known as a Lucky Dice. The Lucky Dice is rolled at the same time as the Dodge Pool (though it is treated as separate), and the result causes one of the following effects.\n2: The Digimon treats its Dodge result as 0.\n3-11: Nothing happens.\n12: The Dodge gains +3 Dodge Successes, and if the Attack would still hit, the Damage taken is halved after Armor (rounded up) and the Potency and Duration of any Effect is reduced by 1.",
    "description": "The Digimon rolls 2d6 whenever the Digimon attempts to Dodge, known as a Lucky Dice. "
  },
  {
    "id": "talentoInato",
    "name": "Innate Talent",
    "originalName": "Innate Talent",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Choose two Skills from a single Attribute Category.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "twoSkillsFromSingleAttributeCategory",
      "label": "Two Skills with Prodigious Skill",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "allStatsPenalty": -1,
      "prodigiousSkillForChosenSkills": true,
      "chosenSkillCount": 2
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon suffers -1 in all Stats. In exchange, they may select two Skills from a single Attribute Category and treat them as if they have Prodigious Skill in those Skills.\nFor example, if the Body Attribute is selected, the Digimon must choose two out of a selection of Athletics, Endurance, or Feats of Strength.",
    "description": "The Digimon suffers -1 in all Stats. "
  },
  {
    "id": "investidaVingativa",
    "name": "Vengeful Charge",
    "originalName": "Vengeful Charge",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "noBatteryAtStartOfTurns": true,
      "batteryWhenFirstDropsBelowHalfWounds": 3
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "STATIC",
    "description": "STATIC"
  },
  {
    "id": "justicaECega",
    "name": "Justice Is Blind",
    "originalName": "Justice Is Blind",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "The Digimon é visualmente deficiente ou cego e não consegue enxergar.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "immuneToBlind": true,
      "prodigiousAwarenessForNonSightSenses": true,
      "ignoresSightBasedIllusions": true,
      "ignoresSightImpairingEffects": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "attackModifier",
      "chatMessage": "Gaste 1 Action extra para ignorar penalidades de obscurecido against um Target único."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon is visually impaired or blind, and cannot see. The Digimon now has the following conditions:\n●\tThe Digimon is immune to [BLIND].\n●\tThe Digimon is treated as if it has Prodigious Skill: Awareness towards all senses except sight.\n●\tThe Digimon is always blinded, but treats all the Targets around it as obscured instead of hidden (unless they specifically hide).\n●\tWhen the Digimon makes an Attack against a single Target, they can ignore the penalties from being obscured at the cost of 1 extra Action. If the Digimon has a Tamer, the Tamer can spend their own Action instead.\n●\tThe Digimon ignores all Illusions based on sight, as well as any sight-impairing effects such as smoke or darkness.",
    "description": "The Digimon is visually impaired or blind, and cannot see. "
  },
  {
    "id": "tamanhoInconsistente",
    "name": "Inconsistent Size",
    "originalName": "Inconsistent Size",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "adult",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "adult",
      "maximum": ""
    },
    "requirements": {
      "text": "Requires Champion. Não tem efeito if o Digimon if tornar seu Stage Padrão.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "onEvolution",
      "chatMessage": "Role 1d6 para determinar o tamanho do Digimon neste Stage."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "randomSize": {
      "die": "1d6",
      "results": {
        "1": "small",
        "6": "huge",
        "2-3": "medium",
        "4-5": "large"
      },
      "lastsUntilEndOfCombatAndDevolution": true,
      "affectsDerivedStatsNormally": true
    },
    "effect": "The Digimon has no control over the size it becomes once it evolves. This has no effect on the Digimon if it becomes its Default Stage.\nUpon the Digimon’s evolution to the Stage with this Quality, roll 1d6 to determine its size according to the table. The Digimon’s size remains this way, until the end of Combat and they devolve. This affects the Digimon’s Derived Stats as Size normally does.\n1: Small.\n2-3: Medium.\n4-5: Large.\n6: Huge.",
    "description": "The Digimon has no control over the size it becomes once it evolves. "
  },
  {
    "id": "armaSelada",
    "name": "Sealed Weapon",
    "originalName": "Sealed Weapon",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Weapon.",
      "qualityNames": "Weapon"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "appliesTo": "weaponAttacks",
      "grantsTags": [],
      "weaponRankTreatedAsOneHigherAfterUnlock": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "1+ Rank of WEAPON\nThe Digimon cannot use [WEAPON] Attacks until its Wound Boxes drop below half its maximum the first time in Combat. However, the Digimon’s [WEAPON] Attacks are treated as 1 Rank higher, even at [WEAPON 3] (increasing Accuracy, Damage, and secondary bonuses by 1).",
    "description": "1+ Rank of WEAPON The Digimon cannot use [WEAPON] Attacks until its Wound Boxes drop below half its maximum the first time in Combat. "
  },
  {
    "id": "instintoDesperto",
    "name": "Awakened Instinct",
    "originalName": "Awakened Instinct",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Instinct.",
      "qualityNames": "Instinct"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "temporaryWoundBoxesWhenFirstDropsBelowHalfFormula": "instinctRanks * 2"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": true,
      "value": 1,
      "max": 1,
      "recharge": "combat"
    },
    "effect": "1+ Rank of INSTINCT\nThe Digimon does not gain the Dodge and Movement benefits from Instinct until its Wound Boxes drop below half its maximum the first time in Combat. However, the Digimon also gains Temporary Wound Boxes equal to double its Ranks in Instinct when it drops below that threshold.",
    "description": "1+ Rank of INSTINCT The Digimon does not gain the Dodge and Movement benefits from Instinct until its Wound Boxes drop below half its maximum the first time in Combat. "
  },
  {
    "id": "reforcoPositivo",
    "name": "Positive Reinforcement",
    "originalName": "Positive Reinforcement",
    "tier": "free",
    "originalTier": "Free Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Free Quality"
    },
    "section": "Free Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": true,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": true,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requires Combat Monster, Conjurer ou Summoner.",
      "qualityNames": "Combat Monster, Conjurer, Summoner"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "moodMeter": true
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "moodMeter",
      "chatMessage": "Ajuste o Humor do Digimon conforme acertos, esquivas, erros e ataques sofridos."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "moodMeter": {
      "die": "1d6",
      "startsAt": 3,
      "gainMoodWhen": [
        "The Digimon acerta um ataque.",
        "The Digimon esquiva de um ataque."
      ],
      "loseMoodWhen": [
        "The Digimon erra um ataque.",
        "The Digimon is hit por um ataque."
      ],
      "effects": {
        "poor": {
          "values": [
            1,
            2
          ],
          "effect": "O Humor é Ruim e o Digimon perde -1 Accuracy e -1 Weapondura for each ponto abaixo de 3."
        },
        "neutral": {
          "values": [
            3,
            4
          ],
          "effect": "O Humor é Neutro e não concede bônus nem penalidades."
        },
        "good": {
          "values": [
            5,
            6
          ],
          "effect": "O Humor é Bom e o Digimon ganha +1 Avoidance e +1 Damage for each ponto acima de 4."
        }
      },
      "partnerCheerUp": {
        "condition": "moodAt1",
        "actionCost": 2,
        "setMoodTo": 4
      }
    },
    "effect": "Requirement:\nCOMBAT MONSTER | CONJURER | SUMMONER\nThe Digimon is a particularly sensitive soul, and needs a lot of Positive Reinforcement to bounce back after taking a misstep. The Digimon gains a Mood Meter, represented with a 1d6, and starts with a Mood of 3 every combat. Upon taking this quality, this Digimon works with the following convention:\n●\tWhenever the Digimon lands an attack or dodges an attack, it gains +1 Mood.\n●\tConversely, whenever the Digimon misses an Attack or is hit by an attack, it suffers -1 Mood.\nDepending on the Digimon’s Mood Value, they gain the following benefits or demerits:\n\nRoll\tEffect\n1\tThe Digimon’s Mood is considered to be Poor, and loses -1 Accuracy and Armor for every point below 3.\n2\n3\tThe Digimon’s Mood is considered to be Neutral, and does not have any positives or negatives.\n4\n5\tThe Digimon’s Mood is considered to be Good, and gains +1 Dodge and Damage for every point above 4.\n6\n\nIf the Digimon’s Mood drops to 1, the Human Partner may use 2 Actions to cheer up their Digimon to set their Digimon’s Mood Value to 4.\n\n7.02 - Negative Qualities\n________________________________________\nThese are all a collection of Qualities which, when applied to a Digimon, grants a mechanical downside but inversely grants the Digimon a bonus amount of DP to utilize.\n\nDo keep in mind that it is perfectly fine to omit not taking any Negative Qualities on your Digimon, as this is an option that players may subject themselves to in exchange for additional DP. Be sure to ask your GM whether Negative Qualities will be used in a campaign. The total DP a Digimon can gain from Negative Qualities is equal to SV.\n________________________________________",
    "description": "Requirement: COMBAT MONSTER | CONJURER | SUMMONER The Digimon is a particularly sensitive soul, and needs a lot of Positive Reinforcement to bounce back after taking a misstep. "
  },
  {
    "id": "volumoso",
    "name": "Bulky",
    "originalName": "Bulky",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Accelerate"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "movementPenaltyPerRank": -1,
      "teleportRangePenaltyPerRank": -1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "For every Rank a Digimon takes in this Quality, its Movement is lowered by 1. If the Digimon has the Teleport Quality, its range is also reduced by the same amount.",
    "description": "For every Rank a Digimon takes in this Quality, its Movement is lowered by 1. "
  },
  {
    "id": "baixaVitalidade",
    "name": "Low Vitality",
    "originalName": "Low Vitality",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -3,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "halveMaximumWoundBoxes": true,
      "cannotGainTemporaryWoundBoxes": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon’s maximum Wound Boxes are halved, and cannot gain Temporary Wound Boxes.",
    "description": "The Digimon’s maximum Wound Boxes are halved, and cannot gain Temporary Wound Boxes."
  },
  {
    "id": "assinaturaComplexa",
    "name": "Complex Signature",
    "originalName": "Complex Signature",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "O Movement Assinatura deve ter pelo menos 2 outras Tags vindas de Qualities não Negativas. O ataque cannot já exigir 2 ou mais Actions.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "signatureMove",
      "label": "Signature Move with [COMPLEX]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "complex"
      ],
      "appliesTo": "signatureMove",
      "actionCostIncrease": 1
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon applies the [COMPLEX] Tag to its Signature Move. The Signature Move must already have 2 other Tags from non-Negative Qualities. The Attack requires 1 extra Action. The Attack cannot already require 2 or more Actions to take this Quality (such as an Attack with the [HASTE] Tags).",
    "description": "The Digimon applies the [COMPLEX] Tag to its Signature Move. "
  },
  {
    "id": "bateriaDefeituosa",
    "name": "Faulty Battery",
    "originalName": "Faulty Battery",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfTurn",
      "chatMessage": "If começar o turno with 3 Battery, perca toda a Battery e Wound Boxes iguais a SV + 3."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "If the Digimon starts its turn with 3 Battery, the Digimon loses all of its current Battery and Wound Boxes equal to SV + 3. This does not add to Resolve.",
    "description": "If the Digimon starts its turn with 3 Battery, the Digimon loses all of its current Battery and Wound Boxes equal to SV + 3. "
  },
  {
    "id": "vulneravel",
    "name": "Vulnerable",
    "originalName": "Vulnerable",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": false
    },
    "requirements": {
      "text": "The Digimon cannot adquirir Ranks nesta Quality if sua Endurance já for 0.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Focused Resistance, Immunity"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "resistancePenaltyPerRank": -1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The Digimon’s Resistance is lowered by the Ranks in this Quality. If an Effect would be prematurely ended against the Digimon (such as the Special Order Tough it Out! or another Digimon using a [CLEANSE] Attack) the Digimon loses Wound Boxes equal to the DP cost of the Effect. This does not add to Resolve.\nThe Digimon cannot take Ranks in this Quality if its Resistance is already 0.",
    "description": "The Digimon’s Resistance is lowered by the Ranks in this Quality. "
  },
  {
    "id": "perfuracaoDesastrada",
    "name": "Fumbled Piercing",
    "originalName": "Fumbled Piercing",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Armor Piercing. Can only ter tantos Ranks nesta Quality quanto possuir em Certain Strike, conforme o texto original.",
      "qualityNames": "Armor Piercing"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "attackWithPiercing",
      "label": "Ataque [PIERCING] que gains [FUMBLE]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "fumble"
      ],
      "appliesTo": "attackWithPiercing",
      "additionalTargetDodgeSuccessesForPiercingFormula": "ranks * 2",
      "equalAccuracyAndDodgeCountsAsMiss": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1+ Ranks of ARMOR PIERCING\nThe Digimon gains the use of the [FUMBLE] Tag, and must apply it to the Attack with the [PIERCING] Tag. It can only have as many Ranks in Fumbled Piercing  as it does in Certain Strike.\nA Target hit by a [FUMBLE] Attack is treated as having additional Dodge Successes equal to double the Ranks in this Quality for the purpose of calculating the Unalterable Damage from Armor Piercing. For example, a [FUMBLE 2] Attack treats the Target’s Dodge Successes as 4 higher to calculate the Unalterable Damage, meaning the Digimon needs 5 Accuracy Successes to deal 1 Unalterable Damage, or 6 Successes to deal 2.\nIn addition, the Attack is treated as a miss if it only has the same Accuracy Successes as the Target’s Dodge Successes.",
    "description": "1+ Ranks of ARMOR PIERCING The Digimon gains the use of the [FUMBLE] Tag, and must apply it to the Attack with the [PIERCING] Tag. "
  },
  {
    "id": "golpeEnfraquecido",
    "name": "Weakened Strike",
    "originalName": "Weakened Strike",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": true,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 3,
      "limited": true
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Certain Strike. Cannot ser aplicada a um ataque com a Tag [SUPPORT].",
      "qualityNames": "Certain Strike"
    },
    "incompatible": {
      "text": "Cannot ser aplicada a ataque [SUPPORT].",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "attackWithCertain",
      "label": "Ataque [CERTAIN] que gains [FRAGILE]",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [
        "fragile"
      ],
      "appliesTo": "attackWithCertain",
      "cannotApplyToSupportAttack": true,
      "damagePenaltyFormula": "ranks",
      "effectPotencyPenaltyFormula": "ranks",
      "effectDurationPenaltyFormula": "ranks",
      "minimumEffectPotencyAndDuration": 0
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1+ Rank of CERTAIN STRIKE\nThe Digimon gains the use of the [FRAGILE] Tag, and must apply it to the attack with the [CERTAIN] Tag. It can only have as many Ranks in Fragile Strike as it does in Certain Strike. This cannot be applied to an Attack with the [SUPPORT] Tag.\nA [FRAGILE] Attack suffers a penalty to Damage and Effect Potency and Duration (minimum of 0)  equal to the Ranks in this Quality.",
    "description": "1+ Rank of CERTAIN STRIKE The Digimon gains the use of the [FRAGILE] Tag, and must apply it to the attack with the [CERTAIN] Tag. "
  },
  {
    "id": "miraIndiscriminada",
    "name": "Indiscriminate Targetting",
    "originalName": "Indiscriminate Targetting",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Area Attack.",
      "qualityNames": "Area Attack"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Zoner"
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "areaAttacksTargetAllPotentialTargetsExceptAttacker": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1+ Rank of AREA ATTACK\nIncompatible\nZONER\nThe Digimon’s Area Attacks can no longer distinguish friend from foe, targeting all potential Targets within the area besides the Attacker.",
    "description": "1+ Rank of AREA ATTACK Incompatible ZONER The Digimon’s Area Attacks can no longer distinguish friend from foe, targeting all potential Targets within the area besides the Attacker."
  },
  {
    "id": "decepcionante",
    "name": "Underwhelming",
    "originalName": "Underwhelming",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Huge Power.",
      "qualityNames": "Huge Power"
    },
    "incompatible": {
      "text": "Huge Power cannot mais ser usado em um ataque with a Tag [CERTAIN].",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": [],
      "hugePowerFinalAccuracySuccessPenaltyFormula": "ranks",
      "hugePowerCannotBeUsedOnCertainAttack": true
    },
    "grants": {},
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1+ Rank of HUGE POWER\nWhenever Huge Power is used, the Digimon must reduce the final Accuracy Successes by 1 for each Rank in this Quality. The Digimon can only have as many Ranks in Underwhelming as it does in Huge Power.\n\nHuge Power can no longer be used on an attack with the [CERTAIN] Tag.",
    "description": "1+ Rank of HUGE POWER Whenever Huge Power is used, the Digimon must reduce the final Accuracy Successes by 1 for each Rank in this Quality. "
  },
  {
    "id": "flancoAberto",
    "name": "Broadside",
    "originalName": "Broadside",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Avoidance.",
      "qualityNames": "Avoidance"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "avoidanceFinalDodgeSuccessPenaltyFormula": "ranks"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1+ Rank of AVOIDANCE\nWhenever Avoidance is used, the Digimon must reduce the final Dodge Successes by 1 for each Rank in this Quality. The Digimon can only have as many Ranks in Broadside as it does in Avoidance.",
    "description": "1+ Rank of AVOIDANCE Whenever Avoidance is used, the Digimon must reduce the final Dodge Successes by 1 for each Rank in this Quality. "
  },
  {
    "id": "doenca",
    "name": "Illness",
    "originalName": "Illness",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Vital Energy.",
      "qualityNames": "Vital Energy"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "vitalEnergyFinalHealthSuccessPenaltyFormula": "ranks"
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1+ Rank of VITAL ENERGY\nWhenever Vital Energy is used, the Digimon must reduce the final Health Successes by 1 for each Rank in this Quality. The Digimon can only have as many Ranks in Illness as it does in Vital Energy.",
    "description": "1+ Rank of VITAL ENERGY Whenever Vital Energy is used, the Digimon must reduce the final Health Successes by 1 for each Rank in this Quality. "
  },
  {
    "id": "erroDeSistema",
    "name": "System Error",
    "originalName": "System Error",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": false
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of System Boost.",
      "qualityNames": "System Boost"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "derivedStatPerRank",
      "label": "Reduced Derived Stat",
      "cannotChooseStatsAffectedBySystemBoost": true,
      "options": [
        "ram",
        "cpu",
        "bit",
        "dos"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "chosenDerivedStatPenaltyPerRank": -1
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1+ Rank of SYSTEM BOOST\nFor each Rank in this Quality the Digimon takes, it lowers one of its Derived Stats by 1. It may only decrease a Derived Stat that isn’t affected by System Boost. The Digimon can only have as many Ranks in System Error as it does in System Boost.",
    "description": "1+ Rank of SYSTEM BOOST For each Rank in this Quality the Digimon takes, it lowers one of its Derived Stats by 1. "
  },
  {
    "id": "fraquezaNatural",
    "name": "Natural Weakness",
    "originalName": "Natural Weakness",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": true,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 2,
      "limited": true
    },
    "requirements": {
      "text": "Requires 1 or more Ranks of Naturewalk.",
      "qualityNames": "Naturewalk"
    },
    "incompatible": {
      "text": "",
      "qualityNames": "Elemental Myriad"
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "twoElementsPerRank",
      "label": "Natural Weakness Elements",
      "cannotChooseNaturewalkElements": true,
      "options": [
        "Fire",
        "Water",
        "Wind",
        "Earth",
        "Ice",
        "Wood",
        "Steel",
        "Thunder",
        "Darkness",
        "Light"
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "elementalForceDamageBonusDoubledAgainstChosenElements": true
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "1+ Rank of NATUREWALK\nIncompatible\nELEMENTAL MYRIAD\nThe Digimon must choose 2 Elements from Naturewalk for each Rank in this Quality, which it hasn’t already taken with Naturewalk. Whenever the Digimon is hit by an Elemental Force Attack consisting of any of the chosen Elements, the Damage bonus from Elemental Force is doubled against it.\nThe Digimon can only have as many Ranks in Natural Weakness as it does in Naturewalk.",
    "description": "1+ Rank of NATUREWALK Incompatible ELEMENTAL MYRIAD The Digimon must choose 2 Elements from Naturewalk for each Rank in this Quality, which it hasn’t already taken with Naturewalk. "
  },
  {
    "id": "programaExploravel",
    "name": "Exploitable Program",
    "originalName": "Exploitable Program",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -1,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "enemyTnUsingThisDigimonDerivedStatPenalty": -3
    },
    "activation": {
      "enabled": false,
      "active": false,
      "mode": "passive",
      "chatMessage": ""
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "The TN for any Enemy that requires a Derived Stat from the Digimon, such as Mighty Blow or Substitute, is reduced by 3.",
    "description": "The TN for any Enemy that requires a Derived Stat from the Digimon, such as Mighty Blow or Substitute, is reduced by 3."
  },
  {
    "id": "pontoDeEbulicao",
    "name": "Boiling Point",
    "originalName": "Boiling Point",
    "tier": "negative",
    "originalTier": "Negative Qualities",
    "availability": {
      "minimumStage": "",
      "label": "Negative Quality"
    },
    "section": "Negative Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": false,
      "static": true,
      "free": false,
      "negative": true
    },
    "cost": {
      "dp": -2,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": true
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "requirements": {
      "text": "Requires Combat Monster.",
      "qualityNames": "Combat Monster"
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": false,
      "type": "",
      "options": []
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {},
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "startOfTurn",
      "chatMessage": "If começar o turno with Resolve maximum, faça um Check CPU (Endurance)."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "check": {
      "enabled": true,
      "stat": "cpu",
      "skill": "endurance",
      "tnFormula": "15 - dos"
    },
    "result": {
      "criticalFailure": "",
      "failure": "Same as a Failure, but it loses Wound Boxes equal to its current Resolve instead of half.",
      "success": "The TN for this Quality increases by the Digimon’s maximum Resolve until the end of Combat.",
      "criticalSuccess": ""
    },
    "effect": "When the Digimon starts its turn with maximum Resolve, it must make a CPU (Endurance) Check. The TN equals 15 - DOS.\nCritical Failure: Same as a Failure, but it loses Wound Boxes equal to its current Resolve instead of half.\nFailure: The Digimon loses Wound Boxes equal to half its current Resolve, and then loses all Resolve.\nSuccess: The TN for this Quality increases by the Digimon’s maximum Resolve until the end of Combat.\nCritical Success: Same as Success, but the TN only increases by half the Digimon’s maximum Resolve.",
    "description": "When the Digimon starts its turn with maximum Resolve, it must make a CPU (Endurance) Check. "
  },
  {
    "id": "burstPower",
    "name": "Burst Power",
    "originalName": "Burst Power",
    "section": "Optional Qualities",
    "category": {
      "core": false,
      "attack": false,
      "trigger": true,
      "static": true,
      "free": false,
      "negative": false
    },
    "cost": {
      "dp": 0,
      "perRank": false,
      "coreDiscountAvailable": false,
      "countsAgainstFreeLimit": false,
      "grantsDp": false
    },
    "rank": {
      "value": 1,
      "max": 1,
      "limited": false
    },
    "stageRequirement": {
      "enabled": true,
      "minimum": "perfect",
      "maximum": ""
    },
    "requirements": {
      "text": "Usually granted at Stage 4 or above, at the GM's discretion.",
      "qualityNames": ""
    },
    "incompatible": {
      "text": "",
      "qualityNames": ""
    },
    "requiredFor": [],
    "choices": {
      "required": true,
      "type": "single",
      "label": "Burst Bonus",
      "options": [
        {
          "key": "theFutureIsNow",
          "label": "The Future is Now",
          "attribute": "agility",
          "tags": ["S", "T"],
          "effect": "Upon taking this bonus, the Digimon can buy a second rank of Digizoid Weaponry. You may not take the same Digizoid Weaponry twice."
        },
        {
          "key": "boilingPower",
          "label": "Boiling Power",
          "attribute": "agility",
          "tags": ["T", "A"],
          "effect": "If the Digimon has Charge Attack, for every space moved, they may add 1 additional Damage up to the Tamer's Agility."
        },
        {
          "key": "oneVision",
          "label": "One Vision",
          "attribute": "body",
          "tags": ["T"],
          "effect": "The Digimon gains one instance of Reflect as an Intercede Declaration. When the Digimon would take an attack that deals half or more of their Wound Box total, they may reflect half the damage taken."
        },
        {
          "key": "theBiggestDreamer",
          "label": "The Biggest Dreamer",
          "attribute": "body",
          "tags": ["S"],
          "effect": "Upon taking this bonus, the Digimon can buy a second rank of Digizoid Armor. You may not take the same Digizoid Armor twice."
        },
        {
          "key": "butterFlyEffect",
          "label": "Butter-Fly Effect",
          "attribute": "charisma",
          "tags": ["T"],
          "effect": "The Digimon may reset a number of consecutive turns in initiative equal to the number of rounds remaining in Burst Mode. Those rounds are consumed."
        },
        {
          "key": "beMyLight",
          "label": "Be My Light",
          "attribute": "charisma",
          "tags": ["T"],
          "effect": "Pick an ally. [P] effects given by the Digimon to that ally affect them at BIT x2 Potency, last a single round, do not need to be rolled for, and cannot be reapplied to that ally."
        },
        {
          "key": "warGame",
          "label": "War Game",
          "attribute": "intelligence",
          "tags": ["T", "A"],
          "effect": "Pick one of the Digimon's Area Attacks. While in Burst Mode, that Area Attack is counted as having x2 Range and must be used as a Complex Action."
        },
        {
          "key": "beatHit",
          "label": "Beat Hit",
          "attribute": "intelligence",
          "tags": ["T", "A"],
          "effect": "The Digimon gains the use of another Signature Move tag they can apply to another attack."
        },
        {
          "key": "endlessTale",
          "label": "Endless Tale",
          "attribute": "willpower",
          "tags": ["T"],
          "effect": "If the Digimon would be reduced to 0 Wound Boxes, they are sent out of Burst Mode with 10 Wound Boxes left. If they have Second Wind, they may roll a recovery check as a free action when Burst Power ends."
        },
        {
          "key": "thoseWhoInheritCourage",
          "label": "Those Who Inherit Courage",
          "attribute": "willpower",
          "tags": ["T"],
          "effect": "If the Digimon would be reduced to 0 Wound Boxes, all remaining allies regain 5 Wound Boxes and gain a Damage and Armor bonus equal to the Digimon's CPU. The Digimon is counted as out of battle and cannot return through Revitalize."
        }
      ]
    },
    "attackModifier": {
      "grantsTags": []
    },
    "grants": {
      "specialEvolution": {
        "method": "burst",
        "durationTurns": 3,
        "requiresTamerBraveryCheck": true,
        "tnByCampaignLevel": {
          "classic": 18,
          "standard": 20,
          "extreme": 22
        },
        "bonusesByTamerAttribute": {
          "agility": {
            "accuracy": 5,
            "damage": 5,
            "movement": 5
          },
          "body": {
            "accuracy": 5,
            "armor": 5,
            "tempWounds": 5
          },
          "charisma": {
            "accuracy": 5,
            "dodge": 5
          },
          "intelligence": {
            "damage": 5,
            "dodge": 5,
            "range": 5
          },
          "willpower": {
            "damage": 5,
            "armor": 5
          }
        }
      }
    },
    "activation": {
      "enabled": true,
      "active": false,
      "mode": "specialEvolution",
      "chatMessage": "Declare Burst Power to activate a Burst Mode route for 3 turns after the Tamer succeeds at a Bravery Check."
    },
    "uses": {
      "enabled": false,
      "value": 0,
      "max": 0,
      "recharge": ""
    },
    "effect": "This Quality lets the Digimon activate a Burst Mode route in the Evolution Planner. When Burst Power is declared, the Tamer makes a Bravery Check against TN 18, 20, or 22 for Classic, Standard, or Extreme campaigns. On success, the Digimon enters Burst Mode for 3 turns. The numeric bonus depends on the Tamer's highest Attribute: Agility grants +5 Accuracy, +5 Damage, and +5 Movement; Body grants +5 Armor, +5 Accuracy, and +5 Temporary Wound Boxes; Charisma grants +5 Accuracy and +5 Dodge; Intelligence grants +5 Dodge, +5 Damage, and +5 Range; Willpower grants +5 Damage and +5 Armor. The Digimon also chooses one special bonus tied to the dominant Attribute.",
    "description": "Burst Power is an optional endgame Quality. It represents an extreme reserve of Digicore power or a manifestation of the bond between Digimon and Tamer, functioning as a special temporary Mode Change.",
    "tier": "perfect",
    "originalTier": "Optional Qualities",
    "availability": {
      "minimumStage": "perfect",
      "label": "Optional Quality"
    }
  }
];

let cachedQualitiesLanguage = "";
let cachedLocalizedQualities = null;

function getLocalizedDigimonQualities() {
  const language = isEnglishLanguage() ? "en" : "pt-BR";

  if (cachedLocalizedQualities && cachedQualitiesLanguage === language) {
    return cachedLocalizedQualities;
  }

  cachedQualitiesLanguage = language;

  const sourceQualities = language === "en"
    ? DDA_DIGIMON_QUALITIES_EN
    : DDA_DIGIMON_QUALITIES_PT;

  cachedLocalizedQualities = applyDefaultQualityAvailability(sourceQualities)
    .map((quality) => normalizeQualityAutomationData(quality))
    .map((quality) => {
      return localizeDigimonQualityPresentation(
        quality,
        language
      );
    });

  return cachedLocalizedQualities;
}

/**
 * Language-aware array proxy.
 *
 * This avoids freezing the exported list at module-load time.
 * Foundry may cache this module while the world is still in another language,
 * or the user may change language without a full world restart. By resolving
 * the active language on every array access, the Quality Browser and other
 * consumers always receive the correct PT/EN dataset.
 */
function createLocalizedQualitiesProxy() {
  const target = [];

  return new Proxy(target, {
    get(_target, prop) {
      const qualities = getLocalizedDigimonQualities();

      if (prop === Symbol.iterator) {
        return qualities[Symbol.iterator].bind(qualities);
      }

      if (prop === "toJSON") {
        return () => qualities;
      }

      if (prop === "valueOf") {
        return () => qualities;
      }

      if (prop === "length") {
        return qualities.length;
      }

      const value = qualities[prop];

      if (typeof value === "function") {
        return value.bind(qualities);
      }

      return value;
    },

    has(_target, prop) {
      return prop in getLocalizedDigimonQualities();
    },

    ownKeys() {
      return Reflect.ownKeys(getLocalizedDigimonQualities());
    },

    getOwnPropertyDescriptor(_target, prop) {
      const qualities = getLocalizedDigimonQualities();
      const descriptor = Object.getOwnPropertyDescriptor(qualities, prop);

      if (!descriptor) return undefined;

      return {
        ...descriptor,
        configurable: true
      };
    }
  });
}

export const DDA_DIGIMON_QUALITIES = createLocalizedQualitiesProxy();

export function getDdaDigimonQualities() {
  return getLocalizedDigimonQualities();
}