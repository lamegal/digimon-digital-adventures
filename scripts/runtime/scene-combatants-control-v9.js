const SYSTEM_ID = "digimon-digital-adventures";
const TOOL_NAME = "dda-scene-combatants-v9";
const LEGACY_TOOL_NAMES = new Set(["dda-scene-combatants", "dda-scene-combatants-v8"]);
const SUPPORTED_ACTOR_TYPES = new Set(["character", "digimon", "npc"]);
const RUNTIME_KEY = "__ddaSceneCombatantsControlV9";

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
}

function sceneIdOfCombat(combat) {
  return String(
    combat?.scene?.id ??
    combat?._source?.scene ??
    combat?.scene ??
    ""
  );
}

function currentSceneCombats() {
  const sceneId = String(canvas?.scene?.id ?? "");
  if (!sceneId) return [];
  return Array.from(game?.combats?.contents ?? [])
    .filter((combat) => sceneIdOfCombat(combat) === sceneId);
}

async function ensureSceneCombat() {
  const sceneId = String(canvas?.scene?.id ?? "");
  if (!sceneId) return null;

  const viewed = game?.combat;
  if (viewed && sceneIdOfCombat(viewed) === sceneId) {
    if (!viewed.isActive) await viewed.activate();
    return viewed;
  }

  const combats = currentSceneCombats();
  let combat = combats.find((candidate) => candidate.isActive)
    ?? combats.find((candidate) => !candidate.started)
    ?? combats[0]
    ?? null;

  if (!combat) {
    // Use the configured System Combat class. Calling foundry.documents.Combat
    // directly can bypass a System subclass such as DDACombat.
    const CombatClass = CONFIG?.Combat?.documentClass ?? globalThis.Combat ?? foundry.documents.Combat;
    combat = await CombatClass.create({ scene: sceneId, active: true });
    return combat ?? null;
  }

  if (!combat.isActive) await combat.activate();
  return combat;
}

function isEligibleTokenDocument(document) {
  const actor = document?.actor;
  return Boolean(
    document &&
    actor &&
    document.hidden !== true &&
    SUPPORTED_ACTOR_TYPES.has(String(actor.type ?? ""))
  );
}

function selectedVisibleTokenDocuments() {
  return Array.from(canvas?.tokens?.controlled ?? [])
    .map((token) => token?.document)
    .filter(isEligibleTokenDocument);
}

function allVisibleSceneTokenDocuments() {
  return Array.from(canvas?.scene?.tokens?.contents ?? [])
    .filter(isEligibleTokenDocument);
}

function tokenAlreadyInCombat(document, combat) {
  const sceneId = String(canvas?.scene?.id ?? "");
  const tokenId = String(document?.id ?? "");
  return Boolean(combat?.combatants?.some?.((combatant) => {
    const combatantTokenId = String(combatant?.tokenId ?? combatant?.token?.id ?? "");
    const combatantSceneId = String(
      combatant?.sceneId ??
      combatant?.token?.parent?.id ??
      combatant?.token?.scene?.id ??
      sceneId
    );
    return combatantTokenId === tokenId && combatantSceneId === sceneId;
  }));
}

