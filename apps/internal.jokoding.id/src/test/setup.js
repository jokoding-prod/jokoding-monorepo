import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

afterEach(() => {
  try {
    sessionStorage.clear()
    localStorage.clear()
  } catch {
    // ignore
  }
})
