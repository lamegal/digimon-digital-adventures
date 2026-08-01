import { rollPool } from "../rolls/pool-roll.js";
import {
  consumeSecondWindRecoveryBonus,
  getSecondWindRecoveryBonus
} from "./preservation-qualities.js";

export async function rollRecovery(actor) {
  if (!actor) {
    ui.notifications.warn(localize("DDA.Warning.ActorNotFound"));
    return;
  }

  if (actor.type === "character") {
    return rollTamerRecovery(actor);
  }

  if (actor.type === "digimon" || actor.type === "npc") {
    return rollDigimonRecovery(actor);
  }

  ui.notifications.warn(localize("DDA.Warning.UnsupportedActorTypeForRecovery"));
}

async function rollTamerRecovery(actor) {
  const enduranceSkill = actor.system.skills?.endurance;
  const bodyAttribute = actor.system.attributes?.body;

  if (!enduranceSkill || !bodyAttribute) {
    ui.notifications.warn(localize("DDA.Warning.TamerMissingEnduranceOrBody"));
    return;
  }

  const body = Number(bodyAttribute.value ?? 0);
  const endurance = Number(enduranceSkill.value ?? 0);
  const skillModifier = endurance > 0 ? endurance : -1;
  const modifier = body + skillModifier;

  const roll = await new Roll("3d6 + @modifier", { modifier }).evaluate();
  const total = roll.total;

  const wounds = actor.system.derived?.wounds;
  const current = Number(wounds?.value ?? 0);
  const max = Number(wounds?.max ?? 0);

  const recovered = getTamerRecoveryAmount(total, current, max);
  const newWounds = Math.min(max, current + recovered);

  await actor.update({
    "system.derived.wounds.value": newWounds
  });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `
      <div class="dda-chat-card dda-recovery-card">
        <h2>${localize("DDA.Recovery.PostCombatTitle")}</h2>
        <p>${formatI18n("DDA.Recovery.TamerMadeEnduranceCheck", {
          actor: `<strong>${actor.name}</strong>`
        })}</p>
        <p><strong>${localize("DDA.Roll.Result")}:</strong> ${total}</p>
        <p><strong>${localize("DDA.Recovery.HealthRecovered")}:</strong> ${recovered}</p>
        <p><strong>${localize("DDA.Resource.Health")}:</strong> ${current} → ${newWounds} / ${max}</p>
      </div>
    `
  });

  return {
    actor,
    roll,
    total,
    recovered,
    newWounds
  };
}

async function rollDigimonRecovery(actor) {
  const secondWindBonus = getSecondWindRecoveryBonus(actor);

  const result = await rollPool(actor, "health", {
    automaticSuccesses: secondWindBonus,
    externalLabel: secondWindBonus > 0
      ? (String(game.i18n?.lang ?? "").toLowerCase().startsWith("en")
        ? `Second Wind: +${secondWindBonus} automatic Recovery Successes`
        : `Segundo Fôlego: +${secondWindBonus} Sucessos automáticos de Recuperação`)
      : ""
  });

  if (!result) return;

  if (secondWindBonus > 0) {
    await consumeSecondWindRecoveryBonus(actor);
  }

  const recovered = Number(result.totalSuccesses ?? 0);

  const wounds = actor.system.miscStats?.wounds;
  const current = Number(wounds?.value ?? 0);
  const max = Number(wounds?.max ?? 0);

  const newWounds = Math.min(max, current + recovered);

  await actor.update({
    "system.miscStats.wounds.value": newWounds
  });

  const restUseRechargeData = await rechargeQualityUses(actor, "rest");

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-recovery-card">
        <h2>${localize("DDA.Recovery.PostCombatTitle")}</h2>
        <p>${formatI18n("DDA.Recovery.DigimonMadeHealthRoll", {
          actor: `<strong>${actor.name}</strong>`
        })}</p>
        <p><strong>${localize("DDA.Recovery.HealthRecovered")}:</strong> ${recovered}</p>
        ${
          secondWindBonus > 0
            ? `<p><strong>${String(game.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "Second Wind" : "Segundo Fôlego"}:</strong> +${secondWindBonus} ${String(game.i18n?.lang ?? "").toLowerCase().startsWith("en") ? "automatic Successes" : "Sucessos automáticos"}.</p>`
            : ""
        }
        <p><strong>${localize("DDA.Resource.Health")}:</strong> ${current} → ${newWounds} / ${max}</p>

        ${
          restUseRechargeData.changed
            ? `
              <p>
                <strong>${localize("DDA.Recovery.UsesRecharged")}:</strong>
                ${restUseRechargeData.entries.map((entry) => {
                  return `${entry.name} ${entry.oldValue} → ${entry.newValue}`;
                }).join(", ")}
              </p>
            `
            : ""
        }
      </div>
    `
  });

  actor.sheet?.render(false);

  return {
    actor,
    recovered,
    newWounds,
    secondWindBonus,
    rechargedUses: restUseRechargeData
  };
}

function getTamerRecoveryAmount(total, current, max) {
  const missing = Math.max(0, max - current);

  if (missing <= 0) return 0;

  if (total >= 20) return missing;
  if (total >= 18) return Math.min(5, missing);
  if (total >= 16) return Math.min(4, missing);
  if (total >= 14) return Math.min(3, missing);
  if (total >= 12) return Math.min(2, missing);
  if (total >= 10) return Math.min(1, missing);

  return 0;
}

async function rechargeQualityUses(actor, rechargeType) {
  const normalizedRechargeType = normalizeRechargeType(rechargeType);
  const entries = [];

  for (const item of actor.items) {
    if (item.type !== "quality") continue;
    if (!item.system.uses?.enabled) continue;

    const itemRechargeType = normalizeRechargeType(item.system.uses?.recharge);

    if (itemRechargeType !== normalizedRechargeType) continue;

    const currentValue = Number(item.system.uses.value ?? 0);
    const maxValue = Number(item.system.uses.max ?? 0);

    if (maxValue <= 0) continue;
    if (currentValue >= maxValue) continue;

    await item.update({
      "system.uses.value": maxValue
    });

    entries.push({
      id: item.id,
      name: item.name,
      oldValue: currentValue,
      newValue: maxValue,
      maxValue,
      recharge: item.system.uses?.recharge
    });
  }

  return {
    changed: entries.length > 0,
    entries
  };
}

function normalizeRechargeType(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const aliases = {
    turn: "turn",
    turno: "turn",

    round: "round",
    rodada: "round",

    scene: "scene",
    cena: "scene",

    session: "session",
    sessao: "session",

    rest: "rest",
    descanso: "rest",

    special: "special",
    especial: "special"
  };

  return aliases[key] ?? key;
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}
