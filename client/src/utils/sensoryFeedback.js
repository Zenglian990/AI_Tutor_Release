/**
 * sensoryFeedback.js
 * 纯端侧零依赖的高保真五感反馈引擎 (对标作业帮与小猿搜题)
 * 1. Web Audio API 合成单反快门音效 (毫秒级响应，无需加载外部音频文件)
 * 2. Web Audio API 合成成功过关庆祝音效 (丁零/叮咚)
 * 3. 移动端触觉震动 (Haptic Vibrations)
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 触发物理机身触觉震动反馈 (支持 Android App 与 PWA)
 */
export function triggerHaptic(type = 'light') {
  if (typeof window === 'undefined' || !navigator.vibrate) return;
  try {
    switch (type) {
      case 'light':
        navigator.vibrate(15);
        break;
      case 'medium':
        navigator.vibrate(30);
        break;
      case 'success':
        navigator.vibrate([20, 40, 30]); // 双击顿挫震动
        break;
      case 'error':
        navigator.vibrate([40, 60, 40, 60, 50]);
        break;
      default:
        navigator.vibrate(20);
    }
  } catch (e) {
    // Ignore haptic failures gracefully
  }
}

/**
 * 毫秒级合成真实单反机械快门声 (拍照搜题仪式感)
 */
export function playShutterSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    triggerHaptic('medium');

    const now = ctx.currentTime;
    // 1. 咔 (前帘快门开合)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(140, now);
    osc1.frequency.exponentialRampToValueAtTime(30, now + 0.05);

    gain1.gain.setValueAtTime(0.5, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.05);

    // 2. 嚓 (金属齿轮与白噪声回弹)
    const bufferSize = ctx.sampleRate * 0.04;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now + 0.04);
    filter.Q.setValueAtTime(2.5, now + 0.04);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    whiteNoise.start(now + 0.04);
    whiteNoise.stop(now + 0.1);
  } catch (err) {
    console.warn('[Sensory] Shutter sound failed:', err);
  }
}

/**
 * 合成奖励庆祝音效 (做对题目、通关成功)
 */
export function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    triggerHaptic('success');

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 愉悦大三和弦

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  } catch (err) {
    console.warn('[Sensory] Success chime failed:', err);
  }
}
