const DDA_SYSTEM_ID = "digimon-digital-adventures";

const DDA_PARTNER_STAGE_ORDER = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate",
  "ultimatePlus"
];

function localize(key) {
  return game.i18n.localize(key);
}

function stageLabel(stageKey = "") {
  const configLabel = CONFIG.DDA?.stages?.[stageKey]?.label;
  if (configLabel) return localize(configLabel);

  const fallbackKey = {
    baby1: "DDA.Stage.Baby1",
    baby2: "DDA.Stage.Baby2",
    child: "DDA.Stage.Child",
    adult: "DDA.Stage.Adult",
    perfect: "DDA.Stage.Perfect",
    ultimate: "DDA.Stage.Ultimate",
    ultimatePlus: "DDA.Stage.UltimatePlus"
  }[stageKey];

  return fallbackKey ? localize(fallbackKey) : stageKey;
}

async function resolveActor(uuid = "") {
  const cleanUuid = String(uuid ?? "").trim();
  if (!cleanUuid) return null;

  try {
    const document = await fromUuid(cleanUuid);
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Could not resolve Actor UUID in GM partner progress panel:", cleanUuid, error);
    return null;
  }
}

function getUnlockedStages(tamer) {
  const current = foundry.utils.deepClone(tamer?.system?.partner?.unlockedEvolutionStages ?? {});

  for (const stageKey of DDA_PARTNER_STAGE_ORDER) {
    if (current[stageKey] === undefined) {
      current[stageKey] = ["baby1", "baby2", "child"].includes(stageKey);
    }
  }

  return current;
}

