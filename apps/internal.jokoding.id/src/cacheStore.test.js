import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_AGE_MS, readCache, writeCache } from './cacheStore.js'
import { api } from './api.js'

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe('dashboard cache', () => {
  it('expires entries older than MAX_AGE_MS', () => {
    writeCache('k', { n: 1 })
    expect(readCache('k')?.data).toEqual({ n: 1 })
    expect(readCache('k', Date.now() + MAX_AGE_MS + 1)).toBeNull()
  })

  it('is wiped after a successful write request', async () => {
    writeCache('1:/api/stats', { gross: 0 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 201 })))
    await api('/api/orders', { method: 'POST', body: {} })
    expect(readCache('1:/api/stats')).toBeNull()
  })

  it('survives a GET request', async () => {
    writeCache('1:/api/stats', { gross: 0 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })))
    await api('/api/orders')
    expect(readCache('1:/api/stats')).not.toBeNull()
  })
})
