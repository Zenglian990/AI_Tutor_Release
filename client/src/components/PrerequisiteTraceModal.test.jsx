import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import PrerequisiteTraceModal from './PrerequisiteTraceModal';

describe('PrerequisiteTraceModal Component', () => {
  const mockChain = [
    {
      id: 'cnm_229',
      name: '二次函数的概念',
      grade: 9,
      gradeLabel: '初中3年级(9年级)上学期',
      chapter: '九年级上册 第22章 二次函数',
      domain: '函数',
      description: '理解二次函数的概念，形如 y = ax² + bx + c (a≠0)。',
      mastery_criteria: ['能识别二次函数表达式', '知道自变量取值范围'],
      diagnostic_question: {
        question: '若函数 y = (m-1)x^2 + 2x 是关于 x 的二次函数，求 m 的取值范围？',
        answer: 'm ≠ 1',
        analysis: '二次项系数不为0'
      },
      isTarget: true,
      isRoot: false
    },
    {
      id: 'cnm_201',
      name: '一次函数的概念',
      grade: 8,
      gradeLabel: '初中2年级(8年级)下学期',
      chapter: '八年级下册 第19章 一次函数',
      domain: '函数',
      description: '理解一次函数的概念，形如 y = kx + b (k≠0)。',
      reason: '学习二次函数需要先掌握一次函数。',
      mastery_criteria: ['掌握一次函数图像与性质'],
      diagnostic_question: {
        question: '在函数 y = 3x - 5 中，自变量 x 的一次项系数是多少？',
        answer: '3',
        analysis: '系数为3'
      },
      isTarget: false,
      isRoot: false
    },
    {
      id: 'cnm_p213',
      name: '正比例',
      grade: 6,
      gradeLabel: '小学6年级下学期',
      chapter: '六年级下册 第4单元 比例',
      domain: '数与代数',
      description: '两种相关联的量，比值一定。',
      reason: '函数思想起源于正反比例。',
      mastery_criteria: ['能判断正比例'],
      diagnostic_question: {
        question: '如果 y/x = 5 (x≠0)，那么 y 和 x 成什么比例？',
        answer: '成正比例',
        analysis: '比值恒定'
      },
      isTarget: false,
      isRoot: true
    }
  ];

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/knowledge-graph/trace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            target_topic: mockChain[0],
            chain: mockChain
          })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      });
    });
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <PrerequisiteTraceModal
        isOpen={false}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal header, search input and hot topic chips when open', () => {
    const { getByText, getByPlaceholderText } = render(
      <PrerequisiteTraceModal
        isOpen={true}
        onClose={() => {}}
        initialTopic="二次函数的概念"
        initialSubject="数学"
      />
    );

    expect(getByText(/跨年级考点星图与先修断层溯源/i)).toBeDefined();
    expect(getByPlaceholderText(/输入任意考点名称/i)).toBeDefined();
    expect(getByText(/二次函数 \(G9/i)).toBeDefined();
    expect(getByText(/勾股定理 \(G8/i)).toBeDefined();
  });

  it('renders ancestral ladder nodes with Target, Prerequisite, and Root badges', async () => {
    const { getByText, getAllByText, findByText } = render(
      <PrerequisiteTraceModal
        isOpen={true}
        onClose={() => {}}
        initialTopic="二次函数的概念"
      />
    );

    const targetBadge = await findByText(/当前目标考点/i);
    expect(targetBadge).toBeDefined();

    expect(getByText(/先修阶梯/i)).toBeDefined();
    expect(getByText(/底层源头基石/i)).toBeDefined();
    expect(getAllByText(/基石自测探针/i).length).toBeGreaterThan(0);
  });

  it('toggles diagnostic question answer when clicking the toggle button', async () => {
    const { getAllByText, queryByText, findByText, getByText } = render(
      <PrerequisiteTraceModal
        isOpen={true}
        onClose={() => {}}
        initialTopic="二次函数的概念"
      />
    );

    await findByText(/当前目标考点/i);

    // Initial state: standard answer is hidden
    expect(queryByText(/标准答案：m ≠ 1/i)).toBeNull();

    // Click toggle button for the target node
    const toggleBtns = getAllByText(/查看标准答案与解析/i);
    expect(toggleBtns.length).toBeGreaterThan(0);
    fireEvent.click(toggleBtns[0]);

    // Answer should now be visible
    expect(getAllByText(/隐藏标准答案/i).length).toBeGreaterThan(0);
    expect(getByText(/m ≠ 1/i)).toBeDefined();
  });

  it('triggers onAskTutor with pedagogical prompt and closes modal', async () => {
    const onAskTutorMock = vi.fn();
    const onCloseMock = vi.fn();

    const { getAllByText, findByText } = render(
      <PrerequisiteTraceModal
        isOpen={true}
        onClose={onCloseMock}
        initialTopic="二次函数的概念"
        onAskTutor={onAskTutorMock}
      />
    );

    await findByText(/当前目标考点/i);

    const askBtns = getAllByText(/呼叫AI私教针对此基石专项启发/i);
    expect(askBtns.length).toBeGreaterThan(0);
    fireEvent.click(askBtns[0]);

    expect(onAskTutorMock).toHaveBeenCalledTimes(1);
    expect(onAskTutorMock.mock.calls[0][0]).toContain('苏格拉底');
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('renders subject filter tabs and allows switching subjects', async () => {
    const { getByText } = render(
      <PrerequisiteTraceModal
        isOpen={true}
        onClose={() => {}}
        initialTopic="二次函数的概念"
      />
    );

    expect(getByText('全部学科')).toBeDefined();
    expect(getByText('物理')).toBeDefined();
    expect(getByText('化学')).toBeDefined();
    expect(getByText('英语')).toBeDefined();

    // Click 物理 tab
    fireEvent.click(getByText('物理'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('displays error message when trace fetch fails', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: '未找到相关考点'
        })
      });
    });

    const { findByText } = render(
      <PrerequisiteTraceModal
        isOpen={true}
        onClose={() => {}}
        initialTopic="不存在的冷门考点"
      />
    );

    const errorBanner = await findByText(/未找到相关考点/i);
    expect(errorBanner).toBeDefined();
  });
});
