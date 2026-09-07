import React, { useRef, useEffect, useState } from 'react';

const InputBar = React.memo(function InputBar({
  input,
  setInput,
  isLoading,
  isListening,
  previewImage,
  fileInputRef,
  onSubmit,
  onToggleVoice,
  onImageSelect,
  onClearImage,
  autoRead,
  setAutoRead,
  isSpeaking,
  onInterruptSpeech,
  onOpenScratchpad
}) {
  const [localVal, setLocalVal] = useState(input);
  const textareaRef = useRef(null);

  useEffect(() => {
    setLocalVal(input);
  }, [input]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if ((localVal.trim() || previewImage) && !isLoading) {
      onSubmit(e, localVal);
      setLocalVal('');
    }
  };

  // 自动调整高度
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (!localVal) {
      ta.style.height = '38px';
      return;
    }
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [localVal]);

  const handleKeyDown = (e) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((localVal.trim() || previewImage) && !isLoading) {
        onSubmit(e, localVal);
        setLocalVal('');
      }
    }
  };

  return (
    <>
      {/* Barge-in 实时语音打断浮条 */}
      {isSpeaking && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '6px 12px',
          marginBottom: '6px',
          borderRadius: '20px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          color: '#f87171',
          fontSize: '0.85rem',
          animation: 'pulse 1.5s infinite'
        }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
          <span>AI 专属名师正在为您语音讲解...</span>
          <button
            type="button"
            onClick={onInterruptSpeech}
            style={{
              marginLeft: '6px',
              padding: '3px 10px',
              borderRadius: '12px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: 'pointer'
            }}
            title="立刻打断AI讲解，插话或提问"
          >
            🛑 老师暂停 / 我要插话
          </button>
        </div>
      )}

      {previewImage && (
        <div className="image-preview-bar" role="status" aria-label="图片预览">
          <img src={previewImage} alt="上传的题目预览" className="preview-thumb" />
          <span className="preview-label">图片/演算草稿已准备好，点击发送即可开始名师指点</span>
          <button className="clear-image-btn" onClick={onClearImage} title="移除图片" aria-label="移除已上传的图片">✕</button>
        </div>
      )}

      <div className="quick-hints-bar" role="toolbar" aria-label="名师启发快捷支架">
        <button
          type="button"
          className="quick-hint-chip"
          title="一句话点破出题人在哪里藏了陷阱与核心突破口"
          disabled={isLoading}
          onClick={() => onSubmit(null, "老师，请一句话点破这道题的【核心题眼】和出题人套路陷阱！")}
        >
          🎯 题眼与陷阱
        </button>
        <button
          type="button"
          className="quick-hint-chip"
          title="给草稿纸上的第一步画线或公式支架，不要直接给答案"
          disabled={isLoading}
          onClick={() => onSubmit(null, "老师，请给我草稿纸上的【第一步动笔支架】（辅助线画法或公式首步），引导我动手算！")}
        >
          ✏️ 动笔支架
        </button>
        <button
          type="button"
          className="quick-hint-chip"
          title="出一道同类型母题考考我，检验我是否真正掌握"
          disabled={isLoading}
          onClick={() => onSubmit(null, "老师，请出一道同类型的【母题变式微测题】考考我，我算完发给您！")}
        >
          🔥 举一反三闯关
        </button>
        {onOpenScratchpad && (
          <button
            type="button"
            className="quick-hint-chip"
            style={{ borderColor: '#3b82f6', color: '#60a5fa' }}
            title="打开白板草稿纸手写演算或画几何辅助线"
            onClick={onOpenScratchpad}
          >
            📝 演练草稿纸
          </button>
        )}
      </div>

      <div className="input-container" role="form" aria-label="消息输入区域">
        <form className="input-form" onSubmit={handleFormSubmit}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={onImageSelect}
            style={{ display: 'none' }}
            id="image-upload"
            disabled={isLoading}
            aria-hidden="true"
          />

          {/* 左侧工具按钮：拍照 */}
          <label
            htmlFor="image-upload"
            className="icon-btn camera-btn"
            title="拍照或上传题目图片"
            aria-label="拍照或上传题目图片"
            style={isLoading ? { pointerEvents: 'none', opacity: 0.4 } : {}}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </label>

          {/* 左侧草稿白板按钮 */}
          {onOpenScratchpad && (
            <button
              type="button"
              className="icon-btn"
              onClick={onOpenScratchpad}
              title="打开演练草稿纸 (手写几何/竖式草稿)"
              aria-label="打开草稿纸"
              style={{ color: '#38bdf8' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          )}

          {/* 中间自适应输入框 */}
          <textarea
            ref={textareaRef}
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? '🎤 正在聆听您的提问...' : '问问课本里的知识，上传题目或打开草稿纸… (Enter 发送)'}
            disabled={isLoading}
            maxLength={2000}
            rows={1}
            aria-label="输入你的问题"
            aria-disabled={isLoading}
            autoComplete="off"
            className="chat-textarea"
          />

          {/* 右侧工具按钮：语音输入 & 发送 */}
          <button
            type="button"
            className={`icon-btn voice-btn ${isListening ? 'listening' : ''}`}
            onClick={() => {
              if (isSpeaking && onInterruptSpeech) {
                onInterruptSpeech();
              }
              onToggleVoice();
            }}
            title={isListening ? '点击停止' : (isSpeaking ? '打断讲解并语音提问' : '按下说话')}
            aria-label={isListening ? '停止录音' : '开始语音输入'}
            disabled={isLoading}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          <button
            type="submit"
            disabled={(!localVal.trim() && !previewImage) || isLoading}
            aria-label="发送消息"
            title="发送消息"
            className="send-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>
    </>
  );
});

export default InputBar;
