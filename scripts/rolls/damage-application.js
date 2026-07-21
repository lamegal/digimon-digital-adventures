import {
  hasQuality,
  getCombatId,
  areActorsAllies,
  getActorSv
} from "../rules/quality-automation.js";

import {
  hasUnlockedOfficialTamerTalent,
  maybeApplyGritSurvival
} from "../rules/tamer-resources.js";

import {
  checkActorActionSpend,
  spendActorActions
} from "../combat/action-economy.js";
const DAMAGE_TYPE_LABEL_KEYS = {
  crash: "DDA.Damage.Type.Crash",
  burn: "DDA.Damage.Type.Burn",
  freeze: "DDA.Damage.Type.Freeze",
  poison: "DDA.Damage.Type.Poison"
};

const DAMAGE_REDUCTION_LABEL_KEYS = {
  crash: "DDA.Damage.Reduction.Crash",
  burn: "DDA.Damage.Reduction.Burn",
  freeze: "DDA.Damage.Reduction.Freeze",
  poison: "DDA.Damage.Reduction.Poison"
};

export async function bindDamageApplicationButtons(root) {
  if (!root?.querySelectorAll) return;

  const buttons = Array.from(root.querySelectorAll(".dda-apply-damage"));

  for (const button of buttons) {
    if (button.dataset.ddaDamageBound === "true") continue;

    button.dataset.ddaDamageBound = "true";

    const defender = await resolveDamageTargetActor(
      button.dataset.defenderUuid
    );

    const canApplyDamage = canCurrentUserApplyDamage(defender);

    // Só o dono do alvo ou o GM recebe o botão funcional.
    button.hidden = !canApplyDamage;
    button.disabled = !canApplyDamage;

    if (!canApplyDamage) continue;

    button.addEventListener("click", applyDamageFromChat);
  }
}

async function resolveDamageTargetActor(uuid = "") {
  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);

    if (!document) return null;

    if (document.documentName === "Token") {
      return document.actor ?? null;
    }

    return document.documentName === "Actor"
      ? document
      : null;
  } catch (error) {
    console.warn("DDA | Could not resolve damage target.", error);
    return null;
  }
}

function canCurrentUserApplyDamage(actor) {
  return Boolean(
    actor &&
    (game.user.isGM || actor.isOwner)
  );
}

export async function applyDamageFromChat(event) {
  event.preventDefault();

  const button = event.currentTarget;

  if (button.dataset.ddaDamageApplied === "true") return;

  const defenderUuid = button.dataset.defenderUuid;
  const attackerUuid = String(button.dataset.attackerUuid ?? "").trim();
  const damage = Number(button.dataset.damage ?? 0);
  const damageType = normalizeDamageType(button.dataset.damageType ?? "");
  const damageLabel = String(button.dataset.damageLabel ?? "").trim();
  const holdBack = button.dataset.holdBack === "true";
  const tamerIntercede = button.dataset.tamerIntercede === "true";
  const unalterable = button.dataset.unalterable === "true";

  if (!defenderUuid) {
    warnLocalized(
      "DDA.Warning.DefenderNotFoundInAttackCard",
      "Defensor não encontrado no card de ataque."
    );
    return;
  }

  if (!Number.isFinite(damage) || damage <= 0) {
    warnLocalized("DDA.Warning.InvalidDamage", "Dano inválido.");
    return;
  }

  const defender = await resolveDamageTargetActor(defenderUuid);

  if (!defender) {
    warnLocalized(
      "DDA.Warning.DefenderActorNotFound",
      "Não foi possível encontrar o Actor do defensor."
    );
    return;
  }

  if (!canCurrentUserApplyDamage(defender)) {
    warnLocalized(
      "DDA.Warning.NoPermissionToApplyDamage",
      "Apenas o dono do alvo ou o Mestre pode aplicar este dano."
    );
    return;
  }

  const attackerDocument = attackerUuid
    ? await fromUuid(attackerUuid)
    : null;

  const attacker = attackerDocument?.documentName === "Token"
    ? attackerDocument.actor
    : attackerDocument;

  try {
    const result = await applyDamage(defender, damage, {
      damageType,
      damageLabel,
      holdBack,
      tamerIntercede,
      unalterable,
      attacker
    });

    if (!result) return;

    button.dataset.ddaDamageApplied = "true";
    button.disabled = true;
    button.innerText = localizeWithFallback(
      "DDA.Damage.Applied",
      "Dano Aplicado"
    );
  } catch (error) {
    console.error("DDA | Could not apply damage from attack card.", error);

    warnLocalized(
      "DDA.Warning.CouldNotApplyDamage",
      "Não foi possível aplicar o dano."
    );
  }
}

