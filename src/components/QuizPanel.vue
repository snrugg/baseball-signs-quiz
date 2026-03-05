<script setup>
import { ref, computed, inject } from 'vue'
import { SIGN_MEANINGS, INDICATOR } from '../data/signs.js'

const anchors  = inject('anchors')
const ik       = inject('ik')
const sequencer = inject('sequencer')

// ── Mode ──────────────────────────────────────────────────────────────────────
const mode = ref('justSign')  // 'justSign' | 'gameDay'

// ── Game Day settings ─────────────────────────────────────────────────────────
const gameDaySpeed   = ref(1.0)
const gameDayHold    = ref(0.6)   // seconds to pause at each sign (at 1× speed)
const sequenceLength = ref(8)

// ── State machine ─────────────────────────────────────────────────────────────
// 'idle' → 'playing' → 'answering' → 'feedback' → 'idle'
const quizState = ref('idle')

// ── Current question ──────────────────────────────────────────────────────────
const currentSign    = ref(null)   // anchor name of the target sign
const choices        = ref([])     // 4 shuffled answer strings
const selectedChoice = ref(null)
const wasCorrect     = ref(false)
const correctAnswer  = computed(() =>
  currentSign.value ? SIGN_MEANINGS[currentSign.value] : ''
)

// ── Score ─────────────────────────────────────────────────────────────────────
const score = ref({ correct: 0, total: 0 })
const scoreDisplay = computed(() =>
  score.value.total === 0
    ? '—'
    : `${score.value.correct} / ${score.value.total}`
)

// ── Helpers ───────────────────────────────────────────────────────────────────
const meaningfulSigns = Object.keys(SIGN_MEANINGS)
const allAnswers      = Object.values(SIGN_MEANINGS)

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

function buildChoices(correctAns) {
  const wrong = shuffle(allAnswers.filter(a => a !== correctAns)).slice(0, 3)
  return shuffle([correctAns, ...wrong])
}

function pickTarget() {
  return meaningfulSigns[Math.floor(Math.random() * meaningfulSigns.length)]
}

function choiceClass(choice) {
  if (quizState.value !== 'feedback') return {}
  if (choice === correctAnswer.value) return { correct: true }
  if (choice === selectedChoice.value) return { wrong: true }
  return { dimmed: true }
}

// ── Just the Sign ─────────────────────────────────────────────────────────────
async function startJustSign() {
  currentSign.value = pickTarget()
  choices.value = buildChoices(SIGN_MEANINGS[currentSign.value])
  quizState.value = 'playing'

  await sequencer.playSign([currentSign.value], {
    holdTime: 1.2,
    moveTime: 0.5,
  })

  quizState.value = 'answering'
}

// ── Game Day ──────────────────────────────────────────────────────────────────
function buildGameDaySequence(target, N) {
  const allAnchors = anchors.anchorNames.value
  // Decoy pool: everything except the indicator and the target (target appears only once)
  const decoyPool = allAnchors.filter(a => a !== INDICATOR && a !== target)

  // Indicator position: not first, not last two (need room for target after it)
  const indicatorPos = 1 + Math.floor(Math.random() * (N - 2))

  return Array.from({ length: N }, (_, i) => {
    if (i === indicatorPos)     return INDICATOR
    if (i === indicatorPos + 1) return target
    return decoyPool[Math.floor(Math.random() * decoyPool.length)]
  })
}

async function startGameDay() {
  currentSign.value = pickTarget()
  choices.value = buildChoices(SIGN_MEANINGS[currentSign.value])
  quizState.value = 'playing'

  const seq = buildGameDaySequence(currentSign.value, sequenceLength.value)

  await sequencer.playSign(seq, {
    holdTime: gameDayHold.value / gameDaySpeed.value,
    moveTime: 0.4 / gameDaySpeed.value,
  })

  quizState.value = 'answering'
}

// ── Answer handling ───────────────────────────────────────────────────────────
function selectAnswer(choice) {
  if (quizState.value !== 'answering') return
  selectedChoice.value = choice
  wasCorrect.value = choice === correctAnswer.value
  score.value.total++
  if (wasCorrect.value) score.value.correct++
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
}