function normalizeCrestKey(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/^Crest_/i, "")
    .replace(/^crest_/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function getTamerCrestKey(tamer) {
  return normalizeCrestKey(
    tamer?.system?.partner?.digiviceSkin?.crestKey ||
    tamer?.system?.compatibility?.hiddenCrest?.key ||
    tamer?.system?.compatibility?.crest?.key ||
    ""
  );
}

function getGroupMembers(groupActor) {
  if (!groupActor || groupActor.type !== "group") return [];

  const members = Array.isArray(groupActor.system?.party?.members)
    ? groupActor.system.party.members
    : [];

  return members
    .map((entry) => String(entry.uuid ?? "").trim())
    .filter(Boolean);
}

async function getCurrentFormActor(tamer, partner) {
  // O ator parceiro é persistente: ele troca espécie, imagem e atributos conforme a forma atual.
  // currentFormUuid continua servindo como referência/template da forma, não como ficha principal.
  return partner ?? await resolveActor(tamer?.system?.partner?.currentFormUuid || "") ?? null;
}

export class DDAGMPartnerProgressPanel extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "dda-gm-partner-progress-panel",
      classes: ["dda", "dda-gm-partner-progress-panel"],
      template: "systems/digimon-digital-adventures/templates/apps/gm-partner-progress-panel.html",
      title: localize("DDA.GMPartnerProgress.Title"),
      width: 1040,
      height: 760,
      resizable: true
    });
  }

  constructor(options = {}) {
    super(options);
    this.targetMode = options.targetMode ?? "all";
    this.selectedGroupUuid = options.selectedGroupUuid ?? "all";
    this.selectedTamerUuid = options.selectedTamerUuid ?? "all";
  }

  async getData(options = {}) {
    const context = await super.getData(options);

    if (!game.user?.isGM) {
      return {
        ...context,
        isGM: false,
        groups: [],
        tamers: [],
        selectedGroupUuid: this.selectedGroupUuid,
        stageKeys: DDA_PARTNER_STAGE_ORDER
      };
    }

    const groups = game.actors
      .filter((actor) => actor.type === "group")
      .map((actor) => ({
        uuid: actor.uuid,
        name: actor.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    const allTamerActors = game.actors
      .filter((actor) => actor.type === "character")
      .filter((actor) => Boolean(actor.system?.partner?.uuid))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    const tamerOptions = allTamerActors.map((actor) => ({
      uuid: actor.uuid,
      name: actor.name
    }));

    if (this.selectedTamerUuid === "all" && tamerOptions.length) {
      this.selectedTamerUuid = tamerOptions[0].uuid;
    }

    const selectedGroup = this.selectedGroupUuid === "all"
      ? null
      : await resolveActor(this.selectedGroupUuid);

    const allowedMemberUuids = this.targetMode === "group" && selectedGroup
      ? new Set(getGroupMembers(selectedGroup))
      : null;

    const tamerActors = allTamerActors
      .filter((actor) => {
        if (this.targetMode === "individual") return actor.uuid === this.selectedTamerUuid;
        if (this.targetMode === "group") return !allowedMemberUuids || allowedMemberUuids.has(actor.uuid);
        return true;
      });

    const tamers = [];

    for (const tamer of tamerActors) {
      const partner = await resolveActor(tamer.system.partner?.uuid ?? "");
      const currentForm = await getCurrentFormActor(tamer, partner);
      const unlockedStages = getUnlockedStages(tamer);
      const bonusDp = Number(tamer.system.partner?.bonusDp ?? partner?.system.advancement?.bonusDp?.total ?? partner?.system.creation?.dp?.bonus ?? 0);
      const crestKey = getTamerCrestKey(tamer);
      const questionnaireEnabled = Boolean(game.settings.get(DDA_SYSTEM_ID, "enableHiddenCompatibilityQuestionnaire"));
      const digiviceRevealed = questionnaireEnabled && Boolean(tamer.system.partner?.digiviceSkin?.revealed);

      tamers.push({
        uuid: tamer.uuid,
        name: tamer.name,
        img: tamer.img,
        bonusDp,
        crestKey,
        hasCrest: Boolean(crestKey),
        questionnaireEnabled,
        digiviceRevealed,
        partnerUuid: partner?.uuid ?? tamer.system.partner?.uuid ?? "",
        partnerName: partner?.name ?? tamer.system.partner?.name ?? "",
        partnerImg: partner?.img ?? "icons/svg/mystery-man.svg",
        currentFormUuid: currentForm?.uuid ?? tamer.system.partner?.currentFormUuid ?? "",
        currentFormName: currentForm?.name ?? tamer.system.partner?.currentFormName ?? partner?.name ?? "",
        currentFormImg: currentForm?.img ?? partner?.img ?? "icons/svg/mystery-man.svg",
        currentStage: currentForm?.system?.stage ?? partner?.system?.stage ?? "",
        currentStageLabel: stageLabel(currentForm?.system?.stage ?? partner?.system?.stage ?? ""),
        stages: DDA_PARTNER_STAGE_ORDER.map((stageKey) => ({
          key: stageKey,
          label: stageLabel(stageKey),
          unlocked: Boolean(unlockedStages[stageKey])
        }))
      });
    }

    return {
      ...context,
      isGM: true,
      groups,
      targetMode: this.targetMode,
      selectedGroupUuid: this.selectedGroupUuid,
      selectedTamerUuid: this.selectedTamerUuid,
      tamerOptions,
      tamers,
      hasTamers: tamers.length > 0
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const root = html instanceof jQuery ? html : $(html);

    root.find("[data-action='refresh']").on("click", (event) => {
      event.preventDefault();
      this.render(true);
    });

    root.find("[data-action='select-target-mode']").on("change", (event) => {
      this.targetMode = event.currentTarget.value || "all";
      this.render(true);
    });

    root.find("[data-action='select-group']").on("change", (event) => {
      this.selectedGroupUuid = event.currentTarget.value || "all";
      this.render(true);
    });

    root.find("[data-action='select-tamer']").on("change", (event) => {
      this.selectedTamerUuid = event.currentTarget.value || "all";
      this.targetMode = "individual";
      this.render(true);
    });

    root.find("[data-action='set-bonus-dp']").on("change", this._onSetBonusDp.bind(this));
    root.find("[data-action='bonus-step']").on("click", this._onBonusStep.bind(this));
    root.find("[data-action='toggle-stage']").on("click", this._onToggleStage.bind(this));
    root.find("[data-action='toggle-crest-digivice']").on("click", this._onToggleCrestDigivice.bind(this));
    root.find("[data-action='open-tamer']").on("click", this._onOpenActor.bind(this));
    root.find("[data-action='open-partner']").on("click", this._onOpenActor.bind(this));
  }

  async _onOpenActor(event) {
    event.preventDefault();

    const actor = await resolveActor(event.currentTarget?.dataset?.uuid ?? "");
    actor?.sheet?.render(true);
  }

  async _onSetBonusDp(event) {
    event.preventDefault();

    const tamer = await resolveActor(event.currentTarget?.dataset?.tamerUuid ?? "");
    const value = Number(event.currentTarget?.value ?? 0);

    await this._setTamerBonusDp(tamer, value);
  }

  async _onBonusStep(event) {
    event.preventDefault();

    const tamer = await resolveActor(event.currentTarget?.dataset?.tamerUuid ?? "");
    if (!tamer) return;

    const step = Number(event.currentTarget?.dataset?.step ?? 0);
    const current = Number(tamer.system.partner?.bonusDp ?? 0);
    const next = Math.max(0, current + step);

    await this._setTamerBonusDp(tamer, next);
  }

  async _setTamerBonusDp(tamer, value) {
    if (!game.user?.isGM) {
      ui.notifications.warn(localize("DDA.GMPartnerProgress.OnlyGM"));
      return;
    }

    if (!tamer || tamer.type !== "character") return;

    const safeValue = Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
    const partner = await resolveActor(tamer.system.partner?.uuid ?? "");

    await tamer.update({
      "system.partner.bonusDp": safeValue
    });

    if (partner?.type === "digimon") {
      await partner.update({
        "system.advancement.bonusDp.total": safeValue,
        "system.creation.dp.bonus": safeValue
      });

      partner.sheet?.render(false);
    }

    tamer.sheet?.render(false);
    ui.notifications.info(localize("DDA.GMPartnerProgress.Saved"));
    this.render(true);
  }

  async _onToggleCrestDigivice(event) {
    event.preventDefault();

    if (!game.user?.isGM) {
      ui.notifications.warn(localize("DDA.GMPartnerProgress.OnlyGM"));
      return;
    }

    const tamer = await resolveActor(event.currentTarget?.dataset?.tamerUuid ?? "");
    if (!tamer || tamer.type !== "character") return;

    if (!Boolean(game.settings.get(DDA_SYSTEM_ID, "enableHiddenCompatibilityQuestionnaire"))) {
      ui.notifications.warn(localize("DDA.GMPartnerProgress.QuestionnaireDisabled"));
      return;
    }

    const crestKey = getTamerCrestKey(tamer);
    if (!crestKey) {
      ui.notifications.warn(localize("DDA.GMPartnerProgress.NoCrestAvailable"));
      return;
    }

    const revealed = !Boolean(tamer.system.partner?.digiviceSkin?.revealed);
    const unlockedStages = getUnlockedStages(tamer);

    if (revealed) {
      unlockedStages.perfect = true;
    }

    await tamer.update({
      "system.partner.digiviceSkin.revealed": revealed,
      "system.partner.digiviceSkin.crestKey": crestKey,
      "system.partner.digiviceSkin.lastToggleAt": new Date().toISOString(),
      "system.partner.crestResonance.active": revealed,
      "system.partner.unlockedEvolutionStages": unlockedStages
    });

    tamer.sheet?.render(false);
    ui.notifications.info(localize("DDA.GMPartnerProgress.Saved"));
    this.render(true);
  }

  async _onToggleStage(event) {
    event.preventDefault();

    if (!game.user?.isGM) {
      ui.notifications.warn(localize("DDA.GMPartnerProgress.OnlyGM"));
      return;
    }

    const button = event.currentTarget;
    const tamer = await resolveActor(button?.dataset?.tamerUuid ?? "");
    const stageKey = String(button?.dataset?.stageKey ?? "").trim();

    if (!tamer || tamer.type !== "character" || !stageKey) return;

    const unlockedStages = getUnlockedStages(tamer);
    unlockedStages[stageKey] = !Boolean(unlockedStages[stageKey]);

    await tamer.update({
      "system.partner.unlockedEvolutionStages": unlockedStages
    });

    tamer.sheet?.render(false);
    ui.notifications.info(localize("DDA.GMPartnerProgress.Saved"));
    this.render(true);
  }
}

function openGMPartnerProgressPanel() {
  if (!game.user?.isGM) {
    ui.notifications.warn(localize("DDA.GMPartnerProgress.OnlyGM"));
    return;
  }

  game.dda = game.dda ?? {};
  game.dda.applications = game.dda.applications ?? {};
  game.dda.applications.gmPartnerProgressPanel = game.dda.applications.gmPartnerProgressPanel ?? new DDAGMPartnerProgressPanel();
  game.dda.applications.gmPartnerProgressPanel.render(true);
}

Hooks.once("ready", () => {
  game.dda = game.dda ?? {};
  game.dda.applications = game.dda.applications ?? {};
  game.dda.applications.DDAGMPartnerProgressPanel = DDAGMPartnerProgressPanel;
  game.dda.openGMPartnerProgressPanel = openGMPartnerProgressPanel;
});

Hooks.on("renderActorDirectory", (_app, html) => {
  if (!game.user?.isGM) return;

  const root = html instanceof jQuery ? html[0] : html;
  if (!root?.querySelector) return;

  const directoryFooter = root.querySelector(".directory-footer");
  const directoryHeader = root.querySelector(".directory-header");
  const target = directoryFooter ?? directoryHeader;
  if (!target) return;

  let button = root.querySelector(".dda-open-gm-partner-progress-panel");

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.classList.add("dda-open-gm-partner-progress-panel");
    button.addEventListener("click", openGMPartnerProgressPanel);
    target.prepend(button);
  }

  button.innerHTML = `<i class="fas fa-chess-king"></i> ${localize("DDA.GMPartnerProgress.Open")}`;
});
