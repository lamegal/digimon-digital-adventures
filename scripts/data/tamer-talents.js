const DDA_TAMER_TALENTS_PT = [
  // =====================================================
  // Atributos — Talentos Iniciais
  // =====================================================

  {
    id: "quickStep",
    name: "Quick Step",
    requirement: { type: "attribute", key: "agility", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Quando o Digi-Escolhido usa a Ação Reposicionar, ganha +1 Sucesso no resultado final."
  },

  {
    id: "strikeFast",
    name: "Strike Fast",
    requirement: { type: "attribute", key: "agility", value: 5 },
    isAdvanced: false,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "special",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "FULL SPEED AHEAD" },
    effect: "O Digimon ganha 1 Ação extra, que deve ser usada para Mover ou Movimento Difícil.",
    automation: {
        enabled: true,
        type: "grantActions",
        target: "partner",
        amount: 1,
        restrictedToMovement: true,
        note: "A ação extra só pode ser gasta em Mover ou Movimento Difícil e expira ao fim da ativação compartilhada."
    }
  },

  {
    id: "bulkUp",
    name: "Bulk Up",
    requirement: { type: "attribute", key: "body", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Quando o Digi-Escolhido usa a Ação Reforçar, ganha +1 Sucesso no resultado final."
  },

  {
    id: "energyBurst",
    name: "Energy Burst",
    requirement: { type: "attribute", key: "body", value: 5 },
    isAdvanced: false,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "1",
    frequency: "special",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "DON’T WORRY YOU’LL HEAL" },
    effect: "O Digimon recupera 1 Caixa de Ferimento. Se possuir Caixas de Ferimento Temporárias ao declarar esta Ordem, recupera 2 em vez disso.",
    automation: {
  enabled: true,
  type: "healWounds",
  target: "partner",
  amount: 1,
  amountIfHasTempWounds: 2
}
  },

  {
    id: "directTeam",
    name: "Direct Team",
    requirement: { type: "attribute", key: "charisma", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Ao usar Direcionar em um Digimon que não seja o próprio parceiro, a penalidade de -2 é reduzida para -1."
  },

  {
    id: "swagger",
    name: "Swagger",
    requirement: { type: "attribute", key: "charisma", value: 5 },
    isAdvanced: false,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "1",
    frequency: "oncePerTurn",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "HEY YOU" },
    effect: "O Digi-Escolhido e um Digimon aliado disposto provocam um inimigo visível. Aplica [TAUNT 3] com Duração 3, tratando o aliado como conjurador. Não pode ser usado novamente até [TAUNT] terminar.",
    automation: {
      enabled: true,
      type: "officialEffectSpecialOrder"
    }
  },

  {
    id: "experienced",
    name: "Experienced",
    requirement: { type: "attribute", key: "intelligence", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "O Digi-Escolhido ganha +1 Ponto de Perícia extra para gastar. Se este Talento for obtido durante a Criação de Personagem, esse ponto pode aumentar uma segunda Perícia até 5, ignorando o limite de apenas uma Perícia em 5."
  },

  {
    id: "calculated",
    name: "Calculated",
    requirement: { type: "attribute", key: "intelligence", value: 5 },
    isAdvanced: false,
    isSpecialOrder: true,
    useType: "passive",
    actionCost: "passive",
    frequency: "oncePerTurn",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "I’VE CALCULATED THE ODDS" },
    effect: "Quando o Digi-Escolhido ou seu Digimon usaria Fortalecer para ganhar +2 dados em uma Pool, pode escolher ganhar +1 Sucesso no resultado em vez disso."
  },

  {
    id: "potential",
    name: "Potential",
    requirement: { type: "attribute", key: "willpower", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "No início de uma sessão, o Digi-Escolhido ganha 1 PI Temporário, que desaparece se não for usado até o fim da sessão."
  },

  {
    id: "purifyPartner",
    name: "Purify Partner",
    requirement: { type: "attribute", key: "willpower", value: 5 },
    isAdvanced: false,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "1",
    frequency: "oncePerTurn",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "TOUGH IT OUT" },
    effect: "O Digimon parceiro é curado de um Efeito Negativo como se tivesse usado [CLEANSE]. Não pode ser usado novamente no mesmo turno.",
    automation: {
      enabled: true,
      type: "officialEffectSpecialOrder"
    }
  },

  // =====================================================
  // Perícias — Talentos Iniciais
  // =====================================================

  {
    id: "avoidingConsequences",
    name: "Avoiding Consequences",
    requirement: { type: "skill", key: "evade", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Ao obter Falha Crítica em um Teste ou Teste de Tormento, se somar Evasão transformaria o resultado em Falha ou melhor, o resultado vira uma Falha comum.",
    automation: {
      enabled: true,
      type: "triggeredInterceptor",
      trigger: "criticalCheck",
      triggeredOnly: true
    }
  },

  {
    id: "tuckAndRoll",
    name: "Tuck and Roll",
    requirement: { type: "skill", key: "evade", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "interrupt",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Quando o Digi-Escolhido falharia ao Evadir um Ataque em combate, pode escolher obter Sucesso em vez disso.",
    automation: {
      enabled: true,
      type: "triggeredInterceptor",
      trigger: "failedTamerDodge",
      triggeredOnly: true
    }
  },

  {
    id: "busyHands",
    name: "Busy Hands",
    requirement: { type: "skill", key: "precision", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Permite plantar pequenos itens sem rolagem e criar, durante um Descanso, um item de suporte para uma Perícia. O bônus é igual à Precisão acima de 2 e o item perde efeito após usado ou após novo Descanso.",
    automation: {
      enabled: true,
      type: "busyHandsCraft"
    }
  },

  {
    id: "aimAssist",
    name: "Aim Assist",
    requirement: { type: "skill", key: "precision", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Se o Digi-Escolhido usa 2 Ações para Direcionar seu Digimon e melhorar Precisão usando o maior Atributo, o bônus de Direcionar recebe +2."
  },

  {
    id: "overlooked",
    name: "Overlooked",
    requirement: { type: "skill", key: "stealth", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "O Digi-Escolhido se mistura naturalmente a multidões. Em combate, pode se mover e agir como se estivesse obscurecido até afetar diretamente um inimigo."
  },

  {
    id: "silentMovement",
    name: "Silent Movement",
    requirement: { type: "skill", key: "stealth", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "O Digi-Escolhido e seu Digimon não produzem som de passos e não deixam pegadas, embora ainda possam ser percebidos por outros indícios.",
    automation: { enabled: true, type: "narrativeTamerTalent" }
  },

  {
    id: "naturalExplorer",
    name: "Natural Explorer",
    requirement: { type: "skill", key: "athletics", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Pode usar Atletismo ou Agilidade, o que for maior, para calcular Movimento. Ganha Escalar, Nadar e Saltar iguais ao Movimento normal e ignora Terreno Difícil. Pode guiar aliados por ambientes difíceis."
  },

  {
    id: "experiencedStep",
    name: "Experienced Step",
    requirement: { type: "skill", key: "athletics", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Quando usa Reposicionar com 2 Ações, como usando o maior Atributo ou Fortalecer, ganha +1 Sucesso no resultado final."
  },

  {
    id: "noPainNoGain",
    name: "No Pain, No Gain",
    requirement: { type: "skill", key: "endurance", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "limited",
    uses: {
      enabled: true,
      value: 1,
      max: 1,
      recharge: "rest",
      maxFormula: {
        type: "skillAbove",
        key: "endurance",
        threshold: 2,
        minimum: 1
      }
    },
    specialOrder: { name: "" },
    effect: "Quando falha em um Teste, exceto Testes de Tormento, pode refazer como um Teste de Resistência com o Atributo relevante. Usos por Descanso iguais à Resistência acima de 2.",
    automation: {
      enabled: true,
      type: "triggeredInterceptor",
      trigger: "failedCheck",
      triggeredOnly: true
    }
  },

  {
    id: "grit",
    name: "Grit",
    requirement: { type: "skill", key: "endurance", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "interrupt",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Pode usar Resistência em vez de Evasão contra Ataques, mas sempre sofre no mínimo 1 dano. Uma vez por Descanso, ao cair a 0 Caixas de Ferimento, permanece com 1.",
    automation: {
      enabled: true,
      type: "triggeredInterceptor",
      trigger: "tamerDefenseOrLethalDamage",
      triggeredOnly: true
    }
  },

  {
    id: "heavyForce",
    name: "Heavy Force",
    requirement: { type: "skill", key: "featsOfStrength", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Pode fazer Testes de Feitos de Força em vez de Precisão ao atacar em combate. Uma vez por Descanso, ao fazer Teste com Corpo ou Agilidade, adiciona bônus igual a Feitos de Força."
  },

  {
    id: "jointEffort",
    name: "Joint Effort",
    requirement: { type: "skill", key: "featsOfStrength", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Ao fazer Feitos de Força para empurrar, erguer ou arrastar algo com ajuda do Digimon em Trabalho em Equipe, ganha bônus igual ao SV do Digimon além do bônus/penalidade do resultado do Digimon."
  },

  {
    id: "plantedIdea",
    name: "Planted Idea",
    requirement: { type: "skill", key: "manipulate", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Ao ter sucesso em Manipular em uma cena de interpretação, pode implantar uma ideia menor e razoável em um PNJ por alguns minutos.",
    automation: { enabled: true, type: "narrativeTamerTalent" }
  },

  {
    id: "fakeout",
    name: "Fakeout",
    requirement: { type: "skill", key: "manipulate", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Se usar 2 Ações para Direcionar o Digimon e melhorar Precisão, mas o ataque errar, o alvo sofre -2 em Esquiva em vez de -1 por aquele ataque."
  },

  {
    id: "endlessDream",
    name: "Endless Dream",
    requirement: { type: "skill", key: "performance", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Com uma performance, concede PI Temporário a aliados igual à Performance acima de 2, dividido como quiser. Não pode conceder a si mesmo.",
    automation: {
      enabled: true,
      type: "endlessDreamDistribution"
    }
  },

  {
    id: "personalCheerleader",
    name: "Personal Cheerleader",
    requirement: { type: "skill", key: "performance", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Quando um Digimon beneficiado por Direcionar do Digi-Escolhido rola Precisão ou Esquiva, pode rerrolar até dois dados e deve manter os novos resultados."
  },

  {
    id: "charmingInfluence",
    name: "Charming Influence",
    requirement: { type: "skill", key: "persuasion", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Ao ter sucesso em Persuasão em uma cena de interpretação, pode fazer PNJs afetados se tornarem amigáveis por alguns minutos.",
    automation: { enabled: true, type: "narrativeTamerTalent" }
  },

  {
    id: "beTheWinners",
    name: "Be the Winners",
    requirement: { type: "skill", key: "persuasion", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Pode usar Direcionar com 1 Ação extra para dividir o bônus entre seu próprio Digimon e outro Digimon aliado disposto, sem sofrer penalidade por Direcionar outro Digimon.",
    automation: { enabled: true, type: "beTheWinnersAction" }
  },

  {
    id: "cyberSleuth",
    name: "Cyber Sleuth",
    requirement: { type: "skill", key: "decipherIntent", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "limited",
    uses: {
      enabled: true,
      value: 1,
      max: 1,
      recharge: "rest",
      maxFormula: {
        type: "skillAbove",
        key: "decipherIntent",
        threshold: 2,
        minimum: 1
      }
    },
    specialOrder: { name: "" },
    effect: "Pode perguntar ao Narrador se uma ação imediata terá bons resultados, maus resultados ou ambos. Usos por Descanso iguais a Decifrar Intenção acima de 2.",
    automation: { enabled: true, type: "narrativeTamerTalent" }
  },

  {
    id: "bestLaidPlans",
    name: "Best Laid Plans",
    requirement: { type: "skill", key: "decipherIntent", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Ao usar Segurar com sucesso e adicionar Inteligência à Precisão ou Esquiva do Digimon, ganha +1 Sucesso. Também pode surpreender inimigos investigados/interrogados."
  },

  {
    id: "gloriousWorld",
    name: "Glorious World",
    requirement: { type: "skill", key: "survival", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "special",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Ao preparar uma refeição, concede Caixas de Ferimento Temporárias iguais à Sobrevivência acima de 2 para quem comer, até o próximo Descanso.",
    automation: { enabled: true, type: "transversalTamerTalent" }
  },

  {
    id: "trailblazer",
    name: "Trailblazer",
    requirement: { type: "skill", key: "survival", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Sempre sabe onde fica o norte e conhece a rota exata de volta ao último assentamento ou local civilizado visitado.",
    automation: { enabled: true, type: "narrativeTamerTalent" }
  },

  {
    id: "academicAdvice",
    name: "Academic Advice",
    requirement: { type: "skill", key: "knowledge", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Ao ajudar em um Teste de Trabalho em Equipe, pode fazer Conhecimento em vez do Teste exigido. Em sucesso, aumenta o bônus concedido conforme Conhecimento acima de 2."
  },

  {
    id: "livingEncyclopedia",
    name: "Living Encyclopedia",
    requirement: { type: "skill", key: "knowledge", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Quando precisaria fazer Conhecimento para lembrar informação com NA 15 ou menor, pode escolher obter Sucesso Crítico automático.",
    automation: { enabled: true, type: "transversalTamerTalent" }
  },

  {
    id: "hyperAlert",
    name: "Hyper Alert",
    requirement: { type: "skill", key: "awareness", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Pode usar Percepção em vez de um Teste normal para evitar perigos repentinos. O Digimon recebe bônus de Iniciativa igual à Percepção acima de 2."
  },

  {
    id: "dangerSense",
    name: "Danger Sense",
    requirement: { type: "skill", key: "awareness", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Quando o Digimon usaria uma Ação de Interrupção, o Digi-Escolhido pode gastar 1 Ação em vez do Digimon."
  },

  {
    id: "calmingInfluence",
    name: "Calming Influence",
    requirement: { type: "skill", key: "fortitude", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Quando outro Digi-Escolhido falha em um Teste de Tormento, permite rerrolar com bônus igual à Fortitude deste Digi-Escolhido. Se virar Sucesso, ambos ganham 1 PI."
  },

  {
    id: "teamPlayer",
    name: "Team Player",
    requirement: { type: "skill", key: "fortitude", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Em Trabalho em Equipe, se estiver ajudando, o aliado pode rerrolar 1s. Se iniciar o Teste, pode ignorar a penalidade de Falha Crítica de um aliado."
  },

  {
    id: "breakTheChain",
    name: "Break the Chain",
    requirement: { type: "skill", key: "bravery", value: 3 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "passive",
    actionCost: "",
    frequency: "always",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Ganha bônus em Testes de Tormento igual à Bravura. Se Calming Influence também for usado, aplica apenas o maior bônus."
  },

  {
    id: "withTheWill",
    name: "With the Will",
    requirement: { type: "skill", key: "bravery", value: 5 },
    isAdvanced: false,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "interrupt",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "" },
    effect: "Quando faria um Teste de Tormento, o Digimon pode usar Interrupção para transformar em Trabalho em Equipe, rolando Bravura própria para ajudar."
  },

  // =====================================================
  // Atributos — Talentos Avançados
  // =====================================================

  {
    id: "evasiveManeuvers",
    name: "Evasive Maneuvers",
    requirement: { type: "attribute", key: "agility", value: 6 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "passive",
    actionCost: "passive",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "DON’T LEAVE ANY OPENINGS" },
    effect: "Quando a Iniciativa é rolada, o Digimon ganha uma reserva especial de dados de Esquiva igual ao SV + Agilidade do Digi-Escolhido. Dados usados saem da reserva pelo combate."
  },

  {
    id: "speedSurge",
    name: "Speed Surge",
    requirement: { type: "attribute", key: "agility", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "FINISH IT NOW" },
    effect: "O Digimon ganha 2 Ações extras e é tratado como se estivesse em outra rodada para ignorar limites como um Ataque por Rodada.",
    automation: {
      enabled: true,
      type: "grantActions",
      target: "partner",
      amount: 2,
      grantVirtualRound: true,
      note: "O Digimon inicia uma nova janela virtual de Rodada: limites por Rodada e por turno são reiniciados sem avançar o Combat Tracker."
    }
  },

  {
    id: "undefeatedEndurance",
    name: "Undefeated Endurance",
    requirement: { type: "attribute", key: "body", value: 6 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "passive",
    actionCost: "passive",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "YOU CAN TAKE IT" },
    effect: "Quando o Digimon é reduzido a 0 Caixas de Ferimento, o Digi-Escolhido faz uma Pool de Corpo. O Digimon recupera Ferimentos iguais aos sucessos + SV e não é derrotado."
  },

  {
    id: "overpower",
    name: "Overpower",
    requirement: { type: "attribute", key: "body", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "interrupt",
    actionCost: "1",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "I’M WITH YOU" },
    effect: "Após o Digimon rolar Precisão para um Ataque, resultados 4 passam a contar como Sucessos naquela Pool."
  },

  {
    id: "peakPerformance",
    name: "Peak Performance",
    requirement: { type: "attribute", key: "charisma", value: 6 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "I BELIEVE IN YOU" },
    effect: "Concede [BASTION 2] a um Digimon aliado disposto, incluindo o parceiro, até o início do próximo turno do Digi-Escolhido.",
    automation: {
      enabled: true,
      type: "officialEffectSpecialOrder"
    }
  },

  {
    id: "revitalize",
    name: "Revitalize",
    requirement: { type: "attribute", key: "charisma", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "WAKE UP, DON’T QUIT NOW" },
    effect: "Quando o Digimon está com 0 Caixas ou voltou ao Estágio Padrão após ser derrotado, retorna ao estágio em que foi derrotado e recupera 7 Caixas de Ferimento.",
    automation: { enabled: true, type: "combatSurvivalSpecialOrder" }
  },

  {
    id: "signatureVersatility",
    name: "Signature Versatility",
    requirement: { type: "attribute", key: "intelligence", value: 6 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "free",
    actionCost: "free",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "TIME FOR PLAN B" },
    effect: "Quando o Digimon faria um Ataque, pode tratá-lo como Movimento Assinatura se ainda não fosse. Após o ataque, o efeito acaba.",
    automation: { enabled: true, type: "attackDirectSpecialOrder" }
  },

  {
    id: "enemyScan",
    name: "Enemy Scan",
    requirement: { type: "attribute", key: "intelligence", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerRest",
    uses: { enabled: true, value: 1, max: 1, recharge: "rest" },
    specialOrder: { name: "I’VE FOUND AN EXPLOIT" },
    effect: "Inflige [DEBILITATE] em um inimigo com Potência igual ao SV dele até o início do próximo turno do Digi-Escolhido.",
    automation: {
      enabled: true,
      type: "officialEffectSpecialOrder"
    }
  },

  {
    id: "challenger",
    name: "Challenger",
    requirement: { type: "attribute", key: "willpower", value: 6 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "passive",
    actionCost: "passive",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "NEVER BACK DOWN" },
    effect: "Quando a Iniciativa é rolada, faz Pool de Vontade. O Digimon ganha Caixas Temporárias iguais aos sucessos + maior SV inimigo, até máximo 5."
  },

  {
    id: "miracle",
    name: "Miracle",
    requirement: { type: "attribute", key: "willpower", value: 7 },
    isAdvanced: true,
    isSpecialOrder: false,
    useType: "active",
    actionCost: "special",
    frequency: "special",
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    specialOrder: { name: "" },
    effect: "Gastando 9 PI não temporários, que podem ser divididos entre os jogadores, adiciona ou subtrai 12 a um Teste ou Pool e pode definir o resultado de cada dado rolado.",
    automation: { enabled: true, type: "transversalTamerTalent" }
  },

  // =====================================================
  // Perícias — Talentos Avançados
  // =====================================================

  {
    id: "quickening",
    name: "Quickening",
    requirement: { type: "skill", key: "evade", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "interrupt",
    actionCost: "interrupt",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "YOU’RE ONE STEP BEHIND" },
    effect: "Quando o Digimon seria atacado, antes de rolar Esquiva, declara esta Ordem para esquivar automaticamente sem rolagem."
  },

  {
    id: "autoHit",
    name: "Auto Hit",
    requirement: { type: "skill", key: "precision", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "PUT 100% INTO THIS" },
    effect: "Quando o Digimon faz um Ataque que não seja Movimento Assinatura, ele não rola Precisão e o alvo não rola Esquiva; o ataque tem sucessos automáticos iguais ao SV do atacante.",
    automation: { enabled: true, type: "attackDirectSpecialOrder" }
  },

  {
    id: "vanish",
    name: "Vanish",
    requirement: { type: "skill", key: "stealth", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "1",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "NOW YOU SEE US" },
    effect: "Escolhe um inimigo. O Digi-Escolhido e seu Digimon desaparecem de sua vista como se ele estivesse sob [BLIND] até o início do próximo turno do Digi-Escolhido.",
    automation: {
      enabled: true,
      type: "officialEffectSpecialOrder"
    }
  },

  {
    id: "bullrush",
    name: "Bullrush",
    requirement: { type: "skill", key: "athletics", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "1",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "THIS TRAIN WON’T STOP" },
    effect: "O Digimon pode fazer Movimento Difícil como Ação Livre imediatamente e, até o fim do turno, faz Movimento Difícil custando 1 Ação a menos, mínimo 1.",
    automation: { enabled: true, type: "combatSurvivalSpecialOrder" }
  },

  {
    id: "thickSkin",
    name: "Thick Skin",
    requirement: { type: "skill", key: "endurance", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "interrupt",
    actionCost: "interrupt",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "NO, YOU MOVE" },
    effect: "Quando o Digimon seria movido contra sua vontade, ignora o movimento. Com 1 Ação extra, pode refletir o movimento forçado de volta à fonte."
  },

  {
    id: "adrenalineHit",
    name: "Adrenaline Hit",
    requirement: { type: "skill", key: "featsOfStrength", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "HAVE SOME OF THIS" },
    effect: "Arremessa um objeto permitido pelo Narrador em um inimigo visível. O alvo sofre Dano Inalterável igual ao SV e [STUN] até o próximo turno do Digi-Escolhido.",
    automation: {
      enabled: true,
      type: "officialEffectSpecialOrder"
    }
  },

  {
    id: "hackingPride",
    name: "Hacking Pride",
    requirement: { type: "skill", key: "manipulate", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "1",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "YOU’VE ALREADY LOST" },
    effect: "Causa um Direcionar negativo em um inimigo, impondo penalidade à próxima Pool de Precisão ou Esquiva antes do próximo turno do Digi-Escolhido.",
    automation: { enabled: true, type: "attackDirectSpecialOrder" }
  },

  {
    id: "distractingGesture",
    name: "Distracting Gesture",
    requirement: { type: "skill", key: "performance", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "interrupt",
    actionCost: "interrupt",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "HEY, OVER HERE" },
    effect: "Quando um inimigo ataca um aliado ou o parceiro, o Digi-Escolhido o distrai; o inimigo rola metade dos dados no ataque.",
    automation: { enabled: true, type: "reactiveAttackInterrupt" }
  },

  {
    id: "nextOrder",
    name: "Next Order",
    requirement: { type: "skill", key: "persuasion", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "1",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "WE CAN DO THIS, TOGETHER" },
    effect: "Concede benefícios de Direcionar a 2 Digimon aliados dispostos, incluindo o parceiro, sem penalidade por Direcionar Digimon de outro Tamer.",
    automation: { enabled: true, type: "attackDirectSpecialOrder" }
  },

  {
    id: "predictable",
    name: "Predictable",
    requirement: { type: "skill", key: "decipherIntent", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "I ALREADY KNOW YOUR NEXT MOVE" },
    effect: "Escolhe um inimigo e declara uma Ação Segurar cujo gatilho pode ser qualquer Ação futura desse alvo, incluindo Interceder.",
    automation: { enabled: true, type: "transversalTamerTalent" }
  },

  {
    id: "survivalInstinct",
    name: "Survival Instinct",
    requirement: { type: "skill", key: "survival", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "interrupt",
    actionCost: "interrupt",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "FLOW WITH IT" },
    effect: "Quando o Digimon sofreria dano de um Ataque, reduz o dano pela metade após Armadura e ignora Dano Inalterável associado ao ataque."
  },

  {
    id: "hackersMemory",
    name: "Hacker’s Memory",
    requirement: { type: "skill", key: "knowledge", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "I KNOW ALL YOUR TRICKS" },
    effect: "Contra um inimigo específico já enfrentado, aumenta em +1 a Potência de Qualidades/Efeitos aliados que usam Estatística Derivada contra ele, ou reduz em -1 a Potência equivalente usada por ele.",
    automation: { enabled: true, type: "transversalTamerTalent" }
  },

  {
    id: "realization",
    name: "Realization",
    requirement: { type: "skill", key: "awareness", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "I’VE FIGURED IT OUT" },
    effect: "Escolhe um inimigo e inflige [EXPLOIT 3], ignorando imunidades de Overwrite ou Resistance. O efeito dura até o fim do combate, até ser limpo ou até o inimigo gastar 2 Ações defendendo a fraqueza.",
    automation: {
      enabled: true,
      type: "officialEffectSpecialOrder"
    }
  },

  {
    id: "takeTheLead",
    name: "Take the Lead",
    requirement: { type: "skill", key: "fortitude", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "interrupt",
    actionCost: "1",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "NOW FOCUS" },
    effect: "Quando o Digimon faz um Teste próprio como Ação ou parte de uma Qualidade, ganha +5 no Teste. Pode ser usado após o resultado ser conhecido.",
    automation: {
      enabled: true,
      type: "postCheckBonus",
      target: "partnerOrTarget",
      amount: 5,
      label: "NOW FOCUS",
      note: "Este Talento é reativo: o +5 deve ser aplicado após o resultado do Teste ser conhecido."
    }
  },

  {
    id: "heroicExemplar",
    name: "Heroic Exemplar",
    requirement: { type: "skill", key: "bravery", value: 7 },
    isAdvanced: true,
    isSpecialOrder: true,
    useType: "active",
    actionCost: "2",
    frequency: "oncePerCombat",
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    specialOrder: { name: "SHOW THEM WHAT YOU’RE MADE OF" },
    effect: "Após o Digimon acertar um Ataque contra um inimigo, o Digimon e todos os aliados ganham [BASTION 1] com Duração 3.",
  }
];

// =====================================================
// Localização — Banco de Talentos de Digi-Escolhido
// =====================================================

const DDA_TAMER_TALENTS_EN_PATCH = {
  "quickStep": {
    "effect": "When the Tamer takes the Reposition Action, they gain +1 Success to the final result.",
    automation: {
      enabled: true,
      type: "officialEffectSpecialOrder"
    }
  },
  "strikeFast": {
    "effect": "The Tamer helps their Digimon increase their momentum. The Digimon gains 1 extra Action, which must be used to take the Move or Difficult Move Action.",
    "automation": {
      "note": "The extra Action must be used to take the Move or Difficult Move Action."
    }
  },
  "bulkUp": {
    "effect": "When the Tamer takes the Reinforce Action, they gain +1 Success to the final result."
  },
  "energyBurst": {
    "effect": "The Tamer inspires the Digimon to dig deep into their own stamina reserves. The Digimon regains 1 Wound Box. If the Digimon has Temporary Wound Boxes when this Special Order is declared, it regains 2 Wound Boxes instead."
  },
  "directTeam": {
    "effect": "When the Tamer takes the Direct Action, the -2 penalty to Direct Digimon other than their own is reduced to -1."
  },
  "swagger": {
    "effect": "The Tamer and a willing Ally Digimon work together to rattle up an enemy. [TAUNT 3] with a Duration of 3 is applied to an Enemy the Tamer can see, with the Ally treated as the Caster. This Special Order cannot be used again until [TAUNT] ends. This Special Order can only be used Once per Turn. The Target cannot make DOS (Bravery) to end this effect."
  },
  "experienced": {
    "effect": "The Tamer gains +1 extra Skill Point that they can spend on a Skill. If this is taken at Character Creation, it can be used to increase a Skill to 5, bypassing the rule that only allows one Skill to be at 5."
  },
  "calculated": {
    "effect": "When the Tamer or their Digimon would take the Bolster Action, instead of gaining +2 Dice to a Pool, they can choose to instead gain +1 Success on the result. This Special Order cannot be used again until the end of the Tamer and Digimon's turns."
  },
  "potential": {
    "effect": "The Tamer gains 1 Temporary IP at the start of a session, which diminishes if it isn’t used by the end of the session."
  },
  "purifyPartner": {
    "effect": "Out of sheer willpower, the Tamer’s Digimon is cured from one Negative Effect that was plaguing them as if they used [CLEANSE]. This Special Order cannot be used again the turn it is used."
  },
  "avoidingConsequences": {
    "effect": "The Tamer has a knack for avoiding trouble, immediate or otherwise. When the Tamer would get a Critical Failure on a Check or Torment Check, if adding the points the Tamer has in the Evade Skill would turn it into a Failure or higher, they can turn the result into a standard Failure."
  },
  "tuckAndRoll": {
    "effect": "When the Tamer would fail Evading an Attack in Combat, they can choose to Succeed instead. The Tamer can do this Once per Rest."
  },
  "busyHands": {
    "effect": "Without needing to roll, the Tamer can plant items that can fit in their palm on others without being noticed. The Tamer can also craft items that are made for a specific purpose for others to use during a Rest, using materials they’ve gathered on their journey. The Tamer chooses a Skill and crafts an item relevant to that Skill. This item can be given to another Character, including themself, and can grant a bonus to the Skill it was made for equal to the points the Tamer has in the Precision Skill above 2. The item no longer grants this benefit after it has been used, or after the Tamer that crafted it has taken another Rest. The Tamer can only craft one item this way per Rest."
  },
  "aimAssist": {
    "effect": "If the Tamer Directs their Digimon to improve their Accuracy using 2 Actions to use their highest Attribute, the bonus to Direct gains +2."
  },
  "overlooked": {
    "effect": "The Tamer has a talent to go unnoticed by others. The Tamer can hide naturally well in crowded places, able to blend in with the crowd without needing to roll. From the start of Combat, the Tamer can freely move on the battlefield and perform Actions without being noticed, as if they were obscured, unless they directly affect an Enemy. The Tamer is detected with an Awareness Check with a TN of 9 + the points the Tamer has in the Stealth Skill."
  },
  "silentMovement": {
    "effect": "The Tamer and Digimon no longer make any sounds with their footsteps and do not leave footprints behind. They can still give themselves away through other cues, such as knocking over a stack of cans."
  },
  "naturalExplorer": {
    "effect": "The Tamer can now use Athletics or Agility, whichever is higher, to calculate Movement, and gains Climb, Swim and Jump Movement equal to their normal Movement. They also ignore Difficult Terrain. In addition, whenever the Tamer would lead others through harsh terrain or difficult environments, they can designate a number of Allies equal to the points the Tamer has in the Athletics Skill. If those allies follow them into these environments, they can use the Tamer’s Athletics in place of theirs and can use a regular Move Action to pass through Difficult Terrain. They must follow behind the Tamer and cannot pass them or split off to maintain this benefit."
  },
  "experiencedStep": {
    "effect": "Whenever the Tamer uses Reposition as 2 Actions, such as using their highest Attribute or with a Bolster, they gain +1 Success to the final result."
  },
  "noPainNoGain": {
    "effect": "When the Tamer fails a Check, with the exception of Torment Checks, the Tamer can instead reroll the Check as an Endurance Check with the relevant Attribute. The Tamer can do this an amount of times equal to their points in the Endurance Skill above 2, and regains all expended uses when they finish a Rest."
  },
  "grit": {
    "effect": "Instead of making Evade Checks to avoid Attacks in Combat, the Tamer can make Endurance Checks instead. However, doing so means they will always take a minimum of 1 Damage, even if they Succeed. In addition, whenever the Tamer takes Damage that would reduce them to 0 Wound Boxes, they remain at 1 Wound Box. The Tamer can do this Once per Rest."
  },
  "heavyForce": {
    "effect": "The Tamer can make Feats of Strength Checks instead of Precision Checks when making Attacks in Combat. In addition, when the Tamer makes a Check using their Body or Agility Attribute, they can add a bonus to the roll equal to their points in the Feats of Strength Skill. The Tamer can do this Once per Rest."
  },
  "jointEffort": {
    "effect": "Whenever the Tamer would make a Feats of Strength Check to push, lift or drag something, and their Digimon is helping, making it a Teamwork Check, the Tamer gains a bonus to the roll equal to their Digimon’s SV, in addition to the Digimon’s result bonus or penalty."
  },
  "plantedIdea": {
    "effect": "When the Tamer succeeds on a Manipulate Check in a Roleplay situation, they can choose to influence a non-player character’s mind with a minor, reasonable idea related to how the Check was made. The target pursues the action to the best of its ability for a duration in minutes equal to the Tamer’s points in the Manipulate Skill. This does not make the target friendly toward the Tamer and often results in the opposite. A Tamer can use this Talent Once per Rest, and a non-player participant can only be affected by this Talent Once between Rests."
  },
  "fakeout": {
    "effect": "If the Tamer uses 2 Actions to Direct their Digimon, either to use the highest Attribute or by Bolstering, to improve their Accuracy, and the Digimon misses on the Attack that had the bonus, the Target suffers a -2 penalty to Dodge instead of a -1 from that Attack."
  },
  "endlessDream": {
    "effect": "Without needing to roll anything, the Tamer is capable of drawing attention from those around them in a dazzling performance. A performance done by this Tamer can inspire their Allies, granting Temporary IP for every point in the Tamer’s Performance Skill above 2, divided among them as the Tamer sees fit. The performing Tamer cannot grant themself Temporary IP this way. A character can only gain a max of 2 Temporary IP this way and can bypass their IP cap, but this cannot be granted if it would bring a character’s total IP, including Temporary IP, above 7. Any IP gained this way is lost when the character Rests. This can only be granted Once per Rest."
  },
  "personalCheerleader": {
    "effect": "When a Digimon benefitting from the Tamer’s Direct rolls an Accuracy or Dodge Pool, it can reroll up to two dice. The Digimon must take the new result."
  },
  "charmingInfluence": {
    "effect": "When the Tamer succeeds on a Persuasion Check in a Roleplay situation, they can choose to lay on the charm. Any non-player participants targeted by the Check become friendly to the Tamer and drop all hostility for a duration in minutes equal to the Tamer’s points in the Persuasion Skill. After this duration, the participants act depending on how they were treated while under the effects of this Talent. This is an opportunity for dialogue and diplomacy, even with the most heinous of villains. A Tamer can use this Talent Once per Rest, and a non-player participant can only be affected by this Talent Once between Rests."
  },
  "beTheWinners": {
    "effect": "The Tamer can use the Direct Action with 1 extra Action to spread the Bonus it grants between their own Digimon and one other willing Digimon. This can be split as the Tamer sees fit and suffers no penalties for Directing another Tamer’s Digimon. The Tamer’s Digimon must always have a minimum +2 bonus from the Direct."
  },
  "cyberSleuth": {
    "effect": "The Tamer can take a moment to think about their current circumstance before taking action. The player can ask one question of the GM that pertains to an action that can be taken immediately, and the GM must respond if that act will have good results, bad results, or both. The Tamer can do this an amount of times equal to their points in the Decipher Intent Skill above 2, and regains all expended uses when they finish a Rest."
  },
  "bestLaidPlans": {
    "effect": "Whenever the Tamer successfully uses the Hold Action and adds their Intelligence to the Digimon’s Accuracy or Dodge Check, they gain +1 Success to the final result. In addition, if the Tamer enters Combat against an Enemy who was being investigated by the Tamer, interrogated by the Tamer, or is definitely lying to the Tamer or was moments beforehand, the Enemy is considered Surprised, missing the first round of Combat."
  },
  "gloriousWorld": {
    "effect": "Without needing to roll anything, the Tamer is capable of cooking delicious food. A meal made by the Tamer grants Temporary Wound Boxes for every point in the Tamer’s Survival Skill above 2 to anyone who eats it until the next Rest. These Temporary Wound Boxes stack with other sources and are always removed first, but a character can only benefit from them Once between Rests."
  },
  "trailblazer": {
    "effect": "The Tamer has an innate sense of direction. They always know which way is north, and always know the exact route back to the previous settlement or similarly civilized area they were at last, such as a village or city."
  },
  "academicAdvice": {
    "effect": "The Tamer's vast array of knowledge comes in handy when helping their friends. When the Tamer participates as a helper in a Teamwork Check, they can make a Knowledge Check instead of the required Check. On a Success, the bonus they grant increases for every point in the Tamer’s Knowledge Skill above 2."
  },
  "livingEncyclopedia": {
    "effect": "The Tamer has a great deal of knowledge at their disposal. When the Tamer would need to make a Knowledge Check to recall information, if the TN would equal 15 or lower, the Tamer can choose to automatically Critically Succeed the Check. The Tamer can do this Once per Rest."
  },
  "hyperAlert": {
    "effect": "Without needing to roll, the Tamer is often aware of their surroundings and can make an Awareness Check instead of a normal Check when avoiding surprise dangers such as traps or surprise attacks. In addition, the Tamer’s Digimon gains a bonus to Initiative equal to every point in the Tamer’s Awareness Skill above 2."
  },
  "dangerSense": {
    "effect": "When the Tamer’s Digimon would use an Interrupt Action, the Tamer can choose to spend 1 Action instead of the Digimon. The Tamer can do this Once per Rest."
  },
  "calmingInfluence": {
    "effect": "The Tamer can help calm another Tamer in a moment of trauma and fear. If another Tamer fails a Torment Check, the Tamer with this Talent can allow them to reroll the Torment Check, gaining a bonus to the roll equal to the Tamer’s points in the Fortitude Skill. If the Check becomes a Success this way, both Tamers gain 1 IP instead of just the one that resolved the Torment. The Tamer can do this Once per Rest. This Tamer Talent cannot be used on the same Torment Check twice if two or more Tamers have it."
  },
  "teamPlayer": {
    "effect": "When participating in a Check via Teamwork with allies, the Tamer causes benefits depending on their role in the Check. If the Tamer is aiding, the ally can reroll any 1s rolled as part of the Check, but must take any rerolled result. If the Tamer is the one initiating the Check, they can ignore one ally’s Critical Failure penalty."
  },
  "breakTheChain": {
    "effect": "The Tamer has the strength to face their fears head on. The Tamer gains a bonus to Torment Checks equal to their points in the Bravery Skill. If Calming Influence would be used to reroll a Torment Check with this bonus, use the higher bonus to the Check instead of adding them together."
  },
  "withTheWill": {
    "effect": "If the Tamer would make a Torment Check, their Digimon can use an Interrupt Action to turn it into a Teamwork Check, rolling their own Bravery Check to assist, which uses DOS. The Tamer must be able to hear their Digimon and they must be within their Digimon’s Intercede range. The Tamer can do this Once per Rest."
  },
  "evasiveManeuvers": {
    "effect": "When Initiative is rolled, the Tamer’s Digimon gains a special Pool of Dodge Dice equal to its SV + the Tamer’s Agility. Whenever the Digimon would roll a Dodge Pool, they can add dice from this special Pool. These dice do not all need to be used at once, but dice removed from the Pool are removed for the rest of Combat. Any unused dice diminish at the end of Combat."
  },
  "speedSurge": {
    "effect": "The Tamer can inspire a burst of speed in their Digimon. The Digimon gains 2 extra Actions, and is treated as if it was a different round for the purpose of bypassing rules, such as one Attack per Round. This means a Digimon can take both of its Actions, and by using this Special Order it gets a second turn in the same round.",
    "automation": {
      "note": "The Digimon is treated as if it was in a different round for limits such as one Attack per Round."
    }
  },
  "undefeatedEndurance": {
    "effect": "When the Digimon is brought to 0 Wound Boxes, the Tamer makes a Pool Check using Body. The Digimon regains missing Wound Boxes equal to the number of successes + the Digimon’s SV and isn’t Defeated, remaining at its current SV."
  },
  "overpower": {
    "effect": "The Tamer may declare this Special Order after their Digimon rolls Accuracy for an Attack. Any 4s that were rolled for this Attack now act as Successes towards their Digimon’s Accuracy Pool. This Special Order can be used as an Interrupt Action if the Attack is also made as an Interrupt Action, such as Counterattack."
  },
  "peakPerformance": {
    "effect": "The Tamer rallies a willing Ally Digimon, including their Partner. The Digimon gains the [BASTION 2] Effect from their Tamer, which lasts until the start of the Tamer’s next turn. [BASTION] is a Positive Effect that grants a bonus equal to the Digimon's primary Stats except Health based on its value.",
    "automation": {
      "note": "Lasts until the start of the Tamer’s next turn."
    }
  },
  "revitalize": {
    "effect": "This Order can only be activated when the Digimon has 0 Wound Boxes or has dropped to its Default Stage after being Defeated. The Digimon returns to the Stage it was at when it was Defeated, and regains 7 Wound Boxes, which also ends any Effects or Qualities that were affecting the Digimon before it was defeated."
  },
  "signatureVersatility": {
    "effect": "When the Tamer's Digimon would make an Attack, the Digimon can treat it as its Signature Move if it wasn’t already. This grants the Attack all the benefits of Signature Move and expends Battery like normal. After the Attack is made, the effects of this Special Order end and it becomes a regular Attack again."
  },
  "enemyScan": {
    "effect": "The Tamer inflicts [DEBILITATE] on one Enemy Digimon with a Potency equal to its SV until the start of the Tamer’s next turn. [DEBILITATE] is a Negative Effect that causes the Digimon to suffer a penalty to all stats except Health equal to its Potency.",
    "automation": {
      "note": "Lasts until the start of the Tamer’s next turn."
    }
  },
  "challenger": {
    "effect": "When Initiative is rolled, the Tamer makes a Willpower Pool Check. Their Digimon gains Temporary Wound Boxes equal to the number of Successes + the highest SV among all enemies present, to a max of 5. These Temporary Wound Boxes stack with other sources and are always removed first. These last until the end of Combat."
  },
  "miracle": {
    "effect": "Through sheer force of willpower, the Tamer gains total narrative control of a roll. By spending 9 IP, which may be pooled together by the players, the Tamer may add or subtract 12 to a Check or Pool. Then they may set the results of each die rolled. Temporary IP cannot be used for this Tamer Talent."
  },
  "quickening": {
    "effect": "When the Tamer’s Digimon would be Attacked, before rolling Dodge the Tamer can declare this Special Order. The Digimon automatically dodges the incoming Attack without needing to roll. No Qualities that require a successful Dodge can be triggered with this Special Order."
  },
  "autoHit": {
    "effect": "When the Tamer’s Digimon makes an Attack against an Enemy, the Tamer can guarantee a hit by declaring this Special Order. The Digimon doesn’t roll Accuracy and the Target doesn’t roll Dodge; the Attack is instead treated as if it had automatic successes equal to the Attacker’s SV. This cannot be used on a Signature Move."
  },
  "vanish": {
    "effect": "The Tamer can choose an Enemy Digimon and declares this Special Order. The Tamer and their Digimon vanish from the Digimon’s sight as if they were under the Effect of [BLIND] until the start of the Tamer’s next turn. This duration cannot be reduced and the effect cannot be ignored. The Tamer can only take the Move or Reposition Action on the same turn it uses this Special Order, and cannot declare this Special Order if any other actions were used on the same turn beforehand.",
    "automation": {
      "note": "The effect lasts until the start of the Tamer’s next turn and cannot be reduced or ignored."
    }
  },
  "bullrush": {
    "effect": "The Tamer can help their Digimon rush the Enemy when they declare this Special Order. The Digimon can take the Difficult Move Action as a Free Action immediately, and until the end of its turn it can take the Difficult Move Action using 1 less Action, to a minimum of 1."
  },
  "thickSkin": {
    "effect": "If the Tamer’s Digimon would be moved against its will, the Tamer can declare this Special Order. The Tamer’s Digimon ignores the effect and is not moved at all in that instance. In addition, at the cost of 1 extra Action when declaring this Special Order, the source of the forced movement can instead have that Movement reflected back on it."
  },
  "adrenalineHit": {
    "effect": "The Tamer may pick up an object permitted by the GM and throw it at an Enemy Digimon they can see. The Target takes Unalterable Damage equal to its SV and suffers [STUN] until the Tamer’s next turn.",
    "automation": {
      "note": "Causes Unalterable Damage equal to the target’s SV and applies [STUN] until the Tamer’s next turn."
    }
  },
  "hackingPride": {
    "effect": "The Tamer may jeer at an Enemy and make them lose confidence by declaring this Special Order. The Tamer causes the Enemy to suffer a negative Direct, taking a penalty to its next Accuracy or Dodge Pool made before the Tamer’s next turn. The Tamer cannot take the Direct Action the turn it uses this Special Order. The Tamer can use their highest Attribute at the cost of 1 extra Action or Bolstered, like the Direct Action."
  },
  "distractingGesture": {
    "effect": "When an Enemy makes an Attack against an Ally or the Tamer’s Digimon, the Tamer can attempt to distract them mid-Attack to throw off their precision. The Enemy only rolls half as many dice for the Attack."
  },
  "nextOrder": {
    "effect": "The Tamer rallies their allies by declaring this Special Order. The Tamer grants the benefits of a Direct to 2 willing Allies, including their own Digimon, of their choice. This Direct suffers no penalty for directing other Tamer’s Digimon. The Tamer can still take the Direct Action the same turn it uses this Special Order, but it cannot Direct any Digimon it already Directed. The Tamer can use their highest Attribute at the cost of 1 extra Action or Bolstered, like the Direct Action."
  },
  "predictable": {
    "effect": "The Tamer may target one Enemy Digimon and make a prediction for their every future action by declaring this Special Order. The Tamer can declare a Hold Action, with the Trigger being any time when the target Enemy would take any Action, including Intercedes."
  },
  "survivalInstinct": {
    "effect": "When the Digimon would take Damage from an Attack, the Tamer can declare this Special Order. The Damage of the Attack is halved after Armor, and suffers no Unalterable Damage associated with the Attack."
  },
  "hackersMemory": {
    "effect": "When faced with a specific Enemy that the party has fought against prior, the Tamer may declare this Special Order. The Tamer can either increase the Potency of any Quality or Effect that asks for a Derived Stat against that Enemy by +1, or decrease the Potency of any Quality or Effect that asks for a Derived Stat used by that Enemy by -1."
  },
  "realization": {
    "effect": "The Tamer can choose an Enemy Digimon and declare this Special Order. The Tamer points out a fatal flaw in the Enemy’s defenses, inflicting [EXPLOIT 3], bypassing immunities from Overwrite or Resistance. This Effect remains until the end of Combat, until it is affected by [CLEANSE], or until the Digimon spends 2 Actions on its turn to defend this weakness.",
    "automation": {
      "note": "Lasts until the end of combat, until cleansed, or until the target spends 2 Actions to defend the weakness."
    }
  },
  "takeTheLead": {
    "effect": "The Tamer can declare this Special Order when their Digimon makes a Check of their own as an Action or as part of a Quality. The Digimon gains a +5 bonus to the Check. This can be done after the Result is known. This can be used as an Interrupt Action if the Digimon also makes a Check outside of its turn.",
    "automation": {
      "note": "The Digimon’s next own Check receives +5."
    }
  },
  "heroicExemplar": {
    "effect": "The Tamer can declare this Special Order after their Digimon successfully hits with an Attack against an Enemy. The Digimon and all Allies gain the [BASTION 1] Effect which has a Duration of 3.",
    "automation": {
      "note": "Applies [BASTION 1] to the Digimon and selected allies."
    }
  }
};

let cachedTamerTalentsLanguage = "";
let cachedLocalizedTamerTalents = null;

function isEnglishLanguage() {
  const language = String(globalThis.game?.i18n?.lang ?? globalThis.game?.i18n?.language ?? "");
  return language.toLowerCase().startsWith("en");
}

function getLocalizedTamerTalents() {
  const language = isEnglishLanguage() ? "en" : "pt-BR";

  if (cachedLocalizedTamerTalents && cachedTamerTalentsLanguage === language) {
    return cachedLocalizedTamerTalents;
  }

  cachedTamerTalentsLanguage = language;

  const sourceTalents = cloneTamerTalentData(DDA_TAMER_TALENTS_PT);

  cachedLocalizedTamerTalents = language === "en"
    ? sourceTalents.map((talent) => applyTamerTalentLocalizationPatch(
        talent,
        DDA_TAMER_TALENTS_EN_PATCH[talent.id]
      ))
    : sourceTalents;

  return cachedLocalizedTamerTalents;
}

function applyTamerTalentLocalizationPatch(talent, patch) {
  if (!patch) return talent;

  return mergeTamerTalentData(talent, patch);
}

function cloneTamerTalentData(data) {
  if (globalThis.foundry?.utils?.deepClone) {
    return globalThis.foundry.utils.deepClone(data);
  }

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(data);
  }

  return JSON.parse(JSON.stringify(data));
}

function mergeTamerTalentData(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      mergeTamerTalentData(target[key], value);
      continue;
    }

    target[key] = value;
  }

  return target;
}

function createLocalizedTamerTalentsProxy() {
  const target = [];

  return new Proxy(target, {
    get(_target, prop) {
      const talents = getLocalizedTamerTalents();

      if (prop === Symbol.iterator) {
        return talents[Symbol.iterator].bind(talents);
      }

      if (prop === "toJSON") {
        return () => talents;
      }

      if (prop === "valueOf") {
        return () => talents;
      }

      if (prop === "length") {
        return talents.length;
      }

      const value = talents[prop];

      if (typeof value === "function") {
        return value.bind(talents);
      }

      return value;
    },

    has(_target, prop) {
      return prop in getLocalizedTamerTalents();
    },

    ownKeys() {
      return Reflect.ownKeys(getLocalizedTamerTalents());
    },

    getOwnPropertyDescriptor(_target, prop) {
      const talents = getLocalizedTamerTalents();
      const descriptor = Object.getOwnPropertyDescriptor(talents, prop);

      if (!descriptor) return undefined;

      return {
        ...descriptor,
        configurable: true
      };
    }
  });
}

export const DDA_TAMER_TALENTS = createLocalizedTamerTalentsProxy();

export function getDdaTamerTalents() {
  return getLocalizedTamerTalents();
}
