import {
  getOfficialTamerTalent,
  hasUnlockedOfficialTamerTalent
} from "./tamer-resources.js";

import {
  areActorsAllies,
  getActorSv
} from "./quality-automation.js";

import {
  requestOfficialSpecialOrderExecution
} from "./tamer-talent-socket.js";

import {
  applyDamage
} from "../rolls/damage-application.js";

import {
  getActiveDDAUnitContext
} from "../combat/initiative.js";

import {
  checkActorActionSpend
} from "../combat/action-economy.js";

import {
  expireNonStackingTemporaryWounds
} from "../combat/temporary-wounds.js";

const SYSTEM_ID = "digimon-digital-adventures";
const VANISH_TAG = "vanishBlind";
const REALIZATION_TAG = "exploit";

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en")
    ? en
    : pt;
}

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeTag(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

function isDigimonLike(actor) {
  return ["digimon", "npc"].includes(String(actor?.type ?? ""));
}

function isActiveCombat() {
  return Boolean(game?.combat?.started);
}

function combatSignature() {
  const combat = game?.combat;
  return combat?.started
    ? `${combat.id}:${number(combat.round, 0)}:${number(combat.turn, -1)}`
    : `no-combat:${game?.time?.worldTime ?? Date.now()}`;
}

function actorReferenceKeys(actor) {
  return new Set([
    actor?.uuid,
    actor?.id,
    actor?.id ? `Actor.${actor.id}` : "",
    actor?.parent?.uuid,
    actor?.parent?.id
  ].filter(Boolean).map(String));
}

function actorsMatch(left, right) {
  const rightKeys = actorReferenceKeys(right);
  return [...actorReferenceKeys(left)].some((key) => rightKeys.has(key));
}

function actorIdentityKey(actor) {
  return String(
    actor?.parent?.actorId ??
    actor?.token?.actorId ??
    actor?.id ??
    actor?.uuid ??
    ""
  ).trim();
}

function runtimeActors() {
  const actors = [
    ...(game?.actors?.contents ?? []),
    ...((canvas?.tokens?.placeables ?? []).map((token) => token.actor).filter(Boolean))
  ];

  return [...new Map(
    actors.map((actor) => [actorIdentityKey(actor), actor])
  ).values()];
}

function sceneTokenForActor(actor) {
  if (!actor) return null;
  return (canvas?.tokens?.placeables ?? []).find((token) => {
    return token?.actor && actorsMatch(token.actor, actor);
  }) ?? null;
}

async function resolveActor(uuid = "") {
  const clean = String(uuid ?? "").trim();
  if (!clean) return null;

  try {
    const document = await fromUuid(clean);
    if (document?.documentName === "Token") return document.actor ?? null;
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Could not resolve a Tamer Talent Actor.", error);
    return null;
  }
}

export async function resolvePartnerForTamer(tamer) {
  if (!tamer || tamer.type !== "character") return null;

  const directReferences = [
    tamer.system?.partner?.uuid,
    tamer.system?.partner?.currentFormUuid
  ].map((value) => String(value ?? "").trim()).filter(Boolean);

  for (const reference of directReferences) {
    const actor = await resolveActor(reference);
    if (isDigimonLike(actor)) return actor;
  }

  const tamerKeys = actorReferenceKeys(tamer);
  return runtimeActors().find((candidate) => {
    if (!isDigimonLike(candidate)) return false;
    const references = [
      candidate.system?.tamer?.uuid,
      candidate.system?.tamer?.id
    ].map((value) => String(value ?? "").trim()).filter(Boolean);
    return references.some((reference) => tamerKeys.has(reference));
  }) ?? null;
}

async function resolveTamerForPartner(partner) {
  if (!isDigimonLike(partner)) return null;

  const directReferences = [
    partner.system?.tamer?.uuid,
    partner.system?.tamer?.id
  ].map((value) => String(value ?? "").trim()).filter(Boolean);

  for (const reference of directReferences) {
    const actor = await resolveActor(reference);
    if (actor?.type === "character") return actor;
  }

  const partnerKeys = actorReferenceKeys(partner);
  return runtimeActors().find((candidate) => {
    if (candidate?.type !== "character") return false;
    return [
      candidate.system?.partner?.currentFormUuid,
      candidate.system?.partner?.uuid
    ].some((reference) => partnerKeys.has(String(reference ?? "").trim()));
  }) ?? null;
}

function selectedTargetActors() {
  return [...new Map(
    Array.from(game?.user?.targets ?? [])
      .map((token) => token?.actor)
      .filter(Boolean)
      .map((actor) => [String(actor.uuid ?? actor.id), actor])
  ).values()];
}

function sceneDigimonCandidates(predicate = () => true) {
  return (canvas?.tokens?.placeables ?? [])
    .filter((token) => token?.actor && isDigimonLike(token.actor))
    .filter((token) => game.user?.isGM || !token.document?.hidden)
    .filter((token) => predicate(token.actor, token))
    .sort((left, right) => String(left.name ?? left.actor?.name ?? "")
      .localeCompare(String(right.name ?? right.actor?.name ?? ""), game.i18n?.lang));
}

async function chooseActorFromTokens({
  title,
  hint,
  candidates = [],
  selected = []
} = {}) {
  const validSelected = selected.filter((actor) => {
    return candidates.some((token) => actorsMatch(token.actor, actor));
  });

  if (validSelected.length === 1) return validSelected[0];
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].actor;

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-effect-quality-dialog", "dda-tamer-talent-order-dialog"],
    position: { width: 480, height: "auto" },
    window: { title },
    modal: true,
    content: `
      <form class="dda-roll-dialog dda-tamer-talent-target-dialog">
        <p>${hint}</p>
        <div class="form-group">
          <label>${text("Alvo", "Target")}</label>
          <select name="actorUuid">
            ${candidates.map((token) => `
              <option value="${escapeHtml(token.actor.uuid)}">
                ${escapeHtml(token.name ?? token.actor.name)}
              </option>
            `).join("")}
          </select>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Confirmar", "Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => String(
          button.form?.elements?.actorUuid?.value ?? ""
        ).trim()
      },
      {
        action: "cancel",
        label: text("Cancelar", "Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  return result ? resolveActor(result) : null;
}

async function chooseAlliedDigimon(tamer, { includePartner = true } = {}) {
  const candidates = sceneDigimonCandidates((actor) => areActorsAllies(tamer, actor));
  const selected = selectedTargetActors().filter((actor) => {
    return isDigimonLike(actor) && areActorsAllies(tamer, actor);
  });

  if (!candidates.length && includePartner) {
    return resolvePartnerForTamer(tamer);
  }

  return chooseActorFromTokens({
    title: text("Escolher Digimon aliado", "Choose Allied Digimon"),
    hint: text(
      "Escolha um Digimon aliado disposto.",
      "Choose a willing allied Digimon."
    ),
    candidates,
    selected
  });
}

async function chooseEnemyDigimon(tamer, title = text("Escolher inimigo", "Choose Enemy")) {
  const candidates = sceneDigimonCandidates((actor) => !areActorsAllies(tamer, actor));
  const selected = selectedTargetActors().filter((actor) => {
    return isDigimonLike(actor) && !areActorsAllies(tamer, actor);
  });

  return chooseActorFromTokens({
    title,
    hint: text(
      "Escolha um Digimon inimigo visível.",
      "Choose a visible Enemy Digimon."
    ),
    candidates,
    selected
  });
}

async function chooseSwaggerActors(tamer) {
  const selected = selectedTargetActors();
  const selectedAlly = selected.find((actor) => {
    return isDigimonLike(actor) && areActorsAllies(tamer, actor);
  });
  const selectedEnemy = selected.find((actor) => {
    return isDigimonLike(actor) && !areActorsAllies(tamer, actor);
  });

  if (selectedAlly && selectedEnemy) {
    return { caster: selectedAlly, target: selectedEnemy };
  }

  const allyTokens = sceneDigimonCandidates((actor) => areActorsAllies(tamer, actor));
  const enemyTokens = sceneDigimonCandidates((actor) => !areActorsAllies(tamer, actor));
  if (!allyTokens.length || !enemyTokens.length) return null;

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-effect-quality-dialog", "dda-tamer-talent-order-dialog"],
    position: { width: 520, height: "auto" },
    window: { title: "HEY YOU" },
    modal: true,
    content: `
      <form class="dda-roll-dialog dda-tamer-talent-target-dialog">
        <p>${text(
          "Escolha o Digimon aliado que será o Conjurador e o inimigo provocado.",
          "Choose the allied Digimon who will be the Caster and the Enemy being taunted."
        )}</p>
        <div class="form-group">
          <label>${text("Digimon aliado", "Allied Digimon")}</label>
          <select name="casterUuid">
            ${allyTokens.map((token) => `<option value="${escapeHtml(token.actor.uuid)}">${escapeHtml(token.name ?? token.actor.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>${text("Inimigo", "Enemy")}</label>
          <select name="targetUuid">
            ${enemyTokens.map((token) => `<option value="${escapeHtml(token.actor.uuid)}">${escapeHtml(token.name ?? token.actor.name)}</option>`).join("")}
          </select>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Confirmar", "Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => ({
          casterUuid: String(button.form?.elements?.casterUuid?.value ?? "").trim(),
          targetUuid: String(button.form?.elements?.targetUuid?.value ?? "").trim()
        })
      },
      {
        action: "cancel",
        label: text("Cancelar", "Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  if (!result?.casterUuid || !result?.targetUuid) return null;
  return {
    caster: await resolveActor(result.casterUuid),
    target: await resolveActor(result.targetUuid)
  };
}

function buildBaseEffect({
  tamer,
  sourceActor = tamer,
  targetActor,
  talentId,
  tag,
  label,
  value = 1,
  category = "special",
  duration = 1,
  hasDuration = true,
  durationRule = true,
  extra = {}
} = {}) {
  return {
    id: foundry.utils.randomID(),
    tag,
    label,
    value,
    potency: value,
    source: "tamerTalent",
    sourceTalentId: talentId,
    sourceTalentName: getOfficialTamerTalent(talentId)?.name ?? talentId,
    sourceTamerUuid: tamer?.uuid ?? "",
    sourceTamerName: tamer?.name ?? "",
    sourceActorUuid: sourceActor?.uuid ?? tamer?.uuid ?? "",
    sourceActorName: sourceActor?.name ?? tamer?.name ?? "",
    targetActorUuid: targetActor?.uuid ?? "",
    targetActorName: targetActor?.name ?? "",
    appliedCombatId: game?.combat?.id ?? "",
    appliedCombatRound: number(game?.combat?.round, 0),
    appliedCombatTurn: number(game?.combat?.turn, -1),
    effectType: category,
    category,
    duration,
    remaining: duration,
    maxDuration: duration,
    hasDuration,
    durationRule,
    ...extra
  };
}

function buildSourceTurnEffect(data = {}) {
  return buildBaseEffect({
    ...data,
    duration: 1,
    hasDuration: false,
    durationRule: "special",
    extra: {
      ...(data.extra ?? {}),
      expiresOn: "sourceTurnStart",
      createdTurnSignature: combatSignature(),
      endsAtCombatEnd: true
    }
  });
}

async function upsertEffect(actor, incoming, { replaceOpposite = false } = {}) {
  const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);
  const incomingKey = normalizeTag(incoming.tag);

  if (replaceOpposite && ["fear", "taunt"].includes(incomingKey)) {
    const opposite = incomingKey === "fear" ? "taunt" : "fear";
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      if (normalizeTag(effects[index]?.tag) === opposite) effects.splice(index, 1);
    }
  }

  const jogressState = actor?.system?.specialEvolutions?.jogress?.state ?? {};
  const allowsSharedPartnerStack = Boolean(
    jogressState.active &&
    String(jogressState.runtimePartnerUuid ?? "") === String(actor?.uuid ?? "") &&
    incoming?.sourceTamerUuid
  );

  const existingIndex = effects.findIndex((effect) => {
    if (normalizeTag(effect?.tag) !== incomingKey) return false;

    // A Jogress is explicitly Partner to both Tamers. Special Orders from
    // different Tamers are therefore allowed to coexist instead of one
    // source replacing the other merely because they share the same tag.
    if (allowsSharedPartnerStack) {
      return String(effect?.sourceTamerUuid ?? "") === String(incoming.sourceTamerUuid ?? "");
    }

    return true;
  });

  if (existingIndex < 0) {
    effects.push(incoming);
  } else {
    const existing = effects[existingIndex];
    const existingValue = Math.max(0, number(existing.value ?? existing.potency, 0));
    const incomingValue = Math.max(0, number(incoming.value ?? incoming.potency, 0));
    const useIncomingSource = incomingKey === "taunt" || incomingValue >= existingValue;

    effects[existingIndex] = {
      ...(useIncomingSource ? { ...existing, ...incoming } : existing),
      id: existing.id ?? incoming.id,
      value: Math.max(existingValue, incomingValue),
      potency: Math.max(existingValue, incomingValue),
      duration: Math.max(number(existing.duration, 0), number(incoming.duration, 0)),
      remaining: Math.max(number(existing.remaining ?? existing.duration, 0), number(incoming.remaining ?? incoming.duration, 0)),
      maxDuration: Math.max(number(existing.maxDuration, 0), number(incoming.maxDuration, 0))
    };
  }

  await actor.update({ "system.effects.active": effects });
  actor.sheet?.render(false);
  return incoming;
}

function activeSwaggerEffect(tamer) {
  return runtimeActors().flatMap((actor) => {
    return (actor.system?.effects?.active ?? []).map((effect) => ({ actor, effect }));
  }).find(({ effect }) => {
    return effect?.sourceTalentId === "swagger" &&
      String(effect?.sourceTamerUuid ?? "") === String(tamer?.uuid ?? "") &&
      number(effect?.remaining ?? effect?.duration, 1) > 0;
  }) ?? null;
}

function noSelection(message) {
  return {
    success: false,
    applied: false,
    message
  };
}

function mutationResult(result) {
  if (!result?.ok) {
    const reasons = {
      noActiveGm: text("É necessário um Mestre ativo.", "An active GM is required."),
      timeout: text("O Mestre não respondeu a tempo.", "The GM did not respond in time."),
      invalidRequest: text("A solicitação da Ordem Especial não é válida.", "The Special Order request is invalid."),
      requestFailed: text("A Ordem Especial falhou durante a aplicação.", "The Special Order failed while being applied."),
      gmDeclined: text("O Mestre não aprovou esta Ordem Especial.", "The GM did not approve this Special Order.")
    };

    return {
      success: false,
      applied: false,
      message: result?.message ?? reasons[result?.reason] ?? text(
        "Não foi possível aplicar a Ordem Especial.",
        "Could not apply the Special Order."
      )
    };
  }

  return {
    success: true,
    applied: true,
    targetName: result.targetName ?? "",
    message: result.message ?? "",
    details: result.details ?? ""
  };
}

async function executeSelectionThroughGm(tamer, talentId, selection = {}) {
  const result = await requestOfficialSpecialOrderExecution(
    tamer,
    talentId,
    selection
  );
  return mutationResult(result);
}

export async function executeOfficialEffectSpecialOrder(tamer, talent) {
  if (!tamer || !talent) return noSelection(text("Talento inválido.", "Invalid Talent."));

  if (!isActiveCombat()) {
    return noSelection(text(
      "Esta Ordem exige um Combate ativo.",
      "This Order requires an active Combat."
    ));
  }

  const turnContext = getActiveDDAUnitContext(
    tamer,
    game.combat
  );

  if (!turnContext.allowed) {
    return noSelection(text(
      turnContext.ended
        ? "O Tamer já encerrou sua parte desta ativação."
        : "O Tamer não pertence à unidade ativa.",
      turnContext.ended
        ? "The Tamer has already ended their part of this activation."
        : "The Tamer does not belong to the active unit."
    ));
  }

  switch (talent.id) {
    case "swagger": {
      if (!isActiveCombat()) return noSelection(text("Esta Ordem exige um Combate ativo.", "This Order requires an active Combat."));
      if (activeSwaggerEffect(tamer)) {
        return noSelection(text(
          "HEY YOU não pode ser usado novamente enquanto o [TAUNT] anterior estiver ativo.",
          "HEY YOU cannot be used again while its previous [TAUNT] is active."
        ));
      }
      const choice = await chooseSwaggerActors(tamer);
      if (!choice?.caster || !choice?.target) return noSelection(text("A Ordem foi cancelada.", "The Order was cancelled."));
      return executeSelectionThroughGm(tamer, talent.id, {
        casterUuid: choice.caster.uuid,
        targetUuid: choice.target.uuid
      });
    }

    case "purifyPartner": {
      const partner = await resolvePartnerForTamer(tamer);
      if (!partner) return noSelection(text("O parceiro não pôde ser localizado.", "The Partner could not be found."));
      const negativeEffects = (partner.system?.effects?.active ?? []).filter((effect) => {
        const category = String(effect?.category ?? effect?.effectType ?? "").toLowerCase();
        return !effect?.cannotCleanse && (
          ["negative", "control", "damage"].includes(category) ||
          ["blind", "burn", "confuse", "debilitate", "distract", "doom", "dull", "exploit", "fear", "frail", "freeze", "heavy", "paralyze", "poison", "root", "slow", "stun", "taunt", "vague", "weak"].includes(normalizeTag(effect?.tag))
        );
      });

      if (!negativeEffects.length) return noSelection(text(
        `${partner.name} não possui um Efeito Negativo que possa ser removido.`,
        `${partner.name} has no removable Negative Effect.`
      ));

      const effectId = await foundry.applications.api.DialogV2.wait({
        classes: ["dda", "dda-effect-quality-dialog", "dda-tamer-talent-order-dialog"],
        position: { width: 460, height: "auto" },
        window: { title: "TOUGH IT OUT" },
        modal: true,
        content: `
          <form class="dda-roll-dialog dda-tamer-talent-target-dialog">
            <p>${text("Escolha um Efeito Negativo para remover.", "Choose one Negative Effect to remove.")}</p>
            <div class="form-group">
              <label>${text("Efeito", "Effect")}</label>
              <select name="effectId">
                ${negativeEffects.map((effect) => `<option value="${escapeHtml(effect.id)}">${escapeHtml(effect.label ?? effect.tag ?? effect.id)}</option>`).join("")}
              </select>
            </div>
          </form>
        `,
        buttons: [
          {
            action: "confirm",
            label: text("Remover", "Remove"),
            icon: "fa-solid fa-wand-magic-sparkles",
            default: true,
            callback: (_event, button) => String(button.form?.elements?.effectId?.value ?? "").trim()
          },
          {
            action: "cancel",
            label: text("Cancelar", "Cancel"),
            icon: "fa-solid fa-xmark",
            callback: () => null
          }
        ],
        rejectClose: false,
        close: () => null
      });

      if (!effectId) return noSelection(text("Nenhum Efeito foi removido.", "No Effect was removed."));
      return executeSelectionThroughGm(tamer, talent.id, {
        targetUuid: partner.uuid,
        effectId
      });
    }

    case "peakPerformance": {
      if (!isActiveCombat()) return noSelection(text("Esta Ordem exige um Combate ativo.", "This Order requires an active Combat."));
      const target = await chooseAlliedDigimon(tamer);
      if (!target) return noSelection(text("Nenhum Digimon aliado foi escolhido.", "No allied Digimon was chosen."));
      return executeSelectionThroughGm(tamer, talent.id, { targetUuid: target.uuid });
    }

    case "enemyScan": {
      if (!isActiveCombat()) return noSelection(text("Esta Ordem exige um Combate ativo.", "This Order requires an active Combat."));
      const target = await chooseEnemyDigimon(tamer, "I’VE FOUND AN EXPLOIT");
      if (!target) return noSelection(text("Nenhum inimigo foi escolhido.", "No Enemy was chosen."));
      return executeSelectionThroughGm(tamer, talent.id, { targetUuid: target.uuid });
    }

    case "vanish": {
      if (!isActiveCombat()) return noSelection(text("Esta Ordem exige um Combate ativo.", "This Order requires an active Combat."));
      const currentActions = number(tamer.system?.combat?.actions?.value, 0);
      const maximumActions = number(tamer.system?.combat?.actions?.max, 2);
      if (currentActions < maximumActions) {
        return noSelection(text(
          "NOW YOU SEE US deve ser declarado antes de qualquer outra Ação do Tamer neste turno.",
          "NOW YOU SEE US must be declared before the Tamer takes any other Action this turn."
        ));
      }
      const target = await chooseEnemyDigimon(tamer, "NOW YOU SEE US");
      if (!target) return noSelection(text("Nenhum inimigo foi escolhido.", "No Enemy was chosen."));
      const partner = await resolvePartnerForTamer(tamer);
      if (!partner) return noSelection(text("O parceiro não pôde ser localizado.", "The Partner could not be found."));
      return executeSelectionThroughGm(tamer, talent.id, {
        targetUuid: target.uuid,
        partnerUuid: partner.uuid
      });
    }

    case "adrenalineHit": {
      if (!isActiveCombat()) return noSelection(text("Esta Ordem exige um Combate ativo.", "This Order requires an active Combat."));
      const target = await chooseEnemyDigimon(tamer, "HAVE SOME OF THIS");
      if (!target) return noSelection(text("Nenhum inimigo foi escolhido.", "No Enemy was chosen."));
      return executeSelectionThroughGm(tamer, talent.id, { targetUuid: target.uuid });
    }

    case "realization": {
      if (!isActiveCombat()) return noSelection(text("Esta Ordem exige um Combate ativo.", "This Order requires an active Combat."));
      const target = await chooseEnemyDigimon(tamer, "I’VE FIGURED IT OUT");
      if (!target) return noSelection(text("Nenhum inimigo foi escolhido.", "No Enemy was chosen."));
      return executeSelectionThroughGm(tamer, talent.id, { targetUuid: target.uuid });
    }

    case "heroicExemplar": {
      if (!isActiveCombat()) return noSelection(text("Esta Ordem exige um Combate ativo.", "This Order requires an active Combat."));
      const windowState = tamer.system?.combat?.tamerTalentWindows?.heroicExemplar ?? {};
      const current = combatSignature();
      if (!windowState.active || String(windowState.turnSignature ?? "") !== current) {
        return noSelection(text(
          "SHOW THEM WHAT YOU’RE MADE OF só pode ser declarado após o parceiro acertar um inimigo.",
          "SHOW THEM WHAT YOU’RE MADE OF can only be declared after the Partner hits an Enemy."
        ));
      }
      const partner = await resolvePartnerForTamer(tamer);
      if (!partner) return noSelection(text("O parceiro não pôde ser localizado.", "The Partner could not be found."));
      const allies = runtimeActors().filter((actor) => {
        if (!isDigimonLike(actor) || !areActorsAllies(tamer, actor)) return false;
        return Boolean(sceneTokenForActor(actor) || actorsMatch(actor, partner));
      });
      return executeSelectionThroughGm(tamer, talent.id, {
        partnerUuid: partner.uuid,
        targetUuids: [...new Set(allies.map((actor) => actor.uuid))]
      });
    }

    default:
      return noSelection(text("Esta Ordem Especial ainda não possui automação dedicada.", "This Special Order does not have dedicated automation yet."));
  }
}

function getTalentActionCost(talent) {
  const raw = String(talent?.actionCost ?? "").trim().toLowerCase();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function validateMutationActors(tamer, talentId, selection, actors) {
  const talent = getOfficialTamerTalent(talentId);

  if (
    !tamer ||
    tamer.type !== "character" ||
    !talent ||
    !hasUnlockedOfficialTamerTalent(tamer, talentId) ||
    !selection ||
    typeof selection !== "object"
  ) {
    return false;
  }

  const turnContext = getActiveDDAUnitContext(
    tamer,
    game.combat
  );
  if (!turnContext.allowed) return false;

  const actionCost = getTalentActionCost(talent);
  const availableActions = Math.max(
    0,
    number(tamer.system?.combat?.actions?.value, 0)
  );
  if (availableActions < actionCost) return false;

  if (talent.uses?.enabled) {
    const storedUse = tamer.system?.tamerTalentUses?.[talentId] ?? {};
    const remainingUses = number(
      storedUse.value,
      number(talent.uses.value ?? talent.uses.max, 0)
    );
    if (remainingUses <= 0) return false;
  }

  const frequency = String(talent.frequency ?? "");
  const usage = tamer.system?.combat?.tamerTalentUsage?.[talentId] ?? null;
  const sameCombat = Boolean(
    usage &&
    String(usage.combatId ?? "") === String(game.combat?.id ?? "")
  );

  if (frequency === "oncePerCombat" && sameCombat) return false;
  if (
    frequency === "oncePerTurn" &&
    sameCombat &&
    number(usage.round, -1) === number(game.combat?.round, -2) &&
    number(usage.turn, -1) === number(game.combat?.turn, -2)
  ) {
    return false;
  }

  for (const actor of actors.filter(Boolean)) {
    if (!isDigimonLike(actor) && actor.type !== "character") return false;
  }

  return true;
}

async function removeEffectWithCleanup(actor, effectId) {
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const index = effects.findIndex((effect) => String(effect?.id ?? "") === String(effectId ?? ""));
  if (index < 0) return null;
  const effect = effects[index];
  if (effect.cannotCleanse) return null;
  effects.splice(index, 1);

  const updates = { "system.effects.active": effects };
  const tag = normalizeTag(effect.tag);

  if (tag === "stun" && number(effect.actionRemoved, 0) > 0) {
    const current = Math.max(0, number(actor.system?.combat?.actions?.value, 0));
    const maximum = Math.max(0, number(actor.system?.combat?.actions?.max, 2));
    const hasteActive = effects.some((candidate) => {
      return normalizeTag(candidate?.tag) === "haste" && number(candidate?.actionGranted, 0) > 0;
    });
    updates["system.combat.actions.value"] = Math.min(maximum + (hasteActive ? 1 : 0), current + number(effect.actionRemoved, 0));
  }

  if (tag === "shield") {
    await expireNonStackingTemporaryWounds(actor, {
      sourceId: "shield",
      effectId: String(effect.id ?? "")
    });
  }

  await actor.update(updates);
  actor.sheet?.render(false);
  return effect;
}

async function mutateSwagger(tamer, selection) {
  const caster = await resolveActor(selection.casterUuid);
  const target = await resolveActor(selection.targetUuid);
  if (!validateMutationActors(tamer, "swagger", selection, [caster, target])) return { ok: false, reason: "invalidRequest" };
  if (!caster || !target || !isDigimonLike(caster) || !isDigimonLike(target)) return { ok: false, reason: "invalidRequest" };
  if (!areActorsAllies(tamer, caster) || areActorsAllies(tamer, target)) return { ok: false, reason: "invalidRequest" };
  if (activeSwaggerEffect(tamer)) return { ok: false, message: text("O [TAUNT] anterior ainda está ativo.", "The previous [TAUNT] is still active.") };

  const effect = buildBaseEffect({
    tamer,
    sourceActor: caster,
    targetActor: target,
    talentId: "swagger",
    tag: "taunt",
    label: "[TAUNT 3] — HEY YOU",
    value: 3,
    category: "negative",
    duration: 3,
    extra: {
      disableEffectResistance: true,
      cannotUseResistanceCheck: true,
      tauntCasterIsAlly: true
    }
  });

  await upsertEffect(target, effect, { replaceOpposite: true });
  return {
    ok: true,
    targetName: target.name,
    message: text(`${target.name} recebeu [TAUNT 3] por 3 Rodadas.`, `${target.name} received [TAUNT 3] for 3 Rounds.`),
    details: text(`${caster.name} é o Conjurador; o Teste de resistência do Efeito está bloqueado.`, `${caster.name} is the Caster; the Effect resistance Check is disabled.`)
  };
}

async function mutatePurifyPartner(tamer, selection) {
  const target = await resolveActor(selection.targetUuid);
  if (!validateMutationActors(tamer, "purifyPartner", selection, [target])) return { ok: false, reason: "invalidRequest" };
  const partner = await resolvePartnerForTamer(tamer);
  if (!target || !partner || !actorsMatch(target, partner)) return { ok: false, reason: "invalidRequest" };
  const removed = await removeEffectWithCleanup(target, selection.effectId);
  if (!removed) return { ok: false, message: text("O Efeito não está mais disponível para remover.", "The Effect is no longer available to remove.") };
  return {
    ok: true,
    targetName: target.name,
    message: text(`${removed.label ?? removed.tag} foi removido de ${target.name}.`, `${removed.label ?? removed.tag} was removed from ${target.name}.`),
    details: text("A remoção aplicou a limpeza mecânica do Efeito.", "The removal applied the Effect's mechanical cleanup.")
  };
}

async function mutatePeakPerformance(tamer, selection) {
  const target = await resolveActor(selection.targetUuid);
  if (!validateMutationActors(tamer, "peakPerformance", selection, [target])) return { ok: false, reason: "invalidRequest" };
  if (!target || !isDigimonLike(target) || !areActorsAllies(tamer, target)) return { ok: false, reason: "invalidRequest" };
  const effect = buildSourceTurnEffect({
    tamer,
    targetActor: target,
    talentId: "peakPerformance",
    tag: "bastion",
    label: "[BASTION 2] — I BELIEVE IN YOU",
    value: 2,
    category: "positive"
  });
  await upsertEffect(target, effect);
  return {
    ok: true,
    targetName: target.name,
    message: text(`${target.name} recebeu [BASTION 2].`, `${target.name} received [BASTION 2].`),
    details: text("Dura até o início do próximo turno do Tamer.", "Lasts until the start of the Tamer's next turn.")
  };
}

async function mutateEnemyScan(tamer, selection) {
  const target = await resolveActor(selection.targetUuid);
  if (!validateMutationActors(tamer, "enemyScan", selection, [target])) return { ok: false, reason: "invalidRequest" };
  if (!target || !isDigimonLike(target) || areActorsAllies(tamer, target)) return { ok: false, reason: "invalidRequest" };
  const potency = Math.max(0, number(getActorSv(target), number(target.system?.stageValue, 0)));
  const effect = buildSourceTurnEffect({
    tamer,
    targetActor: target,
    talentId: "enemyScan",
    tag: "debilitate",
    label: `[DEBILITATE ${potency}] — I’VE FOUND AN EXPLOIT`,
    value: potency,
    category: "negative"
  });
  await upsertEffect(target, effect);
  return {
    ok: true,
    targetName: target.name,
    message: text(`${target.name} recebeu [DEBILITATE ${potency}].`, `${target.name} received [DEBILITATE ${potency}].`),
    details: text("Dura até o início do próximo turno do Tamer.", "Lasts until the start of the Tamer's next turn.")
  };
}

async function mutateVanish(tamer, selection) {
  const target = await resolveActor(selection.targetUuid);
  const partner = await resolveActor(selection.partnerUuid);
  if (!validateMutationActors(tamer, "vanish", selection, [target, partner])) return { ok: false, reason: "invalidRequest" };
  if (!target || !partner || areActorsAllies(tamer, target) || !areActorsAllies(tamer, partner)) return { ok: false, reason: "invalidRequest" };

  const hiddenActorUuids = [tamer.uuid, partner.uuid];
  const effect = buildSourceTurnEffect({
    tamer,
    targetActor: target,
    talentId: "vanish",
    tag: VANISH_TAG,
    label: "NOW YOU SEE US — [BLIND]",
    value: 1,
    category: "negative",
    extra: {
      hiddenActorUuids,
      cannotCleanse: true,
      cannotReduceDuration: true,
      cannotIgnore: true,
      ignoresResistance: true
    }
  });
  await upsertEffect(target, effect);

  const restrictions = foundry.utils.deepClone(tamer.system?.combat?.tamerTalentRestrictions ?? {});
  restrictions.vanish = {
    active: true,
    combatId: game.combat?.id ?? "",
    round: number(game.combat?.round, 0),
    turn: number(game.combat?.turn, -1),
    turnSignature: combatSignature(),
    allowedActions: ["move", "reposition"],
    targetUuid: target.uuid,
    partnerUuid: partner.uuid
  };
  await tamer.update({ "system.combat.tamerTalentRestrictions": restrictions });

  return {
    ok: true,
    targetName: target.name,
    message: text(`${tamer.name} e ${partner.name} desapareceram da visão de ${target.name}.`, `${tamer.name} and ${partner.name} vanished from ${target.name}'s sight.`),
    details: text("Neste turno, o Tamer só pode Mover ou Reposicionar.", "This turn, the Tamer may only Move or Reposition.")
  };
}

async function mutateAdrenalineHit(tamer, selection) {
  const target = await resolveActor(selection.targetUuid);
  if (!validateMutationActors(tamer, "adrenalineHit", selection, [target])) return { ok: false, reason: "invalidRequest" };
  if (!target || !isDigimonLike(target) || areActorsAllies(tamer, target)) return { ok: false, reason: "invalidRequest" };

  const approved = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-effect-quality-dialog", "dda-tamer-talent-order-dialog"],
    window: { title: "HAVE SOME OF THIS — GM" },
    content: `<div class="dda-roll-dialog"><p>${text(
      `<strong>${escapeHtml(tamer.name)}</strong> quer arremessar um objeto em <strong>${escapeHtml(target.name)}</strong>. O objeto proposto é permitido?`,
      `<strong>${escapeHtml(tamer.name)}</strong> wants to throw an object at <strong>${escapeHtml(target.name)}</strong>. Is the proposed object allowed?`
    )}</p></div>`,
    yes: { label: text("Aprovar objeto", "Approve object") },
    no: { label: text("Negar", "Decline") },
    rejectClose: false,
    modal: true
  });

  if (!approved) {
    return {
      ok: false,
      reason: "gmDeclined",
      message: text(
        "O Mestre não aprovou o objeto de HAVE SOME OF THIS.",
        "The GM did not approve the object for HAVE SOME OF THIS."
      )
    };
  }

  if (!validateMutationActors(tamer, "adrenalineHit", selection, [target])) {
    return {
      ok: false,
      reason: "invalidRequest",
      message: text(
        "O turno ou os recursos do Tamer mudaram antes da aprovação do Mestre.",
        "The Tamer's turn or resources changed before the GM approved the Order."
      )
    };
  }

  const damage = Math.max(0, number(getActorSv(target), number(target.system?.stageValue, 1)));
  const damageResult = await applyDamage(target, damage, {
    damageLabel: text("Dano Inalterável — HAVE SOME OF THIS", "Unalterable Damage — HAVE SOME OF THIS"),
    attacker: tamer,
    createChat: false,
    ignoreReduction: true,
    unalterable: true
  });
  if (!damageResult) return { ok: false, message: text("O dano não pôde ser aplicado.", "The damage could not be applied.") };

  const currentActions = Math.max(0, number(target.system?.combat?.actions?.value, 0));
  const removed = currentActions > 0 ? 1 : 0;
  if (removed) {
    await target.update({ "system.combat.actions.value": currentActions - removed });
  }

  const effect = buildSourceTurnEffect({
    tamer,
    targetActor: target,
    talentId: "adrenalineHit",
    tag: "stun",
    label: "[STUN] — HAVE SOME OF THIS",
    value: 1,
    category: "control",
    extra: {
      actionRemoved: removed,
      activatesAtEndOfNextTurn: removed === 0,
      appliedCombatId: game.combat?.id ?? "",
      appliedCombatRound: number(game.combat?.round, 0),
      appliedCombatTurn: number(game.combat?.turn, -1),
      restoreActionOnExpire: true
    }
  });
  await upsertEffect(target, effect);

  if (typeof game?.dda?.actions?.endDigimonClash === "function") {
    await game.dda.actions.endDigimonClash(target, { reason: "stun", all: true });
  }

  return {
    ok: true,
    targetName: target.name,
    message: text(`${target.name} sofreu ${damage} de Dano Inalterável e recebeu [STUN].`, `${target.name} took ${damage} Unalterable Damage and received [STUN].`),
    details: text("[STUN] dura até o início do próximo turno do Tamer.", "[STUN] lasts until the start of the Tamer's next turn.")
  };
}

