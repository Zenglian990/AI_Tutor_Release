import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DailyAchievementCardModal from './DailyAchievementCardModal';
import EyeCareTimerModal from './EyeCareTimerModal';

describe('DailyAchievementCardModal Component', () => {
  it('renders student achievement card and allows copying share text', () => {
    const onClose = vi.fn();
    render(
      <DailyAchievementCardModal
        isOpen={true}
        onClose={onClose}
        studentName="曾练"
        studyMinutes={45}
        masteredCount={4}
        feynmanStars={5}
      />
    );

    expect(screen.getByText(/曾练的每日成长印记/)).toBeDefined();
    expect(screen.getByText(/45/)).toBeDefined();
    expect(screen.getByText(/复制日报分享家庭群/)).toBeDefined();

    const copyBtn = screen.getByText(/复制日报分享家庭群/);
    fireEvent.click(copyBtn);
    expect(screen.getByText(/已复制战报文本/)).toBeDefined();
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

    // Toggle to rest mode
    const restBtn = screen.getByText(/立即开始20秒远眺/);
    fireEvent.click(restBtn);

    expect(screen.getByText(/20-20-20 睫状肌远眺放松/)).toBeDefined();
    expect(screen.getByText(/请抬起头，眺望 6 米外的窗外远方/)).toBeDefined();
  });
});