export async function applyDamage(actor, damage, options = {}) {
  if (actor.type === "character") {
    return applyDamageToCharacter(actor, damage, options);
  }

  if (actor.type === "digimon" || actor.type === "npc") {
    return applyDamageToDigimon(actor, damage, options);
  }

  warnLocalized(
    "DDA.Warning.UnsupportedActorTypeForDamage",
    "Tipo de Actor não suportado para dano."
  );
}

export async function applyCrashDamage(actor, damage, options = {}) {
  return applyDamage(actor, damage, {
    ...options,
    damageType: "crash",
    damageLabel: options.damageLabel ?? localizeWithFallback(
      "DDA.Damage.Type.Crash",
      "Dano de Colisão"
    )
  });
}

async function applyDamageToCharacter(actor, damage, options = {}) {
  return applyDamageToActor(actor, damage, options, {
    woundsDataPath: "system.derived.wounds",
    woundsValuePath: "system.derived.wounds.value",
    tempValuePath: "system.derived.wounds.temp.value",
    noHealthWarningKey: "DDA.Warning.CharacterHasNoHealth",
    noHealthWarningFallback: "Este personagem não possui Saúde."
  });
}

async function applyDamageToDigimon(actor, damage, options = {}) {
  return applyDamageToActor(actor, damage, options, {
    woundsDataPath: "system.miscStats.wounds",
    woundsValuePath: "system.miscStats.wounds.value",
    tempValuePath: "system.miscStats.wounds.temp.value",
    noHealthWarningKey: "DDA.Warning.DigimonHasNoHealth",
    noHealthWarningFallback: "Este Digimon não possui Saúde."
  });
}

function actorReferenceKeys(actor) {
  return new Set(
    [
      actor?.uuid,
      actor?.id,
      actor?.parent?.uuid,
      actor?.parent?.id,
      actor?.id
        ? `Actor.${actor.id}`
        : ""
    ]
      .map((value) => {
        return String(
          value ?? ""
        ).trim();
      })
      .filter(Boolean)
  );
}

async function resolveTamerForPartner(
  partner
) {
  const directUuid = String(
    partner?.system?.tamer?.uuid ?? ""
  ).trim();

  if (directUuid) {
    try {
      const document =
        await fromUuid(directUuid);

      if (
        document?.documentName === "Actor" &&
        document.type === "character"
      ) {
        return document;
      }
    } catch (error) {
      console.warn(
        "DDA | Could not resolve Tamer for Undefeated Endurance.",
        error
      );
    }
  }

  const keys =
    actorReferenceKeys(partner);

  return (
    game?.actors?.contents ?? []
  ).find((candidate) => {
    if (candidate.type !== "character") {
      return false;
    }

    const partnerData =
      candidate.system?.partner ?? {};

    return [
      partnerData.currentFormUuid,
      partnerData.uuid
    ].some((reference) => {
      return keys.has(
        String(reference ?? "").trim()
      );
    });
  }) ?? null;
}

function actorIsInActiveCombat(actor) {
  if (
    !game?.combat?.started ||
    !actor
  ) {
    return false;
  }

  return Boolean(
    game.combat.combatants?.find(
      (combatant) => {
        return Boolean(
          combatant?.actor &&
          (
            combatant.actor.uuid ===
              actor.uuid ||
            combatant.actor.id ===
              actor.id
          )
        );
      }
    )
  );
}

function combatTalentWasUsed(
  tamer,
  talentId
) {
  const usage =
    tamer?.system?.combat
      ?.tamerTalentUsage
      ?.[talentId];

  return Boolean(
    usage &&
    String(
      usage.combatId ?? ""
    ) === String(
      game?.combat?.id ?? ""
    )
  );
}

async function markCombatTalentUsed(
  tamer,
  talentId
) {
  const usage =
    foundry.utils.deepClone(
      tamer.system?.combat
        ?.tamerTalentUsage ??
      {}
    );

  usage[talentId] = {
    combatId:
      game?.combat?.id ?? "",

    round:
      Number(
        game?.combat?.round ?? 0
      ),

    turn:
      Number(
        game?.combat?.turn ?? -1
      ),

    usedAt:
      new Date().toISOString()
  };

  await tamer.update({
    "system.combat.tamerTalentUsage":
      usage
  });
}

