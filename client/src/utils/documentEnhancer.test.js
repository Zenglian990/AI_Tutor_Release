import { describe, it, expect, vi } from 'vitest';
import {
  eraseHandwritingAndRestorePaper,
  eraseTeacherRedInk,
  removeShadowsAndEnhance
} from './documentEnhancer';

describe('DocumentEnhancer Clean Slate Restorer', () => {
  function createMockCanvas(width, height, pixelInitFn) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const { r, g, b, a = 255 } = pixelInitFn(i % width, Math.floor(i / width));
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }

    const mockCtx = {
      getImageData: vi.fn(() => ({
        width,
        height,
        data: new Uint8ClampedArray(pixels)
      })),
      putImageData: vi.fn((imgData) => {
        for (let j = 0; j < imgData.data.length; j++) {
          pixels[j] = imgData.data[j];
        }
      })
    };

    return {
      width,
      height,
      getContext: vi.fn(() => mockCtx),
      _rawPixels: pixels
    };
  }

  it('erases teacher red grading marks and replaces with paper background', () => {
    // 20x20 mock paper, mostly white paper (240, 240, 240), with a red checkmark at center (230, 20, 20)
    const canvas = createMockCanvas(20, 20, (x, y) => {
      if (x === 10 && y === 10) {
        return { r: 235, g: 30, b: 30 }; // Red pen
      }
      return { r: 242, g: 242, b: 242 }; // White paper
    });

    eraseTeacherRedInk(canvas, { targetWhite: 250 });

    const pixelIdx = (10 * 20 + 10) * 4;
    expect(canvas._rawPixels[pixelIdx]).toBe(250);
    expect(canvas._rawPixels[pixelIdx + 1]).toBe(250);
    expect(canvas._rawPixels[pixelIdx + 2]).toBe(250);
  });

  it('erases student pencil and ink handwriting while preserving printed black text', () => {
    // 30x30 canvas:
    // (5, 5) -> Solid printed black text (r: 25, g: 25, b: 25)
    // (15, 15) -> Student pencil handwriting (r: 120, g: 120, b: 120)
    // (20, 20) -> Teacher red pen (r: 220, g: 40, b: 40)
    // (25, 25) -> Blue gel pen (r: 40, g: 40, b: 210)
    const canvas = createMockCanvas(30, 30, (x, y) => {
      if (x === 5 && y === 5) return { r: 25, g: 25, b: 25 };      // Printed black font
      if (x === 15 && y === 15) return { r: 120, g: 120, b: 120 }; // Student pencil
      if (x === 20 && y === 20) return { r: 220, g: 40, b: 40 };   // Red pen mark
      if (x === 25 && y === 25) return { r: 40, g: 40, b: 210 };   // Blue pen mark
      return { r: 245, g: 245, b: 245 };                           // Crisp paper
    });

    eraseHandwritingAndRestorePaper(canvas, {
      printedDarknessMax: 68,
      pencilUpperLimit: 185,
      targetWhite: 252
    });

    const printedIdx = (5 * 30 + 5) * 4;
    const pencilIdx = (15 * 30 + 15) * 4;
    const redIdx = (20 * 30 + 20) * 4;
    const blueIdx = (25 * 30 + 25) * 4;

    // Printed text must remain untouched (< 68 darkness)
    expect(canvas._rawPixels[printedIdx]).toBe(25);
    expect(canvas._rawPixels[printedIdx + 1]).toBe(25);
    expect(canvas._rawPixels[printedIdx + 2]).toBe(25);

    // Pencil handwriting must be restored to white paper (>= 250)
    expect(canvas._rawPixels[pencilIdx]).toBeGreaterThanOrEqual(250);

    // Red pen must be restored to white paper (>= 250)
    expect(canvas._rawPixels[redIdx]).toBeGreaterThanOrEqual(250);

    // Blue pen must be restored to white paper (>= 250)
    expect(canvas._rawPixels[blueIdx]).toBeGreaterThanOrEqual(250);
  });
});
