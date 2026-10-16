// Runs the AgencyOS migrations on PGlite (real Postgres in WASM) with a minimal
// Supabase stub, then exercises RLS / triggers as different users.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { fileURLToPath } from "url";

const MIG = fileURLToPath(new URL("../migrations/", import.meta.url));
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ---- Supabase stub -------------------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to authenticated, anon;
  grant all on all tables in schema storage to authenticated;
  alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
  alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
`);

for (const f of ["0001_multitenant_schema.sql", "0002_security_hardening.sql"]) {
  try { await db.exec(fs.readFileSync(MIG + f, "utf8").replace("create extension if not exists pgcrypto;", "")); ok(`migration ${f} applies`, true); }
  catch (e) { ok(`migration ${f} applies`, false, e.message); process.exit(1); }
}

// ---- Fixtures (as superuser, like the service role) ----------------------
const U = { adminA: "a0000000-0000-0000-0000-00000000000a", memberA: "a0000000-0000-0000-0000-00000000000b",
            adminB: "b0000000-0000-0000-0000-00000000000a", clientA: "c0000000-0000-0000-0000-00000000000a" };
const OA = "0a000000-0000-0000-0000-000000000000", OB = "0b000000-0000-0000-0000-000000000000";
await db.exec(`
  insert into auth.users values ('${U.adminA}','a@a'),('${U.memberA}','m@a'),('${U.adminB}','a@b'),('${U.clientA}','c@a');
  insert into organizations (id,name,owner_id,plan,status) values ('${OA}','Org A','${U.adminA}','starter','active'),('${OB}','Org B','${U.adminB}','starter','active');
  insert into profiles (id,org_id,name,role) values ('${U.adminA}','${OA}','Admin A','admin'),('${U.memberA}','${OA}','Member A','member'),('${U.adminB}','${OB}','Admin B','admin');
  insert into client_profiles (id,org_id,client_name) values ('${U.clientA}','${OA}','Acme');