export async function tryUndefeatedEndurance(
  actor,
  {
    prospectiveWounds = 0,
    maximumWounds = null
  } = {}
) {
  if (
    !actor ||
    !["digimon", "npc"].includes(
      actor.type
    ) ||
    Number(prospectiveWounds) > 0 ||
    !actorIsInActiveCombat(actor)
  ) {
    return null;
  }

  const tamer =
    await resolveTamerForPartner(
      actor
    );

  if (
    !tamer ||
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "undefeatedEndurance"
    ) ||
    combatTalentWasUsed(
      tamer,
      "undefeatedEndurance"
    )
  ) {
    return null;
  }

  const body = Math.max(
    0,
    Math.floor(
      Number(
        tamer.system?.attributes
          ?.body?.value ?? 0
      )
    )
  );

  const roll =
    body > 0
      ? await new Roll(
          `${body}d6`
        ).evaluate()
      : null;

  const diceResults =
    (
      roll?.dice?.[0]
        ?.results ?? []
    )
      .filter((entry) => {
        return entry.active !== false;
      })
      .map((entry) => {
        return Number(
          entry.result ?? 0
        );
      });

  const successes =
    diceResults.filter(
      (result) => result >= 5
    ).length;

  const sv = Math.max(
    0,
    Number(
      getActorSv(actor) ?? 0
    )
  );

  const maximum = Math.max(
    0,
    Number(
      maximumWounds ??
      actor.system?.miscStats
        ?.wounds?.max ??
      0
    )
  );

  const recovered = Math.min(
    maximum,
    successes + sv
  );

  if (recovered <= 0) {
    return null;
  }

  await markCombatTalentUsed(
    tamer,
    "undefeatedEndurance"
  );

  await ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor: tamer
      }),

    rolls:
      roll
        ? [roll]
        : [],

    content: `
      <div class="dda-chat-card dda-effect-card effect-positive dda-undefeated-endurance-card">
        <h2>
          ${escapeHtml(
            localizeWithFallback(
              "DDA.TamerTalent.UndefeatedEndurance.Title",
              "Undefeated Endurance"
            )
          )}
        </h2>

        <p>
          ${escapeHtml(
            localizeWithFallback(
              "DDA.TamerTalent.UndefeatedEndurance.Trigger",
              "{partner} seria Derrotado, mas continua lutando.",
              {
                partner:
                  actor.name
              }
            )
          )}
        </p>

        <ul class="dda-effect-list">
          <li>
            ${escapeHtml(
              localizeWithFallback(
                "DDA.TamerAttribute.Body",
                "Corpo"
              )
            )}:
            <strong>${body}</strong>.
          </li>

          <li>
            ${escapeHtml(
              localizeWithFallback(
                "DDA.Pool.RolledSuccesses",
                "Sucessos Rolados"
              )
            )}:
            <strong>${successes}</strong>.
          </li>

          <li>
            SV:
            <strong>+${sv}</strong>.
          </li>

          <li>
            ${escapeHtml(
              localizeWithFallback(
                "DDA.TamerTalent.UndefeatedEndurance.Recovered",
                "Caixas de Ferimento recuperadas"
              )
            )}:
            <strong>${recovered}</strong>.
          </li>
        </ul>
      </div>
    `
  });

  return {
    used: true,
    actor,
    tamer,
    roll,
    body,
    diceResults,
    successes,
    sv,
    recovered,
    wounds:
      recovered
  };
}

