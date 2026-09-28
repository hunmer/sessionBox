import json
from typing import Any, AsyncIterator, Dict, Optional


async def iter_sse_events(content: Any) -> AsyncIterator[Dict[str, Any]]:
    """
    Parse SSE stream from aiohttp response.content.
    Returns dict: {"event": str, "data": str, "json": Optional[dict]}.
    """
    current_event = "message"
    current_data_lines = []

    async for raw_line in content:
        line = raw_line.decode("utf-8", errors="ignore").rstrip("\r\n")

        # Event separator
        if line == "":
            if current_data_lines:
                data_text = "\n".join(current_data_lines)
                yield {
                    "event": current_event,
                    "data": data_text,
                    "json": _safe_json_loads(data_text),
                }
            current_event = "message"
            current_data_lines = []
            continue

        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            current_event = line[6:].strip() or "message"
            continue
        if line.startswith("data:"):
            current_data_lines.append(line[5:].lstrip())
            continue

    # flush possible tail event
    if current_data_lines:
        data_text = "\n".join(current_data_lines)
        yield {
            "event": current_event,
            "data": data_text,
            "json": _safe_json_loads(data_text),
        }


def _safe_json_loads(text: str) -> Optional[Dict[str, Any]]:
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    return None
