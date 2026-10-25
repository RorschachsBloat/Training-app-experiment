# PEAK Training v3 — readiness, RPE scope, set outcomes and optional secure accounts

PEAK Training is a static, installable training web app. It works on GitHub Pages with no build process. The bundled catalogue begins with a 20-week strength programme named **Example #1**.

## New in version 3

### RPE load-reduction scope

- **Default: movement only.** If an athlete exceeds the RPE cap in an exercise, only the later, unlogged barbell sets for **that specific movement** are reduced. A squat cap hit does not lower bench, deadlift or an unrelated squat variation.
- Check **Apply RPE reductions to all movements** in the training session (or Settings) if the athlete explicitly wants the previous cross-movement behaviour. The checkbox is OFF on existing profiles when upgrading.
- Completed sets keep their recorded prescriptions even when readiness or scope changes.
- The RPE reduction formula/thresholds in the programme remain configurable in Settings.

### Session readiness — 1 through 5

Every training session has its own saved readiness selection, defaulting to 3. The following adjustments are to **percentage points** of the prescribed barbell weight, not the number of kilograms:

| Readiness | Meaning | Barbell % adjustment |
| --- | --- | --- |
| 1 | Very low: easier | −5.0 percentage points |
| 2 | Low: easier | −2.5 percentage points |
| 3 | Normal | No change |
| 4 | Good: slightly harder | +1.0 percentage point |
| 5 | Excellent: modestly harder | +2.0 percentage points |

Example: a planned 75% set becomes 70%, 72.5%, 75%, 76%, or 77% (readiness 1 to 5). Loads then round to the configured barbell increment. The RPE safeguard can lower these readiness-adjusted targets further. Existing logged loads are locked. Accessory exercise sets remain listed; the readiness note advises appropriate effort rather than silently deleting sets. This is a training planning aid, not a medical assessment; pain, illness and poor technique take priority over an increase.

### Set/movement results

- Check **Skipped set** to record that an individual set was not completed.
- Check **Skip movement** to mark every set for that exercise in the session as skipped. Existing numbers for these sets are cleared after confirmation. Unchecking restores them as unlogged.
- Enter **Actual reps**. For a planned set of five where only three were achieved, enter `3`. The set displays **2 reps missed**, and CSV export includes the actual and missed rep counts.
- A skipped set is not counted as completed or included in tonnage, and skipped sets do not cause an RPE reduction. A recorded 0-rep attempt counts as an attempted set, with zero reps of volume.

### Profiles and accounts

- **Immediately on GitHub Pages:** local profiles, programme library, progress history, backups, offline-capable site. Each local profile keeps separate data **in that browser**. Local profiles are **not** password-protected.
- **Optional after Supabase configuration:** verified password-based sign-in, separate cloud accounts and programme storage, logout, and a read-only administrator dashboard authorised by PostgreSQL RLS.
- The intended administrator username is **Bloay**. Neither the admin password nor the admin role is embedded in website source. You must privately claim and verify this account and grant its role from Supabase SQL Editor. See `SECURE_ACCOUNTS_SETUP.md`.

## Deploy

For the exact GitHub Pages update steps, read `GITHUB_PAGES_UPDATE.md`. All web files (including `index.html`) must be at the repository root.

To activate secure cloud accounts, read `SECURE_ACCOUNTS_SETUP.md`, run `supabase/PEAK_SETUP.sql` against your Supabase project and configure the public URL / **publishable** key in `cloud-config.js`. With blank settings, local mode remains fully operational.

## Data/backup compatibility

- Existing v2 local profile data is retained in IndexedDB when the update is installed on the **same origin and browser**.
- Existing v2 JSON backups and v1 backups can be restored. New readiness and RPE scope fields are optional and default safely when absent.
- A JSON backup is not encrypted; keep it private. When cloud mode is enabled, imports map one selected profile per signed-in online account.
- CSV now includes missed reps, skipped set status, session readiness and RPE adjustment scope.

## Technical structure

- `app.js`: user interface, local IndexedDB, training and cloud account flows.
- `core.js`: readiness and per-movement RPE adaptation, completed/skipped statistics and CSV export.
- `cloud-config.js`: optional public Supabase URL / publishable key only.
- `cloud-auth.js`: Supabase Auth and per-user documents. Admin access is only allowed by server-side policies.
- `supabase/PEAK_SETUP.sql`: account/document schema, RLS grants/policies, trigger and verified-UUID admin-role procedure.
- `sw.js`: service worker; old version cache automatically invalidated on update.
- `builtin-program.json`: Example #1 programme prescription and defaults.
