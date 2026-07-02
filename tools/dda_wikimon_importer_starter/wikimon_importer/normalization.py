import re
import unicodedata


def strip_accents(value: str) -> str:
    value = str(value or "")
    return "".join(
        char for char in unicodedata.normalize("NFD", value)
        if unicodedata.category(char) != "Mn"
    )


def normalize_source_id(value: str) -> str:
    value = strip_accents(value)
    value = value.replace("X-Antibody", "X Antibody")
    value = re.sub(r"[^A-Za-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_").lower()
    return value


def normalize_lookup_key(value: str) -> str:
    value = strip_accents(value)
    value = re.sub(r"[^A-Za-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip().lower()


def clean_text(value: str) -> str:
    value = re.sub(r"\[[0-9]+\]", "", str(value or ""))
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def clean_digimon_name(value: str) -> str:
    value = clean_text(value)
    value = re.sub(r"\s*\(.*?\)\s*$", "", value).strip()
    return value
