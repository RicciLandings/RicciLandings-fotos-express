import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Eye, Images, ShoppingBag, Users, Wallet } from 'lucide-react';
import { FormularioAlbum } from '@/components/admin/formulario-album';
import { sesionAdmin } from '@/lib/admin';
import type { MetricasPanel, Moneda, Pasarela, ResumenAlbum } from '@/lib/tipos';
import { formatearMonto, formatearNumero, formatearPesos } from '@/lib/utils';

export const metadata: Metadata = { title: 'Panel' };

const PASARELAS: { pasarela: Pasarela; moneda: Moneda; nombre: string }[] = [
  { pasarela: 'mercadopago', moneda: 'ARS', nombre: 'Mercado Pago' },
  { pasarela: 'stripe', moneda: 'USD', nombre: 'Stripe' },
];

function Dato({ icono, titulo, valor, detalle }: { icono: React.ReactNode; titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icono}
        {titulo}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

export default async function Panel() {
  const { supabase } = await sesionAdmin();
  const [respuestaMetricas, respuestaAlbumes] = await Promise.all([
    supabase.rpc('metricas_panel'),
    supabase.rpc('resumen_albumes'),
  ]);
  const metricas = respuestaMetricas.data as MetricasPanel | null;
  const albumes = respuestaAlbumes.data as ResumenAlbum[] | null;
  if (respuestaMetricas.error || !metricas) throw new Error('No se pudieron cargar las métricas.');

  const ingreso = (p: Pasarela, m: Moneda) =>
    metricas.ingresos.find((i) => i.pasarela === p && i.moneda === m) ?? { total: 0, ventas: 0 };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">Resumen</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Dato
            icono={<Eye className="size-4" aria-hidden />}
            titulo="Vistas"
            valor={formatearNumero(metricas.vistas)}
          />
          <Dato
            icono={<Users className="size-4" aria-hidden />}
            titulo="Clientes con fotos"
            valor={formatearNumero(metricas.clientes_con_fotos)}
            detalle={`de ${formatearNumero(metricas.clientes)} tarjetas`}
          />
          <Dato
            icono={<ShoppingBag className="size-4" aria-hidden />}
            titulo="Fotos vendidas"
            valor={formatearNumero(metricas.fotos_vendidas)}
            detalle={`de ${formatearNumero(metricas.fotos)} subidas`}
          />
          {PASARELAS.map(({ pasarela, moneda, nombre }) => {
            const { total, ventas } = ingreso(pasarela, moneda);
            return (
              <Dato
                key={pasarela}
                icono={<Wallet className="size-4" aria-hidden />}
                titulo={`${nombre} (${moneda})`}
                valor={formatearMonto(total, moneda)}
                detalle={`${formatearNumero(ventas)} ${ventas === 1 ? 'venta' : 'ventas'}`}
              />
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Álbumes</h2>
          {!albumes?.length ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Todavía no hay álbumes. Creá el primero para generar tarjetas y subir fotos.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {albumes.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/albumes/${a.id}`} className="flex items-center gap-3 p-4 hover:bg-accent">
                    <Images className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.prefijo_codigo} · {formatearPesos(a.precio)}/foto
                        {a.precio_pack ? ` · pack ${formatearPesos(a.precio_pack)}` : ''}
                        {a.ubicacion ? ` · ${a.ubicacion}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground tabular-nums">
                      <p>
                        {a.clientes_con_fotos}/{a.clientes} clientes · {a.fotos} fotos
                      </p>
                      <p>
                        {a.vendidas} vendidas · {a.vistas} vistas
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Nuevo álbum</h2>
          <FormularioAlbum />
        </div>
      </section>
    </div>
  );
}
