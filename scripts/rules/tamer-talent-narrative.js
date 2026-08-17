import {
  getOfficialTamerTalentUseState,
  hasUnlockedOfficialTamerTalent,
  spendOfficialTamerTalentUse
} from "./tamer-resources.js";

const SYSTEM_ID = "digimon-digital-adventures";
const NARRATIVE_STATE_PATH = "system.tamerTalentStates.narrative";
const CYBER_SLEUTH_FLAG = "cyberSleuthRequest";
const NARRATIVE_EFFECT_FLAG = "narrativeTalentEffect";

let hooksRegistered = false;

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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  const references = [
    tamer?.system?.partner?.uuid,
    tamer?.system?.partner?.currentFormUuid
  ].filter(Boolean).map(String);

  for (const reference of references) {
    const direct = await resolveActor(reference);
    if (direct) return direct;
  }

  return uniqueRuntimeActors().find((actor) => {
    if (!actor || actor.type !== "digimon") return false;
    return references.some((reference) => actorReferenceKeys(actor).has(reference));
  }) ?? null;
}

function isNarrativeParticipant(actor) {
  if (!actor || actor.type === "character") return false;
  if (!["npc", "digimon", "group"].includes(actor.type)) return false;

  const hasPlayerOwner = (game?.users?.contents ?? []).some((user) => {
    return !user?.isGM && actor.testUserPermission?.(
      user,
      CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    );
  });

  return !hasPlayerOwner;
}

function selectedTargetUuids() {
  return new Set(
    [...(game?.user?.targets ?? [])]
      .map((token) => token?.actor?.uuid)
      .filter(Boolean)
      .map(String)
  );
}

function narrativeRecords(tamer, talentId) {
  const records = tamer?.system?.tamerTalentStates?.narrative?.[talentId];
  return Array.isArray(records) ? records : [];
}

function targetWasAffectedSinceRest(talentId, target) {
  if (!target) return false;

  return (game?.actors?.contents ?? [])
    .filter((actor) => actor?.type === "character")
    .some((tamer) => narrativeRecords(tamer, talentId).some((record) => {
      return record?.affectedSinceRest !== false &&
        actorReferenceKeys(target).has(String(record?.targetUuid ?? ""));
    }));
}

function selectableNarrativeParticipants(talentId) {
  return uniqueRuntimeActors()
    .filter(isNarrativeParticipant)
    .map((actor) => ({
      actor,
      blocked: targetWasAffectedSinceRest(talentId, actor)
    }))
    .sort((left, right) => String(left.actor.name).localeCompare(
      String(right.actor.name),
      game?.i18n?.lang
    ));
}

