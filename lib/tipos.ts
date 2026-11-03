// Tipos de las tablas de supabase/migrations. Si cambiás el esquema, actualizá esto también.

export type Pasarela = 'mercadopago' | 'stripe';
export type EstadoPedido = 'pendiente' | 'completado' | 'fallido';
export type Moneda = 'ARS' | 'USD';

export interface Album {
  id: string;
  titulo: string;
  ubicacion: string | null;
  prefijo_codigo: string;
  creado_en: string;
}

export interface Foto {
  id: string;
  album_id: string;
  codigo: string;
  /** null mientras el código está pregenerado y la foto todavía no se subió. */
  ruta_preview: string | null;
  ruta_alta: string | null;
  precio: number;
  vendida: boolean;
  vistas: number;
  creado_en: string;
}

export interface Pedido {
  id: string;
  foto_id: string;
  pasarela: Pasarela;
  id_pago: string | null;
  estado: EstadoPedido;
  monto: number;
  moneda: Moneda;
  email_cliente: string | null;
  creado_en: string;
  completado_en: string | null;
}

/** Lo que devuelve foto_por_codigo(): lo único que ve el público (nunca la ruta del original). */
export interface FotoPublica {
  id: string;
  codigo: string;
  ruta_preview: string | null;
  precio: number;
  vendida: boolean;
  titulo_album: string;
  ubicacion: string | null;
}
