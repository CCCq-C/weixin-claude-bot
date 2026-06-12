import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_INFO, postSigned } from "./api.js";

export type MediaKind = "file" | "image" | "video";

export type UploadedMediaInfo = {
  downloadEncryptedQueryParam: string;
  aeskeyHex: string;
  plaintextSize: number;
  ciphertextSize: number;
};

export type WeixinMediaMessageItem = {
  type: 2 | 4 | 5;
  image_item?: {
    media: WeixinCdnMedia;
    mid_size: number;
  };
  file_item?: {
    media: WeixinCdnMedia;
    file_name: string;
    len: string;
  };
  video_item?: {
    media: WeixinCdnMedia;
    video_size: number;
  };
};

type WeixinCdnMedia = {
  encrypt_query_param: string;
  aes_key: string;
  encrypt_type: 1;
};

type FetchLike = typeof fetch;

type UploadUrlResp = {
  ret?: number;
  errMsg?: string;
  upload_full_url?: string;
  upload_param?: string;
};

type SendResp = { ret?: number; errCode?: number; errMsg?: string };

const UPLOAD_MEDIA_TYPE = {
  image: 1,
  video: 2,
  file: 3,
} as const satisfies Record<MediaKind, number>;

const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
export const MAX_SEND_FILE_BYTES = 100 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"]);

export function getMediaKindFromPath(filePath: string): MediaKind {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "file";
}

export function aesEcbPaddedSize(size: number): number {
  const blockSize = 16;
  return Math.floor(size / blockSize) * blockSize + blockSize;
}

export function encryptAesEcb(buffer: Buffer, aesKey: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-ecb", aesKey, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
}

export async function uploadBufferToCdn(params: {
  buffer: Buffer;
  uploadFullUrl?: string;
  uploadParam?: string;
  filekey: string;
  aesKey: Buffer;
  cdnBaseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<UploadedMediaInfo> {
  const encrypted = encryptAesEcb(params.buffer, params.aesKey);
  const uploadUrl =
    params.uploadFullUrl ??
    buildCdnUploadUrl(params.uploadParam, params.filekey, params.cdnBaseUrl ?? DEFAULT_CDN_BASE_URL);
  const fetchImpl = params.fetchImpl ?? fetch;
  const res = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(encrypted.length),
    },
    body: new Uint8Array(encrypted),
  });

  if (!res.ok) {
    throw new Error(`CDN 上传失败：HTTP ${res.status}`);
  }

  const downloadEncryptedQueryParam = res.headers.get("x-encrypted-param")?.trim();
  if (!downloadEncryptedQueryParam) {
    throw new Error("CDN 上传失败：缺少 x-encrypted-param，已停止发送附件。");
  }

  return {
    downloadEncryptedQueryParam,
    aeskeyHex: params.aesKey.toString("hex"),
    plaintextSize: params.buffer.length,
    ciphertextSize: encrypted.length,
  };
}

export function buildMediaMessageItem(
  kind: MediaKind,
  uploaded: UploadedMediaInfo,
  fileName: string,
): WeixinMediaMessageItem {
  const media = buildCdnMedia(uploaded);

  if (kind === "image") {
    return {
      type: 2,
      image_item: {
        media,
        mid_size: uploaded.ciphertextSize,
      },
    };
  }

  if (kind === "video") {
    return {
      type: 5,
      video_item: {
        media,
        video_size: uploaded.ciphertextSize,
      },
    };
  }

  return {
    type: 4,
    file_item: {
      media,
      file_name: fileName,
      len: String(uploaded.plaintextSize),
    },
  };
}

