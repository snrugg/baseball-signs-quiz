import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { useSequencer } from '../src/composables/useSequencer.js'

// ── GSAP mock — executes tweens synchronously ─────────────────────────────────
vi.mock('gsap', () => {
  const mockTween = () => ({ kill: vi.fn(), progress: () => 1 })
  return {
    default: {
      to: vi.fn((target, opts) => {
        // Apply all numeric final values immediately
        const skip = new Set(['duration', 'ease', 'onUpdate', 'onComplete'])
        for (const [k, v] of Object.entries(opts)) {
          if (!skip.has(k) && typeof v === 'number') target[k] = v
        }
        opts.onUpdate?.()
        opts.onComplete?.()
        return mockTween()
      }),
      delayedCall: vi.fn((_, cb) => {
        cb()
        return { kill: vi.fn() }
      }),
    },
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const ANCHOR_POSITIONS = {
  billOfCap:  new THREE.Vector3(0,  1.75, 0.1),
  chest:      new THREE.Vector3(0,  1.3,  0.12),
  belt:       new THREE.Vector3(0,  1.1,  0.12),
  nose:       new THREE.Vector3(0,  1.68, 0.12),
  leftEar:    new THREE.Vector3(-0.09, 1.7, 0.02),
  frontOfLeg: new THREE.Vector3(0.1, 0.7, 0.12),
  backOfLeg:  new THREE.Vector3(0.1, 0.7, -0.12),
}

function makeSequencer({ arcAxisOverride } = {}) {
  const getAnchorWorldPos = vi.fn((name) => ANCHOR_POSITIONS[name] ?? new THREE.Vector3(0, 1, 0))
  const getAnchorRotation = vi.fn(() => [0, 0, 0])
  const getAnchorLeftArm  = vi.fn(() => [0, 0])
  const getAnchorRightArm = vi.fn(() => [0, 0])
  const getAnchorArcAxis  = vi.fn((name) => arcAxisOverride ?? (name === 'backOfLeg' ? 'down' : 'forward'))
  const getModelForward   = vi.fn(() => ({ x: 0, y: 0, z: 1 }))
  const setTarget         = vi.fn()
  const setHandRotation   = vi.fn()
  const setLeftArmPose    = vi.fn()
  const setPoleOffset     = vi.fn()
  const setIKEnabled      = vi.fn()
  const getHandWorldPos   = vi.fn(() => new THREE.Vector3(0.3, 1.0, 0.2))

  const frameCallbacks = []
  const onFrame = vi.fn((cb) => frameCallbacks.push(cb))

  const sequencer = useSequencer(
    getAnchorWorldPos, getAnchorRotation, getAnchorLeftArm, getAnchorRightArm,
    getAnchorArcAxis, getModelForward, setTarget, setHandRotation, setLeftArmPose,
    setPoleOffset, onFrame, setIKEnabled, getHandWorldPos,
  )

  const runFrame = () => frameCallbacks.forEach(cb => cb())

  return {
    sequencer,
    mocks: {
      getAnchorWorldPos, getAnchorRotation, getAnchorLeftArm, getAnchorRightArm,
      getAnchorArcAxis, getModelForward, setTarget, setHandRotation, setLeftArmPose,
      setPoleOffset, setIKEnabled, getHandWorldPos, onFrame,
    },
    runFrame,
  }
}

// ── Tests: initial state ──────────────────────────────────────────────────────

describe('useSequencer — initial state', () => {
  it('isPlaying starts as false', () => {
    const { sequencer } = makeSequencer()
    expect(sequencer.isPlaying.value).toBe(false)
  })

  it('currentStep starts as -1', () => {
    const { sequencer } = makeSequencer()
    expect(sequencer.currentStep.value).toBe(-1)
  })

  it('currentSequence starts as empty array', () => {
    const { sequencer } = makeSequencer()
    expect(sequencer.currentSequence.value).toEqual([])
  })

  it('registers a per-frame callback', () => {
    const { mocks } = makeSequencer()
    expect(mocks.onFrame).toHaveBeenCalled()
  })
})

// ── Tests: initPosition ───────────────────────────────────────────────────────

describe('useSequencer — initPosition', () => {
  it('sets animatedPos and calls setTarget', () => {
    const { sequencer, mocks } = makeSequencer()
    const pos = new THREE.Vector3(0.3, 1.0, 0.2)
    sequencer.initPosition(pos)
    expect(mocks.setTarget).toHaveBeenCalledWith(pos)
  })
})

// ── Tests: stop ───────────────────────────────────────────────────────────────

describe('useSequencer — stop', () => {
  it('resets isPlaying, currentStep when called', () => {
    const { sequencer } = makeSequencer()
    sequencer.stop()
    expect(sequencer.isPlaying.value).toBe(false)
    expect(sequencer.currentStep.value).toBe(-1)
  })

  it('can be called when nothing is playing without throwing', () => {
    const { sequencer } = makeSequencer()
    expect(() => sequencer.stop()).not.toThrow()
  })
})

// ── Tests: playSign ───────────────────────────────────────────────────────────

describe('useSequencer — playSign', () => {
  it('returns a Promise', () => {
    const { sequencer } = makeSequencer()
    const result = sequencer.playSign(['billOfCap'])
    expect(result).toBeInstanceOf(Promise)
  })

  it('enables IK at the start', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['billOfCap'])
    expect(mocks.setIKEnabled).toHaveBeenCalledWith(true)
  })

  it('disables IK after completing the sequence', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['billOfCap'])
    const calls = mocks.setIKEnabled.mock.calls.map(c => c[0])
    expect(calls).toContain(false)
  })

  it('resolves the promise after all anchors are played', async () => {
    const { sequencer } = makeSequencer()
    let resolved = false
    await sequencer.playSign(['billOfCap', 'chest']).then(() => { resolved = true })
    expect(resolved).toBe(true)
  })

  it('calls getAnchorWorldPos for each anchor in the sequence', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['billOfCap', 'chest', 'belt'])
    expect(mocks.getAnchorWorldPos).toHaveBeenCalledWith('billOfCap')
    expect(mocks.getAnchorWorldPos).toHaveBeenCalledWith('chest')
    expect(mocks.getAnchorWorldPos).toHaveBeenCalledWith('belt')
  })

  it('calls getAnchorRotation, getAnchorLeftArm, getAnchorRightArm, getAnchorArcAxis for each anchor', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['billOfCap'])
    expect(mocks.getAnchorRotation).toHaveBeenCalledWith('billOfCap')
    expect(mocks.getAnchorLeftArm).toHaveBeenCalledWith('billOfCap')
    expect(mocks.getAnchorRightArm).toHaveBeenCalledWith('billOfCap')
    expect(mocks.getAnchorArcAxis).toHaveBeenCalledWith('billOfCap')
  })

  it('sets currentSequence to the anchor array', async () => {
    const { sequencer } = makeSequencer()
    const anchors = ['billOfCap', 'chest']
    // Check before awaiting (synchronous GSAP means it resolves immediately)
    sequencer.playSign(anchors)
    // currentSequence is set before the first tween
    expect(sequencer.currentSequence.value).toEqual(anchors)
  })

  it('calls setHandRotation during the animation', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['chest'])
    expect(mocks.setHandRotation).toHaveBeenCalled()
  })

  it('calls setLeftArmPose during the animation', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['chest'])
    expect(mocks.setLeftArmPose).toHaveBeenCalled()
  })

  it('calls setPoleOffset during the animation', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['chest'])
    expect(mocks.setPoleOffset).toHaveBeenCalled()
  })

  it('accepts custom holdTime and moveTime options', async () => {
    const { sequencer } = makeSequencer()
    await expect(
      sequencer.playSign(['billOfCap'], { holdTime: 1.0, moveTime: 0.5 })
    ).resolves.toBeUndefined()
  })

  it('works with a single anchor', async () => {
    const { sequencer } = makeSequencer()
    await expect(sequencer.playSign(['chin'])).resolves.toBeUndefined()
  })

  it('works with multiple anchors', async () => {
    const { sequencer } = makeSequencer()
    await expect(
      sequencer.playSign(['billOfCap', 'chest', 'belt', 'nose'])
    ).resolves.toBeUndefined()
  })

  it('stop() cancels a running sequence', async () => {
    const { sequencer } = makeSequencer()
    const p = sequencer.playSign(['billOfCap', 'chest'])
    sequencer.stop()
    expect(sequencer.isPlaying.value).toBe(false)
  })
})

