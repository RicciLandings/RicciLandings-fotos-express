# Fotos Express

Venta y entrega express de fotos digitales en puntos turísticos y eventos.

1. El fotógrafo le saca varias fotos a alguien y le entrega **una tarjeta** con su código (`TIGRE-7KX9QM`) y un QR.
2. El cliente escanea el QR y ve **todas sus fotos** con marca de agua.
3. Elige fotos sueltas o el pack completo, paga con Mercado Pago (ARS) o Stripe (USD) y descarga los originales.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · Supabase (Postgres, Auth, Storage) · Vercel.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar las claves
npm run dev
```

### Base de datos

La migración está en `supabase/migrations/`. Aplicala con la CLI de Supabase (`supabase db push`) o pegándola en el SQL Editor del panel. Crea:

- Tablas `albumes`, `fotos`, `pedidos` y `administradores`, con RLS: solo los administradores las leen y escriben.
- Funciones para el público: `foto_por_codigo()` (nunca devuelve la ruta del original) y `registrar_vista()`.
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
5. El servidor (`/api/admin/procesar`, con sharp) genera la preview de 1280 px con marca de agua.

Cada foto paga muestra su botón de descarga en `/f/CODIGO` (`/api/fotos/CODIGO/FOTO/descarga`, enlace firmado de 15 min).
Al volver de la pasarela con `?pago=pendiente`, la página consulta el estado hasta que se acredita el pago.

La marca de agua es una imagen generada con `npm run marca-agua` y guardada en `lib/marca-agua.ts`
(en Vercel no hay fuentes para dibujar texto).

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
