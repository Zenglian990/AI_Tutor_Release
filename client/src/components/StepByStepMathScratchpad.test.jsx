import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepByStepMathScratchpad from './StepByStepMathScratchpad';
import { verifyStepTransition } from '../utils/stepVerifier';

describe('StepByStepMathScratchpad and stepVerifier', () => {
  it('correctly verifies equivalent algebraic steps using Schwartz-Zippel testing', () => {
    // 2x + 4 = 10 -> 2x = 10 - 4
    const res1 = verifyStepTransition('2x + 4 = 10', '2x = 10 - 4');
    expect(res1.valid).toBe(true);
    expect(res1.status).toBe('valid');

    // 2x = 6 -> x = 3
    const res2 = verifyStepTransition('2x = 6', 'x = 3');
    expect(res2.valid).toBe(true);
  });

  it('detects common transposition sign error: 2x + 4 = 10 -> 2x = 10 + 4', () => {
    const res = verifyStepTransition('2x + 4 = 10', '2x = 10 + 4');
    expect(res.valid).toBe(false);
    expect(res.status).toBe('invalid');
    expect(res.message).toContain('移项');
  });

  it('gracefully handles unsupported inequalities and trigonometric functions without hanging in typing', () => {
    const resIneq = verifyStepTransition('2x + 1 > 5', '2x > 4');
    expect(resIneq.valid).toBe(false);
    expect(resIneq.status).toBe('unsupported');
    expect(resIneq.message).toContain('暂不支持此类符号自动验算');

    const resTrig = verifyStepTransition('sin(x) = 1', 'x = 90');
    expect(resTrig.valid).toBe(false);
    expect(resTrig.status).toBe('unsupported');
    expect(resTrig.message).toContain('暂不支持此类符号自动验算');
  });

  it('renders StepByStepMathScratchpad modal with initial equation and allows adding steps', () => {
    const onClose = vi.fn();
    const onApplyToChat = vi.fn();

    render(
      <StepByStepMathScratchpad
        isOpen={true}
        initialEquation="3x - 6 = 12"
        onClose={onClose}
        onApplyToChat={onApplyToChat}
      />
    );

    expect(screen.getByText(/分步实时代数演算纸/i)).toBeDefined();
    expect(screen.getByDisplayValue(/3x - 6 = 12/i)).toBeDefined();

    // Click "添加下一步推导"
    const addBtn = screen.getByText(/添加下一步推导/i);
    fireEvent.click(addBtn);

    // Click "带入课堂向名师请教批改"
    const applyBtn = screen.getByText(/带入课堂向名师请教批改/i);
    fireEvent.click(applyBtn);

    expect(onApplyToChat).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
