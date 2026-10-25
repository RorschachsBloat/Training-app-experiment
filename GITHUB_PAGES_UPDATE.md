# Update PEAK Training on GitHub Pages — version 3

## Before uploading

1. Open your existing PEAK website. Use Profile > Back up profiles to download a JSON backup. Store it somewhere private: it contains training history and may include other local profiles.
2. Keep the current GitHub Pages URL/repository. This is a replacement of the application files, not a new site.
3. Extract `PEAK_Training_v3_GitHub_Pages.zip` on your computer.

## Upload

1. Open your existing GitHub repository.
2. Delete old website files that have been renamed or removed only if needed. The folder structure in this ZIP is repository-root-ready.
3. Click **Add file > Upload files** and drag the files from inside the extracted ZIP (including `index.html`, `app.js`, `core.js`, CSS, JSON, icons, `cloud-config.js`, `cloud-auth.js`). Include the `supabase` directory if you'd like the setup SQL kept in GitHub for reference.
4. Confirm **Replace** if GitHub asks and click **Commit changes**.
5. In repository **Settings > Pages** keep Source `Deploy from a branch`, Branch `main`, Folder `/(root)`.
6. Open your usual Pages URL. After GitHub finishes publishing, reload the site; for the installable app's older service worker, a second refresh or fully closing and reopening the app may be needed.
7. Check Profile > Example #1 > first training session. Readiness should show 3/5 and the all-movement RPE checkbox should be unchecked.

## Optional online passwords, registration and admin dashboard

**Not automatically enabled.** Your ZIP is safe to deploy with local profiles while you are deciding. `cloud-config.js` has blank configuration values by default.

To activate secure online accounts and Bloay's admin dashboard, follow **SECURE_ACCOUNTS_SETUP.md**. You must have a Supabase project, run the security SQL, privately register and verify the admin account, and fill in your Supabase project URL + **publishable** key in `cloud-config.js` before pushing it live. Don't put a password or service_role key in the GitHub repo.

**Important migration note:** Enabling online accounts switches the app from local browser profiles to the cloud. Before doing so, export a backup of your local training. After signing into the new online account, restore the backup. A cloud account imports only the selected athlete profile from a multi-profile local backup. It does not automatically sync previously anonymous browsers.

See README.md for training features and data behaviour.
