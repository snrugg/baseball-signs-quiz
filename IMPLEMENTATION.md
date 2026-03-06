# Implementation Guide

This document is for contributors who want to understand the codebase, add features, or adapt the app to a new character model.

---

## Architecture Overview

The app is a **Vue 3 + Three.js** SPA. All 3D logic lives in composables; Vue components handle only UI layout and user interaction.

```
App.vue
└── SceneView.vue          ← initializes all composables, provides them via inject
    ├── QuizPanel.vue       ← injects sequencer + signDefs
    ├── ReviewPanel.vue     ← injects sequencer + signDefs + anchors
    └── CalibrationPanel.vue ← injects everything
```

The key architectural decision is the **provide/inject pattern**: `SceneView.vue` is the single source of truth, instantiating every composable and making them available to any descendant. Components never instantiate composables themselves.

---

## File Map

```
src/
├── App.vue                  # Root layout; mode tab state; mobile/desktop split
├── components/
│   ├── SceneView.vue        # Canvas + composable hub (provide/inject)
│   ├── QuizPanel.vue        # Quiz game UI + state machine
│   ├── ReviewPanel.vue      # List and flashcard review UI
│   └── CalibrationPanel.vue # Developer calibration UI
├── composables/
│   ├── useScene.js          # Three.js renderer, camera, lighting, FBX load, per-frame loop
│   ├── useAnchors.js        # 14 named body positions; world-space lookups; calibration I/O
│   ├── useIK.js             # Two-bone IK solver; hand rotation; elbow pole
│   ├── useSequencer.js      # GSAP tween sequencer; arc avoidance; IK lifecycle
│   ├── useSignDefs.js       # signs.json loader; meaning→anchors map
│   └── boneUtils.js         # Mixamo bone prefix detection
└── data/
    └── signs.js             # Hardcoded fallback sign definitions
```

---

## Composable Dependency Graph

```
useScene  ──────────────────────────────┐
  provides: onFrame, model, skeleton,   │
            boneMap, getModelForward     │
                                         │
useAnchors(boneMap, onFrame)  ──────────┤
  provides: getAnchorWorldPos,           │
            getAnchorRotation, etc.      │
                                         │
useIK(model, skeleton, boneMap, onFrame)─┤
  provides: setTarget, setHandRotation,  │
            setIKEnabled, ikReady        │
                                         │
useSequencer(anchors, ik, scene)  ───────┘
  provides: playSign, moveToAnchor, etc.

useSignDefs()   ← standalone, no Three.js deps
```

All four Three.js composables register callbacks via `onFrame(cb)`. The render loop in `useScene.js` calls every registered callback each animation frame, so each composable can update without direct coupling.

---

## useScene.js

**Responsibility:** Everything Three.js that isn't IK or animation.

Key pieces:

- `initScene(canvas)` — creates `WebGLRenderer`, `PerspectiveCamera`, `Scene`, lights, and ground
- FBX model loading:
  1. Loads `models/Idle.fbx` via `FBXLoader`
  2. Scales the model to 1.8 world units tall, places feet at y=0
  3. Strips right-arm animation tracks from the mixer (IK takes exclusive control)
  4. Builds `boneMap: { [fullBoneName]: Bone }` from skeleton
  5. Exposes `model`, `skeleton`, `boneMap` as `ref`s
- Per-frame loop: `requestAnimationFrame` → calls all `onFrame` callbacks → `renderer.render()`
- Input: left-drag rotates model (Y-axis), right-drag / 2-finger pans (X-axis)
- `setViewOffset` on desktop shifts the rendered image left to avoid overlap with the side panel
- `ResizeObserver` keeps camera aspect and renderer size correct

**Left arm pose** (`leftArmPose`) is a reactive object with `{ forward, raise }` angles applied each frame by `useScene` directly to the left arm bone — it is separate from the IK-controlled right arm.

---

## useAnchors.js

**Responsibility:** Maps 14 named anchor points to world-space positions derived from the skeleton each frame.

### Anchor Definition Schema

```js
{
  bone: 'Head',              // Short bone suffix (prefix auto-detected)
  offset: [x, y, z],        // Local offset in bone space (meters)
  rotation: [rx, ry, rz],   // Hand rotation override in degrees (model-local Euler XYZ)
  leftArm: [forward, raise], // Left arm pose angles in degrees
  rightArm: [out, up],       // Elbow pole bias (additive, model-local)
}
```

### World Position Lookup

`getAnchorWorldPos(name)` computes:
```
worldPos = bone.worldPosition + rotate(offset, bone.worldQuaternion)
```

