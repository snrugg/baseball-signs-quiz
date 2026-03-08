<script setup>
import { ref, computed, watch, inject, onMounted, onBeforeUnmount } from 'vue'

// ── quizMode comes from App.vue's top nav (replaces internal mode state) ──────
const props = defineProps({
  quizMode: { type: String, default: 'gameDay' }, // 'justSign' | 'gameDay'
})

const anchors   = inject('anchors')
const ik        = inject('ik')
const sequencer = inject('sequencer')
const signDefs  = inject('signDefs')

// ── Game Day settings ─────────────────────────────────────────────────────────
const gameDaySpeed   = ref(1.0)
const gameDayHold    = ref(0.25)  // seconds to pause at each sign (at 1× speed)
const sequenceLength = ref(10)
const settingsOpen   = ref(false) // sliders hidden by default

// ── State machine ─────────────────────────────────────────────────────────────
// 'idle' → 'playing' → 'answering' → 'feedback' → 'idle'
const quizState = ref('idle')

// Generation counter: incremented when quizMode changes so that any in-flight
// playSign await knows it has been superseded and should not transition state.
const generation = ref(0)

// When the parent switches quiz sub-mode via the top nav, reset to idle cleanly.
watch(() => props.quizMode, () => {
  generation.value++
  quizState.value    = 'idle'
  settingsOpen.value = false
  selectedChoice.value = null
  wasCorrect.value   = false
  currentSign.value  = null
})

// ── Current question ──────────────────────────────────────────────────────────
// currentSign holds the meaning string (e.g. "Hit & Run") — it IS the answer
const currentSign    = ref(null)
const choices        = ref([])
const selectedChoice = ref(null)
const wasCorrect     = ref(false)

// The correct answer is simply the current sign's meaning string
const correctAnswer  = computed(() => currentSign.value ?? '')

// ── Score ─────────────────────────────────────────────────────────────────────
const score = ref({ correct: 0, total: 0 })
const scoreDisplay = computed(() =>
  score.value.total === 0
    ? '—'
    : `${score.value.correct} / ${score.value.total}`
)

// ── Streak ────────────────────────────────────────────────────────────────────
const STREAK_KEY = 'baseballSigns_bestStreak'
const streak     = ref(0)
const bestStreak = ref(parseInt(localStorage.getItem(STREAK_KEY) ?? '0', 10))

