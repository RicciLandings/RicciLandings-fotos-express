import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL, configurado } from '@/lib/config';

const LOGIN = '/admin/login';
const PANEL = '/admin/dashboard';

/** Renueva la sesión y protege /admin/* (menos el login). El permiso real lo controla RLS con es_admin(). */
export async function actualizarSesion(pedido: NextRequest) {
  if (!configurado) return NextResponse.next();

  let respuesta = NextResponse.next({ request: pedido });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => pedido.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) pedido.cookies.set(name, value);
        respuesta = NextResponse.next({ request: pedido });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = pedido.nextUrl.pathname;
  if (!user && ruta !== LOGIN) return NextResponse.redirect(new URL(LOGIN, pedido.url));
  if (user && ruta === LOGIN) return NextResponse.redirect(new URL(PANEL, pedido.url));
  return respuesta;
}
