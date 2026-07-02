from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field
from pathlib import Path
import re
from typing import Any
from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup

from .normalization import clean_text, normalize_source_id


OFFICIAL_REFERENCE_BASE_URL = "https://digimon.net/reference_en"
OFFICIAL_REFERENCE_DETAIL_URL = f"{OFFICIAL_REFERENCE_BASE_URL}/detail.php?directory_name={{directory_name}}"


@dataclass
class OfficialReferenceProfile:
    directory_name: str
    url: str
    display_name: str = ""
    level: str = ""
    type_name: str = ""
    attribute: str = ""
    image_url: str = ""
    image_local_path: str = ""
    related: list[dict[str, str]] = dataclass_field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "directoryName": self.directory_name,
            "url": self.url,
            "displayName": self.display_name,
            "level": self.level,
            "type": self.type_name,
            "attribute": self.attribute,
            "imageUrl": self.image_url,
            "imageLocalPath": self.image_local_path,
            "related": self.related,
        }


class OfficialReferenceNotFound(Exception):
    pass


def build_official_reference_candidates(source_id: str, names: list[str] | None = None) -> list[str]:
    candidates: list[str] = []

    def add(value: str) -> None:
        normalized = normalize_official_directory_name(value)
        if normalized and normalized not in candidates:
            candidates.append(normalized)

    add(source_id)

    for name in names or []:
        add(name)

    return candidates


def normalize_official_directory_name(value: str) -> str:
    normalized = normalize_source_id(value)
    normalized = normalized.replace("_", "")
    return normalized


def fetch_official_reference_profile(
    source_id: str,
    names: list[str] | None = None,
    timeout: int = 30,
) -> OfficialReferenceProfile | None:
    for directory_name in build_official_reference_candidates(source_id, names):
        url = OFFICIAL_REFERENCE_DETAIL_URL.format(directory_name=quote(directory_name))

        try:
            html = fetch_official_reference_page(url, timeout=timeout)
        except Exception:
            continue

        profile = parse_official_reference_html(html, directory_name=directory_name, url=url)
        if profile:
            return profile

    return None


def fetch_official_reference_page(url: str, timeout: int = 30) -> str:
    response = requests.get(url, timeout=timeout, headers={
        "User-Agent": "DDA-Digimon-Official-Reference/0.1 (+local Foundry tool)"
    })
    response.raise_for_status()
    return response.text


def parse_official_reference_html(
    html: str,
    directory_name: str = "",
    url: str = "",
) -> OfficialReferenceProfile | None:
    soup = BeautifulSoup(html, "lxml")
    page_text = clean_text(soup.get_text(" ", strip=True))

    if not page_text or "No results to your search" in page_text:
        return None

    fields = _extract_official_fields(soup)
    display_name = _extract_display_name(soup, fields)

    if not display_name and not fields.get("level") and not fields.get("type") and not fields.get("attribute"):
        return None

    return OfficialReferenceProfile(
        directory_name=directory_name,
        url=url,
        display_name=display_name,
        level=fields.get("level", ""),
        type_name=fields.get("type", ""),
        attribute=fields.get("attribute", ""),
        image_url=_extract_official_image_url(soup, url),
        related=_extract_related_digimon(soup),
    )


def _extract_official_fields(soup: BeautifulSoup) -> dict[str, str]:
    """Extract Level/Type/Attribute from digimon.net detail pages.

    The official page is sometimes parsed as nice separated lines:

        Level
        Champion
        Type
        Holy Beast
        Attribute
        Vaccine

    but in some environments BeautifulSoup collapses the detail block into a
    single line. This function supports both shapes.
    """
    result: dict[str, str] = {}

    text_with_lines = clean_text(soup.get_text("\n", strip=True))
    lines = [clean_text(line) for line in text_with_lines.split("\n") if clean_text(line)]

    labels = {
        "Level": "level",
        "Type": "type",
        "Attribute": "attribute",
    }

    for index, line in enumerate(lines):
        canonical = labels.get(line)
        if not canonical:
            continue

        value = _next_meaningful_line(lines, index + 1)
        if value:
            result[canonical] = _clean_official_field_value(value)

    # Fallback for collapsed text, e.g.:
    # "... Level Champion Type Holy Beast Attribute Vaccine Special Move ..."
    collapsed = clean_text(soup.get_text(" ", strip=True))

    if not result.get("level"):
        result["level"] = _extract_between_labels(
            collapsed,
            "Level",
            ["Type", "Attribute", "Special Move", "Profile", "See related Digimon here", "Access Ranking"],
        )

    if not result.get("type"):
        result["type"] = _extract_between_labels(
            collapsed,
            "Type",
            ["Attribute", "Special Move", "Profile", "See related Digimon here", "Access Ranking"],
        )

    if not result.get("attribute"):
        result["attribute"] = _extract_between_labels(
            collapsed,
            "Attribute",
            ["Special Move", "Profile", "See related Digimon here", "Access Ranking"],
        )

    return {key: value for key, value in result.items() if value}


