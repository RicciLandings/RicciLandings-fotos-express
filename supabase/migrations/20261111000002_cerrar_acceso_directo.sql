-- La galería ya no se puede consultar directo con la clave pública: solo por abrir_galeria()
-- desde el servidor (con límite de intentos). Aplicar DESPUÉS de publicar el código que la usa.
drop function if exists public.cliente_por_codigo(text);
drop function if exists public.registrar_vista(text);
