const MODULE_ID = "digimon-digital-adventures";

function localize(key) {
  return game?.i18n?.localize(key) ?? key;
}

export const DDA = {};

DDA.actorTypes = {
  character: localize("DDA.Actor.Character"),
  digimon: localize("DDA.Actor.Digimon"),
  npc: localize("DDA.Actor.NPC"),
  group: localize("DDA.Actor.Group")
};

DDA.itemTypes = {
  attack: localize("DDA.Item.Attack"),
  quality: localize("DDA.Item.Quality"),
  torment: localize("DDA.Item.Torment"),
  tamerTalent: localize("DDA.Item.TamerTalent"),
  equipment: localize("DDA.Item.Equipment"),
  consumable: localize("DDA.Item.Consumable"),
  card: localize("DDA.Item.Card"),
  digimental: localize("DDA.Item.Digimental"),
  milestone: localize("DDA.Item.Milestone"),
  trait: localize("DDA.Item.Trait"),
  evolutionLink: localize("DDA.Item.EvolutionLink")
};

DDA.tamerAttributes = {
  agility: localize("DDA.TamerAttribute.Agility"),
  body: localize("DDA.TamerAttribute.Body"),
  charisma: localize("DDA.TamerAttribute.Charisma"),
  intelligence: localize("DDA.TamerAttribute.Intelligence"),
  willpower: localize("DDA.TamerAttribute.Willpower")
};

DDA.tamerSkills = {
  evade: localize("DDA.TamerSkill.Evade"),
  precision: localize("DDA.TamerSkill.Precision"),
  stealth: localize("DDA.TamerSkill.Stealth"),
  athletics: localize("DDA.TamerSkill.Athletics"),
  endurance: localize("DDA.TamerSkill.Endurance"),
  featsOfStrength: localize("DDA.TamerSkill.FeatsOfStrength"),
  manipulate: localize("DDA.TamerSkill.Manipulate"),
  performance: localize("DDA.TamerSkill.Performance"),
  persuasion: localize("DDA.TamerSkill.Persuasion"),
  decipherIntent: localize("DDA.TamerSkill.DecipherIntent"),
  survival: localize("DDA.TamerSkill.Survival"),
  knowledge: localize("DDA.TamerSkill.Knowledge"),
  awareness: localize("DDA.TamerSkill.Awareness"),
  bravery: localize("DDA.TamerSkill.Bravery"),
  fortitude: localize("DDA.TamerSkill.Fortitude")
};

DDA.digimonMainStats = {
  accuracy: localize("DDA.MainStat.Accuracy"),
  damage: localize("DDA.MainStat.Damage"),
  dodge: localize("DDA.MainStat.Dodge"),
  armor: localize("DDA.MainStat.Armor"),
  health: localize("DDA.MainStat.Health")
};

DDA.digimonDerivedStats = {
  bit: localize("DDA.DerivedStat.BIT"),
  dos: localize("DDA.DerivedStat.DOS"),
  ram: localize("DDA.DerivedStat.RAM"),
  cpu: localize("DDA.DerivedStat.CPU")
};

DDA.stages = {
  baby1: {
    label: localize("DDA.Stage.Baby1"),
    stageValue: 1,
    startingDp: 0,
    movement: 2,
    attacks: 1,
    maxSize: "small"
  },
  baby2: {
    label: localize("DDA.Stage.Baby2"),
    stageValue: 1,
    startingDp: 5,
    movement: 2,
    attacks: 1,
    maxSize: "medium"
  },
  child: {
    label: localize("DDA.Stage.Child"),
    stageValue: 2,
    startingDp: 10,
    movement: 3,
    attacks: 3,
    maxSize: "large"
  },
  adult: {
    label: localize("DDA.Stage.Adult"),
    stageValue: 3,
    startingDp: 20,
    movement: 4,
    attacks: 3,
    maxSize: "huge"
  },
  perfect: {
    label: localize("DDA.Stage.Perfect"),
    stageValue: 4,
    startingDp: 30,
    movement: 5,
    attacks: 3,
    maxSize: "gigantic"
  },
  ultimate: {
    label: localize("DDA.Stage.Ultimate"),
    stageValue: 5,
    startingDp: 40,
    movement: 6,
    attacks: 4,
    maxSize: "colossal"
  },
  ultimatePlus: {
    label: localize("DDA.Stage.UltimatePlus"),
    stageValue: 5,
    startingDp: 50,
    movement: 7,
    attacks: 4,
    maxSize: "colossal"
  }
};

