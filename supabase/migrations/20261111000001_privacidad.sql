-- ═════════════════════════════════════════════════════════════════════════════
-- Privacidad de las galerías
--   · códigos nuevos de 8 caracteres
--   · la galería solo se abre desde el servidor (abrir_galeria, service_role), con límite de intentos
--   · las fotos sin comprar vencen a los N días (albumes.dias_vigencia, 30 por defecto)
-- Las funciones viejas (cliente_por_codigo, registrar_vista) se quitan en la migración siguiente,
-- una vez publicado el código que usa abrir_galeria.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.albumes
  add column dias_vigencia integer not null default 30 check (dias_vigencia between 1 and 3650);
comment on column public.albumes.dias_vigencia is 'Días que las fotos sin comprar quedan visibles desde que se suben.';

-- ─── Intentos fallidos ───────────────────────────────────────────────────────
-- huella = hash de la IP del visitante (lo calcula el servidor; nunca se guarda la IP).
create table public.intentos_codigo (
  id bigint generated always as identity primary key,
  huella text not null,
  momento timestamptz not null default now()
);
create index intentos_codigo_huella_idx on public.intentos_codigo (huella, momento);
alter table public.intentos_codigo enable row level security;
revoke all on public.intentos_codigo from anon, authenticated;

-- ─── Códigos de 8 ────────────────────────────────────────────────────────────
-- 31^8 ≈ 853 mil millones de combinaciones por prefijo. Los códigos viejos (6) siguen valiendo.
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
      v_codigo := v_album.prefijo_codigo || '-' || public.sufijo_aleatorio(8);
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

-- ─── Abrir la galería ────────────────────────────────────────────────────────
-- Devuelve: null (código inexistente), {"bloqueado": true} (demasiados intentos fallidos desde esa
-- huella) o los datos del cliente con sus fotos visibles: las vendidas siempre, las demás solo si
-- no vencieron. Nunca devuelve la ruta del original.
create or replace function public.abrir_galeria(p_codigo text, p_huella text, p_contar_vista boolean default false)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_max_fallos constant integer := 10;
  c_ventana constant interval := interval '15 minutes';
  v_cliente public.clientes;
  v_album public.albumes;
  v_desde timestamptz;
begin
  if p_huella is not null
     and (select count(*) from public.intentos_codigo i where i.huella = p_huella and i.momento > now() - c_ventana) >= c_max_fallos then
    return json_build_object('bloqueado', true);
  end if;

  select * into v_cliente from public.clientes where codigo = upper(trim(p_codigo));
  if not found then
    if p_huella is not null then
      insert into public.intentos_codigo (huella) values (p_huella);
      delete from public.intentos_codigo where momento < now() - interval '1 day';
    end if;
    return null;
  end if;

  if p_contar_vista then
    update public.clientes set vistas = vistas + 1 where id = v_cliente.id;
  end if;

  select * into v_album from public.albumes where id = v_cliente.album_id;
  v_desde := now() - make_interval(days => v_album.dias_vigencia);

  return json_build_object(
    'id', v_cliente.id,
    'codigo', v_cliente.codigo,
    'orden', v_cliente.orden,
    'titulo_album', v_album.titulo,
    'ubicacion', v_album.ubicacion,
    'precio_foto', v_album.precio,
    'precio_pack', v_album.precio_pack,
    'fotos', coalesce((
      select json_agg(json_build_object('id', f.id, 'ruta_preview', f.ruta_preview, 'posicion', f.posicion, 'vendida', f.vendida)
                      order by f.posicion)
      from public.fotos f
      where f.cliente_id = v_cliente.id and (f.vendida or f.creado_en >= v_desde)
    ), '[]'::json),
    'vencidas', (select count(*) from public.fotos f
                  where f.cliente_id = v_cliente.id and not f.vendida and f.creado_en < v_desde),
    'disponible_hasta', (select min(f.creado_en) + make_interval(days => v_album.dias_vigencia) from public.fotos f
                          where f.cliente_id = v_cliente.id and not f.vendida and f.creado_en >= v_desde)
  );
