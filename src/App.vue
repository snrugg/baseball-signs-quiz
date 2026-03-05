<script setup>
import { ref } from 'vue'
import SceneView from './components/SceneView.vue'
import CalibrationPanel from './components/CalibrationPanel.vue'

const mode = ref('calibrate') // 'calibrate' | 'quiz' (quiz coming later)
</script>

<template>
  <SceneView>
    <!-- Mode selector -->
    <div class="mode-tabs">
      <button
        class="mode-tab"
        :class="{ active: mode === 'calibrate' }"
        @click="mode = 'calibrate'"
      >
        Calibrate
      </button>
      <button
        class="mode-tab"
        :class="{ active: mode === 'quiz' }"
        @click="mode = 'quiz'"
      >
        Quiz
      </button>
    </div>

    <!-- Calibration mode -->
    <CalibrationPanel v-if="mode === 'calibrate'" />

    <!-- Quiz mode (placeholder) -->
    <div v-if="mode === 'quiz'" class="quiz-placeholder">
      <p>Quiz mode coming soon</p>
      <p class="hint">Calibrate your anchor points first</p>
    </div>
  </SceneView>
</template>

<style scoped>
.mode-tabs {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  gap: 4px;
  z-index: 20;
}

.mode-tab {
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(20, 20, 40, 0.85);
  color: #999;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
  backdrop-filter: blur(8px);
}

.mode-tab:hover {
  color: #ccc;
  background: rgba(30, 30, 60, 0.9);
}

.mode-tab.active {
  color: #fff;
  background: rgba(68, 136, 255, 0.3);
  border-color: #4488ff;
}

.quiz-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  background: rgba(20, 20, 40, 0.85);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  padding: 32px 48px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 20;
}

.quiz-placeholder p {
  font-size: 1.1rem;
  margin-bottom: 8px;
}

.quiz-placeholder .hint {
  font-size: 0.85rem;
  opacity: 0.5;
}
</style>
