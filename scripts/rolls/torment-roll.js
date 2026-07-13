import {
  getDDASetting
} from "../settings.js";

import {
  hasUnlockedOfficialTamerTalent,
  maybeApplyAvoidingConsequences
} from "../rules/tamer-resources.js";

import {
  rollDerivedCheck
} from "../rules/quality-automation.js";

import {
  payPartnerInterruptAction
} from "../combat/tamer-actions.js";

import {
  applyLuckyNumberReward
} from "./lucky-number.js";

export async function rollTormentCheck(
  actor,
  tormentItem
) {
  if (
    !actor ||
    actor.type !== "character"
  ) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.TormentCheckOnlyForTamers"
      )
    );

    return null;
  }

  if (
    !tormentItem ||
    tormentItem.type !== "torment"
  ) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.SelectValidTorment"
      )
    );

    return null;
  }

  const system = actor.system;
  const tormentSystem = tormentItem.system;

  const boxes = Number(
    tormentSystem.boxes?.value ?? 0
  );

  const harderTorments =
    getDDASetting("harderTorments");

  const mechanicalTorments =
    getDDASetting("mechanicalTorments");

  const naturalCriticals =
    getDDASetting("naturalCriticals");

  const baseTn =
    harderTorments
      ? 10
      : 8;

  const tn =
    baseTn + boxes;

  /* --------------------------------------------------- */
  /* Break the Chain                                     */
  /* --------------------------------------------------- */

  const breakTheChainUnlocked =
    hasUnlockedOfficialTamerTalent(
      actor,
      "breakTheChain"
    );

  const braveryValue =
    getTamerSkillValue(
      actor,
      "bravery"
    );

  const breakTheChainBonus =
    breakTheChainUnlocked
      ? braveryValue
      : 0;

  const breakTheChainBlock =
    breakTheChainUnlocked
      ? `
        <section class="dda-torment-talent-summary dda-break-the-chain-summary">
          <strong>
            Break the Chain
          </strong>

          <span>
            ${formatI18n(
              "DDA.Torment.BreakTheChain.Hint",
              {
                bonus:
                  breakTheChainBonus
              }
            )}
          </span>
        </section>
      `
      : "";

  /* --------------------------------------------------- */
  /* With the Will                                       */
  /* --------------------------------------------------- */

  const withTheWillUnlocked =
    hasUnlockedOfficialTamerTalent(
      actor,
      "withTheWill"
    );

  const withTheWillUses =
    getOfficialTalentUses(
      actor,
      "withTheWill",
      1
    );

  const withTheWillPartner =
    withTheWillUnlocked
      ? await resolveTormentPartner(
          actor
        )
      : null;

  const withTheWillAvailable =
    Boolean(
      withTheWillUnlocked &&
      withTheWillPartner &&
      withTheWillUses > 0
    );

  const withTheWillBlock =
    withTheWillAvailable
      ? `
        <section class="dda-torment-teamwork-option dda-with-the-will-option">
          <label class="dda-torment-talent-toggle">
            <input
              type="checkbox"
              name="useWithTheWill"
            />

            <span>
              <strong>
                With the Will
              </strong>

              ${localize(
                "DDA.Torment.WithTheWill.Hint"
              )}
            </span>
          </label>

          <div class="form-group">
            <label>
              ${localize(
                "DDA.Torment.WithTheWill.HelperTN"
              )}
            </label>

            <input
              type="number"
              name="withTheWillTn"
              value="14"
              min="14"
              max="20"
            />
          </div>

          <label class="dda-torment-condition">
            <input
              type="checkbox"
              name="withTheWillCanHear"
            />

            <span>
              ${localize(
                "DDA.Torment.WithTheWill.CanHear"
              )}
            </span>
          </label>

          <label class="dda-torment-condition">
            <input
              type="checkbox"
              name="withTheWillInRange"
            />

            <span>
              ${localize(
                "DDA.Torment.WithTheWill.InRange"
              )}
            </span>
          </label>

          <p class="notes">
            ${formatI18n(
              "DDA.Torment.WithTheWill.Partner",
              {
                partner:
                  escapeHtml(
                    withTheWillPartner.name
                  ),

                uses:
                  withTheWillUses
              }
            )}
          </p>
        </section>
      `
      : "";

  /* --------------------------------------------------- */
  /* Diálogo inicial                                     */
  /* --------------------------------------------------- */

  const dialogResult =
    await Dialog.prompt({
      title:
        formatI18n(
          "DDA.Torment.RollTitleWithName",
          {
            torment:
              tormentItem.name
          }
        ),

      content: `
        <form class="dda-roll-dialog dda-torment-roll-dialog">
          <div class="form-group">
            <label>
              ${localize(
                "DDA.Roll.TN"
              )}
            </label>

            <input
              type="number"
              name="tn"
              value="${tn}"
            />
          </div>

          <div class="form-group">
            <label>
              ${localize(
                "DDA.TamerSkillDialog.ManualModifier"
              )}
            </label>

            <input
              type="number"
              name="modifier"
              value="0"
            />
          </div>

          ${breakTheChainBlock}
          ${withTheWillBlock}

          <p class="notes">
            ${formatI18n(
              "DDA.Torment.BaseTnNote",
              {
                baseTn,
                boxes
              }
            )}
          </p>
        </form>
      `,

      label:
        localize(
          "DDA.Button.Roll"
        ),

      callback: (html) => {
        const root =
          html instanceof jQuery
            ? html[0]
            : html;

        const form =
          root.querySelector("form");

        return {
          tn:
            Number(
              form.elements
                .tn?.value ?? tn
            ),

          modifier:
            Number(
              form.elements
                .modifier?.value ?? 0
            ),

          useWithTheWill:
            Boolean(
              form.elements
                .useWithTheWill
                ?.checked
            ),

          withTheWillCanHear:
            Boolean(
              form.elements
                .withTheWillCanHear
                ?.checked
            ),

          withTheWillInRange:
            Boolean(
              form.elements
                .withTheWillInRange
                ?.checked
            ),

          withTheWillTn:
            Math.min(
              20,
              Math.max(
                14,
                Number(
                  form.elements
                    .withTheWillTn
                    ?.value ?? 14
                )
              )
            )
        };
      }
    });

  if (!dialogResult) {
    return null;
  }

  const finalTn =
    Number(
      dialogResult.tn ?? tn
    );

  const manualModifier =
    Number(
      dialogResult.modifier ?? 0
    );

  /* --------------------------------------------------- */
  /* With the Will — ajuda do parceiro                   */
  /* --------------------------------------------------- */

  let withTheWillResult = null;
  let withTheWillBonus = 0;

  if (dialogResult.useWithTheWill) {
    if (
      !withTheWillUnlocked ||
      !withTheWillPartner
    ) {
      ui.notifications.warn(
        localize(
          "DDA.Warning.NoPartnerLinked"
        )
      );

      return null;
    }

    if (withTheWillUses <= 0) {
      ui.notifications.warn(
        localize(
          "DDA.Torment.Warning.WithTheWillNoUses"
        )
      );

      return null;
    }

    if (
      !dialogResult.withTheWillCanHear ||
      !dialogResult.withTheWillInRange
    ) {
      ui.notifications.warn(
        localize(
          "DDA.Torment.Warning.WithTheWillConditions"
        )
      );

      return null;
    }

    const combatActive =
      Boolean(
        game.combat?.started
      );

    if (
      combatActive &&
      !isActorInCurrentCombat(
        withTheWillPartner
      )
    ) {
      ui.notifications.warn(
        localize(
          "DDA.Torment.Warning.PartnerNotInCombat"
        )
      );

      return null;
    }


    const helperTn =
      Number(
        dialogResult.withTheWillTn ?? 14
      );

    const helperCheck =
      await rollDerivedCheck(
        withTheWillPartner,
        "dos",
        {
          skillKey:
            "bravery",

          tn:
            helperTn,

          title:
            localize(
              "DDA.Torment.WithTheWill.PartnerCheck"
            ),

          createChat:
            false
        }
      );

if (!helperCheck) {
  return null;
}

const interruptPayment =
  await payPartnerInterruptAction(
    withTheWillPartner,
    {
      reason:
        localize(
          "DDA.Torment.WithTheWill.PartnerCheck"
        )
    }
  );

if (!interruptPayment?.success) {
  return null;
}

const outcomeKey =
      String(
        helperCheck.outcome ??
        "failure"
      );

    const baseBonus =
      getTormentTeamworkBonus(
        outcomeKey
      );

    const teamPlayerIgnored =
      outcomeKey ===
        "criticalFailure" &&
      hasUnlockedOfficialTamerTalent(
        actor,
        "teamPlayer"
      );

    withTheWillBonus =
      teamPlayerIgnored
        ? 0
        : baseBonus;

    withTheWillResult = {
      partner:
        withTheWillPartner,

      roll:
        helperCheck.roll,

      total:
        helperCheck.total,

      tn:
        helperTn,

      outcomeKey,

      outcomeLabel:
        getTormentOutcomeLabel(
          outcomeKey
        ),

      baseBonus,

appliedBonus:
  withTheWillBonus,

teamPlayerIgnored,
interruptPayment
};

    await spendOfficialTalentUse(
      actor,
      "withTheWill",
      1
    );
  }

  /* --------------------------------------------------- */
  /* Rolagem inicial do Tormento                         */
  /* --------------------------------------------------- */

  const initialRoll =
    await new Roll(
      "3d6"
    ).evaluate();

  const initialDiceResults =
    getActiveDiceResults(
      initialRoll
    );

  const initialDiceTotal =
    Number(
      initialRoll.total ?? 0
    );

  const initialModifier =
    manualModifier +
    breakTheChainBonus +
    withTheWillBonus;

  const initialTotal =
    initialDiceTotal +
    initialModifier;

  const initialDegree =
    getTormentDegree({
      total:
        initialTotal,

      tn:
        finalTn,

      diceResults:
        initialDiceResults,

      naturalCriticals
    });

  /* --------------------------------------------------- */
  /* Calming Influence                                   */
  /* --------------------------------------------------- */

  let finalRoll =
    initialRoll;

  let finalDiceResults =
    initialDiceResults;

  let finalDiceTotal =
    initialDiceTotal;

  let finalModifier =
    initialModifier;

  let finalTotal =
    initialTotal;

  let finalDegree =
    initialDegree;

  let calmingInfluence = null;

  const initialFailed =
    ![
      "success",
      "criticalSuccess"
    ].includes(initialDegree);

  if (initialFailed) {
    const calmingHelper =
      await promptCalmingInfluenceHelper(
        actor,
        {
          breakTheChainBonus
        }
      );

    if (calmingHelper) {
      const fortitudeValue =
        getTamerSkillValue(
          calmingHelper,
          "fortitude"
        );

      /*
       * Break the Chain e Calming Influence
       * não são somados. Usa-se o maior.
       */
      const calmingAppliedBonus =
        Math.max(
          breakTheChainBonus,
          fortitudeValue
        );

      const reroll =
        await new Roll(
          "3d6"
        ).evaluate();

      const rerollDiceResults =
        getActiveDiceResults(
          reroll
        );

      const rerollDiceTotal =
        Number(
          reroll.total ?? 0
        );

      const rerollModifier =
        manualModifier +
        withTheWillBonus +
        calmingAppliedBonus;

      const rerollTotal =
        rerollDiceTotal +
        rerollModifier;

      const rerollDegree =
        getTormentDegree({
          total:
            rerollTotal,

          tn:
            finalTn,

          diceResults:
            rerollDiceResults,

          naturalCriticals
        });

      await spendOfficialTalentUse(
        calmingHelper,
        "calmingInfluence",
        1
      );

      calmingInfluence = {
        helper:
          calmingHelper,

        roll:
          reroll,

        fortitudeValue,

        breakTheChainBonus,

        appliedBonus:
          calmingAppliedBonus,

        initialDegree,

        initialTotal,

        finalDegree:
          rerollDegree,

        finalTotal:
          rerollTotal
      };

      finalRoll =
        reroll;

      finalDiceResults =
        rerollDiceResults;

      finalDiceTotal =
        rerollDiceTotal;

      finalModifier =
        rerollModifier;

      finalTotal =
        rerollTotal;

      finalDegree =
        rerollDegree;
    }
  }

  /* --------------------------------------------------- */
  /* Avoiding Consequences                               */
  /* --------------------------------------------------- */

  const finalNaturalCriticalFailure =
    naturalCriticals &&
    finalDiceResults.length === 3 &&
    finalDiceResults.every(
      (die) => die === 1
    );

  const avoidingConsequences =
    await maybeApplyAvoidingConsequences(
      actor,
      {
        total: finalTotal,
        tn: finalTn,
        outcomeKey: finalDegree,

        naturalCriticalFailure:
          finalNaturalCriticalFailure,

        sourceLabel:
          tormentItem.name
      }
    );

  if (avoidingConsequences.used) {
    finalDegree =
      avoidingConsequences
        .outcomeKey;
  }

  /* --------------------------------------------------- */
  /* Consequência final                                  */
  /* --------------------------------------------------- */

  let severeTormentChoice = null;

  if (
    finalDegree ===
    "severeCriticalFailure"
  ) {
    severeTormentChoice =
      await chooseSevereTormentConsequence(
        actor
      );
  }

  const resolution =
    await applyTormentOutcome({
      actor,
      tormentItem,

      degree:
        finalDegree,

      boxes,

      mechanicalTorments,

      severeTormentChoice,

      calmingHelper:
        calmingInfluence?.helper ??
        null
    });

  /* --------------------------------------------------- */
  /* Card                                                */
  /* --------------------------------------------------- */

  const finalAllSixes =
    finalDiceResults.length === 3 &&
    finalDiceResults.every(
      (die) => die === 6
    );

  const finalAllOnes =
    finalDiceResults.length === 3 &&
    finalDiceResults.every(
      (die) => die === 1
    );

  const naturalCriticalNote =
    naturalCriticals &&
    finalAllSixes
      ? `
        <p>
          <strong>
            ${localize(
              "DDA.Check.NaturalCritical"
            )}:
          </strong>

          ${localize(
            "DDA.Check.TripleSix"
          )}.
        </p>
      `
      : naturalCriticals &&
        finalAllOnes
        ? `
          <p>
            <strong>
              ${localize(
                "DDA.Check.NaturalCriticalFailure"
              )}:
            </strong>

            ${localize(
              "DDA.Check.TripleOne"
            )}.
          </p>
        `
        : "";

  const harderTormentNote =
    harderTorments
      ? `
        <p>
          <strong>
            ${localize(
              "DDA.Torment.VariantRule"
            )}:
          </strong>

          ${localize(
            "DDA.Torment.HarderTormentsActive"
          )}
        </p>
      `
      : "";

  const mechanicalTormentNote =
    mechanicalTorments
      ? `
        <p>
          <strong>
            ${localize(
              "DDA.Torment.VariantRule"
            )}:
          </strong>

          ${localize(
            "DDA.Torment.MechanicalTormentsActive"
          )}
        </p>
      `
      : "";

  const breakTheChainNote =
    breakTheChainUnlocked
      ? `
        <section class="dda-torment-talent-result dda-break-the-chain-result">
          <p>
            <strong>
              Break the Chain:
            </strong>

            ${formatI18n(
              "DDA.Torment.BreakTheChain.Applied",
              {
                bonus:
                  breakTheChainBonus
              }
            )}
          </p>
        </section>
      `
      : "";

  const withTheWillNote =
    withTheWillResult
      ? `
        <section class="dda-torment-talent-result dda-with-the-will-result">
          <p>
            <strong>
              With the Will:
            </strong>

            ${escapeHtml(
              withTheWillResult
                .partner.name
            )}
          </p>

          <p>
            <strong>
              DOS (${localize(
                "DDA.TamerSkill.Bravery"
              )}):
            </strong>

            ${withTheWillResult.total}
            / ${withTheWillResult.tn}
            —

            ${escapeHtml(
              withTheWillResult
                .outcomeLabel
            )}.
          </p>

          <p>
            <strong>
              ${localize(
                "DDA.Torment.WithTheWill.Bonus"
              )}:
            </strong>

            ${formatSigned(
              withTheWillResult
                .appliedBonus
            )}.
          </p>

          ${
            withTheWillResult
              .teamPlayerIgnored
              ? `
                <p>
                  <strong>
                    Team Player:
                  </strong>

                  ${localize(
                    "DDA.Torment.WithTheWill.TeamPlayerIgnored"
                  )}
                </p>
              `
              : ""
          }
        </section>
      `
      : "";

  const calmingInfluenceNote =
    calmingInfluence
      ? `
        <section class="dda-torment-talent-result dda-calming-influence-result">
          <h3>
            Calming Influence
          </h3>

          <p>
            ${formatI18n(
              "DDA.Torment.CalmingInfluence.UsedBy",
              {
                helper:
                  escapeHtml(
                    calmingInfluence
                      .helper.name
                  )
              }
            )}
          </p>

          <p>
            <strong>
              ${localize(
                "DDA.TamerSkill.Fortitude"
              )}:
            </strong>

            ${calmingInfluence
              .fortitudeValue}.
          </p>

          <p>
            <strong>
              ${localize(
                "DDA.Torment.CalmingInfluence.AppliedBonus"
              )}:
            </strong>

            +${calmingInfluence
              .appliedBonus}.

            ${
              calmingInfluence
                .breakTheChainBonus > 0
                ? `
                  ${localize(
                    "DDA.Torment.CalmingInfluence.HighestBonusHint"
                  )}
                `
                : ""
            }
          </p>

          <p>
            <strong>
              ${localize(
                "DDA.Torment.CalmingInfluence.OriginalResult"
              )}:
            </strong>

            ${escapeHtml(
              getTormentOutcomeLabel(
                calmingInfluence
                  .initialDegree
              )
            )}

            (${calmingInfluence
              .initialTotal}).
          </p>

          <p>
            <strong>
              ${localize(
                "DDA.Torment.CalmingInfluence.RerollResult"
              )}:
            </strong>

            ${escapeHtml(
              getTormentOutcomeLabel(
                calmingInfluence
                  .finalDegree
              )
            )}

            (${calmingInfluence
              .finalTotal}).
          </p>

          ${
            [
              "success",
              "criticalSuccess"
            ].includes(
              calmingInfluence
                .finalDegree
            )
              ? `
                <p>
                  ${formatI18n(
                    "DDA.Torment.CalmingInfluence.BothGainIp",
                    {
                      target:
                        escapeHtml(
                          actor.name
                        ),

                      helper:
                        escapeHtml(
                          calmingInfluence
                            .helper.name
                        )
                    }
                  )}
                </p>
              `
              : ""
          }
        </section>
      `
      : "";
      

        const avoidingConsequencesNote =
    avoidingConsequences.used
      ? `
        <section class="dda-torment-talent-result dda-avoiding-consequences-result">
          <h3>
            ${localize(
              "DDA.TamerTalent.AvoidingConsequences.Title"
            )}
          </h3>

          <p>
            ${formatI18n(
              "DDA.TamerTalent.AvoidingConsequences.Applied",
              {
                evade:
                  avoidingConsequences.evade,

                total:
                  finalTotal,

                adjusted:
                  avoidingConsequences
                    .adjustedTotal,

                tn:
                  finalTn
              }
            )}
          </p>
        </section>
      `
      : "";

  const rolls = [
    initialRoll
  ];

  if (
    withTheWillResult?.roll
  ) {
    rolls.push(
      withTheWillResult.roll
    );
  }

  if (
    calmingInfluence?.roll
  ) {
    rolls.push(
      calmingInfluence.roll
    );
  }

  await ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    rolls,

    content: `
      <div class="dda-chat-card dda-torment-card ${finalDegree}">
        <h2>
          ${localize(
            "DDA.Torment.RollTitle"
          )}
        </h2>

        <p>
          ${formatI18n(
            "DDA.Torment.FacesTorment",
            {
              actor:
                `<strong>${escapeHtml(
                  actor.name
                )}</strong>`,

              torment:
                `<strong>${escapeHtml(
                  tormentItem.name
                )}</strong>`
            }
          )}
        </p>

        ${breakTheChainNote}
        ${withTheWillNote}
        ${calmingInfluenceNote}
        ${avoidingConsequencesNote}

        <hr />

        ${
          calmingInfluence
            ? `
              <p>
                <strong>
                  ${localize(
                    "DDA.Torment.CalmingInfluence.FinalDice"
                  )}:
                </strong>

                ${finalDiceResults.join(
                  ", "
                )}
              </p>
            `
            : `
              <p>
                <strong>
                  ${localize(
                    "DDA.Roll.Dice"
                  )}:
                </strong>

                ${finalDiceResults.join(
                  ", "
                )}
              </p>
            `
        }

        <p>
          <strong>
            ${localize(
              "DDA.Torment.DiceTotal"
            )}:
          </strong>

          ${finalDiceTotal}
        </p>

        <p>
          <strong>
            ${localize(
              "DDA.TamerSkillDialog.ManualModifier"
            )}:
          </strong>

          ${manualModifier}
        </p>

        <p>
          <strong>
            ${localize(
              "DDA.Torment.TotalModifier"
            )}:
          </strong>

          ${finalModifier}
        </p>

        <p>
          <strong>
            ${localize(
              "DDA.Torment.FinalTotal"
            )}:
          </strong>

          ${finalTotal}
        </p>

        <p>
          <strong>
            ${localize(
              "DDA.Roll.TN"
            )}:
          </strong>

          ${finalTn}
        </p>

        <hr />

        <h3>
          ${resolution.resultLabel}
        </h3>

        <p>
          ${resolution.resultText}
        </p>

        ${naturalCriticalNote}
        ${harderTormentNote}
        ${mechanicalTormentNote}
      </div>
    `
  });

  const luckyNumberResult =
    await applyLuckyNumberReward(
      actor,
      finalDiceResults,
      {
        source:
          "tormentCheck"
      }
    );

  return {
    actor,
    tormentItem,

    initialRoll,
    initialDegree,
    initialTotal,

    finalRoll,
    finalDegree,
    finalTotal,

    breakTheChainBonus,
    withTheWillResult,
    calmingInfluence,
    avoidingConsequences,

    resolution,
    luckyNumberResult
  };
}

