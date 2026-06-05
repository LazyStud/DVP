import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import 'fake-indexeddb/auto';

const WORKER_CODE = readFileSync(new URL('../../src/venue-worker.js', import.meta.url), 'utf8');

// Load a fresh copy of src/venue-worker.js and return { postMessage, onmessage }.
//
// eval() is safe here: WORKER_CODE is read from a local project file at import
// time, not from user input or the network. It mimics the browser creating a
// Worker from the same file via new Worker(new URL('./venue-worker.js', import.meta.url)).
//
// The worker uses importScripts() for sql.js — mocked as a no-op so no network
// requests are made. Formats functions are now inlined in the worker; no global needed.
function loadWorker({ initSqlJsImpl } = {}) {
  const postMessage = vi.fn();

  globalThis.self         = { postMessage };
  globalThis.importScripts = vi.fn(); // no-op: CDN loads skipped
  globalThis.initSqlJs    = initSqlJsImpl ?? vi.fn().mockResolvedValue({
    Database: class { constructor() {} },
  });
  globalThis.window       = globalThis;
  globalThis.location     = { search: '' };

  // eslint-disable-next-line no-eval
  eval(WORKER_CODE);

  return { postMessage, onmessage: globalThis.self.onmessage };
}

// Helper: fire onmessage and await the first postMessage response.
function sendAndReceive(onmessage, data) {
  return new Promise(resolve => {
    globalThis.self.postMessage.mockImplementationOnce(resolve);
    onmessage({ data });
  });
}

describe('src/venue-worker.js', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete globalThis.self;
    delete globalThis.importScripts;
  });

  describe('aggregate action — DB unavailable', () => {
    it('posts an error when no DB binary is in the IDB cache', async () => {
      const { onmessage } = loadWorker();

      const response = await sendAndReceive(onmessage, {
        id:      1,
        action:  'aggregate',
        aliases: ['eden gardens'],
        yrRange: { min: 2000, max: 2025 },
        format:  'all',
      });

      expect(response).toEqual({
        id:    1,
        error: 'No DB binary available in worker IndexedDB cache',
      });
    });

    it('posts an error when initSqlJs rejects', async () => {
      const { onmessage } = loadWorker({
        initSqlJsImpl: vi.fn().mockRejectedValue(new Error('wasm load failed')),
      });

      const response = await sendAndReceive(onmessage, {
        id:      2,
        action:  'aggregate',
        aliases: [],
        yrRange: { min: 2000, max: 2025 },
        format:  'all',
      });

      expect(response).toMatchObject({ id: 2, error: expect.stringContaining('wasm load failed') });
    });
  });

  describe('unknown / missing action', () => {
    it('does not call postMessage for an unknown action', async () => {
      const { postMessage, onmessage } = loadWorker();
      await onmessage({ data: { id: 3, action: 'unknown' } });
      expect(postMessage).not.toHaveBeenCalled();
    });

    it('does not call postMessage when action is absent', async () => {
      const { postMessage, onmessage } = loadWorker();
      await onmessage({ data: { id: 4 } });
      expect(postMessage).not.toHaveBeenCalled();
    });

    it('does not throw when data is null or undefined', async () => {
      const { onmessage } = loadWorker();
      await expect(onmessage({ data: null })).resolves.not.toThrow();
      await expect(onmessage({})).resolves.not.toThrow();
    });
  });
});
