import {
  getCombatId,
  localizeQ
} from "./quality-automation.js";
import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
import { buildQualityItemData } from "../apps/digimon-quality-browser.js";

const MODE_STATS = new Set([
  "accuracy",
  "damage",
  "dodge",
  "armor"
]);

const SIZE_ORDER = [
  "small",
  "medium",
  "large",
  "huge",
  "gigantic",
  "colossal"
];

function getResponsibleGM() {
  const activeGM = game.users?.activeGM;

  return activeGM
    ? activeGM.id === game.user?.id
    : Boolean(game.user?.isGM);
}

function getModeState(actor) {
  return foundry.utils.deepClone(
    actor?.system?.combat?.qualityModeChange ?? {}
  );
}

function getModeConfig(actor, quality) {
  const configuredPairs = Array.isArray(
    quality?.system?.modeChange?.pairs
  )
    ? quality.system.modeChange.pairs
    : [];

  const selectedRanks = Array.isArray(
    quality?.system?.choices?.selectedRanks
  )
    ? quality.system.choices.selectedRanks
    : [];

  const rows = configuredPairs.length
    ? configuredPairs
    : selectedRanks;

  const usedStats = new Set();
  const pairs = [];

  let selectedSize = String(
    quality?.system?.modeChange?.selectedSize ?? ""
  ).trim();

  for (
    const [index, row] of rows.entries()
  ) {
    const stats = (
      Array.isArray(row?.stats)
        ? row.stats
        : [
            row?.leftStat,
            row?.rightStat
          ]
    )
      .map((stat) => {
        return String(stat ?? "").trim();
      })
      .filter((stat) => {
        return MODE_STATS.has(stat);
      });

    if (
      stats.length !== 2 ||
      stats[0] === stats[1] ||
      usedStats.has(stats[0]) ||
      usedStats.has(stats[1])
    ) {
      continue;
    }

    usedStats.add(stats[0]);
    usedStats.add(stats[1]);

    pairs.push({
      rank: Math.max(
        1,
        Number(
          row?.rank ??
          index + 1
        )
      ),

      stats
    });

    if (!selectedSize) {
      selectedSize = String(
        row?.modeSize ?? ""
      ).trim();
    }
  }

  const defaultSize = String(
    actor?.system?.size ?? "medium"
  );

  const defaultIndex =
    SIZE_ORDER.indexOf(defaultSize);

  const selectedIndex =
    SIZE_ORDER.indexOf(selectedSize);

  const stage = String(
    actor?.system?.stage ?? "child"
  );

  const maximumSize = String(
    CONFIG.DDA?.stages?.[stage]?.maxSize ??
    "colossal"
  );

  const maximumIndex =
    SIZE_ORDER.indexOf(maximumSize);

  const validSelectedSize = (
    selectedSize &&
    defaultIndex >= 0 &&
    selectedIndex >= 0 &&
    Math.abs(
      selectedIndex - defaultIndex
    ) === 1 &&
    (
      maximumIndex < 0 ||
      selectedIndex <= maximumIndex
    )
  )
    ? selectedSize
    : "";

  return {
    pairs,
    defaultSize,
    selectedSize: validSelectedSize
  };
}

function getActionCost(quality) {
  const value = Number(
    quality?.system?.activation?.actionCost ??
    quality?.system?.trigger?.actionCost ??
    1
  );

  return Number.isFinite(value)
    ? Math.max(
        0,
        Math.floor(value)
      )
    : 1;
}

function getStatLabel(statKey) {
  const key = {
    accuracy: "DDA.MainStat.Accuracy",
    damage: "DDA.MainStat.Damage",
    dodge: "DDA.MainStat.Dodge",
    armor: "DDA.MainStat.Armor"
  }[statKey];

  return key
    ? game.i18n.localize(key)
    : statKey;
}

function getSizeLabel(sizeKey) {
  const configured =
    CONFIG.DDA?.sizes?.[sizeKey];

  if (!configured) return sizeKey;

  const localized =
    game.i18n.localize(configured);

  return localized !== configured
    ? localized
    : configured;
}

