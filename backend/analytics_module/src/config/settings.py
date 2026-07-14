"""
Centralized constants and defaults for the Report pipeline.
Values that were previously hardcoded across multiple modules live here.
"""
import os

DEFAULT_OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

SUPPORTED_ENCODINGS = ("latin-1", "utf-8-sig", "utf-8", "cp1256", "iso-8859-6")

COLUMN_NULL_THRESHOLD = 0.01

BASE_PLACEHOLDER = "Base: 00"

DEFAULT_FONT_FAMILY = "Pangram"

MAX_CROSS_TAB_ROWS = 7
MAX_HABITS_ROWS = 10

MAX_DATA_SUMMARY_CHARS = 3000

LLM_MAX_CONNECTION_RETRIES = 5
LLM_MAX_JSON_RETRIES = 3
LLM_BASE_DELAY_SECONDS = 4

ARABIC_DIGIT_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

EXCLUDE_VALUES = frozenset({
    "أخري، حدد [Specify]",
    "أخرى، حدد [Specify]",
    "أخرى / Other (Specify) [Specify]",
    "Other (specify) [Specify]",
    "Other, specify [Specify]",
    "other",
})

IGNORE_BRANDS = frozenset({"None", "Other (specify)", "ولا واحدة [Exclusive]"})
