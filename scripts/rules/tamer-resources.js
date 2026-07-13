import { DDA_TAMER_TALENTS } from "../data/tamer-talents.js";
import { getScaledTalentRequirement } from "./campaign-rules.js";

const SYSTEM_ID = "digimon-digital-adventures";
export const DDA_SESSION_STATE_SETTING = "sessionState";

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function integer(value, fallback = 0) {
  return Math.max(0, Math.floor(number(value, fallback)));
}

function clone(value) {
  return foundry.utils.deepClone(value ?? {});
}

function nowIso() {
  return new Date().toISOString();
}

function getTamerRequirementValue(tamer, requirement = {}) {
  const type = String(requirement.type ?? "").trim();
  const key = String(requirement.key ?? "").trim();

  if (!key) return 0;

  if (type === "attribute") {
    return number(tamer?.system?.attributes?.[key]?.value, 0);
  }

  if (type === "skill") {
    return number(tamer?.system?.skills?.[key]?.value, 0);
  }

  return 0;
}

export function getOfficialTamerTalent(talentId = "") {
  const wanted = String(talentId ?? "").trim();
  if (!wanted) return null;

  return DDA_TAMER_TALENTS.find((talent) => talent.id === wanted) ?? null;
}

export function hasUnlockedOfficialTamerTalent(tamer, talentId = "") {
  if (!tamer || tamer.type !== "character") return false;

  const talent = getOfficialTamerTalent(talentId);
  if (!talent) return false;

  const requirement = talent.requirement ?? {};
  const requirementKey = String(requirement.key ?? "").trim();

  if (!requirementKey) return true;

  const current = getTamerRequirementValue(tamer, requirement);
  const required = getScaledTalentRequirement(requirement.value ?? 0);

  return current >= required;
}

export function getOfficialTamerTalentUseState(
  tamer,
  talentId = "",
  fallbackMaximum = 1
) {
  const talent =
    getOfficialTamerTalent(
      talentId
    );

  if (!talent) {
    return {
      enabled: false,
      value: 0,
      max: 0,
      recharge: ""
    };
  }

  const uses =
    talent.uses ?? {};

  if (!uses.enabled) {
    return {
      enabled: false,
      value: 0,
      max: 0,
      recharge:
        String(
          uses.recharge ?? ""
        )
    };
  }

  const maxFormula =
    uses.maxFormula ?? {};

  let maximum = Math.max(
    0,
    integer(
      uses.max,
      fallbackMaximum
    )
  );

  if (
    maxFormula.type ===
      "skillAbove" &&
    maxFormula.key
  ) {
    const skillValue = Math.max(
      0,
      number(
        tamer?.system
          ?.skills
          ?.[maxFormula.key]
          ?.value,
        0
      )
    );

    const threshold = Math.max(
      0,
      number(
        maxFormula.threshold,
        0
      )
    );

    const minimum = Math.max(
      0,
      integer(
        maxFormula.minimum,
        0
      )
    );

    maximum = Math.max(
      minimum,
      Math.floor(
        skillValue - threshold
      )
    );
  }

  const storedValue =
    tamer?.system
      ?.tamerTalentUses
      ?.[talentId]
      ?.value;

  const currentValue = Math.min(
    maximum,
    Math.max(
      0,
      integer(
        storedValue,
        maximum
      )
    )
  );

  return {
    enabled: true,
    value: currentValue,
    max: maximum,
    recharge:
      String(
        uses.recharge ?? ""
      )
  };
}

export async function spendOfficialTamerTalentUse(
  tamer,
  talentId = "",
  amount = 1
) {
  const useState =
    getOfficialTamerTalentUseState(
      tamer,
      talentId,
      1
    );

  const cost = Math.max(
    1,
    integer(
      amount,
      1
    )
  );

  if (
    !tamer ||
    !useState.enabled ||
    useState.value < cost
  ) {
    return null;
  }

  const nextValue = Math.max(
    0,
    useState.value - cost
  );

  await tamer.update({
    [`system.tamerTalentUses.${talentId}.value`]:
      nextValue,

    [`system.tamerTalentUses.${talentId}.max`]:
      useState.max,

    [`system.tamerTalentUses.${talentId}.recharge`]:
      useState.recharge
  });

  return {
    talentId,
    amount: cost,

    valueBefore:
      useState.value,

    valueAfter:
      nextValue,

    max:
      useState.max,

    recharge:
      useState.recharge
  };
}

