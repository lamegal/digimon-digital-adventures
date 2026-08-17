import { getActiveDDAUnitContext } from "./initiative.js";
import {
  getLightDigizoidActionReserve,
  spendLightDigizoidActionReserve
} from "./digizoid-gain-force.js";

import {
  getBullrushActionReserve,
  getStrikeFastActionReserve,
  spendBullrushActionReserve,
  spendStrikeFastActionReserve
} from "../rules/tamer-talent-runtime.js";

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
    lightDigizoidAction = "",
    actionKey = ""
  } = {}
) {
  const charmController = game?.dda?.bossQualities?.ensureCharmActionController;
  if (typeof charmController === "function" && !charmController(actor, { user: game?.user, notify })) {
    return null;
  }

  const cost = normalizeActionCost(amount);
  const { value: available, max } = getActorActionState(actor);
  const bullrushReserve = getBullrushActionReserve(actor, actionKey);
  const strikeFastReserve = getStrikeFastActionReserve(actor, actionKey);
  const lightReserve = getLightDigizoidActionReserve(actor, lightDigizoidAction);
  const totalAvailable =
    available +
    bullrushReserve +
    strikeFastReserve +
    lightReserve;

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

  const bullrushReserveSpent = Math.min(cost, bullrushReserve);
  const afterBullrush = Math.max(0, cost - bullrushReserveSpent);
  const strikeFastReserveSpent = Math.min(afterBullrush, strikeFastReserve);
  const afterStrikeFast = Math.max(0, afterBullrush - strikeFastReserveSpent);
  const lightReserveSpent = Math.min(afterStrikeFast, lightReserve);
  const normalActionsSpent = Math.max(0, afterStrikeFast - lightReserveSpent);

  return {
    actor,
    cost,
    available,
    max,
    remaining: Math.max(0, available - normalActionsSpent),
    normalActionsSpent,
    bullrushReserveSpent,
    strikeFastReserveSpent,
    lightReserveSpent
  };
}

export async function spendActorActions(
  actor,
  amount,
  {
    requireActiveUnit = true,
    notify = true,
    additionalUpdates = {},
    lightDigizoidAction = "",
    actionKey = ""
  } = {}
) {
  const payment = checkActorActionSpend(actor, amount, {
    requireActiveUnit,
    notify,
    lightDigizoidAction,
    actionKey
  });

  if (!payment) return null;

  await actor.update({
    ...additionalUpdates,
    "system.combat.actions.value": payment.remaining
  });

  if (payment.bullrushReserveSpent > 0) {
    await spendBullrushActionReserve(
      actor,
      payment.bullrushReserveSpent,
      actionKey
    );
  }

  if (payment.strikeFastReserveSpent > 0) {
    await spendStrikeFastActionReserve(
      actor,
      payment.strikeFastReserveSpent,
      actionKey
    );
  }

  if (payment.lightReserveSpent > 0) {
    await spendLightDigizoidActionReserve(actor, payment.lightReserveSpent);
  }

  return {
    actionCost: payment.cost,
    actionsBefore: payment.available,
    actionsAfter: payment.remaining,
    normalActionsSpent: payment.normalActionsSpent,
    bullrushReserveSpent: payment.bullrushReserveSpent,
    strikeFastReserveSpent: payment.strikeFastReserveSpent,
    lightReserveSpent: payment.lightReserveSpent
  };
}
