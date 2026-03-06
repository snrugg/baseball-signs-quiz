import { ref } from 'vue'
import gsap from 'gsap'
import * as THREE from 'three'

/**
 * Sequencer: animates the IK target through a series of named anchor points,
 * tweening both position AND hand orientation for each anchor.
 *
 * Usage:
 *   playSign(['billOfCap', 'chest', 'belt'])
 *   → moves the right hand to cap, then chest, then belt in sequence,
 *     applying the calibrated hand rotation at each stop.
 */
export function useSequencer(getAnchorWorldPos, getAnchorRotation, getAnchorLeftArm, getAnchorRightArm, getModelForward, setTarget, setHandRotation, setLeftArmPose, setPoleOffset, onFrame) {
  const isPlaying = ref(false)
  const currentStep = ref(-1)
  const currentSequence = ref([])

  // The position we'll animate (GSAP mutates this, we push it to IK each frame)
  const animatedPos = { x: 0, y: 0, z: 0 }

  // The hand rotation we'll animate (GSAP mutates this, we push it to IK each frame)
  const animatedRot = { rx: 0, ry: 0, rz: 0 }

  // The left-arm pose we'll animate in parallel with position + hand rotation
  const animatedLeftArm = { forward: 0, raise: 0 }

  // The right-arm elbow bias we'll animate in parallel
  const animatedRightArm = { out: 0, up: 0 }

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

  // ── Arc helper ─────────────────────────────────────────────────────────────
  /**
   * Compute how far to arc the hand FORWARD (in the model's facing direction)
   * during a transition to avoid passing through the body.
   *
   * The arc is proportional to the horizontal (XZ-plane) distance between the
   * two endpoints.  Purely vertical transitions (same XZ position) get no arc;
   * wide lateral swings like left-ear → right-ear get up to ~0.45 units of
   * forward bow at the midpoint.
   *
   * In the position tween's onUpdate we multiply this by the bell-curve value
   *   bell(t) = 4t(1-t)   (0 at t=0 and t=1, peak of 1 at t=0.5)
   * and add it along the model's forward direction, so the arc is always zero
   * at the start and end positions and has no effect on the hold phase.
   */
  function arcAmount(sx, sz, tx, tz) {
    const dx = tx - sx
    const dz = tz - sz
    const lateralDist = Math.sqrt(dx * dx + dz * dz)
    return Math.min(0.45, lateralDist * 1.5)
  }

  /**
   * Build the onUpdate callback for a position tween that includes the forward arc.
   *
   * @param {object} posTweenRef - object with a `.tween` property set after creation
   *   (closure trick to reference the tween from inside its own callback)
   * @param {number} arc - forward arc amount from arcAmount()
   */
  function makePositionUpdate(posTweenRef, arc) {
    return () => {
      const t = posTweenRef.tween ? posTweenRef.tween.progress() : 0
      const bell = 4 * t * (1 - t)           // 0→1→0 over the tween duration
      const fwd  = getModelForward()
      setTarget(new THREE.Vector3(
        animatedPos.x + fwd.x * bell * arc,
        animatedPos.y,                        // no vertical arc (looks unnatural)
        animatedPos.z + fwd.z * bell * arc,
      ))
    }
  }

  /**
   * Per-frame update: if we have a sticky anchor and we're not mid-tween,
   * continuously re-resolve the anchor's world position and push it to IK.
   * (Rotation is applied once when we arrive at the anchor, so no per-frame
   * rotation update is needed — it persists until the next step.)
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
    stickyAnchor = null
    isAnimating = false
  }

  /**
   * Play a sequence of anchor names.
   * Returns a promise that resolves when the full sequence completes.
   */
  function playSign(anchorNames, options = {}) {
    const {
      holdTime = 0.4,
      moveTime = 0.35,
      ease = 'power2.inOut',
    } = options

    stopCurrent()

    currentSequence.value = [...anchorNames]
    currentStep.value = -1
    isPlaying.value = true

    return new Promise((resolve) => {
      let cancelled = false
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

        // Capture start and compute arc before the tween mutates animatedPos
        const arc = arcAmount(animatedPos.x, animatedPos.z, restPosition.x, restPosition.z)
        const ref  = {}  // closure ref so onUpdate can call tween.progress()
        const tween = gsap.to(animatedPos, {
          duration: moveTime,
          x: restPosition.x,
          y: restPosition.y,
          z: restPosition.z,
          ease,
          onUpdate: makePositionUpdate(ref, arc),
          onComplete: finish,
        })
        ref.tween  = tween
        _currentTween = tween

        // Tween hand rotation back to neutral in parallel
        gsap.to(animatedRot, {
          duration: moveTime,
          rx: 0, ry: 0, rz: 0,
          ease,
          onUpdate: () => {
            setHandRotation(animatedRot.rx, animatedRot.ry, animatedRot.rz)
          },
        })

        // Tween left arm back to natural idle pose in parallel
        gsap.to(animatedLeftArm, {
          duration: moveTime,
          forward: 0, raise: 0,
          ease,
          onUpdate: () => {
            setLeftArmPose(animatedLeftArm.forward, animatedLeftArm.raise)
          },
        })

        // Tween right arm elbow bias back to neutral in parallel
        gsap.to(animatedRightArm, {
          duration: moveTime,
          out: 0, up: 0,
          ease,
          onUpdate: () => {
            setPoleOffset(animatedRightArm.out, animatedRightArm.up)
          },
        })
      }

      function step(index) {
        if (cancelled) return

        if (index >= anchorNames.length) {
          returnToRest()
          return
        }

        const name = anchorNames[index]
        currentStep.value = index
        stickyAnchor = name
        isAnimating = true

        // Resolve position and rotation NOW, right before tweening
        const pos = getAnchorWorldPos(name)
        const tx = pos?.x ?? animatedPos.x
        const ty = pos?.y ?? animatedPos.y
        const tz = pos?.z ?? animatedPos.z

        const [targetRx, targetRy, targetRz] = getAnchorRotation(name)
        const [targetFwd, targetRaise]       = getAnchorLeftArm(name)
        const [targetOut, targetUp]          = getAnchorRightArm(name)

        // Arc: computed from current position BEFORE the tween mutates animatedPos
        const arc  = arcAmount(animatedPos.x, animatedPos.z, tx, tz)
        const ref  = {}
        const tween = gsap.to(animatedPos, {
          duration: moveTime,
          x: tx, y: ty, z: tz,
          ease,
          onUpdate: makePositionUpdate(ref, arc),
          onComplete: () => {
            if (cancelled) return
            // Hold phase — sticky anchor keeps position locked to bone;
            // rotation is already at target so no extra work needed
            isAnimating = false
            _currentDelay = gsap.delayedCall(holdTime, () => {
              if (cancelled) return
              isAnimating = true
              step(index + 1)
            })
          },
        })
        ref.tween  = tween
        _currentTween = tween

        // Tween hand rotation in parallel
        gsap.to(animatedRot, {
          duration: moveTime,
          rx: targetRx, ry: targetRy, rz: targetRz,
          ease,
          onUpdate: () => {
            setHandRotation(animatedRot.rx, animatedRot.ry, animatedRot.rz)
          },
        })

        // Tween left arm pose in parallel
        gsap.to(animatedLeftArm, {
          duration: moveTime,
          forward: targetFwd, raise: targetRaise,
          ease,
          onUpdate: () => {
            setLeftArmPose(animatedLeftArm.forward, animatedLeftArm.raise)
          },
        })

        // Tween right arm elbow bias in parallel
        gsap.to(animatedRightArm, {
          duration: moveTime,
          out: targetOut, up: targetUp,
          ease,
          onUpdate: () => {
            setPoleOffset(animatedRightArm.out, animatedRightArm.up)
          },
        })
      }

      step(0)
    })
  }

  /**
   * Move to a single anchor (for calibration preview).
   * Tweens both position and rotation. After the animation completes,
   * the hand stays locked to the anchor.
   */
  function moveToAnchor(anchorName, duration = 0.5) {
    stopCurrent()

    const pos = getAnchorWorldPos(anchorName)
    if (!pos) return

    const [targetRx, targetRy, targetRz] = getAnchorRotation(anchorName)
    const [targetFwd, targetRaise]       = getAnchorLeftArm(anchorName)
    const [targetOut, targetUp]          = getAnchorRightArm(anchorName)

    isPlaying.value = true
    isAnimating = true

    const arc  = arcAmount(animatedPos.x, animatedPos.z, pos.x, pos.z)
    const ref  = {}
    const tween = gsap.to(animatedPos, {
      duration,
      x: pos.x, y: pos.y, z: pos.z,
      ease: 'power2.inOut',
      onUpdate: makePositionUpdate(ref, arc),
      onComplete: () => {
        isPlaying.value = false
        isAnimating = false
        stickyAnchor = anchorName
      },
    })
    ref.tween  = tween
    _currentTween = tween

    // Tween hand rotation in parallel
    gsap.to(animatedRot, {
      duration,
      rx: targetRx, ry: targetRy, rz: targetRz,
      ease: 'power2.inOut',
      onUpdate: () => {
        setHandRotation(animatedRot.rx, animatedRot.ry, animatedRot.rz)
      },
    })

    // Tween left arm pose in parallel
    gsap.to(animatedLeftArm, {
      duration,
      forward: targetFwd, raise: targetRaise,
      ease: 'power2.inOut',
      onUpdate: () => {
        setLeftArmPose(animatedLeftArm.forward, animatedLeftArm.raise)
      },
    })

    // Tween right arm elbow bias in parallel
    gsap.to(animatedRightArm, {
      duration,
      out: targetOut, up: targetUp,
      ease: 'power2.inOut',
      onUpdate: () => {
        setPoleOffset(animatedRightArm.out, animatedRightArm.up)
      },
    })
  }

  /**
   * Move to rest position (position + neutral rotation)
   */
  function moveToRest(duration = 0.5) {
    stopCurrent()
    isAnimating = true

    const arc  = arcAmount(animatedPos.x, animatedPos.z, restPosition.x, restPosition.z)
    const ref  = {}
    const tween = gsap.to(animatedPos, {
      duration,
      x: restPosition.x, y: restPosition.y, z: restPosition.z,
      ease: 'power2.inOut',
      onUpdate: makePositionUpdate(ref, arc),
      onComplete: () => {
        isAnimating = false
      },
    })
    ref.tween  = tween
    _currentTween = tween

    gsap.to(animatedRot, {
      duration,
      rx: 0, ry: 0, rz: 0,
      ease: 'power2.inOut',
      onUpdate: () => {
        setHandRotation(animatedRot.rx, animatedRot.ry, animatedRot.rz)
      },
    })

    gsap.to(animatedLeftArm, {
      duration,
      forward: 0, raise: 0,
      ease: 'power2.inOut',
      onUpdate: () => {
        setLeftArmPose(animatedLeftArm.forward, animatedLeftArm.raise)
      },
    })

    gsap.to(animatedRightArm, {
      duration,
      out: 0, up: 0,
      ease: 'power2.inOut',
      onUpdate: () => {
        setPoleOffset(animatedRightArm.out, animatedRightArm.up)
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
