# Fotos Express: notas para trabajar en este repo

- Idioma: español rioplatense en UI, tablas, columnas, funciones, variables y comentarios. Excepción: nombres de buckets (`previews`, `high-res-photos`) y archivos pedidos por el spec (`lib/supabase/client.ts`, etc.).
- Base de datos: las reglas de negocio van en funciones SQL (`supabase/migrations`), no en el cliente. Migración nueva = archivo nuevo con fecha; nunca editar una ya aplicada en producción. Si cambiás el esquema, actualizá `lib/tipos.ts`.
- Seguridad: la ruta del original (`ruta_alta`) nunca llega al navegador. El original solo se baja con `firmarDescarga()` (`lib/supabase/admin.ts`) después de verificar en la base que la foto está paga.
- El patrón de códigos vive en `lib/codigos.ts` y en el CHECK de `fotos.codigo`: si cambia uno, cambiá el otro.
- Mobile-first y liviano (3G/4G): páginas estáticas o de servidor, JS de cliente solo donde hace falta, carga diferida para lo pesado (cámara, uploader).
- Antes de subir: `npm run lint && npm run typecheck && npm test && npm run build`.
