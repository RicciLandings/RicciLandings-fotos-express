import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye, ImageOff, Printer } from 'lucide-react';
import { GeneradorCodigos } from '@/components/admin/generador-codigos';
import { Uploader } from '@/components/admin/uploader';
import { Button } from '@/components/ui/button';
import { sesionAdmin } from '@/lib/admin';
import { urlPreview } from '@/lib/config';
import type { Album, Foto } from '@/lib/tipos';
import { formatearPesos } from '@/lib/utils';

export const metadata: Metadata = { title: 'Álbum' };

const LIMITE = 1000;

export default async function PaginaAlbum({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase } = await sesionAdmin();
  const [{ data: album }, { data: fotos, error }] = await Promise.all([
    supabase.from('albumes').select('*').eq('id', id).maybeSingle<Album>(),
    supabase
      .from('fotos')
      .select('id, codigo, orden, ruta_preview, vendida, vistas, precio')
      .eq('album_id', id)
      .order('orden')
      .limit(LIMITE)
      .returns<Pick<Foto, 'id' | 'codigo' | 'orden' | 'ruta_preview' | 'vendida' | 'vistas' | 'precio'>[]>(),
  ]);
  if (!album) notFound();
  if (error) throw new Error('No se pudieron cargar las fotos.');

  const lista = fotos ?? [];
  const libres = lista.filter((f) => !f.ruta_preview && !f.vendida).map(({ id, codigo, orden }) => ({ id, codigo, orden }));
  const subidas = lista.length - libres.length;

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
              {album.ubicacion ? ` · ${album.ubicacion}` : ''}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/admin/albumes/${album.id}/tarjetas`}>
              <Printer aria-hidden />
              Imprimir tarjetas
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Códigos</h2>
          <p className="text-sm text-muted-foreground">
            {lista.length} códigos: {subidas} con foto y {libres.length} libres (tarjetas para entregar).
          </p>
          <GeneradorCodigos albumId={album.id} />
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Subir fotos</h2>
          <Uploader albumId={album.id} libres={libres} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Fotos</h2>
        {lista.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Generá códigos o subí fotos para empezar.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {lista.map((f) => (
              <li key={f.id} className="overflow-hidden rounded-lg border bg-card">
                <div className="relative aspect-square bg-muted">
                  {f.ruta_preview ? (
                    <Image src={urlPreview(f.ruta_preview)} alt={f.codigo} fill sizes="200px" className="object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageOff className="size-6" aria-label="Sin foto" />
                    </div>
                  )}
                  {f.vendida && (
                    <span className="absolute top-1.5 left-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      VENDIDA
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 p-2 text-xs">
                  <p className="font-mono font-medium">{f.codigo}</p>
                  <p className="flex items-center justify-between text-muted-foreground">
                    <span>#{f.orden}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="size-3" aria-hidden />
                      {f.vistas}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {lista.length === LIMITE && <p className="text-xs text-muted-foreground">Se muestran las primeras {LIMITE}.</p>}
      </section>
    </div>
  );
}
