class TrieNode {
  constructor() {
    this.children = {};
    this.isEnd = false;
    this.category = null;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word, category = 'default') {
    if (!word) return;
    let node = this.root;
    for (const char of word) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }
    node.isEnd = true;
    node.category = category;
  }

  search(text) {
    if (!text) return null;
    let longestMatch = null;
    for (let i = 0; i < text.length; i++) {
      let node = this.root;
      let j = i;
      let matchedWord = '';
      while (j < text.length && node.children[text[j]]) {
        matchedWord += text[j];
        node = node.children[text[j]];
        if (node.isEnd) {
          longestMatch = { word: matchedWord, category: node.category };
        }
        j++;
      }
      if (longestMatch) {
        return longestMatch;
      }
    }
    return null;
  }
}

// ============================================================
// Homoglyph / character variant normalization map
// Maps visually similar characters and common bypass tricks
// to their canonical form for safety checking.
// ============================================================
const HOMOGLYPH_MAP = {
  // Latin/English lookalikes (Cyrillic lowercase)
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ѕ': 's',
  // Latin/English lookalikes (Cyrillic uppercase)
  'А': 'a', 'Е': 'e', 'О': 'o', 'Р': 'p', 'С': 'c', 'У': 'y', 'Х': 'x', 'І': 'i', 'Ѕ': 's',
  
  // Fullwidth letters
  'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h',
  'ｉ': 'i', 'ｊ': 'j', 'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p',
  'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't', 'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x',
  'ｙ': 'y', 'ｚ': 'z',
  
  // Chinese radicals to characters
  '亻': '人', '氵': '水', '扌': '手', '忄': '心',
  '纟': '丝', '讠': '言', '饣': '食', '钅': '金',

  // Fullwidth numbers
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',

  // Circled numbers
  '⓪': '0', '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '0',
  '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5', '❻': '6', '❼': '7', '❽': '8', '❾': '9', '❿': '0',

  // Superscript numbers
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',

  // Subscript numbers
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9'
};

// Characters to completely strip (zero-width, invisible Unicode)
// Strip zero-width/invisible Unicode chars using unicode escapes
// eslint-disable-next-line no-control-regex
const STRIP_CHARS = new RegExp('[\\u00AD\\u180E\\u200B-\\u200F\\u2028-\\u202F\\u2060-\\u2064\\uFEFF]', 'g');

// Chinese homophone / pinyin bypass patterns
const PINYIN_BYPASS_PATTERNS = [
  { pattern: /\bshab[ii]\b/i, category: 'profanity' },
  { pattern: /\btamade\b/i, category: 'profanity' },
  { pattern: /\bcaonima\b/i, category: 'profanity' },
  { pattern: /\bwocao\b/i, category: 'profanity' },
  { pattern: /\bsb\b/i, category: 'profanity' },
  { pattern: /\bf[u*]ck\b/i, category: 'profanity' },
  { pattern: /\bsh[i*1]t\b/i, category: 'profanity' },
  { pattern: /\bb[i*1]tch\b/i, category: 'profanity' },
  { pattern: /\ba[s$]{2}h[o0]le\b/i, category: 'profanity' },
  { pattern: /\bc[u*]nt\b/i, category: 'profanity' },
  { pattern: /\bd[i*1]ck\b/i, category: 'profanity' },
];

