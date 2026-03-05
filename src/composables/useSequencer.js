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
  let gsapTimeline = null

  // "Sticky anchor" — when set, the IK target continuously follows this
  // anchor's world position every frame, so rotating/moving the model
  // keeps the hand locked on the body part.
  let stickyAnchor = null
  let isAnimating = false  // true while a GSAP tween is actively running

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
   * Play a sequence of anchor names.
   * Returns a promise that resolves when the full sequence completes.
   */
  function playSign(anchorNames, options = {}) {
    const {
      holdTime = 0.4,     // seconds to pause at each anchor
      moveTime = 0.35,    // seconds to move between anchors
      ease = 'power2.inOut',
    } = options

    return new Promise((resolve) => {
      // Kill any running animation
      if (gsapTimeline) {
        gsapTimeline.kill()
      }

      stickyAnchor = null
      currentSequence.value = [...anchorNames]
      currentStep.value = -1
      isPlaying.value = true
      isAnimating = true

      gsapTimeline = gsap.timeline({
        onComplete: () => {
          isPlaying.value = false
          isAnimating = false
          currentStep.value = -1
          stickyAnchor = null
          resolve()
        },
      })

      for (let i = 0; i < anchorNames.length; i++) {
        const name = anchorNames[i]

        gsapTimeline.call(() => {
          currentStep.value = i
          stickyAnchor = name
        })

        // Animate to the anchor's current world position.
        // We compute it at build time — during hold, the sticky anchor
        // frame callback keeps it locked.
        gsapTimeline.to(animatedPos, {
          duration: moveTime,
          ease,
          onStart: function () {
            // Re-resolve position at tween start for accuracy
            const pos = getAnchorWorldPos(name)
            if (pos) {
              this.vars.x = pos.x
              this.vars.y = pos.y
              this.vars.z = pos.z
              this.invalidate().restart()
            }
          },
          onUpdate: () => {
            setTarget(new THREE.Vector3(animatedPos.x, animatedPos.y, animatedPos.z))
          },
          ...(() => {
            const pos = getAnchorWorldPos(name)
            return pos ? { x: pos.x, y: pos.y, z: pos.z } : {}
          })(),
        })

        // Hold at position — during hold, the sticky anchor frame callback
        // keeps the IK target tracking the bone even if the model moves.
        gsapTimeline.call(() => {
          isAnimating = false // let frame callback take over during hold
        })
        gsapTimeline.to({}, { duration: holdTime })
        gsapTimeline.call(() => {
          isAnimating = true // GSAP takes over for the next move
        })
      }

      // Return to rest position
      gsapTimeline.call(() => {
        stickyAnchor = null
      })
      gsapTimeline.to(animatedPos, {
        duration: moveTime,
        x: restPosition.x,
        y: restPosition.y,
        z: restPosition.z,
        ease,
        onUpdate: () => {
          setTarget(new THREE.Vector3(animatedPos.x, animatedPos.y, animatedPos.z))
        },
      })
    })
  }

  /**
   * Move to a single anchor (for calibration preview).
   * After the animation completes, the hand stays locked to the anchor.
   */
  function moveToAnchor(anchorName, duration = 0.5) {
    if (gsapTimeline) gsapTimeline.kill()

    const pos = getAnchorWorldPos(anchorName)
    if (!pos) return

    stickyAnchor = null
    isPlaying.value = true
    isAnimating = true

    gsap.to(animatedPos, {
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
    if (gsapTimeline) gsapTimeline.kill()

    stickyAnchor = null
    isAnimating = true

    gsap.to(animatedPos, {
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
    if (gsapTimeline) {
      gsapTimeline.kill()
      gsapTimeline = null
    }
    isPlaying.value = false
    isAnimating = false
    currentStep.value = -1
    stickyAnchor = null
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
