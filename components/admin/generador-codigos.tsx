'use client';

import { useActionState } from 'react';
import { Loader2, QrCode } from 'lucide-react';
import { generarCodigos } from '@/app/admin/acciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Pregenera tarjetas (una por cliente) para entregar mientras se sacan las fotos. */
export function GeneradorCodigos({ albumId }: { albumId: string }) {
  const [estado, accion, enviando] = useActionState(generarCodigos, null);

  return (
    <form action={accion} className="space-y-3 rounded-xl border bg-card p-4">
      <input type="hidden" name="albumId" value={albumId} />
      <div className="space-y-1.5">
        <label htmlFor="cantidad" className="text-sm font-medium">
          Tarjetas nuevas (una por cliente)
        </label>
        <Input id="cantidad" name="cantidad" type="number" inputMode="numeric" min={1} max={500} defaultValue={50} required className="h-10" />
      </div>
      {estado?.error && (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      )}
      {estado?.ok && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {estado.ok}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <QrCode aria-hidden />}
        Generar tarjetas
      </Button>
    </form>
  );
}