// ── Tests: moveToAnchor ───────────────────────────────────────────────────────

describe('useSequencer — moveToAnchor', () => {
  it('enables IK', () => {
    const { sequencer, mocks } = makeSequencer()
    sequencer.moveToAnchor('chest')
    expect(mocks.setIKEnabled).toHaveBeenCalledWith(true)
  })

  it('calls getAnchorWorldPos with the anchor name', () => {
    const { sequencer, mocks } = makeSequencer()
    sequencer.moveToAnchor('belt')
    expect(mocks.getAnchorWorldPos).toHaveBeenCalledWith('belt')
  })

  it('does nothing if anchor world pos is null', () => {
    const { sequencer, mocks } = makeSequencer()
    mocks.getAnchorWorldPos.mockReturnValueOnce(null)
    expect(() => sequencer.moveToAnchor('billOfCap')).not.toThrow()
  })

  it('calls all arm/rotation setters', () => {
    const { sequencer, mocks } = makeSequencer()
    sequencer.moveToAnchor('chest')
    expect(mocks.setHandRotation).toHaveBeenCalled()
    expect(mocks.setLeftArmPose).toHaveBeenCalled()
    expect(mocks.setPoleOffset).toHaveBeenCalled()
  })

  it('accepts a custom duration', () => {
    const { sequencer } = makeSequencer()
    expect(() => sequencer.moveToAnchor('chest', 1.5)).not.toThrow()
  })
})

