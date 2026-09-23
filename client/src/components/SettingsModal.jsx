import React, { useState } from 'react';
import { useAppStore } from '../store/useStore';

const EDITIONS = [
  { value: '人教版', label: '📖 人民教育出版社 (人教版 - 推荐)' },
  { value: '北师大版', label: '📖 北京师范大学出版社 (北师大版)' },
  { value: '苏教版', label: '📖 江苏凤凰教育出版社 (苏教版)' },
  { value: '华东师大版', label: '📖 华东师范大学出版社 (华东师大版)' },
  { value: '沪教版', label: '📖 上海教育出版社 (沪教版)' },
  { value: '鲁教版', label: '📖 山东教育出版社 (鲁教版)' },
  { value: '冀教版', label: '📖 河北教育出版社 (冀教版)' },
  { value: '仁爱版', label: '📖 仁爱教育版 (英语专版)' },
];

const PERSONAS = [
  {
    id: 'owl',
    name: '🦉 智多星老师',
    tag: '逻辑推导 · 独立思考',
    desc: '擅长苏格拉底式连续发问，步步拆解题目骨架，引导孩子自主得出答案，培养严密逻辑。'
  },
  {
    id: 'lion',
    name: '🦁 聪聪狮老师',
    tag: '生动趣味 · 耐心鼓励',
    desc: '语言风趣生动，擅长用生活实物做比喻，耐心肯定孩子的每一步尝试，推荐 1-4 低年级使用。'
  },
  {
    id: 'sister',
    name: '🌸 晓晴姐',
    tag: '温柔细腻 · 错题心理疏导',
    desc: '温柔亲切的大姐姐风格，像在草稿纸上并肩验算，善于帮孩子缓解做错题时的焦虑与沮丧。'
  }
];

