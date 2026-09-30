import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import React, { useState, useEffect, useRef } from 'react'
import { preprocessLatex } from '../utils/math'
import DOMPurify from 'dompurify';
import { initMermaid, sanitizeMermaid, mermaid } from '../utils/mermaid_helper';
import { splitThinkingContent } from '../utils/thinking';
import { useAppStore } from '../store/useStore';
import { isLowerGrade, injectPinyinToChildren } from '../utils/pinyinHelper';
import VariantPracticeModal from './VariantPracticeModal';
import { playSuccessChime } from '../utils/sensoryFeedback';

initMermaid();

function MermaidChart({ chart }) {
  const svgRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [generatedPngUrl, setGeneratedPngUrl] = useState(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (svgRef.current && chart) {
      try {
        const sanitizedChart = sanitizeMermaid(chart);
        const id = `mermaid-${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
        mermaid.render(id, sanitizedChart).then((result) => {
          if (svgRef.current) {
            // Fixed S2: Use DOMPurify to sanitize SVG and allow foreignObject for HTML labels
            const cleanSvg = DOMPurify.sanitize(result.svg, {
              USE_PROFILES: { svg: true },
              ADD_TAGS: ['foreignObject']
            });
            svgRef.current.innerHTML = cleanSvg;
            const svgEl = svgRef.current.querySelector('svg');
            if (svgEl) {
              svgEl.style.maxWidth = 'none';
              const viewBox = svgEl.getAttribute('viewBox');
              if (viewBox) {
                const parts = viewBox.split(/\s+/).map(Number);
                if (parts.length === 4) {
                  const x = parts[0];
                  const y = parts[1];
                  const w = parts[2];
                  const h = parts[3];
                  
                  // Expand viewBox boundary to prevent Chinese text clipping on margins
                  const paddingX = 80;
                  const paddingY = 40;
                  
                  const newX = x - paddingX;
                  const newY = y - paddingY;
                  const newW = w + paddingX * 2;
                  const newH = h + paddingY * 2;
                  
                  svgEl.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
                  svgEl.style.width = newW + 'px';
                  svgEl.style.minWidth = newW + 'px';
                }
              } else {
                svgEl.style.minWidth = chart.includes('mindmap') ? '1200px' : '800px';
              }
            }
            setRendered(true);
          }
        }).catch(e => {
          if (svgRef.current) {
            svgRef.current.textContent = `图表渲染错误: ${e.message}`;
            svgRef.current.style.color = 'red';
            svgRef.current.style.fontSize = '12px';
          }
          const danglingSvg = document.getElementById(id);
          if (danglingSvg) danglingSvg.remove();
          const dDanglingSvg = document.getElementById('d' + id);
          if (dDanglingSvg) dDanglingSvg.remove();
        });
      } catch (error) {
        if (svgRef.current) {
          svgRef.current.textContent = `图表渲染错误: ${error.message}`;
          svgRef.current.style.color = 'red';
          svgRef.current.style.fontSize = '12px';
        }
      }
    }
  }, [chart]);

  const handleDownload = () => {
    const svgEl = svgRef.current?.querySelector('svg');
    if (!svgEl) return;

    // Fixed U4: Removed Canvas 2D and PNG conversion that crashes on mobile
    const clonedSvg = svgEl.cloneNode(true);
    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(svgBlob);
    blobUrlRef.current = url;

    setGeneratedPngUrl(url); // We just pass the SVG blob URL
    setShowSaveModal(true);

    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `思维导图_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn("Auto-download failed or not supported in this client", err);
    }
  };

  return (
    <div className="mermaid-wrapper">
      <div ref={svgRef} />
      {rendered && (
        <button
          onClick={handleDownload}
          title="下载思维导图 PNG"
          className="mermaid-download-btn"
        >
          ⬇️ 下载思维导图
        </button>
      )}

      {showSaveModal && generatedPngUrl && (
        <div className="mistake-overlay" style={{ zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="glass-panel" style={{ padding: '24px', background: 'var(--card-bg, #1e293b)', maxWidth: '480px', width: '90%', borderRadius: '16px', border: '1px solid var(--glass-border, rgba(255,255,255,0.1))', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', color: 'white' }}>
            <h3 style={{ color: '#fbbf24', marginBottom: '12px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              🧠 专属思维导图已生成
            </h3>
            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6', marginBottom: '16px', textAlign: 'left' }}>
              💡 <b>保存指引：</b><br />
              • <b>手机端/临时包：</b>请【长按下方图片】，选择【保存到手机相册】或【分享给微信好友】。<br />
              • <b>电脑端：</b>如果未触发自动下载，可点击下方【💾 下载图片】按钮保存。
            </p>
            
            <div style={{ maxHeight: '45vh', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#ffffff', padding: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img 
                src={generatedPngUrl} 
                alt="思维导图" 
                style={{ maxWidth: '100%', height: 'auto', display: 'block', borderRadius: '4px', objectFit: 'contain' }} 
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                onClick={() => setShowSaveModal(false)}
                className="mistake-btn"
                style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'white', cursor: 'pointer', fontSize: '14px' }}
              >
                关闭
              </button>
              <a 
                href={generatedPngUrl} 
                download={`思维导图_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.png`}
                className="mistake-btn"
                style={{ padding: '8px 20px', borderRadius: '8px', background: '#3b82f6', color: 'white', textDecoration: 'none', fontWeight: 'bold', cursor: 'pointer', border: 'none', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                💾 下载图片
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




function splitAnswerSections(text) {
  if (!text) return null;
  // Match headers for answer / derivation:
  // e.g. ### 📐 【完整推导...】 or ### 📐 【第四步...】 or ### 💡【步骤拆解...】
  const answerRegex = /(?:^|\n)(###\s*(?:📐|💡\s*【步骤拆解|【第四步|📐\s*【完整推导|【完整推导|【标准答案))/;
  const match = text.match(answerRegex);
  if (!match) return null;

  const splitIdx = match.index + (match[0].startsWith('\n') ? 1 : 0);
  const preAnswer = text.substring(0, splitIdx).trim();
  const rest = text.substring(splitIdx);

  // Match variation / quiz header:
  // e.g. ### 🔄 【举一反三...】 or ### 🔥 【举一反三...】 or ### 🔄 【第五步...】
  const varRegex = /(?:^|\n)(###\s*(?:🔄|🔥\s*【举一反三|🔄\s*【举一反三|🔥\s*【母题|【第五步))/;
  const varMatch = rest.match(varRegex);

  let answerBody = rest;
  let postAnswer = '';
  if (varMatch) {
    const varIdx = varMatch.index + (varMatch[0].startsWith('\n') ? 1 : 0);
    answerBody = rest.substring(0, varIdx).trim();
    postAnswer = rest.substring(varIdx).trim();
  }

  // Only consider it a valid split if preAnswer is substantial
  if (!preAnswer) return null;

  return { preAnswer, answerBody, postAnswer };
}

const animatedIds = new Set();

const ChatMessage = React.memo(function ChatMessage({
  msg,
  autoRead,
  isLatest,
  isStreaming,
  onMarkMistake,
  playTTS,
  stopTTS,
  onQuickPrompt,
  onRewardExp
}) {
  // Only play slide-in animation once per message ID
  const [animClass, setAnimClass] = useState('');
  useEffect(() => {
    if (msg.id && !animatedIds.has(msg.id)) {
      animatedIds.add(msg.id);
      setAnimClass('msg-slide-in');
    }
  }, [msg.id]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const ttsCtrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (ttsCtrlRef.current) {
        ttsCtrlRef.current.stop();
        ttsCtrlRef.current = null;
      }
    };
  }, []);

  const toggleSpeech = () => {
    if (isPlaying || isLoadingAudio) {
      if (ttsCtrlRef.current) {
        ttsCtrlRef.current.stop();
        ttsCtrlRef.current = null;
      } else {
        if (stopTTS) stopTTS();
        else if (window.speechSynthesis) window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      setIsLoadingAudio(false);
    } else {
      if (stopTTS) stopTTS();
      
      setIsLoadingAudio(true);
      if (playTTS) {
        const { body } = splitThinkingContent(msg.text);
        const textToSpeak = body || msg.text;
        ttsCtrlRef.current = playTTS(
          textToSpeak,
          () => {
            setIsLoadingAudio(false);
            setIsPlaying(true);
          },
          () => {
            setIsLoadingAudio(false);
            setIsPlaying(false);
            ttsCtrlRef.current = null;
          }
        );
      } else {
        setIsLoadingAudio(false);
        setIsPlaying(false);
      }
    }
  };

  const { currentProfile, pinyinMode, setPinyinMode, selectedGrade, selectedSubject, socraticLevel } = useAppStore();
  const [showVariantModal, setShowVariantModal] = useState(false);
  const activeGrade = msg.grade || selectedGrade || currentProfile?.grade || '7_up';
  const isPrimary = isLowerGrade(activeGrade);
  const isPinyinActive = (pinyinMode ?? true) && isPrimary && msg.role === 'ai';
  const isDirectMode = socraticLevel === 'direct';
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(isDirectMode);
  const [hasUnderstood, setHasUnderstood] = useState(false);

  const displayMessageText = msg.text ? msg.text.replace(/\[ACTION_START_CHAPTER\]\s*/g, '') : '';
  const { thinking, body: cleanAiBody } = msg.role === 'ai' ? splitThinkingContent(displayMessageText) : { thinking: null, body: displayMessageText };

  return (
    <div className={`message-wrapper ${msg.role} ${animClass}`}>
      {msg.imageUrl && (
        <img src={msg.imageUrl} alt="上传的题目" className="uploaded-image" />
      )}
      <div className={`message ${msg.role}`}>
        {msg.role === 'ai' ? (
          <div>
            {thinking && (
              <details className="ai-thinking-accordion" style={{
                background: 'rgba(15, 23, 42, 0.45)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '12px',
                padding: '10px 14px',
                marginBottom: '12px',
                fontSize: '0.85rem',
                color: '#94a3b8'
              }}>
                <summary style={{
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  userSelect: 'none'
                }}>
                  <span>🧠</span>
                  <span>名师深度备考推导过程</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'normal' }}>
                    （已智能折叠，点击展开）
                  </span>
                </summary>
                <div style={{
                  marginTop: '10px',
                  paddingTop: '8px',
                  borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                  lineHeight: '1.6',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  color: '#cbd5e1'
                }}>
                  <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}>
                    {preprocessLatex(thinking)}
                  </ReactMarkdown>
                </div>
              </details>
            )}

            {!cleanAiBody && thinking ? (
              <div style={{ color: '#38bdf8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                <span className="dot" style={{ animation: 'pulse 1s infinite' }}>⏳</span>
                <span>AI 特级名师正在结合考点进行深度备课构思...</span>
              </div>
            ) : (() => {
              const renderMarkdownBlock = (rawText) => (
                <ReactMarkdown 
                  remarkPlugins={[remarkMath, remarkGfm]} 
                  rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
                  components={{
                    p({node, children, ...props}) {
                      return (
                        <p {...props} style={isPinyinActive ? { lineHeight: '2.1' } : {}}>
                          {injectPinyinToChildren(children, isPinyinActive)}
                        </p>
                      );
                    },
                    li({node, children, ...props}) {
                      return (
                        <li {...props} style={isPinyinActive ? { lineHeight: '2.1' } : {}}>
                          {injectPinyinToChildren(children, isPinyinActive)}
                        </li>
                      );
                    },
                    h3({node, children, ...props}) {
                      const text = Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : String(children || '');
                      let icon = '💡';
                      let borderColor = '#3b82f6';
                      let bgColor = 'rgba(59, 130, 246, 0.08)';
                      let badgeText = '知识点睛';

                      if (text.includes('原题') || text.includes('题目')) {
                        icon = '📝';
                        borderColor = '#38bdf8';
                        bgColor = 'rgba(56, 189, 248, 0.1)';
                        badgeText = '原题还原';
                      } else if (text.includes('挑战') || text.includes('母题模型') || text.includes('经典母题')) {
                        icon = '🎯';
                        borderColor = '#f59e0b';
                        bgColor = 'rgba(245, 158, 11, 0.12)';
                        badgeText = '母题挑战';
                      } else if (text.includes('题眼') || text.includes('陷阱') || text.includes('思路') || text.includes('考点')) {
                        icon = '🎯';
                        borderColor = '#f59e0b';
                        bgColor = 'rgba(245, 158, 11, 0.1)';
                        badgeText = '核心题眼';
                      } else if (text.includes('动笔') || text.includes('支架') || text.includes('设问') || text.includes('第一步')) {
                        icon = '✏️';
                        borderColor = '#3b82f6';
                        bgColor = 'rgba(59, 130, 246, 0.1)';
                        badgeText = '动笔设问';
                      } else if (text.includes('步骤') || text.includes('锦囊') || text.includes('解析') || text.includes('推导') || text.includes('答案')) {
                        icon = '📐';
                        borderColor = '#10b981';
                        bgColor = 'rgba(16, 185, 129, 0.1)';
                        badgeText = '完整演算';
                      } else if (text.includes('母题') || text.includes('举一反三') || text.includes('微练') || text.includes('过关') || text.includes('闯关')) {
                        icon = '🔥';
                        borderColor = '#8b5cf6';
                        bgColor = 'rgba(139, 92, 246, 0.12)';
                        badgeText = '举一反三';
                      } else if (text.includes('易错') || text.includes('盲区') || text.includes('注意')) {
                        icon = '⚠️';
                        borderColor = '#ef4444';
                        bgColor = 'rgba(239, 68, 68, 0.1)';
                        badgeText = '易错警示';
                      }

                      return (
                        <div 
                          className="scaffold-card-header" 
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.96rem',
                            padding: '8px 14px',
                            margin: '16px 0 10px 0',
                            borderRadius: '10px',
                            borderLeft: `4px solid ${borderColor}`,
                            backgroundColor: bgColor,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
                            <span {...props} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
                          </div>
                          <span style={{
                            fontSize: '0.72rem',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: borderColor,
                            color: '#ffffff',
                            fontWeight: 600,
                            letterSpacing: '0.5px',
                            flexShrink: 0
                          }}>
                            {badgeText}
                          </span>
                        </div>
                      );
                    },
                    pre({children, ...props}) {
                      const child = Array.isArray(children) ? children[0] : children;
                      if (child?.type === MermaidChart) {
                        return <>{children}</>;
                      }
                      return <pre {...props}>{children}</pre>;
                    },
                    code({node, inline, className, children, ...props}) {
                      const match = /language-(\w+)/.exec(className || '')
                      if (!inline && match && match[1] === 'mermaid') {
                        if (isStreaming) {
                          return (
                            <div className="mermaid-loading-placeholder">
                              <div className="brain-icon">🧠</div>
                              <div className="title">专属私教正在构思与绘制知识脑图...</div>
                              <div className="subtitle">打字输出完毕后将自动呈现思维导图</div>
                            </div>
                          )
                        }
                        return <MermaidChart chart={String(children).replace(/\n$/, '')} />
                      }
                      return <code className={className} {...props}>{children}</code>
                    },
                    table({children, ...props}) {
                      return (
                        <div className="table-responsive">
                          <table {...props}>{children}</table>
                        </div>
                      );
                    },
                    td({children, ...props}) {
                      const renderWithHtmlLineBreaks = (val) => {
                        if (typeof val === 'string') {
                          if (val.includes('<br>') || val.includes('<br />')) {
                            return val.split(/<br\s*\/?>/gi).map((text, i, arr) => (
                              <React.Fragment key={i}>
                                {text}
                                {i < arr.length - 1 && <br />}
                              </React.Fragment>
                            ));
                          }
                        }
                        if (React.isValidElement(val)) {
                          if (val.props && val.props.children) {
                            return React.cloneElement(val, {
                              ...val.props,
                              children: React.Children.map(val.props.children, renderWithHtmlLineBreaks)
                            });
                          }
                        }
                        if (Array.isArray(val)) {
                          return val.map((item, idx) => <React.Fragment key={idx}>{renderWithHtmlLineBreaks(item)}</React.Fragment>);
                        }
                        return val;
                      };
                      return <td {...props}>{React.Children.map(children, renderWithHtmlLineBreaks)}</td>;
                    }
                  }}
                >
                  {preprocessLatex(rawText)}
                </ReactMarkdown>
              );

              const sections = splitAnswerSections(cleanAiBody);
              if (sections) {
                return (
                  <div>
                    {renderMarkdownBlock(sections.preAnswer)}

                    {/* 自律防抄题·完整答案推导折叠手风琴 */}
                    <div className="answer-anti-peek-card" style={{
                      margin: '14px 0',
                      borderRadius: '14px',
                      background: isAnswerRevealed 
                        ? 'rgba(16, 185, 129, 0.05)' 
                        : 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.9))',
                      border: isAnswerRevealed 
                        ? '1px solid rgba(16, 185, 129, 0.35)' 
                        : '1px solid rgba(59, 130, 246, 0.4)',
                      padding: '12px 16px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{isAnswerRevealed ? '🔓' : '🙈'}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.92rem', color: isAnswerRevealed ? '#34d399' : '#93c5fd' }}>
                              {isAnswerRevealed ? '完整推导与标准答案已展开' : '完整推导与标准答案（自律防抄题保护中）'}
                            </div>
                            {!isAnswerRevealed && (
                              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                                💡 老师建议：先根据上方动笔支架在草稿纸算一算，有思路了再对答案！
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsAnswerRevealed(r => !r)}
                          style={{
                            padding: '5px 14px',
                            borderRadius: '10px',
                            background: isAnswerRevealed ? 'rgba(148, 163, 184, 0.15)' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
                            color: isAnswerRevealed ? '#cbd5e1' : '#ffffff',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            boxShadow: isAnswerRevealed ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.4)'
                          }}
                        >
                          {isAnswerRevealed ? '▲ 折叠答案' : '👁️ 查看完整答案推导'}
                        </button>
                      </div>
                      {isAnswerRevealed && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                          {renderMarkdownBlock(sections.answerBody)}
                        </div>
                      )}
                    </div>

                    {sections.postAnswer && renderMarkdownBlock(sections.postAnswer)}
                  </div>
                );
              }
              return renderMarkdownBlock(cleanAiBody);
            })()}
            <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {msg.role === 'ai' && onMarkMistake && (
                <button
                  onClick={() => onMarkMistake(msg)}
                  className="tts-btn"
                  style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: '#ef4444' }}
                  title="将此题加入错题本"
                >
                  🚩 标记错题
                </button>
              )}
              {msg.role === 'ai' && (
                <button
                  onClick={toggleSpeech}
                  className="tts-btn"
                  style={{ 
                    background: isPlaying ? 'rgba(239, 68, 68, 0.1)' : isLoadingAudio ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.1)', 
                    color: isPlaying ? '#ef4444' : isLoadingAudio ? '#f59e0b' : '#3b82f6', 
                    borderColor: isPlaying ? '#ef4444' : isLoadingAudio ? '#f59e0b' : '#3b82f6' 
                  }}
                  title={isPlaying ? "停止播放语音" : isLoadingAudio ? "正在准备语音..." : "播放语音"}
                >
                  {isPlaying ? "⏹️ 停止朗读" : isLoadingAudio ? "⏳ 正在加载语音..." : "🔊 语音朗读"}
                </button>
              )}
              {msg.role === 'ai' && isPrimary && (
                <button
                  type="button"
                  onClick={() => setPinyinMode(p => !p)}
                  className="tts-btn"
                  style={{ 
                    background: isPinyinActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.1)', 
                    color: isPinyinActive ? '#10b981' : '#94a3b8', 
                    borderColor: isPinyinActive ? '#10b981' : 'rgba(148, 163, 184, 0.3)' 
                  }}
                  title="为 1-3 年级切换汉字拼音注音（对标斑马/小猿）"
                >
                  {isPinyinActive ? '🔤 拼音: 开' : '🔤 拼音: 关'}
                </button>
              )}
              {msg.role === 'ai' && !isStreaming && (
                <button
                  type="button"
                  onClick={() => setShowVariantModal(true)}
                  className="tts-btn"
                  style={{ 
                    background: 'rgba(16, 185, 129, 0.12)', 
                    color: '#10b981', 
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                    fontWeight: '600'
                  }}
                  title="基于本题核心考点，生成同类巩固与避坑拔高变式题（对标作业帮）"
                >
                  🎯 举一反三·变式通关
                </button>
              )}
              {msg.role === 'ai' && !isStreaming && (
                <button
                  type="button"
                  onClick={() => {
                    if (!hasUnderstood) {
                      setHasUnderstood(true);
                      playSuccessChime();
                      if (onRewardExp) onRewardExp(5);
                    }
                  }}
                  className="tts-btn"
                  style={{ 
                    background: hasUnderstood ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.1)', 
                    color: '#10b981', 
                    borderColor: '#10b981',
                    fontWeight: 600
                  }}
                  title="标记我听懂了本题考点与方法"
                >
                  {hasUnderstood ? '🌟 听懂了 +5经验' : '👍 这一步我听懂了'}
                </button>
              )}
              {msg.role === 'ai' && !isStreaming && onQuickPrompt && (
                <button
                  type="button"
                  onClick={() => onQuickPrompt("老师，上面这道题我还是有点没搞懂，请换一个更生活化、通俗具象的例子或画个草图再讲讲好吗？")}
                  className="tts-btn"
                  style={{ 
                    background: 'rgba(245, 158, 11, 0.1)', 
                    color: '#f59e0b', 
                    borderColor: 'rgba(245, 158, 11, 0.35)',
                    fontWeight: 500
                  }}
                  title="如果还有疑问，让名师换一个更生活化通俗的例子讲解"
                >
                  🤔 没太懂，换个例子
                </button>
              )}
            </div>
            </div>
        ) : (
          displayMessageText.split('\n').map((line, i) => <span key={i}>{line}<br/></span>)
        )}
      </div>
      {msg.sources?.length > 0 && (
        <div className="sources-container">
          <div className="sources-label">📚 本地教材出处核验：</div>
          <div className="sources-pill-list">
            {msg.sources.map((src, i) => (
              <details key={i} className="source-pill-card">
                <summary className="source-pill-header">
                  <span className="source-pill-icon">📖</span>
                  <span className="source-pill-title">{src.source} · 第 {src.page} 页</span>
                  <span className="source-pill-expand-hint">查看教材原文 ▾</span>
                </summary>
                <div className="source-pill-body">
                  <div className="source-text">{src.text_snippet}</div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
      
      {showVariantModal && (
        <VariantPracticeModal
          isOpen={showVariantModal}
          onClose={() => setShowVariantModal(false)}
          originalQuestion={displayMessageText}
          originalAnswer={cleanAiBody}
          grade={activeGrade}
          subject={selectedSubject || '数学'}
          studentName={currentProfile?.name || '曾练'}
        />
      )}

    </div>
  );
});

export default ChatMessage;
