import React, { useState } from 'react';

export const CURRENT_PRIVACY_VERSION = '1.5.4';

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
    localStorage.setItem('ai_tutor_minor_privacy_consent_version', CURRENT_PRIVACY_VERSION);
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
        width: '100%', maxWidth: '640px', background: '#ffffff',
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
              儿童个人信息保护与监护人知情同意书 (v1.5.4)
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
            padding: '20px 24px', maxHeight: '360px', overflowY: 'auto',
            fontSize: '0.85rem', color: '#334155', lineHeight: 1.7, background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0'
          }}
        >
          <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            尊敬的家长 / 监护人：
          </p>
          <p>
            欢迎使用「曾先生智慧私教」。本产品专门面向 1-9 年级中小学生提供启发式学科辅导。我们高度重视未成年人个人信息与隐私安全，特此公开披露系统的数据处理范围与流向规则：
          </p>

          <h4 style={{ margin: '14px 0 6px', color: '#1e293b', fontSize: '0.9rem' }}>一、信息收集与真实传输范围（最小必要原则）</h4>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li><b>辅导昵称（非真实姓名）</b>：为生成生动亲切的名师对话称呼及晚间家访便签，系统仅传输家长在应用中自定义填写的<b>辅导昵称（如“豆豆”、“小涵”）</b>。我们<b>严禁并绝不索取、收集或上传未成年人的真实法定姓名、身份证号、学籍号及户籍信息</b>；</li>
            <li><b>学情数据</b>：年级、学科、作答记录、艾宾浩斯错题本数据及启发式答疑记录；</li>
            <li><b>相机权限 (CAMERA)</b>：仅在学生主动使用“拍照讲题/批改作业”功能时调用，用于拍摄作业题目并在本地完成有损压缩。我们<b>严禁进行人脸识别或生物特征提取</b>；</li>
            <li><b>麦克风权限 (RECORD_AUDIO)</b>：仅在学生主动长按麦克风进行“语音提问/名师对话”时调用。优先使用设备原生语音引擎本地实时转文字，云端转录完成后音频即刻销毁，不进行永久留存；</li>
            <li><b>严禁收集</b>：通讯录、精准 GPS 地理位置、设备唯一硬件串号及任何非必要隐私。</li>
          </ul>

          <h4 style={{ margin: '14px 0 6px', color: '#1e293b', fontSize: '0.9rem' }}>二、第三方技术服务商与数据流向全披露</h4>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li><b>Google Gemini (谷歌公司)</b>：用于作业题目多模态视觉解析、英语口语纠音与多学科思维链深度推理。相关请求数据经 TLS 加密传输，涉及必要的合规跨境传输；</li>
            <li><b>DeepSeek (杭州深度求索)</b>：用于理科题目的逻辑推导、分步引导解答与变式巩固题生成；</li>
            <li><b>Jev 智能决策加速引擎 & TypeSafe 网关</b>：用于端侧与云端请求决策加速、类型安全防校验与网络优化；</li>
            <li>上述合作技术服务方均签署严格的数据保密协议，承诺不得将本产品的学生题目请求用于公开通用模型训练。</li>
          </ul>

          <h4 style={{ margin: '14px 0 6px', color: '#1e293b', fontSize: '0.9rem' }}>三、存储期限与监护人完全掌控权</h4>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li><b>存储与留存</b>：学生的辅导记录存储于您的设备本地存储与您的专属服务实例，持续保留至您主动清理；</li>
            <li><b>一键清空与撤回</b>：作为法定监护人，您可随时在【设置】与【家长管理】中查阅、导出、一键彻底清空孩子的全部对话历史与错题本；</li>
            <li><b>防抄题监督锁</b>：您可随时在家长管理中启用“防抄题监督锁”，启用后系统将强制屏蔽直接标准答案，转为启发式分步提问。</li>
          </ul>
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
              我已年满 18 周岁，确认我是该未成年学生的<b>法定监护人</b>，已阅读并充分理解上述《儿童个人信息保护与监护人知情同意书 (v1.5.4)》，同意系统按规则提供辅导服务。
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
