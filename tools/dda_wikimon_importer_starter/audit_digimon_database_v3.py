import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

INPUT_JSON = Path("output/all_digimon_with_evolution_index_v5.json")
INPUT_UNRESOLVED = Path("output/evolution_index_unresolved_v5.csv")
OUT_DIR = Path("output/audit_v5")

STAGE_ORDER = {
    "baby1": 0,
    "baby2": 1,
    "child": 2,
    "adult": 3,
    "perfect": 4,
    "ultimate": 5,
    "ultimatePlus": 6,
}

STAGE_WORDS = {
    "baby i": "baby1",
    "baby 1": "baby1",
    "baby ii": "baby2",
    "baby 2": "baby2",
    "child": "child",
    "rookie": "child",
    "adult": "adult",
    "champion": "adult",
    "perfect": "perfect",
    "mega": "ultimate",
    "ultimate": "ultimate",
}

VARIANT_SEPARATORS = [":", "(", " - "]
COLOR_OR_MODE_WORDS = [
    "blue", "green", "red", "black", "white", "gold", "silver", "violet", "orange",
    "holy", "dark", "vaccine", "virus", "data", "deva", "awakened", "version",
]


def norm(value):
    return str(value or "").strip()


def compact(value):
    return re.sub(r"[^a-z0-9]+", "", norm(value).lower())


def canonical_space(value):
    text = norm(value)
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = text.replace("_", " ").replace("-", " ").replace(":", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def base_name_guess(name):
    text = norm(name)
    for sep in VARIANT_SEPARATORS:
        if sep in text:
            text = text.split(sep, 1)[0]
    spaced = canonical_space(text)
    parts = spaced.split()
    while parts and parts[-1].lower() in COLOR_OR_MODE_WORDS:
        parts.pop()
    return " ".join(parts).strip()


def load_json(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("actors", data if isinstance(data, list) else [])


def actor_identity_keys(actor):
    system = actor.get("system", {})
    values = [
        actor.get("name"),
        system.get("species"),
        system.get("sourceId"),
    ]

    aliases = system.get("aliases") or []
    if isinstance(aliases, list):
        values.extend(aliases)

    display = system.get("displayNames") or {}
    if isinstance(display, dict):
        values.extend(display.values())

    out = set()
    for value in values:
        key = compact(value)
        if key:
            out.add(key)
    return out


def stage_hint_from_name(name):
    text = canonical_space(name).lower()

    # Detect explicit parenthetical/suffix stage tags first.
    patterns = [
        (r"\bbaby\s*i\b", "baby1"),
        (r"\bbaby\s*1\b", "baby1"),
        (r"\bbaby\s*ii\b", "baby2"),
        (r"\bbaby\s*2\b", "baby2"),
        (r"\bchild\b", "child"),
        (r"\badult\b", "adult"),
        (r"\bperfect\b", "perfect"),
        (r"\bultimate\b", "ultimate"),
    ]
    for pattern, stage in patterns:
        if re.search(pattern, text):
            return stage
    return ""


def read_unresolved(path):
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})


