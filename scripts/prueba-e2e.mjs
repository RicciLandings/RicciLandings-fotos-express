// Prueba de punta a punta contra un sitio publicado (por defecto, producción).
// Uso:
//   SB_URL=… SB_KEY=<clave pública> SITIO=https://fotos-express.vercel.app \
//   EMAIL=<admin de prueba> CLAVE=<su contraseña> npm run e2e
// Necesita un usuario administrador. Crea un álbum "Prueba automática" y lo borra al final.
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
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
const paso = (n, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!ok) fallas++;
};
const t0 = () => performance.now();
const ms = (t) => `${Math.round(performance.now() - t)} ms`;

/** Foto de 4000x3000 con ruido; con `qr`, además una tarjeta con ese QR pegada en el medio. */
async function foto(semilla, qr) {
  const ruido = Buffer.alloc(400 * 300 * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * semilla + (i >> 7)) % 256;
  let img = sharp(ruido, { raw: { width: 400, height: 300, channels: 3 } }).resize(4000, 3000);
  if (qr) img = sharp(await img.png().toBuffer()).composite([{ input: await QRCode.toBuffer(qr, { margin: 2, width: 600 }), left: 1700, top: 1200 }]);
  return img.jpeg({ quality: 88 }).withMetadata({ orientation: 6 }).toBuffer();
}

/** Lo mismo que hace el navegador: reducir a 1600 px y buscar el QR. */
async function leerQR(jpg) {
  const { data, info } = await sharp(jpg).resize({ width: 1600, height: 1600, fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

let albumId;
const archivos = [];
try {
  let t = t0();
  const r0 = await fetch(`${SITIO}/`);
  paso('home', r0.status === 200, `${r0.status} ${ms(t)}`);

  const { error: eLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: CLAVE });
  paso('login', !eLogin, eLogin?.message);

  const { data: album, error: eAlbum } = await sb
    .from('albumes')
    .insert({ titulo: 'Prueba automática', ubicacion: 'Sandbox', prefijo_codigo: 'PRUEBA', precio: 5000, precio_pack: 12000 })
    .select('id')
    .single();
  paso('crear álbum con pack', !eAlbum, eAlbum?.message);
  albumId = album?.id;

  const { data: tarjetas, error: eCod } = await sb.rpc('generar_codigos', { p_album_id: albumId, p_cantidad: 3 });
  paso('generar tarjetas', !eCod && tarjetas?.length === 3, eCod?.message ?? tarjetas?.map((c) => `#${c.orden} ${c.codigo}`).join(', '));
  const cliente = tarjetas[0];

  // Foto de la tarjeta: el QR lleva la URL del sitio, como las tarjetas impresas.
  const fotoTarjeta = await foto(41, `${SITIO}/f/${cliente.codigo}`);
  const leido = await leerQR(fotoTarjeta);
  paso('leer la tarjeta en una foto de 12 MP', leido?.endsWith(`/f/${cliente.codigo}`), String(leido));
  paso('foto sin tarjeta: sin QR', (await leerQR(await foto(43))) === null);

  for (const semilla of [37, 53, 71]) {
    const jpg = await foto(semilla);
    const rutaAlta = `${albumId}/${randomUUID()}.jpg`;
    t = t0();
    const { error: eSub } = await sb.storage.from('high-res-photos').upload(rutaAlta, jpg, { contentType: 'image/jpeg' });
    archivos.push(['high-res-photos', rutaAlta]);
    const rp = await fetch(`${SITIO}/api/admin/procesar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie() },
      body: JSON.stringify({ clienteId: cliente.id, rutaAlta }),
    });
    const cp = await rp.json().catch(() => ({}));
    if (cp.rutaPreview) archivos.push(['previews', cp.rutaPreview]);
    paso(`subir y procesar foto ${cp.posicion ?? '?'}`, !eSub && rp.status === 200, `${rp.status} ${eSub?.message ?? ''} ${ms(t)}`);
  }

  const vista = archivos.find(([b]) => b === 'previews');
  if (vista) {
    const rv = await fetch(`${SB_URL}/storage/v1/object/public/previews/${vista[1]}`);
    const meta = await sharp(Buffer.from(await rv.arrayBuffer())).metadata().catch(() => ({}));
    paso('preview con marca de agua', rv.status === 200 && meta.format === 'webp' && meta.height === 1280 && !meta.exif, `${meta.width}x${meta.height}`);
  }
  const ro = await fetch(`${SB_URL}/storage/v1/object/public/high-res-photos/${archivos[0][1]}`);
  paso('original NO es público', ro.status >= 400, String(ro.status));

  t = t0();
  const rf = await fetch(`${SITIO}/f/${cliente.codigo.toLowerCase()}`);
  const html = await rf.text();
  const previews = archivos.filter(([b]) => b === 'previews').map(([, r]) => r.split('/')[1]);
  paso('galería del cliente con sus 3 fotos', rf.status === 200 && previews.every((p) => html.includes(p)) && !html.includes(archivos[0][1]), `${rf.status} ${ms(t)}`);
  paso('ofrece el pack', html.includes('Pack completo'));

  const re = await fetch(`${SITIO}/api/fotos/${cliente.codigo}/estado`);
  paso('estado', re.status === 200 && (await re.json()).vendidas?.length === 0, String(re.status));

  const { data: publico } = await sb.rpc('cliente_por_codigo', { p_codigo: cliente.codigo });
  const rd = await fetch(`${SITIO}/api/fotos/${cliente.codigo}/${publico.fotos[0].id}/descarga`, { redirect: 'manual' });
  paso('descarga bloqueada sin pagar', rd.status === 303 && rd.headers.get('location')?.includes(`/f/${cliente.codigo}`), `${rd.status}`);

  const rl = await fetch(`${SITIO}/f/${tarjetas[1].codigo}`);
  paso('tarjeta sin fotos: "se están subiendo"', rl.status === 200 && (await rl.text()).includes('se están subiendo'));

  const rn = await fetch(`${SITIO}/f/PRUEBA-ZZZZZZ`);
  paso('código inexistente → 404', rn.status === 404, String(rn.status));

  const rt = await fetch(`${SITIO}/admin/albumes/${albumId}/tarjetas`, { headers: { Cookie: cookie() } });
  const ht = await rt.text();
  paso('imprimir solo las tarjetas libres', rt.status === 200 && !ht.includes(cliente.codigo) && ht.includes(tarjetas[2].codigo), String(rt.status));

  const ra = await fetch(`${SITIO}/admin/albumes/${albumId}`, { headers: { Cookie: cookie() } });
  paso('álbum muestra el cliente con fotos', ra.status === 200 && (await ra.text()).includes(cliente.codigo), String(ra.status));

  const rsin = await fetch(`${SITIO}/api/admin/procesar`, { method: 'POST', body: '{}' });
  paso('procesar sin sesión → 401', rsin.status === 401, String(rsin.status));
} catch (e) {
  paso('excepción', false, e.stack);
} finally {
  for (const [bucket, ruta] of archivos) await sb.storage.from(bucket).remove([ruta]);
  if (albumId) {
    await sb.from('fotos').delete().eq('album_id', albumId);
    await sb.from('clientes').delete().eq('album_id', albumId);
    const { error } = await sb.from('albumes').delete().eq('id', albumId);
    paso('limpieza', !error, error?.message);
  }
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK');
  process.exitCode = fallas ? 1 : 0;
}