function getPrimaryActiveGM() {
  return Array.from(game?.users ?? [])
    .filter((user) => user?.active && user?.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(game?.user?.isGM && getPrimaryActiveGM()?.id === game.user.id);
}

function tamerAuthorizedUserIds(tamer) {
  return [...new Set((game?.users?.contents ?? [])
    .filter((user) => {
      return user?.isGM || tamer?.testUserPermission?.(
        user,
        CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
      );
    })
    .map((user) => user.id))];
}

function noSelection(message) {
  return {
    success: false,
    applied: false,
    message
  };
}

function checkSummary(checkContext = null) {
  if (!checkContext) return "";

  return `
    <div class="dda-tamer-talent-check-context">
      <strong>${text("Teste que abriu esta oportunidade", "Check that opened this opportunity")}:</strong>
      ${escapeHtml(checkContext.title || checkContext.skillLabel || checkContext.skillKey || "Check")}
      — ${escapeHtml(checkContext.outcomeLabel || checkContext.outcome || "Success")}
      ${Number.isFinite(Number(checkContext.total)) ? ` (${number(checkContext.total, 0)} / ${number(checkContext.tn, 0)})` : ""}.
    </div>
  `;
}

async function appendNarrativeRecords(tamer, talentId, records) {
  const current = foundry.utils.deepClone(narrativeRecords(tamer, talentId));
  current.push(...records);

  await tamer.update({
    [`${NARRATIVE_STATE_PATH}.${talentId}`]: current
  });

  return current;
}

function renderNarrativeEffectCard({
  title,
  tamer,
  talentId,
  records,
  description = ""
}) {
  const rows = records.map((record) => {
    const detail = talentId === "plantedIdea"
      ? `<p><strong>${text("Ideia", "Idea")}:</strong> ${escapeHtml(record.idea)}</p>`
      : `<p><strong>${text("Estado", "State")}:</strong> ${text(
          "amistoso com o Digi-Escolhido; diálogo e diplomacia ficam possíveis",
          "friendly toward the Tamer; dialogue and diplomacy become possible"
        )}.</p>`;

    return `
      <li data-dda-narrative-record-row="${escapeHtml(record.id)}">
        <p><strong>${escapeHtml(record.targetName)}</strong> — ${record.durationMinutes} ${text("minutos", "minutes")}.</p>
        ${detail}
        <button
          type="button"
          data-dda-narrative-end="${escapeHtml(record.id)}"
        >
          <i class="fa-solid fa-hourglass-end"></i>
          ${text("Encerrar efeito narrativo", "End narrative effect")}
        </button>
      </li>
    `;
  }).join("");

  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-narrative-talent-card">
      <h2>${escapeHtml(title)}</h2>
      <p><strong>${escapeHtml(tamer.name)}</strong></p>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      <ul class="dda-effect-list">${rows}</ul>
      <p class="hint">${text(
        "Encerrar a duração não remove a proteção de “uma vez entre Descansos”. Ela só é limpa quando o Digi-Escolhido que aplicou o Talento termina um Descanso.",
        "Ending the duration does not remove the once-between-Rests protection. It is only cleared when the Tamer who applied the Talent finishes a Rest."
      )}</p>
    </div>
  `;
}

async function createNarrativeEffectMessage(tamer, talentId, title, records, description = "") {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: renderNarrativeEffectCard({
      title,
      tamer,
      talentId,
      records,
      description
    }),
    flags: {
      [SYSTEM_ID]: {
        [NARRATIVE_EFFECT_FLAG]: {
          talentId,
          tamerUuid: tamer.uuid,
          recordIds: records.map((record) => record.id),
          authorizedUserIds: tamerAuthorizedUserIds(tamer),
          createdAt: Date.now()
        }
      }
    }
  });
}

async function promptPlantedIdea(tamer, { checkContext = null } = {}) {
  const participants = selectableNarrativeParticipants("plantedIdea");
  const eligible = participants.filter((entry) => !entry.blocked);
  if (!eligible.length) {
    return noSelection(text(
      "Nenhum participante não-jogador elegível está disponível. Alvos já afetados permanecem protegidos até o próximo Descanso do Digi-Escolhido que os afetou.",
      "No eligible non-player participant is available. Previously affected targets remain protected until the next Rest of the Tamer who affected them."
    ));
  }

  const selected = selectedTargetUuids();
  const manipulate = Math.max(0, integer(tamer.system?.skills?.manipulate?.value, 0));

  const selection = await foundry.applications.api.DialogV2.wait({
    window: { title: "Planted Idea" },
    classes: ["dda", "dda-tamer-talent-dialog", "dda-narrative-talent-dialog"],
    position: { width: 580, height: "auto" },
    modal: true,
    content: `
      <form class="dda-roll-dialog">
        ${checkSummary(checkContext)}
        <p>${text(
          "Registre uma ideia menor, razoável e relacionada ao Teste de Manipular bem-sucedido.",
          "Record a minor, reasonable idea related to the successful Manipulate Check."
        )}</p>
        <div class="form-group">
          <label>${text("Participante não-jogador", "Non-player participant")}</label>
          <select name="targetUuid">
            ${eligible.map(({ actor }) => `
              <option value="${escapeHtml(actor.uuid)}" ${selected.has(String(actor.uuid)) ? "selected" : ""}>
                ${escapeHtml(actor.name)}
              </option>
            `).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>${text("Ideia implantada", "Planted idea")}</label>
          <textarea name="idea" rows="4" placeholder="${text(
            "Ex.: deixe-nos passar sem alertar os outros guardas",
            "E.g. let us pass without warning the other guards"
          )}"></textarea>
        </div>
        <div class="form-group">
          <label>${text("Como o Teste foi realizado", "How the Check was made")}</label>
          <textarea name="checkContext" rows="2"></textarea>
        </div>
        <label class="checkbox">
          <input type="checkbox" name="confirmedRoleplay" ${checkContext ? "checked" : ""}/>
          ${text(
            "Confirmo que houve um Teste de Manipular bem-sucedido em uma situação de interpretação.",
            "I confirm there was a successful Manipulate Check in a roleplay situation."
          )}
        </label>
        <p class="hint">${text("Duração", "Duration")}: <strong>${manipulate} ${text("minutos", "minutes")}</strong>.</p>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Implantar ideia", "Plant Idea"),
        icon: "fa-solid fa-seedling",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          const idea = String(form?.elements?.idea?.value ?? "").trim();
          const context = String(form?.elements?.checkContext?.value ?? "").trim();
          const targetUuid = String(form?.elements?.targetUuid?.value ?? "").trim();
          const confirmedRoleplay = Boolean(form?.elements?.confirmedRoleplay?.checked);
          if (!idea || !targetUuid || !confirmedRoleplay) return null;
          return { idea, context, targetUuid };
        }
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

  if (!selection) return noSelection(text("Planted Idea foi cancelado.", "Planted Idea was cancelled."));

  const target = await resolveActor(selection.targetUuid);
  if (!target || !isNarrativeParticipant(target) || targetWasAffectedSinceRest("plantedIdea", target)) {
    return noSelection(text("O alvo não é mais elegível.", "The target is no longer eligible."));
  }

  const record = {
    id: foundry.utils.randomID(),
    targetUuid: target.uuid,
    targetName: target.name,
    idea: selection.idea,
    checkContext: selection.context,
    durationMinutes: manipulate,
    active: true,
    affectedSinceRest: true,
    appliedAt: new Date().toISOString()
  };

  await appendNarrativeRecords(tamer, "plantedIdea", [record]);
  await createNarrativeEffectMessage(
    tamer,
    "plantedIdea",
    "Planted Idea",
    [record],
    selection.context
  );

  return {
    success: true,
    applied: true,
    suppressDefaultChat: true,
    automationStatus: "assisted",
    targetName: target.name,
    message: text(
      `${target.name} seguirá a ideia por ${manipulate} minutos, conforme adjudicação do Narrador.`,
      `${target.name} will pursue the idea for ${manipulate} minutes, subject to GM adjudication.`
    ),
    details: text(
      "O alvo não pode ser afetado novamente por Planted Idea entre Descansos.",
      "The target cannot be affected by Planted Idea again between Rests."
    )
  };
}

