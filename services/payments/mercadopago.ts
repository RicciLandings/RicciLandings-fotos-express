import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SITIO_URL } from '@/lib/config';
import type { CheckoutCreado, DatosCheckout, PagoConfirmado, ServicioPago } from '@/services/payments/tipos';

// Mercado Pago Checkout Pro. Documentación:
// https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/overview
// Notificaciones (webhooks) y firma: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks

const API = 'https://api.mercadopago.com';
const VIGENCIA_MS = 60 * 60 * 1000; // la preferencia vence en 1 hora

export function mercadoPagoConfigurado(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

function token(): string {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!t) throw new Error('Mercado Pago no está configurado (falta MERCADOPAGO_ACCESS_TOKEN).');
  return t;
}

/** Pago tal como lo devuelve GET /v1/payments/{id} (solo lo que se usa). */
export interface PagoMP {
  id: number;
  status: 'approved' | 'pending' | 'in_process' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back' | string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
}

export async function obtenerPago(id: string): Promise<PagoMP> {
  const r = await fetch(`${API}/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status} al consultar el pago ${id}`);
  return r.json();
}

/**
 * Valida la firma del webhook (header x-signature: "ts=…,v1=…").
 * El manifiesto firmado es "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 */
export function firmaValida(opciones: { firma: string | null; requestId: string | null; dataId: string | null; secreto: string }): boolean {
  const { firma, requestId, dataId, secreto } = opciones;
  if (!firma || !dataId) return false;
  const partes = Object.fromEntries(
    firma.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  if (!partes.ts || !partes.v1) return false;
  // Mercado Pago pide el id en minúsculas si es alfanumérico.
  let manifiesto = `id:${dataId.toLowerCase()};`;
  if (requestId) manifiesto += `request-id:${requestId};`;
  manifiesto += `ts:${partes.ts};`;
  const esperada = createHmac('sha256', secreto).update(manifiesto).digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(partes.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const mercadoPago: ServicioPago = {
  pasarela: 'mercadopago',

  async crearCheckout(datos: DatosCheckout): Promise<CheckoutCreado> {
    const vence = new Date(Date.now() + VIGENCIA_MS).toISOString();
    const r = await fetch(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
        // Si se reintenta el mismo pedido, Mercado Pago devuelve la misma preferencia.
        'X-Idempotency-Key': datos.pedidoId,
      },
      body: JSON.stringify({
        items: [
          {
            id: datos.pedidoId,
            title: datos.descripcion,
            quantity: 1,
            unit_price: Number(datos.monto),
            currency_id: datos.moneda,
          },
        ],
        external_reference: datos.pedidoId,
        back_urls: { success: datos.urlVuelta, pending: datos.urlVuelta, failure: datos.urlVuelta },
        auto_return: 'approved',
        notification_url: `${SITIO_URL}/api/webhooks/mercadopago`,
        statement_descriptor: 'FOTOS EXPRESS',
        expires: true,
        expiration_date_to: vence,
        ...(datos.emailCliente ? { payer: { email: datos.emailCliente } } : {}),
      }),
    });
    if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status}: ${await r.text()}`);
    const preferencia = (await r.json()) as { init_point: string };
    return { pasarela: 'mercadopago', urlPago: preferencia.init_point };
  },

  async verificarWebhook(pedido: Request): Promise<PagoConfirmado | null> {
    const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!secreto) throw new Error('Falta MERCADOPAGO_WEBHOOK_SECRET.');
    const url = new URL(pedido.url);
    const cuerpo = (await pedido.json().catch(() => ({}))) as { type?: string; data?: { id?: string | number } };
    const dataId = url.searchParams.get('data.id') ?? (cuerpo.data?.id != null ? String(cuerpo.data.id) : null);
    const ok = firmaValida({
      firma: pedido.headers.get('x-signature'),
      requestId: pedido.headers.get('x-request-id'),
      dataId,
      secreto,
    });
    if (!ok) throw new FirmaInvalida();
    if ((cuerpo.type ?? url.searchParams.get('type')) !== 'payment' || !dataId) return null;

    // El pago real lo dice la API, no el cuerpo del webhook.
    const pago = await obtenerPago(dataId);
    if (!pago.external_reference) return null;
    return {
      pedidoId: pago.external_reference,
      idPago: String(pago.id),
      montoPagado: pago.transaction_amount,
      estado: pago.status,
      moneda: pago.currency_id,
    };
  },
};

export class FirmaInvalida extends Error {}
