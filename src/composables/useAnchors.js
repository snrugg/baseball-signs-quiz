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
  //                                                                              leftArm:  [forward°, raise°]
  //                                                                              rightArm: [out°, up°]  — elbow bias
  //                                                                              forward: swing arm toward front of body
  //                                                                              raise:   lift arm up from hanging
  billOfCap:   { bone: 'Head',         offset: [0, 0.15, 0.13],    rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  topOfHead:   { bone: 'HeadTop_End',  offset: [0, 0.02, 0],       rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  backOfHead:  { bone: 'Head',         offset: [0, 0.10, -0.10],   rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  nose:        { bone: 'Head',         offset: [0, 0.06, 0.12],    rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  chin:        { bone: 'Head',         offset: [0, -0.02, 0.10],   rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  leftEar:     { bone: 'Head',         offset: [-0.09, 0.03, 0.02], rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  rightEar:    { bone: 'Head',         offset: [0.09, 0.03, 0.02],  rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  chest:       { bone: 'Spine2',       offset: [0, 0.05, 0.12],    rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  belt:        { bone: 'Spine1',       offset: [0, -0.10, 0.12],   rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  leftArm:     { bone: 'LeftArm',      offset: [0, -0.07, 0],      rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  //rightArm:    { bone: 'RightShoulder', offset: [0, 0, 0.08],      rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  frontOfLeg:  { bone: 'RightUpLeg',   offset: [0, -0.10, 0.12],   rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  backOfLeg:   { bone: 'RightUpLeg',   offset: [0, -0.10, -0.12],  rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0], arcAxis: 'down' },
  frontOfHand: { bone: 'LeftHand',     offset: [0, 0, 0.06],       rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
  backOfHand:  { bone: 'LeftHand',     offset: [0, 0, -0.06],      rotation: [0, 0, 0], leftArm: [0, 0], rightArm: [0, 0] },
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
  //rightArm:    'Right Arm',
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
  frontOfLeg:  0xaa44ff,
  backOfLeg:   0xcc44ff,
  frontOfHand: 0xff44aa,
  backOfHand:  0xff4488,
}

const STORAGE_KEY = 'baseballSigns_anchorOffsets'

/**
 * Merge a saved/fetched calibration object with DEFAULT_ANCHOR_DEFS so that:
 *  - All known anchors exist (new anchors added in code won't be missing)
 *  - Saved offset/rotation values override the hardcoded defaults
 *  - Missing fields (e.g. rotation absent from old save) fall back to defaults
 */
function mergeWithDefaults(saved) {
  if (!saved || typeof saved !== 'object') return null
  const merged = structuredClone(DEFAULT_ANCHOR_DEFS)
  for (const [name, def] of Object.entries(saved)) {
    if (merged[name]) {
      if (Array.isArray(def.offset))   merged[name].offset    = def.offset
      if (Array.isArray(def.rotation)) merged[name].rotation  = def.rotation
      if (Array.isArray(def.leftArm))  merged[name].leftArm   = def.leftArm
      if (Array.isArray(def.rightArm)) merged[name].rightArm  = def.rightArm
    }
  }
  return merged
}

/** Read the local-storage copy (synchronous, used for instant startup). */
function loadLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Try to fetch /calibration.json from the public folder.
 * Returns merged anchor defs on success, null on failure (404 or parse error).
 * Uses import.meta.env.BASE_URL so it works on both localhost and GitHub Pages.
 */
async function loadCalibrationFile() {
  try {
    const url = import.meta.env.BASE_URL + 'calibration.json'
    const res = await fetch(url)
    if (!res.ok) return null          // 404 is expected when no file exists yet
    const data = await res.json()
    return mergeWithDefaults(data)
  } catch {
    return null
  }
}

export function useAnchors(boneMap, onFrame) {
  // Synchronous init: use localStorage so there's no blank-flash on reload.
  // calibration.json (if present) will overwrite this shortly after.
  const anchorDefs = ref(mergeWithDefaults(loadLocalStorage()) ?? structuredClone(DEFAULT_ANCHOR_DEFS))

  // Async: fetch calibration.json — if it exists it is authoritative and
  // overrides localStorage. This completes well before the model finishes
  // loading so there's no visible jump.
  loadCalibrationFile().then(data => {
    if (data) {
      anchorDefs.value = data
      console.log('Loaded calibration from calibration.json')
    }
  })

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

  function fullBoneName(suffix) {
    return `${bonePrefix}${suffix}`
  }

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

  function getAnchorRotation(name) {
    const def = anchorDefs.value[name]
    return def?.rotation ?? [0, 0, 0]
  }

  /** Returns [forward, raise] degrees for the left-arm pose at this anchor. */
  function getAnchorLeftArm(name) {
    const def = anchorDefs.value[name]
    return def?.leftArm ?? [0, 0]
  }

  /** axis: 0 = forward, 1 = raise */
  function setAnchorLeftArm(name, axis, value) {
    const def = anchorDefs.value[name]
    if (!def) return
    if (!def.leftArm) def.leftArm = [0, 0]
    def.leftArm[axis] = value
  }

  /** Returns the arc axis for transit TO this anchor ('forward' by default, 'down' for backOfLeg). */
  function getAnchorArcAxis(name) {
    return anchorDefs.value[name]?.arcAxis ?? 'forward'
  }

  /** Returns [out, up] elbow bias for the right arm at this anchor. */
  function getAnchorRightArm(name) {
    const def = anchorDefs.value[name]
    return def?.rightArm ?? [0, 0]
  }

  /** axis: 0 = out, 1 = up */
  function setAnchorRightArm(name, axis, value) {
    const def = anchorDefs.value[name]
    if (!def) return
    if (!def.rightArm) def.rightArm = [0, 0]
    def.rightArm[axis] = value
  }

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

  function updateAnchors() {
    if (!boneMap.value || Object.keys(boneMap.value).length === 0) return

    if (!bonePrefix) {
      bonePrefix = detectBonePrefix(boneMap.value)
      console.log('Detected bone prefix:', bonePrefix)
    }

    const positions = {}
    for (const name of Object.keys(anchorDefs.value)) {
      const pos = getAnchorWorldPos(name, new THREE.Vector3())
      if (pos) {
        positions[name] = pos
        if (showSpheres && anchorMeshes[name]) {
          anchorMeshes[name].position.copy(pos)
        }
      }
    }
    anchorPositions.value = positions
  }

  if (onFrame) {
    onFrame(updateAnchors)
  }

  function setAnchorOffset(name, axis, value) {
    const def = anchorDefs.value[name]
    if (!def) return
    const idx = { x: 0, y: 1, z: 2 }[axis]
    if (idx === undefined) return
    def.offset[idx] = value
  }

  function setAnchorRotation(name, axis, value) {
    const def = anchorDefs.value[name]
    if (!def) return
    if (!def.rotation) def.rotation = [0, 0, 0]
    const idx = { x: 0, y: 1, z: 2 }[axis]
    if (idx === undefined) return
    def.rotation[idx] = value
  }

  /**
   * Build the calibration payload from current anchorDefs.
   */
  function buildCalibrationData() {
    const out = {}
    for (const [name, def] of Object.entries(anchorDefs.value)) {
      out[name] = {
        bone:     def.bone,
        offset:   [...def.offset],
        rotation: [...(def.rotation  ?? [0, 0, 0])],
        leftArm:  [...(def.leftArm   ?? [0, 0])],
        rightArm: [...(def.rightArm  ?? [0, 0])],
      }
    }
    return out
  }

  /**
   * Save calibration:
   *  1. Write to localStorage (persists this session in this browser).
   *  2. Download calibration.json — place it in public/ and commit to make
   *     the calibration permanent for all users on all devices.
   */
  function saveOffsets() {
    const data = buildCalibrationData()
    const json = JSON.stringify(data, null, 2)

    // 1. localStorage — quick session persistence
    localStorage.setItem(STORAGE_KEY, json)

    // 2. File download
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'calibration.json'
    a.click()
    URL.revokeObjectURL(url)
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
    getAnchorLeftArm,
    setAnchorLeftArm,
    getAnchorRightArm,
    setAnchorRightArm,
    getAnchorArcAxis,
    createSpheres,
    setSpheresVisible,
    setAnchorOffset,
    setAnchorRotation,
    saveOffsets,
    resetOffsets,
    updateAnchors,
  }
}
