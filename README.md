# Fotos Express

Venta y entrega express de fotos digitales en puntos turísticos y eventos.

1. El fotógrafo saca la foto y entrega una tarjeta con un código (`TIGRE-4892`) y un QR.
2. El cliente entra al sitio (o escanea el QR) y ve su foto con marca de agua.
3. Paga con Mercado Pago (ARS) o Stripe (USD) y descarga el original en alta resolución.

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

1. **Crear álbum** (título, lugar, prefijo y precio por foto).
2. **Generar códigos** y **imprimir tarjetas** con QR (85 × 54 mm, 10 por A4). Se entregan al sacar cada foto.
   `NEXT_PUBLIC_SITIO_URL` tiene que ser el dominio real: es la dirección que llevan los QR.
3. **Subir fotos** (arrastrar y soltar): se ordenan por nombre de archivo y van a las tarjetas libres en orden;
   cada fila permite elegir otro código. El original va directo al bucket privado y el servidor
   (`/api/admin/procesar`, con sharp) genera la preview de 1280 px con marca de agua.
4. **Métricas**: vistas, fotos vendidas e ingresos por pasarela.

Una vez paga, `/f/CODIGO` muestra el botón de descarga (`/api/fotos/CODIGO/descarga`, enlace firmado de 15 min).
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
