# PEAK / Training — Installable strength-training web app

Version 1.0 — October 2026

This is a fully static progressive web app. It uses the original PEAK / 105 barbell RPE safeguard engine, ships the original 20-week / 80-session powerlifting programme, and imports new programmes from the bundled Excel template.

## What is included

- `index.html`, `styles.css`, `app.js`: mobile-first lifting session interface, programme library, history, exports, programme updates.
- `core.js`: original PEAK / 105 percentage + fatigue + RPE cap calculation engine.
- `xlsx-import.js`: browser-only `.xlsx` reader and PEAK template converter. No macros or spreadsheet formulas are executed; no external JavaScript library or server is needed.
- `builtin-program.json`: original 20-week, 4-day lifting programme and technical preparation prescriptions.
- `PEAK_Programme_Template.xlsx`: example programme template and documentation. Edit it with Excel/LibreOffice/Google Sheets (download as `.xlsx` before import).
- `sw.js`, `manifest.webmanifest`, icon files: offline cache and installation as a PWA.

## Simplest way to put it online

1. Unzip `PEAK_Training_Web_App.zip` on your computer.
2. Upload **the files inside the extracted folder** to any static HTTPS web host. For example, use a manual drag-and-drop deployment on Netlify or Cloudflare Pages. Do not upload the ZIP as a single web file unless your host explicitly supports ZIP extraction.
3. Open the HTTPS URL in Chrome on an Android phone. Use the browser menu's **Install app** or **Add to Home screen** command (wording depends on browser).
4. Launch the new icon, open **Library**, and choose the built-in PEAK / 105 programme or import a template.

Alternatively, push these files to the root of a GitHub repository and enable **Settings → Pages**, deploying from the main branch's root folder. Make sure the site URL uses HTTPS.

### Running it locally for testing

Do not open `index.html` by double-clicking (`file://` blocks several PWA features).

From the extracted directory run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/` in a browser on the same computer. Localhost is accepted as a secure development context for service workers. Android installation requires an HTTPS-hosted deployment in ordinary use.

## Creating another programme

1. Edit `PEAK_Programme_Template.xlsx`.
2. Set a unique **Programme ID**, a title, number of weeks, number of training days and maximums on **Programme Info**.
3. Give every exercise a unique code on **Exercises**. For barbell variations, include a family (`SQ`, `BP`, or `DL`) and a ratio or max override. Accessories use kind `ACC` and family `ACC`.
4. Add training rows on **Sessions**. Each barbell set occupies its own row. Accessories can use one row with a `Sets` count. The app calculates prescribed barbell kg from `%1RM` and the exercise-specific maximum.
5. Give sets unique, stable **Set ID** values; keep them unchanged in new programme versions.
6. Optionally edit **Training Rules** and **RPE Lookup** for fatigue and RPE model assumptions.
7. Save as `.xlsx`. In the app, open **Library → Import programme** and select it.

Example workbook includes four sessions. Replace the sample rows with your own; it is not intended as a complete programme.

### Updating a programme

- Increase **Version** in `Programme Info` but **keep the same Programme ID**.
- Revise the spreadsheet and import it again.
- The app asks to install the update. Unstarted sessions use new prescriptions; **any session with logged work is retained in full**. Existing RPE/weight logs remain attached to their Set IDs. The imported programme version is recorded in update history.
- For a completely separate programme, use a new Programme ID instead.
- JSON programmes exported/generated using the same internal programme format can also be imported. Do **not** treat arbitrary JSON from unknown sources as a trusted programme.

## Training logs and RPE safeguard

- Each session shows movement preparation and individual sets, including expected RPE and cap where relevant.
- Enter actual kg and RPE, or mark a set complete; entries save automatically into browser IndexedDB.
- A working set at or above its modelled RPE cap reduces **only subsequent uncompleted barbell prescriptions within that same session**. Completed loads remain locked.
- Fatigue assumptions and exercise maxima can be edited under **Settings**.
- **Progress** shows completed tonnage and set counts, plus CSV export, full JSON backup and restore.

## Updating the web app itself

When you change application code, upload the new files to the same HTTPS domain and change the cache name at the top of `sw.js` (for instance from `peak-training-v1-20261025` to `peak-training-v2-...`). On the next online visit/check, the updated service worker downloads the new app shell. Reload the page when requested or after checking for an update. Programme updates do *not* require modifying `sw.js` when imported locally.

## Data and privacy

- There is **no login or cloud sync** in v1. Training logs, custom programmes, programme updates and settings live only in that browser's local IndexedDB database. Hosting the static website does not automatically transmit or collect these records.
- A new phone, different browser profile, browser data reset, app removal or domain change **will not automatically carry data forward**. Export a full JSON backup under Progress and restore it on the new installation.
- Don't change your app's hosting domain casually: browsers isolate offline storage per origin.
- Use only trusted HTTPS hosts. Files used as updates are parsed as data, not executed.
- Data in JSON exports can include personal lifting history. Store backup files privately.
- Future cloud accounts/sync would need an authenticated backend (for example Supabase or Firebase) and explicit privacy/security design.

## Browser support

Best supported in recent Chromium-based Android browsers (including Chrome). Import uses `DecompressionStream('deflate-raw')`, which is available in modern Chromium; very old browsers may be unable to read `.xlsx` imports. IndexedDB and service workers are required for durable offline training and the installable experience. The app is not an APK or a Google Play Store listing.

## Source and current test scope

Unit-level browser tests covered: XLSX template parsing, conversion to four runnable sessions, original RPE next-load reductions while preserving completed weights, programme library import, local store writes, programme version 2 import preserving started sessions and updating untouched sessions, navigation and settings controls. Actual deployment to a public HTTPS host and installation on a physical Android phone have not been performed here.
