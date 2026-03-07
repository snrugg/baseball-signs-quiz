import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSignDefs } from '../src/composables/useSignDefs.js'
import { DEFAULT_INDICATOR, DEFAULT_SIGN_DEFS } from '../src/data/signs.js'
import { ANCHOR_LABELS } from '../src/composables/useAnchors.js'

// ── fetch mock ────────────────────────────────────────────────────────────────
function mockFetch(responseData, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(responseData),
  })
}

function mockFetchError() {
  global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
}

describe('useSignDefs — initial state', () => {
  it('starts with DEFAULT_SIGN_DEFS', () => {
    const { signDefs } = useSignDefs()
    expect(signDefs.value).toEqual(DEFAULT_SIGN_DEFS)
  })

  it('starts with DEFAULT_INDICATOR', () => {
    const { indicator } = useSignDefs()
    expect(indicator.value).toBe(DEFAULT_INDICATOR)
  })

  it('signKeys computed returns all keys', () => {
    const { signKeys } = useSignDefs()
    expect(signKeys.value).toEqual(Object.keys(DEFAULT_SIGN_DEFS))
  })
})

describe('useSignDefs — getSignAnchors', () => {
  it('returns anchors for a known sign', () => {
    const { getSignAnchors } = useSignDefs()
    expect(getSignAnchors('Hit & Run')).toEqual(['leftArm'])
    expect(getSignAnchors('Squeeze Bunt')).toEqual(['chin'])
  })

  it('returns empty array for unknown sign', () => {
    const { getSignAnchors } = useSignDefs()
    expect(getSignAnchors('Unknown Sign')).toEqual([])
    expect(getSignAnchors('')).toEqual([])
  })

  it('reflects live updates to signDefs', () => {
    const { signDefs, getSignAnchors } = useSignDefs()
    signDefs.value = { 'New Sign': ['chest'] }
    expect(getSignAnchors('New Sign')).toEqual(['chest'])
    expect(getSignAnchors('Hit & Run')).toEqual([]) // no longer present
  })
})

describe('useSignDefs — formatSignLabel', () => {
  it('formats a single anchor using ANCHOR_LABELS', () => {
    const { formatSignLabel } = useSignDefs()
    expect(formatSignLabel(['leftArm'], ANCHOR_LABELS)).toBe('Left Arm')
    expect(formatSignLabel(['chin'], ANCHOR_LABELS)).toBe('Chin')
  })

  it('formats multiple anchors joined with " → "', () => {
    const { formatSignLabel } = useSignDefs()
    expect(formatSignLabel(['nose', 'leftEar'], ANCHOR_LABELS)).toBe('Nose → Left Ear')
    expect(formatSignLabel(['topOfHead', 'rightEar'], ANCHOR_LABELS)).toBe('Top of Head → Right Ear')
  })

  it('falls back to the key when ANCHOR_LABELS does not have a mapping', () => {
    const { formatSignLabel } = useSignDefs()
    expect(formatSignLabel(['unknownAnchor'], ANCHOR_LABELS)).toBe('unknownAnchor')
  })

  it('handles empty anchor array', () => {
    const { formatSignLabel } = useSignDefs()
    expect(formatSignLabel([], ANCHOR_LABELS)).toBe('')
  })

  it('uses a custom labels map', () => {
    const { formatSignLabel } = useSignDefs()
    const customLabels = { myAnchor: 'My Anchor' }
    expect(formatSignLabel(['myAnchor'], customLabels)).toBe('My Anchor')
  })
})

describe('useSignDefs — loadSignDefs', () => {
  it('updates signDefs and indicator from signs.json', async () => {
    const remoteData = {
      indicator: 'chest',
      signs: {
        'Test Sign': ['belt'],
        'Another': ['nose', 'chin'],
      },
    }
    mockFetch(remoteData)
    const { signDefs, indicator, loadSignDefs } = useSignDefs()
    await loadSignDefs()
    expect(signDefs.value).toEqual(remoteData.signs)
    expect(indicator.value).toBe('chest')
  })

  it('keeps defaults when fetch returns 404 (ok=false)', async () => {
    mockFetch(null, false)
    const { signDefs, indicator, loadSignDefs } = useSignDefs()
    await loadSignDefs()
    expect(signDefs.value).toEqual(DEFAULT_SIGN_DEFS)
    expect(indicator.value).toBe(DEFAULT_INDICATOR)
  })

  it('keeps defaults when fetch throws a network error', async () => {
    mockFetchError()
    const { signDefs, indicator, loadSignDefs } = useSignDefs()
    await loadSignDefs()
    expect(signDefs.value).toEqual(DEFAULT_SIGN_DEFS)
    expect(indicator.value).toBe(DEFAULT_INDICATOR)
  })

  it('keeps defaults when JSON is valid but has no "signs" field', async () => {
    mockFetch({ indicator: 'chest' }) // no "signs" field
    const { signDefs, loadSignDefs } = useSignDefs()
    await loadSignDefs()
    expect(signDefs.value).toEqual(DEFAULT_SIGN_DEFS)
  })

  it('rejects array "signs" and keeps defaults (arrays are not valid sign definitions)', async () => {
    // `typeof [] === 'object'` is true in JS, but the guard also checks !Array.isArray().
    const arraySigns = ['not', 'an', 'object']
    mockFetch({ indicator: 'chest', signs: arraySigns })
    const { signDefs, loadSignDefs } = useSignDefs()
    await loadSignDefs()
    expect(signDefs.value).toEqual(DEFAULT_SIGN_DEFS)
  })

  it('uses DEFAULT_INDICATOR when remote indicator is not a string', async () => {
    mockFetch({ indicator: 42, signs: { 'Sign': ['belt'] } })
    const { indicator, loadSignDefs } = useSignDefs()
    await loadSignDefs()
    expect(indicator.value).toBe(DEFAULT_INDICATOR)
  })

  it('uses DEFAULT_INDICATOR when remote indicator is absent', async () => {
    mockFetch({ signs: { 'Sign': ['belt'] } })
    const { indicator, loadSignDefs } = useSignDefs()
    await loadSignDefs()
    expect(indicator.value).toBe(DEFAULT_INDICATOR)
  })

  it('calls fetch with the correct URL (BASE_URL + signs.json)', async () => {
    mockFetch({ signs: {}, indicator: 'billOfCap' })
    const { loadSignDefs } = useSignDefs()
    await loadSignDefs()
    expect(global.fetch).toHaveBeenCalledWith('/signs.json')
  })
})
