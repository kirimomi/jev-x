/**
 * Experimental Jev Image Service
 *
 * Fetches the primary tweet image from `https://pbs.twimg.com/`, normalizes it to JPEG,
 * and downscales it via `OffscreenCanvas` to a compact ~30KB JPEG (short side 320px,
 * strictly within Jev's 280px–1568px requirement).
 *
 * NOTE: To remove Jev direct image evaluation in the future, delete this file and
 * remove the `imageVisionMode === 'jev'` branch in `background/index.ts` and `filterEngine.ts`.
 */

const JEV_MIN_DIMENSION = 280;
const JEV_TARGET_SHORT_SIDE = 320;
const JEV_MAX_LONG_SIDE = 680;
const JEV_JPEG_QUALITY = 0.72;
const MAX_JEV_IMAGE_CACHE = 200;

export interface PreparedJevImage {
  bytes: Uint8Array;
  latencyMs: number;
}

const jevImageByteCache = new Map<string, PreparedJevImage>();

function cacheJevImage(url: string, prepared: PreparedJevImage): void {
  if (jevImageByteCache.size >= MAX_JEV_IMAGE_CACHE) {
    const oldestKey = jevImageByteCache.keys().next().value;
    if (oldestKey) jevImageByteCache.delete(oldestKey);
  }
  jevImageByteCache.set(url, prepared);
}

/**
 * Normalizes a Twitter/X media URL to request a small JPEG from the CDN
 */
export function normalizeTwimgUrlForJev(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === 'pbs.twimg.com') {
      parsed.searchParams.set('format', 'jpg');
      parsed.searchParams.set('name', 'small');
      return parsed.toString();
    }
  } catch {
    // ignore invalid URL
  }
  return rawUrl;
}

/**
 * Computes target dimensions where short side is ~320px and both dimensions are within [280, 1568].
 * Returns null if the image is too small (< 280px) or has an extreme aspect ratio that cannot fit.
 */
export function computeJevTargetDimensions(
  srcWidth: number,
  srcHeight: number
): { width: number; height: number } | null {
  if (srcWidth < JEV_MIN_DIMENSION || srcHeight < JEV_MIN_DIMENSION) {
    return null;
  }

  const shortSide = Math.min(srcWidth, srcHeight);
  const scale = shortSide > JEV_TARGET_SHORT_SIDE ? JEV_TARGET_SHORT_SIDE / shortSide : 1;

  let targetWidth = Math.round(srcWidth * scale);
  let targetHeight = Math.round(srcHeight * scale);

  // Clamp long side to JEV_MAX_LONG_SIDE while keeping short side >= JEV_MIN_DIMENSION
  const longSide = Math.max(targetWidth, targetHeight);
  if (longSide > JEV_MAX_LONG_SIDE) {
    const clampScale = JEV_MAX_LONG_SIDE / longSide;
    targetWidth = Math.round(targetWidth * clampScale);
    targetHeight = Math.round(targetHeight * clampScale);
  }

  if (targetWidth < JEV_MIN_DIMENSION || targetHeight < JEV_MIN_DIMENSION) {
    return null;
  }

  return { width: targetWidth, height: targetHeight };
}

/**
 * Fetches and downscales a `pbs.twimg.com` image to a small JPEG suitable for Jev API
 */
export async function prepareImageForJev(imageUrl: string): Promise<PreparedJevImage | null> {
  if (!imageUrl || !imageUrl.startsWith('https://pbs.twimg.com/')) {
    return null;
  }

  const startTime = performance.now();
  const normalizedUrl = normalizeTwimgUrlForJev(imageUrl);

  if (jevImageByteCache.has(normalizedUrl)) {
    return jevImageByteCache.get(normalizedUrl)!;
  }

  try {
    const res = await fetch(normalizedUrl);
    if (!res.ok) {
      return null;
    }
    const blob = await res.blob();

    // In Chrome MV3 Service Worker, resize using createImageBitmap + OffscreenCanvas
    if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined') {
      const bitmap = await createImageBitmap(blob);
      try {
        const dims = computeJevTargetDimensions(bitmap.width, bitmap.height);
        if (!dims) {
          // Image is smaller than 280px or extreme aspect ratio; skip to avoid Jev 400 error
          return null;
        }

        const canvas = new OffscreenCanvas(dims.width, dims.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return null;
        }
        ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);
        const outBlob = await canvas.convertToBlob({
          type: 'image/jpeg',
          quality: JEV_JPEG_QUALITY,
        });
        const bytes = new Uint8Array(await outBlob.arrayBuffer());
        const prepared: PreparedJevImage = {
          bytes,
          latencyMs: Math.round(performance.now() - startTime),
        };
        cacheJevImage(normalizedUrl, prepared);
        return prepared;
      } finally {
        bitmap.close();
      }
    }

    // Fallback for environments without OffscreenCanvas (e.g. Node.js tests)
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    const prepared: PreparedJevImage = {
      bytes,
      latencyMs: Math.round(performance.now() - startTime),
    };
    cacheJevImage(normalizedUrl, prepared);
    return prepared;
  } catch (err) {
    console.warn('[jev-x jevImageService] Failed to prepare image for Jev:', imageUrl, err);
    return null;
  }
}
