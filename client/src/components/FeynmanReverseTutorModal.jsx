import React, { useState, useEffect, useRef } from 'react';

/**
 * FeynmanReverseTutorModal
 * 费曼以教代学反向伴学台
 * 核心心理机制：角色互换，学生当老师，虚拟同桌“小明”当好学求教的学生
 * 激活学习科学金字塔顶端 90% 知识留存率
 */
export default function FeynmanReverseTutorModal({
  isOpen,
  question = '解方程 2x + 4 = 10，并求出未知数 x 的值。',
  studentName = '曾练',
  subject = '数学',
  grade = '7_up',
  onClose,
  onApplyFollowUpToChat
}) {
  const [explanation, setExplanation] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [speechError, setSpeechError] = useState('');

  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setExplanation('');
      setEvaluationResult(null);
      setIsRecording(false);
      setSpeechError('');
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    }
  }, [isOpen]);

  // Speech Recognition support
  const handleToggleRecord = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setIsRecording(false);
      return;
    }

    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) {
      setSpeechError('当前浏览器不支持端侧语音识别，请直接在下方打字输入哦~');
      return;
    }

    try {
      const recognizer = new SpeechClass();
      recognizer.lang = 'zh-CN';
      recognizer.continuous = true;
      recognizer.interimResults = true;

      recognizer.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setExplanation(prev => {
          // If previous exists and is not end with punctuation
          return transcript;
        });
      };

      recognizer.onerror = (event) => {
        console.warn('[Feynman STT Error]:', event.error);
        setIsRecording(false);
      };

      recognizer.onend = () => {
        setIsRecording(false);
      };

      recognizer.start();
      recognitionRef.current = recognizer;
      setIsRecording(true);
      setSpeechError('');
    } catch (err) {
      console.warn('[Feynman STT Init Failed]:', err);
      setSpeechError('语音启动受阻，请直接打字输入。');
      setIsRecording(false);
    }
  };

  const handleEvaluate = async () => {
    if (!explanation.trim()) return;
    setEvaluating(true);

    try {
      const res = await fetch('/api/feynman/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          student_explanation: explanation,
          student_name: studentName,
          subject,
          grade
        })
      });

      const json = await res.json();
      if (json.success && json.data) {
        setEvaluationResult(json.data);
      }
    } catch (err) {
      console.error('[Feynman Eval Error]:', err);
    } finally {
      setEvaluating(false);
    }
  };

  const handleSendToChat = () => {
    if (evaluationResult && evaluationResult.follow_up_question) {
      const prompt = `老师，我在费曼以教代学中给小明讲解了这道题：\n- 我的讲解口述：“${explanation}”\n- 小明向我追问：【${evaluationResult.follow_up_question}】\n请教名师：对于小明提出的这个深层卡点，我应该如何用最严谨且生动的语言给他彻底讲透？`;
      onApplyFollowUpToChat && onApplyFollowUpToChat(prompt);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '720px',
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
          color: '#fff', padding: '18px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.8rem' }}>🎓</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800' }}>
                费曼以教代学 · 小老师讲题台
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#e0f2fe', marginTop: '2px' }}>
                讲给虚拟同桌小明听 · 能讲透才是真正的顶尖掌握！
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Question Display Banner */}
          <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#64748b', marginBottom: '4px' }}>
              🎯 当前要讲的题目：
            </div>
            <div style={{ fontSize: '0.95rem', color: '#1e293b', fontWeight: '600', lineHeight: '1.5' }}>
              {question}
            </div>
          </div>

          {/* Xiao Ming's initial invitation */}
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '16px',
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <span style={{ fontSize: '2rem' }}>👦</span>
            <div style={{ fontSize: '0.88rem', color: '#1e40af', lineHeight: '1.5' }}>
              <strong>同桌小明：</strong>“{studentName}老师！这道题我看了半天没想通，你能不能用自己的话，从第一步开始讲给我听听呀？我会认真听的！”
            </div>
          </div>

          {/* Explanation Textarea & Voice input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>
                🎙️ 你的解题讲解（说话自动转文字，也可直接打字）：
              </label>
              <button
                type="button"
                onClick={handleToggleRecord}
                style={{
                  background: isRecording ? '#ef4444' : '#0284c7',
                  color: '#fff', border: 'none', borderRadius: '20px',
                  padding: '4px 14px', fontSize: '0.8rem', fontWeight: '700',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <span>{isRecording ? '⏹️ 停止录音' : '🎤 开始语音讲题'}</span>
              </button>
            </div>

            {speechError && (
              <div style={{ fontSize: '0.78rem', color: '#e11d48' }}>{speechError}</div>
            )}

            <textarea
              rows={4}
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              placeholder="你可以这样讲：'小明你看，这道题首先我们要观察...因为...所以第一步把常数项移到右边...'"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '12px',
                border: isRecording ? '2px solid #0284c7' : '1px solid #cbd5e1',
                fontSize: '0.92rem', lineHeight: '1.5', outline: 'none',
                boxShadow: isRecording ? '0 0 10px rgba(2, 132, 199, 0.25)' : 'none'
              }}
            />
          </div>

          {/* Submit button */}
          {!evaluationResult && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={handleEvaluate}
                disabled={evaluating || !explanation.trim()}
                style={{
                  background: explanation.trim() ? 'linear-gradient(135deg, #0284c7, #2563eb)' : '#cbd5e1',
                  color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '12px',
                  fontWeight: '700', fontSize: '0.95rem', cursor: explanation.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <span>{evaluating ? '⚡ 小明正在认真思考...' : '👦 讲完啦！看看小明听懂没'}</span>
              </button>
            </div>
          )}

          {/* Evaluation Result View */}
          {evaluationResult && (
            <div style={{
              background: '#f8fafc', border: '2px solid #38bdf8', borderRadius: '18px',
              padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px'
            }}>
              {/* Score & Stars Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.8rem' }}>⭐</span>
                  <div>
                    <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0369a1' }}>
                      费曼掌握度：{evaluationResult.mastery_score} 分
                    </div>
                    <div style={{ color: '#f59e0b', fontSize: '0.9rem' }}>
                      {'★'.repeat(evaluationResult.stars) + '☆'.repeat(5 - evaluationResult.stars)}
                      <span style={{ color: '#64748b', fontSize: '0.78rem', marginLeft: '6px' }}>
                        ({evaluationResult.logic_rating})
                      </span>
                    </div>
                  </div>
                </div>

                {evaluationResult.key_points_covered.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {evaluationResult.key_points_covered.map((k, i) => (
                      <span key={i} style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700' }}>
                        ✓ {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Xiao Ming's Feedback */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '2rem' }}>👦</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '0.92rem', color: '#1e293b', fontWeight: '600', lineHeight: '1.5' }}>
                      {evaluationResult.peer_reply}
                    </div>
                    {evaluationResult.follow_up_question && (
                      <div style={{
                        background: '#fef3c7', border: '1px solid #fde047', borderRadius: '10px',
                        padding: '10px 12px', fontSize: '0.88rem', color: '#854d0e', marginTop: '6px'
                      }}>
                        <strong>❓ 小明好奇反问（装不懂求教）：</strong>
                        <div style={{ marginTop: '2px' }}>{evaluationResult.follow_up_question}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Mentor Praise Banner */}
              <div style={{ fontSize: '0.82rem', color: '#059669', fontWeight: '600' }}>
                🏆 <strong>名师点评：</strong>{evaluationResult.praise}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEvaluationResult(null)}
                  style={{
                    background: '#f1f5f9', color: '#475569', border: 'none',
                    padding: '8px 16px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer'
                  }}
                >
                  🔄 再讲一遍
                </button>
                <button
                  type="button"
                  onClick={handleSendToChat}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '10px',
                    fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <span>💬</span>
                  <span>带入课堂向名师请教小明的追问</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
