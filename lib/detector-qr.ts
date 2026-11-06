import jsQR from 'jsqr';
import { codigoDesdeQR } from '@/lib/codigos';

/** Lado mayor al que se reduce cada foto para buscar el QR: alcanza con la tarjeta bien encuadrada. */
export const LADO_ANALISIS = 1600;

/** Busca un QR de tarjeta en una imagen RGBA. Devuelve el código normalizado o null. */
export function leerCodigoTarjeta(rgba: Uint8ClampedArray, ancho: number, alto: number): string | null {
  const qr = jsQR(rgba, ancho, alto, { inversionAttempts: 'dontInvert' });
  return qr ? codigoDesdeQR(qr.data) : null;
}
