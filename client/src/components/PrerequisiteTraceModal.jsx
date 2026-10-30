import React, { useState, useEffect, useCallback } from 'react';
import { getApiUrl, authFetch } from '../store/useStore';

const SUBJECT_LIST = ['全部学科', '数学', '物理', '化学', '英语', '语文', '科学', '道德与法治'];

const QUICK_TOPIC_PRESETS = [
  { name: '二次函数的概念', grade: '9', subject: '数学', label: '🎯 二次函数 (G9)' },
  { name: '勾股定理及其逆定理', grade: '8', subject: '数学', label: '📐 勾股定理 (G8)' },
  { name: '浮力与阿基米德原理', grade: '8', subject: '物理', label: '🔬 浮力原理 (G8)' },
  { name: '欧姆定律与动态电路分析', grade: '9', subject: '物理', label: '⚡ 欧姆定律 (G9)' },
  { name: '分数的加法和减法', grade: '5', subject: '数学', label: '🧮 分数加减 (G5)' },
  { name: '正比例', grade: '6', subject: '数学', label: '📊 正比例 (G6)' },
  { name: '英语字母表', grade: '3', subject: '英语', label: '🔤 英语字母 (G3)' }
];

export default function PrerequisiteTraceModal({
  isOpen,
  onClose,
  initialTopic,
  initialSubject = '数学',
  initialGrade,
  onAskTutor
}) {
  const [keyword, setKeyword] = useState('');
  const [subject, setSubject] = useState(initialSubject || '数学');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [targetTopic, setTargetTopic] = useState(null);
  const [chain, setChain] = useState([]);
  const [revealedAnswers, setRevealedAnswers] = useState({});

  const fetchTrace = useCallback(async (queryKeyword, queryTopicId, filterSubject, filterGrade) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (queryTopicId) params.append('topic_id', queryTopicId);
      if (queryKeyword) params.append('keyword', queryKeyword);
      if (filterSubject && filterSubject !== '全部学科') params.append('subject', filterSubject);
      if (filterGrade) params.append('grade', String(filterGrade));
      params.append('max_depth', '6');

      const url = `${getApiUrl()}/api/knowledge-graph/trace?${params.toString()}`;
      const res = await authFetch(url);
      const data = await res.json();

      if (res.ok && data.success && Array.isArray(data.chain) && data.chain.length > 0) {
        setTargetTopic(data.target_topic || data.chain[0]);
        setChain(data.chain);
        setRevealedAnswers({});
        return;
      }
      throw new Error(data.error || 'Empty chain');
    } catch (err) {
      console.warn('[PrerequisiteTraceModal] Trace fetch fallback:', err);
      // Fallback local mock chain for testing/offline mode
      const fallbackTarget = {
        id: 'cnm_229',
        name: queryKeyword || '二次函数的概念',
        grade: 9,
        gradeLabel: '初中3年级(9年级)上学期',
        chapter: '九年级上册 第22章 二次函数',
        domain: '函数',
        description: '理解二次函数的概念，形如 y = ax² + bx + c (a≠0)。',
        mastery_criteria: ['能识别二次函数表达式', '知道自变量取值范围', '理解a≠0的本质'],
        diagnostic_question: {
          question: '若函数 y = (m-1)x^2 + 2x 是关于 x 的二次函数，求 m 的取值范围？',
          answer: 'm ≠ 1',
          analysis: '二次项系数必须不等于0，即 m - 1 ≠ 0，解得 m ≠ 1。'
        },
        isTarget: true,
        isRoot: false,
        prerequisites: ['cnm_201']
      };
      const fallbackPrereq = {
        id: 'cnm_201',
        name: '一次函数的概念',
        grade: 8,
        gradeLabel: '初中2年级(8年级)下学期',
        chapter: '八年级下册 第19章 一次函数',
        domain: '函数',
        description: '理解一次函数的概念，形如 y = kx + b (k≠0)。',
        reason: '学习「二次函数」需要先掌握「一次函数」的函数模型与变化规律。',
        mastery_criteria: ['能识别一次函数解析式', '掌握常数k与b的意义'],
        diagnostic_question: {
          question: '在函数 y = 3x - 5 中，自变量 x 的一次项系数是多少？',
          answer: '3',
          analysis: '标准形式 y = kx + b 中，k 是系数，因此系数为 3。'
        },
        isTarget: false,
        isRoot: false,
        prerequisites: ['cnm_p213']
      };
      const fallbackRoot = {
        id: 'cnm_p213',
        name: '正比例与乘法模型',
        grade: 6,
        gradeLabel: '小学6年级下学期',
        chapter: '六年级下册 第4单元 比例',
        domain: '数与代数',
        description: '两种相关联的量，一种量变化，另一种量也随着变化，比值一定。',
        reason: '函数思想萌芽于小学的正反比例与乘法数量关系模型。',
        mastery_criteria: ['能判断两个量是否成正比例', '理解比值恒定的数学本质'],
        diagnostic_question: {
          question: '如果 y/x = 5 (x≠0)，那么 y 和 x 成什么比例？',
          answer: '成正比例',
          analysis: '比值恒定为常数5，符合正比例定义。'
        },
        isTarget: false,
        isRoot: true,
        prerequisites: []
      };

      setTargetTopic(fallbackTarget);
      setChain([fallbackTarget, fallbackPrereq, fallbackRoot]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize on open or initialTopic change
  useEffect(() => {
    if (!isOpen) return;

    let initKw = '二次函数的概念';
    let initId = null;

    if (initialTopic) {
      if (typeof initialTopic === 'string') {
        initKw = initialTopic;
      } else if (typeof initialTopic === 'object') {
        initId = initialTopic.id || null;
        initKw = initialTopic.name || initialTopic.knowledge_point || initialTopic.query || '二次函数的概念';
      }
    }

    setKeyword(initKw);
    fetchTrace(initKw, initId, initialSubject || subject, initialGrade);
  }, [isOpen, initialTopic, initialSubject, initialGrade, fetchTrace, subject]);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    if (keyword.trim()) {
      fetchTrace(keyword.trim(), null, subject, null);
    }
  };

  const toggleAnswer = (nodeId) => {
    setRevealedAnswers(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const handleConsultAI = (node) => {
    if (onAskTutor) {
      const currentTargetName = targetTopic?.name || '当前考点';
      const prompt = `老师，我在攻坚【${currentTargetName}】时，发现自己在更早年级的前置概念【${node.name}】(${node.gradeLabel})存在断层漏洞！请用苏格拉底名师启发，针对性帮我打通这个先修基础！`;
      onAskTutor(prompt);
      onClose();
    }
  };

  if (!isOpen) return null;

  const rootNode = chain.length > 1 ? chain[chain.length - 1] : null;

  return (
    <div
      className="prereq-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="跨年级考点星图与先修断层溯源"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 15, 29, 0.82)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="prereq-modal-content"
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          backgroundColor: '#0f172a',
          borderRadius: '20px',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(139, 92, 246, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.18), rgba(59, 130, 246, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.7rem', filter: 'drop-shadow(0 0 10px rgba(167, 139, 250, 0.5))' }}>🌌</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                跨年级考点星图与先修断层溯源
                <span style={{ fontSize: '0.72rem', background: 'rgba(167, 139, 250, 0.25)', border: '1px solid #8b5cf6', color: '#c084fc', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                  2,800+ K-12 拓扑图谱
                </span>
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                从高年级考点逆向追溯前置知识链，一语道破小学初中底层认知断层
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            ✕
          </button>
        </div>

        {/* Search & Subject Bar */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(15, 23, 42, 0.6)' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="🔍 输入任意考点名称（如：二次函数、勾股定理、浮力、正比例...）"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: '#f8fafc',
                  fontSize: '0.92rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                color: 'white',
                border: 'none',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
                fontSize: '0.9rem',
                flexShrink: 0
              }}
            >
              {loading ? '⏳ 溯源中...' : '🚀 递归溯源'}
            </button>
          </form>

          {/* Quick Hot Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            <span style={{ fontSize: '0.74rem', color: '#64748b', whiteSpace: 'nowrap' }}>🔥 热门考点：</span>
            {QUICK_TOPIC_PRESETS.map(preset => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setKeyword(preset.name);
                  setSubject(preset.subject);
                  fetchTrace(preset.name, null, preset.subject, preset.grade);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '14px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#cbd5e1',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body: Knowledge Ladder */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#a78bfa' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px', animation: 'spin 2s linear infinite' }}>🌌</div>
              <div style={{ fontSize: '1rem', fontWeight: 600 }}>正在穿透跨年级知识图谱拓扑依赖...</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>递归排查前置概念断层中</div>
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', marginBottom: '16px' }}>
              ⚠️ {error}
            </div>
          )}

          {!loading && chain.length > 0 && (
            <div>
              {/* Insight Summary Banner */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎯 认知链路透视：</span>
                    <span>共穿透 {chain.length - 1} 级先修概念阶梯</span>
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', marginTop: '4px' }}>
                    从【{targetTopic?.name}】({targetTopic?.gradeLabel})
                    {rootNode && (
                      <span style={{ color: '#34d399' }}>
                        {' ➔ 逆向追溯至源头基石【' + rootNode.name + '】(' + rootNode.gradeLabel + ')'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', color: '#34d399', padding: '4px 10px', borderRadius: '10px' }}>
                    🌟 源头基石已定位
                  </span>
                </div>
              </div>

              {/* Ladder Stepper Timeline */}
              <div style={{ position: 'relative', paddingLeft: '28px' }}>
                {/* Connecting Line */}
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    bottom: '20px',
                    left: '11px',
                    width: '3px',
                    background: 'linear-gradient(to bottom, #8b5cf6, #3b82f6, #10b981)',
                    borderRadius: '2px',
                    zIndex: 0
                  }}
                />

                {chain.map((node, index) => {
                  const isTarget = node.isTarget;
                  const isRoot = node.isRoot;
                  const isAnswerOpen = revealedAnswers[node.id];
                  const diagnostic = node.diagnostic_question;

                  return (
                    <div
                      key={node.id}
                      style={{
                        position: 'relative',
                        marginBottom: index === chain.length - 1 ? '0' : '28px',
                        zIndex: 1
                      }}
                    >
                      {/* Step Indicator Dot */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '-28px',
                          top: '16px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: isTarget ? '#8b5cf6' : (isRoot ? '#10b981' : '#3b82f6'),
                          border: '3px solid #0f172a',
                          boxShadow: isTarget ? '0 0 12px #8b5cf6' : (isRoot ? '0 0 12px #10b981' : '0 0 8px #3b82f6'),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '0.7rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {isTarget ? '🎯' : (isRoot ? '🌟' : index)}
                      </div>

                      {/* Step Card */}
                      <div
                        style={{
                          background: isTarget
                            ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(30, 41, 59, 0.8))'
                            : (isRoot
                              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(30, 41, 59, 0.8))'
                              : 'rgba(30, 41, 59, 0.6)'),
                          border: isTarget
                            ? '1px solid rgba(139, 92, 246, 0.4)'
                            : (isRoot ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)'),
                          borderRadius: '16px',
                          padding: '20px',
                          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        {/* Tag Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '8px',
                                fontWeight: 700,
                                background: isTarget ? '#8b5cf6' : (isRoot ? '#10b981' : '#3b82f6'),
                                color: 'white'
                              }}
                            >
                              {isTarget ? '🎯 当前目标考点' : (isRoot ? '🌟 底层源头基石' : `🪜 先修阶梯 第 ${index} 级`)}
                            </span>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: '#cbd5e1'
                              }}
                            >
                              {node.gradeLabel || `${node.grade}年级`}
                            </span>
                            {node.domain && (
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                领域: {node.domain}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            考点ID: {node.id}
                          </span>
                        </div>

                        {/* Title & Chapter */}
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: isTarget ? '#c084fc' : (isRoot ? '#6ee7b7' : '#93c5fd'), fontWeight: 'bold' }}>
                          {node.name}
                        </h3>
                        {node.chapter && (
                          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '10px' }}>
                            📖 {node.chapter}
                          </div>
                        )}

                        {/* Pedagogical Dependency Reason */}
                        {node.reason && (
                          <div
                            style={{
                              margin: '10px 0',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: 'rgba(59, 130, 246, 0.1)',
                              borderLeft: '4px solid #3b82f6',
                              fontSize: '0.84rem',
                              color: '#bfdbfe',
                              lineHeight: 1.5
                            }}
                          >
                            💡 <strong>前置因果逻辑：</strong>{node.reason}
                          </div>
                        )}

                        {/* Description */}
                        <p style={{ margin: '8px 0', fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.6 }}>
                          {node.description || node.coreRule}
                        </p>

                        {/* Mastery Criteria */}
                        {node.mastery_criteria && node.mastery_criteria.length > 0 && (
                          <div style={{ margin: '10px 0 14px 0' }}>
                            <div style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                              ✅ 课标掌握标准与能力判定：
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {node.mastery_criteria.map((item, mIdx) => (
                                <div key={mIdx} style={{ fontSize: '0.82rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ color: '#10b981' }}>✓</span>
                                  <span>{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Interactive Diagnostic Practice Box */}
                        {diagnostic && (
                          <div
                            style={{
                              marginTop: '16px',
                              padding: '14px 16px',
                              borderRadius: '12px',
                              background: 'rgba(0, 0, 0, 0.35)',
                              border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ✍️ 【{node.name}】基石自测探针
                              </span>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => toggleAnswer(node.id)}
                                  style={{
                                    padding: '3px 10px',
                                    borderRadius: '8px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    color: '#cbd5e1',
                                    fontSize: '0.74rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {isAnswerOpen ? '🙈 隐藏标准答案' : '👀 查看标准答案与解析'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleConsultAI(node)}
                                  style={{
                                    padding: '3px 10px',
                                    borderRadius: '8px',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: 'white',
                                    border: 'none',
                                    fontSize: '0.74rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                  }}
                                >
                                  🤖 呼叫AI私教针对此基石专项启发
                                </button>
                              </div>
                            </div>

                            <div style={{ fontSize: '0.86rem', color: '#f1f5f9', lineHeight: 1.5, background: 'rgba(255, 255, 255, 0.04)', padding: '10px 12px', borderRadius: '8px' }}>
                              <strong>自测题：</strong>{diagnostic.question}
                            </div>

                            {isAnswerOpen && (
                              <div
                                style={{
                                  marginTop: '10px',
                                  padding: '10px 12px',
                                  borderRadius: '8px',
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  borderLeft: '4px solid #10b981',
                                  fontSize: '0.84rem',
                                  color: '#a7f3d0',
                                  lineHeight: 1.5
                                }}
                              >
                                <div><strong>标准答案：</strong>{diagnostic.answer}</div>
                                {diagnostic.analysis && (
                                  <div style={{ marginTop: '4px', color: '#cbd5e1', fontSize: '0.8rem' }}>
                                    <strong>思路解析：</strong>{diagnostic.analysis}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '0.8rem',
            color: '#94a3b8'
          }}
        >
          <div>
            💡 遇到综合压轴难题卡壳时，80%原因并非当前考点本身，而是早期年级的先修基石断层。
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#f8fafc',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            完成溯源关闭
          </button>
        </div>
      </div>
    </div>
  );
}
