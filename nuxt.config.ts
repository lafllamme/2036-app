export default defineNuxtConfig({
  compatibilityDate: '2026-09-11',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@unocss/nuxt'],

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
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'preconnect', href: 'https://api.fontshare.com' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..600&display=swap' },
        { rel: 'stylesheet', href: 'https://api.fontshare.com/v2/css?f[]=supreme@400,500,700,800&f[]=switzer@400,500,600,700&display=swap' },
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
