import './style.css';
import { logger } from '../../shared/logger.js';
import { scanTweets, throttledScan, reapplySettingsToRenderedPosts } from './scheduler.js';

export { extractTweetData } from './dom/extract.js';

logger.info('🚀 Content script injected and active on:', window.location.href);

// Listen for instant settings updates broadcasted from background (popup/options changes)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'SETTINGS_UPDATED' && message.settings) {
      logger.debug('Received SETTINGS_UPDATED, reflecting to rendered posts');
      reapplySettingsToRenderedPosts(message.settings);
    }
  });
}

// Observe DOM changes
const observer = new MutationObserver(() => {
  throttledScan();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Run initial scans
setTimeout(scanTweets, 500);
setTimeout(scanTweets, 1500);
setTimeout(scanTweets, 3000);
