import { GOOGLE_WEB_CLIENT_ID } from './apiSettings'

/** Minimal typings for Google Identity Services used by the portal. */
export interface GoogleCredentialResponse {
  credential: string
  select_by?: string
}

interface GoogleIdConfig {
  client_id: string
  callback: (response: GoogleCredentialResponse) => void
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
  context?: 'signin' | 'signup' | 'use'
  ux_mode?: 'popup' | 'redirect'
  use_fedcm_for_prompt?: boolean
}

interface GoogleButtonConfig {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number | string
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfig) => void
  renderButton: (parent: HTMLElement, config: GoogleButtonConfig) => void
  prompt: (
    notification?: (n: {
      isNotDisplayed: () => boolean
      isSkippedMoment: () => boolean
      isDismissedMoment?: () => boolean
    }) => void,
  ) => void
  disableAutoSelect: () => void
  revoke: (hint: string, callback: (done: { successful: boolean }) => void) => void
  cancel: () => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId
      }
    }
  }
}

let loadPromise: Promise<GoogleAccountsId> | null = null

export function loadGoogleIdentityServices(): Promise<GoogleAccountsId> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In requires a browser'))
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id)
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-multipulse-gis="1"]',
    )
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.accounts?.id) resolve(window.google.accounts.id)
        else reject(new Error('Google Identity Services failed to initialize'))
      })
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Google Identity Services')),
      )
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.multipulseGis = '1'
    script.onload = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id)
      else reject(new Error('Google Identity Services failed to initialize'))
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Failed to load Google Identity Services'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}

export async function initializeGoogleId(
  onCredential: (idToken: string) => void,
  opts?: { autoSelect?: boolean },
): Promise<GoogleAccountsId> {
  const id = await loadGoogleIdentityServices()
  id.initialize({
    client_id: GOOGLE_WEB_CLIENT_ID,
    callback: (response) => {
      if (response?.credential) onCredential(response.credential)
    },
    auto_select: opts?.autoSelect ?? false,
    cancel_on_tap_outside: true,
    context: 'signin',
    ux_mode: 'popup',
  })
  return id
}

/**
 * Request a Google ID token via GIS One Tap / FedCM.
 * With autoSelect=true, reuses the previous Google account when possible
 * so the portal can refresh a rotated MultiPulse apiToken without a full
 * interactive sign-in.
 */
export async function requestGoogleIdToken(opts?: {
  autoSelect?: boolean
  timeoutMs?: number
}): Promise<string> {
  const autoSelect = opts?.autoSelect ?? false
  const timeoutMs = opts?.timeoutMs ?? 20_000
  const id = await loadGoogleIdentityServices()

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      fn()
    }

    const timer = window.setTimeout(() => {
      finish(() =>
        reject(new Error('Google sign-in timed out. Please sign in again.')),
      )
    }, timeoutMs)

    id.initialize({
      client_id: GOOGLE_WEB_CLIENT_ID,
      callback: (response) => {
        if (response?.credential) {
          finish(() => resolve(response.credential))
        } else {
          finish(() => reject(new Error('No Google credential returned')))
        }
      },
      auto_select: autoSelect,
      cancel_on_tap_outside: true,
      context: 'signin',
      ux_mode: 'popup',
    })

    id.prompt((notification) => {
      const unavailable =
        notification.isNotDisplayed() ||
        notification.isSkippedMoment() ||
        Boolean(notification.isDismissedMoment?.())
      if (unavailable) {
        finish(() =>
          reject(
            new Error(
              autoSelect
                ? 'Automatic Google sign-in was not available. Please sign in again.'
                : 'Google sign-in was dismissed.',
            ),
          ),
        )
      }
    })
  })
}

export function clearGoogleSessionState(email?: string): void {
  const id = window.google?.accounts?.id
  if (!id) return
  try {
    id.disableAutoSelect()
    id.cancel()
    if (email) {
      id.revoke(email, () => {
        /* best-effort */
      })
    }
  } catch {
    // ignore
  }
}
