-- Pruebas de la lógica en la base: RLS, funciones públicas, pagos y storage.
-- Se corren con `npm run test:db` (supabase/tests/probar_local.sh).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema pruebas;
grant usage on schema pruebas to anon, authenticated, service_role;

-- Ejecuta sql y verifica que falle con un mensaje que contenga fragmento.
create function pruebas.espera_error(sql text, fragmento text) returns void language plpgsql as $$
declare
  fallo boolean := false;
  mensaje text;
begin
  begin
    execute sql;
  exception when others then
    fallo := true;
    mensaje := sqlerrm;
  end;
  if not fallo then raise exception 'Se esperaba el error "%" y no hubo error', fragmento; end if;
  if position(fragmento in mensaje) = 0 then raise exception 'Se esperaba "%" pero fue "%"', fragmento, mensaje; end if;
end;
$$;
grant execute on function pruebas.espera_error(text, text) to anon, authenticated, service_role;

create function pruebas.afirmar(condicion boolean, mensaje text) returns void language plpgsql as $$
begin
  if condicion is not true then raise exception 'Falló: %', mensaje; end if;
end;
$$;
grant execute on function pruebas.afirmar(boolean, text) to anon, authenticated, service_role;

-- Datos: un admin, un usuario común, un álbum, dos fotos y un pedido.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@ejemplo.com'),
  ('00000000-0000-0000-0000-00000000000b', 'comun@ejemplo.com');
insert into public.administradores (usuario_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.albumes (id, titulo, ubicacion, prefijo_codigo)
  values ('10000000-0000-0000-0000-000000000001', 'Día 1 - Puerto de Frutos', 'Tigre', 'TIGRE');
insert into public.fotos (id, album_id, codigo, ruta_preview, ruta_alta, precio, orden) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'TIGRE-4892', 'a/p1.webp', 'a/o1.jpg', 5000, 1),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'TIGRE-4893', null, null, 5000, 2);
insert into public.pedidos (id, foto_id, pasarela, monto, moneda) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'mercadopago', 5000, 'ARS'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'stripe', 5000, 'ARS');

-- Restricciones de formato.
select pruebas.espera_error(
  $$insert into public.fotos (album_id, codigo, precio, orden) values ('10000000-0000-0000-0000-000000000001', 'tigre-1', 10, 99)$$,
  'fotos_codigo_check');
select pruebas.espera_error(
  $$update public.fotos set vendida = true where codigo = 'TIGRE-4893'$$, 'fotos_check');
select 'ok formato';

-- ─── Público (anon) ──────────────────────────────────────────────────────────
set role anon;
select pruebas.espera_error('select * from public.fotos', 'permission denied');
select pruebas.espera_error('select * from public.pedidos', 'permission denied');
select pruebas.espera_error($$insert into public.albumes (titulo, prefijo_codigo) values ('x', 'XX')$$, 'permission denied');

select pruebas.afirmar((select count(*) = 1 from public.foto_por_codigo(' tigre-4892 ')), 'foto_por_codigo encuentra la foto');
select pruebas.afirmar((select ruta_preview = 'a/p1.webp' from public.foto_por_codigo('TIGRE-4892')), 'devuelve la preview');
select pruebas.afirmar((select count(*) = 0 from public.foto_por_codigo('TIGRE-0000')), 'código inexistente no devuelve nada');
select pruebas.afirmar(
  not exists (
    select 1 from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_name = 'foto_por_codigo' and p.parameter_name = 'ruta_alta'),
  'foto_por_codigo nunca expone ruta_alta');

select public.registrar_vista('TIGRE-4892');
select public.registrar_vista('TIGRE-4892');
select pruebas.espera_error($$select public.completar_pedido('30000000-0000-0000-0000-000000000001', 'x', 5000)$$, 'permission denied');
select pruebas.espera_error($$insert into storage.objects (bucket_id, name) values ('high-res-photos', 'x.jpg')$$, 'row-level security');
reset role;
select pruebas.afirmar((select vistas = 2 from public.fotos where codigo = 'TIGRE-4892'), 'registrar_vista suma vistas');
select 'ok anon';

