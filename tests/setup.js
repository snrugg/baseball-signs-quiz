import { vi } from 'vitest'

// Provide import.meta.env.BASE_URL used by useAnchors and useSignDefs
// Vitest sets this via the Vite plugin, but we override to a simple value
Object.defineProperty(import.meta, 'env', {
  value: { BASE_URL: '/' },
  writable: true,
  configurable: true,
})

// ---------- localStorage mock ----------
const store = {}
const localStorageMock = {
  getItem:    vi.fn((key) => store[key] ?? null),
  setItem:    vi.fn((key, val) => { store[key] = String(val) }),
  removeItem: vi.fn((key) => { delete store[key] }),
  clear:      vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
}
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ---------- URL.createObjectURL / revokeObjectURL stubs ----------
global.URL.createObjectURL = vi.fn(() => 'blob:mock')
global.URL.revokeObjectURL = vi.fn()

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
})
