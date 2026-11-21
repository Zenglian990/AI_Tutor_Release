import React, { useState, useRef, useEffect } from 'react';
import InteractiveMathCanvas from './InteractiveMathCanvas';
import { AUXILIARY_LINE_MODELS } from '../utils/geometryScaffolding';

/**
 * DynamicGeometrySandbox
 * 初中压轴动点、二次函数与几何辅助线因果动因逆推沙盒
 * 专为 7-9 年级心智模型打造：化抽象逻辑为动态轨迹，击穿中考动点与几何压轴痛点
 */
export default function DynamicGeometrySandbox({ isOpen, onClose, onApplyToChat }) {
  const [activeTab, setActiveTab] = useState('moving_point'); // 'moving_point' | 'parabola' | 'auxiliary_line' | 'interactive_canvas'

  // Moving Point States
  const [timeT, setTimeT] = useState(3); // t from 0 to 10 seconds
  const [isPlaying, setIsPlaying] = useState(false);
  const [pointSpeed, setPointSpeed] = useState(1); // 1 cm/s
  const [baseLength] = useState(10); // AB = 10
  const [triangleHeight] = useState(6); // height = 6

  // Parabola States
  const [paramA, setParamA] = useState(1); // a in y = a(x-h)^2 + k
  const [paramH, setParamH] = useState(1); // h (axis of symmetry)
  const [paramK, setParamK] = useState(-2); // k (vertex y)

  // Auxiliary Line States
  const [auxiliaryModelKey, setAuxiliaryModelKey] = useState('double_midpoint');
  const [showAuxiliary, setShowAuxiliary] = useState(true);

  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  // Animate moving point
  useEffect(() => {
    if (isPlaying && activeTab === 'moving_point') {
      const interval = setInterval(() => {
        setTimeT(prev => {
          if (prev >= 10) return 0;
          return Math.min(10, +(prev + 0.1).toFixed(1));
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isPlaying, activeTab]);

  // Render Canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (activeTab === 'moving_point') {
      // 1. Draw Grid
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // 2. Triangle Vertices
      const ptA = { x: 60, y: 220 };
      const ptB = { x: 380, y: 220 };
      const ptC = { x: 160, y: 50 };

      // Current Moving Point P
      const progress = Math.min(1, Math.max(0, timeT / 10));
      const ptP = {
        x: ptA.x + (ptB.x - ptA.x) * progress,
        y: ptA.y + (ptB.y - ptA.y) * progress
      };

      // Shaded triangle PAC
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.beginPath();
      ctx.moveTo(ptA.x, ptA.y);
      ctx.lineTo(ptP.x, ptP.y);
      ctx.lineTo(ptC.x, ptC.y);
      ctx.closePath();
      ctx.fill();

      // Main Triangle ABC
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(ptA.x, ptA.y);
      ctx.lineTo(ptB.x, ptB.y);
      ctx.lineTo(ptC.x, ptC.y);
      ctx.closePath();
      ctx.stroke();

      // Line CP
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ptC.x, ptC.y);
      ctx.lineTo(ptP.x, ptP.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Height line from C perpendicular to AB
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(ptC.x, ptC.y);
      ctx.lineTo(ptC.x, ptA.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.fillText('高 h = 6', ptC.x + 6, (ptC.y + ptA.y) / 2);

      // Points and Labels
      const drawPoint = (pt, label, color = '#1e293b', size = 5) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(label, pt.x - 4, pt.y + (pt.y > 150 ? 18 : -10));
      };

      drawPoint(ptA, 'A(0,0)');
      drawPoint(ptB, 'B(10,0)');
      drawPoint(ptC, 'C');
      drawPoint(ptP, `P(t=${timeT}s)`, '#dc2626', 7);

    } else if (activeTab === 'parabola') {
      // Parabola Coordinate Plot
      const midX = width / 2;
      const midY = height / 2;
      const scale = 25; // 25px = 1 unit

      // Axes
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, midY); ctx.lineTo(width, midY); // X
      ctx.moveTo(midX, 0); ctx.lineTo(midX, height); // Y
      ctx.stroke();

      // Grid
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += scale) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += scale) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // Parabola Curve: y = a*(x-h)^2 + k
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      let started = false;
      for (let px = 0; px < width; px += 2) {
        const xVal = (px - midX) / scale;
        const yVal = paramA * Math.pow(xVal - paramH, 2) + paramK;
        const py = midY - yVal * scale;
        if (py >= -50 && py <= height + 50) {
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
      }
      ctx.stroke();

      // Vertex Point
      const vx = midX + paramH * scale;
      const vy = midY - paramK * scale;
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(vx, vy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`顶点 (${paramH}, ${paramK})`, vx + 8, vy - 6);

      // Axis of Symmetry
      ctx.strokeStyle = '#ea580c';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(vx, 0); ctx.lineTo(vx, height);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (activeTab === 'auxiliary_line') {
      // 1. Draw Subtle Grid
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      const model = AUXILIARY_LINE_MODELS[auxiliaryModelKey] || AUXILIARY_LINE_MODELS.double_midpoint;
      const figure = model.default_figure;

      // 2. Draw Base Lines (Navy solid strokes)
      if (figure && figure.base_lines) {
        for (const line of figure.base_lines) {
          const p1 = figure.points[line.from];
          const p2 = figure.points[line.to];
          if (p1 && p2) {
            ctx.strokeStyle = line.color || '#1e293b';
            ctx.lineWidth = line.width || 2.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      // 3. Draw Auxiliary Lines (Red/gold dashed strokes)
      if (showAuxiliary && figure && figure.auxiliary_lines) {
        for (const line of figure.auxiliary_lines) {
          const p1 = figure.points[line.from];
          const p2 = figure.points[line.to];
          if (p1 && p2) {
            ctx.strokeStyle = line.color || '#ef4444';
            ctx.lineWidth = line.width || 2.5;
            ctx.setLineDash(line.dashed ? [6, 4] : []);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw label
            if (line.label) {
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              ctx.fillStyle = line.color || '#ef4444';
              ctx.font = 'bold 12px sans-serif';
              ctx.fillText(line.label, midX + 8, midY - 6);
            }
          }
        }
      }

      // 4. Draw Points & Labels
      if (figure && figure.points) {
        for (const [key, pt] of Object.entries(figure.points)) {
          if (!pt.label) continue;
          const isAuxPoint = key === 'E' || key === 'M' || key === 'F';
          if (isAuxPoint && !showAuxiliary) continue;

          ctx.fillStyle = isAuxPoint ? '#ef4444' : '#1e293b';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isAuxPoint ? 6 : 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = 'bold 12px sans-serif';
          ctx.fillStyle = isAuxPoint ? '#ef4444' : '#1e293b';
          ctx.fillText(pt.label, pt.x - 8, pt.y - 10);
        }
      }
    }
  }, [isOpen, activeTab, timeT, paramA, paramH, paramK, auxiliaryModelKey, showAuxiliary]);

  if (!isOpen) return null;

  // Real-time calculated Area
  const currentAP = +(timeT * pointSpeed).toFixed(1);
  const currentArea = +(0.5 * currentAP * triangleHeight).toFixed(1);
  const totalArea = +(0.5 * baseLength * triangleHeight).toFixed(1);

  const handleSendToChat = () => {
    let text = '';
    if (activeTab === 'moving_point') {
      text = `老师，我在动点沙盒中演练了动点 P 从 A 向 B 运动的问题：\n- 当 t = ${timeT} 秒时，AP = ${currentAP}，△PAC 面积为 ${currentArea}（总面积为 ${totalArea}）。\n请问在实际中考压轴题中，如果点 P 越过 B 点继续运动，或者求 △PAC 与原三角形面积比为 1:2 时，具体的分类讨论分段函数应如何严谨书写？`;
    } else if (activeTab === 'parabola') {
      text = `老师，我在二次函数沙盒中调整了解析式 y = ${paramA}(x - ${paramH})^2 + (${paramK})：\n- 顶点为 (${paramH}, ${paramK})，对称轴为 x = ${paramH}。\n请问如何利用顶点式与韦达定理，快速确定抛物线与 x 轴的交点距离以及割线斜率？`;
    } else if (activeTab === 'auxiliary_line') {
      const model = AUXILIARY_LINE_MODELS[auxiliaryModelKey] || AUXILIARY_LINE_MODELS.double_midpoint;
      text = `老师，我正在钻研初中几何压轴题中的【${model.name}】：\n- 痛点特征：${model.trigger_summary}\n- 辅助线做发：${model.construction_step}\n- 因果动因：${model.causal_rationale}\n请教名师：在具体压轴题遇到更复杂的折叠、旋转或动点综合背景时，如何迅速识破题目中的隐藏中点或互余直角，准确构造出这一条破题辅助线？`;
    }
    onApplyToChat && onApplyToChat(text);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '840px',
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          color: '#fff', padding: '18px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>📐</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800' }}>
                初中压轴动点与函数动态沙盒
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#bfdbfe', marginTop: '2px' }}>
                7-9年级动点轨迹模拟 · 直观攻克中考压轴综合题
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '6px 16px', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('moving_point')}
            style={{
              padding: '8px 16px', borderRadius: '12px', border: 'none',
              background: activeTab === 'moving_point' ? '#2563eb' : 'transparent',
              color: activeTab === 'moving_point' ? '#fff' : '#64748b',
              fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>🏃</span>
            <span>初中动点几何轨迹演练</span>
          </button>
          <button
            onClick={() => setActiveTab('parabola')}
            style={{
              padding: '8px 16px', borderRadius: '12px', border: 'none',
              background: activeTab === 'parabola' ? '#2563eb' : 'transparent',
              color: activeTab === 'parabola' ? '#fff' : '#64748b',
              fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>📈</span>
            <span>二次函数抛物线沙盒</span>
          </button>
          <button
            onClick={() => setActiveTab('auxiliary_line')}
            style={{
              padding: '8px 16px', borderRadius: '12px', border: 'none',
              background: activeTab === 'auxiliary_line' ? '#2563eb' : 'transparent',
              color: activeTab === 'auxiliary_line' ? '#fff' : '#64748b',
              fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>📐</span>
            <span>辅助线因果动因逆推台</span>
          </button>
          <button
            onClick={() => setActiveTab('interactive_canvas')}
            style={{
              padding: '8px 16px', borderRadius: '12px', border: 'none',
              background: activeTab === 'interactive_canvas' ? '#2563eb' : 'transparent',
              color: activeTab === 'interactive_canvas' ? '#fff' : '#64748b',
              fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>✨</span>
            <span>手势拖拽自由画板 (Khanmigo理念)</span>
          </button>
        </div>

        {/* Main interactive area */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'interactive_canvas' ? (
            <InteractiveMathCanvas
              onAskTutor={(query) => {
                onApplyToChat && onApplyToChat(query);
                onClose();
              }}
            />
          ) : (
            <>
              {/* Canvas Viewport */}
              <div style={{ display: 'flex', justifyContent: 'center', background: '#f8fafc', borderRadius: '16px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
                <canvas ref={canvasRef} width={440} height={260} style={{ display: 'block', maxWidth: '100%' }} />
              </div>

          {activeTab === 'moving_point' ? (
            /* Moving Point Controls & Insights */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Slider for t */}
              <div style={{ background: '#eff6ff', padding: '14px 18px', borderRadius: '14px', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '700', color: '#1e40af', fontSize: '0.95rem' }}>
                    动点时间 t = <span style={{ fontSize: '1.2rem', color: '#dc2626' }}>{timeT}</span> 秒
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      style={{
                        background: isPlaying ? '#ea580c' : '#10b981', color: '#fff',
                        border: 'none', borderRadius: '8px', padding: '4px 12px', fontWeight: 'bold', fontSize: '0.82rem', cursor: 'pointer'
                      }}
                    >
                      {isPlaying ? '⏸️ 暂停' : '▶️ 连续运动'}
                    </button>
                    <button
                      onClick={() => { setIsPlaying(false); setTimeT(0); }}
                      style={{
                        background: '#e2e8f0', color: '#475569',
                        border: 'none', borderRadius: '8px', padding: '4px 10px', fontWeight: 'bold', fontSize: '0.82rem', cursor: 'pointer'
                      }}
                    >
                      重置
                    </button>
                  </div>
                </div>

                <input
                  type="range" min="0" max="10" step="0.1"
                  value={timeT} onChange={e => { setIsPlaying(false); setTimeT(parseFloat(e.target.value)); }}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>

              {/* Dynamic stats cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>路程 AP (vt)</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#2563eb' }}>{currentAP}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>阴影 △PAC 面积</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#059669' }}>{currentArea}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>占总面积比例</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#d97706' }}>
                    {totalArea > 0 ? Math.round((currentArea / totalArea) * 100) : 0}%
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'parabola' ? (
            /* Parabola Controls */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', color: '#1e293b' }}>
                  解析式：y = {paramA}(x - {paramH})² + ({paramK})
                </span>
                <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: '600' }}>
                  对称轴 x = {paramH}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#1e40af', marginBottom: '4px' }}>开口 a ({paramA})</div>
                  <input type="range" min="-2" max="2" step="0.2" value={paramA} onChange={e => setParamA(parseFloat(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#166534', marginBottom: '4px' }}>对称轴 h ({paramH})</div>
                  <input type="range" min="-4" max="4" step="0.5" value={paramH} onChange={e => setParamH(parseFloat(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '4px' }}>顶点高度 k ({paramK})</div>
                  <input type="range" min="-5" max="5" step="0.5" value={paramK} onChange={e => setParamK(parseFloat(e.target.value))} style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          ) : (
            /* Auxiliary Line Reasoning Controls */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 4 Models Selector */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {Object.values(AUXILIARY_LINE_MODELS).map(m => {
                  const isSelected = auxiliaryModelKey === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setAuxiliaryModelKey(m.id)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '12px',
                        border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: isSelected ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ fontSize: '1.3rem' }}>{m.icon}</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: '800', color: isSelected ? '#1e40af' : '#334155' }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: isSelected ? '#2563eb' : '#94a3b8' }}>
                        {m.trigger_summary}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Toggle Auxiliary Line Visibility */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#1e293b' }}>
                  🛠️ 作法指令：
                  <span style={{ color: '#ef4444', marginLeft: '6px' }}>
                    {AUXILIARY_LINE_MODELS[auxiliaryModelKey]?.construction_step}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAuxiliary(v => !v)}
                  style={{
                    background: showAuxiliary ? '#ef4444' : '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {showAuxiliary ? '👁️ 辅助线：已显示 (点击隐藏自主思考)' : '🙈 辅助线：已隐藏 (点击揭晓破局线)'}
                </button>
              </div>

              {/* Master Causal Rationale Callout */}
              <div style={{
                background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
                border: '1px solid #fde047',
                borderRadius: '14px',
                padding: '14px 16px',
                color: '#713f12'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1.2rem' }}>💡</span>
                  <span style={{ fontWeight: '800', fontSize: '0.92rem', color: '#854d0e' }}>
                    特级名师因果动因逆推（为什么作这条辅助线？）
                  </span>
                </div>
                <div style={{ fontSize: '0.86rem', lineHeight: '1.6' }}>
                  {AUXILIARY_LINE_MODELS[auxiliaryModelKey]?.causal_rationale}
                </div>
              </div>

              {/* 3 Socratic Steps */}
              <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#334155', marginBottom: '8px' }}>
                  💬 启发式三步连环问（引导孩子自己推导）：
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {AUXILIARY_LINE_MODELS[auxiliaryModelKey]?.socratic_steps.map((step, idx) => (
                    <div key={idx} style={{ fontSize: '0.82rem', color: '#475569', display: 'flex', gap: '6px' }}>
                      <span style={{ color: '#2563eb', fontWeight: '700' }}>•</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
            </>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button
              onClick={onClose}
              style={{
                background: '#f1f5f9', color: '#475569', border: 'none',
                padding: '8px 16px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              关闭
            </button>
            <button
              onClick={handleSendToChat}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '10px',
                fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <span>💬</span>
              <span>带入中考压轴题向名师提问</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
