import React, { useRef, useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { useAppStore } from '../store/useStore';

export default function ParentSharePosterModal({ isOpen, onClose }) {
  const { currentProfile } = useAppStore();
  const canvasRef = useRef(null);
  const [template, setTemplate] = useState('primary'); // 'primary' | 'junior'
  const [generating, setGenerating] = useState(false);

  const studentName = currentProfile?.name || '同学';
  const grade = currentProfile?.grade || '7';

  // Automatically draw poster on Canvas
  const drawPoster = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = 540;
    const height = 960;
    canvas.width = width;
    canvas.height = height;

    // 1. Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    if (template === 'primary') {
      bgGrad.addColorStop(0, '#fef3c7'); // warm amber/orange for primary
      bgGrad.addColorStop(0.4, '#fffbeb');
      bgGrad.addColorStop(1, '#fed7aa');
    } else {
      bgGrad.addColorStop(0, '#0f172a'); // deep tech blue for junior high
      bgGrad.addColorStop(0.5, '#1e1b4b');
      bgGrad.addColorStop(1, '#312e81');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Top Header Brand
    ctx.save();
    ctx.fillStyle = template === 'primary' ? '#78350f' : '#38bdf8';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('曾先生智慧私教 · 1-9年级AI深度辅导', width / 2, 55);

    ctx.fillStyle = template === 'primary' ? '#92400e' : '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('国家教材知识图谱 · 苏格拉底启发引导 · 39,114+真题密卷', width / 2, 85);
    ctx.restore();

    // 3. Central Card
    ctx.save();
    ctx.fillStyle = template === 'primary' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(30, 41, 59, 0.9)';
    ctx.roundRect(36, 120, width - 72, 600, 20);
    ctx.fill();
    ctx.strokeStyle = template === 'primary' ? '#f59e0b' : '#6366f1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Card Content
    if (template === 'primary') {
      // Primary template
      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('告别辅导作业“鸡飞狗跳”', width / 2, 180);

      ctx.fillStyle = '#d97706';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('从扳手指到十进制具象积木', width / 2, 220);

      ctx.fillStyle = '#475569';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'left';
      const lines = [
        `🎒 宝贝【${studentName}】今日自主探究打卡`,
        '✨ 动态实物积木 + 苹果糖果均分具象化',
        '⚖️ 物理天平模型，秒懂等式守恒原理',
        '🦁 聪聪小狮子导师，兴趣式趣味闯关激励',
        '📝 电子草稿纸 + 智能消除涂改字迹',
        '🖨️ 一键抹除红墨水笔迹，翻新空白卷重做'
      ];
      lines.forEach((line, idx) => {
        ctx.fillText(line, 66, 280 + idx * 45);
      });

      // Highlight Box
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(66, 560, width - 132, 120);
      ctx.strokeStyle = '#fde68a';
      ctx.strokeRect(66, 560, width - 132, 120);

      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔥 家长好评率 99.2%：孩子主动想学了！', width / 2, 600);
      ctx.fillStyle = '#78350f';
      ctx.font = '14px sans-serif';
      ctx.fillText('纯离线端侧推理兜底 · 无需盯梢 · 培养终身自学习惯', width / 2, 635);
    } else {
      // Junior High template
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('中考压轴动点几何微步破题', width / 2, 180);

      ctx.fillStyle = '#a5b4fc';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('全国 39,114+ 名校真题真卷实战', width / 2, 220);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'left';
      const lines = [
        `🎯 考生【${studentName}】中考全真模考演练`,
        '📐 点P动点轨迹仿真，实时面积函数S(t)计算',
        '📈 二次函数开口/顶点平移可视化交互沙盘',
        '🦉 智多星博士四阶苏格拉底，拒绝死抄答案',
        '🏛️ 北京海淀/湖北黄冈/江苏启东名校密卷直通',
        '📊 中考级步骤分（审题/推导/结论）精细评阅'
      ];
      lines.forEach((line, idx) => {
        ctx.fillText(line, 66, 280 + idx * 45);
      });

      // Highlight Box
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(66, 560, width - 132, 120);
      ctx.strokeStyle = '#4338ca';
      ctx.strokeRect(66, 560, width - 132, 120);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚀 突破压轴题瓶颈 · 冲刺重点高中', width / 2, 600);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText('家庭打印机局域网秒级出卷 · 微信随身学情直连', width / 2, 635);
    }
    ctx.restore();

    // 4. Bottom QR Code & Referral Info
    try {
      const qrDataUrl = await QRCode.toDataURL(window.location.origin, {
        width: 140,
        margin: 1,
        color: {
          dark: template === 'primary' ? '#78350f' : '#0f172a',
          light: '#ffffff'
        }
      });

      const qrImg = new Image();
      qrImg.src = qrDataUrl;
      await new Promise(resolve => { qrImg.onload = resolve; });

      // Draw QR image
      ctx.drawImage(qrImg, 56, 750, 140, 140);

      ctx.save();
      ctx.fillStyle = template === 'primary' ? '#78350f' : '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('微信扫码立即体验', 215, 790);

      ctx.fillStyle = template === 'primary' ? '#92400e' : '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText('送 7 天名校全真模考体验', 215, 825);
      ctx.fillText('全国 1-9 年级教材同步深度辅导', 215, 855);
      ctx.fillText('私教微信：扫码添加曾先生', 215, 885);
      ctx.restore();
    } catch (qrErr) {
      console.warn('QR Code generation failed:', qrErr);
    }
  }, [template, studentName, grade]);

  useEffect(() => {
    if (isOpen) {
      // Small timeout to ensure canvas is attached
      setTimeout(() => {
        drawPoster();
      }, 50);
    }
  }, [isOpen, drawPoster]);

  const handleDownloadPoster = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `曾先生智慧私教_家长推荐海报_${template}.png`;
    link.href = dataUrl;
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '16px', overflow: 'hidden',
        maxWidth: '720px', width: '100%', maxHeight: '94vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{
          background: '#0f172a', color: '#ffffff', padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>📣</span>
            <span style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>
              家长圈营销与获客海报生成器 (搞钱裂变)
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Toolbar */}
        <div style={{
          background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setTemplate('primary')}
              style={{
                padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                border: template === 'primary' ? '2px solid #d97706' : '1px solid #cbd5e1',
                background: template === 'primary' ? '#fef3c7' : '#ffffff',
                color: template === 'primary' ? '#b45309' : '#475569'
              }}
            >
              🎒 低年级启蒙版 (1-3年级)
            </button>
            <button
              onClick={() => setTemplate('junior')}
              style={{
                padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                border: template === 'junior' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                background: template === 'junior' ? '#e0e7ff' : '#ffffff',
                color: template === 'junior' ? '#3730a3' : '#475569'
              }}
            >
              📐 中考压轴冲刺版 (7-9年级)
            </button>
          </div>

          <button
            onClick={handleDownloadPoster}
            style={{
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff', border: 'none', padding: '8px 18px', borderRadius: '8px',
              fontWeight: 'bold', fontSize: '0.88rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>💾 保存高清海报发圈</span>
          </button>
        </div>

        {/* Poster Canvas Preview */}
        <div style={{
          flex: 1, overflowY: 'auto', background: '#334155', display: 'flex',
          justifyContent: 'center', padding: '20px'
        }}>
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '360px', height: 'auto', borderRadius: '12px',
              boxShadow: '0 15px 30px rgba(0,0,0,0.4)', display: 'block'
            }}
          />
        </div>
      </div>
    </div>
  );
}
