import React, { useRef, useState } from 'react';

/**
 * DailyAchievementCardModal
 * 微信级晚间学情成果日报卡 (解决家长监督焦虑，增强家庭教育获得感)
 * 
 * 核心特性：
 * 1. 朋友圈/家庭群高颜值分享海报
 * 2. 今日专注时长、攻克核心母题、费曼讲题星级、特级名师温暖寄语
 * 3. 一键长按保存相册或复制分享文本
 */
export default function DailyAchievementCardModal({
  isOpen,
  onClose,
  studentName = '曾练',
  currentGrade = '7_up',
  studyMinutes = 45,
  masteredCount = 4,
  feynmanStars = 5
}) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef(null);

  if (!isOpen) return null;

  const todayStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  const shareText = `【曾练专属私教 · 今日学情日报】\n` +
    `📅 日期：${todayStr}\n` +
    `👤 学生：${studentName}（初中）\n` +
    `⏱️ 今日深度专注：${studyMinutes} 分钟\n` +
    `🎯 攻克中考重难点：${masteredCount} 道母题\n` +
    `🌟 费曼小老师以教代学：${'⭐'.repeat(feynmanStars)}（逻辑严密认证）\n` +
    `👨‍🏫 名师寄语：“今天在分步演算纸上非常扎实，移项防错与物理光路探究表现亮眼，步步为营，中考必胜！”`;

  const handleCopyText = () => {
    navigator.clipboard?.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '480px',
        maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Card Header Poster */}
        <div ref={cardRef} style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          color: '#ffffff', padding: '28px 24px 20px', borderRadius: '24px 24px 0 0',
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Subtle gold glow behind header */}
          <div style={{
            position: 'absolute', top: '-40px', right: '-40px', width: '140px', height: '140px',
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.3) 0%, transparent 70%)', borderRadius: '50%'
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
              padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, color: '#fef08a'
            }}>
              🌟 曾练专属私教 · 每日学情战报
            </span>
            <span style={{ fontSize: '0.78rem', color: '#c7d2fe' }}>{todayStr}</span>
          </div>

          <h2 style={{ margin: '0 0 6px', fontSize: '1.45rem', fontWeight: 800, color: '#ffffff' }}>
            {studentName}的每日成长印记
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#e0e7ff' }}>
            日积跬步，以至千里 · 每一份专注都在拔节生长
          </div>

          {/* 3 Core Stats Badges */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '20px',
            background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '16px', backdropFilter: 'blur(6px)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fef08a' }}>{studyMinutes}</div>
              <div style={{ fontSize: '0.72rem', color: '#c7d2fe' }}>专注时长 (分)</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.2)' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#86efac' }}>{masteredCount}</div>
              <div style={{ fontSize: '0.72rem', color: '#c7d2fe' }}>攻克母题 (道)</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f472b6' }}>5★</div>
              <div style={{ fontSize: '0.72rem', color: '#c7d2fe' }}>费曼讲题星级</div>
            </div>
          </div>
        </div>

        {/* Card Body Details */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Key Topics Mastered */}
          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
              🎯 今日深度掌握核心考点：
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: '#334155' }}>
              <div>• <b>代数推导</b>：一元一次方程移项变号与 CAS 实时验算认证</div>
              <div>• <b>物理光学</b>：凸透镜成像规律动态光路图（照相机与投影仪模型）</div>
              <div>• <b>费曼内化</b>：成功以小老师身份向虚拟同桌小明讲透核心定理</div>
            </div>
          </div>

          {/* Teacher's Warm Encouragement */}
          <div style={{ background: '#fdf4ff', padding: '14px', borderRadius: '14px', border: '1px solid #f5d0fe' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1.1rem' }}>👨‍🏫</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#86198f' }}>AI 私教特级教师评语：</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#701a75', lineHeight: '1.5' }}>
              “{studentName}今天在演算纸上推导非常踏实，面对易错陷阱能够沉下心自查修正。在费曼小老师环节表达逻辑极其清晰，继续保持这股韧劲，中考必成大器！”
            </p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={handleCopyText}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '12px',
                background: copied ? '#10b981' : 'linear-gradient(135deg, #4338ca, #3730a3)',
                color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <span>{copied ? '✅ 已复制战报文本' : '📋 复制日报分享家庭群'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px', borderRadius: '12px',
                background: '#f1f5f9', color: '#475569', border: 'none',
                fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer'
              }}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
