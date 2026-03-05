import { ref } from 'vue'
import gsap from 'gsap'
import * as THREE from 'three'

/**
 * Sequencer: animates the IK target through a series of named anchor points.
 *
 * Usage:
 *   playSign(['billOfCap', 'chest', 'belt'])
 *   → moves the right hand to cap, then chest, then belt in sequence
 */
export function useSequencer(getAnchorWorldPos, setTarget, onFrame) {
  const isPlaying = ref(false)
  const currentStep = ref(-1)
  const currentSequence = ref([])

  // The position we'll animate (GSAP mutates this, we push it to IK each frame)
  const animatedPos = { x: 0, y: 0, z: 0 }

  // "Sticky anchor" — when set, the IK target continuously follows this
  // anchor's world position every frame, so rotating/moving the model
  // keeps the hand locked on the body part.
  let stickyAnchor = null
  let isAnimating = false  // true while a GSAP tween is actively running

  // Handles for the currently-running sequential animation so stop() can abort it
  let _currentTween = null
  let _currentDelay = null
  let _cancelCurrent = null

  // Start position: where the hand rests between signs
  const restPosition = new THREE.Vector3(0.3, 1.0, 0.2)

  /**
   * Per-frame update: if we have a sticky anchor and we're not mid-tween,
   * continuously re-resolve the anchor's world position and push it to IK.
   */
  if (onFrame) {
    onFrame(() => {
      if (stickyAnchor && !isAnimating) {
        const pos = getAnchorWorldPos(stickyAnchor)
        if (pos) {
          animatedPos.x = pos.x
          animatedPos.y = pos.y
          animatedPos.z = pos.z
          setTarget(pos)
        }
      }
    })
  }

  /**
   * Internal: kill whatever is currently running (tween, delay, or promise chain).
   */
  function stopCurrent() {
    if (_cancelCurrent) {
      _cancelCurrent()
      _cancelCurrent = null
    }
    if (_currentTween) {
      _currentTween.kill()
      _currentTween = null
    }
    if (_currentDelay) {
      _currentDelay.kill()
      _currentDelay = null
    }
    // Also kill any legacy gsapTimeline if somehow present
    stickyAnchor = null
    isAnimating = false
  }

  /**
   * Play a sequence of anchor names.
   * Uses sequential independent tweens so each anchor's world position is
   * resolved right before its tween fires. This avoids the GSAP timeline
   * snapping problem (where invalidate().restart() or pre-built timelines
   * cause tweens to fast-forward to their end position).
   * Returns a promise that resolves when the full sequence completes.
   */
  function playSign(anchorNames, options = {}) {
    const {
      holdTime = 0.4,     // seconds to pause at each anchor
      moveTime = 0.35,    // seconds to move between anchors
      ease = 'power2.inOut',
    } = options

    // Kill any running animation
    stopCurrent()

    currentSequence.value = [...anchorNames]
    currentStep.value = -1
    isPlaying.value = true

    return new Promise((resolve) => {
      let cancelled = false

      // Store cancel handle so stop() can abort this promise chain
      _cancelCurrent = () => { cancelled = true }

      function finish() {
        if (cancelled) return
        isPlaying.value = false
        isAnimating = false
        currentStep.value = -1
        stickyAnchor = null
        resolve()
      }

      function returnToRest() {
        if (cancelled) return
        stickyAnchor = null
        isAnimating = true
        _currentTween = gsap.to(animatedPos, {
          duration: moveTime,
          x: restPosition.x,
          y: restPosition.y,
          z: restPosition.z,
          ease,
          onUpdate: () => {
            setTarget(new THREE.Vector3(animatedPos.x, animatedPos.y, animatedPos.z))
          },
          onComplete: finish,
        })
      }

      function step(index) {
        if (cancelled) return

        // All anchors done — return to rest
        if (index >= anchorNames.length) {
          returnToRest()
          return
        }

        const name = anchorNames[index]
        currentStep.value = index
        stickyAnchor = name
        isAnimating = true

        // Resolve the target position NOW (right before tweening),
        // not at sequence-build time. This is the key fix: each anchor's
        // world position is evaluated at the moment the hand starts moving
        // toward it, so it's always accurate regardless of model pose/rotation.
        const pos = getAnchorWorldPos(name)
        const tx = pos?.x ?? animatedPos.x
        const ty = pos?.y ?? animatedPos.y
        const tz = pos?.z ?? animatedPos.z

        _currentTween = gsap.to(animatedPos, {
          duration: moveTime,
          x: tx,
          y: ty,
          z: tz,
          ease,
          onUpdate: () => {
            setTarget(new THREE.Vector3(animatedPos.x, animatedPos.y, animatedPos.z))
          },
          onComplete: () => {
            if (cancelled) return
            // Hold phase: hand arrived — let the frame callback track the
            // sticky anchor so the hand stays glued to the bone during the hold
            // even if the model rotates or moves.
            isAnimating = false
            _currentDelay = gsap.delayedCall(holdTime, () => {
              if (cancelled) return
              // GSAP takes over again for the next move
              isAnimating = true
              step(index + 1)
            })
          },
        })
      }

      step(0)
    })
  }

  /**
   * Move to a single anchor (for calibration preview).
   * After the animation completes, the hand stays locked to the anchor.
   */
  function moveToAnchor(anchorName, duration = 0.5) {
    stopCurrent()

    const pos = getAnchorWorldPos(anchorName)
    if (!pos) return

    isPlaying.value = true
    isAnimating = true

    _currentTween = gsap.to(animatedPos, {
      duration,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      ease: 'power2.inOut',
      onUpdate: () => {
        setTarget(new THREE.Vector3(animatedPos.x, animatedPos.y, animatedPos.z))
      },
      onComplete: () => {
        isPlaying.value = false
        isAnimating = false
        // Lock to this anchor — frame callback will keep it tracked
        stickyAnchor = anchorName
      },
    })
  }

  /**
   * Move to rest position
   */
  function moveToRest(duration = 0.5) {
    stopCurrent()

    isAnimating = true

    _currentTween = gsap.to(animatedPos, {
      duration,
      x: restPosition.x,
      y: restPosition.y,
      z: restPosition.z,
      ease: 'power2.inOut',
      onUpdate: () => {
        setTarget(new THREE.Vector3(animatedPos.x, animatedPos.y, animatedPos.z))
      },
      onComplete: () => {
        isAnimating = false
      },
    })
  }

  /**
   * Stop any running animation
   */
  function stop() {
    stopCurrent()
    isPlaying.value = false
    currentStep.value = -1
  }

  /**
   * Initialize the animated position (call after IK is ready)
   */
  function initPosition(worldPos) {
    animatedPos.x = worldPos.x
    animatedPos.y = worldPos.y
    animatedPos.z = worldPos.z
    setTarget(worldPos)
  }

  return {
    isPlaying,
    currentStep,
    currentSequence,
    playSign,
    moveToAnchor,
    moveToRest,
    stop,
    initPosition,
  }
}
