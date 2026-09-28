"""
Local captcha server: pre-loads ByteDance captcha SDK, receives verify_data
via SSE push, renders captcha immediately, reports result back.
"""
from __future__ import annotations

import json
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from typing import Optional

CAPTCHA_HTML = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>Doubao 验证</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif;
         background: #f5f5f5; display: flex; justify-content: center;
         align-items: center; min-height: 100vh; flex-direction: column; }
  #status { text-align: center; color: #666; font-size: 15px; padding: 20px; }
  .spinner { display: inline-block; width: 18px; height: 18px;
    border: 3px solid #ddd; border-top-color: #4A90D9;
    border-radius: 50%; animation: spin 0.8s linear infinite;
    vertical-align: middle; margin-right: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #captcha_container { min-width: 300px; }
  .success { color: #4CAF50 !important; font-weight: bold; }
  .error { color: #F44336 !important; }
  #log { position: fixed; bottom: 0; left: 0; right: 0; background: #222;
         color: #0f0; font-size: 11px; font-family: monospace; padding: 6px 10px;
         max-height: 120px; overflow-y: auto; opacity: 0.85; }
</style>
</head>
<body>
  <div id="status"><span class="spinner"></span>正在加载验证 SDK...</div>
  <div id="captcha_container"></div>
  <div id="log"></div>

<script>
function log(msg) {
  var el = document.getElementById('log');
  var t = new Date().toLocaleTimeString();
  el.innerHTML += '[' + t + '] ' + msg + '<br>';
  el.scrollTop = el.scrollHeight;
  console.log('[captcha] ' + msg);
}

log('页面已加载');

var SDK_READY = false;
var VERIFY_PARAMS = null;

function loadSDK(urls, idx) {
  if (idx >= urls.length) {
    log('ERROR: 所有 CDN 均加载失败');
    document.getElementById('status').innerHTML = '<span class="error">SDK 加载失败</span>';
    return;
  }
  log('加载 SDK: ' + urls[idx].substring(0, 60) + '...');
  var s = document.createElement('script');
  s.src = urls[idx];
  s.crossOrigin = 'anonymous';
  s.onload = function() {
    SDK_READY = true;
    log('SDK 加载成功! bdCaptcha=' + (typeof window.bdCaptcha));
    document.getElementById('status').innerHTML = '<span class="spinner"></span>SDK 已加载，等待验证挑战...';
    if (VERIFY_PARAMS) renderCaptcha(VERIFY_PARAMS);
  };
  s.onerror = function() {
    log('CDN ' + idx + ' 失败，尝试下一个...');
    loadSDK(urls, idx + 1);
  };
  document.head.appendChild(s);
}

loadSDK([
  'https://lf-rc1.yhgfb-cn-static.com/obj/rc-verifycenter/rmc-captcha/1.0.0.739/captcha.js',
  'https://lf-rc2.yhgfb-cn-static.com/obj/rc-verifycenter/rmc-captcha/1.0.0.739/captcha.js',
  'https://lf-cdn-tos.bytescm.com/obj/rc-verifycenter/rmc-captcha/1.0.0.739/captcha.js'
], 0);

function renderCaptcha(params) {
  log('renderCaptcha called, SDK_READY=' + SDK_READY + ', bdCaptcha=' + (typeof window.bdCaptcha));
  if (!SDK_READY || !window.bdCaptcha) {
    VERIFY_PARAMS = params;
    log('SDK 未就绪，已缓存 challenge');
    return;
  }
  document.getElementById('status').style.display = 'none';
  document.getElementById('captcha_container').innerHTML = '';
  log('正在初始化验证码...');

  try {
    var inst = new window.bdCaptcha.CaptchaVerify({
      info: {
        aid: params.aid || '582478',
        appName: params.appName || 'doubao',
        lang: params.lang || 'zh',
        did: params.did || '',
        fp: params.fp || '',
        pageId: '27032'
      },
      ele: 'captcha_container',
      host: params.host || 'https://verify.zijieapi.com',
      env: {
        h5_check_version: '4.0.16',
        product_host: 'https://www.doubao.com',
        vc_version: '1.0.0.739'
      },
      successCb: function(result) {
        log('SUCCESS! result=' + JSON.stringify(result));
        document.getElementById('status').style.display = 'block';
        document.getElementById('status').innerHTML = '<span class="success">&#10003; 验证成功！可以关闭此页面</span>';
        document.getElementById('captcha_container').innerHTML = '';
        fetch('/captcha_result', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({status: 'success', result: result})
        }).catch(function(e) { log('POST result error: ' + e); });
      },
      closeCb: function() {
        log('验证关闭');
        document.getElementById('status').style.display = 'block';
        document.getElementById('status').textContent = '验证已关闭';
        fetch('/captcha_result', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({status: 'closed'})
        }).catch(function(e) { log('POST close error: ' + e); });
      },
      feedbackSubmitCb: function() {},
      log: function(data) { log('sdk-log: ' + JSON.stringify(data)); }
    });
    inst.init();
    log('调用 render()...');
    inst.render(params.verify_data);
    log('render() 已调用');
  } catch(e) {
    log('ERROR: ' + e.message);
    document.getElementById('status').style.display = 'block';
    document.getElementById('status').innerHTML = '<span class="error">错误: ' + e.message + '</span>';
  }
}

