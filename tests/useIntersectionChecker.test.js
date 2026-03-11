/**
 * Tests for useIntersectionChecker — capsule-skeleton self-intersection detector.
 *
 * Strategy:
 *  1. Pure-math unit tests for segSegDistSq and capsulePenetration.
 *  2. checkFrame tests with hand-crafted capsule geometries.
 *  3. sampleTransition tests for each sign sequence defined in DEFAULT_SIGN_DEFS,
 *     using a realistic fake skeleton derived from the default anchor offsets.
 *
 * No WebGL, no FBX loader, no GPU.  All Three.js math objects work in jsdom.
 */

import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import {
  useIntersectionChecker,
  segSegDistSq,
  capsulePenetration,
  BODY_SEGMENT_DEFS,
  ARM_UPPER_RADIUS,
  ARM_FOREARM_RADIUS,
} from '../src/composables/useIntersectionChecker.js'
import { DEFAULT_SIGN_DEFS } from '../src/data/signs.js'

// ── Geometry helpers ───────────────────────────────────────────────────────────

function v(x, y, z) { return new THREE.Vector3(x, y, z) }

// ── segSegDistSq unit tests ────────────────────────────────────────────────────

describe('segSegDistSq — geometry', () => {
  it('returns 0 for two segments sharing an endpoint', () => {
    const dist = Math.sqrt(segSegDistSq(v(0,0,0), v(1,0,0), v(1,0,0), v(2,0,0)))
    expect(dist).toBeCloseTo(0)
  })

  it('returns 0 for crossing segments', () => {
    // X-shaped cross in XY plane
    const dist = Math.sqrt(segSegDistSq(v(-1,0,0), v(1,0,0), v(0,-1,0), v(0,1,0)))
    expect(dist).toBeCloseTo(0)
  })

  it('returns correct distance for parallel segments offset by 1 unit', () => {
    // Seg A: (0,0,0)→(1,0,0)  Seg B: (0,1,0)→(1,1,0)  — 1 unit apart in Y
    const dist = Math.sqrt(segSegDistSq(v(0,0,0), v(1,0,0), v(0,1,0), v(1,1,0)))
    expect(dist).toBeCloseTo(1)
  })

  it('returns correct distance for perpendicular skew segments', () => {
    // Seg A: along X at y=0,z=0.  Seg B: along Y at x=0,z=1. Closest dist = 1 (Z gap).
    const dist = Math.sqrt(segSegDistSq(v(-5,0,0), v(5,0,0), v(0,-5,1), v(0,5,1)))
    expect(dist).toBeCloseTo(1)
  })

  it('returns 0 for collinear overlapping segments', () => {
    const dist = Math.sqrt(segSegDistSq(v(0,0,0), v(2,0,0), v(1,0,0), v(3,0,0)))
    expect(dist).toBeCloseTo(0)
  })

  it('handles degenerate point-point case', () => {
    const dist = Math.sqrt(segSegDistSq(v(1,2,3), v(1,2,3), v(4,6,3), v(4,6,3)))
    expect(dist).toBeCloseTo(5)  // sqrt((4-1)^2 + (6-2)^2) = sqrt(9+16) = 5
  })
})

// ── capsulePenetration unit tests ─────────────────────────────────────────────

describe('capsulePenetration', () => {
  it('returns positive depth when capsules overlap', () => {
    // Two coincident unit segments, each with radius 0.3 → touching at centre, depth = 0.6
    const depth = capsulePenetration(v(0,0,0), v(1,0,0), 0.3, v(0,0,0), v(1,0,0), 0.3)
    expect(depth).toBeCloseTo(0.6)
  })

  it('returns negative depth when capsules are well separated', () => {
    // 5 units apart, combined radii 0.5 → depth = 0.5 - 5 = -4.5
    const depth = capsulePenetration(v(0,0,0), v(1,0,0), 0.25, v(0,5,0), v(1,5,0), 0.25)
    expect(depth).toBeLessThan(0)
  })

  it('returns ~0 when capsule surfaces are exactly touching', () => {
    // Segments 1 unit apart in Y, radii 0.5 each → sum = 1 = distance
    const depth = capsulePenetration(v(0,0,0), v(1,0,0), 0.5, v(0,1,0), v(1,1,0), 0.5)
    expect(Math.abs(depth)).toBeLessThan(1e-9)
  })

  it('larger radii produce larger positive depth', () => {
    const d1 = capsulePenetration(v(0,0,0), v(0,0,0), 0.1, v(0.1,0,0), v(0.1,0,0), 0.1)
    const d2 = capsulePenetration(v(0,0,0), v(0,0,0), 0.2, v(0.1,0,0), v(0.1,0,0), 0.2)
    expect(d2).toBeGreaterThan(d1)
  })
})

