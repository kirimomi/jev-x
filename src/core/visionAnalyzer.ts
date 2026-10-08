export const EXPOSURE_THRESHOLDS = {
  EXPLICIT: 0.45,
  SEXY: 0.28,
} as const;

export type ExposureClassification = {
  label: 'Neutral' | 'Sexy' | 'Explicit';
  isLikelyNsfw: boolean;
};

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
 * Classifies exposure score into discrete label and NSFW estimation
 */
export function classifyExposure(score: number): ExposureClassification {
  if (score >= EXPOSURE_THRESHOLDS.EXPLICIT) {
    return { label: 'Explicit', isLikelyNsfw: true };
  }
  if (score >= EXPOSURE_THRESHOLDS.SEXY) {
    return { label: 'Sexy', isLikelyNsfw: true };
  }
  return { label: 'Neutral', isLikelyNsfw: false };
}
