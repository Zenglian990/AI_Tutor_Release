import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * DailyMentalMathModal
 * 【⚡ 60秒趣味口算天天练】(K-9 全学段自适应口算速算工坊)
 * 特性：
 * 1. 1-9 年级题库智能生成器（低年级20以内加减/九九乘法，中年级多位数与四则，高年级小数与有理数正负数）
 * 2. 移动端大字号专属九宫格数字键盘（防系统输入法遮挡，极速盲打）
 * 3. 毫秒级答题计时、连击暴击反馈、答错即时纠错、10题冲刺评星与EXP经验结算
 */

// 题目生成引擎
function generateQuestion(gradeLevel) {
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  if (gradeLevel === 1) {
    // 1年级: 20以内加减法
    const isAdd = Math.random() > 0.5;
    if (isAdd) {
      const a = rand(2, 12);
      const b = rand(2, 20 - a);
      return { expr: `${a} + ${b}`, ans: a + b };
    } else {
      const a = rand(6, 20);
      const b = rand(1, a - 1);
      return { expr: `${a} - ${b}`, ans: a - b };
    }
  }

  if (gradeLevel === 2) {
    // 2年级: 100以内加减法 或 表内乘除法(九九乘法表)
    const type = rand(1, 3);
    if (type === 1) {
      // 乘法
      const a = rand(2, 9);
      const b = rand(2, 9);
      return { expr: `${a} × ${b}`, ans: a * b };
    } else if (type === 2) {
      // 除法
      const b = rand(2, 9);
      const ans = rand(2, 9);
      const a = b * ans;
      return { expr: `${a} ÷ ${b}`, ans };
    } else {
      // 100以内进位加减
      const a = rand(15, 65);
      const b = rand(12, 34);
      return { expr: `${a} + ${b}`, ans: a + b };
    }
  }

  if (gradeLevel === 3) {
    // 3年级: 两位数乘一位数 / 整十整百除法 / 差值退位
    const type = rand(1, 3);
    if (type === 1) {
      const a = rand(12, 35);
      const b = rand(2, 6);
      return { expr: `${a} × ${b}`, ans: a * b };
    } else if (type === 2) {
      const b = rand(2, 8);
      const ans = rand(10, 40);
      const a = b * ans;
      return { expr: `${a} ÷ ${b}`, ans };
    } else {
      const a = rand(120, 500);
      const b = rand(50, 180);
      return { expr: `${a} - ${b}`, ans: a - b };
    }
  }

  if (gradeLevel === 4) {
    // 4年级: 简单四则混合 (乘加乘减) / 两位数乘法速算
    const type = rand(1, 3);
    if (type === 1) {
      const a = rand(3, 9);
      const b = rand(4, 9);
      const c = rand(10, 30);
      return { expr: `${a} × ${b} + ${c}`, ans: a * b + c };
    } else if (type === 2) {
      const a = rand(50, 99);
      const b = rand(3, 8);
      const c = rand(2, 6);
      return { expr: `${a} - ${b} × ${c}`, ans: a - (b * c) };
    } else {
      // 特殊速算: 如 15 x 12, 25 x 4
      const mults = [[25, 4], [25, 8], [15, 6], [12, 5], [15, 12], [24, 5]];
      const pair = mults[rand(0, mults.length - 1)];
      return { expr: `${pair[0]} × ${pair[1]}`, ans: pair[0] * pair[1] };
    }
  }

  if (gradeLevel <= 6) {
    // 5-6年级: 简便小数与百分数速算 / 顺序优先级
    const type = rand(1, 3);
    if (type === 1) {
      const a = (rand(1, 9) * 0.1 + rand(1, 4)).toFixed(1);
      const b = (rand(1, 9) * 0.1).toFixed(1);
      return { expr: `${a} + ${b}`, ans: Number((parseFloat(a) + parseFloat(b)).toFixed(2)) };
    } else if (type === 2) {
      const a = rand(2, 9) * 10;
      const factor = 0.5;
      return { expr: `${a} × 0.5`, ans: a * factor };
    } else {
      const a = 1;
      const b = (rand(1, 8) * 0.1).toFixed(1);
      return { expr: `1 - ${b}`, ans: Number((1 - parseFloat(b)).toFixed(1)) };
    }
  }

  // 7-9年级: 初中有理数正负数四则 / 平方速算 / 绝对值
  const type = rand(1, 4);
  if (type === 1) {
    // 负数乘负数 或 负乘正
    const a = rand(-9, -2);
    const b = rand(-9, 8);
    const bStr = b < 0 ? `(${b})` : `${b}`;
    return { expr: `(${a}) × ${bStr}`, ans: a * b };
  } else if (type === 2) {
    // 负数加减
    const a = rand(-25, 15);
    const b = rand(-20, 20);
    const bStr = b < 0 ? `(${b})` : `${b}`;
    return { expr: `${a} - ${bStr}`, ans: a - b };
  } else if (type === 3) {
    // 常用平方数
    const bases = [11, 12, 13, 14, 15, 16, 17, 18, 19, 25];
    const base = bases[rand(0, bases.length - 1)];
    return { expr: `${base}²`, ans: base * base };
  } else {
    // 绝对值计算
    const a = rand(-15, -3);
    const b = rand(2, 10);
    return { expr: `|${a}| - ${b}`, ans: Math.abs(a) - b };
  }
}

