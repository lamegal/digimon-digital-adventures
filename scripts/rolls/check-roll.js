import {
  getDDASetting
} from "../settings.js";

import { applySkillTnModifier } from "../rules/campaign-rules.js";
import {
  consumeBusyHandsSkillItem,
  getBusyHandsSkillItems,
  getOfficialTamerTalentUseState,
  hasUnlockedOfficialTamerTalent,
  maybeApplyAvoidingConsequences,
  spendOfficialTamerTalentUse
} from "../rules/tamer-resources.js";

import {
  applyLuckyNumberReward
} from "./lucky-number.js";

import {
  getNaturalExplorerFollowerEffect
} from "../rules/tamer-talent-runtime.js";
import {
  maybeUseLivingEncyclopedia,
  prepareMiracleRoll
} from "../rules/tamer-talent-transversal.js";
import {
  applyCheckPlayerInspiration,
  buildPlayerInspirationNote
} from "../rules/player-inspiration.js";

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

async function chooseBusyHandsSkillItem(
  actor,
  skillKey,
  skill,
  {
    disabled = false
  } = {}
) {
  if (disabled) {
    return null;
  }

  const items =
    getBusyHandsSkillItems(
      actor,
      skillKey
    );

  if (!items.length) {
    return null;
  }

  const skillLabel =
    localizeLabel(
      skill?.label ??
      skillKey
    );

  let itemId =
    null;

  try {
    itemId =
      await foundry
        .applications
        .api
        .DialogV2
        .prompt({
          window: {
            title:
              i18n.localize(
                "DDA.TamerTalent.BusyHands.UseTitle"
              )
          },

          content: `
            <div class="dda-roll-dialog dda-busy-hands-use-dialog">
              <p>
                ${i18n.format(
                  "DDA.TamerTalent.BusyHands.UsePrompt",
                  {
                    actor:
                      `<strong>${escapeHtml(
                        actor.name
                      )}</strong>`,

                    skill:
                      `<strong>${escapeHtml(
                        skillLabel
                      )}</strong>`
                  }
                )}
              </p>

              <div class="form-group">
                <label>
                  ${i18n.localize(
                    "DDA.TamerTalent.BusyHands.Item"
                  )}
                </label>

                <select name="itemId">
                  ${items.map((item) => `
                    <option value="${escapeHtml(
                      item.id
                    )}">
                      ${escapeHtml(
                        item.itemName
                      )}

                      — +${item.bonus}

                      (${escapeHtml(
                        item.crafterName
                      )})
                    </option>
                  `).join("")}
                </select>
              </div>

              <p class="notes">
                ${i18n.localize(
                  "DDA.TamerTalent.BusyHands.UseWarning"
                )}
              </p>
            </div>
          `,

          ok: {
            label:
              i18n.localize(
                "DDA.TamerTalent.BusyHands.Use"
              ),

            callback:
              (_event, button) => {
                return String(
                  button
                    .form
                    .elements
                    .itemId
                    ?.value ??
                  ""
                ).trim();
              }
          },

          rejectClose:
            false,

          modal:
            true
        });
  } catch (_error) {
    itemId =
      null;
  }

  if (!itemId) {
    return null;
  }

  return (
    items.find((item) => {
      return item.id === itemId;
    }) ??
    null
  );
}