async function resolveTormentPartner(
  tamer
) {
  const partnerData =
    tamer?.system?.partner ?? {};

  const candidateUuids = [
    partnerData.currentFormUuid,
    partnerData.uuid
  ]
    .map((uuid) => {
      return String(
        uuid ?? ""
      ).trim();
    })
    .filter(Boolean);

  for (const uuid of candidateUuids) {
    try {
      const document =
        await fromUuid(uuid);

      if (
        document?.documentName ===
          "Actor" &&
        [
          "digimon",
          "npc"
        ].includes(
          document.type
        )
      ) {
        return document;
      }
    } catch (error) {
      console.warn(
        "DDA | Could not resolve the partner for Torment.",
        error
      );
    }
  }

  return null;
}

function getTamerSkillValue(
  actor,
  skillKey
) {
  return Math.max(
    0,
    Number(
      actor?.system
        ?.skills?.[skillKey]
        ?.value ?? 0
    )
  );
}

function getOfficialTalentUses(
  actor,
  talentId,
  maximum = 1
) {
  const stored =
    actor?.system
      ?.tamerTalentUses
      ?.[talentId]
      ?.value;

  return Math.max(
    0,
    Number(
      stored ?? maximum
    )
  );
}

async function spendOfficialTalentUse(
  actor,
  talentId,
  maximum = 1
) {
  const current =
    getOfficialTalentUses(
      actor,
      talentId,
      maximum
    );

  if (current <= 0) {
    return false;
  }

  await actor.update({
    [`system.tamerTalentUses.${talentId}.value`]:
      current - 1,

    [`system.tamerTalentUses.${talentId}.max`]:
      maximum,

    [`system.tamerTalentUses.${talentId}.recharge`]:
      "rest"
  });

  return true;
}

