export const DDA_DIGIMON_BUILD_TEMPLATES = [
  {
    id: "melee-damage-dealer",
    role: "damage",
    icon: "⚔️",
    name: {
      pt: "Atacante Corpo a Corpo",
      en: "Melee Damage Dealer"
    },
    subtitle: {
      pt: "Para quem resolve problemas com garras, chifres, punhos ou uma cabeçada muito convincente.",
      en: "For solving problems with claws, horns, fists, or a very persuasive headbutt."
    },
    description: {
      pt: "Uma base simples e direta para Digimon que querem entrar perto e bater forte.",
      en: "A simple and direct base for Digimon that want to get close and hit hard."
    },
    stats: {
      accuracy: 2,
      damage: 2,
      dodge: 1,
      armor: 1,
      health: 2
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "closeCombat" } },
      { qualityId: "arma", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "weapon" },
      { qualityId: "perfuracaoDeArmadura", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "piercing" },
      { qualityId: "ataqueDeInvestida", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "charge" }
    ]
  },

  {
    id: "ranged-damage-dealer",
    role: "damage",
    icon: "🏹",
    name: {
      pt: "Atacante à Distância",
      en: "Ranged Damage Dealer"
    },
    subtitle: {
      pt: "Para quem prefere causar problema de longe e fingir que isso é prudência estratégica.",
      en: "For causing trouble from afar and calling it strategic caution."
    },
    description: {
      pt: "Foca em Acerto, Dano e ataques à distância, mantendo o Digimon fora do centro da confusão.",
      en: "Focuses on Accuracy, Damage, and ranged attacks while keeping the Digimon away from the center of the mess."
    },
    stats: {
      accuracy: 3,
      damage: 2,
      dodge: 1,
      armor: 1,
      health: 1
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "rangedStriker" } },
      { qualityId: "arma", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "weapon" },
      { qualityId: "poderBrutal", rank: 1 },
      { qualityId: "impulsoDeSistema", rank: 1, choice: { key: "bit" } }
    ]
  },

  {
    id: "area-control",
    role: "control",
    icon: "💥",
    name: {
      pt: "Controle de Área",
      en: "Area Control"
    },
    subtitle: {
      pt: "Para quem olha um campo de batalha e pensa: “e se tudo isso aqui fosse meu problema?”",
      en: "For looking at a battlefield and thinking: “what if all of this was my problem?”"
    },
    description: {
      pt: "Usa ataques em área e alcance para controlar grupos de inimigos.",
      en: "Uses area attacks and range to control groups of enemies."
    },
    stats: {
      accuracy: 1,
      damage: 2,
      dodge: 1,
      armor: 1,
      health: 1
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "rangedStriker" } },
      { qualityId: "passoNatural", rank: 1, requiresTemplateChoice: true, choiceType: "option" },
      { qualityId: "areaDeAtaque", rank: 2, choices: [{ key: "blast" }, { key: "cone" }], requiresTemplateChoice: true, choiceType: "areaAttack" },
      { qualityId: "miraSeletiva", rank: 1, optionalIfMissing: true }
    ]
  },

  {
    id: "defender",
    role: "defense",
    icon: "🛡️",
    name: {
      pt: "Defensor",
      en: "Defender"
    },
    subtitle: {
      pt: "Para quem ouviu “não deixe baterem nos seus amigos” e levou isso pessoalmente.",
      en: "For taking “do not let them hit your friends” personally."
    },
    description: {
      pt: "Aumenta sobrevivência, Armadura e Saúde para cumprir o papel de tanque.",
      en: "Improves survivability, Armor, and Health for a tank role."
    },
    stats: {
      accuracy: 1,
      damage: 1,
      dodge: 1,
      armor: 3,
      health: 2
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "warden" } },
      { qualityId: "instinto", rank: 1 },
      { qualityId: "acelerar", rank: 1 },
      { qualityId: "segundoFolego", rank: 1 }
    ]
  },

  {
    id: "counter-attacker",
    role: "defense",
    icon: "↩️",
    name: {
      pt: "Contra-Atacante",
      en: "Counter Attacker"
    },
    subtitle: {
      pt: "Para quem acredita que errar um golpe contra você é preencher um formulário de arrependimento.",
      en: "For believing that missing you is basically filing regret paperwork."
    },
    description: {
      pt: "Combina defesa com a capacidade de punir inimigos que erram ataques.",
      en: "Combines defense with the ability to punish enemies that miss attacks."
    },
    stats: {
      accuracy: 2,
      damage: 1,
      dodge: 2,
      armor: 1,
      health: 2
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "warden" } },
      { qualityId: "instinto", rank: 1 },
      { qualityId: "contraAtaque", rank: 2 }
    ]
  },

  {
    id: "berserker",
    role: "bruiser",
    icon: "🔥",
    name: {
      pt: "Berserker",
      en: "Berserker"
    },
    subtitle: {
      pt: "Para quem transforma dor em argumento e argumento em dano.",
      en: "For turning pain into an argument and the argument into damage."
    },
    description: {
      pt: "Aceita mais risco para ganhar recompensa ofensiva quando sofre dano.",
      en: "Takes more risk to gain offensive rewards when damaged."
    },
    stats: {
      accuracy: 2,
      damage: 1,
      dodge: 0,
      armor: 1,
      health: 3
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "warden" } },
      { qualityId: "instinto", rank: 1 },
      { qualityId: "passoNatural", rank: 1, requiresTemplateChoice: true, choiceType: "option" },
      { qualityId: "ataqueDeInvestida", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "charge" },
      { qualityId: "monstroDeCombate", rank: 1 }
    ]
  },

  {
    id: "evasive-dodger",
    role: "defense",
    icon: "💨",
    name: {
      pt: "Esquivador",
      en: "Evasive Dodger"
    },
    subtitle: {
      pt: "Para quem prefere não estar onde o golpe caiu. Elegante, irritante, eficiente.",
      en: "For not being where the hit lands. Elegant, annoying, effective."
    },
    description: {
      pt: "Foca em Esquiva, mobilidade e defesa sem depender de tomar golpes.",
      en: "Focuses on Dodge, mobility, and defense without relying on getting hit."
    },
    stats: {
      accuracy: 1,
      damage: 1,
      dodge: 3,
      armor: 1,
      health: 2
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "speedster" } },
      { qualityId: "instinto", rank: 1 },
      { qualityId: "evasaoAbsoluta", rank: 1 }
    ]
  },

  {
    id: "hyper-mobile",
    role: "mobility",
    icon: "⚡",
    name: {
      pt: "Hiper Móvel",
      en: "Hyper Mobile"
    },
    subtitle: {
      pt: "Para quem acha que distância é só uma sugestão pessimista.",
      en: "For treating distance as a pessimistic suggestion."
    },
    description: {
      pt: "Maximiza deslocamento para alcançar, recuar e reposicionar sem sofrimento.",
      en: "Maximizes movement to reach, retreat, and reposition with ease."
    },
    stats: {
      accuracy: 2,
      damage: 1,
      dodge: 1,
      armor: 1,
      health: 2
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "speedster" } },
      { qualityId: "instinto", rank: 1 },
      { qualityId: "acelerar", rank: 2 },
      { qualityId: "ataqueDeInvestida", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "charge" }
    ]
  },

  {
    id: "clasher",
    role: "clash",
    icon: "🥊",
    name: {
      pt: "Especialista em Clash",
      en: "Clasher"
    },
    subtitle: {
      pt: "Para quem entra no empurra-empurra digital e chama isso de plano.",
      en: "For entering the digital shove-fest and calling it a plan."
    },
    description: {
      pt: "Especializa o Digimon em Clashes, com boa defesa e presença corporal.",
      en: "Specializes the Digimon in Clashes, with solid defense and physical presence."
    },
    stats: {
      accuracy: 1,
      damage: 1,
      dodge: 3,
      armor: 3,
      health: 1
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "brawler" } },
      { qualityId: "instinto", rank: 1 },
      { qualityId: "impulsoDeSistema", rank: 1, requiresTemplateChoice: true, choiceType: "option", recommendedOptions: ["cpu", "ram"] }
    ]
  },

  {
    id: "support-debuffer",
    role: "support",
    icon: "🧪",
    name: {
      pt: "Suporte Debilitador",
      en: "Support Debuffer"
    },
    subtitle: {
      pt: "Para quem não precisa bater mais forte se puder transformar o inimigo em uma planilha triste.",
      en: "For not needing to hit harder if you can turn the enemy into a sad spreadsheet."
    },
    description: {
      pt: "Foca em aplicar efeitos negativos e atrapalhar inimigos com ataques utilitários.",
      en: "Focuses on applying negative effects and disrupting enemies with utility attacks."
    },
    stats: {
      accuracy: 3,
      damage: 1,
      dodge: 1,
      armor: 1,
      health: 1
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "effectWarrior" } },
      { qualityId: "arma", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "weapon" },
      { qualityId: "efeitoBasico", rank: 1, choices: [{ key: "fear" }], requiresTemplateChoice: true, choiceType: "effectAttack" },
      { qualityId: "efeitoAvancado", rank: 1, choices: [{ key: "poison" }], requiresTemplateChoice: true, choiceType: "effectAttack" }
    ]
  },

  {
    id: "support-buffer",
    role: "support",
    icon: "🌟",
    name: {
      pt: "Suporte Fortalecedor",
      en: "Support Buffer"
    },
    subtitle: {
      pt: "Para quem prefere transformar aliados em problemas muito maiores para os inimigos.",
      en: "For turning allies into much bigger problems for your enemies."
    },
    description: {
      pt: "Foca em aplicar efeitos benéficos para fortalecer companheiros durante o combate.",
      en: "Focuses on applying beneficial effects to strengthen companions during combat."
    },
    stats: {
      accuracy: 3,
      damage: 1,
      dodge: 1,
      armor: 1,
      health: 1
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "effectWarrior" } },
      { qualityId: "instinto", rank: 1 },
      { qualityId: "efeitoBasico", rank: 1, choices: [{ key: "tailwind" }], requiresTemplateChoice: true, choiceType: "effectAttack" },
      { qualityId: "efeitoAvancado", rank: 1, choices: [{ key: "nimble" }], requiresTemplateChoice: true, choiceType: "effectAttack" }
    ]
  },

  {
    id: "rapid-attacker",
    role: "damage",
    icon: "🌀",
    name: {
      pt: "Atacante Rápido",
      en: "Rapid Attacker"
    },
    subtitle: {
      pt: "Para quem acha que atacar uma vez por turno é uma sugestão educada demais.",
      en: "For thinking one attack per turn is far too polite a suggestion."
    },
    description: {
      pt: "Usa Qualidades especiais para quebrar a regra universal de um ataque por rodada.",
      en: "Uses special Qualities to break the universal one-attack-per-round rule."
    },
    stats: {
      accuracy: 2,
      damage: 1,
      dodge: 1,
      armor: 1,
      health: 2
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "closeCombat" } },
      { qualityId: "arma", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "weapon" },
      { qualityId: "municao", rank: 1, requiresTemplateChoice: true, choiceType: "attack", tag: "ammo" },
      { qualityId: "almaFeroz", rank: 1 }
    ]
  },

  {
    id: "well-rounded",
    role: "balanced",
    icon: "🔷",
    name: {
      pt: "Bem Equilibrado",
      en: "Well-Rounded"
    },
    subtitle: {
      pt: "Para quem quer uma base honesta, confiável e sem malabarismo de planilha.",
      en: "For a clean, reliable foundation without spreadsheet acrobatics."
    },
    description: {
      pt: "Distribui os pontos igualmente e serve como uma fundação flexível para evoluir com PD Bônus depois.",
      en: "Distributes points evenly and works as a flexible foundation to improve with Bonus DP later."
    },
    stats: {
      accuracy: 2,
      damage: 2,
      dodge: 2,
      armor: 2,
      health: 2
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "variable" } },
      { qualityId: "passoNatural", rank: 1, requiresTemplateChoice: true, choiceType: "option" }
    ]
  },

  {
    id: "gambler",
    role: "wildcard",
    icon: "🎲",
    name: {
      pt: "Apostador",
      en: "Gambler"
    },
    subtitle: {
      pt: "Para quem olhou para a estabilidade e disse: “mas e se eu rolasse melhor?”",
      en: "For looking at stability and saying: “but what if I just roll better?”"
    },
    description: {
      pt: "Foca em grandes pools de Acerto e Esquiva, aceitando risco em troca de rolagens mais explosivas.",
      en: "Focuses on large Accuracy and Dodge pools, accepting risk in exchange for swingier rolls."
    },
    stats: {
      accuracy: 4,
      damage: 0,
      dodge: 4,
      armor: 0,
      health: 2
    },
    qualities: [
      { qualityId: "otimizacaoDeDados", rank: 1, choice: { key: "variable" } },
      { qualityId: "passoNatural", rank: 1, requiresTemplateChoice: true, choiceType: "option" }
    ]
  }
];

export const DDA_DIGIMON_BUILD_TEMPLATE_INDEX = Object.fromEntries(
  DDA_DIGIMON_BUILD_TEMPLATES.map((template) => [template.id, template])
);