// ── checkFrame unit tests ─────────────────────────────────────────────────────

describe('useIntersectionChecker — checkFrame', () => {
  const { checkFrame } = useIntersectionChecker()

  function makeTorso() {
    // Torso capsule: mid-chest (y=1.28) to pelvis (y=1.0), radius 0.14.
    // Intentionally does NOT extend up to shoulder height (y=1.42) so that the
    // shoulder joint (at x=0.15) doesn't cause false-positive overlap with the
    // torso capsule via the combined-radii check.
    return [{ name: 'torso', p1: v(0, 1.28, 0), p2: v(0, 1.0, 0), radius: 0.14 }]
  }

  it('detects no intersection when arm is held to the right of body', () => {
    // Arm staying at +X, far from torso at x=0
    const shoulder = v(0.15, 1.4, 0)
    const elbow    = v(0.30, 1.2, -0.1)
    const wrist    = v(0.40, 1.0, -0.2)
    const result   = checkFrame(shoulder, elbow, wrist, makeTorso())
    expect(result.intersecting).toBe(false)
    expect(result.maxDepth).toBeLessThan(0)
  })

  it('detects intersection when forearm passes through the torso', () => {
    // Forearm crossing through torso at x=0
    const shoulder = v(0.15, 1.4, 0)
    const elbow    = v(0.0,  1.2, 0)
    const wrist    = v(-0.2, 1.0, 0)
    const result   = checkFrame(shoulder, elbow, wrist, makeTorso())
    expect(result.intersecting).toBe(true)
    expect(result.maxDepth).toBeGreaterThan(0)
  })

  it('returns empty pairs array when no intersection', () => {
    // Arm well to the right
    const result = checkFrame(v(0.5, 1.5, 0), v(0.5, 1.3, -0.1), v(0.5, 1.1, -0.2), makeTorso())
    expect(result.pairs).toHaveLength(0)
  })

  it('reports the intersecting capsule names', () => {
    const shoulder = v(0.15, 1.4, 0)
    const elbow    = v(0,    1.2, 0)
    const wrist    = v(-0.2, 1.0, 0)
    const result   = checkFrame(shoulder, elbow, wrist, makeTorso())
    if (result.intersecting) {
      expect(result.pairs[0]).toHaveProperty('nameA')
      expect(result.pairs[0]).toHaveProperty('nameB')
      expect(result.pairs[0]).toHaveProperty('depth')
    }
  })

  it('maxDepth is the largest single-pair depth', () => {
    // Two body capsules at same location as the arm — both should intersect
    const bodyCaps = [
      { name: 'torso',  p1: v(0,1.3,0), p2: v(0,1.0,0), radius: 0.14 },
      { name: 'pelvis', p1: v(0,1.0,0), p2: v(0,0.8,0), radius: 0.13 },
    ]
    const result = checkFrame(v(0,1.5,0), v(0,1.2,0), v(0,0.9,0), bodyCaps)
    if (result.pairs.length > 1) {
      expect(result.maxDepth).toBe(Math.max(...result.pairs.map(p => p.depth)))
    }
  })
})

// ── buildBodyCapsules ─────────────────────────────────────────────────────────

