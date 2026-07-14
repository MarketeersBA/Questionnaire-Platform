"""
Chunked GridFS streaming — avoids loading entire video/image into memory.
"""

from __future__ import annotations

from typing import AsyncIterator, Any

from backend.trial_media_capture.constants import STREAM_CHUNK_BYTES


async def iter_gridfs_chunks(
    grid_out: Any,
    chunk_size: int = STREAM_CHUNK_BYTES,
) -> AsyncIterator[bytes]:
    """
    Yield GridFS file bytes in bounded chunks.

    Motor AsyncIOMotorGridOut supports readchunk(); fall back to async iteration.
    """
    readchunk = getattr(grid_out, "readchunk", None)
    if callable(readchunk):
        while True:
            chunk = await readchunk(chunk_size)
            if not chunk:
                break
            yield chunk
        return

    async for chunk in grid_out:
        if chunk:
            yield chunk
