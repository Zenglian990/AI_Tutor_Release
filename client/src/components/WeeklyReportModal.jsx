import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { preprocessLatex } from '../utils/math';

export default function WeeklyReportModal({ isOpen, onClose, reportLoading, reportData }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', padding: '30px', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'var(--card-bg)', boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>📈 家长监工：本周深度学习报告</h2>
        <div className="md-content" style={{ color: 'var(--text-color)', lineHeight: 1.6 }}>
          {reportLoading ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>⏳ 正在分析过去7天的数据并为您起草报告，请稍候...</div>
            : <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{preprocessLatex(reportData)}</ReactMarkdown>}
        </div>
        <button onClick={onClose} style={{ alignSelf: 'flex-end', padding: '10px 24px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>阅毕关闭</button>
      </div>
    </div>
  );
}
