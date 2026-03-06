import { describe, it, expect } from 'vitest'
import { detectBonePrefix, resolveBoneName } from '../src/composables/boneUtils.js'

describe('detectBonePrefix', () => {
  it('detects "mixamorig:" prefix (colon variant)', () => {
    const boneMap = {
      'mixamorig:Hips': {},
      'mixamorig:Spine': {},
      'mixamorig:Head': {},
    }
    expect(detectBonePrefix(boneMap)).toBe('mixamorig:')
  })

  it('detects "mixamorig" prefix (no colon)', () => {
    const boneMap = {
      'mixamorigHips': {},
      'mixamorigSpine': {},
    }
    expect(detectBonePrefix(boneMap)).toBe('mixamorig')
  })

  it('detects "mixamorig9" prefix', () => {
    const boneMap = {
      'mixamorig9Hips': {},
      'mixamorig9Head': {},
    }
    expect(detectBonePrefix(boneMap)).toBe('mixamorig9')
  })

  it('falls back to Hips detection when Head is not present', () => {
    const boneMap = {
      'pfxHips': {},
      'pfxSpine': {},
    }
    expect(detectBonePrefix(boneMap)).toBe('pfx')
  })

  it('falls back to Head detection when Hips is not present', () => {
    const boneMap = {
      'myRigHead': {},
      'myRigSpine': {},
    }
    expect(detectBonePrefix(boneMap)).toBe('myRig')
  })

  it('returns "mixamorig" fallback when neither Hips nor Head is found', () => {
    const boneMap = {
      'SomeRandomBone': {},
      'AnotherBone': {},
    }
    expect(detectBonePrefix(boneMap)).toBe('mixamorig')
  })

  it('handles empty bone map with fallback', () => {
    expect(detectBonePrefix({})).toBe('mixamorig')
  })

  it('prefers Hips over Head when both are present', () => {
    const boneMap = {
      'prefixHips': {},
      'differentHead': {},
    }
    // Hips is found first, so prefix comes from Hips
    expect(detectBonePrefix(boneMap)).toBe('prefix')
  })

  it('handles empty string prefix (bone named exactly "Hips")', () => {
    const boneMap = { 'Hips': {}, 'Spine': {} }
    expect(detectBonePrefix(boneMap)).toBe('')
  })
})

describe('resolveBoneName', () => {
  it('concatenates prefix and suffix', () => {
    expect(resolveBoneName('mixamorig:', 'Head')).toBe('mixamorig:Head')
  })

  it('works with empty prefix', () => {
    expect(resolveBoneName('', 'RightArm')).toBe('RightArm')
  })

  it('works with mixamorig9 prefix', () => {
    expect(resolveBoneName('mixamorig9', 'RightForeArm')).toBe('mixamorig9RightForeArm')
  })
})
