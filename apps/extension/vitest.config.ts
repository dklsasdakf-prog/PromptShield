import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: [
      { find: '@checkred-ai-security/shared', replacement: resolve(rootDir, '../../shared/ts/index.ts') },
      { find: '@checkred-ai-security/shared/', replacement: `${resolve(rootDir, '../../shared/ts')}/` },
    ],
  },
})
