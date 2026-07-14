import sys
import os
import json
import logging
from pathlib import Path

# Add parent to path to allow absolute imports
sys.path.append(str(Path(__file__).parents[3]))

from backend.analytics_module.src.ai.prompt_registry import registry
from backend.analytics_module.src.ai.guardrails import GuardrailEnforcer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("CI_PromptValidator")

def run_validation():
    """CI Entry point: Validates all templates in the registry."""
    logger.info("🚀 Starting Prompt Guardrail Validation (CI Mode)...")
    
    # 1. Load Golden Hash
    meta_path = Path(__file__).parents[3] / "resources/analytics/prompts/god_prompt_meta.json"
    if not meta_path.exists():
        logger.error("❌ Mising god_prompt_meta.json. Validation aborted.")
        sys.exit(1)
        
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
        golden_hash = meta.get("sha256")
        
    enforcer = GuardrailEnforcer(golden_hash=golden_hash)
    god_prompt = registry.get_god_prompt()
    
    # 2. Iterate over all templates
    all_violations = []
    
    # We validate the RAW templates to detect 'Static-First' violations
    for key, template in registry.get_all_templates().items():
        logger.info(f"Checking template: {key}")
        
        # Build a 'Mock' rendered message list using the raw template content
        # This allows us to check for placeholders in the 'Head'
        mock_messages = [
            {"role": "system", "content": god_prompt},
            {"role": "user", "content": template.get("user_base", "")}
        ]
        
        violations = enforcer.validate(mock_messages)
        if violations:
            logger.error(f"❌ Template '{key}' failed validation:")
            for v in violations:
                logger.error(f"   - {v}")
                all_violations.append(f"{key}: {v}")
        else:
            logger.info(f"✅ Template '{key}' is compliant.")

    # 3. Final Result
    if all_violations:
        logger.error(f"🛑 FAILED: {len(all_violations)} guardrail violations found.")
        sys.exit(1)
    else:
        logger.info("✨ SUCCESS: All prompts are optimized and compliant.")
        sys.exit(0)

if __name__ == "__main__":
    run_validation()
