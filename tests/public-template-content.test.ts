import { describe, expect, it } from 'vitest';
import { publicSampleKits } from '@/lib/sample-kits';

function collectCopy(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectCopy);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectCopy);
  return [];
}

describe('public campaign template content', () => {
  it('contains no unfinished bracket tokens or placeholder copy', () => {
    const publicCopy = collectCopy(publicSampleKits).join('\n');

    expect(publicCopy).not.toMatch(/\[[^\]]+\]/);
    expect(publicCopy).not.toMatch(/\bplaceholder\b/i);
  });

  it('keeps every example explicitly fictional with a separate verification checklist', () => {
    for (const kit of publicSampleKits) {
      expect(`${kit.eyebrow} ${kit.summary}`).toMatch(/fictional/i);
      expect(kit.usageNotes.length).toBeGreaterThan(0);
      expect(kit.usageNotes.join(' ')).toMatch(/before use|verified|approved/i);
    }
  });
});
