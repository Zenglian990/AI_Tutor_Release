import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import FormulaHandbookModal from './FormulaHandbookModal';

describe('FormulaHandbookModal Component', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <FormulaHandbookModal
        isOpen={false}
        onClose={() => {}}
        onInsertFormula={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with default Math formulas when open', () => {
    const { getByText, getAllByText } = render(
      <FormulaHandbookModal
        isOpen={true}
        onClose={() => {}}
        onInsertFormula={() => {}}
      />
    );
    expect(getByText(/中考数理化必备公式与定理速查/i)).toBeDefined();
    expect(getAllByText(/平方差公式/i).length).toBeGreaterThan(0);
    expect(getAllByText(/勾股定理/i).length).toBeGreaterThan(0);
  });

  it('switches tabs to Physics and Chemistry', () => {
    const { getByText, getAllByText } = render(
      <FormulaHandbookModal
        isOpen={true}
        onClose={() => {}}
        onInsertFormula={() => {}}
      />
    );

    // Switch to Physics
    fireEvent.click(getByText(/初中物理/i));
    expect(getAllByText(/欧姆定律/i).length).toBeGreaterThan(0);

    // Switch to Chemistry
    fireEvent.click(getByText(/初中化学/i));
    expect(getAllByText(/金属活动性顺序/i).length).toBeGreaterThan(0);
  });

  it('filters formulas using search keyword', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <FormulaHandbookModal
        isOpen={true}
        onClose={() => {}}
        onInsertFormula={() => {}}
      />
    );

    const searchInput = getByPlaceholderText(/搜索公式或定理/i);
    fireEvent.change(searchInput, { target: { value: '扇形' } });

    expect(getByText(/扇形面积公式/i)).toBeDefined();
    expect(queryByText(/平方差公式/i)).toBeNull();
  });

  it('triggers onInsertFormula when clicking insert button', () => {
    const onInsertMock = vi.fn();
    const { getAllByText } = render(
      <FormulaHandbookModal
        isOpen={true}
        onClose={() => {}}
        onInsertFormula={onInsertMock}
      />
    );

    const insertBtns = getAllByText(/插入提问/i);
    expect(insertBtns.length).toBeGreaterThan(0);
    fireEvent.click(insertBtns[0]);
    expect(onInsertMock).toHaveBeenCalled();
  });
});
