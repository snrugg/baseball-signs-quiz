import { describe, it, expect } from 'vitest'
import {
  RIGHT_ARM_BONE_PATTERNS,
  isRightArmTrack,
  filterRightArmTracks,
  computeModelScale,
  computeGroundOffset,
  computeCenterOffsetX,
  computeDragRotation,
  computeDragPan,
  clampPixelRatio,
} from '../src/composables/sceneUtils.js'

// ── RIGHT_ARM_BONE_PATTERNS ───────────────────────────────────────────────────

describe('RIGHT_ARM_BONE_PATTERNS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(RIGHT_ARM_BONE_PATTERNS)).toBe(true)
    expect(RIGHT_ARM_BONE_PATTERNS.length).toBeGreaterThan(0)
    RIGHT_ARM_BONE_PATTERNS.forEach(p => expect(typeof p).toBe('string'))
  })

  it('includes all critical right-arm segments', () => {
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightArm')
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightForeArm')
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightHand')
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightShoulder')
  })

  it('includes finger bones', () => {
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightHandThumb')
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightHandIndex')
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightHandMiddle')
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightHandRing')
    expect(RIGHT_ARM_BONE_PATTERNS).toContain('RightHandPinky')
  })
})

// ── isRightArmTrack ───────────────────────────────────────────────────────────

describe('isRightArmTrack', () => {
  it('returns true for RightArm.quaternion', () => {
    expect(isRightArmTrack('RightArm.quaternion')).toBe(true)
  })

  it('returns true for RightForeArm.quaternion', () => {
    expect(isRightArmTrack('RightForeArm.quaternion')).toBe(true)
  })

  it('returns true for RightHand.position', () => {
    expect(isRightArmTrack('RightHand.position')).toBe(true)
  })

  it('returns true for prefixed bone names (mixamorig:RightArm)', () => {
    expect(isRightArmTrack('mixamorig:RightArm.quaternion')).toBe(true)
  })

  it('returns true for mixamorig9RightForeArm', () => {
    expect(isRightArmTrack('mixamorig9RightForeArm.quaternion')).toBe(true)
  })

  it('returns true for RightHandThumb', () => {
    expect(isRightArmTrack('mixamorig:RightHandThumb1.quaternion')).toBe(true)
  })

  it('returns true for RightHandPinky', () => {
    expect(isRightArmTrack('mixamorig:RightHandPinky3.quaternion')).toBe(true)
  })

  it('returns false for LeftArm.quaternion', () => {
    expect(isRightArmTrack('LeftArm.quaternion')).toBe(false)
  })

  it('returns false for Spine.quaternion', () => {
    expect(isRightArmTrack('Spine.quaternion')).toBe(false)
  })

  it('returns false for Hips.position', () => {
    expect(isRightArmTrack('Hips.position')).toBe(false)
  })

  it('returns false for Head.quaternion', () => {
    expect(isRightArmTrack('Head.quaternion')).toBe(false)
  })

  it('returns false for LeftHand.quaternion', () => {
    expect(isRightArmTrack('LeftHand.quaternion')).toBe(false)
  })

  it('returns false for RightUpLeg (leg, not arm)', () => {
    // "RightUpLeg" does not contain any right-arm pattern
    expect(isRightArmTrack('mixamorig:RightUpLeg.quaternion')).toBe(false)
  })

  it('handles tracks with no dot separator (full name is bone name)', () => {
    // Malformed track — boneName = full string, should still work
    expect(isRightArmTrack('RightArm')).toBe(true)
    expect(isRightArmTrack('LeftArm')).toBe(false)
  })
})

// ── filterRightArmTracks ──────────────────────────────────────────────────────

describe('filterRightArmTracks', () => {
  const makeTracks = (names) => names.map(name => ({ name }))

  it('removes all right-arm tracks', () => {
    const tracks = makeTracks([
      'mixamorig:Hips.position',
      'mixamorig:RightArm.quaternion',
      'mixamorig:RightForeArm.quaternion',
      'mixamorig:RightHand.quaternion',
      'mixamorig:Spine.quaternion',
    ])
    const filtered = filterRightArmTracks(tracks)
    const names = filtered.map(t => t.name)
    expect(names).toContain('mixamorig:Hips.position')
    expect(names).toContain('mixamorig:Spine.quaternion')
    expect(names).not.toContain('mixamorig:RightArm.quaternion')
    expect(names).not.toContain('mixamorig:RightForeArm.quaternion')
    expect(names).not.toContain('mixamorig:RightHand.quaternion')
  })

  it('preserves all non-right-arm tracks', () => {
    const tracks = makeTracks([
      'LeftArm.quaternion',
      'LeftForeArm.quaternion',
      'Hips.position',
      'Head.quaternion',
    ])
    expect(filterRightArmTracks(tracks)).toHaveLength(4)
  })

  it('returns empty array when all tracks are right-arm', () => {
    const tracks = makeTracks([
      'RightArm.quaternion',
      'RightForeArm.quaternion',
      'RightHand.quaternion',
    ])
    expect(filterRightArmTracks(tracks)).toHaveLength(0)
  })

  it('returns all tracks when none are right-arm', () => {
    const tracks = makeTracks(['Hips.position', 'Spine.quaternion'])
    expect(filterRightArmTracks(tracks)).toHaveLength(2)
  })

  it('handles an empty array', () => {
    expect(filterRightArmTracks([])).toEqual([])
  })

  it('does not mutate the original array', () => {
    const tracks = makeTracks(['RightArm.quaternion', 'Hips.position'])
    filterRightArmTracks(tracks)
    expect(tracks).toHaveLength(2)
  })

  it('removes finger tracks', () => {
    const tracks = makeTracks([
      'RightHandThumb1.quaternion',
      'RightHandIndex2.quaternion',
      'RightHandPinky3.quaternion',
      'LeftHandIndex1.quaternion',
    ])
    const filtered = filterRightArmTracks(tracks)
    expect(filtered.map(t => t.name)).toEqual(['LeftHandIndex1.quaternion'])
  })
})

