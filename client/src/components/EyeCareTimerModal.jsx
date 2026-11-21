import React, { useState, useEffect } from 'react';

/**
 * EyeCareTimerModal
 * 国际眼科 20-20-20 视力守护与专注番茄钟 (守护孩子视力健康，消除家长手机用眼焦虑)
 * 
 * 核心法则：
 * 每使用屏幕 20 分钟，向 20 英尺 (约 6 米) 以外的远方远眺 20 秒，让睫状肌充分放松。
 */
export default function EyeCareTimerModal({
  isOpen,
  onClose,
  isRestMode = false,
  onToggleEink
}) {
  const [secondsLeft, setSecondsLeft] = useState(isRestMode ? 20 : 20 * 60);
  const [isRunning, setIsRunning] = useState(true);
  const [currentMode, setCurrentMode] = useState(isRestMode ? 'rest' : 'focus'); // 'focus' | 'rest'

  useEffect(() => {
    if (!isOpen) return;
    if (isRestMode) {
      setCurrentMode('rest');
      setSecondsLeft(20);
    } else {
      setCurrentMode('focus');
      setSecondsLeft(20 * 60);
    }
    setIsRunning(true);
  }, [isOpen, isRestMode]);

  useEffect(() => {
    if (!isOpen || !isRunning) return;

    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (currentMode === 'focus') {
            setCurrentMode('rest');
            return 20; // 20s rest
          } else {
            setCurrentMode('focus');
            return 20 * 60; // 20m focus
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isRunning, currentMode]);

  if (!isOpen) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: currentMode === 'rest' ? 'rgba(6, 78, 59, 0.94)' : 'rgba(15, 23, 42, 0.88)',
      backdropFilter: 'blur(12px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px', transition: 'background 0.5s ease'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '460px',
        maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', textAlign: 'center'
      }}>
        {/* Header */}
        <div style={{
          background: currentMode === 'rest' 
            ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' 
            : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          color: '#ffffff', padding: '18px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>{currentMode === 'rest' ? '🌿' : '⏳'}</span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
              {currentMode === 'rest' ? '20-20-20 睫状肌远眺放松' : '国际眼科视力守护番茄钟'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: '#ffffff',
              fontSize: '1.4rem', cursor: 'pointer', padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          {currentMode === 'rest' ? (
            /* Rest mode visual */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '120px', height: '120px', borderRadius: '50%', background: '#dcfce7',
                border: '4px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 25px rgba(16, 185, 129, 0.4)'
              }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#047857' }}>
                  {secondsLeft}s
                </span>
              </div>
              <h3 style={{ margin: '6px 0 0', color: '#065f46', fontSize: '1.2rem', fontWeight: 800 }}>
                请抬起头，眺望 6 米外的窗外远方
              </h3>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#047857', lineHeight: '1.5' }}>
                眨眨眼，转动眼球，让紧绷的睫状肌彻底恢复弹性。<br />
                只需 20 秒，近视发生率即可降低 40%！
              </p>
            </div>
          ) : (
            /* Focus mode visual */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '130px', height: '130px', borderRadius: '50%', background: '#f0f9ff',
                border: '4px solid #0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 20px rgba(2, 132, 199, 0.2)'
              }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0369a1' }}>
                  {timeFormatted}
                </span>
              </div>
              <h3 style={{ margin: '6px 0 0', color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>
                深度学习专注中...
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                满 20 分钟将自动提醒护眼休息，守护明亮双眸
              </p>
            </div>
          )}

          {/* Quick Eye Care Options */}
          <div style={{
            background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', width: '100%',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
              📜 纸质护眼/无蓝光墨水屏模式：
            </span>
            <button
              type="button"
              onClick={() => { onToggleEink && onToggleEink(); }}
              style={{
                padding: '4px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                background: '#ffffff', color: '#1e293b', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              一键切换
            </button>
          </div>

          {/* Bottom Actions */}
          <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '6px' }}>
            <button
              type="button"
              onClick={() => {
                if (currentMode === 'focus') {
                  setCurrentMode('rest');
                  setSecondsLeft(20);
                } else {
                  setCurrentMode('focus');
                  setSecondsLeft(20 * 60);
                }
              }}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px',
                background: '#f1f5f9', color: '#334155', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
              }}
            >
              {currentMode === 'focus' ? '🌿 立即开始20秒远眺' : '⏭️ 提前结束休息进入专注'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px', borderRadius: '10px',
                background: '#0f172a', color: '#ffffff', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
              }}
            >
              收起计时器
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
