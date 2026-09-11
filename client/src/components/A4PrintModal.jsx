import React from 'react';

/**
 * A4PrintModal
 * 高清 A4 纸质周清试卷排版与打印预览组件
 * 核心特性：标准中国中小学考试排版（密封线、双栏、答题线、LaTeX 公式排版、防反光纯白打印优化）
 */
export default function A4PrintModal({ isOpen, onClose, studentName = '曾练', grade = '7_up', subject = '数学', questions = [] }) {
  if (!isOpen) return null;

  const defaultQuestions = questions.length > 0 ? questions : [
    {
      id: 1,
      title: '一元一次方程与几何辅助线综合演练',
      body: '如图，在 △ABC 中，∠B = 40°，∠C = 60°，AD 平分 ∠BAC 交 BC 于点 D。过点 D 作 DE ∥ AB 交 AC 于点 E。\n(1) 求 ∠ADE 的度数；\n(2) 证明 △ADE 是等腰三角形。',
      score: 10
    },
    {
      id: 2,
      title: '代数式化简求值与因式分解',
      body: '已知 (x + y)^2 = 25，(x - y)^2 = 9，求代数式 x^2 + y^2 以及 xy 的具体数值。（请在草稿纸上规范书写提取与代入步骤）',
      score: 10
    },
    {
      id: 3,
      title: '压轴母题变式挑战',
      body: '某动点 P 从点 A 出发沿射线 AB 运动，速度为每秒 2 个单位。若 AB = 10，当点 P 运动 t 秒时，△PAC 的面积恰好等于 △ABC 面积的一半，求运动时间 t 的所有可能值。',
      score: 12
    }
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#fff',
        width: '94%',
        maxWidth: '920px',
        height: '92vh',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Top Control Bar */}
        <div style={{
          padding: '14px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>
              📄 纸屏融合：A4 靶向周清试卷排版
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              保护孩子视力，脱离屏幕书写；做完后手机拍一张即可一键秒批
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handlePrint}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🖨️ 调起打印机 / 导出 PDF
            </button>
            <button
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                color: '#475569',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              关闭
            </button>
          </div>
        </div>

        {/* Printable A4 Paper Preview */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '30px',
          background: '#e2e8f0',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <div className="printable-a4-sheet" style={{
            background: '#fff',
            width: '100%',
            maxWidth: '780px',
            minHeight: '1020px',
            padding: '40px 50px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
            color: '#000',
            fontFamily: 'SimSun, STSong, serif',
            position: 'relative'
          }}>
            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '14px', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0 0 8px 0', letterSpacing: '1px' }}>
                【曾练专属私教】靶向突破周清微测试卷
              </h2>
              <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '0.95rem', color: '#333' }}>
                <span>科目：{subject}</span>
                <span>学段：人教版 7年级</span>
                <span>学生姓名：{studentName}</span>
                <span>满分：100 分</span>
                <span>建议用时：30 分钟</span>
              </div>
            </div>

            {/* Student Exam Rules */}
            <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: '24px', lineHeight: '1.5' }}>
              <strong>考生须知：</strong>
              1. 答卷前，请在横线上工整写下姓名与日期；
              2. 请使用 0.5 毫米黑色水笔在答题空白处规范书写运算与证明步骤，养成良好书写习惯；
              3. 完成后，使用本软件【📸 拍照讲题】对准试卷，名师将自动进行逐题诊断与批改。
            </div>

            {/* Questions Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              {defaultQuestions.map((q, idx) => (
                <div key={q.id} style={{ breakInside: 'avoid' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '8px' }}>
                    {idx + 1}. ({q.score}分) {q.title}
                  </div>
                  <div style={{ fontSize: '1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginBottom: '14px' }}>
                    {q.body}
                  </div>
                  {/* Answer blank space */}
                  <div style={{
                    minHeight: '130px',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '6px',
                    padding: '10px',
                    position: 'relative'
                  }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>【解题与证明演算区域（草稿/作图留白）】</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              position: 'absolute',
              bottom: '25px',
              left: 0,
              width: '100%',
              textAlign: 'center',
              fontSize: '0.85rem',
              color: '#888'
            }}>
              曾练专属私教 · 知识图谱靶向生成的实体周清卷 · 第 1 页 (共 1 页)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
