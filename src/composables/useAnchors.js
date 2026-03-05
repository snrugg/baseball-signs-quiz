import { ref, watch, computed } from 'vue'
import * as THREE from 'three'
import { detectBonePrefix } from './boneUtils.js'

/**
 * Default anchor definitions: bone suffix + local offset + hand rotation.
 * The prefix (e.g. "mixamorig9") is auto-detected at runtime.
 * Offsets are in the bone's local coordinate space and get transformed
 * to world space via the bone's quaternion each frame.
 *
 * rotation: [rx, ry, rz] in DEGREES, world-space Euler XYZ for the right hand bone.
 *   [0, 0, 0] = no override (hand stays at natural IK pose)
 *   Non-zero = hand bone is driven to this world orientation
 *
 * These are starting values — the calibration UI lets you adjust them.
 */
const DEFAULT_ANCHOR_DEFS = {
  billOfCap:   { bone: 'Head',         offset: [0, 0.15, 0.13],   rotation: [0, 0, 0] },
  topOfHead:   { bone: 'HeadTop_End',  offset: [0, 0.02, 0],      rotation: [0, 0, 0] },
  backOfHead:  { bone: 'Head',         offset: [0, 0.10, -0.10],  rotation: [0, 0, 0] },
  nose:        { bone: 'Head',         offset: [0, 0.06, 0.12],   rotation: [0, 0, 0] },
  chin:        { bone: 'Head',         offset: [0, -0.02, 0.10],  rotation: [0, 0, 0] },
  // Ears: lateral offset on head bone local X axis (+X = character's right)
  leftEar:     { bone: 'Head',         offset: [-0.09, 0.03, 0.02], rotation: [0, 0, 0] },
  rightEar:    { bone: 'Head',         offset: [0.09, 0.03, 0.02],  rotation: [0, 0, 0] },
  chest:       { bone: 'Spine2',       offset: [0, 0.05, 0.12],  rotation: [0, 0, 0] },
  belt:        { bone: 'Spine1',       offset: [0, -0.10, 0.12], rotation: [0, 0, 0] },
  leftArm:     { bone: 'LeftArm',      offset: [0, -0.07, 0],    rotation: [0, 0, 0] },
  rightArm:    { bone: 'RightShoulder', offset: [0, 0, 0.08],    rotation: [0, 0, 0] },
  frontOfLeg:  { bone: 'RightUpLeg',   offset: [0, -0.10, 0.12], rotation: [0, 0, 0] },
  backOfLeg:   { bone: 'RightUpLeg',   offset: [0, -0.10, -0.12], rotation: [0, 0, 0] },
  frontOfHand: { bone: 'LeftHand',     offset: [0, 0, 0.06],     rotation: [0, 0, 0] },
  backOfHand:  { bone: 'LeftHand',     offset: [0, 0, -0.06],    rotation: [0, 0, 0] },
}

// Human-readable labels for the UI
export const ANCHOR_LABELS = {
  billOfCap:   'Bill of Cap',
  topOfHead:   'Top of Head',
  backOfHead:  'Back of Head',
  nose:        'Nose',
  chin:        'Chin',
  leftEar:     'Left Ear',
  rightEar:    'Right Ear',
  chest:       'Chest',
  belt:        'Belt',
  leftArm:     'Left Arm',
  rightArm:    'Right Arm',
  frontOfLeg:  'Front of Leg',
  backOfLeg:   'Back of Leg',
  frontOfHand: 'Front of Hand',
  backOfHand:  'Back of Hand',
}

// Colors for anchor spheres
const ANCHOR_COLORS = {
  billOfCap:   0xff4444,
  topOfHead:   0xff6644,
  backOfHead:  0xff8844,
  nose:        0xffaa44,
  chin:        0xffcc44,
  leftEar:     0xffee44,
  rightEar:    0xffff88,
  chest:       0x44ff44,
  belt:        0x44ffaa,
  leftArm:     0x44aaff,
  rightArm:    0x4466ff,
  frontOfLeg:  0xaa44ff,
  backOfLeg:   0xcc44ff,
  frontOfHand: 0xff44aa,
  backOfHand:  0xff4488,
}

const STORAGE_KEY = 'baseballSigns_anchorOffsets'