async function maybeUseStandardFatesProtection(actor, options = {}) {
  if (
    actor?.type !== "character" ||
    !options?.attacker ||
    options?.tamerIntercede
  ) {
    return null;
  }

  const actionCheck = checkActorActionSpend(actor, 1, {
    requireActiveUnit: false,
    notify: false
  });

  if (!actionCheck) return null;

  const combatId = String(getCombatId() ?? "");
  const storedCombatId = String(
    actor.system?.combat?.fatesProtectionStandardCombatId ?? ""
  );
  const usesBefore = storedCombatId === combatId
    ? Math.max(0, Number(actor.system?.combat?.fatesProtectionStandardUses ?? 0))
    : 0;
  const ipCost = usesBefore > 0 ? 2 : 0;
  const ipBefore = Math.max(0, Number(actor.system?.resources?.ip?.value ?? 0));

  if (ipBefore < ipCost) return null;

  const confirmed = await Dialog.confirm({
    title: localizeWithFallback(
      "DDA.FatesProtection.Title",
      "Proteção do Destino"
    ),
    content: `<div class="dda-confirm-dialog dda-fates-protection-dialog">
      <p>${escapeHtml(localizeWithFallback(
        "DDA.FatesProtection.Prompt",
        "Usar Proteção do Destino para evitar todo o Dano deste Ataque?"
      ))}</p>
      <p>${escapeHtml(localizeWithFallback(
        ipCost > 0
          ? "DDA.FatesProtection.CostPaid"
          : "DDA.FatesProtection.FirstUseFree",
        ipCost > 0
          ? "Esta utilização custa 1 Ação e 2 PI."
          : "A primeira utilização no Combate custa 1 Ação e nenhum PI."
      ))}</p>
    </div>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  if (!confirmed) return null;

  const payment = await spendActorActions(actor, 1, {
    requireActiveUnit: false,
    notify: true
  });

  if (!payment) return null;

  return {
    used: true,
    combatId,
    usesBefore,
    usesAfter: usesBefore + 1,
    ipCost,
    ipBefore,
    ipAfter: ipBefore - ipCost,
    payment
  };
}

async function applyDamageToActor(actor, damage, options = {}, config = {}) {
  const wounds = foundry.utils.getProperty(actor, config.woundsDataPath);

  if (!wounds) {
    warnLocalized(config.noHealthWarningKey, config.noHealthWarningFallback);
    return;
  }

  const currentWounds = Number(wounds.value ?? 0);
  const currentTemp = Number(wounds.temp?.value ?? 0);

  const damageInfo = getDamageApplicationInfo(actor, damage, options);
  const effectiveDamage = damageInfo.effectiveDamage;

const result = calculateWoundLoss(
  currentWounds,
  currentTemp,
  effectiveDamage
);

const intercedePending = actor.type === "character" && Boolean(options.tamerIntercede);

let intercedeSurvival = null;

if (intercedePending) {
  const ipCurrent = Math.max(0, Number(actor.system?.resources?.ip?.value ?? 0));
  const combatId = String(getCombatId() ?? "");
  const fateAlreadyUsed = String(actor.system?.combat?.fatesProtectionCombatId ?? "") === combatId;
  const canUseFatesProtection = ipCurrent >= 2 && !fateAlreadyUsed;
  const useFatesProtection = canUseFatesProtection && await Dialog.confirm({
    title: localizeWithFallback("DDA.Intercede.FatesProtectionTitle", "Fate's Protection"),
    content: `<p>${localizeWithFallback(
      "DDA.Intercede.FatesProtectionPrompt",
      "Spend 2 IP so {actor} remains at 1 Wound Box after Interceding?",
      { actor: actor.name }
    )}</p>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  result.temp = 0;
  result.wounds = useFatesProtection ? 1 : 0;
  result.tempDamage = currentTemp;
  result.healthDamage = Math.max(0, currentWounds - result.wounds);
  intercedeSurvival = {
    used: true,
    fatesProtection: Boolean(useFatesProtection),
    ipBefore: ipCurrent,
    ipAfter: useFatesProtection ? ipCurrent - 2 : ipCurrent,
    combatId
  };
}

let fatesProtection = null;

if (!intercedePending && effectiveDamage > 0) {
  fatesProtection = await maybeUseStandardFatesProtection(actor, options);

  if (fatesProtection?.used) {
    result.temp = currentTemp;
    result.wounds = currentWounds;
    result.tempDamage = 0;
    result.healthDamage = 0;
    result.absorbedByTemp = 0;
  }
}

let regenSurvival = null;
let activeEffectsUpdate = null;
const activeEffects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
const regenIndex = activeEffects.findIndex((effect) => {
  return String(effect?.tag ?? "").replace(/^\[|\]$/g, "").toLowerCase() === "regen";
});
const regenAlreadyUsed = String(actor.system?.combat?.regenSurvivalCombatId ?? "") === String(getCombatId());

if (!intercedePending && !fatesProtection?.used && result.wounds <= 0 && regenIndex >= 0 && !regenAlreadyUsed) {
  const [regenEffect] = activeEffects.splice(regenIndex, 1);
  result.wounds = 1;
  result.healthDamage = Math.max(0, currentWounds - 1);
  activeEffectsUpdate = activeEffects;
  regenSurvival = {
    used: true,
    effect: regenEffect,
    combatId: getCombatId()
  };
}

const gritSurvival = intercedePending || fatesProtection?.used
  ? null
  : await maybeApplyGritSurvival(
    actor,
    {
      currentWounds,

      nextWounds:
        result.wounds,

      sourceLabel:
        damageInfo.damageTypeLabel ||
        options.damageLabel ||
        localizeWithFallback(
          "DDA.Damage.Applied",
          "Dano Aplicado"
        )
    }
  );

if (gritSurvival?.used) {
  result.wounds =
    gritSurvival.wounds;

  result.healthDamage = Math.max(
    0,
    currentWounds - result.wounds
  );
}

const undefeatedEndurance = intercedePending || fatesProtection?.used
  ? null
  : await tryUndefeatedEndurance(
    actor,
    {
      prospectiveWounds:
        result.wounds,

      maximumWounds:
        Number(
          wounds.max ?? 0
        )
    }
  );

if (undefeatedEndurance?.used) {
  result.wounds =
    undefeatedEndurance.wounds;
}

const heldBack = Boolean(!intercedePending && options.holdBack && currentWounds > 0 && result.wounds <= 0);

if (heldBack) {
  result.wounds = 1;
  result.healthDamage = Math.max(0, currentWounds - 1);
}

await actor.update({
  [config.woundsValuePath]:
    result.wounds,

  [config.tempValuePath]:
    result.temp,

  "system.combat.defeated":
    result.wounds <= 0,

  ...(heldBack ? { "system.combat.incapacitated": true } : {}),

  ...(activeEffectsUpdate ? { "system.effects.active": activeEffectsUpdate } : {}),
  ...(regenSurvival ? { "system.combat.regenSurvivalCombatId": regenSurvival.combatId } : {}),
  ...(intercedeSurvival?.fatesProtection ? {
    "system.resources.ip.value": intercedeSurvival.ipAfter,
    "system.combat.fatesProtectionCombatId": intercedeSurvival.combatId
  } : {}),

  ...(fatesProtection?.used ? {
    "system.resources.ip.value": fatesProtection.ipAfter,
    "system.combat.fatesProtectionStandardCombatId": fatesProtection.combatId,
    "system.combat.fatesProtectionStandardUses": fatesProtection.usesAfter
  } : {})
});

let shieldBroken = false;

if (currentTemp > 0 && result.temp <= 0) {
  shieldBroken = await removeShieldEffectIfTempDepleted(actor);
}

const combatMonsterResolve = await forceAddCombatMonsterResolveFromDamage(actor, result.healthDamage);

const applicationResult = {
  actor,
  damageInfo,
  result,
shieldBroken,
combatMonsterResolve,
gritSurvival,
undefeatedEndurance,
regenSurvival,
intercedeSurvival,
fatesProtection,
before: {
    wounds: currentWounds,
    temp: currentTemp
  },
  after: {
    wounds: result.wounds,
    temp: result.temp
  }
};


  if (options.createChat === false) {
    return applicationResult;
  }

  try {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
content: buildDamageChatContent({
  actor,
  damageInfo,
  result,
  shieldBroken,
  combatMonsterResolve,
  gritSurvival,
  fatesProtection,
  currentWounds,
  currentTemp,
  effectiveDamage
})
    });
  } catch (error) {
    console.warn(
      localizeWithFallback(
        "DDA.Warning.DamageChatRenderFailed",
        "DDA | O dano foi aplicado, mas o card de chat falhou ao renderizar."
      ),
      error
    );
  }

  return applicationResult;
}


