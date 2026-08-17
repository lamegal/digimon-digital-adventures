import { EFFECT_TAGS } from "../rules/quality-automation.js";

function isEnglishLanguage() {
  const language = String(
    globalThis.game?.i18n?.lang ??
    globalThis.game?.i18n?.language ??
    ""
  );

  return language.toLowerCase().startsWith("en");
}

function text(pt, en) {
  return isEnglishLanguage() ? en : pt;
}

function effectChoiceOptions() {
  return Object.entries(EFFECT_TAGS).map(([key, definition]) => ({
    key,
    label: `[${key.toUpperCase()}]`,
    originalLabel: `[${key.toUpperCase()}]`,
    type: String(definition?.type ?? "unique"),
    potency: String(definition?.potency ?? ""),
    duration: definition?.duration ?? true,
    effect: text(
      `O Digimon ignora a Duração e a Potência de [${key.toUpperCase()}] quando esse Efeito o tiver como alvo.`,
      `The Digimon ignores the Duration and Potency of [${key.toUpperCase()}] when that Effect targets it.`
    )
  }));
}

function bossEffectOptions() {
  const demoralize = [
    ["agility", "Agilidade", "Agility"],
    ["body", "Corpo", "Body"],
    ["charisma", "Carisma", "Charisma"],
    ["intelligence", "Inteligência", "Intelligence"],
    ["willpower", "Força de Vontade", "Willpower"]
  ].map(([attribute, pt, en]) => ({
    key: `demoralize-${attribute}`,
    effectTag: "demoralize",
    label: `[DEMORALIZE] — ${text(pt, en)}`,
    originalLabel: `[DEMORALIZE] — ${en}`,
    variantLabel: text(pt, en),
    selectedAttribute: attribute,
    type: "negative",
    duration: false,
    requiresSupportTag: true,
    effect: text(
      `Este Ataque deve ser [SUPPORT], só pode ter Tamers como alvo e não causa Dano. Ao acertar, reduz ${pt} do Tamer em 1 pelo resto do Combate. Talentos que exigem esse Atributo ficam indisponíveis enquanto a redução persistir.`,
      `This Attack must be [SUPPORT], can only target Tamers, and deals no Damage. On a hit, the Tamer loses 1 ${en} for the rest of Combat. Talents requiring that Attribute become unavailable while the reduction remains.`
    )
  }));

  return [
    {
      key: "charm",
      effectTag: "charm",
      label: "[CHARM]",
      originalLabel: "[CHARM]",
      type: "negative",
      duration: true,
      effect: text(
        "Pela Duração, o Conjurador controla as Ações do alvo e o alvo trata o Conjurador como Aliado para Qualidades. Se o alvo tiver Tamer, ele pode usar 2 Ações para fazer um Teste de Carisma ou Força de Vontade contra NA 10 + BIT do Conjurador; em Sucesso, [CHARM] termina imediatamente.",
        "For the Duration, the Caster controls the Target's Actions and the Target treats the Caster as an Ally for Qualities. If the Target has a Tamer, the Tamer may spend 2 Actions on a Charisma or Willpower Skill Check against TN 10 + the Caster's BIT; on a Success, [CHARM] immediately ends."
      )
    },
    {
      key: "bug",
      effectTag: "bug",
      label: "[BUG]",
      originalLabel: "[BUG]",
      type: "negative",
      duration: true,
      effect: text(
        "Todas as Estatísticas Derivadas do alvo são trocadas pela Duração: CPU ↔ DOS e BIT ↔ RAM. Efeitos, Qualidades e outros valores que usam essas Estatísticas também passam a usar os valores trocados.",
        "All of the Target's Derived Stats swap for the Duration: CPU ↔ DOS and BIT ↔ RAM. Effects, Qualities, and other values that use those Derived Stats also use the swapped values."
      )
    },
    ...demoralize,
    {
      key: "frenzy",
      effectTag: "frenzy",
      label: "[FRENZY]",
      originalLabel: "[FRENZY]",
      type: "negative",
      duration: true,
      maximumDuration: 3,
      effect: text(
        "O alvo deixa de receber benefícios de Ações de Tamer e Ordens Especiais e deve atacar o alvo mais próximo a cada rodada. Se não puder atacar, sofre Dano Inalterável igual ao dobro do Estágio. Um Tamer pode usar 1 Ação para fazer um Teste de Carisma contra NA 10 + DOS do Conjurador para direcionar o ataque; um Sucesso Crítico também reduz a Duração em 1. Duração máxima: 3 rodadas.",
        "The Target is no longer affected by Tamer Actions and Special Orders and must attack the nearest Target every round. If it cannot Attack, it takes Unalterable Damage equal to twice its Stage. A Tamer may spend 1 Action on a Charisma Check against TN 10 + the Caster's DOS to choose the Target; a Critical Success also reduces Duration by 1. Maximum Duration: 3 rounds."
      )
    },
    {
      key: "invincible",
      effectTag: "invincible",
      label: "[INVINCIBLE]",
      originalLabel: "[INVINCIBLE]",
      type: "positive",
      duration: "special",
      requiresSignature: true,
      forbidsAreaAttack: true,
      effect: text(
        "Este Ataque deve ser um Movimento Assinatura e não pode ser usado como Ataque de Área. O alvo nega completamente Ataques recebidos até o início do próximo turno do Conjurador, exceto Called Shots. Cada uso aumenta em 1 a Bateria mínima necessária para usar o Movimento Assinatura.",
        "This Attack must be a Signature Move and cannot be used as an Area Attack. The Target completely negates incoming Attacks until the start of the Caster's next turn, except Called Shots. Each use increases the minimum Battery required to use the Signature Move by 1."
      )
    }
  ];
}

