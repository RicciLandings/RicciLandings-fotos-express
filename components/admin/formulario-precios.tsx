'use client';

import { useActionState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { actualizarPrecios } from '@/app/admin/acciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Precio por foto y del pack de un álbum. */
export function FormularioPrecios({ albumId, precio, precioPack }: { albumId: string; precio: number; precioPack: number | null }) {
  const [estado, accion, enviando] = useActionState(actualizarPrecios, null);

  return (
    <form action={accion} className="space-y-3 rounded-xl border bg-card p-4">
      <input type="hidden" name="albumId" value={albumId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="precio" className="text-sm font-medium">
            Por foto
          </label>
          <Input id="precio" name="precio" type="number" inputMode="numeric" min={1} step="any" defaultValue={precio} required className="h-10" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="precioPack" className="text-sm font-medium">
            Pack completo
          </label>
          <Input
            id="precioPack"
            name="precioPack"
            type="number"
            inputMode="numeric"
            min={1}
            step="any"
            defaultValue={precioPack ?? ''}
            placeholder="Sin pack"
            className="h-10"
          />
        </div>
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
      <Button type="submit" variant="outline" className="w-full" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        Guardar precios
      </Button>
    </form>
  );
}
