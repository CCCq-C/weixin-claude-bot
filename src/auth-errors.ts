export class AuthExpiredError extends Error {
  constructor(message = "WeChat bot token expired or unauthorized") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

type AuthPayload = Record<string, unknown>;

const AUTH_ERROR_CODES = new Set([401, 403]);
const AUTH_ERROR_TEXT = /(invalid\s*token|token\s*expired|unauthorized|forbidden|auth)/i;

function numberField(payload: AuthPayload, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

function textField(payload: AuthPayload, keys: string[]): string {
  return keys
    .map((key) => payload[key])
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

export function isAuthExpiredPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as AuthPayload;
  const code = numberField(obj, ["ret", "errCode", "error_code", "code", "status"]);
  if (code !== null && AUTH_ERROR_CODES.has(code)) return true;
  const text = textField(obj, ["errMsg", "errmsg", "message", "error", "msg"]);
  return AUTH_ERROR_TEXT.test(text);
}

export function isAuthExpiredError(error: unknown): error is AuthExpiredError {
  return error instanceof AuthExpiredError;
}

export function reloginHint(): string {
  return "微信登录状态可能已失效。请删除 data/account.json 后重新运行 npm run login 扫码。";
}
