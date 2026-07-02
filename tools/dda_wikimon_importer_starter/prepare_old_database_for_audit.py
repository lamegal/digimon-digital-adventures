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

PACK_JSON_PREFIX = "packs-json/"
IMAGE_PREFIX = "digimon/"
OLD_JS_CANDIDATES = [
    "dda-digimon-actor-database.v5.imagepatched.js",
    "dda-digimon-actor-database.generated.js",
]

NORMAL_STAGES = {"baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"}
SPECIAL_STAGES = {"armor", "hybrid", "xrosWars", "unknown"}


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


def read_archive_text(archive: zipfile.ZipFile, name: str) -> str:
    return archive.read(name).decode("utf-8", errors="replace")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_lines(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def load_old_js_entries(archive: zipfile.ZipFile) -> list[dict[str, Any]]:
    names = set(archive.namelist())
    candidates = [name for name in OLD_JS_CANDIDATES if name in names]
    if not candidates:
        candidates = [name for name in archive.namelist() if name.endswith(".js") and "database" in name.lower()]

    for candidate in candidates:
        text = read_archive_text(archive, candidate)
        start = text.find("[")
        end = text.rfind("];" )
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except Exception:
                continue
    return []


def load_old_foundry_documents(archive: zipfile.ZipFile) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for name in archive.namelist():
        if not name.startswith(PACK_JSON_PREFIX) or not name.endswith(".json"):
            continue
        try:
            data = json.loads(read_archive_text(archive, name))
        except Exception:
            continue
        for doc in data.get("documents") or []:
            if isinstance(doc, dict) and doc.get("type") == "digimon":
                doc = deepcopy(doc)
                doc.setdefault("flags", {})
                doc["flags"].setdefault("dda-old-database", {})["sourcePack"] = name
                docs.append(doc)
    return docs


def extract_stage(entry: dict[str, Any]) -> str:
    system = entry.get("system") if isinstance(entry.get("system"), dict) else {}
    for key in ["stage", "level"]:
        value = system.get(key) or entry.get(key)
        if isinstance(value, dict):
            value = value.get("value") or value.get("key")
        clean = normalize_key(value)
        if clean:
            return clean
    return "unknown"


def extract_source_id(entry: dict[str, Any]) -> str:
    system = entry.get("system") if isinstance(entry.get("system"), dict) else {}
    names = system.get("names") if isinstance(system.get("names"), dict) else {}
    candidates = [
        system.get("sourceId"),
        entry.get("sourceId"),
        names.get("original"),
        names.get("dub"),
        system.get("species"),
        entry.get("name"),
    ]
    for candidate in candidates:
        key = normalize_key(candidate)
        if key:
            return key
    return ""


def extract_names(entry: dict[str, Any]) -> list[str]:
    system = entry.get("system") if isinstance(entry.get("system"), dict) else {}
    names = system.get("names") if isinstance(system.get("names"), dict) else {}
    candidates = [
        entry.get("name"),
        system.get("species"),
        system.get("sourceId"),
        entry.get("sourceId"),
        names.get("original"),
        names.get("dub"),
    ]
    out: list[str] = []
    for value in candidates:
        clean = str(value or "").strip()
        if clean and clean not in out:
            out.append(clean)
    return out


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


def choose_image_for_entry(entry: dict[str, Any], image_index: dict[str, str]) -> tuple[str, str]:
    system = entry.get("system") if isinstance(entry.get("system"), dict) else {}
    names = system.get("names") if isinstance(system.get("names"), dict) else {}
    candidates = [
        system.get("sourceId"),
        entry.get("sourceId"),
        system.get("species"),
        entry.get("name"),
        names.get("original"),
        names.get("dub"),
        entry.get("img"),
    ]
    for candidate in candidates:
        key = compact_filename_key(candidate)
        if key in image_index:
            return image_index[key], key
    return "", ""


def merge_entries(js_entries: list[dict[str, Any]], foundry_docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}

    # Prefer Foundry docs as actor shell, then enrich/complete from JS entries only when missing.
    for entry in js_entries:
        key = extract_source_id(entry)
        if key and key not in by_key:
            by_key[key] = entry

    for doc in foundry_docs:
        key = extract_source_id(doc)
        if key:
            by_key[key] = doc

    return list(by_key.values())


def copy_image_from_zip(archive: zipfile.ZipFile, source_name: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with archive.open(source_name) as src, dest.open("wb") as dst:
        shutil.copyfileobj(src, dst)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepara a database antiga como catálogo de imagens e lista-base para auditoria.")
    parser.add_argument("--old-zip", default="Databases antigas.zip", help="Zip da database antiga.")
    parser.add_argument("--pages-out", default="samples/pages_from_old_database_all.txt", help="Lista completa de nomes para o importador.")
    parser.add_argument("--normal-pages-out", default="samples/pages_from_old_database_normal.txt", help="Lista só de estágios normais.")
    parser.add_argument("--special-pages-out", default="samples/pages_from_old_database_special_review.txt", help="Lista de especiais/revisão.")
    parser.add_argument("--catalog-out", default="output/old_database_image_catalog.json", help="Catálogo de imagens antigas.")
    parser.add_argument("--manifest-out", default="output/old_database_manifest.json", help="Manifesto/resumo da database antiga.")
    parser.add_argument("--image-output-dir", default="assets/digimon/imported", help="Pasta local para copiar imagens antigas.")
    parser.add_argument("--image-path-prefix", default="systems/digimon-digital-adventures/assets/digimon/imported", help="Prefixo Foundry para imagens copiadas.")
    args = parser.parse_args()

    old_zip = Path(args.old_zip)
    if not old_zip.exists():
        raise FileNotFoundError(f"Zip não encontrado: {old_zip}")

    image_output_dir = Path(args.image_output_dir)
    image_path_prefix = str(args.image_path_prefix or "").strip().replace("\\", "/").strip("/")

    with zipfile.ZipFile(old_zip, "r") as archive:
        js_entries = load_old_js_entries(archive)
        foundry_docs = load_old_foundry_documents(archive)
        entries = merge_entries(js_entries, foundry_docs)
        image_index = build_image_index(archive)

        catalog: dict[str, Any] = {}
        all_names: list[str] = []
        normal_names: list[str] = []
        special_names: list[str] = []
        copied = 0
        missing_images: list[str] = []
        stage_counter: Counter[str] = Counter()

        for entry in entries:
            source_id = extract_source_id(entry)
            if not source_id:
                continue

            stage = extract_stage(entry)
            stage_counter[stage] += 1

            names = extract_names(entry)
            page_name = names[0] if names else source_id
            if page_name not in all_names:
                all_names.append(page_name)
            if stage in NORMAL_STAGES:
                if page_name not in normal_names:
                    normal_names.append(page_name)
            else:
                if page_name not in special_names:
                    special_names.append(page_name)

            image_zip_path, matched_by = choose_image_for_entry(entry, image_index)
            image_actor_path = ""
            copied_path = ""
            if image_zip_path:
                suffix = Path(image_zip_path).suffix.lower() or ".webp"
                dest_name = f"{source_id}{suffix}"
                dest_path = image_output_dir / dest_name
                copy_image_from_zip(archive, image_zip_path, dest_path)
                copied += 1
                copied_path = dest_path.as_posix()
                image_actor_path = f"{image_path_prefix}/{dest_name}" if image_path_prefix else copied_path
            else:
                missing_images.append(source_id)

            catalog[source_id] = {
                "sourceId": source_id,
                "name": page_name,
                "names": names,
                "stageOld": stage,
                "imageZipPath": image_zip_path,
                "imageCopiedPath": copied_path,
                "imageActorPath": image_actor_path,
                "imageMatchedBy": matched_by,
                "missingImage": not bool(image_zip_path),
            }

    all_names.sort(key=normalize_key)
    normal_names.sort(key=normalize_key)
    special_names.sort(key=normalize_key)

    write_lines(Path(args.pages_out), all_names)
    write_lines(Path(args.normal_pages_out), normal_names)
    write_lines(Path(args.special_pages_out), special_names)
    write_json(Path(args.catalog_out), catalog)
    write_json(Path(args.manifest_out), {
        "oldZip": old_zip.as_posix(),
        "entries": len(catalog),
        "pagesAll": len(all_names),
        "pagesNormal": len(normal_names),
        "pagesSpecialReview": len(special_names),
        "imagesCopied": copied,
        "missingImages": len(missing_images),
        "missingImageSourceIds": missing_images[:200],
        "stageCounter": dict(stage_counter),
        "outputs": {
            "pagesOut": args.pages_out,
            "normalPagesOut": args.normal_pages_out,
            "specialPagesOut": args.special_pages_out,
            "catalogOut": args.catalog_out,
            "manifestOut": args.manifest_out,
            "imageOutputDir": args.image_output_dir,
            "imagePathPrefix": args.image_path_prefix,
        },
    })

    print("OK: database antiga preparada.")
    print(f"Entradas: {len(catalog)}")
    print(f"Páginas normais: {len(normal_names)}")
    print(f"Páginas especiais/revisão: {len(special_names)}")
    print(f"Imagens copiadas: {copied}")
    print(f"Imagens faltantes: {len(missing_images)}")
    print(f"Catálogo: {args.catalog_out}")
    print(f"Manifesto: {args.manifest_out}")


if __name__ == "__main__":
    main()
