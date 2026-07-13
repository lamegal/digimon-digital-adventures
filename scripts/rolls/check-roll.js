import {
  getDDASetting
} from "../settings.js";

import { applySkillTnModifier } from "../rules/campaign-rules.js";
import {
  getOfficialTamerTalentUseState,
  hasUnlockedOfficialTamerTalent,
  maybeApplyAvoidingConsequences,
  spendOfficialTamerTalentUse
} from "../rules/tamer-resources.js";

import {
  applyLuckyNumberReward
} from "./lucky-number.js";

const i18n = {
  localize(key) {
    return game.i18n.localize(key);
  },

  format(key, data = {}) {
    return game.i18n.format(key, data);
  }
};

function localizeLabel(label) {
  return game.i18n.localize(label ?? "");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function rollTamerCheck(
  actor,
  skillKey,
  options = {}
) {
  const system = actor.system;
  const skill = system.skills?.[skillKey];

  if (!skill) {
    ui.notifications.warn(
      i18n.localize(
        "DDA.Warning.SkillNotFound"
      )
    );

    return null;
  }

  const attributeKey =
    skill.attributes?.[0];

  if (!attributeKey) {
    ui.notifications.warn(
      i18n.localize(
        "DDA.Warning.SkillHasNoAttribute"
      )
    );

    return null;
  }

  const attribute =
    system.attributes?.[attributeKey];

  if (!attribute) {
    ui.notifications.warn(
      i18n.localize(
        "DDA.Warning.AttributeNotFound"
      )
    );

    return null;
  }

  const presetAspectUse = String(
    options.aspectUse ?? ""
  );

  const dialogData = options.skipDialog
    ? {
        tn: Number(
          options.fixedTn ??
          options.tn ??
          0
        ),

        manualModifier: Number(
          options.manualModifier ?? 0
        ),

        extraDice: Math.max(
          0,
          Number(options.extraDice ?? 0)
        ),

        aspectUse: presetAspectUse,

        aspectModifier:
          getAspectModifier(
            presetAspectUse
          )
      }
    : await getTamerCheckDialogData(
        actor,
        skill,
        options
      );

  if (!dialogData) return null;

  const attributeValue = Number(
    attribute.value ?? 0
  );

  const skillValue = Number(
    skill.value ?? 0
  );

  const skillModifier =
    skillValue > 0
      ? skillValue
      : -1;

  const manualModifier = Number(
    dialogData.manualModifier ?? 0
  );

  const fixedModifier = Number(
    options.fixedModifier ?? 0
  );

  const aspectModifier = Number(
    dialogData.aspectModifier ?? 0
  );

  const extraDice = Math.max(
    0,
    Number(
      dialogData.extraDice ?? 0
    )
  );

  const tn = Number(
    dialogData.tn ?? 0
  );

  const modifier =
    attributeValue +
    skillModifier +
    manualModifier +
    fixedModifier +
    aspectModifier;

  const rerollOnes = Boolean(
    options.rerollOnes
  );

  const diceFormula =
    `${3 + extraDice}d6` +
    (
      rerollOnes
        ? "r=1"
        : ""
    );

  const formula =
    `${diceFormula} + @modifier`;

  const roll = await new Roll(
    formula,
    {
      modifier
    }
  ).evaluate();

  const dieResults =
    roll.dice?.[0]?.results ?? [];

  const diceResults = dieResults
    .filter((result) => {
      return result.active !== false;
    })
    .map((result) => {
      return Number(
        result.result ?? 0
      );
    });

  const rerolledOnes = rerollOnes
    ? dieResults.filter((result) => {
        return (
          result.active === false &&
          Number(result.result ?? 0) === 1
        );
      }).length
    : 0;

  const total = Number(
    roll.total ?? 0
  );

  const originalOutcome =
    getTamerCheckOutcome(
      total,
      tn,
      diceResults
    );

  const avoidingConsequences =
    await maybeApplyAvoidingConsequences(
      actor,
      {
        total,
        tn,

        outcomeKey:
          originalOutcome.key,

        naturalCriticalFailure:
          originalOutcome
            .naturalCriticalFailure,

        sourceLabel:
          localizeLabel(
            skill.label
          )
      }
    );

  const outcome =
    avoidingConsequences.used
      ? {
          ...originalOutcome,

          key:
            avoidingConsequences
              .outcomeKey,

          label:
            i18n.localize(
              "DDA.Check.Failure"
            ),

          naturalCritical: false,
          naturalCriticalFailure: false
        }
      : originalOutcome;

  const noPainNoGain =
    await maybeApplyNoPainNoGain(
      actor,
      {
        skillKey,
        skill,
        attributeKey,
        attribute,
        attributeValue,

        tn,
        manualModifier,
        fixedModifier,
        aspectModifier,
        extraDice,
        rerollOnes,

        originalRoll:
          roll,

        originalFormula:
          formula,

        originalDiceResults:
          diceResults,

        originalRerolledOnes:
          rerolledOnes,

        originalTotal:
          total,

        originalOutcome,

        originalFinalOutcome:
          outcome,

        originalAvoidingConsequences:
          avoidingConsequences,

        aspectUse:
          dialogData.aspectUse,

        title:
          String(
            options.title ??
            i18n.format(
              "DDA.TamerSkillDialog.Title",
              {
                skill:
                  localizeLabel(
                    skill.label
                  )
              }
            )
          ),

        createChat:
          options.createChat !== false,

        disabled:
          Boolean(
            options.skipNoPainNoGain
          )
      }
    );

  if (noPainNoGain.used) {
    return noPainNoGain.result;
  }

  await applyAspectUse(
    actor,
    dialogData.aspectUse
  );

  const skillLabel =
    localizeLabel(skill.label);

  const attributeLabel =
    localizeLabel(attribute.label);

  const title = String(
    options.title ??
    i18n.format(
      "DDA.TamerSkillDialog.Title",
      {
        skill: skillLabel
      }
    )
  );

  const naturalCriticalNote =
    originalOutcome.naturalCritical
      ? `
        <p>
          <strong>
            ${i18n.localize(
              "DDA.Check.NaturalCritical"
            )}:
          </strong>

          ${i18n.localize(
            "DDA.Check.TripleSix"
          )}.
        </p>
      `
      : originalOutcome.naturalCriticalFailure
        ? `
          <p>
            <strong>
              ${i18n.localize(
                "DDA.Check.NaturalCriticalFailure"
              )}:
            </strong>

            ${i18n.localize(
              "DDA.Check.TripleOne"
            )}.
          </p>
        `
        : "";

  const fixedModifierNote =
    fixedModifier !== 0
      ? `
        <p>
          <strong>
            ${i18n.localize(
              "DDA.TamerAction.Teamwork.Bonus"
            )}:
          </strong>

          ${formatSigned(
            fixedModifier
          )}.
        </p>
      `
      : "";

  const rerollNote =
    rerolledOnes > 0
      ? `
        <p>
          <strong>
            ${i18n.localize(
              "DDA.TamerAction.Teamwork.TeamPlayer"
            )}:
          </strong>

          ${i18n.format(
            "DDA.TamerAction.Teamwork.OnesRerolled",
            {
              amount: rerolledOnes
            }
          )}
        </p>
      `
      : "";

  const avoidingConsequencesNote =
    avoidingConsequences.used
      ? `
        <section class="dda-tamer-talent-result dda-avoiding-consequences-result">
          <p>
            <strong>
              ${i18n.localize(
                "DDA.TamerTalent.AvoidingConsequences.Title"
              )}:
            </strong>

            ${i18n.format(
              "DDA.TamerTalent.AvoidingConsequences.Applied",
              {
                evade:
                  avoidingConsequences.evade,

                total,

                adjusted:
                  avoidingConsequences
                    .adjustedTotal,

                tn
              }
            )}
          </p>
        </section>
      `
      : "";

  const content = `
    <div class="dda-chat-roll-message dda-tamer-check-message">
      <div class="dda-tamer-check-shell dda-chat-roll-shell">
        <div class="dda-chat-card dda-effect-card effect-special dda-tamer-check-card dda-check-card dda-check-${outcome.key}">
          <h2>
            ${escapeHtml(title)}
          </h2>

          <p>
            <strong>
              ${escapeHtml(attributeLabel)}
            </strong>

            ${attributeValue}

            ${
              skillValue > 0
                ? `
                  + <strong>
                    ${escapeHtml(skillLabel)}
                  </strong>

                  ${skillValue}
                `
                : `
                  - 1
                  ${i18n.localize(
                    "DDA.TamerSkillDialog.Untrained"
                  )}
                `
            }

            ${
              manualModifier !== 0
                ? `
                  ${formatSigned(
                    manualModifier
                  )}

                  ${i18n.localize(
                    "DDA.Abbrev.Modifier"
                  )}
                `
                : ""
            }

            ${
              aspectModifier !== 0
                ? `
                  ${formatSigned(
                    aspectModifier
                  )}

                  ${i18n.localize(
                    "DDA.TamerSkillDialog.Aspect"
                  )}
                `
                : ""
            }
          </p>

          ${fixedModifierNote}

          <p>
            <strong>
              ${i18n.localize(
                "DDA.Roll.Dice"
              )}:
            </strong>

            ${diceResults.join(", ")}
          </p>

          <p>
            <strong>
              ${i18n.localize(
                "DDA.Roll.TN"
              )}:
            </strong>

            ${tn || "—"}
          </p>

          ${
            tn
              ? `
                <p>
                  <strong>
                    ${i18n.localize(
                      "DDA.Roll.Result"
                    )}:
                  </strong>

                  ${outcome.label}
                </p>
              `
              : ""
          }

          ${rerollNote}
          ${avoidingConsequencesNote}
          ${naturalCriticalNote}
        </div>
      </div>

      ${await roll.render()}
    </div>
  `;

  if (options.createChat !== false) {
    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor
        }),

      content,

      rolls: [roll]
    });
  }

  const luckyNumberResult =
    await applyLuckyNumberReward(
      actor,
      diceResults,
      {
        source:
          "tamerCheck",

        createChat:
          options.createChat !== false
      }
    );

  return {
    actor,
    skillKey,
    skill,
    skillLabel,

    attributeKey,
    attribute,
    attributeLabel,

    roll,
    formula,

    tn,
    total,

    diceResults,
    rerolledOnes,

    attributeValue,
    skillValue,
    skillModifier,

    manualModifier,
    fixedModifier,
    aspectModifier,
    extraDice,

    outcome,
    originalOutcome,
    avoidingConsequences,

    luckyNumberResult
  };
}

