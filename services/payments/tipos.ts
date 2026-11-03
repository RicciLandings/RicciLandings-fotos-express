import type { Moneda, Pasarela } from '@/lib/tipos';

// Contrato común para Mercado Pago y Stripe. Las implementaciones van en este mismo directorio
// (mercadopago.ts, stripe.ts) y se usan solo desde el servidor.

export interface DatosCheckout {
  pedidoId: string;
  codigo: string;
  monto: number;
  moneda: Moneda;
  emailCliente?: string;
  urlVuelta: string;
}

export interface CheckoutCreado {
  pasarela: Pasarela;
  /** Adónde mandar al cliente para pagar. */
  urlPago: string;
}

export interface PagoConfirmado {
  pedidoId: string;
  idPago: string;
  montoPagado: number;
}

export interface ServicioPago {
  pasarela: Pasarela;
  crearCheckout(datos: DatosCheckout): Promise<CheckoutCreado>;
  /** Verifica la firma del webhook y devuelve el pago aprobado, o null si no corresponde. */
  verificarWebhook(pedido: Request): Promise<PagoConfirmado | null>;
}