async function maybeGainCombatMonsterResolve(actor, applicationResult, options = {}) {
  if (!actor || !hasQuality(actor, "combatMonster")) return;

  const healthDamage = Number(applicationResult?.result?.healthDamage ?? 0);
  if (healthDamage <= 0) return;

  const attacker = options.attacker ?? null;
  if (attacker && (attacker.uuid === actor.uuid || areActorsAllies(actor, attacker))) return;

  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.combatMonster ??= {};

  const currentResolve = Number(qualityAttackUses.combatMonster.resolve ?? 0);
  const nextResolve = Math.min(4, Math.max(0, currentResolve + healthDamage));

  qualityAttackUses.combatMonster.resolve = nextResolve;
  qualityAttackUses.combatMonster.combatId = getCombatId();

  await actor.update({
    "system.combat.qualityAttackUses": qualityAttackUses
  });
}

function buildDamageChatContent({
  actor,
  damageInfo,
  result,
  shieldBroken,
  combatMonsterResolve,
  gritSurvival,
  fatesProtection,
  currentWounds,
  currentTemp,
  effectiveDamage
} = {}) {
  const receivedText = localizeWithFallback(
    "DDA.Damage.Received",
    "{actor} recebeu {damage} de dano.",
    {
      actor: actor.name,
      damage: damageInfo.rawDamage
    }
  );

  return `
    <div class="dda-chat-card dda-effect-card effect-negative dda-damage-card">
      <h2>${escapeHtml(localizeWithFallback("DDA.Damage.Applied", "Dano Aplicado"))}</h2>

      <p>${escapeHtml(receivedText)}</p>

      <ul class="dda-effect-list dda-damage-list">
        ${
          damageInfo.damageTypeLabel
            ? `
              <li>
                ${escapeHtml(localizeWithFallback("DDA.Damage.TypeLabel", "Tipo de Dano"))}:
                <strong>${escapeHtml(damageInfo.damageTypeLabel)}</strong>.
              </li>
            `
            : ""
        }

        ${
          damageInfo.reduction > 0
            ? `
              <li class="damage-reduction">
                ${escapeHtml(localizeWithFallback("DDA.Damage.ReductionLabel", "Redução"))}:
                <strong>-${damageInfo.reduction}</strong>
                ${damageInfo.reductionSource ? `(${escapeHtml(damageInfo.reductionSource)})` : ""}.
              </li>
            `
            : ""
        }

        <li>
          ${escapeHtml(localizeWithFallback("DDA.Damage.Final", "Dano Final"))}:
          <strong>${effectiveDamage}</strong>.
        </li>

        ${
          result.absorbedByTemp > 0
            ? `
              <li class="damage-temp-absorbed">
                ${escapeHtml(localizeWithFallback("DDA.Damage.TempAbsorbed", "Temp. absorveu"))}:
                <strong>${result.absorbedByTemp}</strong>.
              </li>
            `
            : ""
        }

        ${
          result.healthDamage > 0
            ? `
              <li class="damage-health-loss">
                ${escapeHtml(localizeWithFallback("DDA.Damage.HealthDamage", "Dano em Saúde"))}:
                <strong>${result.healthDamage}</strong>.
              </li>
            `
            : ""
        }

        <li>
          ${escapeHtml(localizeWithFallback("DDA.Damage.Temporary", "Temporárias"))}:
          <strong>${currentTemp} → ${result.temp}</strong>.
        </li>

        <li>
          ${escapeHtml(localizeWithFallback("DDA.Damage.Health", "Saúde"))}:
          <strong>${currentWounds} → ${result.wounds}</strong>.
        </li>
        ${
          fatesProtection?.used
            ? `
              <li class="damage-fates-protection">
                <strong>${escapeHtml(localizeWithFallback("DDA.FatesProtection.Title", "Proteção do Destino"))}:</strong>
                ${escapeHtml(localizeWithFallback("DDA.FatesProtection.Applied", "Todo o Dano deste Ataque foi evitado."))}
              </li>
            `
            : ""
        }
        ${
          gritSurvival?.used
            ? `
              <li class="damage-grit-survival">
                <strong>
                  ${escapeHtml(
                    localizeWithFallback(
                      "DDA.TamerTalent.Grit.Title",
                      "Grit"
                    )
                  )}:
                </strong>

                ${escapeHtml(
                  localizeWithFallback(
                    "DDA.TamerTalent.Grit.SurvivalApplied",
                    "O Digi-Escolhido permaneceu com 1 Caixa de Ferimento."
                  )
                )}
              </li>
            `
            : ""
        }
        ${
  combatMonsterResolve
    ? `
      <li class="damage-combat-monster-resolve">
        <strong>${combatMonsterResolve.qualityName}</strong>:
        Resolve
        <strong>${combatMonsterResolve.before} → ${combatMonsterResolve.after}</strong>.
      </li>
    `
    : ""
}

        ${
          shieldBroken
            ? `
              <li class="damage-shield-broken">
                <strong>${escapeHtml(localizeWithFallback("DDA.Damage.ShieldBroken", "[ESCUDO] quebrado:"))}</strong>
                ${escapeHtml(localizeWithFallback("DDA.Damage.TempHealthDepleted", "Saúde Temporária esgotada."))}
              </li>
            `
            : ""
        }

        ${
          result.wounds <= 0
            ? `
              <li class="damage-defeated">
                <strong>${escapeHtml(localizeWithFallback("DDA.Damage.Defeated", "Derrotado."))}</strong>
              </li>
            `
            : ""
        }
      </ul>
    </div>
  `;
}

