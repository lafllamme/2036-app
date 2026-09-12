import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '.nuxt/**',
    '.output/**',
    'coverage/**',
    'dist/**',
    'playwright-report/**',
    'test-results/**',
    // Data and vendored assets, not source: the ground plan is two megabytes on one line, and the
    // kit is Kenney's. Linting either says nothing and costs four hundred thousand findings.
    'public/**',
  ],
  nuxt: true,
  unocss: true,
  vue: true,
})
