import type { Metadata, Viewport } from 'next';
import { NOMBRE_SITIO, SITIO_URL } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITIO_URL),
  title: { default: `${NOMBRE_SITIO}: tu foto al toque`, template: `%s · ${NOMBRE_SITIO}` },
  description: 'Ingresá el código de tu tarjeta, mirá tu foto y descargala en alta resolución.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfcfc' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      {/* Fuente del sistema: cero descargas extra en 3G/4G. */}
      <body className="font-sans">{children}</body>
    </html>
  );
}
