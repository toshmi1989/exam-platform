/**
 * PM2 config for production deploy.
 * Usage: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'exam-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: './apps/api/.env',
    },
    {
      name: 'exam-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'ziyoda-bot',
      cwd: './apps/api',
      script: 'dist/scripts/ziyoda-bot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        BOT_API_URL: 'http://127.0.0.1:3001',
      },
      env_file: './apps/api/.env',
    },
  ],
};
