
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tencentcloud = require("tencentcloud-sdk-nodejs-ocr");

const OcrClient = tencentcloud.ocr.v20181119.Client;

const client = new OcrClient({
  credential: {
    secretId: process.env.TENCENTCLOUD_SECRET_ID,
    secretKey: process.env.TENCENTCLOUD_SECRET_KEY
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
