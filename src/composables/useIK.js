import { ref, watch } from 'vue'
import * as THREE from 'three'
import { detectBonePrefix } from './boneUtils.js'

/**
 * Two-bone IK solver for the right arm with a pole vector
 * to keep the elbow in a natural position.
 *
 * Chain: RightArm (upper arm) → RightForeArm (forearm) → RightHand (effector)
 * Pole target: defined in MODEL-LOCAL space so it follows model rotation.
 * Elbow prefers to point down and slightly outward (character's right = +X).
 */
export function useIK(model, skeleton, boneMap, onFrame) {
  const ikReady = ref(false)
  const ikTarget = new THREE.Vector3()

  // Bones
  let upperArmBone = null  // RightArm
  let forearmBone = null   // RightForeArm
  let handBone = null      // RightHand

  // Bone lengths (measured at init from the bind pose)
  let upperArmLen = 0
  let forearmLen = 0

  // Reusable temp objects to avoid GC pressure at 60fps
  const _shoulderWorld = new THREE.Vector3()
  const _elbowWorld    = new THREE.Vector3()
  const _toTarget      = new THREE.Vector3()
  const _stDir         = new THREE.Vector3()
  const _poleModelDir  = new THREE.Vector3()
  const _poleWorldDir  = new THREE.Vector3()
  const _polePerp      = new THREE.Vector3()
  const _tmp           = new THREE.Vector3()
  const _desiredLocal  = new THREE.Vector3()
  const _restDir       = new THREE.Vector3()
  const _parentInvMat  = new THREE.Matrix4()

  function initIK() {
    const bones = boneMap.value
    if (!bones || !skeleton.value) return false

    const prefix = detectBonePrefix(bones)
    console.log('IK using bone prefix:', prefix)

    upperArmBone = bones[`${prefix}RightArm`]
    forearmBone  = bones[`${prefix}RightForeArm`]
    handBone     = bones[`${prefix}RightHand`]

    if (!upperArmBone || !forearmBone || !handBone) {
      console.error('Missing required arm bones for IK')
      return false
    }

    // Measure bone lengths from world positions in bind pose
    model.value.updateMatrixWorld(true)

    const shoulderPos = new THREE.Vector3()
    const elbowPos    = new THREE.Vector3()
    const wristPos    = new THREE.Vector3()

    upperArmBone.getWorldPosition(shoulderPos)
    forearmBone.getWorldPosition(elbowPos)
    handBone.getWorldPosition(wristPos)

    upperArmLen = shoulderPos.distanceTo(elbowPos)
    forearmLen  = elbowPos.distanceTo(wristPos)

    console.log(`IK arm lengths: upper=${upperArmLen.toFixed(3)}, forearm=${forearmLen.toFixed(3)}`)

    // Log bone rest directions for debugging
    console.log('Upper arm rest dir (forearm.position):', forearmBone.position.toArray().map(v => v.toFixed(3)))
    console.log('Forearm rest dir (hand.position):', handBone.position.toArray().map(v => v.toFixed(3)))

    // Initialize the IK target to the current hand position
    ikTarget.copy(wristPos)

    ikReady.value = true
    console.log('Two-bone IK solver initialized successfully')
    return true
  }

  function setTarget(worldPos) {
    ikTarget.copy(worldPos)
  }

  function getTarget() {
    return ikTarget.clone()
  }

  /**
   * Solve the two-bone IK each frame.
   *
   * Algorithm:
   * 1. Compute shoulder→target distance, clamp to reachable range
   * 2. Law of cosines → angle at shoulder (angleA)
   * 3. Pole direction in MODEL-LOCAL space → world space (rotates with model)
   * 4. Project pole onto plane perpendicular to shoulder→target → polePerp
   * 5. Elbow world position = shoulder + stDir*cos(A)*L1 + polePerp*sin(A)*L1
   * 6. Upper arm: setFromUnitVectors(boneRestDir, shoulder→elbow in parent local)
   * 7. Forearm: setFromUnitVectors(boneRestDir, elbow→target in parent local)
   */
  function solveTwoBoneIK() {
    if (!upperArmBone || !forearmBone || !model.value) return

    model.value.updateMatrixWorld(true)

    // ── Step 1: World positions & direction ──────────────────────────────────
    upperArmBone.getWorldPosition(_shoulderWorld)

    _toTarget.copy(ikTarget).sub(_shoulderWorld)
    let dist = _toTarget.length()

    // Clamp to reachable range
    const maxReach = (upperArmLen + forearmLen) * 0.9999
    const minReach = Math.abs(upperArmLen - forearmLen) * 1.001 + 0.005
    dist = Math.max(minReach, Math.min(maxReach, dist))

    _stDir.copy(_toTarget).normalize() // shoulder → target (world)

    // ── Step 2: Law of cosines → angle at shoulder ───────────────────────────
    const cosA = (upperArmLen * upperArmLen + dist * dist - forearmLen * forearmLen)
      / (2 * upperArmLen * dist)
    const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)))

    // ── Step 3: Pole direction in world space (model-relative) ───────────────
    // Defined in model's local space:
    //   +X = character's right (outward from body for right arm)
    //   -Y = downward
    // Result: elbow prefers to hang down and slightly outward — natural for a
    // coach touching their body. This rotates with the model automatically.
    _poleModelDir.set(0.35, -1, 0).normalize()
    _poleWorldDir.copy(_poleModelDir).transformDirection(model.value.matrixWorld)

    // Project pole onto plane perpendicular to stDir
    _polePerp.copy(_poleWorldDir)
      .sub(_tmp.copy(_stDir).multiplyScalar(_poleWorldDir.dot(_stDir)))

    if (_polePerp.lengthSq() < 0.0001) {
      // Degenerate: pole is collinear with arm direction — pick any perpendicular
      _tmp.set(Math.abs(_stDir.y) > 0.9 ? 1 : 0, Math.abs(_stDir.y) > 0.9 ? 0 : -1, 0)
      _polePerp.copy(_tmp).sub(_stDir.clone().multiplyScalar(_tmp.dot(_stDir)))
    }
    _polePerp.normalize()

    // ── Step 4: Elbow world position ─────────────────────────────────────────
    _elbowWorld.copy(_shoulderWorld)
      .addScaledVector(_stDir,    upperArmLen * Math.cos(angleA))
      .addScaledVector(_polePerp, upperArmLen * Math.sin(angleA))

    // ── Step 5: Upper arm rotation ───────────────────────────────────────────
    // Desired world direction: shoulder → elbow
    _tmp.copy(_elbowWorld).sub(_shoulderWorld).normalize()

    // Transform to upper arm's parent local space
    const uaParent = upperArmBone.parent
    uaParent.updateWorldMatrix(true, false)
    _parentInvMat.copy(uaParent.matrixWorld).invert()
    _desiredLocal.copy(_tmp).transformDirection(_parentInvMat)

    // Bone rest direction in upper arm's OWN local space = direction toward child (forearm)
    _restDir.copy(forearmBone.position).normalize()

    upperArmBone.quaternion.setFromUnitVectors(_restDir, _desiredLocal)
    upperArmBone.updateMatrixWorld(true)

    // ── Step 6: Forearm rotation ─────────────────────────────────────────────
    // Get actual elbow pos after upper arm rotation
    forearmBone.getWorldPosition(_elbowWorld)

    // Desired world direction: elbow → target
    _tmp.copy(ikTarget).sub(_elbowWorld).normalize()

    // Transform to forearm's parent (= upper arm) local space
    forearmBone.parent.updateWorldMatrix(true, false)
    _parentInvMat.copy(forearmBone.parent.matrixWorld).invert()
    _desiredLocal.copy(_tmp).transformDirection(_parentInvMat)

    // Forearm rest direction = direction toward hand bone
    _restDir.copy(handBone.position).normalize()

    forearmBone.quaternion.setFromUnitVectors(_restDir, _desiredLocal)
    forearmBone.updateMatrixWorld(true)
  }

  // Per-frame update
  if (onFrame) {
    onFrame(() => {
      if (!ikReady.value) return
      solveTwoBoneIK()
    })
  }

  // Watch for model load and auto-init
  let initPending = false
  watch(
    () => boneMap.value && Object.keys(boneMap.value).length > 0,
    (ready) => {
      if (ready && !ikReady.value && !initPending) {
        initPending = true
        setTimeout(() => {
          initIK()
          initPending = false
        }, 150)
      }
    },
    { immediate: true }
  )

  return {
    ikReady,
    setTarget,
    getTarget,
    initIK,
  }
}
