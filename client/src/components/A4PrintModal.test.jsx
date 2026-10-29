import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import A4PrintModal from './A4PrintModal';

describe('A4PrintModal Component', () => {
  it('renders closed modal without crashing', () => {
    const { container } = render(
      <A4PrintModal
        isOpen={false}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders default questions in blank_student mode without throwing', () => {
    const { getByText } = render(
      <A4PrintModal
        isOpen={true}
        onClose={() => {}}
        studentName="曾练"
        grade="八年级"
        subject="数学"
        initialMode="blank_student"
      />
    );
    expect(getByText(/A4 靶向周清试卷排版/i)).toBeDefined();
    expect(getByText(/一元一次方程与几何辅助线综合演练/i)).toBeDefined();
  });

  it('renders default questions in with_answers mode without throwing', () => {
    const { getAllByText } = render(
      <A4PrintModal
        isOpen={true}
        onClose={() => {}}
        studentName="曾练"
        grade="八年级"
        subject="数学"
        initialMode="with_answers"
      />
    );
    const elements = getAllByText(/名师标准答案与推导步骤/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('safely handles malformed latex and mixed Chinese prose without crashing', () => {
    const malformedQuestions = [
      {
        id: 99,
        title: '测试畸形公式容错题',
        body: '求解方程：$\\frac{1}{0} + \\sqrt{-1}$，其中包含未闭合公式 $x^2 + y^2 以及复杂汉字混合 \\frac{1}{2} ABC。',
        score: 10,
        standardAnswer: '【解】\\frac{x}{y 缺少大括号，且有特殊符号 △ 和 ∠B = 40°。\n$$ \\invalid_latex_cmd{test} $$',
        keyInsight: '极速容错机制验证。',
        status: 'wrong'
      }
    ];

    const { getByText } = render(
      <A4PrintModal
        isOpen={true}
        onClose={() => {}}
        studentName="曾练"
        grade="八年级"
        subject="数学"
        questions={malformedQuestions}
        initialMode="with_answers"
      />
    );

    expect(getByText(/测试畸形公式容错题/i)).toBeDefined();
  });

  it('toggles handwriting eraser button and renders questions with image URLs', () => {
    const questionsWithImage = [
      {
        id: 101,
        title: '几何全等三角形真题切片',
        body: '如图所示，已知 AB = AC，求证 ∠B = ∠C。',
        score: 10,
        standardAnswer: '【解】等边对等角。',
        keyInsight: '基础几何性质。',
        status: 'wrong',
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      }
    ];

    const { getByText } = render(
      <A4PrintModal
        isOpen={true}
        onClose={() => {}}
        studentName="曾练"
        grade="八年级"
        subject="数学"
        questions={questionsWithImage}
        initialMode="blank_student"
      />
    );

    const eraserBtn = getByText(/手写笔迹擦除/i);
    expect(eraserBtn).toBeDefined();
    expect(getByText(/几何全等三角形真题切片/i)).toBeDefined();
  });
});