`);

const as = async (uid, fn) => {
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec(`set role authenticated`);
  try { return await fn(); } finally { await db.exec(`reset role`); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
};
const tryQ = async (sql, params) => { try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { error: e.message }; } };

// ---- Tenant isolation ----------------------------------------------------
await as(U.memberA, () => tryQ(`insert into clients (name) values ('Acme'),('Beta')`));
await as(U.adminB, () => tryQ(`insert into clients (name) values ('B-client')`));
const aClients = await as(U.memberA, () => tryQ(`select name, org_id from clients`));
ok("org_id auto-filled from user's workspace", aClients.rows?.every(r => r.org_id === OA), JSON.stringify(aClients.rows));
ok("Org A sees only its own clients", aClients.rows?.length === 2);
const bClients = await as(U.adminB, () => tryQ(`select name from clients`));
ok("Org B cannot see Org A clients", bClients.rows?.length === 1 && bClients.rows[0].name === "B-client");
const spoof = await as(U.adminB, () => tryQ(`insert into clients (name, org_id) values ('x', '${OA}')`));
ok("Cannot insert rows into another workspace", !!spoof.error, spoof.error);
const crossUpd = await as(U.adminB, () => tryQ(`update clients set name='hacked' where org_id='${OA}' returning id`));
ok("Cannot update another workspace's rows", (crossUpd.rows?.length ?? 0) === 0);
const orgsB = await as(U.adminB, () => tryQ(`select name from organizations`));
ok("A user sees only their own organization row", orgsB.rows?.length === 1 && orgsB.rows[0].name === "Org B");
const profB = await as(U.adminB, () => tryQ(`select id from profiles`));
ok("Team list is per workspace", profB.rows?.length === 1);
const pa = await as(U.adminA, () => tryQ(`select * from platform_admins`));
ok("platform_admins is unreadable from the browser", (pa.rows?.length ?? 0) === 0);

// ---- Role protections ----------------------------------------------------
const selfPromote = await as(U.memberA, () => tryQ(`update profiles set role='admin' where id='${U.memberA}'`));
ok("Member cannot make themselves admin", !!selfPromote.error, selfPromote.error);
const selfName = await as(U.memberA, () => tryQ(`update profiles set phone='123' where id='${U.memberA}' returning id`));
ok("Member can edit own phone", selfName.rows?.length === 1, selfName.error);
const planHack = await as(U.adminA, () => tryQ(`update organizations set plan='pro', status='active' where id='${OA}'`));
ok("Agency admin cannot change their own plan/status", !!planHack.error, planHack.error);
const rename = await as(U.adminA, () => tryQ(`update organizations set name='Org A2' where id='${OA}' returning name`));
ok("Agency admin can rename workspace", rename.rows?.[0]?.name === "Org A2", rename.error);
const memberRename = await as(U.memberA, () => tryQ(`update organizations set name='x' where id='${OA}' returning name`));
ok("Member cannot rename workspace", (memberRename.rows?.length ?? 0) === 0);

// ---- Finance / HR admin-only ---------------------------------------------
const finA = await as(U.adminA, () => tryQ(`insert into transactions (type,amount,description,account,date) values ('income',100,'x','Cash',current_date) returning id`));
ok("Admin can record a transaction", finA.rows?.length === 1, finA.error);
const finM = await as(U.memberA, () => tryQ(`select * from transactions`));
ok("Member cannot read finance", finM.rows?.length === 0);
const finMi = await as(U.memberA, () => tryQ(`insert into transactions (type,amount,description,account,date) values ('income',1,'x','Cash',current_date)`));
ok("Member cannot write finance", !!finMi.error);
const bal = await as(U.adminA, () => tryQ(`insert into balances (account, amount) values ('Cash', 5) on conflict (org_id, account) do update set amount = excluded.amount returning amount`));
ok("Balance upsert onConflict org_id,account works", bal.rows?.[0]?.amount == 5, bal.error);
await db.exec(`insert into hr_profiles (id, org_id, base_salary) values ('${U.memberA}','${OA}',20000)`);
const sal = await as(U.memberA, () => tryQ(`update hr_profiles set base_salary=99999 where id='${U.memberA}'`));
ok("Member cannot raise own salary", !!sal.error, sal.error);
const addr = await as(U.memberA, () => tryQ(`update hr_profiles set address='new' where id='${U.memberA}' returning id`));
ok("Member can edit own address", addr.rows?.length === 1, addr.error);
const leave = await as(U.memberA, () => tryQ(`insert into leave_requests (member_id,start_date,end_date,leave_type,status) values ('${U.memberA}',current_date,current_date,'paid','approved')`));
ok("Member cannot self-approve leave", !!leave.error);
const leaveOk = await as(U.memberA, () => tryQ(`insert into leave_requests (member_id,start_date,end_date,leave_type) values ('${U.memberA}',current_date,current_date,'paid') returning id`));
ok("Member can file a pending leave", leaveOk.rows?.length === 1, leaveOk.error);
const attOther = await as(U.memberA, () => tryQ(`insert into attendance (user_id) values ('${U.adminA}')`));
ok("Member cannot clock in for someone else", !!attOther.error);
const attSelf = await as(U.memberA, () => tryQ(`insert into attendance (user_id) values ('${U.memberA}') returning id`));
ok("Member can clock in themselves", attSelf.rows?.length === 1, attSelf.error);

// ---- Client portal -------------------------------------------------------
await as(U.adminA, () => tryQ(`insert into content_calendar (title, client) values ('Acme reel','Acme'),('Beta reel','Beta')`));
const cal = await as(U.clientA, () => tryQ(`select title from content_calendar`));
ok("Client sees only their brand's calendar", cal.rows?.length === 1 && cal.rows[0].title === "Acme reel", JSON.stringify(cal.rows));
const appr = await as(U.clientA, () => tryQ(`update content_calendar set client_approval='approved' where title='Acme reel' returning id`));
ok("Client can approve their content", appr.rows?.length === 1, appr.error);
const cCl = await as(U.clientA, () => tryQ(`select * from clients`));
ok("Client cannot read agency's client list", cCl.rows?.length === 0);
const cOrg = await as(U.clientA, () => tryQ(`select name from organizations`));
ok("Client can read their agency's org row (for branding)", cOrg.rows?.length === 1);

// ---- Storage --------------------------------------------------------------
const st = (uid, bucket, path) => as(uid, () => tryQ(`insert into storage.objects (bucket_id, name) values ($1, $2) returning id`, [bucket, path]));
ok("Member uploads own KYC doc", !(await st(U.memberA, "member-docs", `${OA}/${U.memberA}/pan.png`)).error);
ok("Member cannot upload into another member's KYC folder", !!(await st(U.memberA, "member-docs", `${OA}/${U.adminA}/pan.png`)).error);
ok("Admin can upload any member's KYC doc", !(await st(U.adminA, "member-docs", `${OA}/${U.memberA}/aadhar.png`)).error);
ok("Cannot upload into another workspace's folder", !!(await st(U.adminB, "content-files", `${OA}/x.mp4`)).error);
ok("Upload into own workspace folder works", !(await st(U.adminB, "content-files", `${OB}/x.mp4`)).error);
await st(U.adminA, "member-docs", `${OA}/${U.adminA}/own-pan.png`);
const kyc = await as(U.memberA, () => tryQ(`select name from storage.objects where bucket_id='member-docs'`));
ok("Member sees only own KYC files (not admin's)", kyc.rows?.length === 2 && kyc.rows.every(r => r.name.includes(U.memberA)), JSON.stringify(kyc.rows));
const kycAdmin = await as(U.adminA, () => tryQ(`select name from storage.objects where bucket_id='member-docs'`));
ok("Admin sees all KYC files in workspace", kycAdmin.rows?.length === 3);
const kycB = await as(U.adminB, () => tryQ(`select name from storage.objects where bucket_id='member-docs'`));
ok("Other workspace admin sees no KYC files", kycB.rows?.length === 0);
const bucketPub = await db.query(`select public from storage.buckets where id='member-docs'`);
ok("member-docs bucket is private", bucketPub.rows[0].public === false);

// ---- Plan limits ----------------------------------------------------------
const team = [];
for (let i = 0; i < 4; i++) {
  const id = `a0000000-0000-0000-0000-1000000000${i}0`;
  await db.exec(`insert into auth.users values ('${id}','t${i}@a')`);
  team.push(await tryQ(`insert into profiles (id, org_id, name) values ('${id}','${OA}','T${i}')`));
}
ok("Starter: 5th member allowed", !team[2].error, team[2].error);
ok("Starter: 6th member blocked", !!team[3].error && team[3].error.includes("Plan limit"), team[3].error);
await db.exec(`update profiles set status='left' where id='a0000000-0000-0000-0000-100000000000'`);
const reuse = await tryQ(`insert into profiles (id, org_id, name) values ('a0000000-0000-0000-0000-100000000030','${OA}','T3')`);
ok("Freed seat can be reused by a new member", !reuse.error, reuse.error);
const reAct = await tryQ(`update profiles set status='active' where id='a0000000-0000-0000-0000-100000000000'`);
ok("Re-activating a former member past the limit is blocked", !!reAct.error && reAct.error.includes("Plan limit"), reAct.error);
await db.exec(`update organizations set plan='growth' where id='${OA}'`);
const reAct2 = await tryQ(`update profiles set status='active' where id='a0000000-0000-0000-0000-100000000000'`);
ok("After upgrade to Growth the member can be re-activated", !reAct2.error, reAct2.error);
await db.exec(`update organizations set plan='starter' where id='${OA}'`);

const bulk = await as(U.adminA, () => tryQ(`insert into tasks (title) select 'T' || g from generate_series(1, 999) g`));
ok("999 tasks inserted", !bulk.error, bulk.error);
const t1000 = await as(U.adminA, () => tryQ(`insert into board_tasks (title) values ('board 1000')`));
ok("1,000th task (board) allowed", !t1000.error, t1000.error);
const t1001 = await as(U.adminA, () => tryQ(`insert into tasks (title) values ('over')`));
ok("1,001st task blocked on Starter", !!t1001.error && t1001.error.includes("Plan limit"), t1001.error);
await db.exec(`update organizations set plan='pro' where id='${OA}'`);
const tPro = await as(U.adminA, () => tryQ(`insert into tasks (title) values ('pro unlimited') returning id`));
ok("Pro plan has unlimited tasks", tPro.rows?.length === 1, tPro.error);
const tB = await as(U.adminB, () => tryQ(`insert into tasks (title) values ('B task') returning id`));
ok("Org A's usage doesn't count against Org B", tB.rows?.length === 1, tB.error);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
