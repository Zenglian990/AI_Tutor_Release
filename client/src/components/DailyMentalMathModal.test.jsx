import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import DailyMentalMathModal from './DailyMentalMathModal';

describe('DailyMentalMathModal Component', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <DailyMentalMathModal
        isOpen={false}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with grade tag and numeric keypad when open', () => {
    const { getByText, getAllByText } = render(
      <DailyMentalMathModal
        isOpen={true}
        onClose={() => {}}
        currentGrade={2}
      />
    );
    expect(getByText(/60秒趣味口算天天练/i)).toBeDefined();
    expect(getAllByText(/2年级/i).length).toBeGreaterThan(0);
    // Check keypad presence (0 through 9)
    for (let i = 0; i <= 9; i++) {
      expect(getAllByText(String(i)).length).toBeGreaterThan(0);
    }
  });

  it('allows clicking keypad buttons to enter numbers and backspace', () => {
    const { getByText, getAllByText } = render(
      <DailyMentalMathModal
        isOpen={true}
        onClose={() => {}}
        currentGrade={3}
      />
    );

    // Click keypad button '7'
    const btn7 = getAllByText('7')[0];
    fireEvent.click(btn7);

    // Click keypad button '5'
    const btn5 = getAllByText('5')[0];
    fireEvent.click(btn5);

    expect(getByText('75')).toBeDefined();

    // Click backspace
    const backBtn = getByText(/退格/i);
    fireEvent.click(backBtn);
    expect(getAllByText('7').length).toBeGreaterThan(1);
  });

  it('allows changing grade from the dropdown', () => {
    const { getByText, getByDisplayValue } = render(
      <DailyMentalMathModal
        isOpen={true}
        onClose={() => {}}
        currentGrade={1}
      />
    );

    const select = getByDisplayValue(/1年级/i);
    fireEvent.change(select, { target: { value: '7' } });

    expect(getByText(/初中7-9年级/i)).toBeDefined();
  });
});
