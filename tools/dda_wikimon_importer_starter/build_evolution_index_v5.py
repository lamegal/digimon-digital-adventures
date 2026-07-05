import csv
import json
import re
from pathlib import Path
from collections import Counter, defaultdict


INPUT_PATH = Path("output/all_digimon_complete.json")
OUTPUT_PATH = Path("output/all_digimon_with_evolution_index_v5.json")
REPORT_PATH = Path("output/evolution_index_report_v5.json")
UNRESOLVED_PATH = Path("output/evolution_index_unresolved_v5.csv")

OVERRIDE_PATHS = [
    Path("output/database_overrides_v3.json"),
    Path("database_overrides_v3.json"),
    Path("output/database_overrides_v2.json"),
    Path("database_overrides_v2.json"),
    Path("output/database_overrides_v1.json"),
    Path("database_overrides_v1.json"),
]


STAGE_ORDER = {
    "baby1": 0,
    "baby2": 1,
    "child": 2,
    "adult": 3,
    "perfect": 4,
    "ultimate": 5,
    "ultimatePlus": 6,
}

ORDER_STAGE = {value: key for key, value in STAGE_ORDER.items()}

TRUSTED_SOURCE_TYPES = {"anime", "game", "vpet", "toy", "profile", "reference"}
LOW_CONFIDENCE_SOURCE_TYPES = {"unknown", "flat", ""}

NOISE_PATTERNS = [
    r"\bany\b",
    r"\bcard game\b",
    r"\bdigimon card game\b",
    r"\bdigimon from\b",
    r"\bfrom the\b",
    r"\battribute\b",
    r"\bspecies data\b",
    r"\bdata\b",
    r"\bdigitama\b",
    r"\bdigi-egg\b",
    r"\bdigimental\b",
    r"\bhuman spirit\b",
    r"\bbeast spirit\b",
    r"\bspirit of\b",
    r"\bhybrid spirit\b",
    r"\boption card\b",
    r"\btamer card\b",
    r"\bpartner digimon\b",
    r"\bcertain\b",
    r"\bdigimon pendulum\b",
    r"\bsystem omega\b",
    r"\bbrave snatcher\b",
    r"\bhell's field\b",
    r"\bchibick sword\b",
    r"\bda\d+\b",
    r"\blv\.\d+\b",
    r"\blevel \d+\b",
    r"\byuki\b",
    r"\bkanbara\b",
    r"\bminamoto\b",
    r"\borimoto\b",
    r"\bhimi\b",
    r"\btachikawa\b",
    r"\btakenouchi\b",
    r"\byagami\b",
    r"\btakahashi\b",
    r"\binada\b",
]


def norm(value):
    return str(value or "").strip()


def compact(value):
    return re.sub(r"[^a-z0-9]+", "", norm(value).lower())


