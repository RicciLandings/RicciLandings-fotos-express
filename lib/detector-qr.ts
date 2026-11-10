import jsQR from 'jsqr';
import { codigoDesdeQR } from '@/lib/codigos';

/** Lado mayor máximo para buscar el QR: las fotos más grandes se achican (nunca se agrandan). */
export const LADO_ANALISIS = 1600;
/** Margen blanco que se agrega en el reintento (capturas con el QR pegado al borde). */
const MARGEN = 40;

function leer(rgba: Uint8ClampedArray, ancho: number, alto: number, inversion: 'dontInvert' | 'attemptBoth'): string | null {
  const qr = jsQR(rgba, ancho, alto, { inversionAttempts: inversion });
  return qr ? codigoDesdeQR(qr.data) : null;
}

/** Copia la imagen RGBA dentro de un lienzo blanco más grande. */
export function conMargen(rgba: Uint8ClampedArray, ancho: number, alto: number, margen = MARGEN) {
  const anchoN = ancho + margen * 2;
  const altoN = alto + margen * 2;
  const salida = new Uint8ClampedArray(anchoN * altoN * 4).fill(255);
  for (let y = 0; y < alto; y++) {
    salida.set(rgba.subarray(y * ancho * 4, (y + 1) * ancho * 4), ((y + margen) * anchoN + margen) * 4);
  }
  return { rgba: salida, ancho: anchoN, alto: altoN };
}

/**
 * Busca un QR de tarjeta en una imagen RGBA. Devuelve el código normalizado o null.
 * Primero la lectura rápida; si falla, reintenta con margen blanco y probando colores invertidos.
 */
export function leerCodigoTarjeta(rgba: Uint8ClampedArray, ancho: number, alto: number): string | null {
  const rapido = leer(rgba, ancho, alto, 'dontInvert');
  if (rapido) return rapido;
  const m = conMargen(rgba, ancho, alto);
  return leer(m.rgba, m.ancho, m.alto, 'attemptBoth');
}
