import { describe, it, expect } from 'vitest';
import { preprocessLatex } from './utils/math';
import { splitThinkingContent } from './utils/thinking';

describe('Frontend Utils: preprocessLatex', () => {
  it('converts display math delimiters \\[ ... \\] to $$ ... $$', () => {
    const input = 'Here is a formula: \\[ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\]';
    const output = preprocessLatex(input);
    expect(output).toContain('$$\n');
    expect(output).toContain('\n$$');
  });

  it('converts inline math delimiters \\( ... \\) to $ ... $', () => {
    const input = 'Let \\( a^2 + b^2 = c^2 \\) be the equation.';
    const output = preprocessLatex(input);
    expect(output).toBe('Let $ a^2 + b^2 = c^2 $ be the equation.');
  });

  it('preserves code blocks without corrupting them', () => {
    const input = '```python\nprint("\\( not math \\)")\n```';
    const output = preprocessLatex(input);
    expect(output).toBe(input);
  });
});

describe('Frontend Utils: splitThinkingContent', () => {
  it('separates <think> tags from main answer body', () => {
    const input = '<think>\nAnalyze triangle conditions.\n</think>\n\nAnswer: 180 degrees';
    const { thinking, body } = splitThinkingContent(input);
    expect(thinking).toBe('Analyze triangle conditions.');
    expect(body).toBe('Answer: 180 degrees');
  });

  it('handles empty or non-thinking content gracefully', () => {
    const input = 'Simple greeting!';
    const { thinking, body } = splitThinkingContent(input);
    expect(thinking).toBeNull();
    expect(body).toBe('Simple greeting!');
  });
});
