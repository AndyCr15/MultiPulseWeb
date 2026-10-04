import { exchangeGoogleIdToken, ApiError } from './api'
import {
  clearSignedInState,
  hasApiToken,
  loadApiSettings,
  saveApiSettings,
  type ApiSettings,
} from './apiSettings'
import { clearGoogleSessionState } from './googleGis'

export async function completeGoogleSignIn(
  idToken: string,
  baseUrl?: string,
): Promise<ApiSettings> {
  const current = loadApiSettings()
  const result = await exchangeGoogleIdToken(idToken, {
    ...current,
    baseUrl: baseUrl || current.baseUrl,
  })

  return saveApiSettings({
    baseUrl: baseUrl || current.baseUrl,
    token: result.apiToken,
    accountId: result.accountId,
    displayName: result.displayName,
    email: result.email,
  })
}

export function signOutPortal(): ApiSettings {
  const current = loadApiSettings()
  clearGoogleSessionState(current.email || undefined)
  return clearSignedInState()
}

export function isSignedIn(settings: ApiSettings = loadApiSettings()): boolean {
  return hasApiToken(settings)
}

export function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return 'Sign-in failed'
}
