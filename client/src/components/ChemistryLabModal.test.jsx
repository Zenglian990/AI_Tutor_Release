import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChemistryLabModal from './ChemistryLabModal';

describe('ChemistryLabModal Component', () => {
  it('renders gas preparation apparatus by default and switches gas types', () => {
    const onClose = vi.fn();
    const onApplyToChat = vi.fn();

    render(
      <ChemistryLabModal
        isOpen={true}
        onClose={onClose}
        onApplyToChat={onApplyToChat}
      />
    );

    expect(screen.getByText(/初中化学动态虚拟微实验台/)).toBeDefined();
    expect(screen.getByText(/高锰酸钾加热制氧/)).toBeDefined();

    // Switch to CO2 scheme
    const co2Btn = screen.getByText(/大理石制备二氧化碳/);
    fireEvent.click(co2Btn);

    expect(screen.getByText(/燃着木条放瓶口熄灭/)).toBeDefined();
  });

  it('switches to molecular simulation tab and navigates reaction steps', () => {
    const onApplyToChat = vi.fn();

    render(
      <ChemistryLabModal
        isOpen={true}
        onClose={() => {}}
        onApplyToChat={onApplyToChat}
      />
    );

    // Switch tab
    const molecularTab = screen.getByText(/微观分子重组与质量守恒/);
    fireEvent.click(molecularTab);

    expect(screen.getByText(/质量守恒定律微观本质剖析：/)).toBeDefined();
    expect(screen.getByText(/反应前：2个水分子 \(2H₂O\)/)).toBeDefined();

    // Click Step 3: Recombined products
    const step3Btn = screen.getByText(/3\. 反应后：原子重新组合/);
    fireEvent.click(step3Btn);

    expect(screen.getByText(/原子的种类没有改变/)).toBeDefined();

    // Click "带入课堂请教名师"
    const chatBtn = screen.getByText(/带入课堂请教名师/);
    fireEvent.click(chatBtn);

    expect(onApplyToChat).toHaveBeenCalledWith(expect.stringContaining('水电解的微观分子重组模型'));
  });
});
