-- =====================================================================
-- 0002 — Pre-launch security hardening
--   1. member-docs bucket (Aadhaar / PAN / joining letters) becomes private.
--      Columns now store the object path; the app shows short-lived signed URLs.
--   2. Role checks in RLS: finance + HR data is admin-only; members keep access
--      to their own attendance, leave requests, HR profile and payroll inputs.
--   3. signup_attempts table backing the per-IP signup rate limit.
-- Run after 0001 in the Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Private KYC storage
-- ---------------------------------------------------------------------
update storage.buckets set public = false where id = 'member-docs';

-- Re-scope the shared org-files policies to the buckets that stay org-wide.
drop policy if exists org_files_select on storage.objects;
drop policy if exists org_files_insert on storage.objects;
drop policy if exists org_files_update on storage.objects;
drop policy if exists org_files_delete on storage.objects;

create policy org_files_select on storage.objects for select to authenticated
  using (bucket_id in ('company-assets','content-files','profile-pics')
         and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy org_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('company-assets','content-files','profile-pics')
         and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy org_files_update on storage.objects for update to authenticated
  using (bucket_id in ('company-assets','content-files','profile-pics')
         and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy org_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('company-assets','content-files','profile-pics')
         and (storage.foldername(name))[1] = public.current_org_id()::text);

-- member-docs paths are "<org_id>/<member_id>/<file>": admins see the whole org,
-- a member only their own folder.
create policy member_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'member-docs'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and (public.is_org_admin() or (storage.foldername(name))[2] = auth.uid()::text));
create policy member_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-docs'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and (public.is_org_admin() or (storage.foldername(name))[2] = auth.uid()::text));
create policy member_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'member-docs'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and (public.is_org_admin() or (storage.foldername(name))[2] = auth.uid()::text));
create policy member_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-docs'
         and (storage.foldername(name))[1] = public.current_org_id()::text
         and (public.is_org_admin() or (storage.foldername(name))[2] = auth.uid()::text));

-- Old rows held full public URLs; keep only the object path.
update public.hr_profiles set
  aadhar_front_url   = regexp_replace(aadhar_front_url,   '^.*/storage/v1/object/public/member-docs/', ''),
  aadhar_back_url    = regexp_replace(aadhar_back_url,    '^.*/storage/v1/object/public/member-docs/', ''),
  pan_card_url       = regexp_replace(pan_card_url,       '^.*/storage/v1/object/public/member-docs/', ''),
  joining_letter_url = regexp_replace(joining_letter_url, '^.*/storage/v1/object/public/member-docs/', '');

-- ---------------------------------------------------------------------
-- 2. Role-based RLS
-- ---------------------------------------------------------------------

-- Finance: admins only (Finance, Invoices, Dashboard money widgets are admin-only in the UI).
do $$
declare t text;
begin
  foreach t in array array['transactions','balances','dasti_transactions','invoices','retainers'] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated
         using (org_id = public.current_org_id() and public.is_org_admin())
         with check (org_id = public.current_org_id() and public.is_org_admin())', t);
  end loop;
end $$;

