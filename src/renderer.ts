import type { Canvas, CanvasRenderingContext2D, GlobalCompositeOperation } from 'canvas';
import { createCanvas } from 'canvas';
import type { Color, Layer, Psd } from 'ag-psd';

export function renderPsd(psd: Psd): Canvas {
  const canvas = createCanvas(psd.width, psd.height);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, psd.width, psd.height);
  drawChildren(context, psd.children ?? []);
  return canvas;
}

function drawChildren(context: CanvasRenderingContext2D, children: Layer[]): void {
  // ag-psd exposes this document's layers from bottom to top.
  for (const layer of children) drawLayer(context, layer);
}

function drawLayer(context: CanvasRenderingContext2D, layer: Layer): void {
  if (layer.hidden) return;

  if (layer.children) {
    drawChildren(context, layer.children);
    return;
  }

  if (!layer.canvas && layer.vectorFill?.type === 'color' && layer.vectorMask) {
    drawVectorLayer(context, layer);
    return;
  }
  if (!layer.canvas) return;

  context.save();
  context.globalAlpha = normalizeOpacity(layer.opacity);
  context.globalCompositeOperation = mapBlendMode(layer.blendMode);
  context.drawImage(layer.canvas as unknown as Canvas, layer.left ?? 0, layer.top ?? 0);
  context.restore();
}

function drawVectorLayer(context: CanvasRenderingContext2D, layer: Layer): void {
  if (layer.vectorFill?.type !== 'color' || !layer.vectorMask) return;

  context.save();
  context.globalAlpha = normalizeOpacity(layer.opacity);
  context.globalCompositeOperation = mapBlendMode(layer.blendMode);
  context.fillStyle = colorToCss(layer.vectorFill.color);
  context.beginPath();

  for (const vectorPath of layer.vectorMask.paths ?? []) {
    const knots = vectorPath.knots ?? [];
    const firstKnot = knots[0];
    if (!firstKnot) continue;

    context.moveTo(firstKnot.points[2] ?? 0, firstKnot.points[3] ?? 0);
    for (let index = 1; index < knots.length; index += 1) {
      const previous = knots[index - 1];
      const current = knots[index];
      if (!previous || !current) continue;
      context.bezierCurveTo(
        previous.points[4] ?? 0,
        previous.points[5] ?? 0,
        current.points[0] ?? 0,
        current.points[1] ?? 0,
        current.points[2] ?? 0,
        current.points[3] ?? 0
      );
    }

    if (!vectorPath.open) {
      const last = knots.at(-1);
      if (last) {
        context.bezierCurveTo(
          last.points[4] ?? 0,
          last.points[5] ?? 0,
          firstKnot.points[0] ?? 0,
          firstKnot.points[1] ?? 0,
          firstKnot.points[2] ?? 0,
          firstKnot.points[3] ?? 0
        );
      }
      context.closePath();
    }
  }

  const fillRule = layer.vectorMask.paths?.[0]?.fillRule === 'even-odd' ? 'evenodd' : 'nonzero';
  context.fill(fillRule);
  context.restore();
}

function normalizeOpacity(opacity: number | undefined): number {
  if (typeof opacity !== 'number') return 1;
  const normalized = opacity > 1 ? opacity / 255 : opacity;
  return Math.max(0, Math.min(1, normalized));
}

function mapBlendMode(blendMode: string | undefined): GlobalCompositeOperation {
  const modes: Record<string, GlobalCompositeOperation> = {
    normal: 'source-over',
    'pass through': 'source-over',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    darken: 'darken',
    lighten: 'lighten',
    'color dodge': 'color-dodge',
    'color burn': 'color-burn',
    'hard light': 'hard-light',
    'soft light': 'soft-light',
    difference: 'difference',
    exclusion: 'exclusion',
    hue: 'hue',
    saturation: 'saturation',
    color: 'color',
    luminosity: 'luminosity'
  };
  return modes[blendMode ?? 'normal'] ?? 'source-over';
}

function colorToCss(color: Color): string {
  const channel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
  if ('r' in color) return `rgb(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)})`;
  if ('fr' in color) {
    return `rgb(${channel(color.fr * 255)}, ${channel(color.fg * 255)}, ${channel(color.fb * 255)})`;
  }
  return 'rgb(0, 0, 0)';
}