// ============================================================
// Expanded sensitive words list
// ============================================================
const SENSITIVE_WORDS = [
  // Profanity (Chinese)
  { word: '傻逼', category: 'profanity' }, { word: '他妈的', category: 'profanity' },
  { word: '妈的', category: 'profanity' }, { word: '贱人', category: 'profanity' },
  { word: '贱货', category: 'profanity' }, { word: '滚开', category: 'profanity' },
  { word: '滚蛋', category: 'profanity' }, { word: '王八蛋', category: 'profanity' },
  { word: '脑残', category: 'profanity' }, { word: '白痴', category: 'profanity' },
  { word: '智障', category: 'profanity' }, { word: '蠢货', category: 'profanity' },
  { word: '死胖子', category: 'profanity' }, { word: '笨蛋', category: 'profanity' },
  { word: '丑八怪', category: 'profanity' }, { word: '废物', category: 'profanity' },
  { word: '草泥马', category: 'profanity' }, { word: '我操', category: 'profanity' },
  { word: '卧槽', category: 'profanity' }, { word: '煞笔', category: 'profanity' },
  { word: '傻叉', category: 'profanity' }, { word: '尼玛', category: 'profanity' },
  { word: '操蛋', category: 'profanity' }, { word: '二逼', category: 'profanity' },
  { word: '逗比', category: 'profanity' }, { word: '装逼', category: 'profanity' },
  { word: '撕逼', category: 'profanity' }, { word: '傻吊', category: 'profanity' },
  // English profanity
  { word: 'fuck', category: 'profanity' }, { word: 'shit', category: 'profanity' },
  { word: 'damn', category: 'profanity' }, { word: 'bitch', category: 'profanity' },
  { word: 'asshole', category: 'profanity' }, { word: 'bastard', category: 'profanity' },
  { word: 'dick', category: 'profanity' }, { word: 'piss', category: 'profanity' },
  { word: 'cunt', category: 'profanity' }, { word: 'moron', category: 'profanity' },
  { word: 'idiot', category: 'profanity' }, { word: 'stupid', category: 'profanity' },
  { word: 'fuk', category: 'profanity' }, { word: 'fck', category: 'profanity' },
  { word: 'dumbass', category: 'profanity' }, { word: 'jackass', category: 'profanity' },
  // Violence / Self-harm
  { word: '杀人', category: 'violence' }, { word: '自杀', category: 'violence' },
  { word: '砍人', category: 'violence' }, { word: '打架', category: 'violence' },
  { word: '毒品', category: 'violence' }, { word: '吸毒', category: 'violence' },
  { word: '自残', category: 'violence' }, { word: '割腕', category: 'violence' },
  { word: '死人', category: 'violence' }, { word: '去死', category: 'violence' },
  { word: '炸弹', category: 'violence' }, { word: '爆炸', category: 'violence' },
  { word: '杀死', category: 'violence' }, { word: '掐死', category: 'violence' },
  { word: '勒死', category: 'violence' }, { word: '跳楼', category: 'violence' },
  { word: '上吊', category: 'violence' }, { word: '服毒', category: 'violence' },
  { word: '枪杀', category: 'violence' }, { word: '谋杀', category: 'violence' },
  // English violence
  { word: 'kill myself', category: 'violence' }, { word: 'killmyself', category: 'violence' },
  { word: 'kill you', category: 'violence' }, { word: 'killyou', category: 'violence' },
  { word: 'suicide', category: 'violence' }, { word: 'cut myself', category: 'violence' },
  { word: 'cutmyself', category: 'violence' }, { word: 'selfharm', category: 'violence' },
  // Sexual content
  { word: '裸体', category: 'sexual' }, { word: '裸照', category: 'sexual' },
  { word: '色情', category: 'sexual' }, { word: '黄色网站', category: 'sexual' },
  { word: '做爱', category: 'sexual' }, { word: '上床', category: 'sexual' },
  { word: '强奸', category: 'sexual' }, { word: '猥亵', category: 'sexual' },
  { word: '性交', category: 'sexual' }, { word: 'porn', category: 'sexual' },
  { word: 'naked', category: 'sexual' }, { word: 'nude', category: 'sexual' },
  { word: 'sex', category: 'sexual' }, { word: 'hentai', category: 'sexual' },
  // Weapons
  { word: '枪支', category: 'violence' }, { word: '手枪', category: 'violence' },
  { word: '刀具', category: 'violence' }, { word: '砍刀', category: 'violence' },
  { word: 'gun', category: 'violence' }, { word: 'knife', category: 'violence' },
  { word: 'weapon', category: 'violence' }, { word: 'bomb', category: 'violence' },
  // Substances
  { word: '喝酒', category: 'violence' }, { word: '抽烟', category: 'violence' },
  { word: '吸烟', category: 'violence' }, { word: '大麻', category: 'violence' },
  { word: '海洛因', category: 'violence' }, { word: 'drugs', category: 'violence' },
  { word: 'weed', category: 'violence' }, { word: 'alcohol', category: 'violence' },
  { word: '冰毒', category: 'violence' },
  // Personal info
  { word: '家庭住址', category: 'personal_info' }, { word: '身份证号', category: 'personal_info' },
  { word: '手机号码', category: 'personal_info' }, { word: '银行卡号', category: 'personal_info' },
  { word: '密码', category: 'personal_info' },
  // Gaming & attitude
  { word: '充值王者荣耀', category: 'game' }, { word: '买皮肤', category: 'game' },
  { word: '天天打游戏', category: 'game' }, { word: '玩吃鸡', category: 'game' },
  { word: '玩王者荣耀', category: 'game' }, { word: '和平精英', category: 'game' },
  { word: '王者荣耀', category: 'game' }, { word: '打游戏', category: 'game' },
  { word: '玩游戏', category: 'game' }, { word: '我想玩游戏', category: 'game' },
  { word: '不想写作业', category: 'attitude' }, { word: '不想上学', category: 'attitude' },
  { word: '不想读书', category: 'attitude' }, { word: '讨厌学习', category: 'attitude' },
  { word: '不想学习', category: 'attitude' }, { word: '吃鸡', category: 'game' },
  { word: '原神', category: 'game' }, { word: '蛋仔派对', category: 'game' },
  { word: '迷你世界', category: 'game' }, { word: '我的世界', category: 'game' },
  { word: '刷抖音', category: 'attitude' }, { word: '看视频', category: 'attitude' },
];

