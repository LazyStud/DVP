import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Set up globals that src/db.js reads at module init time (location) and call time (initSqlJs).
globalThis.location = globalThis.location ?? { search: '' };

import { DB } from '../../src/db.js';

// Minimal sql.js mock — rows controls what step()+getAsObject() returns
function makeSqlMock(rows = []) {
  return {
    Database: class {
      constructor() {}
      prepare() {
        let i = 0;
        return {
          bind:        vi.fn(),
          step:        vi.fn().mockImplementation(() => i < rows.length ? (i++, true) : false),
          getAsObject: vi.fn().mockImplementation(() => rows[i - 1] ?? {}),
          free:        vi.fn(),
        };
      }
    },
  };
}

describe('src/db.js — DB API', () => {
  beforeEach(() => {
    DB._resetForTest();
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock()));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:          true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));
  });

  afterEach(async () => {
    try { await DB.clearCache(''); } catch (_) { /* empty */ }
    vi.unstubAllGlobals();
    DB._resetForTest();
  });

  it('exposes DB with the correct API shape', () => {
    expect(typeof DB).toBe('object');
    expect(typeof DB.init).toBe('function');
    expect(typeof DB.queryAll).toBe('function');
    expect(typeof DB.clearCache).toBe('function');
  });

  it('queryAll throws "DB not initialized" before init', () => {
    expect(() => DB.queryAll('SELECT 1')).toThrow('DB not initialized');
  });

  it('init fetches from URL when IDB cache is empty', async () => {
    await DB.init('./fake.db', { version: 'v-fetch' });
    expect(globalThis.fetch).toHaveBeenCalledWith('./fake.db', expect.objectContaining({ cache: 'no-cache' }));
  });

  it('init uses IDB cache on second call with the same version', async () => {
    // First call: cache miss → fetches and stores in IDB
    await DB.init('./fake.db', { version: 'v-cachehit' });
    expect(globalThis.fetch).toHaveBeenCalledOnce();

    // Second call: cache hit → no fetch
    DB._resetForTest();
    vi.clearAllMocks();
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock()));
    vi.stubGlobal('fetch',     vi.fn());
    await DB.init('./fake.db', { version: 'v-cachehit' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('init throws if all provided URLs fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    await expect(
      DB.init(['./bad1.db', './bad2.db'], { version: 'v-allfail' })
    ).rejects.toThrow('Failed to load DB from all sources');
  });

  it('init throws when the server returns a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(
      DB.init('./missing.db', { version: 'v-404' })
    ).rejects.toThrow();
  });

  it('clearCache removes keys matching the given prefix', async () => {
    await DB.init('./fake.db', { version: 'v-clear' });

    // Confirm cache hit exists
    DB._resetForTest();
    vi.clearAllMocks();
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock()));
    vi.stubGlobal('fetch',     vi.fn());
    await DB.init('./fake.db', { version: 'v-clear' });
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Clear it
    await DB.clearCache('cricket.db::v-clear');

    // Should fetch again now
    DB._resetForTest();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:          true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock()));
    await DB.init('./fake.db', { version: 'v-clear' });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('queryAll returns rows from a prepared statement after init', async () => {
    const mockRows = [{ country: 'India', matches: 42 }];
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock(mockRows)));
    await DB.init('./fake.db', { version: 'v-queryrows' });
    const result = DB.queryAll('SELECT * FROM matches');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ country: 'India', matches: 42 });
  });
});
