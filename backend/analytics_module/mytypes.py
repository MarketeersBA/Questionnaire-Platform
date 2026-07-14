from dataclasses import dataclass
from typing import Dict, Any, Optional

from openai import OpenAI


@dataclass(frozen=True)
class AppConfig:
    inputs: Dict[str, Any]
    all_charts_json: Dict[str, Any]
    pptx_template_path: str
    client: Optional[OpenAI]
    model: str
    openai_api_key: Optional[str] = None

