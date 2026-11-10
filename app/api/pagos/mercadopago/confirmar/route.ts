import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { obtenerPago } from '@/services/payments/mercadopago';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esquema = z.object({ paymentId: z.string().regex(/^\d{1,20}$/) });

/**
 * Respaldo del webhook: al volver de Mercado Pago la URL trae payment_id. Se consulta el pago
 * real en la API de MP (no se confía en el navegador) y se acredita igual que el webhook.
 */
export async function POST(pedido: Request) {
  const cuerpo = esquema.safeParse(await pedido.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });

  try {
    const pago = await obtenerPago(cuerpo.data.paymentId);
    const pedidoId = pago.external_reference;
    if (!pedidoId || !UUID.test(pedidoId)) return NextResponse.json({ estado: 'desconocido' });

    const admin = supabaseAdmin();
    if (pago.status === 'approved' && pago.currency_id === 'ARS') {
      const { error } = await admin.rpc('completar_pedido', {
        p_pedido_id: pedidoId,
        p_id_pago: String(pago.id),
        p_monto: pago.transaction_amount,
      });
      if (error) {
        console.error('Confirmar pago MP', pago.id, error.message);
        return NextResponse.json({ error: 'No se pudo acreditar el pago.' }, { status: 409 });
      }
      return NextResponse.json({ estado: 'aprobado' });
    }
    if (pago.status === 'rejected' || pago.status === 'cancelled') {
      await admin.rpc('marcar_pedido_fallido', { p_pedido_id: pedidoId, p_id_pago: String(pago.id) });
      return NextResponse.json({ estado: 'rechazado' });
    }
    return NextResponse.json({ estado: 'pendiente' });
  } catch (e) {
    console.error('Confirmar pago MP', e);
    return NextResponse.json({ error: 'No se pudo consultar el pago.' }, { status: 502 });
  }
}