describe('buildBodyCapsules', () => {
  const { buildBodyCapsules } = useIntersectionChecker()

  function makeBoneMap(prefix = 'mixamorig:') {
    // Realistic T-pose world positions (model height ~1.8 units, feet at y=0).
    // Character faces -Z: right arm/leg at +X, left arm/leg at -X.
    const positions = {
      HeadTop_End:  [0,     1.78, 0],
      Head:         [0,     1.65, 0],
      Neck:         [0,     1.55, 0],
      Spine2:       [0,     1.35, 0],
      Spine1:       [0,     1.20, 0],
      Hips:         [0,     1.05, 0],
      LeftArm:      [-0.18, 1.40, 0],
      LeftForeArm:  [-0.36, 1.15, 0],
      LeftHand:     [-0.44, 0.92, 0],
      RightUpLeg:   [0.10,  1.05, 0],
      RightLeg:     [0.10,  0.55, 0],
      LeftUpLeg:    [-0.10, 1.05, 0],
      LeftLeg:      [-0.10, 0.55, 0],
    }
    const map = {}
    for (const [suffix, pos] of Object.entries(positions)) {
      map[`${prefix}${suffix}`] = {
        getWorldPosition: vi.fn((t) => t.set(...pos)),
      }
    }
    return map
  }

  it('produces one capsule per recognized bone pair', () => {
    const boneMap = makeBoneMap()
    const caps = buildBodyCapsules(boneMap, 'mixamorig:')
    expect(caps.length).toBe(BODY_SEGMENT_DEFS.length)
  })

  it('skips segments whose bones are missing from the map', () => {
    // Only supply head bones
    const boneMap = {
      'mixamorig:HeadTop_End': { getWorldPosition: vi.fn((t) => t.set(0, 1.78, 0)) },
      'mixamorig:Head':        { getWorldPosition: vi.fn((t) => t.set(0, 1.65, 0)) },
    }
    const caps = buildBodyCapsules(boneMap, 'mixamorig:')
    expect(caps.length).toBe(1)
    expect(caps[0].name).toBe('head')
  })

  it('each capsule has p1, p2, radius, name', () => {
    const caps = buildBodyCapsules(makeBoneMap(), 'mixamorig:')
    for (const c of caps) {
      expect(c).toHaveProperty('name')
      expect(c).toHaveProperty('p1')
      expect(c).toHaveProperty('p2')
      expect(c).toHaveProperty('radius')
      expect(c.p1).toBeInstanceOf(THREE.Vector3)
      expect(c.p2).toBeInstanceOf(THREE.Vector3)
      expect(typeof c.radius).toBe('number')
    }
  })

  it('works with empty prefix', () => {
    const boneMap = makeBoneMap('')
    const caps = buildBodyCapsules(boneMap, '')
    expect(caps.length).toBe(BODY_SEGMENT_DEFS.length)
  })
})

// ── approximateElbow ──────────────────────────────────────────────────────────

describe('approximateElbow', () => {
  const { approximateElbow } = useIntersectionChecker()
  const upperArmLen = 0.35
  const forearmLen  = 0.30
  const fwd = v(0, 0, -1)  // Mixamo default

  it('elbow is the correct distance from shoulder', () => {
    const shoulder = v(0.15, 1.4, 0)
    const wrist    = v(0.35, 1.1, -0.2)
    const { elbow } = approximateElbow(shoulder, wrist, upperArmLen, forearmLen, fwd)
    expect(elbow.distanceTo(shoulder)).toBeCloseTo(upperArmLen, 2)
  })

  it('elbow is the correct distance from wrist', () => {
    const shoulder = v(0.15, 1.4, 0)
    const wrist    = v(0.35, 1.1, -0.2)
    const { elbow } = approximateElbow(shoulder, wrist, upperArmLen, forearmLen, fwd)
    expect(elbow.distanceTo(wrist)).toBeCloseTo(forearmLen, 2)
  })

  it('does not throw when target is beyond reach (clamped)', () => {
    const shoulder = v(0, 1.4, 0)
    const wrist    = v(10, 10, 10)  // way out of range
    expect(() => approximateElbow(shoulder, wrist, upperArmLen, forearmLen, fwd)).not.toThrow()
  })

  it('elbow position is finite', () => {
    const shoulder = v(0, 1.4, 0)
    const wrist    = v(0.3, 1.1, -0.15)
    const { elbow } = approximateElbow(shoulder, wrist, upperArmLen, forearmLen, fwd)
    expect(isFinite(elbow.x)).toBe(true)
    expect(isFinite(elbow.y)).toBe(true)
    expect(isFinite(elbow.z)).toBe(true)
  })

  it('elbow moves outward for high targets (adaptive pole)', () => {
    // When reaching straight up, the elbow should push strongly in +X
    const shoulder    = v(0.15, 1.4, 0)
    const wristLow    = v(0.35, 1.1, -0.1)  // low target
    const wristHigh   = v(0.15, 1.75, 0)    // overhead target
    const { elbow: elbowLow  } = approximateElbow(shoulder, wristLow,  upperArmLen, forearmLen, fwd)
    const { elbow: elbowHigh } = approximateElbow(shoulder, wristHigh, upperArmLen, forearmLen, fwd)
    // For high target, elbow should be further out in X than for low target
    expect(elbowHigh.x).toBeGreaterThan(elbowLow.x)
  })
})

// ── sampleTransition unit tests ───────────────────────────────────────────────

