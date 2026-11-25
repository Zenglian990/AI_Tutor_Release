import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { verifyStepTransition } from './utils/stepVerifier';
import { AppProvider } from './store/useStore';
import ExamRoomModal from './components/ExamRoomModal';
import KnowledgeTest from './components/KnowledgeTest';

describe('Round 4 Critical Regression Guards', () => {
  describe('stepVerifier CAS security & edge cases', () => {
    it('rejects trivial tautology 0 = 0 multiplied by zero instead of marking it equivalent', () => {
      const res = verifyStepTransition('2x + 4 = 10', '0 = 0');
      expect(res.valid).toBe(false);
    });

    it('accepts valid multi-step fractional equation clearing denominator', () => {
      const res = verifyStepTransition('x/2 + 1 = 3', 'x + 2 = 6');
      expect(res.valid).toBe(true);
    });
  });

  describe('ExamRoomModal timer & state persistence', () => {
    const samplePaper = {
      title: '高二数学全真模拟示范卷',
      grade: '11_up',
      duration: 120,
      totalScore: 150,
      questions: [
        { id: 1, type: 'choice', question: '椭圆离心率 $e$ 的范围是？', options: ['A. $(0,1)$', 'B. $(1,+\\infty)$', 'C. $1$', 'D. $0$'], score: 5, answer: 'A' },
        { id: 2, type: 'choice', question: '导数 $(x^2)\' =$？', options: ['A. $x$', 'B. $2x$', 'C. $2$', 'D. $x^2$'], score: 5, answer: 'B' }
      ]
    };

    it('does not auto-submit on initial mount and preserves current question index when answering', () => {
      const onSubmitExam = vi.fn();
      const onAnswerChange = vi.fn();

      const { rerender } = render(
        <ExamRoomModal
          isOpen={true}
          onClose={vi.fn()}
          paper={samplePaper}
          answers={{}}
          onAnswerChange={onAnswerChange}
          onSubmitExam={onSubmitExam}
        />
      );

      // Must NOT immediately auto-submit on first render
      expect(onSubmitExam).not.toHaveBeenCalled();
      expect(screen.getByText(/第 1 题/)).toBeDefined();

      // Advance to question 2 and select an option; parent re-passing updated answers prop must NOT reset back to question 1
      fireEvent.click(screen.getByText(/下一题/));
      expect(screen.getByText(/第 2 题/)).toBeDefined();

      fireEvent.click(screen.getByText('B'));
      expect(onAnswerChange).toHaveBeenCalledWith(2, 'B');

      rerender(
        <ExamRoomModal
          isOpen={true}
          onClose={vi.fn()}
          paper={samplePaper}
          answers={{ 2: 'B' }}
          onAnswerChange={onAnswerChange}
          onSubmitExam={onSubmitExam}
        />
      );

      expect(screen.getByText(/第 2 题/)).toBeDefined();
      expect(onSubmitExam).not.toHaveBeenCalled();
    });
  });

  describe('KnowledgeTest submission safety (no circular SyntheticEvent JSON crash)', () => {
    const mockPaper = {
      title: '高一数学全真模拟示范卷',
      grade: '10_up',
      duration: 120,
      totalScore: 100,
      questions: [
        { id: 1, type: 'choice', question: '集合 $A=\\{1,2\\}$ 的子集个数为？', options: ['A. 2', 'B. 3', 'C. 4', 'D. 8'], score: 100, answer: 'C' }
      ]
    };

    it('submits test paper cleanly without passing click SyntheticEvent into JSON.stringify', async () => {
      const mockAuthFetch = vi.fn(async (url, opts) => {
        if (url.includes('/api/test-paper/generate')) {
          return { ok: true, json: async () => ({ paper: mockPaper }) };
        }
        if (url.includes('/api/test-paper/grade')) {
          const parsedBody = JSON.parse(opts.body);
          expect(parsedBody.answers).toEqual({ 1: 'C' });
          return {
            ok: true,
            json: async () => ({
              score: 100,
              totalScore: 100,
              summary: '满分通过！',
              results: [{ id: 1, score: 100, maxScore: 100, isCorrect: true, comment: '正确' }]
            })
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(
        <AppProvider>
          <KnowledgeTest
            onClose={vi.fn()}
            currentProfileId="default"
            currentGrade="10_up"
            selectedSubject="数学"
            currentEdition="人教版"
            authFetch={mockAuthFetch}
          />
        </AppProvider>
      );

      fireEvent.click(screen.getByText(/生成新高考模拟卷并开考/i));

      await waitFor(() => {
        expect(screen.getByText(/高一数学全真模拟示范卷/)).toBeDefined();
      });

      fireEvent.click(screen.getByText(/C\. 4/));
      fireEvent.click(screen.getByText(/提交测试卷/));

      await waitFor(() => {
        expect(screen.getByText(/打印成绩报告/)).toBeDefined();
      });
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test-paper/grade'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
