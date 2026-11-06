// Reparte las fotos del día entre los clientes leyendo las fotos de tarjeta.
// Regla: una foto con el QR de una tarjeta del álbum abre ese cliente; las fotos siguientes son suyas
// hasta la próxima tarjeta. Las fotos de tarjeta no se venden (no se suben).

export interface FotoAnalizada {
  clave: string;
  /** Código leído del QR (ya normalizado), o null si la foto no tiene QR. */
  codigoQR: string | null;
}

export interface Tarjeta {
  id: string;
  codigo: string;
  orden: number;
}

export interface Grupo {
  /** id del cliente, o "sin-N" para un tramo sin tarjeta. */
  id: string;
  clienteId: string | null;
  /** Fotos para subir, en orden. */
  fotos: string[];
  /** Fotos de la tarjeta (no se suben). */
  tarjetas: string[];
  /** Código leído que no es de este álbum (el tramo queda sin asignar). */
  codigoAjeno?: string;
}

export function agruparPorTarjeta(fotos: FotoAnalizada[], tarjetas: Tarjeta[]): Grupo[] {
  const porCodigo = new Map(tarjetas.map((t) => [t.codigo, t]));
  const grupos: Grupo[] = [];
  const porCliente = new Map<string, Grupo>();
  let actual: Grupo | null = null;
  let sinTarjeta = 0;

  const abrirSinTarjeta = (codigoAjeno?: string): Grupo => {
    const grupo: Grupo = { id: `sin-${++sinTarjeta}`, clienteId: null, fotos: [], tarjetas: [], codigoAjeno };
    grupos.push(grupo);
    return grupo;
  };

  for (const foto of fotos) {
    if (foto.codigoQR) {
      const tarjeta = porCodigo.get(foto.codigoQR);
      if (tarjeta) {
        // Si el cliente vuelve más tarde (otra foto de su tarjeta), se suma a su mismo grupo.
        let grupo = porCliente.get(tarjeta.id);
        if (!grupo) {
          grupo = { id: tarjeta.id, clienteId: tarjeta.id, fotos: [], tarjetas: [] };
          porCliente.set(tarjeta.id, grupo);
          grupos.push(grupo);
        }
        grupo.tarjetas.push(foto.clave);
        actual = grupo;
      } else {
        // QR de otra cosa (otro álbum, un cartel…): corta el tramo para no mezclar clientes.
        actual = abrirSinTarjeta(foto.codigoQR);
        actual.tarjetas.push(foto.clave);
      }
      continue;
    }
    if (!actual) actual = abrirSinTarjeta();
    actual.fotos.push(foto.clave);
  }

  // Los tramos sin tarjeta que quedaron vacíos no sirven.
  return grupos.filter((g) => g.clienteId || g.fotos.length > 0);
}

/** Orden natural por nombre (IMG_2 antes que IMG_10). */
export function ordenarPorNombre<T extends { name: string }>(archivos: T[]): T[] {
  return [...archivos].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
