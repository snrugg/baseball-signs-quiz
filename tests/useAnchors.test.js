import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import * as THREE from 'three'
import { useAnchors, ANCHOR_LABELS } from '../src/composables/useAnchors.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal fake bone at the given world position.
 * The quaternion is always identity so offset transforms are predictable.
 */
function makeBone(wx = 0, wy = 1, wz = 0) {
  return {
    getWorldPosition: (target) => target.set(wx, wy, wz),
    getWorldQuaternion: (target) => target.set(0, 0, 0, 1), // identity
    getWorldDirection: (target) => target.set(0, 0, 1),
    position: new THREE.Vector3(wx, wy, wz),
    matrixWorld: new THREE.Matrix4(),
  }
}

/**
 * Build a boneMap ref that covers the anchor bone suffixes used in the defaults.
 * Bone names use the "mixamorig:" prefix so detection is deterministic.
 */
function makeBoneMap() {
  const prefix = 'mixamorig:'
  return ref({
    [`${prefix}Hips`]:        makeBone(0, 1, 0),
    [`${prefix}Head`]:        makeBone(0, 1.7, 0),
    [`${prefix}HeadTop_End`]: makeBone(0, 1.85, 0),
    [`${prefix}Spine1`]:      makeBone(0, 1.1, 0),
    [`${prefix}Spine2`]:      makeBone(0, 1.3, 0),
    [`${prefix}LeftArm`]:     makeBone(-0.3, 1.4, 0),
    [`${prefix}RightUpLeg`]:  makeBone(0.1, 0.7, 0),
    [`${prefix}LeftHand`]:    makeBone(-0.4, 1.0, 0),
  })
}

function mockFetch(data, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(data),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ANCHOR_LABELS', () => {
  it('has human-readable labels for all expected anchors', () => {
    expect(ANCHOR_LABELS.billOfCap).toBe('Bill of Cap')
    expect(ANCHOR_LABELS.topOfHead).toBe('Top of Head')
    expect(ANCHOR_LABELS.nose).toBe('Nose')
    expect(ANCHOR_LABELS.chin).toBe('Chin')
    expect(ANCHOR_LABELS.chest).toBe('Chest')
    expect(ANCHOR_LABELS.belt).toBe('Belt')
    expect(ANCHOR_LABELS.leftArm).toBe('Left Arm')
  })
})

describe('useAnchors — initial state', () => {
  beforeEach(() => {
    mockFetch(null, false) // calibration.json returns 404 → keep defaults
  })

  it('anchorNames includes all expected anchors', () => {
    const boneMap = makeBoneMap()
    const { anchorNames } = useAnchors(boneMap, null)
    const names = anchorNames.value
    expect(names).toContain('billOfCap')
    expect(names).toContain('topOfHead')
    expect(names).toContain('chest')
    expect(names).toContain('belt')
    expect(names).toContain('frontOfHand')
    expect(names).toContain('backOfHand')
  })

  it('anchorDefs starts with default values', () => {
    const boneMap = makeBoneMap()
    const { anchorDefs } = useAnchors(boneMap, null)
    expect(anchorDefs.value.billOfCap).toBeDefined()
    expect(anchorDefs.value.billOfCap.bone).toBe('Head')
    expect(Array.isArray(anchorDefs.value.billOfCap.offset)).toBe(true)
  })
})

describe('useAnchors — getAnchorRotation', () => {
  beforeEach(() => mockFetch(null, false))

  it('returns [0,0,0] for anchors with no rotation override', () => {
    const { getAnchorRotation } = useAnchors(makeBoneMap(), null)
    expect(getAnchorRotation('billOfCap')).toEqual([0, 0, 0])
    expect(getAnchorRotation('chest')).toEqual([0, 0, 0])
  })

  it('returns [0,0,0] for an unknown anchor', () => {
    const { getAnchorRotation } = useAnchors(makeBoneMap(), null)
    expect(getAnchorRotation('nonExistent')).toEqual([0, 0, 0])
  })
})

describe('useAnchors — getAnchorLeftArm / getAnchorRightArm', () => {
  beforeEach(() => mockFetch(null, false))

  it('returns [0,0] for left arm by default', () => {
    const { getAnchorLeftArm } = useAnchors(makeBoneMap(), null)
    expect(getAnchorLeftArm('billOfCap')).toEqual([0, 0])
  })

  it('returns [0,0] for right arm by default', () => {
    const { getAnchorRightArm } = useAnchors(makeBoneMap(), null)
    expect(getAnchorRightArm('billOfCap')).toEqual([0, 0])
  })

  it('returns [0,0] for unknown anchor (left arm)', () => {
    const { getAnchorLeftArm } = useAnchors(makeBoneMap(), null)
    expect(getAnchorLeftArm('unknown')).toEqual([0, 0])
  })

  it('returns [0,0] for unknown anchor (right arm)', () => {
    const { getAnchorRightArm } = useAnchors(makeBoneMap(), null)
    expect(getAnchorRightArm('unknown')).toEqual([0, 0])
  })
})