DDA.jogressRecipes = [
  {
    id: "jogress_omegamon",
    label: "Omegamon",
    method: "jogress",
    result: { name: "Omegamon", species: "Omegamon", uuid: "" },
    components: [
      { name: "WarGreymon", species: "WarGreymon", role: "primary" },
      { name: "MetalGarurumon", species: "MetalGarurumon", role: "secondary" }
    ],
    cost: { actions: 2 },
    temporary: true,
    hidden: false
  },
  {
    id: "jogress_paildramon",
    label: "Paildramon",
    method: "jogress",
    result: { name: "Paildramon", species: "Paildramon", uuid: "" },
    components: [
      { name: "XV-mon", species: "XV-mon", role: "primary" },
      { name: "Stingmon", species: "Stingmon", role: "secondary" }
    ],
    cost: { actions: 2 },
    temporary: true,
    hidden: false
  },
  {
    id: "jogress_dinobeemon",
    label: "Dinobeemon",
    method: "jogress",
    result: { name: "Dinobeemon", species: "Dinobeemon", uuid: "" },
    components: [
      { name: "Stingmon", species: "Stingmon", role: "primary" },
      { name: "XV-mon", species: "XV-mon", role: "secondary" }
    ],
    cost: { actions: 2 },
    temporary: true,
    hidden: false
  },
  {
    id: "jogress_silphymon",
    label: "Silphymon",
    method: "jogress",
    result: { name: "Silphymon", species: "Silphymon", uuid: "" },
    components: [
      { name: "Aquilamon", species: "Aquilamon", role: "primary" },
      { name: "Tailmon", species: "Tailmon", role: "secondary" }
    ],
    cost: { actions: 2 },
    temporary: true,
    hidden: false
  },
  {
    id: "jogress_shakkoumon",
    label: "Shakkoumon",
    method: "jogress",
    result: { name: "Shakkoumon", species: "Shakkoumon", uuid: "" },
    components: [
      { name: "Ankylomon", species: "Ankylomon", role: "primary" },
      { name: "Angemon", species: "Angemon", role: "secondary" }
    ],
    cost: { actions: 2 },
    temporary: true,
    hidden: false
  }
];


