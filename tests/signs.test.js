import { describe, it, expect } from 'vitest'
import { DEFAULT_INDICATOR, DEFAULT_SIGN_DEFS } from '../src/data/signs.js'

describe('DEFAULT_INDICATOR', () => {
  it('is "billOfCap"', () => {
    expect(DEFAULT_INDICATOR).toBe('billOfCap')
  })
})

describe('DEFAULT_SIGN_DEFS', () => {
  it('is a non-empty object', () => {
    expect(typeof DEFAULT_SIGN_DEFS).toBe('object')
    expect(Object.keys(DEFAULT_SIGN_DEFS).length).toBeGreaterThan(0)
  })

  it('contains the 9 default signs', () => {
    const keys = Object.keys(DEFAULT_SIGN_DEFS)
    expect(keys).toContain('Hit & Run')
    expect(keys).toContain('Straight Steal')
    expect(keys).toContain('Delayed Steal')
    expect(keys).toContain('Sacrifice Bunt 1st Base')
    expect(keys).toContain('Bunt for Base Hit 1st Base')
    expect(keys).toContain('Sacrifice Bunt 3rd Base')
    expect(keys).toContain('Bunt for Base Hit 3rd Base')
    expect(keys).toContain('Squeeze Bunt')
    expect(keys).toContain('Take')
  })

  it('each sign value is a non-empty array of strings', () => {
    for (const [key, anchors] of Object.entries(DEFAULT_SIGN_DEFS)) {
      expect(Array.isArray(anchors), `${key} should be an array`).toBe(true)
      expect(anchors.length, `${key} should have at least one anchor`).toBeGreaterThan(0)
      anchors.forEach(a => expect(typeof a).toBe('string'))
    }
  })

  it('single-anchor signs use one anchor', () => {
    expect(DEFAULT_SIGN_DEFS['Hit & Run']).toEqual(['leftArm'])
    expect(DEFAULT_SIGN_DEFS['Straight Steal']).toEqual(['frontOfLeg'])
    expect(DEFAULT_SIGN_DEFS['Delayed Steal']).toEqual(['backOfLeg'])
    expect(DEFAULT_SIGN_DEFS['Squeeze Bunt']).toEqual(['chin'])
    expect(DEFAULT_SIGN_DEFS['Take']).toEqual(['frontOfHand'])
  })

  it('bunt signs use two anchors', () => {
    expect(DEFAULT_SIGN_DEFS['Sacrifice Bunt 1st Base']).toHaveLength(2)
    expect(DEFAULT_SIGN_DEFS['Sacrifice Bunt 1st Base']).toEqual(['nose', 'leftEar'])
    expect(DEFAULT_SIGN_DEFS['Bunt for Base Hit 1st Base']).toEqual(['topOfHead', 'leftEar'])
    expect(DEFAULT_SIGN_DEFS['Sacrifice Bunt 3rd Base']).toEqual(['nose', 'rightEar'])
    expect(DEFAULT_SIGN_DEFS['Bunt for Base Hit 3rd Base']).toEqual(['topOfHead', 'rightEar'])
  })

  it('all anchors referenced in signs are known anchor names', () => {
    const knownAnchors = new Set([
      'billOfCap', 'topOfHead', 'backOfHead', 'nose', 'chin',
      'leftEar', 'rightEar', 'chest', 'belt', 'leftArm', 'rightArm',
      'frontOfLeg', 'backOfLeg', 'frontOfHand', 'backOfHand',
    ])
    for (const [sign, anchors] of Object.entries(DEFAULT_SIGN_DEFS)) {
      anchors.forEach(a => {
        expect(knownAnchors.has(a), `${sign} uses unknown anchor "${a}"`).toBe(true)
      })
    }
  })
})