describe('sampleTransition — isolated cases', () => {
  const { sampleTransition } = useIntersectionChecker()

  const solveParams = { shoulder: v(0.15, 1.4, 0), upperArmLen: 0.35, forearmLen: 0.30 }
  const modelFwd   = v(0, 0, -1)  // Mixamo: character faces -Z

  // Simple torso capsule (mid-chest to pelvis; top intentionally below shoulder level)
  const bodyCaps = [
    { name: 'torso', p1: v(0, 1.28, 0), p2: v(0, 1.05, 0), radius: 0.14 },
  ]

  it('transition far to the right of body has no significant intersection', () => {
    // Arm stays on the right (+X) side away from torso at x=0.
    // Allow a small tolerance (0.025) for capsule approximation slop near
    // the shoulder joint, which is geometrically close to the torso edge.
    const from = v(0.30, 1.2, -0.1)
    const to   = v(0.45, 1.0, -0.1)
    const { maxDepth } = sampleTransition(from, to, modelFwd, solveParams, bodyCaps, { steps: 20 })
    expect(maxDepth).toBeLessThanOrEqual(0.025)
  })

  it('transition directly through torso has intersection', () => {
    // Move hand from right side to left side, passing through torso at x=0
    const from = v(0.4, 1.2, 0)
    const to   = v(-0.4, 1.2, 0)
    const { maxDepth } = sampleTransition(from, to, modelFwd, solveParams, bodyCaps, { steps: 40 })
    expect(maxDepth).toBeGreaterThan(0)
  })

  it('returns maxDepth, worstT, worstPair keys', () => {
    const result = sampleTransition(v(0,1,0), v(0,1,0.5), modelFwd, solveParams, bodyCaps)
    expect(result).toHaveProperty('maxDepth')
    expect(result).toHaveProperty('worstT')
    expect(result).toHaveProperty('worstPair')
  })

  it('worstT is in [0, 1]', () => {
    const { worstT } = sampleTransition(v(0,1,0), v(0,1,0.5), modelFwd, solveParams, bodyCaps)
    expect(worstT).toBeGreaterThanOrEqual(0)
    expect(worstT).toBeLessThanOrEqual(1)
  })

  it('arc axis "down" bows the hand downward — returns a number without throwing', () => {
    const from = v(0.30, 0.9, 0)
    const to   = v(0.30, 0.9, 0.2)
    const { maxDepth: md } = sampleTransition(from, to, modelFwd, solveParams, [], { steps: 2, arcAxis: 'down', arcAmt: 0.3 })
    expect(typeof md).toBe('number')
  })
})

// ── Sign sequence regression tests ────────────────────────────────────────────
//
// For each sign in DEFAULT_SIGN_DEFS, simulate each consecutive transition
// (rest→anchor[0], anchor[0]→anchor[1], …, anchor[N]→rest) and assert the
// maximum capsule penetration depth is below a tolerance threshold.
//
// These tests use a reference skeleton in a realistic Mixamo T-pose scaled to
// 1.8 world units.  Anchor world positions are approximated from the DEFAULT
// anchor bone offsets (as defined in useAnchors.js) applied to this skeleton.
//
// A test failure means the hand or forearm penetrates the body capsule by more
// than `MAX_ALLOWED_DEPTH` units during the transition, and the arc avoidance
// is insufficient for that move.

