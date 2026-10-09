import { FILTER_CATEGORIES, getDefaultUserSettings } from '../../core/categories.js';
import { CategoryId, UserFilterSettings } from '../../types/index.js';
import { GetSettingsRequest, GetSettingsResponse, SaveSettingsRequest } from '../messages.js';

let settings: UserFilterSettings = getDefaultUserSettings();
const categoryUpdaters: Array<() => void> = [];

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
  categoryUpdaters.length = 0;

  for (const cat of FILTER_CATEGORIES) {
    const userConf = settings.categories[cat.id] || {
      enabled: cat.defaultEnabled,
      threshold: cat.defaultThreshold,
    };

    const multiplier = settings.globalSensitivityMultiplier ?? 1.0;
    const baseThresh = userConf.threshold;
    const effectiveThresh = Math.max(0, Math.min(1, baseThresh * multiplier));
    
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
          <div style="display: flex; flex-direction: column; text-align: right; line-height: 1.2;">
            <span>閾値: <b id="val-${cat.id}">${(baseThresh * 100).toFixed(0)}%</b></span>
            <span style="font-size: 11px; color: gray;" id="eff-${cat.id}">実効: ${(effectiveThresh * 100).toFixed(0)}%</span>
          </div>
          <input type="range" id="thresh-${cat.id}" min="20" max="95" step="5" value="${Math.round(baseThresh * 100)}" />
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
    const effEl = item.querySelector(`#eff-${cat.id}`)!;

    const updateEffective = () => {
      const currentMultiplier = settings.globalSensitivityMultiplier ?? 1.0;
      const currentBase = settings.categories[cat.id].threshold;
      const eff = Math.max(0, Math.min(1, currentBase * currentMultiplier));
      effEl.textContent = `実効: ${(eff * 100).toFixed(0)}%`;
    };
    categoryUpdaters.push(updateEffective);

    toggleEl.addEventListener('change', () => {
      settings.categories[cat.id].enabled = toggleEl.checked;
      saveSettings(undefined, true);
    });

    threshEl.addEventListener('input', () => {
      const val = parseInt(threshEl.value, 10);
      valEl.textContent = `${val}%`;
      settings.categories[cat.id].threshold = val / 100;
      updateEffective();
    });
    
    threshEl.addEventListener('change', () => {
      saveSettings(undefined, true);
    });

    // Add Image Vision sub-item explicitly under 'adult_nsfw'
    if (cat.id === 'adult_nsfw') {
      const subItem = document.createElement('div');
      subItem.className = 'category-item';
      subItem.style.marginLeft = '40px';
      subItem.style.marginTop = '-4px';
      subItem.style.marginBottom = '8px';
      subItem.style.background = 'transparent';
      subItem.style.border = 'none';
      subItem.style.borderLeft = '2px solid var(--border)';
      subItem.style.borderRadius = '0';
      subItem.style.padding = '4px 0 4px 16px';
      
      subItem.innerHTML = `
        <div class="category-info">
          <div class="category-header">
            <span style="font-size: 13px;">👁️ 画像認識（ローカル分析）による判定</span>
          </div>
          <div class="category-desc" style="font-size: 11px;">
            ON: 画像を解析して露出度等を加味します / OFF: ピクセル解析を行いません（テキストのみ）
          </div>
        </div>
        <div class="category-controls">
          <label class="switch" style="transform: scale(0.85); transform-origin: right;">
            <input type="checkbox" id="enable-image-vision" ${settings.enableImageVision !== false ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>
      `;
      categoryListEl.appendChild(subItem);

      const enableImageVisionToggle = subItem.querySelector('#enable-image-vision') as HTMLInputElement;
      enableImageVisionToggle.addEventListener('change', () => {
        settings.enableImageVision = enableImageVisionToggle.checked;
        saveSettings(undefined, true);
      });
    }
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
      saveSettings(undefined, true);
    });
  }

  if (showFoldBannerToggle) {
    showFoldBannerToggle.checked = settings.showFoldBanner !== false;
    showFoldBannerToggle.addEventListener('change', () => {
      settings.showFoldBanner = showFoldBannerToggle.checked;
      saveSettings(undefined, true);
    });
  }

  if (requireMediaForAdultToggle) {
    requireMediaForAdultToggle.checked = Boolean(settings.requireMediaForAdult);
    requireMediaForAdultToggle.addEventListener('change', () => {
      settings.requireMediaForAdult = requireMediaForAdultToggle.checked;
      saveSettings(undefined, true);
    });
  }

  const globalSensitivitySlider = document.getElementById('global-sensitivity-slider') as HTMLInputElement;
  const globalSensitivityVal = document.getElementById('global-sensitivity-val');
  if (globalSensitivitySlider && globalSensitivityVal) {
    const currentMultiplier = settings.globalSensitivityMultiplier ?? 1.0;
    globalSensitivitySlider.value = String(Math.round(currentMultiplier * 100));
    globalSensitivityVal.textContent = `${globalSensitivitySlider.value}%`;

    globalSensitivitySlider.addEventListener('input', () => {
      const val = parseInt(globalSensitivitySlider.value, 10);
      globalSensitivityVal.textContent = `${val}%`;
      settings.globalSensitivityMultiplier = val / 100;
      categoryUpdaters.forEach(updater => updater());
    });
    
    globalSensitivitySlider.addEventListener('change', () => {
      saveSettings(undefined, true);
    });
  }

  renderCategories();
}

