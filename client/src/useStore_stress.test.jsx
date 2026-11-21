import React, { useRef, useEffect } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AppProvider, useAppStore } from './store/useStore';

describe('useStore selectedGrade & Reactivity Stress Test', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('provides a non-empty string for selectedGrade upon initial mount', async () => {
    let capturedGrade = null;

    function TestConsumer() {
      const { selectedGrade } = useAppStore();
      capturedGrade = selectedGrade;
      return <div data-testid="grade-display">{selectedGrade}</div>;
    }

    await act(async () => {
      render(
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      );
    });

    expect(typeof capturedGrade).toBe('string');
    expect(capturedGrade.length).toBeGreaterThan(0);
    expect(capturedGrade).toBe('7_up');
    expect(screen.getByTestId('grade-display').textContent).toBe('7_up');
  });

  it('updates selectedGrade synchronously when handleGradeChange is invoked', async () => {
    let storeHandle;

    function TestConsumer() {
      const store = useAppStore();
      storeHandle = store;
      return <div data-testid="grade-val">{store.selectedGrade}</div>;
    }

    await act(async () => {
      render(
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      );
    });

    expect(screen.getByTestId('grade-val').textContent).toBe('7_up');

    // Switch to Grade 3
    await act(async () => {
      storeHandle.handleGradeChange('3');
    });
    expect(screen.getByTestId('grade-val').textContent).toBe('3');
    expect(storeHandle.selectedGrade).toBe('3');

    // Switch to Grade 9
    await act(async () => {
      storeHandle.handleGradeChange('9');
    });
    expect(screen.getByTestId('grade-val').textContent).toBe('9');
    expect(storeHandle.selectedGrade).toBe('9');

    // Switch to High School Grade 11
    await act(async () => {
      storeHandle.handleGradeChange('11_up');
    });
    expect(screen.getByTestId('grade-val').textContent).toBe('11_up');
    expect(storeHandle.selectedGrade).toBe('11_up');
  });

  it('updates selectedGrade synchronously when switching profiles via handleProfileChange', async () => {
    let storeHandle;

    function TestConsumer() {
      const store = useAppStore();
      storeHandle = store;
      return (
        <div>
          <span data-testid="profile-id">{store.currentProfileId}</span>
          <span data-testid="selected-grade">{store.selectedGrade}</span>
        </div>
      );
    }

    await act(async () => {
      render(
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      );
    });

    expect(screen.getByTestId('selected-grade').textContent).toBe('7_up');

    // Add younger sibling profile (Grade 2)
    let newProfile;
    await act(async () => {
      newProfile = storeHandle.handleAddProfile('童童', '2', '人教版');
    });

    expect(newProfile).toBeDefined();
    expect(screen.getByTestId('selected-grade').textContent).toBe('2');
    expect(storeHandle.selectedGrade).toBe('2');

    // Add high school profile (Grade 12)
    let hsProfile;
    await act(async () => {
      hsProfile = storeHandle.handleAddProfile('子轩', '12_up', '人教版');
    });
    expect(screen.getByTestId('selected-grade').textContent).toBe('12_up');
    expect(storeHandle.selectedGrade).toBe('12_up');

    // Switch back to initial default profile
    await act(async () => {
      storeHandle.handleProfileChange('default');
    });
    expect(screen.getByTestId('selected-grade').textContent).toBe('7_up');
    expect(storeHandle.selectedGrade).toBe('7_up');
  });

  it('does NOT trigger infinite re-renders during high-frequency profile and grade mutations', async () => {
    let renderCount = 0;
    let storeHandle;

    function RenderStressConsumer() {
      renderCount++;
      const store = useAppStore();
      storeHandle = store;
      return <div data-testid="stress-render-count">{renderCount}</div>;
    }

    await act(async () => {
      render(
        <AppProvider>
          <RenderStressConsumer />
        </AppProvider>
      );
    });

    const initialRenderCount = renderCount;
    expect(initialRenderCount).toBeLessThan(10); // Normal mount cycles

    // Execute 30 rapid grade updates in sequence
    const testGrades = ['1', '2', '3', '4', '5', '6', '7_up', '8', '9', '10_up', '11_up', '12_up'];
    for (let i = 0; i < 30; i++) {
      const targetGrade = testGrades[i % testGrades.length];
      await act(async () => {
        storeHandle.handleGradeChange(targetGrade);
      });
      expect(storeHandle.selectedGrade).toBe(targetGrade);
    }

    // After 30 updates, renderCount should have grown predictably (~1-2 per update), not unbounded
    expect(renderCount).toBeLessThan(150);

    const postUpdateRenderCount = renderCount;

    // Wait a brief delay to ensure idle stabilization — no runaway renders in background
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Render count must stay completely static once operations settle
    expect(renderCount).toBe(postUpdateRenderCount);
  });

  it('safely falls back to "7_up" when profiles in localStorage are corrupted, empty, or missing grade', async () => {
    // 1. Empty profiles array
    localStorage.setItem('ai_tutor_profiles', JSON.stringify([]));
    localStorage.setItem('ai_tutor_active_profile', 'missing_id');

    let store1;
    function Consumer1() {
      store1 = useAppStore();
      return <div>{store1.selectedGrade}</div>;
    }

    const { unmount } = render(
      <AppProvider>
        <Consumer1 />
      </AppProvider>
    );

    expect(typeof store1.selectedGrade).toBe('string');
    expect(store1.selectedGrade).toBe('7_up');
    unmount();

    // 2. Profile object with null or missing grade
    localStorage.setItem('ai_tutor_profiles', JSON.stringify([{ id: 'no_grade_profile', name: '测试' }]));
    localStorage.setItem('ai_tutor_active_profile', 'no_grade_profile');

    let store2;
    function Consumer2() {
      store2 = useAppStore();
      return <div>{store2.selectedGrade}</div>;
    }

    render(
      <AppProvider>
        <Consumer2 />
      </AppProvider>
    );

    expect(typeof store2.selectedGrade).toBe('string');
    expect(store2.selectedGrade).toBe('7_up');
  });
});
