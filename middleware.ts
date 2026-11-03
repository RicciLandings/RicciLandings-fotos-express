import type { NextRequest } from 'next/server';
import { actualizarSesion } from '@/lib/supabase/middleware';

export function middleware(pedido: NextRequest) {
  return actualizarSesion(pedido);
}

// Solo el panel: las páginas del cliente no pagan el costo del middleware.
export const config = { matcher: ['/admin/:path*'] };
