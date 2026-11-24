import { describe, expect, it } from 'vitest';
import { esRutaR2, rutaOriginal } from '@/lib/almacen';

const A = '11111111-1111-1111-1111-111111111111';
const F = '22222222-2222-2222-2222-222222222222';

describe('almacen', () => {
  it('arma rutas de Supabase y de R2', () => {
    expect(rutaOriginal(A, 'jpg', false, F)).toBe(`${A}/${F}.jpg`);
    expect(rutaOriginal(A, 'jpg', true, F)).toBe(`${A}/r2-${F}.jpg`);
  });
  it('reconoce dónde está cada original', () => {
    expect(esRutaR2(`${A}/r2-${F}.jpg`)).toBe(true);
    expect(esRutaR2(`${A}/${F}.jpg`)).toBe(false);
  });
});
