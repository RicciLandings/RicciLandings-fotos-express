'use client';

import { useActionState } from 'react';
import { FolderPlus, Loader2 } from 'lucide-react';
import { crearAlbum } from '@/app/admin/acciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function Campo({ id, etiqueta, ayuda, ...props }: { id: string; etiqueta: string; ayuda?: string } & React.ComponentProps<'input'>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <Input id={id} name={id} className="h-10" {...props} />
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function FormularioAlbum() {
  const [estado, accion, enviando] = useActionState(crearAlbum, null);

  return (
    <form action={accion} className="space-y-3 rounded-xl border bg-card p-4">
      <Campo id="titulo" etiqueta="Título" placeholder="Día 1 - Puerto de Frutos" required maxLength={120} />
      <Campo id="ubicacion" etiqueta="Lugar (opcional)" placeholder="Tigre" maxLength={120} />
      <Campo
        id="prefijo"
        etiqueta="Prefijo de los códigos"
        placeholder="TIGRE"
        required
        maxLength={12}
        autoCapitalize="characters"
        className="h-10 font-mono uppercase"
        ayuda="Queda así: TIGRE-7KX9QM"
      />
      <Campo id="precio" etiqueta="Precio por foto (ARS)" type="number" inputMode="numeric" min={1} step="any" placeholder="5000" required />
      {estado?.error && (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <FolderPlus aria-hidden />}
        Crear álbum
      </Button>
    </form>
  );
}
