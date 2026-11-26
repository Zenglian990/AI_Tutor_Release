import { useRef, useEffect, useState, useMemo } from 'react';
import confetti from 'canvas-confetti';

function buildMasteryQuestions(chapterName, subject = '数学', grade = '7') {
  const cName = chapterName || '当前章节';
  const s = subject || '数学';
  const gradeNum = parseInt(String(grade || '7').replace(/\D/g, ''), 10) || 7;
  const isPrimary = gradeNum <= 6;
  const isHigh = gradeNum >= 10;

  // 小学 1–6 年级专属童趣基础题（严禁出现初中同位角/中考几何/方程移项等超纲内容）
  if (isPrimary) {
    if (s === '数学' && /图形|长方|正方|三角|圆|角|周长|面积|对称/.test(cName)) {
      return [
        {
          id: 1,
          question: `在《${cName}》中，关于常见平面图形的特点，下面哪一项说法是正确的？`,
          options: [
            'A. 正方形的四条边都一样长，四个角都是直角',
            'B. 三角形有四条边和四个角',
            'C. 圆形的边都是直直的线段',
            'D. 长方形的四条边一定全都相等'
          ],
          correct: 0,
          explanation: '正方形四条边长度相等且四个角都是直角；三角形有 3 条边 3 个角；圆的边是曲线。'
        },
        {
          id: 2,
          question: `学习《${cName}》时，如果把一个长方形纸片沿一条直线对折后两边完全重合，这种图形叫做：`,
          options: [
            'A. 任意多边形',
            'B. 轴对称图形',
            'C. 立体图形',
            'D. 不规则图形'
          ],
          correct: 1,
          explanation: '对折后两侧能够完全重合的图形就是轴对称图形，折痕所在直线是对称轴。'
        },
        {
          id: 3,
          question: `在生活中辨认或拼接《${cName}》里的图形时，最科学的小妙招是：`,
          options: [
            'A. 动手数一数边数、比一比角的大小，再用尺子量一量',
            'B. 只看图形涂了什么颜色来判断',
            'C. 随便猜一个图形名字',
            'D. 图形旋转后就变成了另一种新图形'
          ],
          correct: 0,
          explanation: '辨认图形要抓住边和角的特征，图形旋转或移动位置不会改变它的形状和大小。'
        }
      ];
    }
    return [
      {
        id: 1,
        question: `学习小学《${cName}》这一单元时，遇到应用题或计算题，第一步应该先做什么？`,
        options: [
          'A. 认真读两遍题目，圈出已知数字和问题要求',
          'B. 不看题目条件，直接把所有数字加起来',
          'C. 随便写一个数交卷',
          'D. 只看最后一个字就下笔'
        ],
        correct: 0,
        explanation: '审清题目条件与问题，圈画关键词，是小学阶段零粗心拿满分的黄金习惯。'
      },
      {
        id: 2,
        question: `在《${cName}》计算或朗读背诵遇到卡壳时，哪种办法最能帮你真正学会？`,
        options: [
          'A. 借助画图、小棒/计数器等实物模型把道理讲清楚',
          'B. 直接抄写答案不再思考',
          'C. 跳过不学',
          'D. 死记结果不问为什么'
        ],
        correct: 0,
        explanation: '小学阶段通过画图和动手演示把抽象概念可视化，理解最牢固。'
      },
      {
        id: 3,
        question: `做完《${cName}》练习题之后，怎样检查才能避免“会做却算错”？`,
        options: [
          'A. 把答案代回题目条件验证一遍，并检查单位和作答',
          'B. 写完马上合上本子不看',
          'C. 只检查第一道题',
          'D. 不用管题目单位'
        ],
        correct: 0,
        explanation: '代入检验与核对单位/答语是小学数学和语文阅读答题的满分收官步骤。'
      }
    ];
  }

  // 高中 10–12 年级专属高阶思维题（贴合新高考逻辑，绝不写“中考”）
  if (isHigh) {
    return [
      {
        id: 1,
        question: `在高中《${cName}》核心模块中，分析关键性质或推导定理时，最容易忽略的前提条件是：`,
        options: [
          'A. 定义域边界、特例情况（如参数为 0 / 斜率不存在 / 临界状态）的分类讨论',
          'B. 只验证一个特殊数值即可推广到全部实数范围',
          'C. 忽略题目中的隐含约束直接套用二级结论',
          'D. 无需检验等价变形是否产生增根或漏解'
        ],
        correct: 0,
        explanation: '新高考压轴题高频失分点正是定义域限制与参数分类讨论（如斜率不存在、临界端点）。'
      },
      {
        id: 2,
        question: `在构建《${cName}》的高中知识网络时，实现从“会做单题”到“通解通法”跃升的关键在于：`,
        options: [
          'A. 提炼核心数学/科学模型，将数形结合、转化与化归思想贯穿同类母题',
          'B. 机械刷题但不归纳题型结构与错因',
          'C. 只背最终结论，不理解公式推导来源',
          'D. 每次遇到新情境都重新从零试错'
        ],
        correct: 0,
        explanation: '高中学科强调模型抽象、数形结合与转化化归，掌握母题结构才能以不变应万变。'
      },
      {
        id: 3,
        question: `针对《${cName}》的高考综合压轴题，规范书面表达以拿满步骤分的最佳策略是：`,
        options: [
          'A. 关键定理依据、核心方程与必要结论清晰呈现，逻辑链条严密无跳步',
          'B. 只写最终数值结果省略推导过程',
          'C. 把草稿纸上试探的错误思路全部抄到答题卡上',
          'D. 忽略向量方向、单位量纲或有效数字要求'
        ],
        correct: 0,
        explanation: '高考阅卷按采分点给分，核心公式、临界判断与严谨结论缺一不可。'
      }
    ];
  }

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
          explanation: '初中几何常见陷阱之一是漏掉未指明位置关系时的分类讨论（如高在三角形内部或外部）。'
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

  // 初中通用学科
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

  // 🏆 通关测验门禁状态（支持后端按当前年级/章节动态出题）
  const [showMasteryModal, setShowMasteryModal] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [masterySubmitted, setMasterySubmitted] = useState(false);
  const [masteryScore, setMasteryScore] = useState(0);
  const [dynamicQuestions, setDynamicQuestions] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);

  useEffect(() => {
    setDynamicQuestions(null);
  }, [activeChapterData?.id, selectedSubject, currentGrade]);

  useEffect(() => {
    return () => {
      confettiTimersRef.current.forEach(id => clearTimeout(id));
      confettiTimersRef.current = [];
      document.querySelectorAll('.confetti-particle').forEach(el => el.remove());
      try { confetti.reset(); } catch (e) { console.debug('confetti.reset() unsupported in this version', e); }
    };
  }, []);

  const fallbackQuestions = useMemo(() => {
    if (!activeChapterData) return [];
    return buildMasteryQuestions(activeChapterData.name, selectedSubject, currentGrade);
  }, [activeChapterData, selectedSubject, currentGrade]);

  const questions = (dynamicQuestions && dynamicQuestions.length >= 2) ? dynamicQuestions : fallbackQuestions;

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
      // 弹出 3 题通关测评门禁，并向后端按当前年级/章节请求动态真题
      setSelectedAnswers({});
      setMasterySubmitted(false);
      setMasteryScore(0);
      setShowMasteryModal(true);
      if (authFetch && !dynamicQuestions) {
        setQuizLoading(true);
        authFetch('/api/chapters/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade: currentGrade,
            subject: selectedSubject || '数学',
            chapter_title: activeChapterData.name
          })
        })
          .then(r => (r.ok ? r.json() : null))
          .then(d => {
            if (d?.success && Array.isArray(d.questions) && d.questions.length >= 2) {
              const letters = ['A', 'B', 'C', 'D'];
              setDynamicQuestions(d.questions.map((q, i) => ({
                id: q.id || (i + 1),
                question: q.question,
                options: q.options.map((o, oi) => /^[A-D][.、\s]/.test(o) ? o : `${letters[oi] || ''}. ${o}`),
                correct: typeof q.correctIdx === 'number' ? q.correctIdx : 0,
                explanation: q.explanation || q.hint || '紧扣本单元核心概念即可得出正解。'
              })));
            }
          })
          .catch(() => {})
          .finally(() => setQuizLoading(false));
      }
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
        position: 'relative',
        width: 'calc(100% - 24px)',
        maxWidth: '860px',
        margin: '8px auto 4px',
        zIndex: 40,
        padding: '10px 14px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(139, 92, 246, 0.35)',
        borderRadius: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0, flex: '1 1 200px' }}>
          <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📍 当前探索: 《{activeChapterData.name}》
          </div>
          <button
            type="button"
            onClick={() => setActiveChapterData(null)}
            aria-label="关闭当前探索条"
            title="退出当前章节探索"
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: '#cbd5e1', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ pct: 25, label: '⛳ 导学' }, { pct: 50, label: '⚔️ 挑战' }, { pct: 75, label: '📝 脑图' }, { pct: 100, label: '🏆 通关' }].map(step => {
            const isActive = (activeChapterData.progress_pct || 0) >= step.pct;
            return (
              <button
                key={step.pct}
                type="button"
                onClick={() => handleStepClick(step)}
                disabled={isAnimating}
                style={{
                  padding: '5px 10px', borderRadius: '16px', fontSize: '12px', whiteSpace: 'nowrap',
                  background: isActive ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.1)',
                  color: isActive ? '#fff' : '#94a3b8', border: 'none', cursor: isAnimating ? 'not-allowed' : 'pointer',
                  boxShadow: isActive ? '0 0 10px rgba(139, 92, 246, 0.45)' : 'none',
                  opacity: isAnimating ? 0.6 : 1
                }}
              >
                {step.label}
              </button>
            );
          })}
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
              {quizLoading && (
                <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.84rem', color: '#93c5fd', background: 'rgba(59,130,246,0.1)', borderRadius: '10px' }}>
                  ⏳ 正在结合当前年级与章节《{activeChapterData.name}》动态生成专属通关测评题...
                </div>
              )}
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
