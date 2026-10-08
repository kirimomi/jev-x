const fs = require('fs');
let html = fs.readFileSync('src/pages/options.html', 'utf8');

// Fix API key input layout and button
html = html.replace(/<div style="display: flex; gap: 8px;">\s*<input type="password" id="api-key".*?\/>\s*<button id="save-api-key-btn".*?>保存<\/button>\s*<\/div>/, 
`<div style="display: flex; gap: 8px;">
          <input type="password" id="api-key" placeholder="ts_********************************" autocomplete="off" style="flex: 1;" />
          <button id="save-api-key-btn" class="btn" disabled style="opacity: 0.5; padding: 8px 16px; white-space: nowrap; flex-shrink: 0;">保存</button>
        </div>`);

// Simplify headers
html = html.replace(/<h2 class="card-title">🔑 API設定<\/h2>/, '<h2 class="card-title">🔑 API</h2>');
html = html.replace(/<h2 class="card-title">👁️ 表示設定<\/h2>/, '<h2 class="card-title">👁️ 表示</h2>');

// Move reset button to the filter header and simplify header
html = html.replace(/<h2 class="card-title">🛡️ フィルタ対象カテゴリ<\/h2>/, 
`<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 class="card-title" style="margin-bottom: 0;">🛡️ フィルタ</h2>
        <button id="reset-defaults-btn" class="btn" style="background: transparent; border: 1px solid var(--border); color: var(--text); padding: 6px 12px; font-size: 12px;">デフォルトに戻す</button>
      </div>`);

// Remove old reset button
html = html.replace(/<div style="display: flex; justify-content: flex-end; margin-top: 16px; margin-bottom: 40px;">\s*<button id="reset-defaults-btn".*?>デフォルトに戻す<\/button>\s*<\/div>/, '');

fs.writeFileSync('src/pages/options.html', html, 'utf8');
