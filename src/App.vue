<script setup>
import { ref } from 'vue'
import SceneView from './components/SceneView.vue'
import CalibrationPanel from './components/CalibrationPanel.vue'
import QuizPanel from './components/QuizPanel.vue'

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

    <!-- Quiz mode -->
    <QuizPanel v-if="mode === 'quiz'" />
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
</style>
