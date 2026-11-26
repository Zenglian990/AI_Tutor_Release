import React, { useState, useEffect, useRef } from 'react';

/**
 * PhysicsSimulatorsModal
 * 初中物理动态虚拟微实验台 (对标 NOBOOK 物理实验 / 仿真物理实验室)
 * 
 * 模块一：🔍 凸透镜成像规律动态光路台 (高斯透镜成像方程 1/u + 1/v = 1/f)
 * 模块二：⚡ 欧姆定律与滑动变阻器电路动态仿真 (I = U / (R0 + Rp))
 */
export default function PhysicsSimulatorsModal({
  isOpen,
  onClose,
  onApplyToChat,
  currentGrade = '8_up'
}) {
  const isHighSchool = ['10', '11', '12'].some(n => String(currentGrade || '').startsWith(n));
  const [activeTab, setActiveTab] = useState(isHighSchool ? 'lorentz' : 'optics'); // 'optics' | 'circuits' | 'lorentz'

  useEffect(() => {
    if (isOpen) {
      setActiveTab(isHighSchool ? 'lorentz' : 'optics');
    }
  }, [isOpen, isHighSchool]);

  // High School Lorentz Force State (R = mv / qB)
  const [velocity, setVelocity] = useState(4); // ×10^5 m/s
  const [magneticB, setMagneticB] = useState(0.5); // T
  const [chargeMassRatio, setChargeMassRatio] = useState(2); // q/m scale

  // Optics State
  const [focalLength, setFocalLength] = useState(10); // f in cm
  const [objectDistance, setObjectDistance] = useState(25); // u in cm
  const [candleHeight, setCandleHeight] = useState(40); // px

  // Circuit State
  const [voltage, setVoltage] = useState(6); // Volts
  const [fixedResistor, setFixedResistor] = useState(10); // Ohms
  const [rheostatVal, setRheostatVal] = useState(15); // Ohms
  const [isSwitchClosed, setIsSwitchClosed] = useState(true);

  if (!isOpen) return null;

  // Calculate Optics Image properties
  // 1/u + 1/v = 1/f => 1/v = 1/f - 1/u = (u - f) / (f * u) => v = (f * u) / (u - f)
  const isAtFocalPoint = Math.abs(objectDistance - focalLength) < 0.1;
  let imageDistance = 0;
  let isVirtual = false;
  let magnification = 1;
  let imageHeight = 0;
  let natureText = '';
  let applicationText = '';

  if (isAtFocalPoint) {
    natureText = '不成像 (平行光线出射)';
    applicationText = '探照灯、聚光手电筒';
  } else if (objectDistance > focalLength) {
    // Real image
    imageDistance = (focalLength * objectDistance) / (objectDistance - focalLength);
    magnification = imageDistance / objectDistance;
    imageHeight = candleHeight * magnification;
    isVirtual = false;

    if (objectDistance > 2 * focalLength) {
      natureText = '倒立、缩小、实像';
      applicationText = '照相机、手机摄像头';
    } else if (Math.abs(objectDistance - 2 * focalLength) < 0.2) {
      natureText = '倒立、等大、实像';
      applicationText = '测定凸透镜焦距';
    } else {
      natureText = '倒立、放大、实像';
      applicationText = '投影仪、幻灯机、电影放映机';
    }
  } else {
    // Virtual image (u < f)
    imageDistance = (focalLength * objectDistance) / (focalLength - objectDistance);
    magnification = imageDistance / objectDistance;
    imageHeight = candleHeight * magnification;
    isVirtual = true;
    natureText = '正立、放大、虚像';
    applicationText = '放大镜、老花眼镜';
  }

  // Calculate Circuit values
  const totalResistance = fixedResistor + rheostatVal;
  const current = isSwitchClosed ? (voltage / totalResistance) : 0;
  const fixedVoltage = current * fixedResistor;
  const rheostatVoltage = current * rheostatVal;
  const power = current * current * fixedResistor;
  const bulbGlow = Math.min(1, power / 3.6); // normalized brightness

  const handleSendOpticsToChat = () => {
    const text = `老师，我在物理虚拟微实验台上模拟了【凸透镜成像】：\n` +
      `焦距 f = ${focalLength} cm，当前物距 u = ${objectDistance} cm (${objectDistance > 2 * focalLength ? 'u > 2f' : objectDistance === 2 * focalLength ? 'u = 2f' : objectDistance > focalLength ? 'f < u < 2f' : 'u < f'})。\n` +
      `系统测得成像性质为【${natureText}】，像距 v ≈ ${imageDistance.toFixed(1)} cm，应用场景为【${applicationText}】。\n` +
      `请问老师，中考在此知识点上常考的“物近像远像变大”动态规律，我该如何用光路图逻辑秒杀选择与实验探究题？`;
    onApplyToChat && onApplyToChat(text);
    onClose();
  };

  const handleSendCircuitToChat = () => {
    const text = `老师，我在物理虚拟微实验台上搭建了【欧姆定律滑动变阻器电路】：\n` +
      `电源电压 U = ${voltage} V，定值电阻 R₀ = ${fixedResistor} Ω，滑动变阻器当前接入阻值 Rp = ${rheostatVal} Ω。\n` +
      `闭合开关后，电流表示数 I = ${current.toFixed(2)} A，定值电阻两端电压表 U₀ = ${fixedVoltage.toFixed(2)} V，变阻器分压 Up = ${rheostatVoltage.toFixed(2)} V。\n` +
      `请问老师，当滑片向右滑动（变阻器阻值变大）时，中考电学选择题中“定值电阻电压”与“变阻器电压”的互补变化规律，有什么速记口诀吗？`;
    onApplyToChat && onApplyToChat(text);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '8px', boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: 'min(780px, calc(100vw - 16px))',
        maxHeight: '94vh', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box'
      }}>
        {/* Top Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          color: '#ffffff', padding: '14px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🔬</span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, lineHeight: 1.3 }}>
                {isHighSchool ? '高中·初中物理动态虚拟微实验台' : '物理动态虚拟微实验台（初中·高中）'}
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#bae6fd', marginTop: '2px', lineHeight: 1.35 }}>
                {isHighSchool ? '洛伦兹力磁场圆周运动 · 动态光路折射 · 电路实时欧姆定律' : '动态光路折射 · 电路实时欧姆定律 · 高中电磁磁场轨迹'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭物理实验台"
            style={{
              background: 'rgba(255,255,255,0.16)', border: 'none', color: '#ffffff',
              fontSize: '1.25rem', cursor: 'pointer', padding: '4px 10px', borderRadius: '8px',
              flexShrink: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher — 按学段分流默认 Tab 顺序：初中优先展示光学与电路，高中优先展示洛伦兹力 */}
        <div style={{
          display: 'flex', flexShrink: 0, flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '6px 10px 0', gap: '4px', boxSizing: 'border-box'
        }}>
          {(isHighSchool
            ? [
                { key: 'lorentz', label: '🧲 高中电磁：洛伦兹力圆周运动', color: '#7c3aed' },
                { key: 'optics', label: '🔍 凸透镜成像规律', color: '#0284c7' },
                { key: 'circuits', label: '⚡ 欧姆定律电路仿真', color: '#0284c7' }
              ]
            : [
                { key: 'optics', label: '🔍 凸透镜成像规律', color: '#0284c7' },
                { key: 'circuits', label: '⚡ 欧姆定律电路仿真', color: '#0284c7' },
                { key: 'lorentz', label: '🧲 拓展(高中)：洛伦兹力圆周运动', color: '#7c3aed' }
              ]
          ).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 10px', border: 'none', background: 'transparent',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                color: activeTab === tab.key ? tab.color : '#64748b',
                borderBottom: activeTab === tab.key ? `3px solid ${tab.color}` : '3px solid transparent'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body Container */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px', boxSizing: 'border-box', minWidth: 0 }}>
          {activeTab === 'lorentz' ? (() => {
            // 严格物理量纲一致性校验：
            // v = velocity × 10^5 m/s, q/m = chargeMassRatio × 10^7 C/kg, B = magneticB T
            // R = v / ((q/m)·B) = (velocity / (B · chargeMassRatio)) × 10^-2 m = (velocity / (B · chargeMassRatio)) cm
            // T = 2π / ((q/m)·B) = 2πR / v = (0.2π / (B · chargeMassRatio)) μs（严格满足 T = 2πR / v！）
            const radiusCm = velocity / Math.max(0.1, magneticB * chargeMassRatio);
            const svgRadius = Math.max(22, Math.min(92, radiusCm * 14));
            const periodVal = (0.2 * Math.PI) / Math.max(0.1, magneticB * chargeMassRatio);
            return (
              <div>
                <div style={{
                  background: '#0f172a', borderRadius: '16px', padding: '16px', overflow: 'hidden',
                  boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)'
                }}>
                  <svg viewBox="0 0 700 240" style={{ width: '100%', height: 'auto', display: 'block' }}>
                    {[80, 160, 240, 320, 400, 480, 560, 620].map(x =>
                      [40, 100, 160, 210].map(y => (
                        <text key={`${x}-${y}`} x={x} y={y} fill="#334155" fontSize="14" textAnchor="middle">×</text>
                      ))
                    )}
                    <text x="20" y="24" fill="#a78bfa" fontSize="12" fontWeight="bold">匀强磁场 B（垂直纸面向里） · R = mv / (qB)</text>
                    <circle cx="350" cy={210 - svgRadius} r={svgRadius} fill="rgba(139, 92, 246, 0.12)" stroke="#a78bfa" strokeWidth="2.5" strokeDasharray="6 4" />
                    <circle cx="350" cy={210 - svgRadius} r="3.5" fill="#fbbf24" />
                    <line x1="350" y1={210 - svgRadius} x2={350 + svgRadius} y2={210 - svgRadius} stroke="#fbbf24" strokeWidth="1.5" />
                    <text x={355 + svgRadius / 2} y={204 - svgRadius} fill="#fbbf24" fontSize="12" fontWeight="bold">R={radiusCm.toFixed(2)}cm</text>
                    <circle cx="350" cy="210" r="6" fill="#38bdf8" />
                    <line x1="310" y1="210" x2="385" y2="210" stroke="#38bdf8" strokeWidth="2.5" />
                    <polygon points="392,210 382,205 382,215" fill="#38bdf8" />
                    <text x="398" y="214" fill="#38bdf8" fontSize="12" fontWeight="bold">v₀ (+q)</text>
                  </svg>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '14px' }}>
                  <div style={{ background: '#f5f3ff', padding: '12px', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#5b21b6', marginBottom: '6px' }}>
                      初速度 v = {velocity.toFixed(1)} ×10⁵ m/s
                    </label>
                    <input type="range" min="1" max="8" step="0.5" value={velocity} onChange={e => setVelocity(Number(e.target.value))} style={{ width: '100%' }} />
                  </div>
                  <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#0369a1', marginBottom: '6px' }}>
                      磁感应强度 B = {magneticB.toFixed(2)} T
                    </label>
                    <input type="range" min="0.2" max="1.5" step="0.05" value={magneticB} onChange={e => setMagneticB(Number(e.target.value))} style={{ width: '100%' }} />
                  </div>
                  <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#047857', marginBottom: '6px' }}>
                      比荷 q/m = {chargeMassRatio.toFixed(1)} ×10⁷ C/kg
                    </label>
                    <input type="range" min="1" max="4" step="0.5" value={chargeMassRatio} onChange={e => setChargeMassRatio(Number(e.target.value))} style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ marginTop: '14px', padding: '12px 16px', background: '#faf5ff', borderRadius: '12px', border: '1px solid #e9d5ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#4c1d95' }}>
                    <div>📐 轨道半径 <b>R = mv/(qB) ≈ {radiusCm.toFixed(2)} cm</b> ｜ 周期 <b>T = 2πm/(qB) = 2πR/v ≈ {periodVal.toFixed(3)} μs</b>（与速度 v 无关！）</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onApplyToChat && onApplyToChat(
                        `老师，我在高中物理电磁微实验台上模拟了【带电粒子在匀强磁场中的圆周运动】：v = ${velocity.toFixed(1)}×10⁵ m/s，B = ${magneticB.toFixed(2)} T，测得轨道半径 R = ${radiusCm.toFixed(2)} cm，周期 T = ${periodVal.toFixed(2)} μs。请结合新高考压轴题，教我“找圆心、定半径、算偏转角与运动时间”的通用破题步骤！`
                      );
                      onClose();
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff',
                      border: 'none', padding: '8px 14px', borderRadius: '10px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer'
                    }}
                  >
                    💬 带入高考电磁课堂请教
                  </button>
                </div>
              </div>
            );
          })() : activeTab === 'optics' ? (
            /* Optics Simulator */
            <div>
              {/* Optics SVG Simulation Canvas */}
              <div style={{
                background: '#0f172a', borderRadius: '16px', padding: '16px', overflow: 'hidden',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)', position: 'relative'
              }}>
                <svg viewBox="0 0 700 240" style={{ width: '100%', height: 'auto', display: 'block' }}>
                  {/* Principal Optical Axis */}
                  <line x1="20" y1="120" x2="680" y2="120" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 4" />
                  <text x="660" y="112" fill="#64748b" fontSize="11">主光轴</text>

                  {/* Convex Lens at center x = 350 */}
                  <line x1="350" y1="20" x2="350" y2="220" stroke="#38bdf8" strokeWidth="3" />
                  {/* Lens arrow caps */}
                  <polygon points="350,15 344,28 356,28" fill="#38bdf8" />
                  <polygon points="350,225 344,212 356,212" fill="#38bdf8" />
                  <text x="355" y="32" fill="#38bdf8" fontSize="12" fontWeight="bold">凸透镜</text>
                  <circle cx="350" cy="120" r="3" fill="#38bdf8" />
                  <text x="354" y="136" fill="#94a3b8" fontSize="11">O (光心)</text>

                  {/* Focal Points: scale 1cm = 7px */}
                  {/* Left: F1 at 350 - 70 = 280, 2F1 at 350 - 140 = 210 */}
                  <circle cx={350 - focalLength * 7} cy="120" r="3.5" fill="#f59e0b" />
                  <text x={350 - focalLength * 7 - 6} y="136" fill="#f59e0b" fontSize="11" fontWeight="bold">F</text>
                  <circle cx={350 - focalLength * 14} cy="120" r="3.5" fill="#f59e0b" />
                  <text x={350 - focalLength * 14 - 10} y="136" fill="#f59e0b" fontSize="11" fontWeight="bold">2F</text>

                  {/* Right: F2 at 350 + 70 = 420, 2F2 at 350 + 140 = 490 */}
                  <circle cx={350 + focalLength * 7} cy="120" r="3.5" fill="#f59e0b" />
                  <text x={350 + focalLength * 7 - 4} y="136" fill="#f59e0b" fontSize="11" fontWeight="bold">F'</text>
                  <circle cx={350 + focalLength * 14} cy="120" r="3.5" fill="#f59e0b" />
                  <text x={350 + focalLength * 14 - 8} y="136" fill="#f59e0b" fontSize="11" fontWeight="bold">2F'</text>

                  {/* Object Candle: at 350 - objectDistance * 7 */}
                  {(() => {
                    const objX = 350 - objectDistance * 7;
                    const candleTopY = 120 - candleHeight;
                    return (
                      <g>
                        {/* Candle body */}
                        <line x1={objX} y1="120" x2={objX} y2={candleTopY} stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" />
                        {/* Flame */}
                        <circle cx={objX} cy={candleTopY - 4} r="5" fill="#fbbf24" opacity="0.9" />
                        <circle cx={objX} cy={candleTopY - 5} r="2.5" fill="#ffffff" />
                        <text x={objX - 16} y={candleTopY - 12} fill="#f43f5e" fontSize="11" fontWeight="bold">烛焰(物)</text>
                      </g>
                    );
                  })()}

                  {/* Refracted Rays & Image */}
                  {(() => {
                    const objX = 350 - objectDistance * 7;
                    const candleTopY = 120 - candleHeight;
                    const fX = 350 + focalLength * 7;

                    if (isAtFocalPoint) {
                      // Parallel exit rays
                      return (
                        <g>
                          <line x1={objX} y1={candleTopY} x2="350" y2={candleTopY} stroke="#fef08a" strokeWidth="1.5" />
                          <line x1="350" y1={candleTopY} x2="650" y2={candleTopY + (650 - 350) * (candleHeight / (focalLength * 7))} stroke="#fef08a" strokeWidth="1.5" />
                          <line x1={objX} y1={candleTopY} x2="350" y2="120" stroke="#f472b6" strokeWidth="1.5" />
                          <line x1="350" y1="120" x2="650" y2={120 + (650 - 350) * (candleHeight / (objectDistance * 7))} stroke="#f472b6" strokeWidth="1.5" />
                        </g>
                      );
                    }

                    if (!isVirtual) {
                      const imgX = 350 + imageDistance * 7;
                      const imgY = 120 + imageHeight; // Inverted real image

                      return (
                        <g>
                          {/* Ray 1: Parallel to lens, then through F' */}
                          <line x1={objX} y1={candleTopY} x2="350" y2={candleTopY} stroke="#fef08a" strokeWidth="1.5" />
                          <line x1="350" y1={candleTopY} x2={Math.min(680, imgX + 30)} y2={candleTopY + (Math.min(680, imgX + 30) - 350) * ((120 - candleTopY) / (focalLength * 7))} stroke="#fef08a" strokeWidth="1.5" />

                          {/* Ray 2: Straight through optical center O */}
                          <line x1={objX} y1={candleTopY} x2={Math.min(680, imgX + 30)} y2={candleTopY + (Math.min(680, imgX + 30) - objX) * ((120 - candleTopY) / (350 - objX))} stroke="#38bdf8" strokeWidth="1.5" />

                          {/* Real Image Candle */}
                          <line x1={imgX} y1="120" x2={imgX} y2={imgY} stroke="#22c55e" strokeWidth="3" strokeLinecap="round" />
                          <circle cx={imgX} cy={imgY + 4} r="4" fill="#86efac" />
                          <text x={imgX - 14} y={imgY + 18} fill="#22c55e" fontSize="11" fontWeight="bold">实像</text>
                        </g>
                      );
                    } else {
                      // Virtual image (u < f)：严格沿两条折射光线反向直线延长，若超出画布左边界则按同斜率截断，绝不折弯！
                      const rawImgX = 350 - imageDistance * 7;
                      const rawImgY = 120 - imageHeight;
                      const clipRayBack = (x0, y0, x1, y1, minX = 20, minY = 12) => {
                        let t = 1;
                        if (x1 < minX && x0 !== x1) t = Math.min(t, (minX - x0) / (x1 - x0));
                        if (y1 < minY && y0 !== y1) t = Math.min(t, (minY - y0) / (y1 - y0));
                        return { x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0) };
                      };
                      const ray1End = clipRayBack(350, candleTopY, rawImgX, rawImgY);
                      const ray2End = clipRayBack(350, 120, rawImgX, rawImgY);
                      const showImgInside = rawImgX >= 20 && rawImgY >= 12;

                      return (
                        <g>
                          {/* Real refracted rays diverging to right */}
                          <line x1={objX} y1={candleTopY} x2="350" y2={candleTopY} stroke="#fef08a" strokeWidth="1.5" />
                          <line x1="350" y1={candleTopY} x2="650" y2={candleTopY + (650 - 350) * ((120 - candleTopY) / (focalLength * 7))} stroke="#fef08a" strokeWidth="1.5" />
                          <line x1={objX} y1={candleTopY} x2="650" y2={candleTopY + (650 - objX) * ((120 - candleTopY) / (350 - objX))} stroke="#38bdf8" strokeWidth="1.5" />

                          {/* Backward virtual dashed trace rays strictly collinear with refracted rays */}
                          <line x1="350" y1={candleTopY} x2={ray1End.x} y2={ray1End.y} stroke="#fef08a" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
                          <line x1="350" y1="120" x2={ray2End.x} y2={ray2End.y} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />

                          {/* Virtual Image Candle (Dashed) */}
                          {showImgInside ? (
                            <>
                              <line x1={rawImgX} y1="120" x2={rawImgX} y2={rawImgY} stroke="#a855f7" strokeWidth="3" strokeDasharray="4 3" strokeLinecap="round" />
                              <circle cx={rawImgX} cy={rawImgY - 4} r="5" fill="#d8b4fe" />
                              <text x={rawImgX - 16} y={Math.max(16, rawImgY - 12)} fill="#a855f7" fontSize="11" fontWeight="bold">虚像</text>
                            </>
                          ) : (
                            <text x="26" y="28" fill="#c084fc" fontSize="11" fontWeight="bold">← 虚像位于更远处 (v≈{imageDistance.toFixed(1)}cm)</text>
                          )}
                        </g>
                      );
                    }
                  })()}
                </svg>
              </div>

              {/* Real-time Indicator & Exam Insight Banner */}
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px',
                padding: '12px 18px', marginTop: '14px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: '10px'
              }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#166534', fontSize: '1.05rem' }}>
                    成像性质：{natureText}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#15803d', marginTop: '3px' }}>
                    核心考点应用：<b>{applicationText}</b> · 像距 v ≈ {isAtFocalPoint ? '∞' : imageDistance.toFixed(1)} cm
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSendOpticsToChat}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #0d9488)',
                    color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)'
                  }}
                >
                  💬 带入课堂请教名师
                </button>
              </div>

              {/* Interactive Controls */}
              <div style={{
                background: '#f8fafc', padding: '16px', borderRadius: '14px', marginTop: '12px',
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '16px'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    <span>物距 u (滑块拖动)：</span>
                    <span style={{ color: '#0284c7' }}>{objectDistance} cm</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="45"
                    step="1"
                    value={objectDistance}
                    onChange={(e) => setObjectDistance(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#0284c7' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                    <span>u &lt; f (放大镜)</span>
                    <span>f &lt; u &lt; 2f (投影仪)</span>
                    <span>u &gt; 2f (照相机)</span>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    <span>透镜焦距 f：</span>
                    <span style={{ color: '#f59e0b' }}>{focalLength} cm</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="15"
                    step="1"
                    value={focalLength}
                    onChange={(e) => setFocalLength(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#f59e0b' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                    <span>5 cm</span>
                    <span>10 cm (标准)</span>
                    <span>15 cm</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Circuits Simulator */
            <div>
              {/* Circuit SVG Graphic */}
              <div style={{
                background: '#0f172a', borderRadius: '16px', padding: '16px', overflow: 'hidden',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)', position: 'relative'
              }}>
                <svg viewBox="0 0 700 240" style={{ width: '100%', height: 'auto', display: 'block' }}>
                  {/* Circuit Loop Wires — 底部在变阻器处正确断开，由左接线柱进、滑片 P 引线出，彻底消除滑片悬空 */}
                  <path d="M 300 190 L 90 190 Q 80 190 80 180 L 80 50 Q 80 40 90 40 L 610 40 Q 620 40 620 50 L 620 180 Q 620 190 610 190 L 445 190" fill="none" stroke="#64748b" strokeWidth="3" />

                  {/* Battery (Left branch) */}
                  <line x1="80" y1="100" x2="80" y2="108" stroke="#38bdf8" strokeWidth="4" />
                  <line x1="65" y1="108" x2="95" y2="108" stroke="#38bdf8" strokeWidth="4" />
                  <line x1="72" y1="116" x2="88" y2="116" stroke="#38bdf8" strokeWidth="3" />
                  <line x1="80" y1="116" x2="80" y2="130" stroke="#38bdf8" strokeWidth="4" />
                  <text x="35" y="116" fill="#38bdf8" fontSize="12" fontWeight="bold">{voltage}V 电源</text>

                  {/* Switch (Top Wire) */}
                  <g style={{ cursor: 'pointer' }} onClick={() => setIsSwitchClosed(prev => !prev)}>
                    <circle cx="200" cy="40" r="4" fill="#cbd5e1" />
                    <circle cx="240" cy="40" r="4" fill="#cbd5e1" />
                    <line
                      x1="200"
                      y1="40"
                      x2={isSwitchClosed ? "240" : "232"}
                      y2={isSwitchClosed ? "40" : "20"}
                      stroke={isSwitchClosed ? "#22c55e" : "#ef4444"}
                      strokeWidth="3.5"
                    />
                    <text x="206" y="22" fill={isSwitchClosed ? "#4ade80" : "#f87171"} fontSize="11" fontWeight="bold">
                      {isSwitchClosed ? "开关: 闭合" : "开关: 断开"}
                    </text>
                  </g>

                  {/* Ammeter (Top Wire Right) */}
                  <circle cx="360" cy="40" r="16" fill="#1e293b" stroke="#0ea5e9" strokeWidth="2.5" />
                  <text x="354" y="45" fill="#38bdf8" fontSize="14" fontWeight="bold">A</text>
                  <text x="330" y="72" fill="#38bdf8" fontSize="11" fontWeight="bold">{current.toFixed(2)} A</text>

                  {/* Fixed Resistor / Bulb (Right Branch) */}
                  <g>
                    <rect x="610" y="95" width="20" height="40" fill="#334155" stroke="#f59e0b" strokeWidth="2" />
                    <text x="635" y="118" fill="#fbbf24" fontSize="11" fontWeight="bold">R₀ = {fixedResistor}Ω</text>
                    {/* Glowing Aura if switch is closed */}
                    {isSwitchClosed && (
                      <circle cx="620" cy="115" r={18 + bulbGlow * 12} fill="#fbbf24" opacity={0.2 + bulbGlow * 0.5} />
                    )}
                  </g>

                  {/* Voltmeter Across Fixed Resistor */}
                  <path d="M 580 40 L 580 80 L 550 80 L 550 150 L 580 150 L 580 190" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="3 3" />
                  <circle cx="550" cy="115" r="16" fill="#1e293b" stroke="#c084fc" strokeWidth="2" />
                  <text x="545" y="120" fill="#c084fc" fontSize="14" fontWeight="bold">V</text>
                  <text x="500" y="120" fill="#c084fc" fontSize="11" fontWeight="bold">{fixedVoltage.toFixed(2)} V</text>

                  {/* Sliding Rheostat (Bottom Wire) */}
                  <g>
                    <rect x="300" y="180" width="120" height="20" fill="#1e293b" stroke="#e2e8f0" strokeWidth="2" rx="4" />
                    {/* Coil lines */}
                    <line x1="315" y1="182" x2="315" y2="198" stroke="#94a3b8" strokeWidth="1.5" />
                    <line x1="330" y1="182" x2="330" y2="198" stroke="#94a3b8" strokeWidth="1.5" />
                    <line x1="345" y1="182" x2="345" y2="198" stroke="#94a3b8" strokeWidth="1.5" />
                    <line x1="360" y1="182" x2="360" y2="198" stroke="#94a3b8" strokeWidth="1.5" />
                    <line x1="375" y1="182" x2="375" y2="198" stroke="#94a3b8" strokeWidth="1.5" />
                    <line x1="390" y1="182" x2="390" y2="198" stroke="#94a3b8" strokeWidth="1.5" />
                    <line x1="405" y1="182" x2="405" y2="198" stroke="#94a3b8" strokeWidth="1.5" />

                    {/* Slider contact arrow connected to upper rod -> right terminal (445, 190) */}
                    {(() => {
                      const sliderX = 305 + (rheostatVal / 50) * 105;
                      return (
                        <g>
                          {/* 高亮左侧已接入电路的有效电阻段 */}
                          <rect x="302" y="182" width={Math.max(2, sliderX - 302)} height="16" fill="rgba(56, 189, 248, 0.35)" rx="2" />
                          {/* 金属滑杆与右端接线 */}
                          <line x1="300" y1="162" x2="445" y2="162" stroke="#94a3b8" strokeWidth="2.5" />
                          <line x1="445" y1="162" x2="445" y2="190" stroke="#64748b" strokeWidth="3" />
                          <circle cx="300" cy="190" r="3.5" fill="#38bdf8" />
                          <circle cx="445" cy="190" r="3.5" fill="#38bdf8" />
                          {/* 滑片 P 触头紧贴电阻丝 */}
                          <polygon points={`${sliderX},181 ${sliderX - 5},170 ${sliderX + 5},170`} fill="#f43f5e" />
                          <line x1={sliderX} y1="170" x2={sliderX} y2="162" stroke="#f43f5e" strokeWidth="2.5" />
                          <circle cx={sliderX} cy="162" r="3" fill="#f43f5e" />
                          <text x={sliderX - 10} y="152" fill="#f43f5e" fontSize="10" fontWeight="bold">滑片P</text>
                        </g>
                      );
                    })()}
                    <text x="320" y="222" fill="#cbd5e1" fontSize="11" fontWeight="bold">变阻器 Rp = {rheostatVal} Ω</text>
                  </g>
                </svg>
              </div>

              {/* Circuit Indicator Banner */}
              <div style={{
                background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px',
                padding: '12px 18px', marginTop: '14px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: '10px'
              }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '1.05rem' }}>
                    电路状态：{isSwitchClosed ? `I = ${current.toFixed(2)} A (正常通电)` : '回路断开 (I = 0)'}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#2563eb', marginTop: '3px' }}>
                    定值电阻分压 U₀ = {fixedVoltage.toFixed(2)} V · 滑动变阻器分压 Up = {rheostatVoltage.toFixed(2)} V
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSendCircuitToChat}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                  }}
                >
                  💬 带入课堂请教名师
                </button>
              </div>

              {/* Slider Controls */}
              <div style={{
                background: '#f8fafc', padding: '16px', borderRadius: '14px', marginTop: '12px',
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '16px'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    <span>滑动变阻器阻值 Rp：</span>
                    <span style={{ color: '#0284c7' }}>{rheostatVal} Ω</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={rheostatVal}
                    onChange={(e) => setRheostatVal(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#0284c7' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                    <span>0 Ω (最小值)</span>
                    <span>25 Ω</span>
                    <span>50 Ω (最大值)</span>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    <span>电源电压 U：</span>
                    <span style={{ color: '#f59e0b' }}>{voltage} V</span>
                  </div>
                  <input
                    type="range"
                    min="1.5"
                    max="12"
                    step="0.5"
                    value={voltage}
                    onChange={(e) => setVoltage(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#f59e0b' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                    <span>1.5 V</span>
                    <span>6 V (常见)</span>
                    <span>12 V</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Close Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f1f5f9', color: '#475569', border: 'none',
                padding: '8px 20px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              关闭实验台
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
