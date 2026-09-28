import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { authFetch, getApiUrl } from '../store/useStore';
import { preprocessLatex } from '../utils/math';
import { playSuccessChime } from '../utils/sensoryFeedback';

/**
 * VariantPracticeModal
 * 对标作业帮/小猿搜题的“举一反三·变式通关流”
 * 当学生解答或复盘一道题时，系统生成【同类母题巩固】与【避坑拔高变式】，
 * 学生即做即批，形成“讲-练-测”黄金教学闭环。
 */
export default function VariantPracticeModal({
  isOpen,
  onClose,
  originalQuestion = '',
  originalAnswer = '',
  grade = '7_up',
  subject = '数学',
  studentName = '曾练',
  onRewardExp
}) {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0); // 0: variant 1, 1: variant 2
  const [showHint, setShowHint] = useState(false);
  const [studentInput, setStudentInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // result from check-variant-answer
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({});

  // 1. 获取变式题
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
  }, [isOpen, originalQuestion, originalAnswer, grade, subject]);

  const currentVariant = data?.variants?.[currentStep] || null;

  // 2. 提交作答并即时批改
  const handleSubmitAnswer = async () => {
    if (!studentInput.trim() || !currentVariant || submitting) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/mistakes/check-variant-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentVariant.question,
          standard_answer: currentVariant.answer,
          student_answer: studentInput.trim(),
          grade
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
    if (data?.variants && currentStep < data.variants.length - 1) {
      setCurrentStep(s => s + 1);
      setStudentInput('');
      setFeedback(null);
      setShowHint(false);
      setShowAnalysis(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.78)',
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
        maxWidth: '680px',
        maxHeight: '90vh',
        borderRadius: '20px',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(59, 130, 246, 0.15)',
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
          background: 'linear-gradient(90deg, rgba(30, 58, 138, 0.5) 0%, rgba(30, 41, 59, 0.8) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🎯</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#60a5fa' }}>
                举一反三 · 变式通关
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                对标中考题眼模型 · 巩固母题 · 避开高频陷阱
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
              <p style={{ margin: 0, fontSize: '0.95rem' }}>AI 特级教师正在剖析本题题眼，为你量身定制变式练习...</p>
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
                gap: '8px',
                fontSize: '0.88rem'
              }}>
                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>📌 考点题眼：</span>
                <span style={{ color: '#e2e8f0' }}>{data.core_knowledge}</span>
              </div>

              {/* 闯关进度条 */}
              <div style={{ display: 'flex', gap: '8px' }}>
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
                        padding: '10px',
                        borderRadius: '10px',
                        border: isActive ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                        color: isActive ? '#38bdf8' : '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontWeight: '600',
                        fontSize: '0.88rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      <span>{isDone ? '✅' : (idx === 0 ? '🌱' : '🔥')}</span>
                      <span>第 {idx + 1} 关：{v.tag}</span>
                    </button>
                  );
                })}
              </div>

              {/* 题目展示卡片 */}
              {currentVariant && (
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
                  ✍️ 请写出你的答案或推导结论（支持输入文字、步骤或选项）：
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
                      background: studentInput.trim() && !submitting ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#334155',
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
                    {submitting ? '批改中...' : '提交作答'}
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
                        {feedback.is_correct ? '回答完全正确！' : '还差一点，再仔细推敲一下！'}
                      </span>
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
                  {feedback.is_correct && currentStep < (data.variants.length - 1) && (
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
                      🚀 挑战下一关：避坑拔高题 →
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
            {studentName} 专属思维训练卡
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