async function promptCharmingInfluence(tamer, { checkContext = null } = {}) {
  const participants = selectableNarrativeParticipants("charmingInfluence");
  const eligible = participants.filter((entry) => !entry.blocked);
  if (!eligible.length) {
    return noSelection(text(
      "Nenhum participante não-jogador elegível está disponível.",
      "No eligible non-player participant is available."
    ));
  }

  const selected = selectedTargetUuids();
  const persuasion = Math.max(0, integer(tamer.system?.skills?.persuasion?.value, 0));

  const selection = await foundry.applications.api.DialogV2.wait({
    window: { title: "Charming Influence" },
    classes: ["dda", "dda-tamer-talent-dialog", "dda-narrative-talent-dialog"],
    position: { width: 600, height: 640 },
    modal: true,
    content: `
      <form class="dda-roll-dialog">
        ${checkSummary(checkContext)}
        <p>${text(
          "Marque os participantes não-jogadores que foram alvo do Teste de Persuasão bem-sucedido.",
          "Select the non-player participants targeted by the successful Persuasion Check."
        )}</p>
        <div class="dda-talent-recipient-list">
          ${eligible.map(({ actor }) => `
            <label class="checkbox">
              <input
                type="checkbox"
                name="targetUuid"
                value="${escapeHtml(actor.uuid)}"
                ${selected.has(String(actor.uuid)) ? "checked" : ""}
              />
              <strong>${escapeHtml(actor.name)}</strong>
            </label>
          `).join("")}
        </div>
        <div class="form-group">
          <label>${text("Observações do diálogo", "Dialogue notes")}</label>
          <textarea name="context" rows="3" placeholder="${text(
            "Ex.: o vilão concordou em ouvir o grupo sem hostilidade",
            "E.g. the villain agreed to hear the party without hostility"
          )}"></textarea>
        </div>
        <label class="checkbox">
          <input type="checkbox" name="confirmedRoleplay" ${checkContext ? "checked" : ""}/>
          ${text(
            "Confirmo que houve um Teste de Persuasão bem-sucedido em uma situação de interpretação.",
            "I confirm there was a successful Persuasion Check in a roleplay situation."
          )}
        </label>
        <p class="hint">${text("Duração", "Duration")}: <strong>${persuasion} ${text("minutos", "minutes")}</strong>.</p>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Aplicar influência", "Apply Influence"),
        icon: "fa-solid fa-comments",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          const targetUuids = [...(form?.querySelectorAll?.("input[name='targetUuid']:checked") ?? [])]
            .map((input) => String(input.value ?? "").trim())
            .filter(Boolean);
          const context = String(form?.elements?.context?.value ?? "").trim();
          const confirmedRoleplay = Boolean(form?.elements?.confirmedRoleplay?.checked);
          if (!targetUuids.length || !confirmedRoleplay) return null;
          return { targetUuids: [...new Set(targetUuids)], context };
        }
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

  if (!selection) {
    return noSelection(text("Charming Influence foi cancelado.", "Charming Influence was cancelled."));
  }

  const targets = [];
  for (const uuid of selection.targetUuids) {
    const target = await resolveActor(uuid);
    if (!target || !isNarrativeParticipant(target)) continue;
    if (targetWasAffectedSinceRest("charmingInfluence", target)) continue;
    targets.push(target);
  }

  if (!targets.length) {
    return noSelection(text("Os alvos selecionados não são mais elegíveis.", "The selected targets are no longer eligible."));
  }

  const records = targets.map((target) => ({
    id: foundry.utils.randomID(),
    targetUuid: target.uuid,
    targetName: target.name,
    context: selection.context,
    durationMinutes: persuasion,
    active: true,
    affectedSinceRest: true,
    appliedAt: new Date().toISOString()
  }));

  await appendNarrativeRecords(tamer, "charmingInfluence", records);
  await createNarrativeEffectMessage(
    tamer,
    "charmingInfluence",
    "Charming Influence",
    records,
    selection.context
  );

  return {
    success: true,
    applied: true,
    suppressDefaultChat: true,
    automationStatus: "assisted",
    targetName: targets.map((target) => target.name).join(", "),
    message: text(
      `${targets.length} participante(s) tornaram-se amigáveis com ${tamer.name} por ${persuasion} minutos.`,
      `${targets.length} participant(s) became friendly toward ${tamer.name} for ${persuasion} minutes.`
    ),
    details: text(
      "O Talento abre uma oportunidade de diálogo; ele não força segredos, lealdade ou obediência.",
      "The Talent opens an opportunity for dialogue; it does not force secrets, loyalty, or obedience."
    )
  };
}

async function useSilentMovement(tamer) {
  const partner = await resolvePartner(tamer);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-narrative-talent-card">
        <h2>Silent Movement</h2>
        <p><strong>${escapeHtml(tamer.name)}</strong>${partner ? ` ${text("e", "and")} <strong>${escapeHtml(partner.name)}</strong>` : ""} ${text(
          "não produzem som com os passos e não deixam pegadas.",
          "make no sound with their footsteps and leave no footprints."
        )}</p>
        <p class="hint">${text(
          "Outros indícios ainda podem denunciá-los, como objetos derrubados, fala, cheiro, luz ou interação com o ambiente.",
          "Other cues can still give them away, such as knocked-over objects, speech, scent, light, or interaction with the environment."
        )}</p>
      </div>
    `
  });

  return {
    success: true,
    applied: true,
    suppressDefaultChat: true,
    automationStatus: "assisted",
    targetName: partner?.name ?? "",
    message: text(
      "O lembrete narrativo de Silent Movement foi publicado.",
      "The Silent Movement narrative reminder was posted."
    )
  };
}

