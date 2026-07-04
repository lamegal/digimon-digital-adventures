// systems/digimon-digital-adventures/data/digimon-baby1-database.js
// Database inicial dos Digimon Bebê I usados pelo Questionário de Compatibilidade.
// Gerado em 2026-06-01 a partir de DDA_DIGITAMA_POOL em dda-digimon-wizard.js.
//
// Observação:
// - "traits" vêm diretamente do questionário.
// - "attribute", "field", "family" e "type" são classificações iniciais de sistema,
//   derivadas dos traits para permitir compêndio, filtros e links de evolução.
// - "evolvesTo" começa vazio de propósito: preencha com os nomes/keys dos Bebê II
//   quando formos montar as linhas evolutivas.

export const DDA_BABY1_STAGE_PROFILE = {
  stage: "baby1",
  stageValue: 0,
  label: "Bebê I",
  startingDp: 0,
  movement: 1,
  attackSlots: 1,
  maxSize: "small",
  negativeLimit: 0,
  freeQualityLimit: 0,

  // O wizard atual usa base 1 para Bebê I, mesmo com PD 0.
  // Se você decidir que Bebê I deve ter stats 0 no compêndio, altere para 0 aqui
  // e ajuste buildBaby1DigimonActorData.
  mainStatBase: 1
};