async function maybeApplyNoPainNoGain(
  actor,
  {
    skillKey = "",
    skill = null,
    attributeKey = "",
    attribute = null,
    attributeValue = 0,

    tn = 0,
    manualModifier = 0,
    fixedModifier = 0,
    aspectModifier = 0,
    extraDice = 0,
    rerollOnes = false,

    originalRoll = null,
    originalFormula = "",
    originalDiceResults = [],
    originalRerolledOnes = 0,
    originalTotal = 0,
    originalOutcome = {},
    originalFinalOutcome = {},
    originalAvoidingConsequences = {},

    aspectUse = "",
    title = "",
    createChat = true,
    disabled = false
  } = {}
) {
  const failed = [
    "failure",
    "criticalFailure"
  ].includes(
    String(
      originalFinalOutcome?.key ?? ""
    )
  );

  if (
    disabled ||
    !failed ||
    Number(tn ?? 0) <= 0 ||
    !hasUnlockedOfficialTamerTalent(
      actor,
      "noPainNoGain"
    )
  ) {
    return {
      used: false
    };
  }

  const enduranceSkill =
    actor.system?.skills
      ?.endurance;

  if (!enduranceSkill) {
    return {
      used: false
    };
  }

  const useState =
    getOfficialTamerTalentUseState(
      actor,
      "noPainNoGain",
      1
    );

  if (
    !useState.enabled ||
    useState.value < 1
  ) {
    return {
      used: false,
      useState
    };
  }

  const confirmed =
    await Dialog.confirm({
      title:
        i18n.localize(
          "DDA.TamerTalent.NoPainNoGain.Title"
        ),

      content: `
        <div class="dda-confirm-dialog dda-no-pain-no-gain-dialog">
          <p>
            ${i18n.format(
              "DDA.TamerTalent.NoPainNoGain.Prompt",
              {
                actor:
                  `<strong>${escapeHtml(
                    actor.name
                  )}</strong>`,

                source:
                  `<strong>${escapeHtml(
                    localizeLabel(
                      skill?.label ??
                      skillKey
                    )
                  )}</strong>`,

                result:
                  `<strong>${escapeHtml(
                    originalFinalOutcome
                      ?.label ?? ""
                  )}</strong>`
              }
            )}
          </p>

          <p>
            ${i18n.format(
              "DDA.TamerTalent.NoPainNoGain.CostSummary",
              {
                uses:
                  useState.value,

                max:
                  useState.max
              }
            )}
          </p>
        </div>
      `,

      yes: () => true,
      no: () => false,
      defaultYes: false
    });

  if (!confirmed) {
    return {
      used: false,
      useState
    };
  }

  const payment =
    await spendOfficialTamerTalentUse(
      actor,
      "noPainNoGain",
      1
    );

  if (!payment) {
    ui.notifications.warn(
      i18n.localize(
        "DDA.TamerTalent.NoPainNoGain.PaymentFailed"
      )
    );

    return {
      used: false,
      useState
    };
  }

  const skillValue = Number(
    enduranceSkill.value ?? 0
  );

  const skillModifier =
    skillValue > 0
      ? skillValue
      : -1;

  const modifier =
    Number(attributeValue ?? 0) +
    skillModifier +
    Number(manualModifier ?? 0) +
    Number(fixedModifier ?? 0) +
    Number(aspectModifier ?? 0);

  const diceFormula =
    `${3 + Math.max(
      0,
      Number(extraDice ?? 0)
    )}d6` +
    (
      rerollOnes
        ? "r=1"
        : ""
    );

  const formula =
    `${diceFormula} + @modifier`;

  const roll = await new Roll(
    formula,
    {
      modifier
    }
  ).evaluate();

  const dieResults =
    roll.dice?.[0]?.results ?? [];

  const diceResults = dieResults
    .filter((result) => {
      return result.active !== false;
    })
    .map((result) => {
      return Number(
        result.result ?? 0
      );
    });

  const rerolledOnes = rerollOnes
    ? dieResults.filter((result) => {
        return (
          result.active === false &&
          Number(
            result.result ?? 0
          ) === 1
        );
      }).length
    : 0;

  const total = Number(
    roll.total ?? 0
  );

  const rerollOriginalOutcome =
    getTamerCheckOutcome(
      total,
      Number(tn ?? 0),
      diceResults
    );

  const avoidingConsequences =
    await maybeApplyAvoidingConsequences(
      actor,
      {
        total,
        tn,

        outcomeKey:
          rerollOriginalOutcome.key,

        naturalCriticalFailure:
          rerollOriginalOutcome
            .naturalCriticalFailure,

        sourceLabel:
          localizeLabel(
            enduranceSkill.label
          )
      }
    );

  const outcome =
    avoidingConsequences.used
      ? {
          ...rerollOriginalOutcome,

          key:
            avoidingConsequences
              .outcomeKey,

          label:
            i18n.localize(
              "DDA.Check.Failure"
            ),

          naturalCritical: false,
          naturalCriticalFailure: false
        }
      : rerollOriginalOutcome;

  await applyAspectUse(
    actor,
    aspectUse
  );

  const skillLabel =
    localizeLabel(
      enduranceSkill.label
    );

  const attributeLabel =
    localizeLabel(
      attribute?.label ??
      attributeKey
    );

  const avoidingConsequencesNote =
    avoidingConsequences.used
      ? `
        <li>
          <strong>
            ${i18n.localize(
              "DDA.TamerTalent.AvoidingConsequences.Title"
            )}:
          </strong>

          ${i18n.format(
            "DDA.TamerTalent.AvoidingConsequences.Applied",
            {
              evade:
                avoidingConsequences.evade,

              total,

              adjusted:
                avoidingConsequences
                  .adjustedTotal,

              tn
            }
          )}
        </li>
      `
      : "";

  const content = `
    <div class="dda-chat-roll-message dda-tamer-check-message">
      <div class="dda-tamer-check-shell dda-chat-roll-shell">
        <div class="dda-chat-card dda-effect-card effect-special dda-tamer-check-card dda-check-card dda-check-${outcome.key}">
          <h2>
            ${escapeHtml(title)}
          </h2>

          <ul class="dda-effect-list">
            <li>
              <strong>
                ${i18n.localize(
                  "DDA.TamerTalent.NoPainNoGain.Title"
                )}:
              </strong>

              ${i18n.format(
                "DDA.TamerTalent.NoPainNoGain.Applied",
                {
                  originalSkill:
                    localizeLabel(
                      skill?.label ??
                      skillKey
                    ),

                  originalTotal,

                  originalResult:
                    originalFinalOutcome
                      ?.label ?? "",

                  finalTotal:
                    total,

                  finalResult:
                    outcome.label
                }
              )}
            </li>

            <li>
              ${i18n.localize(
                "DDA.TamerTalent.Requirement.Attribute"
              )}:

              <strong>
                ${escapeHtml(
                  attributeLabel
                )}
              </strong>

              ${Number(
                attributeValue ?? 0
              )}.
            </li>

            <li>
              ${i18n.localize(
                "DDA.TamerTalent.Requirement.Skill"
              )}:

              <strong>
                ${escapeHtml(
                  skillLabel
                )}
              </strong>

              ${skillValue}.
            </li>

            <li>
              ${i18n.localize(
                "DDA.Roll.Dice"
              )}:

              <strong>
                ${diceResults.join(", ")}
              </strong>.
            </li>

            <li>
              ${i18n.localize(
                "DDA.Roll.TN"
              )}:

              <strong>${tn}</strong>.
            </li>

            <li>
              ${i18n.localize(
                "DDA.Roll.Result"
              )}:

              <strong>
                ${outcome.label}
              </strong>.
            </li>

            ${avoidingConsequencesNote}
          </ul>
        </div>
      </div>

      ${await originalRoll.render()}
      ${await roll.render()}
    </div>
  `;

  if (createChat) {
    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor
        }),

      content,

      rolls: [
        originalRoll,
        roll
      ]
    });
  }

  const luckyNumberResult =
    await applyLuckyNumberReward(
      actor,
      diceResults,
      {
        source:
          "tamerCheck",

        createChat
      }
    );

  const result = {
    actor,

    skillKey:
      "endurance",

    skill:
      enduranceSkill,

    skillLabel,

    originalSkillKey:
      skillKey,

    originalSkill:
      skill,

    attributeKey,
    attribute,
    attributeLabel,

    roll,
    formula,

    tn,
    total,

    diceResults,
    rerolledOnes,

    attributeValue:
      Number(attributeValue ?? 0),

    skillValue,
    skillModifier,

    manualModifier,
    fixedModifier,
    aspectModifier,
    extraDice,

    outcome,

    originalOutcome:
      rerollOriginalOutcome,

    avoidingConsequences,

    noPainNoGain: {
      used: true,
      payment,
      useState,

      original: {
        roll:
          originalRoll,

        formula:
          originalFormula,

        diceResults:
          originalDiceResults,

        rerolledOnes:
          originalRerolledOnes,

        total:
          originalTotal,

        originalOutcome,

        outcome:
          originalFinalOutcome,

        avoidingConsequences:
          originalAvoidingConsequences
      }
    },

    luckyNumberResult
  };

  return {
    used: true,
    result
  };
}

