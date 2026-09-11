import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '../..')

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry)
    return statSync(path).isDirectory() ? filesBelow(path) : [path]
  })
}

function sourceFiles(relativeDirectory: string): Array<{ path: string; source: string }> {
  return filesBelow(resolve(projectRoot, relativeDirectory))
    .filter((path) => /\.(ts|vue)$/.test(path))
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
}

describe('architecture boundaries', () => {
  it('keeps simulation independent from Vue, Pinia, Three.js, and browser APIs', () => {
    const forbidden = [/from ['"]vue['"]/, /from ['"]pinia['"]/, /from ['"]three(?:\/[^'"]+)?['"]/, /\bwindow\b/, /\bdocument\b/]

    for (const file of sourceFiles('src/simulation')) {
      for (const pattern of forbidden) expect(file.source, `${file.path} contains ${pattern}`).not.toMatch(pattern)
    }
  })

  it('keeps Three.js imports inside the rendering boundary', () => {
    const outsideRendering = sourceFiles('src').filter(({ path }) => !path.includes('/src/rendering/'))

    for (const file of outsideRendering) {
      expect(file.source, `${file.path} imports Three.js`).not.toMatch(/from ['"]three(?:\/[^'"]+)?['"]/)
    }
  })

  it('never uses unseeded randomness in world or simulation code', () => {
    const deterministicFiles = [...sourceFiles('src/world'), ...sourceFiles('src/simulation')]

    for (const file of deterministicFiles) expect(file.source, `${file.path} uses Math.random`).not.toContain('Math.random(')
  })
})
