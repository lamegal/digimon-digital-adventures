import {
  clearBusyHandsItemsCraftedBy,
  clearTamerTemporaryIp,
  getEndlessDreamTemporaryIpCapacity,
  getOfficialTamerTalentUseState,
  grantBusyHandsSkillItem,
  grantTamerTemporaryIp,
  hasUnlockedOfficialTamerTalent
} from "./tamer-resources.js";

const SYSTEM_ID =
  "digimon-digital-adventures";

const SOCKET_CHANNEL =
  `system.${SYSTEM_ID}`;

const REQUEST_TIMEOUT_MS =
  10000;

const pendingRequests =
  new Map();

let socketRegistered =
  false;

  function integer(
  value,
  fallback = 0
) {
  const numeric =
    Number(value);

  return Number.isFinite(
    numeric
  )
    ? Math.max(
        0,
        Math.floor(numeric)
      )
    : fallback;
}

function getPrimaryActiveGm() {
  return Array.from(
    game.users ?? []
  )
    .filter((user) => {
      return (
        user?.active &&
        user?.isGM
      );
    })
    .sort((left, right) => {
      return String(
        left.id
      ).localeCompare(
        String(
          right.id
        )
      );
    })[0] ?? null;
}

function canUserControlActor(
  user,
  actor
) {
  if (!user || !actor) {
    return false;
  }

  if (user.isGM) {
    return true;
  }

  return Boolean(
    actor.testUserPermission?.(
      user,
      CONST
        .DOCUMENT_OWNERSHIP_LEVELS
        .OWNER
    )
  );
}

async function resolveActor(
  uuid = ""
) {
  const cleanUuid =
    String(
      uuid ?? ""
    ).trim();

  if (!cleanUuid) {
    return null;
  }

  try {
    const document =
      await fromUuid(
        cleanUuid
      );

    if (document?.documentName === "Token") {
      return document.actor ?? null;
    }

    return document?.documentName === "Actor"
      ? document
      : null;
  } catch (error) {
    console.warn(
      "DDA | Could not resolve Actor for Tamer Talent socket request.",
      error
    );

    return null;
  }
}

function emitResponse(
  request,
  result
) {
  game.socket.emit(
    SOCKET_CHANNEL,
    {
      scope:
        "tamerTalent",

      type:
        "tamerTalentResponse",

      requestId:
        request.requestId,

      targetUserId:
        request.requestingUserId,

      result
    }
  );
}

async function handleBusyHandsGrantRequest(
  request
) {
  const requestingUser =
    game.users?.get(
      request.requestingUserId
    );

  const crafter =
    await resolveActor(
      request.crafterUuid
    );

  const recipient =
    await resolveActor(
      request.recipientUuid
    );

  if (
    !requestingUser ||
    !crafter ||
    !recipient ||
    crafter.type !== "character" ||
    recipient.type !== "character" ||
    !canUserControlActor(
      requestingUser,
      crafter
    ) ||
    !hasUnlockedOfficialTamerTalent(
      crafter,
      "busyHands"
    )
  ) {
    return {
      ok: false,
      reason: "invalidRequest"
    };
  }

  const useState =
    getOfficialTamerTalentUseState(
      crafter,
      "busyHands",
      1
    );

  if (
    !useState.enabled ||
    useState.value < 1
  ) {
    return {
      ok: false,
      reason: "noUses"
    };
  }

  const precision = Math.max(
    0,
    Number(
      crafter.system
        ?.skills
        ?.precision
        ?.value ??
      0
    )
  );

  const bonus = Math.max(
    0,
    Math.floor(
      precision - 2
    )
  );

  return grantBusyHandsSkillItem(
    crafter,
    recipient,
    {
      skillKey:
        request.skillKey,

      itemName:
        request.itemName,

      bonus
    }
  );
}

async function handleBusyHandsClearRequest(
  request
) {
  const requestingUser =
    game.users?.get(
      request.requestingUserId
    );

  const crafter =
    await resolveActor(
      request.crafterUuid
    );

  if (
    !requestingUser ||
    !crafter ||
    crafter.type !== "character" ||
    !canUserControlActor(
      requestingUser,
      crafter
    )
  ) {
    return {
      ok: false,
      reason: "invalidRequest",
      cleared: 0,
      recipients: []
    };
  }

  return {
    ok: true,

    ...await clearBusyHandsItemsCraftedBy(
      crafter
    )
  };
}

