import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'server/**/*.test.mjs',
      'server/**/*.test.js',
      'src/**/*.test.ts',
      'telegram-bot/**/*.test.mjs',
    ],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    },
  },
})
