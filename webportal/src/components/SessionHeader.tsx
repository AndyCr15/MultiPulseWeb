import { colorForSource } from '../lib/colors'
import { formatDuration, formatSessionTime } from '../lib/format'
import type { Session } from '../types'

interface SessionHeaderProps {
  session: Session
  title?: string
  backLabel?: string
  onClear: () => void
}

export function SessionHeader({
  session,
  title,
  backLabel = 'Back to library',
  onClear,
}: SessionHeaderProps) {
  const durationSec =
    (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000

  return (
    <section className="session-meta" aria-labelledby="session-heading">
      <div className="session-meta__row">
        <div>
          <p className="eyebrow">Session</p>
          <h2 id="session-heading" className="session-meta__id">
            {title || session.sessionId}
          </h2>
          {title && title !== session.sessionId ? (
            <p className="session-meta__subid">{session.sessionId}</p>
          ) : null}
        </div>
        <button type="button" className="button button--ghost" onClick={onClear}>
          {backLabel}
        </button>
      </div>

      <dl className="session-meta__grid">
        <div>
          <dt>Started</dt>
          <dd>{formatSessionTime(session.startedAt)}</dd>
        </div>
        <div>
          <dt>Ended</dt>
          <dd>{formatSessionTime(session.endedAt)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(durationSec)}</dd>
        </div>
        <div>
          <dt>Devices</dt>
          <dd>{session.sources.length}</dd>
        </div>
      </dl>

      <ul className="device-list">
        {session.sources.map((source, i) => (
          <li key={source.id}>
            <span
              className="swatch"
              style={{ background: colorForSource(source.id, i) }}
              aria-hidden="true"
            />
            <span className="device-list__name">{source.name}</span>
            <span className="device-list__id">{source.id}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
