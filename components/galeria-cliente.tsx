'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Check, Download, Loader2, Package, Wallet } from 'lucide-react';
import { EsperandoPago } from '@/components/esperando-pago';
import { Button } from '@/components/ui/button';
import { urlPreview } from '@/lib/config';
import { cotizar, packDisponible } from '@/lib/precios';
import type { ClientePublico } from '@/lib/tipos';
import { cn, formatearPesos } from '@/lib/utils';

/** Imagen con marca de agua y una capa encima que evita "guardar imagen" con clic derecho o toque largo. */
function Preview({ ruta, alt, sizes, priority }: { ruta: string; alt: string; sizes: string; priority?: boolean }) {
  return (
    <>
      <Image
        src={urlPreview(ruta)}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        draggable={false}
        className="pointer-events-none object-contain select-none [-webkit-touch-callout:none]"
      />
      <span className="absolute inset-0" aria-hidden />
    </>
  );
}

export function GaleriaCliente({ cliente, esperandoPago }: { cliente: ClientePublico; esperandoPago: boolean }) {
  const { fotos, codigo } = cliente;
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [pack, setPack] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  const vendidas = fotos.filter((f) => f.vendida).length;
  const sinVender = fotos.length - vendidas;
  const hayPack = packDisponible(cliente.precio_pack, sinVender, vendidas);
  const cotizacion = cotizar({
    precioFoto: cliente.precio_foto,
    precioPack: cliente.precio_pack,
    fotosSinVender: sinVender,
    fotosVendidas: vendidas,
    seleccionadas: seleccion.size,
    pack,
  });

  async function pagar() {
    setPagando(true);
    setErrorPago(null);
    try {
      const r = await fetch('/api/pagos/mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, tipo: cotizacion.tipo, fotoIds: cotizacion.tipo === 'fotos' ? [...seleccion] : [] }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !cuerpo.url) throw new Error(cuerpo.error ?? 'No se pudo iniciar el pago.');
      window.location.assign(cuerpo.url);
    } catch (e) {
      setErrorPago(e instanceof Error ? e.message : 'No se pudo iniciar el pago.');
      setPagando(false);
    }
  }

  const alternar = (id: string) => {
    setPack(false);
    setSeleccion((prev) => {
      const nueva = new Set(prev);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  };

  const elegida = (id: string) => pack || seleccion.has(id);

  return (
    <>
      {esperandoPago && sinVender > 0 && <EsperandoPago codigo={codigo} vendidasIniciales={vendidas} />}

      <p className="text-sm text-muted-foreground">
        {sinVender > 0 ? 'Tocá las fotos que querés para elegirlas.' : '¡Listo! Todas tus fotos son tuyas.'}
      </p>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fotos.map((f, i) => (
          <li key={f.id} className="space-y-1.5">
            <div className={cn('relative aspect-[3/4] overflow-hidden rounded-lg bg-muted', elegida(f.id) && 'ring-3 ring-primary')}>
              <Preview ruta={f.ruta_preview} alt={`Foto ${f.posicion}`} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px" priority={i < 2} />
              {!f.vendida && (
                // Toda la foto es un botón para elegirla (no se puede ampliar).
                <button
                  type="button"
                  className="absolute inset-0"
                  onClick={() => alternar(f.id)}
                  aria-pressed={elegida(f.id)}
                  aria-label={elegida(f.id) ? `Quitar foto ${f.posicion}` : `Elegir foto ${f.posicion}`}
                />
              )}
              {f.vendida ? (
                <span className="absolute top-1.5 left-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">TUYA</span>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute top-2 right-2 flex size-9 items-center justify-center rounded-full border-2 border-white shadow',
                    elegida(f.id) ? 'bg-primary text-primary-foreground' : 'bg-black/30',
                  )}
                >
                  {elegida(f.id) && <Check className="size-5" />}
                </span>
              )}
            </div>
            {f.vendida && (
              <Button asChild size="sm" variant="outline" className="w-full">
                <a href={`/api/fotos/${codigo}/${f.id}/descarga`} rel="nofollow">
                  <Download aria-hidden />
                  Descargar
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>

      {sinVender > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-2xl space-y-2 px-4 py-3">
            {hayPack && (
              <button
                type="button"
                onClick={() => {
                  setPack((p) => !p);
                  setSeleccion(new Set());
                }}
                aria-pressed={pack}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left text-sm',
                  pack ? 'border-primary bg-primary/5' : cotizacion.convienePack && 'border-amber-500',
                )}
              >
                <Package className="size-5 shrink-0" aria-hidden />
                <span className="flex-1">
                  <span className="font-medium">Pack completo · {sinVender} fotos</span>
                  {cotizacion.convienePack && !pack && <span className="block text-xs text-amber-700 dark:text-amber-400">Te conviene: pagás menos y te llevás todas</span>}
                </span>
                <span className="font-semibold tabular-nums">{formatearPesos(Number(cliente.precio_pack))}</span>
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 text-sm">
                {cotizacion.cantidad > 0 ? (
                  <>
                    <span className="block font-semibold tabular-nums">{formatearPesos(cotizacion.monto)}</span>
                    <span className="text-xs text-muted-foreground">
                      {cotizacion.tipo === 'pack' ? 'Pack completo' : `${cotizacion.cantidad} ${cotizacion.cantidad === 1 ? 'foto' : 'fotos'}`}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {formatearPesos(cliente.precio_foto)} por foto
                  </span>
                )}
              </div>
              <Button size="lg" onClick={pagar} disabled={cotizacion.cantidad === 0 || pagando}>
                {pagando ? <Loader2 className="animate-spin" aria-hidden /> : <Wallet aria-hidden />}
                {cotizacion.cantidad > 0 ? 'Pagar con Mercado Pago' : 'Elegí tus fotos'}
              </Button>
            </div>
            {errorPago && (
              <p role="alert" className="text-sm text-destructive">
                {errorPago}
              </p>
            )}
          </div>
        </div>
      )}

    </>
  );
}
