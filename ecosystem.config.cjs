/**
 * PM2 config for production deploy.
 * Usage: pm2 start ecosystem.config.cjs
 */
const path = require('path');
const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'exam-api',
      cwd: path.join(root, 'apps/api'),
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: path.join(root, 'apps/api/.env'),
    },
    {
      name: 'exam-web',
      cwd: path.join(root, 'apps/web'),
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
      cwd: path.join(root, 'apps/api'),
      script: 'dist/scripts/ziyoda-bot.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        BOT_API_URL: 'http://127.0.0.1:3001',
      },
      env_file: path.join(root, 'apps/api/.env'),
    },
  ],
};
