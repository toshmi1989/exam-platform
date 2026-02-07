/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use apps/web as root when repo has lockfiles at monorepo root (avoids wrong module resolution)
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: '/cabinet/chat',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
      {
        source: '/cabinet/pay-one-time',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
      {
        source: '/exam/select',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