export async function maybeApplyGritSurvival(
  tamer,
  {
    currentWounds = 0,
    nextWounds = 0,
    sourceLabel = ""
  } = {}
) {
  const current = Math.max(
    0,
    number(
      currentWounds,
      0
    )
  );

  const next = Math.max(
    0,
    number(
      nextWounds,
      0
    )
  );

  if (
    !tamer ||
    tamer.type !== "character" ||
    current <= 0 ||
    next > 0 ||
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "grit"
    )
  ) {
    return {
      used: false,
      wounds: next
    };
  }

  const useState =
    getOfficialTamerTalentUseState(
      tamer,
      "grit",
      1
    );

  if (
    !useState.enabled ||
    useState.value < 1
  ) {
    return {
      used: false,
      wounds: next,
      useState
    };
  }

  const safe = (
    value = ""
  ) => {
    return String(
      value ?? ""
    )
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  const sourceBlock =
    sourceLabel
      ? `
        <p>
          <strong>
            ${game.i18n.localize(
              "DDA.TamerTalent.Grit.Source"
            )}:
          </strong>

          ${safe(
            sourceLabel
          )}.
        </p>
      `
      : "";

  const confirmed =
    await Dialog.confirm({
      title:
        game.i18n.localize(
          "DDA.TamerTalent.Grit.Title"
        ),

      content: `
        <div class="dda-confirm-dialog dda-grit-survival-dialog">
          <p>
            ${game.i18n.format(
              "DDA.TamerTalent.Grit.SurvivalPrompt",
              {
                actor:
                  `<strong>${safe(
                    tamer.name
                  )}</strong>`
              }
            )}
          </p>

          ${sourceBlock}

          <p>
            ${game.i18n.format(
              "DDA.TamerTalent.Grit.SurvivalCostSummary",
              {
                uses:
                  useState.value,

                max:
                  useState.max
              }
            )}
          </p>
        </div>
      `,

      yes: () => true,
      no: () => false,
      defaultYes: false
    });

  if (!confirmed) {
    return {
      used: false,
      wounds: next,
      useState
    };
  }

  const payment =
    await spendOfficialTamerTalentUse(
      tamer,
      "grit",
      1
    );

  if (!payment) {
    ui.notifications.warn(
      game.i18n.localize(
        "DDA.TamerTalent.Grit.PaymentFailed"
      )
    );

    return {
      used: false,
      wounds: next,
      useState
    };
  }

  return {
    used: true,
    wounds: 1,
    currentWounds: current,
    attemptedWounds: next,
    payment
  };
}

export async function maybeApplyAvoidingConsequences(
  tamer,
  {
    total = 0,
    tn = 0,
    outcomeKey = "",
    naturalCriticalFailure = false,
    sourceLabel = ""
  } = {}
) {
  const originalOutcomeKey =
    String(
      outcomeKey ?? ""
    );

  const critical = [
    "criticalFailure",
    "severeCriticalFailure"
  ].includes(
    originalOutcomeKey
  );

  if (
    !critical ||
    naturalCriticalFailure ||
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "avoidingConsequences"
    )
  ) {
    return {
      used: false,

      outcomeKey:
        originalOutcomeKey,

      originalOutcomeKey
    };
  }

  const targetNumber =
    number(
      tn,
      0
    );

  const rolledTotal =
    number(
      total,
      0
    );

  const evade = Math.max(
    0,

    number(
      tamer?.system
        ?.skills
        ?.evade
        ?.value,
      0
    )
  );

  const adjustedTotal =
    rolledTotal +
    evade;

  /*
   * Falha Crítica ocorre quando o resultado fica
   * 5 ou mais abaixo do NA.
   *
   * O Talento só é oferecido quando somar Evasão
   * tiraria o resultado dessa faixa.
   */
  if (
    targetNumber <= 0 ||
    evade <= 0 ||
    adjustedTotal <=
      targetNumber - 5
  ) {
    return {
      used: false,

      outcomeKey:
        originalOutcomeKey,

      originalOutcomeKey,
      evade,
      adjustedTotal
    };
  }

  const safe = (
    value = ""
  ) => {
    return String(
      value ?? ""
    )
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  const sourceBlock =
    sourceLabel
      ? `
        <p>
          <strong>
            ${game.i18n.localize(
              "DDA.TamerTalent.AvoidingConsequences.Source"
            )}:
          </strong>

          ${safe(
            sourceLabel
          )}.
        </p>
      `
      : "";

  const confirmed =
    await Dialog.confirm({
      title:
        game.i18n.localize(
          "DDA.TamerTalent.AvoidingConsequences.Title"
        ),

      content: `
        <div class="dda-confirm-dialog dda-avoiding-consequences-dialog">
          <p>
            ${game.i18n.format(
              "DDA.TamerTalent.AvoidingConsequences.CriticalFailure",
              {
                actor:
                  `<strong>${safe(
                    tamer.name
                  )}</strong>`
              }
            )}
          </p>

          ${sourceBlock}

          <p>
            ${game.i18n.format(
              "DDA.TamerTalent.AvoidingConsequences.AdjustedTotal",
              {
                evade,

                total:
                  rolledTotal,

                adjusted:
                  adjustedTotal,

                tn:
                  targetNumber
              }
            )}
          </p>

          <p>
            ${game.i18n.localize(
              "DDA.TamerTalent.AvoidingConsequences.Prompt"
            )}
          </p>
        </div>
      `,

      yes: () => true,
      no: () => false,
      defaultYes: false
    });

  return {
    used:
      Boolean(
        confirmed
      ),

    outcomeKey:
      confirmed
        ? "failure"
        : originalOutcomeKey,

    originalOutcomeKey,
    evade,
    adjustedTotal
  };
}

