import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">No encontramos ese código</h1>
      <p className="text-sm text-muted-foreground">
        Revisá que esté escrito tal cual figura en tu tarjeta, o escaneá el QR.
      </p>
      <Button asChild size="lg" className="w-full">
        <Link href="/">Probar otro código</Link>
      </Button>
    </main>
  );
}
