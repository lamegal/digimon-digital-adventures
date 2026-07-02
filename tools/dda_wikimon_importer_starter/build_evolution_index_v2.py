import csv
import json
import re
from pathlib import Path
from collections import Counter, defaultdict


INPUT_PATH = Path("output/all_digimon_complete.json")
OUTPUT_PATH = Path("output/all_digimon_with_evolution_index_v2.json")
REPORT_PATH = Path("output/evolution_index_report_v2.json")
UNRESOLVED_PATH = Path("output/evolution_index_unresolved_v2.csv")


STAGE_ORDER = {
    "baby1": 0,
    "baby2": 1,
    "child": 2,
    "adult": 3,
    "perfect": 4,
    "ultimate": 5,
    "ultimatePlus": 6,
}

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
    r"\blv\.\d+\b",
    r"\blevel \d+\b",
    r"\byuki\b",
    r"\bkanbara\b",
    r"\bminamoto\b",
    r"\borimoto\b",
    r"\bhimi\b",
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


def link_object(actor, source_name="", source_type="", confidence=None):
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

    return item


def add_alias(alias_map, alias_conflicts, alias, actor):
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


def build_alias_map(actors):
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

        official = system.get("officialReference") or {}
        candidates.extend([
            official.get("displayName"),
            official.get("directoryName"),
        ])

        wikimon = system.get("wikimon") or {}
        candidates.extend([
            wikimon.get("title"),
        ])

        for candidate in candidates:
            add_alias(alias_map, alias_conflicts, candidate, actor)

        # Também aceita versões com e sem espaços para X-Antibody.
        for candidate in list(candidates):
            text = norm(candidate)
            if not text:
                continue
            if "X-Antibody" in text:
                add_alias(alias_map, alias_conflicts, text.replace("X-Antibody", "X Antibody"), actor)
                add_alias(alias_map, alias_conflicts, text.replace("X-Antibody", "XAntibody"), actor)
            if "X Antibody" in text:
                add_alias(alias_map, alias_conflicts, text.replace("X Antibody", "X-Antibody"), actor)
                add_alias(alias_map, alias_conflicts, text.replace("X Antibody", "XAntibody"), actor)
            if "XAntibody" in text:
                add_alias(alias_map, alias_conflicts, text.replace("XAntibody", "X-Antibody"), actor)
                add_alias(alias_map, alias_conflicts, text.replace("XAntibody", "X Antibody"), actor)

    return alias_map, alias_conflicts


def resolve_actor(target, alias_map, alias_conflicts):
    target_key = keyify(target)

    if not target_key:
        return None, "empty"

    if target_key in alias_conflicts:
        return None, "ambiguous"

    actor = alias_map.get(target_key)

    if actor:
        return actor, "resolved"

    return None, "missing"


def is_noise_target(target):
    text = norm(target).lower()

    if not text:
        return True

    if len(text) < 3:
        return True

    if len(text) > 90:
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


def is_normal_edge(from_actor, to_actor):
    from_system = from_actor.get("system", {})
    to_system = to_actor.get("system", {})

    from_category = norm(from_system.get("evolutionCategory")) or "normal"
    to_category = norm(to_system.get("evolutionCategory")) or "normal"

    if from_category != "normal" or to_category != "normal":
        return False

    from_stage = norm(from_system.get("stage"))
    to_stage = norm(to_system.get("stage"))

    if from_stage not in STAGE_ORDER or to_stage not in STAGE_ORDER:
        return False

    return STAGE_ORDER[to_stage] == STAGE_ORDER[from_stage] + 1


def add_unique_link(target_list, link):
    key = link.get("key")

    for existing in target_list:
        if existing.get("key") == key:
            return False

    target_list.append(link)
    return True