function startQuiz() {
  if (!ik.ikReady.value || quizState.value !== 'idle') return
  if (mode.value === 'justSign') startJustSign()
  else startGameDay()
}
</script>

<template>
  <div class="quiz-panel">

    <!-- Header with score -->
    <div class="panel-header">
      <h2>⚾ Sign Quiz</h2>
      <button class="score-badge" @click="resetScore" title="Click to reset score">
        {{ scoreDisplay }}
      </button>
    </div>

    <!-- Mode selector -->
    <div class="mode-tabs">
      <button
        class="mode-tab"
        :class="{ active: mode === 'justSign' }"
        :disabled="quizState !== 'idle'"
        @click="mode = 'justSign'"
      >
        Just the Sign
      </button>
      <button
        class="mode-tab"
        :class="{ active: mode === 'gameDay' }"
        :disabled="quizState !== 'idle'"
        @click="mode = 'gameDay'"
      >
        Game Day
      </button>
    </div>

    <!-- Game Day settings -->
    <transition name="slide-fade">
      <div v-if="mode === 'gameDay'" class="settings-block">
        <div class="indicator-note">
          Indicator: <strong>{{ anchors.ANCHOR_LABELS[INDICATOR] }}</strong>
        </div>
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

    <!-- Idle: hint + start button -->
    <div v-if="quizState === 'idle'" class="start-section">
      <p v-if="mode === 'justSign'" class="hint">
        Watch the sign, then identify the call.
      </p>
      <p v-else class="hint">
        Watch for the
        <strong>{{ anchors.ANCHOR_LABELS[INDICATOR] }}</strong>
        sign, then identify the call that follows it.
      </p>
      <button class="btn-start" @click="startQuiz" :disabled="!ik.ikReady.value">
        {{ ik.ikReady.value ? '▶  Play' : 'Loading...' }}
      </button>
    </div>

    <!-- Playing: live indicator -->
    <div v-if="quizState === 'playing'" class="playing-section">
      <div class="watch-row">
        <span class="pulse-dot"></span>
        <span>Watch carefully...</span>
      </div>
      <div v-if="mode === 'gameDay' && sequencer.currentStep.value >= 0" class="step-counter">
        Sign {{ sequencer.currentStep.value + 1 }}&thinsp;/&thinsp;{{ sequencer.currentSequence.value.length }}
      </div>
    </div>

    <!-- Answering + Feedback: multiple choice -->
    <div v-if="quizState === 'answering' || quizState === 'feedback'" class="answer-section">
      <p class="question">
        {{ mode === 'justSign' ? "What's the call?" : "What was the call after the indicator?" }}
      </p>

      <div class="choices">
        <button
          v-for="choice in choices"
          :key="choice"
          class="choice-btn"
          :class="choiceClass(choice)"
          :disabled="quizState === 'feedback'"
          @click="selectAnswer(choice)"
        >
          {{ choice }}
        </button>
      </div>

      <!-- Feedback row -->
      <transition name="pop">
        <div v-if="quizState === 'feedback'" class="feedback-section">
          <div class="result-banner" :class="wasCorrect ? 'result-correct' : 'result-wrong'">
            {{ wasCorrect ? '✓ Correct!' : `✗ It was: ${correctAnswer}` }}
          </div>
          <button class="btn-next" @click="next">Next →</button>
        </div>
      </transition>
    </div>

  </div>
</template>

<style scoped>
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
  margin-bottom: 12px;
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

/* ── Game Day settings ─────────────────────── */
.settings-block {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.indicator-note {
  font-size: 0.75rem;
  color: #999;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.indicator-note strong {
  color: #ffcc44;
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
  gap: 12px;
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
  padding: 11px 16px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
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
}

.btn-next:hover {
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
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

/* ── Mobile ────────────────────────────────── */
@media (max-width: 600px) {
  .quiz-panel {
    top: auto;
    bottom: 0;
    right: 0;
    left: 0;
    width: 100%;
    max-height: 55%;
    border-radius: 12px 12px 0 0;
  }
}
</style>
