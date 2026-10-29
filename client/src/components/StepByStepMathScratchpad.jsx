import React, { useState, useEffect, useRef } from 'react';
import { verifyStepTransition, COMMON_MATH_SYMBOLS } from '../utils/stepVerifier';

/**
 * StepByStepMathScratchpad
 * 步骤级实时代数演算纸与 CAS 校验卫士 (对标 Photomath / Microsoft Math Solver)
 * 核心特性：
 * 1. 写一步实时验一步，毫秒级检测等价变换
 * 2. 模式匹配识别“移项未变号”、“漏除常数”等学生易错陷阱
 * 3. 快捷数学符号软键盘与一键同步至私教对话
 */
export default function StepByStepMathScratchpad({
  isOpen,
  initialEquation = '2x + 4 = 10',
  onClose,
  onApplyToChat
}) {
  const [baseEquation, setBaseEquation] = useState(initialEquation);
  const [steps, setSteps] = useState([
    { text: '2x = 10 - 4', status: 'valid', message: '✓ 推导完全正确！', tip: '' }
  ]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setBaseEquation(initialEquation || '2x + 4 = 10');
      // Validate initial step
      const firstCheck = verifyStepTransition(initialEquation || '2x + 4 = 10', '2x = 10 - 4');
      setSteps([
        { text: '2x = 10 - 4', ...firstCheck }
      ]);
      setActiveStepIdx(0);
    }
  }, [isOpen, initialEquation]);

  const handleStepChange = (idx, newText) => {
    const prevText = idx === 0 ? baseEquation : steps[idx - 1].text;
    const check = verifyStepTransition(prevText, newText);

    setSteps(prev => {
      const copy = [...prev];
      copy[idx] = { text: newText, ...check };
      return copy;
    });
  };

  const handleAddStep = () => {
    const lastStep = steps[steps.length - 1];
    const prevText = lastStep ? lastStep.text : baseEquation;
    setSteps(prev => [
      ...prev,
      { text: '', status: 'empty', message: '等待输入推导...', tip: '' }
    ]);
    setActiveStepIdx(steps.length);
  };

  const handleDeleteStep = (idx) => {
    if (steps.length <= 1) return;
    setSteps(prev => prev.filter((_, i) => i !== idx));
    setActiveStepIdx(Math.max(0, idx - 1));
  };

  const handleInsertSymbol = (sym) => {
    const curStep = steps[activeStepIdx];
    if (!curStep) return;
    const newText = (curStep.text || '') + sym;
    handleStepChange(activeStepIdx, newText);
  };

  const handleSendToChat = () => {
    let summary = `老师，我在分步演算纸上推导了原方程【${baseEquation}】：\n`;
    steps.forEach((s, i) => {
      summary += `第 ${i + 1} 步：${s.text} (${s.valid ? '正确' : '需修正: ' + s.message})\n`;
    });
    summary += `请问老师，在书写规范的解答题过程时，我这种分步格式符合中考阅卷标准吗？`;
    onApplyToChat && onApplyToChat(summary);
    onClose();
  };

  if (!isOpen) return null;

  const allValid = steps.length > 0 && steps.every(s => s.valid);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '740px',
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
          color: '#fff', padding: '18px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.8rem' }}>📝</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800' }}>
                分步实时代数演算纸 (CAS 实时验算卫士)
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#a7f3d0', marginTop: '2px' }}>
                写一步验一步 · 变号漏项实时标黄提醒 · 步步踏实不再做错！
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Base Equation Row */}
          <div style={{ background: '#f8fafc', padding: '12px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748b' }}>原方程/目标式：</span>
            <input
              type="text"
              value={baseEquation}
              onChange={e => setBaseEquation(e.target.value)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '1.05rem', fontWeight: '700', color: '#1e293b'
              }}
            />
          </div>

          {/* Quick Math Symbols Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', background: '#f1f5f9', padding: '8px 12px', borderRadius: '12px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', marginRight: '4px' }}>快捷符号:</span>
            {COMMON_MATH_SYMBOLS.map(sym => (
              <button
                key={sym}
                type="button"
                onClick={() => handleInsertSymbol(sym)}
                style={{
                  background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px',
                  padding: '4px 10px', fontSize: '0.9rem', fontWeight: 'bold', color: '#1e293b',
                  cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Steps List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {steps.map((step, idx) => (
              <div
                key={idx}
                onClick={() => setActiveStepIdx(idx)}
                style={{
                  background: activeStepIdx === idx ? '#f0fdf4' : '#ffffff',
                  border: `2px solid ${step.valid ? '#10b981' : (step.status === 'invalid' ? '#f59e0b' : '#e2e8f0')}`,
                  borderRadius: '14px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px',
                  boxShadow: activeStepIdx === idx ? '0 0 10px rgba(16, 185, 129, 0.2)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#059669', minWidth: '60px' }}>
                    Step {idx + 1}:
                  </span>
                  <input
                    type="text"
                    value={step.text}
                    onChange={e => handleStepChange(idx, e.target.value)}
                    onFocus={() => setActiveStepIdx(idx)}
                    placeholder="在此输入当前化简或推导步骤..."
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                      fontSize: '1rem', fontWeight: '600', color: '#1e293b', outline: 'none'
                    }}
                  />
                  <div style={{
                    fontSize: '0.82rem', fontWeight: '700', minWidth: '120px', textAlign: 'right',
                    color: step.valid ? '#059669' : (step.status === 'invalid' ? '#d97706' : '#94a3b8')
                  }}>
                    {step.message}
                  </div>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteStep(idx); }}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1rem', cursor: 'pointer' }}
                      title="删除此步骤"
                    >
                      🗑️
                    </button>
                  )}
                </div>

                {/* Warning / Guidance Tip */}
                {step.tip && (
                  <div style={{
                    fontSize: '0.8rem', color: step.valid ? '#047857' : '#b45309',
                    background: step.valid ? '#ecfdf5' : '#fffbeb',
                    padding: '6px 10px', borderRadius: '8px', marginLeft: '72px'
                  }}>
                    💡 {step.tip}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Step Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="button"
              onClick={handleAddStep}
              style={{
                background: '#ecfdf5', color: '#059669', border: '1.5px dashed #10b981',
                padding: '8px 18px', borderRadius: '10px', fontWeight: '700', fontSize: '0.85rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <span>➕ 添加下一步推导</span>
            </button>
          </div>

          {/* Master Summary Banner */}
          {allValid && steps.length >= 2 && (
            <div style={{
              background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
              border: '1px solid #86efac', borderRadius: '14px', padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: '10px', color: '#166534'
            }}>
              <span style={{ fontSize: '1.6rem' }}>🎉</span>
              <div>
                <div style={{ fontWeight: '800', fontSize: '0.92rem' }}>全流程代数推导 100% 严谨成立！</div>
                <div style={{ fontSize: '0.8rem' }}>每一步变换均通过神经符号 CAS 等价认证，可直接作为标准解答誊写！</div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f1f5f9', color: '#475569', border: 'none',
                padding: '8px 16px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleSendToChat}
              style={{
                background: 'linear-gradient(135deg, #059669, #0d9488)',
                color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '10px',
                fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <span>💬</span>
              <span>带入课堂向名师请教批改</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