-- Payroll inputs: admins manage; a member can read only their own rows (My Payroll view).
do $$
declare t text; col text;
begin
  foreach t in array array['payouts','leave_balance','overtime','payroll_overrides'] loop
    col := case when t in ('payouts','leave_balance') then 'member_id' else 'user_id' end;
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated
         using (org_id = public.current_org_id() and public.is_org_admin())
         with check (org_id = public.current_org_id() and public.is_org_admin())', t);
    execute format(
      'create policy self_select on public.%I for select to authenticated
         using (org_id = public.current_org_id() and %I = auth.uid())', t, col);
  end loop;
end $$;

-- Company settings: everyone reads (invoice header, logo); only admins write.
drop policy if exists tenant_isolation on public.company_settings;
create policy org_select on public.company_settings for select to authenticated
  using (org_id = public.current_org_id());
create policy admin_write on public.company_settings for all to authenticated
  using (org_id = public.current_org_id() and public.is_org_admin())
  with check (org_id = public.current_org_id() and public.is_org_admin());

-- HR profiles (salary, KYC): admins see all; a member sees and edits only their own row.
drop policy if exists tenant_isolation on public.hr_profiles;
create policy admin_all on public.hr_profiles for all to authenticated
  using (org_id = public.current_org_id() and public.is_org_admin())
  with check (org_id = public.current_org_id() and public.is_org_admin());
create policy self_select on public.hr_profiles for select to authenticated
  using (org_id = public.current_org_id() and id = auth.uid());
create policy self_insert on public.hr_profiles for insert to authenticated
  with check (org_id = public.current_org_id() and id = auth.uid());
create policy self_update on public.hr_profiles for update to authenticated
  using (org_id = public.current_org_id() and id = auth.uid())
  with check (org_id = public.current_org_id() and id = auth.uid());

-- Members may edit address, photo, emergency contact and upload KYC docs, but never
-- salary, department, joining date, joining letter or their own KYC verdict.
create or replace function public.guard_hr_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_org_admin() then return new; end if;  -- service role / admins
  if tg_op = 'INSERT' then
    new.base_salary := 0;
    new.department := null;
    new.date_of_joining := null;
    new.joining_letter_url := null;
    new.kyc_status := 'pending';
    new.kyc_approved_at := null;
    return new;
  end if;
  if new.base_salary        is distinct from old.base_salary
  or new.department         is distinct from old.department
  or new.date_of_joining    is distinct from old.date_of_joining
  or new.joining_letter_url is distinct from old.joining_letter_url
  or new.kyc_status         is distinct from old.kyc_status
  or new.kyc_approved_at    is distinct from old.kyc_approved_at then
    raise exception 'Only workspace admins can change salary, department, joining details or KYC status';
  end if;
  -- New documents need a fresh review.
  if new.aadhar_front_url is distinct from old.aadhar_front_url
  or new.aadhar_back_url  is distinct from old.aadhar_back_url
  or new.pan_card_url     is distinct from old.pan_card_url then
    new.kyc_status := 'pending';
    new.kyc_approved_at := null;
  end if;
  return new;
end $$;
create trigger hr_profiles_guard before insert or update on public.hr_profiles
  for each row execute function public.guard_hr_profile();

-- Leave requests: admins manage all; a member reads their own and may only file pending requests.
drop policy if exists tenant_isolation on public.leave_requests;
create policy admin_all on public.leave_requests for all to authenticated
  using (org_id = public.current_org_id() and public.is_org_admin())
  with check (org_id = public.current_org_id() and public.is_org_admin());
create policy self_select on public.leave_requests for select to authenticated
  using (org_id = public.current_org_id() and member_id = auth.uid());
create policy self_insert on public.leave_requests for insert to authenticated
  with check (org_id = public.current_org_id() and member_id = auth.uid() and status = 'pending');

-- Attendance: the whole team can see who is in today (Board checks assignee presence),
-- but a member can only write their own rows.
drop policy if exists tenant_isolation on public.attendance;
create policy org_select on public.attendance for select to authenticated
  using (org_id = public.current_org_id());
create policy admin_write on public.attendance for all to authenticated
  using (org_id = public.current_org_id() and public.is_org_admin())
  with check (org_id = public.current_org_id() and public.is_org_admin());
create policy self_insert on public.attendance for insert to authenticated
  with check (org_id = public.current_org_id() and user_id = auth.uid());
create policy self_update on public.attendance for update to authenticated
  using (org_id = public.current_org_id() and user_id = auth.uid())
  with check (org_id = public.current_org_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Signup rate limiting (written by /api/signup with the service role only)
-- ---------------------------------------------------------------------
create table public.signup_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index on public.signup_attempts(ip, created_at);
alter table public.signup_attempts enable row level security;  -- no policies: service role only
