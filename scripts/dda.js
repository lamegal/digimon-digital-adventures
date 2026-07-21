import { DDA } from "./config.js";
import { getCampaignLevelSummary } from "./rules/campaign-rules.js";
import { DDAActor } from "./documents/actor-document.js";
import { DDAItem } from "./documents/item-document.js";
import { registerHandlebarsHelpers } from "./helpers/handlebars.js";
import { DDACharacterSheet } from "./sheets/character-sheet.js";
import { DDADigimonSheet } from "./sheets/digimon-sheet.js";
import { DDAGroupSheet } from "./sheets/group-sheet.js";
import { DDAItemSheet } from "./sheets/item-sheet.js";
import { bindDamageApplicationButtons } from "./rolls/damage-application.js";
import { bindAttackDodgeChatCard, registerAttackDodgeResponseListener } from "./rolls/attack-roll.js";
import { registerDDASettings } from "./settings.js";
import { executeForcedEvolution, endForcedEvolution, executeBlastEvolution } from "./combat/evolution.js";
import { initiateDigimonClash, endDigimonClash, openDigimonClashActionMenu, handleClashChatAction } from "./combat/clash.js";
import { takeTamerBreak } from "./combat/rest.js";

import {
  bindTamerActionChatCard
} from "./combat/tamer-actions.js";

import { openEncounterCalculator } from "./apps/encounter-calculator.js";
import { DDA_TAMER_TALENTS } from "./data/tamer-talents.js";
import { getTamerTalentUsesMax } from "./rules/tamer-talent-automation.js";
import { registerTamerTalentSocket } from "./rules/tamer-talent-socket.js";
import { DDADigimonQualityBrowser } from "./apps/digimon-quality-browser.js";
import { DDAGmTools, registerDdaGmToolsControls } from "./apps/dda-gm-tools.js";
import { DDADigimonWizard } from "./wizard/dda-digimon-wizard.js";
import {
  DDADigimonEnemyWizard,
  registerEnemyDigimonWizardDirectoryButton
} from "./apps/dda-digimon-enemy-wizard.js";
import { registerMovementTracker } from "./canvas/movement-tracker.js";
import { registerDigimonActions } from "./combat/digimon-actions.js";
import { registerIntercede } from "./combat/intercede.js";
import { registerDdaHealthPips } from "./canvas/health-pips.js";
function registerDdaDefaultTokenDispositions() {
  Hooks.on("preCreateActor", (actor, data) => {
    if (!actor) return;

    const actorType = String(actor.type ?? "");
    const supportedTypes = new Set(["character", "digimon", "npc"]);

    if (!supportedTypes.has(actorType)) return;

    const incomingDisposition = foundry.utils.getProperty(
      data,
      "prototypeToken.disposition"
    );

    if (incomingDisposition !== undefined && incomingDisposition !== null) {
      return;
    }

    const isEnemy = Boolean(
      foundry.utils.getProperty(data, "system.enemy.isEnemy") ??
      actor.system?.enemy?.isEnemy
    );

    let disposition = null;

    if (actorType === "character" || actorType === "digimon") {
      disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
    } else if (actorType === "npc" && isEnemy) {
      disposition = CONST.TOKEN_DISPOSITIONS.HOSTILE;
    }

    if (disposition === null) return;

    actor.updateSource({
      prototypeToken: foundry.utils.mergeObject(
        actor.prototypeToken?.toObject?.() ?? {},
        { disposition },
        { inplace: false }
      )
    });
  });
}
import {
  registerDDACombatInitiativeHooks
} from "./combat/initiative.js";
import { DDATamerWizard } from "./wizard/dda-tamer-wizard.js";
import { registerDigimonTokenScaleHooks } from "./tokens/digimon-token-scale.js";
import { DDA_DIGIMENTALS, getDdaDigimentals } from "./data/digimental.js";
import { registerOwnershipSyncHooks, syncExistingPartnerOwnership } from "./utils/ownership.js";

const ActorCollection = foundry.documents.collections.Actors;
const ItemCollection = foundry.documents.collections.Items;

const ActorSheetV1 = foundry.appv1.sheets.ActorSheet;
const ItemSheetV1 = foundry.appv1?.sheets?.ItemSheet;
const ItemSheetV2 = foundry.applications.sheets.ItemSheetV2;

