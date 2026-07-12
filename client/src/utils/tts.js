import { authFetch } from '../store/useStore';

const activeControllers = new Set();

function fallbackLocalSpeech(cleanText, grade, onStart, onEnd, ctrl) {
  if (!window.speechSynthesis) {
    if (onEnd) onEnd();
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
  if (onStart) utterance.onstart = onStart;
  
  let didEnd = false;
  const finish = () => {
    if (!didEnd) {
      didEnd = true;
      activeControllers.delete(ctrl);
      if (onEnd) onEnd();
    }
  };

  utterance.onend = finish;
  utterance.onerror = finish;
  
  window.speechSynthesis.speak(utterance);
  
  ctrl.stop = () => {
    window.speechSynthesis.cancel();
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
  let cleanText = text
    .replace(/<[^>]+>/g, '') // html tags
    .replace(/\!\[.*?\]\(.*?\)/g, '') // images
    .replace(/\[.*?\]\(.*?\)/g, '') // links
    .replace(/\*/g, '')
    .replace(/#/g, '')
    .replace(/`/g, '')
    .replace(/\[ACTION_.*?\]/g, '');

  if (!cleanText.trim()) {
    if (onEnd) onEnd();
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
          URL.revokeObjectURL(url);
          if (onEnd) onEnd();
        }
      };

      audio.oncanplay = () => {
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
 * Stop any active text to speech playback (both local synthesis and cloud audio).
 */
export function stopTTS() {
  for (const ctrl of activeControllers) {
    ctrl.stop();
  }
  activeControllers.clear();
  
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
