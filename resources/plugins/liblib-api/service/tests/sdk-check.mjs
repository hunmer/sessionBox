/**
 * 用 OpenAI 官方 SDK 验证 liblib-api 服务兼容性（真实调用，消耗少量 power）
 * 运行: node sdk-check.mjs   （需先 npm i openai，服务运行在 19201）
 */
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: process.env.LIBLIB_BASE_URL || 'http://127.0.0.1:19201/v1',
  apiKey: 'sdk-check', // 任意值；传 pageId 可指定账号
});

const section = (name) => console.log(`\n===== ${name} =====`);

section('models.list');
const models = await client.models.list();
const ids = models.data.map((m) => m.id);
console.log(`共 ${ids.length} 个模型，例如:`, ids.slice(0, 5).join(', '), '...');

section('chat.completions.create（文本）');
const t0 = Date.now();
const chat = await client.chat.completions.create({
  model: 'qwen-3-vl-flash',
  messages: [
    { role: 'system', content: '你是一个简洁的助手，回答不超过20字。' },
    { role: 'user', content: 'liblib 是什么平台？' },
  ],
});
console.log(`回复 (${Date.now() - t0}ms):`, chat.choices[0].message.content);
console.log('usage:', JSON.stringify(chat.usage));
console.log('finish_reason:', chat.choices[0].finish_reason);

section('images.generate（图片）');
const t1 = Date.now();
const img = await client.images.generate({
  model: 'z-image',
  prompt: '一只橘猫趴在窗台上晒太阳，暖色调摄影风格',
  size: '1024x1024',
  n: 1,
});
const url = img.data[0].url;
console.log(`生成 (${Date.now() - t1}ms):`, url?.slice(0, 90) + '...');
const head = await fetch(url, { method: 'HEAD' });
console.log('产物 HEAD 状态:', head.status, head.headers.get('content-type'), `${head.headers.get('content-length')} bytes`);

section('images.edit（图生图）');
// 复用上一步生成的图片作为编辑输入
const t2 = Date.now();
const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
const edited = await client.images.edit({
  model: 'qwen-edit',
  image: new File([bytes], 'input.png', { type: 'image/png' }),
  prompt: '把场景换成夜晚，猫在月光下',
  size: '1024x1024',
});
const editUrl = edited.data[0].url;
console.log(`编辑 (${Date.now() - t2}ms):`, editUrl?.slice(0, 90) + '...');
const editHead = await fetch(editUrl, { method: 'HEAD' });
console.log('编辑产物 HEAD 状态:', editHead.status, `${editHead.headers.get('content-length')} bytes`);

console.log('\n全部通过 ✓');
process.exit(0);