async function loadDDAFlatTranslations() {
  const lang = game.i18n.lang ?? "en";
  const path = `systems/digimon-digital-adventures/lang/${lang}.json`;

  try {
    const response = await fetch(`${path}?v=${game.system.version}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const translations = await response.json();

    for (const [key, value] of Object.entries(translations)) {
      game.i18n.translations[key] = value;
    }

    console.log(`DDA | Loaded ${Object.keys(translations).length} flat translations from ${path}.`);
  } catch (error) {
    console.error(`DDA | Could not load flat translations from ${path}.`, error);
  }
}

Hooks.once("init", async function () {
  await loadDDAFlatTranslations();

    registerDDASettings();
  registerOwnershipSyncHooks();
  registerDdaGmToolsControls();
  registerEnemyDigimonWizardDirectoryButton();
  console.log("Digimon Digital Adventures V2 | Inicializando sistema");

  game.dda = game.dda ?? {};
  game.dda.config = DDA;

  CONFIG.DDA = DDA;
  CONFIG.DDA.DIGIMENTALS = DDA_DIGIMENTALS;

  // Evita que o botão nativo de Iniciativa do Foundry tente avaliar
// uma fórmula ausente. A ordem oficial continua sendo a Iniciativa DDA.
CONFIG.Combat ??= {};
CONFIG.Combat.initiative ??= {};
CONFIG.Combat.initiative.formula = "3d6";

  game.dda.DDA_DIGIMENTALS = DDA_DIGIMENTALS;
  game.dda.getDdaDigimentals = getDdaDigimentals;

  globalThis.DDA_DIGIMENTALS = DDA_DIGIMENTALS;
  CONFIG.Actor.documentClass = DDAActor;
  CONFIG.Item.documentClass = DDAItem;

ActorCollection.unregisterSheet("core", ActorSheetV1);

ActorCollection.registerSheet(
  "digimon-digital-adventures",
  DDACharacterSheet,
  {
    types: ["character"],
    makeDefault: true,
    label: game.i18n.localize("DDA.Sheet.Character")
  }
);

ActorCollection.registerSheet(
  "digimon-digital-adventures",
  DDADigimonSheet,
  {
    types: ["digimon", "npc"],
    makeDefault: true,
    label: game.i18n.localize("DDA.Sheet.Digimon")
  }
);

ActorCollection.registerSheet(
  "digimon-digital-adventures",
  DDAGroupSheet,
  {
    types: ["group"],
    makeDefault: true,
    label: game.i18n.localize("DDA.Sheet.Group")
  }
);

if (ItemSheetV1) ItemCollection.unregisterSheet("core", ItemSheetV1);
if (ItemSheetV2) ItemCollection.unregisterSheet("core", ItemSheetV2);

ItemCollection.registerSheet(
  "digimon-digital-adventures",
  DDAItemSheet,
  {
    types: ["attack"],
    makeDefault: true,
    label: "DDA.Item.Attack"
  }
);

ItemCollection.registerSheet(
  "digimon-digital-adventures",
  DDAItemSheet,
  {
    types: ["quality"],
    makeDefault: true,
    label: "DDA.Item.Quality"
  }
);

ItemCollection.registerSheet(
  "digimon-digital-adventures",
  DDAItemSheet,
  {
    types: ["torment"],
    makeDefault: true,
    label: "DDA.Item.Torment"
  }
);

ItemCollection.registerSheet(
  "digimon-digital-adventures",
  DDAItemSheet,
  {
    types: ["tamerTalent"],
    makeDefault: true,
    label: "DDA.Item.TamerTalent"
  }
);

ItemCollection.registerSheet(
  "digimon-digital-adventures",
  DDAItemSheet,
  {
    types: ["digimental"],
    makeDefault: true,
    label: "DDA.Item.Digimental"
  }
);

ItemCollection.registerSheet(
  "digimon-digital-adventures",
  DDAItemSheet,
  {
    types: [
      "motif",
      "equipment",
      "consumable",
      "card",
      "milestone",
      "trait",
      "evolutionLink"
    ],
    makeDefault: true,
    label: "DDA.Sheet.Item"
  }
);

  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });

  Handlebars.registerHelper("ne", function (a, b) {
    return a !== b;
  });

  Handlebars.registerHelper("add", function (a, b) {
    return Number(a ?? 0) + Number(b ?? 0);
  });

  Handlebars.registerHelper("subtract", function (a, b) {
    return Number(a ?? 0) - Number(b ?? 0);
  });

  Handlebars.registerHelper("array", function (...args) {
    return args.slice(0, -1);
  });

  registerHandlebarsHelpers();

  registerDigimonTokenScaleHooks();
  registerDDACombatInitiativeHooks();

  Handlebars.registerHelper("range", function (start, end) {
    const result = [];

    for (let i = start; i <= end; i++) {
      result.push(i);
    }

    return result;
  });
});

Hooks.once("ready", async () => {
  await loadDDAFlatTranslations();

  for (const app of Object.values(ui.windows)) {
    app.render(false);
  }

  ui.actors?.render(true);

  console.log("DDA | Flat translations reloaded on ready.");

  game.dda = game.dda ?? {};
  game.dda.rules = game.dda.rules ?? {};
  game.dda.rules.campaignLevel = getCampaignLevelSummary();

  game.dda.applications = game.dda.applications ?? {};
    game.dda.applications.DDADigimonWizard = DDADigimonWizard;
    game.dda.applications.DDATamerWizard = DDATamerWizard;
    game.dda.applications.DDADigimonEnemyWizard = DDADigimonEnemyWizard;

    game.dda.openEnemyDigimonWizard = () => {
      return DDADigimonEnemyWizard.open();
    };

  game.dda.applications.DDAGmTools = DDAGmTools;
    game.dda.openGmTools = () => DDAGmTools.open();

  game.dda.DigimonQualityBrowser = DDADigimonQualityBrowser;

  game.dda.actions = game.dda.actions ?? {};
  game.dda.actions.executeForcedEvolution = executeForcedEvolution;
  game.dda.actions.endForcedEvolution = endForcedEvolution;
  game.dda.actions.executeBlastEvolution = executeBlastEvolution;
  game.dda.actions.initiateDigimonClash = initiateDigimonClash;
  game.dda.actions.endDigimonClash = endDigimonClash;
  game.dda.actions.openDigimonClashActionMenu = openDigimonClashActionMenu;
  game.dda.actions.takeTamerBreak = takeTamerBreak;

  registerAttackDodgeResponseListener();
  registerTamerTalentSocket();

if (game.user.isGM) {
  await syncExistingPartnerOwnership();
}

  console.log("DDA | Wizards registrados:", game.dda.applications);
});
Hooks.once("ready", function () {
  console.log("Digimon Digital Adventures V2 | Sistema pronto");
});


function normalizeTamerCheckChatMessage(html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root?.querySelector) return;

  const headerFlavor = root.querySelector(".message-header > .flavor-text:has(.dda-tamer-check-card)");
  const content = root.querySelector(".message-content");

  if (!content) return;

  const existingWrapper = content.querySelector(".dda-tamer-check-message");

  if (existingWrapper) {
    const looseRolls = Array.from(content.children).filter((child) => {
      return child.classList?.contains("dice-roll") && child.parentElement !== existingWrapper;
    });

    for (const roll of looseRolls) {
      existingWrapper.appendChild(roll);
    }

    return;
  }

  if (!headerFlavor) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("dda-chat-roll-message", "dda-tamer-check-message");

  const shell = headerFlavor.querySelector(".dda-tamer-check-shell") ?? headerFlavor.querySelector(".dda-chat-roll-shell");
  const card = headerFlavor.querySelector(".dda-tamer-check-card");

  if (shell) {
    wrapper.appendChild(shell);
  } else if (card) {
    const newShell = document.createElement("div");
    newShell.classList.add("dda-tamer-check-shell", "dda-chat-roll-shell");
    newShell.appendChild(card);
    wrapper.appendChild(newShell);
  } else {
    return;
  }

  const rolls = Array.from(content.children).filter((child) => child.classList?.contains("dice-roll"));

  for (const roll of rolls) {
    wrapper.appendChild(roll);
  }

  content.prepend(wrapper);
  headerFlavor.remove();
}

Hooks.on("renderChatMessageHTML", (message, html) => {
  const root = html instanceof HTMLElement
    ? html
    : html?.[0] instanceof HTMLElement
      ? html[0]
      : html?.element instanceof HTMLElement
        ? html.element
        : null;

normalizeTamerCheckChatMessage(root);

if (!root?.querySelectorAll) return;

void bindTamerActionChatCard(
  message,
  root
).catch((error) => {
  console.warn(
    "DDA | Could not bind Tamer Action chat card.",
    error
  );
});

void bindAttackDodgeChatCard(message, root).catch((error) => {
    console.warn("DDA | Could not bind the pending Dodge chat card.", error);
  });

  void bindDamageApplicationButtons(root).catch((error) => {
  console.warn("DDA | Could not bind damage buttons.", error);
});

  root.querySelectorAll(".dda-clash-chat-action").forEach((button) => {
    button.addEventListener("click", handleClashChatAction);
  });

  root.querySelectorAll("[data-action='dda-dark-evolution-end']").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const actorUuid = event.currentTarget?.dataset?.actorUuid ?? "";
      await endDarkEvolution(actorUuid, { reason: "manual" });
    });
  });

  root.querySelectorAll("[data-action='dda-dark-evolution-tick']").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const actorUuid = event.currentTarget?.dataset?.actorUuid ?? "";
      await decrementDarkEvolutionTurn(actorUuid, { reason: "turns" });
    });
  });
});
Hooks.once("ready", () => {
    game.digimonDigitalAdventures = game.digimonDigitalAdventures ?? {};
    game.digimonDigitalAdventures.openEncounterCalculator = openEncounterCalculator;


  document.addEventListener(
    "wheel",
    (event) => {
      const target = event.target;

      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "number") return;

      event.preventDefault();
      event.stopPropagation();

      target.blur();
    },
    {
      capture: true,
      passive: false
    }
  );

  console.log("DDA | Scroll em campos numéricos bloqueado.");
});
Hooks.once("ready", () => {
  registerMovementTracker();
  registerDigimonActions();
  registerIntercede();
  registerDdaHealthPips();
  registerDdaDefaultTokenDispositions();
});

function adaptiveArmorText(pt, en) {
  return String(game.i18n?.lang ?? "")
    .toLowerCase()
    .startsWith("en")
      ? en
      : pt;
}

function normalizeAdaptiveArmorKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isAdaptiveArmorQuality(item) {
  if (!item || item.type !== "quality") return false;

  const sourceId = normalizeAdaptiveArmorKey(
    item.system?.sourceId ??
    item.system?.id ??
    item.flags?.[game.system.id]?.sourceId ??
    ""
  );

  const name = normalizeAdaptiveArmorKey(item.name);
  const originalName = normalizeAdaptiveArmorKey(
    item.system?.originalName ?? ""
  );

  return (
    sourceId === "armaduradedigizoideadaptavel" ||
    sourceId === "adaptivedigizoidarmor" ||
    name === "armaduradedigizoideadaptavel" ||
    name === "adaptivedigizoidarmor" ||
    originalName === "adaptivedigizoidarmor"
  );
}

function getAdaptiveArmorPointsPerRound(item) {
  if (!item || item.type !== "quality") return 0;

  const configuredPoints = Number(
    item.system?.adaptiveArmor?.pointsPerRound ??
    item.system?.grants?.adaptiveArmorPointsPerRound ??
    0
  );

  if (Number.isFinite(configuredPoints) && configuredPoints > 0) {
    return Math.floor(configuredPoints);
  }

  /*
   * Compatibilidade com Items já existentes cujo DataModel não
   * preservou o bloco superior system.adaptiveArmor.
   */
  return isAdaptiveArmorQuality(item) ? 4 : 0;
}

function getAdaptiveArmorQuality(actor) {
  return actor?.items?.find((item) => {
    return getAdaptiveArmorPointsPerRound(item) > 0;
  }) ?? null;
}

function getAdaptiveArmorResponsibleUser(actor) {
  const activeUsers = Array.from(game.users ?? [])
    .filter((user) => user.active);

  const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  const playerOwners = activeUsers
    .filter((user) => {
      if (user.isGM) return false;

      try {
        return actor.testUserPermission(user, ownerLevel);
      } catch (_error) {
        return false;
      }
    })
    .sort((left, right) => {
      return String(left.id).localeCompare(String(right.id));
    });

  if (playerOwners.length) {
    return playerOwners[0];
  }

  return activeUsers
    .filter((user) => user.isGM)
    .sort((left, right) => {
      return String(left.id).localeCompare(String(right.id));
    })[0] ?? null;
}

function getAdaptiveArmorDefaultAllocation(actor, pointsPerRound) {
  const points = Math.max(
    0,
    Math.floor(Number(pointsPerRound ?? 0))
  );

  const previous = actor.system?.combat?.adaptiveArmor ?? {};

  const previousDodge = Math.max(
    0,
    Math.floor(Number(previous.dodge ?? 0))
  );

  const previousArmor = Math.max(
    0,
    Math.floor(Number(previous.armor ?? 0))
  );

  if (previousDodge + previousArmor === points) {
    return {
      dodge: previousDodge,
      armor: previousArmor
    };
  }

  const dodge = Math.ceil(points / 2);

  return {
    dodge,
    armor: Math.max(0, points - dodge)
  };
}

async function promptAdaptiveArmorAllocation(
  actor,
  quality,
  pointsPerRound
) {
  const points = Math.max(
    0,
    Math.floor(Number(pointsPerRound ?? 0))
  );

  const defaultAllocation = getAdaptiveArmorDefaultAllocation(
    actor,
    points
  );

  const allocationOptions = [];

  for (let dodge = points; dodge >= 0; dodge -= 1) {
    const armor = points - dodge;

    const checked = (
      dodge === defaultAllocation.dodge &&
      armor === defaultAllocation.armor
    );

    allocationOptions.push(`
      <label class="dda-adaptive-armor-option">
        <input
          type="radio"
          name="allocation"
          value="${dodge}:${armor}"
          ${checked ? "checked" : ""}
        />

        <span>
          <strong>
            ${adaptiveArmorText("Esquiva", "Dodge")} +${dodge}
          </strong>

          <span>•</span>

          <strong>
            ${adaptiveArmorText("Armadura", "Armor")} +${armor}
          </strong>
        </span>
      </label>
    `);
  }

  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: `${quality.name} — ${actor.name}`
    },

    content: `
      <div class="dda-adaptive-armor-dialog">
        <p>
          ${adaptiveArmorText(
            `Distribua os ${points} pontos da Armadura de Digizóide Adaptável para esta rodada.`,
            `Distribute the ${points} Adaptive Digizoid Armor points for this round.`
          )}
        </p>

        <div class="dda-adaptive-armor-options">
          ${allocationOptions.join("")}
        </div>

        <p class="hint">
          ${adaptiveArmorText(
            "Fechar a janela mantém a distribuição anterior. Na primeira rodada, o padrão é uma divisão equilibrada.",
            "Closing the window keeps the previous allocation. On the first round, the default is an even split."
          )}
        </p>
      </div>
    `,

    buttons: [
      {
        action: "confirm",
        label: adaptiveArmorText("Confirmar", "Confirm"),
        default: true,

        callback: (_event, button) => {
          const rawValue = String(
            button.form?.elements?.allocation?.value ?? ""
          );

          const [rawDodge, rawArmor] = rawValue.split(":");

          const dodge = Math.max(
            0,
            Math.floor(Number(rawDodge ?? 0))
          );

          const armor = Math.max(
            0,
            Math.floor(Number(rawArmor ?? 0))
          );

          if (dodge + armor !== points) {
            return defaultAllocation;
          }

          return {
            dodge,
            armor
          };
        }
      },
      {
        action: "keep",
        label: adaptiveArmorText(
          "Manter distribuição",
          "Keep allocation"
        ),
        callback: () => defaultAllocation
      }
    ],

    rejectClose: false,
    modal: true
  });

  return result ?? defaultAllocation;
}

async function processAdaptiveArmorStartOfRound(combat) {
  const currentRound = Number(combat?.round ?? 0);

  if (!combat?.id || currentRound < 1) return;

  const processedActors = new Set();

  for (const combatant of combat.combatants ?? []) {
    const actor = combatant.actor;

    if (!actor) continue;
    if (processedActors.has(actor.uuid)) continue;
    if (actor.type !== "digimon" && actor.type !== "npc") continue;

    processedActors.add(actor.uuid);

    const quality = getAdaptiveArmorQuality(actor);

    if (!quality) continue;

    const currentState =
      actor.system?.combat?.adaptiveArmor ?? {};

    const alreadyAllocatedThisRound = (
      String(currentState.combatId ?? "") ===
        String(combat.id) &&
      Number(currentState.round ?? 0) === currentRound
    );

    if (alreadyAllocatedThisRound) continue;

    const responsibleUser =
      getAdaptiveArmorResponsibleUser(actor);

    if (
      !responsibleUser ||
      responsibleUser.id !== game.user.id
    ) {
      continue;
    }

    const pointsPerRound =
      getAdaptiveArmorPointsPerRound(quality);

    if (pointsPerRound <= 0) continue;

    let allocation;

    try {
      allocation = await promptAdaptiveArmorAllocation(
        actor,
        quality,
        pointsPerRound
      );
    } catch (error) {
      console.warn(
        "DDA | Could not choose Adaptive Digizoid Armor allocation.",
        {
          actor: actor.name,
          quality: quality.name,
          error
        }
      );

      allocation = getAdaptiveArmorDefaultAllocation(
        actor,
        pointsPerRound
      );
    }

    const dodge = Math.max(
      0,
      Math.min(
        pointsPerRound,
        Math.floor(Number(allocation?.dodge ?? 0))
      )
    );

    const armor = Math.max(
      0,
      Math.min(
        pointsPerRound - dodge,
        Math.floor(Number(allocation?.armor ?? 0))
      )
    );

    await actor.update({
      "system.combat.adaptiveArmor": {
        active: true,
        qualityId: quality.id,
        sourceId: String(
          quality.system?.sourceId ??
          quality.system?.id ??
          ""
        ),
        qualityName: quality.name,
        pointsPerRound,
        dodge,
        armor,
        combatId: combat.id,
        round: currentRound,
        updatedBy: game.user.id,
        updatedAt: new Date().toISOString()
      }
    });

    actor.sheet?.render(false);

    ui.notifications.info(
      adaptiveArmorText(
        `${actor.name}: Esquiva +${dodge}, Armadura +${armor}.`,
        `${actor.name}: Dodge +${dodge}, Armor +${armor}.`
      )
    );
  }
}

/*
 * Adaptive Armor normalmente é processada quando a Rodada muda.
 *
 * Também verificamos mudanças de Turno/estado do Combate para recuperar
 * casos em que o mundo foi recarregado no meio da Rodada, a Quality foi
 * adicionada durante o Combate ou o evento inicial não foi processado.
 *
 * processAdaptiveArmorStartOfRound já impede uma segunda escolha na
 * mesma Rodada por meio de combatId + round.
 */
Hooks.on("updateCombat", async (combat, changed) => {
  const roundChanged = Object.hasOwn(changed, "round");
  const turnChanged = Object.hasOwn(changed, "turn");
  const activeChanged = Object.hasOwn(changed, "active");

  if (!roundChanged && !turnChanged && !activeChanged) return;
  if (!combat?.started) return;
  if (!combat?.combatants?.size) return;
  if (Number(combat.round ?? 0) < 1) return;

  try {
    await processAdaptiveArmorStartOfRound(combat);
  } catch (error) {
    console.error(
      "DDA | Could not process Adaptive Digizoid Armor.",
      error
    );
  }
});

Hooks.on("updateCombat", async (combat, changed) => {
  if (!("round" in changed)) return;
  if (!combat?.combatants?.size) return;

  const processedActors = new Set();
  const rechargedEntries = [];

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;

    if (!actor) continue;
    if (processedActors.has(actor.uuid)) continue;
    if (actor.type !== "digimon" && actor.type !== "npc") continue;

    processedActors.add(actor.uuid);

    const rechargeData = await rechargeQualityUses(actor, "round");

    if (rechargeData.changed) {
      rechargedEntries.push({
        actor,
        entries: rechargeData.entries
      });

      actor.sheet?.render(false);
    }
  }

  if (!rechargedEntries.length) return;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-round-recharge-card">
        <h2>${game.i18n.localize("DDA.Combat.NewRound")}</h2>

        <p>${game.i18n.localize("DDA.Combat.RoundQualityUsesRestored")}</p>

        <ul class="dda-effect-list dda-round-recharge-list">
          ${rechargedEntries.map((actorEntry) => {
            return `
              <li>
                <strong>${actorEntry.actor.name}</strong>:
                ${actorEntry.entries.map((entry) => {
                  return `<span>${entry.name} ${entry.oldValue} → ${entry.newValue}</span>`;
                }).join(" ")}
              </li>
            `;
          }).join("")}
        </ul>
      </div>
    `
  });
});

