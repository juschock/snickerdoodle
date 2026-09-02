import { describe, expect, it } from 'vitest';
import { readPublicSupabaseConfig } from '@/lib/supabase-manager';

function legacyKey(role: 'anon' | 'service_role') {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'supabase', role })}.synthetic-signature`;
}

describe('public Supabase manager configuration', () => {
  it('accepts only origin-only URLs paired with a recognized publishable or legacy anon key', () => {
    const publishable = 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789';
    expect(readPublicSupabaseConfig('https://project.supabase.co', publishable)).toEqual({
      url: 'https://project.supabase.co',
      anonKey: publishable
    });
    expect(readPublicSupabaseConfig('http://127.0.0.1:54321', legacyKey('anon'))).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: legacyKey('anon')
    });
  });

  it.each([
    ['new secret key', 'https://project.supabase.co', 'sb_secret_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['legacy service role', 'https://project.supabase.co', legacyKey('service_role')],
    ['unrecognized long key', 'https://project.supabase.co', 'not-a-recognized-public-supabase-key'],
    ['credential URL', 'https://operator:secret@project.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz'],
    ['path URL', 'https://project.supabase.co/auth/v1', 'sb_publishable_abcdefghijklmnopqrstuvwxyz'],
    ['query URL', 'https://project.supabase.co?redirect=attacker', 'sb_publishable_abcdefghijklmnopqrstuvwxyz'],
    ['non-loopback HTTP', 'http://project.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz']
  ])('rejects %s before client serialization', (_label, url, key) => {
    expect(readPublicSupabaseConfig(url, key)).toBeNull();
  });

  it('keeps the manager server page behind the validated public-config projection', async () => {
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync('app/manager/queue/page.tsx', 'utf8')
    );
    expect(source).toContain('readPublicSupabaseConfig(');
    expect(source).toContain('supabaseUrl={publicConfig?.url ?? null}');
    expect(source).toContain('supabaseAnonKey={publicConfig?.anonKey ?? null}');
    expect(source).not.toContain('supabaseAnonKey={process.env');
  });
});