-- ─── Usuario logueado que no es admin ────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pruebas.afirmar((select count(*) = 0 from public.fotos), 'un no admin no ve fotos');
select pruebas.afirmar((select count(*) = 0 from public.pedidos), 'un no admin no ve pedidos');
select pruebas.afirmar((select count(*) = 0 from public.administradores), 'un no admin no ve la lista de admins');
select pruebas.espera_error($$insert into public.albumes (titulo, prefijo_codigo) values ('x', 'XX')$$, 'row-level security');
select pruebas.espera_error($$insert into storage.objects (bucket_id, name) values ('previews', 'x.webp')$$, 'row-level security');
select pruebas.espera_error($$select public.completar_pedido('30000000-0000-0000-0000-000000000001', 'x', 5000)$$, 'permission denied');
select pruebas.afirmar(not public.es_admin(), 'es_admin() es false');
reset role;
select 'ok no admin';

-- ─── Administrador ───────────────────────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pruebas.afirmar(public.es_admin(), 'es_admin() es true');
select pruebas.afirmar((select count(*) = 2 from public.fotos), 'el admin ve todas las fotos');
select pruebas.afirmar((select count(*) = 2 from public.pedidos), 'el admin ve los pedidos');
insert into public.albumes (titulo, prefijo_codigo) values ('Día 2 - Puerto de Frutos', 'TIGRE');
insert into storage.objects (bucket_id, name) values ('high-res-photos', 'b/o2.jpg'), ('previews', 'b/p2.webp');
select pruebas.afirmar((select count(*) = 2 from storage.objects), 'el admin sube y ve archivos');
-- Solo hay política de lectura: el update no toca ninguna fila.
update public.pedidos set estado = 'completado' where id = '30000000-0000-0000-0000-000000000001';
reset role;
select pruebas.afirmar(
  (select estado = 'pendiente' from public.pedidos where id = '30000000-0000-0000-0000-000000000001'),
  'el admin no puede marcar pedidos como pagos a mano');
select 'ok admin';

-- ─── Pagos (service_role, como el webhook) ───────────────────────────────────
set role service_role;
select pruebas.espera_error(
  $$select public.completar_pedido('30000000-0000-0000-0000-000000000001', 'mp-1', 100)$$, 'no cubre el pedido');
select pruebas.espera_error(
  $$select public.completar_pedido('30000000-0000-0000-0000-000000000009', 'mp-1', 5000)$$, 'no existe');
select pruebas.afirmar(
  public.completar_pedido('30000000-0000-0000-0000-000000000001', 'mp-1', 5000) = '20000000-0000-0000-0000-000000000001',
  'completar_pedido devuelve la foto');
-- Idempotente: el webhook repetido no rompe nada.
select pruebas.afirmar(
  public.completar_pedido('30000000-0000-0000-0000-000000000001', 'mp-1', 5000) = '20000000-0000-0000-0000-000000000001',
  'completar_pedido es idempotente');
reset role;
select pruebas.afirmar((select vendida from public.fotos where codigo = 'TIGRE-4892'), 'la foto queda vendida');
select pruebas.afirmar(
  (select estado = 'completado' and id_pago = 'mp-1' and completado_en is not null
     from public.pedidos where id = '30000000-0000-0000-0000-000000000001'),
  'el pedido queda completado');
select pruebas.afirmar((select vendida from public.foto_por_codigo('TIGRE-4892')), 'el público ve la foto como vendida');

-- El mismo pago no puede acreditar otro pedido de la misma pasarela.
insert into public.pedidos (id, foto_id, pasarela, monto, moneda)
  values ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'mercadopago', 5000, 'ARS');
set role service_role;
select pruebas.espera_error(
  $$select public.completar_pedido('30000000-0000-0000-0000-000000000003', 'mp-1', 5000)$$, 'pedidos_pasarela_id_pago_key');
reset role;
select 'ok pagos';

-- No se puede borrar una foto con pedidos.
select pruebas.espera_error($$delete from public.albumes where id = '10000000-0000-0000-0000-000000000001'$$, 'pedidos_foto_id_fkey');
select 'ok integridad';

