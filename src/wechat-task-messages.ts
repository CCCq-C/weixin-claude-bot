export function buildTaskStartedMessage(): string {
  return [
    "收到，任务已开始。",
    "",
    "处理流程：",
    "1. 读取你的微信消息",
    "2. 调用 Claude Code 在本地工作目录执行",
    "3. 等待 Claude 返回结果",
    "4. 必要时分片发回微信",
    "",
    "可发送 /status 查看状态，或 /stop 中断。",
  ].join("\n");
}

type TaskFinishedMessageOptions = {
  resultDelivered?: boolean;
};

export function buildTaskFinishedMessage(
  elapsedSeconds: number,
  options: TaskFinishedMessageOptions = {},
): string {
  if (options.resultDelivered === false) {
    return [
      `本次处理已结束，用时 ${elapsedSeconds} 秒。`,
      "但结果发送过程中断，请查看终端日志或稍后重试。",
    ].join("\n");
  }

  return [
    `本次处理已结束，用时 ${elapsedSeconds} 秒。`,
    "你可以继续发下一条需求。",
  ].join("\n");
}
