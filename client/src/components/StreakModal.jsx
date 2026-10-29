import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useStore';

export default function StreakModal({ isOpen, onClose }) {
  const { currentProfile, authFetch } = useAppStore();
  const [streakData, setStreakData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);

  const fetchStreak = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`/api/gamification/streak?profile_id=${currentProfile?.id || 'default'}`);
      if (res.ok) {
        const json = await res.json();
        setStreakData(json.streak);
      }
    } catch (e) {
      console.error('Failed to load streak info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStreak();
      setClaimSuccess(false);
    }
  }, [isOpen, currentProfile?.id]);

  const handleClaimFreeze = async () => {
    try {
      setClaiming(true);
      const res = await authFetch('/api/gamification/claim-freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: currentProfile?.id || 'default' })
      });
      if (res.ok) {
        const json = await res.json();
        setStreakData(prev => prev ? { ...prev, streakFreezeCount: json.streakFreezeCount } : prev);
        setClaimSuccess(true);
        setTimeout(() => setClaimSuccess(false), 3000);
      }
    } catch (e) {
      console.error('Claim freeze error:', e);
    } finally {
      setClaiming(false);
    }
  };

  if (!isOpen) return null;

  const currentStreak = streakData?.currentStreak || 0;
  const longestStreak = streakData?.longestStreak || 0;
  const freezeCount = streakData?.streakFreezeCount ?? 2;
  const isTodayDone = streakData?.isTodayCompleted || false;
  const peer = streakData?.peerIntimacy || { level: 1, title: '初识小同桌', currentXp: 0, progressPercent: 0, perk: '好奇反问与基础辅导' };

  // Calculate 7-day view
  const daysOfWeek = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const todayIdx = (new Date().getDay() + 6) % 7; // 0=Mon, 6=Sun

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="modal-content streak-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          width: '90%',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '20px',
          padding: '24px',
          border: '1px solid rgba(251, 146, 60, 0.3)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(249, 115, 22, 0.15)',
          color: '#f8fafc',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '32px', filter: 'drop-shadow(0 0 10px rgba(249, 115, 22, 0.6))' }}>🔥</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#ffedd5' }}>
                连续学习连胜榜
              </h2>
              <span style={{ fontSize: '12px', color: '#fdba74' }}>
                多邻国式行为自驱 · 每天 1 题守护连胜
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Streak Big Number */}
        <div style={{
          textAlign: 'center',
          padding: '20px 10px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '16px',
          border: '1px solid rgba(251, 146, 60, 0.2)',
          marginBottom: '20px'
        }}>
          <div style={{ fontSize: '56px', fontWeight: '900', color: '#fb923c', lineHeight: 1, textShadow: '0 0 20px rgba(249, 115, 22, 0.4)' }}>
            {currentStreak}
            <span style={{ fontSize: '20px', marginLeft: '6px', color: '#fdba74' }}>天</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: isTodayDone ? '#4ade80' : '#fbbf24', fontWeight: 'bold' }}>
            {isTodayDone ? '✨ 今日学习打卡已完成，连胜燃烧中！' : '⚡ 今天还没完成提问或做题，快来守护连胜！'}
          </p>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            历史最高记录：{longestStreak} 天
          </div>
        </div>

        {/* 7-Day Visual Mini Calendar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '22px' }}>
          {daysOfWeek.map((day, idx) => {
            const isToday = idx === todayIdx;
            const isCompleted = isToday ? isTodayDone : (idx < todayIdx);
            return (
              <div 
                key={day}
                style={{
                  flex: 1,
                  padding: '8px 2px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  background: isCompleted 
                    ? 'linear-gradient(180deg, rgba(249, 115, 22, 0.3) 0%, rgba(234, 88, 12, 0.1) 100%)' 
                    : 'rgba(255, 255, 255, 0.04)',
                  border: isToday ? '1px solid #fb923c' : '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{day}</div>
                <div style={{ fontSize: '16px' }}>{isCompleted ? '🔥' : '⚪'}</div>
              </div>
            );
          })}
        </div>

        {/* Streak Freeze Shield (Loss Aversion Protection) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.05) 100%)',
          borderRadius: '14px',
          padding: '14px 16px',
          border: '1px solid rgba(96, 165, 250, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>🛡️</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#93c5fd' }}>
                连胜冰冻卡（保护罩）
              </div>
              <div style={{ fontSize: '12px', color: '#bfdbfe' }}>
                断卡或生病时自动抵扣，连胜不归零（剩余: {freezeCount} 张）
              </div>
            </div>
          </div>
          <button
            onClick={handleClaimFreeze}
            disabled={claiming || freezeCount >= 5}
            style={{
              background: freezeCount >= 5 ? 'rgba(255, 255, 255, 0.1)' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: freezeCount >= 5 ? 'not-allowed' : 'pointer'
            }}
          >
            {claimSuccess ? '已领取 ✓' : (freezeCount >= 5 ? '已满额' : '+补充')}
          </button>
        </div>

        {/* Virtual Peer Student Intimacy (同桌小明羁绊) */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '14px',
          padding: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>🧑‍🤝‍🧑</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
                同桌小明羁绊：{peer.title}
              </span>
            </div>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'rgba(234, 179, 8, 0.2)',
              color: '#facc15',
              fontWeight: 'bold'
            }}>
              Lv.{peer.level}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
            当前默契特权：{peer.perk}
          </div>

          {/* Progress Bar */}
          <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${peer.progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)',
              borderRadius: '4px',
              transition: 'width 0.4s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
            <span>当前经验：{peer.currentXp} XP</span>
            <span>下一阶段：{peer.nextLevelXp} XP</span>
          </div>
        </div>

      </div>
    </div>
  );
}
