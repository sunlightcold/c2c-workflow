module.exports = {
  apps: [
    {
      name: 'tpl',
      cwd: __dirname,
      script: './dist/apps/admin/main.js',
      instances: 1,
      // 集群模式
      exec_mode: 'cluster',
      // 如果超过指定的内存量，应用程序将重新启动
      // max_memory_restart: '1G',
      // 故障重启
      stop_exit_codes: [0],
      error_file: './pm2logs/err.log', // 错误日志
      out_file: './pm2logs/out.log', // 输出日志
      merge_logs: true, // 合并集群实例的日志
      log_date_format: 'YYYY/MM/DD HH:mm:ss', // 日志日期格式
      // 环境变量
      env: {
        NODE_ENV: 'production',
      },
      env_dev: {
        NODE_ENV: 'development',
      },
    },
  ],
}