function getActiveDiceResults(
  roll
) {
  return (
    roll?.dice?.[0]?.results ?? []
  )
    .filter((result) => {
      return result.active !== false;
    })
    .map((result) => {
      return Number(
        result.result ?? 0
      );
    });
}

function getTormentDegree({
  total,
  tn,
  diceResults = [],
  naturalCriticals = false
} = {}) {
  const allSixes =
    diceResults.length === 3 &&
    diceResults.every(
      (die) => die === 6
    );

  const allOnes =
    diceResults.length === 3 &&
    diceResults.every(
      (die) => die === 1
    );

  if (
    naturalCriticals &&
    allSixes
  ) {
    return "criticalSuccess";
  }

  if (
    naturalCriticals &&
    allOnes
  ) {
    return "criticalFailure";
  }

  if (
    Number(total) >=
    Number(tn) + 5
  ) {
    return "criticalSuccess";
  }

  if (
    Number(total) >=
    Number(tn)
  ) {
    return "success";
  }

  if (
    Number(total) <=
    Number(tn) - 10
  ) {
    return "severeCriticalFailure";
  }

  if (
    Number(total) <=
    Number(tn) - 5
  ) {
    return "criticalFailure";
  }

  return "failure";
}

function getTormentTeamworkBonus(
  outcomeKey
) {
  const bonuses = {
    criticalSuccess: 5,
    success: 2,
    failure: 0,
    criticalFailure: -2
  };

  return Number(
    bonuses[
      String(outcomeKey ?? "")
    ] ?? 0
  );
}

