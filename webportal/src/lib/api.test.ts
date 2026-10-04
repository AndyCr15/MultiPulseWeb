import { describe, expect, it } from 'vitest'
import { ApiError } from './api'

describe('ApiError', () => {
  it('carries status and code for UI mapping', () => {
    const err = new ApiError('Unauthorized (401)', {
      code: 'unauthorized',
      status: 401,
    })
    expect(err.code).toBe('unauthorized')
    expect(err.status).toBe(401)
    expect(err.message).toMatch(/401/)
  })
})
