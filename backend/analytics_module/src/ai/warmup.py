import asyncio
import logging
from typing import Any, List
from .prompt_registry import registry

logger = logging.getLogger(__name__)

class CacheWarmer:
    """
    Proactively primes the provider-side KV cache to eliminate cold-start latency.
    """
    
    @staticmethod
    async def warmup(client: Any, model: str, templates: List[str] = None):
        """
        Fires minimal requests to warm the God Prompt and optionally key templates.
        """
        god_prompt = registry.get_god_prompt()
        if not god_prompt:
            logger.warning("[Warmup] God Prompt is empty, skipping.")
            return

        # Phase 1: Pure God Prompt Warmup
        # This is the most critical as it's the foundation for ALL requests.
        try:
            logger.info(f"[Warmup] Priming God Prompt KV cache for model: {model}...")
            
            # Using asyncio.to_thread for the synchronous OpenAI client call
            await asyncio.to_thread(
                client.chat.completions.create,
                model=model,
                messages=[
                    {"role": "system", "content": god_prompt},
                    {"role": "user", "content": "WARMUP_SIGNAL: ACK"}
                ],
                max_tokens=5,
                temperature=0
            )
            logger.info("[Warmup] ✅ God Prompt KV cache successfully primed.")
            
        except Exception as e:
            logger.error(f"[Warmup] ❌ Failed to prime God Prompt: {e}")

        # Phase 2: Template Warmup (Optional)
        # If specific high-traffic templates exist, we can warm them with their static user head.
        if templates:
            for t_key in templates:
                try:
                    template = registry.get_template(t_key)
                    user_head = template.get("user_base", "")[:200] # Just the start
                    
                    await asyncio.to_thread(
                        client.chat.completions.create,
                        model=model,
                        messages=[
                            {"role": "system", "content": god_prompt},
                            {"role": "user", "content": f"{user_head}\n\nWARMUP_SIGNAL: ACK"}
                        ],
                        max_tokens=5,
                        temperature=0
                    )
                    logger.info(f"[Warmup] Template '{t_key}' primed.")
                except Exception as e:
                    logger.warning(f"[Warmup] Skipping template {t_key}: {e}")

async def start_warmup_background(client: Any, model: str, templates: List[str] = None):
    """Entry point for FastAPI 'startup' event."""
    # We run this as a non-blocking task to ensure the server starts immediately
    asyncio.create_task(CacheWarmer.warmup(client, model, templates=templates))
