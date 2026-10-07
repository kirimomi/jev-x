import { ImageVisionResult } from '../types/index.js';

/**
 * Fast skin tone & exposure ratio detector using YCbCr color space on pixel data.
 */
export function analyzeRgbaPixels(data: Uint8ClampedArray | Uint8Array, totalPixels: number): number {
  let skinPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Convert RGB to YCbCr
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

    // Skin tone bounds in YCbCr
    if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
      // Basic RGB sanity rule: R > G > B
      if (r > g && g > b) {
        skinPixels++;
      }
    }
  }

  return skinPixels / totalPixels;
}

/**
 * Request background script to fetch image (bypassing CORS) and calculate skin exposure
 */
async function analyzeImageViaBackground(imageUrl: string): Promise<number> {
  if (!chrome.runtime?.id) {
    // Extension context invalidated (e.g. extension was reloaded)
    return 0;
  }
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'ANALYZE_IMAGE_URL',
      url: imageUrl,
    });
    return typeof res?.score === 'number' ? res.score : 0;
  } catch (e: any) {
    if (e?.message?.includes('Extension context invalidated')) {
      // Quietly ignore reload desync
      return 0;
    }
    console.warn('[jev-x vision] Failed to analyze image via background:', e);
    return 0;
  }
}

/**
 * Evaluates images in a tweet for nudity/exposure and sensitivity warnings
 */
export async function evaluateTweetVision(
  article: HTMLElement,
  imageElements: HTMLImageElement[] | NodeListOf<HTMLImageElement>,
  hasSensitiveWarning: boolean
): Promise<ImageVisionResult> {
  const imageCount = imageElements.length;

  if (hasSensitiveWarning) {
    return {
      hasImages: imageCount > 0,
      imageCount,
      exposureScore: 0.95,
      isLikelyNsfw: true,
      label: 'WarningOverlay',
      details: 'X公式のセンシティブ警告オーバーレイを検知',
    };
  }

  if (imageCount === 0) {
    return {
      hasImages: false,
      imageCount: 0,
      exposureScore: 0,
      isLikelyNsfw: false,
      label: 'Neutral',
    };
  }

  // Analyze images via background service worker to bypass cross-origin canvas security
  let maxExposure = 0;
  const urlsToAnalyze: string[] = [];

  imageElements.forEach((img) => {
    const src = img.currentSrc || img.src;
    if (src && !src.startsWith('data:') && !urlsToAnalyze.includes(src)) {
      urlsToAnalyze.push(src);
    }
  });

  for (const src of urlsToAnalyze.slice(0, 4)) {
    const score = await analyzeImageViaBackground(src);
    if (score > maxExposure) {
      maxExposure = score;
    }
  }

  let label: 'Neutral' | 'Sexy' | 'Explicit' = 'Neutral';
  let isLikelyNsfw = false;

  if (maxExposure >= 0.45) {
    label = 'Explicit';
    isLikelyNsfw = true;
  } else if (maxExposure >= 0.28) {
    label = 'Sexy';
    isLikelyNsfw = true;
  }

  return {
    hasImages: true,
    imageCount,
    exposureScore: Math.round(maxExposure * 100) / 100,
    isLikelyNsfw,
    label,
    details: `画像露出スコア: ${(maxExposure * 100).toFixed(0)}% (${label})`,
  };
}
