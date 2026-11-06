-- ═════════════════════════════════════════════════════════════════════════════
-- Código por CLIENTE: una tarjeta = un cliente con varias fotos.
--   · nueva tabla clientes (el código vive acá)
--   · fotos cuelga de clientes (cliente_id, posicion)
--   · pedidos por cliente: pack completo o fotos sueltas (pedidos_fotos)
--   · albumes.precio = precio por foto; nuevo precio_pack
-- Migra los datos existentes: cada código pasa a ser un cliente; los códigos sin foto
-- quedan como tarjetas libres.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Precios ─────────────────────────────────────────────────────────────────
alter table public.albumes
  add column precio_pack numeric(10, 2) check (precio_pack is null or precio_pack > 0);
comment on column public.albumes.precio is 'Precio por foto (ARS).';
comment on column public.albumes.precio_pack is 'Precio del pack con todas las fotos del cliente (ARS). Null = sin pack.';

-- ─── Clientes (tarjetas) ─────────────────────────────────────────────────────
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albumes (id) on delete cascade,
  -- Mismo patrón que lib/codigos.ts. UNIQUE ya crea el índice para buscar por código.
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{4,8}$'),
  -- Número de tarjeta dentro del álbum (#1, #2…).
  orden integer not null check (orden > 0),
  vistas integer not null default 0 check (vistas >= 0),
  creado_en timestamptz not null default now(),
  unique (album_id, orden)
);

comment on table public.clientes is 'Una tarjeta impresa = un cliente. Sin datos personales: el código es la llave.';

insert into public.clientes (album_id, codigo, orden, vistas, creado_en)
select album_id, codigo, orden, vistas, creado_en from public.fotos;

-- ─── Fotos ───────────────────────────────────────────────────────────────────
alter table public.fotos
  add column cliente_id uuid references public.clientes (id) on delete cascade,
  add column posicion integer check (posicion > 0);

update public.fotos f
   set cliente_id = c.id, posicion = 1
  from public.clientes c
 where c.codigo = f.codigo;

-- ─── Pedidos por cliente ─────────────────────────────────────────────────────
alter table public.pedidos
  add column cliente_id uuid references public.clientes (id) on delete restrict,
  add column tipo text not null default 'fotos' check (tipo in ('fotos', 'pack'));

update public.pedidos p set cliente_id = f.cliente_id from public.fotos f where f.id = p.foto_id;

create table public.pedidos_fotos (
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  foto_id uuid not null references public.fotos (id) on delete restrict,
  primary key (pedido_id, foto_id)
);
create index pedidos_fotos_foto_idx on public.pedidos_fotos (foto_id);

comment on table public.pedidos_fotos is 'Fotos elegidas en un pedido de tipo fotos (en un pack se compran todas las del cliente).';

insert into public.pedidos_fotos (pedido_id, foto_id)
select p.id, p.foto_id from public.pedidos p join public.fotos f on f.id = p.foto_id where f.ruta_alta is not null;

alter table public.pedidos alter column cliente_id set not null;
alter table public.pedidos drop column foto_id;
create index pedidos_cliente_idx on public.pedidos (cliente_id);

-- Los códigos sin foto ya son tarjetas libres en clientes: sus filas en fotos sobran.
delete from public.fotos where ruta_alta is null or ruta_preview is null;

alter table public.fotos drop constraint fotos_album_orden_key;
alter table public.fotos
  drop column codigo,
  drop column orden,
  drop column vistas,
  drop column precio;
alter table public.fotos
  alter column cliente_id set not null,
  alter column posicion set not null,
  alter column ruta_alta set not null,
  alter column ruta_preview set not null;
alter table public.fotos add constraint fotos_cliente_posicion_key unique (cliente_id, posicion);

comment on table public.fotos is 'Fotos de un cliente. ruta_alta apunta al bucket privado high-res-photos.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.clientes enable row level security;
alter table public.pedidos_fotos enable row level security;
revoke all on public.clientes, public.pedidos_fotos from anon;

create policy "admins gestionan clientes"
  on public.clientes for all to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

create policy "admins ven fotos de pedidos"
  on public.pedidos_fotos for select to authenticated
  using ((select public.es_admin()));

