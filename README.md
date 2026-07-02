# psd-editor

Edit reusable Photoshop PSD templates — replace named image and text layers, save the edited PSD, and render a PNG. The package exposes a single `PsdEditor` class with one main method. Written in TypeScript with ESM, CommonJS, and generated type declarations.

---

## Features

- **Single class API** — one import, one method
- Replace image layers by layer name or full layer path
- Replace editable text layers while preserving their original area and styling
- Use local image paths, HTTP/HTTPS image URLs, `Buffer`, or `Uint8Array`
- Save the edited PSD file back to disk
- Render the result to PNG
- Automatic cleanup of downloaded remote images after each operation
- Preserve placeholder alpha masks and non-rectangular image shapes
- Render solid vector layers found in the template
- Detect RTL text automatically while keeping English and other LTR text unchanged
- ESM and CommonJS support with first-class TypeScript types

---

## Installation

```bash
npm install psd-editor
```

`canvas` is a native dependency. Some Linux environments require Cairo/Pango system packages; follow the [node-canvas installation guide](https://github.com/Automattic/node-canvas#compiling) if npm cannot install its prebuilt binary.

---

## Basic usage

```ts
import { PsdEditor } from 'psd-editor';

const editor = new PsdEditor();

const result = await editor.edit({
  templatePath: './templates/social-post.psd',
  images: {
    IMAGE_1: './images/local-photo.jpg',
    'AR/front/Image_Logo': 'https://cdn.example.com/logo.png'
  },
  texts: {
    TITLE_1: 'A new English title',
    'AR/front/Trend Now/التريند الآن': 'التريند الآن'
  },
  description: 'Daily social media card',
  psdOutputPath: './output/edited.psd',
  pngOutputPath: './output/social-post.png'
});

console.log(result.pngOutputPath); // absolute path to the rendered PNG
console.log(result.psdOutputPath); // absolute path to the edited PSD
console.log(result.width, result.height);
```

If output paths are omitted, use the returned buffer directly:

```ts
const { pngBuffer } = await editor.edit({
  templatePath: './template.psd',
  images: { PHOTO: './photo.jpg' }
});

await uploadSomewhere(pngBuffer);
```

---

## Image sources

Each value in `images` can be one of the following:

```ts
type ImageSource = string | URL | Buffer | Uint8Array;
```

### Local files

Relative local paths are resolved from `process.cwd()`:

```ts
images: {
  COVER: './assets/cover.jpg'
}
```

### Remote image URLs

HTTP and HTTPS URLs are downloaded into memory automatically:

```ts
images: {
  AVATAR: 'https://images.example.com/avatar.webp'
}
```

Remote downloads default to a 15-second timeout and a 20 MiB maximum size. Both are configurable:

```ts
await editor.edit({
  templatePath: './template.psd',
  images: {
    PHOTO: 'https://private-cdn.example.com/photo.jpg'
  },
  remoteImages: {
    timeoutMs: 10_000,
    maxBytes: 8 * 1024 * 1024,
    headers: {
      Authorization: `Bearer ${process.env.CDN_TOKEN}`
    }
  }
});
```

> **Automatic cleanup** — All downloaded remote images are released from memory after `edit()` completes, even if an error occurs.

> **Important image notes**
>
> - Remote images are fully downloaded into memory before decoding. Choose a sensible `maxBytes` value for your server.
> - The caller is responsible for deciding which URLs are trusted. Do not pass arbitrary user-controlled URLs from an untrusted request without SSRF protection.
> - Redirects follow the standard Node.js `fetch` behavior.
> - Supported formats are determined by the installed `canvas` build. PNG and JPEG are the safest choices; WebP/GIF/SVG support can vary by platform.
> - Images use a centered `cover` crop and retain the alpha shape of the original placeholder layer or mask.

---

## Finding layer names

Use the static `listLayers` method to inspect all slash-separated paths:

```ts
import { PsdEditor } from 'psd-editor';

console.log(PsdEditor.listLayers('./template.psd'));
```

Layer matching is case-insensitive. If the same name occurs more than once, pass its full path to remove ambiguity.

---

## Text and fonts

```ts
texts: {
  TITLE: 'English title',
  ARABIC_TITLE: 'عنوان عربي'
}
```

The package detects text direction from the content. It does not lock a template to Arabic or English.

Fonts referenced by the PSD must be installed on the operating system where rendering runs. PSD files store the font name, not the font file. If a font is missing, `canvas`/Pango uses a fallback font. On Ubuntu, install fonts in `~/.local/share/fonts` or `/usr/local/share/fonts`, then run `fc-cache -f`.

Text is fitted into the original layer bounds. Complex Photoshop typography—multiple style runs, advanced tracking, warping, and paragraph composition—cannot be reproduced exactly by `canvas`.

---

## API

### `PsdEditor`

The main class. Create an instance and call `edit()`:

```ts
const editor = new PsdEditor();
```

### `editor.edit(options)`

```ts
interface EditOptions {
  templatePath: string;
  images?: Record<string, ImageSource>;
  texts?: Record<string, string>;
  description?: string;
  psdOutputPath?: string;
  pngOutputPath?: string;
  remoteImages?: {
    timeoutMs?: number;
    maxBytes?: number;
    headers?: Record<string, string>;
  };
  logger?: (message: string) => void;
}
```

Returns:

```ts
interface EditResult {
  pngBuffer: Buffer;
  width: number;
  height: number;
  description?: string;
  pngOutputPath?: string;
  psdOutputPath?: string;
}
```

### `PsdEditor.listLayers(templatePath)`

Static method. Returns every layer path in template order as `string[]`.

---

## Runtime dependencies

| Package | Purpose |
| --- | --- |
| [`ag-psd`](https://www.npmjs.com/package/ag-psd) | Read and write PSD structure, layer data, masks, vectors, and text metadata |
| [`canvas`](https://www.npmjs.com/package/canvas) | Decode images and render the final PNG |

No separate HTTP client is used; remote images use the Node.js `fetch` implementation.

---

## Compatibility

- Node.js 18 or newer
- ESM and CommonJS
- TypeScript declarations included
- Windows, macOS, and Linux where `canvas` is supported

---

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

To inspect exactly what npm will publish:

```bash
npm pack --dry-run
```

---

## License

MIT