// ── Tests: moveToSequence ─────────────────────────────────────────────────────

describe('useSequencer — moveToSequence', () => {
  it('does nothing for empty array', () => {
    const { sequencer } = makeSequencer()
    expect(() => sequencer.moveToSequence([])).not.toThrow()
    expect(sequencer.isPlaying.value).toBe(false)
  })

  it('delegates to moveToAnchor for single-item array', () => {
    const { sequencer, mocks } = makeSequencer()
    sequencer.moveToSequence(['belt'])
    expect(mocks.getAnchorWorldPos).toHaveBeenCalledWith('belt')
  })

  it('plays through all anchors for multi-item array', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.moveToSequence(['billOfCap', 'chest', 'belt'])
    expect(mocks.getAnchorWorldPos).toHaveBeenCalledWith('billOfCap')
    expect(mocks.getAnchorWorldPos).toHaveBeenCalledWith('chest')
    expect(mocks.getAnchorWorldPos).toHaveBeenCalledWith('belt')
  })

  it('resolves after all anchors complete', async () => {
    const { sequencer } = makeSequencer()
    let resolved = false
    await sequencer.moveToSequence(['billOfCap', 'nose']).then(() => { resolved = true })
    expect(resolved).toBe(true)
  })

  it('enables IK at the start', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.moveToSequence(['billOfCap', 'chest'])
    expect(mocks.setIKEnabled).toHaveBeenCalledWith(true)
  })

  it('does NOT disable IK after completing (stays at final anchor)', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.moveToSequence(['billOfCap', 'chest'])
    // setIKEnabled(false) should NOT have been called
    const disableCalls = mocks.setIKEnabled.mock.calls.filter(c => c[0] === false)
    expect(disableCalls).toHaveLength(0)
  })
})

// ── Tests: moveToRest ─────────────────────────────────────────────────────────

