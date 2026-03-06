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
  playSign,
  moveToAnchor,
  moveToSequence,
  moveToRest,
  stop,
  initPosition,
} = useSequencer(getAnchorWorldPos, getAnchorRotation, getAnchorLeftArm, getAnchorRightArm, getModelForward, setTarget, setHandRotation, setLeftArmPose, setPoleOffset, onFrame, setIKEnabled, getHandWorldPos)

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
