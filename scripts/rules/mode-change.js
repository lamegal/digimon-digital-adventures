import {
  getCombatId,
  localizeQ
} from "./quality-automation.js";

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
  automatic = false
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
  quality
) {
  if (!actor || !quality) {
    return false;
  }

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

  const actionCost =
    getActionCost(quality);

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
        actionsAfter
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