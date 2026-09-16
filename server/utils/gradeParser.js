/**
 * gradeParser.js
 * Source textbook grade extraction and matching utilities
 */

const CHINESE_NUMS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const GRADE_ALIASES = { '7': ['初一'], '8': ['初二'], '9': ['初三'] };

function extractGradeFromSource(source) {
  if (!source) return null;

  // 1. Clean up parenthesized text and explicit "起点" patterns to prevent matching words like "三年级起点" as the actual textbook grade
  let cleanSource = source.replace(/三年级起点/g, '').replace(/一年级起点/g, '');
  cleanSource = cleanSource.replace(/[\(（][^）\)]*起点[^）\)]*[\)）]/g, '');
  cleanSource = cleanSource.replace(/[\(（][^）\)]*[\)）]/g, ''); // strip other nested descriptions

  // 2. Prioritize Junior High Grade check first to avoid overlap with Grade 1 (e.g. 初中一年级 contains 一年级)
  if (cleanSource.includes('七年级') || cleanSource.includes('初一') || cleanSource.includes('初七') || cleanSource.includes('初中一年级')) return 7;
  if (cleanSource.includes('八年级') || cleanSource.includes('初二') || cleanSource.includes('初八') || cleanSource.includes('初中二年级')) return 8;
  if (cleanSource.includes('九年级') || cleanSource.includes('初三') || cleanSource.includes('初九') || cleanSource.includes('初中三年级')) return 9;

  // 3. Match general Chinese numerals Grade (1 to 6)
  const cnMatch = cleanSource.match(/([一二三四五六七八九])年级/);
  if (cnMatch) {
    const idx = CHINESE_NUMS.indexOf(cnMatch[1]);
    if (idx !== -1) return idx;
  }

  const juniorMatch = cleanSource.match(/初([一二三])/);
  if (juniorMatch) return 6 + CHINESE_NUMS.indexOf(juniorMatch[1]);

  // 4. Match general Arabic numerals Grade (Grade_5, 5年级 etc.)
  const numMatch = cleanSource.match(/[Gg]rade[_\s]?(\d+)|(\d+)年级/);
  if (numMatch) return parseInt(numMatch[1] || numMatch[2], 10);

  return null;
}

function matchesGrade(source, grade) {
  if (!source || !grade) return true;

  let gradeNum;
  let volume = null; // 'up' | 'down' | null

  if (String(grade).includes('_')) {
    const parts = String(grade).split('_');
    gradeNum = parseInt(parts[0], 10);
    volume = parts[1]; // 'up' or 'down'
  } else {
    gradeNum = parseInt(grade, 10);
  }

  const extractedNum = extractGradeFromSource(source);
  if (extractedNum !== null) {
    if (extractedNum !== gradeNum) return false;

    const isFullVolume = /(全一册|全册)/.test(source);

    if (volume === 'up') {
      return isFullVolume || /(上册|上(?!.))/.test(source) || (!/(下册|下(?!.))/.test(source) && !isFullVolume);
    } else if (volume === 'down') {
      return isFullVolume || /(下册|下(?!.))/.test(source);
    }
    return true;
  }

  // Fallback using alias keywords
  const rawGrade = String(grade).split('_')[0];
  const aliases = GRADE_ALIASES[rawGrade] || [];
  const aliasMatch = aliases.some(kw => source.includes(kw));
  if (!aliasMatch) return false;

  const isFullVolume = source.includes('全一册') || source.includes('全') || source.includes('全册');
  if (volume === 'up') {
    return isFullVolume || source.includes('上册') || source.includes('上') || (!source.includes('下') && !source.includes('下册'));
  } else if (volume === 'down') {
    return isFullVolume || source.includes('下册') || source.includes('下');
  }
  return true;
}

module.exports = {
  extractGradeFromSource,
  matchesGrade
};
