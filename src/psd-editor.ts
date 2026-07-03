import fs from 'node:fs';
import path from 'node:path';
import 'ag-psd/initialize-canvas.js';
import { readPsd, writePsd } from 'ag-psd';
import { replaceLayerImage, replaceLayerText } from './editor.js';
import { walkLayers } from './layers.js';
import { renderPsd } from './renderer.js';
import type { EditOptions, EditResult } from './types.js';

/**
 * Single entry-point for editing PSD templates.
 *
 * Replace image and text layers, save the edited PSD, and render an image —
 * all through the {@link edit} method.
 *
 * @example
 * ```ts
 * import { PsdEditor } from 'psd-editor';
 *
 * const editor = new PsdEditor();
 * const result = await editor.edit({
 *   templatePath: './template.psd',
 *   images: { PHOTO: './photo.jpg' },
 *   outputFormat: 'jpeg',
 *   quality: 0.9,
 *   outputPath: './output.jpg',
 * });
 * ```
 */
export class PsdEditor {
  /**
   * Edit a PSD template: replace image/text layers, optionally save the
   * edited PSD, and render an image (PNG or JPEG).
   *
   * Remote images (HTTP/HTTPS URLs) are downloaded automatically and
   * cleaned up after the operation completes — even when an error occurs.
   */
  async edit(options: EditOptions): Promise<EditResult> {
    this.validateOptions(options);

    const scale = options.scale ?? 1;
    const outputFormat = options.outputFormat ?? 'png';
    const quality = options.quality ?? 0.92;
    const downloadedBuffers: Buffer[] = [];

    try {
      const templatePath = path.resolve(options.templatePath);
      const psd = readPsd(fs.readFileSync(templatePath), {
        skipCompositeImageData: false,
        skipLayerImageData: false,
        skipThumbnail: true,
        totalMemoryLimit: 2 * 1024 * 1024 * 1024
      });

      options.logger?.(`Loaded ${templatePath} (${psd.width}x${psd.height})`);

      // Replace image layers
      for (const [layer, source] of Object.entries(options.images ?? {})) {
        const matchedPath = await replaceLayerImage(
          psd,
          layer,
          source,
          options.remoteImages ?? {},
          downloadedBuffers
        );
        options.logger?.(`Replaced image layer: ${matchedPath}`);
      }

      // Replace text layers
      for (const [layer, content] of Object.entries(options.texts ?? {})) {
        const matchedPath = replaceLayerText(psd, layer, content);
        options.logger?.(`Replaced text layer: ${matchedPath}`);
      }

      // Save the edited PSD when requested
      let psdOutputPath: string | undefined;
      if (options.psdOutputPath) {
        psdOutputPath = path.resolve(options.psdOutputPath);
        fs.mkdirSync(path.dirname(psdOutputPath), { recursive: true });
        const psdBuffer = writePsd(psd);
        fs.writeFileSync(psdOutputPath, Buffer.from(psdBuffer));
        options.logger?.(`Wrote PSD: ${psdOutputPath}`);
      }

      // Render image
      const canvas = renderPsd(psd, scale);
      const renderedWidth = canvas.width;
      const renderedHeight = canvas.height;

      const imageBuffer =
        outputFormat === 'jpeg'
          ? canvas.toBuffer('image/jpeg', { quality })
          : canvas.toBuffer('image/png');

      // Save the rendered image when requested
      let outputPath: string | undefined;
      if (options.outputPath) {
        outputPath = path.resolve(options.outputPath);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, imageBuffer);
        options.logger?.(`Wrote ${outputFormat.toUpperCase()}: ${outputPath}`);
      }

      return {
        imageBuffer,
        width: psd.width,
        height: psd.height,
        renderedWidth,
        renderedHeight,
        outputFormat,
        ...(options.description ? { description: options.description } : {}),
        ...(outputPath ? { outputPath } : {}),
        ...(psdOutputPath ? { psdOutputPath } : {})
      };
    } finally {
      // Release all downloaded remote image buffers so GC can reclaim memory.
      downloadedBuffers.length = 0;
    }
  }

  /** Returns all slash-separated layer paths in a PSD template. */
  static listLayers(templatePath: string): string[] {
    const psd = readPsd(fs.readFileSync(path.resolve(templatePath)), {
      skipCompositeImageData: true,
      skipLayerImageData: true,
      skipThumbnail: true
    });
    return [...walkLayers(psd.children ?? [])].map((item) => item.path);
  }

  private validateOptions(options: EditOptions): void {
    if (!options || typeof options !== 'object') {
      throw new TypeError('edit() options are required');
    }
    if (typeof options.templatePath !== 'string' || options.templatePath.trim() === '') {
      throw new TypeError('templatePath must be a non-empty string');
    }
    if (options.scale !== undefined) {
      if (typeof options.scale !== 'number' || !Number.isFinite(options.scale) || options.scale <= 0) {
        throw new RangeError('scale must be a positive finite number (e.g. 1, 2, 3)');
      }
    }
    if (options.outputFormat !== undefined && options.outputFormat !== 'png' && options.outputFormat !== 'jpeg') {
      throw new TypeError('outputFormat must be "png" or "jpeg"');
    }
    if (options.quality !== undefined) {
      if (
        typeof options.quality !== 'number' ||
        !Number.isFinite(options.quality) ||
        options.quality < 0 ||
        options.quality > 1
      ) {
        throw new RangeError('quality must be a number between 0 and 1');
      }
    }
  }
}
