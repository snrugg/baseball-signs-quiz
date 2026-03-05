<script setup>
import { ref, inject, watch } from 'vue'

const scene = inject('scene')
const anchors = inject('anchors')
const ik = inject('ik')
const sequencer = inject('sequencer')

const selectedAnchor = ref(null)
const spheresVisible = ref(true)
const animSpeed = ref(1.0)  // playback speed multiplier (1 = normal, 2 = 2× faster)

// Initialize spheres once model is loaded
watch(
  () => scene.loading.value,
  (loading) => {
    if (!loading && !scene.loadError.value) {
      const s = scene.getScene()
      if (s) {
        anchors.createSpheres(s)
        anchors.setSpheresVisible(true)
      }
    }
  },
  { immediate: true }
)

function toggleSpheres() {
  spheresVisible.value = !spheresVisible.value
  anchors.setSpheresVisible(spheresVisible.value)
}

function selectAnchor(name) {
  selectedAnchor.value = name
  if (ik.ikReady.value) {
    sequencer.moveToAnchor(name, 0.5 / animSpeed.value)
  }
}

function onOffsetChange(name, axis, event) {
  const val = parseFloat(event.target.value)
  if (!isNaN(val)) {
    anchors.setAnchorOffset(name, axis, val)
  }
}

/**
 * Live-update the hand rotation while dragging a rotation slider.
 * Stores the value in the anchor data AND immediately applies it to the IK
 * so the user sees the effect in real time.
 */
function onRotationChange(name, axis, event) {
  const val = parseFloat(event.target.value)
  if (isNaN(val)) return
  anchors.setAnchorRotation(name, axis, val)
  // Push all three axes immediately so the IK solver sees the full rotation
  const [rx, ry, rz] = anchors.getAnchorRotation(name)
  ik.setHandRotation(rx, ry, rz)
}

/**
 * Compute a smart-default rotation that makes the palm face inward toward
 * the model, then store it and apply it.
 */
function autoRotation(name) {
  const pos = anchors.getAnchorWorldPos(name)
  if (!pos) return
  const [rx, ry, rz] = ik.computeAutoHandRotation(pos)
  anchors.setAnchorRotation(name, 'x', rx)
  anchors.setAnchorRotation(name, 'y', ry)
  anchors.setAnchorRotation(name, 'z', rz)
  ik.setHandRotation(rx, ry, rz)
}

/**
 * Reset the hand rotation for the selected anchor to [0, 0, 0] (natural IK pose).
 */
function resetRotation(name) {
  anchors.setAnchorRotation(name, 'x', 0)
  anchors.setAnchorRotation(name, 'y', 0)
  anchors.setAnchorRotation(name, 'z', 0)
  ik.setHandRotation(0, 0, 0)
}

function save() {
  anchors.saveOffsets()
  alert('Anchor offsets saved!')
}

function reset() {
  if (confirm('Reset all anchors to defaults?')) {
    anchors.resetOffsets()
    selectedAnchor.value = null
    ik.setHandRotation(0, 0, 0)
  }
}

function testSequence() {
  sequencer.playSign(['billOfCap', 'chest', 'belt'], {
    holdTime: 0.4 / animSpeed.value,
    moveTime: 0.35 / animSpeed.value,
  })
}

function testAllAnchors() {
  const allNames = anchors.anchorNames.value
  sequencer.playSign(allNames, {
    holdTime: 0.6 / animSpeed.value,
    moveTime: 0.4 / animSpeed.value,
  })
}
</script>

