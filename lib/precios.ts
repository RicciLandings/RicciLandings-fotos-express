// Cálculo del total que ve el cliente. Es solo para mostrar: el monto que se cobra lo va a
// calcular la base al crear el pedido (cuando se conecten los pagos).

export interface Cotizacion {
  tipo: 'fotos' | 'pack';
  cantidad: number;
  monto: number;
  /** true cuando lo elegido cuesta igual o más que el pack: conviene sugerirlo. */
  convienePack: boolean;
}

export function packDisponible(precioPack: number | null, fotosSinVender: number, fotosVendidas: number): boolean {
  // El pack se ofrece solo si hay más de una foto y todavía no compró ninguna suelta.
  return precioPack != null && precioPack > 0 && fotosSinVender > 1 && fotosVendidas === 0;
}

export function cotizar(opciones: {
  precioFoto: number;
  precioPack: number | null;
  fotosSinVender: number;
  fotosVendidas: number;
  seleccionadas: number;
  pack: boolean;
}): Cotizacion {
  const { precioFoto, precioPack, fotosSinVender, fotosVendidas, seleccionadas, pack } = opciones;
  const hayPack = packDisponible(precioPack, fotosSinVender, fotosVendidas);
  if (pack && hayPack) {
    return { tipo: 'pack', cantidad: fotosSinVender, monto: Number(precioPack), convienePack: false };
  }
  const monto = seleccionadas * Number(precioFoto);
  return {
    tipo: 'fotos',
    cantidad: seleccionadas,
    monto,
    convienePack: hayPack && seleccionadas > 0 && monto >= Number(precioPack),
  };
}
