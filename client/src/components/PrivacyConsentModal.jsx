import React, { useState } from 'react';

export default function PrivacyConsentModal({ isOpen, onAccept }) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [agreedCheck, setAgreedCheck] = useState(false);

  if (!isOpen) return null;

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollTop + clientHeight >= scrollHeight - 30) {
      setHasScrolledToBottom(true);
    }
  };

  const handleConfirm = () => {
    if (!agreedCheck) return;
    localStorage.setItem('ai_tutor_minor_privacy_consented', 'true');
    localStorage.setItem('ai_tutor_minor_privacy_consent_time', new Date().toISOString());
    if (onAccept) onAccept();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        width: '100%', maxWidth: '620px', background: '#ffffff',
        borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#ffffff',
          padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '1.6rem' }}>🛡️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              儿童个人信息保护与监护人知情同意书
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#cbd5e1' }}>
              根据《中华人民共和国个人信息保护法》及《未成年人网络保护条例》制定
            </p>
          </div>
        </div>

        {/* Content Box */}
        <div
          onScroll={handleScroll}
          style={{
            padding: '20px 24px', maxHeight: '340px', overflowY: 'auto',
            fontSize: '0.85rem', color: '#334155', lineHeight: 1.7, background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0'
          }}
        >
          <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            尊敬的家长 / 监护人：
          </p>
          <p>
            欢迎使用「曾先生智慧私教」。本产品专门面向 1-9 年级中小学生提供启发式学科辅导。我们深知未成年人个人信息的重要性，特别制定本规则，请您作为法定监护人仔细阅读并确认：
          </p>

          <h4 style={{ margin: '14px 0 6px', color: '#1e293b', fontSize: '0.9rem' }}>一、我们收集哪些信息</h4>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li><b>学习状态信息</b>：当前年级、学科、作答记录、错题本数据及启发式答疑对话记录；</li>
            <li><b>设备与网络参数</b>：局域网连接状态、离线缓存进度与打印任务指令；</li>
            <li><b>我们严禁并承诺不收集</b>：未成年人的真实身份证号、生物人脸识别信息及地理精确定位。</li>
          </ul>

          <h4 style={{ margin: '14px 0 6px', color: '#1e293b', fontSize: '0.9rem' }}>二、信息如何使用与存储</h4>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li>仅用于生成针对孩子的错题针对性训练卷、学情脑图与苏格拉底式启发引导；</li>
            <li>所有学生认知数据与聊天记录均优先保存在本地或加密存储于您的专属服务实例；</li>
            <li>系统支持家长在【设置】与【家长端】中一键彻底擦除错题与历史对话数据。</li>
          </ul>

          <h4 style={{ margin: '14px 0 6px', color: '#1e293b', fontSize: '0.9rem' }}>三、监护人权利与撤回权</h4>
          <p style={{ margin: '6px 0 0' }}>
            作为监护人，您有权随时查阅、复制、更正或要求删除您孩子的个人信息。如您拒绝同意本规则，孩子将无法开启多轮定制伴学功能。
          </p>
        </div>

        {/* Footer Checkbox & Confirm */}
        <div style={{ padding: '18px 24px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85rem', color: '#1e293b', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreedCheck}
              onChange={(e) => setAgreedCheck(e.target.checked)}
              style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#4f46e5' }}
            />
            <span>
              我已年满 18 周岁，确认我是该未成年学生的<b>法定监护人</b>，已阅读并充分理解上述《儿童个人信息保护与监护人知情同意书》，同意系统按规则提供辅导服务。
            </span>
          </label>

          <button
            disabled={!agreedCheck}
            onClick={handleConfirm}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px',
              background: agreedCheck ? 'linear-gradient(135deg, #4f46e5, #4338ca)' : '#cbd5e1',
              color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.95rem',
              cursor: agreedCheck ? 'pointer' : 'not-allowed',
              boxShadow: agreedCheck ? '0 4px 6px -1px rgba(79, 70, 229, 0.3)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            {agreedCheck ? '✅ 监护人确认并开启智慧私教' : '请先勾选监护人知情同意'}
          </button>
        </div>
      </div>
    </div>
  );
}