Hooks.on("renderActorDirectory", (app, html, data) => {
  const root = html instanceof jQuery ? html[0] : html;

  const directoryFooter = root.querySelector(".directory-footer");
  const directoryHeader = root.querySelector(".directory-header");

  const target = directoryFooter ?? directoryHeader;
  if (!target) return;

  let digimonButton = root.querySelector(".dda-open-digimon-wizard");

  if (!digimonButton) {
    digimonButton = document.createElement("button");
    digimonButton.type = "button";
    digimonButton.classList.add("dda-open-digimon-wizard");

    digimonButton.addEventListener("click", () => {
      new game.dda.applications.DDADigimonWizard().render(true);
    });

    target.prepend(digimonButton);
  }

  digimonButton.innerHTML = `
  <img
    class="dda-directory-action-icon"
    src="systems/digimon-digital-adventures/assets/ui/digimon.svg"
    alt=""
  />
  <span>${game.i18n.localize("DDA.Wizard.CreatePartnerDigimon")}</span>
`;

  let tamerButton = root.querySelector(".dda-open-tamer-wizard");

  if (!tamerButton) {
    tamerButton = document.createElement("button");
    tamerButton.type = "button";
    tamerButton.classList.add("dda-open-tamer-wizard");

    tamerButton.addEventListener("click", () => {
      new game.dda.applications.DDATamerWizard().render(true);
    });

    target.prepend(tamerButton);
  }

  tamerButton.innerHTML = `
  <img
    class="dda-directory-action-icon"
    src="systems/digimon-digital-adventures/assets/ui/tamer.svg"
    alt=""
  />
  <span>${game.i18n.localize("DDA.Wizard.CreateTamer")}</span>
`;
});

