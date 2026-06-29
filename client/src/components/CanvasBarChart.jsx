import { useRef, useEffect } from 'react';

export default function CanvasBarChart({ data, height = 200, horizontal = false }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const maxVal = Math.max(...data.map(d => d.value), 1);
    const COLORS = ['#3b82f6', '#a78bfa', '#38bdf8', '#34d399', '#f59e0b', '#f87171', '#fb923c', '#e879f9', '#4ade80'];

    if (!horizontal) {
      const padTop = 28, padBottom = 36, padLeft = 12, padRight = 12;
      const chartW = W - padLeft - padRight;
      const chartH = H - padTop - padBottom;
      const barW = Math.min((chartW / data.length) * 0.55, 48);
      const step = chartW / data.length;

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      [0.25, 0.5, 0.75, 1].forEach(t => {
        const y = padTop + chartH * (1 - t);
        ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(W - padRight, y); ctx.stroke();
      });

      data.forEach((d, i) => {
        const barH = Math.max((d.value / maxVal) * chartH, d.value > 0 ? 4 : 0);
        const x = padLeft + i * step + (step - barW) / 2;
        const y = padTop + chartH - barH;
        const color = COLORS[i % COLORS.length];

        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '55');
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
        else ctx.rect(x, y, barW, barH);
        ctx.fill();

        if (d.value > 0) {
          ctx.fillStyle = '#f8fafc';
          ctx.font = `bold 12px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(d.value, x + barW / 2, y - 6);
        }

        ctx.fillStyle = '#94a3b8';
        ctx.font = `11px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(d.label, x + barW / 2, H - padBottom + 16);
      });
    } else {
      const padTop = 8, padBottom = 8, padLeft = 48, padRight = 48;
      const chartW = W - padLeft - padRight;
      const chartH = H - padTop - padBottom;
      const barH = Math.min((chartH / data.length) * 0.6, 28);
      const step = chartH / data.length;

      data.forEach((d, i) => {
        const barW = Math.max((d.value / maxVal) * chartW, d.value > 0 ? 4 : 0);
        const y = padTop + i * step + (step - barH) / 2;
        const color = COLORS[i % COLORS.length];

        const grad = ctx.createLinearGradient(0, 0, barW, 0);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '55');
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(padLeft, y, barW, barH, [0, 4, 4, 0]);
        else ctx.rect(padLeft, y, barW, barH);
        ctx.fill();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = `12px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const labelText = d.label.length > 3 ? d.label.slice(0, 3) + '..' : d.label;
        ctx.fillText(labelText, padLeft - 8, y + barH / 2);

        ctx.fillStyle = '#f8fafc';
        ctx.font = `bold 12px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(`${d.value}题`, padLeft + barW + 6, y + barH / 2);
      });
    }
  }, [data, height, horizontal]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
