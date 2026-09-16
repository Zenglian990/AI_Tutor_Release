import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { preprocessLatex } from '../utils/math';
import { formatGrade } from '../store/useStore';

/**
 * Safe LaTeX & Markdown renderer for A4 Paper
 */
function A4MathContent({ content }) {
  if (!content) return null;
  return (
    <div className="a4-math-content" style={{ lineHeight: '1.7', wordBreak: 'break-word', color: '#111827' }}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <span style={{ display: 'inline' }}>{children}</span>
        }}
      >
        {preprocessLatex(String(content))}
      </ReactMarkdown>
    </div>
  );
}

/**
 * A4PrintModal
 * 高清 A4 纸质周清微测试卷与空白重做卷排版预览组件
 * 核心特性：
 * 1. 【空白重测模式】：隐藏答案与解析，留出标准学生手写答题线与作图草稿区，防止眼高手低
 * 2. 【详析对照模式】：名师标准推导、题眼穿透、常见错因避坑指南，供家长教师秒级核对
 * 3. 【错题靶向筛选】：支持全卷打印与仅打印失分错题（薄弱点集中重练）
 * 4. 【标准考卷排版】：密封线、考生信息栏、赋分明细、公式级 LaTeX 排版、防反光纯白打印优化
 */
export default function A4PrintModal({
  isOpen,
  onClose,
  studentName = '曾练',
  grade = '7_up',
  subject = '数学',
  questions = [],
  initialMode = 'blank_student',
  initialFilter = 'all'
}) {
  const [printMode, setPrintMode] = useState(initialMode); // 'blank_student' | 'with_answers'
  const [filterType, setFilterType] = useState(initialFilter); // 'all' | 'wrong_only'
  const [twoColumn, setTwoColumn] = useState(false); // standard single column or dual column exam format

  if (!isOpen) return null;

  const defaultQuestions = [
    {
      id: 1,
      title: '一元一次方程与几何辅助线综合演练',
      body: '如图，在 △ABC 中，∠B = 40°，∠C = 60°，AD 平分 ∠BAC 交 BC 于点 D。过点 D 作 DE ∥ AB 交 AC 于点 E。\n(1) 求 ∠ADE 的度数；\n(2) 证明 △ADE 是等腰三角形。',
      score: 10,
      standardAnswer: '【解】(1) ∵ ∠B = 40°，∠C = 60°，\n∴ 在 △ABC 中，∠BAC = 180° - 40° - 60° = 80°。\n∵ AD 平分 ∠BAC，\n∴ ∠BAD = ∠CAD = 40°。\n∵ DE ∥ AB，\n∴ ∠ADE = ∠BAD = 40°。\n\n(2) 证明：\n由(1)知 ∠ADE = 40°，且 ∠CAD = 40°，\n∴ ∠ADE = ∠DAE，\n∴ AE = DE，即 △ADE 是等腰三角形。',
      keyInsight: '平行线内错角相等 + 角平分线性质，是几何证明等腰三角形最经典的两大联动抓手。',
      status: 'wrong'
    },
    {
      id: 2,
      title: '代数式化简求值与因式分解',
      body: '已知 (x + y)^2 = 25，(x - y)^2 = 9，求代数式 x^2 + y^2 以及 xy 的具体数值。（请在草稿纸上规范书写提取与代入步骤）',
      score: 10,
      standardAnswer: '【解】由完全平方公式展开：\n(x + y)^2 = x^2 + 2xy + y^2 = 25 ①\n(x - y)^2 = x^2 - 2xy + y^2 = 9  ②\n① + ② 得：2(x^2 + y^2) = 34 ⇒ x^2 + y^2 = 17。\n① - ② 得：4xy = 16 ⇒ xy = 4。',
      keyInsight: '方程组思想整体相加相减消元，不需要具体求出 x 和 y 的具体值。',
      status: 'correct'
    },
    {
      id: 3,
      title: '压轴动点与面积变式挑战',
      body: '某动点 P 从点 A 出发沿射线 AB 运动，速度为每秒 2 个单位。若 AB = 10，当点 P 运动 t 秒时，△PAC 的面积恰好等于 △ABC 面积的一半，求运动时间 t 的所有可能值。',
      score: 12,
      standardAnswer: '【解】点 P 在射线 AB 上运动，AP = 2t。\n因为 △PAC 与 △ABC 具有相同的底边方向且点 C 到 AB 所在直线的垂线高相同，\n所以 S_{△PAC} = \\frac{1}{2} S_{△ABC} 等价于 AP = \\frac{1}{2} AB。\n∵ AB = 10，∴ AP = 5。\n即 2t = 5 ⇒ t = 2.5 秒。',
      keyInsight: '同高模型面积比等于底边比；注意射线运动是否存在分类讨论（点P越过B点后的面积关系）。',
      status: 'wrong'
    }
  ];

  const rawList = questions.length > 0 ? questions : defaultQuestions;

  // Normalized question objects
  const processedQuestions = rawList.map((q, idx) => ({
    id: q.id || idx + 1,
    questionNumber: q.questionNumber || (idx + 1),
    title: q.title || `第 ${q.questionNumber || (idx + 1)} 题 (${q.type || '试题'})`,
    body: q.body || q.questionSnippet || q.originalText || q.content || q.text || `题目 #${idx + 1}`,
    score: q.score || q.maxScore || 10,
    standardAnswer: q.standardAnswer || q.standard_answer || q.answer || '',
    keyInsight: q.keyInsight || q.analysis || q.explanation || '',
    mistakeReason: q.mistakeReason || '',
    studentAnswer: q.studentAnswer || '',
    status: q.status || 'unknown'
  }));

  const wrongCount = processedQuestions.filter(q => q.status === 'wrong' || q.status === 'partial').length;

  const displayQuestions = useMemo(() => {
    if (filterType === 'wrong_only' && wrongCount > 0) {
      return processedQuestions.filter(q => q.status === 'wrong' || q.status === 'partial');
    }
    return processedQuestions;
  }, [processedQuestions, filterType, wrongCount]);

  const totalScore = displayQuestions.reduce((acc, q) => acc + (q.score || 10), 0);
  const suggestedTime = Math.max(15, Math.min(60, displayQuestions.length * 8));

  const handlePrint = () => {
    window.print();
  };

  const gradeDisplay = formatGrade(grade) || grade || '初一上册';
  const currentDateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

  return (
    <div className="a4-print-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      {/* Dynamic Print Stylesheet for true A4 physical output */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 12mm 15mm;
          }
          body * {
            visibility: hidden !important;
          }
          .a4-print-overlay, .a4-print-overlay * {
            visibility: visible !important;
          }
          .a4-print-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: #fff !important;
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: 999999 !important;
          }
          .a4-print-dialog {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            box-shadow: none !important;
            border: none !important;
            background: #fff !important;
            display: block !important;
            overflow: visible !important;
          }
          .a4-preview-scroll-area {
            overflow: visible !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .printable-a4-sheet {
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            color: #000 !important;
            min-height: auto !important;
          }
          .a4-no-print {
            display: none !important;
          }
          .a4-question-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="a4-print-dialog" style={{
        background: '#fff',
        width: '95%',
        maxWidth: '960px',
        height: '94vh',
        borderRadius: '18px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Top Control Bar (Hidden during printing) */}
        <div className="a4-no-print" style={{
          padding: '12px 24px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.3rem' }}>📑</span>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.12rem', fontWeight: 700 }}>
                纸屏融合：A4 靶向周清试卷排版
              </h3>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              保护孩子视力，脱离屏幕书写；做完后使用手机拍一张即可一键秒批
            </p>
          </div>

          {/* Mode & Filter Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Mode Selector */}
            <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
              <button
                onClick={() => setPrintMode('blank_student')}
                style={{
                  background: printMode === 'blank_student' ? '#2563eb' : 'transparent',
                  color: printMode === 'blank_student' ? '#fff' : '#475569',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                📝 空白重测卷 (学生真练)
              </button>
              <button
                onClick={() => setPrintMode('with_answers')}
                style={{
                  background: printMode === 'with_answers' ? '#059669' : 'transparent',
                  color: printMode === 'with_answers' ? '#fff' : '#475569',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                📖 答案详析卷 (家长核对)
              </button>
            </div>

            {/* Wrong Filter Selector */}
            {wrongCount > 0 && (
              <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
                <button
                  onClick={() => setFilterType('wrong_only')}
                  style={{
                    background: filterType === 'wrong_only' ? '#ef4444' : 'transparent',
                    color: filterType === 'wrong_only' ? '#fff' : '#475569',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  仅错题 ({wrongCount})
                </button>
                <button
                  onClick={() => setFilterType('all')}
                  style={{
                    background: filterType === 'all' ? '#475569' : 'transparent',
                    color: filterType === 'all' ? '#fff' : '#475569',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  全部 ({processedQuestions.length})
                </button>
              </div>
            )}

            {/* Column Layout Toggle */}
            <button
              onClick={() => setTwoColumn(!twoColumn)}
              title="切换单双栏排版"
              style={{
                background: twoColumn ? '#3b82f6' : '#fff',
                color: twoColumn ? '#fff' : '#475569',
                border: '1px solid #cbd5e1',
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {twoColumn ? '📰 双栏考卷' : '📋 单栏宽版'}
            </button>

            {/* Print Trigger */}
            <button
              onClick={handlePrint}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.9rem',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
              }}
            >
              🖨️ 打印 / 导出 PDF
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                color: '#475569',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem'
              }}
            >
              关闭
            </button>
          </div>
        </div>

        {/* Printable A4 Paper Preview Container */}
        <div className="a4-preview-scroll-area" style={{
          flex: 1,
          overflowY: 'auto',
          padding: '30px 20px',
          background: '#64748b',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <div className="printable-a4-sheet" style={{
            background: '#fff',
            width: '100%',
            maxWidth: '820px',
            minHeight: '1120px',
            padding: '45px 50px 60px 60px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
            color: '#000',
            fontFamily: '"Songti SC", "SimSun", "STSong", "FangSong", serif',
            position: 'relative'
          }}>
            {/* Standard Exam Sealing Line on Left Margin */}
            <div style={{
              position: 'absolute',
              left: '16px',
              top: '50px',
              bottom: '50px',
              width: '28px',
              borderRight: '1px dashed #94a3b8',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.78rem',
              color: '#64748b',
              letterSpacing: '8px',
              writingMode: 'vertical-rl',
              userSelect: 'none'
            }}>
              密 封 线 内 严 禁 答 题
            </div>

            {/* Main Sheet Header */}
            <div style={{ textAlign: 'center', borderBottom: '2.5px solid #000', paddingBottom: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.88rem', color: '#4b5563', letterSpacing: '2px', marginBottom: '4px' }}>
                全国中小学名师诊断 · 纸屏融合实战微测系统
              </div>
              <h2 style={{ fontSize: '1.55rem', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '1.5px', color: '#000' }}>
                【曾练专属私教】{subject}靶向突破周清微测试卷
              </h2>
              <div style={{ fontSize: '0.92rem', color: '#374151', fontWeight: 600, marginBottom: '10px' }}>
                （{printMode === 'blank_student' ? '📝 学生独立闭卷实操版 · 答题留白' : '📖 名师详析与考点穿透版 · 家长核对'}）
              </div>

              {/* Student Metadata Table */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.92rem',
                color: '#1f2937',
                borderTop: '1px solid #e5e7eb',
                paddingTop: '8px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <span><strong>学科：</strong>{subject}</span>
                <span><strong>年级：</strong>{gradeDisplay}</span>
                <span><strong>考生姓名：</strong>{studentName}</span>
                <span><strong>试卷总分：</strong>{totalScore} 分</span>
                <span><strong>建议用时：</strong>{suggestedTime} 分钟</span>
                <span><strong>测试日期：</strong>{currentDateStr}</span>
              </div>
            </div>

            {/* Scoreboard Block (Traditional Chinese Exam Format) */}
            <div style={{
              display: 'flex',
              border: '1px solid #374151',
              marginBottom: '20px',
              fontSize: '0.85rem'
            }}>
              <div style={{ width: '80px', borderRight: '1px solid #374151', textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #374151', padding: '4px', background: '#f3f4f6', fontWeight: 600 }}>题号</div>
                <div style={{ padding: '6px', fontWeight: 600 }}>得分</div>
              </div>
              <div style={{ flex: 1, display: 'flex' }}>
                {displayQuestions.map((_, i) => (
                  <div key={i} style={{ flex: 1, borderRight: i < displayQuestions.length - 1 ? '1px solid #374151' : 'none', textAlign: 'center' }}>
                    <div style={{ borderBottom: '1px solid #374151', padding: '4px', background: '#f9fafb' }}>{i + 1}</div>
                    <div style={{ padding: '6px', color: '#9ca3af' }}>&nbsp;</div>
                  </div>
                ))}
              </div>
              <div style={{ width: '90px', borderLeft: '1px solid #374151', textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #374151', padding: '4px', background: '#f3f4f6', fontWeight: 600 }}>总评 / 评卷人</div>
                <div style={{ padding: '6px', color: '#9ca3af' }}>&nbsp;</div>
              </div>
            </div>

            {/* Exam Guidelines Notice */}
            <div style={{
              fontSize: '0.82rem',
              color: '#4b5563',
              marginBottom: '22px',
              lineHeight: '1.6',
              background: '#f9fafb',
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #e5e7eb'
            }}>
              <strong>考生答卷须知：</strong>
              1. 答卷前请务必使用 0.5mm 黑色签字笔规范书写姓名；
              2. 证明题与计算题须在指定答题留白区域内完整写出推导与依据步骤；
              3. 本试卷为真实考试排版，作答完毕后使用本系统【📸 拍照批改】对准纸面，AI 私教将进行智能秒级判卷与错因分析。
            </div>

            {/* Questions Body */}
            <div style={{
              display: twoColumn ? 'grid' : 'flex',
              gridTemplateColumns: twoColumn ? '1fr 1fr' : 'none',
              flexDirection: twoColumn ? 'row' : 'column',
              gap: twoColumn ? '24px' : '26px'
            }}>
              {displayQuestions.map((q, idx) => (
                <div key={q.id} className="a4-question-card" style={{
                  paddingBottom: '16px',
                  borderBottom: idx < displayQuestions.length - 1 ? '1px dashed #d1d5db' : 'none'
                }}>
                  {/* Question Stem Header */}
                  <div style={{
                    fontSize: '1.02rem',
                    fontWeight: 700,
                    color: '#000',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '6px'
                  }}>
                    <span>{idx + 1}.</span>
                    <span>({q.score}分)</span>
                    <span>{q.title}</span>
                    {q.status === 'wrong' && (
                      <span className="a4-no-print" style={{
                        fontSize: '0.75rem',
                        background: '#fee2e2',
                        color: '#dc2626',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 600
                      }}>
                        本次待订正
                      </span>
                    )}
                  </div>

                  {/* Question Body Text with LaTeX Formula */}
                  <div style={{ fontSize: '0.98rem', lineHeight: '1.7', marginBottom: '14px', color: '#111827' }}>
                    <A4MathContent content={q.body} />
                  </div>

                  {/* Blank Student Writing Space (Student Mode) */}
                  {printMode === 'blank_student' ? (
                    <div style={{
                      minHeight: twoColumn ? '140px' : '170px',
                      border: '1px dashed #9ca3af',
                      borderRadius: '6px',
                      padding: '12px',
                      position: 'relative',
                      background: 'repeating-linear-gradient(transparent, transparent 27px, #f3f4f6 28px)'
                    }}>
                      <span style={{
                        position: 'absolute',
                        right: '10px',
                        bottom: '8px',
                        fontSize: '0.78rem',
                        color: '#9ca3af',
                        userSelect: 'none'
                      }}>
                        【解题与证明演算区域（规范书写）】
                      </span>
                    </div>
                  ) : (
                    /* Answer Key & Insight (Teacher/Parent Mode) */
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '12px 16px'
                    }}>
                      {/* Standard Answer */}
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#059669', marginBottom: '4px' }}>
                          🎯 名师标准答案与推导步骤：
                        </div>
                        <div style={{ fontSize: '0.92rem', color: '#1f2937', lineHeight: '1.6' }}>
                          <A4MathContent content={q.standardAnswer || '（请参见教材标准参考答案）'} />
                        </div>
                      </div>

                      {/* Key Insight */}
                      {q.keyInsight && (
                        <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                          <div style={{ fontSize: '0.83rem', fontWeight: 700, color: '#2563eb', marginBottom: '2px' }}>
                            💡 核心题眼与破题心法：
                          </div>
                          <div style={{ fontSize: '0.88rem', color: '#334155' }}>
                            <A4MathContent content={q.keyInsight} />
                          </div>
                        </div>
                      )}

                      {/* Mistake Pitfall Warning */}
                      {q.mistakeReason && (
                        <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                          <div style={{ fontSize: '0.83rem', fontWeight: 700, color: '#dc2626', marginBottom: '2px' }}>
                            ⚠️ 易错点与避坑预警：
                          </div>
                          <div style={{ fontSize: '0.88rem', color: '#991b1b' }}>
                            <A4MathContent content={q.mistakeReason} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Sheet Footer */}
            <div style={{
              position: 'absolute',
              bottom: '22px',
              left: '60px',
              right: '50px',
              borderTop: '1px solid #e5e7eb',
              paddingTop: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.78rem',
              color: '#6b7280'
            }}>
              <span>曾练专属私教 · 知识图谱靶向实体卷</span>
              <span>打印日期：{currentDateStr}</span>
              <span>第 1 页 (共 1 页)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
