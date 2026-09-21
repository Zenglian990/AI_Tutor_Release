const crypto = require('crypto');
const { fetchWithKeyRotation, buildChatURL } = require('./embedding');
const { ProxyAgent, fetch: undiciFetch } = require('undici');
const { proxyUrl } = require('../config');
const logger = require('./logger');

const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;
const ttsCache = new Map();
const MAX_CACHE_SIZE = 300;

function splitIntoPunctuationChunks(text, maxLen = 120) {
  const sentences = text.match(/[^。！？；\n\r]+[。！？；\n\r]?/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length <= maxLen) {
      current += s;
    } else {
      if (current) chunks.push(current.trim());
      if (s.length > maxLen) {
        for (let i = 0; i < s.length; i += maxLen) {
          chunks.push(s.slice(i, i + maxLen).trim());
        }
        current = '';
      } else {
        current = s;
      }
    }
  }
  if (current && current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

async function synthesizeViaGoogle(text) {
  const chunks = splitIntoPunctuationChunks(text, 120);
  if (chunks.length === 0) return Buffer.alloc(0);

  const fetchChunk = async (chunk) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=zh-CN&client=tw-ob`;
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    if (proxyAgent) opts.dispatcher = proxyAgent;
    const res = await undiciFetch(url, opts);
    if (!res.ok) throw new Error(`Google TTS failed with status ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  };

  const buffers = await Promise.all(chunks.map(fetchChunk));
  return Buffer.concat(buffers);
}

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
 * Convert raw PCM (e.g. 24000Hz 16-bit mono) into a valid playable RIFF WAV buffer
 */
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const wavBuffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + dataSize, 4);
  wavBuffer.write('WAVE', 8);

  // fmt subchunk
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16); // subchunk size (16 for PCM)
  wavBuffer.writeUInt16LE(1, 20);  // format: 1 (PCM)
  wavBuffer.writeUInt16LE(numChannels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(dataSize, 40);

  // Payload
  pcmBuffer.copy(wavBuffer, 44);
  return wavBuffer;
}

/**
 * Synthesize text to WAV audio using Gemini TTS API.
 * Uses gemini-2.5-flash-preview-tts with fallback to gemini-3.1-flash-tts-preview.
 * Converts raw PCM response to standard playable WAV with 44-byte RIFF header.
 *
 * @param {string} rawText
 * @param {string} voice  - Edge-style voice name (mapped internally to Gemini voice)
 * @returns {Promise<Buffer>}
 */
async function synthesizeSpeech(rawText, voice = 'zh-CN-XiaoxiaoNeural', clientGeminiKey = null) {
  const text = cleanTextForTTS(rawText);
  if (!text) {
    logger.info('[TTS] Text is empty after cleaning, returning empty buffer');
    const emptyBuf = Buffer.alloc(0);
    emptyBuf.contentType = 'audio/mp3';
    return emptyBuf;
  }

  const cacheKey = crypto.createHash('md5').update(`${voice}:${text}`).digest('hex');
  if (ttsCache.has(cacheKey)) {
    logger.info(`[TTS] Cache hit for: "${text.substring(0, 25)}..."`);
    return ttsCache.get(cacheKey);
  }

  // Tier 1: Instant Neural TTS (Google Speech, ~1s, MP3)
  try {
    const mp3Buffer = await synthesizeViaGoogle(text);
    if (mp3Buffer && mp3Buffer.length > 0) {
      mp3Buffer.contentType = 'audio/mp3';
      if (ttsCache.size >= MAX_CACHE_SIZE) {
        const firstKey = ttsCache.keys().next().value;
        ttsCache.delete(firstKey);
      }
      ttsCache.set(cacheKey, mp3Buffer);
      logger.info(`[TTS] Neural TTS synthesized ${mp3Buffer.length} bytes MP3 for: "${text.substring(0, 30)}..."`);
      return mp3Buffer;
    }
  } catch (err) {
    logger.warn(`[TTS] Neural TTS failed (${err.message}), falling back to Gemini TTS...`);
  }

  // Tier 2: Gemini Audio TTS (Fallback)
  const geminiVoice = mapVoiceToGemini(voice);

  const TTS_CANDIDATE_MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
  const buildTtsURL = (modelName) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const requestHeaders = { 'Content-Type': 'application/json' };
  if (clientGeminiKey && typeof clientGeminiKey === 'string' && clientGeminiKey.trim()) {
    requestHeaders['x-gemini-api-key'] = clientGeminiKey.trim();
  }

  let lastError = null;
  for (const modelName of TTS_CANDIDATE_MODELS) {
    try {
      const response = await fetchWithKeyRotation(buildTtsURL, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Please read the following text aloud verbatim: ' + text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: geminiVoice }
              }
            }
          }
        })
      }, 2, 25000, modelName, true);

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      // Extract base64-encoded audio from response
      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const audioData = inlineData?.data;
      if (!audioData) {
        throw new Error('No audio data in Gemini TTS response');
      }

      let sampleRate = 24000;
      if (inlineData?.mimeType && inlineData.mimeType.includes('rate=')) {
        const match = inlineData.mimeType.match(/rate=(\d+)/);
        if (match && match[1]) sampleRate = parseInt(match[1], 10);
      }

      const pcmBuffer = Buffer.from(audioData, 'base64');
      const wavBuffer = pcmToWav(pcmBuffer, sampleRate, 1, 16);
      wavBuffer.contentType = 'audio/wav';
      if (ttsCache.size >= MAX_CACHE_SIZE) {
        const firstKey = ttsCache.keys().next().value;
        ttsCache.delete(firstKey);
      }
      ttsCache.set(cacheKey, wavBuffer);
      logger.info(`[TTS] Gemini TTS synthesized ${wavBuffer.length} bytes (model: ${modelName}, voice: ${geminiVoice}, rate: ${sampleRate})`);
      return wavBuffer;

    } catch (err) {
      lastError = err;
      logger.warn(`[TTS] Model ${modelName} synthesis failed: ${err.message}, trying next model...`);
    }
  }

  logger.error('[TTS] All TTS models failed:', lastError?.message);
  throw lastError || new Error('TTS synthesis failed for all models');
}

module.exports = { synthesizeSpeech, cleanTextForTTS, translateMathToChinese, pcmToWav };

