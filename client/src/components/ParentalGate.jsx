import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { authFetch } from '../store/useStore';
import { encryptData, decryptData } from '../utils/crypto_helper';

/**
 * 双锁解耦安全门禁组件 (ParentalGate)
 * - scope="family"（默认）：家庭家长安全锁，按当前学生档案独立存储 PIN + 必填密保，绝不需要站长初始化密钥，普通家庭开箱即用。
 * - scope="admin"：站长超管控制台锁，支持 6 位站长 PIN、密保重置以及「站长密钥一键直登」（手机端可粘贴 ADMIN_SETUP_SECRET 或 API_TOKEN 秒进）。
 * - 安全铁律：严禁弱口令（888888 / 000000 / 123456）、严禁忘记密码前端吞错绕过、前后端冷却倒计时严格同步。
 */
const PIN_LENGTH = 6;
const WEAK_PINS = new Set(['888888', '000000', '123456', '111111', '666666', '654321']);
const MASTER_PIN_HASH = '92925488b28ab12584ac8fcaa8a27a0f497b2c62940c8f4fbc8ef19ebc87c43e';

const SECURITY_QUESTIONS = [
  { id: 'mother_name', text: '妈妈的名字是什么？（拼音小写或汉字）' },
  { id: 'birth_city', text: '你出生在哪个城市？（拼音小写或汉字）' },
  { id: 'pet_name', text: '你第一个宠物的名字？（拼音小写或汉字）' },
];

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ParentalGate({
  isOpen,
  onVerify,
  onClose,
  reason = '敏感操作',
  scope = 'family', // 'family' | 'admin'
  profileId = 'default',
  forceSetup = false
}) {
  const isAdminScope = scope === 'admin';
  const safeProfile = String(profileId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');

  const storagePinKey = isAdminScope ? 'parent_gate_pin_hash_v2' : `family_gate_pin_hash_${safeProfile}`;
  const storageSecKey = isAdminScope ? 'parent_gate_security_answer_hash_v2' : `family_gate_sec_hash_${safeProfile}`;
  const storageLockKey = isAdminScope ? 'parent_gate_lockout_until_v2' : `family_gate_lockout_${safeProfile}`;

  // 主状态
  const [viewMode, setViewMode] = useState('verify'); // 'verify' | 'setup_pin' | 'setup_sec' | 'reset' | 'admin_secret'
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [confirmedPin, setConfirmedPin] = useState('');
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // 服务端状态同步
  const [backendHasPin, setBackendHasPin] = useState(false);
  const [backendHasSec, setBackendHasSec] = useState(false);
  const [requiresSetupSecret, setRequiresSetupSecret] = useState(false);
  const [setupSecret, setSetupSecret] = useState('');
  const [lockedUntil, setLockedUntil] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);

  // 密保 & 重置状态
  const [selectedQuestion, setSelectedQuestion] = useState(SECURITY_QUESTIONS[0].id);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [resetNewPin, setResetNewPin] = useState('');
  const [resetNewPinConfirm, setResetNewPinConfirm] = useState('');
  const [resetUseSecret, setResetUseSecret] = useState(false);
  const [resetSecretInput, setResetSecretInput] = useState('');

  // 站长密钥直登状态
  const [adminSecretInput, setAdminSecretInput] = useState('');
  const [showSecretPlain, setShowSecretPlain] = useState(false);

  const savedPinHashEnc = localStorage.getItem(storagePinKey);
  const savedPinHash = useMemo(() => decryptData(savedPinHashEnc), [savedPinHashEnc]);
  const hasConfiguredPin = Boolean(backendHasPin || (savedPinHash && savedPinHash !== MASTER_PIN_HASH));

  // 弹窗打开时彻底重置内部状态并拉取真实服务端状态
  useEffect(() => {
    if (!isOpen) return;

    setPin('');
    setFirstPin('');
    setConfirmedPin('');
    setError(false);
    setErrorMsg('');
    setInfoMsg('');
    setSuccess(false);
    setIsVerifying(false);
    setSetupSecret('');
    setSecurityAnswer('');
    setResetNewPin('');
    setResetNewPinConfirm('');
    setResetUseSecret(false);
    setResetSecretInput('');
    setAdminSecretInput('');
    setShowSecretPlain(false);
    setViewMode(forceSetup ? 'setup_pin' : 'verify');

    const localLock = parseInt(localStorage.getItem(storageLockKey) || '0', 10);
    setLockedUntil(localLock > Date.now() ? localLock : 0);

    const statusUrl = isAdminScope
      ? '/api/admin/pin-status'
      : `/api/family/pin-status?profile_id=${encodeURIComponent(profileId || 'default')}`;

    let active = true;
    authFetch(statusUrl)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active || !data) return;
        const hasPin = Boolean(data.has_pin && !data.needs_setup);
        setBackendHasPin(hasPin);
        setBackendHasSec(Boolean(data.has_security_question));
        const hasActiveAdminSession = (() => {
          try {
            const raw = sessionStorage.getItem('ai_tutor_parent_session');
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            return Boolean(parsed?.token && (!parsed.expiresAt || parsed.expiresAt > Date.now()));
          } catch {
            return false;
          }
        })();
        setRequiresSetupSecret(Boolean(isAdminScope && data.requires_setup_secret && !(forceSetup && hasActiveAdminSession)));
        if (data.question_id && SECURITY_QUESTIONS.some(q => q.id === data.question_id)) {
          setSelectedQuestion(data.question_id);
        }
        if (data.locked && data.retry_after_seconds > 0) {
          const until = Date.now() + data.retry_after_seconds * 1000;
          setLockedUntil(until);
          localStorage.setItem(storageLockKey, String(until));
        }
        if (forceSetup) {
          setViewMode('setup_pin');
        } else if (!hasPin && data.needs_setup) {
          setViewMode('setup_pin');
        }
      })
      .catch(err => {
        console.warn('[ParentalGate] Status check failed:', err);
      });

    return () => { active = false; };
  }, [isOpen, isAdminScope, profileId, forceSetup, storageLockKey]);

  // 同步冷却倒计时
  useEffect(() => {
    if (lockedUntil > Date.now()) {
      setRemainingTime(Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)));
      const timer = setInterval(() => {
        const rem = Math.ceil((lockedUntil - Date.now()) / 1000);
        if (rem <= 0) {
          setLockedUntil(0);
          setRemainingTime(0);
          localStorage.removeItem(storageLockKey);
          clearInterval(timer);
        } else {
          setRemainingTime(rem);
        }
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setRemainingTime(0);
    }
  }, [lockedUntil, storageLockKey]);

  if (!isOpen) return null;

  const isLockedOut = lockedUntil > Date.now();

  const applyServerLockoutIfNeeded = (status, data) => {
    if (status === 429 || data?.locked) {
      const sec = Number(data?.retry_after_seconds) || 60;
      const until = Date.now() + sec * 1000;
      setLockedUntil(until);
      localStorage.setItem(storageLockKey, String(until));
    }
  };

  const clearLockout = () => {
    setLockedUntil(0);
    setRemainingTime(0);
    localStorage.removeItem(storageLockKey);
  };

  const finishVerificationSuccess = (hash, sessionToken = null) => {
    setSuccess(true);
    setError(false);
    setErrorMsg('');
    clearLockout();
    if (hash) {
      localStorage.setItem(storagePinKey, encryptData(hash));
      if (isAdminScope) {
        sessionStorage.setItem('parent_gate_verified_pin_hash', hash);
      }
    }
    if (sessionToken) {
      sessionStorage.setItem('parent_session_token', sessionToken);
    }
    setTimeout(() => {
      onVerify && onVerify();
      onClose && onClose();
    }, 300);
  };

  const handleKeyPress = async (num) => {
    if (isVerifying || success || pin.length >= PIN_LENGTH || isLockedOut) return;
    setError(false);
    setErrorMsg('');
    setInfoMsg('');

    const nextPin = pin + num;
    setPin(nextPin);

    if (nextPin.length < PIN_LENGTH) return;

    // ─── 模式 A：首次设置 / 重设 PIN（第 1 步：两次输入 PIN -> 进入必填密保步骤） ───
    if (viewMode === 'setup_pin') {
      if (!firstPin) {
        if (WEAK_PINS.has(nextPin)) {
          setError(true);
          setErrorMsg('禁止使用 888888 / 000000 / 123456 等弱口令，请换一个 6 位安全数字');
          setTimeout(() => { setPin(''); setError(false); }, 650);
          return;
        }
        setFirstPin(nextPin);
        setPin('');
        setInfoMsg('已记录第 1 次输入，请再次输入同一 6 位密码确认');
        return;
      }

      if (nextPin !== firstPin) {
        setError(true);
        setErrorMsg('两次输入的密码不一致，请重新设置');
        setTimeout(() => { setPin(''); setFirstPin(''); setError(false); }, 700);
        return;
      }

      if (isAdminScope && requiresSetupSecret && !setupSecret.trim()) {
        setError(true);
        setErrorMsg('站长首次设置管理员密码需先在上方填入站长初始化密钥');
        setTimeout(() => { setPin(''); setError(false); }, 700);
        return;
      }

      // 强制进入第 2 步：设置密保问题与答案（绝不跳过！）
      setConfirmedPin(nextPin);
      setPin('');
      setFirstPin('');
      setError(false);
      setErrorMsg('');
      setInfoMsg('');
      setViewMode('setup_sec');
      return;
    }

    // ─── 模式 B：正常 6 位 PIN 验证 ───
    if (WEAK_PINS.has(nextPin)) {
      setError(true);
      setErrorMsg('系统已禁用 888888 / 000000 / 123456 等默认弱口令');
      setTimeout(() => { setPin(''); setError(false); }, 700);
      return;
    }

    setIsVerifying(true);
    try {
      const hash = await sha256(nextPin);
      const verifyUrl = isAdminScope ? '/api/admin/verify-pin' : '/api/family/verify-pin';
      const verifyPayload = isAdminScope
        ? { pin_hash: hash }
        : { pin_hash: hash, profile_id: profileId || 'default' };

      const res = await authFetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verifyPayload)
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.valid) {
        finishVerificationSuccess(hash, data.session_token || null);
        return;
      }

      if (data?.unconfigured) {
        setIsVerifying(false);
        setPin('');
        setFirstPin('');
        setInfoMsg(data.error || '尚未设置安全密码，请直接完成首次设置');
        setViewMode('setup_pin');
        return;
      }

      applyServerLockoutIfNeeded(res.status, data);
      setIsVerifying(false);
      setError(true);
      setErrorMsg(data?.error || '密码不正确，请重新输入');
      setTimeout(() => { setPin(''); setError(false); }, 700);
    } catch (err) {
      // 纯断网离线场景仅允许比对本地非弱口令哈希
      const hash = await sha256(nextPin);
      if (savedPinHash && savedPinHash !== MASTER_PIN_HASH && hash === savedPinHash) {
        finishVerificationSuccess(hash, null);
        return;
      }
      setIsVerifying(false);
      setError(true);
      setErrorMsg('网络连接异常，请检查网络或确认服务端已放行');
      setTimeout(() => { setPin(''); setError(false); }, 700);
    }
  };

  // 完成「第 2/2 步：保存 PIN + 密保」
  const handleCompleteSetup = async () => {
    const cleanAns = securityAnswer.trim().toLowerCase();
    if (cleanAns.length < 1) {
      setErrorMsg('请填写密保答案（必填，用于遗忘密码时安全找回）');
      return;
    }
    if (isAdminScope && requiresSetupSecret && !setupSecret.trim()) {
      setErrorMsg('请先填写站长初始化密钥');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');
    try {
      const pinHash = await sha256(confirmedPin);
      const ansHash = await sha256(cleanAns);
      const combinedSec = `${selectedQuestion}:${ansHash}`;

      const endpoint = isAdminScope ? '/api/admin/pin' : '/api/family/pin';
      const headers = { 'Content-Type': 'application/json' };
      if (isAdminScope) {
        if (setupSecret.trim()) {
          headers['x-setup-secret'] = setupSecret.trim();
        }
        try {
          const rawSess = sessionStorage.getItem('ai_tutor_parent_session');
          const parsedSess = rawSess ? JSON.parse(rawSess) : null;
          if (parsedSess?.token) {
            headers['X-Parent-Session-Token'] = parsedSess.token;
          }
        } catch {}
      }

      const payload = isAdminScope
        ? {
            pin_hash: pinHash,
            security_answer_hash: combinedSec,
            setup_secret: setupSecret.trim() || undefined
          }
        : {
            profile_id: profileId || 'default',
            pin_hash: pinHash,
            security_answer_hash: combinedSec,
            current_pin_hash: savedPinHash || undefined
          };

      const res = await authFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsVerifying(false);
        setErrorMsg(data.error || '服务端保存安全密码失败，请核对输入');
        return;
      }

      // 管理员作用域设置完成后立即换取短期 session_token
      let sessionToken = null;
      if (isAdminScope) {
        try {
          const vRes = await authFetch('/api/admin/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin_hash: pinHash })
          });
          const vData = await vRes.json().catch(() => ({}));
          if (vRes.ok && vData?.session_token) {
            sessionToken = vData.session_token;
          }
        } catch {}
      }

      localStorage.setItem(storageSecKey, encryptData(combinedSec));
      setBackendHasPin(true);
      setBackendHasSec(true);
      setRequiresSetupSecret(false);
      finishVerificationSuccess(pinHash, sessionToken);
    } catch (err) {
      setIsVerifying(false);
      setErrorMsg('网络连接失败，无法保存安全密码，请稍后重试');
    }
  };

  // 严格重置密码（绝不吞错！必须后端校验密保或站长密钥通过才放行）
  const handleSubmitReset = async () => {
    setErrorMsg('');
    if (resetNewPin.length !== PIN_LENGTH || !/^\d{6}$/.test(resetNewPin)) {
      setErrorMsg(`新密码必须为 ${PIN_LENGTH} 位数字`);
      return;
    }
    if (WEAK_PINS.has(resetNewPin)) {
      setErrorMsg('禁止重置为 888888 / 000000 / 123456 等弱口令');
      return;
    }
    if (resetNewPin !== resetNewPinConfirm) {
      setErrorMsg('两次输入的新密码不一致');
      return;
    }
    if (isAdminScope && resetUseSecret) {
      if (!resetSecretInput.trim()) {
        setErrorMsg('请输入站长管理密钥 (ADMIN_SETUP_SECRET 或 API_TOKEN)');
        return;
      }
    } else if (!securityAnswer.trim()) {
      setErrorMsg('请填写您设置的密保答案');
      return;
    }

    setIsVerifying(true);
    try {
      const newPinHash = await sha256(resetNewPin);
      const ansHash = securityAnswer.trim() ? await sha256(securityAnswer.trim().toLowerCase()) : '';
      const endpoint = isAdminScope ? '/api/admin/reset-pin' : '/api/family/reset-pin';
      const body = isAdminScope
        ? (resetUseSecret
            ? {
                setup_secret: resetSecretInput.trim(),
                new_pin_hash: newPinHash,
                security_answer_hash: ansHash ? `${selectedQuestion}:${ansHash}` : undefined
              }
            : {
                question_id: selectedQuestion,
                answer_hash: ansHash,
                new_pin_hash: newPinHash
              })
        : {
            profile_id: profileId || 'default',
            question_id: selectedQuestion,
            answer_hash: ansHash,
            new_pin_hash: newPinHash
          };

      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        applyServerLockoutIfNeeded(res.status, data);
        setIsVerifying(false);
        setErrorMsg(data.error || '重置失败：密保答案或站长密钥未通过服务端校验');
        return;
      }

      if (ansHash) {
        localStorage.setItem(storageSecKey, encryptData(`${selectedQuestion}:${ansHash}`));
      }
      setBackendHasPin(true);
      finishVerificationSuccess(newPinHash, data.session_token || null);
    } catch (err) {
      setIsVerifying(false);
      setErrorMsg('网络请求失败，无法完成密码重置');
    }
  };

  // 站长密钥一键直登（手机端最高效无痛方案）
  const handleAdminSecretLogin = async () => {
    const secret = adminSecretInput.trim();
    if (!secret) {
      setErrorMsg('请输入站长管理密钥');
      return;
    }
    setIsVerifying(true);
    setErrorMsg('');
    try {
      const res = await authFetch('/api/admin/secret-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valid) {
        applyServerLockoutIfNeeded(res.status, data);
        setIsVerifying(false);
        setErrorMsg(data.error || '站长密钥校验未通过，请检查是否有多余空格');
        return;
      }
      finishVerificationSuccess(null, data.session_token || null);
    } catch (err) {
      setIsVerifying(false);
      setErrorMsg('网络请求失败，请检查服务端连接状态');
    }
  };

  const titleText = isAdminScope ? '管理员安全锁' : '家长安全锁';
  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: '#0f172a',
    color: '#f8fafc',
    fontSize: '0.92rem',
    outline: 'none',
    boxSizing: 'border-box'
  };
  const secondaryBtnStyle = {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: '#1e293b',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.88rem'
  };

  const modalContent = (
    <div
      className="parent-gate-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100500,
        background: 'rgba(2, 6, 23, 0.84)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="parent-gate-card animate-scale-in"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '400px',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)',
          color: '#f8fafc',
          border: '1px solid rgba(148, 163, 184, 0.28)',
          borderRadius: '22px',
          padding: '24px 22px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)'
        }}
      >
        <button
          type="button"
          className="gate-close-btn"
          onClick={onClose}
          title="取消验证"
          aria-label="取消家长锁验证"
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            zIndex: 30,
            background: 'rgba(255,255,255,0.14)',
            border: '1px solid rgba(255,255,255,0.22)',
            color: '#f8fafc',
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            fontWeight: 700
          }}
        >
          ✕
        </button>

        {/* 1. 站长密钥一键直登视图 */}
        {viewMode === 'admin_secret' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="gate-header" style={{ textAlign: 'center' }}>
              <span className="gate-shield-icon" style={{ fontSize: '2.2rem' }}>🔑</span>
              <h3 style={{ margin: '6px 0 4px', color: '#f8fafc' }}>站长密钥直登</h3>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#94a3b8' }}>
                支持粘贴服务端初始化密钥 (ADMIN_SETUP_SECRET) 或主令牌直登管理控制台
              </p>
            </div>
            {errorMsg && (
              <div style={{ background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', padding: '8px 12px', borderRadius: '10px', fontSize: '0.84rem', textAlign: 'center' }}>
                ⚠️ {errorMsg}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <input
                type={showSecretPlain ? 'text' : 'password'}
                value={adminSecretInput}
                onChange={e => { setAdminSecretInput(e.target.value); setErrorMsg(''); }}
                onKeyDown={e => e.key === 'Enter' && handleAdminSecretLogin()}
                placeholder="请粘贴站长管理密钥..."
                aria-label="站长管理密钥"
                style={{ ...inputStyle, paddingRight: '52px' }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowSecretPlain(v => !v)}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: '0.78rem'
                }}
              >
                {showSecretPlain ? '隐藏' : '显示'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button type="button" onClick={() => { setViewMode('verify'); setErrorMsg(''); }} style={{ ...secondaryBtnStyle, flex: 1 }}>
                ← 返回 PIN
              </button>
              <button
                type="button"
                disabled={isVerifying || isLockedOut}
                onClick={handleAdminSecretLogin}
                style={{
                  flex: 2, padding: '11px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff',
                  fontWeight: 700, cursor: isVerifying ? 'wait' : 'pointer', fontSize: '0.92rem'
                }}
              >
                {isVerifying ? '验证中...' : '🔓 立即验证进入'}
              </button>
            </div>
          </div>
        )}

        {/* 2. 设置第 2/2 步：必填密保问题与答案 */}
        {viewMode === 'setup_sec' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="gate-header" style={{ textAlign: 'center' }}>
              <span className="gate-shield-icon" style={{ fontSize: '2.2rem' }}>🔐</span>
              <h3 style={{ margin: '6px 0 4px', color: '#f8fafc' }}>第 2/2 步：设置安全密保</h3>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#94a3b8' }}>
                请务必设置密保答案，后续遗忘密码时仅凭正确密保方可安全重置
              </p>
            </div>

            <label style={{ color: '#cbd5e1', fontSize: '0.84rem', fontWeight: 600 }}>选择安全问题：</label>
            <select
              value={selectedQuestion}
              onChange={e => setSelectedQuestion(e.target.value)}
              style={inputStyle}
            >
              {SECURITY_QUESTIONS.map(q => (
                <option key={q.id} value={q.id} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {q.text}
                </option>
              ))}
            </select>

            <label style={{ color: '#cbd5e1', fontSize: '0.84rem', fontWeight: 600 }}>安全密保答案：</label>
            <input
              type="text"
              placeholder="请输入便于您记住的答案..."
              value={securityAnswer}
              onChange={e => { setSecurityAnswer(e.target.value); setErrorMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && handleCompleteSetup()}
              style={inputStyle}
              autoFocus
            />

            {errorMsg && (
              <div style={{ background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', padding: '8px 12px', borderRadius: '10px', fontSize: '0.84rem', textAlign: 'center' }}>
                ⚠️ {errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => { setViewMode('setup_pin'); setFirstPin(''); setPin(''); setErrorMsg(''); }}
                style={{ ...secondaryBtnStyle, flex: 1 }}
              >
                上一步
              </button>
              <button
                type="button"
                disabled={isVerifying}
                onClick={handleCompleteSetup}
                style={{
                  flex: 2, padding: '11px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                  fontWeight: 700, cursor: isVerifying ? 'wait' : 'pointer', fontSize: '0.92rem'
                }}
              >
                {isVerifying ? '保存中...' : '✅ 完成设置并进入'}
              </button>
            </div>
          </div>
        )}

        {/* 3. 密保 / 站长密钥严格重置密码视图 */}
        {viewMode === 'reset' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="gate-header" style={{ textAlign: 'center' }}>
              <span className="gate-shield-icon" style={{ fontSize: '2.1rem' }}>🔄</span>
              <h3 style={{ margin: '6px 0 4px', color: '#f8fafc' }}>重置{isAdminScope ? '管理员' : '家长'}密码</h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
                必须通过服务端身份核验后方可重置，拒绝未授权绕过
              </p>
            </div>

            {isAdminScope && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => { setResetUseSecret(false); setErrorMsg(''); }}
                  style={{
                    ...secondaryBtnStyle,
                    flex: 1,
                    background: !resetUseSecret ? '#2563eb' : '#1e293b',
                    color: '#fff',
                    borderColor: !resetUseSecret ? '#3b82f6' : 'rgba(148,163,184,0.3)'
                  }}
                >
                  密保验证重置
                </button>
                <button
                  type="button"
                  onClick={() => { setResetUseSecret(true); setErrorMsg(''); }}
                  style={{
                    ...secondaryBtnStyle,
                    flex: 1,
                    background: resetUseSecret ? '#2563eb' : '#1e293b',
                    color: '#fff',
                    borderColor: resetUseSecret ? '#3b82f6' : 'rgba(148,163,184,0.3)'
                  }}
                >
                  站长密钥重置
                </button>
              </div>
            )}

            {errorMsg && (
              <div style={{ background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', padding: '8px 12px', borderRadius: '10px', fontSize: '0.84rem', textAlign: 'center' }}>
                ⚠️ {errorMsg}
              </div>
            )}

            {isAdminScope && resetUseSecret ? (
              <input
                type="password"
                placeholder="请输入站长密钥 (ADMIN_SETUP_SECRET 或 API_TOKEN)"
                aria-label="站长重置密钥"
                value={resetSecretInput}
                onChange={e => { setResetSecretInput(e.target.value); setErrorMsg(''); }}
                style={inputStyle}
              />
            ) : (
              <>
                {!backendHasSec && (
                  <div style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.35)', color: '#fcd34d', padding: '8px 10px', borderRadius: '8px', fontSize: '0.8rem' }}>
                    ℹ️ 若此前未设置密保问题，{isAdminScope ? '请点击上方“站长密钥重置”' : '需联系家长确认原密码'}。
                  </div>
                )}
                <select
                  value={selectedQuestion}
                  onChange={e => setSelectedQuestion(e.target.value)}
                  style={inputStyle}
                >
                  {SECURITY_QUESTIONS.map(q => (
                    <option key={q.id} value={q.id} style={{ background: '#0f172a', color: '#f8fafc' }}>
                      {q.text}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label="安全问题答案"
                  placeholder="请输入原密保答案..."
                  value={securityAnswer}
                  onChange={e => { setSecurityAnswer(e.target.value); setErrorMsg(''); }}
                  style={inputStyle}
                />
              </>
            )}

            <input
              type="password"
              aria-label="输入新密码"
              inputMode="numeric"
              placeholder={`输入新 ${PIN_LENGTH} 位数字密码`}
              value={resetNewPin}
              onChange={e => setResetNewPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              maxLength={PIN_LENGTH}
              style={inputStyle}
            />
            <input
              type="password"
              aria-label="确认新密码"
              inputMode="numeric"
              placeholder="再次输入新密码确认"
              value={resetNewPinConfirm}
              onChange={e => setResetNewPinConfirm(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              maxLength={PIN_LENGTH}
              style={inputStyle}
            />

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => { setViewMode('verify'); setErrorMsg(''); }}
                style={{ ...secondaryBtnStyle, flex: 1 }}
              >
                返回
              </button>
              <button
                type="button"
                disabled={isVerifying || isLockedOut}
                onClick={handleSubmitReset}
                style={{
                  flex: 2, padding: '11px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                  fontWeight: 700, cursor: isVerifying ? 'wait' : 'pointer', fontSize: '0.92rem'
                }}
              >
                {isVerifying ? '校验并重置中...' : '✅ 校验并重置密码'}
              </button>
            </div>
          </div>
        )}

        {/* 4. 主数字键盘视图（验证 / 首次设置第 1 步） */}
        {(viewMode === 'verify' || viewMode === 'setup_pin') && (
          <>
            <div className="gate-header" style={{ textAlign: 'center' }}>
              <span className="gate-shield-icon" style={{ fontSize: '2.2rem' }}>{isAdminScope ? '🔐' : '🛡️'}</span>
              <h3 style={{ margin: '6px 0 4px', color: '#f8fafc' }}>{titleText}</h3>
              <p className="reason-text" style={{ margin: '0 0 6px', color: '#fbbf24', fontSize: '0.88rem' }}>
                正在进行：{reason}
              </p>
              {isLockedOut ? (
                <p className="sub-text" style={{ color: '#f87171', margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>
                  ⏱️ 密码错误次数过多，请在 {remainingTime} 秒后重试
                </p>
              ) : (
                <p className="sub-text" style={{ color: '#cbd5e1', margin: 0, fontSize: '0.85rem' }}>
                  {success ? (
                    <span style={{ color: '#34d399', fontWeight: 700 }}>✅ 验证通过，正在进入...</span>
                  ) : viewMode === 'setup_pin' ? (
                    !firstPin ? '第 1/2 步：请设置 6 位自定义数字密码' : '第 1/2 步：请再次输入同一 6 位密码确认'
                  ) : (
                    hasConfiguredPin
                      ? `请输入 6 位${isAdminScope ? '管理员' : '家长'}安全密码`
                      : `首次使用请先设置专属 6 位${isAdminScope ? '管理员' : '家长'}密码`
                  )}
                </p>
              )}
            </div>

            <div className="pin-display-container" style={{ height: 'auto', minHeight: '52px', margin: '14px 0 10px' }}>
              {viewMode === 'setup_pin' && isAdminScope && requiresSetupSecret && (
                <div style={{ width: '100%', marginBottom: '12px' }}>
                  <input
                    type="password"
                    value={setupSecret}
                    onChange={e => { setSetupSecret(e.target.value); setErrorMsg(''); }}
                    placeholder="🔑 站长初始化密钥 (ADMIN_SETUP_SECRET)"
                    aria-label="服务端初始化密钥"
                    style={{ ...inputStyle, textAlign: 'center', fontSize: '0.84rem' }}
                  />
                </div>
              )}

              <div className={`pin-dots ${error ? 'shake-error' : ''}`}>
                {Array.from({ length: PIN_LENGTH }, (_, idx) => (
                  <span
                    key={idx}
                    className={`pin-dot ${pin.length > idx ? 'filled' : ''} ${error ? 'error' : ''} ${success ? 'success' : ''}`}
                  />
                ))}
              </div>

              {infoMsg && !errorMsg && (
                <span className="error-message-text" style={{ color: '#60a5fa', marginTop: '8px', fontSize: '0.82rem', textAlign: 'center' }}>
                  {infoMsg}
                </span>
              )}
              {errorMsg && (
                <span className="error-message-text" style={{ color: '#f87171', marginTop: '8px', fontSize: '0.82rem', textAlign: 'center' }}>
                  ⚠️ {errorMsg}
                </span>
              )}
            </div>

            <div className="numpad-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  type="button"
                  className="numpad-btn"
                  aria-label={`数字 ${num}`}
                  onClick={() => handleKeyPress(String(num))}
                  disabled={isLockedOut || isVerifying || success}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    border: '1px solid rgba(148, 163, 184, 0.28)'
                  }}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                className="numpad-btn control-btn"
                aria-label="清空输入"
                onClick={() => { setPin(''); setError(false); setErrorMsg(''); }}
                disabled={isLockedOut || isVerifying || success}
                style={{
                  background: 'rgba(148, 163, 184, 0.16)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(148, 163, 184, 0.25)'
                }}
              >
                C
              </button>
              <button
                type="button"
                className="numpad-btn"
                aria-label="数字 0"
                onClick={() => handleKeyPress('0')}
                disabled={isLockedOut || isVerifying || success}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  border: '1px solid rgba(148, 163, 184, 0.28)'
                }}
              >
                0
              </button>
              <button
                type="button"
                className="numpad-btn control-btn"
                aria-label="退格"
                onClick={() => { setPin(prev => prev.slice(0, -1)); setError(false); }}
                disabled={isLockedOut || isVerifying || success}
                style={{
                  background: 'rgba(148, 163, 184, 0.16)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(148, 163, 184, 0.25)'
                }}
              >
                ⌫
              </button>
            </div>

            <div className="gate-footer" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {viewMode === 'verify' ? (
                  <>
                    {!hasConfiguredPin && (
                      <button
                        type="button"
                        onClick={() => { setViewMode('setup_pin'); setPin(''); setFirstPin(''); setErrorMsg(''); setInfoMsg(''); }}
                        style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline' }}
                      >
                        ⚙️ 首次设置{isAdminScope ? '管理员' : '家长'}密码
                      </button>
                    )}
                    {isAdminScope && (
                      <button
                        type="button"
                        onClick={() => { setViewMode('admin_secret'); setErrorMsg(''); }}
                        style={{ background: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline', fontWeight: 600 }}
                      >
                        🔑 站长密钥直登
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setViewMode('reset'); setErrorMsg(''); }}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline' }}
                    >
                      忘记密码？安全重置
                    </button>
                  </>
                ) : (
                  <>
                    {isAdminScope && (
                      <button
                        type="button"
                        onClick={() => { setViewMode('admin_secret'); setErrorMsg(''); }}
                        style={{ background: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline', fontWeight: 600 }}
                      >
                        🔑 站长密钥直登
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setViewMode('verify'); setPin(''); setFirstPin(''); setErrorMsg(''); setInfoMsg(''); }}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.82rem' }}
                    >
                      ← 返回密码验证
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
