-- ═════════════════════════════════════════════════════════════════════════════
-- Fotos Express: esquema inicial
--   · albumes, fotos, pedidos y administradores
--   · RLS: solo los administradores leen y escriben las tablas
--   · el público accede únicamente por funciones (foto_por_codigo, registrar_vista)
--   · buckets: previews (público, con marca de agua) y high-res-photos (privado)
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Administradores ─────────────────────────────────────────────────────────
-- El registro público de Auth está desactivado. Para dar de alta a un fotógrafo:
--   1) crear el usuario en Authentication → Users
--   2) insert into public.administradores (usuario_id) values ('<uuid del usuario>');
create table public.administradores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.administradores where usuario_id = (select auth.uid()));
$$;

comment on function public.es_admin() is 'true si el usuario de la sesión es administrador. La usan las políticas RLS.';

-- ─── Álbumes (sesiones / lotes) ──────────────────────────────────────────────
create table public.albumes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(titulo) between 1 and 120),
  ubicacion text check (ubicacion is null or char_length(ubicacion) <= 120),
  -- Varios álbumes pueden compartir prefijo (ej. TIGRE día 1 y día 2); el código completo es único.
  prefijo_codigo text not null check (prefijo_codigo ~ '^[A-Z0-9]{2,12}$'),
  creado_en timestamptz not null default now()
);

create index albumes_creado_idx on public.albumes (creado_en desc);

comment on table public.albumes is 'Sesiones de fotos (ej. "Día 1 - Puerto de Frutos") con el prefijo de sus códigos.';

-- ─── Fotos ───────────────────────────────────────────────────────────────────
create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albumes (id) on delete cascade,
  -- Mismo patrón que lib/codigos.ts. UNIQUE ya crea el índice para buscar por código.
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{4,8}$'),
  -- Las rutas quedan en null mientras el código está pregenerado y la foto no se subió.
  -- Usar nombres aleatorios (uuid), nunca el código, para que no se puedan adivinar.
  ruta_preview text,
  ruta_alta text,
  precio numeric(10, 2) not null check (precio > 0),
  vendida boolean not null default false,
  vistas integer not null default 0 check (vistas >= 0),
  creado_en timestamptz not null default now(),
  check (not vendida or ruta_alta is not null)
);

create index fotos_album_idx on public.fotos (album_id);
create index fotos_vendidas_idx on public.fotos (album_id) where vendida;

comment on table public.fotos is 'Una foto por código de tarjeta. ruta_alta apunta al bucket privado high-res-photos.';
comment on column public.fotos.precio is 'Precio en pesos (ARS).';

-- ─── Pedidos ─────────────────────────────────────────────────────────────────
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  -- restrict: no se puede borrar una foto (ni su álbum) si tiene pedidos registrados.
  foto_id uuid not null references public.fotos (id) on delete restrict,
  pasarela text not null check (pasarela in ('mercadopago', 'stripe')),
  -- Lo completa el webhook con el id del pago aprobado.
  id_pago text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'completado', 'fallido')),
  monto numeric(10, 2) not null check (monto > 0),
  moneda text not null check (moneda in ('ARS', 'USD')),
  email_cliente text check (email_cliente is null or email_cliente ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  creado_en timestamptz not null default now(),
  completado_en timestamptz,
  -- Un mismo pago no puede acreditar dos pedidos (webhooks repetidos o reenviados).
  unique (pasarela, id_pago)
);

create index pedidos_foto_idx on public.pedidos (foto_id);
create index pedidos_estado_idx on public.pedidos (estado, creado_en desc);

comment on table public.pedidos is 'Intentos de compra. Solo pasan a completado vía completar_pedido() desde el webhook.';

-- ─── Funciones públicas ──────────────────────────────────────────────────────

