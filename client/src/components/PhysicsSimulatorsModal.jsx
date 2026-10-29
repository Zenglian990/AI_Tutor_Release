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
  onApplyToChat
}) {
  const [activeTab, setActiveTab] = useState('optics'); // 'optics' | 'circuits'

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
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '780px',
        maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Top Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          color: '#ffffff', padding: '16px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>🔬</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                初中物理动态虚拟微实验台
              </h3>
              <div style={{ fontSize: '0.8rem', color: '#bae6fd', marginTop: '2px' }}>
                动态光路折射 · 电路实时欧姆定律 · 探究式直观建构物理图景
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: '#ffffff',
              fontSize: '1.4rem', cursor: 'pointer', padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '6px 24px 0'
        }}>
          <button
            onClick={() => setActiveTab('optics')}
            style={{
              padding: '10px 18px', border: 'none', background: 'transparent',
              fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
              color: activeTab === 'optics' ? '#0284c7' : '#64748b',
              borderBottom: activeTab === 'optics' ? '3px solid #0284c7' : '3px solid transparent'
            }}
          >
            🔍 凸透镜成像规律 (光路折射)
          </button>
          <button
            onClick={() => setActiveTab('circuits')}
            style={{
              padding: '10px 18px', border: 'none', background: 'transparent',
              fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
              color: activeTab === 'circuits' ? '#0284c7' : '#64748b',
              borderBottom: activeTab === 'circuits' ? '3px solid #0284c7' : '3px solid transparent'
            }}
          >
            ⚡ 欧姆定律与滑动变阻器 (电路仿真)
          </button>
        </div>

        {/* Body Container */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'optics' ? (
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
                      // Virtual image
                      const imgX = 350 - imageDistance * 7;
                      const imgY = 120 - imageHeight;

                      return (
                        <g>
                          {/* Real refracted rays diverging to right */}
                          <line x1={objX} y1={candleTopY} x2="350" y2={candleTopY} stroke="#fef08a" strokeWidth="1.5" />
                          <line x1="350" y1={candleTopY} x2="650" y2={candleTopY + (650 - 350) * ((120 - candleTopY) / (focalLength * 7))} stroke="#fef08a" strokeWidth="1.5" />
                          <line x1={objX} y1={candleTopY} x2="650" y2={candleTopY + (650 - objX) * ((120 - candleTopY) / (350 - objX))} stroke="#38bdf8" strokeWidth="1.5" />

                          {/* Backward virtual dashed trace rays to imgX */}
                          <line x1="350" y1={candleTopY} x2={Math.max(20, imgX)} y2={imgY} stroke="#fef08a" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
                          <line x1="350" y1="120" x2={Math.max(20, imgX)} y2={imgY} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />

                          {/* Virtual Image Candle (Dashed) */}
                          <line x1={imgX} y1="120" x2={imgX} y2={imgY} stroke="#a855f7" strokeWidth="3" strokeDasharray="4 3" strokeLinecap="round" />
                          <circle cx={imgX} cy={imgY - 4} r="5" fill="#d8b4fe" />
                          <text x={imgX - 16} y={imgY - 12} fill="#a855f7" fontSize="11" fontWeight="bold">虚像</text>
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
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px'
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
                  {/* Circuit Loop Wires */}
                  <rect x="80" y="40" width="540" height="150" fill="none" stroke="#64748b" strokeWidth="3" rx="10" />

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

                    {/* Slider contact arrow */}
                    {(() => {
                      const sliderX = 305 + (rheostatVal / 50) * 105;
                      return (
                        <g>
                          <polygon points={`${sliderX},180 ${sliderX - 5},170 ${sliderX + 5},170`} fill="#f43f5e" />
                          <line x1={sliderX} y1="170" x2={sliderX} y2="162" stroke="#f43f5e" strokeWidth="2" />
                          <text x={sliderX - 8} y="158" fill="#f43f5e" fontSize="10" fontWeight="bold">滑片P</text>
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
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px'
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
