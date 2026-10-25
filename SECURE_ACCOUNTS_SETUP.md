# PEAK Training — secure online accounts & admin setup

GitHub Pages hosts static HTML, CSS and JS. It cannot safely store password hashes, verify passwords, or securely grant read-all admin privileges by itself. This optional integration uses Supabase Auth + PostgreSQL Row Level Security (RLS).

**Status:** The app contains ready-to-configure login, signup, individual cloud storage, and an admin overview. These online features **will not work** until you configure a real Supabase project. The ZIP does not include or create the administrator password.

## 1. Create a Supabase project

1. Sign up or sign in at https://supabase.com/dashboard .
2. Create a project. Save the database password privately; do not commit it to GitHub.
3. In **SQL Editor**, open `supabase/PEAK_SETUP.sql`, paste the file contents and run it.
4. Confirm tables `public.peak_accounts` and `public.peak_documents` now exist and RLS is enabled on both.
5. In Authentication settings, set the site URL to your GitHub Pages URL and configure email confirmation / redirect URLs. Production projects should require verified email addresses and use anti-abuse controls/rate limits. Consult current Supabase docs for the latest dashboard labels.

The SQL installs least-privilege access: an athlete can read/write only documents owned by that authenticated user; an admin can **read** other accounts and records, but cannot modify another user's documents. The admin role is assigned only by you with privileged SQL—not by selecting a username in the browser.

## 2. Claim your administrator account privately

Do this **before** enabling signup on the public site. The intended admin username is **Bloay**.

1. Create and verify the admin account with an email address that you control. If needed, temporarily configure this integration on a private test deployment, or invite/create a user from Supabase Auth. Signup collects username, email and a new password.
2. Choose a **new, long, unique password**. Do not use the password previously typed into a chat; treat it as exposed. Do not put any password into JavaScript, SQL or GitHub repository settings.
3. In Supabase **Authentication > Users**, look up the account's UUID and verify its email address is yours.
4. In Supabase SQL Editor, run the following with that **verified ID**, not just a public username:

```sql
update public.peak_accounts
set role = 'admin'
where id = 'PUT_YOUR_VERIFIED_AUTH_USER_UUID_HERE'::uuid
  and lower(username) = 'bloay';
```

5. Check exactly **one row** changed. Then query `select username,role from public.peak_accounts where id='YOUR_VERIFIED_AUTH_USER_UUID'::uuid;` to confirm.
6. Protect the admin login with MFA when supported/enforced by your full authentication flow. The bundled client does not yet include MFA enrolment/challenge screens, so **do not assume MFA is active**.

**Never** approve an account merely because its public username says `Bloay`: someone else might have registered the username first.

## 3. Turn on online mode in the website

1. In Supabase **Project Settings > API / API Keys**, copy the project URL and **publishable key**.
2. Edit `cloud-config.js` in this site's extracted files:

```js
window.PEAK_CLOUD = {
  url: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'YOUR_PUBLISHABLE_KEY'
};
```

3. Upload the updated `cloud-config.js` alongside the other site files and commit. Deploy GitHub Pages as usual.
4. Open the site. It should now show **Sign in** and **Create account** rather than local profile picking.
5. Sign into the Bloay admin account. Go to **Profile > View all athlete accounts** to inspect the account overview, enrolled programme counts and training logs. This is a read-only overview of accounts, not a full password management console.
6. Create a separate ordinary account to verify it sees only its own profile. Use the Supabase SQL policies as the **security boundary**, not client-side checks.

**Keys:** The Supabase publishable key is designed to appear in frontend code when RLS is set correctly. Never expose Supabase `service_role`, secret API keys, SQL connection strings, JWT secrets, or a password in any `.js`, `.html`, config file or repository. For security hardening, review your project grants and policies with the current Supabase docs. Never test production roles by editing a browser flag.

## 4. Moving from local profiles to accounts

1. On the **existing local** PEAK website (before enabling cloud mode), go to Profile and download a JSON backup. It is **unencrypted** and contains private training records; store it securely.
2. Enable cloud mode and sign in with the new registered account.
3. Under Profile, click **Restore backup**. For a multi-profile backup, the app selects the previously active local athlete profile and imports **only that person's** enrolments and progress to this online account. Repeat for the other athletes with their own account and backups as needed, ensuring the correct local profile was selected when the backup was created.
4. Confirm programme selection and logs, and keep your backup until verified.

## Deployment / trust notes

- Online registration and saving require internet connectivity. The local mode retains offline caching behaviour.
- A public GitHub Pages site cannot itself restrict who views downloaded HTML/JS. That's okay: access to individual data is enforced in the Supabase database by RLS.
- The admin overview can view user profile identifiers, emails, programme enrolments and saved logs; it cannot read user passwords. Don't log raw passwords or display credentials.
- Supabase and GitHub Pages are different services; cloud mode doesn't automatically migrate existing browser IndexedDB data.
- For production, add email-based recovery, MFA, incident response, privacy/retention controls, and database-level access testing. The included SQL and app have not been deployed against your own Supabase environment by this ZIP creation process.

Official references:
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://docs.github.com/en/pages
