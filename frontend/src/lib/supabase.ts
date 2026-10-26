import { createClient } from "@supabase/supabase-js";
import { assertDevSupabaseTarget } from "@/lib/supabaseEnv";

const urlRaw = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const allowRemote =
  String(import.meta.env.VITE_ALLOW_REMOTE_SUPABASE ?? "").toLowerCase() === "true";

const target = assertDevSupabaseTarget(urlRaw, {
  isDev: Boolean(import.meta.env.DEV),
  allowRemote,
});

if (!target.ok) {
  // Fail closed: do not silently continue against a hosted project during local vite serve.
  console.error(target.error);
  throw new Error(target.error);
}

if (!urlRaw || !anonKey) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. See frontend/.env.example.",
  );
}

export const supabase = createClient(target.url, anonKey ?? "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const isSupabaseConfigured = Boolean(
  anonKey && !String(anonKey).includes("your_"),
);

export const supabaseDevTargetError: string | null = null;
