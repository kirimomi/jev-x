import { ImageVisionResult } from '../../types/index.js';
import { logger } from '../../shared/logger.js';
import { classifyExposure } from '../../core/visionAnalyzer.js';

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

  let label: 'Neutral' | 'Sexy' | 'Explicit' = 'Neutral';
  let isLikelyNsfw = false;
  let highestNsfwScore = 0;

  for (const src of urlsToAnalyze.slice(0, 4)) {
    const score = await analyzeImageViaBackground(src);
    if (typeof score === 'number') {
      highestNsfwScore = Math.max(highestNsfwScore, score);

      const classification = classifyExposure(score);

      if (classification.label === 'Explicit') {
        label = 'Explicit';
        isLikelyNsfw = true;
        break; // Stop at first Explicit
      } else if (classification.label === 'Sexy' && label === 'Neutral') {
        label = 'Sexy';
        isLikelyNsfw = true;
      }
    }
  }

  return {
    hasImages: true,
    imageCount,
    exposureScore: Math.round(highestNsfwScore * 100) / 100,
    isLikelyNsfw,
    label,
    details: `画像露出スコア: ${(highestNsfwScore * 100).toFixed(0)}% (${label})`,
  };
}
