import { applyDamage } from "../rolls/damage-application.js";
import {
  endDdaSession,
  getDdaSessionState,
  startDdaSession
} from "../rules/tamer-resources.js";

const SYSTEM_ID = "digimon-digital-adventures";
const GM_TOOLS_TEMPLATE = `systems/${SYSTEM_ID}/templates/apps/dda-gm-tools.hbs`;

const {
  ApplicationV2,
  DialogV2,
  HandlebarsApplicationMixin
} = foundry.applications.api;

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
      title: "DDA.GmTools.Title",
      icon: "fa-solid fa-toolbox",
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


export class DDAGmTools extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dda-gm-tools",
    classes: ["dda", "dda-gm-tools", "dda-gm-tools-form"],
    tag: "form",
    position: {
      width: 430,
      height: "auto"
    },
    window: {
      title: "DDA.GmTools.Title",
      resizable: true
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: false,
      handler: DDAGmTools.#onSubmit
    },
    actions: {
      "refresh-targets": DDAGmTools.#onRefreshTargets,
      "apply-damage": DDAGmTools.#onApplyDamage,
      "start-session": DDAGmTools.#onStartSession,
      "end-session": DDAGmTools.#onEndSession,
      "grant-actions": DDAGmTools.#onGrantActions,
      "restore-actions": DDAGmTools.#onRestoreActions,
      "grant-unrestricted-movement": DDAGmTools.#onGrantUnrestrictedMovement,
      "clear-movement": DDAGmTools.#onClearMovement
    }
  };

  static PARTS = {
    form: {
      template: GM_TOOLS_TEMPLATE
    }
  };

  static open() {
    if (activeGmToolsApp?.rendered) {
      activeGmToolsApp.bringToFront();
      return activeGmToolsApp;
    }

    activeGmToolsApp = new DDAGmTools();
    activeGmToolsApp.render({ force: true });
    return activeGmToolsApp;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const targets = getNarrativeTargets("auto");
    const session = getDdaSessionState();

    return {
      ...context,
      targets: targets.map(({ actor, token }) => getTargetViewData(actor, token)),
      hasTargets: targets.length > 0,
      session: {
        ...session,
        statusLabel: game.i18n.localize(
          session.active
            ? "DDA.GmTools.Session.Active"
            : "DDA.GmTools.Session.Inactive"
        ),
        startedAtLabel: session.startedAt
          ? new Date(session.startedAt).toLocaleString()
          : "—"
      },
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

  static async #onSubmit(_event, _form, _formData) {}

  static async #onRefreshTargets(event) {
    event.preventDefault();
    await this.render();
  }

  static async #onStartSession(event, target) {
    event.preventDefault();

    const currentSession = getDdaSessionState();

    if (currentSession.active) {
      const confirmed = await DialogV2.confirm({
        window: {
          title: game.i18n.localize("DDA.GmTools.Session.RestartTitle")
        },
        content: `<p>${game.i18n.localize("DDA.GmTools.Session.RestartContent")}</p>`,
        yes: { default: false },
        no: { default: true },
        rejectClose: false,
        modal: true
      });

      if (!confirmed) return;
    }

    target.disabled = true;

    try {
      const result = await startDdaSession();
      await postSessionStartCard(result);
      await this.render();
    } finally {
      target.disabled = false;
    }
  }

  static async #onEndSession(event, target) {
    event.preventDefault();

    const currentSession = getDdaSessionState();

    if (!currentSession.active) {
      ui.notifications.info(
        game.i18n.localize("DDA.GmTools.Session.AlreadyInactive")
      );
      return;
    }

    const confirmed = await DialogV2.confirm({
      window: {
        title: game.i18n.localize("DDA.GmTools.Session.EndTitle")
      },
      content: `<p>${game.i18n.localize("DDA.GmTools.Session.EndContent")}</p>`,
      yes: { default: false },
      no: { default: true },
      rejectClose: false,
      modal: true
    });

    if (!confirmed) return;

    target.disabled = true;

    try {
      const result = await endDdaSession();
      await postSessionEndCard(result);
      await this.render();
    } finally {
      target.disabled = false;
    }
  }

  static async #onGrantActions(event, target) {
    event.preventDefault();

    const form = target.closest("form");
    if (!form) return;

    const formData = new FormData(form);
    const amount = Math.max(1, Math.floor(Number(formData.get("actionAmount") ?? 1)));
    const targetMode = String(formData.get("targetMode") ?? "auto");
    const targets = getNarrativeTargets(targetMode);

    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.GmToolsNoValidTargets"));
      return;
    }

    target.disabled = true;
    try {
      for (const { actor } of targets) {
        const current = Math.max(0, Number(actor.system?.combat?.actions?.value ?? 0));
        await actor.update({
          "system.combat.actions.value": current + amount
        });
      }

      ui.notifications.info(game.i18n.format("DDA.GmTools.Actions.GrantedNotice", {
        amount,
        count: targets.length
      }));
      await this.render();
    } finally {
      target.disabled = false;
    }
  }

  static async #onRestoreActions(event, target) {
    event.preventDefault();

    const form = target.closest("form");
    if (!form) return;

    const formData = new FormData(form);
    const targetMode = String(formData.get("targetMode") ?? "auto");
    const targets = getNarrativeTargets(targetMode);

    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.GmToolsNoValidTargets"));
      return;
    }

    target.disabled = true;
    try {
      for (const { actor, token } of targets) {
        const maximum = Math.max(0, Number(actor.system?.combat?.actions?.max ?? 2));
        await actor.update({
          "system.combat.actions.value": maximum,
          "system.combat.hasAttackedThisRound": false,
          "system.combat.attacksMadeThisTurn": 0,
          "system.combat.movementActionsThisTurn": 0
        });

        const combatant = getTargetCombatant(token, actor);
        if (combatant) {
          await combatant.update({
            [`flags.${SYSTEM_ID}.initiative.endedRound`]: 0
          });
        }
      }

      ui.notifications.info(game.i18n.format("DDA.GmTools.Actions.RestoredNotice", {
        count: targets.length
      }));
      await this.render();
    } finally {
      target.disabled = false;
    }
  }

  static async #onGrantUnrestrictedMovement(event, target) {
    event.preventDefault();

    const form = target.closest("form");
    if (!form) return;

    const formData = new FormData(form);
    const targetMode = String(formData.get("targetMode") ?? "auto");
    const targets = getNarrativeTargets(targetMode);
    const tracker = game?.dda?.movementTracker;

    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.GmToolsNoValidTargets"));
      return;
    }

    if (!tracker?.grantUnrestrictedMovement) {
      ui.notifications.warn(game.i18n.localize("DDA.GmTools.Movement.TrackerUnavailable"));
      return;
    }

    target.disabled = true;
    try {
      let granted = 0;
      for (const { actor } of targets) {
        const success = await tracker.grantUnrestrictedMovement(actor, {
          label: game.i18n.localize("DDA.GmTools.Movement.UnrestrictedLabel")
        });
        if (success) granted += 1;
      }

      ui.notifications.info(game.i18n.format("DDA.GmTools.Movement.GrantedNotice", {
        count: granted
      }));
      await this.render();
    } finally {
      target.disabled = false;
    }
  }

  static async #onClearMovement(event, target) {
    event.preventDefault();

    const form = target.closest("form");
    if (!form) return;

    const formData = new FormData(form);
    const targetMode = String(formData.get("targetMode") ?? "auto");
    const targets = getNarrativeTargets(targetMode);
    const tracker = game?.dda?.movementTracker;

    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.GmToolsNoValidTargets"));
      return;
    }

    target.disabled = true;
    try {
      for (const { actor } of targets) {
        await tracker?.clearForActor?.(actor);
      }
      await this.render();
    } finally {
      target.disabled = false;
    }
  }

  static async #onApplyDamage(event, target) {
    event.preventDefault();

    const form = target.closest("form");
    if (!form) return;

    const formData = new FormData(form);
    const rawDamage = Number(formData.get("damage") ?? 0);
    const damageTypeKey = String(formData.get("damageType") ?? "normal");
    const targetMode = String(formData.get("targetMode") ?? "auto");
    const createChat = formData.get("createChat") === "on";

    if (!Number.isFinite(rawDamage) || rawDamage <= 0) {
      ui.notifications.warn(
        game.i18n.localize("DDA.Warning.GmToolsInvalidDamage")
      );
      return;
    }

    const targets = getNarrativeTargets(targetMode);

    if (!targets.length) {
      ui.notifications.warn(
        game.i18n.localize("DDA.Warning.GmToolsNoValidTargets")
      );
      return;
    }

    const damageConfig = DAMAGE_TYPE_CONFIG[damageTypeKey]
      ?? DAMAGE_TYPE_CONFIG.normal;

    const localizedDamageConfig = {
      ...damageConfig,
      damageLabel: damageConfig.damageLabelKey
        ? game.i18n.localize(damageConfig.damageLabelKey)
        : damageConfig.damageLabel
    };

    const results = [];
    target.disabled = true;

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

      if (!createChat) {
        console.group(game.i18n.localize("DDA.GmTools.Title"));

        for (const entry of results) {
          console.log(entry.actor.name, {
            before: entry.before,
            after: entry.after,
            result: entry.result
          });
        }

        console.groupEnd();
      }

      await this.render();
    } finally {
      target.disabled = false;
    }
  }
}

