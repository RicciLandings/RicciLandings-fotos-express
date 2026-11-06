'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, Package, Wallet, X } from 'lucide-react';
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
  const [abierta, setAbierta] = useState<number | null>(null);

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

  const alternar = (id: string) => {
    setPack(false);
    setSeleccion((prev) => {
      const nueva = new Set(prev);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  };

  const mover = useCallback((paso: number) => setAbierta((i) => (i === null ? i : (i + paso + fotos.length) % fotos.length)), [fotos.length]);
  useEffect(() => {
    if (abierta === null) return;
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(null);
      if (e.key === 'ArrowRight') mover(1);
      if (e.key === 'ArrowLeft') mover(-1);
    };
    window.addEventListener('keydown', teclas);
    return () => window.removeEventListener('keydown', teclas);
  }, [abierta, mover]);

  const fotoAbierta = abierta === null ? null : fotos[abierta];
  const elegida = (id: string) => pack || seleccion.has(id);

  return (
    <>
      {esperandoPago && sinVender > 0 && <EsperandoPago codigo={codigo} vendidasIniciales={vendidas} />}

      <p className="text-sm text-muted-foreground">
        {sinVender > 0 ? 'Tocá una foto para verla grande y marcá las que querés.' : '¡Listo! Todas tus fotos son tuyas.'}
      </p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fotos.map((f, i) => (
          <li key={f.id} className="space-y-1.5">
            <div className={cn('relative aspect-[3/4] overflow-hidden rounded-lg bg-muted', elegida(f.id) && 'ring-3 ring-primary')}>
              <button type="button" className="absolute inset-0" onClick={() => setAbierta(i)} aria-label={`Ver foto ${f.posicion}`}>
                <Preview ruta={f.ruta_preview} alt={`Foto ${f.posicion}`} sizes="(max-width: 640px) 50vw, 220px" priority={i < 2} />
              </button>
              {f.vendida ? (
                <span className="absolute top-1.5 left-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">TUYA</span>
              ) : (
                <button
                  type="button"
                  onClick={() => alternar(f.id)}
                  aria-pressed={elegida(f.id)}
                  aria-label={elegida(f.id) ? `Quitar foto ${f.posicion}` : `Elegir foto ${f.posicion}`}
                  className={cn(
                    'absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full border-2 border-white shadow',
                    elegida(f.id) ? 'bg-primary text-primary-foreground' : 'bg-black/30',
                  )}
                >
                  {elegida(f.id) && <Check className="size-4" aria-hidden />}
                </button>
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
              {/* Los pagos se conectan en el próximo paso (services/payments). */}
              <Button size="lg" disabled title="Pagos muy pronto">
                <Wallet aria-hidden />
                {cotizacion.cantidad > 0 ? 'Pagar (pronto)' : 'Elegí tus fotos'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {fotoAbierta && abierta !== null && (
        <div role="dialog" aria-modal="true" aria-label={`Foto ${fotoAbierta.posicion}`} className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm">
              {abierta + 1} de {fotos.length}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setAbierta(null)} aria-label="Cerrar" className="text-white hover:bg-white/10">
              <X />
            </Button>
          </div>
          <div className="relative flex-1">
            <Preview ruta={fotoAbierta.ruta_preview} alt={`Foto ${fotoAbierta.posicion}`} sizes="100vw" />
            {fotos.length > 1 && (
              <>
                <button type="button" onClick={() => mover(-1)} aria-label="Anterior" className="absolute inset-y-0 left-0 flex w-1/4 items-center pl-2 text-white">
                  <ChevronLeft className="size-8 drop-shadow" />
                </button>
                <button type="button" onClick={() => mover(1)} aria-label="Siguiente" className="absolute inset-y-0 right-0 flex w-1/4 items-center justify-end pr-2 text-white">
                  <ChevronRight className="size-8 drop-shadow" />
                </button>
              </>
            )}
          </div>
          <div className="p-3">
            {fotoAbierta.vendida ? (
              <Button asChild size="lg" className="w-full">
                <a href={`/api/fotos/${codigo}/${fotoAbierta.id}/descarga`} rel="nofollow">
                  <Download aria-hidden />
                  Descargar en alta resolución
                </a>
              </Button>
            ) : (
              <Button size="lg" variant={elegida(fotoAbierta.id) ? 'secondary' : 'default'} className="w-full" onClick={() => alternar(fotoAbierta.id)}>
                <Check aria-hidden />
                {elegida(fotoAbierta.id) ? 'Elegida' : `Elegir esta foto · ${formatearPesos(cliente.precio_foto)}`}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
