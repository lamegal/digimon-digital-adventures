const DIGIMENTAL_ASSET_PATH = "systems/digimon-digital-adventures/assets/digimentals";
const CREST_ASSET_PATH = "systems/digimon-digital-adventures/assets/crests";

function crestImg(name) {
  return `${CREST_ASSET_PATH}/Crest_of_${name}.webp`;
}

export const DDA_DIGIMENTALS = [
  {
    id: "courage",
    name: "Digimental of Courage",
    ptName: "Digimental da Coragem",
    crest: "courage",
    crestLabel: "Coragem",
    stage: "child",
    stageValue: 2,
    spentDp: 8,
    img: crestImg("Courage"),
    element: "fire",
    qualityGrants: [
      { name: "Naturewalk", choice: "Fire" },
      { name: "Elemental Force", choice: "Fire" },
      { name: "Prodigious Skill", choice: "Bravery" },
      { name: "Weapon", rank: 3 },
      { name: "Chrome Digizoid Weaponry" }
    ]
  },
  {
    id: "friendship",
    name: "Digimental of Friendship",
    ptName: "Digimental da Amizade",
    crest: "friendship",
    crestLabel: "Amizade",
    stage: "child",
    stageValue: 2,
    spentDp: 8,
    img: crestImg("Friendship"),
    element: "thunder",
    qualityGrants: [
      { name: "Naturewalk", choice: "Thunder" },
      { name: "Elemental Force", choice: "Thunder" },
      { name: "Prodigious Skill", choice: "Persuasion" },
      { name: "Instinct", rank: 3 },
      { name: "Overwrite" }
    ]
  },
  {
    id: "love",
    name: "Digimental of Love",
    ptName: "Digimental do Amor",
    crest: "love",
    crestLabel: "Amor",
    stage: "child",
    stageValue: 2,
    spentDp: 8,
    img: crestImg("Love"),
    element: "wind",
    qualityGrants: [
      { name: "Naturewalk", choice: "Wind" },
      { name: "Elemental Force", choice: "Wind" },
      { name: "Prodigious Skill", choice: "Persuasion" },
      { name: "Instinct", rank: 3 },
      { name: "Chrome Digizoid Armor" }
    ]
  },
  {
    id: "sincerity",
    name: "Digimental of Sincerity",
    ptName: "Digimental da Sinceridade",
    crest: "sincerity",
    crestLabel: "Sinceridade",
    stage: "child",
    stageValue: 2,
    spentDp: 6,
    img: crestImg("Sincerity"),
    element: "wood",
    qualityGrants: [
      { name: "Naturewalk", choice: "Wood" },
      { name: "Elemental Force", choice: "Wood" },
      { name: "Prodigious Skill", choice: "Decipher Intent" },
      { name: "Anticipate Assault" }
    ]
  },
  {
    id: "knowledge",
    name: "Digimental of Knowledge",
    ptName: "Digimental do Conhecimento",
    crest: "knowledge",
    crestLabel: "Conhecimento",
    stage: "child",
    stageValue: 2,
    spentDp: 7,
    img: crestImg("Knowledge"),
    element: "earth",
    qualityGrants: [
      { name: "Naturewalk", choice: "Earth" },
      { name: "Elemental Force", choice: "Earth" },
      { name: "Prodigious Skill", choice: "Knowledge" },
      { name: "Armor Piercing", rank: 3 }
    ]
  },
  {
    id: "reliability",
    name: "Digimental of Reliability",
    ptName: "Digimental da Confiança",
    crest: "reliability",
    crestLabel: "Confiança",
    stage: "child",
    stageValue: 2,
    spentDp: 8,
    img: crestImg("Reliability"),
    element: "water",
    qualityGrants: [
      { name: "Naturewalk", choice: "Water" },
      { name: "Elemental Force", choice: "Water" },
      { name: "Prodigious Skill", choice: "Endurance" },
      { name: "Second Wind", rank: 3 },
      { name: "Chrome Digizoid Armor" }
    ]
  },
  {
    id: "hope",
    name: "Digimental of Hope",
    ptName: "Digimental da Esperança",
    crest: "hope",
    crestLabel: "Esperança",
    stage: "child",
    stageValue: 2,
    spentDp: 8,
    img: crestImg("Hope"),
    element: "light",
    qualityGrants: [
      { name: "Naturewalk", choice: "Light" },
      { name: "Elemental Force", choice: "Light" },
      { name: "Prodigious Skill", choice: "Fortitude" },
      { name: "Aggressive Flank" },
      { name: "Coordinated Assault" }
    ]
  },
  {
    id: "light",
    name: "Digimental of Light",
    ptName: "Digimental da Luz",
    crest: "light",
    crestLabel: "Luz",
    stage: "child",
    stageValue: 2,
    spentDp: 8,
    img: crestImg("Light"),
    element: "light",
    qualityGrants: [
      { name: "Naturewalk", choice: "Light" },
      { name: "Elemental Force", choice: "Light" },
      { name: "Positive Attack Effect", note: "GM choice" },
      { name: "Holy Ward" }
    ]
  },
  {
    id: "kindness",
    name: "Digimental of Kindness",
    ptName: "Digimental da Bondade",
    crest: "kindness",
    crestLabel: "Bondade",
    stage: "child",
    stageValue: 2,
    spentDp: 3,
    img: crestImg("Kindness"),
    element: "support",
    qualityGrants: [
      { name: "Positive Master Attack Effect", note: "GM choice" }
    ]
  },
  {
    id: "miracles",
    name: "Digimental of Miracles",
    ptName: "Digimental dos Milagres",
    crest: "miracles",
    crestLabel: "Milagres",
    stage: "adult",
    stageValue: 3,
    spentDp: 8,
    img: crestImg("Miracles"),
    element: "light",
    qualityGrants: [
      { name: "Data Optimization", choice: "Variable" },
      { name: "Naturewalk", choice: "Light" },
      { name: "Elemental Force", choice: "Light" },
      { name: "Weapon", rank: 1 },
      { name: "Shining Digizoid Weaponry" }
    ]
  },
  {
    id: "destiny",
    name: "Digimental of Destiny",
    ptName: "Digimental do Destino",
    crest: "destiny",
    crestLabel: "Destino",
    stage: "adult",
    stageValue: 3,
    spentDp: 6,
    img: crestImg("Destiny"),
    element: "light",
    qualityGrants: [
      { name: "Naturewalk", choice: "Light" },
      { name: "Elemental Force", choice: "Light" },
      { name: "Shining Digizoid Armor" }
    ]
  },
  {
    id: "darkness",
    name: "Digimental of Darkness",
    ptName: "Digimental das Trevas",
    crest: "darkness",
    crestLabel: "Trevas",
    stage: "adult",
    stageValue: 3,
    spentDp: 7,
    img: `${DIGIMENTAL_ASSET_PATH}/Digimental_Darkness.webp`,
    element: "darkness",
    qualityGrants: [
      { name: "Naturewalk", choice: "Darkness" },
      { name: "Elemental Force", choice: "Darkness" },
      { name: "Instinct", rank: 1 },
      { name: "Digital Hazard" }
    ]
  }
].map((entry) => ({
  ...entry,
  usage: {
    recharge: "rest",
    evolutionPointCost: 0,
    actionCost: 1
  },
  requirements: {
    allowedBaseStages: ["child"],
    requiresItem: true
  }
}));

export function getDdaDigimentals() {
  return DDA_DIGIMENTALS;
}

export function findDdaDigimental(id) {
  return DDA_DIGIMENTALS.find((entry) => entry.id === id) ?? null;
}
