from dataclasses import dataclass


SOURCE_WEIGHTS = {
    "anime": 100,
    "manga": 95,
    "game": 90,
    "referenceBook": 85,
    "vpet": 70,
    "toy": 60,
    "cardGame": 20,
    "promotional": 10,
    "unknown": 40,
}

IGNORED_BY_DEFAULT = {
    "cardGame",
    "promotional",
}

SPECIAL_CASE_KEYWORDS = {
    "x-antibody": "xAntibody",
    "x antibody": "xAntibody",
    "armor": "armor",
    "armour": "armor",
    "jogress": "jogress",
    "dna": "jogress",
    "hybrid": "hybrid",
    "spirit evolution": "hybrid",
    "mode change": "modeChange",
    "burst mode": "burstMode",
    "digi-xros": "digiXros",
    "digixros": "digiXros",
    "appmon": "appmon",
}


@dataclass(frozen=True)
class SourceDecision:
    source_type: str
    confidence: int
    ignored_by_default: bool
    special_case: str = ""


def classify_source(label: str = "") -> SourceDecision:
    raw = str(label or "").strip()
    text = raw.lower()

    special_case = ""
    for keyword, kind in SPECIAL_CASE_KEYWORDS.items():
        if keyword in text:
            special_case = kind
            break

    if "card" in text or "hyper colosseum" in text:
        source_type = "cardGame"
    elif "pendulum" in text or "v-pet" in text or "virtual pet" in text:
        source_type = "vpet"
    elif "vital bracelet" in text or "digivice" in text or "toy" in text:
        source_type = "toy"
    elif "anime" in text or "adventure" in text or "tamers" in text or "frontier" in text or "savers" in text or "ghost game" in text:
        source_type = "anime"
    elif "manga" in text or "v-tamer" in text or "next" in text:
        source_type = "manga"
    elif "cyber sleuth" in text or "survive" in text or "next order" in text or "world" in text or "story" in text or "game" in text:
        source_type = "game"
    elif "reference book" in text or "profile" in text:
        source_type = "referenceBook"
    elif "promo" in text or "event" in text:
        source_type = "promotional"
    else:
        source_type = "unknown"

    ignored = source_type in IGNORED_BY_DEFAULT or bool(special_case)
    confidence = SOURCE_WEIGHTS.get(source_type, SOURCE_WEIGHTS["unknown"])

    if special_case:
        confidence = min(confidence, 25)

    return SourceDecision(
        source_type=source_type,
        confidence=confidence,
        ignored_by_default=ignored,
        special_case=special_case,
    )