const REDIRECT_RESPONSES = {
  profanity: "亲爱的小主/少侠，AI 助教喜欢听到文明温暖的话语哦！让我们一起保持文明和专注，快来问我数学或语文等课本问题，积累我们的智慧能量吧！✨🤖",
  violence: "曾小友，生命和安全是最宝贵的财富，我们要保护好自己和身边的人哦！快来和 AI 助教一起打败难懂的学术怪兽，探索课本的奥秘吧！🛡️🦖",
  sexual: "小主/少侠，这不是适合讨论的内容哦。让我们把注意力集中在学习上，一起解决有趣的课本问题吧！📚✨",
  game: "小主/少侠，适度的游戏可以放松，但过度沉迷会悄悄偷走我们的时间哦！今天我们的学习能量槽还没充满呢，快来向我提一个课本问题，让我们先升一级吧！🎮表扬你主动提问！",
  attitude: "小主/少侠，感到疲惫或不想学习是很正常的，每个人都有想休息的时候。但学习是让我们变强大的超能力哦！今天让我们只解决一个好玩的小问题，好不好？加油！🌟💪",
  personal_info: "小主/少侠，千万不要在网上透露个人隐私信息哦！保护好自己的信息就是保护自己的安全。有什么学习问题尽管问我吧！🔒📖",
  default: "曾小主/少侠，这句魔法密语不属于我们的知识能量库哦！快来和 AI 助教一起击败难懂的课本难题，向我提个好玩的问题吧！🤖📚"
};

// Initialize and populate the Trie
const trieInstance = new Trie();
for (const entry of SENSITIVE_WORDS) {
  trieInstance.insert(entry.word, entry.category);
}

function normalizeForSafety(text) {
  let result = text.normalize('NFC');
  result = result.replace(STRIP_CHARS, '');
  result = result.split('').map(ch => HOMOGLYPH_MAP[ch] || ch).join('');
  result = result.replace(/[^一-鿿㐀-䶿a-zA-Z0-9]/g, '').toLowerCase();
  return result;
}

function normalizeKeepSpaces(text) {
  let result = text.normalize('NFC');
  result = result.replace(STRIP_CHARS, '');
  result = result.split('').map(ch => HOMOGLYPH_MAP[ch] || ch).join('');
  // Replace non-alphanumeric and non-Chinese characters with spaces
  result = result.replace(/[^一-鿿㐀-䶿a-zA-Z0-9\s]/g, ' ').toLowerCase();
  // Collapse consecutive whitespaces into a single space
  return result.replace(/\s+/g, ' ').trim();
}

function checkSafetyAndRedirect(query) {
  if (!query) return null;

  const cleanQuery = normalizeForSafety(query);
  const cleanQueryWithSpaces = normalizeKeepSpaces(query);

  // 1. Check Trie for exact substring matches (space-stripped)
  const match = trieInstance.search(cleanQuery);
  if (match) {
    console.log(`[Safety Filter] Blocked sensitive query (category: ${match.category}, word: ${match.word})`);
    return REDIRECT_RESPONSES[match.category] || REDIRECT_RESPONSES.default;
  }

  // 2. Check pinyin/leet-speak bypass patterns on BOTH space-preserved and space-stripped versions
  for (const { pattern, category } of PINYIN_BYPASS_PATTERNS) {
    if (pattern.test(cleanQueryWithSpaces) || pattern.test(cleanQuery)) {
      console.log(`[Safety Filter] Blocked pinyin/leet bypass (category: ${category}, matched pattern: ${pattern.source})`);
      return REDIRECT_RESPONSES[category] || REDIRECT_RESPONSES.default;
    }
  }

  return null;
}

module.exports = { Trie, checkSafetyAndRedirect };
