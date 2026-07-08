import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useStore';
import DOMPurify from 'dompurify';
import { initMermaid, sanitizeMermaid } from '../utils/mermaid_helper';

initMermaid();

/**
 * Mermaid 图表渲染子组件
 */
function MermaidRenderer({ chart }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!chart) return;
    try {
      const id = `mermaid-test-${Math.random().toString(36).substring(7)}`;
      const cleaned = sanitizeMermaid(chart);
        
      import('mermaid').then(mermaid => {
        mermaid.default.render(id, cleaned).then((result) => {
          const cleanSvg = DOMPurify.sanitize(result.svg, {
            USE_PROFILES: { svg: true },
            ADD_TAGS: ['foreignObject']
          });
          setSvg(cleanSvg);
        }).catch(err => {
        setError(err.message);
        const danglingSvg = document.getElementById(id);
        if (danglingSvg) danglingSvg.remove();
        const dDanglingSvg = document.getElementById('d' + id);
        if (dDanglingSvg) dDanglingSvg.remove();
        });
      }).catch(err => setError("Failed to load mermaid: " + err.message));
    } catch (err) {
      setError(err.message);
    }
  }, [chart]);

  if (error) {
    return <pre style={{ color: '#ef4444', fontSize: '11px', padding: '6px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '6px' }}>画图出错: {error}</pre>;
  }

  if (!svg) {
    return <div style={{ fontSize: '12px', color: '#9ca3af', padding: '10px', textAlign: 'center' }}>正在绘制几何拓扑图...</div>;
  }

  return (
    <div 
      className="mermaid-graph" 
      style={{ 
        background: 'rgba(255, 255, 255, 0.02)', 
        padding: '12px', 
        borderRadius: '10px', 
        overflowX: 'auto', 
        display: 'flex', 
        justifyContent: 'center', 
        margin: '12px 0',
        border: '1px solid rgba(255,255,255,0.04)' 
      }}
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}

export default function KnowledgeTest({ onClose, currentProfileId, currentGrade, selectedSubject, currentEdition, authFetch }) {
  const { language } = useAppStore();

  const getExamGuideAndButtonText = () => {
    const rawGrade = currentGrade ? String(currentGrade).split('_')[0] : '';
    const isElementary = ['1', '2', '3', '4', '5', '6'].includes(rawGrade);
    
    let guide = {
      title: '📋 本卷信息与作答指南（依照中考题型格式出题）：',
      btnText: '🚀 依据中考格式出题',
      desc: (
        <>
          • <b>一、选择题（第1-5题，共40分）：</b>包含平方根、几何角度、平移象限等，每小题 8 分，只有一个正确选项。<br />
          • <b>二、填空题（第6-8题，共24分）：</b>包含有理数绝对值化简、不等式整数解等，每小题 8 分，直接输入最终结果。<br />
          • <b>三、解答题（第9-11题，共86分）：</b>第 9 题（20分）为计算题；第 10 题（26分）为几何证明填空，需要在证明步骤的横线上补齐结论或定理根据；第 11 题（40分）为直方图/折线图或学科综合应用题。
        </>
      )
    };

    
    if (selectedSubject === '语文') {
      if (isElementary) {
        guide.title = '📋 本卷信息与作答指南（完全依照真实小学语文考试格式）：';
        guide.btnText = '🚀 依据真题试卷格式出题';
        guide.desc = (
          <>
            • <b>一、字音与词语拼写：</b>看拼音写词语、形近字组词，考查基础字词。<br />
            • <b>二/三、词语与句子练习：</b>成语补充、句子仿写及改错，强化表达能力。<br />
            • <b>四、判断题：</b>对课文内容及寓意的理解判断（点击 √ 或 ×）。<br />
            • <b>五/六/七、默写与阅读：</b>古诗默写、课内外精美文章阅读理解分析。<br />
            • <b>八、习作表达：</b>看图写话或半命题小作文，考查综合书面表达能力。
          </>
        );
      } else {
        guide.title = '📋 本卷信息与作答指南（依照中考语文格式出题）：';
        guide.btnText = '🚀 依据中考语文格式出题';
        guide.desc = (
          <>
            • <b>基础与默写：</b>字音字形、病句辨析、名句默写等。<br />
            • <b>阅读与判断：</b>古诗文阅读、现代文大阅读，新增判断题型。<br />
            • <b>写作表达：</b>命题/材料作文大纲与片段练习。
          </>
        );
      }
    } else if (selectedSubject === '数学') {
      if (isElementary) {
        guide.title = '📋 本卷信息与作答指南（完全依照真实小学数学考试格式）：';
        guide.btnText = '🚀 依据真题试卷格式出题';
        guide.desc = (
          <>
            • <b>一、填空题：</b>核心概念的细节考查（倍数、规律、基础算术）。<br />
            • <b>二、判断题：</b>对数理概念和公式的明辨是非（点击 √ 或 ×）。<br />
            • <b>三/四、选择与计算：</b>估算及算式推演选择，口算与竖式计算综合大题。<br />
            • <b>五、操作题：</b>方位图或格纸操作作图题（使用自动几何绘图引擎渲染）。<br />
            • <b>六、解决问题：</b>购物、周长、行程等包含多问的经典实际应用题。
          </>
        );
      } else {
        guide.title = '📋 本卷信息与作答指南（依照中考数学格式出题）：';
        guide.btnText = '🚀 依据中考数学格式出题';
        guide.desc = (
          <>
            • <b>判断与选择：</b>新增判断题，考查代数几何性质、函数系数等。<br />
            • <b>填空与计算：</b>代数式化简求值、线段与角度计算。<br />
            • <b>解答与证明：</b>几何证明推理、函数与动点压轴综合应用题。
          </>
        );
      }
    } else {
       guide.title = '📋 本卷信息与作答指南（全真模拟试卷）：';
       guide.btnText = '🚀 依据真题试卷格式出题';
       guide.desc = (
         <>
           • <b>综合卷面结构：</b>包含判断、选择、填空与综合解答题，全面覆盖知识考点。<br />
           • <b>题型多样：</b>新增判断题型（点击 √ 或 ×），解答题字数充实。<br />
           • <b>严谨判卷：</b>AI 将依据详细的答题步骤给予得分，请认真作答。
         </>
       );
    }

    return guide;
  };
  
  // UI 阶段状态: 'setup' | 'generating' | 'testing' | 'grading' | 'report'
  const [stage, setStage] = useState('setup'); 
  const [testType, setTestType] = useState('custom'); // 'custom' | 'unit' | 'midterm' | 'final'
  const [customKnowledgePoints, setCustomKnowledgePoints] = useState('');
  
  // 章节列表和选择
  const [chapters, setChapters] = useState([]);
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [chaptersLoading, setChaptersLoading] = useState(false);
  
  // 试卷数据和答题状态
  const [paper, setPaper] = useState(null);
  const [answers, setAnswers] = useState({}); // { [questionId]: 'studentAnswer' }
  const [generatingStatus, setGeneratingStatus] = useState('');
  
  // 批改报告
  const [report, setReport] = useState(null);
  const [gradingStatus, setGradingStatus] = useState('');
  const [markedMistakes, setMarkedMistakes] = useState({}); // { [questionId]: true }

  // 解析年级名称
  const getGradeName = (grade) => {
    const maps = {
      '1_up': '一年级上册', '1_down': '一年级下册',
      '2_up': '二年级上册', '2_down': '二年级下册',
      '3_up': '三年级上册', '3_down': '三年级下册',
      '4_up': '四年级上册', '4_down': '四年级下册',
      '5_up': '五年级上册', '5_down': '五年级下册',
      '6_up': '六年级上册', '6_down': '六年级下册',
      '7_up': '七年级上册', '7_down': '七年级下册',
      '8_up': '八年级上册', '8_down': '八年级下册',
      '9_up': '九年级上册', '9_down': '九年级下册',
    };
    return maps[grade] || '通用年级';
  };

  // 渲染题目中的文本和内嵌的 Mermaid 图表
  const renderQuestionText = (text) => {
    if (!text) return null;
    const parts = text.split(/```mermaid([\s\S]*?)```/g);
    if (parts.length === 1) return <span>{text}</span>;

    return (
      <div>
        {parts.map((part, index) => {
          if (index % 2 === 1) {
            return <MermaidRenderer key={index} chart={part.trim()} />;
          }
          return <span key={index} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
        })}
      </div>
    );
  };

  // 单元测试时拉取章节目录
  useEffect(() => {
    if (testType === 'unit' && stage === 'setup') {
      setChaptersLoading(true);
      authFetch(`/api/chapters?grade=${currentGrade}&subject=${encodeURIComponent(selectedSubject)}&edition=${encodeURIComponent(currentEdition || '')}`)
        .then(res => {
          if (!res.ok) throw new Error('网络异常或验证失败，无法加载章节');
          return res.json();
        })
        .then(data => {
          const list = data.chapters || [];
          setChapters(list);
          if (list.length > 0) {
            setSelectedChapterId(list[0].id);
          }
          setChaptersLoading(false);
        })
        .catch(err => {
          console.error("Error fetching chapters:", err);
          alert(err.message || '获取章节失败，请重新登录或重试');
          setChaptersLoading(false);
        });
    }
  }, [testType, currentGrade, selectedSubject, currentEdition, stage]);

  // 动态加载出题文案
  useEffect(() => {
    if (stage === 'generating') {
      const statuses = [
        '🔍 正在严格提取人教版教材知识点库...',
        '🧠 AI 教研命题官正在依据中考大纲构思题型...',
        '📐 正在生成严密的几何相交线与截线关系...',
        '🎨 正在用 Mermaid 绘制严谨的几何拓扑辅助图形...',
        '✍️ 正在设计 5 道单项选择题（共 40 分）...',
        '✍️ 正在设计 3 道精细填空题（共 24 分）...',
        '✍️ 正在规划 3 道解答大题（计算、证明填空、应用题共 86 分）...',
        '⚖️ 正在核对 150 分试卷总分的科学配比与标准答案...'
      ];
      let i = 0;
      setGeneratingStatus(statuses[0]);
      const interval = setInterval(() => {
        i = (i + 1) % statuses.length;
        setGeneratingStatus(statuses[i]);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [stage]);

  // 动态加载阅卷文案
  useEffect(() => {
    if (stage === 'grading') {
      const statuses = [
        '💯 正在自动比对 1-5 题选择题答案...',
        '🧐 正在智能分析 6-8 题填空题是否完全一致...',
        '👩‍🏫 AI 阅卷老师正在依据标准得分点，细致批阅计算与证明题...',
        '📐 正在对几何推理过程的逻辑严密性进行评分...',
        '💡 正在折算 150 分总成绩，生成全方位的学情诊断报告...'
      ];
      let i = 0;
      setGradingStatus(statuses[0]);
      const interval = setInterval(() => {
        i = (i + 1) % statuses.length;
        setGradingStatus(statuses[i]);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [stage]);

  // 开始生成试卷
  const handleGenerate = async () => {
    setStage('generating');
    try {
      const res = await authFetch('/api/test-paper/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: currentGrade,
          subject: selectedSubject,
          type: testType,
          chapter_id: testType === 'unit' ? selectedChapterId : undefined,
          edition: currentEdition,
          knowledge_points: testType === 'custom' ? customKnowledgePoints : undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '出卷失败');
      }

      const data = await res.json();
      if (!data.paper || !data.paper.questions) {
        throw new Error('试卷格式不正确');
      }

      setPaper(data.paper);
      // 初始化答案状态
      const initialAnswers = {};
      data.paper.questions.forEach(q => {
        initialAnswers[q.id] = '';
      });
      setAnswers(initialAnswers);
      setStage('testing');
    } catch (e) {
      alert(`❌ 出卷失败：${e.message}。请重试。`);
      setStage('setup');
    }
  };

  // 交卷批改
  const handleSubmitTest = async () => {
    const uncompleted = paper.questions.filter(q => !answers[q.id]?.trim());
    if (uncompleted.length > 0) {
      if (!window.confirm(`你还有 ${uncompleted.length} 道题目尚未作答，确定要提前交卷吗？`)) {
        return;
      }
    }

    setStage('grading');
    try {
      const res = await authFetch('/api/test-paper/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: '曾小侠',
          answers: answers,
          questions: paper.questions,
          grade: currentGrade
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '批改失败');
      }

      const data = await res.json();
      setReport(data);
      setStage('report');
    } catch (e) {
      alert(`❌ 批改失败：${e.message}。请重试。`);
      setStage('testing');
    }
  };

  // 一键收录错题
  const handleMarkMistake = async (qReport) => {
    if (markedMistakes[qReport.id]) return;
    
    try {
      const res = await authFetch('/api/mistakes/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: qReport.question,
          answer: `【测试卷错题收录】\n我的解答：${qReport.studentAnswer || '未答'}\n标准答案：${qReport.standardAnswer}\n阅卷点评：${qReport.comment}\n详细解析：${qReport.explanation}`,
          grade: currentGrade,
          subject: selectedSubject,
          profile_id: currentProfileId
        })
      });

      if (res.ok) {
        setMarkedMistakes(prev => ({ ...prev, [qReport.id]: true }));
        alert("🚩 错题已成功收录至“我的错题本”！");
      } else {
        alert("收录失败，请重试。");
      }
    } catch (err) {
      console.error(err);
      alert("网络错误，收录失败。");
    }
  };

  // 动态分值评级 (小学满分 100，初中满分 150)
  const getScoreRating = (score) => {
    const rawGrade = currentGrade ? String(currentGrade).split('_')[0] : '';
    const isElementary = ['1', '2', '3', '4', '5', '6'].includes(rawGrade);
    const excellentLimit = isElementary ? 90 : 135;
    const passLimit = isElementary ? 60 : 90;

    if (score >= excellentLimit) return { label: '👑 优秀 (特等奖)', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    if (score >= passLimit) return { label: '⭐ 及格 (通过)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
    return { label: '🔥 需努力', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
  };

  // 按真题类型分类
  
  const getQuestionBlocks = () => {
    if (!paper || !paper.questions) return [];
    let blocks = [];
    let currentBlock = null;

    paper.questions.forEach((q, idx) => {
      if (!currentBlock || currentBlock.type !== q.type) {
        currentBlock = {
          type: q.type,
          questions: [],
          score: 0,
          id: `block_${idx}`
        };
        blocks.push(currentBlock);
      }
      currentBlock.questions.push(q);
      currentBlock.score += q.score;
    });

    return blocks;
  };

  const questionBlocks = getQuestionBlocks();


  return (
    <div className="mistake-overlay" style={{ zIndex: 1000 }}>
      <div className="mistake-modal" style={{
        width: '95%',
        maxWidth: '850px',
        maxHeight: '90vh',
        background: 'var(--card-bg, #111827)',
        color: 'var(--text-primary, #f9fafb)',
        padding: '24px',
        borderRadius: '24px',
        border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.08))',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>📝</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 'bold', color: '#fbbf24' }}>
                {stage === 'testing' ? paper?.title : '真题测试中心'}
              </h2>
              {(() => {
                const rawGrade = currentGrade ? String(currentGrade).split('_')[0] : '';
                const isElementary = ['1', '2', '3', '4', '5', '6'].includes(rawGrade);
                const scoreText = isElementary ? '考试时间：90分钟  满分：100分' : '考试时间：120分钟  满分：150分';
                return (
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
                    {getGradeName(currentGrade)} · {selectedSubject} （{scoreText}）
                  </p>
                );
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(stage === 'testing' || stage === 'report') && (
              <button
                onClick={() => window.print()}
                className="mistake-btn no-print"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderColor: '#60a5fa',
                  color: '#60a5fa',
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                🖨️ {stage === 'report' ? '打印成绩报告' : '打印空白卷'}
              </button>
            )}
            <button 
              onClick={onClose} 
              disabled={stage === 'generating' || stage === 'grading'}
              className="no-print"
              style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* 1. 准备配置阶段 */}
        {stage === 'setup' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🎯 第一步：选择测试范围
              </h3>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                {[
                  { id: 'custom', label: '✨ 自定义知识点' },
                  { id: 'unit', label: '📖 单元阶段测试' },
                  { id: 'midterm', label: '📅 期中阶段大考' },
                  { id: 'final', label: '🎓 期末综合检测' }
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setTestType(type.id)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px solid',
                      borderColor: testType === type.id ? '#3b82f6' : 'rgba(255,255,255,0.08)',
                      background: testType === type.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                      color: testType === type.id ? '#60a5fa' : '#9ca3af',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '13px',
                      transition: 'all 0.2s'
                    }}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              {testType === 'unit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', color: '#9ca3af' }}>选择要测试的单元章节：</label>
                  {chaptersLoading ? (
                    <div style={{ padding: '12px', color: '#9ca3af', fontSize: '13px' }}>正在加载课本大纲...</div>
                  ) : chapters.length === 0 ? (
                    <div style={{ padding: '12px', color: '#ef4444', fontSize: '13px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px' }}>
                      ⚠️ 暂无章节，请先去【学习地图】探索课本章节吧！
                    </div>
                  ) : (
                    <select
                      value={selectedChapterId}
                      onChange={e => setSelectedChapterId(e.target.value)}
                      style={{
                        padding: '12px',
                        background: '#1f2937',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: 'white',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {chapters.map(ch => (
                        <option key={ch.id} value={ch.id}>{ch.name} ({ch.difficulty})</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {testType === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', color: '#9ca3af' }}>请输入您想测试的具体知识点（可输入多个）：</label>
                  <textarea
                    value={customKnowledgePoints}
                    onChange={e => setCustomKnowledgePoints(e.target.value)}
                    placeholder="例如：一元二次方程、勾股定理的应用..."
                    rows={3}
                    style={{
                      padding: '12px',
                      background: '#1f2937',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: 'white',
                      outline: 'none',
                      resize: 'vertical',
                      fontSize: '13px'
                    }}
                  />
                </div>
              )}
            </div>

            {(() => {
              const guideInfo = getExamGuideAndButtonText();
              return (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(251, 191, 36, 0.04)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(251, 191, 36, 0.1)' }}>
                    <h4 style={{ margin: 0, color: '#fbbf24', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {guideInfo.title}
                    </h4>
                    <div style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: '1.7' }}>
                      {guideInfo.desc}
                    </div>
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={(testType === 'unit' && chapters.length === 0) || (testType === 'custom' && !customKnowledgePoints.trim())}
                    style={{
                      marginTop: 'auto',
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                      color: 'white',
                      border: 'none',
                      fontWeight: 'bold',
                      fontSize: '15px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                      transition: 'transform 0.2s',
                      opacity: ((testType === 'unit' && chapters.length === 0) || (testType === 'custom' && !customKnowledgePoints.trim())) ? 0.5 : 1
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    {guideInfo.btnText}
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {/* 2. 出题动画阶段 */}
        {stage === 'generating' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
            <div className="spinner" style={{ width: '50px', height: '50px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%' }}></div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fbbf24', textAlign: 'center', lineHeight: '1.4' }}>
              {generatingStatus}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>AI 组卷中，正在绘制严谨的辅助几何拓扑图，需 15-25 秒。</div>
          </div>
        )}

        {/* 3. 在线答题阶段 */}
        {stage === 'testing' && paper && (
          <div className="test-content-outer" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="test-content-inner" style={{ flex: 1, overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {questionBlocks.map((block, bIdx) => {
                const getBlockTitle = (type) => {
                  switch(type) {
                    case 'choice': return '选择题';
                    case 'judgment': return '判断题';
                    case 'blank': return '填空题';
                    case 'essay': return '解答/作图/应用题';
                    default: return '解答题';
                  }
                };
                
                return (
                  <div key={block.id}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#fbbf24', borderLeft: '4px solid #3b82f6', paddingLeft: '8px' }}>
                      {getBlockTitle(block.type)}（共 {block.questions.length} 题，每小题 {block.questions[0]?.score} 分，共 {block.score} 分）
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {block.questions.map((q) => (
                        <div key={q.id} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '13px', color: '#f3f4f6', fontWeight: 'bold' }}>
                              题 {q.id}.
                            </span>
                            <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                              {q.score} 分
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#f3f4f6', lineHeight: '1.6', marginBottom: '12px' }}>
                            {renderQuestionText(q.question)}
                          </div>
                          
                          {block.type === 'choice' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                              {q.options && q.options.map(opt => {
                                const optLetter = opt.trim().charAt(0).toUpperCase();
                                const isSelected = answers[q.id] === optLetter;
                                return (
                                  <button
                                    key={opt}
                                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: optLetter }))}
                                    style={{
                                      textAlign: 'left',
                                      padding: '10px 14px',
                                      borderRadius: '8px',
                                      border: '1px solid',
                                      borderColor: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                                      background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.01)',
                                      color: isSelected ? '#60a5fa' : '#d1d5db',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {block.type === 'judgment' && (
                            <div style={{ display: 'flex', gap: '12px' }}>
                              {['√', '×'].map(opt => {
                                const isSelected = answers[q.id] === opt;
                                return (
                                  <button
                                    key={opt}
                                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                    style={{
                                      flex: 1,
                                      padding: '10px 14px',
                                      borderRadius: '8px',
                                      border: '1px solid',
                                      borderColor: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                                      background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.01)',
                                      color: isSelected ? (opt === '√' ? '#10b981' : '#ef4444') : '#d1d5db',
                                      cursor: 'pointer',
                                      fontSize: '16px',
                                      fontWeight: 'bold',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {block.type === 'blank' && (
                            <input
                              type="text"
                              placeholder="在此处填写填空题最终答案"
                              value={answers[q.id] || ''}
                              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                              style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: '#1f2937',
                                color: '#f9fafb',
                                fontSize: '13px',
                                boxSizing: 'border-box',
                                outline: 'none'
                              }}
                            />
                          )}

                          {block.type === 'essay' && (
                            <textarea
                              placeholder="在此处写下你的解答过程、分析思路或作文..."
                              value={answers[q.id] || ''}
                              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                              rows={5}
                              style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: '#1f2937',
                                color: '#f9fafb',
                                fontSize: '13px',
                                resize: 'vertical',
                                boxSizing: 'border-box',
                                outline: 'none'
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleSubmitTest}
              className="no-print"
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '15px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              🎓 提交测试卷
            </button>
          </div>
        )}

        {/* 4. 批改动画阶段 */}
        {stage === 'grading' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
            <div className="spinner" style={{ width: '50px', height: '50px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#10b981', borderRadius: '50%' }}></div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#10b981', textAlign: 'center' }}>
              {gradingStatus}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>AI 阅卷老师正在逐道题检查答案并分析扣分依据，需 15-20 秒。</div>
          </div>
        )}

        {/* 5. 测试报告阶段 */}
        {stage === 'report' && report && (
          <div className="test-content-outer" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="test-content-inner" style={{ flex: 1, overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* 5.1 成绩卡片 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                background: getScoreRating(report.score).bg,
                padding: '20px',
                borderRadius: '20px',
                border: `1px solid ${getScoreRating(report.score).color}33`
              }}>
                <div style={{
                  width: '95px',
                  height: '95px',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.3)',
                  border: `3px solid ${getScoreRating(report.score).color}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  boxShadow: `0 0 15px ${getScoreRating(report.score).color}22`
                }}>
                  <span style={{ fontSize: '28px', fontWeight: 'bold', color: getScoreRating(report.score).color, lineHeight: 1 }}>
                    {report.score}
                  </span>
                  <span style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>分</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#f3f4f6' }}>曾小侠 的 150分制 测评报告</h3>
                    <span style={{ background: getScoreRating(report.score).color, color: 'white', fontSize: '10px', padding: '1px 6px', borderRadius: '6px', fontWeight: 'bold' }}>
                      {getScoreRating(report.score).label}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#d1d5db', lineHeight: '1.6', fontStyle: 'italic' }}>
                    “ {report.overallComment} ”
                  </p>
                </div>
              </div>

              {/* 5.2 逐题对比明细 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🔍 试卷逐题分析明细：
                </h4>
                
                {report.results.map((r, idx) => {
                  const isCorrect = r.score === r.maxScore;
                  const isZero = r.score === 0;
                  const isPartial = !isCorrect && !isZero;
                  
                  return (
                    <div key={r.id} style={{
                      background: 'rgba(255,255,255,0.01)',
                      padding: '16px',
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.04)',
                      position: 'relative'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 'bold' }}>
                          第 {idx + 1} 题 ({r.type === 'choice' ? '选择题' : r.type === 'blank' ? '填空题' : '解答题'})
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            color: isCorrect ? '#10b981' : isPartial ? '#3b82f6' : '#ef4444',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            background: isCorrect ? 'rgba(16,185,129,0.1)' : isPartial ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)',
                            padding: '2px 8px',
                            borderRadius: '8px'
                          }}>
                            {isCorrect ? '✅ 正确' : isPartial ? '⚠️ 部分给分' : '❌ 错误'} ({r.score}/{r.maxScore}分)
                          </span>
                          {!isCorrect && (
                            <button
                              onClick={() => handleMarkMistake(r)}
                              className="no-print"
                              disabled={markedMistakes[r.id]}
                              style={{
                                border: 'none',
                                background: markedMistakes[r.id] ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.15)',
                                color: markedMistakes[r.id] ? '#6b7280' : '#f87171',
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '8px',
                                cursor: markedMistakes[r.id] ? 'default' : 'pointer',
                                transition: 'all 0.15s'
                              }}
                            >
                              {markedMistakes[r.id] ? '已收录' : '🚩 错题入本'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 题目文本 */}
                      <div style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#f3f4f6', lineHeight: '1.5' }}>
                        {renderQuestionText(r.question)}
                      </div>

                      {/* 答题情况 */}
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', marginBottom: '10px', fontSize: '12px' }}>
                        <div style={{ marginBottom: '4px' }}>
                          <span style={{ color: '#9ca3af' }}>我的答卷：</span>
                          <span style={{ color: isCorrect ? '#10b981' : '#f87171', fontWeight: 'bold', whiteSpace: 'pre-wrap' }}>
                            {r.studentAnswer || '（空）'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#9ca3af' }}>标准解答：</span>
                          <span style={{ color: '#10b981', fontWeight: 'bold', whiteSpace: 'pre-wrap' }}>{r.standardAnswer}</span>
                        </div>
                      </div>

                      {/* 评语 */}
                      <div style={{ fontSize: '12px', color: '#60a5fa', marginBottom: '8px', background: 'rgba(59, 130, 246, 0.05)', padding: '8px 10px', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                        💬 <b>阅卷简评：</b>{r.comment}
                      </div>

                      {/* 详细解析 */}
                      <div style={{ fontSize: '12px', color: '#d1d5db', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        💡 <b>解题步骤及解析：</b>
                        <div style={{ marginTop: '4px' }}>
                          {renderQuestionText(r.explanation)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
               onClick={() => setStage('setup')}
               className="no-print"
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.1)',
                fontWeight: 'bold',
                fontSize: '15px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >
              🔄 重新开启测试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
