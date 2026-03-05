<script setup>
import { ref } from 'vue'
import SceneView from './components/SceneView.vue'
import CalibrationPanel from './components/CalibrationPanel.vue'
import QuizPanel from './components/QuizPanel.vue'

const mode = ref('calibrate') // 'calibrate' | 'quiz'
</script>

<template>
  <div class="app-layout" :class="{ 'quiz-active': mode === 'quiz' }">

    <!-- Scene wrapper: flex-grows to fill available space on mobile -->
    <div class="scene-wrapper">
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

        <!-- Quiz mode — component stays here for provide/inject;
             on mobile it teleports its DOM to #quiz-portal below -->
        <QuizPanel v-if="mode === 'quiz'" />
      </SceneView>
    </div>

    <!-- Mobile quiz portal: quiz panel teleports here on small screens,
         giving it its own non-overlapping space below the canvas. -->
    <div id="quiz-portal"></div>

  </div>
</template>

<style scoped>
.app-layout {
  width: 100%;
  height: 100%;
  position: relative;
}

.scene-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

/* ── Mobile: proper split layout — scene on top, quiz below ── */
@media (max-width: 600px) {
  .app-layout.quiz-active {
    display: flex;
    flex-direction: column;
  }

  /* scene-wrapper fills remaining height after quiz portal */
  .app-layout.quiz-active .scene-wrapper {
    flex: 1 1 0;
    min-height: 0;
    height: auto; /* let flexbox drive the height */
  }

  /* quiz-portal claims 55% of the screen */
  #quiz-portal {
    flex: 0 0 55%;
    overflow: hidden;
    background: rgba(20, 20, 40, 0.92);
  }
}

/* ── Mode tabs ─────────────────────────────────────────────── */
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
