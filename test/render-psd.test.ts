import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import 'ag-psd/initialize-canvas.js';
import { writePsdBuffer } from 'ag-psd';
import { createCanvas, loadImage } from 'canvas';
import { afterEach, describe, expect, it } from 'vitest';
import { PsdEditor } from '../src/index.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('PsdEditor.edit', () => {
  const editor = new PsdEditor();

  it('replaces a layer with a local image and writes a PNG', async () => {
    const fixture = createFixture();
    const redImage = createPng('#ff0000');
    const imagePath = path.join(fixture.directory, 'red.png');
    const outputPath = path.join(fixture.directory, 'nested', 'result.png');
    fs.writeFileSync(imagePath, redImage);

    const result = await editor.edit({
      templatePath: fixture.templatePath,
      images: { PHOTO: imagePath },
      outputPath
    });

    expect(result.outputPath).toBe(path.resolve(outputPath));
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(result.outputFormat).toBe('png');
    expect(await readPixel(result.imageBuffer, 10, 10)).toEqual([255, 0, 0, 255]);
  });

  it('downloads and uses an HTTP image URL', async () => {
    const fixture = createFixture();
    const blueImage = createPng('#0000ff');
    const server = http.createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': blueImage.length
      });
      response.end(blueImage);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server has no TCP port');

    try {
      const result = await editor.edit({
        templatePath: fixture.templatePath,
        images: { PHOTO: `http://127.0.0.1:${address.port}/image.png` }
      });
      expect(await readPixel(result.imageBuffer, 10, 10)).toEqual([0, 0, 255, 255]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('saves the edited PSD file', async () => {
    const fixture = createFixture();
    const redImage = createPng('#ff0000');
    const imagePath = path.join(fixture.directory, 'red.png');
    const psdOutputPath = path.join(fixture.directory, 'edited.psd');
    const outputPath = path.join(fixture.directory, 'result.png');
    fs.writeFileSync(imagePath, redImage);

    const result = await editor.edit({
      templatePath: fixture.templatePath,
      images: { PHOTO: imagePath },
      psdOutputPath,
      outputPath
    });

    expect(result.psdOutputPath).toBe(path.resolve(psdOutputPath));
    expect(fs.existsSync(psdOutputPath)).toBe(true);
    expect(result.outputPath).toBe(path.resolve(outputPath));
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('returns buffer only when no output paths are provided', async () => {
    const fixture = createFixture();
    const redImage = createPng('#ff0000');
    const imagePath = path.join(fixture.directory, 'red.png');
    fs.writeFileSync(imagePath, redImage);

    const result = await editor.edit({
      templatePath: fixture.templatePath,
      images: { PHOTO: imagePath }
    });

    expect(result.imageBuffer).toBeInstanceOf(Buffer);
    expect(result.outputPath).toBeUndefined();
    expect(result.psdOutputPath).toBeUndefined();
  });

  it('renders JPEG with quality option', async () => {
    const fixture = createFixture();
    const redImage = createPng('#ff0000');
    const imagePath = path.join(fixture.directory, 'red.png');
    const outputPath = path.join(fixture.directory, 'result.jpg');
    fs.writeFileSync(imagePath, redImage);

    const result = await editor.edit({
      templatePath: fixture.templatePath,
      images: { PHOTO: imagePath },
      outputFormat: 'jpeg',
      quality: 0.8,
      outputPath
    });

    expect(result.outputFormat).toBe('jpeg');
    expect(result.imageBuffer).toBeInstanceOf(Buffer);
    expect(result.imageBuffer.length).toBeGreaterThan(0);
    expect(fs.existsSync(outputPath)).toBe(true);
  });
});

describe('PsdEditor.listLayers', () => {
  it('returns all layer paths in the template', () => {
    const fixture = createFixture();
    expect(PsdEditor.listLayers(fixture.templatePath)).toEqual(['BACKGROUND', 'PHOTO']);
  });
});

describe('Real template integration', () => {
  const editor = new PsdEditor();
  const testDir = path.resolve(__dirname, '.');
  const templatePath = path.join(testDir, 'template.psd');
  const imagesDir = path.join(testDir, 'images');
  const outputDir = path.join(testDir, 'output');

  it('edits the real template with local images and saves output for preview', async () => {
    // Ensure clean output directory
    fs.mkdirSync(outputDir, { recursive: true });

    const result = await editor.edit({
      templatePath,
      images: {
        ArticleImage1: path.join(imagesDir, 'img1.jpg'),
        ArticleImage2: path.join(imagesDir, 'img2.jpg'),
        ArticleImage3: path.join(imagesDir, 'img3.jpg'),
        'GEO Logo/GEOLogo': path.join(imagesDir, 'logo.png')
      },
      texts: {
        'Title/TITLE_1': 'As you know we relay love P O S T Y 5 . C O M',
        platformUserName:"TrendDigestUk"
      },
      scale: 2,
      outputFormat: 'jpeg',
      quality: 1,
      psdOutputPath: path.join(outputDir, 'edited.psd'),
      outputPath: path.join(outputDir, 'result.jpg'),
      logger: console.log
    });

    expect(result.outputPath).toBeDefined();
    expect(result.psdOutputPath).toBeDefined();
    expect(fs.existsSync(result.outputPath!)).toBe(true);
    expect(fs.existsSync(result.psdOutputPath!)).toBe(true);
    expect(result.outputFormat).toBe('jpeg');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    // 2x scale: rendered dimensions must be double the logical PSD dimensions
    expect(result.renderedWidth).toBe(result.width * 2);
    expect(result.renderedHeight).toBe(result.height * 2);

    console.log(`\n✅ Preview output at:\n  JPEG: ${result.outputPath} (${result.renderedWidth}x${result.renderedHeight} @ 2x, quality 0.92)\n  PSD: ${result.psdOutputPath}\n`);
  });
});

function createFixture(): { directory: string; templatePath: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'psd-editor-'));
  temporaryDirectories.push(directory);
  const templatePath = path.join(directory, 'template.psd');

  const background = createCanvas(20, 20);
  background.getContext('2d').fillStyle = '#ffffff';
  background.getContext('2d').fillRect(0, 0, 20, 20);

  const placeholder = createCanvas(20, 20);
  placeholder.getContext('2d').fillStyle = '#808080';
  placeholder.getContext('2d').fillRect(0, 0, 20, 20);

  const composite = createCanvas(20, 20);
  composite.getContext('2d').drawImage(placeholder, 0, 0);

  const psd = {
    width: 20,
    height: 20,
    canvas: composite as unknown as HTMLCanvasElement,
    children: [
      {
        name: 'BACKGROUND',
        left: 0,
        top: 0,
        right: 20,
        bottom: 20,
        canvas: background as unknown as HTMLCanvasElement
      },
      {
        name: 'PHOTO',
        left: 0,
        top: 0,
        right: 20,
        bottom: 20,
        canvas: placeholder as unknown as HTMLCanvasElement
      }
    ]
  };

  fs.writeFileSync(templatePath, writePsdBuffer(psd));
  return { directory, templatePath };
}

function createPng(color: string): Buffer {
  const canvas = createCanvas(20, 20);
  canvas.getContext('2d').fillStyle = color;
  canvas.getContext('2d').fillRect(0, 0, 20, 20);
  return canvas.toBuffer('image/png');
}

async function readPixel(buffer: Buffer, x: number, y: number): Promise<number[]> {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return [...context.getImageData(x, y, 1, 1).data];
}
