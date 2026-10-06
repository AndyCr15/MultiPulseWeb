import { useState } from 'react'
import { colorForSource } from '../lib/colors'
import { formatBpm, formatClock, formatPercent } from '../lib/format'
import type { ScoringResult, Source } from '../types'
import { ScoringHelpModal } from './ScoringHelpModal'

interface StatsPanelProps {
  sources: Source[]
  result: ScoringResult
}

function InfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

export function StatsPanel({ sources, result }: StatsPanelProps) {
  const [helpOpen, setHelpOpen] = useState(false)
  const nameById = new Map(sources.map((s) => [s.id, s.name]))
  const bestName = result.bestSourceId
    ? nameById.get(result.bestSourceId)
    : null
  const worstName = result.worstSourceId
    ? nameById.get(result.worstSourceId)
    : null

  const windowLabel = result.isFullSession
    ? 'Full session'
    : `${formatClock(result.range.min)} – ${formatClock(result.range.max)}`

  return (
    <section className="stats" aria-labelledby="stats-heading">
      <div className="stats__header">
        <div>
          <p className="eyebrow">Scores</p>
          <div className="stats__title-row">
            <h2 id="stats-heading">{result.modeLabel}</h2>
            <button
              type="button"
              className="stats__info"
              title="How scoring works"
              aria-label="How scoring works"
              onClick={() => setHelpOpen(true)}
            >
              <InfoIcon />
            </button>
          </div>
          <p className="stats__window">
            <span className="muted">Window</span> {windowLabel}
          </p>
        </div>
        <div className="stats__summary">
          {bestName ? (
            <p>
              <span className="muted">Best</span> {bestName}
            </p>
          ) : null}
          {worstName && worstName !== bestName ? (
            <p>
              <span className="muted">Worst</span> {worstName}
            </p>
          ) : null}
        </div>
      </div>

      <div className="stats__table-wrap">
        <table className="stats__table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Device</th>
              <th scope="col">Samples</th>
              <th scope="col">Total polls</th>
              <th scope="col">Coverage</th>
              <th scope="col">Mean error</th>
              <th scope="col">Max error</th>
              <th scope="col">Seconds compared</th>
            </tr>
          </thead>
          <tbody>
            {[...result.scores]
              .sort((a, b) => {
                if (a.rank === null && b.rank === null) return 0
                if (a.rank === null) return 1
                if (b.rank === null) return -1
                return a.rank - b.rank
              })
              .map((row) => {
                const colorIndex = sources.findIndex(
                  (s) => s.id === row.sourceId,
                )
                return (
                  <tr
                    key={row.sourceId}
                    className={
                      row.sourceId === result.bestSourceId
                        ? 'stats__row--best'
                        : undefined
                    }
                  >
                    <td>{row.rank ?? '—'}</td>
                    <td>
                      <span className="device-cell">
                        <span
                          className="swatch"
                          style={{
                            background: colorForSource(
                              row.sourceId,
                              colorIndex,
                            ),
                          }}
                          aria-hidden="true"
                        />
                        {row.sourceName}
                      </span>
                    </td>
                    <td>{row.sampleCount}</td>
                    <td>{row.totalPolls}</td>
                    <td>{formatPercent(row.coveragePercent)}</td>
                    <td>
                      {row.meanAbsoluteError === null
                        ? '—'
                        : `${formatBpm(row.meanAbsoluteError)} bpm`}
                    </td>
                    <td>
                      {row.maxAbsoluteError === null ? (
                        '—'
                      ) : (
                        <>
                          {formatBpm(row.maxAbsoluteError)} bpm
                          {row.maxAbsoluteErrorAtSec !== null ? (
                            <span className="stats__max-at">
                              {' '}
                              ({formatClock(row.maxAbsoluteErrorAtSec)})
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td>{row.secondsCompared}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <p className="stats__note">
        Lower mean absolute error is better. Use the info icon for column
        definitions, Wizard, and scoring details.
      </p>

      <ScoringHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  )
}
