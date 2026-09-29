import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from doubao2api.browser_client import BrowserClient, _SessionBoxPage
from doubao2api.unified_server import _safe_error_context


class RequestDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    async def test_samantha_request_uses_sessionbox_tab_without_playwright_page(self):
        client = BrowserClient(page_id="page-1")
        client._ready = True
        client._build_query_params = MagicMock(return_value={})
        client._execute_sessionbox = AsyncMock(side_effect=[
            True, {"items": [{"body": 'data: {"event_type":2001}\n\n'}], "done": True}, True,
        ])

        result = await client._samantha_request({"messages": []}, timeout=2)

        self.assertEqual(result, 'data: {"event_type":2001}\n\n')
        self.assertEqual(client._execute_sessionbox.await_count, 3)

    async def test_video_generation_uses_sessionbox_page(self):
        client = BrowserClient(page_id="page-1")
        client._execute_sessionbox = AsyncMock(side_effect=[
            {"urls": [], "covers": [], "doneCount": 0},
            "sent",
            {"urls": ["https://video.example/result.mp4"], "covers": [], "doneCount": 1},
        ])
        with patch("doubao2api.browser_client.asyncio.sleep", new_callable=AsyncMock):
            result = await client.generate_video_via_page("test video")
        self.assertEqual(result["videos"][0]["video_url"], "https://video.example/result.mp4")
        self.assertEqual(client._execute_sessionbox.await_count, 3)

    async def test_sessionbox_page_invokes_function_expressions(self):
        client = BrowserClient(page_id="page-1")
        client._execute_sessionbox = AsyncMock(return_value="clicked")
        page = _SessionBoxPage(client)
        self.assertEqual(await page.evaluate("async () => 'clicked'"), "clicked")
        self.assertIn("(async () => 'clicked')()", client._execute_sessionbox.await_args.args[0])

    async def test_sessionbox_sse_preserves_delta_event_names(self):
        client = BrowserClient(page_id="page-1")
        client._build_query_params = MagicMock(return_value={})
        client._sign_url = AsyncMock(return_value="https://www.doubao.com/chat/completion")
        body = ('event: CHUNK_DELTA\ndata: {"text":"你好"}\n\n'
                'event: CHUNK_DELTA\ndata: {"text":"，我是豆包。"}\n\n')
        client._execute_sessionbox = AsyncMock(side_effect=[
            True, {"items": [{"http_status": 200, "body": body}], "done": True}, True,
        ])

        events = [event async for event in client._sessionbox_chat_stream({}, None, 0)]

        self.assertEqual([event["_event"] for event in events], ["CHUNK_DELTA", "CHUNK_DELTA"])
        self.assertEqual("".join(event["text"] for event in events if event["_event"] == "CHUNK_DELTA"),
                         "你好，我是豆包。")

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
    def test_sessionbox_stream_text_fragments_are_not_dropped(self):
        self.assertEqual(BrowserClient._extract_text({"_sessionbox_stream": True, "text": "我是"}), "我是")
        self.assertEqual(BrowserClient._extract_text({"_sessionbox_stream": True, "text": "豆包"}), "豆包")

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
