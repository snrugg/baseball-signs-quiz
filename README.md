# Baseball Signs Quiz

A 3D interactive web app for baseball coaches and players to practice reading coaching hand signs. The app animates a character performing gestures and quizzes players on what each sign means.

## Features

- **Quiz Mode** — Two game types:
  - *Just the Sign*: watch a single gesture, pick from 4 multiple-choice answers
  - *Game Day*: read signs embedded in a realistic coaching sequence (with indicator, filler moves, and configurable speed/length)
- **Review Mode** — Study all defined signs at your own pace
  - *List*: click any sign to see it demonstrated; hand stays locked on the body part as you rotate the model
  - *Flashcard*: flip through signs one at a time with previous/next controls
- **Calibration Mode** (developer) — Precisely position anchor points on the 3D character and export `calibration.json`
- **Responsive** — Works on mobile (stacked layout) and desktop (side-panel layout)
- **Customizable** — Coaches define their own signs by editing a single JSON file

---

## Prerequisites

- Node.js 18 or later
- npm

---

## Installation

```bash
git clone <repo-url>
cd baseball-signs
npm install
```

---

## Running Locally

```bash
npm run dev
```

Open [http://localhost:5173/baseball-signs-quiz/](http://localhost:5173/baseball-signs-quiz/)

---

## Production Build

```bash
npm run build    # outputs to dist/
npm run preview  # preview the build locally
```

---

## Running Tests

```bash
npm test              # run all tests once
npm run test:watch    # watch mode
npm run test:coverage # generate coverage report
```

---

## Customizing Signs

Edit `public/signs.json` to define your team's signs. This file is loaded at runtime so coaches can change it without rebuilding the app.

```json
{
  "indicator": "billOfCap",
  "signs": {
    "Hit & Run":     ["leftArm"],
    "Squeeze Bunt":  ["chin"],
    "Take":          ["frontOfHand"],
    "Bunt 1st Base": ["nose", "leftEar"]
  }
}
```

- **`indicator`** — The anchor touch that "activates" the next sign in Game Day mode. All touches before the indicator are decoys.
- **`signs`** — Maps a meaning string (the quiz answer) to an ordered array of anchor names.
- Single-anchor signs: one touch `["chin"]`
- Multi-anchor signs: sequence of touches `["nose", "leftEar"]`

### Available Anchor Names

| Key | Body Part |
|-----|-----------|
| `billOfCap` | Bill of cap |
| `topOfHead` | Top of head |
| `backOfHead` | Back of head |
| `nose` | Nose |
| `chin` | Chin |
| `leftEar` | Left ear |
| `rightEar` | Right ear |
| `chest` | Chest |
| `belt` | Belt |
| `leftArm` | Left upper arm |
| `frontOfLeg` | Front of right thigh |
| `backOfLeg` | Back of right thigh |
| `frontOfHand` | Palm of left hand |
| `backOfHand` | Back of left hand |

---

## Calibration (Developer)

To fine-tune anchor positions for a different character model, add `?calibrate` to the URL:

```
http://localhost:5173/baseball-signs-quiz/?calibrate
```

This unlocks the **Calibrate** tab. After adjusting positions, rotations, and arm poses with the sliders:

1. Click **Save** — downloads `calibration.json` and saves to localStorage
2. Copy the file to `public/calibration.json`
3. Rebuild and deploy — the calibration is now permanent for all users

The calibration file is authoritative over localStorage; localStorage is used as a fast local cache so there is no visible flash on reload.

---

## Deployment (GitHub Pages)

1. Set `base` in `vite.config.js` to match your repository name:
   ```js
   base: '/your-repo-name/',
   ```
2. Build:
   ```bash
   npm run build
   ```
3. Deploy the `dist/` folder to GitHub Pages (e.g. via `gh-pages` branch or GitHub Actions).

---

## Project Structure

```
├── public/
│   ├── models/Idle.fbx        # 3D character (Mixamo FBX)
│   ├── signs.json             # Coach-editable sign definitions
│   └── calibration.json       # Saved anchor calibration
├── src/
│   ├── App.vue                # Root layout, mode tabs
│   ├── components/
│   │   ├── SceneView.vue      # Three.js canvas + provide/inject hub
│   │   ├── QuizPanel.vue      # Quiz game modes
│   │   ├── ReviewPanel.vue    # Review (list + flashcard)
│   │   └── CalibrationPanel.vue
│   ├── composables/
│   │   ├── useScene.js        # Three.js scene, lighting, model loading
│   │   ├── useAnchors.js      # 14 named body-part positions
│   │   ├── useIK.js           # Two-bone IK solver (right arm)
│   │   ├── useSequencer.js    # GSAP animation sequencer
│   │   ├── useSignDefs.js     # Sign definition loader
│   │   └── boneUtils.js       # Mixamo bone prefix detection
│   └── data/
│       └── signs.js           # Hardcoded fallback sign definitions
└── tests/                     # Vitest unit tests
```
