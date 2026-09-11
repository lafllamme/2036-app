import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Nuxt's srcDir alias, so domain and store tests can use the same imports the app does.
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/architecture/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'app/content/**/*.ts',
        'app/core/**/*.ts',
        'app/simulation/**/*.ts',
        'app/world/generation/**/*.ts',
        'app/world/model/**/*.ts',
      ],
      exclude: ['app/env.d.ts'],
    },
  },
})
