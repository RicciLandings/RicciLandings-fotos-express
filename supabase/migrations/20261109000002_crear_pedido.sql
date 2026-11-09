-- ═════════════════════════════════════════════════════════════════════════════
-- Pedidos: el monto lo calcula la base (nunca el navegador).
-- Las llama el servidor con la clave secreta (service_role): crear_pedido antes de ir a la
-- pasarela, marcar_pedido_fallido desde el webhook cuando el pago se rechaza.
-- ═════════════════════════════════════════════════════════════════════════════

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
  v_total integer;
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

  select count(*), count(*) filter (where vendida) into v_total, v_vendidas
    from public.fotos where cliente_id = v_cliente.id;

  if p_tipo = 'pack' then
    -- Misma regla que lib/precios.ts (packDisponible).
    if v_album.precio_pack is null or v_total - v_vendidas < 2 or v_vendidas > 0 then
      raise exception 'El pack no está disponible para estas fotos' using errcode = '22023';
    end if;
    v_monto := v_album.precio_pack;
    v_descripcion := format('Pack completo · %s fotos · %s', v_total, v_cliente.codigo);
  else
    if p_foto_ids is null or cardinality(p_foto_ids) = 0 then
      raise exception 'Elegí al menos una foto' using errcode = '22023';
    end if;
    select count(*) into v_elegidas
      from public.fotos
     where id = any (p_foto_ids) and cliente_id = v_cliente.id and not vendida;
    if v_elegidas <> (select count(distinct x) from unnest(p_foto_ids) x) then
      raise exception 'Alguna foto no es de este código o ya está paga' using errcode = '22023';
    end if;
    v_monto := v_elegidas * v_album.precio;
    v_descripcion := format('%s %s · %s', v_elegidas, case when v_elegidas = 1 then 'foto' else 'fotos' end, v_cliente.codigo);
  end if;

  insert into public.pedidos (cliente_id, tipo, pasarela, monto, moneda)
  values (v_cliente.id, p_tipo, p_pasarela, v_monto, 'ARS')
  returning id into v_pedido;

  if p_tipo = 'fotos' then
    insert into public.pedidos_fotos (pedido_id, foto_id)
    select v_pedido, f.id from public.fotos f where f.id = any (p_foto_ids) and f.cliente_id = v_cliente.id;
  end if;

  return json_build_object('pedido_id', v_pedido, 'monto', v_monto, 'descripcion', v_descripcion, 'codigo', v_cliente.codigo);
end;
$$;

-- Pago rechazado o cancelado: el pedido pasa a fallido (solo si seguía pendiente).
create or replace function public.marcar_pedido_fallido(p_pedido_id uuid, p_id_pago text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.pedidos set estado = 'fallido', id_pago = coalesce(id_pago, p_id_pago)
   where id = p_pedido_id and estado = 'pendiente';
$$;

revoke execute on function public.crear_pedido(text, text, uuid[], text) from public, anon, authenticated;
revoke execute on function public.marcar_pedido_fallido(uuid, text) from public, anon, authenticated;
grant execute on function public.crear_pedido(text, text, uuid[], text) to service_role;
grant execute on function public.marcar_pedido_fallido(uuid, text) to service_role;
