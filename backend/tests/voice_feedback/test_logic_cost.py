import pytest
from backend.analytics_module.src.ai.api_cost import CostTracker

@pytest.fixture
def tracker():
    return CostTracker()

def test_token_cost_calculation(tracker):
    """Verifies that token-based pricing for GPT-4o is accurate."""
    # Using the correct 'add' method instead of 'add_usage'
    tracker.add("test_component", "gpt-4o", prompt_tokens=1000, completion_tokens=500)
    summary = tracker.get_summary()
    
    assert summary["total_tokens"] == 1500
    assert summary["total_cost_usd"] > 0
    assert "test_component" in summary["by_component"]

def test_custom_usage_audio(tracker):
    """Verifies that custom units (like Whisper audio minutes) are tracked correctly."""
    # Whisper is tracked via add_custom_usage(component, model, units, unit_name, cost_usd)
    # 120 seconds * 0.0001 = 0.012
    tracker.add_custom_usage("whisper_stt", "whisper-1", 120, "seconds", 0.012)
    summary = tracker.get_summary()
    
    assert summary["total_cost_usd"] == pytest.approx(0.012)
    assert "whisper_stt" in summary["by_component"]
