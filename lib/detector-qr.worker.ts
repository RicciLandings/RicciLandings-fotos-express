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
  // Se decodifica entera para saber el tamaño y se achica solo si es grande: agrandar una
  // captura chica deja el QR borroso.
  const completa = await createImageBitmap(archivo);
  const lado = Math.max(completa.width, completa.height);
  if (lado <= LADO_ANALISIS) return completa;
  try {
    const escala = LADO_ANALISIS / lado;
    const reducida = await createImageBitmap(completa, {
      resizeWidth: Math.round(completa.width * escala),
      resizeHeight: Math.round(completa.height * escala),
      resizeQuality: 'medium',
    });
    completa.close();
    return reducida;
  } catch {
    return completa;
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
