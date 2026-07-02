import copy
import csv
import json
import re
import zipfile
from pathlib import Path

BASE_PATH = Path("output/all_digimon_postprocessed.json")
RETRY_PATH = Path("output/retry_digimon.json")
OLD_ZIP_PATH = Path("Databases antigas.zip")

OUT_PATH = Path("output/all_digimon_complete.json")
REPORT_PATH = Path("output/fallback_report.json")
CSV_PATH = Path("output/fallback_manual_review.csv")

IMAGE_PREFIX = "systems/digimon-digital-adventures/assets/digimon/imported"

STAGE_VALUE = {
    "baby1": 0,
    "baby2": 1,
    "child": 2,
    "adult": 3,
    "perfect": 4,
    "ultimate": 5,
    "ultimatePlus": 6,
}

PACK_STAGE_BY_FILE = {
    "baby1": "baby1",
    "baby2": "baby2",
    "child": "child",
    "adult": "adult",
    "perfect": "perfect",
    "ultimate": "ultimate",
    "ultimateplus": "ultimatePlus",
    "armor": "adult",
    "hybrid": "adult",
}

CAMEL_BOUNDARY_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def norm(value):
    return str(value or "").strip()


def compact(value):
    return re.sub(r"[^a-z0-9]+", "", norm(value).lower())


def source_id_from_name(name):
    value = norm(name)
    value = value.replace("X-Antibody", "X Antibody")
    value = CAMEL_BOUNDARY_RE.sub("_", value)
    value = re.sub(r"[^A-Za-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_").lower()
    return value or compact(name)


def detect_category(name, old_stage="", old_pack=""):
    haystack = f"{name} {old_stage} {old_pack}".lower()
    key = compact(haystack)

    if old_pack == "armor":
        return "armor"

    if old_pack == "hybrid":
        return "hybrid"

    if "xantibody" in key or "x antibody" in haystack or "x-antibody" in haystack:
        return "antibody"

    if "burstmode" in key or "burst mode" in haystack:
        return "burst"

    if "shoutmonx" in key or "xros" in key:
        return "xros"

    if "jogress" in haystack or "dna" in haystack:
        return "jogress"

    if "mode" in haystack:
        return "mode"

    if (
        "animeversion" in key
        or key.endswith("orange")
        or key.endswith("blue")
        or key.endswith("red")
        or key.endswith("green")
        or key.endswith("gold")
        or key.endswith("violet")
        or key.endswith("vaccine")
        or key.endswith("virus")
        or key.endswith("deva")
        or key.endswith("uver")
        or key.endswith("champion")
        or key.endswith("awakened")
        or key.endswith("version")
    ):
        return "variant"

    return "variant"


def pack_name_from_path(path):
    stem = Path(path).stem.lower()
    return stem


def build_old_database_index(zip_path):
    docs = {}
    images = {}

    with zipfile.ZipFile(zip_path) as zf:
        for entry in zf.namelist():
            if entry.startswith("digimon/") and entry.lower().endswith((".webp", ".png", ".jpg", ".jpeg")):
                image_name = Path(entry).name
                images[compact(Path(entry).stem)] = f"{IMAGE_PREFIX}/{image_name}"

        for entry in zf.namelist():
            if not (entry.startswith("packs-json/") and entry.endswith(".json")):
                continue

            pack_key = pack_name_from_path(entry)
            pack_stage = PACK_STAGE_BY_FILE.get(pack_key, pack_key)

            payload = json.loads(zf.read(entry).decode("utf-8"))
            for doc in payload.get("documents", []):
                name = norm(doc.get("name"))
                if not name:
                    continue

                key = compact(name)
                docs[key] = {
                    "pack": pack_key,
                    "stage": pack_stage,
                    "doc": doc,
                    "image": images.get(key),
                }

    return docs, images


def get_retry_titles(payload):
    titles = []
    seen = set()

    for error in payload.get("errors", []):
        title = norm(error.get("title"))
        if not title:
            continue

        key = compact(title)
        if key in seen:
            continue

        seen.add(key)
        titles.append(title)

    return titles


