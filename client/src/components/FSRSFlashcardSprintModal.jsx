import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { authFetch } from '../store/useStore';
import { preprocessLatex } from '../utils/math';

/**
 * FSRSFlashcardSprintModal
 * 3分钟 FSRS 沉浸式闪卡冲刺消灭错题流 (对标 Anki / Quizlet / 记忆面包)
 * 
 * 核心特性：
 * 1. 极简卡片翻转交互：正面题目·考点盲盒，背面标准解法·考点题眼·避坑口诀
 * 2. 严格遵循 FSRS-v4.5 4级认知负荷评级：
 *    - 1: 忘记 (Again) -> 立即重排
 *    - 2: 困难 (Hard) -> 缩短复习间隔
 *    - 3: 掌握 (Good) -> 巩固记忆曲线
 *    - 4: 熟练 (Easy) -> 跃升记忆稳定性 (Stability)
 * 3. 实时同步更新后端的 FSRS 记忆矩阵与下次艾宾浩斯复习时间
 */
export default function FSRSFlashcardSprintModal({
  isOpen,
  mistakes = [],
  onClose,
  onMistakeUpdated
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [isFinished, setIsFinished] = useState(false);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (isOpen) {
      const activeCards = (mistakes && mistakes.length > 0) ? [...mistakes] : [];
      setCards(activeCards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setIsFinished(false);
      setStats({ again: 0, hard: 0, good: 0, easy: 0 });
    }
  }, [isOpen, mistakes]);

  if (!isOpen) return null;

  const currentCard = cards[currentIndex];

  const handleRate = async (rating) => {
    if (!currentCard || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await authFetch('/api/mistakes/review-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mistake_id: currentCard.id,
          rating: rating // 1: Again, 2: Hard, 3: Good, 4: Easy
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onMistakeUpdated && onMistakeUpdated(currentCard.id, data);
      }
    } catch (e) {
      console.error('Failed to submit FSRS rating:', e);
    } finally {
      // Update statistics
      setStats(prev => {
        const key = rating === 1 ? 'again' : rating === 2 ? 'hard' : rating === 3 ? 'good' : 'easy';
        return { ...prev, [key]: prev[key] + 1 };
      });

      setIsSubmitting(false);
      setIsFlipped(false);

      if (currentIndex + 1 < cards.length) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setIsFinished(true);
      }
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '680px',
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: '#ffffff', padding: '16px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>⚡</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                FSRS 3分钟记忆闪卡冲刺
              </h3>
              <div style={{ fontSize: '0.8rem', color: '#c7d2fe', marginTop: '2px' }}>
                认知科学自由间隔重复 · 科学调度消除遗忘临界点
              </div>
            </div>
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

        {/* Content Area */}
        {cards.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎉</div>
            <h4 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '1.1rem' }}>
              当前没有待冲刺的错题！
            </h4>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              所有错题均已被 FSRS 调度在未来记忆复习周期中，你太棒了！
            </p>
            <button
              onClick={onClose}
              style={{
                marginTop: '20px', padding: '8px 24px', borderRadius: '10px',
                background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer'
              }}
            >
              返回错题本
            </button>
          </div>
        ) : isFinished ? (
          /* Finished Report */
          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>🏆</div>
            <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '1.35rem', fontWeight: 800 }}>
              本次闪卡冲刺全部通关！
            </h3>
            <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '0.92rem' }}>
              FSRS 记忆内核已重塑完成，下次艾宾浩斯复习节点已动态排期。
            </p>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
              maxWidth: '460px', margin: '0 auto 28px'
            }}>
              <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.3rem' }}>{stats.again}</div>
                <div style={{ color: '#991b1b', fontSize: '0.78rem' }}>忘记 (重学)</div>
              </div>
              <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '12px', border: '1px solid #fef3c7' }}>
                <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: '1.3rem' }}>{stats.hard}</div>
                <div style={{ color: '#92400e', fontSize: '0.78rem' }}>困难 (加练)</div>
              </div>
              <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '12px', border: '1px solid #d1fae5' }}>
                <div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.3rem' }}>{stats.good}</div>
                <div style={{ color: '#065f46', fontSize: '0.78rem' }}>掌握 (良好)</div>
              </div>
              <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '12px', border: '1px solid #dbeafe' }}>
                <div style={{ color: '#3b82f6', fontWeight: 800, fontSize: '1.3rem' }}>{stats.easy}</div>
                <div style={{ color: '#1e40af', fontSize: '0.78rem' }}>熟练 (轻松)</div>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                padding: '10px 32px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: '#fff', border: 'none', fontWeight: 700, fontSize: '1rem',
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
              }}
            >
              完成并收起闪卡
            </button>
          </div>
        ) : (
          /* Card View */
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Progress Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>
                卡片 {currentIndex + 1} / {cards.length}
              </span>
              <div style={{
                background: '#e2e8f0', width: '60%', height: '8px', borderRadius: '4px', overflow: 'hidden'
              }}>
                <div style={{
                  background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                  height: '100%',
                  width: `${((currentIndex + 1) / cards.length) * 100}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <span style={{
                fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5',
                background: '#e0e7ff', padding: '2px 8px', borderRadius: '6px'
              }}>
                {currentCard.subject || '错题'}
              </span>
            </div>

            {/* Flashcard Body */}
            <div
              onClick={() => setIsFlipped(prev => !prev)}
              style={{
                minHeight: '260px',
                background: isFlipped ? '#f8fafc' : '#ffffff',
                border: isFlipped ? '2px solid #818cf8' : '2px dashed #cbd5e1',
                borderRadius: '18px',
                padding: '24px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.25s ease',
                boxShadow: isFlipped ? '0 10px 25px -5px rgba(99, 102, 241, 0.15)' : 'none'
              }}
            >
              <div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'
                }}>
                  <span style={{
                    fontSize: '0.8rem', fontWeight: 800,
                    color: isFlipped ? '#4f46e5' : '#059669',
                    background: isFlipped ? '#e0e7ff' : '#dcfce7',
                    padding: '3px 10px', borderRadius: '12px'
                  }}>
                    {isFlipped ? '💡 背面：标准解析与题眼' : '❓ 正面：先在脑海中回忆解法'}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                    {isFlipped ? '点击翻回正面' : '点击翻转看答案 🔄'}
                  </span>
                </div>

                {/* Card Content */}
                {!isFlipped ? (
                  <div style={{ fontSize: '1.05rem', color: '#1e293b', lineHeight: '1.6', fontWeight: 500 }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {preprocessLatex(currentCard.query || '')}
                    </ReactMarkdown>
                    {currentCard.reason && (
                      <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#b45309', background: '#fef3c7', padding: '6px 12px', borderRadius: '8px' }}>
                        ⚠️ 曾犯错因：{currentCard.reason}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.95rem', color: '#334155', lineHeight: '1.6' }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>标准思路与答案：</div>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {preprocessLatex(currentCard.answer || '暂无详细标准答案')}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Tap to flip prompt */}
              {!isFlipped && (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem', marginTop: '16px' }}>
                  👇 想好思路后，点击卡片翻转对答案
                </div>
              )}
            </div>

            {/* FSRS Rating Buttons (Active only when flipped) */}
            {isFlipped ? (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '8px', textAlign: 'center' }}>
                  评估你的回忆准确度与流畅度 (FSRS-v4.5)：
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRate(1); }}
                    disabled={isSubmitting}
                    style={{
                      background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171',
                      padding: '10px 8px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px'
                    }}
                  >
                    <span>🔴 忘记</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'normal', color: '#b91c1c' }}>完全没思路</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRate(2); }}
                    disabled={isSubmitting}
                    style={{
                      background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24',
                      padding: '10px 8px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px'
                    }}
                  >
                    <span>🟠 困难</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'normal', color: '#b45309' }}>想得很费劲</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRate(3); }}
                    disabled={isSubmitting}
                    style={{
                      background: '#dcfce7', color: '#166534', border: '1px solid #4ade80',
                      padding: '10px 8px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px'
                    }}
                  >
                    <span>🟢 掌握</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'normal', color: '#15803d' }}>能正确解答</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRate(4); }}
                    disabled={isSubmitting}
                    style={{
                      background: '#dbeafe', color: '#1e40af', border: '1px solid #60a5fa',
                      padding: '10px 8px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px'
                    }}
                  >
                    <span>🔵 熟练</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'normal', color: '#1d4ed8' }}>秒出答案</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setIsFlipped(true)}
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                    color: '#fff', border: 'none', padding: '10px 28px', borderRadius: '12px',
                    fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
                  }}
                >
                  🔄 查看答案与自测评分
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
