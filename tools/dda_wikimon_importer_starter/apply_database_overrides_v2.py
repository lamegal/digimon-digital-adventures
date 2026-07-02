import argparse
import csv
import json
import re
from copy import deepcopy
from pathlib import Path

DEFAULT_INPUTS = [
    Path("output/all_digimon_with_evolution_index_v3.json"),
    Path("output/all_digimon_complete.json"),
]
DEFAULT_OVERRIDES = [
    Path("output/database_overrides_v2.json"),
    Path("database_overrides_v2.json"),
    Path("output/database_overrides_v1.json"),
    Path("database_overrides_v1.json"),
]
DEFAULT_OUTPUT = Path("output/all_digimon_curated_v2.json")
DEFAULT_REPORT = Path("output/curation_report_v2.json")
DEFAULT_DUPES_CSV = Path("output/curation_merged_duplicates_v2.csv")
DEFAULT_STAGE_CSV = Path("output/curation_stage_changes_v2.csv")

STAGE_ORDER = {
    "baby1": 0,
    "baby2": 1,
    "child": 2,
    "adult": 3,
    "perfect": 4,
    "ultimate": 5,
    "ultimatePlus": 6,
}

SPECIAL_CATEGORIES = {"armor", "hybrid", "burst", "mode", "antibody", "variant", "jogress", "xros"}
EVOLUTION_INDEX_FIELDS = [
    "normalFrom", "normalTo",
    "candidateFrom", "candidateTo",
    "specialFrom", "specialTo",
    "candidateSpecialFrom", "candidateSpecialTo",
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
    aliases = []
    aliases.append(actor.get("name"))
    aliases.append(system.get("species"))
    aliases.append(system.get("sourceId"))
    aliases.extend(system.get("aliases") or [])
    display = system.get("display") or {}
    if isinstance(display, dict):
        aliases.extend(display.values())
    official = system.get("officialReference") or {}
    if isinstance(official, dict):
        aliases.append(official.get("name"))
        aliases.append(official.get("directoryName"))
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
        key = id(actor)
        if key not in seen:
            seen.add(key)
            unique.append(actor)
    if len(unique) == 1:
        return unique[0]
    return None


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


def merge_lists(target, source, key):
    target[key] = unique_preserve((target.get(key) or []) + (source.get(key) or []))


def merge_evolution_index(canonical, duplicate):
    can_sys = actor_system(canonical)
    dup_sys = actor_system(duplicate)
    can_idx = can_sys.setdefault("evolutionIndex", {})
    dup_idx = dup_sys.get("evolutionIndex") or {}
    for field in EVOLUTION_INDEX_FIELDS:
        merge_lists(can_idx, dup_idx, field)
    for field in ["rawFrom", "rawTo"]:
        merge_lists(can_idx, dup_idx, field)
    can_idx["reviewRequired"] = bool(can_idx.get("reviewRequired") or dup_idx.get("reviewRequired"))


def rewrite_entry_reference(entry, duplicate_actor, canonical_actor):
    if not isinstance(entry, dict):
        return entry
    dup_sys = actor_system(duplicate_actor)
    can_sys = actor_system(canonical_actor)
    dup_names = {norm(duplicate_actor.get("name")), norm(dup_sys.get("species")), norm(dup_sys.get("sourceId"))}
    dup_compacts = {compact(x) for x in dup_names if x}
    entry_name = norm(entry.get("name"))
    entry_species = norm(entry.get("species"))
    entry_key = compact(entry.get("key") or entry_name or entry_species)
    if compact(entry_name) in dup_compacts or compact(entry_species) in dup_compacts or entry_key in dup_compacts:
        entry = dict(entry)
        entry["key"] = compact(canonical_actor.get("name"))
        entry["name"] = canonical_actor.get("name")
        entry["species"] = can_sys.get("species") or canonical_actor.get("name")
        entry["stage"] = can_sys.get("stage")
        entry["evolutionCategory"] = can_sys.get("evolutionCategory") or "normal"
        entry["folderPath"] = can_sys.get("folderPath")
        entry["img"] = canonical_actor.get("img")
    return entry


def rewrite_all_references(actors, duplicate_actor, canonical_actor):
    for actor in actors:
        idx = actor_system(actor).get("evolutionIndex") or {}
        for field in EVOLUTION_INDEX_FIELDS:
            if isinstance(idx.get(field), list):
                idx[field] = [rewrite_entry_reference(entry, duplicate_actor, canonical_actor) for entry in idx[field]]
        for field in ["rawFrom", "rawTo"]:
            # Mantém raw original como histórico; não reescreve texto bruto.
            pass


def collect_merge_aliases(canonical, duplicate):
    can_sys = actor_system(canonical)
    aliases = []
    aliases.extend(can_sys.get("aliases") or [])
    aliases.extend(actor_aliases(duplicate))
    aliases.append(duplicate.get("name"))
    aliases.append(actor_system(duplicate).get("species"))
    can_sys["aliases"] = unique_preserve(aliases)
    audit = can_sys.setdefault("curation", {})
    audit["mergedDuplicateNames"] = unique_preserve((audit.get("mergedDuplicateNames") or []) + [duplicate.get("name")])


def apply_overrides(data, overrides):
    actors = data.get("actors", [])
    by_name, by_compact = build_name_maps(actors)
    actor_overrides = overrides.get("actors") or {}

    stage_changes = []
    missing_override_targets = []

    # 1) Correções de stage/categoria antes dos merges.
    for identifier, patch in actor_overrides.items():
        actor = resolve_actor(identifier, by_name, by_compact)
        if actor is None:
            missing_override_targets.append(identifier)
            continue

        system = actor_system(actor)
        before_stage = norm(system.get("stage")) or "unknown"
        before_category = norm(system.get("evolutionCategory")) or "normal"

        stage = patch.get("stage")
        category = patch.get("category")
        if stage or category:
            set_stage_and_category(actor, stage=stage, category=category)
            after_stage = norm(system.get("stage")) or "unknown"
            after_category = norm(system.get("evolutionCategory")) or "normal"
            if before_stage != after_stage or before_category != after_category:
                stage_changes.append({
                    "name": actor.get("name"),
                    "beforeStage": before_stage,
                    "afterStage": after_stage,
                    "beforeCategory": before_category,
                    "afterCategory": after_category,
                    "reason": patch.get("reason", "manual_override"),
                })
            curation = system.setdefault("curation", {})
            curation["manualStageOverride"] = True
            curation["manualOverrideReason"] = patch.get("reason", "manual_override")
            if patch.get("source"):
                curation["manualOverrideSource"] = patch.get("source")

    # Reconstrói mapas depois de corrigir nomes/categorias/stages.
    by_name, by_compact = build_name_maps(actors)

    # 2) Merges explícitos.
    to_remove_ids = set()
    merged_rows = []

    for identifier, patch in actor_overrides.items():
        merge_into = patch.get("mergeInto")
        if not merge_into:
            continue

        duplicate = resolve_actor(identifier, by_name, by_compact)
        canonical = resolve_actor(merge_into, by_name, by_compact)

        if duplicate is None or canonical is None:
            missing_override_targets.append(f"merge {identifier} -> {merge_into}")
            continue
        if duplicate is canonical:
            continue

        collect_merge_aliases(canonical, duplicate)
        merge_evolution_index(canonical, duplicate)
        rewrite_all_references(actors, duplicate, canonical)

        to_remove_ids.add(id(duplicate))
        merged_rows.append({
            "duplicate": duplicate.get("name"),
            "canonical": canonical.get("name"),
            "duplicateStage": actor_system(duplicate).get("stage"),
            "canonicalStage": actor_system(canonical).get("stage"),
            "reason": patch.get("reason", "manual_merge"),
        })

    data["actors"] = [actor for actor in actors if id(actor) not in to_remove_ids]
    data["count"] = len(data["actors"])

    # 3) Marca atores ainda citados como revisão, se vierem de overrides reviewOnly.
    for identifier, patch in actor_overrides.items():
        if not patch.get("reviewOnly"):
            continue
        actor = resolve_actor(identifier, *build_name_maps(data["actors"]))
        if actor:
            system = actor_system(actor)
            curation = system.setdefault("curation", {})
            curation["reviewOnly"] = True
            curation["reviewReason"] = patch.get("reason", "manual_review")

    return {
        "mergedRows": merged_rows,
        "stageChanges": stage_changes,
        "missingOverrideTargets": sorted(set(missing_override_targets)),
    }


def count_by(data, path):
    counts = {}
    for actor in data.get("actors", []):
        value = actor
        for part in path:
            value = value.get(part, {}) if isinstance(value, dict) else {}
        if isinstance(value, dict):
            value = "unknown"
        value = norm(value) or "unknown"
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def write_csv(path, rows, columns):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(description="Aplica overrides manuais e deduplica a base Digimon DDA.")
    parser.add_argument("--input", default=None, help="JSON de entrada. Padrão: output/all_digimon_with_evolution_index_v3.json")
    parser.add_argument("--overrides", default=None, help="JSON de overrides. Padrão: output/database_overrides_v1.json")
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT), help="JSON de saída curado.")
    parser.add_argument("--replace-complete", action="store_true", help="Também grava output/all_digimon_complete.json com a base curada. Use só depois de revisar.")
    args = parser.parse_args()

    input_path = Path(args.input) if args.input else pick_existing(DEFAULT_INPUTS)
    overrides_path = Path(args.overrides) if args.overrides else pick_existing(DEFAULT_OVERRIDES)

    if not input_path or not input_path.exists():
        raise SystemExit("Arquivo de entrada não encontrado. Rode o V3 ou informe --input.")
    if not overrides_path or not overrides_path.exists():
        raise SystemExit("Arquivo de overrides não encontrado. Coloque database_overrides_v2.json na pasta output ou informe --overrides.")

    data = json.loads(input_path.read_text(encoding="utf-8"))
    overrides = json.loads(overrides_path.read_text(encoding="utf-8"))

    before_count = len(data.get("actors", []))
    before_stage_counts = count_by(data, ["system", "stage"])
    before_category_counts = count_by(data, ["system", "evolutionCategory"])

    result = apply_overrides(data, overrides)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.replace_complete:
        Path("output/all_digimon_complete.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    report = {
        "input": str(input_path),
        "overrides": str(overrides_path),
        "output": str(out_path),
        "beforeActorCount": before_count,
        "afterActorCount": len(data.get("actors", [])),
        "removedDuplicateCount": len(result["mergedRows"]),
        "stageChangeCount": len(result["stageChanges"]),
        "missingOverrideTargetCount": len(result["missingOverrideTargets"]),
        "missingOverrideTargets": result["missingOverrideTargets"],
        "stageCountsBefore": before_stage_counts,
        "stageCountsAfter": count_by(data, ["system", "stage"]),
        "categoryCountsBefore": before_category_counts,
        "categoryCountsAfter": count_by(data, ["system", "evolutionCategory"]),
        "mergedSample": result["mergedRows"][:50],
        "stageChangeSample": result["stageChanges"][:50],
    }

    DEFAULT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    write_csv(DEFAULT_DUPES_CSV, result["mergedRows"], ["duplicate", "canonical", "duplicateStage", "canonicalStage", "reason"])
    write_csv(DEFAULT_STAGE_CSV, result["stageChanges"], ["name", "beforeStage", "afterStage", "beforeCategory", "afterCategory", "reason"])

    print(f"OK: {out_path}")
    print(f"OK: {DEFAULT_REPORT}")
    print(f"OK: {DEFAULT_DUPES_CSV}")
    print(f"OK: {DEFAULT_STAGE_CSV}")
    print()
    print(f"Atores: {before_count} -> {len(data.get('actors', []))}")
    print(f"Duplicatas removidas: {len(result['mergedRows'])}")
    print(f"Correções de estágio/categoria: {len(result['stageChanges'])}")
    if result["missingOverrideTargets"]:
        print(f"Overrides não encontrados: {len(result['missingOverrideTargets'])}")


if __name__ == "__main__":
    main()
