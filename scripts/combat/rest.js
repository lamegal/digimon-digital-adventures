import { DDA_TAMER_TALENTS } from "../data/tamer-talents.js";
import { getTamerTalentUsesMax } from "../rules/tamer-talent-automation.js";
import {
  getProjectedTamerDefaultRangeAfterRest,
  getTamerEvolutionPointMaximum,
  requestReleasePendingMilestonesForRest
} from "../rules/tamer-progression.js";
import {
  clearTamerTemporaryIp
} from "../rules/tamer-resources.js";

import {
  requestClearBusyHandsItems
} from "../rules/tamer-talent-socket.js";

import {
  clearGloriousWorldBenefit
} from "../rules/tamer-talent-transversal.js";

import {
  clearNarrativeTalentRestStates
} from "../rules/tamer-talent-narrative.js";

import {
  chooseDefaultPartnerFormDuringRest
} from "./evolution.js";

export async function takeTamerBreak(actor) {
  if (!actor || actor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.BreakOnlyForTamers"));
    return;
  }

  const alreadyUsed = Boolean(actor.system.recovery?.breakUsedSinceCombat);
  if (alreadyUsed) {
    ui.notifications.warn(localize("DDA.Break.AlreadyUsedContent"));
    return;
  }

  const updates = {
    "system.recovery.breakUsedSinceCombat": true
  };

  const wounds = actor.system.derived?.wounds ?? {};
  const woundMax = Number(wounds.max ?? wounds.value ?? 0);
  if (woundMax > 0) updates["system.derived.wounds.value"] = woundMax;

  const epCurrent =
    Math.max(
      0,
      Number(
        actor.system
          .resources
          ?.evolutionPoints
          ?.value ??
        0
      )
    );

  const epMax =
    getTamerEvolutionPointMaximum(
      actor
    );

  updates[
    "system.resources.evolutionPoints.max"
  ] = epMax;

  updates[
    "system.resources.evolutionPoints.value"
  ] = Math.min(
    epMax,
    epCurrent + 1
  );

  await actor.update(updates);

  const partnerUuid = actor.system.partner?.uuid || actor.system.partner?.currentFormUuid;
  let partner = null;
  if (partnerUuid) {
    try {
      const doc = await fromUuid(partnerUuid);
      partner = doc?.documentName === "Actor" ? doc : null;
    } catch (_error) {}
  }

  if (partner?.type === "digimon" || partner?.type === "npc") {
    const partnerWounds = partner.system.miscStats?.wounds ?? {};
    const partnerMax = Number(partnerWounds.max ?? partnerWounds.value ?? 0);
    if (partnerMax > 0) {
      await partner.update({
        "system.miscStats.wounds.value": partnerMax,
        "system.combat.defeated": false
      });
    }
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive dda-break-card">
        <h2>${localize("DDA.Break.Title")}</h2>
        <ul class="dda-effect-list">
          <li>${localize("DDA.Break.WoundsRestored")}</li>
          <li>${localize("DDA.Break.EPRestored")}: <strong>${Math.min(epMax, epCurrent + 1)} / ${epMax}</strong>.</li>
        </ul>
      </div>
    `
  });
}

export async function takeTamerRest(actor) {
  if (!actor || actor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.RestOnlyForTamers"));
    return;
  }

  const epMax =
    getTamerEvolutionPointMaximum(
      actor
    );
  const maxActions = Number(actor.system.combat?.actions?.max ?? 2);
  const tamerTalentUsesUpdates = getTamerTalentUsesRestUpdates(actor);

  const actorUpdates = {
    "system.tormentState.rollPenalty": 0,
    "system.tormentState.tamerActionPenalty": 0,
    "system.tormentState.combatActionLocked": false,
    "system.tormentState.actionLockUntilCombatEnd": false,

    "system.aspects.major.uses.value": Number(actor.system.aspects?.major?.uses?.max ?? 1),
    "system.aspects.minor.uses.value": Number(actor.system.aspects?.minor?.uses?.max ?? 2),

    "system.resources.evolutionPoints.max":
      epMax,

    "system.resources.evolutionPoints.value":
      epMax,

    "system.combat.actions.value":
      maxActions,
    "system.recovery.breakUsedSinceCombat": false,

    ...tamerTalentUsesUpdates
  };

  const tormentUpdates = [];
  const digimentalUpdates = [];

  for (const item of actor.items) {
    if (item.type === "digimental") {
      const maxUses = Math.max(1, Number(item.system?.uses?.max ?? 1));

      digimentalUpdates.push({
        _id: item.id,
        "system.usedUntilRest": false,
        "system.uses.enabled": true,
        "system.uses.value": maxUses,
        "system.uses.max": maxUses,
        "system.uses.recharge": "rest"
      });

      continue;
    }

    if (item.type !== "torment") continue;

    tormentUpdates.push({
      _id: item.id,
      "system.checkedUntilRest": false,
      "system.penalty.enabled": false,
      "system.penalty.value": 0,
      "system.penalty.combatActionLock": false
    });
  }

  await clearGloriousWorldBenefit(actor);
  await clearNarrativeTalentRestStates(actor);
  await actor.update(actorUpdates);

  const clearedBusyHandsItems =
    await requestClearBusyHandsItems(
      actor
    );

  const clearedTemporaryIp =
    await clearTamerTemporaryIp(actor, {
      expiresOn: "rest"
    });

  if (tormentUpdates.length > 0) {
    await actor.updateEmbeddedDocuments("Item", tormentUpdates);
  }

  if (digimentalUpdates.length > 0) {
    await actor.updateEmbeddedDocuments("Item", digimentalUpdates);
  }

  const restedPartners =
    await restLinkedPartnerActors(actor);

  const milestoneRelease =
    await requestReleasePendingMilestonesForRest(actor);

  // 8.05b: during a Rest the player may choose a Default Stage/Form within
  // their current Default Range. Milestones are released first so a newly
  // unlocked Default Range threshold is immediately usable when the GM is
  // executing the release locally.
  const projectedDefaultRange = getProjectedTamerDefaultRangeAfterRest(actor);
  const defaultFormChange = await chooseDefaultPartnerFormDuringRest(actor, {
    defaultRangeOverride: projectedDefaultRange
  });

  if (defaultFormChange?.selected && !defaultFormChange.selected.current) {
    // Applying a different stored form can restore that form's saved Item
    // state. Re-run Partner Rest after the transformation so rest-recharge
    // Qualities and Actions remain correctly restored on the chosen default.
    await restLinkedPartnerActors(actor);
  }

  const milestoneReleaseRow = milestoneRelease?.releasedTargets > 0
    ? `
      <li>
        ${formatI18n(
          "DDA.Progression.Rest.BenefitsReleased",
          { count: milestoneRelease.releasedTargets }
        )}
      </li>
    `
    : milestoneRelease?.requested
      ? `
        <li>
          ${localize("DDA.Progression.Rest.ReleaseRequested")}
        </li>
      `
      : "";

  const defaultFormRow = defaultFormChange?.selected
    ? `
      <li>
        ${formatI18n(
          "DDA.Evolution.DefaultStage.RestApplied",
          { form: defaultFormChange.selected.name, stage: defaultFormChange.selected.stageLabel }
        )}
      </li>
    `
    : "";

  const linkedPartnerRows =
    restedPartners.length > 0
      ? `
          <li>
            ${localize("DDA.Rest.LinkedPartner")}:
            <strong>${restedPartners[0].name}</strong>.
          </li>

          <li>
            ${localize(
              "DDA.Rest.PartnerWoundsRestored"
            )}
          </li>

          <li>
            ${localize(
              "DDA.Rest.PartnerActionsRestored"
            )}
          </li>

          <li>
            ${localize(
              "DDA.Rest.PartnerQualityUsesRestored"
            )}
          </li>
        `
      : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive dda-rest-card">
        <h2>${localize("DDA.Rest.Title")}</h2>

        <div class="dda-rest-hero">
          <span>${localize("DDA.Rest.Recovery")}</span>
          <strong>${actor.name}</strong>
          <small>${localize("DDA.Rest.TamerFinishedRest")}</small>
        </div>

        <ul class="dda-effect-list dda-rest-list">
          <li>
            ${localize("DDA.Rest.TormentPenalties")}:
            <strong>${localize("DDA.Rest.Removed")}</strong>.
          </li>

          <li>
            ${localize("DDA.Rest.Torments")}:
            <strong>${localize("DDA.Rest.CanBeCheckedAgain")}</strong>.
          </li>

          <li>
            ${localize("DDA.Rest.TormentActionLock")}:
            <strong>${localize("DDA.Rest.Removed")}</strong>.
          </li>

          <li>
            ${localize("DDA.Rest.AspectUses")}:
            <strong>${localize("DDA.Rest.Restored")}</strong>.
          </li>

          <li>
            ${localize("DDA.Rest.TalentUses")}:
            <strong>${localize("DDA.Rest.Restored")}</strong>.
          </li>

          <li>
            ${localize("DDA.ArmorEvolution.DigimentalUses")}:
            <strong>${localize("DDA.Rest.Restored")}</strong>.
          </li>

          <li>
            ${localize("DDA.Resource.EvolutionPoints.Short")}:
            <strong>${epMax}</strong>.
          </li>

          <li>
            ${localize("DDA.Resource.Actions")}:
            <strong>${maxActions}</strong>.
          </li>

${
  clearedBusyHandsItems.cleared > 0
    ? `
      <li>
        ${formatI18n(
          "DDA.Rest.BusyHandsItemsCleared",
          {
            amount:
              clearedBusyHandsItems
                .cleared
          }
        )}
      </li>
    `
    : ""
}

${
  clearedTemporaryIp.cleared > 0
    ? `
      <li>
        ${formatI18n(
          "DDA.Rest.TemporaryIpCleared",
          {
            amount:
              clearedTemporaryIp.cleared
          }
        )}
      </li>
    `
    : ""
}

${linkedPartnerRows}
${milestoneReleaseRow}
        </ul>
      </div>
    `
  });
}