async function addTokenDocumentsToCombat(tokenDocuments, { source = "scene" } = {}) {
  if (!game?.user?.isGM) return [];

  const unique = Array.from(new Map(
    tokenDocuments
      .filter(isEligibleTokenDocument)
      .map((document) => [String(document.id), document])
  ).values());

  if (!unique.length) {
    ui.notifications.info(source === "selection"
      ? text(
          "Nenhum token selecionado e visível pode ser adicionado. Se preferir, use ‘Todos visíveis’ no próprio Combat Tracker.",
          "No selected visible token can be added. You can use ‘All visible’ directly in the Combat Tracker instead."
        )
      : text(
          "Não há combatentes visíveis elegíveis nesta Cena.",
          "There are no eligible visible combatants in this Scene."
        ));
    return [];
  }

  const combat = await ensureSceneCombat();
  if (!combat) {
    ui.notifications.error(text(
      "Não foi possível criar ou localizar um Encontro para esta Cena.",
      "Could not create or locate an Encounter for this Scene."
    ));
    return [];
  }

  const pending = unique.filter((document) => !tokenAlreadyInCombat(document, combat));
  if (!pending.length) {
    ui.notifications.info(text(
      "Todos esses combatentes já estão no Combat Tracker.",
      "All of those combatants are already in the Combat Tracker."
    ));
    return [];
  }

  const created = await foundry.documents.TokenDocument.createCombatants(pending, { combat });
  const count = Array.isArray(created) ? created.length : 0;

  ui.notifications.info(text(
    `${count} combatente${count === 1 ? "" : "s"} adicionado${count === 1 ? "" : "s"} ao Combat Tracker. Tokens invisíveis foram ignorados.`,
    `${count} combatant${count === 1 ? "" : "s"} added to the Combat Tracker. Hidden tokens were ignored.`
  ));

  // Give the initiative runtime a chance to classify the new combatants before
  // the tracker redraw finishes.
  try {
    await (game?.dda?.initiativeV10 ?? game?.dda?.initiativeV9 ?? game?.dda?.initiativeV8)?.synchronize?.(combat);
  } catch (_error) {
    // The combatants can still be added before initiative has been rolled.
  }
  ui.combat?.render?.({ force: true });
  return created ?? [];
}

function tokenToolsRecord(controls) {
  if (controls?.tokens?.tools && !Array.isArray(controls.tokens.tools)) {
    return controls.tokens.tools;
  }
  return null;
}

function installTool(controls) {
  if (!game?.user?.isGM) return;

  const tool = {
    name: TOOL_NAME,
    title: text(
      "DDA: adicionar combatentes — clique: selecionados; botão direito: todos os visíveis",
      "DDA: add combatants — click: selected; right-click: all visible"
    ),
    icon: "fa-solid fa-users",
    order: 3,
    button: true,
    visible: true,
    onChange: () => {
      void addTokenDocumentsToCombat(selectedVisibleTokenDocuments(), { source: "selection" });
    }
  };

  const tools = tokenToolsRecord(controls);
  if (tools) {
    for (const name of LEGACY_TOOL_NAMES) delete tools[name];
    tools[TOOL_NAME] = tool;
    return;
  }

  // Compatibility fallback for any alternate SceneControl collection shape.
  const tokenControls = Array.isArray(controls)
    ? controls.find((control) => ["token", "tokens"].includes(String(control?.name ?? "")))
    : null;
  if (!tokenControls?.tools) return;

  if (Array.isArray(tokenControls.tools)) {
    tokenControls.tools = tokenControls.tools.filter((entry) => !LEGACY_TOOL_NAMES.has(String(entry?.name ?? "")) && String(entry?.name ?? "") !== TOOL_NAME);
    tokenControls.tools.push(tool);
  } else {
    for (const name of LEGACY_TOOL_NAMES) delete tokenControls.tools[name];
    tokenControls.tools[TOOL_NAME] = tool;
  }
}

function rootElement(value) {
  if (value instanceof HTMLElement) return value;
  if (value?.[0] instanceof HTMLElement) return value[0];
  return null;
}

const contextBoundRoots = new WeakSet();
function bindRightClickContext(app, html) {
  if (!game?.user?.isGM) return;
  const root = rootElement(html) ?? rootElement(app?.element) ?? document.querySelector("#scene-controls");
  if (!root) return;

  // If the cached legacy registrar also added its old tool, never show both.
  for (const name of LEGACY_TOOL_NAMES) root.querySelector(`[data-tool="${name}"]`)?.remove();

  if (contextBoundRoots.has(root)) return;
  const selector = `[data-tool="${TOOL_NAME}"]`;
  if (!root.querySelector(selector)) return;
  contextBoundRoots.add(root);

  const ContextMenu = foundry.applications?.ux?.ContextMenu;
  if (ContextMenu) {
    new ContextMenu(root, selector, [
      {
        name: text(
          "Adicionar todos os combatentes visíveis da Cena",
          "Add all visible Scene combatants"
        ),
        icon: '<i class="fa-solid fa-users"></i>',
        condition: () => allVisibleSceneTokenDocuments().length > 0,
        callback: () => {
          void addTokenDocumentsToCombat(allVisibleSceneTokenDocuments(), { source: "scene" });
        }
      }
    ], { fixed: true, eventName: "contextmenu" });
    return;
  }

  root.addEventListener("contextmenu", (event) => {
    const button = event.target?.closest?.(selector);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    void addTokenDocumentsToCombat(allVisibleSceneTokenDocuments(), { source: "scene" });
  });
}

