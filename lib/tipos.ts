// Tipos de las tablas de supabase/migrations. Si cambiás el esquema, actualizá esto también.

export type Pasarela = 'mercadopago' | 'stripe';
export type EstadoPedido = 'pendiente' | 'completado' | 'fallido';
export type TipoPedido = 'fotos' | 'pack';
export type Moneda = 'ARS' | 'USD';

export interface Album {
  id: string;
  titulo: string;
  ubicacion: string | null;
  prefijo_codigo: string;
  /** Precio por foto (ARS). */
  precio: number;
  /** Precio del pack completo (ARS). null = sin pack. */
  precio_pack: number | null;
  creado_en: string;
}

/** Una tarjeta impresa = un cliente. */
export interface Cliente {
  id: string;
  album_id: string;
  codigo: string;
  /** Número de tarjeta dentro del álbum. */
  orden: number;
  vistas: number;
  creado_en: string;
}

export interface Foto {
  id: string;
  album_id: string;
  cliente_id: string;
  posicion: number;
  ruta_preview: string;
  ruta_alta: string;
  vendida: boolean;
  creado_en: string;
}

export interface Pedido {
  id: string;
  cliente_id: string;
  tipo: TipoPedido;
  pasarela: Pasarela;
  id_pago: string | null;
  estado: EstadoPedido;
  monto: number;
  moneda: Moneda;
  email_cliente: string | null;
  creado_en: string;
  completado_en: string | null;
}

/** Lo que devuelve cliente_por_codigo(): lo único que ve el público (nunca la ruta del original). */
export interface ClientePublico {
  id: string;
  codigo: string;
  orden: number;
  titulo_album: string;
  ubicacion: string | null;
  precio_foto: number;
  precio_pack: number | null;
  fotos: { id: string; ruta_preview: string; posicion: number; vendida: boolean }[];
}

/** resumen_albumes() */
export interface ResumenAlbum {
  id: string;
  titulo: string;
  ubicacion: string | null;
  prefijo_codigo: string;
  precio: number;
  precio_pack: number | null;
  creado_en: string;
  clientes: number;
  clientes_con_fotos: number;
  fotos: number;
  vendidas: number;
  vistas: number;
}

/** metricas_panel() */
export interface MetricasPanel {
  clientes: number;
  clientes_con_fotos: number;
  fotos: number;
  fotos_vendidas: number;
  vistas: number;
  pedidos_pendientes: number;
  ingresos: { pasarela: Pasarela; moneda: Moneda; total: number; ventas: number }[];
}