<template>
  <div class="calibration-panel">
    <div class="panel-header">
      <h2>Anchor Calibration</h2>
      <div class="header-actions">
        <button class="btn btn-sm" @click="toggleSpheres">
          {{ spheresVisible ? 'Hide' : 'Show' }} Markers
        </button>
      </div>
    </div>

    <!-- Model transform controls -->
    <div class="transform-controls">
      <div class="offset-row">
        <label title="Rotate">&#x21BB;</label>
        <input
          type="range"
          :min="-Math.PI"
          :max="Math.PI"
          step="0.02"
          :value="scene.modelRotation.value"
          @input="scene.setModelRotation(parseFloat($event.target.value))"
        />
        <span class="offset-value">{{ (scene.modelRotation.value * 180 / Math.PI).toFixed(0) }}&deg;</span>
      </div>
      <div class="offset-row">
        <label title="Move left/right">&#x2194;</label>
        <input
          type="range"
          :min="-1.5"
          :max="1.5"
          step="0.01"
          :value="scene.modelOffsetX.value"
          @input="scene.setModelOffsetX(parseFloat($event.target.value))"
        />
        <span class="offset-value">{{ scene.modelOffsetX.value.toFixed(2) }}</span>
      </div>
      <div class="offset-row">
        <label title="Animation speed" class="speed-label">▶▶</label>
        <input
          type="range"
          min="0.25"
          max="4"
          step="0.25"
          v-model.number="animSpeed"
        />
        <span class="offset-value">{{ animSpeed.toFixed(2) }}&times;</span>
      </div>
    </div>

    <!-- Anchor list -->
    <div class="anchor-list">
      <button
        v-for="name in anchors.anchorNames.value"
        :key="name"
        class="anchor-btn"
        :class="{ active: selectedAnchor === name }"
        @click="selectAnchor(name)"
      >
        {{ anchors.ANCHOR_LABELS[name] || name }}
      </button>
    </div>

    <!-- Offset + rotation editor for selected anchor -->
    <div v-if="selectedAnchor" class="offset-editor">
      <h3>{{ anchors.ANCHOR_LABELS[selectedAnchor] }}</h3>
      <p class="bone-name">
        Bone: {{ anchors.anchorDefs.value[selectedAnchor]?.bone }}
      </p>

      <!-- Position sliders -->
      <div class="section-label">Position</div>
      <div class="offset-row" v-for="axis in ['x', 'y', 'z']" :key="'pos-' + axis">
        <label>{{ axis.toUpperCase() }}</label>
        <input
          type="range"
          :min="-0.4"
          :max="0.4"
          step="0.005"
          :value="anchors.anchorDefs.value[selectedAnchor]?.offset[{x:0,y:1,z:2}[axis]]"
          @input="onOffsetChange(selectedAnchor, axis, $event)"
        />
        <span class="offset-value">
          {{ anchors.anchorDefs.value[selectedAnchor]?.offset[{x:0,y:1,z:2}[axis]]?.toFixed(3) }}
        </span>
      </div>

      <!-- Rotation sliders -->
      <div class="section-label rotation-label">
        Hand Rotation
        <span class="rot-actions">
          <button class="btn-inline" @click="autoRotation(selectedAnchor)" title="Aim palm toward body">Auto</button>
          <button class="btn-inline btn-inline-reset" @click="resetRotation(selectedAnchor)" title="Remove rotation override">✕</button>
        </span>
      </div>
      <div
        class="offset-row"
        v-for="(axis, idx) in ['x', 'y', 'z']"
        :key="'rot-' + axis"
      >
        <label class="rot-label">R{{ axis.toUpperCase() }}</label>
        <input
          type="range"
          :min="-180"
          :max="180"
          step="1"
          :value="anchors.anchorDefs.value[selectedAnchor]?.rotation?.[idx] ?? 0"
          @input="onRotationChange(selectedAnchor, axis, $event)"
        />
        <span class="offset-value">
          {{ (anchors.anchorDefs.value[selectedAnchor]?.rotation?.[idx] ?? 0).toFixed(0) }}&deg;
        </span>
      </div>
    </div>

    <!-- Actions -->
    <div class="panel-actions">
      <button class="btn btn-primary" @click="testSequence" :disabled="!ik.ikReady.value || sequencer.isPlaying.value">
        Test: Cap → Chest → Belt
      </button>
      <button class="btn btn-secondary" @click="testAllAnchors" :disabled="!ik.ikReady.value || sequencer.isPlaying.value">
        Test All Anchors
      </button>
      <div class="save-row">
        <button class="btn btn-success" @click="save">Save Offsets</button>
        <button class="btn btn-danger" @click="reset">Reset</button>
      </div>
    </div>

    <!-- Status -->
    <div class="status-bar">
      <span :class="ik.ikReady.value ? 'status-ok' : 'status-wait'">
        IK: {{ ik.ikReady.value ? 'Ready' : 'Initializing...' }}
      </span>
      <span v-if="sequencer.isPlaying.value" class="status-playing">
        Playing step {{ sequencer.currentStep.value + 1 }} / {{ sequencer.currentSequence.value.length }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.calibration-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 280px;
  max-height: calc(100% - 24px);
  overflow-y: auto;
  background: rgba(20, 20, 40, 0.92);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 20;
  font-size: 0.85rem;
}

