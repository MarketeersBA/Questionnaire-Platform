"""
Deciding whether two brand-name strings refer to the same brand, across
English and Arabic script, with no network call.

Python port of frontend/src/utils/brandNameIdentity.ts — kept in lockstep
with it deliberately, the same way the taste-test schema composers are.
See that file for the full rationale: this reduces each name to its
*consonant skeleton* (vowels dropped, phonetically-equivalent consonants
folded onto one class, e.g. Arabic's lack of a native P routinely renders
"Pepsi" with ب/B) and compares those skeletons, tolerant of a single-edit
difference once the skeleton is long enough to make that safe.
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional

LATIN_CLASS: Dict[str, str] = {
    "b": "B", "p": "B",
    "t": "T",
    "d": "D",
    "f": "F", "v": "F",
    "k": "K", "q": "K", "c": "K",
    "g": "G", "j": "G",
    "s": "S", "x": "S",
    "z": "Z",
    "h": "H",
    "r": "R",
    "l": "L",
    "m": "M",
    "n": "N",
    "w": "", "y": "",
    "a": "", "e": "", "i": "", "o": "", "u": "",
}

ARABIC_CLASS: Dict[str, str] = {
    "ب": "B", "پ": "B",
    "ت": "T", "ط": "T",
    "د": "D", "ض": "D",
    "ف": "F",
    "ك": "K", "ق": "K",
    "ج": "G", "چ": "G", "غ": "G", "گ": "K",
    "س": "S", "ص": "S", "ث": "S",
    "ز": "Z", "ذ": "Z", "ژ": "Z",
    "ش": "S",
    "ح": "H", "خ": "H", "ه": "H",
    "ر": "R",
    "ل": "L",
    "م": "M",
    "ن": "N",
    "ا": "", "أ": "", "إ": "", "آ": "", "ى": "", "ة": "", "ء": "", "ع": "",
    "و": "", "ي": "",
}

_LEADING_AL = re.compile(r"^ال")


def _collapse_adjacent_duplicates(s: str) -> str:
    out: List[str] = []
    for ch in s:
        if not out or ch != out[-1]:
            out.append(ch)
    return "".join(out)


def brand_phonetic_skeleton(raw_name: str) -> str:
    """The consonant-class skeleton of one brand name, script-agnostic."""
    without_article = _LEADING_AL.sub("", raw_name or "")
    classes = "".join(
        ARABIC_CLASS.get(ch, LATIN_CLASS.get(ch, ""))
        for ch in without_article.lower()
    )
    return _collapse_adjacent_duplicates(classes)


def _levenshtein(a: str, b: str) -> int:
    rows, cols = len(a) + 1, len(b) + 1
    dist = list(range(cols)) + [0] * (cols * (rows - 1))
    for i in range(1, rows):
        dist[i * cols] = i
    for i in range(1, rows):
        for j in range(1, cols):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dist[i * cols + j] = min(
                dist[(i - 1) * cols + j] + 1,
                dist[i * cols + (j - 1)] + 1,
                dist[(i - 1) * cols + (j - 1)] + cost,
            )
    return dist[rows * cols - 1]


# Below this skeleton length, a single-character edit distance is too easy to
# hit by coincidence between two genuinely different short brand names
# ("Kiri" -> "KR" is one edit from "Kiki" -> "K") — require an exact skeleton
# match there. Longer skeletons carry enough information that one differing
# consonant (a transliteration choice, not a different brand) is safe.
FUZZY_MIN_SKELETON_LENGTH = 4
MAX_EDIT_DISTANCE = 1


def is_same_brand(a: str, b: str) -> bool:
    """Same spelling (case/whitespace-insensitive), or a same-brand
    transliteration across English and Arabic script."""
    left = (a or "").strip()
    right = (b or "").strip()
    if not left or not right:
        return False
    if left.lower() == right.lower():
        return True

    skel_a = brand_phonetic_skeleton(left)
    skel_b = brand_phonetic_skeleton(right)
    if not skel_a or not skel_b:
        return False
    if skel_a == skel_b:
        return True

    longest = max(len(skel_a), len(skel_b))
    if longest < FUZZY_MIN_SKELETON_LENGTH:
        return False
    return _levenshtein(skel_a, skel_b) <= MAX_EDIT_DISTANCE


def find_same_brand_key(candidate: str, keys: Iterable[str]) -> Optional[str]:
    """The key in `keys` that is the same brand as `candidate`, if any —
    exact (normalized) match first, then the phonetic fallback."""
    trimmed = (candidate or "").strip()
    if not trimmed:
        return None
    keys = list(keys)
    for key in keys:
        if key.strip().lower() == trimmed.lower():
            return key
    for key in keys:
        if is_same_brand(key, trimmed):
            return key
    return None


def dedupe_brand_names(*lists: Optional[Iterable[str]]) -> List[str]:
    merged: List[str] = []
    for lst in lists:
        for raw in lst or []:
            name = (raw or "").strip()
            if not name:
                continue
            if any(is_same_brand(kept, name) for kept in merged):
                continue
            merged.append(name)
    return merged
