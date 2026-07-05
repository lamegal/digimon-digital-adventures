from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field
from typing import Any
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

from .normalization import clean_digimon_name, clean_text, normalize_source_id
from .source_policy import classify_source


WIKIMON_BASE_URL = "https://wikimon.net"


@dataclass
class EvolutionEntry:
    name: str
    source_label: str = ""
    source_type: str = "unknown"
    confidence: int = 40
    ignored_by_default: bool = False
    special_case: str = ""
    source: str = "wikimon"

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "sourceLabel": self.source_label,
            "sourceType": self.source_type,
            "confidence": self.confidence,
            "ignoredByDefault": self.ignored_by_default,
            "specialCase": self.special_case,
            "source": self.source,
        }


@dataclass
class WikimonDigimon:
    title: str
    url: str
    level: str = ""
    type: str = ""
    attribute: str = ""
    field: str = ""
    group: str = ""
    image: str = ""
    evolves_from_raw: list[EvolutionEntry] = dataclass_field(default_factory=list)
    evolves_to_raw: list[EvolutionEntry] = dataclass_field(default_factory=list)

    def source_id(self) -> str:
        return normalize_source_id(self.title)


def fetch_wikimon_page(title: str, timeout: int = 30) -> str:
    title = str(title or "").strip()
    if not title:
        raise ValueError("Título vazio.")

    url = f"{WIKIMON_BASE_URL}/{quote(title.replace(' ', '_'))}"
    response = requests.get(url, timeout=timeout, headers={
        "User-Agent": "DDA-Wikimon-Importer/0.1 (+local Foundry tool)"
    })
    response.raise_for_status()
    return response.text


def parse_wikimon_html(html: str, page_title: str = "", page_url: str = "") -> WikimonDigimon:
    soup = BeautifulSoup(html, "lxml")

    title = page_title or _extract_page_title(soup)
    url = page_url or (f"{WIKIMON_BASE_URL}/{quote(title.replace(' ', '_'))}" if title else "")

    data = WikimonDigimon(title=title, url=url)

    infobox = _find_infobox(soup)
    if infobox:
        fields = _parse_infobox_fields(infobox)
        data.level = fields.get("level", "")
        data.type = fields.get("type", "")
        data.attribute = fields.get("attribute", "")
        data.field = fields.get("field", "")
        data.group = fields.get("group", "")
        data.image = _extract_first_image(infobox)

    data.evolves_from_raw = _extract_evolution_section(soup, wanted="from")
    data.evolves_to_raw = _extract_evolution_section(soup, wanted="to")

    return data


def _extract_page_title(soup: BeautifulSoup) -> str:
    heading = soup.select_one("#firstHeading")
    if heading:
        return clean_text(heading.get_text(" ", strip=True))
    title = soup.select_one("title")
    if title:
        return clean_text(title.get_text(" ", strip=True).replace(" - Wikimon", ""))
    return "Unknown Digimon"


def _find_infobox(soup: BeautifulSoup):
    candidates = soup.select("table")
    for table in candidates:
        classes = " ".join(table.get("class", []))
        if "infobox" in classes.lower() or "wikitable" in classes.lower():
            text = table.get_text(" ", strip=True).lower()
            if any(key in text for key in ["level", "type", "attribute"]):
                return table
    return candidates[0] if candidates else None


def _parse_infobox_fields(table) -> dict[str, str]:
    result = {}
    key_map = {
        "level": "level",
        "stage": "level",
        "type": "type",
        "attribute": "attribute",
        "field": "field",
        "group": "group",
    }

    for row in table.select("tr"):
        cells = row.find_all(["th", "td"])
        if len(cells) < 2:
            continue

        key = clean_text(cells[0].get_text(" ", strip=True)).lower()
        value = clean_text(cells[1].get_text(" ", strip=True))

        for needle, canonical in key_map.items():
            if needle in key and canonical not in result:
                result[canonical] = value
                break

    return result


def _extract_first_image(root) -> str:
    img = root.select_one("img")
    if not img:
        return ""

    src = img.get("src") or ""
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("/"):
        return WIKIMON_BASE_URL + src
    return src


def _extract_evolution_section(soup: BeautifulSoup, wanted: str) -> list[EvolutionEntry]:
    headings = soup.find_all(["h2", "h3", "h4"])
    results: list[EvolutionEntry] = []

    if wanted == "from":
        needles = ["evolves from", "evolution from", "prior forms", "pre-evolution"]
    else:
        needles = ["evolves to", "evolution to", "next forms", "can evolve to"]

    for heading in headings:
        heading_text = clean_text(heading.get_text(" ", strip=True)).lower()
        if not any(needle in heading_text for needle in needles):
            continue

        for sibling in _iter_until_next_heading(heading):
            results.extend(_extract_evolution_entries_from_element(sibling))

    return _dedupe_evolution_entries(results)


