import React from 'react';
import { getTranslation } from '../utils/i18n';
import { useAppStore } from '../store/useStore';

const GRADES = [
  { value: '', label: '全部年级' },
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

const SUBJECTS = [
  { value: '', label: '全部科目' },
  { value: '语文', label: '语文' }, { value: '数学', label: '数学' },
  { value: '英语', label: '英语' }, { value: '物理', label: '物理' },
  { value: '化学', label: '化学' }, { value: '生物', label: '生物学' },
  { value: '历史', label: '历史' }, { value: '地理', label: '地理' },
  { value: '道德与法治', label: '道法' },
];

function getValidSubjectsForGrade(grade) {
  if (!grade) return SUBJECTS;
  const gradeStr = String(grade);
  const isPrimary = ['1', '2', '3', '4', '5', '6'].some(num => gradeStr.startsWith(num));
  if (isPrimary) {
    return [
      { value: '', label: '全部科目' },
      { value: '语文', label: '语文' },
      { value: '数学', label: '数学' },
      { value: '英语', label: '英语' },
    ];
  }
  if (gradeStr.startsWith('7')) {
    return [
      { value: '', label: '全部科目' },
      { value: '语文', label: '语文' },
      { value: '数学', label: '数学' },
      { value: '英语', label: '英语' },
      { value: '道德与法治', label: '道法' },
      { value: '历史', label: '历史' },
      { value: '地理', label: '地理' },
      { value: '生物', label: '生物学' },
    ];
  }
  if (gradeStr.startsWith('8')) {
    return [
      { value: '', label: '全部科目' },
      { value: '语文', label: '语文' },
      { value: '数学', label: '数学' },
      { value: '英语', label: '英语' },
      { value: '道德与法治', label: '道法' },
      { value: '历史', label: '历史' },
      { value: '地理', label: '地理' },
      { value: '生物', label: '生物学' },
      { value: '物理', label: '物理' },
    ];
  }
  if (gradeStr.startsWith('9')) {
    return [
      { value: '', label: '全部科目' },
      { value: '语文', label: '语文' },
      { value: '数学', label: '数学' },
      { value: '英语', label: '英语' },
      { value: '道德与法治', label: '道法' },
      { value: '历史', label: '历史' },
      { value: '物理', label: '物理' },
      { value: '化学', label: '化学' },
    ];
  }
  return SUBJECTS;
}

// Three-level Socratic teaching mode
const SOCRATIC_LEVELS = [
  { value: 'direct', label: '💡 直接解答', title: 'AI直接给出完整答案和解析' },
  { value: 'guided', label: '🤔 引导模式', title: 'AI先给提示引导学生自己思考' },
  { value: 'strict', label: '🦉 苏格拉底', title: 'AI只用提问引导，绝不直接给答案' },
];

const PERSONAS = [
  { value: 'owl', label: '🦉 智多星导师', title: '深度苏格拉底推理·严谨治学' },
  { value: 'lion', label: '🦁 聪聪小狮子', title: '趣味互动·实物比喻·耐心肯定（推荐低年级）' },
  { value: 'sister', label: '🌸 晓晴学姐', title: '温柔亲切·草稿步步拆解·温和陪伴' }
];

export default function Header({
  profiles, currentProfileId, onProfileChange, onDeleteProfile, onRenameProfile,
  selectedGrade, onGradeChange, selectedSubject, onSubjectChange,
  onClearChat, socraticLevel, onSocraticCycle, isLightMode, onThemeToggle, onSettingsOpen,
  onOpenGamification, onOpenManipulatives, onOpenGeometrySandbox,
  onOpenMembership, onOpenPoster
}) {
  const { language, isEinkMode, toggleEinkMode, tutorPersona, setTutorPersona, membershipStatus } = useAppStore();
  const isVip = membershipStatus?.is_vip;
  const currentSocratic = SOCRATIC_LEVELS.find(l => l.value === socraticLevel) || SOCRATIC_LEVELS[0];
  const nextSocratic = SOCRATIC_LEVELS[(SOCRATIC_LEVELS.findIndex(l => l.value === socraticLevel) + 1) % SOCRATIC_LEVELS.length];

  const handleSocraticClick = () => {
    onSocraticCycle(nextSocratic.value);
  };

  const currentProfile = profiles.find(p => p.id === currentProfileId) || { edition: '人教版' };
  const selectedEdition = currentProfile.edition || '人教版';

  return (
    <header className="header" role="banner" aria-label="应用顶栏">
      {/* 品牌与标题 (Left) */}
      <div className="header-left">
        <div className="header-icon" onClick={onClearChat} title="点击清空对话" role="button" tabIndex={0} aria-label="清空当前对话" onKeyDown={e => e.key === 'Enter' && onClearChat()}>
          🎓
        </div>
        <div className="header-text">
          <h1>{getTranslation(language, 'app.title')}</h1>
          <div className="header-subtitle">{getTranslation(language, 'app.subtitle')}</div>
        </div>
      </div>

      {/* 控制栏与快捷工具 (Right) */}
      <div className="header-controls">
        {/* 学生档案选择与编辑 */}
        <select className="grade-selector" style={{ backgroundColor: 'var(--accent-color)', color: 'white', fontWeight: 'bold' }}
          value={currentProfileId} onChange={e => onProfileChange(e.target.value)} aria-label="选择学生档案">
          {profiles.map(p => <option key={p.id} value={p.id}>👤 {p.name}</option>)}
          <option value="ADD_NEW">➕ 添加新用户...</option>
        </select>
        <button
          onClick={() => {
            const currentName = currentProfile.name || '曾练';
            const newName = window.prompt(`修改学生姓名/昵称：`, currentName);
            if (newName && newName.trim() && newName.trim() !== currentName) {
              onRenameProfile && onRenameProfile(currentProfileId, newName.trim());
            }
          }}
          title="修改当前学生姓名"
          aria-label="修改当前学生姓名"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '0 2px' }}
        >
          ✏️
        </button>
        {currentProfileId !== 'default' && (
          <button onClick={onDeleteProfile} title="删除此档案" aria-label="删除当前学生档案"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>
            🗑️
          </button>
        )}

        {/* 学科选择 */}
        <select className="grade-selector" value={selectedSubject} onChange={e => onSubjectChange(e.target.value)} aria-label="选择学科">
          {getValidSubjectsForGrade(selectedGrade).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {/* 年级选择 */}
        <select className="grade-selector" value={selectedGrade} onChange={e => onGradeChange(e.target.value)} aria-label="选择年级">
          {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>

        {/* 名师风格 */}
        <select
          className="grade-selector"
          value={tutorPersona}
          onChange={e => setTutorPersona(e.target.value)}
          title="切换名师/学伴风格"
          aria-label="选择名师风格"
          style={{ background: 'rgba(37, 99, 235, 0.15)', borderColor: 'rgba(37, 99, 235, 0.3)' }}
        >
          {PERSONAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        {/* 1-3年级趣味实物教具 */}
        {['1', '2', '3'].some(n => String(selectedGrade).startsWith(n)) && onOpenManipulatives && (
          <button
            onClick={onOpenManipulatives}
            title="打开小学趣味积木与等式天平教具"
            aria-label="打开小学具象实物教具"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
              color: '#fff', border: 'none', borderRadius: '10px',
              padding: '6px 10px', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '3px'
            }}
          >
            <span>🎒</span>
            <span>实物教具</span>
          </button>
        )}

        {/* 7-9年级动点压轴沙盒 */}
        {['7', '8', '9'].some(n => String(selectedGrade).startsWith(n)) && onOpenGeometrySandbox && (
          <button
            onClick={onOpenGeometrySandbox}
            title="打开初中动点几何与二次函数压轴沙盒"
            aria-label="打开初中动点压轴沙盒"
            style={{
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff', border: 'none', borderRadius: '10px',
              padding: '6px 10px', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '3px'
            }}
          >
            <span>📐</span>
            <span>动点沙盒</span>
          </button>
        )}

        {/* 段位勋章 */}
        {onOpenGamification && (
          <button
            onClick={onOpenGamification}
            title="查看学霸成长段位与勋章"
            aria-label="查看学霸段位勋章"
            style={{
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(245, 158, 11, 0.15))',
              color: '#facc15',
              border: '1px solid rgba(234, 179, 8, 0.4)',
              borderRadius: '10px',
              padding: '6px 10px',
              fontSize: '0.82rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
          >
            <span>👑</span>
            <span>段位勋章</span>
          </button>
        )}

        {/* VIP会员与卡密激活 */}
        {onOpenMembership && (
          <button
            onClick={onOpenMembership}
            title={isVip ? `VIP会员有效期至: ${membershipStatus?.expires_at ? new Date(membershipStatus.expires_at).toLocaleDateString() : '永久'}` : '开通/激活VIP会员'}
            aria-label="VIP会员与卡密激活"
            style={{
              background: isVip 
                ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.3), rgba(245, 158, 11, 0.2))'
                : 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(59, 130, 246, 0.2))',
              color: isVip ? '#fbbf24' : '#c084fc',
              border: `1px solid ${isVip ? 'rgba(234, 179, 8, 0.5)' : 'rgba(139, 92, 246, 0.4)'}`,
              borderRadius: '10px',
              padding: '6px 10px',
              fontSize: '0.82rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
          >
            <span>{isVip ? '👑' : '💎'}</span>
            <span>{isVip ? 'VIP会员' : '激活VIP'}</span>
          </button>
        )}

        {/* 家长获客分享裂变海报 */}
        {onOpenPoster && (
          <button
            onClick={onOpenPoster}
            title="生成家长朋友圈高转化分享海报"
            aria-label="生成家长分享海报"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.15))',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: '10px',
              padding: '6px 10px',
              fontSize: '0.82rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
          >
            <span>📣</span>
            <span>海报</span>
          </button>
        )}

        {/* 教学模式 */}
        <button onClick={handleSocraticClick} title={getTranslation(language, `mode.${currentSocratic.value}_title`)} aria-label={`当前教学模式：${currentSocratic.label}，点击切换`}
          style={{
            background: socraticLevel !== 'direct' ? 'var(--accent-color)' : 'rgba(0,0,0,0.3)',
            color: 'white', border: '1px solid var(--glass-border)', borderRadius: '10px',
            padding: '6px 10px', fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s'
          }}>
          {currentSocratic.label}
        </button>

        {/* 护眼纸质/深色/设置 快捷工具图标组 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', paddingLeft: '4px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={toggleEinkMode} aria-label={isEinkMode ? '退出墨水屏护眼模式' : '进入墨水屏纸质护眼模式'} title={isEinkMode ? '当前：墨水屏纸质护眼模式（点击退出）' : '切换为墨水屏纸质护眼模式 (零残影·无频闪)'}
            style={{
              background: isEinkMode ? '#000' : 'rgba(255, 255, 255, 0.08)',
              color: isEinkMode ? '#fff' : 'inherit',
              border: isEinkMode ? '1px solid #000' : '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '3px 7px',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              fontWeight: 'bold'
            }}>
            <span>📖</span>
            <span>{isEinkMode ? '墨水屏' : '纸质'}</span>
          </button>
          <button onClick={onThemeToggle} aria-label={isLightMode ? '切换到深色模式' : '切换到浅色模式'} title="切换主题"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '2px 4px' }}>
            {isLightMode ? '🌙' : '☀️'}
          </button>
          <button onClick={onSettingsOpen} aria-label="打开系统设置" title="系统设置"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '2px 4px' }}>
            ⚙️
          </button>
        </div>
      </div>
    </header>
  );
}