async function useTrailblazer(tamer) {
  const existing = foundry.utils.deepClone(
    tamer.system?.tamerTalentStates?.trailblazer ?? {}
  );

  const selection = await foundry.applications.api.DialogV2.wait({
    window: { title: "Trailblazer" },
    classes: ["dda", "dda-tamer-talent-dialog", "dda-narrative-talent-dialog"],
    position: { width: 540, height: "auto" },
    modal: true,
    content: `
      <form class="dda-roll-dialog">
        <p>${text(
          "O Digi-Escolhido sempre sabe onde fica o norte e a rota exata de volta ao último assentamento ou área civilizada visitada.",
          "The Tamer always knows which way is north and the exact route back to the last settlement or civilized area visited."
        )}</p>
        <div class="form-group">
          <label>${text("Último assentamento", "Last settlement")}</label>
          <input type="text" name="settlement" value="${escapeHtml(existing.lastSettlement ?? "")}" />
        </div>
        <div class="form-group">
          <label>${text("Notas da rota", "Route notes")}</label>
          <textarea name="routeNotes" rows="4">${escapeHtml(existing.routeNotes ?? "")}</textarea>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Registrar e lembrar rota", "Record and Recall Route"),
        icon: "fa-solid fa-compass",
        default: true,
        callback: (_event, button) => {
          const settlement = String(button.form?.elements?.settlement?.value ?? "").trim();
          const routeNotes = String(button.form?.elements?.routeNotes?.value ?? "").trim();
          if (!settlement) return null;
          return { settlement, routeNotes };
        }
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

  if (!selection) return noSelection(text("Trailblazer foi cancelado.", "Trailblazer was cancelled."));

  await tamer.update({
    "system.tamerTalentStates.trailblazer": {
      lastSettlement: selection.settlement,
      routeNotes: selection.routeNotes,
      updatedAt: new Date().toISOString()
    }
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-narrative-talent-card">
        <h2>Trailblazer</h2>
        <p><strong>${escapeHtml(tamer.name)}</strong> ${text(
          "sabe a rota exata de volta para",
          "knows the exact route back to"
        )} <strong>${escapeHtml(selection.settlement)}</strong>.</p>
        ${selection.routeNotes ? `<p>${escapeHtml(selection.routeNotes)}</p>` : ""}
        <p class="hint">${text("Norte também é sempre conhecido, sem necessidade de Teste.", "North is also always known without a Check.")}</p>
      </div>
    `
  });

  return {
    success: true,
    applied: true,
    suppressDefaultChat: true,
    automationStatus: "assisted",
    targetName: selection.settlement,
    message: text(
      `A rota de volta para ${selection.settlement} foi registrada.`,
      `The route back to ${selection.settlement} was recorded.`
    )
  };
}

