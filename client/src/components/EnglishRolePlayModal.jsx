import React, { useState } from 'react';
import { authFetch } from '../store/useStore';

/**
 * EnglishRolePlayModal
 * 1-12 年级全学段真实 AI 英语情景对练与语法精准诊断台
 * - 小学 (1-6)：启蒙交际场景与自然拼读表达
 * - 初中 (7-9)：中考英语听说情景应答与人机对练
 * - 高中 (10-12)：新高考英语思辨对话与学术交流
 * - 全程对接后端 /api/english/roleplay（无可用 AI Key 时明示使用本地基础语法核验，绝不对病句盲打高分，也绝不在麦克风失败时偷填标准答案）
 */
function parseGradeNum(grade) {
  if (!grade) return 7;
  const m = String(grade).match(/^(1[0-2]|[1-9])/);
  return m ? parseInt(m[1], 10) : 7;
}

function getStageScenarios(grade) {
  const num = parseGradeNum(grade);
  if (num >= 10) {
    return {
      stageTitle: '新高考英语思辨情景对练与精准语法诊断',
      stageSubtitle: '真实 AI 外教多轮交锋 · 逐句语法/时态/搭配纠错 · 冲击高考英语高分表达',
      stageExamName: '新高考英语听说与读后续写',
      scenarios: [
        {
          id: 'ai_ethics',
          title: '🤖 科技与 AI 伦理研讨 (AI Ethics Seminar)',
          roleSarah: 'Dr. Sarah (Seminar Chair)',
          roleStudent: 'High School Delegate (高中代表)',
          dialogues: [
            {
              partner: 'Welcome to our youth seminar on AI ethics. In your view, should high school students use generative AI for essay drafting?',
              partnerZh: '欢迎来到青少年 AI 伦理研讨会。在你看来，高中生应该使用生成式 AI 起草作文吗？',
              prompt: 'I believe AI can serve as a brainstorming tool, provided that students keep their own critical thinking.',
              promptZh: '我认为只要学生保持独立批判性思维，AI 可以作为头脑风暴的辅助工具。',
              keywords: ['believe', 'tool', 'critical', 'thinking']
            },
            {
              partner: 'That is a balanced view. How could schools design assignments to encourage originality rather than simple copying?',
              partnerZh: '这是一个很平衡的观点。学校该如何设计作业以鼓励原创而非简单照搬？',
              prompt: 'Teachers could require oral defenses or draft reflections so that we demonstrate genuine understanding.',
              promptZh: '老师可以要求口头答辩或草稿反思，以证明我们真正理解了内容。',
              keywords: ['require', 'oral', 'reflections', 'understanding']
            }
          ]
        },
        {
          id: 'library_research',
          title: '📚 学术图书馆课题查阅 (Academic Research)',
          roleSarah: 'Sarah (Academic Librarian)',
          roleStudent: 'Research Student (课题学生)',
          dialogues: [
            {
              partner: 'Good afternoon! Are you working on your term research paper? What topic are you investigating?',
              partnerZh: '下午好！你在准备学期研究论文吗？你在调研什么主题？',
              prompt: 'Yes, I am looking for peer-reviewed articles on renewable energy and urban sustainability.',
              promptZh: '是的，我正在寻找关于可再生能源与城市可持续发展的同行评审文献。',
              keywords: ['looking', 'articles', 'renewable', 'energy']
            },
            {
              partner: 'We have several recent journals in the digital archive. Would you like guidance on citation formats as well?',
              partnerZh: '数字档案库里有几份最新期刊。你还需要引用格式方面的指导吗？',
              prompt: 'That would be very helpful, especially regarding how to cite online academic sources accurately.',
              promptZh: '那会非常有帮助，尤其是如何准确引用在线学术资料。',
              keywords: ['helpful', 'cite', 'academic', 'sources']
            }
          ]
        }
      ]
    };
  }

  if (num <= 6) {
    return {
      stageTitle: '小学英语趣味情景对话与句子诊断台',
      stageSubtitle: '趣味卡通情景互动 · 真实句型拼写检查 · 轻松开口说英语',
      stageExamName: '小学英语日常交际口语',
      scenarios: [
        {
          id: 'classroom',
          title: '🏫 校园交朋友 (Making Friends)',
          roleSarah: 'Miss Sarah (English Teacher)',
          roleStudent: 'Primary Student (小学生)',
          dialogues: [
            {
              partner: 'Hello! Nice to meet you! What is your favourite subject at school?',
              partnerZh: '你好！很高兴认识你！你在学校最喜欢什么科目？',
              prompt: 'Nice to meet you too! My favourite subject is English.',
              promptZh: '我也很高兴认识你！我最喜欢的科目是英语。',
              keywords: ['nice', 'meet', 'favourite', 'english']
            },
            {
              partner: 'Wonderful! What do you usually do after school?',
              partnerZh: '太棒了！你放学后通常做什么呢？',
              prompt: 'I usually read storybooks and play football with my friends.',
              promptZh: '我通常读故事书并和朋友们踢足球。',
              keywords: ['usually', 'read', 'play', 'friends']
            }
          ]
        },
        {
          id: 'fruit_shop',
          title: '🍎 水果店购物 (At the Fruit Shop)',
          roleSarah: 'Sarah (Shopkeeper)',
          roleStudent: 'Little Customer (小顾客)',
          dialogues: [
            {
              partner: 'Welcome to my fruit shop! What would you like today?',
              partnerZh: '欢迎来到我的水果店！今天想买点什么？',
              prompt: 'I would like three red apples and two bananas, please.',
              promptZh: '请给我三个红苹果和两根香蕉。',
              keywords: ['would', 'like', 'apples', 'bananas']
            }
          ]
        }
      ]
    };
  }

  return {
    stageTitle: '中考英语听说情景对练与语法精准诊断',
    stageSubtitle: '真实 AI 情景应答 · 语法/时态/主谓一致核验 · 突破中考人机听说高分',
    stageExamName: '中考英语听说人机对话',
    scenarios: [
      {
        id: 'library',
        title: '📚 图书馆借书与查阅 (At the Library)',
        roleSarah: 'Librarian (图书管理员)',
        roleStudent: 'Student Reader (借阅学生)',
        dialogues: [
          {
            partner: 'Good afternoon! Welcome to the school library. How can I help you today?',
            partnerZh: '下午好！欢迎来到校图书馆，今天有什么我可以帮你的吗？',
            prompt: 'Excuse me, I am looking for a book about world history.',
            promptZh: '打扰一下，我正在找一本关于世界历史的书。',
            keywords: ['excuse', 'looking', 'world', 'history']
          },
          {
            partner: 'World history is on the second floor, Section B. How long would you like to borrow it?',
            partnerZh: '世界历史类书籍在二楼B区。你想借多长时间呢？',
            prompt: 'Can I keep it for two weeks? I need it for my project.',
            promptZh: '我可以借两周吗？我的课程课题需要它。',
            keywords: ['keep', 'weeks', 'need', 'project']
          }
        ]
      },
      {
        id: 'directions',
        title: '🗺️ 校园问路与指引 (Asking for Directions)',
        roleSarah: 'Sarah (School Guide)',
        roleStudent: 'New Student (新生)',
        dialogues: [
          {
            partner: 'Hi there! You look a bit lost. Are you looking for a specific classroom?',
            partnerZh: '嗨！你看上去有点迷路了，你在找具体的某间教室吗？',
            prompt: 'Pardon me, could you please tell me where the science lab is?',
            promptZh: '打扰一下，请问你能告诉我科学实验室在哪里吗？',
            keywords: ['pardon', 'please', 'where', 'science', 'lab']
          },
          {
            partner: 'Just walk straight past the playground and turn left at the art building. It is on the third floor!',
            partnerZh: '直走穿过操场，在艺术楼左拐，就在三楼！',
            prompt: 'Thank you so much for your kind help! Have a great day!',
            promptZh: '太感谢你的热心帮助了！祝你今天过得愉快！',
            keywords: ['thank', 'kind', 'help', 'great']
          }
        ]
      }
    ]
  };
}

