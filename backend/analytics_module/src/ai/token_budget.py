import os
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class TokenBudget:
    """
    Advanced Token Management System.
    Provides dual-mode estimation (Fast vs Exact) to balance performance and precision.
    """
    
    # Context Windows (Total: Input + Output)
    LIMITS = {
        "o1-preview": 128_000,
        "o1-mini": 128_000,
        "gpt-4.1": 128_000, # Placeholder for future model naming
        "gpt-4o": 128_000,
        "gpt-4o-mini": 128_000,
        "gpt-4-turbo": 128_000,
        "gpt-3.5-turbo": 16_385
    }

    def __init__(self, model: str):
        self.model = model
        self.limit = self.LIMITS.get(model, 128_000)
        # Toggle EXACT mode via environment variable (useful for CI/Tests)
        self._exact = os.getenv("TOKEN_COUNT_EXACT", "").lower() == "true"
        self._encoder = None

    def _get_encoder(self):
        """Lazy-load tiktoken encoder for exact mode."""
        if self._encoder is None:
            try:
                import tiktoken
                self._encoder = tiktoken.encoding_for_model(self.model)
            except Exception as e:
                logger.error(f"Failed to load tiktoken for model {self.model}: {e}")
                self._exact = False # Fallback to estimate
        return self._encoder

    def estimate_tokens(self, text: str) -> int:
        """
        Calculates token count.
        - Exact Mode: Uses BPE tokenization (tiktoken).
        - Fast Mode: Uses heuristic (len/3) which is safer than typical len/4.
        """
        if not text:
            return 0
            
        if self._exact:
            enc = self._get_encoder()
            if enc:
                return len(enc.encode(text))
        
        # FAST PATH: Heuristic optimization
        # 1. len(text) // 3 is conservative for Western text
        # 2. len(text.split()) * 1.5 handles whitespace-heavy payloads
        char_estimate = len(text) // 3
        word_estimate = int(len(text.split()) * 1.3)
        
        return max(char_estimate, word_estimate)

    def allocate_data_budget(self, 
                             system_text: str, 
                             static_instructions: str, 
                             output_budget: int,
                             safety_margin: int = 500) -> int:
        """
        Calculates the remaining token budget for dynamic data.
        Ensures the request stays within model context limits.
        """
        used_input = self.estimate_tokens(system_text) + self.estimate_tokens(static_instructions)
        
        # Total tokens = Input (Static + Data) + Output
        # So Data Budget = Limit - (Static Input + Output + Safety)
        total_reserved = used_input + output_budget + safety_margin
        
        data_budget = self.limit - total_reserved
        
        # Never return less than a sensible minimum for analysis
        return max(data_budget, 1000)

    def validate_request(self, system: str, user: str, output_budget: int) -> bool:
        """Predicate to check if a full request fits in the context window."""
        total = self.estimate_tokens(system) + self.estimate_tokens(user) + output_budget + 100
        is_valid = total <= self.limit
        if not is_valid:
            logger.warning(f"TOKEN OVERFLOW: Estimated {total} tokens exceeds limit {self.limit} for {self.model}")
        return is_valid

    @staticmethod
    def tokens_to_chars(token_count: int) -> int:
        """Heuristic conversion for string slicing (approx 3 chars per token)."""
        return token_count * 3

# Factory for quick access
def get_budgeter(model: str) -> TokenBudget:
    return TokenBudget(model)
