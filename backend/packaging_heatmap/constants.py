"""Canonical constants for packaging heatmap feature."""

from typing import Final, Literal, Tuple

PACKAGING_IMAGE_BUCKET: Final[str] = "packaging_images"

PackagingImageSide = Literal["front", "back"]
PackagingHeatmapIntent = Literal["attraction", "dislikes", "improve"]

PACKAGING_IMAGE_SIDES: Tuple[PackagingImageSide, ...] = ("front", "back")
PACKAGING_HEATMAP_INTENTS: Tuple[PackagingHeatmapIntent, ...] = (
    "attraction",
    "dislikes",
    "improve",
)

ALLOWED_PACKAGING_IMAGE_MIMES: frozenset[str] = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
})

ALLOWED_PACKAGING_IMAGE_EXTENSIONS: frozenset[str] = frozenset({
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
})

PACKAGING_HEATMAP_GRID_SIZE: Final[int] = 32
PACKAGING_HEATMAP_MAX_CLICKS: Final[int] = 30
PACKAGING_HEATMAP_MAX_PINS: Final[int] = 10

MIME_TO_EXTENSION: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
