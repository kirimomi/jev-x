import { FilterEngine } from '../../core/filterEngine.js';
import { getDefaultUserSettings } from '../../core/categories.js';
import { UserFilterSettings, CategoryId } from '../../types/index.js';
import { ExtensionRequest } from '../messages.js';

let filterEngine: FilterEngine | null = null;
let currentSettings: UserFilterSettings = getDefaultUserSettings();
let currentApiKey: string | undefined = undefined;

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
