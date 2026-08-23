"""
Post-generation OPC validation for exported decks.

PowerPoint's "couldn't read some content ... and removed it" repair dialog gives
the user no diagnostic at all, and a repaired deck silently loses slides. These
checks run against the finished .pptx and surface the specific defect in the
logs (and in the export manifest) at the moment the file is produced, rather
than leaving it to be discovered on someone's laptop.

Every check here corresponds to a defect class that makes PowerPoint repair:
package-level damage, dangling relationships, undeclared content types,
malformed XML, duplicate shape ids, image bytes that disagree with their
declared extension, out-of-range slide ids, and chart caches holding values
that are not finite numbers.
"""
from __future__ import annotations

import logging
import re
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

_P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_C = "{http://schemas.openxmlformats.org/drawingml/2006/chart}"

_SLIDE_RE = re.compile(r"ppt/slides/slide\d+\.xml$")
_CHART_RE = re.compile(r"ppt/charts/chart\d+\.xml$")
_NON_FINITE = re.compile(r"^(nan|inf|-inf|infinity|-infinity|none|null)$", re.I)
_HEX6 = re.compile(r"^[0-9A-Fa-f]{6}$")

# Leading bytes that identify the raster formats PowerPoint accepts.
_IMAGE_MAGIC = {
    b"\x89PNG\r\n\x1a\n": "png",
    b"\xff\xd8\xff": "jpeg",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
    b"BM": "bmp",
}
# Extensions whose bytes we do not attempt to sniff.
_OPAQUE_IMAGE_EXT = {"emf", "wmf", "svg", "tiff", "tif"}


