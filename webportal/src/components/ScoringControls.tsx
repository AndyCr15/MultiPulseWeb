import { canUseWizard } from '../lib/scoring'
import type { ScoringMode, Source } from '../types'

interface ScoringControlsProps {
  sources: Source[]
  mode: ScoringMode
  onChange: (mode: ScoringMode) => void
  showWizardReference: boolean
  onToggleWizardReference: (show: boolean) => void
}

export function ScoringControls({
  sources,
  mode,
  onChange,
  showWizardReference,
  onToggleWizardReference,
}: ScoringControlsProps) {
  const wizardOk = canUseWizard(sources.length)
  const referenceId =
    mode.type === 'sourceOfTruth'
      ? mode.referenceId
      : sources[0]?.id ?? ''

  return (
    <section className="scoring-controls" aria-label="Scoring mode">
      <div className="scoring-controls__modes" role="group" aria-label="Mode">
        <button
          type="button"
          className={`chip ${mode.type === 'sourceOfTruth' ? 'chip--active' : ''}`}
          onClick={() =>
            onChange({ type: 'sourceOfTruth', referenceId })
          }
        >
          Source of truth
        </button>
        <button
          type="button"
          className={`chip ${mode.type === 'wizard' ? 'chip--active' : ''}`}
          disabled={!wizardOk}
          title={
            wizardOk
              ? 'Consensus scoring with outlier drop'
              : 'Needs at least 3 devices'
          }
          onClick={() => onChange({ type: 'wizard' })}
        >
          Wizard
        </button>
      </div>

      {mode.type === 'sourceOfTruth' ? (
        <label className="field">
          <span className="field__label">Reference monitor</span>
          <select
            value={mode.referenceId}
            onChange={(e) =>
              onChange({ type: 'sourceOfTruth', referenceId: e.target.value })
            }
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={showWizardReference}
            onChange={(e) => onToggleWizardReference(e.target.checked)}
          />
          <span>Show Wizard reference on chart</span>
        </label>
      )}
    </section>
  )
}
