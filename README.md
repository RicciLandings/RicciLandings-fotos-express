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
npm run lint && npm run typecheck && npm test && npm run build
```
