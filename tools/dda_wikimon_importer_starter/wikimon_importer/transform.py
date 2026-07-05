from __future__ import annotations

from typing import Any

from .normalization import normalize_source_id
from .official_reference import OfficialReferenceProfile


VALID_GROUPS = {
    "Ancient Species", "Angel Army", "BAN-TYO", "Big Death-Stars", "Crack Team",
    "D-Brigade", "Digimon King", "Deva", "Four Great Dragons", "Four Holy Beasts",
    "Legend-Arms", "Nightmare Soldiers", "Olympos XII", "Royal Base", "Royal Knights",
    "Saneiketsu", "Sanmyojin", "Seven Great Demon Lords", "Shikyoju",
    "Tentei Hachibushu", "Three Archangels", "Three Musketeers", "Vortex Warriors",
    "Warrior Ten", "Witchelny", "Virus Busters", "Bagra Army", "Blue Flare",
    "Chaos Generals", "Commandments", "Dark Masters", "Death Generals",
    "DigiMemories", "Digital Divine General of 28 Mansions", "Gaia Origin",
    "Geno Digimon", "Goddess' Warriors", "Illegal Species", "Infected Digimon",
    "Kowloon Co.", "Light Fang", "Miracle IV", "Nanomon", "Night Claw", "ROG",
    "Seven Code Appmon", "Three Evil Mons", "Three Gods of Destruction",
    "Three Head Officers", "Tian Ji", "Titans", "Twilight", "Ultimate 4", "Xros Heart",
}


WIKIMON_LEVEL_TO_STAGE = {
    "baby i": "baby1",
    "baby 1": "baby1",
    "baby": "baby1",
    "fresh": "baby1",
    "baby ii": "baby2",
    "baby 2": "baby2",
    "in-training": "baby2",
    "in training": "baby2",
    "child": "child",
    "rookie": "child",
    "adult": "adult",
    "champion": "adult",
    "perfect": "perfect",
    "ultimate": "ultimate",
    "mega": "ultimate",
    "super ultimate": "ultimatePlus",
    "ultra": "ultimatePlus",
}


OFFICIAL_LEVEL_TO_STAGE = {
    "in-training Ⅰ": "baby1",
    "in-training i": "baby1",
    "in-training 1": "baby1",
    "fresh": "baby1",
    "in-training Ⅱ": "baby2",
    "in-training ii": "baby2",
    "in-training 2": "baby2",
    "in-training": "baby2",
    "rookie": "child",
    "child": "child",
    "champion": "adult",
    "adult": "adult",
    "ultimate": "perfect",
    "perfect": "perfect",
    "mega": "ultimate",
    "super ultimate": "ultimatePlus",
    "ultra": "ultimatePlus",
    "armor": "armor",
    "hybrid": "hybrid",
    "xros wars": "xrosWars",
    "unknown": "unknown",
}


ATTRIBUTE_TO_KEY = {
    "Vaccine": "vaccine",
    "Data": "data",
    "Virus": "virus",
    "Free": "free",
    "Variable": "variable",
    "Unknown": "unknown",
    "NO DATA": "none",
    "-": "none",
}


def normalize_stage(value: str, *, source: str = "wikimon") -> str:
    text = str(value or "").strip().lower()

    if not text:
        return "child"

    mapping = OFFICIAL_LEVEL_TO_STAGE if source == "official" else WIKIMON_LEVEL_TO_STAGE

    if text in mapping:
        return mapping[text]

    for key, stage in mapping.items():
        if key in text:
            return stage

    return "child"


def normalize_attribute(value: str) -> str:
    value = str(value or "").strip()
    return ATTRIBUTE_TO_KEY.get(value, value.lower() if value else "data")


