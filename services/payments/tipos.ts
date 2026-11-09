import type { Moneda, Pasarela } from '@/lib/tipos';

// Contrato común de las pasarelas (Mercado Pago hoy; Stripe cuando haya cuenta).
// Las implementaciones van en este mismo directorio y se usan solo desde el servidor.

export interface DatosCheckout {
  pedidoId: string;
  codigo: string;
  descripcion: string;
  monto: number;
  moneda: Moneda;
  emailCliente?: string;
  /** Adónde vuelve el cliente después de pagar. */
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
  /** Estado del pago en la pasarela (approved, rejected…). */
  estado: string;
  moneda: string;
}

export interface ServicioPago {
  pasarela: Pasarela;
  crearCheckout(datos: DatosCheckout): Promise<CheckoutCreado>;
  /** Verifica la firma del webhook y devuelve el pago, o null si la notificación no es de un pago. */
  verificarWebhook(pedido: Request): Promise<PagoConfirmado | null>;
}
