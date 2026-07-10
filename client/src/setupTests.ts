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

  // Stub Worker class with basic message echoing capability
  if (!window.Worker) {
    class MockWorker implements Worker {
      onmessage: ((this: Worker, ev: MessageEvent) => any) | null = null;
      onmessageerror: ((this: Worker, ev: MessageEvent) => any) | null = null;
      onerror: ((this: AbstractWorker, ev: ErrorEvent) => any) | null = null;
      postMessage(message: any) {
        if (this.onmessage) {
          setTimeout(() => this.onmessage!({ data: message } as MessageEvent), 0);
        }
      }
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    }
    (window as any).Worker = MockWorker;
  }

  // Stub Element.prototype.scrollIntoView
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function() {};
  }

  // Safely stub Canvas context (Fallback for JSDOM "Not implemented")
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (contextId: string, options?: any): RenderingContext | null {
    if (originalGetContext) {
      try {
        const ctx = originalGetContext.call(this, contextId, options);
        if (ctx) return ctx;
      } catch (e) {
        // Fallback for JSDOM Not implemented
      }
    }
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ width: 0, height: 0, data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
      createImageData: () => ({ width: 0, height: 0, data: new Uint8ClampedArray(4) }),
      drawImage: () => {},
      getContextAttributes: () => ({}),
    } as unknown as RenderingContext;
  } as typeof HTMLCanvasElement.prototype.getContext;

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
