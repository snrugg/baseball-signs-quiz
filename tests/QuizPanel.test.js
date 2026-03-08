import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import QuizPanel from '../src/components/QuizPanel.vue'

// ── Minimal dependency stubs ─────────────────────────────────────────────────
// QuizPanel injects four objects from SceneView via provide/inject.
// These stubs satisfy every property accessed by the template and script.

const ANCHOR_LABELS = {
  billOfCap:  'Bill of Cap',
  chest:      'Chest',
  belt:       'Belt',
  nose:       'Nose',
  leftEar:    'Left Ear',
  frontOfLeg: 'Front of Leg',
  backOfLeg:  'Back of Leg',
}

function makeProvide({ ikReady = true } = {}) {
  return {
    anchors: {
      ANCHOR_LABELS,
      anchorNames: ref(Object.keys(ANCHOR_LABELS)),
    },
    ik: {
      ikReady: ref(ikReady),
    },
    sequencer: {
      // Returns a promise that never resolves so quizState stays 'playing'
      // for the duration of any test that triggers startQuiz().
      playSign:        vi.fn(() => new Promise(() => {})),
      currentStep:     ref(0),
      currentSequence: ref([]),
    },
    signDefs: {
      signKeys:       ref(['Hit & Run', 'Steal', 'Bunt', 'Take']),
      indicator:      ref('billOfCap'),
      getSignAnchors: vi.fn(() => ['chest']),
    },
  }
}

// ── Test suite ───────────────────────────────────────────────────────────────
describe('QuizPanel', () => {
  let portal

  beforeEach(() => {
    // The Teleport targets #quiz-portal; create it so the portal exists in the
    // document before any component mounts (mirrors App.vue's real DOM order).
    portal = document.createElement('div')
    portal.id = 'quiz-portal'
    document.body.appendChild(portal)
  })

  afterEach(() => {
    document.getElementById('quiz-portal')?.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ── Idle-state play button ───────────────────────────────────────────────
  describe('idle state — play button', () => {
    it('shows "▶  Play" and is enabled once IK is ready', async () => {
      const wrapper = mount(QuizPanel, {
        global: { provide: makeProvide({ ikReady: true }) },
        props:  { quizMode: 'gameDay' },
        attachTo: document.body,
      })
      await nextTick()

      const btn = wrapper.find('.btn-start')
      expect(btn.exists()).toBe(true)
      expect(btn.text()).toContain('Play')
      expect(btn.text()).not.toContain('Loading')
      expect(btn.element.disabled).toBe(false)

      wrapper.unmount()
    })

    it('shows "Loading…" and is disabled while IK initialises', async () => {
      const wrapper = mount(QuizPanel, {
        global: { provide: makeProvide({ ikReady: false }) },
        props:  { quizMode: 'gameDay' },
        attachTo: document.body,
      })
      await nextTick()

      const btn = wrapper.find('.btn-start')
      expect(btn.exists()).toBe(true)
      expect(btn.text()).toContain('Loading')
      expect(btn.element.disabled).toBe(true)

      wrapper.unmount()
    })

    it('shows "▶  Play" in justSign mode when IK is ready', async () => {
      const wrapper = mount(QuizPanel, {
        global: { provide: makeProvide({ ikReady: true }) },
        props:  { quizMode: 'justSign' },
        attachTo: document.body,
      })
      await nextTick()

      const btn = wrapper.find('.btn-start')
      expect(btn.text()).toContain('Play')
      expect(btn.element.disabled).toBe(false)

      wrapper.unmount()
    })
  })

  // ── Mobile Teleport ──────────────────────────────────────────────────────
  // These tests guard against re-introducing the two-Teleport fragment-root
  // bug from PR #1, which caused the panel to render incorrectly on mobile.
  describe('mobile Teleport', () => {
    it('renders .quiz-panel inside #quiz-portal on narrow viewports (≤ 600 px)', async () => {
      vi.stubGlobal('innerWidth', 375)

      const wrapper = mount(QuizPanel, {
        global: { provide: makeProvide() },
        props:  { quizMode: 'gameDay' },
        attachTo: document.body,
      })
      // Two ticks: first for the initial render, second for the deferred
      // Teleport activation (Vue 3.5 `defer` flushes post-render).
      await nextTick()
      await nextTick()

      expect(portal.querySelector('.quiz-panel')).not.toBeNull()

      wrapper.unmount()
    })

    it('renders .quiz-panel in-place on wide viewports (> 600 px)', async () => {
      vi.stubGlobal('innerWidth', 1280)

      const wrapper = mount(QuizPanel, {
        global: { provide: makeProvide() },
        props:  { quizMode: 'gameDay' },
        attachTo: document.body,
      })
      await nextTick()

      // The portal should be empty — the panel stays in its SceneView slot.
      expect(portal.querySelector('.quiz-panel')).toBeNull()

      wrapper.unmount()
    })

    it('moves .quiz-panel into #quiz-portal when viewport narrows past 600 px', async () => {
      vi.stubGlobal('innerWidth', 1280)

      const wrapper = mount(QuizPanel, {
        global: { provide: makeProvide() },
        props:  { quizMode: 'gameDay' },
        attachTo: document.body,
      })
      await nextTick()
      expect(portal.querySelector('.quiz-panel')).toBeNull()

      // Simulate a resize to mobile width
      vi.stubGlobal('innerWidth', 375)
      window.dispatchEvent(new Event('resize'))
      await nextTick()
      await nextTick()

      expect(portal.querySelector('.quiz-panel')).not.toBeNull()

      wrapper.unmount()
    })
  })
})
