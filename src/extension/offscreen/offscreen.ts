import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';

let model: nsfwjs.NSFWJS | null = null;
let modelLoadingPromise: Promise<nsfwjs.NSFWJS> | null = null;

async function getModel() {
  if (model) return model;
  if (!modelLoadingPromise) {
    // Load default model (MobileNetV2, etc.) from default CDN or local path if we had one.
    // We'll use the default hosted model for now, which is downloaded once and cached by browser.
    modelLoadingPromise = nsfwjs.load();
  }
  model = await modelLoadingPromise;
  return model;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_ANALYZE_IMAGE') {
    (async () => {
      try {
        const m = await getModel();
        
        // Fetch image as blob first to utilize extension's host_permissions
        const response = await fetch(message.url);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const img = new Image();
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = objectUrl;
        });

        // Use nsfwjs to classify
        const predictions = await m.classify(img);
        URL.revokeObjectURL(objectUrl);
        sendResponse({ predictions });
      } catch (err) {
        console.error('[jev-x offscreen] Classification error:', err);
        sendResponse({ error: String(err) });
      }
    })();
    return true; // Keep channel open
  }
});
