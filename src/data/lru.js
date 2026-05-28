/* Tiny LRU cache backed by a Map.  Exported for unit testing. */

export class LRU {
  #max;
  #map;
  constructor(max = 12) { this.#max = max; this.#map = new Map(); }
  get(key) {
    if (!this.#map.has(key)) return undefined;
    const v = this.#map.get(key);
    this.#map.delete(key);
    this.#map.set(key, v);
    return v;
  }
  set(key, value) {
    if (this.#map.has(key)) this.#map.delete(key);
    else if (this.#map.size >= this.#max) {
      const oldest = this.#map.keys().next().value;
      this.#map.delete(oldest);
    }
    this.#map.set(key, value);
  }
  clear() { this.#map.clear(); }
  get size() { return this.#map.size; }
}

export function cacheKey(yearMin, yearMax) { return `${yearMin}|${yearMax}`; }