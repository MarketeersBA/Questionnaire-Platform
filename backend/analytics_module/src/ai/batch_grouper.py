import logging
from typing import Any, Dict, List, Callable, Coroutine

logger = logging.getLogger(__name__)

class BatchGrouper:
    """
    Orchestrator for Temporal Locality.
    Groups AI tasks by shared characteristics (Base Schema / Template)
    to maximize KV cache warm-up efficiency.
    """

    @staticmethod
    def group_by_characteristic(tasks: List[Any], key_extractor: Callable[[Any], str]) -> List[List[Any]]:
        """
        Generic grouping logic.
        Clusters tasks together so they can be fired in waves.
        """
        groups: Dict[str, List[Any]] = {}
        for task in tasks:
            key = key_extractor(task)
            groups.setdefault(key, []).append(task)
        
        return list(groups.values())

    @classmethod
    def group_by_schema(cls, tasks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Convenience method to group by JSON schema name."""
        def _get_schema_name(task):
            rf = task.get("response_format")
            if isinstance(rf, dict):
                return rf.get("json_schema", {}).get("name", "generic")
            return "generic"
        return cls.group_by_characteristic(tasks, _get_schema_name)

    @staticmethod
    async def execute_in_waves(groups: List[List[Any]], 
                              execution_fn: Callable[[Any], Coroutine[Any, Any, None]],
                              wave_label: str = "Batch"):
        """
        Executes groups of tasks sequentially, but each group internally runs in parallel.
        This ensures that the 'First' group warms the cache for the 'Second' group
        if they share prefix/schema characteristics.
        """
        import asyncio
        import time
        
        total_time = 0
        for i, group in enumerate(groups):
            t0 = time.monotonic()
            logger.info(f"[{wave_label}] Firing Wave {i+1}/{len(groups)} ({len(group)} tasks)")
            
            # Internal parallelism within the group
            await asyncio.gather(*[execution_fn(task) for task in group])
            
            elapsed = time.monotonic() - t0
            total_time += elapsed
            logger.info(f"[{wave_label}] Wave {i+1} completed in {elapsed:.2f}s")
            
        return total_time
