import { describe, it, expect } from 'vitest';
import { LRU, cacheKey } from '../../src/data/lru.js';

// ── LRU cache behaviour ──────────────────────────────────────────────────────

describe('LRU cache', () => {
  it('returns undefined for a miss', () => {
    const cache = new LRU(5);
    expect(cache.get('a')).toBeUndefined();
  });

  it('returns the stored value on a hit', () => {
    const cache = new LRU(5);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('promotes to most-recently-used on access', () => {
    // Fill cache to capacity then access oldest to promote it
    const cache = new LRU(3);
    cache.set('a', 1); // [a]
    cache.set('b', 2); // [a, b]
    cache.set('c', 3); // [a, b, c] — full
    cache.get('a');     // promote 'a' → now [b, c, a]
    cache.set('d', 4);  // should evict 'b' (oldest), not 'a'
    expect(cache.get('a')).toBe(1); // 'a' survived
    expect(cache.get('b')).toBeUndefined(); // 'b' was evicted
    expect(cache.get('c')).toBe(3);  // 'c' survived with original value
    expect(cache.get('d')).toBe(4);  // 'd' is present
  });

  it('evicts the oldest entry when capacity is exceeded', () => {
    const cache = new LRU(2);
    cache.set('a', 1);
    cache.set('b', 2); // full
    cache.set('c', 3); // 'a' should be evicted
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('overwrites an existing key without evicting others', () => {
    const cache = new LRU(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('b', 99); // overwrite 'b'
    expect(cache.get('b')).toBe(99);
    expect(cache.size).toBe(3); // no eviction, same three keys
  });

  it('clear() empties the cache', () => {
    const cache = new LRU(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('size property reflects current entry count', () => {
    const cache = new LRU(5);
    expect(cache.size).toBe(0);
    cache.set('x', 10);
    expect(cache.size).toBe(1);
    cache.set('x', 20); // overwrite same key
    expect(cache.size).toBe(1);
    cache.set('y', 30);
    expect(cache.size).toBe(2);
  });

  it('different yearMin/yearMax produce different keys', () => {
    expect(cacheKey(2000, 2005)).toBe('2000|2005');
    expect(cacheKey(2006, 2010)).toBe('2006|2010');
  });

  it('handles the same year range hitting the cache', () => {
    const cache = new LRU(10);
    cache.set(cacheKey(2010, 2015), 'rows-x');
    // Second call via cacheKey — should hit, no eviction
    const hit = cache.get(cacheKey(2010, 2015));
    expect(hit).toBe('rows-x');
  });
});