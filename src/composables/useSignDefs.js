import { ref, computed } from 'vue'
import { DEFAULT_INDICATOR, DEFAULT_SIGN_DEFS } from '../data/signs.js'

/**
 * Loads sign definitions from public/signs.json (coaches can edit freely).
 * Falls back to the hardcoded defaults in src/data/signs.js on 404 or error.
 *
 * signDefs  — reactive ref: { [meaning]: anchorNames[] }
 * indicator — reactive ref: anchor name string
 * signKeys  — computed:     string[] of all meaning keys
 *
 * Usage:
 *   const { signDefs, indicator, signKeys, getSignAnchors, formatSignLabel, loadSignDefs } = useSignDefs()
 *   loadSignDefs()   // async, non-blocking; updates signDefs when done
 */
export function useSignDefs() {
  const signDefs  = ref({ ...DEFAULT_SIGN_DEFS })
  const indicator = ref(DEFAULT_INDICATOR)

  /** All meaning strings — order matches insertion order of signDefs object */
  const signKeys = computed(() => Object.keys(signDefs.value))

  /** Return the anchor array for a meaning (e.g. ['leftArm'] or ['leftEar','nose']). */
  function getSignAnchors(meaning) {
    return signDefs.value[meaning] ?? []
  }

  /**
   * Format an anchor array as a human-readable label using ANCHOR_LABELS.
   * e.g. ['leftEar', 'nose'] → "Left Ear → Nose"
   */
  function formatSignLabel(anchorNames, ANCHOR_LABELS) {
    return anchorNames
      .map(a => ANCHOR_LABELS[a] ?? a)
      .join(' → ')
  }

  /**
   * Fetch public/signs.json and update signDefs + indicator.
   * Silently falls back to defaults on 404 or parse error.
   * Call this once at setup time — it's async and non-blocking.
   */
  async function loadSignDefs() {
    try {
      const url = import.meta.env.BASE_URL + 'signs.json'
      const res = await fetch(url)
      if (!res.ok) return                            // 404 → keep defaults
      const data = await res.json()
      if (data.signs && typeof data.signs === 'object') {
        signDefs.value  = data.signs
        indicator.value = typeof data.indicator === 'string'
          ? data.indicator
          : DEFAULT_INDICATOR
        console.log('Loaded sign definitions from signs.json')
      }
    } catch {
      // Network error, JSON parse error, etc. → keep defaults
    }
  }

  return {
    signDefs,
    indicator,
    signKeys,
    getSignAnchors,
    formatSignLabel,
    loadSignDefs,
  }
}