export async function uploadLocalFileToWeixin(params: {
  baseUrl: string;
  botToken: string;
  toUserId: string;
  filePath: string;
  cdnBaseUrl?: string;
  signal?: AbortSignal;
}): Promise<{ kind: MediaKind; fileName: string; uploaded: UploadedMediaInfo }> {
  const stat = await fs.stat(params.filePath);
  if (!stat.isFile()) throw new Error("只能发送文件，不能发送文件夹。");
  if (stat.size > MAX_SEND_FILE_BYTES) {
    throw new Error("文件超过 100MB，已停止发送。");
  }

  const buffer = await fs.readFile(params.filePath);
  const kind = getMediaKindFromPath(params.filePath);
  const fileName = path.basename(params.filePath);
  const aesKey = crypto.randomBytes(16);
  const filekey = crypto.randomBytes(16).toString("hex");
  const rawfilemd5 = crypto.createHash("md5").update(buffer).digest("hex");
  const ciphertextSize = aesEcbPaddedSize(buffer.length);

  const uploadUrlResp = await postSigned<UploadUrlResp>(
    params.baseUrl,
    params.botToken,
    "/ilink/bot/getuploadurl",
    {
      filekey,
      media_type: UPLOAD_MEDIA_TYPE[kind],
      to_user_id: params.toUserId,
      rawsize: buffer.length,
      rawfilemd5,
      filesize: ciphertextSize,
      no_need_thumb: true,
      aeskey: aesKey.toString("hex"),
      base_info: BASE_INFO,
    },
    params.signal,
  );

  if (typeof uploadUrlResp.ret === "number" && uploadUrlResp.ret !== 0) {
    throw new Error(`getuploadurl ret=${uploadUrlResp.ret} ${uploadUrlResp.errMsg ?? ""}`);
  }

  const uploaded = await uploadBufferToCdn({
    buffer,
    uploadFullUrl: uploadUrlResp.upload_full_url?.trim() || undefined,
    uploadParam: uploadUrlResp.upload_param,
    filekey,
    aesKey,
    cdnBaseUrl: params.cdnBaseUrl,
  });

  return { kind, fileName, uploaded };
}

export async function sendLocalFileAttachment(params: {
  baseUrl: string;
  botToken: string;
  toUserId: string;
  filePath: string;
  contextToken: string;
  cdnBaseUrl?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const { kind, fileName, uploaded } = await uploadLocalFileToWeixin(params);
  const item = buildMediaMessageItem(kind, uploaded, fileName);
  await sendMediaMessageItem({
    baseUrl: params.baseUrl,
    botToken: params.botToken,
    toUserId: params.toUserId,
    contextToken: params.contextToken,
    item,
    signal: params.signal,
  });
}

function buildCdnUploadUrl(
  uploadParam: string | undefined,
  filekey: string,
  cdnBaseUrl: string,
): string {
  if (!uploadParam) throw new Error("CDN 上传失败：缺少 upload_param。");
  const base = cdnBaseUrl.endsWith("/") ? cdnBaseUrl.slice(0, -1) : cdnBaseUrl;
  const url = new URL(`${base}/upload`);
  url.searchParams.set("encrypted_query_param", uploadParam);
  url.searchParams.set("filekey", filekey);
  return url.toString();
}

function buildCdnMedia(uploaded: UploadedMediaInfo): WeixinCdnMedia {
  return {
    encrypt_query_param: uploaded.downloadEncryptedQueryParam,
    aes_key: Buffer.from(uploaded.aeskeyHex).toString("base64"),
    encrypt_type: 1,
  };
}

async function sendMediaMessageItem(params: {
  baseUrl: string;
  botToken: string;
  toUserId: string;
  contextToken: string;
  item: WeixinMediaMessageItem;
  signal?: AbortSignal;
}): Promise<void> {
  const r = await postSigned<SendResp>(
    params.baseUrl,
    params.botToken,
    "/ilink/bot/sendmessage",
    {
      msg: {
        from_user_id: "",
        to_user_id: params.toUserId,
        client_id: crypto.randomUUID(),
        message_type: 2,
        message_state: 2,
        item_list: [params.item],
        context_token: params.contextToken,
      },
      base_info: BASE_INFO,
    },
    params.signal,
  );
  if (typeof r.ret === "number" && r.ret !== 0) {
    throw new Error(`sendmessage ret=${r.ret} ${r.errMsg ?? ""}`);
  }
}
