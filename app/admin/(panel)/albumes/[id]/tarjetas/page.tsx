import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { ArrowLeft } from 'lucide-react';
import { BotonImprimir } from '@/components/admin/boton-imprimir';
import { sesionAdmin } from '@/lib/admin';
import { NOMBRE_SITIO, SITIO_URL } from '@/lib/config';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Tarjetas' };

const LIMITE = 500;

/** Tarjetas de 85 × 54 mm (tamaño tarjeta de crédito), 10 por hoja A4. */
export default async function Tarjetas({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ todas?: string }>;
}) {
  const [{ id }, { todas }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const verTodas = todas === '1';

  const { supabase } = await sesionAdmin();
  const { data: album } = await supabase.from('albumes').select('id, titulo').eq('id', id).maybeSingle();
  if (!album) notFound();

  // Libres = tarjetas que todavía no tienen fotos (para entregar).
  const { data: clientes } = await supabase
    .from('clientes')
    .select('codigo, orden, fotos(count)')
    .eq('album_id', id)
    .order('orden')
    .limit(LIMITE)
    .returns<{ codigo: string; orden: number; fotos: { count: number }[] }[]>();
  const fotos = (clientes ?? []).filter((c) => verTodas || !(c.fotos[0]?.count > 0));

  const dominio = new URL(SITIO_URL).host;
  const tarjetas = await Promise.all(
    fotos.map(async (f) => ({
      ...f,
      qr: await QRCode.toString(`${SITIO_URL}/f/${f.codigo}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }),
    })),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3 print:hidden">
        <Link href={`/admin/albumes/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          {album.titulo}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Tarjetas ({tarjetas.length})</h1>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/admin/albumes/${id}/tarjetas`}
              className={cn('rounded-md px-3 py-1.5', !verTodas ? 'bg-secondary font-medium' : 'text-muted-foreground')}
            >
              Libres
            </Link>
            <Link
              href={`/admin/albumes/${id}/tarjetas?todas=1`}
              className={cn('rounded-md px-3 py-1.5', verTodas ? 'bg-secondary font-medium' : 'text-muted-foreground')}
            >
              Todas
            </Link>
            <BotonImprimir />
          </div>
        </div>
        {tarjetas.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay tarjetas libres. Generá más desde la página del álbum.
          </p>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,85mm)] justify-center gap-[4mm] print:grid-cols-[repeat(2,85mm)]">
        {tarjetas.map((t) => (
          <article
            key={t.codigo}
            className="flex h-[54mm] w-[85mm] break-inside-avoid items-center gap-[4mm] rounded-[3mm] border border-neutral-300 bg-white p-[4mm] text-black"
          >
            <div className="size-[40mm] shrink-0" dangerouslySetInnerHTML={{ __html: t.qr }} />
            <div className="flex h-full min-w-0 flex-col justify-between">
              <p className="flex items-baseline justify-between text-[9pt] font-semibold">
                {NOMBRE_SITIO}
                <span className="text-[11pt] font-bold">#{t.orden}</span>
              </p>
              <div>
                <p className="text-[7pt] text-neutral-600">Tus fotos con el código</p>
                <p className="font-mono text-[12pt] leading-tight font-bold break-all">{t.codigo}</p>
              </div>
              <p className="text-[6.5pt] leading-snug text-neutral-700">
                Escaneá el QR o entrá a <span className="font-semibold">{dominio}</span> y escribí el código.
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
