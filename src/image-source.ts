import path from 'node:path';
import type { ImageSource, RemoteImageOptions } from './types.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

/** Resolves an image source into a value accepted by node-canvas. */
export async function resolveImageSource(
  source: ImageSource,
  options: RemoteImageOptions = {}
): Promise<string | Buffer> {
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof Uint8Array) return Buffer.from(source);

  const url = toHttpUrl(source);
  if (url) return downloadImage(url, options);

  if (typeof source !== 'string' || source.trim() === '') {
    throw new TypeError('Image source must be a file path, HTTP(S) URL, or image buffer');
  }

  return path.resolve(source);
}

function toHttpUrl(source: ImageSource): URL | null {
  if (source instanceof URL) {
    assertHttpProtocol(source);
    return source;
  }

  if (typeof source !== 'string') return null;
  if (path.isAbsolute(source) || path.win32.isAbsolute(source)) return null;

  try {
    const url = new URL(source);
    assertHttpProtocol(url);
    return url;
  } catch (error) {
    if (error instanceof TypeError && /^[a-z][a-z\d+.-]*:/i.test(source)) throw error;
    return null;
  }
}

function assertHttpProtocol(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`Unsupported image URL protocol: ${url.protocol}`);
  }
}

async function downloadImage(url: URL, options: RemoteImageOptions): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('remoteImages.timeoutMs must be greater than zero');
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new RangeError('remoteImages.maxBytes must be greater than zero');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: options.headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(`Failed to download image from ${url.href}`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Image request failed with HTTP ${response.status}: ${url.href}`);
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Remote image exceeds the ${maxBytes}-byte limit: ${url.href}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`Remote image exceeds the ${maxBytes}-byte limit: ${url.href}`);
  }
  if (buffer.length === 0) {
    throw new Error(`Remote image is empty: ${url.href}`);
  }

  return buffer;
}
