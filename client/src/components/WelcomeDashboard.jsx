import React from 'react';
import { formatGrade } from '../store/useStore';

export default function WelcomeDashboard({
  currentProfile,
  selectedGrade,
  selectedSubject,
  onGradeChange,
  onSubjectChange,
  onCameraClick,
  onReviewMistakes,
  onOpenMap,
  onQuickPrompt
}) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  const studentName = currentProfile?.name || '曾练';
  const gradeLabel = formatGrade(selectedGrade);
  const subjectLabel = selectedSubject || '数学';

  // Determine stage category
  const gradeStr = String(selectedGrade || '');
  let stageName = '初中攻坚阶段';
  let stageIcon = '📐';
  let stageDescription = '四两拨千斤名师支架 · 题眼穿透 · 中考母题通关';

  if (gradeStr.startsWith('1') || gradeStr.startsWith('2') || gradeStr.startsWith('3')) {
    stageName = '小学低段启蒙';
    stageIcon = '🎈';
    stageDescription = '情境化趣味探险 · 具象比喻 · 保护学习兴趣';
  } else if (gradeStr.startsWith('4') || gradeStr.startsWith('5') || gradeStr.startsWith('6')) {
    stageName = '小学高段探究';
    stageIcon = '📘';
    stageDescription = '思维习惯养成 · 规律自主总结 · 循序渐进';
  }

  return (
    <div className="welcome-dashboard">
      {/* 1. Mentor Greeting Card */}
      <div className="welcome-hero-card">
        <div className="welcome-badge">
          <span className="live-dot"></span>
          <span>专属私教已在案头就绪</span>
        </div>
        <h2 className="welcome-title">
          {studentName}同学，{getGreeting()}！🎓
        </h2>
        <p className="welcome-subtitle">
          当前辅导：<strong className="highlight-tag">{gradeLabel} · {subjectLabel}</strong>（人教版教材同步）
        </p>
        <div className="stage-feature-pill">
          <span>{stageIcon}</span>
          <span>{stageName}：{stageDescription}</span>
        </div>
      </div>

      {/* 2. Quick 1-9 Grade Stage Switcher */}
      <div className="stage-switch-container">
        <div className="stage-switch-label">✨ 1-9年级学段心智模型一键切换：</div>
        <div className="stage-switch-pills">
          <button
            type="button"
            className={`stage-pill ${gradeStr.startsWith('1') || gradeStr.startsWith('2') || gradeStr.startsWith('3') ? 'active' : ''}`}
            onClick={() => { onGradeChange('3_up'); if (!selectedSubject) onSubjectChange('数学'); }}
          >
            🎈 小学低段 (1-3年级)
          </button>
          <button
            type="button"
            className={`stage-pill ${gradeStr.startsWith('4') || gradeStr.startsWith('5') || gradeStr.startsWith('6') ? 'active' : ''}`}
            onClick={() => { onGradeChange('5_up'); if (!selectedSubject) onSubjectChange('数学'); }}
          >
            📘 小学高段 (4-6年级)
          </button>
          <button
            type="button"
            className={`stage-pill ${gradeStr.startsWith('7') || gradeStr.startsWith('8') || gradeStr.startsWith('9') ? 'active' : ''}`}
            onClick={() => { onGradeChange('7_up'); if (!selectedSubject) onSubjectChange('数学'); }}
          >
            📐 初中阶段 (7-9年级)
          </button>
        </div>
      </div>

      {/* 3. Primary Camera Action Card (The absolute core action for homework) */}
      <div className="primary-camera-card" onClick={onCameraClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onCameraClick()}>
        <div className="camera-icon-wrapper">
          <div className="camera-pulse-ring"></div>
          <span className="camera-big-icon">📸</span>
        </div>
        <div className="camera-card-content">
          <div className="camera-card-title">
            <span>拍照讲题 / 上传试卷作业难题</span>
            <span className="rec-badge">名师推荐</span>
          </div>
          <div className="camera-card-desc">
            卡在某一步推导或做不出辅助线？对准题目拍一张，私教一句话点破题眼套路，给草稿纸第一步动笔支架！
          </div>
        </div>
        <div className="camera-card-arrow">
          <span>立即拍照</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
      </div>

      {/* 4. Action Cards Grid */}
      <div className="welcome-action-grid">
        <div className="action-card mist-card" onClick={onReviewMistakes} role="button" tabIndex={0}>
          <div className="action-card-header">
            <span className="action-card-icon">🔔</span>
            <span className="action-card-name">错题靶向突围</span>
          </div>
          <p className="action-card-desc">调出易错知识点，针对性出变式题，当场拿下薄弱点</p>
          <div className="action-card-cta">开始复测 →</div>
        </div>

        <div className="action-card map-card" onClick={onOpenMap} role="button" tabIndex={0}>
          <div className="action-card-header">
            <span className="action-card-icon">🗺️</span>
            <span className="action-card-name">教材章节闯关</span>
          </div>
          <p className="action-card-desc">紧跟校内教材大纲，新知导读与核心概念层层通关</p>
          <div className="action-card-cta">查看地图 →</div>
        </div>

        <div
          className="action-card exam-card"
          onClick={() => onQuickPrompt(`老师，请针对当前【${gradeLabel} · ${subjectLabel}】，为我精讲一个中考/期末高频必考母题模型，一句话点破核心题眼，并出一道微测题考考我！`)}
          role="button"
          tabIndex={0}
        >
          <div className="action-card-header">
            <span className="action-card-icon">💡</span>
            <span className="action-card-name">经典母题点拨</span>
          </div>
          <p className="action-card-desc">精选必考母题模型，掌握解题钥匙，举一反三</p>
          <div className="action-card-cta">攻克母题 →</div>
        </div>
      </div>

      {/* 5. Mastery & Encouragement Footer */}
      <div className="welcome-footer-banner">
        <div className="footer-tip-item">
          <span>🎯</span>
          <span><strong>四两拨千斤原则</strong>：不直接报答案，给草稿纸第一步指引，让学生真正独立学会。</span>
        </div>
        <div className="footer-tip-item">
          <span>🧠</span>
          <span><strong>连续记忆守护</strong>：做错的题目会自动进入艾宾浩斯复习流，直到完全掌握。</span>
        </div>
      </div>
    </div>
  );
}
