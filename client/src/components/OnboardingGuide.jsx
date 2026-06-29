import { useState } from 'react';
import { useAppStore } from '../store/useStore';

export default function OnboardingGuide({ language, onClose }) {
  const { t } = useAppStore();
  const [step, setStep] = useState(0);

  const steps = language === 'zh-CN' ? [
    {
      title: '🎓 欢迎来到曾练专属私教！',
      content: '这是一个基于人教版 1-9 年级教材构建的 AI 深度教材伴读系统。让我们用 1 分钟了解如何使用它。',
      target: 'welcome'
    },
    {
      title: '🗺️ 探索你的「学习地图」',
      content: '点击下方的「学习地图」按钮。在这里，你可以按章节解锁关卡。AI 会根据你的进度，进行新知导读、核心概念拆解和热身互动！',
      target: 'map'
    },
    {
      title: '📖 记录并巩固「我的错题本」',
      content: '点击 AI 消息右下角的「加入错题本」或主菜单的「错题本」。系统会根据艾宾浩斯遗忘曲线（SM-2 算法）自动计算下一次复习时间，并主动发起「变式题复测」挑战！',
      target: 'mistakes'
    },
    {
      title: '📊 查看「学习报表」与「家长监工」',
      content: '家长可以通过 Parental Gate 家长验证码安全进入「学习报表」和「运营分析」，查看本周学习统计；还能通过「家长监工」一键生成专业的 Markdown 微信周报。',
      target: 'parent'
    }
  ] : [
    {
      title: '🎓 Welcome to AI Tutor!',
      content: 'This is an interactive RAG tutoring system built on standard textbooks for grades 1-9. Let\'s take 1 minute to learn how to use it.',
      target: 'welcome'
    },
    {
      title: '🗺️ Explore the "Learning Map"',
      content: 'Click the "Learning Map" button. You can unlock chapters stage-by-stage. The AI will guide you through core concepts and checkpoints interactively!',
      target: 'map'
    },
    {
      title: '📖 Consolidate with the "Mistake Book"',
      content: 'Save errors to your "Mistake Book". The system uses the SM-2 algorithm to schedule memory intervals and generates challenge variations automatically!',
      target: 'mistakes'
    },
    {
      title: '📊 "Stats Report" & Parental Gate',
      content: 'Parents can securely enter "Stats Report" and "Ops Stats" via a PIN gate to view detailed graphs, or click "Parent Supervisor" to generate weekly text reports.',
      target: 'parent'
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(prev => prev - 1);
  };

  const handleComplete = () => {
    localStorage.setItem('ai_tutor_onboarding_completed', 'true');
    onClose();
  };

  return (
    <div className="mistake-overlay no-print" style={{ zIndex: 1100, background: 'rgba(3, 7, 18, 0.85)' }}>
      <div style={{
        width: '90%',
        maxWidth: '450px',
        background: 'rgba(30, 41, 59, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '24px',
        padding: '28px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        animation: 'scaleIn 0.3s ease'
      }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          {steps.map((_, idx) => (
            <div key={idx} style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              background: idx <= step ? 'var(--accent-color, #3b82f6)' : 'rgba(255, 255, 255, 0.1)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        {/* Text */}
        <div style={{ minHeight: '120px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '12px', color: '#60a5fa' }}>
            {steps[step].title}
          </h3>
          <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#cbd5e1' }}>
            {steps[step].content}
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
          <button
            onClick={handleComplete}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {t('onboarding.skip')}
          </button>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            {step > 0 && (
              <button
                onClick={handleBack}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                {t('onboarding.back')}
              </button>
            )}
            
            <button
              onClick={handleNext}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '8px 24px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
              }}
            >
              {step === steps.length - 1
                ? t('onboarding.start')
                : t('onboarding.next')
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