function getTamerCheckDialogData(
  actor,
  skill,
  options = {}
) {
  const targetNumbers =
    CONFIG.DDA?.targetNumbers ?? {};

  const skillLabel =
    localizeLabel(skill.label);

  const requestedTn = Number(
    options.tn ?? 0
  );

  const fixedTnValue = Number(
    options.fixedTn
  );

  const hasFixedTn =
    options.fixedTn !== undefined &&
    options.fixedTn !== null &&
    Number.isFinite(fixedTnValue);

  const tnOptions = Object
    .entries(targetNumbers)
    .map(([key, tn]) => {
      const label = localizeLabel(
        tn.label ?? key
      );

      const baseValue = Number(
        tn.value ?? 0
      );

      const value =
        applySkillTnModifier(
          baseValue
        );

      const selected =
        value === requestedTn
          ? "selected"
          : "";

      return `
        <option
          value="${value}"
          ${selected}
        >
          ${label} (${value})
        </option>
      `;
    })
    .join("");

  const tnControl = hasFixedTn
    ? `
      <input
        type="number"
        name="tn"
        value="${fixedTnValue}"
        readonly
      />
    `
    : `
      <select name="tn">
        <option
          value="0"
          ${
            requestedTn === 0
              ? "selected"
              : ""
          }
        >
          ${i18n.localize(
            "DDA.TamerSkillDialog.NoTN"
          )}
        </option>

        ${tnOptions}
      </select>
    `;

  const fixedModifier = Number(
    options.fixedModifier ?? 0
  );

  const modifierHint = String(
    options.modifierHint ?? ""
  ).trim();

  const content = `
    <form class="dda-roll-dialog">
      <div class="form-group">
        <label>
          ${i18n.localize(
            "DDA.TamerSkillDialog.Skill"
          )}
        </label>

        <input
          type="text"
          value="${escapeHtml(skillLabel)}"
          readonly
        />
      </div>

      <div class="form-group">
        <label>
          ${i18n.localize(
            "DDA.Roll.TN"
          )}
        </label>

        ${tnControl}
      </div>

      ${
        fixedModifier !== 0
          ? `
            <div class="form-group">
              <label>
                ${i18n.localize(
                  "DDA.TamerAction.Teamwork.Bonus"
                )}
              </label>

              <input
                type="number"
                value="${fixedModifier}"
                readonly
              />
            </div>
          `
          : ""
      }

      ${
        modifierHint
          ? `
            <p class="hint">
              ${escapeHtml(
                modifierHint
              )}
            </p>
          `
          : ""
      }

      <div class="form-group">
        <label>
          ${i18n.localize(
            "DDA.TamerSkillDialog.ManualModifier"
          )}
        </label>

        <input
          type="number"
          name="manualModifier"
          value="${Number(
            options.manualModifier ?? 0
          )}"
        />
      </div>

      <div class="form-group">
        <label>
          ${i18n.localize(
            "DDA.TamerSkillDialog.ExtraDice"
          )}
        </label>

        <input
          type="number"
          name="extraDice"
          value="${Math.max(
            0,
            Number(
              options.extraDice ?? 0
            )
          )}"
          min="0"
        />
      </div>

      <div class="form-group">
        <label>
          ${i18n.localize(
            "DDA.TamerSkillDialog.Aspect"
          )}
        </label>

        <select name="aspectUse">
          <option value="">
            ${i18n.localize(
              "DDA.TamerSkillDialog.NoAspect"
            )}
          </option>

          <option value="majorPositive">
            ${i18n.localize(
              "DDA.TamerSkillDialog.AspectMajorPositive"
            )}
          </option>

          <option value="minorPositive">
            ${i18n.localize(
              "DDA.TamerSkillDialog.AspectMinorPositive"
            )}
          </option>

          <option value="majorNegative">
            ${i18n.localize(
              "DDA.TamerSkillDialog.AspectMajorNegative"
            )}
          </option>

          <option value="minorNegative">
            ${i18n.localize(
              "DDA.TamerSkillDialog.AspectMinorNegative"
            )}
          </option>
        </select>
      </div>
    </form>
  `;

  return new Promise((resolve) => {
    new Dialog({
      title: String(
        options.title ??
        i18n.format(
          "DDA.TamerSkillDialog.Title",
          {
            skill: skillLabel
          }
        )
      ),

      content,

      buttons: {
        roll: {
          label: i18n.localize(
            "DDA.Button.Roll"
          ),

          callback: (html) => {
            const root =
              html instanceof jQuery
                ? html[0]
                : html;

            const form =
              root.querySelector("form");

            const aspectUse = String(
              form.elements
                .aspectUse?.value ??
              ""
            );

            resolve({
              tn: Number(
                form.elements
                  .tn?.value ?? 0
              ),

              manualModifier: Number(
                form.elements
                  .manualModifier
                  ?.value ?? 0
              ),

              extraDice: Number(
                form.elements
                  .extraDice
                  ?.value ?? 0
              ),

              aspectUse,

              aspectModifier:
                getAspectModifier(
                  aspectUse
                )
            });
          }
        },

        cancel: {
          label: i18n.localize(
            "DDA.Button.Cancel"
          ),

          callback: () =>
            resolve(null)
        }
      },

      default: "roll",

      close: () =>
        resolve(null)
    }).render(true);
  });
}

