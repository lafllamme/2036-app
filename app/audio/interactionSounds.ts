import type { AudioBus } from './AudioBus'
import { useEventListener } from '@vueuse/core'

/**
 * Everything a player can point at, in one selector. Binding sound by delegation rather than by
 * decorating forty call sites means a control added tomorrow is audible without anyone remembering
 * to wire it, and an element opts out with `data-sfx="silent"`.
 */
const INTERACTIVE = 'button, a[href], summary, input, select, textarea, [role="button"], [role="tab"], [role="option"]'

function control(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element))
    return null
  const element = target.closest<HTMLElement>(INTERACTIVE)
  if (!element || element.dataset.sfx === 'silent')
    return null
  return element
}

/**
 * Binds the generic interaction layer — hover, press and keyboard focus — and unlocks audio on the
 * first trusted gesture. Returns the unbind function.
 *
 * A disabled control is deliberately absent: Chrome dispatches no event for one, to the element or
 * to any ancestor, so delegation cannot hear that click at all. `cues.ts` records why.
 */
export function bindInteractionSounds(bus: AudioBus, root: Document = document): () => void {
  let lastHovered: HTMLElement | null = null

  /*
   * Only a press unlocks. Hover and focus are not user activation, so asking the browser to open
   * an AudioContext from one is refused — and asking early is worse than not asking, because the
   * pointer crosses a button long before the first click.
   *
   * unlock() has to start inside the trusted handler, and it is a no-op once open. Starting it
   * before the cue is what lets the bus defer that cue through the handshake instead of losing it.
   */
  const activate = (event: 'ui.press'): void => {
    void bus.unlock()
    bus.play(event)
  }

  const emit = (event: 'ui.hover' | 'ui.focus'): void => {
    bus.play(event)
  }

  const stops = [
    useEventListener(root, 'pointerdown', (event: PointerEvent) => {
      if (control(event.target))
        activate('ui.press')
    }, true),

    useEventListener(root, 'pointerover', (event: PointerEvent) => {
      if (event.pointerType !== 'mouse')
        return
      const element = control(event.target)
      if (!element || element === lastHovered)
        return
      lastHovered = element
      emit('ui.hover')
    }, true),

    useEventListener(root, 'pointerout', (event: PointerEvent) => {
      if (control(event.target) === lastHovered)
        lastHovered = null
    }, true),

    useEventListener(root, 'keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ')
        return
      if (control(event.target))
        activate('ui.press')
    }, true),

    useEventListener(root, 'focusin', (event: FocusEvent) => {
      const element = control(event.target)
      // Keyboard focus only. A pointer focus has already sounded as a press.
      if (element?.matches(':focus-visible'))
        emit('ui.focus')
    }, true),
  ]

  return () => {
    for (const stop of stops) stop()
  }
}
