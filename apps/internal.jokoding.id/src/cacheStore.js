// sessionStorage cache for dashboard reads. Entries expire after MAX_AGE_MS and are wiped
// after any successful write to the API (see api.js), so new orders show up at once.
const PREFIX = 'jk-internal:cache:'
export const MAX_AGE_MS = 5 * 60 * 1000

export function readCache(key, now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v || typeof v.at !== 'number' || now - v.at > MAX_AGE_MS) return null
    return v
  } catch {
    return null
  }
}

export function writeCache(key, data) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ data, at: Date.now() }))
  } catch {
    // penyimpanan penuh atau diblokir
  }
}

export function clearCache() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(PREFIX)) sessionStorage.removeItem(k)
    }
  } catch {
    // abaikan
  }
}
