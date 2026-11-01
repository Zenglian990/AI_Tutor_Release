import React from 'react';
import { vi } from 'vitest';

if (typeof window !== 'undefined') {
  // Make React global to prevent ReferenceError: React is not defined in JSX compiled files
  window.React = React;
  if (typeof global !== 'undefined') {
    global.React = React;
  }

  // Polyfill Web Crypto API using Node.js native webcrypto
  if (!window.crypto) {
    window.crypto = require('crypto').webcrypto;
  } else if (!window.crypto.subtle) {
    window.crypto.subtle = require('crypto').webcrypto.subtle;
  }

  // Mock global fetch to prevent relative path error in Undici Node environment
  const mockFetch = vi.fn().mockImplementation((url) => {
    if (url && typeof url === 'string' && url.includes('/api/chat-history')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ history: [] }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  });
  if (typeof global !== 'undefined') {
    global.fetch = mockFetch;
  }
  window.fetch = mockFetch;

  // Stub Worker class with basic message echoing capability
  if (!window.Worker) {
    class MockWorker {
      constructor() {
        this.onmessage = null;
        this.onmessageerror = null;
        this.onerror = null;
      }
      postMessage(message) {
        if (this.onmessage) {
          setTimeout(() => this.onmessage({ data: message }), 0);
        }
      }
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    }
    window.Worker = MockWorker;
  }

  // Stub Element.prototype.scrollIntoView
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function() {};
  }

  // Robust stub for Canvas context (avoids noisy JSDOM "Not implemented" stderr warnings)
  HTMLCanvasElement.prototype.getContext = function (contextId) {
    if (contextId === '2d' || contextId === 'bitmaprenderer') {
      return {
        canvas: this,
        fillRect: () => {},
        clearRect: () => {},
        getImageData: (x = 0, y = 0, w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {},
        createImageData: (w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        drawImage: () => {},
        getContextAttributes: () => ({}),
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        arc: () => {},
        arcTo: () => {},
        ellipse: () => {},
        rect: () => {},
        stroke: () => {},
        fill: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
        fillText: () => {},
        strokeText: () => {},
        measureText: (text = '') => ({ width: text.length * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }),
        save: () => {},
        restore: () => {},
        scale: () => {},
        rotate: () => {},
        translate: () => {},
        transform: () => {},
        resetTransform: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => null,
        clip: () => {},
        isPointInPath: () => false,
        isPointInStroke: () => false,
      };
    }
    return null;
  };

  HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  };

  // Stub URL.createObjectURL/revokeObjectURL
  if (typeof URL !== 'undefined') {
    if (!URL.createObjectURL) {
      URL.createObjectURL = () => 'blob:mock-url';
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => {};
    }
  }
}