function normalizeTemporaryIpEntry(entry = {}) {
  return {
    id: String(entry.id ?? foundry.utils.randomID()).trim(),
    sourceKey: String(entry.sourceKey ?? "manual").trim() || "manual",
    sourceName: String(entry.sourceName ?? "").trim(),
    grantedByUuid: String(entry.grantedByUuid ?? "").trim(),
    amount: integer(entry.amount, 0),
    expiresOn: String(entry.expiresOn ?? "rest").trim() || "rest",
    sessionId: String(entry.sessionId ?? "").trim(),
    grantedAt: String(entry.grantedAt ?? nowIso()).trim()
  };
}

function getStoredTemporaryIpEntries(tamer) {
  const stored = tamer?.system?.resources?.ip?.temporarySources;

  if (Array.isArray(stored) && stored.length > 0) {
    return stored
      .map(normalizeTemporaryIpEntry)
      .filter((entry) => entry.amount > 0);
  }

  const legacyTemporaryIp = integer(
    tamer?.system?.resources?.ip?.temp,
    0
  );

  if (legacyTemporaryIp <= 0) return [];

  return [
    normalizeTemporaryIpEntry({
      id: "legacy-temporary-ip",
      sourceKey: "legacy",
      sourceName: "Legacy Temporary IP",
      amount: legacyTemporaryIp,
      expiresOn: "rest"
    })
  ];
}

export function getTamerTemporaryIpEntries(tamer) {
  return clone(getStoredTemporaryIpEntries(tamer));
}

export function getTamerTemporaryIpTotal(tamer) {
  return getStoredTemporaryIpEntries(tamer).reduce(
    (total, entry) => total + integer(entry.amount, 0),
    0
  );
}

export function getTamerIpPool(tamer, { allowTemporary = true } = {}) {
  const normal = integer(tamer?.system?.resources?.ip?.value, 0);
  const temporary = allowTemporary
    ? getTamerTemporaryIpTotal(tamer)
    : 0;

  return {
    normal,
    temporary,
    total: normal + temporary,
    max: integer(tamer?.system?.resources?.ip?.max, normal)
  };
}

function buildTemporaryIpUpdate(entries = []) {
  const cleanEntries = entries
    .map(normalizeTemporaryIpEntry)
    .filter((entry) => entry.amount > 0);

  const total = cleanEntries.reduce(
    (sum, entry) => sum + entry.amount,
    0
  );

  return {
    "system.resources.ip.temp": total,
    "system.resources.ip.temporarySources": cleanEntries
  };
}

