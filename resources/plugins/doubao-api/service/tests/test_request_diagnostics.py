import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from doubao2api.browser_client import BrowserClient
from doubao2api.unified_server import _safe_error_context


class RequestDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    async def test_source_web_id_is_compared_without_modifying_browser(self):
        client = BrowserClient(page_id="page-1")
        client._context = MagicMock()
        client._context.add_init_script = AsyncMock()

        with patch("sessionbox.SessionBoxClient.execute", new_callable=AsyncMock) as execute:
            execute.return_value = {"web_id": "7690768299747247631"}
            await client._inspect_sessionbox_identity()

        self.assertEqual(client._source_web_id, "7690768299747247631")
        client._context.add_init_script.assert_not_awaited()

    async def test_invalid_source_web_id_is_ignored(self):
        client = BrowserClient(page_id="page-1")
        client._context = MagicMock()
        client._context.add_init_script = AsyncMock()
        with patch("sessionbox.SessionBoxClient.execute", new_callable=AsyncMock) as execute:
            execute.return_value = {"web_id": "bad;code"}
            await client._inspect_sessionbox_identity()
        self.assertIsNone(client._source_web_id)
        client._context.add_init_script.assert_not_awaited()


class SafeErrorContextTests(unittest.TestCase):
    def test_reports_verify_decision_without_opaque_challenge(self):
        event = {
            "error_code": 710022004,
            "error_msg": "rate limited",
            "extra": {"decision": '{"type":"verify","subtype":"semantic_reasoning",'
                                  '"verify_scene":"doubao_message_web","log_id":"trace123",'
                                  '"detail":"sensitive-challenge"}',
                      "secret": "do-not-log"},
        }
        result = _safe_error_context(event)
        self.assertEqual(result["decision_type"], "verify")
        self.assertEqual(result["verify_scene"], "doubao_message_web")
        self.assertEqual(result["error_msg"], "rate limited")
        self.assertIn("error_code", result["event_keys"])
        self.assertIn("secret", result["extra_keys"])
        self.assertNotIn("sensitive-challenge", str(result))
        self.assertNotIn("do-not-log", str(result))

    def test_verification_retry_requires_cooldown(self):
        client = BrowserClient(page_id="page-1")
        with patch("doubao2api.browser_client.time.monotonic", return_value=100):
            client.record_failure(710022004)
        with patch("doubao2api.browser_client.time.monotonic", return_value=130):
            self.assertFalse(client.verification_retry_due())
        with patch("doubao2api.browser_client.time.monotonic", return_value=161):
            self.assertTrue(client.verification_retry_due())


if __name__ == "__main__":
    unittest.main()
