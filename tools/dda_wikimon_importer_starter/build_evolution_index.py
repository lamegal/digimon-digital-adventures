import json
import re
from pathlib import Path
from collections import Counter, defaultdict

INPUT_PATH = Path("output/all_digimon_complete.json")
OUTPUT_PATH = Path("output/all_digimon_with_evolution_index.json")
REPORT_PATH = Path("output/evolution_index_report.json")
UNRESOLVED_CSV_PATH = Path("output/evolution_index_unresolved.csv")

STAGE_ORDER = [
    "baby1",
    "baby2",
    "child",
    "adult",
    "perfect",
    "ultimate",
    "ultimatePlus",
]

STAGE_INDEX = {stage: index for index, stage in enumerate(STAGE_ORDER)}

SPECIAL_CATEGORIES = {
    "antibody",
    "armor",
    "burst",
    "hybrid",
    "jogress",
    "mode",
    "variant",
    "xros",
}


def norm(value):
    return str(value or "").strip()


def compact(value):
    raw = norm(value)
    raw = raw.replace("&", " and ")
    raw = raw.replace("’", "'")
    raw = raw.replace("`", "'")
    raw = re.sub(r"\bX\s*[- ]?\s*Antibody\b", "XAntibody", raw, flags=re.IGNORECASE)
    return re.sub(r"[^a-z0-9]+", "", raw.lower())


def title_case_variant(value):
    raw = norm(value)
    raw = re.sub(r"([a-z])([A-Z])", r"\1 \2", raw)
    raw = re.sub(r"(X)(Antibody)", r"\1 \2", raw, flags=re.IGNORECASE)
    raw = raw.replace(" X Antibody", " X-Antibody")
    return re.sub(r"\s+", " ", raw).strip()


