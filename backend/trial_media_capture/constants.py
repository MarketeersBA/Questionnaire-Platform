"""MIME and validation constants for product test trial media uploads."""

ALLOWED_TRIAL_IMAGE_MIMES = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
})

ALLOWED_TRIAL_VIDEO_MIMES = frozenset({
    "video/mp4",
    "video/webm",
    "video/quicktime",
})

ALLOWED_TRIAL_MEDIA_MIMES = ALLOWED_TRIAL_IMAGE_MIMES | ALLOWED_TRIAL_VIDEO_MIMES

IMAGE_EXTENSIONS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

VIDEO_EXTENSIONS = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}

MEDIA_ASSETS_COLLECTION = "product_test_media_assets"
GRIDFS_BUCKET_NAME = "product_test_media"
GRIDFS_FILES_COLLECTION = f"{GRIDFS_BUCKET_NAME}.files"

# Lifecycle + scan (Phase 6)
LIFECYCLE_PENDING = "pending"
LIFECYCLE_SUBMITTED = "submitted"
LIFECYCLE_REPLACED = "replaced"
LIFECYCLE_ORPHANED = "orphaned"

SCAN_PENDING = "pending"
SCAN_CLEAN = "clean"
SCAN_QUARANTINED = "quarantined"
SCAN_SKIPPED = "skipped"

DEFAULT_ABANDONED_MEDIA_TTL_HOURS = 24
DEFAULT_UNREFERENCED_SUBMITTED_GRACE_HOURS = 1
STREAM_CHUNK_BYTES = 64 * 1024
