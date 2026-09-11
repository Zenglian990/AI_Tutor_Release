import React, { useEffect, useState } from 'react';

/**
 * VoiceDialogueOverlay
 * 沉浸式名师面对面语音互动浮层
 * 状态：
 * 1. 'speaking' - 名师正在主动语音讲解 / 提问
 * 2. 'listening' - 名师主动递麦，正在倾听学生回答
 * 3. 'processing' - 正在识别学生作答内容并推导下一步
 */
export default function VoiceDialogueOverlay({
  isOpen,
  mode, // 'speaking' | 'listening' | 'processing'
  studentName = '曾练',
  currentQuestionText = '',
  countdownSeconds = 8,
  onInterrupt,
  onCancel,
  onSubmitSpokenText
}) {
  const [timeLeft, setTimeLeft] = useState(countdownSeconds);

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

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '90px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '90%',
      maxWidth: '520px',
      background: 'rgba(15, 23, 42, 0.92)',
      backdropFilter: 'blur(16px)',
      border: mode === 'listening' ? '2px solid #38bdf8' : '1px solid rgba(59, 130, 246, 0.5)',
      boxShadow: mode === 'listening'
        ? '0 0 35px rgba(56, 189, 248, 0.45)'
        : '0 12px 30px rgba(0, 0, 0, 0.35)',
      borderRadius: '24px',
      padding: '16px 20px',
      zIndex: 99,
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      animation: 'slideUp 0.3s ease-out'
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
            {mode === 'speaking' && '🎙️ 名师正在口头提问与引导...'}
            {mode === 'listening' && `🎧 名师主动递麦，正在听【${studentName}】作答...`}
            {mode === 'processing' && '⚡ 名师正在思考与分析你的作答...'}
          </span>
        </div>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="voice-wave-bar"></span>
              <span className="voice-wave-bar wave-delay-1"></span>
              <span className="voice-wave-bar wave-delay-2"></span>
              <span className="voice-wave-bar wave-delay-3"></span>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', marginLeft: '6px' }}>认真听，马上轮到你动笔/作答</span>
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
