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
  /** Save the rendered PNG to this path. Parent directories are created automatically. */
  pngOutputPath?: string;
  /** Settings used for HTTP(S) image sources. */
  remoteImages?: RemoteImageOptions;
  /** Receives progress messages. The library is silent when omitted. */
  logger?: (message: string) => void;
}

export interface EditResult {
  /** Rendered PNG data. */
  pngBuffer: Buffer;
  width: number;
  height: number;
  description?: string;
  /** Absolute output path when `pngOutputPath` was provided. */
  pngOutputPath?: string;
  /** Absolute output path when `psdOutputPath` was provided. */
  psdOutputPath?: string;
}
