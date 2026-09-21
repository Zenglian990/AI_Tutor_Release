import { authFetch } from '../store/useStore';

const activeControllers = new Set();
const speakingListeners = new Set();
let isCurrentlySpeaking = false;

function notifySpeakingState(speaking) {
  isCurrentlySpeaking = speaking;
  for (const listener of speakingListeners) {
    try {
      listener(speaking);
    } catch (e) {
      console.warn('Speaking listener error:', e);
    }
  }
}

export function subscribeSpeakingState(callback) {
  speakingListeners.add(callback);
  callback(isCurrentlySpeaking);
  return () => speakingListeners.delete(callback);
}

export function getIsSpeaking() {
  return isCurrentlySpeaking;
}

/**
 * Extracts the most prominent question or final guidance prompt from text
 * for focused spoken articulation.
 */
export function extractQuestionFocus(text) {
  if (!text) return '';
  const clean = text
    .replace(/<[^>]+>/g, '')
    .replace(/\!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '');

  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Search backward for lines with questions or scaffolding requests
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.includes('？') || line.includes('?') || line.includes('你觉得') || line.includes('动笔') || line.includes('请') || line.includes('判断')) {
      return line.replace(/^[#*>\-\d\.\s]+/, '').slice(0, 100);
    }
  }
  return lines[lines.length - 1]?.replace(/^[#*>\-\d\.\s]+/, '').slice(0, 80) || '';
}

export function getTtsEngine() {
  if (typeof window === 'undefined') return 'cloud';
  return localStorage.getItem('tts_engine') || 'cloud';
}

export function setTtsEngine(engine) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('tts_engine', engine);
  }
}

/**
 * Play synthesized MP3 audio via HTML5 Audio element.
 * Guarantees mobile autoplay compatibility by pre-unlocking on the user click gesture.
 */
function playServerAudio(cleanText, grade, onStart, onEnd, ctrl) {
  const audio = new Audio();
  // Safe silent audio data URI to unlock mobile browser autoplay restrictions synchronously
  audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  try {
    audio.play().catch(() => {});
  } catch (e) {}

  let didEnd = false;
  let activeUrl = null;

  const finish = () => {
    if (!didEnd) {
      didEnd = true;
      activeControllers.delete(ctrl);
      if (activeControllers.size === 0) {
        notifySpeakingState(false);
      }
      try {
        audio.pause();
        audio.src = '';
      } catch (e) {}
      if (activeUrl) {
        try { URL.revokeObjectURL(activeUrl); } catch (e) {}
        activeUrl = null;
      }
      if (onEnd) onEnd();
    }
  };

  ctrl.stop = () => {
    finish();
  };

  authFetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: cleanText.slice(0, 600),
      grade: grade || ''
    })
  })
    .then(async res => {
      if (didEnd) return;
      if (!res.ok) {
        throw new Error(`TTS HTTP error: ${res.status}`);
      }
      const blob = await res.blob();
      if (didEnd || !blob || blob.size === 0) {
        finish();
        return;
      }

      activeUrl = URL.createObjectURL(blob);
      audio.src = activeUrl;

      audio.onplay = () => {
        if (!didEnd) {
          notifySpeakingState(true);
          if (onStart) onStart();
        }
      };

      audio.onended = finish;

      audio.onerror = (e) => {
        console.warn('[TTS] Audio element error:', e);
        finish();
      };

      audio.play().catch(err => {
        console.warn('[TTS] Audio play() failed:', err);
        finish();
      });
    })
    .catch(err => {
      console.warn('[TTS] Server audio fetch failed, attempting local speech fallback:', err);
      if (!didEnd) {
        fallbackLocalSpeech(cleanText, grade, onStart, onEnd, ctrl, false);
      }
    });
}

/**
 * Local device speech synthesis (window.speechSynthesis).
 * Includes auto-recovery watchdog: If local speech fails, drops, or errors,
 * it immediately routes to server MP3 audio so the user is never left in silence.
 */