DDA.hybridRecipes = [
  {
    id: "hybrid_flamemon",
    label: "Flamemon",
    method: "hybrid",
    result: { name: "Flamemon", species: "Flamemon", aliases: ["Flamemon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "child",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_strabimon",
    label: "Strabimon",
    method: "hybrid",
    result: { name: "Strabimon", species: "Strabimon", aliases: ["Strabimon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "child",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_agnimon",
    label: "Agunimon / Agnimon",
    method: "hybrid",
    result: { name: "Agunimon", species: "Agunimon", aliases: ["Agunimon", "Agnimon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_lobomon",
    label: "Lobomon / Wolfmon",
    method: "hybrid",
    result: { name: "Lobomon", species: "Lobomon", aliases: ["Lobomon", "Wolfmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_beetlemon",
    label: "Beetlemon / Blitzmon",
    method: "hybrid",
    result: { name: "Beetlemon", species: "Beetlemon", aliases: ["Beetlemon", "Blitzmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_kazemon",
    label: "Kazemon / Fairymon",
    method: "hybrid",
    result: { name: "Kazemon", species: "Kazemon", aliases: ["Kazemon", "Fairymon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_kumamon",
    label: "Kumamon / Chackmon",
    method: "hybrid",
    result: { name: "Kumamon", species: "Kumamon", aliases: ["Kumamon", "Chackmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_arbormon",
    label: "Arbormon",
    method: "hybrid",
    result: { name: "Arbormon", species: "Arbormon", aliases: ["Arbormon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_grumblemon",
    label: "Grumblemon / Grottemon",
    method: "hybrid",
    result: { name: "Grumblemon", species: "Grumblemon", aliases: ["Grumblemon", "Grottemon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_lanamon",
    label: "Lanamon",
    method: "hybrid",
    result: { name: "Lanamon", species: "Lanamon", aliases: ["Lanamon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_duskmon",
    label: "Duskmon",
    method: "hybrid",
    result: { name: "Duskmon", species: "Duskmon", aliases: ["Duskmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_loweemon",
    label: "Loweemon / Löwemon",
    method: "hybrid",
    result: { name: "Loweemon", species: "Loweemon", aliases: ["Loweemon", "Loewemon", "Löwemon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_burninggreymon",
    label: "BurningGreymon / Vritramon",
    method: "hybrid",
    result: { name: "BurningGreymon", species: "BurningGreymon", aliases: ["BurningGreymon", "Vritramon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_kendogarurumon",
    label: "KendoGarurumon / Garmmon",
    method: "hybrid",
    result: { name: "KendoGarurumon", species: "KendoGarurumon", aliases: ["KendoGarurumon", "Garmmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_metalkabuterimon",
    label: "MetalKabuterimon / Bolgmon",
    method: "hybrid",
    result: { name: "MetalKabuterimon", species: "MetalKabuterimon", aliases: ["MetalKabuterimon", "Bolgmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_zephyrmon",
    label: "Zephyrmon / Shutumon",
    method: "hybrid",
    result: { name: "Zephyrmon", species: "Zephyrmon", aliases: ["Zephyrmon", "Shutumon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_korikakumon",
    label: "Korikakumon / Blizzarmon",
    method: "hybrid",
    result: { name: "Korikakumon", species: "Korikakumon", aliases: ["Korikakumon", "Blizzarmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_petaldramon",
    label: "Petaldramon",
    method: "hybrid",
    result: { name: "Petaldramon", species: "Petaldramon", aliases: ["Petaldramon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_gigasmon",
    label: "Gigasmon",
    method: "hybrid",
    result: { name: "Gigasmon", species: "Gigasmon", aliases: ["Gigasmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_calmaramon",
    label: "Calmaramon",
    method: "hybrid",
    result: { name: "Calmaramon", species: "Calmaramon", aliases: ["Calmaramon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_velgrmon",
    label: "Velgrmon",
    method: "hybrid",
    result: { name: "Velgrmon", species: "Velgrmon", aliases: ["Velgrmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_jagerloweemon",
    label: "JagerLoweemon / JägerLöwemon",
    method: "hybrid",
    result: { name: "JagerLoweemon", species: "JagerLoweemon", aliases: ["JagerLoweemon", "JagerLoewemon", "JägerLöwemon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_sephirothmon",
    label: "Sephirothmon / Sakkakumon",
    method: "hybrid",
    result: { name: "Sephirothmon", species: "Sephirothmon", aliases: ["Sephirothmon", "Sakkakumon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "perfect",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_aldamon",
    label: "Aldamon / Ardhamon",
    method: "hybrid",
    result: { name: "Aldamon", species: "Aldamon", aliases: ["Aldamon", "Ardhamon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "ultimate",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_beowolfmon",
    label: "Beowolfmon",
    method: "hybrid",
    result: { name: "Beowolfmon", species: "Beowolfmon", aliases: ["Beowolfmon", "BeoWolfmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "ultimate",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_rhinokabuterimon",
    label: "RhinoKabuterimon",
    method: "hybrid",
    result: { name: "RhinoKabuterimon", species: "RhinoKabuterimon", aliases: ["RhinoKabuterimon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "ultimate",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_jetsilphymon",
    label: "JetSilphymon",
    method: "hybrid",
    result: { name: "JetSilphymon", species: "JetSilphymon", aliases: ["JetSilphymon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "ultimate",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_daipenmon",
    label: "DaiPenmon / Daipenmon",
    method: "hybrid",
    result: { name: "DaiPenmon", species: "DaiPenmon", aliases: ["DaiPenmon", "Daipenmon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "ultimate",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_rhihimon",
    label: "Rhihimon / Raihimon",
    method: "hybrid",
    result: { name: "Rhihimon", species: "Rhihimon", aliases: ["Rhihimon", "Raihimon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "ultimate",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_emperorgreymon",
    label: "EmperorGreymon",
    method: "hybrid",
    result: { name: "EmperorGreymon", species: "EmperorGreymon", aliases: ["EmperorGreymon", "KaiserGreymon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "ultimatePlus",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "hybrid_magnagarurumon",
    label: "MagnaGarurumon",
    method: "hybrid",
    result: { name: "MagnaGarurumon", species: "MagnaGarurumon", aliases: ["MagnaGarurumon", "MagnaGarummon"] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "ultimatePlus",
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    requiresPartner: false,
    temporary: true,
    hidden: false
  },
  {
    id: "biomerge_dukemon",
    label: "Bio-Merge: Dukemon / Gallantmon",
    method: "biomerge",
    result: { name: "Dukemon", species: "Dukemon", aliases: ["Dukemon", "Gallantmon"] },
    component: { name: "Guilmon", species: "Guilmon", aliases: ["Guilmon"] },
    equivalentStage: "ultimate",
    partnerRequirement: "required",
    partnerAvailability: "merged",
    requiresPartner: true,
    temporary: true,
    hidden: false
  },
  {
    id: "mindlink_generic",
    label: "Mind Link Evolution",
    method: "mindLink",
    result: { name: "", species: "", aliases: [] },
    component: { name: "", species: "", aliases: [] },
    equivalentStage: "adult",
    partnerRequirement: "required",
    partnerAvailability: "unchanged",
    requiresPartner: true,
    temporary: true,
    hidden: true
  }
];

DDA.hybridMethods = {
  hybrid: localize("DDA.Hybrid.Method.Hybrid"),
  biomerge: localize("DDA.Hybrid.Method.BioMerge"),
  mindLink: localize("DDA.Hybrid.Method.MindLink")
};

DDA.sizes = {
  small: localize("DDA.Size.Small"),
  medium: localize("DDA.Size.Medium"),
  large: localize("DDA.Size.Large"),
  huge: localize("DDA.Size.Huge"),
  gigantic: localize("DDA.Size.Gigantic"),
  colossal: localize("DDA.Size.Colossal")
};

DDA.qualityCategories = {
  attack: localize("DDA.QualityCategory.Attack"),
  trigger: localize("DDA.QualityCategory.Trigger"),
  static: localize("DDA.QualityCategory.Static"),
  core: localize("DDA.QualityCategory.Core"),
  free: localize("DDA.QualityCategory.Free"),
  negative: localize("DDA.QualityCategory.Negative")
};

DDA.targetNumbers = {
  veryEasy: { label: localize("DDA.TargetNumber.VeryEasy"), value: 8 },
  easy: { label: localize("DDA.TargetNumber.Easy"), value: 10 },
  simple: { label: localize("DDA.TargetNumber.Simple"), value: 12 },
  everyday: { label: localize("DDA.TargetNumber.Everyday"), value: 15 },
  difficult: { label: localize("DDA.TargetNumber.Difficult"), value: 18 },
  veryDifficult: { label: localize("DDA.TargetNumber.VeryDifficult"), value: 22 },
  incrediblyDifficult: { label: localize("DDA.TargetNumber.IncrediblyDifficult"), value: 26 },
  almostImpossible: { label: localize("DDA.TargetNumber.AlmostImpossible"), value: 30 }
};

DDA.stances = {
  neutral: localize("DDA.Stance.Neutral"),
  offensive: localize("DDA.Stance.Offensive"),
  defensive: localize("DDA.Stance.Defensive"),
  brave: localize("DDA.Stance.Brave"),
  fierce: localize("DDA.Stance.Fierce"),
  sentry: localize("DDA.Stance.Sentry"),
  martial: localize("DDA.Stance.Martial"),
  anticipate: localize("DDA.Stance.Anticipate")
};

DDA.attackTags = {
  melee: localize("DDA.AttackTag.Melee"),
  range: localize("DDA.AttackTag.Range"),
  damage: localize("DDA.AttackTag.Damage"),
  support: localize("DDA.AttackTag.Support"),
  weapon: localize("DDA.AttackTag.Weapon"),
  piercing: localize("DDA.AttackTag.Piercing"),
  certain: localize("DDA.AttackTag.Certain"),
  charge: localize("DDA.AttackTag.Charge"),
  ammo: localize("DDA.AttackTag.Ammo"),
  recoil: localize("DDA.AttackTag.Recoil"),
  sneak: localize("DDA.AttackTag.Sneak"),
  simple: localize("DDA.AttackTag.Simple"),
  blast: localize("DDA.AttackTag.Blast"),
  burst: localize("DDA.AttackTag.Burst"),
  cone: localize("DDA.AttackTag.Cone"),
  line: localize("DDA.AttackTag.Line"),
  pass: localize("DDA.AttackTag.Pass"),
  wave: localize("DDA.AttackTag.Wave")
};

DDA.effectTags = {
  root: localize("DDA.EffectTag.Root"),
  slow: localize("DDA.EffectTag.Slow"),
  vague: localize("DDA.EffectTag.Vague"),
  keen: localize("DDA.EffectTag.Keen"),
  swift: localize("DDA.EffectTag.Swift"),
  tailwind: localize("DDA.EffectTag.Tailwind"),
  cleanse: localize("DDA.EffectTag.Cleanse"),
  fear: localize("DDA.EffectTag.Fear"),
  doom: localize("DDA.EffectTag.Doom"),
  taunt: localize("DDA.EffectTag.Taunt"),
  pull: localize("DDA.EffectTag.Pull"),
  push: localize("DDA.EffectTag.Push"),
  confuse: localize("DDA.EffectTag.Confuse"),
  distract: localize("DDA.EffectTag.Distract"),
  dull: localize("DDA.EffectTag.Dull"),
  frail: localize("DDA.EffectTag.Frail"),
  heavy: localize("DDA.EffectTag.Heavy"),
  nimble: localize("DDA.EffectTag.Nimble"),
  sharpen: localize("DDA.EffectTag.Sharpen"),
  sturdy: localize("DDA.EffectTag.Sturdy"),
  burn: localize("DDA.EffectTag.Burn"),
  freeze: localize("DDA.EffectTag.Freeze"),
  poison: localize("DDA.EffectTag.Poison"),
  haste: localize("DDA.EffectTag.Haste"),
  immune: localize("DDA.EffectTag.Immune"),
  exploit: localize("DDA.EffectTag.Exploit"),
  pacify: localize("DDA.EffectTag.Pacify"),
  paralyze: localize("DDA.EffectTag.Paralyze"),
  rattled: localize("DDA.EffectTag.Rattled"),
  shaken: localize("DDA.EffectTag.Shaken"),
  weak: localize("DDA.EffectTag.Weak"),
  daring: localize("DDA.EffectTag.Daring"),
  fury: localize("DDA.EffectTag.Fury"),
  regen: localize("DDA.EffectTag.Regen"),
  steady: localize("DDA.EffectTag.Steady"),
  strength: localize("DDA.EffectTag.Strength"),
  vigil: localize("DDA.EffectTag.Vigil"),
  vigor: localize("DDA.EffectTag.Vigor"),
  ruin: localize("DDA.EffectTag.Ruin"),
  blind: localize("DDA.EffectTag.Blind"),
  deny: localize("DDA.EffectTag.Deny"),
  dot: localize("DDA.EffectTag.Dot"),
  stun: localize("DDA.EffectTag.Stun"),
  shield: localize("DDA.EffectTag.Shield"),
  zero: localize("DDA.EffectTag.Zero"),
  charm: localize("DDA.EffectTag.Charm"),
  bug: localize("DDA.EffectTag.Bug"),
  demoralize: localize("DDA.EffectTag.Demoralize"),
  frenzy: localize("DDA.EffectTag.Frenzy"),
  invincible: localize("DDA.EffectTag.Invincible")
};

DDA.digimonAttributes = {
  none: localize("DDA.DigimonProfile.Attribute.None"),
  vaccine: localize("DDA.DigimonProfile.Attribute.Vaccine"),
  data: localize("DDA.DigimonProfile.Attribute.Data"),
  virus: localize("DDA.DigimonProfile.Attribute.Virus"),
  free: localize("DDA.DigimonProfile.Attribute.Free"),
  variable: localize("DDA.DigimonProfile.Attribute.Variable")
};