function getAspectModifier(aspectUse) {
  const modifiers = {
    majorPositive: 4,
    minorPositive: 2,
    majorNegative: -4,
    minorNegative: -2
  };

  return modifiers[aspectUse] ?? 0;
}

async function applyAspectUse(actor, aspectUse) {
  if (!aspectUse) return;

  const system = actor.system;
  const updates = {};

  if (aspectUse === "majorPositive") {
    const current = Number(system.aspects.major.uses.value ?? 0);
    updates["system.aspects.major.uses.value"] = Math.max(0, current - 1);
  }

  if (aspectUse === "minorPositive") {
    const current = Number(system.aspects.minor.uses.value ?? 0);
    updates["system.aspects.minor.uses.value"] = Math.max(0, current - 1);
  }

  if (aspectUse === "majorNegative") {
    const max = Number(system.aspects.major.uses.max ?? 1);
    const ipCurrent = Number(system.resources.ip.value ?? 0);
    const ipMax = Number(system.resources.ip.max ?? 0);

    updates["system.aspects.major.uses.value"] = max;
    updates["system.resources.ip.value"] = Math.min(ipMax, ipCurrent + 1);
  }

  if (aspectUse === "minorNegative") {
    const max = Number(system.aspects.minor.uses.max ?? 2);
    updates["system.aspects.minor.uses.value"] = max;
  }

  if (Object.keys(updates).length > 0) {
    await actor.update(updates);
  }
}