async function useCyberSleuth(tamer) {
  const activeGms = (game?.users?.contents ?? []).filter((user) => user?.active && user?.isGM);
  if (!activeGms.length) {
    return noSelection(text(
      "Cyber Sleuth exige um Narrador ativo para responder.",
      "Cyber Sleuth requires an active GM to answer."
    ));
  }

  const selection = await foundry.applications.api.DialogV2.wait({
    window: { title: "Cyber Sleuth" },
    classes: ["dda", "dda-tamer-talent-dialog", "dda-narrative-talent-dialog"],
    position: { width: 560, height: "auto" },
    modal: true,
    content: `
      <form class="dda-roll-dialog">
        <p>${text(
          "Pergunte sobre uma ação que pode ser tomada imediatamente. O Narrador responderá se ela terá resultados bons, ruins ou ambos.",
          "Ask about an action that can be taken immediately. The GM will answer whether it will have good results, bad results, or both."
        )}</p>
        <div class="form-group">
          <label>${text("Ação imediata considerada", "Immediate action being considered")}</label>
          <textarea name="question" rows="5" placeholder="${text(
            "Ex.: abrir esta porta agora terá bons resultados?",
            "E.g. will opening this door now have good results?"
          )}"></textarea>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: text("Perguntar ao Narrador", "Ask the GM"),
        icon: "fa-solid fa-magnifying-glass",
        default: true,
        callback: (_event, button) => {
          const question = String(button.form?.elements?.question?.value ?? "").trim();
          return question ? { question } : null;
        }
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

  if (!selection) return noSelection(text("Cyber Sleuth foi cancelado.", "Cyber Sleuth was cancelled."));

  const requestId = foundry.utils.randomID();
  const ownerIds = tamerAuthorizedUserIds(tamer);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    whisper: activeGms.map((user) => user.id),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-cyber-sleuth-card">
        <h2>Cyber Sleuth</h2>
        <p><strong>${escapeHtml(tamer.name)}</strong> ${text("pergunta", "asks")}:</p>
        <blockquote>${escapeHtml(selection.question)}</blockquote>
        <p>${text("A ação terá…", "The action will have…")}</p>
        <div class="dda-tamer-action-chat-controls">
          <button type="button" data-dda-cyber-sleuth-answer="good">
            <i class="fa-solid fa-thumbs-up"></i>
            ${text("Bons resultados", "Good results")}
          </button>
          <button type="button" data-dda-cyber-sleuth-answer="bad">
            <i class="fa-solid fa-thumbs-down"></i>
            ${text("Maus resultados", "Bad results")}
          </button>
          <button type="button" data-dda-cyber-sleuth-answer="both">
            <i class="fa-solid fa-scale-balanced"></i>
            ${text("Ambos", "Both")}
          </button>
        </div>
      </div>
    `,
    flags: {
      [SYSTEM_ID]: {
        [CYBER_SLEUTH_FLAG]: {
          requestId,
          status: "pending",
          tamerUuid: tamer.uuid,
          tamerName: tamer.name,
          question: selection.question,
          ownerIds,
          createdAt: Date.now()
        }
      }
    }
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    whisper: ownerIds,
    content: `
      <div class="dda-chat-card dda-effect-card effect-special">
        <h2>Cyber Sleuth</h2>
        <p>${text("A pergunta foi enviada ao Narrador.", "The question was sent to the GM.")}</p>
        <blockquote>${escapeHtml(selection.question)}</blockquote>
      </div>
    `
  });

  return {
    success: true,
    applied: true,
    suppressDefaultChat: true,
    automationStatus: "assisted",
    message: text("A pergunta foi enviada ao Narrador.", "The question was sent to the GM."),
    details: text("O uso foi consumido quando a pergunta foi enviada.", "The use was consumed when the question was sent.")
  };
}

