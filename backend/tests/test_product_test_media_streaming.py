"""Chunked GridFS streaming helper tests."""

import pytest

from backend.services.product_test_media_streaming import iter_gridfs_chunks


@pytest.mark.asyncio
async def test_iter_gridfs_chunks_yields_readchunk_slices():
    class FakeGridOut:
        def __init__(self):
            self.calls = 0

        async def readchunk(self, size: int):
            self.calls += 1
            if self.calls == 1:
                return b"abc"
            if self.calls == 2:
                return b"de"
            return b""

    chunks = [c async for c in iter_gridfs_chunks(FakeGridOut(), chunk_size=3)]
    assert chunks == [b"abc", b"de"]