function getDamageApplicationInfo(actor, damage, options = {}) {
  const rawDamage = Math.max(0, Number(damage ?? 0));
  const damageType = normalizeDamageType(options.damageType ?? "");
  const damageTypeLabel = getDamageTypeLabel(damageType, options.damageLabel);
  const ignoresReduction = Boolean(options.ignoreReduction || options.unalterable);

  const reductionData = ignoresReduction
    ? { value: 0, tooltip: "" }
    : getDamageReductionData(actor, damageType);

  const reduction = Math.min(rawDamage, reductionData.value);

  return {
    rawDamage,
    damageType,
    damageTypeLabel,
    reduction,
    reductionSource: reductionData.tooltip,
    ignoresReduction,
    effectiveDamage: Math.max(0, rawDamage - reduction)
  };
}

function normalizeDamageType(value = "") {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const aliases = {
  crash: "crash",
  collision: "crash",
  colisao: "crash",
  colision: "crash",
  impact: "crash",
  impacto: "crash",
  fall: "crash",
  falling: "crash",
  queda: "crash",
  throw: "crash",
  thrown: "crash",
  arremesso: "crash",
  arremessado: "crash",

  burn: "burn",
  burning: "burn",
  queimadura: "burn",
  queimando: "burn",
  fogo: "burn",
  fire: "burn",

  freeze: "freeze",
  freezing: "freeze",
  frozen: "freeze",
  congelamento: "freeze",
  congelado: "freeze",
  gelo: "freeze",
  ice: "freeze",

  poison: "poison",
  poisoned: "poison",
  veneno: "poison",
  envenenado: "poison",
  toxina: "poison",
  toxin: "poison"
};

  return aliases[normalized] ?? normalized;
}

