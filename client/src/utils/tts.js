import { authFetch } from '../store/useStore';

let _activeTTSAudio = null;
let _activeTTSOnEnd = null;

function fallbackLocalSpeech(cleanText, grade, onStart, onEnd) {
  if (!window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }
  
  _activeTTSOnEnd = onEnd;
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
  
  utterance.onend = () => {
    if (_activeTTSOnEnd === onEnd) _activeTTSOnEnd = null;
    if (onEnd) onEnd();
  };
  utterance.onerror = () => {
    if (_activeTTSOnEnd === onEnd) _activeTTSOnEnd = null;
    if (onEnd) onEnd();
  };
  
  window.speechSynthesis.speak(utterance);
}

/**
 * Play text to speech (TTS) using Cloud Edge-TTS, falling back to local synthesis on error.
 * 
 * @param {string} text 
 * @param {string} grade 
 * @param {function} onStart 
 * @param {function} onEnd 
 */
export function playTTS(text, grade, onStart, onEnd) {
  // Cancel any active SpeechSynthesis speaking
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // Cancel any active cloud audio
  if (_activeTTSAudio) {
    try {
      _activeTTSAudio.pause();
      _activeTTSAudio = null;
    } catch (err) {}
  }

  // Cancel/complete any active onEnd callbacks to restore state
  if (_activeTTSOnEnd) {
    try {
      const prevOnEnd = _activeTTSOnEnd;
      _activeTTSOnEnd = null;
      prevOnEnd();
    } catch (err) {}
  }

  _activeTTSOnEnd = onEnd;

  let cleanText = text
    .replace(/\$\$[\s\S]*?\$\$/g, '（数学公式）')
    .replace(/\$[^$]+\$/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/[`*~_#>-]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{2600}-\u{27BF}]/gu, '')
    .trim();
  
  if (!cleanText) {
    if (onEnd) onEnd();
    return;
  }

  const url = `/api/tts?text=${encodeURIComponent(cleanText)}&grade=${encodeURIComponent(grade || '')}`;

  authFetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Cloud TTS server error: ' + res.status);
      return res.blob();
    })
    .then(blob => {
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      _activeTTSAudio = audio;
      
      if (onStart) onStart();
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (_activeTTSAudio === audio) _activeTTSAudio = null;
        if (_activeTTSOnEnd === onEnd) _activeTTSOnEnd = null;
        if (onEnd) onEnd();
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        if (_activeTTSAudio === audio) _activeTTSAudio = null;
        if (_activeTTSOnEnd === onEnd) _activeTTSOnEnd = null;
        if (onEnd) onEnd();
      };
      
      audio.play().catch(err => {
        console.error('Audio play failed:', err);
        URL.revokeObjectURL(audioUrl);
        if (_activeTTSAudio === audio) _activeTTSAudio = null;
        // Fallback to local SpeechSynthesis
        fallbackLocalSpeech(cleanText, grade, onStart, onEnd);
      });
    })
    .catch(err => {
      console.warn('Cloud TTS connection failed, falling back to local speech:', err.message);
      fallbackLocalSpeech(cleanText, grade, onStart, onEnd);
    });
}

/**
 * Stop any active text to speech playback (both local synthesis and cloud audio).
 */
export function stopTTS() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (_activeTTSAudio) {
    try {
      _activeTTSAudio.pause();
      _activeTTSAudio = null;
    } catch (err) {}
  }
  if (_activeTTSOnEnd) {
    try {
      const prevOnEnd = _activeTTSOnEnd;
      _activeTTSOnEnd = null;
      prevOnEnd();
    } catch (err) {}
  }
}