@dataclass
class PptxValidationResult:
    """Outcome of validating one generated deck."""

    path: str
    slide_count: int = 0
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def as_dict(self) -> Dict[str, object]:
        return {
            "path": self.path,
            "slide_count": self.slide_count,
            "ok": self.ok,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def _sniff_image(data: bytes) -> Optional[str]:
    for magic, kind in _IMAGE_MAGIC.items():
        if data.startswith(magic):
            return kind
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def _resolve(base: str, target: str) -> str:
    """Resolve a relationship target against the owning part's directory."""
    path = f"{base}{target}".replace("/./", "/")
    while "/../" in path:
        head, tail = path.split("/../", 1)
        head = head.rsplit("/", 1)[0] if "/" in head else ""
        path = f"{head}/{tail}"
    return path.lstrip("/")


def validate_pptx_package(path: str) -> PptxValidationResult:
    """Run every structural check against a generated deck."""
    result = PptxValidationResult(path=str(path))

    try:
        zf = zipfile.ZipFile(path)
    except Exception as exc:  # noqa: BLE001 - any failure here is fatal
        result.errors.append(f"not a readable OPC package: {exc}")
        return result

    with zf:
        damaged = zf.testzip()
        if damaged:
            result.errors.append(f"damaged zip member: {damaged}")

        names = set(zf.namelist())

        # ── Content types ────────────────────────────────────────────────
        if "[Content_Types].xml" not in names:
            result.errors.append("missing [Content_Types].xml")
            return result
        content_types = zf.read("[Content_Types].xml").decode("utf-8", "replace")

        # ── XML well-formedness across every part ────────────────────────
        for name in sorted(names):
            if name.endswith((".xml", ".rels")):
                try:
                    ET.fromstring(zf.read(name))
                except ET.ParseError as exc:
                    result.errors.append(f"malformed xml in {name}: {exc}")

        # ── Relationship targets must exist ──────────────────────────────
        for name in sorted(n for n in names if n.endswith(".rels")):
            base = name.rsplit("_rels/", 1)[0]
            try:
                root = ET.fromstring(zf.read(name))
            except ET.ParseError:
                continue  # already reported above
            for rel in root:
                target = rel.get("Target") or ""
                if rel.get("TargetMode") == "External" or target.startswith("http"):
                    continue
                resolved = _resolve(base, target)
                if resolved not in names:
                    result.errors.append(
                        f"dangling relationship in {name}: {target} -> {resolved}"
                    )

        # ── Undeclared part extensions ──────────────────────────────────
        for name in names:
            if name.endswith(".rels") or "." not in name:
                continue
            ext = name.rsplit(".", 1)[1].lower()
            if f'Extension="{ext}"' not in content_types and f"/{name}" not in content_types:
                if f'PartName="/{name}"' not in content_types:
                    result.errors.append(f"extension .{ext} not declared for {name}")

        # ── Slide list integrity ────────────────────────────────────────
        if "ppt/presentation.xml" in names:
            pres = ET.fromstring(zf.read("ppt/presentation.xml"))
            rels_name = "ppt/_rels/presentation.xml.rels"
            rel_map: Dict[str, str] = {}
            if rels_name in names:
                rel_map = {
                    r.get("Id"): (r.get("Target") or "")
                    for r in ET.fromstring(zf.read(rels_name))
                }

            listed = pres.find(f"{_P}sldIdLst")
            entries = list(listed) if listed is not None else []
            result.slide_count = len(entries)

            seen_ids: Counter = Counter()
            for entry in entries:
                sid = entry.get("id") or ""
                rid = entry.get(f"{_R}id") or ""
                seen_ids[sid] += 1
                # The schema constrains p:sldId/@id to 256..2147483647.
                if sid.isdigit() and not (256 <= int(sid) <= 2147483647):
                    result.errors.append(f"slide id {sid} outside legal range 256..2147483647")
                target = rel_map.get(rid)
                if not target:
                    result.errors.append(f"slide entry {sid} references missing rel {rid}")
                    continue
                part = _resolve("ppt/", target)
                if part not in names:
                    result.errors.append(f"slide entry {sid} points at missing part {part}")

            for sid, count in seen_ids.items():
                if count > 1:
                    result.errors.append(f"duplicate slide id {sid} appears {count} times")

            referenced = {
                _resolve("ppt/", rel_map[e.get(f"{_R}id") or ""])
                for e in entries
                if rel_map.get(e.get(f"{_R}id") or "")
            }
            orphans = {n for n in names if _SLIDE_RE.match(n)} - referenced
            for orphan in sorted(orphans):
                result.warnings.append(f"slide part not listed in sldIdLst: {orphan}")

        # ── Per-slide shape ids ─────────────────────────────────────────
        for name in sorted(n for n in names if _SLIDE_RE.match(n)):
            try:
                root = ET.fromstring(zf.read(name))
            except ET.ParseError:
                continue
            ids = [
                e.get("id")
                for tag in (f"{_P}cNvPr", f"{_A}cNvPr")
                for e in root.iter(tag)
                if e.get("id") is not None
            ]
            for shape_id, count in Counter(ids).items():
                if count > 1:
                    result.errors.append(f"{name}: duplicate shape id {shape_id} x{count}")
            if any(i in ("0", "") for i in ids):
                result.errors.append(f"{name}: shape id 0 is reserved")

        # ── Image bytes vs declared extension ───────────────────────────
        for name in sorted(n for n in names if n.startswith("ppt/media/")):
            data = zf.read(name)
            ext = name.rsplit(".", 1)[-1].lower()
            if not data:
                result.errors.append(f"empty media part {name}")
                continue
            if ext in _OPAQUE_IMAGE_EXT:
                continue
            kind = _sniff_image(data)
            expected = "jpeg" if ext in ("jpg", "jpeg") else ext
            if kind is None:
                result.errors.append(f"{name}: unrecognised image data for .{ext}")
            elif kind != expected:
                result.errors.append(f"{name}: declared .{ext} but bytes are {kind}")

        # ── Colour literals ─────────────────────────────────────────────
        for name in sorted(n for n in names if n.startswith("ppt/") and n.endswith(".xml")):
            body = zf.read(name).decode("utf-8", "replace")
            for value in set(re.findall(r'srgbClr val="([^"]*)"', body)):
                if not _HEX6.match(value):
                    result.errors.append(f"{name}: invalid srgbClr value {value!r}")

        # ── Chart caches must hold finite numbers ───────────────────────
        for name in sorted(n for n in names if _CHART_RE.match(n)):
            try:
                root = ET.fromstring(zf.read(name))
            except ET.ParseError:
                continue
            for cache in root.iter(f"{_C}numCache"):
                for point in cache.iter(f"{_C}pt"):
                    node = point.find(f"{_C}v")
                    text = (node.text or "").strip() if node is not None else ""
                    if not text or _NON_FINITE.match(text):
                        result.errors.append(
                            f"{name}: chart cache point idx={point.get('idx')} has value {text!r}"
                        )
                        continue
                    try:
                        float(text)
                    except ValueError:
                        result.errors.append(
                            f"{name}: chart cache point idx={point.get('idx')} is non-numeric {text!r}"
                        )
            for tag in (f"{_C}idx", f"{_C}order"):
                values = [e.get("val") for e in root.iter(tag)]
                for value, count in Counter(values).items():
                    if count > 1:
                        result.errors.append(
                            f"{name}: duplicate series {tag.split('}')[-1]} {value} x{count}"
                        )

        # ── Embedded workbooks must be real archives ────────────────────
        for name in sorted(n for n in names if "/embeddings/" in n):
            data = zf.read(name)
            if not data.startswith(b"PK"):
                result.errors.append(f"{name}: embedded workbook is not a zip archive")

    return result


def log_pptx_validation(path: str) -> PptxValidationResult:
    """Validate and log. Never raises — export must not fail on diagnostics."""
    try:
        result = validate_pptx_package(path)
    except Exception as exc:  # noqa: BLE001 - diagnostics are best-effort
        logger.warning("[PPTX Validate] validator crashed for %s: %s", path, exc)
        return PptxValidationResult(path=str(path), warnings=[f"validator crashed: {exc}"])

    if result.ok:
        logger.info(
            "[PPTX Validate] OK %s (%d slides, %d warnings)",
            path, result.slide_count, len(result.warnings),
        )
    else:
        logger.error(
            "[PPTX Validate] %d DEFECT(S) in %s — PowerPoint will offer to repair:",
            len(result.errors), path,
        )
        for err in result.errors[:25]:
            logger.error("[PPTX Validate]   - %s", err)
    for warn in result.warnings[:10]:
        logger.warning("[PPTX Validate]   ~ %s", warn)
    return result
