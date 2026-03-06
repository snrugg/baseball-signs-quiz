/**
 * Pure utility functions extracted from useScene.js for testability.
 *
 * These contain the mathematical / data-processing logic that does NOT
 * require a WebGL context, so they can be exercised in Vitest (jsdom / node).
 */

// ── Animation track filtering ─────────────────────────────────────────────────

/**
 * Bone name patterns whose animation tracks must be stripped from the idle
 * clip so that the IK solver has exclusive control of the right arm.
 */
export const RIGHT_ARM_BONE_PATTERNS = [
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'RightHandThumb',
  'RightHandIndex',
  'RightHandMiddle',
  'RightHandRing',
  'RightHandPinky',
]

/**
 * Returns true if a Three.js AnimationTrack's name targets a right-arm bone.
 * Track names follow the pattern "boneName.property" (e.g. "RightArm.quaternion").
 *
 * @param {string} trackName  Full track name (e.g. "mixamorig:RightArm.quaternion")
 */
export function isRightArmTrack(trackName) {
  const boneName = trackName.split('.')[0]
  return RIGHT_ARM_BONE_PATTERNS.some(pattern => boneName.includes(pattern))
}

/**
 * Filter an array of AnimationTracks, removing any that target right-arm bones.
 *
 * @param {Array<{name: string}>} tracks  Animation clip track array
 * @returns {Array<{name: string}>}       Filtered tracks (all non-right-arm)
 */
export function filterRightArmTracks(tracks) {
  return tracks.filter(t => !isRightArmTrack(t.name))
}

// ── Model scaling and centering ───────────────────────────────────────────────

/**
 * Compute the uniform scale factor that makes a model's bounding-box height
 * equal to `desiredHeight` world units.
 *
 * @param {number} boundingBoxHeight  Measured height of the model (max.y - min.y)
 * @param {number} desiredHeight      Target height in world units (default 1.8)
 * @returns {number}                  Scale factor to apply uniformly
 */
export function computeModelScale(boundingBoxHeight, desiredHeight = 1.8) {
  if (boundingBoxHeight === 0) return 1
  return desiredHeight / boundingBoxHeight
}

/**
 * Compute the Y translation needed to place the model's feet on the ground (y=0).
 *
 * @param {number} boxMinY  The minimum Y value of the model's bounding box
 * @returns {number}        The Y offset to apply (always negative or zero)
 */
export function computeGroundOffset(boxMinY) {
  return -boxMinY
}

/**
 * Compute the X translation needed to horizontally center the model at origin.
 *
 * @param {number} boxCenterX  The X component of the bounding box center
 * @returns {number}           The X offset to apply
 */
export function computeCenterOffsetX(boxCenterX) {
  return -boxCenterX
}

// ── Pointer / drag math ───────────────────────────────────────────────────────

/**
 * Compute the new model Y-rotation from a left-drag gesture.
 * A full-width drag (dx === canvasWidth) produces one full turn (2π).
 *
 * @param {number} startRotation  Rotation at the start of the drag (radians)
 * @param {number} dx             Horizontal drag distance (pixels, signed)
 * @param {number} canvasWidth    Width of the canvas (pixels)
 * @returns {number}              New rotation in radians
 */
export function computeDragRotation(startRotation, dx, canvasWidth) {
  return startRotation + (dx / canvasWidth) * Math.PI * 2
}

/**
 * Compute the new model X-position from a right-drag / two-finger-pan gesture.
 * A full-width drag produces 3 world units of movement.
 *
 * @param {number} startOffset  Position X at the start of the drag (world units)
 * @param {number} dx           Horizontal drag distance (pixels, signed)
 * @param {number} canvasWidth  Width of the canvas (pixels)
 * @returns {number}            New X position in world units
 */
export function computeDragPan(startOffset, dx, canvasWidth) {
  return startOffset + (dx / canvasWidth) * 3
}

// ── Camera / renderer helpers ─────────────────────────────────────────────────

/**
 * Clamp the device pixel ratio to a maximum to avoid excessive GPU load.
 *
 * @param {number} devicePixelRatio  Raw window.devicePixelRatio
 * @param {number} max               Maximum allowed pixel ratio (default 2)
 * @returns {number}                 Clamped pixel ratio
 */
export function clampPixelRatio(devicePixelRatio, max = 2) {
  return Math.min(devicePixelRatio, max)
}