def split_digimon_entry_text(value):
    raw = norm(value)
    if not raw:
        return []

    # Remove common notes and bracketed/card-source details. Keep the leading name.
    cleaned = re.sub(r"\[[^\]]*\]", " ", raw)
    cleaned = re.sub(r"\([^)]*(?:card|game|v-pet|anime|manga|with|using|through|jogress|dna|item|level|quest|questline)[^)]*\)", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # Wikimon may join alternatives with punctuation. Keep simple splitters only.
    parts = re.split(r"\s*(?:,|/|;|\bor\b)\s*", cleaned, flags=re.IGNORECASE)
    return [part.strip() for part in parts if part.strip()]


def extract_entry_names(entry):
    if entry is None:
        return []

    if isinstance(entry, str):
        return split_digimon_entry_text(entry)

    if isinstance(entry, dict):
        candidates = []
        for key in (
            "name",
            "title",
            "page",
            "digimon",
            "target",
            "from",
            "to",
            "species",
            "text",
            "label",
            "displayName",
        ):
            value = entry.get(key)
            if value:
                candidates.extend(extract_entry_names(value))

        if candidates:
            return candidates

        # Last-resort parse of values, but avoid parsing huge nested data.
        for value in entry.values():
            if isinstance(value, str):
                candidates.extend(split_digimon_entry_text(value))
        return candidates

    if isinstance(entry, list):
        names = []
        for value in entry:
            names.extend(extract_entry_names(value))
        return names

    return split_digimon_entry_text(entry)


def get_raw_evolution_entries(actor, direction):
    system = actor.get("system", {}) or {}
    wikimon = system.get("wikimon", {}) or {}
    hints = system.get("evolutionHints", {}) or {}

    keys = [
        f"evolves{direction}",
        f"evolves_{direction.lower()}",
        direction.lower(),
    ]

    entries = []
    for source in (wikimon, hints):
        for key in keys:
            value = source.get(key)
            if value:
                if isinstance(value, list):
                    entries.extend(value)
                else:
                    entries.append(value)

    return entries


def actor_display_name(actor):
    system = actor.get("system", {}) or {}
    return norm(system.get("species")) or norm(actor.get("name")) or norm(system.get("sourceId"))


def actor_category(actor):
    system = actor.get("system", {}) or {}
    category = norm(system.get("evolutionCategory")) or "normal"
    return category if category else "normal"


def actor_stage(actor):
    return norm((actor.get("system", {}) or {}).get("stage")) or "unknown"


def actor_key(actor):
    system = actor.get("system", {}) or {}
    return norm(system.get("sourceId")) or compact(actor_display_name(actor)) or norm(actor.get("name"))


def actor_ref(actor):
    system = actor.get("system", {}) or {}
    return {
        "key": actor_key(actor),
        "name": norm(actor.get("name")),
        "species": norm(system.get("species")),
        "stage": actor_stage(actor),
        "evolutionCategory": actor_category(actor),
        "folderPath": norm(system.get("folderPath")),
        "img": norm(actor.get("img")),
    }


def add_alias(alias_map, conflicts, alias, actor):
    key = compact(alias)
    if not key:
        return

    current = alias_map.get(key)
    if current is None:
        alias_map[key] = actor
        return

    if current is actor:
        return

    # Prefer normal category over special only when exact alias collision exists.
    current_category = actor_category(current)
    next_category = actor_category(actor)
    if current_category != "normal" and next_category == "normal":
        conflicts[key].add(actor_display_name(current))
        alias_map[key] = actor
        return

    conflicts[key].add(actor_display_name(current))
    conflicts[key].add(actor_display_name(actor))


def build_alias_map(actors):
    alias_map = {}
    conflicts = defaultdict(set)

    for actor in actors:
        system = actor.get("system", {}) or {}

        candidates = [
            actor.get("name"),
            system.get("species"),
            system.get("sourceId"),
            system.get("canonicalName"),
            system.get("originalName"),
            system.get("dubName"),
        ]

        names = system.get("names") or {}
        if isinstance(names, dict):
            candidates.extend(names.values())

        aliases = system.get("aliases") or []
        if isinstance(aliases, str):
            candidates.append(aliases)
        elif isinstance(aliases, list):
            candidates.extend(aliases)

        for candidate in candidates:
            raw = norm(candidate)
            if not raw:
                continue

            add_alias(alias_map, conflicts, raw, actor)
            add_alias(alias_map, conflicts, title_case_variant(raw), actor)
            add_alias(alias_map, conflicts, raw.replace("XAntibody", "X-Antibody"), actor)
            add_alias(alias_map, conflicts, raw.replace("XAntibody", " X-Antibody"), actor)

    return alias_map, {key: sorted(values) for key, values in conflicts.items() if len(values) > 1}


def resolve_actor(name, alias_map):
    raw = norm(name)
    if not raw:
        return None

    candidates = [raw, title_case_variant(raw)]

    # Common Wikimon/name variants.
    candidates.append(raw.replace(" X Antibody", " X-Antibody"))
    candidates.append(raw.replace("X Antibody", "X-Antibody"))
    candidates.append(raw.replace("X-Antibody", "XAntibody"))
    candidates.append(raw.replace(" X-Antibody", "XAntibody"))

    for candidate in candidates:
        actor = alias_map.get(compact(candidate))
        if actor:
            return actor

    return None


def is_adjacent_normal(source_actor, target_actor, direction):
    source_category = actor_category(source_actor)
    target_category = actor_category(target_actor)
    if source_category != "normal" or target_category != "normal":
        return False

    source_stage = actor_stage(source_actor)
    target_stage = actor_stage(target_actor)

    if source_stage not in STAGE_INDEX or target_stage not in STAGE_INDEX:
        return False

    source_index = STAGE_INDEX[source_stage]
    target_index = STAGE_INDEX[target_stage]

    if direction == "From":
        return target_index == source_index - 1

    if direction == "To":
        return target_index == source_index + 1

    return False


def dedupe_refs(refs):
    seen = set()
    output = []
    for ref in refs:
        key = ref.get("key") or compact(ref.get("species") or ref.get("name"))
        if key in seen:
            continue
        seen.add(key)
        output.append(ref)
    return output


def main():
    if not INPUT_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {INPUT_PATH}")

    data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    actors = data.get("actors", [])

    alias_map, conflicts = build_alias_map(actors)

    totals = Counter()
    stage_pair_counts = Counter()
    category_pair_counts = Counter()
    unresolved_rows = []
    edge_rows = []

    for actor in actors:
        system = actor.setdefault("system", {})

        normal_from = []
        normal_to = []
        special_from = []
        special_to = []
        unresolved_from = []
        unresolved_to = []

        raw_from_names = []
        raw_to_names = []

        for direction, normal_bucket, special_bucket, unresolved_bucket, raw_bucket in (
            ("From", normal_from, special_from, unresolved_from, raw_from_names),
            ("To", normal_to, special_to, unresolved_to, raw_to_names),
        ):
            raw_entries = get_raw_evolution_entries(actor, direction)
            extracted_names = []
            for entry in raw_entries:
                extracted_names.extend(extract_entry_names(entry))

            # Clean obvious non-Digimon generic entries.
            cleaned_names = []
            for name in extracted_names:
                cleaned = norm(name)
                if not cleaned:
                    continue
                if compact(cleaned) in {"anydigimon", "any", "unknown", "none", "n/a", "na"}:
                    continue
                cleaned_names.append(cleaned)

            raw_bucket.extend(cleaned_names)

            for target_name in cleaned_names:
                target_actor = resolve_actor(target_name, alias_map)

                if not target_actor:
                    unresolved_bucket.append(target_name)
                    unresolved_rows.append({
                        "actor": actor_display_name(actor),
                        "stage": actor_stage(actor),
                        "category": actor_category(actor),
                        "direction": direction,
                        "target": target_name,
                    })
                    continue

                ref = actor_ref(target_actor)
                ref["sourceName"] = target_name

                relation_is_normal = is_adjacent_normal(actor, target_actor, direction)

                if relation_is_normal:
                    normal_bucket.append(ref)
                    totals[f"normal{direction}"] += 1
                else:
                    special_bucket.append(ref)
                    totals[f"special{direction}"] += 1

                stage_pair_counts[f"{actor_stage(actor)}->{actor_stage(target_actor)}"] += 1
                category_pair_counts[f"{actor_category(actor)}->{actor_category(target_actor)}"] += 1

                edge_rows.append({
                    "from": actor_display_name(target_actor) if direction == "From" else actor_display_name(actor),
                    "to": actor_display_name(actor) if direction == "From" else actor_display_name(target_actor),
                    "sourceDirection": direction,
                    "normal": relation_is_normal,
                    "fromStage": actor_stage(target_actor) if direction == "From" else actor_stage(actor),
                    "toStage": actor_stage(actor) if direction == "From" else actor_stage(target_actor),
                    "fromCategory": actor_category(target_actor) if direction == "From" else actor_category(actor),
                    "toCategory": actor_category(actor) if direction == "From" else actor_category(target_actor),
                })

        normal_from = dedupe_refs(normal_from)
        normal_to = dedupe_refs(normal_to)
        special_from = dedupe_refs(special_from)
        special_to = dedupe_refs(special_to)
        unresolved_from = sorted(set(unresolved_from))
        unresolved_to = sorted(set(unresolved_to))
        raw_from_names = sorted(set(raw_from_names))
        raw_to_names = sorted(set(raw_to_names))

        existing_review = bool(system.get("reviewRequired") or system.get("needsReview"))
        review_required = existing_review or bool(unresolved_from or unresolved_to)

        system["evolutionIndex"] = {
            "normalFrom": normal_from,
            "normalTo": normal_to,
            "specialFrom": special_from,
            "specialTo": special_to,
            "unresolvedFrom": unresolved_from,
            "unresolvedTo": unresolved_to,
            "rawFrom": raw_from_names,
            "rawTo": raw_to_names,
            "reviewRequired": review_required,
        }

        if normal_from:
            totals["actorsWithNormalFrom"] += 1
        if normal_to:
            totals["actorsWithNormalTo"] += 1
        if special_from:
            totals["actorsWithSpecialFrom"] += 1
        if special_to:
            totals["actorsWithSpecialTo"] += 1
        if review_required:
            totals["actorsReviewRequired"] += 1
        if unresolved_from or unresolved_to:
            totals["actorsWithUnresolved"] += 1

    data["count"] = len(actors)
    data["evolutionIndexSummary"] = dict(totals)

    OUTPUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    report = {
        "actorCount": len(actors),
        "summary": dict(totals),
        "stagePairCountsTop": dict(stage_pair_counts.most_common(80)),
        "categoryPairCounts": dict(category_pair_counts.most_common()),
        "aliasConflictCount": len(conflicts),
        "aliasConflictsSample": dict(list(conflicts.items())[:50]),
        "unresolvedCount": len(unresolved_rows),
        "unresolvedSample": unresolved_rows[:200],
        "edgeCount": len(edge_rows),
        "edgeSample": edge_rows[:200],
    }

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    with UNRESOLVED_CSV_PATH.open("w", encoding="utf-8", newline="") as file:
        file.write("actor,stage,category,direction,target\n")
        for row in unresolved_rows:
            values = [row["actor"], row["stage"], row["category"], row["direction"], row["target"]]
            escaped = []
            for value in values:
                text = str(value).replace('"', '""')
                escaped.append(f'"{text}"')
            file.write(",".join(escaped) + "\n")

    print(f"OK: {OUTPUT_PATH}")
    print(f"OK: {REPORT_PATH}")
    print(f"OK: {UNRESOLVED_CSV_PATH}")
    print()
    print("Resumo:")
    for key, value in sorted(totals.items()):
        print(f"  {key}: {value}")
    print(f"  unresolvedEntries: {len(unresolved_rows)}")
    print(f"  aliasConflicts: {len(conflicts)}")


if __name__ == "__main__":
    main()
