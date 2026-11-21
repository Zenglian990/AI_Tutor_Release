import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ParentalGate from './ParentalGate';
import { encryptData } from '../utils/crypto_helper';

vi.mock('../store/useStore', () => ({
  authFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ has_pin: true, needs_setup: false, question_id: 'q1' })
  })
}));

describe('ParentalGate Component', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders closed modal without crashing', () => {
    const { container } = render(
      <ParentalGate isOpen={false} onVerify={() => {}} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders parental gate with numeric keypad when open', () => {
    const { getByText } = render(
      <ParentalGate isOpen={true} onVerify={() => {}} onClose={() => {}} reason="测试家长验证" />
    );
    expect(getByText(/家长安全锁/i)).toBeDefined();
    expect(getByText(/测试家长验证/i)).toBeDefined();
    expect(getByText('1')).toBeDefined();
    expect(getByText('8')).toBeDefined();
  });

  it('rejects master PIN 888888 and hides bypass button when custom PIN is already configured', async () => {
    const customHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    localStorage.setItem('parent_gate_pin_hash_v2', encryptData(customHash));

    const onVerifyMock = vi.fn();
    const { getByText, queryByText } = render(
      <ParentalGate isOpen={true} onVerify={onVerifyMock} onClose={() => {}} />
    );

    // Master bypass button must be completely hidden when custom PIN is set
    expect(queryByText(/曾先生直接进入/i)).toBeNull();

    // Press '8' six times (master PIN 888888)
    const btn8 = getByText('8');
    for (let i = 0; i < 6; i++) {
      fireEvent.click(btn8);
    }

    await waitFor(() => {
      // onVerify must NOT have been called
      expect(onVerifyMock).not.toHaveBeenCalled();
    });
  });
});
