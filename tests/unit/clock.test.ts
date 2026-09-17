import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The clock gives itself back.
 *
 * Three different buttons stopped the campaign and never started it again: voting on a motion,
 * putting one to the council, and stepping a month on. Each was defensible on its own — the player
 * should not have to decide against a running month, and a month has to land before the next one
 * starts — and each left the city standing still until somebody noticed and pressed play.
 *
 * The rule the store now keeps: **stop the clock for as long as something is in the way, and not one
 * tick longer.** A player who paused it themselves stays paused; that is the one case where nothing
 * is in the way and the clock should not come back.
 */

async function freshStore() {
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useGameStore } = await import('../../app/stores/game')
  return useGameStore()
}

describe('the campaign clock', () => {
  it('comes back to the speed the player chose once a vote is out of the way', async () => {
    const game = await freshStore()
    game.setSpeed(2)
    expect(game.speed).toBe(2)

    game.openDecisionSheet('saf-burglary-series')
    expect(game.speed, 'a motion on screen stops the month').toBe(0)

    game.openDecisionSheet(null)
    expect(game.speed, 'and the month comes back at the speed it was running at').toBe(2)
  })

  it('does not come back for a player who paused it themselves', async () => {
    const game = await freshStore()
    game.setSpeed(2)
    game.setSpeed(0)

    game.openDecisionSheet('saf-burglary-series')
    game.openDecisionSheet(null)
    expect(game.speed, 'nothing is in the way, and they still wanted it stopped').toBe(0)
  })

  it('holds the clock while a result is still on screen, and only then lets go', async () => {
    const game = await freshStore()
    game.setSpeed(4)
    game.openDecisionSheet('saf-burglary-series')

    game.voteQueue = [{
      optionId: 'saf-burglary-order',
      passed: true,
      yesSeats: 34,
      noSeats: 20,
      abstainSeats: 6,
      votes: [],
      forecast: { expectedYesSeats: 34, expectedNoSeats: 20, majorityProbability: 0.8, parties: [] },
    }]
    game.openDecisionSheet(null)
    expect(game.speed, 'the result is still there to be read').toBe(0)

    game.dismissVoteResult()
    expect(game.speed).toBe(4)
  })

  /*
   * "Nächster Monat" is the button this was reported on, twice. First it stopped the campaign and
   * never restarted it. Then it held the clock and gave it straight back — correct, and it flashed
   * the paused screen on every press. It does not touch the clock at all now, which is the third and
   * quietest answer.
   */
  it('does not touch the clock when stepping a month on', async () => {
    const game = await freshStore()
    game.setSpeed(2)
    game.advanceMonth()
    expect(game.speed, 'no stop, and nothing to flash').toBe(2)
  })

  it('leaves a paused campaign paused when stepping a month on', async () => {
    const game = await freshStore()
    game.setSpeed(0)
    game.advanceMonth()
    expect(game.speed).toBe(0)
  })

  /*
   * The rule the last two bugs both broke, checked at the source.
   *
   * `pendingCommand` means "the interface asked for something and is waiting for it". Every path
   * that lowers it has to do one of two things: offer the clock back, or stop the campaign on
   * purpose. A path that does neither strands the player, and both times it happened the symptom
   * looked like a different bug entirely.
   *
   * The second one is worth writing down. The month turn saves automatically, a save is a command
   * like any other, and the save request stood one line *above* the resume — so it raised the flag
   * the resume was about to read, and the resume correctly decided the player was still waiting for
   * something. They were: for a background save they never asked for and could not see. Pressing
   * "nächster Monat" therefore stopped the campaign every single time, while voting, which does not
   * always turn the month, usually did not.
   */
  it('never lowers the pending flag without either resuming or stopping on purpose', () => {
    const lines = readFileSync('app/stores/game.ts', 'utf8').split('\n')
    const places = lines
      .map((line, index) => ({ line, index }))
      .filter(entry => entry.line.includes('pendingCommand.value = false'))
    expect(places.length, 'the flag is lowered in several places').toBeGreaterThan(2)

    for (const place of places) {
      // The whole branch it sits in, either side: the stop paths set the speed *before* lowering it.
      const around = lines.slice(Math.max(0, place.index - 6), place.index + 30).join('\n')
      const resumes = around.includes('resumeIfClear()')
      const stops = around.includes('speed.value = 0')
      expect(
        resumes || stops,
        `line ${place.index + 1} lowers pendingCommand and neither resumes the clock nor stops the campaign`,
      ).toBe(true)
    }
  })
})
