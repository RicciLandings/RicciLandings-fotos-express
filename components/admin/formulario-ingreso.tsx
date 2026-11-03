'use client';

import { useActionState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { ingresar } from '@/app/admin/acciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState(ingresar, null);

  return (
    <form action={accion} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="clave" className="text-sm font-medium">
          Contraseña
        </label>
        <Input id="clave" name="clave" type="password" autoComplete="current-password" required className="h-11" />
      </div>
      {estado?.error && (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
        Ingresar
      </Button>
    </form>
  );
}
