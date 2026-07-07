import React, { forwardRef } from 'react';
import { formatGrade } from '../store/useStore';

const ShareCard = forwardRef(({ profileName, activeProfile, stats, recentData, subjectData }, ref) => {
  const profileGradeStr = activeProfile?.grade ? formatGrade(activeProfile.grade) : '通用课本';
  
  const now = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(now.getDate() - 6);
  const dateStr = `${oneWeekAgo.getFullYear()}/${oneWeekAgo.getMonth() + 1}/${oneWeekAgo.getDate()} - ${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

  const activeDays = recentData.filter(d => d.value > 0).length;
  const topSubject = stats?.bySubject && stats.bySubject.length > 0
    ? [...stats.bySubject].sort((a, b) => b.count - a.count)[0]?.subject
    : '无';

  const colors = ['#3b82f6', '#a78bfa', '#38bdf8', '#34d399'];
  const maxVal = Math.max(...(subjectData.map(d => d.value)), 1);

  return (
    <div 
      ref={ref}
      style={{
        width: '600px',
        height: '900px',
        background: 'linear-gradient(to bottom, #1e1b4b, #0f172a, #020617)',
        color: 'white',
        position: 'relative',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        padding: '25px',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {/* Background glowing circles */}
      <div style={{ position: 'absolute', top: '-50px', left: '-100px', width: '400px', height: '400px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', filter: 'blur(40px)' }} />
      <div style={{ position: 'absolute', bottom: '50px', right: '-100px', width: '500px', height: '500px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.08)', filter: 'blur(50px)' }} />
      
      {/* Borders */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', right: '20px', bottom: '20px', border: '2px solid rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '25px', left: '25px', right: '25px', bottom: '25px', border: '1px solid rgba(245,158,11,0.3)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginTop: '35px', position: 'relative', zIndex: 1 }}>
        <h1 style={{ 
          margin: 0, fontSize: '32px', 
          background: 'linear-gradient(to right, #fbbf24, #f59e0b, #d97706)', 
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' 
        }}>曾练 AI 专属私教</h1>
        <h2 style={{ margin: '15px 0 10px', fontSize: '20px', color: '#67e8f9' }}>✨ 伴读成长周报 ✨</h2>
        <div style={{ color: '#94a3b8', fontSize: '14px' }}>{dateStr}</div>
      </div>

      {/* Student Banner */}
      <div style={{ 
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
        borderRadius: '12px', padding: '15px 25px', marginTop: '35px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 1
      }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 'bold' }}>学生档案: {profileName}</div>
          <div style={{ fontSize: '16px', color: '#cbd5e1', marginTop: '8px' }}>年级学段: {profileGradeStr}</div>
        </div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#a78bfa' }}>
          已开启全科智能辅导 ⚔️
        </div>
      </div>

      {/* Stat Boxes */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '25px', position: 'relative', zIndex: 1 }}>
        {[
          { label: '错题归纳总数', value: stats?.total || 0, sub: '道薄弱点收录', color: '#3bf6', rgb: '59,130,246' },
          { label: '本周活跃探索', value: activeDays, sub: '天深度交互', color: '#10b981', rgb: '16,185,129' },
          { label: '本周主攻科目', value: topSubject, sub: '重点关切方向', color: '#8b5cf6', rgb: '139,92,246' }
        ].map((s, i) => (
          <div key={i} style={{ 
            width: '150px', background: `rgba(${s.rgb}, 0.15)`, border: `1px solid rgba(${s.rgb}, 0.3)`,
            borderRadius: '8px', padding: '20px 0', textAlign: 'center'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '14px' }}>{s.label}</div>
            <div style={{ color: `rgb(${s.rgb})`, fontSize: '36px', fontWeight: 'bold', margin: '15px 0' }}>{s.value}</div>
            <div style={{ color: '#cbd5e1', fontSize: '12px' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ marginTop: '40px', position: 'relative', zIndex: 1 }}>
        <h3 style={{ fontSize: '18px', margin: '0 0 20px 10px' }}>📊 薄弱学科分布分析</h3>
        {subjectData.slice(0, 4).map((d, i) => {
          const fillPct = (d.value / maxVal) * 100;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ width: '80px', textAlign: 'right', marginRight: '20px', color: '#cbd5e1', fontSize: '14px' }}>{d.label}</div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '20px', position: 'relative' }}>
                <div style={{ 
                  width: `${fillPct}%`, height: '100%', borderRadius: '4px',
                  background: `linear-gradient(to right, ${colors[i % colors.length]}, ${colors[i % colors.length]}77)`
                }} />
                <div style={{ position: 'absolute', top: '0', bottom: '0', left: `calc(${fillPct}% + 10px)`, display: 'flex', alignItems: 'center', color: '#f8fafc', fontSize: '12px', fontWeight: 'bold' }}>
                  {d.value}道错题
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Encouragement */}
      <div style={{ 
        background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)',
        borderRadius: '12px', padding: '25px', marginTop: '40px', position: 'relative', zIndex: 1
      }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#fbbf24', fontSize: '18px' }}>🏆 本周获得荣誉：勤学深思勋章 (Active Thinker)</h3>
        <p style={{ color: '#e2e8f0', fontSize: '14px', fontStyle: 'italic', lineHeight: '1.6', margin: 0 }}>
          「学而时习之，不亦说乎。」曾小侠/小主本周在AI私教老师的引导下，<br/>
          能够积极面对疑惑，探究错题背后的核心逻辑与易错点。<br/>
          苏格拉底式的循循诱导正在帮助孩子养成自主思考的好习惯！<br/>
          曾先生，让我们继续陪伴孩子在快乐与思辨中一起成长！🚀
        </p>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '40px', left: '0', right: '0', textAlign: 'center', zIndex: 1 }}>
        <div style={{ color: '#4b5563', fontSize: '12px', marginBottom: '8px' }}>—— 由 曾练专属私教 APP 智能成长引擎技术生成 ——</div>
        <div style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 'bold' }}>长按图片保存或分享给家人，见证孩子的每一次成长点滴 🌱</div>
      </div>
    </div>
  );
});

export default ShareCard;
