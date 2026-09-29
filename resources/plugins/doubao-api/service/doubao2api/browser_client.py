"""Playwright-based Doubao client with in-browser fetch.

Architecture:
- SessionBox supplies the page-scoped cookies; Playwright only performs signed requests.
- In-browser fetch(): API requests go through ByteDance's fetch hook which
  automatically injects a_bogus/msToken signatures with real browser fingerprint
- httpx: Only used for file upload (TOS/ImageX flow, no fetch hook needed)
- expose_function bridge: Streams SSE chunks from browser JS back to Python

ByteDance's frontend exposes window.bdms.frontierSign() which generates
X-Bogus signatures. We use Playwright only to maintain a logged-in page
and call this signing function. All actual API traffic goes through httpx.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import time
import uuid
from typing import AsyncGenerator, Optional, Dict, Any, List
from urllib.parse import urlencode

import httpx
from playwright.async_api import async_playwright, BrowserContext, Page
from playwright_stealth import Stealth

log = logging.getLogger(__name__)

DOUBAO_URL = "https://www.doubao.com"
CHAT_URL = f"{DOUBAO_URL}/chat/"
COMPLETION_URL = f"{DOUBAO_URL}/chat/completion"
SAMANTHA_COMPLETION_URL = f"{DOUBAO_URL}/samantha/chat/completion"
DEFAULT_BOT_ID = "7338286299411103781"


class BrowserClient:
    """Manages Playwright for login and in-browser fetch for API calls."""

    def __init__(self, headless: bool = True, user_data_dir: Optional[str] = None,
                 page_id: Optional[str] = None, sessionbox_url: str = "http://127.0.0.1:19100"):
        self.headless = headless
        self.user_data_dir = user_data_dir
        self.page_id = page_id
        self.sessionbox_url = sessionbox_url
        self._playwright = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._http: Optional[httpx.AsyncClient] = None
        self._ready = False
        self._device_id: Optional[str] = None
        self._web_id: Optional[str] = None
        self._fp: Optional[str] = None
        self._source_web_id: Optional[str] = None
        # msToken rotation: updated from x-ms-token response header
        self._ms_token: str = ""
        # Robustness: failure tracking
        self._consecutive_failures: int = 0
        self._last_error_code: int = 0
        self._needs_captcha: bool = False
        self._verification_retry_at: float = 0
        # Stream bridge: request_id -> asyncio.Queue for SSE chunks
        self._stream_queues: Dict[str, asyncio.Queue] = {}
        self._bridge_ready: bool = False

    async def _load_sessionbox_cookies(self) -> None:
        if not self.page_id:
            raise RuntimeError("DOUBAO_PAGE_ID is required; create/login the account in SessionBox first")
        from .sessionbox_api import SessionBoxClient
        cookies = await SessionBoxClient(
            self.sessionbox_url, token=os.environ.get("SESSIONBOX_API_TOKEN", "")
        ).get_cookies(self.page_id, DOUBAO_URL)
        if not cookies:
            raise RuntimeError(f"SessionBox page {self.page_id} has no cookies for {DOUBAO_URL}")
        self._sessionbox_cookies = cookies

    @property
    def is_ready(self) -> bool:
        return self._ready

    @property
    def page(self) -> Optional[Page]:
        return self._page

    @property
    def needs_captcha(self) -> bool:
        return self._needs_captcha

    @property
    def consecutive_failures(self) -> int:
        return self._consecutive_failures

    @property
    def last_error_code(self) -> int:
        return self._last_error_code

    def record_success(self):
        """Reset failure counters on successful request."""
        self._consecutive_failures = 0
        self._last_error_code = 0
        self._needs_captcha = False
        self._verification_retry_at = 0

    def clear_captcha(self):
        """Manually or automatically clear the needs_captcha flag."""
        self._needs_captcha = False
        self._verification_retry_at = 0
        self._consecutive_failures = 0
        log.info("Captcha flag cleared")

    def verification_retry_due(self) -> bool:
        return self._needs_captcha and time.monotonic() >= self._verification_retry_at

    async def is_captcha_visible(self) -> bool:
        """Check whether a real captcha modal/slider is actually visible in the browser DOM."""
        if not self._page:
            return False
        try:
            selectors = [
                '#captcha_container',
                '.captcha_verify_container',
                '.verify-bar-close',
                '.secsdk-captcha-drag-icon',
                '[class*="captcha-modal"]',
                '[class*="captcha_verify"]',
                '.semi-modal:has-text("验证")',
            ]
            for sel in selectors:
                loc = self._page.locator(sel)
                cnt = await loc.count()
                if cnt > 0:
                    for i in range(cnt):
                        if await loc.nth(i).is_visible():
                            return True
            return False
        except Exception:
            return False

    def record_failure(self, error_code: int = 0):
        """Track consecutive failures. Mark captcha-needed on 710022004."""
        self._consecutive_failures += 1
        self._last_error_code = error_code
        if error_code == 710022004:
            self._needs_captcha = True
            self._verification_retry_at = time.monotonic() + 60
            log.warning("Captcha flag marked on 710022004")
        if self._consecutive_failures >= 10:
            log.error("10 consecutive failures - marking not ready")
            self._ready = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        """Launch browser, navigate to Doubao, init httpx client."""
        # On Linux/Docker without a DISPLAY, enforce headless mode
        if not os.environ.get("DISPLAY") and (os.name != "nt"):
            if not self.headless:
                log.info("No DISPLAY available (Linux/Docker): enforcing headless=True")
                self.headless = True

        log.info("Starting BrowserClient (headless=%s, page_id=%s)", self.headless, self.page_id)
        await self._load_sessionbox_cookies()
        self._playwright = await async_playwright().start()

        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-sandbox",
        ]

        # Prefer bundled Chromium to prevent collisions with user's existing Chrome processes
        chrome_channel = None
        if os.environ.get("DOUBAO_USE_SYSTEM_CHROME", "false").lower() == "true":
            chrome_paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
            ]
            if any(os.path.exists(p) for p in chrome_paths):
                chrome_channel = "chrome"

        launch_kwargs = {
            "headless": self.headless,
            "args": launch_args,
            "viewport": {"width": 1280, "height": 720},
            "locale": "zh-CN",
        }
        if chrome_channel:
            launch_kwargs["channel"] = chrome_channel

        async def _launch_context(kwargs):
            if self.user_data_dir:
                ctx = await self._playwright.chromium.launch_persistent_context(
                    self.user_data_dir,
                    **kwargs
                )
                page = ctx.pages[0] if ctx.pages else await ctx.new_page()
                return ctx, page
            else:
                b_kwargs = {"headless": self.headless, "args": launch_args}
                if kwargs.get("channel"):
                    b_kwargs["channel"] = kwargs["channel"]
                browser = await self._playwright.chromium.launch(**b_kwargs)
                ctx = await browser.new_context(
                    viewport={"width": 1280, "height": 720}, locale="zh-CN",
                )
                page = await ctx.new_page()
                await ctx.add_cookies([
                    ({k: v for k, v in cookie.items() if k in {"name", "value", "domain", "path", "secure", "httpOnly"}} | ({"expires": cookie["expirationDate"]} if cookie.get("expirationDate") else {}))
                    for cookie in self._sessionbox_cookies
                ])
                return ctx, page

        try:
            self._context, self._page = await _launch_context(launch_kwargs)
        except Exception as e:
            err_msg = str(e)
            if "Executable doesn't exist" in err_msg:
                fallback_success = False
                for fallback_channel in ("chrome", "msedge"):
                    try:
                        log.info("Bundled Chromium not installed. Attempting fallback to system '%s'...", fallback_channel)
                        kw = dict(launch_kwargs)
                        kw["channel"] = fallback_channel
                        self._context, self._page = await _launch_context(kw)
                        log.info("Successfully launched browser using '%s' channel!", fallback_channel)
                        fallback_success = True
                        break
                    except Exception as fe:
                        log.debug("Fallback channel '%s' unavailable: %s", fallback_channel, fe)
                if not fallback_success:
                    log.error("No compatible browser found. Please run: playwright install chromium")
                    raise RuntimeError("Playwright Chromium browser not found. Run 'playwright install chromium' to install.") from e
            else:
                raise

        # Stealth patches
        await self._inspect_sessionbox_identity()
        stealth = Stealth(navigator_languages_override=("zh-CN", "zh"))
        await stealth.apply_stealth_async(self._page)

        # Pre-register fetch bridge
        await self._setup_fetch_bridge()

        # Navigate
        log.info("Navigating to %s", CHAT_URL)
        await self._page.goto(CHAT_URL, wait_until="load", timeout=60000)
        await asyncio.sleep(3)

        # Init httpx
        self._http = httpx.AsyncClient(timeout=httpx.Timeout(180, connect=10))

        await self._check_login_state()
        # Authentication is deliberately managed in SessionBox, never by this service.

    async def _inspect_sessionbox_identity(self):
        """Compare public web identifiers without logging their values."""
        from .sessionbox_api import SessionBoxClient

        try:
            source = await SessionBoxClient(
                self.sessionbox_url, token=os.environ.get("SESSIONBOX_API_TOKEN", "")
            ).execute(self.page_id, '''(() => {
                try {
                    return {web_id: JSON.parse(localStorage.getItem('__tea_cache_tokens_497858') || '{}').web_id || ''};
                } catch (_) { return {web_id: ''}; }
            })()''')
            web_id = source.get("web_id") if isinstance(source, dict) else None
            if not isinstance(web_id, str) or not web_id.isdigit() or not 10 <= len(web_id) <= 24:
                log.warning("DOUBAO_DIAG %s", json.dumps({"event": "source_identity", "page_id": self.page_id,
                    "time": datetime.now(timezone.utc).isoformat(), "available": False}))
                return
            self._source_web_id = web_id
            log.info("DOUBAO_DIAG %s", json.dumps({"event": "source_identity", "page_id": self.page_id,
                "time": datetime.now(timezone.utc).isoformat(), "available": True}))
        except Exception as e:
            log.warning("DOUBAO_DIAG %s", json.dumps({"event": "source_identity", "page_id": self.page_id,
                "time": datetime.now(timezone.utc).isoformat(), "available": False, "error_type": type(e).__name__}))

    async def stop(self):
        """Close browser and httpx client."""
        if self._http:
            await self._http.aclose()
            self._http = None
        if self._context:
            try:
                await self._context.close()
            except Exception:
                pass
        if self._playwright:
            try:
                await self._playwright.stop()
            except Exception:
                pass
        self._context = None
        self._playwright = None
        self._page = None
        self._ready = False
        self._bridge_ready = False
        log.info("BrowserClient stopped")

    async def is_alive(self) -> bool:
        """Check if browser process is still responsive."""
        if not self._page or not self._context:
            return False
        if self._page.is_closed():
            return False
        try:
            result = await asyncio.wait_for(
                self._page.evaluate("1+1"), timeout=15
            )
            return result == 2
        except Exception as e:
            log.warning("Browser health check timeout (busy): %s", e)
            return True

    async def restart(self):
        """Stop and restart the browser client."""
        log.info("Restarting BrowserClient...")
        await self.stop()
        await asyncio.sleep(2)
        await self.start()
        log.info("BrowserClient restarted. ready=%s", self._ready)

    async def switch_mode(self, headless: bool) -> bool:
        """Dynamically switch between headless and windowed GUI mode without losing session."""
        if not headless and not os.environ.get("DISPLAY") and (os.name != "nt"):
            log.warning("Cannot switch to windowed GUI mode on Linux/Docker without DISPLAY")
            return False

        if self.headless == headless and self._ready:
            log.info("Browser mode is already headless=%s", headless)
            return True
        log.info("Switching browser mode: headless=%s -> headless=%s", self.headless, headless)
        self.headless = headless
        await self.restart()
        return self._ready

    @classmethod
    def is_profile_logged_in(cls, user_data_dir: Optional[str]) -> bool:
        """Check if user_data_dir exists and has logged-in marks."""
        if not user_data_dir or not os.path.exists(user_data_dir):
            return False
        # Check explicit flag file
        flag_file = os.path.join(user_data_dir, ".login_success")
        if os.path.exists(flag_file) and os.path.getsize(flag_file) > 0:
            return True
        cookies_db = os.path.join(user_data_dir, "Default", "Network", "Cookies")
        if os.path.exists(cookies_db) and os.path.getsize(cookies_db) > 10240:
            return True
        return False

    # ------------------------------------------------------------------
    # Login
    # ------------------------------------------------------------------

    async def _check_login_state(self):
        """Check if logged in by inspecting session cookies and page DOM."""
        if self._page and "from_logout=1" in self._page.url:
            log.info("Page is on from_logout=1, navigating to clean chat URL...")
            try:
                await self._page.goto(CHAT_URL, wait_until="load", timeout=30000)
                await asyncio.sleep(2)
            except Exception as e:
                log.warning("Navigation back to CHAT_URL failed: %s", e)

        try:
            cookies = await self._context.cookies("https://www.doubao.com")
        except Exception as e:
            log.warning("Failed to inspect browser cookies (window may have been closed): %s", e)
            self._ready = False
            return
        has_session = any(c["name"] == "sessionid" and c.get("value") for c in cookies)

        # Check DOM indicators for true authenticated state
        has_login_btn = False
        try:
            btn = self._page.locator('button:has-text("登录"), a:has-text("登录")')
            if await btn.count() > 0 and await btn.first.is_visible():
                has_login_btn = True
        except Exception:
            pass

        has_avatar = False
        try:
            avatar = self._page.locator('img[class*="avatar"], div[class*="avatar"]')
            if await avatar.count() > 0:
                has_avatar = True
        except Exception:
            pass

        # The cloned browser can show a login control even while the source
        # SessionBox page is authenticated. Check the source before rejecting it.
        source_authenticated = False
        if has_session and has_login_btn and self.page_id:
            try:
                from .sessionbox_api import SessionBoxClient

                source = await SessionBoxClient(
                    self.sessionbox_url, token=os.environ.get("SESSIONBOX_API_TOKEN", "")
                ).execute(self.page_id, '''(() => ({
                    url: location.href,
                    has_login_button: [...document.querySelectorAll('button,a')].some(el =>
                        el.textContent?.trim() === '登录' && !!el.getClientRects().length)
                }))()''')
                source_authenticated = (
                    isinstance(source, dict)
                    and source.get("url", "").startswith(DOUBAO_URL + "/")
                    and source.get("has_login_button") is False
                )
            except Exception as e:
                log.warning("SessionBox source login check failed: %s", e)

        is_logged_in = has_avatar or (has_session and (not has_login_btn or source_authenticated))
        log.info("Login check: time=%s page_id=%s url=%s has_sessionid=%s has_avatar=%s "
                 "has_login_btn=%s source_authenticated=%s is_logged_in=%s",
                 datetime.now(timezone.utc).isoformat(), self.page_id, self._page.url,
                 has_session, has_avatar, has_login_btn, source_authenticated, is_logged_in)

        if not is_logged_in:
            log.info("Not logged in - valid sessionid or avatar not confirmed")
            self._ready = False
            if self.user_data_dir:
                flag_file = os.path.join(self.user_data_dir, ".login_success")
                if os.path.exists(flag_file):
                    try:
                        os.remove(flag_file)
                    except Exception:
                        pass
            return

        self._ready = True
        if self.user_data_dir:
            try:
                os.makedirs(self.user_data_dir, exist_ok=True)
                with open(os.path.join(self.user_data_dir, ".login_success"), "w", encoding="utf-8") as f:
                    f.write(str(int(time.time())))
            except Exception:
                pass

        await self._extract_params()
        await self._seed_ms_token()
        await self._setup_fetch_bridge()
        await self._verify_fetch_hook()
        await self._wait_for_signing()  # still needed for upload endpoints
        log.info("Ready! device_id=%s, fetch_hook=%s", self._device_id, self._bridge_ready)

    async def _extract_params(self):
        """Extract device_id, web_id, fp from localStorage/cookies."""
        for _ in range(5):
            params = await self._page.evaluate("""() => {
                const result = {};
                try {
                    const samWeb = JSON.parse(localStorage.getItem('samantha_web_web_id') || '{}');
                    result.device_id = samWeb.web_id || '';
                } catch(e) {}
                try {
                    const tea = JSON.parse(localStorage.getItem('__tea_cache_tokens_497858') || '{}');
                    result.web_id = tea.web_id || '';
                } catch(e) {}
                const fpCookie = document.cookie.split(';')
                    .map(c => c.trim())
                    .find(c => c.startsWith('s_v_web_id='));
                result.fp = fpCookie ? fpCookie.split('=')[1] : '';
                return result;
            }""")
            self._device_id = params.get("device_id", "")
            self._web_id = params.get("web_id", "")
            self._fp = params.get("fp", "")
            if self._device_id and self._web_id:
                break
            await asyncio.sleep(1)
        log.info("DOUBAO_DIAG %s", json.dumps({"event": "browser_identity", "page_id": self.page_id,
            "time": datetime.now(timezone.utc).isoformat(), "has_device_id": bool(self._device_id),
            "has_web_id": bool(self._web_id), "source_web_id_matches": bool(self._source_web_id and self._web_id == self._source_web_id),
            "has_fp": bool(self._fp)}))

    async def _wait_for_signing(self):
        """Wait for bdms.frontierSign to become available (legacy, kept for upload signing)."""
        for i in range(12):  # up to 60s
            has_sign = await self._page.evaluate(
                "() => typeof window.bdms?.frontierSign === 'function'"
            )
            if has_sign:
                log.info("bdms.frontierSign available after %ds", (i + 1) * 5)
                return
            await asyncio.sleep(5)
        log.warning("bdms.frontierSign not available after 60s - signing may fail")

    async def _setup_fetch_bridge(self):
        """Register expose_function callback for streaming data from browser to Python."""
        if self._bridge_ready:
            return

        async def _on_stream_chunk(request_id: str, chunk_json: str):
            """Called from browser JS for each SSE chunk or completion signal."""
            queue = self._stream_queues.get(request_id)
            if queue:
                await queue.put(chunk_json)

        try:
            await self._page.expose_function("__doubaoStreamChunk", _on_stream_chunk)
            self._bridge_ready = True
            log.info("Fetch bridge registered (expose_function ready)")
        except Exception as e:
            # May already be registered if page didn't navigate
            if "already been registered" in str(e).lower():
                self._bridge_ready = True
                log.info("Fetch bridge already registered")
            else:
                log.error("Failed to register fetch bridge: %s", e)
                raise

    async def _verify_fetch_hook(self):
        """Verify ByteDance's fetch interceptor is active (adds a_bogus)."""
        for i in range(15):  # up to 30s
            hooked = await self._page.evaluate("""() => {
                try {
                    const s = window.fetch.toString();
                    return !s.includes('native code');
                } catch(e) { return false; }
            }""")
            if hooked:
                log.info("Fetch hook verified active after %ds", (i + 1) * 2)
                return True
            await asyncio.sleep(2)
        log.warning("Fetch hook NOT detected after 30s - requests may fail")
        return False

    async def wait_for_login(self, timeout: int = 180) -> bool:
        """Wait for user to scan QR code."""
        await self._trigger_login_dialog()
        log.info("Waiting for QR scan login (timeout=%ds)...", timeout)
        try:
            for _ in range(timeout):
                await asyncio.sleep(1)
                avatar = self._page.locator('img[class*="avatar"], div[class*="avatar"], span:has-text("套餐"), div:has-text("套餐")')
                if await avatar.count() > 0:
                    log.info("Detected user profile/avatar in DOM!")
                    break
                login_btn = self._page.locator('button:has-text("登录")')
                if await login_btn.count() == 0:
                    log.info("Login button no longer visible!")
                    break

            await asyncio.sleep(2)
            self._ready = True
            await self._extract_params()
            await self._seed_ms_token()
            await self._setup_fetch_bridge()
            await self._verify_fetch_hook()
            await self._wait_for_signing()
            log.info("Login successful and client ready!")
            return True
        except Exception as e:
            log.error("Login check error: %s", e)
            return False

    async def _trigger_login_dialog(self):
        """Click login button to show QR code dialog."""
        for _ in range(10):
            try:
                btn = self._page.locator('button:has-text("登录")')
                if await btn.count() > 0:
                    await btn.first.click()
                    log.info("Clicked '登录' button to display QR code dialog")
                    return
            except Exception:
                pass
            await asyncio.sleep(1)


    async def inject_cookies_and_reload(self, cookies: Dict[str, str]) -> bool:
        """Inject cookies from QR login into browser context and reload.

        After qr_login.py obtains session cookies via pure HTTP,
        this method injects them into Playwright so that bdms.frontierSign
        becomes available.

        Returns True if login state is confirmed after reload.
        """
        if not self._context or not self._page:
            log.error("inject_cookies: browser not started")
            return False

        # Build cookie list for Playwright
        pw_cookies = []
        for name, value in cookies.items():
            pw_cookies.append({
                "name": name,
                "value": value,
                "domain": ".doubao.com",
                "path": "/",
            })

        await self._context.add_cookies(pw_cookies)
        log.info("Injected %d cookies into browser context", len(pw_cookies))

        # Reload page to pick up new session
        await self._page.reload(wait_until="load", timeout=30000)
        await asyncio.sleep(3)

        # Re-check login state
        await self._check_login_state()
        return self._ready
    # ------------------------------------------------------------------
    # Signing & Cookies
    # ------------------------------------------------------------------

    async def _get_cookies_string(self) -> str:
        """Get full cookie string including httpOnly cookies."""
        cookies = await self._context.cookies("https://www.doubao.com")
        return "; ".join(f"{c['name']}={c['value']}" for c in cookies)

    async def _get_csrf_token(self) -> str:
        """Get passport_csrf_token from browser cookies."""
        cookies = await self._context.cookies("https://www.doubao.com")
        for c in cookies:
            if c["name"] == "passport_csrf_token":
                return c["value"]
            if c["name"] == "passport_csrf_token_default":
                return c["value"]
        return ""

    async def _seed_ms_token(self):
        """Seed initial msToken from browser cookies."""
        cookies = await self._context.cookies("https://www.doubao.com")
        for c in cookies:
            if c["name"] == "msToken":
                self._ms_token = c["value"]
                log.info("Seeded msToken from cookies (%d chars)", len(c["value"]))
                return
        log.warning("No msToken cookie found - first request may trigger rate limit")

    async def _sign_url(self, base_url: str, params: Dict[str, str]) -> str:
        """Sign a URL using bdms.frontierSign with retry on failure."""
        sorted_params = dict(sorted(params.items()))
        query_string = urlencode(sorted_params)

        last_error = None
        for attempt in range(3):
            try:
                sig = await self._page.evaluate(
                    f'window.bdms.frontierSign("{query_string}")'
                )

                if isinstance(sig, dict):
                    if "a_bogus" in sig:
                        return f"{base_url}?{query_string}&a_bogus={sig['a_bogus']}"
                    elif "X-Bogus" in sig:
                        return f"{base_url}?{query_string}&X-Bogus={sig['X-Bogus']}"
                    elif sig:
                        k, v = next(iter(sig.items()))
                        return f"{base_url}?{query_string}&{k}={v}"
                elif isinstance(sig, str) and sig:
                    return f"{base_url}?{query_string}&X-Bogus={sig}"

                last_error = f"empty signature: {sig}"
            except Exception as e:
                last_error = str(e)
                log.warning("frontierSign attempt %d failed: %s", attempt + 1, e)

            if attempt < 2:
                await asyncio.sleep(1)

        log.error("frontierSign failed after 3 attempts: %s", last_error)
        raise RuntimeError(f"Failed to generate X-Bogus signature: {last_error}")

    def _build_query_params(self) -> Dict[str, str]:
        """Build the standard query parameters for API calls."""
        params = {
            "aid": "497858",
            "device_id": self._device_id or "",
            "device_platform": "web",
            "doubao_device_platform": "web",
            "web_platform": "browser",
            "fp": self._fp or "",
            "language": "zh",
            "pc_version": "3.36.0",
            "doubao_pc_version": "3.36.0",
            "pkg_type": "release_version",
            "real_aid": "497858",
            "region": "CN",
            "sys_region": "CN",
            "samantha_web": "1",
            "tea_uuid": self._web_id or "",
            "tz_name": "Asia/Shanghai",
            "use-olympus-account": "1",
            "version_code": "20800",
            "web_id": self._web_id or "",
            "web_tab_id": str(uuid.uuid4()),
        }
        if self._ms_token:
            params["msToken"] = self._ms_token
        return params

    def _build_headers(self, cookie_str: str, csrf_token: str = "") -> Dict[str, str]:
        """Build request headers."""
        # Extract CSRF token from cookie string if not provided
        if not csrf_token:
            for part in cookie_str.split("; "):
                if part.startswith("passport_csrf_token="):
                    csrf_token = part.split("=", 1)[1]
                    break
        headers = {
            "Accept": "*/*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Content-Type": "application/json",
            "Cookie": cookie_str,
            "Origin": DOUBAO_URL,
            "Referer": CHAT_URL,
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "agw-js-conv": "str, str",
        }
        if csrf_token:
            headers["x-tt-passport-csrf-token"] = csrf_token
        return headers

    # ------------------------------------------------------------------
    # Chat Completion (streaming via in-browser fetch)
    # ------------------------------------------------------------------

    async def chat_completion(
        self,
        text: str,
        conversation_id: Optional[str] = None,
        bot_id: Optional[str] = None,
        use_deep_think: int = 0,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Send a chat message and yield SSE events via in-browser fetch."""
        if not self._ready:
            raise RuntimeError("Browser not ready - need login first")

        need_create = conversation_id is None or conversation_id == ""
        effective_bot_id = bot_id or DEFAULT_BOT_ID
        msg_uuid = str(uuid.uuid4())
        local_conv_id = f"local_{uuid.uuid4().int % 10**16}"
        now_ms = int(time.time() * 1000)
        now_sec = int(time.time())

        payload = {
            "client_meta": {
                "local_conversation_id": local_conv_id if need_create else "",
                "conversation_id": conversation_id or "",
                "bot_id": effective_bot_id,
                "last_section_id": "",
                "last_message_index": None,
                "local_permissions": [
                    {"permission_name": "ACCESS_COARSE_LOCATION", "status": 3},
                    {"permission_name": "ACCESS_FINE_LOCATION", "status": 3},
                    {"permission_name": "ACCESS_BACKGROUND_LOCATION", "status": 3},
                ],
            },
            "messages": [{
                "local_message_id": msg_uuid,
                "content_block": [{
                    "block_type": 10000,
                    "content": {
                        "text_block": {"text": text, "icon_url": "", "icon_url_dark": "", "summary": ""},
                        "pc_event_block": "",
                    },
                    "block_id": str(uuid.uuid4()),
                    "parent_id": "",
                    "meta_info": [],
                    "append_fields": [],
                }],
                "message_status": 0,
            }],
            "option": {
                "send_message_scene": "",
                "create_time_ms": now_ms,
                "collect_id": "",
                "is_audio": False,
                "answer_with_suggest": False,
                "agent_mode": 2,
                "tts_switch": False,
                "need_deep_think": use_deep_think,
                "click_clear_context": False,
                "from_suggest": False,
                "is_regen": False,
                "is_replace": False,
                "is_from_click_option": False,
                "is_from_click_softlink": False,
                "disable_sse_cache": False,
                "select_text_action": "",
                "is_select_text": False,
                "resend_for_regen": False,
                "scene_type": 0,
                "unique_key": str(uuid.uuid4()),
                "start_seq": 0,
                "need_create_conversation": need_create,
                "conversation_init_option": {"need_ack_conversation": True},
                "conversation_init_ext": {
                    "model_item_key": "0",
                    "reasoning_effort": str(use_deep_think) if use_deep_think else "0",
                    "mode_id": "1",
                },
                "regen_query_id": [],
                "edit_query_id": [],
                "regen_instruction": "",
                "no_replace_for_regen": False,
                "message_from": 0,
                "shared_app_name": "",
                "shared_app_id": "",
                "sse_recv_event_options": {"support_chunk_delta": True},
                "is_ai_playground": False,
                "is_old_user": True,
                "recovery_option": {
                    "is_recovery": False,
                    "req_create_time_sec": now_sec,
                    "append_sse_event_scene": 0,
                },
                "message_storage_type": 0,
                "related_deleted_message_ids": {},
                "connector_info_list": [],
                "model_config": {
                    "model_item_key": "0",
                    "model_extra_params": {},
                    "reasoning_effort": use_deep_think,
                },
                "aggregate_params": {
                    "conversation_mode": "1",
                    "mode_id": "1",
                    "model_item_key": "0",
                    "agent_mode": "2",
                    "reasoning_effort": str(use_deep_think) if use_deep_think else "0",
                    "provider_id": "",
                },
                "conversation_mode": 1,
            },
            "user_context": [],
            "ext": {
                "agent_mode": "2",
                "use_deep_think": str(use_deep_think),
                "sub_conv_firstmet_type": "1" if need_create else "0",
                "collection_id": "",
                "is_finish": "1",
                "conversation_init_option": json.dumps({"need_ack_conversation": True}),
                "commerce_credit_config_enable": "0",
            },
        }

        # Build URL with query params and X-Bogus signature via bdms.frontierSign
        query_params = self._build_query_params()
        url = await self._sign_url("/chat/completion", query_params)

        request_id = f"req_{uuid.uuid4().hex[:16]}"
        queue: asyncio.Queue = asyncio.Queue()
        self._stream_queues[request_id] = queue

        log.info("POST %s (conv=%s, deep_think=%s) [browser fetch]",
                 url.split("?")[0], conversation_id or "new", use_deep_think)
        cookies = await self._context.cookies(DOUBAO_URL)
        cookie_names = {cookie["name"] for cookie in cookies}
        log.info("DOUBAO_DIAG %s", json.dumps({"event": "chat_request", "time": datetime.now(timezone.utc).isoformat(),
            "page_id": self.page_id, "request_id": request_id, "headless": self.headless,
            "source_web_id_matches": bool(self._source_web_id and self._web_id == self._source_web_id),
            "has_sessionid": "sessionid" in cookie_names, "has_csrf": "passport_csrf_token" in cookie_names,
            "has_ms_token": bool(self._ms_token), "fetch_hook": self._bridge_ready}))

        # Launch browser fetch in background with completion watcher
        eval_task = asyncio.create_task(
            self._browser_fetch_stream(url, payload, request_id)
        )

        def _on_eval_done(task: asyncio.Task):
            try:
                exc = task.exception()
                if exc:
                    log.error("eval_task crashed for %s: %s", request_id, exc)
                    queue.put_nowait(f"__ERROR__:{exc}")
            except (asyncio.CancelledError, Exception):
                pass

        eval_task.add_done_callback(_on_eval_done)

        # Yield parsed SSE events from queue
        try:
            while True:
                chunk_json = await asyncio.wait_for(queue.get(), timeout=180)
                if chunk_json is None:
                    # Stream complete
                    break
                if chunk_json.startswith("__ERROR__:"):
                    error_msg = chunk_json[10:]
                    log.error("Browser fetch error: %s", error_msg[:200])
                    yield {"error": True, "status": 0, "body": error_msg}
                    break
                if chunk_json.startswith("__HTTP_ERROR__:"):
                    status = int(chunk_json[15:].split(":", 1)[0])
                    body = chunk_json[15:].split(":", 1)[1] if ":" in chunk_json[15:] else ""
                    log.error("API error %d: %s", status, body[:200])
                    yield {"error": True, "status": status, "body": body}
                    break
                # Parse SSE line
                try:
                    data = json.loads(chunk_json)
                    yield data
                except json.JSONDecodeError:
                    continue
        except asyncio.TimeoutError:
            log.error("Stream timeout (180s) for request %s", request_id)
            yield {"error": True, "status": 0, "body": "Stream timeout"}
        finally:
            self._stream_queues.pop(request_id, None)
            if not eval_task.done():
                eval_task.cancel()
            else:
                # Check for exceptions
                try:
                    eval_task.result()
                except Exception:
                    pass

    async def _browser_fetch_stream(
        self, url: str, payload: Dict[str, Any], request_id: str
    ):
        """Execute fetch() inside browser page and stream SSE chunks via callback."""
        js_code = """
        async ([url, payloadJson, requestId]) => {
            const sendChunk = async (chunk) => {
                if (typeof window.__doubaoStreamChunk === 'function') {
                    try {
                        await window.__doubaoStreamChunk(requestId, chunk);
                    } catch(e) {}
                }
            };
            try {
                if (typeof window.__doubaoStreamChunk !== 'function') {
                    throw new Error('window.__doubaoStreamChunk bridge not registered on page');
                }
                const csrf = document.cookie.match(/passport_csrf_token=([^;]+)/);
                const csrfToken = csrf ? csrf[1] : '';
                const headers = {
                    'Content-Type': 'application/json',
                    'agw-js-conv': 'str',
                };
                if (csrfToken) {
                    headers['x-tt-passport-csrf-token'] = csrfToken;
                }
                const res = await fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: payloadJson,
                    credentials: 'include',
                });
                if (!res.ok) {
                    const errBody = await res.text();
                    await sendChunk('__HTTP_ERROR__:' + res.status + ':' + errBody.slice(0, 500));
                    return;
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let currentEvent = '';
                let buffer = '';
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, {stream: true});
                    const lines = buffer.split('\\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        if (trimmed.startsWith('event: ')) {
                            currentEvent = trimmed.slice(7);
                            continue;
                        }
                        if (trimmed.startsWith('id: ')) continue;
                        if (!trimmed.startsWith('data: ')) continue;
                        const dataStr = trimmed.slice(6);
                        if (!dataStr || dataStr === '{}') continue;
                        try {
                            const obj = JSON.parse(dataStr);
                            obj._event = currentEvent;
                            await sendChunk(JSON.stringify(obj));
                        } catch(e) {}
                    }
                }
                // Process remaining buffer
                if (buffer.trim()) {
                    const trimmed = buffer.trim();
                    if (trimmed.startsWith('data: ')) {
                        const dataStr = trimmed.slice(6);
                        if (dataStr && dataStr !== '{}') {
                            try {
                                const obj = JSON.parse(dataStr);
                                obj._event = currentEvent;
                                await sendChunk(JSON.stringify(obj));
                            } catch(e) {}
                        }
                    }
                }
                // Signal completion
                await sendChunk(null);
            } catch(e) {
                await sendChunk('__ERROR__:' + e.message);
                throw e;
            }
        }
        """
        payload_json = json.dumps(payload, ensure_ascii=False)
        await self._page.evaluate(js_code, [url, payload_json, request_id])

    # ------------------------------------------------------------------
    # High-level chat helper
    # ------------------------------------------------------------------

    async def chat(
        self,
        text: str,
        conversation_id: Optional[str] = None,
        bot_id: Optional[str] = None,
        use_deep_think: int = 0,
    ) -> Dict[str, Any]:
        """Send message, collect full response. Returns {text, conversation_id}."""
        full_text = ""
        result_conv_id = conversation_id
        events = []

        async for event in self.chat_completion(
            text, conversation_id=conversation_id,
            bot_id=bot_id, use_deep_think=use_deep_think
        ):
            events.append(event)
            if event.get("error"):
                raise RuntimeError(
                    f"API error {event.get('status')}: {event.get('body', '')[:200]}"
                )
            if not result_conv_id:
                cid = self.extract_conversation_id(event)
                if cid and cid != "0":
                    result_conv_id = cid
            full_text += self._extract_text(event)

        return {"text": full_text, "conversation_id": result_conv_id}

    # ------------------------------------------------------------------
    # SSE parsing helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_text(event: Dict[str, Any]) -> str:
        """Extract text content from a SSE event."""
        event_type = event.get("_event", "")

        if event_type == "CHUNK_DELTA" and "text" in event:
            return event["text"]

        if "patch_op" in event:
            for op in event["patch_op"]:
                pv = op.get("patch_value", {})
                for block in pv.get("content_block", []):
                    content = block.get("content", {})
                    tb = content.get("text_block", {})
                    if tb.get("text"):
                        return tb["text"]
                if op.get("patch_object") == 102:
                    raw = pv.get("content", "")
                    if raw:
                        try:
                            parsed = json.loads(raw)
                            if parsed.get("text"):
                                return parsed["text"]
                        except (json.JSONDecodeError, TypeError):
                            pass

        if event_type == "STREAM_MSG_NOTIFY":
            content = event.get("content", {})
            if isinstance(content, dict):
                for block in content.get("content_block", []):
                    tb = block.get("content", {}).get("text_block", {})
                    if tb.get("text"):
                        return tb["text"]

        return ""

    @staticmethod
    def extract_conversation_id(event: Dict[str, Any]) -> Optional[str]:
        """Extract conversation_id from SSE events."""
        ack = event.get("ack_client_meta", {})
        if ack.get("conversation_id"):
            return ack["conversation_id"]
        meta = event.get("meta", {})
        if meta.get("conversation_id"):
            return meta["conversation_id"]
        return None

    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation from Doubao via /im/conversation/batch_del_user_conv.

        Keeps the web UI sidebar completely clean (即用即焚 / Ephemeral Conversations).
        Returns True if deletion succeeded, False otherwise.
        """
        if not conversation_id or str(conversation_id).strip() in ("0", ""):
            return False

        if not self._ready or self._page is None:
            log.warning("Cannot delete conversation %s: browser not ready", conversation_id)
            return False

        query_params = self._build_query_params()
        try:
            signed_url = await self._sign_url("/im/conversation/batch_del_user_conv", query_params)
        except Exception as exc:
            log.warning("Failed to sign delete url for %s: %s", conversation_id, exc)
            return False

        payload = {
            "cmd": 4171,
            "uplink_body": {
                "batch_delete_user_conversation_uplink_body": {
                    "conversation_id": [str(conversation_id)],
                    "delete_all": False,
                    "conversation_type": 3,
                }
            },
            "sequence_id": str(uuid.uuid4()),
            "channel": 2,
            "version": "1",
        }

        try:
            res = await self._page.evaluate('''async (args) => {
                const [url, payload] = args;
                const csrfMatch = document.cookie.match(/passport_csrf_token=([^;]+)/);
                const csrf = csrfMatch ? csrfMatch[1] : "";
                try {
                    const resp = await fetch(url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json; encoding=utf-8",
                            "x-tt-passport-csrf-token": csrf,
                            "agw-js-conv": "str",
                        },
                        body: JSON.stringify(payload),
                    });
                    const text = await resp.text();
                    return { status: resp.status, body: text };
                } catch(e) {
                    return { error: e.message };
                }
            }''', [signed_url, payload])

            if res.get("error"):
                log.warning("delete_conversation %s failed: %s", conversation_id, res["error"])
                return False

            data = json.loads(res.get("body", "{}"))
            if data.get("status_code") == 0:
                log.info("Successfully deleted ephemeral conversation %s (即用即焚)", conversation_id)
                return True
            else:
                log.warning("delete_conversation %s: status_code=%s desc=%s",
                            conversation_id, data.get("status_code"), data.get("status_desc"))
                return False
        except Exception as exc:
            log.warning("delete_conversation %s exception: %s", conversation_id, exc)
            return False

    # ------------------------------------------------------------------
    # Samantha endpoint (image/video/music generation)
    # ------------------------------------------------------------------

    async def _samantha_request(
        self,
        payload: Dict[str, Any],
        timeout: float = 120,
    ) -> str:
        """Send a request to /samantha/chat/completion via in-browser fetch."""
        if not self._ready:
            raise RuntimeError("Browser not ready - need login first")

        query_params = self._build_query_params()
        query_string = "&".join(f"{k}={v}" for k, v in sorted(query_params.items()))
        url = f"/samantha/chat/completion?{query_string}"

        js_code = """
        async ([url, payloadJson, timeoutMs]) => {
            const csrf = document.cookie.match(/passport_csrf_token=([^;]+)/);
            const csrfToken = csrf ? csrf[1] : '';
            const headers = {
                'Content-Type': 'application/json',
                'agw-js-conv': 'str',
            };
            if (csrfToken) {
                headers['x-tt-passport-csrf-token'] = csrfToken;
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: payloadJson,
                    credentials: 'include',
                    signal: controller.signal,
                });
                clearTimeout(timer);
                if (!res.ok) {
                    const errBody = await res.text();
                    return {error: true, status: res.status, body: errBody.slice(0, 500)};
                }
                const body = await res.text();
                return {error: false, body: body};
            } catch(e) {
                clearTimeout(timer);
                return {error: true, status: 0, body: e.message};
            }
        }
        """
        payload_json = json.dumps(payload, ensure_ascii=False)
        timeout_ms = int(timeout * 1000)

        log.info("POST %s [browser fetch, timeout=%ds]", url.split("?")[0], timeout)
        result = await self._page.evaluate(
            js_code, [url, payload_json, timeout_ms]
        )

        if result.get("error"):
            status = result.get("status", 0)
            body = result.get("body", "")
            raise RuntimeError(
                f"samantha/chat/completion failed ({status}): {body[:500]}"
            )

        body = result.get("body", "")
        if body.lstrip().startswith("{"):
            try:
                err = json.loads(body)
                if isinstance(err, dict) and "code" in err:
                    raise RuntimeError(
                        f"samantha auth error: code={err.get('code')} "
                        f"msg={err.get('msg') or err.get('message', '')}"
                    )
            except json.JSONDecodeError:
                pass
        return body

    @staticmethod
    def _parse_samantha_sse(raw: str) -> List[Dict[str, Any]]:
        """Parse samantha SSE body into list of event dicts."""
        events = []
        for block in raw.split("\n\n"):
            if not block.strip():
                continue
            data_str = ""
            for line in block.strip().split("\n"):
                if line.startswith("data:"):
                    data_str = line[5:].strip()
            if not data_str:
                continue
            try:
                events.append(json.loads(data_str))
            except json.JSONDecodeError:
                continue
        return events

    async def generate_image(
        self,
        prompt: str,
        ratio: Optional[str] = None,
        ref_image_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate images using /samantha/chat/completion.

        Args:
            prompt: Text description of the image to generate.
            ratio: Aspect ratio ("1:1", "16:9", "9:16", "4:3", "3:4").
            ref_image_key: Optional uploaded image key for reference.

        Returns:
            Dict with 'images' list, each having url/width/height/key.
        """
        content_data: Dict[str, Any] = {"text": prompt}
        if ratio:
            content_data["ratio"] = ratio

        message: Dict[str, Any] = {
            "content": json.dumps(content_data, ensure_ascii=False),
            "content_type": 2009,
            "attachments": [],
            "references": [],
            "skill": {
                "skill_type": 3,
                "skill_type_no_default": 3,
                "skill_id": "3",
                "skill_id_no_default": "3",
            },
        }

        if ref_image_key:
            message["attachments"] = [
                {"type": "image", "key": ref_image_key,
                 "extra": {"refer_types": "overall"}}
            ]

        payload = {
            "messages": [message],
            "completion_option": {
                "is_regen": False,
                "with_suggest": True,
                "need_create_conversation": True,
                "launch_stage": 1,
                "is_replace": False,
                "is_delete": False,
                "is_ai_playground": False,
                "memory_type": 2,
                "message_from": 0,
                "use_deep_think": False,
                "use_auto_cot": False,
                "resend_for_regen": False,
                "enable_commerce_credit": False,
                "action_bar_skill_id": 3,
            },
            "evaluate_option": {"web_ab_params": ""},
            "local_conversation_id": str(uuid.uuid4()),
            "local_message_id": str(uuid.uuid4()),
        }

        log.info("generate_image: prompt=%s, ratio=%s", prompt[:50], ratio)
        raw = await self._samantha_request(payload, timeout=120)

        # Parse response - look for content_type=2010 (image output)
        images = []
        for data in self._parse_samantha_sse(raw):
            et = data.get("event_type")
            if et == 2005:
                detail = data.get("event_data", "")
                raise RuntimeError(f"generate_image error: {str(detail)[:500]}")
            if et != 2001:
                continue

            ed = data.get("event_data", {})
            if isinstance(ed, str):
                try:
                    ed = json.loads(ed)
                except json.JSONDecodeError:
                    continue

            msg = ed.get("message", {})
            if isinstance(msg, str):
                try:
                    msg = json.loads(msg)
                except json.JSONDecodeError:
                    continue

            if msg.get("content_type") != 2010:
                continue

            content_raw = msg.get("content", "")
            if isinstance(content_raw, str):
                try:
                    content = json.loads(content_raw)
                except json.JSONDecodeError:
                    continue
            else:
                content = content_raw

            for item in content.get("data", []):
                if not isinstance(item, dict):
                    continue
                ori = item.get("image_ori", {}) or {}
                raw_img = item.get("image_raw", {}) or {}
                thumb = item.get("image_thumb", {}) or {}
                images.append({
                    "key": item.get("key", ""),
                    "url": ori.get("url") or raw_img.get("url") or thumb.get("url", ""),
                    "width": ori.get("width") or thumb.get("width", 0),
                    "height": ori.get("height") or thumb.get("height", 0),
                    "format": ori.get("format") or thumb.get("format", ""),
                })

        log.info("generate_image: got %d images", len(images))
        return {"images": images, "prompt": prompt}

    async def generate_music(
        self,
        prompt: str,
        lyric: Optional[str] = None,
        genre: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate music using /samantha/chat/completion.

        Args:
            prompt: Text description of the music to generate.
            lyric: Explicit lyrics (optional).
            genre: Music genre (optional).

        Returns:
            Dict with 'tracks' list, each having audio_url/title/lyrics/duration.
        """
        import base64

        content_data: Dict[str, Any] = {"text": prompt}
        if lyric:
            content_data["lyric"] = lyric
        if genre:
            content_data["genre"] = genre

        message: Dict[str, Any] = {
            "content": json.dumps(content_data, ensure_ascii=False),
            "content_type": 2005,
            "attachments": [],
            "references": [],
            "skill": {
                "skill_type": 9,
                "skill_type_no_default": 9,
                "skill_id": "9",
                "skill_id_no_default": "9",
            },
        }

        payload = {
            "messages": [message],
            "completion_option": {
                "is_regen": False,
                "with_suggest": True,
                "need_create_conversation": True,
                "launch_stage": 1,
                "is_replace": False,
                "is_delete": False,
                "is_ai_playground": False,
                "memory_type": 2,
                "message_from": 0,
                "use_deep_think": False,
                "use_auto_cot": False,
                "resend_for_regen": False,
                "enable_commerce_credit": False,
                "action_bar_skill_id": 9,
            },
            "evaluate_option": {"web_ab_params": ""},
            "local_conversation_id": str(uuid.uuid4()),
            "local_message_id": str(uuid.uuid4()),
        }

        log.info("generate_music: prompt=%s", prompt[:50])
        raw = await self._samantha_request(payload, timeout=300)

        # Parse: find last content_type=2006 with video_model
        tracks = []
        final_content = None
        for data in self._parse_samantha_sse(raw):
            et = data.get("event_type")
            if et == 2005:
                detail = data.get("event_data", "")
                raise RuntimeError(f"generate_music error: {str(detail)[:500]}")
            if et != 2001:
                continue

            ed = data.get("event_data", {})
            if isinstance(ed, str):
                try:
                    ed = json.loads(ed)
                except json.JSONDecodeError:
                    continue

            msg = ed.get("message", {})
            if isinstance(msg, str):
                try:
                    msg = json.loads(msg)
                except json.JSONDecodeError:
                    continue

            if msg.get("content_type") not in (2006, 2004):
                continue

            content_raw = msg.get("content", "")
            if isinstance(content_raw, str):
                try:
                    content = json.loads(content_raw)
                except json.JSONDecodeError:
                    continue
            else:
                content = content_raw

            # Keep updating - we want the final (most complete) version
            final_content = content

        if not final_content:
            log.warning("generate_music: no content_type=2006 found")
            return {"tracks": [], "prompt": prompt}

        # Parse tasks
        tasks = final_content.get("tasks", {})
        if isinstance(tasks, dict):
            tasks_list = list(tasks.values())
        elif isinstance(tasks, list):
            tasks_list = tasks
        else:
            tasks_list = []

        for task in tasks_list:
            if not isinstance(task, dict):
                continue

            audio_url = ""
            duration = 0.0
            vm_str = task.get("video_model", "")
            if vm_str:
                try:
                    vm = json.loads(vm_str) if isinstance(vm_str, str) else vm_str
                    duration = vm.get("video_duration", 0.0)
                    vlist = vm.get("video_list", {})
                    for _q, vinfo in vlist.items():
                        main_url_b64 = vinfo.get("main_url", "")
                        if main_url_b64:
                            audio_url = base64.b64decode(main_url_b64).decode(
                                "utf-8", errors="replace"
                            )
                            break
                except (json.JSONDecodeError, Exception):
                    pass

            cover_url = ""
            cover = task.get("cover", {})
            if isinstance(cover, dict):
                cover_ori = cover.get("image_ori", {}) or {}
                cover_url = cover_ori.get("url", "")

            if audio_url or task.get("title"):
                tracks.append({
                    "audio_url": audio_url,
                    "title": task.get("title", ""),
                    "lyrics": task.get("lyric", ""),
                    "duration": duration,
                    "cover_url": cover_url,
                })

        log.info("generate_music: got %d tracks", len(tracks))
        return {"tracks": tracks, "prompt": prompt}

    async def generate_video_via_page(
        self,
        prompt: str,
        ref_image_url: Optional[str] = None,
        timeout: float = 600,
    ) -> Dict[str, Any]:
        """Generate a video by driving the Doubao web page directly.

        Doubao now pushes finished videos into the conversation instead of
        returning a pollable task_id over the samantha API, so the reliable
        path (same as doubao-account-pool) is: upload the reference image into
        the page input, type the prompt, submit, then watch the DOM for a new
        playable video element.
        """
        page = self._page
        if not page:
            raise RuntimeError("Browser page unavailable")

        import tempfile

        tmp_path: Optional[str] = None
        if ref_image_url:
            try:
                async with httpx.AsyncClient(timeout=60, follow_redirects=True) as hc:
                    resp = await hc.get(ref_image_url)
                    resp.raise_for_status()
                    suffix = ".png"
                    if "image/jpeg" in resp.headers.get("content-type", ""):
                        suffix = ".jpg"
                    with tempfile.NamedTemporaryFile(
                        delete=False, suffix=suffix,
                        dir=os.environ.get("TEMP") or None,
                    ) as fh:
                        fh.write(resp.content)
                        tmp_path = fh.name
            except Exception as exc:
                log.warning("generate_video: ref image download failed: %s", exc)
                tmp_path = None

            if tmp_path:
                try:
                    inputs = page.locator('input[type="file"]')
                    if await inputs.count() > 0:
                        await inputs.first.set_input_files(tmp_path)
                        await asyncio.sleep(2.5)
                        log.info("generate_video: reference image attached via file input")
                    else:
                        log.warning("generate_video: no file input found on page")
                except Exception as exc:
                    log.warning("generate_video: set_input_files failed: %s", exc)

        probe_js = self._VIDEO_PROBE_JS

        # baseline BEFORE submitting
        try:
            state0 = await page.evaluate(probe_js)
        except Exception:
            state0 = {"urls": [], "covers": []}
        baseline_urls = set(state0.get("urls", []))
        baseline_covers = set(state0.get("covers", []))
        baseline_done = int(state0.get("doneCount", 0))

        # fill prompt and submit
        full_prompt = prompt if ("直接生成" in prompt or "无需" in prompt) else (
            f"直接生成视频，无需向我确认参数：{prompt}"
        )
        send_js = """
        async (text) => {
            const input = document.querySelector('#flow-stream-msg-input')
                || document.querySelector('[contenteditable="true"]');
            if (!input) return 'no input';
            input.focus();
            document.execCommand('insertText', false, text);
            await new Promise(r => setTimeout(r, 500));
            input.dispatchEvent(new KeyboardEvent('keydown',
                {key: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true}));
            return 'sent';
        }
        """
        sent = await page.evaluate(send_js, full_prompt)
        if sent != "sent":
            raise RuntimeError(f"Failed to submit prompt in page: {sent}")
        log.info("generate_video: prompt submitted via page input")

        await asyncio.sleep(5)

        confirmed_pay = False
        param_confirmed = False
        gen_btn_clicked = False
        activated = False
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                state = await page.evaluate(probe_js)
            except Exception:
                await asyncio.sleep(8)
                continue

            if state.get("failed"):
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                return {"videos": [], "prompt": prompt,
                        "message": "Doubao reported video generation failure"}

            if state.get("needBtnClick"):
                try:
                    await page.evaluate(
                        "(() => { const all = Array.from(document.querySelectorAll"
                        "('[data-testid=\"ai-creation-common-button\"]'))"
                        ".filter(b => b.offsetParent !== null);"
                        " if (!all.length) return 'none';"
                        " const b = all[all.length - 1];"
                        " const inner = b.firstElementChild || b;"
                        " const r = inner.getBoundingClientRect();"
                        " const o = {bubbles: true, cancelable: true, button: 0,"
                        " buttons: 1, isPrimary: true, pointerId: 1, pointerType: 'mouse',"
                        " clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window};"
                        " inner.dispatchEvent(new PointerEvent('pointerover', o));"
                        " inner.dispatchEvent(new PointerEvent('pointerdown', o));"
                        " inner.dispatchEvent(new MouseEvent('mousedown', o));"
                        " inner.dispatchEvent(new PointerEvent('pointerup', o));"
                        " inner.dispatchEvent(new MouseEvent('mouseup', o));"
                        " inner.dispatchEvent(new MouseEvent('click', o));"
                        " return 'ok'; })()"
                    )
                    log.info("generate_video: clicked 确认生成 button (pointer sequence)")
                    await asyncio.sleep(3)
                except Exception as exc:
                    log.warning("generate_video: gen-button click failed: %s", exc)

            if state.get("needParamConfirm") and not param_confirmed:
                try:
                    await page.evaluate(send_js, "确认，按上述参数开始生成")
                    param_confirmed = True
                    log.info("generate_video: param confirmation sent")
                    await asyncio.sleep(5)
                    st = await page.evaluate(probe_js)
                    baseline_urls = set(st.get("urls", baseline_urls))
                    baseline_covers = set(st.get("covers", baseline_covers))
                    baseline_done = int(st.get("doneCount", baseline_done))
                except Exception as exc:
                    log.warning("generate_video: param-confirm failed: %s", exc)

            if state.get("needPayConfirm") and not confirmed_pay:
                try:
                    await page.evaluate(send_js, "确认，继续生成")
                    confirmed_pay = True
                    log.info("generate_video: paid-quota confirmation sent")
                    await asyncio.sleep(5)
                    st = await page.evaluate(probe_js)
                    baseline_urls = set(st.get("urls", baseline_urls))
                    baseline_covers = set(st.get("covers", baseline_covers))
                    baseline_done = int(st.get("doneCount", baseline_done))
                except Exception as exc:
                    log.warning("generate_video: pay-confirm failed: %s", exc)

            new_urls = []
            for u in state.get("urls", []):
                if u in baseline_urls:
                    continue
                try:
                    host = u.split("/")[2].lower()
                    # exclude page-self assets only; v*-vdl.doubao.com is the video CDN
                    if host and host not in ("doubao.com", "www.doubao.com"):
                        new_urls.append(u)
                except IndexError:
                    continue
            if new_urls:
                video_url = new_urls[-1]
                new_covers = [c for c in state.get("covers", []) if c not in baseline_covers]
                log.info("generate_video: collected video from DOM: %s", video_url[:100])
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                return {"videos": [{
                    "video_url": video_url,
                    "cover_url": new_covers[-1] if new_covers else "",
                    "width": 0, "height": 0, "duration": 0.0,
                }], "prompt": prompt}

            # New completion text but lazy player not activated yet — click the
            # newest video card so the <video> element loads its source.
            done_now = int(state.get("doneCount", 0))
            if done_now > baseline_done and not activated:
                try:
                    await page.evaluate(self._CLICK_LATEST_VIDEO_CARD_JS)
                    activated = True
                    log.info("generate_video: completion detected, video card clicked to activate player")
                except Exception as exc:
                    log.warning("generate_video: card click failed: %s", exc)

            await asyncio.sleep(8)

        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return {"videos": [], "prompt": prompt,
                "message": "Timed out waiting for the pushed video"}

    _VIDEO_PROBE_JS = """
    (() => {
        const visible = (el) => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 20 && r.height > 20
                && s.visibility !== "hidden" && s.display !== "none";
        };
        const urls = [];
        for (const v of Array.from(document.querySelectorAll('video')).filter(visible)) {
            const candidates = [
                v.currentSrc, v.src,
                v.getAttribute('data-src'), v.getAttribute('data-url'),
                v.getAttribute('data-video-url'), v.getAttribute('data-download-url'),
            ];
            for (const s of Array.from(v.querySelectorAll('source[src]'))) candidates.push(s.src);
            for (const u of candidates) {
                if (u && /^https?:\\/\\//i.test(u)) urls.push(u);
            }
        }
        const covers = Array.from(document.querySelectorAll('img'))
            .map(i => i.src).filter(s => s.includes('video_dsz_watermark'));
        const text = (document.body.innerText || '').replace(/\\s+/g, ' ');
        const doneMatches = text.match(/你的视频(?:已经|已)?生成好[了啦]|视频(?:已经|已)?生成(?:完成|成功|好[了啦])|生成视频(?:已经|已)?完成/g);
        const failed = /视频生成失败|生成视频失败/.test(text);
        const needPayConfirm = /付费额度/.test(text) && /是否继续生成/.test(text);
        const needParamConfirm = /视频生成参数确认|确认后我再?开始生成视频/.test(text);
        const genBtn = document.querySelector('[data-testid=\"ai-creation-common-button\"]');
        const needBtnClick = !!(genBtn && genBtn.offsetParent !== null
            && (genBtn.innerText || '').includes('确认生成'));
        return {urls: Array.from(new Set(urls)), covers,
                doneCount: doneMatches ? doneMatches.length : 0,
                failed, needPayConfirm, needParamConfirm, needBtnClick};
    })()
    """

    _CLICK_LATEST_VIDEO_CARD_JS = """
    async () => {
        const covers = Array.from(document.querySelectorAll('img'))
            .filter(i => i.src && i.src.includes('video_dsz_watermark'));
        if (covers.length === 0) return 'no covers';
        const img = covers[covers.length - 1];
        let node = img.parentElement, target = null;
        for (let i = 0; i < 8 && node; i++) {
            if (node.className && String(node.className).includes('video')) {
                target = node; break;
            }
            node = node.parentElement;
        }
        (target || img.parentElement).dispatchEvent(
            new MouseEvent('click', {bubbles: true, cancelable: true}));
        await new Promise(r => setTimeout(r, 2500));
        return 'clicked';
    }
    """

    async def generate_video(
        self,
        prompt: str,
        ratio: Optional[str] = None,
        ref_image_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate video using /samantha/chat/completion (async 2-step).

        Args:
            prompt: Text description of the video to generate.
            ratio: Aspect ratio ("16:9", "9:16", "1:1").
            ref_image_key: Optional image key (from upload_image) for img2video.

        Returns:
            Dict with 'videos' list, each having video_url/cover_url/duration.
        """
        import base64

        content_data: Dict[str, Any] = {"text": prompt}
        if ratio:
            content_data["ratio"] = ratio

        message: Dict[str, Any] = {
            "content": json.dumps(content_data, ensure_ascii=False),
            "content_type": 2020,
            "attachments": (
                [{"type": "image", "key": ref_image_key}] if ref_image_key else []
            ),
            "references": [],
            "skill": {
                "skill_type": 17,
                "skill_type_no_default": 17,
                "skill_id": "17",
                "skill_id_no_default": "17",
            },
        }

        payload = {
            "messages": [message],
            "completion_option": {
                "is_regen": False,
                "with_suggest": True,
                "need_create_conversation": True,
                "launch_stage": 1,
                "is_replace": False,
                "is_delete": False,
                "is_ai_playground": False,
                "memory_type": 2,
                "message_from": 0,
                "use_deep_think": False,
                "use_auto_cot": False,
                "resend_for_regen": False,
                "enable_commerce_credit": False,
                "action_bar_skill_id": 17,
            },
            "evaluate_option": {"web_ab_params": ""},
            "local_conversation_id": str(uuid.uuid4()),
            "local_message_id": str(uuid.uuid4()),
        }

        log.info("generate_video: prompt=%s, ratio=%s", prompt[:50], ratio)
        # Long timeout: with a reference image Doubao pushes the finished video
        # (content_type=2021) down this same SSE stream 1-3 min after the ack text.
        raw = await self._samantha_request(payload, timeout=310)
        log.info("generate_video: submit response head: %s", raw[:600].replace("\n", " | "))
        log.info("generate_video: submit response tail: %s", raw[-600:].replace("\n", " | "))

        # Phase 1: Extract async task_id from fin_reason
        task_id = None
        conv_id: Optional[str] = None
        text_parts = []
        for data in self._parse_samantha_sse(raw):
            et = data.get("event_type")
            if et == 2005:
                detail = data.get("event_data", "")
                raise RuntimeError(f"generate_video error: {str(detail)[:500]}")
            if et != 2001:
                cid = self.extract_conversation_id(data)
                if cid:
                    conv_id = cid
                continue

            ed = data.get("event_data", {})
            if isinstance(ed, str):
                try:
                    ed = json.loads(ed)
                except json.JSONDecodeError:
                    continue

            cid = self.extract_conversation_id(ed) if isinstance(ed, dict) else None
            if cid:
                conv_id = cid

            # Check for async task
            fin_reason = ed.get("fin_reason", {})
            if fin_reason and fin_reason.get("reason") == 1:
                async_task = fin_reason.get("async_task", {})
                task_id = async_task.get("id", "")

            # Collect text for error messages
            msg = ed.get("message", {})
            if isinstance(msg, str):
                try:
                    msg = json.loads(msg)
                except json.JSONDecodeError:
                    continue
            if msg.get("content_type") == 2001:
                content_raw = msg.get("content", "")
                if isinstance(content_raw, str):
                    try:
                        c = json.loads(content_raw)
                        text_parts.append(c.get("text", ""))
                    except json.JSONDecodeError:
                        pass

        full_text = "".join(text_parts)
        if "服务过载" in full_text or "重试" in full_text:
            raise RuntimeError("视频生成服务过载，请稍后重试")

        # The video may arrive on the same stream (img2video push) — check first.
        pushed = self._extract_videos_from_sse(raw)
        if pushed:
            log.info("generate_video: got %d videos from same stream", len(pushed))
            return {"videos": pushed, "prompt": prompt}

        if not task_id:
            # New Doubao flow: video task is accepted without a task_id and the
            # finished video is pushed into the conversation later. Fall back to
            # watching the conversation page in the browser for the video card.
            log.info(
                "generate_video: no task_id, watching conversation %s for pushed video",
                conv_id or "auto-detect",
            )
            return await self._wait_video_via_dom(conv_id or "", prompt)

        # Phase 2: Poll for result
        log.info("generate_video: polling task_id=%s", task_id)
        return await self._poll_video_result(task_id, prompt)

    async def _wait_video_via_dom(
        self, conversation_id: str, prompt: str, timeout: float = 300
    ) -> Dict[str, Any]:
        """Wait for the pushed video on the conversation page and collect its URL.

        Doubao's current video flow pushes the finished video into the
        conversation as a new message; the SPA renders it as a playable video
        card. Strategy (borrowed from doubao-account-pool):
          1. Navigate to the newest conversation (video tasks land there).
          2. If Doubao is waiting for a paid-quota confirmation, confirm it in
             the page input box.
          3. Baseline the existing video URLs, then poll until a NEW playable
             video URL appears (or a completion/failure text shows up).
        """
        page = self._page
        if not page:
            return {"videos": [], "prompt": prompt,
                    "message": "Browser page unavailable for video pickup"}

        # --- locate the video conversation ---
        target = conversation_id if conversation_id and conversation_id != "0" else None
        if not target or target not in (page.url or ""):
            try:
                if target:
                    await page.goto(
                        f"https://www.doubao.com/chat/{target}",
                        wait_until="domcontentloaded", timeout=30000,
                    )
                else:
                    newest = await page.evaluate(
                        "(() => { const a = Array.from(document.querySelectorAll('a[href*=\"/chat/\"]'))"
                        ".find(x => /\\/chat\\/\\d{10,}/.test(x.getAttribute('href') || ''));"
                        "return a ? a.getAttribute('href') : null; })()"
                    )
                    if newest:
                        await page.goto(
                            f"https://www.doubao.com{newest}",
                            wait_until="domcontentloaded", timeout=30000,
                        )
                        target = newest.rsplit("/", 1)[-1]
                await asyncio.sleep(4)
            except Exception as exc:
                log.warning("generate_video: goto conversation failed: %s", exc)

        probe_js = """
        (() => {
            const visible = (el) => {
                const r = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return r.width > 20 && r.height > 20
                    && s.visibility !== "hidden" && s.display !== "none";
            };
            const urls = [];
            for (const v of Array.from(document.querySelectorAll('video')).filter(visible)) {
                const candidates = [
                    v.currentSrc, v.src,
                    v.getAttribute('data-src'), v.getAttribute('data-url'),
                    v.getAttribute('data-video-url'), v.getAttribute('data-download-url'),
                ];
                for (const s of Array.from(v.querySelectorAll('source[src]'))) candidates.push(s.src);
                for (const u of candidates) {
                    if (u && /^https?:\\/\\//i.test(u)) urls.push(u);
                }
            }
            const covers = Array.from(document.querySelectorAll('img'))
                .map(i => i.src).filter(s => s.includes('video_dsz_watermark'));
            const text = (document.body.innerText || '').replace(/\\s+/g, ' ');
            const done = /你的视频(?:已经|已)?生成好[了啦]|视频(?:已经|已)?生成(?:完成|成功|好[了啦])|生成视频(?:已经|已)?完成/.test(text);
            const failed = /视频生成失败|生成视频失败/.test(text);
            const needPayConfirm = /付费额度/.test(text) && /是否继续生成/.test(text);
            return {urls: Array.from(new Set(urls)), covers, done, failed, needPayConfirm};
        })()
        """

        confirmed_pay = False
        try:
            state0 = await page.evaluate(probe_js)
        except Exception:
            state0 = {"urls": [], "covers": []}
        baseline_urls = set(state0.get("urls", []))
        baseline_covers = set(state0.get("covers", []))

        if state0.get("needPayConfirm") and not confirmed_pay:
            try:
                await page.evaluate(
                    "(async () => { const input = document.querySelector('#flow-stream-msg-input')"
                    " || document.querySelector('[contenteditable=\"true\"]');"
                    " if (!input) return 'no input'; input.focus();"
                    " document.execCommand('insertText', false, '确认，继续生成');"
                    " await new Promise(r => setTimeout(r, 400));"
                    " input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true}));"
                    " return 'confirmed'; })()"
                )
                confirmed_pay = True
                log.info("generate_video: paid-quota confirmation sent in page")
                await asyncio.sleep(5)
                # re-baseline after the confirmation turn
                st = await page.evaluate(probe_js)
                baseline_urls = set(st.get("urls", baseline_urls))
                baseline_covers = set(st.get("covers", baseline_covers))
            except Exception as exc:
                log.warning("generate_video: pay-confirm failed: %s", exc)

        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                state = await page.evaluate(probe_js)
            except Exception:
                await asyncio.sleep(8)
                continue

            if state.get("failed"):
                return {"videos": [], "prompt": prompt,
                        "message": "Doubao reported video generation failure"}

            new_urls = [
                u for u in state.get("urls", [])
                if u not in baseline_urls and "doubao.com" not in u.split("/")[2]
            ]
            if new_urls:
                video_url = new_urls[-1]
                new_covers = [c for c in state.get("covers", []) if c not in baseline_covers]
                log.info("generate_video: collected video from DOM: %s", video_url[:100])
                return {"videos": [{
                    "video_url": video_url,
                    "cover_url": new_covers[-1] if new_covers else "",
                    "width": 0, "height": 0, "duration": 0.0,
                }], "prompt": prompt}

            await asyncio.sleep(8)

        log.warning("generate_video: DOM watch timed out for conv %s", target or "?")
        return {"videos": [], "prompt": prompt,
                "message": "Timed out waiting for the pushed video"}

    async def _poll_video_result(
        self, task_id: str, prompt: str, timeout: float = 300
    ) -> Dict[str, Any]:
        """Poll /samantha/chat/completion with task_id for video result."""
        import base64

        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            poll_payload = {"task_id": task_id, "event_id": 0}
            # Use _samantha_request which now uses browser fetch
            raw = await self._samantha_request(poll_payload, timeout=60)

            videos = self._extract_videos_from_sse(raw)

            if videos:
                log.info("generate_video: got %d videos", len(videos))
                return {"videos": videos, "prompt": prompt}

            if asyncio.get_event_loop().time() >= deadline:
                log.warning("generate_video: timed out after %.0fs", timeout)
                return {"videos": [], "prompt": prompt,
                        "message": "Timed out waiting for video generation"}

            await asyncio.sleep(8)

    @staticmethod
    def _extract_videos_from_sse(raw: str) -> list:
        """Extract video entries (content_type=2021) from a samantha SSE body."""
        import base64

        videos = []
        for data in BrowserClient._parse_samantha_sse(raw):
            et = data.get("event_type")
            if et != 2001:
                continue

            ed = data.get("event_data", {})
            if isinstance(ed, str):
                try:
                    ed = json.loads(ed)
                except json.JSONDecodeError:
                    continue

            msg = ed.get("message", {})
            if isinstance(msg, str):
                try:
                    msg = json.loads(msg)
                except json.JSONDecodeError:
                    continue

            if msg.get("content_type") != 2021:
                continue

            content_raw = msg.get("content", "")
            if isinstance(content_raw, str):
                try:
                    content = json.loads(content_raw)
                except json.JSONDecodeError:
                    continue
            else:
                content = content_raw

            for item in content.get("data", [content]):
                if not isinstance(item, dict):
                    continue
                video_url = item.get("video_url", "") or item.get("url", "")
                if not video_url:
                    vm_str = item.get("video_model", "")
                    if vm_str:
                        try:
                            vm = json.loads(vm_str) if isinstance(vm_str, str) else vm_str
                            vlist = vm.get("video_list", {})
                            for _q, vinfo in vlist.items():
                                main_b64 = vinfo.get("main_url", "")
                                if main_b64:
                                    video_url = base64.b64decode(main_b64).decode(
                                        "utf-8", errors="replace"
                                    )
                                    break
                        except (json.JSONDecodeError, Exception):
                            pass

                cover_url = item.get("cover_url", "") or item.get("cover", {}).get("url", "")
                if video_url:
                    videos.append({
                        "video_url": video_url,
                        "cover_url": cover_url,
                        "width": item.get("width", 0),
                        "height": item.get("height", 0),
                        "duration": item.get("duration", 0.0),
                    })
        return videos

    # ------------------------------------------------------------------
    # File upload (TOS / ImageX flow)
    # ------------------------------------------------------------------

    async def upload_file(
        self,
        file_data: bytes,
        filename: str,
    ) -> Dict[str, Any]:
        """Upload a file to Doubao's storage (ByteDance TOS via ImageX proxy).

        4-step flow:
          1. POST /alice/resource/prepare_upload -> STS credentials
          2. GET  /top/v1?Action=ApplyImageUpload -> upload address
          3. POST https://{tos_host}/upload/v1/{store_uri} -> upload binary
          4. POST /top/v1?Action=CommitImageUpload -> confirm

        Returns:
            Dict with uri, name, size, file_type.
        """
        import zlib
        import hashlib
        import hmac as hmac_mod
        from datetime import datetime, timezone
        from urllib.parse import urlparse, parse_qs, quote as url_quote

        if not self._ready:
            raise RuntimeError("Browser not ready - need login first")

        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        file_size = len(file_data)
        crc32 = format(zlib.crc32(file_data) & 0xFFFFFFFF, "08x")

        query_params = self._build_query_params()
        signed_url = await self._sign_url(
            f"{DOUBAO_URL}/alice/resource/prepare_upload", query_params
        )
        cookie_str = await self._get_cookies_string()
        headers = self._build_headers(cookie_str)

        # Step 1: prepare_upload
        resp = await self._http.post(
            signed_url, headers=headers,
            json={"tenant_id": "5", "scene_id": "5", "resource_type": 1},
            timeout=30,
        )
        body = resp.json()
        if body.get("code") != 0:
            raise RuntimeError(f"prepare_upload failed: {body.get('msg', body)}")
        data = body["data"]
        service_id = data["service_id"]
        auth_token = data["upload_auth_token"]
        ak = auth_token["access_key"]
        sk = auth_token["secret_key"]
        st = auth_token["session_token"]

        # AWS V4 signing helper
        def _aws_sign_v4(method, url, req_body):
            parsed = urlparse(url)
            host = parsed.hostname or ""
            path = parsed.path or "/"
            now = datetime.now(timezone.utc)
            amz_date = now.strftime("%Y%m%dT%H%M%SZ")
            date_stamp = now.strftime("%Y%m%d")
            qparams = parse_qs(parsed.query, keep_blank_values=True)
            sorted_qp = sorted((k, v[0] if v else "") for k, v in qparams.items())
            canonical_qs = "&".join(
                f"{url_quote(k, safe='~')}={url_quote(v, safe='~')}" for k, v in sorted_qp
            )
            h2s = {"host": host, "x-amz-date": amz_date}
            if st:
                h2s["x-amz-security-token"] = st
            signed_h = ";".join(sorted(h2s.keys()))
            canonical_h = "".join(f"{k}:{v}\n" for k, v in sorted(h2s.items()))
            body_b = req_body if isinstance(req_body, bytes) else req_body.encode()
            payload_hash = hashlib.sha256(body_b).hexdigest()
            cr = f"{method}\n{path}\n{canonical_qs}\n{canonical_h}\n{signed_h}\n{payload_hash}"
            scope = f"{date_stamp}/cn-north-1/imagex/aws4_request"
            cr_hash = hashlib.sha256(cr.encode()).hexdigest()
            sts = f"AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{cr_hash}"
            def _s(key, msg):
                return hmac_mod.new(key, msg.encode("utf-8"), hashlib.sha256).digest()
            k_d = _s(f"AWS4{sk}".encode("utf-8"), date_stamp)
            k_r = _s(k_d, "cn-north-1")
            k_sv = _s(k_r, "imagex")
            k_sg = _s(k_sv, "aws4_request")
            sig = hmac_mod.new(k_sg, sts.encode("utf-8"), hashlib.sha256).hexdigest()
            auth_str = f"AWS4-HMAC-SHA256 Credential={ak}/{scope}, SignedHeaders={signed_h}, Signature={sig}"
            result = {"Authorization": auth_str, "x-amz-date": amz_date, "x-amz-content-sha256": payload_hash}
            if st:
                result["x-amz-security-token"] = st
            return result

        # Step 2: ApplyImageUpload
        file_ext = f".{ext}" if ext else ""
        apply_url = (
            f"{DOUBAO_URL}/top/v1?"
            f"Action=ApplyImageUpload&Version=2018-08-01"
            f"&ServiceId={service_id}&NeedFallback=true"
            f"&FileSize={file_size}&FileExtension={file_ext}"
            f"&s=jdnfglwfkl"
        )
        sign_h = _aws_sign_v4("GET", apply_url, "")
        sign_h["Cookie"] = cookie_str
        resp = await self._http.get(apply_url, headers=sign_h, timeout=30)
        result_data = resp.json().get("Result")
        if not result_data:
            raise RuntimeError(f"ApplyImageUpload failed: {resp.json()}")
        upload_addr = result_data["UploadAddress"]
        store_info = upload_addr["StoreInfos"][0]
        store_uri = store_info["StoreUri"]
        tos_auth = store_info["Auth"]
        session_key = upload_addr["SessionKey"]
        upload_hosts = upload_addr.get("UploadHosts", [])

        # Step 3: Upload binary to TOS
        tos_host = upload_hosts[0] if upload_hosts else "tos-mya2lf.vodupload.com"
        upload_url = f"https://{tos_host}/upload/v1/{store_uri}"
        resp = await self._http.post(
            upload_url, content=file_data,
            headers={"Authorization": tos_auth, "Content-CRC32": crc32},
            timeout=120,
        )
        tos_resp = resp.json()
        if tos_resp.get("code") != 2000:
            raise RuntimeError(f"TOS upload failed: {tos_resp}")

        # Step 4: CommitImageUpload
        commit_url = (
            f"{DOUBAO_URL}/top/v1?"
            f"Action=CommitImageUpload&Version=2018-08-01"
            f"&ServiceId={service_id}"
        )
        commit_body = json.dumps({"SessionKey": session_key})
        sign_h2 = _aws_sign_v4("POST", commit_url, commit_body)
        sign_h2["Content-Type"] = "application/json"
        sign_h2["Cookie"] = cookie_str
        resp = await self._http.post(commit_url, content=commit_body, headers=sign_h2, timeout=30)
        body = resp.json()
        results = body.get("Result", {}).get("Results", [])
        if not results or results[0].get("UriStatus") != 2000:
            raise RuntimeError(f"CommitImageUpload failed: {body}")

        log.info("File uploaded: %s -> %s", filename, store_uri)
        return {"uri": store_uri, "name": filename, "size": file_size, "file_type": ext}


    async def get_file_download_url(
        self,
        uri: str,
        expire_seconds: int = 3600,
    ) -> Dict[str, Any]:
        """Get a temporary CDN URL for a previously uploaded file."""
        if not self._ready:
            raise RuntimeError("Browser not ready - need login first")
        query_params = self._build_query_params()
        signed_url = await self._sign_url(
            f"{DOUBAO_URL}/alice/message/get_file_url", query_params
        )
        cookie_str = await self._get_cookies_string()
        headers = self._build_headers(cookie_str)
        ext = uri.rsplit(".", 1)[-1] if "." in uri else ""
        resp = await self._http.post(
            signed_url,
            headers=headers,
            json={
                "uris": [uri],
                "type": "file",
                "format": ext,
                "expire_second": expire_seconds,
            },
            timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"get_file_url failed ({resp.status_code}): {resp.text[:500]}")
        body = resp.json()
        if body.get("code") != 0:
            raise RuntimeError(f"get_file_url error: {body.get('msg', body)}")
        file_urls = body.get("data", {}).get("file_urls", [])
        if not file_urls:
            raise RuntimeError("get_file_url returned no file_urls")
        return file_urls[0].get("main_url", "")

    async def upload_image(
        self,
        image_bytes: bytes,
        filename: str = "image.png",
    ) -> Dict[str, Any]:
        """Upload an image and return metadata usable by chat/image generation."""
        if not self._ready:
            raise RuntimeError("Browser not ready - need login first")
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
        query_params = self._build_query_params()
        signed_url = await self._sign_url(
            f"{DOUBAO_URL}/samantha/pages/upload_image", query_params
        )
        cookie_str = await self._get_cookies_string()
        headers = self._build_headers(cookie_str)
        headers.pop("Content-Type", None)
        files = {
            "data": (filename, image_bytes, f"image/{ext}"),
            "file_type": (None, ext),
        }
        resp = await self._http.post(signed_url, headers=headers, files=files, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"Image upload failed ({resp.status_code}): {resp.text[:500]}")
        body = resp.json()
        if body.get("code") != 0:
            raise RuntimeError(f"Image upload error: {body.get('msg', body)}")
        uri = body.get("data", {}).get("uri", "")
        if not uri:
            raise RuntimeError(f"Image upload returned no uri: {body}")
        query_params = self._build_query_params()
        file_url = await self._sign_url(
            f"{DOUBAO_URL}/alice/message/get_file_url", query_params
        )
        cookie_str = await self._get_cookies_string()
        headers = self._build_headers(cookie_str)
        resp = await self._http.post(
            file_url,
            headers=headers,
            json={
                "uris": [uri],
                "type": "image",
                "format": ext,
                "expire_second": 3600,
            },
            timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"get_file_url failed ({resp.status_code}): {resp.text[:500]}")
        body = resp.json()
        if body.get("code") != 0:
            raise RuntimeError(f"get_file_url error: {body.get('msg', body)}")
        file_urls = body.get("data", {}).get("file_urls", [])
        if not file_urls:
            raise RuntimeError("get_file_url returned no file_urls")
        info = file_urls[0]
        return {
            "uri": info.get("uri", uri),
            "cdn_url": info.get("main_url", ""),
            "name": filename,
            "format": ext,
            "width": "64",
            "height": "64",
        }

    async def chat_with_file(
        self,
        text: str,
        file_uri: str,
        file_name: str,
        file_size: int,
        use_deep_think: int = 0,
    ) -> Dict[str, Any]:
        """Chat with a file attachment. The AI will read the file and answer.

        Args:
            text: Question about the file.
            file_uri: URI from upload_file().
            file_name: Original filename.
            file_size: File size in bytes.
            use_deep_think: 0=quick, 1=think, 3=expert.

        Returns:
            Dict with 'text' and 'conversation_id'.
        """
        if not self._ready:
            raise RuntimeError("Browser not ready - need login first")

        msg_uuid = str(uuid.uuid4())
        local_conv_id = f"local_{uuid.uuid4().int % 10**16}"
        now_ms = int(time.time() * 1000)
        now_sec = int(time.time())

        if isinstance(file_uri, list):
            file_refs = file_uri
        else:
            file_refs = [{"uri": file_uri, "name": file_name, "size": file_size}]
        file_attachments = []
        for file_ref in file_refs:
            file_attachments.append({
                "type": 3,
                "identifier": str(uuid.uuid4()),
                "file": {
                    "uri": file_ref.get("uri", ""),
                    "url": "",
                    "file_type": 0,
                    "name": file_ref.get("name", "file.txt"),
                    "size": int(file_ref.get("size") or 0),
                },
                "parse_state": 1,
                "review_state": 1,
                "upload_status": 1,
                "progress": 100,
                "src": "",
            })

        payload = {
            "client_meta": {
                "local_conversation_id": local_conv_id,
                "conversation_id": "",
                "bot_id": DEFAULT_BOT_ID,
                "last_section_id": "",
                "last_message_index": None,
            },
            "messages": [{
                "local_message_id": msg_uuid,
                "content_block": [
                    {
                        "block_type": 10052,
                        "content": {
                            "attachment_block": {
                                "attachments": file_attachments
                            },
                            "pc_event_block": "",
                        },
                        "block_id": str(uuid.uuid4()),
                        "parent_id": "",
                        "meta_info": [],
                        "append_fields": [],
                    },
                    {
                        "block_type": 10000,
                        "content": {
                            "text_block": {"text": text, "icon_url": "", "icon_url_dark": "", "summary": ""},
                            "pc_event_block": "",
                        },
                        "block_id": str(uuid.uuid4()),
                        "parent_id": "",
                        "meta_info": [],
                        "append_fields": [],
                    },
                ],
                "message_status": 0,
            }],
            "option": {
                "send_message_scene": "", "create_time_ms": now_ms, "collect_id": "",
                "is_audio": False, "answer_with_suggest": False, "tts_switch": False,
                "need_deep_think": use_deep_think, "click_clear_context": False,
                "from_suggest": False, "is_regen": False, "is_replace": False,
                "disable_sse_cache": False, "select_text_action": "",
                "resend_for_regen": False, "scene_type": 0,
                "unique_key": str(uuid.uuid4()), "start_seq": 0,
                "need_create_conversation": True, "regen_query_id": [],
                "edit_query_id": [], "regen_instruction": "",
                "no_replace_for_regen": False, "message_from": 0,
                "shared_app_name": "", "shared_app_id": "",
                "sse_recv_event_options": {"support_chunk_delta": True},
                "is_ai_playground": False,
                "recovery_option": {"is_recovery": False, "req_create_time_sec": now_sec, "append_sse_event_scene": 0},
                "message_storage_type": 0,
            },
            "ext": {
                "use_deep_think": str(use_deep_think), "fp": self._fp or "",
                "collection_id": "", "commerce_credit_config_enable": "0",
                "sub_conv_firstmet_type": "1",
            },
        }

        query_params = self._build_query_params()
        query_string = "&".join(f"{k}={v}" for k, v in sorted(query_params.items()))
        url = f"/chat/completion?{query_string}"

        # Use browser fetch (non-streaming, collect full response)
        js_code = """
        async ([url, payloadJson]) => {
            const csrf = document.cookie.match(/passport_csrf_token=([^;]+)/);
            const csrfToken = csrf ? csrf[1] : '';
            const headers = {
                'Content-Type': 'application/json',
                'agw-js-conv': 'str',
            };
            if (csrfToken) headers['x-tt-passport-csrf-token'] = csrfToken;
            const res = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: payloadJson,
                credentials: 'include',
            });
            if (!res.ok) {
                const errBody = await res.text();
                return {error: true, status: res.status, body: errBody.slice(0, 500)};
            }
            const body = await res.text();
            return {error: false, body: body};
        }
        """
        payload_json = json.dumps(payload, ensure_ascii=False)
        log.info("POST /chat/completion [chat_with_file, browser fetch]")
        result = await self._page.evaluate(js_code, [url, payload_json])

        if result.get("error"):
            raise RuntimeError(
                f"chat_with_file error {result.get('status')}: {result.get('body', '')[:200]}"
            )

        full_text = ""
        conv_id = None
        raw_body = result.get("body", "")
        for block in raw_body.split("\n"):
            line = block.strip()
            if not line or not line.startswith("data: "):
                continue
            data_str = line[6:]
            if not data_str or data_str == "{}":
                continue
            try:
                data = json.loads(data_str)
                full_text += self._extract_text(data)
                if not conv_id:
                    cid = self.extract_conversation_id(data)
                    if cid and cid != "0":
                        conv_id = cid
            except json.JSONDecodeError:
                continue

        return {"text": full_text, "conversation_id": conv_id}
