import { getDDASetting } from "../settings.js";
import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
import { syncPartnerOwnershipFromTamer } from "../utils/ownership.js";
import { runDigimonTokenEvolutionTransition } from "../tokens/digimon-token-scale.js";
import { clearClashStateForActor } from "./clash.js";
import { getDdaTokenPath } from "../data/dda-portrait-and-manual-digimon-data.js";
import {
  resolveDigimonPortraitSources
} from "../helpers/digimon-portrait-resolver.js";

import {
  getPartnerBonusDpAllocation,
  getPartnerFormBonusDpAvailable,
  normalizeTamerEvolutionPointPool,
  synchronizePartnerBonusDpAcrossForms
} from "../rules/tamer-progression.js";

import {
  getTamerIpPool,
  spendTamerIp
} from "../rules/tamer-resources.js";

import {
  getDefaultStageKeyForRange,
  getOfficialEvolutionPointCostForStage,
  getOfficialEvolutionStageNumber,
  isStageWithinDefaultRange,
  normalizeDefaultRangeValue
} from "../rules/evolution-progression.js";

import {
  DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED,
  isJogressRulesMethod,
  isLegacyHybridSpecialMethod
} from "../rules/special-evolution-methods.js";
import { resetModeChangeForActor } from "../rules/mode-change.js";
import { rollTamerCheck } from "../rolls/check-roll.js";

export const DDA_SYSTEM_ID = "digimon-digital-adventures";
export const DDA_IP_PER_EVOLUTION_POINT = 1;

function getPreInitiativeEvolutionCombat(tamerActor) {
  const combat = game?.combat;
  if (!combat || combat.started || !tamerActor) return null;

  const actorUuid = String(tamerActor.uuid ?? "");
  const actorId = String(tamerActor.id ?? "");
  const participates = Array.from(combat.combatants ?? []).some((combatant) => {
    const actor = combatant?.actor;
    return Boolean(
      actor &&
      (String(actor.uuid ?? "") === actorUuid || String(actor.id ?? "") === actorId)
    );
  });

  return participates ? combat : null;
}

function applyPreInitiativeEvolutionCost(costData, tamerActor, options = {}) {
  if (!costData || options.zeroUnit) return costData;

  const combat = getPreInitiativeEvolutionCombat(tamerActor);
  if (!combat || !costData.allowed || Number(costData.actionCost ?? 0) !== 1) {
    return costData;
  }

  costData.actionCost = 2;
  costData.availableActions = Math.max(
    0,
    Number(tamerActor.system?.combat?.actions?.max ?? costData.availableActions ?? 2)
  );
  costData.preInitiativeEvolution = true;
  costData.preInitiativeCombatId = combat.id;
  return costData;
}

async function markPreInitiativeEvolutionDebt(tamerActor, combatId, actionDebt = 2) {
  if (!tamerActor || !combatId) return;

  await tamerActor.update({
    "system.combat.preInitiativeEvolution.combatId": String(combatId),
    "system.combat.preInitiativeEvolution.actionDebt": Math.max(0, Number(actionDebt ?? 0)),
    "system.combat.preInitiativeEvolution.pending": true
  });
}

export async function evolvePartner(tamerActor, options = {}) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.DigivolutionOnlyForTamers"));
    return;
  }

  if (isTamerInActiveJogress(tamerActor)) {
    ui.notifications.warn(localize("DDA.Warning.JogressBlocksOtherEvolution"));
    return;
  }

  // DDA59: repair legacy EP pools before any cost is calculated so an
  // outdated pre-audit maximum can never be spent on a new Evolution.
  await normalizeTamerEvolutionPointPool(tamerActor);

  const partnerUuid = tamerActor.system.partner?.uuid;

  if (!partnerUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoPartnerLinked"));
    return;
  }

  const partnerActor = await resolveActor(partnerUuid);

  if (!partnerActor || partnerActor.documentName !== "Actor") {
    ui.notifications.warn(localize("DDA.Warning.PartnerNotFound"));
    return;
  }

  if (partnerActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.LinkedPartnerNotDigimonSimple"));
    return;
  }

  await syncPartnerOwnershipFromTamer(tamerActor, partnerActor);

  const activeConflict = getActiveEvolutionConflict(tamerActor, partnerActor);
  if (activeConflict) {
    warnEvolutionConflict(activeConflict);
    return;
  }

  const previousFormUuid =
    tamerActor.system.partner?.currentFormUuid ||
    partnerActor.system.evolution?.currentFormUuid ||
    partnerActor.system.evolution?.sourceFormUuid ||
    partnerActor.uuid;

  const previousFormActor = await resolveActor(previousFormUuid) ?? partnerActor;

  if (isEvolutionLockedForCombat(partnerActor) || isEvolutionLockedForCombat(previousFormActor)) {
    ui.notifications.warn(localize("DDA.Warning.EvolutionLockedUntilCombatEnd"));
    return;
  }

  const forms = await collectEvolutionForms(partnerActor, previousFormActor);

  if (forms.length === 0) {
    ui.notifications.warn(localize("DDA.Warning.NoEvolutionFormsRegistered"));
    return;
  }

  const previousFormName = previousFormActor?.name ?? partnerActor.name;
  const previousStageKey = previousFormActor?.system?.stage ?? partnerActor.system.stage;
  const previousStageLabel = getStageLabel(previousStageKey);

  const selectedForm = await chooseEvolutionForm(forms, partnerActor, previousFormActor, tamerActor);

  if (!selectedForm) return;

  let formTemplateActor = selectedForm.persistentSnapshot
    ? buildPseudoActorFromFormSnapshot(selectedForm.persistentSnapshot, partnerActor)
    : await resolveActor(selectedForm.uuid);

  if ((!formTemplateActor || formTemplateActor.documentName !== "Actor") && selectedForm.persistentSnapshot) {
    formTemplateActor = buildPseudoActorFromFormSnapshot(selectedForm.persistentSnapshot, partnerActor);
  }

  if (!formTemplateActor || formTemplateActor.documentName !== "Actor") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotFound"));
    return;
  }

  if (formTemplateActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotDigimon"));
    return;
  }

  const costData = calculateEvolutionCost({
    tamerActor,
    previousActor: previousFormActor,
    newActor: formTemplateActor,
    edgeMethod: selectedForm.edgeMethod,
    directLink: selectedForm.directLink
  });

  if (options.zeroUnit) {
    const credit = Math.max(0, Number(options.evolutionPointCredit ?? 0));
    costData.zeroUnitOriginalPeCost = Math.max(0, Number(costData.peCost ?? 0));
    costData.zeroUnitCredit = Math.min(costData.zeroUnitOriginalPeCost, credit);
    costData.peCost = Math.max(0, costData.zeroUnitOriginalPeCost - credit);
    costData.actionCost = 0;
    costData.reason = String(game.i18n?.lang ?? "").toLowerCase().startsWith("en")
      ? `Zero Unit: ${credit} Evolution Point credit and a free Evolution Action.`
      : `Unidade Zero: crédito de ${credit} Pontos de Evolução e Ação Evoluir gratuita.`;
  }

  applyPreInitiativeEvolutionCost(costData, tamerActor, options);

  if (!costData.allowed) {
    ui.notifications.warn(costData.blockedReason || localize("DDA.Warning.EvolutionMethodDisabled"));
    return;
  }

  const paymentData = await validateAndConfirmCost({
    tamerActor,
    partnerActor,
    previousFormName,
    evolvedActor: formTemplateActor,
    costData
  });

  if (!paymentData) return;

  await payEvolutionCost(tamerActor, paymentData);

  if (paymentData.transitionType === "armor") {
    await markArmorEvolutionItemUsed(tamerActor, formTemplateActor);
  }

  const activeHybridState = foundry.utils.deepClone(tamerActor.system.specialEvolutions?.hybrid?.state ?? {});
  const isContinuingBioMerge = Boolean(
    activeHybridState.active &&
    String(activeHybridState.method ?? "").trim() === "biomerge" &&
    (
      activeHybridState.resultUuid === previousFormActor?.uuid ||
      activeHybridState.resultUuid === previousFormUuid ||
      activeHybridState.resultUuid === partnerActor.uuid
    )
  );

  const continuedHybridState = isContinuingBioMerge
    ? {
        ...activeHybridState,
        resultUuid: formTemplateActor.uuid,
        resultName: formTemplateActor.name,
        resultStage: formTemplateActor.system?.stage ?? activeHybridState.resultStage ?? "",
        equivalentStage: formTemplateActor.system?.stage ?? activeHybridState.equivalentStage ?? "",
        previousFormUuid: activeHybridState.previousFormUuid || previousFormActor?.uuid || "",
        previousFormName: activeHybridState.previousFormName || previousFormName || ""
      }
    : null;

const previousPersistentWounds =
  foundry.utils.deepClone(
    partnerActor.system.miscStats
      ?.wounds ?? {}
  );

/*
 * O Actor parceiro é persistente e será
 * transformado durante applyEvolutionFormTemplateToPartner.
 *
 * Portanto, a decisão de cura precisa ser tomada
 * antes da mutação, usando somente valores primitivos.
 */
const shouldHealAfterEvolution =
  shouldFullyHealOnEvolution({
    previousStageKey,

    nextStageKey:
      formTemplateActor.system
        ?.stage ?? "",

    transitionType:
      paymentData.transitionType
  });

await runDigimonTokenEvolutionTransition(
  partnerActor,
  async () => {
    await clearClashStateForActor(partnerActor, { reason: "formChange" });

    await applyEvolutionFormTemplateToPartner({
      partnerActor,
      formTemplateActor,
      tamerActor,
      previousFormActor,
      transitionType: paymentData.transitionType,
      continuedHybridState
    });

    if (
      paymentData.transitionType ===
      "slide"
    ) {
      await applyPersistentSlideEvolutionWoundAdjustment({
        partnerActor,
        previousFormActor,
        formTemplateActor,
        previousPersistentWounds
      });
    } else if (
      shouldHealAfterEvolution
    ) {
      await fullyRestoreWounds(
        partnerActor,
        {
          clearTemp: true
        }
      );
    }

    return partnerActor;
  },
  {
    lowAlphaMultiplier: 0.16,
    midAlphaMultiplier: 0.62,
    stepDelay: 90
  }
);

  const partnerDisplayName = String(
    getPersistentPartnerNickname(partnerActor) ||
    partnerActor.system?.species ||
    partnerActor.name ||
    formTemplateActor.system?.species ||
    formTemplateActor.name ||
    "Digimon"
  ).trim() || "Digimon";

  await tamerActor.update({
    "system.partner.baseName": partnerDisplayName,
    "system.partner.name": partnerDisplayName,
        "system.partner.uuid": partnerActor.uuid,
    "system.partner.currentFormUuid":
      partnerActor.system.evolution?.currentFormUuid ||
      formTemplateActor.uuid,
    "system.partner.currentFormName":
      partnerActor.system.evolution?.currentFormName ||
      formTemplateActor.name,
    ...(continuedHybridState ? {
      "system.specialEvolutions.hybrid.state": continuedHybridState
    } : {})
  });

  let darkEvolutionData = null;

  if (paymentData.transitionType === "dark") {
    darkEvolutionData = await applyDarkEvolutionConsequences({
      tamerActor,
      partnerActor,
      previousActor: previousFormActor,
      evolvedActor: partnerActor
    });
  }

  const newStageLabel = getStageLabel(formTemplateActor.system.stage);
  const transitionLabel = getEvolutionTransitionLabelFromType(paymentData.transitionType);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-digivolution-card">
        <h2>${localize("DDA.Evolution.Title")}</h2>

        <div class="dda-digivolution-hero">
          <div class="dda-digivolution-form previous">
            <span class="dda-digivolution-label">${localize("DDA.Evolution.PreviousForm")}</span>
            <strong>${escapeHtml(previousFormName)}</strong>
            <small>${escapeHtml(previousStageLabel)}</small>
          </div>

          <div class="dda-digivolution-arrow">→</div>

          <div class="dda-digivolution-form next">
            <span class="dda-digivolution-label">${localize("DDA.Evolution.NewForm")}</span>
            <strong>${escapeHtml(formTemplateActor.name)}</strong>
            <small>${escapeHtml(newStageLabel)}</small>
          </div>
        </div>

        <ul class="dda-effect-list dda-digivolution-list">
          <li>
            ${localize("DDA.Label.Type")}:
            <strong>${escapeHtml(transitionLabel)}</strong>.
          </li>

          <li>
            ${localize("DDA.Actor.Tamer")}:
            <strong>${escapeHtml(tamerActor.name)}</strong>.
          </li>

          <li>
            ${localize("DDA.Evolution.ActionCost")}:
            <strong>${paymentData.actionCost}</strong>.
          </li>

          <li>
            ${localize("DDA.Evolution.TotalCost")}:
            <strong>${paymentData.peCost}</strong>.
          </li>

          <li>
            ${localize("DDA.Evolution.EPSpent")}:
            <strong>${paymentData.peSpent}</strong>.
          </li>

          <li>
            ${localize("DDA.Evolution.IPSpent")}:
            <strong>${paymentData.ipSpent}</strong>.
          </li>

          <li>
            ${localize("DDA.Label.Reason")}:
            <strong>${escapeHtml(paymentData.reason)}</strong>
          </li>

          <li>
            ${localize("DDA.Evolution.PersistentPartner")}:
            <strong>${escapeHtml(partnerActor.name)}</strong>.
          </li>
        </ul>

        ${
          darkEvolutionData
            ? renderDarkEvolutionChatBlock(darkEvolutionData)
            : ""
        }
      </div>
    `
  });

  partnerActor.sheet?.render(true);
  tamerActor.sheet?.render(false);

  return partnerActor;
}

function getIndependentNpcAlignment(
  actor = null
) {
  const metadata =
    actor?.getFlag?.(
      DDA_SYSTEM_ID,
      "enemyNpc"
    ) ??
    actor?.system?.enemy ??
    {};

  const rawAlignment = String(
    metadata.alignment ??
    (
      metadata.isAlly
        ? "ally"
        : "enemy"
    )
  )
    .trim()
    .toLowerCase();

  return rawAlignment === "ally"
    ? "ally"
    : "enemy";
}

export async function evolveIndependentDigimon(
  partnerActor,
  {
    bypassCombatLock = false,
    skipConfirm = false,
    forceFullWounds = false,
    transitionReason = ""
  } = {}
) {
  if (!game.user?.isGM) {
    ui.notifications.warn(
      localize(
        "DDA.AllyNpc.Evolution.OnlyGM"
      )
    );

    return null;
  }

  const npcMetadata =
    partnerActor?.getFlag?.(
      DDA_SYSTEM_ID,
      "enemyNpc"
    ) ??
    partnerActor?.system?.enemy ??
    null;

  const isManagedDigimonNpc = Boolean(
    partnerActor &&
    partnerActor.documentName === "Actor" &&
    partnerActor.type === "npc" &&
    partnerActor.system?.isDigimon &&
    npcMetadata &&
    (
      npcMetadata.alignment ||
      npcMetadata.isAlly ||
      npcMetadata.isEnemy ||
      npcMetadata.autonomousEvolution
    )
  );

  if (!isManagedDigimonNpc) {
    ui.notifications.warn(
      localize(
        "DDA.AllyNpc.Evolution.InvalidActor"
      )
    );

    return null;
  }

  const previousFormUuid = String(
    partnerActor.system.evolution
      ?.currentFormUuid ||
    partnerActor.system.evolution
      ?.sourceFormUuid ||
    partnerActor.uuid
  ).trim();

  const storedPreviousSnapshot =
    getPartnerFormSnapshot(
      partnerActor,
      previousFormUuid
    );

  let previousFormActor =
    await resolveActor(
      previousFormUuid
    );

  if (
    !previousFormActor &&
    storedPreviousSnapshot
  ) {
    previousFormActor =
      buildPseudoActorFromFormSnapshot(
        storedPreviousSnapshot,
        partnerActor
      );
  }

  previousFormActor ??=
    partnerActor;

  if (
    !bypassCombatLock &&
    (
      isEvolutionLockedForCombat(
        partnerActor
      ) ||
      isEvolutionLockedForCombat(
        previousFormActor
      )
    )
  ) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.EvolutionLockedUntilCombatEnd"
      )
    );

    return null;
  }

  const forms =
    await collectEvolutionForms(
      partnerActor,
      previousFormActor
    );

  if (!forms.length) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.NoEvolutionFormsRegistered"
      )
    );

    return null;
  }

  const selectedForm =
    await chooseEvolutionForm(
      forms,
      partnerActor,
      previousFormActor,
      null,
      {
        freeEvolution: true
      }
    );

  if (!selectedForm) {
    return null;
  }

  let formTemplateActor =
    selectedForm.persistentSnapshot
      ? buildPseudoActorFromFormSnapshot(
          selectedForm.persistentSnapshot,
          partnerActor
        )
      : await resolveActor(
          selectedForm.uuid
        );

  if (
    (
      !formTemplateActor ||
      formTemplateActor.documentName !==
        "Actor"
    ) &&
    selectedForm.persistentSnapshot
  ) {
    formTemplateActor =
      buildPseudoActorFromFormSnapshot(
        selectedForm.persistentSnapshot,
        partnerActor
      );
  }

  if (
    !formTemplateActor ||
    formTemplateActor.documentName !==
      "Actor"
  ) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.ChosenEvolutionFormNotFound"
      )
    );

    return null;
  }

  if (
    !["digimon", "npc"].includes(
      formTemplateActor.type
    )
  ) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.ChosenEvolutionFormNotDigimon"
      )
    );

    return null;
  }

  const costData =
    calculateEvolutionCost({
      tamerActor: null,
      previousActor:
        previousFormActor,
      newActor:
        formTemplateActor,
      edgeMethod:
        selectedForm.edgeMethod,
      directLink:
        selectedForm.directLink,
      freeEvolution: true
    });

  if (!costData.allowed) {
    ui.notifications.warn(
      costData.blockedReason ||
      localize(
        "DDA.Warning.EvolutionMethodDisabled"
      )
    );

    return null;
  }

  const previousFormName = String(
    previousFormActor.system?.species ||
    previousFormActor.name ||
    partnerActor.system?.species ||
    partnerActor.name
  ).trim();

  const previousStageKey = String(
    previousFormActor.system?.stage ||
    partnerActor.system?.stage ||
    ""
  ).trim();

  const nextFormName = String(
    formTemplateActor.system?.species ||
    formTemplateActor.name ||
    selectedForm.name
  ).trim();

  if (!skipConfirm) {
    const confirmed =
      await foundry.applications.api.DialogV2.confirm({
        window: {
          title: localize(
            "DDA.AllyNpc.Evolution.ConfirmTitle"
          )
        },

        content: `
          <div class="dda-roll-dialog dda-independent-evolution-dialog">
            <p>
              ${formatI18n(
                "DDA.AllyNpc.Evolution.ConfirmText",
                {
                  actor: `<strong>${escapeHtml(
                    partnerActor.name
                  )}</strong>`,

                  previous: `<strong>${escapeHtml(
                    previousFormName
                  )}</strong>`,

                  next: `<strong>${escapeHtml(
                    nextFormName
                  )}</strong>`
                }
              )}
            </p>

            ${transitionReason ? `<p class="muted">${escapeHtml(transitionReason)}</p>` : ""}

            <p class="muted">
              ${localize(
                "DDA.AllyNpc.Evolution.NoCost"
              )}
            </p>
          </div>
        `,

        yes: { default: true },
        rejectClose: false,
        modal: true
      });

    if (!confirmed) {
      return null;
    }
  }

  const previousPersistentWounds =
    foundry.utils.deepClone(
      partnerActor.system.miscStats
        ?.wounds ?? {}
    );

  const shouldHealAfterEvolution =
    Boolean(forceFullWounds) ||
    shouldFullyHealOnEvolution({
      previousStageKey,

      nextStageKey:
        formTemplateActor.system
          ?.stage ?? "",

      transitionType:
        costData.transitionType
    });

  await runDigimonTokenEvolutionTransition(
    partnerActor,

    async () => {
      await clearClashStateForActor(
        partnerActor,
        {
          reason: "formChange"
        }
      );

      await applyEvolutionFormTemplateToPartner({
        partnerActor,
        formTemplateActor,
        tamerActor: null,
        previousFormActor,

        transitionType:
          costData.transitionType,

        continuedHybridState: null
      });

      if (
        costData.transitionType ===
        "slide"
      ) {
        await applyPersistentSlideEvolutionWoundAdjustment({
          partnerActor,
          previousFormActor,
          formTemplateActor,
          previousPersistentWounds
        });
      } else if (
        shouldHealAfterEvolution
      ) {
        await fullyRestoreWounds(
          partnerActor,
          {
            clearTemp: true
          }
        );
      }

      return partnerActor;
    },

    {
      lowAlphaMultiplier: 0.16,
      midAlphaMultiplier: 0.62,
      stepDelay: 90
    }
  );

  const transitionLabel =
    getEvolutionTransitionLabelFromType(
      costData.transitionType
    );

  await ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor: partnerActor
      }),

    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-digivolution-card dda-independent-digivolution-card">
        <h2>${localize(
          "DDA.AllyNpc.Evolution.Title"
        )}</h2>

        <div class="dda-digivolution-hero">
          <div class="dda-digivolution-form previous">
            <span class="dda-digivolution-label">
              ${localize(
                "DDA.Evolution.PreviousForm"
              )}
            </span>

            <strong>
              ${escapeHtml(
                previousFormName
              )}
            </strong>

            <small>
              ${escapeHtml(
                getStageLabel(
                  previousStageKey
                )
              )}
            </small>
          </div>

          <div class="dda-digivolution-arrow">
            →
          </div>

          <div class="dda-digivolution-form next">
            <span class="dda-digivolution-label">
              ${localize(
                "DDA.Evolution.NewForm"
              )}
            </span>

            <strong>
              ${escapeHtml(
                nextFormName
              )}
            </strong>

            <small>
              ${escapeHtml(
                getStageLabel(
                  formTemplateActor
                    .system?.stage ??
                  ""
                )
              )}
            </small>
          </div>
        </div>

        <ul class="dda-effect-list dda-digivolution-list">
          <li>
            ${localize(
              "DDA.Label.Type"
            )}:

            <strong>
              ${escapeHtml(
                transitionLabel
              )}
            </strong>.
          </li>

          <li>
            ${localize(
              "DDA.AllyNpc.Evolution.CostLabel"
            )}:

            <strong>
              ${localize(
                "DDA.AllyNpc.Evolution.Free"
              )}
            </strong>.
          </li>
        </ul>
      </div>
    `
  });

  partnerActor.sheet?.render(true);

  ui.notifications.info(
    formatI18n(
      "DDA.AllyNpc.Evolution.Completed",
      {
        name: partnerActor.name
      }
    )
  );

  return partnerActor;
}

function isVideoPath(path = "") {
  const cleanPath = String(path ?? "").split("?")[0].split("#")[0].trim();
  return /\.(webm|mp4|m4v|ogg|ogv)$/i.test(cleanPath);
}

function getEvolutionTokenLookupData(
  formTemplateActor = null,
  snapshot = {}
) {
  const system = formTemplateActor?.system ?? {};
  const names = system.names ?? {};

  const name = String(
    snapshot?.sourceFormName ||
    snapshot?.name ||
    formTemplateActor?.name ||
    ""
  ).trim();

  const species = String(
    snapshot?.species ||
    system.species ||
    formTemplateActor?.name ||
    name
  ).trim();

  return {
    key: String(
      snapshot?.sourceId ||
      system.sourceId ||
      names.canonical ||
      ""
    ).trim(),
    name,
    species,
    aliases: Array.from(new Set([
      snapshot?.sourceFormName,
      snapshot?.name,
      snapshot?.species,
      names.canonical,
      names.original,
      names.dub,
      ...(Array.isArray(names.aliases) ? names.aliases : [])
    ].filter(Boolean)))
  };
}

function getPersistentPartnerNickname(partnerActor = null) {
  const explicitNickname = String(
    partnerActor?.system?.customName ||
    partnerActor?.system?.nickname ||
    ""
  ).trim();
  const actorName = String(partnerActor?.name ?? "").trim();

  /*
   * Compatibilidade com Partners antigos: antes de system.nickname existir,
   * um apelido verdadeiro vivia apenas em Actor#name. O nome de uma espécie
   * conhecida, porém, não é apelido — especialmente depois da regressão que
   * preservava Agumon enquanto system.species já era Greymon.
   */
  const knownSpeciesNames = [
    partnerActor?.system?.species,
    partnerActor?.system?.evolution?.currentFormName,
    partnerActor?.system?.evolution?.sourceFormName,
    ...Object.values(
      partnerActor?.system?.evolution?.formSnapshots ?? {}
    ).flatMap((snapshot) => [
      snapshot?.species,
      snapshot?.sourceFormName
    ]),
    ...(
      Array.isArray(partnerActor?.system?.evolutionGraph?.nodes)
        ? partnerActor.system.evolutionGraph.nodes
        : []
    ).flatMap((node) => [
      node?.species,
      node?.displayName
    ])
  ]
    .map((value) => normalizeName(value))
    .filter(Boolean);

  if (
    explicitNickname &&
    !knownSpeciesNames.includes(normalizeName(explicitNickname))
  ) {
    return explicitNickname;
  }

  if (!actorName) return "";

  return knownSpeciesNames.includes(normalizeName(actorName))
    ? ""
    : actorName;
}

function isMissingTokenImage(path = "") {
  const cleanPath = String(path ?? "").trim();
  return !cleanPath || cleanPath === "icons/svg/mystery-man.svg";
}

function isDefaultTokenImage(
  tokenImg = "",
  snapshot = {},
  formTemplateActor = null,
  fallbackActor = null
) {
  const cleanToken = String(tokenImg ?? "").trim();

  if (isMissingTokenImage(cleanToken)) return true;

  const portraitCandidates = [
    snapshot?.portraitImg,
    snapshot?.img,
    formTemplateActor?.system?.evolution?.portraitImg,
    formTemplateActor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait,
    formTemplateActor?.img,
    fallbackActor?.system?.evolution?.portraitImg,
    fallbackActor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait,
    fallbackActor?.img
  ]
    .map((path) => String(path ?? "").trim())
    .filter(Boolean);

  return portraitCandidates.includes(cleanToken);
}

async function resolveEvolutionTokenImage({
  snapshot = {},
  formTemplateActor = null,
  fallbackActor = null
} = {}) {
  const savedToken = String(
    snapshot?.tokenImg ||
    formTemplateActor?.system?.evolution?.tokenImg ||
    formTemplateActor?.prototypeToken?.texture?.src ||
    ""
  ).trim();

  /*
   * Um token diferente do portrait é uma escolha personalizada
   * ou um token oficial já resolvido. Nunca sobrescrever.
   */
  if (!isDefaultTokenImage(
    savedToken,
    snapshot,
    formTemplateActor,
    fallbackActor
  )) {
    return savedToken;
  }

  const officialToken = await getDdaTokenPath(
    getEvolutionTokenLookupData(formTemplateActor, snapshot)
  );

  if (officialToken) return officialToken;

  return String(
    savedToken ||
    fallbackActor?.system?.evolution?.tokenImg ||
    fallbackActor?.prototypeToken?.texture?.src ||
    fallbackActor?.img ||
    formTemplateActor?.img ||
    "icons/svg/mystery-man.svg"
  ).trim();
}

async function getEvolutionTokenTextureSource(
  formTemplateActor,
  fallbackActor = null
) {
  return resolveEvolutionTokenImage({
    formTemplateActor,
    fallbackActor
  });
}

async function applyEvolutionFormTemplateToPartner({
  partnerActor,
  formTemplateActor,
  tamerActor,
  previousFormActor,
  transitionType = "formChange",
  continuedHybridState = null
}) {
  if (!partnerActor || !formTemplateActor) return null;

  // A Mode Change is a temporary combat state, not a persistent form build.
  // Normalize it before capturing the outgoing form so swapped stats, size and
  // Superior Mode item sets can never leak into formSnapshots.
  if (partnerActor.system?.combat?.qualityModeChange?.active) {
    await resetModeChangeForActor(partnerActor);
  }

  await saveCurrentPartnerFormSnapshot(partnerActor);
  const snapshot = await getOrCreatePartnerFormSnapshot(partnerActor, formTemplateActor);

  await applyPartnerFormSnapshot({
    partnerActor,
    snapshot,
    formTemplateActor,
    tamerActor,
    previousFormActor,
    transitionType,
    continuedHybridState
  });

  return partnerActor;
}

export async function restorePartnerFormForRevitalize({
  tamerActor,
  partnerActor,
  formReference = ""
} = {}) {
  if (!partnerActor) return null;

  const reference = String(formReference ?? "").trim();
  if (!reference) return null;

  const storedSnapshot = getPartnerFormSnapshot(
    partnerActor,
    reference
  );

  let formTemplateActor = storedSnapshot
    ? buildPseudoActorFromFormSnapshot(
        storedSnapshot,
        partnerActor
      )
    : await resolveActor(reference);

  if (!formTemplateActor) return null;

  const previousReference = String(
    partnerActor.system?.evolution?.currentFormUuid ??
    partnerActor.system?.evolution?.sourceFormUuid ??
    partnerActor.uuid ??
    ""
  ).trim();

  const previousFormActor =
    await resolveActor(previousReference) ??
    partnerActor;

  await runDigimonTokenEvolutionTransition(
    partnerActor,
    async () => {
      await clearClashStateForActor(
        partnerActor,
        {
          reason: "revitalize"
        }
      );

      await applyEvolutionFormTemplateToPartner({
        partnerActor,
        formTemplateActor,
        tamerActor,
        previousFormActor,
        transitionType: "revitalize",
        continuedHybridState: null
      });

      return partnerActor;
    },
    {
      lowAlphaMultiplier: 0.16,
      midAlphaMultiplier: 0.62,
      stepDelay: 90
    }
  );

  if (tamerActor?.type === "character") {
    await tamerActor.update({
      "system.partner.uuid":
        partnerActor.uuid,

      "system.partner.currentFormUuid":
        partnerActor.system?.evolution
          ?.currentFormUuid ??
        formTemplateActor.uuid ??
        reference,

      "system.partner.currentFormName":
        partnerActor.system?.evolution
          ?.currentFormName ??
        formTemplateActor.name ??
        partnerActor.name
    });
  }

  return partnerActor;
}

async function resolveCurrentFormWizardActors(
  sourceActor
) {
  if (!sourceActor) return null;

  /*
   * Fluxo tradicional:
   * o Wizard foi aberto pela ficha do Tamer.
   */
  if (sourceActor.type === "character") {
    const partnerUuid =
      sourceActor.system.partner?.uuid;

    if (!partnerUuid) {
      ui.notifications.warn(
        localize(
          "DDA.Warning.NoPartnerLinked"
        )
      );

      return null;
    }

    const partnerActor =
      await resolveActor(partnerUuid);

    if (
      !partnerActor ||
      partnerActor.type !== "digimon"
    ) {
      ui.notifications.warn(
        localize(
          "DDA.Warning.PartnerNotFound"
        )
      );

      return null;
    }

    return {
      tamerActor: sourceActor,
      partnerActor
    };
  }

  /*
   * Fluxo independente:
   * o Wizard foi aberto pela ficha do Digimon.
   */
  if (
    ["digimon", "npc"].includes(
      sourceActor.type
    )
  ) {
    const partnerActor = sourceActor;

    const storedTamerUuid = String(
      partnerActor.system?.tamer?.uuid ?? ""
    ).trim();

    let tamerActor = storedTamerUuid
      ? await resolveActor(storedTamerUuid)
      : null;

    /*
     * Compatibilidade com Digimons antigos que não
     * possuem system.tamer.uuid, mas estão ligados
     * por system.partner.uuid no Tamer.
     */
    if (tamerActor?.type !== "character") {
      tamerActor = game.actors.find(
        (actor) => {
          return (
            actor.type === "character" &&
            actor.system?.partner?.uuid ===
              partnerActor.uuid
          );
        }
      ) ?? null;
    }

    return {
      tamerActor,
      partnerActor
    };
  }

  ui.notifications.warn(
    localize(
      "DDA.Warning.ChosenEvolutionFormNotDigimon"
    )
  );

  return null;
}

export async function getCurrentPartnerFormWizardContext(
  sourceActor
) {
  const actors =
    await resolveCurrentFormWizardActors(
      sourceActor
    );

  if (!actors) return null;

  const {
    tamerActor,
    partnerActor
  } = actors;

  // Mode Change is a temporary combat overlay. Opening the current-form
  // Wizard must never serialize that overlay into the persistent form build.
  if (partnerActor.system?.combat?.qualityModeChange?.active) {
    await resetModeChangeForActor(partnerActor);
  }

  /*
   * O próprio Digimon persistente é a fonte
   * principal da forma atualmente ativa.
   *
   * Quando existe um Tamer, ele funciona apenas
   * como espelho e referência externa.
   */
  const partnerCurrentFormUuid = String(
    partnerActor.system.evolution
      ?.currentFormUuid ||
    partnerActor.system.evolution
      ?.sourceFormUuid ||
    ""
  ).trim();

  const tamerCurrentFormUuid = String(
    tamerActor?.system?.partner
      ?.currentFormUuid ||
    ""
  ).trim();

  const currentFormUuid =
    partnerCurrentFormUuid ||
    tamerCurrentFormUuid ||
    partnerActor.uuid;

  /*
   * DDA-SNAPSHOT.* não é um Actor real.
   * Primeiro procuramos o snapshot armazenado.
   */
  const storedSnapshot =
    getPartnerFormSnapshot(
      partnerActor,
      currentFormUuid
    );

  let formTemplateActor =
    await resolveActor(currentFormUuid);

  if (
    !formTemplateActor &&
    storedSnapshot
  ) {
    formTemplateActor =
      buildPseudoActorFromFormSnapshot(
        storedSnapshot,
        partnerActor
      );
  }

  formTemplateActor ??= partnerActor;

  // The active persistent Partner is the canonical source for the current
  // form. Refresh its snapshot before opening the Wizard so direct sheet edits
  // made since the last form change are never hidden by an older snapshot.
  const liveSnapshot = buildFormSnapshotFromActor(partnerActor, {
    sourceFormUuid: currentFormUuid,
    sourceFormName:
      partnerActor.system.evolution?.currentFormName ||
      partnerActor.system.evolution?.sourceFormName ||
      partnerActor.system?.species ||
      partnerActor.name
  });

  liveSnapshot.key = storedSnapshot?.key || liveSnapshot.key;
  liveSnapshot.createdAt = storedSnapshot?.createdAt || liveSnapshot.createdAt;
  liveSnapshot.wizard = foundry.utils.mergeObject(
    foundry.utils.deepClone(storedSnapshot?.wizard ?? {}),
    foundry.utils.deepClone(liveSnapshot.wizard ?? {}),
    { inplace: false, recursive: true }
  );

  await upsertPartnerFormSnapshot(partnerActor, liveSnapshot);
  const snapshot = getPartnerFormSnapshot(partnerActor, currentFormUuid) ?? liveSnapshot;
  formTemplateActor = partnerActor;

  const totalBonusDp = Math.max(
    0,

    Number(
      partnerActor.system?.advancement
        ?.bonusDp?.total ?? 0
    ) || 0,

    Number(
      partnerActor.system?.creation
        ?.dp?.bonus ?? 0
    ) || 0,

    Number(
      partnerActor.system?.creation
        ?.bonusDp ?? 0
    ) || 0
  );

  const formBonusDp =
    getPartnerFormBonusDpAvailable(
      partnerActor,

      snapshot?.sourceFormUuid ||
        currentFormUuid ||
        formTemplateActor?.uuid ||
        "",

      totalBonusDp
    );

  return {
    tamerActor,
    partnerActor,
    formTemplateActor,
    snapshot,
    bonusDp: formBonusDp,
    bonusDpTotal: totalBonusDp
  };
}

export async function getStoredPartnerFormWizardContext(
  sourceActor,
  sourceFormUuid
) {
  const actors = await resolveCurrentFormWizardActors(sourceActor);
  if (!actors) return null;

  const { tamerActor, partnerActor } = actors;
  const wantedReference = String(sourceFormUuid ?? "").trim();

  if (!wantedReference) {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotFound"));
    return null;
  }

  let snapshot = getPartnerFormSnapshot(partnerActor, wantedReference);

  if (!snapshot) {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotFound"));
    return null;
  }

  let formTemplateActor = await resolveActor(
    snapshot.sourceFormUuid || wantedReference
  );

  if (!formTemplateActor) {
    formTemplateActor = buildPseudoActorFromFormSnapshot(
      snapshot,
      partnerActor
    );
  }

  const currentFormUuid = String(
    partnerActor.system.evolution?.currentFormUuid ||
    partnerActor.system.evolution?.sourceFormUuid ||
    partnerActor.uuid
  ).trim();

  const currentSnapshot = getPartnerFormSnapshot(
    partnerActor,
    currentFormUuid
  );

  const isCurrentForm = Boolean(
    wantedReference === currentFormUuid ||
    snapshot.sourceFormUuid === currentFormUuid ||
    (currentSnapshot && currentSnapshot.key === snapshot.key) ||
    (currentSnapshot &&
      currentSnapshot.sourceFormUuid === snapshot.sourceFormUuid)
  );

  // The Planner may open a stored entry that is actually the active form.
  // Refresh that entry from the persistent Partner for the same reason as the
  // direct current-form Wizard path: active Actor data outranks its snapshot.
  if (isCurrentForm) {
    if (partnerActor.system?.combat?.qualityModeChange?.active) {
      await resetModeChangeForActor(partnerActor);
    }

    const liveSnapshot = buildFormSnapshotFromActor(partnerActor, {
      sourceFormUuid: currentFormUuid,
      sourceFormName:
        partnerActor.system.evolution?.currentFormName ||
        partnerActor.system.evolution?.sourceFormName ||
        partnerActor.system?.species ||
        partnerActor.name
    });

    liveSnapshot.key = snapshot?.key || liveSnapshot.key;
    liveSnapshot.createdAt = snapshot?.createdAt || liveSnapshot.createdAt;
    liveSnapshot.wizard = foundry.utils.mergeObject(
      foundry.utils.deepClone(snapshot?.wizard ?? {}),
      foundry.utils.deepClone(liveSnapshot.wizard ?? {}),
      { inplace: false, recursive: true }
    );

    await upsertPartnerFormSnapshot(partnerActor, liveSnapshot);
    snapshot = getPartnerFormSnapshot(partnerActor, currentFormUuid) ?? liveSnapshot;
    formTemplateActor = partnerActor;
  }

  const totalBonusDp = Math.max(
    0,
    Number(partnerActor.system?.advancement?.bonusDp?.total ?? 0) || 0,
    Number(partnerActor.system?.creation?.dp?.bonus ?? 0) || 0,
    Number(partnerActor.system?.creation?.bonusDp ?? 0) || 0
  );

  const jogressPlan = snapshot?.wizard?.jogressPlan ?? null;
  const storedJogressProfile = jogressPlan?.bonusDpProfile ?? null;
  const effectiveBonusTotal = storedJogressProfile
    ? Math.max(0, Number(storedJogressProfile.total ?? jogressPlan?.combinedBonusDp ?? 0))
    : totalBonusDp;
  const formBonusDp = storedJogressProfile
    ? Math.max(0, Number(storedJogressProfile.qualityAllocated ?? 0))
    : getPartnerFormBonusDpAvailable(
        partnerActor,
        snapshot.sourceFormUuid || wantedReference,
        totalBonusDp
      );

  return {
    tamerActor,
    partnerActor,
    formTemplateActor,
    snapshot,
    bonusDp: formBonusDp,
    bonusDpTotal: effectiveBonusTotal,
    bonusDpProfile: storedJogressProfile ? foundry.utils.deepClone(storedJogressProfile) : null,
    isCurrentForm
  };
}

export async function getFuturePartnerFormWizardContext(
  sourceActor,
  formTemplateActor,
  options = {}
) {
  if (!formTemplateActor || formTemplateActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotDigimon"));
    return null;
  }

  // Future-form planning must support the same actor entry points as the
  // current/stored-form Wizards: Tamer, persistent Digimon, or Digimon NPC.
  // resolveCurrentFormWizardActors also resolves the linked Tamer when one
  // exists, while correctly allowing standalone Digimon/NPC actors.
  const actors = await resolveCurrentFormWizardActors(sourceActor);
  if (!actors) return null;

  const { tamerActor, partnerActor } = actors;

  const requestedSnapshotReference = String(options?.snapshotReference ?? "").trim();
  const formTemplateReference = requestedSnapshotReference || getFormTemplateReference(formTemplateActor);
  const existingSnapshot = getPartnerFormSnapshot(
    partnerActor,
    formTemplateReference
  );
  const templateSystem = formTemplateActor.system ?? {};
  const templateNames = templateSystem.names ?? {};
  const staticPortraitSources = resolveDigimonPortraitSources(
    formTemplateActor,
    { allowVideo: false }
  );
  const actorPortraitSources = resolveDigimonPortraitSources(
    formTemplateActor,
    { allowVideo: true }
  );
  const staticImage = String(
    staticPortraitSources[0] ||
    options?.portraitImg ||
    formTemplateActor.img ||
    "icons/svg/mystery-man.svg"
  ).trim();
  const actorPortrait = String(
    actorPortraitSources[0] ||
    staticImage
  ).trim();
  const plannedEvolutionMethod = String(
    options?.plannedEvolutionMethod ||
    existingSnapshot?.wizard?.plannedEvolutionMethod ||
    "normal"
  ).trim() || "normal";
  const plannedFromReference = String(
    options?.plannedFromReference ||
    existingSnapshot?.wizard?.plannedFromReference ||
    ""
  ).trim();
  const templateSpecies = String(
    templateSystem.species ||
    formTemplateActor.name ||
    "Digimon"
  ).trim() || "Digimon";
  const persistentNickname = getPersistentPartnerNickname(
    partnerActor
  );

  const snapshot = {
    ...(existingSnapshot ?? {}),
    sourceFormUuid: formTemplateReference,
    sourceFormName: String(
      formTemplateActor.name ||
      templateSystem.species ||
      existingSnapshot?.sourceFormName ||
      "Digimon"
    ),
    sourceId: String(
      templateSystem.sourceId ||
      templateNames.canonical ||
      existingSnapshot?.sourceId ||
      ""
    ),
    databaseId: String(
      templateSystem.databaseId ||
      formTemplateActor.databaseId ||
      existingSnapshot?.databaseId ||
      ""
    ),
    originalName: String(
      templateNames.original ||
      templateSystem.species ||
      formTemplateActor.name ||
      ""
    ),
    dubName: String(
      templateNames.dub ||
      templateSystem.species ||
      formTemplateActor.name ||
      ""
    ),
    aliases: Array.isArray(templateNames.aliases)
      ? foundry.utils.deepClone(templateNames.aliases)
      : [],
    names: foundry.utils.deepClone(templateNames),

    // Only an explicit nickname follows the persistent Partner between forms.
    name: persistentNickname || templateSpecies,

    img: staticImage,
    portraitImg: actorPortrait,
    imageFallbacks: staticPortraitSources.slice(1).join("|"),
    tokenImg: existingSnapshot?.tokenImg ||
      await getEvolutionTokenTextureSource(formTemplateActor, null),

    species: templateSpecies,
    stage: templateSystem.stage || "child",
    stageValue: Number(templateSystem.stageValue ?? 2),
    size: templateSystem.size || "medium",
    type: templateSystem.type || "",
    attribute: templateSystem.attribute || "data",
    field: templateSystem.field || "none",
    family: templateSystem.family || "none",
    group: templateSystem.group || "",
    evolutionCategory: plannedEvolutionMethod === "jogress"
      ? "jogress"
      : (templateSystem.evolutionCategory || "normal"),
    specialCategories: plannedEvolutionMethod === "jogress"
      ? Array.from(new Set([
          ...(Array.isArray(templateSystem.specialCategories) ? templateSystem.specialCategories : []),
          "jogress"
        ]))
      : foundry.utils.deepClone(templateSystem.specialCategories ?? []),
    primarySpecialCategory: plannedEvolutionMethod === "jogress"
      ? "jogress"
      : String(templateSystem.primarySpecialCategory || ""),
    isSpecialForm: plannedEvolutionMethod === "jogress"
      ? true
      : Boolean(templateSystem.isSpecialForm),
    specialForm: plannedEvolutionMethod === "jogress"
      ? {
          ...foundry.utils.deepClone(templateSystem.specialForm ?? {}),
          kind: "jogress",
          method: "jogress",
          equivalentStage: templateSystem.stage || ""
        }
      : foundry.utils.deepClone(templateSystem.specialForm ?? {}),

    profile: foundry.utils.deepClone(
      existingSnapshot?.profile ?? templateSystem.profile ?? {}
    ),
    mainStats: foundry.utils.deepClone(
      existingSnapshot?.mainStats ?? {}
    ),
    miscStats: foundry.utils.deepClone(
      existingSnapshot?.miscStats ?? {}
    ),
    creation: foundry.utils.deepClone(
      existingSnapshot?.creation ?? {}
    ),
    qualityLimits: foundry.utils.deepClone(
      existingSnapshot?.qualityLimits ?? {}
    ),
    wizard: {
      ...(existingSnapshot?.wizard ?? {}),
      preparedFutureForm: true,
      openedAt: existingSnapshot?.wizard?.openedAt || new Date().toISOString(),
      plannedEvolutionMethod,
      plannedFromReference,
      plannedByGM: Boolean(options?.plannedByGM),
      darkEvolution: Boolean(
        options?.darkEvolution || plannedEvolutionMethod === "dark"
      ),
      plannerImageResolved: true,
      ...(options?.jogressPlan
        ? { jogressPlan: foundry.utils.deepClone(options.jogressPlan) }
        : {})
    },

    // Never pull Attacks or Qualities from the currently active form.
    items: Array.isArray(existingSnapshot?.items)
      ? foundry.utils.deepClone(existingSnapshot.items)
      : []
  };

  const standardBonusDp = Math.max(
    0,
    Number(partnerActor.system?.advancement?.bonusDp?.total ?? 0) || 0,
    Number(partnerActor.system?.creation?.dp?.bonus ?? 0) || 0,
    Number(partnerActor.system?.creation?.bonusDp ?? 0) || 0
  );
  const requestedBonusProfile = options?.bonusDpProfile && typeof options.bonusDpProfile === "object"
    ? foundry.utils.deepClone(options.bonusDpProfile)
    : null;
  const totalBonusDp = requestedBonusProfile
    ? Math.max(0, Number(requestedBonusProfile.total ?? options?.bonusDpTotal ?? 0))
    : (Number.isFinite(Number(options?.bonusDpTotal))
        ? Math.max(0, Number(options.bonusDpTotal))
        : standardBonusDp);

  const formBonusDp = requestedBonusProfile
    ? Math.max(0, Number(requestedBonusProfile.qualityAllocated ?? 0))
    : getPartnerFormBonusDpAvailable(
        partnerActor,
        snapshot.sourceFormUuid || formTemplateReference || "",
        totalBonusDp
      );

  return {
    tamerActor,
    partnerActor,
    formTemplateActor,
    snapshot,
    bonusDp: formBonusDp,
    bonusDpTotal: totalBonusDp,
    bonusDpProfile: requestedBonusProfile,
    plannerOptions: foundry.utils.deepClone(options ?? {})
  };
}

export async function savePartnerFormWizardSnapshot({ tamerActor, partnerActor, formTemplateActor, snapshot }) {
  if (!partnerActor || !snapshot) return null;

  const storedSnapshot = normalizeFormSnapshot(
  snapshot,
  formTemplateActor ?? partnerActor
);

storedSnapshot.tokenImg = await resolveEvolutionTokenImage({
  snapshot: storedSnapshot,
  formTemplateActor,
  fallbackActor: partnerActor
});

await upsertPartnerFormSnapshot(partnerActor, storedSnapshot);

  await applyPartnerFormSnapshot({
    partnerActor,
    snapshot: storedSnapshot,
    formTemplateActor: formTemplateActor ?? partnerActor,
    tamerActor,
    previousFormActor: formTemplateActor ?? partnerActor,
    transitionType: "formWizard"
  });

  await synchronizePartnerBonusDpAcrossForms(partnerActor);

  return storedSnapshot;;
}

export async function savePartnerFutureFormSnapshot({
  partnerActor,
  formTemplateActor = null,
  snapshot
} = {}) {
  if (!partnerActor || !snapshot) return null;

  const storedSnapshot = normalizeFormSnapshot({
    ...snapshot,
    wizard: {
      ...(snapshot.wizard ?? {}),
      preparedFutureForm: true,
      preparedAt: new Date().toISOString()
    }
  }, formTemplateActor ?? partnerActor);


  storedSnapshot.tokenImg = await resolveEvolutionTokenImage({
    snapshot: storedSnapshot,
    formTemplateActor,
    // A future form must never borrow the currently active partner artwork.
    fallbackActor: formTemplateActor ?? null
  });

  await upsertPartnerFormSnapshot(partnerActor, storedSnapshot);

  await synchronizePartnerBonusDpAcrossForms(partnerActor);

  return storedSnapshot;
}

async function saveCurrentPartnerFormSnapshot(partnerActor) {
  if (
    !partnerActor ||
    !["digimon", "npc"].includes(
      partnerActor.type
    )
  ) {
    return null;
  }

  const currentFormUuid = partnerActor.system.evolution?.currentFormUuid || partnerActor.system.evolution?.sourceFormUuid || partnerActor.uuid;
  if (!currentFormUuid) return null;

  const existingSnapshot = getPartnerFormSnapshot(partnerActor, currentFormUuid);
  const snapshot = buildFormSnapshotFromActor(partnerActor, {
    sourceFormUuid: currentFormUuid,
    sourceFormName: partnerActor.system.evolution?.currentFormName || partnerActor.system.evolution?.sourceFormName || partnerActor.name
  });

  // Planner metadata belongs to the logical form, not to the physical Partner
  // Actor. Preserve it when the live Actor refreshes an existing snapshot.
  snapshot.key = existingSnapshot?.key || snapshot.key;
  snapshot.createdAt = existingSnapshot?.createdAt || snapshot.createdAt;
  snapshot.wizard = foundry.utils.mergeObject(
    foundry.utils.deepClone(existingSnapshot?.wizard ?? {}),
    foundry.utils.deepClone(snapshot.wizard ?? {}),
    { inplace: false, recursive: true }
  );

  await upsertPartnerFormSnapshot(partnerActor, snapshot);
  return snapshot;
}

async function getOrCreatePartnerFormSnapshot(partnerActor, formTemplateActor) {
  const formTemplateReference = getFormTemplateReference(formTemplateActor);
  const existing = getPartnerFormSnapshot(
    partnerActor,
    formTemplateReference
  );

  const snapshot = existing
    ? normalizeFormSnapshot(existing, formTemplateActor)
    : buildFormSnapshotFromActor(
        formTemplateActor ?? partnerActor,
        {
          sourceFormUuid: formTemplateReference || partnerActor.uuid,
          sourceFormName: formTemplateActor?.name ?? partnerActor.name
        }
      );

  const tokenImg = await resolveEvolutionTokenImage({
    snapshot,
    formTemplateActor,
    fallbackActor: partnerActor
  });

  if (tokenImg && tokenImg !== snapshot.tokenImg) {
    snapshot.tokenImg = tokenImg;
    await upsertPartnerFormSnapshot(partnerActor, snapshot);
  } else if (!existing) {
    await upsertPartnerFormSnapshot(partnerActor, snapshot);
  }

  return snapshot;
}

function normalizeSnapshotRechargeType(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function rechargePartnerFormSnapshotQualityUses(
  partnerActor,
  rechargeType,
  { includeCurrent = false } = {}
) {
  if (!partnerActor || !["digimon", "npc"].includes(partnerActor.type)) return { changed: false, count: 0 };

  const wantedRecharge = normalizeSnapshotRechargeType(rechargeType);
  if (!wantedRecharge) return { changed: false, count: 0 };

  const snapshots = foundry.utils.deepClone(partnerActor.system?.evolution?.formSnapshots ?? {});
  const currentReference = String(
    partnerActor.system?.evolution?.currentFormUuid ||
    partnerActor.system?.evolution?.sourceFormUuid ||
    ""
  ).trim();

  let changed = false;
  let count = 0;

  for (const snapshot of Object.values(snapshots)) {
    if (!snapshot || typeof snapshot !== "object") continue;
    if (!includeCurrent && currentReference && String(snapshot.sourceFormUuid ?? "") === currentReference) continue;
    if (!Array.isArray(snapshot.items)) continue;

    let snapshotChanged = false;
    for (const item of snapshot.items) {
      if (item?.type !== "quality" || !item.system?.uses?.enabled) continue;
      if (normalizeSnapshotRechargeType(item.system.uses.recharge) !== wantedRecharge) continue;

      const max = Math.max(0, Number(item.system.uses.max ?? 0));
      if (max <= 0) continue;
      const value = Math.max(0, Number(item.system.uses.value ?? 0));
      const spent = Math.max(0, Number(item.system.uses.spent ?? 0));
      if (value >= max && spent <= 0) continue;

      item.system.uses.value = max;
      item.system.uses.spent = 0;
      if (wantedRecharge === "combat") {
        item.system.uses.lastUsedCombatId = "";
        item.system.uses.lastUsedRound = 0;
        item.system.uses.lastUsedTurn = -1;
      }
      snapshotChanged = true;
      count += 1;
    }

    if (snapshotChanged) {
      snapshot.updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) {
    await partnerActor.update({ "system.evolution.formSnapshots": snapshots });
  }

  return { changed, count };
}

function getFormTemplateReference(actor = null) {
  return String(
    actor?.uuid ??
    actor?.databaseId ??
    actor?.system?.databaseId ??
    actor?.system?.sourceId ??
    actor?._id ??
    actor?.id ??
    actor?.name ??
    ""
  ).trim();
}

function getPartnerFormSnapshot(partnerActor, sourceFormUuid) {
  const snapshots = partnerActor?.system?.evolution?.formSnapshots ?? {};
  const wanted = String(sourceFormUuid ?? "");
  if (!wanted || typeof snapshots !== "object") return null;

  for (const snapshot of Object.values(snapshots)) {
    if (snapshot?.sourceFormUuid === wanted) return foundry.utils.deepClone(snapshot);
  }

  const key = getFormSnapshotKey(wanted);
  return snapshots[key] ? foundry.utils.deepClone(snapshots[key]) : null;
}

async function upsertPartnerFormSnapshot(partnerActor, snapshot) {
  if (!partnerActor || !snapshot) return null;

  const key = snapshot.key || getFormSnapshotKey(snapshot.sourceFormUuid || snapshot.name || partnerActor.uuid);
  const snapshots = foundry.utils.deepClone(partnerActor.system.evolution?.formSnapshots ?? {});

  snapshots[key] = {
    ...snapshot,
    key,
    updatedAt: new Date().toISOString()
  };

  await partnerActor.update({ "system.evolution.formSnapshots": snapshots });
  return snapshots[key];
}

function normalizeFormSnapshot(snapshot, fallbackActor = null) {
  const sourceFormUuid = String(
    snapshot?.sourceFormUuid ||
    fallbackActor?.uuid ||
    ""
  );

  const key =
    snapshot?.key ||
    getFormSnapshotKey(
      sourceFormUuid ||
      snapshot?.name ||
      fallbackActor?.name ||
      "form"
    );

  const evolutionCategory = String(
    snapshot?.evolutionCategory ||
    fallbackActor?.system
      ?.evolutionCategory ||
    "normal"
  ).trim() || "normal";

  const specialCategories =
    Array.isArray(
      snapshot?.specialCategories
    )
      ? foundry.utils.deepClone(
          snapshot.specialCategories
        )
      : Array.isArray(
          fallbackActor?.system
            ?.specialCategories
        )
        ? foundry.utils.deepClone(
            fallbackActor.system
              .specialCategories
          )
        : evolutionCategory !== "normal"
          ? [evolutionCategory]
          : [];

  const primarySpecialCategory = String(
    snapshot?.primarySpecialCategory ||
    fallbackActor?.system
      ?.primarySpecialCategory ||
    specialCategories.find(
      (category) => {
        return category !== "normal";
      }
    ) ||
    (
      evolutionCategory !== "normal"
        ? evolutionCategory
        : ""
    )
  ).trim();

  const isSpecialForm = Boolean(
    snapshot?.isSpecialForm ??
    fallbackActor?.system
      ?.isSpecialForm ??
    evolutionCategory !== "normal"
  );

  const specialForm =
    foundry.utils.deepClone(
      snapshot?.specialForm ??
      fallbackActor?.system
        ?.specialForm ??
      {}
    );

  if (
    evolutionCategory === "hybrid"
  ) {
    specialForm.kind ??= "hybrid";
    specialForm.method ??= "hybrid";

    specialForm.equivalentStage ??=
      String(
        snapshot?.stage ||
        fallbackActor?.system?.stage ||
        "child"
      );
  }

  const portraitManual = Boolean(
    snapshot?.wizard?.portraitManuallySelected ||
    snapshot?.wizard?.portraitSource === "manual"
  );
  const portraitFallbacks = fallbackActor ? [fallbackActor] : [];
  const staticPortraitSources = resolveDigimonPortraitSources(snapshot ?? {}, {
    fallbackRecords: portraitFallbacks,
    manualPortrait: snapshot?.portraitImg ?? "",
    manualPortraitSelected: portraitManual,
    allowVideo: false
  });
  const actorPortraitSources = resolveDigimonPortraitSources(snapshot ?? {}, {
    fallbackRecords: portraitFallbacks,
    manualPortrait: snapshot?.portraitImg ?? "",
    manualPortraitSelected: portraitManual,
    allowVideo: true
  });
  const resolvedStaticImg = String(
    staticPortraitSources[0] ||
    snapshot?.img ||
    fallbackActor?.img ||
    "icons/svg/mystery-man.svg"
  );
  const resolvedPortraitImg = String(
    actorPortraitSources[0] ||
    resolvedStaticImg
  );
  const hasSnapshotIdentity = Boolean(
    snapshot?.sourceId ||
    snapshot?.databaseId ||
    snapshot?.names?.canonical ||
    snapshot?.species ||
    snapshot?.sourceFormName
  );
  const fallbackAliases = !hasSnapshotIdentity && Array.isArray(
    fallbackActor?.system?.names?.aliases
  )
    ? fallbackActor.system.names.aliases
    : [];

  return {
    key,
    sourceFormUuid,

    sourceFormName: String(
      snapshot?.sourceFormName ||
      snapshot?.species ||
      snapshot?.name ||
      fallbackActor?.name ||
      ""
    ),

    sourceId: String(
      snapshot?.sourceId ||
      snapshot?.names?.canonical ||
      snapshot?.species ||
      fallbackActor?.system?.sourceId ||
      fallbackActor?.system?.names?.canonical ||
      fallbackActor?.system?.species ||
      ""
    ),

    databaseId: String(
      snapshot?.databaseId ||
      (!hasSnapshotIdentity
        ? fallbackActor?.system?.databaseId
        : "") ||
      ""
    ),

    originalName: String(
      snapshot?.originalName ||
      snapshot?.names?.original ||
      snapshot?.species ||
      fallbackActor?.system?.names?.original ||
      fallbackActor?.system?.species ||
      snapshot?.name ||
      ""
    ),

    dubName: String(
      snapshot?.dubName ||
      snapshot?.names?.dub ||
      snapshot?.species ||
      fallbackActor?.system?.names?.dub ||
      fallbackActor?.system?.species ||
      snapshot?.name ||
      ""
    ),

    aliases: Array.from(
      new Set([
        ...(Array.isArray(snapshot?.aliases)
          ? snapshot.aliases
          : []),

        ...(Array.isArray(snapshot?.names?.aliases)
          ? snapshot.names.aliases
          : []),

        ...fallbackAliases
      ]
        .map((value) => {
          return String(value ?? "").trim();
        })
        .filter(Boolean))
    ),

    names: {
      canonical: String(
        snapshot?.names?.canonical ||
        snapshot?.sourceId ||
        snapshot?.species ||
        fallbackActor?.system?.names?.canonical ||
        fallbackActor?.system?.sourceId ||
        fallbackActor?.system?.species ||
        ""
      ),

      original: String(
        snapshot?.names?.original ||
        snapshot?.originalName ||
        snapshot?.species ||
        fallbackActor?.system?.names?.original ||
        fallbackActor?.system?.species ||
        ""
      ),

      dub: String(
        snapshot?.names?.dub ||
        snapshot?.dubName ||
        snapshot?.species ||
        fallbackActor?.system?.names?.dub ||
        fallbackActor?.system?.species ||
        ""
      ),

      aliases: Array.from(
        new Set([
          ...(Array.isArray(snapshot?.aliases)
            ? snapshot.aliases
            : []),

          ...(Array.isArray(snapshot?.names?.aliases)
            ? snapshot.names.aliases
            : []),

          ...fallbackAliases
        ]
          .map((value) => {
            return String(value ?? "").trim();
          })
          .filter(Boolean))
      )
    },

    name: String(
      snapshot?.name ||
      fallbackActor?.name ||
      snapshot?.sourceFormName ||
      "Digimon"
    ),

    img: resolvedStaticImg,
    portraitImg: resolvedPortraitImg,
    imageFallbacks: staticPortraitSources.slice(1).join("|"),
    tokenImg: String(
      snapshot?.tokenImg ||
      resolvedStaticImg ||
      resolvedPortraitImg ||
      fallbackActor?.system?.evolution?.tokenImg ||
      fallbackActor?.prototypeToken?.texture?.src ||
      "icons/svg/mystery-man.svg"
    ),
    species: String(snapshot?.species || fallbackActor?.system?.species || fallbackActor?.name || snapshot?.name || "Digimon"),
    stage: String(snapshot?.stage || fallbackActor?.system?.stage || "child"),
    stageValue: Number(snapshot?.stageValue ?? fallbackActor?.system?.stageValue ?? 2),
    size: String(snapshot?.size || fallbackActor?.system?.size || "medium"),
    tokenGridSize: Math.max(
      0,
      Number(
        snapshot?.tokenGridSize ??
        fallbackActor?.flags?.[DDA_SYSTEM_ID]?.tokenGridSizeOverride ??
        0
      )
    ),
    type: String(snapshot?.type || fallbackActor?.system?.type || ""),
    attribute: String(snapshot?.attribute || fallbackActor?.system?.attribute || "data"),
    field: String(snapshot?.field || fallbackActor?.system?.field || "none"),
    family: String(
      snapshot?.family ||
      fallbackActor?.system?.family ||
      "none"
    ),

    group: String(
      snapshot?.group ||
      fallbackActor?.system?.group ||
      ""
    ),

    evolutionCategory,
    specialCategories,
    primarySpecialCategory,
    isSpecialForm,
    specialForm,

    profile: foundry.utils.deepClone(
      snapshot?.profile ??
      fallbackActor?.system?.profile ??
      {}
    ),
    mainStats: foundry.utils.deepClone(snapshot?.mainStats ?? getSnapshotMainStats(fallbackActor)),
    miscStats: foundry.utils.deepClone(snapshot?.miscStats ?? getSnapshotMiscStats(fallbackActor)),
    creation: foundry.utils.deepClone(snapshot?.creation ?? fallbackActor?.system?.creation ?? {}),
    qualityLimits: foundry.utils.deepClone(snapshot?.qualityLimits ?? fallbackActor?.system?.qualityLimits ?? {}),
    wizard: foundry.utils.deepClone(snapshot?.wizard ?? fallbackActor?.system?.wizard ?? {}),
    items: Array.isArray(snapshot?.items) ? foundry.utils.deepClone(snapshot.items) : buildSnapshotItemsFromActor(fallbackActor),
    createdAt: String(snapshot?.createdAt || new Date().toISOString()),
    updatedAt: String(snapshot?.updatedAt || new Date().toISOString())
  };
}

function getGraphNodePersistentSnapshot({ partnerActor = null, node = null, isSnapshotNode = false } = {}) {
  const storedSnapshot = getPartnerFormSnapshot(partnerActor, node?.actorUuid);
  const graphSnapshot = buildFormSnapshotFromGraphNode(node, partnerActor);

  if (!storedSnapshot) return graphSnapshot;

  // Para Actors reais/persistentes, preserva o snapshot salvo.
  // Para nodes DDA-SNAPSHOT.*, atualiza os dados visuais pelo grafo,
  // porque snapshots antigos podem ter herdado a imagem da forma anterior.
  if (!isSnapshotNode) return storedSnapshot;

  const graphImg = String(graphSnapshot?.img || "").trim();
  const storedImg = String(storedSnapshot?.img || "").trim();
  const hasGraphImage = Boolean(graphImg && graphImg !== "icons/svg/mystery-man.svg");

const graphPortraitImg = String(graphSnapshot?.portraitImg || "").trim();
const storedPortraitImg = String(storedSnapshot?.portraitImg || "").trim();
const graphTokenImg = String(graphSnapshot?.tokenImg || "").trim();
const storedTokenImg = String(storedSnapshot?.tokenImg || "").trim();

return {
  ...storedSnapshot,
  sourceFormUuid: graphSnapshot.sourceFormUuid || storedSnapshot.sourceFormUuid,
  sourceFormName: graphSnapshot.sourceFormName || storedSnapshot.sourceFormName,
  name: graphSnapshot.name || storedSnapshot.name,
  species: graphSnapshot.species || storedSnapshot.species,
  stage: graphSnapshot.stage || storedSnapshot.stage,
  stageValue: Number(graphSnapshot.stageValue ?? storedSnapshot.stageValue ?? 2),
  size: graphSnapshot.size || storedSnapshot.size,
  type: graphSnapshot.type || storedSnapshot.type,
  attribute: graphSnapshot.attribute || storedSnapshot.attribute,
  field: graphSnapshot.field || storedSnapshot.field,
  family: graphSnapshot.family || storedSnapshot.family,
  group:
    graphSnapshot.group ||
    storedSnapshot.group,

  evolutionCategory:
    graphSnapshot.evolutionCategory ||
    storedSnapshot.evolutionCategory ||
    "normal",

  specialCategories:
    graphSnapshot.specialCategories?.length
      ? foundry.utils.deepClone(
          graphSnapshot.specialCategories
        )
      : foundry.utils.deepClone(
          storedSnapshot
            .specialCategories ?? []
        ),

  primarySpecialCategory:
    graphSnapshot
      .primarySpecialCategory ||
    storedSnapshot
      .primarySpecialCategory ||
    "",

  isSpecialForm:
    Boolean(
      graphSnapshot.isSpecialForm ??
      storedSnapshot.isSpecialForm
    ),

  specialForm:
    foundry.utils.deepClone(
      Object.keys(
        graphSnapshot.specialForm ?? {}
      ).length
        ? graphSnapshot.specialForm
        : storedSnapshot.specialForm ?? {}
    ),

  img: hasGraphImage
    ? graphImg
    : (
        storedImg ||
        graphImg ||
        "icons/svg/mystery-man.svg"
      ),
  portraitImg: storedPortraitImg || graphPortraitImg || storedImg || graphImg || "icons/svg/mystery-man.svg",
  tokenImg: storedTokenImg || graphTokenImg || storedImg || graphImg || storedPortraitImg || graphPortraitImg || "icons/svg/mystery-man.svg",
  updatedAt: new Date().toISOString()
};
}

function buildFormSnapshotFromGraphNode(node, partnerActor = null) {
  const nodeName = String(node?.name || node?.species || node?.displayName || "Digimon");
  const nodeSpecies = String(node?.species || node?.displayName || node?.name || "Digimon");
  const nodeStage = String(node?.stage || partnerActor?.system?.stage || "child");

  const nodeImg = String(
    node?.img ||
    node?.image ||
    node?.texture?.src ||
    node?.prototypeToken?.texture?.src ||
    ""
  ).trim();

  return normalizeFormSnapshot({
    sourceFormUuid: String(
      node?.actorUuid ||
      node?.uuid ||
      partnerActor?.uuid ||
      ""
    ),

    sourceFormName: String(
      node?.displayName ||
      node?.species ||
      node?.name ||
      ""
    ),

    sourceId: String(
      node?.sourceId || ""
    ),

    databaseId: String(
      node?.databaseId || ""
    ),

    originalName: String(
      node?.originalName ||
      nodeSpecies
    ),

    dubName: String(
      node?.dubName ||
      node?.displayName ||
      nodeSpecies
    ),

    aliases: Array.isArray(node?.aliases)
      ? foundry.utils.deepClone(
          node.aliases
        )
      : [],

    names: {
      canonical: String(
        node?.sourceId ||
        nodeSpecies
      ),

      original: String(
        node?.originalName ||
        nodeSpecies
      ),

      dub: String(
        node?.dubName ||
        node?.displayName ||
        nodeSpecies
      ),

      aliases: Array.isArray(node?.aliases)
        ? foundry.utils.deepClone(
            node.aliases
          )
        : []
    },

    name: nodeName,
    img: nodeImg || "icons/svg/mystery-man.svg",
    portraitImg: String(node?.portraitImg || nodeImg || "icons/svg/mystery-man.svg"),
    tokenImg: String(node?.tokenImg || node?.prototypeToken?.texture?.src || nodeImg || "icons/svg/mystery-man.svg"),
    species: nodeSpecies,
    stage: nodeStage,
    stageValue: Number(node?.stageValue ?? partnerActor?.system?.stageValue ?? 2),
    size: String(node?.size || partnerActor?.system?.size || "medium"),
    type: String(node?.type || partnerActor?.system?.type || ""),
    attribute: String(node?.attribute || partnerActor?.system?.attribute || "data"),
    field: String(node?.field || partnerActor?.system?.field || "none"),
    family: String(
      node?.family ||
      partnerActor?.system?.family ||
      "none"
    ),

    group: String(
      node?.group ||
      partnerActor?.system?.group ||
      ""
    ),

    evolutionCategory: String(
      node?.evolutionCategory ||
      partnerActor?.system
        ?.evolutionCategory ||
      "normal"
    ),

    specialCategories:
      Array.isArray(
        node?.specialCategories
      )
        ? foundry.utils.deepClone(
            node.specialCategories
          )
        : [],

    primarySpecialCategory:
      String(
        node?.primarySpecialCategory ||
        ""
      ),

    isSpecialForm:
      Boolean(node?.isSpecialForm),

    specialForm:
      foundry.utils.deepClone(
        node?.specialForm ?? {}
      )
  }, null);
}

function buildPseudoActorFromFormSnapshot(snapshot, partnerActor = null) {
  const normalized = normalizeFormSnapshot(snapshot, partnerActor);

  return {
      documentName: "Actor",
      type: "digimon",
      uuid: normalized.sourceFormUuid || partnerActor?.uuid || foundry.utils.randomID(),
      name: normalized.name || normalized.species || "Digimon",
      img: normalized.img || normalized.portraitImg || "icons/svg/mystery-man.svg",
      flags: {
        [DDA_SYSTEM_ID]: {
          digivicePortrait: normalized.portraitImg || normalized.img || "icons/svg/mystery-man.svg"
        }
      },
  prototypeToken: {
      texture: {
        src: normalized.tokenImg || normalized.portraitImg || normalized.img || "icons/svg/mystery-man.svg"
      }
    },
    system: {
      sourceId:
        normalized.sourceId || "",

      databaseId:
        normalized.databaseId || "",

      names:
        foundry.utils.deepClone(
          normalized.names ?? {
            canonical:
              normalized.sourceId ||
              normalized.species ||
              normalized.name ||
              "Digimon",

            original:
              normalized.originalName ||
              normalized.species ||
              normalized.name ||
              "Digimon",

            dub:
              normalized.dubName ||
              normalized.species ||
              normalized.name ||
              "Digimon",

            aliases:
              normalized.aliases ?? []
          }
        ),

      species: normalized.species || normalized.name || "Digimon",
      stage: normalized.stage || "child",
      stageValue: Number(normalized.stageValue ?? 2),
      size: normalized.size || "medium",
      type: normalized.type || "",
      attribute: normalized.attribute || "data",
      field: normalized.field || "none",
      family:
        normalized.family || "none",

      group:
        normalized.group || "",

      evolutionCategory:
        normalized.evolutionCategory ||
        "normal",

      specialCategories:
        foundry.utils.deepClone(
          normalized.specialCategories ??
          []
        ),

      primarySpecialCategory:
        normalized.primarySpecialCategory ||
        "",

      isSpecialForm:
        Boolean(
          normalized.isSpecialForm
        ),

      specialForm:
        foundry.utils.deepClone(
          normalized.specialForm ?? {}
        ),

      profile:
        foundry.utils.deepClone(
          normalized.profile ?? {}
        ),
      mainStats: foundry.utils.deepClone(normalized.mainStats ?? {}),
      miscStats: foundry.utils.deepClone(normalized.miscStats ?? {}),
      creation: foundry.utils.deepClone(normalized.creation ?? {}),
      qualityLimits: foundry.utils.deepClone(normalized.qualityLimits ?? {}),
      wizard: foundry.utils.deepClone(normalized.wizard ?? {}),
      evolution: {
        currentFormUuid: normalized.sourceFormUuid || partnerActor?.uuid || "",
        currentFormName: normalized.sourceFormName || normalized.name || "",
        sourceFormUuid: normalized.sourceFormUuid || partnerActor?.uuid || "",
        sourceFormName: normalized.sourceFormName || normalized.name || "",
        portraitImg: normalized.portraitImg || normalized.img || "icons/svg/mystery-man.svg",
        tokenImg: normalized.tokenImg || normalized.img || normalized.portraitImg || "icons/svg/mystery-man.svg"
      }
    },
    items: normalized.items ?? []
  };
}

function buildFormSnapshotFromActor(actor, options = {}) {
  const system = actor?.system ?? {};
  const storedPortrait = String(
    actor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait ||
    ""
  ).trim();
  const portraitManuallySelected = Boolean(
    actor?.flags?.[DDA_SYSTEM_ID]?.digivicePortraitManual
  );
  const portraitImg = String(
    (portraitManuallySelected
      ? (storedPortrait || actor?.img)
      : system.evolution?.portraitImg) ||
    storedPortrait ||
    actor?.img ||
    "icons/svg/mystery-man.svg"
  );

  const tokenImg = String(
    actor?.prototypeToken?.texture?.src ||
    system.evolution?.tokenImg ||
    actor?.img ||
    portraitImg ||
    "icons/svg/mystery-man.svg"
  );

  return normalizeFormSnapshot({
    sourceFormUuid: String(
      options.sourceFormUuid ||
      system.evolution?.currentFormUuid ||
      system.evolution?.sourceFormUuid ||
      actor?.uuid ||
      ""
    ),

    sourceFormName: String(
      options.sourceFormName ||
      system.evolution?.currentFormName ||
      system.evolution?.sourceFormName ||
      actor?.name ||
      ""
    ),

    sourceId: String(
      system.sourceId ||
      system.names?.canonical ||
      ""
    ),

    databaseId: String(
      system.databaseId || ""
    ),

    originalName: String(
      system.names?.original ||
      system.species ||
      actor?.name ||
      ""
    ),

    dubName: String(
      system.names?.dub ||
      system.species ||
      actor?.name ||
      ""
    ),

    aliases: Array.isArray(
      system.names?.aliases
    )
      ? foundry.utils.deepClone(
          system.names.aliases
        )
      : [],

    names: foundry.utils.deepClone(
      system.names ?? {}
    ),

    name: actor?.name ?? "Digimon",
    img: actor?.img ?? "icons/svg/mystery-man.svg",
    portraitImg,
    tokenImg,
    species: system.species ?? actor?.name ?? "Digimon",
    stage: system.stage ?? "child",
    stageValue: Number(system.stageValue ?? 2),
    size: system.size ?? "medium",
    tokenGridSize: Math.max(
      0,
      Number(actor?.flags?.[DDA_SYSTEM_ID]?.tokenGridSizeOverride ?? 0)
    ),
    type: system.type ?? "",
    attribute: system.attribute ?? "data",
    field: system.field ?? "none",
    family:
      system.family ?? "none",

    group:
      system.group ?? "",

    evolutionCategory:
      system.evolutionCategory ??
      "normal",

    specialCategories:
      foundry.utils.deepClone(
        system.specialCategories ?? []
      ),

    primarySpecialCategory:
      system.primarySpecialCategory ??
      "",

    isSpecialForm:
      Boolean(system.isSpecialForm),

    specialForm:
      foundry.utils.deepClone(
        system.specialForm ?? {}
      ),

    profile:
      foundry.utils.deepClone(
        system.profile ?? {}
      ),
    mainStats: getSnapshotMainStats(actor),
    miscStats: getSnapshotMiscStats(actor),
    creation: foundry.utils.deepClone(system.creation ?? {}),
    qualityLimits: foundry.utils.deepClone(system.qualityLimits ?? {}),
    wizard: {
      ...foundry.utils.deepClone(system.wizard ?? {}),
      portraitManuallySelected,
      portraitSource: portraitManuallySelected ? "manual" : "automatic"
    },
    items: buildSnapshotItemsFromActor(actor),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, actor);
}

function getSnapshotMainStats(actor) {
  const mainStats = actor?.system?.mainStats ?? {};
  const result = {};

  for (const key of ["accuracy", "damage", "dodge", "armor", "health"]) {
    result[key] = {
      label: mainStats[key]?.label ?? `DDA.MainStat.${key}`,
      base: Number(mainStats[key]?.base ?? 0),
      bonus: Number(mainStats[key]?.bonus ?? 0),
      total: Number(mainStats[key]?.total ?? mainStats[key]?.value ?? 0)
    };
  }

  return result;
}

function getSnapshotMiscStats(actor) {
  const movement = actor?.system?.miscStats?.movement ?? {};

  return {
    movement: {
      label: movement.label ?? "DDA.Resource.Movement",
      base: Number(movement.base ?? movement.value ?? 0),
      bonus: Number(movement.bonus ?? 0),
      value: Number(movement.value ?? movement.total ?? movement.base ?? 0),
      total: Number(movement.total ?? movement.value ?? movement.base ?? 0)
    }
  };
}

function getSnapshotItemFingerprint(itemData = {}) {
  const type = String(itemData.type ?? "").trim();
  const system = itemData.system ?? {};
  const flags = itemData.flags?.[DDA_SYSTEM_ID] ?? itemData.flags?.dda ?? {};
  const sourceItemUuid = String(flags.sourceItemUuid ?? system.sourceItemUuid ?? "").trim();
  const sourceId = String(system.sourceId ?? system.id ?? "").trim();
  const originalName = String(system.originalName ?? "").trim().toLowerCase();
  const name = String(itemData.name ?? "").trim().toLowerCase();

  if (sourceItemUuid) return `${type}:uuid:${sourceItemUuid}`;
  if (sourceId) return `${type}:source:${sourceId}`;
  if (originalName) return `${type}:original:${originalName}`;
  return `${type}:name:${name}`;
}

function dedupeSnapshotItems(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item || !["attack", "quality"].includes(item.type)) continue;

    const fingerprint = getSnapshotItemFingerprint(item);
    if (seen.has(fingerprint)) continue;

    seen.add(fingerprint);
    result.push(item);
  }

  return result;
}

function buildSnapshotItemsFromActor(actor) {
  if (!actor?.items) return [];

  return dedupeSnapshotItems(
    actor.items
      .filter((item) => ["attack", "quality"].includes(item.type))
      .map((item) => {
        const data = item.toObject();
        const existingFlags = foundry.utils.deepClone(data.flags?.[DDA_SYSTEM_ID] ?? data.flags?.dda ?? {});

        delete data._id;

        data.flags ??= {};
        data.flags[DDA_SYSTEM_ID] ??= {};

        data.flags[DDA_SYSTEM_ID].formGranted = true;
        data.flags[DDA_SYSTEM_ID].sourceFormUuid =
          actor.system?.evolution?.currentFormUuid ||
          actor.system?.evolution?.sourceFormUuid ||
          actor.uuid ||
          "";
        data.flags[DDA_SYSTEM_ID].sourceFormName =
          actor.system?.evolution?.currentFormName ||
          actor.system?.evolution?.sourceFormName ||
          actor.name ||
          "";
        data.flags[DDA_SYSTEM_ID].sourceStage = actor.system?.stage ?? "";
        data.flags[DDA_SYSTEM_ID].sourceItemUuid = existingFlags.sourceItemUuid || item.uuid || "";

        return data;
      })
  );
}

async function applyPartnerFormSnapshot({ partnerActor, snapshot, formTemplateActor = null, tamerActor = null, previousFormActor = null, transitionType = "formChange", continuedHybridState = null }) {
  if (!partnerActor || !snapshot) return null;

  const normalized = normalizeFormSnapshot(snapshot, formTemplateActor ?? partnerActor);
  const partnerSystem = partnerActor.system ?? {};
  const previousFormUuid = String(
    partnerSystem.evolution?.currentFormUuid ||
    partnerSystem.evolution?.sourceFormUuid ||
    previousFormActor?.uuid ||
    partnerActor.uuid ||
    ""
  ).trim();

  const previousFormName = String(
    partnerSystem.evolution?.currentFormName ||
    partnerSystem.evolution?.sourceFormName ||
    previousFormActor?.name ||
    partnerActor.name ||
    ""
  ).trim();

  const preservedEvolutionGraph = freezePersistentEvolutionGraphDisplayData({
    graph: foundry.utils.deepClone(partnerSystem.evolutionGraph ?? {}),
    partnerActor,
    previousFormActor,
    formTemplateActor,
    previousFormUuid
  });

  const previousTemplateUuid = previousFormUuid;
  const previousTemplateName = previousFormName;

  await removeFormGrantedItems(partnerActor);

  const formGrantedItems = buildFormGrantedItemsFromSnapshot(normalized);
  if (formGrantedItems.length) await partnerActor.createEmbeddedDocuments("Item", formGrantedItems);

  const mainStats = normalized.mainStats ?? {};
  const movement = normalized.miscStats?.movement ?? {};

  const isIndependentNpc =
    partnerActor.type === "npc";

  const nextSpeciesName = String(
    normalized.species ||
    formTemplateActor?.system?.species ||
    normalized.sourceFormName ||
    formTemplateActor?.name ||
    normalized.name ||
    partnerActor.name ||
    "Digimon"
  ).trim() || "Digimon";

  const persistentNickname = isIndependentNpc
    ? ""
    : getPersistentPartnerNickname(partnerActor);

  const nextActorName = persistentNickname || nextSpeciesName;

  const nextSourceId = String(
    normalized.sourceId ||
    formTemplateActor?.system?.sourceId ||
    normalized.names?.canonical ||
    nextSpeciesName
  ).trim();

  const nextDatabaseId = String(
    normalized.databaseId ||
    formTemplateActor?.system?.databaseId ||
    (
      nextSourceId
        ? `${normalized.stage}:${nextSourceId}`
        : ""
    )
  ).trim();

  const nextNames = foundry.utils.deepClone(
    normalized.names ?? {}
  );

  nextNames.canonical = String(
    nextNames.canonical ||
    nextSourceId ||
    nextSpeciesName
  ).trim();

  nextNames.original = String(
    nextNames.original ||
    normalized.originalName ||
    nextSpeciesName
  ).trim();

  nextNames.dub = String(
    nextNames.dub ||
    normalized.dubName ||
    nextSpeciesName
  ).trim();

  nextNames.aliases = Array.from(
    new Set([
      ...(Array.isArray(nextNames.aliases)
        ? nextNames.aliases
        : []),

      nextNames.canonical,
      nextNames.original,
      nextNames.dub,
      nextSpeciesName
    ]
      .map((value) => {
        return String(value ?? "").trim();
      })
      .filter(Boolean))
  );

  const portraitImg = String(normalized.portraitImg || normalized.img || "icons/svg/mystery-man.svg");
  const tokenImg = String(normalized.tokenImg || normalized.img || portraitImg || "icons/svg/mystery-man.svg");
  const actorImg = String(normalized.img || partnerActor.img || "icons/svg/mystery-man.svg");
  const portraitWasManuallySelected = Boolean(
    normalized.wizard?.portraitManuallySelected ||
    normalized.wizard?.portraitSource === "manual"
  );

const shouldUsePortraitFlag = Boolean(
  portraitImg &&
  portraitImg !== "icons/svg/mystery-man.svg" &&
  portraitImg !== actorImg
);

  const updates = {
    name: nextActorName,
    "prototypeToken.name": nextActorName,
    "system.nickname": persistentNickname,

    /*
     * Também corrige Allies antigos que já
     * tenham sido criados como persistentPartner.
     */
    ...(isIndependentNpc
      ? {
          "system.customName": "",
          "system.isPersistentPartner": false
        }
      : {
          "system.customName": persistentNickname
        }),

    img: isVideoPath(actorImg)
      ? (
          partnerActor.img ||
          "icons/svg/mystery-man.svg"
        )
      : actorImg,
    ...(shouldUsePortraitFlag
      ? { [`flags.${DDA_SYSTEM_ID}.digivicePortrait`]: portraitImg }
      : { [`flags.${DDA_SYSTEM_ID}.-=digivicePortrait`]: null }),
    ...(portraitWasManuallySelected
      ? { [`flags.${DDA_SYSTEM_ID}.digivicePortraitManual`]: true }
      : { [`flags.${DDA_SYSTEM_ID}.-=digivicePortraitManual`]: null }),
    "prototypeToken.texture.src": tokenImg,
    ...(Number(normalized.tokenGridSize ?? 0) > 0
      ? {
          "prototypeToken.width": Number(normalized.tokenGridSize),
          "prototypeToken.height": Number(normalized.tokenGridSize),
          [`flags.${DDA_SYSTEM_ID}.tokenGridSizeOverride`]: Number(normalized.tokenGridSize)
        }
      : {}),
    "system.evolution.portraitImg": portraitImg,
    "system.evolution.tokenImg": tokenImg,

    "system.sourceId":
      nextSourceId,

    "system.databaseId":
      nextDatabaseId,

    "system.names":
      nextNames,

    "system.species":
      nextSpeciesName,

    "system.stage":
      normalized.stage,
    "system.stageValue": Number(normalized.stageValue ?? 2),
    "system.size": normalized.size,
    "system.type": normalized.type,
    "system.attribute": normalized.attribute,
    "system.field": normalized.field,
    "system.family":
      normalized.family,

    "system.group":
      normalized.group,

    "system.evolutionCategory":
      normalized.evolutionCategory ||
      "normal",

    "system.specialCategories":
      foundry.utils.deepClone(
        normalized.specialCategories ??
        []
      ),

    "system.primarySpecialCategory":
      normalized.primarySpecialCategory ||
      "",

    "system.isSpecialForm":
      Boolean(
        normalized.isSpecialForm
      ),

    "system.specialForm":
      foundry.utils.deepClone(
        normalized.specialForm ?? {}
      ),

    "system.profile.appearance":
      normalized.profile?.appearance ??
      partnerSystem.profile?.appearance ??
      "",
    "system.profile.personality": normalized.profile?.personality ?? partnerSystem.profile?.personality ?? "",
    "system.profile.tactics": normalized.profile?.tactics ?? partnerSystem.profile?.tactics ?? "",
    "system.mainStats.accuracy.base": Number(mainStats.accuracy?.base ?? 0),
    "system.mainStats.damage.base": Number(mainStats.damage?.base ?? 0),
    "system.mainStats.dodge.base": Number(mainStats.dodge?.base ?? 0),
    "system.mainStats.armor.base": Number(mainStats.armor?.base ?? 0),
    "system.mainStats.health.base": Number(mainStats.health?.base ?? 0),
    "system.mainStats.accuracy.bonus": Number(mainStats.accuracy?.bonus ?? 0),
    "system.mainStats.damage.bonus": Number(mainStats.damage?.bonus ?? 0),
    "system.mainStats.dodge.bonus": Number(mainStats.dodge?.bonus ?? 0),
    "system.mainStats.armor.bonus": Number(mainStats.armor?.bonus ?? 0),
    "system.mainStats.health.bonus": Number(mainStats.health?.bonus ?? 0),
    "system.miscStats.movement.base": Number(movement.base ?? 0),
    "system.miscStats.movement.bonus": Number(movement.bonus ?? 0),
    "system.creation": foundry.utils.deepClone(normalized.creation ?? partnerSystem.creation ?? {}),
    "system.qualityLimits": foundry.utils.deepClone(normalized.qualityLimits ?? partnerSystem.qualityLimits ?? {}),
    "system.tamer.name": tamerActor?.name ?? partnerSystem.tamer?.name ?? "",
    "system.tamer.uuid": tamerActor?.uuid ?? partnerSystem.tamer?.uuid ?? "",
    "system.evolution.currentFormUuid": normalized.sourceFormUuid,
    "system.evolution.currentFormName":
      nextSpeciesName,

    "system.evolution.currentStage":
      normalized.stage,

    "system.evolution.sourceFormUuid":
      normalized.sourceFormUuid,

    "system.evolution.sourceFormName":
      nextSpeciesName,
    "system.evolution.previousFormUuid": previousTemplateUuid,
    "system.evolution.previousFormName": previousTemplateName,
    "system.evolution.lastTransitionType": transitionType,
    "system.evolution.lastEvolvedAt": new Date().toISOString(),
    "system.evolutionGraph": preservedEvolutionGraph
  };

  if (continuedHybridState) {
    updates["system.combat.actions.value"] = 3;
    updates["system.combat.actions.max"] = 3;
    updates["system.specialForm.kind"] = "hybrid";
    updates["system.specialForm.method"] = "biomerge";
    updates["system.specialForm.equivalentStage"] = normalized.stage ?? continuedHybridState.equivalentStage ?? "ultimate";
    updates["system.specialForm.sourceTamerUuid"] = tamerActor?.uuid ?? "";
    updates["system.specialForm.sourceDigimonUuid"] = continuedHybridState.sourceDigimonUuid || partnerActor.uuid;
    updates["system.specialEvolutions.hybrid.active"] = true;
    updates["system.specialEvolutions.hybrid.state"] = continuedHybridState;
  }

  await partnerActor.update(updates);
  return partnerActor;
}

function freezePersistentEvolutionGraphDisplayData({
  graph = {},
  partnerActor = null,
  previousFormActor = null,
  formTemplateActor = null,
  previousFormUuid = ""
} = {}) {
  const nextGraph = foundry.utils.deepClone(graph ?? {});
  nextGraph.nodes = Array.isArray(nextGraph.nodes)
    ? nextGraph.nodes
    : [];
  nextGraph.edges = Array.isArray(nextGraph.edges)
    ? nextGraph.edges
    : [];

  const upsertNodeDisplayData = (
    actor,
    fallbackUuid = ""
  ) => {
    if (!actor && !fallbackUuid) return;

    /*
     * A forma persistida precisa vencer o UUID do Actor parceiro.
     * O parceiro físico é sempre o mesmo Actor; cada forma tem seu
     * próprio UUID de template/snapshot no grafo.
     */
    const actorUuid = String(
      fallbackUuid || actor?.uuid || ""
    ).trim();

    if (!actorUuid) return;

    const portraitImg = String(
      actor?.system?.evolution?.portraitImg ||
      actor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait ||
      actor?.img ||
      "icons/svg/mystery-man.svg"
    );

    const tokenImg = String(
      actor?.prototypeToken?.texture?.src ||
      actor?.system?.evolution?.tokenImg ||
      actor?.img ||
      portraitImg ||
      "icons/svg/mystery-man.svg"
    );

    const nodeData = {
      actorUuid,
      name: String(actor?.name ?? ""),
      displayName: String(
        actor?.system?.species ||
        actor?.name ||
        ""
      ),
      species: String(
        actor?.system?.species ||
        actor?.name ||
        ""
      ),
      stage: String(
        actor?.system?.stage ||
        "child"
      ),
      img: String(
        actor?.img ||
        "icons/svg/mystery-man.svg"
      ),
      portraitImg,
      tokenImg
    };

    let node = nextGraph.nodes.find((entry) => {
      const nodeUuid = String(
        entry?.actorUuid ??
        entry?.uuid ??
        entry?.sourceFormUuid ??
        ""
      ).trim();

      return nodeUuid === actorUuid;
    });

    if (!node) {
      node = {
        id: generateEvolutionNodeId(actorUuid),
        unlocked: true,
        hidden: false
      };

      nextGraph.nodes.push(node);
    }

    Object.assign(node, {
      ...nodeData,
      id: node.id || generateEvolutionNodeId(actorUuid),
      unlocked: node.unlocked ?? true,
      hidden: node.hidden ?? false
    });
  };

  upsertNodeDisplayData(
    previousFormActor ?? partnerActor,
    previousFormUuid ||
      previousFormActor?.uuid ||
      partnerActor?.uuid ||
      ""
  );

  upsertNodeDisplayData(
    formTemplateActor,
    formTemplateActor?.uuid || ""
  );

  return nextGraph;
}

function buildFormGrantedItemsFromSnapshot(snapshot) {
  if (!Array.isArray(snapshot?.items)) return [];

  return dedupeSnapshotItems(snapshot.items)
    .map((item) => {
      const data = foundry.utils.deepClone(item);
      const existingFlags = foundry.utils.deepClone(data.flags?.[DDA_SYSTEM_ID] ?? data.flags?.dda ?? {});

      delete data._id;

      data.flags ??= {};
      data.flags[DDA_SYSTEM_ID] ??= {};

      data.flags[DDA_SYSTEM_ID].formGranted = true;
      data.flags[DDA_SYSTEM_ID].sourceFormUuid = snapshot.sourceFormUuid ?? "";
      data.flags[DDA_SYSTEM_ID].sourceFormName = snapshot.sourceFormName || snapshot.name || "";
      data.flags[DDA_SYSTEM_ID].sourceStage = snapshot.stage ?? "";
      data.flags[DDA_SYSTEM_ID].sourceItemUuid =
        existingFlags.sourceItemUuid ||
        data.flags[DDA_SYSTEM_ID].sourceItemUuid ||
        "";

      return data;
    });
}

function getFormSnapshotKey(value = "") {
  return (String(value || "form").trim() || "form").replace(/[^a-zA-Z0-9_-]+/g, "_");
}

async function removeFormGrantedItems(actor) {
  if (!actor?.items) return;

  // O snapshot da forma atual já foi salvo antes desta limpeza.
  // Ataques e Qualidades pertencem à build da forma ativa; remover todos do ator
  // persistente impede que itens manuais de uma forma vazem e dupliquem em outra.
  const ids = actor.items
    .filter((item) => {
      return ["attack", "quality"].includes(item.type) ||
        Boolean(item.flags?.[DDA_SYSTEM_ID]?.formGranted || item.flags?.dda?.formGranted);
    })
    .map((item) => item.id);

  if (!ids.length) return;

  await actor.deleteEmbeddedDocuments("Item", ids);
}

function buildFormGrantedItems(formTemplateActor) {
  if (!formTemplateActor?.items) return [];

  return dedupeSnapshotItems(
    formTemplateActor.items
      .filter((item) => ["attack", "quality"].includes(item.type))
      .map((item) => {
        const data = item.toObject();
        const existingFlags = foundry.utils.deepClone(data.flags?.[DDA_SYSTEM_ID] ?? data.flags?.dda ?? {});

        delete data._id;

        data.flags ??= {};
        data.flags[DDA_SYSTEM_ID] ??= {};

        data.flags[DDA_SYSTEM_ID].formGranted = true;
        data.flags[DDA_SYSTEM_ID].sourceFormUuid = formTemplateActor.uuid;
        data.flags[DDA_SYSTEM_ID].sourceFormName = formTemplateActor.name;
        data.flags[DDA_SYSTEM_ID].sourceStage = formTemplateActor.system?.stage ?? "";
        data.flags[DDA_SYSTEM_ID].sourceItemUuid = existingFlags.sourceItemUuid || item.uuid || "";

        return data;
      })
  );
}

async function applyPersistentSlideEvolutionWoundAdjustment({
  partnerActor,
  previousFormActor,
  formTemplateActor,
  previousPersistentWounds
}) {
  if (!partnerActor) return;

  const previousValue = Number(previousPersistentWounds?.value ?? previousPersistentWounds?.max ?? 0);
  const previousTempValue = Number(previousPersistentWounds?.temp?.value ?? 0);
  const previousMax = Number(previousFormActor?.system?.miscStats?.wounds?.max ?? previousPersistentWounds?.max ?? previousValue ?? 0);
  const newMax = Number(partnerActor.system.miscStats?.wounds?.max ?? formTemplateActor?.system?.miscStats?.wounds?.max ?? previousMax);
  const maxDifference = newMax - previousMax;
  const nextValue = Math.clamp(previousValue + maxDifference, 0, Math.max(0, newMax));

  await partnerActor.update({
    "system.miscStats.wounds.value": nextValue,
    "system.miscStats.wounds.temp.value": Math.max(0, previousTempValue)
  });
}

export async function executeJogressEvolution(tamerActor) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.JogressOnlyForTamers"));
    return null;
  }

  if (!Boolean(getDDASettingSafe("enableJogressEvolution", false))) {
    ui.notifications.warn(localize("DDA.Warning.JogressDisabled"));
    return null;
  }

  if (isTamerInActiveJogress(tamerActor)) {
    ui.notifications.warn(localize("DDA.Warning.JogressAlreadyActive"));
    return null;
  }

  const {
    partnerActor,
    currentFormActor,
    currentForm
  } = await getPartnerAndCurrentFormForSpecialAction(tamerActor);

  if (!partnerActor || !currentFormActor || !currentForm) return null;

  await syncPartnerOwnershipFromTamer(tamerActor, partnerActor);

  if (hasConflictingJogressSpecialEvolution(tamerActor, partnerActor)) {
    ui.notifications.warn(localize("DDA.Warning.JogressConflictingSpecialEvolution"));
    return null;
  }

  const options = await collectAvailableJogressOptions(tamerActor, currentForm);

  if (!options.length) {
    ui.notifications.warn(localize("DDA.Warning.NoJogressRecipesAvailable"));
    return null;
  }

  const selectedOption = await chooseJogressOption(options, tamerActor, currentForm);
  if (!selectedOption) return null;

  const resultActor = selectedOption.resultActor;

  if (!resultActor || resultActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.JogressResultNotFound"));
    return null;
  }

  const participants = selectedOption.participants.filter((participant) => {
    return Boolean(
      participant?.tamer &&
      participant?.partnerActor &&
      participant?.form?.templateActor
    );
  });

  const primary = participants.find((participant) => {
    return participant.tamer?.uuid === tamerActor.uuid;
  }) ?? participants[0];

  const secondary = participants.find((participant) => {
    return participant.tamer?.uuid !== primary?.tamer?.uuid;
  });

  if (!primary?.tamer || !primary?.partnerActor || participants.length !== 2 || !secondary?.tamer || !secondary?.partnerActor) {
    ui.notifications.warn(localize("DDA.Warning.JogressNeedsTwoTamers"));
    return null;
  }

  if (!participantsHaveSameStage(participants)) {
    ui.notifications.warn(localize("DDA.Warning.JogressRequiresSameStage"));
    return null;
  }

  const componentStage = String(participants[0]?.form?.stageKey ?? "").trim();
  const resultStage = String(resultActor.system?.stage ?? selectedOption.recipe?.result?.stage ?? "").trim();
  const resultReference = getJogressResultReference(resultActor, selectedOption.recipe);

  if (!isImmediatelyHigherStage(componentStage, resultStage)) {
    ui.notifications.warn(formatI18n("DDA.Warning.JogressResultMustBeNextStage", {
      componentStage: escapeHtml(getStageLabel(componentStage)),
      resultStage: escapeHtml(getStageLabel(resultStage))
    }));
    return null;
  }

  if (!canCurrentUserManageJogressParticipants(participants)) {
    ui.notifications.warn(localize("DDA.Warning.JogressRequiresGMAuthority"));
    return null;
  }

  let resultForm = await resolvePartnerFormDescriptor(
    partnerActor,
    resultReference,
    {
      form: {
        uuid: resultReference,
        actorUuid: resultReference,
        name: resultActor.name,
        species: resultActor.system?.species ?? resultActor.name,
        stage: resultStage,
        img: resultActor.img
      },
      fallbackActor: resultActor
    }
  );

  if (!resultForm?.templateActor) {
    ui.notifications.warn(localize("DDA.Warning.JogressResultNotFound"));
    return null;
  }

  const historyKey = getJogressHistoryKey(selectedOption.recipe, participants, resultActor);
  const bonusProfile = getJogressComponentBonusProfile(participants);
  const preparedJogressSnapshot = findPreparedJogressSnapshot(
    participants,
    selectedOption.recipe,
    resultActor
  );

  if (preparedJogressSnapshot) {
    const refreshedPreparedSnapshot = refreshPreparedJogressSnapshotBonusProfile(
      preparedJogressSnapshot,
      bonusProfile
    );
    const preparedForm = await resolvePartnerFormDescriptor(
      partnerActor,
      refreshedPreparedSnapshot.sourceFormUuid,
      {
        form: { persistentSnapshot: refreshedPreparedSnapshot },
        fallbackActor: resultActor
      }
    );

    if (preparedForm?.templateActor) resultForm = preparedForm;
  }
  const mastered = participants.every((participant) => {
    return hasMasteredJogressRecipe(participant.tamer, historyKey);
  });

  const ruleData = buildJogressRuleData({
    recipe: selectedOption.recipe,
    resultActor,
    mastered
  });

  const rawReversionPlan = await prepareJogressReversionPlan(participants, {
    mastered
  });

  if (!rawReversionPlan) return null;

  const reversionPlan = orderJogressReversionPlan(
    rawReversionPlan,
    primary,
    secondary
  );

  if (!mastered && reversionPlan.hasMissing) {
    for (const plan of reversionPlan.plans.filter((entry) => entry?.missing)) {
      ui.notifications.warn(formatI18n("DDA.Warning.JogressMissingRevertStage", {
        digimon: escapeHtml(plan?.participant?.form?.name ?? plan?.participant?.partnerActor?.name ?? localize("DDA.Jogress.UnknownDigimon")),
        stage: escapeHtml(getStageLabel(plan?.revertStage ?? ""))
      }));
    }
    return null;
  }

  const combatSnapshot = captureJogressCombatSnapshot(participants, game?.combat);
  if (game?.combat?.started && !combatSnapshot.valid) {
    ui.notifications.warn(localize("DDA.Warning.JogressCombatantsRequired"));
    return null;
  }

  const interruptContext = getJogressInterruptContext(participants, game?.combat);
  if (!interruptContext.allowed) {
    ui.notifications.warn(localize("DDA.Warning.JogressOnlyOneInterrupt"));
    return null;
  }

  const confirmed = await confirmJogressStart({
    option: selectedOption,
    resultActor,
    ruleData,
    reversionPlan,
    interruptContext
  });

  if (!confirmed) return null;

  const paymentData = await validateJogressRuleCosts({ participants, ruleData });
  if (!paymentData) return null;

  try {
    await payJogressRuleCosts(paymentData);
  } catch (error) {
    console.error("DDA | Jogress cost payment failed and was rolled back.", error);
    ui.notifications.error(localize("DDA.Warning.JogressActivationFailed"));
    return null;
  }

  let checkResults = [];

  if (!mastered) {
    try {
      checkResults = await rollJogressChecks(participants, {
        tn: ruleData.checkTn,
        formula: ruleData.checkFormula
      });
    } catch (error) {
      console.error("DDA | Jogress check could not be completed; costs will be restored.", error);
      await refundJogressRuleCosts(paymentData);
      ui.notifications.error(localize("DDA.Warning.JogressActivationFailed"));
      return null;
    }

    const allPassed = checkResults.every((entry) => entry.success);

    try {
      await createJogressCheckChatCard({
        speakerActor: tamerActor,
        option: selectedOption,
        resultActor,
        checkResults,
        allPassed
      });
    } catch (error) {
      // Chat presentation must never invalidate an otherwise resolved Jogress
      // check or strand already-paid Actions.
      console.error("DDA | Could not create the Jogress check chat card.", error);
    }

    if (!allPassed) {
      ui.notifications.warn(localize("DDA.Warning.JogressCheckFailed"));
      return null;
    }
  }

  const primaryPartner = primary.partnerActor;
  const secondaryPartner = secondary.partnerActor;
  const startedAt = new Date().toISOString();
  const tokenHideMarker = `${historyKey}::${startedAt}`;
  const secondaryTokenStates = captureJogressComponentTokenStates(
    secondaryPartner,
    game?.combat
  );
  const sharedInitiative = Number(combatSnapshot.sharedInitiative ?? getLowestJogressInitiative(participants));
  const pendingInitiativeRound = combatSnapshot.combatId
    ? Math.max(1, Number(combatSnapshot.round ?? 0) + 1)
    : 0;

  const jogressState = {
    active: true,
    recipeId: selectedOption.recipe.id,
    historyKey,
    resultUuid: resultReference,
    resultName: resultForm.name || resultActor.name,
    resultStage,
    runtimePartnerUuid: primaryPartner.uuid,
    primaryTamerUuid: primary.tamer.uuid,
    primaryTamerName: primary.tamer.name,
    primaryDigimonUuid: primaryPartner.uuid,
    primaryDigimonName: primary.form.name,
    primaryFormUuid: primary.form.reference,
    primaryFormName: primary.form.name,
    secondaryTamerUuid: secondary.tamer.uuid,
    secondaryTamerName: secondary.tamer.name,
    secondaryDigimonUuid: secondaryPartner.uuid,
    secondaryDigimonName: secondary.form.name,
    secondaryFormUuid: secondary.form.reference,
    secondaryFormName: secondary.form.name,
    primaryRevertUuid: reversionPlan.primary?.form?.reference ?? "",
    primaryRevertName: reversionPlan.primary?.form?.name ?? "",
    primaryRevertStage: reversionPlan.primary?.revertStage ?? "",
    secondaryRevertUuid: reversionPlan.secondary?.form?.reference ?? "",
    secondaryRevertName: reversionPlan.secondary?.form?.name ?? "",
    secondaryRevertStage: reversionPlan.secondary?.revertStage ?? "",
    preparedBuildUsed: Boolean(preparedJogressSnapshot),
    preparedBuildReference: preparedJogressSnapshot?.sourceFormUuid ?? "",
    interruptTamerUuid: interruptContext.interruptTamerUuid ?? "",
    interruptTamerName: interruptContext.interruptTamerName ?? "",
    actingTamerUuid: interruptContext.actingTamerUuid ?? "",
    masteredBeforeUse: mastered,
    firstSuccessfulUse: !mastered,
    sharedInitiative,
    componentBonusDp: bonusProfile.total,
    primaryDigimonBonusDp: bonusProfile.components[primary.tamer.uuid]?.total ?? 0,
    secondaryDigimonBonusDp: bonusProfile.components[secondary.tamer.uuid]?.total ?? 0,
    combinedSharedStatBonus: bonusProfile.sharedStatBonus,
    combinedSharedQualityDp: bonusProfile.qualityAllocated,
    combatId: combatSnapshot.combatId,
    pendingInitiativeRound,
    initiativeApplied: false,
    initiativeUnitId: buildJogressUnitId(historyKey),
    combatSnapshot,
    primaryAdvancementState: captureJogressAdvancementState(primaryPartner),
    primaryOwnership: foundry.utils.deepClone(primaryPartner.ownership ?? {}),
    secondaryActionsValue: Number(secondaryPartner.system?.combat?.actions?.value ?? 0),
    secondaryActionsMax: Number(secondaryPartner.system?.combat?.actions?.max ?? 2),
    secondaryTokenStates,
    tokenHideMarker,
    startedAt
  };

  try {
    await applyPersistentPartnerSpecialForm({
      tamerActor: primary.tamer,
      partnerActor: primaryPartner,
      form: resultForm,
      previousFormActor: primaryPartner,
      transitionType: "jogress",
      healOnEvolution: true
    });

    if (preparedJogressSnapshot) {
      await applyJogressPreparedBudgetState(
        primaryPartner,
        preparedJogressSnapshot,
        bonusProfile
      );
    } else {
      await applyJogressRuntimeBonusProfile(primaryPartner, resultActor, bonusProfile);
    }

    await applyJogressResultOwnership(primaryPartner, participants);

    await primaryPartner.update({
      "system.tamer.name": `${primary.tamer.name} / ${secondary.tamer.name}`,
      "system.tamer.uuid": primary.tamer.uuid,
      "system.combat.actions.value": 2,
      "system.combat.actions.max": 2,
      "system.specialForm.kind": "jogress",
      "system.specialForm.method": "jogress",
      "system.specialForm.equivalentStage": resultStage,
      "system.specialEvolutions.jogress.active": true,
      "system.specialEvolutions.jogress.state": jogressState,
      "system.specialEvolutions.jogress.componentBonusDp": bonusProfile.total
    });

    await hideJogressComponentTokens(
      jogressState.secondaryTokenStates,
      jogressState.tokenHideMarker
    );

    await secondaryPartner.update({
      "system.combat.actions.value": 0,
      "system.specialEvolutions.jogress.active": true,
      "system.specialEvolutions.jogress.state": jogressState
    });

    await primary.tamer.update({
      "system.partner.currentFormUuid": primaryPartner.uuid,
      "system.partner.currentFormName": resultForm.name || resultActor.name,
      "system.specialEvolutions.jogress.state": jogressState
    });

    await secondary.tamer.update({
      "system.partner.currentFormUuid": primaryPartner.uuid,
      "system.partner.currentFormName": resultForm.name || resultActor.name,
      "system.specialEvolutions.jogress.state": jogressState
    });

    await markJogressRecipeMastered(participants, historyKey, {
      recipeId: selectedOption.recipe.id,
      resultUuid: resultReference,
      resultName: resultActor.name
    });
  } catch (error) {
    console.error("DDA | Jogress activation failed and will be rolled back.", error);
    await rollbackJogressActivation({
      primary,
      secondary,
      jogressState,
      paymentData
    });
    ui.notifications.error(localize("DDA.Warning.JogressActivationFailed"));
    return null;
  }

  const componentList = participants.map((participant) => {
    return `<li><strong>${escapeHtml(participant.form?.name ?? localize("DDA.Jogress.UnknownDigimon"))}</strong> — ${escapeHtml(participant.tamer?.name ?? localize("DDA.Jogress.UnknownTamer"))}</li>`;
  }).join("");

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-digivolution-card dda-jogress-card">
        <h2>${localize("DDA.Jogress.Title")}</h2>
        <div class="dda-digivolution-hero">
          <div class="dda-digivolution-form previous">
            <span class="dda-digivolution-label">${localize("DDA.Jogress.Components")}</span>
            <strong>${escapeHtml(selectedOption.recipe.label || selectedOption.recipe.id)}</strong>
            <small>${mastered ? localize("DDA.Jogress.MasteredUse") : localize("DDA.Jogress.FirstSuccessfulUse")}</small>
          </div>
          <div class="dda-digivolution-arrow">→</div>
          <div class="dda-digivolution-form next">
            <span class="dda-digivolution-label">${localize("DDA.Evolution.NewForm")}</span>
            <strong>${escapeHtml(resultForm.name || resultActor.name)}</strong>
            <small>${escapeHtml(getStageLabel(resultStage))}</small>
          </div>
        </div>
        <ul class="dda-effect-list dda-digivolution-list">
          ${componentList}
          <li>${localize("DDA.Jogress.Check")}: <strong>${mastered ? localize("DDA.Jogress.ReliableRepeat") : localize("DDA.Jogress.Passed")}</strong>.</li>
          <li>${localize("DDA.Jogress.SharedInitiative")}: <strong>${sharedInitiative}</strong> ${combatSnapshot.combatId ? `(${localize("DDA.Jogress.NextRound")})` : ""}.</li>
          <li>${localize("DDA.Jogress.ResultActions")}: <strong>2</strong>.</li>
          <li>${localize("DDA.Jogress.ComponentBonusDp")}: <strong>${bonusProfile.total}</strong>.</li>
          <li>${localize("DDA.Evolution.TotalCost")}: <strong>${paymentData.totalPeCost}</strong> ${localize("DDA.Resource.EvolutionPoints.Short")}.</li>
        </ul>
      </div>
    `
  });

  primaryPartner.sheet?.render(true);
  primary.tamer.sheet?.render(false);
  secondary.tamer.sheet?.render(false);

  return primaryPartner;
}

export async function endJogressEvolution(tamerActor, options = {}) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.JogressOnlyForTamers"));
    return null;
  }

  const state = tamerActor.system.specialEvolutions?.jogress?.state ?? {};

  if (!state.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveJogress"));
    return null;
  }

  const primaryTamer = await resolveActor(state.primaryTamerUuid);
  const secondaryTamer = await resolveActor(state.secondaryTamerUuid);
  const primaryPartner = await resolveActor(state.primaryDigimonUuid || state.runtimePartnerUuid);
  const secondaryPartner = await resolveActor(state.secondaryDigimonUuid);
  const resultActor = await resolveActor(state.resultUuid);

  if (!primaryTamer || !secondaryTamer || !primaryPartner || !secondaryPartner) {
    ui.notifications.error(localize("DDA.Warning.JogressStateIncomplete"));
    return null;
  }

  if (!game.user?.isGM && !canCurrentUserManageJogressParticipants([
    { tamer: primaryTamer, partnerActor: primaryPartner },
    { tamer: secondaryTamer, partnerActor: secondaryPartner }
  ])) {
    ui.notifications.warn(localize("DDA.Warning.JogressRequiresGMAuthority"));
    return null;
  }

  const primaryReversion = await resolveJogressReversionForm({
    partnerActor: primaryPartner,
    preferredReference: state.primaryRevertUuid,
    desiredStage: state.primaryRevertStage,
    fallbackReference: state.primaryFormUuid
  });

  const secondaryReversion = await resolveJogressReversionForm({
    partnerActor: secondaryPartner,
    preferredReference: state.secondaryRevertUuid,
    desiredStage: state.secondaryRevertStage,
    fallbackReference: state.secondaryFormUuid
  });

  const primaryRevertForm = primaryReversion.form;
  const secondaryRevertForm = secondaryReversion.form;

  if (!primaryRevertForm?.templateActor || !secondaryRevertForm?.templateActor) {
    ui.notifications.error(localize("DDA.Warning.JogressRevertFormMissing"));
    return null;
  }

  if (primaryReversion.usedFallback || secondaryReversion.usedFallback) {
    ui.notifications.warn(localize("DDA.Warning.JogressRevertFallbackUsed"));
  }

  const skipConfirm = Boolean(options.skipConfirm);
  const confirmed = skipConfirm || await confirmJogressEnd({
    state,
    primaryTamer,
    secondaryTamer,
    primaryRevertForm,
    secondaryRevertForm,
    resultActor
  });

  if (!confirmed) return null;

  const clearState = getEmptyJogressState();

  try {
    await applyPersistentPartnerSpecialForm({
      tamerActor: primaryTamer,
      partnerActor: primaryPartner,
      form: primaryRevertForm,
      previousFormActor: primaryPartner,
      transitionType: "jogressRevert",
      healOnEvolution: false
    });

    if (state.firstSuccessfulUse) {
      await applyPersistentPartnerSpecialForm({
        tamerActor: secondaryTamer,
        partnerActor: secondaryPartner,
        form: secondaryRevertForm,
        previousFormActor: secondaryPartner,
        transitionType: "jogressRevert",
        healOnEvolution: false
      });
    }

    await restoreJogressComponentTokens(
      state.secondaryTokenStates,
      state.tokenHideMarker
    );

    await restoreJogressAdvancementState(primaryPartner, state.primaryAdvancementState);

    // Restore the Combat Tracker before discarding the Jogress state. If this
    // fails, the saved unit snapshot remains available for a safe retry.
    await restoreJogressCombatSnapshot(state);

    await primaryPartner.update({
      ownership: foundry.utils.deepClone(state.primaryOwnership ?? primaryPartner.ownership ?? {}),
      "system.specialForm.kind": "",
      "system.specialForm.method": "",
      "system.specialForm.equivalentStage": "",
      "system.specialEvolutions.jogress.active": false,
      "system.specialEvolutions.jogress.componentBonusDp": 0,
      "system.specialEvolutions.jogress.state": clearState
    });

    await secondaryPartner.update({
      "system.combat.actions.value": Math.max(0, Number(state.secondaryActionsValue ?? secondaryPartner.system?.combat?.actions?.value ?? 0)),
      "system.combat.actions.max": Math.max(0, Number(state.secondaryActionsMax ?? secondaryPartner.system?.combat?.actions?.max ?? 2)),
      "system.specialEvolutions.jogress.active": false,
      "system.specialEvolutions.jogress.state": clearState
    });

    await updateTamerPartnerFormMirror(primaryTamer, primaryPartner);
    await updateTamerPartnerFormMirror(secondaryTamer, secondaryPartner);

    await primaryTamer.update({
      "system.specialEvolutions.jogress.state": clearState
    });

    await secondaryTamer.update({
      "system.specialEvolutions.jogress.state": clearState
    });
  } catch (error) {
    console.error("DDA | Jogress separation failed.", error);
    ui.notifications.error(localize("DDA.Warning.JogressSeparationFailed"));
    return null;
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-digivolution-card dda-jogress-card">
        <h2>${localize("DDA.Jogress.EndTitle")}</h2>
        <ul class="dda-effect-list dda-digivolution-list">
          <li>${escapeHtml(state.resultName || resultActor?.name || localize("DDA.Jogress.UnknownResult"))} ${localize("DDA.Jogress.HasSeparated")}.</li>
          <li>${escapeHtml(primaryTamer.name)}: <strong>${escapeHtml(primaryRevertForm.name)}</strong>.</li>
          <li>${escapeHtml(secondaryTamer.name)}: <strong>${escapeHtml(secondaryRevertForm.name)}</strong>.</li>
        </ul>
      </div>
    `
  });

  primaryTamer.sheet?.render(false);
  secondaryTamer.sheet?.render(false);
  primaryPartner.sheet?.render(false);
  secondaryPartner.sheet?.render(false);

  return {
    primaryTamer,
    secondaryTamer,
    primaryPartner,
    secondaryPartner,
    resultActor
  };
}


export async function executeHybridEvolution(tamerActor) {
  return executeHybridLikeEvolution(tamerActor, "hybrid");
}

export async function executeBioMergeEvolution(tamerActor) {
  return executeHybridLikeEvolution(tamerActor, "biomerge");
}

async function executeHybridLikeEvolution(tamerActor, requestedMethod = "hybrid") {
  if (!DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED) {
    ui.notifications.warn(localize("DDA.Warning.HybridWorkflowUnsupported"));
    return null;
  }

  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.HybridOnlyForTamers"));
    return null;
  }

  if (isTamerInActiveJogress(tamerActor)) {
    ui.notifications.warn(localize("DDA.Warning.JogressBlocksOtherEvolution"));
    return null;
  }

  const normalizedRequestedMethod = normalizeHybridMethod(requestedMethod);
  const settingKey = normalizedRequestedMethod === "biomerge" ? "enableBioMergeEvolution" : "enableHybridEvolution";

  if (!Boolean(getDDASettingSafe(settingKey, false))) {
    ui.notifications.warn(normalizedRequestedMethod === "biomerge" ? localize("DDA.Warning.BioMergeDisabled") : localize("DDA.Warning.HybridDisabled"));
    return null;
  }

  if (isTamerInActiveHybrid(tamerActor)) {
    ui.notifications.warn(localize("DDA.Warning.HybridAlreadyActive"));
    return null;
  }

  const partnerUuid = tamerActor.system.partner?.uuid;
  const partnerActor = partnerUuid ? await resolveActor(partnerUuid) : null;
  if (partnerActor?.type === "digimon") await syncPartnerOwnershipFromTamer(tamerActor, partnerActor);
  const previousFormUuid = tamerActor.system.partner?.currentFormUuid || partnerActor?.uuid || "";
  const previousFormActor = previousFormUuid ? await resolveActor(previousFormUuid) : null;
  const currentFormActor = previousFormActor ?? partnerActor ?? null;

  const options = await collectAvailableHybridOptions(tamerActor, currentFormActor, normalizedRequestedMethod, partnerActor);

  if (!options.length) {
    ui.notifications.warn(localize("DDA.Warning.NoHybridFormsAvailable"));
    return null;
  }

  const selectedOption = await chooseHybridOption(options, tamerActor, currentFormActor);
  if (!selectedOption) return null;

  const resultActor = selectedOption.resultActor;

  if (!resultActor || resultActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.HybridResultNotFound"));
    return null;
  }

  const confirmed = await confirmHybridStart({ option: selectedOption, tamerActor, currentFormActor, resultActor });
  if (!confirmed) return null;

  const startedAt = new Date().toISOString();
  const method = normalizeHybridMethod(selectedOption.recipe.method);
  const partnerRequirement = normalizeHybridPartnerRequirement(selectedOption.recipe.partnerRequirement ?? (selectedOption.recipe.requiresPartner ? "required" : "none"));
  const partnerAvailability = normalizeHybridPartnerAvailability(selectedOption.recipe.partnerAvailability ?? (method === "biomerge" ? "merged" : "unchanged"));
  const equivalentStage = selectedOption.recipe.equivalentStage || resultActor.system?.stage || "adult";
  const hadPartner = Boolean(partnerActor);
  const partnerIsMerged = partnerAvailability === "merged";
  const resultIsPartnerCurrentForm = partnerIsMerged;

  const hybridState = {
    active: true,
    method,
    recipeId: selectedOption.recipe.id,
    resultUuid: resultActor.uuid,
    resultName: resultActor.name,
    resultStage: resultActor.system?.stage ?? equivalentStage,
    equivalentStage,
    tamerUuid: tamerActor.uuid,
    tamerName: tamerActor.name,
    sourceDigimonUuid: currentFormActor?.uuid ?? partnerActor?.uuid ?? "",
    sourceDigimonName: currentFormActor?.name ?? partnerActor?.name ?? "",
    partnerUuid: partnerActor?.uuid ?? "",
    partnerName: partnerActor?.name ?? "",
    previousFormUuid: previousFormActor?.uuid ?? partnerActor?.uuid ?? "",
    previousFormName: previousFormActor?.name ?? partnerActor?.name ?? "",
    hadPartner,
    partnerRequirement,
    partnerAvailability,
    partnerIsMerged,
    resultIsPartnerCurrentForm,
    startedAt,
    actionsMax: 3,
    directAllyPenaltyReduction: 1
  };

  const tamerUpdates = {
    "system.specialEvolutions.hybrid.state": hybridState
  };

  if (resultIsPartnerCurrentForm) {
    tamerUpdates["system.partner.currentFormUuid"] = resultActor.uuid;
    tamerUpdates["system.partner.currentFormName"] = resultActor.name;
  }

  await tamerActor.update(tamerUpdates);

  await applyHybridResultOwnership(resultActor, tamerActor);

  await resultActor.update({
    "system.tamer.name":
      tamerActor.name,

    "system.tamer.uuid":
      tamerActor.uuid,

    "system.combat.actions.value":
      3,

    "system.combat.actions.max":
      3,

    "system.specialEvolutions.hybrid.active":
      true,

    "system.specialEvolutions.hybrid.method":
      method,

    "system.specialEvolutions.hybrid.equivalentStage":
      equivalentStage,

    "system.specialEvolutions.hybrid.state":
      hybridState,

    "system.specialForm.kind":
      "hybrid",

    "system.specialForm.method":
      method,

    "system.specialForm.equivalentStage":
      equivalentStage,

    "system.specialForm.sourceTamerUuid":
      tamerActor.uuid,

    "system.specialForm.sourceDigimonUuid":
      currentFormActor?.uuid ??
      partnerActor?.uuid ??
      ""
  });

  await fullyRestoreWounds(
    resultActor,
    {
      clearTemp: true
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderHybridStartCard({ tamerActor, currentFormActor, resultActor, state: hybridState })
  });

  resultActor.sheet?.render(true);
  tamerActor.sheet?.render(false);
  partnerActor?.sheet?.render(false);

  return resultActor;
}

export async function endHybridEvolution(tamerActor) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.HybridOnlyForTamers"));
    return null;
  }

  const state = tamerActor.system.specialEvolutions?.hybrid?.state ?? {};

  if (!state.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveHybrid"));
    return null;
  }

  const resultActor = await resolveActor(state.resultUuid);
  const previousFormActor = await resolveActor(state.previousFormUuid);
  const sourceDigimon = await resolveActor(state.sourceDigimonUuid);
  if (sourceDigimon?.type === "digimon") await syncPartnerOwnershipFromTamer(tamerActor, sourceDigimon);

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: localize("DDA.Hybrid.EndTitle") },
    content: `
      <div class="dda-roll-dialog dda-hybrid-dialog">
        <p>${formatI18n("DDA.Hybrid.EndConfirm", {
          result: `<strong>${escapeHtml(state.resultName || resultActor?.name || localize("DDA.Hybrid.UnknownResult"))}</strong>`
        })}</p>
        <ul>
          <li>${localize("DDA.Actor.Tamer")}: <strong>${escapeHtml(tamerActor.name)}</strong></li>
          ${state.previousFormName ? `<li>${localize("DDA.Hybrid.PreviousForm")}: <strong>${escapeHtml(previousFormActor?.name ?? state.previousFormName)}</strong></li>` : ""}
          <li>${localize("DDA.Hybrid.PartnerAvailability.Label")}: <strong>${escapeHtml(getHybridPartnerAvailabilityLabel(state.partnerAvailability))}</strong></li>
        </ul>
      </div>
    `,
    yes: { default: false },
    no: { default: true },
    rejectClose: false,
    modal: true
  });

  if (!confirmed) return null;

  const clearState = getEmptyHybridState();
  const tamerUpdates = {
    "system.specialEvolutions.hybrid.state": clearState
  };

  if (state.resultIsPartnerCurrentForm || state.partnerIsMerged || state.partnerAvailability === "merged") {
    if (state.previousFormUuid) {
      tamerUpdates["system.partner.currentFormUuid"] = previousFormActor?.uuid ?? state.previousFormUuid;
      tamerUpdates["system.partner.currentFormName"] = previousFormActor?.name ?? state.previousFormName ?? "";
    } else if (!state.hadPartner) {
      tamerUpdates["system.partner.currentFormUuid"] = "";
      tamerUpdates["system.partner.currentFormName"] = "";
    }
  }

  await tamerActor.update(tamerUpdates);

  if (resultActor) {
    await resultActor.update({
      "system.tamer.name": "",
      "system.tamer.uuid": "",
      "system.specialEvolutions.hybrid.active": false,
      "system.specialEvolutions.hybrid.method": "",
      "system.specialEvolutions.hybrid.equivalentStage": "",
      "system.specialEvolutions.hybrid.state": clearState,
      "system.specialForm.sourceTamerUuid": "",
      "system.specialForm.sourceDigimonUuid": ""
    });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderHybridEndCard({ tamerActor, resultActor, previousFormActor: previousFormActor ?? sourceDigimon, state })
  });

  tamerActor.sheet?.render(false);
  resultActor?.sheet?.render(false);
  sourceDigimon?.sheet?.render(false);

  return { tamerActor, resultActor, previousFormActor };
}

async function collectEvolutionForms(partnerActor, previousFormActor = null) {
  const graph = getNormalizedEvolutionGraph(partnerActor);

  if (graph.nodes.length > 0) {
    return await collectEvolutionGraphForms(partnerActor, previousFormActor, graph);
  }

  const formsObject = partnerActor.system.evolutionLine?.forms ?? {};
  const stageOrder = getStageOrder();

  const forms = [];

  for (const slotKey of stageOrder) {
    const slot = formsObject[slotKey];
    const slotForms = normalizeEvolutionSlotForms(slot, slotKey);

    for (const form of slotForms) {
      if (!form?.uuid) continue;

      let formActor = null;

      try {
        formActor = await fromUuid(form.uuid);
      } catch (error) {
        console.warn(`DDA | Could not resolve evolution form in ${slotKey}:`, error);
      }

      const actualStage = formActor?.system?.stage ?? form.stage ?? slotKey;
      const actualName = formActor?.name ?? form.name ?? getStageLabel(actualStage);

      forms.push({
        slotKey,
        slotLabel: getStageLabel(slotKey),
        stageKey: actualStage,
        stageLabel: getStageLabel(actualStage),
        name: actualName,
        uuid: form.uuid,
        directLink: true,
        edgeMethod: "normal"
      });
    }
  }

  return forms;
}


async function collectDefaultRestFormCandidates(
  tamerActor,
  partnerActor,
  previousFormActor = null,
  { defaultRangeOverride = null } = {}
) {
  const defaultRange = normalizeDefaultRangeValue(
    defaultRangeOverride ?? tamerActor?.system?.evolution?.defaultRange?.value ?? 2
  );
  const defaultStagePolicy = String(
    tamerActor?.system?.evolution?.defaultRange?.defaultStagePolicy ?? "range"
  ).trim().toLowerCase();
  const persistentDefaultRange = defaultStagePolicy === "rookie"
    ? Math.min(defaultRange, 2)
    : defaultRange;
  const unlockedStages = tamerActor?.system?.partner?.unlockedEvolutionStages ?? {};
  const unlockedForms = Array.isArray(tamerActor?.system?.partner?.unlockedForms)
    ? tamerActor.system.partner.unlockedForms
    : [];
  const unlockedRefs = new Set(
    unlockedForms
      .filter((entry) => typeof entry === "string" || entry?.unlocked !== false)
      .flatMap((entry) => typeof entry === "string"
        ? [entry]
        : [entry?.uuid, entry?.actorUuid, entry?.formUuid].filter(Boolean))
      .map((entry) => String(entry))
  );

  const candidates = [];
  const seen = new Set();

  const pushCandidate = ({ name, stageKey, uuid, templateActor, persistentSnapshot = null, current = false }) => {
    const stageNumber = getOfficialEvolutionStageNumber(stageKey);
    if (stageNumber === null || !isStageWithinDefaultRange(stageKey, persistentDefaultRange)) return;
    if (!current && unlockedStages?.[stageKey] === false) return;

    const ref = String(uuid ?? templateActor?.uuid ?? "");
    if (!current && unlockedRefs.size > 0 && ref && !unlockedRefs.has(ref)) return;

    const cleanName = String(name ?? templateActor?.system?.species ?? templateActor?.name ?? getStageLabel(stageKey));
    const key = `${stageKey}|${cleanName.toLowerCase()}|${ref}`;
    if (seen.has(key)) return;
    seen.add(key);

    candidates.push({
      name: cleanName,
      stageKey,
      stageLabel: getStageLabel(stageKey),
      uuid: ref,
      templateActor,
      persistentSnapshot,
      current
    });
  };

  const currentStage = String(previousFormActor?.system?.stage ?? partnerActor?.system?.stage ?? "child");
  pushCandidate({
    name: previousFormActor?.system?.species ?? previousFormActor?.name ?? partnerActor?.name,
    stageKey: currentStage,
    uuid: previousFormActor?.uuid ?? partnerActor?.uuid,
    templateActor: previousFormActor ?? partnerActor,
    current: true
  });

  const graph = getNormalizedEvolutionGraph(partnerActor);
  if (graph.nodes.length > 0) {
    for (const node of graph.nodes) {
      if (!node?.actorUuid || node.hidden) continue;

      let actor = null;
      try { actor = await fromUuid(node.actorUuid); } catch (_error) {}

      const stageKey = String(node.stage ?? actor?.system?.stage ?? "");
      if (!isStageWithinDefaultRange(stageKey, persistentDefaultRange)) continue;

      const actorUuid = String(node.actorUuid ?? "");
      const isSnapshotNode = Boolean(
        node.snapshot || node.persistentSnapshot || actorUuid.startsWith("DDA-SNAPSHOT.")
      );
      const usesPersistentSnapshot = Boolean(
        isSnapshotNode ||
        (partnerActor?.uuid && actorUuid === partnerActor.uuid && stageKey && stageKey !== partnerActor.system?.stage)
      );
      const snapshot = usesPersistentSnapshot
        ? getGraphNodePersistentSnapshot({ partnerActor, node, isSnapshotNode })
        : null;
      const templateActor = snapshot
        ? buildPseudoActorFromFormSnapshot(snapshot, partnerActor)
        : actor;
      if (!templateActor) continue;

      const ref = String(snapshot?.sourceFormUuid ?? node.formUuid ?? node.actorUuid ?? templateActor.uuid ?? "");
      const currentRef = String(previousFormActor?.uuid ?? partnerActor.uuid ?? "");
      const isCurrent = Boolean(
        ref === currentRef ||
        (stageKey === currentStage && normalizeName(templateActor?.system?.species ?? templateActor?.name) === normalizeName(previousFormActor?.system?.species ?? previousFormActor?.name ?? partnerActor?.name))
      );

      pushCandidate({
        name: snapshot?.species ?? snapshot?.sourceFormName ?? node.species ?? node.displayName ?? node.name ?? templateActor.system?.species ?? templateActor.name,
        stageKey,
        uuid: ref,
        templateActor,
        persistentSnapshot: snapshot,
        current: isCurrent
      });
    }
  } else {
    const formsObject = partnerActor.system?.evolutionLine?.forms ?? {};
    for (const [slotKey, slot] of Object.entries(formsObject)) {
      for (const form of normalizeEvolutionSlotForms(slot, slotKey)) {
        if (!form?.uuid) continue;
        let actor = null;
        try { actor = await fromUuid(form.uuid); } catch (_error) {}
        if (!actor) continue;
        const stageKey = String(actor.system?.stage ?? form.stage ?? slotKey);
        pushCandidate({
          name: actor.system?.species ?? actor.name ?? form.name,
          stageKey,
          uuid: actor.uuid,
          templateActor: actor,
          current: actor.uuid === previousFormActor?.uuid
        });
      }
    }
  }

  return candidates.sort((a, b) => {
    const stageDelta = (getOfficialEvolutionStageNumber(a.stageKey) ?? 99) - (getOfficialEvolutionStageNumber(b.stageKey) ?? 99);
    return stageDelta || a.name.localeCompare(b.name, game.i18n?.lang ?? undefined);
  });
}

export async function chooseDefaultPartnerFormDuringRest(
  tamerActor,
  { defaultRangeOverride = null } = {}
) {
  if (!tamerActor || tamerActor.type !== "character") return null;

  const partnerUuid = tamerActor.system?.partner?.uuid;
  if (!partnerUuid) return null;

  const partnerActor = await resolveActor(partnerUuid);
  if (!partnerActor || partnerActor.type !== "digimon") return null;

  const currentReference = String(
    tamerActor.system?.partner?.currentFormUuid ??
    partnerActor.system?.evolution?.currentFormUuid ??
    partnerActor.uuid
  );
  const previousFormActor = await resolveActor(currentReference) ?? partnerActor;
  const candidates = await collectDefaultRestFormCandidates(
    tamerActor,
    partnerActor,
    previousFormActor,
    { defaultRangeOverride }
  );

  if (!candidates.length) {
    ui.notifications.info(localize("DDA.Evolution.DefaultStage.NoEligibleForms"));
    return null;
  }

  const defaultRange = normalizeDefaultRangeValue(
    defaultRangeOverride ?? tamerActor.system?.evolution?.defaultRange?.value ?? 2
  );
  const storedDefaultUuid = String(partnerActor.system?.evolution?.defaultFormUuid ?? "");
  const storedDefaultStage = String(partnerActor.system?.evolution?.defaultStage ?? "");
  let selectedIndex = candidates.findIndex((candidate) => storedDefaultUuid && candidate.uuid === storedDefaultUuid);
  if (selectedIndex < 0) selectedIndex = candidates.findIndex((candidate) => candidate.stageKey === storedDefaultStage);
  if (selectedIndex < 0) selectedIndex = candidates.findIndex((candidate) => candidate.current);
  if (selectedIndex < 0) selectedIndex = 0;

  const options = candidates.map((candidate, index) => `
    <option value="${index}" ${index === selectedIndex ? "selected" : ""}>
      ${escapeHtml(candidate.name)} — ${escapeHtml(candidate.stageLabel)}
    </option>
  `).join("");

  const choice = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-default-stage-rest-dialog"],
    window: { title: localize("DDA.Evolution.DefaultStage.RestTitle") },
    content: `
      <div class="dda-roll-dialog dda-default-stage-rest-dialog-content">
        <p>${formatI18n("DDA.Evolution.DefaultStage.RestHint", { range: defaultRange })}</p>
        ${String(tamerActor.system?.evolution?.defaultRange?.defaultStagePolicy ?? "range") === "rookie"
          ? `<p class="muted">${localize("DDA.Evolution.DefaultStage.RookieOnlyRule")}</p>`
          : ""}
        <div class="form-group">
          <label>${localize("DDA.Evolution.DefaultStage.Label")}</label>
          <select name="defaultForm">${options}</select>
        </div>
        <p class="muted">${localize("DDA.Evolution.DefaultStage.RestRule")}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => Number(button.form?.elements?.defaultForm?.value ?? selectedIndex)
      },
      {
        action: "keep",
        label: localize("DDA.Evolution.DefaultStage.KeepCurrent"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });

  if (choice === null || choice === false || !Number.isInteger(choice)) return null;
  const selected = candidates[choice];
  if (!selected) return null;

  const selectedRef = String(selected.uuid ?? selected.templateActor?.uuid ?? "");
  const sameCurrent = Boolean(selected.current);

  if (!sameCurrent) {
    await runDigimonTokenEvolutionTransition(
      partnerActor,
      async () => {
        await clearClashStateForActor(partnerActor, { reason: "restDefaultStage" });
        await applyEvolutionFormTemplateToPartner({
          partnerActor,
          formTemplateActor: selected.templateActor,
          tamerActor,
          previousFormActor,
          transitionType: "restDefaultStage",
          continuedHybridState: null
        });
        await fullyRestoreWounds(partnerActor, { clearTemp: true });
        return partnerActor;
      },
      { lowAlphaMultiplier: 0.16, midAlphaMultiplier: 0.62, stepDelay: 90 }
    );
  }

  await partnerActor.update({
    "system.evolution.defaultStage": selected.stageKey,
    "system.evolution.defaultFormUuid": selectedRef,
    "system.evolution.defaultFormName": selected.name
  });

  await tamerActor.update({
    "system.partner.uuid": partnerActor.uuid,
    "system.partner.currentFormUuid": partnerActor.system?.evolution?.currentFormUuid || selectedRef || partnerActor.uuid,
    "system.partner.currentFormName": partnerActor.system?.evolution?.currentFormName || selected.name
  });

  ui.notifications.info(formatI18n(
    "DDA.Evolution.DefaultStage.Updated",
    { form: selected.name, stage: selected.stageLabel }
  ));

  return { partnerActor, selected };
}


function normalizeEvolutionNodeLookup(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getEvolutionNodeLookupText(node = {}) {
  return normalizeEvolutionNodeLookup(node.species || node.displayName || node.name || "");
}

function findCurrentEvolutionGraphNodeForPartner(partnerActor = null, previousFormActor = null, graph = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  if (!nodes.length) return null;

  const persistentUuid = String(partnerActor?.uuid || "");
  const currentFormUuid = String(
    previousFormActor?.uuid ||
    partnerActor?.system?.evolution?.currentFormUuid ||
    partnerActor?.system?.evolution?.sourceFormUuid ||
    persistentUuid ||
    ""
  );
  const currentStage = String(previousFormActor?.system?.stage || partnerActor?.system?.stage || "");
  const currentName = normalizeEvolutionNodeLookup(
    previousFormActor?.system?.species ||
    previousFormActor?.name ||
    partnerActor?.system?.species ||
    partnerActor?.name ||
    ""
  );

  const hasSameIdentity = (node) => {
    const nodeStage = String(node?.stage || "");
    if (currentStage && nodeStage && nodeStage !== currentStage) return false;
    return Boolean(currentName && getEvolutionNodeLookupText(node) === currentName);
  };

  return nodes.find((node) => currentFormUuid && node?.formUuid === currentFormUuid)
    ?? nodes.find((node) => currentFormUuid && node?.sourceFormUuid === currentFormUuid)
    ?? nodes.find((node) => currentFormUuid && node?.currentFormUuid === currentFormUuid)
    ?? (currentFormUuid && currentFormUuid !== persistentUuid ? nodes.find((node) => node?.actorUuid === currentFormUuid) : null)
    ?? nodes.find((node) => node?.actorUuid === persistentUuid && hasSameIdentity(node))
    ?? nodes.find((node) => hasSameIdentity(node))
    ?? nodes.find((node) => node?.actorUuid === persistentUuid && String(node?.stage || "") === currentStage)
    ?? nodes.find((node) => node?.actorUuid === persistentUuid)
    ?? nodes[0]
    ?? null;
}

async function collectEvolutionGraphForms(partnerActor, previousFormActor, graph) {
  const previousUuid = previousFormActor?.uuid ?? partnerActor.uuid;
  const currentNode = findCurrentEvolutionGraphNodeForPartner(partnerActor, previousFormActor, graph);

  const requireDirectLink = Boolean(getDDASettingSafe("requireDirectEvolutionLink", true));
  const showLocked = Boolean(getDDASettingSafe("showLockedEvolutions", true));
  const outgoingEdges = graph.edges.filter((edge) => edge.from === currentNode?.id);
  const incomingEdges = graph.edges.filter((edge) => edge.to === currentNode?.id);

  const edgeByTarget = new Map();

  for (const edge of outgoingEdges) {
    edgeByTarget.set(edge.to, { edge, direction: "forward" });
  }

  for (const edge of incomingEdges) {
    if (!edgeByTarget.has(edge.from)) {
      edgeByTarget.set(edge.from, { edge, direction: "regression" });
    }
  }

  const forms = [];

  for (const node of graph.nodes) {
    if (!node?.actorUuid) continue;
    if (currentNode?.id && node.id === currentNode.id) continue;
    if (!currentNode?.id && node.actorUuid === previousUuid) continue;
    if (node.hidden && !showLocked) continue;

    const linkData = edgeByTarget.get(node.id);
    const directLink = Boolean(linkData);
    const edgeMethod = String(linkData?.edge?.method ?? "normal").trim();

    // Métodos especiais não são digievoluções normais de um único parceiro.
    // Eles devem ser executados pelos fluxos próprios: Jogress, Hybrid, Bio-Merge etc.
    if (isSpecialEvolutionGraphMethod(edgeMethod)) continue;

    if (requireDirectLink && !directLink && !showLocked) continue;

    let formActor = null;

    try {
      formActor = await fromUuid(node.actorUuid);
    } catch (error) {
      console.warn("DDA | Could not resolve evolution graph node:", error);
    }

    const nodeStage = node.stage ?? "";
    const resolvedStage = formActor?.system?.stage ?? "";
    const nodeActorUuid = String(node.actorUuid ?? "");
    const isSnapshotNode = Boolean(
      node.snapshot ||
      node.persistentSnapshot ||
      nodeActorUuid.startsWith("DDA-SNAPSHOT.")
    );

    const usesPersistentSnapshot = Boolean(
      isSnapshotNode ||
      (
        partnerActor?.uuid &&
        node.actorUuid === partnerActor.uuid &&
        nodeStage &&
        nodeStage !== partnerActor.system?.stage
      )
    );

    const persistentSnapshot = usesPersistentSnapshot
      ? getGraphNodePersistentSnapshot({
          partnerActor,
          node,
          isSnapshotNode
        })
      : null;

const actualStage = persistentSnapshot?.stage ?? (usesPersistentSnapshot ? nodeStage : (resolvedStage || node.stage || "child"));

const snapshotDisplayName = String(
  persistentSnapshot?.species ||
  persistentSnapshot?.sourceFormName ||
  persistentSnapshot?.displayName ||
  persistentSnapshot?.name ||
  ""
).trim();

const actorDisplayName = String(
  formActor?.system?.species ||
  formActor?.name ||
  ""
).trim();

const nodeDisplayName = String(
  node?.species ||
  node?.displayName ||
  node?.name ||
  ""
).trim();

const actualName = snapshotDisplayName ||
  (usesPersistentSnapshot
    ? (nodeDisplayName || getStageLabel(actualStage))
    : (actorDisplayName || nodeDisplayName || getStageLabel(actualStage)));

const actualUuid = persistentSnapshot?.sourceFormUuid || node.actorUuid;

    forms.push({
      slotKey: actualStage,
      slotLabel: getStageLabel(actualStage),
      stageKey: actualStage,
      stageLabel: getStageLabel(actualStage),
      name: actualName,
      uuid: actualUuid,
      nodeId: node.id,
      edgeId: linkData?.edge?.id ?? "",
      edgeMethod,
      edgeDirection: linkData?.direction ?? "none",
      directLink,
      persistentSnapshot
    });
  }

  return forms;
}

function getEvolutionUnlockData(
  tamerActor,
  partnerActor,
  form = {},
  previousFormActor = null
) {
  const stageKey = String(form.stageKey ?? form.slotKey ?? "").trim();
  const formUuid = String(form.uuid ?? "").trim();
  const previousStageKey = String(previousFormActor?.system?.stage ?? "").trim();
  const previousStageIndex = getStageIndex(previousStageKey);
  const targetStageIndex = getStageIndex(stageKey);
  const isRegression = Number.isFinite(previousStageIndex) &&
    Number.isFinite(targetStageIndex) &&
    targetStageIndex < previousStageIndex;

  // GM locks control advancement. Regression remains possible so an NPC or
  // Partner can always return from a higher form without revealing another
  // unreleased future evolution.
  if (isRegression || stageKey === "baby1") {
    return { allowed: true, reason: "" };
  }

  if (tamerActor?.type === "character") {
    const partner = tamerActor.system?.partner ?? {};
    const unlockedStages = partner.unlockedEvolutionStages ?? {};
    const unlockedForms = Array.isArray(partner.unlockedForms)
      ? partner.unlockedForms
      : [];
    const hasStageLocks = unlockedStages &&
      typeof unlockedStages === "object" &&
      Object.keys(unlockedStages).length > 0;

    if (hasStageLocks && stageKey && unlockedStages[stageKey] === false) {
      return {
        allowed: false,
        reason: localize("DDA.Warning.EvolutionStageLockedByGM")
      };
    }

    if (unlockedForms.length > 0 && formUuid) {
      const isUnlocked = unlockedForms.some((entry) => {
        if (typeof entry === "string") return entry === formUuid;
        return [
          entry?.uuid,
          entry?.actorUuid,
          entry?.formUuid,
          entry?.sourceFormUuid
        ].some((value) => String(value ?? "").trim() === formUuid) &&
          entry?.unlocked !== false;
      });

      if (!isUnlocked) {
        return {
          allowed: false,
          reason: localize("DDA.Warning.EvolutionFormLockedByGM")
        };
      }
    }

    return { allowed: true, reason: "" };
  }

  const isIndependentNpc = Boolean(
    partnerActor?.documentName === "Actor" &&
    partnerActor?.type === "npc" &&
    partnerActor?.system?.isDigimon
  );

  if (!isIndependentNpc) {
    return { allowed: true, reason: "" };
  }

  const unlockedForms = Array.isArray(partnerActor.system?.evolution?.unlockedForms)
    ? partnerActor.system.evolution.unlockedForms
    : [];

  const isUnlocked = Boolean(formUuid) && unlockedForms.some((entry) => {
    if (typeof entry === "string") return String(entry).trim() === formUuid;

    return [
      entry?.uuid,
      entry?.actorUuid,
      entry?.formUuid,
      entry?.sourceFormUuid
    ].some((value) => String(value ?? "").trim() === formUuid) &&
      entry?.unlocked !== false;
  });

  if (!isUnlocked) {
    return {
      allowed: false,
      reason: localize("DDA.Warning.EvolutionFormLockedByGM")
    };
  }

  return { allowed: true, reason: "" };
}

function chooseEvolutionForm(
  forms,
  partnerActor,
  previousFormActor,
  tamerActor,
  {
    freeEvolution = false
  } = {}
) {
  const evaluatedForms = forms.map((form) => {
    const pseudoNewActor = {
      name: form.name,
      system: {
        stage: form.stageKey
      },
      uuid: form.uuid,
      items: []
    };

    const costData = calculateEvolutionCost({
      tamerActor,
      previousActor: previousFormActor,
      newActor: pseudoNewActor,
      edgeMethod:
        form.edgeMethod,

      directLink:
        form.directLink,

      freeEvolution
    });

    if (tamerActor && !freeEvolution) {
      applyPreInitiativeEvolutionCost(costData, tamerActor);
    }

    const gmUnlockData = getEvolutionUnlockData(
      tamerActor,
      partnerActor,
      form,
      previousFormActor
    );

    if (!gmUnlockData.allowed) {
      costData.allowed = false;
      costData.blockedReason = gmUnlockData.reason;
    }

    return {
      ...form,
      gmUnlockData,
      costData
    };
  });

  const visibleForms = game.user?.isGM
    ? evaluatedForms
    : evaluatedForms.filter((form) => form.costData.allowed);

  const epLabel = localize("DDA.Resource.EvolutionPoints.Short");
  const initialForm = visibleForms.find((form) => form.costData.allowed) ?? visibleForms[0] ?? null;

  const options = visibleForms
    .map((form) => {
      const slotWarning = form.slotKey !== form.stageKey
        ? ` (${localize("DDA.Evolution.Slot")}: ${form.slotLabel})`
        : "";

      const transitionLabel = getEvolutionTransitionLabelFromType(form.costData.transitionType);
      const costValue = freeEvolution
        ? localize("DDA.AllyNpc.Evolution.Free")
        : `${form.costData.peCost} ${epLabel}`;
      const costLabel = ` — ${costValue}`;
      const blockedLabel = form.costData.allowed
        ? ""
        : ` — ${form.costData.blockedReason}`;

      const disabled = form.costData.allowed ? "" : "disabled";
      const selected = form.uuid === initialForm?.uuid ? "selected" : "";

      return `
        <option
          value="${escapeHtml(form.uuid)}"
          data-name="${escapeHtml(form.name)}"
          data-stage="${escapeHtml(form.stageLabel)}"
          data-transition="${escapeHtml(transitionLabel)}"
          data-cost="${escapeHtml(costValue)}"
          data-allowed="${form.costData.allowed ? "true" : "false"}"
          ${disabled}
          ${selected}
        >
          ${escapeHtml(form.stageLabel)} — ${escapeHtml(form.name)}${escapeHtml(slotWarning)} — ${escapeHtml(transitionLabel)}${escapeHtml(costLabel)}${escapeHtml(blockedLabel)}
        </option>
      `;
    })
    .join("");

  const hasAllowedForm = visibleForms.some((form) => form.costData.allowed);
  const currentFormName = String(
    previousFormActor?.system?.species ||
    previousFormActor?.name ||
    partnerActor?.system?.species ||
    partnerActor?.name ||
    ""
  ).trim();
  const currentStageLabel = getStageLabel(
    previousFormActor?.system?.stage ?? partnerActor?.system?.stage ?? ""
  );
  const initialTransitionLabel = initialForm
    ? getEvolutionTransitionLabelFromType(initialForm.costData.transitionType)
    : "—";
  const initialCostValue = initialForm
    ? (freeEvolution
        ? localize("DDA.AllyNpc.Evolution.Free")
        : `${initialForm.costData.peCost} ${epLabel}`)
    : `0 ${epLabel}`;

  const content = `
    <div class="dda-roll-dialog dda-evolution-form-dialog">
      <div class="dda-evolution-route">
        <article class="dda-evolution-route-node is-current">
          <span class="dda-evolution-route-icon" aria-hidden="true"><i class="fa-solid fa-paw"></i></span>
          <span class="dda-evolution-route-copy">
            <small>${localize("DDA.Evolution.PreviousForm")}</small>
            <strong>${escapeHtml(currentFormName)}</strong>
            <em>${escapeHtml(currentStageLabel)}</em>
          </span>
        </article>

        <div class="dda-evolution-route-axis" aria-hidden="true">
          <span data-role="target-transition">${escapeHtml(initialTransitionLabel)}</span>
          <i class="fa-solid fa-angles-right"></i>
        </div>

        <article class="dda-evolution-route-node is-target">
          <span class="dda-evolution-route-icon" aria-hidden="true"><i class="fa-solid fa-star"></i></span>
          <span class="dda-evolution-route-copy">
            <small>${localize("DDA.Evolution.NewForm")}</small>
            <strong data-role="target-name">${escapeHtml(initialForm?.name ?? "—")}</strong>
            <em data-role="target-stage">${escapeHtml(initialForm?.stageLabel ?? "—")}</em>
          </span>
          <span class="dda-evolution-route-cost ${initialForm?.costData?.allowed === false ? "is-blocked" : ""}" data-role="target-cost">${escapeHtml(initialCostValue)}</span>
        </article>
      </div>

      <div class="dda-evolution-form-selector">
        <label for="dda-evolution-form-select"><i class="fa-solid fa-shuffle" aria-hidden="true"></i> ${localize("DDA.Evolution.Form")}</label>
        <select id="dda-evolution-form-select" name="formUuid">
          ${options}
        </select>
      </div>

      <p class="dda-evolution-dialog-hint">
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
        <span>${localize(
          freeEvolution
            ? "DDA.AllyNpc.Evolution.NoCost"
            : "DDA.Evolution.CostHint"
        )}</span>
      </p>

      ${
        hasAllowedForm
          ? ""
          : `<p class="warning">${localize("DDA.Warning.NoAllowedEvolutionForms")}</p>`
      }
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-evolution-form-choice-dialog"],
    window: { title: localize("DDA.Evolution.Dialog.ChooseTitle") },
    position: { width: 620 },
    content,
    buttons: [
      {
        action: "evolve",
        icon: "fa-solid fa-burst",
        label: localize("DDA.Button.Digivolve"),
        default: hasAllowedForm,
        callback: (_event, button) => {
          const uuid = String(button.form?.elements?.formUuid?.value ?? "");
          const selected = visibleForms.find((entry) => entry.uuid === uuid);

          if (!selected?.costData?.allowed) {
            ui.notifications.warn(selected?.costData?.blockedReason || localize("DDA.Warning.EvolutionMethodDisabled"));
            return null;
          }

          return selected ?? null;
        }
      },
      {
        action: "cancel",
        icon: "fa-solid fa-xmark",
        label: localize("DDA.Button.Cancel"),
        default: !hasAllowedForm,
        callback: () => null
      }
    ],
    render: (_event, dialog) => {
      const root = dialog.element;
      const select = root?.querySelector?.('select[name="formUuid"]');
      if (!select) return;

      const syncSelectedForm = () => {
        const selectedOption = select.selectedOptions?.[0];
        if (!selectedOption) return;

        const name = root.querySelector('[data-role="target-name"]');
        const stage = root.querySelector('[data-role="target-stage"]');
        const transition = root.querySelector('[data-role="target-transition"]');
        const cost = root.querySelector('[data-role="target-cost"]');

        if (name) name.textContent = selectedOption.dataset.name || "—";
        if (stage) stage.textContent = selectedOption.dataset.stage || "—";
        if (transition) transition.textContent = selectedOption.dataset.transition || "—";
        if (cost) {
          cost.textContent = selectedOption.dataset.cost || "—";
          cost.classList.toggle("is-blocked", selectedOption.dataset.allowed !== "true");
        }
      };

      select.addEventListener("change", syncSelectedForm);
      syncSelectedForm();
    },
    rejectClose: false,
    modal: true
  });
}

function calculateEvolutionCost({
  tamerActor,
  previousActor,
  newActor,
  edgeMethod = "normal",
  directLink = true,
  freeEvolution = false
}) {
  const previousStage = previousActor?.system?.stage;
  const newStage = newActor?.system?.stage;

  const previousIndex =
    getStageIndex(previousStage);

  const newIndex =
    getStageIndex(newStage);

  /*
   * O parceiro persistente reutiliza o mesmo Actor
   * e, portanto, o mesmo UUID em todas as formas.
   *
   * UUID igual não significa mais "mesma forma".
   * A identidade precisa considerar também Estágio
   * e espécie.
   */
  const previousIdentity =
    normalizeName(
      previousActor?.system?.species ||
      previousActor?.name ||
      ""
    );

  const newIdentity =
    normalizeName(
      newActor?.system?.species ||
      newActor?.name ||
      ""
    );

  const sameStage =
    previousIndex !== -1 &&
    newIndex !== -1 &&
    previousIndex === newIndex;

  const sameReference =
    Boolean(
      previousActor?.uuid &&
      newActor?.uuid &&
      previousActor.uuid ===
        newActor.uuid
    );

  const sameIdentity =
    Boolean(
      previousIdentity &&
      newIdentity &&
      previousIdentity ===
        newIdentity
    );

  const normalizedEdgeMethod =
    String(
      edgeMethod ?? "normal"
    )
      .trim()
      .toLowerCase();

  const usesSpecialMethod =
    isJogressEvolutionMethod(
      normalizedEdgeMethod
    ) ||
    isHybridEvolutionGraphMethod(
      normalizedEdgeMethod
    ) ||
    [
      "armor",
      "dark"
    ].includes(
      normalizedEdgeMethod
    );

  const isSameForm =
    !usesSpecialMethod &&
    sameStage &&
    (
      sameIdentity ||
      (
        (!previousIdentity ||
          !newIdentity) &&
        sameReference
      )
    );

  let actionCost = 1;

  let peCost = 0;
  let reason = localize("DDA.Evolution.CostReason.NoEPCost");
  let transitionType = "formChange";
  let allowed = true;
  let blockedReason = "";

  if (isSameForm) {
    transitionType =
      "sameForm";

    peCost =
      0;

    reason =
      localize(
        "DDA.Evolution.CostReason.SameForm"
      );
  } else if (isJogressEvolutionMethod(edgeMethod)) {
    transitionType = "jogress";
    allowed = false;
    blockedReason = localize("DDA.Warning.UseJogressButton");
    peCost = 0;
    reason = localize("DDA.Evolution.CostReason.JogressEvolution");
  } else if (isHybridEvolutionGraphMethod(edgeMethod)) {
    transitionType = normalizeHybridMethod(edgeMethod);
    allowed = false;
    blockedReason = transitionType === "biomerge" ? localize("DDA.Warning.UseBioMergeButton") : localize("DDA.Warning.UseHybridButton");
    peCost = 0;
    reason = localize("DDA.Evolution.CostReason.SpecialEvolution");
  } else if (edgeMethod === "dark") {
    transitionType = "dark";
    actionCost = 0;
    allowed = Boolean(getDDASettingSafe("enableDarkEvolution", false));
    blockedReason = allowed ? "" : localize("DDA.Evolution.Blocked.DarkDisabled");
    peCost = 0;
    reason = localize("DDA.Evolution.CostReason.DarkEvolution");
  } else if (edgeMethod === "armor") {
    transitionType = "armor";
    allowed = Boolean(getDDASettingSafe("enableArmorEvolution", false));
    blockedReason = allowed ? "" : localize("DDA.Evolution.Blocked.ArmorDisabled");
    peCost = 0;
    reason = localize("DDA.Evolution.CostReason.ArmorEvolution");

    const digimental = findUsableDigimentalForEvolution(tamerActor, newActor);

    if (allowed && !digimental) {
      allowed = false;
      blockedReason = localize("DDA.Evolution.Blocked.NoUsableDigimental");
    }
  } else if (previousIndex !== -1 && newIndex !== -1 && newIndex < previousIndex) {
    transitionType = "regression";
    peCost = 0;
    reason = localize("DDA.Evolution.CostReason.Regression");
  } else if (previousIndex !== -1 && newIndex !== -1 && newIndex === previousIndex) {
    transitionType = "slide";
    allowed = Boolean(getDDASettingSafe("enableSlideEvolution", false));
    blockedReason = allowed ? "" : localize("DDA.Evolution.Blocked.SlideDisabled");

    if (hasSlideEvolutionMastery(previousActor) && hasSlideEvolutionMastery(newActor)) {
      peCost = 0;
      reason = localize("DDA.Evolution.CostReason.SlideEvolutionMastery");
    } else {
      peCost = 1;
      reason = localize("DDA.Evolution.CostReason.SlideEvolution");
    }
  } else if (previousIndex !== -1 && newIndex !== -1 && newIndex === previousIndex + 1) {
    transitionType = "standard";
    const defaultRange = normalizeDefaultRangeValue(
      tamerActor?.system?.evolution
        ?.defaultRange?.value ?? 2
    );

    if (isStageWithinDefaultRange(newStage, defaultRange)) {
      peCost = 0;
      reason = localize("DDA.Evolution.CostReason.WithinDefaultRange");
    } else {
      peCost = getOfficialPeCostForStage(newStage);
      reason = localize("DDA.Evolution.CostReason.OutsideDefaultRange");
    }
  } else if (previousIndex !== -1 && newIndex !== -1 && newIndex > previousIndex + 1) {
    transitionType = "warp";
    allowed = Boolean(getDDASettingSafe("enableWarpEvolution", false));
    blockedReason = allowed ? "" : localize("DDA.Evolution.Blocked.WarpDisabled");
    peCost = getWarpPeCostForStage(newStage);
    reason = localize("DDA.Evolution.CostReason.WarpEvolution");
  } else {
    transitionType = "formChange";
    peCost = 0;
    reason = localize("DDA.Evolution.CostReason.NoEPCost");
  }

    if (freeEvolution) {
    const blockedIndependentMethod =
      isJogressEvolutionMethod(
        normalizedEdgeMethod
      ) ||
      isHybridEvolutionGraphMethod(
        normalizedEdgeMethod
      ) ||
      isModeChangeEvolutionMethod(
        normalizedEdgeMethod
      ) ||
      [
        "armor",
        "dark"
      ].includes(
        normalizedEdgeMethod
      );

    if (blockedIndependentMethod) {
      allowed = false;

      blockedReason = localize(
        "DDA.AllyNpc.Evolution.SpecialMethodBlocked"
      );
    } else {
      actionCost = 0;
      peCost = 0;

      reason = localize(
        "DDA.AllyNpc.Evolution.NoCost"
      );
    }
  }

  const requireDirectLink = Boolean(getDDASettingSafe("requireDirectEvolutionLink", true));
  const allowRebranch = Boolean(getDDASettingSafe("allowEvolutionRebranch", false));

  if (
    !isSameForm &&
    requireDirectLink &&
    !directLink &&
    transitionType !== "regression"
  ) {
    allowed = false;
    blockedReason = localize("DDA.Evolution.Blocked.DirectLinkRequired");
  }

  if (
    !isSameForm &&
    !allowRebranch &&
    !directLink &&
    [
      "standard",
      "slide",
      "warp"
    ].includes(
      transitionType
    )
  ) {
    allowed = false;
    blockedReason = localize("DDA.Evolution.Blocked.RebranchDisabled");
  }

const availablePe = Number(
  tamerActor?.system?.resources
    ?.evolutionPoints?.value ?? 0
);

const ipPool = tamerActor
  ? getTamerIpPool(tamerActor)
  : {
      total: 0,
      normal: 0,
      temporary: 0
    };

const availableIp =
  ipPool.total;

const availableActions = Number(
  tamerActor?.system?.combat
    ?.actions?.value ?? 0
);

  const peSpent = Math.min(availablePe, peCost);
  const remainingCost = Math.max(0, peCost - peSpent);
  const ipSpent = Math.min(
    availableIp,
    remainingCost * DDA_IP_PER_EVOLUTION_POINT
  );
  const ipEvolutionPointValue = Math.floor(
    ipSpent / DDA_IP_PER_EVOLUTION_POINT
  );

  return {
    actionCost,
    peCost,
    peSpent,
    ipSpent,
    totalPaid: peSpent + ipEvolutionPointValue,
    remainingCost: Math.max(0, peCost - peSpent - ipEvolutionPointValue),
    availablePe,
    availableIp,
    availableNormalIp: ipPool.normal,
    availableTemporaryIp: ipPool.temporary,
    availableActions,
    reason,
    transitionType,
    allowed,
    blockedReason
  };
}

async function validateAndConfirmCost({ tamerActor, partnerActor, previousFormName, evolvedActor, costData }) {
  if (!costData.allowed) {
    ui.notifications.warn(costData.blockedReason || localize("DDA.Warning.EvolutionMethodDisabled"));
    return null;
  }

  if (costData.availableActions < costData.actionCost) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForDigivolution"));
    return null;
  }

  const availableEvolutionPointValue =
    costData.availablePe +
    Math.floor(costData.availableIp / DDA_IP_PER_EVOLUTION_POINT);

  if (availableEvolutionPointValue < costData.peCost) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughEPAndIPForDigivolution"));
    return null;
  }

  const suggestedPe = Math.min(costData.availablePe, costData.peCost);
  const suggestedIp = Math.max(
    0,
    (costData.peCost - suggestedPe) * DDA_IP_PER_EVOLUTION_POINT
  );

  const transitionLabel = getEvolutionTransitionLabelFromType(costData.transitionType);
  const previousImage = escapeHtml(partnerActor?.img || "icons/svg/mystery-man.svg");
  const nextImage = escapeHtml(evolvedActor?.img || "icons/svg/mystery-man.svg");

  const content = `
    <div class="dda-roll-dialog dda-evolution-confirm-dialog">
      <section class="dda-evolution-confirm-route" aria-label="${escapeHtml(formatI18n("DDA.Evolution.ConfirmChange", { previous: previousFormName, next: evolvedActor.name }))}">
        <article class="dda-evolution-confirm-form is-previous">
          <img src="${previousImage}" alt="${escapeHtml(previousFormName)}" />
          <span>
            <small>${localize("DDA.Evolution.PreviousForm")}</small>
            <strong>${escapeHtml(previousFormName)}</strong>
          </span>
        </article>

        <div class="dda-evolution-confirm-arrow" aria-hidden="true">
          <span>${escapeHtml(transitionLabel)}</span>
          <i class="fa-solid fa-angles-right"></i>
        </div>

        <article class="dda-evolution-confirm-form is-next">
          <img src="${nextImage}" alt="${escapeHtml(evolvedActor.name)}" />
          <span>
            <small>${localize("DDA.Evolution.NewForm")}</small>
            <strong>${escapeHtml(evolvedActor.name)}</strong>
          </span>
        </article>
      </section>

      <section class="dda-evolution-confirm-stats">
        <article>
          <i class="fa-solid fa-code-branch" aria-hidden="true"></i>
          <span>${localize("DDA.Label.Type")}</span>
          <strong>${escapeHtml(transitionLabel)}</strong>
        </article>
        <article>
          <i class="fa-solid fa-bolt" aria-hidden="true"></i>
          <span>${localize("DDA.Evolution.ActionCost")}</span>
          <strong>${costData.actionCost}</strong>
        </article>
        <article>
          <i class="fa-solid fa-gem" aria-hidden="true"></i>
          <span>${localize("DDA.Evolution.TotalEvolutionCost")}</span>
          <strong>${costData.peCost}</strong>
        </article>
      </section>

      ${costData.preInitiativeEvolution ? `<p class="warning"><i class="fa-solid fa-bolt"></i> ${localize("DDA.Evolution.PreInitiative.Warning")}</p>` : ""}

      <p class="dda-evolution-confirm-reason">
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
        <span><strong>${localize("DDA.Label.Reason")}</strong>${escapeHtml(costData.reason)}</span>
      </p>

      ${
        costData.transitionType === "dark"
          ? `<p class="warning"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <strong>${localize("DDA.DarkEvolution.WarningTitle")}:</strong> ${localize("DDA.DarkEvolution.WarningText")}</p>`
          : ""
      }

      ${
        costData.transitionType === "armor"
          ? `<p class="dda-evolution-confirm-reason"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> <span><strong>${localize("DDA.ArmorEvolution.Item")}</strong>${escapeHtml(findUsableDigimentalForEvolution(tamerActor, evolvedActor)?.name ?? localize("DDA.ArmorEvolution.UnknownDigimental"))}</span></p>`
          : ""
      }

      <section class="dda-evolution-payment-panel">
        <header>
          <span class="dda-evolution-payment-icon" aria-hidden="true"><i class="fa-solid fa-wallet"></i></span>
          <span>
            <small>${localize("DDA.Evolution.TotalEvolutionCost")}</small>
            <strong>${costData.peCost} ${localize("DDA.Resource.EvolutionPoints.Short")}</strong>
          </span>
        </header>

        <div class="dda-evolution-resource-grid">
          <article>
            <span>${localize("DDA.Evolution.EPAvailable")}</span>
            <strong>${costData.availablePe}</strong>
          </article>
          <article>
            <span>${localize("DDA.Evolution.IPAvailable")}</span>
            <strong>${costData.availableIp}</strong>
            <small>${costData.availableNormalIp} ${localize("DDA.Resource.IP.NormalShort")} + ${costData.availableTemporaryIp} ${localize("DDA.Resource.IP.TemporaryShort")}</small>
          </article>
        </div>

        <div class="dda-evolution-spend-grid">
          <label for="dda-evolution-pe-spent">
            <span>${localize("DDA.Evolution.EPToSpend")}</span>
            <input id="dda-evolution-pe-spent" type="number" name="peSpent" value="${suggestedPe}" min="0" max="${costData.availablePe}" step="1" />
          </label>

          <label for="dda-evolution-ip-spent">
            <span>${localize("DDA.Evolution.IPToSpend")}</span>
            <input id="dda-evolution-ip-spent" type="number" name="ipSpent" value="${suggestedIp}" min="0" max="${costData.availableIp}" step="1" />
          </label>
        </div>

        <p class="dda-evolution-dialog-hint">
          <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>
          <span>${localize("DDA.Evolution.PaymentHint")}</span>
        </p>
      </section>
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-evolution-cost-dialog"],
    window: { title: localize("DDA.Evolution.Dialog.ConfirmTitle") },
    content,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => {
          const elements = button.form?.elements;
          const peSpent = Math.max(0, Number(elements?.peSpent?.value ?? 0));
          const ipSpent = Math.max(0, Number(elements?.ipSpent?.value ?? 0));

          if (peSpent > costData.availablePe) {
            ui.notifications.warn(localize("DDA.Warning.NotEnoughEP"));
            return false;
          }

          if (ipSpent > costData.availableIp) {
            ui.notifications.warn(localize("DDA.Warning.NotEnoughIP"));
            return false;
          }

          const ipEvolutionPointValue = ipSpent / DDA_IP_PER_EVOLUTION_POINT;
          if (peSpent + ipEvolutionPointValue !== costData.peCost) {
            ui.notifications.warn(localize("DDA.Warning.EPAndIPMustEqualDigivolutionCost"));
            return false;
          }

          return {
            ...costData,
            peSpent,
            ipSpent,
            totalPaid: peSpent + ipEvolutionPointValue,
            remainingCost: 0
          };
        }
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => false
      }
    ],
    position: { width: 690, height: "auto" },
    rejectClose: false,
    modal: true
  });
}

async function payEvolutionCost(
  tamerActor,
  costData
) {
  const currentActions = Number(
    tamerActor.system.combat
      ?.actions?.value ?? 0
  );

  const currentPe = Number(
    tamerActor.system.resources
      ?.evolutionPoints?.value ?? 0
  );

  await tamerActor.update({
    "system.combat.actions.value":
      Math.max(
        0,
        currentActions -
          costData.actionCost
      ),

    "system.resources.evolutionPoints.value":
      Math.max(
        0,
        currentPe -
          costData.peSpent
      )
  });

  if (costData.preInitiativeEvolution && costData.preInitiativeCombatId) {
    await markPreInitiativeEvolutionDebt(
      tamerActor,
      costData.preInitiativeCombatId,
      costData.actionCost
    );
  }

  const ipPayment =
    await spendTamerIp(
      tamerActor,
      costData.ipSpent,
      {
        allowTemporary: true,
        temporaryFirst: true
      }
    );

  if (!ipPayment.success) {
    throw new Error(
      localize(
        "DDA.Warning.NotEnoughIP"
      )
    );
  }

  costData.ipSpentNormal =
    ipPayment.spentNormal;

  costData.ipSpentTemporary =
    ipPayment.spentTemporary;
}

async function applySlideEvolutionWoundAdjustment(previousActor, evolvedActor) {
  if (!previousActor || !evolvedActor || previousActor.uuid === evolvedActor.uuid) return;

  const previousWounds = previousActor.system.miscStats?.wounds ?? {};
  const newWounds = evolvedActor.system.miscStats?.wounds ?? {};

  const previousValue = Number(previousWounds.value ?? previousWounds.max ?? 0);
  const previousMax = Number(previousWounds.max ?? previousValue ?? 0);
  const newMax = Number(newWounds.max ?? newWounds.value ?? 0);
  const maxDifference = newMax - previousMax;

  const nextValue = Math.clamp(previousValue + maxDifference, 0, Math.max(0, newMax));
  const previousTempValue = Number(previousWounds.temp?.value ?? 0);

  await evolvedActor.update({
    "system.miscStats.wounds.value": nextValue,
    "system.miscStats.wounds.temp.value": Math.max(0, previousTempValue)
  });
}



function shouldFullyHealOnEvolution({
  previousStageKey = "",
  nextStageKey = "",
  transitionType = ""
} = {}) {
  const previousIndex =
    getStageIndex(
      String(
        previousStageKey ?? ""
      ).trim()
    );

  const nextIndex =
    getStageIndex(
      String(
        nextStageKey ?? ""
      ).trim()
    );

  /*
   * O critério central é subir de Estágio.
   * Reutilização de UUID, snapshot ou Actor
   * persistente não pode bloquear a cura.
   */
  if (
    previousIndex !== -1 &&
    nextIndex !== -1
  ) {
    return nextIndex >
      previousIndex;
  }

  /*
   * Armor e Dark podem utilizar categorias
   * especiais fora da ordem normal de Estágios.
   */
  const normalizedTransition =
    String(
      transitionType ?? ""
    )
      .trim()
      .toLowerCase();

  return [
    "armor",
    "dark"
  ].includes(
    normalizedTransition
  );
}


async function fullyRestoreWounds(
  actor,
  {
    clearTemp = true
  } = {}
) {
  if (!actor) {
    return null;
  }

  const woundPath =
    actor.type === "character"
      ? "system.derived.wounds"
      : "system.miscStats.wounds";

  const wounds =
    foundry.utils.getProperty(
      actor,
      woundPath
    ) ?? {};

  let maximum =
    Number(
      wounds.max ?? 0
    );

  /*
   * Para Digimon, calcula novamente usando a
   * fórmula da forma atual. Isso impede que um
   * máximo antigo seja usado logo depois da
   * aplicação do snapshot.
   *
   * Máximo = SV + Saúde × 2
   */
  if (
    ["digimon", "npc"].includes(
      actor.type
    )
  ) {
    const stageValue =
      Math.max(
        0,
        Number(
          actor.system?.stageValue ?? 0
        )
      );

    const healthTotal =
      Math.max(
        1,
        Number(
          actor.system?.mainStats
            ?.health?.total ??
          actor.system?.mainStats
            ?.health?.value ??
          (
            Number(
              actor.system?.mainStats
                ?.health?.base ?? 0
            ) +
            Number(
              actor.system?.mainStats
                ?.health?.bonus ?? 0
            )
          )
        )
      );

    maximum =
      Math.max(
        1,
        stageValue +
        healthTotal * 2
      );
  }

  if (
    !Number.isFinite(maximum) ||
    maximum <= 0
  ) {
    return null;
  }

  const updates = {
    [`${woundPath}.value`]:
      maximum,

    "system.combat.defeated":
      false
  };

  if (clearTemp) {
    updates[
      `${woundPath}.temp.value`
    ] = 0;
  }

  await actor.update(updates);

  actor.sheet?.render(false);

  return {
    actor,
    maximum,
    clearedTemporaryWounds:
      Boolean(clearTemp)
  };
}

function isEvolutionLockedForCombat(actor) {
  return Boolean(actor?.system?.status?.evolutionLockedUntilCombatEnd);
}


function findUsableDigimentalForEvolution(tamerActor, evolvedActor) {
  if (!tamerActor?.items || !evolvedActor) return null;

  const evolvedUuid = normalizeUuid(evolvedActor.uuid ?? "");
  const evolvedName = normalizeName(evolvedActor.name);
  const evolvedStage = String(evolvedActor.system?.stage ?? "").trim();

  return Array.from(tamerActor.items).find((item) => {
    if (item.type !== "digimental") return false;

    const uses = item.system?.uses ?? {};
    const usesMax = Math.max(1, Number(uses.max ?? 1));
    const usesValue = Number(uses.value ?? usesMax);

    if (Boolean(item.system?.usedUntilRest)) return false;
    if (usesMax > 0 && usesValue <= 0) return false;

    const armorFormUuid = normalizeUuid(item.system?.armorForm?.uuid ?? "");
    const armorFormName = normalizeName(item.system?.armorForm?.name ?? "");
    const targetStage = String(item.system?.targetStage ?? "").trim();

    if (armorFormUuid && armorFormUuid === evolvedUuid) return true;
    if (armorFormName && evolvedName && armorFormName === evolvedName) return true;

    // Permite Digimentals configurados só por estágio; útil antes de vincular
    // uma forma específica, mas não substitui o vínculo exato por UUID/nome.
    if (targetStage && targetStage === evolvedStage && !armorFormUuid && !armorFormName) return true;

    return !armorFormUuid && !armorFormName && !targetStage;
  }) ?? null;
}

async function markArmorEvolutionItemUsed(tamerActor, evolvedActor) {
  const item = findUsableDigimentalForEvolution(tamerActor, evolvedActor);
  if (!item) return null;

  await item.update({
    "system.usedUntilRest": true,
    "system.uses.value": 0,
    "system.lastUsedAt": new Date().toISOString(),
    "system.lastArmorForm.uuid": evolvedActor.uuid,
    "system.lastArmorForm.name": evolvedActor.name
  });

  return item;
}

async function applyDarkEvolutionConsequences({ tamerActor, partnerActor, previousActor, evolvedActor }) {
  const stageKey = evolvedActor.system.stage ?? "child";
  const stageValue = getStageValue(stageKey);
  const stageLabel = getStageLabel(stageKey);
  const markedBoxes = Math.max(0, stageValue);
  const turnsRemaining = Math.max(1, stageValue);
  const revertStage = getStageDirectlyBelow(previousActor?.system?.stage ?? partnerActor?.system?.stage ?? "child");

  await createDarkEvolutionTorment(tamerActor, {
    markedBoxes,
    evolvedName: evolvedActor.name,
    stageLabel
  });

  await grantDarkEvolutionCombatMonster(evolvedActor, {
    markedBoxes,
    tamerName: tamerActor.name
  });

  const activeEffects = foundry.utils.deepClone(evolvedActor.system.effects?.active ?? []);
  const effectId = `dark-evolution-${Date.now()}`;

  activeEffects.push({
    id: effectId,
    label: localize("DDA.DarkEvolution.EffectName"),
    tag: "darkEvolution",
    category: "control",
    sourceActorName: tamerActor.name,
    sourceAttackName: localize("DDA.DarkEvolution.Title"),
    duration: "turns",
    remaining: turnsRemaining,
    description: localize("DDA.DarkEvolution.EffectDescription")
  });

  await evolvedActor.update({
    "system.effects.active": activeEffects,
    "system.evolution.dark.active": true,
    "system.evolution.dark.tamerUuid": tamerActor.uuid,
    "system.evolution.dark.tamerName": tamerActor.name,
    "system.evolution.dark.previousFormUuid": previousActor?.uuid ?? "",
    "system.evolution.dark.previousFormName": previousActor?.name ?? "",
    "system.evolution.dark.turnsRemaining": turnsRemaining,
    "system.evolution.dark.revertStage": revertStage
  });

  return {
    actorUuid: evolvedActor.uuid,
    tamerName: tamerActor.name,
    digimonName: evolvedActor.name,
    stageLabel,
    markedBoxes,
    turnsRemaining,
    revertStageLabel: getStageLabel(revertStage)
  };
}

async function createDarkEvolutionTorment(tamerActor, { markedBoxes, evolvedName, stageLabel }) {
  const tormentName = formatI18n("DDA.DarkEvolution.TormentName", {
    digimon: evolvedName
  });

  await tamerActor.createEmbeddedDocuments("Item", [
    {
      name: tormentName,
      type: "torment",
      system: {
        boxes: {
          value: markedBoxes,
          max: 10
        },
        severity: "major",
        checkedUntilRest: false,
        penalty: {
          enabled: false,
          value: 0,
          combatActionLock: false
        },
        description: formatI18n("DDA.DarkEvolution.TormentDescription", {
          digimon: evolvedName,
          stage: stageLabel,
          boxes: markedBoxes
        })
      }
    }
  ]);
}

async function grantDarkEvolutionCombatMonster(evolvedActor, { tamerName }) {
  const officialQuality = getCombatMonsterQualityDefinition();
  const itemData = buildDarkEvolutionQualityItemData(officialQuality);

  const existing = evolvedActor.items.find((item) => {
    if (item.type !== "quality") return false;

    const sourceId = String(item.system?.sourceId ?? item.system?.id ?? "");
    const normalizedName = normalizeName(item.name);
    const normalizedOriginalName = normalizeName(item.system?.originalName ?? "");

    return sourceId === "monstroDeCombate" ||
      normalizedName === "combat monster" ||
      normalizedName === "monstro de combate" ||
      normalizedOriginalName === "combat monster";
  });

  if (existing) {
    await existing.update({
      name: itemData.name,
      img: itemData.img,
      system: itemData.system
    });
  } else {
    await evolvedActor.createEmbeddedDocuments("Item", [itemData]);
  }

  const resolveMax = Number(officialQuality?.grants?.resource?.max ?? itemData.system?.grants?.resource?.max ?? 4);
  const filledResolve = Math.max(0, resolveMax);

  await evolvedActor.update({
    "system.resources.resolve.enabled": true,
    "system.resources.resolve.value": filledResolve,
    "system.resources.resolve.max": filledResolve,
    "system.resources.resolve.source": localize("DDA.DarkEvolution.Title"),
    "system.resources.resolve.tamerName": tamerName
  });
}

function getCombatMonsterQualityDefinition() {
  return DDA_DIGIMON_QUALITIES.find((quality) => {
    const id = String(quality.id ?? "");
    const name = normalizeName(quality.name);
    const originalName = normalizeName(quality.originalName ?? "");

    return id === "monstroDeCombate" ||
      name === "monstro de combate" ||
      name === "combat monster" ||
      originalName === "combat monster";
  }) ?? null;
}

function buildDarkEvolutionQualityItemData(quality) {
  const fallbackQuality = {
    id: "monstroDeCombate",
    name: localize("DDA.DarkEvolution.CombatMonsterName"),
    originalName: "Combat Monster",
    tier: "starting",
    originalTier: "Starting Qualities",
    section: "Defensive Qualities",
    availability: {
      minimumStage: "",
      label: localize("DDA.QualityBrowser.Tier.Starting")
    },
    category: {
      core: false,
      attack: false,
      trigger: false,
      static: true,
      free: false,
      negative: false
    },
    cost: {
      dp: 2,
      perRank: false,
      coreDiscountAvailable: false,
      countsAgainstFreeLimit: false,
      grantsDp: false
    },
    rank: {
      value: 1,
      max: 1,
      limited: false
    },
    grants: {
      resource: {
        key: "resolve",
        label: "Resolve",
        value: 0,
        max: 4
      }
    },
    activation: {
      enabled: false,
      active: false,
      mode: "passive",
      chatMessage: ""
    },
    uses: {
      enabled: false,
      value: 0,
      max: 0,
      recharge: ""
    },
    effect: localize("DDA.DarkEvolution.CombatMonsterEffect"),
    description: localize("DDA.DarkEvolution.CombatMonsterEffect")
  };

  const source = quality ?? fallbackQuality;
  const category = foundry.utils.deepClone(source.category ?? fallbackQuality.category);
  const cost = foundry.utils.deepClone(source.cost ?? fallbackQuality.cost);

  category.free = true;
  category.static = true;

  cost.dp = 0;
  cost.total = 0;
  cost.isFree = true;
  cost.countsAgainstFreeLimit = false;
  cost.grantsDp = false;
  cost.coreDiscountAvailable = false;
  cost.normalDiscountAvailable = false;

  return {
    name: source.name ?? fallbackQuality.name,
    type: "quality",
    img: "icons/svg/book.svg",
    system: {
      sourceId: source.id ?? "monstroDeCombate",
      originalName: source.originalName ?? "Combat Monster",
      tier: source.tier ?? "starting",
      originalTier: source.originalTier ?? "Starting Qualities",
      availability: foundry.utils.deepClone(source.availability ?? fallbackQuality.availability),
      section: source.section ?? fallbackQuality.section,
      category,
      cost,
      rank: foundry.utils.deepClone(source.rank ?? fallbackQuality.rank),
      rankLimit: foundry.utils.deepClone(source.rankLimit ?? null),
      stageRequirement: foundry.utils.deepClone(source.stageRequirement ?? {}),
      requirements: foundry.utils.deepClone(source.requirements ?? {}),
      incompatible: foundry.utils.deepClone(source.incompatible ?? {}),
      requiredFor: foundry.utils.deepClone(source.requiredFor ?? []),
      choices: foundry.utils.deepClone(source.choices ?? {}),
      attackModifier: foundry.utils.deepClone(source.attackModifier ?? {}),
      grants: foundry.utils.deepClone(source.grants ?? fallbackQuality.grants),
      activation: foundry.utils.deepClone(source.activation ?? fallbackQuality.activation),
      uses: foundry.utils.deepClone(source.uses ?? fallbackQuality.uses),
      effect: source.effect ?? fallbackQuality.effect,
      description: source.description ?? fallbackQuality.description,
      darkEvolutionGranted: true
    }
  };
}


function renderDarkEvolutionChatBlock(data) {
  return `
    <div class="dda-dark-evolution-warning">
      <h3>${escapeHtml(localize("DDA.DarkEvolution.Title"))}</h3>
      <ul class="dda-effect-list">
        <li>${localize("DDA.DarkEvolution.Chat.GmControl")}</li>
        <li>${formatI18n("DDA.DarkEvolution.Chat.Torment", {
          tamer: escapeHtml(data.tamerName),
          boxes: data.markedBoxes
        })}</li>
        <li>${formatI18n("DDA.DarkEvolution.Chat.CombatMonster", {
          digimon: escapeHtml(data.digimonName)
        })}</li>
        <li>${formatI18n("DDA.DarkEvolution.Chat.EndConditionTurns", {
          turns: data.turnsRemaining
        })}</li>
        <li>${localize("DDA.DarkEvolution.Chat.EndConditionCheck")}</li>
        <li>${formatI18n("DDA.DarkEvolution.Chat.Revert", {
          stage: escapeHtml(data.revertStageLabel)
        })}</li>
      </ul>
      <div class="dda-dark-evolution-actions">
        <button type="button" data-action="dda-dark-evolution-tick" data-actor-uuid="${escapeHtml(data.actorUuid ?? "")}">
          ${localize("DDA.DarkEvolution.Button.ReduceTurn")}
        </button>
        <button type="button" data-action="dda-dark-evolution-end" data-actor-uuid="${escapeHtml(data.actorUuid ?? "")}">
          ${localize("DDA.DarkEvolution.Button.End")}
        </button>
      </div>
    </div>
  `;
}

function getStageValue(stageKey) {
  const value = Number(CONFIG.DDA?.stages?.[stageKey]?.stageValue ?? NaN);

  if (Number.isFinite(value)) return value;

  const fallback = {
    baby1: 0,
    baby2: 1,
    child: 2,
    adult: 3,
    perfect: 4,
    ultimate: 5,
    ultimatePlus: 6
  };

  return Number(fallback[stageKey] ?? 0);
}

function getStageDirectlyBelow(stageKey) {
  const order = getStageOrder();
  const index = order.indexOf(stageKey);

  if (index <= 0) return order[0];

  return order[index - 1];
}



export async function decrementDarkEvolutionTurn(actorOrUuid, options = {}) {
  const actor = typeof actorOrUuid === "string" ? await resolveActor(actorOrUuid) : actorOrUuid;

  if (!actor || actor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.DarkEvolution.Warning.NoActiveDarkEvolution"));
    return null;
  }

  const dark = actor.system.evolution?.dark ?? {};
  if (!dark.active) {
    ui.notifications.warn(localize("DDA.DarkEvolution.Warning.NoActiveDarkEvolution"));
    return null;
  }

  const nextTurns = Math.max(0, Number(dark.turnsRemaining ?? 0) - 1);
  const activeEffects = foundry.utils.deepClone(actor.system.effects?.active ?? []).map((effect) => {
    if (effect.tag !== "darkEvolution") return effect;
    return {
      ...effect,
      remaining: nextTurns
    };
  });

  await actor.update({
    "system.evolution.dark.turnsRemaining": nextTurns,
    "system.effects.active": activeEffects
  });

  if (nextTurns <= 0) {
    return await endDarkEvolution(actor, { reason: options.reason ?? "turns" });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-dark-evolution-card">
        <h2>${localize("DDA.DarkEvolution.Title")}</h2>
        <p>${formatI18n("DDA.DarkEvolution.Chat.TurnReduced", {
          digimon: escapeHtml(actor.name),
          turns: nextTurns
        })}</p>
      </div>
    `
  });

  actor.sheet?.render(false);
  return actor;
}

export async function endDarkEvolution(actorOrUuid, options = {}) {
  const actor = typeof actorOrUuid === "string" ? await resolveActor(actorOrUuid) : actorOrUuid;

  if (!actor || actor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.DarkEvolution.Warning.NoActiveDarkEvolution"));
    return null;
  }

  const dark = actor.system.evolution?.dark ?? {};
  if (!dark.active) {
    ui.notifications.warn(localize("DDA.DarkEvolution.Warning.NoActiveDarkEvolution"));
    return null;
  }

  const tamerActor = await resolveActor(dark.tamerUuid) ?? await resolveActor(actor.system.tamer?.uuid);
  const previousActor = await resolveActor(dark.previousFormUuid);
  const revertStage = dark.revertStage || getStageDirectlyBelow(previousActor?.system?.stage ?? actor.system.stage ?? "child");
  const revertActor = await findDarkEvolutionRevertActor({
    currentActor: actor,
    previousActor,
    tamerActor,
    revertStage
  });

  await removeDarkEvolutionTemporaryState(actor, options.reason ?? "manual");

  if (tamerActor && revertActor) {
    await tamerActor.update({
      "system.partner.currentFormUuid": revertActor.uuid,
      "system.partner.currentFormName": revertActor.name
    });

    await revertActor.update({
      "system.tamer.name": tamerActor.name,
      "system.tamer.uuid": tamerActor.uuid,
      "system.tamer.id": tamerActor.id
    });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor ?? actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-dark-evolution-card">
        <h2>${localize("DDA.DarkEvolution.EndTitle")}</h2>
        <ul class="dda-effect-list">
          <li>${formatI18n("DDA.DarkEvolution.Chat.Ended", {
            digimon: escapeHtml(actor.name),
            reason: escapeHtml(getDarkEvolutionEndReasonLabel(options.reason ?? "manual"))
          })}</li>
          <li>${formatI18n("DDA.DarkEvolution.Chat.RevertedTo", {
            form: escapeHtml(revertActor?.name ?? localize("DDA.DarkEvolution.UnknownRevertForm")),
            stage: escapeHtml(getStageLabel(revertActor?.system?.stage ?? revertStage))
          })}</li>
        </ul>
      </div>
    `
  });

  actor.sheet?.render(false);
  revertActor?.sheet?.render(false);
  tamerActor?.sheet?.render(false);

  return revertActor ?? actor;
}

async function removeDarkEvolutionTemporaryState(actor, reason = "manual") {
  const activeEffects = foundry.utils.deepClone(actor.system.effects?.active ?? [])
    .filter((effect) => effect.tag !== "darkEvolution");

  const darkQualityIds = actor.items
    .filter((item) => item.type === "quality" && Boolean(item.system?.darkEvolutionGranted))
    .map((item) => item.id);

  if (darkQualityIds.length) {
    await actor.deleteEmbeddedDocuments("Item", darkQualityIds);
  }

  await actor.update({
    "system.effects.active": activeEffects,
    "system.evolution.dark.active": false,
    "system.evolution.dark.turnsRemaining": 0,
    "system.evolution.dark.endedAt": new Date().toISOString(),
    "system.evolution.dark.endReason": reason,
    "system.resources.resolve.enabled": false,
    "system.resources.resolve.value": 0,
    "system.resources.resolve.source": "",
    "system.resources.resolve.tamerName": ""
  });
}

async function findDarkEvolutionRevertActor({ currentActor, previousActor, tamerActor, revertStage }) {
  const candidates = [];

  for (const actor of [previousActor, currentActor]) {
    if (actor && !candidates.some((entry) => entry.uuid === actor.uuid)) candidates.push(actor);
  }

  const partnerRoot = await resolveActor(tamerActor?.system?.partner?.uuid);
  if (partnerRoot && !candidates.some((entry) => entry.uuid === partnerRoot.uuid)) candidates.push(partnerRoot);

  const searchGraphs = [currentActor, previousActor, partnerRoot].filter(Boolean);

  for (const graphActor of searchGraphs) {
    const graph = getNormalizedEvolutionGraph(graphActor);

    for (const node of graph.nodes) {
      const nodeActor = await resolveActor(node.actorUuid);
      if (!nodeActor || candidates.some((entry) => entry.uuid === nodeActor.uuid)) continue;
      candidates.push(nodeActor);
    }
  }

  return candidates.find((candidate) => candidate.system?.stage === revertStage)
    ?? previousActor
    ?? currentActor;
}

function getDarkEvolutionEndReasonLabel(reason) {
  const labels = {
    manual: "DDA.DarkEvolution.EndReason.Manual",
    turns: "DDA.DarkEvolution.EndReason.Turns",
    defeated: "DDA.DarkEvolution.EndReason.Defeated",
    check: "DDA.DarkEvolution.EndReason.Check",
    scene: "DDA.DarkEvolution.EndReason.Scene"
  };

  return localize(labels[reason] ?? labels.manual);
}

export function getOfficialPeCostForStage(stageKey) {
  return getOfficialEvolutionPointCostForStage(stageKey);
}

function getWarpPeCostForStage(stageKey) {
  const costs = {
    baby1: 0,
    baby2: 0,
    child: 1,
    adult: 2,
    perfect: 3,
    ultimate: 4,
    ultimatePlus: 5
  };

  return Number(costs[stageKey] ?? getStageIndex(stageKey) ?? 0);
}

function getStageOrder() {
  return ["baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"];
}


function isJogressEvolutionMethod(method = "") {
  return isJogressRulesMethod(method);
}

function isHybridEvolutionGraphMethod(method = "") {
  return DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED && isLegacyHybridSpecialMethod(method);
}

function isModeChangeEvolutionMethod(method = "") {
  const normalized = normalizeName(method).replace(/[\s_\-:()]+/g, "");
  return normalized === "modechange" || normalized === "mode" || normalized === "burst" || normalized === "burstmode" || normalized === "blast" || normalized === "blastevolution";
}

function isSpecialEvolutionGraphMethod(method = "") {
  return isJogressEvolutionMethod(method) || isHybridEvolutionGraphMethod(method) || isModeChangeEvolutionMethod(method);
}

function getEmptyJogressState() {
  return {
    active: false,
    recipeId: "",
    historyKey: "",
    resultUuid: "",
    resultName: "",
    resultStage: "",
    runtimePartnerUuid: "",
    primaryTamerUuid: "",
    primaryTamerName: "",
    primaryDigimonUuid: "",
    primaryDigimonName: "",
    primaryFormUuid: "",
    primaryFormName: "",
    secondaryTamerUuid: "",
    secondaryTamerName: "",
    secondaryDigimonUuid: "",
    secondaryDigimonName: "",
    secondaryFormUuid: "",
    secondaryFormName: "",
    primaryRevertUuid: "",
    primaryRevertName: "",
    primaryRevertStage: "",
    secondaryRevertUuid: "",
    secondaryRevertName: "",
    secondaryRevertStage: "",
    preparedBuildUsed: false,
    preparedBuildReference: "",
    interruptTamerUuid: "",
    interruptTamerName: "",
    actingTamerUuid: "",
    masteredBeforeUse: false,
    firstSuccessfulUse: false,
    sharedInitiative: 0,
    componentBonusDp: 0,
    primaryDigimonBonusDp: 0,
    secondaryDigimonBonusDp: 0,
    combinedSharedStatBonus: {},
    combinedSharedQualityDp: 0,
    combatId: "",
    pendingInitiativeRound: 0,
    initiativeApplied: false,
    initiativeUnitId: "",
    combatSnapshot: {},
    primaryAdvancementState: {},
    primaryOwnership: {},
    secondaryActionsValue: 0,
    secondaryActionsMax: 2,
    secondaryTokenStates: [],
    tokenHideMarker: "",
    startedAt: ""
  };
}

function isTamerInActiveJogress(tamerActor) {
  return Boolean(tamerActor?.system?.specialEvolutions?.jogress?.state?.active);
}

function getActiveEvolutionConflict(tamerActor, partnerActor) {
  const tamerSpecial = tamerActor?.system?.specialEvolutions ?? {};
  const partnerSpecial = partnerActor?.system?.specialEvolutions ?? {};

  const active = (branch) => Boolean(branch?.active || branch?.state?.active);

  if (active(tamerSpecial.jogress) || active(partnerSpecial.jogress)) return "jogress";
  if (active(tamerSpecial.forced) || active(partnerSpecial.forced)) return "forced";
  if (active(tamerSpecial.blast) || active(partnerSpecial.blast)) return "blast";
  if (active(tamerSpecial.hybrid) || active(partnerSpecial.hybrid)) return "hybrid";
  if (Boolean(partnerActor?.system?.evolution?.dark?.active)) return "dark";
  return "";
}

function getEvolutionConflictLabel(kind = "") {
  const key = {
    jogress: "DDA.Jogress.Title",
    forced: "DDA.ForcedEvolution.Title",
    blast: "DDA.BlastEvolution.Title",
    hybrid: "DDA.Hybrid.Title",
    dark: "DDA.DarkEvolution.Title"
  }[String(kind ?? "").trim()];
  return key ? localize(key) : localize("DDA.Evolution.Title");
}

function warnEvolutionConflict(kind = "") {
  ui.notifications.warn(formatI18n("DDA.Warning.SpecialEvolutionConflict", {
    evolution: getEvolutionConflictLabel(kind)
  }));
}

function hasConflictingJogressSpecialEvolution(tamerActor, partnerActor) {
  const tamerSpecial = tamerActor?.system?.specialEvolutions ?? {};
  const partnerSpecial = partnerActor?.system?.specialEvolutions ?? {};
  return Boolean(
    tamerSpecial?.forced?.active ||
    tamerSpecial?.blast?.active ||
    tamerSpecial?.hybrid?.active ||
    partnerSpecial?.forced?.active ||
    partnerSpecial?.blast?.active ||
    partnerSpecial?.hybrid?.active ||
    partnerActor?.system?.evolution?.dark?.active
  );
}

function participantsHaveSameStage(participants = []) {
  const stages = participants
    .map((participant) => String(participant?.form?.stageKey ?? participant?.partnerActor?.system?.stage ?? "").trim())
    .filter(Boolean);
  return stages.length === 2 && stages.every((stage) => stage === stages[0]);
}

function isImmediatelyHigherStage(fromStage, toStage) {
  const fromIndex = getStageIndex(String(fromStage ?? "").trim());
  const toIndex = getStageIndex(String(toStage ?? "").trim());
  return fromIndex >= 0 && toIndex === fromIndex + 1;
}

function getJogressHistoryKey(recipe, participants = [], resultActor = null) {
  const recipeId = String(recipe?.id ?? recipe?.label ?? resultActor?.name ?? "jogress").trim();
  const componentKeys = participants
    .map((participant) => {
      return normalizeUuid(participant?.form?.reference) ||
        normalizeName(participant?.form?.name) ||
        normalizeUuid(participant?.partnerActor?.uuid);
    })
    .filter(Boolean)
    .sort()
    .join("+");
  return `${recipeId}::${componentKeys}`;
}

function canCurrentUserManageJogressParticipants(participants = []) {
  if (game.user?.isGM) return true;
  const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return participants.every((participant) => {
    return Boolean(
      participant?.tamer?.testUserPermission?.(game.user, ownerLevel) &&
      participant?.partnerActor?.testUserPermission?.(game.user, ownerLevel)
    );
  });
}

function buildJogressUnitId(historyKey = "") {
  const safe = String(historyKey || "jogress")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
  return `jogress:${safe || foundry.utils.randomID(12)}`;
}

function getMasteredJogressRecipes(tamerActor) {
  const mastered = tamerActor?.system?.specialEvolutions?.jogress?.masteredRecipes;
  return Array.isArray(mastered) ? mastered : [];
}

function hasMasteredJogressRecipe(tamerActor, historyKey) {
  return getMasteredJogressRecipes(tamerActor).some((entry) => typeof entry === "string" ? entry === historyKey : entry?.historyKey === historyKey);
}

async function markJogressRecipeMastered(participants = [], historyKey, data = {}) {
  if (!historyKey) return;

  const applied = [];
  try {
    for (const participant of participants) {
      const tamer = participant?.tamer;
      if (!tamer) continue;
      const previous = foundry.utils.deepClone(getMasteredJogressRecipes(tamer));
      const mastered = foundry.utils.deepClone(previous);
      const alreadyMastered = mastered.some((entry) => typeof entry === "string" ? entry === historyKey : entry?.historyKey === historyKey);
      if (alreadyMastered) continue;
      mastered.push({ historyKey, recipeId: data.recipeId ?? "", resultUuid: data.resultUuid ?? "", resultName: data.resultName ?? "", masteredAt: new Date().toISOString() });
      await tamer.update({ "system.specialEvolutions.jogress.masteredRecipes": mastered });
      applied.push({ tamer, previous });
    }
  } catch (error) {
    for (const entry of applied.reverse()) {
      try {
        await entry.tamer.update({
          "system.specialEvolutions.jogress.masteredRecipes": entry.previous
        });
      } catch (rollbackError) {
        console.error("DDA | Could not roll back partial Jogress mastery state.", entry.tamer, rollbackError);
      }
    }
    throw error;
  }
}

function buildJogressRuleData({ recipe, resultActor, mastered }) {
  const resultStage = resultActor?.system?.stage ?? recipe?.result?.stage ?? "adult";
  const resultStageValue = getStageValue(resultStage);
  return {
    resultStage,
    resultStageValue,
    mastered,
    // Jogress uses fixed official costs/checks. Recipes describe the
    // combination itself; they do not override the tabletop procedure.
    actionCostPerTamer: 2,
    peCostPerTamer: mastered ? Math.max(0, resultStageValue) : 0,
    checkTn: 15,
    checkFormula: "3d6 + @willpower"
  };
}

async function confirmJogressStart({ option, resultActor, ruleData, reversionPlan, interruptContext = {} }) {
  const participants = option.participants.map((participant) => {
    return `<li><strong>${escapeHtml(participant.form?.name ?? localize("DDA.Jogress.UnknownDigimon"))}</strong> — ${escapeHtml(participant.tamer?.name ?? localize("DDA.Jogress.UnknownTamer"))}</li>`;
  }).join("");

  const checkLabel = ruleData.mastered
    ? localize("DDA.Jogress.ReliableRepeat")
    : `3d6 + ${localize("DDA.TamerAttribute.Willpower")} / ${localize("DDA.Roll.TN")} ${ruleData.checkTn}`;

  const getReversionLabel = (plan) => {
    if (plan?.form?.name) return escapeHtml(plan.form.name);
    return `${escapeHtml(getStageLabel(plan?.revertStage ?? ""))} (${localize("DDA.Jogress.NotPrepared")})`;
  };

  const firstUseWarning = !ruleData.mastered
    ? `<p class="warning">${formatI18n("DDA.Jogress.FirstUseAutomaticRevert", {
        primary: getReversionLabel(reversionPlan.primary),
        secondary: getReversionLabel(reversionPlan.secondary)
      })}</p>${reversionPlan.hasMissing ? `<p class="muted">${localize("DDA.Jogress.MissingRevertIsWarning")}</p>` : ""}`
    : "";

  const interruptNotice = interruptContext?.interruptTamerName
    ? `<p><strong>${localize("DDA.Jogress.InterruptLabel")}:</strong> ${escapeHtml(interruptContext.interruptTamerName)}.</p>`
    : "";

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-jogress-confirm-dialog"],
    window: { title: localize("DDA.Jogress.ConfirmTitle") },
    content: `
      <div class="dda-roll-dialog dda-jogress-dialog">
        <p>${formatI18n("DDA.Jogress.ConfirmChange", {
          previous: `<strong>${escapeHtml(option.recipe.label || option.recipe.id)}</strong>`,
          next: `<strong>${escapeHtml(resultActor.name)}</strong>`
        })}</p>
        <ul>${participants}</ul>
        <hr>
        <p><strong>${localize("DDA.Jogress.Check")}:</strong> ${checkLabel}</p>
        <p><strong>${localize("DDA.Evolution.ActionCost")}:</strong> ${ruleData.actionCostPerTamer} ${localize("DDA.Jogress.PerTamer")}.</p>
        <p><strong>${localize("DDA.Resource.EvolutionPoints.Short")}:</strong> ${ruleData.peCostPerTamer} ${localize("DDA.Jogress.PerTamer")}.</p>
        ${interruptNotice}
        ${firstUseWarning}
        <p class="muted">${localize("DDA.Jogress.OfficialRulesHint")}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-link",
        default: true,
        callback: () => true
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => false
      }
    ],
    rejectClose: false,
    modal: true
  });

  return result === true;
}

async function confirmJogressEnd({ state, primaryTamer, secondaryTamer, primaryRevertForm, secondaryRevertForm, resultActor }) {
  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-jogress-end-dialog"],
    window: { title: localize("DDA.Jogress.EndTitle") },
    content: `
      <div class="dda-roll-dialog dda-jogress-dialog">
        <p>${formatI18n("DDA.Jogress.EndConfirm", {
          result: `<strong>${escapeHtml(state.resultName || resultActor?.name || localize("DDA.Jogress.UnknownResult"))}</strong>`
        })}</p>
        <ul>
          <li>${escapeHtml(primaryTamer.name)} → <strong>${escapeHtml(primaryRevertForm.name)}</strong></li>
          <li>${escapeHtml(secondaryTamer.name)} → <strong>${escapeHtml(secondaryRevertForm.name)}</strong></li>
        </ul>
        ${state.firstSuccessfulUse ? `<p class="warning">${localize("DDA.Jogress.FirstUseRevertHint")}</p>` : ""}
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-link-slash",
        default: false,
        callback: () => true
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        icon: "fa-solid fa-xmark",
        default: true,
        callback: () => false
      }
    ],
    rejectClose: false,
    modal: true
  });

  return result === true;
}

async function validateJogressRuleCosts({ participants, ruleData }) {
  const entries = [];
  for (const participant of participants) {
    const tamer = participant?.tamer;
    if (!tamer) continue;
    const availableActions = Number(tamer.system.combat?.actions?.value ?? 0);
    const availablePe = Number(tamer.system.resources?.evolutionPoints?.value ?? 0);
    if (availableActions < ruleData.actionCostPerTamer) {
      ui.notifications.warn(formatI18n("DDA.Warning.JogressNotEnoughActions", { tamer: tamer.name }));
      return null;
    }
    if (availablePe < ruleData.peCostPerTamer) {
      ui.notifications.warn(formatI18n("DDA.Warning.JogressNotEnoughEP", { tamer: tamer.name }));
      return null;
    }
    entries.push({
      tamer,
      actionCost: ruleData.actionCostPerTamer,
      peCost: ruleData.peCostPerTamer,
      previousActions: availableActions,
      previousPe: availablePe
    });
  }
  return {
    entries,
    totalPeCost: entries.reduce((total, entry) => total + entry.peCost, 0)
  };
}

async function payJogressRuleCosts(paymentData) {
  const paidEntries = [];

  try {
    for (const entry of paymentData?.entries ?? []) {
      await entry.tamer.update({
        "system.combat.actions.value": Math.max(0, entry.previousActions - entry.actionCost),
        "system.resources.evolutionPoints.value": Math.max(0, entry.previousPe - entry.peCost)
      });
      paidEntries.push(entry);
    }
  } catch (error) {
    for (const entry of paidEntries.reverse()) {
      try {
        await entry.tamer.update({
          "system.combat.actions.value": Math.max(0, Number(entry.previousActions ?? 0)),
          "system.resources.evolutionPoints.value": Math.max(0, Number(entry.previousPe ?? 0))
        });
      } catch (rollbackError) {
        console.error("DDA | Could not roll back a partial Jogress cost payment.", entry?.tamer, rollbackError);
      }
    }
    throw error;
  }
}

async function refundJogressRuleCosts(paymentData) {
  for (const entry of paymentData?.entries ?? []) {
    if (!entry?.tamer) continue;
    await entry.tamer.update({
      "system.combat.actions.value": Math.max(0, Number(entry.previousActions ?? 0)),
      "system.resources.evolutionPoints.value": Math.max(0, Number(entry.previousPe ?? 0))
    });
  }
}

async function rollJogressChecks(participants = [], { tn = 15, formula = "3d6 + @willpower" } = {}) {
  const results = [];
  for (const participant of participants) {
    const tamer = participant.tamer;
    const willpower = Number(tamer.system.attributes?.willpower?.value ?? 0);
    const roll = await new Roll(formula, { willpower }).evaluate({ async: true });
    if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);
    results.push({
      tamer,
      digimon: participant.partnerActor,
      roll,
      total: Number(roll.total ?? 0),
      tn,
      success: Number(roll.total ?? 0) >= tn
    });
  }
  return results;
}

async function createJogressCheckChatCard({ speakerActor, option, resultActor, checkResults, allPassed }) {
  const rows = checkResults.map((entry) => `<li><strong>${escapeHtml(entry.tamer?.name ?? localize("DDA.Jogress.UnknownTamer"))}</strong>: ${entry.roll.total} / ${entry.tn} — <strong>${entry.success ? localize("DDA.Check.Success") : localize("DDA.Check.Failure")}</strong></li>`).join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: speakerActor }),
    rolls: checkResults.map((entry) => entry.roll),
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-jogress-card"><h2>${localize("DDA.Jogress.CheckTitle")}</h2><p><strong>${escapeHtml(option.recipe.label || option.recipe.id)}</strong> → <strong>${escapeHtml(resultActor.name)}</strong></p><ul class="dda-effect-list dda-digivolution-list">${rows}</ul><p><strong>${allPassed ? localize("DDA.Jogress.CheckPassed") : localize("DDA.Jogress.CheckFailed")}</strong></p></div>`
  });
}

function getLowestJogressInitiative(participants = []) {
  const values = participants
    .map((participant) => {
      const tamerValue = Number(participant.tamer?.system?.combat?.initiative?.value ?? Number.NaN);
      const partnerValue = Number(participant.partnerActor?.system?.combat?.initiative?.value ?? Number.NaN);
      const finite = [tamerValue, partnerValue].filter(Number.isFinite);
      return finite.length ? Math.min(...finite) : Number.NaN;
    })
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : 0;
}

function getJogressComponentBonusProfile(participants = []) {
  const statKeys = ["accuracy", "damage", "dodge", "armor", "health"];
  const sharedStatBonus = Object.fromEntries(statKeys.map((key) => [key, 0]));
  const components = {};
  let total = 0;
  let requestedQuality = 0;

  for (const participant of participants) {
    const partnerActor = participant?.partnerActor;
    if (!partnerActor) continue;
    const allocation = getPartnerBonusDpAllocation(partnerActor);
    const componentTotal = Math.max(0, Number(allocation.total ?? 0));
    total += componentTotal;
    requestedQuality += Math.max(0, Number(allocation.qualityAllocated ?? 0));

    for (const key of statKeys) {
      sharedStatBonus[key] += Math.max(0, Math.floor(Number(allocation.sharedStatBonus?.[key] ?? 0)));
    }

    if (participant?.tamer?.uuid) {
      components[participant.tamer.uuid] = {
        total: componentTotal,
        sharedStatBonus: foundry.utils.deepClone(allocation.sharedStatBonus ?? {}),
        qualityAllocated: Math.max(0, Number(allocation.qualityAllocated ?? 0))
      };
    }
  }

  const statAllocated = statKeys.reduce((sum, key) => sum + sharedStatBonus[key], 0);
  const qualityAllocated = Math.min(
    Math.max(0, total - statAllocated),
    requestedQuality
  );

  return {
    total,
    sharedStatBonus,
    statAllocated,
    qualityAllocated,
    unallocated: Math.max(0, total - statAllocated - qualityAllocated),
    components
  };
}

function refreshPreparedJogressSnapshotBonusProfile(snapshot, profile = {}) {
  const refreshed = foundry.utils.deepClone(snapshot ?? {});
  if (!refreshed || typeof refreshed !== "object") return refreshed;

  const statKeys = ["accuracy", "damage", "dodge", "armor", "health"];
  const creation = refreshed.creation ??= {};
  const dp = creation.dp ??= {};
  const savedProfile = refreshed.wizard?.jogressPlan?.bonusDpProfile ?? {};
  const previousApplied = dp.sharedStatBonusApplied ?? savedProfile.sharedStatBonus ?? savedProfile.sharedStats ?? {};
  const currentSharedStats = profile.sharedStatBonus ?? profile.sharedStats ?? {};

  for (const key of statKeys) {
    const stat = refreshed.mainStats?.[key];
    if (!stat || typeof stat !== "object") continue;
    const previousBonus = Math.max(0, Math.floor(Number(previousApplied?.[key] ?? 0)));
    const currentBonus = Math.max(0, Math.floor(Number(currentSharedStats?.[key] ?? 0)));
    const currentBase = Number(stat.base ?? stat.value ?? stat.total ?? refreshed.stageValue ?? 1);
    if (!Number.isFinite(currentBase)) continue;
    const base = Math.max(1, Math.min(20, currentBase - previousBonus + currentBonus));
    const ordinaryBonus = Number(stat.bonus ?? 0);
    const qualityBonus = Number(stat.qualityBonus ?? 0);
    const total = Math.min(20, base + ordinaryBonus + qualityBonus);
    stat.base = base;
    stat.total = total;
    stat.value = total;
  }

  const currentTotal = Math.max(0, Number(profile.total ?? dp.bonus ?? 0));
  const currentStatAllocated = Math.max(0, Number(
    profile.statAllocated ??
    profile.sharedStatTotal ??
    statKeys.reduce((sum, key) => sum + Math.max(0, Number(currentSharedStats?.[key] ?? 0)), 0)
  ));
  const previousSpentBonusStats = Math.max(0, Number(dp.spentBonusStats ?? dp.sharedStatTotal ?? 0));
  const previousSpentTotal = Math.max(0, Number(dp.spentTotal ?? creation.spentDp ?? 0));
  const nextSpentTotal = Math.max(0, previousSpentTotal - previousSpentBonusStats + currentStatAllocated);
  const previousBonusTotal = Math.max(0, Number(
    dp.bonus ?? creation.bonusDp ?? savedProfile.total ?? 0
  ));
  const previousTotalDp = Math.max(0, Number(dp.total ?? creation.totalDp ?? 0));
  const localPool = Math.max(0, previousTotalDp - previousBonusTotal);
  const totalDp = localPool + currentTotal;
  const currentQualityBudget = Math.max(0, Number(profile.qualityAllocated ?? dp.sharedQualityAllocated ?? 0));

  dp.bonus = currentTotal;
  dp.spentBonusStats = currentStatAllocated;
  dp.spentTotal = nextSpentTotal;
  dp.total = totalDp;
  dp.remaining = Math.max(0, totalDp - nextSpentTotal);
  dp.sharedStatBonusApplied = foundry.utils.deepClone(currentSharedStats);
  dp.sharedStatTotal = currentStatAllocated;
  dp.sharedQualityAllocated = currentQualityBudget;
  dp.bonusUnallocated = Math.max(0, currentTotal - currentStatAllocated - currentQualityBudget);
  creation.bonusDp = currentTotal;
  creation.totalDp = totalDp;
  creation.spentDp = nextSpentTotal;
  creation.remainingDp = dp.remaining;

  refreshed.wizard ??= {};
  refreshed.wizard.jogressPlan ??= {};
  refreshed.wizard.jogressPlan.bonusDpProfile = {
    ...foundry.utils.deepClone(savedProfile),
    total: currentTotal,
    sharedStats: foundry.utils.deepClone(currentSharedStats),
    sharedStatBonus: foundry.utils.deepClone(currentSharedStats),
    sharedStatTotal: currentStatAllocated,
    statAllocated: currentStatAllocated,
    qualityAllocated: currentQualityBudget,
    unallocated: Math.max(0, currentTotal - currentStatAllocated - currentQualityBudget)
  };

  return refreshed;
}

function findPreparedJogressSnapshot(participants = [], recipe = {}, resultActor = null) {
  const recipeId = String(recipe?.id ?? recipe?.key ?? "").trim();
  const componentPartnerUuids = participants
    .map((participant) => String(participant?.partnerActor?.uuid ?? "").trim())
    .filter(Boolean)
    .sort();

  if (!recipeId || componentPartnerUuids.length !== 2) return null;

  const matches = [];

  for (const participant of participants) {
    const snapshots = Object.values(
      participant?.partnerActor?.system?.evolution?.formSnapshots ?? {}
    );

    for (const snapshot of snapshots) {
      const plan = snapshot?.wizard?.jogressPlan ?? {};
      if (String(plan.recipeId ?? "").trim() !== recipeId) continue;

      const plannedPartners = (Array.isArray(plan.componentPartnerUuids)
        ? plan.componentPartnerUuids
        : [plan.sourcePartnerUuid, plan.partnerPartnerUuid]
      )
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .sort();

      if (plannedPartners.length === 2 && plannedPartners.join("|") !== componentPartnerUuids.join("|")) {
        continue;
      }

      matches.push(snapshot);
    }
  }

  if (!matches.length) return null;
  matches.sort((left, right) => {
    const leftTime = Date.parse(left?.updatedAt ?? left?.wizard?.jogressPlan?.plannedAt ?? "") || 0;
    const rightTime = Date.parse(right?.updatedAt ?? right?.wizard?.jogressPlan?.plannedAt ?? "") || 0;
    return rightTime - leftTime;
  });
  return foundry.utils.deepClone(matches[0]);
}

async function applyJogressPreparedBudgetState(partnerActor, snapshot, currentProfile) {
  if (!partnerActor || !snapshot) return;

  const dp = snapshot.creation?.dp ?? {};
  const stage = String(snapshot.stage ?? partnerActor.system?.stage ?? "child");
  const currentBonusTotal = Math.max(0, Number(currentProfile?.total ?? dp.bonus ?? 0));
  const spentBonusStats = Math.max(0, Number(dp.spentBonusStats ?? dp.sharedStatTotal ?? 0));
  const spentBonusQualities = Math.max(0, Number(dp.spentBonusQualities ?? 0));
  const spentBonus = spentBonusStats + spentBonusQualities;
  const byStage = foundry.utils.deepClone(partnerActor.system?.advancement?.bonusDp?.byStage ?? {});

  byStage[stage] = {
    ...(byStage[stage] ?? {}),
    total: currentBonusTotal,
    spent: spentBonus,
    remaining: Math.max(0, currentBonusTotal - spentBonus),
    formCount: Math.max(1, Number(byStage[stage]?.formCount ?? 1))
  };

  const base = Math.max(0, Number(dp.base ?? 0));
  const negative = Math.max(0, Number(dp.negative ?? 0));
  const spentTotal = Math.max(0, Number(dp.spentTotal ?? 0));

  await partnerActor.update({
    "system.advancement.bonusDp.total": currentBonusTotal,
    "system.advancement.bonusDp.spentStats": spentBonusStats,
    "system.advancement.bonusDp.spentQualities": spentBonusQualities,
    "system.advancement.bonusDp.sharedSpent": spentBonus,
    "system.advancement.bonusDp.remaining": Math.max(0, currentBonusTotal - spentBonus),
    "system.advancement.bonusDp.byStage": byStage,
    "system.advancement.sharedStatBonus": foundry.utils.deepClone(dp.sharedStatBonusApplied ?? {}),
    "system.advancement.sharedQualityDp.allocated": Math.max(0, Number(dp.sharedQualityAllocated ?? spentBonusQualities)),
    "system.advancement.sharedQualityDp.spent": spentBonusQualities,
    "system.creation.dp.bonus": currentBonusTotal,
    "system.creation.dp.total": base + negative + currentBonusTotal,
    "system.creation.dp.remaining": Math.max(0, base + negative + currentBonusTotal - spentTotal),
    "system.creation.bonusDp": currentBonusTotal
  });
}

function captureJogressAdvancementState(partnerActor) {
  return {
    bonusDp: foundry.utils.deepClone(partnerActor?.system?.advancement?.bonusDp ?? {}),
    sharedStatBonus: foundry.utils.deepClone(partnerActor?.system?.advancement?.sharedStatBonus ?? {}),
    sharedQualityDp: foundry.utils.deepClone(partnerActor?.system?.advancement?.sharedQualityDp ?? {})
  };
}

async function restoreJogressAdvancementState(partnerActor, state = {}) {
  if (!partnerActor || !state || typeof state !== "object") return;
  await partnerActor.update({
    "system.advancement.bonusDp": foundry.utils.deepClone(state.bonusDp ?? {}),
    "system.advancement.sharedStatBonus": foundry.utils.deepClone(state.sharedStatBonus ?? {}),
    "system.advancement.sharedQualityDp": foundry.utils.deepClone(state.sharedQualityDp ?? {})
  });
}

async function applyJogressRuntimeBonusProfile(partnerActor, resultActor, profile) {
  if (!partnerActor || !resultActor || !profile) return;

  const statKeys = ["accuracy", "damage", "dodge", "armor", "health"];
  const templateApplied = resultActor.system?.creation?.dp?.sharedStatBonusApplied ??
    resultActor.system?.advancement?.sharedStatBonus ?? {};
  const updates = {};

  for (const key of statKeys) {
    const resultBase = Number(resultActor.system?.mainStats?.[key]?.base ?? resultActor.system?.stageValue ?? 1);
    const oldApplied = Math.max(0, Math.floor(Number(templateApplied?.[key] ?? 0)));
    const localBase = Math.max(1, resultBase - oldApplied);
    const combinedBonus = Math.max(0, Math.floor(Number(profile.sharedStatBonus?.[key] ?? 0)));
    updates[`system.mainStats.${key}.base`] = Math.min(20, localBase + combinedBonus);
  }

  const resultStage = String(resultActor.system?.stage ?? partnerActor.system?.stage ?? "child");
  const byStage = foundry.utils.deepClone(partnerActor.system?.advancement?.bonusDp?.byStage ?? {});
  byStage[resultStage] = {
    ...(byStage[resultStage] ?? {}),
    total: Math.max(0, Number(profile.total ?? 0)),
    spent: Math.max(0, Number(profile.statAllocated ?? 0) + Number(profile.qualityAllocated ?? 0)),
    remaining: Math.max(0, Number(profile.unallocated ?? 0)),
    formCount: Math.max(1, Number(byStage[resultStage]?.formCount ?? 1))
  };

  updates["system.advancement.bonusDp.total"] = Math.max(0, Number(profile.total ?? 0));
  updates["system.advancement.bonusDp.spentStats"] = Math.max(0, Number(profile.statAllocated ?? 0));
  updates["system.advancement.bonusDp.spentQualities"] = Math.max(0, Number(profile.qualityAllocated ?? 0));
  updates["system.advancement.bonusDp.sharedSpent"] = Math.max(0, Number(profile.statAllocated ?? 0) + Number(profile.qualityAllocated ?? 0));
  updates["system.advancement.bonusDp.remaining"] = Math.max(0, Number(profile.unallocated ?? 0));
  updates["system.advancement.bonusDp.byStage"] = byStage;
  updates["system.advancement.sharedStatBonus"] = foundry.utils.deepClone(profile.sharedStatBonus ?? {});
  updates["system.advancement.sharedQualityDp.allocated"] = Math.max(0, Number(profile.qualityAllocated ?? 0));
  updates["system.advancement.sharedQualityDp.spent"] = Math.max(0, Number(profile.qualityAllocated ?? 0));
  updates["system.creation.dp.bonus"] = Math.max(0, Number(profile.total ?? 0));
  updates["system.creation.dp.sharedStatBonusApplied"] = foundry.utils.deepClone(profile.sharedStatBonus ?? {});
  updates["system.creation.dp.sharedStatTotal"] = Math.max(0, Number(profile.statAllocated ?? 0));
  updates["system.creation.dp.sharedQualityAllocated"] = Math.max(0, Number(profile.qualityAllocated ?? 0));
  updates["system.creation.dp.bonusUnallocated"] = Math.max(0, Number(profile.unallocated ?? 0));
  updates["system.creation.bonusDp"] = Math.max(0, Number(profile.total ?? 0));

  await partnerActor.update(updates);
}

async function prepareJogressReversionPlan(participants = [], { mastered = false } = {}) {
  const plans = [];

  for (const participant of participants) {
    const tamer = participant?.tamer;
    const partnerActor = participant?.partnerActor;
    const currentForm = participant?.form;
    if (!tamer || !partnerActor || !currentForm) return null;

    if (mastered) {
      plans.push({
        participant,
        form: currentForm,
        revertStage: currentForm.stageKey,
        missing: false
      });
      continue;
    }

    const defaultStage = String(
      partnerActor.system?.evolution?.defaultStage || getDefaultStageFromRange(tamer)
    ).trim();
    const revertStage = getStageDirectlyBelow(defaultStage) || defaultStage;
    const revertActor = await findFormByStage(partnerActor, revertStage, null);
    let revertForm = null;

    if (revertActor && String(revertActor.system?.stage ?? "") === revertStage) {
      revertForm = await resolvePartnerFormDescriptor(
        partnerActor,
        revertActor.uuid,
        { fallbackActor: revertActor }
      );
    }

    const valid = Boolean(
      revertForm?.templateActor &&
      String(revertForm.stageKey ?? "") === revertStage
    );

    plans.push({
      participant,
      form: valid ? revertForm : null,
      revertStage,
      missing: !valid
    });
  }

  const primary = plans[0] ?? null;
  const secondary = plans[1] ?? null;
  return {
    primary,
    secondary,
    plans,
    hasMissing: plans.some((plan) => plan.missing)
  };
}

function orderJogressReversionPlan(reversionPlan = {}, primary = null, secondary = null) {
  const plans = Array.isArray(reversionPlan?.plans)
    ? reversionPlan.plans
    : [];

  const findFor = (participant) => {
    if (!participant) return null;
    const tamerUuid = String(participant?.tamer?.uuid ?? "");
    const partnerUuid = String(participant?.partnerActor?.uuid ?? "");

    return plans.find((plan) => {
      return Boolean(
        (tamerUuid && String(plan?.participant?.tamer?.uuid ?? "") === tamerUuid) ||
        (partnerUuid && String(plan?.participant?.partnerActor?.uuid ?? "") === partnerUuid)
      );
    }) ?? null;
  };

  const orderedPrimary = findFor(primary);
  const orderedSecondary = findFor(secondary);

  return {
    ...reversionPlan,
    primary: orderedPrimary,
    secondary: orderedSecondary,
    plans,
    hasMissing: plans.some((plan) => Boolean(plan?.missing)) || !orderedPrimary || !orderedSecondary
  };
}

async function resolveJogressReversionForm({
  partnerActor,
  preferredReference = "",
  desiredStage = "",
  fallbackReference = ""
} = {}) {
  if (!partnerActor) return { form: null, usedFallback: true };

  const wantedStage = String(desiredStage ?? "").trim();
  const preferred = String(preferredReference ?? "").trim();

  if (preferred) {
    const form = await resolvePartnerFormDescriptor(partnerActor, preferred);
    if (form?.templateActor && (!wantedStage || form.stageKey === wantedStage)) {
      return { form, usedFallback: false };
    }
  }

  if (wantedStage) {
    const stageActor = await findFormByStage(partnerActor, wantedStage, null);
    if (stageActor && String(stageActor.system?.stage ?? "") === wantedStage) {
      const form = await resolvePartnerFormDescriptor(
        partnerActor,
        stageActor.uuid,
        { fallbackActor: stageActor }
      );
      if (form?.templateActor && form.stageKey === wantedStage) {
        return { form, usedFallback: false };
      }
    }
  }

  const fallback = await resolvePartnerFormDescriptor(
    partnerActor,
    fallbackReference || partnerActor.uuid,
    { fallbackActor: partnerActor }
  );

  return {
    form: fallback,
    usedFallback: true
  };
}

function getJogressInitiativeFlag(combatant, key, fallback = null) {
  return foundry.utils.getProperty(
    combatant,
    `flags.${DDA_SYSTEM_ID}.initiative.${key}`
  ) ?? fallback;
}

function findJogressCombatant(combat, actor) {
  if (!combat || !actor) return null;
  const actorUuid = String(actor.uuid ?? "");
  const actorId = String(actor.id ?? "");
  return Array.from(combat.combatants ?? []).find((combatant) => {
    const candidate = combatant?.actor;
    return Boolean(
      candidate &&
      (String(candidate.uuid ?? "") === actorUuid || String(candidate.id ?? "") === actorId)
    );
  }) ?? null;
}

function getJogressInterruptContext(participants = [], combat = null) {
  if (!combat?.started) {
    return { allowed: true, actingTamerUuid: "", interruptTamerUuid: "", interruptTamerName: "" };
  }

  const activeCombatant = combat.combatant;
  if (!activeCombatant) return { allowed: false };

  const activeUnitId = String(getJogressInitiativeFlag(activeCombatant, "unitId", ""));
  const activeParticipant = participants.find((participant) => {
    const tamerCombatant = findJogressCombatant(combat, participant.tamer);
    const partnerCombatant = findJogressCombatant(combat, participant.partnerActor);
    if (!tamerCombatant || !partnerCombatant) return false;

    if (activeUnitId) {
      return [tamerCombatant, partnerCombatant].some((combatant) => {
        return String(getJogressInitiativeFlag(combatant, "unitId", "")) === activeUnitId;
      });
    }

    return [tamerCombatant.id, partnerCombatant.id].includes(activeCombatant.id);
  });

  if (!activeParticipant) return { allowed: false };

  const interruptParticipant = participants.find((participant) => {
    return participant?.tamer?.uuid !== activeParticipant?.tamer?.uuid;
  });

  if (!interruptParticipant?.tamer) return { allowed: false };

  return {
    allowed: true,
    actingTamerUuid: activeParticipant.tamer.uuid,
    interruptTamerUuid: interruptParticipant.tamer.uuid,
    interruptTamerName: interruptParticipant.tamer.name
  };
}

function captureJogressComponentTokenStates(partnerActor, combat = null) {
  if (!partnerActor) return [];

  const states = [];
  const seen = new Set();

  const capture = (tokenDocument) => {
    if (!tokenDocument?.id) return;
    const sceneId = String(tokenDocument.parent?.id ?? "");
    const tokenId = String(tokenDocument.id ?? "");
    if (!sceneId || !tokenId) return;
    const key = `${sceneId}.${tokenId}`;
    if (seen.has(key)) return;
    seen.add(key);
    states.push({
      sceneId,
      tokenId,
      hidden: Boolean(tokenDocument.hidden)
    });
  };

  if (combat?.started) {
    const combatant = findJogressCombatant(combat, partnerActor);
    capture(combatant?.token ?? null);
  }

  const activeScene = canvas?.scene ?? game?.scenes?.active ?? null;
  if (activeScene) {
    for (const tokenDocument of activeScene.tokens ?? []) {
      const tokenActorId = String(tokenDocument.actorId ?? "");
      const tokenActorUuid = String(tokenDocument.actor?.uuid ?? "");
      if (
        tokenActorUuid === String(partnerActor.uuid ?? "") ||
        (tokenActorId && tokenActorId === String(partnerActor.id ?? ""))
      ) {
        capture(tokenDocument);
      }
    }
  }

  return states;
}

async function hideJogressComponentTokens(tokenStates = [], marker = "") {
  if (!Array.isArray(tokenStates) || !tokenStates.length) return;

  for (const state of tokenStates) {
    const scene = game?.scenes?.get?.(state?.sceneId);
    const tokenDocument = scene?.tokens?.get?.(state?.tokenId);
    if (!tokenDocument) continue;

    await tokenDocument.update({
      hidden: true,
      [`flags.${DDA_SYSTEM_ID}.jogressHiddenMarker`]: String(marker ?? "")
    });
  }
}

async function restoreJogressComponentTokens(tokenStates = [], marker = "") {
  if (!Array.isArray(tokenStates) || !tokenStates.length) return;

  for (const state of tokenStates) {
    const scene = game?.scenes?.get?.(state?.sceneId);
    const tokenDocument = scene?.tokens?.get?.(state?.tokenId);
    if (!tokenDocument) continue;

    const storedMarker = String(
      tokenDocument.getFlag?.(DDA_SYSTEM_ID, "jogressHiddenMarker") ??
      foundry.utils.getProperty(
        tokenDocument,
        `flags.${DDA_SYSTEM_ID}.jogressHiddenMarker`
      ) ??
      ""
    );

    // Only undo visibility that this exact Jogress changed. If the GM has
    // deliberately changed the Token meanwhile, preserve that decision.
    if (storedMarker && storedMarker === String(marker ?? "")) {
      try {
        if (Boolean(tokenDocument.hidden)) {
          await tokenDocument.update({
            hidden: Boolean(state?.hidden)
          });
        }
        await tokenDocument.unsetFlag?.(DDA_SYSTEM_ID, "jogressHiddenMarker");
      } catch (error) {
        console.error("DDA | Could not restore a secondary Jogress component Token.", tokenDocument, error);
      }
    }
  }
}

function captureJogressCombatSnapshot(participants = [], combat = null) {
  if (!combat?.started) {
    return {
      combatId: "",
      round: 0,
      sharedInitiative: getLowestJogressInitiative(participants),
      sourceUnitIds: [],
      targetUnitId: "",
      order: [],
      combatants: {},
      valid: true
    };
  }

  const participantCombatants = [];
  const pairUnits = [];

  for (const participant of participants) {
    const tamerCombatant = findJogressCombatant(combat, participant.tamer);
    const partnerCombatant = findJogressCombatant(combat, participant.partnerActor);
    if (!tamerCombatant || !partnerCombatant) {
      return {
        combatId: combat.id,
        round: Number(combat.round ?? 0),
        sharedInitiative: getLowestJogressInitiative(participants),
        sourceUnitIds: [],
        targetUnitId: "",
        order: [],
        combatants: {},
        valid: false
      };
    }

    const unitId = String(
      getJogressInitiativeFlag(tamerCombatant, "unitId", "") ||
      getJogressInitiativeFlag(partnerCombatant, "unitId", "")
    );
    const raw = Number(
      getJogressInitiativeFlag(tamerCombatant, "raw", Number.NaN) ??
      getJogressInitiativeFlag(partnerCombatant, "raw", Number.NaN)
    );

    pairUnits.push({
      unitId,
      raw: Number.isFinite(raw)
        ? raw
        : Math.min(
            Number(participant.tamer.system?.combat?.initiative?.value ?? 0),
            Number(participant.partnerActor.system?.combat?.initiative?.value ?? 0)
          )
    });

    participantCombatants.push(
      { combatant: tamerCombatant, actor: participant.tamer },
      { combatant: partnerCombatant, actor: participant.partnerActor }
    );
  }

  const uniquePairUnits = pairUnits.filter((entry, index, array) => {
    return entry.unitId && array.findIndex((candidate) => candidate.unitId === entry.unitId) === index;
  });

  if (uniquePairUnits.length !== 2) {
    return {
      combatId: combat.id,
      round: Number(combat.round ?? 0),
      sharedInitiative: getLowestJogressInitiative(participants),
      sourceUnitIds: uniquePairUnits.map((entry) => entry.unitId),
      targetUnitId: "",
      order: [],
      combatants: {},
      valid: false
    };
  }

  const slowerUnit = [...uniquePairUnits].sort((left, right) => left.raw - right.raw)[0];
  const order = foundry.utils.deepClone(
    combat.getFlag?.(DDA_SYSTEM_ID, "initiative.order") ?? []
  );
  const combatants = {};

  for (const entry of participantCombatants) {
    const combatant = entry.combatant;
    combatants[entry.actor.uuid] = {
      combatantId: combatant.id,
      actorUuid: entry.actor.uuid,
      unitId: String(getJogressInitiativeFlag(combatant, "unitId", "")),
      role: String(getJogressInitiativeFlag(combatant, "role", "solo")),
      side: String(getJogressInitiativeFlag(combatant, "side", "")),
      raw: Number(getJogressInitiativeFlag(combatant, "raw", 0)),
      orderIndex: Number(getJogressInitiativeFlag(combatant, "orderIndex", 0)),
      endedRound: Number(getJogressInitiativeFlag(combatant, "endedRound", 0)),
      actorInitiative: Number(entry.actor.system?.combat?.initiative?.value ?? 0)
    };
  }

  return {
    combatId: combat.id,
    round: Number(combat.round ?? 0),
    sharedInitiative: Number(slowerUnit?.raw ?? getLowestJogressInitiative(participants)),
    sourceUnitIds: uniquePairUnits.map((entry) => entry.unitId),
    targetUnitId: String(slowerUnit?.unitId ?? ""),
    order,
    combatants,
    valid: true
  };
}

async function markJogressStateAcrossDocuments(state, patch = {}) {
  const nextState = {
    ...foundry.utils.deepClone(state ?? {}),
    ...foundry.utils.deepClone(patch ?? {})
  };
  const uuids = [
    nextState.primaryTamerUuid,
    nextState.secondaryTamerUuid,
    nextState.primaryDigimonUuid,
    nextState.secondaryDigimonUuid
  ].filter(Boolean);

  for (const uuid of new Set(uuids)) {
    const actor = await resolveActor(uuid);
    if (!actor) continue;
    const updates = {
      "system.specialEvolutions.jogress.state": nextState
    };
    if (actor.type === "digimon") {
      updates["system.specialEvolutions.jogress.active"] = Boolean(nextState.active);
    }
    await actor.update(updates);
  }

  return nextState;
}

export async function applyPendingJogressInitiativeForCombat(combat) {
  if (!game.user?.isGM || !combat?.started) return false;
  const round = Number(combat.round ?? 0);
  const seen = new Set();
  let changed = false;

  for (const actor of game.actors ?? []) {
    if (!actor || actor.type !== "character") continue;
    let state = actor.system?.specialEvolutions?.jogress?.state ?? {};
    if (!state.active || state.initiativeApplied) continue;

    // A Jogress may have been formed outside Combat. Once both original pairs
    // enter a started Combat, bind its saved state to that tracker and merge
    // the units immediately for the current round.
    if (!state.combatId) {
      const primaryTamer = await resolveActor(state.primaryTamerUuid);
      const secondaryTamer = await resolveActor(state.secondaryTamerUuid);
      const primaryPartner = await resolveActor(state.primaryDigimonUuid || state.runtimePartnerUuid);
      const secondaryPartner = await resolveActor(state.secondaryDigimonUuid);
      if (!primaryTamer || !secondaryTamer || !primaryPartner || !secondaryPartner) continue;

      const snapshot = captureJogressCombatSnapshot([
        { tamer: primaryTamer, partnerActor: primaryPartner },
        { tamer: secondaryTamer, partnerActor: secondaryPartner }
      ], combat);
      if (!snapshot.valid) continue;

      state = await markJogressStateAcrossDocuments(state, {
        combatId: combat.id,
        combatSnapshot: snapshot,
        sharedInitiative: snapshot.sharedInitiative,
        pendingInitiativeRound: Math.max(1, round),
        initiativeUnitId: state.initiativeUnitId || buildJogressUnitId(state.historyKey)
      });
    }

    if (String(state.combatId) !== String(combat.id)) continue;
    if (round < Math.max(1, Number(state.pendingInitiativeRound ?? 0))) continue;

    const key = String(state.historyKey || state.initiativeUnitId || state.primaryTamerUuid);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const applied = await applyJogressCombatUnitState(combat, state);
    if (!applied) continue;
    await markJogressStateAcrossDocuments(state, { initiativeApplied: true });
    changed = true;
  }

  return changed;
}

async function applyJogressCombatUnitState(combat, state) {
  const primaryTamer = await resolveActor(state.primaryTamerUuid);
  const secondaryTamer = await resolveActor(state.secondaryTamerUuid);
  const primaryPartner = await resolveActor(state.primaryDigimonUuid || state.runtimePartnerUuid);
  const secondaryPartner = await resolveActor(state.secondaryDigimonUuid);
  if (!primaryTamer || !secondaryTamer || !primaryPartner || !secondaryPartner) return false;

  const primaryTamerCombatant = findJogressCombatant(combat, primaryTamer);
  const secondaryTamerCombatant = findJogressCombatant(combat, secondaryTamer);
  const primaryPartnerCombatant = findJogressCombatant(combat, primaryPartner);
  const secondaryPartnerCombatant = findJogressCombatant(combat, secondaryPartner);
  if (!primaryTamerCombatant || !secondaryTamerCombatant || !primaryPartnerCombatant || !secondaryPartnerCombatant) return false;

  const sourceUnitIds = new Set((state.combatSnapshot?.sourceUnitIds ?? []).map(String));
  const targetUnitId = String(state.combatSnapshot?.targetUnitId ?? "");
  const jogressUnitId = String(state.initiativeUnitId || buildJogressUnitId(state.historyKey));
  const sharedRaw = Number(state.sharedInitiative ?? 0);
  const currentOrder = foundry.utils.deepClone(
    combat.getFlag?.(DDA_SYSTEM_ID, "initiative.order") ?? state.combatSnapshot?.order ?? []
  );
  const targetEntry = currentOrder.find((entry) => String(entry?.id ?? "") === targetUnitId) ?? {};
  const side = String(targetEntry.side ?? getJogressInitiativeFlag(primaryTamerCombatant, "side", "players"));
  const newOrder = [];
  let inserted = false;

  for (const entry of currentOrder) {
    const id = String(entry?.id ?? "");
    if (sourceUnitIds.has(id)) {
      if (!inserted && id === targetUnitId) {
        newOrder.push({
          id: jogressUnitId,
          side,
          raw: sharedRaw,
          members: [
            primaryPartnerCombatant.id,
            primaryTamerCombatant.id,
            secondaryTamerCombatant.id,
            secondaryPartnerCombatant.id
          ]
        });
        inserted = true;
      }
      continue;
    }
    newOrder.push(entry);
  }

  if (!inserted) {
    newOrder.push({
      id: jogressUnitId,
      side,
      raw: sharedRaw,
      members: [
        primaryPartnerCombatant.id,
        primaryTamerCombatant.id,
        secondaryTamerCombatant.id,
        secondaryPartnerCombatant.id
      ]
    });
  }

  const roleByCombatantId = new Map([
    [primaryPartnerCombatant.id, "digimon"],
    [primaryTamerCombatant.id, "tamer"],
    [secondaryTamerCombatant.id, "tamer"],
    [secondaryPartnerCombatant.id, "suspended"]
  ]);
  const orderIndexByUnitId = new Map(newOrder.map((entry, index) => [String(entry.id), index]));
  const updates = [];

  for (const combatant of combat.combatants ?? []) {
    const currentUnitId = String(getJogressInitiativeFlag(combatant, "unitId", ""));
    const isJogressMember = roleByCombatantId.has(combatant.id);
    const nextUnitId = isJogressMember ? jogressUnitId : currentUnitId;
    const nextOrderIndex = orderIndexByUnitId.get(nextUnitId);
    if (!Number.isFinite(nextOrderIndex)) continue;

    const update = {
      _id: combatant.id,
      [`flags.${DDA_SYSTEM_ID}.initiative.orderIndex`]: nextOrderIndex
    };

    if (isJogressMember) {
      update[`flags.${DDA_SYSTEM_ID}.initiative.unitId`] = jogressUnitId;
      update[`flags.${DDA_SYSTEM_ID}.initiative.role`] = roleByCombatantId.get(combatant.id);
      update[`flags.${DDA_SYSTEM_ID}.initiative.side`] = side;
      update[`flags.${DDA_SYSTEM_ID}.initiative.raw`] = sharedRaw;
    }

    updates.push(update);
  }

  const activeCombatantId = combat.combatant?.id ?? "";
  if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  combat.setupTurns();

  const activeTurn = activeCombatantId
    ? (combat.turns ?? []).findIndex((combatant) => combatant.id === activeCombatantId)
    : Number(combat.turn ?? 0);

  await combat.update({
    ...(activeTurn >= 0 ? { turn: activeTurn } : {}),
    [`flags.${DDA_SYSTEM_ID}.initiative.order`]: newOrder
  }, { ddaJogressSync: true });

  for (const actor of [primaryTamer, secondaryTamer, primaryPartner]) {
    await actor.update({ "system.combat.initiative.value": sharedRaw });
  }

  // The second physical Partner remains part of the Jogress entity but must
  // never regain an independent action pool when a new Combat initializes.
  await secondaryPartner.update({ "system.combat.actions.value": 0 });

  return true;
}

async function restoreJogressCombatSnapshot(state = {}, combatOverride = null) {
  if (!state?.initiativeApplied || !state?.combatId) return;
  const combat = combatOverride ?? game.combats?.get?.(state.combatId) ?? (game.combat?.id === state.combatId ? game.combat : null);
  if (!combat) return;

  const snapshot = state.combatSnapshot ?? {};
  const storedCombatants = snapshot.combatants ?? {};
  const updates = [];
  const currentRound = Number(combat.round ?? 0);

  for (const stored of Object.values(storedCombatants)) {
    const combatant = combat.combatants?.get(stored.combatantId);
    if (!combatant) continue;
    updates.push({
      _id: combatant.id,
      [`flags.${DDA_SYSTEM_ID}.initiative.unitId`]: stored.unitId,
      [`flags.${DDA_SYSTEM_ID}.initiative.role`]: stored.role,
      [`flags.${DDA_SYSTEM_ID}.initiative.side`]: stored.side,
      [`flags.${DDA_SYSTEM_ID}.initiative.raw`]: stored.raw,
      [`flags.${DDA_SYSTEM_ID}.initiative.orderIndex`]: stored.orderIndex,
      [`flags.${DDA_SYSTEM_ID}.initiative.endedRound`]: combat.started ? currentRound : stored.endedRound
    });

    const actor = await resolveActor(stored.actorUuid);
    if (actor) {
      await actor.update({
        "system.combat.initiative.value": Number(stored.actorInitiative ?? 0)
      });
    }
  }

  if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  const activeCombatantId = combat.combatant?.id ?? "";
  combat.setupTurns();
  const activeTurn = activeCombatantId
    ? (combat.turns ?? []).findIndex((combatant) => combatant.id === activeCombatantId)
    : Number(combat.turn ?? 0);

  await combat.update({
    ...(activeTurn >= 0 ? { turn: activeTurn } : {}),
    [`flags.${DDA_SYSTEM_ID}.initiative.order`]: foundry.utils.deepClone(snapshot.order ?? [])
  }, { ddaJogressSync: true });
}

async function restoreJogressActorInitiatives(state = {}) {
  const storedCombatants = state?.combatSnapshot?.combatants ?? {};
  for (const stored of Object.values(storedCombatants)) {
    const actor = await resolveActor(stored?.actorUuid);
    if (!actor) continue;
    await actor.update({
      "system.combat.initiative.value": Number(stored.actorInitiative ?? 0)
    });
  }
}

async function detachActiveJogressFromCombat(combat, { restoreTracker = true } = {}) {
  if (!combat || !isPrimaryActiveGmForEvolutionLifecycle()) return;

  const combatId = String(combat.id ?? "");
  const seen = new Set();

  for (const actor of game?.actors ?? []) {
    if (actor?.type !== "character") continue;
    const state = foundry.utils.deepClone(actor.system?.specialEvolutions?.jogress?.state ?? {});
    if (!state.active || String(state.combatId ?? "") !== combatId) continue;

    const key = String(state.historyKey || state.initiativeUnitId || state.primaryTamerUuid || actor.uuid);
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      if (state.initiativeApplied && restoreTracker) {
        await restoreJogressCombatSnapshot(state, combat);
      } else if (state.initiativeApplied) {
        await restoreJogressActorInitiatives(state);
      }

      await markJogressStateAcrossDocuments(state, {
        combatId: "",
        pendingInitiativeRound: 0,
        initiativeApplied: false,
        combatSnapshot: {}
      });
    } catch (error) {
      console.error("DDA | Could not detach active Jogress from ended Combat.", actor, error);
    }
  }
}

async function rollbackJogressActivation({ primary, secondary, jogressState, paymentData }) {
  const clearState = getEmptyJogressState();
  const primaryPartner = primary?.partnerActor;
  const secondaryPartner = secondary?.partnerActor;

  try {
    if (primaryPartner) {
      const originalForm = await resolvePartnerFormDescriptor(
        primaryPartner,
        jogressState.primaryFormUuid,
        { fallbackActor: primaryPartner }
      );
      if (originalForm?.templateActor) {
        await applyPersistentPartnerSpecialForm({
          tamerActor: primary.tamer,
          partnerActor: primaryPartner,
          form: originalForm,
          previousFormActor: primaryPartner,
          transitionType: "jogressRollback",
          healOnEvolution: false
        });
      }
      await restoreJogressAdvancementState(primaryPartner, jogressState.primaryAdvancementState);
      await primaryPartner.update({
        ownership: foundry.utils.deepClone(jogressState.primaryOwnership ?? primaryPartner.ownership ?? {}),
        "system.specialEvolutions.jogress.active": false,
        "system.specialEvolutions.jogress.componentBonusDp": 0,
        "system.specialEvolutions.jogress.state": clearState
      });
    }

    if (secondaryPartner) {
      await secondaryPartner.update({
        "system.combat.actions.value": Math.max(0, Number(jogressState.secondaryActionsValue ?? secondaryPartner.system?.combat?.actions?.value ?? 0)),
        "system.combat.actions.max": Math.max(0, Number(jogressState.secondaryActionsMax ?? secondaryPartner.system?.combat?.actions?.max ?? 2)),
        "system.specialEvolutions.jogress.active": false,
        "system.specialEvolutions.jogress.state": clearState
      });
    }

    await restoreJogressComponentTokens(
      jogressState?.secondaryTokenStates,
      jogressState?.tokenHideMarker
    );

    if (primary?.tamer && primaryPartner) {
      await updateTamerPartnerFormMirror(primary.tamer, primaryPartner);
      await primary.tamer.update({ "system.specialEvolutions.jogress.state": clearState });
    }
    if (secondary?.tamer && secondaryPartner) {
      await updateTamerPartnerFormMirror(secondary.tamer, secondaryPartner);
      await secondary.tamer.update({ "system.specialEvolutions.jogress.state": clearState });
    }
  } finally {
    await refundJogressRuleCosts(paymentData);
  }
}

async function applyJogressResultOwnership(resultActor, participants = []) {
  if (!resultActor || !Array.isArray(participants) || !participants.length) return;
  const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  const nextOwnership = foundry.utils.deepClone(resultActor.ownership ?? {});
  for (const participant of participants) {
    const tamer = participant?.tamer;
    if (!tamer) continue;
    for (const userId of getActorOwnerUserIds(tamer)) nextOwnership[userId] = ownerLevel;
  }
  if (JSON.stringify(nextOwnership) !== JSON.stringify(resultActor.ownership ?? {})) await resultActor.update({ ownership: nextOwnership });
}

function getActorOwnerUserIds(actor) {
  if (!actor) return [];
  const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  const userIds = new Set();
  for (const [userId, level] of Object.entries(actor.ownership ?? {})) {
    if (userId !== "default" && Number(level ?? 0) >= ownerLevel) userIds.add(userId);
  }
  for (const user of game.users ?? []) {
    if (!user?.isGM && user.character?.uuid === actor.uuid) userIds.add(user.id);
  }
  return Array.from(userIds);
}



function getEmptyHybridState() {
  return {
    active: false,
    method: "",
    recipeId: "",
    resultUuid: "",
    resultName: "",
    resultStage: "",
    equivalentStage: "",
    tamerUuid: "",
    tamerName: "",
    sourceDigimonUuid: "",
    sourceDigimonName: "",
    partnerUuid: "",
    partnerName: "",
    previousFormUuid: "",
    previousFormName: "",
    hadPartner: false,
    partnerRequirement: "none",
    partnerAvailability: "unchanged",
    partnerIsMerged: false,
    resultIsPartnerCurrentForm: false,
    startedAt: "",
    actionsMax: 3,
    directAllyPenaltyReduction: 1
  };
}

function isTamerInActiveHybrid(tamerActor) {
  return Boolean(tamerActor?.system?.specialEvolutions?.hybrid?.state?.active);
}

function normalizeHybridMethod(method = "") {
  const normalized = normalizeName(method).replace(/[\s_\-:()]+/g, "");
  if (normalized === "biomerge" || normalized === "biomergeevolution" || normalized === "matrixevolution") return "biomerge";
  if (normalized === "mindlink" || normalized === "mindlinkevolution") return "mindLink";
  return "hybrid";
}

function normalizeHybridPartnerRequirement(value = "none") {
  const normalized = normalizeName(value).replace(/[\s_\-:()]+/g, "");
  if (["required", "require", "yes", "true", "partner", "requirespartner"].includes(normalized)) return "required";
  return "none";
}

function normalizeHybridPartnerAvailability(value = "unchanged") {
  const normalized = normalizeName(value).replace(/[\s_\-:()]+/g, "");
  if (["merged", "fused", "absorbed", "unavailable"].includes(normalized)) return "merged";
  if (["separate", "requiredseparate"].includes(normalized)) return "separate";
  return "unchanged";
}

function getHybridMethodLabel(method = "") {
  const labels = {
    hybrid: "DDA.Hybrid.Method.Hybrid",
    biomerge: "DDA.Hybrid.Method.BioMerge",
    mindLink: "DDA.Hybrid.Method.MindLink"
  };
  return localize(labels[normalizeHybridMethod(method)] ?? labels.hybrid);
}

function getHybridPartnerAvailabilityLabel(value = "unchanged") {
  const labels = {
    unchanged: "DDA.Hybrid.PartnerAvailability.Unchanged",
    separate: "DDA.Hybrid.PartnerAvailability.Separate",
    merged: "DDA.Hybrid.PartnerAvailability.Merged"
  };
  const key = normalizeHybridPartnerAvailability(value);
  return localize(labels[key] ?? labels.unchanged);
}

function getHybridMatchKeys(entity = {}) {
  const values = [];

  if (typeof entity === "string") values.push(entity);
  else {
    values.push(entity.name, entity.species, entity.label, entity.id);
    if (Array.isArray(entity.aliases)) values.push(...entity.aliases);
    if (Array.isArray(entity.result?.aliases)) values.push(...entity.result.aliases);
  }

  return [...new Set(values.map((value) => normalizeName(value)).filter(Boolean))];
}

function getHybridActorMatchKeys(actor) {
  return getHybridMatchKeys({
    name: actor?.name ?? "",
    species: actor?.system?.species ?? "",
    aliases: actor?.system?.aliases ?? actor?.system?.specialForm?.aliases ?? []
  });
}

function hybridKeysIntersect(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((key) => rightSet.has(key));
}

async function collectAvailableHybridOptions(tamerActor, currentFormActor = null, requestedMethod = "hybrid", partnerActor = null) {
  const methodFilter = normalizeHybridMethod(requestedMethod);

  if (methodFilter === "biomerge") {
    return collectBioMergeGraphOptions(tamerActor, currentFormActor, partnerActor);
  }

  const recipes = collectHybridRecipes(tamerActor)
    .filter((recipe) => !recipe.hidden)
    .filter((recipe) => normalizeHybridMethod(recipe.method) === methodFilter);
  const options = [];

  for (const recipe of recipes) {
    const method = normalizeHybridMethod(recipe.method);
    const partnerRequirement = normalizeHybridPartnerRequirement(recipe.partnerRequirement ?? (recipe.requiresPartner ? "required" : "none"));
    const partnerAvailability = normalizeHybridPartnerAvailability(recipe.partnerAvailability ?? (method === "biomerge" ? "merged" : "unchanged"));
    const componentKeys = getHybridMatchKeys(recipe.component ?? {});
    const componentIsSpecific = componentKeys.length > 0;

    if (partnerRequirement === "required" && !currentFormActor) continue;
    if (componentIsSpecific && !matchesHybridComponent(recipe.component, currentFormActor)) continue;

    const resultActor = await resolveHybridResultActor(recipe);
    if (!resultActor) continue;

    options.push({
      recipe: { ...recipe, method, partnerRequirement, partnerAvailability },
      resultActor,
      currentFormActor
    });
  }

  return options;
}

async function collectBioMergeGraphOptions(tamerActor, currentFormActor = null, partnerActor = null) {
  if (!tamerActor || !currentFormActor) return [];

  const graphSource = partnerActor ?? currentFormActor;
  const graph = getNormalizedEvolutionGraph(graphSource);
  const currentNode = graph.nodes.find((node) => node.actorUuid === currentFormActor.uuid)
    ?? graph.nodes.find((node) => node.actorUuid === graphSource.uuid);

  if (!currentNode) return [];

  const options = [];

  for (const edge of graph.edges ?? []) {
    if (edge.from !== currentNode.id) continue;
    if (normalizeHybridMethod(edge.method) !== "biomerge") continue;

    const targetNode = graph.nodes.find((node) => node.id === edge.to);
    if (!targetNode?.actorUuid) continue;

    const resultActor = await resolveActor(targetNode.actorUuid);
    if (!resultActor || resultActor.type !== "digimon") continue;

    const recipe = {
      id: edge.id || `biomerge_${currentNode.id}_${targetNode.id}`,
      label: edge.label || `${currentFormActor.name} → ${resultActor.name}`,
      method: "biomerge",
      result: {
        name: resultActor.name,
        species: resultActor.system?.species ?? resultActor.name,
        uuid: resultActor.uuid,
        aliases: []
      },
      component: {
        name: currentFormActor.name,
        species: currentFormActor.system?.species ?? currentFormActor.name,
        aliases: []
      },
      equivalentStage: resultActor.system?.stage ?? targetNode.stage ?? "ultimate",
      requiresPartner: true,
      partnerRequirement: "required",
      partnerAvailability: "merged",
      temporary: true,
      hidden: false,
      source: "graph",
      edgeId: edge.id,
      graphActorUuid: graphSource.uuid
    };

    options.push({
      recipe,
      resultActor,
      currentFormActor
    });
  }

  return options;
}

function collectHybridRecipes(tamerActor) {
  const configRecipes = Array.isArray(CONFIG.DDA?.hybridRecipes) ? CONFIG.DDA.hybridRecipes : [];
  const actorRecipes = Array.isArray(tamerActor?.system?.specialEvolutions?.hybrid?.forms)
    ? tamerActor.system.specialEvolutions.hybrid.forms
    : [];

  return [...configRecipes, ...actorRecipes].map((recipe, index) => {
    const method = normalizeHybridMethod(recipe.method ?? "hybrid");
    const partnerRequirement = normalizeHybridPartnerRequirement(recipe.partnerRequirement ?? (recipe.requiresPartner ? "required" : "none"));
    const partnerAvailability = normalizeHybridPartnerAvailability(recipe.partnerAvailability ?? (method === "biomerge" ? "merged" : "unchanged"));

    return {
      id: recipe.id || `hybrid_${index}`,
      label: recipe.label || recipe.name || recipe.result?.name || localize("DDA.Hybrid.UnknownForm"),
      method,
      result: recipe.result ?? {
        name: recipe.resultName ?? recipe.name ?? "",
        species: recipe.resultSpecies ?? recipe.species ?? "",
        uuid: recipe.resultUuid ?? recipe.uuid ?? "",
        aliases: recipe.aliases ?? []
      },
      component: recipe.component ?? {
        name: recipe.componentName ?? "",
        species: recipe.componentSpecies ?? "",
        aliases: recipe.componentAliases ?? []
      },
      equivalentStage: recipe.equivalentStage ?? recipe.stage ?? "adult",
      requiresPartner: partnerRequirement === "required",
      partnerRequirement,
      partnerAvailability,
      temporary: recipe.temporary ?? true,
      hidden: recipe.hidden ?? false
    };
  });
}

function matchesHybridComponent(component = {}, currentFormActor) {
  const expectedKeys = getHybridMatchKeys(component);
  if (!expectedKeys.length) return true;
  if (!currentFormActor) return false;

  return hybridKeysIntersect(expectedKeys, getHybridActorMatchKeys(currentFormActor));
}

async function resolveHybridResultActor(recipe = {}) {
  const result = recipe.result ?? {};
  const byUuid = await resolveActor(result.uuid);
  if (byUuid) return byUuid;

  const expectedKeys = getHybridMatchKeys({
    name: result.name ?? recipe.label ?? "",
    species: result.species ?? result.name ?? recipe.label ?? "",
    aliases: result.aliases ?? recipe.aliases ?? []
  });

  if (!expectedKeys.length) return null;

  const candidates = Array.from(game.actors ?? [])
    .filter((actor) => actor.type === "digimon")
    .map((actor) => {
      const actorKeys = getHybridActorMatchKeys(actor);
      if (!hybridKeysIntersect(expectedKeys, actorKeys)) return null;

      const actorName = normalizeName(actor.name);
      const actorSpecies = normalizeName(actor.system?.species ?? "");
      const primaryName = normalizeName(result.name ?? recipe.label ?? "");
      const primarySpecies = normalizeName(result.species ?? result.name ?? recipe.label ?? "");
      const folderName = normalizeName(actor.folder?.name ?? "");
      const stage = normalizeName(actor.system?.stage ?? "");
      const specialKind = normalizeName(actor.system?.specialForm?.kind ?? "");

      let score = 0;
      if (actor.type === "digimon") score += 100;
      if (stage === "hybrid") score += 80;
      if (folderName === "hybrid") score += 70;
      if (specialKind === "hybrid") score += 60;
      if (primaryName && actorName === primaryName) score += 40;
      if (primarySpecies && actorSpecies === primarySpecies) score += 35;
      if (expectedKeys.includes(actorName)) score += 25;
      if (expectedKeys.includes(actorSpecies)) score += 20;

      return { actor, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.actor.name.localeCompare(b.actor.name, game.i18n.lang));

  return candidates[0]?.actor ?? null;
}

async function chooseHybridOption(options, tamerActor, currentFormActor = null) {
  if (!options.length) return null;
  if (options.length === 1) return options[0];

  const optionRows = options.map((option, index) => `
    <option value="${index}">
      ${escapeHtml(getHybridMethodLabel(option.recipe.method))}: ${escapeHtml(option.recipe.label)} → ${escapeHtml(option.resultActor.name)} (${escapeHtml(getHybridPartnerAvailabilityLabel(option.recipe.partnerAvailability))})
    </option>
  `).join("");

  const content = `
    <div class="dda-roll-dialog dda-hybrid-dialog">
      <p>${formatI18n("DDA.Hybrid.ChooseHint", {
        tamer: `<strong>${escapeHtml(tamerActor.name)}</strong>`,
        partner: `<strong>${escapeHtml(currentFormActor?.name ?? localize("DDA.Hybrid.NoPartnerRequired"))}</strong>`
      })}</p>

      <div class="form-group">
        <label>${localize("DDA.Hybrid.Form")}</label>
        <select name="optionIndex">${optionRows}</select>
      </div>
    </div>
  `;

  const choice = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-hybrid-choice-dialog"],
    window: { title: localize("DDA.Hybrid.DialogTitle") },
    content,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => Number(button.form?.elements?.optionIndex?.value ?? 0)
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });

  if (choice === null || choice === false || !Number.isInteger(choice)) return null;
  return options[choice] ?? null;
}

async function confirmHybridStart({ option, tamerActor, currentFormActor = null, resultActor }) {
  const methodLabel = getHybridMethodLabel(option.recipe.method);
  const partnerAvailabilityLabel = getHybridPartnerAvailabilityLabel(option.recipe.partnerAvailability);
  const sourceLine = currentFormActor && option.recipe.partnerRequirement === "required"
    ? `<li>${localize("DDA.Hybrid.SourceDigimon")}: <strong>${escapeHtml(currentFormActor.name)}</strong>.</li>`
    : `<li>${localize("DDA.Hybrid.NoPartnerRequired")}.</li>`;

  const content = `
    <div class="dda-roll-dialog dda-hybrid-dialog">
      <p>${formatI18n("DDA.Hybrid.ConfirmChange", {
        tamer: `<strong>${escapeHtml(tamerActor.name)}</strong>`,
        next: `<strong>${escapeHtml(resultActor.name)}</strong>`
      })}</p>
      <ul>
        <li>${localize("DDA.Label.Type")}: <strong>${escapeHtml(methodLabel)}</strong>.</li>
        ${sourceLine}
        <li>${localize("DDA.Hybrid.PartnerAvailability.Label")}: <strong>${escapeHtml(partnerAvailabilityLabel)}</strong>.</li>
        <li>${localize("DDA.Hybrid.ResultActions")}: <strong>3</strong>.</li>
        <li>${localize("DDA.Hybrid.EquivalentStage")}: <strong>${escapeHtml(getStageLabel(option.recipe.equivalentStage || resultActor.system?.stage))}</strong>.</li>
      </ul>
      <p class="muted">${localize("DDA.Hybrid.RuleHint")}</p>
    </div>
  `;

  return foundry.applications.api.DialogV2.confirm({
    window: { title: localize("DDA.Hybrid.ConfirmTitle") },
    content,
    yes: { default: true },
    rejectClose: false,
    modal: true
  });
}

async function applyHybridResultOwnership(resultActor, tamerActor) {
  if (!resultActor || !tamerActor) return;
  const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  const nextOwnership = foundry.utils.deepClone(resultActor.ownership ?? {});
  for (const userId of getActorOwnerUserIds(tamerActor)) nextOwnership[userId] = ownerLevel;
  if (JSON.stringify(nextOwnership) !== JSON.stringify(resultActor.ownership ?? {})) await resultActor.update({ ownership: nextOwnership });
}

function renderHybridStartCard({ tamerActor, currentFormActor = null, resultActor, state }) {
  const partnerLine = state.partnerAvailability === "merged" && currentFormActor
    ? `<li>${localize("DDA.Hybrid.SourceDigimon")}: <strong>${escapeHtml(currentFormActor.name)}</strong> (${escapeHtml(getHybridPartnerAvailabilityLabel(state.partnerAvailability))}).</li>`
    : `<li>${localize("DDA.Hybrid.PartnerAvailability.Label")}: <strong>${escapeHtml(getHybridPartnerAvailabilityLabel(state.partnerAvailability))}</strong>.</li>`;

  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-digivolution-card dda-hybrid-card">
      <h2>${localize("DDA.Hybrid.Title")}</h2>
      <div class="dda-digivolution-hero">
        <div class="dda-digivolution-form previous">
          <span class="dda-digivolution-label">${localize("DDA.Actor.Tamer")}</span>
          <strong>${escapeHtml(tamerActor.name)}</strong>
          <small>${currentFormActor ? escapeHtml(currentFormActor.name) : localize("DDA.Hybrid.NoPartnerRequired")}</small>
        </div>
        <div class="dda-digivolution-arrow">→</div>
        <div class="dda-digivolution-form next">
          <span class="dda-digivolution-label">${escapeHtml(getHybridMethodLabel(state.method))}</span>
          <strong>${escapeHtml(resultActor.name)}</strong>
          <small>${escapeHtml(getStageLabel(state.equivalentStage || resultActor.system?.stage))}</small>
        </div>
      </div>
      <ul class="dda-effect-list dda-digivolution-list">
        ${partnerLine}
        <li>${localize("DDA.Hybrid.ResultActions")}: <strong>3</strong>.</li>
        <li>${localize("DDA.Hybrid.SkillRule")}</li>
        <li>${localize("DDA.Hybrid.DirectRule")}</li>
      </ul>
    </div>
  `;
}

function renderHybridEndCard({ tamerActor, resultActor, previousFormActor = null, state }) {
  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-digivolution-card dda-hybrid-card">
      <h2>${localize("DDA.Hybrid.EndTitle")}</h2>
      <ul class="dda-effect-list dda-digivolution-list">
        <li>${escapeHtml(state.resultName || resultActor?.name || localize("DDA.Hybrid.UnknownResult"))} ${localize("DDA.Hybrid.HasSeparated")}.</li>
        <li>${localize("DDA.Actor.Tamer")}: <strong>${escapeHtml(tamerActor.name)}</strong>.</li>
        <li>${localize("DDA.Hybrid.PartnerAvailability.Label")}: <strong>${escapeHtml(getHybridPartnerAvailabilityLabel(state.partnerAvailability))}</strong>.</li>
        ${previousFormActor && (state.partnerIsMerged || state.resultIsPartnerCurrentForm) ? `<li>${localize("DDA.Hybrid.PreviousForm")}: <strong>${escapeHtml(previousFormActor.name)}</strong>.</li>` : ""}
      </ul>
    </div>
  `;
}

async function collectAvailableJogressOptions(tamerActor, currentForm) {
  const recipes = collectJogressRecipes(tamerActor).filter((recipe) => {
    return isJogressRulesMethod(recipe.method) && !recipe.hidden;
  });

  if (!recipes.length || !currentForm?.templateActor) return [];

  const primaryPartner = await resolveActor(tamerActor.system?.partner?.uuid ?? "");
  if (!primaryPartner || primaryPartner.type !== "digimon") return [];

  const tamerEntries = await collectTamerPartnerEntries();
  const currentEntry = {
    tamer: tamerActor,
    partnerActor: primaryPartner,
    digimon: primaryPartner,
    form: currentForm
  };
  const options = [];
  const seen = new Set();

  for (const recipe of recipes) {
    const components = Array.isArray(recipe.components) ? recipe.components : [];
    if (components.length !== 2) continue;

    for (let index = 0; index < components.length; index += 1) {
      const currentRequirement = components[index];
      if (!matchesJogressRequirement(currentForm, currentRequirement)) continue;

      const remainingRequirements = components.filter((_component, componentIndex) => componentIndex !== index);
      const participantSets = findJogressParticipantSets(remainingRequirements, tamerEntries, [tamerActor.uuid]);

      for (const participantSet of participantSets) {
        const participants = [currentEntry, ...participantSet];
        if (participants.length !== 2 || !participantsHaveSameStage(participants)) continue;

        const resultActor = await resolveJogressResultActor(recipe);
        if (!resultActor) continue;

        const componentStage = String(currentForm.stageKey ?? "").trim();
        const resultStage = String(resultActor.system?.stage ?? recipe.result?.stage ?? "").trim();
        if (!isImmediatelyHigherStage(componentStage, resultStage)) continue;

        const optionKey = [
          recipe.id,
          ...participants.map((participant) => participant.form?.reference ?? participant.partnerActor?.uuid ?? "").sort()
        ].join("::");
        if (seen.has(optionKey)) continue;
        seen.add(optionKey);

        options.push({
          id: `${recipe.id}-${options.length}`,
          recipe,
          resultActor,
          participants
        });
      }
    }
  }

  return options;
}

function collectJogressRecipes(tamerActor) {
  const configRecipes = Array.isArray(CONFIG.DDA?.jogressRecipes) ? CONFIG.DDA.jogressRecipes : [];
  const globalRecipes = Array.isArray(game.dda?.jogressRecipes) ? game.dda.jogressRecipes : [];
  const actorRecipes = Array.isArray(tamerActor?.system?.specialEvolutions?.jogress?.recipes)
    ? tamerActor.system.specialEvolutions.jogress.recipes
    : [];
  const groupRecipes = [];

  for (const group of game.actors ?? []) {
    if (group?.type !== "group") continue;
    const members = Array.isArray(group.system?.party?.members)
      ? group.system.party.members
      : [];
    const belongsToGroup = members.some((member) => {
      return String(member?.uuid ?? "") === String(tamerActor?.uuid ?? "");
    });
    if (!belongsToGroup) continue;

    const recipes = group.system?.specialEvolutions?.jogress?.recipes;
    if (Array.isArray(recipes)) groupRecipes.push(...recipes);
  }

  const recipeMap = new Map();

  for (const recipe of [...configRecipes, ...globalRecipes, ...actorRecipes, ...groupRecipes]) {
    const normalized = normalizeJogressRecipe(recipe);
    if (!normalized?.id) continue;
    recipeMap.set(normalized.id, normalized);
  }

  return Array.from(recipeMap.values());
}

function normalizeJogressRecipe(recipe) {
  if (!recipe || typeof recipe !== "object") return null;

  const id = String(recipe.id ?? recipe.key ?? recipe.label ?? recipe.result?.name ?? "").trim();
  if (!id) return null;

  return {
    id,
    label: String(recipe.label ?? recipe.name ?? recipe.result?.name ?? id).trim(),
    method: String(recipe.method ?? "jogress").trim(),
    result: recipe.result ?? {},
    components: Array.isArray(recipe.components) ? recipe.components : [],
    cost: recipe.cost ?? {},
    check: recipe.check ?? {},
    temporary: recipe.temporary ?? true,
    hidden: Boolean(recipe.hidden)
  };
}

async function collectTamerPartnerEntries() {
  const entries = [];

  for (const actor of game.actors ?? []) {
    if (!actor || actor.type !== "character") continue;
    if (isTamerInActiveJogress(actor)) continue;

    const partnerUuid = String(actor.system?.partner?.uuid ?? "").trim();
    if (!partnerUuid) continue;

    const partnerActor = await resolveActor(partnerUuid);
    if (!partnerActor || partnerActor.type !== "digimon") continue;
    if (hasConflictingJogressSpecialEvolution(actor, partnerActor)) continue;

    const currentReference = getCurrentPartnerFormReference(actor, partnerActor);
    const form = await resolvePartnerFormDescriptor(
      partnerActor,
      currentReference,
      { fallbackActor: partnerActor }
    );
    if (!form?.templateActor) continue;

    entries.push({
      tamer: actor,
      partnerActor,
      digimon: partnerActor,
      form
    });
  }

  return entries;
}

function findJogressParticipantSets(requirements, entries, usedTamerUuids = []) {
  if (!requirements.length) return [[]];

  const [requirement, ...remainingRequirements] = requirements;
  const matches = entries.filter((entry) => {
    if (!entry?.tamer || !entry?.partnerActor || !entry?.form) return false;
    if (usedTamerUuids.includes(entry.tamer.uuid)) return false;
    return matchesJogressRequirement(entry.form, requirement);
  });

  const sets = [];

  for (const match of matches) {
    const childSets = findJogressParticipantSets(remainingRequirements, entries, [
      ...usedTamerUuids,
      match.tamer.uuid
    ]);

    for (const childSet of childSets) {
      sets.push([match, ...childSet]);
    }
  }

  return sets;
}

function matchesJogressRequirement(formOrActor, requirement = {}) {
  if (!formOrActor) return false;

  const templateActor = formOrActor.templateActor ?? formOrActor;
  const actorUuid = normalizeUuid(
    formOrActor.reference ?? formOrActor.uuid ?? templateActor?.uuid ?? ""
  );
  const actorName = normalizeName(
    formOrActor.name ?? templateActor?.name ?? ""
  );
  const actorSpecies = normalizeName(
    templateActor?.system?.species ?? formOrActor.name ?? templateActor?.name ?? ""
  );
  const actorStage = String(
    formOrActor.stageKey ?? templateActor?.system?.stage ?? ""
  ).trim();

  const requiredUuid = normalizeUuid(requirement.uuid ?? requirement.actorUuid ?? "");
  const requiredName = normalizeName(requirement.name ?? "");
  const requiredSpecies = normalizeName(requirement.species ?? "");
  const requiredStage = String(requirement.stage ?? "").trim();

  if (requiredUuid && actorUuid !== requiredUuid && normalizeUuid(templateActor?.uuid ?? "") !== requiredUuid) return false;
  if (requiredStage && actorStage !== requiredStage) return false;

  if (requiredSpecies) {
    return actorSpecies === requiredSpecies || actorName === requiredSpecies;
  }

  if (requiredName) {
    return actorName === requiredName || actorSpecies === requiredName;
  }

  return Boolean(requiredUuid || requiredStage);
}

function getJogressResultReference(resultActor = null, recipe = null) {
  return String(
    resultActor?.uuid ??
    resultActor?.databaseId ??
    resultActor?.system?.databaseId ??
    resultActor?.system?.sourceId ??
    recipe?.result?.uuid ??
    recipe?.result?.actorUuid ??
    recipe?.result?.databaseId ??
    recipe?.result?.sourceId ??
    recipe?.result?.species ??
    recipe?.result?.name ??
    resultActor?.name ??
    ""
  ).trim();
}

async function resolveJogressResultActor(recipe) {
  const result = recipe?.result ?? {};
  const resultUuid = normalizeUuid(result.uuid ?? result.actorUuid ?? "");

  if (resultUuid) {
    const actor = await resolveActor(resultUuid);
    if (actor) return actor;
  }

  const resultName = normalizeName(result.name ?? recipe?.label ?? "");
  const resultSpecies = normalizeName(result.species ?? result.name ?? recipe?.label ?? "");

  const worldActor = Array.from(game.actors ?? []).find((actor) => {
    if (!actor || actor.type !== "digimon") return false;

    const actorName = normalizeName(actor.name);
    const actorSpecies = normalizeName(actor.system?.species ?? "");

    return (resultName && (actorName === resultName || actorSpecies === resultName)) ||
      (resultSpecies && (actorName === resultSpecies || actorSpecies === resultSpecies));
  }) ?? null;

  if (worldActor) return worldActor;

  // Planner forms come from the bundled Digimon database and should not
  // require the GM to import a duplicate world Actor just to execute Jogress.
  try {
    const { DDADigimonDatabase } = await import("../data/digimon-database.js");
    const databaseActors = await DDADigimonDatabase.getAll({ includeVirtualSpecialForms: true });
    return databaseActors.find((actor) => {
      if (!actor || actor.type !== "digimon") return false;
      const actorName = normalizeName(actor.name);
      const actorSpecies = normalizeName(actor.system?.species ?? "");
      return (resultName && (actorName === resultName || actorSpecies === resultName)) ||
        (resultSpecies && (actorName === resultSpecies || actorSpecies === resultSpecies));
    }) ?? null;
  } catch (error) {
    console.warn("DDA | Could not resolve Jogress result from the Digimon database.", error);
    return null;
  }
}

function calculateJogressCost(tamerActor, recipe) {
  const actionCost = Math.max(0, Number(recipe?.cost?.actions ?? 2));
  const peCost = Math.max(0, Number(recipe?.cost?.pe ?? 0));
  const availablePe = Number(
    tamerActor.system.resources
      ?.evolutionPoints?.value ?? 0
  );

  const ipPool = getTamerIpPool(tamerActor);
  const availableIp = ipPool.total;

  const availableActions = Number(
    tamerActor.system.combat
      ?.actions?.value ?? 0
  );
  const peSpent = Math.min(availablePe, peCost);
  const remainingCost = Math.max(0, peCost - peSpent);
  const ipSpent = Math.min(availableIp, remainingCost);

  return {
    actionCost,
    peCost,
    peSpent,
    ipSpent,
    totalPaid: peSpent + ipSpent,
    remainingCost: Math.max(0, peCost - peSpent - ipSpent),
    availablePe,
    availableIp,
    availableNormalIp: ipPool.normal,
    availableTemporaryIp: ipPool.temporary,
    availableActions,
    reason: localize("DDA.Evolution.CostReason.JogressEvolution"),
    transitionType: "jogress",
    allowed: Boolean(getDDASettingSafe("enableJogressEvolution", false)),
    blockedReason: localize("DDA.Evolution.Blocked.JogressDisabled")
  };
}

async function chooseJogressOption(options, tamerActor, currentForm) {
  if (!options.length) return null;

  if (options.length === 1) {
    return options[0];
  }

  const optionRows = options.map((option, index) => {
    const participants = option.participants.map((participant) => {
      return `${participant.form?.name ?? localize("DDA.Jogress.UnknownDigimon")} (${participant.tamer?.name ?? localize("DDA.Jogress.UnknownTamer")})`;
    }).join(" + ");

    return `
      <option value="${index}">
        ${escapeHtml(participants)} → ${escapeHtml(option.resultActor.name)}
      </option>
    `;
  }).join("");

  const choice = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-jogress-choice-dialog"],
    window: { title: localize("DDA.Jogress.DialogTitle") },
    content: `
      <div class="dda-roll-dialog dda-jogress-dialog">
        <p>${formatI18n("DDA.Jogress.ChooseHint", {
          tamer: `<strong>${escapeHtml(tamerActor.name)}</strong>`,
          partner: `<strong>${escapeHtml(currentForm.name)}</strong>`
        })}</p>
        <div class="form-group">
          <label>${localize("DDA.Jogress.Recipe")}</label>
          <select name="optionIndex">${optionRows}</select>
        </div>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-link",
        default: true,
        callback: (_event, button) => Number(button.form?.elements?.optionIndex?.value ?? 0)
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });

  if (choice === null || choice === false || !Number.isInteger(choice)) return null;
  return options[choice] ?? null;
}

function getStageIndex(stageKey) {
  return getStageOrder().indexOf(stageKey);
}

function getStageLabel(stageKey) {
  const label = CONFIG.DDA?.stages?.[stageKey]?.label ?? stageKey ?? localize("DDA.Stage.Unknown");
  return localize(label);
}

function getEvolutionTransitionLabelFromType(transitionType) {
  const labels = {
    sameForm: "DDA.Evolution.Transition.SameForm",
    standard: "DDA.Evolution.Transition.Digivolution",
    slide: "DDA.Evolution.Transition.SlideEvolution",
    regression: "DDA.Evolution.Transition.Regression",
    warp: "DDA.Evolution.Transition.WarpEvolution",
    dark: "DDA.Evolution.Transition.DarkEvolution",
    armor: "DDA.Evolution.Transition.ArmorEvolution",
    jogress: "DDA.Evolution.Transition.JogressEvolution",
    formChange: "DDA.Evolution.Transition.FormChange"
  };

  return localize(labels[transitionType] ?? "DDA.Evolution.Transition.FormChange");
}

function hasSlideEvolutionMastery(actor) {
  if (!actor?.items) return false;

  return Array.from(actor.items).some((item) => {
    if (item.type !== "quality") return false;

    const normalized = normalizeName(item.name);
    const slug = normalizeName(item.system?.slug ?? item.system?.id ?? "");

    return [
      normalized,
      slug
    ].some((value) => {
      return value === "slide evolution mastery" ||
        value === "maestria em slide evolution" ||
        value === "maestria de slide evolution" ||
        value === "dominio de slide evolution" ||
        value === "domínio de slide evolution";
    });
  });
}


function getNormalizedEvolutionGraph(actor) {
  const sourceGraph = foundry.utils.deepClone(actor.system.evolutionGraph ?? {});
  const graph = {
    layout: sourceGraph.layout ?? { mode: "solar" },
    nodes: Array.isArray(sourceGraph.nodes) ? sourceGraph.nodes : [],
    edges: Array.isArray(sourceGraph.edges) ? sourceGraph.edges : []
  };

  const ensureNode = (formData) => {
    if (!formData?.uuid && !formData?.actorUuid) return;
    const actorUuid = formData.actorUuid ?? formData.uuid;
    if (graph.nodes.some((node) => node.actorUuid === actorUuid)) return;

graph.nodes.push({
  id: formData.id ?? generateEvolutionNodeId(actorUuid),
  actorUuid,
  name: formData.name ?? "",
  displayName: formData.displayName ?? formData.species ?? formData.name ?? "",
  species: formData.species ?? formData.name ?? "",
  stage: formData.stage ?? "child",
  unlocked: formData.unlocked ?? true,
  hidden: formData.hidden ?? false,
  img: formData.img ?? "",
  portraitImg: formData.portraitImg ?? formData.img ?? "",
  tokenImg: formData.tokenImg ?? formData.img ?? "",
  snapshot: Boolean(formData.snapshot),
  persistentSnapshot: Boolean(formData.persistentSnapshot)
});
  };

ensureNode({
  actorUuid: actor.uuid,
  name: actor.name,
  displayName: actor.system?.species || actor.name,
  species: actor.system?.species || actor.name,
  stage: actor.system.stage ?? "child",
  img: actor.img ?? "",
  portraitImg: actor.system?.evolution?.portraitImg || actor.flags?.[DDA_SYSTEM_ID]?.digivicePortrait || actor.img || "",
  tokenImg: actor.prototypeToken?.texture?.src || actor.system?.evolution?.tokenImg || actor.img || ""
});
  const legacyForms = actor.system.evolutionLine?.forms ?? {};
  const primaryLegacyNodes = [];

  for (const stageKey of getStageOrder()) {
    const slot = legacyForms[stageKey];
    const forms = normalizeEvolutionSlotForms(slot, stageKey);

    if (slot?.uuid) {
      primaryLegacyNodes.push(generateEvolutionNodeId(slot.uuid));
    }

    for (const form of forms) {
      ensureNode(form);
    }
  }

  if (!graph.edges.length && primaryLegacyNodes.length > 1) {
    for (let index = 0; index < primaryLegacyNodes.length - 1; index += 1) {
      graph.edges.push({
        id: generateEvolutionEdgeId(primaryLegacyNodes[index], primaryLegacyNodes[index + 1], "normal"),
        from: primaryLegacyNodes[index],
        to: primaryLegacyNodes[index + 1],
        method: "normal",
        unlocked: true
      });
    }
  }

graph.nodes = graph.nodes.map((node) => ({
  id: node.id ?? generateEvolutionNodeId(node.actorUuid),
  actorUuid: node.actorUuid ?? node.uuid ?? "",
  name: node.name ?? "",
  displayName: node.displayName ?? node.species ?? node.name ?? "",
  species: node.species ?? node.name ?? "",
  stage: node.stage ?? "child",
  unlocked: node.unlocked ?? true,
  hidden: node.hidden ?? false,
  img: node.img ?? "",
  portraitImg: node.portraitImg ?? node.img ?? "",
  tokenImg: node.tokenImg ?? node.img ?? "",
  snapshot: Boolean(node.snapshot),
  persistentSnapshot: Boolean(node.persistentSnapshot)
})).filter((node) => node.actorUuid);

  graph.edges = graph.edges.map((edge) => ({
    id: edge.id ?? generateEvolutionEdgeId(edge.from, edge.to, edge.method ?? "normal"),
    from: edge.from,
    to: edge.to,
    method: edge.method ?? "normal",
    unlocked: edge.unlocked ?? true
  })).filter((edge) => edge.from && edge.to && edge.from !== edge.to);

  return graph;
}

function generateEvolutionNodeId(actorUuid) {
  return `node_${String(actorUuid ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function generateEvolutionEdgeId(from, to, method = "normal") {
  return `edge_${String(from)}_${String(to)}_${String(method)}`
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeEvolutionSlotForms(slot, defaultStageKey = "") {
  if (!slot) return [];

  if (Array.isArray(slot)) {
    return slot.map((form) => normalizeEvolutionFormData(form, defaultStageKey)).filter((form) => form.uuid);
  }

  const forms = [];

  if (Array.isArray(slot.forms)) {
    forms.push(...slot.forms.map((form) => normalizeEvolutionFormData(form, defaultStageKey)));
  }

  if (slot.uuid) {
    const legacyForm = normalizeEvolutionFormData(slot, defaultStageKey);

    if (!forms.some((form) => form.uuid === legacyForm.uuid)) {
      forms.unshift(legacyForm);
    }
  }

  return forms.filter((form) => form.uuid);
}

function normalizeEvolutionFormData(form, defaultStageKey = "") {
  return {
    name: form?.name ?? "",
    displayName: form?.displayName ?? form?.species ?? form?.name ?? "",
    species: form?.species ?? form?.name ?? "",
    uuid: form?.uuid ?? "",
    actorUuid: form?.actorUuid ?? form?.uuid ?? "",
    stage: form?.stage ?? defaultStageKey,
    img: form?.img ?? "",
    portraitImg: form?.portraitImg ?? form?.img ?? "",
    tokenImg: form?.tokenImg ?? form?.img ?? "",
    snapshot: Boolean(form?.snapshot),
    persistentSnapshot: Boolean(form?.persistentSnapshot)
  };
}



export async function executeForcedEvolution(tamerActor) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.ForcedEvolutionOnlyForTamers"));
    return null;
  }

  if (!Boolean(getDDASettingSafe("enableForcedEvolution", true))) {
    ui.notifications.warn(localize("DDA.Warning.ForcedEvolutionDisabled"));
    return null;
  }

  const { partnerActor, currentFormActor, currentForm } = await getPartnerAndCurrentFormForSpecialAction(tamerActor);
  if (!partnerActor || !currentFormActor || !currentForm) return null;

  const activeConflict = getActiveEvolutionConflict(tamerActor, partnerActor);
  if (activeConflict) {
    warnEvolutionConflict(activeConflict);
    return null;
  }

  if (isEvolutionLockedForCombat(partnerActor)) {
    ui.notifications.warn(localize("DDA.Warning.EvolutionLockedUntilCombatEnd"));
    return null;
  }

  const forms = (await collectEvolutionForms(
    partnerActor,
    currentForm.templateActor ?? currentFormActor
  ))
    .filter((form) => isHigherStage(currentForm.stageKey, form.stageKey));

  if (!forms.length) {
    ui.notifications.warn(localize("DDA.Warning.NoEvolutionFormsRegistered"));
    return null;
  }

  const selectedForm = await chooseForcedOrBlastForm(forms, {
    title: localize("DDA.ForcedEvolution.ChooseTitle"),
    buttonLabel: localize("DDA.Button.ForceEvolution")
  });
  if (!selectedForm) return null;

  const resultForm = await resolvePartnerFormDescriptor(partnerActor, selectedForm.uuid, { form: selectedForm });
  if (!resultForm?.templateActor || resultForm.templateActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotDigimon"));
    return null;
  }

  const actionCost = 2;
  const preInitiativeCombat = getPreInitiativeEvolutionCombat(tamerActor);
  const currentActions = Number(
    preInitiativeCombat
      ? tamerActor.system.combat?.actions?.max ?? 2
      : tamerActor.system.combat?.actions?.value ?? 0
  );
  if (currentActions < actionCost) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForForcedEvolution"));
    return null;
  }

  const normalCost = calculateEvolutionCost({
    tamerActor,
    previousActor: currentForm.templateActor ?? currentFormActor,
    newActor: resultForm.templateActor,
    edgeMethod: selectedForm.edgeMethod,
    directLink: selectedForm.directLink
  });
  const normallyRequiredEvolutionPoints = Math.max(0, Number(normalCost.peCost ?? 0));
  const tn = 18 + normallyRequiredEvolutionPoints;
  const check = await rollTamerFixedCheck(tamerActor, "willpower", "", tn, localize("DDA.ForcedEvolution.CheckTitle"));
  if (!check) return null;

  await tamerActor.update({
    "system.combat.actions.value": Math.max(0, currentActions - actionCost)
  });

  if (preInitiativeCombat) {
    await markPreInitiativeEvolutionDebt(tamerActor, preInitiativeCombat.id, actionCost);
  }

  if (!check.success) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
      content: renderSimpleDdaCard("dda-forced-evolution-card failure", localize("DDA.ForcedEvolution.Title"), [
        formatI18n("DDA.ForcedEvolution.Failed", { actor: escapeHtml(tamerActor.name), result: check.total, tn })
      ])
    });
    return null;
  }

  const defaultStage = partnerActor.system?.evolution?.defaultStage || getDefaultStageFromRange(tamerActor);
  const belowDefaultStage = getStageDirectlyBelow(defaultStage) || defaultStage;
  const revertFormActor = check.criticalSuccess
    ? await findFormByStage(partnerActor, defaultStage, currentFormActor)
    : await findFormByStage(partnerActor, belowDefaultStage, currentFormActor);
  const revertForm = await resolvePartnerFormDescriptor(
    partnerActor,
    revertFormActor?.uuid || currentForm.reference,
    { fallbackActor: revertFormActor ?? currentFormActor }
  );

  const forcedCombat = game?.combat;
  const forcedStartRound = forcedCombat?.started
    ? Math.max(1, Number(forcedCombat.round ?? 1))
    : (preInitiativeCombat ? 1 : 0);

  const state = {
    active: true,
    method: "forced",
    combatId: forcedCombat?.id ?? preInitiativeCombat?.id ?? "",
    startedRound: forcedStartRound,
    expiresAfterRound: forcedStartRound > 0 ? forcedStartRound + 2 : 0,
    resultUuid: resultForm.reference,
    resultName: resultForm.name,
    previousFormUuid: currentForm.reference,
    previousFormName: currentForm.name,
    revertUuid: revertForm?.reference ?? currentForm.reference,
    revertName: revertForm?.name ?? currentForm.name,
    revertStage: check.criticalSuccess ? defaultStage : belowDefaultStage,
    roundsRemaining: 3,
    checkTotal: check.total,
    checkTn: tn,
    criticalSuccess: check.criticalSuccess,
    startedAt: new Date().toISOString()
  };

  try {
    await applyPersistentPartnerSpecialForm({
      tamerActor,
      partnerActor,
      form: resultForm,
      previousFormActor: currentFormActor,
      transitionType: "forced",
      healOnEvolution: true
    });

    await tamerActor.update({
      "system.specialEvolutions.forced.active": true,
      "system.specialEvolutions.forced.state": state
    });

    await partnerActor.update({
      "system.specialForm.kind": "forced",
      "system.specialForm.method": "forced",
      "system.specialEvolutions.forced.active": true,
      "system.specialEvolutions.forced.state": state
    });
  } catch (error) {
    console.error("DDA | Forced Evolution activation failed; attempting rollback.", error);
    let rollbackSucceeded = false;
    try {
      const previousForm = await resolvePartnerFormDescriptor(partnerActor, currentForm.reference);
      if (previousForm?.templateActor) {
        await applyPersistentPartnerSpecialForm({
          tamerActor,
          partnerActor,
          form: previousForm,
          previousFormActor: partnerActor,
          transitionType: "forcedRollback",
          healOnEvolution: false
        });
        rollbackSucceeded = true;
      }
    } catch (rollbackError) {
      console.error("DDA | Forced Evolution activation rollback also failed.", rollbackError);
    }

    if (rollbackSucceeded) {
      const rollbackUpdates = {
        "system.combat.actions.value": currentActions,
        "system.specialEvolutions.forced.active": false,
        "system.specialEvolutions.forced.state.active": false
      };
      if (preInitiativeCombat) {
        rollbackUpdates["system.combat.preInitiativeEvolution.combatId"] = "";
        rollbackUpdates["system.combat.preInitiativeEvolution.actionDebt"] = 0;
        rollbackUpdates["system.combat.preInitiativeEvolution.pending"] = false;
      }
      await tamerActor.update(rollbackUpdates);
      await partnerActor.update({
        "system.specialForm.kind": "",
        "system.specialForm.method": "",
        "system.specialEvolutions.forced.active": false,
        "system.specialEvolutions.forced.state.active": false
      });
      ui.notifications.error(localize("DDA.Warning.ForcedActivationFailed"));
    } else {
      // Preserve a recoverable state rather than discarding the only data that
      // can safely end a partially-applied Forced Evolution.
      await tamerActor.update({
        "system.specialEvolutions.forced.active": true,
        "system.specialEvolutions.forced.state": state
      });
      await partnerActor.update({
        "system.specialForm.kind": "forced",
        "system.specialForm.method": "forced",
        "system.specialEvolutions.forced.active": true,
        "system.specialEvolutions.forced.state": state
      });
      ui.notifications.error(localize("DDA.Warning.SpecialEvolutionRevertMissing"));
    }
    return null;
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderSimpleDdaCard("dda-forced-evolution-card success", localize("DDA.ForcedEvolution.Title"), [
      formatI18n("DDA.ForcedEvolution.Success", { previous: escapeHtml(currentForm.name), next: escapeHtml(resultForm.name), rounds: 3 }),
      formatI18n("DDA.ForcedEvolution.RevertHint", { form: escapeHtml(state.revertName) })
    ])
  });

  partnerActor.sheet?.render(true);
  tamerActor.sheet?.render(false);
  return partnerActor;
}

export async function endForcedEvolution(tamerActor) {
  const state = tamerActor?.system?.specialEvolutions?.forced?.state ?? {};
  if (!state.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveForcedEvolution"));
    return null;
  }

  const partnerUuid = String(tamerActor.system?.partner?.uuid ?? "");
  const partnerActor = await resolveActor(partnerUuid);
  if (!partnerActor) return null;

  const wantedStage = String(state.revertStage ?? "").trim();
  let revertForm = await resolvePartnerFormDescriptor(
    partnerActor,
    state.revertUuid || state.previousFormUuid
  );

  if (wantedStage && revertForm?.stageKey !== wantedStage) {
    const stageActor = await findStrictFormByStage(partnerActor, wantedStage);
    revertForm = stageActor
      ? await resolvePartnerFormDescriptor(partnerActor, stageActor.uuid, { fallbackActor: stageActor })
      : null;
  }

  if (!revertForm?.templateActor) {
    const safeFallback = await resolvePartnerFormDescriptor(partnerActor, state.previousFormUuid);
    if (safeFallback?.templateActor) {
      revertForm = safeFallback;
      ui.notifications.warn(localize("DDA.Warning.SpecialEvolutionRevertFallback"));
    }
  }

  if (!revertForm?.templateActor) {
    ui.notifications.error(localize("DDA.Warning.SpecialEvolutionRevertMissing"));
    return null;
  }

  await applyPersistentPartnerSpecialForm({
    tamerActor,
    partnerActor,
    form: revertForm,
    previousFormActor: partnerActor,
    transitionType: "forcedRevert",
    healOnEvolution: false
  });

  await tamerActor.update({
    "system.specialEvolutions.forced.active": false,
    "system.specialEvolutions.forced.state.active": false
  });

  await partnerActor.update({
    "system.specialEvolutions.forced.active": false,
    "system.specialEvolutions.forced.state.active": false,
    "system.specialForm.kind": "",
    "system.specialForm.method": ""
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderSimpleDdaCard("dda-forced-evolution-card", localize("DDA.ForcedEvolution.EndTitle"), [
      formatI18n("DDA.ForcedEvolution.Ended", { form: escapeHtml(revertForm?.name ?? state.previousFormName ?? "") })
    ])
  });

  tamerActor.sheet?.render(false);
  partnerActor.sheet?.render(false);
  return partnerActor;
}

function normalizeBlastAttackTag(value = "") {
  if (value && typeof value === "object") {
    value =
      value.tag ??
      value.key ??
      value.value ??
      value.id ??
      value.slug ??
      value.name ??
      value.label ??
      "";
  }

  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
}

function blastAttackHasTag(item, wantedTag) {
  const wanted = normalizeBlastAttackTag(wantedTag);
  const tags = [
    ...(item?.system?.qualityTags ?? []),
    ...(item?.system?.tags ?? []),
    ...(item?.system?.baseTags?.tags ?? [])
  ].map(normalizeBlastAttackTag);

  return tags.includes(wanted);
}

function getTemplateAttackEntries(templateActor) {
  const items = Array.isArray(templateActor?.items)
    ? templateActor.items
    : Array.from(templateActor?.items ?? []);

  return items
    .filter((item) => {
      if (item?.type !== "attack" || Boolean(item.system?.isSignature)) return false;
      // Blast treats the chosen Attack as a Signature Move. [AMMO] explicitly
      // cannot apply to Signature Moves, so it is not a legal Blast Attack.
      if (blastAttackHasTag(item, "ammo")) return false;
      return true;
    })
    .map((item) => {
      const sourceItemUuid = String(
        item.flags?.[DDA_SYSTEM_ID]?.sourceItemUuid ||
        item.flags?.dda?.sourceItemUuid ||
        item.uuid ||
        item._id ||
        ""
      ).trim();
      return {
        name: String(item.name ?? localize("DDA.Item.Attack")),
        sourceItemUuid,
        fingerprint: getSnapshotItemFingerprint(
          typeof item.toObject === "function" ? item.toObject() : item
        )
      };
    });
}

async function chooseBlastAttack(templateActor) {
  const attacks = getTemplateAttackEntries(templateActor);
  if (!attacks.length) {
    ui.notifications.warn(localize("DDA.Warning.NoBlastEvolutionAttacks"));
    return null;
  }

  const optionHtml = attacks.map((attack, index) => (
    `<option value="${index}">${escapeHtml(attack.name)}</option>`
  )).join("");

  const choice = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-blast-evolution-attack-dialog"],
    window: { title: localize("DDA.BlastEvolution.ChooseTitle") },
    content: `
      <div class="dda-roll-dialog">
        <div class="form-group">
          <label>${localize("DDA.Item.Attack")}</label>
          <select name="blastAttack">${optionHtml}</select>
        </div>
        <p class="muted">${localize("DDA.BlastEvolution.Mode.attack")}</p>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => Number(button.form?.elements?.blastAttack?.value ?? 0)
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });

  if (choice === null || choice === false || !Number.isInteger(choice)) return null;
  return attacks[choice] ?? null;
}

function findAppliedBlastAttack(partnerActor, attackChoice) {
  if (!partnerActor || !attackChoice) return null;
  return Array.from(partnerActor.items ?? []).find((item) => {
    if (item.type !== "attack" || item.system?.isSignature) return false;
    const sourceItemUuid = String(
      item.flags?.[DDA_SYSTEM_ID]?.sourceItemUuid ||
      item.flags?.dda?.sourceItemUuid ||
      ""
    ).trim();
    if (attackChoice.sourceItemUuid && sourceItemUuid === attackChoice.sourceItemUuid) return true;
    return getSnapshotItemFingerprint(item.toObject()) === attackChoice.fingerprint;
  }) ?? null;
}

async function collectBlastEvolutionForms(tamerActor, partnerActor, currentFormActor, currentForm) {
  const requireDirectLink = Boolean(
    getDDASettingSafe("requireDirectEvolutionLink", true)
  );

  const forms = (await collectEvolutionForms(
    partnerActor,
    currentForm.templateActor ?? currentFormActor
  ))
    .filter((form) => isHigherStage(currentForm.stageKey, form.stageKey))
    // Blast may reach a higher form that is not yet naturally accessible, but
    // it still has to be a form this Digimon can evolve into. When the world
    // requires direct evolution links, do not expose unrelated higher branches
    // merely because showLockedEvolutions makes them visible in the graph.
    .filter((form) => !requireDirectLink || Boolean(form.directLink));

  return forms.filter((form) => {
    const unlockData = getEvolutionUnlockDataForTamer(
      tamerActor,
      form,
      currentForm.templateActor ?? currentFormActor
    );
    return !unlockData.allowed;
  });
}

async function validateBlastEvolutionBase(tamerActor, partnerActor, currentFormActor, currentForm) {
  const combat = game?.combat;
  if (!combat?.started) {
    return {
      ok: false,
      warning: localize("DDA.Warning.BlastEvolutionRequiresCombat")
    };
  }
  const activeConflict = getActiveEvolutionConflict(tamerActor, partnerActor);
  if (activeConflict) {
    return {
      ok: false,
      warning: formatI18n("DDA.Warning.SpecialEvolutionConflict", {
        evolution: getEvolutionConflictLabel(activeConflict)
      })
    };
  }

  const blastUses = Number(tamerActor.system.blastEvolution?.uses?.value ?? 0);
  if (blastUses <= 0) {
    return { ok: false, warning: localize("DDA.Warning.NoBlastEvolutionUses") };
  }

  if (isEvolutionLockedForCombat(partnerActor)) {
    return { ok: false, warning: localize("DDA.Warning.EvolutionLockedUntilCombatEnd") };
  }

  const battery = partnerActor.system?.resources?.battery ?? {};
  const batteryValue = Number(battery.value ?? 0);
  const batteryMax = Number(battery.max ?? 0);
  if (batteryMax <= 0 || batteryValue < batteryMax) {
    return {
      ok: false,
      warning: formatI18n("DDA.Warning.BlastRequiresFullBattery", { current: batteryValue, max: batteryMax })
    };
  }

  const forms = await collectBlastEvolutionForms(tamerActor, partnerActor, currentFormActor, currentForm);
  if (!forms.length) {
    return { ok: false, warning: localize("DDA.Warning.NoBlastEvolutionForms") };
  }

  return { ok: true, blastUses, batteryValue, batteryMax, forms };
}

async function beginBlastEvolution({
  tamerActor,
  partnerActor,
  currentFormActor,
  currentForm,
  resultForm,
  mode,
  batteryValue,
  blastUses,
  tamerActionCost = 1,
  digimonActionCost = 0,
  intercedeRequestId = "",
  beforeTransform = null
}) {
  const tamerActions = Number(tamerActor.system.combat?.actions?.value ?? 0);
  const digimonActions = Number(partnerActor.system.combat?.actions?.value ?? 0);
  if (tamerActions < tamerActionCost || digimonActions < digimonActionCost) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForBlastEvolution"));
    return null;
  }

  const combatId = String(game?.combat?.id ?? "");
  const previousWounds = partnerActor.system?.miscStats?.wounds ?? {};
  const state = {
    active: true,
    method: "blast",
    mode,
    combatId,
    resultUuid: resultForm.reference,
    resultName: resultForm.name,
    resultStage: resultForm.stageKey,
    previousFormUuid: currentForm.reference,
    previousFormName: currentForm.name,
    previousStage: currentForm.stageKey,
    previousWoundsValue: Number(previousWounds.value ?? previousWounds.max ?? 0),
    previousTemporaryWounds: Number(previousWounds.temp?.value ?? 0),
    previousDefeated: Boolean(partnerActor.system?.combat?.defeated),
    previousBatteryValue: Number(partnerActor.system?.resources?.battery?.value ?? batteryValue),
    previousTamerActions: tamerActions,
    previousDigimonActions: digimonActions,
    tamerActionCost: Math.max(0, Number(tamerActionCost ?? 0)),
    digimonActionCost: Math.max(0, Number(digimonActionCost ?? 0)),
    batterySpent: batteryValue,
    checkTotal: 0,
    checkTn: 0,
    outcome: "",
    revertedToUuid: "",
    revertedToName: "",
    intercedeRequestId,
    startedAt: new Date().toISOString()
  };

  await tamerActor.update({
    "system.combat.actions.value": Math.max(0, tamerActions - tamerActionCost),
    "system.blastEvolution.uses.value": Math.max(0, blastUses - 1),
    "system.specialEvolutions.blast.active": true,
    "system.specialEvolutions.blast.state": state
  });

  if (digimonActionCost > 0) {
    await partnerActor.update({
      "system.combat.actions.value": Math.max(0, digimonActions - digimonActionCost)
    });
  }

  // Intercede may need to consume a Quality (for example Sprint) that belongs
  // to the current form. Do it only after all Blast resources have been
  // validated/paid, but before the form template replaces Embedded Items.
  if (typeof beforeTransform === "function") {
    try {
      await beforeTransform({ tamerActor, partnerActor, state });
    } catch (error) {
      console.error("DDA | Blast Evolution pre-transform step failed.", error);
      await tamerActor.update({
        "system.combat.actions.value": tamerActions,
        "system.blastEvolution.uses.value": blastUses,
        "system.specialEvolutions.blast.active": false,
        "system.specialEvolutions.blast.state.active": false
      });
      if (digimonActionCost > 0) {
        await partnerActor.update({
          "system.combat.actions.value": digimonActions,
          "system.specialEvolutions.blast.active": false,
          "system.specialEvolutions.blast.state.active": false
        });
      }
      return null;
    }
  }

  try {
    await applyPersistentPartnerSpecialForm({
      tamerActor,
      partnerActor,
      form: resultForm,
      previousFormActor: currentFormActor,
      transitionType: "blast",
      healOnEvolution: mode === "attack"
    });

    const postEvolutionWounds = partnerActor.system?.miscStats?.wounds ?? {};
    const postEvolutionMax = Math.max(0, Number(postEvolutionWounds.max ?? postEvolutionWounds.value ?? 0));
    const woundValue = mode === "intercede"
      ? Math.min(postEvolutionMax || batteryValue, Math.max(0, batteryValue))
      : Number(postEvolutionWounds.value ?? postEvolutionMax);

    await partnerActor.update({
      // Blast Attack is resolved immediately through the normal attack engine.
      // Keep the captured Battery visible during that atomic resolution so every
      // Signature-aware Quality reads the same value; markAttackUsed consumes it.
      "system.resources.battery.value": mode === "attack" ? batteryValue : 0,
      ...(mode === "intercede" ? {
        "system.miscStats.wounds.value": woundValue,
        "system.miscStats.wounds.temp.value": 0,
        "system.combat.defeated": false
      } : {}),
      "system.specialForm.kind": "blast",
      "system.specialForm.method": "blast",
      "system.specialEvolutions.blast.active": true,
      "system.specialEvolutions.blast.state": state
    });
  } catch (error) {
    console.error("DDA | Blast Evolution activation failed; attempting rollback.", error);
    try {
      await rollbackBlastEvolution(tamerActor, {
        batteryValue,
        refundTamerAction: true,
        refundDigimonAction: true,
        refundUse: true
      });
      ui.notifications.error(localize("DDA.Warning.BlastActivationFailed"));
    } catch (rollbackError) {
      console.error("DDA | Blast Evolution activation rollback also failed.", rollbackError);
      ui.notifications.error(localize("DDA.Warning.SpecialEvolutionRevertMissing"));
    }
    return null;
  }

  return state;
}

async function applyBlastCombatPenalty(partnerActor, combatId, { lockEvolution = false } = {}) {
  if (!partnerActor) return;

  const batteryMax = Math.max(0, Number(partnerActor.system?.resources?.battery?.max ?? 0));
  const updates = {};

  if (combatId && batteryMax > 0) {
    const reducedMax = Math.max(0, batteryMax - 1);
    updates["system.resources.battery.max"] = reducedMax;
    updates["system.resources.battery.value"] = Math.min(
      Number(partnerActor.system?.resources?.battery?.value ?? 0),
      reducedMax
    );
    updates["system.status.batteryMaxReducedUntilCombatEnd"] = true;
    updates["system.status.blastEvolutionCombatPenalty"] = {
      active: true,
      combatId,
      previousBatteryMax: batteryMax,
      reducedBatteryMax: reducedMax
    };
  }

  if (combatId) {
    updates["system.status.blastEvolutionCombatId"] = combatId;
  }

  if (combatId && lockEvolution) {
    updates["system.status.evolutionLockedUntilCombatEnd"] = true;
  }

  if (Object.keys(updates).length) await partnerActor.update(updates);
}

async function finishBlastEvolution(tamerActor, { check = null } = {}) {
  const state = foundry.utils.deepClone(tamerActor?.system?.specialEvolutions?.blast?.state ?? {});
  if (!state.active) return null;

  const partnerActor = await resolveActor(tamerActor.system?.partner?.uuid);
  if (!partnerActor) return null;

  const tn = 12 + getStageValue(state.resultStage || partnerActor.system?.stage);
  const rolledCheck = check ?? await rollTamerCheck(
    tamerActor,
    "",
    {
      attributeKeyOverride: "willpower",
      fixedTn: tn,
      title: localize("DDA.BlastEvolution.AfterCheckTitle")
    }
  );

  const resolvedCheck = rolledCheck?.outcome
    ? {
        ...rolledCheck,
        criticalSuccess: rolledCheck.outcome.key === "criticalSuccess",
        criticalFailure: rolledCheck.outcome.key === "criticalFailure",
        success: ["success", "criticalSuccess"].includes(rolledCheck.outcome.key),
        outcome: rolledCheck.outcome.key,
        label: rolledCheck.outcome.label
      }
    : rolledCheck;

  if (!resolvedCheck) return null;

  let revertForm = null;
  let lockEvolution = false;
  let digitama = false;
  let requiredRevertStage = "";

  if (resolvedCheck.criticalFailure) {
    requiredRevertStage = "baby1";
    lockEvolution = true;
    digitama = true;
  } else if (resolvedCheck.criticalSuccess) {
    revertForm = await resolvePartnerFormDescriptor(partnerActor, state.previousFormUuid);
  } else if (resolvedCheck.success) {
    requiredRevertStage = String(
      partnerActor.system?.evolution?.defaultStage || getDefaultStageFromRange(tamerActor)
    ).trim();
  } else {
    const defaultStage = partnerActor.system?.evolution?.defaultStage || getDefaultStageFromRange(tamerActor);
    requiredRevertStage = getStageDirectlyBelow(defaultStage) || defaultStage;
    lockEvolution = true;
  }

  if (!revertForm?.templateActor && requiredRevertStage) {
    const revertActor = await findStrictFormByStage(partnerActor, requiredRevertStage);
    if (revertActor) {
      revertForm = await resolvePartnerFormDescriptor(
        partnerActor,
        revertActor.uuid,
        { fallbackActor: revertActor }
      );
    }
  }

  if (!revertForm?.templateActor) {
    const safeFallback = await resolvePartnerFormDescriptor(partnerActor, state.previousFormUuid);
    if (safeFallback?.templateActor) {
      revertForm = safeFallback;
      ui.notifications.warn(localize("DDA.Warning.SpecialEvolutionRevertFallback"));
    }
  }

  if (!revertForm?.templateActor) {
    ui.notifications.error(localize("DDA.Warning.SpecialEvolutionRevertMissing"));
    return null;
  }

  await applyPersistentPartnerSpecialForm({
    tamerActor,
    partnerActor,
    form: revertForm,
    previousFormActor: partnerActor,
    transitionType: "blastRevert",
    healOnEvolution: false
  });

  await applyBlastCombatPenalty(partnerActor, state.combatId, { lockEvolution });

  const finalState = {
    ...state,
    active: false,
    checkTotal: resolvedCheck.total,
    checkTn: tn,
    outcome: resolvedCheck.outcome,
    revertedToUuid: revertForm?.reference ?? partnerActor.system?.evolution?.currentFormUuid ?? partnerActor.uuid,
    revertedToName: revertForm?.name ?? partnerActor.system?.species ?? partnerActor.name,
    endedAt: new Date().toISOString()
  };

  await tamerActor.update({
    "system.specialEvolutions.blast.active": false,
    "system.specialEvolutions.blast.state": finalState
  });

  await partnerActor.update({
    "system.specialEvolutions.blast.active": false,
    "system.specialEvolutions.blast.state": finalState,
    "system.specialForm.kind": "",
    "system.specialForm.method": "",
    ...(digitama ? {
      "system.combat.digitama": true,
      "system.combat.defeated": true
    } : {})
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderSimpleDdaCard(`dda-blast-evolution-card ${resolvedCheck.outcome}`, localize("DDA.BlastEvolution.Title"), [
      formatI18n("DDA.BlastEvolution.CheckResult", { total: resolvedCheck.total, tn, result: resolvedCheck.label }),
      formatI18n("DDA.BlastEvolution.RevertedTo", { form: escapeHtml(finalState.revertedToName) })
    ])
  });

  tamerActor.sheet?.render(false);
  partnerActor.sheet?.render(false);
  return { partnerActor, check: resolvedCheck, state: finalState };
}

export async function executeBlastEvolution(tamerActor) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.BlastEvolutionOnlyForTamers"));
    return null;
  }

  if (!Boolean(getDDASettingSafe("enableBlastEvolution", true))) {
    ui.notifications.warn(localize("DDA.Warning.BlastEvolutionDisabled"));
    return null;
  }

  const { partnerActor, currentFormActor, currentForm } = await getPartnerAndCurrentFormForSpecialAction(tamerActor);
  if (!partnerActor || !currentFormActor || !currentForm) return null;

  const validation = await validateBlastEvolutionBase(tamerActor, partnerActor, currentFormActor, currentForm);
  if (!validation.ok) {
    ui.notifications.warn(validation.warning);
    return null;
  }

  const selectedForm = await chooseForcedOrBlastForm(validation.forms, {
    title: localize("DDA.BlastEvolution.ChooseTitle"),
    buttonLabel: localize("DDA.Button.BlastEvolution")
  });
  if (!selectedForm) return null;

  const resultForm = await resolvePartnerFormDescriptor(partnerActor, selectedForm.uuid, { form: selectedForm });
  if (!resultForm?.templateActor || resultForm.templateActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotDigimon"));
    return null;
  }

  const attackChoice = await chooseBlastAttack(resultForm.templateActor);
  if (!attackChoice) return null;

  const tamerActions = Number(tamerActor.system.combat?.actions?.value ?? 0);
  const digimonActions = Number(partnerActor.system.combat?.actions?.value ?? 0);
  if (tamerActions < 1 || digimonActions < 2) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForBlastEvolution"));
    return null;
  }

  const state = await beginBlastEvolution({
    tamerActor,
    partnerActor,
    currentFormActor,
    currentForm,
    resultForm,
    mode: "attack",
    batteryValue: validation.batteryValue,
    blastUses: validation.blastUses,
    tamerActionCost: 1,
    digimonActionCost: 0
  });
  if (!state) return null;

  const appliedAttack = findAppliedBlastAttack(partnerActor, attackChoice);
  if (!appliedAttack) {
    await rollbackBlastEvolution(tamerActor, {
      batteryValue: validation.batteryValue,
      refundTamerAction: true,
      refundDigimonAction: true,
      refundUse: true
    });
    ui.notifications.warn(localize("DDA.Warning.AttackerOrAttackNotFound"));
    return null;
  }

  const { rollAttack } = await import("../rolls/attack-roll.js");
  const attackResult = await rollAttack(partnerActor, appliedAttack, {
    actionCostOverride: 2,
    ignoreActionCostModifiers: true,
    forceSignature: true,
    signatureBatteryOverride: validation.batteryValue,
    blastEvolution: true
  });

  if (!attackResult) {
    await rollbackBlastEvolution(tamerActor, {
      batteryValue: validation.batteryValue,
      refundTamerAction: true,
      refundDigimonAction: true,
      refundUse: true
    });
    return null;
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderSimpleDdaCard("dda-blast-evolution-card", localize("DDA.BlastEvolution.Title"), [
      formatI18n("DDA.BlastEvolution.Executed", {
        previous: escapeHtml(currentForm.name),
        next: escapeHtml(resultForm.name),
        mode: localize("DDA.BlastEvolution.Mode.attack")
      })
    ])
  });

  await finishBlastEvolution(tamerActor);
  return attackResult;
}

async function rollbackBlastEvolution(tamerActor, {
  batteryValue = 0,
  refundTamerAction = false,
  refundDigimonAction = false,
  refundUse = false
} = {}) {
  const state = foundry.utils.deepClone(tamerActor?.system?.specialEvolutions?.blast?.state ?? {});
  if (!state.active) return;

  const partnerActor = await resolveActor(tamerActor.system?.partner?.uuid);
  if (!partnerActor) return;

  const previousForm = await resolvePartnerFormDescriptor(partnerActor, state.previousFormUuid, { fallbackActor: partnerActor });
  if (previousForm?.templateActor) {
    await applyPersistentPartnerSpecialForm({
      tamerActor,
      partnerActor,
      form: previousForm,
      previousFormActor: partnerActor,
      transitionType: "blastRollback",
      healOnEvolution: false
    });
  }

  const updates = {
    "system.specialEvolutions.blast.active": false,
    "system.specialEvolutions.blast.state.active": false
  };
  if (refundTamerAction) {
    const max = Number(tamerActor.system.combat?.actions?.max ?? 2);
    const previous = Number(state.previousTamerActions ?? (Number(tamerActor.system.combat?.actions?.value ?? 0) + Number(state.tamerActionCost ?? 1)));
    updates["system.combat.actions.value"] = Math.min(max, Math.max(0, previous));
  }
  if (refundUse) {
    const max = Number(tamerActor.system.blastEvolution?.uses?.max ?? 1);
    updates["system.blastEvolution.uses.value"] = Math.min(max, Number(tamerActor.system.blastEvolution?.uses?.value ?? 0) + 1);
  }
  await tamerActor.update(updates);
  await partnerActor.update({
    ...(refundDigimonAction ? {
      "system.combat.actions.value": Math.min(
        Number(partnerActor.system.combat?.actions?.max ?? 2),
        Math.max(0, Number(state.previousDigimonActions ?? partnerActor.system.combat?.actions?.value ?? 0))
      )
    } : {}),
    "system.resources.battery.value": Math.min(
      Number(partnerActor.system.resources?.battery?.max ?? batteryValue),
      Number(state.previousBatteryValue ?? batteryValue)
    ),
    "system.miscStats.wounds.value": Number(state.previousWoundsValue ?? partnerActor.system?.miscStats?.wounds?.value ?? 0),
    "system.miscStats.wounds.temp.value": Number(state.previousTemporaryWounds ?? 0),
    "system.combat.defeated": Boolean(state.previousDefeated),
    "system.specialEvolutions.blast.active": false,
    "system.specialEvolutions.blast.state.active": false,
    "system.specialForm.kind": "",
    "system.specialForm.method": ""
  });
}

async function resolveLinkedTamerForBlastPartner(partnerActor) {
  const directUuid = String(partnerActor?.system?.tamer?.uuid ?? "").trim();
  if (directUuid) {
    const direct = await resolveActor(directUuid);
    if (direct?.type === "character") return direct;
  }

  return Array.from(game?.actors ?? []).find((actor) => {
    return actor?.type === "character" && String(actor.system?.partner?.uuid ?? "") === String(partnerActor?.uuid ?? "");
  }) ?? null;
}

export async function getBlastIntercedeEligibility(partnerActor, { digimonActionCost = 2 } = {}) {
  if (!partnerActor || partnerActor.type !== "digimon" || !Boolean(getDDASettingSafe("enableBlastEvolution", true))) {
    return { eligible: false };
  }

  const tamerActor = await resolveLinkedTamerForBlastPartner(partnerActor);
  if (!tamerActor) return { eligible: false };

  const current = await getPartnerAndCurrentFormForSpecialAction(tamerActor);
  if (!current.partnerActor || current.partnerActor.uuid !== partnerActor.uuid) return { eligible: false };

  const validation = await validateBlastEvolutionBase(
    tamerActor,
    current.partnerActor,
    current.currentFormActor,
    current.currentForm
  );
  if (!validation.ok) return { eligible: false, warning: validation.warning };

  const tamerActions = Number(tamerActor.system.combat?.actions?.value ?? 0);
  const digimonActions = Number(partnerActor.system.combat?.actions?.value ?? 0);
  const requiredDigimonActions = Math.max(1, Number(digimonActionCost ?? 2));
  if (tamerActions < 1 || digimonActions < requiredDigimonActions) return { eligible: false };

  return {
    eligible: true,
    tamerUuid: tamerActor.uuid,
    tamerName: tamerActor.name,
    formCount: validation.forms.length
  };
}

export async function prepareBlastIntercede({
  partnerActor,
  request = null,
  beforeTransform = null,
  digimonActionCost = 2
} = {}) {
  const tamerActor = await resolveLinkedTamerForBlastPartner(partnerActor);
  if (!tamerActor) return null;

  const { partnerActor: persistentPartner, currentFormActor, currentForm } = await getPartnerAndCurrentFormForSpecialAction(tamerActor);
  if (!persistentPartner || !currentFormActor || !currentForm) return null;

  const validation = await validateBlastEvolutionBase(tamerActor, persistentPartner, currentFormActor, currentForm);
  if (!validation.ok) {
    ui.notifications.warn(validation.warning);
    return null;
  }

  const selectedForm = await chooseForcedOrBlastForm(validation.forms, {
    title: localize("DDA.BlastEvolution.ChooseTitle"),
    buttonLabel: localize("DDA.BlastEvolution.Mode.intercede")
  });
  if (!selectedForm) return null;

  const resultForm = await resolvePartnerFormDescriptor(persistentPartner, selectedForm.uuid, { form: selectedForm });
  if (!resultForm?.templateActor) return null;

  const state = await beginBlastEvolution({
    tamerActor,
    partnerActor: persistentPartner,
    currentFormActor,
    currentForm,
    resultForm,
    mode: "intercede",
    batteryValue: validation.batteryValue,
    blastUses: validation.blastUses,
    tamerActionCost: 1,
    digimonActionCost: Math.max(1, Number(digimonActionCost ?? 2)),
    intercedeRequestId: String(request?.requestId ?? ""),
    beforeTransform
  });
  if (!state) return null;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderSimpleDdaCard("dda-blast-evolution-card", localize("DDA.BlastEvolution.Title"), [
      formatI18n("DDA.BlastEvolution.Executed", {
        previous: escapeHtml(currentForm.name),
        next: escapeHtml(resultForm.name),
        mode: localize("DDA.BlastEvolution.Mode.intercede")
      })
    ])
  });

  return {
    active: true,
    tamerUuid: tamerActor.uuid,
    partnerUuid: persistentPartner.uuid,
    resultFormUuid: resultForm.reference,
    batterySpent: validation.batteryValue,
    requestId: String(request?.requestId ?? "")
  };
}

export async function finishBlastIntercedeForPartner(partnerActor) {
  if (!partnerActor) return null;
  const tamerActor = await resolveLinkedTamerForBlastPartner(partnerActor);
  if (!tamerActor) return null;
  const state = tamerActor.system?.specialEvolutions?.blast?.state ?? {};
  if (!state.active || state.mode !== "intercede") return null;
  return finishBlastEvolution(tamerActor);
}

export async function initiatePartnerClash(tamerActor) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.ClashOnlyForTamers"));
    return null;
  }

  if (!Boolean(getDDASettingSafe("enableClashActions", true))) {
    ui.notifications.warn(localize("DDA.Warning.ClashDisabled"));
    return null;
  }

  const { currentFormActor } = await getPartnerAndCurrentFormForSpecialAction(tamerActor);
  if (!currentFormActor) return null;

  const targetToken = game.user.targets.first();
  const targetActor = targetToken?.actor;

  if (!targetActor || !["digimon", "npc"].includes(targetActor.type)) {
    ui.notifications.warn(localize("DDA.Warning.SelectDigimonTargetForClash"));
    return null;
  }

  if (targetActor.uuid === currentFormActor.uuid) {
    ui.notifications.warn(localize("DDA.Warning.CannotClashSelf"));
    return null;
  }

  const actions = Number(currentFormActor.system.combat?.actions?.value ?? 0);
  if (actions < 1) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForClash"));
    return null;
  }

  const initiatorRoll = await rollDigimonClashCheck(currentFormActor, targetActor);
  const targetRoll = await rollDigimonClashCheck(targetActor, currentFormActor);
  const controller = resolveClashController(currentFormActor, targetActor, initiatorRoll, targetRoll);

  const stateBase = {
    active: true,
    id: randomID(),
    initiatorUuid: currentFormActor.uuid,
    initiatorName: currentFormActor.name,
    opponentUuid: targetActor.uuid,
    opponentName: targetActor.name,
    controllerUuid: controller.uuid,
    controllerName: controller.name,
    startedAt: new Date().toISOString()
  };

  await currentFormActor.update({
    "system.combat.actions.value": Math.max(0, actions - 1),
    "system.combat.currentStance": "neutral",
    "system.clash.state": { ...stateBase, role: currentFormActor.uuid === controller.uuid ? "controller" : "opponent" }
  });

  await targetActor.update({
    "system.combat.currentStance": "neutral",
    "system.clash.state": { ...stateBase, role: targetActor.uuid === controller.uuid ? "controller" : "opponent" }
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: currentFormActor }),
    content: renderSimpleDdaCard("dda-clash-card", localize("DDA.Clash.Title"), [
      formatI18n("DDA.Clash.Started", { initiator: escapeHtml(currentFormActor.name), opponent: escapeHtml(targetActor.name) }),
      formatI18n("DDA.Clash.RollSummary", { initiator: initiatorRoll.total, opponent: targetRoll.total }),
      formatI18n("DDA.Clash.Controller", { controller: escapeHtml(controller.name) }),
      localize("DDA.Clash.NeutralStanceNote")
    ])
  });

  currentFormActor.sheet?.render(false);
  targetActor.sheet?.render(false);
  return stateBase;
}

export async function endPartnerClash(tamerActor) {
  const { currentFormActor } = await getPartnerAndCurrentFormForSpecialAction(tamerActor);
  if (!currentFormActor) return null;

  const state = currentFormActor.system.clash?.state ?? {};
  if (!state.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveClash"));
    return null;
  }

  const opponentActor = await resolveActor(state.opponentUuid === currentFormActor.uuid ? state.initiatorUuid : state.opponentUuid);

  await currentFormActor.update({ "system.clash.state.active": false });
  if (opponentActor) await opponentActor.update({ "system.clash.state.active": false });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: currentFormActor }),
    content: renderSimpleDdaCard("dda-clash-card", localize("DDA.Clash.EndTitle"), [
      formatI18n("DDA.Clash.Ended", { a: escapeHtml(currentFormActor.name), b: escapeHtml(opponentActor?.name ?? state.opponentName ?? "") })
    ])
  });

  currentFormActor.sheet?.render(false);
  opponentActor?.sheet?.render(false);
  return true;
}

function getCurrentPartnerFormReference(tamerActor, partnerActor) {
  return String(
    partnerActor?.system?.evolution?.currentFormUuid ||
    partnerActor?.system?.evolution?.sourceFormUuid ||
    tamerActor?.system?.partner?.currentFormUuid ||
    partnerActor?.uuid ||
    ""
  ).trim();
}

function findEvolutionGraphNodeByReference(partnerActor, reference = "") {
  const wanted = String(reference ?? "").trim();
  if (!wanted) return null;
  const graph = getNormalizedEvolutionGraph(partnerActor);
  return graph.nodes.find((node) => {
    return [
      node?.actorUuid,
      node?.uuid,
      node?.formUuid,
      node?.sourceFormUuid,
      node?.currentFormUuid
    ].some((value) => String(value ?? "").trim() === wanted);
  }) ?? null;
}

async function resolvePartnerFormDescriptor(
  partnerActor,
  formReference = "",
  { form = null, fallbackActor = null } = {}
) {
  if (!partnerActor) return null;

  const requestedReference = String(
    form?.persistentSnapshot?.sourceFormUuid ||
    formReference ||
    form?.uuid ||
    form?.actorUuid ||
    ""
  ).trim();

  const currentReference = getCurrentPartnerFormReference(null, partnerActor);
  const currentLogicalReferences = new Set([
    String(currentReference ?? "").trim(),
    String(partnerActor.system?.evolution?.currentFormUuid ?? "").trim(),
    String(partnerActor.system?.evolution?.sourceFormUuid ?? "").trim()
  ].filter(Boolean));

  // The persistent Partner is always the newest representation of the active
  // form. A stored snapshot is only authoritative for inactive/prepared forms.
  if (!form?.persistentSnapshot && currentLogicalReferences.has(requestedReference)) {
    const liveReference = String(
      partnerActor.system?.evolution?.currentFormUuid ||
      partnerActor.system?.evolution?.sourceFormUuid ||
      requestedReference ||
      partnerActor.uuid
    ).trim();
    return {
      reference: liveReference,
      snapshot: getPartnerFormSnapshot(partnerActor, liveReference),
      templateActor: partnerActor,
      stageKey: String(partnerActor.system?.stage || "child"),
      name: String(partnerActor.system?.species || partnerActor.name || "Digimon"),
      isSnapshot: false
    };
  }

  let snapshot = form?.persistentSnapshot
    ? foundry.utils.deepClone(form.persistentSnapshot)
    : getPartnerFormSnapshot(partnerActor, requestedReference);

  if (!snapshot && requestedReference) {
    const node = findEvolutionGraphNodeByReference(partnerActor, requestedReference);
    if (node) {
      const nodeUuid = String(node.actorUuid ?? requestedReference);
      const isSnapshotNode = Boolean(
        node.snapshot ||
        node.persistentSnapshot ||
        nodeUuid.startsWith("DDA-SNAPSHOT.") ||
        (nodeUuid === partnerActor.uuid && String(node.stage ?? "") !== String(partnerActor.system?.stage ?? ""))
      );
      if (isSnapshotNode) {
        snapshot = getGraphNodePersistentSnapshot({ partnerActor, node, isSnapshotNode });
      }
    }
  }

  let templateActor = snapshot
    ? buildPseudoActorFromFormSnapshot(snapshot, partnerActor)
    : await resolveActor(requestedReference);

  if (!templateActor && fallbackActor) templateActor = fallbackActor;

  if (!templateActor && (!requestedReference || requestedReference === currentReference || requestedReference === partnerActor.uuid)) {
    templateActor = partnerActor;
  }

  if (!templateActor) return null;

  const reference = String(
    snapshot?.sourceFormUuid ||
    requestedReference ||
    templateActor.system?.evolution?.currentFormUuid ||
    templateActor.system?.evolution?.sourceFormUuid ||
    templateActor.uuid ||
    partnerActor.uuid
  ).trim();

  return {
    reference,
    snapshot,
    templateActor,
    stageKey: String(snapshot?.stage || templateActor.system?.stage || partnerActor.system?.stage || "child"),
    name: String(
      snapshot?.species ||
      snapshot?.sourceFormName ||
      snapshot?.name ||
      templateActor.system?.species ||
      templateActor.name ||
      partnerActor.system?.species ||
      partnerActor.name
    ),
    isSnapshot: Boolean(snapshot)
  };
}

async function updateTamerPartnerFormMirror(tamerActor, partnerActor) {
  if (!tamerActor || !partnerActor) return;
  await tamerActor.update({
    "system.partner.uuid": partnerActor.uuid,
    "system.partner.currentFormUuid": partnerActor.system?.evolution?.currentFormUuid || partnerActor.system?.evolution?.sourceFormUuid || partnerActor.uuid,
    "system.partner.currentFormName": partnerActor.system?.evolution?.currentFormName || partnerActor.system?.species || partnerActor.name
  });
}

async function applyPersistentPartnerSpecialForm({
  tamerActor,
  partnerActor,
  form,
  previousFormActor = null,
  transitionType = "special",
  healOnEvolution = false
} = {}) {
  if (!partnerActor || !form?.templateActor) return null;

  const previousStage = String(partnerActor.system?.stage ?? previousFormActor?.system?.stage ?? "");
  const nextStage = String(form.stageKey || form.templateActor.system?.stage || "");

  await runDigimonTokenEvolutionTransition(
    partnerActor,
    async () => {
      await clearClashStateForActor(partnerActor, { reason: transitionType });
      await applyEvolutionFormTemplateToPartner({
        partnerActor,
        formTemplateActor: form.templateActor,
        tamerActor,
        previousFormActor: previousFormActor ?? partnerActor,
        transitionType,
        continuedHybridState: null
      });

      if (
        healOnEvolution &&
        shouldFullyHealOnEvolution({
          previousStageKey: previousStage,
          nextStageKey: nextStage,
          transitionType
        })
      ) {
        // Intentional system UX rule: Evolution heals on a Stage increase
        // even outside Combat. The tabletop restriction adds no useful VTT flow.
        await fullyRestoreWounds(partnerActor, { clearTemp: true });
      }

      return partnerActor;
    },
    { lowAlphaMultiplier: 0.16, midAlphaMultiplier: 0.62, stepDelay: 90 }
  );

  await updateTamerPartnerFormMirror(tamerActor, partnerActor);
  return partnerActor;
}

async function getPartnerAndCurrentFormForSpecialAction(tamerActor) {
  if (isTamerInActiveJogress(tamerActor)) {
    ui.notifications.warn(localize("DDA.Warning.JogressBlocksOtherEvolution"));
    return {};
  }

  const partnerUuid = tamerActor.system.partner?.uuid;
  if (!partnerUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoPartnerLinked"));
    return {};
  }

  const partnerActor = await resolveActor(partnerUuid);
  if (!partnerActor || partnerActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.LinkedPartnerNotDigimonSimple"));
    return {};
  }

  const currentFormReference = getCurrentPartnerFormReference(tamerActor, partnerActor);
  const currentForm = await resolvePartnerFormDescriptor(
    partnerActor,
    currentFormReference,
    { fallbackActor: partnerActor }
  );

  // The persistent Partner is always the runtime actor. The descriptor keeps
  // the logical form identity even when it is a DDA-SNAPSHOT.* reference.
  return {
    partnerActor,
    currentFormActor: partnerActor,
    currentForm,
    currentFormReference
  };
}

function isHigherStage(fromStage, toStage) {
  const fromIndex = getStageIndex(fromStage);
  const toIndex = getStageIndex(toStage);
  return fromIndex !== -1 && toIndex !== -1 && toIndex > fromIndex;
}

async function chooseForcedOrBlastForm(forms, options = {}) {
  if (!Array.isArray(forms) || !forms.length) return null;

  const optionHtml = forms.map((form, index) => {
    return `<option value="${index}">${escapeHtml(form.stageLabel ?? getStageLabel(form.stageKey))} — ${escapeHtml(form.name)}</option>`;
  }).join("");

  const choice = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-special-evolution-form-dialog"],
    window: { title: options.title ?? localize("DDA.Evolution.Dialog.ChooseTitle") },
    content: `
      <div class="dda-roll-dialog">
        <div class="form-group">
          <label>${localize("DDA.Evolution.Form")}</label>
          <select name="formIndex">${optionHtml}</select>
        </div>
      </div>
    `,
    buttons: [
      {
        action: "confirm",
        label: options.buttonLabel ?? localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => Number(button.form?.elements?.formIndex?.value ?? 0)
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });

  if (choice === null || choice === false || !Number.isInteger(choice)) return null;
  return forms[choice] ?? null;
}

async function rollTamerFixedCheck(actor, attributeKey, skillKey, tn, title, options = {}) {
  const attribute = actor.system.attributes?.[attributeKey];
  const skill = actor.system.skills?.[skillKey];

  if (!attribute) {
    ui.notifications.warn(localize("DDA.Warning.AttributeNotFound"));
    return null;
  }

  const attributeValue = Number(attribute.value ?? 0);
  const hasSkill = Boolean(String(skillKey ?? "").trim());
  const skillValue = Number(skill?.value ?? 0);
  const skillModifier = hasSkill
    ? (skillValue > 0 ? skillValue : -1)
    : (options.noSkillModifier ? -1 : 0);
  const modifier = attributeValue + skillModifier;
  const roll = await new Roll("3d6 + @modifier", { modifier }).evaluate();
  const total = Number(roll.total ?? 0);
  const diceResults = roll.dice[0]?.results?.map((result) => result.result) ?? [];
  const criticalSuccess = total >= tn + 5;
  const criticalFailure = total <= tn - 5;
  const success = total >= tn;
  const outcome = criticalSuccess ? "criticalSuccess" : success ? "success" : criticalFailure ? "criticalFailure" : "failure";
  const label = localize(`DDA.Check.${outcome[0].toUpperCase()}${outcome.slice(1)}`);

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `
      <div class="dda-chat-card dda-check-card dda-fixed-check-card ${outcome}">
        <h2>${escapeHtml(title)}</h2>
        <ul class="dda-effect-list">
          <li>${localize("DDA.Roll.TN")}: <strong>${tn}</strong>.</li>
          <li>${localize("DDA.Roll.Dice")}: <strong>${diceResults.join(", ")}</strong>.</li>
          <li>${localize("DDA.Roll.Result")}: <strong>${label}</strong>.</li>
        </ul>
      </div>
    `
  });

  return { roll, total, tn, diceResults, criticalSuccess, criticalFailure, success, outcome, label };
}

function getDefaultStageFromRange(tamerActor) {
  const range = Number(tamerActor.system.evolution?.defaultRange?.value ?? 2);
  return getDefaultStageKeyForRange(range);
}

async function findFormByStage(partnerActor, stageKey, fallbackActor = null) {
  const wantedStage = String(stageKey ?? "").trim();
  const defaultFormUuid = String(partnerActor?.system?.evolution?.defaultFormUuid ?? "").trim();
  const defaultStage = String(partnerActor?.system?.evolution?.defaultStage ?? "").trim();

  if (defaultFormUuid && defaultStage === wantedStage) {
    const preferred = await resolvePartnerFormDescriptor(partnerActor, defaultFormUuid);
    if (preferred?.templateActor?.system?.stage === wantedStage) return preferred.templateActor;
  }

  if (fallbackActor?.system?.stage === wantedStage) return fallbackActor;

  const graph = getNormalizedEvolutionGraph(partnerActor);
  for (const node of graph.nodes) {
    const nodeStage = String(node?.stage ?? "").trim();
    if (!node?.actorUuid || nodeStage !== wantedStage) continue;

    const nodeUuid = String(node.actorUuid ?? "");
    const isSnapshotNode = Boolean(
      node.snapshot ||
      node.persistentSnapshot ||
      nodeUuid.startsWith("DDA-SNAPSHOT.") ||
      (nodeUuid === partnerActor.uuid && nodeStage !== String(partnerActor.system?.stage ?? ""))
    );
    const snapshot = isSnapshotNode
      ? getGraphNodePersistentSnapshot({ partnerActor, node, isSnapshotNode })
      : getPartnerFormSnapshot(partnerActor, nodeUuid);

    if (snapshot?.stage === wantedStage) {
      return buildPseudoActorFromFormSnapshot(snapshot, partnerActor);
    }

    const actor = await resolveActor(nodeUuid);
    if (actor?.system?.stage === wantedStage) return actor;
  }

  const forms = await collectEvolutionForms(partnerActor, fallbackActor ?? partnerActor);
  const found = forms.find((form) => String(form.stageKey ?? "") === wantedStage);
  if (found) {
    const descriptor = await resolvePartnerFormDescriptor(partnerActor, found.uuid, { form: found });
    if (descriptor?.templateActor) return descriptor.templateActor;
  }

  return fallbackActor ?? partnerActor;
}

async function findStrictFormByStage(partnerActor, stageKey) {
  const wantedStage = String(stageKey ?? "").trim();
  if (!partnerActor || !wantedStage) return null;
  const candidate = await findFormByStage(partnerActor, wantedStage, null);
  return String(candidate?.system?.stage ?? "").trim() === wantedStage
    ? candidate
    : null;
}

async function rollDigimonClashCheck(actor, opponent) {
  const clash = Number(actor.system.miscStats?.clash?.value ?? actor.system.miscStats?.clash?.total ?? 0);
  const sizeBonus = getSizeIndex(actor.system?.size) > getSizeIndex(opponent.system?.size) ? 1 : 0;
  const modifier = clash + sizeBonus;
  const roll = await new Roll("3d6 + @modifier", { modifier }).evaluate();
  return { actor, roll, total: Number(roll.total ?? 0), clash, sizeBonus };
}

function resolveClashController(a, b, aRoll, bRoll) {
  if (aRoll.total > bRoll.total) return a;
  if (bRoll.total > aRoll.total) return b;

  const aCpu = Number(a.system.derivedStats?.cpu?.value ?? a.system.derivedStats?.cpu?.total ?? 0);
  const bCpu = Number(b.system.derivedStats?.cpu?.value ?? b.system.derivedStats?.cpu?.total ?? 0);

  if (aCpu > bCpu) return a;
  if (bCpu > aCpu) return b;

  return a.type === "digimon" ? a : b;
}

function getSizeIndex(sizeKey = "medium") {
  const order = ["small", "medium", "large", "huge", "gigantic", "colossal"];
  return order.indexOf(String(sizeKey ?? "medium"));
}

function renderSimpleDdaCard(className, title, lines = []) {
  return `
    <div class="dda-chat-card dda-effect-card ${className}">
      <h2>${escapeHtml(title)}</h2>
      <ul class="dda-effect-list">
        ${lines.map((line) => `<li>${line}</li>`).join("")}
      </ul>
    </div>
  `;
}

async function resolveActor(uuid) {
  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Could not resolve Actor UUID:", uuid, error);
    return null;
  }
}

function getDDASettingSafe(key, fallback) {
  try {
    return getDDASetting(key);
  } catch (_error) {
    return fallback;
  }
}

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeUuid(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}

function isPrimaryActiveGmForEvolutionLifecycle() {
  const activeGm = game?.users?.activeGM;
  if (activeGm) return Boolean(game?.user?.isGM && activeGm.id === game.user.id);
  return Boolean(game?.user?.isGM);
}

async function expireForcedEvolutionsForCombat(combat, { combatEnded = false } = {}) {
  if (!combat || !isPrimaryActiveGmForEvolutionLifecycle()) return;

  const combatId = String(combat.id ?? "");
  const currentRound = Math.max(0, Number(combat.round ?? 0));
  const tamers = Array.from(game?.actors ?? []).filter((actor) => actor?.type === "character");

  for (const tamer of tamers) {
    const state = tamer.system?.specialEvolutions?.forced?.state ?? {};
    if (!state.active) continue;
    if (String(state.combatId ?? "") !== combatId) continue;

    const expiresAfterRound = Math.max(0, Number(state.expiresAfterRound ?? 0));
    const expiredByRound = expiresAfterRound > 0 && currentRound > expiresAfterRound;
    if (!combatEnded && !expiredByRound) continue;

    try {
      await endForcedEvolution(tamer);
    } catch (error) {
      console.error("DDA | Could not end expired Forced Evolution.", tamer, error);
    }
  }
}

async function finishOrphanedBlastEvolutionsForCombat(combat) {
  if (!combat || !isPrimaryActiveGmForEvolutionLifecycle()) return;

  const combatId = String(combat.id ?? "");
  const tamers = Array.from(game?.actors ?? []).filter((actor) => actor?.type === "character");

  for (const tamer of tamers) {
    const state = tamer.system?.specialEvolutions?.blast?.state ?? {};
    if (!state.active || String(state.combatId ?? "") !== combatId) continue;

    // Blast normally finishes atomically after its Attack/Intercede. Reaching
    // combatEnd with an active state means resolution was interrupted (reload,
    // exception, manual combat deletion, etc.). Do not let the Partner remain
    // permanently stranded in the temporary form. The mandatory Aftermath is
    // still resolved, but without opening a stale combat-end configuration
    // dialog on the GM client.
    const partnerActor = await resolveActor(tamer.system?.partner?.uuid);
    if (!partnerActor) continue;

    const tn = 12 + getStageValue(state.resultStage || partnerActor.system?.stage);
    let fallbackCheck = null;

    try {
      fallbackCheck = await rollTamerFixedCheck(
        tamer,
        "willpower",
        "",
        tn,
        localize("DDA.BlastEvolution.AfterCheckTitle"),
        { noSkillModifier: true }
      );
      await finishBlastEvolution(tamer, { check: fallbackCheck });
    } catch (error) {
      console.error("DDA | Could not finish orphaned Blast Evolution at combat end.", tamer, error);
    }
  }
}

async function cleanupBlastEvolutionForCombat(combat) {
  if (!combat || !isPrimaryActiveGmForEvolutionLifecycle()) return;

  const combatId = String(combat.id ?? "");
  const digimon = Array.from(game?.actors ?? []).filter((actor) => actor?.type === "digimon");

  for (const actor of digimon) {
    const status = actor.system?.status ?? {};
    if (String(status.blastEvolutionCombatId ?? "") !== combatId) continue;

    const penalty = status.blastEvolutionCombatPenalty ?? {};
    const updates = {
      "system.status.evolutionLockedUntilCombatEnd": false,
      "system.status.batteryMaxReducedUntilCombatEnd": false,
      "system.status.blastEvolutionCombatId": "",
      "system.status.blastEvolutionCombatPenalty": {
        active: false,
        combatId: "",
        previousBatteryMax: 0,
        reducedBatteryMax: 0
      }
    };

    if (penalty.active) {
      const previousBatteryMax = Math.max(0, Number(penalty.previousBatteryMax ?? 0));
      if (previousBatteryMax > 0) {
        updates["system.resources.battery.max"] = previousBatteryMax;
        updates["system.resources.battery.value"] = Math.min(
          previousBatteryMax,
          Number(actor.system?.resources?.battery?.value ?? 0)
        );
      }
    }

    try {
      await actor.update(updates);
    } catch (error) {
      console.error("DDA | Could not clean Blast Evolution combat state.", actor, error);
    }
  }
}

Hooks.on("updateCombat", async (combat, changed) => {
  if (!("round" in changed)) return;
  await expireForcedEvolutionsForCombat(combat);
});

async function finishSpecialEvolutionCombatLifecycle(combat, { combatDeleted = false } = {}) {
  await expireForcedEvolutionsForCombat(combat, { combatEnded: true });
  await finishOrphanedBlastEvolutionsForCombat(combat);
  await cleanupBlastEvolutionForCombat(combat);
  await detachActiveJogressFromCombat(combat, { restoreTracker: !combatDeleted });
}

Hooks.on("combatEnd", async (combat) => {
  await finishSpecialEvolutionCombatLifecycle(combat);
});

Hooks.on("deleteCombat", async (combat) => {
  await finishSpecialEvolutionCombatLifecycle(combat, { combatDeleted: true });
});
