import type { NextConfig } from 'next';

/** Host del proyecto de Supabase, para servir las previews con next/image. */
function hostSupabase(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname || '*.supabase.co';
  } catch {
    return '*.supabase.co';
  }
}

const config: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: hostSupabase(), pathname: '/storage/v1/object/public/previews/**' }],
  },
  async redirects() {
    // /foto/CODIGO también funciona (por si se imprime así en alguna tarjeta).
    return [{ source: '/foto/:codigo', destination: '/f/:codigo', permanent: true }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // La cámara solo la usa el escáner de QR del propio sitio.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
