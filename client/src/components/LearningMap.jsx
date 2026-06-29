import React, { useState, useEffect } from 'react';

export default function LearningMap({ currentGrade, currentSubject, currentEdition, onSelectChapter, onClose, authFetch }) {
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unlockAll, setUnlockAll] = useState(false);

  // Parse a readable grade name
  const getGradeName = (grade) => {
    const maps = {
      '1_up': '一年级上册', '1_down': '一年级下册',
      '2_up': '二年级上册', '2_down': '二年级下册',
      '3_up': '三年级上册', '3_down': '三年级下册',
      '4_up': '四年级上册', '4_down': '四年级下册',
      '5_up': '五年级上册', '5_down': '五年级下册',
      '6_up': '六年级上册', '6_down': '六年级下册',
      '7_up': '七年级/初一上册', '7_down': '七年级/初一下册',
      '8_up': '八年级/初二上册', '8_down': '八年级/初二下册',
      '9_up': '九年级/初三上册', '9_down': '九年级/初三下册',
    };
    return maps[grade] || '通用课本';
  };

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/chapters?grade=${currentGrade}&subject=${currentSubject}&edition=${currentEdition || ''}`)
      .then(res => res.json())
      .then(data => {
        setChapters(data.chapters || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching chapters:", err);
        setLoading(false);
      });
  }, [currentGrade, currentSubject, currentEdition]);

  return (
    <div className="learning-map-overlay">
      <div className="learning-map-container glass-panel animate-fade-in">
        <div className="learning-map-header">
          <div className="header-info">
            <span className="map-badge">闯关式地图</span>
            <h2>{getGradeName(currentGrade)} · {currentSubject}</h2>
            <p className="subtitle">曾小侠/小主，点击对应章节小岛开始今日探索吧！🛡️✨</p>
          </div>
          <div className="header-actions">
            <button className={`unlock-all-btn ${unlockAll ? 'active' : ''}`} onClick={() => setUnlockAll(!unlockAll)} title="自由探索模式">
              {unlockAll ? '🔓 自由探索已开' : '🔒 开启自由探索'}
            </button>
            <button className="close-map-btn" onClick={onClose} title="关闭地图">✕</button>
          </div>
        </div>

        {loading ? (
          <div className="map-loading">
            <div className="spinner"></div>
            <p>正在拉取章节星空地图...</p>
          </div>
        ) : chapters.length === 0 ? (
          <div className="map-empty">
            <span className="empty-icon">🌌</span>
            <h3>暂无章节地图</h3>
            <p>此年级和科目暂未配置章节关卡，快切换到【三年级上册数学】或【初一上册数学】来挑战吧！</p>
          </div>
        ) : (
          <div className="map-road-wrapper">
            <div className="map-road">
              <svg className="road-path-svg" xmlns="http://www.w3.org/2000/svg">
                {/* Visual connecting line between nodes */}
                <path 
                  d={chapters.length > 1 ? `M 100 120 ${chapters.map((_, idx) => `Q ${idx % 2 === 0 ? '180' : '40'} ${120 + idx * 160 + 80}, ${idx % 2 === 0 ? '250' : '80'} ${120 + (idx + 1) * 160}`).slice(0, chapters.length - 1).join(' ')}` : ''}
                  fill="none" 
                  stroke="rgba(255, 255, 255, 0.15)" 
                  strokeWidth="6" 
                  strokeDasharray="10, 8"
                />
              </svg>

              {chapters.map((chapter, index) => {
                // Alternating side layout for zig-zag boardgame map effect
                const isLeft = index % 2 === 0;
                
                // Unlock logic: First chapter always unlocked. 
                // Or if it's already started/completed.
                // Or if the previous chapter is completed.
                const prevChapter = index > 0 ? chapters[index - 1] : null;
                const isUnlocked = unlockAll || index === 0 || chapter.status !== 'not_started' || (prevChapter && prevChapter.status === 'completed');
                const isCompleted = chapter.status === 'completed';
                const isInProgress = chapter.status === 'in_progress';

                return (
                  <div 
                    key={chapter.id} 
                    className={`map-node-container ${isLeft ? 'node-left' : 'node-right'} ${isUnlocked ? 'unlocked animate-float' : 'locked'}`}
                    style={{ 
                      top: `${index * 160}px`,
                      animationDelay: `${index * 0.2}s`
                    }}
                  >
                    <div 
                      className={`map-island-card glass-panel ${isCompleted ? 'completed' : ''}`}
                      onClick={() => isUnlocked && onSelectChapter(chapter)}
                    >
                      {isCompleted && <div className="island-badge-completed">✅</div>}
                      <div className="island-header">
                        <span className="island-step">第 {index + 1} 关</span>
                        <span className="island-difficulty">{chapter.difficulty}</span>
                      </div>
                      
                      <div className="island-body">
                        <h4 className="island-title">{chapter.name}</h4>
                        <p className="island-desc">{chapter.description}</p>
                      </div>

                      <div className="island-footer">
                        {isUnlocked ? (
                          <div className="island-progress-bar">
                            <span className="island-action-btn">
                              {isCompleted ? '再次探索 🔄' : isInProgress ? `继续探索 (${chapter.progress_pct}%) ⚔️` : '开始探索 ⚔️'}
                            </span>
                            {isInProgress && (
                              <div className="progress-track">
                                <div className="progress-fill" style={{width: `${chapter.progress_pct}%`}}></div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="island-locked-text">🔒 通关上一层解锁</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Extra spacing at the end of the road */}
              <div style={{ height: `${chapters.length * 160 + 80}px` }}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
