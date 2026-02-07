import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60000, // PBT tests may take longer
  },
  resolve: {
    alias: {
      '@noble/secp256k1': '@noble/secp256k1',
    },
  },
});