log('连接 SSE...');
var evtSource = new EventSource('/captcha_sse');
evtSource.onopen = function() { log('SSE 已连接'); };
evtSource.onmessage = function(e) {
  log('SSE 收到数据 (' + e.data.length + ' chars)');
  try {
    var params = JSON.parse(e.data);
    renderCaptcha(params);
  } catch(err) {
    log('SSE 解析错误: ' + err.message);
  }
};
evtSource.onerror = function(e) {
  log('SSE 连接错误，2秒后重试...');
  setTimeout(function() {
    evtSource.close();
    evtSource = new EventSource('/captcha_sse');
    evtSource.onopen = function() { log('SSE 重新连接成功'); };
    evtSource.onmessage = arguments.callee.caller ? arguments.callee.caller : function(ev) {
      log('SSE 收到数据 (' + ev.data.length + ' chars)');
      try { renderCaptcha(JSON.parse(ev.data)); } catch(err) { log('解析错误: ' + err); }
    };
  }, 2000);
};
</script>
</body>
</html>
"""


class CaptchaServer:
    """Local HTTP server that pre-loads captcha SDK and renders challenges."""

    def __init__(self, port: int = 0):
        self._challenge_queue: queue.Queue = queue.Queue()
        self._result_queue: queue.Queue = queue.Queue()
        self._sse_clients: list = []
        self._lock = threading.Lock()
        self._pending_challenge: Optional[str] = None
        self.port = port
        self._server: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None

        parent = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.path == "/" or self.path == "/captcha":
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(CAPTCHA_HTML.encode("utf-8"))

                elif self.path == "/captcha_sse":
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "keep-alive")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    with parent._lock:
                        parent._sse_clients.append(self.wfile)
                        pending = parent._pending_challenge
                    if pending:
                        try:
                            self.wfile.write(f"data: {pending}\n\n".encode("utf-8"))
                            self.wfile.flush()
                        except Exception:
                            pass
                    try:
                        while True:
                            time.sleep(1)
                            try:
                                self.wfile.write(b": keepalive\n\n")
                                self.wfile.flush()
                            except Exception:
                                break
                    except Exception:
                        pass
                    finally:
                        with parent._lock:
                            if self.wfile in parent._sse_clients:
                                parent._sse_clients.remove(self.wfile)
                else:
                    self.send_response(404)
                    self.end_headers()

            def do_POST(self):
                if self.path == "/captcha_result":
                    length = int(self.headers.get("Content-Length", 0))
                    body = self.rfile.read(length).decode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(b'{"ok":true}')
                    try:
                        result = json.loads(body)
                        with parent._lock:
                            parent._pending_challenge = None
                        parent._result_queue.put(result)
                    except Exception:
                        pass
                else:
                    self.send_response(404)
                    self.end_headers()

            def do_OPTIONS(self):
                self.send_response(200)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.end_headers()

        self._handler_class = Handler

    def start(self) -> int:
        class _ThreadedServer(ThreadingMixIn, HTTPServer):
            daemon_threads = True

        self._server = _ThreadedServer(("127.0.0.1", self.port), self._handler_class)
        self.port = self._server.server_address[1]
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self.port

    def stop(self):
        if self._server:
            self._server.shutdown()

    def push_challenge(self, params: dict) -> None:
        """Push verify_data to all connected SSE clients and store as pending."""
        data = json.dumps(params, ensure_ascii=False)
        msg = f"data: {data}\n\n".encode("utf-8")
        with self._lock:
            self._pending_challenge = data
            dead = []
            for wfile in self._sse_clients:
                try:
                    wfile.write(msg)
                    wfile.flush()
                except Exception:
                    dead.append(wfile)
            for d in dead:
                self._sse_clients.remove(d)

    def wait_result(self, timeout: float = 120) -> Optional[dict]:
        """Wait for captcha result from the browser."""
        try:
            return self._result_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/captcha"