async function mutateRealization(tamer, selection) {
  const target = await resolveActor(selection.targetUuid);
  if (!validateMutationActors(tamer, "realization", selection, [target])) return { ok: false, reason: "invalidRequest" };
  if (!target || !isDigimonLike(target) || areActorsAllies(tamer, target)) return { ok: false, reason: "invalidRequest" };

  const effect = buildBaseEffect({
    tamer,
    targetActor: target,
    talentId: "realization",
    tag: REALIZATION_TAG,
    label: "[EXPLOIT 3] — I’VE FIGURED IT OUT",
    value: 3,
    category: "negative",
    duration: 1,
    hasDuration: false,
    durationRule: "combat",
    extra: {
      endsAtCombatEnd: true,
      removalActionCost: 2,
      cleanseEndsImmediately: true,
      ignoresResistance: true,
      cannotReducePotency: true,
      bypassesOverwrite: true,
      realizationSourceTamerUuid: tamer.uuid
    }
  });
  await upsertEffect(target, effect);

  return {
    ok: true,
    targetName: target.name,
    message: text(`${target.name} recebeu [EXPLOIT 3] até o fim do Combate.`, `${target.name} received [EXPLOIT 3] until the end of Combat.`),
    details: text("O Efeito ignora Overwrite/Resistance e termina por Cleanse ou pelo gasto de 2 Ações.", "The Effect ignores Overwrite/Resistance and ends through Cleanse or by spending 2 Actions.")
  };
}

