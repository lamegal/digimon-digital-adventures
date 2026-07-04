export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });

  Handlebars.registerHelper("or", function (...args) {
    args.pop();
    return args.some(Boolean);
  });

  Handlebars.registerHelper("and", function (...args) {
    args.pop();
    return args.every(Boolean);
  });

  Handlebars.registerHelper("lookupConfig", function (config, key) {
    return config?.[key] ?? key;
  });

  Handlebars.registerHelper("ddaTamerAttributeLabel", function (key) {
    const labels = {
      agility: "DDA.TamerAttribute.Agility",
      body: "DDA.TamerAttribute.Body",
      charisma: "DDA.TamerAttribute.Charisma",
      intelligence: "DDA.TamerAttribute.Intelligence",
      willpower: "DDA.TamerAttribute.Willpower"
    };

    return game.i18n.localize(labels[key] ?? key);
  });

  Handlebars.registerHelper("ddaAttackRangeLabel", function (key) {
    const labels = {
      melee: "DDA.Attack.Range.Melee",
      range: "DDA.Attack.Range.Ranged",
      ranged: "DDA.Attack.Range.Ranged"
    };

    return game.i18n.localize(labels[key] ?? key);
  });

  Handlebars.registerHelper("ddaAttackFunctionLabel", function (key) {
    const labels = {
      damage: "DDA.Attack.Function.Damage",
      support: "DDA.Attack.Function.Support"
    };

    return game.i18n.localize(labels[key] ?? key);
  });

  Handlebars.registerHelper("ddaTamerAttributeShortLabel", function (attribute) {
    const labels = {
      agility: "DDA.TamerAttributeShort.Agility",
      body: "DDA.TamerAttributeShort.Body",
      charisma: "DDA.TamerAttributeShort.Charisma",
      intelligence: "DDA.TamerAttributeShort.Intelligence",
      willpower: "DDA.TamerAttributeShort.Willpower"
    };

    return game.i18n.localize(labels[attribute] ?? attribute);
  });
}