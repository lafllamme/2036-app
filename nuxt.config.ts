export default defineNuxtConfig({
  compatibilityDate: '2026-09-11',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@unocss/nuxt', '@nuxt/icon', '@nuxt/fonts'],

  /*
   * Self-hosted typefaces. The module downloads the three families at build time and serves them
   * from our own origin, so the interface never falls back to system faces without a network and no
   * font request leaves the machine at runtime. Providers are named explicitly because "Supreme"
   * and "Switzer" exist on more than one service.
   */
  fonts: {
    families: [
      { name: 'Supreme', provider: 'fontshare', weights: [400, 500, 700, 800] },
      { name: 'Switzer', provider: 'fontshare', weights: [400, 500, 600, 700] },
      { name: 'Geist Mono', provider: 'google', weights: [400, 500, 600] },
    ],
  },

  /*
   * Lucide, bundled rather than fetched: the set is installed locally via @iconify-json/lucide, so
   * icons resolve offline and no request leaves the machine at runtime.
   */
  icon: {
    mode: 'svg',
    serverBundle: { collections: ['lucide'] },
  },

  css: ['~/assets/css/styles.css'],

  /*
   * Server rendering stays on: the whole entry flow — title, party hall, party profile, priorities
   * and intro — is built from static content and is the first thing every player sees, so it should
   * paint before the renderer chunk arrives. The city canvas and the HUD read a worker snapshot that
   * does not exist on the server and are wrapped in <ClientOnly> instead.
   */
  routeRules: {
    '/': { prerender: true },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      title: '2036 — Lindenhafen',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#090d10' },
        { name: 'description', content: '2036 — politische Stadtsimulation in Lindenhafen' },
      ],
    },
  },

  vite: {
    // The simulation worker is an ES module and imports the domain code directly.
    worker: { format: 'es' },
    build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1_000 },
  },

  devServer: { host: '127.0.0.1', port: 2036 },

  typescript: { typeCheck: false, strict: true },
})
