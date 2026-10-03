import { useEffect, useMemo, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { colorForSource, WIZARD_REF_COLOR } from '../lib/colors'
import { formatClock } from '../lib/format'
import type { Session, TimeRange, Timeline } from '../types'

interface HoverReading {
  sourceId: string
  name: string
  color: string
  bpm: number | null
}

interface HrChartProps {
  session: Session
  timeline: Timeline
  wizardReference?: (number | null)[] | null
  showWizardReference: boolean
  onViewRangeChange?: (range: TimeRange) => void
}

function toPlotNulls(values: (number | null)[]): (number | null | undefined)[] {
  // uPlot treats null as a gap; undefined also works. Keep null.
  return values
}

export function HrChart({
  session,
  timeline,
  wizardReference,
  showWizardReference,
  onViewRangeChange,
}: HrChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const onViewRangeChangeRef = useRef(onViewRangeChange)
  onViewRangeChangeRef.current = onViewRangeChange
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverReadings, setHoverReadings] = useState<HoverReading[]>([])

  const emitViewRange = (min: number, max: number) => {
    onViewRangeChangeRef.current?.({
      min: Math.floor(Math.min(min, max)),
      max: Math.floor(Math.max(min, max)),
    })
  }

  const sourceMeta = useMemo(
    () =>
      session.sources.map((source, i) => ({
        ...source,
        color: colorForSource(source.id, i),
      })),
    [session.sources],
  )

  const data = useMemo(() => {
    const xs = timeline.seconds.map((s) => s)
    const seriesData: uPlot.AlignedData = [xs]
    for (const source of session.sources) {
      seriesData.push(
        toPlotNulls(timeline.series.get(source.id) ?? []) as number[],
      )
    }
    if (showWizardReference && wizardReference) {
      seriesData.push(toPlotNulls(wizardReference) as number[])
    }
    return seriesData
  }, [session.sources, timeline, wizardReference, showWizardReference])

  const resetZoom = () => {
    const plot = plotRef.current
    if (!plot) return
    plot.setScale('x', {
      min: timeline.seconds[0] ?? 0,
      max: timeline.seconds[timeline.seconds.length - 1] ?? 1,
    })
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const series: uPlot.Series[] = [
      {
        label: 'Time',
        value: (_u, v) => (v == null ? '—' : formatClock(v)),
      },
    ]

    for (const source of sourceMeta) {
      series.push({
        label: source.name,
        stroke: source.color,
        width: 2,
        spanGaps: false,
        points: { show: false },
        value: (_u, v) => (v == null ? '—' : `${v.toFixed(0)} bpm`),
      })
    }

    if (showWizardReference && wizardReference) {
      series.push({
        label: 'Wizard ref',
        stroke: WIZARD_REF_COLOR,
        width: 1.5,
        dash: [6, 4],
        spanGaps: false,
        points: { show: false },
        value: (_u, v) => (v == null ? '—' : `${v.toFixed(1)} bpm`),
      })
    }

    const chartHeight = () =>
      Math.max(320, Math.round(el.clientHeight || el.getBoundingClientRect().height || 480))

    const opts: uPlot.Options = {
      width: el.clientWidth || 800,
      height: chartHeight(),
      class: 'hr-uplot',
      scales: {
        x: {
          time: false,
        },
        y: {
          auto: true,
        },
      },
      axes: [
        {
          stroke: 'rgba(232, 242, 246, 0.55)',
          grid: { stroke: 'rgba(232, 242, 246, 0.08)' },
          ticks: { stroke: 'rgba(232, 242, 246, 0.2)' },
          font: '12px "Source Sans 3", sans-serif',
          values: (_u, splits) => splits.map((v) => formatClock(v)),
          label: 'Time',
          labelFont: '12px "Source Sans 3", sans-serif',
          labelSize: 18,
        },
        {
          stroke: 'rgba(232, 242, 246, 0.55)',
          grid: { stroke: 'rgba(232, 242, 246, 0.08)' },
          ticks: { stroke: 'rgba(232, 242, 246, 0.2)' },
          font: '12px "Source Sans 3", sans-serif',
          label: 'BPM',
          labelFont: '12px "Source Sans 3", sans-serif',
          labelSize: 18,
          size: 48,
        },
      ],
      series,
      cursor: {
        sync: { key: 'multipulse' },
        drag: {
          x: true,
          y: false,
          setScale: true,
        },
        focus: { prox: 24 },
        points: {
          size: 7,
          width: 2,
        },
      },
      legend: { show: false },
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx
            if (idx == null || idx < 0) {
              setHoverTime(null)
              setHoverReadings([])
              return
            }
            const t = u.data[0][idx] as number
            setHoverTime(t)
            const readings: HoverReading[] = sourceMeta.map((source, i) => {
              const raw = u.data[i + 1][idx]
              return {
                sourceId: source.id,
                name: source.name,
                color: source.color,
                bpm: raw == null ? null : (raw as number),
              }
            })
            setHoverReadings(readings)
          },
        ],
        setScale: [
          (u, key) => {
            if (key !== 'x') return
            const min = u.scales.x.min
            const max = u.scales.x.max
            if (min == null || max == null) return
            emitViewRange(min, max)
          },
        ],
        ready: [
          (u) => {
            const min = u.scales.x.min
            const max = u.scales.x.max
            if (min == null || max == null) return
            emitViewRange(min, max)
          },
        ],
      },
    }

    const plot = new uPlot(opts, data, el)
    plotRef.current = plot

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const xScale = plot.scales.x
      if (xScale.min == null || xScale.max == null) return
      const rect = plot.over.getBoundingClientRect()
      const left = e.clientX - rect.left
      const pct = left / rect.width
      const range = xScale.max - xScale.min
      const zoom = e.deltaY < 0 ? 0.8 : 1.25
      const newRange = Math.max(5, range * zoom)
      const center = xScale.min + range * pct
      let min = center - newRange * pct
      let max = center + newRange * (1 - pct)
      const dataMin = timeline.seconds[0] ?? 0
      const dataMax = timeline.seconds[timeline.seconds.length - 1] ?? 1
      if (min < dataMin) {
        max += dataMin - min
        min = dataMin
      }
      if (max > dataMax) {
        min -= max - dataMax
        max = dataMax
      }
      min = Math.max(dataMin, min)
      max = Math.min(dataMax, max)
      plot.setScale('x', { min, max })
    }

    plot.over.addEventListener('wheel', onWheel, { passive: false })

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return
      plot.setSize({
        width: containerRef.current.clientWidth,
        height: chartHeight(),
      })
    })
    ro.observe(el)

    return () => {
      plot.over.removeEventListener('wheel', onWheel)
      ro.disconnect()
      plot.destroy()
      plotRef.current = null
    }
    // Recreate when series composition changes (wizard ref toggle / session).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId, sourceMeta, showWizardReference, !!wizardReference])

  useEffect(() => {
    // Keep the user's zoom when series data refreshes (e.g. wizard ref).
    plotRef.current?.setData(data, false)
  }, [data])

  return (
    <section className="chart-panel" aria-label="Heart rate chart">
      <div className="chart-panel__toolbar">
        <div className="chart-legend">
          {sourceMeta.map((source) => (
            <span key={source.id} className="chart-legend__item">
              <span
                className="swatch"
                style={{ background: source.color }}
                aria-hidden="true"
              />
              {source.name}
            </span>
          ))}
          {showWizardReference && wizardReference ? (
            <span className="chart-legend__item chart-legend__item--dashed">
              <span className="swatch swatch--dashed" aria-hidden="true" />
              Wizard ref
            </span>
          ) : null}
        </div>
        <button type="button" className="button button--ghost" onClick={resetZoom}>
          Reset zoom
        </button>
      </div>

      <div className="chart-panel__body">
        <div ref={containerRef} className="chart-panel__canvas" />
        <aside className="chart-readout" aria-live="polite">
          <p className="chart-readout__time">
            {hoverTime == null ? 'Hover the chart' : formatClock(hoverTime)}
          </p>
          <ul>
            {hoverReadings.length === 0
              ? sourceMeta.map((s) => (
                  <li key={s.id}>
                    <span className="swatch" style={{ background: s.color }} />
                    <span>{s.name}</span>
                    <strong>—</strong>
                  </li>
                ))
              : hoverReadings.map((r) => (
                  <li key={r.sourceId}>
                    <span className="swatch" style={{ background: r.color }} />
                    <span>{r.name}</span>
                    <strong>{r.bpm == null ? '—' : `${Math.round(r.bpm)}`}</strong>
                  </li>
                ))}
          </ul>
          <p className="chart-readout__hint">
            Drag to zoom · scroll to zoom · reset restores full ride
          </p>
        </aside>
      </div>
    </section>
  )
}
