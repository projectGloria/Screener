export const MAX_PIXELS = 80_000_000;
export const MAX_SIDE = 30_000;

export function positions(length, viewport, overlap = 0) {
  if (!(length > 0 && viewport > 0)) throw new Error('Invalid page dimensions.');
  if (!(overlap >= 0 && overlap < viewport)) throw new Error('Invalid tile overlap.');
  const step = viewport - overlap;
  const result = [0];
  while (result.at(-1) + viewport < length) {
    const next = Math.min(result.at(-1) + step, length - viewport);
    if (next <= result.at(-1)) break;
    result.push(next);
  }
  return result;
}

export function validateSize(width, height) {
  if (!(width > 0 && height > 0) || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new Error('This page is too large to capture at this zoom. Zoom out or capture a selected area.');
  }
}

export function cropRect(rect, scaleX, scaleY, width, height) {
  const x = Math.max(0, Math.round(rect.x * scaleX));
  const y = Math.max(0, Math.round(rect.y * scaleY));
  return { x, y, width: Math.max(0, Math.min(width - x, Math.round(rect.width * scaleX))), height: Math.max(0, Math.min(height - y, Math.round(rect.height * scaleY))) };
}
