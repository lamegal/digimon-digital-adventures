from __future__ import annotations

from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlparse, parse_qs

import re
import time
import requests
from bs4 import BeautifulSoup


WIKIMON_BASE_URL = "https://wikimon.net"
DIGIMON_REFERENCE_BASE_URL = "https://digimon.net/reference_en/"
OUTPUT_PATH = Path("samples/pages_all.txt")
FAILED_PATH = Path("samples/pages_all_failed_sources.txt")

HEADERS = {
    "User-Agent": "DDA-Wikimon-Importer/0.1 (+local Foundry tool)"
}

# We use Wikimon only to build the raw list of page names/source IDs.
# The importer itself can still use digimon.net/reference_en as the authoritative
# source for Level/Type/Attribute/Image.
WIKIMON_CATEGORY_URLS = [
    f"{WIKIMON_BASE_URL}/Category:Digimon",
    f"{WIKIMON_BASE_URL}/Category:Digimon_species",
]

# Fallback: MediaWiki categorymembers API. This is more reliable than scraping the
# category HTML if the page layout changes.
WIKIMON_API_URL = f"{WIKIMON_BASE_URL}/api.php"
WIKIMON_CATEGORY_NAMES = [
    "Category:Digimon",
    "Category:Digimon species",
]

BLOCKED_TITLES = {
    "Category:Digimon",
    "Category:Digimon species",
    "Digimon",
    "List of Digimon",
    "Digital Monster",
}

BLOCKED_PREFIXES = (
    "Category:",
    "File:",
    "Image:",
    "Template:",
    "User:",
    "Talk:",
    "Wikimon:",
    "Help:",
    "Special:",
)

BLOCKED_FRAGMENTS = (
    "list of",
    "category:",
    "template:",
    "image:",
    "file:",
    "digimon species",
    "card game",
    "virtual pet",
    "episode",
    "chapter",
)


def normalize_name(value: str) -> str:
    value = unquote(str(value or "")).replace("_", " ")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def looks_like_digimon_page(title: str) -> bool:
    title = normalize_name(title)
    lowered = title.lower()

    if not title:
        return False

    if title in BLOCKED_TITLES:
        return False

    if title.startswith(BLOCKED_PREFIXES):
        return False

    if any(fragment in lowered for fragment in BLOCKED_FRAGMENTS):
        return False

    # Avoid obvious non-Digimon utility/navigation pages.
    if "/" in title and not any(marker in title for marker in ["X Antibody", "X-Antibody"]):
        return False

    return True


def fetch(url: str, params: dict | None = None) -> requests.Response:
    response = requests.get(url, params=params, timeout=60, headers=HEADERS)
    response.raise_for_status()
    return response


def add_name(names: set[str], raw: str) -> bool:
    title = normalize_name(raw)
    if not looks_like_digimon_page(title):
        return False

    before = len(names)
    names.add(title)
    return len(names) > before


def crawl_wikimon_category_html(names: set[str], failed_sources: list[str]) -> None:
    for start_url in WIKIMON_CATEGORY_URLS:
        url = start_url
        page_index = 1
        seen_urls = set()

        while url and url not in seen_urls:
            seen_urls.add(url)
            print(f"[wikimon html] {start_url} pagina={page_index}")

            try:
                response = fetch(url)
            except Exception as error:
                message = f"{url}: {type(error).__name__}: {error}"
                print(f"  ERRO: {message}")
                failed_sources.append(message)
                break

            soup = BeautifulSoup(response.text, "lxml")
            before = len(names)

            # MediaWiki category pages usually list members in mw-category.
            for link in soup.select("#mw-pages a, .mw-category a, .category-page__members a"):
                text = link.get_text(" ", strip=True)
                href = link.get("href") or ""

                if text:
                    add_name(names, text)

                if "/" in href and not href.startswith("#"):
                    parsed_title = href.rsplit("/", 1)[-1]
                    add_name(names, parsed_title)

            new_count = len(names) - before
            print(f"  novos={new_count} total={len(names)}")

            next_url = ""
            for link in soup.select("a"):
                text = link.get_text(" ", strip=True).lower()
                if text in {"next page", "next 200", "próxima página", "próximos 200"} or "next" in text:
                    href = link.get("href") or ""
                    if href:
                        next_url = urljoin(WIKIMON_BASE_URL, href)
                        break

            url = next_url
            page_index += 1
            time.sleep(0.2)


