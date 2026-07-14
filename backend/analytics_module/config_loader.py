import json
import os
import sys
from pathlib import Path
from typing import Iterable
from openai import OpenAI

from backend.analytics_module.project_inputs_setter import finalize_project_inputs
from backend.analytics_module.mytypes import AppConfig
from backend.analytics_module.src.config.settings import DEFAULT_OPENAI_MODEL

# pyinstaller (Windows):
# pyinstaller --onefile --add-data "app\\config;app\\config" app\\app.py
# macOS/Linux:
# pyinstaller --onefile --add-data "app/config:app/config" app/app.py

# Absolute path to the *app* package directory (this file's directory)
APP_DIR = Path(__file__).resolve().parent


def get_resource_path(relative_path: str) -> str:
    """
    Works for both development, PyInstaller .exe, and integrated FastAPI server.
    Dynamically resolves the resources directory from environment variables or defaults.
    """
    if hasattr(sys, "_MEIPASS"):
        # Running inside PyInstaller bundle
        base_path = sys._MEIPASS
    else:
        # Integrated FastAPI or standalone: priority to environment variable
        env_resources = os.environ.get("ANALYTICS_RESOURCES_DIR")
        if env_resources:
            base_path = os.path.abspath(env_resources)
            # When using environment variable, we usually want paths 
            # relative to THAT directory, so we don't join with APP_DIR.
            return os.path.join(base_path, relative_path)
        
        # Default fallback: assume it's under backend/resources/analytics
        # Since this file is in backend/analytics_module/
        base_path = os.path.abspath(APP_DIR / ".." / "resources" / "analytics")

    return os.path.join(base_path, relative_path)


def load_json_config(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"Configuration file not found: {path}")
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in configuration file {path}: {e}") from e


def get_pptx_template_path(filename: str):
    return get_resource_path(filename)


try:
    from dotenv import load_dotenv

    _ROOT_ENV_PATH = APP_DIR / ".env"
    if _ROOT_ENV_PATH.is_file():
        # OS/process env wins so CI and explicit exports are not overridden by a local file.
        load_dotenv(_ROOT_ENV_PATH, override=False)
except ImportError:
    pass


def require_openai_api_key() -> str:
    """Read API key from OPENAI_API_KEY; never commit secrets in source code."""
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise ValueError(
            "OPENAI_API_KEY is not set. Copy .env.example to .env and set OPENAI_API_KEY, "
            "or set OPENAI_API_KEY in your OS environment. Do not commit .env or API keys."
        )
    return key


def validate_config(config: dict, config_name: str) -> list:
    """
    Validate config and return list of errors.
    
    Args:
        config: Configuration dictionary to validate
        config_name: Name of the config file for error messages
        
    Returns:
        List of error messages (empty if valid)
    """
    errors = []
    required_fields = ["section", "module", "visual_id"]
    
    for key, value in config.items():
        # Skip comment entries
        if key.startswith("comment") or not isinstance(value, dict):
            continue
        
        # Check for required fields
        for field in required_fields:
            if field not in value:
                errors.append(
                    f"{config_name}: Item '{key}' missing required field '{field}'"
                )
        
        # Validate module field is not empty (unless it's intentionally empty)
        if "module" in value and value["module"] == "":
            # Empty module is allowed (e.g., item "6" has empty module)
            pass
    
    return errors


# Cache for unified slides_content.json (single-file config)
_cached_unified_config = None


def _get_unified_config() -> dict:
    """Load config/slides_content.json once and cache. Returns {} if file missing."""
    global _cached_unified_config
    if _cached_unified_config is None:
        path = get_resource_path("slides_content.json")
        if not os.path.exists(path):
            _cached_unified_config = {}
        else:
            _cached_unified_config = load_json_config(path)
    return _cached_unified_config


def _is_new_slides_format(config: dict) -> bool:
    """True if config uses new format: fixed slides have 'items' dict or dynamic slides have 'module'."""
    for spec in config.get("slides", {}).values():
        if isinstance(spec.get("items"), dict):
            return True
    for spec in config.get("dynamic_slides", {}).values():
        if spec.get("module") is not None or isinstance(spec.get("items"), dict):
            return True
    return False