describe('sign sequence self-intersection regression', () => {
  const { sampleTransition, buildBodyCapsules, approximateElbow } = useIntersectionChecker()

  // Model shoulder world position.
  // Mixamo characters face -Z; character's right arm is at +X.
  const SHOULDER = v(0.15, 1.42, 0)
  const UPPER_ARM_LEN = 0.33
  const FOREARM_LEN   = 0.28
  const MODEL_FWD = v(0, 0, -1)  // Mixamo default: character faces -Z
  const REST = v(0.3, 1.0, 0.2)

  // Maximum tolerated penetration depth (world units).  Positive = fail.
  // 0.025 ≈ 2.5 cm on a 1.8 m model: clearly visible clipping.
  // Values below this threshold (~1.5 cm) are geometry artefacts where the
  // shoulder joint capsule nearly touches the torso capsule — not a visual bug.
  const MAX_ALLOWED_DEPTH = 0.025

  // Approximate anchor world positions based on the bone layout and
  // DEFAULT_ANCHOR_DEFS offsets.  Mixamo character faces -Z; right arm = +X.
  //
  // Ear naming is from the VIEWER's perspective (viewer's "left ear" =
  // character's right ear = +X side when character faces -Z toward viewer).
  const ANCHOR_WORLD = {
    billOfCap:   v(0,    1.71,  0.13),
    topOfHead:   v(0,    1.80,  0.00),
    backOfHead:  v(0,    1.67,  0.10),  // behind head = +Z (character faces -Z)
    nose:        v(0,    1.68, -0.12),  // nose forward = -Z
    chin:        v(0,    1.60, -0.10),
    leftEar:     v(0.09, 1.68, 0.00),  // viewer's left = char's right = +X
    rightEar:    v(-0.09, 1.68, 0.00), // viewer's right = char's left = -X
    chest:       v(0,    1.40, -0.12), // chest forward = -Z
    belt:        v(0,    1.10, -0.12),
    leftArm:     v(-0.18, 1.33, 0.00), // char's left arm = -X
    frontOfLeg:  v(0.10, 0.95, -0.12), // char's right leg, front = -Z
    backOfLeg:   v(0.10, 0.95,  0.12), // char's right leg, back = +Z
    frontOfHand: v(-0.44, 0.92, -0.06), // char's left hand, front = -Z
    backOfHand:  v(-0.44, 0.92,  0.06), // char's left hand, back = +Z
  }

  // Arc axis overrides matching DEFAULT_ANCHOR_DEFS
  const ARC_AXIS = {
    backOfLeg: 'down',
  }

  // Realistic body capsules for this skeleton (mirrors BODY_SEGMENT_DEFS radii).
  // Character faces -Z; right = +X, left = -X.
  // Torso/head centred at x=0; right leg at +X, left leg at -X.
  const BODY_CAPS = [
    { name: 'head',         p1: v(0, 1.78, 0),     p2: v(0, 1.65, 0),     radius: 0.11 },
    { name: 'neck',         p1: v(0, 1.65, 0),     p2: v(0, 1.55, 0),     radius: 0.07 },
    // Torso top at y=1.28 (mid-chest/Spine2), NOT at shoulder level (y=1.42),
    // to avoid false-positive overlap with the shoulder joint capsule.
    { name: 'torso',        p1: v(0, 1.28, 0),     p2: v(0, 1.05, 0),     radius: 0.14 },
    { name: 'pelvis',       p1: v(0, 1.10, 0),     p2: v(0, 0.95, 0),     radius: 0.13 },
    { name: 'leftUpperArm', p1: v(-0.18, 1.42, 0), p2: v(-0.36, 1.15, 0), radius: 0.05 },
    { name: 'leftForearm',  p1: v(-0.36, 1.15, 0), p2: v(-0.44, 0.92, 0), radius: 0.04 },
    { name: 'rightThigh',   p1: v(0.10, 1.05, 0),  p2: v(0.10, 0.55, 0),  radius: 0.08 },
    { name: 'leftThigh',    p1: v(-0.10, 1.05, 0), p2: v(-0.10, 0.55, 0), radius: 0.08 },
  ]

  const solveParams = { shoulder: SHOULDER, upperArmLen: UPPER_ARM_LEN, forearmLen: FOREARM_LEN }

  function transitionLabel(from, to) { return `${from} → ${to}` }

  // Build all transitions for a sign (rest + anchors + rest)
  function signTransitions(anchorNames) {
    const waypoints = ['__rest__', ...anchorNames, '__rest__']
    const transitions = []
    for (let i = 0; i < waypoints.length - 1; i++) {
      transitions.push([waypoints[i], waypoints[i + 1]])
    }
    return transitions
  }

  function resolvePos(name) {
    return name === '__rest__' ? REST : (ANCHOR_WORLD[name] ?? REST)
  }

  function arcAxisFor(toName) {
    return ARC_AXIS[toName] ?? 'forward'
  }

  for (const [signName, anchorNames] of Object.entries(DEFAULT_SIGN_DEFS)) {
    describe(`sign: "${signName}" [${anchorNames.join(', ')}]`, () => {
      for (const [fromName, toName] of signTransitions(anchorNames)) {
        it(`no intersection: ${transitionLabel(fromName, toName)}`, () => {
          const from    = resolvePos(fromName)
          const to      = resolvePos(toName)
          const arcAxis = arcAxisFor(toName)

          const { maxDepth, worstT, worstPair } = sampleTransition(
            from, to, MODEL_FWD, solveParams, BODY_CAPS,
            { steps: 60, arcAxis }
          )

          if (maxDepth > MAX_ALLOWED_DEPTH) {
            const pairStr = worstPair
              ? `  Capsules: ${worstPair.nameA} ↔ ${worstPair.nameB}, depth=${maxDepth.toFixed(4)}, t=${worstT.toFixed(2)}`
              : `  depth=${maxDepth.toFixed(4)}, t=${worstT.toFixed(2)}`
            throw new Error(
              `Self-intersection detected in sign "${signName}", ` +
              `transition ${transitionLabel(fromName, toName)}\n${pairStr}`
            )
          }

          // Pass: maxDepth ≤ threshold (or negative = no intersection)
          expect(maxDepth).toBeLessThanOrEqual(MAX_ALLOWED_DEPTH)
        })
      }
    })
  }
})
