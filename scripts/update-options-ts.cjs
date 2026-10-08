const fs = require('fs');
let code = fs.readFileSync('src/extension/options/options.ts', 'utf8');

const resetLogic = `resetDefaultsBtn.addEventListener('click', () => {
    if (confirm('フィルタ設定をデフォルトに戻します。よろしいですか？')) {
      const defaultSettings = getDefaultUserSettings();
      settings.categories = defaultSettings.categories;
      settings.globalSensitivityMultiplier = defaultSettings.globalSensitivityMultiplier;
      
      const globalSensitivitySlider = document.getElementById('global-sensitivity-slider') as HTMLInputElement;
      const globalSensitivityVal = document.getElementById('global-sensitivity-val');
      if (globalSensitivitySlider && globalSensitivityVal) {
        globalSensitivitySlider.value = String(Math.round((settings.globalSensitivityMultiplier ?? 1.0) * 100));
        globalSensitivityVal.textContent = \`\${globalSensitivitySlider.value}%\`;
      }
      
      renderCategories();
      saveSettings(undefined, true);
      showStatus('フィルタ設定をデフォルトに戻しました。');
    }
  });`;

code = code.replace(/resetDefaultsBtn\.addEventListener\('click', \(\) => \{[\s\S]*?\}\);\n  \}\);/g, resetLogic);

fs.writeFileSync('src/extension/options/options.ts', code, 'utf8');
