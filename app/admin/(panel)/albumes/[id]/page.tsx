import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye, Printer } from 'lucide-react';
import { FormularioPrecios } from '@/components/admin/formulario-precios';
import { GeneradorCodigos } from '@/components/admin/generador-codigos';
import { Uploader } from '@/components/admin/uploader';
import { Button } from '@/components/ui/button';
import { sesionAdmin } from '@/lib/admin';
import { urlPreview } from '@/lib/config';
import type { Album, Cliente, Foto } from '@/lib/tipos';
import { formatearPesos } from '@/lib/utils';

export const metadata: Metadata = { title: 'Álbum' };

type FotoResumen = Pick<Foto, 'cliente_id' | 'ruta_preview' | 'posicion' | 'vendida'>;

export default async function PaginaAlbum({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase } = await sesionAdmin();
  const [{ data: album }, { data: clientes, error: e1 }, { data: fotos, error: e2 }] = await Promise.all([
    supabase.from('albumes').select('*').eq('id', id).maybeSingle<Album>(),
    supabase.from('clientes').select('id, codigo, orden, vistas').eq('album_id', id).order('orden').limit(2000)
      .returns<Pick<Cliente, 'id' | 'codigo' | 'orden' | 'vistas'>[]>(),
    supabase.from('fotos').select('cliente_id, ruta_preview, posicion, vendida').eq('album_id', id).order('posicion').limit(10000)
      .returns<FotoResumen[]>(),
  ]);
  if (!album) notFound();
  if (e1 || e2) throw new Error('No se pudieron cargar los clientes.');

  const fotosPorCliente = new Map<string, FotoResumen[]>();
  for (const f of fotos ?? []) fotosPorCliente.set(f.cliente_id, [...(fotosPorCliente.get(f.cliente_id) ?? []), f]);
  const lista = clientes ?? [];
  const conFotos = lista.filter((c) => fotosPorCliente.has(c.id));
  const libres = lista.length - conFotos.length;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Panel
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{album.titulo}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{album.prefijo_codigo}</span> · {formatearPesos(album.precio)} por foto
              {album.precio_pack ? ` · pack ${formatearPesos(album.precio_pack)}` : ''}
              {album.ubicacion ? ` · ${album.ubicacion}` : ''}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/admin/albumes/${album.id}/tarjetas`}>
              <Printer aria-hidden />
              Imprimir tarjetas ({libres} libres)
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Tarjetas</h2>
            <p className="text-sm text-muted-foreground">
              {lista.length} tarjetas: {conFotos.length} con fotos y {libres} libres para entregar.
            </p>
            <GeneradorCodigos albumId={album.id} />
          </div>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Precios</h2>
            <FormularioPrecios albumId={album.id} precio={album.precio} precioPack={album.precio_pack} />
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Subir fotos del día</h2>
          <Uploader albumId={album.id} tarjetas={lista.map(({ id, codigo, orden }) => ({ id, codigo, orden }))} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Clientes con fotos ({conFotos.length})</h2>
        {conFotos.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Todavía no hay fotos. Entregá las tarjetas, sacales una foto antes de cada cliente y subí todo junto.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {conFotos.map((c) => {
              const suyas = fotosPorCliente.get(c.id)!;
              const vendidas = suyas.filter((f) => f.vendida).length;
              return (
                <li key={c.id}>
                  <Link href={`/admin/albumes/${album.id}/clientes/${c.id}`} className="block overflow-hidden rounded-lg border bg-card hover:bg-accent">
                    <div className="relative grid aspect-[4/3] grid-cols-2 gap-px bg-muted">
                      {suyas.slice(0, 4).map((f) => (
                        <div key={f.posicion} className="relative">
                          <Image src={urlPreview(f.ruta_preview)} alt="" fill sizes="120px" className="object-cover" />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-0.5 p-2 text-xs">
                      <p className="font-mono font-medium">
                        #{c.orden} {c.codigo}
                      </p>
                      <p className="flex items-center justify-between text-muted-foreground">
                        <span>
                          {suyas.length} fotos{vendidas ? ` · ${vendidas} vendidas` : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="size-3" aria-hidden />
                          {c.vistas}
                        </span>
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