def make_fallback_actor(title, old_entry):
    old_doc = copy.deepcopy(old_entry["doc"])
    old_system = old_doc.setdefault("system", {})

    old_name = norm(old_doc.get("name")) or title
    species = norm(old_system.get("species")) or old_name
    stage = norm(old_system.get("stage")) or old_entry["stage"] or "unknown"
    category = detect_category(old_name, stage, old_entry["pack"])

    if old_entry["pack"] == "armor" or category == "armor":
        stage = "adult"

    if old_entry["pack"] == "hybrid" or category == "hybrid":
        stage = "adult"

    img = old_entry.get("image") or old_doc.get("img") or "icons/svg/mystery-man.svg"

    old_doc["name"] = old_name
    old_doc["type"] = old_doc.get("type") or "digimon"
    old_doc["img"] = img

    old_system["sourceId"] = norm(old_system.get("sourceId")) or source_id_from_name(old_name)
    old_system["species"] = species
    old_system["nickname"] = norm(old_system.get("nickname"))
    old_system["stage"] = stage
    old_system["stageValue"] = STAGE_VALUE.get(stage, old_system.get("stageValue", 0))
    old_system["evolutionCategory"] = category
    old_system["isSpecialForm"] = category != "normal"
    old_system["folderPath"] = stage if category == "normal" else f"{category}/{stage}"
    old_system["reviewRequired"] = True
    old_system["reviewReason"] = "Fallback criado a partir da database antiga porque a página do Wikimon não foi encontrada no retry."
    old_system["fallbackSource"] = {
        "fromOldDatabase": True,
        "oldPack": old_entry["pack"],
        "retryTitle": title,
        "missingWikimon": True,
    }

    old_system.setdefault("names", {
        "canonical": old_system["sourceId"],
        "original": species,
        "dub": species,
        "aliases": [species],
    })

    old_system.setdefault("officialReference", {
        "directoryName": "",
        "url": "",
        "displayName": species,
        "level": "",
        "type": norm(old_system.get("type")),
        "attribute": norm(old_system.get("attribute")),
        "imageUrl": "",
        "imageLocalPath": img,
        "related": [],
    })

    old_system.setdefault("wikimon", {
        "title": "",
        "url": "",
        "evolvesFrom": [],
        "evolvesTo": [],
        "evolvesFromRaw": [],
        "evolvesToRaw": [],
        "level": "",
        "type": norm(old_system.get("type")),
        "attribute": norm(old_system.get("attribute")),
        "field": norm(old_system.get("field")),
        "group": norm(old_system.get("group")),
        "rawGroup": norm(old_system.get("group")),
    })

    old_system.setdefault("evolutionHints", {
        "evolvesFrom": [],
        "evolvesTo": [],
    })

    return old_doc


def main():
    if not BASE_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {BASE_PATH}")

    if not RETRY_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {RETRY_PATH}")

    if not OLD_ZIP_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {OLD_ZIP_PATH}")

    base = json.loads(BASE_PATH.read_text(encoding="utf-8"))
    retry = json.loads(RETRY_PATH.read_text(encoding="utf-8"))
    actors = list(base.get("actors", []))

    old_docs, _old_images = build_old_database_index(OLD_ZIP_PATH)
    retry_titles = get_retry_titles(retry)

    existing = set()
    for actor in actors:
        system = actor.get("system", {})
        for value in [actor.get("name"), system.get("species"), system.get("sourceId")]:
            key = compact(value)
            if key:
                existing.add(key)

    added = []
    skipped_existing = []
    missing = []

    for title in retry_titles:
        key = compact(title)

        if key in existing:
            skipped_existing.append(title)
            continue

        old_entry = old_docs.get(key)
        if not old_entry:
            missing.append(title)
            continue

        actor = make_fallback_actor(title, old_entry)
        actors.append(actor)
        existing.add(key)
        existing.add(compact(actor.get("name")))
        existing.add(compact(actor.get("system", {}).get("species")))

        added.append({
            "title": title,
            "name": actor.get("name"),
            "species": actor.get("system", {}).get("species"),
            "stage": actor.get("system", {}).get("stage"),
            "category": actor.get("system", {}).get("evolutionCategory"),
            "folderPath": actor.get("system", {}).get("folderPath"),
            "img": actor.get("img"),
            "oldPack": old_entry["pack"],
        })

    base["actors"] = actors
    base["count"] = len(actors)
    base["fallbackMerge"] = {
        "retryInputCount": len(retry_titles),
        "fallbackAddedCount": len(added),
        "skippedExistingCount": len(skipped_existing),
        "missingCount": len(missing),
    }

    OUT_PATH.write_text(json.dumps(base, ensure_ascii=False, indent=2), encoding="utf-8")

    category_counts = {}
    stage_counts = {}
    for actor in actors:
        system = actor.get("system", {})
        category = norm(system.get("evolutionCategory")) or "normal"
        stage = norm(system.get("stage")) or "unknown"
        category_counts[category] = category_counts.get(category, 0) + 1
        stage_counts[stage] = stage_counts.get(stage, 0) + 1

    report = {
        "baseActorCount": len(base.get("actors", [])) - len(added),
        "finalActorCount": len(actors),
        "retryInputCount": len(retry_titles),
        "fallbackAddedCount": len(added),
        "skippedExistingCount": len(skipped_existing),
        "missingCount": len(missing),
        "stageCounts": dict(sorted(stage_counts.items())),
        "categoryCounts": dict(sorted(category_counts.items())),
        "added": added,
        "skippedExisting": skipped_existing,
        "missing": missing,
    }

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "title", "name", "species", "stage", "category", "folderPath", "img", "oldPack"
        ])
        writer.writeheader()
        writer.writerows(added)

    print(f"OK: {OUT_PATH}")
    print(f"OK: {REPORT_PATH}")
    print(f"OK: {CSV_PATH}")
    print()
    print(f"Base: {report['baseActorCount']}")
    print(f"Fallbacks adicionados: {report['fallbackAddedCount']}")
    print(f"Final: {report['finalActorCount']}")
    print(f"Faltando revisão manual: {report['missingCount']}")
    print("Stages:", report["stageCounts"])
    print("Categorias:", report["categoryCounts"])


if __name__ == "__main__":
    main()
