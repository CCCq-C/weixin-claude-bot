# weixin-claude-bot

用微信消息驱动本机 Claude Code CLI，在 Obsidian Vault 或任意本地工作目录里读写文件。

这个项目适合已经会使用终端、Node.js 和 Claude Code CLI 的开发者共同探索。它不是面向普通用户的无脑安装包，也不建议在未理解安全边界前部署到生产环境。

## 它能做什么

```text
手机微信
  -> 腾讯 ilinkai bot 通道
  -> 本机 weixin-claude-bot 长轮询
  -> spawn claude -p
  -> Claude 在 VAULT_PATH 中读写文件
  -> 简短结果回到微信
```

已验证能力：

- 微信扫码登录，保存本地 bot account 状态
- 长轮询接收文本和语音转文字消息
- 通过 sendmessage 回复微信
- 调用本机 Claude Code CLI
- 按微信用户保存 Claude `session_id`，支持多轮上下文
- 可用 pm2 常驻运行

## 安全提醒

这个项目默认会让 Claude Code 在 `VAULT_PATH` 里工作，并使用：

```text
--permission-mode bypassPermissions
```

这意味着白名单用户发来的指令可以触发 Claude 读写文件、联网和运行工具。请务必：

- 只把 `VAULT_PATH` 指向你愿意让 Claude 操作的目录
- 登录后立刻把自己的 `userId` 写入 `WHITELIST_USER_IDS`
- 不要提交 `.env`、`data/account.json`、`data/claude-sessions.json` 或日志
- 不要把这个 bot 暴露给不信任的人
- 遇到异常时立即停止进程

## 环境要求

- macOS
- Node.js 20+
- Claude Code CLI 已安装并完成登录
- 可以访问 `https://ilinkai.weixin.qq.com`

检查：

```bash
node -v
which claude && claude --version
curl -sI https://ilinkai.weixin.qq.com | head -1
```

## 快速开始

```bash
git clone https://github.com/CCCq-C/weixin-claude-bot.git
cd weixin-claude-bot
npm install
cp .env.example .env
```

编辑 `.env`：

```bash
VAULT_PATH="/absolute/path/to/your/obsidian-vault"
WHITELIST_USER_IDS=
CLAUDE_MODEL=
```

首次运行：

```bash
npm run login
```

终端会显示二维码。用手机微信扫码并确认后，程序会把登录状态保存到：

```text
data/account.json
```

然后把终端显示的 `userId` 写入 `.env`：

```bash
WHITELIST_USER_IDS="your-user-id@im.wechat"
```

出于安全原因，`WHITELIST_USER_IDS` 为空时 bot 不会进入长轮询，也不会响应任何微信消息。

重新启动：

```bash
npm start
```

在微信里找到扫码后出现的 bot 联系人，发送：

```text
在 临时输出/test.md 写一行 hello
```

如果一切正常，Claude 会在 `VAULT_PATH` 下创建文件，并通过微信返回简短回执。

## 给 AI 助手的部署规划

如果你让 Claude Code、Codex、Cursor 或其他 AI 编程助手帮你部署，请直接让它阅读本节，并按阶段执行。不要跳过验收。

### M0：环境检查

目标：确认本机已经具备运行条件。

```bash
node -v
npm -v
which claude && claude --version
claude -p "ping" --output-format json
curl -sI https://ilinkai.weixin.qq.com | head -1
```

通过标准：

- Node.js 版本为 20 或更高
- `claude --version` 能正常输出
- `claude -p "ping" --output-format json` 能正常返回，说明 Claude Code CLI 已完成登录
- `curl` 能访问 `ilinkai.weixin.qq.com`
- 已确认一个可写的 `VAULT_PATH`

如果 `claude` 不存在，先安装并登录 Claude Code CLI，再继续。

### M1：初始化项目

目标：安装依赖并写好 `.env`。

```bash
npm install
cp .env.example .env
```

编辑 `.env`：

```bash
VAULT_PATH="/absolute/path/to/your/obsidian-vault"
WHITELIST_USER_IDS=
CLAUDE_MODEL=
```

