import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';

describe('public detritus hardening', () => {
  it('publishes the exact four analytics privacy promises without configuration notes', () => {
    const privacy = readFileSync('app/privacy/page.tsx', 'utf8');

    for (const promise of [
      'Analytics are disabled by default.',
      'Analytics are never collected on the private campaign survey or payment receipt pages.',
      'When analytics are enabled on public pages, recorded events exclude URL query strings and fragments.',
      'Privacy-safe operational error information may be recorded to help keep Snickerdoodle reliable.'
    ]) {
      expect(privacy).toContain(promise);
    }
    expect(privacy).not.toContain('If Racoben explicitly enables it later');
  });

  it('keeps public discovery while excluding private, return, manager, and API surfaces', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = Array.isArray(rules?.disallow) ? rules.disallow : [rules?.disallow];

    expect(rules?.allow).toBe('/');
    expect(disallow).toEqual(expect.arrayContaining([
      '/snickerdoodle/brief',
      '/snickerdoodle/checkout',
      '/snickerdoodle/manager',
      '/snickerdoodle/api'
    ]));
    expect(disallow).not.toContain('/snickerdoodle');
  });
});
