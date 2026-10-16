-- =====================================================================
-- Multi-tenant schema for the agency CRM SaaS.
-- Run this ONCE on a FRESH Supabase project (SQL Editor → paste → Run).
--
-- How isolation works:
--   * Every business table has org_id NOT NULL DEFAULT current_org_id().
--     The browser never sends org_id — Postgres fills it from the logged-in
--     user's profile, and RLS only returns rows of that same org.
--   * Server routes (service role) must set org_id explicitly.
--   * Platform admins (the SaaS owner) read everything through server-only
--     API routes that use the service role; there is NO RLS bypass for them.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Organizations (one per agency workspace)
-- ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete set null,
  plan text not null default 'starter' check (plan in ('starter','growth','pro')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled','suspended')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  razorpay_subscription_id text,
  pending_subscription_id text,
  pending_plan text,
  settings jsonb not null default '{"finance_accounts":["Current Account","Cash in Hand","UPI"],"dasti_people":[]}'::jsonb,
  created_at timestamptz not null default now()
);

-- Platform owner accounts (you). Only the service role can read this table.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Payment / subscription event log (written by the Razorpay webhook)
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  event text not null,
  amount numeric,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Profiles (team members). One user belongs to exactly one org.
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  role text default 'member',
  color text default '#7c6ef5',
  created_at timestamptz default now(),
  permissions jsonb,
  email text,
  phone text,
  client_access jsonb,
  status text default 'active',
  position text
);
create index on public.profiles(org_id);

-- Client-portal logins (an agency's customers)
create table public.client_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_name text not null,
  contact_name text,
  email text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Helper functions (security definer → read profiles without RLS recursion)
-- ---------------------------------------------------------------------
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_org_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.client_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.client_profiles where id = auth.uid()
$$;

create or replace function public.client_name_of() returns text
language sql stable security definer set search_path = public as $$
  select client_name from public.client_profiles where id = auth.uid()
$$;

create or replace function public.plan_team_limit(p text) returns int
language sql immutable as $$
  select case p when 'starter' then 5 when 'growth' then 8 when 'pro' then 30 end
$$;

-- null = unlimited
create or replace function public.plan_task_limit(p text) returns int
language sql immutable as $$
  select case p when 'starter' then 1000 when 'growth' then 3000 else null end
$$;

-- ---------------------------------------------------------------------
-- Business tables (all carry org_id)
-- ---------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  name text not null, industry text, services text[], retainer integer default 0,
  status text default 'Active', manager text, contact text, phone text, notes text,
  color text default '#7c6ef5', created_at timestamptz default now(),
  brand_type text default 'Local', followers_at_joining bigint, joined_date date,
  gstin text default '', billing_address text default '', place_of_supply text default ''
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  name text not null, created_at timestamptz default now()
);

create table public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  client_name text not null, role text not null,
  member_id uuid references public.profiles(id) on delete cascade,
  member_name text, created_at timestamptz default now(),
  unique (org_id, client_name, role)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  title text not null, client text, priority text default 'Medium', assignee text, due date,
  status text default 'To Do', done boolean default false, created_at timestamptz default now(),
  assignees text[], flagged boolean default false, position integer
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  task_id uuid not null, user_name text not null, user_color text default '#6366f1',
  text text not null, mentions text[], created_at timestamptz default now(), read_by text[]
);

create table public.board_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  title text not null, client text, priority text default 'Medium', assignee text, due text,
  column_id text default 'backlog', created_at timestamptz default now(), description text,
  flagged boolean default false
);

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  title text not null, client text not null, pillar text default 'Education', due text,
  assignee text, description text, column_id text default 'idea', created_at timestamptz default now()
);

create table public.content_calendar (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  title text not null, client text, platform text, content_type text, assignee text,
  scheduled_date date, status text default 'Planned', notes text, created_at timestamptz default now(),
  client_approval text, client_comment text, assignees jsonb, drive_link text
);

create table public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  client_name text not null, month text not null, name text not null, description text default '',
  color text default '#60a5fa', position integer default 0, created_at timestamptz default now()
);

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  title text not null, type text not null, creator_name text not null, client text, platforms text[],
  status text default 'testing', notes text, file_url text, created_at timestamptz default now(),
  approval_stage text default 'Draft', revision_count integer default 0
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  client text not null, color text default '#7c6ef5', planned integer default 0, shot integer default 0,
  edited integer default 0, approval integer default 0, posted integer default 0, month text,
  created_at timestamptz default now()
);

create table public.shoot_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  shoot_date date, client text, video_count integer default 1, scripting text default 'Ideation',
  assignees text[], priority text default 'Medium', status text default 'Scheduled', notes text,
  created_at timestamptz default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  name text not null, mobile text, brand_name text, brand_details text, remarks text,
  status text default 'Call', status_date date, follow_up_date date, follow_up_note text,
  promoted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  client_name text not null, contact_name text, contact_mobile text, reason text, remarks text,
  date date, status text default 'Scheduled', source text,
  lead_id uuid references public.leads(id) on delete set null,
  created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  date date default current_date, clock_in timestamptz, clock_out timestamptz, breaks jsonb,
  total_break_minutes integer default 0, status text default 'active', created_at timestamptz default now(),
  on_shoot boolean default false, shoot_start timestamptz, break_start timestamptz, break_end timestamptz,
  on_leave boolean default false, leave_type text, work_from_home boolean default false,
  is_half_day boolean default false, is_absent boolean default false,
  unique (user_id, date)
);

