import hashlib
import re
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

class GuardrailEnforcer:
    """
    Automated Governance for LLM Pipeline.
    Enforces the 'Golden State' requirements for caching and deterministic performance.
    """
    # 1000 tokens ≈ 4000 characters is the target for high-density caching
    MIN_SYSTEM_CHARS = 4000 
    
    # Placeholders that represent dynamic (vibrating) tokens
    BANNED_LEADING_PATTERNS = [
        r"\{slide_id\}", r"\{chart_id\}", r"\{chart_title\}",
        r"\{brand_name\}", r"\{data_summary\}", r"\{summary\}",
        r"\{question\}", r"\{brand\}", r"\{research_type\}",
        r"\{question_text\}", r"\{responses_summary\}",
        # Task 4.3: Concrete headers that shouldn't be at the top
        r"ANALYTICAL CONTEXT", r"Research Dimension", r"Target Scope"
    ]
    
    # The 'Safe Zone' for static prefixing (First 500 chars should be static instructions)
    LEADING_CHECK_CHARS = 500 

    def __init__(self, golden_hash: str):
        self._golden_hash = golden_hash

    def validate(self, messages: List[Dict[str, str]]) -> List[str]:
        """
        Runs comprehensive checks on a rendered message list.
        Returns a list of violation strings.
        """
        violations = []
        if len(messages) < 2:
            return ["INVALID_STRUCTURE: Missing system/user message pair."]

        sys = messages[0].get("content", "")
        usr = messages[1].get("content", "")

        # R1: System Prefix Volume
        if len(sys) < self.MIN_SYSTEM_CHARS:
            violations.append(
                f"SYSTEM_VOLUME_FAIL: Prefix length {len(sys)} < {self.MIN_SYSTEM_CHARS}. "
                "Below 1024-token optimal caching threshold."
            )

        # R2: Golden Identity (Cache Branch Check)
        actual_hash = hashlib.sha256(sys.encode("utf-8")).hexdigest()[:16]
        if actual_hash != self._golden_hash:
            violations.append(
                f"PREFIX_IDENTITY_FAIL: Actual hash {actual_hash} != Golden {self._golden_hash}. "
                "Cache branch eviction imminent."
            )

        # R3: Static-First Principle
        # Note: In a RENDERED prompt, placeholders will be gone.
        # This check is primarily for the TEMPLATE validation step, 
        # but also serves as a 'Formatter Failure' detector in production.
        head = usr[:self.LEADING_CHECK_CHARS]
        for pat in self.BANNED_LEADING_PATTERNS:
            if re.search(pat, head, re.IGNORECASE):
                violations.append(
                    f"DYNAMIC_HEAD_VIOLATION: Placeholder '{pat}' found in the first "
                    f"{self.LEADING_CHECK_CHARS} characters of the user prompt."
                )

        return violations

    def enforce_runtime(self, messages: List[Dict[str, str]]):
        """Standard runtime enforcer. Logs errors but doesn't necessarily block."""
        violations = self.validate(messages)
        for v in violations:
            logger.error(f"🚨 [GUARDRAIL VIOLATION] {v}")
        return len(violations) == 0
