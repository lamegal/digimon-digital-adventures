import {
  findQuality,
  getLowRerollDeclaration,
  getQualityRank,
  hasQuality,
  maybeUseVariableReroll,
  setUseState,
  spendQualityUse
} from "../rules/quality-automation.js";

import {
  applyLuckyNumberReward
} from "./lucky-number.js";
import {
  consumeTamerActionPoolEffects,
  prepareTamerActionPoolOptions
} from "../combat/tamer-actions.js";
import {
  consumeDigimonActionPoolEffects,
  prepareDigimonActionPoolOptions
} from "../combat/digimon-actions.js";
import {
  consumeGuidingDice,
  prepareGuidingDicePoolOptions
} from "../combat/effect-qualities.js";
import {
  consumeOmniscientHoldDodge,
  prepareOmniscientHoldPoolOptions
} from "../combat/digizoid-gain-force.js";

function getEvasiveManeuversReserve(
  actor
) {
  const reserve =
    foundry.utils.deepClone(
      actor?.system?.combat
        ?.tamerTalentReserves
        ?.evasiveManeuvers ??
      {}
    );

  const combat =
    game?.combat;

  if (!combat?.started) {
    return null;
  }

  if (
    String(
      reserve.combatId ?? ""
    ) !== String(combat.id)
  ) {
    return null;
  }

  const current = Math.max(
    0,
    Number(
      reserve.current ?? 0
    )
  );

  if (
    !reserve.active ||
    current <= 0
  ) {
    return null;
  }

  return {
    ...reserve,
    current
  };
}

async function consumeEvasiveManeuversReserve(
  actor,
  amount
) {
  const reserve =
    getEvasiveManeuversReserve(
      actor
    );

  if (!reserve) {
    return null;
  }

  const spent = Math.min(
    reserve.current,
    Math.max(
      0,
      Math.floor(
        Number(amount ?? 0)
      )
    )
  );

  if (spent <= 0) {
    return reserve;
  }

  const nextCurrent =
    Math.max(
      0,
      reserve.current - spent
    );

  const nextState = {
    ...reserve,

    current:
      nextCurrent,

    active:
      nextCurrent > 0,

    lastSpent:
      spent,

    updatedAt:
      new Date().toISOString()
  };

  await actor.update({
    "system.combat.tamerTalentReserves.evasiveManeuvers":
      nextState
  });

  actor.sheet?.render(false);

  return nextState;
}

