import { useRef, useEffect, useState, useMemo } from 'react';
import confetti from 'canvas-confetti';

function buildMasteryQuestions(chapterName, subject = '数学', grade = '7') {
  const cName = chapterName || '当前章节';
  const s = subject || '数学';

  if (s === '数学') {
    if (/几何|角|线|三角形|四边形|圆|平行|垂直|轴对称|全等|相似/.test(cName)) {
      return [
        {
          id: 1,
          question: `在《${cName}》中，关于几何基本概念与定理，下列说法正确的是：`,
          options: [
            'A. 两点确定一条直线，两点之间线段最短',
            'B. 任何两个角只要度数相等就互为对顶角',
            'C. 两条直线被第三条直线所截，同位角一定相等',
            'D. 三角形任意两边之和小于第三边'
          ],
          correct: 0,
          explanation: '两点确定一条直线、两点之间线段最短是基本公理；同位角相等需要平行前提；两边之和必须大于第三边。'
        },
        {
          id: 2,
          question: `在推导《${cName}》中的几何关系时，若已知两个三角形全等或相似，关键突破口是：`,
          options: [
            'A. 随意测量图形长度直接得出结论',
            'B. 寻找对应边、对应角以及公共边/公共角的等量对应关系',
            'C. 只看肉眼直观感觉是否相似',
            'D. 只需要验证任意一个角相等即可判断全等'
          ],
          correct: 1,
          explanation: '严谨的几何证明必须基于对应边成比例/相等、对应角相等的公理定理，不可凭视觉猜测。'
        },
        {
          id: 3,
          question: `在解决《${cName}》的辅助线与求值综合题时，为防范解题陷阱，下列注意事项最关键的是：`,
          options: [
            'A. 分类讨论时必须考虑点在不同位置或钝角/锐角的不同情形',
            'B. 辅助线可以直接连接任意不存在的交点而不加说明',
            'C. 计算出负数长度也可以作为最终边长答案',
            'D. 题目没有给图形时只需画一种特殊图形即可'
          ],
          correct: 0,
          explanation: '中考几何常见陷阱之一是漏掉未指明位置关系时的分类讨论（如高在三角形内部或外部）。'
        }
      ];
    }

    if (/方程|代数|函数|不等式|整式|因式分解|分式|二次/.test(cName)) {
      return [
        {
          id: 1,
          question: `在学习《${cName}》时，关于代数式的等价变形，下列推导正确的是：`,
          options: [
            'A. 由 2x + 4 = 10 移项得 2x = 10 + 4',
            'B. 由 (x + 2)(x - 2) 展开得 x² - 4',
            'C. (-3a)² 计算结果为 -9a²',
            'D. 分式两边同乘分母求解后无需检验增根'
          ],
          correct: 1,
          explanation: '平方差公式展开为 x² - 4；移项必须变号；(-3a)² = 9a²；解分式方程必须验根。'
        },
        {
          id: 2,
          question: `针对《${cName}》涉及的核心模型，判断等式或不等式成立时，必须严守的数学底线是：`,
          options: [
            'A. 分母与除数绝不能为零',
            'B. 不等式两边同乘负数时方向保持不变',
            'C. 偶次根号下可以为任意负数',
            'D. 方程两边可以随意乘以 0'
          ],
          correct: 0,
          explanation: '分母不为零是代数基本定义域红线；不等式两边同乘负数必须改变方向。'
        },
        {
          id: 3,
          question: `解答《${cName}》中的实际应用或建模大题时，第一步规范动笔支架应当是：`,
          options: [
            'A. 直接心算写出最终答案数字',
            'B. 审清已知量与待求量，规范设未知数并寻找等量关系列出方程/函数',
            'C. 随意代入几个数字试探答案',
            'D. 不写单位也不作答'
          ],
          correct: 1,
          explanation: '应用题标准踩分点必须具备“设未知数、列方程、解方程、检验、作答”五步完整闭环。'
        }
      ];
    }
  }

  // 通用学科（语文、英语、物理、化学、历史、地理、道法）
  return [
    {
      id: 1,
      question: `在章节《${cName}》的学习中，关于本章的核心概念与基本原理，下列叙述最准确的是：`,
      options: [
        `A. 深入理解《${cName}》的定义内涵，联系生活情境把握核心规律`,
        'B. 只需死记硬背字面结论，无需理解公式或定理推导过程',
        'C. 遇到不理解的名词可以直接跳过不理会',
        'D. 概念学习与做题实践没有任何关联'
      ],
      correct: 0,
      explanation: '高阶学习必须由表及里，理解概念本质并学会在具体真实情境中灵活迁移运用。'
    },
    {
      id: 2,
      question: `回顾《${cName}》的探究过程，建立系统知识体系的最佳方法是：`,
      options: [
        'A. 把零散知识点通过思维导图（Mindmap）整理成逻辑树状结构',
        'B. 做完题后立刻扔掉草稿纸，不复盘错题',
        'C. 只刷同一道题的同等数字练习',
        'D. 考前突击看一遍目录即可'
      ],
      correct: 0,
      explanation: '思维导图能将离散知识点结构化串联，强化长时记忆与知识提取迁移效率。'
    },
    {
      id: 3,
      question: `针对《${cName}》中的高频易错点与典型模型，怎样才能实现“做一题、通一类”？`,
      options: [
        'A. 盲目搞题海战术，做错也不总结原因',
        'B. 认清题眼陷阱，归纳母题模型，主动进行举一反三变式训练',
        'C. 看到难题直接看答案抄上即可',
        'D. 错题本只需抄下题目，不用分析思维卡点'
      ],
      correct: 1,
      explanation: '真正的学霸方法是穿透题眼模型，反思思维卡点，通过变式微练闭环彻底根治。'
    }
  ];
}

