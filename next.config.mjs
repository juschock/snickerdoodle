import { privateResponseHeaders, securityHeaders } from './security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/snickerdoodle',
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  poweredByHeader: false,
  outputFileTracingRoot: import.meta.dirname,
  images: {
    unoptimized: true
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/brief/:path*',
        headers: privateResponseHeaders
      },
      {
        source: '/api/brief-access',
        headers: privateResponseHeaders
      },
      {
        source: '/api/brief',
        headers: privateResponseHeaders
      },
      {
        source: '/api/checkout',
        headers: privateResponseHeaders
      },
      {
        source: '/api/manager/:path*',
        headers: privateResponseHeaders
      },
      {
        source: '/api/stripe/webhook',
        headers: privateResponseHeaders
      },
      {
        source: '/manager/:path*',
        headers: privateResponseHeaders
      },
      {
        source: '/checkout/:path*',
        headers: privateResponseHeaders
      }
    ];
  }
};

export default nextConfig;
