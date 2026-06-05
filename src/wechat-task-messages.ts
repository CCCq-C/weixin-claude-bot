export function buildTaskStartedMessage(): string {
  return [
    "🫡收到～任务开始啦！",
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

  return `✅用时 ${elapsedSeconds} 秒，您可以说下一个任务啦！`;
}
