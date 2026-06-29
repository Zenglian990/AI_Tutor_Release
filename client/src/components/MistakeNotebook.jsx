import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { getApiUrl, authFetch, formatGrade } from '../store/useStore';
import { preprocessLatex } from '../utils/math';

export default function MistakeNotebook({ onClose, currentProfileId, onGuardAction, defaultGrade, defaultSubject }) {
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterGrade, setFilterGrade] = useState(defaultGrade || '');
  const [filterSubject, setFilterSubject] = useState(defaultSubject || '');
  const [searchWord, setSearchWord] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [variations, setVariations] = useState({});
  const [variationSolutions, setVariationSolutions] = useState({});
  const [studentAnswers, setStudentAnswers] = useState({});
  const [variationFeedbacks, setVariationFeedbacks] = useState({});
  const [generatingVarId, setGeneratingVarId] = useState(null);
  const [gradingVarId, setGradingVarId] = useState(null);
  const [filterTag, setFilterTag] = useState('');
  const [editingTagsId, setEditingTagsId] = useState(null);
  const [tempTags, setTempTags] = useState('');

  const handleSaveTags = async (mistakeId) => {
    try {
      const res = await authFetch(`/api/mistakes/${mistakeId}/tags?profile_id=${currentProfileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: tempTags })
      });
      const data = await res.json();
      if (res.ok) {
        setMistakes(prev => prev.map(m => m.id === mistakeId ? { ...m, tags: data.tags } : m));
        setEditingTagsId(null);
      } else {
        alert(data.error || '保存标签失败');
      }
    } catch (e) {
      alert('网络错误');
    }
  };

  useEffect(() => {
    authFetch(`/api/mistakes?profile_id=${currentProfileId}`)
      .then(res => res.json())
      .then(data => {
        setMistakes(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentProfileId]);

  const filtered = mistakes.filter(m => {
    if (filterGrade) {
      const mGrade = String(m.grade);
      const fGrade = String(filterGrade);
      if (mGrade !== fGrade) {
        const mBase = mGrade.split('_')[0];
        const fBase = fGrade.split('_')[0];
        if (mBase !== fBase) return false;
      }
    }
    if (filterSubject && m.subject !== filterSubject) return false;
    if (filterTag) {
      const mTags = m.tags ? m.tags.split(',').map(t => t.trim().toLowerCase()) : [];
      if (!mTags.includes(filterTag.toLowerCase())) return false;
    }
    if (searchWord && !m.query.includes(searchWord) && (!m.answer || !m.answer.includes(searchWord))) return false;
    if (showReviewOnly) {
      if (!m.next_review_date) return false;
      if (new Date(m.next_review_date) > new Date()) return false;
    }
    return true;
  });

  const allTags = Array.from(new Set(mistakes.flatMap(m => m.tags ? m.tags.split(',').map(t => t.trim()).filter(Boolean) : [])));

  const handlePrint = () => window.print();

  const handleGenerateVariation = async (mistake) => {
    setGeneratingVarId(mistake.id);
    try {
      const res = await authFetch('/api/generate-variation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mistake.query, answer: mistake.answer, grade: mistake.grade })
      });
      const data = await res.json();
      if (res.ok) {
        setVariations(prev => ({ ...prev, [mistake.id]: data.variation }));
        setVariationSolutions(prev => ({ ...prev, [mistake.id]: data.solution }));
        setStudentAnswers(prev => ({ ...prev, [mistake.id]: '' }));
        setVariationFeedbacks(prev => { const next = { ...prev }; delete next[mistake.id]; return next; });
      } else {
        alert(data.error || '生成变式题失败');
      }
    } catch (e) {
      alert('网络错误，请稍后再试');
    } finally {
      setGeneratingVarId(null);
    }
  };

  const handleSubmitVariationAnswer = async (mistake) => {
    const answer = studentAnswers[mistake.id];
    if (!answer?.trim()) return;
    setGradingVarId(mistake.id);
    try {
      const res = await authFetch('/api/grade-variation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: variations[mistake.id],
          solution: variationSolutions[mistake.id],
          student_answer: answer,
          grade: mistake.grade,
          subject: mistake.subject
        })
      });
      const data = await res.json();
      if (res.ok) {
        setVariationFeedbacks(prev => ({ ...prev, [mistake.id]: data.feedback }));
      } else {
        alert(data.error || '批改失败');
      }
    } catch (e) {
      alert('网络错误');
    } finally {
      setGradingVarId(null);
    }
  };

  const handleDeleteMistake = (id) => {
    onGuardAction(async () => {
      try {
        const res = await authFetch(`/api/mistakes/${id}?profile_id=${currentProfileId}`, { method: 'DELETE' });
        if (res.ok) {
          setMistakes(prev => prev.filter(m => m.id !== id));
        } else {
          alert('删除失败');
        }
      } catch (e) {
        alert('网络错误');
      }
    }, '删除错题记录');
  };

  return (
    <div className="mistake-overlay">
      <div className={`mistake-modal ${testMode ? 'print-mode' : ''}`}>
        <div className="mistake-header no-print">
          <h2>📚 专属错题本</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="mistake-btn" onClick={() => setShowReviewOnly(!showReviewOnly)} style={{ borderColor: showReviewOnly ? '#a78bfa' : 'var(--accent-color)', color: showReviewOnly ? '#a78bfa' : 'var(--accent-color)' }}>
              {showReviewOnly ? '📅 全部错题' : '⏰ 艾宾浩斯复习推送'}
            </button>
            <button className="mistake-btn" onClick={() => setTestMode(!testMode)}>
              {testMode ? '👁️ 显示答案' : '📝 生成复习卷'}
            </button>
            <button className="mistake-btn" onClick={handlePrint}>🖨️ 打印</button>
            <button onClick={onClose} className="close-btn" title="关闭">×</button>
          </div>
        </div>

        <div className="mistake-filters no-print" style={{ padding: '15px 20px 0', display: 'flex', gap: '10px' }}>
          <select className="grade-selector" value={filterGrade} onChange={e => setFilterGrade(e.target.value)}>
            <option value="">全部年级</option>
            {['1_up','1_down','2_up','2_down','3_up','3_down','4_up','4_down','5_up','5_down','6_up','6_down','7_up','7_down','8_up','8_down','9_up','9_down'].map(g =>
              <option key={g} value={g}>{formatGrade(g)}</option>
            )}
          </select>
          <select className="grade-selector" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option value="">全部学科</option>
            {['语文','数学','英语','物理','化学','生物','历史','地理','道德与法治'].map(s =>
              <option key={s} value={s}>{s === '道德与法治' ? '道法' : s}</option>
            )}
          </select>
          <select className="grade-selector" value={filterTag} onChange={e => setFilterTag(e.target.value)}>
            <option value="">全部标签</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="搜索题目或知识点关键字..."
            value={searchWord}
            onChange={e => setSearchWord(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none' }}
          />
        </div>

        <div className="mistake-content">
          {loading ? (
            <div className="loading-text">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-text">目前还没有记录哦，继续加油！</div>
          ) : (
            filtered.map(m => (
              <div key={m.id} className="mistake-item">
                <div className="mistake-meta no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <span className="grade-tag">{formatGrade(m.grade)} {m.subject && m.subject !== 'unknown' ? m.subject : ''}</span>
                    <span className="time-tag">{new Date(m.timestamp).toLocaleString()}</span>
                    
                    {editingTagsId === m.id ? (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={tempTags}
                          onChange={e => setTempTags(e.target.value)}
                          placeholder="标签以逗号分隔"
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            background: 'rgba(0,0,0,0.5)',
                            color: '#fff',
                            fontSize: '0.75rem',
                            outline: 'none',
                            width: '120px'
                          }}
                        />
                        <button
                          onClick={() => handleSaveTags(m.id)}
                          style={{
                            padding: '2px 8px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingTagsId(null)}
                          style={{
                            padding: '2px 8px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        {m.tags ? m.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                          <span key={tag} style={{
                            padding: '2px 6px',
                            borderRadius: '10px',
                            background: 'rgba(167, 139, 250, 0.15)',
                            border: '1px solid rgba(167, 139, 250, 0.3)',
                            color: '#c084fc',
                            fontSize: '0.7rem',
                            fontWeight: '500'
                          }}>
                            #{tag}
                          </span>
                        )) : (
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', fontStyle: 'italic' }}>无标签</span>
                        )}
                        <button
                          onClick={() => {
                            setEditingTagsId(m.id);
                            setTempTags(m.tags || '');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#a78bfa',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            textDecoration: 'underline',
                            padding: 0,
                            marginLeft: '4px'
                          }}
                        >
                          🏷️ 编辑
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleDeleteMistake(m.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }} title="删除错题">🗑️ 删除</button>
                </div>
                <div className="mistake-query"><strong>问题：</strong>{m.query}</div>
                {!testMode ? (
                  <div className="mistake-answer">
                    <strong>解析：</strong>
                    <div className="md-content">
                      <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{preprocessLatex(m.answer)}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="test-blank-space" style={{ height: '150px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '8px', marginTop: '15px' }}></div>
                )}
                {!testMode && (
                  <div className="mistake-actions no-print" style={{ marginTop: '10px' }}>
                    <button
                      onClick={() => handleGenerateVariation(m)}
                      disabled={generatingVarId === m.id}
                      style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer' }}
                    >
                      {generatingVarId === m.id ? '⏳ 正在生成变式题...' : (variations[m.id] ? '🔄 换一题' : '🔄 举一反三')}
                    </button>
                    {variations[m.id] && (
                      <div className="mistake-variation" style={{ marginTop: '24px', padding: '24px', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))', border: '1px solid rgba(96, 165, 250, 0.2)', borderLeft: '5px solid #3b82f6', borderRadius: '16px', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(10px)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '14px', color: '#60a5fa', fontSize: '1.05rem', textShadow: '0 0 10px rgba(96,165,250,0.2)' }}>🎯 变式提优挑战</div>
                        <div className="md-content">
                          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{preprocessLatex(variations[m.id])}</ReactMarkdown>
                        </div>
                        {!variationFeedbacks[m.id] && (
                          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <textarea
                              placeholder="✍️ 请在这里写下你的解答步骤和答案..."
                              value={studentAnswers[m.id] || ''}
                              onChange={e => setStudentAnswers(prev => ({ ...prev, [m.id]: e.target.value }))}
                              style={{ width: '100%', minHeight: '120px', padding: '14px', borderRadius: '12px', background: 'rgba(0,0,0,0.4)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.15)', outline: 'none', resize: 'vertical', fontSize: '0.95rem', lineHeight: '1.6' }}
                            />
                            <button
                              onClick={() => handleSubmitVariationAnswer(m)}
                              disabled={gradingVarId === m.id || !studentAnswers[m.id]?.trim()}
                              style={{ alignSelf: 'flex-end', padding: '10px 24px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.9rem', cursor: (gradingVarId === m.id || !studentAnswers[m.id]?.trim()) ? 'not-allowed' : 'pointer', opacity: (gradingVarId === m.id || !studentAnswers[m.id]?.trim()) ? 0.5 : 1 }}
                            >
                              {gradingVarId === m.id ? '⚡ 正在深度批改中...' : '🚀 提交给 AI 老师批改'}
                            </button>
                          </div>
                        )}
                        {variationFeedbacks[m.id] && (
                          <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(4, 120, 87, 0.18))', border: '1px solid rgba(16, 185, 129, 0.25)', borderLeft: '5px solid #10b981', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '12px', color: '#10b981', fontSize: '1.02rem' }}>👨‍🏫 专属AI私教点评：</div>
                            <div className="md-content">
                              <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{preprocessLatex(variationFeedbacks[m.id])}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
