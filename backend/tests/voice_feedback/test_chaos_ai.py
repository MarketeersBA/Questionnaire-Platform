import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from openai import RateLimitError, APITimeoutError
from backend.analytics_module.src.ai import AIGuard

@pytest.mark.asyncio
async def test_aiguard_rate_limit_recovery():
    """
    Simulates a 429 Rate Limit error from OpenAI.
    Verifies that AIGuard catches it and retries successfully.
    """
    mock_func = AsyncMock()
    # 1st call: Rate Limit, 2nd call: Success
    mock_func.side_effect = [
        RateLimitError("Rate limit reached", response=MagicMock(), body={}),
        "Successful result after retry"
    ]
    
    # We patch the sleep to speed up the test
    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await AIGuard.wrap_call_async(
            slide_id="test_chaos_rate",
            func=mock_func,
            max_retries=3
        )
        
        assert result == "Successful result after retry"
        assert mock_func.call_count == 2
        mock_sleep.assert_called_once() # Verify backoff happened

@pytest.mark.asyncio
async def test_aiguard_timeout_exhaustion():
    """
    Simulates persistent timeouts.
    Verifies that AIGuard exhausts retries and raises the final exception.
    """
    mock_func = AsyncMock()
    mock_func.side_effect = APITimeoutError(request=MagicMock())
    
    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await AIGuard.wrap_call_async(
            slide_id="test_chaos_timeout",
            func=mock_func,
            max_retries=2
        )
        
        assert result == AIGuard.FALLBACK_MSG
        # Initial call + 2 retries (max_retries=2) = 3 calls
        assert mock_func.call_count == 3

@pytest.mark.asyncio
async def test_concurrent_load_stability():
    """
    Simulates a 'Storm' of feedback processing.
    Ensures that multiple concurrent AIGuard-wrapped calls don't conflict.
    """
    async def fast_success():
        await asyncio.sleep(0.1)
        return "ok"

    # Spawn 50 concurrent tasks
    tasks = [AIGuard.wrap_call_async(f"load_{i}", fast_success) for i in range(50)]
    results = await asyncio.gather(*tasks)
    
    assert len(results) == 50
    assert all(r == "ok" for r in results)
