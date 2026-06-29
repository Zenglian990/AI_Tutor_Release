import React from 'react';
import { vi } from 'vitest';

if (typeof window !== 'undefined') {
  // Make React global to prevent ReferenceError: React is not defined in JSX compiled files
  (window as any).React = React;
  (global as any).React = React;

  // Polyfill Web Crypto API using Node.js native webcrypto
  if (!window.crypto) {
    (window as any).crypto = require('crypto').webcrypto;
  } else if (!window.crypto.subtle) {
    (window as any).crypto.subtle = require('crypto').webcrypto.subtle;
  }

  // Mock global fetch to prevent relative path error in Undici Node environment
  (global as any).fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/chat-history')) {
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
  (window as any).fetch = (global as any).fetch;

  // Stub Worker class
  if (!window.Worker) {
    (window as any).Worker = class {
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
    };
  }

  // Stub Element.prototype.scrollIntoView
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function() {};
  }

  // Stub Canvas context (JSDOM defines it, but its implementation throws "Not implemented")
  HTMLCanvasElement.prototype.getContext = function (contextId: string) {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray() }),
      putImageData: () => {},
      createImageData: () => ({}),
      drawImage: () => {},
    };
  } as any;

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
