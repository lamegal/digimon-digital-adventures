from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .normalization import normalize_source_id
from .official_reference import (
    download_and_convert_official_image,
    fetch_official_reference_profile,
)
from .parser import fetch_wikimon_page, parse_wikimon_html
from .transform import wikimon_to_actor_data


def load_aliases(path: str | None) -> dict:
    if not path:
        return {}
    clean = Path(path)
    if not clean.exists():
        raise FileNotFoundError(f"Arquivo de aliases não encontrado: {clean}")
    return json.loads(clean.read_text(encoding="utf-8"))


def read_pages_from_file(path: str | None) -> list[str]:
    if not path:
        return []
    return [
        line.strip()
        for line in Path(path).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def alias_names_for_source_id(source_id: str, aliases: dict) -> list[str]:
    alias_data = aliases.get(source_id, {}) if aliases else {}
    values: list[str] = []

    for key in ["original", "dub"]:
        value = alias_data.get(key)
        if value:
            values.append(value)

    values.extend(alias_data.get("aliases") or [])

    unique: list[str] = []
    for value in values:
        clean = str(value or "").strip()
        if clean and clean not in unique:
            unique.append(clean)

    return unique


def page_candidates(title: str, aliases: dict[str, Any]) -> list[str]:
    """Tenta variantes quando o nome antigo/dub não bate exatamente com Wikimon."""
    title = str(title or "").strip()
    candidates: list[str] = []

    def add(value: Any) -> None:
        clean = str(value or "").strip()
        if clean and clean not in candidates:
            candidates.append(clean)

    add(title)
    normalized = normalize_source_id(title)
    add(normalized)

    for key, data in (aliases or {}).items():
        if not isinstance(data, dict):
            continue
        values = [key, data.get("original"), data.get("dub"), *(data.get("aliases") or [])]
        normalized_values = {normalize_source_id(value) for value in values if value}
        if normalized in normalized_values or title in {str(value).strip() for value in values if value}:
            for value in values:
                add(value)

    return candidates


def fetch_wikimon_page_with_candidates(title: str, aliases: dict, timeout: int) -> tuple[str, str, list[str]]:
    tried: list[str] = []
    last_error: Exception | None = None

    for candidate in page_candidates(title, aliases):
        if candidate in tried:
            continue
        tried.append(candidate)
        try:
            html = fetch_wikimon_page(candidate, timeout=timeout)
            return candidate, html, tried
        except Exception as error:
            last_error = error
            continue

    raise RuntimeError(f"falha ao buscar Wikimon para {title}; tentativas={tried}; último erro={last_error}")


def maybe_enrich_with_official_reference(parsed, aliases: dict, args) -> object | None:
    if args.no_official_reference:
        return None

    source_id = parsed.source_id()
    names = [parsed.title, *alias_names_for_source_id(source_id, aliases)]

    print(f"Buscando Reference oficial: {source_id}")
    official = fetch_official_reference_profile(source_id, names=names, timeout=args.timeout)

    if not official:
        print(f"Aviso: Reference oficial não encontrada para {parsed.title}.")
        return None

    if args.download_images and official.image_url:
        image_output_dir = Path(args.image_output_dir)
        image_output_dir.mkdir(parents=True, exist_ok=True)

        image_filename = f"{source_id}.webp"
        output_path = image_output_dir / image_filename

        try:
            download_and_convert_official_image(official.image_url, output_path, timeout=args.timeout)
            official.image_local_path = _build_actor_image_path(args.image_path_prefix, image_filename, output_path)
            print(f"Imagem oficial salva: {output_path}")
        except Exception as error:
            print(f"Aviso: falha ao baixar/converter imagem oficial de {parsed.title}: {error}")

    return official


def _build_actor_image_path(prefix: str, image_filename: str, output_path: Path) -> str:
    prefix = str(prefix or "").strip().replace("\\", "/").strip("/")

    if prefix:
        return f"{prefix}/{image_filename}"

    return output_path.as_posix()


def parse_one_page_from_html(title: str, html: str, aliases: dict, args):
    parsed = parse_wikimon_html(html, page_title=title)
    official = maybe_enrich_with_official_reference(parsed, aliases, args)
    return wikimon_to_actor_data(parsed, aliases, official_profile=official)


def main() -> None:
    parser = argparse.ArgumentParser(description="DDA Wikimon Importer starter")
    parser.add_argument("--pages", nargs="*", default=[], help="Títulos do Wikimon. Ex.: Tailmon Plotmon")
    parser.add_argument("--input", default="", help="Arquivo .txt com uma página por linha.")
    parser.add_argument("--html", default="", help="Arquivo HTML local para modo offline.")
    parser.add_argument("--out", required=True, help="Arquivo JSON de saída.")
    parser.add_argument("--aliases", default="", help="JSON opcional de aliases por sourceId.")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout das requisições em segundos.")
    parser.add_argument("--no-official-reference", action="store_true", help="Não buscar dados oficiais em digimon.net/reference_en.")
    parser.add_argument("--download-images", action="store_true", default=True, help="Baixar imagem oficial e converter para WEBP. Ativo por padrão.")
    parser.add_argument("--no-download-images", dest="download_images", action="store_false", help="Não baixar imagens oficiais.")
    parser.add_argument("--image-output-dir", default="output/images", help="Pasta local onde as imagens WEBP serão salvas.")
    parser.add_argument("--image-path-prefix", default="output/images", help="Prefixo gravado no campo img do ator.")
    parser.add_argument("--stop-on-error", action="store_true", help="Para no primeiro erro. Por padrão, continua e registra erros no JSON.")
    args = parser.parse_args()

    aliases = load_aliases(args.aliases)
    output = []
    errors: list[dict[str, Any]] = []

    if args.html:
        html_path = Path(args.html)
        html = html_path.read_text(encoding="utf-8")
        title = html_path.stem
        output.append(parse_one_page_from_html(title, html, aliases, args))
    else:
        pages = [*args.pages, *read_pages_from_file(args.input)]
        if not pages:
            raise SystemExit("Informe --pages, --input ou --html.")

        for index, title in enumerate(pages, start=1):
            print(f"[{index}/{len(pages)}] Baixando Wikimon: {title}")
            try:
                resolved_title, html, tried = fetch_wikimon_page_with_candidates(title, aliases, args.timeout)
                if resolved_title != title:
                    print(f"  Resolvido por alias: {title} -> {resolved_title}")
                output.append(parse_one_page_from_html(resolved_title, html, aliases, args))
            except Exception as error:
                record = {
                    "title": title,
                    "type": type(error).__name__,
                    "message": str(error),
                }
                errors.append(record)
                print(f"ERRO: {title}: {record['type']}: {record['message']}")
                if args.stop_on_error:
                    raise
                continue

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "schema": "dda-wikimon-importer-starter",
        "version": 3,
        "count": len(output),
        "errorCount": len(errors),
        "errors": errors,
        "actors": output,
    }

    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(output)} ator(es) exportado(s) para {out_path}")
    print(f"Erros: {len(errors)}")


if __name__ == "__main__":
    main()
