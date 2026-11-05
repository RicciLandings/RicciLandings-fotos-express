-- El procesamiento de fotos (/api/admin/procesar) pasa a usar la sesión del administrador en lugar de
-- la clave secreta: los admins ya pueden leer y escribir los buckets por RLS. cargar_archivos_foto()
-- ahora la llama un admin logueado, así que valida es_admin() adentro.

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
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden cargar fotos' using errcode = '42501';
  end if;

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
  -- Los archivos tienen que estar en la carpeta del álbum de la foto.
  if split_part(p_ruta_alta, '/', 1) <> v_foto.album_id::text
     or split_part(p_ruta_preview, '/', 1) <> v_foto.album_id::text then
    raise exception 'Los archivos no corresponden al álbum de la foto' using errcode = '22023';
  end if;

  update public.fotos set ruta_alta = p_ruta_alta, ruta_preview = p_ruta_preview where id = p_foto_id;

  ruta_alta_anterior := nullif(v_foto.ruta_alta, p_ruta_alta);
  ruta_preview_anterior := nullif(v_foto.ruta_preview, p_ruta_preview);
  return next;
end;
$$;

revoke execute on function public.cargar_archivos_foto(uuid, text, text) from public, anon, service_role;
grant execute on function public.cargar_archivos_foto(uuid, text, text) to authenticated;
