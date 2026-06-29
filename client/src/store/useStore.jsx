import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getTranslation } from '../utils/i18n';

const AppContext = createContext(null);

const GRADE_MAP = {
  '1_up': '一年级上册', '1_down': '一年级下册',
  '2_up': '二年级上册', '2_down': '二年级下册',
  '3_up': '三年级上册', '3_down': '三年级下册',
  '4_up': '四年级上册', '4_down': '四年级下册',
  '5_up': '五年级上册', '5_down': '五年级下册',
  '6_up': '六年级上册', '6_down': '六年级下册',
  '7_up': '初一上册', '7_down': '初一下册',
  '8_up': '初二上册', '8_down': '初二下册',
  '9_up': '初三上册', '9_down': '初三下册',
  '1': '一年级', '2': '二年级', '3': '三年级', '4': '四年级', '5': '五年级', '6': '六年级',
  '7': '初一', '8': '初二', '9': '初三'
};

export function formatGrade(grade) {
  if (!grade || grade === 'unknown') return '通用';
  return GRADE_MAP[String(grade)] || `${grade}年级`;
}

/**
 * Get the full API URL for a path.
 * If a backend URL is configured (e.g., for mobile testing), it is prepended.
 */
function getApiUrl(path) {
  const backendUrl = localStorage.getItem('ai_tutor_backend_url') || '';
  if (!backendUrl) return path;
  const cleanBase = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return cleanBase + cleanPath;
}

/**
 * Get the stored API token.
 */
function getApiToken() {
  return localStorage.getItem('ai_tutor_api_token') || '';
}

async function generateSignature(token, path, method, body, timestamp, formFieldsStr = '', fileFieldsStr = '') {
  try {
    const encoder = new TextEncoder();
    const msg = `${method}:${path}:${body || ''}:${timestamp}:${formFieldsStr}:${fileFieldsStr}`;
    const keyData = encoder.encode(token);
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(msg));
    return Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (err) {
    console.error('Failed to generate signature:', err);
    return '';
  }
}

/**
 * Authenticated fetch wrapper.
 * Automatically injects Authorization header for all API requests.
 * Falls back gracefully if no token is configured (dev mode).
 */
async function authFetch(path, options = {}) {
  const url = getApiUrl(path);
  const token = getApiToken();

  const fetchOptions = { ...options };
  const headers = { ...(fetchOptions.headers || {}) };

  // Inject auth header for API calls
  if (token && path.startsWith('/api/')) {
    headers['Authorization'] = `Bearer ${token}`;

    const parentPinHash = sessionStorage.getItem('parent_gate_verified_pin_hash');
    if (parentPinHash) {
      headers['x-parent-pin-hash'] = parentPinHash;
    }

    // Generate and inject request signature
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const cleanPath = path.split('?')[0];
    const timestamp = Date.now().toString();
    const bodyStr = typeof fetchOptions.body === 'string' ? fetchOptions.body : '';

    let formFieldsStr = '';
    let fileFieldsStr = '';

    if (fetchOptions.body instanceof FormData) {
      const formFields = {};
      const fileFields = [];
      for (const [key, value] of fetchOptions.body.entries()) {
        if (typeof value === 'string') {
          formFields[key] = value;
        } else if (value instanceof File) {
          fileFields.push(`${key}:${value.name}:${value.size}`);
        }
      }
      formFieldsStr = JSON.stringify(formFields);
      fileFieldsStr = fileFields.join(',');
    }

    const encodedFormFields = encodeURIComponent(formFieldsStr);
    const encodedFileFields = encodeURIComponent(fileFieldsStr);

    const signature = await generateSignature(token, cleanPath, method, bodyStr, timestamp, encodedFormFields, encodedFileFields);
    if (signature) {
      headers['x-timestamp'] = timestamp;
      headers['x-signature'] = signature;
      if (fetchOptions.body instanceof FormData) {
        headers['x-form-fields'] = encodedFormFields;
        headers['x-file-fields'] = encodedFileFields;
      }
    }
  }

  fetchOptions.headers = headers;
  return fetch(url, fetchOptions);
}

const migrateGrade = (g) => {
  if (!g) return '';
  if (!String(g).includes('_')) return g + '_up';
  return g;
};

