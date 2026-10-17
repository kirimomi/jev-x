/**
 * Local NSFWJS Image Classification Service (Offscreen Document Bridge)
 *
 * NOTE: This module encapsulates the local NSFWJS (TensorFlow.js) pipeline.
 * It only evaluates skin exposure / nudity (`Porn`, `Hentai`, `Sexy`) for `adult_nsfw`.
 * To remove the local NSFWJS pipeline in the future, delete this file,
 * `src/extension/offscreen/offscreen.ts`, and `src/extension/content/vision.ts`.
 */

const MAX_IMAGE_CACHE_ENTRIES = 500;
const imageScoreCache = new Map<string, any>();

function cacheImageScore(url: string, score: any): void {
  if (imageScoreCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = imageScoreCache.keys().next().value;
    if (oldestKey) imageScoreCache.delete(oldestKey);
  }
  imageScoreCache.set(url, score);
}

let creatingOffscreen: Promise<void> | null = null;

async function setupOffscreenDocument(path: string): Promise<void> {
  const url = chrome.runtime.getURL(path);
  if ('getContexts' in chrome.runtime) {
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url],
    });
    if (contexts.length > 0) return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = (chrome.offscreen as any).createDocument({
      url: path,
      reasons: ['WORKERS'],
      justification: 'Run NSFWJS image classification',
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

/**
 * Passes image URL to the Offscreen Document to analyze with NSFWJS
 */
export async function analyzeImageWithLocalNsfw(url: string): Promise<any> {
  if (!url || typeof url !== 'string') return null;

  if (imageScoreCache.has(url)) {
    return imageScoreCache.get(url)!;
  }

  try {
    await setupOffscreenDocument('src/pages/offscreen.html');
    const res = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_ANALYZE_IMAGE',
      url,
    });

    if (res?.error) {
      console.error('[jev-x localNsfw] Offscreen returned error:', res.error);
    }
    if (res?.predictions) {
      cacheImageScore(url, res.predictions);
      return res.predictions;
    }
    return null;
  } catch (err) {
    console.warn('[jev-x localNsfw] Failed to analyze image:', url, err);
    return null;
  }
}
