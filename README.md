# AgencyOS — multi-agency CRM (SaaS)

Agencies sign up, create a workspace, invite their team, and pay monthly via Razorpay.
Each agency's data is isolated in the database (Postgres Row Level Security on `org_id`).

| Route | What it is |
|---|---|
| `/` | Public landing page + pricing |
| `/signup` | Agency creates a workspace (14-day trial) |
| `/app` | The CRM (login for agency admins & team) |
| `/client` | Client approval portal (an agency's customers) |
| `/console` | **Platform owner console** — not linked anywhere |
| `/terms`, `/privacy` | Legal pages (template — get a lawyer to review) |

Rename the product in **`lib/brand.ts`** and replace `public/brand-logo.svg`. Plans live in **`lib/plans.ts`**
(limits are also in the SQL functions `plan_team_limit` / `plan_task_limit` — keep both in sync).

## Plans

| | Starter ₹999 | Growth ₹2,500 | Pro ₹9,999 |
|---|---|---|---|
| Active team members (incl. owner) | 5 | 8 | 30 |
| Tasks created per month (Tasks + Board) | 1,000 | 3,000 | Unlimited |
| Modules | Clients, tasks, board, content calendar & ideas, posting tracker, leads, meetings, attendance, team | + video tracker, shoot planner, creatives, timesheets, reports, client portal, alerts | Everything: + finance & invoices, HR & payroll, morning briefing |

## Go-live checklist

1. **Supabase** — create a NEW project. SQL Editor → paste and run `supabase/migrations/0001_multitenant_schema.sql`,
   then `0002_security_hardening.sql` (private KYC bucket, admin-only finance/HR, signup rate limit).
   Authentication → Providers → Email: keep **"Confirm email" ON** (new agencies verify their email before logging in).
   Authentication → SMTP: set up a custom SMTP sender — Supabase's built-in mailer only sends a few emails per hour.
   Authentication → URL Configuration: set Site URL to your domain and add `https://YOUR_DOMAIN/app` to Redirect URLs.
2. **Your console login** — Authentication → Users → *Add user* (your email + password). Then in SQL Editor:
   ```sql
   insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
   Use an account that is NOT an agency member. Open `/console` and sign in.
3. **Razorpay** — Subscriptions → Plans: create 3 monthly plans (₹999, ₹2,500, ₹9,999). API Keys: generate keys.
   Webhooks: add `https://YOUR_DOMAIN/api/billing/webhook` with events `subscription.activated`, `subscription.charged`,
   `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`.
4. **Env vars** — copy `.env.example` to `.env.local` and fill in; add the same in Vercel.
5. **Deploy** — new GitHub repo + new Vercel project, custom domain.

## How access works

- Agency **admin** (the person who signed up) can invite members (`/api/team/create`), set permissions, create client-portal logins, and manage billing.
- **Members** see only the modules their admin enabled *and* their plan includes. Finance (transactions, balances,
  invoices, retainers) and HR data (salaries, payouts, KYC) are admin-only in the database itself; a member can read
  only their own HR profile, leave, payouts and payroll inputs. KYC scans sit in a private bucket behind 15-minute signed links.
- **Client-portal users** can only read/approve their own brand's content calendar rows.
- When a trial/paid period ends (+3-day grace for failed renewals) the workspace is paused: admins see the plan picker, members see "workspace paused". Data is kept.
- **Platform owner**: `/console` lists every agency with plan, status, usage and revenue, lets you browse any agency's tables, and override plan / status / trial / paid-until dates. It talks to `/api/console`, which checks `platform_admins` server-side using the service role key. This access is disclosed in the Terms and Privacy Policy.

## Database tests

`npm run test:db` runs both migrations on an in-memory Postgres (PGlite, with a small Supabase stub) and checks 48 rules:
workspace isolation, plan team/task limits, admin-only finance & HR, member self-service limits, the client portal and
private KYC storage. Run it after any change to `supabase/migrations/`. It does not test Supabase Auth, email or Razorpay.