function getDamageTypeLabel(damageType = "", fallback = "") {
  const explicit = String(fallback ?? "").trim();
  if (explicit) return explicit;

  const labelKey = DAMAGE_TYPE_LABEL_KEYS[damageType];

  if (!labelKey) return "";

  return localizeWithFallback(labelKey, "");
}

function getDamageReductionData(actor, damageType = "") {
  const normalizedDamageType = normalizeDamageType(damageType);

  if (!normalizedDamageType) {
    return {
      value: 0,
      tooltip: ""
    };
  }

  // Crash Damage é especial porque Tumbler/Acrobata usa RAM
  // e Naturewalk Wind/Thunder já é somado em crashDamageReduction.
  if (normalizedDamageType === "crash") {
    const crashReduction = actor.system?.utilityBonuses?.crashDamageReduction ?? {};
    const value = Math.max(0, Number(crashReduction.total ?? crashReduction.value ?? 0));

    if (value <= 0) {
      return {
        value: 0,
        tooltip: ""
      };
    }

    const fallbackLabel = localizeWithFallback(
      DAMAGE_REDUCTION_LABEL_KEYS.crash,
      "Redução de Colisão"
    );

    return {
      value,
      tooltip: crashReduction.tooltip || crashReduction.label || fallbackLabel
    };
  }

  const typedReduction = actor.system?.utilityBonuses?.damageReductionByType?.[normalizedDamageType] ?? {};
  const value = Math.max(0, Number(typedReduction.total ?? typedReduction.value ?? 0));

  if (value <= 0) {
    return {
      value: 0,
      tooltip: ""
    };
  }

  const fallbackLabel = localizeWithFallback(
    DAMAGE_REDUCTION_LABEL_KEYS[normalizedDamageType],
    "Damage Reduction"
  );

  const sources = Array.isArray(typedReduction.sources)
    ? typedReduction.sources
    : [];

  return {
    value,
    tooltip: sources.length
      ? sources.map((source) => {
          const sourceName = source.name ?? fallbackLabel;
          const sourceLabel = source.label ? `: ${source.label}` : "";
          const sourceValue = Number(source.value ?? value);

          return `${sourceName}${sourceLabel} (${sourceValue})`;
        }).join("\n")
      : fallbackLabel
  };
}

function calculateWoundLoss(currentWounds, currentTemp, damage) {
  let remainingDamage = damage;
  let temp = currentTemp;
  let wounds = currentWounds;

  let absorbedByTemp = 0;
  let healthDamage = 0;

  if (temp > 0) {
    absorbedByTemp = Math.min(temp, remainingDamage);
    temp -= absorbedByTemp;
    remainingDamage -= absorbedByTemp;
  }

  if (remainingDamage > 0) {
    const oldWounds = wounds;
    wounds = Math.max(0, wounds - remainingDamage);
    healthDamage = Math.max(0, oldWounds - wounds);
  }

  return {
    wounds,
    temp,
    absorbedByTemp,
    healthDamage
  };
}

async function removeShieldEffectIfTempDepleted(actor) {
  const currentEffects = foundry.utils.deepClone(actor.system.effects?.active ?? []);

  if (!currentEffects.length) return false;

  const updatedEffects = currentEffects.filter((effect) => {
    return getEffectTagKey(effect.tag) !== "shield";
  });

  if (updatedEffects.length === currentEffects.length) return false;

  await actor.update({
    "system.effects.active": updatedEffects
  });

  return true;
}

function getEffectTagKey(tag) {
  return String(tag ?? "")
    .trim()
    .replace("[", "")
    .replace("]", "")
    .toLowerCase();
}