async function mutateHeroicExemplar(tamer, selection) {
  const partner = await resolveActor(selection.partnerUuid);
  const targets = (Array.isArray(selection.targetUuids) ? selection.targetUuids : [])
    .map((uuid) => String(uuid ?? "").trim())
    .filter(Boolean);
  const resolvedTargets = (await Promise.all(targets.map(resolveActor))).filter(Boolean);
  if (!validateMutationActors(tamer, "heroicExemplar", selection, [partner, ...resolvedTargets])) return { ok: false, reason: "invalidRequest" };
  if (!partner || !isDigimonLike(partner) || !areActorsAllies(tamer, partner)) return { ok: false, reason: "invalidRequest" };

  const uniqueTargets = [...new Map(
    [partner, ...resolvedTargets]
      .filter((actor) => isDigimonLike(actor) && areActorsAllies(tamer, actor))
      .map((actor) => [actorIdentityKey(actor), actor])
  ).values()];

  for (const target of uniqueTargets) {
    const effect = buildBaseEffect({
      tamer,
      targetActor: target,
      talentId: "heroicExemplar",
      tag: "bastion",
      label: "[BASTION 1] — SHOW THEM WHAT YOU’RE MADE OF",
      value: 1,
      category: "positive",
      duration: 3
    });
    await upsertEffect(target, effect);
  }

  const windows = foundry.utils.deepClone(tamer.system?.combat?.tamerTalentWindows ?? {});
  windows.heroicExemplar = { active: false, consumedAt: Date.now() };
  await tamer.update({ "system.combat.tamerTalentWindows": windows });

  return {
    ok: true,
    targetName: uniqueTargets.map((actor) => actor.name).join(", "),
    message: text(`${uniqueTargets.length} Digimon aliado(s) receberam [BASTION 1].`, `${uniqueTargets.length} allied Digimon received [BASTION 1].`),
    details: text("Duração 3.", "Duration 3.")
  };
}

