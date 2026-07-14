"""
Validate internal markdown links in documentation files.

Scans:
  - docs/**/*.md
  - Root-level *.md (README, ANALYST_GUIDE, redirects)

Usage (from repo root):
  python scripts/validate_docs_links.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]

LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")

SCAN_ROOTS = [
    ROOT / "docs",
]

SCAN_FILES = [
    ROOT / "README.md",
    ROOT / "ANALYST_GUIDE.md",
    ROOT / "Complete Technical Documentation.md",
]


def is_external(target: str) -> bool:
    return target.startswith(("http://", "https://", "mailto:", "#"))


def resolve_link(source: Path, target: str) -> Path | None:
    target = unquote(target.split("#")[0].strip())
    if not target or is_external(target):
        return None
    if target.startswith("/"):
        resolved = ROOT / target.lstrip("/")
    else:
        resolved = (source.parent / target).resolve()
    return resolved


def collect_md_files() -> list[Path]:
    files: list[Path] = []
    for scan_root in SCAN_ROOTS:
        if scan_root.exists():
            files.extend(sorted(scan_root.rglob("*.md")))
    for f in SCAN_FILES:
        if f.exists() and f not in files:
            files.append(f)
    return sorted(set(files))


def validate() -> list[tuple[Path, str, Path]]:
    broken: list[tuple[Path, str, Path]] = []
    for md in collect_md_files():
        text = md.read_text(encoding="utf-8", errors="replace")
        for match in LINK_RE.finditer(text):
            raw = match.group(1).strip()
            if raw.startswith("<") and raw.endswith(">"):
                raw = raw[1:-1]
            resolved = resolve_link(md, raw)
            if resolved is None:
                continue
            if not resolved.exists():
                broken.append((md, raw, resolved))
    return broken


def main() -> None:
    files = collect_md_files()
    broken = validate()
    if not broken:
        print(f"OK: all internal links resolved ({len(files)} files scanned)")
        sys.exit(0)
    print(f"BROKEN: {len(broken)} link(s)\n")
    for src, raw, resolved in broken:
        rel_src = src.relative_to(ROOT)
        try:
            rel_res = resolved.relative_to(ROOT)
        except ValueError:
            rel_res = resolved
        print(f"  {rel_src}")
        print(f"    [{raw}] -> {rel_res}")
    sys.exit(1)


if __name__ == "__main__":
    main()
