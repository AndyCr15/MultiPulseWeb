import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  authErrorMessage,
  completeGoogleSignIn,
  signOutPortal,
} from '../lib/auth'
import {
  DEFAULT_API_BASE,
  type ApiSettings,
  saveApiSettings,
} from '../lib/apiSettings'
import { initializeGoogleId } from '../lib/googleGis'

interface SettingsPanelProps {
  settings: ApiSettings
  signOutReason?: string | null
  onSaved: (settings: ApiSettings) => void
  onSignedIn?: (settings: ApiSettings) => void
  onSignedOut?: (settings: ApiSettings) => void
  onCancel?: () => void
}

export function SettingsPanel({
  settings,
  signOutReason,
  onSaved,
  onSignedIn,
  onSignedOut,
  onCancel,
}: SettingsPanelProps) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || DEFAULT_API_BASE)
  const [token, setToken] = useState(settings.token)
  const [savedFlash, setSavedFlash] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [gisReady, setGisReady] = useState(false)
  const buttonHostRef = useRef<HTMLDivElement>(null)
  const baseUrlRef = useRef(baseUrl)
  const onSignedInRef = useRef(onSignedIn)
  const signedIn = settings.token.length > 0

  baseUrlRef.current = baseUrl
  onSignedInRef.current = onSignedIn

  useEffect(() => {
    setBaseUrl(settings.baseUrl || DEFAULT_API_BASE)
    setToken(settings.token)
  }, [settings])

  useEffect(() => {
    if (signedIn) return
    let cancelled = false

    const mount = async () => {
      setAuthError(null)
      try {
        const id = await initializeGoogleId(async (idToken) => {
          setAuthBusy(true)
          setAuthError(null)
          try {
            const next = await completeGoogleSignIn(
              idToken,
              baseUrlRef.current,
            )
            onSignedInRef.current?.(next)
          } catch (err) {
            setAuthError(authErrorMessage(err))
          } finally {
            setAuthBusy(false)
          }
        })
        if (cancelled || !buttonHostRef.current) return
        buttonHostRef.current.innerHTML = ''
        id.renderButton(buttonHostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 280,
        })
        setGisReady(true)
        // One Tap / FedCM prompt as a secondary path.
        id.prompt()
      } catch (err) {
        if (!cancelled) {
          setAuthError(authErrorMessage(err))
          setGisReady(false)
        }
      }
    }

    void mount()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  const onGoogleSignOut = () => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      const next = signOutPortal()
      setToken('')
      onSignedOut?.(next)
    } catch (err) {
      setAuthError(authErrorMessage(err))
    } finally {
      setAuthBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const next = saveApiSettings({
      ...settings,
      baseUrl,
      token,
      // Keep profile fields unless clearing token manually.
      displayName: token ? settings.displayName : '',
      email: token ? settings.email : '',
      accountId: token ? settings.accountId : null,
    })
    setBaseUrl(next.baseUrl)
    setToken(next.token)
    setSavedFlash(true)
    onSaved(next)
    window.setTimeout(() => setSavedFlash(false), 1600)
  }

  return (
    <section className="settings" aria-labelledby="settings-heading">
      <div className="settings__header">
        <div>
          <p className="eyebrow">Account</p>
          <h2 id="settings-heading">
            {signedIn ? 'Signed in' : 'Sign in with Google'}
          </h2>
        </div>
        {onCancel ? (
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Back
          </button>
        ) : null}
      </div>

      {signOutReason && !signedIn ? (
        <p className="upload__error" role="alert">
          {signOutReason}
        </p>
      ) : null}

      <div className="settings__google">
        {signedIn ? (
          <>
            <p className="settings__user">
              Signed in as{' '}
              <strong>{settings.displayName || settings.email || 'MultiPulse user'}</strong>
              {settings.email && settings.displayName ? (
                <span className="muted"> ({settings.email})</span>
              ) : null}
            </p>
            <p className="settings__lede">
              You stay signed in on this browser until you sign out. Same Google
              account as the MultiPulse Android app — if you sign in on your phone,
              this browser refreshes its token automatically when needed.
            </p>
            <button
              type="button"
              className="button button--ghost"
              disabled={authBusy}
              onClick={onGoogleSignOut}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="settings__lede">
              Sign in with the same Google account you use in the MultiPulse Android
              app to see your uploaded sessions.
            </p>
            <div
              ref={buttonHostRef}
              className="settings__gis-button"
              aria-busy={!gisReady || authBusy}
            />
            {!gisReady && !authError ? (
              <p className="muted" role="status">
                Loading Google Sign-In…
              </p>
            ) : null}
            {authBusy ? (
              <p className="muted" role="status">
                Completing sign-in…
              </p>
            ) : null}
          </>
        )}
        {authError ? (
          <p className="upload__error" role="alert">
            {authError}
          </p>
        ) : null}
      </div>

      <details className="settings__advanced">
        <summary>Advanced: API base URL &amp; manual token</summary>
        <p className="settings__lede">
          Dev fallback only. Prefer Google Sign-In. A successful Google sign-in
          rotates the account apiToken on the server (phone and portal share one
          active token at a time).
        </p>

        <form className="settings__form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">API base URL</span>
            <input
              type="url"
              name="baseUrl"
              autoComplete="off"
              spellCheck={false}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={DEFAULT_API_BASE}
              required
            />
          </label>

          <label className="field">
            <span className="field__label">API token (optional)</span>
            <input
              type="password"
              name="token"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste Bearer token"
            />
          </label>

          <div className="settings__actions">
            <button type="submit" className="button button--primary">
              Save
            </button>
            {savedFlash ? (
              <span className="settings__saved" role="status">
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </details>
    </section>
  )
}
