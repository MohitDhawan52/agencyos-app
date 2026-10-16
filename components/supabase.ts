import { createClient } from "@supabase/supabase-js";

// iOS Safari (Private mode / ITP) can block localStorage entirely.
// This adapter tries localStorage first, falls back to sessionStorage, then memory.
const memoryStore: Record<string, string> = {};
const safeStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key); } catch {}
    try { return sessionStorage.getItem(key); } catch {}
    return memoryStore[key] ?? null;
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value); return; } catch {}
    try { sessionStorage.setItem(key, value); return; } catch {}
    memoryStore[key] = value;
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
    delete memoryStore[key];
  },
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: safeStorage,
    },
  }
);