async function rechargeQualityUses(actor, rechargeType) {
  const normalizedRechargeType = normalizeRechargeType(rechargeType);
  const entries = [];

  for (const item of actor.items) {
    if (item.type !== "quality") continue;
    if (!item.system.uses?.enabled) continue;

    const itemRechargeType = normalizeRechargeType(item.system.uses?.recharge);

    if (itemRechargeType !== normalizedRechargeType) continue;

    const currentValue = Number(item.system.uses.value ?? 0);
    const maxValue = Number(item.system.uses.max ?? 0);

    if (maxValue <= 0) continue;
    if (currentValue >= maxValue) continue;

    await item.update({
      "system.uses.value": maxValue
    });

    entries.push({
      id: item.id,
      name: item.name,
      oldValue: currentValue,
      newValue: maxValue,
      maxValue,
      recharge: item.system.uses?.recharge
    });
  }

  return {
    changed: entries.length > 0,
    entries
  };
}

function normalizeRechargeType(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const aliases = {
    turn: "turn",
    turno: "turn",

    round: "round",
    rodada: "round",

    scene: "scene",
    cena: "scene",

    session: "session",
    sessao: "session",

    rest: "rest",
    descanso: "rest",

    special: "special",
    especial: "special"
  };

  return aliases[key] ?? key;
}
Hooks.on("updateCombat", async (combat, changed) => {
  if (!combat?.combatants?.size) return;

  const roundChanged = "round" in changed;
  const turnChanged = "turn" in changed;
  const activeChanged = "active" in changed;

  if (!roundChanged && !turnChanged && !activeChanged) return;

  const currentRound = Number(combat.round ?? 0);
  if (currentRound < 1) return;

  const alreadyRecharged = await combat.getFlag(game.system.id, "tamerTalentCombatRechargeDone");
  if (alreadyRecharged) return;

  await combat.setFlag(game.system.id, "tamerTalentCombatRechargeDone", true);

  await rechargeTamerTalentsForCombat(combat);
});