The offset is expressed in bone-local space and rotated into world space using the bone's quaternion. This means `[0, 0.15, 0.13]` always means "15 cm above, 13 cm forward along the bone's local axes," regardless of skeleton orientation.

### Calibration Persistence

Two-tier storage:
1. **Startup**: synchronously read from `localStorage` (instant, no flash)
2. **Shortly after**: async `fetch('calibration.json')` — authoritative, overwrites localStorage data

`mergeWithDefaults(saved)` ensures new anchors added in code are always present even in old saved data.

### Adding a New Anchor

1. Add to `DEFAULT_ANCHOR_DEFS` in `useAnchors.js`
2. Add to `ANCHOR_LABELS` for display names
3. Add to `ANCHOR_COLORS` for the calibration sphere
4. Run calibration to set good offsets, save `calibration.json`

---

## useIK.js

**Responsibility:** Two-bone IK solver driving the right arm (shoulder → elbow → wrist).

### Algorithm (per frame)

1. **Clamp distance** — shoulder-to-target distance clamped to `[minReach, maxReach]` so the arm never hyperextends or fully collapses
2. **Law of cosines** — computes the angle at the shoulder joint
3. **Adaptive pole vector** — in model-local space, the elbow direction is:
   - Low target: elbow points down and slightly outward
   - High target: elbow swings outward and upward
   - Backward reach: elbow pushed forward
   - Per-anchor `rightArm: [out, up]` bias adds onto this formula
4. **Elbow world position** — `shoulder + stDir·cos(A)·L1 + polePerp·sin(A)·L1`
5. **Upper arm rotation** — `setFromUnitVectors(restDir, shoulder→elbow in parent local)`
6. **Forearm rotation** — `setFromUnitVectors(restDir, elbow→wrist in parent local)`
7. **Hand rotation override** — if `handTargetEuler` is non-zero, convert model-local Euler → world quat → hand-local quat and apply

### IK Lifecycle

IK is **disabled** when the character is at rest (idle animation drives the arm). When a sign starts:
1. `activateIK()` — syncs `animatedPos` to the current hand world position (no jump), then `setIKEnabled(true)`
2. Sequencer tweens position + rotation to each anchor
3. After returning to rest: `deactivateIK()` — `setIKEnabled(false)`, idle animation reclaims arm

### Hand Rotation

Stored as `[rx, ry, rz]` degrees in **model-local** Euler XYZ. This means the orientation travels with model rotation automatically. All-zero = no override (IK natural pose).

`computeAutoHandRotation(anchorWorldPos)` provides a calibration starting point by rotating the palm to face toward the model's center.

---

## useSequencer.js

**Responsibility:** Orchestrates hand animations through sequences of named anchors using GSAP.

### Four Public Functions

| Function | Used by | Behavior after last anchor |
|----------|---------|---------------------------|
| `playSign(names, opts)` | Quiz | Returns to rest, deactivates IK |
| `moveToSequence(names)` | Review | Stays at final anchor (sticky) |
| `moveToAnchor(name)` | Calibration | Stays at anchor (sticky) |
| `moveToRest()` | Any | Moves to rest, deactivates IK |

### Per-Move Animation

Each anchor move tweens **4 properties in parallel**:
1. **Position** — `animatedPos` (x, y, z) + forward arc
2. **Hand rotation** — `animatedRot` (rx, ry, rz)
3. **Left arm pose** — `animatedLeftArm` (forward, raise)
4. **Elbow bias** — `animatedRightArm` (out, up)

GSAP `onUpdate` callbacks push changes to IK each tick.

### Forward Arc

Prevents the hand from passing through the body during lateral swings. The arc amount is proportional to XZ-plane distance between start and end positions (capped at 0.45 units). A bell curve `4t(1-t)` ensures the arc is zero at endpoints and peaks at the midpoint.

```js
arcAmount = min(0.45, lateralDist × 1.5)
```

### Sticky Anchor

After arriving at an anchor (hold phase), `stickyAnchor` is set. A per-frame callback continuously re-resolves that anchor's world position and pushes it to IK. This keeps the hand glued to the body part even as the model rotates.

### Cancellation

`stopCurrent()` kills all active tweens (`_currentTween.kill()`, `_currentDelay.kill()`) and sets the cancelled flag on the running promise chain. This lets any new animation start cleanly without race conditions.

---

## useSignDefs.js

**Responsibility:** Loads and exposes sign definitions.

