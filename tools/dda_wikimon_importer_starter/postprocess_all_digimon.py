import json
import re
from pathlib import Path


INPUT_PATH = Path("output/all_digimon.json")
OUTPUT_PATH = Path("output/all_digimon_postprocessed.json")
RETRY_PATH = Path("output/retry_pages.txt")
REPORT_PATH = Path("output/postprocess_report.json")


STAGE_ORDER = {
    "baby1": 0,
    "baby2": 1,
    "child": 2,
    "adult": 3,
    "perfect": 4,
    "ultimate": 5,
    "ultimatePlus": 6,
}


def norm(value):
    return str(value or "").strip()


def compact(value):
    return re.sub(r"[^a-z0-9]+", "", norm(value).lower())


def detect_special_category(actor):
    system = actor.get("system", {})

    existing_category = norm(system.get("evolutionCategory"))

    if existing_category and existing_category != "normal":
        return existing_category

    name = norm(actor.get("name"))
    species = norm(system.get("species"))
    source_id = norm(system.get("sourceId"))
    stage = norm(system.get("stage"))

    haystack = " ".join([name, species, source_id, stage]).lower()
    compact_haystack = compact(haystack)

    if "xantibody" in compact_haystack or "x antibody" in haystack or "x-antibody" in haystack:
        return "antibody"

    if "burst mode" in haystack or "burstmode" in compact_haystack:
        return "burst"

    if "mode" in haystack:
        return "mode"

    if stage.lower() == "armor":
        return "armor"

    if stage.lower() == "hybrid":
        return "hybrid"

    if "jogress" in haystack or "dna" in haystack:
        return "jogress"

    return "normal"


def normalize_level_text(value):
    return (
        norm(value)
        .lower()
        .replace("Ⅰ", "i")
        .replace("Ⅱ", "ii")
        .replace("ⅰ", "i")
        .replace("ⅱ", "ii")
    )


def normalize_stage(actor):
    system = actor.setdefault("system", {})
    stage = norm(system.get("stage"))
    stage_key = compact(stage)

    official = system.get("officialReference") or {}
    wikimon = system.get("wikimon") or {}

    category = detect_special_category(actor)

    # Categorias especiais não devem ser estágios reais.
    if stage_key == "armor" or category == "armor":
        return "adult"

    if stage_key == "hybrid" or category == "hybrid":
        # Fallback seguro por enquanto. Depois auditamos híbridos caso a caso.
        return "adult"

    official_level = normalize_level_text(official.get("level"))

    # Reference Book oficial em inglês:
    # In-Training I -> baby1
    # In-Training II -> baby2
    # Rookie -> child
    # Champion -> adult
    # Ultimate -> perfect
    # Mega -> ultimate
    if official_level:
        # Sempre checar II antes de I, porque "ii" contém "i".
        if (
            "in-training ii" in official_level
            or "in training ii" in official_level
            or "in-training 2" in official_level
            or "baby ii" in official_level
            or "baby 2" in official_level
        ):
            return "baby2"

        if (
            "in-training i" in official_level
            or "in training i" in official_level
            or "in-training 1" in official_level
            or "baby i" in official_level
            or "baby 1" in official_level
        ):
            return "baby1"

        if "rookie" in official_level:
            return "child"

        if "champion" in official_level:
            return "adult"

        if "super ultimate" in official_level or "ultra" in official_level:
            return "ultimatePlus"

        if "mega" in official_level:
            return "ultimate"

        if "ultimate" in official_level:
            return "perfect"

    wikimon_level = normalize_level_text(wikimon.get("level"))

    # Wikimon usa o esquema japonês:
    # Child -> child
    # Adult -> adult
    # Perfect -> perfect
    # Ultimate -> ultimate
    if wikimon_level:
        if (
            "baby ii" in wikimon_level
            or "baby 2" in wikimon_level
            or "in-training ii" in wikimon_level
            or "in training ii" in wikimon_level
        ):
            return "baby2"

        if (
            "baby i" in wikimon_level
            or "baby 1" in wikimon_level
            or "in-training i" in wikimon_level
            or "in training i" in wikimon_level
        ):
            return "baby1"

        if "child" in wikimon_level:
            return "child"

        if "adult" in wikimon_level:
            return "adult"

        if "perfect" in wikimon_level:
            return "perfect"

        if "super ultimate" in wikimon_level or "ultra" in wikimon_level:
            return "ultimatePlus"

        if "ultimate" in wikimon_level:
            return "ultimate"

    if stage_key in STAGE_ORDER:
        return stage

    return stage or "unknown"


