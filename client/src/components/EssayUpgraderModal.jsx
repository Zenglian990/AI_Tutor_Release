import React, { useState } from 'react';
import { authFetch } from '../store/useStore';

/**
 * EssayUpgraderModal
 * 中高考作文全维度名师精批与逐句升格台 (对标作业帮 / 豆包作文精批)
 * 
 * 核心特性：
 * 1. 中高考五维雷达专业阅卷标准（立意/结构/文采/情感/规范）
 * 2. 逐句原句 vs 名师润色升格句对比，拆解提分修辞技巧与白描手法
 * 3. 一键带入私教课堂向特级名师请教
 */
function parseGradeNumber(g) {
  if (!g) return 7;
  if (typeof g === 'number') return g;
  const s = String(g).trim();
  const startDigit = s.match(/^(\d+)/);
  if (startDigit) return parseInt(startDigit[1], 10);
  if (s.includes('高一') || s.includes('高1') || s.includes('高中一年级')) return 10;
  if (s.includes('高二') || s.includes('高2') || s.includes('高中二年级')) return 11;
  if (s.includes('高三') || s.includes('高3') || s.includes('高中三年级')) return 12;
  if (s.includes('七年级') || s.includes('初一') || s.includes('初中一年级')) return 7;
  if (s.includes('八年级') || s.includes('初二') || s.includes('初中二年级')) return 8;
  if (s.includes('九年级') || s.includes('初三') || s.includes('初中三年级')) return 9;
  const cnNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const cnMatch = s.match(/([一二三四五六七八九])年级/);
  if (cnMatch) {
    const idx = cnNums.indexOf(cnMatch[1]);
    if (idx !== -1) return idx;
  }
  const anyDigit = s.match(/(\d+)/);
  if (anyDigit) return parseInt(anyDigit[1], 10);
  return 7;
}

