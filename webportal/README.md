# MultiPulse Session Portal

Client-side web app for reviewing MultiPulse heart-rate comparison sessions. List sessions from the MultiPulse HTTPS API (uploaded by the Android app), open them for chart/scoring review, rename or delete cloud sessions, or load a local JSON export. Chart scoring stays in the browser; the API is used for list / detail / rename / delete / upload.

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

Deploy the `dist/` folder at `https://your-host/webportal/` (matches the marketing site link). The portal origin must be allowed in the API’s `cors_origin` (e.g. `https://multipulse.andycr15.co.uk`).

## API / sign-in

1. Open **Sign in** in the portal.
2. Click **Sign in with Google** (Google Identity Services).
3. Portal posts the Google ID token to `POST /v1/auth/google` and stores the returned `apiToken`.
4. Session calls use `Authorization: Bearer <apiToken>`.

Google Cloud / OAuth checklist (Web client):

- Client ID: `98295308508-shvmkftcupektokamb9g2nfd3bkfi196.apps.googleusercontent.com`
- Authorized JavaScript origins must include `https://multipulse.andycr15.co.uk` (and `http://localhost:5173` for Vite if developing locally)

| Action | Method |
| --- | --- |
| Google exchange | `POST /v1/auth/google` body `{ "idToken": "..." }` (no Authorization) |
| List sessions | `GET /v1/sessions` (optional per-session `averageBpm` = mean HR across all devices) |
| Open session | `GET /v1/sessions/{clientSessionId}` → use `payload` |
| Rename session | `POST /v1/sessions/{clientSessionId}/rename` body `{ "displayName": "..." }` (uses POST so existing CORS methods work) |
| Delete session | `DELETE /v1/sessions/{clientSessionId}` (expects `{ "deleted": true }`) |
| Upload session | `POST /v1/sessions` body = MultiPulse export JSON |

**Token rotation:** each successful Google sign-in rotates `apiToken` server-side. The portal keeps you signed in via `localStorage` and, on a 401, silently refreshes through Google Identity Services (One Tap auto-select) to obtain a new `apiToken`. Only if that fails are you signed out with a clear message. Explicit **Sign out** always clears local credentials.

Local JSON upload: when signed in, the portal asks whether to add the file to the cloud library (`POST /v1/sessions`) or open it locally only.

Advanced (optional): API base URL + manual Bearer token under Settings.

Out of scope: `POST /v1/accounts`, email/password registration.

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

For each integer second `t`, each device uses its **most recent successful poll** (`bpm > 0`) in the last **2 seconds** ending when that second ends — window `[t − 1, t + 1)`. If a device has not polled successfully in that window, it is treated as missing (`null`) for that second. Chart and scoring (including Wizard) all use this aligned timeline.

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
