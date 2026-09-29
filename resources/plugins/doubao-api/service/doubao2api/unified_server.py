"""
Unified API server for Doubao (Playwright browser-based).

Exposes OpenAI-compatible endpoints:
  POST /v1/chat/completions     (chat, streaming & non-streaming)
  GET  /v1/models               (list available models)
  GET  /health                  (health check)
  Session authentication is managed by SessionBox via DOUBAO_PAGE_ID.

Start with:
    python -m doubao2api
"""
from __future__ import annotations

import asyncio
import collections
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from .browser_client import BrowserClient
from .qianwen_client import QianwenClient, QIANWEN_MODELS
from .sessionbox_api import SessionBoxClient
from .tool_calling import (
    build_tool_system_prompt,
    convert_messages_with_tools,
    parse_tool_calls_xml,
    is_tool_call_start,
    has_complete_tool_calls,
    StreamingGuard,
    detect_truncated_tool_call,
    build_continuation_prompt,
    filter_history_by_topic,
    ToolNameObfuscator,
    coerce_tool_arguments,
    deduplicate_continuation,
)
from .token_counter import count_tokens, count_messages_tokens, SAFETY_FACTOR

log = logging.getLogger("doubao_unified")


class UpstreamVerificationRequired(RuntimeError):
    pass


def _safe_error_context(event: dict) -> dict:
    """Retain upstream verification metadata without persisting challenge payloads."""
    result = {
        "error_code": event.get("error_code"),
        "error_msg": event.get("error_msg") or event.get("message"),
        "event_keys": sorted(str(key) for key in event.keys()),
    }
    extra = event.get("extra") or {}
    if isinstance(extra, dict):
        result["extra_keys"] = sorted(str(key) for key in extra.keys())
    if isinstance(extra, dict) and isinstance(extra.get("decision"), str):
        try:
            decision = json.loads(extra["decision"])
            if isinstance(decision, dict):
                for key in ("type", "subtype", "verify_scene", "log_id", "code"):
                    if key in decision:
                        result["decision_type" if key == "type" else key] = decision[key]
        except (ValueError, TypeError):
            result["decision_parse_failed"] = True
    return result

# ── Tool Name Obfuscation (enabled via QIANWEN_OBFUSCATE_TOOLS=true) ──
_tool_obfuscator = ToolNameObfuscator(
    enabled=os.environ.get("QIANWEN_OBFUSCATE_TOOLS", "false").lower() == "true"
)

# ── Auto-delete ephemeral conversations (即用即焚 / Scheme B) ──
_auto_delete_conv = os.environ.get("DOUBAO_AUTO_DELETE_CONV", "true").lower() in ("true", "1", "yes")

# ── Request Dispatch Smoothing (avoids burst rate-limiting from translation plugins) ──
_dispatch_lock = asyncio.Lock()
_last_dispatch_time: float = 0.0
_MIN_DISPATCH_INTERVAL = float(os.environ.get("DOUBAO_MIN_INTERVAL", "0.2"))  # 200ms

# ── Model definitions ────────────────────────────────────────

CHAT_MODELS: Dict[str, int] = {
    "doubao-2.1-turbo": 0,
    "doubao-2.1-pro": 0,
    "doubao-2.1": 0,
    "doubao-think": 1,
    "doubao-2.1-think": 1,
    "doubao-pro": 0,
    "doubao": 0,
    "doubao-expert": 3,
}

# Qianwen models (routed to QianwenClient)
QIANWEN_MODEL_NAMES = set(QIANWEN_MODELS.keys())

ALL_MODELS = [
    {"id": m, "object": "model", "owned_by": "doubao", "created": 0}
    for m in CHAT_MODELS
] + [
    {"id": m, "object": "model", "owned_by": "qianwen", "created": 0}
    for m in QIANWEN_MODELS
] + [
    {"id": "doubao-image", "object": "model", "owned_by": "doubao", "created": 0},
    {"id": "doubao-music", "object": "model", "owned_by": "doubao", "created": 0},
    {"id": "doubao-video", "object": "model", "owned_by": "doubao", "created": 0},
]


# ── Expert Mode Quota Tracker ──
class ExpertQuotaTracker:
    """Detects when expert mode is silently downgraded and falls back to think."""

    def __init__(self, consecutive_threshold: int = 2, retry_interval: int = 1800):
        self._no_reasoning_count = 0  # consecutive expert requests without reasoning
        self._threshold = consecutive_threshold  # how many before marking degraded
        self._degraded = False
        self._last_retry_time = 0.0
        self._retry_interval = retry_interval  # seconds before retrying expert (30 min)

    @property
    def is_degraded(self) -> bool:
        """True if expert mode appears to be quota-limited."""
        if not self._degraded:
            return False
        # Periodically retry
        import time
        if time.time() - self._last_retry_time > self._retry_interval:
            return False  # Allow a retry
        return True

    def report_response(self, had_reasoning: bool):
        """Call after each expert-mode request with whether reasoning was present."""
        import time
        if had_reasoning:
            self._no_reasoning_count = 0
            if self._degraded:
                log.info("Expert mode recovered (reasoning detected)")
            self._degraded = False
        else:
            self._no_reasoning_count += 1
            if self._no_reasoning_count >= self._threshold and not self._degraded:
                self._degraded = True
                self._last_retry_time = time.time()
                log.warning("Expert mode appears degraded (no reasoning for %d requests), falling back to think", self._threshold)

    def mark_retry(self):
        """Mark that we're doing a retry probe."""
        import time
        self._last_retry_time = time.time()

    def get_effective_mode(self, requested_deep_think: int) -> tuple[int, str]:
        """Return (deep_think_value, model_name) considering degradation.

        If expert (3) is degraded, falls back to think (1).
        """
        if requested_deep_think == 3 and self.is_degraded:
            return 1, "doubao-think"
        model_map = {0: "doubao", 1: "doubao-think", 3: "doubao-expert"}
        return requested_deep_think, model_map.get(requested_deep_think, "doubao")


_expert_tracker = ExpertQuotaTracker()


def _size_to_ratio(size):
    """Convert OpenAI size format to Doubao ratio."""
    if not size:
        return "1:1"
    size_map = {
        "1024x1024": "1:1",
        "1792x1024": "16:9",
        "1024x1792": "9:16",
        "1024x768": "4:3",
        "768x1024": "3:4",
    }
    if size in size_map:
        return size_map[size]
    if ":" in size:
        return size
    return "1:1"

# ── Request log ring buffer ───────────────────────────────────

_REQUEST_LOG: collections.deque = collections.deque(maxlen=100)
_SERVER_START_TIME: float = time.time()


# ── Rate limiter ─────────────────────────────────────────────


class _TokenBucket:
    """Simple async token-bucket rate limiter."""

    def __init__(self, rpm: float):
        self._interval = 60.0 / rpm if rpm > 0 else 0.0
        self._next_allowed = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        if self._interval <= 0:
            return
        while True:
            async with self._lock:
                now = time.monotonic()
                if now >= self._next_allowed:
                    self._next_allowed = now + self._interval
                    return
                wait_time = self._next_allowed - now
            await asyncio.sleep(wait_time)


# ── Pydantic request models ──────────────────────────────────


class _Message(BaseModel):
    role: str
    content: Any  # str | list[dict]
    tool_calls: Optional[list] = None  # for assistant messages with tool calls
    tool_call_id: Optional[str] = None  # for role:tool messages
    name: Optional[str] = None  # tool name for role:tool messages


class ChatCompletionRequest(BaseModel):
    model: str = "doubao"
    messages: List[_Message]
    stream: bool = False
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    conversation_id: Optional[str] = None
    bot_id: Optional[str] = None
    tools: Optional[List[dict]] = None
    tool_choice: Optional[Any] = None  # "auto" | "none" | {"type":"function","function":{"name":"..."}}
    enable_thinking: Optional[bool] = None  # triggers deep_search="1" for thinking mode
    reasoning_effort: Optional[str] = None  # "low"|"medium"|"high" — also triggers thinking



class ImageGenerationRequest(BaseModel):
    prompt: str
    model: str = "doubao-image"
    n: int = 1
    size: Optional[str] = "1024x1024"
    ratio: Optional[str] = None
    ref_image_key: Optional[str] = None
    response_format: Optional[str] = "url"

# ── Application factory ──────────────────────────────────────