export default function EnglishRolePlayModal({
  isOpen,
  onClose,
  onApplyToChat,
  currentGrade = '7_up'
}) {
  const stageConfig = getStageScenarios(currentGrade);
  const scenarios = stageConfig.scenarios;

  const [selectedScenarioIdx, setSelectedScenarioIdx] = useState(0);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [studentInput, setStudentInput] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState('');
  const [isGenerativeMode, setIsGenerativeMode] = useState(true);
  const [dynamicTurns, setDynamicTurns] = useState([]);
  const [isGeneratingTurn, setIsGeneratingTurn] = useState(false);

  if (!isOpen) return null;

  const safeIdx = selectedScenarioIdx < scenarios.length ? selectedScenarioIdx : 0;
  const currentScenario = scenarios[safeIdx];
  const activeDialogue = (isGenerativeMode && dynamicTurns.length > 0)
    ? dynamicTurns[dynamicTurns.length - 1]
    : (currentScenario.dialogues[currentTurn] || currentScenario.dialogues[0]);

  const evaluateViaServer = async (rawText, inputMode = 'typed') => {
    const clean = String(rawText || '').trim();
    if (!clean) return;
    setIsGeneratingTurn(true);
    setMicError('');

    try {
      const historyPayload = dynamicTurns.slice(-4).flatMap(t => ([
        ...(t.studentSaid ? [{ role: 'user', text: t.studentSaid }] : []),
        { role: 'partner', text: t.partner }
      ]));

      const res = await authFetch('/api/english/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_text: clean,
          scenario_title: currentScenario.title,
          scenario_role: currentScenario.roleSarah,
          grade: currentGrade,
          history: historyPayload
        })
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || '英语评估服务暂不可用');
      }

      const d = payload.data;
      const spokenWords = clean.replace(/[^a-zA-Z'\s]/g, '').split(/\s+/).filter(Boolean);
      const hasIssues = Array.isArray(d.grammarIssues) && d.grammarIssues.length > 0;
      const scoredWords = spokenWords.map(w => ({
        word: w,
        status: hasIssues && d.score < 70 ? 'warn' : 'good',
        score: d.score
      }));

      setEvaluation({
        accuracy: d.score,
        modeLabel: inputMode === 'speech' ? '语音识别评估' : '文本语法评估（未录音不虚报发音流畅度）',
        grammarIssues: d.grammarIssues || [],
        correctedText: d.correctedText || '',
        words: scoredWords,
        tip: d.feedback,
        isFallback: Boolean(payload.isFallback || d.isFallback),
        fallbackNotice: payload.fallbackNotice || d.fallbackNotice || ''
      });

      if (isGenerativeMode) {
        setDynamicTurns(prev => [...prev, {
          studentSaid: clean,
          partner: d.reply,
          partnerZh: d.replyCn || '',
          prompt: d.correctedText || 'Continue the dialogue naturally in your own words.',
          promptZh: d.correctedText ? '参考地道改写句' : '请结合对方回应继续用英文自然表达',
          grammarTip: hasIssues ? d.grammarIssues.join(' ') : d.feedback
        }]);
        setCurrentTurn(prev => prev + 1);
        setStudentInput('');
      }
    } catch (err) {
      setMicError(err.message || '网络异常，无法完成英语语法评估，请稍后重试。');
    } finally {
      setIsGeneratingTurn(false);
    }
  };

  const handleSpeechRecognition = () => {
    setMicError('');
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setMicError('当前浏览器不支持原生英文语音识别，请直接在输入框中键入英文句子提交评估（绝不自动代填标准答案）。');
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      setIsRecording(true);
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        setIsRecording(false);
        if (transcript.trim()) {
          setStudentInput(transcript);
          evaluateViaServer(transcript, 'speech');
        }
      };
      recognition.onerror = (evt) => {
        setIsRecording(false);
        setMicError(`麦克风录音未成功（${evt?.error || '权限或设备不可用'}），请允许麦克风权限或直接输入英文作答。`);
      };
      recognition.onend = () => setIsRecording(false);
      recognition.start();
    } catch (e) {
      setIsRecording(false);
      setMicError('无法启动浏览器语音识别，请直接输入英文作答。');
    }
  };

  const handleNextTurn = () => {
    if (currentTurn + 1 < currentScenario.dialogues.length) {
      setCurrentTurn(prev => prev + 1);
      setStudentInput('');
      setEvaluation(null);
    } else {
      setCurrentTurn(0);
      setStudentInput('');
      setEvaluation(null);
    }
  };

  const handleSendToChat = () => {
    const text = `老师，我在英语情景口语台上演练了【${currentScenario.title}】：\n` +
      `对话上文：${activeDialogue.partner}\n` +
      `我的英文作答："${studentInput || activeDialogue.studentSaid || activeDialogue.prompt}"\n` +
      (evaluation ? `系统评估得分：${evaluation.accuracy} 分（${evaluation.tip}）。\n` : '') +
      `请问老师，针对【${stageConfig.stageExamName}】，如何避免中式英语语法失误，有哪些地道的高分表达替换？`;
    onApplyToChat && onApplyToChat(text);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '10px', boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: 'min(740px, calc(100vw - 20px))',
        maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box', color: '#1e293b'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: '#ffffff', padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🗣️</span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 'clamp(1rem, 3.5vw, 1.2rem)', fontWeight: 800, color: '#ffffff' }}>
                {stageConfig.stageTitle}
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#bfdbfe', marginTop: '2px' }}>
                {stageConfig.stageSubtitle}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭英语情景对练"
            style={{
              background: 'transparent', border: 'none', color: '#ffffff',
              fontSize: '1.4rem', cursor: 'pointer', padding: '4px', flexShrink: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Mode Switch & Scenario Selector */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {scenarios.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedScenarioIdx(idx); setCurrentTurn(0); setDynamicTurns([]); setEvaluation(null); setStudentInput(''); setMicError(''); }}
                  style={{
                    padding: '7px 12px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                    border: safeIdx === idx ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: safeIdx === idx ? '#eff6ff' : '#f8fafc',
                    color: safeIdx === idx ? '#1e40af' : '#475569'
                  }}
                >
                  {s.title}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
              <button
                type="button"
                onClick={() => setIsGenerativeMode(false)}
                style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 700,
                  background: !isGenerativeMode ? '#2563eb' : 'transparent',
                  color: !isGenerativeMode ? '#ffffff' : '#475569'
                }}
              >
                📖 经典剧本跟练
              </button>
              <button
                type="button"
                onClick={() => setIsGenerativeMode(true)}
                style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 700,
                  background: isGenerativeMode ? '#7c3aed' : 'transparent',
                  color: isGenerativeMode ? '#ffffff' : '#475569'
                }}
              >
                🤖 自由开放对话
              </button>
            </div>
          </div>

          {/* Partner Dialogue Bubble */}
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px',
            display: 'flex', gap: '12px', alignItems: 'flex-start'
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%', background: '#dbeafe',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0
            }}>
              👩‍🏫
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '0.88rem' }}>{currentScenario.roleSarah}</span>
                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                  {isGenerativeMode ? `开放对话 第 ${currentTurn + 1} 轮` : `第 ${currentTurn + 1} / ${currentScenario.dialogues.length} 轮`}
                </span>
              </div>
              <div style={{ fontSize: '1rem', color: '#0f172a', fontWeight: 600, lineHeight: '1.5' }}>
                "{activeDialogue.partner}"
              </div>
              {activeDialogue.partnerZh && (
                <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '4px' }}>
                  💡 译文：{activeDialogue.partnerZh}
                </div>
              )}
            </div>
          </div>

          {/* Student Response Card */}
          <div style={{
            background: '#ffffff', border: '2px dashed #93c5fd', borderRadius: '14px', padding: '14px',
            display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1d4ed8' }}>
                🎯 参考表达思路（可自主自由改写并提交语法诊断）：
              </span>
              {!isGenerativeMode && (
                <button
                  type="button"
                  onClick={() => setStudentInput(activeDialogue.prompt)}
                  style={{
                    background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                    padding: '3px 10px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  📋 填入参考句练习
                </button>
              )}
            </div>

            <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a' }}>
              "{activeDialogue.prompt}"
            </div>
            {activeDialogue.promptZh && (
              <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                💡 释义：{activeDialogue.promptZh}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
              <input
                type="text"
                placeholder="输入你的英文回答（系统将严格诊断语法、时态与冠词搭配）..."
                value={studentInput}
                onChange={e => setStudentInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && studentInput.trim() && !isGeneratingTurn) {
                    evaluateViaServer(studentInput, 'typed');
                  }
                }}
                style={{
                  flex: '1 1 220px', minWidth: 0, padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1',
                  fontSize: '0.9rem', color: '#0f172a', background: '#ffffff'
                }}
              />
              <button
                type="button"
                onClick={handleSpeechRecognition}
                disabled={isGeneratingTurn}
                style={{
                  background: isRecording ? '#ef4444' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '10px',
                  fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', flexShrink: 0
                }}
              >
                {isRecording ? '⏹️ 录音中...' : '🎙️ 语音输入'}
              </button>
              <button
                type="button"
                onClick={() => evaluateViaServer(studentInput, 'typed')}
                disabled={isGeneratingTurn || !studentInput.trim()}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '10px',
                  fontWeight: 700, fontSize: '0.84rem', cursor: (!studentInput.trim() || isGeneratingTurn) ? 'not-allowed' : 'pointer',
                  opacity: (!studentInput.trim() || isGeneratingTurn) ? 0.6 : 1, flexShrink: 0
                }}
              >
                {isGeneratingTurn ? '⏳ 诊断中...' : '🤖 AI 应答 & 语法诊断'}
              </button>
            </div>

            {micError && (
              <div style={{ fontSize: '0.8rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '8px' }}>
                ⚠️ {micError}
              </div>
            )}
          </div>

          {/* Evaluation Result */}
          {evaluation && (
            <div style={{
              background: evaluation.accuracy >= 80 ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${evaluation.accuracy >= 80 ? '#86efac' : '#fcd34d'}`,
              borderRadius: '14px', padding: '14px',
              display: 'flex', flexDirection: 'column', gap: '10px'
            }}>
              {evaluation.isFallback && evaluation.fallbackNotice && (
                <div style={{ fontSize: '0.76rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '6px 10px', borderRadius: '8px' }}>
                  ℹ️ {evaluation.fallbackNotice}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.3rem' }}>{evaluation.accuracy >= 80 ? '🌟' : '📝'}</span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 800, color: evaluation.accuracy >= 80 ? '#166534' : '#92400e' }}>
                    综合评分：{evaluation.accuracy} / 100 分
                  </span>
                  <span style={{ background: '#e2e8f0', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600 }}>
                    {evaluation.modeLabel}
                  </span>
                </div>
                {!isGenerativeMode && (
                  <button
                    type="button"
                    onClick={handleNextTurn}
                    style={{
                      background: '#166534', color: '#fff', border: 'none', padding: '6px 12px',
                      borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    下一轮 →
                  </button>
                )}
              </div>

              {evaluation.grammarIssues && evaluation.grammarIssues.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '0.82rem', color: '#991b1b' }}>
                  <div style={{ fontWeight: 800, marginBottom: '4px' }}>🔍 检出的语法与搭配问题：</div>
                  {evaluation.grammarIssues.map((issue, i) => (
                    <div key={i} style={{ marginTop: '2px' }}>• {issue}</div>
                  ))}
                  {evaluation.correctedText && (
                    <div style={{ marginTop: '6px', color: '#166534', fontWeight: 700 }}>
                      ✅ 建议改写："{evaluation.correctedText}"
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: '0.82rem', color: '#1e293b', background: 'rgba(255,255,255,0.75)', padding: '8px 12px', borderRadius: '8px' }}>
                💡 <b>名师点评：</b>{evaluation.tip}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              onClick={handleSendToChat}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer'
              }}
            >
              💬 带入课堂请教名师
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f1f5f9', color: '#475569', border: 'none',
                padding: '8px 18px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
