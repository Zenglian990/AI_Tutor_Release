import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import ScratchpadModal from './ScratchpadModal';

// Mock useAppStore and authFetch
vi.mock('../store/useStore', () => ({
  useAppStore: () => ({
    currentProfile: { id: 'default', name: '曾练' }
  }),
  authFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({})
  })
}));

describe('ScratchpadModal Component', () => {
  it('renders closed modal without crashing', () => {
    const { container } = render(
      <ScratchpadModal isOpen={false} onClose={() => {}} onSendToTutor={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders scratchpad modal with tools and palm rejection button when open', () => {
    const { getByText } = render(
      <ScratchpadModal isOpen={true} onClose={() => {}} onSendToTutor={() => {}} />
    );
    expect(getByText(/沉浸式演练草稿纸与白板/i)).toBeDefined();
    expect(getByText(/铅笔/i)).toBeDefined();
    expect(getByText(/直尺/i)).toBeDefined();
    expect(getByText(/橡皮/i)).toBeDefined();
    const palmBtn = getByText(/防掌触/i);
    expect(palmBtn).toBeDefined();
  });

  it('toggles stylus palm rejection mode on click', () => {
    const { getByText } = render(
      <ScratchpadModal isOpen={true} onClose={() => {}} onSendToTutor={() => {}} />
    );
    const palmBtn = getByText(/防掌触/i);
    fireEvent.click(palmBtn);
    expect(getByText(/防掌触: 开/i)).toBeDefined();
  });
});
