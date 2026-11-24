import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firmarLecturaR2, firmarSubidaR2, r2Activo } from '@/lib/r2';

const VARS = { R2_ACCOUNT_ID: 'cuenta', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secreto', R2_BUCKET: 'fotear-originales' };

describe('r2', () => {
  beforeEach(() => Object.assign(process.env, VARS));
  afterEach(() => Object.keys(VARS).forEach((k) => delete process.env[k]));

  it('se activa solo con las 4 variables', () => {
    expect(r2Activo()).toBe(true);
    delete process.env.R2_BUCKET;
    expect(r2Activo()).toBe(false);
  });

  it('firma subida y descarga con vencimiento', async () => {
    const subida = new URL(await firmarSubidaR2('a/r2-b.jpg', 'image/jpeg'));
    expect(subida.host).toBe('cuenta.r2.cloudflarestorage.com');
    expect(subida.pathname).toBe('/fotear-originales/a/r2-b.jpg');
    expect(subida.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(subida.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    const bajada = new URL(await firmarLecturaR2('a/r2-b.jpg', 900, 'foto-1.jpg'));
    expect(bajada.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(bajada.searchParams.get('response-content-disposition')).toContain('foto-1.jpg');
  });
});
