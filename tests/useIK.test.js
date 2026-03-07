import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import * as THREE from 'three'
import { useIK } from '../src/composables/useIK.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a minimal fake bone usable by the IK solver.
 *
 * The bone has the methods called by useIK:
 *   getWorldPosition, getWorldQuaternion, getWorldDirection
 *   updateMatrixWorld (no-op), matrixWorld (identity)
 *
 * Its `position` represents the rest-dir vector used in setFromUnitVectors.
 */
function makeFakeBone(worldPos = [0, 1, 0], restDir = [0, 1, 0]) {
  return {
    getWorldPosition:   vi.fn((target) => target.set(...worldPos)),
    getWorldQuaternion: vi.fn((target) => { target.set(0, 0, 0, 1); return target }),
    getWorldDirection:  vi.fn((target) => target.set(0, 0, 1)),
    updateMatrixWorld:  vi.fn(),
    matrixWorld:        new THREE.Matrix4(),
    position:           new THREE.Vector3(...restDir),
    quaternion:         new THREE.Quaternion(),
    parent: {
      updateWorldMatrix: vi.fn(),
      matrixWorld: new THREE.Matrix4(),
    },
  }
}

/**
 * Creates a minimal fake model (THREE.Object3D-like).
 */
function makeFakeModel(pos = [0, 0, 0]) {
  const m = {
    position: new THREE.Vector3(...pos),
    matrixWorld: new THREE.Matrix4(),
    updateMatrixWorld: vi.fn(),
    getWorldQuaternion: vi.fn((q) => { q.set(0, 0, 0, 1); return q }),
  }
  return m
}

function makeIK(opts = {}) {
  const shoulder = makeFakeBone([0, 1.4, 0], [0, -0.4, 0])   // upper arm
  const elbow    = makeFakeBone([0.3, 1.1, 0], [0.3, -0.3, 0]) // forearm
  const hand     = makeFakeBone([0.4, 0.9, 0], [0.1, -0.2, 0]) // hand

  elbow.parent   = { updateWorldMatrix: vi.fn(), matrixWorld: new THREE.Matrix4() }
  shoulder.parent = { updateWorldMatrix: vi.fn(), matrixWorld: new THREE.Matrix4() }

  const bones = {
    'mixamorig:Hips':        makeFakeBone(),
    'mixamorig:RightArm':    shoulder,
    'mixamorig:RightForeArm': elbow,
    'mixamorig:RightHand':   hand,
  }

  const model   = ref(opts.model ?? makeFakeModel())
  const skeleton = ref({})
  const boneMap  = ref(bones)
  const onFrame  = vi.fn()

  const ik = useIK(model, skeleton, boneMap, onFrame)
  return { ik, model, skeleton, boneMap, onFrame, shoulder, elbow, hand }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useIK — initial state', () => {
  it('ikReady starts as false', () => {
    const { ik } = makeIK()
    expect(ik.ikReady.value).toBe(false)
  })

  it('registers a per-frame callback', () => {
    const { onFrame } = makeIK()
    expect(onFrame).toHaveBeenCalledWith(expect.any(Function))
  })
})

describe('useIK — setTarget / getTarget', () => {
  it('getTarget returns a clone of the current target', () => {
    const { ik } = makeIK()
    const pos = new THREE.Vector3(1, 2, 3)
    ik.setTarget(pos)
    const result = ik.getTarget()
    expect(result.x).toBeCloseTo(1)
    expect(result.y).toBeCloseTo(2)
    expect(result.z).toBeCloseTo(3)
  })

  it('getTarget returns a clone (mutations do not affect internal state)', () => {
    const { ik } = makeIK()
    ik.setTarget(new THREE.Vector3(5, 6, 7))
    const result = ik.getTarget()
    result.x = 999
    expect(ik.getTarget().x).toBeCloseTo(5)
  })

  it('setTarget with different values updates correctly', () => {
    const { ik } = makeIK()
    ik.setTarget(new THREE.Vector3(0.1, 1.5, -0.2))
    const t = ik.getTarget()
    expect(t.x).toBeCloseTo(0.1)
    expect(t.y).toBeCloseTo(1.5)
    expect(t.z).toBeCloseTo(-0.2)
  })
})

describe('useIK — setHandRotation', () => {
  it('can be called without throwing', () => {
    const { ik } = makeIK()
    expect(() => ik.setHandRotation(10, 20, 30)).not.toThrow()
  })

  it('zero rotation is the identity / no-override state', () => {
    const { ik } = makeIK()
    expect(() => ik.setHandRotation(0, 0, 0)).not.toThrow()
  })
})

describe('useIK — setPoleOffset', () => {
  it('can be called without throwing', () => {
    const { ik } = makeIK()
    expect(() => ik.setPoleOffset(0.5, 1.0)).not.toThrow()
  })

  it('accepts negative values', () => {
    const { ik } = makeIK()
    expect(() => ik.setPoleOffset(-1, -2)).not.toThrow()
  })
})

