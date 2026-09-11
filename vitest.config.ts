import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/architecture/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/content/**/*.ts',
        'src/core/**/*.ts',
        'src/simulation/**/*.ts',
        'src/world/generation/**/*.ts',
        'src/world/model/**/*.ts',
      ],
      exclude: ['src/env.d.ts'],
    },
  },
})
