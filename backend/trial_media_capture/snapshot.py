"""
Trial media capture snapshot builders — inject media-upload question into product test phases.

Mirrors frontend/utils/trialMediaCaptureSnapshot.ts.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

PRODUCT_TRIAL_MEDIA_PHASES = ("before_use", "during_use", "after_use")

TRIAL_MEDIA_CANONICAL_QUESTION_ID = "pt_trial_media_upload"
TRIAL_MEDIA_SECTION_ID = "trial_media_capture"

DEFAULT_PROMPT_EN = (
    "Please upload a photo or short video showing your experience with the product during the trial."
)
DEFAULT_PROMPT_AR = (
    "يرجى رفع صورة أو فيديو قصير يوضح تجربتك مع المنتج أثناء التجربة."
)


def normalize_trial_media_capture(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Merge partial config with conservative defaults."""
    data = dict(raw or {})
    accepted = data.get("accepted_media", "image_or_video")
    if accepted not in ("image", "video", "image_or_video"):
        accepted = "image_or_video"

    timing = data.get("timing", "after_use")
    if timing not in PRODUCT_TRIAL_MEDIA_PHASES:
        timing = "after_use"

    def _clamp_int(value: Any, default: int, minimum: int, maximum: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return max(minimum, min(maximum, parsed))

    return {
        "enabled": bool(data.get("enabled")),
        "accepted_media": accepted,
        "required": bool(data.get("required")),
        "timing": timing,
        "prompt_en": (data.get("prompt_en") or DEFAULT_PROMPT_EN).strip(),
        "prompt_ar": (data.get("prompt_ar") or DEFAULT_PROMPT_AR).strip(),
        "max_video_duration_seconds": _clamp_int(
            data.get("max_video_duration_seconds"), 60, 5, 120,
        ),
        "max_image_mb": _clamp_int(data.get("max_image_mb"), 5, 1, 20),
        "max_video_mb": _clamp_int(data.get("max_video_mb"), 25, 5, 100),
    }


def build_trial_media_capture_question(
    capture: Dict[str, Any],
    language: str,
) -> Dict[str, Any]:
    """Build one media-upload respondent question."""
    is_arabic = language == "ar"
    timing = capture["timing"]

    return {
        "id": TRIAL_MEDIA_CANONICAL_QUESTION_ID,
        "text": capture["prompt_ar"] if is_arabic else capture["prompt_en"],
        "type": "media-upload",
        "options": [],
        "required": bool(capture.get("required")),
        "timing": timing,
        "diagnostic_tag": None,
        "questionMeta": {
            "nature": "fixed",
            "inputType": "media-upload",
            "canonicalQuestionId": TRIAL_MEDIA_CANONICAL_QUESTION_ID,
            "acceptedMedia": capture["accepted_media"],
            "maxVideoDurationSeconds": capture["max_video_duration_seconds"],
            "maxImageMb": capture["max_image_mb"],
            "maxVideoMb": capture["max_video_mb"],
        },
    }


def build_trial_media_capture_section(
    capture: Dict[str, Any],
    language: str,
) -> Optional[Dict[str, Any]]:
    """Survey-level trial media section (not brand-scoped)."""
    if not capture.get("enabled"):
        return None

    timing = capture["timing"]
    is_arabic = language == "ar"

    return {
        "id": TRIAL_MEDIA_SECTION_ID,
        "title": "رفع وسائط التجربة" if is_arabic else "Trial Media Upload",
        "module": "trial_media_capture",
        "timing": timing,
        "questions": [build_trial_media_capture_question(capture, language)],
    }


def build_trial_media_capture_snapshot_meta(
    pt_config: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Embed trial media settings on snapshot.meta for respondent clients."""
    capture = normalize_trial_media_capture(pt_config.get("trial_media_capture"))
    if not capture["enabled"]:
        return None

    return {
        "enabled": True,
        "accepted_media": capture["accepted_media"],
        "required": capture["required"],
        "timing": capture["timing"],
        "max_video_duration_seconds": capture["max_video_duration_seconds"],
        "max_image_mb": capture["max_image_mb"],
        "max_video_mb": capture["max_video_mb"],
        "question_id": TRIAL_MEDIA_CANONICAL_QUESTION_ID,
    }


def _phase_label(phase: str, language: str) -> str:
    labels = {
        "before_use": {"en": "Before Use", "ar": "قبل الاستخدام"},
        "during_use": {"en": "During Use", "ar": "أثناء الاستخدام"},
        "after_use": {"en": "After Use", "ar": "بعد الاستخدام"},
        "packaging": {"en": "Packaging & Presentation", "ar": "التعبئة والتغليف"},
    }
    bucket = labels.get(phase, labels["before_use"])
    return bucket.get(language, bucket["en"])


def _sort_phases(phases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    order = list(PRODUCT_TRIAL_MEDIA_PHASES) + ["packaging"]
    return sorted(phases, key=lambda p: order.index(p["timing"]) if p["timing"] in order else 99)


def append_trial_media_capture_to_phases(
    phases: List[Dict[str, Any]],
    pt_config: Dict[str, Any],
    language: str,
) -> List[Dict[str, Any]]:
    """
    Inject a single survey-level media-upload section into the configured timing phase.

    Creates the target phase when missing (e.g. during_use-only upload with no bank questions).
    """
    capture = normalize_trial_media_capture(pt_config.get("trial_media_capture"))
    section = build_trial_media_capture_section(capture, language)
    if not section:
        return phases

    timing: Literal["before_use", "during_use", "after_use"] = capture["timing"]
    next_phases = [dict(p, sections=list(p.get("sections") or [])) for p in phases]
    target = next((p for p in next_phases if p.get("timing") == timing), None)

    if target:
        target["sections"].append(section)
    else:
        next_phases.append({
            "timing": timing,
            "label": _phase_label(timing, language),
            "sections": [section],
        })

    return _sort_phases(next_phases)


def enrich_snapshot_with_trial_media_capture_meta(
    snapshot: Dict[str, Any],
    pt_config: Dict[str, Any],
) -> Dict[str, Any]:
    """Attach trial_media_capture block to snapshot.meta when configured."""
    tm_meta = build_trial_media_capture_snapshot_meta(pt_config)
    if not tm_meta:
        return snapshot

    enriched = dict(snapshot)
    meta = dict(enriched.get("meta") or {})
    meta["trial_media_capture"] = tm_meta
    enriched["meta"] = meta
    return enriched
