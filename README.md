# Global Cricket Insights (2000–2025)

An interactive data-visualisation project built for the **Monash University Data Visualisation (DVP)** unit. The app turns ~25 years of international cricket data (Test, ODI and T20) into an explorable 3D globe and 2D atlas, with per-country choropleths, venue-level panels and animated origin-to-host match flows.

The full design rationale, sketches and visual-encoding choices are documented in [`Dushyant_34439765_Report.pdf`](Dushyant_34439765_Report.pdf).

---

## Quick start

The project is fully static — no build step, no npm install, no server-side code. However, because it loads a SQLite binary and CSVs over `fetch`, it **must be served over HTTP** (the `file://` protocol blocks the requests).

From the project root:

```powershell
npm install       # first time only
npm run dev       # starts Vite dev server at http://localhost:5173 with hot reload
```

Or if you don't have Node/npm:

```powershell
python -m http.server 8000
# then open http://localhost:8000/index.html
```

VS Code **Live Server** also works. Recommended browsers: latest Chrome, Edge or Firefox (WebAssembly + Web Workers + IndexedDB required).

On first load the app reads the SQLite database from `./data/db/cricket.db` (shipped in this repo) and caches it in IndexedDB, so subsequent loads are near-instant.

---

## What the app does

1. **Landing screen** — a brief intro panel with a small spinning globe and an "Explore data" button.
2. **3D globe / 2D atlas toggle** — switch between an orthographic globe (drag to rotate, double-click to reset, tilt control) and a Natural Earth flat map.
3. **Choropleth** — countries are shaded by **home-win %** for the selected year range and match format (All / Test / ODI / T20), using format-specific colour palettes.
4. **Spike markers** (globe mode) — vertical red bars whose height is proportional to matches hosted.
5. **Proportional bubbles** (2D mode) — country-level circles sized by matches hosted (or another chosen metric).
6. **Flow arcs** — directional curves from each visiting team's home country to the host country, coloured per origin and filterable.
7. **Venue layer** — clickable cricket-stadium icons at each ground's lat/lon. Clicking opens a per-venue panel with:
   - A **radar chart** of batting / bowling metrics (strike rate, average, economy, boundary %, etc.)
   - An **Evolution** tab showing a multi-year heatmap of the same metrics
   - Year-range and format filters scoped to that venue
   - Heavy aggregation queries offloaded to a Web Worker so the UI stays responsive
8. **Year range slider** (2000–2025) — dual-thumb slider that re-queries the DB and redraws all layers.
9. **Leaderboard overlay** — top-N Batting and Bowling tables sourced live from the SQLite DB via `getBattingLeaderboard` / `getBowlingLeaderboard`, respecting the active year-range and format filter.
10. **Player drill-down** — clicking a row in the leaderboard opens a `PlayerWindow` panel with a per-year line chart (runs or wickets), a per-format split donut, and the player's top 5 venues by output.
11. **Head-to-head comparison** — a top-bar 🥊 button opens an overlay where the user picks two countries + format and sees the W/L/D split, biggest wins each way, and top run-scorers / wicket-takers for the pairing. "Biggest wins" mixes runs and wickets margins via a dominance score so a 10-wicket chase outranks small runs wins.
12. **Toss impact analysis** — each venue popup includes a "Toss impact" card showing batting-first win % with Wilson 95% CI per format. A top-bar 📊 button opens a global "Toss Impact Insights" overlay ranking the top 10 and bottom 10 venues by toss bias (suppressing small-sample venues automatically via the CI lower bound).
13. **Country focus** — click a country (or a bubble) to zoom in and list its venues.
14. **Tooltips** — hovering a country shows home-win % with a per-format breakdown plus a few notable venues; hovering a venue shows total matches split by format.

---

## Tech stack

