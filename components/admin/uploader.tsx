'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BUCKET_ORIGINALES } from '@/lib/config';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface CodigoLibre {
  id: string;
  codigo: string;
  orden: number;
}

type Estado = 'en-cola' | 'subiendo' | 'procesando' | 'listo' | 'error';

interface Item {
  clave: string;
  archivo: File;
  /** id de la foto (código) a la que va, o 'nuevo' para crear un código al subir. */
  destino: string;
  codigo?: string;
  estado: Estado;
  error?: string;
  /** Archivo rechazado antes de subir (tipo o tamaño): no se reintenta. */
  invalido?: boolean;
}

const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/tiff': 'tif' };
const TAMANO_MAXIMO = 50 * 1024 * 1024;
const SIMULTANEAS = 3;
const NUEVO = 'nuevo';

const ICONOS: Record<Estado, React.ReactNode> = {
  'en-cola': <Clock className="size-4 text-muted-foreground" aria-label="En cola" />,
  subiendo: <Loader2 className="size-4 animate-spin" aria-label="Subiendo" />,
  procesando: <Loader2 className="size-4 animate-spin text-amber-600" aria-label="Procesando" />,
  listo: <CheckCircle2 className="size-4 text-emerald-600" aria-label="Lista" />,
  error: <AlertCircle className="size-4 text-destructive" aria-label="Error" />,
};