.transform-controls {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
}

.transform-controls .offset-row label {
  font-size: 1rem;
  width: 20px;
  text-align: center;
}

.speed-label {
  font-size: 0.6rem !important;
  letter-spacing: -1px;
  opacity: 0.8;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-header h2 {
  font-size: 1rem;
  font-weight: 600;
}

.anchor-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.anchor-btn {
  padding: 4px 8px;
  font-size: 0.75rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: #ccc;
  cursor: pointer;
  transition: all 0.15s;
}

.anchor-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.anchor-btn.active {
  background: rgba(68, 136, 255, 0.3);
  border-color: #4488ff;
  color: #fff;
}

.offset-editor {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.offset-editor h3 {
  font-size: 0.9rem;
  margin-bottom: 4px;
}

.bone-name {
  font-size: 0.7rem;
  opacity: 0.5;
  margin-bottom: 8px;
  font-family: monospace;
}

/* Section divider labels inside the offset editor */
.section-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #88aaff;
  opacity: 0.7;
  margin: 10px 0 4px;
}

.section-label:first-of-type {
  margin-top: 0;
}

.rotation-label {
  color: #ffaa44;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Inline action buttons beside the Rotation label */
.rot-actions {
  display: flex;
  gap: 4px;
}

.btn-inline {
  padding: 1px 7px;
  font-size: 0.68rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 170, 68, 0.4);
  background: rgba(255, 170, 68, 0.12);
  color: #ffaa44;
  cursor: pointer;
  transition: all 0.12s;
}

.btn-inline:hover {
  background: rgba(255, 170, 68, 0.28);
}

.btn-inline-reset {
  border-color: rgba(255, 100, 100, 0.35);
  background: rgba(255, 100, 100, 0.1);
  color: #ff8888;
}

.btn-inline-reset:hover {
  background: rgba(255, 100, 100, 0.25);
}

.offset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.offset-row label {
  width: 16px;
  font-weight: 600;
  font-family: monospace;
  color: #88aaff;
}

/* Rotation axis labels use amber instead of blue */
.rot-label {
  color: #ffaa44 !important;
}

.offset-row input[type="range"] {
  flex: 1;
  height: 4px;
  accent-color: #4488ff;
}

/* Rotation sliders get amber accent */
.offset-row:has(.rot-label) input[type="range"] {
  accent-color: #ffaa44;
}

.offset-value {
  width: 50px;
  text-align: right;
  font-family: monospace;
  font-size: 0.75rem;
  opacity: 0.7;
}

.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.save-row {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 0.7rem;
}

.btn-primary {
  background: #4488ff;
  color: #fff;
}
.btn-primary:hover { background: #3377ee; }
.btn-primary:disabled { background: #334; color: #666; cursor: default; }

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
}
.btn-secondary:hover { background: rgba(255, 255, 255, 0.18); }
.btn-secondary:disabled { color: #555; cursor: default; }

.btn-success {
  background: #44aa66;
  color: #fff;
  flex: 1;
}
.btn-success:hover { background: #3a9959; }

.btn-danger {
  background: rgba(255, 68, 68, 0.2);
  color: #ff6666;
  border: 1px solid rgba(255, 68, 68, 0.3);
}
.btn-danger:hover { background: rgba(255, 68, 68, 0.35); }

.status-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  font-family: monospace;
}

.status-ok { color: #44ff66; }
.status-wait { color: #ffaa44; }
.status-playing { color: #44aaff; }

/* Mobile: move panel to bottom */
@media (max-width: 600px) {
  .calibration-panel {
    top: auto;
    bottom: 0;
    right: 0;
    left: 0;
    width: 100%;
    max-height: 50%;
    border-radius: 12px 12px 0 0;
  }
}
</style>
