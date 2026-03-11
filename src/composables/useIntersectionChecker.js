/**
 * useIntersectionChecker — capsule-skeleton self-intersection detector.
 *
 * Approximates the character body as a set of capsules (line segment + radius)
 * and checks whether the animated right arm (upper arm + forearm) penetrates
 * any of them.
 *
 * Why capsules?
 *   Capsule-capsule intersection is a closed-form computation:
 *     penetrationDepth = (r1 + r2) − closestDistBetweenSegments
 *   Positive depth → intersection.  No mesh, no GPU, no BVH library required,
 *   so it works in Vitest/jsdom tests without a WebGL context.
 *
 * Body segment radii are sized conservatively (slightly generous) so the
 * detector errs on the side of flagging near-misses rather than missing
 * real clipping.  Tune BODY_CAPSULES radii if false positives appear.
 *
 * Usage:
 *   const checker = useIntersectionChecker()
 *   const result  = checker.checkFrame(shoulder, elbow, wrist, bodyCapsules)
 *   // result: { intersecting: bool, pairs: [{nameA, nameB, depth}], maxDepth }
 *
 *   const report  = checker.sampleSequence(anchorNames, getAnchorWorldPos, solveIK, steps)
 *   // report: { maxDepth, worstStep, worstPair, samples }
 */

import * as THREE from 'three'

// ── Segment-segment closest distance (squared) ────────────────────────────────

/**
 * Returns the squared closest distance between segments [p→q] and [r→s].
 * Uses the Ericson "Real-Time Collision Detection" segment-segment algorithm.
 */
export function segSegDistSq(p, q, r, s) {
  const d1 = new THREE.Vector3().subVectors(q, p)  // q - p
  const d2 = new THREE.Vector3().subVectors(s, r)  // s - r
  const r0 = new THREE.Vector3().subVectors(p, r)  // p - r

  const a = d1.dot(d1)  // sq len of seg1
  const e = d2.dot(d2)  // sq len of seg2
  const f = d2.dot(r0)

  const EPSILON = 1e-10
  let s1, t

  if (a <= EPSILON && e <= EPSILON) {
    // Both degenerate (points)
    return r0.dot(r0)
  }

  if (a <= EPSILON) {
    // Seg1 is a point
    s1 = 0
    t  = Math.max(0, Math.min(1, f / e))
  } else {
    const c = d1.dot(r0)
    if (e <= EPSILON) {
      // Seg2 is a point
      t  = 0
      s1 = Math.max(0, Math.min(1, -c / a))
    } else {
      // General case
      const b    = d1.dot(d2)
      const denom = a * e - b * b

      s1 = denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0

      t = (b * s1 + f) / e
      if (t < 0) {
        t  = 0
        s1 = Math.max(0, Math.min(1, -c / a))
      } else if (t > 1) {
        t  = 1
        s1 = Math.max(0, Math.min(1, (b - c) / a))
      }
    }
  }

  // Closest points
  const cp1 = new THREE.Vector3().copy(p).addScaledVector(d1, s1)
  const cp2 = new THREE.Vector3().copy(r).addScaledVector(d2, t)
  return cp1.distanceToSquared(cp2)
}

/**
 * Penetration depth of two capsules.
 * Positive → they overlap (depth = how far they interpenetrate).
 * Negative → they are separate (depth = gap distance).
 */
export function capsulePenetration(a1, a2, rA, b1, b2, rB) {
  const distSq  = segSegDistSq(a1, a2, b1, b2)
  const dist    = Math.sqrt(distSq)
  return (rA + rB) - dist
}

// ── Body capsule definitions ──────────────────────────────────────────────────

/**
 * Canonical body capsule radii (world units, model normalised to 1.8 m).
 * Bone names use Mixamo prefix-stripped suffixes; the caller supplies world
 * positions keyed by full bone name or by segment label.
 *
 * For each segment we store the two endpoint bone-suffix names plus a radius.
 * Callers resolve actual world Vector3 positions via getBoneWorldPos(suffix).
 */
export const BODY_SEGMENT_DEFS = [
  { name: 'head',         boneA: 'HeadTop_End', boneB: 'Head',      radius: 0.11 },
  { name: 'neck',         boneA: 'Head',        boneB: 'Neck',      radius: 0.07 },
  { name: 'torso',        boneA: 'Spine2',      boneB: 'Spine1',    radius: 0.14 },
  { name: 'pelvis',       boneA: 'Spine1',      boneB: 'Hips',      radius: 0.13 },
  { name: 'leftUpperArm', boneA: 'LeftArm',     boneB: 'LeftForeArm', radius: 0.05 },
  { name: 'leftForearm',  boneA: 'LeftForeArm', boneB: 'LeftHand',  radius: 0.04 },
  { name: 'rightThigh',   boneA: 'RightUpLeg',  boneB: 'RightLeg',  radius: 0.08 },
  { name: 'leftThigh',    boneA: 'LeftUpLeg',   boneB: 'LeftLeg',   radius: 0.08 },
]

