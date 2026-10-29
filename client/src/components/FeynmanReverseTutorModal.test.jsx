import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FeynmanReverseTutorModal from './FeynmanReverseTutorModal';

describe('FeynmanReverseTutorModal Component', () => {
  it('renders modal with question and Xiao Ming greeting', () => {
    render(
      <FeynmanReverseTutorModal
        isOpen={true}
        question="解方程 2x + 4 = 10"
        studentName="曾练"
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/费曼以教代学 · 小老师讲题台/)).toBeDefined();
    expect(screen.getByText(/解方程 2x \+ 4 = 10/)).toBeDefined();
    expect(screen.getByText(/同桌小明：/)).toBeDefined();
  });

  it('submits explanation and displays evaluation report with Xiao Ming follow-up question', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          mastery_score: 92,
          stars: 5,
          peer_reply: '小明连连点头：哇！曾练老师讲得好清楚！',
          follow_up_question: '移项为什么变号？',
          key_points_covered: ['移项', '变号'],
          logic_words_count: 3,
          praise: '逻辑极其严密！',
          logic_rating: '逻辑严密'
        }
      })
    });

    render(
      <FeynmanReverseTutorModal
        isOpen={true}
        question="解方程 2x + 4 = 10"
        studentName="曾练"
        onClose={() => {}}
        onApplyFollowUpToChat={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/你可以这样讲/);
    fireEvent.change(textarea, { target: { value: '首先移项变号，所以 2x = 6，然后两边除以 2 得到 x = 3。' } });

    const submitBtn = screen.getByText(/看看小明听懂没/);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/费曼掌握度：92 分/)).toBeDefined();
      expect(screen.getByText(/移项为什么变号？/)).toBeDefined();
      expect(screen.getByText(/✓ 移项/)).toBeDefined();
    });
  });
});
