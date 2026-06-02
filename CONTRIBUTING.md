# Contributing

Thanks for helping improve `weixin-claude-bot`.

Before opening a pull request:

```bash
npm install
npm run typecheck
```

Please keep changes focused. This project is intentionally small: minimal
ilinkai protocol handling plus Claude Code CLI integration.

Do not commit runtime state or private data:

- `.env`
- `data/`
- logs
- local Obsidian paths
- WeChat user IDs
- Claude/API tokens