describe('useSequencer — moveToRest', () => {
  it('activates IK briefly then deactivates it', () => {
    const { sequencer, mocks } = makeSequencer()
    sequencer.moveToRest()
    expect(mocks.setIKEnabled).toHaveBeenCalledWith(true)
    // After tween completes (sync mock), deactivate is called
    const calls = mocks.setIKEnabled.mock.calls.map(c => c[0])
    expect(calls).toContain(false)
  })

  it('tweens hand rotation, left arm, and elbow bias back to zero', () => {
    const { sequencer, mocks } = makeSequencer()
    sequencer.moveToRest()
    // setHandRotation, setLeftArmPose, setPoleOffset should all be called
    expect(mocks.setHandRotation).toHaveBeenCalled()
    expect(mocks.setLeftArmPose).toHaveBeenCalled()
    expect(mocks.setPoleOffset).toHaveBeenCalled()
  })

  it('accepts a custom duration', () => {
    const { sequencer } = makeSequencer()
    expect(() => sequencer.moveToRest(1.0)).not.toThrow()
  })
})

// ── Tests: sticky anchor per-frame callback ───────────────────────────────────

describe('useSequencer — sticky anchor (per-frame)', () => {
  it('re-resolves anchor world position each frame while sticky', async () => {
    const { sequencer, mocks, runFrame } = makeSequencer()
    // moveToAnchor sets stickyAnchor and completes the tween (sync mock)
    sequencer.moveToAnchor('chest')
    // Run a few frames to simulate the per-frame sticky behavior
    runFrame()
    runFrame()
    // Should have called setTarget more than once (once from tween, more from sticky)
    expect(mocks.setTarget.mock.calls.length).toBeGreaterThan(1)
  })
})

// ── Tests: arc amount (tested indirectly via setTarget calls) ─────────────────

describe('useSequencer — forward arc', () => {
  it('calls setTarget during tweens (arc is added in onUpdate)', async () => {
    const { sequencer, mocks } = makeSequencer()
    // Move between two anchors on opposite sides (high lateral distance → big arc)
    await sequencer.playSign(['leftEar', 'frontOfLeg'])
    expect(mocks.setTarget).toHaveBeenCalled()
  })

  it('getModelForward is called during tweens that apply arc', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['billOfCap', 'frontOfLeg'])
    expect(mocks.getModelForward).toHaveBeenCalled()
  })
})

// ── Tests: downward arc (backOfLeg) ──────────────────────────────────────────

describe('useSequencer — downward arc', () => {
  it('calls getAnchorArcAxis for backOfLeg', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['belt', 'backOfLeg'])
    expect(mocks.getAnchorArcAxis).toHaveBeenCalledWith('backOfLeg')
  })

  it('does NOT call getModelForward when arcAxis is down', () => {
    // Use moveToAnchor (no return-to-rest) so only the down-arc path runs
    const { sequencer, mocks } = makeSequencer({ arcAxisOverride: 'down' })
    sequencer.moveToAnchor('backOfLeg')
    expect(mocks.getModelForward).not.toHaveBeenCalled()
  })

  it('getModelForward IS called for forward-arc anchors', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['belt', 'frontOfLeg'])
    expect(mocks.getModelForward).toHaveBeenCalled()
  })

  it('setTarget is called for backOfLeg transition', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.playSign(['belt', 'backOfLeg'])
    expect(mocks.setTarget).toHaveBeenCalled()
  })

  it('moveToAnchor calls getAnchorArcAxis', () => {
    const { sequencer, mocks } = makeSequencer()
    sequencer.moveToAnchor('backOfLeg')
    expect(mocks.getAnchorArcAxis).toHaveBeenCalledWith('backOfLeg')
  })

  it('moveToSequence calls getAnchorArcAxis for each anchor', async () => {
    const { sequencer, mocks } = makeSequencer()
    await sequencer.moveToSequence(['belt', 'backOfLeg'])
    expect(mocks.getAnchorArcAxis).toHaveBeenCalledWith('belt')
    expect(mocks.getAnchorArcAxis).toHaveBeenCalledWith('backOfLeg')
  })
})
