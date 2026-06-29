import { useRef, useEffect } from 'react';

export default function ChapterStepper({
  activeChapterData,
  setActiveChapterData,
  currentProfileId,
  currentGrade,
  selectedSubject,
  onSubmit,
  authFetch
}) {
  const confettiTimersRef = useRef([]);
  const isConfettiActiveRef = useRef(false);

  useEffect(() => {
    return () => {
      confettiTimersRef.current.forEach(id => { clearTimeout(id); clearInterval(id); });
      confettiTimersRef.current = [];
      document.querySelectorAll('.confetti-particle').forEach(el => el.remove());
    };
  }, []);

  if (!activeChapterData) return null;

  return (
    <div className="chapter-stepper-bar glass-panel animate-fade-in" style={{
      position: 'fixed', top: '70px', left: '50%', transform: 'translateX(-50%)',
      width: '90%', maxWidth: '800px', zIndex: 90, padding: '12px 20px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
    }}>
      <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 'bold' }}>📍 当前探索: 《{activeChapterData.name}》</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {[{ pct: 25, label: '⛳ 导学' }, { pct: 50, label: '⚔️ 挑战' }, { pct: 75, label: '📝 脑图' }, { pct: 100, label: '🏆 通关' }].map(step => {
          const isActive = (activeChapterData.progress_pct || 0) >= step.pct;
          return (
            <button key={step.pct} onClick={async () => {
              const newStatus = step.pct === 100 ? 'completed' : 'in_progress';
              setActiveChapterData(prev => ({ ...prev, progress_pct: step.pct, status: newStatus }));
              authFetch('/api/chapters/update-progress', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile_id: currentProfileId, grade: currentGrade, subject: selectedSubject || '数学', chapter_id: activeChapterData.id, status: newStatus, progress_pct: step.pct })
              }).catch(err => console.error('Failed to sync progress:', err));
              
              let text = '';
              if (step.pct === 25) text = `我准备好开始第一关【${step.pct}% 新知导读与热身】了！`;
              if (step.pct === 50) text = `进入第二关【${step.pct}% 概念挑战】！请给我出道相关的互动练习题吧。`;
              if (step.pct === 75) text = `进入第三关【${step.pct}% 脑图巩固】！请用Markdown代码块给我画个本章的核心思维导图。`;
              if (step.pct === 100) {
                text = `进入最终关【${step.pct}% 终极通关】！我已经准备好迎接最后的测试了，请出题！`;
                if (!isConfettiActiveRef.current) {
                  isConfettiActiveRef.current = true;
                  const interval = setInterval(() => {
                    const confetti = document.createElement('div');
                    confetti.className = 'confetti-particle';
                    confetti.innerText = '🎉';
                    confetti.style.cssText = `position:fixed;left:${Math.random() * 100}vw;top:-50px;font-size:${Math.random() * 20 + 20}px;transition:transform 3s linear,opacity 3s linear;z-index:9999;`;
                    document.body.appendChild(confetti);
                    const t1 = setTimeout(() => { confetti.style.transform = `translateY(${window.innerHeight + 100}px) rotate(${Math.random() * 360}deg)`; confetti.style.opacity = '0'; }, 50);
                    const t2 = setTimeout(() => confetti.remove(), 3000);
                    confettiTimersRef.current.push(t1, t2);
                  }, 100);
                  confettiTimersRef.current.push(interval);
                  confettiTimersRef.current.push(setTimeout(() => {
                    clearInterval(interval);
                    isConfettiActiveRef.current = false;
                  }, 2000));
                }
              }
              onSubmit(null, text);
            }} style={{
              padding: '6px 12px', borderRadius: '20px', fontSize: '13px',
              background: isActive ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.1)',
              color: isActive ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer',
              boxShadow: isActive ? '0 0 10px rgba(139, 92, 246, 0.5)' : 'none'
            }}>{step.label}</button>
          );
        })}
        <button onClick={() => setActiveChapterData(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: '4px' }}>✕</button>
      </div>
    </div>
  );
}
