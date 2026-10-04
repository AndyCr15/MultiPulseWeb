import { exchangeGoogleIdToken, ApiError, setAuthRefreshHandler } from './api'
import {
  clearSignedInState,
  hasApiToken,
  loadApiSettings,
  saveApiSettings,
  type ApiSettings,
} from './apiSettings'
import { clearGoogleSessionState, requestGoogleIdToken } from './googleGis'

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

/**
 * Silently (or near-silently) obtain a fresh MultiPulse apiToken via Google.
 * Used when the stored token was rotated (e.g. phone signed in) or expired.
 */
export async function refreshApiTokenViaGoogle(): Promise<boolean> {
  if (!hasApiToken() && !loadApiSettings().email) {
    // Still try auto-select — GIS may remember the account.
  }
  try {
    const idToken = await requestGoogleIdToken({
      autoSelect: true,
      timeoutMs: 15_000,
    })
    await completeGoogleSignIn(idToken)
    return true
  } catch {
    return false
  }
}

/** Wire silent refresh into the API client (call once at app startup). */
export function installAuthRefresh(): void {
  setAuthRefreshHandler(refreshApiTokenViaGoogle)
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
