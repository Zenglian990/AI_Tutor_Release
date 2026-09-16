import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { getApiUrl, authFetch } from '../store/useStore';
import { compressImage } from '../utils/image';
import { enhanceDocumentFile } from '../utils/documentEnhancer';
import { preprocessLatex } from '../utils/math';
import A4PrintModal from './A4PrintModal';

/**
 * Robust Client-Side JSON Recovery Safeguard
 * In case network proxy or legacy fallback returns embedded JSON inside standardAnswer
 */
function recoverJsonIfEmbedded(data) {
  if (!data || !Array.isArray(data.results) || data.results.length !== 1) return data;
  const single = data.results[0];
  const ans = typeof single.standardAnswer === 'string' ? single.standardAnswer.trim() : '';

  if (ans.includes('"results"') || ans.includes('results:')) {
    try {
      const clean = ans.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const first = clean.indexOf('{');
      const last = clean.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        const jsonStr = clean.substring(first, last + 1);
        const repaired = jsonStr
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/\\(?:([^"\\/bfnrtu])|([bft][a-zA-Z]))/g, (m, p1, p2) => (p1 ? '\\\\' + p1 : '\\\\' + p2));
        const parsed = JSON.parse(repaired);
        if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
          const total = parsed.totalCount || parsed.results.length;
          const correct = parsed.correctCount ?? parsed.results.filter(r => r.status === 'correct').length;
          const wrong = parsed.wrongCount ?? parsed.results.filter(r => r.status === 'wrong').length;
          return {
            ...data,
            totalCount: total,
            correctCount: correct,
            wrongCount: wrong,
            accuracyPct: parsed.accuracyPct ?? Math.round((correct / Math.max(1, total)) * 100),
            summaryHeadline: parsed.summaryHeadline || data.summaryHeadline,
            teacherPraise: parsed.teacherPraise || data.teacherPraise,
            teacherAdvice: parsed.teacherAdvice || data.teacherAdvice,
            results: parsed.results
          };
        }
      }
    } catch (e) {
      console.warn('[HomeworkBatch] Frontend recovery failed:', e);
    }
  }
  return data;
}

/**
 * Render Markdown + KaTeX safely without throwing
 */
function MathMarkdown({ content }) {
  if (!content) return <span style={{ color: '#94a3b8' }}>（空）</span>;
  return (
    <div className="math-markdown-container" style={{ lineHeight: '1.6', wordBreak: 'break-word' }}>
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
 * HomeworkBatchModal
 * 整页作业/整张试卷智能秒批与错题一键自动归档模态框
 */
export default function HomeworkBatchModal({
  isOpen,
  onClose,
  currentProfileId,
  grade = '7_up',
  subject = '数学',
  studentName = '曾练',
  onReviewMistakes
}) {
  if (!isOpen) return null;

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchResult, setBatchResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'wrong', 'correct'
  const [enableEnhancer, setEnableEnhancer] = useState(true);
  const [showA4Print, setShowA4Print] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg('');
    setBatchResult(null);
    setFilterTab('all');
  };

  const handleStartBatchGrade = async () => {
    if (!selectedFile) {
      setErrorMsg('请先拍照或上传整页作业图片');
      return;
    }

    setAnalyzing(true);
    setErrorMsg('');
    try {
      let fileToUpload = selectedFile;
      if (enableEnhancer) {
        try {
          fileToUpload = await enhanceDocumentFile(selectedFile);
        } catch (enhErr) {
          console.warn('[HomeworkBatch] Document enhancer warning:', enhErr);
        }
      }
      const compressed = await compressImage(fileToUpload);
      const formData = new FormData();
      formData.append('image', compressed);
      formData.append('profile_id', currentProfileId || 'default');
      formData.append('grade', grade);
      formData.append('subject', subject);
      formData.append('student_name', studentName);

      const res = await authFetch('/api/homework/batch-grade', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `批改失败 (状态码: ${res.status})`);
      }

      const result = await res.json();
      const processed = recoverJsonIfEmbedded(result);
      setBatchResult(processed);
      setFilterTab('all');
    } catch (err) {
      console.error('Batch grade error:', err);
      setErrorMsg(err.message || '网络连接超时，请重试');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setBatchResult(null);
    setErrorMsg('');
    setFilterTab('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredQuestions = (batchResult?.results || []).filter(q => {
    if (filterTab === 'wrong') return q.status === 'wrong' || q.status === 'partial';
    if (filterTab === 'correct') return q.status === 'correct';
    return true;
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.82)',
      backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-secondary, #1e293b)',
        color: 'var(--text-primary, #f8fafc)',
        width: '92%',
        maxWidth: '880px',
        maxHeight: '92vh',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.12)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(30, 41, 59, 0.95)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.8rem' }}>📑</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>
                整页作业/试卷多题秒级批改
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                学生：<strong>{studentName}</strong> · 学科：<strong>{subject}</strong> · AI 名师逐题审阅 · 公式级 LaTeX 渲染
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭窗口"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'background 0.2s'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {errorMsg && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '12px 16px',
              borderRadius: '12px',
              marginBottom: '18px',
              fontSize: '0.9rem'
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {!batchResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Upload Box */}
              <div
                onClick={() => !analyzing && fileInputRef.current?.click()}
                style={{
                  border: '2px dashed rgba(56, 189, 248, 0.45)',
                  borderRadius: '16px',
                  padding: previewUrl ? '16px' : '44px 20px',
                  textAlign: 'center',
                  background: 'rgba(15, 23, 42, 0.55)',
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  disabled={analyzing}
                />

                {previewUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <img
                      src={previewUrl}
                      alt="整页作业待批改"
                      style={{ maxHeight: '360px', maxWidth: '100%', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
                    />
                    <p style={{ marginTop: '12px', fontSize: '0.85rem', color: '#38bdf8' }}>
                      📸 已选取图片，点击可重新更换照片
                    </p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '3.2rem', marginBottom: '12px' }}>📷</div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: '#f1f5f9' }}>
                      点击拍照或上传整页作业 / 练习册 / 试卷
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                      支持清晰演算手迹、选择题、填空题与几何大题，特级名师将自动进行逐题定位判分
                    </p>
                  </div>
                )}
              </div>

              {/* Document Enhancer Switch */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'rgba(15, 23, 42, 0.55)',
                borderRadius: '12px',
                border: '1px solid rgba(56, 189, 248, 0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.2rem' }}>✨</span>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc' }}>
                      智能文档去阴影增强 (媲美作业帮/扫描全能王)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                      自动消除手机拍照阴影、提高字迹对比度、100%保留老师红笔批阅勾叉标记
                    </div>
                  </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={enableEnhancer}
                    onChange={(e) => setEnableEnhancer(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: enableEnhancer ? '#0284c7' : '#334155',
                    transition: '.3s',
                    borderRadius: '24px'
                  }}>
                    <span style={{
                      position: 'absolute',
                      height: '18px',
                      width: '18px',
                      left: enableEnhancer ? '23px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      transition: '.3s',
                      borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                {previewUrl && (
                  <button
                    onClick={handleReset}
                    disabled={analyzing}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: 'none',
                      color: '#cbd5e1',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    重新上传
                  </button>
                )}
                <button
                  onClick={handleStartBatchGrade}
                  disabled={!selectedFile || analyzing}
                  style={{
                    background: analyzing ? '#0284c7' : 'linear-gradient(135deg, #0284c7, #2563eb)',
                    border: 'none',
                    color: '#fff',
                    padding: '12px 28px',
                    borderRadius: '10px',
                    cursor: analyzing ? 'wait' : 'pointer',
                    fontWeight: 700,
                    fontSize: '1rem',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {analyzing ? (
                    <>
                      <span className="dot" style={{ animation: 'pulse 1s infinite' }}>⏳</span>
                      <span>AI 特级名师正在逐题严密审阅批改中...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>开始整页智能批改</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Results View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Summary Dashboard Banner */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.85))',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ maxWidth: '60%' }}>
                    <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600, letterSpacing: '0.5px' }}>
                      【{subject}】整卷智能诊断报告
                    </span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', color: '#fff', lineHeight: 1.4 }}>
                      {batchResult.summaryHeadline}
                    </h4>
                  </div>
                  {/* Score Pills */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '8px 14px', borderRadius: '12px', textAlign: 'center', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#7dd3fc' }}>识别题数</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#38bdf8' }}>{batchResult.totalCount || batchResult.results?.length || 0}</div>
                    </div>
                    <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '8px 14px', borderRadius: '12px', textAlign: 'center', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6ee7b7' }}>答对题目</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#34d399' }}>{batchResult.correctCount} 道</div>
                    </div>
                    <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '8px 14px', borderRadius: '12px', textAlign: 'center', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#fca5a5' }}>待订正</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f87171' }}>{batchResult.wrongCount} 道</div>
                    </div>
                    <div style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '8px 14px', borderRadius: '12px', textAlign: 'center', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#d8b4fe' }}>正确率</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#c084fc' }}>{batchResult.accuracyPct}%</div>
                    </div>
                  </div>
                </div>

                {batchResult.autoArchivedCount > 0 && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '0.88rem',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    <span>📥 已自动将本次发现的 <strong>{batchResult.autoArchivedCount}</strong> 道失分题归档进抗遗忘错题本！</span>
                    {onReviewMistakes && (
                      <button
                        onClick={() => { onClose(); onReviewMistakes(); }}
                        style={{
                          background: '#d97706',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                          boxShadow: '0 2px 6px rgba(217, 119, 6, 0.4)'
                        }}
                      >
                        去错题本强化变式 →
                      </button>
                    )}
                  </div>
                )}

                {/* A4 Paper Generation Quick Banner */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.15), rgba(16, 185, 129, 0.08))',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '0.88rem',
                  color: '#6ee7b7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🖨️</span>
                    <span>
                      {batchResult.wrongCount > 0
                        ? <>推荐生成 <strong>A4 空白复测卷</strong>，隐藏答案与老师红笔痕迹，让孩子在纸上真实动笔彻底搞懂！</>
                        : <>恭喜全对！可一键生成 <strong>A4 纸质留存/巩固微测卷</strong> 备战期末。</>}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowA4Print(true)}
                    style={{
                      background: 'linear-gradient(135deg, #059669, #10b981)',
                      color: '#fff',
                      border: 'none',
                      padding: '7px 16px',
                      borderRadius: '8px',
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      fontWeight: 700,
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>🖨️</span>
                    <span>生成 A4 空白复测卷 ({batchResult.wrongCount > 0 ? `重点练错题 ${batchResult.wrongCount} 道` : '全卷重练'})</span>
                  </button>
                </div>

                <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6', background: 'rgba(0, 0, 0, 0.25)', padding: '12px 16px', borderRadius: '10px' }}>
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>🌟 名师寄语：</span>
                    {batchResult.teacherPraise}
                  </div>
                  <div>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>💡 考点锦囊：</span>
                    {batchResult.teacherAdvice}
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#f1f5f9', fontWeight: 700 }}>
                  逐题详析与批注清单：
                </h4>
                <div style={{ display: 'flex', gap: '6px', background: 'rgba(15, 23, 42, 0.5)', padding: '3px', borderRadius: '10px' }}>
                  <button
                    onClick={() => setFilterTab('all')}
                    style={{
                      background: filterTab === 'all' ? '#2563eb' : 'transparent',
                      color: filterTab === 'all' ? '#fff' : '#94a3b8',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    全部 ({batchResult.results?.length || 0})
                  </button>
                  <button
                    onClick={() => setFilterTab('wrong')}
                    style={{
                      background: filterTab === 'wrong' ? '#ef4444' : 'transparent',
                      color: filterTab === 'wrong' ? '#fff' : '#94a3b8',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    需订正 ({batchResult.wrongCount || 0})
                  </button>
                  <button
                    onClick={() => setFilterTab('correct')}
                    style={{
                      background: filterTab === 'correct' ? '#10b981' : 'transparent',
                      color: filterTab === 'correct' ? '#fff' : '#94a3b8',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    正确 ({batchResult.correctCount || 0})
                  </button>
                </div>
              </div>

              {/* Question By Question List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {filteredQuestions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.3)', borderRadius: '12px' }}>
                    当前分类下暂无题目
                  </div>
                ) : (
                  filteredQuestions.map((q, idx) => (
                    <div key={idx} style={{
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: `1px solid ${q.status === 'correct' ? 'rgba(16, 185, 129, 0.35)' : (q.status === 'wrong' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)')}`,
                      borderRadius: '14px',
                      padding: '16px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}>
                      {/* Question Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            fontSize: '0.85rem',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            background: q.status === 'correct' ? 'rgba(16, 185, 129, 0.2)' : (q.status === 'wrong' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'),
                            color: q.status === 'correct' ? '#34d399' : (q.status === 'wrong' ? '#f87171' : '#fbbf24'),
                            border: `1px solid ${q.status === 'correct' ? 'rgba(16, 185, 129, 0.4)' : (q.status === 'wrong' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)')}`,
                            fontWeight: 700
                          }}>
                            {q.status === 'correct' ? '✓ 正确' : (q.status === 'wrong' ? '✕ 需订正' : '~ 步骤分')}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc' }}>
                            第 {q.questionNumber || (idx + 1)} 题
                            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500, marginLeft: '6px' }}>
                              ({q.type || '试题'})
                            </span>
                          </span>
                        </div>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.05)',
                          color: q.status === 'correct' ? '#34d399' : (q.status === 'wrong' ? '#f87171' : '#fbbf24')
                        }}>
                          得分：{q.score ?? (q.status === 'correct' ? 10 : 0)} / {q.maxScore || 10} 分
                        </span>
                      </div>

                      {/* Question Stem / Snippet */}
                      <div style={{
                        fontSize: '0.95rem',
                        color: '#f1f5f9',
                        lineHeight: '1.5',
                        background: 'rgba(255, 255, 255, 0.03)',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        borderLeft: '3px solid #38bdf8'
                      }}>
                        <span style={{ color: '#38bdf8', fontWeight: 600, marginRight: '6px' }}>题目考点：</span>
                        <MathMarkdown content={q.questionSnippet} />
                      </div>

                      {/* Side by side / stacked Answer Comparison */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '12px'
                      }}>
                        {/* Student Answer */}
                        <div style={{
                          background: 'rgba(0, 0, 0, 0.25)',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                            ✍️ 学生卷面作答
                          </div>
                          <div style={{ color: '#f1f5f9', fontSize: '0.92rem' }}>
                            <MathMarkdown content={q.studentAnswer || '卷面未作答 / 留白'} />
                          </div>
                        </div>

                        {/* Standard Answer */}
                        <div style={{
                          background: 'rgba(16, 185, 129, 0.08)',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}>
                          <div style={{ fontSize: '0.8rem', color: '#6ee7b7', fontWeight: 600, marginBottom: '4px' }}>
                            🎯 名师标准答案与推导
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: '0.92rem' }}>
                            <MathMarkdown content={q.standardAnswer} />
                          </div>
                        </div>
                      </div>

                      {/* Mistake Diagnosis */}
                      {q.mistakeReason && (
                        <div style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          borderLeft: '3px solid #ef4444',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          fontSize: '0.9rem'
                        }}>
                          <span style={{ color: '#f87171', fontWeight: 600, marginRight: '6px' }}>⚠️ 错因剖析：</span>
                          <span style={{ color: '#fca5a5' }}><MathMarkdown content={q.mistakeReason} /></span>
                        </div>
                      )}

                      {/* Key Insight */}
                      {q.keyInsight && (
                        <div style={{
                          background: 'rgba(56, 189, 248, 0.08)',
                          borderLeft: '3px solid #0284c7',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          fontSize: '0.9rem'
                        }}>
                          <span style={{ color: '#38bdf8', fontWeight: 600, marginRight: '6px' }}>💡 题眼穿透与心法：</span>
                          <span style={{ color: '#bae6fd' }}><MathMarkdown content={q.keyInsight} /></span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Action Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowA4Print(true)}
                  style={{
                    background: 'rgba(16, 185, 129, 0.18)',
                    border: '1px solid rgba(16, 185, 129, 0.45)',
                    color: '#34d399',
                    padding: '10px 20px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>🖨️</span>
                  <span>A4 纸质复测卷 ({batchResult.wrongCount > 0 ? `错题 ${batchResult.wrongCount} 道` : '全卷'})</span>
                </button>
                {batchResult.wrongCount > 0 && onReviewMistakes && (
                  <button
                    onClick={() => { onClose(); onReviewMistakes(); }}
                    style={{
                      background: 'rgba(245, 158, 11, 0.2)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: '#fbbf24',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    前往错题本攻坚 ({batchResult.wrongCount}) →
                  </button>
                )}
                <button
                  onClick={handleReset}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  批改下一张作业 📷
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* A4 Clean Paper & Answer Key Generator Modal */}
      {showA4Print && (
        <A4PrintModal
          isOpen={showA4Print}
          onClose={() => setShowA4Print(false)}
          studentName={studentName}
          grade={grade}
          subject={subject}
          questions={(batchResult?.results || []).map((r, idx) => ({
            id: idx + 1,
            questionNumber: r.questionNumber || (idx + 1),
            title: `第 ${r.questionNumber || (idx + 1)} 题 (${r.type || '试题'})`,
            body: r.questionSnippet || `题目 #${r.questionNumber || (idx + 1)}`,
            score: r.maxScore || 10,
            status: r.status,
            standardAnswer: r.standardAnswer,
            keyInsight: r.keyInsight,
            mistakeReason: r.mistakeReason,
            studentAnswer: r.studentAnswer
          }))}
          initialMode="blank_student"
          initialFilter={batchResult?.wrongCount > 0 ? 'wrong_only' : 'all'}
        />
      )}
    </div>
  );
}