function getTormentOutcomeLabel(
  outcomeKey
) {
  const keys = {
    criticalSuccess:
      "DDA.Check.CriticalSuccess",

    success:
      "DDA.Check.Success",

    failure:
      "DDA.Check.Failure",

    criticalFailure:
      "DDA.Check.CriticalFailure",

    severeCriticalFailure:
      "DDA.Torment.SevereDialog.Title"
  };

  const key =
    keys[
      String(outcomeKey ?? "")
    ];

  return key
    ? localize(key)
    : String(outcomeKey ?? "");
}

function formatSigned(
  value
) {
  const numeric =
    Number(value ?? 0);

  return numeric >= 0
    ? `+${numeric}`
    : `${numeric}`;
}

async function promptCalmingInfluenceHelper(
  targetActor,
  {
    breakTheChainBonus = 0
  } = {}
) {
  const candidates =
    (
      game?.actors?.contents ?? []
    )
      .filter((candidate) => {
        if (
          candidate.type !==
          "character"
        ) {
          return false;
        }

        if (
          candidate.uuid ===
          targetActor.uuid
        ) {
          return false;
        }

        if (
          !hasUnlockedOfficialTamerTalent(
            candidate,
            "calmingInfluence"
          )
        ) {
          return false;
        }

        if (
          getOfficialTalentUses(
            candidate,
            "calmingInfluence",
            1
          ) <= 0
        ) {
          return false;
        }

        /*
         * O usuário precisa poder atualizar o
         * Tamer auxiliar. O GM pode usar qualquer um.
         */
        return Boolean(
          game.user?.isGM ||
          candidate.isOwner
        );
      })
      .sort((left, right) => {
        return left.name.localeCompare(
          right.name
        );
      });

  if (!candidates.length) {
    return null;
  }

  const options =
    candidates
      .map((candidate, index) => {
        const fortitude =
          getTamerSkillValue(
            candidate,
            "fortitude"
          );

        const appliedBonus =
          Math.max(
            fortitude,
            Number(
              breakTheChainBonus ?? 0
            )
          );

        return `
          <option value="${index}">
            ${escapeHtml(candidate.name)}
            —
            ${localize(
              "DDA.TamerSkill.Fortitude"
            )}
            ${fortitude}
            —
            +${appliedBonus}
          </option>
        `;
      })
      .join("");

  return await new Promise((resolve) => {
    new Dialog({
      title:
        localize(
          "DDA.Torment.CalmingInfluence.Title"
        ),

      content: `
        <form class="dda-roll-dialog dda-calming-influence-dialog">
          <p>
            ${formatI18n(
              "DDA.Torment.CalmingInfluence.Prompt",
              {
                actor:
                  escapeHtml(
                    targetActor.name
                  )
              }
            )}
          </p>

          <div class="form-group">
            <label>
              ${localize(
                "DDA.Torment.CalmingInfluence.Helper"
              )}
            </label>

            <select name="helperIndex">
              ${options}
            </select>
          </div>

          ${
            Number(
              breakTheChainBonus
            ) > 0
              ? `
                <p class="notes">
                  ${formatI18n(
                    "DDA.Torment.CalmingInfluence.BreakTheChainComparison",
                    {
                      bonus:
                        breakTheChainBonus
                    }
                  )}
                </p>
              `
              : ""
          }
        </form>
      `,

      buttons: {
        use: {
          label:
            localize(
              "DDA.Torment.CalmingInfluence.Use"
            ),

          callback: (html) => {
            const root =
              html instanceof jQuery
                ? html
                : $(html);

            const index =
              Number(
                root.find(
                  "[name='helperIndex']"
                ).val() ?? -1
              );

            resolve(
              candidates[index] ??
              null
            );
          }
        },

        decline: {
          label:
            localize(
              "DDA.Torment.CalmingInfluence.Decline"
            ),

          callback: () => {
            resolve(null);
          }
        }
      },

      default:
        "use",

      close: () => {
        resolve(null);
      }
    }).render(true);
  });
}