def create_app(
    *,
    api_key: Optional[str] = None,
    rpm_limit: float = 20.0,
) -> FastAPI:
    """Build and return a configured FastAPI application."""

    _browser: Dict[str, Any] = {}  # holds BrowserClient instance
    _qianwen: Dict[str, Any] = {}  # holds QianwenClient instance

    async def _select_sessionbox_page(page_id: str) -> BrowserClient:
        if not page_id:
            raise HTTPException(status_code=400, detail="page_id is required")
        current = _browser.get("client")
        if current and current.page_id == page_id and current.is_ready:
            return current
        if current:
            await current.stop()
        client = BrowserClient(
            headless=os.environ.get("DOUBAO_HEADLESS", "true").strip().lower() == "true",
            page_id=page_id,
            sessionbox_url=os.environ.get("SESSIONBOX_API_URL", "http://127.0.0.1:19100").strip(),
        )
        await client.start()
        _browser["client"] = client
        return client

    async def _browser_watchdog():
        """Background task: check browser health, auto-detect login, auto-restart on crash."""
        consecutive_dead = 0
        while True:
            client = _browser.get("client")
            sleep_time = 10 if (client and client.is_ready) else 2
            await asyncio.sleep(sleep_time)

            if client is None:
                continue
            try:
                alive = await client.is_alive()
                if not alive:
                    consecutive_dead += 1
                    log.warning("Browser watchdog: health check failed (%d/3)", consecutive_dead)
                    if consecutive_dead >= 3:
                        log.error("Browser watchdog: process dead 3 consecutive checks, restarting...")
                        await client.restart()
                        consecutive_dead = 0
                else:
                    consecutive_dead = 0
                    if not client.is_ready:
                        await client._check_login_state()
                        if client.is_ready:
                            log.info("Browser client logged in successfully! sessionid confirmed.")
                            raw_headless = os.environ.get("DOUBAO_HEADLESS", "auto").strip().lower()
                            if not client.headless and raw_headless in ("auto", "true"):
                                log.info("Auto-switching to background headless mode now...")
                                await client.switch_mode(headless=True)
            except Exception as e:
                log.error("Browser watchdog error: %s", e)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Ensure browser_client logs are visible
        logging.getLogger("doubao2api.browser_client").setLevel(logging.INFO)
        logging.getLogger("doubao2api.browser_client").addHandler(logging.StreamHandler())

        page_id = os.environ.get("DOUBAO_PAGE_ID", "").strip()
        if page_id:
            await _select_sessionbox_page(page_id)
        else:
            log.info("Waiting for a SessionBox page selection")

        # Start browser watchdog
        watchdog_task = asyncio.create_task(_browser_watchdog())

        # Start Qianwen client (optional, enabled via env var)
        qw_client = None
        if os.environ.get("QIANWEN_ENABLED", "false").lower() == "true":
            qw_headless = os.environ.get("QIANWEN_HEADLESS", "true").lower() == "true"
            qw_data_dir = os.environ.get(
                "QIANWEN_BROWSER_DATA",
                os.path.join(os.path.expanduser("~"), ".qianwen_browser"),
            )
            qw_client = QianwenClient(headless=qw_headless, user_data_dir=qw_data_dir)
            try:
                await qw_client.start()
                _qianwen["client"] = qw_client
                log.info("Qianwen client ready")
            except Exception as e:
                log.warning("Qianwen client failed to start: %s", e)
                qw_client = None

        yield

        # Shutdown
        watchdog_task.cancel()
        client = _browser.pop("client", None)
        if client:
            await client.stop()
        qw = _qianwen.pop("client", None)
        if qw:
            await qw.stop()

    app = FastAPI(title="Doubao API", version="1.0.0", lifespan=lifespan)

    @app.exception_handler(HTTPException)
    async def _http_exc(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"message": exc.detail, "type": "api_error", "code": exc.status_code}},
        )

    @app.exception_handler(Exception)
    async def _unhandled_exc(request: Request, exc: Exception):
        log.exception("Unhandled exception")
        return JSONResponse(
            status_code=500,
            content={"error": {"message": str(exc), "type": "internal_error", "code": 500}},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    bucket = _TokenBucket(rpm_limit)

    # ── Auth helper ──

    def _check_auth(request: Request) -> None:
        if not api_key:
            return
        auth = request.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.startswith("Bearer ") else auth.strip()
        if not token:
            token = request.query_params.get("key", "").strip()
        if api_key == "any":
            if not token:
                raise HTTPException(status_code=401, detail="API key required")
            return
        if token != api_key:
            raise HTTPException(status_code=401, detail="Invalid API key")

    def _get_client() -> BrowserClient:
        client = _browser.get("client")
        if client is None:
            raise HTTPException(status_code=503, detail="Browser not initialized")
        if not client.is_ready:
            raise HTTPException(
                status_code=503,
                detail="SessionBox page is not authenticated; open the page in SessionBox and login manually.",
            )
        return client

    def _get_qianwen_client() -> QianwenClient:
        client = _qianwen.get("client")
        if client is None:
            raise HTTPException(
                status_code=503,
                detail="Qianwen client not available. Set QIANWEN_ENABLED=true.",
            )
        if not client.is_ready:
            raise HTTPException(status_code=503, detail="Qianwen client not ready")
        return client

    # ── Prompt extraction ──

    def _extract_prompt(messages: List[_Message]) -> str:
        """Extract text prompt from OpenAI-format messages."""
        parts: list[str] = []
        for msg in messages:
            if isinstance(msg.content, str):
                if len(messages) == 1:
                    parts.append(msg.content)
                else:
                    parts.append(f"[{msg.role}]: {msg.content}")
            elif isinstance(msg.content, list):
                for p in msg.content:
                    if isinstance(p, dict) and p.get("type") == "text":
                        text = p.get("text", "")
                        if text:
                            if len(messages) == 1:
                                parts.append(text)
                            else:
                                parts.append(f"[{msg.role}]: {text}")
        return "\n".join(parts)

    def _extract_prompt_and_file_refs(messages: List[_Message]) -> tuple[str, list[dict[str, Any]]]:
        """Extract text prompt and OpenAI-style file_url references."""
        parts: list[str] = []
        file_refs: list[dict[str, Any]] = []
        for msg in messages:
            if isinstance(msg.content, str):
                if len(messages) == 1:
                    parts.append(msg.content)
                else:
                    parts.append(f"[{msg.role}]: {msg.content}")
                continue
            if not isinstance(msg.content, list):
                continue
            for part in msg.content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text":
                    text = part.get("text", "")
                    if text:
                        if len(messages) == 1:
                            parts.append(text)
                        else:
                            parts.append(f"[{msg.role}]: {text}")
                elif part.get("type") == "file_url":
                    file_url = part.get("file_url", {})
                    if isinstance(file_url, str):
                        file_refs.append({"url": file_url})
                    elif isinstance(file_url, dict):
                        file_refs.append(file_url)
        return "\n".join(parts), file_refs

    async def _materialize_file_refs(client: BrowserClient, file_refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Resolve TOS/data/http file_url references to uploaded file metadata."""
        import base64
        import mimetypes
        from urllib.parse import urlparse
        files: list[dict[str, Any]] = []
        for file_ref in file_refs:
            url = str(file_ref.get("url", "")).strip()
            if not url:
                raise HTTPException(status_code=400, detail="file_url.url is required")
            name = file_ref.get("name") or "file"
            size = int(file_ref.get("size") or 0)
            if url.startswith("tos-"):
                files.append({"uri": url, "name": name, "size": size})
                continue
            if url.startswith("data:"):
                try:
                    header, encoded = url.split(",", 1)
                    file_data = base64.b64decode(encoded)
                except (ValueError, TypeError) as exc:
                    raise HTTPException(status_code=400, detail="Invalid data URI") from exc
                if name == "file":
                    mime_type = header[5:].split(";", 1)[0]
                    ext = mimetypes.guess_extension(mime_type) or ".txt"
                    name = f"upload{ext}"
                uploaded = await client.upload_file(file_data=file_data, filename=name)
                files.append({"uri": uploaded["uri"], "name": uploaded["name"], "size": uploaded["size"]})
                continue
            if url.startswith("http://") or url.startswith("https://"):
                parsed = urlparse(url)
                inferred_name = parsed.path.rsplit("/", 1)[-1] or "downloaded_file"
                if name == "file":
                    name = inferred_name
                async with httpx.AsyncClient(timeout=120) as http_client:
                    response = await http_client.get(url)
                    response.raise_for_status()
                    file_data = response.content
                uploaded = await client.upload_file(file_data=file_data, filename=name)
                files.append({"uri": uploaded["uri"], "name": uploaded["name"], "size": uploaded["size"]})
                continue
            raise HTTPException(status_code=400, detail=f"Unsupported file_url: {url[:80]}")
        return files

    # ── Request logging middleware ──

    @app.middleware("http")
    async def _log_requests(request: Request, call_next):
        path = request.url.path
        if path.startswith("/admin"):
            return JSONResponse(status_code=404, content={"error": {"message": "Admin endpoints have been removed", "type": "not_found", "code": 404}})
        if path.startswith("/auth"):
            return JSONResponse(status_code=410, content={"error": {"message": "Authentication is managed by SessionBox", "type": "gone", "code": 410}})
        start = time.time()
        response = await call_next(request)
        elapsed = round((time.time() - start) * 1000)
        _REQUEST_LOG.append({
            "ts": time.time(),
            "method": request.method,
            "path": path,
            "status": response.status_code,
            "ms": elapsed,
        })
        return response

    # ── Endpoints ──

    @app.get("/health")
    async def health():
        client = _browser.get("client")
        ready = client.is_ready if client else False
        result = {"status": "ok" if ready else "not_ready", "logged_in": ready}
        if client:
            result["consecutive_failures"] = client.consecutive_failures
            result["needs_captcha"] = client.needs_captcha
            result["last_error_code"] = client.last_error_code
        result["expert_degraded"] = _expert_tracker.is_degraded
        # Qianwen status
        qw = _qianwen.get("client")
        result["qianwen_ready"] = qw.is_ready if qw else False
        return result

    @app.get("/v1/models")
    async def list_models(request: Request):
        _check_auth(request)
        return {"object": "list", "data": ALL_MODELS}

    @app.post("/v1/sessionbox/page")
    async def select_sessionbox_page(request: Request):
        body = await request.json()
        client = await _select_sessionbox_page(str(body.get("page_id", "")))
        return {"page_id": client.page_id, "ready": client.is_ready}

    @app.post("/v1/chat/completions")
    async def chat_completions(body: ChatCompletionRequest, request: Request):
        _check_auth(request)

        # ── Route to Qianwen if model matches ──
        if body.model in QIANWEN_MODEL_NAMES:
            return await _handle_qianwen_chat(body, request)

        # ── Tool calling mode ──
        has_tools = bool(body.tools)
        if has_tools:
            # Use expert model for tool calling, with auto-fallback to think if degraded
            requested_deep_think = CHAT_MODELS["doubao-expert"]
            use_deep_think, model_name = _expert_tracker.get_effective_mode(requested_deep_think)
            # Convert messages with tool definitions injected
            messages_raw = [m.model_dump(exclude_none=True) for m in body.messages]
            prompt = convert_messages_with_tools(messages_raw, body.tools)
        else:
            use_deep_think = CHAT_MODELS.get(body.model)
            if use_deep_think is None:
                all_models = list(CHAT_MODELS.keys()) + list(QIANWEN_MODEL_NAMES)
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown model '{body.model}'. Available: {', '.join(all_models)}",
                )
            model_name = body.model
            # Allow enable_thinking or reasoning_effort to dynamically control thinking mode
            if body.enable_thinking is True or (body.reasoning_effort and body.reasoning_effort in ("medium", "high")):
                use_deep_think = 1 if use_deep_think != 3 else 3
            elif body.enable_thinking is False or (body.reasoning_effort and body.reasoning_effort == "none"):
                use_deep_think = 0

            prompt, file_refs = _extract_prompt_and_file_refs(body.messages)
            if not prompt:
                raise HTTPException(status_code=400, detail="No text content")

        await bucket.acquire()
        client = _get_client()

        # A verification decision can be returned without a visible modal in the cloned browser.
        if client.needs_captcha:
            if client.verification_retry_due():
                log.info("DOUBAO_DIAG %s", json.dumps({"event": "verification_retry",
                    "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "page_id": client.page_id}))
                client.clear_captcha()
            else:
                raise HTTPException(status_code=503,
                    detail="豆包要求验证 (710022004)，请在 SessionBox 对应页面确认账号能否正常发送消息；60 秒后可重试，详情见插件日志")

        # ── Request Dispatch Smoothing (anti-burst rate limit) ──
        global _last_dispatch_time
        async with _dispatch_lock:
            now = time.time()
            gap = now - _last_dispatch_time
            if gap < _MIN_DISPATCH_INTERVAL:
                await asyncio.sleep(_MIN_DISPATCH_INTERVAL - gap)
            _last_dispatch_time = time.time()

        request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"

        # Determine whether to auto-delete ephemeral conversation after completion (Scheme B: 即用即焚)
        header_del = request.headers.get("x-auto-delete")
        if header_del is not None:
            auto_delete = header_del.lower() in ("true", "1", "yes")
        else:
            auto_delete = _auto_delete_conv and (not body.conversation_id)

        if body.stream:
            if not has_tools:
                _, file_refs_check = _extract_prompt_and_file_refs(body.messages)
                if file_refs_check:
                    raise HTTPException(
                        status_code=400,
                        detail="file_url attachments are currently supported for non-streaming requests only",
                    )
            return StreamingResponse(
                _stream_chat(client, prompt, use_deep_think, request_id, model_name,
                             conversation_id=body.conversation_id, bot_id=body.bot_id,
                             has_tools=has_tools,
                             messages_for_counting=body.messages,
                             auto_delete=auto_delete),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        # Non-streaming: collect all chunks with thinking state machine
        try:
            if has_tools:
                # Tool calling non-streaming path
                message = await _collect_chat_response(
                    client, prompt, use_deep_think,
                    conversation_id=body.conversation_id, bot_id=body.bot_id,
                )
                # Report to expert tracker (detect silent downgrade)
                had_reasoning = bool(message.get("reasoning_content"))
                if use_deep_think >= 1:
                    _expert_tracker.report_response(had_reasoning)
                # Check if response contains tool calls
                content = message.get("content", "")
                parsed_tools = parse_tool_calls_xml(content) if content else None
                if parsed_tools:
                    message = {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": parsed_tools,
                    }
                    finish_reason = "tool_calls"
                else:
                    finish_reason = "stop"
            elif file_refs:
                files = await _materialize_file_refs(client, file_refs)
                result = await client.chat_with_file(
                    text=prompt,
                    file_uri=files,
                    file_name=files[0]["name"],
                    file_size=files[0]["size"],
                    use_deep_think=use_deep_think,
                )
                message = {"role": "assistant", "content": result["text"]}
                finish_reason = "stop"
            else:
                message = await _collect_chat_response(
                    client, prompt, use_deep_think,
                    conversation_id=body.conversation_id, bot_id=body.bot_id,
                )
                finish_reason = "stop"
        except UpstreamVerificationRequired as exc:
            raise HTTPException(status_code=503, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        # max_tokens truncation (non-streaming only)
        content = message.get("content") or ""
        if body.max_tokens and content and not message.get("tool_calls"):
            max_chars = int(body.max_tokens * 2.5)  # rough tokens->chars
            if len(content) > max_chars:
                message["content"] = content[:max_chars]
                finish_reason = "length"

        # Token counting
        prompt_tokens = count_messages_tokens(
            [m.model_dump(exclude_none=True) for m in body.messages]
        )
        completion_content = message.get("content") or ""
        reasoning_content = message.get("reasoning_content") or ""
        completion_tokens = count_tokens(completion_content + reasoning_content)

        resp_data = {
            "id": request_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_name,
            "choices": [{
                "index": 0,
                "message": message,
                "finish_reason": finish_reason,
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }
        if message.get("conversation_id"):
            resp_data["conversation_id"] = message["conversation_id"]

        # Auto-delete ephemeral conversation in background (即用即焚 / Scheme B)
        if auto_delete and message.get("conversation_id"):
            asyncio.create_task(_delayed_delete(client, message["conversation_id"]))

        return JSONResponse(resp_data)

    # ------------------------------------------------------------------
    # Qianwen chat handler
    # ------------------------------------------------------------------

    async def _handle_qianwen_chat(body: ChatCompletionRequest, request: Request):
        """Handle chat completions routed to Qianwen."""
        qw_client = _get_qianwen_client()
        model_config = QIANWEN_MODELS.get(body.model, {"model": "Qwen", "deep_search": "0"})
        qw_model = model_config["model"]
        deep_search = model_config["deep_search"]
        # Support enable_thinking parameter (like official API)
        if body.enable_thinking or (body.reasoning_effort and body.reasoning_effort != "none"):
            deep_search = "1"
        # NOTE: tools + thinking mode IS supported — tool output appears in think_content
        # Do NOT force deep_search="0" when tools are present
        request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"

        messages_raw = [m.model_dump(exclude_none=True) for m in body.messages]

        # ── Topic isolation: discard irrelevant history on topic change ──
        messages_raw = filter_history_by_topic(messages_raw)

        # ── Tool calling: inject tool definitions into prompt ──
        has_tools = bool(body.tools)
        if has_tools:
            # Log input breakdown for debugging
            num_tools = len(body.tools) if body.tools else 0
            sys_msg = next((m for m in messages_raw if m.get("role") == "system"), None)
            sys_len = len(sys_msg.get("content", "")) if sys_msg else 0
            tool_msgs = [m for m in messages_raw if m.get("role") == "tool"]
            log.info("Qianwen input: %d msgs, %d tools, sys=%d chars, %d tool_results",
                     len(messages_raw), num_tools, sys_len, len(tool_msgs))

            # Obfuscate tool names if enabled (avoids Qwen built-in validation)
            tools_for_prompt = _tool_obfuscator.obfuscate_tools(body.tools)
            prompt = convert_messages_with_tools(messages_raw, tools_for_prompt)
            log.info("Qianwen prompt after flatten: %d chars (%dKB)",
                     len(prompt), len(prompt) // 1024)
            if len(prompt) > 50000:
                log.warning("Qianwen prompt OVER LIMIT: %d chars — truncation active", len(prompt))
            # Wrap as single user message for Qianwen
            messages_for_qw = [{"role": "user", "content": prompt}]
        else:
            messages_for_qw = messages_raw

        if body.stream:
            return StreamingResponse(
                _stream_qianwen_chat(
                    qw_client, messages_for_qw, qw_model, deep_search,
                    request_id, body.model, has_tools=has_tools,
                ),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        else:
            # Non-streaming
            try:
                result = await qw_client.chat(messages_for_qw, qw_model, deep_search)
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

            import re as _re
            _think_prefix_re = _re.compile(r"^\[?\(multimodal_chat_think_\d+\)\]?\s*")

            content = result["content"]
            think_content = result.get("think_content", "")
            usage = result.get("usage", {})

            # Strip thinking prefix from content
            content = _think_prefix_re.sub("", content).strip()

            # Check for tool calls in think_content first, then content
            if has_tools:
                source = think_content if think_content else content
                parsed = parse_tool_calls_xml(source)
                if not parsed and content:
                    parsed = parse_tool_calls_xml(content)
                
                # Auto-continue if tool call was truncated
                if not parsed and detect_truncated_tool_call(source or content):
                    log.info("Detected truncated tool_call, attempting continuation...")
                    cont_prompt = build_continuation_prompt(source or content)
                    cont_messages = [{"role": "user", "content": cont_prompt}]
                    try:
                        cont_result = await qw_client.chat(cont_messages, qw_model, deep_search)
                        cont_content = cont_result["content"]
                        cont_content = _think_prefix_re.sub("", cont_content).strip()
                        # Deduplicate overlap before combining
                        combined = deduplicate_continuation(source or content, cont_content)
                        parsed = parse_tool_calls_xml(combined)
                        if parsed:
                            log.info("Continuation successful, got %d tool calls", len(parsed))
                    except Exception as e:
                        log.warning("Continuation failed: %s", e)
                
                if parsed:
                    # Deobfuscate tool names back to original
                    parsed = _tool_obfuscator.deobfuscate_tool_calls(parsed)
                    # Coerce parameter names to match schema
                    parsed = coerce_tool_arguments(parsed)
                    return JSONResponse({
                        "id": request_id,
                        "object": "chat.completion",
                        "created": int(time.time()),
                        "model": result.get("model", body.model),
                        "choices": [{
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": None,
                                "tool_calls": parsed,
                            },
                            "finish_reason": "tool_calls",
                        }],
                        "usage": {
                            "prompt_tokens": usage.get("prompt_tokens", 0),
                            "completion_tokens": usage.get("completion_tokens", 0),
                            "total_tokens": usage.get("total_tokens", 0),
                        },
                    })

            # Build message with optional reasoning_content
            message: Dict[str, Any] = {"role": "assistant", "content": content}
            if think_content and deep_search == "1":
                message["reasoning_content"] = think_content

            return JSONResponse({
                "id": request_id,
                "object": "chat.completion",
                "created": int(time.time()),
                "model": result.get("model", body.model),
                "choices": [{
                    "index": 0,
                    "message": message,
                    "finish_reason": "stop",
                }],
                "usage": {
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                },
            })

    async def _stream_qianwen_chat(
        qw_client: QianwenClient,
        messages: list,
        model: str,
        deep_search: str,
        request_id: str,
        model_name: str,
        *,
        has_tools: bool = False,
    ):
        """Generate OpenAI-compatible SSE stream from Qianwen's cumulative format.

        Handles:
        - Normal content streaming (delta computation from cumulative)
        - Thinking mode: emits reasoning_content deltas from think_content
        - Tool calling: detects <tool_call> in content OR think_content
        """
        import re as _re

        prev_content = ""
        prev_think = ""
        tool_mode = False
        is_thinking = (deep_search == "1")
        # Regex to strip [(multimodal_chat_think_N)] prefix
        _think_prefix_re = _re.compile(r"^\[?\(multimodal_chat_think_\d+\)\]?\s*")

        def _make_chunk(delta: dict, finish_reason=None):
            return {
                "id": request_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": model_name,
                "choices": [{
                    "index": 0,
                    "delta": delta,
                    "finish_reason": finish_reason,
                }],
            }

        # First chunk: role
        chunk = _make_chunk({"role": "assistant", "content": ""})
        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        full_content = ""
        full_think = ""

        try:
            async for event in qw_client.chat_stream(messages, model, deep_search):
                if event.get("error"):
                    err_chunk = _make_chunk(
                        {"content": f"[Error: {event.get('message', 'unknown')}]"}
                    )
                    yield f"data: {json.dumps(err_chunk, ensure_ascii=False)}\n\n"
                    break

                data = event.get("data", {})
                msgs = data.get("messages", [])
                for msg in msgs:
                    if msg.get("mime_type") != "multi_load/iframe":
                        continue
                    current = msg.get("content", "")
                    if not current:
                        continue

                    # Extract think_content from meta_data if present
                    think_content = ""
                    meta = msg.get("meta_data", {})
                    multi_load = meta.get("multi_load", [])
                    if multi_load and isinstance(multi_load, list):
                        ml_content = multi_load[0].get("content", {})
                        if isinstance(ml_content, dict):
                            think_content = ml_content.get("think_content", "")

                    # Strip thinking prefix from main content
                    clean_content = _think_prefix_re.sub("", current).strip()
                    full_content = clean_content

                    if tool_mode:
                        # Buffering for tool call completion
                        full_think = think_content
                        continue

                    # Check for tool calls in think_content or main content
                    if has_tools:
                        check_text = think_content or clean_content
                        if is_tool_call_start(check_text.strip()):
                            tool_mode = True
                            full_think = think_content
                            continue

                    # Emit reasoning_content delta (thinking mode)
                    if is_thinking and think_content:
                        if len(think_content) > len(prev_think):
                            think_delta = think_content[len(prev_think):]
                            prev_think = think_content
                            full_think = think_content
                            delta_chunk = _make_chunk({
                                "reasoning_content": think_delta
                            })
                            yield f"data: {json.dumps(delta_chunk, ensure_ascii=False)}\n\n"

                    # Emit content delta
                    if len(clean_content) > len(prev_content):
                        delta_text = clean_content[len(prev_content):]
                        prev_content = clean_content
                        delta_chunk = _make_chunk({"content": delta_text})
                        yield f"data: {json.dumps(delta_chunk, ensure_ascii=False)}\n\n"

        except Exception as e:
            log.error("Qianwen stream error: %s", e)
            err_chunk = _make_chunk({"content": f"[Stream error: {e}]"})
            yield f"data: {json.dumps(err_chunk, ensure_ascii=False)}\n\n"

        # After stream ends: check for tool calls in both content and think_content
        if has_tools and (tool_mode or full_think or full_content):
            # Try think_content first (thinking mode puts tool calls there)
            source = full_think if full_think else full_content
            parsed = parse_tool_calls_xml(source)
            # Also try main content if think didn't have it
            if not parsed and full_content:
                parsed = parse_tool_calls_xml(full_content)
            
            # Auto-continue if truncated
            if not parsed and detect_truncated_tool_call(source or full_content):
                log.info("Stream: detected truncated tool_call, attempting continuation...")
                cont_prompt = build_continuation_prompt(source or full_content)
                try:
                    cont_messages = [{"role": "user", "content": cont_prompt}]
                    cont_result = await qw_client.chat(cont_messages, model, deep_search)
                    cont_content = cont_result.get("content", "")
                    # Deduplicate overlap before combining
                    combined = deduplicate_continuation(source or full_content, cont_content)
                    parsed = parse_tool_calls_xml(combined)
                    if parsed:
                        log.info("Stream continuation got %d tool calls", len(parsed))
                except Exception as e:
                    log.warning("Stream continuation failed: %s", e)
            
            if parsed:
                # Deobfuscate tool names back to original
                parsed = _tool_obfuscator.deobfuscate_tool_calls(parsed)
                # Coerce parameter names to match schema
                parsed = coerce_tool_arguments(parsed)
                for idx, tc in enumerate(parsed):
                    tc_delta = {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "index": idx,
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["function"]["name"],
                                "arguments": tc["function"]["arguments"],
                            },
                        }],
                    }
                    yield f"data: {json.dumps(_make_chunk(tc_delta), ensure_ascii=False)}\n\n"
                final_chunk = _make_chunk({}, finish_reason="tool_calls")
                yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
                return

        # Normal finish
        final_chunk = _make_chunk({}, finish_reason="stop")
        yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    @app.post("/v1/images/generations")
    async def image_generations(body: ImageGenerationRequest, request: Request):
        _check_auth(request)
        await bucket.acquire()
        client = _get_client()

        ratio = body.ratio or _size_to_ratio(body.size)

        try:
            result = await client.generate_image(
                prompt=body.prompt,
                ratio=ratio,
                ref_image_key=body.ref_image_key,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        images = result.get("images", [])
        if not images:
            raise HTTPException(
                status_code=502, detail="No images generated"
            )

        data = []
        for img in images:
            data.append({
                "url": img["url"],
                "revised_prompt": body.prompt,
            })

        return JSONResponse({
            "created": int(time.time()),
            "data": data,
        })


    @app.post("/v1/audio/generations")
    async def audio_generations(request: Request):
        _check_auth(request)
        await bucket.acquire()
        client = _get_client()

        body = await request.json()
        prompt = body.get("prompt", "")
        if not prompt:
            raise HTTPException(status_code=400, detail="Missing prompt")

        try:
            result = await client.generate_music(
                prompt=prompt,
                lyric=body.get("lyric"),
                genre=body.get("genre"),
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        tracks = result.get("tracks", [])
        if not tracks:
            raise HTTPException(
                status_code=502, detail="No music tracks generated"
            )

        return JSONResponse({
            "created": int(time.time()),
            "data": tracks,
        })

    @app.post("/v1/video/generations")
    async def video_generations(request: Request):
        _check_auth(request)
        await bucket.acquire()
        client = _get_client()

        body = await request.json()
        prompt = body.get("prompt", "")
        if not prompt:
            raise HTTPException(status_code=400, detail="Missing prompt")

        ratio = body.get("ratio") or body.get("size")
        if ratio and "x" in str(ratio):
            ratio = _size_to_ratio(ratio)

        ref_image_url = body.get("ref_image_url")

        try:
            result = await client.generate_video_via_page(
                prompt=prompt, ref_image_url=ref_image_url,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        videos = result.get("videos", [])
        msg = result.get("message", "")
        if not videos and msg:
            return JSONResponse({"created": int(time.time()), "data": [], "message": msg})
        if not videos:
            raise HTTPException(status_code=502, detail="No videos generated")

        return JSONResponse({
            "created": int(time.time()),
            "data": videos,
        })

    @app.post("/v1/files")
    async def upload_file(request: Request):
        """Upload a file. Returns file metadata for use in chat."""
        _check_auth(request)
        await bucket.acquire()
        client = _get_client()

        form = await request.form()
        file_field = form.get("file")
        if not file_field:
            raise HTTPException(status_code=400, detail="Missing file field")

        file_data = await file_field.read()
        filename = file_field.filename or "file.txt"

        try:
            result = await client.upload_file(file_data, filename)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        return JSONResponse({
            "id": result["uri"],
            "object": "file",
            "filename": result["name"],
            "bytes": result["size"],
            "uri": result["uri"],
            "file_type": result.get("file_type", ""),
            "purpose": "assistants",
        })


    @app.get("/v1/files/download")
    async def file_download(request: Request, uri: str, expire: int = 3600):
        _check_auth(request)
        await bucket.acquire()
        client = _get_client()
        try:
            url = await client.get_file_download_url(uri=uri, expire_seconds=expire)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        return JSONResponse({"url": url, "uri": uri, "expires_in": expire})

    @app.post("/v1/images/upload")
    async def upload_image(request: Request):
        _check_auth(request)
        await bucket.acquire()
        client = _get_client()
        form = await request.form()
        upload = form.get("file") or form.get("image")
        if not upload:
            raise HTTPException(status_code=400, detail="Missing file field")
        image_data = await upload.read()
        filename = upload.filename or "image.png"
        try:
            result = await client.upload_image(image_bytes=image_data, filename=filename)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        return JSONResponse({
            "uri": result["uri"],
            "cdn_url": result["cdn_url"],
            "url": result["cdn_url"],
            "name": result["name"],
            "format": result["format"],
            "width": result["width"],
            "height": result["height"],
        })

    @app.post("/v1/chat/completions/with-file")
    async def chat_with_file(request: Request):
        """Chat with file attachment. Body: {file_id, prompt, model}."""
        _check_auth(request)
        await bucket.acquire()
        client = _get_client()

        body = await request.json()
        file_id = body.get("file_id", "")
        prompt = body.get("prompt", "")
        file_name = body.get("file_name", "file.txt")
        file_size = body.get("file_size", 0)
        model = body.get("model", "doubao")

        if not file_id or not prompt:
            raise HTTPException(status_code=400, detail="Missing file_id or prompt")

        use_deep_think = CHAT_MODELS.get(model, 0)

        try:
            result = await client.chat_with_file(
                text=prompt,
                file_uri=file_id,
                file_name=file_name,
                file_size=file_size,
                use_deep_think=use_deep_think,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
        return JSONResponse({
            "id": request_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": result["text"]},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        })

    async def _delayed_delete(client: BrowserClient, conversation_id: str, delay: float = 0.8):
        """Asynchronously delete ephemeral conversation in background (即用即焚)."""
        try:
            if delay > 0:
                await asyncio.sleep(delay)
            await client.delete_conversation(conversation_id)
        except Exception as exc:
            log.warning("Delayed delete failed for %s: %s", conversation_id, exc)

    async def _collect_chat_response(
        client: BrowserClient,
        prompt: str,
        use_deep_think: int,
        *,
        conversation_id: Optional[str] = None,
        bot_id: Optional[str] = None,
    ) -> dict:
        """Collect full chat response with thinking separation.

        Returns an OpenAI message dict:
        {"role": "assistant", "content": "...", "reasoning_content": "..."}
        reasoning_content is only present when thinking was detected.
        """
        thinking_count = 0
        in_thinking = False
        thinking_parts: list = []
        content_parts: list = []
        result_conversation_id: Optional[str] = None

        def _iter_blocks(data: dict):
            for patch in data.get("patch_op", []):
                pv = patch.get("patch_value", {})
                yield from pv.get("content_block", [])
            dc = data.get("content", {})
            if isinstance(dc, dict):
                yield from dc.get("content_block", [])

        async for event in client.chat_completion(
            prompt, use_deep_think=use_deep_think,
            conversation_id=conversation_id or None,
            bot_id=bot_id or None,
        ):
            if event.get("error"):
                raise RuntimeError(
                    f"API error {event.get('status')}: "
                    f"{event.get('body', '')[:200]}"
                )
            if event.get("error_code"):
                code = event.get("error_code", 0)
                msg = event.get("error_msg", "")
                details = _safe_error_context(event)
                log.error("DOUBAO_DIAG %s", json.dumps({"event": "chat_error",
                    "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "page_id": client.page_id, "headless": client.headless,
                    **details}, ensure_ascii=False))
                client.record_failure(code)
                if code == 710022004 and details.get("decision_type") == "verify":
                    raise UpstreamVerificationRequired("豆包要求验证 (710022004)，请在 SessionBox 对应页面确认账号能否正常发送消息；60 秒后可重试，详情见插件日志")
                raise RuntimeError(f"Error code={code}: {msg}")

            # Extract conversation_id for multi-turn
            if not result_conversation_id:
                cid = client.extract_conversation_id(event)
                if cid and cid != "0":
                    result_conversation_id = cid

            event_type = event.get("_event", "")

            # CHUNK_DELTA
            if (
                event_type == "CHUNK_DELTA"
                and "text" in event
                and isinstance(event.get("text"), str)
                and event["text"]
            ):
                if in_thinking:
                    thinking_parts.append(event["text"])
                else:
                    content_parts.append(event["text"])
                continue

            # content_block
            has_content_block = False
            for cb in _iter_blocks(event):
                has_content_block = True
                bt = cb.get("block_type", 0)
                block_content = cb.get("content", {})

                if bt == 10040:
                    thinking_count += 1
                    in_thinking = (thinking_count == 1)
                elif bt == 10000:
                    tb = block_content.get("text_block", {})
                    if isinstance(tb, dict) and tb.get("text"):
                        if in_thinking:
                            thinking_parts.append(tb["text"])
                        else:
                            content_parts.append(tb["text"])

            # patch_op content string fallback
            if not has_content_block:
                for patch in event.get("patch_op", []):
                    pv = patch.get("patch_value", {})
                    if isinstance(pv, dict) and "content" in pv:
                        content_str = pv.get("content", "")
                        if isinstance(content_str, str) and content_str:
                            try:
                                obj = json.loads(content_str)
                                t = obj.get("text", "")
                                if t:
                                    if in_thinking:
                                        thinking_parts.append(t)
                                    else:
                                        content_parts.append(t)
                            except (json.JSONDecodeError, TypeError):
                                pass

        message: dict = {"role": "assistant", "content": "".join(content_parts)}
        if thinking_parts:
            message["reasoning_content"] = "".join(thinking_parts)
        if result_conversation_id:
            message["conversation_id"] = result_conversation_id
        client.record_success()
        return message

    async def _stream_chat(
        client: BrowserClient,
        prompt: str,
        use_deep_think: int,
        request_id: str,
        model: str,
        *,
        conversation_id: Optional[str] = None,
        bot_id: Optional[str] = None,
        has_tools: bool = False,
        messages_for_counting: Optional[list] = None,
        auto_delete: bool = False,
    ):
        """Generate real-time SSE stream in OpenAI format via httpx streaming.

        Thinking state machine (mirrors old client.py logic):
        - block_type=10040 toggles thinking mode (1st=enter, 2nd=exit)
        - Text between markers -> delta.reasoning_content
        - Text after exit -> delta.content
        - block_type=10025 -> delta.search_results (incremental)
        - error_code in event -> emit error and stop
        """
        thinking_count = 0
        in_thinking = False
        had_reasoning_content = False  # Track if any reasoning was emitted
        stream_content_chars = 0  # Track total output chars for token estimation
        # Track last emitted result count per block_id for incremental updates
        search_last_count: dict = {}
        result_conversation_id: Optional[str] = None
        # Tool calling state
        tool_buffer = ""  # accumulates text when tool call detected
        tool_mode = False  # True when we're buffering potential tool call XML
        emitted_tool_calls = False  # True once we've emitted tool_calls chunks

        def _make_chunk(delta: dict, finish_reason=None):
            return {
                "id": request_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": delta,
                    "finish_reason": finish_reason,
                }],
            }

        def _iter_blocks(data: dict):
            """Yield content_block dicts from patch_op or top-level content."""
            for patch in data.get("patch_op", []):
                pv = patch.get("patch_value", {})
                yield from pv.get("content_block", [])
            dc = data.get("content", {})
            if isinstance(dc, dict):
                yield from dc.get("content_block", [])

        try:
            async for event in client.chat_completion(
                prompt, use_deep_think=use_deep_think,
                conversation_id=conversation_id or None,
                bot_id=bot_id or None,
            ):
                if event.get("error"):
                    chunk = _make_chunk(
                        {"content": f"[Error {event.get('status')}]"}
                    )
                    yield f"data: {json.dumps(chunk)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                event_type = event.get("_event", "")

                # --- Extract conversation_id for multi-turn ---
                if not result_conversation_id:
                    cid = client.extract_conversation_id(event)
                    if cid and cid != "0":
                        result_conversation_id = cid

                # --- error_code handling (risk control, session expired) ---
                if event_type == "STREAM_ERROR" or event.get("error_code"):
                    code = event.get("error_code", 0)
                    msg = event.get("error_msg", "unknown error")
                    details = _safe_error_context(event)
                    log.error("DOUBAO_DIAG %s", json.dumps({"event": "chat_stream_error",
                        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "page_id": client.page_id, "headless": client.headless,
                        **details}, ensure_ascii=False))
                    client.record_failure(code)
                    if code == 710022004 and details.get("decision_type") == "verify":
                        msg = "豆包要求验证，请在 SessionBox 对应页面确认账号能否正常发送消息；详情见插件日志"
                    chunk = _make_chunk(
                        {"content": f"[Error code={code}: {msg}]"}
                    )
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                # --- CHUNK_DELTA: compact {"text": "..."} (highest priority) ---
                if (
                    event_type == "CHUNK_DELTA"
                    and "text" in event
                    and isinstance(event.get("text"), str)
                    and event["text"]
                ):
                    t = event["text"]
                    # Tool calling: buffer text to detect XML tool_calls
                    if has_tools and not in_thinking:
                        tool_buffer += t
                        if not tool_mode and is_tool_call_start(tool_buffer):
                            tool_mode = True
                        if tool_mode:
                            # Check if we have complete tool calls
                            if has_complete_tool_calls(tool_buffer):
                                # Parse and emit as tool_calls
                                parsed = parse_tool_calls_xml(tool_buffer)
                                if parsed:
                                    # Emit tool_calls in OpenAI streaming format
                                    for idx, tc in enumerate(parsed):
                                        # First chunk: role + tool_call with function name
                                        delta_tc = {
                                            "role": "assistant",
                                            "content": None,
                                            "tool_calls": [{
                                                "index": idx,
                                                "id": tc["id"],
                                                "type": "function",
                                                "function": {
                                                    "name": tc["function"]["name"],
                                                    "arguments": "",
                                                },
                                            }],
                                        }
                                        chunk = _make_chunk(delta_tc)
                                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                        # Second chunk: arguments content
                                        delta_args = {
                                            "tool_calls": [{
                                                "index": idx,
                                                "function": {
                                                    "arguments": tc["function"]["arguments"],
                                                },
                                            }],
                                        }
                                        chunk = _make_chunk(delta_args)
                                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                    tool_buffer = ""
                                    tool_mode = False
                                    emitted_tool_calls = True
                                else:
                                    # XML complete but parse failed — flush as content
                                    log.warning("Tool call XML parse failed, flushing as content")
                                    delta = {"role": "assistant", "content": tool_buffer}
                                    chunk = _make_chunk(delta)
                                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                    tool_buffer = ""
                                    tool_mode = False
                            continue  # don't emit raw text while in tool mode
                        else:
                            # Not a tool call start — flush buffer as normal content
                            if len(tool_buffer) > 20 and not is_tool_call_start(tool_buffer):
                                delta = {"role": "assistant", "content": tool_buffer}
                                chunk = _make_chunk(delta)
                                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                tool_buffer = ""
                            elif not tool_buffer.strip().startswith("<"):
                                # Definitely not XML, flush immediately
                                delta = {"role": "assistant", "content": tool_buffer}
                                chunk = _make_chunk(delta)
                                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                tool_buffer = ""
                            continue
                    # Normal (non-tool) path
                    if in_thinking:
                        delta = {"reasoning_content": t}
                        had_reasoning_content = True
                    else:
                        delta = {"role": "assistant", "content": t}
                    stream_content_chars += len(t)
                    chunk = _make_chunk(delta)
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                    continue

                # --- Process content_block arrays for markers & search ---
                has_content_block = False
                for cb in _iter_blocks(event):
                    has_content_block = True
                    bt = cb.get("block_type", 0)
                    block_content = cb.get("content", {})

                    if bt == 10040:
                        thinking_count += 1
                        in_thinking = (thinking_count == 1)
                        continue

                    if bt == 10025:
                        sqrb = block_content.get(
                            "search_query_result_block", {}
                        )
                        if sqrb:
                            block_id = cb.get("block_id", "")
                            queries = sqrb.get("queries", [])
                            results = sqrb.get("results", [])
                            parsed = [
                                {
                                    "title": r.get("text_card", {}).get("title", ""),
                                    "url": r.get("text_card", {}).get("url", ""),
                                    "summary": r.get("text_card", {}).get("summary", ""),
                                    "source": r.get("text_card", {}).get("source_name", ""),
                                }
                                for r in results if r.get("text_card")
                            ]
                            prev = search_last_count.get(block_id, 0)
                            if (parsed and len(parsed) > prev) or (queries and prev == 0):
                                search_last_count[block_id] = len(parsed)
                                chunk = _make_chunk({
                                    "search_results": {
                                        "queries": queries,
                                        "results": parsed,
                                        "summary": f"搜索 {len(queries)} 个关键词，参考 {len(parsed)} 篇资料",
                                    },
                                })
                                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        continue

                    if bt == 10000:
                        tb = block_content.get("text_block", {})
                        if isinstance(tb, dict) and tb.get("text"):
                            t = tb["text"]
                            # Tool calling: buffer text for XML detection
                            if has_tools and not in_thinking:
                                tool_buffer += t
                                if not tool_mode and is_tool_call_start(tool_buffer):
                                    tool_mode = True
                                if tool_mode:
                                    if has_complete_tool_calls(tool_buffer):
                                        parsed = parse_tool_calls_xml(tool_buffer)
                                        if parsed:
                                            for idx, tc in enumerate(parsed):
                                                delta_tc = {
                                                    "role": "assistant", "content": None,
                                                    "tool_calls": [{"index": idx, "id": tc["id"], "type": "function",
                                                        "function": {"name": tc["function"]["name"], "arguments": ""}}],
                                                }
                                                chunk = _make_chunk(delta_tc)
                                                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                                delta_args = {"tool_calls": [{"index": idx,
                                                    "function": {"arguments": tc["function"]["arguments"]}}]}
                                                chunk = _make_chunk(delta_args)
                                                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                            tool_buffer = ""
                                            tool_mode = False
                                            emitted_tool_calls = True
                                        else:
                                            # XML complete but parse failed
                                            delta = {"role": "assistant", "content": tool_buffer}
                                            chunk = _make_chunk(delta)
                                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                            tool_buffer = ""
                                            tool_mode = False
                                elif len(tool_buffer) > 20 and not is_tool_call_start(tool_buffer):
                                    delta = {"role": "assistant", "content": tool_buffer}
                                    chunk = _make_chunk(delta)
                                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                    tool_buffer = ""
                                continue
                            if in_thinking:
                                delta = {"reasoning_content": t}
                                had_reasoning_content = True
                            else:
                                delta = {"role": "assistant", "content": t}
                            stream_content_chars += len(t)
                            chunk = _make_chunk(delta)
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        continue

                # --- patch_op content string (only if no content_block found) ---
                if not has_content_block:
                    for patch in event.get("patch_op", []):
                        pv = patch.get("patch_value", {})
                        if isinstance(pv, dict) and "content" in pv:
                            content_str = pv.get("content", "")
                            if isinstance(content_str, str) and content_str:
                                try:
                                    content_obj = json.loads(content_str)
                                    t = content_obj.get("text", "")
                                    if t:
                                        if in_thinking:
                                            delta = {"reasoning_content": t}
                                            had_reasoning_content = True
                                        else:
                                            delta = {"role": "assistant", "content": t}
                                        chunk = _make_chunk(delta)
                                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                                except (json.JSONDecodeError, TypeError):
                                    pass

        except Exception as exc:
            log.error("Stream error: %s", exc)
            chunk = _make_chunk({"content": f"[Error: {exc}]"})
            yield f"data: {json.dumps(chunk)}\n\n"

        # Flush any remaining tool buffer
        if tool_buffer:
            if tool_mode and has_complete_tool_calls(tool_buffer):
                parsed = parse_tool_calls_xml(tool_buffer)
                if parsed:
                    for idx, tc in enumerate(parsed):
                        delta_tc = {
                            "role": "assistant", "content": None,
                            "tool_calls": [{"index": idx, "id": tc["id"], "type": "function",
                                "function": {"name": tc["function"]["name"], "arguments": ""}}],
                        }
                        chunk = _make_chunk(delta_tc)
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        delta_args = {"tool_calls": [{"index": idx,
                            "function": {"arguments": tc["function"]["arguments"]}}]}
                        chunk = _make_chunk(delta_args)
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                    emitted_tool_calls = True
                else:
                    # Parse failed — flush as content
                    delta = {"role": "assistant", "content": tool_buffer}
                    chunk = _make_chunk(delta)
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            elif tool_buffer.strip():
                # Emit as regular content
                delta = {"role": "assistant", "content": tool_buffer}
                chunk = _make_chunk(delta)
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        # Final chunk with usage
        client.record_success()
        # Report to expert tracker for degradation detection
        if has_tools and use_deep_think >= 1:
            _expert_tracker.report_response(had_reasoning_content)

        # Estimate token usage
        prompt_tokens = 0
        if messages_for_counting:
            prompt_tokens = count_messages_tokens(
                [m.model_dump(exclude_none=True) for m in messages_for_counting]
            )
        completion_tokens = int(stream_content_chars / 2.5 * SAFETY_FACTOR) if stream_content_chars else 0

        final_delta: dict = {}
        if result_conversation_id:
            final_delta["conversation_id"] = result_conversation_id
        final_chunk = _make_chunk(final_delta, 'tool_calls' if emitted_tool_calls else 'stop')
        final_chunk["usage"] = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        }
        yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

        # Ephemeral conversation auto-delete (Scheme B: 即用即焚)
        if auto_delete and result_conversation_id:
            asyncio.create_task(_delayed_delete(client, result_conversation_id))

    # ── Admin Dashboard & Auth ──

    @app.get("/admin", response_class=HTMLResponse)
    async def admin_dashboard(request: Request):
        raise HTTPException(status_code=404, detail="Admin page has been removed")

    @app.get("/auth")
    async def auth_redirect(request: Request):
        raise HTTPException(status_code=410, detail="Authentication is managed by SessionBox")

    @app.get("/admin/api/system")
    async def admin_system(request: Request):
        """Return system information."""
        _check_auth(request)
        import platform
        import sys
        uptime = int(time.time() - _SERVER_START_TIME)
        return JSONResponse({
            "python_version": sys.version,
            "platform": platform.platform(),
            "uptime_seconds": uptime,
            "rpm_limit": rpm_limit,
            "host": os.environ.get("DOUBAO_HOST", "0.0.0.0"),
            "port": int(os.environ.get("DOUBAO_PORT", "9090")),
            "models": {
                "chat": list(CHAT_MODELS.keys()),
                "image": ["doubao-image"],
                "video": ["doubao-video"],
                "audio": ["doubao-music"],
            },
            "auto_delete_conv": _auto_delete_conv,
        })

    @app.get("/admin/api/logs")
    async def admin_logs(request: Request):
        """Return recent request logs from ring buffer."""
        _check_auth(request)
        return JSONResponse(list(_REQUEST_LOG))

    @app.get("/admin/api/cookies")
    async def admin_cookies(request: Request):
        """Return current browser cookies."""
        _check_auth(request)
        client = _browser.get("client")
        if client is None or client._context is None:
            return JSONResponse({"cookies": [], "total": 0})
        try:
            cookies = await client._context.cookies("https://www.doubao.com")
            cookies_list = [
                {"name": c["name"], "value": c["value"], "length": len(c["value"])}
                for c in cookies
            ]
            return JSONResponse({"cookies": cookies_list, "total": len(cookies_list)})
        except Exception:
            return JSONResponse({"cookies": [], "total": 0})

    @app.post("/admin/api/cookies/import")
    async def admin_cookies_import(request: Request):
        """Import cookie string or dict into browser context."""
        _check_auth(request)
        client = _browser.get("client")
        if client is None:
            raise HTTPException(status_code=503, detail="Browser not initialized")
        body = await request.json()
        raw = body.get("cookies", "")
        cookie_dict = {}
        if isinstance(raw, dict):
            cookie_dict = raw
        elif isinstance(raw, str):
            raw_str = raw.strip()
            if "=" not in raw_str and len(raw_str) > 10:
                cookie_dict["sessionid"] = raw_str
            else:
                for part in raw_str.split(";"):
                    part = part.strip()
                    if not part or "=" not in part:
                        continue
                    k, v = part.split("=", 1)
                    cookie_dict[k.strip()] = v.strip()

        ok = await client.inject_cookies_and_reload(cookie_dict)
        return {
            "success": ok,
            "cookies_count": len(cookie_dict),
            "has_sessionid": "sessionid" in cookie_dict,
            "ready": client.is_ready
        }

    @app.post("/admin/api/probe")
    async def admin_probe(request: Request):
        """Probe session by making a real chat request."""
        _check_auth(request)
        client = _browser.get("client")
        if client is None or not client.is_ready:
            return JSONResponse({"status": "error", "message": "未登录"})
        try:
            t0 = time.time()
            result = await client.chat("1+1=?只回答数字", use_deep_think=0)
            ms = int((time.time() - t0) * 1000)
            content = result.get("text", "")
            client.record_success()
            return JSONResponse({"status": "healthy", "ms": ms, "response": content[:100]})
        except Exception as e:
            return JSONResponse({"status": "error", "message": str(e)[:200]})

    @app.post("/auth/login")
    async def auth_login(request: Request):
        raise HTTPException(status_code=410, detail="登录由 SessionBox 管理，请打开 DOUBAO_PAGE_ID 对应页面")
    @app.post("/auth/reset_captcha")
    async def reset_captcha(request: Request):
        """Reset captcha flag after manual verification via VNC."""
        _check_auth(request)
        client = _browser.get("client")
        if client is None:
            raise HTTPException(status_code=503, detail="Browser not initialized")
        client.record_success()
        if not client.is_ready:
            client._ready = True
        return {"status": "ok", "message": "Captcha flag cleared, service resumed."}


    async def _do_login(client: BrowserClient):
        """Background login task."""
        try:
            ok = await client.wait_for_login(timeout=120)
            if ok:
                log.info("QR login successful via /auth")
            else:
                log.warning("QR login timed out")
        except Exception as exc:
            log.error("QR login error: %s", exc)

    @app.get("/auth/status")
    async def auth_status(request: Request):
        return await _get_login_status(request)

    @app.get("/admin/api/status")
    async def admin_api_status(request: Request):
        return await _get_login_status(request)

    async def _get_login_status(request: Request):
        _check_auth(request)
        client = _browser.get("client")
        if client is None:
            return {"logged_in": False, "browser": "not_started"}

        page_url = client.page.url if client.page else ""
        login_btn_count = 0
        has_session = False
        if client._context:
            try:
                cookies = await client._context.cookies("https://www.doubao.com")
                has_session = any(c["name"] == "sessionid" and c.get("value") for c in cookies)
            except Exception:
                pass
        if client.page:
            try:
                login_btn = client.page.locator('button:has-text("登录")')
                login_btn_count = await login_btn.count()
            except Exception:
                pass

        actual_logged_in = has_session or (client.is_ready and login_btn_count == 0)

        return {
            "logged_in": actual_logged_in,
            "is_ready_flag": client.is_ready,
            "login_button_visible": login_btn_count > 0,
            "page_url": page_url,
            "device_id": client._device_id or "",
            "web_id": client._web_id or "",
            "headless": client.headless,
            "mode": "headless" if client.headless else "window",
            "needs_captcha": client.needs_captcha,
        }

    @app.get("/admin/api/browser/status")
    async def admin_browser_status(request: Request):
        """Return browser mode and session details."""
        return await _get_login_status(request)

    @app.post("/admin/api/browser/mode")
    async def admin_browser_set_mode(request: Request):
        """Dynamically switch browser mode between headless and windowed GUI."""
        _check_auth(request)
        client = _browser.get("client")
        if client is None:
            raise HTTPException(status_code=503, detail="Browser client not initialized")
        body = await request.json()
        target_headless = bool(body.get("headless", False))
        log.info("API request: switch browser mode to headless=%s", target_headless)
        ok = await client.switch_mode(target_headless)
        return {
            "status": "ok" if ok else "failed",
            "headless": client.headless,
            "mode": "headless" if client.headless else "window",
            "logged_in": client.is_ready,
        }

    @app.post("/auth/eval")
    async def auth_eval(request: Request):
        """Evaluate JS on the browser page (debug only)."""
        _check_auth(request)
        client = _browser.get("client")
        if client is None or client.page is None:
            raise HTTPException(status_code=503, detail="Browser not available")
        body = await request.json()
        js = body.get("js", "")
        if not js:
            raise HTTPException(status_code=400, detail="Missing 'js' field")
        try:
            result = await client.page.evaluate(js)
            return {"result": result}
        except Exception as e:
            return {"error": str(e)}

    @app.get("/auth/screenshot")
    async def auth_screenshot(request: Request):
        """Return a screenshot of the browser page (for remote QR viewing)."""
        _check_auth(request)
        client = _browser.get("client")
        if client is None or client.page is None:
            raise HTTPException(status_code=503, detail="Browser not available")
        png_bytes = await client.page.screenshot()
        from fastapi.responses import Response
        return Response(content=png_bytes, media_type="image/png")

    # QR login endpoints were removed. Authentication is owned by SessionBox.

    @app.get("/admin/api/browser/screenshot")
    async def admin_browser_screenshot(request: Request):
        """Return screenshot of browser page as PNG."""
        from fastapi.responses import Response
        client = _browser.get("client")
        if client is None or client.page is None:
            raise HTTPException(status_code=503, detail="Browser not initialized")
        try:
            buf = await client.page.screenshot(type="png")
            return Response(content=buf, media_type="image/png")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/admin/api/open-doubao")
    async def admin_open_doubao(request: Request):
        """Open doubao.com in system default browser for user login."""
        import webbrowser
        try:
            webbrowser.open("https://www.doubao.com/chat/")
            return {"status": "ok", "url": "https://www.doubao.com/chat/"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    @app.post("/admin/api/browser/force-window")
    async def admin_browser_force_window(request: Request):
        """Force launch or bring up the visible browser window."""
        client = _browser.get("client")
        if client is None:
            raise HTTPException(status_code=503, detail="Browser not initialized")
        try:
            if client.headless:
                await client.switch_mode(headless=False)
            if client.page:
                await client.page.bring_to_front()
                # Click login button if not logged in and modal not open
                if not client.is_ready:
                    try:
                        modal = client.page.locator('[role="dialog"], .semi-modal')
                        if await modal.count() == 0:
                            btn = client.page.locator('button:has-text("登录")')
                            if await btn.count() > 0 and await btn.first.is_visible():
                                await btn.first.click()
                    except Exception:
                        pass
            return {"status": "ok", "mode": "window", "headless": client.headless}
        except Exception as e:
            log.error("Failed to force window: %s", e)
            return {"status": "error", "detail": str(e)}

    return app




# ── Server runner ──


def run_server():
    """Start the uvicorn server with env-based configuration."""
    import uvicorn

    host = os.environ.get("DOUBAO_HOST", "0.0.0.0")
    port = int(os.environ.get("DOUBAO_PORT", "9090"))
    api_key = os.environ.get("DOUBAO_API_KEY", "")
    rpm = float(os.environ.get("DOUBAO_RPM_LIMIT", "20"))
    novnc_url = os.environ.get("DOUBAO_NOVNC_URL", "")

    app = create_app(api_key=api_key or None, rpm_limit=rpm)

    print(f"\n  Doubao API Server (Playwright)")
    print(f"  Listening on http://{host}:{port}")
    if novnc_url:
        print(f"  noVNC: {novnc_url}")
    if api_key:
        print(f"  API Key: {api_key[:4]}{'*' * (len(api_key) - 4)}")
    print()

    uvicorn.run(app, host=host, port=port, log_level="info")
