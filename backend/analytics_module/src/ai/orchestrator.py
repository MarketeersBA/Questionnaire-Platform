import logging
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from .prompt_registry import registry
from .personas import PersonaManager
from .token_budget import get_budgeter, TokenBudget
from .compaction import compact_data
from .prefix_hasher import PrefixHasher
from .guardrails import GuardrailEnforcer
import os
import json
from pathlib import Path

if TYPE_CHECKING:
    from backend.models import SurveyContextBlock

logger = logging.getLogger(__name__)

_EMBEDDED_INTELLIGENCE_TEMPLATES = frozenset({
    "chart_insights",
    "executive_summary",
    "recommendations",
    "verbatim_analysis",
})


class PromptOrchestrator:
    """
    The Central Brain of the AI Pipeline.
    Coordinates all Phase 1 & 2 optimizations into a single construction flow.
    """
    _hasher: Optional[PrefixHasher] = None
    _enforcer: Optional[GuardrailEnforcer] = None
    _prefix_version: str = "2.0.0"

    @classmethod
    def _get_hasher(cls) -> PrefixHasher:
        """Lazily initializes the hasher with the golden metadata at startup."""
        if cls._hasher is not None:
            return cls._hasher
            
        meta_path = Path(__file__).parents[3] / "resources/analytics/prompts/god_prompt_meta.json"
        expected = None
        if meta_path.exists():
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    expected = meta.get("sha256")
                    cls._prefix_version = meta.get("version", "2.0.0")
            except Exception:
                logger.error("Failed to load God Prompt metadata.")
                
        cls._hasher = PrefixHasher(expected_hash=expected)
        cls._enforcer = GuardrailEnforcer(golden_hash=expected or "")
        return cls._hasher

    @classmethod
    def _get_enforcer(cls) -> GuardrailEnforcer:
        if cls._enforcer is None:
            cls._get_hasher()
        return cls._enforcer

    @classmethod
    def get_prefix_version(cls) -> str:
        if cls._hasher is None:
            cls._get_hasher()
        return cls._prefix_version

    @classmethod
    def _merge_survey_meta_variables(
        cls,
        variables: Dict[str, Any],
        survey_meta: Optional["SurveyContextBlock"],
    ) -> Dict[str, Any]:
        """Inject SurveyContextBlock prompt variables without overwriting explicit chart vars."""
        if survey_meta is None:
            return dict(variables)

        merged = dict(variables)
        for key, value in survey_meta.to_prompt_variables().items():
            merged.setdefault(key, value)
        if survey_meta.target_brand and not merged.get("brand_name"):
            merged["brand_name"] = survey_meta.target_brand
        return merged

    @classmethod
    def _apply_survey_var_defaults(cls, variables: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure survey-intelligence placeholders resolve when context is partial."""
        defaults = {
            "target_brand": variables.get("target_brand")
            or variables.get("brand_name")
            or variables.get("brand")
            or "Not specified",
            "category": "Not specified",
            "survey_objective": "Not specified",
            "testing_protocol": "unspecified",
            "market": "Not specified",
            "methodology_notes": "Not specified",
        }
        merged = {**defaults, **variables}
        return merged

    @classmethod
    def _build_survey_context_block(
        cls,
        *,
        survey_meta: Optional["SurveyContextBlock"],
        variables: Dict[str, Any],
        research_type: str,
        persona_directive: Optional[str],
        template_key: str = "",
    ) -> str:
        """
        Footer context appended after the formatted user template.

        chart_insights v2 embeds survey intelligence inside user_base; other
        templates still receive the full intelligence block in the footer.
        """
        intelligence_block = ""
        if survey_meta is not None and template_key not in _EMBEDDED_INTELLIGENCE_TEMPLATES:
            intelligence_block = (
                "\n--- SURVEY INTELLIGENCE ---\n"
                f"- Client Brand (Target): {survey_meta.target_brand or 'N/A'}\n"
                f"- Product Category: {survey_meta.category or 'Not specified'}\n"
                f"- Survey Objective: {survey_meta.survey_objective or 'Not specified'}\n"
                f"- Testing Protocol: {survey_meta.testing_protocol.upper()}\n"
                f"- Market: {survey_meta.market or 'Not specified'}\n"
                f"- Methodology: {survey_meta.methodology_notes}\n"
            )

        brand_scope = (
            variables.get("brand_name")
            or variables.get("target_brand")
            or variables.get("brand")
            or (survey_meta.target_brand if survey_meta else None)
            or "N/A"
        )

        return (
            f"{intelligence_block}\n"
            "--- ANALYTICAL CONTEXT ---\n"
            f"- Brand Scope: {brand_scope}\n"
            f"- Study Logic: {research_type.upper()}\n"
            f"- Analyst Persona: {persona_directive or 'Senior Specialist'}\n"
        )

    @classmethod
    def construct_messages(cls,
                          template_key: str,
                          data: Any,
                          model: str,
                          research_type: str = "general",
                          archetype: Optional[str] = None,
                          variables: Optional[Dict[str, Any]] = None,
                          user_extra: Optional[str] = None,
                          output_budget: int = 0,
                          survey_meta: Optional["SurveyContextBlock"] = None,
                          user_template_field: str = "user_base") -> List[Dict[str, str]]:
        """
        Main Orchestration Flow:
        1. Instantiate Budgeter
        2. Calculate Adaptive Output Budget (if requested)
        3. Retrieve God Prompt & Templates
        4. Allocate Data Budget
        5. Compact Data (Semantic Signal Extraction)
        6. Assemble Deterministic Message List
        """
        if output_budget <= 0:
            output_budget = cls._get_adaptive_output_budget(template_key, data)
            
        budgeter = get_budgeter(model)
        variables = cls._merge_survey_meta_variables(variables or {}, survey_meta)
        variables = cls._apply_survey_var_defaults(variables)
        
        # 1. RETRIEVE IMMUTABLE FOUNDATION
        god_prompt = registry.get_god_prompt()
        template = registry.get_template(template_key)
        user_template = template.get(user_template_field) or template.get("user_base", "")
        
        # 1a. INTEGRITY VALIDATION (Task 3.1 — Golden Prefix Hashing)
        cls._get_hasher().verify_or_warn(god_prompt)
        
        # 2. PERSONA MANAGEMENT (Injected into User Role for Cache Stability)
        persona_manager = PersonaManager(research_type, archetype=archetype)
        persona_directive = persona_manager.get_user_directive()
        
        # 3. BUDGET ALLOCATION
        # We calculate how much room is left for dynamic data after God Prompt + Persona + Base Instructions
        static_instructions = user_template
        data_token_budget = budgeter.allocate_data_budget(
            system_text=god_prompt,
            static_instructions=static_instructions + (persona_directive or ""),
            output_budget=output_budget
        )
        
        # 4. SEMANTIC COMPACTION
        char_budget = budgeter.tokens_to_chars(data_token_budget)
        compact_summary = compact_data(data, char_budget)
        
        # 5. ASSEMBLY (STRICT ORDERING)
        # Position 0: The God Prompt (Global Cache)
        # Position 1: The User Context (Deterministic ordering)
        
        # Merge summary into variables
        final_vars = {
            **variables, 
            "summary": compact_summary, 
            "data_summary": compact_summary, # Compatibility mapping
            "insights_summary": compact_summary, # Compatibility mapping for executive summary
            "research_type": research_type,
            "archetype": archetype or "Senior Analyst"
        }
        
        try:
            user_content = registry.format_custom_template(user_template, final_vars)
        except Exception as e:
            logger.error(f"Missing variable in template {template_key}: {e}")
            user_content = user_template or "Error in prompt construction."

        # 5. ASSEMBLY (DIVERGENCE DELAY: Task 4.3)
        # Move all tenant/instance specific variables to the BOTTOM.
        context_block = cls._build_survey_context_block(
            survey_meta=survey_meta,
            variables=variables,
            research_type=research_type,
            persona_directive=persona_directive,
            template_key=template_key,
        )
        full_user_content = f"{user_content}\n\n{context_block}"
        if user_extra:
            full_user_content += f"\n\n--- ADDITIONAL REQUIREMENTS ---\n{user_extra}"
        
        messages = [
            {"role": "system", "content": god_prompt},
            {"role": "user", "content": full_user_content}
        ]
        
        # 6. GUARDRAIL VALIDATION (Task 4.1)
        cls._get_enforcer().enforce_runtime(messages)
        
        # Validate final token count
        if not budgeter.validate_request(messages[0]["content"], messages[1]["content"], output_budget):
            logger.warning(f"Orchestrator: Request for {template_key} might exceed context window.")

        return messages
    @staticmethod
    def _calculate_complexity(data: Any) -> int:
        """
        Estimates Data Complexity for adaptive scaling.
        Formula: Rows * Columns (or Items * Depth)
        """
        import pandas as pd
        if isinstance(data, pd.DataFrame):
            return data.shape[0] * data.shape[1]
        if isinstance(data, dict):
            # Sum of sub-complexities
            total = 0
            for v in data.values():
                if isinstance(v, pd.DataFrame):
                    total += v.shape[0] * v.shape[1]
                elif isinstance(v, list):
                    total += len(v)
                else:
                    total += 1
            return total
        if isinstance(data, list):
            return len(data)
        return 5 # Minimal baseline

    @classmethod
    def _get_adaptive_output_budget(cls, template_key: str, data: Any) -> int:
        """
        Computes dynamic max_tokens based on workload density.
        Ensures complex multi-brand charts don't get truncated.
        """
        BASE_BUDGETS = {
            "insights": 120,
            "chart_insights": 600,
            "verbatim_analysis": 800,
            "verbatim_synthesis": 300,
            "executive_summary": 800,
            "executive_hero": 250
        }
        
        base = BASE_BUDGETS.get(template_key, 500)
        complexity = cls._calculate_complexity(data)
        
        # Scaling Curve: Scale up for data-rich payloads
        # e.g., if 20 brands x 10 attributes = 200 complexity
        # Scale = min(1.0 + (200 / 100) * 0.5, 2.0) = 2.0x base
        scale = min(1.0 + (complexity / 100.0) * 0.5, 2.0)
        
        final_budget = int(base * scale)
        logger.info(f"Adaptive Budget for {template_key}: {final_budget} (Base: {base}, Complexity: {complexity})")
        return final_budget
