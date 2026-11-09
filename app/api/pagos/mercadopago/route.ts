import { NextResponse } from 'next/server';
import { z } from 'zod';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';
import { SITIO_URL } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { mercadoPago, mercadoPagoConfigurado } from '@/services/payments/mercadopago';

export const dynamic = 'force-dynamic';

const esquema = z.object({
  codigo: z.string().min(1).max(30),
  tipo: z.enum(['fotos', 'pack']),
  fotoIds: z.array(z.string().uuid()).max(200).default([]),
});

function error(mensaje: string, estado: number) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/** Crea el pedido (la base calcula el monto) y devuelve la URL de pago de Mercado Pago. */
export async function POST(pedido: Request) {
  if (!mercadoPagoConfigurado()) return error('Los pagos todavía no están habilitados.', 503);

  const cuerpo = esquema.safeParse(await pedido.json().catch(() => null));
  if (!cuerpo.success) return error('Pedido inválido.', 400);
  const codigo = normalizarCodigo(cuerpo.data.codigo);
  if (!codigoValido(codigo)) return error('Código inválido.', 400);

  try {
    const { data, error: errorPedido } = await supabaseAdmin().rpc('crear_pedido', {
      p_codigo: codigo,
      p_tipo: cuerpo.data.tipo,
      p_foto_ids: cuerpo.data.tipo === 'fotos' ? cuerpo.data.fotoIds : null,
      p_pasarela: 'mercadopago',
    });
    if (errorPedido) {
      // Los errores de negocio de la base (foto ya paga, pack no disponible) se muestran tal cual.
      const negocio = errorPedido.code === '22023' || errorPedido.code === 'P0002';
      return error(negocio ? errorPedido.message : 'No se pudo crear el pedido.', negocio ? 409 : 500);
    }
    const creado = data as { pedido_id: string; monto: number; descripcion: string; codigo: string };

    const { urlPago } = await mercadoPago.crearCheckout({
      pedidoId: creado.pedido_id,
      codigo: creado.codigo,
      descripcion: creado.descripcion,
      monto: Number(creado.monto),
      moneda: 'ARS',
      urlVuelta: `${SITIO_URL}/f/${creado.codigo}?pago=pendiente`,
    });
    return NextResponse.json({ url: urlPago }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Pago Mercado Pago', codigo, e);
    return error('No se pudo iniciar el pago. Probá de nuevo en unos minutos.', 502);
  }
}