async function saveSettings(apiKey?: string, quiet = false) {
  const req: SaveSettingsRequest = {
    type: 'SAVE_SETTINGS',
    settings,
    apiKey: apiKey ? apiKey : undefined,
  };

  try {
    await chrome.runtime.sendMessage(req);
    if (!quiet || apiKey) {
      showStatus(apiKey ? 'APIキーを保存しました。' : '設定を保存しました。');
    } else {
      showStatus('保存しました');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    if (!quiet) alert('設定の保存に失敗しました。');
  }
}


const saveApiKeyBtn = document.getElementById('save-api-key-btn') as HTMLButtonElement;
if (saveApiKeyBtn && apiKeyInput) {
  apiKeyInput.addEventListener('input', () => {
    const hasInput = apiKeyInput.value.trim().length > 0;
    saveApiKeyBtn.disabled = !hasInput;
    saveApiKeyBtn.style.opacity = hasInput ? '1' : '0.5';
  });

  const handleSaveApiKey = () => {
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey) {
      saveSettings(newApiKey);
      apiKeyInput.value = '';
      apiKeyInput.placeholder = '•••••••••••••••••••••••••••••••• (保存済み)';
      saveApiKeyBtn.disabled = true;
      saveApiKeyBtn.style.opacity = '0.5';
    }
  };

  saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSaveApiKey();
  });
}

const resetDefaultsBtn = document.getElementById('reset-defaults-btn');
if (resetDefaultsBtn) {
  resetDefaultsBtn.addEventListener('click', () => {
    if (confirm('フィルタ設定をデフォルトに戻します。よろしいですか？')) {
      const defaultSettings = getDefaultUserSettings();
      settings.categories = defaultSettings.categories;
      settings.globalSensitivityMultiplier = defaultSettings.globalSensitivityMultiplier;
      
      const globalSensitivitySlider = document.getElementById('global-sensitivity-slider') as HTMLInputElement;
      const globalSensitivityVal = document.getElementById('global-sensitivity-val');
      if (globalSensitivitySlider && globalSensitivityVal) {
        globalSensitivitySlider.value = String(Math.round((settings.globalSensitivityMultiplier ?? 1.0) * 100));
        globalSensitivityVal.textContent = `${globalSensitivitySlider.value}%`;
      }
      
      renderCategories();
      saveSettings(undefined, true);
      showStatus('フィルタ設定をデフォルトに戻しました。');
    }
  });
}

loadSettings();
