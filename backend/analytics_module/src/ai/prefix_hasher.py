import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class PrefixHasher:
    """
    Guardian of the KV Cache Prefix.
    Verifies that the Immutable God Prompt has not been altered, 
    preserving prefix stability across deployments.
    """
    def __init__(self, expected_hash: Optional[str] = None):
        self._expected = expected_hash

    def hash(self, text: str) -> str:
        """Generates a stable 16-character fingerprint of the prefix content."""
        # Normalize line endings to avoid OS-specific hash mismatches
        normalized = text.replace("\r\n", "\n").strip()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]

    def verify_or_warn(self, system_content: str) -> bool:
        """
        Validates the current prompt against the golden hash.
        Logs a CRITICAL warning if a mismatch is detected, as this 
        will cause a 100% cache-miss storm at the provider level.
        """
        actual = self.hash(system_content)
        if self._expected and actual != self._expected:
            logger.critical(
                f"\n"
                f"🚨 [KV CACHE BREACH] GOD PROMPT HASH MISMATCH 🚨\n"
                f"Actual:   {actual}\n"
                f"Expected: {self._expected}\n"
                f"RESULT: All provider-side prefix caches are now INVALID.\n"
                f"ACTION: Revert changes to god_prompt.md or update meta if intentional.\n"
            )
            return False
        
        logger.info(f"✅ God Prompt Integrity Verified: {actual}")
        return True