function updateStreak(correct) {
  if (correct) {
    streak.value++
    if (streak.value > bestStreak.value) {
      bestStreak.value = streak.value
      localStorage.setItem(STREAK_KEY, String(bestStreak.value))
    }
  } else {
    streak.value = 0
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

function buildChoices(correctAns) {
  const all   = signDefs.signKeys.value
  const wrong = shuffle(all.filter(a => a !== correctAns)).slice(0, 3)
  return shuffle([correctAns, ...wrong])
}

function pickTarget() {
  const keys = signDefs.signKeys.value
  return keys[Math.floor(Math.random() * keys.length)]
}

function choiceClass(choice) {
  if (quizState.value !== 'feedback') return {}
  if (choice === correctAnswer.value) return { correct: true }
  if (choice === selectedChoice.value) return { wrong: true }
  return { dimmed: true }
}

// ── Replay state ──────────────────────────────────────────────────────────────
const lastAnchors     = ref([])
const lastPlayOptions = ref({})

// ── Just the Sign ─────────────────────────────────────────────────────────────
async function startJustSign() {
  const gen = ++generation.value
  currentSign.value  = pickTarget()
  choices.value      = buildChoices(currentSign.value)
  quizState.value    = 'playing'

  const seqAnchors = signDefs.getSignAnchors(currentSign.value)
  const seqOptions = { holdTime: 1.2, moveTime: 0.5 }
  lastAnchors.value     = seqAnchors
  lastPlayOptions.value = seqOptions

  await sequencer.playSign(seqAnchors, seqOptions)

  if (generation.value !== gen) return // quiz mode changed mid-play
  quizState.value = 'answering'
}

// ── Game Day ──────────────────────────────────────────────────────────────────
function buildGameDaySequence(meaning, N) {
  const allAnchors      = anchors.anchorNames.value
  const signAnchors     = signDefs.getSignAnchors(meaning)     // e.g. ['leftArm'] or ['leftEar','nose']
  const indicatorAnchor = signDefs.indicator.value
  const decoyPool       = allAnchors.filter(a =>
    a !== indicatorAnchor && !signAnchors.includes(a)
  )

  // Ensure room for: 1+ decoy before indicator + indicator + all sign anchors + 1+ decoy after
  const maxIndicatorPos = N - signAnchors.length - 1
  const indicatorPos    = 1 + Math.floor(Math.random() * Math.max(1, maxIndicatorPos - 1))

  return Array.from({ length: N }, (_, i) => {
    if (i === indicatorPos) return indicatorAnchor
    const signOffset = i - indicatorPos - 1
    if (signOffset >= 0 && signOffset < signAnchors.length) return signAnchors[signOffset]
    return decoyPool[Math.floor(Math.random() * decoyPool.length)]
  })
}

async function startGameDay() {
  const gen = ++generation.value
  currentSign.value = pickTarget()
  choices.value     = buildChoices(currentSign.value)
  quizState.value   = 'playing'

  const seq     = buildGameDaySequence(currentSign.value, sequenceLength.value)
  const options = { holdTime: gameDayHold.value / gameDaySpeed.value, moveTime: 0.4 / gameDaySpeed.value }
  lastAnchors.value     = seq
  lastPlayOptions.value = options

  await sequencer.playSign(seq, options)

  if (generation.value !== gen) return // quiz mode changed mid-play
  quizState.value = 'answering'
}

// ── Replay ────────────────────────────────────────────────────────────────────
async function replaySign() {
  if (quizState.value !== 'answering') return
  const gen = ++generation.value
  quizState.value = 'playing'
  await sequencer.playSign(lastAnchors.value, lastPlayOptions.value)
  if (generation.value !== gen) return
  quizState.value = 'answering'
}

// ── Answer handling ───────────────────────────────────────────────────────────
function selectAnswer(choice) {
  if (quizState.value !== 'answering') return
  selectedChoice.value = choice
  wasCorrect.value = choice === correctAnswer.value
  score.value.total++
  if (wasCorrect.value) score.value.correct++
  updateStreak(wasCorrect.value)
  quizState.value = 'feedback'
}

function next() {
  selectedChoice.value = null
  wasCorrect.value = false
  currentSign.value = null
  quizState.value = 'idle'
}

function resetScore() {
  score.value = { correct: 0, total: 0 }
  streak.value = 0
}

function startQuiz() {
  if (!ik.ikReady.value || quizState.value !== 'idle') return
  if (props.quizMode === 'justSign') startJustSign()
  else startGameDay()
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
// Space  : play (idle) or next (feedback)
// 1–4    : select answer choice (answering state)
function onKeyDown(e) {
  // Don't intercept when an input/textarea is focused
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

  if (e.code === 'Space') {
    e.preventDefault()
    if (quizState.value === 'idle') startQuiz()
    else if (quizState.value === 'feedback') next()
    return
  }

  if (quizState.value === 'answering') {
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      replaySign()
      return
    }
    const idx = parseInt(e.key, 10) - 1
    if (idx >= 0 && idx < choices.value.length) {
      selectAnswer(choices.value[idx])
    }
  }
}

// ── Mobile teleport ───────────────────────────────────────────
// On narrow screens the quiz panel teleports into #quiz-portal (below the
// canvas in App.vue's flex layout) so it never overlaps the Three.js canvas.
// This eliminates both the character-centering problem and touch-event
// conflicts caused by the canvas's touch-action:none.
// Initialise synchronously so the Teleport knows its disabled state from the very
// first render — avoids a disabled→enabled flip in onMounted that confuses Vue's
// patchKeyedChildren when it tries to move Teleport slot content with a null anchor.
const isMobile = ref(window.innerWidth <= 600)
function checkMobile() { isMobile.value = window.innerWidth <= 600 }
onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template><Teleport to="#quiz-portal" :disabled="!isMobile" defer><div class="quiz-panel">

    <!-- Mobile streak bar — replaces panel-header (which is hidden on mobile) so
         score/streak are still visible while the quiz panel occupies the bottom half -->
    <div v-if="isMobile" class="mobile-streak-bar">
      <span
        class="mobile-streak-chip"
        :class="{ 'streak-hot': streak >= 3 }"
        title="Current streak · Best streak"
      >
        🔥 {{ streak }} · 🏆 {{ bestStreak }}
      </span>
      <button
        class="mobile-score-chip"
        @click="resetScore"
        title="Tap to reset score"
      >
        {{ scoreDisplay }}
      </button>
    </div>

    <!-- Header with score + streak (desktop only — hidden on mobile) -->
    <div class="panel-header">
      <h2>⚾ Sign Quiz</h2>
      <div class="header-badges">
        <span
          class="streak-badge"
          :class="{ 'streak-hot': streak >= 3 }"
          title="Current streak · Best streak"
        >
          🔥 {{ streak }} · 🏆 {{ bestStreak }}
        </span>
        <button class="score-badge" @click="resetScore" title="Click to reset score">
          {{ scoreDisplay }}
        </button>
      </div>
    </div>

    <!-- Game Day: indicator note (always visible) + collapsible sliders -->
    <transition name="slide-fade">
      <div v-if="props.quizMode === 'gameDay'" class="gameday-controls">
        <div class="indicator-note">
          Indicator: <strong>{{ anchors.ANCHOR_LABELS[signDefs.indicator.value] }}</strong>
        </div>
        <button
          class="settings-toggle"
          :disabled="quizState !== 'idle'"
          @click="settingsOpen = !settingsOpen"
          :aria-expanded="settingsOpen"
        >
          <span>Settings</span>
          <span class="chevron" :class="{ open: settingsOpen }">▾</span>
        </button>

        <transition name="slide-fade">
          <div v-if="settingsOpen" class="settings-block">
            <div class="setting-row">
              <label>Speed</label>
              <input
                type="range" min="0.25" max="4" step="0.25"
                v-model.number="gameDaySpeed"
                :disabled="quizState !== 'idle'"
              />
              <span class="setting-value">{{ gameDaySpeed.toFixed(2) }}×</span>
            </div>
            <div class="setting-row">
              <label>Pause</label>
              <input
                type="range" min="0" max="1.5" step="0.05"
                v-model.number="gameDayHold"
                :disabled="quizState !== 'idle'"
              />
              <span class="setting-value">{{ gameDayHold.toFixed(2) }}s</span>
            </div>
            <div class="setting-row">
              <label>Signs</label>
              <input
                type="range" min="5" max="15" step="1"
                v-model.number="sequenceLength"
                :disabled="quizState !== 'idle'"
              />
              <span class="setting-value">{{ sequenceLength }}</span>
            </div>
          </div>
        </transition>
      </div>
    </transition>

    <!-- Idle: hint + start button -->
    <div v-if="quizState === 'idle'" class="start-section">
      <p v-if="props.quizMode === 'justSign'" class="hint">
        Watch the sign, then identify the call.
      </p>
      <p v-else class="hint">
        Watch for the
        <strong>{{ anchors.ANCHOR_LABELS[signDefs.indicator.value] }}</strong>
        sign, then identify the call that follows it.
      </p>
      <button class="btn-start" @click="startQuiz" :disabled="!ik.ikReady.value">
        {{ ik.ikReady.value ? '▶  Play' : 'Loading...' }}
      </button>
      <div class="key-hint-row">
        <span class="key-chip">Space</span> to play
      </div>
    </div>

    <!-- Playing: live indicator -->
    <div v-if="quizState === 'playing'" class="playing-section">
      <div class="watch-row">
        <span class="pulse-dot"></span>
        <span>Watch carefully...</span>
      </div>
      <div v-if="props.quizMode === 'gameDay' && sequencer.currentStep.value >= 0" class="step-counter">
        Sign {{ sequencer.currentStep.value + 1 }}&thinsp;/&thinsp;{{ sequencer.currentSequence.value.length }}
      </div>
    </div>

    <!-- Answering + Feedback: multiple choice -->
    <div v-if="quizState === 'answering' || quizState === 'feedback'" class="answer-section">
      <p class="question">
        {{ props.quizMode === 'justSign' ? "What's the call?" : "What was the call after the indicator?" }}
      </p>

      <div class="choices">
        <button
          v-for="(choice, idx) in choices"
          :key="choice"
          class="choice-btn"
          :class="choiceClass(choice)"
          :disabled="quizState === 'feedback'"
          @click="selectAnswer(choice)"
        >
          <span class="choice-key">{{ idx + 1 }}</span>
          {{ choice }}
        </button>
      </div>

      <!-- Replay button (answering state only) -->
      <div v-if="quizState === 'answering'" class="replay-row">
        <button class="btn-replay" @click="replaySign">
          ↺ Replay
          <span class="key-chip key-chip-inline">R</span>
        </button>
      </div>

      <!-- Feedback row -->
      <transition name="pop">
        <div v-if="quizState === 'feedback'" class="feedback-section">
          <div class="result-banner" :class="wasCorrect ? 'result-correct' : 'result-wrong'">
            <span v-if="wasCorrect">
              ✓ Correct!
              <span v-if="streak >= 3" class="streak-bonus">🔥 {{ streak }} streak</span>
            </span>
            <span v-else>✗ It was: {{ correctAnswer }}</span>
          </div>
          <button class="btn-next" @click="next">
            Next →
            <span class="key-chip key-chip-inline">Space</span>
          </button>
        </div>
      </transition>
    </div>

  </div>
  </Teleport>
</template>


<style scoped>
/* (quiz-root wrapper removed — single Teleport is now the component root) */

.quiz-panel {
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
  color: #ddd;
}

/* ── Header ────────────────────────────────── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-header h2 {
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
}

.header-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.streak-badge {
  font-size: 0.72rem;
  font-family: monospace;
  color: #888;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  white-space: nowrap;
  transition: all 0.2s;
}

.streak-badge.streak-hot {
  color: #ffaa44;
  border-color: rgba(255, 150, 50, 0.35);
  background: rgba(255, 140, 30, 0.12);
}

.score-badge {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 0.8rem;
  font-family: monospace;
  color: #aaa;
  cursor: pointer;
  transition: all 0.15s;
}

.score-badge:hover {
  background: rgba(255, 68, 68, 0.15);
  border-color: rgba(255, 68, 68, 0.35);
  color: #ff7777;
}

/* ── Mode tabs ─────────────────────────────── */
.mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.mode-tab {
  flex: 1;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #777;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-tab:hover:not(:disabled) {
  color: #ccc;
  background: rgba(255, 255, 255, 0.1);
}

.mode-tab.active {
  background: rgba(68, 136, 255, 0.25);
  border-color: #4488ff;
  color: #fff;
}

.mode-tab:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── Game Day controls ─────────────────────── */
.gameday-controls {
  margin-bottom: 10px;
}

.indicator-note {
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 6px;
}

.indicator-note strong {
  color: #ffcc44;
}

.settings-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #888;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-toggle:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #bbb;
}

.settings-toggle:disabled {
  opacity: 0.4;
  cursor: default;
}

.chevron {
  display: inline-block;
  font-size: 0.8rem;
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.settings-block {
  padding: 8px 0 2px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.setting-row label {
  width: 36px;
  font-size: 0.75rem;
  color: #88aaff;
  font-family: monospace;
}

.setting-row input[type="range"] {
  flex: 1;
  height: 4px;
  accent-color: #4488ff;
}

.setting-value {
  width: 38px;
  text-align: right;
  font-family: monospace;
  font-size: 0.75rem;
  opacity: 0.7;
}

/* ── Idle / start ──────────────────────────── */
.start-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}

.hint {
  font-size: 0.8rem;
  color: #888;
  text-align: center;
  line-height: 1.5;
  margin: 0;
}

.hint strong {
  color: #ffcc44;
}

.btn-start {
  width: 100%;
  padding: 13px;
  background: #4488ff;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.5px;
}

.btn-start:hover:not(:disabled) {
  background: #3377ee;
  transform: translateY(-1px);
}

.btn-start:disabled {
  background: #2a2a4a;
  color: #555;
  cursor: default;
}

/* ── Keyboard hint ─────────────────────────── */
.key-hint-row {
  text-align: center;
  font-size: 0.7rem;
  color: #555;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.key-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.07);
  font-family: monospace;
  font-size: 0.68rem;
  color: #777;
}

.key-chip-inline {
  margin-left: 6px;
  opacity: 0.6;
}

/* ── Playing ───────────────────────────────── */
.playing-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 0;
}

.watch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #999;
  font-size: 0.85rem;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: #ff4444;
  border-radius: 50%;
  flex-shrink: 0;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.3; transform: scale(0.65); }
}

