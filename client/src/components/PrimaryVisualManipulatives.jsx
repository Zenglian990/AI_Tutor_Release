import React, { useState } from 'react';

/**
 * PrimaryVisualManipulatives
 * 小学低年级（1-3年级）具象实物积木、等式天平与分苹果乘除法教具
 * 专为 1-3 年级心智模型打造：化抽象符号为直观操作，激发动手兴趣与语音伴读引导
 */
export default function PrimaryVisualManipulatives({ isOpen, onClose, onApplyToChat }) {
  const [activeTab, setActiveTab] = useState('blocks'); // 'blocks' | 'balance' | 'partition'

  // Tab 1: Base-10 Blocks & Candy Counter
  const [tensCount, setTensCount] = useState(2); // 2 tens = 20
  const [onesCount, setOnesCount] = useState(4); // 4 ones = 4
  const [fruitType, setFruitType] = useState('🍎'); // '🍎', '⭐', '🍬'

  // Tab 2: Balance Scale for Equation Intuition
  const [leftUnknown, setLeftUnknown] = useState(1); // 1个未知数方块 x (重量默认 5)
  const [leftWeights, setLeftWeights] = useState(3); // 左边砝码 3
  const [rightWeights, setRightWeights] = useState(8); // 右边砝码 8
  const UNKNOWN_ACTUAL_VAL = 5; // 真实 x = 5，天平平衡

  // Tab 3: Division & Multiplication Partition (分苹果与阵列)
  const [totalApples, setTotalApples] = useState(12);
  const [platesCount, setPlatesCount] = useState(3);

  // Audio Narration State
  const [isSpeaking, setIsSpeaking] = useState(false);

  if (!isOpen) return null;

  // Calculate balance tilt
  const leftTotal = (leftUnknown * UNKNOWN_ACTUAL_VAL) + leftWeights;
  const rightTotal = rightWeights;
  const diff = leftTotal - rightTotal;
  const tiltAngle = Math.max(-15, Math.min(15, diff * 3)); // tilt degrees

  const totalValue = tensCount * 10 + onesCount;

  // Partition math
  const perPlate = Math.floor(totalApples / platesCount);
  const remainder = totalApples % platesCount;

  // Web Speech API gentle narration for 1-3 grades
  const handleVoiceNarration = () => {
    const UtteranceClass = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance;
    if (!window.speechSynthesis || !UtteranceClass) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    let speechText = '';
    if (activeTab === 'blocks') {
      speechText = `小朋友你好！你看，这里有 ${tensCount} 根十位棒，代表 ${tensCount * 10}，还有 ${onesCount} 个小散块。合起来一共是 ${totalValue} 哦！按加号减号试试看数字怎么变化吧！`;
    } else if (activeTab === 'balance') {
      if (diff === 0) {
        speechText = `太棒啦！天平现在两边正好平衡，说明神秘方块 x 的重量正好是 5！这就是等式的秘密！`;
      } else if (diff > 0) {
        speechText = `天平向左边倾斜啦，说明左边太重了！试着在左边拿走一点砝码，或者在右边加上砝码让它平衡吧！`;
      } else {
        speechText = `天平向右边倾斜啦，右边太重了！试着给左边加一点重量让它平衡吧！`;
      }
    } else if (activeTab === 'partition') {
      speechText = `我们来平均分苹果吧！一共有 ${totalApples} 个苹果，平均分给 ${platesCount} 个盘子。每个盘子能分到 ${perPlate} 个苹果${remainder > 0 ? `，还剩 ${remainder} 个在篮子里` : '，正好分完'}！这就是除法的神奇奥秘！`;
    }

    const utterance = new UtteranceClass(speechText);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.95; // Gentle and steady for children
    utterance.pitch = 1.1; // Friendly tone
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleSendEquationToChat = () => {
    if (activeTab === 'blocks') {
      const summary = `老师，我刚才在实物积木上摆出了 ${tensCount} 个十（十位棒）和 ${onesCount} 个一（个位块），一共是 ${totalValue}。请问用这个怎么拆解退位减法呢？`;
      onApplyToChat && onApplyToChat(summary);
    } else if (activeTab === 'balance') {
      const equationStr = `${leftUnknown > 1 ? `${leftUnknown}x` : 'x'} + ${leftWeights} = ${rightWeights}`;
      const summary = `老师，我在方程天平上摆出了【${equationStr}】。天平${diff === 0 ? '现在两边正好平衡！所以 x = ' + UNKNOWN_ACTUAL_VAL : (diff > 0 ? '左边偏重' : '右边偏重')}。请教我怎么通过两边同时拿走砝码来解出 x？`;
      onApplyToChat && onApplyToChat(summary);
    } else {
      const summary = `老师，我在分苹果实操台上操作了：将 ${totalApples} 个苹果平均分到 ${platesCount} 个盘子里，每个盘子得到 ${perPlate} 个${remainder > 0 ? `，剩余 ${remainder} 个` : '（整除）'}。请问如何把这个具象场景书写为除法竖式和有余数除法的严谨验算？`;
      onApplyToChat && onApplyToChat(summary);
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '780px',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
          color: '#fff', padding: '18px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>🎒</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800' }}>
                小学趣味实物启蒙教具
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#fef3c7', marginTop: '2px' }}>
                1-3年级动手探索 · 具象积木与天平直观启发
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleVoiceNarration}
              style={{
                background: isSpeaking ? '#ffffff' : 'rgba(255, 255, 255, 0.25)',
                color: isSpeaking ? '#ea580c' : '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: '20px',
                padding: '5px 14px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: isSpeaking ? '0 0 12px rgba(255, 255, 255, 0.8)' : 'none'
              }}
            >
              <span>{isSpeaking ? '🛑 停止伴读' : '🔊 名师伴读引导'}</span>
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '6px 16px', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('blocks')}
            style={{
              padding: '8px 16px', borderRadius: '12px', border: 'none',
              background: activeTab === 'blocks' ? '#f59e0b' : 'transparent',
              color: activeTab === 'blocks' ? '#fff' : '#64748b',
              fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>🧱</span>
            <span>实物积木与计数器</span>
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            style={{
              padding: '8px 16px', borderRadius: '12px', border: 'none',
              background: activeTab === 'balance' ? '#ea580c' : 'transparent',
              color: activeTab === 'balance' ? '#fff' : '#64748b',
              fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>⚖️</span>
            <span>等式方程天平</span>
          </button>
          <button
            onClick={() => setActiveTab('partition')}
            style={{
              padding: '8px 16px', borderRadius: '12px', border: 'none',
              background: activeTab === 'partition' ? '#10b981' : 'transparent',
              color: activeTab === 'partition' ? '#fff' : '#64748b',
              fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>🍎</span>
            <span>分苹果平均分与乘除阵列</span>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px' }}>
          {activeTab === 'blocks' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#1e293b' }}>
                  当前组成数量：<span style={{ color: '#ea580c', fontSize: '1.4rem' }}>{totalValue}</span>
                  <span style={{ fontSize: '0.85rem', color: '#64748b', marginLeft: '8px' }}>
                    ({tensCount} 个十 + {onesCount} 个一)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['🍎', '⭐', '🍬'].map(f => (
                    <button
                      key={f}
                      onClick={() => setFruitType(f)}
                      style={{
                        background: fruitType === f ? '#fef3c7' : '#f1f5f9',
                        border: `1px solid ${fruitType === f ? '#f59e0b' : '#cbd5e1'}`,
                        borderRadius: '8px', padding: '4px 10px', fontSize: '1rem', cursor: 'pointer'
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visual Display Container */}
              <div style={{
                background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '16px',
                padding: '20px', minHeight: '180px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center'
              }}>
                {/* Tens Columns */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  {Array.from({ length: tensCount }).map((_, colIdx) => (
                    <div
                      key={colIdx}
                      style={{
                        background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: '8px',
                        padding: '6px 4px', display: 'flex', flexDirection: 'column', gap: '3px',
                        alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}
                      title="1根十位棒 (代表10)"
                    >
                      <span style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: '800' }}>10</span>
                      {Array.from({ length: 10 }).map((_, itemIdx) => (
                        <span key={itemIdx} style={{ fontSize: '0.85rem', lineHeight: '1' }}>{fruitType}</span>
                      ))}
                    </div>
                  ))}
                  {tensCount === 0 && <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>暂无十位棒</span>}
                </div>

                {/* Divider */}
                <div style={{ width: '2px', height: '140px', background: '#e2e8f0' }} />

                {/* Ones Row */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '8px', fontWeight: '600' }}>个位散块 ({onesCount}个):</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Array.from({ length: onesCount }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          background: '#fff', border: '1.5px solid #ea580c', borderRadius: '8px',
                          width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '1.1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}
                      >
                        {fruitType}
                      </div>
                    ))}
                    {onesCount === 0 && <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>暂无个位散块</span>}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ background: '#fef3c7', padding: '12px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', color: '#92400e' }}>十位棒 (每捆10):</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setTensCount(Math.max(0, tensCount - 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <button
                      onClick={() => setTensCount(Math.min(9, tensCount + 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div style={{ background: '#ffedd5', padding: '12px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', color: '#9a3412' }}>个位散块:</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setOnesCount(Math.max(0, onesCount - 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#ea580c', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <button
                      onClick={() => setOnesCount(Math.min(9, onesCount + 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#ea580c', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'balance' ? (
            /* Balance Scale View */
            <div>
              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: diff === 0 ? '#059669' : '#ea580c' }}>
                  {diff === 0 ? '🎉 天平完全平衡！等式成立！' : (diff > 0 ? '⚠️ 左盘较重，天平向左倾斜' : '⚠️ 右盘较重，天平向右倾斜')}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                  等式模型：<strong>{leftUnknown > 1 ? `${leftUnknown}x` : 'x'} + {leftWeights} {diff === 0 ? '=' : (diff > 0 ? '>' : '<')} {rightWeights}</strong>
                </div>
              </div>

              {/* Dynamic Balance Graphic */}
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px',
                padding: '24px 16px', height: '220px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-end', position: 'relative', overflow: 'hidden'
              }}>
                {/* Balance Beam with rotation */}
                <div style={{
                  width: '320px', height: '8px', background: '#475569', borderRadius: '4px',
                  transform: `rotate(${tiltAngle}deg)`, transition: 'transform 0.4s ease-out',
                  position: 'relative', transformOrigin: 'center center'
                }}>
                  {/* Left Pan */}
                  <div style={{
                    position: 'absolute', left: '-10px', top: '8px', width: '100px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center'
                  }}>
                    <div style={{ width: '2px', height: '35px', background: '#94a3b8' }} />
                    <div style={{
                      width: '100px', background: '#e2e8f0', border: '2px solid #64748b',
                      borderRadius: '0 0 14px 14px', padding: '6px 4px', display: 'flex', flexWrap: 'wrap',
                      gap: '4px', justifyContent: 'center', minHeight: '34px'
                    }}>
                      {Array.from({ length: leftUnknown }).map((_, idx) => (
                        <span key={idx} style={{ background: '#3b82f6', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem', fontWeight: '800' }}>x</span>
                      ))}
                      {Array.from({ length: leftWeights }).map((_, idx) => (
                        <span key={idx} style={{ background: '#f59e0b', color: '#fff', borderRadius: '4px', padding: '2px 5px', fontSize: '0.72rem' }}>1</span>
                      ))}
                    </div>
                  </div>

                  {/* Right Pan */}
                  <div style={{
                    position: 'absolute', right: '-10px', top: '8px', width: '100px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center'
                  }}>
                    <div style={{ width: '2px', height: '35px', background: '#94a3b8' }} />
                    <div style={{
                      width: '100px', background: '#e2e8f0', border: '2px solid #64748b',
                      borderRadius: '0 0 14px 14px', padding: '6px 4px', display: 'flex', flexWrap: 'wrap',
                      gap: '4px', justifyContent: 'center', minHeight: '34px'
                    }}>
                      {Array.from({ length: rightWeights }).map((_, idx) => (
                        <span key={idx} style={{ background: '#10b981', color: '#fff', borderRadius: '4px', padding: '2px 5px', fontSize: '0.72rem' }}>1</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Fulcrum Base */}
                <div style={{
                  width: 0, height: 0, borderLeft: '24px solid transparent',
                  borderRight: '24px solid transparent', borderBottom: '50px solid #334155'
                }} />
                <div style={{ width: '80px', height: '10px', background: '#1e293b', borderRadius: '4px' }} />
              </div>

              {/* Balance Controls */}
              <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1e40af', marginBottom: '6px' }}>左盘砝码 (+{leftWeights})</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setLeftWeights(Math.max(0, leftWeights - 1))} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>-1</button>
                    <button onClick={() => setLeftWeights(leftWeights + 1)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>+1</button>
                  </div>
                </div>

                <div style={{ background: '#ecfdf5', padding: '10px 14px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#065f46', marginBottom: '6px' }}>右盘砝码 (+{rightWeights})</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setRightWeights(Math.max(0, rightWeights - 1))} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>-1</button>
                    <button onClick={() => setRightWeights(rightWeights + 1)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>+1</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Partition / Multiplication Array View */
            <div>
              {/* Formula & Status Banner */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#047857' }}>
                  {totalApples} ÷ {platesCount} = <span style={{ fontSize: '1.6rem', color: '#059669' }}>{perPlate}</span>
                  {remainder > 0 && (
                    <span style={{ color: '#d97706', fontSize: '1.1rem', marginLeft: '8px' }}>
                      （余数：{remainder}）
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                  乘法算理对应：<strong>{platesCount} 个盘子 × 每盘 {perPlate} 个 = {platesCount * perPlate} 个</strong>
                  {remainder > 0 && `（加上篮子余数 ${remainder} 个 = 共 ${totalApples} 个）`}
                </div>
              </div>

              {/* Visual Plates Display */}
              <div style={{
                background: '#f8fafc', border: '2px dashed #a7f3d0', borderRadius: '16px',
                padding: '20px', minHeight: '190px', display: 'flex', flexDirection: 'column', gap: '16px'
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
                  {Array.from({ length: platesCount }).map((_, plateIdx) => (
                    <div
                      key={plateIdx}
                      style={{
                        background: '#ffffff',
                        border: '2.5px solid #10b981',
                        borderRadius: '20px',
                        padding: '10px 14px',
                        minWidth: '100px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.15)'
                      }}
                    >
                      <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#047857' }}>
                        🍽️ 盘子 #{plateIdx + 1}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '80px', justifyContent: 'center' }}>
                        {Array.from({ length: perPlate }).map((_, aIdx) => (
                          <span key={aIdx} style={{ fontSize: '1.2rem', lineHeight: '1' }}>🍎</span>
                        ))}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '700' }}>
                        共 {perPlate} 个
                      </span>
                    </div>
                  ))}
                </div>

                {/* Remainder Basket if any */}
                {remainder > 0 && (
                  <div style={{
                    background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '12px',
                    padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}>
                    <span style={{ fontSize: '1.2rem' }}>🧺</span>
                    <span style={{ fontSize: '0.84rem', color: '#b45309', fontWeight: '700' }}>
                      篮子里不够均分的苹果（余数）：
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {Array.from({ length: remainder }).map((_, rIdx) => (
                        <span key={rIdx} style={{ fontSize: '1.1rem' }}>🍎</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Partition Controls */}
              <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ background: '#ecfdf5', padding: '12px 16px', borderRadius: '12px', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: '#065f46', fontSize: '0.88rem' }}>苹果总数 ({totalApples}个)</div>
                    <div style={{ fontSize: '0.72rem', color: '#047857' }}>被除数 (范围 1~24)</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setTotalApples(Math.max(1, totalApples - 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => setTotalApples(Math.min(24, totalApples + 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      +1
                    </button>
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', padding: '12px 16px', borderRadius: '12px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: '#166534', fontSize: '0.88rem' }}>盘子数量 ({platesCount}盘)</div>
                    <div style={{ fontSize: '0.72rem', color: '#15803d' }}>除数 (平均分成几份 2~6)</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setPlatesCount(Math.max(2, platesCount - 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#059669', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlatesCount(Math.min(6, platesCount + 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#059669', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      +1
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action footer */}
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
              onClick={handleSendEquationToChat}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '10px',
                fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <span>💬</span>
              <span>带入课堂向名师请教</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