export async function grantTamerTemporaryIp(
  tamer,
  amount,
  options = {}
) {
  if (!tamer || tamer.type !== "character") {
    return {
      granted: 0,
      reason: "invalidTamer"
    };
  }

  const requested = integer(amount, 0);
  if (requested <= 0) {
    return {
      granted: 0,
      reason: "invalidAmount"
    };
  }

  const entries = getStoredTemporaryIpEntries(tamer);
  const pool = getTamerIpPool(tamer);
  const sourceKey = String(options.sourceKey ?? "manual").trim() || "manual";
  const sourceMaximum = Number(options.sourceMaximum ?? Number.POSITIVE_INFINITY);

  const currentFromSource = entries
    .filter((entry) => entry.sourceKey === sourceKey)
    .reduce((sum, entry) => sum + entry.amount, 0);

  const remainingForSource = Number.isFinite(sourceMaximum)
    ? Math.max(0, sourceMaximum - currentFromSource)
    : Number.POSITIVE_INFINITY;

  const maximumTotal = options.allowAboveNormalCap
    ? Number(options.maximumTotal ?? Number.POSITIVE_INFINITY)
    : Number(options.maximumTotal ?? pool.max);

  const remainingForTotal = Number.isFinite(maximumTotal)
    ? Math.max(0, maximumTotal - pool.total)
    : Number.POSITIVE_INFINITY;

  const granted = Math.max(
    0,
    Math.min(requested, remainingForSource, remainingForTotal)
  );

  if (granted <= 0) {
    return {
      granted: 0,
      requested,
      reason: "capReached",
      pool
    };
  }

  entries.push(
    normalizeTemporaryIpEntry({
      id: foundry.utils.randomID(),
      sourceKey,
      sourceName: options.sourceName ?? "",
      grantedByUuid: options.grantedByUuid ?? "",
      amount: granted,
      expiresOn: options.expiresOn ?? "rest",
      sessionId: options.sessionId ?? "",
      grantedAt: nowIso()
    })
  );

  await tamer.update(buildTemporaryIpUpdate(entries));

  return {
    granted,
    requested,
    reason: "granted",
    pool: getTamerIpPool(tamer)
  };
}

export async function clearTamerTemporaryIp(
  tamer,
  {
    expiresOn = "",
    sourceKey = "",
    sessionId = ""
  } = {}
) {
  if (!tamer || tamer.type !== "character") {
    return { cleared: 0, remaining: 0 };
  }

  const entries = getStoredTemporaryIpEntries(tamer);
  let cleared = 0;

  const remainingEntries = entries.filter((entry) => {
    const matchesExpiry = !expiresOn || entry.expiresOn === expiresOn;
    const matchesSource = !sourceKey || entry.sourceKey === sourceKey;
    const matchesSession = !sessionId || entry.sessionId === sessionId;
    const remove = matchesExpiry && matchesSource && matchesSession;

    if (remove) cleared += entry.amount;
    return !remove;
  });

  if (cleared > 0 || entries.length !== remainingEntries.length) {
    await tamer.update(buildTemporaryIpUpdate(remainingEntries));
  }

  return {
    cleared,
    remaining: remainingEntries.reduce(
      (sum, entry) => sum + entry.amount,
      0
    )
  };
}

function temporaryIpExpiryPriority(expiresOn = "") {
  const priorities = {
    session: 0,
    combat: 1,
    rest: 2,
    manual: 3
  };

  return priorities[String(expiresOn ?? "").trim()] ?? 4;
}

function spendFromTemporaryEntries(entries, amount) {
  let remainingCost = integer(amount, 0);
  let spent = 0;

  const indexedEntries = entries.map((entry, index) => ({ entry, index }));

  indexedEntries.sort((left, right) => {
    const expiryDifference = temporaryIpExpiryPriority(left.entry.expiresOn)
      - temporaryIpExpiryPriority(right.entry.expiresOn);

    if (expiryDifference !== 0) return expiryDifference;

    return String(left.entry.grantedAt).localeCompare(
      String(right.entry.grantedAt)
    );
  });

  for (const indexed of indexedEntries) {
    if (remainingCost <= 0) break;

    const available = integer(indexed.entry.amount, 0);
    const used = Math.min(available, remainingCost);

    indexed.entry.amount = available - used;
    remainingCost -= used;
    spent += used;
  }

  return {
    entries: indexedEntries
      .sort((left, right) => left.index - right.index)
      .map((indexed) => indexed.entry)
      .filter((entry) => entry.amount > 0),
    spent,
    remainingCost
  };
}

