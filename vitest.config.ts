import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'node_modules/next/dist/compiled/server-only/empty.js')
    }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
