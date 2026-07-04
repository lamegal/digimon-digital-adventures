import { executeJogressEvolution, endJogressEvolution } from "../combat/evolution.js";

function localize(key) {
  return game.i18n.localize(key);
}

function normalizeName(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_\-:()]+/g, "")
    .trim();
}

function normalizeUuid(value = "") {
  return String(value ?? "").trim();
}

async function resolveActor(uuid) {
  const cleanUuid = normalizeUuid(uuid);
  if (!cleanUuid) return null;

  try {
    const document = await fromUuid(cleanUuid);
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Could not resolve actor UUID:", cleanUuid, error);
    return null;
  }
}

function getStageLabel(stageKey = "") {
  const stage = CONFIG.DDA?.stages?.[stageKey];
  const label = stage?.label ?? stageKey;

  return label ? localize(label) : "";
}

function matchesRequirement(actor, requirement = {}) {
  if (!actor) return false;

  const actorUuid = normalizeUuid(actor.uuid ?? "");
  const actorName = normalizeName(actor.name);
  const actorSpecies = normalizeName(actor.system?.species ?? "");
  const actorStage = String(actor.system?.stage ?? "").trim();

  const requiredUuid = normalizeUuid(
    requirement.uuid ?? requirement.actorUuid ?? ""
  );
  const requiredName = normalizeName(requirement.name ?? "");
  const requiredSpecies = normalizeName(requirement.species ?? "");
  const requiredStage = String(requirement.stage ?? "").trim();

  if (requiredUuid && actorUuid !== requiredUuid) return false;
  if (requiredStage && actorStage !== requiredStage) return false;

  if (requiredSpecies) {
    return actorSpecies === requiredSpecies ||
      actorName === requiredSpecies;
  }

  if (requiredName) {
    return actorName === requiredName ||
      actorSpecies === requiredName;
  }

  return Boolean(requiredUuid || requiredStage);
}

async function resolveActorFromDropData(data) {
  if (!data) return null;

  if (data.uuid) {
    const actor = await resolveActor(data.uuid);
    if (actor) return actor;
  }

  if (data.id) {
    return game.actors?.get(data.id) ?? null;
  }

  return null;
}

function getDdaTextEditor() {
  return globalThis.foundry?.applications?.ux?.TextEditor?.implementation ?? null;
}

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const DDAGroupSheetBase = HandlebarsApplicationMixin(ActorSheetV2);

export class DDAGroupSheet extends DDAGroupSheetBase {
  static DEFAULT_OPTIONS = {
    classes: [
      "dda",
      "sheet",
      "actor",
      "group",
      "dda-group-sheet-window",
      "dda-group-sheet"
    ],
    position: {
      width: 920,
      height: 760
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true
    },
    window: {
      resizable: true
    },
    actions: {
      groupEditPortrait: DDAGroupSheet._onActionEditPortrait,
      groupRemoveMember: DDAGroupSheet._onActionRemoveMember,
      groupOpenTamer: DDAGroupSheet._onActionOpenTamer,
      groupOpenPartner: DDAGroupSheet._onActionOpenPartner,
      groupOpenForm: DDAGroupSheet._onActionOpenForm,
      groupExecuteJogress: DDAGroupSheet._onActionExecuteJogress,
      groupEndJogress: DDAGroupSheet._onActionEndJogress
    }
  };

  static PARTS = {
    form: {
      template: "systems/digimon-digital-adventures/templates/actor/group-sheet.html"
    }
  };

  static TABS = {
    primary: {
      initial: "party",
      tabs: [
        { id: "party" },
        { id: "jogress" },
        { id: "notes" }
      ]
    }
  };

