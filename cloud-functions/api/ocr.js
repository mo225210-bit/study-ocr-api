
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tencentcloud = require("tencentcloud-sdk-nodejs-ocr");

const OcrClient = tencentcloud.ocr.v20181119.Client;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = env.ALLOWED_ORIGIN || "";

  const corsHeaders = {
    "Access-Control-Allow-Origin":
      origin && origin === allowedOrigin ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };

  if (request.method === "OPTIONS") {
    if (!allowedOrigin || origin !== allowedOrigin) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "只支持 POST 请求" }, 405, corsHeaders);
  }

  if (!allowedOrigin || origin !== allowedOrigin) {
    return json({ error: "网页域名未获授权" }, 403, corsHeaders);
  }

  const secretId = env.TENCENTCLOUD_SECRET_ID;
  const secretKey = env.TENCENTCLOUD_SECRET_KEY;

  if (!secretId || !secretKey) {
    return json({ error: "后端尚未配置腾讯云密钥" }, 500, corsHeaders);
  }

  try {
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return json({ error: "请求格式必须是 JSON" }, 400, corsHeaders);
    }

    const body = await request.json();
    let imageBase64 = body.imageBase64;

    if (typeof imageBase64 !== "string" || !imageBase64) {
      return json({ error: "缺少 imageBase64 图片数据" }, 400, corsHeaders);
    }

    // 兼容 data:image/jpeg;base64,... 格式
    imageBase64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");

    // 控制单次请求体积，避免上传过大的图片
    if (imageBase64.length > 4 * 1024 * 1024) {
      return json(
        { error: "图片过大，请先压缩图片后重试" },
        413,
        corsHeaders
      );
    }

    const client = new OcrClient({
      credential: {
        secretId,
        secretKey
      },
      region: "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: "ocr.tencentcloudapi.com"
        }
      }
    });

    const result = await client.GeneralBasicOCR({
      ImageBase64: imageBase64,
      LanguageType: "zh"
    });

    const text = (result.TextDetections || [])
      .map(item => item.DetectedText || "")
      .filter(Boolean)
      .join("\n");

    return json(
      {
        success: true,
        text,
        count: (result.TextDetections || []).length
      },
      200,
      corsHeaders
    );
  } catch (error) {
    // 不把密钥或完整请求内容返回给浏览器
    console.error("OCR request failed:", error?.message || "unknown error");

    return json(
      {
        error: "文字识别失败，请检查图片、接口配置或腾讯云服务状态"
      },
      500,
      corsHeaders
    );
  }
}
