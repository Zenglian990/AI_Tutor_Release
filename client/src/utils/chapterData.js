import CHAPTERS_DATA from '../data/chapters.json';

const SUBJECT_ALIASES = {
  '思想政治': '道德与法治',
  '政治': '道德与法治',
  '生物学': '生物',
  '道法': '道德与法治'
};

/**
 * Returns local built-in curriculum chapters for a given grade, subject and edition.
 * Guaranteed to return full chapter roadmaps for Grades 1-12 offline without cloud delay.
 */
export function getLocalChapters(grade, subject, edition) {
  if (!grade) return [];
  const normalizedSubject = SUBJECT_ALIASES[subject] || subject || '数学';
  
  // Try edition-specific textbook first
  const key = edition ? `${grade}_${edition}` : grade;
  const gradeChapters = CHAPTERS_DATA[key] || CHAPTERS_DATA[grade] || {};
  
  const list = gradeChapters[normalizedSubject] || gradeChapters[subject] || [];
  return list;
}

export { CHAPTERS_DATA };
