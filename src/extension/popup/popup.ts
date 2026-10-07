import { GetSettingsRequest, GetSettingsResponse, SaveSettingsRequest } from '../messages.js';

const globalToggle = document.getElementById('global-toggle') as HTMLInputElement;
const apiStatusBadge = document.getElementById('api-status')!;
const openOptionsBtn = document.getElementById('open-options')!;

async function initPopup() {
  try {
    const req: GetSettingsRequest = { type: 'GET_SETTINGS' };
    const res: GetSettingsResponse = await chrome.runtime.sendMessage(req);

    if (res) {
      globalToggle.checked = res.settings.globalEnabled;
      if (res.hasApiKey) {
        apiStatusBadge.textContent = 'API接続OK';
        apiStatusBadge.className = 'status-badge';
      } else {
        apiStatusBadge.textContent = 'モック動作中';
        apiStatusBadge.className = 'status-badge warning';
      }

      globalToggle.addEventListener('change', async () => {
        res.settings.globalEnabled = globalToggle.checked;
        const saveReq: SaveSettingsRequest = {
          type: 'SAVE_SETTINGS',
          settings: res.settings,
        };
        await chrome.runtime.sendMessage(saveReq);
      });
    }
  } catch (error) {
    console.error('Popup init failed:', error);
  }
}

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

initPopup();
