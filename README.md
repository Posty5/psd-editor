# @posty5/psd-editor

Edit reusable Photoshop PSD templates — replace named image and text layers, save the edited PSD, and render a PNG or JPEG. One class, one method, zero hassle.

---

## 🌟 What is @posty5/psd-editor?

**@posty5/psd-editor** is a Node.js package that lets you programmatically edit PSD templates. It exposes a single `PsdEditor` class with one main method — `edit()` — making integration as simple as possible.

- 🖼️ **Replace Image Layers** — Swap placeholders with local files or remote URLs
- ✏️ **Replace Text Layers** — Update text content with automatic RTL detection
- 💾 **Save Edited PSD** — Write the modified PSD back to disk
- 🎨 **Render PNG or JPEG** — Flatten and export the result in your preferred format
- 🔍 **High-Quality Output** — Scale up to 2×, 3×, or any multiplier for Retina/print
- 🎯 **JPEG Quality Control** — Fine-tune compression between 0 (smallest) and 1 (best)
- 🧹 **Auto Cleanup** — Downloaded remote images are released from memory automatically
- 📦 **Single API** — One class, one method, typed with TypeScript

**Part of the Posty5 ecosystem:** [https://posty5.com](https://posty5.com)

---

## 📦 Installation

```bash
npm install @posty5/psd-editor
```

> **Note:** `canvas` is a native dependency. Some Linux environments require Cairo/Pango system packages. Follow the [node-canvas installation guide](https://github.com/Automattic/node-canvas#compiling) if npm cannot install its prebuilt binary.

---

## 🚀 Quick Start

```typescript
import { PsdEditor } from '@posty5/psd-editor';

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
  outputFormat: 'jpeg',
  quality: 0.92,
  psdOutputPath: './output/edited.psd',
  outputPath: './output/social-post.jpg'
});

console.log(result.outputPath);   // absolute path to the rendered image
console.log(result.psdOutputPath); // absolute path to the edited PSD
console.log(result.width, result.height);
```

If output paths are omitted, use the returned buffer directly:

```typescript
const { imageBuffer } = await editor.edit({
  templatePath: './template.psd',
  images: { PHOTO: './photo.jpg' }
});

await uploadSomewhere(imageBuffer);
```

---

## 📚 API Documentation

### `PsdEditor` Class

The main entry point. Create an instance and call `edit()`:

```typescript
import { PsdEditor } from '@posty5/psd-editor';

const editor = new PsdEditor();
```

---

### `editor.edit(options)` — Edit a PSD Template

Replace image and text layers, save the edited PSD, and render an image.

**Parameters:**

```typescript
interface EditOptions {
  templatePath: string;                        // Path to the source PSD template
  images?: Record<string, ImageSource>;        // Layer name → image source
  texts?: Record<string, string>;              // Layer name → replacement text
  description?: string;                        // Optional label for the result
  psdOutputPath?: string;                      // Save edited PSD to this path
  outputPath?: string;                         // Save rendered image to this path
  outputFormat?: 'png' | 'jpeg';              // Output format (default: 'png')
  quality?: number;                            // JPEG quality 0–1 (default: 0.92)
  scale?: number;                              // Resolution multiplier (default: 1)
  remoteImages?: {
    timeoutMs?: number;                        // Download timeout (default: 15s)
    maxBytes?: number;                         // Max download size (default: 20 MiB)
    headers?: Record<string, string>;          // HTTP headers for remote downloads
  };
  logger?: (message: string) => void;          // Progress callback
}
```

**Returns:**

```typescript
interface EditResult {
  imageBuffer: Buffer;       // Rendered image data (PNG or JPEG)
  outputFormat: 'png' | 'jpeg'; // Format of imageBuffer
  width: number;             // Logical PSD width in pixels (before scale)
  height: number;            // Logical PSD height in pixels (before scale)
  renderedWidth: number;     // Actual image width (width × scale)
  renderedHeight: number;    // Actual image height (height × scale)
  description?: string;      // Label when provided
  outputPath?: string;       // Absolute path when outputPath was set
  psdOutputPath?: string;    // Absolute path when psdOutputPath was set
}
```

---

### `PsdEditor.listLayers(templatePath)` — Inspect Template Layers

Static method. Returns every layer path in template order as `string[]`.

```typescript
import { PsdEditor } from '@posty5/psd-editor';

const layers = PsdEditor.listLayers('./template.psd');
console.log(layers);
// ['Background', 'Group/IMAGE_1', 'Group/TITLE_1', ...]
```

Layer matching is case-insensitive. If the same name occurs more than once, pass its full path to remove ambiguity.

---

## 🎯 Output Format & Quality

Control the output format and compression quality via `outputFormat` and `quality`.

### PNG (default — lossless)

```typescript
const result = await editor.edit({
  templatePath: './template.psd',
  images: { PHOTO: './photo.jpg' },
  outputFormat: 'png',          // lossless, larger file
  outputPath: './output/result.png'
});
```

### JPEG (lossy — smaller file size)

```typescript
const result = await editor.edit({
  templatePath: './template.psd',
  images: { PHOTO: './photo.jpg' },
  outputFormat: 'jpeg',
  quality: 0.9,                 // 0 = smallest file, 1 = best quality
  outputPath: './output/result.jpg'
});
```

| `quality` | Description |
| --- | --- |
| `1.0` | Maximum quality, largest file |
| `0.92` | Default — excellent quality, good compression |
| `0.8` | Good quality, noticeably smaller file |
| `0.6` | Moderate quality, very small file |
| `0` | Minimum quality, smallest file |

> `quality` only applies when `outputFormat` is `'jpeg'`. It is ignored for PNG.

### Using the buffer directly

```typescript
const result = await editor.edit({
  templatePath: './template.psd',
  images: { PHOTO: './photo.jpg' },
  outputFormat: 'jpeg',
  quality: 0.85
});

// result.imageBuffer — ready to upload, stream, or store
console.log(result.outputFormat); // 'jpeg'
await s3.putObject({ Body: result.imageBuffer, ContentType: 'image/jpeg' });
```

---

## 🔍 High-Quality Output (scale)

Use the `scale` option to render the image at a higher resolution than the native PSD size. Ideal for print, Retina displays, or any output that requires more pixels.

| `scale` | Output size for a 1254×960 PSD |
| --- | --- |
| `1` (default) | 1254 × 960 px |
| `2` | 2508 × 1920 px |
| `3` | 3762 × 2880 px |

```typescript
const result = await editor.edit({
  templatePath: './template.psd',
  images: { PHOTO: './photo.jpg' },
  outputFormat: 'jpeg',
  quality: 0.92,
  scale: 2,                     // 2× resolution
  outputPath: './output/result@2x.jpg'
});

console.log(result.width);          // 1254 — logical PSD width
console.log(result.renderedWidth);  // 2508 — actual pixel width in the file
```

> `scale` must be a positive number. Fractional values (e.g. `0.5`) are also accepted to downscale.

---

## 🖼️ Image Sources

Each value in `images` accepts one of the following:

```typescript
type ImageSource = string | URL | Buffer | Uint8Array;
```

| Source Type | Example | Notes |
| --- | --- | --- |
| **Local file** | `'./assets/cover.jpg'` | Resolved from `process.cwd()` |
| **Remote URL** | `'https://cdn.example.com/photo.png'` | Downloaded automatically |
| **URL object** | `new URL('https://...')` | Same as string URL |
| **Buffer** | `fs.readFileSync('./img.png')` | In-memory image data |
| **Uint8Array** | Raw byte array | Converted to Buffer internally |

### Remote Image Configuration

```typescript
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

> **🧹 Automatic cleanup** — All downloaded remote images are released from memory after `edit()` completes, even if an error occurs.

> **⚠️ Security** — The caller is responsible for URL trust. Do not pass arbitrary user-controlled URLs without SSRF protection.

---

## ✏️ Text and Fonts

```typescript
texts: {
  TITLE: 'English title',
  ARABIC_TITLE: 'عنوان عربي'
}
```

**Key behaviors:**

- 🔄 **Auto-direction** — RTL/LTR is detected from content, not locked to the template
- 📐 **Auto-fit** — Text is scaled to fit within the original layer bounds
- 🔤 **System fonts** — Fonts referenced by the PSD must be installed on the OS

> **Tip:** On Ubuntu, install fonts in `~/.local/share/fonts` or `/usr/local/share/fonts`, then run `fc-cache -f`.

---

## 🔧 Runtime Dependencies

| Package | Purpose |
| --- | --- |
| [`ag-psd`](https://www.npmjs.com/package/ag-psd) | Read and write PSD structure, layer data, masks, vectors, and text metadata |
| [`canvas`](https://www.npmjs.com/package/canvas) | Decode images and render the final PNG or JPEG |

No separate HTTP client is used — remote images use the built-in Node.js `fetch`.

---

## 💻 Node.js Compatibility

- **Node.js**: >= 18.0.0
- **Module Systems**: ESM and CommonJS
- **TypeScript**: Full type definitions included

---

## 🛠️ Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

To inspect what npm will publish:

```bash
npm pack --dry-run
```

---

## 📄 License

MIT — see [LICENSE](./LICENSE) for details.

---

## 🔗 Useful Links

- **Website**: [https://posty5.com](https://posty5.com)
- **Dashboard**: [studio.posty5.com/account/settings?tab=APIKeys](studio.posty5.com/account/settings?tab=APIKeys)
- **API Documentation**: [https://docs.posty5.com](https://docs.posty5.com)
- **GitHub**: [https://github.com/Posty5/npm-sdk](https://github.com/Posty5/npm-sdk)

---

Made with ❤️ by the Posty5 team
