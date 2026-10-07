import { FilterEngine } from '../../core/filterEngine.js';
import { getDefaultUserSettings } from '../../core/categories.js';
import { analyzeRgbaPixels } from '../../core/visionAnalyzer.js';
import { UserFilterSettings, CategoryId } from '../../types/index.js';
import { ExtensionRequest } from '../messages.js';

let filterEngine: FilterEngine | null = null;
let currentSettings: UserFilterSettings = getDefaultUserSettings();
let currentApiKey: string | undefined = undefined;

// In-memory cache for analyzed image URLs to completely avoid duplicate network requests
const imageScoreCache = new Map<string, number>();

/**
 * Fetches image in background (with extension host_permissions), draws to OffscreenCanvas,
 * and analyzes skin exposure ratio without CORS restrictions.
 */
async function analyzeImageFromUrl(url: string): Promise<number> {
  if (!url || typeof url !== 'string') return 0;

  if (imageScoreCache.has(url)) {
    return imageScoreCache.get(url)!;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      imageScoreCache.set(url, 0);
      return 0;
    }
    const blob = await res.blob();
    const imageBitmap = await createImageBitmap(blob);

    const size = 64;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      imageBitmap.close();
      return 0;
    }

    ctx.drawImage(imageBitmap, 0, 0, size, size);
    imageBitmap.close();

    const imageData = ctx.getImageData(0, 0, size, size);
    const score = analyzeRgbaPixels(imageData.data, size * size);
    imageScoreCache.set(url, score);
    return score;
  } catch (err) {
    console.warn('[jev-x background] Failed to analyze image:', url, err);
    imageScoreCache.set(url, 0);
    return 0;
  }
}

async function initEngine() {
  const data = await chrome.storage.local.get(['userSettings', 'typesafeApiKey']);
  if (data.userSettings) {
    const stored = data.userSettings as Partial<UserFilterSettings>;
    const defaultSettings = getDefaultUserSettings();
    const mergedCategories = { ...defaultSettings.categories };
    if (stored.categories) {
      for (const [key, conf] of Object.entries(stored.categories)) {
        const catId = key as CategoryId;
        if (mergedCategories[catId]) {
          mergedCategories[catId] = {
            enabled: conf.enabled,
            threshold: conf.threshold >= 0.7 ? 0.5 : conf.threshold,
          };
        }
      }
    }
    currentSettings = {
      ...defaultSettings,
      ...stored,
      categories: mergedCategories,
    };
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

// Initial setup
initEngine();

// Handle messages from content script or options page
chrome.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
  (async () => {
    try {
      if (!filterEngine) {
        await initEngine();
      }

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
        currentSettings = message.settings;
        const toSave: Record<string, any> = { userSettings: message.settings };

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

        sendResponse({ success: true });
        break;
      }

      case 'ANALYZE_IMAGE_URL': {
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