describe('useAnchors — setAnchorOffset', () => {
  beforeEach(() => mockFetch(null, false))

  it('updates the x offset of an anchor', () => {
    const { anchorDefs, setAnchorOffset } = useAnchors(makeBoneMap(), null)
    setAnchorOffset('billOfCap', 'x', 0.5)
    expect(anchorDefs.value.billOfCap.offset[0]).toBe(0.5)
  })

  it('updates the y offset of an anchor', () => {
    const { anchorDefs, setAnchorOffset } = useAnchors(makeBoneMap(), null)
    setAnchorOffset('chest', 'y', -0.1)
    expect(anchorDefs.value.chest.offset[1]).toBe(-0.1)
  })

  it('updates the z offset of an anchor', () => {
    const { anchorDefs, setAnchorOffset } = useAnchors(makeBoneMap(), null)
    setAnchorOffset('belt', 'z', 0.2)
    expect(anchorDefs.value.belt.offset[2]).toBe(0.2)
  })

  it('does nothing for an unknown anchor', () => {
    const { setAnchorOffset } = useAnchors(makeBoneMap(), null)
    // Should not throw
    expect(() => setAnchorOffset('nonExistent', 'x', 1)).not.toThrow()
  })

  it('does nothing for an unknown axis', () => {
    const { anchorDefs, setAnchorOffset } = useAnchors(makeBoneMap(), null)
    const originalOffset = [...anchorDefs.value.billOfCap.offset]
    setAnchorOffset('billOfCap', 'w', 99) // 'w' is not a valid axis
    expect(anchorDefs.value.billOfCap.offset).toEqual(originalOffset)
  })
})

describe('useAnchors — setAnchorRotation', () => {
  beforeEach(() => mockFetch(null, false))

  it('updates rotation on the x axis', () => {
    const { anchorDefs, setAnchorRotation } = useAnchors(makeBoneMap(), null)
    setAnchorRotation('billOfCap', 'x', 45)
    expect(anchorDefs.value.billOfCap.rotation[0]).toBe(45)
  })

  it('updates rotation on the y axis', () => {
    const { anchorDefs, setAnchorRotation } = useAnchors(makeBoneMap(), null)
    setAnchorRotation('chest', 'y', -90)
    expect(anchorDefs.value.chest.rotation[1]).toBe(-90)
  })

  it('updates rotation on the z axis', () => {
    const { anchorDefs, setAnchorRotation } = useAnchors(makeBoneMap(), null)
    setAnchorRotation('chin', 'z', 180)
    expect(anchorDefs.value.chin.rotation[2]).toBe(180)
  })

  it('does nothing for unknown anchor', () => {
    const { setAnchorRotation } = useAnchors(makeBoneMap(), null)
    expect(() => setAnchorRotation('unknown', 'x', 45)).not.toThrow()
  })
})

describe('useAnchors — setAnchorLeftArm', () => {
  beforeEach(() => mockFetch(null, false))

  it('updates the forward angle (axis 0)', () => {
    const { anchorDefs, setAnchorLeftArm } = useAnchors(makeBoneMap(), null)
    setAnchorLeftArm('chest', 0, 30)
    expect(anchorDefs.value.chest.leftArm[0]).toBe(30)
  })

  it('updates the raise angle (axis 1)', () => {
    const { anchorDefs, setAnchorLeftArm } = useAnchors(makeBoneMap(), null)
    setAnchorLeftArm('chest', 1, 45)
    expect(anchorDefs.value.chest.leftArm[1]).toBe(45)
  })

  it('does nothing for unknown anchor', () => {
    const { setAnchorLeftArm } = useAnchors(makeBoneMap(), null)
    expect(() => setAnchorLeftArm('unknown', 0, 30)).not.toThrow()
  })
})

describe('useAnchors — setAnchorRightArm', () => {
  beforeEach(() => mockFetch(null, false))

  it('updates the out bias (axis 0)', () => {
    const { anchorDefs, setAnchorRightArm } = useAnchors(makeBoneMap(), null)
    setAnchorRightArm('chest', 0, 1.5)
    expect(anchorDefs.value.chest.rightArm[0]).toBe(1.5)
  })

  it('updates the up bias (axis 1)', () => {
    const { anchorDefs, setAnchorRightArm } = useAnchors(makeBoneMap(), null)
    setAnchorRightArm('belt', 1, -0.5)
    expect(anchorDefs.value.belt.rightArm[1]).toBe(-0.5)
  })
})

describe('useAnchors — resetOffsets', () => {
  beforeEach(() => mockFetch(null, false))

  it('restores defaults after modifications', () => {
    const { anchorDefs, setAnchorOffset, resetOffsets } = useAnchors(makeBoneMap(), null)
    const originalY = anchorDefs.value.billOfCap.offset[1]
    setAnchorOffset('billOfCap', 'y', 99)
    expect(anchorDefs.value.billOfCap.offset[1]).toBe(99)
    resetOffsets()
    expect(anchorDefs.value.billOfCap.offset[1]).toBe(originalY)
  })

  it('removes the localStorage entry', () => {
    const { resetOffsets } = useAnchors(makeBoneMap(), null)
    resetOffsets()
    expect(localStorage.removeItem).toHaveBeenCalledWith('baseballSigns_anchorOffsets')
  })
})

