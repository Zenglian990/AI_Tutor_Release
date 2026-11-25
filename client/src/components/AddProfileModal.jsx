import { useState } from 'react';

export const TEXTBOOK_EDITIONS = [
  { value: '人教版', label: '人教版 (PEP / 全国通用)' },
  { value: '北师大版', label: '北师大版 (BSNU)' },
  { value: '苏教版', label: '苏教版 (SJ)' },
  { value: '苏科版', label: '苏科版 (江苏理科)' },
  { value: '外研版', label: '外研版 (WY / 英语)' },
  { value: '译林版', label: '译林版 (YL / 英语)' },
  { value: '沪教版', label: '沪教版 (上海)' },
  { value: '沪科版', label: '沪科版 (上海科技)' },
  { value: '浙教版', label: '浙教版 (浙江)' },
  { value: '湘教版', label: '湘教版 (湖南)' },
  { value: '鲁教版', label: '鲁教版 (山东)' },
  { value: '粤教版', label: '粤教版 (广东)' },
  { value: '教科版', label: '教科版 (JK)' },
  { value: '华师大版', label: '华师大版 (HSD)' },
  { value: '西南大学版', label: '西南大学版 (西教版 2024新版)' },
  { value: '西师大版', label: '西师大版 (西师版 / 川渝旧版)' },
  { value: '仁爱版', label: '仁爱版 (英语)' },
  { value: '冀教版', label: '冀教版 (河北)' }
];

export default function AddProfileModal({ isOpen, onClose, onConfirm }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [edition, setEdition] = useState('人教版');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await Promise.resolve(onConfirm(name.trim(), grade || '7_up', edition));
      setName('');
      setGrade('');
      setEdition('人教版');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const gradeOptions = [
    { value: '', label: '-- 请选择年级与册别 --' },
    { value: '1_up', label: '一年级上册' }, { value: '1_down', label: '一年级下册' },
    { value: '2_up', label: '二年级上册' }, { value: '2_down', label: '二年级下册' },
    { value: '3_up', label: '三年级上册' }, { value: '3_down', label: '三年级下册' },
    { value: '4_up', label: '四年级上册' }, { value: '4_down', label: '四年级下册' },
    { value: '5_up', label: '五年级上册' }, { value: '5_down', label: '五年级下册' },
    { value: '6_up', label: '六年级上册' }, { value: '6_down', label: '六年级下册' },
    { value: '7_up', label: '初一上册' }, { value: '7_down', label: '初一下册' },
    { value: '8_up', label: '初二上册' }, { value: '8_down', label: '初二下册' },
    { value: '9_up', label: '初三上册' }, { value: '9_down', label: '初三下册' },
    { value: '10_up', label: '高一上册' }, { value: '10_down', label: '高一下册' },
    { value: '11_up', label: '高二上册' }, { value: '11_down', label: '高二下册' },
    { value: '12_up', label: '高三上册' }, { value: '12_down', label: '高三下册' },
  ];

  return (
    <div className="modal-overlay no-print" style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15, 23, 42, 0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '12px', boxSizing: 'border-box'
    }}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: 'min(420px, calc(100vw - 24px))', padding: '22px', borderRadius: '16px',
        border: '1px solid rgba(148, 163, 184, 0.25)', background: '#0f172a', color: '#f8fafc',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '16px',
        boxSizing: 'border-box'
      }}>
        <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ➕ 创建新学生档案
        </h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '0.875rem', fontWeight: 600 }}>孩子姓名/昵称</label>
            <input
              aria-label="孩子姓名或昵称"
              type="text"
              placeholder="例如：小明、小红、高三理科生"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
              maxLength={15}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', outline: 'none', fontSize: '0.95rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '0.875rem', fontWeight: 600 }}>选择年级 (1-12年级)</label>
            <select
              aria-label="选择年级"
              value={grade}
              onChange={e => setGrade(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', outline: 'none', fontSize: '0.95rem' }}
            >
              {gradeOptions.map(o => (
                <option key={o.value} value={o.value} style={{ background: '#1e293b', color: '#f8fafc' }}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '0.875rem', fontWeight: 600 }}>选择教材版本</label>
            <select
              aria-label="选择教材版本"
              value={edition}
              onChange={e => setEdition(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', outline: 'none', fontSize: '0.95rem' }}
            >
              {TEXTBOOK_EDITIONS.map(ed => (
                <option key={ed.value} value={ed.value} style={{ background: '#1e293b', color: '#f8fafc' }}>{ed.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} disabled={submitting} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #475569', background: '#1e293b', color: '#cbd5e1', cursor: 'pointer' }}>取消</button>
            <button type="submit" disabled={submitting} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#ffffff', cursor: submitting ? 'wait' : 'pointer', fontWeight: 'bold' }}>
              {submitting ? '正在注册档案...' : '确认创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
