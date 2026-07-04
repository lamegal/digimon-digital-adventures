import { applyDamage } from "../rolls/damage-application.js";

const SYSTEM_ID = "digimon-digital-adventures";
const GM_TOOLS_TEMPLATE = `systems/${SYSTEM_ID}/templates/apps/dda-gm-tools.hbs`;

let activeGmToolsApp = null;

const DAMAGE_TYPE_CONFIG = {
  normal: {
    damageType: "",
    damageLabel: ""
  },
  crash: {
    damageType: "crash",
    damageLabelKey: "DDA.Damage.Type.Crash"
  },
  fall: {
    damageType: "crash",
    damageLabelKey: "DDA.Damage.Type.Fall",
    crashSource: "fall"
  },
  thrown: {
    damageType: "crash",
    damageLabelKey: "DDA.Damage.Type.Thrown",
    crashSource: "thrown"
  }
};

export function registerDdaGmToolsControls() {
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) return;

    const tool = {
      name: "dda-gm-tools",
      title: "Ferramentas do Mestre DDA",
      icon: "dda-gm-tools-control-icon",
      order: 999,
      button: true,
      visible: game.user.isGM,
      onChange: () => {
        DDAGmTools.open();
      }
    };

    if (controls?.tokens?.tools) {
      controls.tokens.tools["dda-gm-tools"] = tool;
      return;
    }

    const tokenControls = Array.isArray(controls)
      ? controls.find((control) => control.name === "token" || control.name === "tokens")
      : null;

    if (!tokenControls?.tools) return;

    if (Array.isArray(tokenControls.tools)) {
      tokenControls.tools.push(tool);
      return;
    }

    tokenControls.tools["dda-gm-tools"] = tool;
  });
}

export class DDAGmTools extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "dda-gm-tools",
      title: game.i18n.localize("DDA.GmTools.Title"),
      template: GM_TOOLS_TEMPLATE,
      classes: ["dda", "dda-gm-tools"],
      width: 430,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false,
      resizable: true
    });
  }

  static open() {
    if (activeGmToolsApp?.rendered) {
      activeGmToolsApp.bringToTop();
      return activeGmToolsApp;
    }

    activeGmToolsApp = new DDAGmTools();
    activeGmToolsApp.render(true);
    return activeGmToolsApp;
  }

  async getData(options = {}) {
    const targets = getNarrativeTargets("auto");

    return {
      targets: targets.map(({ actor, token }) => getTargetViewData(actor, token)),
      hasTargets: targets.length > 0,
        damageTypes: [
        {
            key: "normal",
            label: game.i18n.localize("DDA.GmTools.DamageType.Normal")
        },
        {
            key: "crash",
            label: game.i18n.localize("DDA.GmTools.DamageType.Crash")
        },
        {
            key: "fall",
            label: game.i18n.localize("DDA.GmTools.DamageType.Fall")
        },
        {
            key: "thrown",
            label: game.i18n.localize("DDA.GmTools.DamageType.Thrown")
        }
        ],
        targetModes: [
        {
            key: "auto",
            label: game.i18n.localize("DDA.GmTools.TargetMode.Auto")
        },
        {
            key: "selected",
            label: game.i18n.localize("DDA.GmTools.TargetMode.Selected")
        },
        {
            key: "targeted",
            label: game.i18n.localize("DDA.GmTools.TargetMode.Targeted")
        },
        {
            key: "both",
            label: game.i18n.localize("DDA.GmTools.TargetMode.Both")
        }
        ]
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='refresh-targets']").on("click", (event) => {
      event.preventDefault();
      this.render(false);
    });

    html.find("[data-action='apply-damage']").on("click", this._onApplyDamage.bind(this));
  }


  async _onApplyDamage(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const form = button.closest("form");

    if (!form) return;

    const formData = new FormData(form);
    const rawDamage = Number(formData.get("damage") ?? 0);
    const damageTypeKey = String(formData.get("damageType") ?? "normal");
    const targetMode = String(formData.get("targetMode") ?? "auto");
    const createChat = formData.get("createChat") === "on";

    if (!Number.isFinite(rawDamage) || rawDamage <= 0) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.GmToolsInvalidDamage"));
      return;
    }

    const targets = getNarrativeTargets(targetMode);

    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.GmToolsNoValidTargets"));
      return;
    }

    const damageConfig = DAMAGE_TYPE_CONFIG[damageTypeKey] ?? DAMAGE_TYPE_CONFIG.normal;
    const localizedDamageConfig = {
  ...damageConfig,
  damageLabel: damageConfig.damageLabelKey
    ? game.i18n.localize(damageConfig.damageLabelKey)
    : damageConfig.damageLabel
};
    const results = [];

    button.disabled = true;

    try {
      for (const { actor, token } of targets) {
        const before = getActorWoundState(actor);

        const result = await applyDamage(actor, rawDamage, {
        ...localizedDamageConfig,
        createChat
        });

        const after = getActorWoundState(actor);

        results.push({
          actor,
          token,
          before,
          after,
          result
        });
      }

      await this._postSummary(results, {
        rawDamage,
        damageConfig,
        createChat
      });

      this.render(false);
    } finally {
      button.disabled = false;
    }
  }

  async _postSummary(results, context = {}) {
    if (!results.length) return;
    if (context.createChat) return;

    console.group(game.i18n.localize("DDA.GmTools.Title"));

    for (const entry of results) {
      console.log(entry.actor.name, {
        antes: entry.before,
        depois: entry.after,
        resultado: entry.result
      });
    }

    console.groupEnd();
  }
}

function getNarrativeTargets(mode = "auto") {
  const controlledTokens = canvas.tokens?.controlled ?? [];
  const targetedTokens = Array.from(game.user.targets ?? []);

  let tokens = [];

  if (mode === "selected") {
    tokens = controlledTokens;
  } else if (mode === "targeted") {
    tokens = targetedTokens;
  } else if (mode === "both") {
    tokens = [...controlledTokens, ...targetedTokens];
  } else {
    tokens = controlledTokens.length ? controlledTokens : targetedTokens;
  }

  const unique = new Map();

  for (const token of tokens) {
    if (!token?.actor) continue;

    if (!["character", "digimon", "npc"].includes(token.actor.type)) continue;

    unique.set(token.id ?? token.document?.uuid ?? token.actor.uuid, token);
  }

  return Array.from(unique.values()).map((token) => ({
    token,
    actor: token.actor
  }));
}

function getTargetViewData(actor, token) {
  const woundState = getActorWoundState(actor);
  const crashReduction = actor.system?.utilityBonuses?.crashDamageReduction ?? {};
  const crashReductionValue = Number(crashReduction.total ?? crashReduction.value ?? 0);

  return {
    name: actor.name,
    type: actor.type,
    tokenName: token?.name ?? actor.name,
    wounds: woundState.value,
    maxWounds: woundState.max,
    tempWounds: woundState.temp,
    crashReduction: crashReductionValue,
    crashReductionTooltip: crashReduction.tooltip ?? ""
  };
}

function getActorWoundState(actor) {
  if (actor.type === "character") {
    const wounds = actor.system?.derived?.wounds ?? {};

    return {
      value: Number(wounds.value ?? 0),
      max: Number(wounds.max ?? 0),
      temp: Number(wounds.temp?.value ?? 0)
    };
  }

  const wounds = actor.system?.miscStats?.wounds ?? {};

  return {
    value: Number(wounds.value ?? 0),
    max: Number(wounds.max ?? 0),
    temp: Number(wounds.temp?.value ?? 0)
  };
}