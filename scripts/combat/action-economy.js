import { getActiveDDAUnitContext } from "./initiative.js";

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
    notify = true
  } = {}
) {
  const cost = normalizeActionCost(amount);
  const { value: available, max } = getActorActionState(actor);

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

  if (available < cost) {
    if (notify) {
      ui.notifications.warn(
        formatI18n(
          "DDA.ActionEconomy.Warning.NotEnoughActions",
          { required: cost, available },
          `Ações insuficientes: são necessárias ${cost}, mas apenas ${available} estão disponíveis.`
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
    remaining: available - cost
  };
}

export async function spendActorActions(
  actor,
  amount,
  {
    requireActiveUnit = true,
    notify = true,
    additionalUpdates = {}
  } = {}
) {
  const payment = checkActorActionSpend(actor, amount, {
    requireActiveUnit,
    notify
  });

  if (!payment) return null;

  await actor.update({
    ...additionalUpdates,
    "system.combat.actions.value": payment.remaining
  });

  return {
    actionCost: payment.cost,
    actionsBefore: payment.available,
    actionsAfter: payment.remaining
  };
}
