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

  it('does not wrap Chinese prose containing raw math tokens in display math $$', () => {
    const input = '所以 S_{△PAC} = \\frac{1}{2} S_{△ABC} 等价于 AP = \\frac{1}{2} AB。';
    const output = preprocessLatex(input);
    expect(output).not.toContain('$$');
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

import { matchKnowledgeNode, generateOfflineSocraticResponse } from './utils/offlineSocraticEngine';

describe('Offline Socratic Engine (Pure Client-Side)', () => {
  it('correctly maps math & physics keywords to knowledge nodes', () => {
    const node1 = matchKnowledgeNode('动点P以每秒2cm的速度在三角形AB边上运动');
    expect(node1.name).toContain('几何动点');

    const node2 = matchKnowledgeNode('二次函数抛物线的顶点坐标与对称轴');
    expect(node2.name).toContain('二次函数');

    const node3 = matchKnowledgeNode('已知直角三角形两条直角边求斜边');
    expect(node3.name).toContain('勾股定理');

    const node4 = matchKnowledgeNode('木块浸入水中受到的浮力与排开液体的体积');
    expect(node4.name).toContain('物理力学');
  });

  it('generates 4 distinct stages in the offline Socratic response', () => {
    const res = generateOfflineSocraticResponse({
      query: '动点P在矩形ABCD的边上运动，求面积S关于时间t的函数解析式',
      grade: '8',
      subject: '数学',
      persona: 'owl',
      studentName: '曾练'
    });

    expect(res).toContain('第 1 阶：审题显微镜与条件拆解');
    expect(res).toContain('第 2 阶：核心知识点与定理检索');
    expect(res).toContain('第 3 阶：微步破题启发引导');
    expect(res).toContain('第 4 阶：自检防错与思维反思');
    expect(res).toContain('智多星导师');
  });

  it('adapts persona tone for lion (primary) and sister (encouragement)', () => {
    const lionRes = generateOfflineSocraticResponse({
      query: '笼子里有鸡和兔子，一共有10个头，28只脚',
      grade: '3',
      persona: 'lion',
      studentName: '小明'
    });
    expect(lionRes).toContain('聪聪小狮子');
    expect(lionRes).toContain('吼吼！');

    const sisterRes = generateOfflineSocraticResponse({
      query: '若一元二次方程有两实根，求判别式与韦达定理',
      grade: '9',
      persona: 'sister',
      studentName: '小华'
    });
    expect(sisterRes).toContain('晓晴学姐悄悄话');
    expect(sisterRes).toContain('做完记得把草稿留存');
  });
});

