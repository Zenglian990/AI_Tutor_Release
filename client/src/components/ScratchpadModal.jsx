import React, { useRef, useState, useEffect, useCallback } from 'react';

export default function ScratchpadModal({ isOpen, onClose, onSendToTutor }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen'); // 'pen', 'line', 'eraser'
  const [color, setColor] = useState('#2563eb'); // default blue pen
  const [lineWidth, setLineWidth] = useState(3);
  const [gridMode, setGridMode] = useState('grid'); // 'blank', 'grid', 'coordinate', 'tian'
  
  // History for Undo/Redo
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);

  const startPosRef = useRef({ x: 0, y: 0 });
  const snapshotRef = useRef(null);

  // Draw background grid based on selected mode
  const drawBackground = useCallback((ctx, width, height) => {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (gridMode === 'grid') {
      // Math square grid
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      const step = 25;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (gridMode === 'coordinate') {
      // Cartesian coordinate plane
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      const step = 20;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      // Main X & Y axes
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      const midX = Math.floor(width / 2);
      const midY = Math.floor(height / 2);

      // X axis
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      // Y axis
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, height);
      ctx.stroke();

      // Origin text
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.fillText('O', midX + 4, midY + 14);
      ctx.fillText('x', width - 15, midY - 6);
      ctx.fillText('y', midX + 6, 15);
    } else if (gridMode === 'tian') {
      // Tian Zi Ge (Chinese character practice grid)
      const cellSize = 80;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      for (let x = 20; x + cellSize <= width; x += cellSize + 15) {
        for (let y = 20; y + cellSize <= height; y += cellSize + 15) {
          ctx.strokeRect(x, y, cellSize, cellSize);
          // Dashed center cross
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#fca5a5'; // subtle red dash
          ctx.beginPath();
          ctx.moveTo(x + cellSize / 2, y);
          ctx.lineTo(x + cellSize / 2, y + cellSize);
          ctx.moveTo(x, y + cellSize / 2);
          ctx.lineTo(x + cellSize, y + cellSize / 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }, [gridMode]);

  // Save current canvas state to history stack
  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    setHistory(prev => {
      const next = prev.slice(0, historyStep + 1);
      return [...next, dataUrl];
    });
    setHistoryStep(prev => prev + 1);
  }, [historyStep]);

  // Init canvas size and background
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = rect.height || 500;

    const ctx = canvas.getContext('2d');
    drawBackground(ctx, canvas.width, canvas.height);

    // Initial save
    const initialUrl = canvas.toDataURL();
    setHistory([initialUrl]);
    setHistoryStep(0);
  }, [isOpen, gridMode, drawBackground]);

  // Undo / Redo
  const handleUndo = () => {
    if (historyStep <= 0) return;
    const newStep = historyStep - 1;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = history[newStep];
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHistoryStep(newStep);
    };
  };

  const handleRedo = () => {
    if (historyStep >= history.length - 1) return;
    const newStep = historyStep + 1;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = history[newStep];
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHistoryStep(newStep);
    };
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawBackground(ctx, canvas.width, canvas.height);
    saveState();
  };

  // Coordinates helper
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // Drawing Handlers
  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getCoordinates(e);
    startPosRef.current = pos;
    setIsDrawing(true);

    if (tool === 'line') {
      snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getCoordinates(e);

    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineWidth * 4;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (tool === 'line') {
      if (snapshotRef.current) {
        ctx.putImageData(snapshotRef.current, 0, 0);
      }
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(startPosRef.current.x, startPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else {
      // Pen
      ctx.strokeStyle = color;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    saveState();
  };

  // Export to Tutor
  const handleSendToTutor = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const dataUrl = canvas.toDataURL('image/png');
      onSendToTutor(blob, dataUrl);
      onClose();
    }, 'image/png');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        width: '100%', maxWidth: '960px', height: '90vh', maxHeight: '720px',
        background: '#ffffff', borderRadius: '16px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
      }}>
        {/* Header toolbar */}
        <div style={{
          background: '#0f172a', color: 'white', padding: '12px 16px',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>📝 沉浸式演练草稿纸与白板</span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>支持手写演算、几何辅助线与函数画图</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleSendToTutor}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px',
                fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
              title="一键将演算草稿发送给AI导师点评指点"
            >
              🚀 请名师批改草稿
            </button>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer', padding: '0 6px' }}
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Secondary Tools Palette */}
        <div style={{
          background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 16px',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
        }}>
          {/* Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setTool('pen')}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1',
                background: tool === 'pen' ? '#3b82f6' : '#ffffff',
                color: tool === 'pen' ? '#ffffff' : '#334155',
                cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem'
              }}
            >
              ✏️ 铅笔
            </button>
            <button
              onClick={() => setTool('line')}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1',
                background: tool === 'line' ? '#3b82f6' : '#ffffff',
                color: tool === 'line' ? '#ffffff' : '#334155',
                cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem'
              }}
            >
              📏 直尺
            </button>
            <button
              onClick={() => setTool('eraser')}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1',
                background: tool === 'eraser' ? '#3b82f6' : '#ffffff',
                color: tool === 'eraser' ? '#ffffff' : '#334155',
                cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem'
              }}
            >
              🧹 橡皮
            </button>

            {/* Colors */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
              {['#1e293b', '#2563eb', '#dc2626', '#16a34a', '#d97706'].map(c => (
                <div
                  key={c}
                  onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
                  style={{
                    width: '20px', height: '20px', borderRadius: '50%', background: c, cursor: 'pointer',
                    border: color === c && tool !== 'eraser' ? '2px solid #000000' : '1px solid #cbd5e1',
                    transform: color === c && tool !== 'eraser' ? 'scale(1.2)' : 'scale(1)'
                  }}
                />
              ))}
            </div>

            {/* Line width */}
            <select
              aria-label="画笔粗细"
              value={lineWidth}
              onChange={e => setLineWidth(Number(e.target.value))}
              style={{ marginLeft: '8px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            >
              <option value="2">细线 (2px)</option>
              <option value="3">中线 (3px)</option>
              <option value="5">粗线 (5px)</option>
              <option value="8">重点标记 (8px)</option>
            </select>
          </div>

          {/* Background grid modes & History */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>底纹:</span>
            <select
              aria-label="草稿纸底纹模式"
              value={gridMode}
              onChange={e => setGridMode(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            >
              <option value="blank">⬜ 纯白画板</option>
              <option value="grid">📐 方格演算纸 (数学/竖式)</option>
              <option value="coordinate">📈 直角坐标系 (几何/函数)</option>
              <option value="tian">📝 田字格 (拼音/字形)</option>
            </select>

            <button
              onClick={handleUndo}
              disabled={historyStep <= 0}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: historyStep <= 0 ? 'not-allowed' : 'pointer', opacity: historyStep <= 0 ? 0.4 : 1 }}
              title="撤销"
            >
              ↩️ 撤销
            </button>
            <button
              onClick={handleRedo}
              disabled={historyStep >= history.length - 1}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: historyStep >= history.length - 1 ? 'not-allowed' : 'pointer', opacity: historyStep >= history.length - 1 ? 0.4 : 1 }}
              title="重做"
            >
              ↪️ 重做
            </button>
            <button
              onClick={handleClear}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#dc2626', cursor: 'pointer' }}
              title="清空画板"
            >
              🗑️ 清空
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f8fafc', touchAction: 'none' }}>
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            style={{ display: 'block', width: '100%', height: '100%', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
          />
        </div>
      </div>
    </div>
  );
}
