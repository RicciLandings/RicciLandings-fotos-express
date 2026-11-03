import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, LogOut } from 'lucide-react';
import { salir } from '@/app/admin/acciones';
import { Button } from '@/components/ui/button';
import { sesionAdmin } from '@/lib/admin';
import { NOMBRE_SITIO } from '@/lib/config';

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const { usuario, esAdmin } = await sesionAdmin();
  if (!usuario) redirect('/admin/login');

  const botonSalir = (
    <form action={salir}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut aria-hidden />
        Salir
      </Button>
    </form>
  );

  if (!esAdmin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold">Sin permiso</h1>
        <p className="text-sm text-muted-foreground">
          {usuario.email} no es administrador. Pedile al dueño que te dé de alta.
        </p>
        {botonSalir}
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/admin/dashboard" className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="size-5" aria-hidden />
            {NOMBRE_SITIO}
          </Link>
          {botonSalir}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
