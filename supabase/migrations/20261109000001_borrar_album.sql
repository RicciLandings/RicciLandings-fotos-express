-- ═════════════════════════════════════════════════════════════════════════════
-- Borrar un álbum desde el panel.
-- Regla: no se puede borrar un álbum con fotos vendidas o pedidos pagos (los compradores
-- tienen que poder seguir descargando). Los pedidos pendientes o fallidos se descartan.
-- Los archivos del storage los borra el servidor después (carpeta <album_id>/ en los dos buckets).
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.borrar_album(p_album_id uuid)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vendidas integer;
  v_pagos integer;
  v_clientes integer;
  v_fotos integer;
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden borrar álbumes' using errcode = '42501';
  end if;

  -- Bloquea el álbum para que no entren fotos ni pagos mientras se borra.
  perform 1 from public.albumes where id = p_album_id for update;
  if not found then
    raise exception 'El álbum no existe' using errcode = 'P0002';
  end if;

  select count(*) into v_vendidas from public.fotos where album_id = p_album_id and vendida;
  select count(*) into v_pagos
    from public.pedidos p join public.clientes c on c.id = p.cliente_id
   where c.album_id = p_album_id and p.estado = 'completado';
  if v_vendidas > 0 or v_pagos > 0 then
    raise exception 'Tiene % fotos vendidas: no se puede borrar (los compradores tienen que poder descargarlas)',
      greatest(v_vendidas, v_pagos) using errcode = '23503';
  end if;

  select count(*) into v_clientes from public.clientes where album_id = p_album_id;
  select count(*) into v_fotos from public.fotos where album_id = p_album_id;

  -- Pedidos que nunca se pagaron (pedidos_fotos se borra en cascada).
  delete from public.pedidos p using public.clientes c
   where c.id = p.cliente_id and c.album_id = p_album_id;

  delete from public.albumes where id = p_album_id;

  return json_build_object('clientes', v_clientes, 'fotos', v_fotos);
end;
$$;

revoke execute on function public.borrar_album(uuid) from public, anon;
grant execute on function public.borrar_album(uuid) to authenticated;