export default function ChapterStepper({
  activeChapterData,
  setActiveChapterData,
  currentProfileId,
  currentGrade,
  selectedSubject,
  onSubmit,
  authFetch
}) {
  const confettiTimersRef = useRef([]);
  const [isAnimating, setIsAnimating] = useState(false);

  // 🏆 通关测验门禁状态
  const [showMasteryModal, setShowMasteryModal] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [masterySubmitted, setMasterySubmitted] = useState(false);
  const [masteryScore, setMasteryScore] = useState(0);

  useEffect(() => {
    return () => {
      confettiTimersRef.current.forEach(id => clearTimeout(id));
      confettiTimersRef.current = [];
      document.querySelectorAll('.confetti-particle').forEach(el => el.remove());
      try { confetti.reset(); } catch (e) { console.debug('confetti.reset() unsupported in this version', e); }
    };
  }, []);

  const questions = useMemo(() => {
    if (!activeChapterData) return [];
    return buildMasteryQuestions(activeChapterData.name, selectedSubject, currentGrade);
  }, [activeChapterData, selectedSubject, currentGrade]);

  if (!activeChapterData) return null;

  const triggerCompletion = async () => {
    const newStatus = 'completed';
    setActiveChapterData(prev => ({ ...prev, progress_pct: 100, status: newStatus }));
    try {
      await authFetch('/api/chapters/update-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: currentProfileId,
          grade: currentGrade,
          subject: selectedSubject || '数学',
          chapter_id: activeChapterData.id,
          status: newStatus,
          progress_pct: 100
        })
      });
      window.dispatchEvent(new Event('refreshChapters'));
    } catch (err) {
      console.error('Failed to sync progress:', err);
    }

    if (!isAnimating) {
      setIsAnimating(true);
      confetti({
        particleCount: 160,
        spread: 80,
        origin: { y: 0.6 },
        zIndex: 9999
      });
      const tid = setTimeout(() => {
        setIsAnimating(false);
      }, 3000);
      confettiTimersRef.current.push(tid);
    }

    const chapterName = activeChapterData ? activeChapterData.name : '该章节';
    const text = `🏆 我已成功通过《${chapterName}》的3道核心通关检测题，正式达成 100% 单元通关！请名师为我颁发单元通关星章并给予鼓励评价！`;
    onSubmit(null, text);
  };

  const handleStepClick = async (step) => {
    if (step.pct === 100) {
      // 🏆 门禁检查：如果已经通关，直接展示庆祝或提示；若未通关，必须先过关测评
      if (activeChapterData.progress_pct === 100 && activeChapterData.status === 'completed') {
        triggerCompletion();
        return;
      }
      // 弹出 3 题通关测评门禁
      setSelectedAnswers({});
      setMasterySubmitted(false);
      setMasteryScore(0);
      setShowMasteryModal(true);
      return;
    }

    const newStatus = 'in_progress';
    setActiveChapterData(prev => ({ ...prev, progress_pct: step.pct, status: newStatus }));
    authFetch('/api/chapters/update-progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: currentProfileId,
        grade: currentGrade,
        subject: selectedSubject || '数学',
        chapter_id: activeChapterData.id,
        status: newStatus,
        progress_pct: step.pct
      })
    }).then(() => {
      window.dispatchEvent(new Event('refreshChapters'));
    }).catch(err => console.error('Failed to sync progress:', err));

    let text = '';
    const chapterName = activeChapterData ? activeChapterData.name : '该章节';
    if (step.pct === 25) text = `针对章节《${chapterName}》，我准备好开始第一关【${step.pct}% 新知导读与热身】了！`;
    if (step.pct === 50) text = `进入第二关【${step.pct}% 概念挑战】！请给我出道关于《${chapterName}》的互动练习题吧。`;
    if (step.pct === 75) text = `进入第三关【${step.pct}% 脑图巩固】！请用Markdown代码块给我画个《${chapterName}》的核心思维导图。`;
    onSubmit(null, text);
  };

  const handleOptionSelect = (qId, optIdx) => {
    if (masterySubmitted) return;
    setSelectedAnswers(prev => ({ ...prev, [qId]: optIdx }));
  };

  const handleSubmitMasteryTest = () => {
    let score = 0;
    questions.forEach(q => {
      if (selectedAnswers[q.id] === q.correct) {
        score += 1;
      }
    });
    setMasteryScore(score);
    setMasterySubmitted(true);

    if (score >= 2) {
      // 达到合格门槛（2/3），通过通关门禁！
      setTimeout(() => {
        setShowMasteryModal(false);
        triggerCompletion();
      }, 1500);
    }
  };

  return (
    <>
      <div className="chapter-stepper-bar glass-panel animate-fade-in" style={{
        position: 'fixed', top: '70px', left: '50%', transform: 'translateX(-50%)',
        width: '90%', maxWidth: '800px', zIndex: 90, padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}>
        <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 'bold' }}>📍 当前探索: 《{activeChapterData.name}》</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[{ pct: 25, label: '⛳ 导学' }, { pct: 50, label: '⚔️ 挑战' }, { pct: 75, label: '📝 脑图' }, { pct: 100, label: '🏆 通关' }].map(step => {
            const isActive = (activeChapterData.progress_pct || 0) >= step.pct;
            return (
              <button
                key={step.pct}
                onClick={() => handleStepClick(step)}
                disabled={isAnimating}
                style={{
                  padding: '6px 12px', borderRadius: '20px', fontSize: '13px',
                  background: isActive ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.1)',
                  color: isActive ? '#fff' : '#94a3b8', border: 'none', cursor: isAnimating ? 'not-allowed' : 'pointer',
                  boxShadow: isActive ? '0 0 10px rgba(139, 92, 246, 0.5)' : 'none',
                  opacity: isAnimating ? 0.6 : 1
                }}
              >
                {step.label}
              </button>
            );
          })}
          <button onClick={() => setActiveChapterData(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: '4px' }}>✕</button>
        </div>
      </div>

      {/* 🏆 通关核心门禁检测弹窗 */}
      {showMasteryModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1400, padding: '16px'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid rgba(139, 92, 246, 0.4)',
            borderRadius: '20px', width: '100%', maxWidth: '640px', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.25))',
              borderBottom: '1px solid rgba(139, 92, 246, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🏆 单元通关测评</span>
                  <span style={{ fontSize: '0.85rem', color: '#a78bfa' }}>《{activeChapterData.name}》</span>
                </h3>
                <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>
                  答对 2 题及以上即可点亮本单元通关金星，杜绝“无实质学习虚假通关”！
                </p>
              </div>
              <button
                onClick={() => setShowMasteryModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Questions Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {questions.map((q, idx) => {
                const userChoice = selectedAnswers[q.id];
                const isCorrect = userChoice === q.correct;
                return (
                  <div key={q.id} style={{
                    background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)', padding: '14px'
                  }}>
                    <div style={{ color: '#e2e8f0', fontSize: '0.92rem', fontWeight: 600, marginBottom: '10px' }}>
                      <span style={{ color: '#818cf8', marginRight: '6px' }}>第 {idx + 1} 题:</span>
                      {q.question}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {q.options.map((opt, optIdx) => {
                        const isSelected = userChoice === optIdx;
                        let optBg = 'rgba(255, 255, 255, 0.05)';
                        let optBorder = 'rgba(255, 255, 255, 0.1)';
                        let optColor = '#cbd5e1';

                        if (isSelected) {
                          optBg = 'rgba(99, 102, 241, 0.25)';
                          optBorder = '#6366f1';
                          optColor = '#fff';
                        }
                        if (masterySubmitted) {
                          if (optIdx === q.correct) {
                            optBg = 'rgba(16, 185, 129, 0.25)';
                            optBorder = '#10b981';
                            optColor = '#34d399';
                          } else if (isSelected && !isCorrect) {
                            optBg = 'rgba(239, 68, 68, 0.25)';
                            optBorder = '#ef4444';
                            optColor = '#f87171';
                          }
                        }

                        return (
                          <div
                            key={optIdx}
                            onClick={() => handleOptionSelect(q.id, optIdx)}
                            style={{
                              padding: '10px 14px', borderRadius: '8px', cursor: masterySubmitted ? 'default' : 'pointer',
                              background: optBg, border: `1px solid ${optBorder}`, color: optColor,
                              fontSize: '0.85rem', transition: 'all 0.15s ease'
                            }}
                          >
                            {opt}
                          </div>
                        );
                      })}
                    </div>
                    {masterySubmitted && (
                      <div style={{
                        marginTop: '10px', padding: '8px 12px', borderRadius: '8px',
                        background: isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        fontSize: '0.78rem', color: isCorrect ? '#34d399' : '#fca5a5', lineHeight: 1.5
                      }}>
                        {isCorrect ? '✅ 回答正确！' : '❌ 答案不正确。'}
                        <div style={{ color: '#94a3b8', marginTop: '2px' }}>💡 题眼解析：{q.explanation}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 20px', background: 'rgba(15, 23, 42, 0.6)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                {masterySubmitted && (
                  <span style={{
                    fontSize: '0.9rem', fontWeight: 'bold',
                    color: masteryScore >= 2 ? '#34d399' : '#f87171'
                  }}>
                    {masteryScore >= 2 ? `🎉 答对 ${masteryScore}/3 题，通关成功！正在颁发奖章...` : `⚠️ 答对 ${masteryScore}/3 题，未达通关标准 (需至少2题正确)`}
                  </span>
                )}
                {!masterySubmitted && (
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    已完成 {Object.keys(selectedAnswers).length} / 3 题
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {!masterySubmitted ? (
                  <button
                    onClick={handleSubmitMasteryTest}
                    disabled={Object.keys(selectedAnswers).length < 3}
                    style={{
                      padding: '8px 20px', borderRadius: '8px',
                      background: Object.keys(selectedAnswers).length === 3 ? 'linear-gradient(135deg, #10b981, #059669)' : '#334155',
                      color: '#ffffff', border: 'none', fontWeight: 'bold', fontSize: '0.88rem',
                      cursor: Object.keys(selectedAnswers).length === 3 ? 'pointer' : 'not-allowed',
                      opacity: Object.keys(selectedAnswers).length === 3 ? 1 : 0.6
                    }}
                  >
                    提交通关检测
                  </button>
                ) : masteryScore < 2 ? (
                  <button
                    onClick={() => {
                      setSelectedAnswers({});
                      setMasterySubmitted(false);
                      setMasteryScore(0);
                    }}
                    style={{
                      padding: '8px 20px', borderRadius: '8px',
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      color: '#ffffff', border: 'none', fontWeight: 'bold', fontSize: '0.88rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 重新挑战
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
