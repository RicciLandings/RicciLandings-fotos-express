'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const CADA_MS = 3000;
const INTENTOS = 60; // 3 minutos

/**
 * Se muestra al volver de la pasarela (?pago=pendiente). Consulta el estado hasta que el webhook
 * acredita el pago (aumentan las fotos vendidas) y entonces recarga la galería con las descargas.
 */
export function EsperandoPago({ codigo, vendidasIniciales, paymentId }: { codigo: string; vendidasIniciales: number; paymentId?: string }) {
  const router = useRouter();
  const [agotado, setAgotado] = useState(false);

  useEffect(() => {
    let intentos = 0;
    let activo = true;
    // Respaldo del webhook: con el payment_id de la vuelta, el servidor consulta el pago real en MP y lo acredita.
    if (paymentId) {
      fetch('/api/pagos/mercadopago/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      }).catch(() => undefined);
    }
    const temporizador = window.setInterval(async () => {
      intentos++;
      try {
        const r = await fetch(`/api/fotos/${codigo}/estado`, { cache: 'no-store' });
        const { vendidas } = (await r.json()) as { vendidas?: string[] };
        if (activo && (vendidas?.length ?? 0) > vendidasIniciales) {
          window.clearInterval(temporizador);
          router.replace(`/f/${codigo}`);
          router.refresh();
          return;
        }
      } catch {
        // Sin señal: se reintenta en el próximo ciclo.
      }
      if (intentos >= INTENTOS) {
        window.clearInterval(temporizador);
        setAgotado(true);
      }
    }, CADA_MS);
    return () => {
      activo = false;
      window.clearInterval(temporizador);
    };
  }, [codigo, vendidasIniciales, paymentId, router]);

  return (
    <div role="status" className="flex items-center gap-3 rounded-lg bg-secondary p-4 text-sm">
      {agotado ? (
        <p>El pago está tardando más de lo normal. Si ya pagaste, volvé a entrar en unos minutos con tu código.</p>
      ) : (
        <>
          <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
          <p>Estamos confirmando tu pago. No cierres esta página.</p>
        </>
      )}
    </div>
  );
}
