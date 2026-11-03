'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowRight, Loader2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { codigoValido, normalizarCodigo } from '@/lib/codigos';

// El escáner (cámara) se baja solo si el cliente lo abre.
const EscanerQR = dynamic(() => import('@/components/escaner-qr').then((m) => m.EscanerQR), { ssr: false });

export function FormularioCodigo() {
  const router = useRouter();
  const [valor, setValor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [navegando, startTransition] = useTransition();

  function ir(codigo: string) {
    startTransition(() => router.push(`/f/${codigo}`));
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const codigo = normalizarCodigo(valor);
    if (!codigoValido(codigo)) {
      setError('Revisá el código: tiene que ser como TIGRE-4892.');
      return;
    }
    setError(null);
    setValor(codigo);
    ir(codigo);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={enviar} noValidate className="space-y-3">
        <label htmlFor="codigo" className="sr-only">
          Código de tu foto
        </label>
        <Input
          id="codigo"
          name="codigo"
          value={valor}
          onChange={(e) => {
            setValor(e.target.value.toUpperCase());
            if (error) setError(null);
          }}
          placeholder="TIGRE-4892"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={24}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'codigo-error' : undefined}
          className="h-14 text-center font-mono text-2xl tracking-widest uppercase md:text-2xl"
        />
        {error && (
          <p id="codigo-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={navegando || !valor.trim()}>
          {navegando ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowRight aria-hidden />}
          Ver mi foto
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setEscaneando(true)}>
        <QrCode aria-hidden />
        Escanear QR
      </Button>

      {escaneando && (
        <EscanerQR
          alDetectar={(codigo) => {
            setEscaneando(false);
            setValor(codigo);
            ir(codigo);
          }}
          alCerrar={() => setEscaneando(false)}
        />
      )}
    </div>
  );
}
