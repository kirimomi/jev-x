import { FILTER_CATEGORIES, getDefaultUserSettings } from '../../core/categories.js';
import { CategoryId, ImageVisionMode, UserFilterSettings } from '../../types/index.js';
import { GetSettingsRequest, GetSettingsResponse, SaveSettingsRequest, TestApiRequest, TestApiResponse } from '../messages.js';
import { readDiag, clearDiag } from '../diag.js';

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

function syncImageVisionModeRadios() {
  const mode: ImageVisionMode =
    settings.imageVisionMode === 'local' || settings.imageVisionMode === 'jev' || settings.imageVisionMode === 'off'
      ? settings.imageVisionMode
      : settings.enableImageVision === false
        ? 'off'
        : 'local';
  const radios = document.querySelectorAll<HTMLInputElement>('input[name="image-vision-mode"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === mode;
  });
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
  }
}

const globalEnabledToggle = document.getElementById('global-enabled') as HTMLInputElement;
const showDebugBadgesToggle = document.getElementById('show-debug-badges') as HTMLInputElement;
const showFoldBannerToggle = document.getElementById('show-fold-banner') as HTMLInputElement;

function syncBasicToggles() {
  if (globalEnabledToggle) {
    globalEnabledToggle.checked = settings.globalEnabled !== false;
  }
  if (showDebugBadgesToggle) {
    showDebugBadgesToggle.checked = settings.showDebugBadges !== false;
  }
  if (showFoldBannerToggle) {
    showFoldBannerToggle.checked = settings.showFoldBanner !== false;
  }
}

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

  syncBasicToggles();

  if (globalEnabledToggle) {
    globalEnabledToggle.addEventListener('change', () => {
      settings.globalEnabled = globalEnabledToggle.checked;
      saveSettings(undefined, true);
    });
  }

  if (showDebugBadgesToggle) {
    showDebugBadgesToggle.addEventListener('change', () => {
      settings.showDebugBadges = showDebugBadgesToggle.checked;
      saveSettings(undefined, true);
    });
  }

  if (showFoldBannerToggle) {
    showFoldBannerToggle.addEventListener('change', () => {
      settings.showFoldBanner = showFoldBannerToggle.checked;
      saveSettings(undefined, true);
    });
  }

  syncImageVisionModeRadios();
  const imageVisionRadios = document.querySelectorAll<HTMLInputElement>('input[name="image-vision-mode"]');
  imageVisionRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        const val = radio.value as ImageVisionMode;
        settings.imageVisionMode = val;
        settings.enableImageVision = val === 'local';
        saveSettings(undefined, true);
      }
    });
  });

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

// Keep options page toggles in sync when changed from popup
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.userSettings?.newValue) {
      settings = changes.userSettings.newValue as UserFilterSettings;
      syncBasicToggles();
      syncImageVisionModeRadios();
    }
  });
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
      settings.imageVisionMode = defaultSettings.imageVisionMode;
      settings.enableImageVision = defaultSettings.enableImageVision;
      
      const globalSensitivitySlider = document.getElementById('global-sensitivity-slider') as HTMLInputElement;
      const globalSensitivityVal = document.getElementById('global-sensitivity-val');
      if (globalSensitivitySlider && globalSensitivityVal) {
        globalSensitivitySlider.value = String(Math.round((settings.globalSensitivityMultiplier ?? 1.0) * 100));
        globalSensitivityVal.textContent = `${globalSensitivitySlider.value}%`;
      }

      syncImageVisionModeRadios();
      renderCategories();
      saveSettings(undefined, true);
      showStatus('フィルタ設定をデフォルトに戻しました。');
    }
  });
}

// ---- Diagnostics (Issue #16) ----

const apiTestLevelLabels: Record<TestApiResponse['level'], string> = {
  'no-key': 'キー未設定（モック動作中）',
  unreachable: '到達NG（ネットワーク／タイムアウト）',
  'auth-failed': '認証NG（キーが拒否されました）',
  'evaluation-failed': '評価NG（応答が評価として成立しませんでした）',
  ok: '評価OK',
};

async function renderDiag() {
  const listEl = document.getElementById('diag-list');
  if (!listEl) return;
  const entries = await readDiag();
  listEl.innerHTML = '';
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--text-muted)';
    empty.textContent = '記録はまだありません。Xのタブを開いてから再読み込みしてください。';
    listEl.appendChild(empty);
    return;
  }
  for (const entry of [...entries].reverse()) {
    const row = document.createElement('div');
    const time = new Date(entry.ts).toLocaleTimeString('ja-JP', { hour12: false });
    row.textContent = `${time}  ${entry.stage}${entry.detail ? `  ${entry.detail}` : ''}`;
    if (entry.stage.endsWith('.error')) {
      row.style.color = '#f4212e';
    }
    listEl.appendChild(row);
  }
}

const diagRefreshBtn = document.getElementById('diag-refresh-btn');
if (diagRefreshBtn) {
  diagRefreshBtn.addEventListener('click', () => {
    void renderDiag();
  });
}

const diagClearBtn = document.getElementById('diag-clear-btn');
if (diagClearBtn) {
  diagClearBtn.addEventListener('click', async () => {
    await clearDiag();
    await renderDiag();
  });
}

const apiTestBtn = document.getElementById('api-test-btn') as HTMLButtonElement | null;
if (apiTestBtn) {
  apiTestBtn.addEventListener('click', async () => {
    const resultEl = document.getElementById('api-test-result');
    apiTestBtn.disabled = true;
    if (resultEl) resultEl.textContent = 'テスト中…';
    try {
      const req: TestApiRequest = { type: 'TEST_API' };
      const res = (await chrome.runtime.sendMessage(req)) as TestApiResponse | { error?: string } | undefined;
      if (resultEl) {
        if (res && 'level' in res) {
          resultEl.textContent = `${apiTestLevelLabels[res.level]}（${res.latencyMs}ms）${res.error ? `: ${res.error}` : ''}`;
          resultEl.style.color = res.level === 'ok' ? 'var(--success)' : '#f4212e';
        } else {
          resultEl.textContent = `テスト失敗: ${res && 'error' in res && res.error ? res.error : '応答なし'}`;
          resultEl.style.color = '#f4212e';
        }
      }
    } catch (e) {
      if (resultEl) {
        resultEl.textContent = `テスト失敗: ${e instanceof Error ? e.message : String(e)}`;
        resultEl.style.color = '#f4212e';
      }
    } finally {
      apiTestBtn.disabled = false;
      void renderDiag();
    }
  });
}

void renderDiag();

loadSettings();
