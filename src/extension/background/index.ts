import { FilterEngine } from '../../core/filterEngine.js';
import { getDefaultUserSettings } from '../../core/categories.js';
import { UserFilterSettings } from '../../types/index.js';
import { ExtensionRequest } from '../messages.js';

let filterEngine: FilterEngine | null = null;
let currentSettings: UserFilterSettings = getDefaultUserSettings();
let currentApiKey: string | undefined = undefined;

async function initEngine() {
  const data = await chrome.storage.local.get(['userSettings', 'typesafeApiKey']);
  if (data.userSettings) {
    currentSettings = data.userSettings;
  }
  if (data.typesafeApiKey) {
    currentApiKey = data.typesafeApiKey;
  }

  filterEngine = new FilterEngine({
    apiKey: currentApiKey,
    mockMode: !currentApiKey,
  });

  console.log('[jev-x background] Initialized engine, mockMode:', !currentApiKey);
}

// Initial setup
initEngine();

// Handle messages from content script or options page
chrome.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
  (async () => {
    if (!filterEngine) {
      await initEngine();
    }

    switch (message.type) {
      case 'EVALUATE_TWEETS': {
        const decisions = await filterEngine!.evaluateBatch(message.tweets, currentSettings);
        sendResponse({ decisions });
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
  })();

  return true; // Keep message channel open for async response
});
