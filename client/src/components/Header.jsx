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

export default function Header({
  profiles, currentProfileId, onProfileChange, onDeleteProfile,
  selectedGrade, onGradeChange, selectedSubject, onSubjectChange,
  onClearChat, socraticLevel, onSocraticCycle, isLightMode, onThemeToggle, onSettingsOpen
}) {
  const currentSocratic = SOCRATIC_LEVELS.find(l => l.value === socraticLevel) || SOCRATIC_LEVELS[0];
  const nextSocratic = SOCRATIC_LEVELS[(SOCRATIC_LEVELS.findIndex(l => l.value === socraticLevel) + 1) % SOCRATIC_LEVELS.length];

  const handleSocraticClick = () => {
    onSocraticCycle(nextSocratic.value);
  };

  const currentProfile = profiles.find(p => p.id === currentProfileId) || { edition: '人教版' };
  const selectedEdition = currentProfile.edition || '人教版';

  return (
    <header className="header" role="banner" aria-label="应用顶栏">
      <div className="header-icon" onClick={onClearChat} title="点击清空对话" role="button" tabIndex={0} aria-label="清空当前对话" onKeyDown={e => e.key === 'Enter' && onClearChat()}>
        🎓
      </div>
      <div className="header-text">
        <h1>曾练专属私教</h1>
        <div className="header-subtitle">基于{selectedEdition}1-9年级教材 · 支持拍照识题 · 语音提问</div>
      </div>
      <button onClick={onThemeToggle} aria-label={isLightMode ? '切换到深色模式' : '切换到浅色模式'} title="切换主题"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', marginRight: '5px' }}>
        {isLightMode ? '🌙' : '☀️'}
      </button>
      <button onClick={onSettingsOpen} aria-label="打开系统设置" title="系统设置"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', marginRight: '10px' }}>
        ⚙️
      </button>
      <div className="header-controls" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="grade-selector" style={{ backgroundColor: 'var(--accent-color)', color: 'white', fontWeight: 'bold' }}
          value={currentProfileId} onChange={e => onProfileChange(e.target.value)} aria-label="选择学生档案">
          {profiles.map(p => <option key={p.id} value={p.id}>👤 {p.name}</option>)}
          <option value="ADD_NEW">➕ 添加新用户...</option>
        </select>
        {currentProfileId !== 'default' && (
          <button onClick={onDeleteProfile} title="删除此档案" aria-label="删除当前学生档案"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>
            🗑️
          </button>
        )}
        <select className="grade-selector" value={selectedSubject} onChange={e => onSubjectChange(e.target.value)} aria-label="选择学科">
          {getValidSubjectsForGrade(selectedGrade).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="grade-selector" value={selectedGrade} onChange={e => onGradeChange(e.target.value)} aria-label="选择年级">
          {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <button onClick={handleSocraticClick} title={currentSocratic.title} aria-label={`当前教学模式：${currentSocratic.label}，点击切换`}
          style={{
            background: socraticLevel !== 'direct' ? 'var(--accent-color)' : 'rgba(0,0,0,0.3)',
            color: 'white', border: '1px solid var(--glass-border)', borderRadius: '10px',
            padding: '6px 12px', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
          }}>
          {currentSocratic.label}
        </button>
      </div>
    </header>
  );
}
