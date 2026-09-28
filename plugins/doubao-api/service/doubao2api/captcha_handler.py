"""
CaptchaHandler protocol and AutoCaptchaHandler implementation.

``CaptchaHandler`` is a structural Protocol; any object with a matching
``handle()`` async method is accepted by ``DoubaoChatClient``.

``AutoCaptchaHandler`` wraps the local ``CaptchaServer``:
  - Starts a local HTTP server on first use (lazy).
  - Opens the captcha page in the default browser.
  - Pushes the verify_data challenge via SSE.
  - Waits for the user to solve the captcha.
  - Returns True on success, False on timeout or close.
"""
from __future__ import annotations

import asyncio
import webbrowser
from typing import Optional

from .captcha_server import CaptchaServer


class CaptchaHandler:
    """
    Structural protocol for captcha handlers.

    Any object that implements ``handle(verify_data, fp, device_id) -> bool``
    (as an async method) is compatible.
    """

    async def handle(self, verify_data: str, fp: str, device_id: str) -> bool:
        """
        Handle a verify challenge.

        Args:
            verify_data: The raw ``decision`` JSON string from the STREAM_ERROR extra.
            fp:          The fingerprint / verify token currently in use.
            device_id:   The device_id currently in use.

        Returns:
            True if the user completed verification successfully, False otherwise.
        """
        raise NotImplementedError


class AutoCaptchaHandler(CaptchaHandler):
    """
    Automatic captcha handler that opens a local browser page.

    The local page pre-loads ByteDance's ``captcha.js`` SDK and renders the
    challenge as soon as ``verify_data`` arrives via Server-Sent Events.

    The same server/browser tab is reused across multiple challenges within
    one session (the browser tab stays open between retries).
    """

    def __init__(self) -> None:
        self._server: Optional[CaptchaServer] = None
        self._browser_opened: bool = False

    def _ensure_server(self) -> None:
        if self._server is None:
            self._server = CaptchaServer()
            self._server.start()

    async def handle(self, verify_data: str, fp: str, device_id: str) -> bool:
        self._ensure_server()
        assert self._server is not None

        if not self._browser_opened:
            self._browser_opened = True
            webbrowser.open(self._server.url)
            # Give the browser a moment to open and connect the SSE stream
            await asyncio.sleep(1.5)

        self._server.push_challenge({
            "aid": "582478",
            "appName": "doubao",
            "lang": "zh",
            "did": device_id,
            "fp": fp,
            "host": "https://verify.zijieapi.com",
            "verify_data": verify_data,
        })

        # Wait for the browser to report the result (blocking queue.get wrapped
        # in an executor so we don't block the event loop)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, lambda: self._server.wait_result(timeout=120)
        )
        return result is not None and result.get("status") == "success"

    def close(self) -> None:
        """Stop the local server and release resources."""
        if self._server is not None:
            self._server.stop()
            self._server = None
        self._browser_opened = False
