/**
 * 真实账号实测驱动：从 SessionBox bridge 取 sessionid，调用本插件客户端（凭据实时读取，不落盘）
 * 用法: node real-test.mjs [pageId] [credit|gen|compose <url>|video]
 * pageId 省略时用第一个 jimeng 页面；也可经 HTTP 服务（19203）验证，见 demo.html
 * 凭据实时读取，不打印。
 */
import { createClient } from '../api-client.mjs';

const BRIDGE = 'http://127.0.0.1:19100';
const pageId = process.argv[2] || 'e4e7f43f-5eb7-423c-b774-2e104e5418ee'; // 大号
const action = process.argv[3] || 'credit';

async function getSessionid(id) {
  const res = await fetch(`${BRIDGE}/api/v1/pages/${id}/cookies?url=${encodeURIComponent('https://jimeng.jianying.com')}`);
  const data = await res.json();
  if (!data.cookies) throw new Error(String(data.error || 'bridge 返回异常'));
  const sid = data.cookies.find((c) => c.name === 'sessionid')?.value;
  if (!sid) throw new Error('cookie 中无 sessionid');
  return sid;
}

const sessionid = await getSessionid(pageId);
const api = createClient({
  sessionid,
  onLog: (m) => console.error(`[log] ${m}`),
});

if (action === 'credit' || action === 'whoami') {
  const info = await api.getAccountInfo();
  const credit = await api.getCredit();
  console.log(JSON.stringify({ userId: info.user_id, name: info.name || info.screen_name, credit }, null, 2));
} else if (action === 'gen') {
  const r = await api.generateImages({ prompt: '一只可爱的橘猫坐在窗台上，温暖阳光，水彩插画风格', model: 'jimeng-4.5', ratio: '1:1', resolution: '1k' });
  console.log(JSON.stringify({ historyId: r.historyId, elapsedMs: r.elapsedMs, count: r.urls.length, urls: r.urls }, null, 2));
} else if (action === 'compose') {
  const imageUrl = process.argv[4];
  if (!imageUrl) throw new Error('用法: compose <图片URL>');
  const r = await api.generateImageComposition({ prompt: '把这张图变成水彩画风格', images: [imageUrl], model: 'jimeng-4.5', ratio: '1:1', resolution: '1k' });
  console.log(JSON.stringify({ historyId: r.historyId, elapsedMs: r.elapsedMs, count: r.urls.length, urls: r.urls }, null, 2));
} else if (action === 'video') {
  const r = await api.generateVideo({ prompt: '一只橘猫在窗台伸懒腰，缓慢镜头推进', model: 'jimeng-video-2.0', ratio: '16:9', duration: 5 });
  console.log(JSON.stringify({ historyId: r.historyId, elapsedMs: r.elapsedMs, url: r.url }, null, 2));
}