async function rechargeTamerTalentsForCombat(combat) {
  const tamers = await getTamersFromCombat(combat);
  const rechargeEntries = [];

  for (const tamer of tamers) {
    const officialRecharge = await rechargeOfficialTamerTalentsByType(tamer, "combat");
    const homebrewRecharge = await rechargeHomebrewTamerTalentsByType(tamer, "combat");

    if (officialRecharge.length || homebrewRecharge.length) {
      rechargeEntries.push({
        actor: tamer,
        entries: [...officialRecharge, ...homebrewRecharge]
      });

      tamer.sheet?.render(false);
    }
  }

  if (!rechargeEntries.length) return;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-tamer-talent-recharge-card">
        <h2>${game.i18n.localize("DDA.Combat.StartOfCombat")}</h2>

        <p>
          ${game.i18n.localize("DDA.Combat.TamerTalentCombatUsesRestored")}
        </p>

        <ul class="dda-effect-list dda-tamer-talent-recharge-list">
          ${rechargeEntries.map((actorEntry) => {
            return `
              <li>
                <strong>${actorEntry.actor.name}</strong>:
                ${actorEntry.entries.map((entry) => {
                  return `<span><strong>${entry.name}</strong> ${entry.oldValue} → ${entry.newValue}</span>`;
                }).join(" ")}
              </li>
            `;
          }).join("")}
        </ul>
      </div>
    `
  });
}

async function getTamersFromCombat(combat) {
  const tamers = new Map();

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;

    if (!actor) continue;

    if (actor.type === "character") {
      tamers.set(actor.uuid, actor);
      continue;
    }

    if (actor.type === "digimon" || actor.type === "npc") {
      const tamer = await getLinkedTamerFromDigimon(actor);

      if (tamer?.type === "character") {
        tamers.set(tamer.uuid, tamer);
      }
    }
  }

  return Array.from(tamers.values());
}

async function getLinkedTamerFromDigimon(actor) {
  const tamerUuid = actor.system.tamer?.uuid;

  if (!tamerUuid) return null;

  try {
    const tamer = await fromUuid(tamerUuid);

    if (tamer?.documentName === "Actor") {
      return tamer;
    }
  } catch (error) {
    console.warn(game.i18n.localize("DDA.Warning.CouldNotResolveLinkedTamer"), error);
  }

  return null;
}

async function rechargeOfficialTamerTalentsByType(actor, rechargeType) {
  const updates = {};
  const entries = [];

  for (const talent of DDA_TAMER_TALENTS) {
    const uses = talent.uses ?? {};

    if (!uses.enabled) continue;
    if (uses.recharge !== rechargeType) continue;

    const max = getTamerTalentUsesMax(
      actor,
      talent
    );

    if (max <= 0) continue;

    const oldValue = Number(
      actor.system.tamerTalentUses?.[talent.id]?.value ?? max
    );

    if (oldValue >= max) continue;

    updates[`system.tamerTalentUses.${talent.id}.value`] = max;
    updates[`system.tamerTalentUses.${talent.id}.max`] = max;
    updates[`system.tamerTalentUses.${talent.id}.recharge`] = uses.recharge;

    entries.push({
      id: talent.id,
      name: talent.name,
      oldValue,
      newValue: max,
      source: "official"
    });
  }

  if (Object.keys(updates).length) {
    await actor.update(updates);
  }

  return entries;
}

async function rechargeHomebrewTamerTalentsByType(actor, rechargeType) {
  const updates = [];
  const entries = [];

  for (const item of actor.items) {
    if (item.type !== "tamerTalent") continue;
    if (!item.system.uses?.enabled) continue;

    const itemRechargeType = String(item.system.uses?.recharge ?? "");

    if (itemRechargeType !== rechargeType) continue;

    const oldValue = Number(item.system.uses.value ?? 0);
    const max = Number(item.system.uses.max ?? 0);

    if (max <= 0) continue;
    if (oldValue >= max) continue;

    updates.push({
      _id: item.id,
      "system.uses.value": max
    });

    entries.push({
      id: item.id,
      name: item.name,
      oldValue,
      newValue: max,
      source: "homebrew"
    });
  }

  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }

  return entries;
}
Hooks.once("ready", () => {
  console.log("DDA | READY FINAL chamado.");

  game.dda = game.dda ?? {};
  game.dda.config = game.dda.config ?? DDA;

  game.dda.applications = game.dda.applications ?? {};
  game.dda.applications.DDADigimonWizard = DDADigimonWizard;

  game.dda.DDADigimonWizard = DDADigimonWizard;

  console.log("DDA | game.dda:", game.dda);
  console.log("DDA | DDADigimonWizard registrado em applications:", game.dda.applications.DDADigimonWizard);
  console.log("DDA | DDADigimonWizard registrado direto:", game.dda.DDADigimonWizard);
});
