# Security Policy

## Sensitive files

Never commit these files:

- `.env`
- `data/account.json`
- `data/claude-sessions.json`
- `data/*.log`
- any file containing `bot_token`, `botToken`, API keys, cookies, or personal paths

## Runtime risk

This bot can run Claude Code CLI with `--permission-mode bypassPermissions`.
Only use it with a strict `WHITELIST_USER_IDS` value and a carefully chosen
`VAULT_PATH`.

If you suspect the bot is receiving unexpected messages, stop it immediately:

```bash
pm2 stop weixin-claude-bot
```

or, if running in a terminal:

```bash
Ctrl+C
```

## Reporting

Open a GitHub issue with reproduction steps. Do not include tokens, logs with
private IDs, or personal file paths.
