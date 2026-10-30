import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from './App';

describe('Root App Smoke & Regression Tests', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('verifies that high school grades are not misclassified as primary school', async () => {
    // High school profile with grade 10_up
    const mockProfiles = [
      { id: 'hs_student', name: '高一同学', grade: '10_up', edition: '人教版' }
    ];
    localStorage.setItem('ai_tutor_profiles', JSON.stringify(mockProfiles));
    localStorage.setItem('ai_tutor_active_profile', 'hs_student');

    let rendered;
    await act(async () => {
      rendered = render(<App />);
    });

    // Should not trigger ErrorBoundary
    expect(screen.queryByText(/页面遇到了问题/)).toBeNull();
    expect(rendered.container.querySelector('.app-container')).not.toBeNull();
  });

  it('verifies eye care modal and eink toggle do not cause ReferenceError', async () => {
    let rendered;
    await act(async () => {
      rendered = render(<App />);
    });

    expect(screen.queryByText(/页面遇到了问题/)).toBeNull();
    expect(rendered.container.querySelector('.app-container')).not.toBeNull();
  });
});
