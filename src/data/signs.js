/**
 * Baseball sign definitions — hardcoded fallback.
 *
 * The app loads `public/signs.json` at runtime (coaches can edit it freely).
 * If the file is missing or unparseable these defaults are used instead.
 *
 * DEFAULT_INDICATOR  — the anchor that "activates" the next meaningful sign in Game Day mode.
 * DEFAULT_SIGN_DEFS  — maps meaning string → array of anchor names.
 *   Single-anchor sign:  { "Hit & Run": ["leftArm"] }
 *   Multi-anchor sign:   { "Curveball": ["leftEar", "nose"] }
 */

/** The anchor name that acts as the indicator sign in Game Day mode */
export const DEFAULT_INDICATOR = 'billOfCap'

/**
 * Meaning string → anchor name array.
 * The meaning string is both the key and the quiz answer.
 */
export const DEFAULT_SIGN_DEFS = {
  'Hit & Run':        ['leftArm'],
  'Straight Steal':   ['frontOfLeg'],
  'Delayed Steal':    ['backOfLeg'],
  'Sacrifice Bunt 1st Base':   ['nose', 'leftEar'],
  'Bunt for Base Hit 1st Base':['topOfHead', 'leftEar'],
  'Sacrifice Bunt 3rd Base':   ['nose', 'rightEar'],
  'Bunt for Base Hit 3rd Base':['topOfHead', 'rightEar'],
  'Squeeze Bunt':     ['chin'],
  'Take':             ['frontOfHand'],
}
