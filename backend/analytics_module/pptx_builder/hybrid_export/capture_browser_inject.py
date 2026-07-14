"""Playwright localStorage injection script for PPTX capture sessions."""
from __future__ import annotations

import json
from typing import Dict, Mapping


def build_playwright_storage_init_script(storage_entries: Mapping[str, str]) -> str:
    """
    Return an IIFE executed via ``context.add_init_script`` before navigation.

    Mirrors the injection path in ``browser_capture.BrowserCaptureWorker._open_page``.
    """
    payload = json.dumps(dict(storage_entries))
    return f"""
(() => {{
  const entries = {payload};
  for (const [key, value] of Object.entries(entries)) {{
    window.localStorage.setItem(key, value);
  }}
}})();
"""
