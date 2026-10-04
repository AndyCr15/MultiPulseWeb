import { useState, type FormEvent } from 'react'
import {
  DEFAULT_API_BASE,
  type ApiSettings,
  saveApiSettings,
} from '../lib/apiSettings'

interface SettingsPanelProps {
  settings: ApiSettings
  onSaved: (settings: ApiSettings) => void
  onCancel?: () => void
}

export function SettingsPanel({
  settings,
  onSaved,
  onCancel,
}: SettingsPanelProps) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || DEFAULT_API_BASE)
  const [token, setToken] = useState(settings.token)
  const [savedFlash, setSavedFlash] = useState(false)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const next = saveApiSettings({ baseUrl, token })
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
          <p className="eyebrow">API</p>
          <h2 id="settings-heading">Settings / sign in</h2>
        </div>
        {onCancel ? (
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Back
          </button>
        ) : null}
      </div>

      <p className="settings__lede">
        Paste the Bearer API token from your MultiPulse account. It is stored only
        in this browser’s localStorage — never committed or uploaded elsewhere.
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
          <span className="field__label">API token</span>
          <input
            type="password"
            name="token"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste Bearer token"
            required
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
    </section>
  )
}
