"""
Design configuration module.

ThemeManager encapsulates all theme state (chart, table, textbox configs and active themes).
A module-level default instance (_default) is used by backward-compatible module-level
functions so existing callers (charts.py, tables.py, formatter.py, textboxes.py) continue
to work without signature changes.

For testing or parallel runs, create a separate ThemeManager instance.
"""
import json
from typing import Dict, Any, Tuple, Optional, Union, List
from copy import deepcopy
from pathlib import Path
from pptx.dml.color import RGBColor


def _get_config_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent / "resources" / "analytics"


class ThemeManager:
    """Encapsulates theme configuration state for chart, table, and textbox styling."""

    def __init__(self, config_dir: Optional[Path] = None):
        self._config_dir = config_dir or _get_config_dir()
        self._chart_config: Optional[Dict[str, Any]] = None
        self._table_config: Optional[Dict[str, Any]] = None
        self._table_column_config: Optional[Dict[str, Any]] = None
        self._textbox_config: Optional[Dict[str, Any]] = None
        self._chart_theme: Optional[str] = None
        self._table_theme: Optional[str] = None
        self._textbox_theme: Optional[str] = None
        self._color_palette: Optional[Dict[str, Tuple[int, int, int]]] = None

    def _load_color_palette(self) -> Dict[str, Tuple[int, int, int]]:
        if self._color_palette is not None:
            return self._color_palette
        colors_path = self._config_dir / "colors.json"
        try:
            with open(colors_path, "r", encoding="utf-8") as f:
                colors_config = json.load(f)
        except FileNotFoundError:
            self._color_palette = {}
            return self._color_palette
        palette = {}
        for name, rgb in colors_config.get("css_colors", {}).items():
            if isinstance(rgb, list) and len(rgb) >= 3:
                palette[name.lower()] = tuple(rgb[:3])
        for name, rgb in colors_config.get("custom_colors", {}).items():
            if isinstance(rgb, list) and len(rgb) >= 3:
                palette[name.lower()] = tuple(rgb[:3])
        self._color_palette = palette
        return self._color_palette

    def ensure_configs_loaded(self) -> None:
        if self._chart_config is not None:
            return
        def _read(filename, fallback):
            try:
                with open(self._config_dir / filename, "r", encoding="utf-8") as fh:
                    return json.load(fh)
            except (FileNotFoundError, OSError):
                return fallback
        self._chart_config = _read("chart_themes.json", {"default_theme": "Theme1", "themes": {}})
        self._table_config = _read("table_themes.json", {"default_theme": "Theme1", "themes": {}})
        self._table_column_config = _read("table_cell_themes.json", {"default_theme": "value_light", "themes": {}})
        self._textbox_config = _read("textbox_themes.json", {"default_theme": "Theme1", "themes": {}})
        if self._chart_theme is None:
            self._chart_theme = self._chart_config.get("default_theme", "Theme1")
        if self._table_theme is None:
            self._table_theme = self._table_config.get("default_theme", "Theme1")
        if self._textbox_theme is None:
            self._textbox_theme = self._textbox_config.get("default_theme", "Theme1")

    # -- setters --
    def set_chart_theme(self, name: str): self._chart_theme = name
    def set_table_theme(self, name: str): self._table_theme = name
    def set_textbox_theme(self, name: str): self._textbox_theme = name
    def set_chart_config(self, cfg): self._chart_config = cfg
    def set_table_config(self, cfg): self._table_config = cfg
    def set_table_column_config(self, cfg): self._table_column_config = cfg
    def set_textbox_config(self, cfg): self._textbox_config = cfg
    def set_config(self, cfg): self.set_chart_config(cfg)
    def set_theme(self, name): self.set_chart_theme(name)

    # -- raw getters --
    def get_config(self): return self._chart_config
    def get_theme(self): return self._chart_theme
    def get_table_config(self): return self._table_config
    def get_table_column_config(self): return self._table_column_config
    def get_table_theme(self): return self._table_theme


_default = ThemeManager()


def _load_color_palette():
    return _default._load_color_palette()

def _ensure_configs_loaded():
    _default.ensure_configs_loaded()


def resolve_color(value: Union[str, List[int], Tuple[int, int, int]]) -> Tuple[int, int, int]:
    """Resolve a color value to an RGB tuple."""
    if isinstance(value, (list, tuple)):
        if len(value) >= 3:
            return (int(value[0]), int(value[1]), int(value[2]))
        raise ValueError(f"Invalid RGB color: {value} (expected 3 values)")
    if isinstance(value, str):
        palette = _load_color_palette()
        color_name = value.lower().strip()
        if color_name in palette:
            return palette[color_name]
        raise ValueError(
            f"Unknown color name: '{value}'. "
            f"Define it in config/colors.json or use an RGB array like [255, 0, 0]."
        )
    raise ValueError(f"Invalid color value type: {type(value)}. Expected string or RGB list/tuple.")


