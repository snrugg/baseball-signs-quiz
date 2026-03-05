/**
 * Baseball sign definitions for the quiz.
 *
 * INDICATOR  — the anchor that "activates" the next meaningful sign in Game Day mode.
 *              It is NOT listed in SIGN_MEANINGS (it has no call meaning itself).
 *
 * SIGN_MEANINGS — maps anchor name → baseball call name.
 *   Only these anchors appear as quiz answers.
 *   All other anchors (not here, not the indicator) are silent decoys.
 *
 * Edit this file freely to reassign calls, add new meanings, or change the indicator.
 */

/** The anchor name that acts as the indicator sign in Game Day mode */
export const INDICATOR = 'billOfCap'

/**
 * Anchor name → baseball call name.
 * Anchors not listed here (and not INDICATOR) are decoys with no meaning.
 */
export const SIGN_MEANINGS = {
  topOfHead: 'Steal',
  nose:      'Take',
  chin:      'Bunt',
  chest:     'Hit and Run',
  belt:      'Squeeze Play',
  leftArm:   'Hit Away',
}