def keyify(value):
    text = norm(value)
    text = text.replace("’", "'")
    text = re.sub(r"[:：]", " ", text)
    text = re.sub(r"[()]", " ", text)
    text = re.sub(r"[-/]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return compact(text)


def pick_existing(paths):
    for path in paths:
        if path.exists():
            return path
    return None


def load_indexer_config():
    path = pick_existing(OVERRIDE_PATHS)
    if not path:
        return {}, None

    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("indexer") or {}, path


def actor_key(actor):
    system = actor.get("system", {})
    source_id = norm(system.get("sourceId"))
    if source_id:
        return keyify(source_id)
    species = norm(system.get("species"))
    if species:
        return keyify(species)
    return keyify(actor.get("name"))


def display_name(actor):
    system = actor.get("system", {})
    return norm(system.get("species")) or norm(actor.get("name"))


def actor_identifier_values(actor):
    system = actor.get("system", {})
    values = [actor.get("name"), system.get("species"), system.get("sourceId")]
    names = system.get("names") or {}
    values.extend([names.get("canonical"), names.get("original"), names.get("dub")])
    official = system.get("officialReference") or {}
    values.extend([official.get("displayName"), official.get("directoryName")])
    wikimon = system.get("wikimon") or {}
    values.append(wikimon.get("title"))
    return [norm(v) for v in values if norm(v)]


def link_object(actor, source_name="", source_type="", confidence=None, bucket=""):
    system = actor.get("system", {})
    item = {
        "key": actor_key(actor),
        "name": norm(actor.get("name")),
        "species": norm(system.get("species")),
        "stage": norm(system.get("stage")) or "unknown",
        "evolutionCategory": norm(system.get("evolutionCategory")) or "normal",
        "folderPath": norm(system.get("folderPath")) or norm(system.get("stage")) or "unknown",
        "img": norm(actor.get("img")),
    }

    if source_name:
        item["sourceName"] = source_name
    if source_type:
        item["sourceType"] = source_type
    if confidence is not None:
        item["confidence"] = confidence
    if bucket:
        item["bucket"] = bucket

    return item


def build_direct_lookup(actors):
    lookup = defaultdict(list)
    for actor in actors:
        for value in actor_identifier_values(actor):
            lookup[keyify(value)].append(actor)
    return lookup


def find_unique_actor(identifier, direct_lookup):
    matches = []
    seen = set()
    for actor in direct_lookup.get(keyify(identifier), []):
        marker = id(actor)
        if marker not in seen:
            seen.add(marker)
            matches.append(actor)
    return matches[0] if len(matches) == 1 else None


def is_blocked_actor_alias(alias, actor, config):
    blocked = config.get("blockedActorAliases") or {}
    alias_key = keyify(alias)
    if not alias_key:
        return False

    actor_keys = {keyify(v) for v in actor_identifier_values(actor)}
    actor_keys.add(keyify(display_name(actor)))

    for actor_identifier, aliases in blocked.items():
        if keyify(actor_identifier) not in actor_keys:
            continue
        for blocked_alias in aliases or []:
            if alias_key == keyify(blocked_alias):
                return True

    return False


def add_alias(alias_map, alias_conflicts, alias, actor, config):
    if is_blocked_actor_alias(alias, actor, config):
        return

    alias_key = keyify(alias)
    if not alias_key:
        return

    current = alias_map.get(alias_key)

    if current is None:
        alias_map[alias_key] = actor
        return

    if current is actor:
        return

    existing_names = {display_name(current), norm(current.get("name"))}
    new_names = {display_name(actor), norm(actor.get("name"))}

    if existing_names == new_names:
        return

    alias_conflicts[alias_key].add(display_name(current))
    alias_conflicts[alias_key].add(display_name(actor))


def add_spacing_variants(alias_map, alias_conflicts, candidate, actor, config):
    text = norm(candidate)
    if not text:
        return

    variants = {text}

    replacements = [
        ("X-Antibody", "X Antibody"),
        ("X-Antibody", "XAntibody"),
        ("X Antibody", "X-Antibody"),
        ("X Antibody", "XAntibody"),
        ("XAntibody", "X-Antibody"),
        ("XAntibody", "X Antibody"),
    ]

    for old, new in replacements:
        if old in text:
            variants.add(text.replace(old, new))

    if " " in text:
        variants.add(text.replace(" ", ""))

    for variant in variants:
        add_alias(alias_map, alias_conflicts, variant, actor, config)


def build_alias_map(actors, config):
    alias_map = {}
    alias_conflicts = defaultdict(set)

    for actor in actors:
        system = actor.get("system", {})

        candidates = [
            actor.get("name"),
            system.get("species"),
            system.get("sourceId"),
        ]

        names = system.get("names") or {}
        candidates.extend([
            names.get("canonical"),
            names.get("original"),
            names.get("dub"),
        ])

        aliases = names.get("aliases") or []
        if isinstance(aliases, list):
            candidates.extend(aliases)

        system_aliases = system.get("aliases") or []
        if isinstance(system_aliases, list):
            candidates.extend(system_aliases)

        official = system.get("officialReference") or {}
        candidates.extend([
            official.get("displayName"),
            official.get("directoryName"),
        ])

        wikimon = system.get("wikimon") or {}
        candidates.append(wikimon.get("title"))

        for candidate in candidates:
            add_spacing_variants(alias_map, alias_conflicts, candidate, actor, config)

    return alias_map, alias_conflicts


def expected_stage_for_target(current_actor, direction):
    current_stage = norm(current_actor.get("system", {}).get("stage"))
    if current_stage not in STAGE_ORDER:
        return None

    offset = -1 if direction == "From" else 1
    expected_order = STAGE_ORDER[current_stage] + offset
    return ORDER_STAGE.get(expected_order)


def resolve_stage_scoped_actor(target, current_actor, direction, direct_lookup, config):
    scoped = config.get("stageScopedAliases") or {}
    target_key = keyify(target)
    if not target_key:
        return None, None

    matching_config = None
    for alias, stage_map in scoped.items():
        if target_key == keyify(alias):
            matching_config = stage_map or {}
            break

    if matching_config is None:
        return None, None

    expected_stage = expected_stage_for_target(current_actor, direction)
    if not expected_stage:
        return None, "stageScopedNoExpectedStage"

    identifier = matching_config.get(expected_stage)
    if not identifier:
        return None, "stageScopedNoStageMatch"

    actor = find_unique_actor(identifier, direct_lookup)
    if actor:
        return actor, "resolved"

    return None, "stageScopedMissing"


def resolve_actor(target, current_actor, direction, alias_map, alias_conflicts, direct_lookup, config):
    scoped_actor, scoped_status = resolve_stage_scoped_actor(target, current_actor, direction, direct_lookup, config)
    if scoped_status:
        return scoped_actor, scoped_status

    target_key = keyify(target)

    if not target_key:
        return None, "empty"

    if target_key in alias_conflicts:
        return None, "ambiguous"

    actor = alias_map.get(target_key)

    if actor:
        return actor, "resolved"

    return None, "missing"


def configured_target_set(config, key):
    return {keyify(value) for value in config.get(key, []) if keyify(value)}



def relation_key(actor_name, direction, target):
    return (keyify(actor_name), norm(direction).lower(), keyify(target))


def build_relation_lookup(config, key):
    lookup = {}
    for item in config.get(key, []) or []:
        actor_name = item.get("actor")
        direction = item.get("direction")
        target = item.get("target")
        if not actor_name or not direction or not target:
            continue
        lookup[relation_key(actor_name, direction, target)] = item
    return lookup


def current_actor_relation_key(actor, direction, target):
    values = [actor.get("name"), display_name(actor)] + actor_identifier_values(actor)
    keys = []
    seen = set()
    for value in values:
        key = relation_key(value, direction, target)
        if key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return keys


def lookup_relation_override(actor, direction, target, lookup):
    for key in current_actor_relation_key(actor, direction, target):
        if key in lookup:
            return lookup[key]
    return None

def is_ignored_target(target, config):
    return keyify(target) in configured_target_set(config, "ignoreTargets")


def is_ambiguous_generic_target(target, config):
    return keyify(target) in configured_target_set(config, "ambiguousGenericTargets")


def is_noise_target(target, config):
    text = norm(target).lower()

    if not text:
        return True
    if len(text) < 3:
        return True
    if len(text) > 90:
        return True
    if is_ignored_target(target, config):
        return True

    for pattern in NOISE_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return True

    return False


def iter_entries(actor, direction):
    wikimon = actor.get("system", {}).get("wikimon") or {}

    raw_key = "evolvesFromRaw" if direction == "From" else "evolvesToRaw"
    flat_key = "evolvesFrom" if direction == "From" else "evolvesTo"

    raw_entries = wikimon.get(raw_key) or []

    if raw_entries:
        for entry in raw_entries:
            if not isinstance(entry, dict):
                continue

            yield {
                "name": norm(entry.get("name")),
                "sourceType": norm(entry.get("sourceType")) or "unknown",
                "confidence": entry.get("confidence"),
                "ignoredByDefault": bool(entry.get("ignoredByDefault")),
                "raw": entry,
                "rawMode": True,
            }
        return

    for name in wikimon.get(flat_key) or []:
        yield {
            "name": norm(name),
            "sourceType": "flat",
            "confidence": None,
            "ignoredByDefault": False,
            "raw": {"name": norm(name)},
            "rawMode": False,
        }


def confidence_value(entry):
    confidence = entry.get("confidence")
    try:
        return int(confidence)
    except Exception:
        source_type = norm(entry.get("sourceType"))
        if source_type in TRUSTED_SOURCE_TYPES:
            return 60
        return 40


def source_type_value(entry):
    return norm(entry.get("sourceType")) or "unknown"


def is_trusted_entry(entry):
    source_type = source_type_value(entry)
    confidence = confidence_value(entry)
    return source_type in TRUSTED_SOURCE_TYPES or confidence >= 60


def edge_shape(from_actor, to_actor):
    from_system = from_actor.get("system", {})
    to_system = to_actor.get("system", {})

    from_category = norm(from_system.get("evolutionCategory")) or "normal"
    to_category = norm(to_system.get("evolutionCategory")) or "normal"
    from_stage = norm(from_system.get("stage"))
    to_stage = norm(to_system.get("stage"))

    if from_stage not in STAGE_ORDER or to_stage not in STAGE_ORDER:
        return "invalid"

    delta = STAGE_ORDER[to_stage] - STAGE_ORDER[from_stage]

    if from_category == "normal" and to_category == "normal" and delta == 1:
        return "normal"

    if from_category != "normal" or to_category != "normal":
        return "special"

    return "candidate"


def add_unique_link(target_list, link):
    key = link.get("key")
    source_name = link.get("sourceName")
    source_type = link.get("sourceType")

    for existing in target_list:
        if existing.get("key") == key and existing.get("sourceName") == source_name and existing.get("sourceType") == source_type:
            return False

    target_list.append(link)
    return True


def bucket_for_edge(from_actor, to_actor, entry):
    manual_bucket = entry.get("manualBucket")
    if manual_bucket in {"normal", "candidate", "special", "candidateSpecial"}:
        return manual_bucket
    shape = edge_shape(from_actor, to_actor)
    trusted = is_trusted_entry(entry)

    if shape == "normal":
        return "normal" if trusted else "candidate"

    if shape == "special":
        return "special" if trusted else "candidateSpecial"

    if shape == "candidate":
        return "candidateSpecial" if trusted else "candidate"

    return "candidate"


def add_edge(actor, other_actor, direction, entry, stats, edge_samples):
    if direction == "From":
        from_actor = other_actor
        to_actor = actor
        field_map = {
            "normal": ("normalFrom", "normalTo"),
            "candidate": ("candidateFrom", "candidateTo"),
            "special": ("specialFrom", "specialTo"),
            "candidateSpecial": ("candidateSpecialFrom", "candidateSpecialTo"),
        }
    else:
        from_actor = actor
        to_actor = other_actor
        field_map = {
            "normal": ("normalTo", "normalFrom"),
            "candidate": ("candidateTo", "candidateFrom"),
            "special": ("specialTo", "specialFrom"),
            "candidateSpecial": ("candidateSpecialTo", "candidateSpecialFrom"),
        }

    bucket = bucket_for_edge(from_actor, to_actor, entry)
    own_field, other_field = field_map[bucket]

    own_index = actor["system"]["evolutionIndex"]
    other_index = other_actor["system"]["evolutionIndex"]

    source_name = entry.get("name") or display_name(other_actor)
    source_type = source_type_value(entry)
    confidence = confidence_value(entry)

    own_link = link_object(other_actor, source_name=source_name, source_type=source_type, confidence=confidence, bucket=bucket)
    other_link = link_object(actor, source_name=display_name(actor), source_type=source_type, confidence=confidence, bucket=bucket)

    if add_unique_link(own_index[own_field], own_link):
        stats[own_field] += 1
    if add_unique_link(other_index[other_field], other_link):
        stats[other_field] += 1

    from_system = from_actor.get("system", {})
    to_system = to_actor.get("system", {})

    pair = f"{norm(from_system.get('stage'))}->{norm(to_system.get('stage'))}"
    category_pair = f"{norm(from_system.get('evolutionCategory')) or 'normal'}->{norm(to_system.get('evolutionCategory')) or 'normal'}"

    stats["edgeCount"] += 1
    stats[f"bucket::{bucket}"] += 1
    stats[f"stagePair::{pair}"] += 1
    stats[f"categoryPair::{category_pair}"] += 1

    if len(edge_samples) < 200:
        edge_samples.append({
            "from": display_name(from_actor),
            "to": display_name(to_actor),
            "sourceDirection": direction,
            "bucket": bucket,
            "shape": edge_shape(from_actor, to_actor),
            "fromStage": norm(from_system.get("stage")) or "unknown",
            "toStage": norm(to_system.get("stage")) or "unknown",
            "fromCategory": norm(from_system.get("evolutionCategory")) or "normal",
            "toCategory": norm(to_system.get("evolutionCategory")) or "normal",
            "sourceType": source_type,
            "confidence": confidence,
        })


def should_keep_unresolved(entry, target, config):
    if is_noise_target(target, config):
        return False
    if is_ambiguous_generic_target(target, config):
        return False

    source_type = source_type_value(entry)
    confidence = confidence_value(entry)

    if source_type in LOW_CONFIDENCE_SOURCE_TYPES and confidence < 60:
        return False

    return True


def main():
    if not INPUT_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {INPUT_PATH}")

    config, config_path = load_indexer_config()
    ignore_relation_lookup = build_relation_lookup(config, "ignoreRelations")
    manual_relation_lookup = build_relation_lookup(config, "manualRelations")

    data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    actors = data.get("actors", [])

    direct_lookup = build_direct_lookup(actors)
    alias_map, alias_conflicts = build_alias_map(actors, config)

    stats = Counter()
    unresolved_rows = []
    unresolved_sample = []
    edge_samples = []

    for actor in actors:
        system = actor.setdefault("system", {})
        system["evolutionIndex"] = {
            "normalFrom": [],
            "normalTo": [],
            "candidateFrom": [],
            "candidateTo": [],
            "specialFrom": [],
            "specialTo": [],
            "candidateSpecialFrom": [],
            "candidateSpecialTo": [],
            "unresolvedFrom": [],
            "unresolvedTo": [],
            "rawFrom": [],
            "rawTo": [],
            "reviewRequired": False,
        }

    for actor in actors:
        system = actor.setdefault("system", {})
        index = system["evolutionIndex"]

        for direction in ("From", "To"):
            raw_field = "rawFrom" if direction == "From" else "rawTo"
            unresolved_field = "unresolvedFrom" if direction == "From" else "unresolvedTo"

            for entry in iter_entries(actor, direction):
                target = entry.get("name")

                if not target:
                    stats["skippedEmpty"] += 1
                    continue

                index[raw_field].append(target)
                stats["rawTotal"] += 1

                ignored_relation = lookup_relation_override(actor, direction, target, ignore_relation_lookup)
                if ignored_relation:
                    stats["skippedConfiguredRelationIgnore"] += 1
                    continue

                manual_relation = lookup_relation_override(actor, direction, target, manual_relation_lookup)
                if manual_relation:
                    resolve_to = manual_relation.get("resolveTo") or target
                    other_actor = find_unique_actor(resolve_to, direct_lookup)
                    if not other_actor:
                        row = {
                            "actor": display_name(actor),
                            "stage": norm(system.get("stage")) or "unknown",
                            "category": norm(system.get("evolutionCategory")) or "normal",
                            "direction": direction,
                            "target": target,
                            "status": "manualRelationMissingTarget",
                            "sourceType": source_type_value(entry),
                            "confidence": confidence_value(entry),
                        }
                        unresolved_rows.append(row)
                        index[unresolved_field].append(target)
                        stats["unresolvedCount"] += 1
                        if len(unresolved_sample) < 100:
                            unresolved_sample.append(row)
                        continue
                    entry = dict(entry)
                    entry["manualBucket"] = manual_relation.get("bucket")
                    entry["manualReason"] = manual_relation.get("reason")
                    stats["manualRelationResolved"] += 1
                    add_edge(actor, other_actor, direction, entry, stats, edge_samples)
                    continue

                if entry.get("ignoredByDefault"):
                    stats["skippedIgnoredByDefault"] += 1
                    continue

                if source_type_value(entry) == "cardGame":
                    stats["skippedCardGame"] += 1
                    continue

                if is_ignored_target(target, config):
                    stats["skippedConfiguredIgnore"] += 1
                    continue

                if is_noise_target(target, config):
                    stats["skippedNoise"] += 1
                    continue

                if is_ambiguous_generic_target(target, config):
                    stats["skippedAmbiguousGeneric"] += 1
                    continue

                other_actor, status = resolve_actor(target, actor, direction, alias_map, alias_conflicts, direct_lookup, config)

                if not other_actor:
                    if should_keep_unresolved(entry, target, config):
                        row = {
                            "actor": display_name(actor),
                            "stage": norm(system.get("stage")) or "unknown",
                            "category": norm(system.get("evolutionCategory")) or "normal",
                            "direction": direction,
                            "target": target,
                            "status": status,
                            "sourceType": source_type_value(entry),
                            "confidence": confidence_value(entry),
                        }

                        unresolved_rows.append(row)
                        index[unresolved_field].append(target)
                        stats["unresolvedCount"] += 1

                        if len(unresolved_sample) < 100:
                            unresolved_sample.append(row)
                    else:
                        stats["skippedLowPriorityUnresolved"] += 1

                    continue

                add_edge(actor, other_actor, direction, entry, stats, edge_samples)

    actors_with = Counter()

    tracked_fields = (
        "normalFrom", "normalTo",
        "candidateFrom", "candidateTo",
        "specialFrom", "specialTo",
        "candidateSpecialFrom", "candidateSpecialTo",
        "unresolvedFrom", "unresolvedTo",
    )

    for actor in actors:
        index = actor["system"]["evolutionIndex"]

        for field in tracked_fields:
            if index[field]:
                actors_with[f"actorsWith{field[0].upper()}{field[1:]}"] += 1

        if index["unresolvedFrom"] or index["unresolvedTo"]:
            index["reviewRequired"] = True
            actors_with["actorsReviewRequired"] += 1

    stage_pair_counts = {
        key.replace("stagePair::", ""): value
        for key, value in stats.items()
        if key.startswith("stagePair::")
    }

    category_pair_counts = {
        key.replace("categoryPair::", ""): value
        for key, value in stats.items()
        if key.startswith("categoryPair::")
    }

    bucket_counts = {
        key.replace("bucket::", ""): value
        for key, value in stats.items()
        if key.startswith("bucket::")
    }

    report = {
        "actorCount": len(actors),
        "configPath": str(config_path) if config_path else None,
        "summary": {
            "rawTotal": stats["rawTotal"],
            "skippedIgnoredByDefault": stats["skippedIgnoredByDefault"],
            "skippedCardGame": stats["skippedCardGame"],
            "skippedConfiguredIgnore": stats["skippedConfiguredIgnore"],
            "skippedAmbiguousGeneric": stats["skippedAmbiguousGeneric"],
            "skippedNoise": stats["skippedNoise"],
            "skippedLowPriorityUnresolved": stats["skippedLowPriorityUnresolved"],
            "edgeCount": stats["edgeCount"],
            "normalFrom": stats["normalFrom"],
            "normalTo": stats["normalTo"],
            "candidateFrom": stats["candidateFrom"],
            "candidateTo": stats["candidateTo"],
            "specialFrom": stats["specialFrom"],
            "specialTo": stats["specialTo"],
            "candidateSpecialFrom": stats["candidateSpecialFrom"],
            "candidateSpecialTo": stats["candidateSpecialTo"],
            "unresolvedCount": stats["unresolvedCount"],
            **dict(actors_with),
        },
        "bucketCounts": dict(sorted(bucket_counts.items(), key=lambda item: item[1], reverse=True)),
        "stagePairCountsTop": dict(sorted(stage_pair_counts.items(), key=lambda item: item[1], reverse=True)[:40]),
        "categoryPairCounts": dict(sorted(category_pair_counts.items(), key=lambda item: item[1], reverse=True)),
        "aliasConflictCount": len(alias_conflicts),
        "aliasConflictsSample": {
            key: sorted(values)
            for key, values in list(alias_conflicts.items())[:50]
        },
        "unresolvedSample": unresolved_sample,
        "edgeSample": edge_samples,
    }

    OUTPUT_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    with UNRESOLVED_PATH.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(
            fp,
            fieldnames=["actor", "stage", "category", "direction", "target", "status", "sourceType", "confidence"],
        )
        writer.writeheader()
        writer.writerows(unresolved_rows)

    print(f"OK: {OUTPUT_PATH}")
    print(f"OK: {REPORT_PATH}")
    print(f"OK: {UNRESOLVED_PATH}")
    print()
    print("Resumo:")
    for key, value in report["summary"].items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