def set_chart_config(config): _default.set_chart_config(config)
def set_table_config(config): _default.set_table_config(config)
def set_table_column_config(config): _default.set_table_column_config(config)
def set_textbox_config(config): _default.set_textbox_config(config)
def set_config(config): _default.set_config(config)
def get_config(): return _default.get_config()
def get_table_config(): return _default.get_table_config()
def get_table_column_config(): return _default.get_table_column_config()
def get_table_theme(): return _default.get_table_theme()
def set_chart_theme(theme_name): _default.set_chart_theme(theme_name)
def set_table_theme(theme_name): _default.set_table_theme(theme_name)
def set_textbox_theme(theme_name): _default.set_textbox_theme(theme_name)
def set_theme(theme_name): _default.set_theme(theme_name)
def get_theme(): return _default.get_theme()


def _resolve_theme(theme_name: str, themes: Dict[str, Any], visited: Optional[set] = None) -> Dict[str, Any]:
    """Resolve a theme with inheritance support.
    
    Recursively resolves theme inheritance by merging parent theme properties
    with child theme properties (child overrides parent).
    
    Args:
        theme_name: Name of the theme to resolve
        themes: Dictionary of all available themes
        visited: Set of theme names already visited (to detect circular dependencies)
    
    Returns:
        Merged theme dictionary with all inherited properties (comment keys filtered out)
    """
    if visited is None:
        visited = set()
    
    if theme_name in visited:
        # Circular dependency detected - return empty dict to break cycle
        return {}
    
    if theme_name not in themes:
        # Theme not found - return empty dict
        return {}
    
    visited.add(theme_name)
    # Use deepcopy to ensure nested structures (like color arrays) are properly copied
    theme_config = deepcopy(themes[theme_name])
    
    # Filter out comment keys (keys starting with "comment")
    theme_config = {k: v for k, v in theme_config.items() if not k.startswith("comment")}
    
    # Check if this theme extends another theme
    if "extends" in theme_config:
        parent_theme_name = theme_config["extends"]
        # Remove "extends" from the copy before merging
        del theme_config["extends"]
        
        # Recursively resolve parent theme
        parent_config = _resolve_theme(parent_theme_name, themes, visited.copy())
        
        # Merge parent into child (child properties override parent)
        merged_config = deepcopy(parent_config)
        merged_config.update(theme_config)
        return merged_config
    
    return theme_config


def _get_from_config(key: str, config: Optional[Dict[str, Any]], theme: Optional[str], default: Any) -> Any:
    """Get a config value with fallbacks (used only for backward compatibility)."""
    if config is None:
        return default

    themes = config.get("themes", {})

    if theme and theme in themes:
        resolved_theme = _resolve_theme(theme, themes)
        if key in resolved_theme:
            return resolved_theme[key]

    default_theme = config.get("default_theme", "Theme1")
    if default_theme in themes:
        resolved_default_theme = _resolve_theme(default_theme, themes)
        if key in resolved_default_theme:
            return resolved_default_theme[key]

    if key in config:
        return config[key]

    return default


def _get_optional_from_config(
    key: str, config: Optional[Dict[str, Any]], theme: Optional[str]
) -> Any:
    """Get a config value only from the active theme. No default theme, no Python default.
    Returns None if config is None, theme is None, or key is not in the resolved theme.
    Missing/null in config → leave slide as-is.
    """
    if config is None or theme is None:
        return None
    themes = config.get("themes", {})
    if theme not in themes:
        return None
    resolved = _resolve_theme(theme, themes)
    return resolved.get(key)


def _get(key: str, default: Any) -> Any:
    _ensure_configs_loaded()
    d = _default
    if key.startswith("chart_"):
        return _get_from_config(key, d._chart_config, d._chart_theme, default)
    elif key.startswith("table_"):
        return _get_from_config(key, d._table_config, d._table_theme, default)
    elif key.startswith("textbox_"):
        theme_to_use = d._textbox_theme
        if d._textbox_config and theme_to_use is None:
            theme_to_use = d._textbox_config.get("default_theme", "Theme1")
            d._textbox_theme = theme_to_use
        return _get_from_config(key, d._textbox_config, theme_to_use, default)
    elif key.startswith("insight_textbox_"):
        if d._textbox_config:
            return _get_from_config(key, d._textbox_config, "Theme3", default)
        return default
    elif key.startswith("base_textbox_"):
        if d._textbox_config:
            return _get_from_config(key, d._textbox_config, "Theme2", default)
        return default
    else:
        return _get_from_config(key, d._chart_config, d._chart_theme, default)


