"""
Track API token usage and cost across decoder, insights, recommendations, and ai_percentages.

CostTracker class encapsulates state. Module-level functions delegate to a default instance
for backward compatibility.
"""
import json
import os
from typing import Any, Dict, List, Tuple

from backend.analytics_module.src.common import PRICES_PER_TOKEN


class CostTracker:
    """Tracks API token usage and cost for a single pipeline run."""

    def __init__(self):
        self._entries: List[Dict[str, Any]] = []
        self.dedup_saved_calls: int = 0

    def reset(self) -> None:
        self._entries = []

    @staticmethod
    def _resolve_model_key(model: str) -> str:
        """Standardize model name to pricing table key."""
        if "gpt-4.1-mini" in model:
            return "gpt-4.1-mini"
        elif "gpt-4o-mini" in model:
            return "gpt-4o-mini"
        elif "gpt-4.1" in model:
            return "gpt-4.1"
        elif "gpt-4o" in model:
            return "gpt-4o"
        elif "gpt-4" in model:
            return "gpt-4.1"
        return model

    @staticmethod
    def _cost_usd(model: str, prompt_tokens: int, completion_tokens: int, cached_tokens: int = 0) -> float:
        model_key = CostTracker._resolve_model_key(model)
        prices = PRICES_PER_TOKEN.get(model_key, {"input": 0.0, "cached_input": 0.0, "output": 0.0})
        # Non-cached input tokens pay full price, cached tokens pay discounted rate
        uncached_input = prompt_tokens - cached_tokens
        cost = (
            uncached_input * prices["input"]
            + cached_tokens * prices.get("cached_input", prices["input"])
            + completion_tokens * prices["output"]
        )
        return cost

    @staticmethod
    def _extract_cached_tokens(usage: Any) -> int:
        """Extract cached_tokens from OpenAI's prompt_tokens_details."""
        if usage is None:
            return 0
        # OpenAI returns: usage.prompt_tokens_details.cached_tokens
        details = getattr(usage, "prompt_tokens_details", None)
        if details is None and isinstance(usage, dict):
            details = usage.get("prompt_tokens_details", {})
        if details is None:
            return 0
        if isinstance(details, dict):
            return int(details.get("cached_tokens", 0))
        return int(getattr(details, "cached_tokens", 0) or 0)

    @staticmethod
    def _usage_to_prompt_completion_tokens(usage: Any) -> Tuple[int, int]:
        if usage is None:
            return 0, 0
        if isinstance(usage, dict):
            if "input_tokens" in usage or "output_tokens" in usage:
                return int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0))
            return int(usage.get("prompt_tokens", 0)), int(usage.get("completion_tokens", 0))
        in_t = getattr(usage, "input_tokens", None)
        out_t = getattr(usage, "output_tokens", None)
        if in_t is not None or out_t is not None:
            return int(in_t or 0), int(out_t or 0)
        return int(getattr(usage, "prompt_tokens", 0) or 0), int(
            getattr(usage, "completion_tokens", 0) or 0
        )

    def add_from_openai_response(self, component: str, model: str, response: Any, duration_ms: float = 0, ttft_ms: float = 0, prefix_version: str = "1.0.0") -> None:
        usage = getattr(response, "usage", None)
        pt, ct = self._usage_to_prompt_completion_tokens(usage)
        cached = self._extract_cached_tokens(usage)
        if pt or ct:
            self.add(component, model, pt, ct, cached, duration_ms=duration_ms, ttft_ms=ttft_ms, prefix_version=prefix_version)

    def add(self, component: str, model: str, prompt_tokens: int, completion_tokens: int, cached_tokens: int = 0, duration_ms: float = 0, ttft_ms: float = 0, prefix_version: str = "1.0.0") -> None:
        cost = self._cost_usd(model, prompt_tokens, completion_tokens, cached_tokens)
        self._entries.append({
            "component": component,
            "model": model,
            "prefix_version": prefix_version,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "cached_tokens": cached_tokens,
            "dedup_saved_calls": self.dedup_saved_calls,
            "cost_usd": round(cost, 6),
            "duration_ms": duration_ms,
            "ttft_ms": ttft_ms
        })

    def add_custom_usage(self, component: str, model: str, units: float, unit_name: str, cost_usd: float, duration_ms: float = 0) -> None:
        """Add custom cost entries that aren't necessarily token-based (e.g., Whisper duration)."""
        self._entries.append({
            "component": component,
            "model": model,
            "units": units,
            "unit_name": unit_name,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "cached_tokens": 0,
            "cost_usd": round(cost_usd, 6),
            "duration_ms": duration_ms
        })

    def record_dedup_save(self) -> None:
        """Register that a redundant API call was avoided."""
        self.dedup_saved_calls += 1

    def add_from_usage_summary(self, component: str, usage_summary: Dict[str, Any]) -> None:
        if not usage_summary:
            return
        model = usage_summary.get("model", "gpt-4o-mini")
        pt = usage_summary.get("prompt_tokens", 0)
        ct = usage_summary.get("completion_tokens", 0)
        self.add(component, model, pt, ct)

    def get_summary(self) -> Dict[str, Any]:
        total_pt = sum(e["prompt_tokens"] for e in self._entries)
        total_ct = sum(e["completion_tokens"] for e in self._entries)
        total_cached = sum(e.get("cached_tokens", 0) for e in self._entries)
        total_cost = sum(e["cost_usd"] for e in self._entries)
        
        # Calculate SAVINGS (Task 3.3)
        # Cost saved = cached_tokens * (input_price - cached_input_price)
        total_cost_saved = 0.0
        for e in self._entries:
            m = self._resolve_model_key(e["model"])
            prices = PRICES_PER_TOKEN.get(m, {"input": 0.0, "cached_input": 0.0})
            savings_per_token = prices["input"] - prices.get("cached_input", prices["input"])
            total_cost_saved += e.get("cached_tokens", 0) * savings_per_token

        by_component: Dict[str, Dict[str, Any]] = {}
        cached_latencies = []
        uncached_latencies = []
        cached_ttfts = []
        uncached_ttfts = []

        for e in self._entries:
            c = e["component"]
            dur = e.get("duration_ms", 0)
            ttft = e.get("ttft_ms", 0)
            cached_t = e.get("cached_tokens", 0)
            is_cached = cached_t > 0

            if dur > 0:
                if is_cached:
                    cached_latencies.append(dur)
                    if ttft > 0: cached_ttfts.append(ttft)
                else:
                    uncached_latencies.append(dur)
                    if ttft > 0: uncached_ttfts.append(ttft)

            if c not in by_component:
                by_component[c] = {
                    "prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0, 
                    "cost_usd": 0.0, "calls": 0, "durations": [], "ttfts": []
                }
            by_component[c]["prompt_tokens"] += e["prompt_tokens"]
            by_component[c]["completion_tokens"] += e["completion_tokens"]
            by_component[c]["cached_tokens"] += cached_t
            by_component[c]["cost_usd"] = round(by_component[c]["cost_usd"] + e["cost_usd"], 6)
            by_component[c]["calls"] += 1
            if dur > 0:
                by_component[c]["durations"].append(dur)
            if ttft > 0:
                by_component[c]["ttfts"].append(ttft)
        
        # Post-process component metrics
        for comp in by_component.values():
            if comp["durations"]:
                comp["avg_duration_ms"] = round(sum(comp["durations"]) / len(comp["durations"]), 1)
            else:
                comp["avg_duration_ms"] = 0
            
            if comp["ttfts"]:
                comp["avg_ttft_ms"] = round(sum(comp["ttfts"]) / len(comp["ttfts"]), 1)
            else:
                comp["avg_ttft_ms"] = 0
                
            del comp["durations"] # Cleanup
            del comp["ttfts"]

        # Calculate Latency Averages
        avg_cached = sum(cached_latencies) / len(cached_latencies) if cached_latencies else 0
        avg_uncached = sum(uncached_latencies) / len(uncached_latencies) if uncached_latencies else 0
        
        avg_ttft_cached = sum(cached_ttfts) / len(cached_ttfts) if cached_ttfts else 0
        avg_ttft_uncached = sum(uncached_ttfts) / len(uncached_ttfts) if uncached_ttfts else 0
        
        latency_reduction_pct = round((1 - (avg_cached / avg_uncached)) * 100, 1) if avg_uncached > 0 and avg_cached > 0 else 0
        
        # Total Latency Saved: (Uncached_Avg - Cached_Avg) * Count of Cached Calls
        total_latency_saved_ms = max(0, (avg_uncached - avg_cached) * len(cached_latencies))

        # Cache efficiency
        cache_hit_rate = round((total_cached / total_pt * 100), 1) if total_pt > 0 else 0
        
        return {
            "total_prompt_tokens": total_pt,
            "total_completion_tokens": total_ct,
            "total_cached_tokens": total_cached,
            "cache_hit_rate_pct": cache_hit_rate,
            "dedup_saved_calls": self.dedup_saved_calls,
            "total_cost_usd": round(total_cost, 6),
            "total_cost_saved_usd": round(total_cost_saved, 6),
            "total_latency_saved_ms": round(total_latency_saved_ms, 1),
            "avg_cached_duration_ms": round(avg_cached, 1),
            "avg_uncached_duration_ms": round(avg_uncached, 1),
            "avg_ttft_cached_ms": round(avg_ttft_cached, 1),
            "avg_ttft_uncached_ms": round(avg_ttft_uncached, 1),
            "latency_reduction_pct": latency_reduction_pct,
            "total_tokens": total_pt + total_ct,
            "by_component": by_component,
            "entries": self._entries,
        }

    def save(self, out_dir: str) -> str:
        os.makedirs(out_dir, exist_ok=True)
        summary = self.get_summary()
        json_path = os.path.join(out_dir, "api_cost.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        txt_path = os.path.join(out_dir, "api_cost.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write("API Performance & Cost Report\n")
            f.write("=" * 50 + "\n")
            f.write(f"Total cost: ${summary['total_cost_usd']:.6f}\n")
            f.write(f"Total tokens: {summary['total_tokens']:,}\n")
            f.write(f"Cache hit rate: {summary['cache_hit_rate_pct']}%\n")
            f.write(f"Latency Impact: {summary['avg_cached_duration_ms']:.1f}ms (cached) vs {summary['avg_uncached_duration_ms']:.1f}ms (uncached) | {summary['latency_reduction_pct']}% reduction\n\n")
            f.write("By component:\n")
            for comp, data in summary["by_component"].items():
                cached_info = f", cached: {data['cached_tokens']:,}" if data.get('cached_tokens') else ""
                f.write(f"  {comp}: ${data['cost_usd']:.6f} "
                        f"({data['calls']} calls, "
                        f"{data['prompt_tokens'] + data['completion_tokens']:,} tokens{cached_info})\n")
        return json_path


_default = CostTracker()

def reset(): _default.reset()
def add(component, model, prompt_tokens, completion_tokens, **kwargs): _default.add(component, model, prompt_tokens, completion_tokens, **kwargs)
def add_from_openai_response(component, model, response, **kwargs): _default.add_from_openai_response(component, model, response, **kwargs)
def add_from_usage_summary(component, usage_summary): _default.add_from_usage_summary(component, usage_summary)
def add_custom_usage(component, model, units, unit_name, cost_usd, duration_ms=0): _default.add_custom_usage(component, model, units, unit_name, cost_usd, duration_ms)
def get_summary(): return _default.get_summary()
def save(out_dir): return _default.save(out_dir)
def calculate_cost(component, model, prompt_tokens, completion_tokens): return _default._cost_usd(model, prompt_tokens, completion_tokens)
