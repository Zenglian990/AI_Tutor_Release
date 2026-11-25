import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DailyAchievementCardModal from './DailyAchievementCardModal';
import EyeCareTimerModal from './EyeCareTimerModal';

describe('DailyAchievementCardModal Component', () => {
  it('renders honest empty state when there is zero study activity', () => {
    const onClose = vi.fn();
    render(
      <DailyAchievementCardModal
        isOpen={true}
        onClose={onClose}
        studentName="小明"
        currentGrade="1_up"
        studyMinutes={0}
        masteredCount={0}
        feynmanStars={0}
      />
    );

    expect(screen.getByText(/小明的每日成长印记/)).toBeDefined();
    expect(screen.getByText(/今日尚无真实学习记录/)).toBeDefined();
    expect(screen.getByText(/待解锁/)).toBeDefined();
  });

  it('renders real student achievement card across K12 stages and allows copying share text', () => {
    const onClose = vi.fn();
    render(
      <DailyAchievementCardModal
        isOpen={true}
        onClose={onClose}
        studentName="林同学"
        currentGrade="11_up"
        subject="物理"
        studyMinutes={36}
        masteredCount={6}
        feynmanStars={4}
        recentTopics={['动量守恒定律推导']}
      />
    );

    expect(screen.getByText(/林同学的每日成长印记/)).toBeDefined();
    expect(screen.getAllByText(/36/).length).toBeGreaterThan(0);
    expect(screen.getByText(/动量守恒定律推导/)).toBeDefined();
    expect(screen.getByText(/高考冲刺/)).toBeDefined();

    const copyBtn = screen.getByText(/复制微信战报/);
    fireEvent.click(copyBtn);
    expect(screen.getByText(/已复制真实日报文案/)).toBeDefined();
  });
});

describe('EyeCareTimerModal Component', () => {
  it('renders 20-20-20 eye care timer with focus countdown', () => {
    const onClose = vi.fn();
    render(
      <EyeCareTimerModal
        isOpen={true}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/国际眼科视力守护番茄钟/)).toBeDefined();
    expect(screen.getByText(/20:00/)).toBeDefined();

    const restBtn = screen.getByText(/立即开始20秒远眺/);
    fireEvent.click(restBtn);

    expect(screen.getByText(/20-20-20 睫状肌远眺放松/)).toBeDefined();
    expect(screen.getByText(/请抬起头，眺望 6 米外的窗外远方/)).toBeDefined();
  });
});
