const { fetchWithKeyRotation, buildChatURL } = require('./embedding');
const logger = require('./logger');

/**
 * Basic translation of LaTeX math formulas to spoken Chinese
 */
function translateMathToChinese(formula) {
  let f = String(formula).trim();

  // Basic LaTeX commands translation
  f = f.replace(/\\frac\s*\{\s*([^{}]+)\s*\}\s*\{\s*([^{}]+)\s*\}/g, '$2分之$1'); // \frac{a}{b} -> b分之a
  f = f.replace(/\\sqrt\s*\{\s*([^{}]+)\s*\}/g, '根号下$1'); // \sqrt{a} -> 根号下a
  f = f.replace(/([a-zA-Z0-9]+)\^\{\s*([^{}]+)\s*\}/g, '$1的$2次方'); // x^{2} -> x的2次方
  f = f.replace(/([a-zA-Z0-9]+)\^([a-zA-Z0-9]+)/g, '$1的$2次方'); // x^2 -> x的2次方

  // Standard math symbols to Chinese words
  const symbolMap = {
    '\\pm': '正负',
    '\\alpha': '阿尔法',
    '\\beta': '贝塔',
    '\\gamma': '伽马',
    '\\delta': '德尔塔',
    '\\Delta': '德尔塔',
    '\\theta': '西塔',
    '\\pi': '派',
    '\\lambda': '兰姆达',
    '\\omega': '欧米伽',
    '\\infty': '无穷大',
    '\\neq': '不等于',
    '\\approx': '约等于',
    '\\le': '小于等于',
    '\\ge': '大于等于',
    '\\leq': '小于等于',
    '\\geq': '大于等于',
    '\\times': '乘以',
    '\\div': '除以',
    '\\cdot': '乘以',
    '\\dots': '等等',
    '\\quad': ' ',
    '\\qquad': ' ',
    '\\left': '',
    '\\right': '',
    '\\{': '',
    '\\}': '',
    '\\_': '_',
    '\\%': '百分之',
    '+': '加',
    '-': '减',
    '*': '乘',
    '/': '除以',
    '=': '等于',
    '<': '小于',
    '>': '大于',
    // Semantic math functions — translate before the blanket \\[a-zA-Z]+ sweep
    '\\sin': '正弦',
    '\\cos': '余弦',
    '\\tan': '正切',
    '\\cot': '余切',
    '\\sec': '正割',
    '\\csc': '余割',
    '\\log': '对数',
    '\\ln': '自然对数',
    '\\lim': '极限',
    '\\sum': '求和',
    '\\prod': '连乘',
    '\\int': '积分',
    '\\oint': '环路积分',
  };

  for (const [sym, word] of Object.entries(symbolMap)) {
    f = f.split(sym).join(' ' + word + ' ');
  }

  // Remove residual LaTeX commands (those not in symbolMap above)
  f = f.replace(/\\[a-zA-Z]+/g, ' ');
  f = f.replace(/[{}]/g, ' ');

  // Standardize spaces
  return f.replace(/\s+/g, ' ').trim();
}

function removeCodeBlocks(text) {
  if (!text || !text.includes('```')) return text;
  const parts = text.split('```');
  let result = '';
  // If parts length is even, it means ``` count is odd (unclosed last block)
  const isUnclosed = (parts.length % 2 === 0);
  const limit = isUnclosed ? parts.length - 1 : parts.length;
  
  for (let i = 0; i < limit; i += 2) {
    result += parts[i];
  }
  
  // If there is an unclosed block, keep the final part as plain text instead of discarding it
  if (isUnclosed) {
    result += parts[parts.length - 1];
  }
  return result;
}

/**
 * Strips markdown and translates LaTeX to natural spoken Chinese for TTS
 */
function cleanTextForTTS(text) {
  if (!text) return '';
  let cleaned = String(text);

  // 1 & 2. Remove all code blocks (Mermaid and others) via safe split utility (removes ReDoS risk)
  cleaned = removeCodeBlocks(cleaned);

  // 3. Remove illustrations like [插图：xxx] or [插图]
  cleaned = cleaned.replace(/\[插图[：:][^\]]*\]/g, '');
  cleaned = cleaned.replace(/\[插图\]/g, '');

  // 4. Handle LaTeX formulas translation to natural speech
  // Replace block formulas \[ ... \]
  cleaned = cleaned.replace(/\\\[[\s\S]*?\\\]/g, (match) => {
    const formula = match.slice(2, -2);
    return ' ' + translateMathToChinese(formula) + ' ';
  });

  // Replace inline formulas \( ... \)
  cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (match) => {
    const formula = match.slice(2, -2);
    return ' ' + translateMathToChinese(formula) + ' ';
  });

  // Replace residual $ or $$
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    return ' ' + translateMathToChinese(formula) + ' ';
  });
  cleaned = cleaned.replace(/\$([^$]+)\$/g, (match, formula) => {
    return ' ' + translateMathToChinese(formula) + ' ';
  });

  // 5. Clean up markdown text markers
  cleaned = cleaned.replace(/#{1,6}\s+/g, '');            // Headers
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');    // Bold
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');        // Italic
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');        // Bold __
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');          // Italic _
  cleaned = cleaned.replace(/-\s+/g, '');                 // List bullets
  cleaned = cleaned.replace(/^\d+\.\s+/gm, '');           // Numbered lists
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Links

  // 6. Remove standard Emojis
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');

  // 7. Flatten multiple spaces and newlines
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 8. Cap text length for TTS (avoid very long synthesis jobs)
  return cleaned.slice(0, 1500);
}

/**
 * Map Edge TTS voice names to Gemini TTS voice names.
 * Gemini TTS supports Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede etc.
 * For Chinese education context we pick warm, clear voices.
 */
function mapVoiceToGemini(edgeVoice) {
  // zh-CN-XiaoxiaoNeural = young female → Kore (warm, bright)
  // zh-CN-YunxiNeural    = young male   → Puck (upbeat, clear)
  if (edgeVoice && edgeVoice.includes('Yunxi')) return 'Puck';
  return 'Kore'; // default: female tutor voice
}

/**
 * Synthesize text to MP3 audio using Gemini TTS API.
 * Replaces the broken Edge TTS WebSocket approach (401 due to Sec-MS-GEC requirement).
 *
 * @param {string} rawText
 * @param {string} voice  - Edge-style voice name (mapped internally to Gemini voice)
 * @returns {Promise<Buffer>}
 */
async function synthesizeSpeech(rawText, voice = 'zh-CN-XiaoxiaoNeural') {
  const text = cleanTextForTTS(rawText);
  if (!text) {
    logger.info('[TTS] Text is empty after cleaning, returning empty buffer');
    return Buffer.alloc(0);
  }

  const geminiVoice = mapVoiceToGemini(voice);

  // Gemini TTS endpoint (uses the same base URL as chat but with tts model)
  const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
  const buildTtsURL = () =>
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`;

  try {
    const response = await fetchWithKeyRotation(buildTtsURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: geminiVoice }
            }
          }
        }
      })
    }, 3, 30000);

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    // Extract base64-encoded audio from response
    const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error('No audio data in Gemini TTS response');
    }

    const audioBuffer = Buffer.from(audioData, 'base64');
    logger.info(`[TTS] Gemini TTS synthesized ${audioBuffer.length} bytes (voice: ${geminiVoice})`);
    return audioBuffer;

  } catch (err) {
    logger.error('[TTS] Gemini TTS synthesis failed:', err.message);
    throw err;
  }
}

module.exports = { synthesizeSpeech, cleanTextForTTS, translateMathToChinese };
