import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Nuxt's srcDir alias, so domain and store tests can use the same imports the app does.
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  test: {
    environment: 'node',
    /*
     * Three workers, not one per core.
     *
     * Vitest defaults to a worker per logical CPU, which on this machine is ten and pins every core
     * for the length of the run. The suite takes well under a second either way, so the only thing
     * the other seven workers buy is a fan at full speed — and a laptop that has had to be restarted
     * more than once because of it. See the resource rules in AGENTS.md.
     */
    maxWorkers: 3,
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
