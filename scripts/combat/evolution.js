import { getDDASetting } from "../settings.js";
import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
import { syncPartnerOwnershipFromTamer } from "../utils/ownership.js";
import { runDigimonTokenEvolutionTransition } from "../tokens/digimon-token-scale.js";
import { clearClashStateForActor } from "./clash.js";
import { getDdaTokenPath } from "../data/dda-portrait-and-manual-digimon-data.js";

import {
  getPartnerFormBonusDpAvailable,
  synchronizePartnerBonusDpAcrossForms
} from "../rules/tamer-progression.js";

import {
  getTamerIpPool,
  spendTamerIp
} from "../rules/tamer-resources.js";

export const DDA_SYSTEM_ID = "digimon-digital-adventures";

export async function evolvePartner(tamerActor) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.DigivolutionOnlyForTamers"));
    return;
  }

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

  await tamerActor.update({
    "system.partner.baseName": tamerActor.system.partner?.baseName || tamerActor.system.partner?.name || previousFormName || partnerActor.name,
    "system.partner.name": tamerActor.system.partner?.name || tamerActor.system.partner?.baseName || previousFormName || partnerActor.name,
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
  partnerActor
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
    isEvolutionLockedForCombat(
      partnerActor
    ) ||
    isEvolutionLockedForCombat(
      previousFormActor
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

  const confirmed =
    await Dialog.confirm({
      title: localize(
        "DDA.AllyNpc.Evolution.ConfirmTitle"
      ),

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

          <p class="muted">
            ${localize(
              "DDA.AllyNpc.Evolution.NoCost"
            )}
          </p>
        </div>
      `,

      yes: () => true,
      no: () => false,
      defaultYes: true
    });

  if (!confirmed) {
    return null;
  }

  const previousPersistentWounds =
    foundry.utils.deepClone(
      partnerActor.system.miscStats
        ?.wounds ?? {}
    );

  const shouldHealAfterEvolution =
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

  const snapshot =
    storedSnapshot ??
    await getOrCreatePartnerFormSnapshot(
      partnerActor,
      formTemplateActor
    );

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

  const snapshot = getPartnerFormSnapshot(partnerActor, wantedReference);

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
    snapshot.sourceFormUuid === partnerActor.uuid ||
    (currentSnapshot && currentSnapshot.key === snapshot.key) ||
    (currentSnapshot &&
      currentSnapshot.sourceFormUuid === snapshot.sourceFormUuid)
  );

  const totalBonusDp = Math.max(
    0,
    Number(partnerActor.system?.advancement?.bonusDp?.total ?? 0) || 0,
    Number(partnerActor.system?.creation?.dp?.bonus ?? 0) || 0,
    Number(partnerActor.system?.creation?.bonusDp ?? 0) || 0
  );

  const formBonusDp = getPartnerFormBonusDpAvailable(
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
    bonusDpTotal: totalBonusDp,
    isCurrentForm
  };
}

export async function getFuturePartnerFormWizardContext(
  tamerActor,
  formTemplateActor
) {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.DigivolutionOnlyForTamers"));
    return null;
  }

  if (!formTemplateActor || formTemplateActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotDigimon"));
    return null;
  }

  const partnerUuid = tamerActor.system.partner?.uuid;

  if (!partnerUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoPartnerLinked"));
    return null;
  }

  const partnerActor = await resolveActor(partnerUuid);

  if (!partnerActor || partnerActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.PartnerNotFound"));
    return null;
  }

  const formTemplateReference = getFormTemplateReference(formTemplateActor);

  const existingSnapshot = getPartnerFormSnapshot(
    partnerActor,
    formTemplateReference
  );

  const snapshot = existingSnapshot ?? {
    sourceFormUuid: formTemplateReference,
    sourceFormName: formTemplateActor.name,

    // O apelido pertence ao parceiro e acompanha toda a linha.
    name: partnerActor.name,

    img: formTemplateActor.img || partnerActor.img,
    portraitImg: "",
    tokenImg: await getEvolutionTokenTextureSource(
      formTemplateActor,
      partnerActor
    ),

    species: formTemplateActor.system?.species || formTemplateActor.name,
    stage: formTemplateActor.system?.stage || "child",
    type: formTemplateActor.system?.type || "",
    attribute: formTemplateActor.system?.attribute || "data",
    field: formTemplateActor.system?.field || "none",
    family: formTemplateActor.system?.family || "none",
    group: formTemplateActor.system?.group || "",

    profile: foundry.utils.deepClone(
      formTemplateActor.system?.profile ?? {}
    ),

    mainStats: {},
    miscStats: {},
    creation: {},
    qualityLimits: {},

    wizard: {
      preparedFutureForm: true,
      openedAt: new Date().toISOString()
    },

    // Nunca puxar ataques ou Qualidades da forma atualmente ativa.
    items: []
  };

  const totalBonusDp = Math.max(
    0,
    Number(partnerActor.system?.advancement?.bonusDp?.total ?? 0) || 0,
    Number(partnerActor.system?.creation?.dp?.bonus ?? 0) || 0,
    Number(partnerActor.system?.creation?.bonusDp ?? 0) || 0
  );

  const formBonusDp = getPartnerFormBonusDpAvailable(
    partnerActor,
    snapshot?.sourceFormUuid ||
      formTemplateReference ||
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
  fallbackActor: partnerActor
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

  const snapshot = buildFormSnapshotFromActor(partnerActor, {
    sourceFormUuid: currentFormUuid,
    sourceFormName: partnerActor.system.evolution?.currentFormName || partnerActor.system.evolution?.sourceFormName || partnerActor.name
  });

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

  return {
    key,
    sourceFormUuid,

    sourceFormName: String(
      snapshot?.sourceFormName ||
      fallbackActor?.name ||
      snapshot?.name ||
      ""
    ),

    sourceId: String(
      snapshot?.sourceId ||
      snapshot?.names?.canonical ||
      fallbackActor?.system?.sourceId ||
      fallbackActor?.system?.names?.canonical ||
      snapshot?.species ||
      fallbackActor?.system?.species ||
      ""
    ),

    databaseId: String(
      snapshot?.databaseId ||
      fallbackActor?.system?.databaseId ||
      ""
    ),

    originalName: String(
      snapshot?.originalName ||
      snapshot?.names?.original ||
      fallbackActor?.system?.names?.original ||
      snapshot?.species ||
      fallbackActor?.system?.species ||
      snapshot?.name ||
      ""
    ),

    dubName: String(
      snapshot?.dubName ||
      snapshot?.names?.dub ||
      fallbackActor?.system?.names?.dub ||
      snapshot?.species ||
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

        ...(Array.isArray(
          fallbackActor?.system?.names?.aliases
        )
          ? fallbackActor.system.names.aliases
          : [])
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
        fallbackActor?.system?.names?.canonical ||
        fallbackActor?.system?.sourceId ||
        snapshot?.species ||
        fallbackActor?.system?.species ||
        ""
      ),

      original: String(
        snapshot?.names?.original ||
        snapshot?.originalName ||
        fallbackActor?.system?.names?.original ||
        snapshot?.species ||
        fallbackActor?.system?.species ||
        ""
      ),

      dub: String(
        snapshot?.names?.dub ||
        snapshot?.dubName ||
        fallbackActor?.system?.names?.dub ||
        snapshot?.species ||
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

          ...(Array.isArray(
            fallbackActor?.system?.names?.aliases
          )
            ? fallbackActor.system.names.aliases
            : [])
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

    img: String(snapshot?.img || fallbackActor?.img || "icons/svg/mystery-man.svg"),
    portraitImg: String(
      snapshot?.portraitImg ||
      fallbackActor?.system?.evolution?.portraitImg ||
      fallbackActor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait ||
      fallbackActor?.img ||
      snapshot?.img ||
      "icons/svg/mystery-man.svg"
    ),
    tokenImg: String(
      snapshot?.tokenImg ||
      fallbackActor?.system?.evolution?.tokenImg ||
      fallbackActor?.prototypeToken?.texture?.src ||
      snapshot?.img ||
      fallbackActor?.img ||
      snapshot?.portraitImg ||
      fallbackActor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait ||
      "icons/svg/mystery-man.svg"
    ),
    species: String(snapshot?.species || fallbackActor?.system?.species || fallbackActor?.name || snapshot?.name || "Digimon"),
    stage: String(snapshot?.stage || fallbackActor?.system?.stage || "child"),
    stageValue: Number(snapshot?.stageValue ?? fallbackActor?.system?.stageValue ?? 2),
    size: String(snapshot?.size || fallbackActor?.system?.size || "medium"),
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
  const portraitImg = String(
    system.evolution?.portraitImg ||
    actor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait ||
    actor?.img ||
    "icons/svg/mystery-man.svg"
  );

  const tokenImg = String(
    system.evolution?.tokenImg ||
    actor?.prototypeToken?.texture?.src ||
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
    wizard: foundry.utils.deepClone(system.wizard ?? {}),
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

  /*
   * Somente parceiros de Tamer preservam
   * o nome/apelido entre formas.
   */
  const shouldPreservePartnerName =
    !isIndependentNpc &&
    Boolean(
      partnerActor.system?.isPersistentPartner
    );

  const nextSpeciesName = String(
    normalized.species ||
    formTemplateActor?.system?.species ||
    normalized.sourceFormName ||
    formTemplateActor?.name ||
    normalized.name ||
    partnerActor.name ||
    "Digimon"
  ).trim() || "Digimon";

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

const shouldUsePortraitFlag = Boolean(
  portraitImg &&
  portraitImg !== "icons/svg/mystery-man.svg" &&
  portraitImg !== actorImg
);

  const updates = {
    ...(shouldPreservePartnerName
      ? {}
      : {
          name: nextSpeciesName
        }),

    /*
     * Também corrige Allies antigos que já
     * tenham sido criados como persistentPartner.
     */
    ...(isIndependentNpc
      ? {
          "system.customName": "",
          "system.isPersistentPartner": false
        }
      : {}),

    img: isVideoPath(actorImg)
      ? (
          partnerActor.img ||
          "icons/svg/mystery-man.svg"
        )
      : actorImg,
    ...(shouldUsePortraitFlag
      ? { [`flags.${DDA_SYSTEM_ID}.digivicePortrait`]: portraitImg }
      : { [`flags.${DDA_SYSTEM_ID}.-=digivicePortrait`]: null }),
    "prototypeToken.texture.src": tokenImg,
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
      actor?.system?.evolution?.tokenImg ||
      actor?.prototypeToken?.texture?.src ||
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

  const partnerUuid = tamerActor.system.partner?.uuid;

  if (!partnerUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoPartnerLinked"));
    return null;
  }

  const partnerActor = await resolveActor(partnerUuid);

  if (!partnerActor || partnerActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.LinkedPartnerNotDigimonSimple"));
    return null;
  }

  await syncPartnerOwnershipFromTamer(tamerActor, partnerActor);

  if (isTamerInActiveJogress(tamerActor)) {
    ui.notifications.warn(localize("DDA.Warning.JogressAlreadyActive"));
    return null;
  }

  const currentFormUuid = tamerActor.system.partner?.currentFormUuid || partnerActor.uuid;
  const currentFormActor = await resolveActor(currentFormUuid) ?? partnerActor;
  const options = await collectAvailableJogressOptions(tamerActor, currentFormActor);

  if (!options.length) {
    ui.notifications.warn(localize("DDA.Warning.NoJogressRecipesAvailable"));
    return null;
  }

  const selectedOption = await chooseJogressOption(options, tamerActor, currentFormActor);
  if (!selectedOption) return null;

  const resultActor = selectedOption.resultActor;

  if (!resultActor || resultActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.JogressResultNotFound"));
    return null;
  }

  const participants = selectedOption.participants.filter((participant) => participant?.tamer && participant?.digimon);
  const secondary = participants.find((participant) => participant.tamer?.uuid !== tamerActor.uuid);

  if (participants.length < 2 || !secondary?.tamer || !secondary?.digimon) {
    ui.notifications.warn(localize("DDA.Warning.JogressNeedsTwoTamers"));
    return null;
  }

  if (!participantsHaveSameStage(participants)) {
    ui.notifications.warn(localize("DDA.Warning.JogressRequiresSameStage"));
    return null;
  }

  const historyKey = getJogressHistoryKey(selectedOption.recipe, participants, resultActor);
  const mastered = participants.every((participant) => hasMasteredJogressRecipe(participant.tamer, historyKey));
  const ruleData = buildJogressRuleData({
    recipe: selectedOption.recipe,
    resultActor,
    mastered
  });

  const confirmed = await confirmJogressStart({ option: selectedOption, resultActor, ruleData });
  if (!confirmed) return null;

  const paymentData = await validateJogressRuleCosts({ participants, ruleData });
  if (!paymentData) return null;

  await payJogressRuleCosts(paymentData);

  let checkResults = [];

  if (!mastered) {
    checkResults = await rollJogressChecks(participants, {
      tn: ruleData.checkTn,
      formula: ruleData.checkFormula
    });

    const allPassed = checkResults.every((entry) => entry.success);

    await createJogressCheckChatCard({
      speakerActor: tamerActor,
      option: selectedOption,
      resultActor,
      checkResults,
      allPassed
    });

    if (!allPassed) {
      ui.notifications.warn(localize("DDA.Warning.JogressCheckFailed"));
      return null;
    }
  }

  const startedAt = new Date().toISOString();
  const sharedInitiative = getLowestJogressInitiative(participants);
  const primaryDigimonBonusDp = getDigimonBonusDp(currentFormActor);
  const secondaryDigimonBonusDp = getDigimonBonusDp(secondary.digimon);
  const componentBonusDp = primaryDigimonBonusDp + secondaryDigimonBonusDp;

  const jogressState = {
    active: true,
    recipeId: selectedOption.recipe.id,
    historyKey,
    resultUuid: resultActor.uuid,
    resultName: resultActor.name,
    primaryTamerUuid: tamerActor.uuid,
    primaryTamerName: tamerActor.name,
    primaryDigimonUuid: currentFormActor.uuid,
    primaryDigimonName: currentFormActor.name,
    secondaryTamerUuid: secondary.tamer.uuid,
    secondaryTamerName: secondary.tamer.name,
    secondaryDigimonUuid: secondary.digimon.uuid,
    secondaryDigimonName: secondary.digimon.name,
    masteredBeforeUse: mastered,
    firstSuccessfulUse: !mastered,
    sharedInitiative,
    componentBonusDp,
    primaryDigimonBonusDp,
    secondaryDigimonBonusDp,
    startedAt
  };

  await tamerActor.update({
    "system.partner.currentFormUuid": resultActor.uuid,
    "system.partner.currentFormName": resultActor.name,
    "system.specialEvolutions.jogress.state": jogressState
  });

  await secondary.tamer.update({
    "system.partner.currentFormUuid": resultActor.uuid,
    "system.partner.currentFormName": resultActor.name,
    "system.specialEvolutions.jogress.state": jogressState
  });

  await markJogressRecipeMastered(participants, historyKey, {
    recipeId: selectedOption.recipe.id,
    resultUuid: resultActor.uuid,
    resultName: resultActor.name
  });

  await applyJogressResultOwnership(resultActor, participants);

  const jogressTamerNames = participants
    .map((participant) => participant.tamer?.name)
    .filter(Boolean)
    .join(" / ");

  await resultActor.update({
    "system.tamer.name":
      jogressTamerNames ||
      tamerActor.name,

    "system.tamer.uuid":
      tamerActor.uuid,

    "system.combat.actions.value":
      2,

    "system.combat.actions.max":
      2,

    "system.combat.initiative.value":
      sharedInitiative,

    "system.specialEvolutions.jogress.active":
      true,

    "system.specialEvolutions.jogress.state":
      jogressState,

    "system.specialEvolutions.jogress.componentBonusDp":
      componentBonusDp
  });

  await fullyRestoreWounds(
    resultActor,
    {
      clearTemp: true
    }
  );

  await updateJogressSharedInitiative(
    participants,
    resultActor,
    sharedInitiative
  );

  const componentList = participants.map((participant) => {
    return `<li><strong>${escapeHtml(participant.digimon?.name ?? localize("DDA.Jogress.UnknownDigimon"))}</strong> — ${escapeHtml(participant.tamer?.name ?? localize("DDA.Jogress.UnknownTamer"))}</li>`;
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
            <strong>${escapeHtml(resultActor.name)}</strong>
            <small>${escapeHtml(getStageLabel(resultActor.system.stage))}</small>
          </div>
        </div>
        <ul class="dda-effect-list dda-digivolution-list">
          ${componentList}
          <li>${localize("DDA.Jogress.Check")}: <strong>${mastered ? localize("DDA.Jogress.ReliableRepeat") : localize("DDA.Jogress.Passed")}</strong>.</li>
          <li>${localize("DDA.Jogress.SharedInitiative")}: <strong>${sharedInitiative}</strong>.</li>
          <li>${localize("DDA.Jogress.ResultActions")}: <strong>2</strong>.</li>
          <li>${localize("DDA.Jogress.ComponentBonusDp")}: <strong>${componentBonusDp}</strong>.</li>
          <li>${localize("DDA.Evolution.TotalCost")}: <strong>${paymentData.totalPeCost}</strong> ${localize("DDA.Resource.EvolutionPoints.Short")}.</li>
        </ul>
      </div>
    `
  });

  resultActor.sheet?.render(true);
  tamerActor.sheet?.render(false);
  secondary.tamer.sheet?.render(false);

  return resultActor;
}

export async function endJogressEvolution(tamerActor) {
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
  const primaryDigimon = await resolveActor(state.primaryDigimonUuid);
  const secondaryDigimon = await resolveActor(state.secondaryDigimonUuid);
  const resultActor = await resolveActor(state.resultUuid);

  const confirmed = await Dialog.confirm({
    title: localize("DDA.Jogress.EndTitle"),
    content: `
      <div class="dda-roll-dialog dda-jogress-dialog">
        <p>${formatI18n("DDA.Jogress.EndConfirm", {
          result: `<strong>${escapeHtml(state.resultName || resultActor?.name || localize("DDA.Jogress.UnknownResult"))}</strong>`
        })}</p>
        <ul>
          <li>${escapeHtml(primaryTamer?.name ?? state.primaryTamerName ?? localize("DDA.Jogress.UnknownTamer"))} → <strong>${escapeHtml(primaryDigimon?.name ?? state.primaryDigimonName ?? localize("DDA.Jogress.UnknownDigimon"))}</strong></li>
          <li>${escapeHtml(secondaryTamer?.name ?? state.secondaryTamerName ?? localize("DDA.Jogress.UnknownTamer"))} → <strong>${escapeHtml(secondaryDigimon?.name ?? state.secondaryDigimonName ?? localize("DDA.Jogress.UnknownDigimon"))}</strong></li>
        </ul>
        ${state.firstSuccessfulUse ? `<p class="warning">${localize("DDA.Jogress.FirstUseRevertHint")}</p>` : ""}
      </div>
    `,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  if (!confirmed) return null;

  const clearState = getEmptyJogressState();

  if (primaryTamer) {
    await primaryTamer.update({
      "system.partner.currentFormUuid": primaryDigimon?.uuid ?? state.primaryDigimonUuid ?? "",
      "system.partner.currentFormName": primaryDigimon?.name ?? state.primaryDigimonName ?? "",
      "system.specialEvolutions.jogress.state": clearState
    });
  }

  if (secondaryTamer) {
    await secondaryTamer.update({
      "system.partner.currentFormUuid": secondaryDigimon?.uuid ?? state.secondaryDigimonUuid ?? "",
      "system.partner.currentFormName": secondaryDigimon?.name ?? state.secondaryDigimonName ?? "",
      "system.specialEvolutions.jogress.state": clearState
    });
  }

  if (resultActor) {
    await resultActor.update({
      "system.tamer.name": "",
      "system.tamer.uuid": "",
      "system.specialEvolutions.jogress.active": false,
      "system.specialEvolutions.jogress.state": clearState
    });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-digivolution-card dda-jogress-card">
        <h2>${localize("DDA.Jogress.EndTitle")}</h2>
        <ul class="dda-effect-list dda-digivolution-list">
          <li>${escapeHtml(state.resultName || resultActor?.name || localize("DDA.Jogress.UnknownResult"))} ${localize("DDA.Jogress.HasSeparated")}.</li>
          <li>${escapeHtml(primaryTamer?.name ?? state.primaryTamerName ?? localize("DDA.Jogress.UnknownTamer"))}: <strong>${escapeHtml(primaryDigimon?.name ?? state.primaryDigimonName ?? localize("DDA.Jogress.UnknownDigimon"))}</strong>.</li>
          <li>${escapeHtml(secondaryTamer?.name ?? state.secondaryTamerName ?? localize("DDA.Jogress.UnknownTamer"))}: <strong>${escapeHtml(secondaryDigimon?.name ?? state.secondaryDigimonName ?? localize("DDA.Jogress.UnknownDigimon"))}</strong>.</li>
        </ul>
      </div>
    `
  });

  primaryTamer?.sheet?.render(false);
  secondaryTamer?.sheet?.render(false);
  resultActor?.sheet?.render(false);

  return { primaryTamer, secondaryTamer, resultActor };
}


export async function executeHybridEvolution(tamerActor) {
  return executeHybridLikeEvolution(tamerActor, "hybrid");
}

export async function executeBioMergeEvolution(tamerActor) {
  return executeHybridLikeEvolution(tamerActor, "biomerge");
}

async function executeHybridLikeEvolution(tamerActor, requestedMethod = "hybrid") {
  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.HybridOnlyForTamers"));
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

  const confirmed = await Dialog.confirm({
    title: localize("DDA.Hybrid.EndTitle"),
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
    yes: () => true,
    no: () => false,
    defaultYes: false
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

function getEvolutionUnlockDataForTamer(tamerActor, form = {}, previousFormActor = null) {
  if (!tamerActor || tamerActor.type !== "character") {
    return { allowed: true, reason: "" };
  }

  const partner = tamerActor.system?.partner ?? {};
  const unlockedStages = partner.unlockedEvolutionStages ?? {};
  const unlockedForms = Array.isArray(partner.unlockedForms) ? partner.unlockedForms : [];
  const stageKey = String(form.stageKey ?? form.slotKey ?? "").trim();
  const formUuid = String(form.uuid ?? "").trim();

  const previousStageKey = String(previousFormActor?.system?.stage ?? "").trim();
  const previousStageIndex = getStageIndex(previousStageKey);
  const targetStageIndex = getStageIndex(stageKey);
  const isRegression = Number.isFinite(previousStageIndex) && Number.isFinite(targetStageIndex) && targetStageIndex < previousStageIndex;

  // A trava do Narrador controla avanço. Regressão deve continuar possível,
  // especialmente voltar para Bebê I, sem revelar novas evoluções futuras.
  if (isRegression || stageKey === "baby1") {
    return { allowed: true, reason: "" };
  }

  const hasStageLocks = unlockedStages && typeof unlockedStages === "object" && Object.keys(unlockedStages).length > 0;

  if (hasStageLocks && stageKey && unlockedStages[stageKey] === false) {
    return {
      allowed: false,
      reason: localize("DDA.Warning.EvolutionStageLockedByGM")
    };
  }

  if (unlockedForms.length > 0 && formUuid) {
    const isUnlocked = unlockedForms.some((entry) => {
      if (typeof entry === "string") return entry === formUuid;
      return String(entry?.uuid ?? entry?.actorUuid ?? "") === formUuid && entry?.unlocked !== false;
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

    const gmUnlockData = getEvolutionUnlockDataForTamer(tamerActor, form, previousFormActor);

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

  const options = visibleForms
    .map((form) => {
      const slotWarning = form.slotKey !== form.stageKey
        ? ` (${localize("DDA.Evolution.Slot")}: ${form.slotLabel})`
        : "";

      const epLabel =
        localize(
          "DDA.Resource.EvolutionPoints.Short"
        );

      const costLabel = freeEvolution
        ? ` — ${localize(
            "DDA.AllyNpc.Evolution.Free"
          )}`
        : form.costData.peCost > 0
          ? ` — ${form.costData.peCost} ${epLabel}`
          : ` — 0 ${epLabel}`;

      const transitionLabel = getEvolutionTransitionLabelFromType(form.costData.transitionType);
      const blockedLabel = form.costData.allowed
        ? ""
        : ` — ${form.costData.blockedReason}`;

      const disabled = form.costData.allowed ? "" : "disabled";

      return `
        <option value="${escapeHtml(form.uuid)}" ${disabled}>
          ${escapeHtml(form.stageLabel)} — ${escapeHtml(form.name)}${escapeHtml(slotWarning)} — ${escapeHtml(transitionLabel)}${escapeHtml(costLabel)}${escapeHtml(blockedLabel)}
        </option>
      `;
    })
    .join("");

  const hasAllowedForm = visibleForms.some((form) => form.costData.allowed);

  const content = `
    <form class="dda-roll-dialog">
      <div class="form-group">
        <label>${localize("DDA.Evolution.BasePartner")}</label>
        <input type="text" value="${escapeHtml(partnerActor.name)}" readonly />
      </div>

      <div class="form-group">
        <label>${localize("DDA.Evolution.Form")}</label>
        <select name="formUuid">
          ${options}
        </select>
      </div>

      <p class="muted">
        ${localize(
          freeEvolution
            ? "DDA.AllyNpc.Evolution.NoCost"
            : "DDA.Evolution.CostHint"
        )}
      </p>

      ${
        hasAllowedForm
          ? ""
          : `<p class="warning">${localize("DDA.Warning.NoAllowedEvolutionForms")}</p>`
      }
    </form>
  `;

  return new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.Evolution.Dialog.ChooseTitle"),
      content,
      buttons: {
        evolve: {
          label: localize("DDA.Button.Digivolve"),
          callback: (html) => {
            const form = html[0].querySelector("form");
            const uuid = form.formUuid.value;
            const selected = visibleForms.find((entry) => entry.uuid === uuid);

            if (!selected?.costData?.allowed) {
              ui.notifications.warn(selected?.costData?.blockedReason || localize("DDA.Warning.EvolutionMethodDisabled"));
              resolve(null);
              return;
            }

            resolve(selected ?? null);
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: hasAllowedForm ? "evolve" : "cancel",
      close: () => resolve(null)
    }).render(true);
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
    const defaultRange = Number(
      tamerActor?.system?.evolution
        ?.defaultRange?.value ?? 0
    );
    const newStageValue = Number(CONFIG.DDA?.stages?.[newStage]?.stageValue ?? 0);

    if (newStageValue <= defaultRange) {
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

  if (costData.availablePe + costData.availableIp < costData.peCost) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughEPAndIPForDigivolution"));
    return null;
  }

  const suggestedPe = Math.min(costData.availablePe, costData.peCost);
  const suggestedIp = Math.max(0, costData.peCost - suggestedPe);

  const transitionLabel = getEvolutionTransitionLabelFromType(costData.transitionType);

  const content = `
    <form class="dda-roll-dialog">
      <p>
        ${formatI18n("DDA.Evolution.ConfirmChange", {
          previous: `<strong>${escapeHtml(previousFormName)}</strong>`,
          next: `<strong>${escapeHtml(evolvedActor.name)}</strong>`
        })}
      </p>

      <hr>

      <p><strong>${localize("DDA.Label.Type")}:</strong> ${escapeHtml(transitionLabel)}</p>
      <p><strong>${localize("DDA.Evolution.ActionCost")}:</strong> ${costData.actionCost}</p>
      <p><strong>${localize("DDA.Evolution.TotalEvolutionCost")}:</strong> ${costData.peCost}</p>
      <p><strong>${localize("DDA.Label.Reason")}:</strong> ${escapeHtml(costData.reason)}</p>

      ${
        costData.transitionType === "dark"
          ? `<p class="warning"><strong>${localize("DDA.DarkEvolution.WarningTitle")}:</strong> ${localize("DDA.DarkEvolution.WarningText")}</p>`
          : ""
      }

      ${
        costData.transitionType === "armor"
          ? `<p class="muted"><strong>${localize("DDA.ArmorEvolution.Item")}:</strong> ${escapeHtml(findUsableDigimentalForEvolution(tamerActor, evolvedActor)?.name ?? localize("DDA.ArmorEvolution.UnknownDigimental"))}</p>`
          : ""
      }

      <hr>

      <p><strong>${localize("DDA.Evolution.EPAvailable")}:</strong> ${costData.availablePe}</p>
      <p>
  <strong>
    ${localize("DDA.Evolution.IPAvailable")}:
  </strong>

  ${costData.availableIp}

  <small>
    (
      ${costData.availableNormalIp}
      ${localize("DDA.Resource.IP.NormalShort")}
      +
      ${costData.availableTemporaryIp}
      ${localize("DDA.Resource.IP.TemporaryShort")}
    )
  </small>
</p>

      <div class="form-group">
        <label>${localize("DDA.Evolution.EPToSpend")}</label>
        <input type="number" name="peSpent" value="${suggestedPe}" min="0" max="${costData.availablePe}" />
      </div>

      <div class="form-group">
        <label>${localize("DDA.Evolution.IPToSpend")}</label>
        <input type="number" name="ipSpent" value="${suggestedIp}" min="0" max="${costData.availableIp}" />
      </div>

      <p class="muted">
        ${localize("DDA.Evolution.PaymentHint")}
      </p>
    </form>
  `;

  return new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.Evolution.Dialog.ConfirmTitle"),
      content,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Confirm"),
          callback: (html) => {
            const form = html[0].querySelector("form");

            const peSpent = Math.max(0, Number(form.peSpent.value ?? 0));
            const ipSpent = Math.max(0, Number(form.ipSpent.value ?? 0));

            if (peSpent > costData.availablePe) {
              ui.notifications.warn(localize("DDA.Warning.NotEnoughEP"));
              resolve(null);
              return;
            }

            if (ipSpent > costData.availableIp) {
              ui.notifications.warn(localize("DDA.Warning.NotEnoughIP"));
              resolve(null);
              return;
            }

            if (peSpent + ipSpent !== costData.peCost) {
              ui.notifications.warn(localize("DDA.Warning.EPAndIPMustEqualDigivolutionCost"));
              resolve(null);
              return;
            }

            resolve({
              ...costData,
              peSpent,
              ipSpent,
              totalPaid: peSpent + ipSpent,
              remainingCost: 0
            });
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
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

function getOfficialPeCostForStage(stageKey) {
  if (stageKey === "adult") return 1;
  if (stageKey === "perfect") return 3;
  if (stageKey === "ultimate") return 5;
  if (stageKey === "ultimatePlus") return 5;

  return 0;
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
  const normalized = normalizeName(method).replace(/[\s_\-:()]+/g, "");
  return normalized === "jogress" || normalized === "jogressevolution" || normalized === "jointprogress" || normalized === "dnadigivolution" || normalized === "evolucaojogress" || normalized === "evoluçãojogress";
}

function isHybridEvolutionGraphMethod(method = "") {
  const normalized = normalizeName(method).replace(/[\s_\-:()]+/g, "");
  return normalized === "hybrid" || normalized === "hybridevolution" || normalized === "spirit" || normalized === "spiritevolution" ||
    normalized === "biomerge" || normalized === "biomergeevolution" || normalized === "matrixevolution" ||
    normalized === "mindlink" || normalized === "mindlinkevolution";
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
    primaryTamerUuid: "",
    primaryTamerName: "",
    primaryDigimonUuid: "",
    primaryDigimonName: "",
    secondaryTamerUuid: "",
    secondaryTamerName: "",
    secondaryDigimonUuid: "",
    secondaryDigimonName: "",
    masteredBeforeUse: false,
    firstSuccessfulUse: false,
    sharedInitiative: 0,
    componentBonusDp: 0,
    primaryDigimonBonusDp: 0,
    secondaryDigimonBonusDp: 0,
    startedAt: ""
  };
}

function isTamerInActiveJogress(tamerActor) {
  return Boolean(tamerActor?.system?.specialEvolutions?.jogress?.state?.active);
}

function participantsHaveSameStage(participants = []) {
  const stages = participants.map((participant) => String(participant?.digimon?.system?.stage ?? "").trim()).filter(Boolean);
  return stages.length >= 2 && stages.every((stage) => stage === stages[0]);
}

function getJogressHistoryKey(recipe, participants = [], resultActor = null) {
  const recipeId = String(recipe?.id ?? recipe?.label ?? resultActor?.name ?? "jogress").trim();
  const componentKeys = participants.map((participant) => normalizeUuid(participant?.digimon?.uuid) || normalizeName(participant?.digimon?.name)).filter(Boolean).sort().join("+");
  return `${recipeId}::${componentKeys}`;
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
  for (const participant of participants) {
    const tamer = participant?.tamer;
    if (!tamer) continue;
    const mastered = foundry.utils.deepClone(getMasteredJogressRecipes(tamer));
    const alreadyMastered = mastered.some((entry) => typeof entry === "string" ? entry === historyKey : entry?.historyKey === historyKey);
    if (alreadyMastered) continue;
    mastered.push({ historyKey, recipeId: data.recipeId ?? "", resultUuid: data.resultUuid ?? "", resultName: data.resultName ?? "", masteredAt: new Date().toISOString() });
    await tamer.update({ "system.specialEvolutions.jogress.masteredRecipes": mastered });
  }
}

function buildJogressRuleData({ recipe, resultActor, mastered }) {
  const resultStage = resultActor?.system?.stage ?? recipe?.result?.stage ?? "adult";
  const resultStageValue = getStageValue(resultStage);
  return {
    resultStage,
    resultStageValue,
    mastered,
    actionCostPerTamer: Math.max(0, Number(recipe?.cost?.actions ?? 2)),
    peCostPerTamer: mastered ? Math.max(0, Number(recipe?.cost?.pe ?? resultStageValue)) : Math.max(0, Number(recipe?.cost?.firstUsePe ?? 0)),
    checkTn: Math.max(1, Number(recipe?.check?.tn ?? 15)),
    checkFormula: recipe?.check?.formula ?? "3d6 + @willpower"
  };
}

async function confirmJogressStart({ option, resultActor, ruleData }) {
  const participants = option.participants.map((participant) => `<li><strong>${escapeHtml(participant.digimon?.name ?? localize("DDA.Jogress.UnknownDigimon"))}</strong> — ${escapeHtml(participant.tamer?.name ?? localize("DDA.Jogress.UnknownTamer"))}</li>`).join("");
  const checkLabel = ruleData.mastered ? localize("DDA.Jogress.ReliableRepeat") : `3d6 + ${localize("DDA.TamerAttribute.Willpower")} / ${localize("DDA.Roll.TN")} ${ruleData.checkTn}`;
  return Dialog.confirm({
    title: localize("DDA.Jogress.ConfirmTitle"),
    content: `<div class="dda-roll-dialog dda-jogress-dialog"><p>${formatI18n("DDA.Jogress.ConfirmChange", { previous: `<strong>${escapeHtml(option.recipe.label || option.recipe.id)}</strong>`, next: `<strong>${escapeHtml(resultActor.name)}</strong>` })}</p><ul>${participants}</ul><hr><p><strong>${localize("DDA.Jogress.Check")}:</strong> ${checkLabel}</p><p><strong>${localize("DDA.Evolution.ActionCost")}:</strong> ${ruleData.actionCostPerTamer} ${localize("DDA.Jogress.PerTamer")}.</p><p><strong>${localize("DDA.Resource.EvolutionPoints.Short")}:</strong> ${ruleData.peCostPerTamer} ${localize("DDA.Jogress.PerTamer")}.</p><p class="muted">${localize("DDA.Jogress.OfficialRulesHint")}</p></div>`,
    yes: () => true,
    no: () => false,
    defaultYes: true
  });
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
    entries.push({ tamer, actionCost: ruleData.actionCostPerTamer, peCost: ruleData.peCostPerTamer });
  }
  return { entries, totalPeCost: entries.reduce((total, entry) => total + entry.peCost, 0) };
}

async function payJogressRuleCosts(paymentData) {
  for (const entry of paymentData.entries) {
    await entry.tamer.update({
      "system.combat.actions.value": Math.max(0, Number(entry.tamer.system.combat?.actions?.value ?? 0) - entry.actionCost),
      "system.resources.evolutionPoints.value": Math.max(0, Number(entry.tamer.system.resources?.evolutionPoints?.value ?? 0) - entry.peCost)
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
    results.push({ tamer, digimon: participant.digimon, roll, total: Number(roll.total ?? 0), tn, success: Number(roll.total ?? 0) >= tn });
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
  const values = participants.map((participant) => Math.min(Number(participant.tamer?.system?.combat?.initiative?.value ?? 0), Number(participant.digimon?.system?.combat?.initiative?.value ?? 0))).filter((value) => Number.isFinite(value));
  return values.length ? Math.min(...values) : 0;
}

async function updateJogressSharedInitiative(participants = [], resultActor, sharedInitiative = 0) {
  for (const participant of participants) {
    if (participant?.tamer) await participant.tamer.update({ "system.combat.initiative.value": sharedInitiative });
  }
  if (resultActor) await resultActor.update({ "system.combat.initiative.value": sharedInitiative });
}

function getDigimonBonusDp(digimonActor) {
  if (!digimonActor) return 0;

  const creationBonus = Number(
    digimonActor.system?.creation?.dp?.bonus ?? 0
  ) || 0;

  const advancementBonus = Number(
    digimonActor.system?.advancement?.bonusDp?.total ?? 0
  ) || 0;

  return Math.max(
    0,
    creationBonus,
    advancementBonus
  );
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
    <form class="dda-roll-dialog dda-hybrid-dialog">
      <p>${formatI18n("DDA.Hybrid.ChooseHint", {
        tamer: `<strong>${escapeHtml(tamerActor.name)}</strong>`,
        partner: `<strong>${escapeHtml(currentFormActor?.name ?? localize("DDA.Hybrid.NoPartnerRequired"))}</strong>`
      })}</p>

      <div class="form-group">
        <label>${localize("DDA.Hybrid.Form")}</label>
        <select name="optionIndex">${optionRows}</select>
      </div>
    </form>
  `;

  return new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.Hybrid.DialogTitle"),
      content,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Confirm"),
          callback: async (html) => {
            const form = html[0].querySelector("form");
            resolve(options[Number(form.optionIndex.value ?? 0)] ?? null);
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
  });
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

  return Dialog.confirm({
    title: localize("DDA.Hybrid.ConfirmTitle"),
    content,
    yes: () => true,
    no: () => false,
    defaultYes: true
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

async function collectAvailableJogressOptions(tamerActor, currentFormActor) {
  const recipes = collectJogressRecipes(tamerActor).filter((recipe) => {
    return recipe.method === "jogress" && !recipe.hidden;
  });

  if (!recipes.length) return [];

  const tamerEntries = await collectTamerPartnerEntries();
  const currentEntry = {
    tamer: tamerActor,
    digimon: currentFormActor
  };

  const options = [];

  for (const recipe of recipes) {
    const components = Array.isArray(recipe.components) ? recipe.components : [];
    if (components.length < 2) continue;

    for (let index = 0; index < components.length; index += 1) {
      const currentRequirement = components[index];
      if (!matchesJogressRequirement(currentFormActor, currentRequirement)) continue;

      const remainingRequirements = components.filter((_component, componentIndex) => componentIndex !== index);
      const participantSets = findJogressParticipantSets(remainingRequirements, tamerEntries, [tamerActor.uuid]);

      for (const participantSet of participantSets) {
        const resultActor = await resolveJogressResultActor(recipe);
        if (!resultActor) continue;

        options.push({
          id: `${recipe.id}-${options.length}`,
          recipe,
          resultActor,
          participants: [currentEntry, ...participantSet]
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

  const recipeMap = new Map();

  for (const recipe of [...configRecipes, ...globalRecipes, ...actorRecipes]) {
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
    temporary: recipe.temporary ?? true,
    hidden: Boolean(recipe.hidden)
  };
}

async function collectTamerPartnerEntries() {
  const entries = [];

  for (const actor of game.actors ?? []) {
    if (!actor || actor.type !== "character") continue;
    if (isTamerInActiveJogress(actor)) continue;

    const currentFormUuid = actor.system.partner?.currentFormUuid || actor.system.partner?.uuid;
    if (!currentFormUuid) continue;

    const digimon = await resolveActor(currentFormUuid);
    if (!digimon || digimon.type !== "digimon") continue;

    entries.push({
      tamer: actor,
      digimon
    });
  }

  return entries;
}

function findJogressParticipantSets(requirements, entries, usedTamerUuids = []) {
  if (!requirements.length) return [[]];

  const [requirement, ...remainingRequirements] = requirements;
  const matches = entries.filter((entry) => {
    if (!entry?.tamer || !entry?.digimon) return false;
    if (usedTamerUuids.includes(entry.tamer.uuid)) return false;
    return matchesJogressRequirement(entry.digimon, requirement);
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

function matchesJogressRequirement(actor, requirement = {}) {
  if (!actor) return false;

  const actorUuid = normalizeUuid(actor.uuid ?? "");
  const actorName = normalizeName(actor.name);
  const actorSpecies = normalizeName(actor.system?.species ?? "");
  const actorStage = String(actor.system?.stage ?? "").trim();

  const requiredUuid = normalizeUuid(requirement.uuid ?? requirement.actorUuid ?? "");
  const requiredName = normalizeName(requirement.name ?? "");
  const requiredSpecies = normalizeName(requirement.species ?? "");
  const requiredStage = String(requirement.stage ?? "").trim();

  if (requiredUuid && actorUuid !== requiredUuid) return false;
  if (requiredStage && actorStage !== requiredStage) return false;

  if (requiredSpecies) {
    return actorSpecies === requiredSpecies || actorName === requiredSpecies;
  }

  if (requiredName) {
    return actorName === requiredName || actorSpecies === requiredName;
  }

  return Boolean(requiredUuid || requiredStage);
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

  return Array.from(game.actors ?? []).find((actor) => {
    if (!actor || actor.type !== "digimon") return false;

    const actorName = normalizeName(actor.name);
    const actorSpecies = normalizeName(actor.system?.species ?? "");

    return (resultName && (actorName === resultName || actorSpecies === resultName)) ||
      (resultSpecies && (actorName === resultSpecies || actorSpecies === resultSpecies));
  }) ?? null;
}

function calculateJogressCost(tamerActor, recipe) {
  const actionCost = Math.max(0, Number(recipe?.cost?.actions ?? 1));
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

async function chooseJogressOption(options, tamerActor, currentFormActor) {
  if (!options.length) return null;

  if (options.length === 1) {
    return options[0];
  }

  const optionRows = options.map((option, index) => {
    const participants = option.participants.map((participant) => {
      return `${participant.digimon?.name ?? localize("DDA.Jogress.UnknownDigimon")} (${participant.tamer?.name ?? localize("DDA.Jogress.UnknownTamer")})`;
    }).join(" + ");

    return `
      <option value="${index}">
        ${escapeHtml(participants)} → ${escapeHtml(option.resultActor.name)}
      </option>
    `;
  }).join("");

  const content = `
    <form class="dda-roll-dialog dda-jogress-dialog">
      <p>${formatI18n("DDA.Jogress.ChooseHint", {
        tamer: `<strong>${escapeHtml(tamerActor.name)}</strong>`,
        partner: `<strong>${escapeHtml(currentFormActor.name)}</strong>`
      })}</p>

      <div class="form-group">
        <label>${localize("DDA.Jogress.Recipe")}</label>
        <select name="optionIndex">${optionRows}</select>
      </div>
    </form>
  `;

  return new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.Jogress.DialogTitle"),
      content,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Confirm"),
          callback: async (html) => {
            const form = html[0].querySelector("form");
            const optionIndex = Number(form.optionIndex.value ?? 0);
            const option = options[optionIndex] ?? null;
            resolve(option);
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
  });
}

async function confirmJogressOption(option, tamerActor, currentFormActor) {
  const participants = option.participants.map((participant) => {
    return `<li><strong>${escapeHtml(participant.digimon?.name ?? localize("DDA.Jogress.UnknownDigimon"))}</strong> — ${escapeHtml(participant.tamer?.name ?? localize("DDA.Jogress.UnknownTamer"))}</li>`;
  }).join("");

  const content = `
    <div class="dda-roll-dialog dda-jogress-dialog">
      <p>${formatI18n("DDA.Jogress.ConfirmChange", {
        previous: `<strong>${escapeHtml(currentFormActor.name)}</strong>`,
        next: `<strong>${escapeHtml(option.resultActor.name)}</strong>`
      })}</p>

      <ul>${participants}</ul>

      <p class="muted">${localize("DDA.Jogress.SafeModeHint")}</p>
    </div>
  `;

  return Dialog.confirm({
    title: localize("DDA.Jogress.ConfirmTitle"),
    content,
    yes: () => true,
    no: () => false,
    defaultYes: true
  });
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
  tokenImg: actor.system?.evolution?.tokenImg || actor.prototypeToken?.texture?.src || actor.img || ""
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

  const { partnerActor, currentFormActor } = await getPartnerAndCurrentFormForSpecialAction(tamerActor);
  if (!partnerActor || !currentFormActor) return null;

  if (isEvolutionLockedForCombat(partnerActor) || isEvolutionLockedForCombat(currentFormActor)) {
    ui.notifications.warn(localize("DDA.Warning.EvolutionLockedUntilCombatEnd"));
    return null;
  }

  const forms = (await collectEvolutionForms(partnerActor, currentFormActor))
    .filter((form) => isHigherStage(currentFormActor.system?.stage, form.stageKey));

  if (!forms.length) {
    ui.notifications.warn(localize("DDA.Warning.NoEvolutionFormsRegistered"));
    return null;
  }

  const selectedForm = await chooseForcedOrBlastForm(forms, {
    title: localize("DDA.ForcedEvolution.ChooseTitle"),
    buttonLabel: localize("DDA.Button.ForceEvolution")
  });

  if (!selectedForm) return null;

  const resultActor = await resolveActor(selectedForm.uuid);
  if (!resultActor || resultActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotDigimon"));
    return null;
  }

  const actionCost = 2;
  const currentActions = Number(tamerActor.system.combat?.actions?.value ?? 0);
  if (currentActions < actionCost) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForForcedEvolution"));
    return null;
  }

  const stageCost = getOfficialPeCostForStage(resultActor.system?.stage);
  const tn = 18 + stageCost;
  const check = await rollTamerFixedCheck(tamerActor, "willpower", "", tn, localize("DDA.ForcedEvolution.CheckTitle"));
  if (!check) return null;

  await tamerActor.update({
    "system.combat.actions.value": Math.max(0, currentActions - actionCost)
  });

  if (!check.success) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
      content: renderSimpleDdaCard("dda-forced-evolution-card failure", localize("DDA.ForcedEvolution.Title"), [
        formatI18n("DDA.ForcedEvolution.Failed", { actor: escapeHtml(tamerActor.name), result: check.total, tn })
      ])
    });
    return null;
  }

  await fullyRestoreWounds(
    resultActor,
    {
      clearTemp: true
    }
  );

  const defaultStage = partnerActor.system?.evolution?.defaultStage || getDefaultStageFromRange(tamerActor);
  const belowDefaultStage = getStageDirectlyBelow(defaultStage) || defaultStage;
  const revertActor = check.criticalSuccess
    ? await findFormByStage(partnerActor, defaultStage, currentFormActor)
    : await findFormByStage(partnerActor, belowDefaultStage, currentFormActor);

  const state = {
    active: true,
    method: "forced",
    resultUuid: resultActor.uuid,
    resultName: resultActor.name,
    previousFormUuid: currentFormActor.uuid,
    previousFormName: currentFormActor.name,
    revertUuid: revertActor?.uuid ?? currentFormActor.uuid,
    revertName: revertActor?.name ?? currentFormActor.name,
    roundsRemaining: 3,
    checkTotal: check.total,
    checkTn: tn,
    criticalSuccess: check.criticalSuccess,
    startedAt: new Date().toISOString()
  };

  await tamerActor.update({
    "system.partner.currentFormUuid": resultActor.uuid,
    "system.partner.currentFormName": resultActor.name,
    "system.specialEvolutions.forced.state": state
  });

  await resultActor.update({
    "system.tamer.name": tamerActor.name,
    "system.tamer.uuid": tamerActor.uuid,
    "system.specialForm.kind": "forced",
    "system.specialForm.method": "forced",
    "system.specialEvolutions.forced.active": true,
    "system.specialEvolutions.forced.state": state
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderSimpleDdaCard("dda-forced-evolution-card success", localize("DDA.ForcedEvolution.Title"), [
      formatI18n("DDA.ForcedEvolution.Success", { previous: escapeHtml(currentFormActor.name), next: escapeHtml(resultActor.name), rounds: 3 }),
      formatI18n("DDA.ForcedEvolution.RevertHint", { form: escapeHtml(state.revertName) })
    ])
  });

  resultActor.sheet?.render(true);
  tamerActor.sheet?.render(false);
  return resultActor;
}

export async function endForcedEvolution(tamerActor) {
  const state = tamerActor?.system?.specialEvolutions?.forced?.state ?? {};
  if (!state.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveForcedEvolution"));
    return null;
  }

  const resultActor = await resolveActor(state.resultUuid);
  const revertActor = await resolveActor(state.revertUuid) ?? await resolveActor(state.previousFormUuid);

  await tamerActor.update({
    "system.partner.currentFormUuid": revertActor?.uuid ?? state.previousFormUuid ?? "",
    "system.partner.currentFormName": revertActor?.name ?? state.previousFormName ?? "",
    "system.specialEvolutions.forced.state.active": false
  });

  if (resultActor) {
    await resultActor.update({
      "system.specialEvolutions.forced.active": false,
      "system.specialEvolutions.forced.state.active": false,
      "system.specialForm.kind": "",
      "system.specialForm.method": ""
    });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderSimpleDdaCard("dda-forced-evolution-card", localize("DDA.ForcedEvolution.EndTitle"), [
      formatI18n("DDA.ForcedEvolution.Ended", { form: escapeHtml(revertActor?.name ?? state.previousFormName ?? "") })
    ])
  });

  tamerActor.sheet?.render(false);
  resultActor?.sheet?.render(false);
  return revertActor;
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

  const { partnerActor, currentFormActor } = await getPartnerAndCurrentFormForSpecialAction(tamerActor);
  if (!partnerActor || !currentFormActor) return null;

  const blastUses = Number(tamerActor.system.blastEvolution?.uses?.value ?? 0);
  if (blastUses <= 0) {
    ui.notifications.warn(localize("DDA.Warning.NoBlastEvolutionUses"));
    return null;
  }

  const battery = currentFormActor.system?.resources?.battery ?? partnerActor.system?.resources?.battery ?? {};
  const batteryValue = Number(battery.value ?? 0);
  const batteryMax = Number(battery.max ?? 0);

  if (batteryMax <= 0 || batteryValue < batteryMax) {
    ui.notifications.warn(formatI18n("DDA.Warning.BlastRequiresFullBattery", { current: batteryValue, max: batteryMax }));
    return null;
  }

  const forms = (await collectEvolutionForms(partnerActor, currentFormActor))
    .filter((form) => isHigherStage(currentFormActor.system?.stage, form.stageKey));

  if (!forms.length) {
    ui.notifications.warn(localize("DDA.Warning.NoBlastEvolutionForms"));
    return null;
  }

  const selectedForm = await chooseForcedOrBlastForm(forms, {
    title: localize("DDA.BlastEvolution.ChooseTitle"),
    buttonLabel: localize("DDA.Button.BlastEvolution"),
    includeMode: true
  });

  if (!selectedForm) return null;

  const resultActor = await resolveActor(selectedForm.uuid);
  if (!resultActor || resultActor.type !== "digimon") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotDigimon"));
    return null;
  }

  const mode = selectedForm.blastMode || "attack";
  const tamerActionCost = 1;
  const digimonActionCost = mode === "intercede" ? 1 : 2;
  const tamerActions = Number(tamerActor.system.combat?.actions?.value ?? 0);
  const digimonActions = Number(currentFormActor.system.combat?.actions?.value ?? partnerActor.system.combat?.actions?.value ?? 0);

  if (tamerActions < tamerActionCost || digimonActions < digimonActionCost) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForBlastEvolution"));
    return null;
  }

  const blastStageSv = getStageValue(resultActor.system?.stage);
  const tn = 12 + blastStageSv;
  const check = await rollTamerFixedCheck(tamerActor, "willpower", "", tn, localize("DDA.BlastEvolution.AfterCheckTitle"));
  if (!check) return null;

  await tamerActor.update({
    "system.combat.actions.value": Math.max(0, tamerActions - tamerActionCost),
    "system.blastEvolution.uses.value": Math.max(0, blastUses - 1),
    "system.partner.currentFormUuid": resultActor.uuid,
    "system.partner.currentFormName": resultActor.name
  });

  const resultWounds = resultActor.system.miscStats?.wounds ?? {};
  const resultWoundMax = Number(resultWounds.max ?? resultWounds.value ?? 0);
  const resultWoundValue = mode === "intercede" ? Math.min(resultWoundMax, Math.max(1, batteryValue)) : resultWoundMax;

  await currentFormActor.update({
    "system.resources.battery.value": 0,
    "system.combat.actions.value": Math.max(0, digimonActions - digimonActionCost)
  });

  await resultActor.update({
    "system.tamer.name":
      tamerActor.name,

    "system.tamer.uuid":
      tamerActor.uuid,

    "system.resources.battery.value":
      0,

    "system.miscStats.wounds.value":
      resultWoundValue,

    "system.miscStats.wounds.temp.value":
      0,

    "system.combat.defeated":
      false,

    "system.specialForm.kind":
      "blast",

    "system.specialForm.method":
      "blast"
  });

  const revertData = await resolveBlastReversion({ tamerActor, partnerActor, currentFormActor, resultActor, check });
  const revertActor = revertData.actor;

  if (revertActor) {
    const revertBatteryMax = Number(revertActor.system.resources?.battery?.max ?? 0);
    const nextBatteryMax = Math.max(0, revertBatteryMax - 1);
    await revertActor.update({
      "system.resources.battery.max": nextBatteryMax,
      "system.resources.battery.value": Math.min(Number(revertActor.system.resources?.battery?.value ?? 0), nextBatteryMax),
      "system.status.batteryMaxReducedUntilCombatEnd": true,
      ...(revertData.lockEvolution ? { "system.status.evolutionLockedUntilCombatEnd": true } : {})
    });
  }

  await tamerActor.update({
    "system.partner.currentFormUuid": revertActor?.uuid ?? partnerActor.uuid,
    "system.partner.currentFormName": revertActor?.name ?? partnerActor.name,
    "system.specialEvolutions.blast.state": {
      active: false,
      lastResultUuid: resultActor.uuid,
      lastResultName: resultActor.name,
      mode,
      checkTotal: check.total,
      checkTn: tn,
      outcome: check.outcome,
      revertedToUuid: revertActor?.uuid ?? partnerActor.uuid,
      revertedToName: revertActor?.name ?? partnerActor.name,
      startedAt: new Date().toISOString()
    }
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamerActor }),
    content: renderSimpleDdaCard(`dda-blast-evolution-card ${check.outcome}`, localize("DDA.BlastEvolution.Title"), [
      formatI18n("DDA.BlastEvolution.Executed", { previous: escapeHtml(currentFormActor.name), next: escapeHtml(resultActor.name), mode: localize(`DDA.BlastEvolution.Mode.${mode}`) }),
      formatI18n("DDA.BlastEvolution.CheckResult", { total: check.total, tn, result: check.label }),
      formatI18n("DDA.BlastEvolution.RevertedTo", { form: escapeHtml(revertActor?.name ?? partnerActor.name) })
    ])
  });

  tamerActor.sheet?.render(false);
  resultActor.sheet?.render(true);
  revertActor?.sheet?.render(false);
  return resultActor;
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

async function getPartnerAndCurrentFormForSpecialAction(tamerActor) {
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

  const currentFormUuid = tamerActor.system.partner?.currentFormUuid || partnerActor.uuid;
  const currentFormActor = await resolveActor(currentFormUuid) ?? partnerActor;
  return { partnerActor, currentFormActor };
}

function isHigherStage(fromStage, toStage) {
  const fromIndex = getStageIndex(fromStage);
  const toIndex = getStageIndex(toStage);
  return fromIndex !== -1 && toIndex !== -1 && toIndex > fromIndex;
}

function chooseForcedOrBlastForm(forms, options = {}) {
  const includeMode = Boolean(options.includeMode);
  const optionHtml = forms.map((form) => {
    return `<option value="${escapeHtml(form.uuid)}">${escapeHtml(form.stageLabel ?? getStageLabel(form.stageKey))} — ${escapeHtml(form.name)}</option>`;
  }).join("");

  const modeHtml = includeMode ? `
    <div class="form-group">
      <label>${localize("DDA.BlastEvolution.ModeLabel")}</label>
      <select name="blastMode">
        <option value="attack">${localize("DDA.BlastEvolution.Mode.attack")}</option>
        <option value="intercede">${localize("DDA.BlastEvolution.Mode.intercede")}</option>
      </select>
    </div>
  ` : "";

  return new Promise((resolve) => {
    new Dialog({
      title: options.title ?? localize("DDA.Evolution.Dialog.ChooseTitle"),
      content: `
        <form class="dda-roll-dialog">
          <div class="form-group">
            <label>${localize("DDA.Evolution.Form")}</label>
            <select name="formUuid">${optionHtml}</select>
          </div>
          ${modeHtml}
        </form>
      `,
      buttons: {
        confirm: {
          label: options.buttonLabel ?? localize("DDA.Button.Confirm"),
          callback: (html) => {
            const form = html[0].querySelector("form");
            const selected = forms.find((entry) => entry.uuid === form.formUuid.value);
            resolve(selected ? { ...selected, blastMode: form.blastMode?.value ?? "attack" } : null);
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
  });
}

async function rollTamerFixedCheck(actor, attributeKey, skillKey, tn, title) {
  const attribute = actor.system.attributes?.[attributeKey];
  const skill = actor.system.skills?.[skillKey];

  if (!attribute) {
    ui.notifications.warn(localize("DDA.Warning.AttributeNotFound"));
    return null;
  }

  const attributeValue = Number(attribute.value ?? 0);
  const skillValue = Number(skill?.value ?? 0);
  const skillModifier = skillValue > 0 ? skillValue : -1;
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
  const range = Number(tamerActor.system.evolution?.defaultRange?.value ?? 1);
  const stageOrder = getStageOrder();
  return stageOrder[Math.clamp(range, 0, stageOrder.length - 1)] ?? "child";
}

async function findFormByStage(partnerActor, stageKey, fallbackActor = null) {
  if (fallbackActor?.system?.stage === stageKey) return fallbackActor;

  const graph = getNormalizedEvolutionGraph(partnerActor);
  for (const node of graph.nodes) {
    if (!node.actorUuid) continue;
    const actor = await resolveActor(node.actorUuid);
    if (actor?.system?.stage === stageKey) return actor;
  }

  const forms = await collectEvolutionForms(partnerActor, fallbackActor ?? partnerActor);
  const found = forms.find((form) => form.stageKey === stageKey);
  return found ? await resolveActor(found.uuid) : fallbackActor ?? partnerActor;
}

async function resolveBlastReversion({ tamerActor, partnerActor, currentFormActor, resultActor, check }) {
  if (check.criticalFailure) {
    const baby1 = await findFormByStage(partnerActor, "baby1", partnerActor);
    return { actor: baby1, lockEvolution: true };
  }

  if (check.criticalSuccess) return { actor: currentFormActor, lockEvolution: false };

  const defaultStage = partnerActor.system?.evolution?.defaultStage || getDefaultStageFromRange(tamerActor);

  if (check.success) {
    return { actor: await findFormByStage(partnerActor, defaultStage, currentFormActor), lockEvolution: false };
  }

  const belowDefaultStage = getStageDirectlyBelow(defaultStage) || defaultStage;
  return { actor: await findFormByStage(partnerActor, belowDefaultStage, currentFormActor), lockEvolution: true };
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