export async function executeNarrativeTamerTalent(tamer, talent, options = {}) {
  if (!tamer || !talent) return noSelection(text("Talento inválido.", "Invalid Talent."));

  switch (String(talent.id ?? "")) {
    case "silentMovement":
      return useSilentMovement(tamer);
    case "plantedIdea":
      return promptPlantedIdea(tamer, options);
    case "charmingInfluence":
      return promptCharmingInfluence(tamer, options);
    case "cyberSleuth":
      return useCyberSleuth(tamer);
    case "trailblazer":
      return useTrailblazer(tamer);
    default:
      return noSelection(text("Talento narrativo desconhecido.", "Unknown narrative Talent."));
  }
}

export async function maybeOfferNarrativeTalentAfterCheck(tamer, {
  skillKey = "",
  skillLabel = "",
  title = "",
  total = null,
  tn = null,
  outcome = "",
  outcomeLabel = ""
} = {}) {
  if (!tamer || tamer.type !== "character") return null;
  if (!game.user?.isGM && !tamer.isOwner) return null;
  if (!["success", "criticalSuccess"].includes(String(outcome))) return null;

  const talentId = skillKey === "manipulate"
    ? "plantedIdea"
    : skillKey === "persuasion"
      ? "charmingInfluence"
      : "";

  if (!talentId || !hasUnlockedOfficialTamerTalent(tamer, talentId)) return null;

  const useState = getOfficialTamerTalentUseState(tamer, talentId, 1);
  if (!useState.enabled || useState.value < 1) return null;

  const talent = {
    id: talentId
  };

  const result = await executeNarrativeTamerTalent(tamer, talent, {
    checkContext: {
      skillKey,
      skillLabel,
      title,
      total,
      tn,
      outcome,
      outcomeLabel
    }
  });

  if (!result?.success) return result;

  const spent = await spendOfficialTamerTalentUse(tamer, talentId, 1);
  if (!spent) {
    return noSelection(text(
      "O efeito foi preparado, mas o uso do Talento não pôde ser consumido.",
      "The effect was prepared, but the Talent use could not be spent."
    ));
  }

  tamer.sheet?.render(false);
  return { ...result, spent };
}

