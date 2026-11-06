import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Eye } from 'lucide-react';
import { Uploader } from '@/components/admin/uploader';
import { Button } from '@/components/ui/button';
import { sesionAdmin } from '@/lib/admin';
import { urlPreview } from '@/lib/config';
import type { Cliente, Foto } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Cliente' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function PaginaClienteAdmin({ params }: { params: Promise<{ id: string; clienteId: string }> }) {
  const { id, clienteId } = await params;
  if (!UUID.test(id) || !UUID.test(clienteId)) notFound();

  const { supabase } = await sesionAdmin();
  const [{ data: cliente }, { data: fotos }, { data: album }] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', clienteId).eq('album_id', id).maybeSingle<Cliente>(),
    supabase.from('fotos').select('id, ruta_preview, posicion, vendida').eq('cliente_id', clienteId).order('posicion')
      .returns<Pick<Foto, 'id' | 'ruta_preview' | 'posicion' | 'vendida'>[]>(),
    supabase.from('albumes').select('titulo').eq('id', id).maybeSingle<{ titulo: string }>(),
  ]);
  if (!cliente) notFound();
  const lista = fotos ?? [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href={`/admin/albumes/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          {album?.titulo ?? 'Álbum'}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-bold">
              #{cliente.orden} {cliente.codigo}
            </h1>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {lista.length} fotos · {lista.filter((f) => f.vendida).length} vendidas · <Eye className="size-3.5" aria-hidden /> {cliente.vistas}
            </p>
          </div>
          <Button asChild variant="outline">
            <a href={`/f/${cliente.codigo}`} target="_blank" rel="noopener">
              <ExternalLink aria-hidden />
              Ver como el cliente
            </a>
          </Button>
        </div>
      </div>

      {lista.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {lista.map((f) => (
            <li key={f.id} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
              <Image src={urlPreview(f.ruta_preview)} alt={`Foto ${f.posicion}`} fill sizes="160px" className="object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{f.posicion}</span>
              {f.vendida && (
                <span className="absolute top-1 left-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">VENDIDA</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Agregar fotos a esta tarjeta</h2>
        <p className="text-sm text-muted-foreground">Para cuando faltó la foto de la tarjeta: todo lo que subas acá va a este cliente.</p>
        <Uploader albumId={id} tarjetas={[{ id: cliente.id, codigo: cliente.codigo, orden: cliente.orden }]} clienteFijo={{ id: cliente.id, codigo: cliente.codigo, orden: cliente.orden }} />
      </section>
    </div>
  );
}
