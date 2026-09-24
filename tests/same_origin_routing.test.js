const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mock browser environment to test same-origin resolution logic
test('Same-Origin Resolution: browser on localhost uses relative same-origin', () => {
  // Setup mock window & localStorage
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  global.window = {
    location: {
      origin: 'http://localhost:3001',
      protocol: 'http:',
      host: 'localhost:3001'
    }
  };

  // Re-evaluate logic matching useStore.jsx
  function isNativeMobilePlatform() {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.Capacitor?.isNativePlatform?.() ||
      window.location?.protocol === 'capacitor:' ||
      window.location?.protocol === 'ionic:'
    );
  }

  function getDefaultBackendUrl() {
    if (typeof window !== 'undefined') {
      if (!isNativeMobilePlatform() && window.location?.origin && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        return '';
      }
    }
    return 'https://ai-tutor-release.onrender.com';
  }

  function getApiUrl(path = '') {
    let backendUrl = localStorage.getItem('ai_tutor_backend_url') || '';
    if (typeof window !== 'undefined' && !isNativeMobilePlatform()) {
      if (backendUrl === 'https://ai-tutor-release.onrender.com' || backendUrl === 'https://ai-tutor-release.onrender.com/') {
        backendUrl = '';
      }
    }
    if (!backendUrl) {
      backendUrl = getDefaultBackendUrl();
    }
    const cleanBase = backendUrl ? backendUrl.replace(/\/+$/, '') : '';
    if (!path) {
      if (cleanBase) return cleanBase;
      if (typeof window !== 'undefined' && window.location?.origin && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        return window.location.origin;
      }
      return 'https://ai-tutor-release.onrender.com';
    }
    if (typeof path === 'string' && (path.startsWith('http://') || path.startsWith('https://'))) {
      return path;
    }
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return cleanBase ? cleanBase + cleanPath : cleanPath;
  }

  // 1. Without localStorage, relative API URL is returned
  assert.equal(getApiUrl('/api/chat'), '/api/chat');
  assert.equal(getApiUrl(), 'http://localhost:3001');

  // 2. If localStorage has legacy cloud URL, it is sanitized on localhost
  localStorage.setItem('ai_tutor_backend_url', 'https://ai-tutor-release.onrender.com');
  assert.equal(getApiUrl('/api/chat'), '/api/chat');

  // 3. If user explicitly configured a custom LAN server, it is honored
  localStorage.setItem('ai_tutor_backend_url', 'http://192.168.1.55:3001');
  assert.equal(getApiUrl('/api/chat'), 'http://192.168.1.55:3001/api/chat');
});

test('Same-Origin Resolution: native Capacitor app falls back to cloud', () => {
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  global.window = {
    location: {
      origin: 'capacitor://localhost',
      protocol: 'capacitor:',
      host: 'localhost'
    },
    Capacitor: {
      isNativePlatform: () => true
    }
  };

  function isNativeMobilePlatform() {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.Capacitor?.isNativePlatform?.() ||
      window.location?.protocol === 'capacitor:' ||
      window.location?.protocol === 'ionic:'
    );
  }

  function getDefaultBackendUrl() {
    if (typeof window !== 'undefined') {
      if (!isNativeMobilePlatform() && window.location?.origin && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        return '';
      }
    }
    return 'https://ai-tutor-release.onrender.com';
  }

  function getApiUrl(path = '') {
    let backendUrl = localStorage.getItem('ai_tutor_backend_url') || '';
    if (!backendUrl) {
      backendUrl = getDefaultBackendUrl();
    }
    const cleanBase = backendUrl ? backendUrl.replace(/\/+$/, '') : '';
    if (!path) return cleanBase;
    if (typeof path === 'string' && (path.startsWith('http://') || path.startsWith('https://'))) {
      return path;
    }
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return cleanBase ? cleanBase + cleanPath : cleanPath;
  }

  assert.equal(isNativeMobilePlatform(), true);
  assert.equal(getDefaultBackendUrl(), 'https://ai-tutor-release.onrender.com');
  assert.equal(getApiUrl('/api/chat'), 'https://ai-tutor-release.onrender.com/api/chat');
});
