/* Unit tests for T-3.7 insights feed.
 * pickFive is pure logic inlined here (same pattern as playerWindow.spec.js)
 * because importing insights.js would pull in debug.js → browser-only `location`.
 */
import { describe, it, expect } from 'vitest';

// Inlined from src/data/insights.js — keep in sync if the algorithm changes
function pickFive(pool) {
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(5, arr.length));
}

// ── pickFive ─────────────────────────────────────────────────────────────────

describe('pickFive', () => {
  it('returns exactly 5 items when pool is larger', () => {
    const pool = Array.from({ length: 20 }, (_, i) => ({ text: `fact ${i}`, category: 'home' }));
    expect(pickFive(pool)).toHaveLength(5);
  });

  it('returns all items when pool has fewer than 5', () => {
    const pool = [
      { text: 'a', category: 'batting' },
      { text: 'b', category: 'bowling' },
    ];
    expect(pickFive(pool)).toHaveLength(2);
  });

  it('returns exactly 5 when pool has exactly 5', () => {
    const pool = Array.from({ length: 5 }, (_, i) => ({ text: `f${i}`, category: 'venue' }));
    expect(pickFive(pool)).toHaveLength(5);
  });

  it('returns empty array for empty pool', () => {
    expect(pickFive([])).toEqual([]);
  });

  it('does not mutate the original pool', () => {
    const pool = Array.from({ length: 10 }, (_, i) => ({ text: `fact ${i}`, category: 'home' }));
    const snapshot = pool.map(x => ({ ...x }));
    pickFive(pool);
    expect(pool).toEqual(snapshot);
  });

  it('returned items are all drawn from the original pool', () => {
    const pool = Array.from({ length: 15 }, (_, i) => ({ text: `fact ${i}`, category: 'home' }));
    const result = pickFive(pool);
    for (const item of result) {
      expect(pool).toContainEqual(item);
    }
  });

  it('returns no duplicates', () => {
    const pool = Array.from({ length: 20 }, (_, i) => ({ text: `fact ${i}`, category: 'venue' }));
    const result = pickFive(pool);
    const texts = result.map(x => x.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('shuffles — repeated calls produce different orderings (probabilistic)', () => {
    // Pool of 20: chance of two identical 5-picks is negligible
    const pool = Array.from({ length: 20 }, (_, i) => ({ text: `fact ${i}`, category: 'format' }));
    const runs = Array.from({ length: 10 }, () => pickFive(pool).map(x => x.text).join(','));
    expect(new Set(runs).size).toBeGreaterThan(1);
  });
});
