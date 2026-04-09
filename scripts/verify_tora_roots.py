#!/usr/bin/env python3

from __future__ import annotations

import re
import ssl
import sys
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE_URL = "https://tora.quest/tnk1/ljon/jorj/index.html"
REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = REPO_ROOT / "src/game/data/roots_hebrew_scraped.txt"

HEB_TO_GAME = {
    "א": "a",
    "ב": "b",
    "ג": "j",
    "ד": "d",
    "ה": "e",
    "ו": "w",
    "ז": "z",
    "ח": "h",
    "ט": "u",
    "י": "i",
    "כ": "k",
    "ל": "l",
    "מ": "m",
    "נ": "n",
    "ס": "s",
    "ע": "o",
    "פ": "f",
    "צ": "x",
    "ק": "q",
    "ר": "r",
    "ש": "c",
    "ת": "t",
}

LEGACY_SYMBOL_TO_GAME = {
    "*": "e",
    "&": "z",
    "@": "o",
    "%": "c",
}

FINAL_HEBREW_TO_REGULAR = {
    "ך": "כ",
    "ם": "מ",
    "ן": "נ",
    "ף": "פ",
    "ץ": "צ",
}

ANCHOR_RE = re.compile(r'<a[^>]*href="../../ljon/jorj/([^"]+)\.html"[^>]*>([^<]*)</a>')
HEBREW_BASE_LETTERS_RE = re.compile(r"[אבגדהוזחטיכלמנסעפצקרשת]")
NIQQUD_RE = re.compile(r"[\u0591-\u05C7]")


def fetch_source_html() -> str:
    request = Request(SOURCE_URL, headers={"User-Agent": "root-game-roots-verifier/1.0"})
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    with urlopen(request, context=context, timeout=30) as response:
        return response.read().decode("cp1255", errors="replace")


def normalize_hebrew_root(value: str) -> str:
    cleaned = NIQQUD_RE.sub("", value).replace(" ", "")
    output: list[str] = []

    for ch in cleaned:
        normalized = FINAL_HEBREW_TO_REGULAR.get(ch, ch)
        if HEBREW_BASE_LETTERS_RE.fullmatch(normalized):
            output.append(normalized)

    return "".join(output)


def transliterate_hebrew_root(value: str) -> str:
    return "".join(HEB_TO_GAME[ch] for ch in value)


def load_dataset_roots() -> set[str]:
    roots: set[str] = set()

    for line in DATASET_PATH.read_text(encoding="utf-8").splitlines():
        trimmed = line.split("#", 1)[0].strip().lower()
        if not trimmed:
            continue
        normalized = "".join(LEGACY_SYMBOL_TO_GAME.get(ch, ch) for ch in trimmed)
        roots.add(normalized)

    return roots


def extract_page_roots(html: str) -> tuple[int, int, set[str]]:
    anchors = ANCHOR_RE.findall(html)
    roots: set[str] = set()
    three_letter_entries = 0

    # The source slugs use a different Latin transliteration scheme, so compare on Hebrew labels instead.
    for _, label in anchors:
        hebrew = normalize_hebrew_root(label)
        if len(hebrew) != 3:
            continue
        three_letter_entries += 1
        roots.add(transliterate_hebrew_root(hebrew))

    return len(anchors), three_letter_entries, roots


def main() -> int:
    source_html = fetch_source_html()
    anchor_count, three_letter_entry_count, source_roots = extract_page_roots(source_html)
    dataset_roots = load_dataset_roots()

    missing = sorted(source_roots - dataset_roots)
    extra = sorted(dataset_roots - source_roots)

    print(f"source url: {SOURCE_URL}")
    print(f"source anchors: {anchor_count}")
    print(f"source 3-letter entries: {three_letter_entry_count}")
    print(f"source unique normalized 3-letter roots: {len(source_roots)}")
    print(f"dataset roots: {len(dataset_roots)}")

    if missing or extra:
        print(f"missing roots: {len(missing)}")
        if missing:
            print("  " + ", ".join(missing[:50]))
        print(f"extra roots: {len(extra)}")
        if extra:
            print("  " + ", ".join(extra[:50]))
        return 1

    print("dataset matches the source page for every normalized 3-letter root")
    return 0


if __name__ == "__main__":
    sys.exit(main())
