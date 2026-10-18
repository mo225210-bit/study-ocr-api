// ============================================================
// 作业纸文字识别接口（部署在 EdgeOne Pages 的 Node.js 函数）
// 路由：https://你的项目名.edgeone.app/api/ocr
//
// 用法：
//   GET  → 返回提示文字（可用来确认接口活着）
//   POST { "image": "data:image/jpeg;base64,..." }  （纯 base64 也行）
//   返回 { "ok": true, "text": "识别出的文字" }
//   出错返回 { "ok": false, "error": "原因" }
//
// 首次使用前，去 EdgeOne Pages 控制台 → 你的项目 → 设置 → 环境变量，
// 添加两个变量（值在腾讯云控制台 → 访问管理 → API 密钥管理里拿）：
//   TENCENT_SECRET_ID
//   TENCENT_SECRET_KEY
// 并确认腾讯云账号已开通「文字识别 OCR」服务
// （通用印刷体识别每个月有 1000 次免费额度，够用）。
// ============================================================

import crypto from 'node:crypto';

const OCR_HOST = 'ocr.tencentcloudapi.com';
const OCR_SERVICE = 'ocr';
const OCR_ACTION = 'GeneralBasicOCR'; // 通用印刷体识别
const OCR_VERSION = '2018-11-19';
const OCR_REGION = 'ap-guangzhou';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...CORS_HEADERS },
  });
}

// 腾讯云 API 3.0 签名（TC3-HMAC-SHA256），不依赖任何 npm 包
async function callTencentOcr(imageBase64) {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error('服务端未配置密钥：请在 EdgeOne 控制台配置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY 后重新部署');
  }

  const payload = JSON.stringify({ ImageBase64: imageBase64 });
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  // 1. 拼接规范请求串
  const hashedPayload = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + OCR_HOST + '\nx-tc-action:' + OCR_ACTION.toLowerCase() + '\n';
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n');

  // 2. 拼接待签名串
  const scope = date + '/' + OCR_SERVICE + '/tc3_request';
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    scope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n');

  // 3. 计算签名
  const kDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest();
  const kService = crypto.createHmac('sha256', kDate).update(OCR_SERVICE).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    'TC3-HMAC-SHA256 Credential=' + secretId + '/' + scope +
    ', SignedHeaders=' + signedHeaders +
    ', Signature=' + signature;

  // 4. 发起请求
  const res = await fetch('https://' + OCR_HOST + '/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: authorization,
      'X-TC-Action': OCR_ACTION,
      'X-TC-Version': OCR_VERSION,
      'X-TC-Region': OCR_REGION,
      'X-TC-Timestamp': String(timestamp),
    },
    body: payload,
  });
  const data = await res.json();
  if (data.Response && data.Response.Error) {
    const e = data.Response.Error;
    throw new Error('腾讯云 ' + e.Code + ': ' + e.Message);
  }
  const lines = ((data.Response && data.Response.TextDetections) || [])
    .map(d => d.DetectedText || '')
    .filter(Boolean);
  return lines.join('\n');
}

export default async function onRequest({ request }) {
  // 浏览器跨域预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  // GET 当作健康检查
  if (request.method === 'GET') {
    return jsonResponse({ ok: true, hint: 'OCR 接口正常。用法：POST { image: "data:image/jpeg;base64,..." }' });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: '只支持 GET 和 POST' }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    let image = body.image || body.imageBase64 || '';
    if (typeof image !== 'string' || !image.trim()) {
      return jsonResponse({ ok: false, error: '缺少 image 字段' }, 400);
    }
    if (image.startsWith('data:')) {
      const comma = image.indexOf(',');
      if (comma >= 0) image = image.slice(comma + 1);
    }
    // 腾讯云限制 base64 最大 7MB
    if (image.length > 7 * 1024 * 1024 * 4 / 3) {
      return jsonResponse({ ok: false, error: '图片太大（超过 7MB），请换小一点的图' }, 413);
    }
    const text = await callTencentOcr(image);
    return jsonResponse({ ok: true, text });
  } catch (err) {
    return jsonResponse({ ok: false, error: (err && err.message) || String(err) }, 500);
  }
}
