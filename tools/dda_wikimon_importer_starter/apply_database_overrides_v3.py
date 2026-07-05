
import argparse
import csv
import json
import re
import shutil
from copy import deepcopy
from pathlib import Path

DEFAULT_INPUTS = [
    Path("output/all_digimon_with_evolution_index_v4.json"),
    Path("output/all_digimon_curated_v2.json"),
    Path("output/all_digimon_complete.json"),
]
DEFAULT_OVERRIDES = [
    Path("output/database_overrides_v3.json"),
    Path("database_overrides_v3.json"),
    Path("output/database_overrides_v2.json"),
    Path("database_overrides_v2.json"),
]
DEFAULT_OUTPUT = Path("output/all_digimon_curated_v3.json")
DEFAULT_REPORT = Path("output/curation_report_v3.json")
DEFAULT_DUPES_CSV = Path("output/curation_merged_duplicates_v3.csv")
DEFAULT_STAGE_CSV = Path("output/curation_stage_changes_v3.csv")
DEFAULT_CREATED_CSV = Path("output/curation_created_actors_v3.csv")

SPECIAL_CATEGORIES = {"armor", "hybrid", "burst", "mode", "antibody", "variant", "jogress", "xros"}
EVOLUTION_INDEX_FIELDS = [
    "normalFrom", "normalTo", "candidateFrom", "candidateTo",
    "specialFrom", "specialTo", "candidateSpecialFrom", "candidateSpecialTo",
    "unresolvedFrom", "unresolvedTo",
]


def norm(value):
    return str(value or "").strip()


def compact(value):
    return re.sub(r"[^a-z0-9]+", "", norm(value).lower())


def unique_preserve(values):
    out = []
    seen = set()
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
            key = value.lower()
        else:
            key = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out


def pick_existing(paths):
    for path in paths:
        if path.exists():
            return path
    return None


def actor_system(actor):
    return actor.setdefault("system", {})


def actor_aliases(actor):
    system = actor_system(actor)
    aliases = [actor.get("name"), system.get("species"), system.get("sourceId")]
    aliases.extend(system.get("aliases") or [])
    names = system.get("names") or {}
    if isinstance(names, dict):
        aliases.extend([names.get("canonical"), names.get("original"), names.get("dub")])
        aliases.extend(names.get("aliases") or [])
    display = system.get("display") or {}
    if isinstance(display, dict):
        aliases.extend(display.values())
    official = system.get("officialReference") or {}
    if isinstance(official, dict):
        aliases.extend([official.get("name"), official.get("displayName"), official.get("directoryName")])
    wikimon = system.get("wikimon") or {}
    if isinstance(wikimon, dict):
        aliases.append(wikimon.get("title"))
    return unique_preserve(aliases)


def build_name_maps(actors):
    by_name = {}
    by_compact = {}
    for actor in actors:
        name = norm(actor.get("name"))
        if name:
            by_name[name] = actor
        for alias in actor_aliases(actor):
            key = compact(alias)
            if not key:
                continue
            by_compact.setdefault(key, []).append(actor)
    return by_name, by_compact


def resolve_actor(identifier, by_name, by_compact):
    if not identifier:
        return None
    if identifier in by_name:
        return by_name[identifier]
    matches = by_compact.get(compact(identifier), [])
    unique = []
    seen = set()
    for actor in matches:
        if id(actor) not in seen:
            seen.add(id(actor))
            unique.append(actor)
    return unique[0] if len(unique) == 1 else None


def set_stage_and_category(actor, stage=None, category=None):
    system = actor_system(actor)
    if stage:
        system["stage"] = stage
    if category:
        system["evolutionCategory"] = category
    category_value = norm(system.get("evolutionCategory")) or "normal"
    stage_value = norm(system.get("stage")) or "unknown"
    system["isSpecialForm"] = category_value != "normal"
    system["folderPath"] = stage_value if category_value == "normal" else f"{category_value}/{stage_value}"


def ensure_names(actor):
    system = actor_system(actor)
    names = system.setdefault("names", {})
    if not isinstance(names, dict):
        names = {}
        system["names"] = names
    names.setdefault("canonical", compact(actor.get("name")))
    names.setdefault("original", norm(actor.get("name")))
    names.setdefault("dub", norm(actor.get("name")))
    names.setdefault("aliases", [])
    return names


