from __future__ import annotations

from typing import Iterable, List, Sequence, TypeVar

T = TypeVar("T")


def chunk_sequence(items: Sequence[T], size: int) -> List[List[T]]:
    if size <= 0:
        raise ValueError("chunk size must be positive")
    if not items:
        return []
    return [list(items[index : index + size]) for index in range(0, len(items), size)]


def split_text_blocks(
    text: str,
    *,
    max_chars: int = 1100,
    max_paragraphs: int = 4,
) -> List[str]:
    """Split long narrative text into slide-sized blocks."""
    normalized = (text or "").strip()
    if not normalized:
        return []

    paragraphs = [part.strip() for part in normalized.split("\n") if part.strip()]
    if not paragraphs:
        paragraphs = [normalized]

    blocks: List[str] = []
    current: List[str] = []
    current_len = 0

    for paragraph in paragraphs:
        paragraph_len = len(paragraph)
        would_overflow = (
            current
            and (
                current_len + paragraph_len + 2 > max_chars
                or len(current) >= max_paragraphs
            )
        )
        if would_overflow:
            blocks.append("\n\n".join(current))
            current = [paragraph]
            current_len = paragraph_len
            continue

        current.append(paragraph)
        current_len += paragraph_len + (2 if len(current) > 1 else 0)

    if current:
        blocks.append("\n\n".join(current))

    oversized: List[str] = []
    for block in blocks:
        if len(block) <= max_chars:
            oversized.append(block)
            continue
        start = 0
        while start < len(block):
            oversized.append(block[start : start + max_chars].strip())
            start += max_chars

    return [block for block in oversized if block]
