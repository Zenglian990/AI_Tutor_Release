import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { preprocessLatex } from '../utils/math';

export default function WeeklyReportModal({ isOpen, onClose, reportLoading, reportData }) {
  if (!isOpen) return null;

  const handlePrintNote = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ width: '90%', maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto', padding: '28px', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'var(--card-bg)', boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
            📈 家长监工：本周深度学习报告
          </h2>
          {!reportLoading && reportData && (
            <button
              onClick={handlePrintNote}
              className="no-print"
              style={{
                padding: '6px 14px',
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
              }}
            >
              🖨️ 打印家访便签 (夹作业本)
            </button>
          )}
        </div>

        <div className="md-content" style={{ color: 'var(--text-color)', lineHeight: 1.6 }}>
          {reportLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              ⏳ 正在分析过去7天的数据并为您起草报告，请稍候...
            </div>
          ) : (
            <>
              {/* Printable Parent Handout Note Slip */}
              <div className="only-print" style={{ display: 'none', background: '#fff', color: '#000', padding: '20px', border: '2px solid #000', marginBottom: '20px' }}>
                <div style={{ textAlign: 'center', borderBottom: '1.5px solid #000', paddingBottom: '8px', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>【曾先生智慧私教 / 晚托中心】学员专属家访学情便签</h3>
                  <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>每周学情同步 · 家校协同反馈卡</div>
                </div>
                <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                    {preprocessLatex(reportData)}
                  </ReactMarkdown>
                </div>
                <div style={{ marginTop: '20px', paddingTop: '10px', borderTop: '1px dashed #666', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>辅导教师签名：_______________</span>
                  <span>家长查阅签字：_______________</span>
                  <span>日期：____年__月__日</span>
                </div>
              </div>

              {/* On-Screen Report */}
              <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                {preprocessLatex(reportData)}
              </ReactMarkdown>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} aria-label="关闭周报" style={{ padding: '8px 22px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            阅毕关闭
          </button>
        </div>
      </div>
    </div>
  );
}
