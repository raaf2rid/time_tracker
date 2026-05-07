# Activity Log (Windows)

Production-style desktop tracker with automatic startup, persistent local storage, and period analytics.

## Core behavior

- Starts with Windows login (`openAtLogin`) and begins tracking immediately.
- Tracks both `Up Time` and `Active Time` continuously.
- Tracks `Idle Time` and active ratio from system idle state.
- Runs in tray background when dashboard window is closed.

## Dashboard features

- Weekly, monthly, yearly period tabs.
- KPI cards with period-over-period deltas.
- Trend visualization (active + idle stacked per day).
- Live activity panel (status, idle-now, session runtime, top active hours).
- Searchable recent sessions table.
- One-click CSV and JSON export via save dialog.

## Run

```powershell
npm install
npm run start
```

## Storage

- SQLite DB: `tracker.db` in Electron `userData`.
- Schema stores timestamped sample slices for reliable aggregation and exports.

## Current defaults

- Idle threshold: `120` seconds (`IDLE_THRESHOLD_SECONDS` in `main.js`).

