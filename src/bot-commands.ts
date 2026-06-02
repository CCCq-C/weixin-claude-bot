export type BotCommand =
  | { type: "stop" }
  | { type: "status" }
  | { type: "help" }
  | { type: "reset" };

const COMMANDS: Record<string, BotCommand["type"]> = {
  "/stop": "stop",
  "/cancel": "stop",
  "/中断": "stop",
  "/停止": "stop",
  "/status": "status",
  "/状态": "status",
  "/help": "help",
  "/帮助": "help",
  "/reset": "reset",
  "/重置": "reset",
};

export function parseBotCommand(text: string): BotCommand | null {
  const key = text.trim().toLowerCase();
  const type = COMMANDS[key];
  return type ? { type } : null;
}

export function helpText(): string {
  return [
    "可用命令：",
    "/status 查看当前任务状态",
    "/stop 中断当前任务",
    "/reset 清除当前 Claude 会话",
    "/help 查看帮助",
  ].join("\n");
}
