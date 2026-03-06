<script setup>
import { ref, computed, inject, onMounted, onBeforeUnmount } from 'vue'

const signDefs  = inject('signDefs')
const sequencer = inject('sequencer')
const anchors   = inject('anchors')

// ── Sub-mode ───────────────────────────────────────────────────────────────
const subMode = ref('list')  // 'list' | 'flashcard'

// ── List mode ──────────────────────────────────────────────────────────────
const activeMeaning = ref(null)

function selectSign(meaning) {
  activeMeaning.value = meaning
  sequencer.moveToSequence(signDefs.getSignAnchors(meaning))
}

// ── Flashcard mode ─────────────────────────────────────────────────────────
const cardIndex = ref(0)
const revealed  = ref(false)

const currentMeaning = computed(() =>
  signDefs.signKeys.value[cardIndex.value] ?? null
)
const total = computed(() => signDefs.signKeys.value.length)

function showSign() {
  revealed.value = true
  if (currentMeaning.value) {
    sequencer.moveToSequence(signDefs.getSignAnchors(currentMeaning.value))
  }
}

function hideSign() {
  revealed.value = false
  sequencer.moveToRest()
}

function prevCard() {
  cardIndex.value = (cardIndex.value - 1 + total.value) % total.value
  revealed.value  = false
}

function nextCard() {
  cardIndex.value = (cardIndex.value + 1) % total.value
  revealed.value  = false
}

// ── Mobile teleport ────────────────────────────────────────────────────────
// On narrow screens the review panel teleports into #quiz-portal (below the
// canvas in App.vue's flex layout) so it never overlaps the Three.js canvas.
const isMobile = ref(false)
function checkMobile() { isMobile.value = window.innerWidth <= 600 }
onMounted(() => { checkMobile(); window.addEventListener('resize', checkMobile) })
onBeforeUnmount(() => window.removeEventListener('resize', checkMobile))
</script>

<template>
  <Teleport to="#quiz-portal" :disabled="!isMobile">
  <div class="review-panel">

    <!-- Header -->
    <div class="panel-header">
      <h2>📋 Sign Review</h2>
    </div>

    <!-- Sub-mode tabs -->
    <div class="sub-tabs">
      <button
        class="sub-tab"
        :class="{ active: subMode === 'list' }"
        @click="subMode = 'list'"
      >
        List
      </button>
      <button
        class="sub-tab"
        :class="{ active: subMode === 'flashcard' }"
        @click="subMode = 'flashcard'"
      >
        Flashcard
      </button>
    </div>

    <!-- ── List mode ─────────────────────────────────────────── -->
    <div v-if="subMode === 'list'" class="sign-list">
      <button
        v-for="meaning in signDefs.signKeys.value"
        :key="meaning"
        class="sign-row"
        :class="{ active: activeMeaning === meaning }"
        @click="selectSign(meaning)"
      >
        <span class="sign-meaning">{{ meaning }}</span>
        <span class="sign-anchors">
          {{ signDefs.formatSignLabel(signDefs.getSignAnchors(meaning), anchors.ANCHOR_LABELS) }}
        </span>
      </button>
    </div>

    <!-- ── Flashcard mode ────────────────────────────────────── -->
    <div v-else class="flashcard">
      <div class="card-counter">{{ cardIndex + 1 }} / {{ total }}</div>

      <div class="card-meaning">{{ currentMeaning }}</div>

      <transition name="reveal-fade">
        <div v-if="revealed" class="card-anchors">
          {{ signDefs.formatSignLabel(signDefs.getSignAnchors(currentMeaning), anchors.ANCHOR_LABELS) }}
        </div>
      </transition>

      <div class="card-actions">
        <button v-if="!revealed" class="btn-reveal" @click="showSign">
          Show Sign ▶
        </button>
        <button v-else class="btn-hide" @click="hideSign">
          Hide
        </button>
      </div>

      <div class="nav-row">
        <button class="btn-nav" @click="prevCard">← Prev</button>
        <button class="btn-nav" @click="nextCard">Next →</button>
      </div>
    </div>

  </div>
  </Teleport>
</template>

<style scoped>
.review-panel {
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
  margin-bottom: 12px;
}

.panel-header h2 {
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
}

/* ── Sub-mode tabs ─────────────────────────── */
.sub-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.sub-tab {
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

.sub-tab:hover {
  color: #ccc;
  background: rgba(255, 255, 255, 0.1);
}

.sub-tab.active {
  background: rgba(68, 136, 255, 0.25);
  border-color: #4488ff;
  color: #fff;
}

/* ── List mode ─────────────────────────────── */
.sign-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sign-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  text-align: left;
  transition: all 0.12s;
}

.sign-row:hover {
  background: rgba(255, 255, 255, 0.10);
  border-color: rgba(255, 255, 255, 0.18);
}

.sign-row.active {
  background: rgba(68, 136, 255, 0.2);
  border-color: #4488ff;
}

.sign-meaning {
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
}

.sign-anchors {
  font-size: 0.72rem;
  color: #88aaff;
  font-family: monospace;
}

/* ── Flashcard mode ────────────────────────── */
.flashcard {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
}

.card-counter {
  text-align: center;
  font-size: 0.72rem;
  font-family: monospace;
  color: #555;
}

.card-meaning {
  padding: 20px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.3;
}

.card-anchors {
  text-align: center;
  font-size: 0.78rem;
  font-family: monospace;
  color: #88aaff;
  padding: 8px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.card-actions {
  display: flex;
  justify-content: center;
}

.btn-reveal {
  padding: 11px 24px;
  border-radius: 10px;
  border: none;
  background: #4488ff;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.3px;
}

.btn-reveal:hover {
  background: #3377ee;
  transform: translateY(-1px);
}

.btn-hide {
  padding: 11px 24px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.07);
  color: #bbb;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-hide:hover {
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
}

.nav-row {
  display: flex;
  gap: 8px;
}

.btn-nav {
  flex: 1;
  padding: 9px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #aaa;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-nav:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.22);
}

/* ── Transition ────────────────────────────── */
.reveal-fade-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.reveal-fade-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Mobile ────────────────────────────────── */
/* On mobile the panel teleports to #quiz-portal, which sits BELOW
   the canvas in a flex-column layout (see App.vue).  The panel therefore
   fills its own space — no absolute positioning or max-height needed. */
@media (max-width: 600px) {
  .review-panel {
    position: relative;
    top: auto;
    right: auto;
    bottom: auto;
    left: auto;
    width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 12px 12px 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    /* safe-area padding for iPhone notch */
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