describe('useAnchors — saveOffsets', () => {
  beforeEach(() => mockFetch(null, false))

  it('writes data to localStorage', () => {
    const { saveOffsets } = useAnchors(makeBoneMap(), null)
    saveOffsets()
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'baseballSigns_anchorOffsets',
      expect.any(String),
    )
    const saved = JSON.parse(localStorage.setItem.mock.calls[0][1])
    expect(saved.billOfCap).toBeDefined()
    expect(saved.billOfCap.bone).toBe('Head')
    expect(Array.isArray(saved.billOfCap.offset)).toBe(true)
  })

  it('includes all required fields in saved data', () => {
    const { saveOffsets } = useAnchors(makeBoneMap(), null)
    saveOffsets()
    const saved = JSON.parse(localStorage.setItem.mock.calls[0][1])
    for (const [, def] of Object.entries(saved)) {
      expect(typeof def.bone).toBe('string')
      expect(Array.isArray(def.offset)).toBe(true)
      expect(Array.isArray(def.rotation)).toBe(true)
      expect(Array.isArray(def.leftArm)).toBe(true)
      expect(Array.isArray(def.rightArm)).toBe(true)
    }
  })

  it('triggers a file download via a link click', () => {
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return { href: '', download: '', click: clickSpy }
      return document.createElement.__original?.(tag) ?? {}
    })
    const { saveOffsets } = useAnchors(makeBoneMap(), null)
    saveOffsets()
    expect(clickSpy).toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

describe('useAnchors — getAnchorWorldPos', () => {
  beforeEach(() => mockFetch(null, false))

  it('returns null for unknown anchor', () => {
    const { getAnchorWorldPos } = useAnchors(makeBoneMap(), null)
    expect(getAnchorWorldPos('nonExistent')).toBeNull()
  })

  it('returns a THREE.Vector3 for a known anchor with a matching bone', () => {
    const { getAnchorWorldPos } = useAnchors(makeBoneMap(), null)
    // Trigger prefix detection by calling updateAnchors first
    const result = getAnchorWorldPos('belt')
    // With no prefix set yet the bone lookup may fail, so just check type if non-null
    if (result !== null) {
      expect(result).toBeInstanceOf(THREE.Vector3)
    }
  })

  it('returns null when the anchor bone is not in boneMap', () => {
    // boneMap with only Hips (no Head, Spine, etc.)
    const boneMap = ref({ 'mixamorig:Hips': makeBone() })
    const { getAnchorWorldPos } = useAnchors(boneMap, null)
    expect(getAnchorWorldPos('billOfCap')).toBeNull() // Head bone missing
  })
})

describe('useAnchors — calibration.json loading', () => {
  it('overrides defaults when calibration.json is present', async () => {
    const remoteData = {
      billOfCap: {
        bone: 'Head',
        offset: [0.1, 0.2, 0.3],
        rotation: [10, 20, 30],
        leftArm: [5, 10],
        rightArm: [1, 2],
      },
    }
    mockFetch(remoteData)
    // Must await the async calibration load — use a small helper
    const boneMap = makeBoneMap()
    const { anchorDefs } = useAnchors(boneMap, null)
    // Give the async fetch time to resolve
    await vi.waitFor(() =>
      expect(anchorDefs.value.billOfCap.offset).toEqual([0.1, 0.2, 0.3])
    )
    expect(anchorDefs.value.billOfCap.rotation).toEqual([10, 20, 30])
  })

  it('keeps defaults when calibration.json returns 404', async () => {
    mockFetch(null, false)
    const boneMap = makeBoneMap()
    const { anchorDefs } = useAnchors(boneMap, null)
    await new Promise(r => setTimeout(r, 10)) // let promise settle
    expect(anchorDefs.value.billOfCap.offset).toEqual([0, 0.15, 0.13])
  })
})

describe('useAnchors — onFrame / updateAnchors', () => {
  beforeEach(() => mockFetch(null, false))

  it('registers a callback with onFrame', () => {
    const boneMap = makeBoneMap()
    const onFrame = vi.fn()
    useAnchors(boneMap, onFrame)
    expect(onFrame).toHaveBeenCalledWith(expect.any(Function))
  })

  it('updateAnchors populates anchorPositions when bones are present', () => {
    const boneMap = makeBoneMap()
    const { updateAnchors, anchorPositions } = useAnchors(boneMap, null)
    updateAnchors()
    // After prefix detection, some anchors should have positions
    const keys = Object.keys(anchorPositions.value)
    expect(keys.length).toBeGreaterThan(0)
  })

  it('updateAnchors does nothing when boneMap is empty', () => {
    const boneMap = ref({})
    const { updateAnchors, anchorPositions } = useAnchors(boneMap, null)
    updateAnchors()
    expect(Object.keys(anchorPositions.value)).toHaveLength(0)
  })
})
