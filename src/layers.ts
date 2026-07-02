import type { Layer, Psd } from 'ag-psd';

export interface LayerMatch {
  layer: Layer;
  path: string;
}

/** Finds a layer by case-insensitive name or full slash-separated path. */
export function findLayer(psd: Psd, nameOrPath: string): LayerMatch | null {
  const query = nameOrPath.toLocaleLowerCase();
  const matches = [...walkLayers(psd.children ?? [])].filter(({ layer, path }) => {
    return layer.name?.toLocaleLowerCase() === query || path.toLocaleLowerCase() === query;
  });

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    const paths = matches.map((match) => match.path).join('\n');
    throw new Error(`More than one layer matched "${nameOrPath}". Use a full path:\n${paths}`);
  }

  return matches[0] ?? null;
}

export function* walkLayers(children: Layer[], prefix = ''): Generator<LayerMatch> {
  for (const layer of children) {
    const name = layer.name || '(unnamed)';
    const currentPath = prefix ? `${prefix}/${name}` : name;
    yield { layer, path: currentPath };

    if (layer.children) yield* walkLayers(layer.children, currentPath);
  }
}

export function getLayerWidth(layer: Layer): number {
  if (typeof layer.left === 'number' && typeof layer.right === 'number') {
    return Math.round(layer.right - layer.left);
  }
  return layer.canvas?.width ?? 0;
}

export function getLayerHeight(layer: Layer): number {
  if (typeof layer.top === 'number' && typeof layer.bottom === 'number') {
    return Math.round(layer.bottom - layer.top);
  }
  return layer.canvas?.height ?? 0;
}
