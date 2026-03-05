/**
 * Auto-detects the Mixamo bone prefix from the skeleton's bone map.
 *
 * Different Mixamo exports use different prefixes:
 *   - "mixamorig:" (colon variant)
 *   - "mixamorig"  (standard)
 *   - "mixamorig9" (newer exports)
 *
 * We detect the prefix by finding the "Hips" bone and extracting
 * everything before "Hips".
 */
export function detectBonePrefix(boneMap) {
  const names = Object.keys(boneMap)
  // Look for any bone ending with "Hips"
  const hipsBone = names.find((n) => n.endsWith('Hips'))
  if (hipsBone) {
    return hipsBone.replace('Hips', '')
  }
  // Fallback: look for "Head"
  const headBone = names.find((n) => n.endsWith('Head'))
  if (headBone) {
    return headBone.replace('Head', '')
  }
  console.warn('Could not detect bone prefix, falling back to "mixamorig"')
  return 'mixamorig'
}

/**
 * Resolve a short bone suffix (e.g. "Head") to the full bone name
 * using the detected prefix (e.g. "mixamorig9Head")
 */
export function resolveBoneName(prefix, suffix) {
  return `${prefix}${suffix}`
}
