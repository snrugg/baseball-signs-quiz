# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

```bash
npm run dev           # Open local development server
npm run build         # Build production-ready version
npm run test          # Run all unit tests (vitest run)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage reports

# Run a single test file:
npx vitest run tests/useIntersectionChecker.test.js
```

## Application Architecture

This is a **baseball practice** application built with Vue.js and Three.js to assist players in memorizing and practicing baseball signs..

### High-Level Architecture

**Frontend Stack:**
- **Core:** Vue 3 (Composition API) - `src/App.vue` orchestrates the app layout, navigation tabs, and mode switching
- **3D Rendering:** Three.js (loaded via CDN as dependencies) - Renders game scenes with skeleton animations
- **Animation/Effects:** GSAP 3.14.x - Animations for sequencer movements

**Component Structure:**
```
src/components/
├── SceneView.vue   # Main scene container with Canvas + Loading/Error overlays
├── CalibrationPanel.vue     # USB calibration tool
├── QuizPanel.vue      # Interactive gameplay panel (sub-modes: review, justSign, gameDay)
└── ReviewPanel.vue    # Review mode component

src/composables/
├── useScene.js              # Three.js model & camera orchestration
├── useAnchors.js            # Anchor positioning & calibration system
├── useIK.js                 # Input-based skeletal animation (hand-to-plectrum)
├── useSequencer.js          # Game sequencer (moves between anchor positions)
├── useSignDefs.js           # Sign definition loading from signs.json with fallback
├── useIntersectionChecker.js # Capsule-skeleton self-intersection detector (no WebGL)
├── boneUtils.js             # Mixamo bone prefix detection (detectBonePrefix)
└── sceneUtils.js            # Scene utility helpers

src/
├── data/signs.js      # DEFAULT_SIGN_DEFS and DEFAULT_INDICATOR (hardcoded fallback)
└── main.js            # App entry point with Vue setup

tests/                 # Vitest unit tests (jsdom, no WebGL required)
├── boneUtils.test.js
├── signs.test.js
├── sceneUtils.test.js
├── useAnchors.test.js
├── useIK.test.js
├── useIntersectionChecker.test.js
├── useSequencer.test.js
├── useSignDefs.test.js
└── QuizPanel.test.js
```

**Key Component Flow:**
1. `App.vue` manages tab switching (Review | Just Sign | Game Day | Calibrate)
2. `SceneView.vue` renders the 3D scene container with overlays for calibration/quiz modes
3. Child components (`CalibrationPanel`, `QuizPanel`) are conditionally mounted based on `mode` and URL parameters

### Key Composables & Dependencies

#### `useAnchors.js` (Critical: Calibration System)
- Manages **anchor system** - defines where virtual objects (spheres, markers) appear relative to player skeleton
- Supports two input types:
  - `leftArm` / `rightArm` → position a virtual arm on each hand
  - `nose`, `leftEar`, `rightEar` → place markers on character parts
- Provides: `createSpheres()`, `setAnchorOffset()`, `resetOffsets()`
- Used for **USB calibration** in calibration mode

#### `useIK.js` (Animation System)
- Implements **Inverse Kinematics** to position player's arms relative to a target pose
- Takes reference: `model, skeleton, boneMap, onFrame`
- Provides hand rotation control via `setHandRotation()` and `computeAutoHandRotation()`
- Required for gameplay mechanics

#### `useIntersectionChecker.js` (Collision Detection)
- Approximates character body as capsules (line segment + radius) for CPU-only collision detection
- `checkFrame(shoulder, elbow, wrist, bodyCaps)` → `{ intersecting, pairs, maxDepth }`
- `buildBodyCapsules(boneMap, prefix)` → capsule array from live bone positions
- `sampleTransition(from, to, modelFwd, solveParams, bodyCaps)` → worst intersection along an arc path
- Body capsule radii defined in `BODY_SEGMENT_DEFS`; tune radii if false positives appear
- Works in Vitest/jsdom without a WebGL context

#### `useSequencer.js` (Game Flow)
- Manages game state: playing step, sequence ID, position targets
- Routes player between three states:
  - `moveToAnchor` - approach target anchor in scene
  - `moveToSequence` - navigate along animation path
  - `moveToRest` - return to starting position
- Provides `playSign()`, `stop()` for game actions

### Sign Data

- **Runtime:** `useSignDefs.js` fetches `public/signs.json` at startup (coaches can edit freely)
- **Fallback:** If `signs.json` is missing or unparseable, `src/data/signs.js` exports `DEFAULT_SIGN_DEFS` and `DEFAULT_INDICATOR`
- Sign format: `{ "Hit & Run": ["leftArm"] }` — meaning string → array of anchor names
- `DEFAULT_INDICATOR` (`billOfCap`) is the anchor that activates the next sign in Game Day mode

### External Dependencies

- Three.js 0.183.x (for 3D rendering)
- GSAP 3.14.x (for animations)

### URL Parameters

Calibration mode is triggered via URL param: `?calibrate`

**Modes:**
- `review` - Review mode component available
- `justSign` / `gameDay` - Quiz sub-modes in single panel (teleport to portal on mobile)
- `calibrate` - Calibration mode (conditional, requires ?calibrate query param)

### Mobile UX Pattern

On small screens (<600px width):
1. **Tabs** become a flex row spanning full-width header
2. **Scene wrapper** transforms from absolute tab position to responsive layout
3. **Quiz panel** teleports directly below the scene canvas (`#quiz-portal`)
4. Panels don't overlap the 3D model

## Development Workflow

### Running Tests

Tests live in `tests/` and use Vitest + jsdom. Three.js math works in jsdom, so no WebGL context is needed — all composable unit tests run headlessly.

```bash
npm run test                                          # Full suite
npx vitest run tests/useIntersectionChecker.test.js  # Single file
npx vitest run -t "segSegDistSq"                     # Single test by name
```

## Important Notes

1. Composables are instantiated with arguments and injected into components via Vue's `provide()` / `inject()` pattern. Each composable returns an object of functions/state (e.g., `useIntersectionChecker()` returns `{ checkFrame, buildBodyCapsules, sampleTransition, ... }`).

2. Bone names use a Mixamo prefix (`mixamorig`, `mixamorig:`, or `mixamorig9`). Use `detectBonePrefix(boneMap)` from `boneUtils.js` to resolve the correct prefix before accessing bones.
