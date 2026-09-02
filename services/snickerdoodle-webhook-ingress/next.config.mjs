import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  async headers() {
    return [{
      source: '/api/stripe/webhook',
      headers: [
        { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Content-Type-Options', value: 'nosniff' }
      ]
    }];
  },
  webpack(config) {
    config.resolve.modules.unshift(path.resolve(import.meta.dirname, 'node_modules'));
    return config;
  }
};

export default nextConfig;