function makeBossQuality({
  id,
  namePt,
  nameEn,
  kind = "static",
  cost = 1,
  perRank = false,
  maxRank = 1,
  limited = false,
  requirementsTextPt = "",
  requirementsTextEn = "",
  qualityNames = "",
  incompatibleTextPt = "",
  incompatibleTextEn = "",
  incompatibleNames = "",
  minimumStage = "",
  choices = null,
  grants = {},
  attackModifier = {},
  activation = null,
  uses = null,
  effectPt = "",
  effectEn = "",
  boss = {}
}) {
  const isAttack = kind === "attack" || kind === "triggerAttack";
  const isTrigger = kind === "trigger" || kind === "triggerAttack";
  const isStatic = kind === "static";
  const section = isAttack
    ? text("Qualidades de Ataque de Chefe", "Boss Attack Qualities")
    : isTrigger
      ? text("Qualidades de Gatilho de Chefe", "Boss Trigger Qualities")
      : text("Qualidades Estáticas de Chefe", "Boss Static Qualities");

  return {
    id,
    name: text(namePt, nameEn),
    originalName: nameEn,
    bossQuality: true,
    section,
    category: {
      core: false,
      attack: isAttack,
      trigger: isTrigger,
      static: isStatic,
      boss: true,
      free: false,
      negative: false
    },
    cost: {
      dp: cost,
      perRank,
      coreDiscountAvailable: false,
      discountAvailable: false,
      countsAgainstFreeLimit: false,
      grantsDp: false
    },
    rank: {
      value: 1,
      max: maxRank,
      limited
    },
    stageRequirement: {
      enabled: Boolean(minimumStage),
      minimum: minimumStage,
      maximum: ""
    },
    requirements: {
      text: text(requirementsTextPt, requirementsTextEn),
      qualityNames
    },
    incompatible: {
      text: text(incompatibleTextPt, incompatibleTextEn),
      qualityNames: incompatibleNames
    },
    requiredFor: [],
    choices: choices ?? {
      required: false,
      type: "",
      options: []
    },
    attackModifier: {
      grantsTags: [],
      ...attackModifier
    },
    grants: {
      mainStats: {},
      miscStats: {},
      derivedStats: {},
      automaticSuccesses: {},
      ...grants
    },
    activation: activation ?? {
      enabled: false,
      active: false,
      mode: "passive",
      chatMessage: ""
    },
    uses: uses ?? {
      enabled: false,
      value: 0,
      max: 0,
      recharge: ""
    },
    boss: {
      key: id,
      ...boss
    },
    effect: text(effectPt, effectEn),
    description: text(effectPt, effectEn),
    tier: "boss",
    originalTier: "Boss Qualities",
    availability: {
      minimumStage,
      label: text("Qualidade de Chefe", "Boss Quality")
    }
  };
}

