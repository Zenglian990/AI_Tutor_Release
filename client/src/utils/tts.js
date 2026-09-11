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
  if (!window.speechSynthesis) {
    if (onEnd) onEnd();
    notifySpeakingState(false);
    return;
  }
  
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'zh-CN';
  const voices = window.speechSynthesis.getVoices();
  let selectedVoice = null;
  if (grade && (grade.includes('1') || grade.includes('2') || grade.includes('3'))) {
    selectedVoice = voices.find(v => v.lang.includes('zh') && (v.name.includes('Xiaoxiao') || v.name.includes('Tingting') || v.name.includes('female') || v.name.includes('女')));
  } else {
    selectedVoice = voices.find(v => v.lang.includes('zh') && (v.name.includes('Yunxi') || v.name.includes('Yunjian') || v.name.includes('male') || v.name.includes('男')));
  }
  if (selectedVoice) utterance.voice = selectedVoice;
  
  utterance.onstart = () => {
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
  utterance.onerror = finish;
  
  window.speechSynthesis.speak(utterance);
  
  ctrl.stop = () => {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
    finish();
  };
}

/**
 * Play text to speech (TTS) using Cloud Edge-TTS, falling back to local synthesis on error.
 * Returns a controller object { stop: () => void }
 * 
 * @param {string} text 
 * @param {string} grade 
 * @param {function} onStart 
 * @param {function} onEnd 
 * @returns {object} Controller with .stop() method
 */
export function playTTS(text, grade, onStart, onEnd) {
  stopTTS();

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

  authFetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: cleanText,
      grade: grade || ''
    })
  })
    .then(res => {
      if (!res.ok) throw new Error('Cloud TTS server error: ' + res.status);
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
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
        notifySpeakingState(true);
        if (onStart) onStart();
        audio.play().catch(e => {
          console.warn("Autoplay prevented:", e);
          finish();
        });
      };
      
      audio.onended = finish;
      audio.onerror = finish;
      
      ctrl.stop = () => {
        try {
          audio.pause();
          audio.src = '';
        } catch (e) {}
        finish();
      };
    })
    .catch(err => {
      console.warn("Cloud TTS failed, falling back to local", err);
      fallbackLocalSpeech(cleanText, grade, onStart, onEnd, ctrl);
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
