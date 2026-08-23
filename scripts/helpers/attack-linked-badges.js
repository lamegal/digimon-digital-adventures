const SYSTEM_ID = "digimon-digital-adventures";

function normalizeTextKey(value = "") {
  return String(value ?? "")
    .split(/\s+[—–-]\s+\[/u)[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeTag(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .trim();
}

function getAttackIdentityKeys(attackItem) {
  return new Set([
    attackItem?.id,
    attackItem?.uuid,
    attackItem?.system?.wizard?.attackKey,
    attackItem?.flags?.[SYSTEM_ID]?.wizardAttackKey,
    attackItem?.flags?.[SYSTEM_ID]?.enemyBuilderAttackKey
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean));
}

function getChoiceAttackIdentity(choice = {}) {
  const key = String(choice?.key ?? "").trim();
  const separator = key.indexOf(":");

  return String(
    choice?.attackId ??
    choice?.attackItemId ??
    choice?.itemId ??
    choice?.attackKey ??
    (separator > 0 ? key.slice(0, separator) : "")
  ).trim();
}

function getChoiceTag(choice = {}) {
  const key = String(choice?.key ?? "").trim();
  const separator = key.indexOf(":");
  const suffix = separator > 0 ? key.slice(separator + 1) : "";

  return normalizeTag(
    choice?.effectTag ??
    choice?.attackTag ??
    suffix
  );
}

function getSelectedChoices(quality) {
  return [
    ...(Array.isArray(quality?.system?.choices?.selectedRanks)
      ? quality.system.choices.selectedRanks
      : []),
    ...(Array.isArray(quality?.system?.choices?.selected)
      ? quality.system.choices.selected
      : [])
  ]
    .map((choice) => choice && typeof choice === "object" ? choice : { key: choice })
    .filter(Boolean);
}

function choiceMatchesAttack(choice, attackItem, siblingAttacks = []) {
  const choiceAttackId = getChoiceAttackIdentity(choice);
  const attackKeys = getAttackIdentityKeys(attackItem);

  if (choiceAttackId && attackKeys.has(choiceAttackId)) return true;

  const attackNameKey = normalizeTextKey(attackItem?.name ?? "");
  const choiceNameKey = normalizeTextKey(
    choice?.attackName ??
    choice?.originalLabel ??
    choice?.label ??
    ""
  );

  if (!attackNameKey || !choiceNameKey || attackNameKey !== choiceNameKey) {
    return false;
  }

  const sameNameCount = siblingAttacks.filter((attack) => {
    return normalizeTextKey(attack?.name ?? "") === attackNameKey;
  }).length;

  return sameNameCount <= 1;
}

function resolveConfiguredLabel(value = "", fallback = "") {
  let label = String(value ?? "").trim();

  /*
   * CONFIG.DDA is constructed while the system modules are loading. On some
   * Foundry v13 startup paths game.i18n is not ready yet, so CONFIG may retain
   * the localization key instead of the localized label. Resolve it again at
   * sheet-render time instead of displaying DDA.EffectTag.Push to the user.
   */
  if (label.startsWith("DDA.")) {
    const localized = game?.i18n?.localize?.(label);
    if (localized && localized !== label) label = localized;
    else label = "";
  }

  label = label.replace(/^\[|\]$/g, "").trim();
  return label || String(fallback ?? "").replace(/^\[|\]$/g, "").trim();
}

function tagLabel(tag = "") {
  const normalized = normalizeTag(tag);
  const bare = normalized.replace(/^t:/, "");
  const effectLabel = CONFIG.DDA?.effectTags?.[bare];
  const attackLabel = CONFIG.DDA?.attackTags?.[bare];

  if (effectLabel) {
    const resolved = resolveConfiguredLabel(effectLabel, bare);
    return {
      kind: "effect",
      label: `[${resolved.toUpperCase()}]`,
      shortLabel: resolved,
      tag: bare
    };
  }

  if (attackLabel) {
    const resolved = resolveConfiguredLabel(attackLabel, bare);
    return {
      kind: "quality",
      label: `[${resolved.toUpperCase()}]`,
      shortLabel: resolved,
      tag: bare
    };
  }

  if (!bare) return null;

  return {
    kind: "quality",
    label: `[${bare.toUpperCase()}]`,
    shortLabel: bare.toUpperCase(),
    tag: bare
  };
}

function pushBadge(badges, seen, badge) {
  if (!badge?.label) return;
  const key = `${badge.kind}:${normalizeTextKey(badge.label)}`;
  if (seen.has(key)) return;
  seen.add(key);
  badges.push(badge);
}

/**
 * Build the compact pills shown on the Digimon Combat tab for every Attack.
 *
 * The purchased Quality binding is the preferred source of truth. This uses
 * the same conservative old-id/name fallback as the beta.9 Effect hotfix so a
 * progression/evolution snapshot which recreated an embedded Attack does not
 * make the sheet lie about which Quality is attached to it.
 */
export function buildAttackLinkedBadges(actor, attackItem) {
  if (!actor || !attackItem) return [];

  const attacks = Array.from(actor.items ?? []).filter((item) => item?.type === "attack");
  const badges = [];
  const seen = new Set();

  for (const quality of Array.from(actor.items ?? [])) {
    if (quality?.type !== "quality") continue;

    const matchingChoices = getSelectedChoices(quality).filter((choice) => {
      return choiceMatchesAttack(choice, attackItem, attacks);
    });

    if (!matchingChoices.length) continue;

    let emittedTaggedChoice = false;

    for (const choice of matchingChoices) {
      const tag = getChoiceTag(choice);
      const tagBadge = tagLabel(tag);
      if (!tagBadge) continue;

      emittedTaggedChoice = true;
      pushBadge(badges, seen, {
        ...tagBadge,
        sourceQuality: quality.name,
        title: `${quality.name} — ${tagBadge.shortLabel}`
      });
    }

    if (!emittedTaggedChoice) {
      pushBadge(badges, seen, {
        kind: "quality",
        label: quality.name,
        sourceQuality: quality.name,
        title: quality.name
      });
    }
  }

  // Compatibility fallback for older actors where the tag was materialized on
  // the Attack but the original Quality choice was not retained.
  const materializedTags = [
    ...(Array.isArray(attackItem.system?.qualityTags)
      ? attackItem.system.qualityTags
      : []),
    ...(attackItem.system?.effectTag?.enabled
      ? [attackItem.system.effectTag.tag]
      : [])
  ];

  for (const rawTag of materializedTags) {
    const value = rawTag && typeof rawTag === "object"
      ? rawTag.tag ?? rawTag.key ?? rawTag.value ?? ""
      : rawTag;
    const badge = tagLabel(value);
    if (!badge) continue;

    pushBadge(badges, seen, {
      ...badge,
      title: badge.shortLabel
    });
  }

  return badges.slice(0, 5);
}
