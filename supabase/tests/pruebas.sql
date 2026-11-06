-- Pruebas de la lógica en la base: RLS, funciones públicas, panel, pagos y storage.
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

-- Datos: un admin, un usuario común, un álbum con pack, dos clientes (uno con 3 fotos) y dos pedidos.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@ejemplo.com'),
  ('00000000-0000-0000-0000-00000000000b', 'comun@ejemplo.com');
insert into public.administradores (usuario_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.albumes (id, titulo, ubicacion, prefijo_codigo, precio, precio_pack)
  values ('10000000-0000-0000-0000-000000000001', 'Día 1 - Puerto de Frutos', 'Tigre', 'TIGRE', 5000, 12000);
insert into public.clientes (id, album_id, codigo, orden) values
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'TIGRE-4892', 1),
  ('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'TIGRE-4893', 2);
insert into public.fotos (id, album_id, cliente_id, ruta_preview, ruta_alta, posicion) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a/p1.webp', 'a/o1.jpg', 1),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a/p2.webp', 'a/o2.jpg', 2),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a/p3.webp', 'a/o3.jpg', 3);
-- Pedido 1: dos fotos sueltas. Pedido 2: pack del mismo cliente.
insert into public.pedidos (id, cliente_id, tipo, pasarela, monto, moneda) values
  ('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'fotos', 'mercadopago', 10000, 'ARS'),
  ('30000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'pack', 'stripe', 12000, 'ARS');
insert into public.pedidos_fotos (pedido_id, foto_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002');

-- Restricciones.
select pruebas.espera_error(
  $$insert into public.clientes (album_id, codigo, orden) values ('10000000-0000-0000-0000-000000000001', 'tigre-1', 9)$$,
  'clientes_codigo_check');
select pruebas.espera_error(
  $$insert into public.clientes (album_id, codigo, orden) values ('10000000-0000-0000-0000-000000000001', 'TIGRE-9999', 1)$$,
  'clientes_album_id_orden_key');
select pruebas.espera_error(
  $$insert into public.fotos (album_id, cliente_id, ruta_preview, ruta_alta, posicion)
    values ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'x', 'y', 1)$$,
  'fotos_cliente_posicion_key');
select pruebas.espera_error($$update public.albumes set precio_pack = 0$$, 'albumes_precio_pack_check');
select 'ok formato';

-- ─── Público (anon) ──────────────────────────────────────────────────────────
set role anon;
select pruebas.espera_error('select * from public.fotos', 'permission denied');
select pruebas.espera_error('select * from public.clientes', 'permission denied');
select pruebas.espera_error('select * from public.pedidos', 'permission denied');
select pruebas.espera_error('select * from public.pedidos_fotos', 'permission denied');

select pruebas.afirmar((public.cliente_por_codigo(' tigre-4892 ') ->> 'codigo') = 'TIGRE-4892', 'cliente_por_codigo encuentra al cliente');
select pruebas.afirmar(json_array_length(public.cliente_por_codigo('TIGRE-4892') -> 'fotos') = 3, 'devuelve sus 3 fotos');
select pruebas.afirmar((public.cliente_por_codigo('TIGRE-4892') -> 'fotos' -> 0 ->> 'ruta_preview') = 'a/p1.webp', 'en orden de posición');
select pruebas.afirmar((public.cliente_por_codigo('TIGRE-4892') ->> 'precio_pack')::numeric = 12000, 'incluye precio del pack');
select pruebas.afirmar(position('o1.jpg' in public.cliente_por_codigo('TIGRE-4892')::text) = 0, 'nunca expone ruta_alta');
select pruebas.afirmar(json_array_length(public.cliente_por_codigo('TIGRE-4893') -> 'fotos') = 0, 'tarjeta libre: sin fotos');
select pruebas.afirmar(public.cliente_por_codigo('TIGRE-0000') is null, 'código inexistente: null');

select public.registrar_vista('TIGRE-4892');
select public.registrar_vista('TIGRE-4892');
select pruebas.espera_error($$select public.completar_pedido('30000000-0000-0000-0000-000000000001', 'x', 10000)$$, 'permission denied');
select pruebas.espera_error($$select public.ruta_descarga('TIGRE-4892', '20000000-0000-0000-0000-000000000001')$$, 'permission denied');
select pruebas.espera_error($$select * from public.cargar_foto_cliente('c0000000-0000-0000-0000-000000000001', 'x', 'y')$$, 'permission denied');
select pruebas.espera_error($$insert into storage.objects (bucket_id, name) values ('high-res-photos', 'x.jpg')$$, 'row-level security');
reset role;
select pruebas.afirmar((select vistas = 2 from public.clientes where codigo = 'TIGRE-4892'), 'registrar_vista suma vistas al cliente');
select 'ok anon';

-- ─── Usuario logueado que no es admin ────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pruebas.afirmar((select count(*) = 0 from public.clientes), 'un no admin no ve clientes');
select pruebas.afirmar((select count(*) = 0 from public.fotos), 'un no admin no ve fotos');
select pruebas.afirmar((select count(*) = 0 from public.pedidos), 'un no admin no ve pedidos');
select pruebas.afirmar((select count(*) = 0 from public.resumen_albumes()), 'un no admin no ve álbumes');
select pruebas.espera_error($$insert into public.albumes (titulo, prefijo_codigo) values ('x', 'XX')$$, 'row-level security');
select pruebas.espera_error($$select * from public.generar_codigos('10000000-0000-0000-0000-000000000001', 3)$$, 'Solo los administradores');
select pruebas.espera_error(
  $$select * from public.cargar_foto_cliente('c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001/o.jpg', '10000000-0000-0000-0000-000000000001/p.webp')$$,
  'Solo los administradores');
select pruebas.espera_error($$select public.metricas_panel()$$, 'Solo los administradores');
select pruebas.espera_error($$insert into storage.objects (bucket_id, name) values ('previews', 'x.webp')$$, 'row-level security');
reset role;
select 'ok no admin';

-- ─── Administrador ───────────────────────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pruebas.afirmar(public.es_admin(), 'es_admin() es true');
select pruebas.afirmar((select count(*) = 2 from public.clientes), 'el admin ve los clientes');

create temp table nuevos as select * from public.generar_codigos('10000000-0000-0000-0000-000000000001', 50);
select pruebas.afirmar((select count(distinct codigo) = 50 from nuevos), 'genera 50 códigos distintos');
select pruebas.afirmar((select bool_and(codigo ~ '^TIGRE-[2-9A-HJKMNP-Z]{6}$') from nuevos), 'formato PREFIJO + 6 sin ambiguos');
select pruebas.afirmar((select min(orden) = 3 and max(orden) = 52 from nuevos), 'numera las tarjetas a continuación');

-- Carga de fotos: van al final del cliente y validan la carpeta del álbum.
select pruebas.afirmar(
  (select posicion = 1 from public.cargar_foto_cliente('c0000000-0000-0000-0000-000000000002',
     '10000000-0000-0000-0000-000000000001/o4.jpg', '10000000-0000-0000-0000-000000000001/p4.webp')),
  'primera foto de un cliente: posición 1');
select pruebas.afirmar(
  (select posicion = 4 from public.cargar_foto_cliente('c0000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000001/o5.jpg', '10000000-0000-0000-0000-000000000001/p5.webp')),
  'se agrega al final');
select pruebas.espera_error(
  $$select * from public.cargar_foto_cliente('c0000000-0000-0000-0000-000000000002', 'otro/o.jpg', '10000000-0000-0000-0000-000000000001/p.webp')$$,
  'no corresponden al álbum');
select pruebas.espera_error(
  $$select * from public.cargar_foto_cliente('c0000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001/o.jpg', '10000000-0000-0000-0000-000000000001/p.webp')$$,
  'no existe');

insert into storage.objects (bucket_id, name) values ('high-res-photos', 'b/o2.jpg'), ('previews', 'b/p2.webp');
select pruebas.afirmar((select count(*) = 2 from storage.objects), 'el admin sube y ve archivos');

select pruebas.afirmar(
  (select (public.metricas_panel() ->> 'clientes')::int = 52 and (public.metricas_panel() ->> 'fotos')::int = 5
      and (public.metricas_panel() ->> 'clientes_con_fotos')::int = 2 and (public.metricas_panel() ->> 'vistas')::int = 2),
  'métricas');
select pruebas.afirmar(
  (select clientes = 52 and clientes_con_fotos = 2 and fotos = 5 and vendidas = 0 and precio_pack = 12000
     from public.resumen_albumes() where id = '10000000-0000-0000-0000-000000000001'),
  'resumen de álbumes');

-- Solo hay política de lectura en pedidos: el admin no puede marcarlos pagos a mano.
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
  public.completar_pedido('30000000-0000-0000-0000-000000000001', 'mp-1', 10000) = 'c0000000-0000-0000-0000-000000000001',
  'pedido de fotos sueltas: devuelve el cliente');
select pruebas.afirmar(
  public.completar_pedido('30000000-0000-0000-0000-000000000001', 'mp-1', 10000) = 'c0000000-0000-0000-0000-000000000001',
  'completar_pedido es idempotente');
reset role;
select pruebas.afirmar(
  (select array_agg(posicion order by posicion) = array[1, 2] from public.fotos
    where cliente_id = 'c0000000-0000-0000-0000-000000000001' and vendida),
  'fotos sueltas: solo las elegidas quedan vendidas');

set role service_role;
select pruebas.afirmar(public.ruta_descarga('tigre-4892', '20000000-0000-0000-0000-000000000001') = 'a/o1.jpg', 'descarga de una foto paga');
select pruebas.afirmar(public.ruta_descarga('TIGRE-4892', '20000000-0000-0000-0000-000000000003') is null, 'foto sin pagar: no hay descarga');
select pruebas.afirmar(public.ruta_descarga('TIGRE-4893', '20000000-0000-0000-0000-000000000001') is null, 'foto de otro cliente: no hay descarga');
select public.completar_pedido('30000000-0000-0000-0000-000000000002', 'st-1', 12000);
reset role;
select pruebas.afirmar(
  (select bool_and(vendida) and count(*) = 4 from public.fotos where cliente_id = 'c0000000-0000-0000-0000-000000000001'),
  'pack: todas las fotos del cliente quedan vendidas');
select pruebas.afirmar(
  (select bool_and((f ->> 'vendida')::boolean) from json_array_elements(public.cliente_por_codigo('TIGRE-4892') -> 'fotos') f),
  'el cliente ve sus fotos como vendidas');

-- El mismo pago no puede acreditar otro pedido de la misma pasarela.
insert into public.pedidos (id, cliente_id, tipo, pasarela, monto, moneda)
  values ('30000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'pack', 'mercadopago', 12000, 'ARS');
set role service_role;
select pruebas.espera_error(
  $$select public.completar_pedido('30000000-0000-0000-0000-000000000003', 'mp-1', 12000)$$, 'pedidos_pasarela_id_pago_key');
reset role;
select 'ok pagos';

-- No se puede borrar un cliente (ni su álbum) con pedidos.
select pruebas.espera_error($$delete from public.albumes where id = '10000000-0000-0000-0000-000000000001'$$, 'violates foreign key');
select 'ok integridad';
