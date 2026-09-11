import React, { useState, useEffect } from 'react';
import { formatGrade, authFetch, getApiUrl } from '../store/useStore';

export default function WelcomeDashboard({
  currentProfile,
  selectedGrade,
  selectedSubject,
  onGradeChange,
  onSubjectChange,
  onCameraClick,
  onReviewMistakes,
  onOpenMap,
  onQuickPrompt,
  onOpenRoadmap,
  onOpenPrint,
  onOpenParentMemo,
  onOpenBatchGrade
}) {
  const [briefing, setBriefing] = useState(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  const studentName = currentProfile?.name || '曾练';
  const gradeLabel = formatGrade(selectedGrade);
  const subjectLabel = selectedSubject || '数学';

  // Fetch daily proactive briefing
  useEffect(() => {
    let isMounted = true;
    async function fetchDailyBriefing() {
      setLoadingBriefing(true);
      try {
        const url = `${getApiUrl()}/api/mentor/daily-briefing?profile_id=${encodeURIComponent(currentProfile?.id || 'default')}&grade=${encodeURIComponent(selectedGrade || '7_up')}&subject=${encodeURIComponent(selectedSubject || '数学')}&student_name=${encodeURIComponent(studentName)}`;
        const res = await authFetch(url);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setBriefing(data);
        }
      } catch (e) {
        console.warn('Failed to load proactive briefing:', e);
      } finally {
        if (isMounted) setLoadingBriefing(false);
      }
    }
    fetchDailyBriefing();
    return () => { isMounted = false; };
  }, [currentProfile?.id, selectedGrade, selectedSubject, studentName]);

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
      {/* 1. Mentor Greeting & Proactive Briefing Hero Card */}
      <div className="welcome-hero-card">
        <div className="welcome-badge">
          <span className="live-dot"></span>
          <span>{briefing ? briefing.greetingHeadline : '专属名师已在案头备课完毕'}</span>
        </div>
        <h2 className="welcome-title">
          {studentName}同学，{getGreeting()}！🎓
        </h2>
        <p className="welcome-subtitle">
          当前辅导：<strong className="highlight-tag">{gradeLabel} · {subjectLabel}</strong>（人教版教材同步）
        </p>

        {/* Proactive Mentor Briefing Memo */}
        {briefing?.suggestedMission && (
          <div className="mentor-briefing-banner" style={{
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(147, 51, 234, 0.1))',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginTop: '14px',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontWeight: '600', color: '#2563eb', fontSize: '0.95rem' }}>
                📋 今日专属突破任务：{briefing.suggestedMission.title}
              </span>
              <span style={{ fontSize: '0.8rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>
                {briefing.dueMistakeCount > 0 ? `待复盘 ${briefing.dueMistakeCount} 题` : '新知识攻坚'}
              </span>
            </div>
            <p style={{ margin: '4px 0 10px 0', fontSize: '0.88rem', color: '#475569', lineHeight: '1.4' }}>
              💡 名师指引：{briefing.suggestedMission.reason}
            </p>
            <button
              type="button"
              className="briefing-action-btn"
              onClick={() => onQuickPrompt(briefing.suggestedMission.query)}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.85rem'
              }}
            >
              🚀 {briefing.suggestedMission.actionLabel} →
            </button>
          </div>
        )}

        <div className="stage-feature-pill" style={{ marginTop: '12px' }}>
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

      {/* 3. Primary Camera Action Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div className="primary-camera-card" onClick={onCameraClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onCameraClick()} style={{ margin: 0 }}>
          <div className="camera-icon-wrapper">
            <div className="camera-pulse-ring"></div>
            <span className="camera-big-icon">📸</span>
          </div>
          <div className="camera-card-content">
            <div className="camera-card-title">
              <span>单题精讲 / 拍照问难题</span>
              <span className="rec-badge">名师启发</span>
            </div>
            <div className="camera-card-desc">
              卡在某一步推导？拍单题，私教一句话点破题眼套路，给草稿纸第一步动笔支架！
            </div>
          </div>
          <div className="camera-card-arrow">
            <span>拍照讲题</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </div>
        </div>

        {onOpenBatchGrade && (
          <div className="primary-camera-card" onClick={onOpenBatchGrade} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenBatchGrade()} style={{ margin: 0, borderColor: 'rgba(56, 189, 248, 0.5)', background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15), rgba(37, 99, 235, 0.08))' }}>
            <div className="camera-icon-wrapper" style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)' }}>
              <div className="camera-pulse-ring" style={{ borderColor: '#38bdf8' }}></div>
              <span className="camera-big-icon">📑</span>
            </div>
            <div className="camera-card-content">
              <div className="camera-card-title">
                <span style={{ color: '#38bdf8' }}>整页作业 / 试卷秒级批改</span>
                <span className="rec-badge" style={{ background: '#0284c7' }}>黑科技</span>
              </div>
              <div className="camera-card-desc">
                晚上作业整页拍一张！自动识别卷面所有手写题、判断对错、错题一键归档错题本。
              </div>
            </div>
            <div className="camera-card-arrow" style={{ color: '#38bdf8' }}>
              <span>整页批改</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
        )}
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

        {/* 6. Macro Roadmap & Paper-Screen Loop Super Cards */}
        {onOpenRoadmap && (
          <div className="action-card" onClick={onOpenRoadmap} role="button" tabIndex={0} style={{ borderColor: 'rgba(56, 189, 248, 0.4)' }}>
            <div className="action-card-header">
              <span className="action-card-icon">🏛️</span>
              <span className="action-card-name" style={{ color: '#38bdf8' }}>长周期战役沙盘</span>
            </div>
            <p className="action-card-desc">全局把控中考/期末提分节奏，锁定阶段里程碑核心分</p>
            <div className="action-card-cta" style={{ color: '#38bdf8' }}>查看看板 →</div>
          </div>
        )}

        {onOpenPrint && (
          <div className="action-card" onClick={onOpenPrint} role="button" tabIndex={0} style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
            <div className="action-card-header">
              <span className="action-card-icon">🖨️</span>
              <span className="action-card-name" style={{ color: '#34d399' }}>A4 纸质试卷打印</span>
            </div>
            <p className="action-card-desc">脱离屏幕保护视力，一键排版高清错题卷，回传秒批</p>
            <div className="action-card-cta" style={{ color: '#34d399' }}>打印试卷 →</div>
          </div>
        )}

        {onOpenParentMemo && (
          <div className="action-card" onClick={onOpenParentMemo} role="button" tabIndex={0} style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
            <div className="action-card-header">
              <span className="action-card-icon">💌</span>
              <span className="action-card-name" style={{ color: '#fbbf24' }}>名师家访便签</span>
            </div>
            <p className="action-card-desc">真动脑时长与考点攻克一目了然，家长放心掌上掌控</p>
            <div className="action-card-cta" style={{ color: '#fbbf24' }}>查看便签 →</div>
          </div>
        )}
      </div>

      {/* 5. Mastery & Encouragement Footer */}
      <div className="welcome-footer-banner">
        <div className="footer-tip-item">
          <span>🎯</span>
          <span><strong>苏格拉底分步启发</strong>：不直接甩全解，单步设问闯关，答对一步再解锁下一步。</span>
        </div>
        <div className="footer-tip-item">
          <span>🔄</span>
          <span><strong>费曼角色互换</strong>：攻克难题后，私教主动请你用一句话把解题玄机讲给老师听！</span>
        </div>
      </div>
    </div>
  );
}