-- ─── Panel: generador de códigos ─────────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pruebas.espera_error(
  $$select * from public.generar_codigos('10000000-0000-0000-0000-000000000001', 3)$$, 'Solo los administradores');
select pruebas.espera_error($$select public.metricas_panel()$$, 'Solo los administradores');
select pruebas.afirmar((select count(*) = 0 from public.resumen_albumes()), 'un no admin no ve álbumes');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pruebas.espera_error(
  $$select * from public.generar_codigos('10000000-0000-0000-0000-000000000001', 0)$$, 'entre 1 y 500');
create temp table nuevos as select * from public.generar_codigos('10000000-0000-0000-0000-000000000001', 50);
select pruebas.afirmar((select count(*) = 50 from nuevos), 'genera la cantidad pedida');
select pruebas.afirmar((select count(distinct codigo) = 50 from nuevos), 'los códigos no se repiten');
select pruebas.afirmar((select bool_and(codigo ~ '^TIGRE-[2-9A-HJKMNP-Z]{6}$') from nuevos), 'formato PREFIJO + 6 sin ambiguos');
select pruebas.afirmar((select min(orden) = 3 and max(orden) = 52 from nuevos), 'numera las tarjetas a continuación');
select pruebas.afirmar(
  (select bool_and(f.precio = 5000 and f.ruta_alta is null) from public.fotos f join nuevos n on n.id = f.id),
  'toma el precio del álbum y quedan sin archivo');
select pruebas.afirmar(
  (select (public.metricas_panel() ->> 'fotos')::int = 52 and (public.metricas_panel() ->> 'vistas')::int = 2),
  'métricas de fotos y vistas');
select pruebas.afirmar(
  (select public.metricas_panel() -> 'ingresos' -> 0 ->> 'total' = '5000.00'),
  'ingresos por pasarela');
select pruebas.afirmar(
  (select codigos = 52 and subidas = 1 and vendidas = 1 from public.resumen_albumes()
    where id = '10000000-0000-0000-0000-000000000001'),
  'resumen de álbumes');
select pruebas.espera_error(
  $$select public.cargar_archivos_foto('20000000-0000-0000-0000-000000000002', 'x', 'y')$$, 'permission denied');
reset role;
select 'ok generador';

-- ─── Panel: carga de archivos (service_role, desde /api/admin/procesar) ──────
set role service_role;
select pruebas.afirmar(
  (select ruta_alta_anterior is null and ruta_preview_anterior is null
     from public.cargar_archivos_foto('20000000-0000-0000-0000-000000000002', 'a/o2.jpg', 'a/p2.webp')),
  'primera carga no devuelve rutas anteriores');
select pruebas.afirmar(
  (select ruta_alta_anterior = 'a/o2.jpg' and ruta_preview_anterior = 'a/p2.webp'
     from public.cargar_archivos_foto('20000000-0000-0000-0000-000000000002', 'a/o3.jpg', 'a/p3.webp')),
  'reemplazo devuelve las rutas viejas para borrarlas');
select pruebas.espera_error(
  $$select public.cargar_archivos_foto('20000000-0000-0000-0000-000000000001', 'a/o9.jpg', 'a/p9.webp')$$, 'ya se vendió');
reset role;
select pruebas.afirmar(
  (select ruta_preview = 'a/p3.webp' from public.fotos where id = '20000000-0000-0000-0000-000000000002'),
  'la foto queda con los archivos nuevos');
select 'ok carga';

-- ─── Descarga ────────────────────────────────────────────────────────────────
set role anon;
select pruebas.espera_error($$select public.ruta_descarga('TIGRE-4892')$$, 'permission denied');
reset role;
set role service_role;
select pruebas.afirmar(public.ruta_descarga('tigre-4892') = 'a/o1.jpg', 'foto vendida: devuelve la ruta del original');
select pruebas.afirmar(public.ruta_descarga('TIGRE-4893') is null, 'foto sin vender: no devuelve nada');
select pruebas.afirmar(public.ruta_descarga('TIGRE-0000') is null, 'código inexistente: no devuelve nada');
reset role;
select 'ok descarga';