async function gainTamerIp(
  actor,
  amount = 1
) {
  const current =
    Number(
      actor?.system
        ?.resources?.ip
        ?.value ?? 0
    );

  const maximum =
    Number(
      actor?.system
        ?.resources?.ip
        ?.max ?? 0
    );

  const next =
    Math.min(
      maximum,
      current +
      Math.max(
        0,
        Number(amount ?? 0)
      )
    );

  if (next === current) {
    return 0;
  }

  await actor.update({
    "system.resources.ip.value":
      next
  });

  return next - current;
}

async function applyTormentOutcome({
  actor,
  tormentItem,

  degree,
  boxes,

  mechanicalTorments,
  severeTormentChoice,

  calmingHelper = null
} = {}) {
  const updates = {};
  const itemUpdates = {};

  const ipPath =
    "system.resources.ip.value";

  const currentIp =
    Number(
      actor.system
        ?.resources?.ip
        ?.value ?? 0
    );

  const maxIp =
    Number(
      actor.system
        ?.resources?.ip
        ?.max ?? 0
    );

  const calmingSucceeded =
    Boolean(
      calmingHelper &&
      [
        "success",
        "criticalSuccess"
      ].includes(degree)
    );

  let resultLabel = "";
  let resultText = "";

  let targetIpGain = 0;
  let helperIpGain = 0;

  if (
    degree ===
    "criticalSuccess"
  ) {
    resultLabel =
      localize(
        "DDA.Check.CriticalSuccess"
      );

    /*
     * Calming Influence concede 1 PI para
     * cada Tamer em vez do ganho normal.
     */
    targetIpGain =
      calmingSucceeded
        ? 1
        : mechanicalTorments
          ? 2
          : 1;

    updates[ipPath] =
      Math.min(
        maxIp,
        currentIp + targetIpGain
      );

    itemUpdates[
      "system.boxes.value"
    ] =
      Math.max(
        0,
        Number(boxes ?? 0) - 1
      );

    resultText =
      mechanicalTorments
        ? formatI18n(
            "DDA.Torment.Result.CriticalSuccess.Mechanical",
            {
              ipGain:
                targetIpGain
            }
          )
        : formatI18n(
            "DDA.Torment.Result.CriticalSuccess.Text",
            {
              ipGain:
                targetIpGain
            }
          );

    itemUpdates[
      "system.checkedUntilRest"
    ] = true;

    itemUpdates[
      "system.penalty.enabled"
    ] = false;

    itemUpdates[
      "system.penalty.value"
    ] = 0;

    updates[
      "system.tormentState.rollPenalty"
    ] = 0;

    updates[
      "system.tormentState.actionLockUntilCombatEnd"
    ] = false;
  }

  if (degree === "success") {
    resultLabel =
      localize(
        "DDA.Check.Success"
      );

    targetIpGain = 1;

    updates[ipPath] =
      Math.min(
        maxIp,
        currentIp + 1
      );

    if (mechanicalTorments) {
      itemUpdates[
        "system.boxes.value"
      ] =
        Math.max(
          0,
          Number(boxes ?? 0) - 1
        );

      resultText =
        localize(
          "DDA.Torment.Result.Success.Mechanical"
        );
    } else {
      resultText =
        localize(
          "DDA.Torment.Result.Success.Text"
        );
    }

    itemUpdates[
      "system.checkedUntilRest"
    ] = true;

    itemUpdates[
      "system.penalty.enabled"
    ] = false;

    itemUpdates[
      "system.penalty.value"
    ] = 0;

    updates[
      "system.tormentState.rollPenalty"
    ] = 0;

    updates[
      "system.tormentState.actionLockUntilCombatEnd"
    ] = false;
  }

  if (degree === "failure") {
    resultLabel =
      localize(
        "DDA.Check.Failure"
      );

    resultText =
      localize(
        "DDA.Torment.Result.Failure"
      );

    itemUpdates[
      "system.checkedUntilRest"
    ] = true;
  }

  if (
    degree ===
    "criticalFailure"
  ) {
    resultLabel =
      localize(
        "DDA.Check.CriticalFailure"
      );

    resultText =
      localize(
        "DDA.Torment.Result.CriticalFailure"
      );

    itemUpdates[
      "system.checkedUntilRest"
    ] = true;

    itemUpdates[
      "system.penalty.enabled"
    ] = true;

    itemUpdates[
      "system.penalty.value"
    ] = -2;

    updates[
      "system.tormentState.rollPenalty"
    ] = -2;
  }

  if (
    degree ===
    "severeCriticalFailure"
  ) {
    resultLabel =
      localize(
        "DDA.Torment.SevereDialog.Title"
      );

    itemUpdates[
      "system.boxes.value"
    ] =
      Number(boxes ?? 0) + 1;

    itemUpdates[
      "system.checkedUntilRest"
    ] = true;

    itemUpdates[
      "system.penalty.enabled"
    ] = true;

    if (
      severeTormentChoice ===
      "combatCollapse"
    ) {
      resultText =
        localize(
          "DDA.Torment.Result.SevereCriticalFailure.CombatCollapse"
        );

      itemUpdates[
        "system.penalty.value"
      ] = -3;

      updates[
        "system.tormentState.rollPenalty"
      ] = -3;

      updates[
        "system.tormentState.actionLockUntilCombatEnd"
      ] = true;

      updates[
        "system.combat.actions.value"
      ] = 0;
    } else {
      resultText =
        localize(
          "DDA.Torment.Result.SevereCriticalFailure.HeavyPenalty"
        );

      itemUpdates[
        "system.penalty.value"
      ] = -5;

      updates[
        "system.tormentState.rollPenalty"
      ] = -5;

      updates[
        "system.tormentState.actionLockUntilCombatEnd"
      ] = false;
    }
  }

  if (
    Object.keys(updates).length > 0
  ) {
    await actor.update(updates);
  }

  if (
    Object.keys(itemUpdates).length > 0
  ) {
    await tormentItem.update(
      itemUpdates
    );
  }

  if (calmingSucceeded) {
    helperIpGain =
      await gainTamerIp(
        calmingHelper,
        1
      );
  }

  return {
    resultLabel,
    resultText,

    targetIpGain,
    helperIpGain,

    calmingSucceeded
  };
}

