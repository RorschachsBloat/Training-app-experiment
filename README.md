# PEAK / Training — Installable strength-training web app

Version 2.0 — October 2026

This is a fully static progressive web app. Version 2 adds **browser-local athlete profiles** and a per-profile programme library while retaining the original PEAK / 105 RPE safeguard engine. The shipped 20-week / 80-session programme is now called **Example #1** (its internal ID remains `peak-105-classic` so existing progress survives an update).

## What is included

- `index.html`, `styles.css`, `app.js`: mobile-first interface, profile creation/switching, per-profile programme enrolment, logs, backups and programme updates.
- `core.js`: original PEAK / 105 percentage + fatigue + RPE cap calculation engine.
- `xlsx-import.js`: browser-only `.xlsx` reader and PEAK template converter. No macros or spreadsheet formulas are executed; no external JavaScript library or server is needed.
- `builtin-program.json`: **Example #1**, the original 20-week, 4-day lifting programme and technical preparation prescriptions.
- `PEAK_Programme_Template.xlsx`: example programme template and documentation. Edit it with Excel/LibreOffice/Google Sheets (download as `.xlsx` before import).
- `sw.js`, `manifest.webmanifest`, icon files: offline cache and installation as a PWA.

## Simplest way to put it online

1. Unzip `PEAK_Training_v2_Profiles_GitHub_Pages.zip` on your computer.
2. Upload **the files inside the extracted folder** to any static HTTPS web host. For example, use a manual drag-and-drop deployment on Netlify or Cloudflare Pages. Do not upload the ZIP as a single web file unless your host explicitly supports ZIP extraction.
3. Open the HTTPS URL in Chrome on an Android phone. Use the browser menu's **Install app** or **Add to Home screen** command (wording depends on browser).
4. Open the site, **create a local profile**, and select **Example #1** under Explore programmes (or import a new programme).

Alternatively, push these files to the root of a GitHub repository and enable **Settings → Pages**, deploying from the main branch's root folder. Make sure the site URL uses HTTPS.

### Running it locally for testing

Do not open `index.html` by double-clicking (`file://` blocks several PWA features).

From the extracted directory run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/` in a browser on the same computer. Localhost is accepted as a secure development context for service workers. Android installation requires an HTTPS-hosted deployment in ordinary use.


## New: profiles and saved programmes

1. On first use, select **Create profile**, enter a display name, and select **Create profile**. If an older installation already has logs, a **My training** profile is created automatically and its existing logs are migrated.
2. On your **Profile** screen, select **Add to my profile** beneath **Example #1**. Training for that programme now starts. The app remembers your chosen programme.
3. Choose **Profile → Switch profile** to select another local athlete or create a new profile. Each profile has an independent list of enrolled programmes, lift maxima, exercise settings, programme position, and logged sets.
4. Choose **Library** to browse all available programmes. Select **Add to my profile** to enrol in a new programme, **Switch to programme** to change blocks, or **Remove** to delete only the current athlete's enrolment and progress in that programme.
5. Add more programmes by importing the provided `.xlsx` template from **Library**. Imported programme definitions are available in the catalogue on that browser and can be added separately to each athlete's profile.
6. Choose **Progress → Back up all profiles** to export one JSON containing everyone’s local profiles, enrolments, programmes, and histories. The corresponding **Restore backup** action completely replaces stored local data after confirmation. Version 1 exports remain supported.

**Important privacy and functionality limits:** These are **local profiles**, **not email/password accounts**. They are stored only in each visitor's own browser, do not sync between devices or across browsers, and do not prevent another person using the same browser from switching into another profile. GitHub Pages is static hosting; real secure accounts that users can sign into from any device require an authentication provider and protected database (e.g. Supabase or Firebase), which are **not included** in this release. Do not advertise these local profiles as secure cloud accounts.

## Updating your existing GitHub Pages deployment from v1

1. **Before updating**, export your existing **Progress → Download full JSON backup** and store the file safely.
2. In your GitHub repository, upload the files **inside the extracted ZIP folder** into the same directory that currently contains `index.html`. Replace existing `index.html`, `app.js`, `styles.css`, `builtin-program.json`, `sw.js`, and `README.md` when asked. Keep all other supplied assets as well.
3. In **Settings → Pages**, retain **Deploy from a branch → main → /(root)** if that was your original setup.
4. After deployment, revisit the **same** GitHub Pages URL. Refresh once or twice to activate the new service worker. Your local v1 state migrates on that browser; `peak-105-classic` keeps its internal ID and appears under the new name **Example #1**.
5. If old logged sets do not appear, use **Restore backup** (available on the first profile screen and under Progress) to import the v1 JSON export. Restoring **replaces all local profiles and logs**; do not restore unless you intend to replace current local data.

**Do not switch the domain/URL** if you want existing browser-stored data to carry over automatically. Replacing files on the same GitHub Pages URL does not remove the existing IndexedDB records.

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
- **Progress** shows completed tonnage and set counts for the selected profile/programme, plus CSV export and full multi-profile JSON backup/restore.

## Updating the web app itself

When you change application code, upload the new files to the same HTTPS domain and change the cache name at the top of `sw.js` (for instance from `peak-training-v2-profiles-20261025` to `peak-training-v3-...`). On the next online visit/check, the updated service worker downloads the new app shell. Reload the page when requested or after checking for an update. Programme updates do *not* require modifying `sw.js` when imported locally.

## Data and privacy

- There is **no authentication or cloud sync** in v2. Profiles, training logs, imported programmes, programme updates and settings live only in that browser's local IndexedDB database. Hosting the static website does not automatically transmit or collect these records.
- A new phone, different browser profile, browser data reset, app removal or domain change **will not automatically carry data forward**. Export a full JSON backup under Progress and restore it on the new installation.
- Don't change your app's hosting domain casually: browsers isolate offline storage per origin.
- Use only trusted HTTPS hosts. Files used as updates are parsed as data, not executed.
- Data in JSON exports can include personal lifting history. Store backup files privately.
- Real cloud sign-up/sign-in and account sync require an authenticated backend (for example Supabase or Firebase), row-level access controls, account recovery and explicit privacy/security design. Those features are not implemented here.

## Browser support

Best supported in recent Chromium-based Android browsers (including Chrome). Import uses `DecompressionStream('deflate-raw')`, which is available in modern Chromium; very old browsers may be unable to read `.xlsx` imports. IndexedDB and service workers are required for durable offline training and the installable experience. The app is not an APK or a Google Play Store listing.

## Source and current test scope

The updated UI has been exercised in a headless browser test harness for creating two local profiles, separately enrolling in Example #1, logging a set for one profile, switching back and forth without sharing logs, and removing a programme from one profile without affecting the other. The v1 migration and backup paths are included in the code. The browser harness uses a simulated IndexedDB environment because browser navigation to a local test host was blocked in this execution environment. Actual deployment to a public HTTPS host and installation on a physical Android phone have not been performed here.
