function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(
  key,
  data = {}
) {
  return game.i18n.format(
    key,
    data
  );
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function resolveActor(
  uuid = ""
) {
  const cleanUuid =
    String(uuid ?? "").trim();

  if (!cleanUuid) {
    return null;
  }

  try {
    const document =
      await fromUuid(cleanUuid);

    return document?.documentName ===
      "Actor"
      ? document
      : null;
  } catch (_error) {
    return null;
  }
}

function getActorReferenceKeys(
  actor
) {
  return new Set(
    [
      actor?.uuid,
      actor?.id,

      actor?.id
        ? `Actor.${actor.id}`
        : "",

      actor?.parent?.uuid,
      actor?.parent?.id
    ]
      .map((value) => {
        return String(
          value ?? ""
        ).trim();
      })
      .filter(Boolean)
  );
}

async function resolveLuckyNumberTamer(
  sourceActor
) {
  if (!sourceActor) {
    return null;
  }

  if (
    sourceActor.type ===
    "character"
  ) {
    return sourceActor;
  }

  if (
    ![
      "digimon",
      "npc"
    ].includes(sourceActor.type)
  ) {
    return null;
  }

  /*
   * Primeiro tenta o vínculo direto salvo
   * no Actor do parceiro.
   */
  const directTamerUuid =
    String(
      sourceActor.system?.tamer
        ?.uuid ?? ""
    ).trim();

  if (directTamerUuid) {
    const directTamer =
      await resolveActor(
        directTamerUuid
      );

    if (
      directTamer?.type ===
      "character"
    ) {
      return directTamer;
    }
  }

  /*
   * Depois faz a busca reversa, porque algumas
   * versões do parceiro persistente registram
   * o vínculo apenas no Digi-Escolhido.
   */
  const sourceKeys =
    getActorReferenceKeys(
      sourceActor
    );

  return (
    game?.actors?.contents ?? []
  ).find((candidate) => {
    if (
      candidate.type !==
      "character"
    ) {
      return false;
    }

    const partnerData =
      candidate.system?.partner ?? {};

    return [
      partnerData.uuid,
      partnerData.currentFormUuid
    ].some((reference) => {
      return sourceKeys.has(
        String(
          reference ?? ""
        ).trim()
      );
    });
  }) ?? null;
}

export async function applyLuckyNumberReward(
  sourceActor,
  diceResults = [],
  options = {}
) {
  if (
    !sourceActor ||
    !Array.isArray(diceResults) ||
    diceResults.length !== 3
  ) {
    return null;
  }

  const tamer =
    await resolveLuckyNumberTamer(
      sourceActor
    );

  if (
    !tamer ||
    tamer.type !== "character"
  ) {
    return null;
  }

  const luckyNumber =
    Number(
      tamer.system?.luckyNumber ?? 0
    );

  if (
    !Number.isFinite(luckyNumber) ||
    luckyNumber < 1 ||
    luckyNumber > 6
  ) {
    return null;
  }

  const activeResults =
    diceResults
      .map((value) => {
        return Number(value);
      })
      .filter((value) => {
        return (
          Number.isFinite(value) &&
          value >= 1 &&
          value <= 6
        );
      });

  const matches =
    activeResults.filter((value) => {
      return value === luckyNumber;
    }).length;

  /*
   * A recompensa exige pelo menos dois dados
   * mostrando o Número da Sorte.
   */
  if (matches < 2) {
    return null;
  }

  const current =
    Math.max(
      0,
      Number(
        tamer.system?.resources
          ?.ip?.value ?? 0
      )
    );

  const configuredMaximum =
    Number(
      tamer.system?.resources
        ?.ip?.max
    );

  const maximum =
    Number.isFinite(
      configuredMaximum
    )
      ? Math.max(
          0,
          configuredMaximum
        )
      : current + 1;

  const next =
    Math.min(
      maximum,
      current + 1
    );

  const gained =
    Math.max(
      0,
      next - current
    );

  if (gained > 0) {
    await tamer.update({
      "system.resources.ip.value":
        next
    });
  }

  if (options.notify !== false) {
    ui.notifications.info(
      formatI18n(
        "DDA.LuckyNumber.Notification",
        {
          tamer:
            tamer.name,

          number:
            luckyNumber,

          matches
        }
      )
    );
  }

  if (options.createChat !== false) {
    const messageKey =
      gained > 0
        ? "DDA.LuckyNumber.Message"
        : "DDA.LuckyNumber.AtMaximum";

    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor: tamer
        }),

      content: `
        <div class="dda-chat-card dda-effect-card effect-special dda-lucky-number-card">
          <h2>
            ${localize(
              "DDA.LuckyNumber.Title"
            )}
          </h2>

          <p>
            ${formatI18n(
              messageKey,
              {
                tamer:
                  escapeHtml(
                    tamer.name
                  ),

                number:
                  luckyNumber,

                matches,

                current,
                next,
                maximum
              }
            )}
          </p>
        </div>
      `
    });
  }

  tamer.sheet?.render(false);

  return {
    sourceActor,
    tamer,

    luckyNumber,
    matches,

    current,
    next,
    maximum,

    gained,
    rewarded:
      gained > 0,

    source:
      String(
        options.source ?? ""
      )
  };
}