-- Lo único que ve el cliente de una foto. Nunca devuelve ruta_alta.
create or replace function public.foto_por_codigo(p_codigo text)
returns table (
  id uuid,
  codigo text,
  ruta_preview text,
  precio numeric,
  vendida boolean,
  titulo_album text,
  ubicacion text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.codigo, f.ruta_preview, f.precio, f.vendida, a.titulo, a.ubicacion
  from public.fotos f
  join public.albumes a on a.id = f.album_id
  where f.codigo = upper(trim(p_codigo));
$$;

create or replace function public.registrar_vista(p_codigo text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.fotos set vistas = vistas + 1 where codigo = upper(trim(p_codigo));
$$;

-- Acredita un pago aprobado. Idempotente: si el pedido ya estaba completado devuelve la foto sin tocar nada.
-- Solo la llama el servidor (service_role) después de verificar la firma del webhook.
create or replace function public.completar_pedido(p_pedido_id uuid, p_id_pago text, p_monto numeric)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido % no existe', p_pedido_id using errcode = 'P0002';
  end if;

  if v_pedido.estado = 'completado' then
    return v_pedido.foto_id;
  end if;

  if p_monto is null or p_monto < v_pedido.monto then
    raise exception 'El monto pagado (%) no cubre el pedido (%)', p_monto, v_pedido.monto using errcode = '22023';
  end if;

  update public.pedidos
     set estado = 'completado', id_pago = p_id_pago, completado_en = now()
   where id = v_pedido.id;

  update public.fotos set vendida = true where id = v_pedido.foto_id;

  return v_pedido.foto_id;
end;
$$;

-- Permisos de ejecución: por defecto Postgres deja ejecutar a todos; se cierra y se abre lo justo.
revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.foto_por_codigo(text) from public;
revoke execute on function public.registrar_vista(text) from public;
revoke execute on function public.completar_pedido(uuid, text, numeric) from public, anon, authenticated;

grant execute on function public.es_admin() to authenticated;
grant execute on function public.foto_por_codigo(text) to anon, authenticated;
grant execute on function public.registrar_vista(text) to anon, authenticated;
grant execute on function public.completar_pedido(uuid, text, numeric) to service_role;

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table public.administradores enable row level security;
alter table public.albumes enable row level security;
alter table public.fotos enable row level security;
alter table public.pedidos enable row level security;

-- Defensa extra: anon no toca las tablas directamente (ni siquiera con una política mal escrita).
revoke all on public.administradores, public.albumes, public.fotos, public.pedidos from anon;

create policy "cada admin ve su fila"
  on public.administradores for select to authenticated
  using (usuario_id = (select auth.uid()));

create policy "admins gestionan albumes"
  on public.albumes for all to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

create policy "admins gestionan fotos"
  on public.fotos for all to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

create policy "admins ven pedidos"
  on public.pedidos for select to authenticated
  using ((select public.es_admin()));

-- ─── Storage ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('previews', 'previews', true, 2097152, array['image/jpeg', 'image/webp']),
  ('high-res-photos', 'high-res-photos', false, 52428800,
    array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/tiff'])
on conflict (id) do nothing;

-- previews es público: se lee por URL directa sin política. No hay política de select para anon,
-- así nadie puede listar el bucket. high-res-photos no tiene ninguna lectura para anon ni authenticated
-- (salvo admins): el cliente solo baja el original con un enlace firmado que genera el servidor.
create policy "admins leen fotos"
  on storage.objects for select to authenticated
  using (bucket_id in ('previews', 'high-res-photos') and (select public.es_admin()));

create policy "admins suben fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('previews', 'high-res-photos') and (select public.es_admin()));

create policy "admins reemplazan fotos"
  on storage.objects for update to authenticated
  using (bucket_id in ('previews', 'high-res-photos') and (select public.es_admin()))
  with check (bucket_id in ('previews', 'high-res-photos') and (select public.es_admin()));

create policy "admins borran fotos"
  on storage.objects for delete to authenticated
  using (bucket_id in ('previews', 'high-res-photos') and (select public.es_admin()));