export async function rollPool(actor, statKey, options = {}) {
  options = prepareOmniscientHoldPoolOptions(actor, statKey, options);
  options = prepareTamerActionPoolOptions(
    actor,
    statKey,
    options
  );
  options = prepareDigimonActionPoolOptions(
    actor,
    statKey,
    options
  );
  options = prepareGuidingDicePoolOptions(actor, options);

  const system = actor.system;
  const stat = system.mainStats?.[statKey];

  if (!stat) {
    ui.notifications.warn(localize("DDA.Warning.RollStatNotFound"));
    return;
  }

const evasiveManeuversReserve =
  statKey === "dodge"
    ? getEvasiveManeuversReserve(
        actor
      )
    : null;

const preparedOptions =
  preparePoolQualityOptions(
    actor,
    statKey,
    stat,
    {
      ...options,

      evasiveManeuversReserve
    }
  );

  let lowRerollDeclaration = null;

  const dialogData = await getPoolDialogData(actor, statKey, stat, preparedOptions);
  if (!dialogData) return;
  if (options.omniscientHoldDodgeId) {
    await consumeOmniscientHoldDodge(actor, options.omniscientHoldDodgeId);
  }

  const baseDice = Math.max(0, Number(stat.total ?? 0));
  const manualDiceModifier = Number(dialogData.manualDiceModifier ?? 0);
const externalDiceModifier = Number(dialogData.externalDiceModifier ?? 0);
const modifierBreakdown = (Array.isArray(options.modifierBreakdown) ? options.modifierBreakdown : [])
  .filter((entry) => entry && String(entry.label ?? "").trim())
  .map((entry) => ({
    ...entry,
    label: String(entry.label).trim(),
    value: entry.value === null || entry.value === undefined ? null : Number(entry.value),
    kind: String(entry.kind ?? "external").replace(/[^a-zA-Z0-9_-]+/g, "-")
  }));
const stanceDiceModifier =
  Number(
    dialogData.stanceDiceModifier ?? 0
  );

const dodgePenalty =
  Number(
    dialogData.dodgePenalty ?? 0
  );

const evasiveManeuversDice =
  Math.max(
    0,
    Number(
      dialogData
        .evasiveManeuversDice ?? 0
    )
  );

const guidingDice = Math.max(0, Number(dialogData.guidingDice ?? 0));
const resultModifier = Number(dialogData.resultModifier ?? 0);
const resultModifierSummary = String(
  dialogData.resultModifierSummary ??
  options.resultModifierSummary ??
  ""
).trim();
  const qualityBaseDicePenalty = Number(dialogData.qualityBaseDicePenalty ?? preparedOptions.qualityBaseDicePenalty ?? 0);
const automaticSuccesses = Number(dialogData.automaticSuccesses ?? 0);
const statLabel = localizeStatLabel(statKey, stat);

const qualityAutomaticSuccessesTotal = Math.max(
  0,
  Number(dialogData.qualityAutomaticSuccessesTotal ?? 0)
);

const qualityAutomaticSuccessesActive = Math.max(
  0,
  Number(dialogData.qualityAutomaticSuccesses ?? 0)
);

const qualityAutomaticSuccessesAbsorbed = Math.max(
  0,
  Number(dialogData.qualityAutomaticSuccessesAbsorbed ?? 0)
);

const qualityAutomaticSuccessesHtml = buildQualityAutomaticSuccessesHtml({
  statKey,
  qualityAutomaticSuccessesTotal,
  qualityAutomaticSuccessesActive,
  qualityAutomaticSuccessesAbsorbed
});

const dice = Math.max(
  0,

  baseDice -
  qualityBaseDicePenalty +
  manualDiceModifier +
  externalDiceModifier +
  stanceDiceModifier +
  evasiveManeuversDice +
  guidingDice -
  dodgePenalty
);

if (dice <= 0 && automaticSuccesses <= 0) {
  if (options.allowZeroSuccesses) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),


content: `
  <div class="dda-chat-card dda-effect-card effect-special dda-pool-card dda-pool-${statKey}">
    <h2>${formatI18n("DDA.Pool.RollTitle", { stat: statLabel })}</h2>

    <ul class="dda-effect-list dda-pool-summary-list">
      <li>
        ${localize("DDA.Pool.Dice")}:
        <strong>0d6</strong>.
      </li>

      <li class="pool-warning">
        ${localize("DDA.Warning.RollHasNoDiceOrAutomaticSuccesses")}
      </li>

      ${qualityAutomaticSuccessesHtml}

      <li class="pool-total-successes">
        ${localize("DDA.Pool.TotalSuccesses")}:
        <strong>0</strong>.
      </li>
    </ul>
  </div>
`
    });

    return {
      roll: null,
      rolledSuccesses: 0,
      automaticSuccesses: 0,
      totalSuccesses: 0
    };
  }

  ui.notifications.warn(localize("DDA.Warning.RollHasNoDiceOrAutomaticSuccesses"));
  return;
}

  let roll = dice > 0 ? await new Roll(`${dice}d6`).evaluate() : null;
  const variableReroll = await maybeUseVariableReroll(actor, roll, {
    source: `mainStatPool:${statKey}`,
    title: statLabel
  });
  roll = variableReroll.roll;

  const diceResults = roll?.dice[0]?.results ?? [];
  const rerollLimit = Math.max(
    0,
    Number(options.rerollResultsUpTo ?? 0),
    Number(lowRerollDeclaration?.rerollResultsUpTo ?? 0)
  );
  let rerollLabel = options.rerollLabel ?? "Reroll";
  const rerolledDice = [];
  const rerollProtectedDice = Math.min(
    diceResults.length,
    Math.max(0, Math.floor(Number(options.ddaRerollProtectedDice ?? 0)))
  );
  const protectedDiceStart = Math.max(0, diceResults.length - rerollProtectedDice);

  lowRerollDeclaration = await getLowRerollDeclaration(actor, statKey, {
    diceResults,
    protectedDiceStart
  });

  if (lowRerollDeclaration?.label) {
    rerollLabel = lowRerollDeclaration.label;
  }

  const effectiveRerollLimit = Math.max(
    rerollLimit,
    Number(lowRerollDeclaration?.rerollResultsUpTo ?? 0)
  );

  if (effectiveRerollLimit > 0 && diceResults.length) {
    /*
     * Congelamos a lista de dados elegíveis antes
     * de realizar qualquer rerrolagem.
     *
     * Assim, um resultado novo nunca entra novamente
     * na lista de dados que podem ser rerrolados.
     */
    const eligibleDice = diceResults
      .map((result, index) => ({
        result,
        index,
        original:
          Number(result.result ?? 0)
      }))
      .filter((entry) => {
        return (
          entry.index < protectedDiceStart &&
          entry.original > 0 &&
          entry.original <= effectiveRerollLimit
        );
      });

    if (eligibleDice.length > 0) {
      /*
       * Todos os dados elegíveis são rerrolados juntos
       * em uma única segunda passagem.
       */
      const reroll = await new Roll(
        `${eligibleDice.length}d6`
      ).evaluate();

      const replacementResults =
        reroll.dice[0]?.results ?? [];

      for (
        let index = 0;
        index < eligibleDice.length;
        index += 1
      ) {
        const entry =
          eligibleDice[index];

        const replacement = Number(
          replacementResults[index]?.result ??
          entry.original
        );

        rerolledDice.push({
          dieIndex: entry.index,
          original: entry.original,
          result: replacement
        });

        /*
         * O novo resultado é definitivo.
         *
         * Mesmo que ainda seja 1 ou 2, esse dado
         * não poderá ser rerrolado novamente.
         */
        entry.result.result =
          replacement;
      }
    }
  }

