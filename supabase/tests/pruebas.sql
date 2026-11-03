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
insert into public.fotos (id, album_id, codigo, ruta_preview, ruta_alta, precio) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'TIGRE-4892', 'a/p1.webp', 'a/o1.jpg', 5000),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'TIGRE-4893', null, null, 5000);
insert into public.pedidos (id, foto_id, pasarela, monto, moneda) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'mercadopago', 5000, 'ARS'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'stripe', 5000, 'ARS');

-- Restricciones de formato.
select pruebas.espera_error(
  $$insert into public.fotos (album_id, codigo, precio) values ('10000000-0000-0000-0000-000000000001', 'tigre-1', 10)$$,
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