def normalize_error_title_for_retry(title):
    raw = norm(title)

    # XAntibody / Xantibody / X antibody -> X-Antibody
    raw = re.sub(r"X\s*Antibody", "X-Antibody", raw, flags=re.IGNORECASE)
    raw = re.sub(r"Xantibody", "X-Antibody", raw, flags=re.IGNORECASE)

    # Alguns nomes vieram colados do banco antigo.
    raw = re.sub(r"2006AnimeVersion$", " 2006 Anime Version", raw)
    raw = re.sub(r"2010AnimeVersion$", " 2010 Anime Version", raw)
    raw = re.sub(r"WerewolfMode$", " Werewolf Mode", raw)
    raw = re.sub(r"ScatterMode$", " Scatter Mode", raw)

    # Variações comuns.
    raw = raw.replace("BlackX-Antibody", "Black X-Antibody")
    raw = raw.replace("BlueX-Antibody", "Blue X-Antibody")

    return raw.strip()


def main():
    if not INPUT_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {INPUT_PATH}")

    data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    actors = data.get("actors", [])
    errors = data.get("errors", [])

    stage_before = {}
    stage_after = {}
    category_counts = {}
    changed = []

    for actor in actors:
        system = actor.setdefault("system", {})

        before_stage = norm(system.get("stage")) or "unknown"
        stage_before[before_stage] = stage_before.get(before_stage, 0) + 1

        category = detect_special_category(actor)
        after_stage = normalize_stage(actor)

        system["stage"] = after_stage
        system["evolutionCategory"] = category
        system["isSpecialForm"] = category != "normal"

        # Campo auxiliar útil para importar em pastas.
        system["folderPath"] = after_stage if category == "normal" else f"{category}/{after_stage}"

        stage_after[after_stage] = stage_after.get(after_stage, 0) + 1
        category_counts[category] = category_counts.get(category, 0) + 1

        if before_stage != after_stage or category != "normal":
            changed.append({
                "name": actor.get("name"),
                "species": system.get("species"),
                "beforeStage": before_stage,
                "afterStage": after_stage,
                "evolutionCategory": category,
                "folderPath": system["folderPath"],
            })

    retry_titles = []
    seen = set()

    for error in errors:
        title = norm(error.get("title"))
        if not title:
            continue

        retry = normalize_error_title_for_retry(title)

        if retry not in seen:
            seen.add(retry)
            retry_titles.append(retry)

    data["count"] = len(actors)
    data["postprocess"] = {
        "stageBefore": dict(sorted(stage_before.items())),
        "stageAfter": dict(sorted(stage_after.items())),
        "categoryCounts": dict(sorted(category_counts.items())),
        "changedCount": len(changed),
        "retryCount": len(retry_titles),
    }

    OUTPUT_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    RETRY_PATH.write_text(
        "\n".join(retry_titles) + ("\n" if retry_titles else ""),
        encoding="utf-8"
    )

    REPORT_PATH.write_text(
        json.dumps({
            "stageBefore": dict(sorted(stage_before.items())),
            "stageAfter": dict(sorted(stage_after.items())),
            "categoryCounts": dict(sorted(category_counts.items())),
            "changedCount": len(changed),
            "retryCount": len(retry_titles),
            "changedSamples": changed[:100],
            "retrySamples": retry_titles[:100],
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"OK: {OUTPUT_PATH}")
    print(f"OK: {RETRY_PATH}")
    print(f"OK: {REPORT_PATH}")
    print()
    print("Stages antes:", dict(sorted(stage_before.items())))
    print("Stages depois:", dict(sorted(stage_after.items())))
    print("Categorias:", dict(sorted(category_counts.items())))
    print("Para retentar:", len(retry_titles))


if __name__ == "__main__":
    main()