function normalizeEndlessDreamAllocations(
  allocations = []
) {
  const combined =
    new Map();

  for (
    const allocation of
    Array.isArray(allocations)
      ? allocations
      : []
  ) {
    const recipientUuid =
      String(
        allocation?.recipientUuid ?? ""
      ).trim();

    const amount =
      integer(
        allocation?.amount,
        0
      );

    if (
      !recipientUuid ||
      amount <= 0
    ) {
      continue;
    }

    combined.set(
      recipientUuid,
      (
        combined.get(
          recipientUuid
        ) ?? 0
      ) + amount
    );
  }

  return Array.from(
    combined.entries()
  ).map(
    ([
      recipientUuid,
      amount
    ]) => {
      return {
        recipientUuid,
        amount
      };
    }
  );
}

async function applyEndlessDreamDistribution(
  crafter,
  rawAllocations = []
) {
  if (
    !crafter ||
    crafter.type !== "character" ||
    !hasUnlockedOfficialTamerTalent(
      crafter,
      "endlessDream"
    )
  ) {
    return {
      ok: false,
      reason: "invalidCrafter"
    };
  }

  const useState =
    getOfficialTamerTalentUseState(
      crafter,
      "endlessDream",
      1
    );

  if (
    !useState.enabled ||
    useState.value < 1
  ) {
    return {
      ok: false,
      reason: "noUses"
    };
  }

  const performance =
    integer(
      crafter.system
        ?.skills
        ?.performance
        ?.value,
      0
    );

  const availablePoints =
    Math.max(
      0,
      performance - 2
    );

  if (
    availablePoints <= 0
  ) {
    return {
      ok: false,
      reason: "noPoints"
    };
  }

  const allocations =
    normalizeEndlessDreamAllocations(
      rawAllocations
    );

  const allocatedTotal =
    allocations.reduce(
      (total, allocation) => {
        return (
          total +
          allocation.amount
        );
      },
      0
    );

  if (
    allocatedTotal !==
    availablePoints
  ) {
    return {
      ok: false,
      reason: "invalidTotal",
      expected:
        availablePoints,
      received:
        allocatedTotal
    };
  }

  const recipients =
    [];

  for (
    const allocation of
    allocations
  ) {
    const recipient =
      await resolveActor(
        allocation.recipientUuid
      );

    if (
      !recipient ||
      recipient.type !==
        "character" ||
      recipient.uuid ===
        crafter.uuid
    ) {
      return {
        ok: false,
        reason: "invalidRecipient"
      };
    }

    const capacity =
      getEndlessDreamTemporaryIpCapacity(
        recipient
      );

    if (
      allocation.amount >
      capacity.capacity
    ) {
      return {
        ok: false,
        reason: "capacityChanged",
        recipientName:
          recipient.name,
        available:
          capacity.capacity,
        requested:
          allocation.amount
      };
    }

    recipients.push({
      actor:
        recipient,

      amount:
        allocation.amount
    });
  }

  const sourceKey =
    `endlessDream:${crafter.id}:${foundry.utils.randomID()}`;

  const appliedRecipients =
    [];

  try {
    for (
      const recipient of
      recipients
    ) {
      const result =
        await grantTamerTemporaryIp(
          recipient.actor,
          recipient.amount,
          {
            sourceKey,

            sourceName:
              "Endless Dream",

            grantedByUuid:
              crafter.uuid,

            expiresOn:
              "rest",

            allowAboveNormalCap:
              true,

            maximumTotal:
              7,

            sourceMaximum:
              2
          }
        );

      if (
        result.granted > 0
      ) {
        appliedRecipients.push(
          recipient.actor
        );
      }

      if (
        result.granted !==
        recipient.amount
      ) {
        throw new Error(
          `Endless Dream granted ${result.granted}/${recipient.amount} to ${recipient.actor.name}.`
        );
      }
    }
  } catch (error) {
    console.error(
      "DDA | Endless Dream distribution failed. Rolling back.",
      error
    );

    await Promise.allSettled(
      appliedRecipients.map(
        (recipient) => {
          return clearTamerTemporaryIp(
            recipient,
            {
              sourceKey
            }
          );
        }
      )
    );

    return {
      ok: false,
      reason: "grantFailed"
    };
  }

  return {
    ok: true,
    sourceKey,

    total:
      availablePoints,

    allocations:
      recipients.map(
        (recipient) => {
          return {
            recipientUuid:
              recipient.actor.uuid,

            recipientName:
              recipient.actor.name,

            amount:
              recipient.amount
          };
        }
      )
  };
}