export const DDA_BABY1_DIGIMON_DATABASE = [
  {
    "key": "algomon",
    "name": "Algomon",
    "species": "Algomon",
    "fileName": "Algomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "virus",
    "field": "metalEmpire",
    "family": "machine",
    "typeKey": "machine",
    "type": "Máquina",
    "group": "",
    "traits": [
      "artificial",
      "analytical",
      "isolated",
      "observant",
      "strange",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Algomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Algomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "bombmon",
    "name": "Bombmon",
    "species": "Bombmon",
    "fileName": "Bombmon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "virus",
    "field": "dragonsRoar",
    "family": "dragon",
    "typeKey": "dragon",
    "type": "Dragão",
    "group": "",
    "traits": [
      "impulsive",
      "energetic",
      "chaotic",
      "external",
      "resilient",
      "flame"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Bombmon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Bombmon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "bommon",
    "name": "Bommon",
    "species": "Bommon",
    "fileName": "Bommon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "dragonsRoar",
    "family": "dragon",
    "typeKey": "dragon",
    "type": "Dragão",
    "group": "",
    "traits": [
      "playful",
      "energetic",
      "dragon",
      "hopeful",
      "social",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_bommon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Bommon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "botamon",
    "name": "Botamon",
    "species": "Botamon",
    "fileName": "Botamon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "dragonsRoar",
    "family": "dragon",
    "typeKey": "dragon",
    "type": "Dragão",
    "group": "",
    "traits": [
      "courageous",
      "impulsive",
      "dragon",
      "energetic",
      "resilient",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_botamon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Botamon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "bubbmon",
    "name": "Bubbmon",
    "species": "Bubbmon",
    "fileName": "Bubbmon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "deepSavers",
    "family": "aquatic",
    "typeKey": "aquatic",
    "type": "Aquático",
    "group": "",
    "traits": [
      "aquatic",
      "playful",
      "adaptable",
      "emotional",
      "social",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_bubbmon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Bubbmon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "chibickmon",
    "name": "Chibickmon",
    "species": "Chibickmon",
    "fileName": "Chibickmon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "windGuardians",
    "family": "bird",
    "typeKey": "bird",
    "type": "Ave",
    "group": "",
    "traits": [
      "bird",
      "energetic",
      "curious",
      "playful",
      "social",
      "wind"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Chibickmon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Chibickmon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "chicomon",
    "name": "Chicomon",
    "species": "Chicomon",
    "fileName": "Chicomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "natureSpirits",
    "family": "beast",
    "typeKey": "beast",
    "type": "Besta",
    "group": "",
    "traits": [
      "playful",
      "energetic",
      "social",
      "hopeful",
      "beast",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_chicomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Chicomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "choromon",
    "name": "Choromon",
    "species": "Choromon",
    "fileName": "Choromon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "metalEmpire",
    "family": "machine",
    "typeKey": "machine",
    "type": "Máquina",
    "group": "",
    "traits": [
      "machine",
      "analytical",
      "creative",
      "energetic",
      "curious",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_choromon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Choromon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "cocomon",
    "name": "Cocomon",
    "species": "Cocomon",
    "fileName": "Cocomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "natureSpirits",
    "family": "beast",
    "typeKey": "beast",
    "type": "Besta",
    "group": "",
    "traits": [
      "lonely",
      "emotional",
      "melancholic",
      "cautious",
      "beast",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_cocomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Cocomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "cotsucomon",
    "name": "Cotsucomon",
    "species": "Cotsucomon",
    "fileName": "Cotsucomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "unknown",
    "family": "mutant",
    "typeKey": "mutant",
    "type": "Mutante",
    "group": "",
    "traits": [
      "earth",
      "stoic",
      "resilient",
      "cautious",
      "isolated",
      "ancient"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Cotsucomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Cotsucomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "curimon",
    "name": "Curimon",
    "species": "Curimon",
    "fileName": "Curimon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "vaccine",
    "field": "virusBusters",
    "family": "holy",
    "typeKey": "angel",
    "type": "Anjo",
    "group": "",
    "traits": [
      "holy",
      "gentle",
      "empathetic",
      "emotional",
      "hopeful",
      "social"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Curimon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Curimon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "dodomon",
    "name": "Dodomon",
    "species": "Dodomon",
    "fileName": "Dodomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "natureSpirits",
    "family": "beast",
    "typeKey": "beast",
    "type": "Besta",
    "group": "",
    "traits": [
      "beast",
      "stubborn",
      "courageous",
      "energetic",
      "protective",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_dodomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Dodomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "dokimon",
    "name": "Dokimon",
    "species": "Dokimon",
    "fileName": "Dokimon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "virus",
    "field": "nightmareSoldiers",
    "family": "dark",
    "typeKey": "demon",
    "type": "Demônio",
    "group": "",
    "traits": [
      "dark",
      "chaotic",
      "impulsive",
      "emotional",
      "mutant",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Dokimon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Dokimon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "fufumon",
    "name": "Fufumon",
    "species": "Fufumon",
    "fileName": "Fufumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "dragonsRoar",
    "family": "dragon",
    "typeKey": "dragon",
    "type": "Dragão",
    "group": "",
    "traits": [
      "dragon",
      "cautious",
      "observant",
      "lonely",
      "resilient",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_fufumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Fufumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "fukamon",
    "name": "Fukamon",
    "species": "Fukamon",
    "fileName": "Fukamon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "deepSavers",
    "family": "aquatic",
    "typeKey": "aquatic",
    "type": "Aquático",
    "group": "",
    "traits": [
      "aquatic",
      "calm",
      "cautious",
      "observant",
      "resilient",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Fukamon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Fukamon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "fusamon",
    "name": "Fusamon",
    "species": "Fusamon",
    "fileName": "Fusamon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "virus",
    "field": "unknown",
    "family": "mutant",
    "typeKey": "mutant",
    "type": "Mutante",
    "group": "",
    "traits": [
      "mutant",
      "chaotic",
      "strange",
      "playful",
      "curious",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Fusamon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Fusamon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "jyarimon",
    "name": "Jyarimon",
    "species": "Jyarimon",
    "fileName": "Jyarimon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "dragonsRoar",
    "family": "dragon",
    "typeKey": "dragon",
    "type": "Dragão",
    "group": "",
    "traits": [
      "dragon",
      "courageous",
      "impulsive",
      "energetic",
      "instinctive",
      "resilient"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_jyarimon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Jyarimon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "keemon",
    "name": "Keemon",
    "species": "Keemon",
    "fileName": "Keemon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "virus",
    "field": "nightmareSoldiers",
    "family": "dark",
    "typeKey": "demon",
    "type": "Demônio",
    "group": "",
    "traits": [
      "dark",
      "lonely",
      "chaotic",
      "instinctive",
      "resilient",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Keemon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Keemon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "ketomon",
    "name": "Ketomon",
    "species": "Ketomon",
    "fileName": "Ketomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "natureSpirits",
    "family": "beast",
    "typeKey": "beast",
    "type": "Besta",
    "group": "",
    "traits": [
      "beast",
      "loyal",
      "protective",
      "cautious",
      "resilient",
      "social"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Ketomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Ketomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "kuramon",
    "name": "Kuramon",
    "species": "Kuramon",
    "fileName": "Kuramon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "virus",
    "field": "nightmareSoldiers",
    "family": "dark",
    "typeKey": "demon",
    "type": "Demônio",
    "group": "",
    "traits": [
      "dark",
      "analytical",
      "isolated",
      "strange",
      "observant",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_kuramon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Kuramon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "leafmon",
    "name": "Leafmon",
    "species": "Leafmon",
    "fileName": "Leafmon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "jungleTroopers",
    "family": "insectPlant",
    "typeKey": "plant",
    "type": "Planta",
    "group": "",
    "traits": [
      "plant",
      "gentle",
      "empathetic",
      "protective",
      "calm",
      "emotional"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_leafmon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Leafmon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "mokumon",
    "name": "Mokumon",
    "species": "Mokumon",
    "fileName": "Mokumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "virus",
    "field": "nightmareSoldiers",
    "family": "dark",
    "typeKey": "demon",
    "type": "Demônio",
    "group": "",
    "traits": [
      "flame",
      "melancholic",
      "lonely",
      "dark",
      "emotional",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_mokumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Mokumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "nyokimon",
    "name": "Nyokimon",
    "species": "Nyokimon",
    "fileName": "Nyokimon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "jungleTroopers",
    "family": "insectPlant",
    "typeKey": "plant",
    "type": "Planta",
    "group": "",
    "traits": [
      "plant",
      "shy",
      "calm",
      "observant",
      "hopeful",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_nyokimon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Nyokimon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "pabumon",
    "name": "Pabumon",
    "species": "Pabumon",
    "fileName": "Pabumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "unknown",
    "family": "other",
    "typeKey": "slime",
    "type": "Slime",
    "group": "",
    "traits": [
      "curious",
      "analytical",
      "adaptable",
      "energetic",
      "social",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Pabumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Pabumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "pafumon",
    "name": "Pafumon",
    "species": "Pafumon",
    "fileName": "Pafumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "unknown",
    "family": "other",
    "typeKey": "slime",
    "type": "Slime",
    "group": "",
    "traits": [
      "emotional",
      "observant",
      "empathetic",
      "cautious",
      "hopeful",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_pafumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Pafumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "paomon",
    "name": "Paomon",
    "species": "Paomon",
    "fileName": "Paomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "deepSavers",
    "family": "aquatic",
    "typeKey": "aquatic",
    "type": "Aquático",
    "group": "",
    "traits": [
      "aquatic",
      "calm",
      "emotional",
      "social",
      "hopeful",
      "empathetic"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_paomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Paomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "petitmon",
    "name": "Petitmon",
    "species": "Petitmon",
    "fileName": "Petitmon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "vaccine",
    "field": "virusBusters",
    "family": "holy",
    "typeKey": "angel",
    "type": "Anjo",
    "group": "",
    "traits": [
      "holy",
      "dragon",
      "hopeful",
      "energetic",
      "resilient",
      "social"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_petitmon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Petitmon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "petiMeramon",
    "name": "PetiMeramon",
    "species": "PetiMeramon",
    "fileName": "PetiMeramon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "dragonsRoar",
    "family": "spirit",
    "typeKey": "spirit",
    "type": "Espírito",
    "group": "",
    "traits": [
      "flame",
      "impulsive",
      "energetic",
      "chaotic",
      "external",
      "instinctive"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_PetiMeramon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/PetiMeramon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "pipimon",
    "name": "Pipimon",
    "species": "Pipimon",
    "fileName": "Pipimon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "unknown",
    "family": "other",
    "typeKey": "slime",
    "type": "Slime",
    "group": "",
    "traits": [
      "playful",
      "strange",
      "curious",
      "social",
      "adaptable",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Pipimon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Pipimon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "pitchmon",
    "name": "Pitchmon",
    "species": "Pitchmon",
    "fileName": "Pitchmon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "deepSavers",
    "family": "aquatic",
    "typeKey": "aquatic",
    "type": "Aquático",
    "group": "",
    "traits": [
      "aquatic",
      "social",
      "playful",
      "emotional",
      "hopeful",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_pitchmon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Pitchmon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "popomon",
    "name": "Popomon",
    "species": "Popomon",
    "fileName": "Popomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "jungleTroopers",
    "family": "insectPlant",
    "typeKey": "plant",
    "type": "Planta",
    "group": "",
    "traits": [
      "plant",
      "hopeful",
      "playful",
      "emotional",
      "social",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_popomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Popomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "poyomon",
    "name": "Poyomon",
    "species": "Poyomon",
    "fileName": "Poyomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "vaccine",
    "field": "virusBusters",
    "family": "holy",
    "typeKey": "angel",
    "type": "Anjo",
    "group": "",
    "traits": [
      "holy",
      "aquatic",
      "calm",
      "emotional",
      "hopeful",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_poyomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Poyomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "punimon",
    "name": "Punimon",
    "species": "Punimon",
    "fileName": "Punimon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "natureSpirits",
    "family": "beast",
    "typeKey": "beast",
    "type": "Besta",
    "group": "",
    "traits": [
      "beast",
      "loyal",
      "cautious",
      "protective",
      "resilient",
      "social"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_punimon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Punimon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "pupumon",
    "name": "Pupumon",
    "species": "Pupumon",
    "fileName": "Pupumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "metalEmpire",
    "family": "machine",
    "typeKey": "machine",
    "type": "Máquina",
    "group": "",
    "traits": [
      "machine",
      "curious",
      "analytical",
      "creative",
      "playful",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_pupumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Pupumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "pururumon",
    "name": "Pururumon",
    "species": "Pururumon",
    "fileName": "Pururumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "unknown",
    "family": "other",
    "typeKey": "slime",
    "type": "Slime",
    "group": "",
    "traits": [
      "emotional",
      "gentle",
      "loyal",
      "calm",
      "empathetic",
      "social"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_pururumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Pururumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "pusumon",
    "name": "Pusumon",
    "species": "Pusumon",
    "fileName": "Pusumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "vaccine",
    "field": "virusBusters",
    "family": "holy",
    "typeKey": "angel",
    "type": "Anjo",
    "group": "",
    "traits": [
      "holy",
      "shy",
      "emotional",
      "empathetic",
      "gentle",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Pusumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Pusumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "puwamon",
    "name": "Puwamon",
    "species": "Puwamon",
    "fileName": "Puwamon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "vaccine",
    "field": "windGuardians",
    "family": "bird",
    "typeKey": "bird",
    "type": "Ave",
    "group": "",
    "traits": [
      "bird",
      "calm",
      "hopeful",
      "observant",
      "wind",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_puwamon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Puwamon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "pyonmon",
    "name": "Pyonmon",
    "species": "Pyonmon",
    "fileName": "Pyonmon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "natureSpirits",
    "family": "beast",
    "typeKey": "beast",
    "type": "Besta",
    "group": "",
    "traits": [
      "playful",
      "energetic",
      "beast",
      "social",
      "adaptable",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Pyonmon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Pyonmon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "relemon",
    "name": "Relemon",
    "species": "Relemon",
    "fileName": "Relemon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "natureSpirits",
    "family": "beast",
    "typeKey": "beast",
    "type": "Besta",
    "group": "",
    "traits": [
      "beast",
      "playful",
      "energetic",
      "loyal",
      "social",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_relemon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Relemon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "sakumon",
    "name": "Sakumon",
    "species": "Sakumon",
    "fileName": "Sakumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "metalEmpire",
    "family": "machine",
    "typeKey": "machine",
    "type": "Máquina",
    "group": "",
    "traits": [
      "holy",
      "strange",
      "emotional",
      "observant",
      "internal",
      "spirit"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Sakumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Sakumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "sunamon",
    "name": "Sunamon",
    "species": "Sunamon",
    "fileName": "Sunamon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "unknown",
    "family": "mutant",
    "typeKey": "mutant",
    "type": "Mutante",
    "group": "",
    "traits": [
      "earth",
      "stoic",
      "calm",
      "resilient",
      "protective",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Sunamon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Sunamon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "tokomon",
    "name": "Tokomon",
    "species": "Tokomon",
    "fileName": "Tokomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "vaccine",
    "field": "virusBusters",
    "family": "holy",
    "typeKey": "angel",
    "type": "Anjo",
    "group": "",
    "traits": [
      "holy",
      "loyal",
      "hopeful",
      "protective",
      "resilient",
      "social"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Tokomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Tokomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "tomorimon",
    "name": "Tomorimon",
    "species": "Tomorimon",
    "fileName": "Tomorimon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "virus",
    "field": "metalEmpire",
    "family": "machine",
    "typeKey": "machine",
    "type": "Máquina",
    "group": "",
    "traits": [
      "artificial",
      "curious",
      "observant",
      "adaptable",
      "analytical",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Tomorimon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Tomorimon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "torikaraBallmon",
    "name": "TorikaraBallmon",
    "species": "TorikaraBallmon",
    "fileName": "TorikaraBallmon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "windGuardians",
    "family": "bird",
    "typeKey": "bird",
    "type": "Ave",
    "group": "",
    "traits": [
      "bird",
      "playful",
      "chaotic",
      "energetic",
      "external",
      "social"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_TorikaraBallmon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/TorikaraBallmon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "tsubumon",
    "name": "Tsubumon",
    "species": "Tsubumon",
    "fileName": "Tsubumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "metalEmpire",
    "family": "machine",
    "typeKey": "machine",
    "type": "Máquina",
    "group": "",
    "traits": [
      "machine",
      "analytical",
      "observant",
      "cautious",
      "resilient",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_tsubumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Tsubumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "yokomon",
    "name": "Yokomon",
    "species": "Yokomon",
    "fileName": "Yokomon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "jungleTroopers",
    "family": "insectPlant",
    "typeKey": "plant",
    "type": "Planta",
    "group": "",
    "traits": [
      "plant",
      "hopeful",
      "playful",
      "emotional",
      "social",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_Yokomon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Yokomon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "yukimiBotamon",
    "name": "YukimiBotamon",
    "species": "YukimiBotamon",
    "fileName": "Yukimi Botamon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "unknown",
    "family": "other",
    "typeKey": "slime",
    "type": "Slime",
    "group": "",
    "traits": [
      "ice",
      "calm",
      "shy",
      "emotional",
      "gentle",
      "internal"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_yukimibotamon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Yukimi%20Botamon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "yuramon",
    "name": "Yuramon",
    "species": "Yuramon",
    "fileName": "Yuramon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "jungleTroopers",
    "family": "insectPlant",
    "typeKey": "plant",
    "type": "Planta",
    "group": "",
    "traits": [
      "plant",
      "emotional",
      "hopeful",
      "social",
      "playful",
      "empathetic"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_yuramon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Yuramon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "zerimon",
    "name": "Zerimon",
    "species": "Zerimon",
    "fileName": "Zerimon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "vaccine",
    "field": "virusBusters",
    "family": "holy",
    "typeKey": "angel",
    "type": "Anjo",
    "group": "",
    "traits": [
      "holy",
      "loyal",
      "hopeful",
      "resilient",
      "social",
      "protective"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_zerimon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Zerimon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  },
  {
    "key": "zurumon",
    "name": "Zurumon",
    "species": "Zurumon",
    "fileName": "Zurumon",
    "stage": "baby1",
    "stageValue": 0,
    "size": "small",
    "role": "none",
    "attribute": "data",
    "field": "unknown",
    "family": "slime",
    "typeKey": "slime",
    "type": "Slime",
    "group": "",
    "traits": [
      "slime",
      "chaotic",
      "adaptable",
      "strange",
      "playful",
      "external"
    ],
    "digitamaImg": "systems/digimon-digital-adventures/assets/digitamas/Digitama_zurumon.webp",
    "actorImg": "systems/digimon-digital-adventures/assets/digimon/baby1/Zurumon.webp",
    "evolvesTo": [],
    "devolvesTo": [],
    "notes": "Classificação inicial derivada dos traits do questionário; revisar quando a linha evolutiva oficial/homebrew for definida."
  }
];

export function getBaby1DigimonEntry(keyOrName) {
  const query = String(keyOrName ?? "").trim().toLowerCase();

  return DDA_BABY1_DIGIMON_DATABASE.find((entry) => {
    return (
      entry.key.toLowerCase() === query ||
      entry.name.toLowerCase() === query ||
      entry.species.toLowerCase() === query
    );
  }) ?? null;
}

function buildMainStat(label, base = DDA_BABY1_STAGE_PROFILE.mainStatBase) {
  const value = Number(base ?? 0);

  return {
    label,
    base: value,
    bonus: 0,
    qualityBonus: 0,
    total: value,
    value,
    creation: {
      startingBase: value,
      spent: 0
    }
  };
}

function buildDerivedStat(label, value = 1) {
  const total = Number(value ?? 0);

  return {
    label,
    base: total,
    bonus: 0,
    qualityBonus: 0,
    total,
    value: total
  };
}

function buildMovementTypes(baseMovement = DDA_BABY1_STAGE_PROFILE.movement) {
  const movement = Number(baseMovement ?? 0);

  return {
    land: {
      label: "DDA.Movement.Land",
      value: movement,
      base: movement,
      bonus: 0,
      qualityBonus: 0,
      effectBonus: 0,
      total: movement,
      enabled: true
    },
    jump: {
      label: "DDA.Movement.Jump",
      value: 0,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      effectBonus: 0,
      total: 0,
      enabled: false
    },
    swim: {
      label: "DDA.Movement.Swim",
      value: 0,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      effectBonus: 0,
      total: 0,
      enabled: false
    },
    fly: {
      label: "DDA.Movement.Fly",
      value: 0,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      effectBonus: 0,
      total: 0,
      enabled: false
    },
    dig: {
      label: "DDA.Movement.Dig",
      value: 0,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      effectBonus: 0,
      total: 0,
      enabled: false
    },
    climb: {
      label: "DDA.Movement.Climb",
      value: 0,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      effectBonus: 0,
      total: 0,
      enabled: false
    },
    teleport: {
      label: "DDA.Movement.Teleport",
      value: 0,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      effectBonus: 0,
      total: 0,
      enabled: false
    }
  };
}

export function buildBaby1DigimonActorData(keyOrName, overrides = {}) {
  const entry = getBaby1DigimonEntry(keyOrName);

  if (!entry) {
    throw new Error(`DDA | Bebê I não encontrado na database: ${keyOrName}`);
  }

  const mainStatBase = Number(overrides.mainStatBase ?? DDA_BABY1_STAGE_PROFILE.mainStatBase);
  const movement = Number(overrides.movement ?? DDA_BABY1_STAGE_PROFILE.movement);
  const bit = 1;
  const dos = 1;
  const ram = 1;
  const cpu = 1;
  const woundBoxes = Number(overrides.woundBoxes ?? 2);
  const actorImg = overrides.img ?? entry.actorImg ?? entry.digitamaImg;

  return {
    name: overrides.name ?? entry.name,
    type: "digimon",
    img: actorImg,
    items: [],

    system: {
      species: overrides.species ?? entry.species,
      nickname: overrides.nickname ?? "",
      stage: "baby1",
      stageValue: 0,
      size: overrides.size ?? entry.size ?? "small",
      role: overrides.role ?? entry.role ?? "none",
      field: overrides.field ?? entry.field ?? "none",
      family: overrides.family ?? entry.family ?? "none",
      attribute: overrides.attribute ?? entry.attribute ?? "data",
      type: overrides.type ?? entry.type ?? "",
      group: overrides.group ?? entry.group ?? "",

      profile: {
        appearance: "",
        personality: "",
        favoriteFood: "",
        goals: "",
        tactics: "",
        age: "",
        selfImage: "",
        separatedReaction: "",
        ...(overrides.profile ?? {})
      },

      tamer: {
        id: "",
        uuid: "",
        name: ""
      },

      creation: {
        dp: {
          base: 0,
          bonus: 0,
          negative: 0,
          total: 0,
          spentBaseStats: 0,
          spentBaseQualities: 0,
          spentBonusStats: 0,
          spentBonusQualities: 0,
          spentTotal: 0,
          remaining: 0
        },
        coreDiscount: {
          base: 0,
          spent: 0,
          remaining: 0
        },
        buildStyle: "database"
      },

      qualityLimits: {
        freeQualities: {
          max: 0,
          used: 0
        },
        negativeDp: {
          max: 0,
          used: 0
        }
      },

      mainStats: {
        accuracy: buildMainStat("DDA.MainStat.Accuracy", mainStatBase),
        damage: buildMainStat("DDA.MainStat.Damage", mainStatBase),
        dodge: buildMainStat("DDA.MainStat.Dodge", mainStatBase),
        armor: buildMainStat("DDA.MainStat.Armor", mainStatBase),
        health: buildMainStat("DDA.MainStat.Health", mainStatBase)
      },

      derivedStats: {
        bit: buildDerivedStat("DDA.DerivedStat.BIT", bit),
        dos: buildDerivedStat("DDA.DerivedStat.DOS", dos),
        ram: buildDerivedStat("DDA.DerivedStat.RAM", ram),
        cpu: buildDerivedStat("DDA.DerivedStat.CPU", cpu)
      },

      miscStats: {
        movement: {
          label: "DDA.Resource.Movement",
          base: movement,
          bonus: 0,
          qualityBonus: 0,
          effectBonus: 0,
          value: movement,
          total: movement
        },
        wounds: {
          label: "DDA.Resource.WoundBoxes",
          value: woundBoxes,
          max: woundBoxes,
          temp: {
            value: 0,
            source: "",
            duration: ""
          }
        },
        range: {
          label: "DDA.Resource.Range",
          value: 3
        },
        effectiveLimit: {
          label: "DDA.Resource.EffectiveLimit",
          value: 3
        },
        initiative: {
          label: "DDA.Resource.Initiative",
          value: 1
        },
        resistance: {
          label: "DDA.Resource.Resistance",
          value: 0
        },
        clash: {
          label: "DDA.Resource.Clash",
          value: 2
        }
      },

      resources: {
        battery: {
          value: 0,
          max: 3
        },
        resolve: {
          enabled: false,
          value: 0,
          max: 4
        },
        creationLimit: {
          enabled: false,
          value: 0,
          max: 0
        },
        mood: {
          enabled: false,
          value: 3,
          die: "1d6"
        }
      },

      currentMovementType: "land",
      movementTypes: buildMovementTypes(movement),

      signatureMove: {
        attackId: "",
        batteryCost: 1,
        notes: ""
      },

      combat: {
        digitama: false
      },

      stances: {
        current: "neutral",
        available: ["neutral", "offensive", "defensive"]
      },

      evolutionLine: {
        lineId: overrides.lineId ?? entry.key,
        baseFormUuid: "",
        previousForms: [],
        nextForms: [],
        defaultStage: true,
        isCurrentForm: false
      },

      evolution: {
        defaultStage: "baby1",
        currentStage: "baby1",
        unlockedStages: ["baby1"],
        forms: []
      },

      evolutionGraph: {
        layout: {
          mode: "solar"
        },
        nodes: [],
        edges: []
      },

      compatibility: {
        enabled: false,
        wantsQuestionnaire: false,
        answered: false,
        skipped: false,
        hidden: true,
        answers: {},
        answerList: [],
        crestScores: {},
        traitScores: {},
        hiddenCrest: null,
        digitama: {
          key: entry.key,
          name: entry.name,
          fileName: entry.fileName,
          img: entry.digitamaImg,
          traits: entry.traits,
          score: 0
        },
        recommendations: [],
        assignedAt: ""
      },

      database: {
        source: "DDA_BABY1_DIGIMON_DATABASE",
        key: entry.key,
        traits: entry.traits,
        digitamaImg: entry.digitamaImg,
        evolvesTo: entry.evolvesTo,
        devolvesTo: entry.devolvesTo,
        notes: entry.notes
      }
    }
  };
}

export function buildAllBaby1DigimonActorData(overridesByKey = {}) {
  return DDA_BABY1_DIGIMON_DATABASE.map((entry) => {
    return buildBaby1DigimonActorData(entry.key, overridesByKey[entry.key] ?? {});
  });
}
