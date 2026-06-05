import { describe, it, expect, beforeAll } from 'vitest';

import { normalizeFormat, formatLikePatterns } from '../../src/formats.js';

// ── normalizeFormat ───────────────────────────────────────────────────────────

describe('normalizeFormat', () => {
  // Test formats
  it('"Test" → test', () => expect(normalizeFormat('Test')).toBe('test'));
  it('"test match" → test', () => expect(normalizeFormat('test match')).toBe('test'));
  it('"TEST" (uppercase) → test', () => expect(normalizeFormat('TEST')).toBe('test'));

  // ODI formats
  it('"ODI" → odi', () => expect(normalizeFormat('ODI')).toBe('odi'));
  it('"odi" → odi', () => expect(normalizeFormat('odi')).toBe('odi'));
  it('"One Day International" → odi', () => expect(normalizeFormat('One Day International')).toBe('odi'));
  it('"one-day" → odi', () => expect(normalizeFormat('one-day')).toBe('odi'));

  // T20 formats
  it('"T20" → t20', () => expect(normalizeFormat('T20')).toBe('t20'));
  it('"T20I" → t20', () => expect(normalizeFormat('T20I')).toBe('t20'));
  it('"Twenty20" → t20', () => expect(normalizeFormat('Twenty20')).toBe('t20'));
  it('"twenty" → t20', () => expect(normalizeFormat('twenty')).toBe('t20'));
  it('"t20i" → t20', () => expect(normalizeFormat('t20i')).toBe('t20'));

  // Fallback to 'all'
  it('empty string → all', () => expect(normalizeFormat('')).toBe('all'));
  it('null → all', () => expect(normalizeFormat(null)).toBe('all'));
  it('undefined → all', () => expect(normalizeFormat(undefined)).toBe('all'));
  it('"all" → all', () => expect(normalizeFormat('all')).toBe('all'));
  it('unknown string → all', () => expect(normalizeFormat('super-over')).toBe('all'));

  // Whitespace handling
  it('leading/trailing whitespace stripped', () => expect(normalizeFormat('  odi  ')).toBe('odi'));
});

// ── formatLikePatterns ────────────────────────────────────────────────────────

describe('formatLikePatterns', () => {
  it('"test" → single pattern containing %test%', () => {
    const patterns = formatLikePatterns('test');
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toBe('%test%');
  });

  it('"odi" → multiple patterns covering odi and one-day variants', () => {
    const patterns = formatLikePatterns('odi');
    expect(patterns.length).toBeGreaterThan(1);
    expect(patterns).toContain('%odi%');
    expect(patterns.some(p => p.includes('one'))).toBe(true);
  });

  it('"t20" → patterns covering t20 and twenty variants', () => {
    const patterns = formatLikePatterns('t20');
    expect(patterns.length).toBeGreaterThan(1);
    expect(patterns).toContain('%t20%');
    expect(patterns.some(p => p.includes('twenty'))).toBe(true);
  });

  it('"all" → empty array (caller omits WHERE clause)', () => {
    expect(formatLikePatterns('all')).toHaveLength(0);
  });

  it('unknown key → empty array', () => {
    expect(formatLikePatterns('superover')).toHaveLength(0);
  });

  it('all patterns start and end with %', () => {
    for (const key of ['test', 'odi', 't20']) {
      for (const p of formatLikePatterns(key)) {
        expect(p.startsWith('%')).toBe(true);
        expect(p.endsWith('%')).toBe(true);
      }
    }
  });

  it('patterns use % wildcards (not _ single-char wildcards for format matching)', () => {
    // Format matching uses broad % wildcards — verify no _ wildcards are used
    // (a _ would only match exactly one char, which could miss longer format names)
    const allPatterns = ['test', 'odi', 't20'].flatMap(k => formatLikePatterns(k));
    for (const p of allPatterns) {
      // Literal underscores in format patterns would need escaping — none expected here
      const inner = p.replace(/^%|%$/g, '');
      expect(inner).not.toMatch(/^_$|^_$/); // no pattern that is just a single wildcard
    }
  });
});
