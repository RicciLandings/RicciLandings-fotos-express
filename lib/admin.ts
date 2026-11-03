import 'server-only';
import { supabaseServidor } from '@/lib/supabase/server';

/** Usuario de la sesión y si es administrador. El permiso real lo hace cumplir RLS con es_admin(). */
export async function sesionAdmin() {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, usuario: null, esAdmin: false } as const;
  const { data } = await supabase.rpc('es_admin');
  return { supabase, usuario: user, esAdmin: data === true } as const;
}
