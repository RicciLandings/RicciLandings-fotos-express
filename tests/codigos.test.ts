import { describe, expect, it } from 'vitest';
import { codigoDesdeQR, codigoValido, normalizarCodigo } from '@/lib/codigos';

describe('normalizarCodigo', () => {
  it.each([
    ['TIGRE-4892', 'TIGRE-4892'],
    [' tigre 4892 ', 'TIGRE-4892'],
    ['tigre_4892', 'TIGRE-4892'],
    ['TIGRE4892', 'TIGRE-4892'],
    ['tígre--4892', 'TIGRE-4892'],
    ['ev1-ab12cd', 'EV1-AB12CD'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarCodigo(entrada)).toBe(esperado);
  });
});

describe('codigoValido', () => {
  it('acepta el formato PREFIJO-SUFIJO', () => {
    expect(codigoValido('TIGRE-4892')).toBe(true);
    expect(codigoValido('AB-12CD34EF')).toBe(true);
  });

  it('rechaza formatos raros', () => {
    for (const malo of ['', 'TIGRE', 'T-4892', 'TIGRE-48', 'TIGRE-4892-1', 'tigre-4892', 'TIGRE-123456789']) {
      expect(codigoValido(malo)).toBe(false);
    }
  });
});

describe('codigoDesdeQR', () => {
  it('lee la URL del sitio', () => {
    expect(codigoDesdeQR('https://fotos.example.com/f/TIGRE-4892')).toBe('TIGRE-4892');
    expect(codigoDesdeQR('https://fotos.example.com/foto/tigre-4892?x=1')).toBe('TIGRE-4892');
  });

  it('acepta el código solo', () => {
    expect(codigoDesdeQR('tigre 4892')).toBe('TIGRE-4892');
  });

  it('descarta URLs que no son de una foto', () => {
    expect(codigoDesdeQR('https://otro.com/login')).toBeNull();
    expect(codigoDesdeQR('hola')).toBeNull();
  });
});
