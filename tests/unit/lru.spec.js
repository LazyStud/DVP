import { describe, it, expect } from 'vitest';
import { LRU, cacheKey } from '../../src/data/lru.js';

describe('LRU', () => {
  it('starts empty', () => {
    const c = new LRU(3);
    expect(c.size).toBe(0);
  });

  it('get returns undefined for a missing key', () => {
    const c = new LRU(3);
    expect(c.get('x')).toBeUndefined();
  });

  it('set and get a single entry', () => {
    const c = new LRU(3);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.size).toBe(1);
  });

  it('set overwrites an existing key without growing the cache', () => {
    const c = new LRU(3);
    c.set('a', 1);
    c.set('a', 99);
    expect(c.get('a')).toBe(99);
    expect(c.size).toBe(1);
  });

  it('evicts the least-recently-used entry when capacity is reached', () => {
    const c = new LRU(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3); // 'a' should be evicted
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  it('get promotes an entry so it is not evicted next', () => {
    const c = new LRU(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');     // promote 'a' → 'b' is now LRU
    c.set('c', 3); // 'b' should be evicted, not 'a'
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('c')).toBe(3);
  });

  it('clear empties the cache', () => {
    const c = new LRU(3);
    c.set('a', 1);
    c.set('b', 2);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get('a')).toBeUndefined();
  });
});

describe('cacheKey', () => {
  it('formats min and max as "min|max"', () => {
    expect(cacheKey(2000, 2025)).toBe('2000|2025');
    expect(cacheKey(2010, 2010)).toBe('2010|2010');
  });
});