async function postSessionStartCard(result) {
  const granted = result.potentialGrants.filter((entry) => entry.granted > 0);
  const blocked = result.potentialGrants.filter((entry) => entry.granted <= 0);

  await ChatMessage.create({
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive dda-session-card">
        <h2>${game.i18n.localize("DDA.GmTools.Session.Started")}</h2>

        <ul class="dda-effect-list">
          <li>
            ${game.i18n.localize("DDA.GmTools.Session.PotentialGranted")}:
            <strong>${granted.length}</strong>.
          </li>

          ${
            granted.length
              ? `<li>${granted.map((entry) => entry.tamer.name).join(", ")}</li>`
              : ""
          }

          ${
            blocked.length
              ? `<li>${game.i18n.format("DDA.GmTools.Session.PotentialBlocked", {
                  actors: blocked.map((entry) => entry.tamer.name).join(", ")
                })}</li>`
              : ""
          }
        </ul>
      </div>
    `
  });
}

async function postSessionEndCard(result) {
  const totalCleared = result.cleared.reduce(
    (sum, entry) => sum + entry.cleared,
    0
  );

  await ChatMessage.create({
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-session-card">
        <h2>${game.i18n.localize("DDA.GmTools.Session.Ended")}</h2>

        <p>
          ${game.i18n.format("DDA.GmTools.Session.TemporaryIpRemoved", {
            amount: totalCleared
          })}
        </p>
      </div>
    `
  });
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

    unique.set(
      token.id ?? token.document?.uuid ?? token.actor.uuid,
      token
    );
  }

  return Array.from(unique.values()).map((token) => ({
    token,
    actor: token.actor
  }));
}

function getTargetCombatant(token, actor) {
  const combat = game?.combat;
  if (!combat?.started) return null;

  return combat.combatants?.find((combatant) => {
    if (token?.id && combatant.tokenId === token.id) return true;
    return combatant.actor?.uuid === actor?.uuid;
  }) ?? null;
}

function getTargetViewData(actor, token) {
  const woundState = getActorWoundState(actor);
  const crashReduction = actor.system?.utilityBonuses?.crashDamageReduction ?? {};
  const crashReductionValue = Number(
    crashReduction.total ?? crashReduction.value ?? 0
  );

  return {
    name: actor.name,
    type: actor.type,
    tokenName: token?.name ?? actor.name,
    wounds: woundState.value,
    maxWounds: woundState.max,
    tempWounds: woundState.temp,
    actions: Math.max(0, Number(actor.system?.combat?.actions?.value ?? 0)),
    maxActions: Math.max(0, Number(actor.system?.combat?.actions?.max ?? 0)),
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