通过标准：

- `npm install` 无报错
- `.env` 存在
- `VAULT_PATH` 是绝对路径，且目录真实存在、可写

### M2：微信扫码登录

目标：拿到本机微信 bot 登录状态。

```bash
npm run login
```

操作：

- 用手机微信扫描终端里的二维码
- 如果终端二维码扫不上，就把终端打印的 URL 在浏览器打开再扫码
- 手机端确认登录

通过标准：

- 终端显示登录成功
- `data/account.json` 被创建
- 终端输出一个类似 `xxx@im.wechat` 的 `userId`

然后把这个 `userId` 写回 `.env`：

```bash
WHITELIST_USER_IDS="xxx@im.wechat"
```

### M3：端到端验证

目标：确认微信消息能驱动 Claude 写入本地目录。

```bash
npm start
```

在微信里给 bot 发送：

```text
在 临时输出/test.md 写一行 hello
```

通过标准：

- 终端出现 `[recv]`
- 终端出现 `[claude]`
- 微信收到简短回执
- `VAULT_PATH/临时输出/test.md` 真实存在

如果 `WHITELIST_USER_IDS` 为空，程序会拒绝进入长轮询。这是安全设计，不是 bug。

### M4：常驻运行

目标：让 bot 在后台运行。

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs weixin-claude-bot
```

通过标准：

- `pm2 list` 里 `weixin-claude-bot` 状态为 `online`
- `pm2 logs weixin-claude-bot` 里能看到长轮询启动
- 微信再次发消息仍能触发 Claude

确认稳定后再执行：

```bash
pm2 save
pm2 startup
```

### AI 助手注意事项

- 不要提交或打印 `.env`、`data/account.json`、`data/claude-sessions.json`。
- 不要把 `WHITELIST_USER_IDS` 留空后强行启动。
- 不要把 `VAULT_PATH` 指向整个用户主目录，优先使用单独的 Obsidian Vault 或测试目录。
- 每完成一个阶段，都要检查通过标准，再进入下一阶段。
- 出错时先看终端输出和 `pm2 logs weixin-claude-bot`，不要直接重装。

## pm2 常驻

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

常用命令：

```bash
pm2 logs weixin-claude-bot
pm2 restart weixin-claude-bot
pm2 stop weixin-claude-bot
pm2 delete weixin-claude-bot
```

## 项目结构

```text
src/
  api.ts             # ilinkai signed POST helper
  claude-runner.ts   # spawn Claude Code CLI
  config.ts          # .env config
  index.ts           # main loop
  login.ts           # WeChat QR login
  poll.ts            # getupdates long polling
  reply.ts           # sendmessage + text extraction

data/                # runtime state, ignored by git
  account.json
  claude-sessions.json
  pm2.*.log
```

## 开发

```bash
npm run typecheck
```

## 协议说明

本项目参考腾讯 OpenClaw 微信插件中的 ilinkai 协议事实，自行实现最小可用的登录、长轮询和回复流程。

关键事实：

- 网关：`https://ilinkai.weixin.qq.com`
- 登录：`GET /ilink/bot/get_bot_qrcode?bot_type=3`
- 登录状态：`GET /ilink/bot/get_qrcode_status?qrcode=...`
- 接收消息：`POST /ilink/bot/getupdates`
- 发送消息：`POST /ilink/bot/sendmessage`
- `iLink-App-Id` 使用公开值 `bot`
- `context_token` 需要在回复时带回
- 成功响应不一定带 `ret`

## 免责声明

这是一个研究和个人自动化项目。微信、Claude Code CLI 或 ilinkai 协议的变化都可能导致项目不可用。请自行评估账号、数据和权限风险。

## 开源协议

本项目使用 MIT License 开源。你可以自由使用、复制、修改、分发和商用本项目，但需要保留原始版权声明和协议文本。

This project is open-sourced under the MIT License. You may use, copy, modify, distribute, and use it commercially, as long as the original copyright notice and license text are preserved.
