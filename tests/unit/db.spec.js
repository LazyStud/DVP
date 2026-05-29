import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import 'fake-indexeddb/auto';

const DB_CODE = readFileSync(new URL('../../db.js', import.meta.url), 'utf8');

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

// Execute a fresh copy of the db.js IIFE and return the exposed DB object.
// Each call resets module-level state (_idb, db, SQL) because eval re-runs
// all declarations. The underlying fake-indexeddb data persists across calls.
//
// eval() is intentional here: db.js is a legacy IIFE (no ES export) read from
// the local filesystem at import time — not from user input or the network.
// This mimics how a browser executes it via a plain <script> tag.
function loadDB() {
  delete globalThis.DB;
  globalThis.window   = globalThis;
  globalThis.location = { search: '' };
  // eslint-disable-next-line no-eval
  eval(DB_CODE);
  return globalThis.DB;
}

describe('db.js — DB API', () => {
  beforeEach(() => {
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock()));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:          true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));
  });

  afterEach(async () => {
    // Purge all IDB entries so tests are isolated
    try {
      await loadDB().clearCache('');
    } catch (_) { /* empty */ }
    vi.unstubAllGlobals();
    delete globalThis.DB;
  });

  it('exposes DB on window after loading', () => {
    const DB = loadDB();
    expect(typeof DB).toBe('object');
    expect(typeof DB.init).toBe('function');
    expect(typeof DB.queryAll).toBe('function');
    expect(typeof DB.clearCache).toBe('function');
  });

  it('queryAll throws "DB not initialized" before init', () => {
    const DB = loadDB();
    expect(() => DB.queryAll('SELECT 1')).toThrow('DB not initialized');
  });

  it('init fetches from URL when IDB cache is empty', async () => {
    const DB = loadDB();
    await DB.init('./fake.db', { version: 'v-fetch' });
    expect(globalThis.fetch).toHaveBeenCalledWith('./fake.db', expect.objectContaining({ cache: 'no-cache' }));
  });

  it('init uses IDB cache on second call with the same version', async () => {
    // First call: cache miss → fetches and stores in IDB
    await loadDB().init('./fake.db', { version: 'v-cachehit' });
    expect(globalThis.fetch).toHaveBeenCalledOnce();

    // Second call: cache hit → no fetch
    vi.clearAllMocks();
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock()));
    vi.stubGlobal('fetch',     vi.fn());
    await loadDB().init('./fake.db', { version: 'v-cachehit' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('init throws if all provided URLs fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    await expect(
      loadDB().init(['./bad1.db', './bad2.db'], { version: 'v-allfail' })
    ).rejects.toThrow('Failed to load DB from all sources');
  });

  it('init throws when the server returns a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(
      loadDB().init('./missing.db', { version: 'v-404' })
    ).rejects.toThrow();
  });

  it('clearCache removes keys matching the given prefix', async () => {
    // Populate cache
    await loadDB().init('./fake.db', { version: 'v-clear' });

    // Confirm cache hit exists
    vi.clearAllMocks();
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock()));
    vi.stubGlobal('fetch',     vi.fn());
    await loadDB().init('./fake.db', { version: 'v-clear' });
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Clear it
    await loadDB().clearCache('cricket.db::v-clear');

    // Should fetch again now
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:          true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock()));
    await loadDB().init('./fake.db', { version: 'v-clear' });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('queryAll returns rows from a prepared statement after init', async () => {
    const mockRows = [{ country: 'India', matches: 42 }];
    vi.stubGlobal('initSqlJs', vi.fn().mockResolvedValue(makeSqlMock(mockRows)));
    const DB = loadDB();
    await DB.init('./fake.db', { version: 'v-queryrows' });
    const result = DB.queryAll('SELECT * FROM matches');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ country: 'India', matches: 42 });
  });
});
