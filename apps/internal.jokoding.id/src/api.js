const BASE = import.meta.env.VITE_API_URL || ''

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server')
  }
  if (res.status === 204) return null
  let data = null
  try {
    data = await res.json()
  } catch {
    // body kosong atau bukan JSON
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || 'Terjadi kesalahan')
  return data
}
