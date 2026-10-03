import { useCallback, useMemo, useState } from 'react'
import { HrChart } from './components/HrChart'
import { ScoringControls } from './components/ScoringControls'
import { SessionHeader } from './components/SessionHeader'
import { StatsPanel } from './components/StatsPanel'
import { UploadZone } from './components/UploadZone'
import { build1HzTimeline } from './lib/bucket1Hz'
import { parseSession, parseSessionFile } from './lib/parseSession'
import {
  canUseSourceOfTruth,
  canUseWizard,
  fullTimelineRange,
  scoreSession,
} from './lib/scoring'
import type { ScoringMode, Session, TimeRange } from './types'
import './App.css'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<ScoringMode | null>(null)
  const [showWizardReference, setShowWizardReference] = useState(true)
  const [viewRange, setViewRange] = useState<TimeRange | null>(null)

  const timeline = useMemo(
    () => (session ? build1HzTimeline(session) : null),
    [session],
  )

  const scoring = useMemo(() => {
    if (!session || !timeline || !mode) return null
    const range = viewRange ?? fullTimelineRange(timeline)
    return scoreSession(session, timeline, mode, range)
  }, [session, timeline, mode, viewRange])

  const onViewRangeChange = useCallback((range: TimeRange) => {
    setViewRange((prev) => {
      if (prev && prev.min === range.min && prev.max === range.max) return prev
      return range
    })
  }, [])

  const loadSession = (next: Session) => {
    setSession(next)
    setError(null)
    setViewRange(null)
    if (canUseSourceOfTruth(next.sources.length)) {
      setMode({
        type: 'sourceOfTruth',
        referenceId: next.sources[0].id,
      })
    } else {
      setMode(null)
    }
  }

  const onFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const next = await parseSessionFile(file)
      loadSession(next)
    } catch (err) {
      setSession(null)
      setMode(null)
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setBusy(false)
    }
  }

  const loadFixture = async (name: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}fixtures/${name}`)
      if (!res.ok) throw new Error(`Could not load fixture ${name}`)
      const json: unknown = await res.json()
      loadSession(parseSession(json))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fixture')
    } finally {
      setBusy(false)
    }
  }

  const clear = () => {
    setSession(null)
    setMode(null)
    setViewRange(null)
    setError(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__brand">MultiPulse</p>
            <h1>Session Portal</h1>
          </div>
          <p className="app-header__tag">
            Review exported heart-rate comparisons — client-side only.
          </p>
        </div>
      </header>

      <main className="app-main">
        {!session ? (
          <>
            <UploadZone onFile={onFile} busy={busy} error={error} />
            <section className="demo-links" aria-label="Demo sessions">
              <p className="muted">Or try a sample export:</p>
              <div className="demo-links__row">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => loadFixture('demo-two-devices.json')}
                >
                  2-device demo
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => loadFixture('demo-three-devices.json')}
                >
                  3-device demo (Wizard)
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            <SessionHeader session={session} onClear={clear} />

            {mode && canUseSourceOfTruth(session.sources.length) ? (
              <ScoringControls
                sources={session.sources}
                mode={mode}
                onChange={setMode}
                showWizardReference={showWizardReference}
                onToggleWizardReference={setShowWizardReference}
              />
            ) : (
              <p className="notice" role="status">
                Scoring needs at least two monitors. Chart still available.
              </p>
            )}

            {timeline ? (
              <HrChart
                session={session}
                timeline={timeline}
                wizardReference={
                  mode?.type === 'wizard' ? scoring?.wizardReference : null
                }
                showWizardReference={
                  mode?.type === 'wizard' &&
                  showWizardReference &&
                  canUseWizard(session.sources.length)
                }
                onViewRangeChange={onViewRangeChange}
              />
            ) : null}

            {scoring ? (
              <StatsPanel sources={session.sources} result={scoring} />
            ) : null}
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>
          MultiPulse Session Portal · files never leave this device ·{' '}
          <a href="../">Back to MultiPulse</a>
        </p>
      </footer>
    </div>
  )
}