export default function DailyMentalMathModal({
  isOpen,
  onClose,
  currentGrade = 3,
  onAwardExp
}) {
  const [grade, setGrade] = useState(currentGrade || 3);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [userInputs, setUserInputs] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [startTime, setStartTime] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [feedbackState, setFeedbackState] = useState(null); // 'correct' | 'wrong' | null
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);

  const timerRef = useRef(null);

  // 初始化本轮题库
  const startNewSession = useCallback((targetGrade = grade, qCount = totalQuestions) => {
    const list = [];
    for (let i = 0; i < qCount; i++) {
      list.push(generateQuestion(targetGrade));
    }
    setQuestions(list);
    setUserInputs([]);
    setCurrentIndex(0);
    setInputVal('');
    setIsFinished(false);
    setFeedbackState(null);
    setStreak(0);
    setMaxStreak(0);
    setElapsedSeconds(0);
    setStartTime(Date.now());
  }, [grade, totalQuestions]);

  useEffect(() => {
    if (isOpen) {
      const g = (currentGrade >= 1 && currentGrade <= 9) ? currentGrade : 3;
      setGrade(g);
      startNewSession(g, 10);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen, currentGrade]);

  // 计时器
  useEffect(() => {
    if (isOpen && !isFinished && startTime) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isFinished, startTime]);

  // 物理键盘支持
  useEffect(() => {
    if (!isOpen || isFinished) return;

    const handleKeyDown = (e) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        setInputVal((prev) => (prev.length < 6 ? prev + e.key : prev));
      } else if (e.key === '-' && !inputVal.includes('-')) {
        setInputVal((prev) => '-' + prev);
      } else if (e.key === '.' && !inputVal.includes('.')) {
        setInputVal((prev) => (prev === '' ? '0.' : prev + '.'));
      } else if (e.key === 'Backspace') {
        setInputVal((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        handleConfirmAnswer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFinished, inputVal, questions, currentIndex]);

  const currentQ = questions[currentIndex];

  const handleKeypadPress = (val) => {
    if (val === 'backspace') {
      setInputVal((prev) => prev.slice(0, -1));
    } else if (val === 'clear') {
      setInputVal('');
    } else if (val === '-') {
      if (!inputVal.includes('-')) {
        setInputVal((prev) => (prev === '' ? '-' : '-' + prev));
      }
    } else if (val === '.') {
      if (!inputVal.includes('.')) {
        setInputVal((prev) => (prev === '' ? '0.' : prev + '.'));
      }
    } else {
      if (inputVal.length < 6) {
        setInputVal((prev) => prev + val);
      }
    }
  };

  const handleConfirmAnswer = () => {
    if (!inputVal || isNaN(Number(inputVal)) || !currentQ) return;

    const parsedUserAns = Number(inputVal);
    const isCorrect = Math.abs(parsedUserAns - currentQ.ans) < 0.001;

    const updatedUserInputs = [
      ...userInputs,
      {
        question: currentQ.expr,
        expected: currentQ.ans,
        given: parsedUserAns,
        isCorrect
      }
    ];
    setUserInputs(updatedUserInputs);

    if (isCorrect) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) setMaxStreak(nextStreak);
      setFeedbackState('correct');
    } else {
      setStreak(0);
      setFeedbackState('wrong');
    }

    setTimeout(() => {
      setFeedbackState(null);
      setInputVal('');

      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        // 完成全部题目
        setIsFinished(true);
        if (timerRef.current) clearInterval(timerRef.current);

        // 奖励结算
        const correctCount = updatedUserInputs.filter((i) => i.isCorrect).length;
        const awardedExp = correctCount * 3 + (correctCount === questions.length ? 15 : 5);
        if (onAwardExp && typeof onAwardExp === 'function') {
          onAwardExp(awardedExp, `口算速算挑战 (${correctCount}/${questions.length}正确)`);
        }
      }
    }, 400);
  };

  if (!isOpen) return null;

  const correctTotal = userInputs.filter((x) => x.isCorrect).length;
  const accuracyRate = userInputs.length > 0 ? Math.round((correctTotal / userInputs.length) * 100) : 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 10, 24, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'linear-gradient(145deg, #0f172a, #1e293b)',
          borderRadius: '24px',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(56, 189, 248, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeInScale 0.25s ease-out'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.6)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                60秒趣味口算天天练
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: 'rgba(56, 189, 248, 0.2)',
                    color: '#38bdf8',
                    padding: '1px 6px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.4)'
                  }}
                >
                  {grade <= 6 ? `${grade}年级` : '初中7-9年级'}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                限时速算冲刺 · 培养数感与专注力
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Grade Selector & Stats Bar */}
        <div
          style={{
            padding: '10px 18px',
            background: 'rgba(30, 41, 59, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: '0.8rem'
          }}
        >
          {/* 年级切换下拉 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#94a3b8' }}>学段:</span>
            <select
              value={grade}
              onChange={(e) => {
                const g = Number(e.target.value);
                setGrade(g);
                startNewSession(g, totalQuestions);
              }}
              style={{
                background: '#0f172a',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '8px',
                padding: '4px 8px',
                fontSize: '0.78rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={1}>1年级 (20以内加减)</option>
              <option value={2}>2年级 (乘除与百内)</option>
              <option value={3}>3年级 (两位数与多位)</option>
              <option value={4}>4年级 (混合运算与速算)</option>
              <option value={5}>5-6年级 (小数与简算)</option>
              <option value={7}>初中7-9 (有理数与平方)</option>
            </select>
          </div>

          {/* 实时状态 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
              <span>⏱️</span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{elapsedSeconds}s</span>
            </div>
            {streak >= 2 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '0.76rem',
                  animation: 'pulse 1s infinite'
                }}
              >
                🔥 连对 x{streak}
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        {!isFinished ? (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 进度条 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                <span>题号: {currentIndex + 1} / {questions.length}</span>
                <span>正确率: {userInputs.length > 0 ? `${accuracyRate}%` : '100%'}</span>
              </div>
              <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${((currentIndex) / questions.length) * 100}%`,
                    background: 'linear-gradient(90deg, #38bdf8, #10b981)',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>

            {/* 算式卡片展示 */}
            <div
              style={{
                background: feedbackState === 'correct'
                  ? 'rgba(16, 185, 129, 0.2)'
                  : feedbackState === 'wrong'
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'rgba(15, 23, 42, 0.7)',
                border: feedbackState === 'correct'
                  ? '2px solid #10b981'
                  : feedbackState === 'wrong'
                  ? '2px solid #ef4444'
                  : '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '16px',
                padding: '24px 16px',
                textAlign: 'center',
                transition: 'all 0.2s ease',
                position: 'relative',
                boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3)'
              }}
            >
              {feedbackState === 'correct' && (
                <div style={{ position: 'absolute', top: '8px', right: '12px', color: '#10b981', fontWeight: 800, fontSize: '0.9rem' }}>
                  ✓ 答对 +3 EXP
                </div>
              )}
              {feedbackState === 'wrong' && (
                <div style={{ position: 'absolute', top: '8px', right: '12px', color: '#ef4444', fontWeight: 800, fontSize: '0.9rem' }}>
                  ✕ 答案是: {currentQ?.ans}
                </div>
              )}

              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#ffffff', letterSpacing: '1px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                {currentQ?.expr} = ?
              </div>

              {/* 用户输入预览 */}
              <div
                style={{
                  marginTop: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '140px',
                  height: '46px',
                  padding: '0 16px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  borderRadius: '12px',
                  border: '1.5px dashed rgba(56, 189, 248, 0.6)',
                  fontSize: '1.6rem',
                  fontWeight: 700,
                  color: '#38bdf8',
                  fontFamily: 'monospace'
                }}
              >
                {inputVal !== '' ? inputVal : <span style={{ color: '#475569', fontSize: '1rem' }}>输入你的答案</span>}
              </div>
            </div>

            {/* 移动端专属超大九宫格键盘 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginTop: '4px'
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(String(num))}
                  style={{
                    height: '52px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(30, 41, 59, 0.7)',
                    color: '#f8fafc',
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.1s active',
                    userSelect: 'none'
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                  onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {num}
                </button>
              ))}

              {/* 负号/小数点/清空/退格 */}
              <button
                type="button"
                onClick={() => handleKeypadPress(grade >= 7 ? '-' : '.')}
                style={{
                  height: '52px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#94a3b8',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                {grade >= 7 ? '± 负数' : '• 小数点'}
              </button>

              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                style={{
                  height: '52px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(30, 41, 59, 0.7)',
                  color: '#f8fafc',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                0
              </button>

              <button
                type="button"
                onClick={() => handleKeypadPress('backspace')}
                style={{
                  height: '52px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#f87171',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                ⌫ 退格
              </button>
            </div>

            {/* 确认提交按钮 */}
            <button
              type="button"
              onClick={handleConfirmAnswer}
              disabled={inputVal === ''}
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '14px',
                border: 'none',
                background: inputVal === ''
                  ? 'rgba(56, 189, 248, 0.2)'
                  : 'linear-gradient(135deg, #0284c7, #2563eb)',
                color: inputVal === '' ? '#64748b' : '#ffffff',
                fontSize: '1.1rem',
                fontWeight: 700,
                cursor: inputVal === '' ? 'not-allowed' : 'pointer',
                boxShadow: inputVal !== '' ? '0 10px 20px -5px rgba(2, 132, 199, 0.5)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <span>确认下一题 ➔</span>
            </button>
          </div>
        ) : (
          /* 完成结算面板 */
          <div style={{ padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '3rem', animation: 'bounce 1s ease' }}>
              {correctTotal >= 9 ? '🏆' : correctTotal >= 7 ? '🌟' : '💪'}
            </div>

            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>
                {correctTotal === questions.length
                  ? '满分神算手！全部答对！'
                  : correctTotal >= 8
                  ? '太棒了！计算反应神速！'
                  : '完成练习！熟能生巧，再接再厉！'}
              </div>
              <div style={{ fontSize: '0.84rem', color: '#94a3b8', marginTop: '4px' }}>
                总耗时 {elapsedSeconds} 秒 · 平均 {(elapsedSeconds / questions.length).toFixed(1)} 秒/题 · 最高连对 {maxStreak}
              </div>
            </div>

            {/* 成绩卡片 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                background: 'rgba(15, 23, 42, 0.6)',
                padding: '14px',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>正确数</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>
                  {correctTotal} / {questions.length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>正确率</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8' }}>
                  {Math.round((correctTotal / questions.length) * 100)}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>获得经验</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b' }}>
                  +{correctTotal * 3 + (correctTotal === questions.length ? 15 : 5)} EXP
                </div>
              </div>
            </div>

            {/* 错题回顾 */}
            {userInputs.filter((i) => !i.isCorrect).length > 0 && (
              <div
                style={{
                  textAlign: 'left',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  maxHeight: '130px',
                  overflowY: 'auto'
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f87171', marginBottom: '6px' }}>
                  ⚠️ 需留意的错题：
                </div>
                {userInputs
                  .filter((i) => !i.isCorrect)
                  .map((item, idx) => (
                    <div key={idx} style={{ fontSize: '0.82rem', color: '#e2e8f0', margin: '4px 0' }}>
                      {item.question} = <span style={{ color: '#10b981', fontWeight: 700 }}>{item.expected}</span>
                      <span style={{ color: '#f87171', marginLeft: '6px', fontSize: '0.74rem' }}>
                        (你写成了: {item.given})
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => startNewSession(grade, totalQuestions)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 8px 15px -3px rgba(2, 132, 199, 0.4)'
                }}
              >
                🔄 再来一轮速算
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '12px 20px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer'
                }}
              >
                完成退出
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
