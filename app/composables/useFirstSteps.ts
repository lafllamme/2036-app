import { createGlobalState, useLocalStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import { FIRST_STEPS } from '~/content/firstSteps'

/**
 * Wer die Einarbeitung schon hinter sich hat, und wo sie gerade steht.
 *
 * Außerhalb von Pinia, aus demselben Grund wie die Tonvorlieben: ein Pinia-Setup-Store schreibt
 * seine Refs in die Serverantwort und stellt sie beim Hydrieren wieder her — der gespeicherte Wert
 * wäre danach überschrieben, und die Einarbeitung liefe bei jedem Laden erneut. Siehe
 * `useSoundSettings`, wo genau das einmal passiert ist.
 *
 * Der gespeicherte Wert ist bewusst nur ein Ja/Nein und kein Fortschritt. Wer mittendrin aufhört,
 * hat aufgehört; ihn beim nächsten Start in Schritt vier wieder aufzugreifen, wäre eine Zumutung an
 * jemanden, der die Einarbeitung gerade weggeklickt hat.
 */
export const useFirstSteps = createGlobalState(() => {
  // Fällt beim Serverrendern und bei gesperrten Seitendaten auf den Anfangswert zurück: dann läuft
  // die Einarbeitung eben noch einmal, und das ist das mildere Versagen.
  const done = useLocalStorage('2036-first-steps-done', false)
  /** −1 heißt: läuft gerade nicht. */
  const at = ref(-1)

  const running = computed(() => at.value >= 0 && at.value < FIRST_STEPS.length)
  const step = computed(() => (running.value ? FIRST_STEPS[at.value] ?? null : null))

  /** Einmal, beim ersten Betreten der Stadt. Wer sie kennt, sieht sie nicht wieder. */
  function beginOnce(): void {
    if (done.value || at.value >= 0)
      return
    at.value = 0
  }

  /** Und von Hand, aus den Einstellungen heraus — auch wenn sie längst abgehakt ist. */
  function restart(): void {
    at.value = 0
  }

  function advance(): void {
    if (!running.value)
      return
    at.value += 1
    if (at.value >= FIRST_STEPS.length)
      finish()
  }

  function finish(): void {
    at.value = -1
    done.value = true
  }

  return { done, at, running, step, beginOnce, restart, advance, finish }
})
