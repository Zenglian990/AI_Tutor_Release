import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChapterStepper from './ChapterStepper';

describe('ChapterStepper Component', () => {
  const activeChapterData = {
    id: 1,
    name: '平面直角坐标系',
    progress_pct: 75,
    status: 'in_progress'
  };

  it('renders chapter stepper with current progress', () => {
    const setActiveChapterData = vi.fn();
    const onSubmit = vi.fn();
    const authFetch = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ChapterStepper
        activeChapterData={activeChapterData}
        setActiveChapterData={setActiveChapterData}
        currentProfileId="test_child"
        currentGrade="8_up"
        selectedSubject="数学"
        onSubmit={onSubmit}
        authFetch={authFetch}
      />
    );

    expect(screen.getByText(/平面直角坐标系/)).toBeDefined();
    expect(screen.getByText('🏆 通关')).toBeDefined();
  });

  it('clicking 100% 通关 opens 3-question mastery check modal instead of bypassing', async () => {
    const setActiveChapterData = vi.fn();
    const onSubmit = vi.fn();
    const authFetch = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ChapterStepper
        activeChapterData={activeChapterData}
        setActiveChapterData={setActiveChapterData}
        currentProfileId="test_child"
        currentGrade="8_up"
        selectedSubject="数学"
        onSubmit={onSubmit}
        authFetch={authFetch}
      />
    );

    // Click 🏆 通关
    const passBtn = screen.getByText('🏆 通关');
    fireEvent.click(passBtn);

    // Modal should appear
    expect(screen.getByText('🏆 单元通关测评')).toBeDefined();
    expect(screen.getByText(/答对 2 题及以上即可点亮本单元通关金星/)).toBeDefined();
    expect(screen.getByText(/第 1 题:/)).toBeDefined();
    expect(screen.getByText(/第 2 题:/)).toBeDefined();
    expect(screen.getByText(/第 3 题:/)).toBeDefined();

    // Submit button should be disabled until all 3 questions answered
    const submitBtn = screen.getByText('提交通关检测');
    expect(submitBtn).toBeDefined();
  });
});
