// Prueba de punta a punta contra un sitio publicado (por defecto, producción).
// Uso:
//   SB_URL=… SB_KEY=<clave pública> SITIO=https://fotos-express.vercel.app \
//   EMAIL=<admin de prueba> CLAVE=<su contraseña> npm run e2e
// Necesita un usuario administrador. Crea un álbum "Prueba automática" y lo borra al final.
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import sharp from 'sharp';

const { SB_URL, SB_KEY, SITIO, EMAIL, CLAVE } = process.env;
const jar = new Map();
const sb = createServerClient(SB_URL, SB_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (l) => l.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
  },
});
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
let fallas = 0;
const paso = (n, ok, extra = '') => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fallas++; };
const t0 = () => performance.now();
const ms = (t) => `${Math.round(performance.now() - t)} ms`;

let albumId, archivos = [];
try {
  let t = t0();
  const r0 = await fetch(`${SITIO}/`);
  paso('home', r0.status === 200, `${r0.status} ${ms(t)}`);

  const { error: eLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: CLAVE });
  paso('login', !eLogin, eLogin?.message);

  const { data: album, error: eAlbum } = await sb.from('albumes')
    .insert({ titulo: 'Prueba automática', ubicacion: 'Sandbox', prefijo_codigo: 'PRUEBA', precio: 1000 }).select('id').single();
  paso('crear álbum', !eAlbum, eAlbum?.message);
  albumId = album?.id;

  const { data: codigos, error: eCod } = await sb.rpc('generar_codigos', { p_album_id: albumId, p_cantidad: 3 });
  paso('generar códigos', !eCod && codigos?.length === 3, eCod?.message ?? codigos?.map((c) => c.codigo).join(', '));
  const { id: fotoId, codigo } = codigos[0];

  // Foto de prueba: 4000x3000 con ruido (pesa como una real), orientación EXIF 6.
  const ruido = Buffer.alloc(400 * 300 * 3); for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 37 + (i >> 7)) % 256;
  const jpg = await sharp(ruido, { raw: { width: 400, height: 300, channels: 3 } }).resize(4000, 3000).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }).toBuffer();
  const rutaAlta = `${albumId}/${randomUUID()}.jpg`;
  t = t0();
  const { error: eSub } = await sb.storage.from('high-res-photos').upload(rutaAlta, jpg, { contentType: 'image/jpeg' });
  paso('subir original', !eSub, eSub?.message ?? `${(jpg.length / 1048576).toFixed(1)} MB ${ms(t)}`);
  archivos.push(['high-res-photos', rutaAlta]);

  t = t0();
  const rp = await fetch(`${SITIO}/api/admin/procesar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie() }, body: JSON.stringify({ fotoId, rutaAlta }),
  });
  const cp = await rp.json().catch(() => ({}));
  paso('procesar (marca de agua)', rp.status === 200 && cp.rutaPreview, `${rp.status} ${JSON.stringify(cp)} ${ms(t)}`);
  if (cp.rutaPreview) archivos.push(['previews', cp.rutaPreview]);

  if (cp.rutaPreview) {
    const rv = await fetch(`${SB_URL}/storage/v1/object/public/previews/${cp.rutaPreview}`);
    const buf = Buffer.from(await rv.arrayBuffer());
    const meta = await sharp(buf).metadata().catch(() => ({}));
    paso('preview pública', rv.status === 200 && meta.format === 'webp' && meta.height > meta.width && Math.max(meta.width, meta.height) === 1280 && !meta.exif,
      `${rv.status} ${meta.format} ${meta.width}x${meta.height} ${(buf.length / 1024).toFixed(0)} KB exif:${Boolean(meta.exif)}`);
  }

  const ro = await fetch(`${SB_URL}/storage/v1/object/public/high-res-photos/${rutaAlta}`);
  paso('original NO es público', ro.status >= 400, String(ro.status));

  t = t0();
  const rf = await fetch(`${SITIO}/f/${codigo.toLowerCase()}`);
  const html = await rf.text();
  paso('página del cliente /f/', rf.status === 200 && html.includes(codigo) && html.includes(cp.rutaPreview?.split('/')[1] ?? '??') && !html.includes(rutaAlta),
    `${rf.status} ${ms(t)} (redirige minúsculas: ${rf.redirected})`);

  const re = await fetch(`${SITIO}/api/fotos/${codigo}/estado`);
  paso('estado', re.status === 200 && (await re.json()).vendida === false, String(re.status));

  const rd = await fetch(`${SITIO}/api/fotos/${codigo}/descarga`, { redirect: 'manual' });
  paso('descarga bloqueada sin pagar', rd.status === 303 && rd.headers.get('location')?.includes(`/f/${codigo}`), `${rd.status} ${rd.headers.get('location')}`);

  const rn = await fetch(`${SITIO}/f/PRUEBA-ZZZZZZ`);
  paso('código inexistente → 404', rn.status === 404, String(rn.status));

  const rpa = await fetch(`${SITIO}/admin/dashboard`, { headers: { Cookie: cookie() } });
  const hpa = await rpa.text();
  paso('panel con sesión', rpa.status === 200 && hpa.includes('Prueba automática'), String(rpa.status));

  const rt = await fetch(`${SITIO}/admin/albumes/${albumId}/tarjetas?todas=1`, { headers: { Cookie: cookie() } });
  const ht = await rt.text();
  paso('tarjetas con QR', rt.status === 200 && (ht.match(/<svg/g) ?? []).length >= 3 && ht.includes(codigos[2].codigo), String(rt.status));

  const rsin = await fetch(`${SITIO}/api/admin/procesar`, { method: 'POST', body: '{}' });
  paso('procesar sin sesión → 401', rsin.status === 401, String(rsin.status));
} catch (e) {
  paso('excepción', false, e.stack);
} finally {
  for (const [bucket, ruta] of archivos) await sb.storage.from(bucket).remove([ruta]);
  if (albumId) {
    await sb.from('fotos').delete().eq('album_id', albumId);
    const { error } = await sb.from('albumes').delete().eq('id', albumId);
    paso('limpieza', !error, error?.message);
  }
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK');
}
