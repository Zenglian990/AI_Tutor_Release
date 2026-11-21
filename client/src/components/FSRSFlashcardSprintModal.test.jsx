import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FSRSFlashcardSprintModal from './FSRSFlashcardSprintModal';

describe('FSRSFlashcardSprintModal Component', () => {
  const mockMistakes = [
    {
      id: 101,
      query: '若 2x + 4 = 10，则 x 等于多少？',
      answer: '移项得 2x = 6，系数化为1得 x = 3。',
      reason: '移项未变号',
      subject: '数学'
    },
    {
      id: 102,
      query: '光从空气斜射入水中，折射角与入射角的大小关系？',
      answer: '折射角小于入射角。',
      reason: '混淆折射角变化规律',
      subject: '物理'
    }
  ];

  it('renders modal with initial card question', () => {
    render(
      <FSRSFlashcardSprintModal
        isOpen={true}
        mistakes={mockMistakes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/FSRS 3分钟记忆闪卡冲刺/)).toBeDefined();
    expect(screen.getByText(/若 2x \+ 4 = 10，则 x 等于多少？/)).toBeDefined();
    expect(screen.getByText(/卡片 1 \/ 2/)).toBeDefined();
  });

  it('flips card to reveal answer and allows FSRS rating', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        next_interval_days: 3,
        stability: 2.8,
        difficulty: 4.1
      })
    });

    const onMistakeUpdated = vi.fn();

    render(
      <FSRSFlashcardSprintModal
        isOpen={true}
        mistakes={mockMistakes}
        onClose={() => {}}
        onMistakeUpdated={onMistakeUpdated}
      />
    );

    // Flip card by clicking "查看答案与自测评分"
    const flipBtn = screen.getByText(/查看答案与自测评分/);
    fireEvent.click(flipBtn);

    // Check that answer and rating buttons appear
    expect(screen.getByText(/标准思路与答案：/)).toBeDefined();
    const goodBtn = screen.getByText(/掌握/);
    fireEvent.click(goodBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/mistakes/review-feedback',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ mistake_id: 101, rating: 3 })
        })
      );
      expect(onMistakeUpdated).toHaveBeenCalledWith(101, expect.objectContaining({ success: true }));
    });
  });
});
