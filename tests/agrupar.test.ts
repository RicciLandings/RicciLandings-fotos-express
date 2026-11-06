import { describe, expect, it } from 'vitest';
import { agruparPorTarjeta, ordenarPorNombre } from '@/lib/agrupar';
import { cotizar, packDisponible } from '@/lib/precios';

const tarjetas = [
  { id: 'c1', codigo: 'TIGRE-AAAAAA', orden: 1 },
  { id: 'c2', codigo: 'TIGRE-BBBBBB', orden: 2 },
];
const f = (clave: string, codigoQR: string | null = null) => ({ clave, codigoQR });

describe('agruparPorTarjeta', () => {
  it('cada tarjeta abre un cliente y las fotos siguientes son suyas', () => {
    const grupos = agruparPorTarjeta(
      [f('t1', 'TIGRE-AAAAAA'), f('a'), f('b'), f('t2', 'TIGRE-BBBBBB'), f('c')],
      tarjetas,
    );
    expect(grupos).toEqual([
      { id: 'c1', clienteId: 'c1', fotos: ['a', 'b'], tarjetas: ['t1'] },
      { id: 'c2', clienteId: 'c2', fotos: ['c'], tarjetas: ['t2'] },
    ]);
  });

  it('las fotos antes de la primera tarjeta quedan sin asignar', () => {
    const grupos = agruparPorTarjeta([f('x'), f('t1', 'TIGRE-AAAAAA'), f('a')], tarjetas);
    expect(grupos[0]).toMatchObject({ id: 'sin-1', clienteId: null, fotos: ['x'] });
    expect(grupos[1]).toMatchObject({ clienteId: 'c1', fotos: ['a'] });
  });

  it('dos fotos seguidas de la misma tarjeta no crean grupos vacíos', () => {
    const grupos = agruparPorTarjeta([f('t1', 'TIGRE-AAAAAA'), f('t1b', 'TIGRE-AAAAAA'), f('a')], tarjetas);
    expect(grupos).toEqual([{ id: 'c1', clienteId: 'c1', fotos: ['a'], tarjetas: ['t1', 't1b'] }]);
  });

  it('si el cliente vuelve más tarde, se suma a su grupo', () => {
    const grupos = agruparPorTarjeta(
      [f('t1', 'TIGRE-AAAAAA'), f('a'), f('t2', 'TIGRE-BBBBBB'), f('b'), f('t1x', 'TIGRE-AAAAAA'), f('c')],
      tarjetas,
    );
    expect(grupos.find((g) => g.clienteId === 'c1')?.fotos).toEqual(['a', 'c']);
    expect(grupos).toHaveLength(2);
  });

  it('un QR ajeno corta el tramo para no mezclar clientes', () => {
    const grupos = agruparPorTarjeta([f('t1', 'TIGRE-AAAAAA'), f('a'), f('q', 'OTRO-ZZZZZZ'), f('b')], tarjetas);
    expect(grupos[0].fotos).toEqual(['a']);
    expect(grupos[1]).toMatchObject({ clienteId: null, fotos: ['b'], codigoAjeno: 'OTRO-ZZZZZZ' });
  });

  it('una tarjeta sin fotos igual aparece (para ver que se leyó)', () => {
    expect(agruparPorTarjeta([f('t1', 'TIGRE-AAAAAA')], tarjetas)).toHaveLength(1);
  });
});

describe('ordenarPorNombre', () => {
  it('orden natural', () => {
    const nombres = ordenarPorNombre([{ name: 'IMG_10.jpg' }, { name: 'IMG_2.jpg' }, { name: 'IMG_1.jpg' }]).map((a) => a.name);
    expect(nombres).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
  });
});

describe('cotizar', () => {
  const base = { precioFoto: 5000, precioPack: 12000, fotosSinVender: 4, fotosVendidas: 0 };

  it('fotos sueltas', () => {
    expect(cotizar({ ...base, seleccionadas: 2, pack: false })).toEqual({ tipo: 'fotos', cantidad: 2, monto: 10000, convienePack: false });
  });

  it('sugiere el pack cuando lo elegido cuesta igual o más', () => {
    expect(cotizar({ ...base, seleccionadas: 3, pack: false }).convienePack).toBe(true);
  });

  it('pack completo', () => {
    expect(cotizar({ ...base, seleccionadas: 0, pack: true })).toEqual({ tipo: 'pack', cantidad: 4, monto: 12000, convienePack: false });
  });

  it('sin pack si el álbum no tiene, si hay una sola foto o si ya compró alguna', () => {
    expect(packDisponible(null, 4, 0)).toBe(false);
    expect(packDisponible(12000, 1, 0)).toBe(false);
    expect(packDisponible(12000, 3, 1)).toBe(false);
    expect(cotizar({ ...base, precioPack: null, seleccionadas: 1, pack: true }).tipo).toBe('fotos');
  });
});
