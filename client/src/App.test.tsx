import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import App from './App';

describe('App Component', () => {
  test('renders header and initial welcome message', async () => {
    render(<App />);
    
    // Check that the title is rendered
    expect(screen.getByText(/曾练专属私教/)).toBeDefined();

    // Check that the welcome message is rendered asynchronously
    const welcomeMsg = await screen.findByText(/您好！我是您的专属私教/);
    expect(welcomeMsg).toBeDefined();
  });
});