.step-counter {
  font-size: 0.75rem;
  font-family: monospace;
  color: #555;
}

/* ── Answer section ────────────────────────── */
.answer-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.question {
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  text-align: center;
  margin: 0;
}

.choices {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.choice-btn {
  width: 100%;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.12s;
}

.choice-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.13);
  border-color: rgba(255, 255, 255, 0.22);
  color: #fff;
}

.choice-btn:disabled { cursor: default; }

.choice-btn.correct {
  background: rgba(50, 190, 90, 0.25);
  border-color: #44cc66;
  color: #55ee77;
}

.choice-btn.wrong {
  background: rgba(255, 60, 60, 0.2);
  border-color: #ff4444;
  color: #ff7777;
}

.choice-btn.dimmed {
  opacity: 0.3;
}

/* Number badge on each choice */
.choice-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.07);
  font-size: 0.65rem;
  font-family: monospace;
  color: #777;
  flex-shrink: 0;
}

.choice-btn.correct .choice-key,
.choice-btn.wrong .choice-key,
.choice-btn.dimmed .choice-key {
  display: none;
}

/* ── Feedback ──────────────────────────────── */
.feedback-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-banner {
  padding: 10px 16px;
  border-radius: 9px;
  font-weight: 600;
  font-size: 0.9rem;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.streak-bonus {
  font-size: 0.8rem;
  font-weight: 500;
  opacity: 0.85;
}

.result-correct {
  background: rgba(50, 190, 90, 0.2);
  border: 1px solid #44cc66;
  color: #55ee77;
}

.result-wrong {
  background: rgba(255, 60, 60, 0.15);
  border: 1px solid #ff4444;
  color: #ff8888;
}

.btn-next {
  width: 100%;
  padding: 10px;
  background: rgba(255, 255, 255, 0.07);
  color: #bbb;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 9px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-next:hover {
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
}

/* ── Replay ────────────────────────────────── */
.replay-row {
  display: flex;
  justify-content: center;
}

.btn-replay {
  padding: 5px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #666;
  font-size: 0.78rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}

.btn-replay:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.18);
  color: #aaa;
}

