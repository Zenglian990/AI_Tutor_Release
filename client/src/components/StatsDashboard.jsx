import { useState, useEffect } from 'react';
import { authFetch, formatGrade } from '../store/useStore';
import CanvasBarChart from './CanvasBarChart';

export default function StatsDashboard({ currentProfileId, profiles, onClose }) {
  const [stats, setStats] = useState(null);
  const [shareImageUrl, setShareImageUrl] = useState(null);
  const profileName = profiles.find(p => p.id === currentProfileId)?.name || '未知用户';

  useEffect(() => {
    authFetch(`/api/stats?profile_id=${currentProfileId}`)
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(e => console.error(e));
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

  const handleGenerateShareCard = () => {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 2;
    canvas.width = 600 * dpr;
    canvas.height = 900 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 900);
    bgGrad.addColorStop(0, '#1e1b4b');
    bgGrad.addColorStop(0.5, '#0f172a');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 600, 900);

    // Glowing circles
    ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
    ctx.beginPath(); ctx.arc(100, 150, 200, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.beginPath(); ctx.arc(500, 600, 250, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 560, 860);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(25, 25, 550, 850);

    // Title
    ctx.textAlign = 'center';
    const titleGrad = ctx.createLinearGradient(150, 60, 450, 60);
    titleGrad.addColorStop(0, '#fbbf24');
    titleGrad.addColorStop(0.5, '#f59e0b');
    titleGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = titleGrad;
    ctx.font = 'bold 32px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('曾 练 AI 专 属 私 教', 300, 60);

    ctx.fillStyle = '#67e8f9';
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('✨ 伴 读 成 长 周 报 ✨', 300, 105);

    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 6);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${oneWeekAgo.getFullYear()}/${oneWeekAgo.getMonth() + 1}/${oneWeekAgo.getDate()} - ${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`, 300, 140);

    // Student banner
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(50, 175, 500, 75, 12);
    else ctx.rect(50, 175, 500, 75);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`学生档案: ${profileName}`, 75, 187);

    const activeProfile = profiles.find(p => p.id === currentProfileId);
    const profileGradeStr = activeProfile?.grade ? formatGrade(activeProfile.grade) : '通用课本';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '16px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`年级学段: ${profileGradeStr}`, 75, 217);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('已开启全科智能辅导 ⚔️', 525, 200);

    // Stats boxes
    ctx.textAlign = 'center';
    const boxY = 275;
    const boxW = 150;
    const boxH = 110;

    const activeDays = recentData.filter(d => d.value > 0).length;
    const topSubject = stats?.bySubject && stats.bySubject.length > 0
      ? [...stats.bySubject].sort((a, b) => b.count - a.count)[0]?.subject
      : '无';

    const drawStatBox = (x, y, w, h, label, value, sublabel, accentColor, bgRgba) => {
      ctx.fillStyle = bgRgba;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
      else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.strokeStyle = `rgba(${accentColor}, 0.3)`;
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(label, x + w / 2, y + 20);
      ctx.fillStyle = `rgb(${accentColor})`;
      ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(String(value), x + w / 2, y + 50);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(sublabel, x + w / 2, y + 90);
    };

    drawStatBox(50, boxY, boxW, boxH, '错题归纳总数', stats?.total || 0, '道薄弱点收录', '59, 130, 246', 'rgba(59, 130, 246, 0.15)');
    drawStatBox(225, boxY, boxW, boxH, '本周活跃探索', activeDays, '天深度交互', '16, 185, 129', 'rgba(16, 185, 129, 0.15)');
    drawStatBox(400, boxY, boxW, boxH, '本周主攻科目', topSubject, '重点关切方向', '139, 92, 246', 'rgba(139, 92, 246, 0.15)');

    // Subject chart
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('📊 薄弱学科分布分析', 60, 425);

    const chartY = 460;
    if (subjectData.length > 0) {
      const maxVal = Math.max(...subjectData.map(d => d.value), 1);
      subjectData.forEach((d, idx) => {
        if (idx > 3) return;
        const currentY = chartY + idx * 32;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '14px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(d.label, 130, currentY + 14);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(150, currentY, 300, 20, 4);
        else ctx.rect(150, currentY, 300, 20);
        ctx.fill();
        const fillW = (d.value / maxVal) * 300;
        const colors = ['#3b82f6', '#a78bfa', '#38bdf8', '#34d399'];
        const barGrad = ctx.createLinearGradient(150, 0, 150 + fillW, 0);
        barGrad.addColorStop(0, colors[idx % colors.length]);
        barGrad.addColorStop(1, colors[idx % colors.length] + '77');
        ctx.fillStyle = barGrad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(150, currentY, fillW, 20, 4);
        else ctx.rect(150, currentY, fillW, 20);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(`${d.value}道错题`, 160 + fillW, currentY + 14);
      });
    }

    // Encouragement
    ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(50, 615, 500, 155, 12);
    else ctx.rect(50, 615, 500, 155);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('🏆 本周获得荣誉：勤学深思勋章 (Active Thinker)', 75, 642);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'italic 14px "Segoe UI", system-ui, sans-serif';
    [
      '「学而时习之，不亦说乎。」曾小侠/小主本周在AI私教老师的引导下，',
      '能够积极面对疑惑，探究错题背后的核心逻辑与易错点。',
      '苏格拉底式的循循诱导正在帮助孩子养成自主思考的好习惯！',
      '曾先生，让我们继续陪伴孩子在快乐与思辨中一起成长！🚀'
    ].forEach((line, i) => {
      ctx.fillText(line, 75, 680 + i * 22);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4b5563';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('—— 由 曾练专属私教 APP 智能成长引擎技术生成 ——', 300, 800);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('长按图片保存或分享给家人，见证孩子的每一次成长点滴 🌱', 300, 840);

    setShareImageUrl(canvas.toDataURL('image/png'));
  };

  return (
    <div className="mistake-overlay">
      <div className="mistake-modal" style={{ padding: '24px', background: '#1e293b', color: 'white', maxWidth: '640px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: '#60a5fa' }}>📊 {profileName} 的学习报表</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {stats && (
              <button
                onClick={handleGenerateShareCard}
                className="mistake-btn"
                style={{ borderColor: '#f59e0b', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                📢 生成微信伴读周报
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}>×</button>
          </div>
        </div>

        {!stats ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>加载数据中...</div> : (
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
