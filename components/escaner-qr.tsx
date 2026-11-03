'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { codigoDesdeQR } from '@/lib/codigos';

// BarcodeDetector todavía no está en los tipos de TypeScript.
interface Detector {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type ConstructorDetector = new (opciones: { formats: string[] }) => Detector;

type Estado = 'iniciando' | 'escaneando' | 'sin-soporte' | 'sin-permiso' | 'invalido';

const MENSAJES: Record<Exclude<Estado, 'escaneando'>, string> = {
  iniciando: 'Abriendo la cámara…',
  'sin-soporte':
    'Este navegador no puede leer QR. Abrí la cámara del celular y apuntá a la tarjeta: te trae directo a tu foto.',
  'sin-permiso': 'No tenemos permiso para usar la cámara. Habilitalo en el navegador o escribí el código.',
  invalido: 'Ese QR no es de una foto nuestra. Probá de nuevo o escribí el código.',
};

/** Lector de QR con la API nativa del navegador (sin librerías). */
export function EscanerQR({ alDetectar, alCerrar }: { alDetectar: (codigo: string) => void; alCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<Estado>('iniciando');
  const alDetectarRef = useRef(alDetectar);
  alDetectarRef.current = alDetectar;

  useEffect(() => {
    const Barcode = (window as unknown as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
    if (!Barcode || !navigator.mediaDevices?.getUserMedia) {
      setEstado('sin-soporte');
      return;
    }

    let flujo: MediaStream | null = null;
    let temporizador: number | undefined;
    let activo = true;
    const detector = new Barcode({ formats: ['qr_code'] });

    async function revisar() {
      if (!activo || !video.current || video.current.readyState < 2) return;
      try {
        const [resultado] = await detector.detect(video.current);
        if (!resultado || !activo) return;
        const codigo = codigoDesdeQR(resultado.rawValue);
        if (codigo) {
          activo = false;
          alDetectarRef.current(codigo);
        } else {
          setEstado('invalido');
        }
      } catch {
        // Cuadro ilegible: se reintenta en el próximo ciclo.
      }
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (stream) => {
        if (!activo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        flujo = stream;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
        setEstado('escaneando');
        temporizador = window.setInterval(revisar, 300);
      })
      .catch(() => setEstado('sin-permiso'));

    return () => {
      activo = false;
      window.clearInterval(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Escanear QR" className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm font-medium">Apuntá al QR de tu tarjeta</span>
        <Button variant="ghost" size="icon" onClick={alCerrar} aria-label="Cerrar" className="text-white hover:bg-white/10">
          <X />
        </Button>
      </div>
      <div className="relative flex-1">
        <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />
        <div className="pointer-events-none absolute inset-0 m-auto size-60 rounded-2xl border-4 border-white/80" />
      </div>
      {estado !== 'escaneando' && (
        <p role="status" className="bg-black p-4 text-center text-sm text-white">
          {MENSAJES[estado]}
        </p>
      )}
    </div>
  );
}
