/** Distinct, stable palette for up to 8 monitors. */
const PALETTE = [
  '#6fd3d6', // mint
  '#f0a35e', // amber
  '#7eb6ff', // sky
  '#e87a9a', // rose
  '#b4e07a', // lime
  '#c9a0ff', // lilac
  '#ffd166', // gold
  '#ff6b6b', // coral
]

/** Stable colour for a source id (hash → palette index). */
export function colorForSource(sourceId: string, indexHint?: number): string {
  if (typeof indexHint === 'number' && indexHint >= 0 && indexHint < PALETTE.length) {
    return PALETTE[indexHint]
  }
  let hash = 0
  for (let i = 0; i < sourceId.length; i++) {
    hash = (hash * 31 + sourceId.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}

export const WIZARD_REF_COLOR = 'rgba(232, 242, 246, 0.55)'
