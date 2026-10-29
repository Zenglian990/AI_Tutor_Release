import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EssayUpgraderModal from './EssayUpgraderModal';

describe('EssayUpgraderModal Component', () => {
  it('renders modal with title and content input and allows loading sample essay', () => {
    render(
      <EssayUpgraderModal
        isOpen={true}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/中高考作文五维精批与逐句升格台/)).toBeDefined();
    const sampleBtn = screen.getByText(/载入中考满分作文范例/);
    fireEvent.click(sampleBtn);

    expect(screen.getByDisplayValue(/阳光总在风雨后/)).toBeDefined();
  });

  it('evaluates essay and displays five-dimension report and sentence upgrades', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          total_score: 46,
          max_score: 50,
          grade_level_label: '一类文 (立意高远)',
          char_count: 520,
          para_count: 4,
          dimensions: {
            depth: { score: 9, label: '立意深度', comment: '立意深刻' },
            structure: { score: 9, label: '结构脉络', comment: '起承转合自然' },
            rhetoric: { score: 9, label: '词句文采', comment: '文采斐然' },
            emotion: { score: 9, label: '情感真实', comment: '真情流露' },
            standards: { score: 10, label: '书写规范', comment: '格式规范' }
          },
          highlights: ['选材生动'],
          suggestions: ['增加环境烘托'],
          sentence_upgrades: [
            {
              original: '雨下得很大。',
              upgraded: '暴雨如注，狠狠敲打在窗棂上。',
              technique: '环境白描',
              reason: '强化视觉动感'
            }
          ]
        }
      })
    });

    const onApplyToChat = vi.fn();
    const onClose = vi.fn();

    render(
      <EssayUpgraderModal
        isOpen={true}
        onClose={onClose}
        onApplyToChat={onApplyToChat}
      />
    );

    // Load sample
    fireEvent.click(screen.getByText(/载入中考满分作文范例/));

    // Click submit
    const submitBtn = screen.getByText(/提交特级名师精批与逐句升格/);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/46 \/ 50 分/)).toBeDefined();
      expect(screen.getByText(/暴雨如注，狠狠敲打在窗棂上。/)).toBeDefined();
    });

    // Click "带入课堂请教名师"
    const chatBtn = screen.getByText(/带入课堂请教名师/);
    fireEvent.click(chatBtn);

    expect(onApplyToChat).toHaveBeenCalledWith(expect.stringContaining('作文精批台'));
    expect(onClose).toHaveBeenCalled();
  });
});