const adjustedDiceResults = diceResults.map((result) => {
  const raw = Number(result.result ?? 0);
  const adjusted = raw + resultModifier;

  return {
    raw,
    adjusted,
    success: adjusted >= 5
  };
});

const rolledSuccesses = adjustedDiceResults
  .filter((result) => result.success)
  .length;

const negativeRerollPenalty = lowRerollDeclaration?.bucket === "reroll-dodge" && hasQuality(actor, "broadside")
  ? getQualityRank(findQuality(actor, "broadside"))
  : lowRerollDeclaration?.bucket === "reroll-health" && hasQuality(actor, "illness")
    ? getQualityRank(findQuality(actor, "illness"))
    : 0;
const totalSuccesses = Math.max(0, rolledSuccesses + automaticSuccesses - negativeRerollPenalty);

const resultsHtml = adjustedDiceResults
  .map((result) => {
    const successClass = result.success ? "success" : "failure";

    if (resultModifier === 0) {
      return `<span class="dda-die ${successClass}">${result.adjusted}</span>`;
    }

    return `
      <span class="dda-die dda-die-raw">${result.raw}</span>
      <span class="dda-die-adjustment">→</span>
      <span class="dda-die ${successClass}">${result.adjusted}</span>
    `;
  })
  .join("");

  const rerollHtml = rerolledDice.length
    ? `
      <li>
        ${rerollLabel}:
        <div class="dda-dice-results">
          ${rerolledDice.map((entry) => `<span class="dda-die failure">${entry.original}</span> → <span class="dda-die ${entry.result >= 5 ? "success" : "failure"}">${entry.result}</span>`).join(" ")}
        </div>
      </li>
    `
    : "";

const content = `
  <div class="dda-chat-card dda-effect-card effect-special dda-pool-card dda-pool-${statKey}">
    <h2>${formatI18n("DDA.Pool.RollTitle", { stat: statLabel })}</h2>

    <ul class="dda-effect-list dda-pool-summary-list">
      <li>
        ${localize("DDA.Pool.Dice")}:
        <strong>${dice}d6</strong>.
      </li>

      ${
manualDiceModifier !== 0 ||
externalDiceModifier !== 0 ||
modifierBreakdown.length > 0 ||
resultModifier !== 0 ||
stanceDiceModifier !== 0 ||
evasiveManeuversDice !== 0 ||
dodgePenalty !== 0
          ? `
            <li>
              ${localize("DDA.Pool.Modifiers")}:
              <div class="pool-modifier-chips">
                ${
                  manualDiceModifier !== 0
                    ? `<span>${formatSigned(manualDiceModifier)} ${localize("DDA.Pool.Modifier.Manual")}</span>`
                    : ""
                }

                ${
                  externalDiceModifier !== 0 || modifierBreakdown.length > 0
                    ? modifierBreakdown.length
                      ? modifierBreakdown.map((entry) => {
                          const value = Number.isFinite(entry.value) && entry.value !== 0
                            ? `${formatSigned(entry.value)} `
                            : "";
                          const detailClass = entry.detail ? " is-detail" : "";
                          const protectedClass = entry.kind === "tamerDirect" ? " is-protected" : "";
                          return `<span class="modifier-chip kind-${entry.kind}${detailClass}${protectedClass}">${value}${foundry.utils.escapeHTML(entry.label)}</span>`;
                        }).join("")
                      : `<span>${formatSigned(externalDiceModifier)} ${options.externalLabel ?? localize("DDA.Pool.Modifier.External")}</span>`
                    : ""
                }

                ${
                  resultModifier !== 0
                    ? `<span>${resultModifierSummary || formatSigned(resultModifier)}</span>`
                    : ""
                }