async function handleEndlessDreamGrantRequest(
  request
) {
  const requestingUser =
    game.users?.get(
      request.requestingUserId
    );

  const crafter =
    await resolveActor(
      request.crafterUuid
    );

  if (
    !requestingUser ||
    !crafter ||
    crafter.type !== "character" ||
    !canUserControlActor(
      requestingUser,
      crafter
    )
  ) {
    return {
      ok: false,
      reason: "invalidRequest"
    };
  }

  return applyEndlessDreamDistribution(
    crafter,
    request.allocations
  );
}

async function handleOfficialSpecialOrderRequest(
  request
) {
  const requestingUser =
    game.users?.get(
      request.requestingUserId
    );

  const tamer =
    await resolveActor(
      request.tamerUuid
    );

  const talentId = String(
    request.talentId ?? ""
  ).trim();

  if (
    !requestingUser ||
    !tamer ||
    tamer.type !== "character" ||
    !talentId ||
    !canUserControlActor(
      requestingUser,
      tamer
    ) ||
    !hasUnlockedOfficialTamerTalent(
      tamer,
      talentId
    )
  ) {
    return {
      ok: false,
      reason: "invalidRequest"
    };
  }

  const {
    executeOfficialSpecialOrderMutation
  } = await import(
    "./tamer-talent-special-orders.js"
  );

  return executeOfficialSpecialOrderMutation(
    tamer,
    talentId,
    request.selection ?? {}
  );
}

async function handleSocketRequest(
  request
) {
  const primaryGm =
    getPrimaryActiveGm();

  if (
    !game.user?.isGM ||
    primaryGm?.id !== game.user.id
  ) {
    return;
  }

  let result = {
    ok: false,
    reason: "unknownRequest"
  };

  try {
    if (
      request.type ===
        "busyHandsGrantRequest"
    ) {
      result =
        await handleBusyHandsGrantRequest(
          request
        );
    } else if (
      request.type ===
        "busyHandsClearRequest"
    ) {
      result =
        await handleBusyHandsClearRequest(
          request
        );
    } else if (
      request.type ===
        "endlessDreamGrantRequest"
    ) {
      result =
        await handleEndlessDreamGrantRequest(
          request
        );
    } else if (
      request.type ===
        "officialSpecialOrderRequest"
    ) {
      result =
        await handleOfficialSpecialOrderRequest(
          request
        );
    }
  } catch (error) {
    console.error(
      "DDA | Tamer Talent socket request failed.",
      error
    );

    result = {
      ok: false,
      reason: "requestFailed"
    };
  }

  emitResponse(
    request,
    result
  );
}

function handleSocketResponse(
  payload
) {
  if (
    payload.type !==
      "tamerTalentResponse" ||
    payload.targetUserId !==
      game.user?.id
  ) {
    return false;
  }

  const pending =
    pendingRequests.get(
      payload.requestId
    );

  if (!pending) {
    return true;
  }

  clearTimeout(
    pending.timeoutId
  );

  pendingRequests.delete(
    payload.requestId
  );

  pending.resolve(
    payload.result ?? {
      ok: false,
      reason: "emptyResponse"
    }
  );

  return true;
}

export function registerTamerTalentSocket() {
  if (
    socketRegistered ||
    !game.socket
  ) {
    return;
  }

  socketRegistered =
    true;

  game.socket.on(
    SOCKET_CHANNEL,
    (payload = {}) => {
      if (
        payload.scope !==
          "tamerTalent"
      ) {
        return;
      }

      if (
        payload.type ===
          "tamerTalentResponse"
      ) {
        handleSocketResponse(
          payload
        );

        return;
      }

      void handleSocketRequest(
        payload
      );
    }
  );
}