function normalizeQualityKeyForDamage(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function findCombatMonsterQuality(actor) {
  return actor?.items?.find((item) => {
    if (item.type !== "quality") return false;

    const sourceId = normalizeQualityKeyForDamage(item.system?.sourceId ?? "");
    const name = normalizeQualityKeyForDamage(item.name ?? "");
    const originalName = normalizeQualityKeyForDamage(item.system?.originalName ?? "");

    return (
      sourceId === "monstrodecombate" ||
      sourceId === "combatmonster" ||
      name === "monstrodecombate" ||
      name === "combatmonster" ||
      originalName === "combatmonster"
    );
  }) ?? null;
}

function areDamageActorsAllies(attacker, defender) {
  if (!attacker || !defender) return false;

  const attackerSide = attacker.system?.combat?.initiative?.side ?? "";
  const defenderSide = defender.system?.combat?.initiative?.side ?? "";

  if (attackerSide && defenderSide) {
    return attackerSide === defenderSide;
  }

  if (attacker.type === "character" || defender.type === "character") {
    return true;
  }

  return false;
}

async function addCombatMonsterResolveFromDamage(actor, healthDamage, options = {}) {
  const damageToWounds = Math.max(0, Number(healthDamage ?? 0));

  if (!actor || damageToWounds <= 0) return null;

  const quality = findCombatMonsterQuality(actor);

  if (!quality) return null;

  const attacker = options.attacker ?? null;

  if (attacker && areDamageActorsAllies(attacker, actor)) {
    return null;
  }

  const resolveMax = Math.max(
    1,
    Number(actor.system?.resources?.resolve?.max ?? quality.system?.grants?.resource?.max ?? 4)
  );

  const visibleBefore = Number(actor.system?.resources?.resolve?.value ?? 0);

  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.combatMonster ??= {};

  const hiddenBefore = Number(qualityAttackUses.combatMonster.resolve ?? 0);
  const before = Math.max(0, visibleBefore, hiddenBefore);
  const after = Math.min(resolveMax, before + damageToWounds);

  qualityAttackUses.combatMonster.resolve = after;
  qualityAttackUses.combatMonster.combatId = game.combat?.id ?? "";
  qualityAttackUses.combatMonster.round = Number(game.combat?.round ?? 0);
  qualityAttackUses.combatMonster.turn = Number(game.combat?.turn ?? -1);

  await actor.update({
    "system.resources.resolve.enabled": true,
    "system.resources.resolve.value": after,
    "system.resources.resolve.max": resolveMax,
    "system.combat.qualityAttackUses": qualityAttackUses
  });

  return {
    qualityName: quality.name,
    before,
    after,
    gained: Math.max(0, after - before),
    healthDamage: damageToWounds
  };
}

function actorHasCombatMonsterForDamage(actor) {
  return Boolean(actor?.items?.some((item) => {
    if (item.type !== "quality") return false;

    const text = [
      item.name,
      item.system?.sourceId,
      item.system?.originalName
    ]
      .filter(Boolean)
      .join(" ");

    const key = normalizeQualityKeyForDamage(text);

    return (
      key.includes("combatmonster") ||
      key.includes("monstrodecombate")
    );
  }));
}

function getCombatMonsterQualityNameForDamage(actor) {
  const quality = actor?.items?.find((item) => {
    if (item.type !== "quality") return false;

    const text = [
      item.name,
      item.system?.sourceId,
      item.system?.originalName
    ]
      .filter(Boolean)
      .join(" ");

    const key = normalizeQualityKeyForDamage(text);

    return (
      key.includes("combatmonster") ||
      key.includes("monstrodecombate")
    );
  });

  return quality?.name ?? "Combat Monster";
}

async function forceAddCombatMonsterResolveFromDamage(actor, healthDamage) {
  const damageToWounds = Math.max(0, Number(healthDamage ?? 0));

  if (!actor || damageToWounds <= 0) return null;
  if (!actorHasCombatMonsterForDamage(actor)) return null;

  const resolveMax = Math.max(1, Number(actor.system?.resources?.resolve?.max ?? 4));
  const visibleBefore = Math.max(0, Number(actor.system?.resources?.resolve?.value ?? 0));

  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.combatMonster ??= {};

  const hiddenBefore = Math.max(0, Number(qualityAttackUses.combatMonster.resolve ?? 0));
  const before = Math.max(visibleBefore, hiddenBefore);
  const after = Math.min(resolveMax, before + damageToWounds);

  qualityAttackUses.combatMonster = {
    ...qualityAttackUses.combatMonster,
    resolve: after,
    combatId: game.combat?.id ?? "",
    round: Number(game.combat?.round ?? 0),
    turn: Number(game.combat?.turn ?? -1)
  };

  await actor.update({
    "system.resources.resolve.enabled": true,
    "system.resources.resolve.value": after,
    "system.resources.resolve.max": resolveMax,
    "system.combat.qualityAttackUses": qualityAttackUses
  });

  return {
    qualityName: getCombatMonsterQualityNameForDamage(actor),
    before,
    after,
    gained: Math.max(0, after - before),
    healthDamage: damageToWounds
  };
}

function warnLocalized(key, fallback) {
  ui.notifications.warn(localizeWithFallback(key, fallback));
}

function localizeWithFallback(key, fallback = "", data = {}) {
  if (!key) return interpolateFallback(fallback, data);

  const hasData = data && Object.keys(data).length > 0;
  const localized = hasData
    ? game.i18n.format(key, data)
    : game.i18n.localize(key);

  if (localized && localized !== key) {
    return localized;
  }

  return interpolateFallback(fallback, data);
}

function interpolateFallback(template = "", data = {}) {
  return String(template ?? "").replace(/\{([^}]+)\}/g, (match, key) => {
    return data[key] ?? match;
  });
}

function escapeHtml(value = "") {
  const element = document.createElement("div");
  element.innerText = String(value ?? "");
  return element.innerHTML;
}
