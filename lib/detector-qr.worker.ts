// Web Worker: lee el QR de cada foto y arma una miniatura, sin trabar la pantalla del panel.
import { LADO_ANALISIS, leerCodigoTarjeta } from '@/lib/detector-qr';

export interface PedidoAnalisis {
  clave: string;
  archivo: File;
}

export interface ResultadoAnalisis {
  clave: string;
  codigoQR: string | null;
  miniatura: Blob | null;
  error?: boolean;
}

const LADO_MINIATURA = 240;
const responder = (r: ResultadoAnalisis) => (self as unknown as { postMessage: (m: ResultadoAnalisis) => void }).postMessage(r);

async function decodificar(archivo: File): Promise<ImageBitmap> {
  // Decodificar ya reducida ahorra memoria con fotos de 24 MP. Si el navegador no soporta resize, se decodifica entera.
  // Con solo resizeWidth el alto se ajusta solo (mantiene la proporción).
  try {
    return await createImageBitmap(archivo, { resizeWidth: LADO_ANALISIS, resizeQuality: 'medium' });
  } catch {
    return createImageBitmap(archivo);
  }
}

self.onmessage = async (evento: MessageEvent<PedidoAnalisis>) => {
  const { clave, archivo } = evento.data;
  try {
    const imagen = await decodificar(archivo);
    const lienzo = new OffscreenCanvas(imagen.width, imagen.height);
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Sin canvas');
    ctx.drawImage(imagen, 0, 0);
    const { data } = ctx.getImageData(0, 0, imagen.width, imagen.height);
    const codigoQR = leerCodigoTarjeta(data, imagen.width, imagen.height);

    const escala = LADO_MINIATURA / Math.max(imagen.width, imagen.height);
    const mini = new OffscreenCanvas(Math.round(imagen.width * escala), Math.round(imagen.height * escala));
    mini.getContext('2d')?.drawImage(imagen, 0, 0, mini.width, mini.height);
    const miniatura = await mini.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    imagen.close();

    responder({ clave, codigoQR, miniatura });
  } catch {
    responder({ clave, codigoQR: null, miniatura: null, error: true });
  }
};
