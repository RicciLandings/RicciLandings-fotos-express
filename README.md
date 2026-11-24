# Fotear

Venta y entrega express de fotos digitales en puntos turísticos y eventos.

1. El fotógrafo le saca varias fotos a alguien y le entrega **una tarjeta** con su código (`TIGRE-7KX9QM4P`) y un QR.
2. El cliente escanea el QR y ve **todas sus fotos** con marca de agua.
3. Elige fotos sueltas o el pack completo, paga con Mercado Pago y descarga los originales.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · Supabase (Postgres, Auth, Storage) · Vercel.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar las claves
npm run dev
```

### Base de datos

La migración está en `supabase/migrations/`. Aplicala con la CLI de Supabase (`supabase db push`) o pegándola en el SQL Editor del panel. Crea:

- Tablas `albumes`, `clientes`, `fotos`, `pedidos`, `pedidos_fotos`, `intentos_codigo` y `administradores`, con RLS: solo los administradores las leen y escriben.
- Galería pública: `abrir_galeria()` (solo el servidor; nunca devuelve la ruta del original, bloquea tras 10 códigos erróneos en 15 min y oculta las fotos sin vender pasados `dias_vigencia` días).
- `completar_pedido()`: acredita un pago aprobado. Solo la puede llamar el servidor (service role).
- Buckets `previews` (público) y `high-res-photos` (privado: se descarga solo con enlaces firmados de 15 min).

**Alta de un administrador** (el registro público está desactivado): creá el usuario en *Authentication → Users* y después corré:

```sql
insert into public.administradores (usuario_id) values ('<uuid del usuario>');
```

## Panel del fotógrafo (`/admin`)

1. **Crear álbum** (título, lugar, prefijo, precio por foto y precio del pack).
2. **Generar tarjetas** e **imprimirlas** con QR (85 × 54 mm, 10 por A4). Una tarjeta = un cliente.
   `NEXT_PUBLIC_SITIO_URL` tiene que ser el dominio real: es la dirección que llevan los QR.
3. En la calle: **antes de cada cliente, sacale una foto a su tarjeta** con el QR visible; después, sus fotos.
4. **Subir las fotos del día** todas juntas: el navegador lee las tarjetas y reparte las fotos entre los clientes.
   Se revisa antes de subir (las fotos sin tarjeta se asignan a mano o se descartan). Las fotos de tarjeta no se suben.
   Si faltó la foto de una tarjeta, en el detalle del cliente se pueden agregar fotos a mano.
5. El servidor (`/api/admin/procesar`, con sharp) genera la preview de 900 px con marca de agua.

Cada foto paga muestra su botón de descarga en `/f/CODIGO` (`/api/fotos/CODIGO/FOTO/descarga`, enlace firmado de 15 min).
Al volver de la pasarela con `?pago=pendiente`, la página consulta el estado hasta que se acredita el pago.

La marca de agua es una imagen generada con `npm run marca-agua` y guardada en `lib/marca-agua.ts`
(en Vercel no hay fuentes para dibujar texto).

## Cobros con Mercado Pago (Checkout Pro)

1. En Mercado Pago → *Tus integraciones* → crear aplicación (Checkout Pro) y copiar el **Access Token** de producción.
2. En la aplicación → *Webhooks*: URL `https://fotos-express.vercel.app/api/webhooks/mercadopago`, evento **Pagos**. Copiar la **clave secreta** que muestra.
3. En Vercel → *Settings → Environment Variables* (marcadas como *Sensitive*): `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` (la clave **secreta** de Supabase, `sb_secret_…`). Después, *Redeploy*.

El monto lo calcula la base (`crear_pedido`): el navegador solo dice qué fotos o si es el pack. El webhook verifica la firma,
consulta el pago real en la API de MP y acredita con `completar_pedido` (idempotente). Para probar sin plata real, usar las
credenciales y usuarios de prueba de MP. Stripe queda preparado en `services/payments/tipos.ts` (hace falta una cuenta fuera de Argentina).

## Originales en Cloudflare R2 (opcional, para volumen)

Si están las 4 variables `R2_*`, las fotos **nuevas** se guardan en R2 (sin costo de descarga); las anteriores siguen en Supabase.
Los archivos de R2 se llaman `<album>/r2-<uuid>.jpg` (`lib/almacen.ts`, `lib/r2.ts`). Las previews siguen en Supabase.

1. Cloudflare → R2 → crear bucket `fotear-originales` (privado).
2. Bucket → *Settings → CORS policy*:
   `[{"AllowedOrigins":["https://fotos-express.vercel.app"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["Content-Type"],"MaxAgeSeconds":3600}]`
3. R2 → *Manage API tokens* → token con **Object Read & Write** sobre ese bucket.
4. Vercel (Sensitive): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` → *Redeploy*.

## Estructura

```
app/                 rutas (/, /f/[codigo], /admin/…)
components/          componentes de la app; components/ui = shadcn
lib/supabase/        client.ts (navegador), server.ts (sesión), admin.ts (service role + descargas firmadas)
lib/codigos.ts       formato y validación de códigos
services/payments/   Mercado Pago y Stripe
supabase/migrations  esquema, RLS y storage
```

## Chequeos

```bash
npm run lint && npm run typecheck && npm test && npm run test:db && npm run build
```

`npm run test:db` levanta un Postgres local descartable y prueba migraciones, RLS y funciones.

`npm run e2e` prueba el sitio publicado de punta a punta (login, álbum, subida, marca de agua, página del cliente, tarjetas y descarga bloqueada). Instrucciones al principio de `scripts/prueba-e2e.mjs`.
