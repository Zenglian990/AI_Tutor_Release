import React, { useRef, useState } from 'react';

function getStageLabel(gradeCode) {
  const num = parseInt(String(gradeCode || '7').replace(/\D/g, ''), 10) || 7;
  if (num <= 6) return { stage: '小学', examTarget: '夯实基础' };
  if (num <= 9) return { stage: '初中', examTarget: '中考进阶' };
  return { stage: '高中', examTarget: '高考冲刺' };
}

/**
 * DailyAchievementCardModal
 * 微信级晚间学情成果日报卡（严格基于真实学习数据，杜绝硬编码假战报）
 */
export default function DailyAchievementCardModal({
  isOpen,
  onClose,
  studentName = '同学',
  currentGrade = '7_up',
  subject = '数学',
  studyMinutes = 0,
  masteredCount = 0,
  feynmanStars = 0,
  recentTopics = []
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

  const { stage, examTarget } = getStageLabel(currentGrade);
  const hasRealStudy = studyMinutes > 0 || masteredCount > 0 || feynmanStars > 0;
  const safeStars = Math.max(0, Math.min(5, Number(feynmanStars) || 0));

  const shareText = hasRealStudy
    ? `【AI 专属私教 · 今日真实学情日报】\n` +
      `📅 日期：${todayStr}\n` +
      `👤 学生：${studentName}（${stage} · ${subject}）\n` +
      `⏱️ 今日真实专注：${studyMinutes} 分钟\n` +
      `🎯 互动攻克题目：${masteredCount} 轮/道\n` +
      `🌟 费曼讲题认证：${safeStars > 0 ? '⭐'.repeat(safeStars) : '今日待挑战'}\n` +
      `👨‍🏫 伴学寄语：“保持每日稳步推导与错题复盘，${examTarget}，稳扎稳打！”`
    : `【AI 专属私教 · 今日学情日报】\n📅 日期：${todayStr}\n👤 学生：${studentName}（${stage}）\n今日暂未产生有效学习记录，完成 1 次名师答疑、口算或错题复盘后即可生成专属战报！`;

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
          color: '#ffffff', padding: '24px 20px 18px', borderRadius: '24px 24px 0 0',
          position: 'relative', overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{
              background: 'rgba(255,255,255,0.15)',
              padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, color: '#fef08a'
            }}>
              🌟 AI 专属私教 · 每日真实战报 ({stage})
            </span>
            <span style={{ fontSize: '0.76rem', color: '#c7d2fe' }}>{todayStr}</span>
          </div>

          <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>
            {studentName}的每日成长印记
          </h2>
          <div style={{ fontSize: '0.84rem', color: '#e0e7ff' }}>
            {hasRealStudy ? '真实记录每一次思考与突破，拒绝虚假打卡' : '今日尚未开启有效学习，完成首道练习后自动点亮'}
          </div>

          {/* 3 Core Stats Badges */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '18px',
            background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '16px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fef08a' }}>{studyMinutes}</div>
              <div style={{ fontSize: '0.72rem', color: '#c7d2fe' }}>专注时长 (分)</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.2)' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#86efac' }}>{masteredCount}</div>
              <div style={{ fontSize: '0.72rem', color: '#c7d2fe' }}>有效研讨 (轮)</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f472b6' }}>
                {safeStars > 0 ? `${safeStars}★` : '待解锁'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#c7d2fe' }}>费曼讲题星级</div>
            </div>
          </div>
        </div>

        {/* Card Body Details */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {hasRealStudy ? (
            <>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  🎯 今日真实研讨足迹（{subject}）：
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: '#334155' }}>
                  {recentTopics.length > 0 ? recentTopics.slice(0, 3).map((topic, idx) => (
                    <div key={idx}>• {topic}</div>
                  )) : (
                    <div>• 已完成 {masteredCount} 轮启发式互动学习，保持了独立思考节奏</div>
                  )}
                </div>
              </div>

              <div style={{ background: '#fdf4ff', padding: '14px', borderRadius: '14px', border: '1px solid #f5d0fe' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1.1rem' }}>👨‍🏫</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#86198f' }}>伴学评语：</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#701a75', lineHeight: '1.5' }}>
                  “{studentName}今天真实投入了 {studyMinutes} 分钟思考练习。建议睡前花 3 分钟翻看错题本巩固记忆，{examTarget}，稳步前行！”
                </p>
              </div>
            </>
          ) : (
            <div style={{
              background: '#f8fafc', padding: '18px 16px', borderRadius: '14px',
              border: '1px dashed #cbd5e1', textAlign: 'center', color: '#475569'
            }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>📝</div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b', marginBottom: '6px' }}>
                今日尚无真实学习记录
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.6 }}>
                为了保证每一份发给家长的战报都 100% 真实可信，系统不会生成虚构时长或假考点。去问老师一道题、刷一组口算或复盘一道错题，即可点亮今日战报！
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={handleCopyText}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '12px',
                background: copied ? '#10b981' : 'linear-gradient(135deg, #4338ca, #3730a3)',
                color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
              }}
            >
              {copied ? '✅ 已复制真实日报文案' : '📋 复制微信战报'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 16px', borderRadius: '12px',
                background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1',
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
