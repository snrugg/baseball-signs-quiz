# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

```bash
npm run dev    # Open local development server
npm run build  # Build production-ready version
npm run test   # Run all unit tests
npm run test:watch  # Run tests in watch mode (requires terminal open)
npm run test:coverage  # Run tests with coverage reports
```

## Application Architecture

This is a **musical game/sequencer** application built with Vue.js and Three.js for 3D rendering.

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
├── useScene.js        # Three.js model & camera orchestration
├── useAnchors.js      # Anchor positioning & calibration system
├── useIK.js           # Input-based skeletal animation (hand-to-plectrum)
├── useSequencer.js    # Game sequencer (moves between anchor positions)
└── useSignDefs.js     # Sign definition loading from external file

src/
├── data/              # Constants, defaults, API calls
└── main.js            # App entry point with Vue setup
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

#### `useSequencer.js` (Game Flow)
- Manages game state: playing step, sequence ID, position targets
- Routes player between three states:
  - `moveToAnchor` - approach target anchor in scene
  - `moveToSequence` - navigate along animation path
  - `moveToRest` - return to starting position
- Provides `playSign()`, `stop()` for game actions

### External Dependencies

The app loads external assets from:
- **signs.json** - Sign definitions from `http://public/signs.json` (fetched in useSignDefs.js)
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

### Single Test
```bash
npm run test   # Runs full test suite - see output in terminal
```

### Common Commands
- `npm run dev` - Run development server (vite)
- `npm run build` - Compile for production
- `npm run test:watch` - Interactive testing mode

## Important Notes

1. The application uses **compositionals** (useScene.js, useAnchors.js, etc.) that are imported at setup time into components using `provide()` and `inject()`.

2. Sign definitions come from an external API (`signs.json`) - check internet access for game data.

3. The main entry point is `src/main.js` which wraps the entire component structure.

4. All composable functions are meant to be called directly with their arguments (e.g., `useAnchors(boneMap, onFrame)`), not via composables' return values.
