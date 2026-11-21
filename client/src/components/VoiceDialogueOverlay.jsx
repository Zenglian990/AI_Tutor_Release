import React, { useEffect, useState, useRef } from 'react';

/**
 * VoiceDialogueOverlay
 * 沉浸式名师面对面全双工实时语音伴学浮层 (对标 GPT-4o Voice / Gemini Live)
 * 核心突破：
 * 1. 端侧轻量级声音活动侦测 (VAD, Voice Activity Detection)
 * 2. 毫秒级随时张口打断 (Auto Barge-in)：名师在讲题时，学生一旦张口说话，无需手点屏幕自动掐断播音，立刻切入倾听
 * 3. 状态：
 *    - 'speaking' - 名师正在主动语音讲解 / 提问
 *    - 'listening' - 名师主动递麦，正在倾听学生回答
 *    - 'processing' - 正在识别学生作答内容并推导下一步
 */
export default function VoiceDialogueOverlay({
  isOpen,
  mode, // 'speaking' | 'listening' | 'processing'
  studentName = '曾练',
  currentQuestionText = '',
  liveSpokenText = '',
  countdownSeconds = 8,
  onInterrupt,
  onCancel,
  onSubmitSpokenText
}) {
  const [timeLeft, setTimeLeft] = useState(countdownSeconds);
  const [bargeInEnabled, setBargeInEnabled] = useState(true);
  const [liveMicLevel, setLiveMicLevel] = useState(0); // 0-100 mic energy
  const [autoInterrupted, setAutoInterrupted] = useState(false);

  const audioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const vadRafRef = useRef(null);
  const consecutiveVoiceFrames = useRef(0);

  // 1. 倒计时逻辑
  useEffect(() => {
    if (mode === 'listening') {
      setTimeLeft(countdownSeconds);
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [mode, countdownSeconds]);

  // 2. 端侧轻量级 Web Audio VAD 全双工打断监听器
  useEffect(() => {
    if (!isOpen || mode !== 'speaking' || !bargeInEnabled) {
      // 停止 VAD 监听，释放资源
      if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      setLiveMicLevel(0);
      return;
    }

    let isSubscribed = true;

    async function initVad() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (!isSubscribed) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        micStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkVolume = () => {
          if (!isSubscribed) return;
          analyser.getByteFrequencyData(dataArray);

          // 计算人声敏感频段 (80Hz - 2000Hz) 的平均能量
          let sum = 0;
          for (let i = 2; i < 30; i++) {
            sum += dataArray[i];
          }
          const energy = sum / 28;
          setLiveMicLevel(Math.min(100, Math.round(energy * 1.5)));

          // 阈值判定：当声音能量持续超过 36（正常说话声压，过滤轻微呼吸杂音）
          if (energy > 36) {
            consecutiveVoiceFrames.current += 1;
            if (consecutiveVoiceFrames.current >= 4) {
              // 判定为孩子在主动说话打断！
              setAutoInterrupted(true);
              consecutiveVoiceFrames.current = 0;
              if (window.speechSynthesis) window.speechSynthesis.cancel();
              onInterrupt && onInterrupt('auto_barge_in');
              return;
            }
          } else {
            consecutiveVoiceFrames.current = Math.max(0, consecutiveVoiceFrames.current - 1);
          }

          vadRafRef.current = requestAnimationFrame(checkVolume);
        };

        vadRafRef.current = requestAnimationFrame(checkVolume);
      } catch (err) {
        // 静默降级为手动点击打断
        console.warn('[VAD] Mic capture not permitted or supported:', err.message);
      }
    }

    initVad();

    return () => {
      isSubscribed = false;
      if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [isOpen, mode, bargeInEnabled, onInterrupt]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '90px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '90%',
      maxWidth: '540px',
      background: 'rgba(15, 23, 42, 0.94)',
      backdropFilter: 'blur(16px)',
      border: mode === 'listening' ? '2px solid #38bdf8' : '1px solid rgba(59, 130, 246, 0.5)',
      boxShadow: mode === 'listening'
        ? '0 0 35px rgba(56, 189, 248, 0.45)'
        : '0 12px 30px rgba(0, 0, 0, 0.4)',
      borderRadius: '24px',
      padding: '16px 20px',
      zIndex: 99,
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      animation: 'modalSlideUp 0.3s ease-out'
    }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: mode === 'listening' ? '#38bdf8' : (mode === 'speaking' ? '#10b981' : '#f59e0b'),
            boxShadow: `0 0 10px ${mode === 'listening' ? '#38bdf8' : '#10b981'}`
          }} />
          <span style={{ fontWeight: '600', fontSize: '0.92rem', letterSpacing: '0.5px' }}>
            {mode === 'speaking' && '🎙️ 名师正在语音讲解 (随时张口可打断)...'}
            {mode === 'listening' && `🎧 名师主动递麦，正在听【${studentName}】作答...`}
            {mode === 'processing' && '⚡ 名师正在思考与分析你的作答...'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {mode === 'speaking' && (
            <button
              onClick={() => setBargeInEnabled(b => !b)}
              style={{
                background: bargeInEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                border: `1px solid ${bargeInEnabled ? '#10b981' : 'rgba(255, 255, 255, 0.2)'}`,
                color: bargeInEnabled ? '#34d399' : '#94a3b8',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '0.72rem',
                cursor: 'pointer'
              }}
              title="开启后张嘴说话自动打断名师播音"
            >
              {bargeInEnabled ? '⚡ 自动打断: 开' : '手动打断'}
            </button>
          )}
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: '2px 6px'
            }}
            title="退出面对面语音流"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Spoken Focus Sentence */}
      {currentQuestionText && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '10px 14px',
          fontSize: '0.9rem',
          lineHeight: '1.5',
          color: '#e2e8f0',
          borderLeft: '4px solid #38bdf8'
        }}>
          <strong>名师焦点设问：</strong>
          <span>{currentQuestionText}</span>
        </div>
      )}

      {/* Real-time Streaming Speech Input Box (边说边出字) */}
      {mode === 'listening' && (
        <div style={{
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '12px',
          padding: '10px 14px',
          fontSize: '0.92rem',
          color: '#7dd3fc',
          lineHeight: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div className="soundwave-indicator">
            <span className="soundwave-bar" />
            <span className="soundwave-bar" />
            <span className="soundwave-bar" />
            <span className="soundwave-bar" />
          </div>
          <span>{liveSpokenText ? `“${liveSpokenText}”` : `正在倾听你的语音输入...（直接说话即可）`}</span>
        </div>
      )}

      {/* Interactive Sound Wave / Status Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(0, 0, 0, 0.25)',
        borderRadius: '14px'
      }}>
        {mode === 'speaking' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="voice-wave-bar"></span>
              <span className="voice-wave-bar wave-delay-1"></span>
              <span className="voice-wave-bar wave-delay-2"></span>
              <span className="voice-wave-bar wave-delay-3"></span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: '6px' }}>
                {bargeInEnabled && liveMicLevel > 15
                  ? `🎤 检测到声音 (${liveMicLevel}%)`
                  : '随时张口说话，老师自动停下听你说'}
              </span>
            </div>
            <button
              type="button"
              onClick={onInterrupt}
              style={{
                background: 'rgba(239, 68, 68, 0.85)',
                color: '#fff',
                border: 'none',
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              🛑 老师稍等，我来回答
            </button>
          </>
        )}

        {mode === 'listening' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '1.1rem',
                animation: 'pulse 1s infinite'
              }}>🎙️</span>
              <span style={{ fontSize: '0.86rem', color: '#38bdf8', fontWeight: '500' }}>
                请直接大声说出你的思路（剩余 {timeLeft} 秒）
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={onInterrupt}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '4px 12px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                说完了，立即发送 ✔
              </button>
            </div>
          </>
        )}

        {mode === 'processing' && (
          <div style={{ fontSize: '0.84rem', color: '#cbd5e1', padding: '4px' }}>
            🔄 语音已接收，名师正在根据你的回答生成专属点拨...
          </div>
        )}
      </div>
    </div>
  );
}
