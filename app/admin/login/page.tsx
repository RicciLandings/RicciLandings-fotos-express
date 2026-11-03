import type { Metadata } from 'next';
import { Camera } from 'lucide-react';
import { FormularioIngreso } from '@/components/admin/formulario-ingreso';
import { NOMBRE_SITIO } from '@/lib/config';

export const metadata: Metadata = { title: 'Ingresar' };

export default function Ingreso() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Camera className="size-5" aria-hidden />
          {NOMBRE_SITIO}
        </p>
        <h1 className="text-2xl font-bold">Panel del fotógrafo</h1>
      </div>
      <FormularioIngreso />
    </main>
  );
}
