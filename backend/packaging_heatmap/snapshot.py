"""Packaging heatmap snapshot composition — question/section builders."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.packaging_heatmap.constants import (
    PACKAGING_HEATMAP_INTENTS,
    PACKAGING_HEATMAP_MAX_CLICKS,
    PACKAGING_HEATMAP_MAX_PINS,
    PACKAGING_IMAGE_SIDES,
)
from backend.services.product_test_orchestration import (
    build_brand_scoped_question_id,
    resolve_brand_display_name,
)

PACKAGING_HEATMAP_SECTION_PREFIX = "packaging_heatmap"

INTENT_PROMPTS: Dict[str, Dict[str, Dict[str, str]]] = {
    "attraction": {
        "front": {
            "en": "Tap the parts of the packaging you like or find attractive",
            "ar": "المس الأجزاء التي تعجبك في الغلاف الأمامي أو تجدها جذابة",
        },
        "back": {
            "en": "Tap the parts of the packaging you like or find attractive",
            "ar": "المس الأجزاء التي تعجبك في الغلاف الخلفي أو تجدها جذابة",
        },
    },
    "dislikes": {
        "front": {
            "en": "Tap the parts of the packaging you don't like",
            "ar": "المس الأجزاء التي لا تعجبك في الغلاف الأمامي",
        },
        "back": {
            "en": "Tap the parts of the packaging you don't like",
            "ar": "المس الأجزاء التي لا تعجبك في الغلاف الخلفي",
        },
    },
    "improve": {
        "front": {
            "en": "Tap the parts you would change or improve",
            "ar": "المس الأجزاء التي تقترح تغييرها أو تحسينها في الغلاف الأمامي",
        },
        "back": {
            "en": "Tap the parts you would change or improve",
            "ar": "المس الأجزاء التي تقترح تغييرها أو تحسينها في الغلاف الخلفي",
        },
    },
}


def heatmap_canonical_question_id(side: str, intent: str) -> str:
    return f"pkg_hm_{side}_{intent}"


def _slugify_brand(value: str) -> str:
    import re

    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")[:64] or "brand"


def _configured_image_sides(pt_config: Dict[str, Any]) -> List[str]:
    images = pt_config.get("packaging_heatmap_images") or {}
    sides: List[str] = []
    front = images.get("front")
    if isinstance(front, dict) and front.get("asset_id"):
        sides.append("front")
    back = images.get("back")
    if isinstance(back, dict) and back.get("asset_id"):
        sides.append("back")
    return sides


def build_packaging_heatmap_snapshot_meta(pt_config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Embed image metadata on snapshot.meta for respondent clients."""
    if not pt_config.get("packaging_heatmap_enabled"):
        return None

    images = pt_config.get("packaging_heatmap_images") or {}
    configured = _configured_image_sides(pt_config)
    if not configured:
        return None

    payload_images: Dict[str, Any] = {}
    for side in PACKAGING_IMAGE_SIDES:
        raw = images.get(side)
        if not isinstance(raw, dict) or not raw.get("asset_id"):
            continue
        payload_images[side] = {
            "asset_id": raw.get("asset_id"),
            "side": side,
            "width": raw.get("width"),
            "height": raw.get("height"),
            "mime": raw.get("mime"),
        }

    return {
        "enabled": True,
        "images": payload_images,
        "max_clicks": PACKAGING_HEATMAP_MAX_PINS,
        "intents": list(PACKAGING_HEATMAP_INTENTS),
        "configured_sides": configured,
    }


def build_packaging_heatmap_question(
    *,
    own_brand: str,
    side: str,
    intent: str,
    language: str,
    image_asset: Dict[str, Any],
    brand_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build one packaging-heatmap respondent question."""
    canonical_id = heatmap_canonical_question_id(side, intent)
    question_id = build_brand_scoped_question_id(own_brand, canonical_id)
    is_arabic = language == "ar"
    text = INTENT_PROMPTS[intent][side]["ar" if is_arabic else "en"]

    testing_protocol = (brand_context or {}).get("testing_protocol", "branded")
    blind_codes = (brand_context or {}).get("blind_codes") or {}
    display_brand = resolve_brand_display_name(
        own_brand,
        testing_protocol=testing_protocol,
        blind_codes=blind_codes,
    )

    return {
        "id": question_id,
        "text": text,
        "type": "packaging-heatmap",
        "options": [],
        "required": True,
        "timing": "packaging",
        "diagnostic_tag": None,
        "brand": own_brand,
        "displayBrand": display_brand,
        "canonicalQuestionId": canonical_id,
        "questionMeta": {
            "nature": "fixed",
            "inputType": "packaging-heatmap",
            "interactionMode": "tap_pin",
            "canonicalQuestionId": canonical_id,
            "imageSide": side,
            "heatmapIntent": intent,
            "maxClicks": PACKAGING_HEATMAP_MAX_PINS,
            "imageAssetId": image_asset.get("asset_id"),
            "imageWidth": image_asset.get("width"),
            "imageHeight": image_asset.get("height"),
        },
    }


def build_packaging_heatmap_section(
    pt_config: Dict[str, Any],
    brand_context: Optional[Dict[str, Any]],
    language: str,
) -> Optional[Dict[str, Any]]:
    """
    Target-brand-only packaging heatmap section.

    Returns None when feature disabled, own_brand missing, or no front image.
    """
    if not pt_config.get("packaging_heatmap_enabled"):
        return None

    own_brand = (
        (brand_context or {}).get("own_brand")
        or pt_config.get("own_brand")
        or ""
    ).strip()
    if not own_brand:
        return None

    images = pt_config.get("packaging_heatmap_images") or {}
    configured_sides = _configured_image_sides(pt_config)
    if "front" not in configured_sides:
        return None

    questions: List[Dict[str, Any]] = []
    for side in configured_sides:
        image_asset = images.get(side) or {}
        for intent in PACKAGING_HEATMAP_INTENTS:
            questions.append(
                build_packaging_heatmap_question(
                    own_brand=own_brand,
                    side=side,
                    intent=intent,
                    language=language,
                    image_asset=image_asset,
                    brand_context=brand_context,
                ),
            )

    if not questions:
        return None

    is_arabic = language == "ar"
    testing_protocol = (brand_context or {}).get("testing_protocol", "branded")
    blind_codes = (brand_context or {}).get("blind_codes") or {}
    display_brand = resolve_brand_display_name(
        own_brand,
        testing_protocol=testing_protocol,
        blind_codes=blind_codes,
    )

    return {
        "id": f"{PACKAGING_HEATMAP_SECTION_PREFIX}_{_slugify_brand(own_brand)}",
        "title": (
            "خريطة حرارية للتغليف (العلامة المستهدفة)"
            if is_arabic
            else "Packaging Heatmap (Target Brand)"
        ),
        "module": "packaging_heatmap",
        "timing": "packaging",
        "brand": own_brand,
        "displayBrand": display_brand,
        "questions": questions,
    }


def enrich_snapshot_with_packaging_heatmap_meta(
    snapshot: Dict[str, Any],
    pt_config: Dict[str, Any],
) -> Dict[str, Any]:
    """Attach packaging_heatmap block to snapshot.meta when configured."""
    hm_meta = build_packaging_heatmap_snapshot_meta(pt_config)
    if not hm_meta:
        return snapshot

    enriched = dict(snapshot)
    meta = dict(enriched.get("meta") or {})
    meta["packaging_heatmap"] = hm_meta
    enriched["meta"] = meta
    return enriched