export async function rollTamerCheck(
  actor,
  skillKey,
  options = {}
) {
  const system = actor.system;
  const attributeKeyOverride = String(
    options.attributeKeyOverride ?? ""
  ).trim();

  // Some rules explicitly call for an Attribute Skill Check without naming a
  // Skill (for example Blast Evolution's Willpower Skill Check). DDA core
  // rules treat that as 3d6 + Attribute - 1. A lightweight virtual Skill lets
  // those checks use the normal Skill Check pipeline (Aspects, IP, Miracle,
  // Lucky Number, outcome handling, etc.) without inventing a real Skill.
  const storedSkill = system.skills?.[skillKey];
  const skill = storedSkill ?? (attributeKeyOverride
    ? {
        label: system.attributes?.[attributeKeyOverride]?.label ?? attributeKeyOverride,
        value: 0,
        attributes: [attributeKeyOverride],
        ddaAttributeOnly: true
      }
    : null);

  if (!skill) {
    ui.notifications.warn(
      i18n.localize(
        "DDA.Warning.SkillNotFound"
      )
    );

    return null;
  }

  const attributeKey =
    attributeKeyOverride || skill.attributes?.[0];

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

  const livingEncyclopedia = await maybeUseLivingEncyclopedia(
    actor,
    {
      skillKey,
      tn: Number(dialogData.tn ?? 0)
    }
  );

  let heavyForceBonus = 0;
  let heavyForceUsed = false;

  if (
    !livingEncyclopedia.used &&
    !options.skipHeavyForce &&
    ["body", "agility"].includes(attributeKey) &&
    hasUnlockedOfficialTamerTalent(actor, "heavyForce")
  ) {
    const useState = getOfficialTamerTalentUseState(actor, "heavyForce", 1);
    const featsOfStrength = Math.max(
      0,
      Number(actor.system?.skills?.featsOfStrength?.value ?? 0)
    );

    if (useState.value > 0 && featsOfStrength > 0) {
      try {
        heavyForceUsed = Boolean(await foundry.applications.api.DialogV2.confirm({
          window: {
            title: "Heavy Force"
          },
          content: `
            <div class="dda-roll-dialog dda-heavy-force-dialog">
              <p>
                <strong>${escapeHtml(actor.name)}</strong>
                ${game.i18n.lang === "pt-BR"
                  ? `pode adicionar +${featsOfStrength} a este Teste de ${escapeHtml(localizeLabel(attribute.label))}.`
                  : `may add +${featsOfStrength} to this ${escapeHtml(localizeLabel(attribute.label))} Check.`}
              </p>
              <p>${game.i18n.lang === "pt-BR" ? "Uso: uma vez por Descanso." : "Use: Once per Rest."}</p>
            </div>
          `,
          yes: {
            label: game.i18n.lang === "pt-BR" ? "Usar Heavy Force" : "Use Heavy Force"
          },
          no: {
            label: game.i18n.lang === "pt-BR" ? "Não usar" : "Do Not Use"
          },
          rejectClose: false,
          modal: true
        }));
      } catch (_error) {
        heavyForceUsed = false;
      }

      if (heavyForceUsed) {
        const spent = await spendOfficialTamerTalentUse(actor, "heavyForce", 1);
        if (!spent) {
          heavyForceUsed = false;
        } else {
          heavyForceBonus = featsOfStrength;
        }
      }
    }
  }

  const busyHandsItem =
    await chooseBusyHandsSkillItem(
      actor,
      skillKey,
      skill,
      {
        disabled:
          Boolean(
            options.skipBusyHands ||
            livingEncyclopedia.used
          )
      }
    );

  const busyHandsModifier =
    Math.max(
      0,
      Number(
        busyHandsItem?.bonus ??
        0
      )
    );

  const attributeValue = Number(
    attribute.value ?? 0
  );

  let skillValue = Number(
    skill.value ?? 0
  );

  const naturalExplorerFollower = skillKey === "athletics"
    ? getNaturalExplorerFollowerEffect(actor)
    : null;

  if (naturalExplorerFollower) {
    skillValue = Math.max(
      skillValue,
      Number(naturalExplorerFollower.athletics ?? 0)
    );
  }

  const skillModifier =
    skillValue > 0
      ? skillValue
      : -1;

  const manualModifier = Number(
    dialogData.manualModifier ?? 0
  );

  const fixedModifier = Number(
    options.fixedModifier ?? 0
  ) + heavyForceBonus;

  const aspectModifier = livingEncyclopedia.used
    ? 0
    : Number(
        dialogData.aspectModifier ?? 0
      );

  const extraDice = livingEncyclopedia.used
    ? 0
    : Math.max(
        0,
        Number(
          dialogData.extraDice ?? 0
        )
      );

  const tn = Number(
    dialogData.tn ?? 0
  );

  const miracle = livingEncyclopedia.used
    ? { used: false, checkBonus: 0, diceValues: [] }
    : await prepareMiracleRoll(
        actor,
        {
          kind: "check",
          diceCount: 3 + extraDice
        }
      );

  const miracleBonus = Number(
    miracle.checkBonus ?? 0
  );

  const modifier =
    attributeValue +
    skillModifier +
    manualModifier +
    fixedModifier +
    aspectModifier +
    busyHandsModifier +
    miracleBonus;

  const rerollOnes = Boolean(
    options.rerollOnes
  ) &&
    !livingEncyclopedia.used &&
    !miracle.used;

  const diceFormula =
    `${3 + extraDice}d6` +
    (
      rerollOnes
        ? "r=1"
        : ""
    );

  const formula =
    `${diceFormula} + @modifier`;

  let roll = await new Roll(
    formula,
    {
      modifier
    }
  ).evaluate();

  const forcedDiceValues = livingEncyclopedia.used
    ? Array.from({ length: 3 + extraDice }, () => 6)
    : miracle.used
      ? Array.from(miracle.diceValues ?? [])
      : [];

  if (forcedDiceValues.length) {
    const results = roll.dice?.[0]?.results ?? [];
    for (let index = 0; index < Math.min(results.length, forcedDiceValues.length); index += 1) {
      results[index].result = forcedDiceValues[index];
      results[index].active = true;
    }
    roll._total = forcedDiceValues.reduce((total, value) => total + Number(value ?? 0), 0) + modifier;
  }

  const busyHandsConsumption =
    busyHandsItem
      ? await consumeBusyHandsSkillItem(
          actor,
          busyHandsItem.id
        )
      : {
          consumed: false,
          item: null
        };

  let dieResults =
    roll.dice?.[0]?.results ?? [];

  let diceResults = dieResults
    .filter((result) => {
      return result.active !== false;
    })
    .map((result) => {
      return Number(
        result.result ?? 0
      );
    });

  let rerolledOnes = rerollOnes
    ? dieResults.filter((result) => {
        return (
          result.active === false &&
          Number(result.result ?? 0) === 1
        );
      }).length
    : 0;

  let total = Number(
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

  let outcome =
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

  const totalBeforePlayerInspiration = total;

  const playerInspiration = options.allowPlayerInspiration === false
    ? { blocked: false, roll, totalAdjustment: 0, rerolled: false, choices: [] }
    : await applyCheckPlayerInspiration(
        actor,
        {
          roll,
          // Inspiration rerolls the whole Check and replaces prior Talent/Quality
          // rerolls, so intentionally omit the r=1 modifier here.
          formula: `${3 + extraDice}d6 + @modifier`,
          data: { modifier },
          currentLabel: tn
            ? `${total} vs ${tn}`
            : String(total)
        }
      );

  if (playerInspiration.roll) {
    roll = playerInspiration.roll;
  }

  if (playerInspiration.rerolled) {
    rerolledOnes = 0;
  }

  dieResults = roll?.dice?.[0]?.results ?? [];
  diceResults = dieResults
    .filter((result) => result.active !== false)
    .map((result) => Number(result.result ?? 0));

  total = Number(roll?.total ?? total);

  if (playerInspiration.choices?.length) {
    outcome = getTamerCheckOutcome(
      total,
      tn,
      diceResults
    );
  }

  if (!livingEncyclopedia.used) {
    await applyAspectUse(
      actor,
      dialogData.aspectUse
    );
  }

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

  const naturalOutcomeForNote = playerInspiration.choices?.length
    ? outcome
    : originalOutcome;

  const naturalCriticalNote =
    !livingEncyclopedia.used &&
    naturalOutcomeForNote.naturalCritical
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
      : naturalOutcomeForNote.naturalCriticalFailure
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

  const busyHandsNote =
    busyHandsItem
      ? `
        <section class="dda-tamer-talent-result dda-busy-hands-result">
          <p>
            <strong>
              ${i18n.localize(
                "DDA.TamerTalent.BusyHands.Title"
              )}:
            </strong>

            ${i18n.format(
              "DDA.TamerTalent.BusyHands.Used",
              {
                item:
                  escapeHtml(
                    busyHandsItem
                      .itemName
                  ),

                crafter:
                  escapeHtml(
                    busyHandsItem
                      .crafterName
                  ),

                skill:
                  escapeHtml(
                    skillLabel
                  ),

                bonus:
                  busyHandsModifier
              }
            )}
          </p>
        </section>
      `
      : "";

  const heavyForceNote = heavyForceUsed
    ? `
      <section class="dda-tamer-talent-result dda-heavy-force-result">
        <p><strong>Heavy Force:</strong> +${heavyForceBonus}.</p>
      </section>
    `
    : "";

  const naturalExplorerNote = naturalExplorerFollower
    ? `
      <section class="dda-tamer-talent-result dda-natural-explorer-result">
        <p><strong>Natural Explorer:</strong> ${game.i18n.lang === "pt-BR"
          ? `Athletics de ${escapeHtml(naturalExplorerFollower.sourceActorName ?? "Tamer")} foi usado no lugar do valor menor do aliado.`
          : `${escapeHtml(naturalExplorerFollower.sourceActorName ?? "Tamer")}'s Athletics replaced the Ally's lower value.`}</p>
      </section>
    `
    : "";

  const livingEncyclopediaNote = livingEncyclopedia.used
    ? `
      <section class="dda-tamer-talent-result dda-living-encyclopedia-result">
        <p><strong>Living Encyclopedia:</strong> ${String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
          ? "Automatic Critical Success for recalling information at TN 15 or lower."
          : "Sucesso Crítico automático para recordar informação com NA 15 ou menor."}</p>
      </section>
    `
    : "";

  const miracleNote = miracle.used
    ? `
      <section class="dda-tamer-talent-result dda-miracle-result">
        <p><strong>Miracle:</strong> ${miracleBonus >= 0 ? "+" : ""}${miracleBonus}; ${String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "die results chosen by the players" : "resultados dos dados escolhidos pelos jogadores"}.</p>
      </section>
    `
    : "";

  const playerInspirationNote = buildPlayerInspirationNote(
    playerInspiration,
    { kind: "check" }
  );

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

                total: totalBeforePlayerInspiration,

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
          ${busyHandsNote}
          ${heavyForceNote}
          ${naturalExplorerNote}
          ${livingEncyclopediaNote}
          ${miracleNote}
          ${playerInspirationNote}

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

  const luckyNumberResult = livingEncyclopedia.used
    ? { matched: false, skipped: true }
    : await applyLuckyNumberReward(
        actor,
        diceResults,
        {
          source:
            "tamerCheck",

          createChat:
            options.createChat !== false
        }
      );

  let narrativeTalentResult = null;

  if (options.offerNarrativeTalents !== false) {
    const {
      maybeOfferNarrativeTalentAfterCheck
    } = await import(
      "../rules/tamer-talent-narrative.js"
    );

    narrativeTalentResult =
      await maybeOfferNarrativeTalentAfterCheck(
        actor,
        {
          skillKey,
          skillLabel,
          title,
          total,
          tn,
          outcome: outcome.key,
          outcomeLabel: outcome.label
        }
      );
  }

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

    busyHandsModifier,
    busyHandsItem,
    busyHandsConsumption,

    extraDice,

    outcome,
    originalOutcome,
    avoidingConsequences,

    luckyNumberResult,
    livingEncyclopedia,
    miracle,
    playerInspiration,
    narrativeTalentResult
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
    await foundry.applications.api.DialogV2.confirm({
      window: {
        title:
          i18n.localize(
            "DDA.TamerTalent.NoPainNoGain.Title"
          )
      },

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

      no: {
        default: true
      },

      rejectClose: false
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
    <div class="dda-roll-dialog">
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
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    window: {
      title: String(
        options.title ??
        i18n.format(
          "DDA.TamerSkillDialog.Title",
          {
            skill: skillLabel
          }
        )
      )
    },

    content,

    buttons: [
      {
        action: "roll",
        label: i18n.localize(
          "DDA.Button.Roll"
        ),
        default: true,

        callback: (_event, button) => {
          const form = button.form;

          const aspectUse = String(
            form.elements
              .aspectUse?.value ??
            ""
          );

          return {
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
          };
        }
      },

      {
        action: "cancel",
        label: i18n.localize(
          "DDA.Button.Cancel"
        ),
        callback: () => null
      }
    ],

    rejectClose: false
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
