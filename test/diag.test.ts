import { describe, it, expect, beforeEach } from 'vitest';
import { markDiag, readDiag, clearDiag, DIAG_STORAGE_KEY, DIAG_MAX_ENTRIES } from '../src/extension/diag.js';

// In-memory chrome.storage.local stub
let store: Record<string, unknown> = {};

function installChromeStub() {
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (keys: string[]) => {
          const out: Record<string, unknown> = {};
          for (const k of keys) {
            if (k in store) out[k] = store[k];
          }
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
        remove: async (keys: string | string[]) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            delete store[k];
          }
        },
      },
    },
  };
}

async function flushWrites() {
  // markDiag chains writes on a promise queue backed only by microtasks
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('diag', () => {
  beforeEach(() => {
    store = {};
    installChromeStub();
  });

  it('records entries in order with stage, timestamp and detail', async () => {
    markDiag('content.injected', 'https://x.com/home');
    markDiag('content.send', 'tweets=3');
    await flushWrites();

    const entries = await readDiag();
    expect(entries.map((e) => e.stage)).toEqual(['content.injected', 'content.send']);
    expect(entries[0].detail).toBe('https://x.com/home');
    expect(typeof entries[0].ts).toBe('number');
  });

  it('keeps only the newest DIAG_MAX_ENTRIES entries', async () => {
    for (let i = 0; i < DIAG_MAX_ENTRIES + 5; i++) {
      markDiag('content.scan', `found=${i}`);
    }
    await flushWrites();

    const entries = await readDiag();
    expect(entries.length).toBe(DIAG_MAX_ENTRIES);
    expect(entries[0].detail).toBe('found=5');
    expect(entries[entries.length - 1].detail).toBe(`found=${DIAG_MAX_ENTRIES + 4}`);
  });

  it('clearDiag removes all entries', async () => {
    markDiag('background.init', 'mockMode=false hasApiKey=true');
    await flushWrites();
    expect(await readDiag()).toHaveLength(1);

    await clearDiag();
    expect(await readDiag()).toEqual([]);
    expect(store[DIAG_STORAGE_KEY]).toBeUndefined();
  });

  it('never throws when storage fails', async () => {
    (globalThis as any).chrome.storage.local.get = async () => {
      throw new Error('storage unavailable');
    };
    (globalThis as any).chrome.storage.local.set = async () => {
      throw new Error('storage unavailable');
    };
    markDiag('content.injected', 'https://x.com/home');
    await flushWrites();
    // readDiag degrades to an empty list instead of throwing
    (globalThis as any).chrome.storage.local.get = async () => {
      throw new Error('storage unavailable');
    };
    await expect(readDiag()).resolves.toEqual([]);
  });
});

import { FilterEngine } from '../src/core/filterEngine.js';

describe('FilterEngine.testConnection', () => {
  it('reports no-key when no API key is configured', async () => {
    const engine = new FilterEngine({});
    await expect(engine.testConnection()).resolves.toEqual({ level: 'no-key', latencyMs: 0 });
  });
});
