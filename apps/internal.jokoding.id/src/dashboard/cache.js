import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { readCache, writeCache } from '../cacheStore.js'

export { readCache, writeCache, clearCache } from '../cacheStore.js'

// Reads `path` through the session cache. `scope` (e.g. user id) keeps users apart in one tab.
// Cached data is shown without refetching; `refresh()` or a non-zero `bust` forces a network fetch.
export function useCachedApi(path, scope = '', bust = 0) {
  const key = `${scope}:${path}`
  const [state, setState] = useState(() => {
    const c = path ? readCache(key) : null
    return { data: c?.data ?? null, at: c?.at ?? null, fromCache: !!c, error: '', loading: !!path && !c }
  })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!path) return
    const c = tick + bust === 0 ? readCache(key) : null
    if (c) {
      setState({ data: c.data, at: c.at, fromCache: true, error: '', loading: false })
      return
    }
    let active = true
    setState((s) => ({ ...s, loading: true, error: '' }))
    api(path)
      .then((data) => {
        if (!active) return
        writeCache(key, data)
        setState({ data, at: Date.now(), fromCache: false, error: '', loading: false })
      })
      .catch((e) => active && setState((s) => ({ ...s, error: e.message, loading: false })))
    return () => {
      active = false
    }
  }, [key, path, tick, bust])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, refresh }
}

export function formatJam(ms) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
