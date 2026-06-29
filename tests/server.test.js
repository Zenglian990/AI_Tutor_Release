const { test } = require('node:test');
const assert = require('node:assert/strict');

// Extract the pure functions from server.js for testing
const CHINESE_NUMS = ['零','一','二','三','四','五','六','七','八','九'];
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
    if (numMatch) return parseInt(numMatch[1] || numMatch[2]);

    return null;
}

function matchesGrade(source, grade) {
    if (!source || !grade) return true;
    
    // Parse grade number and check volume (up/down)
    let gradeNum;
    let volume = null; // 'up' | 'down' | null
    
    if (String(grade).includes('_')) {
        const parts = String(grade).split('_');
        gradeNum = parseInt(parts[0]);
        volume = parts[1]; // 'up' or 'down'
    } else {
        gradeNum = parseInt(grade);
    }
    
    const extractedNum = extractGradeFromSource(source);
    if (extractedNum !== null) {
        if (extractedNum !== gradeNum) return false;
        
        // Filter by upper, lower, or full-volume (全一册 / 全) if specified
        const isFullVolume = source.includes('全一册') || source.includes('全') || source.includes('全册');
        
        if (volume === 'up') {
            return isFullVolume || source.includes('上册') || source.includes('上') || (!source.includes('下') && !source.includes('下册'));
        } else if (volume === 'down') {
            return isFullVolume || source.includes('下册') || source.includes('下');
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

test('extractGradeFromSource — Chinese numerals', () => {
    assert.equal(extractGradeFromSource('三年级数学上册.pdf'), 3);
    assert.equal(extractGradeFromSource('七年级语文下册.pdf'), 7);
    assert.equal(extractGradeFromSource('九年级物理.pdf'), 9);
    assert.equal(extractGradeFromSource('PEP人教版英语三年级起点四年级下册.pdf'), 4);
    assert.equal(extractGradeFromSource('义务教育教科书·英语（三年级起点）四年级下册.pdf'), 4);
});


test('extractGradeFromSource — junior high aliases', () => {
    assert.equal(extractGradeFromSource('初一英语.pdf'), 7);
    assert.equal(extractGradeFromSource('初二历史.pdf'), 8);
    assert.equal(extractGradeFromSource('初三化学.pdf'), 9);
});

test('extractGradeFromSource — Arabic digits', () => {
    assert.equal(extractGradeFromSource('Grade7_math.pdf'), 7);
    assert.equal(extractGradeFromSource('5年级科学.pdf'), 5);
});

test('extractGradeFromSource — unknown returns null', () => {
    assert.equal(extractGradeFromSource('unknown_book.pdf'), null);
});

test('matchesGrade — correct match', () => {
    assert.ok(matchesGrade('七年级数学上册.pdf', '7'));
    assert.ok(matchesGrade('初一英语.pdf', '7'));
    assert.ok(matchesGrade('三年级语文.pdf', '3'));
});

test('matchesGrade — wrong grade returns false', () => {
    assert.ok(!matchesGrade('七年级数学上册.pdf', '8'));
    assert.ok(!matchesGrade('三年级语文.pdf', '4'));
});
