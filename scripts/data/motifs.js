export const DDA_MOTIFS = [
  { id: "heartAblaze", name: "Heart Ablaze", requirement: "Body + Agility", useType: "simple", frequency: "oncePerDay", effect: "Temporary Wound Boxes and empowered attacks while the Tamer burns with passion." },
  { id: "kickItUp", name: "Kick it Up", requirement: "Body + Willpower", useType: "simple", frequency: "oncePerDay", effect: "Reroll a successful attack against a higher TN to expand it into a burst." },
  { id: "digimonParade", name: "Digimon Parade", requirement: "Agility + Charisma", useType: "complex", frequency: "oncePerDay", effect: "All ally Digimon gain +3 Accuracy and Dodge until combat ends." },
  { id: "dive", name: "DiVE", requirement: "Agility + Intelligence", useType: "complex", frequency: "oncePerDay", effect: "Trap targets in a pocket dimension until the start of your next turn." },
  { id: "hopester", name: "HOPESTER", requirement: "Charisma + Intelligence", useType: "special", frequency: "oncePerDay", effect: "All ally Tamers may immediately attempt Evolution as a free action when initiative is rolled." },
  { id: "neverGiveUp", name: "Never Give Up!", requirement: "Charisma + Willpower", useType: "intercede", frequency: "oncePerDay", effect: "Intercede when your Digimon would fall below 1 Wound Box." },
  { id: "codeBreaker", name: "Code Breaker", requirement: "Intelligence + Willpower", useType: "complex", frequency: "oncePerDay", effect: "Convert Inspiration into Battery or delete Battery from an enemy." }
];

globalThis.DDA_MOTIFS = DDA_MOTIFS;
