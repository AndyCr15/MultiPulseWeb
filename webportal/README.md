# MultiPulse Session Portal

Client-side web app for reviewing MultiPulse heart-rate comparison JSON exports. Upload a session, inspect multi-monitor BPM traces, and score monitors for accuracy. **No backend — data never leaves the browser.**

## Run locally

```bash
cd webportal
npm install
npm run dev
```

Open the URL Vite prints (app is served under `/webportal/`).

```bash
npm test          # unit tests
npm run build     # production build → dist/
npm run preview   # preview the production build
```

Deploy the `dist/` folder at `https://your-host/webportal/` (matches the marketing site link).

## JSON schema

Filenames like `multipulse-<sessionId>.json` or older `hr-comparison-*.json`.

```json
{
  "sessionId": "uuid",
  "startedAt": "ISO-8601",
  "endedAt": "ISO-8601",
  "sources": [
    { "id": "AA:BB:CC:DD:EE:FF", "name": "Device name" }
  ],
  "samples": [
    { "t": 12.345, "sourceId": "AA:BB:CC:DD:EE:FF", "bpm": 142 }
  ],
  "report": []
}
```

- `t` is seconds since session start (float).
- Samples with `bpm <= 0` are ignored.
- The embedded `report` is phone-side nearest-peer agreement; the portal **recomputes** scoring from samples.

Demo fixtures live in `fixtures/` and `public/fixtures/`.

## Timeline (1 Hz)

For each integer second `t`, the portal uses the **last** sample with `tSeconds ∈ [t, t+1)` and `bpm > 0`. Missing seconds are treated as null. All scoring uses this aligned timeline.

## Scoring modes

### Source of truth (≥ 2 devices)

Pick one monitor as the known-good reference. For each second where both reference and candidate have a BPM:

`error = |candidate − reference|`

Per candidate:

| Stat | Meaning |
| --- | --- |
| Mean absolute error (bpm) | Primary score (lower is better) |
| Max absolute error | Worst single-second miss |
| Seconds compared | Seconds with both present |
| Coverage % | Share of timeline seconds with a reading |

Candidates are ranked by ascending mean absolute error. The reference itself is not ranked.

### Wizard (≥ 3 devices)

For each second with **≥ 3** devices present:

1. Find the single **outlier** — largest absolute deviation from that second’s **median**. Tie-break: smaller `sourceId` (lexicographic).
2. Drop the outlier.
3. **Reference** = mean of the remaining devices (**kept as float**, not rounded).
4. For every device that had a reading that second (including the outlier), record `|bpm − reference|`.

Seconds with fewer than 3 present devices are skipped. Per-device stats match Source of truth. Optionally plot the Wizard reference as a dashed series on the chart.

## Chart interactions

- Drag horizontally to zoom a time range
- Mouse wheel to zoom around the cursor
- **Reset zoom** restores the full session
- Hover shows a vertical crosshair and a side readout of each device’s BPM at that second
- **Scores follow the visible window** — zoom/pan and the stats panel recomputes MAE, coverage, and rank for that range only (labeled Full session when unzoomed)

## Project layout

```
webportal/
  src/
    lib/           # parse, 1 Hz bucketing, scoring (pure + tested)
    components/    # upload, chart, scoring controls, stats
    App.tsx
  fixtures/        # tiny demo / test JSON
  public/fixtures/ # served for in-app demos
```