async function chooseSevereTormentConsequence(actor) {
  const inCombat = isActorInCurrentCombat(actor);

  if (!inCombat) {
    return "heavyPenalty";
  }

  return new Promise((resolve) => {
    new Dialog(
      {
        title: localize("DDA.Torment.SevereDialog.Title"),
        content: `
          <form class="dda-roll-dialog dda-torment-severe-dialog">
            <p>
              ${formatI18n("DDA.Torment.SevereDialog.Intro", { actor: `<strong>${escapeHtml(actor.name)}</strong>` })}
            </p>

            <p class="notes">
              ${localize("DDA.Torment.SevereDialog.Hint")}
            </p>

            <div class="form-group">
              <label>${localize("DDA.Torment.SevereDialog.Consequence")}</label>
              <select name="consequence">
                <option value="heavyPenalty">${localize("DDA.Torment.SevereDialog.HeavyPenalty")}</option>
                <option value="combatCollapse">${localize("DDA.Torment.SevereDialog.CombatCollapse")}</option>
              </select>
            </div>
          </form>
        `,
        buttons: {
          confirm: {
            label: localize("DDA.Button.Confirm"),
            callback: (html) => {
              const form = html[0].querySelector("form");
              resolve(form.consequence.value);
            }
          },
          cancel: {
            label: localize("DDA.Torment.SevereDialog.UseMinusFive"),
            callback: () => resolve("heavyPenalty")
          }
        },
        default: "confirm",
        close: () => resolve("heavyPenalty")
      },
      {
        width: 430
      }
    ).render(true);
  });
}

function isActorInCurrentCombat(actor) {
  if (!game.combat?.started) return false;

  return game.combat.combatants.some((combatant) => {
    return combatant.actor?.uuid === actor.uuid;
  });
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
