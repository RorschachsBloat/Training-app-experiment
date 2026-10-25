# Replace your current PEAK GitHub Pages site with v2

1. **Back up your current training first:** open your existing PEAK site, select **Progress → Download full JSON backup**, and store the file safely.
2. Unzip the new `PEAK_Training_v2_Profiles_GitHub_Pages.zip`.
3. In your **existing** GitHub repository, open the folder containing `index.html` (usually the repository root).
4. Choose **Add file → Upload files**. Drag **all files from the extracted ZIP folder**, including `index.html`, `app.js`, `styles.css`, `core.js`, `xlsx-import.js`, `builtin-program.json`, `sw.js`, the images, and supporting files. Do **not** upload the ZIP as one file, and do **not** put everything in a new nested folder.
5. Confirm replacement of the same-named files and select **Commit changes**. GitHub Pages will redeploy from your existing branch/root configuration; you do not need a new repository.
6. Open your existing GitHub Pages URL and refresh again if the previous design still appears. If necessary, open the browser in a new tab or clear only the site's cache (not its stored data). Avoid clearing site data because it includes your training logs.
7. Create a profile, or if you previously had saved logs, choose the automatically migrated **My training** profile. Add **Example #1** to the profile if it is not already added.

The existing programme's internal ID remains `peak-105-classic` so training history can be migrated. **Example #1** is a display name change, not a new training block.

## What this version supports

- Create, rename, switch, and delete local profiles.
- Each profile independently enrols in programmes and saves progress, lift maxima, and settings.
- Choose **Example #1** from the catalogue or import other programmes via the Excel template.
- Export/restore one JSON backup containing all local profiles, enrolments, and logs.

**Important:** GitHub Pages does not itself provide user accounts or a shared database. These profiles are **device/browser-local, not password-protected online accounts**. They do not sync between phones or computers. A proper email/password account and secure cross-device sync would require a service such as Supabase or Firebase and further implementation.
