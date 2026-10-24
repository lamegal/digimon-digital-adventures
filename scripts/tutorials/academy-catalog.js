// UI targets follow the shipped DDA v2.0.27-beta implementation.
export const ACADEMY_CHAPTERS = [
  {
    "id": "welcome",
    "titleKey": "DDA.Academy.Chapter.welcome.Title",
    "descriptionKey": "DDA.Academy.Chapter.welcome.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "hello",
        "titleKey": "DDA.Academy.Step.welcome.hello.Title",
        "textKey": "DDA.Academy.Step.welcome.hello.Text",
        "mood": "happy",
        "reference": "Player's Companion §1.0"
      },
      {
        "id": "directory",
        "titleKey": "DDA.Academy.Step.welcome.directory.Title",
        "textKey": "DDA.Academy.Step.welcome.directory.Text",
        "mood": "explaining",
        "surface": "actors",
        "selector": ".directory-list"
      },
      {
        "id": "device",
        "titleKey": "DDA.Academy.Step.welcome.device.Title",
        "textKey": "DDA.Academy.Step.welcome.device.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "summary",
        "selector": ".dda-window-side-device"
      },
      {
        "id": "how",
        "titleKey": "DDA.Academy.Step.welcome.how.Title",
        "textKey": "DDA.Academy.Step.welcome.how.Text",
        "mood": "encouraging"
      }
    ]
  },
  {
    "id": "tamer",
    "titleKey": "DDA.Academy.Chapter.tamer.Title",
    "descriptionKey": "DDA.Academy.Chapter.tamer.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "start",
        "titleKey": "DDA.Academy.Step.tamer.start.Title",
        "textKey": "DDA.Academy.Step.tamer.start.Text",
        "mood": "explaining",
        "surface": "tamerWizard",
        "wizardStep": "welcome",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §2.0–2.01"
      },
      {
        "id": "identity",
        "titleKey": "DDA.Academy.Step.tamer.identity.Title",
        "textKey": "DDA.Academy.Step.tamer.identity.Text",
        "mood": "explaining",
        "surface": "tamerWizard",
        "wizardStep": "identity",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §2.01"
      },
      {
        "id": "aspects",
        "titleKey": "DDA.Academy.Step.tamer.aspects.Title",
        "textKey": "DDA.Academy.Step.tamer.aspects.Text",
        "mood": "thinking",
        "surface": "tamerWizard",
        "wizardStep": "aspects",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §2.02; 8.01b"
      },
      {
        "id": "attributes",
        "titleKey": "DDA.Academy.Step.tamer.attributes.Title",
        "textKey": "DDA.Academy.Step.tamer.attributes.Text",
        "mood": "explaining",
        "surface": "tamerWizard",
        "wizardStep": "attributes",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §2.03; 2.07"
      },
      {
        "id": "skills",
        "titleKey": "DDA.Academy.Step.tamer.skills.Title",
        "textKey": "DDA.Academy.Step.tamer.skills.Text",
        "mood": "explaining",
        "surface": "tamerWizard",
        "wizardStep": "skills",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §2.03a; 2.07"
      },
      {
        "id": "inspiration",
        "titleKey": "DDA.Academy.Step.tamer.inspiration.Title",
        "textKey": "DDA.Academy.Step.tamer.inspiration.Text",
        "mood": "explaining",
        "surface": "tamerWizard",
        "wizardStep": "inspiration",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §2.05–2.05b"
      },
      {
        "id": "torments",
        "titleKey": "DDA.Academy.Step.tamer.torments.Title",
        "textKey": "DDA.Academy.Step.tamer.torments.Text",
        "mood": "serious",
        "surface": "tamerWizard",
        "wizardStep": "torments",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §2.06; 8.02"
      },
      {
        "id": "summary",
        "titleKey": "DDA.Academy.Step.tamer.summary.Title",
        "textKey": "DDA.Academy.Step.tamer.summary.Text",
        "mood": "happy",
        "surface": "tamerWizard",
        "wizardStep": "summary",
        "selector": ".dda-wizard-chain-option, .dda-wizard-footer",
        "reference": "Player's Companion §2.10"
      }
    ]
  },
  {
    "id": "digimon",
    "titleKey": "DDA.Academy.Chapter.digimon.Title",
    "descriptionKey": "DDA.Academy.Chapter.digimon.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "start",
        "titleKey": "DDA.Academy.Step.digimon.start.Title",
        "textKey": "DDA.Academy.Step.digimon.start.Text",
        "mood": "happy",
        "surface": "digimonWizard",
        "wizardStep": "welcome",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §3.0"
      },
      {
        "id": "origin",
        "titleKey": "DDA.Academy.Step.digimon.origin.Title",
        "textKey": "DDA.Academy.Step.digimon.origin.Text",
        "mood": "explaining",
        "surface": "digimonWizard",
        "wizardStep": "origin",
        "selector": ".dda-wizard-body"
      },
      {
        "id": "stage",
        "titleKey": "DDA.Academy.Step.digimon.stage.Title",
        "textKey": "DDA.Academy.Step.digimon.stage.Text",
        "mood": "explaining",
        "surface": "digimonWizard",
        "wizardStep": "stage",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §3.0"
      },
      {
        "id": "identity",
        "titleKey": "DDA.Academy.Step.digimon.identity.Title",
        "textKey": "DDA.Academy.Step.digimon.identity.Text",
        "mood": "explaining",
        "surface": "digimonWizard",
        "wizardStep": "identity",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §3.06"
      },
      {
        "id": "line",
        "titleKey": "DDA.Academy.Step.digimon.line.Title",
        "textKey": "DDA.Academy.Step.digimon.line.Text",
        "mood": "explaining",
        "surface": "digimonWizard",
        "wizardStep": "evolutionLine",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §3.0"
      },
      {
        "id": "stats",
        "titleKey": "DDA.Academy.Step.digimon.stats.Title",
        "textKey": "DDA.Academy.Step.digimon.stats.Text",
        "mood": "explaining",
        "surface": "digimonWizard",
        "wizardStep": "stats",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §3.01–3.02"
      },
      {
        "id": "qualities",
        "titleKey": "DDA.Academy.Step.digimon.qualities.Title",
        "textKey": "DDA.Academy.Step.digimon.qualities.Text",
        "mood": "thinking",
        "surface": "digimonWizard",
        "wizardStep": "qualities",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §4.0; 4.08"
      },
      {
        "id": "attacks",
        "titleKey": "DDA.Academy.Step.digimon.attacks.Title",
        "textKey": "DDA.Academy.Step.digimon.attacks.Text",
        "mood": "explaining",
        "surface": "digimonWizard",
        "wizardStep": "qualities",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §3.03; 4.08"
      },
      {
        "id": "personality",
        "titleKey": "DDA.Academy.Step.digimon.personality.Title",
        "textKey": "DDA.Academy.Step.digimon.personality.Text",
        "mood": "encouraging",
        "surface": "digimonWizard",
        "wizardStep": "partnerQuestions",
        "selector": ".dda-wizard-body",
        "reference": "Player's Companion §3.06"
      },
      {
        "id": "summary",
        "titleKey": "DDA.Academy.Step.digimon.summary.Title",
        "textKey": "DDA.Academy.Step.digimon.summary.Text",
        "mood": "happy",
        "surface": "digimonWizard",
        "wizardStep": "summary",
        "selector": ".dda-wizard-footer"
      }
    ]
  },
  {
    "id": "sheets",
    "titleKey": "DDA.Academy.Chapter.sheets.Title",
    "descriptionKey": "DDA.Academy.Chapter.sheets.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "tamer",
        "titleKey": "DDA.Academy.Step.sheets.tamer.Title",
        "textKey": "DDA.Academy.Step.sheets.tamer.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "stats",
        "selector": "section[data-tab=\"stats\"]",
        "reference": "Player's Companion §2.03; 8.01a"
      },
      {
        "id": "aspects",
        "titleKey": "DDA.Academy.Step.sheets.aspects.Title",
        "textKey": "DDA.Academy.Step.sheets.aspects.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "aspects",
        "selector": "section[data-tab=\"aspects\"]",
        "reference": "Player's Companion §8.01b"
      },
      {
        "id": "tamer-combat",
        "titleKey": "DDA.Academy.Step.sheets.tamer-combat.Title",
        "textKey": "DDA.Academy.Step.sheets.tamer-combat.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "reference": "Player's Companion §9.04; 9.06"
      },
      {
        "id": "torments",
        "titleKey": "DDA.Academy.Step.sheets.torments.Title",
        "textKey": "DDA.Academy.Step.sheets.torments.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "torments",
        "selector": "section[data-tab=\"torments\"]",
        "reference": "Player's Companion §2.06; 2.09"
      },
      {
        "id": "digimon-stats",
        "titleKey": "DDA.Academy.Step.sheets.digimon-stats.Title",
        "textKey": "DDA.Academy.Step.sheets.digimon-stats.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "stats",
        "selector": "section[data-tab=\"stats\"]",
        "reference": "Player's Companion §3.02; 8.01"
      },
      {
        "id": "digimon-combat",
        "titleKey": "DDA.Academy.Step.sheets.digimon-combat.Title",
        "textKey": "DDA.Academy.Step.sheets.digimon-combat.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "reference": "Player's Companion §3.03–3.04; 9.02"
      },
      {
        "id": "qualities",
        "titleKey": "DDA.Academy.Step.sheets.qualities.Title",
        "textKey": "DDA.Academy.Step.sheets.qualities.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "qualities",
        "selector": ".open-quality-browser",
        "reference": "Player's Companion §4.0"
      }
    ]
  },
  {
    "id": "rolls",
    "titleKey": "DDA.Academy.Chapter.rolls.Title",
    "descriptionKey": "DDA.Academy.Chapter.rolls.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "checks",
        "titleKey": "DDA.Academy.Step.rolls.checks.Title",
        "textKey": "DDA.Academy.Step.rolls.checks.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "stats",
        "selector": "section[data-tab=\"stats\"]",
        "reference": "Player's Companion §8.01a",
        "practice": "check",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Check"
      },
      {
        "id": "pools",
        "titleKey": "DDA.Academy.Step.rolls.pools.Title",
        "textKey": "DDA.Academy.Step.rolls.pools.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "stats",
        "selector": "section[data-tab=\"stats\"]",
        "reference": "Player's Companion §8.01c"
      },
      {
        "id": "specs",
        "titleKey": "DDA.Academy.Step.rolls.specs.Title",
        "textKey": "DDA.Academy.Step.rolls.specs.Text",
        "mood": "explaining",
        "surface": "radial",
        "tokenKind": "digimon",
        "selector": ".dda-radial-token-hud",
        "reference": "Player's Companion §9.06a"
      },
      {
        "id": "inspiration",
        "titleKey": "DDA.Academy.Step.rolls.inspiration.Title",
        "textKey": "DDA.Academy.Step.rolls.inspiration.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "stats",
        "selector": ".pi-block",
        "reference": "Player's Companion §2.05a"
      }
    ]
  },
  {
    "id": "radial",
    "titleKey": "DDA.Academy.Chapter.radial.Title",
    "descriptionKey": "DDA.Academy.Chapter.radial.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "open",
        "titleKey": "DDA.Academy.Step.radial.open.Title",
        "textKey": "DDA.Academy.Step.radial.open.Text",
        "mood": "explaining",
        "surface": "radial",
        "selector": ".dda-radial-token-hud"
      },
      {
        "id": "actions",
        "titleKey": "DDA.Academy.Step.radial.actions.Title",
        "textKey": "DDA.Academy.Step.radial.actions.Text",
        "mood": "explaining",
        "surface": "radial",
        "selector": ".dda-radial-token-hud"
      },
      {
        "id": "targets",
        "titleKey": "DDA.Academy.Step.radial.targets.Title",
        "textKey": "DDA.Academy.Step.radial.targets.Text",
        "mood": "explaining",
        "surface": "radial",
        "selector": ".dda-radial-token-hud",
        "reference": "Player's Companion §9.02–9.03"
      },
      {
        "id": "move",
        "titleKey": "DDA.Academy.Step.radial.move.Title",
        "textKey": "DDA.Academy.Step.radial.move.Text",
        "mood": "explaining",
        "surface": "radial",
        "selector": ".dda-radial-token-hud",
        "reference": "Player's Companion §3.02c; 9.06a; 9.09g"
      },
      {
        "id": "support",
        "titleKey": "DDA.Academy.Step.radial.support.Title",
        "textKey": "DDA.Academy.Step.radial.support.Text",
        "mood": "explaining",
        "surface": "radial",
        "tokenKind": "tamer",
        "selector": ".dda-radial-token-hud",
        "reference": "Player's Companion §9.06a",
        "practice": "direct",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Direct"
      },
      {
        "id": "finish",
        "titleKey": "DDA.Academy.Step.radial.finish.Title",
        "textKey": "DDA.Academy.Step.radial.finish.Text",
        "mood": "encouraging",
        "surface": "radial",
        "selector": ".dda-radial-token-hud",
        "reference": "Player's Companion §9.01"
      }
    ]
  },
  {
    "id": "links",
    "titleKey": "DDA.Academy.Chapter.links.Title",
    "descriptionKey": "DDA.Academy.Chapter.links.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "pair",
        "titleKey": "DDA.Academy.Step.links.pair.Title",
        "textKey": "DDA.Academy.Step.links.pair.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "advancement",
        "selector": ".partner-drop-zone",
        "practice": "pair",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Pair"
      },
      {
        "id": "verify",
        "titleKey": "DDA.Academy.Step.links.verify.Title",
        "textKey": "DDA.Academy.Step.links.verify.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "advancement",
        "selector": ".dda-partner-info-grid"
      },
      {
        "id": "forms",
        "titleKey": "DDA.Academy.Step.links.forms.Title",
        "textKey": "DDA.Academy.Step.links.forms.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "evolution",
        "selector": "[data-evolution-drop-target]"
      },
      {
        "id": "edge",
        "titleKey": "DDA.Academy.Step.links.edge.Title",
        "textKey": "DDA.Academy.Step.links.edge.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "evolution",
        "selector": ".dda-evolution-link-panel",
        "practice": "graph",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Graph"
      },
      {
        "id": "options",
        "titleKey": "DDA.Academy.Step.links.options.Title",
        "textKey": "DDA.Academy.Step.links.options.Text",
        "mood": "thinking",
        "surface": "digimonSheet",
        "tab": "evolution",
        "selector": ".dda-evolution-graph-header"
      }
    ]
  },
  {
    "id": "planning",
    "titleKey": "DDA.Academy.Chapter.planning.Title",
    "descriptionKey": "DDA.Academy.Chapter.planning.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "open",
        "titleKey": "DDA.Academy.Step.planning.open.Title",
        "textKey": "DDA.Academy.Step.planning.open.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "evolution",
        "selector": ".open-partner-form-planner",
        "reference": "Player's Companion §8.05"
      },
      {
        "id": "cards",
        "titleKey": "DDA.Academy.Step.planning.cards.Title",
        "textKey": "DDA.Academy.Step.planning.cards.Text",
        "mood": "explaining",
        "surface": "planner",
        "selector": ".dda-partner-form-planner__forms"
      },
      {
        "id": "adjust",
        "titleKey": "DDA.Academy.Step.planning.adjust.Title",
        "textKey": "DDA.Academy.Step.planning.adjust.Text",
        "mood": "explaining",
        "surface": "planner",
        "selector": ".dda-form-build-summary-card",
        "reference": "Player's Companion §8.05",
        "practice": "form",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Form"
      },
      {
        "id": "bonus",
        "titleKey": "DDA.Academy.Step.planning.bonus.Title",
        "textKey": "DDA.Academy.Step.planning.bonus.Text",
        "mood": "explaining",
        "surface": "planner",
        "selector": ".dda-form-build-summary-budget",
        "reference": "Game Master's Index §1.02"
      },
      {
        "id": "release",
        "titleKey": "DDA.Academy.Step.planning.release.Title",
        "textKey": "DDA.Academy.Step.planning.release.Text",
        "mood": "encouraging",
        "surface": "planner",
        "selector": ".dda-partner-form-planner__header",
        "reference": "Player's Companion §8.05"
      }
    ]
  },
  {
    "id": "evolution",
    "titleKey": "DDA.Academy.Chapter.evolution.Title",
    "descriptionKey": "DDA.Academy.Chapter.evolution.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "ready",
        "titleKey": "DDA.Academy.Step.evolution.ready.Title",
        "textKey": "DDA.Academy.Step.evolution.ready.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "evolution",
        "selector": ".dda-evolution-toolbar",
        "reference": "Player's Companion §8.05"
      },
      {
        "id": "choose",
        "titleKey": "DDA.Academy.Step.evolution.choose.Title",
        "textKey": "DDA.Academy.Step.evolution.choose.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "advancement",
        "selector": ".evolution-options-partner",
        "reference": "Player's Companion §8.05a–8.05c",
        "practice": "evolution",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Evolution"
      },
      {
        "id": "snapshots",
        "titleKey": "DDA.Academy.Step.evolution.snapshots.Title",
        "textKey": "DDA.Academy.Step.evolution.snapshots.Text",
        "mood": "explaining",
        "surface": "planner",
        "selector": ".dda-partner-form-planner__forms"
      },
      {
        "id": "regress",
        "titleKey": "DDA.Academy.Step.evolution.regress.Title",
        "textKey": "DDA.Academy.Step.evolution.regress.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "advancement",
        "selector": ".evolution-options-partner",
        "reference": "Player's Companion §8.05b–8.05c",
        "practice": "evolution",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Evolution"
      },
      {
        "id": "token",
        "titleKey": "DDA.Academy.Step.evolution.token.Title",
        "textKey": "DDA.Academy.Step.evolution.token.Text",
        "mood": "happy",
        "surface": "prototype",
        "tab": "ddaForms",
        "selector": ".dda-token-sizes__body"
      }
    ]
  },
  {
    "id": "combat",
    "titleKey": "DDA.Academy.Chapter.combat.Title",
    "descriptionKey": "DDA.Academy.Chapter.combat.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "initiative",
        "titleKey": "DDA.Academy.Step.combat.initiative.Title",
        "textKey": "DDA.Academy.Step.combat.initiative.Text",
        "mood": "explaining",
        "surface": "combat",
        "selector": ".combat-tracker",
        "reference": "Player's Companion §9.01"
      },
      {
        "id": "actions",
        "titleKey": "DDA.Academy.Step.combat.actions.Title",
        "textKey": "DDA.Academy.Step.combat.actions.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "reference": "Player's Companion §9.01–9.02"
      },
      {
        "id": "attack",
        "titleKey": "DDA.Academy.Step.combat.attack.Title",
        "textKey": "DDA.Academy.Step.combat.attack.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "reference": "Player's Companion §9.02a",
        "practice": "attack",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Attack"
      },
      {
        "id": "damage",
        "titleKey": "DDA.Academy.Step.combat.damage.Title",
        "textKey": "DDA.Academy.Step.combat.damage.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "reference": "Player's Companion §9.02c–9.02d"
      },
      {
        "id": "support",
        "titleKey": "DDA.Academy.Step.combat.support.Title",
        "textKey": "DDA.Academy.Step.combat.support.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "reference": "Player's Companion §4.08; 9.02b"
      },
      {
        "id": "areas",
        "titleKey": "DDA.Academy.Step.combat.areas.Title",
        "textKey": "DDA.Academy.Step.combat.areas.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "reference": "Player's Companion §4.02; 9.02",
        "practice": "area",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Area"
      },
      {
        "id": "effects",
        "titleKey": "DDA.Academy.Step.combat.effects.Title",
        "textKey": "DDA.Academy.Step.combat.effects.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "reference": "Player's Companion §4.08"
      },
      {
        "id": "end",
        "titleKey": "DDA.Academy.Step.combat.end.Title",
        "textKey": "DDA.Academy.Step.combat.end.Text",
        "mood": "encouraging",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "[data-action=\"endTurn\"]",
        "reference": "Player's Companion §9.01"
      }
    ]
  },
  {
    "id": "practice",
    "titleKey": "DDA.Academy.Chapter.practice.Title",
    "descriptionKey": "DDA.Academy.Chapter.practice.Description",
    "gmOnly": false,
    "steps": [
      {
        "id": "intro",
        "titleKey": "DDA.Academy.Step.practice.intro.Title",
        "textKey": "DDA.Academy.Step.practice.intro.Text",
        "mood": "serious"
      },
      {
        "id": "check",
        "titleKey": "DDA.Academy.Step.practice.check.Title",
        "textKey": "DDA.Academy.Step.practice.check.Text",
        "mood": "explaining",
        "surface": "tamerSheet",
        "tab": "stats",
        "selector": "section[data-tab=\"stats\"]",
        "practice": "check",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Check",
        "reference": "Player's Companion §8.01a"
      },
      {
        "id": "direct",
        "titleKey": "DDA.Academy.Step.practice.direct.Title",
        "textKey": "DDA.Academy.Step.practice.direct.Text",
        "mood": "explaining",
        "surface": "radial",
        "tokenKind": "tamer",
        "selector": ".dda-radial-token-hud",
        "practice": "direct",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Direct",
        "reference": "Player's Companion §9.06a"
      },
      {
        "id": "attack",
        "titleKey": "DDA.Academy.Step.practice.attack.Title",
        "textKey": "DDA.Academy.Step.practice.attack.Text",
        "mood": "determined",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "practice": "attack",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Attack",
        "reference": "Player's Companion §9.02a"
      },
      {
        "id": "area",
        "titleKey": "DDA.Academy.Step.practice.area.Title",
        "textKey": "DDA.Academy.Step.practice.area.Text",
        "mood": "explaining",
        "surface": "digimonSheet",
        "tab": "combat",
        "selector": "section[data-tab=\"combat\"]",
        "practice": "area",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Area",
        "reference": "Player's Companion §9.02c"
      },
      {
        "id": "finish",
        "titleKey": "DDA.Academy.Step.practice.finish.Title",
        "textKey": "DDA.Academy.Step.practice.finish.Text",
        "mood": "happy"
      }
    ]
  },
  {
    "id": "gm",
    "titleKey": "DDA.Academy.Chapter.gm.Title",
    "descriptionKey": "DDA.Academy.Chapter.gm.Description",
    "gmOnly": true,
    "steps": [
      {
        "id": "start",
        "titleKey": "DDA.Academy.Step.gm.start.Title",
        "textKey": "DDA.Academy.Step.gm.start.Text",
        "mood": "happy",
        "surface": "actors",
        "selector": ".directory-list",
        "reference": "Game Master's Index §1.01"
      },
      {
        "id": "session",
        "titleKey": "DDA.Academy.Step.gm.session.Title",
        "textKey": "DDA.Academy.Step.gm.session.Text",
        "mood": "explaining",
        "surface": "gmTools",
        "selector": "[data-section=\"session\"]"
      },
      {
        "id": "overrides",
        "titleKey": "DDA.Academy.Step.gm.overrides.Title",
        "textKey": "DDA.Academy.Step.gm.overrides.Text",
        "mood": "explaining",
        "surface": "gmTools",
        "selector": "[data-section=\"overrides\"]"
      },
      {
        "id": "progress",
        "titleKey": "DDA.Academy.Step.gm.progress.Title",
        "textKey": "DDA.Academy.Step.gm.progress.Text",
        "mood": "explaining",
        "surface": "progress",
        "selector": ".dda-gm-progress-tools",
        "reference": "Game Master's Index §1.02"
      },
      {
        "id": "stages",
        "titleKey": "DDA.Academy.Step.gm.stages.Title",
        "textKey": "DDA.Academy.Step.gm.stages.Text",
        "mood": "explaining",
        "surface": "progress",
        "selector": ".dda-gm-campaign-progress",
        "reference": "Player's Companion §8.05; 8.05b–8.05c"
      },
      {
        "id": "rules",
        "titleKey": "DDA.Academy.Step.gm.rules.Title",
        "textKey": "DDA.Academy.Step.gm.rules.Text",
        "mood": "serious",
        "surface": "combat",
        "selector": ".combat-tracker",
        "reference": "Player's Companion §4.08; 9.01–9.02"
      }
    ]
  },
  {
    "id": "npcs",
    "titleKey": "DDA.Academy.Chapter.npcs.Title",
    "descriptionKey": "DDA.Academy.Chapter.npcs.Description",
    "gmOnly": true,
    "steps": [
      {
        "id": "builder",
        "titleKey": "DDA.Academy.Step.npcs.builder.Title",
        "textKey": "DDA.Academy.Step.npcs.builder.Text",
        "mood": "explaining",
        "surface": "npc",
        "selector": ".dda-enemy-wizard-filter-panel",
        "reference": "Game Master's Index §1.03; 3.0",
        "practice": "npc",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Npc"
      },
      {
        "id": "budget",
        "titleKey": "DDA.Academy.Step.npcs.budget.Title",
        "textKey": "DDA.Academy.Step.npcs.budget.Text",
        "mood": "explaining",
        "surface": "npc",
        "selector": ".dda-enemy-preview-panel",
        "reference": "Game Master's Index §3.0",
        "practice": "npc",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Npc"
      },
      {
        "id": "build",
        "titleKey": "DDA.Academy.Step.npcs.build.Title",
        "textKey": "DDA.Academy.Step.npcs.build.Text",
        "mood": "explaining",
        "surface": "npc",
        "selector": ".dda-enemy-preview-panel",
        "reference": "Game Master's Index §3.01–3.04",
        "practice": "npc",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Npc"
      },
      {
        "id": "create",
        "titleKey": "DDA.Academy.Step.npcs.create.Title",
        "textKey": "DDA.Academy.Step.npcs.create.Text",
        "mood": "determined",
        "surface": "npc",
        "selector": "[data-action=\"createEnemyNpc\"]",
        "practice": "npc",
        "practiceHintKey": "DDA.Academy.Practice.Hint.Npc"
      }
    ]
  },
  {
    "id": "options",
    "titleKey": "DDA.Academy.Chapter.options.Title",
    "descriptionKey": "DDA.Academy.Chapter.options.Description",
    "gmOnly": true,
    "steps": [
      {
        "id": "intro",
        "titleKey": "DDA.Academy.Step.options.intro.Title",
        "textKey": "DDA.Academy.Step.options.intro.Text",
        "mood": "serious",
        "surface": "settings",
        "experimental": true,
        "reference": "Game Master's Index §2.0"
      },
      {
        "id": "campaign",
        "titleKey": "DDA.Academy.Step.options.campaign.Title",
        "textKey": "DDA.Academy.Step.options.campaign.Text",
        "mood": "explaining",
        "surface": "settings",
        "selector": "[name=\"digimon-digital-adventures.campaignLevel\"]",
        "settingKeys": [
          "campaignLevel",
          "defaultPartnerStartingStage",
          "humanScaling"
        ],
        "experimental": true,
        "reference": "Game Master's Index §2.01a–2.01b"
      },
      {
        "id": "combat",
        "titleKey": "DDA.Academy.Step.options.combat.Title",
        "textKey": "DDA.Academy.Step.options.combat.Text",
        "mood": "explaining",
        "surface": "settings",
        "settingKeys": [
          "attributeAdvantage",
          "multiattackMode",
          "energizeAction",
          "enableClashActions"
        ],
        "experimental": true,
        "reference": "Game Master's Index §2.05"
      },
      {
        "id": "evolution",
        "titleKey": "DDA.Academy.Step.options.evolution.Title",
        "textKey": "DDA.Academy.Step.options.evolution.Text",
        "mood": "explaining",
        "surface": "settings",
        "settingKeys": [
          "enableArmorEvolution",
          "enableJogressEvolution",
          "enableHybridEvolution",
          "enableBioMergeEvolution",
          "evolutionStructureMode",
          "requireDirectEvolutionLink",
          "allowEvolutionRebranch"
        ],
        "experimental": true,
        "reference": "Game Master's Index §2.02a"
      },
      {
        "id": "extras",
        "titleKey": "DDA.Academy.Step.options.extras.Title",
        "textKey": "DDA.Academy.Step.options.extras.Text",
        "mood": "explaining",
        "surface": "settings",
        "settingKeys": [
          "enableMotifs",
          "enableDigiModifyCards",
          "enableExpendableItems",
          "enableEquipableItems"
        ],
        "experimental": true,
        "reference": "Game Master's Index §2.02c; 2.04"
      },
      {
        "id": "checks",
        "titleKey": "DDA.Academy.Step.options.checks.Title",
        "textKey": "DDA.Academy.Step.options.checks.Text",
        "mood": "encouraging",
        "surface": "settings",
        "settingKeys": [
          "naturalCriticals",
          "harderTorments",
          "mechanicalTorments",
          "flexibleTormentCreation"
        ],
        "experimental": true,
        "reference": "Game Master's Index §2.06"
      }
    ]
  }
];
