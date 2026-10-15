import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;
let anon: SupabaseClient | null = null;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export function db(): SupabaseClient {
  admin ??= createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export function anonDb(): SupabaseClient {
  anon ??= createClient(need("SUPABASE_URL"), need("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anon;
}


type Page<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  max = 50_000,
  size = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, Math.min(from + size, max) - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return { data: out, error: null };
}
