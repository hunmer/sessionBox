import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from doubao2api.browser_client import BrowserClient


class LoginStateTests(unittest.IsolatedAsyncioTestCase):
    async def test_sessionbox_authenticated_page_overrides_clone_login_button(self):
        client = BrowserClient(page_id="page-1")
        client._context = MagicMock()
        client._context.cookies = AsyncMock(return_value=[{"name": "sessionid", "value": "present"}])
        client._page = MagicMock(url="https://www.doubao.com/chat/")
        button = client._page.locator.return_value
        button.count = AsyncMock(return_value=1)
        button.first.is_visible = AsyncMock(return_value=True)
        avatar = MagicMock()
        avatar.count = AsyncMock(return_value=0)
        client._page.locator.side_effect = lambda selector: button if "登录" in selector else avatar
        client._extract_params = AsyncMock()
        client._seed_ms_token = AsyncMock()
        client._setup_fetch_bridge = AsyncMock()
        client._verify_fetch_hook = AsyncMock()
        client._wait_for_signing = AsyncMock()

        with patch("sessionbox.SessionBoxClient.execute", new_callable=AsyncMock) as execute:
            execute.return_value = {"url": "https://www.doubao.com/chat/", "has_login_button": False}
            await client._check_login_state()

        self.assertTrue(client.is_ready)
        execute.assert_awaited_once()

    async def test_sessionbox_login_button_does_not_authenticate_clone(self):
        client = BrowserClient(page_id="page-1")
        client._context = MagicMock()
        client._context.cookies = AsyncMock(return_value=[{"name": "sessionid", "value": "present"}])
        client._page = MagicMock(url="https://www.doubao.com/chat/")
        button = MagicMock()
        button.count = AsyncMock(return_value=1)
        button.first.is_visible = AsyncMock(return_value=True)
        avatar = MagicMock()
        avatar.count = AsyncMock(return_value=0)
        client._page.locator.side_effect = lambda selector: button if "登录" in selector else avatar

        with patch("sessionbox.SessionBoxClient.execute", new_callable=AsyncMock) as execute:
            execute.return_value = {"url": "https://www.doubao.com/chat/", "has_login_button": True}
            await client._check_login_state()

        self.assertFalse(client.is_ready)


if __name__ == "__main__":
    unittest.main()
