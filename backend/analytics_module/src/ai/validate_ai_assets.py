import sys
import os
from pathlib import Path
import pandas as pd
import logging

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parents[4]
sys.path.append(str(BASE_DIR))

from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.prompt_registry import registry
from backend.analytics_module.src.ai.guardrails import GuardrailEnforcer

# Setup minimal logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

def validate_assets():
    """
    Main entry point for CI/CD prompt validation.
    """
    logger.info("🚀 Starting AI Asset Governance Check...")
    
    # 1. Identify all templates (excluding meta/configs)
    template_keys = [k for k in registry.registry.keys() if not k.endswith("_meta")]
    if not template_keys:
        logger.warning("No templates found in registry. Check resource paths.")
        return 0

    # 2. Setup robust mock data for orchestration
    mock_df = pd.DataFrame({
        "Attribute": ["Value A", "Value B"],
        "Score": [85, 92]
    })
    
    # 3. Perform validation for each template
    total_violations = 0
    enforcer = PromptOrchestrator._get_enforcer()
    
    # Universal mock variables to satisfy most templates
    mock_variables = {
        "slide_id": "test_slide",
        "brand_name": "Test Brand",
        "brand": "Test Brand",
        "question": "Test Question",
        "question_text": "How do you rate the taste?",
        "question_type": "Likes/Dislikes",
        "research_type": "Market Research",
        "archetype": "General Consumer",
        "section": "Brand Performance",
        "chart_title": "Market Share Breakdown",
        "chart_type": "Stacked Bar",
        "brands": "Brand A, Brand B, Brand C",
        "base_n": "500",
        "total_responses": "200",
        "responses_summary": "- It tastes great\n- Too expensive",
        "insights_summary": "Brand A is leading; Brand B has a quality gap.",
        "context": "Annual Brand Tracker - Egypt 2024",
        "num_brands": "3",
        "brand_analyses_json": "{}"
    }
    
    for key in template_keys:
        logger.info(f"Checking template: {key}...")
        try:
            # Orchestrate messages (dry run)
            messages = PromptOrchestrator.construct_messages(
                template_key=key,
                data=mock_df,
                model="gpt-4o-mini",
                variables=mock_variables
            )
            
            # Run Guardrails
            violations = enforcer.validate(messages)
            if violations:
                total_violations += len(violations)
                for v in violations:
                    logger.error(f"  ❌ [{key}] {v}")
            else:
                logger.info(f"  ✅ [{key}] Passed.")
                
        except Exception as e:
            logger.error(f"  💥 [{key}] Construction failed: {e}")
            total_violations += 1

    # 4. Final Verdict
    if total_violations > 0:
        logger.error(f"FAILED: {total_violations} guardrail violations found.")
        return 1
    
    logger.info("SUCCESS: All AI assets comply with hardened caching guardrails.")
    return 0

if __name__ == "__main__":
    sys.exit(validate_assets())