export async function spendTamerIp(
  tamer,
  amount,
  {
    allowTemporary = true,
    temporaryFirst = true
  } = {}
) {
  if (!tamer || tamer.type !== "character") {
    return {
      success: false,
      reason: "invalidTamer"
    };
  }

  const cost = integer(amount, 0);
  const pool = getTamerIpPool(tamer, { allowTemporary });

  if (cost <= 0) {
    return {
      success: true,
      cost: 0,
      spentNormal: 0,
      spentTemporary: 0,
      pool
    };
  }

  if (pool.total < cost) {
    return {
      success: false,
      reason: "notEnoughIp",
      cost,
      pool
    };
  }

  let normal = pool.normal;
  let entries = getStoredTemporaryIpEntries(tamer);
  let remainingCost = cost;
  let spentNormal = 0;
  let spentTemporary = 0;

  if (allowTemporary && temporaryFirst) {
    const temporaryResult = spendFromTemporaryEntries(entries, remainingCost);
    entries = temporaryResult.entries;
    spentTemporary += temporaryResult.spent;
    remainingCost = temporaryResult.remainingCost;
  }

  if (remainingCost > 0) {
    const usedNormal = Math.min(normal, remainingCost);
    normal -= usedNormal;
    spentNormal += usedNormal;
    remainingCost -= usedNormal;
  }

  if (allowTemporary && !temporaryFirst && remainingCost > 0) {
    const temporaryResult = spendFromTemporaryEntries(entries, remainingCost);
    entries = temporaryResult.entries;
    spentTemporary += temporaryResult.spent;
    remainingCost = temporaryResult.remainingCost;
  }

  if (remainingCost > 0) {
    return {
      success: false,
      reason: "notEnoughIp",
      cost,
      pool
    };
  }

  await tamer.update({
    "system.resources.ip.value": normal,
    ...buildTemporaryIpUpdate(entries)
  });

  return {
    success: true,
    cost,
    spentNormal,
    spentTemporary,
    pool: getTamerIpPool(tamer, { allowTemporary })
  };
}

export function getDdaSessionState() {
  const fallback = {
    version: 1,
    active: false,
    id: "",
    startedAt: "",
    startedBy: {
      id: "",
      name: ""
    },
    endedAt: "",
    endedBy: {
      id: "",
      name: ""
    }
  };

  try {
    const stored = game.settings.get(
      SYSTEM_ID,
      DDA_SESSION_STATE_SETTING
    );

    return {
      ...fallback,
      ...clone(stored ?? {})
    };
  } catch (_error) {
    return fallback;
  }
}

function getAllTamerActors() {
  return Array.from(game.actors ?? []).filter(
    (actor) => actor?.type === "character"
  );
}

async function clearSessionTemporaryIpFromAllTamers() {
  const results = [];

  for (const tamer of getAllTamerActors()) {
    const result = await clearTamerTemporaryIp(tamer, {
      expiresOn: "session"
    });

    if (result.cleared > 0) {
      results.push({
        tamer,
        cleared: result.cleared
      });
    }
  }

  return results;
}

export async function startDdaSession() {
  if (!game.user?.isGM) {
    throw new Error("Only the GM can start a DDA session.");
  }

  const cleared = await clearSessionTemporaryIpFromAllTamers();
  const session = {
    version: 1,
    active: true,
    id: foundry.utils.randomID(),
    startedAt: nowIso(),
    startedBy: {
      id: game.user.id,
      name: game.user.name
    },
    endedAt: "",
    endedBy: {
      id: "",
      name: ""
    }
  };

  await game.settings.set(
    SYSTEM_ID,
    DDA_SESSION_STATE_SETTING,
    session
  );

  const potentialGrants = [];

  for (const tamer of getAllTamerActors()) {
    if (!hasUnlockedOfficialTamerTalent(tamer, "potential")) continue;

    const result = await grantTamerTemporaryIp(tamer, 1, {
      sourceKey: `potential:${session.id}`,
      sourceName: "Potential",
      grantedByUuid: tamer.uuid,
      expiresOn: "session",
      sessionId: session.id,
      sourceMaximum: 1,
      allowAboveNormalCap: false
    });

    potentialGrants.push({
      tamer,
      granted: result.granted,
      reason: result.reason
    });
  }

  for (const tamer of getAllTamerActors()) {
    tamer.sheet?.render(false);
  }

  return {
    session,
    cleared,
    potentialGrants
  };
}

export async function endDdaSession() {
  if (!game.user?.isGM) {
    throw new Error("Only the GM can end a DDA session.");
  }

  const previous = getDdaSessionState();
  const cleared = await clearSessionTemporaryIpFromAllTamers();
  const session = {
    ...previous,
    active: false,
    endedAt: nowIso(),
    endedBy: {
      id: game.user.id,
      name: game.user.name
    }
  };

  await game.settings.set(
    SYSTEM_ID,
    DDA_SESSION_STATE_SETTING,
    session
  );

  for (const tamer of getAllTamerActors()) {
    tamer.sheet?.render(false);
  }

  return {
    session,
    cleared
  };
}
