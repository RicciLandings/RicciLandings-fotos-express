-- Endurecer la API pública (PostgREST).
-- 1) Permisos que la app no usa (TRUNCATE además saltea RLS).
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- 2) La API no describe el esquema (OpenAPI) a ninguna clave. supabase-js no lo necesita.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    alter role authenticator set pgrst.openapi_mode to 'disabled';
  end if;
end $$;
notify pgrst, 'reload config';