function buildChat({
  actor,
  quality,
  active,
  pairs,
  defaultSize,
  modeSize,
  actionsBefore,
  actionsAfter,
  automatic = false,
  freeSource = ""
}) {
  const pairRows = pairs
    .map(({ stats }) => {
      return `
        <li>
          <strong>
            ${getStatLabel(stats[0])}
          </strong>

          ↔

          <strong>
            ${getStatLabel(stats[1])}
          </strong>
        </li>
      `;
    })
    .join("");

  const sizeRow = (
    modeSize &&
    modeSize !== defaultSize
  )
    ? `
      <li>
        ${localizeQ(
          "DDA.ModeChange.Size",
          "Tamanho"
        )}:

        <strong>
          ${getSizeLabel(defaultSize)}
        </strong>

        →

        <strong>
          ${getSizeLabel(modeSize)}
        </strong>.
      </li>
    `
    : "";

  const actionRow = automatic
    ? ""
    : `
      <li>
        ${localizeQ(
          "DDA.Resource.Actions",
          "Ações"
        )}:

        <strong>
          ${actionsBefore} →
          ${actionsAfter}
        </strong>.
        ${freeSource ? `<em>${localizeQ("DDA.ModeChange.FreeSource", "Mudança Livre")} — ${freeSource}</em>` : ""}
      </li>
    `;

  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-mode-change-card">
      <h2>
        ${
          quality?.name ??
          localizeQ(
            "DDA.ModeChange.Name",
            "Mudança de Modo"
          )
        }
      </h2>

      <p>
        <strong>${actor.name}</strong>

        ${
          active
            ? localizeQ(
                "DDA.ModeChange.Activated",
                "entrou no Modo alternativo."
              )
            : localizeQ(
                "DDA.ModeChange.Reverted",
                "retornou ao Modo padrão."
              )
        }
      </p>

      <ul class="dda-effect-list">
        ${pairRows}
        ${sizeRow}
        ${actionRow}
      </ul>
    </div>
  `;
}

async function setQualityActive(
  quality,
  active
) {
  if (!quality) return;

  if (
    Boolean(
      quality.system?.activation?.active
    ) === active
  ) {
    return;
  }

  await quality.update({
    "system.activation.active": active
  });
}

function addBaseStatUpdates(
  update,
  values = {}
) {
  for (
    const [statKey, value] of
    Object.entries(values)
  ) {
    if (!MODE_STATS.has(statKey)) {
      continue;
    }

    update[
      `system.mainStats.${statKey}.base`
    ] = Number(value ?? 0);
  }
}

function normalizeIdentity(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getSuperiorModeQuality(actor) {
  return actor?.items?.find?.((item) => {
    if (item.type !== "quality") return false;
    const keys = [item.system?.sourceId, item.system?.originalName, item.name]
      .map(normalizeIdentity);
    return keys.some((key) => ["mudancademodosuperior", "superiormodechange"].includes(key));
  }) ?? null;
}

function getSuperiorConfiguration(actor) {
  const quality = getSuperiorModeQuality(actor);
  const configuration = quality?.system?.superiorModeChange?.configuration ?? {};
  const complete = Boolean(
    configuration.complete ??
    configuration.configurationComplete ??
    quality?.system?.superiorModeChange?.configurationComplete
  );
  return { quality, configuration: foundry.utils.deepClone(configuration), complete };
}

function itemMatchesIdentifier(item, identifier) {
  const wanted = normalizeIdentity(identifier);
  if (!wanted) return false;
  return [
    item?.id,
    item?.system?.sourceId,
    item?.system?.originalName,
    item?.flags?.[game.system.id]?.enemyBuilderAttackKey,
    item?.flags?.[game.system.id]?.superiorModeKey,
    item?.name
  ].some((candidate) => normalizeIdentity(candidate) === wanted);
}

function getConfiguredDefaultQualityDocuments(actor, configuration) {
  const identifiers = [
    ...(configuration.defaultQualityIds ?? []),
    ...(configuration.defaultQualities ?? []).flatMap((entry) => [
      entry?._id,
      entry?.id,
      entry?.system?.sourceId,
      entry?.name
    ])
  ].filter(Boolean);
  const modeIds = new Set(["mudancademodo", "modechange", "mudancademodosuperior", "superiormodechange"]);
  return actor.items.filter((item) => {
    if (item.type !== "quality") return false;
    if (modeIds.has(normalizeIdentity(item.system?.sourceId ?? item.name))) return false;
    return identifiers.some((identifier) => itemMatchesIdentifier(item, identifier));
  });
}

function buildConfiguredModeQualityData(configuration) {
  return (configuration.modeQualities ?? []).map((row, index) => {
    if (row?.type === "quality" && row?.system) {
      const data = foundry.utils.deepClone(row);
      delete data._id;
      return data;
    }
    const definition = DDA_DIGIMON_QUALITIES.find((entry) => {
      return [entry.id, entry.name, entry.originalName]
        .some((candidate) => normalizeIdentity(candidate) === normalizeIdentity(row?.id ?? row?.sourceId ?? row?.name));
    });
    if (!definition) return null;
    const data = buildQualityItemData(definition);
    data.system.rank = {
      ...(data.system.rank ?? {}),
      value: Math.max(1, Number(row?.rank ?? 1))
    };
    const choices = foundry.utils.deepClone(row?.choices ?? row?.choiceRows ?? []);
    if (choices.length) {
      data.system.choices = { ...(data.system.choices ?? {}), selectedRanks: choices };
    }
    data.flags = {
      ...(data.flags ?? {}),
      [game.system.id]: {
        ...(data.flags?.[game.system.id] ?? {}),
        superiorModeRole: "mode",
        superiorModeKey: String(row?.key ?? row?.id ?? `${definition.id}:${index}`)
      }
    };
    return data;
  }).filter(Boolean);
}

function buildConfiguredModeAttackData(configuration) {
  return (configuration.modeAttacks ?? []).map((row, index) => {
    if (row?.type === "attack" && row?.system) {
      const data = foundry.utils.deepClone(row);
      delete data._id;
      data.flags ??= {};
      data.flags[game.system.id] = {
        ...(data.flags[game.system.id] ?? {}),
        superiorModeRole: "mode",
        superiorModeKey: String(row?.key ?? row?.id ?? `mode-attack:${index}`)
      };
      return data;
    }
    const rangeType = String(row?.rangeType ?? row?.system?.baseTags?.rangeType ?? "melee");
    const functionType = String(row?.functionType ?? row?.system?.baseTags?.functionType ?? "damage");
    return {
      name: String(row?.name ?? `${localizeQ("DDA.ModeChange.ModeAttack", "Ataque de Modo")} ${index + 1}`),
      type: "attack",
      img: String(row?.img ?? "icons/svg/sword.svg"),
      flags: {
        [game.system.id]: {
          superiorModeRole: "mode",
          superiorModeKey: String(row?.key ?? row?.id ?? `mode-attack:${index}`)
        }
      },
      system: {
        baseTags: { rangeType, functionType },
        qualityTags: foundry.utils.deepClone(row?.qualityTags ?? []),
        accuracy: { baseFormula: "@actor.mainStats.accuracy.total", bonus: 0, automaticSuccesses: 0 },
        damage: { enabled: functionType !== "support", baseFormula: "@actor.mainStats.damage.total", bonus: 0, unalterable: 0, minimum: 1 },
        support: { enabled: functionType === "support", effect: "", potency: 0, duration: 1 },
        actionCost: { value: 1, extra: 0 }
      }
    };
  });
}

function getWoundState(actor) {
  return {
    value: Math.max(0, Number(actor?.system?.miscStats?.wounds?.value ?? 0)),
    max: Math.max(0, Number(actor?.system?.miscStats?.wounds?.max ?? 0))
  };
}

async function applyWoundMaximumDelta(actor, before, rollback, { force = false } = {}) {
  const after = getWoundState(actor);
  const delta = after.max - before.max;
  if (delta < 0 && before.value < Math.abs(delta)) {
    if (force) {
      await actor.update({ "system.miscStats.wounds.value": 0 });
      ui.notifications.warn(localizeQ(
        "DDA.ModeChange.ForcedWoundReset",
        "O fim do Combate forçou o retorno ao Modo padrão; as Caixas de Ferimento atuais foram reduzidas a 0."
      ));
      return true;
    }
    await rollback();
    const restored = getWoundState(actor);
    await actor.update({
      "system.miscStats.wounds.value": Math.min(restored.max, before.value)
    });
    ui.notifications.warn(localizeQ(
      "DDA.ModeChange.WoundLossBlocked",
      "A Mudança de Modo foi impedida: o Digimon não possui Caixas de Ferimento atuais suficientes para acompanhar a redução do máximo."
    ));
    return false;
  }
  if (delta !== 0) {
    await actor.update({
      "system.miscStats.wounds.value": Math.max(0, Math.min(after.max, before.value + delta))
    });
  }
  return true;
}

async function setSuperiorAttackRoles(actor, configuration) {
  const defaultIdentifiers = configuration.defaultAttackIds ?? configuration.defaultAttackKeys ?? [];
  const defaultAttacks = actor.items.filter((item) => item.type === "attack" &&
    defaultIdentifiers.some((identifier) => itemMatchesIdentifier(item, identifier)));
  if (defaultAttacks.length) {
    await actor.updateEmbeddedDocuments("Item", defaultAttacks.map((item) => ({
      _id: item.id,
      [`flags.${game.system.id}.superiorModeRole`]: "default",
      [`flags.${game.system.id}.superiorModeKey`]: String(
        item.flags?.[game.system.id]?.enemyBuilderAttackKey ?? item.id
      )
    })));
  }

  const configuredModeIds = configuration.modeAttackIds ?? [];
  let modeAttacks = actor.items.filter((item) => item.type === "attack" && (
    item.flags?.[game.system.id]?.superiorModeRole === "mode" ||
    configuredModeIds.some((identifier) => itemMatchesIdentifier(item, identifier))
  ));
  if (!modeAttacks.length && (configuration.modeAttacks ?? []).length) {
    modeAttacks = await actor.createEmbeddedDocuments("Item", buildConfiguredModeAttackData(configuration));
  }
  return { defaultAttackIds: defaultAttacks.map((item) => item.id), modeAttackIds: modeAttacks.map((item) => item.id) };
}

async function enterSuperiorMode(actor) {
  const { quality, configuration, complete } = getSuperiorConfiguration(actor);
  if (!quality) return { ok: true, state: null };
  if (!complete) {
    ui.notifications.warn(localizeQ(
      "DDA.ModeChange.SuperiorIncomplete",
      "Configure as Qualidades e os Ataques de Mudança de Modo Superior antes de mudar de Modo."
    ));
    return { ok: false, state: null };
  }

  const defaultDocs = getConfiguredDefaultQualityDocuments(actor, configuration);
  const modeData = buildConfiguredModeQualityData(configuration);
  if (!defaultDocs.length || !modeData.length) {
    ui.notifications.warn(localizeQ(
      "DDA.ModeChange.SuperiorInvalid",
      "A configuração de Mudança de Modo Superior não contém os dois conjuntos de Qualidades válidos."
    ));
    return { ok: false, state: null };
  }

  const beforeWounds = getWoundState(actor);
  const defaultQualityData = defaultDocs.map((item) => item.toObject());
  const attackState = await setSuperiorAttackRoles(actor, configuration);
  await actor.deleteEmbeddedDocuments("Item", defaultDocs.map((item) => item.id));
  const createdMode = await actor.createEmbeddedDocuments("Item", modeData);

  const rollback = async () => {
    if (createdMode.length) await actor.deleteEmbeddedDocuments("Item", createdMode.map((item) => item.id));
    await actor.createEmbeddedDocuments("Item", defaultQualityData, { keepId: true });
  };
  if (!(await applyWoundMaximumDelta(actor, beforeWounds, rollback))) {
    return { ok: false, state: null };
  }

  await quality.update({ "system.superiorModeChange.activeMode": "mode" });
  return {
    ok: true,
    state: {
      superiorQualityId: quality.id,
      defaultQualityData,
      modeQualityIds: createdMode.map((item) => item.id),
      ...attackState
    }
  };
}

async function leaveSuperiorMode(actor, state = {}, { force = false } = {}) {
  if (!state?.defaultQualityData?.length) return true;
  const beforeWounds = getWoundState(actor);
  const modeDocs = (state.modeQualityIds ?? []).map((id) => actor.items.get(id)).filter(Boolean);
  const modeData = modeDocs.map((item) => item.toObject());
  if (modeDocs.length) await actor.deleteEmbeddedDocuments("Item", modeDocs.map((item) => item.id));
  const restored = await actor.createEmbeddedDocuments("Item", foundry.utils.deepClone(state.defaultQualityData), { keepId: true });

  const rollback = async () => {
    if (restored.length) await actor.deleteEmbeddedDocuments("Item", restored.map((item) => item.id));
    if (modeData.length) await actor.createEmbeddedDocuments("Item", modeData, { keepId: true });
  };
  if (!(await applyWoundMaximumDelta(actor, beforeWounds, rollback, { force }))) return false;

  const quality = actor.items.get(state.superiorQualityId) ?? getSuperiorModeQuality(actor);
  await quality?.update({ "system.superiorModeChange.activeMode": "default" });
  return true;
}

export function isAttackAvailableForCurrentMode(actor, attack) {
  const role = String(attack?.flags?.[game.system.id]?.superiorModeRole ?? "");
  if (!role) return true;
  const active = Boolean(actor?.system?.combat?.qualityModeChange?.active);
  return active ? role !== "default" : role !== "mode";
}

export async function resetModeChangeForActor(
  actor,
  {
    combatId = "",
    createChat = false
  } = {}
) {
  if (!actor) return false;

  const state = getModeState(actor);

  if (!state.active) return false;

  if (
    combatId &&
    String(state.combatId ?? "") !==
      String(combatId)
  ) {
    return false;
  }

  if (state.superior) {
    const superiorReverted = await leaveSuperiorMode(actor, state.superior, { force: true });
    if (!superiorReverted) return false;
  }

  const update = {
    "system.combat.qualityModeChange": {
      ...state,

      active: false,

      revertedAt:
        new Date().toISOString()
    }
  };

  addBaseStatUpdates(
    update,
    state.defaultBaseStats
  );

  if (state.defaultSize) {
    update["system.size"] =
      String(state.defaultSize);
  }

  await actor.update(update);

  const quality =
    actor.items?.get?.(
      state.qualityId
    ) ?? null;

  await setQualityActive(
    quality,
    false
  );

  if (createChat) {
    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor
        }),

      content: buildChat({
        actor,
        quality,
        active: false,
        pairs: state.pairs ?? [],
        defaultSize: state.defaultSize,
        modeSize: state.modeSize,
        actionsBefore: 0,
        actionsAfter: 0,
        automatic: true
      })
    });
  }

  actor.sheet?.render(false);

  return true;
}

export async function useModeChangeQuality(
  actor,
  quality,
  {
    actionCostOverride = null,
    freeSource = "",
    bypassCharmControl = false
  } = {}
) {
  if (!actor || !quality) {
    return false;
  }

  const charmGate = game?.dda?.bossQualities?.ensureCharmActionController;
  if (!bypassCharmControl && typeof charmGate === "function" && !charmGate(actor, { user: game?.user, notify: true })) return false;

  if (!game.combat?.started) {
    ui.notifications.warn(
      localizeQ(
        "DDA.ModeChange.RequiresCombat",
        "Mudança de Modo só pode ser usada durante um combate ativo."
      )
    );

    return false;
  }

  let state = getModeState(actor);

  const combatId = getCombatId();

  if (
    state.active &&
    String(state.combatId ?? "") !==
      combatId
  ) {
    await resetModeChangeForActor(
      actor
    );

    state = getModeState(actor);
  }

  const config = getModeConfig(
    actor,
    quality
  );

  if (!config.pairs.length) {
    ui.notifications.warn(
      localizeQ(
        "DDA.ModeChange.MissingConfiguration",
        "Mudança de Modo não possui pares de Estatísticas válidos configurados."
      )
    );

    return false;
  }

  const configuredActionCost = getActionCost(quality);
  const overrideValue = Number(actionCostOverride);
  const actionCost = actionCostOverride === null || !Number.isFinite(overrideValue)
    ? configuredActionCost
    : Math.max(0, Math.floor(overrideValue));

  const actionsBefore = Math.max(
    0,
    Number(
      actor.system?.combat
        ?.actions?.value ?? 0
    )
  );

  if (actionsBefore < actionCost) {
    ui.notifications.warn(
      localizeQ(
        "DDA.ModeChange.NotEnoughActions",
        "{actor} não possui Ações suficientes para mudar de Modo.",
        {
          actor: actor.name
        }
      )
    );

    return false;
  }

  const actionsAfter = Math.max(
    0,
    actionsBefore - actionCost
  );

  const isActive = Boolean(
    state.active &&
    String(state.qualityId ?? "") ===
      String(quality.id)
  );

  /*
   * Já está no Modo alternativo:
   * retorna ao Modo padrão.
   */
  if (isActive) {
    if (state.superior) {
      const superiorReverted = await leaveSuperiorMode(actor, state.superior);
      if (!superiorReverted) return false;
    }

    const update = {
      "system.combat.actions.value":
        actionsAfter,

      "system.combat.qualityModeChange": {
        ...state,

        active: false,

        revertedAt:
          new Date().toISOString()
      }
    };

    addBaseStatUpdates(
      update,
      state.defaultBaseStats
    );

    update["system.size"] = String(
      state.defaultSize ??
      actor.system.size
    );

    await actor.update(update);

    await setQualityActive(
      quality,
      false
    );

    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor
        }),

      content: buildChat({
        actor,
        quality,
        active: false,

        pairs:
          state.pairs ??
          config.pairs,

        defaultSize:
          state.defaultSize,

        modeSize:
          state.modeSize,

        actionsBefore,
        actionsAfter,
        freeSource
      })
    });

    actor.sheet?.render(false);

    return true;
  }

  /*
   * Entrando no Modo alternativo.
   */
  const defaultBaseStats = {};
  const modeBaseStats = {};

  for (
    const { stats } of
    config.pairs
  ) {
    const [
      leftStat,
      rightStat
    ] = stats;

    const leftValue = Number(
      actor.system.mainStats
        ?.[leftStat]?.base ?? 0
    );

    const rightValue = Number(
      actor.system.mainStats
        ?.[rightStat]?.base ?? 0
    );

    defaultBaseStats[leftStat] =
      leftValue;

    defaultBaseStats[rightStat] =
      rightValue;

    modeBaseStats[leftStat] =
      rightValue;

    modeBaseStats[rightStat] =
      leftValue;
  }

  const modeSize =
    config.selectedSize ||
    config.defaultSize;

  const superiorResult = await enterSuperiorMode(actor);
  if (!superiorResult.ok) return false;

  const nextState = {
    active: true,

    qualityId: quality.id,
    qualityName: quality.name,

    combatId,

    pairs: config.pairs,

    defaultBaseStats,
    modeBaseStats,

    defaultSize:
      config.defaultSize,

    modeSize,

    superior: superiorResult.state,

    activatedAt:
      new Date().toISOString()
  };

  const update = {
    "system.combat.actions.value":
      actionsAfter,

    "system.combat.qualityModeChange":
      nextState,

    "system.size":
      modeSize
  };

  addBaseStatUpdates(
    update,
    modeBaseStats
  );

  await actor.update(update);

  await setQualityActive(
    quality,
    true
  );

  await ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content: buildChat({
      actor,
      quality,
      active: true,

      pairs:
        config.pairs,

      defaultSize:
        config.defaultSize,

      modeSize,

      actionsBefore,
      actionsAfter
    })
  });

  actor.sheet?.render(false);

  return true;
}

/*
 * Encerrar o combate esvazia o Combat Tracker.
 * Remover um participante também o tira do combate,
 * portanto ambos devem encerrar o Modo.
 */
Hooks.on(
  "deleteCombatant",
  async (combatant) => {
    if (!getResponsibleGM()) return;

    await resetModeChangeForActor(
      combatant?.actor,

      {
        combatId:
          combatant?.parent?.id ?? ""
      }
    );
  }
);

Hooks.on(
  "deleteCombat",
  async (combat) => {
    if (!getResponsibleGM()) return;

    const actors = new Map();

    for (
      const combatant of
      combat?.combatants ?? []
    ) {
      if (!combatant?.actor) {
        continue;
      }

      actors.set(
        combatant.actor.uuid ??
        combatant.actor.id,

        combatant.actor
      );
    }

    for (
      const actor of
      actors.values()
    ) {
      await resetModeChangeForActor(
        actor,
        {
          combatId: combat.id
        }
      );
    }
  }
);
