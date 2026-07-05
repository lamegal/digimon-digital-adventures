from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path
from typing import Any


def normalize_key(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = text.replace("&", " and ")
    text = text.replace("'", "")
    text = re.sub(r"\(.*?\)", " ", text)
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def compact_key(value: Any) -> str:
    return normalize_key(Path(str(value or "")).stem)


def split_camel_name(value: str) -> str:
    text = Path(str(value or "")).stem.strip()
    if not text:
        return ""
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    text = text.replace("X Antibody", "X-Antibody")
    return text.strip()


def read_json_from_zip(archive: zipfile.ZipFile, name: str) -> Any | None:
    try:
        return json.loads(archive.read(name).decode("utf-8", errors="replace"))
    except Exception:
        return None


def iter_foundry_docs(archive: zipfile.ZipFile):
    for name in archive.namelist():
        if name.startswith("packs/") and name.endswith(".json"):
            data = read_json_from_zip(archive, name)
            if isinstance(data, dict) and data.get("type") == "digimon":
                yield data
        elif name.startswith("packs-json/") and name.endswith(".json"):
            data = read_json_from_zip(archive, name)
            if not isinstance(data, dict):
                continue
            for doc in data.get("documents") or []:
                if isinstance(doc, dict) and doc.get("type") == "digimon":
                    yield doc


def merge_alias_entry(out: dict[str, Any], source_id: str, names: list[str]) -> None:
    source_id = normalize_key(source_id)
    if not source_id:
        return

    clean_names: list[str] = []
    for name in names:
        text = str(name or "").strip()
        if text and text not in clean_names:
            clean_names.append(text)

    if not clean_names:
        return

    entry = out.setdefault(source_id, {"original": clean_names[0], "dub": "", "aliases": []})
    if not entry.get("original"):
        entry["original"] = clean_names[0]

    aliases = entry.setdefault("aliases", [])
    for name in clean_names:
        if name not in aliases:
            aliases.append(name)

    # Heurística: se o nome de imagem/campo species for diferente do ator, trata como dub/display.
    if not entry.get("dub") and len(clean_names) > 1:
        entry["dub"] = clean_names[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera aliases automáticos a partir do Databases antigas.zip.")
    parser.add_argument("--old-zip", default="Databases antigas.zip")
    parser.add_argument("--base", default="samples/aliases.json")
    parser.add_argument("--out", default="samples/aliases_old_database.json")
    args = parser.parse_args()

    aliases: dict[str, Any] = {}
    base_path = Path(args.base)
    if base_path.exists():
        aliases = json.loads(base_path.read_text(encoding="utf-8"))

    with zipfile.ZipFile(args.old_zip, "r") as archive:
        for doc in iter_foundry_docs(archive):
            system = doc.get("system") if isinstance(doc.get("system"), dict) else {}
            names_obj = system.get("names") if isinstance(system.get("names"), dict) else {}

            actor_name = str(doc.get("name") or "").strip()
            species = str(system.get("species") or "").strip()
            source_id = str(system.get("sourceId") or "").strip()
            original = str(names_obj.get("original") or "").strip()
            dub = str(names_obj.get("dub") or "").strip()
            img_name = split_camel_name(Path(str(doc.get("img") or "")).stem)

            # A chave principal preferida é o nome do ator antigo; geralmente é Wikimon/original.
            key_seed = source_id or original or actor_name or species or img_name
            names = [actor_name, original, species, dub, img_name, key_seed]
            merge_alias_entry(aliases, key_seed, names)

            # Também registra uma chave pelo basename da imagem, útil para digimon.net/dub.
            image_key = compact_key(doc.get("img"))
            if image_key:
                merge_alias_entry(aliases, image_key, names)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(aliases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: aliases gerados em {out_path}")
    print(f"Total de chaves: {len(aliases)}")


if __name__ == "__main__":
    main()