function megas(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Carga masiva: el original va directo del navegador al bucket privado (sin pasar por Vercel, que limita
 * el tamaño de los pedidos) y después el servidor genera la preview con marca de agua (/api/admin/procesar).
 * Las fotos se ordenan por nombre de archivo y se asignan a las tarjetas libres en orden.
 */
export function Uploader({ albumId, libres }: { albumId: string; libres: CodigoLibre[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const codigoPorId = useMemo(() => new Map(libres.map((l) => [l.id, l])), [libres]);

  // Avisa antes de cerrar la pestaña con una carga en curso.
  useEffect(() => {
    if (!trabajando) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [trabajando]);

  function actualizar(clave: string, cambios: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.clave === clave ? { ...i, ...cambios } : i)));
  }

  function agregar(lista: FileList | null) {
    if (!lista?.length) return;
    const archivos = [...lista].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setItems((prev) => {
      const usados = new Set(prev.map((i) => i.destino));
      const disponibles = libres.filter((l) => !usados.has(l.id));
      let siguiente = 0;
      const nuevos = archivos.map((archivo): Item => {
        const base = { clave: crypto.randomUUID(), archivo };
        if (!TIPOS[archivo.type]) {
          return { ...base, destino: NUEVO, estado: 'error', invalido: true, error: 'Formato no admitido (JPG, PNG, WebP o TIFF).' };
        }
        if (archivo.size > TAMANO_MAXIMO) {
          return { ...base, destino: NUEVO, estado: 'error', invalido: true, error: `Pesa ${megas(archivo.size)}; el máximo es 50 MB.` };
        }
        const libre = disponibles[siguiente++];
        return { ...base, destino: libre?.id ?? NUEVO, codigo: libre?.codigo, estado: 'en-cola' };
      });
      return [...prev, ...nuevos];
    });
  }

  async function subir(item: Item) {
    const supabase = supabaseNavegador();
    let fotoId = item.destino;
    try {
      if (fotoId === NUEVO) {
        actualizar(item.clave, { estado: 'subiendo', error: undefined });
        const { data, error } = await supabase.rpc('generar_codigos', { p_album_id: albumId, p_cantidad: 1 });
        if (error || !data?.[0]) throw new Error('No se pudo crear el código.');
        fotoId = data[0].id;
        // Se guarda enseguida: si después falla, el reintento usa este mismo código.
        actualizar(item.clave, { destino: fotoId, codigo: data[0].codigo });
      } else {
        actualizar(item.clave, { estado: 'subiendo', error: undefined });
      }

      const ruta = `${albumId}/${crypto.randomUUID()}.${TIPOS[item.archivo.type]}`;
      const { error: errorSubida } = await supabase.storage
        .from(BUCKET_ORIGINALES)
        .upload(ruta, item.archivo, { contentType: item.archivo.type, upsert: false });
      if (errorSubida) throw new Error(`No se pudo subir: ${errorSubida.message}`);

      actualizar(item.clave, { estado: 'procesando' });
      const respuesta = await fetch('/api/admin/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fotoId, rutaAlta: ruta }),
      });
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
        throw new Error(cuerpo?.error ?? `Error ${respuesta.status} al procesar.`);
      }
      actualizar(item.clave, { estado: 'listo' });
    } catch (e) {
      actualizar(item.clave, { estado: 'error', error: e instanceof Error ? e.message : 'Error desconocido.' });
    }
  }

  async function empezar() {
    const pendientes = items.filter((i) => !i.invalido && (i.estado === 'en-cola' || i.estado === 'error'));
    if (!pendientes.length) return;
    setTrabajando(true);
    let indice = 0;
    const trabajador = async () => {
      while (indice < pendientes.length) await subir(pendientes[indice++]);
    };
    await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, pendientes.length) }, trabajador));
    setTrabajando(false);
    router.refresh();
  }

  const listas = items.filter((i) => i.estado === 'listo').length;
  const conError = items.filter((i) => i.estado === 'error').length;
  const porSubir = items.filter((i) => !i.invalido && (i.estado === 'en-cola' || i.estado === 'error')).length;
  const usados = new Set(items.map((i) => i.destino));

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (!trabajando) agregar(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          arrastrando ? 'border-primary bg-accent' : 'border-border',
        )}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm">Arrastrá las fotos acá</p>
        <Button type="button" variant="outline" size="sm" disabled={trabajando} onClick={() => entrada.current?.click()}>
          Elegir archivos
        </Button>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={Object.keys(TIPOS).join(',')}
          className="sr-only"
          onChange={(e) => {
            agregar(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="text-xs text-muted-foreground">
          Se ordenan por nombre y van a las tarjetas libres en orden ({libres.length} libres). Si sobran fotos, se crean
          códigos nuevos.
        </p>
      </div>

      {items.length > 0 && (
        <>
          <ul className="max-h-96 divide-y overflow-y-auto rounded-xl border text-sm">
            {items.map((item) => (
              <li key={item.clave} className="flex items-center gap-3 p-2.5">
                {ICONOS[item.estado]}
                <div className="min-w-0 flex-1">
                  <p className="truncate">{item.archivo.name}</p>
                  <p className={cn('truncate text-xs', item.error ? 'text-destructive' : 'text-muted-foreground')}>
                    {item.error ?? megas(item.archivo.size)}
                  </p>
                </div>
                {item.invalido ? null : item.estado === 'en-cola' && !trabajando ? (
                  <select
                    aria-label={`Código para ${item.archivo.name}`}
                    value={item.destino}
                    onChange={(e) => {
                      const destino = e.target.value;
                      actualizar(item.clave, { destino, codigo: codigoPorId.get(destino)?.codigo });
                    }}
                    className="h-8 max-w-40 rounded-md border bg-background px-2 font-mono text-xs"
                  >
                    <option value={NUEVO}>Código nuevo</option>
                    {libres
                      .filter((l) => l.id === item.destino || !usados.has(l.id))
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          #{l.orden} {l.codigo}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span className="font-mono text-xs">{item.codigo ?? '—'}</span>
                )}
                {!trabajando && item.estado !== 'listo' && (
                  <button
                    type="button"
                    aria-label={`Quitar ${item.archivo.name}`}
                    onClick={() => setItems((prev) => prev.filter((i) => i.clave !== item.clave))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={empezar} disabled={trabajando || porSubir === 0}>
              {trabajando ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {trabajando ? 'Subiendo…' : conError && !items.some((i) => i.estado === 'en-cola') ? 'Reintentar' : `Subir ${porSubir}`}
            </Button>
            {!trabajando && (
              <Button type="button" variant="ghost" onClick={() => setItems([])}>
                Limpiar lista
              </Button>
            )}
            <p className="text-xs text-muted-foreground" role="status">
              {listas} listas{conError ? ` · ${conError} con error` : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