def crawl_wikimon_api(names: set[str], failed_sources: list[str]) -> None:
    for category in WIKIMON_CATEGORY_NAMES:
        print(f"[wikimon api] {category}")
        cmcontinue = None

        while True:
            params = {
                "action": "query",
                "format": "json",
                "list": "categorymembers",
                "cmtitle": category,
                "cmlimit": "500",
                "cmnamespace": "0",
            }

            if cmcontinue:
                params["cmcontinue"] = cmcontinue

            try:
                response = fetch(WIKIMON_API_URL, params=params)
                data = response.json()
            except Exception as error:
                message = f"{category}: {type(error).__name__}: {error}"
                print(f"  ERRO: {message}")
                failed_sources.append(message)
                break

            members = data.get("query", {}).get("categorymembers", [])
            before = len(names)

            for member in members:
                add_name(names, member.get("title", ""))

            print(f"  recebidos={len(members)} novos={len(names) - before} total={len(names)}")

            cmcontinue = data.get("continue", {}).get("cmcontinue")
            if not cmcontinue:
                break

            time.sleep(0.2)


def crawl_official_ranking_only(names: set[str], failed_sources: list[str]) -> None:
    # This normally gives only Access Ranking entries, but it is useful as a sanity check
    # and keeps the script robust if the official HTML changes later.
    print("[official html] reference_en sanity check")

    try:
        response = fetch(DIGIMON_REFERENCE_BASE_URL)
    except Exception as error:
        message = f"{DIGIMON_REFERENCE_BASE_URL}: {type(error).__name__}: {error}"
        print(f"  ERRO: {message}")
        failed_sources.append(message)
        return

    soup = BeautifulSoup(response.text, "lxml")
    before = len(names)

    for link in soup.select('a[href*="detail.php?directory_name="]'):
        href = link.get("href") or ""
        full_url = urljoin(DIGIMON_REFERENCE_BASE_URL, href)
        query = parse_qs(urlparse(full_url).query)
        directory_name = (query.get("directory_name") or [""])[0].strip()
        if directory_name:
            add_name(names, directory_name)

    print(f"  novos={len(names) - before} total={len(names)}")


def main() -> None:
    names: set[str] = set()
    failed_sources: list[str] = []

    crawl_wikimon_api(names, failed_sources)

    if len(names) < 1000:
        crawl_wikimon_category_html(names, failed_sources)

    # Not expected to return all records, but harmless.
    crawl_official_ranking_only(names, failed_sources)

    final_names = sorted(names, key=lambda value: value.lower())

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("\n".join(final_names) + ("\n" if final_names else ""), encoding="utf-8")

    FAILED_PATH.parent.mkdir(parents=True, exist_ok=True)
    FAILED_PATH.write_text("\n".join(failed_sources) + ("\n" if failed_sources else ""), encoding="utf-8")

    print("")
    print(f"Gerado: {OUTPUT_PATH}")
    print(f"Total: {len(final_names)}")
    print(f"Falhas de fonte: {len(failed_sources)}")

    if len(final_names) < 1000:
        print("")
        print("AVISO: a lista ainda veio pequena. Nesse caso, a categoria/API do Wikimon também não entregou a lista completa.")
        print("Me mande o arquivo samples/pages_all.txt gerado e o samples/pages_all_failed_sources.txt para eu ver o que a fonte retornou.")


if __name__ == "__main__":
    main()
