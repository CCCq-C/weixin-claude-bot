/**
 * pm2 配置：守护 weixin-claude-bot 进程
 *
 * 用法：
 *   pm2 start ecosystem.config.cjs        # 启动并守护
 *   pm2 logs weixin-claude-bot            # 实时日志
 *   pm2 restart weixin-claude-bot         # 改完代码后重启
 *   pm2 stop weixin-claude-bot            # 临时停掉
 *   pm2 save && pm2 startup               # 持久化 + 开机自启（macOS 用 launchd）
 */
module.exports = {
  apps: [
    {
      name: "weixin-claude-bot",
      script: "src/index.ts",
      interpreter: "node",
      node_args: "--import tsx",
      cwd: __dirname,
      autorestart: true,
      max_memory_restart: "500M",
      restart_delay: 3000, // 崩溃后等 3s 再起
      max_restarts: 20, // 短时间内连续崩 20 次就放弃，避免无限风暴
      min_uptime: "30s", // 跑满 30s 才算"成功一次"
      out_file: "./data/pm2.out.log",
      error_file: "./data/pm2.err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
