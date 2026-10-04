/**
 * Linearly fill null runs that sit between two known samples.
 * Leading / trailing nulls stay null (no extrapolation).
 */
export function interpolateGaps(
  values: (number | null)[],
): (number | null)[] {
  const out = values.slice()
  const n = out.length
  let i = 0
  while (i < n) {
    if (out[i] !== null) {
      i++
      continue
    }
    const gapStart = i
    while (i < n && out[i] === null) i++
    const gapEnd = i // first non-null after gap, or n
    const left = gapStart - 1
    const right = gapEnd
    if (left < 0 || right >= n) continue
    const leftVal = out[left] as number
    const rightVal = out[right] as number
    const span = right - left
    for (let g = gapStart; g < gapEnd; g++) {
      const t = (g - left) / span
      out[g] = leftVal + (rightVal - leftVal) * t
    }
  }
  return out
}
