import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import InteractiveMathCanvas from './InteractiveMathCanvas';

describe('InteractiveMathCanvas Component', () => {
  it('renders parabola canvas with vertex and formula', () => {
    const { getByText, getAllByText } = render(
      <InteractiveMathCanvas initialType="parabola" initialParams={{ a: 1, h: 2, k: -3 }} />
    );

    expect(getByText(/二次函数动态探究画板/)).toBeDefined();
    expect(getAllByText(/顶点/).length).toBeGreaterThan(0);
    expect(getByText(/解析式/)).toBeDefined();
  });

  it('switches mode between parabola and triangle smoothly', () => {
    const { getByText } = render(<InteractiveMathCanvas initialType="parabola" />);

    const triangleBtn = getByText('三角形');
    fireEvent.click(triangleBtn);

    expect(getByText(/几何三角形与勾股画板/)).toBeDefined();
    expect(getByText(/三边长/)).toBeDefined();
  });

  it('triggers onAskTutor callback with formatted mathematical inquiry', () => {
    const onAskTutor = vi.fn();
    const { getByText } = render(
      <InteractiveMathCanvas initialType="parabola" onAskTutor={onAskTutor} />
    );

    const askBtn = getByText(/带入此图像向私教提问/);
    fireEvent.click(askBtn);

    expect(onAskTutor).toHaveBeenCalled();
    const queryArg = onAskTutor.mock.calls[0][0];
    expect(queryArg).toContain('二次函数');
    expect(queryArg).toContain('对称轴');
  });
});