create table public.overtime (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null, type text not null, hours numeric, rate_per_hour numeric, works_count integer,
  price_per_work numeric, work_desc text, total_amount numeric default 0, notes text,
  created_at timestamptz default now()
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete cascade, member_name text,
  start_date date not null, end_date date not null, leave_type text not null, reason text,
  status text default 'pending', approved_by text, admin_notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table public.leave_balance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete cascade, member_name text, year integer,
  paid_total integer default 2, paid_used integer default 0, sick_total integer default 0,
  sick_used integer default 0, created_at timestamptz default now()
);

create table public.hr_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  address text, profile_pic_url text, department text, date_of_joining date, emergency_contact text,
  emergency_phone text, base_salary numeric default 0, updated_at timestamptz default now(),
  aadhar_front_url text, aadhar_back_url text, pan_card_url text, kyc_status text default 'pending',
  kyc_approved_at timestamptz, joining_letter_url text
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete cascade, member_name text,
  amount numeric not null, payout_type text, month text, date date, notes text, linked_tx_id uuid,
  created_at timestamptz default now()
);

create table public.payroll_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, month text not null,
  absent_day_credit integer default 0, unpaid_day_credit integer default 0, notes text,
  created_at timestamptz default now()
);

create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  member_name text not null, client text, task_title text not null, category text, date date,
  start_time time, end_time time, duration_mins integer default 0, notes text,
  created_at timestamptz default now(), user_id uuid
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  type text not null, amount numeric not null, description text not null, account text not null,
  client text, category text, date date not null, created_at timestamptz default now(),
  linked_payout_id uuid, hr_source boolean default false
);

create table public.balances (
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  account text not null,
  amount numeric default 0,
  primary key (org_id, account)
);

create table public.dasti_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  type text not null, person text not null, amount numeric not null, description text,
  date date not null, created_at timestamptz default now(), account text,
  linked_tx_id uuid references public.transactions(id) on delete set null
);

create table public.retainers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  client_name text, month text, hours_allocated numeric default 0, hours_used numeric default 0,
  monthly_amount numeric default 0, notes text, created_at timestamptz default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  invoice_no text not null, customer_id uuid, customer_name text not null,
  customer_address text default '', customer_gstin text default '', customer_place_of_supply text default '',
  invoice_date date not null default current_date, due_date date, terms text default 'Due on Receipt',
  items jsonb not null, subtotal numeric default 0, apply_gst boolean default true,
  cgst_rate numeric default 9, cgst_amount numeric default 0, sgst_rate numeric default 9,
  sgst_amount numeric default 0, total numeric default 0, status text default 'draft',
  payment_date date, payment_account text, notes text, created_at timestamptz default now(),
  order_number text, salesperson text, subject text, discount_percent numeric default 0,
  adjustment numeric default 0, round_off numeric default 0, customer_notes text
);

create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique default public.current_org_id() references public.organizations(id) on delete cascade,
  company_name text, company_address text, company_gstin text, company_pan text, company_phone text,
  company_email text, company_website text, logo_url text, signature_url text,
  bank_account_name text, bank_account_number text, bank_name text, bank_ifsc text, bank_branch text,
  bank_upi text, invoice_prefix text default 'INV', invoice_start_number integer default 1,
  invoice_terms jsonb, created_at timestamptz default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  type text, title text, body text, meta jsonb, read boolean default false,
  created_at timestamptz default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  sender_id uuid, sender_name text, sender_color text, receiver_id uuid,
  is_group boolean default true, content text not null, created_at timestamptz default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  title text not null, message text not null, assignees text not null default '',
  interval_mins integer not null default 60, active boolean default true, created_by text,
  created_at timestamptz default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  action text, description text, entity_type text, entity_name text,
  created_at timestamptz default now()
);

