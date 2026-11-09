import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { FirmaInvalida, mercadoPago } from '@/services/payments/mercadopago';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECHAZOS = new Set(['rejected', 'cancelled']);

/**
 * Aviso de Mercado Pago. Verifica la firma, consulta el pago real y acredita el pedido.
 * Responde 200 aunque no haya nada que hacer (completar_pedido es idempotente): si MP no recibe
 * un 200 reintenta. Si algo falla de nuestro lado responde 500 para que MP reintente.
 */
export async function POST(pedido: Request) {
  try {
    const pago = await mercadoPago.verificarWebhook(pedido);
    if (!pago || !UUID.test(pago.pedidoId)) return NextResponse.json({ ok: true });

    const admin = supabaseAdmin();
    if (pago.estado === 'approved' && pago.moneda === 'ARS') {
      const { error } = await admin.rpc('completar_pedido', {
        p_pedido_id: pago.pedidoId,
        p_id_pago: pago.idPago,
        p_monto: pago.montoPagado,
      });
      // Pedido inexistente o monto que no cubre: no tiene sentido que MP reintente.
      if (error && error.code !== 'P0002' && error.code !== '22023') throw error;
      if (error) console.error('Webhook MP: pago no acreditado', pago, error.message);
    } else if (RECHAZOS.has(pago.estado)) {
      const { error } = await admin.rpc('marcar_pedido_fallido', { p_pedido_id: pago.pedidoId, p_id_pago: pago.idPago });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FirmaInvalida) return NextResponse.json({ error: 'Firma inválida.' }, { status: 401 });
    console.error('Webhook MP', e);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