| Layer            | Used for                                                                 |
|------------------|--------------------------------------------------------------------------|
| **D3 v7**        | Projections (`geoOrthographic`, `geoNaturalEarth1`), paths, scales, drag/zoom, DOM binding |
| **TopoJSON**     | World boundaries (`world-atlas@2/countries-110m.json` via CDN)           |
| **sql.js 1.10.2**| Runs SQLite in WebAssembly entirely in the browser                       |
| **Web Workers**  | `venue-worker.js` runs heavy per-venue SQL aggregations off the main thread |
| **IndexedDB**    | Persistent cache of the SQLite binary (keyed by version) so the DB only downloads once |
| **Vite**         | Dev server with HMR; bundles `src/main.js` and its ES-module imports for production |
| **Vanilla HTML / CSS / JS** | No framework; the visualisation layer is plain ES modules  |

Third-party visualisation libraries (`d3`, `topojson-client`, `sql.js`) are loaded from CDNs. Vite handles the ES-module entry point (`src/main.js`) while the legacy utility scripts (`db.js`, `venue.js`, `venue-worker.js`, `tilt-toggle.js`, `formats.js`) are served verbatim.

---

## Data

Source data lives in [`data/csvs/`](data/csvs/) and a pre-built SQLite database in [`data/db/cricket.db`](data/db/cricket.db). The CSVs were cleaned and aggregated offline; the app itself reads only the SQLite file at runtime.

| File                      | Purpose                                                                 |
|---------------------------|-------------------------------------------------------------------------|
| `venues.csv`              | Ground name, country, city, lat/lon, alternate-name aliases             |
| `matches.csv`             | One row per match — format, date, teams, venue, toss, winner, margin    |
| `innings.csv`             | Per-innings totals: runs, wickets, balls, run-rate, dots, boundaries, fall-of-wicket buckets |
| `batting_innings.csv`     | Per-innings batting aggregates (used by the venue radar / evolution)    |
| `bowling_innings.csv`     | Per-innings bowling aggregates                                          |
| `venue_stats.csv`         | Pre-aggregated per-venue / per-year / per-format metrics                |
| `venue_stats_format.csv`  | Same as above, normalised by format                                     |

### Hosting / deployment

Everything the app needs ships in the repo, so the simplest deploy is **GitHub Pages**:

1. Push the repo to <https://github.com/LazyStud/DVP>.
2. On GitHub, go to **Settings → Pages → Build and deployment → Deploy from branch**, pick `main` and `/ (root)`.
3. After a minute the site is live at `https://lazystud.github.io/DVP/`.

The `DB_URL` constant in [`src/config.js`](src/config.js) is set to `./data/db/cricket.db`, so the DB loads from the same origin as the page — no extra hosting needed. Netlify / Vercel / Cloudflare Pages work the same way (point publish directory to `dist/` after `npm run build`, or serve the root for the dev build).

---

## File layout

```
DVP/
├── index.html              Entry point — DOM scaffold, script tags, year slider, overlays
├── src/                    ES-module visualisation layer (Vite entry point)
│   ├── main.js             Entry point: SVG setup, scales, spin, zoom, redrawAll, init sequence
│   ├── config.js           All shared constants (URLs, colours, year bounds, palettes)
│   ├── state.js            Shared mutable state object (no singleton exports, avoids circular deps)
│   ├── data/
│   │   ├── queries.js      SQL helpers: computeChoropleth, computeFlows, leaderboard queries
│   │   └── names.js        Canonical country/format name maps and column synonyms
│   ├── layers/
│   │   ├── sphere.js       Graticule, sphere and boundary mesh
│   │   ├── countries.js    Choropleth, hover highlight, country click handler
│   │   ├── spikes.js       Spike markers + legend
│   │   ├── flows.js        Flow arcs + filter UI
│   │   ├── bubbles.js      Proportional bubbles + legend
│   │   ├── venues.js       Stadium icons + country-click → venue list
│   │   └── focus.js        focusGlobeOn / focusMapOn (zoom-to-country)
│   └── ui/
│       ├── tooltip.js      Hover tooltips (country + venue)
│       ├── toast.js        Loading toast + venue-loading overlay
│       ├── instructionBox.js  Left-side help text (updates per view mode)
│       ├── legends.js      Right-side spike/bubble legend DOM + format selector
│       ├── leaderboard.js  Leaderboard overlay — batting + bowling tabs
│       ├── playerWindow.js Player drill-down panel — per-year + per-format + top-venues
│       ├── headToHead.js   Head-to-head country comparison overlay
│       └── yearSlider.js   Dual-thumb year-range slider
├── venue.js                VenueWindow popup — radar chart, evolution heatmap, per-venue filters
├── venue-worker.js         Web Worker that runs heavy SQL aggregations for the venue panel
├── db.js                   sql.js bootstrap + IndexedDB cache (keyed by version)
├── formats.js              Format-key normalisation helpers (global script)
├── tilt-toggle.js          2D / 3D toggle control + view-toggle / view-mode-sync events
├── styles.css              All styling (landing, globe, panels, overlays, tooltips)
├── vite.config.js          Vite config — legacy scripts copied verbatim, src/main.js bundled
├── Dushyant_34439765_Report.pdf   Submitted report
└── data/
    ├── csvs/               Source datasets (see table above)
    ├── db/cricket.db       Pre-built SQLite database read by sql.js
    └── icon/               CricketStadium.png (venue marker) + bg.jpg (landing backdrop)
```

