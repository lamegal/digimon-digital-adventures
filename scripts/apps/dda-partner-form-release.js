import { DDADigimonDatabase } from "../data/digimon-database.js";
import {
  resolveDigimonPortraitSources
} from "../helpers/digimon-portrait-resolver.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";

const STAGE_ORDER = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate",
  "ultimatePlus"
];

function localize(key, fallback = key) {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function clone(value) {
  return foundry.utils.deepClone(value);
}

function cleanReference(value = "") {
  return String(value ?? "").trim();
}

function generateNodeId(reference = "") {
  return `node_${cleanReference(reference)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function generateEdgeId(from = "", to = "", method = "normal") {
  return `edge_${from}_${to}_${method}`
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function resolveActor(reference = "") {
  const clean = cleanReference(reference);
  if (!clean) return null;

  try {
    const document = await fromUuid(clean);
    if (document?.documentName === "Actor") return document;
  } catch (_error) {
    // Fall through to world Actor lookup.
  }

  return game.actors?.get(clean) ?? null;
}

async function resolvePartnerPair(sourceActor = null) {
  if (!sourceActor) return null;

  if (sourceActor.type === "character") {
    const partnerActor = await resolveActor(
      sourceActor.system?.partner?.uuid
    );

    return partnerActor
      ? { tamerActor: sourceActor, partnerActor }
      : null;
  }

  if (["digimon", "npc"].includes(sourceActor.type)) {
    const partnerActor = sourceActor;
    const storedTamer = await resolveActor(
      partnerActor.system?.tamer?.uuid
    );

    const tamerActor = storedTamer?.type === "character"
      ? storedTamer
      : game.actors?.find((actor) => {
          return actor.type === "character" &&
            cleanReference(actor.system?.partner?.uuid) === partnerActor.uuid;
        }) ?? null;

    return tamerActor
      ? { tamerActor, partnerActor }
      : null;
  }

  return null;
}

function getUnlockedStages(tamerActor = null) {
  const unlocked = clone(
    tamerActor?.system?.partner?.unlockedEvolutionStages ?? {}
  );

  for (const stage of STAGE_ORDER) {
    if (unlocked[stage] === undefined) {
      unlocked[stage] = ["baby1", "baby2", "child"].includes(stage);
    }
  }

  return unlocked;
}

function getFormReference(form = {}) {
  return cleanReference(
    form?.sourceFormUuid ||
    form?.formUuid ||
    form?.actorUuid ||
    form?.uuid
  );
}

function getNodeReference(node = {}) {
  return cleanReference(
    node?.sourceFormUuid ||
    node?.formUuid ||
    node?.actorUuid ||
    node?.uuid
  );
}

function getSlotForms(slot = null) {
  const raw = [];

  if (Array.isArray(slot)) {
    raw.push(...slot);
  } else if (slot && typeof slot === "object") {
    if (Array.isArray(slot.forms)) raw.push(...slot.forms);
    if (slot.uuid || slot.actorUuid || slot.sourceFormUuid) raw.unshift(slot);
  }

  const seen = new Set();
  const result = [];

  for (const form of raw) {
    const reference = getFormReference(form);
    if (!reference || seen.has(reference)) continue;

    seen.add(reference);
    result.push(clone(form));
  }

  return result;
}

function findNode(graph = {}, reference = "") {
  const wanted = cleanReference(reference);

  return (graph.nodes ?? []).find((node) => {
    return [
      node?.sourceFormUuid,
      node?.formUuid,
      node?.actorUuid,
      node?.uuid
    ].some((value) => cleanReference(value) === wanted);
  }) ?? null;
}

function lineContains(line = {}, reference = "") {
  const wanted = cleanReference(reference);

  return Object.values(line?.forms ?? {}).some((slot) => {
    return getSlotForms(slot).some((form) => {
      return getFormReference(form) === wanted;
    });
  });
}

function snapshotName(snapshot = {}) {
  return String(
    snapshot?.species ||
    snapshot?.sourceFormName ||
    snapshot?.displayName ||
    snapshot?.name ||
    "Digimon"
  ).trim() || "Digimon";
}

function splitImageFallbacks(value = "") {
  return String(value ?? "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function staticPortraitCandidate(path = "") {
  const clean = String(path ?? "").trim();
  if (!clean || clean.endsWith("mystery-man.svg")) return "";
  if (/\.webm(?:$|[?#])/i.test(clean)) return "";
  return /\.(?:webp|png|jpe?g|gif|svg)(?:$|[?#])/i.test(clean)
    ? clean
    : "";
}

function getImageCandidates(snapshot = {}, databaseActor = null) {
  const system = databaseActor?.system ?? {};
  const raw = [
    snapshot?.portraitImg,
    system?.images?.portraitImagePath,
    system?.images?.portrait,
    snapshot?.img,
    databaseActor?.img,
    snapshot?.tokenImg,
    system?.images?.tokenImagePath,
    system?.images?.token,
    databaseActor?.prototypeToken?.texture?.src,
    ...splitImageFallbacks(snapshot?.imageFallbacks)
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const candidates = [
    ...raw.map(staticPortraitCandidate),
    ...raw.filter((value) => !/\.webm(?:$|[?#])/i.test(value)),
    "icons/svg/mystery-man.svg"
  ]
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

async function repairSnapshotImages(snapshot = {}) {
  const databaseActor = await resolveDatabaseRecord(snapshot);
  const candidates = resolveDigimonPortraitSources(snapshot, {
    fallbackRecords: databaseActor ? [databaseActor] : [],
    manualPortrait: snapshot?.portraitImg ?? "",
    manualPortraitSelected: Boolean(
      snapshot?.wizard?.portraitManuallySelected ||
      snapshot?.wizard?.portraitSource === "manual"
    )
  });
  const portraitImg = candidates[0] || "icons/svg/mystery-man.svg";

  return {
    img: portraitImg,
    portraitImg,
    tokenImg: String(
      snapshot?.tokenImg ||
      databaseActor?.system?.images?.tokenImagePath ||
      databaseActor?.system?.images?.token ||
      databaseActor?.prototypeToken?.texture?.src ||
      portraitImg
    ).trim(),
    imageFallbacks: candidates.slice(1).join("|")
  };
}

function snapshotImages(snapshot = {}) {
  const candidates = resolveDigimonPortraitSources(snapshot, {
    manualPortrait: snapshot?.portraitImg ?? "",
    manualPortraitSelected: Boolean(
      snapshot?.wizard?.portraitManuallySelected ||
      snapshot?.wizard?.portraitSource === "manual"
    )
  });
  const portraitImg = candidates[0] || "icons/svg/mystery-man.svg";

  return {
    img: portraitImg,
    portraitImg,
    tokenImg: String(snapshot?.tokenImg || portraitImg).trim(),
    imageFallbacks: Array.from(new Set([
      ...splitImageFallbacks(snapshot?.imageFallbacks),
      ...candidates.filter((entry) => entry !== portraitImg)
    ])).join("|")
  };
}

function buildSnapshotFormData(snapshot = {}) {
  const reference = getFormReference(snapshot);
  const name = snapshotName(snapshot);
  const stage = String(snapshot?.stage || "child").trim() || "child";
  const images = snapshotImages(snapshot);

  return {
    name,
    displayName: name,
    species: name,
    uuid: reference,
    actorUuid: reference,
    formUuid: reference,
    sourceFormUuid: reference,
    sourceId: String(snapshot?.sourceId ?? snapshot?.names?.canonical ?? ""),
    databaseId: String(snapshot?.databaseId ?? ""),
    originalName: String(snapshot?.originalName ?? snapshot?.names?.original ?? name),
    dubName: String(snapshot?.dubName ?? snapshot?.names?.dub ?? name),
    aliases: clone(snapshot?.aliases ?? snapshot?.names?.aliases ?? []),
    names: clone(snapshot?.names ?? {}),
    stage,
    stageValue: Number(snapshot?.stageValue ?? 2),
    size: String(snapshot?.size ?? "medium"),
    type: String(snapshot?.type ?? ""),
    attribute: String(snapshot?.attribute ?? "data"),
    field: String(snapshot?.field ?? "none"),
    family: String(snapshot?.family ?? "none"),
    group: String(snapshot?.group ?? ""),
    evolutionCategory: String(snapshot?.evolutionCategory ?? "normal"),
    specialCategories: clone(snapshot?.specialCategories ?? []),
    primarySpecialCategory: String(
      snapshot?.primarySpecialCategory ?? ""
    ),
    isSpecialForm: Boolean(snapshot?.isSpecialForm),
    specialForm: clone(snapshot?.specialForm ?? {}),
    ...images,
    snapshot: true,
    persistentSnapshot: true,
    preparedFutureForm: true,
    source: "partnerFormPlanner",
    unlocked: true,
    hidden: false
  };
}

function buildActorNode(actor = null) {
  const reference = actor?.uuid ?? "";
  const name = String(
    actor?.system?.species ||
    actor?.name ||
    "Digimon"
  ).trim();
  const portraitSources = resolveDigimonPortraitSources(actor, {
    manualPortrait: actor?.flags?.[DDA_SYSTEM_ID]?.digivicePortrait || "",
    manualPortraitSelected: Boolean(
      actor?.flags?.[DDA_SYSTEM_ID]?.digivicePortraitManual
    ),
    allowVideo: false
  });
  const img = portraitSources[0] || "icons/svg/mystery-man.svg";

  return {
    id: generateNodeId(reference),
    actorUuid: reference,
    uuid: reference,
    name,
    displayName: name,
    species: name,
    sourceId: String(actor?.system?.sourceId || ""),
    databaseId: String(actor?.system?.databaseId || ""),
    stage: String(actor?.system?.stage || "child"),
    img,
    portraitImg: img,
    imageFallbacks: portraitSources.slice(1).join("|"),
    tokenImg: String(
      actor?.system?.evolution?.tokenImg ||
      actor?.prototypeToken?.texture?.src ||
      img
    ),
    unlocked: true,
    hidden: false
  };
}

function importLegacyLineIntoGraph(graph = {}, line = {}, partnerActor = null) {
  graph.nodes ??= [];
  graph.edges ??= [];

  if (!findNode(graph, partnerActor?.uuid)) {
    graph.nodes.push(buildActorNode(partnerActor));
  }

  const primaryNodeIds = [];

  for (const stage of STAGE_ORDER) {
    const slot = line?.forms?.[stage];
    const forms = getSlotForms(slot);

    for (const form of forms) {
      const reference = getFormReference(form);
      if (!reference) continue;

      let node = findNode(graph, reference);

      if (!node) {
        node = {
          id: generateNodeId(reference),
          actorUuid: reference,
          uuid: reference,
          name: String(form.name || form.species || ""),
          displayName: String(
            form.displayName ||
            form.species ||
            form.name ||
            ""
          ),
          species: String(
            form.species ||
            form.displayName ||
            form.name ||
            ""
          ),
          stage: String(form.stage || stage),
          img: String(form.img || ""),
          portraitImg: String(form.portraitImg || form.img || ""),
          tokenImg: String(form.tokenImg || form.img || ""),
          snapshot: Boolean(form.snapshot),
          persistentSnapshot: Boolean(form.persistentSnapshot),
          unlocked: form.unlocked ?? true,
          hidden: form.hidden ?? false
        };

        graph.nodes.push(node);
      }

      if (
        cleanReference(slot?.uuid) === reference ||
        (!slot?.uuid && forms[0] === form)
      ) {
        if (!primaryNodeIds.includes(node.id)) {
          primaryNodeIds.push(node.id);
        }
      }
    }
  }

  if (!graph.edges.length && primaryNodeIds.length > 1) {
    for (let index = 0; index < primaryNodeIds.length - 1; index += 1) {
      const from = primaryNodeIds[index];
      const to = primaryNodeIds[index + 1];

      graph.edges.push({
        id: generateEdgeId(from, to, "normal"),
        from,
        to,
        method: "normal",
        unlocked: true
      });
    }
  }

  return graph;
}

function upsertGraphNode(graph = {}, snapshot = {}) {
  const data = buildSnapshotFormData(snapshot);
  const reference = data.sourceFormUuid;
  let node = findNode(graph, reference);

  if (node) {
    const id = node.id || generateNodeId(reference);

    Object.assign(node, {
      ...node,
      ...data,
      id
    });
  } else {
    node = {
      ...data,
      id: generateNodeId(reference)
    };
    graph.nodes.push(node);
  }

  if (Array.isArray(graph.removedActorUuids)) {
    graph.removedActorUuids = graph.removedActorUuids.filter((entry) => {
      return cleanReference(entry) !== reference;
    });
  }

  return node;
}

function upsertLineForm(line = {}, snapshot = {}) {
  line.forms ??= {};

  const data = buildSnapshotFormData(snapshot);
  const stage = data.stage;
  const oldSlot = line.forms[stage] ?? {};
  const forms = getSlotForms(oldSlot);
  const index = forms.findIndex((form) => {
    return getFormReference(form) === data.sourceFormUuid;
  });

  if (index >= 0) {
    forms[index] = {
      ...forms[index],
      ...data
    };
  } else {
    forms.push(data);
  }

  const oldObject = oldSlot &&
    typeof oldSlot === "object" &&
    !Array.isArray(oldSlot)
    ? clone(oldSlot)
    : {};

  const primary = oldObject.uuid
    ? oldObject
    : forms[0] ?? data;

  line.forms[stage] = {
    ...oldObject,
    name: String(primary.name || primary.species || data.name),
    displayName: String(
      primary.displayName ||
      primary.species ||
      primary.name ||
      data.name
    ),
    species: String(
      primary.species ||
      primary.displayName ||
      primary.name ||
      data.name
    ),
    uuid: getFormReference(primary) || data.sourceFormUuid,
    actorUuid: cleanReference(
      primary.actorUuid ||
      primary.uuid ||
      data.sourceFormUuid
    ),
    stage: String(primary.stage || stage),
    img: String(
      primary.portraitImg ||
      primary.img ||
      data.portraitImg ||
      data.img
    ),
    portraitImg: String(
      primary.portraitImg ||
      data.portraitImg ||
      primary.img ||
      data.img
    ),
    tokenImg: String(
      primary.tokenImg ||
      primary.img ||
      data.tokenImg
    ),
    forms
  };

  return data;
}

function normalizeIdentity(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/x[-_\s]*antibody/g, "xantibody")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getIdentityKeys(record = {}) {
  const system = record?.system ?? {};
  const names = system?.names ?? record?.names ?? {};

  return Array.from(new Set([
    record?.databaseId,
    system?.databaseId,
    record?.sourceId,
    system?.sourceId,
    record?.key,
    record?.species,
    system?.species,
    record?.sourceFormName,
    record?.displayName,
    record?.originalName,
    record?.dubName,
    names?.canonical,
    names?.original,
    names?.dub,
    record?.name,
    ...(Array.isArray(record?.aliases) ? record.aliases : []),
    ...(Array.isArray(names?.aliases) ? names.aliases : [])
  ]
    .map(normalizeIdentity)
    .filter(Boolean)));
}

async function resolveDatabaseRecord(
  record = {},
  { ignoreActorReference = false } = {}
) {
  if (!record) return null;

  const system = record?.system ?? {};
  const databaseId = String(
    record?.databaseId ?? system?.databaseId ?? ""
  ).trim();
  const declaredDatabaseStage = getReferenceStage(databaseId);
  const requestedStage = String(
    declaredDatabaseStage ||
    record?.stage ||
    system?.stage ||
    ""
  ).trim();

  const candidates = Array.from(new Set([
    databaseId,
    record?.key,
    record?.sourceId,
    system?.sourceId,
    record?.sourceFormName,
    record?.species,
    system?.species,
    record?.originalName,
    record?.dubName,
    record?.names?.canonical,
    record?.names?.original,
    record?.names?.dub,
    record?.name
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)));

  /* A databaseId with an embedded Stage is an authoritative identity. */
  if (databaseId) {
    const byDatabaseId = await DDADigimonDatabase.getActorData(databaseId);
    if (byDatabaseId) return byDatabaseId;
  }

  /*
   * Resolve by Stage before any broad name lookup. This prevents a current
   * Champion/Adult Actor from being used to repair a Rookie/Child snapshot.
   */
  if (requestedStage) {
    for (const candidate of candidates) {
      const byStage = await DDADigimonDatabase.getByStageAndName(
        requestedStage,
        candidate
      );
      if (byStage) return byStage;
    }
  }

  const direct = await DDADigimonDatabase.getByReference({
    databaseId,
    key: record?.key,
    sourceId: record?.sourceId ?? system?.sourceId,
    sourceName: record?.sourceFormName,
    species: record?.species ?? system?.species,
    name: record?.name
  }, requestedStage);

  if (direct) {
    const directStage = String(direct?.system?.stage ?? "").trim();
    if (!requestedStage || !directStage || directStage === requestedStage) {
      return direct;
    }
  }

  if (ignoreActorReference) return null;

  const actor = await resolveActor(
    record?.actorUuid ||
    record?.uuid ||
    record?.sourceFormUuid ||
    ""
  );

  const actorRecord = actor
    ? await DDADigimonDatabase.findForActor(actor)
    : null;

  /* A real Compendium/world form reference is stronger than a stale line slot. */
  return actorRecord ?? null;
}

function getSnapshotCategories(snapshot = {}) {
  return Array.from(new Set([
    snapshot?.evolutionCategory,
    snapshot?.primarySpecialCategory,
    ...(Array.isArray(snapshot?.specialCategories)
      ? snapshot.specialCategories
      : []),
    snapshot?.specialForm?.kind,
    snapshot?.specialForm?.method
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)));
}

function getRelationArrays(index = {}, direction = "from") {
  const suffix = direction === "to" ? "To" : "From";

  return [
    { key: `special${suffix}`, priority: 4 },
    { key: `normal${suffix}`, priority: 3 },
    { key: `candidateSpecial${suffix}`, priority: 2 },
    { key: `candidate${suffix}`, priority: 1 }
  ];
}

function findRelation(index = {}, direction = "from", counterpartKeys = []) {
  const wanted = new Set(counterpartKeys);

  for (const group of getRelationArrays(index, direction)) {
    const entries = Array.isArray(index?.[group.key])
      ? index[group.key]
      : [];

    for (const relation of entries) {
      const relationKeys = getIdentityKeys(relation);
      if (!relationKeys.some((key) => wanted.has(key))) continue;

      return {
        ...relation,
        sourceList: group.key,
        priority: group.priority
      };
    }
  }

  return null;
}

function meaningfulMatch(left = "", right = "") {
  const a = normalizeIdentity(left);
  const b = normalizeIdentity(right);

  return Boolean(
    a &&
    b &&
    !["none", "free", "unknown"].includes(a) &&
    a === b
  );
}

function getStoredCompatibilityOverride(parent = {}, candidate = {}) {
  let map = {};

  try {
    map = game.settings?.get(
      DDA_SYSTEM_ID,
      "devEvolutionCompatibilityOverrides"
    ) ?? {};
  } catch (_error) {
    return null;
  }

  const fromKeys = [...getIdentityKeys(parent), "*"];
  const toKeys = getIdentityKeys(candidate);

  for (const fromKey of fromKeys) {
    const group = map?.[fromKey];
    if (!group || typeof group !== "object") continue;

    for (const toKey of toKeys) {
      if (!Object.prototype.hasOwnProperty.call(group, toKey)) continue;

      const value = group[toKey];
      if (typeof value === "number") {
        return {
          score: value,
          reason: localize(
            "DDA.PartnerFormPlanner.Picker.ManualCompatibility",
            "Ajuste manual"
          )
        };
      }

      if (value && typeof value === "object") {
        const score = Number(
          value.score ?? value.compatibility ?? value.value
        );

        if (Number.isFinite(score)) {
          return {
            score,
            reason: String(
              value.reason ||
              value.label ||
              localize(
                "DDA.PartnerFormPlanner.Picker.ManualCompatibility",
                "Ajuste manual"
              )
            )
          };
        }
      }
    }
  }

  return null;
}

function inferEvolutionMethod(snapshot = {}, relation = null) {
  const raw = String(
    relation?.relationType ||
    snapshot?.specialForm?.method ||
    snapshot?.primarySpecialCategory ||
    snapshot?.evolutionCategory ||
    "normal"
  )
    .trim()
    .toLowerCase();

  const methods = {
    armor: "armor",
    hybrid: "hybrid",
    biomerge: "biomerge",
    mindlink: "mindLink",
    jogress: "jogress",
    burst: "burst",
    blast: "blast",
    mode: "modeChange",
    modechange: "modeChange",
    warp: "warp",
    slide: "slide",
    dark: "dark",
    xantibody: "normal",
    antibody: "normal",
    variant: "normal",
    normal: "normal"
  };

  return methods[normalizeIdentity(raw)] ?? methods[raw] ?? "normal";
}

async function calculateCompatibility(candidate = {}, parent = {}) {
  const [candidateDatabase, parentDatabase] = await Promise.all([
    resolveDatabaseRecord(candidate),
    resolveDatabaseRecord(parent)
  ]);

  const candidateRecord = candidateDatabase ?? candidate;
  const parentRecord = parentDatabase ?? parent;
  const candidateSystem = candidateRecord?.system ?? candidate?.system ?? candidate;
  const parentSystem = parentRecord?.system ?? parent?.system ?? parent;
  const candidateKeys = getIdentityKeys(candidateRecord);
  const parentKeys = getIdentityKeys(parentRecord);

  const targetRelation = findRelation(
    candidateSystem?.evolutionIndex ?? {},
    "from",
    parentKeys
  );

  const parentRelation = findRelation(
    parentSystem?.evolutionIndex ?? {},
    "to",
    candidateKeys
  );

  const relation = targetRelation ?? parentRelation;
  const direct = Boolean(relation);
  const reasons = [];
  let score = 35;

  if (direct) {
    score += 45;
    reasons.push(localize(
      "DDA.EvolutionChoice.Reason.Direct",
      "Evolução direta"
    ));
  }

  if (meaningfulMatch(candidateSystem?.family, parentSystem?.family)) {
    score += 8;
    reasons.push(localize(
      "DDA.EvolutionChoice.Reason.SameFamily",
      "Mesma família"
    ));
  }

  if (meaningfulMatch(candidateSystem?.field, parentSystem?.field)) {
    score += 8;
    reasons.push(localize(
      "DDA.EvolutionChoice.Reason.SameField",
      "Mesmo Campo"
    ));
  }

  if (meaningfulMatch(candidateSystem?.attribute, parentSystem?.attribute)) {
    score += 4;
    reasons.push(localize(
      "DDA.EvolutionChoice.Reason.SameAttribute",
      "Mesmo Atributo"
    ));
  }

  const manual = getStoredCompatibilityOverride(parentRecord, candidateRecord);
  if (manual && Number.isFinite(Number(manual.score))) {
    score = Number(manual.score);
    reasons.unshift(manual.reason);
  }

  score = Math.clamp(Number(score), 5, 98);

  let tier = "uncommon";
  if (score >= 80) tier = "recommended";
  else if (score >= 55) tier = "plausible";

  if (!reasons.length) {
    reasons.push(localize(
      "DDA.EvolutionChoice.Reason.Explored",
      "Possibilidade exploratória"
    ));
  }

  return {
    score,
    tier,
    label: localize(
      `DDA.EvolutionChoice.Tier.${tier}`,
      tier
    ),
    reasons,
    direct,
    relation,
    relationPriority: Number(relation?.priority ?? 0),
    method: inferEvolutionMethod(candidate, relation),
    parentName: String(
      parent?.displayName ||
      parent?.species ||
      parentRecord?.system?.species ||
      parent?.name ||
      parentRecord?.name ||
      ""
    ).trim()
  };
}

export async function getPlannedFormCompatibility({
  candidate = null,
  parent = null
} = {}) {
  if (!candidate || !parent) {
    return {
      score: 35,
      tier: "uncommon",
      label: localize("DDA.EvolutionChoice.Tier.uncommon", "Incomum"),
      reasons: [localize(
        "DDA.EvolutionChoice.Reason.Explored",
        "Possibilidade exploratória"
      )],
      direct: false,
      relation: null,
      relationPriority: 0,
      method: inferEvolutionMethod(candidate),
      parentName: ""
    };
  }

  return calculateCompatibility(candidate, parent);
}

function getPreviousStageRecords(partnerActor = null, targetStage = "") {
  if (!partnerActor) return [];

  const targetIndex = STAGE_ORDER.indexOf(String(targetStage ?? ""));
  if (targetIndex <= 0) return [];

  const records = [];
  const graphNodes = Array.isArray(partnerActor.system?.evolutionGraph?.nodes)
    ? partnerActor.system.evolutionGraph.nodes
    : [];
  const snapshots = Object.values(
    partnerActor.system?.evolution?.formSnapshots ?? {}
  ).filter((entry) => entry && typeof entry === "object");

  records.push(...graphNodes, ...snapshots);
  records.push({
    actorUuid: partnerActor.uuid,
    uuid: partnerActor.uuid,
    name: partnerActor.name,
    species: partnerActor.system?.species || partnerActor.name,
    stage: partnerActor.system?.stage || "child",
    sourceId: partnerActor.system?.sourceId || "",
    databaseId: partnerActor.system?.databaseId || "",
    system: partnerActor.system
  });

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const stage = STAGE_ORDER[index];
    const seen = new Set();
    const stageRecords = records.filter((record) => {
      if (String(record?.stage ?? record?.system?.stage ?? "") !== stage) {
        return false;
      }

      const identity = getIdentityKeys(record)[0] || cleanReference(
        record?.sourceFormUuid || record?.actorUuid || record?.uuid
      );

      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });

    if (stageRecords.length) return stageRecords;
  }

  return [];
}

export async function getBestPlannedFormCompatibility({
  candidate = null,
  partnerActor = null,
  stageKey = ""
} = {}) {
  const parents = getPreviousStageRecords(
    partnerActor,
    stageKey || candidate?.system?.stage || candidate?.stage
  );

  if (!parents.length) {
    return {
      score: 35,
      tier: "uncommon",
      label: localize(
        "DDA.EvolutionChoice.Tier.uncommon",
        "Incomum"
      ),
      reasons: [localize(
        "DDA.EvolutionChoice.Reason.Explored",
        "Possibilidade exploratória"
      )],
      direct: false,
      method: inferEvolutionMethod(candidate),
      parentName: ""
    };
  }

  const scores = await Promise.all(
    parents.map((parent) => calculateCompatibility(candidate, parent))
  );

  scores.sort((left, right) => {
    return Number(right.direct) - Number(left.direct) ||
      right.score - left.score ||
      right.relationPriority - left.relationPriority ||
      left.parentName.localeCompare(right.parentName, game.i18n?.lang);
  });

  return scores[0];
}

async function tryAutoLink(graph = {}, snapshot = {}, node = null) {
  if (!node) return { manual: true, reason: "missingNode" };

  const plannedMethod = String(
    snapshot?.wizard?.plannedEvolutionMethod || ""
  ).trim();
  const plannedFromReference = cleanReference(
    snapshot?.wizard?.plannedFromReference || ""
  );

  if (plannedMethod && plannedFromReference) {
    const parent = findNode(graph, plannedFromReference);

    if (!parent || parent.id === node.id) {
      return {
        manual: true,
        reason: "plannedParentMissing",
        candidates: []
      };
    }

    if (
      plannedMethod === "slide" &&
      String(parent.stage ?? "") !== String(node.stage ?? snapshot?.stage ?? "")
    ) {
      return {
        manual: true,
        reason: "slideStageMismatch",
        candidates: []
      };
    }

    const compatibility = await calculateCompatibility(snapshot, parent);
    const method = inferEvolutionMethod({
      ...snapshot,
      specialForm: {
        ...(snapshot?.specialForm ?? {}),
        method: plannedMethod
      },
      evolutionCategory: plannedMethod === "dark"
        ? "dark"
        : snapshot?.evolutionCategory
    }, {
      relationType: plannedMethod
    });

    // A player/GM explicitly selected this source. Remove only older incoming
    // links created by the Planner, never hand-authored links from the GM.
    graph.edges = graph.edges.filter((edge) => {
      if (edge?.to !== node.id) return true;
      if (edge?.source !== "partnerFormPlannerRelease") return true;
      return edge?.from === parent.id && edge?.method === method;
    });

    const edge = {
      id: generateEdgeId(parent.id, node.id, method),
      from: parent.id,
      to: node.id,
      method,
      unlocked: true,
      source: "partnerFormPlannerRelease",
      planned: true,
      compatibility: compatibility.score
    };

    const existing = graph.edges.find((entry) => entry.id === edge.id);
    if (existing) Object.assign(existing, edge);
    else graph.edges.push(edge);

    return {
      manual: false,
      existing: Boolean(existing),
      edge,
      parent,
      compatibility
    };
  }

  const existingIncoming = graph.edges.find((edge) => edge?.to === node.id);
  if (existingIncoming) {
    return { manual: false, existing: true, edge: existingIncoming };
  }

  const targetIndex = STAGE_ORDER.indexOf(
    String(snapshot?.stage ?? "")
  );

  if (targetIndex <= 0) {
    return { manual: true, reason: "noPreviousStage" };
  }

  let candidates = [];

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    candidates = graph.nodes.filter((candidate) => {
      return candidate?.id !== node.id &&
        candidate?.hidden !== true &&
        String(candidate?.stage ?? "") === STAGE_ORDER[index];
    });

    if (candidates.length) break;
  }

  if (!candidates.length) {
    return { manual: true, reason: "missingParent", candidates: [] };
  }

  const uniqueCandidates = [];
  const uniqueIdentitySets = [];

  for (const candidate of candidates) {
    const identities = new Set(getIdentityKeys(candidate));

    if (!identities.size) {
      const fallback = normalizeIdentity(
        candidate?.sourceFormUuid || candidate?.actorUuid || candidate?.uuid
      );
      if (fallback) identities.add(fallback);
    }

    const duplicate = uniqueIdentitySets.some((known) => {
      return Array.from(identities).some((identity) => known.has(identity));
    });

    if (duplicate) continue;
    uniqueCandidates.push(candidate);
    uniqueIdentitySets.push(identities);
  }

  candidates = uniqueCandidates;

  const scored = await Promise.all(
    candidates.map(async (parent) => ({
      parent,
      compatibility: await calculateCompatibility(snapshot, parent)
    }))
  );

  scored.sort((left, right) => {
    return Number(right.compatibility.direct) - Number(left.compatibility.direct) ||
      right.compatibility.score - left.compatibility.score ||
      right.compatibility.relationPriority - left.compatibility.relationPriority ||
      String(left.compatibility.parentName).localeCompare(
        String(right.compatibility.parentName),
        game.i18n?.lang
      );
  });

  const [best, second] = scored;
  const categories = getSnapshotCategories(snapshot);

  if (categories.includes("jogress")) {
    return {
      manual: true,
      reason: "jogressNeedsParticipants",
      candidates: scored
    };
  }

  const uniqueDirect = Boolean(
    best?.compatibility?.direct &&
    (
      !second?.compatibility?.direct ||
      best.compatibility.score > second.compatibility.score ||
      best.compatibility.relationPriority > second.compatibility.relationPriority
    )
  );

  const clearlyBest = Boolean(
    best &&
    best.compatibility.score >= 80 &&
    (!second || best.compatibility.score - second.compatibility.score >= 8)
  );

  const safeSingle = scored.length === 1;

  if (!best || (!safeSingle && !uniqueDirect && !clearlyBest)) {
    return {
      manual: true,
      reason: scored.length > 1 ? "ambiguousParent" : "missingParent",
      candidates: scored
    };
  }

  const parent = best.parent;
  const method = best.compatibility.method || "normal";
  const edge = {
    id: generateEdgeId(parent.id, node.id, method),
    from: parent.id,
    to: node.id,
    method,
    unlocked: true,
    source: "partnerFormPlannerRelease",
    compatibility: best.compatibility.score
  };

  if (!graph.edges.some((entry) => entry.id === edge.id)) {
    graph.edges.push(edge);
  }

  return {
    manual: false,
    existing: false,
    edge,
    parent,
    compatibility: best.compatibility
  };
}

function updateFormWhitelist(unlockedForms = [], reference = "") {
  /*
   * An empty list means that the system is not using a form whitelist.
   * Starting one here would accidentally lock every previously available form.
   */
  if (!unlockedForms.length) return false;

  const wanted = cleanReference(reference);
  const index = unlockedForms.findIndex((entry) => {
    if (typeof entry === "string") return entry === wanted;

    return [
      entry?.uuid,
      entry?.actorUuid,
      entry?.formUuid,
      entry?.sourceFormUuid
    ].some((value) => cleanReference(value) === wanted);
  });

  if (index < 0) {
    unlockedForms.push({
      uuid: wanted,
      unlocked: true,
      source: "partnerFormPlannerRelease"
    });
    return true;
  }

  if (
    typeof unlockedForms[index] === "object" &&
    unlockedForms[index]?.unlocked === false
  ) {
    unlockedForms[index] = {
      ...unlockedForms[index],
      unlocked: true
    };
    return true;
  }

  return false;
}

/**
 * Release every planned future form whose Stage has already been unlocked.
 *
 * This operation is idempotent. Running it again repairs incomplete graph or
 * evolution-line data without duplicating forms, nodes, or links.
 */

function getReferenceStage(reference = "") {
  const clean = cleanReference(reference);
  const separator = clean.indexOf(":");
  if (separator <= 0) return "";

  const stage = clean.slice(0, separator);
  return STAGE_ORDER.includes(stage) ? stage : "";
}

function buildLineStageByReference(line = {}) {
  const result = new Map();

  for (const [stage, slot] of Object.entries(line?.forms ?? {})) {
    for (const form of getSlotForms(slot)) {
      const reference = getFormReference(form);
      if (reference && !result.has(reference)) {
        result.set(reference, stage);
      }
    }
  }

  return result;
}

function getDatabaseIdentity(record = null) {
  const system = record?.system ?? {};
  const names = system.names ?? {};

  return {
    sourceId: String(system.sourceId ?? "").trim(),
    databaseId: String(system.databaseId ?? record?.databaseId ?? "").trim(),
    sourceFormName: String(record?.name ?? system.species ?? "").trim(),
    species: String(system.species ?? names.original ?? record?.name ?? "").trim(),
    originalName: String(names.original ?? system.species ?? record?.name ?? "").trim(),
    dubName: String(names.dub ?? system.species ?? record?.name ?? "").trim(),
    aliases: Array.isArray(names.aliases) ? clone(names.aliases) : [],
    names: clone(names),
    stage: String(system.stage ?? "").trim(),
    stageValue: Number(system.stageValue ?? 2),
    size: String(system.size ?? "medium"),
    type: String(system.type ?? ""),
    attribute: String(system.attribute ?? "data"),
    field: String(system.field ?? "none"),
    family: String(system.family ?? "none"),
    group: String(system.group ?? ""),
    evolutionCategory: String(system.evolutionCategory ?? "normal"),
    specialCategories: Array.isArray(system.specialCategories)
      ? clone(system.specialCategories)
      : [],
    primarySpecialCategory: String(system.primarySpecialCategory ?? ""),
    isSpecialForm: Boolean(system.isSpecialForm),
    specialForm: clone(system.specialForm ?? {})
  };
}

async function repairSingleSnapshotMetadata({
  snapshot = {},
  reference = "",
  lineStage = "",
  partnerActor = null
} = {}) {
  const referenceStage = getReferenceStage(reference);

  /*
   * Prefer the snapshot/database identity. The persistent partner Actor may
   * currently represent a higher Stage, so it must never fill identity or
   * portrait fields for an older snapshot.
   */
  const databaseRecord = await resolveDatabaseRecord({
    ...snapshot,
    sourceFormUuid: reference,
    stage: referenceStage || snapshot?.stage || lineStage || ""
  }, {
    /* The persistent partner currently represents another form and must not
       become the identity fallback for an old planned snapshot. */
    ignoreActorReference: cleanReference(reference) === partnerActor?.uuid
  });

  const identity = databaseRecord
    ? getDatabaseIdentity(databaseRecord)
    : null;

  const authoritativeStage =
    identity?.stage ||
    referenceStage ||
    String(snapshot?.stage ?? "").trim() ||
    lineStage ||
    "child";

  const identitySource = identity
    ? {
        ...snapshot,
        ...identity,
        stage: authoritativeStage,
        system: {
          ...(snapshot?.system ?? {}),
          ...databaseRecord.system,
          stage: authoritativeStage
        }
      }
    : {
        ...snapshot,
        stage: authoritativeStage
      };

  const portraitCandidates = resolveDigimonPortraitSources(identitySource, {
    manualPortrait: snapshot?.portraitImg ?? "",
    manualPortraitSelected: Boolean(
      snapshot?.wizard?.portraitManuallySelected ||
      snapshot?.wizard?.portraitSource === "manual"
    )
  });

  const portraitImg = portraitCandidates[0] ||
    "icons/svg/mystery-man.svg";

  const stableReference = Boolean(
    snapshot?.wizard?.preparedFutureForm &&
    cleanReference(reference) === partnerActor?.uuid
  )
    ? cleanReference(
        identity?.databaseId ||
        (identity?.sourceId
          ? `${authoritativeStage}:${identity.sourceId}`
          : reference)
      )
    : reference;

  const next = {
    ...snapshot,
    ...(identity ?? {}),
    sourceFormUuid: stableReference,
    stage: authoritativeStage,
    img: portraitImg,
    portraitImg,
    tokenImg: String(
      snapshot?.tokenImg ||
      databaseRecord?.system?.images?.tokenImagePath ||
      databaseRecord?.system?.images?.token ||
      databaseRecord?.prototypeToken?.texture?.src ||
      portraitImg
    ).trim(),
    imageFallbacks: portraitCandidates.slice(1).join("|"),
    wizard: {
      ...(snapshot?.wizard ?? {}),
      identityRepairVersion: 4,
      identityRepairedAt:
        snapshot?.wizard?.identityRepairedAt ||
        new Date().toISOString()
    },
    updatedAt: snapshot?.updatedAt || new Date().toISOString()
  };

  return next;
}

export async function repairPlannedPartnerFormData(sourceActor) {
  const result = {
    changed: false,
    repairedSnapshots: 0,
    repairedGraphNodes: 0,
    repairedLineForms: 0
  };

  const pair = await resolvePartnerPair(sourceActor);
  if (!pair) return result;

  const { partnerActor } = pair;
  const originalSnapshots = clone(
    partnerActor.system?.evolution?.formSnapshots ?? {}
  );
  const snapshots = clone(originalSnapshots);
  const graph = clone(partnerActor.system?.evolutionGraph ?? {});
  const line = clone(partnerActor.system?.evolutionLine ?? {});

  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  graph.edges = Array.isArray(graph.edges) ? graph.edges : [];
  line.forms ??= {};

  const lineStageByReference = buildLineStageByReference(line);

  for (const [key, snapshot] of Object.entries(snapshots)) {
    if (!snapshot || typeof snapshot !== "object") continue;

    const reference = getFormReference(snapshot);
    if (!reference) continue;

    const repaired = await repairSingleSnapshotMetadata({
      snapshot,
      reference,
      lineStage: lineStageByReference.get(reference) ?? "",
      partnerActor
    });

    const before = JSON.stringify(snapshot);
    const after = JSON.stringify(repaired);

    if (before !== after) {
      snapshots[key] = repaired;
      result.repairedSnapshots += 1;
      result.changed = true;
    }

    const repairedReference = getFormReference(repaired);
    const existingNode = findNode(graph, reference);
    if (existingNode) {
      if (repairedReference !== reference) {
        const oldNodeId = existingNode.id;
        graph.nodes = graph.nodes.filter((entry) => entry.id !== oldNodeId);
        graph.edges = graph.edges.filter((edge) => {
          return edge.from !== oldNodeId && edge.to !== oldNodeId;
        });
      }

      upsertGraphNode(graph, repaired);
      result.repairedGraphNodes += 1;
      result.changed = true;
    }

    if (lineContains(line, reference)) {
      removeReferenceFromEvolutionLine(line, reference);
      upsertLineForm(line, repaired);
      result.repairedLineForms += 1;
      result.changed = true;
    }
  }

  if (!result.changed) return result;

  await partnerActor.update({
    "system.evolution.formSnapshots": snapshots,
    "system.evolutionGraph.nodes": graph.nodes,
    "system.evolutionGraph.edges": graph.edges,
    "system.evolutionGraph.legacyImported": Boolean(graph.legacyImported),
    "system.evolutionGraph.removedActorUuids": Array.isArray(graph.removedActorUuids)
      ? graph.removedActorUuids
      : [],
    "system.evolutionGraph.removedEdgeIds": Array.isArray(graph.removedEdgeIds)
      ? graph.removedEdgeIds
      : [],
    "system.evolutionLine.forms": line.forms
  });

  return result;
}

export async function releaseUnlockedPlannedPartnerForms(
  sourceActor,
  { formReferences = [] } = {}
) {
  const result = {
    released: [],
    repaired: [],
    alreadyReleased: [],
    blocked: [],
    manualLinks: [],
    autoLinked: []
  };

  if (!game.user?.isGM) {
    ui.notifications.warn(
      localize(
        "DDA.PartnerFormPlanner.Release.GMOnly",
        "Only the GM can release planned forms."
      )
    );
    return result;
  }

  await repairPlannedPartnerFormData(sourceActor);

  const pair = await resolvePartnerPair(sourceActor);

  if (!pair) {
    ui.notifications.warn(
      localize(
        "DDA.PartnerFormPlanner.Unavailable",
        "A linked Tamer and partner could not be found."
      )
    );
    return result;
  }

  const { tamerActor, partnerActor } = pair;
  const unlockedStages = getUnlockedStages(tamerActor);
  const wanted = new Set(
    (Array.isArray(formReferences) ? formReferences : [])
      .map(cleanReference)
      .filter(Boolean)
  );

  const snapshots = clone(
    partnerActor.system?.evolution?.formSnapshots ?? {}
  );

  const line = clone(
    partnerActor.system?.evolutionLine ?? {}
  );
  line.forms ??= {};

  const graph = clone(
    partnerActor.system?.evolutionGraph ?? {}
  );
  graph.layout ??= { mode: "solar" };
  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  graph.edges = Array.isArray(graph.edges) ? graph.edges : [];

  importLegacyLineIntoGraph(
    graph,
    line,
    partnerActor
  );

  const unlockedForms = clone(
    Array.isArray(tamerActor.system?.partner?.unlockedForms)
      ? tamerActor.system.partner.unlockedForms
      : []
  );

  const usesWhitelist = unlockedForms.length > 0;
  let whitelistChanged = false;
  let partnerChanged = false;

  for (const [key, snapshot] of Object.entries(snapshots)) {
    if (!snapshot || typeof snapshot !== "object") continue;
    if (!snapshot.wizard?.preparedFutureForm) continue;

    const reference = getFormReference(snapshot);
    if (!reference) continue;
    if (wanted.size && !wanted.has(reference)) continue;

    const name = snapshotName(snapshot);
    const stage = String(snapshot.stage || "child").trim() || "child";

    if (!unlockedStages[stage]) {
      result.blocked.push({
        reference,
        name,
        stage,
        reason: "stageLocked"
      });
      continue;
    }

    const wasInGraph = Boolean(findNode(graph, reference));
    const wasInLine = lineContains(line, reference);
    const wasFlagged = Boolean(snapshot.wizard?.releasedToEvolution);
    const repairedImages = await repairSnapshotImages(snapshot);
    const workingSnapshot = {
      ...snapshot,
      ...repairedImages
    };

    const node = upsertGraphNode(graph, workingSnapshot);
    upsertLineForm(line, workingSnapshot);

    const link = await tryAutoLink(graph, workingSnapshot, node);

    if (link.manual) {
      result.manualLinks.push({
        reference,
        name,
        stage,
        reason: link.reason,
        candidates: (link.candidates ?? []).map((entry) => ({
          parent: entry.compatibility?.parentName || entry.parent?.name || "",
          score: entry.compatibility?.score ?? 0,
          direct: Boolean(entry.compatibility?.direct),
          method: entry.compatibility?.method || "normal"
        }))
      });
    } else if (!link.existing) {
      result.autoLinked.push({
        reference,
        name,
        stage,
        from: String(
          link.parent?.displayName ||
          link.parent?.name ||
          ""
        ),
        edgeId: link.edge?.id || "",
        method: link.edge?.method || "normal",
        compatibility: link.compatibility?.score ?? null
      });
    }

    if (usesWhitelist) {
      whitelistChanged = updateFormWhitelist(
        unlockedForms,
        reference
      ) || whitelistChanged;
    }

    snapshots[key] = {
      ...workingSnapshot,
      wizard: {
        ...(workingSnapshot.wizard ?? {}),
        preparedFutureForm: true,
        releasedToEvolution: true,
        releasedAt:
          workingSnapshot.wizard?.releasedAt ||
          new Date().toISOString(),
        releasedBy: game.user?.id || ""
      },
      updatedAt: new Date().toISOString()
    };

    partnerChanged = true;

    const entry = { reference, name, stage };

    if (wasInGraph && wasInLine && wasFlagged) {
      result.alreadyReleased.push(entry);
    } else if (wasInGraph || wasInLine || wasFlagged) {
      result.repaired.push(entry);
    } else {
      result.released.push(entry);
    }
  }

  if (partnerChanged) {
    await partnerActor.update({
      "system.evolution.formSnapshots": snapshots,
      "system.evolutionGraph": graph,
      "system.evolutionLine": line
    });
  }

  if (usesWhitelist && whitelistChanged) {
    await tamerActor.update({
      "system.partner.unlockedForms": unlockedForms
    });
  }

  partnerActor.sheet?.render(true);
  tamerActor.sheet?.render(false);

  if (result.manualLinks.length) {
    console.groupCollapsed(
      `DDA | ${result.manualLinks.length} planned form link(s) still need review`
    );
    console.table(result.manualLinks.flatMap((entry) => {
      if (!entry.candidates?.length) return [{
        form: entry.name,
        stage: entry.stage,
        reason: entry.reason,
        parent: "",
        score: "",
        method: ""
      }];

      return entry.candidates.map((candidate) => ({
        form: entry.name,
        stage: entry.stage,
        reason: entry.reason,
        parent: candidate.parent,
        score: `${candidate.score}%`,
        method: candidate.method,
        direct: candidate.direct
      }));
    }));
    console.groupEnd();
  }

  return result;
}

function removeReferenceFromEvolutionLine(line = {}, reference = "") {
  const wanted = cleanReference(reference);
  if (!wanted) return false;

  line.forms ??= {};
  let changed = false;

  for (const [stage, oldSlot] of Object.entries(line.forms)) {
    const forms = getSlotForms(oldSlot);
    const remaining = forms.filter((form) => {
      return getFormReference(form) !== wanted;
    });

    if (remaining.length === forms.length) continue;
    changed = true;

    if (!remaining.length) {
      /*
       * Foundry recursively merges object updates. Keep an explicit empty slot
       * instead of deleting the Stage key locally, otherwise the old slot can
       * survive in the persisted document and reappear in the Planner.
       */
      line.forms[stage] = {
        name: "",
        displayName: "",
        species: "",
        uuid: "",
        actorUuid: "",
        stage,
        img: "",
        portraitImg: "",
        tokenImg: "",
        forms: []
      };
      continue;
    }

    const oldObject = oldSlot &&
      typeof oldSlot === "object" &&
      !Array.isArray(oldSlot)
        ? clone(oldSlot)
        : {};

    const primary = remaining[0];

    line.forms[stage] = {
      ...oldObject,
      name: String(primary.name || primary.species || ""),
      displayName: String(
        primary.displayName ||
        primary.species ||
        primary.name ||
        ""
      ),
      species: String(
        primary.species ||
        primary.displayName ||
        primary.name ||
        ""
      ),
      uuid: getFormReference(primary),
      actorUuid: cleanReference(
        primary.actorUuid ||
        primary.uuid ||
        primary.sourceFormUuid
      ),
      stage: String(primary.stage || stage),
      img: String(primary.img || primary.portraitImg || ""),
      portraitImg: String(primary.portraitImg || primary.img || ""),
      tokenImg: String(primary.tokenImg || primary.img || ""),
      forms: remaining
    };
  }

  return changed;
}

function removeReferenceFromUnlockedForms(unlockedForms = [], reference = "") {
  const wanted = cleanReference(reference);
  if (!wanted || !Array.isArray(unlockedForms)) return unlockedForms;

  return unlockedForms.filter((entry) => {
    if (typeof entry === "string") return cleanReference(entry) !== wanted;

    return ![
      entry?.uuid,
      entry?.actorUuid,
      entry?.formUuid,
      entry?.sourceFormUuid
    ].some((value) => cleanReference(value) === wanted);
  });
}

export async function removePlannedPartnerForm(
  sourceActor,
  formReference = ""
) {
  const result = {
    removed: false,
    removedFromGraph: false,
    removedFromLine: false,
    removedFromWhitelist: false,
    reason: ""
  };

  const reference = cleanReference(formReference);
  if (!reference) {
    result.reason = "missingReference";
    return result;
  }

  const pair = await resolvePartnerPair(sourceActor);
  if (!pair) {
    result.reason = "missingPair";
    return result;
  }

  const { tamerActor, partnerActor } = pair;
  const canEdit = Boolean(
    game.user?.isGM ||
    tamerActor?.isOwner ||
    partnerActor?.isOwner
  );

  if (!canEdit) {
    result.reason = "permission";
    return result;
  }

  const currentReferences = new Set([
    partnerActor.uuid,
    partnerActor.system?.evolution?.currentFormUuid,
    partnerActor.system?.evolution?.sourceFormUuid,
    tamerActor.system?.partner?.currentFormUuid
  ]
    .map(cleanReference)
    .filter(Boolean));

  if (currentReferences.has(reference)) {
    result.reason = "currentForm";
    return result;
  }

  const snapshots = clone(
    partnerActor.system?.evolution?.formSnapshots ?? {}
  );

  const targetEntry = Object.entries(snapshots).find(([, snapshot]) => {
    return getFormReference(snapshot) === reference;
  });

  if (!targetEntry) {
    result.reason = "snapshotMissing";
    return result;
  }

  const [, snapshot] = targetEntry;

  if (!snapshot?.wizard?.preparedFutureForm) {
    result.reason = "notPlanned";
    return result;
  }

  const targetDatabaseId = normalizeIdentity(snapshot?.databaseId);
  const targetSourceId = normalizeIdentity(
    snapshot?.sourceId || snapshot?.names?.canonical
  );
  const targetStage = String(snapshot?.stage ?? "").trim();

  const samePlannedIdentity = (candidate = {}) => {
    if (!candidate?.wizard?.preparedFutureForm) return false;
    if (getFormReference(candidate) === reference) return true;

    const candidateStage = String(candidate?.stage ?? "").trim();
    if (targetStage && candidateStage && targetStage !== candidateStage) {
      return false;
    }

    const candidateDatabaseId = normalizeIdentity(candidate?.databaseId);
    if (targetDatabaseId && candidateDatabaseId) {
      return targetDatabaseId === candidateDatabaseId;
    }

    const candidateSourceId = normalizeIdentity(
      candidate?.sourceId || candidate?.names?.canonical
    );

    return Boolean(
      targetSourceId &&
      candidateSourceId &&
      targetSourceId === candidateSourceId
    );
  };

  const entriesToRemove = Object.entries(snapshots).filter(([, candidate]) => {
    return samePlannedIdentity(candidate);
  });
  const referencesToRemove = new Set(
    entriesToRemove
      .map(([, candidate]) => getFormReference(candidate))
      .filter(Boolean)
  );
  referencesToRemove.add(reference);

  if ([...referencesToRemove].some((entry) => currentReferences.has(entry))) {
    result.reason = "currentForm";
    return result;
  }

  for (const [snapshotKey] of entriesToRemove) {
    delete snapshots[snapshotKey];
  }

  result.removedSnapshotCount = entriesToRemove.length;

  const graph = clone(
    partnerActor.system?.evolutionGraph ?? {}
  );
  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  graph.edges = Array.isArray(graph.edges) ? graph.edges : [];

  const nodeIds = new Set(
    graph.nodes
      .filter((node) => referencesToRemove.has(getNodeReference(node)))
      .map((node) => node.id)
      .filter(Boolean)
  );

  if (nodeIds.size) {
    graph.nodes = graph.nodes.filter((node) => !nodeIds.has(node.id));
    graph.edges = graph.edges.filter((edge) => {
      return !nodeIds.has(edge.from) && !nodeIds.has(edge.to);
    });
    result.removedFromGraph = true;
  }

  graph.legacyImported = true;
  graph.removedActorUuids = Array.from(new Set([
    ...(Array.isArray(graph.removedActorUuids)
      ? graph.removedActorUuids
      : []),
    ...referencesToRemove
  ]));

  const originalLine = clone(
    partnerActor.system?.evolutionLine ?? {}
  );
  const line = clone(originalLine);
  result.removedFromLine = false;
  for (const removedReference of referencesToRemove) {
    result.removedFromLine = removeReferenceFromEvolutionLine(
      line,
      removedReference
    ) || result.removedFromLine;
  }

  const previousUnlockedForms = Array.isArray(
    tamerActor.system?.partner?.unlockedForms
  )
    ? clone(tamerActor.system.partner.unlockedForms)
    : [];

  let nextUnlockedForms = previousUnlockedForms;
  for (const removedReference of referencesToRemove) {
    nextUnlockedForms = removeReferenceFromUnlockedForms(
      nextUnlockedForms,
      removedReference
    );
  }

  result.removedFromWhitelist =
    nextUnlockedForms.length !== previousUnlockedForms.length;

  /*
   * Foundry recursively merges object updates. Sending a smaller
   * formSnapshots object therefore does not delete keys that are absent from
   * the payload. Use the native -= deletion markers for every snapshot key,
   * then replace the array-backed graph/line structures normally.
   *
   * Snapshot keys produced by the wizard are sanitized identifiers, so they
   * are safe property segments even when sourceFormUuid is a Compendium UUID.
   */
  const snapshotDeletionUpdate = Object.fromEntries(
    entriesToRemove.map(([snapshotKey]) => [
      `system.evolution.formSnapshots.-=${snapshotKey}`,
      null
    ])
  );

  if (Object.keys(snapshotDeletionUpdate).length) {
    await partnerActor.update(snapshotDeletionUpdate);
  }

  await partnerActor.update({
    "system.evolutionGraph": {
      ...graph,
      nodes: graph.nodes,
      edges: graph.edges,
      legacyImported: true,
      removedActorUuids: graph.removedActorUuids,
      removedEdgeIds: Array.isArray(graph.removedEdgeIds)
        ? graph.removedEdgeIds
        : []
    },
    "system.evolutionLine": {
      ...line,
      forms: line.forms ?? {}
    }
  });

  if (result.removedFromWhitelist) {
    await tamerActor.update({
      "system.partner.unlockedForms": nextUnlockedForms
    });
  }

  if (partnerActor.sheet?.rendered) {
    partnerActor.sheet.render(false);
  }

  if (tamerActor.sheet?.rendered) {
    tamerActor.sheet.render(false);
  }

  const remainingSnapshots = Object.values(
    partnerActor.system?.evolution?.formSnapshots ?? {}
  );
  const removalPersisted = !remainingSnapshots.some((candidate) => {
    return referencesToRemove.has(getFormReference(candidate));
  });

  if (!removalPersisted) {
    result.reason = "persistenceFailed";
    return result;
  }

  result.removed = true;
  result.snapshot = snapshot;
  return result;
}
