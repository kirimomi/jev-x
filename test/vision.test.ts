import { describe, it, expect } from 'vitest';
import { analyzeRgbaPixels } from '../src/core/visionAnalyzer.js';

describe('analyzeRgbaPixels', () => {
  it('returns 1.0 for skin-only pixels', () => {
    // 200, 150, 120 gives cb ≈ 104.56, cr ≈ 155.44, and r > g > b
    const data = new Uint8ClampedArray([
      200, 150, 120, 255,
      200, 150, 120, 255,
    ]);
    const score = analyzeRgbaPixels(data, 2);
    expect(score).toBe(1.0);
  });

  it('returns 0.0 for pixels with no skin tones', () => {
    // Pure blue and pure green
    const data = new Uint8ClampedArray([
      0, 0, 255, 255,
      0, 255, 0, 255,
    ]);
    const score = analyzeRgbaPixels(data, 2);
    expect(score).toBe(0.0);
  });

  it('calculates ratio correctly for mixed pixels', () => {
    const data = new Uint8ClampedArray([
      200, 150, 120, 255, // skin
      0, 0, 0, 255,       // black
      0, 0, 255, 255,     // blue
      200, 150, 120, 255, // skin
    ]);
    const score = analyzeRgbaPixels(data, 4);
    expect(score).toBe(0.5);
  });
});
