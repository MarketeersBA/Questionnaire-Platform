import json
import logging
import asyncio
import time
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

async def stream_json_completion(client: Any, model: str, messages: list, **kwargs) -> Any:
    """
    Executes a streaming OpenAI call to capture TTFT and reconstruct JSON payload.
    Compatible with CostTracker.add_from_openai_response.
    """
    t0 = time.perf_counter()
    ttft_ms = 0.0
    full_content = ""
    usage = None

    # Enable usage tracking in stream if supported
    stream_options = {"include_usage": True}
    
    # Run the stream iterator
    stream = await asyncio.to_thread(
        client.chat.completions.create,
        model=model,
        messages=messages,
        stream=True,
        stream_options=stream_options,
        **kwargs
    )

    for chunk in stream:
        # 1. Capture TTFT (Time to First Token)
        if not ttft_ms and chunk.choices and chunk.choices[0].delta.content:
            ttft_ms = (time.perf_counter() - t0) * 1000
        
        # 2. Accumulate content
        if chunk.choices and chunk.choices[0].delta.content:
            full_content += chunk.choices[0].delta.content
            
        # 3. Capture Usage (usually in the final chunk)
        if hasattr(chunk, "usage") and chunk.usage:
            usage = chunk.usage

    duration_ms = (time.perf_counter() - t0) * 1000
    
    # Create a mock response object compatible with CostTracker
    class MockMessage:
        def __init__(self, content): self.content = content
    class MockChoice:
        def __init__(self, content): self.message = MockMessage(content)
    class MockResponse:
        def __init__(self, content, usage, d_ms, t_ms):
            self.choices = [MockChoice(content)]
            self.usage = usage
            self.duration_ms = d_ms
            self.ttft_ms = t_ms

    return MockResponse(full_content, usage, duration_ms, ttft_ms)

def parse_json_robustly(text: str) -> Dict[str, Any]:
    """Robustly extract and parse JSON from LLM responses. Always returns a dict."""
    if not text or not isinstance(text, str):
        return {}
    
    text = text.strip()
    def _attempt_parse(s: str) -> Optional[Dict[str, Any]]:
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                return data
            return None
        except:
            return None

    # 1. Direct parse
    res = _attempt_parse(text)
    if res is not None: return res

    # 2. Handle common markdown formatting
    clean_text = text
    if "```json" in text:
        clean_text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        clean_text = text.split("```")[1].split("```")[0].strip()
    
    res = _attempt_parse(clean_text)
    if res is not None: return res

    # 3. Last resort: find the first { and last }
    start = clean_text.find("{")
    end = clean_text.rfind("}")
    if start != -1 and end != -1:
        res = _attempt_parse(clean_text[start:end+1])
        if res is not None: return res

    return {}