${
  evasiveManeuversDice > 0
    ? `
      <span class="dda-evasive-maneuvers-chip">
        +${evasiveManeuversDice}
        ${localize(
          "DDA.TamerTalent.EvasiveManeuvers.Short"
        )}
      </span>
    `
    : ""
}

                ${
                  dodgePenalty !== 0
                    ? `<span>-${dodgePenalty} ${localize("DDA.Pool.Modifier.DodgePenalty")}</span>`
                    : ""
                }
              </div>
            </li>
          `
          : ""
      }

      ${qualityAutomaticSuccessesHtml}

      <li class="pool-dice-row">
        ${localize("DDA.Pool.RolledDice")}:
        <div class="dda-dice-results">${resultsHtml}</div>
      </li>

      ${variableReroll.used ? `
        <li class="pool-variable-reroll-note">
          <strong>Variable:</strong>
          ${localize("DDA.QualityAutomation.VariableRerollUsed")}
        </li>
      ` : ""}

      ${rerollHtml}

      ${rerollProtectedDice > 0 && effectiveRerollLimit > 0 ? `
        <li class="pool-reroll-protected-note">
          <i class="fas fa-lock"></i>
          ${formatI18n("DDA.Pool.RerollProtectedDirect", { dice: rerollProtectedDice })}
        </li>
      ` : ""}

      <li>
        ${localize("DDA.Pool.RolledSuccesses")}:
        <strong>${rolledSuccesses}</strong>.
      </li>

      <li>
        ${localize("DDA.Pool.AutomaticSuccesses")}:
        <strong>${automaticSuccesses}</strong>.
      </li>

      <li class="pool-total-successes">
        ${localize("DDA.Pool.TotalSuccesses")}:
        <strong>${totalSuccesses}</strong>.
      </li>
    </ul>
  </div>
`;

await ChatMessage.create({
  speaker:
    ChatMessage.getSpeaker({
      actor
    }),

  content,

  rolls:
    roll
      ? [roll]
      : []
});

const luckyNumberResult =
  await applyLuckyNumberReward(
    actor,

    adjustedDiceResults.map(
      (result) => {
        return result.raw;
      }
    ),

    {
      source:
        `mainStatPool:${statKey}`
    }
  );

let evasiveManeuversAfter =
  null;

if (evasiveManeuversDice > 0) {
  evasiveManeuversAfter =
    await consumeEvasiveManeuversReserve(
      actor,
      evasiveManeuversDice
    );
}

if (lowRerollDeclaration?.quality && rerolledDice.length > 0) {
    if (lowRerollDeclaration.spendItemUse === false) {
      await setUseState(actor, lowRerollDeclaration.bucket, lowRerollDeclaration.quality.id);
    } else {
      await spendQualityUse(actor, lowRerollDeclaration.quality, {
        bucket: lowRerollDeclaration.bucket,
        key: lowRerollDeclaration.quality.id
      });
    }
  }

  await consumeTamerActionPoolEffects(
    actor,
    options
  );

  await consumeDigimonActionPoolEffects(
    actor,
    options
  );

  const guidingDiceAfter = guidingDice > 0
    ? await consumeGuidingDice(actor, guidingDice)
    : options.guidingDiceState ?? null;

