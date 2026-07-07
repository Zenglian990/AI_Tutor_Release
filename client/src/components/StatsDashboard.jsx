import { useState, useEffect, useRef } from 'react';
import { authFetch, formatGrade } from '../store/useStore';
import CanvasBarChart from './CanvasBarChart';
import ShareCard from './ShareCard';
import html2canvas from 'html2canvas';

export default function StatsDashboard({ currentProfileId, profiles, onClose }) {
  const [stats, setStats] = useState(null);
  const [shareImageUrl, setShareImageUrl] = useState(null);
  const profileName = profiles.find(p => p.id === currentProfileId)?.name || '未知用户';

  const [error, setError] = useState(null);

  useEffect(() => {
    authFetch(`/api/stats?profile_id=${currentProfileId}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load stats');
        return r.json();
      })
      .then(data => setStats(data))
      .catch(e => setError(e.message));
  }, [currentProfileId]);

  const subjectData = stats?.bySubject?.map(s => ({ label: s.subject, value: s.count })) || [];

  const recentData = (() => {
    if (!stats) return [];
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      const found = stats.recent?.find(r => r.date === key);
      days.push({ label, value: found ? found.count : 0 });
    }
    return days;
  })();

  const shareCardRef = useRef(null);

  const handleGenerateShareCard = async () => {
    if (!shareCardRef.current) return;
    try {
      const canvas = await html2canvas(shareCardRef.current, { scale: 2 });
      setShareImageUrl(canvas.toDataURL('image/png'));
    } catch (err) {
      console.error('Failed to generate share card', err);
    }
  };

  return (
    <div className="mistake-overlay">
      {/* Hidden ShareCard for html2canvas */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <ShareCard 
          ref={shareCardRef} 
          profileName={profileName} 
          activeProfile={profiles.find(p => p.id === currentProfileId)}
          stats={stats}
          recentData={recentData}
          subjectData={subjectData}
        />
      </div>
      <div className="mistake-modal" style={{ padding: '24px', background: '#1e293b', color: 'white', maxWidth: '640px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: '#60a5fa' }}>📊 {profileName} 的学习报表</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {stats && !error && (
              <button
                onClick={handleGenerateShareCard}
                className="mistake-btn"
                style={{ borderColor: '#f59e0b', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                📢 生成微信伴读周报
              </button>
            )}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px' }}>✕</button>
          </div>
        </div>

        {error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
            <div>无法加载报表数据: {error}</div>
            <button onClick={() => { setError(null); setStats(null); }} style={{ marginTop: '15px', padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>重试</button>
          </div>
        ) : !stats ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>加载中...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ background: 'rgba(59,130,246,0.1)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: '42px', fontWeight: 'bold', color: '#60a5fa', lineHeight: 1.1 }}>{stats.total}</div>
              <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>累计收录错题</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>各科薄弱点分布</h3>
              {subjectData.length === 0
                ? <div style={{ color: '#64748b', textAlign: 'center', padding: '20px 0' }}>暂无学科数据</div>
                : <CanvasBarChart data={subjectData} height={Math.max(subjectData.length * 46 + 16, 100)} horizontal={true} />
              }
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>近 7 天学习活跃度</h3>
              <CanvasBarChart data={recentData} height={180} horizontal={false} />
            </div>
          </div>
        )}
      </div>

      {shareImageUrl && (
        <div className="mistake-overlay" style={{ zIndex: 1100 }}>
          <div className="glass-panel" style={{ padding: '20px', background: '#0f172a', maxWidth: '480px', width: '90%', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <h3 style={{ color: '#fbbf24', marginBottom: '12px' }}>🏆 伴读周报卡片已生成</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>手机端可【长按图片】保存至相册，分享到微信群或朋友圈；电脑端可直接点击下方下载按钮。</p>
            <div style={{ maxHeight: '55vh', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
              <img src={shareImageUrl} alt="伴读周报" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={() => setShareImageUrl(null)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'white', cursor: 'pointer' }}>关闭</button>
              <a href={shareImageUrl} download={`${profileName}_AI私教周报.png`} style={{ padding: '8px 20px', borderRadius: '8px', background: '#3b82f6', color: 'white', textDecoration: 'none', fontWeight: 'bold', cursor: 'pointer' }}>💾 下载图片</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