export function getTamerCheckOutcome(
  total,
  tn,
  diceResults = []
) {
  if (!tn) {
    return {
      key: "none",
      label: i18n.localize("DDA.Check.NoTN"),
      naturalCritical: false,
      naturalCriticalFailure: false
    };
  }

  const naturalCriticals = getDDASetting("naturalCriticals");

  const allSixes = diceResults.length === 3 && diceResults.every((die) => die === 6);
  const allOnes = diceResults.length === 3 && diceResults.every((die) => die === 1);

  if (naturalCriticals && allSixes) {
    return {
      key: "criticalSuccess",
      label: i18n.localize("DDA.Check.CriticalSuccess"),
      naturalCritical: true,
      naturalCriticalFailure: false
    };
  }

  if (naturalCriticals && allOnes) {
    return {
      key: "criticalFailure",
      label: i18n.localize("DDA.Check.CriticalFailure"),
      naturalCritical: false,
      naturalCriticalFailure: true
    };
  }

  if (total >= tn + 5) {
    return {
      key: "criticalSuccess",
      label: i18n.localize("DDA.Check.CriticalSuccess"),
      naturalCritical: false,
      naturalCriticalFailure: false
    };
  }

  if (total >= tn) {
    return {
      key: "success",
      label: i18n.localize("DDA.Check.Success"),
      naturalCritical: false,
      naturalCriticalFailure: false
    };
  }

  if (total <= tn - 5) {
    return {
      key: "criticalFailure",
      label: i18n.localize("DDA.Check.CriticalFailure"),
      naturalCritical: false,
      naturalCriticalFailure: false
    };
  }

  return {
    key: "failure",
    label: i18n.localize("DDA.Check.Failure"),
    naturalCritical: false,
    naturalCriticalFailure: false
  };
}

function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}