import {
  getDdaPortraitPath
} from "../data/dda-portrait-and-manual-digimon-data.js";
import {
  DDA_STATIC_PORTRAIT_PATHS_BY_KEY
} from "../data/digimon-static-portrait-manifest.generated.js";
import {
  DDA_STATIC_TOKEN_PATHS_BY_KEY
} from "../data/digimon-static-token-manifest.generated.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";
const DDA_DIGIMON_ASSET_ROOT = `systems/${DDA_SYSTEM_ID}/assets/digimon/`;
const PLACEHOLDER_IMAGE = "icons/svg/mystery-man.svg";

const STAGE_ALIASES = Object.freeze({
  baby1: ["baby1", "babyi", "fresh", "start"],
  baby2: ["baby2", "babyii", "intraining", "training"],
  child: ["child", "rookie"],
  adult: ["adult", "champion"],
  perfect: ["perfect", "ultimatelevel"],
  ultimate: ["ultimate", "mega"],
  ultimateplus: ["ultimateplus", "superultimate", "ultra"]
});

export function normalizeDigimonImageKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/x[-_\s]*antibody/g, "xantibody")
    .replace(/baby\s*i{1,2}/g, (match) => match.includes("ii") ? "babyii" : "babyi")
    .replace(/lv\s*2/g, "lv2")
    .replace(/lv\s*1/g, "lv1")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function cleanPath(value = "") {
  return String(value ?? "").trim();
}

