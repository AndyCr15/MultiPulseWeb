import { describe, expect, it } from 'vitest'
import { interpolateGaps } from './interpolateGaps'

describe('interpolateGaps', () => {
  it('fills interior nulls with linear interpolation', () => {
    expect(interpolateGaps([100, null, null, 130])).toEqual([100, 110, 120, 130])
  })

  it('leaves leading and trailing gaps empty', () => {
    expect(interpolateGaps([null, 100, null, 120, null])).toEqual([
      null,
      100,
      110,
      120,
      null,
    ])
  })

  it('returns a copy when there are no gaps', () => {
    const input = [90, 95, 100]
    const out = interpolateGaps(input)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })
})
