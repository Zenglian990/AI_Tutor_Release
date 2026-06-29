import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import React, { useState, useEffect, useRef } from 'react'
import { preprocessLatex } from '../utils/math'
import mermaid from 'mermaid'
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  useMaxWidth: false,
  securityLevel: 'loose',
  htmlLabels: false,
  flowchart: {
    htmlLabels: false,
    padding: 18,
    useWidth: true
  },
  mindmap: {
    htmlLabels: false
  }
});
const sanitizeMermaid = (code) => {
  if (typeof code !== 'string') return code;

  // 1. Clean math delimiters in the entire code block first
  let cleanedCode = code
    .replace(/\\\[/g, '') // remove \[
    .replace(/\\\]/g, '') // remove \]
    .replace(/\\\(/g, '') // remove \(
    .replace(/\\\)/g, '') // remove \)
    .replace(/\$/g, '')   // remove $
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pi/g, 'π')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\pm/g, '±')
    .replace(/\\ne/g, '≠')
    .replace(/\\angle/g, '∠');

  // Helper to clean remaining quotes/backslashes inside labels
  const cleanLabel = (label, fallback) => {
    const cleaned = label
      .replace(/\\/g, '') // strip remaining backslashes
      .replace(/"/g, '')  // strip double quotes entirely to prevent inner nesting conflict
      .trim();
    // If the label becomes empty after cleaning, use the node ID as fallback
    // In Mermaid, an empty label like A("") or A[""] crashes the parser.
    return cleaned === '' ? fallback : cleaned;
  };

  // Match node definitions:
  // 1. Match ID((...)) and safely downgrade to ID("...") to prevent lexical/parse errors in Mermaid
  let sanitized = cleanedCode.replace(/([a-zA-Z0-9_-]+)\s*\(\(([^)\r\n]*)\)\)/g, (match, id, label) => {
    return `${id}("${cleanLabel(label, id)}")`;
  });

  // 2. Match ID(...)
  sanitized = sanitized.replace(/([a-zA-Z0-9_-]+)\s*\(([^)\r\n]*)\)/g, (match, id, label) => {
    if (label.startsWith('"') && label.endsWith('"')) return match;
    if (label.startsWith('(') && label.endsWith(')')) return match;
    return `${id}("${cleanLabel(label, id)}")`;
  });

  // 3. Match ID[...]
  sanitized = sanitized.replace(/([a-zA-Z0-9_-]+)\s*\[([^\]\r\n]*)\]/g, (match, id, label) => {
    return `${id}["${cleanLabel(label, id)}"]`;
  });

  return sanitized;
};

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
        const id = `mermaid-${Math.random().toString(36).substring(7)}`;
        mermaid.render(id, sanitizedChart).then((result) => {
          if (svgRef.current) {
            // mermaid 已对输入做安全处理，直接使用原始 SVG 输出
            // 使用 DOMPurify 会导致 foreignObject 内的 HTML 文字被过滤，造成节点空白
            svgRef.current.innerHTML = result.svg;
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
          if (svgRef.current) svgRef.current.innerHTML = `<pre style="color:red;font-size:12px;">图表渲染错误: ${e.message}</pre>`;
        });
      } catch (error) {
        if (svgRef.current) svgRef.current.innerHTML = `<pre style="color:red;font-size:12px;">图表渲染错误: ${error.message}</pre>`;
      }
    }
  }, [chart]);

  const handleDownload = () => {
    const svgEl = svgRef.current?.querySelector('svg');
    if (!svgEl) return;

    // Clone the SVG so we can modify it safely without affecting the display
    const clonedSvg = svgEl.cloneNode(true);

    // Get width and height from viewBox or client bounds
    const viewBox = clonedSvg.getAttribute('viewBox');
    let width = 800;
    let height = 600;
    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      if (parts.length === 4) {
        width = parseFloat(parts[2]);
        height = parseFloat(parts[3]);
      }
    } else {
      const rect = svgEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        width = rect.width;
        height = rect.height;
      }
    }

    // Set explicit width and height attributes on the cloned SVG tag so the Image object can measure it
    clonedSvg.setAttribute('width', width);
    clonedSvg.setAttribute('height', height);
    clonedSvg.style.width = width + 'px';
    clonedSvg.style.height = height + 'px';

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(svgBlob);
    blobUrlRef.current = url;

    const img = new Image();
    img.crossOrigin = 'anonymous'; // Prevent security taint errors
    img.onload = () => {
      try {
        const scale = 2; // High-definition 2x scale for printing/zooming
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        
        // Fill canvas with a solid white background (instead of default black/transparent)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);

        const pngUrl = canvas.toDataURL('image/png');
        setGeneratedPngUrl(pngUrl);
        setShowSaveModal(true);

        // Also attempt auto-download for desktop convenience
        try {
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `思维导图_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (err) {
          console.warn("Auto-download failed or not supported in this client", err);
        }
      } catch (e) {
        console.error('Failed to convert mindmap to PNG, falling back to SVG:', e);
        triggerSvgFallback(url);
      }
    };
    
    img.onerror = (err) => {
      console.error('Image load failed for SVG download, falling back to direct SVG:', err);
      triggerSvgFallback(url);
    };

    function triggerSvgFallback(blobUrl) {
      setGeneratedPngUrl(blobUrl);
      setShowSaveModal(true);

      try {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `思维导图_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        console.warn("Auto-download fallback failed", err);
      }
    }

    img.src = url;
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




const ChatMessage = React.memo(function ChatMessage({ msg, autoRead, isLatest, isStreaming, onMarkMistake, playTTS, stopTTS }) {
  // Only play slide-in animation once when component first mounts, not on every re-render
  const animatedRef = useRef(false);
  const [animClass, setAnimClass] = useState('');
  useEffect(() => {
    if (!animatedRef.current) {
      animatedRef.current = true;
      setAnimClass('msg-slide-in');
    }
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);
  const hasPlayed = useRef(false);

  useEffect(() => {
    return () => {
      if (isPlaying) {
        if (stopTTS) stopTTS();
        else if (window.speechSynthesis) window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying, stopTTS]);



  const toggleSpeech = () => {
    if (isPlaying) {
      if (stopTTS) stopTTS();
      else if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      // 开启播放前，先执行一次全局停止，避免多个语音重叠
      if (stopTTS) stopTTS();
      
      setIsPlaying(true);
      if (playTTS) {
        playTTS(msg.text, () => setIsPlaying(true), () => setIsPlaying(false));
      } else {
        setIsPlaying(false);
      }
    }
  };

  return (
    <div className={`message-wrapper ${msg.role} ${animClass}`}>
      {msg.imageUrl && (
        <img src={msg.imageUrl} alt="上传的题目" className="uploaded-image" />
      )}
      <div className={`message ${msg.role}`}>
        {msg.role === 'ai' ? (
          <div>
            <ReactMarkdown 
              remarkPlugins={[remarkMath, remarkGfm]} 
              rehypePlugins={[rehypeKatex]}
              components={{
                pre({children, ...props}) {
                  // If the child is a MermaidChart (returned from code override), render without <pre> wrapper
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
              {preprocessLatex(msg.text)}
            </ReactMarkdown>
            <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
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
                    background: isPlaying ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', 
                    color: isPlaying ? '#ef4444' : '#3b82f6', 
                    borderColor: isPlaying ? '#ef4444' : '#3b82f6' 
                  }}
                  title={isPlaying ? "停止播放语音" : "播放语音"}
                >
                  {isPlaying ? "⏹️ 停止朗读" : "🔊 语音朗读"}
                </button>
              )}
            </div>
          </div>
        ) : (
          msg.text.split('\n').map((line, i) => <span key={i}>{line}<br/></span>)
        )}
      </div>
      {msg.sources?.length > 0 && (
        <div className="sources-container">
          <div className="sources-label">📚 参考来源：</div>
          {msg.sources.map((src, i) => (
            <div key={i} className="source-card" title={src.text_snippet}>
              <div className="source-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                </svg>
                {src.source} (第 {src.page} 页)
              </div>
              <div className="source-text">{src.text_snippet}</div>
            </div>
          ))}
        </div>
      )}
      

    </div>
  );
});

export default ChatMessage;
