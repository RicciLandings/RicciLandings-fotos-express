'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/config';

let cliente: SupabaseClient | null = null;

/** Cliente de Supabase para el navegador (una sola instancia). Usa la anon key y respeta RLS. */
export function supabaseNavegador(): SupabaseClient {
  if (!cliente) cliente = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cliente;
}