-- ─── Funciones ───────────────────────────────────────────────────────────────
drop function public.foto_por_codigo(text);
drop function public.cargar_archivos_foto(uuid, text, text);
drop function public.ruta_descarga(text);
drop function public.resumen_albumes();

-- Lo que ve el cliente con su código: álbum, precios y sus fotos (nunca la ruta del original).
create or replace function public.cliente_por_codigo(p_codigo text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'id', c.id,
    'codigo', c.codigo,
    'orden', c.orden,
    'titulo_album', a.titulo,
    'ubicacion', a.ubicacion,
    'precio_foto', a.precio,
    'precio_pack', a.precio_pack,
    'fotos', coalesce((
      select json_agg(json_build_object('id', f.id, 'ruta_preview', f.ruta_preview, 'posicion', f.posicion, 'vendida', f.vendida)
                      order by f.posicion)
      from public.fotos f where f.cliente_id = c.id
    ), '[]'::json)
  )
  from public.clientes c
  join public.albumes a on a.id = c.album_id
  where c.codigo = upper(trim(p_codigo));
$$;

create or replace function public.registrar_vista(p_codigo text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.clientes set vistas = vistas + 1 where codigo = upper(trim(p_codigo));
$$;

-- Crea p_cantidad tarjetas nuevas al final del álbum. Solo administradores.
create or replace function public.generar_codigos(p_album_id uuid, p_cantidad integer)
returns table (id uuid, codigo text, orden integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_album public.albumes;
  v_orden integer;
  v_codigo text;
  v_id uuid;
  v_intentos integer;
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden generar códigos' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then
    raise exception 'La cantidad tiene que estar entre 1 y 500' using errcode = '22023';
  end if;

  -- Bloquea el álbum para que dos pedidos a la vez no repitan números de tarjeta.
  select * into v_album from public.albumes a where a.id = p_album_id for update;
  if not found then
    raise exception 'El álbum no existe' using errcode = 'P0002';
  end if;

  select coalesce(max(c.orden), 0) into v_orden from public.clientes c where c.album_id = p_album_id;

  for i in 1 .. p_cantidad loop
    v_orden := v_orden + 1;
    v_intentos := 0;
    loop
      v_intentos := v_intentos + 1;
      v_codigo := v_album.prefijo_codigo || '-' || public.sufijo_aleatorio(6);
      insert into public.clientes (album_id, codigo, orden)
      values (p_album_id, v_codigo, v_orden)
      on conflict on constraint clientes_codigo_key do nothing
      returning clientes.id into v_id;
      exit when v_id is not null;
      if v_intentos >= 10 then
        raise exception 'No se pudo generar un código único' using errcode = '23505';
      end if;
    end loop;
    id := v_id;
    codigo := v_codigo;
    orden := v_orden;
    return next;
    v_id := null;
  end loop;
end;
$$;

-- Agrega una foto (ya subida y procesada) al final de las fotos del cliente. Solo administradores.
create or replace function public.cargar_foto_cliente(p_cliente_id uuid, p_ruta_alta text, p_ruta_preview text)
returns table (id uuid, posicion integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente public.clientes;
  v_posicion integer;
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden cargar fotos' using errcode = '42501';
  end if;

  -- Bloquea al cliente para que dos subidas a la vez no repitan la posición.
  select * into v_cliente from public.clientes c where c.id = p_cliente_id for update;
  if not found then
    raise exception 'El cliente no existe' using errcode = 'P0002';
  end if;
  if p_ruta_alta is null or p_ruta_preview is null then
    raise exception 'Faltan las rutas de los archivos' using errcode = '22023';
  end if;
  if split_part(p_ruta_alta, '/', 1) <> v_cliente.album_id::text
     or split_part(p_ruta_preview, '/', 1) <> v_cliente.album_id::text then
    raise exception 'Los archivos no corresponden al álbum del cliente' using errcode = '22023';
  end if;

  select coalesce(max(f.posicion), 0) + 1 into v_posicion from public.fotos f where f.cliente_id = p_cliente_id;

  insert into public.fotos (album_id, cliente_id, ruta_alta, ruta_preview, posicion)
  values (v_cliente.album_id, p_cliente_id, p_ruta_alta, p_ruta_preview, v_posicion)
  returning fotos.id, fotos.posicion into id, posicion;
  return next;
end;
$$;

-- Ruta del original SOLO si esa foto es de ese cliente y está vendida.
create or replace function public.ruta_descarga(p_codigo text, p_foto_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select f.ruta_alta
  from public.fotos f
  join public.clientes c on c.id = f.cliente_id
  where c.codigo = upper(trim(p_codigo)) and f.id = p_foto_id and f.vendida;
$$;

-- Acredita un pago aprobado. Idempotente. Pack: todas las fotos del cliente; fotos: las elegidas.
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
    return v_pedido.cliente_id;
  end if;

  if p_monto is null or p_monto < v_pedido.monto then
    raise exception 'El monto pagado (%) no cubre el pedido (%)', p_monto, v_pedido.monto using errcode = '22023';
  end if;

  update public.pedidos
     set estado = 'completado', id_pago = p_id_pago, completado_en = now()
   where id = v_pedido.id;

  if v_pedido.tipo = 'pack' then
    update public.fotos set vendida = true where cliente_id = v_pedido.cliente_id;
  else
    update public.fotos set vendida = true
     where id in (select foto_id from public.pedidos_fotos where pedido_id = v_pedido.id);
  end if;

  return v_pedido.cliente_id;
end;
$$;

create or replace function public.metricas_panel()
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores ven las métricas' using errcode = '42501';
  end if;
  return json_build_object(
    'clientes', (select count(*) from public.clientes),
    'clientes_con_fotos', (select count(distinct cliente_id) from public.fotos),
    'fotos', (select count(*) from public.fotos),
    'fotos_vendidas', (select count(*) from public.fotos where vendida),
    'vistas', (select coalesce(sum(vistas), 0) from public.clientes),
    'pedidos_pendientes', (select count(*) from public.pedidos where estado = 'pendiente'),
    'ingresos', coalesce((
      select json_agg(json_build_object('pasarela', pasarela, 'moneda', moneda, 'total', total, 'ventas', ventas)
                      order by pasarela, moneda)
      from (
        select pasarela, moneda, sum(monto) as total, count(*) as ventas
        from public.pedidos
        where estado = 'completado'
        group by pasarela, moneda
      ) t
    ), '[]'::json)
  );
end;
$$;

create or replace function public.resumen_albumes()
returns table (
  id uuid,
  titulo text,
  ubicacion text,
  prefijo_codigo text,
  precio numeric,
  precio_pack numeric,
  creado_en timestamptz,
  clientes bigint,
  clientes_con_fotos bigint,
  fotos bigint,
  vendidas bigint,
  vistas bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.titulo, a.ubicacion, a.prefijo_codigo, a.precio, a.precio_pack, a.creado_en,
         (select count(*) from public.clientes c where c.album_id = a.id),
         (select count(distinct f.cliente_id) from public.fotos f where f.album_id = a.id),
         (select count(*) from public.fotos f where f.album_id = a.id),
         (select count(*) from public.fotos f where f.album_id = a.id and f.vendida),
         (select coalesce(sum(c.vistas), 0) from public.clientes c where c.album_id = a.id)
  from public.albumes a
  order by a.creado_en desc;
$$;

-- ─── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function public.cliente_por_codigo(text) from public;
revoke execute on function public.registrar_vista(text) from public;
revoke execute on function public.generar_codigos(uuid, integer) from public, anon;
revoke execute on function public.cargar_foto_cliente(uuid, text, text) from public, anon, service_role;
revoke execute on function public.ruta_descarga(text, uuid) from public, anon, authenticated;
revoke execute on function public.completar_pedido(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.metricas_panel() from public, anon;
revoke execute on function public.resumen_albumes() from public, anon;

grant execute on function public.cliente_por_codigo(text) to anon, authenticated;
grant execute on function public.registrar_vista(text) to anon, authenticated;
grant execute on function public.generar_codigos(uuid, integer) to authenticated;
grant execute on function public.cargar_foto_cliente(uuid, text, text) to authenticated;
grant execute on function public.ruta_descarga(text, uuid) to service_role;
grant execute on function public.completar_pedido(uuid, text, numeric) to service_role;
grant execute on function public.metricas_panel() to authenticated;
grant execute on function public.resumen_albumes() to authenticated;
