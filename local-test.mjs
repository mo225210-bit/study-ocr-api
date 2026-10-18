// 本地测试 ocr.js：不走 EdgeOne，直接调 handler
process.env.TENCENT_SECRET_ID = 'AKIDfake0000000000000000000000000000';
process.env.TENCENT_SECRET_KEY = 'fakekey0000000000000000000000000000';

const handler = (await import('./cloud-functions/api/ocr.js')).default;
const mod = { onRequest: handler };
const base = 'https://test.edgeone.app/api/ocr';

// 1. GET 健康检查
let r = await mod.onRequest({ request: new Request(base, { method: 'GET' }) });
console.log('GET', r.status, await r.text());

// 2. OPTIONS 预检
r = await mod.onRequest({ request: new Request(base, { method: 'OPTIONS' }) });
console.log('OPTIONS', r.status, JSON.stringify([...r.headers.entries()]));

// 3. POST 缺字段
r = await mod.onRequest({ request: new Request(base, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }) });
console.log('POST空', r.status, await r.text());

// 4. POST 假图片 + 假密钥 → 预期收到腾讯云的结构化报错（证明签名格式、请求路径正确）
const tinyBase64 = Buffer.from('fake').toString('base64');
r = await mod.onRequest({ request: new Request(base, { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,' + tinyBase64 }), headers: { 'Content-Type': 'application/json' } }) });
console.log('POST假图', r.status, await r.text());