def _iter_until_next_heading(heading):
    for sibling in heading.find_next_siblings():
        if sibling.name in {"h2", "h3", "h4"}:
            break
        yield sibling


def _extract_evolution_entries_from_element(element) -> list[EvolutionEntry]:
    entries: list[EvolutionEntry] = []

    # Prefer table rows because they often include source/condition columns.
    rows = element.select("tr") if hasattr(element, "select") else []
    for row in rows:
        links = row.select("a")
        if not links:
            continue

        # First link in evolution tables is usually the Digimon name.
        name = clean_digimon_name(links[0].get_text(" ", strip=True))
        if not _looks_like_digimon_name(name):
            continue

        row_text = clean_text(row.get_text(" ", strip=True))
        decision = classify_source(row_text)

        entries.append(EvolutionEntry(
            name=name,
            source_label=row_text[:240],
            source_type=decision.source_type,
            confidence=decision.confidence,
            ignored_by_default=decision.ignored_by_default,
            special_case=decision.special_case,
        ))

    # Fallback for list-based pages.
    if entries:
        return entries

    for link in element.select("a") if hasattr(element, "select") else []:
        name = clean_digimon_name(link.get_text(" ", strip=True))
        if not _looks_like_digimon_name(name):
            continue

        context = clean_text(element.get_text(" ", strip=True))[:240]
        decision = classify_source(context)

        entries.append(EvolutionEntry(
            name=name,
            source_label=context,
            source_type=decision.source_type,
            confidence=decision.confidence,
            ignored_by_default=decision.ignored_by_default,
            special_case=decision.special_case,
        ))

    return entries


def _looks_like_digimon_name(name: str) -> bool:
    if not name:
        return False
    lowered = name.lower()
    blocked = {
        "digimon", "evolution", "card", "cards", "anime", "manga",
        "attribute", "level", "type", "field", "group",
    }
    if lowered in blocked:
        return False
    return len(name) >= 3


def _dedupe_evolution_entries(entries: list[EvolutionEntry]) -> list[EvolutionEntry]:
    best_by_name: dict[str, EvolutionEntry] = {}

    for entry in entries:
        key = normalize_source_id(entry.name)
        existing = best_by_name.get(key)

        if not existing or entry.confidence > existing.confidence:
            best_by_name[key] = entry

    return sorted(best_by_name.values(), key=lambda entry: (-entry.confidence, entry.name))

def _looks_like_digimon_name(name: str) -> bool:
    if not name:
        return False

    raw = clean_text(name)
    lowered = raw.lower()

    blocked_exact = {
        "digimon",
        "evolution",
        "card",
        "cards",
        "anime",
        "manga",
        "attribute",
        "level",
        "stage",
        "type",
        "field",
        "group",
        "child",
        "adult",
        "perfect",
        "ultimate",
        "data",
        "vaccine",
        "virus",
        "free",
        "variable",
        "nature spirits",
        "virus busters",
        "deep savers",
        "dragon's roar",
        "wind guardians",
        "metal empire",
        "nightmare soldiers",
        "jungle troopers",
        "dark area",
        "crest of light",
        "crest of courage",
        "crest of friendship",
        "crest of hope",
        "crest of knowledge",
        "crest of love",
        "crest of purity",
        "crest of sincerity",
        "crest of kindness",
        "digimental of courage",
        "digimental of friendship",
        "digimental of hope",
        "digimental of kindness",
        "digimental of knowledge",
        "digimental of light",
        "digimental of love",
        "digimental of miracles",
        "digimental of purity",
        "digimental of sincerity",
        "pendulum series",
        "pendulum ver.20th series",
        "warp evolution",
        "x-antibody",
        "edit",
    }

    blocked_fragments = [
        " from the digimon card game",
        " from the battle spirits card game",
        " from digimon world: digital card arena",
        " from the digimon pendulum",
        " from the digimon pendulum color",
        " from the digimon pendulum z",
        "any ",
        " every digimon",
        "that also evolves from",
        "lv.",
        "attribute adult digimon",
        "nature digimon",
        "yellow digimon",
        "green digimon",
        "purple digimon",
        "red digimon",
        "adventure lv",
        "virus busters lv",
        "nature spirits lv",
    ]

    if lowered in blocked_exact:
        return False

    if lowered.startswith("[n "):
        return False

    if lowered.startswith("any "):
        return False

    if lowered.startswith("every "):
        return False

    if any(fragment in lowered for fragment in blocked_fragments):
        return False

    if len(raw) < 3:
        return False

    return True