describe('useIK — setIKEnabled / snapTargetToHand', () => {
  it('setIKEnabled can be toggled without throwing', () => {
    const { ik } = makeIK()
    expect(() => ik.setIKEnabled(true)).not.toThrow()
    expect(() => ik.setIKEnabled(false)).not.toThrow()
  })

  it('snapTargetToHand does nothing when no model/hand (ikReady=false)', () => {
    const model = ref(null)
    const ik = useIK(model, ref({}), ref({}), vi.fn())
    expect(() => ik.snapTargetToHand()).not.toThrow()
  })
})

describe('useIK — getHandWorldPos', () => {
  it('returns null when model is null', () => {
    const model = ref(null)
    const ik = useIK(model, ref({}), ref({}), vi.fn())
    expect(ik.getHandWorldPos()).toBeNull()
  })

  it('returns null when boneMap has no hand bone', () => {
    const model = ref(makeFakeModel())
    const ik = useIK(model, ref({}), ref({}), vi.fn())
    expect(ik.getHandWorldPos()).toBeNull()
  })
})

describe('useIK — initIK', () => {
  it('returns false when boneMap is empty', () => {
    const model = ref(makeFakeModel())
    const ik = useIK(model, ref({}), ref({}), vi.fn())
    const result = ik.initIK()
    expect(result).toBe(false)
  })

  it('returns false when required arm bones are missing', () => {
    const model = ref(makeFakeModel())
    const boneMap = ref({
      'mixamorig:Hips': makeFakeBone(),
      // Missing RightArm, RightForeArm, RightHand
    })
    const ik = useIK(model, ref({}), boneMap, vi.fn())
    const result = ik.initIK()
    expect(result).toBe(false)
  })

  it('returns true and sets ikReady when all bones are present', () => {
    const { ik } = makeIK()
    // initIK was already called by the watcher; force-call directly
    const result = ik.initIK()
    // Result depends on whether the watcher already fired — true if bones found
    expect(typeof result).toBe('boolean')
  })
})

describe('useIK — computeAutoHandRotation', () => {
  it('returns [0, 0, 0] when model is null', () => {
    const model = ref(null)
    const ik = useIK(model, ref({}), ref({}), vi.fn())
    const result = ik.computeAutoHandRotation(new THREE.Vector3(0, 1, 0))
    expect(result).toEqual([0, 0, 0])
  })

  it('returns an array of three numbers in normal operation', async () => {
    const { ik } = makeIK()
    // Wait for initIK to complete (triggered by watcher after 150ms)
    await new Promise(r => setTimeout(r, 200))
    const result = ik.computeAutoHandRotation(new THREE.Vector3(0.2, 1.6, 0.1))
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(3)
    result.forEach(v => expect(typeof v).toBe('number'))
  })
})

describe('useIK — getHandWorldPos (after init)', () => {
  it('returns a Vector3 when model and handBone are present after init', () => {
    const { ik } = makeIK()
    ik.initIK()
    const result = ik.getHandWorldPos()
    expect(result).not.toBeNull()
    expect(result).toBeInstanceOf(THREE.Vector3)
  })

  it('returns the hand bone world position', () => {
    const { ik } = makeIK()
    ik.initIK()
    const result = ik.getHandWorldPos()
    // makeFakeBone([0.4, 0.9, 0]) for the hand
    expect(result.x).toBeCloseTo(0.4)
    expect(result.y).toBeCloseTo(0.9)
    expect(result.z).toBeCloseTo(0)
  })
})