  /**
   * ApplicationV2 handles forms on the outer DocumentSheetV2 form. The
   * Handlebars template therefore returns only the sheet content, not a nested
   * <form>, and document fields retain their existing name paths.
   */
  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);

    context.cssClass = "dda sheet actor group dda-group-sheet-window dda-group-sheet";
    context.actor = this.actor;
    context.system = this.actor.system;

    // ActorSheetV2 prepares these, but retaining this fallback makes the
    // template resilient if Foundry is asked to render a partial context.
    context.tabs ??= {};
    context.tabs.primary ??= this._prepareTabs("primary");

    context.members = await this._getMemberViewData();
    context.jogressRecipes = await this._getJogressRecipeViewData(context.members);
    context.activeJogressStates = await this._getActiveJogressViewData(context.members);

    context.hasMembers = context.members.length > 0;
    context.hasJogressRecipes = context.jogressRecipes.length > 0;
    context.hasActiveJogressStates = context.activeJogressStates.length > 0;

    return context;
  }

  /**
   * Click listeners use ApplicationV2 actions. Drag/drop remains a native DOM
   * workflow because it is not a click action.
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.element;
    if (!root) return;

    // As abas continuam usando a API V2, mas este binding explícito garante que
    // o template próprio do sistema mantenha a troca visual mesmo fora dos
    // estilos nativos de uma ficha core.
    const activePrimaryTab = this.tabGroups.primary ?? "party";
    this._syncGroupTabDom(root, "primary", activePrimaryTab);

    for (const tab of root.querySelectorAll(".sheet-tabs [data-group][data-tab]")) {
      tab.addEventListener("click", this._onGroupTabClick.bind(this));
    }

    for (const dropZone of root.querySelectorAll(".dda-group-drop-zone")) {
      dropZone.addEventListener("dragover", this._onMemberDragOver.bind(this));
      dropZone.addEventListener("dragleave", this._onMemberDragLeave.bind(this));
      dropZone.addEventListener("drop", this._onMemberDrop.bind(this));
    }
  }

  _onGroupTabClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    const group = target?.dataset?.group ?? "primary";
    const tab = target?.dataset?.tab ?? "";
    if (!tab) return;

    // Registra o estado antes de atualizar o DOM. Assim a aba persiste em
    // qualquer render posterior da ficha.
    this.tabGroups[group] = tab;
    this.changeTab(tab, group, {
      event,
      force: true,
      updatePosition: false
    });

    this._syncGroupTabDom(this.element, group, tab);
  }

  _syncGroupTabDom(root, group, activeTab) {
    if (!root) return;

    for (const element of root.querySelectorAll("[data-group][data-tab]")) {
      if (element.dataset.group !== group) continue;
      element.classList.toggle("active", element.dataset.tab === activeTab);
    }
  }

  static async _onActionEditPortrait(event, target) {
    return this._onEditPortrait(event, target);
  }

  static async _onActionRemoveMember(event, target) {
    return this._onRemoveMember(event, target);
  }

  static async _onActionOpenTamer(event, target) {
    return this._onOpenTamer(event, target);
  }

  static async _onActionOpenPartner(event, target) {
    return this._onOpenPartner(event, target);
  }

  static async _onActionOpenForm(event, target) {
    return this._onOpenCurrentForm(event, target);
  }

  static async _onActionExecuteJogress(event, target) {
    return this._onExecuteJogress(event, target);
  }

  static async _onActionEndJogress(event, target) {
    return this._onEndJogress(event, target);
  }

  async _getMemberViewData() {
    const rawMembers = Array.isArray(this.actor.system.party?.members)
      ? this.actor.system.party.members
      : [];

    const members = [];

    for (const entry of rawMembers) {
      const tamer = await resolveActor(entry.uuid);

      if (!tamer || tamer.type !== "character") {
        members.push({
          uuid: entry.uuid,
          name: entry.name || localize("DDA.Group.MissingTamer"),
          missing: true,
          hasPartner: false,
          hasCurrentForm: false,
          evolutionCount: 0,
          nextForms: []
        });
        continue;
      }

      const partnerUuid = tamer.system.partner?.uuid ?? "";
      const currentFormTemplateUuid = tamer.system.partner?.currentFormUuid || partnerUuid;
      const partner = await resolveActor(partnerUuid);
      const currentFormTemplate = await resolveActor(currentFormTemplateUuid);
      const currentFormActor = partner ?? currentFormTemplate;
      const evolutionData = await this._getEvolutionGraphSummary(currentFormTemplate ?? partner);

      members.push({
        uuid: tamer.uuid,
        name: tamer.name,
        img: tamer.img,
        missing: false,
        tamer,
        partnerUuid,
        partnerName: partner?.name ?? tamer.system.partner?.name ?? "",
        partnerImg: partner?.img ?? "icons/svg/mystery-man.svg",
        currentFormUuid: currentFormActor?.uuid ?? partnerUuid,
        currentFormTemplateUuid,
        currentFormName: currentFormActor?.system?.species || currentFormActor?.name || tamer.system.partner?.currentFormName || partner?.name || "",
        currentFormImg: currentFormActor?.img ?? partner?.img ?? currentFormTemplate?.img ?? "icons/svg/mystery-man.svg",
        currentFormStage: currentFormActor?.system?.stage ?? currentFormTemplate?.system?.stage ?? "",
        currentFormStageLabel: getStageLabel(currentFormActor?.system?.stage ?? currentFormTemplate?.system?.stage ?? ""),
        hasPartner: Boolean(partner),
        hasCurrentForm: Boolean(currentFormActor),
        evolutionCount: evolutionData.count,
        hasEvolutionGraph: evolutionData.hasGraph,
        nextForms: evolutionData.nextForms,
        digimonActor: currentFormActor ?? null
      });
    }

    return members;
  }

  async _getEvolutionGraphSummary(digimonActor) {
    const graph = digimonActor?.system?.evolutionGraph;

    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !graph.nodes.length) {
      return { hasGraph: false, count: 0, nextForms: [] };
    }

    const currentNode = graph.nodes.find((node) => node.actorUuid === digimonActor.uuid) ?? graph.nodes[0];
    const outgoingEdges = graph.edges.filter((edge) => edge.from === currentNode?.id);
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nextForms = [];

    for (const edge of outgoingEdges.slice(0, 8)) {
      const node = nodeById.get(edge.to);
      if (!node?.actorUuid) continue;

      const actor = await resolveActor(node.actorUuid);
      nextForms.push({
        uuid: node.actorUuid,
        name: actor?.name ?? node.name ?? localize("DDA.Group.UnknownForm"),
        stage: actor?.system?.stage ?? node.stage ?? "",
        stageLabel: getStageLabel(actor?.system?.stage ?? node.stage ?? ""),
        method: edge.method ?? edge.type ?? "normal"
      });
    }

    return {
      hasGraph: true,
      count: graph.edges.length,
      nextForms
    };
  }

  async _getActiveJogressViewData(members) {
    const stateMap = new Map();

    for (const member of members) {
      const state = member.tamer?.system?.specialEvolutions?.jogress?.state ?? {};
      if (!state.active) continue;

      const key = state.historyKey || state.recipeId || state.resultUuid || member.uuid;
      if (stateMap.has(key)) continue;

      const resultActor = await resolveActor(state.resultUuid);
      const primaryTamer = await resolveActor(state.primaryTamerUuid);
      const secondaryTamer = await resolveActor(state.secondaryTamerUuid);
      const primaryDigimon = await resolveActor(state.primaryDigimonUuid);
      const secondaryDigimon = await resolveActor(state.secondaryDigimonUuid);

      stateMap.set(key, {
        key,
        resultUuid: resultActor?.uuid ?? state.resultUuid ?? "",
        resultName: resultActor?.name ?? state.resultName ?? localize("DDA.Jogress.UnknownResult"),
        resultImg: resultActor?.img ?? "icons/svg/upgrade.svg",
        primaryTamerUuid: primaryTamer?.uuid ?? state.primaryTamerUuid ?? "",
        primaryTamerName: primaryTamer?.name ?? state.primaryTamerName ?? localize("DDA.Jogress.UnknownTamer"),
        secondaryTamerName: secondaryTamer?.name ?? state.secondaryTamerName ?? localize("DDA.Jogress.UnknownTamer"),
        primaryDigimonName: primaryDigimon?.name ?? state.primaryDigimonName ?? localize("DDA.Jogress.UnknownDigimon"),
        secondaryDigimonName: secondaryDigimon?.name ?? state.secondaryDigimonName ?? localize("DDA.Jogress.UnknownDigimon"),
        sharedInitiative: Number(state.sharedInitiative ?? 0),
        componentBonusDp: Number(state.componentBonusDp ?? 0),
        firstSuccessfulUse: Boolean(state.firstSuccessfulUse)
      });
    }

    return Array.from(stateMap.values());
  }

  async _getJogressRecipeViewData(members) {
    const configRecipes = Array.isArray(CONFIG.DDA?.jogressRecipes) ? CONFIG.DDA.jogressRecipes : [];
    const globalRecipes = Array.isArray(game.dda?.jogressRecipes) ? game.dda.jogressRecipes : [];
    const actorRecipes = Array.isArray(this.actor.system.specialEvolutions?.jogress?.recipes)
      ? this.actor.system.specialEvolutions.jogress.recipes
      : [];

    const recipeMap = new Map();

    for (const recipe of [...configRecipes, ...globalRecipes, ...actorRecipes]) {
      const normalized = this._normalizeJogressRecipe(recipe);
      if (!normalized?.id) continue;
      recipeMap.set(normalized.id, normalized);
    }

    const recipes = [];

    for (const recipe of recipeMap.values()) {
      if (recipe.hidden) continue;

      const components = recipe.components.map((component) => {
        const match = members.find((member) => {
          return member.digimonActor && matchesRequirement(member.digimonActor, component);
        });

        return {
          label: component.species || component.name || component.uuid || localize("DDA.Group.UnknownRequirement"),
          role: component.role || "component",
          matched: Boolean(match),
          memberName: match?.name ?? "",
          digimonName: match?.currentFormName ?? "",
          tamerUuid: match?.uuid ?? ""
        };
      });

      const resultActor = await this._resolveJogressResultActor(recipe);
      const allComponentsMatched = components.length > 0 && components.every((component) => component.matched);
      const primaryComponent = components.find((component) => component.role === "primary" && component.tamerUuid) ?? components.find((component) => component.tamerUuid);

      recipes.push({
        id: recipe.id,
        label: recipe.label,
        resultName: resultActor?.name ?? recipe.result?.name ?? recipe.label,
        resultImg: resultActor?.img ?? "icons/svg/upgrade.svg",
        resultFound: Boolean(resultActor),
        components,
        available: allComponentsMatched && Boolean(resultActor),
        primaryTamerUuid: primaryComponent?.tamerUuid ?? "",
        missingReason: !allComponentsMatched
          ? localize("DDA.Group.JogressMissingComponents")
          : (!resultActor ? localize("DDA.Group.JogressMissingResult") : "")
      });
    }

    return recipes;
  }

  _normalizeJogressRecipe(recipe) {
    if (!recipe || typeof recipe !== "object") return null;

    const id = String(recipe.id ?? recipe.key ?? recipe.label ?? recipe.result?.name ?? "").trim();
    if (!id) return null;

    return {
      id,
      label: String(recipe.label ?? recipe.name ?? recipe.result?.name ?? id).trim(),
      result: recipe.result ?? {},
      components: Array.isArray(recipe.components) ? recipe.components : [],
      hidden: Boolean(recipe.hidden)
    };
  }

  async _resolveJogressResultActor(recipe) {
    const result = recipe?.result ?? {};
    const resultUuid = normalizeUuid(result.uuid ?? result.actorUuid ?? "");

    if (resultUuid) {
      const actor = await resolveActor(resultUuid);
      if (actor) return actor;
    }

    const resultName = normalizeName(result.name ?? recipe?.label ?? "");
    const resultSpecies = normalizeName(result.species ?? result.name ?? recipe?.label ?? "");

    return Array.from(game.actors ?? []).find((actor) => {
      if (!actor || actor.type !== "digimon") return false;

      const actorName = normalizeName(actor.name);
      const actorSpecies = normalizeName(actor.system?.species ?? "");

      return (resultName && (actorName === resultName || actorSpecies === resultName)) ||
        (resultSpecies && (actorName === resultSpecies || actorSpecies === resultSpecies));
    }) ?? null;
  }

_onMemberDragOver(event) {
    event.preventDefault();
    event.currentTarget?.classList?.add("drag-hover");
  }

  _onMemberDragLeave(event) {
    event.preventDefault();
    event.currentTarget?.classList?.remove("drag-hover");
  }

  async _onMemberDrop(event) {
    event.preventDefault();
    event.currentTarget?.classList?.remove("drag-hover");

    const TextEditor = getDdaTextEditor();

    if (!TextEditor) {
      ui.notifications.warn("DDA | TextEditor implementation is unavailable.");
      return;
    }

    const data = TextEditor.getDragEventData(event);
    const actor = await resolveActorFromDropData(data);

    if (!actor) {
      ui.notifications.warn(localize("DDA.Group.Warning.DropActorNotFound"));
      return;
    }

    if (actor.type !== "character") {
      ui.notifications.warn(localize("DDA.Group.Warning.DropOnlyTamer"));
      return;
    }

    const members = Array.isArray(this.actor.system.party?.members)
      ? foundry.utils.deepClone(this.actor.system.party.members)
      : [];

    if (members.some((member) => member.uuid === actor.uuid)) {
      ui.notifications.info(localize("DDA.Group.Warning.TamerAlreadyInGroup"));
      return;
    }

    members.push({ uuid: actor.uuid, name: actor.name });
    await this.actor.update({ "system.party.members": members });
    await this.render();
  }

  async _onRemoveMember(event, target = event.currentTarget) {
    event.preventDefault();

    const uuid = target?.dataset?.uuid ?? "";
    if (!uuid) return;

    const members = Array.isArray(this.actor.system.party?.members)
      ? this.actor.system.party.members.filter((member) => member.uuid !== uuid)
      : [];

    await this.actor.update({ "system.party.members": members });
    await this.render();
  }

  async _onOpenTamer(event, target = event.currentTarget) {
    event.preventDefault();
    const actor = await resolveActor(target?.dataset?.uuid ?? "");
    actor?.sheet?.render(true);
  }

  async _onOpenPartner(event, target = event.currentTarget) {
    event.preventDefault();
    const actor = await resolveActor(target?.dataset?.uuid ?? "");
    actor?.sheet?.render(true);
  }

  async _onOpenCurrentForm(event, target = event.currentTarget) {
    event.preventDefault();
    const actor = await resolveActor(target?.dataset?.uuid ?? "");
    actor?.sheet?.render(true);
  }

  async _onExecuteJogress(event, target = event.currentTarget) {
    event.preventDefault();

    const tamer = await resolveActor(target?.dataset?.primaryTamerUuid ?? "");

    if (!tamer || tamer.type !== "character") {
      ui.notifications.warn(localize("DDA.Group.Warning.PrimaryTamerNotFound"));
      return;
    }

    await executeJogressEvolution(tamer);
    await this.render();
  }

  async _onEndJogress(event, target = event.currentTarget) {
    event.preventDefault();

    const tamer = await resolveActor(target?.dataset?.primaryTamerUuid ?? "");

    if (!tamer || tamer.type !== "character") {
      ui.notifications.warn(localize("DDA.Group.Warning.PrimaryTamerNotFound"));
      return;
    }

    await endJogressEvolution(tamer);
    await this.render();
  }

  async _onEditPortrait(event) {
    event.preventDefault();
    event.stopPropagation();

    const FilePickerClass =
      globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? null;

    if (!FilePickerClass) {
      ui.notifications.warn("DDA | FilePicker implementation is unavailable.");
      return;
    }

    const picker = new FilePickerClass({
      type: "image",
      current: this.actor.img,
      callback: async (path) => {
        if (!path) return;
        await this.actor.update({ img: path });
        await this.render();
      }
    });

    picker.render(true);
  }
}