/* ── Transitions ───────────────────────────── */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease, max-height 0.25s ease;
  max-height: 200px;
  overflow: hidden;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}

.pop-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.pop-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

/* ── Mobile streak bar (inside quiz panel, replaces hidden panel-header) ── */
.mobile-streak-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.mobile-streak-chip {
  font-size: 0.72rem;
  font-family: monospace;
  color: #888;
  padding: 4px 10px;
  background: rgba(14, 14, 30, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  white-space: nowrap;
  backdrop-filter: blur(8px);
  transition: all 0.2s;
}

.mobile-streak-chip.streak-hot {
  color: #ffaa44;
  border-color: rgba(255, 150, 50, 0.4);
  background: rgba(30, 18, 8, 0.9);
}

.mobile-score-chip {
  font-size: 0.72rem;
  font-family: monospace;
  color: #777;
  padding: 4px 10px;
  background: rgba(14, 14, 30, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  white-space: nowrap;
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.15s;
}

.mobile-score-chip:hover {
  color: #ff7777;
  border-color: rgba(255, 68, 68, 0.35);
  background: rgba(40, 10, 10, 0.9);
}

/* ── Mobile ────────────────────────────────── */
/* On mobile the quiz panel teleports to #quiz-portal, which sits BELOW
   the canvas in a flex-column layout (see App.vue).  The panel therefore
   fills its own space — no absolute positioning or max-height needed.
   The quiz sub-mode (Just Sign / Game Day) now lives in the top nav bar,
   so the panel-header and mode-tabs rows are hidden to reclaim space for
   the four answer choices + Next button. */
@media (max-width: 600px) {
  .quiz-panel {
    position: relative;
    top: auto; right: auto; bottom: auto; left: auto;
    width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 12px 12px 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    padding: 10px 12px;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Mode is shown in top nav — title is redundant on mobile */
  .panel-header { display: none; }

  /* Keyboard hints are irrelevant on touch devices */
  .key-hint-row { display: none; }

  /* Tighter vertical rhythm so all 4 choices + Next fit without scrolling */
  .answer-section { gap: 8px; }
  .choices { gap: 4px; }
  .choice-btn { padding: 8px 10px; }
  .feedback-section { gap: 6px; }
  .start-section { gap: 8px; }
  .gameday-controls { margin-bottom: 8px; }
  .indicator-note { display: none; }
  .btn-start { padding: 11px; font-size: 0.95rem; }
}
</style>
