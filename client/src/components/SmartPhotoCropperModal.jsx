import React, { useState, useEffect, useRef, useCallback } from 'react';
import { removeShadowsAndEnhance } from '../utils/documentEnhancer';
import { inspectImageQuality } from '../utils/imageQualityInspector';
import { warpPerspective } from '../utils/perspectiveTransform';
import { playShutterSound } from '../utils/sensoryFeedback';

/**
 * SmartPhotoCropperModal
 * 对标作业帮/小猿搜题的智能拍照取景与透视矫正器
 * 核心特性：
 * 1. 毫秒级端侧图像质量与模糊度预检（拉普拉斯方差 + 亮度检测 + 截图侦测）
 * 2. 双模式：标准矩形选单题 🎯 + 自由四角透视拉平 📐（一键消除斜拍梯形变形）
 * 3. 积分图轻量级文档去阴影增强（将发灰发暗背景还原为纯净白纸黑字）
 * 4. 科技感激光扫描动画与即时状态反馈
 */
export default function SmartPhotoCropperModal({
  isOpen,
  imageFile,
  onConfirm,
  onClose
}) {
  const [imgObj, setImgObj] = useState(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [isEnhanced, setIsEnhanced] = useState(true); // 默认开启去阴影
  const [cropMode, setCropMode] = useState('box'); // 'box' (矩形) | 'perspective' (四角拉平)
  const [crop, setCrop] = useState({ x: 0.05, y: 0.08, width: 0.9, height: 0.84 }); // 归一化坐标 0-1
  const [corners, setCorners] = useState([
    { x: 0.05, y: 0.08 }, // TL
    { x: 0.95, y: 0.08 }, // TR
    { x: 0.95, y: 0.92 }, // BR
    { x: 0.05, y: 0.92 }  // BL
  ]);
  const [qualityInfo, setQualityInfo] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processStep, setProcessStep] = useState('');
  const [detectedQuestions, setDetectedQuestions] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [loupe, setLoupe] = useState({ visible: false, clientX: 0, clientY: 0, normX: 0, normY: 0 });

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const loupeCanvasRef = useRef(null);
  const dragRef = useRef({
    isDragging: false,
    handle: null,
    startX: 0,
    startY: 0,
    initialCrop: null,
    initialCorners: null
  });

  // 0. 自动分题识别 (对标小猿搜题多题一键框选)
  const handleAutoDetectQuestions = useCallback(async (targetFile = null) => {
    const fileToUse = targetFile || imageFile;
    if (!fileToUse || isDetecting) return;
    setIsDetecting(true);
    try {
      const formData = new FormData();
      formData.append('image', fileToUse);
      const res = await fetch('/api/vision/detect-questions', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.question_boxes) && data.question_boxes.length > 0) {
        setDetectedQuestions(data.question_boxes);
        // 默认自动聚焦第一题
        const first = data.question_boxes[0];
        setSelectedQuestionId(first.id);
        setCrop({
          x: Math.max(0.01, first.box.x - 0.01),
          y: Math.max(0.01, first.box.y - 0.01),
          width: Math.min(0.98, first.box.width + 0.02),
          height: Math.min(0.98, first.box.height + 0.02)
        });
      }
    } catch (err) {
      console.warn('Auto detect questions error:', err);
    } finally {
      setIsDetecting(false);
    }
  }, [imageFile, isDetecting]);

  // 1. 加载图片文件并执行前端毫秒级画质预检与静默分题
  useEffect(() => {
    if (!isOpen || !imageFile) {
      setImgObj(null);
      setRotation(0);
      setCrop({ x: 0.05, y: 0.08, width: 0.9, height: 0.84 });
      setCorners([
        { x: 0.05, y: 0.08 },
        { x: 0.95, y: 0.08 },
        { x: 0.95, y: 0.92 },
        { x: 0.05, y: 0.92 }
      ]);
      setQualityInfo(null);
      setDetectedQuestions([]);
      setSelectedQuestionId(null);
      setLoupe({ visible: false, clientX: 0, clientY: 0, normX: 0, normY: 0 });
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgObj(img);
      setCrop({ x: 0.05, y: 0.08, width: 0.9, height: 0.84 });
      setCorners([
        { x: 0.05, y: 0.08 },
        { x: 0.95, y: 0.08 },
        { x: 0.95, y: 0.92 },
        { x: 0.05, y: 0.92 }
      ]);
      // 毫秒级端侧画质预检
      try {
        const quality = inspectImageQuality(img);
        setQualityInfo(quality);
      } catch (e) {
        console.warn('[SmartCropper] Quality inspection warning:', e);
      }
      // 毫秒级静默并发启动 AI 分题（进入即扫，对标小猿搜题）
      handleAutoDetectQuestions(imageFile);
    };
    img.src = objectUrl;

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, imageFile]);

  // 1.5. 悬浮放大镜实时渲染
  useEffect(() => {
    if (loupe.visible && loupeCanvasRef.current && canvasRef.current) {
      const lCanvas = loupeCanvasRef.current;
      const srcCanvas = canvasRef.current;
      const lCtx = lCanvas.getContext('2d');
      const size = 96;
      const zoom = 2.2;
      const srcCenterX = Math.max(0, Math.min(srcCanvas.width, loupe.normX * srcCanvas.width));
      const srcCenterY = Math.max(0, Math.min(srcCanvas.height, loupe.normY * srcCanvas.height));
      const srcW = size / zoom;
      const srcH = size / zoom;

      lCtx.clearRect(0, 0, size, size);
      lCtx.drawImage(
        srcCanvas,
        srcCenterX - srcW / 2,
        srcCenterY - srcH / 2,
        srcW,
        srcH,
        0,
        0,
        size,
        size
      );

      // 绘制中心高亮十字准星
      lCtx.strokeStyle = '#10b981';
      lCtx.lineWidth = 1.5;
      lCtx.beginPath();
      lCtx.moveTo(size / 2 - 10, size / 2);
      lCtx.lineTo(size / 2 + 10, size / 2);
      lCtx.moveTo(size / 2, size / 2 - 10);
      lCtx.lineTo(size / 2, size / 2 + 10);
      lCtx.stroke();
    }
  }, [loupe]);

  // 2. 渲染主画布与去阴影处理
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgObj) return;

    const isRotated = rotation === 90 || rotation === 270;
    const baseW = isRotated ? imgObj.height : imgObj.width;
    const baseH = isRotated ? imgObj.width : imgObj.height;

    const maxDim = 1600;
    let scale = 1;
    if (Math.max(baseW, baseH) > maxDim) {
      scale = maxDim / Math.max(baseW, baseH);
    }

    canvas.width = Math.round(baseW * scale);
    canvas.height = Math.round(baseH * scale);
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    const drawW = isRotated ? canvas.height : canvas.width;
    const drawH = isRotated ? canvas.width : canvas.height;
    ctx.drawImage(imgObj, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    if (isEnhanced) {
      try {
        removeShadowsAndEnhance(canvas, {
          windowSizeRatio: 0.08,
          targetWhite: 245,
          contrastFactor: 1.15
        });
      } catch (err) {
        console.warn('[SmartCropper] Document enhance failed, using raw:', err);
      }
    }
  }, [imgObj, rotation, isEnhanced]);

  useEffect(() => {
    if (isOpen && imgObj) {
      renderCanvas();
    }
  }, [isOpen, imgObj, renderCanvas]);

  // 3. 拖拽逻辑（兼容桌面端鼠标与移动端触摸）
  const getEventCoords = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  const handlePointerDown = (handle, e) => {
    e.preventDefault();
    e.stopPropagation();
    const { clientX, clientY } = getEventCoords(e);
    dragRef.current = {
      isDragging: true,
      handle,
      startX: clientX,
      startY: clientY,
      initialCrop: { ...crop },
      initialCorners: corners.map(c => ({ ...c }))
    };

    const handlePointerMove = (moveEvent) => {
      if (!dragRef.current.isDragging || !containerRef.current) return;
      const { clientX: curX, clientY: curY } = getEventCoords(moveEvent);
      const rect = containerRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const deltaX = (curX - dragRef.current.startX) / rect.width;
      const deltaY = (curY - dragRef.current.startY) / rect.height;
      const curHandle = dragRef.current.handle;

      // ── 四角透视拉平拖拽 ──
      if (curHandle.startsWith('corner-')) {
        const cIdx = parseInt(curHandle.split('-')[1], 10);
        const init = dragRef.current.initialCorners[cIdx];
        const nextX = Math.max(0, Math.min(1, init.x + deltaX));
        const nextY = Math.max(0, Math.min(1, init.y + deltaY));
        setCorners(prev => {
          const next = [...prev];
          next[cIdx] = {
            x: Math.round(nextX * 1000) / 1000,
            y: Math.round(nextY * 1000) / 1000
          };
          return next;
        });
        setLoupe({
          visible: true,
          clientX: curX,
          clientY: curY,
          normX: nextX,
          normY: nextY
        });
        return;
      }

      // ── 矩形裁剪框拖拽 ──
      const init = dragRef.current.initialCrop;
      let nextX = init.x;
      let nextY = init.y;
      let nextW = init.width;
      let nextH = init.height;
      const minSize = 0.08;

      if (curHandle === 'move') {
        nextX = Math.max(0, Math.min(1 - init.width, init.x + deltaX));
        nextY = Math.max(0, Math.min(1 - init.height, init.y + deltaY));
      } else {
        if (curHandle.includes('w')) {
          const maxLeft = init.x + init.width - minSize;
          nextX = Math.max(0, Math.min(maxLeft, init.x + deltaX));
          nextW = init.width - (nextX - init.x);
        }
        if (curHandle.includes('e')) {
          nextW = Math.max(minSize, Math.min(1 - init.x, init.width + deltaX));
        }
        if (curHandle.includes('n')) {
          const maxTop = init.y + init.height - minSize;
          nextY = Math.max(0, Math.min(maxTop, init.y + deltaY));
          nextH = init.height - (nextY - init.y);
        }
        if (curHandle.includes('s')) {
          nextH = Math.max(minSize, Math.min(1 - init.y, init.height + deltaY));
        }

        // 触控悬浮放大镜微调显示
        let loupeNormX = nextX;
        let loupeNormY = nextY;
        if (curHandle.includes('e')) loupeNormX = nextX + nextW;
        else if (!curHandle.includes('w')) loupeNormX = nextX + nextW / 2;
        if (curHandle.includes('s')) loupeNormY = nextY + nextH;
        else if (!curHandle.includes('n')) loupeNormY = nextY + nextH / 2;

        setLoupe({
          visible: true,
          clientX: curX,
          clientY: curY,
          normX: loupeNormX,
          normY: loupeNormY
        });
      }

      setCrop({
        x: Math.round(nextX * 1000) / 1000,
        y: Math.round(nextY * 1000) / 1000,
        width: Math.round(nextW * 1000) / 1000,
        height: Math.round(nextH * 1000) / 1000
      });
    };

    const handlePointerUp = () => {
      dragRef.current.isDragging = false;
      setLoupe(prev => ({ ...prev, visible: false }));
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  // 4. 确认执行智能矫正拉平并导出高清 File
  const handleConfirmCrop = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    playShutterSound();
    setProcessing(true);
    setProcessStep(cropMode === 'perspective' ? '📐 正在进行四角透视校正拉平...' : '✂️ 正在提取试题高清切片...');

    try {
      const mimeType = 'image/jpeg';
      let exportCanvas = null;

      if (cropMode === 'perspective') {
        const pts = corners.map(c => ({
          x: c.x * canvas.width,
          y: c.y * canvas.height
        }));
        exportCanvas = document.createElement('canvas');
        warpPerspective(canvas, pts, exportCanvas);
      } else {
        const srcW = canvas.width;
        const srcH = canvas.height;
        const cropX = Math.floor(crop.x * srcW);
        const cropY = Math.floor(crop.y * srcH);
        const cropW = Math.max(10, Math.floor(crop.width * srcW));
        const cropH = Math.max(10, Math.floor(crop.height * srcH));

        exportCanvas = document.createElement('canvas');
        exportCanvas.width = cropW;
        exportCanvas.height = cropH;
        const cropCtx = exportCanvas.getContext('2d');
        cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      }

      setProcessStep('⚡ 优化试卷对比度与文字锐度...');
      await new Promise(r => setTimeout(r, 120)); // 让动效顺畅自然

      exportCanvas.toBlob((blob) => {
        if (!blob) {
          onClose();
          return;
        }
        const prefix = cropMode === 'perspective' ? 'warp' : 'crop';
        const croppedFile = new File([blob], `${prefix}_${Date.now()}.jpg`, {
          type: mimeType,
          lastModified: Date.now()
        });
        const dataUrl = exportCanvas.toDataURL(mimeType, 0.92);
        setProcessing(false);
        onConfirm(croppedFile, dataUrl);
      }, mimeType, 0.92);

    } catch (err) {
      console.error('[SmartCropper] Execution failed:', err);
      setProcessing(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(10, 15, 29, 0.96)',
      backdropFilter: 'blur(14px)',
      zIndex: 1300,
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      color: '#ffffff',
      paddingTop: 'max(10px, env(safe-area-inset-top, 0px))'
    }}>
      {/* 顶部标题栏与画质预检状态 */}
      <div style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(15, 23, 42, 0.9)',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.15rem' }}>📸</span>
          <span style={{ fontWeight: 'bold', fontSize: '0.96rem', letterSpacing: '0.5px' }}>
            拍题取景与矫正
          </span>
        </div>

        {/* 毫秒级端侧画质预检徽章 */}
        {qualityInfo && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.78rem',
            padding: '4px 8px',
            borderRadius: '10px',
            background: qualityInfo.isGood ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.18)',
            border: `1px solid ${qualityInfo.isGood ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.45)'}`,
            color: qualityInfo.isGood ? '#34d399' : '#fbbf24'
          }}>
            <span>{qualityInfo.isGood ? '✅' : '💡'}</span>
            <span>{qualityInfo.message}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '4px 8px',
            touchAction: 'manipulation'
          }}
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* 模式切换选项卡 (单题框选 VS 倾斜四角透视拉平 VS AI分题) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <button
          type="button"
          onClick={() => setCropMode('box')}
          style={{
            flex: 1,
            background: cropMode === 'box' ? '#2563eb' : 'rgba(255, 255, 255, 0.06)',
            color: cropMode === 'box' ? '#fff' : '#94a3b8',
            border: cropMode === 'box' ? '1px solid #3b82f6' : '1px solid transparent',
            padding: '6px 4px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            boxShadow: cropMode === 'box' ? '0 2px 8px rgba(37, 99, 235, 0.4)' : 'none',
            touchAction: 'manipulation'
          }}
        >
          <span>🎯</span>
          <span>单题框选</span>
        </button>

        <button
          type="button"
          onClick={() => setCropMode('perspective')}
          style={{
            flex: 1,
            background: cropMode === 'perspective' ? '#0ea5e9' : 'rgba(255, 255, 255, 0.06)',
            color: cropMode === 'perspective' ? '#fff' : '#94a3b8',
            border: cropMode === 'perspective' ? '1px solid #38bdf8' : '1px solid transparent',
            padding: '6px 4px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            boxShadow: cropMode === 'perspective' ? '0 2px 8px rgba(14, 165, 233, 0.4)' : 'none',
            touchAction: 'manipulation'
          }}
        >
          <span>📐</span>
          <span>透视拉平</span>
        </button>

        {/* 自动分题点选 */}
        <button
          type="button"
          onClick={handleAutoDetectQuestions}
          disabled={isDetecting}
          style={{
            flex: 1,
            background: detectedQuestions.length > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(16, 185, 129, 0.15)',
            color: detectedQuestions.length > 0 ? '#fff' : '#34d399',
            border: '1px solid #10b981',
            padding: '6px 4px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: isDetecting ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            boxShadow: detectedQuestions.length > 0 ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none',
            touchAction: 'manipulation'
          }}
        >
          <span>✨</span>
          <span>{isDetecting ? '分题中...' : (detectedQuestions.length > 0 ? `${detectedQuestions.length}题已分` : 'AI 分题')}</span>
        </button>
      </div>

      {/* 智能分题快捷点选胶囊栏 (小猿搜题/作业帮同款) */}
      {(detectedQuestions.length > 0 || isDetecting) && cropMode === 'box' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          padding: '6px 12px',
          background: 'rgba(15, 23, 42, 0.85)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          scrollbarWidth: 'none'
        }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {isDetecting ? '⚡ AI 正在扫描整页分题...' : '🎯 快捷点题：'}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedQuestionId('all');
              setCrop({ x: 0.04, y: 0.05, width: 0.92, height: 0.90 });
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '16px',
              border: selectedQuestionId === 'all' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)',
              background: selectedQuestionId === 'all' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.06)',
              color: selectedQuestionId === 'all' ? '#38bdf8' : '#cbd5e1',
              fontSize: '0.76rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            📄 全页
          </button>
          {detectedQuestions.map((q) => {
            const isSelected = selectedQuestionId === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setSelectedQuestionId(q.id);
                  setCrop({
                    x: Math.max(0.01, q.box.x - 0.01),
                    y: Math.max(0.01, q.box.y - 0.01),
                    width: Math.min(0.98, q.box.width + 0.02),
                    height: Math.min(0.98, q.box.height + 0.02)
                  });
                }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '16px',
                  border: isSelected ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.15)',
                  background: isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.06)',
                  color: isSelected ? '#34d399' : '#e2e8f0',
                  fontSize: '0.76rem',
                  fontWeight: isSelected ? '600' : 'normal',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>{q.title || `第 ${q.id} 题`}</span>
                {isSelected && <span>✔</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* 中部图片编辑画布区域 */}
      <div style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '12px'
      }}>
        {/* 画布包裹容器 */}
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'inline-block',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            borderRadius: '6px',
            overflow: 'hidden'
          }}
        >
          {/* 激光扫描线动画 */}
          {isDetecting && (
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: '3px',
              background: 'linear-gradient(90deg, transparent, #38bdf8, #10b981, transparent)',
              boxShadow: '0 0 15px #38bdf8, 0 0 25px #10b981',
              animation: 'laserScan 1.6s ease-in-out infinite',
              zIndex: 40,
              pointerEvents: 'none'
            }} />
          )}

          {/* 底层绘制 Canvas */}
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              maxWidth: '85vw',
              maxHeight: '48vh',
              objectFit: 'contain'
            }}
          />

          {/* 自动识别的题目点击热区 (小猿模式) */}
          {detectedQuestions.length > 0 && cropMode === 'box' && !processing && (
            detectedQuestions.map((q) => {
              const isSelected = selectedQuestionId === q.id;
              return (
                <div
                  key={q.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedQuestionId(q.id);
                    setCrop({
                      x: Math.max(0.01, q.box.x - 0.01),
                      y: Math.max(0.01, q.box.y - 0.01),
                      width: Math.min(0.98, q.box.width + 0.02),
                      height: Math.min(0.98, q.box.height + 0.02)
                    });
                  }}
                  style={{
                    position: 'absolute',
                    left: `${q.box.x * 100}%`,
                    top: `${q.box.y * 100}%`,
                    width: `${q.box.width * 100}%`,
                    height: `${q.box.height * 100}%`,
                    border: isSelected ? '2px solid #10b981' : '1.5px dashed rgba(56, 189, 248, 0.6)',
                    background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.05)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    zIndex: 25,
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '2px 4px',
                    boxSizing: 'border-box'
                  }}
                  title={`点击聚焦本题：${q.title}`}
                >
                  <span style={{
                    background: isSelected ? '#059669' : 'rgba(15, 23, 42, 0.85)',
                    color: '#fff',
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                  }}>
                    {q.title} 🎯
                  </span>
                </div>
              );
            })
          )}

          {/* 激光扫描科技感动画层 (对标作业帮搜题扫描仪) */}
          {processing && (
            <>
              <div className="laser-scanner-grid" />
              <div className="laser-scanner-line" />
              <div style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.92)',
                border: '1px solid #38bdf8',
                borderRadius: '20px',
                padding: '6px 16px',
                color: '#38bdf8',
                fontSize: '0.82rem',
                fontWeight: 600,
                zIndex: 60,
                boxShadow: '0 0 20px rgba(56, 189, 248, 0.5)',
                whiteSpace: 'nowrap'
              }}>
                {processStep}
              </div>
            </>
          )}

          {/* 模式 A：标准矩形裁剪遮罩与高亮框 */}
          {imgObj && cropMode === 'box' && !processing && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none'
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${crop.y * 100}%`, background: 'rgba(0,0,0,0.55)' }} />
              <div style={{ position: 'absolute', top: `${(crop.y + crop.height) * 100}%`, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)' }} />
              <div style={{ position: 'absolute', top: `${crop.y * 100}%`, left: 0, width: `${crop.x * 100}%`, height: `${crop.height * 100}%`, background: 'rgba(0,0,0,0.55)' }} />
              <div style={{ position: 'absolute', top: `${crop.y * 100}%`, left: `${(crop.x + crop.width) * 100}%`, right: 0, height: `${crop.height * 100}%`, background: 'rgba(0,0,0,0.55)' }} />

              <div
                onMouseDown={(e) => handlePointerDown('move', e)}
                onTouchStart={(e) => handlePointerDown('move', e)}
                style={{
                  position: 'absolute',
                  top: `${crop.y * 100}%`,
                  left: `${crop.x * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                  border: '2px solid #38bdf8',
                  boxShadow: '0 0 15px rgba(56, 189, 248, 0.4), inset 0 0 10px rgba(56, 189, 248, 0.2)',
                  pointerEvents: 'auto',
                  cursor: 'move',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ position: 'absolute', top: '33.3%', left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: '66.6%', left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: '33.3%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: '66.6%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />

                {['nw', 'ne', 'sw', 'se'].map((pos) => {
                  const isTop = pos.includes('n');
                  const isLeft = pos.includes('w');
                  return (
                    <div
                      key={pos}
                      onMouseDown={(e) => handlePointerDown(pos, e)}
                      onTouchStart={(e) => handlePointerDown(pos, e)}
                      style={{
                        position: 'absolute',
                        top: isTop ? '-8px' : 'auto',
                        bottom: !isTop ? '-8px' : 'auto',
                        left: isLeft ? '-8px' : 'auto',
                        right: !isLeft ? '-8px' : 'auto',
                        width: '20px',
                        height: '20px',
                        background: '#ffffff',
                        border: '3px solid #0284c7',
                        borderRadius: '4px',
                        cursor: `${pos}-resize`,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                        zIndex: 10
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* 模式 B：四角透视自由拉平 (4 Corner Perspective Warp) */}
          {imgObj && cropMode === 'perspective' && !processing && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none'
              }}
            >
              {/* SVG 多边形连线 */}
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 8
                }}
              >
                <polygon
                  points={`${corners[0].x * 100}%,${corners[0].y * 100}% ${corners[1].x * 100}%,${corners[1].y * 100}% ${corners[2].x * 100}%,${corners[2].y * 100}% ${corners[3].x * 100}%,${corners[3].y * 100}%`}
                  fill="rgba(14, 165, 233, 0.12)"
                  stroke="#0ea5e9"
                  strokeWidth="2.5"
                  strokeDasharray="4 3"
                />
              </svg>

              {/* 4 个可拖拽自由角标 */}
              {corners.map((c, idx) => {
                const labels = ['左上', '右上', '右下', '左下'];
                return (
                  <div
                    key={idx}
                    onMouseDown={(e) => handlePointerDown(`corner-${idx}`, e)}
                    onTouchStart={(e) => handlePointerDown(`corner-${idx}`, e)}
                    style={{
                      position: 'absolute',
                      top: `${c.y * 100}%`,
                      left: `${c.x * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: '#38bdf8',
                      border: '3px solid #ffffff',
                      boxShadow: '0 0 12px rgba(56, 189, 248, 0.8)',
                      cursor: 'grab',
                      pointerEvents: 'auto',
                      zIndex: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0f172a',
                      fontSize: '0.65rem',
                      fontWeight: 800
                    }}
                    title={`拖拽对齐试卷${labels[idx]}边角`}
                  >
                    {idx + 1}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 底部功能栏 (带完整的系统安全区域保护，远离手机 Home 键) */}
      <div style={{
        paddingTop: '10px',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
        paddingBottom: 'max(44px, calc(18px + env(safe-area-inset-bottom, 36px)))',
        background: '#090d16',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.75)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 1400
      }}>
        {/* 第一行：快捷辅助微调工具 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px'
        }}>
          <button
            type="button"
            onClick={() => setRotation(r => (r + 90) % 360)}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              touchAction: 'manipulation'
            }}
          >
            <span>🔄</span> 顺时针90°
          </button>

          <button
            type="button"
            onClick={() => setIsEnhanced(v => !v)}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: '8px',
              background: isEnhanced ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : 'rgba(255, 255, 255, 0.08)',
              border: isEnhanced ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              touchAction: 'manipulation'
            }}
          >
            <span>✨</span> {isEnhanced ? '去阴影: 开' : '去阴影: 关'}
          </button>

          <button
            type="button"
            onClick={() => {
              setCrop({ x: 0.02, y: 0.02, width: 0.96, height: 0.96 });
              setCorners([
                { x: 0.02, y: 0.02 },
                { x: 0.98, y: 0.02 },
                { x: 0.98, y: 0.98 },
                { x: 0.02, y: 0.98 }
              ]);
            }}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              touchAction: 'manipulation'
            }}
          >
            <span>🔲</span> 全选重置
          </button>
        </div>

        {/* 第二行：核心操作按钮 (舒适大按键，完全避开手机底部虚拟导航栏与 Home 键) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '84px',
              height: '46px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#cbd5e1',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation'
            }}
          >
            取消
          </button>

          <button
            type="button"
            disabled={processing}
            onClick={handleConfirmCrop}
            style={{
              flex: 1,
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '0.96rem',
              letterSpacing: '0.5px',
              cursor: processing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(37, 99, 235, 0.5)',
              touchAction: 'manipulation'
            }}
          >
            <span style={{ fontSize: '1.15rem' }}>{cropMode === 'perspective' ? '📐' : '✂️'}</span>
            <span>{processing ? '处理中...' : (cropMode === 'perspective' ? '透视拉平并立即讲题' : '确认取景并立即讲题')}</span>
          </button>
        </div>
      </div>

      {/* 触控悬浮微调放大镜 (Loupe) */}
      {loupe.visible && (
        <div style={{
          position: 'fixed',
          left: Math.max(10, Math.min(window.innerWidth - 105, loupe.clientX - 48)),
          top: Math.max(10, loupe.clientY - 115),
          width: '96px',
          height: '96px',
          borderRadius: '50%',
          overflow: 'hidden',
          border: '3px solid #10b981',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.75)',
          background: '#000',
          zIndex: 9999,
          pointerEvents: 'none'
        }}>
          <canvas
            ref={loupeCanvasRef}
            width="96"
            height="96"
            style={{ width: '96px', height: '96px', display: 'block' }}
          />
        </div>
      )}
    </div>
  );
}
