import { ImageVisionResult } from '../../../types/index.js';

/**
 * Formats image vision analysis result into a compact label string
 */
export function formatVisionInfo(vision?: ImageVisionResult): string {
  if (!vision || !vision.hasImages) {
    return '';
  }

  if (vision.label === 'WarningOverlay') {
    return ' [⚠️ X警告]';
  }

  const countStr = vision.imageCount > 1 ? `${vision.imageCount}枚 ` : '';
  const scorePct = (vision.exposureScore * 100).toFixed(0);
  return ` [📷 ${countStr}露出 ${scorePct}% (${vision.label})]`;
}

/**
 * Formats a probability ratio (0.0 - 1.0) into a percentage string
 */
export function formatPercent(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '';
  }
  return `${(value * 100).toFixed(0)}%`;
}