def apply_metadata(actor, override):
    system = actor_system(actor)
    if override.get("species"):
        system["species"] = override["species"]
    for key in ("attribute", "type", "field", "group"):
        if key in override and override[key] is not None:
            system[key] = override[key]
    aliases = override.get("aliases") or []
    if aliases:
        names = ensure_names(actor)
        names["aliases"] = unique_preserve((names.get("aliases") or []) + aliases + [actor.get("name"), system.get("species")])
        system["aliases"] = unique_preserve((system.get("aliases") or []) + aliases)
    if override.get("sourceNote") or override.get("reason"):
        system.setdefault("curation", {})["reason"] = override.get("sourceNote") or override.get("reason")


def merge_lists(target, source, key):
    target[key] = unique_preserve((target.get(key) or []) + (source.get(key) or []))


def merge_evolution_index(target, source):
    target_index = actor_system(target).setdefault("evolutionIndex", {})
    source_index = actor_system(source).get("evolutionIndex") or {}
    for field in EVOLUTION_INDEX_FIELDS:
        merge_lists(target_index, source_index, field)


def merge_actor_data(canonical, duplicate):
    c_system = actor_system(canonical)
    d_system = actor_system(duplicate)
    aliases = actor_aliases(canonical) + actor_aliases(duplicate) + [duplicate.get("name")]
    names = ensure_names(canonical)
    names["aliases"] = unique_preserve((names.get("aliases") or []) + aliases)
    c_system["aliases"] = unique_preserve((c_system.get("aliases") or []) + aliases)
    merge_evolution_index(canonical, duplicate)
    for key in ("wikimon", "officialReference"):
        if not c_system.get(key) and d_system.get(key):
            c_system[key] = deepcopy(d_system[key])


def make_actor(name, spec):
    stage = norm(spec.get("stage")) or "unknown"
    category = norm(spec.get("category")) or "normal"
    species = norm(spec.get("species")) or name
    actor = {
        "name": name,
        "type": "digimon",
        "img": norm(spec.get("img")) or "icons/svg/mystery-man.svg",
        "system": {
            "sourceId": compact(species),
            "species": species,
            "isPersistentPartner": False,
            "nickname": "",
            "stage": stage,
            "attribute": norm(spec.get("attribute")) or "unknown",
            "type": norm(spec.get("type")) or "Unknown",
            "group": norm(spec.get("group")),
            "field": norm(spec.get("field")) or "Unknown",
            "names": {
                "canonical": compact(species),
                "original": species,
                "dub": species,
                "aliases": unique_preserve([species, name] + (spec.get("aliases") or [])),
            },
            "aliases": unique_preserve(spec.get("aliases") or []),
            "evolutionCategory": category,
            "isSpecialForm": category != "normal",
            "folderPath": stage if category == "normal" else f"{category}/{stage}",
            "wikimon": {"title": species, "url": "", "evolvesFrom": [], "evolvesTo": [], "evolvesFromRaw": [], "evolvesToRaw": []},
            "curation": {"createdBy": "apply_database_overrides_v3.py", "reason": norm(spec.get("reason"))},
        },
    }
    return actor


def count_stages(actors):
    out = {}
    for actor in actors:
        stage = norm(actor_system(actor).get("stage")) or "unknown"
        out[stage] = out.get(stage, 0) + 1
    return dict(sorted(out.items()))


def count_categories(actors):
    out = {}
    for actor in actors:
        cat = norm(actor_system(actor).get("evolutionCategory")) or "normal"
        out[cat] = out.get(cat, 0) + 1
    return dict(sorted(out.items()))


