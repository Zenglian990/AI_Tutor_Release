import React, { useState, useRef } from 'react';
import { getApiUrl, authFetch } from '../store/useStore';
import { compressImage } from '../utils/image';

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
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg('');
    setBatchResult(null);
  };

  const handleStartBatchGrade = async () => {
    if (!selectedFile) {
      setErrorMsg('请先拍照或上传整页作业图片');
      return;
    }

    setAnalyzing(true);
    setErrorMsg('');
    try {
      const compressed = await compressImage(selectedFile);
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
      setBatchResult(result);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-secondary, #1e293b)',
        color: 'var(--text-primary, #f8fafc)',
        width: '92%',
        maxWidth: '860px',
        maxHeight: '90vh',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(30, 41, 59, 0.8)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.8rem' }}>📑</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>
                整页作业/试卷多题秒级批改
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                学生：{studentName} · 学科：{subject} · 自动切片定位 · 错题一键归档艾宾浩斯库
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '4px 8px'
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
              borderRadius: '10px',
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
                  border: '2px dashed rgba(56, 189, 248, 0.4)',
                  borderRadius: '16px',
                  padding: previewUrl ? '16px' : '40px 20px',
                  textAlign: 'center',
                  background: 'rgba(15, 23, 42, 0.5)',
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
                    <p style={{ marginTop: '12px', fontSize: '0.85rem', color: '#94a3b8' }}>
                      点击图片可更换照片
                    </p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📷</div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#f1f5f9' }}>
                      点击拍照或上传整页作业/练习册/试卷
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                      支持竖排、横排手写运算与几何作图，名师将自动识别所有题号并逐题判断
                    </p>
                  </div>
                )}
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
                      <span>名师正在逐题严密审阅批改中...</span>
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
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.8))',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>批改诊断结果</span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', color: '#fff' }}>
                      {batchResult.summaryHeadline}
                    </h4>
                  </div>
                  {/* Score Pills */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px 14px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6ee7b7' }}>答对题目</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#34d399' }}>{batchResult.correctCount} 道</div>
                    </div>
                    <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '6px 14px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#fca5a5' }}>失分错题</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f87171' }}>{batchResult.wrongCount} 道</div>
                    </div>
                    <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '6px 14px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#bae6fd' }}>正确率</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#38bdf8' }}>{batchResult.accuracyPct}%</div>
                    </div>
                  </div>
                </div>

                {batchResult.autoArchivedCount > 0 && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>📥 已自动将本次发现的 <strong>{batchResult.autoArchivedCount}</strong> 道错题录入艾宾浩斯抗遗忘错题本！</span>
                    {onReviewMistakes && (
                      <button
                        onClick={() => { onClose(); onReviewMistakes(); }}
                        style={{
                          background: '#d97706',
                          color: '#fff',
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        去错题本复盘 →
                      </button>
                    )}
                  </div>
                )}

                <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                  <div>🌟 <strong>教师寄语</strong>：{batchResult.teacherPraise}</div>
                  <div style={{ marginTop: '4px' }}>💡 <strong>考点锦囊</strong>：{batchResult.teacherAdvice}</div>
                </div>
              </div>

              {/* Question By Question List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: '8px 0 0 0', fontSize: '1rem', color: '#94a3b8' }}>
                  逐题判分与批注详情 ({batchResult.results?.length || 0} 题)：
                </h4>

                {batchResult.results?.map((q, idx) => (
                  <div key={idx} style={{
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: `1px solid ${q.status === 'correct' ? 'rgba(16, 185, 129, 0.4)' : (q.status === 'wrong' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)')}`,
                    borderRadius: '14px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          fontSize: '1.2rem',
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: q.status === 'correct' ? '#10b981' : (q.status === 'wrong' ? '#ef4444' : '#f59e0b'),
                          color: '#fff',
                          fontWeight: 'bold'
                        }}>
                          {q.status === 'correct' ? '✓' : (q.status === 'wrong' ? '✕' : '~')}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc' }}>
                          第 {q.questionNumber || (idx + 1)} 题 ({q.type || '常规题'})
                        </span>
                      </div>
                      <span style={{
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        color: q.status === 'correct' ? '#34d399' : (q.status === 'wrong' ? '#f87171' : '#fbbf24')
                      }}>
                        得分：{q.score} / {q.maxScore || 10} 分
                      </span>
                    </div>

                    <div style={{ fontSize: '0.95rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                      <strong>题目要点：</strong>{q.questionSnippet}
                    </div>

                    <div style={{
                      background: 'rgba(0,0,0,0.2)',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <div><span style={{ color: '#94a3b8' }}>卷面作答：</span><span style={{ color: '#f1f5f9' }}>{q.studentAnswer || '无作答'}</span></div>
                      <div><span style={{ color: '#94a3b8' }}>标准答案：</span><span style={{ color: '#34d399' }}>{q.standardAnswer}</span></div>
                      {q.mistakeReason && (
                        <div><span style={{ color: '#f87171' }}>错因剖析：</span><span style={{ color: '#fca5a5' }}>{q.mistakeReason}</span></div>
                      )}
                      {q.keyInsight && (
                        <div><span style={{ color: '#38bdf8' }}>题眼穿透：</span><span style={{ color: '#bae6fd' }}>{q.keyInsight}</span></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Finish Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  onClick={handleReset}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  批改下一张作业 📷
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