def main():
    if not INPUT_JSON.exists():
        raise SystemExit(f"Arquivo não encontrado: {INPUT_JSON}")

    actors = load_json(INPUT_JSON)
    unresolved_rows = read_unresolved(INPUT_UNRESOLVED)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1) Duplicatas/colisões de identidade.
    key_to_names = defaultdict(set)
    name_to_actor = {}

    for actor in actors:
        name = norm(actor.get("name"))
        name_to_actor[name] = actor
        for key in actor_identity_keys(actor):
            key_to_names[key].add(name)

    duplicate_rows = []
    for key, names in sorted(key_to_names.items()):
        unique_names = sorted(names)
        if len(unique_names) <= 1:
            continue
        stages = sorted({norm(name_to_actor[n].get("system", {}).get("stage")) for n in unique_names})
        categories = sorted({norm(name_to_actor[n].get("system", {}).get("evolutionCategory")) for n in unique_names})
        duplicate_rows.append({
            "key": key,
            "count": len(unique_names),
            "names": " | ".join(unique_names),
            "stages": " | ".join(stages),
            "categories": " | ".join(categories),
        })

    duplicate_rows.sort(key=lambda r: (-int(r["count"]), r["key"]))

    # 2) Anomalias de estágio.
    base_to_actors = defaultdict(list)
    for actor in actors:
        base = compact(base_name_guess(actor.get("name")))
        if base:
            base_to_actors[base].append(actor)

    stage_anomaly_rows = []

    for actor in actors:
        name = norm(actor.get("name"))
        system = actor.get("system", {})
        stage = norm(system.get("stage"))
        category = norm(system.get("evolutionCategory")) or "normal"

        explicit_hint = stage_hint_from_name(name)
        if explicit_hint and explicit_hint != stage:
            stage_anomaly_rows.append({
                "name": name,
                "stage": stage,
                "category": category,
                "reason": "name_stage_hint_mismatch",
                "expectedOrReference": explicit_hint,
                "details": f"O nome sugere {explicit_hint}, mas o ator está como {stage}.",
            })

    for base, group in sorted(base_to_actors.items()):
        if len(group) <= 1:
            continue
        stages = Counter(norm(a.get("system", {}).get("stage")) for a in group)
        if len(stages) <= 1:
            continue

        # Only flag variant-looking groups, not entire evolutionary families.
        names = [norm(a.get("name")) for a in group]
        variant_like = any(any(sep in n for sep in VARIANT_SEPARATORS) for n in names) or any(
            canonical_space(n).split()[-1].lower() in COLOR_OR_MODE_WORDS
            for n in names if canonical_space(n).split()
        )
        if not variant_like:
            continue

        majority_stage, majority_count = stages.most_common(1)[0]
        for actor in group:
            name = norm(actor.get("name"))
            system = actor.get("system", {})
            stage = norm(system.get("stage"))
            category = norm(system.get("evolutionCategory")) or "normal"
            if stage != majority_stage:
                stage_anomaly_rows.append({
                    "name": name,
                    "stage": stage,
                    "category": category,
                    "reason": "variant_family_stage_outlier",
                    "expectedOrReference": majority_stage,
                    "details": f"Grupo base '{base}' tem estágios {dict(stages)}; este ator difere da maioria.",
                })

    # 3) Resumo do unresolved agrupado por ator.
    actor_summary = defaultdict(lambda: {
        "actor": "",
        "stage": "",
        "category": "",
        "total": 0,
        "fromCount": 0,
        "toCount": 0,
        "missing": 0,
        "ambiguous": 0,
        "sourceTypes": Counter(),
        "targets": Counter(),
    })

    for row in unresolved_rows:
        actor = norm(row.get("actor"))
        item = actor_summary[actor]
        item["actor"] = actor
        item["stage"] = norm(row.get("stage"))
        item["category"] = norm(row.get("category"))
        item["total"] += 1
        direction = norm(row.get("direction"))
        if direction.lower() == "from":
            item["fromCount"] += 1
        if direction.lower() == "to":
            item["toCount"] += 1
        status = norm(row.get("status"))
        if status == "missing":
            item["missing"] += 1
        if status == "ambiguous":
            item["ambiguous"] += 1
        item["sourceTypes"][norm(row.get("sourceType")) or "unknown"] += 1
        item["targets"][norm(row.get("target"))] += 1

    unresolved_summary_rows = []
    for actor, item in actor_summary.items():
        unresolved_summary_rows.append({
            "actor": item["actor"],
            "stage": item["stage"],
            "category": item["category"],
            "total": item["total"],
            "fromCount": item["fromCount"],
            "toCount": item["toCount"],
            "missing": item["missing"],
            "ambiguous": item["ambiguous"],
            "sourceTypes": " | ".join(f"{k}:{v}" for k, v in item["sourceTypes"].most_common()),
            "topTargets": " | ".join(f"{k}:{v}" for k, v in item["targets"].most_common(12)),
        })

    unresolved_summary_rows.sort(key=lambda r: (-int(r["total"]), r["actor"]))

    # 4) Geral.
    stage_counts = Counter(norm(a.get("system", {}).get("stage")) for a in actors)
    category_counts = Counter(norm(a.get("system", {}).get("evolutionCategory")) for a in actors)

    report = {
        "actorCount": len(actors),
        "stageCounts": dict(sorted(stage_counts.items())),
        "categoryCounts": dict(sorted(category_counts.items())),
        "duplicateIdentityGroupCount": len(duplicate_rows),
        "stageAnomalyCount": len(stage_anomaly_rows),
        "unresolvedRelationCount": len(unresolved_rows),
        "unresolvedActorCount": len(unresolved_summary_rows),
        "topUnresolvedActors": unresolved_summary_rows[:25],
        "stageAnomalySample": stage_anomaly_rows[:50],
        "duplicateIdentitySample": duplicate_rows[:50],
    }

    (OUT_DIR / "digimon_audit_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(OUT_DIR / "duplicate_identity_report.csv", duplicate_rows, ["key", "count", "names", "stages", "categories"])
    write_csv(OUT_DIR / "stage_anomaly_report.csv", stage_anomaly_rows, ["name", "stage", "category", "reason", "expectedOrReference", "details"])
    write_csv(OUT_DIR / "evolution_unresolved_summary.csv", unresolved_summary_rows, ["actor", "stage", "category", "total", "fromCount", "toCount", "missing", "ambiguous", "sourceTypes", "topTargets"])

    print(f"OK: {OUT_DIR / 'digimon_audit_report.json'}")
    print(f"OK: {OUT_DIR / 'duplicate_identity_report.csv'}")
    print(f"OK: {OUT_DIR / 'stage_anomaly_report.csv'}")
    print(f"OK: {OUT_DIR / 'evolution_unresolved_summary.csv'}")
    print()
    print("Atores:", len(actors))
    print("Grupos de identidade duplicada:", len(duplicate_rows))
    print("Anomalias de estágio:", len(stage_anomaly_rows))
    print("Relações unresolved:", len(unresolved_rows))
    print("Atores com unresolved:", len(unresolved_summary_rows))


if __name__ == "__main__":
    main()
