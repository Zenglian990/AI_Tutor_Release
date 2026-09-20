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

function fallbackLocalSpeech(cleanText, grade, onStart, onEnd, ctrl) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    if (onEnd) onEnd();
    notifySpeakingState(false);
    return;
  }
  
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch (e) {}

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices() || [];
  let selectedVoice = null;
  const gradeStr = String(grade || '');
  if (gradeStr.includes('1') || gradeStr.includes('2') || gradeStr.includes('3')) {
    selectedVoice = voices.find(v => (v.lang.includes('zh') || v.lang.includes('cmn')) && (v.name.includes('Xiaoxiao') || v.name.includes('Tingting') || v.name.includes('female') || v.name.includes('女')));
  } else {
    selectedVoice = voices.find(v => (v.lang.includes('zh') || v.lang.includes('cmn')) && (v.name.includes('Yunxi') || v.name.includes('Yunjian') || v.name.includes('male') || v.name.includes('男')));
  }
  if (!selectedVoice) {
    selectedVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('cmn'));
  }
  if (selectedVoice) utterance.voice = selectedVoice;
  
  let started = false;
  utterance.onstart = () => {
    started = true;
    notifySpeakingState(true);
    if (onStart) onStart();
  };
  
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

  utterance.onend = finish;
  utterance.onerror = (e) => {
    console.warn("SpeechSynthesis error:", e);
    finish();
  };
  
  ctrl.stop = () => {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
    finish();
  };

  window.speechSynthesis.speak(utterance);

  // Chrome mobile watchdog: resume periodically if paused
  const resumeTimer = setInterval(() => {
    if (!didEnd && window.speechSynthesis.speaking) {
      window.speechSynthesis.resume();
    } else {
      clearInterval(resumeTimer);
    }
  }, 2500);
}

export function getTtsEngine() {
  if (typeof window === 'undefined') return 'local';
  return localStorage.getItem('tts_engine') || 'local';
}

export function setTtsEngine(engine) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('tts_engine', engine);
  }
}

/**
 * Play text to speech (TTS).
 * Defaults to instant native offline speech (0s latency, 100% reliable).
 * If user selected 'cloud', calls cloud Gemini TTS with fast 4s fallback to local speech.
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

  // Mode 1: Local native speech (Default: instant 0ms start, reliable on all devices)
  if (engine === 'local') {
    fallbackLocalSpeech(cleanText, grade, onStart, onEnd, ctrl);
    return ctrl;
  }

  // Mode 2: Cloud Gemini AI TTS (with 4-second timeout protection)
  const audio = new Audio();
  try {
    audio.play().catch(() => {});
  } catch (e) {}

  let hasSwitchedToLocal = false;
  const switchToLocal = () => {
    if (hasSwitchedToLocal) return;
    hasSwitchedToLocal = true;
    try {
      audio.pause();
      audio.src = '';
    } catch (e) {}
    fallbackLocalSpeech(cleanText, grade, onStart, onEnd, ctrl);
  };

  const cloudTimeout = setTimeout(() => {
    console.warn("[TTS] Cloud TTS took > 4s, falling back to instant local speech");
    switchToLocal();
  }, 4000);

  authFetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: cleanText.slice(0, 350), // Cap length for cloud AI to prevent long synthesis lag
      grade: grade || ''
    })
  })
    .then(res => {
      clearTimeout(cloudTimeout);
      if (hasSwitchedToLocal) return null;
      if (!res.ok) throw new Error('Cloud TTS server error: ' + res.status);
      return res.blob();
    })
    .then(blob => {
      if (!blob || hasSwitchedToLocal) return;
      const url = URL.createObjectURL(blob);
      audio.src = url;
      
      let didEnd = false;
      const finish = () => {
        if (!didEnd) {
          didEnd = true;
          activeControllers.delete(ctrl);
          if (activeControllers.size === 0) {
            notifySpeakingState(false);
          }
          try {
            URL.revokeObjectURL(url);
          } catch (e) {}
          if (onEnd) onEnd();
        }
      };

      audio.oncanplay = () => {
        if (hasSwitchedToLocal) return;
        notifySpeakingState(true);
        if (onStart) onStart();
        audio.play().catch(e => {
          console.warn("Autoplay prevented on audio element:", e);
          switchToLocal();
        });
      };
      
      audio.onended = finish;
      audio.onerror = (e) => {
        console.warn("Audio playback error:", e);
        switchToLocal();
      };
      
      ctrl.stop = () => {
        try {
          audio.pause();
          audio.src = '';
        } catch (e) {}
        finish();
      };
    })
    .catch(err => {
      clearTimeout(cloudTimeout);
      console.warn("Cloud TTS failed, falling back to local speech:", err);
      switchToLocal();
    });

  return ctrl;
}

/**
 * Immediate Barge-in / Interrupt: Stop any active speech playback.
 */
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
