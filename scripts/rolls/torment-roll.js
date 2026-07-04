import { getDDASetting } from "../settings.js";

export async function rollTormentCheck(actor, tormentItem) {
  if (!actor || actor.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.TormentCheckOnlyForTamers"));
    return;
  }

  if (!tormentItem || tormentItem.type !== "torment") {
    ui.notifications.warn(localize("DDA.Warning.SelectValidTorment"));
    return;
  }

  const system = actor.system;
  const tormentSystem = tormentItem.system;

  const boxes = Number(tormentSystem.boxes?.value ?? 0);
  const harderTorments = getDDASetting("harderTorments");
  const mechanicalTorments = getDDASetting("mechanicalTorments");
  const naturalCriticals = getDDASetting("naturalCriticals");

  const baseTn = harderTorments ? 10 : 8;
  const tn = baseTn + boxes;

  const dialogResult = await Dialog.prompt({
    title: formatI18n("DDA.Torment.RollTitleWithName", { torment: tormentItem.name }),
    content: `
      <form class="dda-roll-dialog dda-torment-roll-dialog">
        <div class="form-group">
          <label>${localize("DDA.Roll.TN")}</label>
          <input type="number" name="tn" value="${tn}" />
        </div>

        <div class="form-group">
          <label>${localize("DDA.TamerSkillDialog.ManualModifier")}</label>
          <input type="number" name="modifier" value="0" />
        </div>

        <p class="notes">
          ${formatI18n("DDA.Torment.BaseTnNote", { baseTn, boxes })}
        </p>
      </form>
    `,
    label: localize("DDA.Button.Roll"),
callback: (html) => {
  const form = html[0].querySelector("form");

  return {
    tn: Number(form.elements.tn.value ?? tn),
    modifier: Number(form.elements.modifier.value ?? 0)
  };
}
  });

  if (!dialogResult) return;

  const roll = await new Roll("3d6").evaluate();
  const diceResults = roll.dice[0]?.results?.map((result) => result.result) ?? [];
  const diceTotal = roll.total;
  const modifier = Number(dialogResult.modifier ?? 0);
  const finalTotal = diceTotal + modifier;
  const finalTn = Number(dialogResult.tn ?? tn);

  const allSixes = diceResults.length === 3 && diceResults.every((die) => die === 6);
  const allOnes = diceResults.length === 3 && diceResults.every((die) => die === 1);

  let degree = "failure";

  if (naturalCriticals && allSixes) {
    degree = "criticalSuccess";
  } else if (naturalCriticals && allOnes) {
    degree = "criticalFailure";
  } else if (finalTotal >= finalTn + 5) {
    degree = "criticalSuccess";
  } else if (finalTotal >= finalTn) {
    degree = "success";
  } else if (finalTotal <= finalTn - 10) {
    degree = "severeCriticalFailure";
  } else if (finalTotal <= finalTn - 5) {
    degree = "criticalFailure";
  }

  let resultLabel = "";
  let resultText = "";
  const updates = {};
  const itemUpdates = {};

  const ipPath = "system.resources.ip.value";
  const currentIp = Number(system.resources?.ip?.value ?? 0);
  const maxIp = Number(system.resources?.ip?.max ?? 0);

  let severeTormentChoice = null;

if (degree === "severeCriticalFailure") {
  severeTormentChoice = await chooseSevereTormentConsequence(actor);
}

  if (degree === "criticalSuccess") {
    resultLabel = localize("DDA.Check.CriticalSuccess");

    const ipGain = mechanicalTorments ? 2 : 1;
    const newIp = Math.min(maxIp, currentIp + ipGain);
    updates[ipPath] = newIp;

    if (mechanicalTorments) {
      const newBoxes = Math.max(0, boxes - 1);
      itemUpdates["system.boxes.value"] = newBoxes;
      resultText = formatI18n("DDA.Torment.Result.CriticalSuccess.Mechanical", { ipGain });
    } else {
      const newBoxes = Math.max(0, boxes - 1);
      itemUpdates["system.boxes.value"] = newBoxes;
      resultText = formatI18n("DDA.Torment.Result.CriticalSuccess.Text", { ipGain });
    }

    itemUpdates["system.checkedUntilRest"] = true;
    itemUpdates["system.penalty.enabled"] = false;
    itemUpdates["system.penalty.value"] = 0;
    updates["system.tormentState.rollPenalty"] = 0;
    updates["system.tormentState.actionLockUntilCombatEnd"] = false;
  }

  if (degree === "success") {
    resultLabel = localize("DDA.Check.Success");

    const ipGain = 1;
    const newIp = Math.min(maxIp, currentIp + ipGain);
    updates[ipPath] = newIp;

    if (mechanicalTorments) {
      const newBoxes = Math.max(0, boxes - 1);
      itemUpdates["system.boxes.value"] = newBoxes;
      resultText = localize("DDA.Torment.Result.Success.Mechanical");
    } else {
      resultText = localize("DDA.Torment.Result.Success.Text");
    }

    itemUpdates["system.checkedUntilRest"] = true;
    itemUpdates["system.penalty.enabled"] = false;
    itemUpdates["system.penalty.value"] = 0;
    updates["system.tormentState.rollPenalty"] = 0;
    updates["system.tormentState.actionLockUntilCombatEnd"] = false;
  }

  if (degree === "failure") {
    resultLabel = localize("DDA.Check.Failure");
    resultText = localize("DDA.Torment.Result.Failure");

    itemUpdates["system.checkedUntilRest"] = true;
  }

  if (degree === "criticalFailure") {
    resultLabel = localize("DDA.Check.CriticalFailure");
    resultText = localize("DDA.Torment.Result.CriticalFailure");

    itemUpdates["system.checkedUntilRest"] = true;
    itemUpdates["system.penalty.enabled"] = true;
    itemUpdates["system.penalty.value"] = -2;
    updates["system.tormentState.rollPenalty"] = -2;
  }

if (degree === "severeCriticalFailure") {
  resultLabel = localize("DDA.Torment.SevereDialog.Title");

  itemUpdates["system.boxes.value"] = boxes + 1;
  itemUpdates["system.checkedUntilRest"] = true;
  itemUpdates["system.penalty.enabled"] = true;

  if (severeTormentChoice === "combatCollapse") {
    resultText = localize("DDA.Torment.Result.SevereCriticalFailure.CombatCollapse");

    itemUpdates["system.penalty.value"] = -3;
    updates["system.tormentState.rollPenalty"] = -3;
    updates["system.tormentState.actionLockUntilCombatEnd"] = true;
    updates["system.combat.actions.value"] = 0;
  } else {
    resultText = localize("DDA.Torment.Result.SevereCriticalFailure.HeavyPenalty");

    itemUpdates["system.penalty.value"] = -5;
    updates["system.tormentState.rollPenalty"] = -5;
    updates["system.tormentState.actionLockUntilCombatEnd"] = false;
  }
}

  if (Object.keys(updates).length > 0) {
    await actor.update(updates);
  }

  if (Object.keys(itemUpdates).length > 0) {
    await tormentItem.update(itemUpdates);
  }

  const naturalCriticalNote = naturalCriticals && allSixes
    ? `<p><strong>${localize("DDA.Check.NaturalCritical")}:</strong> ${localize("DDA.Check.TripleSix")}.</p>`
    : naturalCriticals && allOnes
      ? `<p><strong>${localize("DDA.Check.NaturalCriticalFailure")}:</strong> ${localize("DDA.Check.TripleOne")}.</p>`
      : "";

  const harderTormentNote = harderTorments
    ? `<p><strong>${localize("DDA.Torment.VariantRule")}:</strong> ${localize("DDA.Torment.HarderTormentsActive")}</p>`
    : "";

  const mechanicalTormentNote = mechanicalTorments
    ? `<p><strong>${localize("DDA.Torment.VariantRule")}:</strong> ${localize("DDA.Torment.MechanicalTormentsActive")}</p>`
    : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `
      <div class="dda-chat-card dda-torment-card ${degree}">
        <h2>${localize("DDA.Torment.RollTitle")}</h2>

        <p>${formatI18n("DDA.Torment.FacesTorment", { actor: `<strong>${escapeHtml(actor.name)}</strong>`, torment: `<strong>${escapeHtml(tormentItem.name)}</strong>` })}</p>

        <hr />

        <p><strong>${localize("DDA.Roll.Dice")}:</strong> ${diceResults.join(", ")}</p>
        <p><strong>${localize("DDA.Torment.DiceTotal")}:</strong> ${diceTotal}</p>
        <p><strong>${localize("DDA.TamerSkillDialog.ManualModifier")}:</strong> ${modifier}</p>
        <p><strong>${localize("DDA.Torment.FinalTotal")}:</strong> ${finalTotal}</p>
        <p><strong>${localize("DDA.Roll.TN")}:</strong> ${finalTn}</p>

        <hr />

        <h3>${resultLabel}</h3>
        <p>${resultText}</p>

        ${naturalCriticalNote}
        ${harderTormentNote}
        ${mechanicalTormentNote}
      </div>
    `
  });
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