def _flatten_unified_config_to_all_charts(config: dict) -> dict:
    """Build all_charts_json (visual_id -> config) from unified slides_content.json."""
    result = {}
    # Fixed slides: collect from spec["items"]
    for spec in config.get("slides", {}).values():
        items = spec.get("items") or {}
        if not isinstance(items, dict):
            continue
        section = spec.get("section") or ""
        for vid, cfg in items.items():
            if vid in result:
                continue
            entry = dict(cfg)
            entry["section"] = section  # section lives only at slide level
            entry["visual_id"] = vid  # key is the visual_id
            result[vid] = entry
    # Dynamic slides: spec as single item or spec["items"]
    for slide_id, spec in config.get("dynamic_slides", {}).items():
        items = spec.get("items")
        if isinstance(items, dict):
            section = spec.get("section") or ""
            for vid, cfg in items.items():
                if vid in result:
                    continue
                entry = dict(cfg)
                entry["section"] = section
                entry["visual_id"] = vid
                result[vid] = entry
        elif spec.get("module") is not None:
            key = spec.get("visual_id") or slide_id
            if key in result:
                continue
            entry = dict(spec)
            entry["visual_id"] = key
            entry["section"] = spec.get("section") or ""
            result[key] = entry
    return result


def load_slides_content() -> dict:
    """
    Load slides_content.json if it exists.
    Returns dict with slides and dynamic_slides (for build_slide_list).
    """
    config = _get_unified_config()
    if not config:
        return {}
    return {
        "slides": config.get("slides", {}),
        "dynamic_slides": config.get("dynamic_slides", {}),
    }


def _build_charts_indices(all_charts_json: dict):
    """Build visual_id -> items and module -> items for resolving slide items_ids."""
    by_visual_id = {}
    by_module = {}
    for item_number, item in all_charts_json.items():
        if str(item_number).startswith("comment") or not isinstance(item, dict):
            continue
        vid = item.get("visual_id")
        mod = (item.get("module") or "").strip()
        if vid:
            by_visual_id.setdefault(vid, []).append((str(item_number), item))
        if mod:
            by_module.setdefault(mod, []).append((str(item_number), item))
    return by_visual_id, by_module


def resolve_items_ids(items_ids: list, all_charts_json: dict, by_visual_id: dict, by_module: dict):
    """
    Resolve a list of items_ids (visual_ids or module names) to a list of (item_number, item).
    Deduplicates by item_number and preserves order of first occurrence.
    """
    seen = set()
    out = []
    for iid in items_ids:
        if not iid:
            continue
        # Try visual_id match first (case-insensitive for keys)
        found = False
        for vid, entries in by_visual_id.items():
            if vid and str(vid).strip().lower() == str(iid).strip().lower():
                for item_number, item in entries:
                    if item_number not in seen:
                        seen.add(item_number)
                        out.append((item_number, item))
                found = True
                break
        if found:
            continue
        # Try module match (normalize spaces to underscores for items_id like "brand cards")
        iid_norm = str(iid).strip().lower().replace(" ", "_")
        for mod, entries in by_module.items():
            mod_norm = (mod or "").strip().lower()
            if mod_norm and (mod_norm == str(iid).strip().lower() or mod_norm == iid_norm):
                for item_number, item in entries:
                    if item_number not in seen:
                        seen.add(item_number)
                        out.append((item_number, item))
                break
    return out


