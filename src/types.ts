import type { Buffer } from 'node:buffer';

/** A local file path, HTTP(S) URL, URL object, or in-memory image. */
export type ImageSource = string | URL | Buffer | Uint8Array;

export interface RemoteImageOptions {
  /** Request timeout in milliseconds. Default: 15 seconds. */
  timeoutMs?: number;
  /** Maximum downloaded image size in bytes. Default: 20 MiB. */
  maxBytes?: number;
  /** Optional HTTP headers sent when downloading remote images. */
  headers?: Record<string, string>;
}

export interface EditOptions {
  /** Path to the source PSD template. */
  templatePath: string;
  /** Layer name or full layer path mapped to an image source (local path, URL, Buffer, Uint8Array). */
  images?: Record<string, ImageSource>;
  /** Text layer name or full layer path mapped to replacement content. */
  texts?: Record<string, string>;
  /** Optional label returned with the result. */
  description?: string;
  /** Save the edited PSD to this path. Parent directories are created automatically. */
  psdOutputPath?: string;
  /** Save the rendered image to this path. Parent directories are created automatically. */
  outputPath?: string;
  /** Settings used for HTTP(S) image sources. */
  remoteImages?: RemoteImageOptions;
  /**
   * Output resolution multiplier. Renders the image at `scale × PSD dimensions`.
   * Use `2` for 2× (Retina), `3` for 3×, etc. Must be a positive number.
   * Default: `1` (native PSD resolution).
   */
  scale?: number;
  /**
   * Output image format.
   * - `'png'` — lossless (default)
   * - `'jpeg'` — lossy, smaller file size; use with `quality`
   */
  outputFormat?: 'png' | 'jpeg';
  /**
   * JPEG compression quality, between `0` (worst) and `1` (best).
   * Only applies when `outputFormat` is `'jpeg'`. Default: `0.92`.
   */
  quality?: number;
  /** Receives progress messages. The library is silent when omitted. */
  logger?: (message: string) => void;
}

export interface EditResult {
  /** Rendered image data (PNG or JPEG depending on outputFormat). */
  imageBuffer: Buffer;
  /** Logical PSD width in pixels (before scale). */
  width: number;
  /** Logical PSD height in pixels (before scale). */
  height: number;
  /** Actual image width in pixels (width × scale). */
  renderedWidth: number;
  /** Actual image height in pixels (height × scale). */
  renderedHeight: number;
  /** The format of imageBuffer: 'png' or 'jpeg'. */
  outputFormat: 'png' | 'jpeg';
  description?: string;
  /** Absolute output path when `outputPath` was provided. */
  outputPath?: string;
  /** Absolute output path when `psdOutputPath` was provided. */
  psdOutputPath?: string;
}