function loadProfiles() {
  const saved = localStorage.getItem('ai_tutor_profiles');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map(p => ({
          ...p,
          grade: migrateGrade(p.grade),
          edition: p.edition || '人教版'
        }));
      }
    } catch (e) { /* ignore */ }
  }
  const existingGrade = localStorage.getItem('ai_tutor_grade') || '';
  return [{ id: 'default', name: '默认用户', grade: migrateGrade(existingGrade), edition: '人教版' }];
}

export function AppProvider({ children }) {
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem('ai_tutor_backend_url') || '');
  const [apiToken, setApiToken] = useState(() => localStorage.getItem('ai_tutor_api_token') || '');
  const [profiles, setProfiles] = useState(loadProfiles);
  const [currentProfileId, setCurrentProfileId] = useState(() =>
    localStorage.getItem('ai_tutor_active_profile') || 'default'
  );
  const [selectedSubject, setSelectedSubject] = useState(() =>
    localStorage.getItem('ai_tutor_subject') || ''
  );
  const [socraticLevel, setSocraticLevel] = useState(() =>
    localStorage.getItem('ai_tutor_socratic_level') || 'guided'
  );
  const [autoRead, setAutoRead] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem('ai_tutor_language') || 'zh-CN');
  const [isLightMode, setIsLightMode] = useState(() =>
    localStorage.getItem('ai_tutor_theme') === 'light'
  );
  const [chatModel, setChatModel] = useState(() =>
    localStorage.getItem('ai_tutor_chat_model') || 'default'
  );

  const t = useCallback((key) => getTranslation(language, key), [language]);

  const currentProfile = profiles.find(p => p.id === currentProfileId) || profiles[0] || { id: 'default', name: '默认用户', grade: '' };

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('ai_tutor_profiles', JSON.stringify(profiles)); }, [profiles]);
  useEffect(() => { localStorage.setItem('ai_tutor_active_profile', currentProfileId); }, [currentProfileId]);
  useEffect(() => { localStorage.setItem('ai_tutor_subject', selectedSubject); }, [selectedSubject]);
  useEffect(() => { localStorage.setItem('ai_tutor_socratic_level', socraticLevel); }, [socraticLevel]);
  useEffect(() => { localStorage.setItem('ai_tutor_backend_url', backendUrl); }, [backendUrl]);
  useEffect(() => { localStorage.setItem('ai_tutor_api_token', apiToken); }, [apiToken]);
  useEffect(() => { localStorage.setItem('ai_tutor_language', language); }, [language]);
  useEffect(() => { localStorage.setItem('ai_tutor_chat_model', chatModel); }, [chatModel]);

  useEffect(() => {
    localStorage.setItem('ai_tutor_theme', isLightMode ? 'light' : 'dark');
    if (isLightMode) {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [isLightMode]);

  const handleProfileChange = useCallback((profileId) => {
    if (profileId === 'ADD_NEW') {
      return 'ADD_NEW';
    }
    setCurrentProfileId(profileId);
    return 'changed';
  }, []);

  const handleAddProfile = useCallback((name, grade, edition) => {
    const newProfile = { id: 'p_' + Date.now(), name, grade, edition: edition || '人教版' };
    setProfiles(prev => [...prev, newProfile]);
    setCurrentProfileId(newProfile.id);
    return newProfile;
  }, []);

  const handleDeleteProfile = useCallback((profileId) => {
    setProfiles(prev => prev.filter(p => p.id !== profileId));
    setCurrentProfileId('default');
  }, []);

  const handleGradeChange = useCallback((val) => {
    setProfiles(prev => prev.map(p => p.id === currentProfileId ? { ...p, grade: val } : p));
  }, [currentProfileId]);

  const handleEditionChange = useCallback((val) => {
    setProfiles(prev => prev.map(p => p.id === currentProfileId ? { ...p, edition: val } : p));
  }, [currentProfileId]);

  const value = {
    backendUrl, setBackendUrl,
    apiToken, setApiToken,
    profiles, currentProfileId, currentProfile,
    setCurrentProfileId, handleProfileChange,
    handleAddProfile, handleDeleteProfile,
    selectedSubject, setSelectedSubject,
    isSocratic: socraticLevel, setSocraticLevel,
    autoRead, setAutoRead,
    isLightMode, setIsLightMode,
    handleGradeChange,
    handleEditionChange,
    getApiUrl,
    authFetch,
    language, setLanguage, t,
    chatModel, setChatModel
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppStore must be used within AppProvider');
  return ctx;
}

export { getApiUrl, authFetch, getApiToken, GRADE_MAP };
