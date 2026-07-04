import { getDDASetting } from "../settings.js";
import { applySkillTnModifier } from "../rules/campaign-rules.js";

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

export async function rollTamerCheck(actor, skillKey) {
  const system = actor.system;
  const skill = system.skills?.[skillKey];

  if (!skill) {
    ui.notifications.warn(i18n.localize("DDA.Warning.SkillNotFound"));
    return;
  }

  const attributeKey = skill.attributes?.[0];

  if (!attributeKey) {
    ui.notifications.warn(i18n.localize("DDA.Warning.SkillHasNoAttribute"));
    return;
  }

  const attribute = system.attributes?.[attributeKey];

  if (!attribute) {
    ui.notifications.warn(i18n.localize("DDA.Warning.AttributeNotFound"));
    return;
  }

  const dialogData = await getTamerCheckDialogData(actor, skill);

  if (!dialogData) return;

  const attributeValue = Number(attribute.value ?? 0);
  const skillValue = Number(skill.value ?? 0);
  const skillModifier = skillValue > 0 ? skillValue : -1;

  const manualModifier = Number(dialogData.manualModifier ?? 0);
  const aspectModifier = Number(dialogData.aspectModifier ?? 0);
  const extraDice = Math.max(0, Number(dialogData.extraDice ?? 0));
  const tn = Number(dialogData.tn ?? 0);

  const modifier = attributeValue + skillModifier + manualModifier + aspectModifier;
  const formula = `${3 + extraDice}d6 + @modifier`;

  const roll = await new Roll(formula, { modifier }).evaluate();

  const total = roll.total;
  const diceResults = roll.dice[0]?.results?.map((result) => result.result) ?? [];
  const outcome = getCheckOutcome(total, tn, diceResults);

  await applyAspectUse(actor, dialogData.aspectUse);

  const skillLabel = localizeLabel(skill.label);
  const attributeLabel = localizeLabel(attribute.label);

  const naturalCriticalNote = outcome.naturalCritical
    ? `<p><strong>${i18n.localize("DDA.Check.NaturalCritical")}:</strong> ${i18n.localize("DDA.Check.TripleSix")}.</p>`
    : outcome.naturalCriticalFailure
      ? `<p><strong>${i18n.localize("DDA.Check.NaturalCriticalFailure")}:</strong> ${i18n.localize("DDA.Check.TripleOne")}.</p>`
      : "";

  const content = `
    <div class="dda-chat-roll-message dda-tamer-check-message">
      <div class="dda-tamer-check-shell dda-chat-roll-shell">
        <div class="dda-chat-card dda-effect-card effect-special dda-tamer-check-card dda-check-card dda-check-${outcome.key}">
          <h2>${i18n.format("DDA.TamerSkillDialog.Title", { skill: skillLabel })}</h2>
          <p>
            <strong>${attributeLabel}</strong> ${attributeValue}
            ${skillValue > 0 ? `+ <strong>${skillLabel}</strong> ${skillValue}` : `- 1 ${i18n.localize("DDA.TamerSkillDialog.Untrained")}`}
            ${manualModifier !== 0 ? ` ${formatSigned(manualModifier)} ${i18n.localize("DDA.Abbrev.Modifier")}` : ""}
            ${aspectModifier !== 0 ? ` ${formatSigned(aspectModifier)} ${i18n.localize("DDA.TamerSkillDialog.Aspect")}` : ""}
          </p>
          <p><strong>${i18n.localize("DDA.Roll.Dice")}:</strong> ${diceResults.join(", ")}</p>
          <p><strong>${i18n.localize("DDA.Roll.TN")}:</strong> ${tn || "—"}</p>
          ${tn ? `<p><strong>${i18n.localize("DDA.Roll.Result")}:</strong> ${outcome.label}</p>` : ""}
          ${naturalCriticalNote}
        </div>
      </div>
      ${await roll.render()}
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll]
  });

  return roll;
}

function getTamerCheckDialogData(actor, skill) {
  const targetNumbers = CONFIG.DDA?.targetNumbers ?? {};
  const skillLabel = localizeLabel(skill.label);

const tnOptions = Object.entries(targetNumbers)
  .map(([key, tn]) => {
    const label = localizeLabel(tn.label ?? key);
    const baseValue = Number(tn.value ?? 0);
    const value = applySkillTnModifier(baseValue);

    return `<option value="${value}">${label} (${value})</option>`;
  })
  .join("");

  const content = `
    <form class="dda-roll-dialog">
      <div class="form-group">
        <label>${i18n.localize("DDA.TamerSkillDialog.Skill")}</label>
        <input type="text" value="${skillLabel}" readonly />
      </div>

      <div class="form-group">
        <label>${i18n.localize("DDA.Roll.TN")}</label>
        <select name="tn">
          <option value="0">${i18n.localize("DDA.TamerSkillDialog.NoTN")}</option>
          ${tnOptions}
        </select>
      </div>

      <div class="form-group">
        <label>${i18n.localize("DDA.TamerSkillDialog.ManualModifier")}</label>
        <input type="number" name="manualModifier" value="0" />
      </div>

      <div class="form-group">
        <label>${i18n.localize("DDA.TamerSkillDialog.ExtraDice")}</label>
        <input type="number" name="extraDice" value="0" min="0" />
      </div>

      <div class="form-group">
        <label>${i18n.localize("DDA.TamerSkillDialog.Aspect")}</label>
        <select name="aspectUse">
          <option value="">${i18n.localize("DDA.TamerSkillDialog.NoAspect")}</option>
          <option value="majorPositive">${i18n.localize("DDA.TamerSkillDialog.AspectMajorPositive")}</option>
          <option value="minorPositive">${i18n.localize("DDA.TamerSkillDialog.AspectMinorPositive")}</option>
          <option value="majorNegative">${i18n.localize("DDA.TamerSkillDialog.AspectMajorNegative")}</option>
          <option value="minorNegative">${i18n.localize("DDA.TamerSkillDialog.AspectMinorNegative")}</option>
        </select>
      </div>
    </form>
  `;

  return new Promise((resolve) => {
    new Dialog({
      title: i18n.format("DDA.TamerSkillDialog.Title", { skill: skillLabel }),
      content,
      buttons: {
        roll: {
          label: i18n.localize("DDA.Button.Roll"),
          callback: (html) => {
            const form = html[0].querySelector("form");
            const aspectUse = form.aspectUse.value;

            resolve({
              tn: Number(form.tn.value),
              manualModifier: Number(form.manualModifier.value),
              extraDice: Number(form.extraDice.value),
              aspectUse,
              aspectModifier: getAspectModifier(aspectUse)
            });
          }
        },
        cancel: {
          label: i18n.localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "roll",
      close: () => resolve(null)
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

function getCheckOutcome(total, tn, diceResults = []) {
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