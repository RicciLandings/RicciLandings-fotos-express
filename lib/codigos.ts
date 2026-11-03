// Códigos de las tarjetas: PREFIJO-SUFIJO, por ejemplo TIGRE-4892.
// El mismo patrón está como CHECK en supabase/migrations (tabla fotos).

export const PATRON_CODIGO = /^[A-Z0-9]{2,12}-[A-Z0-9]{4,8}$/;

/**
 * Lleva lo que tipea el cliente al formato canónico:
 * " tigre 4892 " → "TIGRE-4892", "tigre_4892" → "TIGRE-4892", "TIGRE4892" → "TIGRE-4892".
 */
export function normalizarCodigo(entrada: string): string {
  const limpio = entrada
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Sin separador: letras seguidas de números ("TIGRE4892").
  const pegado = /^([A-Z]{2,12})(\d{4,8})$/.exec(limpio);
  return pegado ? `${pegado[1]}-${pegado[2]}` : limpio;
}

export function codigoValido(codigo: string): boolean {
  return PATRON_CODIGO.test(codigo);
}

/**
 * Saca el código del contenido de un QR. Acepta una URL del sitio (…/f/TIGRE-4892) o el código solo.
 * Nunca navega a la URL leída: devuelve el código o null.
 */
export function codigoDesdeQR(texto: string): string | null {
  const valor = texto.trim();
  let candidato = valor;
  try {
    const url = new URL(valor);
    const partes = url.pathname.split('/').filter(Boolean);
    const indice = partes.findIndex((p) => p === 'f' || p === 'foto');
    if (indice === -1 || !partes[indice + 1]) return null;
    candidato = decodeURIComponent(partes[indice + 1]);
  } catch {
    // No es una URL: se toma como código.
  }
  const codigo = normalizarCodigo(candidato);
  return codigoValido(codigo) ? codigo : null;
}
