import { useState, useRef, useEffect, useCallback } from 'react';
import { AppProvider, useAppStore, getApiUrl, authFetch, formatGrade } from './store/useStore';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import InputBar from './components/InputBar';
import LearningMap from './components/LearningMap';
import ParentalGate from './components/ParentalGate';
import StatsDashboard from './components/StatsDashboard';
import MistakeNotebook from './components/MistakeNotebook';
import AddProfileModal from './components/AddProfileModal';
import SettingsModal from './components/SettingsModal';
import ErrorBoundary from './components/ErrorBoundary';
import ChapterStepper from './components/ChapterStepper';
import WeeklyReportModal from './components/WeeklyReportModal';
import KnowledgeTest from './components/KnowledgeTest';
import { compressImage } from './utils/image';
import { playTTS, stopTTS } from './utils/tts';
import { compressAudio } from './utils/audio';
import { useOfflineStatus, OFFLINE_FALLBACK_RESPONSE, OFFLINE_FALLBACK_RESPONSE_EN } from './utils/offline';
import OnboardingGuide from './components/OnboardingGuide';

const genMsgId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// ── Main App ──
function AppInner() {
  const store = useAppStore();
  const {
    backendUrl, setBackendUrl, apiToken, setApiToken,
    profiles, currentProfileId, currentProfile,
    selectedSubject, setSelectedSubject, isSocratic, setSocraticLevel,
    autoRead, setAutoRead, isLightMode, setIsLightMode,
    handleGradeChange, handleEditionChange, handleAddProfile, handleDeleteProfile,
    setCurrentProfileId, handleProfileChange, getApiUrl: storeGetApiUrl,
    language, t, chatModel
  } = store;

  const isOffline = useOfflineStatus();

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);

  // UI state
  const [showMistakes, setShowMistakes] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAdminStats, setShowAdminStats] = useState(false);
  const [reportData, setReportData] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [activeChapterData, setActiveChapterData] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() =>
    localStorage.getItem('ai_tutor_onboarding_completed') !== 'true'
  );

  // Parental gate
  const [gateOpen, setGateOpen] = useState(false);
  const [gateReason, setGateReason] = useState('');
  const [gateAction, setGateAction] = useState(null);

  // Refs
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const gradeRef = useRef(currentProfile.grade);
  const subjectRef = useRef(selectedSubject);
  const messagesRef = useRef(messages);
  const editionRef = useRef(currentProfile.edition);

  useEffect(() => { gradeRef.current = currentProfile.grade; }, [currentProfile.grade]);
  useEffect(() => { subjectRef.current = selectedSubject; }, [selectedSubject]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { editionRef.current = currentProfile.edition; }, [currentProfile.edition]);

  // Validate and auto-reset selectedSubject when grade changes to an incompatible one
  useEffect(() => {
    const grade = currentProfile.grade;
    if (!grade) return;
    const gradeStr = String(grade);
    const isPrimary = ['1', '2', '3', '4', '5', '6'].some(num => gradeStr.startsWith(num));
    
    let allowed = [];
    if (isPrimary) {
      allowed = ['', '语文', '数学', '英语'];
    } else if (gradeStr.startsWith('7')) {
      allowed = ['', '语文', '数学', '英语', '道德与法治', '历史', '地理', '生物'];
    } else if (gradeStr.startsWith('8')) {
      allowed = ['', '语文', '数学', '英语', '道德与法治', '历史', '地理', '生物', '物理'];
    } else if (gradeStr.startsWith('9')) {
      allowed = ['', '语文', '数学', '英语', '道德与法治', '历史', '物理', '化学'];
    } else {
      allowed = ['', '语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治'];
    }
    
    if (selectedSubject && !allowed.includes(selectedSubject)) {
      setSelectedSubject('');
    }
  }, [currentProfile.grade, selectedSubject, setSelectedSubject]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Scroll
  useEffect(() => {
    if (!isLoading) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  // Sync messages to server
  const syncMessages = useCallback(async (currentMessages, explicitGrade = currentProfile.grade, explicitSubject = selectedSubject) => {
    try {
      await authFetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: currentProfileId, messages: currentMessages, grade: explicitGrade, subject: explicitSubject })
      });
    } catch (e) { console.error('Failed to sync messages:', e); }
  }, [currentProfileId, currentProfile.grade, selectedSubject]);

  // Load messages on profile/subject change
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const res = await authFetch(`/api/chat-history?profile_id=${currentProfileId}&grade=${currentProfile.grade}&subject=${selectedSubject}`);
        if (res.ok) {
          const data = await res.json();
          if (data.history && data.history.length > 0) {
            setMessages(data.history);
            return;
          }
        }
      } catch (e) { console.error('Failed to load history', e); }
      // Fallback
      const gradeLabel = currentProfile.grade ? (formatGrade(currentProfile.grade)) : '通用';
      setMessages([{
        id: genMsgId(), role: 'ai',
        text: `您好！我是您的专属私教 🎓\n\n您现在处于 **${gradeLabel} ${selectedSubject || '学科'}** 的专属学习频道。\n我们将为您保存该频道下的所有讨论进度。\n\n您可以试着问我：\n1. 解释一下本册重点知识点\n2. 帮我解答一道练习题\n3. 推荐本册必背内容\n\n如果您在学习地图里点击了关卡，我也会在这里主动引导您过关！`
      }]);
    };
    loadMessages();
    return () => {
      if (messagesRef.current.length > 1) syncMessages(messagesRef.current, gradeRef.current, subjectRef.current);
    };
  }, [currentProfileId, currentProfile.grade, selectedSubject]);

  // Profile change handler (catches ADD_NEW)
  const onProfileChange = useCallback((profileId) => {
    const result = handleProfileChange(profileId);
    if (result === 'ADD_NEW') setShowAddProfile(true);
  }, [handleProfileChange]);

  // Voice recording
  const toggleVoice = async () => {
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      setIsListening(false);
    } else {
      try {
        audioChunksRef.current = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let options = {};
        if (MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };
        else if (MediaRecorder.isTypeSupported('audio/mp4')) options = { mimeType: 'audio/mp4' };
        else if (MediaRecorder.isTypeSupported('audio/ogg')) options = { mimeType: 'audio/ogg' };
        else if (MediaRecorder.isTypeSupported('audio/wav')) options = { mimeType: 'audio/wav' };

        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          const mime = options.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mime });
          if (audioBlob.size === 0) return;
          setIsLoading(true);
          setInput('🎙️ 正在压缩并识别您的声音...');
          try {
            const compressedBlob = await compressAudio(audioBlob);
            const formData = new FormData();
            formData.append('audio', compressedBlob, 'voice.wav');
            const response = await authFetch('/api/transcribe', { method: 'POST', body: formData });
            if (response.ok) {
              const data = await response.json();
              if (data.text && data.text.trim()) {
                setInput(prev => (prev.trim() + ' ' + data.text.trim()).trim());
              } else {
                setInput('');
                alert('没有听清您的说话，请再试一次 🎤');
              }
            } else { setInput(''); alert('语音识别失败，请手动输入'); }
          } catch (err) { setInput(''); alert('语音识别网络错误'); }
          finally { setIsLoading(false); }
        };
        recorder.start();
        setIsListening(true);
      } catch (err) { alert('无法启动麦克风录音，请确保已授予麦克风使用权限 🎙️'); setIsListening(false); }
    }
  };

  // Image handling
  const handleImageSelect = e => {
    const file = e.target.files[0]; if (!file) return;
    if (previewImage) URL.revokeObjectURL(previewImage);
    setImageFile(file); setPreviewImage(URL.createObjectURL(file));
  };
  const clearImage = () => {
    if (previewImage) URL.revokeObjectURL(previewImage);
    setPreviewImage(null); setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Chat submit
  const handleSubmit = useCallback(async (e, customText) => {
    if (e && e.preventDefault) e.preventDefault();
    const textToSubmit = customText || '';
    if ((!textToSubmit && !imageFile) || isLoading) return;

    const userQuery = textToSubmit || '请帮我解答这张图片里的题目。';
    const hasImage = !!imageFile;
    const historyContext = messagesRef.current.slice(-20).map(m => ({ role: m.role, text: m.text }));

    const newMsgs = [...messagesRef.current, { id: genMsgId(), role: 'user', text: userQuery, imageUrl: previewImage }];
    setMessages(newMsgs);
    setInput('');
    const currentImage = imageFile;
    if (previewImage) URL.revokeObjectURL(previewImage);
    setPreviewImage(null); setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsLoading(true);

    if (isOffline) {
      const fallbackText = language === 'zh-CN' ? OFFLINE_FALLBACK_RESPONSE : OFFLINE_FALLBACK_RESPONSE_EN;
      setMessages(prev => [...prev, { id: genMsgId(), role: 'ai', text: fallbackText }]);
      setIsLoading(false);
      return;
    }

    if (window.speechSynthesis) {
      const silentUtterance = new SpeechSynthesisUtterance('');
      silentUtterance.volume = 0;
      window.speechSynthesis.speak(silentUtterance);
    }

    setMessages(prev => [...prev, { id: genMsgId(), role: 'ai', text: '思考中...', sources: [] }]);

    let response;
    try {
      if (hasImage) {
        const formData = new FormData();
        const compressed = await compressImage(currentImage);
        formData.append('image', compressed);
        formData.append('query', userQuery);
        formData.append('history', JSON.stringify(historyContext));
        formData.append('profile_id', currentProfileId);
        if (gradeRef.current) formData.append('grade', gradeRef.current);
        if (subjectRef.current) formData.append('subject', subjectRef.current);
        formData.append('socratic', isSocratic);
        if (editionRef.current) formData.append('edition', editionRef.current);
        formData.append('model', chatModel);
        response = await authFetch('/api/chat-vision', { method: 'POST', body: formData });
      } else {
        response = await authFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: userQuery,
            grade: gradeRef.current || undefined,
            subject: subjectRef.current || undefined,
            history: historyContext,
            profile_id: currentProfileId,
            socratic: isSocratic,
            edition: editionRef.current,
            model: chatModel
          })
        });
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(String(errorData.error || `服务器响应错误 (状态码: ${response.status})`));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let partialLine = '';
      let answerText = '';
      let sources = [];
      let isFirstChunk = true;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          const lines = (partialLine + chunk).split('\n');
          partialLine = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') continue;
              let streamError = null;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.sources) sources = parsed.sources;
                if (parsed.text) {
                  if (isFirstChunk) { answerText = ''; isFirstChunk = false; }
                  answerText += parsed.text;
                  setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === 'ai') return [...prev.slice(0, -1), { ...lastMsg, text: answerText, sources }];
                    return prev;
                  });
                }
                if (parsed.error) streamError = parsed.error;
              } catch (e) { console.warn("Error parsing SSE line:", line, e); }
              if (streamError) throw new Error(streamError);
            }
          }
        }
      }
      syncMessages(messagesRef.current, gradeRef.current, subjectRef.current);
    } catch (error) {
      console.error(error);
      let errorMsg = error.message || '对不起，系统忙碌中，请稍后再试。';
      if (typeof errorMsg !== 'string') errorMsg = JSON.stringify(errorMsg);
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        errorMsg = '无法连接到服务器，请确认后端已启动（端口 3001）。';
      }
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'ai') return [...prev.slice(0, -1), { ...lastMsg, text: String(errorMsg) }];
        return [...prev, { id: genMsgId(), role: 'ai', text: String(errorMsg) }];
      });
    } finally { setIsLoading(false); }
  }, [imageFile, isLoading, previewImage, currentProfileId, isSocratic, syncMessages, isOffline, language]);

  const clearChat = () => {
    setGateAction(() => () => {
      if (window.confirm('确定要清空当前对话吗？')) {
        setMessages([{ id: genMsgId(), role: 'ai', text: '您好！我是您的 AI 助教。对话已清空，开始新的学习旅程吧！' }]);
        syncMessages([{ id: genMsgId(), role: 'ai', text: '您好！我是您的 AI 助教。对话已清空，开始新的学习旅程吧！' }]);
      }
    });
    setGateReason('清空当前对话历史');
    setGateOpen(true);
  };

  const handlePlayTTS = useCallback((text, onStart, onEnd) => {
    playTTS(text, gradeRef.current, onStart, onEnd);
  }, []);

  const handleStopTTS = useCallback(() => {
    stopTTS();
  }, []);

  const handleMarkMistake = useCallback(async (msg) => {
    try {
      const msgs = messagesRef.current;
      const idx = msgs.findIndex(m => m.id === msg.id);
      let userQuery = '';
      if (idx !== -1) {
        for (let i = idx - 1; i >= 0; i--) {
          if (msgs[i].role === 'user') {
            userQuery = msgs[i].text;
            break;
          }
        }
      }
      const res = await authFetch('/api/mistakes/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userQuery || '无明确问题',
          answer: msg.text,
          grade: gradeRef.current,
          subject: subjectRef.current,
          profile_id: currentProfileId
        })
      });
      if (res.ok) alert("✅ 已成功加入错题本！");
      else alert("❌ 加入错题本失败，请稍后重试。");
    } catch (e) {
      alert("网络错误，加入错题本失败。");
    }
  }, [currentProfileId]);

  return (
    <div className="app-container">
      {isOffline && (
        <div className="offline-banner" style={{ background: '#ef4444', color: 'white', padding: '8px 24px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem', zIndex: 10 }}>
          ⚠️ {language === 'zh-CN' ? '离线模式：仅允许阅读本地缓存的错题本和进度。' : 'Offline Mode: Read-only access to local mistake history.'}
        </div>
      )}
      <Header
        profiles={profiles}
        currentProfileId={currentProfileId}
        onProfileChange={onProfileChange}
        onDeleteProfile={() => {
          if (currentProfileId === 'default') { alert('默认档案不能删除。'); return; }
          setGateAction(() => () => {
            if (window.confirm(`确定要删除档案 "${currentProfile.name}" 及其所有记录吗？`)) {
              authFetch('/api/profile?profile_id=' + currentProfileId, { method: 'DELETE' })
                .then(res => { if (!res.ok) throw new Error('删除失败'); handleDeleteProfile(currentProfileId); })
                .catch(() => alert('删除档案失败，请稍后重试。'));
            }
          });
          setGateReason(`删除学生档案 "${currentProfile.name}"`);
          setGateOpen(true);
        }}
        selectedGrade={currentProfile.grade}
        onGradeChange={handleGradeChange}
        selectedSubject={selectedSubject}
        onSubjectChange={setSelectedSubject}
        onClearChat={clearChat}
        socraticLevel={isSocratic}
        onSocraticCycle={(level) => setSocraticLevel(level)}
        isLightMode={isLightMode}
        onThemeToggle={() => setIsLightMode(!isLightMode)}
        onSettingsOpen={() => setShowSettings(true)}
      />

      {/* Action buttons */}
      <div className="action-bar no-print" style={{ padding: '0 24px', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
        <ActionButton label="🔔 错题复测" color="#f59e0b" onClick={async (btn) => {
          const originalText = btn.innerHTML;
          btn.innerHTML = '⏳ 正在加载...';
          try {
            const res = await authFetch(`/api/mistakes/review-challenge?profile_id=${currentProfileId}&grade=${currentProfile.grade}`);
            const data = await res.json();
            if (data.challenge) {
              setMessages(prev => [...prev, { id: genMsgId(), role: 'ai', text: data.challenge }]);
              setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
            } else { alert("太棒了！今天没有需要紧急复习的错题！"); }
          } catch (e) { alert("获取错题复测失败"); }
          finally { btn.innerHTML = originalText; }
        }} />
        <ActionButton label="📈 家长监工" color="#ef4444" onClick={async (btn) => {
          setShowReportModal(true); setReportLoading(true);
          try {
            const res = await authFetch('/api/report/weekly', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profile_id: currentProfileId, grade: currentProfile.grade, student_name: currentProfile.name })
            });
            const data = await res.json();
            setReportData(data.report || '生成报告失败');
          } catch (e) { setReportData('网络异常'); }
          finally { setReportLoading(false); }
        }} />
        <button onClick={() => { setGateAction(() => () => setShowStats(true)); setGateReason(language === 'zh-CN' ? '查看家长深度分析报表' : 'View parental progress report'); setGateOpen(true); }}
          className="mistake-btn" style={{ borderColor: '#a78bfa', color: '#a78bfa', background: 'rgba(139, 92, 246, 0.1)' }}>📊 {language === 'zh-CN' ? '学习报表' : 'Stats Report'}</button>
        <button onClick={() => setShowAdminStats(true)}
          className="mistake-btn" style={{ borderColor: '#ec4899', color: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' }}>
          📝 {language === 'zh-CN' ? '知识测试' : 'Knowledge Test'}
        </button>
        <button onClick={() => setShowMistakes(true)} className="mistake-btn">📖 {language === 'zh-CN' ? '我的错题本' : 'Mistake Book'}</button>
        <button onClick={() => setShowMap(true)} className="mistake-btn" style={{ borderColor: '#10b981', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}>🗺️ {language === 'zh-CN' ? '学习地图' : 'Learning Map'}</button>
        <ActionButton label="🎯 智能规划" color="#8b5cf6" onClick={async (btn) => {
          const originalText = btn.innerHTML;
          btn.innerHTML = '⏳ 正在生成...';
          try {
            const res = await authFetch('/api/active-plan/generate', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                profile_id: currentProfileId,
                grade: currentProfile.grade,
                subject: selectedSubject || '数学',
                student_name: currentProfile.name,
                edition: currentProfile.edition
              })
            });
            const data = await res.json();
            if (data.plan) { setMessages(prev => [...prev, { id: genMsgId(), role: 'ai', text: data.plan }]); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100); }
          } catch (e) { alert("生成规划失败"); }
          finally { btn.innerHTML = originalText; }
        }} />
      </div>

      {/* Chapter Progress Stepper */}
      <ChapterStepper
        activeChapterData={activeChapterData}
        setActiveChapterData={setActiveChapterData}
        currentProfileId={currentProfileId}
        currentGrade={currentProfile.grade}
        selectedSubject={selectedSubject}
        onSubmit={handleSubmit}
        authFetch={authFetch}
      />

      {/* Chat messages */}
      <div className="chat-container">
        {messages.map((msg, idx) => (
          <ChatMessage
            key={msg.id || idx}
            msg={msg}
            autoRead={autoRead}
            isLatest={idx === messages.length - 1}
            isStreaming={idx === messages.length - 1 && isLoading}
            playTTS={handlePlayTTS}
            stopTTS={handleStopTTS}
            onMarkMistake={msg.role === 'ai' ? handleMarkMistake : undefined}
          />
        ))}
        {isLoading && <div className="typing-indicator"><div className="dot" /><div className="dot" /><div className="dot" /></div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Modals */}
      {showMistakes && <MistakeNotebook onClose={() => setShowMistakes(false)} currentProfileId={currentProfileId} defaultGrade={currentProfile.grade} defaultSubject={selectedSubject} onGuardAction={(action, reason) => { setGateAction(() => action); setGateReason(reason); setGateOpen(true); }} />}
      {showStats && <StatsDashboard profiles={profiles} onClose={() => setShowStats(false)} currentProfileId={currentProfileId} />}
      {showMap && (
        <LearningMap
          currentGrade={currentProfile.grade}
          currentSubject={selectedSubject || '数学'}
          currentEdition={currentProfile.edition}
          onClose={() => setShowMap(false)}
          authFetch={authFetch}
          onSelectChapter={(chapter) => {
            setShowMap(false);
            setActiveChapterData(chapter);
            if (chapter.status === 'not_started') {
              setActiveChapterData({ ...chapter, status: 'in_progress', progress_pct: 25 });
              authFetch('/api/chapters/update-progress', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile_id: currentProfileId, grade: currentProfile.grade, subject: selectedSubject || '数学', chapter_id: chapter.id, status: 'in_progress', progress_pct: 25 })
              }).catch(err => console.error('Failed to sync progress:', err));
            }
            handleSubmit(null, `[ACTION_START_CHAPTER] 我选择了关卡《${chapter.name}》，请给我发放【25%：新知导读与热身】的主动导学指引吧！`);
          }}
        />
      )}
      <ParentalGate isOpen={gateOpen} reason={gateReason} onVerify={async () => { if (gateAction) { try { await gateAction(); } catch (e) { console.error('Gate action failed:', e); } } }} onClose={() => { setGateOpen(false); setGateAction(null); }} />
      <AddProfileModal isOpen={showAddProfile} onClose={() => setShowAddProfile(false)} onConfirm={handleAddProfile} />
      <SettingsModal
        isOpen={showSettings} onClose={() => setShowSettings(false)}
        backendUrl={backendUrl} onSaveBackendUrl={setBackendUrl}
        apiToken={apiToken} onSaveApiToken={setApiToken}
        isSocratic={isSocratic} onSocraticToggle={(level) => setSocraticLevel(level)}
        autoRead={autoRead} onAutoReadToggle={() => setAutoRead(!autoRead)}
        currentProfileId={currentProfileId}
        currentProfileEdition={currentProfile.edition}
        onEditionChange={handleEditionChange}
      />

      {/* Weekly Report Modal */}
      <WeeklyReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportLoading={reportLoading}
        reportData={reportData}
      />

      {showAdminStats && (
        <KnowledgeTest
          onClose={() => setShowAdminStats(false)}
          currentProfileId={currentProfileId}
          currentGrade={currentProfile.grade}
          selectedSubject={selectedSubject}
          currentEdition={currentProfile.edition}
          authFetch={authFetch}
        />
      )}
      {showOnboarding && <OnboardingGuide language={language} onClose={() => setShowOnboarding(false)} />}

      <InputBar
        input={input} setInput={setInput}
        isLoading={isLoading} isListening={isListening}
        previewImage={previewImage} fileInputRef={fileInputRef}
        onSubmit={handleSubmit} onToggleVoice={toggleVoice}
        onImageSelect={handleImageSelect} onClearImage={clearImage}
        autoRead={autoRead} setAutoRead={setAutoRead}
      />
    </div>
  );
}

// Small helper component to replace direct DOM manipulation
function ActionButton({ label, color, onClick }) {
  const btnRef = useRef(null);
  const handleClick = () => onClick(btnRef.current);
  return (
    <button ref={btnRef} onClick={handleClick} className="mistake-btn"
      style={{ borderColor: color, color, background: `${color}1a` }}>
      {label}
    </button>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider><AppInner /></AppProvider>
    </ErrorBoundary>
  );
}
