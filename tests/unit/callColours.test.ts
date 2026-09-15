import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The four call colours exist twice and must not drift.
 *
 * A call is drawn as a ring on the tarmac by the renderer and as a label in the news bar by the
 * interface, and the whole point of the four values is that the player recognises the ring and the
 * label as one thing. The renderer cannot read a CSS custom property and the stylesheet cannot read
 * a TypeScript constant, so there are two copies and there is no way around that.
 *
 * What there is a way around is nobody noticing when they stop agreeing. That is this.
 *
 * The state this was written in is worth recording: the four tokens were defined, documented as
 * being used for exactly this, and read by nothing at all. The tarmac had its own copy of the hex
 * values and the bar had none — a comment describing a feature that had never been built.
 */

const KIND_TO_TOKEN: Record<string, string> = {
  burglary: '--call-theft',
  assault: '--call-police',
  accident: '--call-medical',
  fire: '--call-fire',
}

function tokens(): Record<string, string> {
  const css = readFileSync('app/assets/css/styles.css', 'utf8')
  const found: Record<string, string> = {}
  for (const [, name, value] of css.matchAll(/(--call-[a-z]+)\s*:\s*(#[0-9a-f]{3,8})/gi))
    found[name!] = value!.toLowerCase()
  return found
}

function ringColours(): Record<string, string> {
  const source = readFileSync('app/rendering/world/traffic/incidentScene.ts', 'utf8')
  const found: Record<string, string> = {}
  for (const [, kind, value] of source.matchAll(/(burglary|assault|accident|fire):\s*\/\* @__PURE__ \*\/ new THREE\.Color\('(#[0-9a-f]{3,8})'\)/gi))
    found[kind!] = value!.toLowerCase()
  return found
}

describe('the four call colours', () => {
  it('is defined once for the bar and once for the tarmac, for all four kinds', () => {
    expect(Object.keys(tokens()).sort()).toEqual(['--call-fire', '--call-medical', '--call-police', '--call-theft'])
    expect(Object.keys(ringColours()).sort()).toEqual(['accident', 'assault', 'burglary', 'fire'])
  })

  it('draws a call the same colour on the street as in the news bar', () => {
    const css = tokens()
    const ring = ringColours()
    for (const [kind, token] of Object.entries(KIND_TO_TOKEN))
      expect(ring[kind], `${kind} on the street vs ${token} in the bar`).toBe(css[token])
  })

  it('actually uses the tokens somewhere, which is the failure this replaces', () => {
    const ticker = readFileSync('app/components/NewsTicker.vue', 'utf8')
    for (const token of Object.values(KIND_TO_TOKEN))
      expect(ticker, `${token} is defined and read by nothing`).toContain(token)
  })
})
