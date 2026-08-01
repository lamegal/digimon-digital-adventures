import {
  getActorDerivedStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  getCombatUseState,
  localizeQ,
  normalizeKey,
  rollDerivedCheck,
  setUseState
} from "./quality-automation.js";

function getActorResistance(actor) {
  const value = Number(
    actor?.system?.miscStats?.resistance?.total ??
    actor?.system?.miscStats?.resistance?.value ??
    actor?.system?.miscStats?.resistance?.base ??
    actor?.system?.derived?.sv?.total ??
    actor?.system?.derived?.sv?.value ??
    getActorSv(actor) ??
    0
  );

  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function getOverclockChoiceData(quality) {
  const configured =
    quality?.system?.overclock ?? {};

  const selectedRanks = Array.isArray(
    quality?.system?.choices?.selectedRanks
  )
    ? quality.system.choices.selectedRanks
    : [];

  const selected = selectedRanks[0] ?? {};

  return {
    effectTag: String(
      configured.effectTag ??
      selected.effectTag ??
      ""
    ).trim(),

    effectLabel: String(
      configured.effectLabel ??
      selected.label ??
      selected.originalLabel ??
      configured.effectTag ??
      selected.effectTag ??
      ""
    ).trim(),

    potencyStat: String(
      configured.potencyStat ??
      selected.potencyStat ??
      ""
    )
      .trim()
      .toLowerCase(),

    extraActionRequired: Boolean(
      configured.extraActionRequired ??
      selected.extraActionRequired
    ),

    sourceQualityId: String(
      configured.sourceQualityId ??
      selected.sourceQualityId ??
      ""
    ).trim()
  };
}

export async function useOverclockQuality(
  actor,
  quality
) {
  if (!actor || !quality) return false;

  if (!game.combat?.started) {
    ui.notifications.warn(
      localizeQ(
        "DDA.Overclock.RequiresCombat",
        "Overclock só pode ser usado durante um combate ativo."
      )
    );

    return false;
  }

  const choice = getOverclockChoiceData(
    quality
  );

  const allowedStats = new Set([
    "bit",
    "dos",
    "ram",
    "cpu"
  ]);

  if (
    !choice.effectTag ||
    !allowedStats.has(choice.potencyStat)
  ) {
    ui.notifications.warn(
      localizeQ(
        "DDA.Overclock.MissingConfiguration",
        "Overclock não possui um Efeito Positivo válido configurado."
      )
    );

    return false;
  }

  const useState = getCombatUseState(
    actor,
    "overclock",
    quality.id
  );

  if (useState?.blocked) {
    ui.notifications.warn(
      localizeQ(
        "DDA.Overclock.BlockedAfterCriticalFailure",
        "Overclock não pode ser usado novamente neste combate após a Falha Crítica."
      )
    );

    return false;
  }

  const actionCost =
    1 +
    (
      choice.extraActionRequired
        ? 1
        : 0
    );

  const currentActions = Math.max(
    0,
    Number(
      actor.system?.combat?.actions?.value ?? 0
    )
  );

  if (currentActions < actionCost) {
    ui.notifications.warn(
      localizeQ(
        "DDA.Overclock.NotEnoughActions",
        "{actor} não possui Ações suficientes para usar {quality}.",
        {
          actor: actor.name,
          quality: quality.name
        }
      )
    );

    return false;
  }

  const tn =
    10 +
    getActorSv(actor);

  const result = await rollDerivedCheck(
    actor,
    choice.potencyStat,
    {
      tn,
      title: quality.name
    }
  );

  if (!result) return false;

  const remainingActions = Math.max(
    0,
    currentActions - actionCost
  );

  await actor.update({
    "system.combat.actions.value":
      remainingActions
  });

  let outcomeText = localizeQ(
    "DDA.Overclock.Failure",
    "Nada acontece."
  );

  if (result.criticalFailure) {
    await setUseState(
      actor,
      "overclock",
      quality.id,
      {
        blocked: true,
        qualityName: quality.name
      }
    );

    outcomeText = localizeQ(
      "DDA.Overclock.CriticalFailure",
      "Nada acontece e Overclock não pode ser usado novamente até o fim do combate."
    );
  } else if (result.success) {
    const criticalSuccess = Boolean(
      result.criticalSuccess
    );

    const duration = criticalSuccess
      ? 3
      : 1;

    /*
     * Overclock aplica o Efeito ao próprio Caster, portanto a Potência
     * também é reduzida pela Resistência do Digimon. Como se trata de um
     * Efeito Positivo comum, a Resistência não pode reduzi-la abaixo de 2.
     */
    const rawPotency = Math.max(
      0,
      getActorDerivedStat(
        actor,
        choice.potencyStat
      )
    );
    const potency = Math.max(
      Math.min(2, rawPotency),
      rawPotency - getActorResistance(actor)
    );

    const currentEffects =
      foundry.utils.deepClone(
        actor.system?.effects?.active ?? []
      );

    const sourceEffectId =
      `overclock:${quality.id}`;

    const effectData = {
      id: foundry.utils.randomID(),

      tag: choice.effectTag,

      label:
        choice.effectLabel ||
        (
          CONFIG.DDA?.effectTags?.[
            choice.effectTag
          ] ??
          choice.effectTag
        ),

      type: "positive",

      sourceQualityId: quality.id,
      sourceQualityName: quality.name,

      sourceAttackId: sourceEffectId,
      sourceAttackName: quality.name,

      sourceActorUuid: actor.uuid,
      sourceActorName: actor.name,

      targetActorUuid: actor.uuid,
      targetActorName: actor.name,

      potencyStat: choice.potencyStat,
      potency,

      duration,
      remaining: duration,

      overclock: true,
      overclockCritical: criticalSuccess,
      overclockTurnsRemaining: criticalSuccess ? 3 : 0,
      usePotencyValue: true,

      /*
       * Sucesso normal termina no início do próximo turno. O Crítico é
       * contado no fim dos turnos do usuário e expira no fim do terceiro.
       */
      hasDuration: !criticalSuccess,
      durationRule: criticalSuccess ? "overclock-critical" : true,
      expiresAtStartOfNextTurn:
        !criticalSuccess,

      appliedCombatId: getCombatId(),
      appliedRound: getCombatRound()
    };

    const existingIndex =
      currentEffects.findIndex((effect) => {
        return (
          normalizeKey(effect.tag) ===
            normalizeKey(choice.effectTag) &&
          String(
            effect.sourceAttackId ?? ""
          ) === sourceEffectId
        );
      });

    if (existingIndex >= 0) {
      effectData.id =
        currentEffects[existingIndex].id ??
        effectData.id;

      currentEffects[existingIndex] = {
        ...currentEffects[existingIndex],
        ...effectData
      };
    } else {
      currentEffects.push(effectData);
    }

    await actor.update({
      "system.effects.active":
        currentEffects
    });

    outcomeText = criticalSuccess
      ? localizeQ(
          "DDA.Overclock.CriticalSuccess",
          "O Efeito foi aplicado por 3 rodadas."
        )
      : localizeQ(
          "DDA.Overclock.Success",
          "O Efeito foi aplicado até o início do próximo turno."
        );
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor
    }),

    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-overclock-card">
        <h2>${quality.name}</h2>

        <ul class="dda-effect-list">
          <li>
            ${localizeQ(
              "DDA.Overclock.Effect",
              "Efeito"
            )}:
            <strong>${choice.effectLabel}</strong>.
          </li>

          <li>
            ${localizeQ(
              "DDA.Overclock.Check",
              "Teste"
            )}:
            <strong>${choice.potencyStat.toUpperCase()}</strong>
            ${localizeQ(
              "DDA.Roll.TN",
              "NA"
            )}
            <strong>${tn}</strong>.
          </li>

          <li>
            ${localizeQ(
              "DDA.Attack.ActionCost",
              "Custo de Ação"
            )}:
            <strong>${actionCost}</strong>.
          </li>

          <li>
            ${localizeQ(
              "DDA.Roll.Result",
              "Resultado"
            )}:
            <strong>${outcomeText}</strong>
          </li>

          <li>
            ${localizeQ(
              "DDA.Resource.Actions",
              "Ações"
            )}:
            <strong>
              ${currentActions} →
              ${remainingActions}
            </strong>.
          </li>
        </ul>
      </div>
    `
  });

  actor.sheet?.render(false);

  return true;
}

export async function expireStartOfTurnQualityEffects(
  actor
) {
  if (!actor) return false;

  const currentEffects =
    foundry.utils.deepClone(
      actor.system?.effects?.active ?? []
    );

  const remainingEffects =
    currentEffects.filter((effect) => {
      return !Boolean(
        effect.expiresAtStartOfNextTurn
      );
    });

  if (
    remainingEffects.length ===
    currentEffects.length
  ) {
    return false;
  }

  await actor.update({
    "system.effects.active":
      remainingEffects
  });

  actor.sheet?.render(false);

  return true;
}
export async function processOverclockEndTurn(actor) {
  if (!actor) return { changed: false, expired: [] };

  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const remaining = [];
  const expired = [];
  let changed = false;

  for (const effect of effects) {
    if (!effect.overclockCritical && effect.durationRule !== "overclock-critical") {
      remaining.push(effect);
      continue;
    }

    const turns = Math.max(0, Number(effect.overclockTurnsRemaining ?? effect.remaining ?? 3));
    const nextTurns = Math.max(0, turns - 1);
    changed = true;

    if (nextTurns <= 0) {
      expired.push({ ...effect, overclockTurnsRemaining: 0, remaining: 0 });
      continue;
    }

    remaining.push({
      ...effect,
      overclockTurnsRemaining: nextTurns,
      remaining: nextTurns
    });
  }

  if (changed) {
    await actor.update({ "system.effects.active": remaining });
    actor.sheet?.render(false);
  }

  return { changed, expired };
}
