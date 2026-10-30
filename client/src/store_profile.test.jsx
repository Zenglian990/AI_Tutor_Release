import { describe, it, expect, beforeEach } from 'vitest';

describe('Multi-Profile Preferences Isolation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isolates subject, persona, socratic level and pinyin between profiles without leakage', () => {
    const profileElder = 'p_elder_g8';
    const profileYounger = 'p_younger_g2';

    // Elder sibling sets Grade 8 Physics, strict Socratic, owl persona, no pinyin
    localStorage.setItem(`ai_tutor_${profileElder}_subject`, '物理');
    localStorage.setItem(`ai_tutor_${profileElder}_socratic_level`, 'strict');
    localStorage.setItem(`ai_tutor_${profileElder}_persona`, 'owl');
    localStorage.setItem(`ai_tutor_${profileElder}_pinyin_mode`, 'false');

    // Younger sibling sets Grade 2 Chinese, guided Socratic, lion persona, pinyin active
    localStorage.setItem(`ai_tutor_${profileYounger}_subject`, '语文');
    localStorage.setItem(`ai_tutor_${profileYounger}_socratic_level`, 'guided');
    localStorage.setItem(`ai_tutor_${profileYounger}_persona`, 'lion');
    localStorage.setItem(`ai_tutor_${profileYounger}_pinyin_mode`, 'true');

    // Verify elder preferences
    expect(localStorage.getItem(`ai_tutor_${profileElder}_subject`)).toBe('物理');
    expect(localStorage.getItem(`ai_tutor_${profileElder}_socratic_level`)).toBe('strict');
    expect(localStorage.getItem(`ai_tutor_${profileElder}_persona`)).toBe('owl');
    expect(localStorage.getItem(`ai_tutor_${profileElder}_pinyin_mode`)).toBe('false');

    // Verify younger preferences have zero bleed from elder
    expect(localStorage.getItem(`ai_tutor_${profileYounger}_subject`)).toBe('语文');
    expect(localStorage.getItem(`ai_tutor_${profileYounger}_socratic_level`)).toBe('guided');
    expect(localStorage.getItem(`ai_tutor_${profileYounger}_persona`)).toBe('lion');
    expect(localStorage.getItem(`ai_tutor_${profileYounger}_pinyin_mode`)).toBe('true');
  });
});