def add_edge(actor, other_actor, direction, entry, stats, edge_samples):
    if direction == "From":
        from_actor = other_actor
        to_actor = actor
        own_field = "normalFrom"
        own_special_field = "specialFrom"
        other_field = "normalTo"
        other_special_field = "specialTo"
    else:
        from_actor = actor
        to_actor = other_actor
        own_field = "normalTo"
        own_special_field = "specialTo"
        other_field = "normalFrom"
        other_special_field = "specialFrom"

    normal = is_normal_edge(from_actor, to_actor)

    own_index = actor["system"]["evolutionIndex"]
    other_index = other_actor["system"]["evolutionIndex"]

    source_name = entry.get("name") or display_name(other_actor)
    source_type = entry.get("sourceType") or ""
    confidence = entry.get("confidence")

    own_link = link_object(other_actor, source_name=source_name, source_type=source_type, confidence=confidence)
    other_link = link_object(actor, source_name=display_name(actor), source_type=source_type, confidence=confidence)

    if normal:
        if add_unique_link(own_index[own_field], own_link):
            stats[own_field] += 1
        if add_unique_link(other_index[other_field], other_link):
            stats[other_field] += 1
    else:
        if add_unique_link(own_index[own_special_field], own_link):
            stats[own_special_field] += 1
        if add_unique_link(other_index[other_special_field], other_link):
            stats[other_special_field] += 1

    from_system = from_actor.get("system", {})
    to_system = to_actor.get("system", {})

    pair = f"{norm(from_system.get('stage'))}->{norm(to_system.get('stage'))}"
    category_pair = f"{norm(from_system.get('evolutionCategory')) or 'normal'}->{norm(to_system.get('evolutionCategory')) or 'normal'}"

    stats["edgeCount"] += 1
    stats[f"stagePair::{pair}"] += 1
    stats[f"categoryPair::{category_pair}"] += 1

    if len(edge_samples) < 200:
        edge_samples.append({
            "from": display_name(from_actor),
            "to": display_name(to_actor),
            "sourceDirection": direction,
            "normal": normal,
            "fromStage": norm(from_system.get("stage")) or "unknown",
            "toStage": norm(to_system.get("stage")) or "unknown",
            "fromCategory": norm(from_system.get("evolutionCategory")) or "normal",
            "toCategory": norm(to_system.get("evolutionCategory")) or "normal",
            "sourceType": source_type,
            "confidence": confidence,
        })


def main():
    if not INPUT_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {INPUT_PATH}")

    data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    actors = data.get("actors", [])

    alias_map, alias_conflicts = build_alias_map(actors)

    stats = Counter()
    unresolved_rows = []
    unresolved_sample = []
    edge_samples = []

    for actor in actors:
        system = actor.setdefault("system", {})

        system["evolutionIndex"] = {
            "normalFrom": [],
            "normalTo": [],
            "specialFrom": [],
            "specialTo": [],
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

                if entry.get("ignoredByDefault"):
                    stats["skippedIgnoredByDefault"] += 1
                    continue

                if entry.get("sourceType") == "cardGame":
                    stats["skippedCardGame"] += 1
                    continue

                if is_noise_target(target):
                    stats["skippedNoise"] += 1
                    continue

                other_actor, status = resolve_actor(target, alias_map, alias_conflicts)

                if not other_actor:
                    row = {
                        "actor": display_name(actor),
                        "stage": norm(system.get("stage")) or "unknown",
                        "category": norm(system.get("evolutionCategory")) or "normal",
                        "direction": direction,
                        "target": target,
                        "status": status,
                        "sourceType": entry.get("sourceType") or "",
                        "confidence": entry.get("confidence"),
                    }

                    unresolved_rows.append(row)
                    index[unresolved_field].append(target)
                    stats["unresolvedCount"] += 1

                    if len(unresolved_sample) < 100:
                        unresolved_sample.append(row)

                    continue

                add_edge(actor, other_actor, direction, entry, stats, edge_samples)

    actors_with = Counter()

    for actor in actors:
        index = actor["system"]["evolutionIndex"]

        for field in ("normalFrom", "normalTo", "specialFrom", "specialTo", "unresolvedFrom", "unresolvedTo"):
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

    report = {
        "actorCount": len(actors),
        "summary": {
            "rawTotal": stats["rawTotal"],
            "skippedIgnoredByDefault": stats["skippedIgnoredByDefault"],
            "skippedCardGame": stats["skippedCardGame"],
            "skippedNoise": stats["skippedNoise"],
            "edgeCount": stats["edgeCount"],
            "normalFrom": stats["normalFrom"],
            "normalTo": stats["normalTo"],
            "specialFrom": stats["specialFrom"],
            "specialTo": stats["specialTo"],
            "unresolvedCount": stats["unresolvedCount"],
            **dict(actors_with),
        },
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