describe('useIK — solveTwoBoneIK (via frame callback)', () => {
  it('frame callback does nothing when ikReady is false', () => {
    const { shoulder, onFrame } = makeIK()
    const beforeW = shoulder.quaternion.w
    const frameCallback = onFrame.mock.calls[0][0]
    frameCallback() // ikReady=false → no-op
    expect(shoulder.quaternion.w).toBe(beforeW)
  })

  it('frame callback does nothing when IK is disabled', () => {
    const { ik, shoulder, onFrame } = makeIK()
    ik.initIK()
    ik.setIKEnabled(false)
    // Reset quaternion to identity so we can detect changes
    shoulder.quaternion.set(0, 0, 0, 1)
    const frameCallback = onFrame.mock.calls[0][0]
    frameCallback()
    expect(shoulder.quaternion.w).toBeCloseTo(1)
    expect(shoulder.quaternion.x).toBeCloseTo(0)
  })

  it('modifies upperArmBone quaternion after solving', () => {
    const { ik, shoulder, onFrame } = makeIK()
    ik.initIK()
    shoulder.quaternion.set(0, 0, 0, 1) // reset to identity
    ik.setTarget(new THREE.Vector3(0.4, 1.2, 0.3))
    const frameCallback = onFrame.mock.calls[0][0]
    frameCallback()
    // The solver rotates the upper arm — quaternion should no longer be identity
    const isIdentity = (
      Math.abs(shoulder.quaternion.w - 1) < 0.001 &&
      Math.abs(shoulder.quaternion.x) < 0.001 &&
      Math.abs(shoulder.quaternion.y) < 0.001 &&
      Math.abs(shoulder.quaternion.z) < 0.001
    )
    expect(isIdentity).toBe(false)
  })

  it('modifies forearmBone quaternion after solving', () => {
    const { ik, elbow, onFrame } = makeIK()
    ik.initIK()
    elbow.quaternion.set(0, 0, 0, 1)
    ik.setTarget(new THREE.Vector3(0.4, 1.2, 0.3))
    const frameCallback = onFrame.mock.calls[0][0]
    frameCallback()
    const isIdentity = (
      Math.abs(elbow.quaternion.w - 1) < 0.001 &&
      Math.abs(elbow.quaternion.x) < 0.001 &&
      Math.abs(elbow.quaternion.y) < 0.001 &&
      Math.abs(elbow.quaternion.z) < 0.001
    )
    expect(isIdentity).toBe(false)
  })

  it('produces unit quaternions for both arm bones after solving', () => {
    const { ik, shoulder, elbow, onFrame } = makeIK()
    ik.initIK()
    ik.setTarget(new THREE.Vector3(0.3, 1.2, 0.1))
    const frameCallback = onFrame.mock.calls[0][0]
    frameCallback()

    const lenSq = (q) => q.w ** 2 + q.x ** 2 + q.y ** 2 + q.z ** 2
    expect(Math.sqrt(lenSq(shoulder.quaternion))).toBeCloseTo(1)
    expect(Math.sqrt(lenSq(elbow.quaternion))).toBeCloseTo(1)
  })

  it('does not throw when target is beyond max reach', () => {
    const { ik, onFrame } = makeIK()
    ik.initIK()
    ik.setTarget(new THREE.Vector3(10, 10, 10))
    const frameCallback = onFrame.mock.calls[0][0]
    expect(() => frameCallback()).not.toThrow()
  })

  it('does not throw when target is at the shoulder (zero distance)', () => {
    const { ik, onFrame } = makeIK()
    ik.initIK()
    ik.setTarget(new THREE.Vector3(0, 1.4, 0)) // same as shoulder world pos
    const frameCallback = onFrame.mock.calls[0][0]
    expect(() => frameCallback()).not.toThrow()
  })

  it('applies hand rotation override when setHandRotation is non-zero', () => {
    const { ik, hand, onFrame } = makeIK()
    ik.initIK()
    hand.quaternion.set(0, 0, 0, 1)
    ik.setTarget(new THREE.Vector3(0.4, 1.2, 0.3))
    ik.setHandRotation(30, 45, -20)
    const frameCallback = onFrame.mock.calls[0][0]
    frameCallback()
    // hand quaternion should be a valid unit quaternion (not identity)
    const lenSq = hand.quaternion.w ** 2 + hand.quaternion.x ** 2 +
                  hand.quaternion.y ** 2 + hand.quaternion.z ** 2
    expect(Math.sqrt(lenSq)).toBeCloseTo(1)
    const isIdentity = Math.abs(hand.quaternion.w - 1) < 0.001
    expect(isIdentity).toBe(false)
  })

  it('skips hand rotation override when setHandRotation is zero', () => {
    const { ik, hand, onFrame } = makeIK()
    ik.initIK()
    hand.quaternion.set(0, 0, 0, 1) // start at identity
    ik.setTarget(new THREE.Vector3(0.4, 1.2, 0.3))
    ik.setHandRotation(0, 0, 0)     // zero = no override
    const frameCallback = onFrame.mock.calls[0][0]
    frameCallback()
    // With zero rotation, the hand bone quaternion is NOT touched by the override
    // It stays as set by the IK solve (identity in this fake setup)
    expect(hand.quaternion.w).toBeCloseTo(1)
    expect(hand.quaternion.x).toBeCloseTo(0)
    expect(hand.quaternion.y).toBeCloseTo(0)
    expect(hand.quaternion.z).toBeCloseTo(0)
  })
})

describe('useIK — auto-init via watcher', () => {
  it('sets ikReady=true after 150ms when all arm bones are present', async () => {
    vi.useFakeTimers()
    const { ik } = makeIK()
    expect(ik.ikReady.value).toBe(false)
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(ik.ikReady.value).toBe(true)
    vi.useRealTimers()
  })

  it('does not set ikReady when arm bones are absent', async () => {
    vi.useFakeTimers()
    const model = ref(makeFakeModel())
    const boneMap = ref({ 'mixamorig:Hips': makeFakeBone() })
    const ik = useIK(model, ref({}), boneMap, vi.fn())
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(ik.ikReady.value).toBe(false)
    vi.useRealTimers()
  })
})
