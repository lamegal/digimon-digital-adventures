from __future__ import annotations

import argparse
import json
import re
import shutil
import zipfile
from collections import Counter
from copy import deepcopy
from pathlib import Path
from typing import Any


NORMAL_STAGE_ORDER = ["baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"]
SPECIAL_STAGES = {"armor", "hybrid", "xrosWars", "unknown"}

STAGE_VALUES = {
    "baby1": 0,
    "baby2": 1,
    "child": 2,
    "adult": 3,
    "perfect": 4,
    "ultimate": 5,
    "ultimatePlus": 6,
    "armor": 3,
    "hybrid": 3,
    "xrosWars": 3,
    "unknown": 2,
}

OLD_JS_CANDIDATES = [
    "dda-digimon-actor-database.v5.imagepatched.js",
    "dda-digimon-actor-database.generated.js",
]

PACK_JSON_PREFIX = "packs-json/"
IMAGE_PREFIX = "digimon/"


def normalize_key(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = text.replace("&", " and ")
    text = text.replace("'", "")
    text = re.sub(r"\(.*?\)", " ", text)
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def compact_filename_key(value: Any) -> str:
    return normalize_key(Path(str(value or "")).stem)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_actors_payload(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    payload = read_json(path)
    if isinstance(payload, list):
        return {"schema": "dda-actor-list", "version": 1}, payload
    if isinstance(payload, dict) and isinstance(payload.get("actors"), list):
        return payload, payload["actors"]
    if isinstance(payload, dict) and isinstance(payload.get("documents"), list):
        return payload, payload["documents"]
    raise ValueError(f"Formato não reconhecido para atores: {path}")


def load_old_js_entries(archive: zipfile.ZipFile) -> list[dict[str, Any]]:
    names = set(archive.namelist())
    for candidate in OLD_JS_CANDIDATES:
        if candidate in names:
            text = archive.read(candidate).decode("utf-8", errors="replace")
            start = text.find("[")
            end = text.rfind("];" )
            if start >= 0 and end > start:
                return json.loads(text[start:end + 1])

    js_candidates = [name for name in archive.namelist() if name.endswith(".js") and "database" in name.lower()]
    if not js_candidates:
        return []

    text = archive.read(js_candidates[0]).decode("utf-8", errors="replace")
    start = text.find("[")
    end = text.rfind("];" )
    if start < 0 or end <= start:
        return []
    return json.loads(text[start:end + 1])


def load_old_foundry_documents(archive: zipfile.ZipFile) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for name in archive.namelist():
        if not name.startswith(PACK_JSON_PREFIX) or not name.endswith(".json"):
            continue
        data = json.loads(archive.read(name).decode("utf-8", errors="replace"))
        for doc in data.get("documents") or []:
            if isinstance(doc, dict) and doc.get("type") == "digimon":
                doc = deepcopy(doc)
                doc.setdefault("flags", {})
                doc["flags"].setdefault("dda-old-database", {})["sourcePack"] = name
                docs.append(doc)
    return docs


def build_image_index(archive: zipfile.ZipFile) -> dict[str, str]:
    index: dict[str, str] = {}
    for name in archive.namelist():
        lowered = name.lower()
        if not lowered.startswith(IMAGE_PREFIX) or not lowered.endswith((".webp", ".png", ".jpg", ".jpeg")):
            continue
        key = compact_filename_key(name)
        if key and key not in index:
            index[key] = name
    return index


def actor_keys(actor: dict[str, Any]) -> list[str]:
    system = actor.get("system") or {}
    names = system.get("names") or {}
    official = system.get("officialReference") or {}
    wikimon = system.get("wikimon") or {}

    raw_values: list[Any] = [
        actor.get("name"),
        system.get("sourceId"),
        system.get("species"),
        names.get("canonical"),
        names.get("original"),
        names.get("dub"),
        official.get("directoryName"),
        official.get("displayName"),
        wikimon.get("title"),
    ]

    aliases = names.get("aliases") or []
    if isinstance(aliases, list):
        raw_values.extend(aliases)

    # Gatomon/Tailmon-style direct basename fallback from image paths.
    for image_key in [actor.get("img"), official.get("imageLocalPath"), official.get("imageUrl")]:
        if image_key:
            raw_values.append(Path(str(image_key)).stem)

    result: list[str] = []
    for value in raw_values:
        key = normalize_key(value)
        if key and key not in result:
            result.append(key)
    return result


def old_js_keys(entry: dict[str, Any]) -> list[str]:
    official = entry.get("official") or {}
    raw_values = [
        entry.get("key"),
        entry.get("name"),
        entry.get("species"),
        entry.get("image"),
        official.get("directoryNameGuess"),
    ]
    result: list[str] = []
    for value in raw_values:
        key = compact_filename_key(value) if isinstance(value, str) and "/" in value else normalize_key(value)
        if key and key not in result:
            result.append(key)
    return result


def old_doc_keys(doc: dict[str, Any]) -> list[str]:
    system = doc.get("system") or {}
    raw_values = [
        doc.get("name"),
        system.get("sourceId"),
        system.get("species"),
        doc.get("img"),
    ]
    result: list[str] = []
    for value in raw_values:
        key = compact_filename_key(value) if isinstance(value, str) and "/" in value else normalize_key(value)
        if key and key not in result:
            result.append(key)
    return result


def index_many(items: list[dict[str, Any]], key_func) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for item in items:
        for key in key_func(item):
            index.setdefault(key, item)
    return index


def find_match(keys: list[str], index: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    for key in keys:
        if key in index:
            return index[key]
    return None


def stage_distance(from_stage: str, to_stage: str) -> int | None:
    try:
        return NORMAL_STAGE_ORDER.index(to_stage) - NORMAL_STAGE_ORDER.index(from_stage)
    except ValueError:
        return None


def edge_target_key(edge: dict[str, Any], direction: str) -> str:
    if direction == "previous":
        return normalize_key(edge.get("fromKey") or edge.get("key") or edge.get("fromName") or edge.get("name"))
    return normalize_key(edge.get("toKey") or edge.get("key") or edge.get("toName") or edge.get("name"))


def compact_edge(edge: dict[str, Any], target: dict[str, Any] | None, direction: str) -> dict[str, Any]:
    if direction == "previous":
        raw_key = edge.get("fromKey") or edge.get("key") or edge.get("fromName") or edge.get("name")
        raw_name = edge.get("fromName") or edge.get("name")
        raw_stage = edge.get("fromStage")
    else:
        raw_key = edge.get("toKey") or edge.get("key") or edge.get("toName") or edge.get("name")
        raw_name = edge.get("toName") or edge.get("name")
        raw_stage = edge.get("toStage")

    target_stage = (target or {}).get("stage") or raw_stage or ""
    key = normalize_key(raw_key or raw_name)
    return {
        "sourceId": key,
        "name": raw_name or (target or {}).get("name") or key,
        "stage": target_stage,
        "direction": direction,
        "confidence": int(edge.get("rankScore", edge.get("score", 0)) or 0),
        "score": int(edge.get("score", edge.get("rankScore", 0)) or 0),
        "source": edge.get("source", "old-database"),
        "sourceType": "oldDatabaseCompatibility",
        "special": bool(edge.get("special", False)),
    }


def is_special_hint(entry: dict[str, Any]) -> bool:
    key = normalize_key(entry.get("sourceId") or entry.get("name"))
    name = str(entry.get("name") or "").lower()
    stage = str(entry.get("stage") or "")
    fragments = ["x_antibody", "xros", "armor", "hybrid", "jogress", "dna", "mode", "burst", "appmon"]
    return stage in SPECIAL_STAGES or bool(entry.get("special")) or any(fragment in key or fragment.replace("_", " ") in name for fragment in fragments)


def dedupe_hints(*hint_lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for hints in hint_lists:
        for hint in hints or []:
            key = normalize_key(hint.get("sourceId") or hint.get("name"))
            if not key:
                continue
            candidate = deepcopy(hint)
            candidate["sourceId"] = key
            candidate.setdefault("confidence", int(candidate.get("score", 0) or 0))
            old = by_key.get(key)
            if old is None or int(candidate.get("confidence", 0) or 0) >= int(old.get("confidence", 0) or 0):
                by_key[key] = candidate
    return sorted(by_key.values(), key=lambda item: int(item.get("confidence", 0) or 0), reverse=True)


def build_compatibility(old_entry: dict[str, Any] | None, old_js_by_key: dict[str, dict[str, Any]], current_stage: str) -> dict[str, Any]:
    if not old_entry:
        return {
            "matched": False,
            "oldKey": "",
            "oldName": "",
            "oldStage": "",
            "oldImage": "",
            "normalPrevious": [],
            "normalNext": [],
            "specialUnlocks": [],
        }

    evolution = old_entry.get("evolution") or {}
    normal_previous: list[dict[str, Any]] = []
    normal_next: list[dict[str, Any]] = []
    special: list[dict[str, Any]] = []

    for edge in evolution.get("previous") or []:
        target = old_js_by_key.get(edge_target_key(edge, "previous"))
        compact = compact_edge(edge, target, "previous")
        if stage_distance(compact.get("stage", ""), current_stage) == 1 and not is_special_hint(compact):
            normal_previous.append(compact)
        else:
            special.append(compact)

    for edge in evolution.get("next") or []:
        target = old_js_by_key.get(edge_target_key(edge, "next"))
        compact = compact_edge(edge, target, "next")
        if stage_distance(current_stage, compact.get("stage", "")) == 1 and not is_special_hint(compact):
            normal_next.append(compact)
        else:
            special.append(compact)

    for edge in evolution.get("specialUnlocks") or []:
        # Keep old special material, but compact enough for the browser/report.
        direction = "next"
        target = old_js_by_key.get(edge_target_key(edge, direction))
        special.append(compact_edge(edge, target, direction))

    return {
        "matched": True,
        "oldKey": old_entry.get("key", ""),
        "oldName": old_entry.get("name", ""),
        "oldStage": old_entry.get("stage", ""),
        "oldImage": old_entry.get("image", ""),
        "normalPrevious": dedupe_hints(normal_previous),
        "normalNext": dedupe_hints(normal_next),
        "specialUnlocks": dedupe_hints(special),
    }


def old_image_zip_path(old_entry: dict[str, Any] | None, old_doc: dict[str, Any] | None, image_index: dict[str, str]) -> str:
    candidates: list[Any] = []
    if old_entry:
        candidates.extend([old_entry.get("image"), old_entry.get("name"), old_entry.get("species"), old_entry.get("key")])
    if old_doc:
        system = old_doc.get("system") or {}
        candidates.extend([old_doc.get("img"), old_doc.get("name"), system.get("species")])

    for value in candidates:
        key = compact_filename_key(value) if isinstance(value, str) and ("/" in value or "\\" in value) else normalize_key(value)
        if key in image_index:
            return image_index[key]

    return ""


def copy_image_from_zip(archive: zipfile.ZipFile, zip_path: str, output_dir: Path, prefix: str) -> str:
    if not zip_path:
        return ""

    relative = Path(zip_path)
    # Remove leading digimon/ so asset-dir itself can be assets/digimon/imported.
    parts = relative.parts
    if parts and parts[0].lower() == "digimon":
        relative = Path(*parts[1:])

    destination = output_dir / relative
    destination.parent.mkdir(parents=True, exist_ok=True)

    with archive.open(zip_path) as src, destination.open("wb") as dst:
        shutil.copyfileobj(src, dst)

    return str(Path(prefix) / relative).replace("\\", "/")


def local_path_exists(path_text: str, *, base_dir: Path) -> bool:
    if not path_text or str(path_text).startswith(("http://", "https://")):
        return False
    p = Path(path_text)
    if p.is_absolute():
        return p.exists()
    return (base_dir / p).exists()


def choose_image_path(
    *,
    actor: dict[str, Any],
    old_entry: dict[str, Any] | None,
    old_doc: dict[str, Any] | None,
    archive: zipfile.ZipFile,
    image_index: dict[str, str],
    image_output_dir: Path,
    image_path_prefix: str,
    base_dir: Path,
    image_priority: str,
) -> tuple[str, str]:
    current_img = str(actor.get("img") or "")
    old_zip_path = old_image_zip_path(old_entry, old_doc, image_index)

    if image_priority == "official-first" and local_path_exists(current_img, base_dir=base_dir):
        return current_img.replace("\\", "/"), "official-existing"

    if old_zip_path:
        copied = copy_image_from_zip(archive, old_zip_path, image_output_dir, image_path_prefix)
        if copied:
            return copied, "old-database"

    if current_img:
        return current_img.replace("\\", "/"), "official-or-importer"

    return "icons/svg/mystery-man.svg", "fallback"


def set_deep(target: dict[str, Any], path: list[str], value: Any) -> None:
    current = target
    for key in path[:-1]:
        current = current.setdefault(key, {})
    current[path[-1]] = value


def merge_actor(new_actor: dict[str, Any], old_doc: dict[str, Any] | None, old_entry: dict[str, Any] | None, compatibility: dict[str, Any], img_path: str, image_source: str) -> dict[str, Any]:
    actor = deepcopy(old_doc) if old_doc else deepcopy(new_actor)
    new_system = deepcopy(new_actor.get("system") or {})
    system = actor.setdefault("system", {})

    actor["type"] = "digimon"
    actor["name"] = new_actor.get("name") or system.get("species") or actor.get("name") or "Digimon"
    actor["img"] = img_path

    # Keep the complete old Foundry sheet structure, but overwrite identity/profile data with fresh importer data.
    for key in [
        "sourceId", "species", "isPersistentPartner", "nickname", "stage", "attribute",
        "type", "group", "field", "names", "officialReference", "wikimon",
    ]:
        if key in new_system:
            system[key] = deepcopy(new_system[key])

    stage = str(system.get("stage") or "child")
    system["stageValue"] = STAGE_VALUES.get(stage, system.get("stageValue", 2))

    old_hints = system.get("evolutionHints") or {}
    new_hints = new_system.get("evolutionHints") or {}
    system["evolutionHints"] = {
        "evolvesFrom": dedupe_hints(
            old_hints.get("evolvesFrom") or [],
            new_hints.get("evolvesFrom") or [],
            compatibility.get("normalPrevious") or [],
        ),
        "evolvesTo": dedupe_hints(
            old_hints.get("evolvesTo") or [],
            new_hints.get("evolvesTo") or [],
            compatibility.get("normalNext") or [],
        ),
    }

    system["evolutionCompatibility"] = compatibility
    system.setdefault("assetAlignment", {})
    system["assetAlignment"].update({
        "imageSource": image_source,
        "oldDatabaseMatched": bool(old_entry or old_doc),
        "oldDatabaseKey": (old_entry or {}).get("key", ""),
        "oldDatabaseName": (old_entry or {}).get("name", ""),
    })

    flags = actor.setdefault("flags", {})
    flags.setdefault("digimon-digital-adventures", {})["realignedFromImporter"] = True

    return actor


def main() -> None:
    parser = argparse.ArgumentParser(description="Realinha atores importados com a database antiga, imagens WEBP antigas e dados oficiais/Wikimon novos.")
    parser.add_argument("--actors", required=True, help="JSON novo gerado pelo importador, ex.: output/all_digimon.json")
    parser.add_argument("--old-zip", required=True, help="ZIP da database antiga, ex.: Databases antigas.zip")
    parser.add_argument("--out", default="output/all_digimon_foundry_aligned.json", help="Saída no formato com actors/documentos realinhados.")
    parser.add_argument("--pack-out", default="output/foundry_digimon_pack_aligned.json", help="Saída em formato de pacote com documents.")
    parser.add_argument("--report", default="output/realign_report.json", help="Relatório de casamento e imagens.")
    parser.add_argument("--image-output-dir", default="assets/digimon/imported", help="Pasta local para copiar WEBPs da database antiga.")
    parser.add_argument("--image-path-prefix", default="systems/digimon-digital-adventures/assets/digimon/imported", help="Prefixo salvo em actor.img no Foundry.")
    parser.add_argument("--image-priority", choices=["old-first", "official-first"], default="old-first", help="Prioridade da imagem: antiga local ou oficial já baixada.")
    args = parser.parse_args()

    actors_path = Path(args.actors)
    old_zip_path = Path(args.old_zip)
    output_path = Path(args.out)
    pack_output_path = Path(args.pack_out)
    report_path = Path(args.report)
    image_output_dir = Path(args.image_output_dir)

    payload, new_actors = load_actors_payload(actors_path)

    with zipfile.ZipFile(old_zip_path) as archive:
        old_js_entries = load_old_js_entries(archive)
        old_docs = load_old_foundry_documents(archive)
        image_index = build_image_index(archive)

        old_js_by_key = index_many(old_js_entries, old_js_keys)
        old_docs_by_key = index_many(old_docs, old_doc_keys)

        aligned: list[dict[str, Any]] = []
        report_rows: list[dict[str, Any]] = []
        counters = Counter()

        for new_actor in new_actors:
            keys = actor_keys(new_actor)
            old_entry = find_match(keys, old_js_by_key)
            old_doc = find_match(keys, old_docs_by_key)

            stage = str((new_actor.get("system") or {}).get("stage") or "child")
            compatibility = build_compatibility(old_entry, old_js_by_key, stage)

            img_path, image_source = choose_image_path(
                actor=new_actor,
                old_entry=old_entry,
                old_doc=old_doc,
                archive=archive,
                image_index=image_index,
                image_output_dir=image_output_dir,
                image_path_prefix=args.image_path_prefix,
                base_dir=actors_path.parent.parent if actors_path.parent.name == "output" else Path.cwd(),
                image_priority=args.image_priority,
            )

            merged = merge_actor(new_actor, old_doc, old_entry, compatibility, img_path, image_source)
            aligned.append(merged)

            counters["total"] += 1
            counters["oldJsMatched" if old_entry else "oldJsMissing"] += 1
            counters["oldDocMatched" if old_doc else "oldDocMissing"] += 1
            counters[f"image:{image_source}"] += 1
            counters[f"stage:{stage}"] += 1

            system = merged.get("system") or {}
            report_rows.append({
                "name": merged.get("name", ""),
                "sourceId": system.get("sourceId", ""),
                "stage": system.get("stage", ""),
                "img": merged.get("img", ""),
                "imageSource": image_source,
                "oldJsMatched": bool(old_entry),
                "oldDocMatched": bool(old_doc),
                "oldKey": (old_entry or {}).get("key", ""),
                "oldName": (old_entry or {}).get("name", ""),
                "normalPrevious": len((system.get("evolutionCompatibility") or {}).get("normalPrevious") or []),
                "normalNext": len((system.get("evolutionCompatibility") or {}).get("normalNext") or []),
                "specialUnlocks": len((system.get("evolutionCompatibility") or {}).get("specialUnlocks") or []),
            })

    output_payload = deepcopy(payload) if isinstance(payload, dict) else {}
    output_payload.update({
        "schema": "dda-foundry-aligned-actors",
        "version": 1,
        "count": len(aligned),
        "actors": aligned,
    })

    pack_payload = {
        "exportVersion": "dda-foundry-aligned-actors-v1",
        "system": "digimon-digital-adventures",
        "type": "Actor",
        "count": len(aligned),
        "documents": aligned,
    }

    report = {
        "inputActors": str(actors_path),
        "oldZip": str(old_zip_path),
        "out": str(output_path),
        "packOut": str(pack_output_path),
        "imageOutputDir": str(image_output_dir),
        "imagePathPrefix": args.image_path_prefix,
        "imagePriority": args.image_priority,
        "summary": dict(counters),
        "rows": report_rows,
    }

    write_json(output_path, output_payload)
    write_json(pack_output_path, pack_payload)
    write_json(report_path, report)

    print(f"Atores realinhados: {len(aligned)}")
    print(f"Saída: {output_path}")
    print(f"Pack: {pack_output_path}")
    print(f"Relatório: {report_path}")
    print(json.dumps(dict(counters), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
