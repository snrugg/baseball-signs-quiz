<script setup>
import { ref, provide } from 'vue'
import { useScene } from '../composables/useScene.js'
import { useAnchors, ANCHOR_LABELS } from '../composables/useAnchors.js'
import { useIK } from '../composables/useIK.js'
import { useSequencer } from '../composables/useSequencer.js'
import { useSignDefs } from '../composables/useSignDefs.js'

const canvasRef = ref(null)

// Initialize the Three.js scene
const {
  loading,
  loadError,
  model,
  skeleton,
  boneMap,
  onFrame,
  getScene,
  getCamera,
  getRenderer,
  modelRotation,
  modelOffsetX,
  setModelRotation,
  setModelOffsetX,
  leftArmPose,
  setLeftArmPose,
} = useScene(canvasRef)

// Initialize anchor system
const {
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
  getAnchorArcScale,
  setAnchorArcScale,
  getAnchorArcLift,
  setAnchorArcLift,
  getAnchorArcOut,
  setAnchorArcOut,
  createSpheres,
  setSpheresVisible,
  setAnchorOffset,
  setAnchorRotation,
  saveOffsets,
  resetOffsets,
} = useAnchors(boneMap, onFrame)

// Initialize IK
const {
  ikReady,
  setTarget,
  getTarget,
  setHandRotation,
  setPoleOffset,
  setIKEnabled,
  snapTargetToHand,
  getHandWorldPos,
  computeAutoHandRotation,
  getBodyCapsules,
} = useIK(model, skeleton, boneMap, onFrame)

// Returns the model's forward direction (local +Z) in world space.
// The model only ever rotates around Y, so forward = (sin θ, 0, cos θ).
// Used by the sequencer to arc transition paths in front of the body.
function getModelForward() {
  const theta = modelRotation.value
  return { x: Math.sin(theta), y: 0, z: Math.cos(theta) }
}

// Initialize sequencer — now receives rotation accessors alongside position
const {
  isPlaying,
  currentStep,
  currentSequence,
  setRepulsionOffset,
  playSign,
  moveToAnchor,
  moveToSequence,
  moveToRest,
  stop,
  initPosition,
} = useSequencer(getAnchorWorldPos, getAnchorRotation, getAnchorLeftArm, getAnchorRightArm, getAnchorArcAxis, getAnchorArcScale, getAnchorArcLift, getAnchorArcOut, getModelForward, setTarget, setHandRotation, setLeftArmPose, setPoleOffset, onFrame, setIKEnabled, getHandWorldPos, getBodyCapsules)

// ── Real-time IK repulsion ─────────────────────────────────────────────────
// Each frame while a sign is playing, check whether the animated IK target is
// passing through a body capsule.  If so, push it outward by the penetration
// depth.  The sequencer adds this offset on top of GSAP's interpolation so it
// never fights the tween — GSAP still reaches the destination cleanly.
const WRIST_SPHERE_R = 0.04  // approx forearm/wrist radius
onFrame(() => {
  if (!ikReady.value || !isPlaying.value) {
    setRepulsionOffset(0, 0, 0)
    return
  }
  const target = getTarget()
  if (!target) return

  const caps = getBodyCapsules()
  if (!caps.length) return

  let repX = 0, repY = 0, repZ = 0

  for (const cap of caps) {
    // Vector from capsule endpoint p1 toward p2
    const d2x = cap.p2.x - cap.p1.x
    const d2y = cap.p2.y - cap.p1.y
    const d2z = cap.p2.z - cap.p1.z
    const len2 = d2x * d2x + d2y * d2y + d2z * d2z

    // Closest point on the capsule segment to the wrist
    const tSeg = len2 < 1e-10 ? 0 : Math.max(0, Math.min(1,
      ((target.x - cap.p1.x) * d2x + (target.y - cap.p1.y) * d2y + (target.z - cap.p1.z) * d2z) / len2
    ))
    const cx = cap.p1.x + tSeg * d2x
    const cy = cap.p1.y + tSeg * d2y
    const cz = cap.p1.z + tSeg * d2z

    // Penetration depth of wrist sphere vs. this body capsule
    const nx = target.x - cx
    const ny = target.y - cy
    const nz = target.z - cz
    const dist = Math.sqrt(nx * nx + ny * ny + nz * nz)
    const depth = (WRIST_SPHERE_R + cap.radius) - dist

    if (depth > 0.005 && dist > 0.001) {
      const scale = depth * 1.3 / dist
      repX += nx * scale
      repY += ny * scale
      repZ += nz * scale
    }
  }

  setRepulsionOffset(repX, repY, repZ)
})

// Initialize sign definitions (async fetch from public/signs.json, falls back to defaults)
const {
  signDefs,
  indicator,
  signKeys,
  getSignAnchors,
  formatSignLabel,
  loadSignDefs,
} = useSignDefs()
loadSignDefs()

// Provide everything to child components
provide('scene', {
  loading,
  loadError,
  model,
  skeleton,
  boneMap,
  onFrame,
  getScene,
  modelRotation,
  modelOffsetX,
  setModelRotation,
  setModelOffsetX,
  leftArmPose,
  setLeftArmPose,
})

provide('anchors', {
  anchorDefs,
  anchorPositions,
  anchorNames,
  getAnchorWorldPos,
  getAnchorRotation,
  getAnchorLeftArm,
  setAnchorLeftArm,
  getAnchorRightArm,
  setAnchorRightArm,
  getAnchorArcScale,
  setAnchorArcScale,
  getAnchorArcLift,
  setAnchorArcLift,
  getAnchorArcOut,
  setAnchorArcOut,
  createSpheres,
  setSpheresVisible,
  setAnchorOffset,
  setAnchorRotation,
  saveOffsets,
  resetOffsets,
  ANCHOR_LABELS,
})

provide('ik', {
  ikReady,
  setTarget,
  getTarget,
  setHandRotation,
  setPoleOffset,
  computeAutoHandRotation,
})

provide('sequencer', {
  isPlaying,
  currentStep,
  currentSequence,
  playSign,
  moveToAnchor,
  moveToSequence,
  moveToRest,
  stop,
  initPosition,
})

provide('signDefs', {
  signDefs,
  indicator,
  signKeys,
  getSignAnchors,
  formatSignLabel,
})
</script>

<template>
  <div class="scene-container">
    <canvas ref="canvasRef" class="scene-canvas" />

    <!-- Loading overlay -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner" />
      <p>Loading model...</p>
    </div>

    <!-- Error overlay -->
    <div v-if="loadError" class="error-overlay">
      <p>Failed to load model</p>
      <p class="error-detail">{{ loadError }}</p>
    </div>

    <!-- Slot for UI overlays (calibration, quiz, etc.) -->
    <slot />
  </div>
</template>

<style scoped>
.scene-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(26, 26, 46, 0.9);
  z-index: 10;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.2);
  border-top-color: #4488ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-overlay {
  color: #ff6666;
}

.error-detail {
  font-size: 0.85rem;
  opacity: 0.7;
  margin-top: 8px;
}
</style>
