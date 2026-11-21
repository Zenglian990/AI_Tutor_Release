import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import App from './App';

describe('Root App Smoke & Regression Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    vi.clearAllMocks();
  });

  it('renders root <App /> without crashing or triggering ErrorBoundary "页面遇到了问题"', async () => {
    let rendered;
    await act(async () => {
      rendered = render(<App />);
    });

    // Check ErrorBoundary text did not appear
    expect(screen.queryByText(/页面遇到了问题/)).toBeNull();
    expect(screen.queryByText(/抱歉，应用运行中发生未知错误/)).toBeNull();

    // Verify main app layout rendered
    expect(rendered.container.querySelector('.app-container')).not.toBeNull();
    expect(rendered.container.querySelector('.header')).not.toBeNull();
    expect(rendered.container.querySelector('.chat-container')).not.toBeNull();
  });

  it('verifies that high school grades are not misclassified as primary school and preserve subjects', async () => {
    // High school profile with grade 10_up and subject 物理
    const mockProfiles = [
      { id: 'hs_student', name: '高一同学', grade: '10_up', edition: '人教版' }
    ];
    localStorage.setItem('ai_tutor_profiles', JSON.stringify(mockProfiles));
    localStorage.setItem('ai_tutor_active_profile', 'hs_student');
    localStorage.setItem('ai_tutor_hs_student_subject', '物理');

    await act(async () => {
      render(<App />);
    });

    // Should not trigger ErrorBoundary
    expect(screen.queryByText(/页面遇到了问题/)).toBeNull();

    // Check subject select dropdown
    const subjectSelect = screen.getByLabelText('选择学科');
    expect(subjectSelect).not.toBeNull();
    expect(subjectSelect.value).toBe('物理');

    // Confirm high school subjects exist in options
    const optionValues = Array.from(subjectSelect.querySelectorAll('option')).map(o => o.value);
    expect(optionValues).toContain('物理');
    expect(optionValues).toContain('化学');
    expect(optionValues).toContain('生物');
    expect(optionValues).toContain('道德与法治');
  });

  it('verifies primary school grades restrict subject choices to primary curriculum', async () => {
    const mockProfiles = [
      { id: 'elem_student', name: '小学同学', grade: '3_up', edition: '人教版' }
    ];
    localStorage.setItem('ai_tutor_profiles', JSON.stringify(mockProfiles));
    localStorage.setItem('ai_tutor_active_profile', 'elem_student');

    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByText(/页面遇到了问题/)).toBeNull();
    const subjectSelect = screen.getByLabelText('选择学科');
    const optionValues = Array.from(subjectSelect.querySelectorAll('option')).map(o => o.value);
    expect(optionValues).toEqual(['', '语文', '数学', '英语']);
  });

  it('verifies eye care modal opens and toggles eink mode without ReferenceError', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByText(/页面遇到了问题/)).toBeNull();

    // Open eye care modal via header button
    const eyeCareBtn = screen.getByLabelText('打开视力守护番茄钟');
    await act(async () => {
      fireEvent.click(eyeCareBtn);
    });

    // Modal should be visible
    expect(screen.getByText(/国际眼科视力守护番茄钟/)).not.toBeNull();
    expect(document.body.classList.contains('eink-mode')).toBe(false);

    // Click toggle e-ink button
    const toggleEinkBtn = screen.getByText('一键切换');
    await act(async () => {
      fireEvent.click(toggleEinkBtn);
    });
    expect(document.body.classList.contains('eink-mode')).toBe(true);

    // Toggle back
    await act(async () => {
      fireEvent.click(toggleEinkBtn);
    });
    expect(document.body.classList.contains('eink-mode')).toBe(false);

    // Close modal
    const closeBtn = screen.getByText('收起计时器');
    await act(async () => {
      fireEvent.click(closeBtn);
    });
    expect(screen.queryByText(/国际眼科视力守护番茄钟/)).toBeNull();
  });

  it('recovers gracefully and mounts App when localStorage has empty or corrupted profiles', async () => {
    localStorage.setItem('ai_tutor_profiles', '[]');
    localStorage.setItem('ai_tutor_active_profile', 'corrupted_id');

    let rendered;
    await act(async () => {
      rendered = render(<App />);
    });

    // ErrorBoundary must not catch any crash
    expect(screen.queryByText(/页面遇到了问题/)).toBeNull();
    expect(rendered.container.querySelector('.app-container')).not.toBeNull();
  });
});