const trackerBoundRoots = new WeakSet();

function trackerRoot(app, html) {
  return rootElement(html)
    ?? rootElement(app?.element)
    ?? document.querySelector("#combat")
    ?? document.querySelector(".combat-tracker");
}

function updateSelectedCount(root = document) {
  const count = selectedVisibleTokenDocuments().length;
  for (const target of root.querySelectorAll?.("[data-dda-selected-count]") ?? []) {
    target.textContent = String(count);
  }
}

function installTrackerCombatantControls(app, html) {
  if (!game?.user?.isGM) return;
  const root = trackerRoot(app, html);
  if (!root) return;

  let panel = root.querySelector(".dda-combatant-add-controls-v9");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "dda-combatant-add-controls-v9";
    panel.innerHTML = `
      <button type="button" class="dda-add-combatants-button" data-dda-add-combatants="selected"
        title="${text("Adicionar ao encontro os tokens atualmente selecionados na Cena", "Add the currently selected Scene tokens to the Encounter")}">
        <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
        <span>${text("Selecionados", "Selected")}</span>
        <span class="dda-add-combatants-count" data-dda-selected-count>0</span>
      </button>
      <button type="button" class="dda-add-combatants-button" data-dda-add-combatants="all"
        title="${text("Adicionar todos os tokens visíveis elegíveis desta Cena", "Add all eligible visible tokens in this Scene")}">
        <i class="fa-solid fa-users" aria-hidden="true"></i>
        <span>${text("Todos visíveis", "All visible")}</span>
      </button>
    `;

    const target = root.querySelector(".combat-tracker-header")
      ?? root.querySelector(".directory-header")
      ?? root.querySelector("header")
      ?? root;
    target.append(panel);
  }

  updateSelectedCount(root);
  if (trackerBoundRoots.has(root)) return;
  trackerBoundRoots.add(root);

  root.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-dda-add-combatants]");
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = button.dataset.ddaAddCombatants;
    if (mode === "selected") {
      void addTokenDocumentsToCombat(selectedVisibleTokenDocuments(), { source: "selection" });
    } else if (mode === "all") {
      void addTokenDocumentsToCombat(allVisibleSceneTokenDocuments(), { source: "scene" });
    }
  });
}

function registerRuntime() {
  if (globalThis[RUNTIME_KEY]) return;
  globalThis[RUNTIME_KEY] = true;

  // Register immediately: this is the lifecycle used by core/system examples.
  Hooks.on("getSceneControlButtons", installTool);

  // dda.js from an older cached hotfix can register the legacy tool during
  // `init`. Register our installer once more afterwards so v9 is authoritative.
  Hooks.once("init", () => {
    Hooks.on("getSceneControlButtons", installTool);
  });

  Hooks.on("renderSceneControls", bindRightClickContext);
  Hooks.on("renderCombatTracker", installTrackerCombatantControls);
  Hooks.on("controlToken", () => updateSelectedCount());
  Hooks.on("canvasReady", () => updateSelectedCount());

  Hooks.once("ready", () => {
    game.dda ??= {};
    game.dda.sceneCombatantsV9 = {
      addSelected: () => addTokenDocumentsToCombat(selectedVisibleTokenDocuments(), { source: "selection" }),
      addAllVisible: () => addTokenDocumentsToCombat(allVisibleSceneTokenDocuments(), { source: "scene" })
    };

    // Rebuild the Scene Controls once so an already-open world receives the
    // newly registered button in its native location immediately.
    try {
      ui.controls?.render?.({ force: true, reset: true });
    } catch (_error) {
      ui.controls?.render?.({ force: true });
    }
    ui.combat?.render?.({ force: true });
  });
}

registerRuntime();