function pathOnly(value = "") {
  return cleanPath(value).split(/[?#]/, 1)[0];
}

function fileStem(value = "") {
  return pathOnly(value)
    .split("/")
    .at(-1)
    ?.replace(/\.[^.]+$/, "") ?? "";
}

export function isPlaceholderPortraitPath(value = "") {
  const path = cleanPath(value);
  return !path || path.endsWith("mystery-man.svg");
}

export function isDdaDigimonAssetPath(value = "") {
  return pathOnly(value).toLowerCase().startsWith(
    DDA_DIGIMON_ASSET_ROOT.toLowerCase()
  );
}

export function isCustomPortraitPath(value = "") {
  const path = cleanPath(value);
  if (isPlaceholderPortraitPath(path)) return false;
  if (path.startsWith("icons/")) return false;
  return !isDdaDigimonAssetPath(path);
}

export function isVideoPortraitPath(value = "") {
  return /\.(?:webm|mp4|m4v|ogg|ogv)(?:$|[?#])/i.test(cleanPath(value));
}

export function isStaticPortraitPath(value = "") {
  return /\.(?:webp|png|jpe?g|gif|svg)(?:$|[?#])/i.test(cleanPath(value));
}

function isSupportedDdaDigimonAssetPath(value = "") {
  const raw = pathOnly(value);
  if (!isDdaDigimonAssetPath(raw)) return true;

  /*
   * The distributed V2 asset library stores renderable Digimon artwork only
   * in assets/digimon/portraits and assets/digimon/tokens. Older generated
   * records still reference stage folders such as adult/ and child/, but
   * those directories are not shipped and would produce a browser 404 before
   * the image fallback could run.
   */
  return /\/assets\/digimon\/(?:portraits|tokens)\//i.test(raw);
}

function validDeclaredPath(value = "", { allowVideo = false } = {}) {
  const raw = cleanPath(value);
  if (isPlaceholderPortraitPath(raw)) return "";
  if (!isSupportedDdaDigimonAssetPath(raw)) return "";
  if (isStaticPortraitPath(raw)) return raw;
  if (allowVideo && isVideoPortraitPath(raw)) return raw;
  return "";
}

function recordSystem(record = {}) {
  return record?.system ?? {};
}

function recordNames(record = {}) {
  const system = recordSystem(record);
  return system.names ?? record?.names ?? {};
}

function getRecordFlag(record = {}, key = "") {
  if (!record || !key) return undefined;

  try {
    if (typeof record.getFlag === "function") {
      return record.getFlag(DDA_SYSTEM_ID, key);
    }
  } catch (_error) {
    // Raw database records do not implement getFlag.
  }

  return record?.flags?.[DDA_SYSTEM_ID]?.[key];
}

export function getDigimonPortraitIdentity(record = {}) {
  const system = recordSystem(record);
  const names = recordNames(record);
  const databaseId = String(
    system.databaseId ?? record?.databaseId ?? ""
  ).trim();

  let stage = String(
    system.stage ?? record?.stage ?? ""
  ).trim();

  if (!stage && databaseId.includes(":")) {
    stage = databaseId.split(":", 1)[0];
  }

  const aliases = Array.from(new Set([
    ...(Array.isArray(record?.aliases) ? record.aliases : []),
    ...(Array.isArray(names?.aliases) ? names.aliases : [])
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)));

  return {
    sourceId: String(
      system.sourceId ?? record?.sourceId ?? names.canonical ?? ""
    ).trim(),
    databaseId,
    species: String(
      system.species ??
      record?.species ??
      names.original ??
      record?.sourceFormName ??
      record?.displayName ??
      record?.name ??
      ""
    ).trim(),
    name: String(
      names.dub ??
      record?.dubName ??
      record?.sourceFormName ??
      record?.name ??
      ""
    ).trim(),
    originalName: String(
      names.original ?? record?.originalName ?? record?.species ?? ""
    ).trim(),
    dubName: String(
      names.dub ?? record?.dubName ?? record?.name ?? ""
    ).trim(),
    aliases,
    stage
  };
}

function identityKeys(identity = {}) {
  const raw = [
    identity.sourceId,
    identity.databaseId,
    identity.databaseId?.includes(":")
      ? identity.databaseId.split(":").slice(1).join(":")
      : "",
    identity.species,
    identity.name,
    identity.originalName,
    identity.dubName,
    ...(identity.aliases ?? [])
  ];

  const normalized = raw
    .map(normalizeDigimonImageKey)
    .filter(Boolean);

  const aliases = [];
  for (const key of normalized) {
    if (key.endsWith("xantibody")) {
      aliases.push(key.replace(/xantibody$/, "x"));
    }

    if (key.endsWith("mode")) {
      aliases.push(key.slice(0, -4));
    }
  }

  return Array.from(new Set([
    ...normalized,
    ...aliases
  ].filter(Boolean)));
}

function stageLookupKeys(stage = "") {
  const normalized = normalizeDigimonImageKey(stage);
  return Array.from(new Set([
    normalized,
    ...(STAGE_ALIASES[normalized] ?? [])
  ].filter(Boolean)));
}

function identitiesCompatible(primary = {}, fallback = {}) {
  const primaryStage = normalizeDigimonImageKey(primary.stage);
  const fallbackStage = normalizeDigimonImageKey(fallback.stage);

  if (primaryStage && fallbackStage && primaryStage !== fallbackStage) {
    return false;
  }

  const primaryKeys = new Set(identityKeys(primary));
  const fallbackKeys = identityKeys(fallback);

  if (!primaryKeys.size || !fallbackKeys.length) return false;
  return fallbackKeys.some((key) => primaryKeys.has(key));
}

function pathMatchesIdentity(path = "", identity = {}) {
  const raw = cleanPath(path);
  if (!raw) return false;
  if (isCustomPortraitPath(raw)) return true;

  const stem = normalizeDigimonImageKey(fileStem(raw));
  if (!stem) return false;

  const keys = identityKeys(identity);
  const matchesName = keys.some((key) => {
    return key === stem ||
      (key.length >= 5 && stem.includes(key)) ||
      (stem.length >= 5 && key.includes(stem));
  });

  if (!matchesName) return false;

  const stage = normalizeDigimonImageKey(identity.stage);
  if (!stage) return true;

  const match = pathOnly(raw).match(/\/assets\/digimon\/([^/]+)\//i);
  if (!match) return true;

  const folder = normalizeDigimonImageKey(match[1]);
  if (["portraits", "tokens"].includes(folder)) return true;

  return stageLookupKeys(stage).includes(folder);
}

function manualCandidates(record = {}, { manualPortrait = "", manualPortraitSelected = false } = {}) {
  const system = recordSystem(record);
  const wizard = record?.wizard ?? system?.wizard ?? {};
  const explicitManual = Boolean(
    manualPortraitSelected ||
    wizard?.portraitManuallySelected ||
    wizard?.portraitSource === "manual" ||
    getRecordFlag(record, "digivicePortraitManual")
  );

  const candidates = [];
  const passedManual = cleanPath(manualPortrait);

  if (passedManual && (explicitManual || isCustomPortraitPath(passedManual))) {
    candidates.push(passedManual);
  }

  const stored = [
    record?.portraitImg,
    system?.evolution?.portraitImg,
    getRecordFlag(record, "digivicePortrait"),
    record?.img
  ];

  for (const candidate of stored) {
    if (explicitManual || isCustomPortraitPath(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates.map(cleanPath).filter(Boolean);
}

function mappedPortrait(identity = {}) {
  return cleanPath(getDdaPortraitPath({
    key: identity.sourceId || identity.databaseId,
    name: identity.dubName || identity.name,
    species: identity.species || identity.originalName,
    aliases: identity.aliases
  }));
}

function collectActualStaticCandidates(manifest = {}, identity = {}) {
  const keys = identityKeys(identity);
  const stages = stageLookupKeys(identity.stage);
  const stageNamed = [];
  const exactIdentity = [];
  const generic = [];

  for (const key of keys) {
    for (const stage of stages) {
      for (const compound of [
        `${key}${stage}`,
        `${stage}${key}`
      ]) {
        const paths = manifest?.[compound];
        if (Array.isArray(paths)) stageNamed.push(...paths);
      }
    }
  }

  for (const key of keys) {
    const paths = manifest?.[key];
    if (!Array.isArray(paths) || !paths.length) continue;

    const exactPaths = paths.filter((path) => {
      return normalizeDigimonImageKey(fileStem(path)) === key;
    });

    if (exactPaths.length) {
      exactIdentity.push(...exactPaths);
      continue;
    }

    if (!stages.length || paths.length === 1) {
      generic.push(...paths);
      continue;
    }

    for (const path of paths) {
      const stem = normalizeDigimonImageKey(fileStem(path));
      if (stages.some((stage) => stem.includes(stage))) {
        generic.push(path);
      }
    }
  }

  return [
    ...stageNamed,
    ...exactIdentity,
    ...generic
  ];
}

function actualStaticCandidates(identity = {}) {
  /*
   * Both manifests are generated from files which actually exist in the
   * release. Portraits are preferred; tokens are a valid static fallback for
   * Digimon without a dedicated still portrait.
   */
  return Array.from(new Set([
    ...collectActualStaticCandidates(
      DDA_STATIC_PORTRAIT_PATHS_BY_KEY,
      identity
    ),
    ...collectActualStaticCandidates(
      DDA_STATIC_TOKEN_PATHS_BY_KEY,
      identity
    )
  ]
    .map((value) => validDeclaredPath(value))
    .filter(Boolean)));
}

function declaredCandidates(record = {}, identity = {}, { allowVideo = false } = {}) {
  const system = recordSystem(record);
  const values = [
    system?.images?.portraitImagePath,
    system?.images?.portrait,
    system?.images?.localImagePath,
    record?.img,
    system?.evolution?.portraitImg,
    record?.portraitImg,
    getRecordFlag(record, "digivicePortrait"),
    system?.images?.tokenImagePath,
    system?.images?.token,
    record?.tokenImg,
    system?.evolution?.tokenImg,
    record?.prototypeToken?.texture?.src
  ];

  return values
    .map((value) => validDeclaredPath(value, { allowVideo }))
    .filter((value) => value && pathMatchesIdentity(value, identity));
}

export function resolveDigimonPortraitSources(
  primaryRecord = {},
  {
    fallbackRecords = [],
    manualPortrait = "",
    manualPortraitSelected = false,
    allowVideo = false
  } = {}
) {
  const primaryIdentity = getDigimonPortraitIdentity(primaryRecord);
  const compatibleFallbacks = (Array.isArray(fallbackRecords)
    ? fallbackRecords
    : [])
    .filter(Boolean)
    .filter((record) => identitiesCompatible(
      primaryIdentity,
      getDigimonPortraitIdentity(record)
    ));

  const records = [primaryRecord, ...compatibleFallbacks].filter(Boolean);
  const candidates = [];

  for (const record of records) {
    candidates.push(...manualCandidates(record, {
      manualPortrait,
      manualPortraitSelected
    }));
  }

  for (const record of records) {
    const identity = getDigimonPortraitIdentity(record);
    const mapped = mappedPortrait(identity);
    const staticCandidates = actualStaticCandidates(identity);

    if (allowVideo) {
      candidates.push(mapped);
      candidates.push(...staticCandidates);
    } else {
      candidates.push(...staticCandidates);
      if (mapped && !isVideoPortraitPath(mapped)) candidates.push(mapped);
    }
  }

  for (const record of records) {
    candidates.push(...declaredCandidates(
      record,
      getDigimonPortraitIdentity(record),
      { allowVideo }
    ));
  }

  return Array.from(new Set([
    ...candidates
      .map((value) => validDeclaredPath(value, { allowVideo }))
      .filter(Boolean),
    PLACEHOLDER_IMAGE
  ]));
}

export function resolveDigimonPortrait(record = {}, options = {}) {
  return resolveDigimonPortraitSources(record, options)[0] || PLACEHOLDER_IMAGE;
}

export function shouldTreatStoredPortraitAsManual(record = {}, path = "") {
  const clean = cleanPath(path);
  if (!clean) return false;

  return Boolean(
    getRecordFlag(record, "digivicePortraitManual") ||
    record?.wizard?.portraitManuallySelected ||
    record?.wizard?.portraitSource === "manual" ||
    isCustomPortraitPath(clean)
  );
}

export function getPortraitPlaceholder() {
  return PLACEHOLDER_IMAGE;
}
