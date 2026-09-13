import type { SaveGame, SaveSummary } from '~/core/contracts'

/**
 * Where a campaign is kept between sessions.
 *
 * Everything that knows about IndexedDB and localStorage is here, and nothing here knows anything
 * about the game: it takes a save and puts it somewhere, or goes and gets one. The store that calls
 * it decides what a save *means* — which party, which month, what to do when it cannot be read.
 *
 * Two stores rather than one, and the split is deliberate. The save itself is a whole simulation
 * state, far past what a cookie may hold and past what anyone should put in localStorage, so it goes
 * in IndexedDB — which is asynchronous. The title screen cannot wait for that: it has to know on the
 * first paint whether to offer "continue", or the player sees "new campaign" and watches it change
 * its mind a moment later. So a short summary — who you were, how far you got — is written beside it
 * in localStorage, which can be read synchronously.
 */

const DB_NAME = '2036-lindenhafen'
const SAVE_KEY = 'autosave-v2'
const SUMMARY_KEY = '2036-lindenhafen-save'
/** What this build can read. Anything else is a save from before the content changed. */
const SCHEMA = 2

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('saves')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Put the campaign away, and leave the note on the doorstep saying it is there. */
export async function writeSave(payload: SaveGame): Promise<SaveSummary> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('saves', 'readwrite')
      transaction.objectStore('saves').put(payload, SAVE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }
  finally {
    database.close()
  }

  const summary: SaveSummary = { savedAt: payload.savedAt, partyId: payload.partyId, month: payload.snapshot.month }
  localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary))
  return summary
}

/**
 * Fetch the campaign, or nothing.
 *
 * Nothing covers both "there is none" and "there is one this build cannot read", because the caller
 * does the same thing in either case: forget it rather than load a ruin.
 */
export async function readSave(): Promise<SaveGame | null> {
  const database = await openDatabase()
  try {
    const payload = await new Promise<SaveGame | undefined>((resolve, reject) => {
      const request = database.transaction('saves', 'readonly').objectStore('saves').get(SAVE_KEY)
      request.onsuccess = () => resolve(request.result as SaveGame | undefined)
      request.onerror = () => reject(request.error)
    })
    return payload && payload.schemaVersion === SCHEMA && payload.state ? payload : null
  }
  finally {
    database.close()
  }
}

/**
 * The note on the doorstep, read synchronously.
 *
 * Null on the server, where there is no localStorage — and the caller must not read this during
 * store setup for that reason: Pinia hydrates the client with whatever the server had, so a value
 * read during setup is replaced by the server's null a moment later.
 */
export function readSummary(): SaveSummary | null {
  if (!import.meta.client)
    return null
  try {
    const raw = localStorage.getItem(SUMMARY_KEY)
    return raw ? JSON.parse(raw) as SaveSummary : null
  }
  catch {
    return null
  }
}

/** Take the note down. The campaign itself is left where it is and overwritten by the next save. */
export function clearSummary(): void {
  try {
    localStorage.removeItem(SUMMARY_KEY)
  }
  catch {}
}
