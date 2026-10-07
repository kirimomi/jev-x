import { FILTER_CATEGORIES, getDefaultUserSettings } from '../../core/categories.js';
import { CategoryId, UserFilterSettings } from '../../types/index.js';
import { GetSettingsRequest, GetSettingsResponse, SaveSettingsRequest } from '../messages.js';

let settings: UserFilterSettings = getDefaultUserSettings();

const categoryListEl = document.getElementById('category-list')!;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const saveBtn = document.getElementById('save-all-btn')!;
const statusMsg = document.getElementById('status-msg')!;

function showStatus(text: string) {
  statusMsg.textContent = text;
  statusMsg.style.display = 'block';
  setTimeout(() => {
    statusMsg.style.display = 'none';
  }, 2500);
}

function renderCategories() {
  categoryListEl.innerHTML = '';

  for (const cat of FILTER_CATEGORIES) {
    const userConf = settings.categories[cat.id] || {
      enabled: cat.defaultEnabled,
      threshold: cat.defaultThreshold,
    };

    const item = document.createElement('div');
    item.className = 'category-item';

    item.innerHTML = `
      <div class="category-info">
        <div class="category-header">
          <span>${cat.badgeIcon}</span>
          <span>${cat.name}</span>
        </div>
        <div class="category-desc">${cat.description}</div>
      </div>
      <div class="category-controls">
        <div class="slider-group">
          <span>閾値: <b id="val-${cat.id}">${(userConf.threshold * 100).toFixed(0)}%</b></span>
          <input type="range" id="thresh-${cat.id}" min="20" max="95" step="5" value="${Math.round(userConf.threshold * 100)}" />
        </div>
        <label class="switch">
          <input type="checkbox" id="toggle-${cat.id}" ${userConf.enabled ? 'checked' : ''} />
          <span class="slider"></span>
        </label>
      </div>
    `;

    categoryListEl.appendChild(item);

    // Event listeners
    const toggleEl = item.querySelector(`#toggle-${cat.id}`) as HTMLInputElement;
    const threshEl = item.querySelector(`#thresh-${cat.id}`) as HTMLInputElement;
    const valEl = item.querySelector(`#val-${cat.id}`)!;

    toggleEl.addEventListener('change', () => {
      settings.categories[cat.id].enabled = toggleEl.checked;
    });

    threshEl.addEventListener('input', () => {
      const val = parseInt(threshEl.value, 10);
      valEl.textContent = `${val}%`;
      settings.categories[cat.id].threshold = val / 100;
    });
  }
}

const showDebugBadgesToggle = document.getElementById('show-debug-badges') as HTMLInputElement;
const showFoldBannerToggle = document.getElementById('show-fold-banner') as HTMLInputElement;
const requireMediaForAdultToggle = document.getElementById('require-media-for-adult') as HTMLInputElement;

async function loadSettings() {
  try {
    const req: GetSettingsRequest = { type: 'GET_SETTINGS' };
    const res: GetSettingsResponse = await chrome.runtime.sendMessage(req);

    if (res) {
      if (res.settings) {
        settings = res.settings;
      }
      if (res.hasApiKey) {
        apiKeyInput.placeholder = '•••••••••••••••••••••••••••••••• (保存済み)';
      }
    }
  } catch (error) {
    console.warn('Failed to load settings from background:', error);
  }

  if (showDebugBadgesToggle) {
    showDebugBadgesToggle.checked = settings.showDebugBadges !== false;
    showDebugBadgesToggle.addEventListener('change', () => {
      settings.showDebugBadges = showDebugBadgesToggle.checked;
    });
  }

  if (showFoldBannerToggle) {
    showFoldBannerToggle.checked = settings.showFoldBanner !== false;
    showFoldBannerToggle.addEventListener('change', () => {
      settings.showFoldBanner = showFoldBannerToggle.checked;
    });
  }

  if (requireMediaForAdultToggle) {
    requireMediaForAdultToggle.checked = Boolean(settings.requireMediaForAdult);
    requireMediaForAdultToggle.addEventListener('change', () => {
      settings.requireMediaForAdult = requireMediaForAdultToggle.checked;
    });
  }

  renderCategories();
}

async function saveSettings() {
  const newApiKey = apiKeyInput.value.trim();
  if (showDebugBadgesToggle) {
    settings.showDebugBadges = showDebugBadgesToggle.checked;
  }
  if (showFoldBannerToggle) {
    settings.showFoldBanner = showFoldBannerToggle.checked;
  }
  if (requireMediaForAdultToggle) {
    settings.requireMediaForAdult = requireMediaForAdultToggle.checked;
  }

  const req: SaveSettingsRequest = {
    type: 'SAVE_SETTINGS',
    settings,
    apiKey: newApiKey ? newApiKey : undefined,
  };

  try {
    await chrome.runtime.sendMessage(req);
    showStatus('設定を保存しました。');
    if (newApiKey) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = '•••••••••••••••••••••••••••••••• (保存済み)';
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('設定の保存に失敗しました。');
  }
}

saveBtn.addEventListener('click', saveSettings);
const saveBtnBottom = document.getElementById('save-all-btn-bottom');
if (saveBtnBottom) {
  saveBtnBottom.addEventListener('click', saveSettings);
}
loadSettings();
