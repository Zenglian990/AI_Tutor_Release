import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default function ExamRoomModal({
  isOpen,
  onClose,
  paper,
  answers: initialAnswersProp,
  onAnswerChange,
  onSubmitExam,
  onSubmit,
  onOpenScratchpad,
  durationMinutes: propDurationMinutes
}) {
  const [answers, setAnswers] = useState(initialAnswersProp || {});
  const [markedQuestions, setMarkedQuestions] = useState({}); // { [qId]: true }
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(() => (Number(paper?.duration || propDurationMinutes) || 90) * 60);
  const [isTimeWarning, setIsTimeWarning] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const timerRef = useRef(null);
  const hasTimerStartedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const questions = paper?.questions || [];

  const parseGradeNumber = (g) => {
    if (!g) return 7;
    if (typeof g === 'number') return g;
    const s = String(g).trim();
    const startDigit = s.match(/^(\d+)/);
    if (startDigit) return parseInt(startDigit[1], 10);
    if (s.includes('高一') || s.includes('高1') || s.includes('高中一年级')) return 10;
    if (s.includes('高二') || s.includes('高2') || s.includes('高中二年级')) return 11;
    if (s.includes('高三') || s.includes('高3') || s.includes('高中三年级')) return 12;
    if (s.includes('七年级') || s.includes('初一') || s.includes('初中一年级')) return 7;
    if (s.includes('八年级') || s.includes('初二') || s.includes('初中二年级')) return 8;
    if (s.includes('九年级') || s.includes('初三') || s.includes('初中三年级')) return 9;
    const cnNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const cnMatch = s.match(/([一二三四五六七八九])年级/);
    if (cnMatch) {
      const idx = cnNums.indexOf(cnMatch[1]);
      if (idx !== -1) return idx;
    }
    const anyDigit = s.match(/(\d+)/);
    if (anyDigit) return parseInt(anyDigit[1], 10);
    return 7;
  };

  const getGradeDefaultDuration = (gradeStr) => {
    const raw = parseGradeNumber(gradeStr);
    if (raw >= 1 && raw <= 3) return 40;
    if (raw >= 4 && raw <= 6) return 60;
    if (raw >= 7 && raw <= 9) return 90;
    if (raw >= 10 && raw <= 12) return 120;
    return 90;
  };

  const durationMinutes = Number(paper?.duration) > 0
    ? Number(paper.duration)
    : (Number(propDurationMinutes) > 0 ? Number(propDurationMinutes) : getGradeDefaultDuration(paper?.grade));

  // Initialize timer and answers ONLY when opening a paper (绝不依赖 initialAnswersProp 导致每答题就重置第1题和倒计时)
  useEffect(() => {
    if (isOpen && paper) {
      const initialSeconds = Math.max(60, durationMinutes * 60);
      hasTimerStartedRef.current = false;
      setTimeLeft(initialSeconds);
      setAnswers(initialAnswersProp && Object.keys(initialAnswersProp).length > 0 ? { ...initialAnswersProp } : {});
      setMarkedQuestions({});
      setCurrentIdx(0);
      setIsTimeWarning(false);
      setShowSubmitConfirm(false);

      if (timerRef.current) clearInterval(timerRef.current);
      hasTimerStartedRef.current = true;
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          if (prev <= 15 * 60) {
            setIsTimeWarning(true);
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      hasTimerStartedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, paper, durationMinutes]);

  const handleFinalSubmit = useCallback(() => {
    setShowSubmitConfirm(false);
    hasTimerStartedRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    const submitCallback = onSubmitExam || onSubmit;
    if (submitCallback) {
      submitCallback({ ...answersRef.current });
    }
  }, [onSubmitExam, onSubmit]);

  // 仅当倒计时真实运行至 0 时触发自动交卷（根治首帧 timeLeft===0 秒交白卷）
  useEffect(() => {
    if (isOpen && paper && hasTimerStartedRef.current && timeLeft === 0) {
      handleFinalSubmit();
    }
  }, [timeLeft, isOpen, paper, handleFinalSubmit]);

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleAnswerChange = (qId, val) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
    if (onAnswerChange) onAnswerChange(qId, val);
  };

  const toggleMarkQuestion = (qId) => {
    setMarkedQuestions(prev => ({ ...prev, [qId]: !prev[qId] }));
  };

  const answeredCount = Object.keys(answers).filter(k => String(answers[k]).trim() !== '').length;
  const unansweredCount = questions.length - answeredCount;

  if (!isOpen || !paper) return null;

  const sanitizeBrokenLatex = (raw) => String(raw || '')
    .replace(/\x08(?=[a-zA-Z])/g, '\\b')
    .replace(/\x0c(?=[a-zA-Z])/g, '\\f')
    .replace(/\x09(?=(?:text|tan|times|theta|triangle|to|tau|top)\b)/g, '\\t')
    .replace(/\r(?=(?:right|rho|rightarrow|rangle|rfloor|rceil)\b)/g, '\\r');

  const currentQ = questions[currentIdx] || questions[0];

  return (
    <div className="exam-room-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#0f172a', zIndex: 1300, display: 'flex', flexDirection: 'column',
      color: '#f8fafc', overflow: 'hidden', maxWidth: '100vw', boxSizing: 'border-box'
    }}>
      <style>{`
        @media (max-width: 768px) {
          .exam-room-topbar { padding: 10px 12px !important; gap: 8px !important; }
          .exam-room-body { flex-direction: column !important; }
          .exam-room-question-pane { padding: 14px 12px !important; }
          .exam-room-question-card { padding: 16px 14px !important; }
          .exam-room-sheet {
            width: 100% !important;
            max-height: 185px !important;
            border-left: none !important;
            border-top: 1px solid #334155 !important;
            padding: 10px 12px !important;
          }
          .exam-room-sheet-grid {
            grid-template-columns: repeat(6, 1fr) !important;
          }
        }
      `}</style>
      {/* Top Exam Navigation Bar */}
      <div className="exam-room-topbar" style={{
        background: '#1e293b', borderBottom: '1px solid #334155',
        padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '12px', boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{
            background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff',
            padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold'
          }}>
            {(() => {
              const raw = parseGradeNumber(paper?.grade);
              if (raw <= 6) return '🏫 小学全真模拟考场';
              if (raw >= 10) return '🎯 新高考全真模考封闭考场';
              return '🏛️ 中考全真模考封闭考场';
            })()}
          </span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>
              {paper.title || `${paper.region || '全国名校'} 全真模拟试卷`}
            </h2>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
              满分: {paper.totalScore || 150}分 · 考试时长: {durationMinutes}分钟 · 题量: {questions.length}道
            </div>
          </div>
        </div>

        {/* Countdown Timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: isTimeWarning ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.15)',
            border: isTimeWarning ? '1px solid #ef4444' : '1px solid #3b82f6',
            padding: '6px 14px', borderRadius: '30px'
          }}>
            <span style={{ fontSize: '1.1rem' }}>⏱️</span>
            <span style={{
              fontSize: '1.15rem', fontWeight: 'bold', fontFamily: 'monospace',
              color: isTimeWarning ? '#ef4444' : '#60a5fa'
            }}>
              {formatTime(timeLeft)}
            </span>
            {isTimeWarning && (
              <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 'bold' }}>
                (考试即将结束)
              </span>
            )}
          </div>

          <button
            onClick={() => onOpenScratchpad && onOpenScratchpad()}
            style={{
              background: '#334155', color: '#f8fafc', border: '1px solid #475569',
              padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
            title="打开草稿纸进行几何画图或竖式演算"
          >
            <span>📝 电子草稿纸</span>
          </button>

          <button
            onClick={() => setShowSubmitConfirm(true)}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff', border: 'none', padding: '8px 20px', borderRadius: '8px',
              fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            🏁 确认交卷 ({answeredCount}/{questions.length})
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'transparent', color: '#94a3b8', border: 'none',
              fontSize: '1.3rem', cursor: 'pointer', padding: '0 6px'
            }}
            title="退出考场"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Examination Area */}
      <div className="exam-room-body" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Question Panel */}
        <div className="exam-room-question-pane" style={{ flex: 1, overflowY: 'auto', padding: '30px 40px', background: '#0b1120', minWidth: 0 }}>
          {currentQ ? (
            <div className="exam-room-question-card" style={{
              maxWidth: '840px', margin: '0 auto', background: '#1e293b', borderRadius: '16px',
              padding: '28px 32px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              boxSizing: 'border-box'
            }}>
              {/* Question Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    background: '#3b82f6', color: '#ffffff', padding: '3px 10px',
                    borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold'
                  }}>
                    第 {currentIdx + 1} 题
                  </span>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    {(() => {
                      const isMultiLabel = currentQ.type === 'multi_choice' || (currentQ.type === 'choice' && currentQ.answer && /^[A-D]{2,}$/i.test(String(currentQ.answer).trim()));
                      const typeLabel = isMultiLabel
                        ? '多项选择题（漏选得一半）'
                        : currentQ.type === 'choice'
                          ? '单项选择题'
                          : currentQ.type === 'judgment'
                            ? '判断题'
                            : currentQ.type === 'blank'
                              ? '填空题'
                              : '解答证明题';
                      const qScore = Number(String(currentQ.score ?? currentQ.points ?? '').replace(/[^\d.]/g, '')) || 10;
                      return `[${typeLabel}] · 满分 ${qScore} 分`;
                    })()}
                  </span>
                </div>
                <button
                  onClick={() => toggleMarkQuestion(currentQ.id)}
                  style={{
                    background: markedQuestions[currentQ.id] ? '#f59e0b' : 'transparent',
                    color: markedQuestions[currentQ.id] ? '#000' : '#f59e0b',
                    border: '1px solid #f59e0b', padding: '4px 12px', borderRadius: '6px',
                    fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500
                  }}
                >
                  {markedQuestions[currentQ.id] ? '★ 已标记待复查' : '☆ 标记待复查'}
                </button>
              </div>

              {/* Question Body (支持 LaTeX 数学公式渲染) */}
              <div style={{ fontSize: '1.05rem', lineHeight: '1.8', color: '#f1f5f9', marginBottom: '24px', overflowX: 'auto' }}>
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}>
                  {sanitizeBrokenLatex(currentQ.question)}
                </ReactMarkdown>
              </div>

              {/* Options or Answer Input */}
              {(currentQ.type === 'choice' || currentQ.type === 'multi_choice') && currentQ.options && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                  {currentQ.options.map((opt, oIdx) => {
                    const optLetter = opt.trim().charAt(0).toUpperCase();
                    const isMulti = currentQ.type === 'multi_choice' || (currentQ.answer && /^[A-D]{2,}$/i.test(String(currentQ.answer).trim()));
                    const curStr = String(answers[currentQ.id] || '').toUpperCase();
                    const isSelected = isMulti ? curStr.includes(optLetter) : curStr === optLetter;
                    const pickOption = () => {
                      if (!isMulti) {
                        handleAnswerChange(currentQ.id, optLetter);
                      } else {
                        const set = new Set(curStr.match(/[A-D]/g) || []);
                        if (set.has(optLetter)) set.delete(optLetter);
                        else set.add(optLetter);
                        handleAnswerChange(currentQ.id, Array.from(set).sort().join(''));
                      }
                    };
                    return (
                      <div
                        key={oIdx}
                        onClick={pickOption}
                        style={{
                          padding: '12px 18px', borderRadius: '10px',
                          border: isSelected ? '2px solid #3b82f6' : '1px solid #475569',
                          background: isSelected ? 'rgba(59, 130, 246, 0.15)' : '#0f172a',
                          color: isSelected ? '#60a5fa' : '#e2e8f0',
                          cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '12px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{
                          width: '28px', height: '28px', borderRadius: isMulti ? '6px' : '50%',
                          background: isSelected ? '#3b82f6' : '#334155',
                          color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0
                        }}>
                          {optLetter}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
                            components={{ p: ({ children }) => <span style={{ margin: 0 }}>{children}</span> }}
                          >
                            {sanitizeBrokenLatex(opt)}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {currentQ.type === 'blank' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>
                    填空作答：
                  </label>
                  <input
                    type="text"
                    value={answers[currentQ.id] || ''}
                    onChange={e => handleAnswerChange(currentQ.id, e.target.value)}
                    placeholder="请输入你的最终化简结果/数值..."
                    style={{
                      width: '100%', padding: '12px 16px', background: '#0f172a',
                      border: '1px solid #475569', borderRadius: '8px', color: '#ffffff',
                      fontSize: '1rem', outline: 'none'
                    }}
                  />
                </div>
              )}

              {currentQ.type === 'judgment' && (
                <div style={{ display: 'flex', gap: '14px', marginBottom: '20px' }}>
                  {[
                    { value: '正确', label: '✓ 正确（对）', activeColor: '#10b981' },
                    { value: '错误', label: '✕ 错误（错）', activeColor: '#ef4444' }
                  ].map((opt) => {
                    const isSelected = answers[currentQ.id] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleAnswerChange(currentQ.id, opt.value)}
                        style={{
                          flex: 1,
                          padding: '14px 18px',
                          borderRadius: '10px',
                          border: isSelected ? `2px solid ${opt.activeColor}` : '1px solid #475569',
                          background: isSelected ? `${opt.activeColor}22` : '#0f172a',
                          color: isSelected ? '#ffffff' : '#cbd5e1',
                          fontSize: '1rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQ.type !== 'choice' && currentQ.type !== 'multi_choice' && currentQ.type !== 'judgment' && currentQ.type !== 'blank' && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      分步推导演算作答（采分点批阅依据）：
                    </label>
                    <button
                      onClick={() => onOpenScratchpad && onOpenScratchpad()}
                      style={{
                        background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.8rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <span>📝 在草稿纸演算画图</span>
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={answers[currentQ.id] || ''}
                    onChange={e => handleAnswerChange(currentQ.id, e.target.value)}
                    placeholder="请书写规范的解题推导步骤，阅卷将按步骤采分点给分（如：解、设未知数/定理依据、核心推导、结论）..."
                    style={{
                      width: '100%', padding: '12px 16px', background: '#0f172a',
                      border: '1px solid #475569', borderRadius: '8px', color: '#ffffff',
                      fontSize: '0.95rem', lineHeight: '1.6', outline: 'none', resize: 'vertical'
                    }}
                  />
                </div>
              )}

              {/* Bottom Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #334155' }}>
                <button
                  disabled={currentIdx <= 0}
                  onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                  style={{
                    padding: '8px 18px', borderRadius: '8px', border: '1px solid #475569',
                    background: currentIdx <= 0 ? '#1e293b' : '#334155',
                    color: currentIdx <= 0 ? '#64748b' : '#f8fafc',
                    cursor: currentIdx <= 0 ? 'not-allowed' : 'pointer', fontSize: '0.85rem'
                  }}
                >
                  ← 上一题
                </button>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  {currentIdx + 1} / {questions.length}
                </span>
                <button
                  disabled={currentIdx >= questions.length - 1}
                  onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
                  style={{
                    padding: '8px 18px', borderRadius: '8px', border: '1px solid #475569',
                    background: currentIdx >= questions.length - 1 ? '#1e293b' : '#334155',
                    color: currentIdx >= questions.length - 1 ? '#64748b' : '#f8fafc',
                    cursor: currentIdx >= questions.length - 1 ? 'not-allowed' : 'pointer', fontSize: '0.85rem'
                  }}
                >
                  下一题 →
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right Floating Answer Sheet Navigation (答题卡) */}
        <div className="exam-room-sheet" style={{
          width: '260px', background: '#1e293b', borderLeft: '1px solid #334155',
          display: 'flex', flexDirection: 'column', padding: '16px', flexShrink: 0, boxSizing: 'border-box'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '12px', color: '#f8fafc' }}>
            📋 模考全真答题卡
          </div>

          <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '14px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10b981' }} /> 已做
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#475569' }} /> 未做
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#f59e0b' }} /> 标记
            </span>
          </div>

          {/* Grid of question buttons */}
          <div className="exam-room-sheet-grid" style={{
            flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px', alignContent: 'start'
          }}>
            {questions.map((q, idx) => {
              const isAnswered = String(answers[q.id] || '').trim() !== '';
              const isMarked = markedQuestions[q.id];
              const isCurrent = idx === currentIdx;

              let bgColor = '#334155';
              let textColor = '#cbd5e1';

              if (isAnswered) {
                bgColor = '#059669';
                textColor = '#ffffff';
              }
              if (isMarked) {
                bgColor = '#d97706';
                textColor = '#ffffff';
              }

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIdx(idx)}
                  style={{
                    height: '42px', borderRadius: '8px', border: isCurrent ? '2px solid #38bdf8' : 'none',
                    background: bgColor, color: textColor, fontWeight: 'bold',
                    fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.1s ease',
                    boxShadow: isCurrent ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none'
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Bottom stats & Submit */}
          <div style={{ borderTop: '1px solid #334155', paddingTop: '12px', marginTop: '12px' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '10px' }}>
              已作答: <span style={{ color: '#10b981', fontWeight: 'bold' }}>{answeredCount}</span> / {questions.length} 题
            </div>
            <button
              onClick={() => setShowSubmitConfirm(true)}
              style={{
                width: '100%', background: '#10b981', color: '#ffffff',
                border: 'none', padding: '10px 0', borderRadius: '8px', fontWeight: 'bold',
                fontSize: '0.88rem', cursor: 'pointer'
              }}
            >
              提前交卷
            </button>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)', zIndex: 1400, display: 'flex',
          justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #475569', borderRadius: '16px',
            padding: '24px 28px', maxWidth: '420px', width: '90%', textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🏁</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#f8fafc' }}>
              确定交卷并结束模考？
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: '#94a3b8', lineHeight: '1.5' }}>
              当前考试剩余时间：<b style={{ color: '#60a5fa' }}>{formatTime(timeLeft)}</b><br />
              共 {questions.length} 道题，已完成 <b style={{ color: '#10b981' }}>{answeredCount}</b> 道，
              还有 <b style={{ color: unansweredCount > 0 ? '#f87171' : '#10b981' }}>{unansweredCount}</b> 道未完成。
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: '8px', border: '1px solid #475569',
                  background: '#334155', color: '#f8fafc', cursor: 'pointer', fontWeight: 500
                }}
              >
                继续检查答卷
              </button>
              <button
                onClick={handleFinalSubmit}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: '8px', border: 'none',
                  background: '#10b981', color: '#ffffff', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                立即交卷评分
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
