import { ImageVisionResult } from '../../types/index.js';
import { logger } from '../../shared/logger.js';

/**
 * Request background script to fetch image (bypassing CORS) and classify it with NSFWJS
 */
export async function analyzeImageViaBackground(imageUrl: string): Promise<any> {
  if (!chrome.runtime?.id) {
    return null;
  }
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'ANALYZE_IMAGE_URL',
      url: imageUrl,
    });
    return res?.score || null;
  } catch (e: any) {
    if (e?.message?.includes('Extension context invalidated')) {
      return null;
    }
    logger.warn('Failed to analyze image via background:', e);
    return null;
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
      details: 'Xのセンシティブ警告オーバーレイ検知',
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
  const urlsToAnalyze: string[] = [];

  imageElements.forEach((img) => {
    const src = img.currentSrc || img.src;
    if (src && !src.startsWith('data:') && !urlsToAnalyze.includes(src)) {
      urlsToAnalyze.push(src);
    }
  });

  let label: 'Neutral' | 'Sexy' | 'Explicit' | 'Skipped' = 'Neutral';
  let isLikelyNsfw = false;
  let highestNsfwScore = 0;
  let wasSkipped = false;

  const startTime = performance.now();

  for (const src of urlsToAnalyze.slice(0, 4)) {
    const predictions = await analyzeImageViaBackground(src);
    if (predictions === -1) {
      wasSkipped = true;
      break;
    }
    
    if (predictions && Array.isArray(predictions)) {
      let hentaiScore = 0;
      let pornScore = 0;
      let sexyScore = 0;

      for (const p of predictions) {
        if (p.className === 'Hentai') hentaiScore = p.probability;
        if (p.className === 'Porn') pornScore = p.probability;
        if (p.className === 'Sexy') sexyScore = p.probability;
      }

      const explicitScore = Math.max(hentaiScore, pornScore);
      highestNsfwScore = Math.max(highestNsfwScore, explicitScore, sexyScore);

      if (explicitScore >= 0.5) {
        label = 'Explicit';
        isLikelyNsfw = true;
        break; // Stop at first Explicit
      } else if (sexyScore >= 0.6 && label === 'Neutral') {
        label = 'Sexy';
        isLikelyNsfw = true;
      }
    }
  }

  if (wasSkipped) {
    label = 'Skipped';
    highestNsfwScore = 0;
  }

  return {
    hasImages: true,
    imageCount,
    exposureScore: Math.round(highestNsfwScore * 100) / 100,
    isLikelyNsfw,
    label,
    latencyMs: Math.round(performance.now() - startTime),
    details: `画像露出スコア: ${(highestNsfwScore * 100).toFixed(0)}% (${label})`,
  };
}
