import React, { useState, useRef, useCallback } from 'react';

/**
 * InteractiveMathCanvas
 * 对标 Khanmigo 2026 与 Mafs 理念的轻量级可拖拽交互数学画板
 * 纯 SVG 矢量渲染 · 60fps 手势触摸拖拽 · 零外部大型依赖
 */
export default function InteractiveMathCanvas({
  initialType = 'parabola',
  initialParams = {},
  title = '',
  onAskTutor = null
}) {
  const [mode, setMode] = useState(initialParams.type || initialType || 'parabola');

  // Parabola State: y = a(x - h)^2 + k
  const [paramA, setParamA] = useState(initialParams.a ?? 1);
  const [vertexH, setVertexH] = useState(initialParams.h ?? 1);
  const [vertexK, setVertexK] = useState(initialParams.k ?? -2);

  // Triangle State: Points A, B, C in coordinate units (-5 to 5)
  const [points, setPoints] = useState(initialParams.points || {
    A: { x: -3, y: -2, label: 'A' },
    B: { x: 3, y: -2, label: 'B' },
    C: { x: -3, y: 2, label: 'C' }
  });
  const [showAltitude, setShowAltitude] = useState(true);

  // Dragging state
  const [draggingTarget, setDraggingTarget] = useState(null); // 'vertex' | 'A' | 'B' | 'C'
  const svgRef = useRef(null);

  // ViewBox & Coordinate Space: width 360, height 260
  // Origin (0,0) at center (180, 130)
  // Scale: 24 pixels per unit
  const width = 360;
  const height = 260;
  const originX = width / 2;
  const originY = height / 2;
  const scale = 22;

  const toSvgX = (x) => originX + x * scale;
  const toSvgY = (y) => originY - y * scale;
  const fromSvgX = (svgX) => +((svgX - originX) / scale).toFixed(1);
  const fromSvgY = (svgY) => -+((svgY - originY) / scale).toFixed(1);

  // Coordinate Conversion on Pointer Event
  const getPointerCoord = useCallback((e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;
    return {
      x: Math.max(-6, Math.min(6, fromSvgX(rawX))),
      y: Math.max(-5, Math.min(5, fromSvgY(rawY)))
    };
  }, []);

  const handlePointerDown = (target) => (e) => {
    e.preventDefault();
    setDraggingTarget(target);
  };

  const handlePointerMove = (e) => {
    if (!draggingTarget) return;
    const coord = getPointerCoord(e);

    if (draggingTarget === 'vertex') {
      setVertexH(coord.x);
      setVertexK(coord.y);
    } else if (points[draggingTarget]) {
      setPoints(prev => ({
        ...prev,
        [draggingTarget]: { ...prev[draggingTarget], x: coord.x, y: coord.y }
      }));
    }
  };

  const handlePointerUp = () => {
    setDraggingTarget(null);
  };

  // Generate Parabola Path Data
  const generateParabolaPath = () => {
    const pointsList = [];
    for (let x = -7; x <= 7; x += 0.25) {
      const y = paramA * Math.pow(x - vertexH, 2) + vertexK;
      if (y >= -6 && y <= 6) {
        pointsList.push(`${toSvgX(x)},${toSvgY(y)}`);
      }
    }
    return pointsList.length > 1 ? `M ${pointsList.join(' L ')}` : '';
  };

  // Triangle Calculations
  const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const sideAB = +(dist(points.A, points.B)).toFixed(2);
  const sideBC = +(dist(points.B, points.C)).toFixed(2);
  const sideCA = +(dist(points.C, points.A)).toFixed(2);

  // Check Pythagorean: is any permutation close to right triangle?
  const sidesSorted = [sideAB, sideBC, sideCA].sort((a, b) => a - b);
  const isRightTriangle = Math.abs(Math.pow(sidesSorted[0], 2) + Math.pow(sidesSorted[1], 2) - Math.pow(sidesSorted[2], 2)) < 0.8;

  // Ask Tutor helper
  const handleAskTutorClick = () => {
    let question = '';
    if (mode === 'parabola') {
      question = `老师，我正在画板上探究二次函数 y = ${paramA}(x - ${vertexH})² + (${vertexK})。当顶点在(${vertexH}, ${vertexK})且 a=${paramA} 时，帮我详细推导对称轴、极值与单调区间。`;
    } else {
      question = `老师，我在几何画板上拉出了一个三角形，三边长分别为 ${sideAB}、${sideBC}、${sideCA}${isRightTriangle ? '（满足勾股定理为直角三角形）' : ''}，请问它的核心几何性质与高线作法该如何梳理？`;
    }

    if (onAskTutor) {
      onAskTutor(question);
    } else {
      // Dispatch global event for chat input
      window.dispatchEvent(new CustomEvent('insert_ai_tutor_query', { detail: { query: question } }));
    }
  };

  return (
    <div className="interactive-math-card" style={{
      margin: '12px 0',
      background: '#ffffff',
      border: '1.5px solid #e2e8f0',
      borderRadius: '14px',
      overflow: 'hidden',
      boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📐</span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>
            {title || (mode === 'parabola' ? '二次函数动态探究画板' : '几何三角形与勾股画板')}
          </span>
          <span style={{
            fontSize: '11px',
            background: '#e0f2fe',
            color: '#0369a1',
            padding: '2px 8px',
            borderRadius: '10px',
            fontWeight: 500
          }}>可手指拖拽顶点</span>
        </div>

        {/* Mode switch */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setMode('parabola')}
            style={{
              padding: '3px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'parabola' ? '#2563eb' : '#f1f5f9',
              color: mode === 'parabola' ? '#ffffff' : '#64748b'
            }}
          >抛物线</button>
          <button
            type="button"
            onClick={() => setMode('triangle')}
            style={{
              padding: '3px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'triangle' ? '#2563eb' : '#f1f5f9',
              color: mode === 'triangle' ? '#ffffff' : '#64748b'
            }}
          >三角形</button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div style={{ position: 'relative', width: '100%', userSelect: 'none', touchAction: 'none' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', background: '#fafafa', cursor: draggingTarget ? 'grabbing' : 'default' }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width={scale} height={scale} patternUnits="userSpaceOnUse">
              <path d={`M ${scale} 0 L 0 0 0 ${scale}`} fill="none" stroke="#f1f5f9" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#grid)" />

          {/* Coordinate Axes */}
          <line x1={0} y1={originY} x2={width} y2={originY} stroke="#cbd5e1" strokeWidth="1.5" />
          <line x1={originX} y1={0} x2={originX} y2={height} stroke="#cbd5e1" strokeWidth="1.5" />
          {/* Axis arrows */}
          <polygon points={`${width-6},${originY-3} ${width},${originY} ${width-6},${originY+3}`} fill="#94a3b8" />
          <polygon points={`${originX-3},6 ${originX},0 ${originX+3},6`} fill="#94a3b8" />
          <text x={width - 12} y={originY - 6} fill="#94a3b8" fontSize="10">x</text>
          <text x={originX + 8} y={12} fill="#94a3b8" fontSize="10">y</text>

          {mode === 'parabola' ? (
            <>
              {/* Axis of symmetry: x = h */}
              <line
                x1={toSvgX(vertexH)}
                y1={0}
                x2={toSvgX(vertexH)}
                y2={height}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />

              {/* Parabola curve */}
              <path
                d={generateParabolaPath()}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
              />

              {/* Vertex Point (Draggable) */}
              <g
                onPointerDown={handlePointerDown('vertex')}
                style={{ cursor: 'grab' }}
              >
                <circle
                  cx={toSvgX(vertexH)}
                  cy={toSvgY(vertexK)}
                  r="8"
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
                <circle
                  cx={toSvgX(vertexH)}
                  cy={toSvgY(vertexK)}
                  r="14"
                  fill="rgba(239, 68, 68, 0.2)"
                />
                <text
                  x={toSvgX(vertexH) + 12}
                  y={toSvgY(vertexK) - 6}
                  fill="#b91c1c"
                  fontWeight="600"
                  fontSize="12"
                >
                  顶点 ({vertexH}, {vertexK})
                </text>
              </g>
            </>
          ) : (
            <>
              {/* Triangle polygon */}
              <polygon
                points={`${toSvgX(points.A.x)},${toSvgY(points.A.y)} ${toSvgX(points.B.x)},${toSvgY(points.B.y)} ${toSvgX(points.C.x)},${toSvgY(points.C.y)}`}
                fill="rgba(59, 130, 246, 0.15)"
                stroke="#2563eb"
                strokeWidth="2"
              />

              {/* Altitude helper line if enabled */}
              {showAltitude && (
                <line
                  x1={toSvgX(points.C.x)}
                  y1={toSvgY(points.C.y)}
                  x2={toSvgX(points.C.x)}
                  y2={toSvgY(points.A.y)}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}

              {/* Draggable Points A, B, C */}
              {['A', 'B', 'C'].map((pKey) => {
                const pt = points[pKey];
                return (
                  <g key={pKey} onPointerDown={handlePointerDown(pKey)} style={{ cursor: 'grab' }}>
                    <circle
                      cx={toSvgX(pt.x)}
                      cy={toSvgY(pt.y)}
                      r="7"
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <circle
                      cx={toSvgX(pt.x)}
                      cy={toSvgY(pt.y)}
                      r="13"
                      fill="rgba(59, 130, 246, 0.2)"
                    />
                    <text
                      x={toSvgX(pt.x) + 10}
                      y={toSvgY(pt.y) - 6}
                      fill="#1e40af"
                      fontWeight="600"
                      fontSize="12"
                    >
                      {pKey} ({pt.x}, {pt.y})
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </svg>
      </div>

      {/* Control & Analysis Panel */}
      <div style={{ padding: '10px 14px', background: '#ffffff', borderTop: '1px solid #f1f5f9' }}>
        {mode === 'parabola' ? (
          <div>
            {/* Slider for a */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: '#475569', minWidth: '85px' }}>
                开口系数 a: <b>{paramA}</b>
              </span>
              <input
                type="range"
                min="-3"
                max="3"
                step="0.2"
                value={paramA}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setParamA(val === 0 ? 0.2 : val);
                }}
                style={{ flex: 1, accentColor: '#2563eb' }}
              />
            </div>

            {/* Formula badge & properties */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              fontSize: '12px',
              color: '#334155',
              background: '#f8fafc',
              padding: '8px',
              borderRadius: '8px'
            }}>
              <span style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                解析式: <b>y = {paramA}(x {vertexH >= 0 ? `- ${vertexH}` : `+ ${Math.abs(vertexH)}`})² {vertexK >= 0 ? `+ ${vertexK}` : `- ${Math.abs(vertexK)}`}</b>
              </span>
              <span>对称轴: <b>x = {vertexH}</b></span>
              <span>{paramA > 0 ? '🔺 开口向上 (有最小值)' : '🔻 开口向下 (有最大值)'}</span>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: '#475569' }}>
                三边长: AB = <b>{sideAB}</b>, BC = <b>{sideBC}</b>, CA = <b>{sideCA}</b>
              </span>
              <label style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showAltitude}
                  onChange={(e) => setShowAltitude(e.target.checked)}
                />
                显示辅助高线
              </label>
            </div>

            <div style={{
              padding: '6px 8px',
              background: isRightTriangle ? '#ecfdf5' : '#f8fafc',
              border: isRightTriangle ? '1px solid #6ee7b7' : 'none',
              borderRadius: '6px',
              fontSize: '12px',
              color: isRightTriangle ? '#065f46' : '#64748b'
            }}>
              {isRightTriangle ? (
                <span>📐 <b>勾股定理成立！</b> 两直角边平方和等于斜边平方。</span>
              ) : (
                <span>任意两边之和大于第三边（两边之差小于第三边）。</span>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleAskTutorClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
            }}
          >
            <span>💬</span> 带入此图像向私教提问
          </button>
        </div>
      </div>
    </div>
  );
}
