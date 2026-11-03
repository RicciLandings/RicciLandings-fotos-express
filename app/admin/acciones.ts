'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sesionAdmin } from '@/lib/admin';
import { supabaseServidor } from '@/lib/supabase/server';

export type EstadoFormulario = { error?: string; ok?: string } | null;

const SIN_PERMISO: EstadoFormulario = { error: 'Tu usuario no tiene permiso de administrador.' };

// ─── Sesión ──────────────────────────────────────────────────────────────────

const esquemaIngreso = z.object({
  email: z.string().trim().email(),
  clave: z.string().min(1),
});

export async function ingresar(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const r = esquemaIngreso.safeParse({ email: datos.get('email'), clave: datos.get('clave') });
  if (!r.success) return { error: 'Completá el email y la contraseña.' };

  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: r.data.email, password: r.data.clave });
  if (error) return { error: 'Email o contraseña incorrectos.' };
  redirect('/admin/dashboard');
}

export async function salir() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

// ─── Álbumes ─────────────────────────────────────────────────────────────────

const esquemaAlbum = z.object({
  titulo: z.string().trim().min(1, 'Poné un título.').max(120),
  ubicacion: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null),
  prefijo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,12}$/, 'El prefijo va de 2 a 12 letras o números, sin espacios (ej. TIGRE).'),
  precio: z.coerce.number({ invalid_type_error: 'Poné un precio.' }).positive('El precio tiene que ser mayor a 0.').max(99_999_999),
});

export async function crearAlbum(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const r = esquemaAlbum.safeParse({
    titulo: datos.get('titulo') ?? '',
    ubicacion: datos.get('ubicacion') ?? '',
    prefijo: datos.get('prefijo') ?? '',
    precio: datos.get('precio') || undefined,
  });
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Revisá los datos.' };

  const { supabase, esAdmin } = await sesionAdmin();
  if (!esAdmin) return SIN_PERMISO;

  const { data, error } = await supabase
    .from('albumes')
    .insert({ titulo: r.data.titulo, ubicacion: r.data.ubicacion, prefijo_codigo: r.data.prefijo, precio: r.data.precio })
    .select('id')
    .single();
  if (error || !data) return { error: 'No se pudo crear el álbum. Probá de nuevo.' };

  revalidatePath('/admin/dashboard');
  redirect(`/admin/albumes/${data.id}`);
}

// ─── Códigos ─────────────────────────────────────────────────────────────────

const esquemaCodigos = z.object({
  albumId: z.string().uuid(),
  cantidad: z.coerce.number().int().min(1, 'Mínimo 1.').max(500, 'Máximo 500 por vez.'),
});

export async function generarCodigos(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const r = esquemaCodigos.safeParse({ albumId: datos.get('albumId'), cantidad: datos.get('cantidad') });
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Revisá la cantidad.' };

  const { supabase, esAdmin } = await sesionAdmin();
  if (!esAdmin) return SIN_PERMISO;

  const { data, error } = await supabase.rpc('generar_codigos', {
    p_album_id: r.data.albumId,
    p_cantidad: r.data.cantidad,
  });
  if (error) return { error: 'No se pudieron generar los códigos. Probá de nuevo.' };

  revalidatePath(`/admin/albumes/${r.data.albumId}`);
  const cantidad = Array.isArray(data) ? data.length : r.data.cantidad;
  return { ok: cantidad === 1 ? 'Se generó 1 código.' : `Se generaron ${cantidad} códigos.` };
}