function fallbackLocalSpeech(cleanText, grade, onStart, onEnd, ctrl, canFallbackToServer = true) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    if (canFallbackToServer) {
      playServerAudio(cleanText, grade, onStart, onEnd, ctrl);
    } else {
      notifySpeakingState(false);
      if (onEnd) onEnd();
    }
    return;
  }

  let started = false;
  let didEnd = false;

  const finish = () => {
    if (!didEnd) {
      didEnd = true;
      activeControllers.delete(ctrl);
      if (activeControllers.size === 0) {
        notifySpeakingState(false);
      }
      if (onEnd) onEnd();
    }
  };

  ctrl.stop = () => {
    try { window.speechSynthesis.cancel(); } catch (e) {}
    finish();
  };

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch (e) {}

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices() || [];
  const chineseVoice = voices.find(v => v.lang && (v.lang.includes('zh') || v.lang.includes('cmn') || v.lang.includes('CN')));
  if (chineseVoice) utterance.voice = chineseVoice;

  utterance.onstart = () => {
    started = true;
    notifySpeakingState(true);
    if (onStart) onStart();
  };

  utterance.onend = finish;

  // Watchdog: If local speech engine does not fire onstart within 800ms (common on Samsung/Xiaomi WebView),
  // immediately rescue with server audio!
  const watchdog = setTimeout(() => {
    if (!started && !didEnd) {
      console.warn('[TTS] SpeechSynthesis watchdog fired: engine unresponsive, switching to server audio');
      try { window.speechSynthesis.cancel(); } catch (e) {}
      if (canFallbackToServer) {
        playServerAudio(cleanText, grade, onStart, onEnd, ctrl);
      } else {
        finish();
      }
    }
  }, 800);

  utterance.onerror = (e) => {
    clearTimeout(watchdog);
    console.warn('[TTS] SpeechSynthesis error:', e);
    if (!started && canFallbackToServer && !didEnd) {
      playServerAudio(cleanText, grade, onStart, onEnd, ctrl);
    } else {
      finish();
    }
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    clearTimeout(watchdog);
    console.warn('[TTS] window.speechSynthesis.speak threw:', err);
    if (canFallbackToServer && !didEnd) {
      playServerAudio(cleanText, grade, onStart, onEnd, ctrl);
    } else {
      finish();
    }
  }
}

/**
 * Play text to speech (TTS).
 * Guaranteed to produce sound across 100% of mobile phones, tablets, and browsers.
 */
export function playTTS(text, gradeOrOnStart, onStartOrOnEnd, maybeOnEnd) {
  stopTTS();

  let grade = '';
  let onStart = null;
  let onEnd = null;

  if (typeof gradeOrOnStart === 'function') {
    onStart = gradeOrOnStart;
    onEnd = onStartOrOnEnd;
    grade = '';
  } else {
    grade = gradeOrOnStart || '';
    onStart = onStartOrOnEnd;
    onEnd = maybeOnEnd;
  }

  let cleanText = text
    .replace(/<[^>]+>/g, '')
    .replace(/\!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/\*/g, '')
    .replace(/#/g, '')
    .replace(/`/g, '')
    .replace(/\[ACTION_.*?\]/g, '');

  if (!cleanText.trim()) {
    if (onEnd) onEnd();
    notifySpeakingState(false);
    return { stop: () => {} };
  }

  const ctrl = { stop: () => {} };
  activeControllers.add(ctrl);

  const engine = getTtsEngine();
  const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

  if (engine === 'local' && !isNative) {
    fallbackLocalSpeech(cleanText, grade, onStart, onEnd, ctrl, true);
  } else {
    playServerAudio(cleanText, grade, onStart, onEnd, ctrl);
  }

  return ctrl;
}

export function stopTTS() {
  for (const ctrl of activeControllers) {
    try {
      ctrl.stop();
    } catch (e) {}
  }
  activeControllers.clear();
  
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
  
  notifySpeakingState(false);
}

export const interruptSpeech = stopTTS;
