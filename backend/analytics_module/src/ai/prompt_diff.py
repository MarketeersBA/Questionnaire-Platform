import difflib
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

class PromptDiff:
    """
    Surgical Diagnostic Tool for KV Cache Regression.
    Identifies the exact point where two prompts diverge, 
    killing the cache prefix stability.
    """

    @staticmethod
    def find_divergence(a: str, b: str) -> Dict[str, Any]:
        """
        Locates the first point of difference between two long strings.
        Returns detailed context around the break point.
        """
        if a == b:
            return {"char_index": -1, "match_pct": 100.0, "note": "Perfect match."}

        # Find the first mismatching character
        shorter_len = min(len(a), len(b))
        divergence_idx = -1
        
        for i in range(shorter_len):
            if a[i] != b[i]:
                divergence_idx = i
                break
        
        if divergence_idx == -1:
            # One is a prefix of the other
            divergence_idx = shorter_len
            note = f"Divergence due to length mismatch: {len(a)} vs {len(b)}"
        else:
            note = f"Divergence at position {divergence_idx}"

        longest = max(len(a), len(b))
        match_pct = round((divergence_idx / longest) * 100, 2) if longest > 0 else 0.0

        # Extract context for visualization
        start_ctx = max(0, divergence_idx - 50)
        end_ctx = min(longest, divergence_idx + 50)

        ctx_a = a[start_ctx:end_ctx].replace("\n", "↵")
        ctx_b = b[start_ctx:end_ctx].replace("\n", "↵")

        # Visual marker for the exact break point
        marker = " " * (divergence_idx - start_ctx) + "↑ (BREAK)"

        return {
            "char_index": divergence_idx,
            "match_pct": match_pct,
            "note": note,
            "context_a": ctx_a,
            "context_b": ctx_b,
            "marker": marker,
            "stable_prefix": a[:divergence_idx] if divergence_idx > 0 else ""
        }

    @staticmethod
    def print_report(a: str, b: str):
        """Generates a human-readable diagnostic report for console debugging."""
        report = PromptDiff.find_divergence(a, b)
        if report["char_index"] == -1:
            print("✅ PROMPT STABILITY: 100% PERFECT MATCH")
            return

        print("\n--- 🚨 PROMPT DIVERGENCE DETECTED ---")
        print(f"Match Efficiency: {report['match_pct']}%")
        print(f"Break Position:   {report['char_index']}")
        print(f"Notes:            {report['note']}")
        print("\n--- CONTEXT A ---")
        print(report["context_a"])
        print("\n--- CONTEXT B ---")
        print(report["context_b"])
        print(report["marker"])
        print("----------------------------------\n")
