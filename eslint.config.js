import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '.nuxt/**',
    '.output/**',
    'coverage/**',
    'dist/**',
    'playwright-report/**',
    'test-results/**',
  ],
  nuxt: true,
  unocss: true,
  vue: true,
})
