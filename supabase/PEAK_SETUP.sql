-- PEAK Training: run once in YOUR Supabase project SQL editor.
-- Store passwords ONLY with Supabase Auth. NEVER embed them in GitHub Pages.
-- Regular users can access only their own documents. Admins can read all.

create table if not exists public.peak_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null,
  role text not null default 'athlete' check (role in ('athlete','admin')),
  created_at timestamptz not null default now(),
  constraint peak_valid_username check (username ~ '^[A-Za-z][A-Za-z0-9_-]{2,29}$')
);
create unique index if not exists peak_username_unique on public.peak_accounts (lower(username));

create table if not exists public.peak_documents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('programmes','states','profiles','enrolments','profileStates')),
  doc_id text not null,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind, doc_id)
);
create index if not exists peak_documents_owner_idx on public.peak_documents(owner_id,kind);

-- Automatic server-side account creation after an Auth signup.
create or replace function public.peak_new_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.peak_accounts(id,username,email,role)
 values (new.id,coalesce(new.raw_user_meta_data ->> 'username','athlete_'||left(replace(new.id::text,'-',''),12)),new.email,'athlete');
 return new;
end;
$$;
drop trigger if exists on_peak_user_created on auth.users;
create trigger on_peak_user_created after insert on auth.users
for each row execute function public.peak_new_account();

-- Admin privilege is evaluated in the DB, not from editable browser data.
create or replace function public.peak_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.peak_accounts a where a.id=(select auth.uid()) and a.role='admin');
$$;

alter table public.peak_accounts enable row level security;
alter table public.peak_documents enable row level security;
revoke all on public.peak_accounts from anon,authenticated;
revoke all on public.peak_documents from anon,authenticated;
grant select on public.peak_accounts to authenticated;
grant select,insert,update,delete on public.peak_documents to authenticated;
revoke all on function public.peak_is_admin() from public,anon;
revoke all on function public.peak_new_account() from public,anon,authenticated;
grant execute on function public.peak_is_admin() to authenticated;

drop policy if exists peak_accounts_read on public.peak_accounts;
create policy peak_accounts_read on public.peak_accounts for select to authenticated
using (id = (select auth.uid()) or (select public.peak_is_admin()));

drop policy if exists peak_documents_read on public.peak_documents;
create policy peak_documents_read on public.peak_documents for select to authenticated
using (owner_id = (select auth.uid()) or (select public.peak_is_admin()));

drop policy if exists peak_documents_insert on public.peak_documents;
create policy peak_documents_insert on public.peak_documents for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists peak_documents_update on public.peak_documents;
create policy peak_documents_update on public.peak_documents for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists peak_documents_delete on public.peak_documents;
create policy peak_documents_delete on public.peak_documents for delete to authenticated
using (owner_id = (select auth.uid()));

-- SECURITY: Do not grant admin privileges based on username alone.
-- After YOU sign up to own Bloay at a VERIFIED email address, look up the
-- auth.users ID from Supabase Auth > Users and confirm the email is yours.
-- Run a SEPARATE privileged SQL statement for that exact verified UUID:
--   update public.peak_accounts set role='admin'
--   where id = 'YOUR_VERIFIED_AUTH_USER_UUID'::uuid
--     and lower(username) = 'bloay';
-- Confirm exactly one row updated, and do not expose this in public JS.
-- Establish an MFA policy for administrators before production use.
