import { describe, it, expect } from 'vitest';
import { verifyStepTransition } from './stepVerifier';
import { sanitizeMermaid } from './mermaid_helper';

describe('Round7 Frontend Regressions', () => {
  it('supports high school derivative step verification f(x) -> f\'(x) -> stationary equation', () => {
    const step1 = verifyStepTransition('f(x) = x^3 - 3x', "f'(x) = 3x^2 - 3");
    expect(step1.valid).toBe(true);

    const step1Wrong = verifyStepTransition('f(x) = x^3 - 3x', "f'(x) = 3x^2 + 3");
    expect(step1Wrong.valid).toBe(false);

    const step2 = verifyStepTransition("f'(x) = 3x^2 - 3", '3x^2 - 3 = 0');
    expect(step2.valid).toBe(true);
  });

  it('supports middle school quadratic factorization and root branch extraction', () => {
    const s1 = verifyStepTransition('x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0');
    expect(s1.valid).toBe(true);

    const s2 = verifyStepTransition('(x - 2)(x - 3) = 0', 'x = 2');
    expect(s2.valid).toBe(true);

    const s2Both = verifyStepTransition('(x - 2)(x - 3) = 0', 'x = 2 或 x = 3');
    expect(s2Both.valid).toBe(true);

    const s2Wrong = verifyStepTransition('(x - 2)(x - 3) = 0', 'x = 5');
    expect(s2Wrong.valid).toBe(false);
  });

  it('sanitizes Mermaid labels containing closed intervals [-2, 2] and f(x) without premature truncation', () => {
    const raw = `graph TD\nA[求函数 f(x) = x^3 - 3x 在区间 [-2, 2] 的最值] --> B{令 f'(x) = 0}\nB -->|"驻点 x = ±1"| C[比较端点值]`;
    const cleaned = sanitizeMermaid(raw);
    expect(cleaned).toContain('A["求函数 f(x) = x^3 - 3x 在区间 ［-2, 2］ 的最值"]');
    expect(cleaned).toContain('B{"令 f\'(x) = 0"}');
    expect(cleaned).not.toContain('[-2, 2"] ');
  });
});