def build_slide_list(
    slides_content: dict,
    all_charts_json: dict,
    sections: Iterable[str],
) -> list:
    """
    Build initial slide list (fixed slides + dynamic slide templates) from slides_content.
    Each slide info dict: slide_id, type, items_ids, items (list of (key, item)), section, data, insight.
    Supports new format (per-slide "items" or "module" on spec) and old format (items_ids + all_charts_json).
    Only includes slides whose resolved items have section in sections (case-insensitive).
    """
    if not slides_content:
        return []

    allowed = {s.lower() for s in sections} if sections else None
    by_visual_id, by_module = (_build_charts_indices(all_charts_json) if all_charts_json else ({}, {}))
    slide_list = []

    # Helper: build items list from new-format spec (items dict or spec as single item)
    def _items_from_spec(spec, slide_id, is_dynamic=False):
        items_obj = spec.get("items")
        if isinstance(items_obj, dict):
            return [(vid, {**cfg, "visual_id": vid}) for vid, cfg in items_obj.items()]
        if is_dynamic and spec.get("module") is not None:
            key = spec.get("visual_id") or slide_id
            return [(key, {**spec, "visual_id": key})]
        return None

    # Fixed slides (preserve order)
    for slide_id, spec in slides_content.get("slides", {}).items():
        items = _items_from_spec(spec, slide_id, is_dynamic=False)
        if items is None:
            items_ids = spec.get("items_ids") or []
            items = resolve_items_ids(items_ids, all_charts_json, by_visual_id, by_module) if all_charts_json else []
        if not items:
            continue
        section = (spec.get("section") or (items[0][1].get("section") if items else "") or "").strip()
        if allowed and section.lower() not in allowed:
            continue
        slide_list.append({
            "slide_id": slide_id,
            "type": "fixed",
            "items_ids": [t[0] for t in items],
            "items": items,
            "section": section,
            "data": {},
            "insight": "",
            "template_slide_title": spec.get("template_slide_title") or section,
        })

    # Dynamic slide templates (one per dynamic_slides key; expansion happens after processing)
    for slide_id, spec in slides_content.get("dynamic_slides", {}).items():
        items = _items_from_spec(spec, slide_id, is_dynamic=True)
        if items is None:
            items_ids = spec.get("items_ids") or []
            items = resolve_items_ids(items_ids, all_charts_json, by_visual_id, by_module) if all_charts_json else []
        if not items:
            continue
        section = (spec.get("section") or (items[0][1].get("section") if items else "") or "").strip()
        if allowed and section.lower() not in allowed:
            continue
        slide_list.append({
            "slide_id": slide_id,
            "type": "dynamic",
            "items_ids": [t[0] for t in items],
            "items": items,
            "section": section,
            "data": {},
            "insight": "",
            "dynamic_key": None,
            "template_slide_title": spec.get("template_slide_title") or section,
        })

    return slide_list


def get_item_numbers_from_slide_list(slide_list: list) -> set:
    """Return set of all item numbers (as str) that appear in the slide list."""
    out = set()
    for s in slide_list:
        for item_number, _ in s.get("items", []):
            out.add(str(item_number))
    return out


def _has_populated_data(data: dict) -> bool:
    """Return True if at least one value in data is a non-empty DataFrame."""
    import pandas as pd
    for val in data.values():
        if isinstance(val, pd.DataFrame):
            if not val.empty:
                return True
        elif val is not None:
            return True
    return False


def _get_section_data_by_visual_id(section_map: dict, vid: str):
    """Get data for visual_id from section_map. Handles both flat {vid: data} and nested {comp_key: {vid: data}}."""
    if not section_map or not isinstance(section_map, dict):
        return None
    val = section_map.get(vid)
    if val is not None:
        return val
    # Nested by comparator: section_map is {comp_key: {vid: data}}
    first_val = next(iter(section_map.values()), None)
    if isinstance(first_val, dict):
        return first_val.get(vid)
    return None


def attach_data_to_fixed_slide(slide_info: dict, data_map: dict, brand_analyzer_dfs: dict) -> None:
    """Fill slide_info['data'] for a fixed slide from data_map and brand_analyzer_dfs."""
    data = {}
    for _item_number, item in slide_info.get("items", []):
        vid = item.get("visual_id")
        mod = (item.get("module") or "").strip().lower()
        if not vid:
            continue
        if mod == "brand_analyzer":
            df = brand_analyzer_dfs.get(vid)
            if df is not None:
                data[vid] = df
        else:
            section_map = data_map.get(mod, {})
            val = _get_section_data_by_visual_id(section_map, vid)
            if val is not None:
                data[vid] = val
    slide_info["data"] = data