export async function executeOfficialSpecialOrderMutation(
  tamer,
  talentId,
  selection = {}
) {
  let result;

  switch (talentId) {
    case "swagger":
      result = await mutateSwagger(tamer, selection);
      break;

    case "purifyPartner":
      result = await mutatePurifyPartner(tamer, selection);
      break;

    case "peakPerformance":
      result = await mutatePeakPerformance(tamer, selection);
      break;

    case "enemyScan":
      result = await mutateEnemyScan(tamer, selection);
      break;

    case "vanish":
      result = await mutateVanish(tamer, selection);
      break;

    case "adrenalineHit":
      result = await mutateAdrenalineHit(tamer, selection);
      break;

    case "realization":
      result = await mutateRealization(tamer, selection);
      break;

    case "heroicExemplar":
      result = await mutateHeroicExemplar(tamer, selection);
      break;

    case "signatureVersatility":
    case "autoHit":
    case "hackingPride":
    case "nextOrder":
    case "beTheWinners": {
      const {
        executeAttackDirectTalentMutation
      } = await import(
        "./tamer-talent-attack-direct.js"
      );

      result = await executeAttackDirectTalentMutation(
        tamer,
        talentId,
        selection
      );
      break;
    }

    case "predictable":
    case "hackersMemory":
    case "gloriousWorld":
    case "miracle": {
      const {
        executeTransversalTamerTalentMutation
      } = await import(
        "./tamer-talent-transversal.js"
      );

      result = await executeTransversalTamerTalentMutation(
        tamer,
        talentId,
        selection
      );
      break;
    }

    default:
      result = {
        ok: false,
        reason: "unknownSpecialOrder"
      };
      break;
  }

  const offensiveTalentIds = new Set([
    "swagger",
    "enemyScan",
    "vanish",
    "adrenalineHit",
    "realization",
    "hackingPride"
  ]);

  if (
    result?.ok &&
    offensiveTalentIds.has(talentId) &&
    selection?.targetUuid
  ) {
    const target = await resolveActor(
      selection.targetUuid
    );

    if (
      target &&
      !areActorsAllies(tamer, target)
    ) {
      const {
        revealOverlookedToEnemy
      } = await import(
        "./tamer-talent-combat-survival.js"
      );

      await revealOverlookedToEnemy(
        tamer,
        target,
        talentId
      );
    }
  }

  return result;
}

