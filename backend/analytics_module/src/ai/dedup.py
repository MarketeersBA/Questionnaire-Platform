import asyncio
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional, Callable, Awaitable

logger = logging.getLogger(__name__)

class InFlightCoalescer:
    """
    Prevents redundant, simultaneous AI calls.
    If multiple identical requests are triggered concurrently, only the first
    hits the network; others await the existing future.
    """
    def __init__(self):
        # Maps hash(request) -> asyncio.Future
        self._in_flight: Dict[str, asyncio.Future] = {}
        self.saved_calls = 0

    @staticmethod
    def generate_key(messages: List[Dict[str, str]], model: str, response_format: Optional[Dict[str, Any]] = None) -> str:
        """Creates a stable fingerprint for a request."""
        # Use json.dumps with sort_keys to handle dictionary stability
        payload = {
            "model": model,
            "messages": messages,
            "format": response_format
        }
        raw_key = json.dumps(payload, sort_keys=True)
        return hashlib.sha256(raw_key.encode()).hexdigest()[:32]

    async def execute_or_wait(self, key: str, coro_factory: Callable[[], Awaitable[Any]]) -> Any:
        """
        Coalesces execution. If 'key' is being processed, waits for it.
        Otherwise, starts new work.
        """
        if not key:
            # Bypass dedup if no key provided
            return await coro_factory()

        if key in self._in_flight:
            logger.info(f"[Dedup] Coalescing concurrent request: {key}")
            self.saved_calls += 1
            # Wait for the primary owner to complete
            return await self._in_flight[key]

        # Register a new future for this uniquely identified work
        future = asyncio.get_event_loop().create_future()
        self._in_flight[key] = future

        try:
            # The primary caller executes the actual network request
            result = await coro_factory()
            future.set_result(result)
            return result
        except Exception as e:
            # Propagate failure to all waiters
            future.set_exception(e)
            raise
        finally:
            # Release the lock so subsequent requests (later in time) can run fresh if needed
            # (Note: This logic handles in-flight dedup, not persistent caching)
            self._in_flight.pop(key, None)

# Global Instance
coalescer = InFlightCoalescer()
