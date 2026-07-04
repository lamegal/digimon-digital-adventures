function localize(key) { return game.i18n.localize(key); }
function formatI18n(key, data = {}) { return game.i18n.format(key, data); }

async function resolveActor(uuid = "") {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch (_error) {
    return null;
  }
}

export async function applyLuckyNumberReward(sourceActor, diceResults = [], options = {}) {
  if (!sourceActor || !Array.isArray(diceResults) || diceResults.length < 2) return null;

  let tamer = sourceActor.type === "character" ? sourceActor : null;
  if (!tamer && (sourceActor.type === "digimon" || sourceActor.type === "npc")) {
    tamer = await resolveActor(sourceActor.system?.tamer?.uuid ?? "");
  }
  if (!tamer || tamer.type !== "character") return null;

  const lucky = Number(tamer.system?.luckyNumber ?? 0);
  if (!Number.isFinite(lucky) || lucky < 1 || lucky > 6) return null;

  const matches = diceResults.map((value) => Number(value)).filter((value) => value === lucky).length;
  if (matches < 2) return null;

  const current = Number(tamer.system.resources?.ip?.value ?? 0);
  const max = Number(tamer.system.resources?.ip?.max ?? current + 1);
  const next = Math.min(max, current + 1);
  if (next <= current) return null;

  await tamer.update({ "system.resources.ip.value": next });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-lucky-number-card">
        <h2>${localize("DDA.LuckyNumber.Title")}</h2>
        <p>${formatI18n("DDA.LuckyNumber.Message", {
          tamer: `<strong>${tamer.name}</strong>`,
          number: `<strong>${lucky}</strong>`,
          current,
          next
        })}</p>
      </div>
    `
  });

  tamer.sheet?.render(false);
  return { tamer, lucky, current, next, matches };
}