def _extract_between_labels(text: str, label: str, stop_labels: list[str]) -> str:
    text = clean_text(text)
    if not text:
        return ""

    pattern = re.compile(rf"(?:^|\s){re.escape(label)}\s+", re.IGNORECASE)
    match = pattern.search(text)
    if not match:
        return ""

    start = match.end()
    end = len(text)
    tail = text[start:]

    for stop_label in stop_labels:
        stop_match = re.search(rf"\s{re.escape(stop_label)}(?:\s|$)", tail, flags=re.IGNORECASE)
        if stop_match:
            end = min(end, start + stop_match.start())

    return _clean_official_field_value(text[start:end])


def _clean_official_field_value(value: str) -> str:
    value = clean_text(value)
    if not value:
        return ""

    # Remove move/list bullets and common site labels if they got glued to the value.
    value = value.strip(" :：-・")

    known_levels = [
        "In-Training Ⅰ",
        "In-Training I",
        "In-Training Ⅱ",
        "In-Training II",
        "Rookie",
        "Champion",
        "Ultimate",
        "Mega",
        "Armor",
        "Hybrid",
        "Xros Wars",
        "Unknown",
    ]

    known_attributes = [
        "Vaccine",
        "Data",
        "Virus",
        "Free",
        "Variable",
        "Unknown",
        "NO DATA",
    ]

    for known in known_levels:
        if value == known or value.startswith(f"{known} "):
            return known

    for known in known_attributes:
        if value == known or value.startswith(f"{known} "):
            return known

    for separator in [" / ", " | ", "\n"]:
        if separator in value:
            value = value.split(separator)[0].strip()

    return value.strip(" :：-・")


def _next_meaningful_line(lines: list[str], start_index: int) -> str:
    blocked = {
        "Level",
        "Type",
        "Attribute",
        "Special Move",
        "Profile",
        "See related Digimon here",
        "Access Ranking",
        "Digimon Encyclopedia",
        "ENCYCLOPEDIA",
    }

    for line in lines[start_index:]:
        if line in blocked:
            return ""
        if line.startswith("・"):
            continue
        if line:
            return line

    return ""


def _extract_display_name(soup: BeautifulSoup, fields: dict[str, str]) -> str:
    for selector in ["main h3", "#contents h3", ".detail_title", "h3", "h2", "h1"]:
        for node in soup.select(selector):
            text = clean_text(node.get_text(" ", strip=True))
            if _is_plausible_display_name(text, fields):
                return text
    return ""


def _is_plausible_display_name(value: str, fields: dict[str, str]) -> bool:
    if not value:
        return False

    blocked = {
        "Digimon Encyclopedia",
        "ENCYCLOPEDIA",
        "Profile",
        "Access Ranking",
        "See related Digimon here",
        "Level",
        "Type",
        "Attribute",
        fields.get("level", ""),
        fields.get("type", ""),
        fields.get("attribute", ""),
    }

    if value in blocked:
        return False

    if len(value) > 80:
        return False

    return True


def _extract_official_image_url(soup: BeautifulSoup, page_url: str = "") -> str:
    candidates: list[str] = []

    for img in soup.select("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src:
            continue

        absolute = urljoin(page_url or OFFICIAL_REFERENCE_BASE_URL + "/", src)
        lowered = absolute.lower()

        if any(blocked in lowered for blocked in ["logo", "menu", "search", "sns", "facebook", "line", "x_icon"]):
            continue

        alt = clean_text(img.get("alt") or "")
        classes = " ".join(img.get("class", []))
        score = 0

        if "digimon" in lowered or "reference" in lowered or "images" in lowered:
            score += 1
        if alt:
            score += 1
        if "detail" in classes.lower() or "image" in classes.lower() or "pic" in classes.lower():
            score += 1

        candidates.append((score, absolute))

    if not candidates:
        return ""

    candidates.sort(key=lambda item: (-item[0], item[1]))
    return candidates[0][1]


def _extract_related_digimon(soup: BeautifulSoup) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    text = clean_text(soup.get_text("\n", strip=True))
    lines = [clean_text(line) for line in text.split("\n") if clean_text(line)]

    try:
        start = lines.index("See related Digimon here") + 1
    except ValueError:
        return result

    for line in lines[start:]:
        if line in {"Access Ranking", "一覧に戻る", "OFFICIAL SNS"}:
            break

        if not line or "/" not in line:
            continue

        parts = [part.strip() for part in line.split("/")]
        left = parts[0]
        attribute = parts[1] if len(parts) > 1 else ""

        name_and_type = left.rsplit(" ", 1)
        if len(name_and_type) == 2:
            name, type_name = name_and_type
        else:
            name, type_name = left, ""

        if name:
            result.append({
                "name": name.strip(),
                "sourceId": normalize_source_id(name),
                "type": type_name.strip(),
                "attribute": attribute.strip(),
            })

    return result


def download_and_convert_official_image(
    image_url: str,
    output_path: Path,
    timeout: int = 30,
    quality: int = 92,
) -> Path:
    if not image_url:
        raise ValueError("URL de imagem vazia.")

    from io import BytesIO

    from PIL import Image

    response = requests.get(image_url, timeout=timeout, headers={
        "User-Agent": "DDA-Digimon-Image-Importer/0.1 (+local Foundry tool)"
    })
    response.raise_for_status()

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    image = Image.open(BytesIO(response.content)).convert("RGBA")
    image.save(output_path, format="WEBP", quality=quality, method=6)

    return output_path
