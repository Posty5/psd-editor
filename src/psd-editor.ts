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
 * Replace image and text layers, save the edited PSD, and render a PNG —
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
 *   pngOutputPath: './output.png',
 * });
 * ```
 */
export class PsdEditor {
  /**
   * Edit a PSD template: replace image/text layers, optionally save the
   * edited PSD, and render a PNG.
   *
   * Remote images (HTTP/HTTPS URLs) are downloaded automatically and
   * cleaned up after the operation completes — even when an error occurs.
   */
  async edit(options: EditOptions): Promise<EditResult> {
    this.validateOptions(options);

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

      // Render PNG
      const canvas = renderPsd(psd);
      const pngBuffer = canvas.toBuffer('image/png');

      // Save the rendered PNG when requested
      let pngOutputPath: string | undefined;
      if (options.pngOutputPath) {
        pngOutputPath = path.resolve(options.pngOutputPath);
        fs.mkdirSync(path.dirname(pngOutputPath), { recursive: true });
        fs.writeFileSync(pngOutputPath, pngBuffer);
        options.logger?.(`Wrote PNG: ${pngOutputPath}`);
      }

      return {
        pngBuffer,
        width: psd.width,
        height: psd.height,
        ...(options.description ? { description: options.description } : {}),
        ...(pngOutputPath ? { pngOutputPath } : {}),
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
  }
}