export function getDdaBossQualities() {
  return [
    makeBossQuality({
      id: "inteligenciaAdaptativa",
      namePt: "Inteligência Adaptativa",
      nameEn: "Adaptive Intelligence",
      cost: 1,
      effectPt: "O Digimon recebe um bônus cumulativo de +2 em Esquiva contra cada Ataque que já tenha visto desde o início do Combate, para cada vez que tiver visto aquele Ataque. Estar dentro da área de um Ataque de Área também conta como ter visto o Ataque.",
      effectEn: "The Digimon gains a stacking +2 Dodge bonus against Attacks it has already seen for every time it has seen that Attack since the beginning of Combat. Being in the area of an Area Attack also counts as seeing it.",
      boss: { adaptiveIntelligence: true }
    }),
    makeBossQuality({
      id: "finesseBoss",
      namePt: "Finesse",
      nameEn: "Finesse",
      cost: 1,
      perRank: true,
      maxRank: 99,
      limited: true,
      grants: {
        mainStatsPerRank: { armor: 1 }
      },
      attackModifier: {
        enabled: true,
        appliesTo: "damage",
        unalterableDamagePerRank: 1
      },
      effectPt: "Para cada Rank, o Digimon recebe +1 Armadura e todos os seus Ataques [DAMAGE] causam +1 Dano Inalterável ao acertar. O máximo de Ranks é igual ao Estágio do Digimon.",
      effectEn: "For each Rank, the Digimon gains +1 Armor and all of its [DAMAGE] Attacks deal 1 additional Unalterable Damage on a hit. Maximum Ranks equal the Digimon's Stage.",
      boss: { rankLimit: "stage" }
    }),
    makeBossQuality({
      id: "imunidadeBoss",
      namePt: "Imunidade",
      nameEn: "Immunity",
      cost: 1,
      perRank: true,
      maxRank: 99,
      limited: true,
      choices: {
        required: true,
        type: "perRank",
        label: text("Efeito de Ataque", "Attack Effect"),
        cannotRepeat: true,
        options: effectChoiceOptions()
      },
      effectPt: "Para cada Rank, escolha um Efeito de Ataque. Um Efeito escolhido que tiver este Digimon como alvo não possui Duração nem Potência. O máximo de Ranks é igual ao Estágio do Digimon.",
      effectEn: "For each Rank, choose one Attack Effect. A chosen Effect targeting this Digimon has no Duration or Potency. Maximum Ranks equal the Digimon's Stage.",
      boss: { rankLimit: "stage", effectImmunity: true }
    }),
    makeBossQuality({
      id: "multigrapplerBoss",
      namePt: "Multigrappler",
      nameEn: "Multigrappler",
      cost: 3,
      effectPt: "O Digimon pode participar de Clash com vários inimigos, até o máximo de seu Estágio. Se também possuir Reach, pode realizar Clash à distância com 1 inimigo sem penalidades.",
      effectEn: "The Digimon can Clash with multiple enemies, up to its Stage. If it also has Reach, it may Clash at Range with 1 enemy without penalties.",
      boss: { multiClash: true }
    }),
    makeBossQuality({
      id: "sistemaIlimitadoBoss",
      namePt: "Sistema Ilimitado",
      nameEn: "Limitless System",
      cost: 2,
      effectPt: "O Digimon pode comprar vários Ranks de Impulso de Sistema e pode escolher a mesma Estatística Derivada mais de uma vez.",
      effectEn: "The Digimon can purchase multiple Ranks in System Boost and may choose the same Derived Stat multiple times.",
      boss: { limitlessSystem: true }
    }),
    makeBossQuality({
      id: "distorcaoEspacialBoss",
      namePt: "Distorção Espacial",
      nameEn: "Spatial Distortion",
      cost: 2,
      requirementsTextPt: "Requer Teleporte.",
      requirementsTextEn: "Requires Teleport.",
      qualityNames: "Teleport",
      effectPt: "Ao fazer um Ataque, o Digimon pode gastar +1 Ação para ignorar a distância até o alvo. Ataques [RANGE] não sofrem penalidade de Precisão por distância e Ataques [MELEE] podem ser feitos a qualquer distância. Linha de visão ainda é necessária.",
      effectEn: "When making an Attack, the Digimon may spend +1 Action to ignore distance to the Target. [RANGE] Attacks suffer no Accuracy penalty from distance and [MELEE] Attacks can be made at any distance. Line of sight is still required.",
      boss: { spatialDistortion: true, extraActionCost: 1 }
    }),
    makeBossQuality({
      id: "supressaoBoss",
      namePt: "Supressão",
      nameEn: "Suppression",
      cost: 3,
      choices: {
        required: true,
        type: "single",
        label: text("Tipo de Qualidade suprimida", "Suppressed Quality type"),
        cannotRepeat: true,
        options: [
          { key: "static", label: text("Estáticas", "Static") },
          { key: "trigger", label: text("Gatilho", "Trigger") },
          { key: "attack", label: text("Ataque", "Attack") }
        ]
      },
      effectPt: "Ao comprar, escolha Qualidades Estáticas, de Gatilho ou de Ataque. Outros Digimon a até DOS espaços não podem se beneficiar nem ativar Qualidades do tipo escolhido. Um Digimon na área pode usar 2 Ações para fazer um Teste de DOS contra NA 10 + DOS do Supressor; em Sucesso, ignora a Supressão pelo resto do Combate.",
      effectEn: "Choose Static, Trigger, or Attack Qualities when purchased. Other Digimon within DOS spaces cannot benefit from or activate Qualities of that type. A Digimon in the area may spend 2 Actions on a DOS Skill Check against TN 10 + the Suppressor's DOS; on a Success, it ignores Suppression for the rest of Combat.",
      boss: { suppression: true }
    }),
    makeBossQuality({
      id: "visaoVerdadeiraBoss",
      namePt: "Visão Verdadeira",
      nameEn: "True Sight",
      cost: 1,
      requirementsTextPt: "Requer Consciência de Combate.",
      requirementsTextEn: "Requires Combat Awareness.",
      qualityNames: "Combat Awareness",
      incompatibleTextPt: "Incompatível com Justiça é Cega.",
      incompatibleTextEn: "Incompatible with Justice Is Blind.",
      incompatibleNames: "Justice Is Blind",
      effectPt: "O Digimon é imune a [BLIND], pode ver através de objetos sólidos e detecta automaticamente Digimon tentando usar Hide from Plain Sight.",
      effectEn: "The Digimon is immune to [BLIND], can see through solid objects, and automatically sees Digimon attempting to use Hide from Plain Sight.",
      boss: { trueSight: true, immuneEffects: ["blind"] }
    }),
    makeBossQuality({
      id: "algoritmoSupremoBoss",
      namePt: "Algoritmo Supremo",
      nameEn: "Ultimate Algorithm",
      cost: 1,
      minimumStage: "perfect",
      requirementsTextPt: "Requer Estágio 4+ e 2 Ranks de Algoritmo.",
      requirementsTextEn: "Requires Stage 4+ and 2 Ranks of Algorithm.",
      qualityNames: "Algorithm",
      effectPt: "O Digimon pode comprar 1 Rank adicional de Algoritmo e ignora a incompatibilidade com Gain Forces normais e Armamentos de Digizoide.",
      effectEn: "The Digimon can purchase 1 additional Rank of Algorithm and ignores the incompatibility with normal Gain Forces and Digizoid Weaponry.",
      boss: { ultimateAlgorithm: true }
    }),
    makeBossQuality({
      id: "potencialLiberadoBoss",
      namePt: "Potencial Liberado",
      nameEn: "Unleashed Potential",
      cost: 2,
      perRank: true,
      maxRank: 99,
      effectPt: "O Digimon soma seus Ranks nesta Qualidade ao próprio Estágio apenas para atender requisitos de compra de Qualidades.",
      effectEn: "The Digimon adds its Ranks in this Quality to its Stage for the purpose of purchasing Qualities.",
      boss: { purchaseStageBonusPerRank: 1 }
    }),
    makeBossQuality({
      id: "destinoImutavelBoss",
      namePt: "Destino Imutável",
      nameEn: "Unchangeable Fate",
      cost: 1,
      effectPt: "O Digimon não pode ser afetado pelas opções de Inspiração dos Jogadores, exceto Milagre. Isso impede alterar as rolagens do Boss, mas não impede os Jogadores de rerrolarem seus próprios resultados.",
      effectEn: "The Digimon cannot be affected by Player Inspiration options except Miracle. This prevents altering the Boss's own rolls, but does not stop Players from rerolling their own results.",
      boss: { unchangeableFate: true }
    }),

    makeBossQuality({
      id: "contraAtaqueEmCadeiaBoss",
      namePt: "Contra-Ataque em Cadeia",
      nameEn: "Chain Counter",
      kind: "triggerAttack",
      cost: 3,
      requirementsTextPt: "Requer 1 Rank de Contra-Ataque.",
      requirementsTextEn: "Requires 1 Rank of Counterattack.",
      qualityNames: "Counterattack",
      effectPt: "Uma vez por rodada, o Digimon pode usar Contra-Ataque sem gastar um uso da Qualidade, mas ainda precisa gastar uma Ação de Interrupção.",
      effectEn: "Once per round, the Digimon may use Counterattack without expending a use of the Quality, though it still expends an Interrupt Action.",
      boss: { chainCounter: true }
    }),
    makeBossQuality({
      id: "destruicaoEmMassaBoss",
      namePt: "Destruição em Massa",
      nameEn: "Mass Destruction",
      kind: "triggerAttack",
      cost: 1,
      requirementsTextPt: "Requer 1 Rank de Contra-Ataque.",
      requirementsTextEn: "Requires 1 Rank of Counterattack.",
      qualityNames: "Counterattack",
      effectPt: "Quando o Digimon destrói um Minion invocado usando Contra-Ataque, mantém o uso da Qualidade e recupera 1 Ação.",
      effectEn: "When the Digimon destroys a summoned Minion through Counterattack, it retains its use of the Quality and regains 1 Action.",
      boss: { massDestruction: true }
    }),
    makeBossQuality({
      id: "absorcaoDeDadosBoss",
      namePt: "Absorção de Dados",
      nameEn: "Data Absorb",
      kind: "trigger",
      cost: 2,
      requirementsTextPt: "Requer Trojan.",
      requirementsTextEn: "Requires Trojan.",
      qualityNames: "Trojan",
      activation: {
        enabled: true,
        active: false,
        mode: "action",
        actionCost: 1,
        chatMessage: text("Ative ou desative Absorção de Dados como 1 Ação.", "Toggle Data Absorb as 1 Action.")
      },
      effectPt: "Como 1 Ação, o Digimon ativa ou desativa esta Qualidade. Enquanto ativa, Movimento é reduzido a 0 e o Digimon recupera 6 Caixas de Ferimento no fim de cada Rodada, ou 8 se possuir Firewall.",
      effectEn: "As 1 Action, the Digimon may activate or deactivate this Quality. While active, Movement is reduced to 0 and the Digimon heals 6 Wound Boxes at the end of each Round, or 8 if it has Firewall.",
      boss: { dataAbsorb: true, healPerRound: 6, firewallHealPerRound: 8 }
    }),
    makeBossQuality({
      id: "gravidadeBoss",
      namePt: "Gravidade",
      nameEn: "Gravity",
      kind: "trigger",
      cost: 2,
      activation: {
        enabled: true,
        active: false,
        mode: "action",
        actionCost: 1,
        chatMessage: text("Aplique [HEAVY] a alvos escolhidos dentro de DOS espaços.", "Apply [HEAVY] to chosen targets within DOS spaces.")
      },
      effectPt: "Como 1 Ação, o Digimon impõe grande pressão a quaisquer alvos escolhidos dentro de DOS espaços. Alvos afetados sofrem [HEAVY] enquanto permanecerem na área.",
      effectEn: "As 1 Action, the Digimon imposes great pressure on chosen Targets within DOS spaces. Affected Targets suffer [HEAVY] while they remain in the area.",
      boss: { gravity: true, effectTag: "heavy", radiusStat: "dos" }
    }),
    makeBossQuality({
      id: "invocacaoOnipotenteBoss",
      namePt: "Invocação Onipotente",
      nameEn: "Omnipotent Summoning",
      kind: "trigger",
      cost: 2,
      requirementsTextPt: "Requer Invocador.",
      requirementsTextEn: "Requires Summoner.",
      qualityNames: "Summoner",
      effectPt: "O Digimon pode invocar Minions de qualquer tipo, em vez de ficar restrito a apenas um tipo.",
      effectEn: "The Digimon can summon a Minion of any type rather than being restricted to one.",
      boss: { omnipotentSummoning: true }
    }),
    makeBossQuality({
      id: "dominioSuperiorBoss",
      namePt: "Domínio Superior",
      nameEn: "Superior Domain",
      kind: "trigger",
      cost: 3,
      requirementsTextPt: "Requer Controle de Domínio.",
      requirementsTextEn: "Requires Domain Control.",
      qualityNames: "Domain Control",
      effectPt: "Ao usar Controle de Domínio, o Digimon aplica os dois Efeitos do Elemento em vez de apenas um. Com 2 Elementos de Passo Natural, também pode escolher o Efeito de Domínio do segundo Elemento; Elemento Adaptável permite escolher entre os Efeitos normais dos Elementos escolhidos.",
      effectEn: "When using Domain Control, the Digimon applies both Effects of its Element instead of one. With 2 Naturewalk Elements, it may instead choose a Domain Control effect from the second Element; Adaptive Element chooses among the normal Domain Control Effects of its chosen Element(s).",
      boss: { superiorDomain: true }
    }),
    makeBossQuality({
      id: "atormentadorBoss",
      namePt: "Atormentador",
      nameEn: "Tormentor",
      kind: "trigger",
      cost: 1,
      activation: {
        enabled: true,
        active: false,
        mode: "action",
        actionCost: 1,
        chatMessage: text("Force os participantes elegíveis a fazerem um Teste de Tormento.", "Force eligible participants to make a Torment Check.")
      },
      uses: {
        enabled: true,
        value: 1,
        max: 1,
        recharge: "combat"
      },
      effectPt: "Como 1 Ação, uma vez por Combate, força todos os participantes capazes a fazerem um Teste contra seu Tormento mais alto. Em Falha do Tamer, além das penalidades normais, seu Digimon sofre [DEBILITATE 2] pelo restante do Combate até o Tamer conseguir um Sucesso em uma nova tentativa.",
      effectEn: "As 1 Action once per Combat, force all eligible participants to make a Check against their highest Torment. On a Tamer Failure, in addition to the normal demerits, their Digimon suffers [DEBILITATE 2] for the rest of Combat until the Tamer later succeeds on the Check.",
      boss: { tormentor: true }
    }),
    makeBossQuality({
      id: "especialistaEmArmasBoss",
      namePt: "Especialista em Armas",
      nameEn: "Weapon Expert",
      kind: "triggerAttack",
      cost: 3,
      requirementsTextPt: "Requer 1 Rank de Arma.",
      requirementsTextEn: "Requires 1 Rank of Weapon.",
      qualityNames: "Weapon",
      choices: {
        required: true,
        type: "attackTag",
        label: text("Ataque com [WEAPON] adicional", "Additional [WEAPON] Attack"),
        options: []
      },
      attackModifier: {
        enabled: true,
        appliesTo: "differentAttackPerRank",
        grantsTags: ["weapon"]
      },
      effectPt: "O Digimon recebe 1 Tag [WEAPON] adicional para aplicar a um Ataque. Ao fazer um Ataque [WEAPON], pode gastar +1 Ação para usar sua maior Estatística Derivada no lugar dos Ranks em Arma como bônus de [WEAPON].",
      effectEn: "The Digimon gains 1 additional [WEAPON] Tag to apply to an Attack. When making a [WEAPON] Attack, it may spend +1 Action to use its highest Derived Stat instead of Weapon Ranks as the [WEAPON] bonus.",
      boss: { weaponExpert: true, extraActionCost: 1 }
    }),

    makeBossQuality({
      id: "desarmarBoss",
      namePt: "Desarmar",
      nameEn: "Disarm",
      kind: "attack",
      cost: 2,
      choices: {
        required: true,
        type: "singleAttack",
        label: text("Ataque com [DISARM]", "Attack with [DISARM]"),
        options: []
      },
      attackModifier: {
        enabled: true,
        appliesTo: "oneAttack",
        grantsTags: ["disarm"]
      },
      effectPt: "Aplique [DISARM] a um Ataque. Se ele acertar e causar pelo menos 2 Dano, o alvo deixa de receber benefícios de Arma e Qualidades associadas, como Armamento de Digizoide. O alvo ainda pode usar os Ataques.",
      effectEn: "Apply [DISARM] to one Attack. If it hits and deals at least 2 Damage, the Target no longer benefits from Weapon or associated Qualities such as Digizoid Weaponry, though it may still use its Attacks.",
      boss: { disarm: true }
    }),
    makeBossQuality({
      id: "smiteBoss",
      namePt: "Smite",
      nameEn: "Smite",
      kind: "attack",
      cost: 3,
      choices: {
        required: true,
        type: "singleAttack",
        label: text("Ataque com [SMITE]", "Attack with [SMITE]"),
        options: []
      },
      attackModifier: {
        enabled: true,
        appliesTo: "oneAttack",
        grantsTags: ["smite"]
      },
      effectPt: "Aplique [SMITE] a um Ataque. Se esse Ataque errar, ele causa metade do Dano base aos alvos. Isso não inclui Dano extra por Sucessos de Precisão nem benefícios de outras Qualidades, como Armor Piercing.",
      effectEn: "Apply [SMITE] to one Attack. If that Attack misses, it deals half its base Damage to the Target(s). This excludes extra Damage from Accuracy Successes and benefits from other Qualities such as Armor Piercing.",
      boss: { smite: true }
    }),
    makeBossQuality({
      id: "efeitoDeChefeBoss",
      namePt: "Efeito de Chefe",
      nameEn: "Boss Effect",
      kind: "attack",
      cost: 3,
      maxRank: 1,
      choices: {
        required: true,
        type: "effectTagPerRank",
        label: text("Efeito de Chefe e Ataque", "Boss Effect and Attack"),
        cannotRepeat: true,
        repeatOnRankIncrease: false,
        options: bossEffectOptions()
      },
      attackModifier: {
        enabled: true,
        appliesTo: "oneAttackPerPurchasedEffect",
        grantsTags: []
      },
      effectPt: "Escolha um Efeito exclusivo de Chefe e aplique sua Tag a um Ataque. Esta Qualidade só pode ser comprada uma vez.",
      effectEn: "Choose a Boss-only Attack Effect and apply its Tag to one Attack. This Quality can only be purchased once.",
      boss: { bossEffect: true }
    })
  ];
}

export function isDdaBossQuality(quality = {}) {
  return Boolean(quality?.bossQuality || quality?.category?.boss);
}

export function getDdaBossQualityById(id = "") {
  const wanted = String(id ?? "").trim();
  if (!wanted) return null;
  return getDdaBossQualities().find((quality) => String(quality.id ?? "") === wanted) ?? null;
}