export default function EssayUpgraderModal({
  isOpen,
  onClose,
  currentGrade = '7_up',
  onApplyToChat
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const rawGrade = parseGradeNumber(currentGrade);
  const isPrimaryLower = rawGrade <= 3;
  const isPrimaryUpper = rawGrade >= 4 && rawGrade <= 6;
  const isHighSchool = rawGrade >= 10;

  if (!isOpen) return null;

  const handleLoadSample = () => {
    if (isPrimaryLower) {
      setTitle('可爱的小花猫');
      setContent(`今天我家来了一只可爱的小花猫。它浑身雪白雪白的，耳朵尖尖的，走起路来悄悄的没有一点声音。我拿小鱼干喂它，它吃得津津有味，还朝我喵喵叫，好像在说谢谢我呢！`);
    } else if (isPrimaryUpper) {
      setTitle('一次难忘的劳动');
      setContent(`周五下午，我和同学们一起在校园小农场里翻土种菜。太阳晒得大家额头满是汗珠，但小明挥舞着小铁锹，我蹲下身小心翼翼地把菜苗扶正，填土、浇水。看到一排排精神抖擞的小绿苗，大家心里比吃了蜜还甜。`);
    } else if (isHighSchool) {
      setTitle('时代与青年');
      setContent(`立于百年未有之大变局的交汇点，青年一代当以实干笃行回应时代叩问。无论是漫漫科研路上的默默坚守，还是乡村振兴一线的青春播撒，唯有将个体命运融入家国大业，方能在思辨与躬行中铸就精神之丰碑。`);
    } else {
      setTitle('阳光总在风雨后');
      setContent(`那年夏天，蝉鸣阵阵，阳光透过密密麻麻的梧桐树叶洒下斑驳的光影。
我独自坐在教室的角落里，面对着模拟考卷上鲜红的分数，心中满是迷茫与沮丧。
母亲轻轻推开门，递给我一杯温热的牛奶。她没有责备我，只是微笑着说：“孩子，一次跌倒并不代表永远爬不起来。”
那一刻，我仿佛看到心中的坚冰在阳光下悄然消融。我重新拿起笔，向着梦想的方向再次起跑。`);
    }
    setErrorMsg('');
  };

  const handleEvaluate = async () => {
    if (!content.trim() || content.trim().length < 20) {
      setErrorMsg('请至少输入 20 字以上的作文内容，以便名师深入批阅！');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);

    try {
      const res = await authFetch('/api/essay/grade-and-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || '未命题',
          content: content.trim(),
          grade: currentGrade
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setReport(data.data);
      } else {
        setErrorMsg(data.error || '作文批阅失败，请稍后重试');
      }
    } catch (e) {
      setErrorMsg('网络请求超时，请检查服务连接');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendToChat = () => {
    if (!report) return;
    const stagePlatform = isPrimaryLower ? '小学写话精批台' : (isPrimaryUpper ? '小学习作精批台' : '作文精批台');
    let followUpQuestion = '请问老师，在考场高压下写记叙文时，我怎样才能快速抓住动词和环境细节，把平铺直叙的段落升华为能打动阅卷老师的高分金句？';
    if (isPrimaryLower) {
      followUpQuestion = '请问老师，我怎样才能把生活里的观察写得更生动、更有童趣呀？';
    } else if (isPrimaryUpper) {
      followUpQuestion = '请问老师，我在写记叙文时，怎样才能把人物的动作和心理细节写得像电影慢镜头一样生动？';
    } else if (isHighSchool) {
      followUpQuestion = '请问老师，在写高考思辨议论文时，如何强化驳论与破立结合，使文章立意更深邃宏阔？';
    }

    const text = `老师，我在${stagePlatform}上批改了我的作文《${title || '未命题'}》：\n` +
      `名师诊断总分：【${report.total_score} / ${report.max_score}分】（${report.grade_level_label}）。\n` +
      `其中五维诊断中我的【词句文采】评分为 ${report.dimensions?.rhetoric?.score || 8} 分。\n` +
      `名师给我的升格建议是：“${report.suggestions?.[0] || '强化细节白描'}”。\n` +
      followUpQuestion;
    onApplyToChat && onApplyToChat(text);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '24px', width: '100%', maxWidth: '780px',
        maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
          color: '#ffffff', padding: '16px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>🖋️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                {isPrimaryLower ? '小学低段写话与日记精批升格台' : (isPrimaryUpper ? '小学中高段习作五维精批升格台' : (isHighSchool ? '新高考作文五维精批与逐句升格台' : '中高考作文五维精批与逐句升格台'))}
              </h3>
              <div style={{ fontSize: '0.8rem', color: '#fef3c7', marginTop: '2px' }}>
                {isPrimaryLower ? '特级教师童趣指导 · 词句多感官润色 · 满分20分写话标准' : (isPrimaryUpper ? '特级教师细节诊断 · 动作与心理镜头化 · 满分30分习作标准' : (isHighSchool ? '全国新高考阅卷名师 · 思辨与家国情怀 · 满分60分高考标准' : '特级教师阅卷雷达 · 逐句润色提分 · 击穿中考50分大关'))}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: '#ffffff',
              fontSize: '1.4rem', cursor: 'pointer', padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!report ? (
            /* Input View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#334155' }}>
                  题目与正文草稿：
                </span>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  style={{
                    background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                    padding: '4px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  ⚡ 载入中考满分作文范例
                </button>
              </div>

              <input
                type="text"
                placeholder="作文题目（例如：《那一刻，我长大了》《阳光总在风雨后》）"
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{
                  padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1',
                  fontSize: '0.95rem', fontWeight: 600, color: '#1e293b'
                }}
              />

              <div style={{ position: 'relative' }}>
                <textarea
                  rows={9}
                  placeholder="在此粘贴或输入你的作文正文草稿（支持段落分行，名师将逐段逐句诊断并给出升级润色）..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #cbd5e1',
                    fontSize: '0.92rem', lineHeight: '1.6', color: '#334155', resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{
                  position: 'absolute', bottom: '10px', right: '14px', fontSize: '0.75rem',
                  color: content.length >= 20 ? '#10b981' : '#94a3b8', fontWeight: 700
                }}>
                  {content.length} 字
                </div>
              </div>

              {errorMsg && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', background: '#fef2f2', padding: '8px 12px', borderRadius: '8px' }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: '#f1f5f9', color: '#64748b', border: 'none',
                    padding: '9px 18px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleEvaluate}
                  disabled={isLoading}
                  style={{
                    background: 'linear-gradient(135deg, #b45309, #d97706)',
                    color: '#fff', border: 'none', padding: '9px 24px', borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)'
                  }}
                >
                  {isLoading ? '⏳ 名师正在全维度阅卷中...' : '🚀 提交特级名师精批与逐句升格'}
                </button>
              </div>
            </div>
          ) : (
            /* Report View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Score Banner */}
              <div style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                border: '1px solid #fcd34d', borderRadius: '16px', padding: '16px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.4rem' }}>🏆</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#78350f' }}>
                      {report.total_score} / {report.max_score} 分
                    </span>
                    <span style={{
                      background: '#78350f', color: '#fff', padding: '2px 8px', borderRadius: '6px',
                      fontSize: '0.75rem', fontWeight: 700
                    }}>
                      {report.grade_level_label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#92400e', marginTop: '4px' }}>
                    字数：{report.char_count} 字 · 段落：{report.para_count} 段 · 严格契合中考阅卷标准
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSendToChat}
                  style={{
                    background: 'linear-gradient(135deg, #b45309, #d97706)',
                    color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(180, 83, 9, 0.3)'
                  }}
                >
                  💬 带入课堂请教名师
                </button>
              </div>

              {/* 5 Dimensions Grid */}
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', marginBottom: '10px' }}>
                  📊 中高考五维阅卷雷达诊断：
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  {Object.entries(report.dimensions || {}).map(([k, dim]) => (
                    <div key={k} style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
                      padding: '10px', textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>{dim.label}</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309', margin: '4px 0' }}>
                        {dim.score} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/ 10</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#475569', lineHeight: '1.4' }}>{dim.comment}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sentence-by-Sentence Upgrades (The Core Product Differentiation) */}
              {report.sentence_upgrades && report.sentence_upgrades.length > 0 && (
                <div>
                  <div style={{
                    fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', marginBottom: '10px',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                    <span>✨ 特级名师【逐句升格润色对比】（点石成金）：</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {report.sentence_upgrades.map((item, idx) => (
                      <div key={idx} style={{
                        background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '14px',
                        padding: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{
                            background: '#fee2e2', color: '#991b1b', fontSize: '0.75rem', fontWeight: 700,
                            padding: '2px 8px', borderRadius: '6px'
                          }}>
                            原句 (平铺直叙)
                          </span>
                          <span style={{
                            background: '#dcfce7', color: '#166534', fontSize: '0.75rem', fontWeight: 700,
                            padding: '2px 8px', borderRadius: '6px'
                          }}>
                            技巧：{item.technique}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.88rem', color: '#64748b', textDecoration: 'line-through', marginBottom: '8px' }}>
                          “{item.original}”
                        </div>
                        <div style={{
                          fontSize: '0.92rem', color: '#047857', fontWeight: 600, background: '#f0fdf4',
                          padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #10b981', marginBottom: '6px'
                        }}>
                          升格后：“{item.upgraded}”
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#4b5563' }}>
                          💡 <b>名师提分点拨：</b>{item.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setReport(null)}
                  style={{
                    background: '#f1f5f9', color: '#475569', border: 'none',
                    padding: '8px 16px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  ← 重新编辑原稿
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: '#0f172a', color: '#fff', border: 'none',
                    padding: '8px 22px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  完成退出
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