def _get_optional(key: str) -> Optional[Any]:
    _ensure_configs_loaded()
    d = _default
    if key.startswith("chart_"):
        return _get_optional_from_config(key, d._chart_config, d._chart_theme)
    if key.startswith("table_"):
        return _get_optional_from_config(key, d._table_config, d._table_theme)
    if key.startswith("textbox_"):
        return _get_optional_from_config(key, d._textbox_config, d._textbox_theme)
    if key.startswith("insight_textbox_"):
        return _get_optional_from_config(key, d._textbox_config, "Theme3")
    if key.startswith("base_textbox_"):
        return _get_optional_from_config(key, d._textbox_config, "Theme2")
    return _get_optional_from_config(key, d._chart_config, d._chart_theme)


def _get_color(key: str, default: Tuple[int, int, int]) -> RGBColor:
    """Get a color from config as RGBColor (with default fallback)."""
    color_value = _get(key, default)
    try:
        color_tuple = resolve_color(color_value)
    except ValueError:
        color_tuple = default
    return RGBColor(*color_tuple)


def _get_optional_color(key: str) -> Optional[RGBColor]:
    """Get a color only from the active theme. Returns None if missing or invalid."""
    value = _get_optional(key)
    if value is None:
        return None
    try:
        color_tuple = resolve_color(value)
        return RGBColor(*color_tuple)
    except ValueError:
        return None


# Chart styling getters — Optional: None means leave slide/template as-is
def get_chart_font() -> Optional[str]:
    return _get_optional("chart_font")


def get_chart_title_size() -> Optional[int]:
    return _get_optional("chart_title_size")


def get_chart_title_color() -> Optional[RGBColor]:
    return _get_optional_color("chart_title_color")


def get_chart_title_bold() -> Optional[bool]:
    return _get_optional("chart_title_bold")


# Data label getters
def get_data_label_font_size() -> Optional[int]:
    return _get_optional("chart_data_label_font_size")


def get_data_label_color() -> Optional[RGBColor]:
    return _get_optional_color("chart_data_label_color")


def get_data_label_show_percentage() -> Optional[bool]:
    return _get_optional("chart_data_label_show_percentage")


def get_data_label_show_value() -> Optional[bool]:
    return _get_optional("chart_data_label_show_value")


def get_data_label_number_format() -> Optional[str]:
    return _get_optional("chart_data_label_number_format")


# Axis getters
def get_axis_title_font_size() -> Optional[int]:
    return _get_optional("chart_axis_title_font_size")


def get_axis_title_font_name() -> Optional[str]:
    return _get_optional("chart_axis_title_font_name")


def get_axis_title_color() -> Optional[RGBColor]:
    return _get_optional_color("chart_axis_title_color")


def get_axis_label_font_size() -> Optional[int]:
    return _get_optional("chart_axis_label_font_size")


def get_axis_label_font_name() -> Optional[str]:
    return _get_optional("chart_axis_label_font_name")


def get_axis_label_color() -> Optional[RGBColor]:
    return _get_optional_color("chart_axis_label_color")


# Legend getters
def get_legend_font_size() -> Optional[int]:
    return _get_optional("chart_legend_font_size")


def get_legend_font_name() -> Optional[str]:
    return _get_optional("chart_legend_font_name")


def get_legend_color() -> Optional[RGBColor]:
    return _get_optional_color("chart_legend_color")


def get_legend_position() -> Optional[str]:
    return _get_optional("chart_legend_position")


def get_legend_show() -> Optional[bool]:
    return _get_optional("chart_legend_show")


# Point label getters
def get_point_label_font_size() -> Optional[int]:
    return _get_optional("chart_point_label_font_size")


def get_point_label_font_name() -> Optional[str]:
    return _get_optional("chart_point_label_font_name")


def get_point_label_color() -> Optional[RGBColor]:
    return _get_optional_color("chart_point_label_color")


