'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, QrCode, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { agruparPorTarjeta, ordenarPorNombre, type Grupo, type Tarjeta } from '@/lib/agrupar';
import { BUCKET_ORIGINALES } from '@/lib/config';
import type { PedidoAnalisis, ResultadoAnalisis } from '@/lib/detector-qr.worker';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Fase = 'elegir' | 'analizando' | 'revisar' | 'subiendo' | 'listo';
type EstadoFoto = 'pendiente' | 'subiendo' | 'procesando' | 'lista' | 'error';

interface InfoFoto {
  nombre: string;
  miniatura?: string;
  estado: EstadoFoto;
  error?: string;
}

const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/tiff': 'tif' };
const TAMANO_MAXIMO = 50 * 1024 * 1024;
const CLIENTES_EN_PARALELO = 3;
const ANALIZADORES = 2;

/**
 * Subida de fotos. Modo "día": se suben todas las fotos de la jornada; el navegador lee los QR de las fotos
 * de tarjeta (Web Worker) y reparte el resto entre los clientes. Modo cliente fijo (`clienteFijo`): todas
 * las fotos van a ese cliente. El original va directo al bucket privado (sin pasar por Vercel) y el servidor
 * genera la preview con marca de agua (/api/admin/procesar).
 */
export function Uploader({ albumId, tarjetas, clienteFijo }: { albumId: string; tarjetas: Tarjeta[]; clienteFijo?: Tarjeta }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>('elegir');
  const [orden, setOrden] = useState<'nombre' | 'fecha'>('nombre');
  const [info, setInfo] = useState<Record<string, InfoFoto>>({});
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });
  const [rechazados, setRechazados] = useState<string[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const archivos = useRef(new Map<string, File>());
  const entrada = useRef<HTMLInputElement>(null);

  const tarjetaPorId = useMemo(() => new Map(tarjetas.map((t) => [t.id, t])), [tarjetas]);
  const actualizar = (clave: string, cambios: Partial<InfoFoto>) =>
    setInfo((prev) => ({ ...prev, [clave]: { ...prev[clave], ...cambios } }));

  // Libera las miniaturas al salir.
  const infoRef = useRef(info);
  infoRef.current = info;
  useEffect(() => () => Object.values(infoRef.current).forEach((i) => i.miniatura && URL.revokeObjectURL(i.miniatura)), []);

  // Avisa antes de cerrar la pestaña con una subida en curso.
  useEffect(() => {
    if (fase !== 'subiendo' && fase !== 'analizando') return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [fase]);

  function reiniciar() {
    Object.values(info).forEach((i) => i.miniatura && URL.revokeObjectURL(i.miniatura));
    archivos.current.clear();
    setInfo({});
    setGrupos([]);
    setDescartados(new Set());
    setRechazados([]);
    setFase('elegir');
  }

  async function elegir(lista: FileList | null) {
    if (!lista?.length) return;
    const validos: File[] = [];
    const malos: string[] = [];
    for (const archivo of lista) {
      if (!TIPOS[archivo.type]) malos.push(`${archivo.name}: formato no admitido`);
      else if (archivo.size > TAMANO_MAXIMO) malos.push(`${archivo.name}: pesa más de 50 MB`);
      else validos.push(archivo);
    }
    setRechazados(malos);
    if (!validos.length) return;

    const ordenados = orden === 'fecha' ? [...validos].sort((a, b) => a.lastModified - b.lastModified) : ordenarPorNombre(validos);
    const claves = ordenados.map((archivo) => {
      const clave = crypto.randomUUID();
      archivos.current.set(clave, archivo);
      return clave;
    });
    setInfo(Object.fromEntries(claves.map((c) => [c, { nombre: archivos.current.get(c)!.name, estado: 'pendiente' as const }])));

    if (clienteFijo) {
      setGrupos([{ id: clienteFijo.id, clienteId: clienteFijo.id, fotos: claves, tarjetas: [] }]);
      setFase('revisar');
      return;
    }

    setFase('analizando');
    setProgreso({ hechos: 0, total: claves.length });
    const codigos = await analizar(claves);
    setGrupos(agruparPorTarjeta(claves.map((clave) => ({ clave, codigoQR: codigos.get(clave) ?? null })), tarjetas));
    setFase('revisar');
  }

  /** Lee los QR con un par de Web Workers en paralelo. */
  function analizar(claves: string[]): Promise<Map<string, string | null>> {
    return new Promise((resolver) => {
      const resultados = new Map<string, string | null>();
      const pendientes = [...claves];
      const workers = Array.from(
        { length: Math.min(ANALIZADORES, claves.length) },
        () => new Worker(new URL('../../lib/detector-qr.worker.ts', import.meta.url)),
      );
      const siguiente = (w: Worker) => {
        const clave = pendientes.shift();
        if (clave) w.postMessage({ clave, archivo: archivos.current.get(clave)! } satisfies PedidoAnalisis);
      };
      for (const w of workers) {
        w.onmessage = (e: MessageEvent<ResultadoAnalisis>) => {
          const { clave, codigoQR, miniatura } = e.data;
          resultados.set(clave, codigoQR);
          if (miniatura) actualizar(clave, { miniatura: URL.createObjectURL(miniatura) });
          setProgreso((p) => ({ ...p, hechos: p.hechos + 1 }));
          if (resultados.size === claves.length) {
            workers.forEach((x) => x.terminate());
            resolver(resultados);
          } else siguiente(w);
        };
        siguiente(w);
      }
    });
  }

  async function subirFoto(clave: string, clienteId: string) {
    const archivo = archivos.current.get(clave)!;
    const supabase = supabaseNavegador();
    actualizar(clave, { estado: 'subiendo', error: undefined });
    try {
      const ruta = `${albumId}/${crypto.randomUUID()}.${TIPOS[archivo.type]}`;
      const { error } = await supabase.storage.from(BUCKET_ORIGINALES).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
      if (error) throw new Error(`No se pudo subir: ${error.message}`);
      actualizar(clave, { estado: 'procesando' });
      const r = await fetch('/api/admin/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, rutaAlta: ruta }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Error ${r.status}`);
      actualizar(clave, { estado: 'lista' });
    } catch (e) {
      actualizar(clave, { estado: 'error', error: e instanceof Error ? e.message : 'Error desconocido.' });
    }
  }

  async function subir(soloErrores = false) {
    const trabajos = grupos
      .filter((g) => g.clienteId && !descartados.has(g.id))
      .map((g) => ({ clienteId: g.clienteId!, fotos: g.fotos.filter((c) => !soloErrores || info[c]?.estado === 'error') }))
      .filter((t) => t.fotos.length);
    if (!trabajos.length) return;
    setFase('subiendo');
    // Clientes en paralelo; dentro de cada cliente, en orden (así quedan numeradas como se sacaron).
    let indice = 0;
    const trabajador = async () => {
      while (indice < trabajos.length) {
        const { clienteId, fotos } = trabajos[indice++];
        for (const clave of fotos) await subirFoto(clave, clienteId);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CLIENTES_EN_PARALELO, trabajos.length) }, trabajador));
    setFase('listo');
    router.refresh();
  }

  const asignar = (grupoId: string, clienteId: string) =>
    setGrupos((prev) => prev.map((g) => (g.id === grupoId ? { ...g, clienteId: clienteId || null } : g)));
  const quitarFoto = (grupoId: string, clave: string) =>
    setGrupos((prev) => prev.map((g) => (g.id === grupoId ? { ...g, fotos: g.fotos.filter((c) => c !== clave) } : g)));
  const alternarDescarte = (grupoId: string) =>
    setDescartados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(grupoId)) nuevo.delete(grupoId);
      else nuevo.add(grupoId);
      return nuevo;
    });

  const activos = grupos.filter((g) => !descartados.has(g.id));
  const aSubir = activos.filter((g) => g.clienteId).reduce((n, g) => n + g.fotos.length, 0);
  const sinAsignar = activos.filter((g) => !g.clienteId).reduce((n, g) => n + g.fotos.length, 0);
  const estados = Object.values(info);
  const listas = estados.filter((i) => i.estado === 'lista').length;
  const conError = estados.filter((i) => i.estado === 'error').length;
  const bloqueado = fase === 'analizando' || fase === 'subiendo';

  // ─── Paso 1: elegir ─────────────────────────────────────────────────────────
  if (fase === 'elegir') {
    return (
      <div className="space-y-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            elegir(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
            arrastrando ? 'border-primary bg-accent' : 'border-border',
          )}
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm">{clienteFijo ? `Arrastrá las fotos de la tarjeta #${clienteFijo.orden}` : 'Arrastrá todas las fotos del día'}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => entrada.current?.click()}>
              Elegir archivos
            </Button>
            <select
              aria-label="Orden de las fotos"
              value={orden}
              onChange={(e) => setOrden(e.target.value as 'nombre' | 'fecha')}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="nombre">Ordenar por nombre</option>
              <option value="fecha">Ordenar por fecha</option>
            </select>
          </div>
          <input
            ref={entrada}
            type="file"
            multiple
            accept={Object.keys(TIPOS).join(',')}
            className="sr-only"
            onChange={(e) => {
              elegir(e.target.files);
              e.target.value = '';
            }}
          />
          {!clienteFijo && (
            <p className="max-w-md text-xs text-muted-foreground">
              Antes de cada cliente, sacale una foto a su tarjeta con el QR bien visible. El sistema lee las tarjetas y reparte las
              fotos solo. Las fotos de las tarjetas no se suben.
            </p>
          )}
        </div>
        {rechazados.length > 0 && (
          <p className="text-xs text-destructive">No se agregaron: {rechazados.join(' · ')}</p>
        )}
      </div>
    );
  }

  // ─── Paso 2: analizando ─────────────────────────────────────────────────────
  if (fase === 'analizando') {
    const pct = progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 0;
    return (
      <div className="space-y-2 rounded-xl border p-6 text-center" role="status">
        <QrCode className="mx-auto size-6 animate-pulse text-muted-foreground" aria-hidden />
        <p className="text-sm">
          Buscando tarjetas… {progreso.hechos} de {progreso.total}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  // ─── Paso 3: revisar, subir y resultado ────────────────────────────────────
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {grupos.map((g) => {
          const tarjeta = g.clienteId ? tarjetaPorId.get(g.clienteId) : undefined;
          const descartado = descartados.has(g.id);
          return (
            <li key={g.id} className={cn('rounded-xl border p-3', !g.clienteId && !descartado && 'border-amber-500/60', descartado && 'opacity-50')}>
              <div className="flex flex-wrap items-center gap-2">
                {g.tarjetas.length > 0 && g.clienteId && <QrCode className="size-4 text-emerald-600" aria-label="Tarjeta leída" />}
                {clienteFijo ? (
                  <span className="font-mono text-sm font-medium">
                    #{clienteFijo.orden} {clienteFijo.codigo}
                  </span>
                ) : (
                  <select
                    aria-label="Cliente de este grupo"
                    value={g.clienteId ?? ''}
                    disabled={fase !== 'revisar' || descartado}
                    onChange={(e) => asignar(g.id, e.target.value)}
                    className="h-8 max-w-56 rounded-md border bg-background px-2 font-mono text-xs"
                  >
                    <option value="">Sin tarjeta: elegí cliente…</option>
                    {tarjetas.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.orden} {t.codigo}
                      </option>
                    ))}
                  </select>
                )}
                <span className="text-xs text-muted-foreground">
                  {g.fotos.length} {g.fotos.length === 1 ? 'foto' : 'fotos'}
                  {g.codigoAjeno ? ` · QR de otro álbum (${g.codigoAjeno})` : ''}
                  {!g.clienteId && !g.codigoAjeno && !clienteFijo ? ' · antes de la primera tarjeta' : ''}
                </span>
                {fase === 'revisar' && !clienteFijo && (
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => alternarDescarte(g.id)}>
                    {descartado ? <RotateCcw aria-hidden /> : <Trash2 aria-hidden />}
                    {descartado ? 'Recuperar' : 'Descartar'}
                  </Button>
                )}
              </div>
              {tarjeta === undefined && g.clienteId && <p className="text-xs text-destructive">Cliente desconocido.</p>}
              {g.fotos.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {g.fotos.map((clave) => {
                    const i = info[clave];
                    return (
                      <li key={clave} className="relative size-16 overflow-hidden rounded-md bg-muted" title={i?.error ?? i?.nombre}>
                        {i?.miniatura ? (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura local (blob:), no pasa por next/image
                          <img src={i.miniatura} alt={i.nombre} className="size-full object-cover" />
                        ) : (
                          <span className="block truncate p-1 text-[9px] leading-tight text-muted-foreground">{i?.nombre}</span>
                        )}
                        <span className="absolute right-0.5 bottom-0.5">
                          {i?.estado === 'subiendo' || i?.estado === 'procesando' ? (
                            <Loader2 className="size-4 animate-spin rounded-full bg-background/80 p-0.5" aria-label="Subiendo" />
                          ) : i?.estado === 'lista' ? (
                            <CheckCircle2 className="size-4 rounded-full bg-background text-emerald-600" aria-label="Lista" />
                          ) : i?.estado === 'error' ? (
                            <AlertCircle className="size-4 rounded-full bg-background text-destructive" aria-label={i.error} />
                          ) : null}
                        </span>
                        {fase === 'revisar' && (
                          <button
                            type="button"
                            aria-label={`Quitar ${i?.nombre}`}
                            onClick={() => quitarFoto(g.id, clave)}
                            className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        {fase === 'revisar' && (
          <Button type="button" onClick={() => subir()} disabled={aSubir === 0}>
            <Upload aria-hidden />
            Subir {aSubir} {aSubir === 1 ? 'foto' : 'fotos'}
          </Button>
        )}
        {fase === 'subiendo' && (
          <Button type="button" disabled>
            <Loader2 className="animate-spin" aria-hidden />
            Subiendo… {listas} de {aSubir}
          </Button>
        )}
        {fase === 'listo' && conError > 0 && (
          <Button type="button" onClick={() => subir(true)}>
            <RotateCcw aria-hidden />
            Reintentar {conError}
          </Button>
        )}
        {!bloqueado && (
          <Button type="button" variant="ghost" onClick={reiniciar}>
            {fase === 'listo' ? 'Subir más fotos' : 'Cancelar'}
          </Button>
        )}
        <p className="text-xs text-muted-foreground" role="status">
          {fase === 'listo'
            ? `${listas} subidas${conError ? ` · ${conError} con error` : ''}`
            : sinAsignar > 0
              ? `${sinAsignar} sin cliente: asignalas o no se suben`
              : ''}
        </p>
      </div>
    </div>
  );
}