export default function SettingsModal({
  isOpen,
  onClose,
  socraticLevel,
  onSocraticToggle,
  autoRead,
  onAutoReadToggle,
  currentProfileId,
  currentProfileEdition,
  onEditionChange
}) {
  const {
    language,
    setLanguage,
    t,
    isEinkMode,
    toggleEinkMode,
    tutorPersona,
    setTutorPersona,
    currentProfile
  } = useAppStore();

  const [ttsEngine, setTtsEngine] = useState(() => localStorage.getItem('tts_engine') || 'local');
  const [selectedEdition, setSelectedEdition] = useState(currentProfileEdition || '人教版');
  const [saveToast, setSaveToast] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    if (onEditionChange && selectedEdition !== currentProfileEdition) {
      onEditionChange(selectedEdition);
    }
    localStorage.setItem('tts_engine', ttsEngine);
    setSaveToast(true);
    setTimeout(() => {
      setSaveToast(false);
      onClose();
    }, 500);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content"
        style={{
          maxWidth: '560px',
          width: '92%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          borderRadius: '20px',
          overflow: 'hidden',
          background: 'var(--bg-secondary, #1e293b)',
          color: 'var(--text-primary, #f8fafc)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>⚙️</span>
            <div>
              <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 700 }}>基础偏好设置</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                定制学生教材版本、语音讲解与伴学名师风格
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* Section 1: 教材版本 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px', color: '#60a5fa' }}>
              📚 当前教材版本 ({currentProfile?.name || '当前档案'})
            </label>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 10px' }}>
              根据所在学校选择课本版本，智能问答将精准对齐该版本的单元章节与知识点大纲。
            </p>
            <select
              value={selectedEdition}
              onChange={(e) => setSelectedEdition(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'white',
                fontSize: '0.95rem',
                outline: 'none'
              }}
            >
              {EDITIONS.map(ed => (
                <option key={ed.value} value={ed.value} style={{ background: '#1e293b', color: 'white' }}>
                  {ed.label}
                </option>
              ))}
            </select>
          </div>

          {/* Section 2: AI 名师形象 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '10px', color: '#a78bfa' }}>
              🦉 专属伴学名师形象
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {PERSONAS.map(p => {
                const isSelected = (tutorPersona || 'owl') === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setTutorPersona(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: isSelected ? '1.5px solid #a78bfa' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSelected ? 'rgba(167, 139, 250, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      type="radio"
                      name="tutorPersona"
                      checked={isSelected}
                      onChange={() => setTutorPersona(p.id)}
                      style={{ marginTop: '4px', accentColor: '#a78bfa' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.95rem', color: isSelected ? '#c4b5fd' : '#f8fafc' }}>{p.name}</strong>
                        <span style={{ fontSize: '0.72rem', background: 'rgba(255, 255, 255, 0.08)', padding: '1px 6px', borderRadius: '6px', color: '#94a3b8' }}>
                          {p.tag}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                        {p.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: 语音朗读与引擎 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '12px', color: '#34d399' }}>
              🔊 语音朗读偏好
            </label>
            
            {/* 自动语音朗读 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>回答完成后自动语音朗读</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>名师解答生成完毕后，自动出声朗读解题思路</div>
              </div>
              <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                <input
                  type="checkbox"
                  checked={!!autoRead}
                  onChange={onAutoReadToggle}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    background: autoRead ? '#10b981' : 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '24px', transition: '.3s'
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', content: '""', height: '18px', width: '18px', left: autoRead ? '22px' : '3px',
                      bottom: '3px', background: 'white', borderRadius: '50%', transition: '.3s'
                    }}
                  />
                </span>
              </label>
            </div>

            {/* 朗读引擎选择 */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '8px' }}>发音音色引擎</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setTtsEngine('local')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: ttsEngine === 'local' ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: ttsEngine === 'local' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    color: ttsEngine === 'local' ? '#34d399' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: ttsEngine === 'local' ? 600 : 400
                  }}
                >
                  ⚡ 本地原声 (0秒即读)
                </button>
                <button
                  type="button"
                  onClick={() => setTtsEngine('cloud')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: ttsEngine === 'cloud' ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: ttsEngine === 'cloud' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    color: ttsEngine === 'cloud' ? '#34d399' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: ttsEngine === 'cloud' ? 600 : 400
                  }}
                >
                  🎙️ 云端高清名师原声
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: 默认教学模式 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px', color: '#fbbf24' }}>
              💡 教学启发模式偏好
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { key: 'guided', label: '🤔 启发式', desc: '给思路不透题' },
                { key: 'strict', label: '🦉 提问式', desc: '纯苏氏发问' },
                { key: 'direct', label: '💡 直接解析', desc: '全步骤透析' },
              ].map(m => {
                const isSelected = (socraticLevel || 'guided') === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => onSocraticToggle && onSocraticToggle(m.key)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '10px',
                      border: isSelected ? '1.5px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSelected ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                      color: isSelected ? '#fbbf24' : '#94a3b8',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.label}</div>
                    <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: '2px' }}>{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 5: 界面语言与护眼模式 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '12px', color: '#38bdf8' }}>
              🌐 语言与视力健康
            </label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>纸质墨水屏护眼模式</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>无频闪高对比度黑白纸质排版，保护中小学生视力</div>
              </div>
              <button
                type="button"
                onClick={toggleEinkMode}
                style={{
                  padding: '6px 14px',
                  borderRadius: '12px',
                  border: isEinkMode ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
                  background: isEinkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  color: isEinkMode ? '#38bdf8' : '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                {isEinkMode ? '✅ 墨水屏生效中' : '点击开启护眼'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>界面语言</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setLanguage('zh-CN')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: language === 'zh-CN' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                    background: language === 'zh-CN' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: language === 'zh-CN' ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.82rem'
                  }}
                >
                  中文
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: language === 'en' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                    background: language === 'en' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: language === 'en' ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.82rem'
                  }}
                >
                  English
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.15)'
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            曾练专属私教 v1.3.2 · 人教版 1-9 年级
          </div>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '8px 22px',
              borderRadius: '10px',
              border: 'none',
              background: saveToast ? '#10b981' : '#3b82f6',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {saveToast ? '✅ 已保存' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}
