import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useStore';
import mermaid from 'mermaid';

// 初始化 Mermaid 图表渲染器
try {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark', // 暗色主题，更契合我们玻璃面板的夜空感
    useMaxWidth: false,
    securityLevel: 'loose',
    flowchart: {
      htmlLabels: false,
      padding: 12
    }
  });
} catch (e) {
  console.warn("Mermaid init error:", e);
}

const sanitizeMermaid = (code) => {
  if (typeof code !== 'string') return code;

  // 1. Clean math delimiters in the entire code block first
  let cleanedCode = code
    .replace(/\\\[/g, '') // remove \[
    .replace(/\\\]/g, '') // remove \]
    .replace(/\\\(/g, '') // remove \(
    .replace(/\\\)/g, '') // remove \)
    .replace(/\$/g, '')   // remove $
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pi/g, 'π')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\pm/g, '±')
    .replace(/\\ne/g, '≠')
    .replace(/\\angle/g, '∠');

  // Helper to clean remaining quotes/backslashes inside labels
  const cleanLabel = (label, fallback) => {
    const cleaned = label
      .replace(/\\/g, '') // strip remaining backslashes
      .replace(/"/g, '')  // strip double quotes entirely to prevent inner nesting conflict
      .trim();
    // If the label becomes empty after cleaning, use the node ID as fallback
    // In Mermaid, an empty label like A("") or A[""] crashes the parser.
    return cleaned === '' ? fallback : cleaned;
  };

  // Match node definitions:
  // 1. Match ID((...)) and safely downgrade to ID("...") to prevent lexical/parse errors in Mermaid
  let sanitized = cleanedCode.replace(/([a-zA-Z0-9_-]+)\s*\(\(([^)\r\n]*)\)\)/g, (match, id, label) => {
    return `${id}("${cleanLabel(label, id)}")`;
  });

  // 2. Match ID(...)
  sanitized = sanitized.replace(/([a-zA-Z0-9_-]+)\s*\(([^)\r\n]*)\)/g, (match, id, label) => {
    if (label.startsWith('"') && label.endsWith('"')) return match;
    if (label.startsWith('(') && label.endsWith(')')) return match;
    return `${id}("${cleanLabel(label, id)}")`;
  });

  // 3. Match ID[...]
  sanitized = sanitized.replace(/([a-zA-Z0-9_-]+)\s*\[([^\]\r\n]*)\]/g, (match, id, label) => {
    return `${id}["${cleanLabel(label, id)}"]`;
  });

  return sanitized;
};

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
        
      mermaid.render(id, cleaned).then((result) => {
        setSvg(result.svg);
      }).catch(err => {
        setError(err.message);
      });
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
  
  // UI 阶段状态: 'setup' | 'generating' | 'testing' | 'grading' | 'report'
  const [stage, setStage] = useState('setup'); 
  const [testType, setTestType] = useState('unit'); // 'unit' | 'midterm' | 'final'
  
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
      authFetch(`/api/chapters?grade=${currentGrade}&subject=${selectedSubject}&edition=${currentEdition || ''}`)
        .then(res => res.json())
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
          edition: currentEdition
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

  // 150分制评级
  const getScoreRating = (score) => {
    if (score >= 135) return { label: '👑 优秀 (特等奖)', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    if (score >= 90) return { label: '⭐ 及格 (通过)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
    return { label: '🔥 需努力', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
  };

  // 按真题类型分类
  const getGroupedQuestions = () => {
    if (!paper) return { choices: [], blanks: [], essays: [] };
    return {
      choices: paper.questions.filter(q => q.type === 'choice'),
      blanks: paper.questions.filter(q => q.type === 'blank'),
      essays: paper.questions.filter(q => q.type === 'essay')
    };
  };

  const { choices, blanks, essays } = getGroupedQuestions();

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
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
                {getGradeName(currentGrade)} · {selectedSubject} （考试时间：120分钟  满分：150分）
              </p>
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
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(251, 191, 36, 0.04)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(251, 191, 36, 0.1)' }}>
              <h4 style={{ margin: 0, color: '#fbbf24', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📋 本卷信息与作答指南（依照中考题型格式出题）：
              </h4>
              <div style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: '1.7' }}>
                • <b>一、选择题（第1-5题，共40分）：</b>包含平方根、几何角度、平移象限等，每小题 8 分，只有一个正确选项。<br />
                • <b>二、填空题（第6-8题，共24分）：</b>包含有理数绝对值化简、不等式整数解等，每小题 8 分，直接输入最终结果。<br />
                • <b>三、解答题（第9-11题，共86分）：</b>第 9 题（20分）为计算题；第 10 题（26分）为几何证明填空，需要在证明步骤的横线上补齐结论或定理根据；第 11 题（40分）为直方图/折线图或学科综合应用题。
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={testType === 'unit' && chapters.length === 0}
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
                opacity: (testType === 'unit' && chapters.length === 0) ? 0.5 : 1
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              🚀 依据中考格式出题
            </button>
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
              
              {/* 3.1 一、选择题 */}
              {choices.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#fbbf24', borderLeft: '4px solid #3b82f6', paddingLeft: '8px' }}>
                    一、选择题（单选，每小题 8 分，共 40 分）
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {choices.map((q, idx) => (
                      <div key={q.id} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <div style={{ fontSize: '13px', color: '#f3f4f6', lineHeight: '1.6', marginBottom: '10px' }}>
                          <b>第 {idx + 1} 题.</b> {renderQuestionText(q.question)}
                        </div>
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
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3.2 二、填空题 */}
              {blanks.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#fbbf24', borderLeft: '4px solid #3b82f6', paddingLeft: '8px' }}>
                    二、填空题（每小题 8 分，共 24 分）
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {blanks.map((q, idx) => (
                      <div key={q.id} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <div style={{ fontSize: '13px', color: '#f3f4f6', lineHeight: '1.6', marginBottom: '10px' }}>
                          <b>第 {choices.length + idx + 1} 题.</b> {renderQuestionText(q.question)}
                        </div>
                        <input
                          type="text"
                          placeholder="在此处填写填空题最终答案（如具体数值或表达式）"
                          value={answers[q.id] || ''}
                          onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: '#1f2937',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3.3 三、解答题 */}
              {essays.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#fbbf24', borderLeft: '4px solid #3b82f6', paddingLeft: '8px' }}>
                    三、解答题（共 86 分，请写出必要的解答或证明步骤）
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {essays.map((q, idx) => (
                      <div key={q.id} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span style={{ fontSize: '13px', color: '#f3f4f6', fontWeight: 'bold' }}>
                            第 {choices.length + blanks.length + idx + 1} 题. {q.id === 9 ? '计算与分析题' : q.id === 10 ? '几何证明与逻辑填空题' : '综合实际应用题'}
                          </span>
                          <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                            {q.score} 分
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '12px' }}>
                          {renderQuestionText(q.question)}
                        </div>
                        <textarea
                          placeholder={q.id === 10 ? "请在此横向输入对应横线 ______ 处的推导结论或几何定理依据（如：1. ∠1；2. 平行公理）..." : "请详细写出你的计算核心公式、推导过程、答题结论（AI 阅卷官会按你的解题步骤给分）..."}
                          rows={6}
                          value={answers[q.id] || ''}
                          onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: '#1f2937',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '13px',
                            outline: 'none',
                            resize: 'none',
                            fontFamily: 'inherit',
                            lineHeight: '1.6'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
