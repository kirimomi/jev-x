const fs = require('fs');
let code = fs.readFileSync('src/extension/options/options.ts', 'utf8');

code = code.replace(/toggleEl\.addEventListener\('change', \(\) => \{[\s\S]*?\}\);/g, 
  `toggleEl.addEventListener('change', () => {\n      settings.categories[cat.id].enabled = toggleEl.checked;\n      saveSettings(undefined, true);\n    });`);

code = code.replace(/threshEl\.addEventListener\('input', \(\) => \{[\s\S]*?updateEffective\(\);\n    \}\);/g, 
  `threshEl.addEventListener('input', () => {\n      const val = parseInt(threshEl.value, 10);\n      valEl.textContent = \`\${val}%\`;\n      settings.categories[cat.id].threshold = val / 100;\n      updateEffective();\n    });\n    \n    threshEl.addEventListener('change', () => {\n      saveSettings(undefined, true);\n    });`);

code = code.replace(/showDebugBadgesToggle\.addEventListener\('change', \(\) => \{[\s\S]*?\}\);/g, 
  `showDebugBadgesToggle.addEventListener('change', () => {\n      settings.showDebugBadges = showDebugBadgesToggle.checked;\n      saveSettings(undefined, true);\n    });`);

code = code.replace(/showFoldBannerToggle\.addEventListener\('change', \(\) => \{[\s\S]*?\}\);/g, 
  `showFoldBannerToggle.addEventListener('change', () => {\n      settings.showFoldBanner = showFoldBannerToggle.checked;\n      saveSettings(undefined, true);\n    });`);

code = code.replace(/requireMediaForAdultToggle\.addEventListener\('change', \(\) => \{[\s\S]*?\}\);/g, 
  `requireMediaForAdultToggle.addEventListener('change', () => {\n      settings.requireMediaForAdult = requireMediaForAdultToggle.checked;\n      saveSettings(undefined, true);\n    });`);

code = code.replace(/globalSensitivitySlider\.addEventListener\('input', \(\) => \{[\s\S]*?\}\);/g, 
  `globalSensitivitySlider.addEventListener('input', () => {\n      const val = parseInt(globalSensitivitySlider.value, 10);\n      globalSensitivityVal.textContent = \`\${val}%\`;\n      settings.globalSensitivityMultiplier = val / 100;\n      categoryUpdaters.forEach(updater => updater());\n    });\n    \n    globalSensitivitySlider.addEventListener('change', () => {\n      saveSettings(undefined, true);\n    });`);

code = code.replace(/async function saveSettings\(\) \{[\s\S]*?alert\('.*?'\);\n  \}\n\}/, 
  `async function saveSettings(apiKey?: string, quiet = false) {\n  const req: SaveSettingsRequest = {\n    type: 'SAVE_SETTINGS',\n    settings,\n    apiKey: apiKey ? apiKey : undefined,\n  };\n\n  try {\n    await chrome.runtime.sendMessage(req);\n    if (!quiet || apiKey) {\n      showStatus(apiKey ? 'APIキーを保存しました。' : '設定を保存しました。');\n    } else {\n      showStatus('保存しました');\n    }\n  } catch (error) {\n    console.error('Failed to save settings:', error);\n    if (!quiet) alert('設定の保存に失敗しました。');\n  }\n}`);

const endPart = `
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
    if (confirm('すべての設定をデフォルトに戻します。よろしいですか？')) {
      settings = getDefaultUserSettings();
      
      if (showDebugBadgesToggle) showDebugBadgesToggle.checked = settings.showDebugBadges !== false;
      if (showFoldBannerToggle) showFoldBannerToggle.checked = settings.showFoldBanner !== false;
      if (requireMediaForAdultToggle) requireMediaForAdultToggle.checked = Boolean(settings.requireMediaForAdult);
      if (enableImageVisionToggle) enableImageVisionToggle.checked = Boolean(settings.enableImageVision);
      
      const globalSensitivitySlider = document.getElementById('global-sensitivity-slider') as HTMLInputElement;
      const globalSensitivityVal = document.getElementById('global-sensitivity-val');
      if (globalSensitivitySlider && globalSensitivityVal) {
        globalSensitivitySlider.value = String(Math.round((settings.globalSensitivityMultiplier ?? 1.0) * 100));
        globalSensitivityVal.textContent = \`\${globalSensitivitySlider.value}%\`;
      }
      
      renderCategories();
      saveSettings(undefined, true);
      showStatus('デフォルト設定を復元しました。');
    }
  });
}

loadSettings();`;

code = code.replace(/if \(saveBtn\) \{[\s\S]*?loadSettings\(\);/, endPart);

fs.writeFileSync('src/extension/options/options.ts', code, 'utf8');
