import { useState, useEffect, useRef } from 'react';
import { authFetch, formatGrade, useAppStore } from '../store/useStore';
import CanvasBarChart from './CanvasBarChart';
import ShareCard from './ShareCard';
import html2canvas from 'html2canvas';
import { saveOrShareImage } from '../utils/nativeShare';

export default function StatsDashboard({ currentProfileId, profiles, onClose }) {
  const [stats, setStats] = useState(null);
  const [shareImageUrl, setShareImageUrl] = useState(null);
  const profileName = profiles?.find(p => p.id === currentProfileId)?.name || '未知用户';
  const { settings } = useAppStore();
  const parentName = settings?.parentName || '家长';

  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setError(null);
    authFetch(`/api/stats?profile_id=${currentProfileId}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load stats');
        return r.json();
      })
      .then(data => {
        if (isMounted) setStats(data);
      })
      .catch(e => {
        if (isMounted) setError(e.message);
      });
    return () => { isMounted = false; };
  }, [currentProfileId, retryCount]);

  const subjectData = stats?.bySubject?.map(s => ({ label: s.subject, value: s.count })) || [];

  const recentData = (() => {
    if (!stats) return [];
    const days = [];
    // 严格按北京时间 (UTC+8) 构造近 7 天日期键，彻底消除凌晨 00:00-07:59 跨日错位与今日柱消失
    const bjNowMs = Date.now() + 8 * 60 * 60 * 1000;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(bjNowMs - i * 24 * 60 * 60 * 1000);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
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
          parentName={parentName}
          activeProfile={profiles?.find(p => p.id === currentProfileId)}
          stats={stats}
          recentData={recentData}
          subjectData={subjectData}
        />
      </div>
      <div className="mistake-modal theme-adaptive-modal" style={{ padding: 'clamp(14px, 3vw, 24px)', background: 'var(--bg-secondary, #1e293b)', color: 'var(--text-primary, #f8fafc)', maxWidth: '640px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '8px', flexWrap: 'wrap' }}>
          <h2 style={{ color: 'var(--accent-color, #60a5fa)', margin: 0, fontSize: 'clamp(1.05rem, 3.8vw, 1.35rem)' }}>📊 {profileName} 的学习报表</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            {stats && !error && (
              <button
                onClick={handleGenerateShareCard}
                className="mistake-btn"
                style={{ borderColor: '#f59e0b', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '6px 10px' }}
              >
                📢 伴读周报图
              </button>
            )}
            <button onClick={onClose} aria-label="关闭数据看板" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #94a3b8)', cursor: 'pointer', fontSize: '20px', padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        {error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
            <div>无法加载报表数据: {error}</div>
            <button onClick={() => setRetryCount(c => c + 1)} style={{ marginTop: '15px', padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>重试</button>
          </div>
        ) : !stats ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary, #94a3b8)' }}>加载中...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div style={{ background: 'rgba(59,130,246,0.12)', padding: '14px 8px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.25)', textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(1.5rem, 5vw, 2.2rem)', fontWeight: 'bold', color: '#3b82f6', lineHeight: 1.1 }}>{stats.total || 0}</div>
                <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '12px', marginTop: '4px' }}>累计收录错题</div>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.12)', padding: '14px 8px', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.25)', textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(1.5rem, 5vw, 2.2rem)', fontWeight: 'bold', color: '#f59e0b', lineHeight: 1.1 }}>{stats.reviewedCount || 0}</div>
                <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '12px', marginTop: '4px' }}>已复盘巩固</div>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.12)', padding: '14px 8px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.25)', textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(1.5rem, 5vw, 2.2rem)', fontWeight: 'bold', color: '#10b981', lineHeight: 1.1 }}>{stats.masteredCount || 0}</div>
                <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '12px', marginTop: '4px' }}>已彻底消灭</div>
              </div>
            </div>
            <div style={{ background: 'var(--card-bg, rgba(255,255,255,0.04))', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '16px', letterSpacing: '0.04em' }}>各科薄弱点分布</h3>
              {subjectData.length === 0
                ? <div style={{ color: 'var(--text-secondary, #64748b)', textAlign: 'center', padding: '20px 0' }}>暂无学科数据</div>
                : <CanvasBarChart data={subjectData} height={Math.max(subjectData.length * 46 + 16, 100)} horizontal={true} />
              }
            </div>
            <div style={{ background: 'var(--card-bg, rgba(255,255,255,0.04))', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '16px', letterSpacing: '0.04em' }}>近 7 天错题攻坚趋势（北京时间）</h3>
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
              <button
                type="button"
                onClick={() => {
                  saveOrShareImage({
                    dataUrl: shareImageUrl,
                    filename: `${profileName}_AI私教周报.png`,
                    title: `${profileName}的伴读周报`,
                    text: `${profileName}的最新AI私教学习报表，请查收！`
                  });
                }}
                style={{ padding: '8px 20px', borderRadius: '8px', background: '#3b82f6', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                📲 保存相册 / 分享
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
