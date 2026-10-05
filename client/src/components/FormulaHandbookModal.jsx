import React, { useState, useMemo } from 'react';
import katex from 'katex';

/**
 * FormulaHandbookModal
 * 中考数理化必备公式与定理速查宝典 (离线秒开 · 0 Token 消耗 · 零网络延迟)
 * 专为中小学生尤其是 7-9 年级攻坚冲刺设计
 */

function FormulaDisplay({ formula }) {
  const renderedHtml = useMemo(() => {
    if (!formula) return null;
    if (formula.includes('\n')) return null;
    const chineseChars = (formula.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (chineseChars > 0 && chineseChars / formula.length > 0.35) {
      return null;
    }
    const hasMath = /\\[a-zA-Z]+|\^|_|=|<|>|\+|-|\/|\*/.test(formula);
    if (!hasMath) return null;
    try {
      return katex.renderToString(formula, {
        displayMode: true,
        throwOnError: false,
        strict: false
      });
    } catch {
      return null;
    }
  }, [formula]);

  if (renderedHtml) {
    return (
      <div
        className="formula-katex-box"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
        style={{
          fontSize: '1.05rem',
          color: '#f8fafc',
          background: 'rgba(0, 0, 0, 0.4)',
          padding: '8px 14px',
          borderRadius: '10px',
          margin: '4px 0',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '44px'
        }}
      />
    );
  }

  return (
    <div
      style={{
        fontSize: '0.92rem',
        color: '#fde047',
        background: 'rgba(0, 0, 0, 0.35)',
        padding: '8px 12px',
        borderRadius: '10px',
        margin: '4px 0',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.6,
        fontWeight: 500
      }}
    >
      {formula}
    </div>
  );
}

const FORMULA_DATABASE = {
  math: [
    {
      category: '🔢 代数与乘法公式',
      items: [
        { name: '平方差公式', formula: '(a + b)(a - b) = a^2 - b^2', desc: '两数和与差之积等于平方差' },
        { name: '完全平方公式', formula: '(a \\pm b)^2 = a^2 \\pm 2ab + b^2', desc: '首平方尾平方，二倍乘积放中央' },
        { name: '一元二次方程求根公式', formula: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\quad (b^2 - 4ac \\ge 0)', desc: '标准式 ax^2 + bx + c = 0 的通用解' },
        { name: '韦达定理 (根与系数关系)', formula: 'x_1 + x_2 = -\\frac{b}{a}, \\quad x_1 x_2 = \\frac{c}{a}', desc: '两根之和与两根之积' },
        { name: '立方和与立方差公式', formula: 'a^3 \\pm b^3 = (a \\pm b)(a^2 \\mp ab + b^2)', desc: '因式分解与化简常用' }
      ]
    },
    {
      category: '📈 函数模型与图象',
      items: [
        { name: '一次函数斜截式', formula: 'y = kx + b \\quad (k \\ne 0)', desc: 'k决定方向，b为y轴截距' },
        { name: '反比例函数', formula: 'y = \\frac{k}{x} \\iff xy = k \\quad (k \\ne 0)', desc: '图象为双曲线，矩形面积为|k|' },
        { name: '二次函数一般式', formula: 'y = ax^2 + bx + c \\quad (a \\ne 0)', desc: '开口由a决定，与y轴交点为(0,c)' },
        { name: '二次函数顶点坐标', formula: '\\left(-\\frac{b}{2a}, \\; \\frac{4ac - b^2}{4a}\\right)', desc: '最值点坐标' },
        { name: '二次函数对称轴', formula: 'x = -\\frac{b}{2a}', desc: '抛物线对称轴方程' },
        { name: '二次函数顶点式', formula: 'y = a(x - h)^2 + k', desc: '顶点为(h, k)，对称轴为x=h' }
      ]
    },
    {
      category: '📐 几何定理与全等相似',
      items: [
        { name: '勾股定理', formula: 'a^2 + b^2 = c^2 \\quad (\\angle C = 90^\\circ)', desc: '常用勾股数: (3,4,5), (5,12,13), (7,24,25), (8,15,17)' },
        { name: '全等三角形5大判定', formula: 'SSS, \\; SAS, \\; ASA, \\; AAS, \\; HL \\text{(仅直角)}', desc: '注意：SSA和AAA不能判定全等' },
        { name: '相似三角形3大判定', formula: '两角对应相等 / 两边成比例且夹角相等 / 三边对应成比例', desc: '相似比的平方等于面积比' },
        { name: '角平分线性质', formula: '角平分线上的点到角两边的距离相等', desc: '到角两边距离相等的点在角平分线上' },
        { name: '线段垂直平分线', formula: '垂直平分线上的点到线段两端点距离相等', desc: '常用于倍长中线与对称轴构造' }
      ]
    },
    {
      category: '⭕ 圆的性质与面积公式',
      items: [
        { name: '垂径定理', formula: 'r^2 = d^2 + \\left(\\frac{l}{2}\\right)^2', desc: '垂直于弦的直径平分弦及所对弧，常构造Rt△: r² = d² + (l/2)²' },
        { name: '圆周角与圆心角', formula: '\\angle \\text{圆心角} = 2 \\angle \\text{圆周角}', desc: '同弧所对圆心角等于圆周角的2倍，直径所对圆周角是直角 (90°)' },
        { name: '弧长公式', formula: 'l = \\frac{n\\pi r}{180}', desc: 'n为圆心角度数，r为半径' },
        { name: '扇形面积公式', formula: 'S = \\frac{n\\pi r^2}{360} = \\frac{1}{2}lr', desc: '利用弧长l或圆心角n快速求扇形面积' }
      ]
    },
    {
      category: '📊 特殊角三角函数值速查',
      items: [
        { name: '30° 特殊角', formula: '\\sin 30^\\circ = \\frac{1}{2}, \\; \\cos 30^\\circ = \\frac{\\sqrt{3}}{2}, \\; \\tan 30^\\circ = \\frac{\\sqrt{3}}{3}', desc: '1:√3:2 直角三角形' },
        { name: '45° 特殊角', formula: '\\sin 45^\\circ = \\frac{\\sqrt{2}}{2}, \\; \\cos 45^\\circ = \\frac{\\sqrt{2}}{2}, \\; \\tan 45^\\circ = 1', desc: '等腰直角三角形 1:1:√2' },
        { name: '60° 特殊角', formula: '\\sin 60^\\circ = \\frac{\\sqrt{3}}{2}, \\; \\cos 60^\\circ = \\frac{1}{2}, \\; \\tan 60^\\circ = \\sqrt{3}', desc: '30°-60°-90° 对偶三角比' }
      ]
    }
  ],
  physics: [
    {
      category: '🏎️ 力学运动与密度',
      items: [
        { name: '速度公式', formula: 'v = \\frac{s}{t} \\iff s = vt, \\; t = \\frac{s}{v}', desc: '1 m/s = 3.6 km/h' },
        { name: '密度公式', formula: '\\rho = \\frac{m}{V} \\iff m = \\rho V, \\; V = \\frac{m}{\\rho}', desc: '水的密度: 1.0 × 10³ kg/m³ = 1 g/cm³' },
        { name: '重力公式', formula: 'G = mg \\quad (g \\approx 9.8 \\text{ N/kg} \\text{ 或 } 10 \\text{ N/kg})', desc: '方向竖直向下，作用点在重心' },
        { name: '固体压强', formula: 'p = \\frac{F}{S}', desc: '单位: Pa (帕斯卡), 1 Pa = 1 N/m²' },
        { name: '液体压强', formula: 'p = \\rho g h', desc: 'h为深度(自由液面到该处的竖直距离)' },
        { name: '杠杆平衡条件', formula: 'F_1 l_1 = F_2 l_2', desc: '动力 × 动力臂 = 阻力 × 阻力臂' },
        { name: '机械功与功率', formula: 'W = Fs, \\quad P = \\frac{W}{t} = Fv', desc: '做功两要素：力和沿力的方向移动的距离' },
        { name: '机械效率', formula: '\\eta = \\frac{W_\\text{有}}{W_\\text{总}} \\times 100\\%', desc: 'W总 = W有 + W额' }
      ]
    },
    {
      category: '🌊 浮力四大计算核心法',
      items: [
        { name: '称重法', formula: 'F_\\text{浮} = G - F\'', desc: '物体重力减去在液体中弹簧测力计拉力' },
        { name: '阿基米德原理', formula: 'F_\\text{浮} = G_\\text{排} = \\rho_\\text{液} g V_\\text{排}', desc: '浮力大小等于物体排开液体受到的重力' },
        { name: '二力平衡法 (漂浮/悬浮)', formula: 'F_\\text{浮} = G_\\text{物}', desc: '物体静止在液面或悬浮在液体中' },
        { name: '压力差法', formula: 'F_\\text{浮} = F_\\text{向上} - F_\\text{向下}', desc: '上下表面受到的液体压力差' }
      ]
    },
    {
      category: '⚡ 电学三大定律与电功率',
      items: [
        { name: '欧姆定律', formula: 'I = \\frac{U}{R} \\iff U = IR, \\; R = \\frac{U}{I}', desc: '导体中的电流与导体两端电压成正比，与电阻成反比' },
        { name: '串联电路规律', formula: 'I = I_1 = I_2, \\; U = U_1 + U_2, \\; R = R_1 + R_2', desc: '串联分压: U1/U2 = R1/R2' },
        { name: '并联电路规律', formula: 'U = U_1 = U_2, \\; I = I_1 + I_2, \\; \\frac{1}{R} = \\frac{1}{R_1} + \\frac{1}{R_2}', desc: '并联总阻: R = (R1·R2)/(R1+R2)，并联分流: I1/I2 = R2/R1' },
        { name: '电功公式', formula: 'W = UIt = Pt = I^2 Rt = \\frac{U^2}{R}t', desc: '单位: 焦耳(J)，1度 = 1 kW·h = 3.6 × 10⁶ J' },
        { name: '电功率四件套', formula: 'P = \\frac{W}{t} = UI = I^2 R = \\frac{U^2}{R}', desc: '纯电阻电路中均可互相代换推导' },
        { name: '焦耳定律', formula: 'Q = I^2 Rt', desc: '电流通过导体产生的热量与电流平方成正比' }
      ]
    }
  ],
  chemistry: [
    {
      category: '💎 化合价口诀顺口溜',
      items: [
        { name: '常见元素化合价顺口溜', formula: '一价氯氢钾钠银，二价氧钙钡镁锌；三铝四硅五价磷，二三铁二四碳；二四六硫都齐全，铜汞二价最常见；单质化合价为零。', desc: '化学式书写基础：正负化合价代数和为零' },
        { name: '常见原子团化合价', formula: '负一硝酸氢氧根 (NO₃⁻, OH⁻)，负二硫酸碳酸根 (SO₄²⁻, CO₃²⁻)，正一价的是铵根 (NH₄⁺)。', desc: '原子团参与反应时通常作为一个整体' }
      ]
    },
    {
      category: '🧲 金属活动性顺序表',
      items: [
        { name: '金属活动性由强到弱', formula: 'K \\; Ca \\; Na \\; Mg \\; Al \\quad Zn \\; Fe \\; Sn \\; Pb \\; (H) \\quad Cu \\; Hg \\; Ag \\; Pt \\; Au', desc: '谐音记忆：钾钙钠镁铝，锌铁锡铅氢，铜汞银铂金' },
        { name: '两大置换规律', formula: '1. 排在氢前面的金属能置换酸中的氢气\\n2. 排在前面的金属能把后面的金属从其盐溶液中置换出来 (K,Ca,Na除外)', desc: '判断金属与酸、金属与盐溶液反应的唯一法则' }
      ]
    },
    {
      category: '🧪 初中常见沉淀与气体标志',
      items: [
        { name: '五大白色沉淀', formula: 'BaSO_4 \\downarrow, \\; AgCl \\downarrow, \\; CaCO_3 \\downarrow, \\; BaCO_3 \\downarrow, \\; Mg(OH)_2 \\downarrow', desc: '注：BaSO₄与AgCl不溶于稀硝酸！' },
        { name: '蓝色沉淀与红褐色沉淀', formula: 'Cu(OH)_2 \\downarrow \\text{ (蓝色)}, \\quad Fe(OH)_3 \\downarrow \\text{ (红褐色)}', desc: '离子检验的核心特征沉淀' },
        { name: '常见气体生成标志', formula: 'CO_2 \\uparrow \\text{ (通入澄清石灰水变浑浊)}, \\quad H_2 \\uparrow, \\quad O_2 \\uparrow \\text{ (带火星木条复燃)}', desc: '方程式中反应物无气体时，生成气体须标注气体箭头 ↑' }
      ]
    }
  ]
};

export default function FormulaHandbookModal({ isOpen, onClose, defaultSubject = '数学', onApplyFormula, onInsertFormula }) {
  const handleApply = onApplyFormula || onInsertFormula;
  const [activeTab, setActiveTab] = useState(() => {
    if (defaultSubject.includes('物')) return 'physics';
    if (defaultSubject.includes('化')) return 'chemistry';
    return 'math';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedFormula, setCopiedFormula] = useState(null);

  const currentCategories = FORMULA_DATABASE[activeTab] || FORMULA_DATABASE.math;

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return currentCategories;
    const term = searchTerm.toLowerCase().trim();
    return currentCategories.map(cat => {
      const matchedItems = cat.items.filter(item =>
        item.name.toLowerCase().includes(term) ||
        item.formula.toLowerCase().includes(term) ||
        item.desc.toLowerCase().includes(term)
      );
      return { ...cat, items: matchedItems };
    }).filter(cat => cat.items.length > 0);
  }, [currentCategories, searchTerm]);

  const handleCopy = (formulaText) => {
    try {
      navigator.clipboard.writeText(formulaText);
      setCopiedFormula(formulaText);
      setTimeout(() => setCopiedFormula(null), 2000);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(10, 15, 29, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 36px)',
        color: '#ffffff'
      }}
    >
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.96))',
        border: '1px solid rgba(59, 130, 246, 0.35)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.6)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.3rem' }}>📖</span>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#60a5fa' }}>
                中考数理化必备公式与定理速查
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                做题卡壳时秒查，点击公式直接复制，不打断解题思路
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.3rem',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Search Bar & Subject Tabs */}
        <div style={{ padding: '12px 18px', background: 'rgba(0, 0, 0, 0.25)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('math')}
              style={{
                flex: 1,
                padding: '7px 0',
                borderRadius: '10px',
                background: activeTab === 'math' ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'rgba(255, 255, 255, 0.06)',
                color: activeTab === 'math' ? '#ffffff' : '#94a3b8',
                border: activeTab === 'math' ? '1px solid #60a5fa' : '1px solid transparent',
                fontWeight: 600,
                fontSize: '0.86rem',
                cursor: 'pointer'
              }}
            >
              📐 初中数学
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('physics')}
              style={{
                flex: 1,
                padding: '7px 0',
                borderRadius: '10px',
                background: activeTab === 'physics' ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : 'rgba(255, 255, 255, 0.06)',
                color: activeTab === 'physics' ? '#ffffff' : '#94a3b8',
                border: activeTab === 'physics' ? '1px solid #38bdf8' : '1px solid transparent',
                fontWeight: 600,
                fontSize: '0.86rem',
                cursor: 'pointer'
              }}
            >
              ⚡ 初中物理
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('chemistry')}
              style={{
                flex: 1,
                padding: '7px 0',
                borderRadius: '10px',
                background: activeTab === 'chemistry' ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255, 255, 255, 0.06)',
                color: activeTab === 'chemistry' ? '#ffffff' : '#94a3b8',
                border: activeTab === 'chemistry' ? '1px solid #34d399' : '1px solid transparent',
                fontWeight: 600,
                fontSize: '0.86rem',
                cursor: 'pointer'
              }}
            >
              🧪 初中化学
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 搜索公式或定理（如：浮力、二次函数、完全平方、化合价）..."
              style={{
                width: '100%',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#ffffff',
                fontSize: '0.84rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Content list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', scrollbarWidth: 'thin' }}>
          {filteredCategories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              🔍 未搜索到相关公式，请更换关键词
            </div>
          ) : (
            filteredCategories.map((cat, catIdx) => (
              <div key={catIdx} style={{ marginBottom: '18px' }}>
                <div style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#93c5fd',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>{cat.category}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cat.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f8fafc' }}>
                          {item.name}
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.formula)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: copiedFormula === item.formula ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                              color: copiedFormula === item.formula ? '#34d399' : '#cbd5e1',
                              border: copiedFormula === item.formula ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.12)',
                              fontSize: '0.74rem',
                              cursor: 'pointer'
                            }}
                          >
                            {copiedFormula === item.formula ? '✓ 已复制' : '复制公式'}
                          </button>
                          {handleApply && (
                            <button
                              type="button"
                              onClick={() => {
                                handleApply(item.formula);
                                onClose();
                              }}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: '#60a5fa',
                                border: '1px solid rgba(59, 130, 246, 0.35)',
                                fontSize: '0.74rem',
                                cursor: 'pointer'
                              }}
                            >
                              插入提问
                            </button>
                          )}
                        </div>
                      </div>
                      <FormulaDisplay formula={item.formula} />
                      <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                        💡 {item.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 18px',
          background: 'rgba(15, 23, 42, 0.8)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          color: '#64748b',
          flexShrink: 0
        }}>
          <span>按 ESC 键或点击右上角可快速关闭</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              minHeight: '40px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              cursor: 'pointer',
              fontWeight: 600,
              touchAction: 'manipulation'
            }}
          >
            关闭速查
          </button>
        </div>
      </div>
    </div>
  );
}
