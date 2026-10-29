import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { authFetch } from '../store/useStore';
import { preprocessLatex } from '../utils/math';
import { playSuccessChime } from '../utils/sensoryFeedback';

/**
 * VariantPracticeModal
 * 对标 ALEKS 与作业帮的“跨年级根因溯源 + 举一反三变式通关”
 * 当学生解答或复盘一道题时：
 * 1. 【🌱 根因溯源】：若存在跨学期知识断层，一针见血指出底层卡点（如初中几何卡在小学割补法），提供2分钟基石攻坚小题；
 * 2. 【母题巩固】：夯实本题核心解题模型；
 * 3. 【避坑拔高】：规避易错陷阱，实现“做一题、通一类”。
 */
export default function VariantPracticeModal({
  isOpen,
  onClose,
  originalQuestion = '',
  originalAnswer = '',
  grade = '7_up',
  subject = '数学',
  studentName = '曾练',
  initialStep = 0,
  onRewardExp
}) {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(initialStep); // -1: root cause remedy, 0: variant 1, 1: variant 2
  const [showHint, setShowHint] = useState(false);
  const [studentInput, setStudentInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // result from check-variant-answer
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({});

  // 1. 获取变式题与先序根因诊断
  useEffect(() => {
    let mounted = true;
    async function fetchVariants() {
      setLoading(true);
      setError('');
      setFeedback(null);
      setShowAnalysis(false);
      setStudentInput('');
      setShowHint(false);
      try {
        const res = await authFetch('/api/mistakes/generate-variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: originalQuestion,
            answer: originalAnswer,
            grade,
            subject
          })
        });
        const json = await res.json();
        if (mounted) {
          if (res.ok && json.success && json.data) {
            setData(json.data);
            // If cross-grade gap is detected and initialStep wasn't forced, prioritize root cause
            if (json.data.prerequisite_root_cause?.hasCrossGradeGap && initialStep === 0) {
              setCurrentStep(-1);
            } else {
              setCurrentStep(initialStep);
            }
          } else {
            setError(json.error || '生成变式题失败，请稍后重试');
          }
        }
      } catch (err) {
        if (mounted) setError('网络异常，无法连接到变式题生成服务');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (isOpen && originalQuestion) {
      fetchVariants();
    }
    return () => { mounted = false; };
  }, [isOpen, originalQuestion, originalAnswer, grade, subject, initialStep]);

  const rootCause = data?.prerequisite_root_cause || null;
  const currentVariant = currentStep === -1
    ? (rootCause?.remedy || null)
    : (data?.variants?.[currentStep] || null);

  // 2. 提交作答并即时批改 (含 CAS 神经符号快速验算)
  const handleSubmitAnswer = async () => {
    if (!studentInput.trim() || !currentVariant || submitting) return;
    setSubmitting(true);
    const isFoundation = currentStep === -1;
    try {
      const res = await authFetch('/api/mistakes/check-variant-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: isFoundation ? currentVariant.question : currentVariant.question,
          standard_answer: currentVariant.answer,
          student_answer: studentInput.trim(),
          grade,
          is_foundation: isFoundation
        })
      });
      const json = await res.json();
      if (res.ok && json.success && json.feedback) {
        setFeedback(json.feedback);
        setShowAnalysis(true);
        if (json.feedback.is_correct) {
          playSuccessChime();
          setCompletedSteps(prev => ({ ...prev, [currentStep]: true }));
          if (onRewardExp && json.feedback.score_earned) {
            onRewardExp(json.feedback.score_earned);
          }
        }
      }
    } catch (e) {
      console.warn('Check variant failed:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextStep = () => {
    if (currentStep === -1) {
      setCurrentStep(0);
    } else if (data?.variants && currentStep < data.variants.length - 1) {
      setCurrentStep(s => s + 1);
    }
    setStudentInput('');
    setFeedback(null);
    setShowHint(false);
    setShowAnalysis(false);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.82)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#1e293b',
        color: '#f8fafc',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '92vh',
        borderRadius: '20px',
        border: '1px solid rgba(59, 130, 246, 0.35)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(59, 130, 246, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'modalSlideUp 0.25s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(30, 58, 138, 0.6) 0%, rgba(30, 41, 59, 0.9) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>🌱</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 'bold', color: '#60a5fa' }}>
                知识根因穿透 · 举一反三变式通关
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                ALEKS 级跨学期漏洞诊断 · 攻克底层基石 · 击穿变式母题
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.3rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <div className="typing-indicator" style={{ display: 'inline-flex', marginBottom: '12px' }}>
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>AI 特级教师正在扫描知识图谱，向下溯源底层知识卡点...</p>
            </div>
          )}

          {error && !loading && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              color: '#fca5a5'
            }}>
              <p style={{ margin: 0 }}>{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* 核心考点胶囊 */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '0.88rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>📌 主考点：</span>
                  <span style={{ color: '#e2e8f0', fontWeight: '500' }}>{data.core_knowledge}</span>
                </div>
                {rootCause?.hasCrossGradeGap && (
                  <span style={{
                    fontSize: '0.75rem',
                    background: 'rgba(245, 158, 11, 0.2)',
                    border: '1px solid #f59e0b',
                    color: '#fcd34d',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 'bold'
                  }}>
                    ⚠️ 检测到底层前置漏洞
                  </span>
                )}
              </div>

              {/* 闯关选项卡导航 */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {rootCause && (
                  <button
                    onClick={() => {
                      setCurrentStep(-1);
                      setStudentInput('');
                      setFeedback(null);
                      setShowHint(false);
                      setShowAnalysis(false);
                    }}
                    style={{
                      flex: 1,
                      minWidth: '140px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: currentStep === -1 ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: currentStep === -1 ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 95, 70, 0.3))' : 'rgba(30, 41, 59, 0.5)',
                      color: currentStep === -1 ? '#34d399' : '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontWeight: 'bold',
                      fontSize: '0.86rem',
                      transition: 'all 0.2s',
                      boxShadow: currentStep === -1 ? '0 0 15px rgba(16, 185, 129, 0.2)' : 'none'
                    }}
                  >
                    <span>{completedSteps[-1] ? '✅' : '🌱'}</span>
                    <span>基石溯源：{rootCause.rootCauseNode.name.slice(0, 6)}</span>
                  </button>
                )}

                {data.variants.map((v, idx) => {
                  const isActive = idx === currentStep;
                  const isDone = completedSteps[idx];
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setCurrentStep(idx);
                        setStudentInput('');
                        setFeedback(null);
                        setShowHint(false);
                        setShowAnalysis(false);
                      }}
                      style={{
                        flex: 1,
                        minWidth: '120px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: isActive ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isActive ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(30, 58, 138, 0.3))' : 'rgba(30, 41, 59, 0.5)',
                        color: isActive ? '#38bdf8' : '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontWeight: '600',
                        fontSize: '0.86rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      <span>{isDone ? '✅' : (idx === 0 ? '🎯' : '🔥')}</span>
                      <span>第 {idx + 1} 关：{v.tag}</span>
                    </button>
                  );
                })}
              </div>

              {/* === 视图 1：跨学期知识根因穿透卡 (Step -1) === */}
              {currentStep === -1 && rootCause && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.75), rgba(6, 78, 59, 0.2))',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  {/* 1. 知识链路拓扑条 */}
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#6ee7b7', fontWeight: 'bold', marginBottom: '8px' }}>
                      🔗 跨学期认知链路拓扑（知识树向下溯源）：
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      overflowX: 'auto',
                      padding: '8px 12px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '8px'
                    }}>
                      {rootCause.chainPath.map((node, i) => (
                        <React.Fragment key={node.id}>
                          <div style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: node.isRoot ? 'rgba(16, 185, 129, 0.25)' : (node.isCurrent ? 'rgba(56, 189, 248, 0.2)' : 'rgba(148, 163, 184, 0.1)'),
                            border: node.isRoot ? '1px solid #10b981' : (node.isCurrent ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)'),
                            color: node.isRoot ? '#6ee7b7' : (node.isCurrent ? '#7dd3fc' : '#cbd5e1'),
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            whiteSpace: 'nowrap'
                          }}>
                            <span>{node.tag}</span>
                            <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>{node.name}</div>
                          </div>
                          {i < rootCause.chainPath.length - 1 && (
                            <span style={{ color: '#64748b', fontSize: '1rem' }}>➔</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {/* 2. 名师一针见血诊断理由 */}
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.12)',
                    borderLeft: '4px solid #f59e0b',
                    padding: '10px 14px',
                    borderRadius: '0 8px 8px 0',
                    fontSize: '0.88rem',
                    color: '#fef3c7',
                    lineHeight: '1.5'
                  }}>
                    <strong>💡 特级教师洞察：</strong>
                    {rootCause.remedy.diagnosisReason}
                  </div>

                  {/* 3. 具象生活隐喻 & 独门口诀 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                    {rootCause.remedy.lifeAnalogy && (
                      <div style={{
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        fontSize: '0.84rem'
                      }}>
                        <div style={{ color: '#f43f5e', fontWeight: 'bold', marginBottom: '4px' }}>🍎 通俗生活隐喻：</div>
                        <div style={{ color: '#cbd5e1', lineHeight: '1.4' }}>{rootCause.remedy.lifeAnalogy}</div>
                      </div>
                    )}
                    {rootCause.remedy.teacherMnemonic && (
                      <div style={{
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        fontSize: '0.84rem'
                      }}>
                        <div style={{ color: '#a855f7', fontWeight: 'bold', marginBottom: '4px' }}>📜 独门速记口诀：</div>
                        <div style={{ color: '#e9d5ff', lineHeight: '1.4' }}>{rootCause.remedy.teacherMnemonic}</div>
                      </div>
                    )}
                  </div>

                  {/* 4. 2分钟底层基石攻坚小题 */}
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#34d399' }}>
                        🎯 2分钟底层基石自测小题
                      </span>
                      <button
                        onClick={() => setShowHint(h => !h)}
                        style={{
                          background: 'transparent',
                          border: '1px dashed #10b981',
                          color: '#6ee7b7',
                          borderRadius: '6px',
                          padding: '2px 8px',
                          fontSize: '0.78rem',
                          cursor: 'pointer'
                        }}
                      >
                        {showHint ? '隐藏思路' : '💡 提示'}
                      </button>
                    </div>

                    <div style={{ fontSize: '0.94rem', color: '#f8fafc', lineHeight: '1.5' }}>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {preprocessLatex(rootCause.remedy.question)}
                      </ReactMarkdown>
                    </div>

                    {showHint && (
                      <div style={{ fontSize: '0.82rem', color: '#a7f3d0', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 10px', borderRadius: '6px' }}>
                        💡 <strong>点拨：</strong>{rootCause.remedy.hint}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* === 视图 2：变式题展示卡片 (Step 0 & 1) === */}
              {currentStep >= 0 && currentVariant && (
                <div style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      background: currentVariant.type === 'consolidation' ? '#065f46' : '#9a3412',
                      color: currentVariant.type === 'consolidation' ? '#6ee7b7' : '#fdba74',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      {currentVariant.tag}
                    </span>
                    <button
                      onClick={() => setShowHint(h => !h)}
                      style={{
                        background: 'transparent',
                        border: '1px dashed #eab308',
                        color: '#facc15',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      {showHint ? '🙈 隐藏点拨' : '💡 老师点拨'}
                    </button>
                  </div>

                  {/* 变式题目正文 */}
                  <div style={{ fontSize: '0.98rem', lineHeight: '1.6', color: '#f1f5f9' }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {preprocessLatex(currentVariant.question)}
                    </ReactMarkdown>
                  </div>

                  {/* 思路点拨提示 */}
                  {showHint && currentVariant.hint && (
                    <div style={{
                      background: 'rgba(234, 179, 8, 0.1)',
                      borderLeft: '3px solid #eab308',
                      padding: '10px 14px',
                      borderRadius: '0 8px 8px 0',
                      fontSize: '0.88rem',
                      color: '#fef08a'
                    }}>
                      <strong>💡 名师点拨：</strong>{currentVariant.hint}
                    </div>
                  )}
                </div>
              )}

              {/* 学生作答区 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  ✍️ 请写出你的答案或推导结论（支持代数式、数值或步骤，CAS 自动验算等价性）：
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <textarea
                    value={studentInput}
                    onChange={(e) => setStudentInput(e.target.value)}
                    placeholder="在此输入你的解答或答案..."
                    rows={2}
                    style={{
                      flex: 1,
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '10px',
                      color: '#fff',
                      padding: '10px 14px',
                      fontSize: '0.95rem',
                      resize: 'none'
                    }}
                  />
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!studentInput.trim() || submitting}
                    style={{
                      background: studentInput.trim() && !submitting
                        ? (currentStep === -1 ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)')
                        : '#334155',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0 18px',
                      fontSize: '0.92rem',
                      fontWeight: 'bold',
                      cursor: studentInput.trim() && !submitting ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {submitting ? '验算中...' : (currentStep === -1 ? '验证基石' : '提交作答')}
                  </button>
                </div>
              </div>

              {/* 即时批改结果 */}
              {feedback && (
                <div style={{
                  background: feedback.is_correct ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: `1px solid ${feedback.is_correct ? '#10b981' : '#ef4444'}`,
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{feedback.is_correct ? '🎉' : '🤔'}</span>
                      <span style={{
                        fontWeight: 'bold',
                        color: feedback.is_correct ? '#34d399' : '#f87171',
                        fontSize: '0.98rem'
                      }}>
                        {feedback.is_correct
                          ? (currentStep === -1 ? '底层基石漏洞已打通！' : '回答完全正确！')
                          : '还差一点，再仔细推敲一下！'}
                      </span>
                      {feedback.cas_verified && (
                        <span style={{
                          fontSize: '0.74rem',
                          background: 'rgba(56, 189, 248, 0.2)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          padding: '1px 6px',
                          borderRadius: '4px'
                        }}>
                          🔬 CAS符号验算等价
                        </span>
                      )}
                    </div>
                    {feedback.score_earned > 0 && (
                      <span style={{
                        background: '#d97706',
                        color: '#fff',
                        fontSize: '0.78rem',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '20px'
                      }}>
                        +{feedback.score_earned} EXP 奖励
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#e2e8f0' }}>
                    {feedback.comment}
                  </p>
                  {feedback.detailed_step && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                      核对：{feedback.detailed_step}
                    </p>
                  )}
                  {feedback.is_correct && (
                    <button
                      onClick={handleNextStep}
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: '4px',
                        background: '#059669',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      {currentStep === -1
                        ? '🚀 地基已夯实！立即前往母题巩固 →'
                        : (currentStep === 0 ? '🚀 挑战下一关：避坑拔高题 →' : '🏆 通关大满贯！')}
                    </button>
                  )}
                </div>
              )}

              {/* 查看标准解析 */}
              {(showAnalysis || completedSteps[currentStep]) && currentVariant.analysis && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.88rem', color: '#60a5fa' }}>
                      📖 名师标准答案与分步解析
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#a7f3d0' }}>
                      参考答案：{currentVariant.answer}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: '#cbd5e1' }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {preprocessLatex(currentVariant.analysis)}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(15, 23, 42, 0.4)'
        }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {studentName} 专属认知图谱训练卡
          </span>
          <button
            onClick={onClose}
            style={{
              background: '#334155',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 16px',
              fontSize: '0.88rem',
              cursor: 'pointer'
            }}
          >
            完成通关
          </button>
        </div>
      </div>
    </div>
  );
}
