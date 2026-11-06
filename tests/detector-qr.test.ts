import QRCode from 'qrcode';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LADO_ANALISIS, leerCodigoTarjeta } from '@/lib/detector-qr';

/** Foto de 4000x3000 con ruido y, opcionalmente, una tarjeta con QR de `ladoQR` px pegada en el medio. */
async function foto(contenidoQR?: string, ladoQR = 700) {
  const ruido = Buffer.alloc(200 * 150 * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 53 + (i >> 5)) % 256;
  let img = sharp(ruido, { raw: { width: 200, height: 150, channels: 3 } }).resize(4000, 3000);
  if (contenidoQR) {
    const qr = await QRCode.toBuffer(contenidoQR, { margin: 2, width: ladoQR });
    img = sharp(await img.png().toBuffer()).composite([{ input: qr, left: 1500, top: 1100 }]);
  }
  // Como en el navegador: se reduce a LADO_ANALISIS y se lee en RGBA.
  const { data, info } = await sharp(await img.jpeg({ quality: 85 }).toBuffer())
    .resize({ width: LADO_ANALISIS, height: LADO_ANALISIS, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8ClampedArray(data), ancho: info.width, alto: info.height };
}

describe('leerCodigoTarjeta', () => {
  it('encuentra la tarjeta en una foto grande (URL del sitio)', async () => {
    const { rgba, ancho, alto } = await foto('https://fotos-express.vercel.app/f/TIGRE-7KX9QM');
    expect(leerCodigoTarjeta(rgba, ancho, alto)).toBe('TIGRE-7KX9QM');
  });

  it('también con la tarjeta chica en el cuadro', async () => {
    const { rgba, ancho, alto } = await foto('https://fotos-express.vercel.app/f/TIGRE-7KX9QM', 450);
    expect(leerCodigoTarjeta(rgba, ancho, alto)).toBe('TIGRE-7KX9QM');
  });

  it('foto sin tarjeta: null', async () => {
    const { rgba, ancho, alto } = await foto();
    expect(leerCodigoTarjeta(rgba, ancho, alto)).toBeNull();
  });

  it('QR que no es de una tarjeta: null', async () => {
    const { rgba, ancho, alto } = await foto('https://otro-sitio.com/promo');
    expect(leerCodigoTarjeta(rgba, ancho, alto)).toBeNull();
  });
});