export function useAnchors(boneMap, onFrame) {
  // Reactive anchor definitions (so calibration UI can edit offsets)
  const anchorDefs = ref(loadSavedOffsets() || structuredClone(DEFAULT_ANCHOR_DEFS))

  // Current world-space positions (updated each frame)
  const anchorPositions = ref({})

  // Auto-detected bone prefix
  let bonePrefix = ''

  // Visualization spheres
  const anchorMeshes = {}
  let sphereGroup = null
  let showSpheres = false

  // Temp vectors to avoid GC
  const _worldPos = new THREE.Vector3()
  const _offset = new THREE.Vector3()
  const _quat = new THREE.Quaternion()

  /**
   * Resolve a bone suffix to a full bone name using the detected prefix
   */
  function fullBoneName(suffix) {
    return `${bonePrefix}${suffix}`
  }

  /**
   * Compute the world-space position of a named anchor
   */
  function getAnchorWorldPos(name, target) {
    const def = anchorDefs.value[name]
    if (!def) return null

    const bones = boneMap.value
    const bone = bones[fullBoneName(def.bone)]
    if (!bone) return null

    const t = target || new THREE.Vector3()
    bone.getWorldPosition(_worldPos)
    _offset.set(def.offset[0], def.offset[1], def.offset[2])
    bone.getWorldQuaternion(_quat)
    _offset.applyQuaternion(_quat)
    t.copy(_worldPos).add(_offset)
    return t
  }

  /**
   * Get the stored hand rotation for an anchor.
   * Returns [rx, ry, rz] in degrees (world-space Euler XYZ).
   * [0, 0, 0] means no override.
   */
  function getAnchorRotation(name) {
    const def = anchorDefs.value[name]
    return def?.rotation ?? [0, 0, 0]
  }

  /**
   * Create visible spheres for each anchor (for calibration mode)
   */
  function createSpheres(scene) {
    if (sphereGroup) return
    sphereGroup = new THREE.Group()
    sphereGroup.name = 'anchorSpheres'

    const geo = new THREE.SphereGeometry(0.02, 12, 12)

    for (const name of Object.keys(anchorDefs.value)) {
      const color = ANCHOR_COLORS[name] || 0xffffff
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = `anchor_${name}`
      mesh.userData.anchorName = name
      sphereGroup.add(mesh)
      anchorMeshes[name] = mesh
    }

    scene.add(sphereGroup)
  }

  function setSpheresVisible(visible) {
    showSpheres = visible
    if (sphereGroup) sphereGroup.visible = visible
  }

  /**
   * Update all anchor world positions — called each frame
   */
  function updateAnchors() {
    if (!boneMap.value || Object.keys(boneMap.value).length === 0) return

    // Detect prefix on first valid frame
    if (!bonePrefix) {
      bonePrefix = detectBonePrefix(boneMap.value)
      console.log('Detected bone prefix:', bonePrefix)
    }

    const positions = {}
    for (const name of Object.keys(anchorDefs.value)) {
      const pos = getAnchorWorldPos(name, new THREE.Vector3())
      if (pos) {
        positions[name] = pos

        // Update sphere positions if visible
        if (showSpheres && anchorMeshes[name]) {
          anchorMeshes[name].position.copy(pos)
        }
      }
    }
    anchorPositions.value = positions
  }

  // Hook into the render loop
  if (onFrame) {
    onFrame(updateAnchors)
  }

  /**
   * Update an anchor's position offset (for calibration)
   */
  function setAnchorOffset(name, axis, value) {
    const def = anchorDefs.value[name]
    if (!def) return
    const idx = { x: 0, y: 1, z: 2 }[axis]
    if (idx === undefined) return
    def.offset[idx] = value
  }

  /**
   * Update an anchor's hand rotation (for calibration).
   * axis: 'x' | 'y' | 'z', value: degrees
   */
  function setAnchorRotation(name, axis, value) {
    const def = anchorDefs.value[name]
    if (!def) return
    if (!def.rotation) def.rotation = [0, 0, 0]
    const idx = { x: 0, y: 1, z: 2 }[axis]
    if (idx === undefined) return
    def.rotation[idx] = value
  }

  function saveOffsets() {
    const toSave = {}
    for (const [name, def] of Object.entries(anchorDefs.value)) {
      toSave[name] = {
        bone: def.bone,
        offset: [...def.offset],
        rotation: [...(def.rotation ?? [0, 0, 0])],
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  }

  function loadSavedOffsets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const saved = JSON.parse(raw)
      // Merge with defaults so all fields exist (handles old saves without rotation)
      const merged = structuredClone(DEFAULT_ANCHOR_DEFS)
      for (const [name, def] of Object.entries(saved)) {
        if (merged[name]) {
          if (def.offset)   merged[name].offset   = def.offset
          if (def.rotation) merged[name].rotation = def.rotation
          // rotation defaults to [0,0,0] from DEFAULT_ANCHOR_DEFS if not in save
        }
      }
      return merged
    } catch {
      return null
    }
  }

  function resetOffsets() {
    anchorDefs.value = structuredClone(DEFAULT_ANCHOR_DEFS)
    localStorage.removeItem(STORAGE_KEY)
  }

  const anchorNames = computed(() => Object.keys(anchorDefs.value))

  return {
    anchorDefs,
    anchorPositions,
    anchorNames,
    getAnchorWorldPos,
    getAnchorRotation,
    createSpheres,
    setSpheresVisible,
    setAnchorOffset,
    setAnchorRotation,
    saveOffsets,
    resetOffsets,
    updateAnchors,
  }
}
