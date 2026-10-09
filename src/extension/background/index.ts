import { FilterEngine } from '../../core/filterEngine.js';
import { getDefaultUserSettings } from '../../core/categories.js';
import { UserFilterSettings, CategoryId } from '../../types/index.js';
import { ExtensionRequest } from '../messages.js';

import { normalizeSettings } from '../../core/settings.js';

let filterEngine: FilterEngine | null = null;
let currentSettings: UserFilterSettings = getDefaultUserSettings();
let currentApiKey: string | undefined = undefined;
let initPromise: Promise<void> | null = null;

// Bounded in-memory cache for analyzed image URLs (max 500 entries) to avoid duplicate network requests
const MAX_IMAGE_CACHE_ENTRIES = 500;
const imageScoreCache = new Map<string, any>();

function cacheImageScore(url: string, score: any): void {
  if (imageScoreCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = imageScoreCache.keys().next().value;
    if (oldestKey) imageScoreCache.delete(oldestKey);
  }
  imageScoreCache.set(url, score);
}

let creatingOffscreen: Promise<void> | null = null;

async function setupOffscreenDocument(path: string) {
  const url = chrome.runtime.getURL(path);
  // Type fallback if getContexts is not fully typed
  if ('getContexts' in chrome.runtime) {
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url]
    });
    if (contexts.length > 0) return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = (chrome.offscreen as any).createDocument({
      url: path,
      reasons: ['WORKERS'], // offscreen reason
      justification: 'Run NSFWJS image classification',
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

/**
 * Broadcast updated settings to all open x.com / twitter.com tabs
 */
async function broadcastSettings(settings: UserFilterSettings): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: ['*://*.x.com/*', '*://*.twitter.com/*'] });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_UPDATED',
          settings,
        }).catch(() => {
          // Tab may not have content script loaded or ready; ignore
        });
      }
    }
  } catch (err) {
    console.debug('[jev-x background] Tab broadcast notice:', err);
  }
}

/**
 * Passes image URL to the Offscreen Document to analyze with NSFWJS
 */
async function analyzeImageFromUrl(url: string): Promise<any> {
  if (!url || typeof url !== 'string') return null;

  if (imageScoreCache.has(url)) {
    return imageScoreCache.get(url)!;
  }

  try {
    await setupOffscreenDocument('src/pages/offscreen.html');
    const res = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_ANALYZE_IMAGE',
      url
    });
    
    if (res?.error) {
      console.error('[jev-x background] Offscreen returned error:', res.error);
    }
    if (res?.predictions) {
      cacheImageScore(url, res.predictions);
      return res.predictions;
    }
    return null;
  } catch (err) {
    console.warn('[jev-x background] Failed to analyze image:', url, err);
    return null;
  }
}

async function initEngine(): Promise<void> {
  const data = await chrome.storage.local.get(['userSettings', 'typesafeApiKey']);
  if (data.userSettings) {
    const raw = data.userSettings;
    const normalized = normalizeSettings(raw);
    currentSettings = normalized;

    // If legacy settings were migrated, persist the normalized settings back
    const rawObj = raw as Record<string, any>;
    if (typeof raw === 'object' && raw !== null && (!('settingsVersion' in rawObj) || rawObj.settingsVersion < 2)) {
      await chrome.storage.local.set({ userSettings: normalized });
    }
  } else {
    currentSettings = getDefaultUserSettings();
  }

  if (data.typesafeApiKey) {
    currentApiKey = data.typesafeApiKey as string;
  }

  filterEngine = new FilterEngine({
    apiKey: currentApiKey,
    mockMode: !currentApiKey,
  });

  console.log('[jev-x background] Initialized engine, mockMode:', !currentApiKey, 'showBadges:', currentSettings.showDebugBadges);
}

function ensureEngine(): Promise<void> {
  if (!initPromise) {
    initPromise = initEngine();
  }
  return initPromise;
}

// Initial setup
ensureEngine();

// Handle messages from content script or options page
chrome.runtime.onMessage.addListener((message: ExtensionRequest, sender, sendResponse) => {
  (async () => {
    try {
      // Validate sender identity
      if (sender.id !== chrome.runtime?.id) {
        sendResponse({ error: 'Unauthorized sender' });
        return;
      }

      await ensureEngine();

      switch (message.type) {
        case 'EVALUATE_TWEETS': {
          const decisions = await filterEngine!.evaluateBatch(message.tweets, currentSettings);
          sendResponse({
            decisions,
            showDebugBadges: currentSettings.showDebugBadges !== false,
            showFoldBanner: currentSettings.showFoldBanner !== false,
          });
          break;
        }

        case 'GET_SETTINGS': {
          sendResponse({
            settings: currentSettings,
            hasApiKey: Boolean(currentApiKey),
          });
          break;
        }

        case 'SAVE_SETTINGS': {
          // Verify that SAVE_SETTINGS originates only from extension UI pages (popup/options), not content script
          const isFromExtensionPage = !sender.tab || Boolean(sender.url?.startsWith('chrome-extension://'));
          if (!isFromExtensionPage) {
            sendResponse({ error: 'Unauthorized: SAVE_SETTINGS is only permitted from extension pages' });
            return;
          }

          const normalized = normalizeSettings(message.settings);
          currentSettings = normalized;
          const toSave: Record<string, any> = { userSettings: normalized };

          if (message.apiKey !== undefined) {
            currentApiKey = message.apiKey;
            toSave.typesafeApiKey = message.apiKey;
          }

          await chrome.storage.local.set(toSave);

          // Re-initialize engine with updated key
          filterEngine = new FilterEngine({
            apiKey: currentApiKey,
            mockMode: !currentApiKey,
          });

          await broadcastSettings(currentSettings);
          sendResponse({ success: true });
          break;
        }

        case 'PATCH_SETTINGS': {
          const isFromExtensionPage = !sender.tab || Boolean(sender.url?.startsWith('chrome-extension://'));
          if (!isFromExtensionPage) {
            sendResponse({ error: 'Unauthorized: PATCH_SETTINGS is only permitted from extension pages' });
            return;
          }

          const merged = {
            ...currentSettings,
            ...message.patch,
            categories: {
              ...currentSettings.categories,
              ...(message.patch.categories || {}),
            },
          };
          const normalized = normalizeSettings(merged);
          currentSettings = normalized;
          await chrome.storage.local.set({ userSettings: normalized });
          await broadcastSettings(currentSettings);
          sendResponse({ settings: currentSettings });
          break;
        }

        case 'ANALYZE_IMAGE_URL': {
          // Restrict image fetching only to legitimate Twitter/X media CDNs
          if (!message.url || !message.url.startsWith('https://pbs.twimg.com/')) {
            sendResponse({ error: 'Unauthorized: ANALYZE_IMAGE_URL only allows https://pbs.twimg.com/' });
            return;
          }

          if (currentSettings.enableImageVision === false) {
            sendResponse({ score: -1 });
            return;
          }

          const score = await analyzeImageFromUrl(message.url);
          sendResponse({ score });
          break;
        }

        default:
          sendResponse({ error: 'Unknown request type' });
      }
    } catch (err) {
      console.error('[jev-x background] Message processing error:', err);
      sendResponse({ error: String(err) });
    }
  })();

  return true; // Keep message channel open for async response
});
