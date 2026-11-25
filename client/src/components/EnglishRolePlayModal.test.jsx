import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EnglishRolePlayModal from './EnglishRolePlayModal';

describe('EnglishRolePlayModal Component', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        isFallback: false,
        data: {
          score: 62,
          feedback: '检出主谓一致与过去时态错误，请修正后重试。',
          grammarIssues: [
            '主谓一致错误：I wants 应改为 I want / I wanted',
            '时态冲突：句中含 yesterday 需用过去时'
          ],
          correctedText: 'Yesterday I wanted a book about AI ethics.',
          reply: 'That sounds like a fascinating topic! Which aspect of AI ethics interests you most?',
          replyCn: '听起来很有意思！你对 AI 伦理的哪方面最感兴趣？'
        }
      })
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('adapts title and scenarios dynamically for high school and middle school grades', () => {
    const { unmount } = render(
      <EnglishRolePlayModal
        isOpen={true}
        onClose={vi.fn()}
        currentGrade="11_up"
      />
    );
    expect(screen.getByText(/新高考英语思辨情景对练与精准语法诊断/)).toBeDefined();
    unmount();

    render(
      <EnglishRolePlayModal
        isOpen={true}
        onClose={vi.fn()}
        currentGrade="8_up"
      />
    );
    expect(screen.getByText(/中考英语听说情景对练与语法精准诊断/)).toBeDefined();
  });

  it('submits user sentence to real backend roleplay API and surfaces grammar errors honestly', async () => {
    const onApplyToChat = vi.fn();
    const onClose = vi.fn();

    render(
      <EnglishRolePlayModal
        isOpen={true}
        onClose={onClose}
        currentGrade="12_up"
        onApplyToChat={onApplyToChat}
      />
    );

    const input = screen.getByPlaceholderText(/输入你的英文回答/);
    fireEvent.change(input, { target: { value: 'I wants book of AI ethics yesterday' } });

    const submitBtn = screen.getByText(/AI 应答 & 语法诊断/);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/62/)).toBeDefined();
      expect(screen.getByText(/主谓一致错误/)).toBeDefined();
    });

    const chatBtn = screen.getByText(/带入课堂请教名师/);
    fireEvent.click(chatBtn);
    expect(onApplyToChat).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
