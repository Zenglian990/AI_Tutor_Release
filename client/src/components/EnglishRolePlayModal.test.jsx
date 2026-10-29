import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EnglishRolePlayModal from './EnglishRolePlayModal';

describe('EnglishRolePlayModal Component', () => {
  it('renders modal with initial library scenario and partner greeting', () => {
    const onClose = vi.fn();
    render(
      <EnglishRolePlayModal
        isOpen={true}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/中考英语听说情景对练与音标雷达/)).toBeDefined();
    expect(screen.getByText(/Welcome to the school library/)).toBeDefined();
    expect(screen.getByText(/Excuse me, I am looking for a book about world history\./)).toBeDefined();
  });

  it('evaluates student spoken input and displays word-by-word pronunciation accuracy', () => {
    const onApplyToChat = vi.fn();
    const onClose = vi.fn();

    render(
      <EnglishRolePlayModal
        isOpen={true}
        onClose={onClose}
        onApplyToChat={onApplyToChat}
      />
    );

    // Click "自动填入标准音" to simulate perfect pronunciation
    const autoFillBtn = screen.getByText(/自动填入标准音/);
    fireEvent.click(autoFillBtn);

    expect(screen.getByText(/发音总分：/)).toBeDefined();
    expect(screen.getByText(/发音极其地道！/)).toBeDefined();

    // Click "带入课堂请教名师"
    const chatBtn = screen.getByText(/带入课堂请教名师/);
    fireEvent.click(chatBtn);

    expect(onApplyToChat).toHaveBeenCalledWith(expect.stringContaining('英语情景口语台'));
    expect(onClose).toHaveBeenCalled();
  });
});
