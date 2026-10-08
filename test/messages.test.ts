import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDefaultUserSettings } from '../src/core/categories.js';
import { ExtensionRequest } from '../src/extension/messages.js';

describe('Background message security validation', () => {
  let messageHandler: (
    message: ExtensionRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => boolean;

  let storageData: Record<string, any> = {};

  beforeEach(async () => {
    storageData = {};
    vi.resetModules();

    // Mock chrome APIs before importing background
    (globalThis as any).chrome = {
      runtime: {
        id: 'valid-extension-id',
        onMessage: {
          addListener: vi.fn((fn) => {
            messageHandler = fn;
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => {
            const result: Record<string, any> = {};
            for (const k of keys) {
              if (storageData[k] !== undefined) result[k] = storageData[k];
            }
            return result;
          }),
          set: vi.fn(async (items: Record<string, any>) => {
            Object.assign(storageData, items);
          }),
        },
      },
      tabs: {
        query: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    };

    // Import background to register listener
    await import('../src/extension/background/index.js');
  });

  it('rejects messages from invalid sender id', async () => {
    let response: any = null;
    const sender = { id: 'malicious-extension-id' } as chrome.runtime.MessageSender;

    messageHandler({ type: 'GET_SETTINGS' }, sender, (res) => {
      response = res;
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(response).toEqual({ error: 'Unauthorized sender' });
  });

  it('rejects SAVE_SETTINGS originating from content script (sender has tab)', async () => {
    let response: any = null;
    const sender = {
      id: 'valid-extension-id',
      tab: { id: 123 } as chrome.tabs.Tab,
      url: 'https://x.com/home',
    } as chrome.runtime.MessageSender;

    messageHandler(
      { type: 'SAVE_SETTINGS', settings: getDefaultUserSettings() },
      sender,
      (res) => {
        response = res;
      }
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(response?.error).toContain('SAVE_SETTINGS is only permitted from extension pages');
  });

  it('rejects ANALYZE_IMAGE_URL with non-twimg domain', async () => {
    let response: any = null;
    const sender = {
      id: 'valid-extension-id',
    } as chrome.runtime.MessageSender;

    messageHandler(
      { type: 'ANALYZE_IMAGE_URL', url: 'https://malicious.example.com/exploit.png' },
      sender,
      (res) => {
        response = res;
      }
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(response?.error).toContain('ANALYZE_IMAGE_URL only allows https://pbs.twimg.com/');
  });

  it('rejects PATCH_SETTINGS originating from content script (sender has tab)', async () => {
    let response: any = null;
    const sender = {
      id: 'valid-extension-id',
      tab: { id: 123 } as chrome.tabs.Tab,
      url: 'https://x.com/home',
    } as chrome.runtime.MessageSender;

    messageHandler(
      { type: 'PATCH_SETTINGS', patch: { globalEnabled: false } },
      sender,
      (res) => {
        response = res;
      }
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(response?.error).toContain('PATCH_SETTINGS is only permitted from extension pages');
  });

  it('accepts and persists PATCH_SETTINGS from extension page', async () => {
    let response: any = null;
    const sender = {
      id: 'valid-extension-id',
      url: 'chrome-extension://valid-extension-id/popup.html',
    } as chrome.runtime.MessageSender;

    messageHandler(
      { type: 'PATCH_SETTINGS', patch: { showDebugBadges: false } },
      sender,
      (res) => {
        response = res;
      }
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(response?.settings?.showDebugBadges).toBe(false);
    expect(storageData.userSettings?.showDebugBadges).toBe(false);
  });
});
