import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateReply,
  isSensitiveFileName,
  rankFileCandidates,
} from "../src/file-search.js";

const files = [
  {
    path: "/Users/me/Downloads/客户报价表.xlsx",
    name: "客户报价表.xlsx",
    size: 2_300_000,
    modifiedAt: new Date("2026-06-11T18:40:00Z"),
  },
  {
    path: "/Users/me/Desktop/AI课程介绍.pptx",
    name: "AI课程介绍.pptx",
    size: 12_400_000,
    modifiedAt: new Date("2026-06-12T03:20:00Z"),
  },
  {
    path: "/Users/me/Documents/报价汇总.docx",
    name: "报价汇总.docx",
    size: 800_000,
    modifiedAt: new Date("2026-06-10T03:20:00Z"),
  },
];

test("ranks candidates by keyword, extension, and recency", () => {
  const ranked = rankFileCandidates(files, {
    query: "报价表",
    extensions: [".xlsx"],
    now: new Date("2026-06-12T04:00:00Z"),
  });

  assert.equal(ranked[0].name, "客户报价表.xlsx");
});

test("uses time hints when ranking candidates", () => {
  const ranked = rankFileCandidates(
    [
      {
        path: "/Users/me/Desktop/报价表-A.xlsx",
        name: "报价表-A.xlsx",
        size: 1200,
        modifiedAt: new Date("2026-06-12T02:00:00Z"),
      },
      {
        path: "/Users/me/Desktop/报价表-B.xlsx",
        name: "报价表-B.xlsx",
        size: 1200,
        modifiedAt: new Date("2026-06-11T09:00:00Z"),
      },
    ],
    {
      query: "昨天 报价表",
      extensions: [".xlsx"],
      now: new Date("2026-06-12T04:00:00Z"),
    },
  );

  assert.equal(ranked[0].name, "报价表-B.xlsx");
});

test("builds a candidate reply that asks the user to choose", () => {
  const reply = buildCandidateReply(files.slice(0, 2), {
    query: "报价",
    highRisk: false,
  });

  assert.match(reply, /我找到 2 个可能的文件/);
  assert.match(reply, /1\. 客户报价表\.xlsx/);
  assert.match(reply, /回复序号确认发送/);
  assert.match(reply, /直接发其他任务会自动退出文件流程/);
});

test("shows enough path context in candidate replies", () => {
  const reply = buildCandidateReply(
    [
      {
        path: "/Users/me/Desktop/douyin-skill-small-offline-package/skill/SKILL.md",
        name: "SKILL.md",
        size: 3000,
        modifiedAt: new Date("2026-06-12T10:00:00Z"),
      },
    ],
    { query: "md", highRisk: false },
  );

  assert.match(reply, /douyin-skill-small-offline-package\/skill/);
});

test("flags sensitive file names", () => {
  assert.equal(isSensitiveFileName("api-token.txt"), true);
  assert.equal(isSensitiveFileName("身份证扫描件.pdf"), true);
  assert.equal(isSensitiveFileName("课程介绍.pptx"), false);
});

test("adds extra warning for high risk candidates", () => {
  const reply = buildCandidateReply([files[0]], {
    query: "合同",
    highRisk: true,
  });

  assert.match(reply, /敏感文件/);
  assert.match(reply, /回复“确认”后发送/);
});