// Right-arm capsule radii (the thing being checked against the body)
export const ARM_UPPER_RADIUS   = 0.05
export const ARM_FOREARM_RADIUS = 0.04

// ── Main composable ───────────────────────────────────────────────────────────

export function useIntersectionChecker() {

  /**
   * Check one frame for arm-body intersections.
   *
   * @param {THREE.Vector3} shoulder  World position of the right shoulder (RightArm bone)
   * @param {THREE.Vector3} elbow     World position of the right elbow   (RightForeArm bone)
   * @param {THREE.Vector3} wrist     World position of the right wrist   (IK target)
   * @param {Array}         bodyCaps  Array of { name, p1, p2, radius } — body capsules
   *                                  in world space (built from boneMap each call)
   * @returns {{ intersecting: boolean, pairs: Array, maxDepth: number }}
   */
  function checkFrame(shoulder, elbow, wrist, bodyCaps) {
    const pairs = []

    const armSegs = [
      { name: 'rightUpperArm', p1: shoulder, p2: elbow,  radius: ARM_UPPER_RADIUS },
      { name: 'rightForearm',  p1: elbow,    p2: wrist,  radius: ARM_FOREARM_RADIUS },
    ]

    for (const arm of armSegs) {
      for (const body of bodyCaps) {
        const depth = capsulePenetration(arm.p1, arm.p2, arm.radius, body.p1, body.p2, body.radius)
        if (depth > 0) {
          pairs.push({ nameA: arm.name, nameB: body.name, depth })
        }
      }
    }

    const maxDepth = pairs.length > 0 ? Math.max(...pairs.map(p => p.depth)) : -Infinity
    return { intersecting: pairs.length > 0, pairs, maxDepth }
  }

  /**
   * Build body capsules from a boneMap (keyed by full bone name with Mixamo prefix).
   *
   * @param {object}   boneMap   { [fullBoneName]: { getWorldPosition(v): v } }
   * @param {string}   prefix    e.g. 'mixamorig:', 'mixamorig', 'mixamorig9'
   * @returns {Array}  Array of { name, p1, p2, radius }
   */
  function buildBodyCapsules(boneMap, prefix = '') {
    const caps = []
    for (const def of BODY_SEGMENT_DEFS) {
      const bA = boneMap[`${prefix}${def.boneA}`]
      const bB = boneMap[`${prefix}${def.boneB}`]
      if (!bA || !bB) continue

      const p1 = new THREE.Vector3()
      const p2 = new THREE.Vector3()
      bA.getWorldPosition(p1)
      bB.getWorldPosition(p2)
      caps.push({ name: def.name, p1, p2, radius: def.radius })
    }
    return caps
  }

  /**
   * Sample an animation path between two anchor world positions at `steps`
   * evenly-spaced t values in [0,1], applying the same bell-curve forward arc
   * used by useSequencer, and return the worst intersection found.
   *
   * @param {THREE.Vector3} from        Start position (world)
   * @param {THREE.Vector3} to          End position   (world)
   * @param {THREE.Vector3} modelFwd    Model's forward direction (world)
   * @param {object}        solveParams { shoulder, upperArmLen, forearmLen }
   * @param {Array}         bodyCaps    Body capsules (world space)
   * @param {object}        opts        { steps, arcAxis, arcAmount }
   * @returns {{ maxDepth, worstT, worstPair }}
   */
  function sampleTransition(from, to, modelFwd, solveParams, bodyCaps, opts = {}) {
    const {
      steps           = 30,
      arcAxis         = 'forward',
      arcAmt          = null,   // if null, auto-computed from lateral distance
      excludeEndpoints = true,  // skip t=0 and t=1 (those are calibrated anchor positions)
    } = opts

    const { shoulder, upperArmLen, forearmLen } = solveParams

    // Replicate arcAmount() from useSequencer
    const dx   = to.x - from.x
    const dz   = to.z - from.z
    const arc  = arcAmt ?? Math.min(0.45, Math.sqrt(dx * dx + dz * dz) * 1.5)

    let maxDepth = -Infinity
    let worstT   = 0
    let worstPair = null

    // When excludeEndpoints is true, skip the first and last 10% of the tween.
    // This avoids false-positives from the arm being at (or extremely near) the
    // calibrated anchor position, where the hand is intentionally touching the body.
    const iStart = excludeEndpoints ? Math.max(1, Math.round(steps * 0.1)) : 0
    const iEnd   = excludeEndpoints ? Math.min(steps - 1, Math.round(steps * 0.9)) : steps

    for (let i = iStart; i <= iEnd; i++) {
      const t    = i / steps
      const bell = 4 * t * (1 - t)

      // Interpolate base position
      const wrist = new THREE.Vector3().lerpVectors(from, to, t)

      // Apply arc (mirrors makePositionUpdate in useSequencer)
      if (arcAxis === 'down') {
        wrist.y -= bell * arc
      } else {
        wrist.x += modelFwd.x * bell * arc
        wrist.z += modelFwd.z * bell * arc
      }

      // Approximate elbow with the adaptive two-bone solve
      const { elbow } = approximateElbow(shoulder, wrist, upperArmLen, forearmLen, modelFwd)

      const result = checkFrame(shoulder, elbow, wrist, bodyCaps)
      if (result.maxDepth > maxDepth) {
        maxDepth  = result.maxDepth
        worstT    = t
        // Report the deepest pair in this frame, not just the first one
        worstPair = result.pairs.length > 0
          ? result.pairs.reduce((best, p) => p.depth > best.depth ? p : best, result.pairs[0])
          : null
      }
    }

    return { maxDepth, worstT, worstPair }
  }

  /**
   * Two-bone elbow approximation using the same adaptive pole vector as
   * useIK.js solveTwoBoneIK(), so test samples closely match the real solver.
   *
   * Pole direction in MODEL-LOCAL space (assumed = world space for tests):
   *   out  direction scales from 0.35 (low targets) to 2.0 (straight-up targets)
   *   up   direction scales from -1.0 (low) to +0.6 (overhead)
   *   fwd  direction increases when reaching backward (-Z)
   *
   * @param {THREE.Vector3} modelFwd  Model forward direction (world). Pass
   *   THREE.Vector3(0,0,1) when the character faces +Z, or (0,0,-1) for -Z.
   *   Defaults to (0,0,-1) matching the standard Mixamo facing direction.
   */
  function approximateElbow(shoulder, wrist, upperArmLen, forearmLen, modelFwd) {
    const fwd = modelFwd ?? new THREE.Vector3(0, 0, -1)

    const toTarget = new THREE.Vector3().subVectors(wrist, shoulder)
    let dist = toTarget.length()

    const maxReach = (upperArmLen + forearmLen) * 0.9999
    const minReach = Math.abs(upperArmLen - forearmLen) * 1.001 + 0.005
    dist = Math.max(minReach, Math.min(maxReach, dist))

    const stDir = toTarget.clone().normalize()

    // Adaptive pole — mirrors useIK.js solveTwoBoneIK()
    const lift     = Math.max(0, stDir.y)
    const pullback = Math.max(0, -stDir.dot(fwd))  // how much reaching backward
    const poleX = THREE.MathUtils.lerp(0.35, 2.0, lift)   // right (+X) out
    const poleY = THREE.MathUtils.lerp(-1.0, 0.6, lift)   // up when overhead
    const poleZ = THREE.MathUtils.lerp(0.0,  0.5, pullback) // forward when reaching back

    // Build pole in world space using model orientation (right = +X, fwd = fwd)
    const right = new THREE.Vector3(1, 0, 0)  // character's right = world +X
    const poleDir = new THREE.Vector3()
      .addScaledVector(right, poleX)
      .addScaledVector(new THREE.Vector3(0, 1, 0), poleY)
      .addScaledVector(fwd, poleZ)
      .normalize()

    // cosA from law of cosines
    const cosA = (upperArmLen ** 2 + dist ** 2 - forearmLen ** 2) / (2 * upperArmLen * dist)
    const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)))

    // Project pole perpendicular to shoulder→target
    const polePerp = poleDir.clone()
      .sub(stDir.clone().multiplyScalar(poleDir.dot(stDir)))
    if (polePerp.lengthSq() < 1e-6) polePerp.set(1, 0, 0)
    polePerp.normalize()

    const elbow = shoulder.clone()
      .addScaledVector(stDir,    upperArmLen * Math.cos(angleA))
      .addScaledVector(polePerp, upperArmLen * Math.sin(angleA))

    return { elbow }
  }

  return {
    checkFrame,
    buildBodyCapsules,
    sampleTransition,
    approximateElbow,
    // Exported for unit testing
    _segSegDistSq: segSegDistSq,
    _capsulePenetration: capsulePenetration,
  }
}