def wikimon_to_actor_data(
    parsed,
    aliases_by_source_id: dict[str, dict[str, Any]] | None = None,
    official_profile: OfficialReferenceProfile | None = None,
) -> dict[str, Any]:
    aliases_by_source_id = aliases_by_source_id or {}

    source_id = parsed.source_id()
    alias_data = aliases_by_source_id.get(source_id, {})
    original_name = alias_data.get("original") or parsed.title
    dub_name = alias_data.get("dub") or official_profile.display_name if official_profile and official_profile.display_name else alias_data.get("dub") or original_name
    aliases = alias_data.get("aliases") or sorted({parsed.title, original_name, dub_name})

    base_level = official_profile.level if official_profile and official_profile.level else parsed.level
    base_type = official_profile.type_name if official_profile and official_profile.type_name else parsed.type
    base_attribute = official_profile.attribute if official_profile and official_profile.attribute else parsed.attribute
    base_image = (
        official_profile.image_local_path
        if official_profile and official_profile.image_local_path
        else official_profile.image_url
        if official_profile and official_profile.image_url
        else parsed.image
        or "icons/svg/mystery-man.svg"
    )
    stage_source = "official" if official_profile and official_profile.level else "wikimon"

    group = parsed.group if parsed.group in VALID_GROUPS else ""

    evolves_from_raw = [entry.as_dict() for entry in parsed.evolves_from_raw]
    evolves_to_raw = [entry.as_dict() for entry in parsed.evolves_to_raw]

    official_reference = official_profile.as_dict() if official_profile else {
        "directoryName": "",
        "url": "",
        "displayName": "",
        "level": "",
        "type": "",
        "attribute": "",
        "imageUrl": "",
        "imageLocalPath": "",
        "related": [],
    }

    return {
        "name": original_name,
        "type": "digimon",
        "img": base_image,
        "system": {
            "sourceId": source_id,
            "species": original_name,
            "isPersistentPartner": False,
            "nickname": "",
            "stage": normalize_stage(base_level, source=stage_source),
            "attribute": normalize_attribute(base_attribute),
            "type": base_type,
            "group": group,
            "field": parsed.field or "none",
            "names": {
                "canonical": source_id,
                "original": original_name,
                "dub": dub_name,
                "aliases": aliases,
            },
            "officialReference": official_reference,
            "wikimon": {
                "title": parsed.title,
                "url": parsed.url,
                "evolvesFrom": [entry.name for entry in parsed.evolves_from_raw],
                "evolvesTo": [entry.name for entry in parsed.evolves_to_raw],
                "evolvesFromRaw": evolves_from_raw,
                "evolvesToRaw": evolves_to_raw,
                "level": parsed.level,
                "type": parsed.type,
                "attribute": parsed.attribute,
                "field": parsed.field,
                "group": group,
                "rawGroup": parsed.group,
            },
            "evolutionHints": {
                "evolvesFrom": build_hints(parsed.evolves_from_raw),
                "evolvesTo": build_hints(parsed.evolves_to_raw),
            },
        },
    }


def build_hints(entries) -> list[dict[str, Any]]:
    result = []

    for entry in entries:
        if entry.ignored_by_default:
            continue

        if entry.confidence < 55:
            continue

        if not is_valid_evolution_hint_name(entry.name):
            continue

        result.append({
            "sourceId": normalize_source_id(entry.name),
            "name": entry.name,
            "originalName": entry.name,
            "dubName": "",
            "confidence": entry.confidence,
            "source": entry.source,
            "sourceType": entry.source_type,
            "sourceLabel": entry.source_label,
        })

    return result


def is_valid_evolution_hint_name(name: str) -> bool:
    raw = str(name or "").strip()
    lowered = raw.lower()

    if not raw:
        return False

    blocked_exact = {
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
        "human spirit of wind",
    }

    blocked_fragments = [
        " from the digimon card game",
        " from the battle spirits card game",
        " from digimon world: digital card arena",
        " from the digimon pendulum",
        "any ",
        "every digimon",
        "that also evolves from",
        "lv.",
        "attribute adult digimon",
        "human spirit of",
        "beast spirit of",
        "superior mode",
        "falldown mode",
        "burst mode",
        "x-antibody",
    ]

    if lowered in blocked_exact:
        return False

    if lowered.startswith("[n "):
        return False

    if lowered.startswith("any "):
        return False

    if lowered.startswith("every "):
        return False

    return not any(fragment in lowered for fragment in blocked_fragments)