// ── computeModelScale ─────────────────────────────────────────────────────────

describe('computeModelScale', () => {
  it('returns 1 for a model that is already the desired height', () => {
    expect(computeModelScale(1.8, 1.8)).toBeCloseTo(1.0)
  })

  it('scales up a small model', () => {
    expect(computeModelScale(0.9, 1.8)).toBeCloseTo(2.0)
  })

  it('scales down a large model', () => {
    expect(computeModelScale(3.6, 1.8)).toBeCloseTo(0.5)
  })

  it('uses 1.8 as the default desired height', () => {
    expect(computeModelScale(1.8)).toBeCloseTo(1.0)
    expect(computeModelScale(0.6)).toBeCloseTo(3.0)
  })

  it('returns 1 when bounding box height is zero (guard)', () => {
    expect(computeModelScale(0, 1.8)).toBe(1)
  })

  it('works with non-standard target heights', () => {
    expect(computeModelScale(2.0, 1.0)).toBeCloseTo(0.5)
    expect(computeModelScale(0.5, 2.5)).toBeCloseTo(5.0)
  })
})

// ── computeGroundOffset ───────────────────────────────────────────────────────

describe('computeGroundOffset', () => {
  it('returns negative of boxMinY to place feet at y=0', () => {
    expect(computeGroundOffset(0)).toBeCloseTo(0)
    expect(computeGroundOffset(-0.05)).toBeCloseTo(0.05)
    expect(computeGroundOffset(0.1)).toBeCloseTo(-0.1)
  })

  it('handles zero min (feet already on ground)', () => {
    expect(computeGroundOffset(0)).toBeCloseTo(0)
  })

  it('handles negative min (model below ground)', () => {
    expect(computeGroundOffset(-0.3)).toBeCloseTo(0.3)
  })
})

// ── computeCenterOffsetX ──────────────────────────────────────────────────────

describe('computeCenterOffsetX', () => {
  it('returns zero when model is already centered', () => {
    expect(computeCenterOffsetX(0)).toBeCloseTo(0)
  })

  it('returns negative offset to shift model left', () => {
    expect(computeCenterOffsetX(0.15)).toBeCloseTo(-0.15)
  })

  it('returns positive offset when model center is left of origin', () => {
    expect(computeCenterOffsetX(-0.1)).toBeCloseTo(0.1)
  })
})

// ── computeDragRotation ───────────────────────────────────────────────────────

describe('computeDragRotation', () => {
  it('no change when dx is zero', () => {
    expect(computeDragRotation(0, 0, 1000)).toBeCloseTo(0)
    expect(computeDragRotation(1.5, 0, 1000)).toBeCloseTo(1.5)
  })

  it('full-width drag produces one full turn (2π)', () => {
    expect(computeDragRotation(0, 1000, 1000)).toBeCloseTo(Math.PI * 2)
  })

  it('half-width drag produces half turn (π)', () => {
    expect(computeDragRotation(0, 500, 1000)).toBeCloseTo(Math.PI)
  })

  it('negative drag rotates in reverse', () => {
    expect(computeDragRotation(0, -500, 1000)).toBeCloseTo(-Math.PI)
  })

  it('adds to existing start rotation', () => {
    const start = Math.PI / 2
    expect(computeDragRotation(start, 1000, 1000)).toBeCloseTo(start + Math.PI * 2)
  })

  it('smaller canvas width produces more rotation per pixel', () => {
    const wide  = computeDragRotation(0, 100, 1000)
    const narrow = computeDragRotation(0, 100, 500)
    expect(narrow).toBeCloseTo(wide * 2)
  })
})

// ── computeDragPan ────────────────────────────────────────────────────────────

describe('computeDragPan', () => {
  it('no change when dx is zero', () => {
    expect(computeDragPan(0, 0, 1000)).toBeCloseTo(0)
    expect(computeDragPan(0.5, 0, 1000)).toBeCloseTo(0.5)
  })

  it('full-width drag produces 3 world units of movement', () => {
    expect(computeDragPan(0, 1000, 1000)).toBeCloseTo(3)
  })

  it('half-width drag produces 1.5 world units', () => {
    expect(computeDragPan(0, 500, 1000)).toBeCloseTo(1.5)
  })

  it('negative drag moves in the opposite direction', () => {
    expect(computeDragPan(0, -1000, 1000)).toBeCloseTo(-3)
  })

  it('adds to existing start offset', () => {
    expect(computeDragPan(1.0, 1000, 1000)).toBeCloseTo(4.0)
  })
})

// ── clampPixelRatio ───────────────────────────────────────────────────────────

describe('clampPixelRatio', () => {
  it('passes through values at or below the default max of 2', () => {
    expect(clampPixelRatio(1)).toBe(1)
    expect(clampPixelRatio(2)).toBe(2)
  })

  it('clamps values above 2 to 2 (default max)', () => {
    expect(clampPixelRatio(3)).toBe(2)
    expect(clampPixelRatio(4)).toBe(2)
  })

  it('respects a custom max', () => {
    expect(clampPixelRatio(3, 3)).toBe(3)
    expect(clampPixelRatio(4, 3)).toBe(3)
    expect(clampPixelRatio(1, 3)).toBe(1)
  })

  it('handles max of 1 (forces all ratios to 1)', () => {
    expect(clampPixelRatio(2, 1)).toBe(1)
    expect(clampPixelRatio(0.5, 1)).toBe(0.5)
  })
})