def get_color_palette(num_colors: Optional[int] = None) -> Optional[List[RGBColor]]:
    """
    Get the color palette from the active chart theme.
    
    Args:
        num_colors: Number of colors needed. If provided, looks for numbered palette
                   (e.g., "three_color_palette" for num_colors=3).
                   Falls back to "color_palette" if numbered palette not found.
                   If None, uses "color_palette" (backward compatibility).
    
    Returns:
        List of RGBColor objects, or None if not configured.
        Callers should leave series colors as-is (template) if None.
    """
    # If num_colors is specified, try to get the numbered palette first
    if num_colors is not None and num_colors > 0:
        # Map number to palette name (1 -> "one_color_palette", 2 -> "two_color_palette", etc.)
        number_names = {
            1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
            6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"
        }
        
        # Use the appropriate numbered palette, or cap at 10
        palette_num = min(num_colors, 10)
        palette_key = f"{number_names[palette_num]}_color_palette"
        
        color_palette = _get_optional(palette_key)
        if color_palette is None and _default._chart_config and _default._chart_theme is None:
            default_theme = _default._chart_config.get("default_theme", "Theme1")
            if default_theme in _default._chart_config.get("themes", {}):
                resolved = _resolve_theme(default_theme, _default._chart_config["themes"])
                color_palette = resolved.get(palette_key)
        
        # If numbered palette found, use it
        if color_palette is not None and isinstance(color_palette, list):
            rgb_colors: List[RGBColor] = []
            for color in color_palette:
                try:
                    color_tuple = resolve_color(color)
                    rgb_colors.append(RGBColor(*color_tuple))
                except ValueError:
                    continue
            if rgb_colors:
                return rgb_colors
    
    color_palette = _get_optional("color_palette")
    if color_palette is None and _default._chart_config and _default._chart_theme is None:
        default_theme = _default._chart_config.get("default_theme", "Theme1")
        if default_theme in _default._chart_config.get("themes", {}):
            resolved = _resolve_theme(default_theme, _default._chart_config["themes"])
            color_palette = resolved.get("color_palette")
    if color_palette is None or not isinstance(color_palette, list):
        return None

    rgb_colors: List[RGBColor] = []
    for color in color_palette:
        try:
            color_tuple = resolve_color(color)
            rgb_colors.append(RGBColor(*color_tuple))
        except ValueError:
            continue
    return rgb_colors if rgb_colors else None


# Table getters — Optional: None means leave slide/template as-is
def get_table_font() -> Optional[str]:
    return _get_optional("table_font")


def get_table_header_font_size() -> Optional[int]:
    return _get_optional("table_header_font_size")


def get_table_header_font_color() -> Optional[RGBColor]:
    return _get_optional_color("table_header_font_color")


def get_table_header_fill_color() -> Optional[RGBColor]:
    return _get_optional_color("table_header_fill_color")


def get_table_header_bold() -> Optional[bool]:
    return _get_optional("table_header_bold")


def get_table_header_align() -> Optional[str]:
    return _get_optional("table_header_align")


def get_table_index_font_size() -> Optional[int]:
    return _get_optional("table_index_font_size")


def get_table_index_font_color() -> Optional[RGBColor]:
    return _get_optional_color("table_index_font_color")


def get_table_index_fill_color() -> Optional[RGBColor]:
    return _get_optional_color("table_index_fill_color")


def get_table_index_bold() -> Optional[bool]:
    return _get_optional("table_index_bold")


def get_table_index_align() -> Optional[str]:
    return _get_optional("table_index_align")


def get_table_value_font_size() -> Optional[int]:
    return _get_optional("table_value_font_size")


def get_table_value_font_color() -> Optional[RGBColor]:
    return _get_optional_color("table_value_font_color")


def get_table_value_fill_color() -> Optional[RGBColor]:
    return _get_optional_color("table_value_fill_color")


def get_table_value_align() -> Optional[str]:
    return _get_optional("table_value_align")


# Textbox getters — Optional: None means leave slide/template as-is
def get_textbox_font() -> Optional[str]:
    return _get_optional("textbox_font")


def get_textbox_font_size() -> Optional[int]:
    return _get_optional("textbox_font_size")


def get_textbox_font_color() -> Optional[RGBColor]:
    return _get_optional_color("textbox_font_color")


def get_textbox_bold() -> Optional[bool]:
    return _get_optional("textbox_bold")


# Insight textbox getters (Theme3 in textbox_themes.json)
def get_insight_textbox_font() -> Optional[str]:
    return _get_optional("insight_textbox_font")


def get_insight_textbox_font_size() -> Optional[int]:
    return _get_optional("insight_textbox_font_size")


def get_insight_textbox_font_color() -> Optional[RGBColor]:
    return _get_optional_color("insight_textbox_font_color")


def get_insight_textbox_bold() -> Optional[bool]:
    return _get_optional("insight_textbox_bold")


# Base textbox getters (Theme2 in textbox_themes.json)
def get_base_textbox_font() -> Optional[str]:
    return _get_optional("base_textbox_font")


def get_base_textbox_font_size() -> Optional[int]:
    return _get_optional("base_textbox_font_size")


def get_base_textbox_font_color() -> Optional[RGBColor]:
    return _get_optional_color("base_textbox_font_color")


def get_base_textbox_bold() -> Optional[bool]:
    return _get_optional("base_textbox_bold")