return {
  roll,

  rolledSuccesses,
  automaticSuccesses,
  totalSuccesses,

  resultModifier,
  adjustedDiceResults,

  evasiveManeuversDice,

  evasiveManeuversRemaining:
    evasiveManeuversAfter?.current ??
    evasiveManeuversReserve?.current ??
    0,

  guidingDiceUsed: guidingDice,
  guidingDiceRemaining: guidingDiceAfter?.current ?? 0,

  luckyNumberResult,
  variableReroll
};
}

function getPoolDialogData(actor, statKey, stat, options = {}) {
  const system = actor.system;

  const currentStance = system.combat?.currentStance ?? "neutral";
  const stageValue = Number(system.stageValue ?? 0);
  const dodgePenalty = statKey === "dodge" ? Number(options.effectiveDodgePenalty ?? system.combat?.dodgePenalty ?? 0) : 0;

  const stanceDiceModifier = getStanceModifier(statKey, currentStance, stageValue);
  const externalDiceModifier = Number(options.diceModifier ?? 0);
  const resultModifier = Number(options.resultModifier ?? 0);
  const resultModifierSummary = String(
    options.resultModifierSummary ??
    formatSigned(resultModifier)
  ).trim();
const statLabel =
  localizeStatLabel(
    statKey,
    stat
  );

const evasiveManeuversReserve =
  options.evasiveManeuversReserve ??
  null;

const evasiveManeuversCurrent =
  Math.max(
    0,
    Number(
      evasiveManeuversReserve
        ?.current ?? 0
    )
  );

const evasiveManeuversControl =
  statKey === "dodge" &&
  evasiveManeuversCurrent > 0
    ? `
      <section class="dda-evasive-maneuvers-control">
        <div class="form-group">
          <label>
            ${localize(
              "DDA.TamerTalent.EvasiveManeuvers.Spend"
            )}
          </label>

          <input
            type="number"
            name="evasiveManeuversDice"
            value="0"
            min="0"
            max="${evasiveManeuversCurrent}"
          />
        </div>

        <p class="hint">
          ${game.i18n.format(
            "DDA.TamerTalent.EvasiveManeuvers.Remaining",
            {
              current:
                evasiveManeuversCurrent,

              max:
                Number(
                  evasiveManeuversReserve
                    ?.max ??
                  evasiveManeuversCurrent
                )
            }
          )}
        </p>
      </section>
    `
    : `
      <input
        type="hidden"
        name="evasiveManeuversDice"
        value="0"
      />
    `;

const guidingDiceState = options.guidingDiceState ?? null;
const guidingDiceCurrent = Math.max(0, Number(guidingDiceState?.current ?? 0));
const guidingDiceControl = guidingDiceCurrent > 0
  ? `
    <section class="dda-guiding-dice-control">
      <div class="form-group">
        <label>${game.i18n?.lang?.startsWith("en") ? "Guiding Dice" : "Dados de Orientação"}</label>
        <input type="number" name="guidingDice" value="0" min="0" max="${guidingDiceCurrent}" />
      </div>
      <p class="hint">
        ${game.i18n?.lang?.startsWith("en")
          ? `Available: ${guidingDiceCurrent}/${Number(guidingDiceState?.max ?? guidingDiceCurrent)} — ${guidingDiceState?.sourceQualityName ?? "Inspiring Guidance"}`
          : `Disponíveis: ${guidingDiceCurrent}/${Number(guidingDiceState?.max ?? guidingDiceCurrent)} — ${guidingDiceState?.sourceQualityName ?? "Orientação Inspiradora"}`}
      </p>
    </section>
  `
  : `<input type="hidden" name="guidingDice" value="0" />`;

const content = `
  <form class="dda-roll-dialog">
    <div class="form-group">
      <label>${localize("DDA.Pool.Stat")}</label>
      <input type="text" value="${statLabel}" readonly />
    </div>

    <div class="form-group">
      <label>${localize("DDA.Pool.BaseDice")}</label>
      <input type="number" value="${Math.max(0, Number(stat.total ?? 0) - Number(options.qualityBaseDicePenalty ?? 0))}" readonly />
    </div>

    <div class="form-group">
      <label>${localize("DDA.Pool.CurrentStance")}</label>
      <input
        type="text"
        value="${formatI18n("DDA.Pool.StanceSummary", {
          stance: getStanceLabel(currentStance),
          modifier: formatSigned(stanceDiceModifier)
        })}"
        readonly
      />
    </div>

    ${
      externalDiceModifier !== 0
        ? `
          <div class="form-group">
            <label>${options.externalLabel ?? localize("DDA.Pool.ExternalBonus")}</label>
            <input type="number" value="${externalDiceModifier}" readonly />
          </div>
        `
        : ""
    }

    ${
  resultModifier !== 0
    ? `
      <div class="form-group">
        <label>${localize("DDA.Pool.Modifiers")}</label>
        <input type="text" value="${resultModifierSummary}" readonly />
      </div>
    `
    : ""
}

    <div class="form-group">
      <label>${localize("DDA.Pool.ManualDiceModifier")}</label>
      <input type="number" name="manualDiceModifier" value="0" />
    </div>

    <div class="form-group">
      <label>${localize("DDA.Pool.AutomaticSuccesses")}</label>
      <input type="number" name="automaticSuccesses" value="${Number(options.automaticSuccesses ?? 0)}" />
${
  Number(options.qualityAutomaticSuccessesTotal ?? options.qualityAutomaticSuccesses ?? 0) > 0
    ? `
<p class="hint dda-roll-quality-hint dda-roll-quality-hint-absolute-evasion">
  <strong>${getAbsoluteEvasionLabel()}:</strong>
  +${Number(options.qualityAutomaticSuccessesTotal ?? options.qualityAutomaticSuccesses ?? 0)} Auto
  ${
    Number(options.qualityAutomaticSuccessesAbsorbed ?? 0) > 0
      ? ` • Absorbed ${Number(options.qualityAutomaticSuccessesAbsorbed ?? 0)}`
      : ""
  }
</p>
    `
    : ""
}
    </div>
    ${evasiveManeuversControl}
    ${guidingDiceControl}
    ${
      statKey === "dodge"
        ? `
          <div class="form-group">
            <label>${localize("DDA.Pool.DodgePenalty")}</label>
            <input type="number" name="dodgePenalty" value="${dodgePenalty}" />
          </div>
        `
        : `<input type="hidden" name="dodgePenalty" value="0" />`
    }

    ${
      statKey === "dodge"
        ? `
          <div class="form-group">
            <label>${localize("DDA.Pool.CoverObscured")}</label>
            <select name="coverBonus">
              <option value="0">${localize("DDA.Label.None")}</option>
              <option value="1">${localize("DDA.Pool.CoverBonus.One")}</option>
              <option value="2">${localize("DDA.Pool.CoverBonus.Two")}</option>
            </select>
          </div>
        `
        : `<input type="hidden" name="coverBonus" value="0" />`
    }
  </form>
`;

  return new Promise((resolve) => {
    new Dialog({
      title: formatI18n("DDA.Pool.RollTitle", { stat: statLabel }),
      content,
      buttons: {
        roll: {
          label: localize("DDA.Button.Roll"),
          callback: (html) => {
            const form = html[0].querySelector("form");

            const automaticSuccesses =
              Number(form.automaticSuccesses.value) + Number(form.coverBonus.value);

resolve({
  manualDiceModifier: Number(form.manualDiceModifier.value),
  externalDiceModifier,
  resultModifier,
  resultModifierSummary,
  automaticSuccesses,
dodgePenalty:
  Number(
    form.dodgePenalty.value
  ),

evasiveManeuversDice:
  Math.min(
    evasiveManeuversCurrent,

    Math.max(
      0,
      Math.floor(
        Number(
          form.elements
            .evasiveManeuversDice
            ?.value ?? 0
        )
      )
    )
  ),

guidingDice:
  Math.min(
    guidingDiceCurrent,
    Math.max(0, Math.floor(Number(form.elements.guidingDice?.value ?? 0)))
  ),

qualityBaseDicePenalty:
  Number(
    options
      .qualityBaseDicePenalty ?? 0
  ),
  qualityAutomaticSuccesses: Number(options.qualityAutomaticSuccesses ?? 0),
  qualityAutomaticSuccessesTotal: Number(options.qualityAutomaticSuccessesTotal ?? options.qualityAutomaticSuccesses ?? 0),
  qualityAutomaticSuccessesAbsorbed: Number(options.qualityAutomaticSuccessesAbsorbed ?? 0),
  stanceDiceModifier
});
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "roll",
      close: () => resolve(null)
    }).render(true);
  });
}

function preparePoolQualityOptions(actor, statKey, stat, options = {}) {
  const prepared = { ...options };

  const baseAutomaticSuccesses = Number(options.automaticSuccesses ?? 0);
  const statAutomaticSuccesses = Math.max(0, Number(stat?.automaticSuccesses ?? 0));

  if (statKey === "dodge" && statAutomaticSuccesses > 0) {
    const rawPenalty = Math.max(0, Number(actor.system?.combat?.dodgePenalty ?? 0));
    const activeAutomaticSuccesses = Math.max(0, statAutomaticSuccesses - rawPenalty);
    const effectiveDodgePenalty = Math.max(0, rawPenalty - statAutomaticSuccesses);

    prepared.automaticSuccesses = baseAutomaticSuccesses + activeAutomaticSuccesses;
    prepared.qualityAutomaticSuccesses = activeAutomaticSuccesses;
    prepared.qualityAutomaticSuccessesTotal = statAutomaticSuccesses;
    prepared.qualityAutomaticSuccessesAbsorbed = Math.min(rawPenalty, statAutomaticSuccesses);
    prepared.qualityBaseDicePenalty = statAutomaticSuccesses;
    prepared.effectiveDodgePenalty = effectiveDodgePenalty;

    return prepared;
  }

  prepared.automaticSuccesses = baseAutomaticSuccesses + statAutomaticSuccesses;
  prepared.qualityAutomaticSuccesses = statAutomaticSuccesses;
  prepared.qualityAutomaticSuccessesTotal = statAutomaticSuccesses;
  prepared.qualityAutomaticSuccessesAbsorbed = 0;
  prepared.qualityBaseDicePenalty = 0;
  return prepared;
}

function getStanceModifier(statKey, stanceKey, stageValue) {
  if (stanceKey === "offensive") {
    if (statKey === "accuracy") return stageValue;
    if (statKey === "dodge") return -stageValue;
  }

  if (stanceKey === "defensive") {
    if (statKey === "accuracy") return -stageValue;
    if (statKey === "dodge") return stageValue;
  }

  return 0;
}

function getStanceLabel(stanceKey) {
  const labels = {
    neutral: "DDA.Stance.Neutral",
    offensive: "DDA.Stance.Offensive",
    defensive: "DDA.Stance.Defensive"
  };

  return game.i18n.localize(labels[stanceKey] ?? CONFIG.DDA?.stances?.[stanceKey] ?? stanceKey);
}

function getAbsoluteEvasionLabel() {
  const key = "DDA.QualityAutomation.AbsoluteEvasion";
  const label = game.i18n.localize(key);

  return label && label !== key
    ? label
    : "Absolute Evasion";
}

function buildQualityAutomaticSuccessesHtml({
  statKey,
  qualityAutomaticSuccessesTotal = 0,
  qualityAutomaticSuccessesActive = 0,
  qualityAutomaticSuccessesAbsorbed = 0
} = {}) {
  if (statKey !== "dodge") return "";
  if (qualityAutomaticSuccessesTotal <= 0) return "";

  const absorbedHtml = qualityAutomaticSuccessesAbsorbed > 0
    ? `
      <span>
        ${localize("DDA.Pool.Modifier.DodgePenalty")} absorbed
        <strong>${qualityAutomaticSuccessesAbsorbed}</strong>.
      </span>
    `
    : "";

  return `
    <li class="pool-quality-automatic-successes">
      <strong>${getAbsoluteEvasionLabel()}</strong>:
      +${qualityAutomaticSuccessesTotal} ${localize("DDA.Pool.AutomaticSuccesses")}.
      ${
        qualityAutomaticSuccessesActive !== qualityAutomaticSuccessesTotal
          ? `<span>Active: <strong>${qualityAutomaticSuccessesActive}</strong>.</span>`
          : ""
      }
      ${absorbedHtml}
    </li>
  `;
}

function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}

function localizeStatLabel(statKey, stat) {
  const labels = {
    accuracy: "DDA.MainStat.Accuracy",
    damage: "DDA.MainStat.Damage",
    dodge: "DDA.MainStat.Dodge",
    armor: "DDA.MainStat.Armor",
    health: "DDA.MainStat.Health"
  };

  const labelKey = labels[statKey];

  if (labelKey) return game.i18n.localize(labelKey);

  return game.i18n.localize(stat?.label ?? statKey ?? "");
}
