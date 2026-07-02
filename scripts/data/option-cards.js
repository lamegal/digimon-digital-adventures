export const DDA_OPTION_CARDS = [
  { id: "attack", name: "Attack Card", stat: "damage", valueMode: "stagePlusOne", duration: 1 },
  { id: "sureHit", name: "Sure-Hit Card", stat: "accuracy", valueMode: "stagePlusOne", duration: 1 },
  { id: "reaction", name: "Reaction Card", stat: "dodge", valueMode: "stagePlusOne", duration: 1, interrupt: true },
  { id: "defense", name: "Defense Card", stat: "armor", valueMode: "stagePlusOne", duration: 1, interrupt: true },
  { id: "healing", name: "Healing Card", stat: "heal", valueMode: "stagePlusTwo", duration: 0 },
  { id: "movement", name: "Movement Card", stat: "movement", valueMode: "custom", duration: 1 }
];

globalThis.DDA_OPTION_CARDS = DDA_OPTION_CARDS;
