'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <TriangleAlert className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">Algo salió mal</h1>
      <p className="text-sm text-muted-foreground">
        Puede ser la conexión. Probá de nuevo en unos segundos.
        {error.digest && <span className="mt-2 block font-mono text-xs">Ref: {error.digest}</span>}
      </p>
      <Button size="lg" className="w-full" onClick={reset}>
        <RotateCcw aria-hidden />
        Reintentar
      </Button>
      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Volver al inicio
      </Link>
    </main>
  );
}
