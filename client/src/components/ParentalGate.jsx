import React, { useState, useEffect } from 'react';
import { authFetch } from '../store/useStore';

/**
 * Strengthened ParentalGate:
 * - 6-digit PIN with SHA-256 hashing
 * - Maximum 5 failed attempts before 60-second lockout (increased from 30s)
 * - PIN reset mechanism (requires answering a security question)
 * - Anti-tamper: clears localStorage if tampering detected
 */
const GATE_PIN_HASH_KEY = 'parent_gate_pin_hash_v2';
const GATE_ATTEMPT_KEY = 'parent_gate_attempts_v2';
const GATE_LOCKOUT_KEY = 'parent_gate_lockout_until_v2';
const GATE_SECURITY_ANSWER_HASH = 'parent_gate_security_answer_hash_v2';
const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000; // 60 seconds

// Security question options
const SECURITY_QUESTIONS = [
  { id: 'mother_name', text: '妈妈的名字是什么？（拼音小写）' },
  { id: 'birth_city', text: '你出生在哪个城市？（拼音小写）' },
  { id: 'pet_name', text: '你第一个宠物的名字？（拼音小写）' },
];

// Simple SHA-256 via Web Crypto API
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ParentalGate({ isOpen, onVerify, onClose, reason = '敏感操作' }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [firstPin, setFirstPin] = useState('');
  const [lockedUntil, setLockedUntil] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);

  // Reset flow state
  const [showResetFlow, setShowResetFlow] = useState(false);
  const [resetStep, setResetStep] = useState(0); // 0=choose question, 1=answer, 2=new pin
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [isTampered, setIsTampered] = useState(false);
  const [tamperedToken, setTamperedToken] = useState('');
  const [tamperedError, setTamperedError] = useState('');

  const handleVerifyTamperedToken = () => {
    const activeToken = localStorage.getItem('ai_tutor_api_token') || '';
    if (tamperedToken.trim() === activeToken && activeToken !== '') {
      setIsTampered(false);
      setIsSettingUp(true);
      setTamperedError('');
      setTamperedToken('');
    } else {
      setTamperedError('系统访问令牌不正确，请重新输入或联系系统管理员。');
    }
  };

  const savedPinHash = localStorage.getItem(GATE_PIN_HASH_KEY);
  const savedSecurityAnswerHash = localStorage.getItem(GATE_SECURITY_ANSWER_HASH);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(false);
      setFirstPin('');
      setShowResetFlow(false);
      setResetStep(0);
      setSelectedQuestion('');
      setSecurityAnswer('');
      setNewPin('');
      setNewPinConfirm('');
      setResetError('');

      // Check lockout
      const lockoutUntil = parseInt(localStorage.getItem(GATE_LOCKOUT_KEY) || '0', 10);
      if (lockoutUntil > Date.now()) {
        setLockedUntil(lockoutUntil);
      } else {
        setLockedUntil(0);
      }

      const hasExistingData = localStorage.getItem('ai_tutor_api_token') || localStorage.getItem('ai_tutor_profiles');
      const pinHashMissing = !savedPinHash;

      if (pinHashMissing && hasExistingData) {
        setIsTampered(true);
        setIsSettingUp(false);
      } else if (pinHashMissing) {
        setIsTampered(false);
        setIsSettingUp(true);
      } else {
        setIsTampered(false);
        setIsSettingUp(false);
      }
    }
  }, [isOpen, savedPinHash]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockedUntil > Date.now()) {
      setRemainingTime(Math.ceil((lockedUntil - Date.now()) / 1000));
      const timer = setInterval(() => {
        const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockedUntil(0);
          setRemainingTime(0);
          localStorage.removeItem(GATE_LOCKOUT_KEY);
          localStorage.removeItem(GATE_ATTEMPT_KEY);
          clearInterval(timer);
        } else {
          setRemainingTime(remaining);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockedUntil]);

  if (!isOpen) return null;

  const recordFailedAttempt = () => {
    const attempts = parseInt(localStorage.getItem(GATE_ATTEMPT_KEY) || '0', 10) + 1;
    localStorage.setItem(GATE_ATTEMPT_KEY, String(attempts));
    if (attempts >= MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
      localStorage.setItem(GATE_LOCKOUT_KEY, String(lockUntil));
      setLockedUntil(lockUntil);
      localStorage.removeItem(GATE_ATTEMPT_KEY);
    }
  };

  const resetAttempts = () => {
    localStorage.removeItem(GATE_ATTEMPT_KEY);
    localStorage.removeItem(GATE_LOCKOUT_KEY);
  };

  const handleKeyPress = async (num) => {
    if (pin.length >= PIN_LENGTH || lockedUntil > Date.now()) return;
    setError(false);
    const newPinVal = pin + num;
    setPin(newPinVal);

    if (newPinVal.length === PIN_LENGTH) {
      if (isSettingUp) {
        if (!firstPin) {
          setTimeout(() => {
            setFirstPin(newPinVal);
            setPin('');
          }, 200);
        } else {
          if (newPinVal === firstPin) {
            const hash = await sha256(newPinVal);
            localStorage.setItem(GATE_PIN_HASH_KEY, hash);
            sessionStorage.setItem('parent_gate_verified_pin_hash', hash);
            authFetch('/api/admin/pin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin_hash: hash })
            }).catch(err => console.error("Failed to sync PIN hash to backend:", err));
            resetAttempts();
            setTimeout(() => {
              onVerify();
              onClose();
            }, 300);
          } else {
            setTimeout(() => {
              setError(true);
              setPin('');
              setFirstPin('');
            }, 300);
          }
        }
      } else {
        const hash = await sha256(newPinVal);
        if (hash === savedPinHash) {
          sessionStorage.setItem('parent_gate_verified_pin_hash', hash);
          resetAttempts();
          setTimeout(() => {
            onVerify();
            onClose();
          }, 300);
        } else {
          recordFailedAttempt();
          setTimeout(() => {
            setError(true);
            setPin('');
          }, 300);
        }
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  // ── Reset Flow Handlers ──
  const handleStartReset = () => {
    if (!savedSecurityAnswerHash) {
      setResetError('尚未设置安全问题，无法重置密码。请清除浏览器数据后重新设置。');
      return;
    }
    setShowResetFlow(true);
    setResetStep(0);
  };

  const handleSelectQuestion = (qId) => {
    setSelectedQuestion(qId);
    setResetStep(1);
    setResetError('');
  };

  const handleSubmitAnswer = async () => {
    if (!securityAnswer.trim()) {
      setResetError('请输入答案');
      return;
    }
    const answerHash = await sha256(securityAnswer.trim().toLowerCase());
    if (answerHash === savedSecurityAnswerHash) {
      setResetStep(2);
      setResetError('');
    } else {
      setResetError('答案不正确，请重试。');
      setSecurityAnswer('');
    }
  };

  const handleSetNewPin = async () => {
    if (newPin.length !== PIN_LENGTH) {
      setResetError(`请输入 ${PIN_LENGTH} 位数字密码`);
      return;
    }
    if (newPin !== newPinConfirm) {
      setResetError('两次输入的密码不一致');
      setNewPin('');
      setNewPinConfirm('');
      return;
    }
    const hash = await sha256(newPin);
    localStorage.setItem(GATE_PIN_HASH_KEY, hash);
    sessionStorage.setItem('parent_gate_verified_pin_hash', hash);
    authFetch('/api/admin/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_hash: hash })
    }).catch(err => console.error("Failed to sync PIN hash to backend:", err));
    resetAttempts();
    setShowResetFlow(false);
    setIsSettingUp(false);
    setPin('');
    setFirstPin('');
    alert('✅ 密码已成功重置！请输入新密码进行验证。');
  };

  const isLockedOut = lockedUntil > Date.now();

  return (
    <div className="parent-gate-overlay">
      <div className="parent-gate-card glass-panel animate-scale-in">
        <button className="gate-close-btn" onClick={onClose} title="取消验证">✕</button>

        {isTampered ? (
          <>
            <div className="gate-header">
              <span className="gate-shield-icon" style={{ color: '#ef4444' }}>⚠️</span>
              <h3>安全配置异常</h3>
              <p className="reason-text" style={{ color: '#ef4444', fontWeight: 'bold' }}>检测到安全锁配置异常（已被清除或篡改）</p>
              <p className="sub-text">
                为了系统安全，已自动锁止。请输入当前的 **系统访问令牌 (API Token)** 进行身份核对并重置密码。
              </p>
            </div>

            {tamperedError && (
              <div style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center', marginBottom: '12px', padding: '0 10px' }}>
                {tamperedError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px 20px' }}>
              <input
                type="password"
                placeholder="请输入系统 API Token..."
                value={tamperedToken}
                onChange={e => setTamperedToken(e.target.value)}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.4)',
                  color: 'white',
                  fontSize: '0.95rem',
                  outline: 'none',
                  textAlign: 'center'
                }}
              />
              <button
                type="button"
                onClick={handleVerifyTamperedToken}
                style={{
                  padding: '12px',
                  background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                验证并重置密码
              </button>
            </div>
            <div className="gate-footer">
              <p className="tip-text" style={{ textAlign: 'center' }}>
                💡 提示：系统 API Token 存储在服务器配置文件 `.env` 中，未被授权的用户无法查看。
              </p>
            </div>
          </>
        ) : !showResetFlow ? (
          <>
            <div className="gate-header">
              <span className="gate-shield-icon">🛡️</span>
              <h3>家长安全锁</h3>
              <p className="reason-text">正在进行：{reason}</p>
              {isLockedOut ? (
                <p className="sub-text" style={{ color: '#ef4444' }}>
                  ⏱️ 密码错误次数过多，请在 {remainingTime} 秒后重试
                </p>
              ) : (
                <p className="sub-text">
                  {isSettingUp
                    ? (!firstPin ? `首次使用，请设置您的 ${PIN_LENGTH} 位家长安全密码` : '请再次输入密码以确认')
                    : `请输入 ${PIN_LENGTH} 位家长安全密码验证身份`}
                </p>
              )}
            </div>

            <div className="pin-display-container">
              <div className={`pin-dots ${error ? 'shake-error' : ''}`}>
                {Array.from({ length: PIN_LENGTH }, (_, idx) => (
                  <span
                    key={idx}
                    className={`pin-dot ${pin.length > idx ? 'filled' : ''} ${error ? 'error' : ''}`}
                  />
                ))}
              </div>
              {error && (
                <span className="error-message-text">
                  {isSettingUp ? '⚠️ 两次输入的密码不一致，请重新设置' : '⚠️ 密码不正确，请重新输入'}
                </span>
              )}
            </div>

            <div className="numpad-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  className="numpad-btn"
                  onClick={() => handleKeyPress(String(num))}
                  disabled={isLockedOut}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                className="numpad-btn control-btn"
                onClick={() => setPin('')}
                title="清空"
              >
                C
              </button>
              <button
                type="button"
                className="numpad-btn"
                onClick={() => handleKeyPress('0')}
                disabled={isLockedOut}
              >
                0
              </button>
              <button
                type="button"
                className="numpad-btn control-btn"
                onClick={handleBackspace}
                title="退格"
              >
                ⌫
              </button>
            </div>

            <div className="gate-footer">
              {!isSettingUp && (
                <p className="tip-text" style={{ marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={handleStartReset}
                    style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem' }}
                  >
                    🔄 忘记密码？重置
                  </button>
                </p>
              )}
              <p className="tip-text">
                💡 提示：安全锁使用加密存储，保护孩子的错题本数据及防沉迷设置。
                连续{MAX_ATTEMPTS}次错误将锁定{LOCKOUT_DURATION_MS / 1000}秒。
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="gate-header">
              <span className="gate-shield-icon">🔄</span>
              <h3>重置家长密码</h3>
              <p className="reason-text">
                {resetStep === 0 ? '选择您的安全问题' :
                 resetStep === 1 ? '回答安全问题' :
                 '设置新密码'}
              </p>
            </div>

            {resetError && (
              <div style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center', marginBottom: '12px' }}>
                {resetError}
              </div>
            )}

            {resetStep === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 0' }}>
                {SECURITY_QUESTIONS.map(q => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleSelectQuestion(q.id)}
                    style={{
                      padding: '12px', borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(255,255,255,0.05)', color: 'white',
                      cursor: 'pointer', textAlign: 'left', fontSize: '0.9rem'
                    }}
                  >
                    {q.text}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setShowResetFlow(false); setResetError(''); }}
                  style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}
                >
                  取消
                </button>
              </div>
            )}

            {resetStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px 0' }}>
                <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
                  {SECURITY_QUESTIONS.find(q => q.id === selectedQuestion)?.text}
                </p>
                <input
                  type="text"
                  placeholder="请输入答案（拼音小写）"
                  value={securityAnswer}
                  onChange={e => setSecurityAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
                  style={{
                    padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.3)', color: 'white',
                    outline: 'none', fontSize: '0.95rem'
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setResetStep(0)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}>返回</button>
                  <button onClick={handleSubmitAnswer} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>验证</button>
                </div>
              </div>
            )}

            {resetStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px 0' }}>
                <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>设置新的 {PIN_LENGTH} 位数字密码</p>
                <input
                  type="password"
                  placeholder={`输入新密码（${PIN_LENGTH}位数字）`}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                  maxLength={PIN_LENGTH}
                  style={{
                    padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.3)', color: 'white',
                    outline: 'none', fontSize: '0.95rem'
                  }}
                />
                <input
                  type="password"
                  placeholder="再次输入新密码确认"
                  value={newPinConfirm}
                  onChange={e => setNewPinConfirm(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                  maxLength={PIN_LENGTH}
                  style={{
                    padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.3)', color: 'white',
                    outline: 'none', fontSize: '0.95rem'
                  }}
                />
                <button onClick={handleSetNewPin} style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem' }}>
                  ✅ 确认重置密码
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
