'use client';

import { useActionState, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { borrarAlbum } from '@/app/admin/acciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Zona de peligro: borrar el álbum entero. Pide escribir el prefijo para confirmar. */
export function BorrarAlbum({
  albumId,
  prefijo,
  tarjetas,
  fotos,
  vendidas,
}: {
  albumId: string;
  prefijo: string;
  tarjetas: number;
  fotos: number;
  vendidas: number;
}) {
  const [estado, accion, enviando] = useActionState(borrarAlbum, null);
  const [confirmacion, setConfirmacion] = useState('');
  const confirmado = confirmacion.trim().toUpperCase() === prefijo;

  if (vendidas > 0) {
    return (
      <p className="rounded-xl border border-destructive/40 p-4 text-sm text-muted-foreground">
        Este álbum tiene {vendidas} {vendidas === 1 ? 'foto vendida' : 'fotos vendidas'}: no se puede borrar, porque los
        compradores tienen que poder seguir descargándolas.
      </p>
    );
  }

  return (
    <form action={accion} className="space-y-3 rounded-xl border border-destructive/40 p-4">
      <input type="hidden" name="albumId" value={albumId} />
      <p className="text-sm">
        Se borran {tarjetas} {tarjetas === 1 ? 'tarjeta' : 'tarjetas'} y {fotos} {fotos === 1 ? 'foto' : 'fotos'}, con sus
        archivos. Las tarjetas impresas dejan de funcionar. <strong>No se puede deshacer.</strong>
      </p>
      <div className="space-y-1.5">
        <label htmlFor="confirmar-borrado" className="text-sm font-medium">
          Para confirmar, escribí <span className="font-mono">{prefijo}</span>
        </label>
        <Input
          id="confirmar-borrado"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          className="h-10 max-w-60 font-mono uppercase"
        />
      </div>
      {estado?.error && (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      )}
      <Button type="submit" variant="destructive" disabled={!confirmado || enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
        Borrar álbum
      </Button>
    </form>
  );
}
