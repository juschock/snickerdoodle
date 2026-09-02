import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../../..')
};

export default nextConfig;
