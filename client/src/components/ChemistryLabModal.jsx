import React, { useState } from 'react';

/**
 * ChemistryLabModal
 * 初中化学动态虚拟微实验台 (对标 NOBOOK 化学实验 / 中考化学探究实验)
 * 
 * 模块一：⚗️ 常见气体制备与检验净化 (氧气 O2 / 二氧化碳 CO2 发生装置、收集与验满)
 * 模块二：⚛️ 微观分子重组与质量守恒 (水电解 2H2O -> 2H2 + O2 微观原子可分性模型)
 */
export default function ChemistryLabModal({
  isOpen,
  onClose,
  onApplyToChat
}) {
  const [activeTab, setActiveTab] = useState('gas_prep'); // 'gas_prep' | 'molecular'
  
  // Gas Prep State
  const [gasType, setGasType] = useState('O2_heating'); // 'O2_heating' | 'O2_liquid' | 'CO2'
  const [isReacting, setIsReacting] = useState(false);
  const [isTestedFull, setIsTestedFull] = useState(false);
  const [gasJarFullness, setGasJarFullness] = useState(0); // 0 to 100%

  // Molecular Simulation State
  const [reactionStep, setReactionStep] = useState(1); // 1: Initial molecules, 2: Atoms split, 3: Recombined products

  if (!isOpen) return null;

  const handleStartReaction = () => {
    setIsReacting(true);
    setIsTestedFull(false);
    setGasJarFullness(0);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 25;
      if (progress >= 100) {
        setGasJarFullness(100);
        setIsReacting(false);
        clearInterval(interval);
      } else {
        setGasJarFullness(progress);
      }
    }, 400);
  };

  const handleReset = () => {
    setIsReacting(false);
    setIsTestedFull(false);
    setGasJarFullness(0);
  };

  const handleSendGasToChat = () => {
    let name = '';
    let formula = '';
    let examTip = '';
    if (gasType === 'O2_heating') {
      name = '高锰酸钾加热制取氧气';
      formula = '2KMnO₄ =(△)= K₂MnO₄ + MnO₂ + O₂↑';
      examTip = '试管口需微向下倾斜防冷凝水倒流炸裂，试管口塞一团棉花防高锰酸钾粉末堵塞导管，实验结束先撤导管后熄酒精灯防倒吸。';
    } else if (gasType === 'O2_liquid') {
      name = '过氧化氢与二氧化锰固液催化制氧';
      formula = '2H₂O₂ =(MnO₂)= 2H₂O + O₂↑';
      examTip = '固液常温型装置，长颈漏斗下端必须伸入液面以下防止气体逸出（液封）。';
    } else {
      name = '大理石与稀盐酸制取二氧化碳';
      formula = 'CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑';
      examTip = '不能用稀硫酸（生成微溶CaSO₄阻碍反应），不能用浓盐酸（易挥发导致CO₂不纯），收集用向上排空气法，验满用燃着木条置于瓶口熄灭。';
    }

    const text = `老师，我在化学虚拟微实验台上模拟了中考必考实验【${name}】（化学方程式：${formula}）：\n` +
      `系统提示的中考实验考点为：“${examTip}”。\n` +
      `请问老师，在中考化学实验大题中，关于“检验装置气密性”的标准答题三步法（连接、注水/微热、观察气泡或液阶差），阅卷标准的满分模板应该怎么写？`;
    onApplyToChat && onApplyToChat(text);
    onClose();
  };

  const handleSendMolecularToChat = () => {
    const text = `老师，我在化学微实验台上观摩了【水电解的微观分子重组模型】（2H₂O =(通电)= 2H₂↑ + O₂↑）：\n` +
      `我看到通电后水分子断裂成独立的氢原子和氧原子，然后重新结合成氢分子和氧分子。\n` +
      `请问老师，如何从“分子、原子、化学键”的本质角度，秒杀中考选择题常考的“化学变化与物理变化的本质区别”以及“质量守恒定律成立的微观原因”？`;
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
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
          color: '#ffffff', padding: '16px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>⚗️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                初中化学动态虚拟微实验台
              </h3>
              <div style={{ fontSize: '0.8rem', color: '#a7f3d0', marginTop: '2px' }}>
                中考气体制备大题装置拼装 · 微观分子反应与质量守恒动态探究
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
            onClick={() => setActiveTab('gas_prep')}
            style={{
              padding: '10px 18px', border: 'none', background: 'transparent',
              fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
              color: activeTab === 'gas_prep' ? '#0d9488' : '#64748b',
              borderBottom: activeTab === 'gas_prep' ? '3px solid #0d9488' : '3px solid transparent'
            }}
          >
            ⚗️ 中考必考气体制备与净化 (O₂ / CO₂)
          </button>
          <button
            onClick={() => setActiveTab('molecular')}
            style={{
              padding: '10px 18px', border: 'none', background: 'transparent',
              fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
              color: activeTab === 'molecular' ? '#0d9488' : '#64748b',
              borderBottom: activeTab === 'molecular' ? '3px solid #0d9488' : '3px solid transparent'
            }}
          >
            ⚛️ 微观分子重组与质量守恒 (2H₂O 拆解)
          </button>
        </div>

        {/* Tab 1: Gas Prep */}
        {activeTab === 'gas_prep' ? (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Scheme Select Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => { setGasType('O2_heating'); handleReset(); }}
                style={{
                  padding: '7px 14px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                  border: gasType === 'O2_heating' ? '2px solid #059669' : '1px solid #cbd5e1',
                  background: gasType === 'O2_heating' ? '#ecfdf5' : '#f8fafc',
                  color: gasType === 'O2_heating' ? '#047857' : '#475569'
                }}
              >
                🔥 高锰酸钾加热制氧 (固固加热型)
              </button>
              <button
                type="button"
                onClick={() => { setGasType('O2_liquid'); handleReset(); }}
                style={{
                  padding: '7px 14px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                  border: gasType === 'O2_liquid' ? '2px solid #059669' : '1px solid #cbd5e1',
                  background: gasType === 'O2_liquid' ? '#ecfdf5' : '#f8fafc',
                  color: gasType === 'O2_liquid' ? '#047857' : '#475569'
                }}
              >
                💧 双氧水催化制氧 (固液常温型)
              </button>
              <button
                type="button"
                onClick={() => { setGasType('CO2'); handleReset(); }}
                style={{
                  padding: '7px 14px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                  border: gasType === 'CO2' ? '2px solid #059669' : '1px solid #cbd5e1',
                  background: gasType === 'CO2' ? '#ecfdf5' : '#f8fafc',
                  color: gasType === 'CO2' ? '#047857' : '#475569'
                }}
              >
                🪨 大理石制备二氧化碳 (向上排空气法)
              </button>
            </div>

            {/* SVG Apparatus Graphic */}
            <div style={{
              background: '#0f172a', borderRadius: '16px', padding: '16px', overflow: 'hidden',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)', position: 'relative'
            }}>
              <svg viewBox="0 0 700 240" style={{ width: '100%', height: 'auto', display: 'block' }}>
                {/* Iron Stand (铁架台) */}
                <rect x="80" y="210" width="100" height="12" fill="#64748b" rx="2" />
                <line x1="120" y1="210" x2="120" y2="40" stroke="#94a3b8" strokeWidth="6" />
                <rect x="117" y="100" width="45" height="8" fill="#64748b" />

                {gasType === 'O2_heating' ? (
                  /* Solid-Heating Apparatus: Test tube tilted downwards, cotton, alcohol burner */
                  <g>
                    {/* Alcohol Burner (酒精灯) */}
                    <path d="M 170 210 L 190 170 L 220 170 L 240 210 Z" fill="#475569" stroke="#94a3b8" strokeWidth="2" />
                    {/* Flame */}
                    <circle cx="205" cy="160" r="8" fill="#f59e0b" opacity="0.9" />
                    <circle cx="205" cy="158" r="4" fill="#fef08a" />
                    <text x="180" y="226" fill="#cbd5e1" fontSize="10">酒精灯外焰</text>

                    {/* Test Tube tilted downward: center around (150, 100) to (270, 115) */}
                    <path d="M 150 95 L 270 110 A 10 10 0 0 1 270 130 L 150 115 Z" fill="rgba(255,255,255,0.08)" stroke="#38bdf8" strokeWidth="2.5" />
                    {/* Purple KMnO4 powder */}
                    <path d="M 240 106 L 268 110 A 8 8 0 0 1 268 128 L 240 125 Z" fill="#9333ea" opacity="0.8" />
                    <text x="245" y="145" fill="#c084fc" fontSize="10">KMnO₄粉末</text>

                    {/* Cotton plug */}
                    <circle cx="165" cy="106" r="6" fill="#e2e8f0" opacity="0.85" />
                    <text x="145" y="85" fill="#fcd34d" fontSize="10">棉花团(防堵)</text>

                    {/* Rubber stopper & glass tube */}
                    <line x1="150" y1="105" x2="130" y2="103" stroke="#94a3b8" strokeWidth="5" />
                    <path d="M 130 103 L 110 103 L 110 170 L 400 170 L 450 170" fill="none" stroke="#38bdf8" strokeWidth="3" />
                  </g>
                ) : (
                  /* Liquid-Solid Apparatus (Conical Flask + Funnel) */
                  <g>
                    {/* Conical Flask (锥形瓶) */}
                    <path d="M 180 130 L 160 210 L 250 210 L 230 130 Z" fill="rgba(255,255,255,0.08)" stroke="#38bdf8" strokeWidth="2.5" />
                    {/* Liquid & Marble/MnO2 */}
                    <path d="M 165 190 L 160 210 L 250 210 L 245 190 Z" fill="rgba(56, 189, 248, 0.25)" />
                    <circle cx="190" cy="204" r="5" fill="#94a3b8" />
                    <circle cx="210" cy="206" r="6" fill="#94a3b8" />
                    <circle cx="225" cy="202" r="5" fill="#94a3b8" />
                    <text x="180" y="226" fill="#cbd5e1" fontSize="10">{gasType === 'CO2' ? '大理石 + 稀盐酸' : 'MnO₂ + H₂O₂'}</text>

                    {/* Separating / Thistle Funnel (长颈漏斗，液封) */}
                    <line x1="195" y1="80" x2="195" y2="200" stroke="#38bdf8" strokeWidth="2.5" />
                    <path d="M 185 80 L 205 80 L 195 95 Z" fill="#38bdf8" />
                    <text x="145" y="75" fill="#fcd34d" fontSize="10">长颈漏斗(液封)</text>

                    {/* Delivery tube */}
                    <path d="M 215 130 L 215 110 L 400 110 L 450 170" fill="none" stroke="#38bdf8" strokeWidth="3" />
                  </g>
                )}

                {/* Bubbles Animation when reacting */}
                {isReacting && (
                  <g>
                    <circle cx="430" cy="165" r="3" fill="#67e8f9" opacity="0.8" />
                    <circle cx="438" cy="155" r="4" fill="#67e8f9" opacity="0.9" />
                    <circle cx="445" cy="140" r="3.5" fill="#67e8f9" opacity="0.8" />
                    <circle cx="480" cy="130" r="4.5" fill="#67e8f9" opacity="0.9" />
                  </g>
                )}

                {/* Collection Gas Jar (集气瓶) */}
                <g>
                  {/* Gas Jar outline */}
                  <rect x="460" y="80" width="70" height="120" rx="6" fill="rgba(255,255,255,0.06)" stroke="#38bdf8" strokeWidth="2.5" />
                  {/* Gas filling level */}
                  <rect
                    x="462"
                    y={80 + 116 * (1 - gasJarFullness / 100)}
                    width="66"
                    height={116 * (gasJarFullness / 100)}
                    fill={gasType === 'CO2' ? 'rgba(148, 163, 184, 0.3)' : 'rgba(16, 185, 129, 0.25)'}
                    rx="4"
                  />
                  <text x="465" y="70" fill="#38bdf8" fontSize="11" fontWeight="bold">集气瓶 ({gasJarFullness}%)</text>

                  {/* Flame test stick */}
                  {isTestedFull && (
                    <g>
                      <line x1="495" y1="40" x2="495" y2="82" stroke="#d97706" strokeWidth="3" />
                      {gasType === 'CO2' ? (
                        /* Splint extinguished */
                        <g>
                          <circle cx="495" cy="82" r="3" fill="#475569" />
                          <text x="515" y="85" fill="#ef4444" fontSize="11" fontWeight="bold">熄灭 (已集满)</text>
                        </g>
                      ) : (
                        /* Splint rekindles */
                        <g>
                          <circle cx="495" cy="80" r="6" fill="#f59e0b" />
                          <circle cx="495" cy="79" r="3" fill="#ffffff" />
                          <text x="515" y="85" fill="#22c55e" fontSize="11" fontWeight="bold">复燃 (已集满)</text>
                        </g>
                      )}
                    </g>
                  )}
                </g>
              </svg>
            </div>

            {/* Reaction Controls & Status */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px',
              padding: '14px 18px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '10px'
            }}>
              <div>
                <div style={{ fontWeight: 800, color: '#166534', fontSize: '1rem' }}>
                  实验状态：{gasJarFullness === 100 ? '✅ 气体收集完毕' : isReacting ? '⏳ 反应剧烈发生中，气泡源源不断...' : '就绪待反应'}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#15803d', marginTop: '2px' }}>
                  收集方式：{gasType === 'CO2' ? '向上排空气法（密度大于空气）' : '排水法 / 向上排空气法'} · 验满：{gasType === 'CO2' ? '燃着木条放瓶口熄灭' : '带火星木条放瓶口复燃'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleStartReaction}
                  disabled={isReacting}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #0d9488)',
                    color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >
                  🚀 开始反应制气
                </button>
                <button
                  type="button"
                  onClick={() => setIsTestedFull(true)}
                  disabled={gasJarFullness < 100}
                  style={{
                    background: gasJarFullness === 100 ? '#fef3c7' : '#f1f5f9',
                    color: gasJarFullness === 100 ? '#b45309' : '#94a3b8',
                    border: '1px solid #fcd34d', padding: '8px 14px', borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.85rem', cursor: gasJarFullness === 100 ? 'pointer' : 'not-allowed'
                  }}
                >
                  🔥 木条验满
                </button>
                <button
                  type="button"
                  onClick={handleSendGasToChat}
                  style={{
                    background: '#0f172a', color: '#fff', border: 'none',
                    padding: '8px 14px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >
                  💬 带入课堂
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Molecular Simulation */
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Step navigation buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setReactionStep(1)}
                style={{
                  padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                  background: reactionStep === 1 ? '#0d9488' : '#f1f5f9',
                  color: reactionStep === 1 ? '#fff' : '#475569', border: 'none'
                }}
              >
                1. 反应前：2个水分子 (2H₂O)
              </button>
              <button
                type="button"
                onClick={() => setReactionStep(2)}
                style={{
                  padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                  background: reactionStep === 2 ? '#0d9488' : '#f1f5f9',
                  color: reactionStep === 2 ? '#fff' : '#475569', border: 'none'
                }}
              >
                2. 反应中：通电分子断裂为原子
              </button>
              <button
                type="button"
                onClick={() => setReactionStep(3)}
                style={{
                  padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                  background: reactionStep === 3 ? '#0d9488' : '#f1f5f9',
                  color: reactionStep === 3 ? '#fff' : '#475569', border: 'none'
                }}
              >
                3. 反应后：原子重新组合 (2H₂ + O₂)
              </button>
            </div>

            {/* Molecular SVG Visualizer */}
            <div style={{
              background: '#0f172a', borderRadius: '16px', padding: '20px', minHeight: '220px',
              display: 'flex', justifyContent: 'center', alignItems: 'center'
            }}>
              <svg viewBox="0 0 640 200" style={{ width: '100%', height: 'auto', display: 'block' }}>
                {reactionStep === 1 && (
                  /* Step 1: Two H2O Molecules */
                  <g>
                    {/* Molecule 1 */}
                    <circle cx="200" cy="100" r="24" fill="#ef4444" />
                    <text x="194" y="105" fill="#fff" fontSize="13" fontWeight="bold">O</text>
                    <line x1="200" y1="100" x2="175" y2="70" stroke="#cbd5e1" strokeWidth="4" />
                    <circle cx="175" cy="70" r="14" fill="#38bdf8" />
                    <text x="170" y="74" fill="#fff" fontSize="11" fontWeight="bold">H</text>
                    <line x1="200" y1="100" x2="225" y2="70" stroke="#cbd5e1" strokeWidth="4" />
                    <circle cx="225" cy="70" r="14" fill="#38bdf8" />
                    <text x="220" y="74" fill="#fff" fontSize="11" fontWeight="bold">H</text>
                    <text x="180" y="145" fill="#fde047" fontSize="13" fontWeight="bold">水分子 1 (H₂O)</text>

                    {/* Molecule 2 */}
                    <circle cx="440" cy="100" r="24" fill="#ef4444" />
                    <text x="434" y="105" fill="#fff" fontSize="13" fontWeight="bold">O</text>
                    <line x1="440" y1="100" x2="415" y2="70" stroke="#cbd5e1" strokeWidth="4" />
                    <circle cx="415" cy="70" r="14" fill="#38bdf8" />
                    <text x="410" y="74" fill="#fff" fontSize="11" fontWeight="bold">H</text>
                    <line x1="440" y1="100" x2="465" y2="70" stroke="#cbd5e1" strokeWidth="4" />
                    <circle cx="465" cy="70" r="14" fill="#38bdf8" />
                    <text x="460" y="74" fill="#fff" fontSize="11" fontWeight="bold">H</text>
                    <text x="420" y="145" fill="#fde047" fontSize="13" fontWeight="bold">水分子 2 (H₂O)</text>
                  </g>
                )}

                {reactionStep === 2 && (
                  /* Step 2: Broken Chemical Bonds: 4 H atoms, 2 O atoms floating freely */
                  <g>
                    <circle cx="160" cy="80" r="22" fill="#ef4444" stroke="#fca5a5" strokeWidth="2" strokeDasharray="3 3" />
                    <text x="154" y="85" fill="#fff" fontSize="13" fontWeight="bold">O</text>

                    <circle cx="480" cy="80" r="22" fill="#ef4444" stroke="#fca5a5" strokeWidth="2" strokeDasharray="3 3" />
                    <text x="474" y="85" fill="#fff" fontSize="13" fontWeight="bold">O</text>

                    <circle cx="250" cy="120" r="14" fill="#38bdf8" stroke="#bae6fd" strokeWidth="2" strokeDasharray="2 2" />
                    <text x="245" y="124" fill="#fff" fontSize="11" fontWeight="bold">H</text>

                    <circle cx="310" cy="70" r="14" fill="#38bdf8" stroke="#bae6fd" strokeWidth="2" strokeDasharray="2 2" />
                    <text x="305" y="74" fill="#fff" fontSize="11" fontWeight="bold">H</text>

                    <circle cx="370" cy="130" r="14" fill="#38bdf8" stroke="#bae6fd" strokeWidth="2" strokeDasharray="2 2" />
                    <text x="365" y="134" fill="#fff" fontSize="11" fontWeight="bold">H</text>

                    <circle cx="410" cy="65" r="14" fill="#38bdf8" stroke="#bae6fd" strokeWidth="2" strokeDasharray="2 2" />
                    <text x="405" y="69" fill="#fff" fontSize="11" fontWeight="bold">H</text>

                    <text x="230" y="175" fill="#38bdf8" fontSize="13" fontWeight="bold">⚡ 通电：化学键断裂，生成独立的 4个H原子 与 2个O原子</text>
                  </g>
                )}

                {reactionStep === 3 && (
                  /* Step 3: Recombined: Two H2 molecules and One O2 molecule */
                  <g>
                    {/* H2 Molecule 1 */}
                    <circle cx="140" cy="100" r="14" fill="#38bdf8" />
                    <text x="135" y="104" fill="#fff" fontSize="11" fontWeight="bold">H</text>
                    <line x1="140" y1="100" x2="168" y2="100" stroke="#cbd5e1" strokeWidth="4" />
                    <circle cx="168" cy="100" r="14" fill="#38bdf8" />
                    <text x="163" y="104" fill="#fff" fontSize="11" fontWeight="bold">H</text>
                    <text x="136" y="140" fill="#38bdf8" fontSize="12" fontWeight="bold">氢分子 H₂</text>

                    {/* H2 Molecule 2 */}
                    <circle cx="250" cy="100" r="14" fill="#38bdf8" />
                    <text x="245" y="104" fill="#fff" fontSize="11" fontWeight="bold">H</text>
                    <line x1="250" y1="100" x2="278" y2="100" stroke="#cbd5e1" strokeWidth="4" />
                    <circle cx="278" cy="100" r="14" fill="#38bdf8" />
                    <text x="273" y="104" fill="#fff" fontSize="11" fontWeight="bold">H</text>
                    <text x="246" y="140" fill="#38bdf8" fontSize="12" fontWeight="bold">氢分子 H₂</text>

                    {/* O2 Molecule */}
                    <circle cx="470" cy="100" r="22" fill="#ef4444" />
                    <text x="464" y="105" fill="#fff" fontSize="13" fontWeight="bold">O</text>
                    <line x1="470" y1="96" x2="512" y2="96" stroke="#cbd5e1" strokeWidth="3" />
                    <line x1="470" y1="104" x2="512" y2="104" stroke="#cbd5e1" strokeWidth="3" />
                    <circle cx="512" cy="100" r="22" fill="#ef4444" />
                    <text x="506" y="105" fill="#fff" fontSize="13" fontWeight="bold">O</text>
                    <text x="474" y="145" fill="#f87171" fontSize="12" fontWeight="bold">氧分子 O₂</text>
                  </g>
                )}
              </svg>
            </div>

            {/* Core Insight Box */}
            <div style={{
              background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px',
              padding: '14px 18px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '10px'
            }}>
              <div>
                <div style={{ fontWeight: 800, color: '#1e40af', fontSize: '1rem' }}>
                  质量守恒定律微观本质剖析：
                </div>
                <div style={{ fontSize: '0.84rem', color: '#2563eb', marginTop: '3px' }}>
                  反应前后：原子的种类没有改变（都是H和O）、数目没有增减（4个H，2个O）、质量没有改变！
                </div>
              </div>

              <button
                type="button"
                onClick={handleSendMolecularToChat}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px',
                  fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
                }}
              >
                💬 带入课堂请教名师
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '0 24px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f1f5f9', color: '#475569', border: 'none',
              padding: '8px 20px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            关闭微实验台
          </button>
        </div>
      </div>
    </div>
  );
}
