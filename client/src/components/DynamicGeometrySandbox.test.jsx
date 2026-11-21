import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DynamicGeometrySandbox from './DynamicGeometrySandbox';

describe('DynamicGeometrySandbox Component', () => {
  it('renders tabs and switches to auxiliary line reasoning tab', () => {
    render(<DynamicGeometrySandbox isOpen={true} onClose={() => {}} onApplyToChat={() => {}} />);

    // Tab buttons exist
    const auxTabBtn = screen.getByText('辅助线因果动因逆推台');
    expect(auxTabBtn).toBeDefined();

    // Click to switch
    fireEvent.click(auxTabBtn);

    // Verify 4 model buttons are displayed
    expect(screen.getByText('倍长中线模型')).toBeDefined();
    expect(screen.getByText('角平分线垂线/对称模型')).toBeDefined();
    expect(screen.getByText('截长补短模型')).toBeDefined();
    expect(screen.getByText('弦图与一线三等角模型')).toBeDefined();

    // Verify causal rationale is rendered
    expect(screen.getByText(/特级名师因果动因逆推/)).toBeDefined();

    // Toggle auxiliary line visibility
    const toggleBtn = screen.getByText(/辅助线：已显示/);
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/辅助线：已隐藏/)).toBeDefined();
  });
});
