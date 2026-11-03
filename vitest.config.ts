import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'tests/vacio.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
});
