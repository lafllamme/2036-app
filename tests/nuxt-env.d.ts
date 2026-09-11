/**
 * The test project compiles store code that uses Nuxt's build-time environment flags. Nuxt declares
 * these in `.nuxt/`, which belongs to the app project, so the test project gets its own declaration.
 */
interface ImportMeta {
  readonly client: boolean
  readonly server: boolean
}
