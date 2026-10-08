import {
  GetSettingsRequest,
  GetSettingsResponse,
  PatchSettingsRequest,
} from '../messages.js';

const globalToggle = document.getElementById('global-toggle') as HTMLInputElement;
const apiStatusBadge = document.getElementById('api-status')!;
const openOptionsBtn = document.getElementById('open-options')!;

async function initPopup() {
  try {
    const req: GetSettingsRequest = { type: 'GET_SETTINGS' };
    const res: GetSettingsResponse = await chrome.runtime.sendMessage(req);

    if (res) {
      globalToggle.checked = res.settings.globalEnabled;
      const badgeToggle = document.getElementById('badge-toggle') as HTMLInputElement;
      if (badgeToggle) {
        badgeToggle.checked = res.settings.showDebugBadges !== false;
        badgeToggle.addEventListener('change', async () => {
          const patchReq: PatchSettingsRequest = {
            type: 'PATCH_SETTINGS',
            patch: { showDebugBadges: badgeToggle.checked },
          };
          await chrome.runtime.sendMessage(patchReq);
        });
      }

      const foldBannerToggle = document.getElementById('fold-banner-toggle') as HTMLInputElement;
      if (foldBannerToggle) {
        foldBannerToggle.checked = res.settings.showFoldBanner !== false;
        foldBannerToggle.addEventListener('change', async () => {
          const patchReq: PatchSettingsRequest = {
            type: 'PATCH_SETTINGS',
            patch: { showFoldBanner: foldBannerToggle.checked },
          };
          await chrome.runtime.sendMessage(patchReq);
        });
      }

      if (res.hasApiKey) {
        apiStatusBadge.textContent = 'API接続OK';
        apiStatusBadge.className = 'status-badge';
      } else {
        apiStatusBadge.textContent = 'モック動作中';
        apiStatusBadge.className = 'status-badge warning';
      }

      globalToggle.addEventListener('change', async () => {
        const patchReq: PatchSettingsRequest = {
          type: 'PATCH_SETTINGS',
          patch: { globalEnabled: globalToggle.checked },
        };
        await chrome.runtime.sendMessage(patchReq);
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