---

## How it fits together

1. `index.html` loads the legacy global scripts (`db.js`, `formats.js`, `venue.js`, `tilt-toggle.js`) then `src/main.js` as an ES module via Vite.
2. `src/main.js` calls `DB.init(DB_URL)` (from the global `db.js`), which either restores the SQLite binary from IndexedDB or downloads and caches it.
3. Once the DB is ready, `src/data/queries.js` introspects the schema (`PRAGMA table_info(...)`) to pick canonical column names — this makes the app tolerant of small schema drifts.
4. The world TopoJSON is fetched by `main.js` (top-level `await`), countries are drawn, then the choropleth / spikes / bubbles / flows are computed from SQL in `queries.js` and rendered by the `layers/` modules.
5. The year slider (`ui/yearSlider.js`), format selector (`ui/legends.js`) and 2D/3D toggle all funnel into a single `recomputeAndDraw(yearMin, yearMax)` pipeline in `main.js`.
6. Clicking a venue icon hands off to `VenueWindow` (`venue.js`), which posts an `aggregate` message to `venue-worker.js`. The worker opens its own sql.js instance against the cached SQLite blob, runs the per-format / per-year aggregations, and posts the result back for the radar / evolution charts.

---

## Notable design touches

- **Schema-tolerant queries.** `src/data/names.js` keeps lists of column synonyms (`WINNER_SYNS`, `DATE_SYNS`, `HOST_SYNS`, …) and picks whichever exists in the loaded DB, so the same code works against slightly different schemas.
- **Country-name canonicalisation.** A small alias map collapses USA/UK/UAE/Caribbean nations into the names used in the TopoJSON and in the team field, so joins between match data and map geometry stay consistent.
- **IndexedDB versioning.** The DB cache key embeds a version string; bumping it in `db.js` forces every client to re-download on the next visit.
- **Worker-based aggregation.** Heavy per-venue queries (multi-format, multi-year) run in `venue-worker.js` so the globe keeps spinning at 60 fps while the radar populates.
- **Accessible UI.** ARIA roles, live regions and keyboard handlers on the slider, tabs, and inline leaderboard launcher.
- **Debug logging.** All `console.warn` / `console.info` calls are gated behind a `DEBUG` flag. Append `?debug=1` to the URL (e.g. `http://localhost:8000/index.html?debug=1`) to enable them; omit it for a clean console.

---

## Known limitations

- The Batting / Bowling **leaderboard overlay** queries the SQLite DB directly (`getBattingLeaderboard` / `getBowlingLeaderboard` in `src/data/queries.js`). Small hard-coded fallback arrays exist in case the DB query fails, but under normal operation all data is live from the database.
- Country borders come from `countries-110m.json`, which is intentionally low-resolution — small island nations look chunky at high zoom.
- A few historical venues with missing lat/lon are silently skipped when drawing icons.

---

## Credits

- **Author:** Dushyant Pathania (Monash student ID 34439765)
- **Unit:** Monash University, Data Visualisation and Processing
- **Data:** Cleaned and aggregated from publicly available international-cricket scorecard datasets
- **Repo:** <https://github.com/LazyStud/DVP>
