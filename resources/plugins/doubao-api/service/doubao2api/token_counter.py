"""
Token counting utilities for doubao2api.

Uses tiktoken cl100k_base as an approximation for Doubao's tokenizer.
Applies a 1.3x safety factor since Doubao uses a different tokenizer
(likely overestimates by 10-30%, which is safer for context management).
"""
import logging
from typing import Optional

log = logging.getLogger(__name__)

# Lazy-load tiktoken to avoid import cost on every request
_encoder = None
SAFETY_FACTOR = 1.3  # Overestimate to be safe for context management


def _get_encoder():
    global _encoder
    if _encoder is None:
        try:
            import tiktoken
            _encoder = tiktoken.get_encoding("cl100k_base")
        except ImportError:
            log.warning("tiktoken not installed, using char-based estimation")
            _encoder = "fallback"
    return _encoder


def count_tokens(text: str) -> int:
    """Count tokens in text. Returns estimated token count with safety factor."""
    if not text:
        return 0
    enc = _get_encoder()
    if enc == "fallback":
        # Fallback: ~2.5 chars per token for mixed CJK/English code
        raw = len(text) / 2.5
    else:
        raw = len(enc.encode(text))
    return int(raw * SAFETY_FACTOR)


def count_messages_tokens(messages: list[dict]) -> int:
    """Estimate token count for a messages array (OpenAI format)."""
    total = 0
    for msg in messages:
        # Each message has ~4 tokens overhead (role, separators)
        total += 4
        content = msg.get("content", "")
        if isinstance(content, str) and content:
            total += count_tokens(content)
        elif isinstance(content, list):
            # Multimodal content
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    total += count_tokens(part.get("text", ""))
        # Tool calls in assistant messages
        tool_calls = msg.get("tool_calls", [])
        if tool_calls:
            for tc in tool_calls:
                func = tc.get("function", {})
                total += count_tokens(func.get("name", ""))
                total += count_tokens(func.get("arguments", ""))
    # Base overhead (system prompt framing)
    total += 3
    return total
