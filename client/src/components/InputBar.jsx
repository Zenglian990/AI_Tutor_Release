import React, { useRef, useEffect, useState } from 'react';

const InputBar = React.memo(function InputBar({ input, setInput, isLoading, isListening, previewImage, fileInputRef, onSubmit, onToggleVoice, onImageSelect, onClearImage, autoRead, setAutoRead }) {
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
      {previewImage && (
        <div className="image-preview-bar" role="status" aria-label="图片预览">
          <img src={previewImage} alt="上传的题目预览" className="preview-thumb" />
          <span className="preview-label">图片已选择，可以添加文字说明再发送</span>
          <button className="clear-image-btn" onClick={onClearImage} title="移除图片" aria-label="移除已上传的图片">✕</button>
        </div>
      )}
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
            title="拍照或上传图片"
            aria-label="拍照或上传题目图片"
            style={isLoading ? { pointerEvents: 'none', opacity: 0.4 } : {}}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </label>

          {/* 中间自适应输入框 */}
          <textarea
            ref={textareaRef}
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? '🎤 正在聆听...' : '问问课本里的知识，或上传题目… (Enter 发送，Shift+Enter 换行)'}
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
            onClick={onToggleVoice}
            title={isListening ? '点击停止' : '按下说话'}
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