create table public.team (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  name text not null, role text, color text default '#7c6ef5', skills text[], email text, phone text,
  tasks integer default 0, created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.platform_admins enable row level security;  -- no policies: service role only
alter table public.billing_events  enable row level security;  -- no policies: service role only
alter table public.profiles        enable row level security;
alter table public.client_profiles enable row level security;

-- Organizations: members read their own org; admins may edit only name + settings.
create policy org_select on public.organizations for select to authenticated
  using (id = public.current_org_id() or id = public.client_org_id());
create policy org_update on public.organizations for update to authenticated
  using (id = public.current_org_id() and public.is_org_admin())
  with check (id = public.current_org_id());
revoke update on public.organizations from authenticated, anon;
grant update (name, settings) on public.organizations to authenticated;

-- Profiles: everyone in the org can see teammates; you can edit yourself,
-- admins can edit anyone in the org. Inserts/deletes happen server-side only.
create policy profiles_select on public.profiles for select to authenticated
  using (org_id = public.current_org_id());
create policy profiles_update on public.profiles for update to authenticated
  using (org_id = public.current_org_id() and (id = auth.uid() or public.is_org_admin()))
  with check (org_id = public.current_org_id());

-- Non-admins can't promote themselves or grant themselves permissions.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- service role / SQL editor
  if new.org_id is distinct from old.org_id then
    raise exception 'Cannot move a user to another workspace';
  end if;
  if not public.is_org_admin() and (
       new.role is distinct from old.role
    or new.permissions is distinct from old.permissions
    or new.status is distinct from old.status
    or new.client_access is distinct from old.client_access) then
    raise exception 'Only workspace admins can change roles or permissions';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Client-portal users: the agency team manages them; a client sees only themselves.
create policy client_profiles_team on public.client_profiles for all to authenticated
  using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy client_profiles_self on public.client_profiles for select to authenticated
  using (id = auth.uid());

-- Generic tenant policy for every business table
do $$
declare t text;
begin
  foreach t in array array[
    'clients','contacts','client_assignments','tasks','task_comments','board_tasks','content_ideas',
    'content_calendar','content_pillars','creatives','videos','shoot_plans','leads','meetings',
    'attendance','overtime','leave_requests','leave_balance','hr_profiles','payouts','payroll_overrides',
    'timesheets','transactions','balances','dasti_transactions','retainers','invoices','company_settings',
    'notifications','messages','alerts','activity_logs','team'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated
         using (org_id = public.current_org_id())
         with check (org_id = public.current_org_id())', t);
    execute format('create index if not exists %I on public.%I(org_id)', t || '_org_idx', t);
  end loop;
end $$;

-- Client portal: a client can read & approve only their own brand's calendar.
create policy client_portal_select on public.content_calendar for select to authenticated
  using (org_id = public.client_org_id() and client = public.client_name_of());
create policy client_portal_update on public.content_calendar for update to authenticated
  using (org_id = public.client_org_id() and client = public.client_name_of())
  with check (org_id = public.client_org_id() and client = public.client_name_of());

-- ---------------------------------------------------------------------
-- Plan limits (enforced in the database, cannot be bypassed from the UI)
-- ---------------------------------------------------------------------
create or replace function public.enforce_task_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int; p text;
begin
  select plan into p from public.organizations where id = new.org_id;
  lim := public.plan_task_limit(p);
  if lim is null then return new; end if;
  select (select count(*) from public.tasks       where org_id = new.org_id and created_at >= date_trunc('month', now()))
       + (select count(*) from public.board_tasks where org_id = new.org_id and created_at >= date_trunc('month', now()))
    into used;
  if used >= lim then
    raise exception 'Plan limit reached: your plan allows % tasks per month. Upgrade your plan to add more.', lim;
  end if;
  return new;
end $$;
create trigger tasks_limit       before insert on public.tasks       for each row execute function public.enforce_task_limit();
create trigger board_tasks_limit before insert on public.board_tasks for each row execute function public.enforce_task_limit();

create or replace function public.enforce_team_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int; p text;
begin
  if coalesce(new.status, 'active') = 'left' then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.status, 'active') <> 'left' then return new; end if;
  select plan into p from public.organizations where id = new.org_id;
  lim := public.plan_team_limit(p);
  select count(*) into used from public.profiles
    where org_id = new.org_id and coalesce(status, 'active') <> 'left' and id <> new.id;
  if used >= lim then
    raise exception 'Plan limit reached: your plan allows % team members. Upgrade your plan to add more.', lim;
  end if;
  return new;
end $$;
create trigger profiles_team_limit before insert or update of status on public.profiles
  for each row execute function public.enforce_team_limit();

-- ---------------------------------------------------------------------
-- Storage: files live under "<org_id>/..." in each bucket.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('company-assets','company-assets',true),
  ('content-files','content-files',true),
  ('member-docs','member-docs',true),
  ('profile-pics','profile-pics',true)
on conflict (id) do nothing;

create policy org_files_select on storage.objects for select to authenticated
  using (bucket_id in ('company-assets','content-files','member-docs','profile-pics')
         and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy org_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('company-assets','content-files','member-docs','profile-pics')
         and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy org_files_update on storage.objects for update to authenticated
  using (bucket_id in ('company-assets','content-files','member-docs','profile-pics')
         and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy org_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('company-assets','content-files','member-docs','profile-pics')
         and (storage.foldername(name))[1] = public.current_org_id()::text);

-- ---------------------------------------------------------------------
-- Realtime (RLS applies to realtime too, so each agency only hears its own rows)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.attendance, public.balances, public.board_tasks, public.client_assignments, public.clients,
  public.content_calendar, public.creatives, public.dasti_transactions, public.invoices, public.leads,
  public.leave_balance, public.leave_requests, public.meetings, public.messages, public.notifications,
  public.payouts, public.profiles, public.task_comments, public.tasks, public.timesheets,
  public.transactions, public.videos;
