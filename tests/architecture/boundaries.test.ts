import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '../..')

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry)
    return statSync(path).isDirectory() ? filesBelow(path) : [path]
  })
}

function sourceFiles(relativeDirectory: string): Array<{ path: string, source: string }> {
  return filesBelow(resolve(projectRoot, relativeDirectory))
    .filter(path => /\.(?:ts|vue)$/.test(path))
    .map(path => ({ path, source: readFileSync(path, 'utf8') }))
}

describe('architecture boundaries', () => {
  it('keeps simulation independent from Vue, Pinia, Three.js, and browser APIs', () => {
    const forbidden = [/from ['"]vue['"]/, /from ['"]pinia['"]/, /from ['"]three(?:\/[^'"]+)?['"]/, /\bwindow\b/, /\bdocument\b/]

    for (const file of sourceFiles('app/simulation')) {
      for (const pattern of forbidden) expect(file.source, `${file.path} contains ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps Three.js imports inside the rendering boundary', () => {
    const outsideRendering = sourceFiles('app').filter(({ path }) => !path.includes('/app/rendering/'))

    for (const file of outsideRendering) {
      expect(file.source, `${file.path} imports Three.js`).not.toMatch(/from ['"]three(?:\/[^'"]+)?['"]/)
    }
  })

  it('never branches a simulation calculation on a party identifier', () => {
    // AGENTS.md: parties may only enter through their authored position vector and seat count.
    const partyIds = ['cdu', 'afd', 'spd', 'gruene', 'linke', 'fdp']
    const engine = sourceFiles('app/simulation')

    for (const file of engine) {
      for (const partyId of partyIds) {
        expect(file.source, `${file.path} compares against the party id "${partyId}"`)
          .not
          .toMatch(new RegExp(`(===|!==|case)\\s*['"]${partyId}['"]`))
      }
    }
  })

  it('never lets an identity-composition indicator drive a score or a trigger', () => {
    // docs/METRICS.md: composition is displayed, never causal. Capacity is what moves outcomes.
    const composition = 'internationalShare'
    const scoring = sourceFiles('app/simulation').filter(({ path }) => /dynamics|council|events/.test(path))

    for (const file of scoring) {
      const healthSection = file.source.slice(file.source.indexOf('export function healthFromState'))
      expect(healthSection, `${file.path} scores on ${composition}`).not.toContain(composition)
    }

    const library = readFileSync(resolve(projectRoot, 'app/content/events.ts'), 'utf8')
    expect(library, 'an event trigger reads an identity-composition indicator').not.toContain(`metric: '${composition}'`)
  })

  it('never references a design token that does not exist', () => {
    /*
     * Regression: the design pass removed --red, --amber and --teal from styles.css while the entry
     * flow still used them seven times. Invalid declarations fall back silently, so the logo lost its
     * accent, the loading bar lost its fill and two party stances lost their colour — with no error
     * anywhere. This test makes a deleted token fail loudly instead.
     */
    const stylesheet = readFileSync(resolve(projectRoot, 'app/assets/css/styles.css'), 'utf8')
    const defined = new Set(Array.from(stylesheet.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm), match => match[1]))

    // The typefaces live in the UnoCSS theme, which emits them as --font-<key>. Read the keys from
    // the config rather than allow-listing them, so a renamed family still fails here.
    const unoConfig = readFileSync(resolve(projectRoot, 'uno.config.ts'), 'utf8')
    const fontBlock = unoConfig.slice(unoConfig.indexOf('font: {'), unoConfig.indexOf('radius: {'))
    for (const match of fontBlock.matchAll(/^\s{6}([a-z]+):/gm)) defined.add(`--font-${match[1]}`)

    // Set at runtime via :style bindings rather than declared anywhere.
    const runtimeProvided = new Set(['--party-color', '--party-accent', '--ticker-duration'])

    for (const file of [...sourceFiles('app/components'), { path: 'app/assets/css/styles.css', source: stylesheet }]) {
      for (const match of file.source.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
        const token = match[1]
        if (!token || runtimeProvided.has(token))
          continue
        expect(defined, `${file.path} uses undefined token ${token}`).toContain(token)
      }
    }
  })

  it('never uses unseeded randomness in world or simulation code', () => {
    const deterministicFiles = [...sourceFiles('app/world'), ...sourceFiles('app/simulation')]

    for (const file of deterministicFiles) expect(file.source, `${file.path} uses Math.random`).not.toContain('Math.random(')
  })

  it('keeps the sound library inside the audio boundary', () => {
    /*
     * Sound reaches the product through the bus and the cue contract, never through a component
     * naming a cue itself. That is what lets the whole interface change sonic personality, and
     * what keeps the audible surface reviewable in one file.
     */
    const outsideAudio = sourceFiles('app').filter(({ path }) => !path.includes('/app/audio/'))

    for (const file of outsideAudio)
      expect(file.source, `${file.path} imports uisfx directly`).not.toMatch(/from ['"]uisfx['"]/)
  })

  it('keeps simulation and world code free of sound', () => {
    const domain = [...sourceFiles('app/simulation'), ...sourceFiles('app/world')]

    for (const file of domain)
      expect(file.source, `${file.path} reaches into audio`).not.toMatch(/~\/audio\/|useSound/)
  })
})
