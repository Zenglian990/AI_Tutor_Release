import { useState } from 'react';

export default function AddProfileModal({ isOpen, onClose, onConfirm }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [edition, setEdition] = useState('人教版');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onConfirm(name.trim(), grade, edition);
    setName('');
    setGrade('');
    setEdition('人教版');
    onClose();
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
  ];

  return (
    <div className="modal-overlay no-print" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
    }}>
      <div className="glass-panel" style={{
        width: '90%', maxWidth: '400px', padding: '24px', borderRadius: '16px',
        border: '1px solid var(--glass-border)', background: 'var(--card-bg)',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ➕ 创建新学生档案
        </h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>孩子姓名/昵称</label>
            <input
              type="text"
              placeholder="例如：妹妹、小练"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
              maxLength={20}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>选择年级 (可选)</label>
            <select
              value={grade}
              onChange={e => setGrade(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
            >
              {gradeOptions.map(o => (
                <option key={o.value} value={o.value} style={{ background: '#1e293b' }}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>选择教材版本 (可选)</label>
            <select
              value={edition}
              onChange={e => setEdition(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }}
            >
              <option value="人教版" style={{ background: '#1e293b' }}>人教版 (PEP / 全国通用)</option>
              <option value="西南大学版" style={{ background: '#1e293b' }}>西南大学版 (西教版 2024新版)</option>
              <option value="西师大版" style={{ background: '#1e293b' }}>西师大版 (西师版 / 川渝数学旧版)</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>取消</button>
            <button type="submit" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>确认创建</button>
          </div>
        </form>
      </div>
    </div>
  );
}
