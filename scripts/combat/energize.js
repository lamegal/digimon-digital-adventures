import { getDDASetting } from "../settings.js";

export async function energizeDigimon(actor) {
  if (!actor || !["digimon", "npc"].includes(actor.type)) {
    ui.notifications.warn(localize("DDA.Warning.EnergizeOnlyForDigimon"));
    return;
  }

  const enabled = getDDASetting("energizeAction");

  if (!enabled) {
    ui.notifications.warn(localize("DDA.Warning.EnergizeVariantDisabled"));
    return;
  }

  const actions = Number(actor.system.combat?.actions?.value ?? 0);

  if (actions < 2) {
    ui.notifications.warn(localize("DDA.Warning.EnergizeRequiresTwoActions"));
    return;
  }

  await actor.update({
    "system.combat.actions.value": actions - 2,
    "system.combat.energizeUsedThisTurn": true
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-energize-card">
        <h2>${localize("DDA.Energize.Title")}</h2>

        <p>
          ${formatI18n("DDA.Energize.ActorSpendsActions", {
            actor: `<strong>${actor.name}</strong>`,
            actions: `<strong>2 ${localize("DDA.Resource.Actions")}</strong>`
          })}
        </p>

        <p>
          ${formatI18n("DDA.Energize.EndTurnBatteryGain", {
            battery: `<strong>+1 ${localize("DDA.Resource.Battery")}</strong>`
          })}
        </p>
      </div>
    `
  });
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}