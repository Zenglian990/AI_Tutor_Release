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
      {/* 1. 品牌与标题 (Left) */}
      <div className="header-left">
        <div
          className="header-icon"
          onClick={onClearChat}
          title="点击清空当前对话"
          role="button"
          tabIndex={0}
          aria-label="清空当前对话"
          onKeyDown={e => e.key === 'Enter' && onClearChat()}
        >
          🎓
        </div>
        <div className="header-brand">
          <h1>{getTranslation(language, 'app.title')}</h1>
          <span className="brand-badge">人教版 1-9年级</span>
        </div>
      </div>

      {/* 2. 学习情境胶囊 (Center) - 档案·年级·学科·名师 紧凑整合 */}
      <div className="header-capsule">
        {/* 学生档案 */}
        <div className="capsule-item">
          <select
            className="capsule-select"
            value={currentProfileId}
            onChange={e => onProfileChange(e.target.value)}
            aria-label="选择学生档案"
            title={`当前学生：${currentProfile.name}`}
            style={{ fontWeight: 'bold', color: '#60a5fa' }}
          >
            {profiles.map(p => <option key={p.id} value={p.id}>👤 {p.name}</option>)}
            <option value="ADD_NEW">➕ 新建档案...</option>
          </select>
          <button
            onClick={() => {
              const currentName = currentProfile.name || '曾练';
              const newName = window.prompt(`修改学生姓名/昵称：`, currentName);
              if (newName && newName.trim() && newName.trim() !== currentName) {
                onRenameProfile && onRenameProfile(currentProfileId, newName.trim());
              }
            }}
            title="修改学生姓名"
            aria-label="修改学生姓名"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#94a3b8', padding: '0 2px' }}
          >
            ✏️
          </button>
        </div>

        <div className="capsule-divider" />

        {/* 年级 */}
        <div className="capsule-item">
          <select
            className="capsule-select"
            value={selectedGrade}
            onChange={e => onGradeChange(e.target.value)}
            aria-label="选择年级"
            title="切换年级教材"
          >
            {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>

        <div className="capsule-divider" />

        {/* 学科 */}
        <div className="capsule-item">
          <select
            className="capsule-select"
            value={selectedSubject}
            onChange={e => onSubjectChange(e.target.value)}
            aria-label="选择学科"
            title="切换学科"
          >
            {getValidSubjectsForGrade(selectedGrade).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="capsule-divider" />

        {/* 名师风格 */}
        <div className="capsule-item">
          <select
            className="capsule-select"
            value={tutorPersona}
            onChange={e => setTutorPersona(e.target.value)}
            title="切换名师/学伴风格"
            aria-label="切换名师风格"
          >
            {PERSONAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* 3. 核心功能与操作区 (Right) */}
      <div className="header-actions">
        {/* 1-3年级趣味实物教具 */}
        {['1', '2', '3'].some(n => String(selectedGrade).startsWith(n)) && onOpenManipulatives && (
          <button
            onClick={onOpenManipulatives}
            className="header-btn-pill"
            title="打开小学趣味积木与等式天平教具"
            aria-label="打开小学具象实物教具"
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.15))',
              color: '#fbbf24',
              borderColor: 'rgba(245, 158, 11, 0.35)'
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
            className="header-btn-pill"
            title="打开初中动点几何与二次函数压轴沙盒"
            aria-label="打开初中动点压轴沙盒"
            style={{
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(29, 78, 216, 0.15))',
              color: '#60a5fa',
              borderColor: 'rgba(59, 130, 246, 0.35)'
            }}
          >
            <span>📐</span>
            <span>动点沙盒</span>
          </button>
        )}

        {/* VIP 会员与卡密激活 */}
        {onOpenMembership && (
          <button
            onClick={onOpenMembership}
            className="header-btn-pill"
            title={isVip ? `VIP会员有效期至: ${membershipStatus?.expires_at ? new Date(membershipStatus.expires_at).toLocaleDateString() : '永久'}` : '开通/激活VIP会员'}
            aria-label="VIP会员与卡密激活"
            style={{
              background: isVip 
                ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(245, 158, 11, 0.15))'
                : 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.15))',
              color: isVip ? '#fbbf24' : '#c084fc',
              borderColor: isVip ? 'rgba(234, 179, 8, 0.4)' : 'rgba(139, 92, 246, 0.35)',
              boxShadow: isVip ? '0 0 10px rgba(245, 158, 11, 0.15)' : 'none'
            }}
          >
            <span>{isVip ? '👑' : '💎'}</span>
            <span>{isVip ? 'VIP会员' : '激活VIP'}</span>
          </button>
        )}

        {/* 教学模式 */}
        <button
          onClick={handleSocraticClick}
          className="header-btn-pill"
          title={getTranslation(language, `mode.${currentSocratic.value}_title`)}
          aria-label={`当前教学模式：${currentSocratic.label}，点击切换`}
          style={{
            background: socraticLevel !== 'direct' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            color: socraticLevel !== 'direct' ? '#60a5fa' : '#94a3b8',
            borderColor: socraticLevel !== 'direct' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.1)'
          }}
        >
          {currentSocratic.label}
        </button>

        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />

        {/* 快捷工具小图标组 (勋章、海报、墨水屏、主题、设置) */}
        {onOpenGamification && (
          <button
            onClick={onOpenGamification}
            className="header-btn-icon"
            title="学霸成长段位与勋章"
            aria-label="学霸段位勋章"
          >
            👑
          </button>
        )}

        {onOpenPoster && (
          <button
            onClick={onOpenPoster}
            className="header-btn-icon"
            title="生成家长朋友圈高转化宣传海报"
            aria-label="生成家长宣传海报"
          >
            📣
          </button>
        )}

        <button
          onClick={toggleEinkMode}
          className="header-btn-icon"
          title={isEinkMode ? '退出墨水屏护眼模式' : '进入墨水屏纸质护眼模式 (零残影·无频闪)'}
          aria-label="纸质护眼模式切换"
          style={{ background: isEinkMode ? '#ffffff' : undefined, color: isEinkMode ? '#000000' : undefined }}
        >
          📖
        </button>

        <button
          onClick={onThemeToggle}
          className="header-btn-icon"
          title={isLightMode ? '切换到深色模式' : '切换到浅色模式'}
          aria-label="主题切换"
        >
          {isLightMode ? '🌙' : '☀️'}
        </button>

        <button
          onClick={onSettingsOpen}
          className="header-btn-icon"
          title="系统设置"
          aria-label="打开系统设置"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}
