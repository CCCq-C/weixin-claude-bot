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
- Windows 10/11
- Node.js 20+
- Claude Code CLI 已安装并完成登录
- 可以访问 `https://ilinkai.weixin.qq.com`

Windows 原生模式建议安装 Git for Windows。Claude Code 官方也支持 WSL 路径；如果你已经习惯 WSL，可以在 WSL 里按 Linux/macOS 方式部署。

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

程序会生成一个本地扫码页，并尝试自动打开浏览器。用手机微信扫描浏览器里的二维码并确认后，程序会把登录状态保存到：

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

## 微信内置命令

这些命令可以直接发给微信里的 bot：

```text
/help      查看命令帮助
/status    查看当前是否有任务正在执行
/stop      中断当前任务
/cancel    同 /stop
/中断       同 /stop
/停止       同 /stop
/reset     清除当前用户的 Claude 会话上下文
```

安全规则：

- 同一个微信用户同一时间只允许一个 Claude 任务。
- 当前任务执行中时，新普通消息不会启动第二个 Claude 进程。
- 需要中断时发送 `/stop`、`/cancel`、`/中断` 或 `/停止`。
- `/reset` 只清除会话上下文，不会删除你的笔记或文件。

## Agent 能力边界

当前默认 Agent 是 Claude Code CLI。项目内部已经保留轻量能力层，用来区分：

```text
文本能力
视觉能力
本地文件读取能力
音频能力
```

这不是要把项目改成通用 SDK，而是为后续接 DeepSeek、Kimi、Codex 或附件预处理做准备。原则是：

- 文本模型只接收文本、OCR 结果或 Markdown。
- 支持本地文件读取的 Agent 才能收到附件路径。
- 不假设所有 Agent 都能看图、读 PDF、处理音频。
- 附件能力上线前，图片/文件不会被硬塞给不支持的模型。

## Windows 快速开始

在 PowerShell 中运行：

```powershell
git clone https://github.com/CCCq-C/weixin-claude-bot.git
cd weixin-claude-bot
.\scripts\windows\check.ps1
.\scripts\windows\setup.ps1
```

如果 PowerShell 阻止脚本执行，可以只在当前终端会话临时放行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

编辑 `.env`：

```env
VAULT_PATH="C:\Users\YourName\Documents\ObsidianVault"
WHITELIST_USER_IDS=
CLAUDE_MODEL=
CLAUDE_COMMAND=
```

然后扫码登录：

```powershell
npm run login
```

把终端显示的 `userId` 写入 `.env`：

```env
WHITELIST_USER_IDS="xxx@im.wechat"
```

启动：

```powershell
npm start
```

如果 Windows 找不到 `claude`，但 `claude.cmd` 存在，可以在 `.env` 里指定：

```env
CLAUDE_COMMAND=claude.cmd
```

Windows 开机自启建议使用任务计划程序：

```powershell
.\scripts\windows\install-startup-task.ps1
```

### Windows 覆盖范围

当前 Windows 支持按 `v0.4.0-beta.1` 处理，适合社区共测。

已覆盖：

- Windows 10/11 原生 PowerShell 部署
- Node.js 20+ / npm 环境检查
- Git for Windows 环境检查
- Claude Code CLI 存在性和登录状态检查
- npm 安装的 `claude.cmd` 解析
- `CLAUDE_COMMAND` 自定义 Claude 命令
- Windows 风格 `VAULT_PATH`
- 任务计划程序开机自启
- 微信内置 `/stop` 中断命令和同用户防并发
- 跨平台 `npm run doctor` 诊断
- 运行状态文件 `data/status.json`
- 事件日志 `data/events.log`

仍需用户环境配合：

- Claude Code CLI 必须已经安装并登录
- 网络必须能访问 `ilinkai.weixin.qq.com`
- `VAULT_PATH` 必须是真实存在且可写的目录
- 公司代理、杀毒软件、受限 PowerShell 策略可能需要用户手动处理
- WSL 用户不要混用 Windows 路径和 WSL 路径；请在同一个环境内完成 Node、Claude CLI、Vault 配置

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

Windows PowerShell：

```powershell
.\scripts\windows\check.ps1
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

Windows PowerShell：

```powershell
.\scripts\windows\setup.ps1
```

编辑 `.env`：

```bash
VAULT_PATH="/absolute/path/to/your/obsidian-vault"
WHITELIST_USER_IDS=
CLAUDE_MODEL=
CLAUDE_COMMAND=
```

Windows 示例：

```env
VAULT_PATH="C:\Users\YourName\Documents\ObsidianVault"
WHITELIST_USER_IDS=
CLAUDE_MODEL=
CLAUDE_COMMAND=
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

- 用手机微信扫描浏览器扫码页里的二维码
- 如果浏览器没有自动弹出，就点击终端打印的 `file://.../data/login-qrcode.html` 链接
- 终端二维码仍会保留，方便普通终端用户兜底扫码
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

Windows 推荐使用任务计划程序：

```powershell
.\scripts\windows\install-startup-task.ps1
```

### AI 助手注意事项

- 不要提交或打印 `.env`、`data/account.json`、`data/claude-sessions.json`。
- 不要把 `WHITELIST_USER_IDS` 留空后强行启动。
- 不要把 `VAULT_PATH` 指向整个用户主目录，优先使用单独的 Obsidian Vault 或测试目录。
- Windows 原生部署优先用 PowerShell；WSL 用户请在 WSL 内保持 Node、Claude CLI、Vault 路径都属于同一个环境。
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
npm run doctor
npm test
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