def complete_slide_list(slide_list: list, data_map: dict, brand_analyzer_dfs: dict) -> list:
    """
    Fill 'data' for fixed slides and expand dynamic slides into one slide per instance.
    Returns a new list: fixed slides (with data) + expanded dynamic slides (each with data and dynamic_key).
    """
    out = []
    for s in slide_list:
        slide_info = dict(s)
        if slide_info.get("type") == "fixed":
            attach_data_to_fixed_slide(slide_info, data_map, brand_analyzer_dfs)
            if not _has_populated_data(slide_info.get("data", {})):  # skip slides with no meaningful data
                continue
            out.append(slide_info)
            continue
        if slide_info.get("type") != "dynamic":
            out.append(slide_info)
            continue
        # Expand dynamic by module
        items = slide_info.get("items", [])
        if not items:
            out.append(slide_info)
            continue
        mod = (items[0][1].get("module") or "").strip().lower()
        if mod == "brand_cards":
            cards = data_map.get("brand_cards", {})
            for key, payload in cards.items():
                copy = dict(slide_info)
                copy["slide_id"] = key
                copy["data"] = payload
                copy["dynamic_key"] = key
                out.append(copy)
        elif mod == "cross-tabs":
            ct = data_map.get("cross-tabs", {})
            for key, payload in ct.items():
                copy = dict(slide_info)
                copy["slide_id"] = key
                copy["data"] = payload
                copy["dynamic_key"] = key
                out.append(copy)
        elif mod == "habits-opinions":
            ho = data_map.get("habits-opinions", {})
            for key, payload in ho.items():
                copy = dict(slide_info)
                copy["slide_id"] = key
                copy["data"] = payload
                copy["dynamic_key"] = key
                out.append(copy)
        elif mod == "brand_analyzer":
            for _item_number, item in items:
                vid = item.get("visual_id")
                if not vid:
                    continue
                df = brand_analyzer_dfs.get(vid)
                if df is None:
                    continue
                copy = dict(slide_info)
                copy["slide_id"] = f"{slide_info['slide_id']}_{vid}"
                copy["data"] = {vid: df}
                copy["dynamic_key"] = vid
                out.append(copy)
        else:
            attach_data_to_fixed_slide(slide_info, data_map, brand_analyzer_dfs)
            out.append(slide_info)
    return out


def load_all_charts_json() -> dict:
    """
    Load chart configuration from config/slides_content.json only.
    Expects unified format: slides/dynamic_slides with items (or module on dynamic spec).
    Validates required fields (section, module, visual_id) on the flattened config.
    """
    config = _get_unified_config()
    if not config:
        raise FileNotFoundError(
            "config/slides_content.json not found. Chart configuration is read only from this file."
        )
    if not _is_new_slides_format(config):
        raise ValueError(
            "config/slides_content.json must use the unified format: "
            "slides with 'items' (object keyed by visual_id) and/or dynamic_slides with 'module' (or 'items')."
        )
    flattened = _flatten_unified_config_to_all_charts(config)
    errors = validate_config(flattened, "slides_content.json (items)")
    if errors:
        error_msg = "Configuration validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
        raise ValueError(error_msg)
    return flattened


def load_app_config(survey_names=None) -> AppConfig:
    if survey_names is None:
        survey_names = get_resource_path("project_inputs.json")

    api_key = require_openai_api_key()
    return AppConfig(
        inputs=finalize_project_inputs(load_json_config(survey_names)),
        all_charts_json=load_all_charts_json(),
        pptx_template_path=get_pptx_template_path("template.pptx"),
        client=OpenAI(api_key=api_key),
        model=DEFAULT_OPENAI_MODEL,
        openai_api_key=api_key
    )


def load_table_themes():
    """Load table themes configuration from table_themes.json"""
    try:
        return load_json_config(get_resource_path("table_themes.json"))
    except FileNotFoundError:
        # Return empty themes if file doesn't exist (backward compatibility)
        return {"default_theme": "Theme1", "themes": {}}


def load_column_theme():
    """Load column theme (cell-level styles) from column_theme.json for table styling."""
    try:
        return load_json_config(get_resource_path("table_cell_themes.json"))
    except FileNotFoundError:
        return {"default_theme": "value_light", "themes": {}}


def load_textbox_themes():
    """Load textbox themes configuration from textbox_themes.json"""
    try:
        return load_json_config(get_resource_path("textbox_themes.json"))
    except FileNotFoundError:
        # Return empty themes if file doesn't exist (backward compatibility)
        return {"default_theme": "Theme1", "themes": {}}

import logging


def setup_logging(level=None):
    if level is None:
        env_level = os.environ.get("LOG_LEVEL", "INFO").upper()
        level = getattr(logging, env_level, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )
