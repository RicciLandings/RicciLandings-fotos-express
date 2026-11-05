import type { MetadataRoute } from 'next';
import { SITIO_URL } from '@/lib/config';

// Solo la home es pública para buscadores: las fotos y el panel son privados.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/f/', '/foto/', '/api/'] },
    host: SITIO_URL,
  };
}
