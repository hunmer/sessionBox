from __future__ import annotations

from typing import Any, Dict, List, Optional
import httpx


class SessionBoxError(RuntimeError):
    """Raised when the SessionBox bridge rejects a request."""


class SessionBoxClient:
    def __init__(self, base_url: str = "http://127.0.0.1:19100", timeout: float = 30.0, token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.token = token

    async def _request(self, method: str, path: str, **kwargs: Any) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            headers = dict(kwargs.pop("headers", {}) or {})
            if self.token:
                headers["Authorization"] = f"Bearer {self.token}"
            response = await client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)
        if response.is_error:
            try:
                detail = response.json().get("error", response.text)
            except Exception:
                detail = response.text
            raise SessionBoxError(f"SessionBox request failed ({response.status_code}): {detail}")
        return response.json()

    async def get_cookies(self, page_id: str, url: Optional[str] = None) -> List[Dict[str, Any]]:
        params = {"url": url} if url else None
        result = await self._request("GET", f"/api/v1/pages/{page_id}/cookies", params=params)
        return result.get("cookies", [])

    async def open_page(self, page_id: str, url: str) -> Dict[str, Any]:
        return await self._request("POST", f"/api/v1/pages/{page_id}/open", json={"url": url})

    async def execute(self, page_id: str, code: str) -> Any:
        result = await self._request("POST", f"/api/v1/pages/{page_id}/execute", json={"code": code})
        return result.get("result")
