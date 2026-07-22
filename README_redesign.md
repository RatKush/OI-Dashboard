# OI Profile Dashboard — Redesign (July 2026)

Complete visual re-skin of the public OI Profile dashboard, re-styled to match the
**Futures OI** workbook house style: deep-navy chrome, slate section headers, dense
tabular grids, and a per-column **blue → white → green** heat-map. Same features and
same data pipeline — only the look-and-feel changed.

## What changed
- **`templates/dashboard.html`** — fully rebuilt front-end (HTML/CSS/JS in one file).
  - Navy gradient title bar with as-of date, market count, contract count, updated time,
    a live indicator, and Refresh.
  - Market tabs (SR3 · FF · Treasuries · ER · SONIA · Brazil · CORRA) + a segmented
    view toggle (Heat-map · Series · Pre vs Final).
  - **Heat-map**: mirrors the Futures OI summary page — a **Latest OI** anchor column, then two
    segregated blocks, **Δ Open Interest (#)** and **Δ Open Interest (%)**, across **1D / 3D / 1W /
    2W / 3W / 4W / 2M / 3M** horizons (2M = 42, 3M = 63 trading-day offsets, as in the workbook), each with a per-column blue→white→green heat-map (negatives in red).
    Plus an inline **sparkline trend** per contract, a **TOTAL** row, and **pack separators every 4
    contracts** on the STIR chains (SR3/FF/ER/SONIA/CORRA). Same data inputs — shown as changes.
  - **Series**: professional Chart.js line chart with a **% Change / Levels** toggle. Default **% Change**
    rebases every contract to the start of the window (0%) so positioning shifts are actually visible
    (raw levels look flat because OI is stable). Smooth monotone curves, end-of-line markers, hover
    crosshair + sorted cross-section tooltip, emphasised zero line, labelled axes, and a legend showing
    each contract's latest value (click to show/hide).
  - **Pre vs Final**: comparison table (Pre / Final / Δ / Δ%) with Copy and PNG export.
- **`templates/login.html`** and **`templates/admin.html`** — restyled to the same theme.
  Admin keeps the drag-and-drop upload → parsed preview → *Publish* / *Publish as Final OI*
  flow, wired to the existing `/admin/upload` and `/admin/publish` routes.
- **`static/vendor/chart.umd.min.js`** — Chart.js v4.4.0 vendored locally so the dashboard
  no longer depends on the CDN being reachable (it falls back to the CDN automatically if
  the local file is ever missing).

## What did NOT change
- `app.py` (server logic, routes, workbook parser) is byte-identical to the version in the
  original zip — the redesign is purely the templates + the vendored Chart.js.
- The JSON API contract (`/api/dashboard-data`, `/api/pre-vs-final`) is untouched, so the
  new front-end reads exactly the same data your current one does.

## Deploy
Drop these into the project root on PythonAnywhere (or wherever it runs), keeping the layout:
```
app.py
templates/dashboard.html
templates/login.html
templates/admin.html
static/vendor/chart.umd.min.js
```
Your existing `data/` (current.json, pre_vs_final.json) and `uploads/` are left alone — no
sample data is shipped, so nothing you have published will be overwritten. Reload the web app.

Admin password is unchanged (uses `ADMIN_PASSWORD_HASH` env var, or the local fallback).
