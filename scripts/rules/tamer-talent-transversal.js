import {
  getOfficialTamerTalentUseState,
  getTamerIpPool,
  hasUnlockedOfficialTamerTalent,
  spendOfficialTamerTalentUse
} from "./tamer-resources.js";
import {
  requestOfficialSpecialOrderExecution
} from "./tamer-talent-socket.js";

const SYSTEM_ID = "digimon-digital-adventures";
const HOLD_TAG = "tamerHold";
const RUNTIME_PATH = "system.combat.tamerTalentRuntime";
const MIRACLE_PATH = `${RUNTIME_PATH}.miracle`;
const HACKERS_MEMORY_PATH = `${RUNTIME_PATH}.hackersMemory`;
const GLORIOUS_WORLD_PATH = "system.tamerTalentStates.gloriousWorld";
const TAMER_ACTION_FLAG = "tamerAction";

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function integer(value, fallback = 0) {
  return Math.max(0, Math.floor(number(value, fallback)));
}

function isEnglish() {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
}

function text(pt, en) {
  return isEnglish() ? en : pt;
}

function frenzyBlocksTamerInfluence(actor) {
  return Boolean(game?.dda?.bossQualities?.isFrenzyTamerInfluenceBlocked?.(actor));
}

function frenzyBlockedMutation(actor) {
  return {
    ok: false,
    reason: "frenzyImmuneToTamerInfluence",
    message: text(
      `[FRENZY]: ${actor?.name ?? "O Digimon"} não pode ser afetado por Ações do Tamer ou Ordens Especiais.`,
      `[FRENZY]: ${actor?.name ?? "The Digimon"} cannot be affected by Tamer Actions or Special Orders.`
    )
  };
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function activeCombatId() {
  return String(game?.combat?.id ?? "");
}

function turnSignature() {
  return `${activeCombatId()}:${integer(game?.combat?.round, 0)}:${integer(game?.combat?.turn, -1)}`;
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
  const leftKeys = actorReferenceKeys(left);
  for (const key of actorReferenceKeys(right)) {
    if (leftKeys.has(key)) return true;
  }
  return false;
}

function dispositionOf(actor) {
  const token = (canvas?.tokens?.placeables ?? []).find((entry) => entry?.actor && actorsMatch(entry.actor, actor));
  const disposition = Number(
    token?.document?.disposition ??
    actor?.prototypeToken?.disposition ??
    0
  );
  if (disposition < 0) return "enemy";
  if (disposition > 0) return "ally";
  return ["npc", "group"].includes(actor?.type) ? "enemy" : "ally";
}

function areAllies(left, right) {
  if (!left || !right) return false;
  return dispositionOf(left) === dispositionOf(right);
}

function isDigimonLike(actor) {
  return Boolean(actor && ["digimon", "npc"].includes(actor.type));
}

function uniqueRuntimeActors() {
  const actors = [
    ...(game?.actors?.contents ?? []),
    ...(canvas?.tokens?.placeables ?? []).map((token) => token.actor).filter(Boolean)
  ];
  return [...new Map(actors.map((actor) => [actor.uuid ?? actor.id, actor])).values()];
}

async function resolveActor(uuid = "") {
  const clean = String(uuid ?? "").trim();
  if (!clean) return null;
  try {
    const document = await fromUuid(clean);
    return document?.documentName === "Token" ? document.actor : document;
  } catch (_error) {
    return null;
  }
}

async function resolvePartner(tamer) {
  const partnerReference = String(tamer?.system?.partner?.uuid ?? "").trim();
  if (!partnerReference) return null;
  const direct = await resolveActor(partnerReference);
  if (direct) return direct;
  return uniqueRuntimeActors().find((actor) => actor?.type === "digimon" && actorReferenceKeys(actor).has(partnerReference)) ?? null;
}

function selectableEnemies(tamer) {
  return uniqueRuntimeActors()
    .filter((actor) => isDigimonLike(actor) && !areAllies(tamer, actor))
    .sort((left, right) => String(left.name).localeCompare(String(right.name), game?.i18n?.lang));
}

function selectableMealRecipients() {
  return uniqueRuntimeActors()
    .filter((actor) => ["character", "digimon", "npc"].includes(actor?.type))
    .sort((left, right) => String(left.name).localeCompare(String(right.name), game?.i18n?.lang));
}

function buildSelectOptions(actors = []) {
  return actors.map((actor) => `<option value="${escapeHtml(actor.uuid)}">${escapeHtml(actor.name)}</option>`).join("");
}

function getTemporaryWoundPath(actor) {
  return actor?.type === "character"
    ? "system.derived.wounds.temp"
    : "system.miscStats.wounds.temp";
}

function noSelection(message) {
  return { success: false, applied: false, message };
}

async function promptPredictable(tamer) {
  const enemies = selectableEnemies(tamer);
  const partner = await resolvePartner(tamer);
  if (!partner || !enemies.length) return null;
  const intelligence = Math.max(0, integer(tamer.system?.attributes?.intelligence?.value, 0));
  const bestLaidPlans = hasUnlockedOfficialTamerTalent(tamer, "bestLaidPlans");

  return foundry.applications.api.DialogV2.wait({
    window: { title: "I ALREADY KNOW YOUR NEXT MOVE" },
    classes: ["dda", "dda-tamer-talent-dialog"],
    position: { width: 520, height: "auto" },
    modal: true,
    content: `
      <form class="dda-roll-dialog">
        <p>${text("Escolha o inimigo previsto e a resposta preparada do Partner.", "Choose the predicted Enemy and the Partner's held response.")}</p>
        <div class="form-group"><label>${text("Inimigo", "Enemy")}</label><select name="targetUuid">${buildSelectOptions(enemies)}</select></div>
        <div class="form-group"><label>${text("Pool beneficiada", "Benefited Pool")}</label><select name="responseAction"><option value="attack">${text("Precisão", "Accuracy")}</option><option value="dodge">${text("Esquiva", "Dodge")}</option></select></div>
        <div class="form-group"><label>${text("Resposta declarada", "Declared Response")}</label><textarea name="responseDetail" rows="3" placeholder="${text("Ex.: usar Pepper Breath assim que o inimigo agir", "E.g. use Pepper Breath as soon as the Enemy acts")}"></textarea></div>
        <p class="hint">+${intelligence} ${text("dados de Inteligência", "Intelligence dice")}${bestLaidPlans ? `; +1 ${text("Sucesso automático por Best Laid Plans", "Automatic Success from Best Laid Plans")}` : ""}.</p>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Preparar", "Prepare"),
        icon: "fa-solid fa-eye",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          const responseDetail = String(form?.elements?.responseDetail?.value ?? "").trim();
          if (!responseDetail) return null;
          return {
            targetUuid: String(form.elements.targetUuid?.value ?? ""),
            partnerUuid: partner.uuid,
            responseAction: String(form.elements.responseAction?.value ?? "attack"),
            responseDetail,
            intelligence,
            bestLaidPlans
          };
        }
      },
      { action: "cancel", label: text("Cancelar", "Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

async function promptHackersMemory(tamer) {
  const enemies = selectableEnemies(tamer);
  if (!enemies.length) return null;
  return foundry.applications.api.DialogV2.wait({
    window: { title: "I KNOW ALL YOUR TRICKS" },
    classes: ["dda", "dda-tamer-talent-dialog"],
    position: { width: 520, height: "auto" },
    modal: true,
    content: `
      <form class="dda-roll-dialog">
        <p>${text("Esta Ordem só pode mirar um inimigo específico que o grupo já enfrentou.", "This Order can only target a specific Enemy the party has fought before.")}</p>
        <div class="form-group"><label>${text("Inimigo", "Enemy")}</label><select name="targetUuid">${buildSelectOptions(enemies)}</select></div>
        <div class="form-group"><label>${text("Modo", "Mode")}</label><select name="mode"><option value="increaseAgainst">${text("+1 à Potência de Qualidades/Efeitos usados contra o inimigo", "+1 Potency to Qualities/Effects used against the Enemy")}</option><option value="decreaseSource">${text("-1 à Potência de Qualidades/Efeitos usados pelo inimigo", "-1 Potency to Qualities/Effects used by the Enemy")}</option></select></div>
        <label class="checkbox"><input type="checkbox" name="foughtBefore" /> ${text("Confirmo que o grupo já enfrentou este inimigo específico.", "I confirm the party has fought this specific Enemy before.")}</label>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Aplicar", "Apply"),
        icon: "fa-solid fa-memory",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          if (!form?.elements?.foughtBefore?.checked) return null;
          return {
            targetUuid: String(form.elements.targetUuid?.value ?? ""),
            mode: String(form.elements.mode?.value ?? "increaseAgainst"),
            foughtBefore: true
          };
        }
      },
      { action: "cancel", label: text("Cancelar", "Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

async function promptGloriousWorld(tamer) {
  const recipients = selectableMealRecipients();
  if (!recipients.length) return null;
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Glorious World" },
    classes: ["dda", "dda-tamer-talent-dialog"],
    position: { width: 560, height: 620 },
    modal: true,
    content: `
      <form class="dda-roll-dialog dda-glorious-world-dialog">
        <p>${text("Marque todos que comeram a refeição. Um personagem só pode receber este benefício uma vez entre Descansos.", "Select everyone who ate the meal. A character can only receive this benefit once between Rests.")}</p>
        <div class="dda-talent-recipient-list">
          ${recipients.map((actor) => {
            const state =
              actor?.system?.tamerTalentStates
                ?.gloriousWorld;

            const alreadyBenefited = Boolean(
              state?.benefitedSinceRest ??
              state
            );

            return `<label class="checkbox${alreadyBenefited ? " is-disabled" : ""}"><input type="checkbox" name="recipientUuid" value="${escapeHtml(actor.uuid)}" ${alreadyBenefited ? "disabled" : ""}/> <strong>${escapeHtml(actor.name)}</strong>${alreadyBenefited ? ` — ${text("já beneficiado", "already benefited")}` : ""}</label>`;
          }).join("")}
        </div>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Servir refeição", "Serve Meal"),
        icon: "fa-solid fa-utensils",
        default: true,
        callback: (_event, button) => {
          const selected = [...(button.form?.querySelectorAll?.("input[name='recipientUuid']:checked") ?? [])]
            .map((input) => String(input.value ?? "").trim())
            .filter(Boolean);
          return selected.length ? { recipientUuids: selected } : null;
        }
      },
      { action: "cancel", label: text("Cancelar", "Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

async function promptMiraclePreparation(tamer) {
  const actors = uniqueRuntimeActors()
    .filter((actor) => ["character", "digimon", "npc"].includes(actor?.type))
    .sort((left, right) => String(left.name).localeCompare(String(right.name), game?.i18n?.lang));
  if (!actors.length) return null;
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Miracle" },
    classes: ["dda", "dda-tamer-talent-dialog"],
    position: { width: 500, height: "auto" },
    modal: true,
    content: `
      <form class="dda-roll-dialog">
        <p>${text("Prepare Miracle para o próximo Teste ou Pool do Actor escolhido. O custo de 9 PI normais só será pago quando a rolagem ocorrer.", "Prepare Miracle for the chosen Actor's next Check or Pool. The 9 normal IP cost is only paid when the roll occurs.")}</p>
        <div class="form-group"><label>${text("Actor", "Actor")}</label><select name="targetUuid">${buildSelectOptions(actors)}</select></div>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Preparar Miracle", "Prepare Miracle"),
        icon: "fa-solid fa-star",
        default: true,
        callback: (_event, button) => ({ targetUuid: String(button.form?.elements?.targetUuid?.value ?? "") })
      },
      { action: "cancel", label: text("Cancelar", "Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

export async function executeTransversalTamerTalent(tamer, talent) {
  if (!tamer || !talent) return noSelection(text("Talento inválido.", "Invalid Talent."));

  switch (talent.id) {
    case "predictable": {
      if (!game?.combat?.started) return noSelection(text("Predictable exige um Combate ativo.", "Predictable requires an active Combat."));
      const selection = await promptPredictable(tamer);
      if (!selection) return noSelection(text("A Ordem foi cancelada.", "The Order was cancelled."));
      const result = await requestOfficialSpecialOrderExecution(tamer, talent.id, selection);
      return result?.ok
        ? { success: true, applied: true, targetName: result.targetName ?? "", message: result.message ?? "", details: result.details ?? "" }
        : noSelection(text("Não foi possível preparar Predictable.", "Predictable could not be prepared."));
    }

    case "hackersMemory": {
      if (!game?.combat?.started) return noSelection(text("Hacker’s Memory exige um Combate ativo.", "Hacker’s Memory requires an active Combat."));
      const selection = await promptHackersMemory(tamer);
      if (!selection) return noSelection(text("A Ordem foi cancelada ou o encontro anterior não foi confirmado.", "The Order was cancelled or the prior encounter was not confirmed."));
      const result = await requestOfficialSpecialOrderExecution(tamer, talent.id, selection);
      return result?.ok
        ? { success: true, applied: true, targetName: result.targetName ?? "", message: result.message ?? "", details: result.details ?? "" }
        : noSelection(text("Não foi possível aplicar Hacker’s Memory.", "Hacker’s Memory could not be applied."));
    }

    case "gloriousWorld": {
      const selection = await promptGloriousWorld(tamer);
      if (!selection) return noSelection(text("Nenhum participante recebeu a refeição.", "No participant received the meal."));
      const result = await requestOfficialSpecialOrderExecution(tamer, talent.id, selection);
      return result?.ok
        ? { success: true, applied: true, targetName: result.targetName ?? "", message: result.message ?? "", details: result.details ?? "" }
        : noSelection(text("A refeição não pôde ser aplicada.", "The meal could not be applied."));
    }

    case "miracle": {
      const selection = await promptMiraclePreparation(tamer);
      if (!selection?.targetUuid) return noSelection(text("Miracle não foi preparado.", "Miracle was not prepared."));
      await tamer.update({
        [MIRACLE_PATH]: {
          active: true,
          targetActorUuid: selection.targetUuid,
          preparedByUserId: game?.user?.id ?? "",
          preparedAt: new Date().toISOString()
        }
      });
      const target = await resolveActor(selection.targetUuid);
      return {
        success: true,
        applied: true,
        targetName: target?.name ?? "",
        message: text(`Miracle foi preparado para a próxima rolagem de ${target?.name ?? "Actor"}.`, `Miracle was prepared for ${target?.name ?? "Actor"}'s next roll.`),
        details: text("O custo de 9 PI normais será dividido e pago quando a rolagem ocorrer.", "The 9 normal IP cost will be divided and paid when the roll occurs.")
      };
    }

    case "livingEncyclopedia":
      return {
        success: true,
        applied: false,
        deferCommit: true,
        message: text(
          "Living Encyclopedia será oferecido automaticamente antes de um Teste de Conhecimento para recordar informação com NA 15 ou menor.",
          "Living Encyclopedia will be offered automatically before a Knowledge Check to recall information with TN 15 or lower."
        )
      };

    default:
      return noSelection(text("Automação transversal desconhecida.", "Unknown transversal automation."));
  }
}

function buildHoldEffect(tamer, selection) {
  return {
    id: foundry.utils.randomID(),
    source: "tamerTalent",
    sourceTalentId: "predictable",
    sourceActorUuid: tamer.uuid,
    sourceActorName: tamer.name,
    sourceCombatId: activeCombatId(),
    sourceRound: integer(game?.combat?.round, 0),
    sourceTurn: integer(game?.combat?.turn, -1),
    createdTurnSignature: turnSignature(),
    expiresOn: "sourceTurnStart",
    duration: 1,
    remaining: 1,
    category: "positive",
    tag: HOLD_TAG,
    label: selection.responseAction === "dodge" ? "Predictable — Dodge" : "Predictable — Attack",
    state: "armed",
    responseAction: selection.responseAction,
    poolStat: selection.responseAction === "dodge" ? "dodge" : "accuracy",
    value: integer(selection.intelligence, 0),
    potency: integer(selection.intelligence, 0),
    automaticSuccesses: selection.bestLaidPlans ? 1 : 0,
    trigger: text(`Quando ${selection.targetName} realizar qualquer Ação`, `Whenever ${selection.targetName} takes any Action`),
    responseDetail: selection.responseDetail,
    consumeOn: "matchingPool",
    actionCostPrepaid: 2,
    predictableTargetUuid: selection.targetUuid,
    predictableTargetName: selection.targetName
  };
}

async function mutatePredictable(tamer, selection = {}) {
  const target = await resolveActor(selection.targetUuid);
  const partner = await resolveActor(selection.partnerUuid);
  if (!target || !partner || !isDigimonLike(target) || !isDigimonLike(partner)) return { ok: false, reason: "invalidActors" };
  if (areAllies(tamer, target) || !areAllies(tamer, partner)) return { ok: false, reason: "invalidSides" };
  if (frenzyBlocksTamerInfluence(partner)) return frenzyBlockedMutation(partner);

  const effect = buildHoldEffect(tamer, { ...selection, targetName: target.name });
  const effects = foundry.utils.deepClone(partner.system?.effects?.active ?? []);
  effects.push(effect);
  await partner.update({ "system.effects.active": effects });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    flags: {
      [SYSTEM_ID]: {
        [TAMER_ACTION_FLAG]: {
          type: "hold",
          sourceTamerUuid: tamer.uuid,
          partnerUuid: partner.uuid,
          effectId: effect.id,
          responseAction: selection.responseAction,
          responseDetail: selection.responseDetail,
          trigger: effect.trigger,
          predictableTargetUuid: target.uuid,
          predictable: true,
          activated: false,
          cancelled: false
        }
      }
    },
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-tamer-action-card dda-hold-card dda-predictable-card">
        <h2>I ALREADY KNOW YOUR NEXT MOVE</h2>
        <ul class="dda-effect-list">
          <li>${text("Inimigo previsto", "Predicted Enemy")}: <strong>${escapeHtml(target.name)}</strong>.</li>
          <li>${text("Resposta", "Response")}: <strong>${escapeHtml(selection.responseDetail)}</strong>.</li>
          <li>${text("Gatilho", "Trigger")}: <strong>${escapeHtml(effect.trigger)}</strong>.</li>
          <li>${text("Bônus", "Bonus")}: <strong>+${effect.value}d6${effect.automaticSuccesses ? " + 1 Success" : ""}</strong>.</li>
        </ul>
        <p class="hint">${text("O gatilho é ativado automaticamente quando o inimigo gasta uma Ação. Use o botão manual para Ações gratuitas ou assistidas.", "The trigger activates automatically when the Enemy spends an Action. Use the manual button for Free or assisted Actions.")}</p>
        <div class="dda-tamer-action-chat-controls"><button type="button" data-dda-tamer-action="hold-activate">${text("Ativar gatilho", "Activate Trigger")}</button><button type="button" class="secondary" data-dda-tamer-action="hold-cancel">${text("Cancelar", "Cancel")}</button></div>
      </div>
    `
  });

  return {
    ok: true,
    targetName: target.name,
    message: text(`A próxima Ação de ${target.name} ativa a resposta preparada de ${partner.name}.`, `${target.name}'s next Action activates ${partner.name}'s held response.`),
    details: text("Ações gratuitas podem ser ativadas manualmente pelo card.", "Free Actions can be triggered manually from the card.")
  };
}

async function mutateHackersMemory(tamer, selection = {}) {
  const target = await resolveActor(selection.targetUuid);
  const mode = String(selection.mode ?? "");
  if (!target || !isDigimonLike(target) || areAllies(tamer, target) || !selection.foughtBefore) return { ok: false, reason: "invalidTarget" };
  if (frenzyBlocksTamerInfluence(target)) return frenzyBlockedMutation(target);
  if (!["increaseAgainst", "decreaseSource"].includes(mode)) return { ok: false, reason: "invalidMode" };

  const existing = foundry.utils.deepClone(target.system?.combat?.tamerTalentRuntime?.hackersMemory ?? []);
  const states = Array.isArray(existing) ? existing : [];
  const filtered = states.filter((entry) => String(entry.sourceTamerUuid ?? "") !== String(tamer.uuid));
  filtered.push({
    id: foundry.utils.randomID(),
    active: true,
    combatId: activeCombatId(),
    sourceTamerUuid: tamer.uuid,
    sourceTamerName: tamer.name,
    targetActorUuid: target.uuid,
    mode,
    modifier: mode === "increaseAgainst" ? 1 : -1,
    createdAt: new Date().toISOString()
  });
  await target.update({ [HACKERS_MEMORY_PATH]: filtered });

  return {
    ok: true,
    targetName: target.name,
    message: mode === "increaseAgainst"
      ? text(`Qualidades e Efeitos que usam Estatística Derivada contra ${target.name} recebem +1 Potência.`, `Qualities and Effects using a Derived Stat against ${target.name} gain +1 Potency.`)
      : text(`Qualidades e Efeitos de ${target.name} que usam Estatística Derivada sofrem -1 Potência.`, `${target.name}'s Qualities and Effects using a Derived Stat suffer -1 Potency.`),
    details: text("O modificador dura até o fim do Combate.", "The modifier lasts until the end of Combat.")
  };
}

async function mutateGloriousWorld(tamer, selection = {}) {
  const survival = Math.max(0, integer(tamer.system?.skills?.survival?.value, 0));
  const amount = Math.max(0, survival - 2);
  if (amount <= 0) return { ok: false, reason: "noBenefit" };

  const recipients = [];
  for (const uuid of [...new Set(selection.recipientUuids ?? [])]) {
    const actor = await resolveActor(uuid);
    if (!actor || !["character", "digimon", "npc"].includes(actor.type)) continue;
    if (isDigimonLike(actor) && frenzyBlocksTamerInfluence(actor)) continue;
    const existingBenefit =
      actor.system?.tamerTalentStates
        ?.gloriousWorld;

    if (
      existingBenefit?.benefitedSinceRest ??
      existingBenefit
    ) continue;
    recipients.push(actor);
  }
  if (!recipients.length) return { ok: false, reason: "noRecipients" };

  for (const actor of recipients) {
    const path = getTemporaryWoundPath(actor);
    const current = Math.max(0, number(foundry.utils.getProperty(actor, `${path}.value`), 0));
    const source = String(foundry.utils.getProperty(actor, `${path}.source`) ?? "").trim();
    await actor.update({
      [`${path}.value`]: current + amount,
      [`${path}.source`]: [source, "Glorious World"].filter(Boolean).join(" + "),
      [`${path}.duration`]: "rest",
      [GLORIOUS_WORLD_PATH]: {
        active: true,
        benefitedSinceRest: true,
        sourceTamerUuid: tamer.uuid,
        sourceTamerName: tamer.name,
        granted: amount,
        remaining: amount,
        grantedAt: new Date().toISOString()
      }
    });
  }

  return {
    ok: true,
    targetName: recipients.map((actor) => actor.name).join(", "),
    message: text(`${recipients.length} participante(s) receberam ${amount} Caixas de Ferimento Temporárias.`, `${recipients.length} participant(s) received ${amount} Temporary Wound Boxes.`),
    details: text("O benefício termina no próximo Descanso de cada recipiente.", "The benefit ends at each recipient's next Rest.")
  };
}

async function mutateMiracleSpend(tamer, selection = {}) {
  const prep = foundry.utils.deepClone(tamer.system?.combat?.tamerTalentRuntime?.miracle ?? {});
  if (!prep?.active) return { ok: false, reason: "notPrepared" };

  const contributions = Array.isArray(selection.contributions) ? selection.contributions : [];
  const normalized = contributions
    .map((entry) => ({ actorUuid: String(entry?.actorUuid ?? ""), amount: integer(entry?.amount, 0) }))
    .filter((entry) => entry.actorUuid && entry.amount > 0);
  const total = normalized.reduce((sum, entry) => sum + entry.amount, 0);
  if (total !== 9) return { ok: false, reason: "invalidTotal", total };

  const donors = [];
  for (const contribution of normalized) {
    const actor = await resolveActor(contribution.actorUuid);
    if (!actor || actor.type !== "character") return { ok: false, reason: "invalidDonor" };
    const normalIp = Math.max(0, integer(actor.system?.resources?.ip?.value, 0));
    if (normalIp < contribution.amount) return { ok: false, reason: "notEnoughNormalIp", donorName: actor.name };
    donors.push({ actor, amount: contribution.amount, normalIp });
  }

  for (const donor of donors) {
    await donor.actor.update({ "system.resources.ip.value": donor.normalIp - donor.amount });
  }
  await tamer.update({ "system.combat.tamerTalentRuntime.-=miracle": null });

  return {
    ok: true,
    targetName: selection.targetActorName ?? "",
    message: text("9 PI normais foram gastos para realizar Miracle.", "9 normal IP were spent to perform Miracle."),
    contributions: donors.map((entry) => ({ actorName: entry.actor.name, amount: entry.amount }))
  };
}

export async function executeTransversalTamerTalentMutation(tamer, talentId, selection = {}) {
  switch (talentId) {
    case "predictable": return mutatePredictable(tamer, selection);
    case "hackersMemory": return mutateHackersMemory(tamer, selection);
    case "gloriousWorld": return mutateGloriousWorld(tamer, selection);
    case "miracle": return mutateMiracleSpend(tamer, selection);
    default: return { ok: false, reason: "unknownTransversalTalent" };
  }
}

function hackerMemoryStates(actor) {
  const stored = actor?.system?.combat?.tamerTalentRuntime?.hackersMemory;
  return (Array.isArray(stored) ? stored : []).filter((entry) => entry?.active && String(entry.combatId ?? "") === activeCombatId());
}

export function applyHackersMemoryDerivedStatModifier(sourceActor, targetActor, value, { minimum = 0 } = {}) {
  let modifier = 0;
  if (sourceActor) {
    modifier += hackerMemoryStates(sourceActor)
      .filter((entry) => entry.mode === "decreaseSource")
      .reduce((sum, entry) => sum + number(entry.modifier, -1), 0);
  }
  if (targetActor) {
    modifier += hackerMemoryStates(targetActor)
      .filter((entry) => entry.mode === "increaseAgainst" && sourceActor && !areAllies(sourceActor, targetActor))
      .reduce((sum, entry) => sum + number(entry.modifier, 1), 0);
  }
  return Math.max(minimum, number(value, 0) + modifier);
}

export async function consumeGloriousWorldTemporaryWounds(actor, amount = 0) {
  const state = foundry.utils.deepClone(actor?.system?.tamerTalentStates?.gloriousWorld ?? {});
  if (!state?.active) return 0;
  const consumed = Math.min(integer(state.remaining, 0), integer(amount, 0));
  if (consumed <= 0) return 0;
  state.remaining = Math.max(0, integer(state.remaining, 0) - consumed);
  state.active = state.remaining > 0;
  state.updatedAt = new Date().toISOString();
  await actor.update({ [GLORIOUS_WORLD_PATH]: state });
  return consumed;
}

export async function clearGloriousWorldBenefit(actor) {
  const stored =
    actor?.system?.tamerTalentStates
      ?.gloriousWorld;

  if (!stored) {
    return { cleared: 0 };
  }

  const state =
    foundry.utils.deepClone(stored);

  const remaining = Math.max(
    0,
    integer(state.remaining, 0)
  );

  const path =
    getTemporaryWoundPath(actor);

  const current = Math.max(
    0,
    number(
      foundry.utils.getProperty(
        actor,
        `${path}.value`
      ),
      0
    )
  );

  const source = String(
    foundry.utils.getProperty(
      actor,
      `${path}.source`
    ) ?? ""
  )
    .split("+")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      return entry.toLowerCase() !==
        "glorious world";
    })
    .join(" + ");

  const updates = {
    [`${path}.value`]: Math.max(
      0,
      current - remaining
    ),

    [`${path}.source`]: source,

    "system.tamerTalentStates.-=gloriousWorld":
      null
  };

  if (!source) {
    updates[`${path}.duration`] = "";
  }

  await actor.update(updates);

  return {
    cleared: Math.min(
      current,
      remaining
    )
  };
}

export async function maybeUseLivingEncyclopedia(actor, { skillKey = "", tn = 0 } = {}) {
  if (String(skillKey) !== "knowledge" || number(tn, 0) <= 0 || number(tn, 0) > 15) return { used: false };
  if (!hasUnlockedOfficialTamerTalent(actor, "livingEncyclopedia")) return { used: false };
  const uses = getOfficialTamerTalentUseState(actor, "livingEncyclopedia", 1);
  if (!uses.enabled || uses.value <= 0) return { used: false };

  let confirmed = false;
  try {
    confirmed = Boolean(await foundry.applications.api.DialogV2.confirm({
      window: { title: "Living Encyclopedia" },
      content: `<div class="dda-roll-dialog"><p>${text(`Este Teste de Conhecimento tem NA ${tn}. Ele é para recordar informação?`, `This Knowledge Check has TN ${tn}. Is it being made to recall information?`)}</p><p>${text("Se sim, Living Encyclopedia transforma o resultado em Sucesso Crítico automático.", "If so, Living Encyclopedia turns the result into an automatic Critical Success.")}</p></div>`,
      yes: { label: text("Usar Living Encyclopedia", "Use Living Encyclopedia") },
      no: { label: text("Rolar normalmente", "Roll Normally") },
      rejectClose: false,
      modal: true
    }));
  } catch (_error) {
    confirmed = false;
  }
  if (!confirmed) return { used: false };
  const spent = await spendOfficialTamerTalentUse(actor, "livingEncyclopedia", 1);
  return spent ? { used: true, spent } : { used: false };
}

function preparedMiracleTamersForActor(actor) {
  return (game?.actors?.contents ?? [])
    .filter((candidate) => candidate?.type === "character")
    .filter((candidate) => hasUnlockedOfficialTamerTalent(candidate, "miracle"))
    .filter((candidate) => candidate.system?.combat?.tamerTalentRuntime?.miracle?.active)
    .filter((candidate) => {
      const targetUuid = candidate.system.combat.tamerTalentRuntime.miracle.targetActorUuid;
      return actorReferenceKeys(actor).has(String(targetUuid ?? ""));
    });
}

function normalIpDonors() {
  return (game?.actors?.contents ?? [])
    .filter((actor) => actor?.type === "character")
    .map((actor) => ({ actor, normalIp: Math.max(0, integer(getTamerIpPool(actor, { allowTemporary: false }).normal, 0)) }))
    .filter((entry) => entry.normalIp > 0)
    .sort((left, right) => String(left.actor.name).localeCompare(String(right.actor.name), game?.i18n?.lang));
}

function automaticContributions(donors, total = 9) {
  let remaining = total;
  return donors.map((entry) => {
    const amount = Math.min(entry.normalIp, remaining);
    remaining -= amount;
    return { actorUuid: entry.actor.uuid, amount };
  });
}

function parseDiceValues(value, expectedCount) {
  const values = String(value ?? "")
    .split(/[\s,;]+/)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry));
  if (values.length !== expectedCount || values.some((entry) => entry < 1 || entry > 6)) return null;
  return values;
}

export async function prepareMiracleRoll(actor, { kind = "check", diceCount = 0 } = {}) {
  const miracleTamers = preparedMiracleTamersForActor(actor);
  if (!miracleTamers.length) return { used: false, diceCount };
  const donors = normalIpDonors();
  if (donors.reduce((sum, entry) => sum + entry.normalIp, 0) < 9) return { used: false, diceCount };
  const defaultContributions = automaticContributions(donors, 9);

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Miracle" },
    classes: ["dda", "dda-tamer-talent-dialog", "dda-miracle-dialog"],
    position: { width: 620, height: 680 },
    modal: true,
    content: `
      <form class="dda-roll-dialog">
        <p>${text("Miracle está preparado. Escolha o bônus, divida exatamente 9 PI normais e defina todos os dados.", "Miracle is prepared. Choose the bonus, divide exactly 9 normal IP, and set every die.")}</p>
        <div class="form-group"><label>${text("Digi-Escolhido com Miracle", "Tamer with Miracle")}</label><select name="miracleTamerUuid">${buildSelectOptions(miracleTamers)}</select></div>
        <div class="form-group"><label>${text("Operação", "Operation")}</label><select name="operation"><option value="plus">+12</option><option value="minus">-12</option></select></div>
        <fieldset><legend>${text("Contribuições de PI normal", "Normal IP Contributions")}</legend>${donors.map((entry) => {
          const automatic = defaultContributions.find((item) => item.actorUuid === entry.actor.uuid)?.amount ?? 0;
          return `<div class="form-group"><label>${escapeHtml(entry.actor.name)} (${entry.normalIp} PI)</label><input type="number" min="0" max="${entry.normalIp}" name="ip-${escapeHtml(entry.actor.id)}" value="${automatic}" data-actor-uuid="${escapeHtml(entry.actor.uuid)}" /></div>`;
        }).join("")}</fieldset>
        <div class="form-group"><label>${text("Resultados dos dados", "Die Results")}</label><textarea name="diceValues" rows="5" placeholder="${text("Use números de 1 a 6 separados por espaços. Para Pool, a quantidade muda com ±12.", "Use values from 1 to 6 separated by spaces. For a Pool, the die count changes by ±12.")}"></textarea></div>
        <p class="hint">${kind === "pool" ? text(`Pool base: ${diceCount}d6. +12 adiciona 12 dados; -12 remove até 12 dados.`, `Base Pool: ${diceCount}d6. +12 adds 12 dice; -12 removes up to 12 dice.`) : text(`Teste: ${diceCount}d6. ±12 altera o total; a quantidade de dados não muda.`, `Check: ${diceCount}d6. ±12 changes the total; the die count does not change.`)}</p>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Realizar Miracle", "Perform Miracle"),
        icon: "fa-solid fa-star",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          const operation = String(form?.elements?.operation?.value ?? "plus");
          const effectiveDiceCount = kind === "pool"
            ? operation === "plus" ? diceCount + 12 : Math.max(0, diceCount - 12)
            : diceCount;
          const diceValues = parseDiceValues(form?.elements?.diceValues?.value, effectiveDiceCount);
          if (!diceValues && effectiveDiceCount > 0) return null;
          const contributionInputs = [...(form?.querySelectorAll?.("input[data-actor-uuid]") ?? [])];
          const contributions = contributionInputs
            .map((input) => ({ actorUuid: String(input.dataset.actorUuid ?? ""), amount: integer(input.value, 0) }))
            .filter((entry) => entry.amount > 0);
          if (contributions.reduce((sum, entry) => sum + entry.amount, 0) !== 9) return null;
          return {
            miracleTamerUuid: String(form.elements.miracleTamerUuid?.value ?? ""),
            operation,
            effectiveDiceCount,
            diceValues: diceValues ?? [],
            contributions
          };
        }
      },
      { action: "cancel", label: text("Rolar normalmente", "Roll Normally"), icon: "fa-solid fa-dice", callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });

  if (!result) return { used: false, diceCount };
  const miracleTamer = await resolveActor(result.miracleTamerUuid);
  if (!miracleTamer) return { used: false, diceCount };
  const mutation = await requestOfficialSpecialOrderExecution(miracleTamer, "miracle", {
    contributions: result.contributions,
    targetActorUuid: actor.uuid,
    targetActorName: actor.name
  });
  if (!mutation?.ok) return { used: false, diceCount };

  return {
    used: true,
    miracleTamer,
    operation: result.operation,
    checkBonus: kind === "check" ? (result.operation === "plus" ? 12 : -12) : 0,
    diceCount: result.effectiveDiceCount,
    diceValues: result.diceValues,
    contributions: mutation.contributions ?? []
  };
}

async function activatePredictableForEnemy(enemy) {
  if (!game?.user?.isGM) return;
  for (const partner of uniqueRuntimeActors()) {
    const effects = foundry.utils.deepClone(partner.system?.effects?.active ?? []);
    let changed = false;
    const activated = [];
    for (const effect of effects) {
      if (
        effect?.tag === HOLD_TAG &&
        effect?.sourceTalentId === "predictable" &&
        effect?.state === "armed" &&
        actorReferenceKeys(enemy).has(String(effect.predictableTargetUuid ?? ""))
      ) {
        effect.state = "active";
        effect.activatedAt = new Date().toISOString();
        changed = true;
        activated.push(effect);
      }
    }
    if (!changed) continue;
    await partner.update({ "system.effects.active": effects });

    for (const effect of activated) {
      const message = (game?.messages?.contents ?? []).find((entry) => {
        const flag = entry.getFlag?.(SYSTEM_ID, TAMER_ACTION_FLAG);
        return flag?.type === "hold" && String(flag.effectId ?? "") === String(effect.id);
      });
      if (message) {
        const flag = message.getFlag(SYSTEM_ID, TAMER_ACTION_FLAG) ?? {};
        await message.setFlag(SYSTEM_ID, TAMER_ACTION_FLAG, { ...flag, activated: true, cancelled: false });
      }
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: partner }),
        content: `<div class="dda-chat-card dda-effect-card effect-special"><h2>Predictable</h2><p><strong>${escapeHtml(enemy.name)}</strong> ${text("realizou uma Ação. A resposta preparada de", "took an Action. The held response from")} <strong>${escapeHtml(partner.name)}</strong> ${text("está ativa.", "is active.")}</p></div>`
      });
    }
  }
}

async function clearCombatRuntime(combat) {
  if (!game?.user?.isGM) return;
  const combatId = String(combat?.id ?? "");
  for (const actor of uniqueRuntimeActors()) {
    const states = hackerMemoryStates(actor);
    if (states.length || (actor.system?.combat?.tamerTalentRuntime?.hackersMemory ?? []).some?.((entry) => String(entry.combatId ?? "") === combatId)) {
      await actor.update({ "system.combat.tamerTalentRuntime.-=hackersMemory": null });
    }
  }
}

const knownActionValues = new Map();

let hooksRegistered = false;
export function registerTamerTalentTransversalHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  for (const actor of uniqueRuntimeActors()) {
    knownActionValues.set(
      actor.uuid ?? actor.id,
      number(
        actor.system?.combat?.actions?.value,
        0
      )
    );
  }

  Hooks.on("preUpdateActor", (actor, changed, options) => {
    const next = foundry.utils.getProperty(changed, "system.combat.actions.value");
    if (next === undefined) return;
    options.ddaPreviousActionValue = number(actor.system?.combat?.actions?.value, 0);
  });

  Hooks.on("updateActor", (actor, changed, options) => {
    const next = foundry.utils.getProperty(changed, "system.combat.actions.value");
    if (next === undefined) return;

    const actorKey =
      actor.uuid ?? actor.id;

    const previous = number(
      options?.ddaPreviousActionValue,
      knownActionValues.get(actorKey) ?? next
    );

    knownActionValues.set(
      actorKey,
      number(next, 0)
    );

    if (number(next, 0) < previous) {
      void activatePredictableForEnemy(actor).catch((error) => console.error("DDA | Predictable trigger failed.", error));
    }
  });

  Hooks.on("combatEnd", (combat) => void clearCombatRuntime(combat));
  Hooks.on("deleteCombat", (combat) => void clearCombatRuntime(combat));
}