end;
$$;

-- ─── Pedidos: solo fotos vigentes ────────────────────────────────────────────
-- El pack también guarda sus fotos en pedidos_fotos (las vigentes al momento de pedir).
create or replace function public.crear_pedido(p_codigo text, p_tipo text, p_foto_ids uuid[], p_pasarela text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente public.clientes;
  v_album public.albumes;
  v_desde timestamptz;
  v_disponibles integer;
  v_vendidas integer;
  v_elegidas integer;
  v_monto numeric(10, 2);
  v_pedido uuid;
  v_descripcion text;
begin
  if p_tipo not in ('fotos', 'pack') then
    raise exception 'Tipo de pedido inválido' using errcode = '22023';
  end if;
  if p_pasarela not in ('mercadopago', 'stripe') then
    raise exception 'Pasarela inválida' using errcode = '22023';
  end if;

  select * into v_cliente from public.clientes where codigo = upper(trim(p_codigo));
  if not found then
    raise exception 'El código no existe' using errcode = 'P0002';
  end if;
  select * into v_album from public.albumes where id = v_cliente.album_id;
  v_desde := now() - make_interval(days => v_album.dias_vigencia);

  select count(*) filter (where not vendida and creado_en >= v_desde), count(*) filter (where vendida)
    into v_disponibles, v_vendidas
    from public.fotos where cliente_id = v_cliente.id;

  if p_tipo = 'pack' then
    -- Misma regla que lib/precios.ts (packDisponible).
    if v_album.precio_pack is null or v_disponibles < 2 or v_vendidas > 0 then
      raise exception 'El pack no está disponible para estas fotos' using errcode = '22023';
    end if;
    v_monto := v_album.precio_pack;
    v_descripcion := format('Pack completo · %s fotos · %s', v_disponibles, v_cliente.codigo);
  else
    if p_foto_ids is null or cardinality(p_foto_ids) = 0 then
      raise exception 'Elegí al menos una foto' using errcode = '22023';
    end if;
    select count(*) into v_elegidas
      from public.fotos
     where id = any (p_foto_ids) and cliente_id = v_cliente.id and not vendida and creado_en >= v_desde;
    if v_elegidas <> (select count(distinct x) from unnest(p_foto_ids) x) then
      raise exception 'Alguna foto no es de este código, ya está paga o ya no está disponible' using errcode = '22023';
    end if;
    v_monto := v_elegidas * v_album.precio;
    v_descripcion := format('%s %s · %s', v_elegidas, case when v_elegidas = 1 then 'foto' else 'fotos' end, v_cliente.codigo);
  end if;

  insert into public.pedidos (cliente_id, tipo, pasarela, monto, moneda)
  values (v_cliente.id, p_tipo, p_pasarela, v_monto, 'ARS')
  returning id into v_pedido;

  insert into public.pedidos_fotos (pedido_id, foto_id)
  select v_pedido, f.id from public.fotos f
   where f.cliente_id = v_cliente.id and not f.vendida and f.creado_en >= v_desde
     and (p_tipo = 'pack' or f.id = any (p_foto_ids));

  return json_build_object('pedido_id', v_pedido, 'monto', v_monto, 'descripcion', v_descripcion, 'codigo', v_cliente.codigo);
end;
$$;

-- Acredita un pago. Marca las fotos guardadas en el pedido; un pack viejo sin fotos guardadas marca todas.
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

  if v_pedido.tipo = 'pack' and not exists (select 1 from public.pedidos_fotos where pedido_id = v_pedido.id) then
    update public.fotos set vendida = true where cliente_id = v_pedido.cliente_id;
  else
    update public.fotos set vendida = true
     where id in (select foto_id from public.pedidos_fotos where pedido_id = v_pedido.id);
  end if;

  return v_pedido.cliente_id;
end;
$$;

revoke execute on function public.abrir_galeria(text, text, boolean) from public, anon, authenticated;
grant execute on function public.abrir_galeria(text, text, boolean) to service_role;
