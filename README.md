# Pouch Tracker

A personal nicotine pouch usage tracker. It's an iPhone home-screen web app (PWA) that works offline and keeps all data on the phone. It isn't a quit app. It's for fast logging, honest trends, and health info matched to your actual numbers.

**Live:** https://jphlad.github.io/Pouch-Tracker/

## Install on iPhone
1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Always open it from the home-screen icon. Its storage is separate from Safari tabs, and deleting the icon deletes the data, so use **Settings → Export backup** every couple of weeks.

## Structure
- `index.html`, `css/app.css`: shell and styles (dark evergreen / stone / bark theme)
- `js/app.js`: UI (Log, Trends, Health, Settings)
- `js/db.js`: IndexedDB storage
- `js/stats.js`: pure stats helpers (local-time, DST-safe)
- `js/health.js`: health card selection and "Your numbers" lines
- `js/io.js`: backup/restore and CSV
- `data/health-cards.json`: sourced health facts. Edit with care and keep the sources.
- `data/pouch-library.json`: preloaded brands and strengths
- `src/tin.src.js` → `js/tin.js`: pull-down tin animation (Three.js). Rebuild with `npm i three && npx esbuild src/tin.src.js --bundle --minify --format=esm --outfile=js/tin.js`
- `sw.js`: offline cache. **Bump `VERSION` whenever files change.**

## Tests
```
TZ=America/Los_Angeles node tests/run.mjs
```
Tests run automatically before every deploy (GitHub Actions → Pages).
