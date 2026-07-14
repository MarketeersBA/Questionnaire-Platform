import logging
import asyncio
from typing import List, Optional, Any, Dict
from openai import OpenAI
from backend.config import settings
from backend.utils.cache_utils import cache
from backend.analytics_module.src.ai import api_cost

logger = logging.getLogger(__name__)

class EmbeddingEngine:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)
        self.model = "text-embedding-3-small"
        self.dimensions = 1536

    async def get_embeddings(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """
        Generate embeddings for a list of texts with batching and Redis caching.
        """
        if not texts:
            return []

        results = [None] * len(texts)
        missing_indices = []
        missing_texts = []

        # 1. Try to fetch from cache first
        for i, text in enumerate(texts):
            # Create a stable key (using first 50 chars + length for uniqueness without being too long)
            cache_key = f"embed:{hash(text)}"
            cached_val = await cache.get(cache_key)
            if cached_val:
                results[i] = cached_val
            else:
                missing_indices.append(i)
                missing_texts.append(text)

        # 2. Batch API calls for missing embeddings
        if missing_texts:
            for i in range(0, len(missing_texts), batch_size):
                batch = missing_texts[i:i + batch_size]
                batch_indices = missing_indices[i:i + batch_size]
                
                try:
                    response = self.client.embeddings.create(
                        input=batch,
                        model=self.model
                    )
                    
                    # Record cost
                    api_cost.add_from_openai_response(
                        component="voice_embedding",
                        model=self.model,
                        response=response
                    )

                    for j, emb_data in enumerate(response.data):
                        emb_vector = emb_data.embedding
                        idx = batch_indices[j]
                        results[idx] = emb_vector
                        
                        # Cache for 24 hours
                        cache_key = f"embed:{hash(batch[j])}"
                        await cache.set(cache_key, emb_vector, ttl=86400)
                        
                except Exception as e:
                    logger.error(f"Embedding batch failed: {e}")
                    # Fill with zeros or handle as needed
                    for idx in batch_indices:
                        results[idx] = [0.0] * self.dimensions

        return results

# Global instance
embedding_engine = EmbeddingEngine()
