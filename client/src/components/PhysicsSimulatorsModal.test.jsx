import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PhysicsSimulatorsModal from './PhysicsSimulatorsModal';

describe('PhysicsSimulatorsModal Component', () => {
  it('renders optics simulation by default and displays correct image characterization for u > 2f', () => {
    const onClose = vi.fn();
    const onApplyToChat = vi.fn();

    render(
      <PhysicsSimulatorsModal
        isOpen={true}
        onClose={onClose}
        onApplyToChat={onApplyToChat}
      />
    );

    expect(screen.getByText(/初中物理动态虚拟微实验台/)).toBeDefined();
    expect(screen.getByText(/成像性质：倒立、缩小、实像/)).toBeDefined();
    expect(screen.getByText(/照相机、手机摄像头/)).toBeDefined();

    // Click "带入课堂请教名师"
    const chatBtn = screen.getByText(/带入课堂请教名师/);
    fireEvent.click(chatBtn);

    expect(onApplyToChat).toHaveBeenCalledWith(expect.stringContaining('凸透镜成像'));
    expect(onClose).toHaveBeenCalled();
  });

  it('switches to circuits tab and updates current and voltage', () => {
    render(
      <PhysicsSimulatorsModal
        isOpen={true}
        onClose={() => {}}
        onApplyToChat={() => {}}
      />
    );

    // Switch to Circuits Tab
    const circuitTab = screen.getByText(/欧姆定律与滑动变阻器/);
    fireEvent.click(circuitTab);

    expect(screen.getByText(/电路状态：I = 0.24 A \(正常通电\)/)).toBeDefined();
    expect(screen.getByText(/变阻器 Rp = 15 Ω/)).toBeDefined();

    // Toggle switch off
    const switchEl = screen.getByText(/开关: 闭合/);
    fireEvent.click(switchEl);

    expect(screen.getByText(/回路断开 \(I = 0\)/)).toBeDefined();
  });
});