export function getVanishTamerActionRestriction(tamer) {
  const state = tamer?.system?.combat?.tamerTalentRestrictions?.vanish ?? null;
  if (!state?.active) return null;
  if (String(state.combatId ?? "") !== String(game?.combat?.id ?? "")) return null;
  if (String(state.turnSignature ?? "") !== combatSignature()) return null;
  return state;
}

function realizationEffects(actor) {
  return (actor?.system?.effects?.active ?? []).filter((effect) => {
    return normalizeTag(effect?.tag) === REALIZATION_TAG &&
      effect?.sourceTalentId === "realization" &&
      number(effect?.removalActionCost, 0) === 2;
  });
}

export function getRealizationDefenseMenuEntry(actor) {
  const effects = realizationEffects(actor);
  if (!effects.length) return null;
  return {
    key: "defendRealization",
    title: text("Defender a Fraqueza", "Defend the Weakness"),
    summary: text("Gaste 2 Ações para encerrar [EXPLOIT 3] de Realization.", "Spend 2 Actions to end Realization's [EXPLOIT 3]."),
    cost: "2A"
  };
}

export async function defendRealizationWeakness(actor) {
  const effects = realizationEffects(actor);
  if (!effects.length) return null;
  const payment = checkActorActionSpend(
    actor,
    2
  );
  if (!payment) return null;

  const effectIds = new Set(effects.map((effect) => String(effect.id ?? "")));
  const remaining = foundry.utils.deepClone(actor.system?.effects?.active ?? [])
    .filter((effect) => !effectIds.has(String(effect?.id ?? "")));
  await actor.update({
    "system.combat.actions.value": payment.remaining,
    "system.effects.active": remaining
  });
  actor.sheet?.render(false);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special">
        <h2>${text("Fraqueza Defendida", "Weakness Defended")}</h2>
        <p><strong>${escapeHtml(actor.name)}</strong> ${text(
          "gastou 2 Ações e encerrou [EXPLOIT 3] de Realization.",
          "spent 2 Actions and ended Realization's [EXPLOIT 3]."
        )}</p>
      </div>
    `
  });
  return true;
}

export async function maybeOfferHeroicExemplarAfterHit({ attacker, defender, hit = false } = {}) {
  if (!hit || !isDigimonLike(attacker) || !defender || areActorsAllies(attacker, defender)) return null;
  const tamer = await resolveTamerForPartner(attacker);
  if (!tamer || !hasUnlockedOfficialTamerTalent(tamer, "heroicExemplar")) return null;
  if (!game.user?.isGM && !tamer.isOwner) return null;

  const talent = getOfficialTamerTalent("heroicExemplar");
  const usage = tamer.system?.combat?.tamerTalentUsage?.heroicExemplar;
  if (usage && String(usage.combatId ?? "") === String(game.combat?.id ?? "")) return null;
  if (number(tamer.system?.combat?.actions?.value, 0) < 2) return null;

  const windows = foundry.utils.deepClone(tamer.system?.combat?.tamerTalentWindows ?? {});
  windows.heroicExemplar = {
    active: true,
    combatId: game.combat?.id ?? "",
    round: number(game.combat?.round, 0),
    turn: number(game.combat?.turn, -1),
    turnSignature: combatSignature(),
    attackerUuid: attacker.uuid,
    defenderUuid: defender.uuid,
    openedAt: Date.now()
  };
  await tamer.update({ "system.combat.tamerTalentWindows": windows });

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-effect-quality-dialog", "dda-tamer-talent-order-dialog"],
    window: { title: "SHOW THEM WHAT YOU’RE MADE OF" },
    content: `<div class="dda-roll-dialog"><p>${text(
      `<strong>${escapeHtml(attacker.name)}</strong> acertou <strong>${escapeHtml(defender.name)}</strong>. Gastar 2 Ações de ${escapeHtml(tamer.name)} para usar Heroic Exemplar?`,
      `<strong>${escapeHtml(attacker.name)}</strong> hit <strong>${escapeHtml(defender.name)}</strong>. Spend 2 of ${escapeHtml(tamer.name)}'s Actions to use Heroic Exemplar?`
    )}</p></div>`,
    yes: { label: text("Usar Ordem", "Use Order") },
    no: { label: text("Agora não", "Not now") },
    rejectClose: false,
    modal: true
  });

  if (!confirmed) {
    const latestWindows = foundry.utils.deepClone(
      tamer.system?.combat?.tamerTalentWindows ?? {}
    );
    latestWindows.heroicExemplar = {
      active: false,
      declinedAt: Date.now()
    };
    await tamer.update({
      "system.combat.tamerTalentWindows": latestWindows
    });
    return null;
  }

  const { useTamerTalent } = await import("./tamer-talent-automation.js");
  const result = await useTamerTalent(tamer, talent, { source: "official" });
  if (!result?.success) {
    const latestWindows = foundry.utils.deepClone(
      tamer.system?.combat?.tamerTalentWindows ?? {}
    );
    latestWindows.heroicExemplar = {
      active: false,
      failedAt: Date.now()
    };
    await tamer.update({
      "system.combat.tamerTalentWindows": latestWindows
    });

    ui.notifications.warn(result?.message ?? text("Heroic Exemplar falhou.", "Heroic Exemplar failed."));
    return null;
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive">
        <h2>SHOW THEM WHAT YOU’RE MADE OF</h2>
        <p>${escapeHtml(result.message ?? "")}</p>
        ${result.details ? `<p>${escapeHtml(result.details)}</p>` : ""}
      </div>
    `
  });
  return result;
}

export function getVanishBlindAttackPenalty(attacker, defender) {
  if (!attacker || !defender) return 0;
  const defenderKeys = actorReferenceKeys(defender);
  return (attacker.system?.effects?.active ?? []).reduce((penalty, effect) => {
    if (normalizeTag(effect?.tag) !== VANISH_TAG) return penalty;
    const hidden = new Set((effect.hiddenActorUuids ?? []).map(String));
    const applies = [...defenderKeys].some((key) => hidden.has(key));
    return applies ? penalty + Math.max(1, number(effect.value ?? effect.potency, 1)) : penalty;
  }, 0);
}

export function getVanishBlindDodgePenalty(defender, attacker) {
  return getVanishBlindAttackPenalty(defender, attacker);
}
