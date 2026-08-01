import { getActiveDDAUnitContext } from "./initiative.js";
import {
  getLightDigizoidActionReserve,
  spendLightDigizoidActionReserve
} from "./digizoid-gain-force.js";

function localize(key, fallback = key) {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function formatI18n(key, data = {}, fallback = key) {
  const value = game?.i18n?.format?.(key, data);
  if (value && value !== key) return value;

  return String(fallback).replace(/\{(\w+)\}/g, (_match, token) => {
    return data[token] ?? "";
  });
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeActionCost(amount = 0) {
  return Math.max(0, Math.floor(number(amount, 0)));
}

export function getActorActionState(actor) {
  const actions = actor?.system?.combat?.actions ?? {};
  const value = Math.max(0, number(actions.value, 0));
  const max = Math.max(value, number(actions.max, value));

  return { value, max };
}

export function checkActorActionSpend(
  actor,
  amount,
  {
    requireActiveUnit = true,
    notify = true,
    lightDigizoidAction = ""
  } = {}
) {
  const cost = normalizeActionCost(amount);
  const { value: available, max } = getActorActionState(actor);
  const lightReserve = getLightDigizoidActionReserve(actor, lightDigizoidAction);
  const totalAvailable = available + lightReserve;

  if (requireActiveUnit) {
    const turnContext = getActiveDDAUnitContext(actor);

    if (!turnContext.allowed) {
      if (notify) {
        ui.notifications.warn(
          localize(
            turnContext.ended
              ? "DDA.Combat.Warning.ParticipantEnded"
              : "DDA.Combat.Warning.NotActiveUnit",
            turnContext.ended
              ? "Você já encerrou sua parte desta ativação."
              : "Você não pertence à unidade ativa."
          )
        );
      }

      return null;
    }
  }

  if (totalAvailable < cost) {
    if (notify) {
      ui.notifications.warn(
        formatI18n(
          "DDA.ActionEconomy.Warning.NotEnoughActions",
          { required: cost, available: totalAvailable },
          `Ações insuficientes: são necessárias ${cost}, mas apenas ${totalAvailable} estão disponíveis.`
        )
      );
    }

    return null;
  }

  return {
    actor,
    cost,
    available,
    max,
    remaining: Math.max(0, available - cost),
    lightReserveSpent: Math.max(0, cost - available)
  };
}

export async function spendActorActions(
  actor,
  amount,
  {
    requireActiveUnit = true,
    notify = true,
    additionalUpdates = {},
    lightDigizoidAction = ""
  } = {}
) {
  const payment = checkActorActionSpend(actor, amount, {
    requireActiveUnit,
    notify,
    lightDigizoidAction
  });

  if (!payment) return null;

  await actor.update({
    ...additionalUpdates,
    "system.combat.actions.value": payment.remaining
  });

  if (payment.lightReserveSpent > 0) {
    await spendLightDigizoidActionReserve(actor, payment.lightReserveSpent);
  }

  return {
    actionCost: payment.cost,
    actionsBefore: payment.available,
    actionsAfter: payment.remaining,
    lightReserveSpent: payment.lightReserveSpent
  };
}