function requestFromActiveGm(
  payload = {}
) {
  const primaryGm =
    getPrimaryActiveGm();

  if (!primaryGm) {
    return Promise.resolve({
      ok: false,
      reason: "noActiveGm"
    });
  }

  const requestId =
    foundry.utils.randomID();

  const timeoutMs = Math.max(
    REQUEST_TIMEOUT_MS,
    integer(
      payload.timeoutMs,
      REQUEST_TIMEOUT_MS
    )
  );

  return new Promise(
    (resolve) => {
      const timeoutId =
        setTimeout(
          () => {
            pendingRequests.delete(
              requestId
            );

            resolve({
              ok: false,
              reason: "timeout"
            });
          },
          timeoutMs
        );

      pendingRequests.set(
        requestId,
        {
          resolve,
          timeoutId
        }
      );

      game.socket.emit(
        SOCKET_CHANNEL,
        {
          ...payload,

          scope:
            "tamerTalent",

          requestId,

          requestingUserId:
            game.user.id
        }
      );
    }
  );
}

export async function requestBusyHandsSkillItem(
  crafter,
  recipient,
  {
    skillKey = "",
    itemName = "",
    bonus = 0
  } = {}
) {
  if (
    !crafter ||
    !recipient
  ) {
    return {
      ok: false,
      reason: "invalidActors"
    };
  }

  if (
    game.user?.isGM ||
    recipient.isOwner
  ) {
    return grantBusyHandsSkillItem(
      crafter,
      recipient,
      {
        skillKey,
        itemName,
        bonus
      }
    );
  }

  return requestFromActiveGm({
    type:
      "busyHandsGrantRequest",

    crafterUuid:
      crafter.uuid,

    recipientUuid:
      recipient.uuid,

    skillKey,
    itemName
  });
}

export async function requestClearBusyHandsItems(
  crafter
) {
  if (
    !crafter ||
    crafter.type !== "character"
  ) {
    return {
      ok: false,
      reason: "invalidActor",
      cleared: 0,
      recipients: []
    };
  }

  if (game.user?.isGM) {
    return {
      ok: true,

      ...await clearBusyHandsItemsCraftedBy(
        crafter
      )
    };
  }

  return requestFromActiveGm({
    type:
      "busyHandsClearRequest",

    crafterUuid:
      crafter.uuid
  });
}

export async function requestEndlessDreamDistribution(
  crafter,
  allocations = []
) {
  if (
    !crafter ||
    crafter.type !== "character"
  ) {
    return {
      ok: false,
      reason: "invalidCrafter"
    };
  }

  const cleanAllocations =
    normalizeEndlessDreamAllocations(
      allocations
    );

  const recipients =
    await Promise.all(
      cleanAllocations.map(
        async (allocation) => {
          return resolveActor(
            allocation.recipientUuid
          );
        }
      )
    );

  const canApplyLocally =
    Boolean(
      game.user?.isGM ||
      (
        crafter.isOwner &&
        recipients.every(
          (recipient) => {
            return Boolean(
              recipient?.isOwner
            );
          }
        )
      )
    );

  if (canApplyLocally) {
    return applyEndlessDreamDistribution(
      crafter,
      cleanAllocations
    );
  }

  return requestFromActiveGm({
    type:
      "endlessDreamGrantRequest",

    crafterUuid:
      crafter.uuid,

    allocations:
      cleanAllocations
  });
}

export async function requestOfficialSpecialOrderExecution(
  tamer,
  talentId,
  selection = {}
) {
  if (
    !tamer ||
    tamer.type !== "character" ||
    !String(talentId ?? "").trim()
  ) {
    return {
      ok: false,
      reason: "invalidRequest"
    };
  }

  if (game.user?.isGM) {
    const {
      executeOfficialSpecialOrderMutation
    } = await import(
      "./tamer-talent-special-orders.js"
    );

    return executeOfficialSpecialOrderMutation(
      tamer,
      String(talentId).trim(),
      selection
    );
  }

  return requestFromActiveGm({
    type: "officialSpecialOrderRequest",
    tamerUuid: tamer.uuid,
    talentId: String(talentId).trim(),
    selection: foundry.utils.deepClone(
      selection ?? {}
    ),
    timeoutMs: 5 * 60 * 1000
  });
}
