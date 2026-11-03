-- ═════════════════════════════════════════════════════════════════════════════
-- Panel del fotógrafo: precio por álbum, orden de tarjetas, generador de códigos,
-- carga de archivos y métricas.
-- ═════════════════════════════════════════════════════════════════════════════

-- Precio por defecto de las fotos nuevas del álbum (ARS).
alter table public.albumes
  add column precio numeric(10, 2) not null default 5000 check (precio > 0);

-- Número de tarjeta dentro del álbum (#1, #2…): sirve para imprimir en orden y para que el
-- uploader asigne las fotos a las tarjetas libres en el mismo orden en que se entregaron.
alter table public.fotos add column orden integer;
update public.fotos f
   set orden = n.fila
  from (select id, row_number() over (partition by album_id order by creado_en, codigo) as fila from public.fotos) n
 where n.id = f.id;
alter table public.fotos alter column orden set not null;
alter table public.fotos add constraint fotos_album_orden_key unique (album_id, orden);

-- Previews solo en WebP (las genera el servidor); originales en formatos que el servidor sabe procesar.
update storage.buckets set allowed_mime_types = array['image/webp'] where id = 'previews';
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/tiff']
 where id = 'high-res-photos';

-- ─── Generador de códigos ────────────────────────────────────────────────────
-- Sufijo aleatorio sin caracteres que se confunden al leer una tarjeta (0/O, 1/I/L).
-- 31 símbolos ^ 6 = ~887 millones de combinaciones por prefijo: no se pueden adivinar probando.
create or replace function public.sufijo_aleatorio(p_largo integer default 6)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  resultado text := '';
begin
  for i in 0 .. p_largo - 1 loop
    resultado := resultado || substr(alfabeto, get_byte(bytes, i) % 31 + 1, 1);
  end loop;
  return resultado;
end;
$$;

-- Crea p_cantidad códigos nuevos (sin foto todavía) al final del álbum. Solo administradores.
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

  -- Bloquea el álbum para que dos cargas a la vez no repitan números de tarjeta.
  select * into v_album from public.albumes a where a.id = p_album_id for update;
  if not found then
    raise exception 'El álbum no existe' using errcode = 'P0002';
  end if;

  select coalesce(max(f.orden), 0) into v_orden from public.fotos f where f.album_id = p_album_id;

  for i in 1 .. p_cantidad loop
    v_orden := v_orden + 1;
    v_intentos := 0;
    loop
      v_intentos := v_intentos + 1;
      v_codigo := v_album.prefijo_codigo || '-' || public.sufijo_aleatorio(6);
      insert into public.fotos (album_id, codigo, precio, orden)
      values (p_album_id, v_codigo, v_album.precio, v_orden)
      on conflict on constraint fotos_codigo_key do nothing
      returning fotos.id into v_id;
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

-- ─── Carga de archivos ───────────────────────────────────────────────────────
-- La llama el servidor después de subir el original y generar la preview. Devuelve las rutas
-- anteriores (si se reemplazó la foto) para borrarlas del storage. Una foto vendida no se reemplaza.
create or replace function public.cargar_archivos_foto(p_foto_id uuid, p_ruta_alta text, p_ruta_preview text)
returns table (ruta_alta_anterior text, ruta_preview_anterior text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_foto public.fotos;
begin
  select * into v_foto from public.fotos where id = p_foto_id for update;
  if not found then
    raise exception 'La foto no existe' using errcode = 'P0002';
  end if;
  if v_foto.vendida then
    raise exception 'La foto ya se vendió: no se puede reemplazar' using errcode = '55000';
  end if;
  if p_ruta_alta is null or p_ruta_preview is null then
    raise exception 'Faltan las rutas de los archivos' using errcode = '22023';
  end if;

  update public.fotos set ruta_alta = p_ruta_alta, ruta_preview = p_ruta_preview where id = p_foto_id;

  ruta_alta_anterior := nullif(v_foto.ruta_alta, p_ruta_alta);
  ruta_preview_anterior := nullif(v_foto.ruta_preview, p_ruta_preview);
  return next;
end;
$$;

-- ─── Descarga ────────────────────────────────────────────────────────────────
-- Ruta del original SOLO si la foto está vendida. La usa el servidor para firmar la descarga.
create or replace function public.ruta_descarga(p_codigo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ruta_alta from public.fotos
  where codigo = upper(trim(p_codigo)) and vendida and ruta_alta is not null;
$$;

-- ─── Métricas ────────────────────────────────────────────────────────────────
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
    'fotos', (select count(*) from public.fotos),
    'fotos_subidas', (select count(*) from public.fotos where ruta_preview is not null),
    'fotos_vendidas', (select count(*) from public.fotos where vendida),
    'vistas', (select coalesce(sum(vistas), 0) from public.fotos),
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

-- Lista de álbumes con sus contadores, para el panel.
create or replace function public.resumen_albumes()
returns table (
  id uuid,
  titulo text,
  ubicacion text,
  prefijo_codigo text,
  precio numeric,
  creado_en timestamptz,
  codigos bigint,
  subidas bigint,
  vendidas bigint,
  vistas bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.titulo, a.ubicacion, a.prefijo_codigo, a.precio, a.creado_en,
         count(f.id),
         count(f.id) filter (where f.ruta_preview is not null),
         count(f.id) filter (where f.vendida),
         coalesce(sum(f.vistas), 0)
  from public.albumes a
  left join public.fotos f on f.album_id = a.id
  group by a.id
  order by a.creado_en desc;
$$;

-- ─── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function public.sufijo_aleatorio(integer) from public, anon, authenticated;
revoke execute on function public.generar_codigos(uuid, integer) from public, anon;
revoke execute on function public.cargar_archivos_foto(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ruta_descarga(text) from public, anon, authenticated;
revoke execute on function public.metricas_panel() from public, anon;
revoke execute on function public.resumen_albumes() from public, anon;

grant execute on function public.sufijo_aleatorio(integer) to authenticated;
grant execute on function public.generar_codigos(uuid, integer) to authenticated;
grant execute on function public.cargar_archivos_foto(uuid, text, text) to service_role;
grant execute on function public.ruta_descarga(text) to service_role;
grant execute on function public.metricas_panel() to authenticated;
grant execute on function public.resumen_albumes() to authenticated;
