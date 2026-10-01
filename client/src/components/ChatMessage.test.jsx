import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import ChatMessage from './ChatMessage';
import { AppProvider } from '../store/useStore';

// Mock audio helpers
vi.mock('../utils/tts', () => ({
  playTeacherTts: vi.fn(),
  stopTeacherTts: vi.fn(),
}));

vi.mock('../utils/audio', () => ({
  playClickSound: vi.fn(),
  playSuccessChime: vi.fn(),
}));

describe('ChatMessage Component', () => {
  it('renders user messages without errors', () => {
    const msg = {
      id: 'msg-user-1',
      role: 'user',
      text: '老师，这道题怎么做？',
    };
    const { getByText } = render(
      <AppProvider>
        <ChatMessage msg={msg} />
      </AppProvider>
    );
    expect(getByText(/老师，这道题怎么做？/)).toBeDefined();
  });

  it('renders AI messages with thinking content and anti-peek without crashing', () => {
    const msg = {
      id: 'msg-ai-1',
      role: 'ai',
      text: `<think>
这是名师备课思考
</think>
首先我们来审题。
### 💡 【步骤拆解·核心考点】
根据三角形内角和为180度。
### 📐 【完整推导与标准答案】
因此角A = 60度。
### 🔄 【举一反三·变式题】
如果角B是45度，求角C。`,
    };
    const { getByText } = render(
      <AppProvider>
        <ChatMessage msg={msg} />
      </AppProvider>
    );
    expect(getByText(/名师深度备考推导过程/)).toBeDefined();
    expect(getByText(/完整推导与标准答案/)).toBeDefined();
  });
});
