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

function redrawTextLayer(layer: Layer): void {
  const text = layer.text;
  if (!text) return;

  const style = text.style ?? {};
  const width = getLayerWidth(layer) || layer.canvas?.width || 0;
  const height = getLayerHeight(layer) || layer.canvas?.height || 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`Text layer "${layer.name}" has no drawable bounds`);
  }

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const lines = text.text.replaceAll('\r', '').split('\n');
  const isRtl = /[\u0590-\u08ff]/.test(text.text);
  const family = style.font?.name || 'sans-serif';
  const weight = style.fauxBold ? 'bold' : 'normal';
  const fontStyle = style.fauxItalic ? 'italic' : 'normal';
  const fontSize = Math.max(6, Math.round(style.fontSize || height * 0.75));

  context.direction = isRtl ? 'rtl' : 'ltr';
  context.font = `${fontStyle} ${weight} ${fontSize}px "${family}", sans-serif`;

  const justification = text.paragraphStyle?.justification;
  context.textAlign = justification === 'center' ? 'center' : justification === 'right' || isRtl ? 'right' : 'left';
  context.textBaseline = 'middle';

  const x = context.textAlign === 'center' ? width / 2 : context.textAlign === 'right' ? width : 0;
  const lineHeight = fontSize * 1.2;
  const firstY = (height - lineHeight * lines.length) / 2 + lineHeight / 2;
  context.fillStyle = colorToCss(style.fillColor);
  context.strokeStyle = colorToCss(style.strokeColor);
  context.lineWidth = style.outlineWidth || 1;

  lines.forEach((line, index) => {
    const y = firstY + index * lineHeight;
    if (style.strokeFlag && style.fillFirst === false) context.strokeText(line, x, y);
    if (style.fillFlag !== false) context.fillText(line, x, y);
    if (style.strokeFlag && style.fillFirst !== false) context.strokeText(line, x, y);
  });

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