def main():
    parser = argparse.ArgumentParser(description="Aplica overrides manuais v3 à base Digimon DDA.")
    parser.add_argument("--input", type=Path, default=None)
    parser.add_argument("--overrides", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--replace-complete", action="store_true", help="Também substitui output/all_digimon_complete.json pelo resultado curado.")
    args = parser.parse_args()

    input_path = args.input or pick_existing(DEFAULT_INPUTS)
    override_path = args.overrides or pick_existing(DEFAULT_OVERRIDES)
    if not input_path:
        raise SystemExit("Nenhum arquivo de entrada encontrado.")
    if not override_path:
        raise SystemExit("Nenhum arquivo de overrides encontrado.")

    data = json.loads(input_path.read_text(encoding="utf-8"))
    overrides = json.loads(override_path.read_text(encoding="utf-8"))
    actors = data.get("actors", [])

    before_count = len(actors)
    before_stages = count_stages(actors)
    before_categories = count_categories(actors)

    by_name, by_compact = build_name_maps(actors)

    created_rows = []
    for name, spec in (overrides.get("createActors") or {}).items():
        existing = resolve_actor(name, by_name, by_compact)
        if existing:
            apply_metadata(existing, spec)
            set_stage_and_category(existing, spec.get("stage"), spec.get("category"))
            created_rows.append({"name": name, "action": "updatedExisting", "stage": actor_system(existing).get("stage"), "category": actor_system(existing).get("evolutionCategory"), "reason": spec.get("reason", "")})
            continue
        actor = make_actor(name, spec)
        actors.append(actor)
        created_rows.append({"name": name, "action": "created", "stage": actor_system(actor).get("stage"), "category": actor_system(actor).get("evolutionCategory"), "reason": spec.get("reason", "")})
    by_name, by_compact = build_name_maps(actors)

    missing = []
    merged_rows = []
    stage_rows = []
    to_remove = set()

    for identifier, override in (overrides.get("actors") or {}).items():
        actor = resolve_actor(identifier, by_name, by_compact)
        if not actor:
            missing.append(identifier)
            continue
        merge_into = override.get("mergeInto")
        if merge_into:
            canonical = resolve_actor(merge_into, by_name, by_compact)
            if not canonical:
                missing.append(f"{identifier} -> {merge_into}")
                continue
            if canonical is actor:
                continue
            merge_actor_data(canonical, actor)
            to_remove.add(id(actor))
            merged_rows.append({
                "duplicate": actor.get("name"), "canonical": canonical.get("name"),
                "duplicateStage": actor_system(actor).get("stage"), "canonicalStage": actor_system(canonical).get("stage"),
                "reason": override.get("reason", ""),
            })
            # Apply metadata/stage intended for duplicate onto canonical when supplied.
            if override.get("stage") or override.get("category"):
                before_stage = actor_system(canonical).get("stage")
                before_cat = actor_system(canonical).get("evolutionCategory") or "normal"
                set_stage_and_category(canonical, override.get("stage"), override.get("category"))
                after_stage = actor_system(canonical).get("stage")
                after_cat = actor_system(canonical).get("evolutionCategory") or "normal"
                if before_stage != after_stage or before_cat != after_cat:
                    stage_rows.append({"name": canonical.get("name"), "beforeStage": before_stage, "afterStage": after_stage, "beforeCategory": before_cat, "afterCategory": after_cat, "reason": override.get("reason", "")})
            apply_metadata(canonical, override)
            continue

        before_stage = actor_system(actor).get("stage")
        before_cat = actor_system(actor).get("evolutionCategory") or "normal"
        set_stage_and_category(actor, override.get("stage"), override.get("category"))
        apply_metadata(actor, override)
        after_stage = actor_system(actor).get("stage")
        after_cat = actor_system(actor).get("evolutionCategory") or "normal"
        if before_stage != after_stage or before_cat != after_cat:
            stage_rows.append({"name": actor.get("name"), "beforeStage": before_stage, "afterStage": after_stage, "beforeCategory": before_cat, "afterCategory": after_cat, "reason": override.get("reason", "")})

    if to_remove:
        actors[:] = [actor for actor in actors if id(actor) not in to_remove]

    data["actors"] = actors
    data.setdefault("curation", {})["lastAppliedOverrides"] = str(override_path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.replace_complete:
        complete_path = Path("output/all_digimon_complete.json")
        complete_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.output, complete_path)

    after_count = len(actors)
    report = {
        "input": str(input_path),
        "overrides": str(override_path),
        "output": str(args.output),
        "beforeActorCount": before_count,
        "afterActorCount": after_count,
        "createdOrUpdatedActorCount": len(created_rows),
        "removedDuplicateCount": len(merged_rows),
        "stageChangeCount": len(stage_rows),
        "missingOverrideTargetCount": len(missing),
        "missingOverrideTargets": missing,
        "stageCountsBefore": before_stages,
        "stageCountsAfter": count_stages(actors),
        "categoryCountsBefore": before_categories,
        "categoryCountsAfter": count_categories(actors),
        "createdSample": created_rows[:50],
        "mergedSample": merged_rows[:50],
        "stageChangeSample": stage_rows[:80],
    }
    DEFAULT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    for path, rows, headers in [
        (DEFAULT_DUPES_CSV, merged_rows, ["duplicate", "canonical", "duplicateStage", "canonicalStage", "reason"]),
        (DEFAULT_STAGE_CSV, stage_rows, ["name", "beforeStage", "afterStage", "beforeCategory", "afterCategory", "reason"]),
        (DEFAULT_CREATED_CSV, created_rows, ["name", "action", "stage", "category", "reason"]),
    ]:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