- Initializes from `DEFAULT_SIGN_DEFS` in `src/data/signs.js`
- `loadSignDefs()` fetches `public/signs.json` and updates `signDefs` + `indicator` reactively
- Falls back silently on 404 or parse errors
- `formatSignLabel(anchorNames, ANCHOR_LABELS)` formats anchor arrays for UI: `['nose', 'leftEar'] → "Nose → Left Ear"`

### Defining Signs

Signs live in `public/signs.json` (runtime, no rebuild needed) or `src/data/signs.js` (hardcoded fallback). The indicator anchor is shown as part of the sign sequence in Game Day mode.

---

## boneUtils.js

**Responsibility:** Detect the Mixamo bone prefix from a boneMap.

Different Mixamo FBX exports use different prefixes before bone names:
- `mixamorig:` (with colon)
- `mixamorig` (no colon)
- `mixamorig9` (newer exports)

Detection: find the bone ending in `"Hips"` and strip that suffix. Falls back to `"mixamorig"` if detection fails.

---

## SceneView.vue (Provide/Inject Hub)

`SceneView.vue` is the glue layer. It:
1. Creates the `<canvas>` element and passes it to `useScene`
2. Chains composable initialization (waits for model before IK, waits for IK before sequencer)
3. Calls `provide()` with each composable's public API
4. Renders loading/error overlays while the model is fetching

**What it provides:**

```js
provide('scene',     { model, skeleton, boneMap, modelRotation, ... })
provide('anchors',   { anchorDefs, anchorNames, getAnchorWorldPos, ... })
provide('ik',        { ikReady, setTarget, setHandRotation, ... })
provide('sequencer', { isPlaying, playSign, moveToAnchor, ... })
provide('signDefs',  { signDefs, indicator, signKeys, ... })
```

Child components call `inject('sequencer')` etc. — they never import composables directly.

---

## Responsive Layout

**Desktop (>600px):** Three.js canvas fills the full viewport; the panel (`QuizPanel`/`ReviewPanel`) is positioned absolutely to the right. Camera `setViewOffset` shifts the rendered scene left so the character stays centered in the visible area.

**Mobile (≤600px):** `App.vue` detects the active mode and adds `.panel-active` to the layout. This triggers a CSS flex column where:
- Scene takes `flex: 1` (remaining space)
- `#quiz-portal` takes `flex: 0 0 55%` (bottom 55%)
- Panels use Vue's `<Teleport to="#quiz-portal">` to render inside the portal

---

## Game Day Quiz Logic

Game Day simulates a real coaching scenario:
1. Picks a random "true sign" from `signDefs`
2. Generates a sequence of 5–15 random anchor touches
3. Inserts the indicator anchor at a random position partway through
4. Immediately after the indicator, inserts the sign's anchors
5. Fills remaining positions with random filler anchors
6. Plays the whole sequence at the user-configured speed
7. After playback, presents 4 answer choices (true sign + 3 distractors)

---

## Adding a New Sign

1. Open `public/signs.json`
2. Add an entry: `"My Sign": ["anchor1", "anchor2"]`
3. Reload — no rebuild needed

To add to the hardcoded fallback, also edit `src/data/signs.js`.

---

## Replacing the 3D Character

1. Export a Mixamo-rigged FBX with idle animation
2. Place it at `public/models/Idle.fbx`
3. Open `?calibrate`, run through each anchor, adjust offsets/rotations
4. Save → commit `calibration.json`

The bone prefix is auto-detected, so standard Mixamo exports should work without code changes.

---

## Data Flow Summary

```
User clicks "Play"
  → QuizPanel calls sequencer.playSign(['billOfCap', 'chest'])
    → sequencer.activateIK()
      → ik.snapTargetToHand()
      → ik.setIKEnabled(true)
    → GSAP tween: animatedPos → billOfCap world pos
      → onUpdate: ik.setTarget(new pos + arc)
      → onUpdate: ik.setHandRotation(rx, ry, rz)
      → onUpdate: scene.setLeftArmPose(fwd, raise)
      → onUpdate: ik.setPoleOffset(out, up)
    → onComplete: hold 0.4s (stickyAnchor keeps hand on bone)
    → repeat for 'chest'
    → GSAP tween back to restPosition
    → sequencer.deactivateIK()
  → QuizPanel shows answer choices
```

Each animation frame (via onFrame):
1. `useAnchors` updates world positions of all 14 anchors
2. `useIK` (if enabled) calls `solveTwoBoneIK()` → updates upper arm + forearm quaternions
3. `useScene` applies left arm pose to left arm bone, then calls `renderer.render()`