async function restLinkedPartnerActors(tamer) {
  const partnerData =
    tamer.system?.partner ?? {};

  const partnerUuids = Array.from(
    new Set(
      [
        String(
          partnerData.currentFormUuid ?? ""
        ).trim(),

        String(
          partnerData.uuid ?? ""
        ).trim()
      ].filter(Boolean)
    )
  );

  const restedPartners = [];

  for (const uuid of partnerUuids) {
    let partner = null;

    try {
      const document = await fromUuid(uuid);

      partner =
        document?.documentName === "Actor"
          ? document
          : null;
    } catch (error) {
      console.warn(
        "DDA | Could not resolve linked partner for Rest:",
        uuid,
        error
      );
    }

    if (
      !partner ||
      !["digimon", "npc"].includes(partner.type)
    ) {
      continue;
    }

    const woundMax = Number(
      partner.system.miscStats?.wounds?.max ??
      partner.system.miscStats?.wounds?.value ??
      0
    );

    const actionMax = Number(
      partner.system.combat?.actions?.max ??
      partner.system.combat?.actions?.value ??
      0
    );

    const partnerUpdates = {
      "system.combat.defeated": false
    };

    if (woundMax > 0) {
      partnerUpdates[
        "system.miscStats.wounds.value"
      ] = woundMax;
    }

    if (actionMax > 0) {
      partnerUpdates[
        "system.combat.actions.value"
      ] = actionMax;
    }

    await clearGloriousWorldBenefit(partner);
    await partner.update(partnerUpdates);
    await rechargePartnerQualityUses(partner);

    restedPartners.push(partner);
  }

  return restedPartners;
}

