import { useEffect, useRef } from 'react'

interface ScoringHelpModalProps {
  open: boolean
  onClose: () => void
}

export function ScoringHelpModal({ open, onClose }: ScoringHelpModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal__dialog modal__dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scoring-help-title"
      >
        <div className="modal__header">
          <div>
            <p className="eyebrow">Help</p>
            <h2 id="scoring-help-title">How scoring works</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="button button--ghost button--small"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="help-modal">
          <section>
            <h3>Timeline &amp; chart</h3>
            <p>
              Samples are aligned to a 1&nbsp;Hz timeline. For each integer
              second, the chart shows a device’s <strong>last successful poll</strong>{' '}
              (<code>bpm &gt; 0</code>) in that second. If the device did not
              poll successfully that second, the chart shows a gap — nothing is
              invented or carried forward on the chart.
            </p>
            <p>
              If a device polls several times in one second, you still see one
              chart point for that second (the latest successful reading). Use{' '}
              <strong>Total polls</strong> for the full count.
            </p>
          </section>

          <section>
            <h3>Score columns</h3>
            <dl className="help-modal__dl">
              <div>
                <dt>Rank</dt>
                <dd>
                  Order by ascending mean absolute error (lower error is better).
                  Devices with no score show — (for example the Source of truth
                  reference itself).
                </dd>
              </div>
              <div>
                <dt>Samples</dt>
                <dd>
                  How many seconds in the current window have a{' '}
                  <strong>true</strong> 1&nbsp;Hz poll for that device (not
                  lookback-filled).
                </dd>
              </div>
              <div>
                <dt>Total polls</dt>
                <dd>
                  Every successful raw reading (<code>bpm &gt; 0</code>) in the
                  window, including multiple polls in the same second.
                </dd>
              </div>
              <div>
                <dt>Coverage</dt>
                <dd>
                  Share of timeline seconds in the window where the device had a
                  true poll.
                </dd>
              </div>
              <div>
                <dt>Mean error</dt>
                <dd>
                  Mean absolute error in bpm versus the reference (Source of
                  truth monitor, or Wizard consensus). Lower is better.
                </dd>
              </div>
              <div>
                <dt>Max error</dt>
                <dd>
                  Worst single-second absolute error in the window, with the
                  session time when it first occurs.
                </dd>
              </div>
              <div>
                <dt>Seconds compared</dt>
                <dd>
                  How many seconds contributed to that device’s error score
                  (seconds where both the device and the reference were
                  available for comparison).
                </dd>
              </div>
            </dl>
            <p>
              All stats follow the chart’s <strong>visible time window</strong>{' '}
              (zoom/pan). Unzoomed is labeled Full session.
            </p>
          </section>

          <section>
            <h3>Source of truth</h3>
            <p>
              Available with ≥2 devices. You pick one monitor as the
              known-good reference. For each second where{' '}
              <strong>both</strong> the reference and a candidate have a true
              poll:
            </p>
            <p>
              <code>error = |candidate − reference|</code>
            </p>
            <p>
              Candidates are ranked by mean absolute error. The reference device
              is not ranked.
            </p>
          </section>

          <section>
            <h3>Wizard</h3>
            <p>
              Available with ≥3 devices. For each second, Wizard may resolve each
              device via a <strong>2 second lookback</strong> (most recent
              successful poll ending when that second ends) when building
              consensus. The chart still shows true polls only.
            </p>
            <p>When ≥3 devices have a lookback reading:</p>
            <ol>
              <li>
                Find the single <strong>outlier</strong> — largest absolute
                deviation from that second’s median (ties: smaller device id).
              </li>
              <li>Drop the outlier.</li>
              <li>
                <strong>Reference</strong> = mean of the remaining devices
                (kept as a float, not rounded).
              </li>
              <li>
                Record <code>|bpm − reference|</code> only for devices with a{' '}
                <strong>true poll in that second</strong>. Devices that only
                contributed via lookback are not scored for that second.
              </li>
            </ol>
            <p>
              You can optionally plot the Wizard reference as a dashed line on
              the chart.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
