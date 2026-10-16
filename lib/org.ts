// Current workspace, loaded once after login (before the CRM renders).
// Arrays are mutated in place so modules that imported them keep a live reference.
import { supabase } from "@/components/supabase";

export const FINANCE_ACCOUNTS: string[] = ["Current Account", "Cash in Hand", "UPI"];
export const DASTI_PEOPLE: string[] = [];

let currentOrg: any = null;

export function setOrg(org: any) {
  currentOrg = org;
  const accounts: string[] = org?.settings?.finance_accounts?.length ? org.settings.finance_accounts : ["Current Account", "Cash in Hand", "UPI"];
  FINANCE_ACCOUNTS.splice(0, FINANCE_ACCOUNTS.length, ...accounts);
  DASTI_PEOPLE.splice(0, DASTI_PEOPLE.length, ...(org?.settings?.dasti_people || []));
}

export const getOrg = () => currentOrg;
export const orgName = () => currentOrg?.name || "Your Agency";

// Storage paths must start with the org id (enforced by storage RLS).
export const orgPath = (path: string) => `${currentOrg?.id}/${path}`;

// member-docs (KYC scans, joining letters) is a private bucket. hr_profiles stores the
// object path; display it through a short-lived signed URL.
export const MEMBER_DOCS_BUCKET = "member-docs";
const SIGNED_URL_TTL = 15 * 60; // seconds

// Accepts an object path, or a legacy public URL saved before the bucket went private.
const memberDocPath = (value: string) => value.split(`/object/public/${MEMBER_DOCS_BUCKET}/`).pop() || value;

// Returns { storedValue: signedUrl } for every value the caller may read (storage RLS decides).
export async function signMemberDocs(values: (string | null | undefined)[]): Promise<Record<string, string>> {
  const stored = Array.from(new Set(values.filter((v): v is string => !!v)));
  if (!stored.length) return {};
  const { data } = await supabase.storage.from(MEMBER_DOCS_BUCKET).createSignedUrls(stored.map(memberDocPath), SIGNED_URL_TTL);
  const out: Record<string, string> = {};
  (data || []).forEach((d, i) => { if (d.signedUrl) out[stored[i]] = d.signedUrl; });
  return out;
}

const PALETTE = ["#60a5fa", "#4ade80", "#a78bfa", "#f472b6", "#fbbf24", "#22d3ee", "#fb923c", "#94a3b8"];
export const accountColor = (acc: string) => {
  const i = FINANCE_ACCOUNTS.indexOf(acc);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
};
export const accountIcon = (acc: string) => {
  const a = acc.toLowerCase();
  if (a.includes("cash")) return "ti-cash";
  if (a.includes("upi") || a.includes("pay")) return "ti-device-mobile";
  return "ti-building-bank";
};
export const zeroBalances = () => Object.fromEntries(FINANCE_ACCOUNTS.map(a => [a, 0])) as Record<string, number>;

// fetch() to our own API routes with the user's access token attached.
export async function authedFetch(url: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(body || {}),
  });
  let json: any = {};
  try { json = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, json };
}
