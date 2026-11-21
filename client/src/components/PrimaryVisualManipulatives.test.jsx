import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PrimaryVisualManipulatives from './PrimaryVisualManipulatives';

describe('PrimaryVisualManipulatives Component', () => {
  it('renders blocks tab by default and updates count', () => {
    render(<PrimaryVisualManipulatives isOpen={true} onClose={() => {}} onApplyToChat={() => {}} />);

    expect(screen.getByText('小学趣味实物启蒙教具')).toBeDefined();
    expect(screen.getByText('实物积木与计数器')).toBeDefined();
    expect(screen.getByText(/当前组成数量/)).toBeDefined();
  });

  it('switches to balance tab and equation intuition', () => {
    render(<PrimaryVisualManipulatives isOpen={true} onClose={() => {}} onApplyToChat={() => {}} />);

    const balanceBtn = screen.getByText('等式方程天平');
    fireEvent.click(balanceBtn);

    expect(screen.getByText(/等式模型/)).toBeDefined();
    expect(screen.getByText(/左盘砝码/)).toBeDefined();
    expect(screen.getByText(/右盘砝码/)).toBeDefined();
  });

  it('switches to partition tab and calculates division and remainder correctly', () => {
    render(<PrimaryVisualManipulatives isOpen={true} onClose={() => {}} onApplyToChat={() => {}} />);

    const partitionBtn = screen.getByText('分苹果平均分与乘除阵列');
    fireEvent.click(partitionBtn);

    // Default 12 apples / 3 plates = 4
    expect(screen.getByText(/12 ÷ 3 =/)).toBeDefined();
    expect(screen.getByText(/乘法算理对应/)).toBeDefined();
    expect(screen.getAllByText(/盘子 #/).length).toBe(3);

    // Increase total apples by 1 => 13 apples / 3 plates = 4 remainder 1
    const plusAppleBtn = screen.getAllByText('+1')[0];
    fireEvent.click(plusAppleBtn);

    expect(screen.getByText(/13 ÷ 3 =/)).toBeDefined();
    expect(screen.getByText(/余数：1/)).toBeDefined();
    expect(screen.getByText(/篮子里不够均分的苹果/)).toBeDefined();
  });

  it('triggers speech narration when voice button is clicked', () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    window.speechSynthesis = {
      speak: speakMock,
      cancel: cancelMock
    };
    globalThis.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };

    render(<PrimaryVisualManipulatives isOpen={true} onClose={() => {}} onApplyToChat={() => {}} />);

    const voiceBtn = screen.getByText(/名师伴读引导/);
    fireEvent.click(voiceBtn);

    expect(speakMock).toHaveBeenCalled();
  });
});
