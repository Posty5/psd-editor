import type { Canvas, CanvasRenderingContext2D } from 'canvas';
import { createCanvas, loadImage } from 'canvas';
import type { Color, Layer, Psd } from 'ag-psd';
import { findLayer, getLayerHeight, getLayerWidth } from './layers.js';
import { resolveImageSource } from './image-source.js';
import type { ImageSource, RemoteImageOptions } from './types.js';

export async function replaceLayerImage(
  psd: Psd,
  layerNameOrPath: string,
  source: ImageSource,
  remoteOptions: RemoteImageOptions,
  downloadedBuffers: Buffer[] = []
): Promise<string> {
  const found = findLayer(psd, layerNameOrPath);
  if (!found) throw new Error(`Layer not found: ${layerNameOrPath}`);

  const layer = found.layer;
  recoverBoundsFromMask(layer);

  const width = getLayerWidth(layer);
  const height = getLayerHeight(layer);
  if (width <= 0 || height <= 0) {
    throw new Error(`Layer "${found.path}" has invalid bounds: ${width}x${height}`);
  }

  const resolved = await resolveImageSource(source, remoteOptions);
  if (Buffer.isBuffer(resolved)) {
    downloadedBuffers.push(resolved);
  }
  const image = await loadImage(resolved);
  const oldCanvas = layer.canvas ?? layer.mask?.canvas;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  drawImageCover(context, image, width, height);

  // Preserve non-rectangular placeholder masks and transparent corners.
  if (oldCanvas) {
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(oldCanvas as unknown as Canvas, 0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }

  layer.canvas = canvas as unknown as HTMLCanvasElement;
  delete layer.imageData;
  delete layer.placedLayer;

  layer.left ??= 0;
  layer.top ??= 0;
  layer.right = layer.left + width;
  layer.bottom = layer.top + height;

  return found.path;
}

export function replaceLayerText(psd: Psd, layerNameOrPath: string, content: string): string {
  const found = findLayer(psd, layerNameOrPath);
  if (!found) throw new Error(`Layer not found: ${layerNameOrPath}`);
  if (!found.layer.text) throw new Error(`Layer is not a text layer: ${found.path}`);

  found.layer.text.text = String(content);
  redrawTextLayer(found.layer);
  return found.path;
}

function recoverBoundsFromMask(layer: Layer): void {
  if (getLayerWidth(layer) > 0 && getLayerHeight(layer) > 0) return;

  const mask = layer.mask;
  if (
    mask &&
    typeof mask.left === 'number' &&
    typeof mask.top === 'number' &&
    typeof mask.right === 'number' &&
    typeof mask.bottom === 'number'
  ) {
    layer.left = mask.left;
    layer.top = mask.top;
    layer.right = mask.right;
    layer.bottom = mask.bottom;
  }
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: Awaited<ReturnType<typeof loadImage>>,
  boxWidth: number,
  boxHeight: number
): void {
  const imageRatio = image.width / image.height;
  const boxRatio = boxWidth / boxHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (imageRatio > boxRatio) {
    sourceWidth = image.height * boxRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / boxRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.clearRect(0, 0, boxWidth, boxHeight);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    boxWidth,
    boxHeight
  );
}

interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextStyleContext {
  family: string;
  weight: string;
  fontStyle: string;
  isRtl: boolean;
  align: 'left' | 'center' | 'right';
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  strokeFlag: boolean;
  fillFlag: boolean;
  fillFirst: boolean;
}

const MIN_FONT_SIZE = 16;

/**
 * Redraws a text layer's raster onto a fresh canvas so the replacement string is
 * visible. Two layouts are supported:
 *
 * - **Paragraph (box) text** \u2014 honors the PSD text box (`boxBounds` + `transform`),
 *   wraps long titles across lines and shrinks the font until the wrapped text
 *   fits the box. This is what stops long titles from being clipped.
 * - **Point text** \u2014 single positioned line(s); the canvas grows to fit the new
 *   string so it is never truncated.
 */
function redrawTextLayer(layer: Layer): void {
  const text = layer.text;
  if (!text) return;

  const box = getTextBox(layer);
  if (box) {
    redrawBoxText(layer, box);
  } else {
    redrawPointText(layer);
  }
}

/** The real paragraph-text rectangle from the PSD engine data, or `null` for point text. */
function getTextBox(layer: Layer): BoxRect | null {
  const text = layer.text;
  if (!text || text.shapeType !== 'box' || !Array.isArray(text.boxBounds) || text.boxBounds.length < 4) {
    return null;
  }

  const [left, top, right, bottom] = text.boxBounds as [number, number, number, number];
  const transform = text.transform ?? [1, 0, 0, 1, 0, 0];
  const scaleX = transform[0] || 1;
  const scaleY = transform[3] || 1;
  const originX = transform[4] || 0;
  const originY = transform[5] || 0;

  const width = Math.round((right - left) * scaleX);
  const height = Math.round((bottom - top) * scaleY);
  if (width <= 0 || height <= 0) return null;

  return {
    x: Math.round(originX + left * scaleX),
    y: Math.round(originY + top * scaleY),
    width,
    height
  };
}

function resolveStyleContext(layer: Layer): TextStyleContext {
  const text = layer.text!;
  const style = text.style ?? {};
  const isRtl = /[\u0590-\u08ff]/.test(text.text);
  const justification = text.paragraphStyle?.justification;
  const align: TextStyleContext['align'] =
    justification === 'center' ? 'center' : justification === 'right' || isRtl ? 'right' : 'left';

  return {
    family: style.font?.name || 'sans-serif',
    weight: style.fauxBold ? 'bold' : 'normal',
    fontStyle: style.fauxItalic ? 'italic' : 'normal',
    isRtl,
    align,
    fillStyle: colorToCss(style.fillColor),
    strokeStyle: colorToCss(style.strokeColor),
    lineWidth: style.outlineWidth || 1,
    strokeFlag: style.strokeFlag === true,
    fillFlag: style.fillFlag !== false,
    fillFirst: style.fillFirst !== false
  };
}

/** Draws one already-wrapped line, honoring the fill/stroke order flags. */
function paintLine(context: CanvasRenderingContext2D, ctx: TextStyleContext, line: string, x: number, y: number): void {
  if (ctx.strokeFlag && !ctx.fillFirst) context.strokeText(line, x, y);
  if (ctx.fillFlag) context.fillText(line, x, y);
  if (ctx.strokeFlag && ctx.fillFirst) context.strokeText(line, x, y);
}

/** Splits `word` into chunks that each fit within `maxWidth` (used when a single word overflows). */
function breakLongWord(context: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const char of word) {
    const candidate = chunk + char;
    if (chunk && context.measureText(candidate).width > maxWidth) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks.length ? chunks : [word];
}

/** Greedy word-wrap that also respects explicit newlines. */
function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replaceAll('\r', '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (context.measureText(word).width > maxWidth) {
        const chunks = breakLongWord(context, word, maxWidth);
        lines.push(...chunks.slice(0, -1));
        current = chunks[chunks.length - 1] ?? '';
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

/** Renders paragraph (box) text: wrap to the box width, shrink to fit the box height. */
function redrawBoxText(layer: Layer, box: BoxRect): void {
  const text = layer.text!;
  const style = text.style ?? {};
  const para = text.paragraphStyle ?? {};
  const ctx = resolveStyleContext(layer);

  const padLeft = Math.max(0, para.startIndent ?? 0);
  const padRight = Math.max(0, para.endIndent ?? 0);
  const availableWidth = Math.max(1, box.width - padLeft - padRight);

  const baseFontSize = Math.max(MIN_FONT_SIZE, Math.round(style.fontSize || box.height * 0.5));
  const leadingRatio =
    style.leading && style.fontSize ? style.leading / style.fontSize : text.paragraphStyle?.autoLeading || 1.2;
  const lineHeightRatio = Math.max(1.1, leadingRatio);

  const canvas = createCanvas(box.width, box.height);
  const context = canvas.getContext('2d');
  const applyFont = (size: number): void => {
    context.font = `${ctx.fontStyle} ${ctx.weight} ${size}px "${ctx.family}", sans-serif`;
  };

  // Shrink the font until the wrapped text fits the box height (down to a floor).
  let fontSize = baseFontSize;
  let lines: string[] = [];
  let lineHeight = baseFontSize * lineHeightRatio;
  for (; fontSize >= MIN_FONT_SIZE; fontSize -= 1) {
    applyFont(fontSize);
    lines = wrapText(context, text.text, availableWidth);
    lineHeight = fontSize * lineHeightRatio;
    if (lineHeight * lines.length <= box.height) break;
  }
  applyFont(Math.max(MIN_FONT_SIZE, fontSize));

  context.direction = ctx.isRtl ? 'rtl' : 'ltr';
  context.textAlign = ctx.align;
  context.textBaseline = 'top';
  context.fillStyle = ctx.fillStyle;
  context.strokeStyle = ctx.strokeStyle;
  context.lineWidth = ctx.lineWidth;

  const anchorX = ctx.align === 'center' ? box.width / 2 : ctx.align === 'right' ? box.width - padRight : padLeft;

  // Top-align the block within the box, matching how Photoshop lays out paragraph text.
  lines.forEach((line, index) => {
    paintLine(context, ctx, line, anchorX, index * lineHeight);
  });

  layer.canvas = canvas as unknown as HTMLCanvasElement;
  layer.left = box.x;
  layer.top = box.y;
  layer.right = box.x + box.width;
  layer.bottom = box.y + box.height;
  delete layer.imageData;
}

/** Renders point text: keep the original anchor but grow the canvas so nothing is clipped. */
function redrawPointText(layer: Layer): void {
  const text = layer.text!;
  const style = text.style ?? {};
  const ctx = resolveStyleContext(layer);

  const origLeft = layer.left ?? 0;
  const origTop = layer.top ?? 0;
  const origWidth = getLayerWidth(layer) || layer.canvas?.width || 0;
  const origHeight = getLayerHeight(layer) || layer.canvas?.height || 0;
  const fontSize = Math.max(6, Math.round(style.fontSize || origHeight * 0.75 || 24));
  const lineHeight = fontSize * (style.leading && style.fontSize ? style.leading / style.fontSize : 1.2);

  // Measure with the intended font so we can size the canvas to fit the new text.
  const measureCanvas = createCanvas(1, 1);
  const measureContext = measureCanvas.getContext('2d');
  measureContext.font = `${ctx.fontStyle} ${ctx.weight} ${fontSize}px "${ctx.family}", sans-serif`;
  const lines = text.text.replaceAll('\r', '').split('\n');
  const textWidth = Math.ceil(lines.reduce((max, line) => Math.max(max, measureContext.measureText(line).width), 0));

  const width = Math.max(origWidth, textWidth + 4);
  const height = Math.max(origHeight, Math.ceil(lineHeight * lines.length) + 4);
  if (width <= 0 || height <= 0) {
    throw new Error(`Text layer "${layer.name}" has no drawable bounds`);
  }

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.font = measureContext.font;
  context.direction = ctx.isRtl ? 'rtl' : 'ltr';
  context.textAlign = ctx.align;
  context.textBaseline = 'middle';
  context.fillStyle = ctx.fillStyle;
  context.strokeStyle = ctx.strokeStyle;
  context.lineWidth = ctx.lineWidth;

  const x = ctx.align === 'center' ? width / 2 : ctx.align === 'right' ? width : 0;
  const firstY = (height - lineHeight * lines.length) / 2 + lineHeight / 2;
  lines.forEach((line, index) => {
    paintLine(context, ctx, line, x, firstY + index * lineHeight);
  });

  // Keep the original edge fixed when the canvas grows so alignment is preserved.
  layer.left = ctx.align === 'right' ? origLeft + origWidth - width : ctx.align === 'center' ? Math.round(origLeft + (origWidth - width) / 2) : origLeft;
  layer.top = Math.round(origTop + (origHeight - height) / 2);
  layer.right = layer.left + width;
  layer.bottom = layer.top + height;
  layer.canvas = canvas as unknown as HTMLCanvasElement;
  delete layer.imageData;
}

function colorToCss(color: Color | undefined): string {
  const channel = (value = 0): number => Math.max(0, Math.min(255, Math.round(value)));
  if (!color) return 'rgb(0, 0, 0)';
  if ('r' in color) return `rgb(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)})`;
  if ('fr' in color) {
    return `rgb(${channel(color.fr * 255)}, ${channel(color.fg * 255)}, ${channel(color.fb * 255)})`;
  }
  return 'rgb(0, 0, 0)';
}
