import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import StreakModal from './StreakModal';

// Mock useAppStore
vi.mock('../store/useStore', () => ({
  useAppStore: () => ({
    currentProfile: { id: 'default', name: '曾练' },
    authFetch: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        streak: {
          currentStreak: 3,
          longestStreak: 5,
          isTodayCompleted: true,
          streakFreezeCount: 2,
          peerIntimacy: { level: 2, title: '课后学习搭子', currentXp: 150, progressPercent: 50, perk: '解锁画板联想' }
        }
      })
    })
  })
}));

describe('StreakModal Component', () => {
  it('renders closed modal without crashing', () => {
    const { container } = render(
      <StreakModal isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders streak modal with streak count and peer status when open', () => {
    const { getByText } = render(
      <StreakModal isOpen={true} onClose={() => {}} />
    );
    expect(getByText(/连续学习连胜榜/i)).toBeDefined();
    expect(getByText(/多邻国式行为自驱/i)).toBeDefined();
    expect(getByText(/连胜冰冻卡/i)).toBeDefined();
  });
});
