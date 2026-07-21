import { areActorsAllies } from "../rules/quality-automation.js";

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function getTokenGridDistance(tokenA, tokenB) {
  if (!tokenA || !tokenB) return Infinity;
  const gridSize = Math.max(1, number(canvas?.grid?.size, 100));
  const bounds = (token) => {
    const document = token?.document ?? token ?? {};
    const x = Math.round(number(document.x) / gridSize);
    const y = Math.round(number(document.y) / gridSize);
    const width = Math.max(1, Math.round(number(document.width, 1)));
    const height = Math.max(1, Math.round(number(document.height, 1)));
    return { left: x, right: x + width - 1, top: y, bottom: y + height - 1 };
  };
  const a = bounds(tokenA);
  const b = bounds(tokenB);
  const gapX = a.right < b.left ? b.left - a.right : b.right < a.left ? a.left - b.right : 0;
  const gapY = a.bottom < b.top ? b.top - a.bottom : b.bottom < a.top ? a.top - b.bottom : 0;
  return Math.max(gapX, gapY);
}

export function isTokenCombatReady(token) {
  const actor = token?.actor;
  if (!actor || token.document?.hidden) return false;
  const combatant = game?.combat?.combatants?.find((entry) =>
    entry.tokenId === token.id || entry.actor?.uuid === actor.uuid
  );
  if (combatant?.defeated) return false;
  const wounds = number(
    actor.system?.resources?.woundBoxes?.value
      ?? actor.system?.woundBoxes?.value,
    NaN
  );
  return !Number.isFinite(wounds) || wounds > 0;
}

export function getFlankContext(attacker, targetToken, { distance = 1 } = {}) {
  const targetActor = targetToken?.actor ?? null;

  if (
    !attacker ||
    !targetActor ||
    !canvas?.tokens?.placeables?.length ||
    areActorsAllies(attacker, targetActor)
  ) {
    return {
      active: false,
      allies: [],
      allyNames: [],
      distance
    };
  }

  const seenActors = new Set();
  const allies = canvas.tokens.placeables.filter((token) => {
    const ally = token?.actor ?? null;

    if (!ally || token === targetToken) return false;
    if (ally.uuid === attacker.uuid || seenActors.has(ally.uuid)) return false;

    // Aggressive Flank only applies when a valid ally of the attacker is also
    // an opponent of the target. This avoids friendly/neutral tokens or badly
    // configured dispositions granting the bonus by accident.
    if (!areActorsAllies(attacker, ally)) return false;
    if (areActorsAllies(targetActor, ally)) return false;
    if (!isTokenCombatReady(token)) return false;

    // The rule only requires the ally to be adjacent to the target. It does
    // not require strict opposite-side geometry.
    if (getTokenGridDistance(token, targetToken) > distance) return false;

    seenActors.add(ally.uuid);
    return true;
  });

  const allyNames = allies.map((token) => {
    return String(token.name ?? token.actor?.name ?? "").trim();
  }).filter(Boolean);

  return {
    active: allies.length > 0,
    allies,
    allyNames,
    distance
  };
}
