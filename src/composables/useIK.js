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
 *
 * Hand orientation:
 *   setHandRotation(rx, ry, rz) — override the hand bone's Euler in MODEL-LOCAL
 *   space (relative to the model's own rotation), so the orientation travels
 *   with model rotation/translation automatically.
 *   [0, 0, 0] = no override (hand stays at natural FBX/IK pose).
 *   computeAutoHandRotation(anchorWorldPos) — heuristic: rotate palm to face
 *   inward toward the model's center; returns model-local Euler degrees.
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

  // Hand rotation target — [rx, ry, rz] in degrees, world-space Euler XYZ.
  // When all zero, no override is applied (hand stays at natural IK result).
  const handTargetEuler = { rx: 0, ry: 0, rz: 0 }

  // Detected palm axis in hand bone's LOCAL space.
  // Used by computeAutoHandRotation to determine which way the palm faces.
  const _palmLocalAxis = new THREE.Vector3(0, 1, 0)

  // Reusable temp objects — position solve
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

  // Reusable temp objects — hand rotation
  const _handTargetQuat   = new THREE.Quaternion()
  const _forearmWorldQuat = new THREE.Quaternion()
  const _modelWorldQuat   = new THREE.Quaternion()
  const _tempEuler        = new THREE.Euler()

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
    console.log('Upper arm rest dir (forearm.position):', forearmBone.position.toArray().map(v => v.toFixed(3)))
    console.log('Forearm rest dir (hand.position):', handBone.position.toArray().map(v => v.toFixed(3)))

    // Initialize the IK target to the current hand position
    ikTarget.copy(wristPos)

    // Detect which local axis of the hand bone is the palm normal.
    // We do this in bind pose so the arm is in a predictable T-pose orientation.
    detectPalmAxis()

    ikReady.value = true
    console.log('Two-bone IK solver initialized successfully')
    return true
  }

  /**
   * Detect the hand bone's "palm" axis in its local space.
   *
   * In a Mixamo T-pose the forearm points roughly along world +X (character's right).
   * The palm-facing axis of the hand is perpendicular to the fingers (forearm direction).
   * We find the local hand axis LEAST aligned with the forearm direction — that's
   * the best candidate for the palm normal.
   */
  function detectPalmAxis() {
    if (!handBone || !forearmBone) return

    model.value.updateMatrixWorld(true)

    // Forearm world direction in bind pose
    const forearmWorldDir = new THREE.Vector3()
    forearmBone.getWorldDirection(forearmWorldDir)

    // Three world-space axes of the hand bone
    const mat = handBone.matrixWorld
    const axisX = new THREE.Vector3().setFromMatrixColumn(mat, 0)
    const axisY = new THREE.Vector3().setFromMatrixColumn(mat, 1)
    const axisZ = new THREE.Vector3().setFromMatrixColumn(mat, 2)

    const dotX = Math.abs(axisX.dot(forearmWorldDir))
    const dotY = Math.abs(axisY.dot(forearmWorldDir))
    const dotZ = Math.abs(axisZ.dot(forearmWorldDir))

    console.log(`Hand axis alignment with forearm: X=${dotX.toFixed(3)} Y=${dotY.toFixed(3)} Z=${dotZ.toFixed(3)}`)

    // Palm axis = LOCAL axis LEAST aligned with forearm (most perpendicular = palm)
    if (dotX <= dotY && dotX <= dotZ) {
      _palmLocalAxis.set(1, 0, 0)
      console.log('Palm axis detected: local +X')
    } else if (dotY <= dotX && dotY <= dotZ) {
      _palmLocalAxis.set(0, 1, 0)
      console.log('Palm axis detected: local +Y')
    } else {
      _palmLocalAxis.set(0, 0, 1)
      console.log('Palm axis detected: local +Z')
    }
  }

  /**
   * Set the target MODEL-LOCAL Euler rotation for the right hand bone.
   * rx, ry, rz are in DEGREES, relative to the model's own orientation.
   * All zeros = no override (hand stays at natural IK result).
   */
  function setHandRotation(rx, ry, rz) {
    handTargetEuler.rx = rx
    handTargetEuler.ry = ry
    handTargetEuler.rz = rz
  }

  /**
   * Compute a "smart default" world-space Euler rotation for the hand
   * that makes the palm approximately face inward toward the model's center.
   *
   * This is a calibration starting point — the sliders let you fine-tune.
   * Returns [rx, ry, rz] in degrees.
   *
   * @param {THREE.Vector3} anchorWorldPos  World position of the anchor
   */
  function computeAutoHandRotation(anchorWorldPos) {
    if (!handBone || !forearmBone || !model.value) return [0, 0, 0]

    // Make sure matrices are current
    model.value.updateMatrixWorld(true)

    // Direction from anchor toward model centre (horizontal plane only,
    // so anchors on the head still get a sensible inward direction).
    const modelPos = model.value.position
    const inward = new THREE.Vector3(
      modelPos.x - anchorWorldPos.x,
      0,
      modelPos.z - anchorWorldPos.z,
    )

    if (inward.lengthSq() < 0.001) {
      // Anchor is directly above/below the model origin (e.g. topOfHead).
      // Fall back to world -Y (palm down).
      inward.set(0, -1, 0)
    } else {
      inward.normalize()
    }

    // Current hand bone world quaternion (after whatever IK pose is set right now)
    const handWorldQuat = new THREE.Quaternion()
    handBone.getWorldQuaternion(handWorldQuat)

    // Current palm direction in world space, derived from detected local palm axis
    const currentPalm = _palmLocalAxis.clone().applyQuaternion(handWorldQuat)

    // Rotation that swings the palm from its current direction to face inward
    const correctionQuat = new THREE.Quaternion().setFromUnitVectors(
      currentPalm,
      inward,
    )

    // Apply correction to produce the target world quaternion
    const targetWorldQuat = correctionQuat.multiply(handWorldQuat)

    // Convert world → model-local so the stored value travels with model rotation.
    // inv(modelWorldQuat) × targetWorldQuat = model-local target quat
    const modelWorldQuat = new THREE.Quaternion()
    model.value.getWorldQuaternion(modelWorldQuat)
    const modelLocalQuat = modelWorldQuat.clone().invert().multiply(targetWorldQuat)

    const euler = new THREE.Euler().setFromQuaternion(modelLocalQuat, 'XYZ')
    return [
      THREE.MathUtils.radToDeg(euler.x),
      THREE.MathUtils.radToDeg(euler.y),
      THREE.MathUtils.radToDeg(euler.z),
    ]
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
   * 8. Hand: if handTargetEuler is non-zero, override to desired world Euler
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
    _poleModelDir.set(0.35, -1, 0).normalize()
    _poleWorldDir.copy(_poleModelDir).transformDirection(model.value.matrixWorld)

    // Project pole onto plane perpendicular to stDir
    _polePerp.copy(_poleWorldDir)
      .sub(_tmp.copy(_stDir).multiplyScalar(_poleWorldDir.dot(_stDir)))

    if (_polePerp.lengthSq() < 0.0001) {
      _tmp.set(Math.abs(_stDir.y) > 0.9 ? 1 : 0, Math.abs(_stDir.y) > 0.9 ? 0 : -1, 0)
      _polePerp.copy(_tmp).sub(_stDir.clone().multiplyScalar(_tmp.dot(_stDir)))
    }
    _polePerp.normalize()

    // ── Step 4: Elbow world position ─────────────────────────────────────────
    _elbowWorld.copy(_shoulderWorld)
      .addScaledVector(_stDir,    upperArmLen * Math.cos(angleA))
      .addScaledVector(_polePerp, upperArmLen * Math.sin(angleA))

    // ── Step 5: Upper arm rotation ───────────────────────────────────────────
    _tmp.copy(_elbowWorld).sub(_shoulderWorld).normalize()

    const uaParent = upperArmBone.parent
    uaParent.updateWorldMatrix(true, false)
    _parentInvMat.copy(uaParent.matrixWorld).invert()
    _desiredLocal.copy(_tmp).transformDirection(_parentInvMat)

    _restDir.copy(forearmBone.position).normalize()
    upperArmBone.quaternion.setFromUnitVectors(_restDir, _desiredLocal)
    upperArmBone.updateMatrixWorld(true)

    // ── Step 6: Forearm rotation ─────────────────────────────────────────────
    forearmBone.getWorldPosition(_elbowWorld)

    _tmp.copy(ikTarget).sub(_elbowWorld).normalize()

    forearmBone.parent.updateWorldMatrix(true, false)
    _parentInvMat.copy(forearmBone.parent.matrixWorld).invert()
    _desiredLocal.copy(_tmp).transformDirection(_parentInvMat)

    _restDir.copy(handBone.position).normalize()
    forearmBone.quaternion.setFromUnitVectors(_restDir, _desiredLocal)
    forearmBone.updateMatrixWorld(true)

    // ── Step 7: Hand rotation override ───────────────────────────────────────
    // Stored Euler angles are in MODEL-LOCAL space so the hand orientation
    // travels with model rotation and translation automatically.
    // Convert model-local → world by premultiplying with model's world quat,
    // then convert world → hand-bone-local via inv(forearm world quat).
    if (handBone && (handTargetEuler.rx !== 0 || handTargetEuler.ry !== 0 || handTargetEuler.rz !== 0)) {
      _tempEuler.set(
        THREE.MathUtils.degToRad(handTargetEuler.rx),
        THREE.MathUtils.degToRad(handTargetEuler.ry),
        THREE.MathUtils.degToRad(handTargetEuler.rz),
        'XYZ',
      )
      // Model-local quat → world quat
      _handTargetQuat.setFromEuler(_tempEuler)
      model.value.getWorldQuaternion(_modelWorldQuat)
      _handTargetQuat.premultiply(_modelWorldQuat)

      // hand local quat = inv(forearm world quat) × desired world quat
      forearmBone.getWorldQuaternion(_forearmWorldQuat)
      handBone.quaternion.copy(_forearmWorldQuat).invert().multiply(_handTargetQuat)
      handBone.updateMatrixWorld(true)
    }
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
    setHandRotation,
    computeAutoHandRotation,
  }
}
