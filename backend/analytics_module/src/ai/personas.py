"""
Persona Orchestrator for Advanced AI Insights.
Defines role-based system prompts for different research types.
"""
from __future__ import annotations

import logging
from enum import Enum
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class AIPersona(Enum):
    BRAND_STRATEGIST = "brand_strategist"
    PRODUCT_RESEARCHER = "product_researcher"
    MARKET_ANALYST = "market_analyst"
    CONSUMER_INSIGHT_MANAGER = "consumer_insight_manager"

_PERSONA_PROMPTS = {
    AIPersona.BRAND_STRATEGIST: (
        "You are a Brand Strategist. Focus on conversion, purchase funnels, "
        "brand equity, and growth trajectory. Use terms like 'conversion metrics', "
        "'customer journey', and 'market positioning'."
    ),
    AIPersona.PRODUCT_RESEARCHER: (
        "You are a Senior Product Researcher. Focus on sensory attributes (taste, "
        "texture, appearance), preference drivers, and optimization potential. "
        "Use terms like 'highly significant difference', 'preference driver', "
        "and 'benchmark variance'."
    ),
    AIPersona.MARKET_ANALYST: (
        "You are a Market Data Analyst. Focus on statistical significance, volume "
        "shares, and demographic trends. Use terms like 'statistically significant', "
        "'over-indexing', and 'sample representation'."
    ),
}

class PersonaManager:
    """Manages the switching of AI voices based on research context and brand archetype."""
    def __init__(self, research_type: str, archetype: Optional[str] = None):
        self.research_type = research_type
        self.archetype = archetype

    def get_active_persona(self) -> AIPersona:
        if self.research_type == "BA/PF":
            return AIPersona.BRAND_STRATEGIST
        if self.research_type in ["TasteTest", "ProductPlacement"]:
            return AIPersona.PRODUCT_RESEARCHER
        return AIPersona.MARKET_ANALYST

    def get_system_prompt(self, base_prompt: str) -> str:
        """FROZEN: Returns base_prompt unchanged to preserve KV cache prefix stability.
        
        Rationale: The system message occupies token positions [0, S) in the sequence.
        Any mutation here creates a separate KV cache branch on the provider side.
        Persona/archetype directives are now delivered via get_user_directive() instead.
        """
        return base_prompt

    def get_user_directive(self) -> str:
        """Returns persona/archetype context as a structured user-prompt block.
        
        This replaces the old pattern of prepending to the system message.
        Placing it in the user role preserves the immutable system prefix while
        still injecting role-appropriate analytical framing.
        """
        persona = self.get_active_persona()
        persona_directive = _PERSONA_PROMPTS.get(persona, "")

        parts = []
        if persona_directive:
            parts.append(persona_directive)
        if self.archetype:
            parts.append(
                f"BRAND ARCHETYPE: {self.archetype}. "
                "Adapt your tone accordingly (e.g., Challenger = aggressive, Leader = defensive-growth)."
            )
        
        if not parts:
            return ""
        return "[ANALYTICAL ROLE]\n" + "\n".join(parts)
