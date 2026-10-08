import { ImageVisionResult } from '../../types/index.js';
import { classifyExposure } from '../../core/visionAnalyzer.js';
import { logger } from '../../shared/logger.js';

/**
 * Request background script to fetch image (bypassing CORS) and calculate skin exposure
 */
export async function analyzeImageViaBackground(imageUrl: string): Promise<number> {
  if (!chrome.runtime?.id) {
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
      return 0;
    }
    logger.warn('Failed to analyze image via background:', e);
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

  const { label, isLikelyNsfw } = classifyExposure(maxExposure);

  return {
    hasImages: true,
    imageCount,
    exposureScore: Math.round(maxExposure * 100) / 100,
    isLikelyNsfw,
    label,
    details: `画像露出スコア: ${(maxExposure * 100).toFixed(0)}% (${label})`,
  };
}
