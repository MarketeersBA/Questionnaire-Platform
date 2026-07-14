import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)

# Suite-wide version for analytics prompt cache invalidation (Phase 7).
ANALYTICS_PROMPT_SUITE_VERSION = "2.0.0"
DEFAULT_PREFIX_VERSION = "2.0.0"

# Component templates that participate in ai_insight_cache versioning.
CACHE_VERSIONED_PROMPT_KEYS = frozenset({
    "chart_insights",
    "executive_summary",
    "recommendations",
    "opportunity_summary",
    "verbatim_analysis",
    "slide_insights",
    "market_position",
})

class PromptRegistry:
    """
    Advanced centralized registry for AI prompts.
    Handles dynamic loading, versioning, and variable validation.
    """
    
    def __init__(self, prompts_dir: Path):
        self.prompts_dir = prompts_dir
        self.registry: Dict[str, Dict[str, Any]] = {}
        self._god_prompt: Optional[str] = None
        self._god_prompt_version: str = "0.0.0"
        self.load_all()
        self.load_god_prompt()

    def load_all(self) -> None:
        """Scan directory and load all valid JSON prompt files."""
        if not self.prompts_dir.exists():
            logger.warning(f"Prompts directory {self.prompts_dir} not found.")
            return

        for file_path in self.prompts_dir.glob("*.json"):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    key = file_path.stem
                    self.registry[key] = data
                    logger.debug(f"Loaded prompt component: {key} (v{data.get('version', 'unknown')})")
            except Exception as e:
                logger.error(f"Failed to load prompt file {file_path}: {e}")

    def load_god_prompt(self) -> None:
        """Load the universal immutable system prefix from disk."""
        md_path = self.prompts_dir / "god_prompt.md"
        meta_path = self.prompts_dir / "god_prompt_meta.json"

        try:
            if md_path.exists():
                with open(md_path, "r", encoding="utf-8") as f:
                    self._god_prompt = f.read().strip()
            
            if meta_path.exists():
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    self._god_prompt_version = (
                        meta.get("prefix_version")
                        or meta.get("version", DEFAULT_PREFIX_VERSION)
                    )
            
            logger.info(f"God Prompt Loaded (v{self._god_prompt_version})")
        except Exception as e:
            logger.error(f"Failed to load God Prompt: {e}")
            self._god_prompt = "You are a Senior Strategic Analytics Director."
            self._god_prompt_version = "0.0.1-fallback"

    _FALLBACKS = {
        "slide_insights": {
            "system": "You are a market research expert.",
            "user_base": "Analyze this survey data for slide {slide_id}:\n{summary}",
            "brand_focus": "\nProvide specific advice for {brand_name}.",
            "competitor_focus": "\nHow does {brand_name} compare to these competitors?"
        },
        "recommendations": {
            "system": "You are a strategic business consultant.",
            "user_base": "Based on these survey findings, provide 4P strategic advice (Product, Price, Place, Promotion):\n{insights_text}",
            "user_extra": "\nUse the provided data metrics to quantify your advice."
        },
        "verbatim_analysis": {
            "system": "You are a thematic analyst.",
            "user_base": "Identify key themes and sentiment in these open-end responses:\n{responses_text}"
        },
        "executive_summary": {
            "system": "You are a senior reporter.",
            "user_base": "Summarize the key findings of this survey report:\n{report_summary}"
        },
        "market_position": {
            "system": "You are a Senior Strategic Consultant.",
            "user_base": "Analyze market position for {brand_name}. Data: Momentum={mou_sigma}, Performance={performance_sigma}, Affinities={affinity_summary}."
        }
    }

    def get_template(self, key: str) -> Dict[str, Any]:
        """Retrieve raw prompt data for a key. Returns hardcoded fallback if missing."""
        if key not in self.registry:
            if key in self._FALLBACKS:
                logger.error(f"CRITICAL: Prompt key '{key}' not found in registry. Using hardcoded minimal fallback.")
                return self._FALLBACKS[key]
            logger.warning(f"Prompt key '{key}' not found in registry or fallbacks.")
            return {}
        return self.registry[key]

    @staticmethod
    def _safe_format(template: str, variables: Dict[str, Any]) -> str:
        """
        Formats a string with variables, while ignoring single braces that don't match variables.
        This is a robust replacement for .format(**variables).
        """
        if not template: return ""
        
        # Simple implementation: use .replace on known variables first, 
        # but that's risky. Better to use a regex or string.Template.
        # However, for simplicity and speed, we do a multi-pass approach:
        res = template
        for k, v in variables.items():
            placeholder = "{" + str(k) + "}"
            res = res.replace(placeholder, str(v))
        return res

    def format_prompt(self, key: str, variables: Dict[str, Any], variant: str = "user_base") -> str:
        """
        Retrieves a user template variant and formats it with variables.
        Performs validation to ensure all required variables are present.
        """
        template = self.get_template(key)
        user_base = template.get(variant) or template.get("user_base", "")
        
        # Validation
        validation = template.get("validation", {})
        required = validation.get("required_vars", [])
        
        missing = [v for v in required if v not in variables]
        if missing:
            logger.warning(f"Prompt '{key}' is missing required variables: {missing}")
            
        try:
            return self._safe_format(user_base, variables)
        except Exception as e:
            logger.error(f"Unexpected error formatting prompt '{key}': {e}")
            return user_base

    def format_custom_template(self, template: str, variables: Dict[str, Any]) -> str:
        """Centralized safe formatter for ad-hoc templates."""
        return self._safe_format(template, variables)

    def get_system_prompt(self, key: str, default: str = "You are a helpful assistant.") -> str:
        """Retrieve the system prompt for a specific component."""
        return self.get_template(key).get("system", default)

    def get_god_prompt(self) -> str:
        """Retrieve the centralized immutable system prefix."""
        if not self._god_prompt:
            self.load_god_prompt()
        return self._god_prompt or "You are a Senior Strategic Analytics Director."

    def get_template_version(self, key: str) -> str:
        """Resolved prompt template version for cache keys."""
        return self.get_template(key).get("version", ANALYTICS_PROMPT_SUITE_VERSION)

    def get_prefix_version(self) -> str:
        """Get current God Prompt version for cache key tracking."""
        return self._god_prompt_version

    def reload(self) -> None:
        """Clear cache and reload from disk."""
        self.registry.clear()
        self.load_all()
        self.load_god_prompt()

# Global Instance
_PROMPTS_BASE_PATH = Path(__file__).parent.parent.parent.parent / "resources" / "analytics" / "prompts"
registry = PromptRegistry(_PROMPTS_BASE_PATH)
