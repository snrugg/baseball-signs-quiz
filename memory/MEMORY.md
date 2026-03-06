# Baseball Signs Quiz — Project Memory

## Project Summary
Vue 3 + Three.js web app for baseball coaching sign practice. Players watch a 3D character perform gestures and identify what each sign means. Deployed to GitHub Pages.

## Tech Stack
- **Vue 3** with `<script setup>` SFCs
- **Three.js** (^0.183) for 3D rendering
- **GSAP** (^3.14) for animation tweening
- **Vite** (^7.3) + `@vitejs/plugin-vue`
- **Vitest** (^3.0) for unit testing

## Key Commands
```bash
npm run dev          # Vite dev server → localhost:5173/baseball-signs-quiz/
npm run build        # output to dist/
npm test             # run Vitest tests
npm run test:coverage
```

## Architecture
- `SceneView.vue` is the central hub: creates all composables, provides them via `provide()` to child components.
- Children (`QuizPanel`, `ReviewPanel`, `CalibrationPanel`) use `inject()` — they never import composables directly.
- **onFrame pattern**: all composables register per-frame callbacks via `useScene`'s `onFrame(cb)` hook; the render loop calls them all.

## Critical Files
| File | Purpose |
|------|---------|
| `src/composables/useScene.js` | Three.js renderer, camera, lighting, FBX loader, animation loop |
| `src/composables/useAnchors.js` | 14 named body-part positions; calibration I/O |
| `src/composables/useIK.js` | Two-bone IK solver for right arm |
| `src/composables/useSequencer.js` | GSAP tween sequencer; orchestrates sign animations |
| `src/composables/useSignDefs.js` | Loads signs.json; meaning→anchor map |
| `src/composables/boneUtils.js` | Mixamo bone prefix detection |
| `public/signs.json` | Coach-editable sign definitions (no rebuild needed) |
| `public/calibration.json` | Saved anchor positions (committed after calibration) |

## Anchor System
- 14 anchors defined in `useAnchors.js` (`DEFAULT_ANCHOR_DEFS`)
- Each anchor: `{ bone, offset[x,y,z], rotation[rx,ry,rz], leftArm[fwd,raise], rightArm[out,up] }`
- World position = bone.worldPos + rotate(offset, bone.worldQuat)
- Storage: localStorage (sync startup) → calibration.json fetch (async, authoritative)

## IK Architecture
- Two-bone chain: RightArm → RightForeArm → RightHand
- Adaptive pole vector: elbow adapts to target height/direction
- Hand rotation stored as model-local Euler degrees (travels with model rotation)
- IK disabled at rest; `activateIK()`/`deactivateIK()` called by sequencer

## Sign Definition Format
```json
{ "indicator": "billOfCap", "signs": { "Hit & Run": ["leftArm"] } }
```
Loaded from `public/signs.json`; fallback in `src/data/signs.js`.

## Calibration Workflow
1. Open `?calibrate` URL param
2. Adjust anchor positions with sliders
3. Click Save → downloads `calibration.json`
4. Place file in `public/`, commit, redeploy

## Key UI Patterns
- **Streak**: `streak` (current, resets on wrong) + `bestStreak` (localStorage `baseballSigns_bestStreak`). Both in QuizPanel header. Resets current streak on `resetScore()`.
- **Collapsible settings**: `settingsOpen = ref(false)` in QuizPanel. Toggle button with rotating chevron `▾`. Sliders hidden by default; indicator note always visible.
- **Keyboard shortcuts** (QuizPanel): `Space` = play (idle) or next (feedback); `1-4` = select answer (answering). (ReviewPanel, flashcard only): `←/→` = prev/next; `Space` = show/hide.
- **sceneUtils.js**: Pure math helpers extracted from useScene.js for testability: `isRightArmTrack`, `filterRightArmTracks`, `computeModelScale`, `computeGroundOffset`, `computeCenterOffsetX`, `computeDragRotation`, `computeDragPan`, `clampPixelRatio`.

## Test Setup
- Vitest 3, jsdom environment, `tests/setup.js` mocks localStorage, URL.createObjectURL
- Excluded `useScene.js` from coverage (requires WebGL/canvas)
- GSAP mocked to execute synchronously in sequencer tests
- Three.js math used directly (works in Node without WebGL)

## Known Quirks / Bugs Found During Testing
- `loadSignDefs` guard `typeof data.signs === 'object'` also passes for arrays (JavaScript gotcha). Should add `&& !Array.isArray(data.signs)` for stricter validation.
- Bone prefix detection happens lazily on first `updateAnchors()` call, so `getAnchorWorldPos` returns null until the first frame runs.

## Deployment
- Base URL: `/baseball-signs-quiz/` in `vite.config.js`
- GitHub Pages: deploy `dist/` folder
- Change `base` to match repo name before deploying
