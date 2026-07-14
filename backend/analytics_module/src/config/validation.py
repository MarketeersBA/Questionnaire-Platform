"""Validate project_inputs and slides_content JSON at load time."""
from pathlib import Path
from typing import Dict, Any, List


REQUIRED_PROJECT_KEYS = [
    "dataset_path",
    "study_print_path",
    "output_dir",
    "project_name",
    "sections",
    "screening_cols",
    "pivots_needed",
]

REQUIRED_SLIDE_ITEM_FIELDS = ["section", "module", "visual_id"]


def validate_project_inputs(inputs: Dict[str, Any]) -> List[str]:
    """Validate project_inputs dict. Returns list of error messages (empty if valid)."""
    errors = []
    for key in REQUIRED_PROJECT_KEYS:
        if key not in inputs:
            errors.append(f"Missing required key: '{key}'")
        elif inputs[key] is None:
            errors.append(f"Key '{key}' is null")

    for path_key in ("dataset_path", "study_print_path"):
        val = inputs.get(path_key)
        if val and not Path(val).exists():
            errors.append(f"File not found for '{path_key}': {val}")

    output_dir = inputs.get("output_dir")
    if output_dir:
        parent = Path(output_dir).parent
        if not parent.exists():
            errors.append(f"Parent directory for 'output_dir' does not exist: {parent}")

    sections = inputs.get("sections")
    if sections is not None and not isinstance(sections, list):
        errors.append(f"'sections' must be a list, got {type(sections).__name__}")

    return errors


def validate_slides_content(config: Dict[str, Any]) -> List[str]:
    """Validate slides_content.json structure. Returns list of error messages."""
    errors = []

    slides = config.get("slides", {})
    if not isinstance(slides, dict):
        errors.append("'slides' must be an object")
        return errors

    for slide_id, spec in slides.items():
        if not isinstance(spec, dict):
            errors.append(f"slides.{slide_id}: expected object, got {type(spec).__name__}")
            continue
        items = spec.get("items", {})
        if isinstance(items, dict):
            for vid, item_cfg in items.items():
                if not isinstance(item_cfg, dict):
                    continue
                if "module" not in item_cfg:
                    errors.append(f"slides.{slide_id}.items.{vid}: missing 'module'")

    dynamic = config.get("dynamic_slides", {})
    if isinstance(dynamic, dict):
        for slide_id, spec in dynamic.items():
            if not isinstance(spec, dict):
                continue
            if "module" not in spec and "items" not in spec:
                errors.append(f"dynamic_slides.{slide_id}: must have 'module' or 'items'")

    return errors
