<script setup>
import { ref, computed } from 'vue'
import SceneView from './components/SceneView.vue'
import CalibrationPanel from './components/CalibrationPanel.vue'
import QuizPanel from './components/QuizPanel.vue'
import ReviewPanel from './components/ReviewPanel.vue'

/** Calibration tab is only available when ?calibrate appears in the URL */
const showCalibration = computed(() =>
  new URLSearchParams(window.location.search).has('calibrate')
)

// 'review' | 'justSign' | 'gameDay' | 'calibrate'
// "Just Sign" and "Game Day" are quiz sub-modes elevated to the top nav so
// the panel doesn't need its own mode-tabs row, saving precious mobile space.
const mode = ref('gameDay')
</script>

<template>
  <div class="app-layout" :class="{ 'panel-active': mode !== 'calibrate' }">

    <!-- Scene wrapper: flex-grows to fill available space on mobile -->
    <div class="scene-wrapper">
      <SceneView>
        <!-- Top navigation bar -->
        <nav class="mode-tabs">
          <button
            class="mode-tab"
            :class="{ active: mode === 'review' }"
            @click="mode = 'review'"
          >
            Review
          </button>
          <button
            class="mode-tab"
            :class="{ active: mode === 'justSign' }"
            @click="mode = 'justSign'"
          >
            Just Sign
          </button>
          <button
            class="mode-tab"
            :class="{ active: mode === 'gameDay' }"
            @click="mode = 'gameDay'"
          >
            Game Day
          </button>
          <button
            v-if="showCalibration"
            class="mode-tab"
            :class="{ active: mode === 'calibrate' }"
            @click="mode = 'calibrate'"
          >
            Calibrate
          </button>
        </nav>

        <!-- Review mode — component stays here for provide/inject;
             on mobile it teleports its DOM to #quiz-portal below -->
        <ReviewPanel v-if="mode === 'review'" />

        <!-- Quiz mode (both sub-modes share one component) -->
        <QuizPanel
          v-if="mode === 'justSign' || mode === 'gameDay'"
          :quiz-mode="mode"
        />

        <!-- Calibration mode — only mounted when ?calibrate is in the URL -->
        <CalibrationPanel v-if="mode === 'calibrate' && showCalibration" />
      </SceneView>
    </div>

    <!-- Mobile portal: panels teleport here on small screens,
         giving them their own non-overlapping space below the canvas. -->
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

/* ── Mobile: proper split layout — scene on top, panel below ── */
@media (max-width: 600px) {
  .app-layout.panel-active {
    display: flex;
    flex-direction: column;
  }

  /* scene-wrapper fills remaining height after the panel portal */
  .app-layout.panel-active .scene-wrapper {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
  }

  /* panel claims 50% of the screen (was 55% — freed by removing mode-tabs row) */
  #quiz-portal {
    flex: 0 0 50%;
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

/* ── Mobile: full-width header strip ──────────────────────── */
@media (max-width: 600px) {
  .mode-tabs {
    /* Span the full width of the scene area as a proper header strip */
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    padding: 6px 6px;
    gap: 4px;
    background: rgba(14, 14, 30, 0.92);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    box-sizing: border-box;
  }

  .mode-tab {
    /* Each tab expands to fill equal width */
    flex: 1;
    padding: 7px 4px;
    font-size: 0.8rem;
    border-radius: 7px;
    text-align: center;
    white-space: nowrap;
  }
}
</style>