export async function clearNarrativeTalentRestStates(tamer) {
  if (!tamer || tamer.type !== "character") return { cleared: 0 };

  const state = foundry.utils.deepClone(
    tamer.system?.tamerTalentStates?.narrative ?? {}
  );

  const cleared = [
    ...(Array.isArray(state.plantedIdea) ? state.plantedIdea : []),
    ...(Array.isArray(state.charmingInfluence) ? state.charmingInfluence : [])
  ].length;

  if (!cleared) return { cleared: 0 };

  await tamer.update({
    "system.tamerTalentStates.narrative": {
      plantedIdea: [],
      charmingInfluence: []
    }
  });

  return { cleared };
}

async function endNarrativeEffect(message, recordId) {
  const flag = message?.getFlag?.(SYSTEM_ID, NARRATIVE_EFFECT_FLAG);
  if (!flag || !recordId) return false;

  const tamer = await resolveActor(flag.tamerUuid);
  if (!tamer || tamer.type !== "character") return false;

  const allowed = Boolean(
    game.user?.isGM ||
    tamer.testUserPermission?.(
      game.user,
      CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    )
  );

  if (!allowed) return false;

  const talentId = String(flag.talentId ?? "");
  const records = foundry.utils.deepClone(narrativeRecords(tamer, talentId));
  const record = records.find((entry) => String(entry.id ?? "") === String(recordId));
  if (!record || !record.active) return false;

  record.active = false;
  record.endedAt = new Date().toISOString();
  record.endedByUserId = game.user?.id ?? "";

  await tamer.update({
    [`${NARRATIVE_STATE_PATH}.${talentId}`]: records
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special">
        <h2>${talentId === "plantedIdea" ? "Planted Idea" : "Charming Influence"}</h2>
        <p>${text("O efeito narrativo sobre", "The narrative effect on")} <strong>${escapeHtml(record.targetName)}</strong> ${text("terminou.", "ended.")}</p>
        <p class="hint">${text(
          "O alvo continua protegido contra nova aplicação até o próximo Descanso do Digi-Escolhido que usou o Talento.",
          "The target remains protected from another application until the next Rest of the Tamer who used the Talent."
        )}</p>
      </div>
    `
  });

  return true;
}

function bindNarrativeEffectCard(message, root) {
  const flag = message?.getFlag?.(SYSTEM_ID, NARRATIVE_EFFECT_FLAG);
  if (!flag || !root?.querySelectorAll) return;

  const allowed = Boolean(
    game.user?.isGM || flag.authorizedUserIds?.includes?.(game.user?.id)
  );

  for (const button of root.querySelectorAll("[data-dda-narrative-end]")) {
    if (button.dataset.bound === "true") continue;
    button.hidden = !allowed;
    button.disabled = !allowed;
    if (!allowed) continue;

    button.dataset.bound = "true";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const recordId = String(button.dataset.ddaNarrativeEnd ?? "");
      button.disabled = true;
      const ended = await endNarrativeEffect(message, recordId);
      if (ended) {
        const row = button.closest("[data-dda-narrative-record-row]");
        row?.classList?.add("is-ended");
        button.textContent = text("Efeito encerrado", "Effect ended");
      } else {
        button.disabled = false;
      }
    });
  }
}

function cyberSleuthAnswerLabel(answer) {
  return answer === "good"
    ? text("bons resultados", "good results")
    : answer === "bad"
      ? text("maus resultados", "bad results")
      : text("bons e maus resultados", "both good and bad results");
}

async function answerCyberSleuth(message, answer) {
  if (!isPrimaryActiveGM()) return false;

  const request = message?.getFlag?.(SYSTEM_ID, CYBER_SLEUTH_FLAG);
  if (!request || request.status !== "pending") return false;
  if (!["good", "bad", "both"].includes(answer)) return false;

  const latest = game.messages?.get(message.id)?.getFlag?.(SYSTEM_ID, CYBER_SLEUTH_FLAG);
  if (!latest || latest.status !== "pending") return false;

  const answered = {
    ...latest,
    status: "answered",
    answer,
    answeredByUserId: game.user?.id ?? "",
    answeredAt: Date.now()
  };

  await message.update({
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-cyber-sleuth-card">
        <h2>Cyber Sleuth</h2>
        <p><strong>${escapeHtml(latest.tamerName)}</strong> ${text("perguntou", "asked")}:</p>
        <blockquote>${escapeHtml(latest.question)}</blockquote>
        <p><strong>${text("Resposta", "Answer")}:</strong> ${escapeHtml(cyberSleuthAnswerLabel(answer))}.</p>
      </div>
    `,
    [`flags.${SYSTEM_ID}.${CYBER_SLEUTH_FLAG}`]: answered
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    whisper: latest.ownerIds ?? [],
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-cyber-sleuth-response-card">
        <h2>Cyber Sleuth</h2>
        <blockquote>${escapeHtml(latest.question)}</blockquote>
        <p>${text("Esta ação terá", "This action will have")} <strong>${escapeHtml(cyberSleuthAnswerLabel(answer))}</strong>.</p>
      </div>
    `
  });

  return true;
}

function bindCyberSleuthCard(message, root) {
  const request = message?.getFlag?.(SYSTEM_ID, CYBER_SLEUTH_FLAG);
  if (!request || !root?.querySelectorAll) return;

  const allowed = isPrimaryActiveGM() && request.status === "pending";

  for (const button of root.querySelectorAll("[data-dda-cyber-sleuth-answer]")) {
    if (button.dataset.bound === "true") continue;
    button.hidden = !allowed;
    button.disabled = !allowed;
    if (!allowed) continue;

    button.dataset.bound = "true";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const answer = String(button.dataset.ddaCyberSleuthAnswer ?? "");
      root.querySelectorAll("[data-dda-cyber-sleuth-answer]").forEach((entry) => {
        entry.disabled = true;
      });
      const resolved = await answerCyberSleuth(message, answer);
      if (!resolved) {
        root.querySelectorAll("[data-dda-cyber-sleuth-answer]").forEach((entry) => {
          entry.disabled = false;
        });
      }
    });
  }
}

export function registerTamerTalentNarrativeHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  Hooks.on("renderChatMessageHTML", (message, html) => {
    bindNarrativeEffectCard(message, html);
    bindCyberSleuthCard(message, html);
  });

  const exposeRuntimeApi = () => {
    game.dda ??= {};
    game.dda.tamerTalents ??= {};
    game.dda.tamerTalents.endNarrativeEffect = endNarrativeEffect;
    game.dda.tamerTalents.answerCyberSleuth = answerCyberSleuth;
  };

  if (game.ready) exposeRuntimeApi();
  else Hooks.once("ready", exposeRuntimeApi);
}
