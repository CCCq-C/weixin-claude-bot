import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  aesEcbPaddedSize,
  buildMediaMessageItem,
  getMediaKindFromPath,
  uploadBufferToCdn,
} from "../src/weixin-media.js";

const uploaded = {
  downloadEncryptedQueryParam: "download-param",
  aeskeyHex: "00112233445566778899aabbccddeeff",
  plaintextSize: 1234,
  ciphertextSize: 1248,
};

test("routes common file extensions to Weixin media item kinds", () => {
  assert.equal(getMediaKindFromPath("demo.docx"), "file");
  assert.equal(getMediaKindFromPath("demo.xlsx"), "file");
  assert.equal(getMediaKindFromPath("demo.pptx"), "file");
  assert.equal(getMediaKindFromPath("demo.pdf"), "file");
  assert.equal(getMediaKindFromPath("demo.png"), "image");
  assert.equal(getMediaKindFromPath("demo.jpg"), "image");
  assert.equal(getMediaKindFromPath("demo.mp4"), "video");
});

test("builds file image and video message items", () => {
  const fileItem = buildMediaMessageItem("file", uploaded, "报价表.xlsx");
  assert.equal(fileItem.type, 4);
  assert.equal(fileItem.file_item?.file_name, "报价表.xlsx");
  assert.equal(fileItem.file_item?.len, "1234");

  const imageItem = buildMediaMessageItem("image", uploaded, "photo.png");
  assert.equal(imageItem.type, 2);
  assert.equal(imageItem.image_item?.mid_size, 1248);

  const videoItem = buildMediaMessageItem("video", uploaded, "clip.mp4");
  assert.equal(videoItem.type, 5);
  assert.equal(videoItem.video_item?.video_size, 1248);
});

test("calculates AES-128-ECB padded size", () => {
  assert.equal(aesEcbPaddedSize(0), 16);
  assert.equal(aesEcbPaddedSize(16), 32);
  assert.equal(aesEcbPaddedSize(17), 32);
});

test("uploads encrypted bytes to CDN and requires x-encrypted-param", async () => {
  const aesKey = crypto.randomBytes(16);
  const calls: Array<{ url: string; method?: string }> = [];

  await assert.rejects(
    uploadBufferToCdn({
      buffer: Buffer.from("hello"),
      uploadParam: "upload-param",
      filekey: "file-key",
      aesKey,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), method: init?.method });
        return new Response("ok");
      },
    }),
    /x-encrypted-param/,
  );

  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /encrypted_query_param=upload-param/);

  const uploadedInfo = await uploadBufferToCdn({
    buffer: Buffer.from("hello"),
    uploadFullUrl: "https://example.com/upload",
    filekey: "file-key",
    aesKey,
    fetchImpl: async () =>
      new Response("ok", {
        headers: { "x-encrypted-param": "download-param" },
      }),
  });

  assert.equal(uploadedInfo.downloadEncryptedQueryParam, "download-param");
  assert.equal(uploadedInfo.ciphertextSize, 16);
});