async function rechargePartnerQualityUses(
  partner
) {
  const qualityUpdates = [];

  for (const item of partner.items) {
    if (item.type !== "quality") continue;
    if (!item.system?.uses?.enabled) continue;

    const rechargeType = String(
      item.system.uses.recharge ?? ""
    ).trim().toLowerCase();

    if (rechargeType !== "rest") continue;

    const maxUses = Math.max(
      0,
      Number(item.system.uses.max ?? 0)
    );

    const currentUses = Math.max(
      0,
      Number(item.system.uses.value ?? 0)
    );

    if (
      maxUses <= 0 ||
      currentUses >= maxUses
    ) {
      continue;
    }

    qualityUpdates.push({
      _id: item.id,
      "system.uses.value": maxUses
    });
  }

  if (qualityUpdates.length > 0) {
    await partner.updateEmbeddedDocuments(
      "Item",
      qualityUpdates
    );
  }
}

function getTamerTalentUsesRestUpdates(actor) {
  const updates = {};

  for (const talent of DDA_TAMER_TALENTS) {
    const uses = talent.uses ?? {};

    if (!uses.enabled) continue;
    if (uses.recharge !== "rest") continue;

    const max = getTamerTalentUsesMax(
  actor,
  talent
);

    if (max <= 0) continue;

    updates[`system.tamerTalentUses.${talent.id}.value`] = max;
    updates[`system.tamerTalentUses.${talent.id}.max`] = max;
    updates[`system.tamerTalentUses.${talent.id}.recharge`] = uses.recharge;
  }

  return updates;
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}
