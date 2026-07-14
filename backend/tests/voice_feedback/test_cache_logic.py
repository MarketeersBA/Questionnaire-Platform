import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.voice_feedback.embedding_engine import EmbeddingEngine

@pytest.fixture
async def engine():
    return EmbeddingEngine()

@pytest.mark.asyncio
async def test_embedding_cache_hit():
    """
    Verifies that if an embedding exists in Redis, 
    the engine returns it without calling the OpenAI API.
    """
    engine = EmbeddingEngine()
    test_text = "test cache hit"
    cached_vector = [0.1, 0.1, 0.1]
    
    # Mock Redis to return a cached value
    with patch("backend.utils.cache_utils.cache.get", new_callable=AsyncMock) as mock_get, \
         patch("openai.resources.embeddings.Embeddings.create") as mock_openai:
        
        mock_get.return_value = cached_vector
        
        vectors = await engine.get_embeddings([test_text])
        
        assert vectors[0] == cached_vector
        mock_get.assert_called_once()
        mock_openai.assert_not_called()

@pytest.mark.asyncio
async def test_embedding_cache_miss_and_store():
    """
    Verifies that if an embedding is NOT in Redis, 
    the engine calls OpenAI and THEN stores the result in Redis.
    """
    engine = EmbeddingEngine()
    test_text = "test cache miss"
    new_vector = [0.9, 0.9, 0.9]
    
    # Mock Redis Get (None), OpenAI Create, and Redis Set
    with patch("backend.utils.cache_utils.cache.get", new_callable=AsyncMock) as mock_get, \
         patch("backend.utils.cache_utils.cache.set", new_callable=AsyncMock) as mock_set, \
         patch.object(engine.client.embeddings, 'create') as mock_openai:
        
        mock_get.return_value = None
        # Mock OpenAI response structure
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=new_vector)]
        mock_openai.return_value = mock_response
        
        vectors = await engine.get_embeddings([test_text])
        
        assert vectors[0] == new_vector
        mock_get.assert_called_once()
        mock_openai.assert_called_once()
        # Verify it was stored with 24h TTL
        mock_set.assert_called_once()
        args, kwargs = mock_set.call_args
        assert args[1] == new_vector
        assert kwargs["ttl"] == 86400
