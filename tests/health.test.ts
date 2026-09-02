import { describe, expect, it } from 'vitest';
import { GET, HEAD } from '@/app/api/health/route';

describe('health endpoint', () => {
  it('provides a non-cacheable liveness signal', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'snickerdoodle' });
  });

  it('supports lightweight HEAD probes', () => {
    const response = HEAD();

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });
});
